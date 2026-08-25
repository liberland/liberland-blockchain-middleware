"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const formatDate = require("../src/utils/format-date");

// formatDate returns the parts as an array, not a string. This is deliberate:
// src/utils/generate-pdf/files/certificate.ejs renders it with `date.join('.')`.
// Changing the return type to a string would silently break the incorporation
// certificate PDF, so the contract is pinned here.
test("formatDate returns [year, month, day] as zero-padded parts", () => {
	assert.deepEqual(formatDate(new Date(2026, 6, 5)), ["2026", "07", "05"]);
});

test("formatDate pads single-digit months and days to two characters", () => {
	assert.deepEqual(formatDate(new Date(2026, 0, 1)), ["2026", "01", "01"]);
	assert.deepEqual(formatDate(new Date(2026, 8, 9)), ["2026", "09", "09"]);
});

test("formatDate leaves already-wide components alone", () => {
	assert.deepEqual(formatDate(new Date(2026, 10, 25)), ["2026", "11", "25"]);
});

test("formatDate output joins into the format the certificate expects", () => {
	assert.equal(formatDate(new Date(2026, 6, 5)).join("."), "2026.07.05");
});
