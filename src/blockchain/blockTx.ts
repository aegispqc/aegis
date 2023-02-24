import { PQCert, createPQCertRoot, createPQCertPubKey, createPQCertGroup, PQCertType, PQCertRoot, PQCertPubKey, PQCertGroup } from './pqcert';
import { getCompactSizeBufferByNumber, BufferReader } from './util';
import {
	vinJsonData, voutJsonData, blockTxJsonData,
	vinJsonSchemaValidate, voutJsonSchemaValidate, blockTxJsonSchemaValidate
} from './dataSchema/txSchema';
import { PQCertRootJsonData, PQCertPubKeyJsonData, PQCertGroupJsonData } from './dataSchema/pqcertSchema';
import { shake256 } from '../crypto/hash';
import { Version } from './versionRule';

type BinaryToTextEncoding = 'base64' | 'hex';

class Vin {
	serialize: Buffer;

	constructor(buf: Buffer, shareBuffer: boolean = false) {
		if (shareBuffer) {
			this.serialize = buf;
		}
		else {
			this.serialize = Buffer.from(buf);
		}
	}

	resetUnlockScript(newUnlockScript: Buffer): boolean {
		let temp = [];

		let bufReader = new BufferReader(this.serialize);
		let previousOutputCount = bufReader.readCompactSize();
		if (previousOutputCount === false) {
			return false;
		}

		bufReader.addReadOffset(36 * previousOutputCount);

		temp.push(this.serialize.subarray(0, bufReader.getReadOffset()));

		let newScriptByte = getCompactSizeBufferByNumber(newUnlockScript.length);
		temp.push(newScriptByte);
		temp.push(newUnlockScript);
		temp.push(this.serialize.subarray(-4));
		this.serialize = Buffer.concat(temp);

		return true;
	}

	getUnlockScript(): false | Buffer {
		let bufReader = new BufferReader(this.serialize);
		let previousOutputCount = bufReader.readCompactSize(); //lastvout count
		if (previousOutputCount === false) {
			return false;
		}

		bufReader.addReadOffset(36 * previousOutputCount); //lastvout hash

		let scriptByte = bufReader.readCompactSize();
		if (scriptByte === false) {
			return false;
		}

		return bufReader.subarray(scriptByte);
	}

	getLastVoutHash(n): { hash: Buffer, voutn: number } | false {
		let bufReader = new BufferReader(this.serialize);
		let previousOutputCount = bufReader.readCompactSize();
		if (previousOutputCount === false) {
			return false;
		}

		if (n >= previousOutputCount) {
			return false;
		}

		let start = bufReader.getReadOffset() + 36 * n;
		let hash = this.serialize.subarray(start, start + 32);
		let voutn = this.serialize.readInt32LE(start + 32);

		return { hash, voutn };
	}

	getLastVoutHashAll(): { hash: Buffer, voutn: number }[] | false {
		let bufReader = new BufferReader(this.serialize);
		let previousOutputCount = bufReader.readCompactSize();
		if (previousOutputCount === false) {
			return false;
		}
		let data = [];
		for (let i = 0; i < previousOutputCount; i++) {
			data[i] = {};
			data[i].hash = bufReader.subarray(32);
			bufReader.addReadOffset(32);
			data[i].voutn = bufReader.readUInt32LE();
		}

		return data;
	}

	isCoinBase(height?: number): boolean {
		let bufReader = new BufferReader(this.serialize);
		let previousOutputCount = bufReader.readCompactSize();
		if (previousOutputCount !== 0) {
			return false;
		}

		if (height) {
			let unlokckScript = this.getUnlockScript();
			if (!unlokckScript) {
				return false;
			}

			if (unlokckScript.length !== 4) {
				return false;
			}

			if (height !== unlokckScript.readUInt32LE()) {
				return false;
			}
		}

		return true;
	}

	get json() {
		let json = Vin.serializeToJson(this.serialize);
		if (!json) {
			return json;
		}
		return json.data;
	}

