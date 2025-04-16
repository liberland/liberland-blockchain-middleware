'use strict';

const config = require('../../config');
const {hexToU8a} = require("@polkadot/util");
const pako = require("pako");

module.exports = {
	formatSpendings(api, allSpendings) {
		const spendingsDataWithRemark = [
			[
				"Timestamp",
				"Recipient",
				"Asset",
				"Value",
				"Category",
				"Project",
				"Supplier",
				"Description",
				"Final Destination",
				"Amount In USD At Date Of Payment",
				"Date",
				"Currency",
				"Text Remark",
				"Raw Remark",
				"Block Number",
			],
			...allSpendings.map((v) => {
				let parsedRemark;
				let textRemark;
				try {
					if (v.remark) {
						const compressedData = hexToU8a(v.remark);
						const decompressed = pako.inflate(compressedData);
						parsedRemark = api
							.createType("RemarkInfo", decompressed)
							.toJSON();
						parsedRemark.date = new Date(
							parsedRemark.date
						).toISOString();
					}
				} catch (e) {
					textRemark = Buffer.from(
						v.remark.substring(2),
						"hex"
					).toString("utf-8");
				}
				return [
					v.block.timestamp,
					v.toId,
					v.asset,
					v.value,
					parsedRemark?.category ?? "-",
					parsedRemark?.project ?? "-",
					parsedRemark?.supplier ?? "-",
					parsedRemark?.description ?? "-",
					parsedRemark?.finalDestination ?? "-",
					parsedRemark?.amountInUSDAtDateOfPayment ?? "-",
					parsedRemark?.date ?? "-",
					parsedRemark?.currency ?? "-",
					textRemark ?? "-",
					v.remark,
					v.block.number,
				];
			}),
		];

		return spendingsDataWithRemark;
	},
};
