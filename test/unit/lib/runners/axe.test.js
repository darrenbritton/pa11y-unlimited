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

});
