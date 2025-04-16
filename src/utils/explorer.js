'use strict';

const axios = require("axios");
const config = require("../../config");



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

module.exports = {
	fetchAllSpendings,
	getLastWeekEraPaidEvents,
	getSpendingCount,
}
