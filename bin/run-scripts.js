#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const directoryPath = process.argv[2];
process.stdin.setEncoding('utf8');

/**
 * Determines whether the provided file is a directory.
 * @param {string} dirPath
 * @returns {boolean}
 */
function isDirectory(dirPath) {
	return fs.lstatSync(dirPath).isDirectory();
}

/**
 * Determines whether the provided file is a regular file.
 * @param {string} filePath
 * @returns {boolean}
 */
function isFile(filePath) {
	return fs.lstatSync(filePath).isFile();
}

/**
 * Determines whether the provided file is executable by the current user.
 * @param {string} execPath
 * @returns {boolean}
 */
function isExecutable(execPath) {
	const stats = fs.lstatSync(execPath);
	/* eslint-disable no-bitwise */
	return (
		stats.mode & fs.constants.S_IXOTH ||
		(stats.mode & fs.constants.S_IXGRP &&
			process.getgid &&
			stats.gid === process.getgid()) ||
		(stats.mode & fs.constants.S_IXUSR &&
			process.getuid &&
			stats.uid === process.getuid())
	);
	/* eslint-enable no-bitwise */
}

/**
 * Properly handles errors in the script.
 * @param {Error} error
 */
function handleError(error) {
	if (error && error.message) {
		console.error(error.message);
	}
	process.exit(1);
}

/**
 * Returns the command usage information.
 */
function getUsageMessage() {
	return `Usage: ${path.basename(__filename)} <path to scripts directory>`;
}

try {
	if (!directoryPath) {
		throw new Error(getUsageMessage());
	} else if (!fs.existsSync(directoryPath)) {
		throw new Error('The provided path does not exist.');
	} else if (!isDirectory(directoryPath)) {
		throw new Error('The provided path is not to a directory.');
	}

	const filesInDir = fs.readdirSync(directoryPath);
	const scripts = filesInDir
		.map((file) => path.resolve(directoryPath, file))
		.filter((file) => {
			const isRegularFile = isFile(file);
			const isExecutableFile = isExecutable(file);

			if (isRegularFile && !isExecutableFile) {
				console.warn(`Skipping non-executable file: ${file}`);
			}

			return isRegularFile && isExecutableFile;
		});

	const runScripts = (input) => {
		try {
			scripts.forEach((script) => {
				execFileSync(script, [], {
					input,
					stdio: ['pipe', 'inherit', 'inherit'],
					encoding: 'utf8',
				});
			});
		} catch (e) {
			handleError(new Error());
		}
	};

	if (process.stdin.isTTY) {
		runScripts();
	} else {
		let input;
		process.stdin.on('readable', () => {
			let chunk;
			let hasReadData = false;

			while ((chunk = process.stdin.read()) !== null) {
				input += chunk;
				hasReadData = true;
			}
			if (hasReadData) {
				return;
			}

			// Run scripts when all the input data has been read
			runScripts(input);
		});
	}
} catch (e) {
	handleError(e);
}
