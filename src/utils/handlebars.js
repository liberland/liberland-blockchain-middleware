'use strict';

const debug = require('debug')('sso:src:utils:handlebars');
const hbs = require('express-hbs');

const helpers = {
	ifneq: (options) => {
		return options.hash.expected !== options.hash.val
			? options.fn(this)
			: options.inverse(this);
	},
	ifeq: (options) => {
		debug('ifeq ---------- ');
		debug(options.hash);
		return options.hash.expected === options.hash.val
			? options.fn(this)
			: options.inverse(this);
	},
	formatDate: (date) => {
		debug(date);
		const dateObject = new Date(date);
		const dateString = `${dateObject.getDate()}/${dateObject.getMonth()}/${dateObject.getFullYear()}`;
		return dateString;
	},
	nl2br: (text) => {
		debug('nl2br', text);
		const result = hbs.Utils.escapeExpression(text);
		return new hbs.SafeString(result.replace(/(?:\r\n|\r|\n)/g, '<br />'));
	},

	for: (from, to, incr, block) => {
		let accum = '';
		for (let i = from; i <= to; i += incr) accum += block.fn(i);
		return accum;
	},

	ifCond: (...args) => {
		const options = args.pop();
		return args.some((x) => !x) ? options.fn(this) : options.inverse(this);
	},
};

function register(hbsInstance) {
	for (const [name, helper] of Object.entries(helpers)) {
		hbsInstance.registerHelper(name, helper);
	}
}

module.exports = {
	register,
};
