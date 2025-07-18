'use strict';

const axios = require("axios");
const { hexToU8a } = require("@polkadot/util");
const pako = require("pako");
const config = require("../../config");
const { webHooks } = require("./webhooks");
const { apiPromise } = require("./polkadot");

const eraPaidEventsQuery = `
query EraPaidEvents {
	events(
		orderBy: BLOCK_NUMBER_DESC,
		first: 28,
		filter: {
			method: { equalTo: "EraPaid" },
			section: { equalTo: "staking" }
		}
	) {
		nodes {
			data
		}
	}
}
`;

const taxQuery = `
  query taxQuery {
    taxUnPools{
      nodes{
        value
        addressId
        blockNumber
      }
    }
    taxPools{
      nodes{
        value
        addressId
        blockNumber
      }
    }
  }
`;

const getApi = () => axios.create({
	baseURL: config.EXPLORER_API_URL,
});

const getLastWeekEraPaidEvents = async () => {
	const { data } = await getApi().post('', {
		query: eraPaidEventsQuery
	});
	return data.data.events.nodes.map(v => v.data);
};


async function queryAllPages(query, variables, ...keys) {
	const { data } = await getApi().post('', {
		query, variables
	});
	return keys.flatMap(key => {
		const additionalInfo = (() => {
			switch (key) {
				case "merits":
					return { asset: "LLM" };
				case "transfers":
					return { asset: "LLD" };
				default:
					return {};
			}
		})();
		return data
			.data[key]
			.nodes
			.map((d) => ({ ...d, ...additionalInfo }));
	}).sort(({ block: aBlock }, { block: bBlock }) => parseInt(bBlock.number, 10) - parseInt(aBlock.number, 10));
}

const tryDecodeRemark = async (polkadotApi, dataToDecode) => {
	try {
		const compressedData = hexToU8a(dataToDecode);
		const decompressed = pako.inflate(compressedData);
		const remarkInfo = polkadotApi.createType('RemarkInfoUser', decompressed);
		return remarkInfo;
	} catch (_) {
		return {};
	}
};

async function verifyPurchase({
	toId, price, orderId, minBlockNumber
}) {
	const query = `
			query Verification {
				transfers(
					filter: {
						remark: { isNull: false },
						toId: { equalTo: "${toId}" },
						value: { equalTo: "${price}" },
						blockNumber: { greaterThan: "${minBlockNumber}" }
					}
				) {
					nodes {
						remark
					}
				}
			}
	`;
	const { data } = await getApi().post('', {
		query,
	});
	const transfers = data.data && data.data.transfers;
	const nodes = transfers && transfers.nodes;
	if (!Array.isArray(nodes)) {
		return [false];
	}
	const api = await apiPromise;
	for (let i = 0; i < nodes.length; i++) {
		const { remark } = nodes[i];
		// eslint-disable-next-line no-await-in-loop
		const decoded = await tryDecodeRemark(api, remark);
		if (decoded.id && decoded.id.toString() === orderId) {
			return [true, decoded.description.toString()];
		}
	}
	return [false];
}

async function createPurchase({
	toId,
	price,
	orderId,
	minBlockNumber,
	lastBlockNumber,
	callback,
}) {
	const name = `order-${Buffer.from(JSON.stringify({
		toId,
		price,
		orderId,
		minBlockNumber,
		lastBlockNumber,
	}), "utf-8").toString("base64")}`;
	await webHooks.add(name, callback);
}

async function fetchAllSpendings(userId) {
	return queryAllPages(
		`
		query Spending($userId: String) {
			merits(filter: { fromId: { equalTo: $userId } }) {
				nodes {
					id
					toId
					value
					remark
					block {
						number
						timestamp
					}
				}
			}
			transfers(filter: { fromId: { equalTo: $userId } }) {
				nodes {
					id
					toId
					value
					remark
					block {
						number
						timestamp
					}
				}
			}
			assetTransfers(filter: { asset: { notEqualTo: "1" }, fromId: { equalTo: $userId } }) {
				nodes {
					id
					asset
					toId
					value
					remark
					block {
						number
						timestamp
					}
				}
			}
		}
		`,
		{ userId },
		"merits",
		"transfers",
		"assetTransfers",
	);
}

const getTaxList = async () => {

	const { data } = await getApi().post('', {
		query: taxQuery
	});

	return data.data;
};

module.exports = {
	fetchAllSpendings,
	getLastWeekEraPaidEvents,
	getTaxList,
	verifyPurchase,
	createPurchase,
}
