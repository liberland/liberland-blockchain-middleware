"use strict";

const { deepMerge } = require("./src/utils/common");
const { version } = require("./package.json");

const config = {
	ENVIRONMENT: process.env.npm_package_config_env || "development",
	IS_LIVE: false,
	SERVER: {
		PORT: process.env.npm_package_config_port || 8060,
	},
	API_ROUTE_PREFIX: `/v${version.split(".")[0]}`,
	METAVERSE_NFTs_ID: 1,
	LAND_NFTs_ID: 0,
	ONBOARDER_PHRASE: "REPLACE ME WITH AUTO LLD ONBOARDER ACCOUNT PHRASE",
	FAUCET_PHRASE: "REPLACE WITH Web3_Test1 ACCOUNT PHRASE OR NEW CONTRACT OWNER",
	FAUCET_CONTRACT_ADDRESS: "5FGMYA7aMc6rYpuZnoqMVavqgM3Sv5zQzKK13D5g8Ndg9YfN",
	CENTRALIZED_API_URL: "http://localhost:8010",
	EXPLORER_API_URL: "http://localhost:3000",
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

console.log("ENVIRONMENT", config.ENVIRONMENT);

module.exports = Object.freeze(config);
