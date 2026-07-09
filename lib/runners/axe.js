'use strict';

const path = require('path');
const axePath = path.dirname(require.resolve('axe-core'));

/**
 * Axe's types
 * @typedef { import('axe-core') } Axe
 * @typedef { import('axe-core').Selector } AxeSelector
 * @typedef { import('axe-core').Rule } AxeRule
 * @typedef { import('axe-core').ImpactValue } AxeImpact
 * @typedef { import('axe-core').Result } AxeResult
 * @typedef { import('axe-core').RunOptions } AxeRunOptions
 * @typedef { import('axe-core').RunOnly } AxeRunOnly
 */

/**
 * @import { Pa11yConfiguration, Pa11yStandard, Pa11yLevel } from '../pa11y'
 */

const run = async options => {

	/**
	 * @returns {Axe} Axe
	 */
	const getBrowserAxe = () => (window || global).axe;

	/**
	 * Get the proper context to pass to axe, according to the specified Pa11y options. It can be an
	 * HTML element or a CSS selector, ready to be used in `axe.run()`
	 * @param {Node | string} rootElement Root element
	 * @returns {Node | string} Axe context element
	 */
	function getAxeContext(rootElement) {
		return rootElement || window.document;
	}

	/**
	 * Create a configuration for `axe.run()` corresponding to Pa11y's current configuration
	 * @param {Pa11yConfiguration} options Pa11y's configuration
	 * @returns {AxeRunOptions} Axe configuration
	 */
	const getAxeOptions = ({standard, rules = [], ignore = []}) => ({
		rules: pa11yRulesToAxe(rules, ignore),
		...(standard && {
			runOnly: createAxeRunOnlyTags(standard)
		})
	});

	/**
	 * Convert an axe selector array to a selector string.
	 * @param {Array<string>} selectors - The selector parts.
	 * @returns {string} Selector string.
	 */
	const selectorToString = selectors => selectors.join(' ');

	/**
	 * Map Pa11y's 'standard' to axe's 'runOnly'.
	 * @param {Pa11yStandard} pa11yStandard Provided Pa11y standard (upper bound)
	 * @returns {AxeRunOnly} Axe's `runOnly` value.
	 */
	const createAxeRunOnlyTags = pa11yStandard => ({
		type: 'tags',
		values: [
			'wcag2a',
			'wcag21a',
			...(pa11yStandard === 'WCAG2A' ? [] : [
				'wcag2aa',
				'wcag21aa'
			]),
			'best-practice'
		]
	});

	/**
	 * Map the Pa11y rules option to the axe rules option
	 * @param {Array<string>} rules List of Pa11y rules
	 * @param {Array<string>} ignore List of Pa11y rules to ignore
	 * @returns {object} Axe rules value
	 */
	const pa11yRulesToAxe = (rules, ignore) => {
		return Object.assign(
			{},
			...getBrowserAxe()
				.getRules()
				.map(({ruleId}) => ruleId.toLowerCase())
				.map(id => createAxeRule(id, rules, ignore))
				.filter(rule => rule)
		);
	};

	const createAxeRule = (axeId, pa11yRules, pa11yIgnore) => {
		if (pa11yRules.includes(axeId)) {
			return ({
				[axeId]: {
					enabled: true
				}
			});
		}
		if (pa11yIgnore.includes(axeId)) {
			return ({
				[axeId]: {
					enabled: false
				}
			});
		}
		return null;
	};

	const axeImpactToPa11yLevel = {
		critical: 'error',
		serious: 'error',
		moderate: 'warning',
		minor: 'notice'
	};

	const pa11yLevelSeverity = {
		error: 3,
		warning: 2,
		notice: 1
	};

	const isWithinMaxLevel = (level, maxLevel) => {
		return pa11yLevelSeverity[level] <= pa11yLevelSeverity[maxLevel];
	};

	/**
	 * Choose a Pa11y reporting level corresponding to an axe issue
	 * @param {AxeImpact} axeImpact Axe's reported impact level
	 * @param {boolean} issueNeedsReview Whether the issue needs further review
	 * @param {string} levelCapWhenNeedsReview Cap incomplete issue level: error, warning, notice
	 * @returns {Pa11yLevel} A Pa11y level
	 */
	const choosePa11yLevel = (axeImpact, issueNeedsReview, levelCapWhenNeedsReview) => {
		let level = axeImpactToPa11yLevel?.[axeImpact] ?? 'error';
		if (issueNeedsReview && levelCapWhenNeedsReview && !isWithinMaxLevel(
			level,
			levelCapWhenNeedsReview
		)) {
			level = levelCapWhenNeedsReview;
		}
		return level;
	};

	/**
	 * Process an axe issue.
	 * @param {AxeResult} axeIssue The axe issue
	 * @param {boolean} needsFurtherReview This axe issue is incomplete and may need review.
	 * @param {string} levelCapWhenNeedsReview Cap incomplete issue level: error, warning, notice
	 * @returns {object[]} List of processed issues
	 * @see https://github.com/dequelabs/axe-core/blob/develop/doc/API.md#results-object
	 */
	const processIssue = (
		{nodes, id, description, help, helpUrl, impact},
		needsFurtherReview = false,
		levelCapWhenNeedsReview
	) => {
		return (nodes.length ? nodes : nodesForNodelessIssue())
			.map(node => {
				const selector = node.target && selectorToString(node.target);
				const element = selector && window.document.querySelector(selector);
				// Capture axe.data + cssFg + bbox (+ pseudo styles) on incompletes
				// so the post-audit resolver runs as pure compute. Pa11y otherwise strips axe.data.
				const dataCheck = needsFurtherReview ?
					[].concat(node.any || [], node.all || [], node.none || [])
						.find(check => check && check.id === id) || null :
					null;
				let cssFg = null;
				let bgClip = null;
				let bgImage = null;
				let bgColor = null;
				let bgImageBehind = null;
				let bgMediaType = null;
				let bgMediaReady = null;
				// Tier 1 dynamic-content signal ('aria-busy' | 'lazy-attr'), else null.
				let bgDynamicSignal = null;
				// Stamped on every color-contrast item so a missing bgMediaType is unambiguous.
				// Bump when the detection algorithm changes.
				let bgDetectVersion = null;
				let bbox = null;
				let pseudoBefore = null;
				let pseudoAfter = null;
				let opacity = 1;
				let placeholderColor = null;
				let placeholderOpacity = 1;
				if (needsFurtherReview && element) {
					try {
						const style = window.getComputedStyle(element);
						cssFg = (style && style.color) || null;
						// `background-clip: text` paints glyphs from the background while `color`
						// computes to transparent — capture it so the resolver doesn't mislabel
						// visible text as fully transparent.
						if (style) {
							const stdClip = style.backgroundClip;
							const webkitClip = style.webkitBackgroundClip ||
								(style.getPropertyValue && style.getPropertyValue('-webkit-background-clip'));
							bgClip = (stdClip === 'text' || webkitClip === 'text') ? 'text' : (stdClip || webkitClip || null);
							// Clipped text is painted from the background-image/colour — capture the
							// paint source so the resolver can measure real contrast.
							if (bgClip === 'text') {
								const img = style.backgroundImage;
								bgImage = (img && img !== 'none') ? img : null;
								bgColor = style.backgroundColor || null;
							}
						}
						const rect = element.getBoundingClientRect && element.getBoundingClientRect();
						if (rect) {
							bbox = {x: rect.x,
								y: rect.y,
								width: rect.width,
								height: rect.height};
						}
						// element/ancestor opacity fades the text below its CSS `color`.
						// Multiply up the chain so the resolver folds it into the fg alpha.
						let ancestor = element;
						while (ancestor && ancestor.nodeType === 1) {
							const ancestorStyle = window.getComputedStyle(ancestor);
							const ancestorOpacity = ancestorStyle ? parseFloat(ancestorStyle.opacity) : NaN;
							if (Number.isFinite(ancestorOpacity)) {
								opacity *= ancestorOpacity;
							}
							ancestor = ancestor.parentElement;
						}
						// an empty input/textarea paints only its ::placeholder; `color` styles the
						// unpainted typed value. Capture its colour (and its own opacity) as the foreground.
						if (id === 'color-contrast') {
							const tag = element.tagName;
							const showsPlaceholder =
								(tag === 'INPUT' || tag === 'TEXTAREA') && !element.value && Boolean(element.placeholder);
							if (showsPlaceholder) {
								const ph = window.getComputedStyle(element, '::placeholder');
								placeholderColor = (ph && ph.color) || null;
								const phOpacity = ph ? parseFloat(ph.opacity) : NaN;
								if (Number.isFinite(phOpacity)) {
									placeholderOpacity = phOpacity;
								}
							}
						}
						// Detect a raster/media background behind the text (img/video/canvas or url()),
						// stopping at the first opaque layer so deeper textures don't wrongly flag it.
						if (id === 'color-contrast') {
							bgDetectVersion = 'geom-1';
							const isOpaqueColor = style => {
								const bc = style && style.backgroundColor;
								if (!bc) {
									return false;
								}
								const match = bc.match(/rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*([\d.]+))?\)/);
								return Boolean(match) && (match[1] === undefined || parseFloat(match[1]) >= 1);
							};
							// A gradient occludes only if every stop is fully opaque; a `transparent`
							// keyword or an rgba()/hsla() stop with alpha < 1 lets the layer behind through.
							const gradientIsOpaque = bi => {
								if (/\btransparent\b/.test(bi)) {
									return false;
								}
								const stops = bi.match(/rgba?\([^)]*\)|hsla?\([^)]*\)/g) || [];
								return !stops.some(stop => {
									// Alpha is the value after a slash, or the 4th comma component of rgba()/hsla();
									// rgb()/hsl() (3 components) are opaque - do not read the last channel as alpha.
									const match =
										stop.match(/\/\s*([\d.]+%?)\s*\)$/) ||
										stop.match(/^(?:rgba|hsla)\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*([\d.]+%?)\s*\)$/i);
									return match && parseFloat(match[1]) < (match[1].indexOf('%') === -1 ? 1 : 100);
								});
							};
							// 'image' = raster/media (flag + occludes), 'occlude' = solid colour or opaque
							// gradient (occludes, don't flag), 'continue' = see-through, keep looking deeper.
							const classify = style => {
								const bi = style && style.backgroundImage;
								if (bi && bi !== 'none') {
									if (bi.indexOf('url(') !== -1) {
										return 'image';
									}
									return gradientIsOpaque(bi) ? 'occlude' : 'continue';
								}
								return isOpaqueColor(style) ? 'occlude' : 'continue';
							};
							// Ancestor chain: nearest painted background wins.
							for (let anc = element; anc && anc !== window.document.documentElement; anc = anc.parentElement) {
								const layer = classify(window.getComputedStyle(anc));
								if (layer === 'image') {
									bgImageBehind = true;
									bgMediaType = 'image';
								}
								if (layer !== 'continue') {
									break;
								}
							}
							// Stacking: catch positioned img/video/canvas the ancestor walk misses (e.g. a
							// sibling video); video/canvas may be an unloaded frame at capture time.
							const mediaTypeForTag = tag =>
								({IMG: 'image',
									VIDEO: 'video',
									CANVAS: 'canvas'})[tag] || null;
							const rectCovers = (rect, x, y) =>
								Boolean(rect) && rect.width > 0 && rect.height > 0 && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
							const isRendered = el => {
								const style = window.getComputedStyle(el);
								return style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity || '1') > 0;
							};
							// Loaded state of the covering media (img complete / video readyState>=2 / else ready).
							const mediaReady = el => {
								if (el.tagName === 'IMG') {
									return Boolean(el.complete && el.naturalWidth > 0);
								}
								if (el.tagName === 'VIDEO') {
									return el.readyState >= 2;
								}
								return true;
							};
							// In-viewport hit-testing: walk the paint stack; the first opaque layer occludes.
							// Returns { type, el } (el null for a url() background) or null.
							const detectByStack = (x, y) => {
								const stack = window.document.elementsFromPoint(x, y) || [];
								for (const el of stack) {
									if (!(el === element || element.contains(el))) {
										const type = mediaTypeForTag(el.tagName);
										if (type) {
											if (isRendered(el)) {
												return {type,
													el};
											}
										} else {
											const layer = classify(window.getComputedStyle(el));
											if (layer === 'image') {
												return {type: 'image',
													el: null};
											}
											if (layer === 'occlude') {
												return null;
											}
										}
									}
								}
								return null;
							};
							// Off-screen fallback: elementsFromPoint is viewport-only, so walk up from the text,
							// checking each container's media for one whose rect covers the point, up to the clip.
							const detectByGeometry = (x, y) => {
								let anc = element.parentElement;
								let hops = 0;
								while (anc && hops < 12) {
									const media = anc.querySelectorAll('img, video, canvas');
									for (const node of media) {
										const usable = !(node === element || element.contains(node) || node.contains(element) || !isRendered(node));
										if (usable && rectCovers(node.getBoundingClientRect(), x, y)) {
											return {type: mediaTypeForTag(node.tagName),
												el: node};
										}
									}
									if (anc === window.document.body) {
										break;
									}
									const {overflow} = window.getComputedStyle(anc);
									if (overflow && overflow !== 'visible') {
										break;
									}
									anc = anc.parentElement;
									hops += 1;
								}
								return null;
							};
							if (!bgImageBehind && bbox && bbox.width > 0 && bbox.height > 0) {
								const cy = bbox.y + (bbox.height / 2);
								const pts = [
									[bbox.x + (bbox.width / 2), cy],
									[bbox.x + (bbox.width * 0.25), cy],
									[bbox.x + (bbox.width * 0.75), cy]
								];
								const inViewport = (x, y) => x >= 0 && y >= 0 && x <= window.innerWidth && y <= window.innerHeight;
								for (const pt of pts) {
									const hit = inViewport(pt[0], pt[1]) ? detectByStack(pt[0], pt[1]) : detectByGeometry(pt[0], pt[1]);
									if (hit && hit.type) {
										bgImageBehind = true;
										bgMediaType = hit.type;
										bgMediaReady = hit.el ? mediaReady(hit.el) : null;
										break;
									}
								}
							}
							// Tier 1: loading/deferred tells in the initial DOM (no scroll), only when no media was
							// pinned. Abstain so a skeleton crop cannot drive a false pass.
							if (!bgImageBehind) {
								// Aria-busy on the text or an ancestor: the ARIA standard for a loading/updating region.
								for (let anc = element; anc && anc !== window.document.documentElement; anc = anc.parentElement) {
									if (anc.getAttribute && anc.getAttribute('aria-busy') === 'true') {
										bgDynamicSignal = 'aria-busy';
										break;
									}
								}
								// A lazy-load placeholder covering the text (loading=lazy not loaded, or a
								// data-src/data-srcset marker whose real asset hasn't swapped in).
								if (!bgDynamicSignal && bbox && bbox.width > 0 && bbox.height > 0) {
									const dcx = bbox.x + (bbox.width / 2);
									const dcy = bbox.y + (bbox.height / 2);
									let anc = element.parentElement;
									let dhops = 0;
									while (anc && dhops < 12) {
										const selector = 'img[loading="lazy"], iframe[loading="lazy"], [data-src], [data-srcset], [data-bg], [data-background]';
										const lazies = anc.querySelectorAll(selector);
										for (const node of lazies) {
											const usable = !(node === element || element.contains(node) || node.contains(element) || !isRendered(node));
											const dpending = node.hasAttribute('data-src') || node.hasAttribute('data-srcset') || node.hasAttribute('data-bg') || node.hasAttribute('data-background') || (node.tagName === 'IMG' && !(node.complete && node.naturalWidth > 0));
											if (usable && dpending && rectCovers(node.getBoundingClientRect(), dcx, dcy)) {
												bgDynamicSignal = 'lazy-attr';
												break;
											}
										}
										if (bgDynamicSignal || anc === window.document.body) {
											break;
										}
										const doverflow = window.getComputedStyle(anc).overflow;
										if (doverflow && doverflow !== 'visible') {
											break;
										}
										anc = anc.parentElement;
										dhops += 1;
									}
								}
							}
							// Tier 2: unmarked media-slot skeleton — a solid full-tile placeholder behind the text
							// (bgGradient/bgImage incomplete) with no marking attribute; detect the shape.
							if (!bgImageBehind && !bgDynamicSignal && bbox && bbox.width > 0 && bbox.height > 0) {
								const mk2 = dataCheck && dataCheck.data && dataCheck.data.messageKey;
								if (mk2 === 'bgGradient' || mk2 === 'bgImage') {
									const scx = bbox.x + (bbox.width / 2);
									const scy = bbox.y + (bbox.height / 2);
									let shops = 0; let
										tile = null;
									for (let anc = element.parentElement; anc && shops < 12; anc = anc.parentElement, shops += 1) {
										const ts = window.getComputedStyle(anc);
										const positioned = ts.position === 'relative' || ts.position === 'absolute' || ts.position === 'fixed' || ts.position === 'sticky';
										if (ts.overflow && ts.overflow !== 'visible' && positioned) {
											tile = anc;
											break;
										}
										if (anc === window.document.body) {
											break;
										}
									}
									if (tile) {
										const tr = tile.getBoundingClientRect();
										const slots = tile.querySelectorAll('div, span, section, a, picture');
										for (const el of slots) {
											const skip = el === element || el.contains(element) || element.contains(el) || !isRendered(el);
											const slotStyle = skip ? null : window.getComputedStyle(el);
											const positioned = slotStyle && (slotStyle.position === 'absolute' || slotStyle.position === 'fixed');
											const rect = positioned ? el.getBoundingClientRect() : null;
											const bigEnough = rect && rect.width >= tr.width * 0.8 && rect.height >= tr.height * 0.8 && rectCovers(rect, scx, scy);
											const solid = bigEnough && (slotStyle.backgroundImage || 'none') === 'none' && (/^rgb\(/).test(slotStyle.backgroundColor || '');
											const empty = solid && !el.querySelector('img, video, canvas') && (el.textContent || '').trim().length === 0;
											if (empty) {
												bgDynamicSignal = 'empty-slot';
												break;
											}
										}
									}
								}
							}
						}
						const messageKey = dataCheck && dataCheck.data && dataCheck.data.messageKey;
						if (messageKey === 'pseudoContent') {
							// a pseudo carries its own opacity on top of the element-chain
							// `opacity` above (pseudos aren't in the parentElement walk) — capture it when < 1.
							const before = window.getComputedStyle(element, '::before');
							const beforeContent = (before && before.content) || null;
							if (beforeContent && beforeContent !== 'none' && beforeContent !== '""' && beforeContent !== '\'\'') {
								const beforeOpacity = before ? parseFloat(before.opacity) : NaN;
								pseudoBefore = {color: (before && before.color) || null,
									content: beforeContent,
									...(Number.isFinite(beforeOpacity) && beforeOpacity < 1 && {opacity: beforeOpacity})};
							}
							const after = window.getComputedStyle(element, '::after');
							const afterContent = (after && after.content) || null;
							if (afterContent && afterContent !== 'none' && afterContent !== '""' && afterContent !== '\'\'') {
								const afterOpacity = after ? parseFloat(after.opacity) : NaN;
								pseudoAfter = {color: (after && after.color) || null,
									content: afterContent,
									...(Number.isFinite(afterOpacity) && afterOpacity < 1 && {opacity: afterOpacity})};
							}
						}
					} catch {
						// Tolerate DOM read failures — leave nulls
					}
				}
				return {
					element,
					code: id,
					type: choosePa11yLevel(impact, needsFurtherReview, levelCapWhenNeedsReview),
					message: `${help} (${helpUrl})`,
					runnerExtras: {
						description,
						impact,
						needsFurtherReview,
						help,
						helpUrl,
						...(needsFurtherReview && {
							axeData: (dataCheck && dataCheck.data) || null,
							axeRelatedNodes: ((dataCheck && dataCheck.relatedNodes) || []).map(rn => ({
								target: rn.target,
								html: rn.html
							})),
							cssFg,
							...(placeholderColor && {placeholderColor}),
							...(placeholderOpacity < 1 && {placeholderOpacity}),
							bgClip,
							...(bgImage && {bgImage}),
							...(bgColor && {bgColor}),
							...(bgImageBehind && {bgImageBehind: true}),
							...(bgMediaType && {bgMediaType}),
							...(bgMediaReady !== null && {bgMediaReady}),
							...(bgDynamicSignal && {bgDynamicSignal}),
							...(bgDetectVersion && {bgDetectVersion}),
							bbox,
							...(opacity < 1 && {opacity}),
							...(pseudoBefore && {pseudoBefore}),
							...(pseudoAfter && {pseudoAfter})
						})
					}
				};
			});
	};

	const nodesForNodelessIssue = () => [{
		target: null
	}];

	/**
	 * Run axe on the page
	 * @param {Pa11yConfiguration} options Pa11y's configuration
	 * @returns {Promise<Array<Pa11yResult>>} A promise of axe issues translated for Pa11y
	 */
	async function runAxeCore({standard, rules, ignore, rootElement, levelCapWhenNeedsReview}) {
		const {
			violations = [],
			incomplete = []
		} =
			await getBrowserAxe()
				.run(
					getAxeContext(rootElement),
					getAxeOptions({
						standard,
						rules,
						ignore
					})
				);

		return [
			...violations.flatMap(issue => processIssue(issue, false, levelCapWhenNeedsReview)),
			...incomplete.flatMap(issue => processIssue(issue, true, levelCapWhenNeedsReview))
		];
	}

	return await runAxeCore(options);
};

/**
 * Pa11y runner for axe.
 * @type {import('../pa11y').Pa11yRunner}
 * @see https://www.deque.com/axe/core-documentation/api-documentation/
 */
const runner = {
	run,
	scripts: [`${axePath}/axe.min.js`],
	supports: '^9.0.0 || ^9.0.0-alpha || ^9.0.0-beta'
};

/**
 * Export for CommonJS.
 * For browsers, runners are currently stringified and inserted directly.
 */
module.exports = runner;
