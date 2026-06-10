'use strict';

module.exports = runAction;
module.exports.isValidAction = isValidAction;
module.exports.splitSelectorAndValue = splitSelectorAndValue;
module.exports.usesNativeSelectorEngine = usesNativeSelectorEngine;
module.exports.usesBareXPathEngine = usesBareXPathEngine;

// Puppeteer resolves these non-CSS selector syntaxes natively (`aria/Name`,
// `text/...`, `xpath/...`, `pierce/...`, and the `::-p-*` pseudo form, e.g.
// `::-p-aria(Save[role="button"])`). `document.querySelector` cannot parse any
// of them, so actions that resolve an element inside `page.evaluate` must route
// these through Puppeteer's selector engine (`page.$` / `page.waitForSelector`)
// instead. Plain CSS selectors keep the original in-page querySelector path.
const NATIVE_SELECTOR_PREFIXES = ['aria/', 'text/', 'xpath/', 'pierce/'];

/**
 * Whether a selector must be resolved by Puppeteer's selector engine rather
 * than `document.querySelector`.
 * @param {String} selector
 * @returns {Boolean}
 */
function usesNativeSelectorEngine(selector) {
	return (
		NATIVE_SELECTOR_PREFIXES.some(prefix => selector.startsWith(prefix)) ||
		selector.includes('::-p-')
	);
}

/**
 * Whether a selector is a bare, standards-based XPath (`//…` or `/…`). Unlike
 * the Puppeteer `xpath/` prefix above, a bare XPath is resolved with stock
 * `document.evaluate` rather than Puppeteer's selector engine — so it adds no
 * proprietary-engine dependency and resolves identically in any browser or
 * frame. A CSS selector never starts with `/`, so the leading slash is an
 * unambiguous marker.
 * @param {String} selector
 * @returns {Boolean}
 */
function usesBareXPathEngine(selector) {
	return /^\s*\//.test(selector);
}

/**
 * Resolve a bare XPath to a Puppeteer ElementHandle via `document.evaluate`
 * (no Puppeteer xpath engine), throwing the standard "no element" action error
 * when nothing matches. Caller owns disposal.
 * @param {Object} page - A Puppeteer page object.
 * @param {String} selector - A bare XPath selector.
 * @returns {Promise<Object>} The resolved ElementHandle.
 */
async function resolveXPathHandle(page, selector) {
	let handle = null;
	try {
		const jsHandle = await page.evaluateHandle(xpath => {
			const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
			return result.singleNodeValue;
		}, selector);
		handle = jsHandle.asElement();
		if (!handle) {
			await jsHandle.dispose();
		}
	} catch {
		handle = null;
	}
	if (!handle) {
		throw new Error(`Failed action: no element matching selector "${selector}"`);
	}
	return handle;
}

/**
 * Resolve a non-CSS selector to a Puppeteer ElementHandle: bare XPath via
 * `document.evaluate`, every other native syntax via Puppeteer's engine.
 * @param {Object} page - A Puppeteer page object.
 * @param {String} selector - A bare-XPath or Puppeteer-native selector.
 * @returns {Promise<Object>} The resolved ElementHandle.
 */
function resolveElementHandle(page, selector) {
	if (usesBareXPathEngine(selector)) {
		return resolveXPathHandle(page, selector);
	}
	return resolveNativeHandle(page, selector);
}

/**
 * Wait for a bare-XPath element to reach the given state, polling
 * `document.evaluate` in the page. Mirrors the CSS `document.querySelector`
 * path's visibility definition (`offsetWidth`/`offsetHeight`/`getClientRects`)
 * rather than Puppeteer's, since no Puppeteer selector engine is involved.
 * @param {Object} page - A Puppeteer page object.
 * @param {String} selector - A bare XPath selector.
 * @param {String} state - One of added|removed|visible|hidden.
 * @returns {Promise} Resolves once the state is reached; rejects on timeout.
 */
async function waitForXPathElementState(page, selector, state) {
	const timeout = (typeof page.getDefaultTimeout === 'function' && page.getDefaultTimeout()) || 30000;
	await page.waitForFunction((xpath, desiredState) => {
		const element = document.evaluate(
			xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
		).singleNodeValue;
		const isVisible = Boolean(
			element &&
			(element.offsetWidth || element.offsetHeight || element.getClientRects().length)
		);
		switch (desiredState) {
			case 'added':
				return Boolean(element);
			case 'removed':
				return !element;
			case 'visible':
				return isVisible;
			case 'hidden':
				return !isVisible;
			default:
				return false;
		}
	}, {polling: 200,
		timeout}, selector, state);
}

