'use strict';

const { deepMerge } = require('./src/utils/common');
const { version } = require('./package.json');

const config = {
	ENVIRONMENT: process.env.npm_package_config_env || 'development',
	IS_LIVE: false,
	SERVER: {
		PORT: process.env.npm_package_config_port || 8090,
	},
	API_ROUTE_PREFIX: `/v${version.split('.')[0]}`,
	METAVERSE_NFTs_ID: 1,
	LAND_NFTs_ID: 0,
	ONBOARDER_PHRASE: 'REPLACE ME WITH AUTO LLD ONBOARDER ACCOUNT PHRASE',
	CENTRALIZED_API_URL: "http://localhost:8010",
};

try {
	/* eslint-disable import/no-dynamic-require, global-require */
	const overrides = require(`./config.${config.ENVIRONMENT}`);
	/* eslint-enable import/no-dynamic-require, global-require */

	// Override default configuration
	deepMerge(config, overrides);
} catch (e) {
	console.error(e.message);
}

console.log('ENVIRONMENT', config.ENVIRONMENT);

module.exports = Object.freeze(config);
