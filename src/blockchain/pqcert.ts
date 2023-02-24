import { shake256 } from '../crypto/hash';
import {
	PQCertPubKeySchemaValidate,
	PQCertRootSchemaValidate,
	PQCertGroupSchemaValidate,
	PQCertRootJsonData,
	PQCertPubKeyJsonData,
	PQCertGroupJsonData,
	dataPositionPQCertRoot,
	dataPositionPQCertPubKey,
	dataPositionPQCertGroup

} from './dataSchema/pqcertSchema';
import { Version } from './versionRule';

type BinaryToTextEncoding = 'base64' | 'hex';

function getType(serialize) {
	return serialize.readUInt8(dataPositionPQCertRoot.pqcertType[0]);
}

function hasDuplicates(arr: Buffer[]) {
	var obj: { [ley: string]: boolean } = {};
	for (var i = 0; i < arr.length; ++i) {
		let bufStr = arr[i].toString('hex');
		if (obj[bufStr]) {
			return true;
		}

		obj[bufStr] = true;
	}
	return false;
}

class PQCertProto {
	serialize: Buffer;
	constructor(pqcertData: Buffer, shareBuffer: boolean = false) {
		if (shareBuffer) {
			this.serialize = pqcertData;
		}
		else {
			this.serialize = Buffer.from(pqcertData);
		}
	}

	getHash(): Buffer;
	getHash(dig: BinaryToTextEncoding): string;
	getHash(dig?: BinaryToTextEncoding): Buffer | string {
		return shake256(this.serialize, dig);
	}

	get version() {
		return this.serialize.readUInt32LE();
	}
}

/**
 * Post-Quantum Certificate Root, type = 0
 */
class PQCertRoot extends PQCertProto {
	constructor(pqcertData: Buffer, shareBuffer: boolean = false) {
		super(pqcertData, shareBuffer);
	}

	verify(pqcertVer?: Version['pqcertVer']): boolean {
		if (pqcertVer !== undefined && this.version !== pqcertVer) {
			return false;
		}

		let pubHashes = this.getPubKeyHashAll();
		if (!pubHashes) {
			return false;
		}

		let duplicates = hasDuplicates(pubHashes);
		if (duplicates) {
			return false;
		}

		return PQCertRoot.isValidity(this.serialize);
	}

	getPubKeyHash(n: number): false | Buffer {
		if (n >= this.pubKeyHashAmount) {
			return false;
		}
		let bufferStart = dataPositionPQCertRoot.pubKeyHashAmount[1] + n * 32;
		return this.serialize.subarray(bufferStart, bufferStart + 32);
	}

	getPubKeyHashAll(): false | Buffer[] {
		let pubHashes = [];
		let pubKeyHashAmount = this.serialize.readUInt8(dataPositionPQCertRoot.pubKeyHashAmount[0]);
		for (let i = 0; i < pubKeyHashAmount; i++) {
			let bufferStart = dataPositionPQCertRoot.pubKeyHashAmount[1] + i * 32;
			if (bufferStart + 32 > this.serialize.length) {
				return false;
			}
			pubHashes.push(this.serialize.subarray(bufferStart, bufferStart + 32));
		}

		return pubHashes;
	}

	get json() {
		let json = PQCertRoot.serializeToJson(this.serialize);
		if (!json) {
			return json;
		}
		return json.data;
	}

	get pqcertType(): number {
		return 0;
	}

	get pubKeyHashAmount(): number {
		return this.serialize.readUInt8(dataPositionPQCertRoot.pubKeyHashAmount[0]);
	}

	get level(): number {
		return this.serialize.readUInt8(dataPositionPQCertRoot.level[0]);
	}

	static isValidity(serialize: Buffer): boolean {
		if (getType(serialize) !== 0) {
			return false;
		}

		let level = serialize.readUInt8(dataPositionPQCertRoot.level[0]);
		if (level < 2) {
			console.error('PQCertRoot level should be >= 2')
			return false;
		}

		let pubKeyHashAmount = serialize.readUInt8(dataPositionPQCertRoot.pubKeyHashAmount[0]);
		if (pubKeyHashAmount < 3) {
			console.error('PQCertRoot pubKeyHashAmount should be >= 3')
			return false;
		}
		if (level > pubKeyHashAmount) {
			console.error(`PQCertRoot level (${level}) should be <= pubKeyHashAmount (${pubKeyHashAmount})`);
			return false;
		}

		return (serialize.length === (dataPositionPQCertRoot.pubKeyHashAmount[1] + 32 * pubKeyHashAmount)) ? true : false;
	}

