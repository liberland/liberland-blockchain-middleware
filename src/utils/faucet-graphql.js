"use strict";

const axios = require('axios');
const GRAPHQL_ENDPOINT = 'https://archive.testchain.liberland.org/graphql';

const FAUCET_CONFIG = {
	LLD_AMOUNT: 1000000000000000, // 1000 LLD
	LLM_AMOUNT: 100000000000000, // 100 LLM
	COOLDOWN_HOURS: 24,
	BLOCK_TIME_SECONDS: 6,
};

/**
 * Check if a wallet can receive faucet funding by querying GraphQL for recent transfers
 * @param {string} walletAddress - The wallet address requesting funding
 * @param {string} tokenType - Either "LLD" or "LLM"
 * @param {string} faucetAddress - The faucet wallet address that sends tokens
 * @param {number} cooldownHours - Hours to check back for recent transfers (default 24)
 * @returns {Promise<boolean>} - true if can fund now, false if cooldown active
 */
const canFundNowGraphQL = async (walletAddress, tokenType, faucetAddress, cooldownHours, api) => {
    // Calculate minimum block number based on cooldown period
    let sinceBlockNumber = 1; // Default fallback
    
    if (api) {
        try {
            const currentHeader = await api.rpc.chain.getHeader();
            const currentBlockNumber = currentHeader.number.toNumber();
            const blocksInCooldownPeriod = Math.floor((cooldownHours * 60 * 60) / FAUCET_CONFIG.BLOCK_TIME_SECONDS);
            sinceBlockNumber = Math.max(1, currentBlockNumber - blocksInCooldownPeriod);
        } catch (error) {
            console.warn("Could not get current block number, using timestamp fallback:", error.message);
        }
    }
    
    let query;
    let entityName;
    
    if (tokenType === "LLD") {
        entityName = "transfers";
        query = `
            query RecentTransfers($toAddress: String!, $fromAddress: String!, $sinceBlockNumber: BigFloat!) {
                transfers(
                    filter: {
                        toId: { equalTo: $toAddress },
                        fromId: { equalTo: $fromAddress },
                        blockNumber: { greaterThan: $sinceBlockNumber }
                    },
                    first: 1,
                    orderBy: BLOCK_NUMBER_DESC
                ) {
                    totalCount
                    nodes {
                        id
                        fromId
                        toId
                        value
                        eventIndex
                        block {
                            number
                            timestamp
                        }
                    }
                }
            }
        `;
    } else if (tokenType === "LLM") {
        entityName = "merits";
        query = `
            query RecentMerits($toAddress: String!, $fromAddress: String!, $sinceBlockNumber: BigFloat!) {
                merits(
                    filter: {
                        toId: { equalTo: $toAddress },
                        fromId: { equalTo: $fromAddress },
                        blockNumber: { greaterThan: $sinceBlockNumber }
                    },
                    first: 1,
                    orderBy: BLOCK_NUMBER_DESC
                ) {
                    totalCount
                    nodes {
                        id
                        fromId
                        toId
                        value
                        eventIndex
                        block {
                            number
                            timestamp
                        }
                    }
                }
            }
        `;
    } else {
        throw new Error(`Unsupported token type: ${tokenType}`);
    }

    try {
        const payload = {
            operationName: tokenType === "LLD" ? "RecentTransfers" : "RecentMerits",
            variables: {
                toAddress: walletAddress,
                fromAddress: faucetAddress,
                sinceBlockNumber: sinceBlockNumber
            },
            query
        };

        const response = await axios.post(GRAPHQL_ENDPOINT, payload);

        if (response.data.errors) {
            console.error("GraphQL errors:", response.data.errors);
            throw new Error(`GraphQL query failed: ${response.data.errors[0].message}`);
        }

        if (!response.data.data) {
            throw new Error("GraphQL response missing data field");
        }

        if (!response.data.data[entityName]) {
            throw new Error(`GraphQL response missing ${entityName} field. Available fields: ${Object.keys(response.data.data).join(', ')}`);
        }

        const totalCount = response.data.data[entityName].totalCount;
        const canFund = totalCount === 0;
        return canFund;
    } catch (error) {
        console.error("Error checking funding history via GraphQL:", error);
        throw new Error(`Failed to check funding history: ${error.message}`);
    }
};

/**
 * Get the timestamp of the last funding transaction from the faucet to the wallet
 * @param {string} walletAddress - The wallet address
 * @param {string} tokenType - Either "LLD" or "LLM" 
 * @param {string} faucetAddress - The faucet wallet address
 * @param {number} cooldownHours - Cooldown period in hours
 * @param {*} api - The API instance
 * @returns {Promise<number>} - Timestamp of the last funding transaction, or 0 if no funding found
 */
const getLastFundingTime = async (walletAddress, tokenType, faucetAddress, cooldownHours, api) => {
    let sinceBlockNumber = 1; // Default fallback
    
    if (api) {
        try {
            const currentHeader = await api.rpc.chain.getHeader();
            const currentBlockNumber = currentHeader.number.toNumber();
            const blocksInCooldownPeriod = Math.floor((cooldownHours * 60 * 60) / FAUCET_CONFIG.BLOCK_TIME_SECONDS);
            sinceBlockNumber = Math.max(1, currentBlockNumber - blocksInCooldownPeriod);
        } catch (error) {
            console.warn("Could not get current block number, using timestamp fallback:", error.message);
        }
    }
    
    let query;
    let entityName;
    
    if (tokenType === "LLD") {
        entityName = "transfers";
        query = `
            query RecentTransfers($toAddress: String!, $fromAddress: String!) {
                transfers(
                    filter: {
                        toId: { equalTo: $toAddress },
                        fromId: { equalTo: $fromAddress }
                    },
                    first: 1,
                    orderBy: BLOCK_NUMBER_DESC
                ) {
                    nodes {
                        block {
                            timestamp
                        }
                    }
                }
            }
        `;
    } else if (tokenType === "LLM") {
        entityName = "merits";
        query = `
            query RecentMerits($toAddress: String!, $fromAddress: String!) {
                merits(
                    filter: {
                        toId: { equalTo: $toAddress },
                        fromId: { equalTo: $fromAddress }
                    },
                    first: 1,
                    orderBy: BLOCK_NUMBER_DESC
                ) {
                    nodes {
                        block {
                            timestamp
                        }
                    }
                }
            }
        `;
    } else {
        throw new Error(`Unsupported token type: ${tokenType}`);
    }

    try {
        const payload = {
            operationName: tokenType === "LLD" ? "RecentTransfers" : "RecentMerits",
            variables: {
                toAddress: walletAddress,
                fromAddress: faucetAddress,
                sinceBlockNumber: sinceBlockNumber
            },
            query
        };

        const response = await axios.post(GRAPHQL_ENDPOINT, payload);

        if (response.data.errors) {
            console.error("GraphQL errors:", response.data.errors);
            throw new Error(`GraphQL query failed: ${response.data.errors[0].message}`);
        }

        const nodes = response.data.data[entityName].nodes;
        if (nodes.length === 0) {
            return 0;
        }

        const lastFundingTime = nodes[0].block.timestamp;
        
        return lastFundingTime;
        
    } catch (error) {
        console.error("Error getting time until next funding:", error);
        throw new Error(`Failed to get funding timing: ${error.message}`);
    }
};

module.exports = {
    canFundNowGraphQL,
    getLastFundingTime,
    FAUCET_CONFIG
}; 