	verify(): boolean {
		let bufReader = new BufferReader(this.serialize);

		let previousOutputCount = bufReader.readCompactSize();
		if (previousOutputCount === false) {
			return false;
		}

		bufReader.addReadOffset(36 * previousOutputCount);
		let scriptByte = bufReader.readCompactSize();
		if (scriptByte === false) {
			return false;
		}

		bufReader.addReadOffset(scriptByte);
		let sequence = bufReader.readUInt32LE();

		if (sequence !== 0xFFFFFFFF) {
			return false;
		}

		return bufReader.isEnd();
	}

	static jsonDataToSerialize(jsonData: vinJsonData): Buffer | false {
		if (!vinJsonSchemaValidate(jsonData)) {
			console.error(vinJsonSchemaValidate.errors);
			return false;
		}

		let previousOutputCount = jsonData.previousOutouts.length;
		let previousOutoutsBytes = previousOutputCount * 36; // ( hash: 32 byte; tx_out n: 4 byte; total: 36 byte )
		let previousOutputCountBuf = getCompactSizeBufferByNumber(previousOutputCount);
		if (!previousOutputCountBuf) {
			return false;
		}

		let unlockScriptByte = jsonData.unlockScript.length >> 1;
		let unlockScriptByteBuf = getCompactSizeBufferByNumber(unlockScriptByte);
		if (!unlockScriptByteBuf) {
			return false;
		}

		let totalByte = previousOutputCountBuf.length + previousOutoutsBytes + unlockScriptByteBuf.length + unlockScriptByte + 4;

		let buf = Buffer.alloc(totalByte);
		let startByte = 0;
		previousOutputCountBuf.copy(buf, startByte);
		startByte += previousOutputCountBuf.length;

		for (let i = 0; i < previousOutputCount; i++) {
			buf.write(jsonData.previousOutouts[i].txid, startByte, startByte + 32, 'hex');
			startByte += 32;
			buf.writeUInt32LE(jsonData.previousOutouts[i].voutn, startByte);
			startByte += 4;
		}
		unlockScriptByteBuf.copy(buf, startByte);
		startByte += unlockScriptByteBuf.length;

		buf.write(jsonData.unlockScript, startByte, 'hex');

		startByte += unlockScriptByte;

		buf.writeUInt32LE(jsonData.sequence, startByte);

		return buf;
	}

	static serializeToJson(serialize): { data: vinJsonData, bufEndByte: number } | false {
		let jsonData = {
			previousOutouts: [],
			unlockScript: null,
			sequence: 0,
		};

		let bufReader = new BufferReader(serialize);

		let previousOutputCount = bufReader.readCompactSize();
		if (previousOutputCount === false) {
			return false;
		}

		for (let i = 0; i < previousOutputCount; i++) {
			let txid, voutn;
			txid = bufReader.readString(32, 'hex');
			voutn = bufReader.readUInt32LE();
			jsonData.previousOutouts[i] = { txid, voutn };
		}

		let scriptByte = bufReader.readCompactSize();
		if (scriptByte === false) {
			return false;
		}

		jsonData.unlockScript = bufReader.readString(scriptByte, 'hex');
		jsonData.sequence = bufReader.readUInt32LE();
		return { data: jsonData, bufEndByte: bufReader.getReadOffset() };
	}
}

class Vout {
	serialize: Buffer;

	constructor(buf: Buffer, shareBuffer: boolean = false) {
		if (shareBuffer) {
			this.serialize = buf;
		}
		else {
			this.serialize = Buffer.from(buf);
		}
	}

	verify(): boolean {
		let bufReader = new BufferReader(this.serialize);
		bufReader.readUInt64LE();

		let scriptByte = bufReader.readCompactSize();
		if (scriptByte === false) {
			return false;
		}

		if (!this.lockScript || this.lockScript.length !== 34) {
			return false;
		}

		if (this.value < 1n) {
			return false;
		}

		bufReader.addReadOffset(scriptByte);

		return bufReader.isEnd();
	}

