
const { ApiPromise, WsProvider } = require("@polkadot/api");
const config = require("../../config");

const provider = new WsProvider(config.RPC_NODE_URL);

const TYPES = {
    Coords: {
        lat: "u64",
        long: "u64",
    },
    LandMetadata: {
        demarcation: "BoundedVec<Coords, u32>",
        type: "Text",
        status: "Text",
    },
}

let _apiCache;
const _setupApi = async () => {
	const api = await ApiPromise.create({
		provider,
		types: TYPES,
	});

	let initialVersion;
	const unsub = await api.query.system.lastRuntimeUpgrade(maybeVersionInfo => {
		const versionInfo = maybeVersionInfo.unwrap();
		if (initialVersion) {
			console.info(`Runtime upgrade detected from ${initialVersion.specVersion.toNumber()} to ${versionInfo.specVersion.toNumber()}, reinitializing API`);
			unsub();
			_apiCache = _setupApi();
		} else {
			initialVersion = versionInfo;
		}
	})

	_apiCache = api;
	return api;
}

const getApi = async () => {
	if (_apiCache) return _apiCache;
	return _setupApi();
}

module.exports = {
    getApi
}