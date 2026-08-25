"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
	hasNull,
	isEmpty,
	deepMerge,
	parsePackageJsonMultiline,
	formatLLDWithDecimals,
} = require("../src/utils/common");

test("hasNull", async (t) => {
	await t.test("reports a missing key", () => {
		assert.equal(hasNull({ a: 1 }, ["a", "b"]), true);
	});

	await t.test("reports nothing when every required key is truthy", () => {
		assert.equal(hasNull({ a: 1, b: "x" }, ["a", "b"]), false);
	});

	await t.test("reports nothing when no keys are required", () => {
		assert.equal(hasNull({}, []), false);
	});

	// The implementation tests falsiness, not nullness, so 0, '' and false are
	// all reported as "null". Callers must not rely on this to validate fields
	// whose legitimate value can be falsy.
	await t.test("treats falsy values as null", () => {
		assert.equal(hasNull({ a: 0 }, ["a"]), true);
		assert.equal(hasNull({ a: "" }, ["a"]), true);
		assert.equal(hasNull({ a: false }, ["a"]), true);
	});
});

test("isEmpty", async (t) => {
	await t.test("is true only for null and undefined", () => {
		assert.equal(isEmpty(null), true);
		assert.equal(isEmpty(undefined), true);
	});

	await t.test("is false for falsy values that are not nullish", () => {
		assert.equal(isEmpty(0), false);
		assert.equal(isEmpty(""), false);
		assert.equal(isEmpty(false), false);
	});
});

test("deepMerge", async (t) => {
	await t.test("merges nested objects instead of replacing them", () => {
		assert.deepEqual(deepMerge({ a: { b: 1 } }, { a: { c: 2 } }), {
			a: { b: 1, c: 2 },
		});
	});

	await t.test("applies sources left to right", () => {
		assert.deepEqual(deepMerge({}, { a: 1 }, { b: 2 }), { a: 1, b: 2 });
		assert.deepEqual(deepMerge({}, { a: 1 }, { a: 2 }), { a: 2 });
	});

	await t.test("mutates and returns the target", () => {
		const target = { a: 1 };
		assert.equal(deepMerge(target, { b: 2 }), target);
		assert.deepEqual(target, { a: 1, b: 2 });
	});

	// Arrays are values, not containers, for merging purposes.
	await t.test("replaces arrays rather than concatenating them", () => {
		assert.deepEqual(deepMerge({ a: [1, 2] }, { a: [3] }), { a: [3] });
	});

	await t.test("overwrites a falsy target key with an object source", () => {
		assert.deepEqual(deepMerge({ a: 0 }, { a: { b: 1 } }), { a: { b: 1 } });
	});

	await t.test("returns a non-object target untouched", () => {
		assert.equal(deepMerge(5, { a: 1 }), 5);
	});
});

test("parsePackageJsonMultiline", async (t) => {
	await t.test(
		"returns the input unchanged when it is not valid JSON",
		() => {
			assert.equal(parsePackageJsonMultiline("plain"), "plain");
		}
	);

	await t.test("returns the input unchanged for an unescaped newline", () => {
		// A literal newline inside a JSON string is invalid, so this falls back.
		const raw = '"a\nb"';
		assert.equal(parsePackageJsonMultiline(raw), raw);
	});

	await t.test("unquotes a properly escaped JSON string", () => {
		assert.equal(parsePackageJsonMultiline('"a\\nb"'), "a\nb");
	});

	// Worth knowing: this does not only unquote strings, it parses any JSON,
	// so numeric strings come back as numbers.
	await t.test("parses numeric input into a number", () => {
		assert.equal(parsePackageJsonMultiline("42"), 42);
	});
});

test("formatLLDWithDecimals", async (t) => {
	await t.test("formats a whole LLD at 12 decimals", () => {
		assert.equal(formatLLDWithDecimals("1000000000000"), "1.000000000000");
	});

	await t.test("formats zero", () => {
		assert.equal(formatLLDWithDecimals("0"), "0");
	});

	await t.test("keeps full precision for the smallest unit", () => {
		assert.equal(formatLLDWithDecimals("1"), "0.000000000001");
	});

	await t.test("emits no thousands separators", () => {
		const formatted = formatLLDWithDecimals("1234567890123456");
		assert.equal(formatted, "1234.567890123456");
		assert.ok(!formatted.includes(","), "must be safe to embed in CSV");
	});
});
