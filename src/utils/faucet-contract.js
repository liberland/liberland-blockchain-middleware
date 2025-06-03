"use strict";

const { Keyring } = require("@polkadot/api");
const { ContractPromise } = require("@polkadot/api-contract");
const config = require("../../config");
const FAUCET_METADATA = require("./faucet-contract-metadata.json");

// Helper function to call contract read-only functions
const callContractFunction = async (api, sender, functionName, params = []) => {
	try {
		// First check if contract exists
		const contractInfo = await api.query.contracts.contractInfoOf(
			config.FAUCET_CONTRACT_ADDRESS
		);

		if (contractInfo.isNone) {
			throw new Error(
				`Contract not found at address: ${config.FAUCET_CONTRACT_ADDRESS}`
			);
		}

		const contract = new ContractPromise(
			api,
			FAUCET_METADATA,
			config.FAUCET_CONTRACT_ADDRESS
		);

		const gasLimit = api.registry.createType("WeightV2", {
			refTime: 30000000000000, // 30 billion
			proofSize: 5000000, // 5 million
		});
		const storageDepositLimit = null;

		const { result, output } = await contract.query[functionName](
			sender,
			{
				gasLimit,
				storageDepositLimit,
			},
			...params
		);

		if (result.isOk) {
			return output.toHuman();
		}
		const errorData = result.asErr;
		if (errorData.isModule) {
			const decoded = api.registry.findMetaError(errorData.asModule);
			console.error(
				`Contract error: ${decoded.section}.${
					decoded.name
				}: ${decoded.docs.join(" ")}`
			);
		} else {
			console.error("Contract call failed:", errorData.toString());
		}
		return null;
	} catch (error) {
		console.error(`Error calling ${functionName}:`, error);
		throw new Error(
			`Failed to call contract function ${functionName}: ${error.message}`
		);
	}
};

const getOwner = async (api, sender) => {
	const owner = await callContractFunction(api, sender, "getOwner");
	return owner.Ok;
};

// Helper functions to get dynamic values from contract
const getFundingPeriodHours = async (api, sender) => {
	const periodMs = await callContractFunction(
		api,
		sender,
		"getFundingPeriod"
	);
	return Math.floor(Number(periodMs.Ok.replace(/,/g, "")) / (1000 * 60 * 60));
};

const getLLDAmount = async (api, sender) => {
	const lldAmount = await callContractFunction(api, sender, "getLldAmount");
	const cleanAmount = lldAmount.Ok.replace(/[,_]/g, "");
	return Number(cleanAmount);
};

const getLLMAmount = async (api, sender) => {
	const llmAmount = await callContractFunction(api, sender, "getLlmAmount");
	const cleanAmount = llmAmount.Ok.replace(/[,_]/g, "");
	return Number(cleanAmount);
};

// Helper function to check if user can claim funds via smart contract
const canFundNow = async (api, sender, userAddress, tokenType) => {
	const formattedTokenType = {
		[tokenType]: null,
	};
	const canClaim = await callContractFunction(api, sender, "canFundNow", [
		userAddress,
		formattedTokenType,
	]);
	return canClaim.Ok;
};

const recordFunding = async (api, userAddress, tokenType) => {
	try {
		const contract = new ContractPromise(
			api,
			FAUCET_METADATA,
			config.FAUCET_CONTRACT_ADDRESS
		);

		// Create keyring and sender for signing the transaction
		const keyring = new Keyring({ type: "sr25519" });
		const sender = keyring.addFromMnemonic(config.FAUCET_PHRASE);

		const gasLimit = api.registry.createType("WeightV2", {
			refTime: 10000000000, // 10 billion
			proofSize: 531072, // 531,072
		});
		const storageDepositLimit = null;

		// Pass tokenType as string, not as object
		const recordExtrinsic = contract.tx.recordFunding(
			{
				storageDepositLimit,
				gasLimit,
			},
			userAddress,
			tokenType
		);

		// Actually sign and send the transaction
		return new Promise((resolve, reject) => {
			recordExtrinsic.signAndSend(sender, ({ events = [], status }) => {
				if (status.isInBlock) {
					const err = events.find(({ event }) =>
						api.events.system.ExtrinsicFailed.is(event)
					);
					if (err) {
						if (err.event.data[0].isModule) {
							const decoded = api.registry.findMetaError(
								err.event.data[0].asModule
							);
							const { docs, method, section } = decoded;
							reject(
								new Error(
									`Contract call failed: ${section}.${method} - ${docs.join(
										" "
									)}`
								)
							);
						} else {
							reject(new Error("Contract call failed"));
						}
					} else {
						resolve(events);
					}
				}
			});
		});
	} catch (error) {
		console.error("Error recording funding:", error);
		throw error;
	}
};

module.exports = {
	callContractFunction,
	getFundingPeriodHours,
	getLLDAmount,
	getLLMAmount,
	canFundNow,
	recordFunding,
	getOwner,
};
