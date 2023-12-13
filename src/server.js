'use strict';

const cors = require('cors');
const debug = require('debug');
const express = require('express');
const config = require('../config');
const apiRouter = require('./routers');

const app = express();

// Handle information from reverse proxies correctly
app.set('trust proxy', 'loopback, linklocal, uniquelocal');

app.use(
	config.API_ROUTE_PREFIX,
	cors(/*{
		origin: (origin, callback) => {
			// Allow any of our domains
			// Note: Not sending an Error object to the first parameter of the callback
			//       when the origin doesn't match because it results in a 500 Server
			//       Error code being sent to the client, which is incorrect behaviour.
			callback(
				null,
				[config.FRONTEND_URL, config.ADMIN_URL].indexOf(origin) > -1
			);
		},
		methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'PATCH', 'DELETE'],
		allowedHeaders: ['X-Requested-With', 'Content-Type', 'Authorization'],
		preflightContinue: false,
		credentials: true,
	}*/)
);
app.use(express.json());
app.use(config.API_ROUTE_PREFIX, apiRouter);
app.get('*', (req, res) => res.status(404).json({ error: 'Not Found' }));

app.listen(config.SERVER.PORT, () => {
	debug(`Listening on ${config.SERVER.URL}`);
});
