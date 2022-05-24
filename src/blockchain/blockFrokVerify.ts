import BlockData from "./blockData";
import BlockHeader  from "./blockHeader";
import { calculateNbit, nbitSampleRate, referenceSeconds } from "./pow";
import { TaskQueue } from "./taskQueue";
import { getVersionByHeight } from "./versionRule";
import { Core } from '../core';
import { BlockTx } from "./blockTx";
import { TxValidator } from "./transactionValidator";
import { PQCertType } from "./pqcert";

type Block = {
	hash: Buffer;
	height: number;
	blockData: BlockData;
}

type Tx = {
	blockHash: Buffer;
	blockTx: BlockTx;
	voutspent: (number | false)[];
}

class ForkTxDb {
	private txid: { [key: string]: Tx };
	public pqcert: { [key: string]: PQCertType };
	private voutspent: { [key: string]: { [key: number]: true } }
	constructor() {
		this.txid = {};
		this.pqcert = {};
		this.voutspent = {};
	}

	addTx(blockTx: BlockTx, blockHash: Buffer): boolean {
		let hashStr = blockTx.getHash('hex');
		if (!hashStr) {
			return false;
		}

		if (this.txid[hashStr]) {
			return false;
		}

		this.txid[hashStr] = { blockHash, blockTx, voutspent: blockTx.vout.map(() => false) };

		// pqcert
		for (let i = 0; i < blockTx.pqcert.length; i++) {
			let pqcHashStr = <string>blockTx.pqcert[i].getHash('hex');
			if (this.pqcert[pqcHashStr]) {
				return false;
			}

			this.pqcert[pqcHashStr] = blockTx.pqcert[i];
		}

		return true;
	}

	getTransactionByTxid(txid: Buffer): false | Tx {
		let txidStr = txid.toString('hex');
		let r = this.txid[txidStr];

		if (!r) {
			return false;
		}

		return r;
	}

	setVoutspent(txid, voutn, height) {
		let txidStr = txid.toString('hex');
		let r = this.txid[txidStr];

		if (!r) {
			return;
		}

		r.voutspent[voutn] = height;
	}

	addVoutspent(txid: string, voutn: number): boolean {
		if (this.voutspent[txid]) {
			if (this.voutspent[txid][voutn]) {
				return false;
			}

			this.voutspent[txid][voutn] = true;
			return true;
		}

		this.voutspent[txid] = { [voutn]: true };
		return true;
	}
}

class BlockForkVerify {
	private taskQueue: TaskQueue;
	private core: Core;
	
	private blockHash: { [key: string]: Block };
	private firstPreHash: Buffer;
	private startHeight: number;
	private endHeight: number;
	private forkTxDb: ForkTxDb;

	private addFinishFlag: boolean;
	private failFlag: boolean;

	blockList: Block[];

	constructor(core: Core, firstPreHash: Buffer, startHeight: number, endHeight: number) {
		this.taskQueue = new TaskQueue();
		this.core = core;
		this.blockList = [];
		this.blockHash = {};
		this.firstPreHash = firstPreHash;
		this.startHeight = startHeight;
		this.endHeight = endHeight;
		this.forkTxDb = new ForkTxDb();
		this.addFinishFlag = false;
		this.failFlag = false;
	}

