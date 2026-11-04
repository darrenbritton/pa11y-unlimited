/* eslint-disable no-invalid-this */
'use strict';

const assert = require('proclaim');
const runPa11yCli = require('../helper/pa11y-cli');

// `includePasses` has no CLI flag; the CLI picks it up from a config file.
function runWithAxe({includePasses, extraArguments = []} = {}) {
	return runPa11yCli(`${global.mockWebsiteAddress}/include-passes`, {
		arguments: [
			'--runner', 'axe',
			'--reporter', 'json',
			...includePasses ? ['--config', './mock/config/include-passes.json'] : [],
			...extraArguments
		]
	});
}

const isPass = issue => issue.type === 'pass';

describe('CLI include passes (axe-only)', function() {
	before(async function() {
		this.off = await runWithAxe();
		this.on = await runWithAxe({includePasses: true});
	});

	describe('when `includePasses` is not set', function() {
		it('outputs only the violation, without any pass fields', function() {
			assert.deepEqual(
				this.off.json.map(({code, type, typeCode, selector}) => ({code,
					type,
					typeCode,
					selector})),
				[
					{
						code: 'image-alt',
						type: 'error',
						typeCode: 1,
						selector: 'html > body > main > div > img'
					}
				]
			);
			assert.isFalse('isPass' in this.off.json[0].runnerExtras);
		});

		it('exits with a code of `2` for the violation', function() {
			assert.strictEqual(this.off.exitCode, 2);
		});
	});

	describe('when `includePasses` is `true`', function() {
		before(function() {
			this.passes = this.on.json.filter(isPass);
		});

		it('outputs the same violations as without it, before any pass', function() {
			const firstPass = this.on.json.findIndex(isPass);
			assert.deepEqual(this.on.json.slice(0, firstPass), this.off.json);
			assert.isTrue(this.on.json.slice(firstPass).every(isPass));
		});

		it('outputs passes typed `pass` with a `typeCode` of 4', function() {
			assert.isTrue(this.passes.length > 0);
			for (const pass of this.passes) {
				assert.strictEqual(pass.type, 'pass');
				assert.strictEqual(pass.typeCode, 4);
				assert.strictEqual(pass.runner, 'axe');
			}
		});

		it('flags every pass with `isPass`, a null impact and no needs-review capture', function() {
			for (const pass of this.passes) {
				assert.isTrue(pass.runnerExtras.isPass);
				assert.isNull(pass.runnerExtras.impact);
				assert.isFalse(pass.runnerExtras.needsFurtherReview);
				assert.isUndefined(pass.runnerExtras.bbox);
				assert.isUndefined(pass.runnerExtras.cssFg);
			}
		});

		it('reports a pass for the rule that fails on another element', function() {
			const imageAltPasses = this.passes.filter(({code}) => code === 'image-alt');
			assert.lengthEquals(imageAltPasses, 1);
			// The Pa11y selector format from getElementSelector, not axe's own `target`
			assert.strictEqual(imageAltPasses[0].selector, 'html > body > main > p > img');
			assert.strictEqual(
				imageAltPasses[0].context,
				'<img src="/path/to/described.jpg" alt="A described image">'
			);
		});

		it('gives a pass and a violation on the same element the same selector and context', function() {
			const [violation] = this.on.json.filter(issue => !isPass(issue));
			const passesOnSameElement = this.passes.filter(({selector}) => selector === violation.selector);
			assert.isTrue(passesOnSameElement.length > 0);
			for (const pass of passesOnSameElement) {
				assert.notStrictEqual(pass.code, violation.code);
				assert.strictEqual(pass.context, violation.context);
			}
		});

		it('is not affected by the `notice` and `warning` entries ignored by default', function() {
			// Neither --include-notices nor --include-warnings is passed in these runs
			assert.isTrue(this.passes.some(({code}) => code === 'html-has-lang'));
		});

		it('does not count passes towards `--level notice`', async function() {
			// One violation, permitted by the threshold; failing here would mean passes were counted
			const response = await runWithAxe({
				includePasses: true,
				extraArguments: ['--level', 'notice', '--threshold', '1']
			});
			assert.isTrue(response.json.filter(isPass).length > 1);
			assert.strictEqual(response.exitCode, 0);
		});

		it('labels passes in the CLI reporter', async function() {
			const response = await runPa11yCli(`${global.mockWebsiteAddress}/include-passes`, {
				arguments: [
					'--runner', 'axe',
					'--config', './mock/config/include-passes.json'
				]
			});
			assert.include(response.stdout, '• Pass:');
			assert.notInclude(response.stdout, 'undefined');
			assert.include(response.stdout, '1 Errors');
		});
	});
});