/**
 * Resolve a native (non-CSS) selector to a Puppeteer ElementHandle, throwing the
 * standard "no element" action error when nothing matches. Caller owns disposal.
 * @param {Object} page - A Puppeteer page object.
 * @param {String} selector - A native selector.
 * @returns {Promise<Object>} The resolved ElementHandle.
 */
async function resolveNativeHandle(page, selector) {
	let handle = null;
	try {
		handle = await page.$(selector);
	} catch {
		handle = null;
	}
	if (!handle) {
		throw new Error(`Failed action: no element matching selector "${selector}"`);
	}
	return handle;
}

/**
 * Wait for a native-selector element to reach the given state using Puppeteer's
 * selector engine. `added`/`removed` track DOM presence (kept distinct from
 * `hidden`); `visible`/`hidden` use Puppeteer's visibility definition.
 * @param {Object} page - A Puppeteer page object.
 * @param {String} selector - A native selector.
 * @param {String} state - One of added|removed|visible|hidden.
 * @returns {Promise} Resolves once the state is reached; rejects on timeout.
 */
async function waitForNativeElementState(page, selector, state) {
	if (state === 'visible') {
		await page.waitForSelector(selector, {visible: true});
		return;
	}
	if (state === 'hidden') {
		await page.waitForSelector(selector, {hidden: true});
		return;
	}
	if (state === 'added') {
		await page.waitForSelector(selector);
		return;
	}
	// `removed`: poll until the selector no longer resolves. Puppeteer's
	// `{hidden: true}` also fires for a still-attached-but-hidden element, so it
	// can't represent "removed" precisely — poll `page.$` for absence instead.
	const timeout = (typeof page.getDefaultTimeout === 'function' && page.getDefaultTimeout()) || 30000;
	const pollInterval = 200;
	const deadline = Date.now() + timeout;
	for (;;) {
		let handle = null;
		try {
			handle = await page.$(selector);
		} catch {
			handle = null;
		}
		if (!handle) {
			return;
		}
		await handle.dispose();
		if (Date.now() >= deadline) {
			throw new Error(`Failed action: timed out waiting for element "${selector}" to be removed`);
		}
		await new Promise(resolve => setTimeout(resolve, pollInterval));
	}
}

/**
 * Split `<selector> to <value>` at the ` to ` outside any brackets or quotes.
 * Regex splits mis-handle selectors whose attribute values contain ` to `.
 * @param {String} rest
 * @returns {?{selector: String, value: String}}
 */
function splitSelectorAndValue(rest) {
	let bracketDepth = 0;
	let quoteChar = null;
	let index = 0;
	while (index <= rest.length - 4) {
		const ch = rest[index];
		let step = 1;
		if (quoteChar !== null) {
			if (ch === '\\' && index + 1 < rest.length) {
				step = 2;
			} else if (ch === quoteChar) {
				quoteChar = null;
			}
		} else if (ch === '"' || ch === '\'') {
			quoteChar = ch;
		} else if (ch === '[' || ch === '(') {
			bracketDepth += 1;
		} else if (ch === ']' || ch === ')') {
			bracketDepth -= 1;
		} else if (bracketDepth === 0 && ch === ' ' && rest.slice(index, index + 4).toLowerCase() === ' to ') {
			const selector = rest.slice(0, index);
			const value = rest.slice(index + 4);
			if (selector.length === 0) {
				return null;
			}
			return {
				selector,
				value
			};
		}
		index += step;
	}
	return null;
}

/**
 * Run an action string as a function.
 * @private
 * @param {Object} browser - A Puppeteer browser object.
 * @param {Object} page - A Puppeteer page object.
 * @param {Object} options - Options to pass into the action.
 * @param {String} actionString - The action string to run.
 * @returns {Promise} Returns a promise which resolves with undefined.
 */
async function runAction(browser, page, options, actionString) {

	// Find the first action that matches the given action string
	const action = module.exports.actions.find(foundAction => {
		return foundAction.match.test(actionString);
	});

	// If no action can be found, error
	if (!action) {
		throw new Error(`Failed action: "${actionString}" cannot be resolved`);
	}

	// Run the action
	options.log.debug(`Running action: ${actionString}`);
	await action.run(browser, page, options, actionString.match(action.match));
	options.log.debug(`  ✔︎ Action complete: ${action.name}`);
}

