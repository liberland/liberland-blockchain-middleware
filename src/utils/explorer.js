'use strict';

const axios = require("axios");
const { hexToU8a, isHex } = require("@polkadot/util");
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

const taxQuery = ({ offset, first, startBlock }) => `
  query taxQuery {
    taxUnPools(offset: ${offset}, first: ${first}, orderBy: BLOCK_NUMBER_DESC, filter: { blockNumber: { greaterThan: "${startBlock}" } }){
      nodes{
        value
        addressId
		blockNumber
      }
    }
    taxPools(offset: ${offset}, first: ${first}, orderBy: BLOCK_NUMBER_DESC, filter: { blockNumber: { greaterThan: "${startBlock}" } }){
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

const tryDecodeGovtRemark = (polkadotApi, decompressed) => {
	try {
		return polkadotApi.createType('RemarkInfo', decompressed).toJSON();
	} catch (_) {
		return {};
	}
};

const tryDecodeUserRemark = (polkadotApi, decompressed) => {
	try {
		return polkadotApi.createType('RemarkInfoUser', decompressed).toJSON();
	} catch (_) {
		return {};
	}
};

const tryDecodeRemark = async (polkadotApi, dataToDecode) => {
	try {
		const compressedData = hexToU8a(dataToDecode);
		const decompressed = pako.inflate(compressedData);
		const maybeGovt = tryDecodeGovtRemark(polkadotApi, decompressed);
		if (maybeGovt.finalDestination) {
			return [maybeGovt, 'govt'];
		}
		const maybeUser = tryDecodeUserRemark(polkadotApi, decompressed);
		if (maybeUser.id) {
			return [maybeUser, 'user'];
		}
		return [{}, 'none'];
	} catch (_) {
		return [{}, 'none'];
	}
};

const getFromMaybeHex = (maybeHex) => {
	if (isHex(maybeHex)) {
		// eslint-disable-next-line no-undef
		return BigInt(maybeHex).toString();
	}
	return maybeHex.toString();
}

async function verifyPurchase({
	toId,
	price,
	orderId,
	assetId,
	minBlockNumber,
}) {
	const query = assetId ? `
		query AssetVerification {
			assetTransfers(
				filter: {
					remark: { isNull: false },
					asset: { equalTo: "${assetId}" }
					toId: { equalTo: "${toId}" },
					value: { equalTo: "${price}" },
					blockNumber: { greaterThan: "${minBlockNumber}" }
				}
			) {
				nodes {
					remark
					fromId
				}
			}
		}
	` : `
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
					fromId
				}
			}
		}
	`;
	const { data } = await getApi().post('', {
		query,
	});
	const transfers = data.data && data.data[assetId ? "assetTransfers" : "transfers"];
	const nodes = transfers && transfers.nodes;
	if (!Array.isArray(nodes)) {
		return [false];
	}
	const api = await apiPromise;
	for (let i = 0; i < nodes.length; i++) {
		const { remark, fromId } = nodes[i];
		// eslint-disable-next-line no-await-in-loop
		const [decoded, type] = await tryDecodeRemark(api, remark);
		switch (type) {
			case "user":
				if (decoded.id && getFromMaybeHex(decoded.id) === orderId.toString()) { // Ensure we don't get a number here
					return [true, decoded.description, fromId];
				}
				break;
			case "govt":
				// eslint-disable-next-line no-case-declarations
				const [ethAddress, id] = decoded.finalDestination.split(", ");
				if (id === orderId) {
					return [true, ethAddress, fromId];
				}
				break;
			default:
				break;
		}
		
	}
	return [false];
}

async function createPurchase({
	toId,
	price,
	orderId,
	assetId,
	minBlockNumber,
	lastBlockNumber,
	callback,
}) {
	const name = `order-${orderId}-${Buffer.from(JSON.stringify({
		toId,
		price,
		assetId,
		minBlockNumber,
		lastBlockNumber,
	}), "utf-8").toString("base64")}`;
	await webHooks.add(name, callback);
}

async function fetchAllSpendings(userId) {
	const apiResults = [];
	const first = 30;
	let offset = 0;
	// eslint-disable-next-line no-constant-condition
	while (true) {
		const parameters = {
			query: `query Spending($userId: String, $first: Int, $offset: Int) {
				merits(filter: { fromId: { equalTo: $userId } }, first: $first, offset: $offset) {
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
				transfers(filter: { fromId: { equalTo: $userId } }, first: $first, offset: $offset) {
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
				assetTransfers(filter: { asset: { notEqualTo: "1" }, fromId: { equalTo: $userId } }, first: $first, offset: $offset) {
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
			}`,
			variables: { userId, first, offset }
		};
		// eslint-disable-next-line no-await-in-loop
		const { data } = await getApi().post('', parameters);
		const apiResult = ["merits", "transfers", "assetTransfers"].flatMap(key => {
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
		});
		if (apiResult.length === 0) {
			break;
		}
		apiResults.push(...apiResult);
		offset += first;
	}

	return apiResults.sort(({ block: aBlock }, { block: bBlock }) => parseInt(bBlock.number, 10) - parseInt(aBlock.number, 10))
}

const getTaxList = async ({ startBlock }) => {
	let offset = 0;
	const first = 1000;
	const acc = {
		taxPools: { nodes: [] },
		taxUnPools: { nodes: [] },
	};
	// eslint-disable-next-line no-constant-condition
	while (true) {
		// eslint-disable-next-line no-await-in-loop
		const { data } = await getApi().post('', {
			query: taxQuery({ first, offset, startBlock })
		});
		const taxPools = data.data.taxPools.nodes;
		const taxUnPools = data.data.taxUnPools.nodes;
		acc.taxPools.nodes.push(...taxPools);
		acc.taxUnPools.nodes.push(...taxUnPools);
		if (taxPools.length === 0 && taxUnPools.length === 0) {
			break;
		}
		offset += first;
	}

	return acc;
};

module.exports = {
	fetchAllSpendings,
	getLastWeekEraPaidEvents,
	getTaxList,
	verifyPurchase,
	createPurchase,
}
