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
                                const [isPaid, remark] = await verifyPurchase({
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
                                    };
                                    webHooks.trigger(key, response, {
                                        secret: signInput(JSON.stringify(response)),
                                    });
                                    await webHooks.remove(key);
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