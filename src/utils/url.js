'use strict';

const config = require('../../config');

module.exports = {
	prefixHttp(url) {
		let prefixedUrl = url;
		if (prefixedUrl.substr(0, 4) !== 'http') {
			prefixedUrl = `http://${prefixedUrl}`;
		}
		return prefixedUrl;
	},

	isURL(url) {
		const regex = /(https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|www\.[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9]\.[^\s]{2,}|www\.[a-zA-Z0-9]\.[^\s]{2,})/;
		return regex.test(url);
	},
	// strings /en and /cs if in development to make the url environment agnostic
	selectRightEnvironmentUrl: (route) => {
		if (!route) return null;
		console.log(
			'ROUTING_WITH_ENVIRONMENT: ',
			config.ENVIRONMENT,
			' ROUTE: ',
			route
		);
		return config.IS_LIVE ? route : route.replace(/(\/en|\/cs)/, '');
	},
	stripLastSlashIfExist(str) {
		return str.charAt(str.length - 1) === '/'
			? str.slice(0, str.length - 1)
			: str;
	},
};
