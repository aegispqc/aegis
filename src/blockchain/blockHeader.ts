import { shake256 } from '../crypto/hash';
import { verifyPoW } from './pow';
import { Version } from './versionRule';

type BinaryToTextEncoding = 'base64' | 'hex';

const dataPosition = {
	// [start, end, length]
	version: [0, 4, 4],
	preHash: [4, 36, 32],
	merkleroot: [36, 68, 32],
	time: [68, 72, 32],
	nBit: [72, 74, 2],
	nonce: [74, 106, 32],
	//------- all -------
	all: [0, 106, 106],
	//------- MQPHASH seed -------
	mqpahshSeed: [0, 74, 74]
}

interface BlockHeaderJsonData {
	version: number;
	preHash: string;
	merkleroot: string;
	time: number;
	nBit: string;
	nonce: string;
}

// is test 
const GenesisHash = Buffer.from('b37acd4bb2cc6a563c122a1573baee6b7705d573b5043f66bf6d55d5782efa95', 'hex');

class BlockHeader {
	serialize: Buffer;
	constructor(data: Buffer | BlockHeaderJsonData, shreBuffer: boolean = false) {
		if (Buffer.isBuffer(data)) {
			if (shreBuffer) {
				this.serialize = data.subarray(0, dataPosition.all[2]);
			}
			else {
				this.serialize = Buffer.from(data);
			}

		}
		else {
			this.serialize = BlockHeader.JsonDataToSerialize(data);
		}
	}

	static serializeToJson(serialize): BlockHeaderJsonData {
		return {
			version: serialize.readUInt32LE(dataPosition.version[0]),
			preHash: serialize.toString("hex", dataPosition.preHash[0], dataPosition.preHash[1]),
			merkleroot: serialize.toString("hex", dataPosition.merkleroot[0], dataPosition.merkleroot[1]),
			time: serialize.readUInt32LE(dataPosition.time[0]),
			nBit: serialize.toString("hex", dataPosition.nBit[0], dataPosition.nBit[1]),
			nonce: serialize.toString("hex", dataPosition.nonce[0], dataPosition.nonce[1]),
		};
	}

	static JsonDataToSerialize(jsonData: BlockHeaderJsonData): Buffer {
		let serialize = Buffer.alloc(dataPosition.all[1]);

		serialize.writeUInt32LE(jsonData.version, dataPosition.version[0]);
		serialize.write(jsonData.preHash, dataPosition.preHash[0], dataPosition.preHash[2], 'hex');
		serialize.write(jsonData.merkleroot, dataPosition.merkleroot[0], dataPosition.merkleroot[2], 'hex');
		serialize.writeUInt32LE(jsonData.time, dataPosition.time[0]);
		serialize.write(jsonData.nBit, dataPosition.nBit[0], dataPosition.nBit[2], 'hex');
		serialize.write(jsonData.nonce, dataPosition.nonce[0], dataPosition.nonce[2], 'hex');

		return serialize;
	}

	get json(): { readonly [k: string]: any } {
		return {
			hash: this.getHash('hex'),
			...BlockHeader.serializeToJson(this.serialize)
		}
	}

	get version(): number {
		return this.serialize.readUInt32LE(dataPosition.version[0]);
	}

	get raw(): Buffer {
		return this.serialize;
	}

	get rawNBit(): Buffer {
		return this.serialize.subarray(dataPosition.nBit[0], dataPosition.nBit[1]);
	}

	get rawPrehash(): Buffer {
		return this.serialize.subarray(dataPosition.preHash[0], dataPosition.preHash[1]);
	}

	getTime() {
		return this.serialize.readUInt32LE(dataPosition.time[0]);
	}

	getHash(): Buffer;
	getHash(dig: BinaryToTextEncoding): string;
	getHash(dig?: BinaryToTextEncoding): Buffer | string {
		return shake256(this.serialize, dig);
	}

	setPreHash(preHash: string | Buffer) {
		if (Buffer.isBuffer(preHash)) {
			preHash.copy(this.serialize, dataPosition.preHash[0], 0, dataPosition.preHash[2]);
		}
		else {
			this.serialize.write(preHash, dataPosition.preHash[0], dataPosition.preHash[1], 'hex');
		}
	}

	getMerkleroot(): Buffer;
	getMerkleroot(dig: BinaryToTextEncoding): string;
	getMerkleroot(dig?: BinaryToTextEncoding): Buffer | string {
		if (dig) {
			return this.serialize.toString(dig, dataPosition.merkleroot[0], dataPosition.merkleroot[1]);
		}
		else {
			return this.serialize.subarray(dataPosition.merkleroot[0], dataPosition.merkleroot[1]);
		}
	}

	setMerkleroot(merkleroot: string | Buffer) {
		if (Buffer.isBuffer(merkleroot)) {
			merkleroot.copy(this.serialize, dataPosition.merkleroot[0], 0, dataPosition.merkleroot[2]);
		}
		else {
			this.serialize.write(merkleroot, dataPosition.merkleroot[0], dataPosition.merkleroot[1], 'hex');
		}
	}

	setTime(time: number) {
		this.serialize.writeInt32LE(time, dataPosition.time[0]);
	}

	setNBit(nbit: string | Buffer) {
		if (Buffer.isBuffer(nbit)) {
			nbit.copy(this.serialize, dataPosition.nBit[0], 0, dataPosition.nBit[2]);
		}
		else {
			this.serialize.write(nbit, dataPosition.nBit[0], dataPosition.nBit[1], 'hex');
		}
	}

	setNonce(nonce: string | Buffer): boolean {
		if (Buffer.isBuffer(nonce)) {
			this.serialize.write(nonce.toString('hex').padEnd(64, '0'), dataPosition.nonce[0], dataPosition.nonce[1], 'hex');
		}
		else {
			if (nonce.length !== 64) {
				return false;
			}

			this.serialize.write(nonce, dataPosition.nonce[0], dataPosition.nonce[1], 'hex');
		}

		return true;
	}

	getPowSeed(): Buffer {
		return shake256(this.serialize.subarray(dataPosition.mqpahshSeed[0], dataPosition.mqpahshSeed[1]));
	}

	verifyPoW(): boolean {
		let seed = this.getPowSeed();
		let nbit = this.serialize.subarray(dataPosition.nBit[0], dataPosition.nBit[1]);
		let x = this.serialize.subarray(dataPosition.nonce[0], dataPosition.nonce[1]);

		// check PoW version

		return verifyPoW(seed, nbit, x);
	}

	verify(nBit: Buffer, hdVer: Version['hdVer']): boolean {
		if (hdVer !== this.version) {
			return false;
		}

		if (this.serialize.length !== dataPosition.all[2]) {
			return false;
		}

		if (!nBit.equals(this.rawNBit)) {
			return false;
		}

		return this.verifyPoW();
	}

	isGenesis() {
		//return GenesisHash.equals(this.hash);
		return true; //test
	}
}

export default BlockHeader;