"use strict";

const { createSign } = require("crypto");
const { readFileSync, existsSync } = require("fs");
const path = require("path");

const DEFAULT_KEY_PATH = path.join(__dirname, "..", "..", "private_key.pem");

/**
 * Serialize a callback payload to the exact bytes that go on the wire.
 *
 * `node-webhooks` transmits `JSON.stringify(payload)`, so a signature is only
 * verifiable if it covers that same string. Signing a different serialization of
 * the same object -- a canonical or key-sorted one, for instance -- produces a
 * signature the receiver cannot check against the body it received.
 */
function serializePayload(payload) {
	return JSON.stringify(payload);
}

/**
 * Sign the serialized body with the deployment's RSA key.
 *
 * Returns null when no key is configured, so the caller can decide whether an
 * unsigned delivery is acceptable. See the README for key generation.
 */
function signBody(body, keyPath = DEFAULT_KEY_PATH) {
	if (!existsSync(keyPath)) {
		return null;
	}

	const sign = createSign("SHA256");
	sign.update(body);
	sign.end();

	return sign.sign(readFileSync(keyPath, "utf8"), "base64");
}

module.exports = { serializePayload, signBody, DEFAULT_KEY_PATH };
