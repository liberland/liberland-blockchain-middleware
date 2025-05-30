"use strict";

const { readFileSync } = require("fs");
const WebHooks = require("node-webhooks");
const path = require("path");

const webhooksPath = path.join(__dirname, "..", "..", "webhooksDB.json");

const webHooks = new WebHooks({
    db: webhooksPath,
    httpSuccessCodes: [200, 201],
});

function listHooks() {
    return JSON.parse(readFileSync(webhooksPath, {
        encoding: "utf-8",
    }) || "{}");
}

module.exports = { webHooks, listHooks };