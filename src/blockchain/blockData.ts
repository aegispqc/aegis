import BlockHeader  from "./blockHeader";
import { BlockTx, OpReturn } from "./blockTx";
import { MerkleTree } from "../crypto/merkleTree";
import { getCompactSizeBufferByNumber } from "./util";
import { createCoinBase } from "./blockTx";
import { getRewardByHeight } from "./reward";
import { PQCertType } from "./pqcert";
import { getVersion, Version } from "./versionRule";

type BlockDataFormat = {
	height: number;
	header: Buffer;
	txs: Buffer[];
}

// const maxTotalPhoton = 500000; // test
// const maxTotalPhoton = 10000000; // test
const maxTotalPhoton = 50000000;
const coinbaseMaxPhoton = 20000;

class BlockData {
	readonly blockHeader: BlockHeader;
	readonly txs: { txid: string; blockTx: BlockTx }[];
	readonly txids: { [key: number]: { txid: string; blockTx: BlockTx } };
	readonly fee: bigint;

	private totalPhoton: number;
	private lastVout: { [key: number]: { [key: number]: boolean } };
	private pqcert: { [key: number]: boolean };

	constructor(input: BlockHeader | number = 0, fee: bigint = 1n) {
		if (typeof input === 'number') { //version
			let buf = Buffer.alloc(106);
			buf.writeInt32LE(input);
			this.blockHeader = new BlockHeader(buf, true);
		}
		else {
			this.blockHeader = input;
		}

		this.txs = [];
		this.txids = {};
		this.fee = fee;
		this.totalPhoton = this.blockHeader.serialize.length;
		this.lastVout = {};
		this.pqcert = {};
	}


	/**
	 * Add coinbase.
	 * @param {number} height now height.
	 * @param {Buffer} address wallet address.
	 * @param {PQCertType[]} [pqcert] PQCert type array.
	 * @param {OpReturn} [opReturn] opReturn.
	 * @returns {number|false} If the completion returns number of transactions, the execution fails to return false.
	 */
	addCoinBase(height: number, address: Buffer, pqcert: PQCertType[] = [], opReturn?: OpReturn): number | false {
		let addressByte = getCompactSizeBufferByNumber(address.length);
		if (!addressByte) {
			return false;
		}

		let lockScript = Buffer.concat([addressByte, address, Buffer.from([252])]); //252 is opcode <OP_CHECKPQCERT>
		let reward = getRewardByHeight(height);
		let coinbase: any = createCoinBase(height, lockScript.toString('hex'), reward);

		let blockTx = new BlockTx([coinbase.vin], [coinbase.vout], pqcert, opReturn, 0);

		let photon = blockTx.getPhoton();
		if (!photon) {
			return false;
		}

		if (photon > coinbaseMaxPhoton) {
			return false;
		}

		this.totalPhoton += photon;

		let txid = blockTx.getHash('hex');
		if (!txid) {
			return false;
		}

		if (this.txs[0]) {
			let reward: bigint = this.txs[0].blockTx.vout[0].value;
			blockTx.vout[0].value = reward;
			delete this.txids[this.txs[0].txid];
		}

		let data = { txid, blockTx }
		this.txids[txid] = data;
		this.txs[0] = data;

		return this.txs.length;
	}

	coinBaseAddFee(value: bigint): boolean {
		if (!this.txs[0]) {
			return false;
		}

		let originTxid = this.txs[0].blockTx.getHash('hex');
		if (!originTxid) {
			return false;
		}

		let originValue = this.txs[0].blockTx.vout[0].value;
		let newValue = originValue + value;
		this.txs[0].blockTx.vout[0].value = newValue;
		let newTxid = this.txs[0].blockTx.getHash('hex');
		if (!newTxid) {
			return false;
		}

		delete this.txids[originTxid];
		this.txs[0].txid = newTxid;
		this.txids[newTxid] = this.txs[0];

		return true;
	}

	addTx(blockTx: BlockTx): { txn?: number, err?: number } {
		let txVer = getVersion(this.blockHeader.version);
		let coinBase = (this.txs.length === 0);
		if (!blockTx.isValid(coinBase, txVer)) {
			return { err: -1 };
		}

		let txid = blockTx.getHash('hex');
		if (!txid) {
			return { err: -1 };
		}

		if (this.txids[txid]) {
			return { err: -2 };
		}

		let photon = blockTx.getPhoton();
		if (!photon) {
			return { err: -1 };
		}

		if (photon + this.totalPhoton > maxTotalPhoton) {
			return { err: -3 };
		}

		this.totalPhoton += photon;

		for (let j = 0; j < blockTx.vin.length; j++) {
			let lastVoutHash = blockTx.vin[j].getLastVoutHashAll();
			if (!lastVoutHash) {
				return { err: -1 };
			}

			for (let k = 0; k < lastVoutHash.length; k++) {
				let hash = lastVoutHash[k].hash.toString('hex');
				let voutn = lastVoutHash[k].voutn;
				if (!this.lastVout[hash]) {
					this.lastVout[hash] = {};
				}
				else {
					if (this.lastVout[hash][voutn]) { //Re-use
						return { err: -5 };
					}
				}

				this.lastVout[hash][voutn] = true;
			}
		}

		for (let j = 0; j < blockTx.pqcert.length; j++) {
			let hash = <string>blockTx.pqcert[j].getHash('hex');
			if (this.pqcert[hash]) {
				return { err: -6 };
			}
			this.pqcert[hash] = true;
		}

		let cloneBlockTx = blockTx.clone();
		if (!cloneBlockTx) {
			return { err: -1 };
		}

		let data = { txid, blockTx: cloneBlockTx };
		this.txids[txid] = data;
		this.txs.push(data);

		return { txn: this.txs.length };
	}

