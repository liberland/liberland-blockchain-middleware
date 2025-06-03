"use strict";

const config = require("../../config");

// Helper function to check if we're on testnet/local
const isTestnetOrLocal = () =>
	!config.IS_LIVE || config.ENVIRONMENT === "staging";

module.exports = {
	isTestnetOrLocal,
};
