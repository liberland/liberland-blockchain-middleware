"use strict";

const router = require("express").Router();
const apicache = require('apicache');
const wrap = require("express-async-handler");
const { Keyring } = require("@polkadot/api");
const axios = require ('axios');
const {BN, BN_ONE, BN_ZERO, BN_MILLION } = require("@polkadot/util")
const { stringify } = require("csv-stringify/sync");

const generateCertificate = require('./generate-certificate')
const { getLastWeekEraPaidEvents, getTaxList, fetchAllSpendings, verifyPurchase, createPurchase } = require("../utils/explorer");
const {formatSpendings} = require("../utils/government-spendings");
const { isTestnetOrLocal } = require("../utils/environment");
const { canFundNowGraphQL, getLastFundingTime, FAUCET_CONFIG } = require("../utils/faucet-graphql");

const { apiPromise } = require("../utils/polkadot");
const config = require("../../config");
const { processHolders } = require("../../api-tools/src/lld-holders-processor");
const { triggerOrder } = require("../utils/events");
const { formatLLDWithDecimals } = require("../utils/common");

const cache = apicache.middleware;
const CACHE_DURATION = '3 minutes';

router.get(
	"/healthcheck",
	wrap(async (req, res) => {
		const api = await apiPromise;
		try {
			const bn = await api.query.system.number();
			if (bn.lt(BN_ONE)) throw new Error("Invalid block number");
		} catch(e) {
			console.error(e);
			res.status(500).json({status: "ERROR"});
			return;
		}

		res.status(200).json({status: "OK"});
	})
);

router.get(
	"/plots/:walletAddress",
	wrap(async (req, res) => {
		const api = await apiPromise;
		const { walletAddress } = req.params;

		const ownerLands = [];

		const landResults = await api.query.nfts.account.entries(
			walletAddress,
			config.METAVERSE_NFTs_ID
		);

		const landSummaries = [];
		const landMetadataQueries = [];

		landResults.forEach((data) => {
			const landSummary = data[0].toHuman();
			landSummaries.push({ id: parseInt(landSummary[2], 10) });
			landMetadataQueries.push([
				api.query.nfts.itemMetadataOf,
				[parseInt(landSummary[1], 10), parseInt(landSummary[2], 10)],
			]);
		});

		let landMetadataResults = [];

		// Only query if there's something to query (otherwise, it never resolves)
		if (landMetadataQueries.length) {
			landMetadataResults = await api.queryMulti(landMetadataQueries);
		}

		landMetadataResults.forEach((landMetadataResult, index) => {
			const land = {
				id: landSummaries[index].id,
				owner: landSummaries[index].owner,
			};
			const landAttributes = landMetadataResult.toHuman();
			try {
				const rawLandAttributes = landMetadataResult.unwrap().data;
				const metadataUint = api
					.createType("LandMetadata", rawLandAttributes)
					.toJSON();
				const landMetadataObject = {
					...metadataUint,
					demarcation: metadataUint.demarcation.map((c) => ({
						lat: c.lat / 10000000,
						long: c.long / 10000000,
					})),
				};
				land.data = landMetadataObject;
			} catch (e) {
				// Uses legacy data representation
				try {
					land.data = JSON.parse(landAttributes.data);
				} catch (legacyError) {
					if (landAttributes) {
						land.rawData = landAttributes.data;
					}

					land.error = legacyError.toString();
				}
			}

			ownerLands.push(land);
		});

		res.status(200).json(ownerLands);
	})
);

