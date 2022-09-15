import Ajv from 'ajv';
import { hash, uint32, hexString, uintString, booleanType } from '../../blockchain/dataSchema/universalSchema';

const ajv = new Ajv();


const getLastBlockSchema = {
	type: 'object',
	properties: {
		txsFlag: booleanType,
		raw: booleanType
	}
}

const getBlockDataByHashSchema = {
	type: 'object',
	properties: {
		hash: hash,
		txsFlag: booleanType,
		raw: booleanType
	},
	required: ['hash'],
}

const getBlockDataByHeightSchema = {
	type: 'object',
	properties: {
		height: uint32,
		txsFlag: booleanType,
		raw: booleanType
	},
	required: ['height'],
}

const getTransactionByTxidSchema = {
	type: 'object',
	properties: {
		txid: hash,
		raw: booleanType
	},
	required: ['txid'],
}

const getPqcertByHashSchema = {
	type: 'object',
	properties: {
		hash: hash,
		raw: booleanType
	},
	required: ['hash'],
}

const blockData = {
	type: 'object',
	properties: {
		hash: hash,
		header: hexString,
		txs: {
			type: 'array',
			items: hexString
		}
	},
	required: ['hash', 'header', 'txs'],

}

const newBlockSchema = {
	type: 'object',
	properties: {
		block: blockData
	},
	required: ['block']
}

const newBlockOnlyTxidsSchema = {
	type: 'object',
	properties: {
		block: {
			type: 'object',
			properties: {
				hash: hash,
				header: hexString,
				coinbaseRaw: hexString
			},
			required: ['hash', 'header', 'coinbaseRaw'],
		}
	},
	required: ['block']
}

const createTransationSchema = {
	type: 'object',
	properties: {
		tx: {
			type: 'object',
			properties: {
				vin: {
					type: 'array',
					items: {
						type: 'array',
						items: {
							type: 'object',
							properties: {
								txid: hash,
								voutn: uint32
							},
							required: ['txid', 'voutn']
						}
					}
				},
				vout: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							address: hash,
							value: uintString
						},
						required: ['address', 'value']
					}
				},
				changeAddress: hash
			},
			required: ['vin', 'vout', 'changeAddress']
		},
		replaceLS: booleanType
	},
	required: ['tx']

}

const mineSchema = {
	type: 'object',
	properties: {
		address: {
			anyOf: [
				hash,
				{ "type": 'boolean' }
			]
		},
		inCacheTxFlag: booleanType,
		testFlag: booleanType
	},
	required: ['address']
}

const getCacheTxByHashSchema = {
	type: 'object',
	properties: {
		hash: hash,
	},
	required: ['hash']
}

const walletCreateTransationSchema = {
	type: 'object',
	properties: {
		srcAddress: hash,
		tgtAddress: hash,
		value: uintString,
		extraValue: uintString,
		feeRatio: uintString,
		useAllUTXO: booleanType,
		rawFlag: booleanType,
	},
	required: ['srcAddress', 'tgtAddress', 'value']
}

const walletCreateAdvancedTransationSchema = {
	type: 'object',
	properties: {
		srcAddress: hash,
		target: {
			anyOf: [
				{
					type: 'array',
					items: {
						type: 'object',
						properties: {
							address: hash,
							value: uintString
						},
						required: ['address', 'value']
					}
				},
				uintString
			]
		},
		extraValue: uintString,
		feeRatio: uintString,
		useAllUTXO: booleanType,
		rawFlag: booleanType,
	},
	required: ['srcAddress', 'target']
}

const getBalanceSchema = {
	type: 'object',
	properties: {
		address: {
			anyOf: [
				hash,
				{
					type: 'array',
					items: hash
				}
			]
		},
	},
	required: ['address']
}

const getTxPoolSchema = {
	type: 'object',
	properties: {
		txid: hash
	},
	required: ['txid']
}

const walletAddWatchAddressSchema = {
	type: 'object',
	properties: {
		address: hash
	},
	required: ['address']
}

const walletGetTxListSchema = {
	type: 'object',
	properties: {
		address: hash,
		skip: uint32,
		limit: uint32,
		reverse: booleanType,
		normalFlag: booleanType
	},
	required: ['address']
}

const peerSchema = {
	type: 'object',
	properties: {
		ip: {
			type: 'string'
		},
		port: {
			type: 'number'
		}
	},
	required: ['ip']
}


const getLastBlockValidate = ajv.compile(getLastBlockSchema);
const getBlockDataByHashValidate = ajv.compile(getBlockDataByHashSchema);
const getBlockDataByHeightValidate = ajv.compile(getBlockDataByHeightSchema);
const getTransactionByTxidValidate = ajv.compile(getTransactionByTxidSchema);
const getPqcertByHashValidate = ajv.compile(getPqcertByHashSchema);
const getCacheTxByHashValidate = ajv.compile(getCacheTxByHashSchema);
const getBalanceValidate = ajv.compile(getBalanceSchema);
const getTxPoolValidate = ajv.compile(getTxPoolSchema);
const newBlockValidate = ajv.compile(newBlockSchema);
const createTransationValidate = ajv.compile(createTransationSchema);
const walletCreateTransationValidate = ajv.compile(walletCreateTransationSchema);
const walletCreateAdvancedTransationValidate = ajv.compile(walletCreateAdvancedTransationSchema);
const walletAddWatchAddressValidate = ajv.compile(walletAddWatchAddressSchema);
const walletGetTxListValidate = ajv.compile(walletGetTxListSchema);
const peerValidate = ajv.compile(peerSchema);
const mineValidate = ajv.compile(mineSchema);
const newBlockOnlyTxidsValidate = ajv.compile(newBlockOnlyTxidsSchema);

export {
	getLastBlockValidate,
	getBlockDataByHashValidate,
	getBlockDataByHeightValidate,
	getTransactionByTxidValidate,
	getPqcertByHashValidate,
	getCacheTxByHashValidate,
	getBalanceValidate,
	getTxPoolValidate,
	newBlockValidate,
	createTransationValidate,
	walletCreateTransationValidate,
	walletCreateAdvancedTransationValidate,
	walletAddWatchAddressValidate,
	walletGetTxListValidate,
	peerValidate,
	mineValidate,
	newBlockOnlyTxidsValidate,
}


