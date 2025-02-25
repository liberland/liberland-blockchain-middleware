"use strict";

// eslint-disable-next-line import/no-extraneous-dependencies
const pako = require("pako");
const generateHTML = require("../utils/generate-pdf/generate-html");
const generatePDF = require("../utils/generate-pdf/generate-pdf");
const formatDate = require("../utils/format-date");

async function generateCertificate(req, res, apiPromise) {
	try {
		const { companyId, pathName, blockNumber } = req.body;
		const api = await apiPromise;
		const maybeRegistration = await api.query.companyRegistry.registries(
			0,
			companyId
		);
		console.log(maybeRegistration.isNone)
		if (maybeRegistration.isNone) {
			res.status(500).send("Company with this id don't exist.");
			return;
		}
		const registration = maybeRegistration.unwrap();
		const decompressedData = pako.inflate(registration.data);
		const registrationData = api.createType(
			"CompanyData",
			decompressedData
		);

		const customData = {
			blockNumber,
			companyId,
			pathName,
			companyName: registrationData.name,
			companyType: registrationData.companyType,
			date: formatDate(new Date(Date.now())),
		};
		const customPath = pathName + companyId;
		await generateHTML(customData, "certificate", customPath);
		await generatePDF(res, customPath);
	} catch (err) {
		console.error("Error when generating certificate", err);
	}
}

module.exports = generateCertificate;
