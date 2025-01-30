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


async function queryAllPages(query, variables, key) {
	let allData = [];
	let after = undefined;
	while (true) {
		const result = await fetch(config.EXPLORER_API_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ query, variables: { after, ...variables } }),
		});
		const data = await result.json();
		allData.push(data.data[key].nodes);
		if (data.data[key].pageInfo.hasNextPage) {
			after = data.data[key].pageInfo.endCursor;
		} else {
			break;
		}
	}
	return allData;
}

async function getLLMSpendings(userId, numResults) {
	const data = await queryAllPages(
		`
		query LLM($after: Cursor, $userId: String, $numResults: Int) {
			merits(first: $numResults, after: $after, filter: { fromId: { equalTo: $userId } }) {
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
				pageInfo {
					hasNextPage,
					endCursor
				}
			}
		}
		`,
		{ userId, numResults },
		"merits"
	);
	return data.flat().map((v) => ({ asset: "LLM", ...v }));
}

async function getAssetsSpendings(userId, numResults) {
	const data = await queryAllPages(
		`
		query Assets($after: Cursor, $userId: String, $numResults: Int) {
			assetTransfers(first: $numResults, after: $after, filter: { asset: { notEqualTo: "1" }, fromId: { equalTo: $userId } }) {
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
				pageInfo {
					hasNextPage,
					endCursor
				}
			}
		}
		`,
		{ userId, numResults },
		"assetTransfers"
	);
	return data.flat();
}

async function getLLDSpendings(userId, numResults) {
	const data = await queryAllPages(
		`
		query LLD($after: Cursor, $userId: String, $numResults: Int) {
			transfers(first: $numResults, after: $after, filter: { fromId: { equalTo: $userId } }) {
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
				pageInfo {
					hasNextPage,
					endCursor
				}
			}
		}
		`,
		{ userId, numResults },
		"transfers"
	);
	return data.flat().map((v) => ({ asset: "LLD", ...v }));
}

async function fetchAllSpendings(userId, numResults) {
	const allSpendings = [
		await getLLDSpendings(userId, numResults),
		await getLLMSpendings(userId, numResults),
		await getAssetsSpendings(userId, numResults),
	]
		.flat()
		.sort((a, b) =>
			parseInt(a.block.number) > parseInt(b.block.number) ? -1 : 1
		);

	return allSpendings;
}

module.exports = {
	fetchAllSpendings,
	getLastWeekEraPaidEvents,
}
