/* eslint strict: ["error", "function"] */

((exporter => {
	'use strict';

	const pa11yRunner = {
		getElementContext,
		getElementSelector,
		run,
		runners: {},
		runnerDetails: {},
		runnerVersions: {},
		version: null
	};

	// Create the global Pa11y variable
	/* eslint-disable-next-line no-underscore-dangle */
	exporter.__pa11y = pa11yRunner;

	/**
	 * A map of issue names to type codes.
	 * @private
	 */
	const issueCodeMap = {
		unknown: 0,
		error: 1,
		warning: 2,
		notice: 3,
		pass: 4
	};

	/**
	 * @import { Pa11yConfiguration } from './pa11y'
	 */
	/**
	 * Run Pa11y on the current page, using any other runners defined.
	 * @public
	 * @param {Pa11yConfiguration} options Options to use when running tests.
	 * @returns {Promise} Returns a promise which resolves with test results.
	 */
	async function run(options) {
		const {
			pa11yVersion,
			runners: runnerNames,
			wait: waitTime
		} = options;

		const trimPassContext = createPassContextTrimmer(options);
		await wait(waitTime);
		pa11yRunner.version = pa11yVersion;
		pa11yRunner.runnerVersions = {};
		pa11yRunner.runnerDetails = {};

		const issuesPerRunner = await Promise.all(
			runnerNames.map(runnerGo)
		);

		return {
			documentTitle: window.document.title || '',
			pageUrl: window.location.href || '',
			issues: processIssues(issuesPerRunner.flat()),
			runnerVersions: {...pa11yRunner.runnerVersions},
			runnerDetails: {...pa11yRunner.runnerDetails}
		};


		async function runnerGo(name) {
			const issues = await pa11yRunner.runners[name](options, pa11yRunner);
			return issues.map(issue => ({
				...issue,
				runner: name
			}));
		}

		/**
		 * Process issues from a runner.
		 * @param {Array<Pa11yIssue>} issues An array of issues to process.
		 * @returns {Array<Pa11yIssue>} Returns an array of processed issues.
		 */
		function processIssues(issues) {
			if (options.rootElement) {
				issues = issues.filter(issue => isElementInTestArea(issue.element));
			}
			if (options.hideElements) {
				issues = issues.filter(issue => isElementOutsideHiddenArea(issue.element));
			}
			return issues.map(processIssue).filter(isIssueNotIgnored);
		}

		/**
		 * Process a runner issue
		 * @private
		 * @param {Pa11yIssue} issue An unrefined Pa11y runner issue
		 * @returns {Pa11yIssue} The completed issue
		 */
		function processIssue({code, type, message, element, runner, runnerExtras = {}}) {
			const {context, extras} = trimPassContext({
				type,
				element,
				context: (element ? getElementContext(element) : ''),
				extras: runnerExtras
			});
			return {
				code,
				type,
				typeCode: issueCodeMap[type] || 0,
				message,
				context,
				selector: (element ? getElementSelector(element) : ''),
				runner,
				runnerExtras: extras
			};
		}

		/**
		 * Confirms the issue isn't being ignored.
		 * @param {Pa11yIssue} issue Some issue.
		 * @returns {boolean} Whether the issue should be included.
		 */
		function isIssueNotIgnored(issue) {
			if (options.ignore.indexOf(issue.code.toLowerCase()) !== -1) {
				return false;
			}
			// `includePasses` is the only switch for passes: no type entry in `ignore` (including
			// the 'notice' and 'warning' entries added by default) may drop one.
			if (options.includePasses && issue.type === 'pass') {
				return true;
			}
			if (options.ignore.indexOf(issue.type) !== -1) {
				return false;
			}
			return true;
		}

		/**
		 * Check whether an element is in the test area specified by rootElement.
		 * @private
		 * @param {HTMLElement} element Some element.
		 * @returns {boolean} Whether the element is in the test area.
		 */
		function isElementInTestArea(element) {
			const rootElement = window.document.querySelector(options.rootElement);
			return (rootElement ? rootElement.contains(element) : true);
		}

		/**
		 * Check whether an element is outside of all hidden selectors.
		 * @private
		 * @param {HTMLElement} element Some element.
		 * @returns {boolean} Whether the element is outside of a hidden area.
		 */
		function isElementOutsideHiddenArea(element) {
			const hiddenElements = [...window.document.querySelectorAll(options.hideElements)];
			return !hiddenElements.some(hiddenElement => {
				return hiddenElement.contains(element);
			});
		}

	}

	/**
	 * Wait for some time.
	 * @param {number} milliseconds Number of milliseconds to wait.
	 * @returns {Promise<void>} A promise to continue after some time passes.
	 */
	function wait(milliseconds) {
		return new Promise(resolve => {
			setTimeout(resolve, milliseconds);
		});
	}

	/**
	 * Create the function that shortens pass contexts for a run. A shortened context records
	 * its full length in `contextFullLength`, and how it was shortened in `contextTrimmed`:
	 * `depth` (only elements nested deeper than `options.passContextMaxDepth` were emptied) or
	 * `length` (it was then cut at `options.passContextMaxLength` characters, so content may be
	 * lost). Other issue types keep their full context. A pass on the document element is never
	 * depth-limited, because its page-level checks are about the whole page, but the length limit
	 * still applies: each such pass carries the whole page.
	 * @param {Pa11yConfiguration} options The options Pa11y is running with.
	 * @returns {Function} Takes an issue's type, element, context and runner extras, and returns
	 *   the context and runner extras to report.
	 */
	function createPassContextTrimmer(options) {
		const {
			passContextMaxDepth: maxDepth,
			passContextMaxLength: maxLength,
			passContextTrimAbove: trimAbove
		} = options;
		const isPositiveInteger = value => Number.isInteger(value) && value > 0;
		let inertDocument;

		/**
		 * Copy a node, without its children, into a document with no browsing context. Copying
		 * in the page itself would run a custom element's constructor and start an image's
		 * fetch, changing the page that `screenCapture` saves and that a caller who passed in
		 * its own `page` goes on using.
		 * @param {Node} node The node to copy.
		 * @returns {Node} The copy.
		 */
		const copyNode = node => {
			inertDocument = inertDocument || window.document.implementation.createHTMLDocument('');
			return inertDocument.importNode(node, false);
		};

		/**
		 * Copy a node's children into a shallow copy of it, down to `maxDepth` levels below the
		 * pass's element. Text and comments are copied as they are.
		 * @param {Node} source The node to copy children from.
		 * @param {Node} target The shallow copy to append them to.
		 * @param {number} depth How many levels below the pass's element the children are.
		 * @returns {void}
		 */
		const copyChildNodes = (source, target, depth) => {
			for (const child of source.childNodes) {
				const childCopy = copyNode(child);
				target.appendChild(childCopy);
				if (child.nodeType === window.Node.ELEMENT_NODE && depth < maxDepth) {
					copyChildNodes(child, childCopy, depth + 1);
				}
			}
		};

		/**
		 * Whether to rebuild a pass's context to `passContextMaxDepth` levels: only when that is
		 * set, the context is longer than `passContextTrimAbove` characters (or any context, when
		 * that is unset), and the element isn't the document element.
		 * @param {HTMLElement} element The pass's element.
		 * @param {string} context The element's full HTML.
		 * @returns {boolean} True if the context should be depth-limited.
		 */
		const isDepthLimited = (element, context) => isPositiveInteger(maxDepth) &&
			element !== window.document.documentElement &&
			context.length > (isPositiveInteger(trimAbove) ? trimAbove : 0);

		/**
		 * Rebuild a context, keeping the element and its descendants down to
		 * `passContextMaxDepth` levels below it; elements at that last level are kept as empty
		 * tags. Nothing nearer the element than that is lost.
		 * @param {HTMLElement} element The pass's element.
		 * @param {string} context The element's full HTML.
		 * @returns {string} The depth-limited HTML, or the full HTML if that is no longer.
		 */
		const limitDepth = (element, context) => {
			if (!isDepthLimited(element, context)) {
				return context;
			}
			const copy = copyNode(element);
			copyChildNodes(element, copy, 1);
			const limited = copy.outerHTML;
			const isShorter = typeof limited === 'string' && limited.length < context.length;
			return isShorter ? limited : context;
		};

		/**
		 * The safety net: cut a context longer than `passContextMaxLength` characters.
		 * @param {string} context A pass's context.
		 * @returns {string} The context, cut if it was longer than the limit.
		 */
		const limitLength = context => {
			const isTooLong = isPositiveInteger(maxLength) && context.length > maxLength;
			return isTooLong ? context.slice(0, maxLength) : context;
		};

		return ({type, element, context, extras}) => {
			const isTrimmable = type === 'pass' && typeof context === 'string';
			if (!isTrimmable) {
				return {context,
					extras};
			}
			const depthLimited = limitDepth(element, context);
			const lengthLimited = limitLength(depthLimited);
			if (lengthLimited === context) {
				return {context,
					extras};
			}
			return {
				context: lengthLimited,
				extras: {
					...extras,
					contextFullLength: context.length,
					contextTrimmed: lengthLimited === depthLimited ? 'depth' : 'length'
				}
			};
		};
	}

	/**
	 * Get a short version of an element's outer HTML.
	 * @param {HTMLElement} element Some element.
	 * @returns {string} Shortened HTML as string.
	 */
	function getElementContext(element) {
		if (!element.outerHTML) {
			return null;
		}
		return element.outerHTML;
	}

	/**
	 * Get a CSS selector for an element.
	 * @param {HTMLElement} element - An element to get a selector for.
	 * @param {Array} [selectorParts=[]] - Internal parameter used for recursion.
	 * @returns {String} Returns the CSS selector as a string.
	 */
	function getElementSelector(element, selectorParts = []) {
		if (nodeIsElement(element)) {
			const identifier = buildElementIdentifier(element);
			selectorParts.unshift(identifier);
			if (!element.id && element.parentNode) {
				return getElementSelector(element.parentNode, selectorParts);
			}
		}
		return selectorParts.join(' > ');
	}

	/**
	 * Build a unique CSS element identifier.
	 * @param {HTMLElement} element - An element to get a CSS element identifier for.
	 * @returns {string} CSS element identifier
	 */
	function buildElementIdentifier(element) {
		if (element.id) {
			return `#${element.id}`;
		}
		let identifier = element.tagName.toLowerCase();
		if (!element.parentNode) {
			return identifier;
		}
		const siblings = getSiblings(element);
		const childIndex = siblings.indexOf(element);
		if (!isOnlySiblingOfType(element, siblings) && childIndex !== -1) {
			identifier += `:nth-child(${childIndex + 1})`;
		}
		return identifier;
	}

	/**
	 * Get element siblings.
	 * @param {HTMLElement} element Some element.
	 * @returns {Array<HTMLElement>} Array of siblings.
	 */
	function getSiblings(element) {
		return [...element.parentNode.childNodes].filter(nodeIsElement);
	}

	/**
	 * Check whether an element is the only sibling of its type.
	 * @param {HTMLElement} element Some element.
	 * @param {Array<HTMLElement>} siblings Siblings of this element.
	 * @returns {boolean} Whether the element is the only sibling of its type.
	 */
	function isOnlySiblingOfType(element, siblings) {
		const siblingsOfType = siblings.filter(sibling => {
			return (sibling.tagName === element.tagName);
		});
		return (siblingsOfType.length <= 1);
	}

	/**
	 * Check whether a node is an element.
	 * @param {Node} node Some DOM node.
	 * @returns {boolean} Returns whether the element is an HTMLElement.
	 */
	function nodeIsElement(node) {
		return (node.nodeType === window.Node.ELEMENT_NODE);
	}
})(this));
