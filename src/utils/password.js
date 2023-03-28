'use strict';

const sha1 = require('sha1');
const bcrypt = require('bcrypt');
const config = require('../../config');

const saltString = 'buDN#+XeqzT;4UaRCE75PRU-EbCJr';

function salt(string) {
	return `${string}${saltString}`;
}

function getScheme(hash) {
	return hash.startsWith('$2')
		? config.HASH_SCHEME.BCRYPT
		: config.HASH_SCHEME.SHA1;
}

async function pass2hash(password, scheme = config.HASH_SCHEME.BCRYPT) {
	let hash;
	switch (scheme) {
		case config.HASH_SCHEME.SHA1:
			hash = sha1(salt(password));
			break;
		case config.HASH_SCHEME.BCRYPT:
		default:
			hash = await bcrypt.hash(password, config.BCRYPT_SALT_ROUNDS);
			break;
	}
	return hash;
}

async function compare2hash(
	password,
	hash,
	scheme = config.HASH_SCHEME.BCRYPT
) {
	let match = false;
	switch (scheme) {
		case config.HASH_SCHEME.SHA1:
			match = (await pass2hash(password, scheme)) === hash;
			break;
		case config.HASH_SCHEME.BCRYPT:
		default:
			match = await bcrypt.compare(password, hash);
			break;
	}
	return match;
}

module.exports = {
	getScheme,
	pass2hash,
	compare2hash,
};