	deleteTxById(txid: string): number | false {
		if (!this.txids[txid]) {
			return false;
		}

		let blockTx = this.txids[txid];

		// pqcert lastVout 
		for (let j = 0; j < blockTx.vin.length; j++) {
			let lastVoutHash = blockTx.vin[j].getLastVoutHashAll();
			if (!lastVoutHash) {
				continue;
			}

			for (let k = 0; k < lastVoutHash.length; k++) {
				let hash = lastVoutHash[k].hash.toString('hex');
				let voutn = lastVoutHash[k].voutn;
				if (!this.lastVout[hash]) {
					continue;
				}

				delete this.lastVout[hash][voutn];
			}
		}

		for (let j = 0; j < blockTx.pqcert.length; j++) {
			let hash = <string>blockTx.pqcert[j].getHash('hex');
			delete this.pqcert[hash];
		}

		delete this.txids[txid];
		let txsIndex = this.txs.findIndex((x) => x.txid === txid);
		this.txs.splice(txsIndex, 1);

		return this.txs.length;
	}

	txsReady(): boolean {
		let txids = [];
		for (let i = 0; i < this.txs.length; i++) {
			txids[i] = this.txs[i].blockTx.getHash();
			if (!txids[i]) {
				return false;
			}
		}
		let merkleroot = new MerkleTree(txids);
		this.blockHeader.setMerkleroot(merkleroot.root);
		this.blockHeader.setTime(Math.floor(Date.now() / 1000));
		return true;
	}

	setPreHash(hash: string | Buffer) {
		this.blockHeader.setPreHash(hash);
	}

	setTime(time: number) {
		this.blockHeader.setTime(time);
	}

	setNBit(nbit: string | Buffer) {
		this.blockHeader.setNBit(nbit);
	}

	setNonce(nonce: string | Buffer) {
		this.blockHeader.setNonce(nonce);
	}

	verify(thisTime: number, nbit: Buffer, version: Version): boolean {
		if (!this.txs.length) {
			return false;
		}
		// header verify
		if (!this.blockHeader.verify(nbit, version.hdVer)) {
			console.error(`block verify is fail!`);
			return false;
		}

		let totalPhoton = this.blockHeader.serialize.length;

		//Comparison with local time
		if (thisTime !== 0) {
			let blockTime = this.blockHeader.getTime();
			if (Math.floor(thisTime / 1000) < blockTime) {
				return false;
			}
		}

		//merkleroot
		let txids = [];
		for (let i = 0; i < this.txs.length; i++) {
			txids[i] = this.txs[i].blockTx.getHash();
			if (!txids[i]) {
				return false;
			}
		}
		let merkleroot = new MerkleTree(txids);
		if (!merkleroot.root.equals(this.blockHeader.getMerkleroot())) {
			return false;
		}

		//Double flower verification for duplicate use of the same vout & n; and duplicate pqcert
		let lastVout = {};
		let pqcert = {};
		for (let i = 0; i < this.txs.length; i++) {
			let coinBase = (i === 0);
			if (!this.txs[i].blockTx.isValid(coinBase, version)) {
				return false;
			}

			let photon = this.txs[i].blockTx.getPhoton();
			if (!photon) {
				return false;
			}

			if (i === 0) {
				if (photon > coinbaseMaxPhoton) {
					return false;
				}
			}

			totalPhoton += photon;
			if (totalPhoton > maxTotalPhoton) {
				return false;
			}

			for (let j = 0; j < this.txs[i].blockTx.vin.length; j++) {
				let lastVoutHash = this.txs[i].blockTx.vin[j].getLastVoutHashAll();
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
						if (lastVout[hash][voutn]) { //Re-use
							return false;
						}
					}

					lastVout[hash][voutn] = true;
				}
			}

			for (let j = 0; j < this.txs[i].blockTx.pqcert.length; j++) {
				let hash = <string>this.txs[i].blockTx.pqcert[j].getHash('hex');
				if (pqcert[hash]) {
					return false;
				}
				pqcert[hash] = true;
			}
		}

		return true;
	}

	getMerkleTreeOnlyCoinBase(): false | Buffer[][] {
		let txids = [];
		for (let i = 0; i < this.txs.length; i++) {
			txids[i] = this.txs[i].blockTx.getHash();
			if (!txids[i]) {
				return false;
			}
		}
		let merkleroot = new MerkleTree(txids);
		let flag = new Array(txids.length);
		flag[0] = true;
		return merkleroot.pruning(flag);
	}

	get json() {
		return {
			header: this.blockHeader.json,
			txs: this.txs.map(x => x.blockTx.json)
		}
	}

	lastVoutIsExist(hash: string, n: number) {

		if (this.lastVout[hash]) {
			if (this.lastVout[hash][n]) {
				return true;
			}
		}

		return false;
	}

	static dataFormatToClass(dataFormat: BlockDataFormat): BlockData | false {
		let blockHeader = new BlockHeader(dataFormat.header);

		let blockData = new BlockData(blockHeader);

		for (let i = 0; i < dataFormat.txs.length; i++) {
			let tx = BlockTx.serializeToClass(dataFormat.txs[i]);
			if (!tx) {
				return false;
			}

			blockData.addTx(tx);
		}

		return blockData;
	}
}

export default BlockData;