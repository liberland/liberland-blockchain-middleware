'use strict';

function hasNull(target, requiredKeys) {
	for (const member of requiredKeys) {
		if (!target[member]) return true;
	}
	return false;
}

/**
 * Checks to see whether the passed-in value is empty.
 * @param item
 * @returns {boolean}
 */
function isEmpty(item) {
	return item === null || typeof item === 'undefined';
}

/**
 * Simple object check.
 * @param item
 * @returns {boolean}
 */
function isObject(item) {
	return item !== null && typeof item === 'object' && !Array.isArray(item);
}

/**
 * Deeply merge two objects.
 * @param target
 * @param ...sources
 */
/* eslint-disable no-param-reassign */
function deepMerge(target, ...sources) {
	if (!sources.length) {
		return target;
	}
	const source = sources.shift();

	if (isObject(target) && isObject(source)) {
		for (const key of Object.keys(source)) {
			if (isObject(source[key])) {
				if (!target[key]) {
					target[key] = {};
				}
				deepMerge(target[key], source[key]);
			} else {
				target[key] = source[key];
			}
		}
	}

	return deepMerge(target, ...sources);
}
/* eslint-enable no-param-reassign */

// Note: This function is needed because there's a bug in the way NPM handles
//       configuration values specified in the package.json file that have
//       newlines in them. It runs JSON.stringify on the values that do (when
//       it shouldn't), so this function undoes that where necessary.
// TODO: Remove this function and its usages when the NPM version is upgraded to
//       7+, where this bug doesn't exist.
function parsePackageJsonMultiline(value) {
	try {
		return JSON.parse(value);
	} catch (e) {
		return value;
	}
}

module.exports = {
	hasNull,
	isEmpty,
	deepMerge,
	parsePackageJsonMultiline,
};