	get lockScript(): false | Buffer {
		let bufReader = new BufferReader(this.serialize);
		bufReader.readUInt64LE();
		let scriptByte = bufReader.readCompactSize();
		if (scriptByte === false) {
			return false;
		}

		return bufReader.subarray(scriptByte);
	}

	get address(): false | Buffer {
		let lockScript = this.lockScript;
		if (!lockScript) {
			return false;
		}

		return lockScript.subarray(1, 33);
	}

	get value(): bigint {
		let bufReader = new BufferReader(this.serialize);
		return bufReader.readUInt64LE();
	}

	set value(v: bigint) {
		this.serialize.writeBigUInt64LE(v, 0);
	}

	get json() {
		let json = Vout.serializeToJson(this.serialize);
		if (!json) {
			return json;
		}
		return json.data;
	}

	static jsonDataToSerialize(jsonData: voutJsonData): Buffer | false {
		if (!voutJsonSchemaValidate(jsonData)) {
			console.error(voutJsonSchemaValidate.errors);
			return false;
		}

		let lockScriptBytes = jsonData.lockScript.length >> 1;
		let lockScriptBytesBuf = getCompactSizeBufferByNumber(lockScriptBytes);
		if (!lockScriptBytesBuf) {
			return false;
		}

		let totalByte = 8 + lockScriptBytesBuf.length + lockScriptBytes;
		let buf = Buffer.alloc(totalByte);
		let writeOffset = 0;
		let value = BigInt(jsonData.value)
		if (value < 0n || value > 0xff_ff_ff_ff_ff_ff_ff_ffn) {
			return false;
		}

		buf.writeBigUInt64LE(value);
		writeOffset += 8;
		lockScriptBytesBuf.copy(buf, writeOffset);
		writeOffset += lockScriptBytesBuf.length;
		buf.write(jsonData.lockScript, writeOffset, 'hex');
		return buf;
	}

	static serializeToJson(serialize): { data: voutJsonData, bufEndByte: number } | false {
		let jsonData = {
			value: null,
			lockScript: null
		};

		let bufReader = new BufferReader(serialize);
		jsonData.value = bufReader.readUInt64LE().toString();
		let scriptByte = bufReader.readCompactSize();
		if (scriptByte === false) {
			return false;
		}

		jsonData.lockScript = bufReader.readString(scriptByte, 'hex');

		return { data: jsonData, bufEndByte: bufReader.getReadOffset() };
	}
}

class OpReturn {
	serialize: Buffer
	constructor(buf?: Buffer, shareBuffer: boolean = false) {
		if (!buf) {
			this.serialize = Buffer.alloc(0);
		}
		else {
			if (shareBuffer) {
				this.serialize = buf;
			}
			else {
				this.serialize = Buffer.from(buf);
			}
		}
	}

	getCompactSize(): Buffer | false {
		return getCompactSizeBufferByNumber(this.serialize.length);
	}

	toString(dig: BinaryToTextEncoding = 'hex'): string {
		return this.serialize.toString(dig);
	}

	static createByString(data: string | Buffer, dig?: BinaryToTextEncoding): OpReturn {
		let buf = (Buffer.isBuffer(data)) ? data : Buffer.from(data, dig);
		return new OpReturn(buf, true);
	}
}

class BlockTx {
	version: number;
	vin: Vin[];
	vout: Vout[];
	pqcert: PQCertType[];
	opReturn: OpReturn | null;
	nLockTime: number;

	constructor(vin: Vin[], vout: Vout[], pqcert: PQCertType[], opReturn: OpReturn = new OpReturn(), version: number = 0, nLockTime: number = 0) {
		this.version = version;
		this.vin = vin;
		this.vout = vout;
		this.pqcert = pqcert;
		this.opReturn = opReturn;
		this.nLockTime = nLockTime;
	}

