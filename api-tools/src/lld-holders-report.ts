import { ApiPromise, WsProvider } from "@polkadot/api";
import { BN } from "@polkadot/util";

const known_addresses: { [key: string]: string } = {
	"5EYCAe5hvejUE1BUTDSnxDfCqVkADRicSKqbcJrduV1KCDmk": "Vault",
	"5EYCAe5hveooUENA5d7dwq3caqM4LLBzktNumMKmhNRXu4JE": "Senate",
	"5EYCAe5iXF2YZuVZv1vig4xvf1CcDVocZCWYrv3TVSXpMTYA": "Citizenship Office",
	"5EYCAe5ijiYfyeZ2JJCGq56LmPyNRAKzpG4QkoQkkQNB5e6Z": "Treasury",
	"5EYCAe5g8CDuMsTief7QBxfvzDFEfws6ueXTUhsbx5V81nGH": "Congress",
	"5EYCAe5ijGqt3WEM9aKUBdth51NEBNz9P84NaUMWZazzWt7c":
		"Politipool technical account",
	"5GmkwXZ94cuLMMbtE5VtBaLpFDehoEpy6MZnJhkCSicxePs2": "SORA Bridge",
	"5DSfG3S7qSZzrDMj3F3qYybXAy1BLsVpRG5CNwRdwwNPjgVm": "MEXC",
	"5HEX1wk33NHAeEJV3B6goDHMJTqhy411znCUmfEAxKkQeqds": "Coinstore",
	"5EYCAe5iXF2YZiuxDWAcwtPMDaG7ihsYzPxajcNKRpNyD1Zi":
		"Company Registry Office",
	"5EYCAe5iXF2YZzoQHqGhj9dtcsUNB4puM5GqR1BwVHZyaWxM": "Land Registry Office",
	"5EYCAe5iXF2Ya2c2iKjeFWUAXAEcMyoKCBPvhRy8YprHTLNd":
		"Metaverse Land Registry Office",
	"5EYCAe5iXF2YZfPZ4arKGSYZvQruDacGHkuw4qAsQSQsKpMK": "Asset Registry Office",
	"5EYCAe5iXF2YZpCZr7ALYUUYaNpMXde3NUXxYn1Sc1YRM4gV":
		"Ministry of Finance Office",
	"5FBQRNJfzsttYvw1XnSwxwSUmb7A3EYm4q8aiscADREqvzYz":
		"Wrapped LLD Token Contract",
	"5GsBCWqN6mnrq4arSMBuT4uQ8GJKwgeBsa5UyCvTN6DyVj3S": "Emirex",
};

const formatBalance = (v: BN) => v.div(new BN(1000000000000)).toString();

async function main() {
	const wsProvider = new WsProvider("wss://mainnet.liberland.org");
	const api = await ApiPromise.create({ provider: wsProvider });

	const data: any = {};

	const accounts = await api.query.system.account.entries();
	accounts.forEach(([{ args: key }, acc]) => {
		const address = key.toString();
		const details = (acc as any).data;
		const liquid_lld_balance = formatBalance(
			details.free.sub(details.frozen)
		);
		const frozen_lld_balance = formatBalance(details.frozen);
		const reserved_lld_balance = formatBalance(details.reserved);
		const total_lld_balance = formatBalance(
			details.free.add(details.reserved)
		);
		data[address] = {
			liquid_lld_balance,
			frozen_lld_balance,
			reserved_lld_balance,
			total_lld_balance,
			address,
		};
	});

	const identities = await api.query.identity.identityOf.entries();
	identities.forEach(([{ args: key }, acc]) => {
		const address = key.toString();
		const raw = (acc as any).toJSON().info.display.raw ?? "0x";
		const display = Buffer.from(raw.substring(2), "hex").toString("utf-8");
		if (data[address] === undefined) data[address] = { address };
		const id = (acc as any).unwrap();
		data[address].display = display;
		data[address].identity = id.info.toHuman();
		data[address].is_citizen =
			id.info.additional.some(
				([k, v]: [any, any]) => k.asRaw.eq("citizen") && v.asRaw.eq("1")
			) &&
			id.judgements.some(
				([registrar, judgement]: [any, any]) =>
					registrar.eq(0) && judgement.isKnownGood
			);
		data[address].is_eresident =
			id.info.additional.some(
				([k, v]: [any, any]) =>
					k.asRaw.eq("eresident") && v.asRaw.eq("1")
			) &&
			id.judgements.some(
				([registrar, judgement]: [any, any]) =>
					registrar.eq(0) && judgement.isKnownGood
			);
	});

	const llmLiquid = await api.query.assets.account.entries(1);
	llmLiquid.forEach(([{ args: key }, value]: [any, any]) => {
		const address = key[1].toString();
		if (value.isSome) {
			if (data[address] === undefined) data[address] = { address };
			data[address].liquid_llm_balance = formatBalance(
				value.unwrap().balance
			);
		}
	});

	const llmStaked = await api.query.llm.llmPolitics.entries();
	llmStaked.forEach(([{ args: key }, value]: [any, any]) => {
		const address = key[0].toString();
		if (data[address] === undefined) data[address] = { address };
		data[address].staked_llm_balance = formatBalance(value);
	});

	console.log(
		"address;display;total_lld;liquid_lld;frozen_lld (mostly staked);reserved_lld (deposits);staked_merits;liquid_merits;is_confirmed_citizen;is_confirmed_eresident;identity_data"
	);
	const values = Object.values(data);
	values.sort((a: any, b: any) =>
		BigInt(b.total_lld_balance ?? 0) > BigInt(a.total_lld_balance ?? 0)
			? 1
			: -1
	);
	values.forEach((v: any) => {
		const display =
			known_addresses[v.address] ?? v.display?.replace(";", " ") ?? "";
		const identity = JSON.stringify(v.identity ?? null).replace(";", " ");
		console.log(
			[
				v.address,
				display,
				v.total_lld_balance ?? 0,
				v.liquid_lld_balance ?? 0,
				v.frozen_lld_balance ?? 0,
				v.reserved_lld_balance ?? 0,
				v.staked_llm_balance ?? 0,
				v.liquid_llm_balance ?? 0,
				v.is_citizen ?? false,
				v.is_eresident ?? false,
				identity,
			].join(";")
		);
	});
}

main()
	.catch(console.error)
	.finally(() => process.exit());
