"use strict";

const router = require("express").Router();
const wrap = require("express-async-handler");
const { ApiPromise, WsProvider } = require("@polkadot/api");
const config = require("../../config");

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
	},
});

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

module.exports = router;