	getSerialize(): Buffer | false {
		let vinCountByte = getCompactSizeBufferByNumber(this.vin.length);
		let voutCountByte = getCompactSizeBufferByNumber(this.vout.length);
		let pqcertCountByte = getCompactSizeBufferByNumber(this.pqcert.length);
		let opReturnByte = this.opReturn.getCompactSize();

		let versionBuf = Buffer.alloc(4);
		versionBuf.writeUInt32LE(this.version);

		if (vinCountByte === false || voutCountByte === false || pqcertCountByte === false || opReturnByte === false) {
			return false;
		}

		let nLockTimeBuf = Buffer.alloc(4);
		nLockTimeBuf.writeInt16LE(this.nLockTime);

		let blockTxBuf = Buffer.concat([
			versionBuf,
			vinCountByte, ...this.vin.map(x => x.serialize),
			voutCountByte, ...this.vout.map(x => x.serialize),
			pqcertCountByte, ...this.pqcert.map(x => x.serialize),
			opReturnByte, this.opReturn.serialize,
			nLockTimeBuf
		]);

		return blockTxBuf;
	}

	getHash(): Buffer | false;
	getHash(dig: BinaryToTextEncoding): string | false;
	getHash(dig?: BinaryToTextEncoding): Buffer | string | false {
		let raw = this.getSerialize();
		if (!raw) {
			return false;
		}
		return shake256(raw, dig);
	}

	addPqcert(pqcert: PQCertType) {
		this.pqcert.push(pqcert);
	}

	clone() {
		let raw = this.getSerialize();
		if (!raw) {
			return false;
		}
		return BlockTx.serializeToClass(raw);
	}

	getPhoton(): number | false { //  unlockScript * 3; opReturn * 5; pqcert * 2; order * 1
		let photon = 0;

		photon += (this.opReturn.serialize.length * 4);

		for (let i = 0; i < this.vin.length; i++) {
			let unlockScript = this.vin[i].getUnlockScript();
			if (!unlockScript) {
				return false;
			}
			photon += unlockScript.length * 2;
		}

		for (let i = 0; i < this.pqcert.length; i++) {
			photon += this.pqcert[i].serialize.length * 1;
		}

		let thisRaw = this.getSerialize();
		if (!thisRaw) {
			return false;
		}

		photon += thisRaw.length;

		return photon;
	}

	getPhotonDetails() {
		let photon = 0;
		let unlockScriptPhoton = 0;
		let pqcertPhoton = 0;
		let opReturnPhoton = 0;

		photon += this.opReturn.serialize.length * 4;
		opReturnPhoton += this.opReturn.serialize.length * 5;

		for (let i = 0; i < this.vin.length; i++) {
			let unlockScript = this.vin[i].getUnlockScript();
			if (!unlockScript) {
				return false;
			}
			photon += unlockScript.length * 2;
			unlockScriptPhoton += unlockScript.length * 3;
		}

		for (let i = 0; i < this.pqcert.length; i++) {
			photon += this.pqcert[i].serialize.length * 1;
			pqcertPhoton += this.pqcert[i].serialize.length * 2;
		}

		let thisRaw = this.getSerialize();
		if (!thisRaw) {
			return false;
		}

		photon += thisRaw.length;

		let otherPhoton = photon - unlockScriptPhoton - pqcertPhoton - opReturnPhoton;
		return { total: photon, unlockScriptPhoton, pqcertPhoton, opReturnPhoton, otherPhoton };
	}

	getSize(): number | false {
		let thisRaw = this.getSerialize();
		if (!thisRaw) {
			return false;
		}

		return thisRaw.length;
	}

