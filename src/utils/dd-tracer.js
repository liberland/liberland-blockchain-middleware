'use strict';

const Tracer = require('datadog-tracer');
const connectDatadog = require('connect-datadog');

// ============== START DATADOG
const datadogRouter = connectDatadog({
	response_code: true,
	tags: ['app:oneauth'],
});

const tracer = new Tracer({ service: 'oneauth' });

function trace(req, res, span) {
	span.addTags({
		'resource': req.path,
		'type': 'web',
		'span.kind': 'server',
		'http.method': req.method,
		'http.url': req.url,
		'http.status_code': res.statusCode,
	});

	span.finish();
}

const expressTracer = (req, res, next) => {
	const span = tracer.startSpan('express.request');

	res.on('finish', () => trace(req, res, span));
	res.on('close', () => trace(req, res, span));

	next();
};

module.exports = {
	expressTracer,
	datadogRouter,
	tracer,
};
// ================= END DATADOG
