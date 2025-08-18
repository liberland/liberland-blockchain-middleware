"use strict";

const debug = require('debug')('events');
const { createSign } = require("crypto");
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

function orderKeysAlphabetically(obj) {
    return Object
        .entries(obj)
        .sort(([aKey], [bKey]) => aKey.localeCompare(bKey, "en"))
        .reduce((acc, [key, value]) => {
            acc[key] = value;
            return acc;
        }, {});
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
        secret: signInput(JSON.stringify(response)),
    });
    const result = await listener;
    return result === "success";
}

async function blockWatcher() {
    const interval = 3;
    const oldest = 10000;
    const api = await apiPromise;

    api.rpc.chain.subscribeNewHeads(async (lastHeader) => {
        try {
            const currentBlockNumber = lastHeader.number.toNumber();
            if (currentBlockNumber % interval === 0) {
                const registered = listHooks();
                const entries = Object.keys(registered);
                await Promise.all(entries.map(async (key) => {
                    try {
                        if (key.startsWith("order-")) {
                            const {
                                toId,
                                price,
                                orderId,
                                assetId,
                                minBlockNumber,
                                lastBlockNumber,
                            } = JSON.parse(Buffer.from(key.split("order-")[1], "base64").toString("utf-8"));
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
                                    const response = orderKeysAlphabetically({
                                        toId,
                                        price,
                                        orderId,
                                        assetId: assetId || 'Native',
                                        remark,
                                        fromId,
                                    });
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
                }));
            }
        } catch (e) {
            console.error(e);
        }
    });
}

module.exports = { blockWatcher };