	isValid(isCoinBase: boolean = false, version: Version): boolean {
		if (this.version !== version.txVer) {
			return false;
		}

		if (this.vin.length < 1) {
			return false;
		}

		if (isCoinBase && this.vin.length > 1) { //disable coinbase other vin
			return false;
		}

		if (isCoinBase !== this.vin[0].isCoinBase()) { // CoinBase can only be in the first
			return false;
		}

		let lastVout: { [key: string]: { [key: number]: boolean } } = {};
		for (let i = 0; i < this.vin.length; i++) {
			if (!this.vin[i].verify()) {
				return false;
			}

			if (i !== 0) {
				if (this.vin[i].isCoinBase()) {
					return false;
				}
			}

			let lastVoutHash = this.vin[i].getLastVoutHashAll();
			if (!lastVoutHash) {
				return false;
			}
			for (let k = 0; k < lastVoutHash.length; k++) {
				let hash = lastVoutHash[k].hash.toString('hex');
				let voutn = lastVoutHash[k].voutn;
				if (!lastVout[hash]) {
					lastVout[hash] = {};
				}
				else {
					if (lastVout[hash][voutn]) { //double-spend
						return false;
					}
				}
				lastVout[hash][voutn] = true;
			}
		}

		for (let i = 0; i < this.vout.length; i++) {
			if (!this.vout[i].verify()) {
				return false;
			}
		}

		let pqcertList = [];
		for (let i = 0; i < this.pqcert.length; i++) {
			if (!this.pqcert[i].verify(version.pqcertVer)) {
				return false;
			}
			let hash = this.pqcert[i].getHash('hex');
			if (pqcertList[hash]) {
				return false;
			}
			pqcertList[hash] = true;
		}

		return true;
	}

	getTxOutValues() {
		return this.vout.map(x => ({ address: x.address, value: x.value }));
	}

	setOpReturn(opReturn: OpReturn) {
		this.opReturn = opReturn;
	}

	get json() {
		let vin = [];
		let vout = [];
		let pqcert = [];

		for (let i = 0; i < this.vin.length; i++) {
			vin[i] = this.vin[i].json;
			if (!vin[i]) {
				return false;
			}
		}

		for (let i = 0; i < this.vout.length; i++) {
			vout[i] = this.vout[i].json;
			if (!vout[i]) {
				return false;
			}
		}

		for (let i = 0; i < this.pqcert.length; i++) {
			pqcert[i] = this.pqcert[i].json;
			if (!pqcert[i]) {
				return false;
			}
		}

		return {
			hash: this.getHash('hex'),
			version: this.version,
			vin,
			vout,
			pqcert,
			opReturn: this.opReturn.toString('hex'),
			nLockTime: this.nLockTime
		}
	}

	static jsonDataToClass(jsonData: blockTxJsonData): BlockTx | false {
		if (!blockTxJsonSchemaValidate(jsonData)) {
			console.error(blockTxJsonSchemaValidate.errors);
			return false;
		}

		let vinCount = jsonData.vin.length;
		let voutCount = jsonData.vout.length;
		let pqcertCount = jsonData.pqcert.length;

		let vin = [];
		let vout = [];
		let pqcert = [];

		for (let i = 0; i < vinCount; i++) {
			let vinS = Vin.jsonDataToSerialize(jsonData.vin[i]);
			if (!vinS) {
				return false;
			}
			vin[i] = new Vin(vinS, true);
		}

		for (let i = 0; i < voutCount; i++) {
			let voutS = Vout.jsonDataToSerialize(jsonData.vout[i]);
			if (!voutS) {
				return false;
			}
			vout[i] = new Vout(voutS, true);
		}

		for (let i = 0; i < pqcertCount; i++) {
			if (jsonData.pqcert[i].pqcertType === 0) {
				pqcert[i] = createPQCertRoot(<PQCertRootJsonData>jsonData.pqcert[i]);
			}
			else if (jsonData.pqcert[i].pqcertType === 1) {
				pqcert[i] = createPQCertPubKey(<PQCertPubKeyJsonData>jsonData.pqcert[i]);
			}
			else if (jsonData.pqcert[i].pqcertType === 2) {
				pqcert[i] = createPQCertGroup(<PQCertGroupJsonData>jsonData.pqcert[i]);
			}
			else {
				return false;
			}

			if (!pqcert[i]) {
				return false;
			}
		}
		let opReturn = OpReturn.createByString(jsonData.opReturn, 'hex');

		let blockTx = new BlockTx(vin, vout, pqcert, opReturn, jsonData.version, jsonData.nLockTime);
		return blockTx;
	}

