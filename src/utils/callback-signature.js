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

/**
 * Build the headers that carry the signature.
 *
 * Consumers look for `signature` (the WooCommerce gateway reads `signature`,
 * then `x-signature`). This middleware historically sent `secret`, which no
 * documented consumer reads, so the signature never reached a verifier. Both
 * names are emitted for now; `secret` can be dropped once integrations have
 * moved over.
 */
function callbackHeaders(signature) {
	return { signature, secret: signature };
}

module.exports = {
	serializePayload,
	signBody,
	callbackHeaders,
	DEFAULT_KEY_PATH,
};