router.get(
	"/plots",
	wrap(async (req, res) => {
		const api = await apiPromise;

		const lands = [];

		const landResults = await api.query.nfts.item.entries(
			config.METAVERSE_NFTs_ID
		);

		const landSummaries = [];
		const landMetadataQueries = [];

		landResults.forEach((data) => {
			const landSummary = data[0].toHuman();
			const landOwnerData = data[1].toHuman();
			landSummaries.push({
				id: parseInt(landSummary[1], 10),
				owner: landOwnerData.owner,
			});
			landMetadataQueries.push([
				api.query.nfts.itemMetadataOf,
				[parseInt(landSummary[0], 10), parseInt(landSummary[1], 10)],
			]);
		});

		let landMetadataResults = [];

		// Only query if there's something to query (otherwise, it never resolves)
		if (landMetadataQueries.length) {
			landMetadataResults = await api.queryMulti(landMetadataQueries);
		}

		landMetadataResults.forEach((landMetadataResult, index) => {
			const land = {
				id: landSummaries[index].id,
				owner: landSummaries[index].owner,
			};
			const landAttributes = landMetadataResult.toHuman();
			try {
				const rawLandAttributes = landMetadataResult.unwrap().data;
				const metadataUint = api
					.createType("LandMetadata", rawLandAttributes)
					.toJSON();
				const landMetadataObject = {
					...metadataUint,
					demarcation: metadataUint.demarcation.map((c) => ({
						lat: c.lat / 10000000,
						long: c.long / 10000000,
					})),
				};
				console.log("metadata");
				console.log(landMetadataObject);
				land.data = landMetadataObject;
			} catch (e) {
				// Uses legacy data representation
				try {
					land.data = JSON.parse(landAttributes.data);
				} catch (legacyError) {
					if (landAttributes) {
						land.rawData = landAttributes.data;
					}

					land.error = legacyError.toString();
				}
			}

			lands.push(land);
		});

		res.status(200).json(lands);
	})
);

router.post(
	"/onboarding",
	wrap(async (req, res) => {
		const api = await apiPromise;
		const { usingWalletAddress, userToken } = req.body;
		let centralizedWalletAddress = null;
		let centralizedId = null;
		let centralizedAPI = axios.create({
			baseURL: config.CENTRALIZED_API_URL,
			withCredentials: false,
		});
		centralizedAPI.defaults.headers.common['X-token'] = userToken;

		let centralizedCheckPromises = []

		let checkEligibleForPersonIdPromise = new Promise((resolve, reject) => {
			centralizedAPI.get('/e-residents/approved/me').then((result) => {
				if(result.status !== 200) {
					return reject('You are not a fully approved e-resident or citizen, therefore are not eligible to claim onboarding LLDs');
				}
				if(result.data.claimedOnboardingLld !== false) {
					return reject('Person already claimed onboarding LLD');
				}
				centralizedId = result.data.id;
				return resolve(centralizedId)
			}).catch(e =>{
				return reject('Technical error when checking if fully approved e-resident who didnt claim LLD yet, please let the devs know');
			})

		})

		centralizedCheckPromises.push(checkEligibleForPersonIdPromise)

		let checkWalletAddressPromise = new Promise((resolve, reject) => {
			centralizedAPI.get('/users/me').then((result) => {
				centralizedWalletAddress = result.data.blockchainAddress;
				if(centralizedWalletAddress !== usingWalletAddress) {
					return reject('Wallet address provided and wallet address registered in profile do not match');
				}
				return resolve()
			}).catch(e => {
				return reject('Technical error when checking if used and registered wallet address match, please let the devs know');
			});
		})

		centralizedCheckPromises.push(checkWalletAddressPromise)

		let checkIfAlreadyHaveLLDPromise = new Promise((resolve, reject) => {
			api.derive.balances.all(usingWalletAddress).then(result => {
				const availableBalance = new BN(result.availableBalance)
				if(!availableBalance.isZero()) {
					return reject('User not eligible as account has LLDs already');
				}
				return resolve(availableBalance)
			}).catch(e => {
				console.log(e)
				return reject('Technical error when checking wallet LLDs, please let the devs know');
			})
		})

		centralizedCheckPromises.push(checkIfAlreadyHaveLLDPromise)

		return Promise.all(centralizedCheckPromises).then(results => {
			const keyring = new Keyring({ type: 'sr25519' });
			const sender = keyring.addFromMnemonic(config.ONBOARDER_PHRASE)
			const sendExtrinsic = api.tx.balances.transfer(usingWalletAddress, (2000000000000))

			let sendLLDPromise = new Promise((resolve, reject) => sendExtrinsic.signAndSend(sender, ({ events = [], status }) => {
				if (status.isInBlock) {
					const err = events.find(({ event }) => api.events.system.ExtrinsicFailed.is(event))
					if (err) {
						if (err.event.data[0].isModule) {
							const decoded = api.registry.findMetaError(err.event.data[0].asModule);
							const { docs, method, section } = decoded;
							reject({ docs, method, section })
						} else {
							reject(err.toString())
						}
					} else {
						resolve(events)
					}
				}
			}));

			sendLLDPromise.then(result => {
				centralizedAPI.patch('/e-residents/applications/' + centralizedId,  { claimedOnboardingLld: true }).then((result) => {
					return res.status(200).send('All went well')
				}).catch(e => {
					console.log('cought e centralizedAPIPatch promises')
					console.log(e)
					return res.status(401).send(e)
				})
			}).catch(e => {
				console.log('cought e sendLLD promise')
				console.log(e)
				return res.status(401).send(e)
			})
		}).catch(e => {
			console.log('cought e centralizedCheck promises')
			console.log(e)
			return res.status(401).send(e)
		})
	})
);