	static jsonDataToSerialize(jsonData: blockTxJsonData): Buffer | false {
		let blockTxObj = BlockTx.jsonDataToClass(jsonData);
		if (blockTxObj) {
			return blockTxObj.getSerialize();
		}
		else {
			return false;
		}
	}

	static serializeToJson(buf: Buffer): blockTxJsonData | false {
		let blockTxJsonData = {
			hash: shake256(buf, 'hex'),
			version: null,
			vin: [],
			vout: [],
			pqcert: [],
			opReturn: null,
			nLockTime: 0
		};
		let bufReader = new BufferReader(buf);
		blockTxJsonData.version = bufReader.readUInt32LE();

		let vinLength = bufReader.readCompactSize();
		if (vinLength === false) {
			return false;
		}

		for (let i = 0; i < vinLength; i++) {
			let vinData = Vin.serializeToJson(bufReader.subarray());
			if (!vinData) {
				return false;
			}
			blockTxJsonData.vin[i] = vinData.data;
			bufReader.addReadOffset(vinData.bufEndByte);
		}

		let voutLength = bufReader.readCompactSize();
		if (voutLength === false) {
			return false;
		}

		for (let i = 0; i < voutLength; i++) {
			let voutData = Vout.serializeToJson(bufReader.subarray());
			if (!voutData) {
				return false;
			}
			blockTxJsonData.vout[i] = voutData.data;
			bufReader.addReadOffset(voutData.bufEndByte);
		}

		let pqcertLength = bufReader.readCompactSize();
		if (pqcertLength === false) {
			return false;
		}

		for (let i = 0; i < pqcertLength; i++) {
			let pqcertData = PQCert.serializeToJson(bufReader.subarray());
			if (!pqcertData) {
				return false;
			}
			blockTxJsonData.pqcert[i] = pqcertData.data;
			bufReader.addReadOffset(pqcertData.bufEndByte);
		}

		let opReturnByte = bufReader.readCompactSize();
		if (opReturnByte === false) {
			return false;
		}
		let opReturn = new OpReturn(bufReader.subarray(opReturnByte), true);
		bufReader.addReadOffset(opReturnByte);
		blockTxJsonData.opReturn = opReturn.toString('hex');
		blockTxJsonData.nLockTime = bufReader.readUInt32LE();

		return blockTxJsonData;
	}

	static serializeToClass(buf: Buffer, shareBuffer: boolean = false): BlockTx | false {
		let version;
		let vin = [];
		let vout = [];
		let pqcert = [];
		let bufReader = new BufferReader(buf);

		version = bufReader.readUInt32LE();
		let vinLength = bufReader.readCompactSize();
		if (vinLength === false) {
			return false;
		}

		for (let i = 0; i < vinLength; i++) {
			let byteStart = bufReader.getReadOffset();
			let previousCount = bufReader.readCompactSize();
			if (previousCount === false) {
				return false;
			}
			bufReader.addReadOffset(36 * previousCount);
			let unlockScriptBytes = bufReader.readCompactSize();
			if (unlockScriptBytes === false) {
				return false;
			}
			bufReader.addReadOffset(unlockScriptBytes);
			bufReader.addReadOffset(4); //locktime 4byte
			let byteEnd = bufReader.getReadOffset();
			vin[i] = new Vin(buf.subarray(byteStart, byteEnd), shareBuffer);
		}

		let voutLength = bufReader.readCompactSize();
		if (voutLength === false) {
			return false;
		}

		for (let i = 0; i < voutLength; i++) {
			let byteStart = bufReader.getReadOffset();
			bufReader.addReadOffset(8); //value
			let lockScriptBytes = bufReader.readCompactSize();
			if (lockScriptBytes === false) {
				return false;
			}
			bufReader.addReadOffset(lockScriptBytes);
			let byteEnd = bufReader.getReadOffset();
			vout[i] = new Vout(buf.subarray(byteStart, byteEnd), shareBuffer);
		}

		let pqcertLength = bufReader.readCompactSize();
		if (pqcertLength === false) {
			return false;
		}

		for (let i = 0; i < pqcertLength; i++) {
			let byteStart = bufReader.getReadOffset();
			bufReader.addReadOffset(4); //version
			let pqcertType = bufReader.readUInt8();
			if (pqcertType === 0) {
				bufReader.addReadOffset(1); //level
				let pubkeyHashAmount = bufReader.readUInt8();
				bufReader.addReadOffset(pubkeyHashAmount * 32);
				let byteEnd = bufReader.getReadOffset();
				pqcert[i] = new PQCertRoot(buf.subarray(byteStart, byteEnd), shareBuffer);
			}
			else if (pqcertType === 1) {
				bufReader.addReadOffset(2); //signType
				let keyLen = bufReader.readUInt32LE();
				bufReader.addReadOffset(keyLen);
				let byteEnd = bufReader.getReadOffset();
				pqcert[i] = new PQCertPubKey(buf.subarray(byteStart, byteEnd), shareBuffer);
			}
			else if (pqcertType === 2) {
				bufReader.addReadOffset(1); //level
				let memberAmount = bufReader.readUInt8();
				bufReader.addReadOffset(memberAmount * 36);
				let byteEnd = bufReader.getReadOffset();
				pqcert[i] = new PQCertGroup(buf.subarray(byteStart, byteEnd), shareBuffer);
			}
			else {
				console.log(`pqcert[${i}].pqcertType is not ${pqcertType}`);
				return false;
			}
		}

		let opReturnByte = bufReader.readCompactSize();
		if (opReturnByte === false) {
			return false;
		}

		let opReturn = new OpReturn(bufReader.subarray(opReturnByte), true);
		bufReader.addReadOffset(opReturnByte);

		return new BlockTx(vin, vout, pqcert, opReturn, version);
	}

