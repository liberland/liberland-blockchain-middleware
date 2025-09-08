"use strict";

const { ApiPromise, WsProvider } = require("@polkadot/api");
const config = require("../../config");
const { formatLLDWithDecimals } = require("./common");

const provider = new WsProvider(config.RPC_NODE_URL);
const apiPromise = ApiPromise.create({
    provider,
    types: {
        Coords: {
            lat: "u64",
            long: "u64",
        },
        LandMetadata: {
            demarcation: "BoundedVec<Coords, u32>",
            type: "Text",
            status: "Text",
        },
        Encryptable: {
            value: 'Text',
            isEncrypted: 'bool',
        },
        BrandName: {
            name: 'Encryptable',
        },
        Contact: {
            contact: 'Encryptable',
        },
        OnlineAddress: {
            description: 'Encryptable',
            url: 'Encryptable',
        },
        PhysicalAddress: {
            description: 'Encryptable',
            street: 'Encryptable',
            city: 'Encryptable',
            // Subdivision - state/province/emirate/oblast/etc
            subdivision: 'Encryptable',
            postalCode: 'Encryptable',
            country: 'Encryptable', // FIXME enum?
        },
        Person: {
            walletAddress: 'Encryptable',
            name: 'Encryptable',
            dob: 'Encryptable',
            passportNumber: 'Encryptable',
        },
        Principal: {
            walletAddress: 'Encryptable',
            name: 'Encryptable',
            dob: 'Encryptable',
            passportNumber: 'Encryptable',
            signingAbility: 'Encryptable', // FIXME enum
            signingAbilityConditions: 'Encryptable',
            shares: 'Encryptable', // FIXME integer?
        },
        Shareholder: {
            walletAddress: 'Encryptable',
            name: 'Encryptable',
            dob: 'Encryptable',
            passportNumber: 'Text',
            shares: 'Encryptable', // FIXME integer?
        },
        UBO: {
            walletAddress: 'Encryptable',
            name: 'Encryptable',
            dob: 'Encryptable',
            passportNumber: 'Encryptable',
            signingAbility: 'Encryptable', // FIXME enum
            signingAbilityConditions: 'Encryptable',
        },
        RelevantAsset: {
            assetId: 'Encryptable',
        },
        RelevantContract: {
            contractId: 'Encryptable',
        },
        CompanyData: {
            name: 'Text',
            // Truthful scope of business
            purpose: 'Text',
            logoURL: 'Text',
            charterURL: 'Text',
            totalCapitalAmount: 'Text', // FIXME integer instead? Will have issues with decimals though.
            totalCapitalCurrency: 'Text', // FIXME maybe some enum?
            numberOfShares: 'Text', // FIXME integer instead? Are fractional shares supported
            valuePerShare: 'Text', // FIXME same as totalCapitalAmount probably
            // History of transfer of shares
            history: 'Text', // FIXME array of well defined structs?
            brandNames: 'Vec<BrandName>',
            onlineAddresses: 'Vec<OnlineAddress>',
            physicalAddresses: 'Vec<PhysicalAddress>',
            statutoryOrganMembers: 'Vec<Person>',
            principals: 'Vec<Principal>',
            shareholders: 'Vec<Shareholder>',
            UBOs: 'Vec<UBO>',
            relevantAssets: 'Vec<RelevantAsset>',
            relevantContracts: 'Vec<RelevantContract>',
            companyType: 'Text',
            contact: 'Vec<Contact>',
        },
        RemarkInfo: {
            category: 'Text',
            project: 'Text',
            supplier: 'Text',
            description: 'Text',
            finalDestination: 'Text',
            amountInUSDAtDateOfPayment: 'u64',
            date: 'u64',
            currency: 'Text',
        },
        RemarkInfoUser: {
            id: 'u64',
            description: 'Text',
        },
    },
});

async function getLiquidAvailable({ asNumber } = {}) {
    const api = await apiPromise;
    const issuance = await api.query.balances.totalIssuance();
    const era = (await api.query.staking.activeEra()).unwrap().index;
    const totalStaked = await api.query.staking.erasTotalStake(era);
    const liquidSupply = issuance.sub(totalStaked);
    return asNumber ? Number(liquidSupply.toString()) : formatLLDWithDecimals(liquidSupply);
}

async function getTotalIssuance({ asNumber } = {}) {
    const api = await apiPromise;
    const issuance = await api.query.balances.totalIssuance();
    return asNumber ? Number(issuance.toString()) : formatLLDWithDecimals(issuance);
}

module.exports = { apiPromise, getLiquidAvailable, getTotalIssuance };