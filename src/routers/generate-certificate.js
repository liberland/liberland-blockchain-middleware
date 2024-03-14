"use strict";

const pako = require("pako");
const generateHTML = require("../utils/generate-pdf/generate-html");
const generatePDF = require("../utils/generate-pdf/generate-pdf");
const formatDate = require("../utils/format-date");

async function generateCertificate(req, res, apiPromise) {
	const { companyId, pathName, blockNumber } = req.body;
	const api = await apiPromise;
	const maybeRegistration = await api.query.companyRegistry.registries(
		0,
		companyId
	);
	if (maybeRegistration.isNone) {
		res.status(500).send("Company with this id don't exist.");
		return;
	}
	const registration = maybeRegistration.unwrap();
	console.log(registration);
	const registrationData = api.createType(
		"CompanyData",
		pako.inflate(registration.data)
	);
	console.log(registrationData);
	const customData = {
		blockNumber,
		companyId,
		pathName,
		companyName: registrationData.name.toString(),
		purpose: registrationData.purpose.toString(),
		date: formatDate(new Date(Date.now())),
	};
	const customPath = pathName + companyId;

	await generateHTML(customData, "certificate", customPath);
	await generatePDF(res, customPath);
}

module.exports = generateCertificate;
