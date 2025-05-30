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


async function queryAllPages(query, variables) {
	const { data } = await getApi().post('', {
		query, variables
	});
	return data.data.blocks.nodes.flatMap(node => {
		const merits = node.merits.nodes.filter(
			({ fromId }) => fromId === variables.userId,
		);
		const transfers = node.transfers.nodes.filter(
			({ fromId }) => fromId === variables.userId,
		);
		const assetTransfers = node.assetTransfers.nodes.filter(
			({ fromId, asset }) => fromId === variables.userId && asset !== '1',
		);
		const block = {
			number: node.number,
			timestamp: node.timestamp,
		};
		return [
			...merits.map(m => ({ asset: 'LLM', block, ...m })),
			...transfers.map(m => ({ asset: 'LLD', block, ...m })),
			...assetTransfers.map(m => ({ block, ...m })),
		];
	});
}

async function queryPagesCount(query, variables, ...keys) {
	const { data } = await getApi().post('', {
		query, variables
	});
	return keys.reduce((acc, key) => acc + data.data[key].totalCount, 0)
}


async function getSpendingCount(userId) {
	return queryPagesCount(
		`
		query Spending($userId: String) {
			merits(filter: { fromId: { equalTo: $userId } }) {
				totalCount
			}
			transfers(filter: { fromId: { equalTo: $userId } }) {
				totalCount
			}
			assetTransfers(filter: { asset: { notEqualTo: "1" }, fromId: { equalTo: $userId } }) {
				totalCount
			}
		}
		`,
		{ userId },
		"merits",
		"transfers",
		"assetTransfers",
	);
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
		return false;
	}
	const api = await apiPromise;
	for (let i = 0; i < nodes.length; i++) {
		const { remark } = nodes[i];
		// eslint-disable-next-line no-await-in-loop
		const decoded = await tryDecodeRemark(api, remark);
		if (decoded.id && decoded.id.toString() === orderId) {
			return true;
		}
	}
	return false;
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

async function fetchAllSpendings(userId, skip, take) {
	return queryAllPages(
		`
		query Spending($skip: Int, $take: Int, $userId: String) {
			blocks(first: $take, offset: $skip, orderBy: NUMBER_DESC, filter: { or: [{ assetTransfersExist: true, assetTransfers: { some: { asset: { notEqualTo: "1" }, fromId: { equalTo: $userId } } } }, { transfersExist: true, transfers: { some: { fromId: { equalTo: $userId } } } }, { meritsExist: true, merits: { some: { fromId: { equalTo: $userId } } } }] }) {
				nodes {
					number
					timestamp
					transfers {
						nodes {
							id
              				fromId
							toId
							value
							remark
						}
					}
					merits {
						nodes {
							id
              				fromId
							toId
							value
							remark
						}
					}
					assetTransfers {
						nodes {
							id
              				fromId
							asset
							toId
							value
							remark
						}
					}
				}
			}
		}
		`,
		{ userId, skip, take },
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
	getSpendingCount,
	getTaxList,
	verifyPurchase,
	createPurchase,
}
