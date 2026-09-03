"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { createVerify, generateKeyPairSync } = require("node:crypto");
const { mkdtempSync, writeFileSync, rmSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
	serializePayload,
	signBody,
	callbackHeaders,
} = require("../src/utils/callback-signature");

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
	modulusLength: 2048,
	privateKeyEncoding: { type: "pkcs8", format: "pem" },
	publicKeyEncoding: { type: "spki", format: "pem" },
});

function withKeyFile(run) {
	const dir = mkdtempSync(path.join(os.tmpdir(), "lld-callback-"));
	const keyPath = path.join(dir, "private_key.pem");
	writeFileSync(keyPath, privateKey);
	try {
		return run(keyPath);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

// Mirrors what node-webhooks puts on the wire: `JSON.stringify(jsonData)`.
function transmittedBody(payload) {
	return JSON.stringify(payload);
}

function verify(body, signature, key = publicKey) {
	const verifier = createVerify("SHA256");
	verifier.update(body);
	verifier.end();
	return verifier.verify(key, signature, "base64");
}

// Key order matters here: this is the order `processOrder` builds the payload in.
const payload = {
	toId: "5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1repo5EYjQX",
	price: "1000000000000",
	orderId: "42",
	assetId: "Native",
	remark: "Order #42",
	fromId: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
};

test("serializePayload produces the bytes node-webhooks transmits", () => {
	assert.strictEqual(serializePayload(payload), transmittedBody(payload));
});

test("the signature verifies against the transmitted body", () => {
	withKeyFile((keyPath) => {
		const body = serializePayload(payload);
		const signature = signBody(body, keyPath);

		assert.ok(signature, "expected a signature");
		assert.ok(verify(transmittedBody(payload), signature));
	});
});

test("a signature over a key-sorted body does not verify (the bug this fixes)", () => {
	withKeyFile((keyPath) => {
		// json-stable-stringify sorts keys; the wire format does not. Signing the
		// sorted form yields a signature the receiver cannot check.
		const sorted = JSON.stringify(payload, Object.keys(payload).sort());
		assert.notStrictEqual(sorted, transmittedBody(payload));

		const signature = signBody(sorted, keyPath);
		assert.strictEqual(verify(transmittedBody(payload), signature), false);
	});
});

test("a tampered body does not verify", () => {
	withKeyFile((keyPath) => {
		const signature = signBody(serializePayload(payload), keyPath);
		const tampered = transmittedBody({ ...payload, price: "1" });

		assert.strictEqual(verify(tampered, signature), false);
	});
});

test("the signature is sent under a header consumers read", () => {
	withKeyFile((keyPath) => {
		const signature = signBody(serializePayload(payload), keyPath);
		const headers = callbackHeaders(signature);

		// The WooCommerce gateway reads `signature`, then `x-signature`.
		assert.strictEqual(headers.signature, signature);
		// `secret` stays for a compatibility window.
		assert.strictEqual(headers.secret, signature);
	});
});

test("signBody returns null when no signing key is configured", () => {
	const missing = path.join(os.tmpdir(), "lld-callback-does-not-exist", "private_key.pem");
	assert.strictEqual(signBody("{}", missing), null);
});
