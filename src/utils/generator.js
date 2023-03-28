'use strict';

const uid2 = require('uid2');

module.exports = {
	genNdigitNum(N) {
		return parseInt(Math.random() * 10 ** N, 10);
	},
	genNcharAlphaNum(N) {
		return uid2(N);
	},
};
