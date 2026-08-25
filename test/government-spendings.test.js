"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { formatSpendings } = require("../src/utils/government-spendings");

const HEADER = [
	"Timestamp",
	"Recipient",
	"Asset",
	"Value",
	"Category",
	"Project",
	"Supplier",
	"Description",
	"Final Destination",
	"Amount In USD At Date Of Payment",
	"Date",
	"Currency",
	"Text Remark",
	"Raw Remark",
	"Block Number",
];

// formatSpendings only touches `api.createType`, and only for remarks that
// decompress successfully. A stub is enough for every case below.
const stubApi = (remarkInfo) => ({
	createType: () => ({ toJSON: () => remarkInfo }),
});

const spending = (overrides) => ({
	block: { timestamp: "2026-07-05T00:00:00Z", number: 42 },
	toId: "5Recipient",
	asset: "LLD",
	value: "1000000000000",
	remark: null,
	...overrides,
});

test("formatSpendings emits the CSV header as the first row", () => {
	const rows = formatSpendings(stubApi({}), []);
	assert.equal(rows.length, 1);
	assert.deepEqual(rows[0], HEADER);
});

test("formatSpendings keeps every row the same width as the header", () => {
	const rows = formatSpendings(stubApi({}), [spending({}), spending({})]);
	assert.equal(rows.length, 3);
	for (const row of rows) {
		assert.equal(row.length, HEADER.length);
	}
});

test('formatSpendings fills remark columns with "-" when there is no remark', () => {
	const [, row] = formatSpendings(stubApi({}), [spending({ remark: null })]);
	assert.deepEqual(row, [
		"2026-07-05T00:00:00Z",
		"5Recipient",
		"LLD",
		"1000000000000",
		"-",
		"-",
		"-",
		"-",
		"-",
		"-",
		"-",
		"-",
		"-",
		null,
		42,
	]);
});

test("formatSpendings falls back to a utf-8 text remark when decompression fails", () => {
	// Not zlib data, so pako.inflate throws and the catch path decodes the hex
	// payload (minus the 0x prefix) as plain text.
	const raw = `0x${Buffer.from("paid in full", "utf-8").toString("hex")}`;
	const [, row] = formatSpendings(stubApi({}), [spending({ remark: raw })]);

	assert.equal(row[12], "paid in full", "text remark column");
	assert.equal(row[13], raw, "raw remark column is preserved verbatim");
	// The structured columns stay empty on this path.
	assert.deepEqual(row.slice(4, 12), [
		"-",
		"-",
		"-",
		"-",
		"-",
		"-",
		"-",
		"-",
	]);
});

test("formatSpendings preserves the raw remark alongside parsed values", () => {
	const rows = formatSpendings(stubApi({}), [
		spending({ remark: "0xdeadbeef" }),
	]);
	assert.equal(rows[1][13], "0xdeadbeef");
});
