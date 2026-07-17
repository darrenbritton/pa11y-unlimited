'use strict';

const assert = require('proclaim');
const sinon = require('sinon');
const path = require('path');

describe('lib/runners/axe', function() {
	let result;
	let originalWindow;
	let runner;

	beforeEach(function() {
		result = {
			violations: [
				{
					id: 'mock-id-1',
					description: 'mock description 1',
					impact: 'critical',
					help: 'mock help 1',
					helpUrl: 'mock-help-url-1',
					nodes: [
						{
							target: [
								'mock-selector-1a'
							]
						},
						{
							target: [
								'mock-selector-1b'
							]
						}
					]
				},
				{
					id: 'mock-id-2',
					description: 'mock description 2',
					impact: 'serious',
					help: 'mock help 2',
					helpUrl: 'mock-help-url-2',
					nodes: [
						{
							target: [
								'mock-selector-2'
							]
						}
					]
				},
				{
					id: 'mock-id-no-nodes',
					description: 'mock description no-nodes',
					impact: 'moderate',
					help: 'mock help no-nodes',
					helpUrl: 'mock-help-url-no-nodes',
					nodes: []
				}
			],
			incomplete: [
				{
					id: 'mock-id-3',
					description: 'mock description 3',
					impact: 'minor',
					help: 'mock help 3',
					helpUrl: 'mock-help-url-3',
					nodes: [
						{
							target: [
								'mock-selector-3'
							]
						}
					]
				},
				{
					id: 'mock-id-4',
					description: 'mock description 4',
					impact: 'not a supported impact level',
					help: 'mock help 4',
					helpUrl: 'mock-help-url-4',
					nodes: [
						{
							target: [
								'iframe-selector-1',
								'mock-selector-4a'
							]
						},
						{
							target: [
								'mock-selector-4b'
							]
						}
					]
				},
				{
					id: 'mock-id-5',
					description: 'mock description 5',
					impact: 'moderate',
					help: 'mock help 5',
					helpUrl: 'mock-help-url-5',
					nodes: [
						{
							target: [
								'mock-selector-5'
							]
						}
					]
				}
			]
		};

		originalWindow = global.window;
		global.window = {
			axe: {
				run: sinon.stub().resolves(result),
				getRules: sinon.stub().returns([])
			},
			document: {
				querySelector: sinon.stub()
			}
		};

		global.window.document.querySelector
			.withArgs('mock-selector-1a').returns('mock-element-1a');
		global.window.document.querySelector
			.withArgs('mock-selector-1b').returns('mock-element-1b');
		global.window.document.querySelector
			.withArgs('mock-selector-2').returns('mock-element-2');
		global.window.document.querySelector
			.withArgs('mock-selector-3').returns('mock-element-3');
		global.window.document.querySelector
			.withArgs('iframe-selector-1 mock-selector-4a').returns('mock-element-4a');
		global.window.document.querySelector
			.withArgs('mock-selector-4b').returns('mock-element-4b');
		global.window.document.querySelector
			.withArgs('mock-selector-5').returns('mock-element-5');

		runner = require('../../../../lib/runners/axe');
	});

	afterEach(function() {
		global.window = originalWindow;
	});

	it('is an object', function() {
		assert.isObject(runner);
	});

	it('has a `supports` property set to a string', function() {
		assert.isString(runner.supports);
	});

	it('has a `scripts` property set to an array of scripts the runner is dependent on', function() {
		const scriptPath =
			`${path.resolve(__dirname, '..', '..', '..', '..')}` +
			`${path.normalize('/node_modules/axe-core')}/axe.min.js`;
		assert.isArray(runner.scripts);
		assert.deepEqual(runner.scripts, [scriptPath]);
	});

	it('has a `run` method', function() {
		assert.isFunction(runner.run);
	});

	describe('.run(options, pa11y)', function() {
		let options;
		let pa11y;
		let resolvedValue;

		beforeEach(async function() {
			options = {};
			pa11y = {};
			resolvedValue = await runner.run(options, pa11y);
		});

		it('runs axe', function() {
			assert.calledOnce(global.window.axe.run);
			assert.calledWithExactly(
				global.window.axe.run,
				global.window.document,
				{rules: {}}
			);
		});

		it('resolves with processed and normalised issues', function() {
			assert.deepEqual(resolvedValue, [
				{
					code: 'mock-id-1',
					message: 'mock help 1 (mock-help-url-1)',
					type: 'error',
					element: 'mock-element-1a',
					runnerExtras: {
						description: 'mock description 1',
						impact: 'critical',
						needsFurtherReview: false,
						help: 'mock help 1',
						helpUrl: 'mock-help-url-1'
					}
				},
				{
					code: 'mock-id-1',
					message: 'mock help 1 (mock-help-url-1)',
					type: 'error',
					element: 'mock-element-1b',
					runnerExtras: {
						description: 'mock description 1',
						impact: 'critical',
						needsFurtherReview: false,
						help: 'mock help 1',
						helpUrl: 'mock-help-url-1'
					}
				},
				{
					code: 'mock-id-2',
					message: 'mock help 2 (mock-help-url-2)',
					type: 'error',
					element: 'mock-element-2',
					runnerExtras: {
						description: 'mock description 2',
						impact: 'serious',
						needsFurtherReview: false,
						help: 'mock help 2',
						helpUrl: 'mock-help-url-2'
					}
				},
				{
					code: 'mock-id-no-nodes',
					message: 'mock help no-nodes (mock-help-url-no-nodes)',
					type: 'warning',
					element: null,
					runnerExtras: {
						description: 'mock description no-nodes',
						impact: 'moderate',
						needsFurtherReview: false,
						help: 'mock help no-nodes',
						helpUrl: 'mock-help-url-no-nodes'
					}
				},
				{
					code: 'mock-id-3',
					message: 'mock help 3 (mock-help-url-3)',
					type: 'notice',
					element: 'mock-element-3',
					runnerExtras: {
						description: 'mock description 3',
						impact: 'minor',
						needsFurtherReview: true,
						help: 'mock help 3',
						helpUrl: 'mock-help-url-3',
						// Capture fields degrade to null here (mock has no getComputedStyle);
						// populated paths are covered in the capture describe below.
						axeData: null,
						axeRelatedNodes: [],
						cssFg: null,
						bgClip: null,
						bbox: null
					}
				},
				{
					code: 'mock-id-4',
					message: 'mock help 4 (mock-help-url-4)',
					type: 'error',
					element: 'mock-element-4a',
					runnerExtras: {
						description: 'mock description 4',
						impact: 'not a supported impact level',
						needsFurtherReview: true,
						help: 'mock help 4',
						helpUrl: 'mock-help-url-4',
						axeData: null,
						axeRelatedNodes: [],
						cssFg: null,
						bgClip: null,
						bbox: null
					}
				},
				{
					code: 'mock-id-4',
					message: 'mock help 4 (mock-help-url-4)',
					type: 'error',
					element: 'mock-element-4b',
					runnerExtras: {
						description: 'mock description 4',
						impact: 'not a supported impact level',
						needsFurtherReview: true,
						help: 'mock help 4',
						helpUrl: 'mock-help-url-4',
						axeData: null,
						axeRelatedNodes: [],
						cssFg: null,
						bgClip: null,
						bbox: null
					}
				},
				{
					code: 'mock-id-5',
					message: 'mock help 5 (mock-help-url-5)',
					type: 'warning',
					element: 'mock-element-5',
					runnerExtras: {
						description: 'mock description 5',
						impact: 'moderate',
						needsFurtherReview: true,
						help: 'mock help 5',
						helpUrl: 'mock-help-url-5',
						axeData: null,
						axeRelatedNodes: [],
						cssFg: null,
						bgClip: null,
						bbox: null
					}
				}
			]);
		});

		describe('when passing the Pa11y option', function() {
			describe('rootElement', function() {
				const cssSelector = '#main';

				beforeEach(async function() {
					options.rootElement = cssSelector;
					await runner.run(options, pa11y);
				});

				it('sets the axe context', function() {
					assert.calledWithExactly(
						global.window.axe.run,
						cssSelector,
						sinon.match.any
					);
				});
			});

			describe('standard', function() {
				it('supports level A', async function() {
					options.standard = 'WCAG2A';
					await runner.run(options, pa11y);
					assert.calledWithExactly(
						global.window.axe.run,
						sinon.match.any,
						sinon.match.hasNested(
							'runOnly.values',
							['wcag2a', 'wcag21a', 'best-practice']
						)
					);
				});

				it('supports level AA', async function() {
					options.standard = 'WCAG2AA';
					await runner.run(options, pa11y);
					assert.calledWithExactly(
						global.window.axe.run,
						sinon.match.any,
						sinon.match.hasNested(
							'runOnly.values',
							['wcag2a', 'wcag21a', 'wcag2aa', 'wcag21aa', 'best-practice']
						)
					);
				});
			});

			describe('rules', function() {
				beforeEach(async function() {
					options.rules = ['color-contrast', 'autocomplete-valid', 'something-else'];
					global.window.axe.getRules = sinon.stub().returns([
						{ruleId: 'color-contrast'},
						{ruleId: 'autocomplete-valid'}
					]);
					await runner.run(options, pa11y);
				});

				it('sets the axe rules', function() {
					assert.calledWithExactly(
						global.window.axe.run,
						sinon.match.any,
						sinon.match.has('rules', {
							'color-contrast': {enabled: true},
							'autocomplete-valid': {enabled: true}
						})
					);
				});
			});

			describe('ignore', function() {
				beforeEach(async function() {
					options.ignore = ['warning', 'notice', 'color-contrast', 'autocomplete-valid'];
					global.window.axe.getRules = sinon.stub().returns([
						{ruleId: 'color-contrast'},
						{ruleId: 'autocomplete-valid'}
					]);
					await runner.run(options, pa11y);
				});

				it('sets the axe ignore rules', function() {
					assert.calledWithExactly(
						global.window.axe.run,
						sinon.match.any,
						sinon.match.has('rules', {
							'color-contrast': {enabled: false},
							'autocomplete-valid': {enabled: false}
						})
					);
				});
			});

			describe('levelCapWhenNeedsReview', function() {
				describe('when set to "warning"', function() {
					beforeEach(async function() {
						options.levelCapWhenNeedsReview = 'warning';
						resolvedValue = await runner.run(options, pa11y);
					});

					it('caps incomplete issues with error-level impact at warning', function() {
						const incompleteIssues = resolvedValue.filter(issue => issue.code === 'mock-id-4');
						assert.strictEqual(incompleteIssues.length, 2);
						assert.strictEqual(incompleteIssues[0].type, 'warning');
						assert.strictEqual(incompleteIssues[1].type, 'warning');
					});

					it('does not affect incomplete issues already at warning level', function() {
						const warningIssue = resolvedValue.find(issue => issue.code === 'mock-id-5');
						assert.strictEqual(warningIssue.type, 'warning');
					});

					it('does not affect incomplete issues already at notice level', function() {
						const noticeIssue = resolvedValue.find(issue => issue.code === 'mock-id-3');
						assert.strictEqual(noticeIssue.type, 'notice');
					});
				});

				describe('when set to "notice"', function() {
					beforeEach(async function() {
						options.levelCapWhenNeedsReview = 'notice';
						resolvedValue = await runner.run(options, pa11y);
					});

					it('caps incomplete issues with error-level impact at notice', function() {
						const incompleteIssues = resolvedValue.filter(issue => issue.code === 'mock-id-4');
						assert.strictEqual(incompleteIssues.length, 2);
						assert.strictEqual(incompleteIssues[0].type, 'notice');
						assert.strictEqual(incompleteIssues[1].type, 'notice');
					});

					it('caps incomplete issues with warning-level impact at notice', function() {
						const warningIssue = resolvedValue.find(issue => issue.code === 'mock-id-5');
						assert.strictEqual(warningIssue.type, 'notice');
					});

					it('does not affect incomplete issues already at notice level', function() {
						const noticeIssue = resolvedValue.find(issue => issue.code === 'mock-id-3');
						assert.strictEqual(noticeIssue.type, 'notice');
					});
				});

				describe('when set to "error" (explicit)', function() {
					beforeEach(async function() {
						options.levelCapWhenNeedsReview = 'error';
						resolvedValue = await runner.run(options, pa11y);
					});

					it('does not cap incomplete issues, leaving them at error level', function() {
						const incompleteIssues = resolvedValue.filter(issue => issue.code === 'mock-id-4');
						assert.strictEqual(incompleteIssues.length, 2);
						assert.strictEqual(incompleteIssues[0].type, 'error');
						assert.strictEqual(incompleteIssues[1].type, 'error');
					});
				});

				describe('when left unset, defaults to error', function() {
					beforeEach(async function() {
						resolvedValue = await runner.run(options, pa11y);
					});

					it('does not cap incomplete issues, leaving them at error level', function() {
						const incompleteIssues = resolvedValue.filter(issue => issue.code === 'mock-id-4');
						assert.strictEqual(incompleteIssues.length, 2);
						assert.strictEqual(incompleteIssues[0].type, 'error');
						assert.strictEqual(incompleteIssues[1].type, 'error');
					});
				});
			});
		});

		describe('when axe errors', function() {
			let axeError;
			let rejectedError;

			beforeEach(async function() {
				axeError = new Error('axe error');
				window.axe.run.reset();
				window.axe.run.rejects(axeError);
				try {
					await runner.run(options, pa11y);
				} catch (error) {
					rejectedError = error;
				}
			});

			it('rejects with the axe error', function() {
				assert.strictEqual(rejectedError, axeError);
			});

		});

	});

	describe('.run(options, pa11y) runnerExtras capture for incomplete issues', function() {
		let element;
		let style;
		let beforeStyle;
		let afterStyle;

		// One incomplete issue whose single node carries the given checks
		// (e.g. {any: [...]}). The selector resolves to `element`.
		function incomplete(checks) {
			return {
				violations: [],
				incomplete: [
					{
						id: 'mock-id',
						description: 'd',
						impact: 'minor',
						help: 'h',
						helpUrl: 'u',
						nodes: [Object.assign({target: ['mock-selector']}, checks)]
					}
				]
			};
		}

		async function captureFor(checks) {
			global.window.axe.run = sinon.stub().resolves(incomplete(checks));
			const resolved = await runner.run({}, {});
			return resolved[0].runnerExtras;
		}

		beforeEach(function() {
			element = {
				getBoundingClientRect: sinon.stub().returns(
					{x: 10,
						y: 20,
						width: 100,
						height: 30}
				)
			};
			style = {
				color: 'rgb(10, 20, 30)',
				backgroundClip: 'border-box',
				webkitBackgroundClip: '',
				backgroundImage: 'none',
				backgroundColor: 'rgba(0, 0, 0, 0)',
				getPropertyValue: sinon.stub().returns('')
			};
			beforeStyle = {content: 'none',
				color: 'rgb(0, 0, 0)'};
			afterStyle = {content: 'none',
				color: 'rgb(0, 0, 0)'};
			global.window.document.querySelector = sinon.stub().returns(element);
			// Read the closure vars lazily so per-test mutations/reassignments apply.
			global.window.getComputedStyle = sinon.stub().callsFake((el, pseudo) => {
				if (pseudo === '::before') {
					return beforeStyle;
				}
				if (pseudo === '::after') {
					return afterStyle;
				}
				return style;
			});
		});

		it('captures cssFg and bbox for an incomplete node', async function() {
			const extras = await captureFor();
			assert.strictEqual(extras.cssFg, 'rgb(10, 20, 30)');
			assert.deepEqual(extras.bbox, {x: 10,
				y: 20,
				width: 100,
				height: 30});
		});

		it('does not attach capture fields to violations', async function() {
			global.window.axe.run = sinon.stub().resolves({
				violations: [
					{
						id: 'v',
						description: 'd',
						impact: 'critical',
						help: 'h',
						helpUrl: 'u',
						nodes: [{target: ['mock-selector']}]
					}
				],
				incomplete: []
			});
			const extras = (await runner.run({}, {}))[0].runnerExtras;
			assert.isUndefined(extras.cssFg);
			assert.isUndefined(extras.bbox);
			assert.isUndefined(extras.axeData);
		});

		it('extracts axeData and trimmed axeRelatedNodes from the matching check', async function() {
			const data = {messageKey: 'bgImage',
				contrastRatio: 1};
			const extras = await captureFor({
				any: [
					{id: 'other',
						data: {nope: true},
						relatedNodes: []},
					{
						id: 'mock-id',
						data,
						relatedNodes: [{target: ['rel-1'],
							html: '<a>',
							extra: 'dropped'}]
					}
				]
			});
			assert.deepEqual(extras.axeData, data);
			assert.deepEqual(extras.axeRelatedNodes, [{target: ['rel-1'],
				html: '<a>'}]);
		});

		it('detects bgClip "text" and captures the gradient paint source (DEV-909)', async function() {
			style.backgroundClip = 'text';
			style.backgroundImage =
				'linear-gradient(to right, rgb(4, 120, 87), rgb(234, 88, 12))';
			style.backgroundColor = 'rgb(255, 255, 255)';
			const extras = await captureFor();
			assert.strictEqual(extras.bgClip, 'text');
			assert.strictEqual(
				extras.bgImage,
				'linear-gradient(to right, rgb(4, 120, 87), rgb(234, 88, 12))'
			);
			assert.strictEqual(extras.bgColor, 'rgb(255, 255, 255)');
		});

		it('detects bgClip "text" via -webkit-background-clip', async function() {
			style.backgroundClip = 'border-box';
			style.webkitBackgroundClip = 'text';
			style.backgroundImage =
				'linear-gradient(to right, rgb(0, 0, 0), rgb(1, 1, 1))';
			const extras = await captureFor();
			assert.strictEqual(extras.bgClip, 'text');
			assert.strictEqual(
				extras.bgImage,
				'linear-gradient(to right, rgb(0, 0, 0), rgb(1, 1, 1))'
			);
		});

		it('does not capture a paint source when not clipped to text', async function() {
			style.backgroundClip = 'border-box';
			style.backgroundImage =
				'linear-gradient(to right, rgb(0, 0, 0), rgb(1, 1, 1))';
			const extras = await captureFor();
			assert.strictEqual(extras.bgClip, 'border-box');
			assert.isUndefined(extras.bgImage);
			assert.isUndefined(extras.bgColor);
		});

		it('captures pseudo styles only for pseudoContent issues', async function() {
			beforeStyle = {content: '"\\2605"',
				color: 'rgb(1, 2, 3)'};
			const extras = await captureFor({
				any: [{id: 'mock-id',
					data: {messageKey: 'pseudoContent'},
					relatedNodes: []}]
			});
			assert.deepEqual(extras.pseudoBefore, {color: 'rgb(1, 2, 3)',
				content: '"\\2605"'});
			assert.isUndefined(extras.pseudoAfter);
		});

		it('does not read pseudo styles when messageKey is not pseudoContent', async function() {
			beforeStyle = {content: '"\\2605"',
				color: 'rgb(1, 2, 3)'};
			const extras = await captureFor({
				any: [{id: 'mock-id',
					data: {messageKey: 'fgColor'},
					relatedNodes: []}]
			});
			assert.isUndefined(extras.pseudoBefore);
		});

		it('degrades to null fields when a DOM read throws', async function() {
			global.window.getComputedStyle = sinon.stub().throws(new Error('detached'));
			const extras = await captureFor();
			assert.isNull(extras.cssFg);
			assert.isNull(extras.bgClip);
			assert.isNull(extras.bbox);
		});
	});

	describe('lib/runners/axe background detection', function() {
		let originalWindow;
		let runner;
		let styleMap;

		function fakeStyle(overrides = {}) {
			return Object.assign({
				color: 'rgb(255, 255, 255)',
				backgroundClip: 'border-box',
				webkitBackgroundClip: '',
				backgroundImage: 'none',
				backgroundColor: 'rgba(0, 0, 0, 0)',
				opacity: '1',
				display: 'block',
				visibility: 'visible',
				position: 'static',
				overflow: 'visible',
				content: 'none',
				getPropertyValue: () => ''
			}, overrides);
		}

		function fakeEl(config = {}) {
			const rect = config.rect || {x: 10,
				y: 10,
				width: 100,
				height: 30};
			const el = {
				nodeType: 1,
				tagName: config.tagName || 'DIV',
				parentElement: config.parentElement || null,
				textContent: config.textContent || '',
				complete: config.complete,
				naturalWidth: config.naturalWidth,
				readyState: config.readyState,
				value: config.value,
				placeholder: config.placeholder,
				mediaChildren: config.media || [],
				lazyChildren: config.lazies || [],
				slotChildren: config.slots || [],
				innerMedia: config.innerMedia || null,
				getBoundingClientRect() {
					return {
						x: rect.x,
						y: rect.y,
						width: rect.width,
						height: rect.height,
						left: rect.x,
						top: rect.y,
						right: rect.x + rect.width,
						bottom: rect.y + rect.height
					};
				},
				contains() {
					return false;
				},
				getAttribute(name) {
					return (config.attrs || {})[name] || null;
				},
				hasAttribute(name) {
					return Boolean(config.attrs && Object.prototype.hasOwnProperty.call(config.attrs, name));
				},
				querySelectorAll(selector) {
					if (selector.indexOf('data-src') !== -1) {
						return el.lazyChildren;
					}
					if (selector.indexOf('picture') !== -1) {
						return el.slotChildren;
					}
					return el.mediaChildren;
				},
				querySelector() {
					return el.innerMedia;
				}
			};
			el.placeholderStyle = config.placeholderStyle || null;
			styleMap.set(el, fakeStyle(config.style));
			return el;
		}

		async function detect(element, options = {}) {
			global.window.innerWidth = options.innerWidth || 1000;
			global.window.innerHeight = options.innerHeight || 800;
			global.window.document.elementsFromPoint = sinon.stub().returns(options.elementsFromPoint || []);
			global.window.document.querySelector = sinon.stub().returns(element);
			const check = {
				id: 'color-contrast',
				data: {messageKey: options.messageKey || 'bgColor'},
				relatedNodes: []
			};
			global.window.axe.run = sinon.stub().resolves({
				violations: [],
				incomplete: [
					{
						id: 'color-contrast',
						description: 'd',
						impact: 'serious',
						help: 'h',
						helpUrl: 'u',
						nodes: [{target: ['sel'],
							any: [check]}]
					}
				]
			});
			const resolved = await runner.run({}, {});
			return resolved[0].runnerExtras;
		}

		beforeEach(function() {
			styleMap = new Map();
			originalWindow = global.window;
			global.window = {
				axe: {
					run: sinon.stub(),
					getRules: sinon.stub().returns([])
				},
				document: {
					querySelector: sinon.stub(),
					documentElement: {nodeType: 9,
						querySelectorAll: () => [],
						getAttribute: () => null},
					body: {nodeType: 1,
						querySelectorAll: () => [],
						getAttribute: () => null}
				}
			};
			global.window.getComputedStyle = sinon.stub().callsFake((el, pseudo) => {
				if (pseudo === '::placeholder') {
					return (el && el.placeholderStyle) || fakeStyle();
				}
				if (pseudo === '::before' || pseudo === '::after') {
					return fakeStyle({content: 'none'});
				}
				return styleMap.get(el) || fakeStyle();
			});
			runner = require('../../../../lib/runners/axe');
		});

		afterEach(function() {
			global.window = originalWindow;
		});

		it('stamps bgDetectVersion on every color-contrast incomplete', async function() {
			const el = fakeEl({tagName: 'H3',
				parentElement: global.window.document.documentElement});
			const extras = await detect(el);
			assert.strictEqual(extras.bgDetectVersion, 'geom-1');
		});

		it('flags a stacked <video> that has not decoded a frame (bgMediaReady false)', async function() {
			const video = fakeEl({tagName: 'VIDEO',
				readyState: 1});
			const el = fakeEl({tagName: 'H3',
				parentElement: global.window.document.documentElement});
			const extras = await detect(el, {elementsFromPoint: [video]});
			assert.isTrue(extras.bgImageBehind);
			assert.strictEqual(extras.bgMediaType, 'video');
			assert.isFalse(extras.bgMediaReady);
		});

		it('treats a stacked url() background layer as an image with no observable load state', async function() {
			const urlLayer = fakeEl({style: {backgroundImage: 'url(x.png)'}});
			const el = fakeEl({tagName: 'H3',
				parentElement: global.window.document.documentElement});
			const extras = await detect(el, {elementsFromPoint: [urlLayer]});
			assert.strictEqual(extras.bgMediaType, 'image');
			assert.isUndefined(extras.bgMediaReady);
		});

		it('flags a url() background on an ancestor, passing through a see-through gradient', async function() {
			const urlAncestor = fakeEl({
				parentElement: global.window.document.documentElement,
				style: {backgroundImage: 'url(hero.png)'}
			});
			const gradientAncestor = fakeEl({
				parentElement: urlAncestor,
				style: {backgroundImage: 'linear-gradient(to top, rgba(0, 0, 0, 0.4), transparent)'}
			});
			const el = fakeEl({tagName: 'H3',
				parentElement: gradientAncestor});
			const extras = await detect(el);
			assert.isTrue(extras.bgImageBehind);
			assert.strictEqual(extras.bgMediaType, 'image');
		});

		it('stops at an opaque colour ancestor without flagging a background', async function() {
			const solid = fakeEl({
				parentElement: global.window.document.documentElement,
				style: {backgroundColor: 'rgb(5, 5, 5)'}
			});
			const el = fakeEl({tagName: 'H3',
				parentElement: solid});
			const extras = await detect(el);
			assert.isUndefined(extras.bgImageBehind);
			assert.strictEqual(extras.bgDetectVersion, 'geom-1');
		});

		it('detects a covering <img> below the fold via geometry and reports it loaded', async function() {
			const img = fakeEl({
				tagName: 'IMG',
				complete: true,
				naturalWidth: 800,
				rect: {x: 0,
					y: 0,
					width: 2000,
					height: 9000}
			});
			const card = fakeEl({parentElement: global.window.document.body,
				media: [img]});
			const el = fakeEl({tagName: 'H3',
				parentElement: card,
				rect: {x: 100,
					y: 5000,
					width: 200,
					height: 20}});
			const extras = await detect(el);
			assert.strictEqual(extras.bgMediaType, 'image');
			assert.isTrue(extras.bgMediaReady);
		});

		it('flags an aria-busy region as dynamic content', async function() {
			const el = fakeEl({
				tagName: 'H3',
				parentElement: global.window.document.documentElement,
				attrs: {'aria-busy': 'true'}
			});
			const extras = await detect(el);
			assert.strictEqual(extras.bgDynamicSignal, 'aria-busy');
		});

		it('flags a lazy-load placeholder covering the text (data-* marker)', async function() {
			const lazy = fakeEl({
				rect: {x: 0,
					y: 0,
					width: 400,
					height: 400},
				attrs: {'data-bg': '/hero.jpg'}
			});
			const card = fakeEl({parentElement: global.window.document.documentElement,
				lazies: [lazy]});
			const el = fakeEl({tagName: 'H3',
				parentElement: card});
			const extras = await detect(el);
			assert.strictEqual(extras.bgDynamicSignal, 'lazy-attr');
		});

		it('flags an in-flight opacity transition as dynamic content (DEV-1200)', async function() {
			const el = fakeEl({tagName: 'H3',
				parentElement: global.window.document.documentElement});
			el.getAnimations = () => [{playState: 'running',
				transitionProperty: 'opacity'}];
			const extras = await detect(el);
			assert.strictEqual(extras.bgDynamicSignal, 'opacity-animation');
		});

		it('flags a transition of "all" that includes opacity (DEV-1200)', async function() {
			const el = fakeEl({tagName: 'H3',
				parentElement: global.window.document.documentElement});
			el.getAnimations = () => [{playState: 'running',
				transitionProperty: 'all'}];
			const extras = await detect(el);
			assert.strictEqual(extras.bgDynamicSignal, 'opacity-animation');
		});

		it('flags a WAAPI animation whose keyframes tween opacity (DEV-1200)', async function() {
			const el = fakeEl({tagName: 'H3',
				parentElement: global.window.document.documentElement});
			el.getAnimations = () => [{
				playState: 'running',
				effect: {getKeyframes: () => [{opacity: 0},
					{opacity: 1}]}
			}];
			const extras = await detect(el);
			assert.strictEqual(extras.bgDynamicSignal, 'opacity-animation');
		});

		it('flags a will-change:opacity reveal caught mid-fade with no Animation object (DEV-1200)', async function() {
			const el = fakeEl({
				tagName: 'H3',
				parentElement: global.window.document.documentElement,
				style: {willChange: 'opacity',
					opacity: '0.2'}
			});
			const extras = await detect(el);
			assert.strictEqual(extras.bgDynamicSignal, 'opacity-animation');
			assert.strictEqual(extras.opacity, 0.2);
		});

		it('does not flag a transition that leaves opacity alone (DEV-1200)', async function() {
			const el = fakeEl({tagName: 'H3',
				parentElement: global.window.document.documentElement});
			el.getAnimations = () => [{playState: 'running',
				transitionProperty: 'transform'}];
			const extras = await detect(el);
			assert.isUndefined(extras.bgDynamicSignal);
		});

		it('does not flag a WAAPI animation that never touches opacity (DEV-1200)', async function() {
			const el = fakeEl({tagName: 'H3',
				parentElement: global.window.document.documentElement});
			el.getAnimations = () => [{
				playState: 'running',
				effect: {getKeyframes: () => [{transform: 'translateY(0)'}]}
			}];
			const extras = await detect(el);
			assert.isUndefined(extras.bgDynamicSignal);
		});

		it('does not flag a finished (idle) opacity animation (DEV-1200)', async function() {
			const el = fakeEl({tagName: 'H3',
				parentElement: global.window.document.documentElement});
			el.getAnimations = () => [{playState: 'idle',
				transitionProperty: 'opacity'}];
			const extras = await detect(el);
			assert.isUndefined(extras.bgDynamicSignal);
		});

		it('does not flag will-change:opacity once the value has settled (DEV-1200)', async function() {
			const el = fakeEl({
				tagName: 'H3',
				parentElement: global.window.document.documentElement,
				style: {willChange: 'opacity',
					opacity: '1'}
			});
			const extras = await detect(el);
			assert.isUndefined(extras.bgDynamicSignal);
		});

		it('tolerates getAnimations throwing, falling back to no signal (DEV-1200)', async function() {
			const el = fakeEl({tagName: 'H3',
				parentElement: global.window.document.documentElement});
			el.getAnimations = () => {
				throw new Error('detached');
			};
			const extras = await detect(el);
			assert.isUndefined(extras.bgDynamicSignal);
		});

		it('flags an unmarked empty media-slot skeleton (Tier 2) for a bgGradient incomplete', async function() {
			const slot = fakeEl({
				rect: {x: 0,
					y: 0,
					width: 200,
					height: 200},
				style: {position: 'absolute',
					backgroundColor: 'rgb(230, 230, 230)'}
			});
			const tile = fakeEl({
				parentElement: global.window.document.documentElement,
				style: {position: 'relative',
					overflow: 'hidden'},
				rect: {x: 0,
					y: 0,
					width: 200,
					height: 200},
				slots: [slot]
			});
			const el = fakeEl({tagName: 'H3',
				parentElement: tile,
				rect: {x: 40,
					y: 20,
					width: 120,
					height: 15}});
			const extras = await detect(el, {messageKey: 'bgGradient'});
			assert.strictEqual(extras.bgDynamicSignal, 'empty-slot');
		});

		it('captures an empty input placeholder colour as the foreground', async function() {
			const el = fakeEl({
				tagName: 'INPUT',
				value: '',
				placeholder: 'Search',
				parentElement: global.window.document.documentElement
			});
			el.placeholderStyle = fakeStyle({color: 'rgb(120, 120, 120)',
				opacity: '0.5'});
			const extras = await detect(el);
			assert.strictEqual(extras.placeholderColor, 'rgb(120, 120, 120)');
			assert.strictEqual(extras.placeholderOpacity, 0.5);
		});

		it('reports a stacked <canvas> as media treated as ready (no observable load state)', async function() {
			const canvas = fakeEl({tagName: 'CANVAS'});
			const el = fakeEl({tagName: 'H3',
				parentElement: global.window.document.documentElement});
			const extras = await detect(el, {elementsFromPoint: [canvas]});
			assert.strictEqual(extras.bgMediaType, 'canvas');
			assert.isTrue(extras.bgMediaReady);
		});

		it('does not flag media when the stacked layer is an opaque colour', async function() {
			const opaque = fakeEl({style: {backgroundColor: 'rgb(20, 20, 20)'}});
			const el = fakeEl({tagName: 'H3',
				parentElement: global.window.document.documentElement});
			const extras = await detect(el, {elementsFromPoint: [opaque]});
			assert.isUndefined(extras.bgMediaType);
			assert.isUndefined(extras.bgDynamicSignal);
		});

		it('stops the geometry walk at a clip container with no covering media', async function() {
			const clip = fakeEl({parentElement: global.window.document.body,
				style: {overflow: 'hidden'}});
			const el = fakeEl({tagName: 'H3',
				parentElement: clip,
				rect: {x: 100,
					y: 5000,
					width: 200,
					height: 20}});
			const extras = await detect(el);
			assert.isUndefined(extras.bgMediaType);
		});

		it('walks the geometry chain to the body without finding covering media', async function() {
			const mid = fakeEl({parentElement: global.window.document.body});
			const el = fakeEl({tagName: 'H3',
				parentElement: mid,
				rect: {x: 100,
					y: 5000,
					width: 200,
					height: 20}});
			const extras = await detect(el);
			assert.isUndefined(extras.bgMediaType);
		});

		it('does not flag Tier 2 when no clip container is found before the body', async function() {
			const plain = fakeEl({parentElement: global.window.document.body});
			const el = fakeEl({tagName: 'H3',
				parentElement: plain,
				rect: {x: 40,
					y: 20,
					width: 120,
					height: 15}});
			const extras = await detect(el, {messageKey: 'bgImage'});
			assert.isUndefined(extras.bgDynamicSignal);
		});

		it('captures ::after pseudo styles for a pseudoContent incomplete', async function() {
			const el = fakeEl({tagName: 'H3',
				parentElement: global.window.document.documentElement});
			global.window.getComputedStyle = sinon.stub().callsFake((node, pseudo) => {
				if (pseudo === '::after') {
					return fakeStyle({content: '"x"',
						color: 'rgb(9, 9, 9)'});
				}
				if (pseudo === '::before') {
					return fakeStyle({content: 'none'});
				}
				if (pseudo === '::placeholder') {
					return fakeStyle();
				}
				return styleMap.get(node) || fakeStyle();
			});
			const extras = await detect(el, {messageKey: 'pseudoContent'});
			assert.deepEqual(extras.pseudoAfter, {color: 'rgb(9, 9, 9)',
				content: '"x"'});
		});
	});
});