router.post(
	"/certificate",
	wrap(async (req, res) => {
		generateCertificate(req, res, apiPromise);
	})
);

router.get(
  '/tax-payers',
  cache(CACHE_DURATION),
  wrap(async (req, res) => {
    try {
      const api = await apiPromise;
      const lastHeader = await api.rpc.chain.getHeader();
			const politics = await api.query.llm.llmPolitics.entries();
      const lastBlock = lastHeader.number.toNumber();

      const limit = parseInt(req.query.limit, 10) || 10;
      const months = parseInt(req.query.months, 10) || 12;
      const blocksInDay = (3600 * 24) / 6;
      const blocksInMonth = blocksInDay * 30.44;
      const startBlock = Math.floor(lastBlock - (months * blocksInMonth));

      console.log('limit')
      console.log(limit)

      const tax = await getTaxList();

			const filteredData = tax.taxPools.nodes.reduce(
				(acc, { addressId, value, blockNumber }) => {
					const numericValue = Number(value);

					if (blockNumber >= startBlock) {
						if (!acc[addressId]) {
							acc[addressId] = 0;
						}
						acc[addressId] += numericValue;
					}

					return acc;
				},
				{}
			);

      const totalsByAddressUnpool = tax.taxUnPools.nodes.reduce((acc, { addressId, value, blockNumber }) => {
        const numericValue = Number(value);

        if (blockNumber >= startBlock) {
          if (!acc[addressId]) {
            acc[addressId] = 0;
          }
          acc[addressId] += numericValue;
        }

        return acc;
      }, {});

			const totalPoolData = politics.map(([{ args: key }, valueData]) => {
				const totalValue = Number(valueData.toString());
				const addressId = key.toString();

				return { totalValue, addressId };
			});

			const sortedTotalsByAddressPoolTotal = totalPoolData.sort((a, b) => b.totalValue - a.totalValue).slice(0, limit);

      const sortedPoolTotals = Object.entries(filteredData)
        .map(([addressId, totalValue]) => ({ addressId, totalValue }))
        .sort((a, b) => b.totalValue - a.totalValue)
        .slice(0, limit);


      const sortedUnpoolTotals = Object.entries(totalsByAddressUnpool)
        .map(([addressId, totalValue]) => ({ addressId, totalValue }))
        .sort((a, b) => b.totalValue - a.totalValue)
        .slice(0, limit);

      res.status(200).json({
		  sortedPoolTotals,
		  sortedUnpoolTotals,
		  sortedTotalsByAddressPoolTotal
      });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  })
);

router.get(
	[
		"/query/:section/:method",
		"/query/:section/:method/*",
	],
	wrap(async (req, res) => {
		const api = await apiPromise;
		let args = req.path.split("/").slice(4);
		let { section, method } = req.params;
		let query = api.query[section][method];
		if (typeof query !== "function") {
			res.status(400).json({ error: `No such query: ${section}.${method}`});
			return;
		}

		try {
			let result = await api.query[req.params.section][req.params.method](...args);
			res.status(200).json(result.toJSON());
		} catch(e) {
			res.status(400).json({ error: e.message })
		}
	})
);

router.get(
	"/lld-stats",
	cache(CACHE_DURATION),
	wrap(async (_, res) => {
		const api = await apiPromise;
		const currentEraOption = (await api.query.staking.currentEra()).unwrap().toNumber();
		const events = await getLastWeekEraPaidEvents();
		const previousEra = events
			.map(([era]) => parseInt(era))
			.filter(era => era < currentEraOption)
			.sort(
				(a, b) => b - a
			)[0];
		if (!previousEra) {
			res.status(404).json({ error: "No previous era found" });
			return;
		}
		const lastEraTotalStaked = await api.query.staking.erasTotalStake(previousEra);
		const totalLld = await api.query.balances.totalIssuance();
		const fullLLDIssuance = totalLld.toString();
		const totalLldValue = fullLLDIssuance.substring(0, fullLLDIssuance.length - 12);
		const lastEraRewards = events.find(v => v[0] === previousEra.toString());
		const lastEraStakersRewards = new BN(lastEraRewards[1]);
		const lastEraCongressRewards = new BN(lastEraRewards[2]);

		const DENOMINATOR = BN_MILLION;
		const inflationPerEra = lastEraCongressRewards.add(lastEraStakersRewards).mul(DENOMINATOR).div(totalLld).toNumber() / DENOMINATOR.toNumber();
		const inflation = Math.pow(1 + inflationPerEra, 4*365) - 1;

		const interestRatePerEra = lastEraStakersRewards.mul(DENOMINATOR).div(lastEraTotalStaked).toNumber() / DENOMINATOR.toNumber();
		const stakerApyWeeklyPayouts = Math.pow(1 + 4*7*interestRatePerEra, 52) - 1


		const lastWeekStakersRewards = events.reduce((lastWeek, i) => lastWeek.add(new BN(i[1])), BN_ZERO).toString();
		const lastWeekCongressRewards = events.reduce((lastWeek, i) => lastWeek.add(new BN(i[2])), BN_ZERO).toString();


		res.status(200).json({
			totalLld: totalLldValue,
			inflation,
			lastWeekCongressRewards,
			lastWeekStakersRewards,
			interestRatePerEra,
			stakerApyWeeklyPayouts,
		});
	})
);

router.get(
	"/total-issuance/lld",
	cache(CACHE_DURATION),
	wrap(async (_, res) => {
		try {
			const api = await apiPromise;
			const issuance = await api.query.balances.totalIssuance();
			const fullLLDIssuance = formatLLDWithDecimals(issuance);
			res.status(200).json({ result: fullLLDIssuance });
		} catch(e) {
			res.status(400).json({ error: e.message })
		}
	}),
);

router.get(
	"/liquid-available/lld",
	cache(CACHE_DURATION),
	wrap(async (_, res) => {
		try {
			const api = await apiPromise;
			const issuance = await api.query.balances.totalIssuance();
			const era = (await api.query.staking.activeEra()).unwrap().index;
			const totalStaked = await api.query.staking.erasTotalStake(era);
			const liquidSupply = issuance.sub(totalStaked);
			const liquidLLD = formatLLDWithDecimals(liquidSupply);
			res.status(200).json({ result: liquidLLD });
		} catch(e) {
			res.status(400).json({ error: e.message })
		}
	}),
)

router.get(
	"/election-data",
	wrap(async (req, res) => {
		const api = await apiPromise;

		const [congressMembersRaw, electionsCandidatesRaw, electionsInfo, runnerupsRaw, signedBlock, lastHeader] = await Promise.all([
			api.query.council.members(),
			api.query.elections.candidates(),
			api.derive.elections.info(),
			api.query.elections.runnersUp(),
			api.rpc.chain.getBlock(),
			api.rpc.chain.getHeader()
		])
		const congressMembers = congressMembersRaw.toHuman();
		let electionsCandidates = electionsCandidatesRaw.toHuman();

		electionsCandidates = electionsCandidates.map(ec => ec[0]);
		let runnerups = runnerupsRaw.toHuman();

		runnerups = runnerups.map(ru => ru['who']);
		let termDuration = electionsInfo.termDuration.toNumber();

		const lastBlockNumber = lastHeader.number.toNumber();
		let lastBlockTimestamp = 0;
		// the information for each of the contained extrinsics
		signedBlock.block.extrinsics.forEach(({ method: { args, method, section }}) => {
			// check for timestamp.set
			if (section === 'timestamp' && method === 'set') {
				// extract the Option<Moment> as Moment
				lastBlockTimestamp = args[0].unwrap().toNumber();
			}
		});

		const remaining = termDuration - (lastBlockNumber % termDuration);
		const blockDurationMilis = 6000;
		const nextElectionEnd = lastBlockTimestamp + (remaining * blockDurationMilis);
		const currentTermProgressPercent = Math.round(100 * (1 - (remaining / termDuration)));

		res.status(200).json({
			congressMembers,
			runnerups,
			electionsCandidates,
			currentTermProgressPercent,
			nextElectionEnd
		});
	})
);

router.get(
	"/government-spendings/:walletAddress",
	wrap(async (req, res) => {
		try {
			const { walletAddress } = req.params;
			const allSpendings = await fetchAllSpendings(
				walletAddress,
			);
			const api = await apiPromise;

			const spendingsDataWithRemark = formatSpendings(api, allSpendings)

			res.status(200).json(spendingsDataWithRemark)
		} catch (e) {
			res.status(400).json({ error: e.message });
		}
	})
);

router.get(
	"/government-spendings-csv/:walletAddress",
	wrap(async (req, res) => {
		try {
			const { walletAddress } = req.params;
			const allSpendings = await fetchAllSpendings(walletAddress);
			const api = await apiPromise;

			const spendingsDataWithRemark = formatSpendings(api, allSpendings)

			const csv = stringify(spendingsDataWithRemark);

			res.set(
				"Content-Disposition",
				'attachment; filename="congress-spendings.csv"'
			)
				.status(200)
				.send(csv);
		} catch (e) {
			res.status(400).json({ error: e.message });
		}
	})
);

router.post(
	"/create-purchase",
	wrap(async (req, res) => {
		try {
			const {
				orderId,
				price,
				toId,
				assetId,
				callback,
			} = req.body;
			const api = await apiPromise;
			const lastHeader = await api.rpc.chain.getHeader();
			const lastBlockNumber = lastHeader.number.toNumber();
			const minBlockNumber = lastBlockNumber - 10000;
			await createPurchase({
				toId,
				price,
				orderId,
				assetId,
				minBlockNumber,
				lastBlockNumber,
				callback,
			});
			res.status(201).end();
		} catch (e) {
			res.status(400).json({ error: e.message });
		}
	}),
);

router.get(
	"/verify-purchase",
	wrap(async (req, res) => {
		try {
			const {
				orderId,
				price,
				toId,
				assetId,
			} = req.query;
			const api = await apiPromise;
			const lastHeader = await api.rpc.chain.getHeader();
			const lastBlockNumber = lastHeader.number.toNumber();
			const [paid] = await verifyPurchase({
				orderId,
				price,
				toId,
				assetId,
				minBlockNumber: lastBlockNumber - 10000,
			});
			if (paid) {
				await triggerOrder({ orderId });
			}
			res.send({ paid });
		} catch (e) {
			res.status(400).json({ error: e.message });
		}
	}),
);

router.post(
	"/faucet/lld",
	wrap(async (req, res) => {
		if (!isTestnetOrLocal()) {
			return res.status(403).json({ error: "Faucet is only available on testnet environment" });
		}

		const api = await apiPromise;
		const { walletAddress } = req.body;

		if (!walletAddress) {
			return res.status(400).json({ error: "Wallet address is required" });
		}

		try {
			const keyring = new Keyring({ type: "sr25519" });
			const sender = keyring.addFromMnemonic(config.FAUCET_PHRASE);
			const faucetAddress = sender.address;

			const canClaim = await canFundNowGraphQL(walletAddress, "LLD", faucetAddress, FAUCET_CONFIG.COOLDOWN_HOURS, api);

			if (!canClaim) {
				const nextClaimTime = await getLastFundingTime(walletAddress, "LLD", faucetAddress, FAUCET_CONFIG.COOLDOWN_HOURS, api);
				return res.status(429).json({
					error: "Cooldown period active",
					message: `You must wait ${FAUCET_CONFIG.COOLDOWN_HOURS} hours between LLD claims`,
					nextClaimAvailable: nextClaimTime.toISOString(),
				});
			}

			const lldAmount = FAUCET_CONFIG.LLD_AMOUNT;
			const amount = api.registry.createType("Balance", lldAmount);

			const sendExtrinsic = api.tx.balances.transfer(walletAddress, amount);

			const txResult = new Promise((resolve, reject) =>
				sendExtrinsic.signAndSend(sender, ({ events = [], status }) => {
					if (status.isInBlock) {
						const err = events.find(({ event }) => api.events.system.ExtrinsicFailed.is(event));
						if (err) {
							if (err.event.data[0].isModule) {
								const decoded = api.registry.findMetaError(err.event.data[0].asModule);
								const { docs, method, section } = decoded;
								reject({ docs, method, section });
							} else {
								reject(err.toString());
							}
						} else {
							resolve(events);
						}
					}
				})
			);

			await txResult;

			res.status(200).json({
				success: true,
				message: `Successfully sent ${lldAmount / 1000000000000} LLD to ${walletAddress}`,
				amount: lldAmount,
				tokenType: "LLD",
				cooldownHours: FAUCET_CONFIG.COOLDOWN_HOURS,
				nextClaimAvailable: Date.now() + FAUCET_CONFIG.COOLDOWN_HOURS * 3600 * 1000,
			});
		} catch (error) {
			console.error("LLD Faucet error:", error);
			res.status(500).json({ error: error.message || "Failed to send LLD tokens" });
		}
	})
);

router.post(
	"/faucet/llm",
	wrap(async (req, res) => {
		if (!isTestnetOrLocal()) {
			return res.status(403).json({ error: "Faucet is only available on testnet environment" });
		}

		const api = await apiPromise;
		const { walletAddress } = req.body;

		if (!walletAddress) {
			return res.status(400).json({ error: "Wallet address is required" });
		}

		try {
			const keyring = new Keyring({ type: "sr25519" });
			const sender = keyring.addFromMnemonic(config.FAUCET_PHRASE);
			const faucetAddress = sender.address;

			const canClaim = await canFundNowGraphQL(walletAddress, "LLM", faucetAddress, FAUCET_CONFIG.COOLDOWN_HOURS, api);

			if (!canClaim) {
				const nextClaimTime = await getLastFundingTime(walletAddress, "LLM", faucetAddress, FAUCET_CONFIG.COOLDOWN_HOURS, api);
				return res.status(429).json({
					error: "Cooldown period active",
					message: `You must wait ${FAUCET_CONFIG.COOLDOWN_HOURS} hours between LLM claims`,
					nextClaimAvailable: nextClaimTime,
				});
			}

			const llmAmount = FAUCET_CONFIG.LLM_AMOUNT;
			const amount = api.registry.createType("Balance", llmAmount);

			const sendExtrinsic = api.tx.assets.transfer(1, walletAddress, amount);

			const txResult = new Promise((resolve, reject) =>
				sendExtrinsic.signAndSend(sender, ({ events = [], status }) => {
					if (status.isInBlock) {
						const err = events.find(({ event }) => api.events.system.ExtrinsicFailed.is(event));
						if (err) {
							if (err.event.data[0].isModule) {
								const decoded = api.registry.findMetaError(err.event.data[0].asModule);
								const { docs, method, section } = decoded;
								reject({ docs, method, section });
							} else {
								reject(err.toString());
							}
						} else {
							resolve(events);
						}
					}
				})
			);

			await txResult;

			res.status(200).json({
				success: true,
				message: `Successfully sent ${llmAmount / 1000000000} LLM to ${walletAddress}`,
				amount: llmAmount,
				tokenType: "LLM",
				cooldownHours: FAUCET_CONFIG.COOLDOWN_HOURS,
				nextClaimAvailable: Date.now() + FAUCET_CONFIG.COOLDOWN_HOURS * 3600 * 1000,
			});
		} catch (error) {
			console.error("LLM Faucet error:", error);
			res.status(500).json({ error: error.message || "Failed to send LLM tokens" });
		}
	})
);

router.get(
	"/faucet/cooldown",
	wrap(async (req, res) => {
		const api = await apiPromise;
		const { walletAddress, token } = req.query;
		
		if (!walletAddress || !token) {
			return res.status(400).json({ error: "walletAddress and token query parameters are required" });
		}

		if (token !== "LLD" && token !== "LLM") {
			return res.status(400).json({ error: "token must be either 'LLD' or 'LLM'" });
		}

		try {
			const keyring = new Keyring({ type: "sr25519" });
			const sender = keyring.addFromMnemonic(config.FAUCET_PHRASE);
			const faucetAddress = sender.address;

			const lastFundingTime = await getLastFundingTime(walletAddress, token, faucetAddress, FAUCET_CONFIG.COOLDOWN_HOURS, api);

			res.status(200).json({
				lastFundingTime,
			});
		} catch (error) {
			console.error("Faucet cooldown check error:", error);
			res.status(500).json({ error: error.message || "Failed to check cooldown status" });
		}
	}),
);

router.get(
	"/top-holders",
	cache(CACHE_DURATION),
	wrap(async (_, res) => {
		res.status(200).json((await processHolders()).slice(0, 100));
	}),
);

router.get("/faucet/amount/:token", wrap(async (req, res) => {
	const { token } = req.params;
	if(token !== "lld" && token !== "llm") {
		return res.status(400).json({ error: "Invalid token" });
	}
	const amount = FAUCET_CONFIG[token.toUpperCase() + "_AMOUNT"];
	res.status(200).json({ amount: amount / 1000000000000 });
}));

module.exports = router;
