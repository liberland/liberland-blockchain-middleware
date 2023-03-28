#!/usr/bin/env node

'use strict';

/* eslint-disable import/no-extraneous-dependencies */
const chalk = require('chalk');
/* eslint-enable import/no-extraneous-dependencies */
const { execFileSync } = require('child_process');
const path = require('path');

const MESSAGE = {
	ABORT_COMMIT: 'Aborting commit...',
	INVALID_PATHS: 'The following file paths are invalid:',
	KEBAB_CASE_TRY_AGAIN:
		'Make sure they are all kebab-cased properly and try again.',
};

const EXTENSIONLESS_FILENAMES = [
	'INSTALL',
	'README',
	'LICENCE',
	'LICENSE',
	'CONTRIBUTING',
	'COPYRIGHT',
];

/**
 * Checks if a file path is valid
 * Note: In this case, "valid" is a file path that is properly kebab-cased (i.e., not camelCased/PascalCased/snake_cased).
 * @param  {string}  filePath The file path to test
 * @return {boolean}          Whether the file path is valid
 */
function isFilePathValid(filePath) {
	const disallowedPattern = /[A-Z_]/;
	// Check further if there are any uppercase characters in the file path
	if (disallowedPattern.test(filePath)) {
		// Only allow the following exceptions if the dirname part of the path is valid
		if (!disallowedPattern.test(path.dirname(filePath))) {
			// Ignore certain file types that need to / could have camelCased/PascalCased/snake_cased filenames
			if (
				/\.(md|markdown)$/.test(path.basename(filePath)) ||
				EXTENSIONLESS_FILENAMES.includes(path.basename(filePath)) ||
				// Allow leading underscore for Sass partials
				(/^_.+\.(scss|sass)$/.test(path.basename(filePath)) &&
					!disallowedPattern.test(
						path.basename(filePath).substring(1)
					))
			) {
				return true;
			}
		}

		// If none of the exceptions match, it's invalid
		return false;
	}

	return true;
}

const filesToBeCommitted = execFileSync(
	'git',
	['diff', '--cached', '--name-only', '--diff-filter=d'],
	{ encoding: 'utf8' }
)
	.trim()
	.split('\n');
const invalidFilePaths = [];

filesToBeCommitted.forEach((filePath) => {
	if (!isFilePathValid(filePath)) {
		invalidFilePaths.push(filePath);
	}
});

// If there are invalid paths, error out
if (invalidFilePaths.length) {
	console.error(`${MESSAGE.INVALID_PATHS}\n`);
	invalidFilePaths.forEach((invalidFilePath) => {
		console.error(chalk.red(`✖ ${invalidFilePath}`));
	});
	console.error(`\n${MESSAGE.KEBAB_CASE_TRY_AGAIN}\n`);
	console.error(chalk.red(MESSAGE.ABORT_COMMIT));
	process.exit(1);
} else {
	// Exit with success
	process.exit(0);
}
