'use strict';

const axios = require("axios");
const config = require("../../config");
const { hexToU8a } = require("@polkadot/util");
const pako = require("pako");

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
		return data.data[key].nodes.map((d) => ({ ...d, ...additionalInfo }));
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
	polkadotApi, toId, price, orderId, minBlockNumber
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
	for (let i = 0; i < nodes.length; i++) {
		const { remark } = nodes[i];
		// eslint-disable-next-line no-await-in-loop
		const decoded = await tryDecodeRemark(polkadotApi, remark);
		if (decoded.id && decoded.id.toString() === orderId) {
			return true;
		}
	}
	return false;
}

async function getSpending(userId, skip, take) {
	const methodParams = [
		skip !== undefined && "$skip: Int",
		take !== undefined && "$take: Int",
		"$userId: String",
	].filter(Boolean).join(", ");
	const queryParams = (filter) => [
		take !== undefined && "first: $take",
		skip !== undefined && "offset: $skip",
		filter,
	].filter(Boolean).join(", ");
	return queryAllPages(
		`
		query Spending(${methodParams}) {
			merits(${queryParams("filter: { fromId: { equalTo: $userId } }")}) {
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
			transfers(${queryParams("filter: { fromId: { equalTo: $userId } }")}) {
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
			assetTransfers(${queryParams(`filter: { asset: { notEqualTo: "1" }, fromId: { equalTo: $userId } }`)}) {
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
		{ userId, skip, take },
		"merits",
		"transfers",
		"assetTransfers",
	);
}

async function fetchAllSpendings(userId, skip, take) {
	const allSpendings = (await getSpending(userId, skip, take))
		.sort((a, b) =>
			parseInt(a.block.number, 10) > parseInt(b.block.number, 10) ? -1 : 1
		);

	return allSpendings;
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
}
