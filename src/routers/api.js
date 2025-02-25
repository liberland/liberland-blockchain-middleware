"use strict";

const router = require("express").Router();
const wrap = require("express-async-handler");
const { ApiPromise, WsProvider, Keyring } = require("@polkadot/api");
const axios = require ('axios');
const {BN, BN_ONE, BN_ZERO, BN_MILLION} = require("@polkadot/util")
const config = require("../../config");
const generateCertificate = require('./generate-certificate');
const { getLastWeekEraPaidEvents } = require("../utils/explorer");


const provider = new WsProvider(config.RPC_NODE_URL);
const apiPromise = ApiPromise.create({
	provider,
	types: {
		Coords: {
			lat: "u64",
			long: "u64",
		},
		LandMetadata: {
			demarcation: "BoundedVec<Coords, u32>",
			type: "Text",
			status: "Text",
		},
		Encryptable: {
			value: 'Text',
			isEncrypted: 'bool',
		},
		BrandName: {
			name: 'Encryptable',
		},
		Contact: {
			contact: 'Encryptable',
		},
		OnlineAddress: {
			description: 'Encryptable',
			url: 'Encryptable',
		},
		PhysicalAddress: {
			description: 'Encryptable',
			street: 'Encryptable',
			city: 'Encryptable',
			// Subdivision - state/province/emirate/oblast/etc
			subdivision: 'Encryptable',
			postalCode: 'Encryptable',
			country: 'Encryptable', // FIXME enum?
		},
		Person: {
			walletAddress: 'Encryptable',
			name: 'Encryptable',
			dob: 'Encryptable',
			passportNumber: 'Encryptable',
		},
		Principal: {
			walletAddress: 'Encryptable',
			name: 'Encryptable',
			dob: 'Encryptable',
			passportNumber: 'Encryptable',
			signingAbility: 'Encryptable', // FIXME enum
			signingAbilityConditions: 'Encryptable',
			shares: 'Encryptable', // FIXME integer?
		},
		Shareholder: {
			walletAddress: 'Encryptable',
			name: 'Encryptable',
			dob: 'Encryptable',
			passportNumber: 'Text',
			shares: 'Encryptable', // FIXME integer?
		},
		UBO: {
			walletAddress: 'Encryptable',
			name: 'Encryptable',
			dob: 'Encryptable',
			passportNumber: 'Encryptable',
			signingAbility: 'Encryptable', // FIXME enum
			signingAbilityConditions: 'Encryptable',
		},
		RelevantAsset: {
			assetId: 'Encryptable',
		},
		RelevantContract: {
			contractId: 'Encryptable',
		},
		CompanyData: {
			name: 'Text',
			// Truthful scope of business
			purpose: 'Text',
			logoURL: 'Text',
			charterURL: 'Text',
			totalCapitalAmount: 'Text', // FIXME integer instead? Will have issues with decimals though.
			totalCapitalCurrency: 'Text', // FIXME maybe some enum?
			numberOfShares: 'Text', // FIXME integer instead? Are fractional shares supported
			valuePerShare: 'Text', // FIXME same as totalCapitalAmount probably
			// History of transfer of shares
			history: 'Text', // FIXME array of well defined structs?
			brandNames: 'Vec<BrandName>',
			onlineAddresses: 'Vec<OnlineAddress>',
			physicalAddresses: 'Vec<PhysicalAddress>',
			statutoryOrganMembers: 'Vec<Person>',
			principals: 'Vec<Principal>',
			shareholders: 'Vec<Shareholder>',
			UBOs: 'Vec<UBO>',
			relevantAssets: 'Vec<RelevantAsset>',
			relevantContracts: 'Vec<RelevantContract>',
			companyType: 'Text',
			contact: 'Vec<Contact>',
		},
	},
});

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
	wrap(async (req, res) => {
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
	wrap(async (req, res) => {
		try {
			const api = await apiPromise;
			let issuance = await api.query.balances.totalIssuance();
			let fullLLDIssuance = issuance.toString();
			fullLLDIssuance = fullLLDIssuance.substring(0, fullLLDIssuance.length - 12);
			res.status(200).json(fullLLDIssuance);
		} catch(e) {
			res.status(400).json({ error: e.message })
		}
	})
);

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

module.exports = router;