	static jsonDataToSerialize(jsonData: PQCertRootJsonData): Buffer | false {
		if (!PQCertRootSchemaValidate(jsonData)) {
			console.error('PQCertRoot');
			console.error(PQCertRootSchemaValidate.errors);
			return false;
		}

		if (jsonData.pqcertType !== 0) {
			console.error('pqcertType should be "0"');
			return false;
		}

		let allByte = dataPositionPQCertRoot.pubKeyHashAmount[1] + jsonData.pubKeyHashes.length * 32;
		let raw = Buffer.alloc(allByte);

		raw.writeUInt32LE(jsonData.version, dataPositionPQCertRoot.version[0]);
		raw.writeUInt8(jsonData.pqcertType, dataPositionPQCertRoot.pqcertType[0]);
		raw.writeUInt8(jsonData.level, dataPositionPQCertRoot.level[0]);
		raw.writeUInt8(jsonData.pubKeyHashes.length, dataPositionPQCertRoot.pubKeyHashAmount[0]);

		jsonData.pubKeyHashes.forEach((x, i) => {
			let start = dataPositionPQCertRoot.pubKeyHashAmount[1] + i * 32;
			raw.write(x, start, 32, 'hex');
		});

		return raw;
	}

	static serializeToJson(serialize): { data: PQCertRootJsonData, bufEndByte: number } {
		let data: PQCertRootJsonData = {
			hash: null,
			version: serialize.readUInt32LE(dataPositionPQCertRoot.version[0]),
			pqcertType: 0,
			level: 1,
			pubKeyHashes: []
		}

		data.pqcertType = serialize.readUInt8(dataPositionPQCertRoot.pqcertType[0]);
		data.level = serialize.readUInt8(dataPositionPQCertRoot.level[0]);
		let pubKeyHashAmount = serialize.readUInt8(dataPositionPQCertRoot.pubKeyHashAmount[0]);

		for (let i = 0; i < pubKeyHashAmount; i++) {
			let start = dataPositionPQCertRoot.pubKeyHashAmount[1] + 32 * i;
			let end = start + 32;
			data.pubKeyHashes[i] = serialize.toString('hex', start, end);
		}
		let bufEndByte = dataPositionPQCertRoot.pubKeyHashAmount[1] + pubKeyHashAmount * 32;
		data.hash = shake256(serialize.subarray(0, bufEndByte), 'hex');
		return { data, bufEndByte };
	}
}

/**
 * Post-Quantum Certificate PubKey, type = 1
 */
class PQCertPubKey extends PQCertProto {
	constructor(pqcertData: Buffer, shareBuffer: boolean = false) {
		super(pqcertData, shareBuffer);
	}

	verify(pqcertVer: Version['pqcertVer']): boolean {
		if (this.version !== pqcertVer) {
			return false;
		}
		return PQCertPubKey.isValidity(this.serialize);
	}

	get json() {
		let json = PQCertPubKey.serializeToJson(this.serialize);
		if (!json) {
			return json;
		}
		return json.data;
	}

	get pqcertType(): number {
		return 1;
	}

	get pubKey(): Buffer {
		let keylan = this.serialize.readUInt32LE(dataPositionPQCertPubKey.keylen[0]);
		return this.serialize.subarray(dataPositionPQCertPubKey.keylen[1], dataPositionPQCertPubKey.keylen[1] + keylan);
	}

	get signType(): number {
		return this.serialize.readUInt16LE(dataPositionPQCertPubKey.signType[0]);
	}

	static isValidity(serialize: Buffer): boolean {
		if (getType(serialize) !== 1) {
			return false;
		}

		let pubKeyLen = serialize.readUInt32LE(dataPositionPQCertPubKey.keylen[0]);

		return (serialize.length === (pubKeyLen + dataPositionPQCertPubKey.keylen[1])) ? true : false;
	}

