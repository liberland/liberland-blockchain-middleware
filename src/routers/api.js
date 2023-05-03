"use strict";

const router = require("express").Router();
const wrap = require("express-async-handler");
const { ApiPromise, WsProvider } = require("@polkadot/api");
const config = require("../../config");

const provider = new WsProvider(config.RPC_NODE_URL);
const apiPromise = ApiPromise.create({ provider });

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
				land.data = JSON.parse(landAttributes.data);
			} catch (e) {
				if (landAttributes) {
					land.rawData = landAttributes.data;
				}
				land.error = e.toString();
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
				land.data = JSON.parse(landAttributes.data);
			} catch (e) {
				console.log("y");
				if (landAttributes) {
					land.rawData = landAttributes.data;
				}

				land.error = e.toString();
			}

			lands.push(land);
		});

		res.status(200).json(lands);
	})
);

module.exports = router;
