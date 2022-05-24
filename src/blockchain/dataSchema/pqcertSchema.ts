import { version, hash } from './universalSchema';

import Ajv from 'ajv';

const ajv = new Ajv();

type PQCertRootJsonData = {
	hash?: string;
	version: number;
	pqcertType: number;
	level: number;
	pubKeyHashes: string[];
}
type PQCertPubKeyJsonData = {
	hash?: string;
	version: number;
	pqcertType: number;
	signType: number;
	pubKey: string;
}
type PQCertGroupJsonData = {
	hash?: string;
	version: number,
	pqcertType: number,
	level: number,
	member: { address: string, lockTime: number }[],
}

type PQCertJsonData = (PQCertRootJsonData | PQCertPubKeyJsonData | PQCertGroupJsonData);

const pqcertType = {
	type: 'integer',
	minimum: 0,
	maximum: 0xff
};

const pubKeyHash = {
	type: 'string',
	pattern: '^([a-f0-9]{2})+$',
	maxLength: 64,
	minLength: 64,
};

const signType = {
	type: 'integer',
	minimum: 0,
	maximum: 0xff_ff
};

const level = {
	type: 'integer',
	minimum: 1,
	maximum: 0xff
}

const pubKey = {
	type: 'string',
	pattern: '^([a-f0-9]{2})+$',
};

const lockTime = {
	type: 'integer',
	minimum: 0,
	maximum: 0xff_ff_ff_ff
}

const member = {
	type: 'object',
	properties: {
		address: hash,
		lockTime: lockTime
	}
}

const PQCertRootJsonDataSchema = {
	type: 'object',
	properties: {
		version: version,
		pqcertType: pqcertType,
		level: level,
		pubKeyHashes: {
			type: 'array',
			items: pubKeyHash,
			maxItems: 255,
			minItems: 3
		}
	},
	required: ['version', 'pqcertType', 'pubKeyHashes'],
	//additionalProperties: false,
}

const PQCertPubKeyJsonDataSchema = {
	type: 'object',
	properties: {
		version: version,
		pqcertType: pqcertType,
		signType: signType,
		pubKey: pubKey
	},
	required: ['version', 'pqcertType', 'signType', 'pubKey'],
	//additionalProperties: false,
}

const PQCertGroupJsonDataSchema = {
	type: 'object',
	properties: {
		version: version,
		pqcertType: pqcertType,
		level: level,
		member: {
			type: 'array',
			items: member,
			maxItems: 255,
			minItems: 1
		}
	},
	required: ['version', 'pqcertType', 'level', 'member'],
	//additionalProperties: false,
}

const PQCertRootSchemaValidate = ajv.compile(PQCertRootJsonDataSchema);
const PQCertPubKeySchemaValidate = ajv.compile(PQCertPubKeyJsonDataSchema);
const PQCertGroupSchemaValidate = ajv.compile(PQCertGroupJsonDataSchema);

//------- raw -------
const dataPositionPQCertRoot = {
	// [start, end, length]
	version: [0, 4, 4],
	pqcertType: [4, 5, 1],
	level: [5, 6, 1],
	pubKeyHashAmount: [6, 7, 1],
}

const dataPositionPQCertPubKey = {
	// [start, end, length]
	version: [0, 4, 4],
	pqcertType: [4, 5, 1],	//uint8
	signType: [5, 7, 2], 	//uint16
	keylen: [7, 11, 4],		//uint32
}

const dataPositionPQCertGroup = {
	// [start, end, length]
	version: [0, 4, 4],
	pqcertType: [4, 5, 1],
	level: [5, 6, 1],
	memberAmount: [6, 7, 1],
}

export {
	PQCertRootSchemaValidate,
	PQCertPubKeySchemaValidate,
	PQCertGroupSchemaValidate,
	PQCertRootJsonData,
	PQCertPubKeyJsonData,
	PQCertGroupJsonData,
	PQCertJsonData,
	dataPositionPQCertRoot,
	dataPositionPQCertPubKey,
	dataPositionPQCertGroup,
	PQCertRootJsonDataSchema,
	PQCertPubKeyJsonDataSchema,
	PQCertGroupJsonDataSchema
};