	static jsonDataToSerialize(jsonData: PQCertPubKeyJsonData): Buffer | false {
		if (!PQCertPubKeySchemaValidate(jsonData)) {
			console.error('PQCertPubKey');
			console.error(PQCertPubKeySchemaValidate.errors);
			return false;
		}

		if (jsonData.pqcertType !== 1) {
			console.error('pqcertType should be "1"');
			return false;
		}

		let keylen = jsonData.pubKey.length >> 1;
		let allByte = dataPositionPQCertPubKey.keylen[1] + keylen;
		let raw = Buffer.alloc(allByte);

		raw.writeUInt32LE(jsonData.version, dataPositionPQCertPubKey.version[0]);
		raw.writeUInt8(jsonData.pqcertType, dataPositionPQCertPubKey.pqcertType[0]);
		raw.writeUInt16LE(jsonData.signType, dataPositionPQCertPubKey.signType[0]);
		raw.writeUInt32LE(keylen, dataPositionPQCertPubKey.keylen[0]);
		raw.write(jsonData.pubKey, dataPositionPQCertPubKey.keylen[1], keylen, 'hex');

		return raw;
	}

	static serializeToJson(serialize): { data: PQCertPubKeyJsonData, bufEndByte: number } {
		let data = {
			hash: null,
			version: serialize.readUInt32LE(dataPositionPQCertPubKey.version[0]),
			pqcertType: serialize.readUInt8(dataPositionPQCertPubKey.pqcertType[0]),
			signType: serialize.readUInt16LE(dataPositionPQCertPubKey.signType[0]),
			pubKey: null
		}

		let keyLen = serialize.readUInt32LE(dataPositionPQCertPubKey.keylen[0]);
		let bufEndByte = dataPositionPQCertPubKey.keylen[1] + keyLen;
		data.pubKey = serialize.toString('hex', dataPositionPQCertPubKey.keylen[1], bufEndByte);
		data.hash = shake256(serialize.subarray(0, bufEndByte), 'hex');
		return { data, bufEndByte };
	}
}

/**
 * Post-Quantum Certificate Group, type = 2
 */
class PQCertGroup extends PQCertProto {
	constructor(pqcertData: Buffer, shareBuffer: boolean = false) {
		super(pqcertData, shareBuffer);
	}

	verify(pqcertVer: Version['pqcertVer']): boolean {
		if (this.version !== pqcertVer) {
			return false;
		}
		return PQCertGroup.isValidity(this.serialize);
	}

	getMember(n: number): false | { hash: Buffer, lockTime: number } {
		if (n >= this.memberAmount) {
			return false;
		}
		let bufferStart = dataPositionPQCertGroup.memberAmount[1] + n * 36;
		let hash = this.serialize.subarray(bufferStart, bufferStart + 32);
		let lockTime = this.serialize.readUInt32LE(bufferStart + 32);

		return { hash, lockTime };
	}

	get level(): number {
		return this.serialize.readUInt8(dataPositionPQCertGroup.level[0]);
	}

	get pqcertType(): number {
		return 2;
	}

	get memberAmount(): number {
		return this.serialize.readUInt8(dataPositionPQCertGroup.memberAmount[0]);
	}

	get json() {
		let json = PQCertGroup.serializeToJson(this.serialize);
		if (!json) {
			return json;
		}
		return json.data;
	}

	static isValidity(serialize: Buffer): boolean {
		if (getType(serialize) !== 2) {
			return false;
		}

		let level = serialize.readUInt8(dataPositionPQCertGroup.level[0]);
		let memberAmount = serialize.readUInt8(dataPositionPQCertGroup.memberAmount[0]);
		if (level < 1) {
			console.error(`PQCertGroup level should be >= 1, use ${level}`);
			return false;
		}
		if (memberAmount < 2) {
			console.error('PQCertGroup memberAmount should be >= 2')
			return false;
		}
		if (level > memberAmount) {
			console.error('PQCertGroup level should be <= memberAmount')
			return false;
		}
		return (serialize.length === (dataPositionPQCertGroup.memberAmount[1] + 36 * memberAmount)) ? true : false;
	}

