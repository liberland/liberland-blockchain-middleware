const { processHolders } = require("./lld-holders-processor");

async function main() {
	console.log(
		"address;display;total_lld;liquid_lld;frozen_lld (mostly staked);reserved_lld (deposits);staked_merits;liquid_merits;is_confirmed_citizen;is_confirmed_eresident;identity_data"
	);
	(await processHolders()).forEach((v: any) => {
		console.log(
			[
				v.address,
				v.display,
				v.total_lld_balance,
				v.liquid_lld_balance,
				v.frozen_lld_balance,
				v.reserved_lld_balance,
				v.staked_llm_balance,
				v.liquid_llm_balance,
				v.is_citizen,
				v.is_eresident,
				v.identity,
			].join(";")
		);
	});
}

main()
	.catch(console.error)
	.finally(() => process.exit());
