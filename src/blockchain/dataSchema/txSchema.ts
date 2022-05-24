import { version, hash, hexString } from './universalSchema';
import { PQCertRootJsonDataSchema, PQCertPubKeyJsonDataSchema, PQCertGroupJsonDataSchema, PQCertJsonData } from './pqcertSchema';
import Ajv from 'ajv';

const ajv = new Ajv();

type compactType = Buffer;

type previousOutouts = { txid: string, voutn: number }[];

type vinJsonData = {
	previousOutouts: previousOutouts;
	unlockScript: string;
	sequence: number;
}

type voutJsonData = {
	value: string;
	lockScript: string;
}

type blockTxJsonData = {
	hash?: string;
	version: number;
	vin: vinJsonData[];
	vout: voutJsonData[];
	pqcert: PQCertJsonData[];
	opReturn: string
	nLockTime: number;
}

const txid = {
	type: 'string',
	pattern: '^[a-f0-9]+$',
	maxLength: 64,
	minLength: 64,
}

const previousOutouts = {
	type: 'object',
	properties: {
		txid: txid,
		voutn: {
			type: 'integer',
			minimum: 0,
			maximum: 0xffffffff	// 4 byte ( uint 32 )
		}
	}
}

const sequence = {
	type: 'integer',
	minimum: 0,
	maximum: 0xffffffff	// 4 byte ( uint 32 )
}

const value = {
	type: 'string',
	pattern: '^([0-9])+$',
}

const unlockScript = {
	type: 'string',
	pattern: '^([a-f0-9]{2})+$|^$',
}

const lockScript = {
	type: 'string',
	pattern: '^([a-f0-9]{2})+$',
}

const vinJsonDataSchema = {
	type: 'object',
	properties: {
		previousOutouts: {
			type: 'array',
			items: previousOutouts,
			//maxItems: 0xffffffffffffffffn,
			minItems: 0
		},
		unlockScript: unlockScript,
		sequence: sequence,
	},
	required: ['previousOutouts', 'unlockScript', 'sequence'],
	additionalProperties: false,
}

const voutJsonDataSchema = {
	type: 'object',
	properties: {
		value: value,
		lockScript: lockScript,
	},
	required: ['value', 'lockScript'],
	additionalProperties: false,
}

const opReturn = {
	type: 'string',
	pattern: '^([a-f0-9]{2})+$|^$',
}

const nLockTime = {
	type: 'integer',
	minimum: 0,
	maximum: 0xffffffff	// 4 byte ( uint 32 )
}

const blockTxJsonDataSchema = {
	type: 'object',
	properties: {
		version: version,
		vin: {
			type: 'array',
			items: vinJsonDataSchema,
		},
		vout: {
			type: 'array',
			items: voutJsonDataSchema,
		},
		pqcert: {
			type: 'array',
			items: {
				anyOf: [PQCertRootJsonDataSchema, PQCertPubKeyJsonDataSchema, PQCertGroupJsonDataSchema]
			}
		},
		opReturn: opReturn,
		nLockTime: nLockTime
	},
	required: ['version', 'vin', 'vout', 'pqcert'],
	//additionalProperties: false,
}

const vinJsonSchemaValidate = ajv.compile(vinJsonDataSchema);
const voutJsonSchemaValidate = ajv.compile(voutJsonDataSchema);
const blockTxJsonSchemaValidate = ajv.compile(blockTxJsonDataSchema);

export { compactType, vinJsonData, voutJsonData, blockTxJsonData, vinJsonSchemaValidate, voutJsonSchemaValidate, blockTxJsonSchemaValidate };

