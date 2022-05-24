import Ajv from "ajv";
import { booleanType, uint16, uint32, uintString } from "../blockchain/dataSchema/universalSchema"
import { Secp256k1 } from "../crypto/secp256k1";
import { Falcon512 } from "../pqc/nistRound3/falcon";

const ajv = new Ajv();

const pubkeyBase64Len = Math.ceil((Falcon512.publicKeySize + Secp256k1.publicKeySize) / 3) * 4;
const base64Pattern = '^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$';

const base64Type = {
	type: 'string',
	pattern: base64Pattern
};

const stringType = {
	type: 'string'
};

const taskOpt = {
	type: 'object',
	properties: {
		taskAmount: uint32,
		cacheMax: uint32
	}
};

const p2pOpt = {
	type: 'object',
	properties: {
		peerDir: stringType,
		maxConnect: uint32,
		listenPort: uint32,
		serverDisable: booleanType
	}
};

const servicesOpt = {
	type: 'object',
	properties: {
		fullnode: booleanType,
	}
};

const eventLogOpt = {
	type: 'object',
	properties: {
		newBlock: booleanType,
		forkBlock: booleanType,
		addTx: booleanType,
		p2p: booleanType
	}
};

const coreOpt = {
	type: 'object',
	properties: {
		dbDir: stringType,
		minerFeeRatio: uintString,
		taskAmount: uint32,
		cacheMax: uint32
	}
};

const auth = {
	type: 'object',
	properties: {
		usr: stringType,
		pw: stringType
	},
	required: ['usr', 'pw'],
};

const PQCEncrypt = {
	type: 'object',
	properties: {
		signSeed: {
			type: 'string',
			pattern: base64Pattern,
			maxLength: 44,
			minLength: 44,
		},
		aesKey: {
			type: 'string',
			pattern: base64Pattern,
			maxLength: 44,
			minLength: 44,
		},
		cliPubKey: {
			type: 'string',
			pattern: base64Pattern,
			maxLength: pubkeyBase64Len,
			minLength: pubkeyBase64Len,
		},
	}
};

const rpcOpt = {
	type: 'object',
	properties: {
		hostname: stringType,
		port: uint16,
		auth: auth,
		PQCEncrypt: PQCEncrypt
	}
};

const walletHistoryOpt = {
	type: 'object',
	properties: {
		dbDir: stringType,
	}
};

const walletConfig = {
	type: 'object',
	properties: {
		rpcOpt: rpcOpt,
		walletDataPath: stringType,
		jsonSpace: booleanType,
		jsonColor: booleanType,
		addressBs58ck: booleanType,
	}
};

const config = {
	type: 'object',
	properties: {
		taskOpt: taskOpt,
		coreOpt: coreOpt,
		walletHistoryOpt: walletHistoryOpt,
		rpcOpt: rpcOpt,
		addressBs58ck: booleanType,
		p2pOpt: p2pOpt,
		servicesOpt: servicesOpt,
		eventLog: eventLogOpt
	}
};

const walletConfigValidate = ajv.compile(walletConfig);
const configValidate = ajv.compile(config);

export { walletConfigValidate, configValidate };




