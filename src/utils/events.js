"use strict";

const debug = require('debug')('events');
const { createSign } = require("crypto");
const stringify = require('json-stable-stringify');
const { readFileSync, existsSync } = require("fs");
const path = require("path");
const { verifyPurchase } = require("./explorer");
const { apiPromise } = require("./polkadot");
const { listHooks, webHooks } = require("./webhooks");

const pathToPrivate = path.join(__dirname, "..", "..", "private_key.pem");

function signInput(input) {
    if (!existsSync(pathToPrivate)) {
        return null;
    }
    const privateKey = readFileSync(pathToPrivate, "utf8");
  
    const sign = createSign("SHA256");
    sign.update(String(input));
    sign.end();
  
    const signature = sign.sign(privateKey, "base64");
    return signature;
}

async function triggerAndCheck(key, response) {
    const successKey = `${key}.success`;
    const failureKey = `${key}.failure`;
    const listener = new Promise((resolve) => {
        webHooks.getEmitter().on(successKey, () => {
            resolve("success");
        });
        webHooks.getEmitter().on(failureKey, async (shortname, statusCode, body) => {
            debug('Error:', statusCode, 'on', shortname, 'and body', body);
            resolve("error");
        });
    });
    webHooks.trigger(key, response, {
        secret: signInput(stringify(response)),
    });
    const result = await listener;
    return result === "success";
}

async function processOrder({
    currentBlockNumber,
    key,
}) {
    const oldest = 10000;
    try {
        if (key.startsWith("order-")) {
            const [orderId, contents] = key.split("-").slice(1);
            const {
                toId,
                price,
                assetId,
                minBlockNumber,
                lastBlockNumber,
            } = JSON.parse(Buffer.from(contents, "base64").toString("utf-8"));
            if (currentBlockNumber - lastBlockNumber > oldest) {
                await webHooks.remove(key);
            } else {
                const [isPaid, remark, fromId] = await verifyPurchase({
                    toId,
                    minBlockNumber,
                    orderId,
                    price,
                    assetId,
                });
                if (isPaid) {
                    const response = {
                        toId,
                        price,
                        orderId,
                        assetId: assetId || 'Native',
                        remark,
                        fromId,
                    };
                    const result = await triggerAndCheck(key, response, 3);
                    if (result) {
                        await webHooks.remove(key);
                    }
                }
            }
        }
    } catch (e) {
        console.error(e);
        await webHooks.remove(key);
    }
}

async function triggerOrder({
    orderId
}) {
    const api = await apiPromise;
    const header = await api.rpc.chain.getHeader();
    const currentBlockNumber = header.number;
    const registered = listHooks();
    const entries = Object.keys(registered);
    const key = entries.find((entry) => entry.startsWith("order-") && entry.split("-")[1] === orderId);
    if (key) {
        await processOrder({
            currentBlockNumber,
            key,
        });
    }
}

async function blockWatcher() {
    const interval = 3;
    const api = await apiPromise;

    api.rpc.chain.subscribeNewHeads(async (lastHeader) => {
        try {
            const currentBlockNumber = lastHeader.number.toNumber();
            if (currentBlockNumber % interval === 0) {
                const registered = listHooks();
                const entries = Object.keys(registered);
                await Promise.all(entries.map(async (key) => {
                    await processOrder({ currentBlockNumber, key });
                }));
            }
        } catch (e) {
            console.error(e);
        }
    });
}

module.exports = { blockWatcher, triggerOrder };