	async addBlock(blockData: BlockData): Promise<boolean> {
		let r = await this.taskQueue.addTask(async () => {
			if (this.failFlag || this.addFinishFlag) {
				return false;
			}

			let preBlockHeader;
			if (this.blockList.length === 0) {
				let last = await this.core.getBlockDataByHash(this.firstPreHash);
				if (!last) {
					return false;
				}

				preBlockHeader = new BlockHeader(last.header);
			}
			else {
				preBlockHeader = this.blockList[this.blockList.length - 1].blockData.blockHeader;
			}

			let thisHeigth = this.blockList.length + this.startHeight;
			let lastHeight = thisHeigth - 1;

			let thisNbit;
			if (lastHeight !== 0 && lastHeight % nbitSampleRate === 0) {
				let sampleStartHeigth = lastHeight - nbitSampleRate;
				let sampleStartBlockHeader;

				if (sampleStartHeigth < this.startHeight) {
					let sampleStart = await this.core.getBlockDataByHeight(sampleStartHeigth);
					if (!sampleStart) {
						return false;
					}
					sampleStartBlockHeader = new BlockHeader(sampleStart.header, true);
				}
				else {
					sampleStartBlockHeader = this.blockList[sampleStartHeigth - this.startHeight].blockData.blockHeader;
				}


				let startTime = sampleStartBlockHeader.getTime();
				let endTime = preBlockHeader.getTime();

				thisNbit = calculateNbit(referenceSeconds, preBlockHeader.rawNBit, nbitSampleRate, startTime, endTime);
			}
			else {
				thisNbit = preBlockHeader.rawNBit;
			}

			if (!blockData.verify(Date.now(), thisNbit, getVersionByHeight(thisHeigth))) {
				return false;
			}

			let hash = blockData.blockHeader.getHash();
			for (let i = 0; i < blockData.txs.length; i++) {
				let r = this.forkTxDb.addTx(blockData.txs[i].blockTx, hash);
				if (!r) {
					return false;
				}
			}

			let block = { hash, height: thisHeigth, blockData }
			this.blockList.push(block);
			this.blockHash[hash.toString('hex')] = block;

			if (this.endHeight - 1 <= thisHeigth) {
				this.addFinishFlag = true;
			}
			return true;
		});

		if (r.taskErr || !r.data) {
			if (!this.addFinishFlag) {
				this.failFlag = true;
			}

			return false;
		}

		return true;
	}

	headerIsReady() {
		return this.addFinishFlag;
	}

	async verifyBlockTx(block: Block): Promise<boolean> {
		let totalFee: bigint = 0n;
		let thisVersion = getVersionByHeight(block.height);

		for (let i = block.blockData.txs.length - 1; i >= 0; i--) {
			let txV = new TxValidator(block.blockData.txs[i].blockTx, this.core.blockchainDb, thisVersion);
			let r;
			if (i === 0) { // is coinbase
				r = await txV.verifyFork(this.forkTxDb, this.startHeight, 1n, block.height, true, totalFee);
			}
			else {
				r = await txV.verifyFork(this.forkTxDb, this.startHeight, 1n, block.height, false);
				if (r) {
					totalFee += r.fee;
				}
			}

			if (!r) {
				console.error('TxValidator errorCode', txV.errorCode);
				return false;
			}

			//setVoutspent
			for (let j = 0; j < block.blockData.txs[i].blockTx.vin.length; j++) {
				let lastHashAll = block.blockData.txs[i].blockTx.vin[j].getLastVoutHashAll();

				if (!lastHashAll) {
					return false;
				}

				for (let k = 0; k < lastHashAll.length; k++) {
					let r = this.forkTxDb.addVoutspent(lastHashAll[k].hash.toString('hex'), lastHashAll[k].voutn);
					if (!r) {
						return false;
					}

					this.forkTxDb.setVoutspent(lastHashAll[k].hash.toString('hex'), lastHashAll[k].voutn, block.height);
				}
			}
		}

		return true;
	}

	async verify(): Promise<boolean> {
		if (!this.addFinishFlag) {
			console.log(`addFinishFlag is not true!`);
			return false;
		}

		this.addFinishFlag = false;

		if (this.failFlag) {
			console.log(`block header is fail!`);
			return false;
		}

		for (let i = 0; i < this.blockList.length; i++) {
			let r = await this.verifyBlockTx(this.blockList[i]);
			if (!r) {
				console.log(`verifyBlockTx is fail!`, i);
				this.failFlag = true;
				return false;
			}
		}

		return true;
	}
}

export { BlockForkVerify, ForkTxDb }