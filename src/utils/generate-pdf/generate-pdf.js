"use strict";

const fs = require("fs");
const wkhtmltopdf = require("wkhtmltopdf");
const path = require("path");
const { folderPath, outputDirectory } = require("./helpers");

async function generatePDF(res, pathName) {
	res.setHeader("Content-Type", "application/pdf");
	res.setHeader(
		"Content-Disposition",
		`attachment; filename="${pathName}.pdf"`
	);
	const filePath = `${folderPath}${outputDirectory}`;
	const pdfFilePath = path.join(
		`${__dirname}/${outputDirectory}`,
		`${pathName}.pdf`
	);
	const htmlFilePath = `${filePath}/${pathName}.html`;
	const htmlContent = fs.createReadStream(htmlFilePath);

	const options = {
		output: pdfFilePath,
		pageSize: "A5",
		orientation: "landscape",
	};
	
	wkhtmltopdf(htmlContent, options, (error) => {
		if (error) {
			res.status(500).send("Error generating PDF");
		} else {
			res.sendFile(pdfFilePath, (err) => {
				if (err) {
					res.status(500).send("Error sending PDF file");
				} else {
					fs.unlinkSync(htmlFilePath);
					fs.unlinkSync(pdfFilePath);
				}
			});
		}
	});
}

module.exports = generatePDF;
