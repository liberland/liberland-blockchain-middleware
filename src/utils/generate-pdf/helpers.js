"use strict";

const outputDirectory = "files";
const folderPath = "./src/utils/generate-pdf/";

const textsPdf = {
	title: "Certificate of Incorporation",
	subtitle:
		"Issued in accordance with the Company Law of the Free Republic of Liberland, henceforth 'Liberland'",
	firstParagraphPart1: "Let it be known to all concerned parties that",
	firstParagraphPart2:
		"has COMPLIED with all the relevant provisions of the Law of Liberland relating to the incorporation of companies.",
	secondParagraphPart1:
		"Now, therefore, the Registrar of Companies of Liberland does hereby grant and issue to said",
	secondParagraphPart2:
		"this Certificate of Incorporation, and authorizes the above named Company to exercise the functions of a Company according to the Law of Liberland",
	date: "Date of issue",
	registrar: "Registrar of Companies of Liberland",
};

module.exports = {
	outputDirectory,
	folderPath,
	textsPdf,
};
