'use strict';

const ExpressWinston = require('express-winston');
const WinstonGraylog2 = require('winston-graylog2');
const config = require('../../config');

const GrayLogger = new WinstonGraylog2({
	name: 'oneauth',
	level: 'debug',
	silent: false,
	handleExceptions: true,

	prelog(msg) {
		return msg.trim();
	},

	graylog: {
		servers: [{ host: config.GRAYLOG.HOST, port: config.GRAYLOG.PORT }],
		facility: 'oneauth',
		bufferSize: 1400,
	},

	staticMeta: {
		env: config.ENVIRONMENT,
	},
});

const expressLogger = ExpressWinston.logger({
	transports: [GrayLogger],
	meta: true,
	msg: 'HTTP {{req.method}} {{req.url}}',
	expressFormat: true,
	colorize: false,
});

module.exports.expressLogger = expressLogger;
