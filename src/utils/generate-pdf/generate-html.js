"use strict";

const fs = require("fs");
const ejs = require("ejs");
const path = require("path");
const { outputDirectory, folderPath, textsPdf } = require("./helpers");
const borderBase64 = require("./border");

function handleError(error) {
	console.error("An error occurred:", error.message);
}

async function saveHtmlFile(htmlString, outputFile) {
	fs.writeFile(outputFile, htmlString, (err) => {
		if (err) {
			handleError(err);
		} else {
			console.log("HTML file saved successfully:", outputFile);
		}
	});
}

async function generateHTML(data, pathEJS, customPath) {
	const url = `${folderPath}${outputDirectory}`;
	fs.mkdirSync(url, { recursive: true });
	const ejsFilePath = path.join(url, path.basename(`${pathEJS}.ejs`));
	ejs.renderFile(
		ejsFilePath,
		{ ...data, borderBase64, textsPdf },
		(err, htmlString) => {
			if (err) {
				handleError(err);
			} else {
				const htmlFilePath = path.join(
					url,
					path.basename(`${customPath}.html`)
				);
				saveHtmlFile(htmlString, htmlFilePath);
			}
		}
	);
}

module.exports = generateHTML;