/**
 * Check whether an action string is valid.
 * @public
 * @param {String} actionString - The action string to validate.
 * @returns {Boolean} Returns whether the action string is valid.
 */
function isValidAction(actionString) {
	return module.exports.actions.some(foundAction => {
		return foundAction.match.test(actionString);
	});
}

/**
 * Available actions.
 * @private
 */
module.exports.actions = [

	// Action to navigate to a url
	// E.g. "navigate to http://pa11y.org"
	{
		name: 'navigate-url',
		match: /^navigate to( url)? (.+)$/i,
		run: async (browser, page, options, matches) => {
			const navigateTo = matches[2];
			try {
				await page.goto(navigateTo);
			} catch {
				throw new Error(`Failed action: Could not navigate to "${navigateTo}"`);
			}
		}
	},

	// Action to click an element
	// E.g. "click .sign-in-button"
	{
		name: 'click-element',
		match: /^click( element)? (.+)$/i,
		run: async (browser, page, options, matches) => {
			const selector = matches[2];
			// `page.click` handles CSS and every Puppeteer-native syntax, but not a
			// bare XPath — resolve that to a handle via document.evaluate and click it.
			if (usesBareXPathEngine(selector)) {
				const handle = await resolveXPathHandle(page, selector);
				try {
					await handle.click();
				} catch {
					throw new Error(`Failed action: no element matching selector "${selector}"`);
				} finally {
					await handle.dispose();
				}
				return;
			}
			try {
				await page.click(selector);
			} catch {
				throw new Error(`Failed action: no element matching selector "${selector}"`);
			}
		}
	},

	// Action to set an input field value
	// E.g. "set field #username to example"
	{
		name: 'set-field-value',
		// Captures the whole post-prefix payload; the selector/value split is
		// deferred to splitSelectorAndValue to handle ` to ` inside selectors.
		match: /^set( field)? (.+)$/i,
		run: async (browser, page, options, matches) => {
			const split = splitSelectorAndValue(matches[2]);
			if (!split) {
				throw new Error(`Failed action: cannot parse "set field <selector> to <value>" from "${matches[0]}"`);
			}
			const {selector, value} = split;
			if (usesNativeSelectorEngine(selector) || usesBareXPathEngine(selector)) {
				const handle = await resolveElementHandle(page, selector);
				try {
					await handle.evaluate((target, desiredValue) => {
						if (target.tagName === 'SELECT') {
							const selectOptions = Array.from(target.options);
							let match = selectOptions.find(opt => opt.value === desiredValue);
							if (!match) {
								match = selectOptions.find(opt => (opt.textContent || '').trim() === desiredValue);
							}
							if (!match) {
								match = selectOptions.find(opt => opt.getAttribute('label') === desiredValue);
							}
							if (!match) {
								return Promise.reject(new Error('No option matching value'));
							}
							target.selectedIndex = match.index;
							target.dispatchEvent(new Event('input', {bubbles: true}));
							target.dispatchEvent(new Event('change', {bubbles: true}));
							return Promise.resolve();
						}

						const prototype = Object.getPrototypeOf(target);
						const {set: prototypeValueSetter} =
							Object.getOwnPropertyDescriptor(prototype, 'value') || {};
						if (prototypeValueSetter) {
							prototypeValueSetter.call(target, desiredValue);
						} else {
							target.value = desiredValue;
						}
						target.dispatchEvent(new Event('input', {bubbles: true}));
						return Promise.resolve();
					}, value);
				} catch {
					throw new Error(`Failed action: no element matching selector "${selector}"`);
				} finally {
					await handle.dispose();
				}
				return;
			}
			try {
				await page.evaluate((targetSelector, desiredValue) => {
					const target = document.querySelector(targetSelector);
					if (!target) {
						return Promise.reject(new Error('No element found'));
					}

					// For <select>, match the option by value, then trimmed
					// textContent, then label attribute. Duck-type on tagName
					// to stay portable across test stubs that lack
					// HTMLSelectElement.
					if (target.tagName === 'SELECT') {
						const selectOptions = Array.from(target.options);
						let match = selectOptions.find(opt => opt.value === desiredValue);
						if (!match) {
							match = selectOptions.find(opt => (opt.textContent || '').trim() === desiredValue);
						}
						if (!match) {
							match = selectOptions.find(opt => opt.getAttribute('label') === desiredValue);
						}
						if (!match) {
							return Promise.reject(new Error('No option matching value'));
						}
						target.selectedIndex = match.index;
						target.dispatchEvent(new Event('input', {bubbles: true}));
						target.dispatchEvent(new Event('change', {bubbles: true}));
						return Promise.resolve();
					}

					const prototype = Object.getPrototypeOf(target);
					const {set: prototypeValueSetter} =
						Object.getOwnPropertyDescriptor(prototype, 'value') || {};
					if (prototypeValueSetter) {
						prototypeValueSetter.call(target, desiredValue);
					} else {
						target.value = desiredValue;
					}
					target.dispatchEvent(new Event('input', {
						bubbles: true
					}));
					return Promise.resolve();
				}, selector, value);
			} catch {
				throw new Error(`Failed action: no element matching selector "${selector}"`);
			}
		}
	},

	// Action to clear an input field value
	// E.g. "clear field #username"
	{
		name: 'clear-field-value',
		match: /^clear( field)? (.+?)$/i,
		run: async (browser, page, options, matches) => {
			const selector = matches[2];
			if (usesNativeSelectorEngine(selector) || usesBareXPathEngine(selector)) {
				const handle = await resolveElementHandle(page, selector);
				try {
					await handle.evaluate(target => {
						const prototype = Object.getPrototypeOf(target);
						const {set: prototypeValueSetter} =
							Object.getOwnPropertyDescriptor(prototype, 'value') || {};
						if (prototypeValueSetter) {
							prototypeValueSetter.call(target, '');
						} else {
							target.value = '';
						}
						target.dispatchEvent(new Event('input', {bubbles: true}));
					});
				} catch {
					throw new Error(`Failed action: no element matching selector "${selector}"`);
				} finally {
					await handle.dispose();
				}
				return;
			}
			try {
				await page.evaluate(targetSelector => {
					const target = document.querySelector(targetSelector);
					if (!target) {
						return Promise.reject(new Error('No element found'));
					}
					const prototype = Object.getPrototypeOf(target);
					const {set: prototypeValueSetter} =
						Object.getOwnPropertyDescriptor(prototype, 'value') || {};
					if (prototypeValueSetter) {
						prototypeValueSetter.call(target, '');
					} else {
						target.value = '';
					}
					target.dispatchEvent(new Event('input', {
						bubbles: true
					}));
					return Promise.resolve();
				}, selector);
			} catch {
				throw new Error(`Failed action: no element matching selector "${selector}"`);
			}
		}
	},

	// Action to check or uncheck a checkbox/radio input
	// E.g. "check field #example"
	// E.g. "uncheck field #example"
	{
		name: 'check-field',
		match: /^(check|uncheck)( field)? (.+)$/i,
		run: async (browser, page, options, matches) => {
			const checked = (matches[1] !== 'uncheck');
			const selector = matches[3];
			if (usesNativeSelectorEngine(selector) || usesBareXPathEngine(selector)) {
				const handle = await resolveElementHandle(page, selector);
				try {
					await handle.evaluate((target, isChecked) => {
						target.checked = isChecked;
						target.dispatchEvent(new Event('change', {bubbles: true}));
					}, checked);
				} catch {
					throw new Error(`Failed action: no element matching selector "${selector}"`);
				} finally {
					await handle.dispose();
				}
				return;
			}
			try {
				await page.evaluate((targetSelector, isChecked) => {
					const target = document.querySelector(targetSelector);
					if (!target) {
						return Promise.reject(new Error('No element found'));
					}
					target.checked = isChecked;
					target.dispatchEvent(new Event('change', {
						bubbles: true
					}));
					return Promise.resolve();
				}, selector, checked);
			} catch {
				throw new Error(`Failed action: no element matching selector "${selector}"`);
			}
		}
	},

	// Action to screen capture the page to a file
	// E.g. "screen-capture example.png"
	// E.g. "capture screen to example.png"
	{
		name: 'screen-capture',
		match: /^(screen[ -]?capture|capture[ -]?screen)( to)? (.+)$/i,
		run: async (browser, page, options, matches) => {
			await page.screenshot({
				path: matches[3],
				fullPage: true
			});
		}
	},

	// Action which waits for the URL, path, or fragment to change to the given value
	// E.g. "wait for fragment to be #example"
	// E.g. "wait for path to be /example"
	// E.g. "wait for url to be https://example.com/"
	{
		name: 'wait-for-url',
		match: /^wait for (fragment|hash|host|path|url)( to (not )?be)? ([^\s]+)$/i,
		run: async (browser, page, options, matches) => {
			const expectedValue = matches[4];
			const negated = (matches[3] !== undefined);
			const subject = matches[1];

			let property;
			switch (subject) {
				case 'fragment':
				case 'hash':
					property = 'hash';
					break;
				case 'host':
					property = 'host';
					break;
				case 'path':
					property = 'pathname';
					break;
				default:
					property = 'href';
					break;
			}


			function locationHasProperty(locationProperty, value, isNegated) {
				return isNegated ?
					window.location[locationProperty] !== value :
					window.location[locationProperty] === value;
			}

			await page.waitForFunction(
				locationHasProperty,
				{},
				property,
				expectedValue,
				negated
			);
		}
	},

	// Action which waits for an element to be added, removed, visible, or hidden
	// E.g. "wait for element .foo to be added"
	// E.g. "wait for .foo .bar to be visible"
	{
		name: 'wait-for-element-state',
		match: /^wait for( element)? (.+)( to be) (added|removed|visible|hidden)$/i,
		run: async (browser, page, options, matches) => {
			const selector = matches[2];
			const state = matches[4];

			if (usesBareXPathEngine(selector)) {
				await waitForXPathElementState(page, selector, state);
				return;
			}

			if (usesNativeSelectorEngine(selector)) {
				await waitForNativeElementState(page, selector, state);
				return;
			}

			await page.waitForFunction((targetSelector, desiredState) => {
				const targetElement = document.querySelector(targetSelector);

				const statusChecks = {
					isAddedOrRemoved: el =>
						Boolean(
							(desiredState === 'added' && el) ||
							(desiredState === 'removed' && !el)
						),
					isHiddenOrVisible: isVisible =>
						Boolean(
							(desiredState === 'visible' && isVisible) ||
							(desiredState === 'hidden' && !isVisible)
						),
					isTargetVisible: el =>
						Boolean(
							el &&
							(el.offsetWidth ||
							el.offsetHeight ||
							el.getClientRects().length)
						)
				};

				// Check for added/removed states
				if (statusChecks.isAddedOrRemoved(targetElement)) {
					return true;
				}

				// Check element visibility
				const isTargetVisible = statusChecks.isTargetVisible(targetElement);

				// Check for visible/hidden states
				const isInDesiredVisibilityState = statusChecks.isHiddenOrVisible(isTargetVisible);

				return isInDesiredVisibilityState;
			}, {
				polling: 200
			}, selector, state);
		}
	},

	// Action which waits for an element to emit an event
	// E.g. "wait for element .foo to emit example-event"
	// E.g. "wait for .tab-panel to emit load"
	{
		name: 'wait-for-element-event',
		match: /^wait for( element)? (.+) to emit (.+)$/i,
		run: async (browser, page, options, matches) => {
			const selector = matches[2];
			const eventType = matches[3];
			/* eslint-disable no-underscore-dangle */
			if (usesNativeSelectorEngine(selector) || usesBareXPathEngine(selector)) {
				const handle = await resolveElementHandle(page, selector);
				try {
					await handle.evaluate((target, desiredEvent) => {
						target.addEventListener(desiredEvent, () => {
							window._pa11yWaitForElementEventFired = true;
						}, {
							once: true
						});
					}, eventType);
				} catch {
					await handle.dispose();
					throw new Error(`Failed action: no element matching selector "${selector}"`);
				}
				await handle.dispose();
				await page.waitForFunction(() => {
					if (window._pa11yWaitForElementEventFired) {
						delete window._pa11yWaitForElementEventFired;
						return true;
					}
					return false;
				}, {
					polling: 200
				});
				return;
			}
			try {
				await page.evaluate(
					(targetSelector, desiredEvent) => {
						const target = document.querySelector(targetSelector);
						if (!target) {
							return Promise.reject(
								new Error('No element found')
							);
						}
						target.addEventListener(desiredEvent, () => {
							window._pa11yWaitForElementEventFired = true;
						}, {
							once: true
						});
					},
					selector,
					eventType
				);
				await page.waitForFunction(() => {
					if (window._pa11yWaitForElementEventFired) {
						delete window._pa11yWaitForElementEventFired;
						return true;
					}
					return false;
				}, {
					polling: 200
				});
				/* eslint-enable no-underscore-dangle */
			} catch {
				throw new Error(`Failed action: no element matching selector "${selector}"`);
			}
		}
	}
];
