const config = require("../../config");

const CONGRESS_ADDRESS = "5EYCAe5g8CDuMsTief7QBxfvzDFEfws6ueXTUhsbx5V81nGH";

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

async function getLLMSpendings() {
	const data = await queryAllPages(
		`
		query LLM($after: Cursor, $userId: String) {
			merits(first: 50, after: $after, filter: { fromId: { equalTo: $userId } }) {
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
		{ userId: CONGRESS_ADDRESS },
		"merits"
	);
	return data.flat().map((v) => ({ asset: "LLM", ...v }));
}

async function getAssetsSpendings() {
	const data = await queryAllPages(
		`
		query Assets($after: Cursor, $userId: String) {
			assetTransfers(first: 50, after: $after, filter: { asset: { notEqualTo: "1" }, fromId: { equalTo: $userId } }) {
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
		{ userId: CONGRESS_ADDRESS },
		"assetTransfers"
	);
	return data.flat();
}

async function getLLDSpendings() {
	const data = await queryAllPages(
		`
		query LLD($after: Cursor, $userId: String) {
			transfers(first: 50, after: $after, filter: { fromId: { equalTo: $userId } }) {
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
		{ userId: CONGRESS_ADDRESS },
		"transfers"
	);
	return data.flat().map((v) => ({ asset: "LLD", ...v }));
}

async function fetchAllCongressSpendings() {
	const allSpendings = [
		await getLLDSpendings(),
		await getLLMSpendings(),
		await getAssetsSpendings(),
	]
		.flat()
		.sort((a, b) =>
			parseInt(a.block.number) > parseInt(b.block.number) ? -1 : 1
		);

	return allSpendings;
}

module.exports = {
	fetchAllCongressSpendings,
};
