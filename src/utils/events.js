"use strict";

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
                    if (key.startsWith("order-")) {
                        const {
                            toId,
                            price,
                            orderId,
                            minBlockNumber,
                            lastBlockNumber,
                        } = JSON.parse(Buffer.from(key.split("order-")[1], "base64").toString("utf-8"));
                        if (currentBlockNumber - lastBlockNumber > oldest) {
                            await webHooks.remove(key);
                        } else {
                            const isPaid = await verifyPurchase({
                                toId,
                                minBlockNumber,
                                orderId,
                                price,
                            });
                            if (isPaid) {
                                webHooks.trigger(key, {
                                    toId,
                                    price,
                                    orderId,
                                }, {
                                    secret: signInput(orderId),
                                });
                                await webHooks.remove(key);
                            }
                        }
                    }
                }));
            }
        } catch (e) {
            console.error(e);
        }
    });
}

module.exports = { blockWatcher };