	static jsonDataToSerialize(jsonData: PQCertGroupJsonData): Buffer | false {
		if (!PQCertGroupSchemaValidate(jsonData)) {
			console.error('PQCertRoot');
			console.error(PQCertGroupSchemaValidate.errors);
			return false;
		}

		if (jsonData.pqcertType !== 2) {
			console.error('pqcertType should be "2"');
			return false;
		}

		let allByte = dataPositionPQCertGroup.memberAmount[1] + jsonData.member.length * 36;
		let raw = Buffer.alloc(allByte);

		raw.writeUInt32LE(jsonData.version, dataPositionPQCertGroup.version[0]);
		raw.writeUInt8(jsonData.pqcertType, dataPositionPQCertGroup.pqcertType[0]);
		raw.writeUInt8(jsonData.level, dataPositionPQCertGroup.level[0]);
		raw.writeUInt8(jsonData.member.length, dataPositionPQCertGroup.memberAmount[0]);

		jsonData.member.forEach((x, i) => {
			let start = dataPositionPQCertRoot.pubKeyHashAmount[1] + i * 36;
			raw.write(x.address, start, 32, 'hex');		//address
			raw.writeUInt32LE(x.lockTime, start + 32);	//lock time
		});

		return raw;
	}

	static serializeToJson(serialize): { data: PQCertGroupJsonData, bufEndByte: number } {
		let data: PQCertGroupJsonData = {
			hash: null,
			version: serialize.readUInt32LE(dataPositionPQCertGroup.version[0]),
			pqcertType: serialize.readUInt8(dataPositionPQCertGroup.pqcertType[0]),
			level: serialize.readUInt8(dataPositionPQCertGroup.level[0]),
			member: [],
		}

		let memberAmount = serialize.readUInt8(dataPositionPQCertGroup.memberAmount[0]);

		for (let i = 0; i < memberAmount; i++) {
			let start = dataPositionPQCertGroup.memberAmount[1] + i * 36;
			data.member[i] = {
				address: serialize.toString('hex', start, start + 32),
				lockTime: serialize.readUInt32LE(start + 32)
			}
		}
		let bufEndByte = dataPositionPQCertGroup.memberAmount[1] + memberAmount * 36;
		data.hash = shake256(serialize.subarray(0, bufEndByte), 'hex');
		return { data, bufEndByte };
	}
}

const pqcertTypeToClass = [PQCertRoot, PQCertPubKey, PQCertGroup];

class PQCert {
	static serializeToJson(serialize: Buffer): { data: pqcertJson, bufEndByte: number } | false {
		let pqcertType = getType(serialize);

		let fuc = pqcertTypeToClass[pqcertType]?.serializeToJson;

		if (fuc) {
			return fuc(serialize);
		}
		return false;
	}
}

type pqcertJson = PQCertRootJsonData | PQCertPubKeyJsonData | PQCertGroupJsonData;
type PQCertType = (PQCertRoot | PQCertPubKey | PQCertGroup);

function createPQCert(PQCertClass: any, pqcertData: Buffer | pqcertJson, shareBuffer: boolean = false): any {
	let temp;
	if (Buffer.isBuffer(pqcertData)) {
		temp = pqcertData;
	}
	else {
		temp = PQCertClass.jsonDataToSerialize(pqcertData);
		if (!temp) {
			return false;
		}
		shareBuffer = true;
	}

	if (!PQCertClass.isValidity(temp)) {
		return false;
	}

	return new PQCertClass(temp, shareBuffer);
}

function createPQCertRoot(pqcertData: Buffer | PQCertRootJsonData, shareBuffer: boolean = false): PQCertRoot | false {
	return createPQCert(PQCertRoot, pqcertData, shareBuffer);
}

function createPQCertPubKey(pqcertData: Buffer | PQCertPubKeyJsonData, shareBuffer: boolean = false): PQCertPubKey | false {
	return createPQCert(PQCertPubKey, pqcertData, shareBuffer);
}

function createPQCertGroup(pqcertData: Buffer | PQCertGroupJsonData, shareBuffer: boolean = false): PQCertGroup | false {
	return createPQCert(PQCertGroup, pqcertData, shareBuffer);
}

export { getType, PQCertRoot, PQCertPubKey, PQCertGroup, PQCert, createPQCertRoot, createPQCertPubKey, createPQCertGroup, PQCertType };