	static getBasePhoton(vinLen: number[], voutLen: number): false | number { //  unlockScript * 3; opReturn * 5; pqcert * 2; order * 1
		let photon = 8;
		let vinCS = getCompactSizeBufferByNumber(vinLen.length);
		if (!vinCS) {
			return false;
		}
		photon += vinCS.length;
		photon += vinLen.length * 4;

		let voutCS = getCompactSizeBufferByNumber(voutLen);
		if (!voutCS) {
			return false;
		}
		photon += voutCS.length;
		photon += (voutLen * 8);

		for (let i = 0; i < vinLen.length; i++) {
			let vinpCS = getCompactSizeBufferByNumber(vinLen[i]);
			if (!vinpCS) {
				return false;
			}
			photon += vinpCS.length;
			photon += (vinLen[i] * 36);
		}

		return photon;
	}
}

function createCoinBaseJson(

	height: number,
	lockScript: string,
	value: string,
	unlockScript: string = '',
	sequence: number = 0xff_ff_ff_ff

): { vin: vinJsonData, vout: voutJsonData } {
	let unlockScriptHeigthBuf: Buffer = Buffer.alloc(4);
	unlockScriptHeigthBuf.writeInt32LE(height);
	let unlockScriptHeigth: string = unlockScriptHeigthBuf.toString('hex');

	let vin: vinJsonData = {
		previousOutouts: [],
		unlockScript: `${unlockScriptHeigth}${unlockScript}`,
		sequence
	};

	let vout: voutJsonData = {
		value,
		lockScript
	};

	return { vin, vout };
}

function createCoinBase(

	height: number,
	lockScript: string,
	value: bigint,
	unlockScript: string = '',
	sequence: number = 0xff_ff_ff_ff

): { vin: Vin, vout: Vout } | false {
	let vj = createCoinBaseJson(height, lockScript, value.toString(), unlockScript, sequence);
	let vinBuf = Vin.jsonDataToSerialize(vj.vin);
	if (!vinBuf) {
		return false;
	}

	let vin = new Vin(vinBuf, true);

	let voutBuf = Vout.jsonDataToSerialize(vj.vout);
	if (!voutBuf) {
		return false;
	}

	let vout = new Vout(voutBuf, true);

	return { vin, vout };
}

export { BlockTx, Vin, Vout, OpReturn, createCoinBase, createCoinBaseJson };