'use strict';

const {defineConfig} = require('eslint/config');

const configPa11y = require('eslint-config-pa11y');

module.exports = defineConfig([
	configPa11y,
	{
		rules: {
			// `x`/`y` are standard DOMRect coordinate names (bbox capture in the axe runner).
			'id-length': ['error', {
				min: 2,
				exceptions: ['_', '$', 'i', 'x', 'y']
			}]
		}
	},
	{
		files: ['test/**/*.js', 'test/**/*.cjs'],
		rules: {
			'max-len': 'off',
			'prefer-arrow-callback': 'off',
			'max-statements': 'off',
			'func-style': 'off'
		}
	}
]);

