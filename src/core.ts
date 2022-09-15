import BlockHeader from './blockchain/blockHeader';
import { BlockTx, OpReturn } from './blockchain/blockTx';
import BlockData from './blockchain/blockData';
import { BlockchainDb, BlockDataFormat, lastVoutSpentData, pqcertIndexData, txIndexData } from './db/lmdb/blockchainDb';
import { calculateNbit, getDifficultyByNbit, nbitSampleRate, referenceSeconds } from './blockchain/pow';
import { TxValidator } from './blockchain/transactionValidator';
import { PQCertType } from './blockchain/pqcert';
import ScriptContainer from './blockchain/script';
import { defaultVersion, getVersionByHeight, Version } from './blockchain/versionRule';
import path from 'path';

/**
 * @class
 */
class Core {
	private nowHeigth: number;
	private stopAddTxFlag: boolean = false;

	public minerFeeRatio: bigint;
	public blockchainDb: BlockchainDb;
	public nowHeight: number;
	public nowHash: string;
	public nowBlockVersion: Version;
	public miningBlock: BlockData | null;

	/**
	 * @constructor
	 * @param {string} dbDir Blockchain Database Path.
	 * @param {bigint} minerFeeRatio Fee ratio for miners.
	 */
	constructor(dbDir: string = path.join(process.cwd(), './blockDb'), minerFeeRatio: bigint = 1n) {
		this.blockchainDb = new BlockchainDb(dbDir);
		this.minerFeeRatio = minerFeeRatio;
		this.nowHeigth;
		this.stopAddTxFlag = false;

		this.miningBlock = null;
	}

	/**
	 * Initial task.
	 * @returns {boolean} Whether to complete
	 */
	init(): boolean {
		let lastBlock = this.getLastBlock();
		if (!lastBlock) {
			return false;
		}

		this.nowHeight = lastBlock.height;
		this.nowHash = lastBlock.hash.toString('hex');
		this.nowBlockVersion = getVersionByHeight(this.nowHeight);

		return true;
	}

	/**
	 * Enable to start add new transactions.
	 */
	enableAddTx() {
		this.stopAddTxFlag = false;
	}

	/**
	 * Disable to add new transactions.
	 */
	disableAddTx() {
		this.stopAddTxFlag = true;
	}

	/**
	 * Create genesis block.
	 * @param {BlockData} blockData Block data.
	 * @returns Whether to complete
	 */
	async createGenesis(blockData: BlockData): Promise<boolean> {
		let lastBlock = this.blockchainDb.getLastBlock();
		if (lastBlock) {
			return false;
		}

		let hash = blockData.blockHeader.getHash();
		let blockRaw = blockData.blockHeader.raw;
		let height = 0;

		// Verifying Data Reproducibility.
		if (!this.blockchainDb.checkDataIsNotDuplicated(blockData)) {
			return false;
		}

		let thisNbit = blockData.blockHeader.rawNBit;

		//Check the double flower and the format of this.
		if (!blockData.verify(0, thisNbit, defaultVersion)) {
			return false;
		}

		//Transaction Verification, Signature, Double Flower, Amount, Fee.
		let totalFee: bigint = 0n;
		for (let i = blockData.txs.length - 1; i >= 0; i--) {
			let txV = new TxValidator(blockData.txs[i].blockTx, this.blockchainDb, defaultVersion);
			let r;
			if (i === 0) { // is coinbase
				r = txV.verify(1n, height, true, totalFee);
			}
			else {
				r = txV.verify(1n, height, false);
				if (r) {
					totalFee += r.fee;
				}
			}

			if (!r) {
				return false;
			}
		}

		let dataFormat = { height, header: blockRaw, txs: [] };
		let txIndex = [];
		let pqcertIndex = [];

		for (let i = 0; i < blockData.txs.length; i++) {
			dataFormat.txs[i] = blockData.txs[i].blockTx.getSerialize();
			if (!dataFormat) {
				return false;
			}

			let voutspent = blockData.txs[i].blockTx.vout.map(x => false);
			txIndex[i] = [blockData.txs[i].blockTx.getHash(), hash, i, voutspent];
			for (let j = 0; j < blockData.txs[i].blockTx.pqcert.length; j++) {
				pqcertIndex.push([blockData.txs[i].blockTx.pqcert[j].getHash(), txIndex[i][0], j]);
			}
		}

		return await this.blockchainDb.createGenesis(hash, dataFormat, blockData, txIndex, pqcertIndex);
	}

	/**
	 * Create mining block.
	 * @returns Whether to complete
	 */
	createMiningBlock(): boolean {
		let lastBlock = this.blockchainDb.getLastBlock();
		if (!lastBlock) {
			this.miningBlock = null;
			return false;
		}

		let lastBlockHeader = new BlockHeader(lastBlock.header, true);
		let thisHeight = lastBlock.height + 1;
		let thisnBit;

		if (lastBlock.height !== 0 && lastBlock.height % nbitSampleRate === 0) {
			let sampleStart = this.blockchainDb.getBlockDataByHeight(lastBlock.height - nbitSampleRate);
			if (!sampleStart) {
				this.miningBlock = null;
				return false;
			}

			let sampleStartBlockHeader = new BlockHeader(sampleStart.header, true);
			let startTime = sampleStartBlockHeader.getTime();
			let endTime = lastBlockHeader.getTime();

			thisnBit = calculateNbit(referenceSeconds, lastBlockHeader.rawNBit, nbitSampleRate, startTime, endTime);
		}
		else {
			thisnBit = lastBlockHeader.rawNBit;
		}

		this.miningBlock = new BlockData();

		this.miningBlock.setPreHash(lastBlockHeader.getHash());
		this.miningBlock.setNBit(thisnBit);
		this.miningBlock.setTime(Math.floor(Date.now() / 1000));

		this.nowHeigth = thisHeight;
		return true;
	}

	/**
	 * Add coinbase.
	 * @param {Buffer} address wallet address.
	 * @param {PQCertType[]} [pqcert] PQCert type array.
	 * @param {OpReturn} [opReturn] opReturn.
	 * @returns {number|false} If the completion returns number of transactions, the execution fails to return false.
	 */
	addCoinBase(address: Buffer, pqcert?: PQCertType[], opReturn?: OpReturn): number | false {
		return this.miningBlock.addCoinBase(this.nowHeigth, address, pqcert, opReturn);
	}

	/**
	 * Adding transactions to block.
	 * @param {BlockTx} blockTx `blockTx` to be added.
	 * @returns {Object} return data or err.
	 */
	addTx(blockTx: BlockTx): { txn?: number, err?: number } {
		if (this.stopAddTxFlag) {
			return { err: -4 };
		}

		if (!this.miningBlock) {
			return { err: -7 };
		}

		let txV = new TxValidator(blockTx, this.blockchainDb, this.nowBlockVersion);
		let txVR = txV.verify(this.minerFeeRatio, this.nowHeigth, false);
		if (!txVR) {
			return { err: -1 };
		}

		let r = this.miningBlock.addTx(blockTx);
		if (r.err) {
			return { err: r.err };
		}

		this.miningBlock.coinBaseAddFee(txVR.fee);

		return r;
	}

	/**
	 * Verify header
	 * @param {BlockData} blockData 
	 * @returns {false|number} If complete return height else return false.
	 */
	verifyHeader(blockData: BlockData): false | number {
		let preHash = blockData.blockHeader.rawPrehash;
		let preBlock = this.blockchainDb.getBlockDataByHash(preHash);
		if (!preBlock) {
			console.error(`New block is fail !!! preBlock (${preHash.toString('hex')}) is not found`);
			return false;
		}

		let preBlockHeader = new BlockHeader(preBlock.header, true)
		if (preBlockHeader.getTime() >= blockData.blockHeader.getTime()) {
			console.error(`New block is fail !!! Reason: Time preTime ${preBlockHeader.getTime()} thisTime ${blockData.blockHeader.getTime()}`);
			return false;
		}

		let height = preBlock.height + 1;
		let thisNbit;

		if (preBlock.height !== 0 && preBlock.height % nbitSampleRate === 0) {
			let sampleStart = this.blockchainDb.getBlockDataByHeight(preBlock.height - nbitSampleRate);
			if (!sampleStart) {
				return false;
			}

			let sampleStartBlockHeader = new BlockHeader(sampleStart.header, true);
			let startTime = sampleStartBlockHeader.getTime();
			let endTime = preBlockHeader.getTime();

			thisNbit = calculateNbit(referenceSeconds, preBlockHeader.rawNBit, nbitSampleRate, startTime, endTime);
		}
		else {
			thisNbit = preBlockHeader.rawNBit;
		}

		//Check the double flower and the format of this.
		if (!blockData.verify(Date.now(), thisNbit, getVersionByHeight(height))) {
			return false;
		}

		return height;
	}

	/**
	 * New block.
	 * @param {BlockData} blockData 
	 * @returns block hash.
	 */
	async newBlock(blockData: BlockData): Promise<{ data?: Buffer, err?: number }> {
		let lastBlock = this.getLastBlock();
		if (!lastBlock) {
			return { err: -8 };
		}

		let hash = blockData.blockHeader.getHash();
		let blockRaw = blockData.blockHeader.raw;

		let height = this.verifyHeader(blockData);
		if (!height) { //zero is GB
			return { err: -9 };
		}

		if (lastBlock.height >= height) { //fork
			return { err: -10 };
		}

		let thisVersion = getVersionByHeight(height);

		//Transaction Verification, Signature, Double Flower, Amount, Fee.
		let totalFee: bigint = 0n;
		for (let i = blockData.txs.length - 1; i >= 0; i--) {
			let txV = new TxValidator(blockData.txs[i].blockTx, this.blockchainDb, thisVersion);
			let r;
			if (i === 0) { // is coinbase
				r = txV.verify(1n, height, true, totalFee);
			}
			else {
				r = txV.verify(1n, height, false);
				if (r) {
					totalFee += r.fee;
				}
			}

			if (!r) {
				return { err: -1 };
			}
		}

		let dataFormat: BlockDataFormat = { height, header: blockRaw, txs: [] };
		let txIndex: txIndexData[] = [];
		let pqcertIndex: pqcertIndexData[] = [];
		let lastVoutSpent: lastVoutSpentData[] = [];

		for (let i = 0; i < blockData.txs.length; i++) {
			let txRaw = blockData.txs[i].blockTx.getSerialize();
			if (!txRaw) {
				return { err: -1 };
			}
			dataFormat.txs[i] = txRaw;

			let voutspent = blockData.txs[i].blockTx.vout.map((x): false => false);
			let tsHash = blockData.txs[i].blockTx.getHash();
			if (!tsHash) {
				return { err: -14 };
			}
			txIndex[i] = [tsHash, hash, i, voutspent];
			for (let j = 0; j < blockData.txs[i].blockTx.pqcert.length; j++) {
				pqcertIndex.push([blockData.txs[i].blockTx.pqcert[j].getHash(), txIndex[i][0], j]);
			}

			for (let j = 0; j < blockData.txs[i].blockTx.vin.length; j++) {
				let lastVoutHash = blockData.txs[i].blockTx.vin[j].getLastVoutHashAll();

				if (!lastVoutHash) {
					return { err: -1 };
				}

				for (let k = 0; k < lastVoutHash.length; k++) {
					lastVoutSpent.push([lastVoutHash[k].hash, lastVoutHash[k].voutn, height])
				}
			}
		}

		await this.blockchainDb.setBlock(hash, dataFormat, txIndex, pqcertIndex, lastVoutSpent);

		return { data: hash };
	}

	/**
	 * Delete block
	 * @param {Buffer} hash Block hash.
	 * @returns Whether to complete.
	 */
	async deleteBlock(hash: Buffer) {
		return await this.blockchainDb.deleteBlock(hash);
	}

	/**
	 * Clear wait block.
	 */
	clearMint() {
		this.miningBlock = null;
	}

	getLastBlock() {
		return this.blockchainDb.getLastBlock();
	}

	getBlockHashByHeight(height: number) {
		return this.blockchainDb.getBlockHashByHeight(height);
	}

	getBlockDataByHash(hash: Buffer) {
		return this.blockchainDb.getBlockDataByHash(hash);
	}

	getBlockDataByHeight(height: number) {
		return this.blockchainDb.getBlockDataByHeight(height);
	}

	getTransactionByTxid(txid: Buffer) {
		return this.blockchainDb.getTransactionByTxid(txid);
	}

	getPqcertByHash(hash: Buffer) {
		return this.blockchainDb.getPqcertByHash(hash);
	}

	getTxIndex(hash: Buffer) {
		return this.blockchainDb.getTxIndex(hash);
	}

	blockHashDoesExist(hash: Buffer): boolean {
		return this.blockchainDb.blockHashDoesExist(hash);
	}

	/**
	 * get Signed transactions.
	 * @param {BlockTx} blcokTx 
	 * @returns {false|BlockTx[]} If complete return `BlockTx[]` else return false.
	 */
	getSignedTxs(blcokTx: BlockTx): false | BlockTx[] {
		let signedTxs = [];

		for (let i = 0; i < blcokTx.vin.length; i++) {
			let lastVoutHash = blcokTx.vin[i].getLastVoutHashAll();
			if (!lastVoutHash) {
				return false;
			}

			let lastVout = [];
			for (let j = 0; j < lastVoutHash.length; j++) {
				let lastBlock = this.blockchainDb.getTransactionByTxid(lastVoutHash[j].hash);
				if (!lastBlock) {
					return false;
				}
				lastVout[j] = { tx: lastBlock.blockTx, voutn: lastVoutHash[j].voutn }
			}

			if (!lastVout) {
				return false;
			}

			let scriptContainer = new ScriptContainer(this.blockchainDb, blcokTx, i, lastVout, 0);
			let signedTx = scriptContainer.getSignedTx();
			if (!signedTx) {
				return false;
			}
			signedTxs[i] = signedTx;
		}

		return signedTxs;
	}

	/**
	 * Create new transation.
	 * @param {object[][]} vin 
	 * @param {Buffer} vin[][].txid Source transaction id.
	 * @param {number} vin[][].voutn this transaction which vout.
	 * @param {object[]} vout 
	 * @param {Buffer} vout[].address Receiving address.
	 * @param {bigint} vout[].value Send amount.
	 * @param {Buffer} opReturn opReturn.
	 * @param {boolean} replaceLS Automatic replacement of unlock for transaction vin.
	 * @returns {false|BlockTx[]} If complete return `BlockTx` else return false.
	 */
	createTransation(vin: { txid: Buffer, voutn: number }[][], vout: { address: Buffer, value: bigint }[], opReturn: Buffer = Buffer.from(''), replaceLS: boolean = false): false | { inValue: bigint, blockTx: BlockTx } {
		let inValue = 0n;
		let outValue = 0n;
		let thisVin = [];
		let thisVout = [];

		for (let i = 0; i < vin.length; i++) {
			let lastLockScript;
			let previousOutouts = [];
			for (let j = 0; j < vin[i].length; j++) {
				let voutn = vin[i][j].voutn;
				let lastTx = this.blockchainDb.getTransactionByTxid(vin[i][j].txid);
				if (!lastTx) {
					return false;
				}
				if (lastTx.voutspent[voutn]) {
					return false;
				}
				if (!lastTx.blockTx.vout[voutn]) {
					return false;
				}
				let lockScript = lastTx.blockTx.vout[voutn].lockScript;
				if (!lockScript) {
					return false;
				}

				if (j !== 0) {
					if (!lastLockScript.equals(lockScript)) {
						return false;
					}
				}
				lastLockScript = lockScript;
				inValue += lastTx.blockTx.vout[voutn].value;
				previousOutouts[j] = { txid: vin[i][j].txid.toString('hex'), voutn };
			}

			thisVin[i] = {
				previousOutouts,
				unlockScript: (replaceLS) ? lastLockScript.toString('hex') : '',
				sequence: 0xff_ff_ff_ff
			}
		}

		for (let i = 0; i < vout.length; i++) {
			if (vout[i].address.length !== 32) {
				return false;
			}
			thisVout[i] = {
				value: vout[i].value.toString(10),
				lockScript: `20${vout[i].address.toString('hex')}fc`
			}
			outValue += vout[i].value;
		}

		let changeValue = inValue - outValue;

		if (changeValue < 0n) {
			return false;
		}

		let blockTx = BlockTx.jsonDataToClass({
			version: 0,
			vin: thisVin,
			vout: thisVout,
			pqcert: [],
			opReturn: opReturn.toString('hex'),
			nLockTime: 0
		});

		if (!blockTx) {
			return false;
		}

		return { inValue, blockTx };
	}

	/**
	 * Get difficulty.
	 * @param {boolean} [raw] Show raw fomat. 
	 * @returns {false|Buffer|number} If complete return difficulty else return false.
	 */
	getDifficulty(): false | number;
	getDifficulty(raw: boolean): false | Buffer;
	getDifficulty(raw?: boolean): false | Buffer | number {
		let lastBlock = this.blockchainDb.getLastBlock();
		if (!lastBlock) {
			return false;
		}

		let thisHeight = lastBlock.height + 1;
		let thisNbit;

		let lastBlockHeader = new BlockHeader(lastBlock.header, true);

		if (lastBlock.height !== 0 && lastBlock.height % nbitSampleRate === 0) {
			let sampleStart = this.blockchainDb.getBlockDataByHeight(lastBlock.height - nbitSampleRate);
			if (!sampleStart) {
				return false;
			}

			let sampleStartBlockHeader = new BlockHeader(sampleStart.header, true);
			let startTime = sampleStartBlockHeader.getTime();
			let endTime = lastBlockHeader.getTime();

			thisNbit = calculateNbit(referenceSeconds, lastBlockHeader.rawNBit, nbitSampleRate, startTime, endTime);
		}
		else {
			thisNbit = lastBlockHeader.rawNBit;
		}

		if (raw) {
			return thisNbit;
		}

		return getDifficultyByNbit(thisNbit);
	}

	/**
	 * Transation validator.
	 * @param {BlockTx} BlockTx Block transaction.
	 * @param {number} height block height.
	 * @param {boolean} [isCoinbase] Is the transaction Coinbase.
	 * @param {bigint} [totalFee] Total fee.
	 * @returns {false|object} If complete return `{fee: bigint}` else return false.
	 */
	txValidator(BlockTx: BlockTx, height: number, isCoinbase?: boolean, totalFee?: bigint): false | { fee: bigint } {
		let version = getVersionByHeight(height);
		let txV = new TxValidator(BlockTx, this.blockchainDb, version);
		let r;
		if (isCoinbase) {
			r = txV.verify(1n, height, true, totalFee);
		}
		else {
			r = txV.verify(1n, height, false);
		}

		return r;
	}
}

export {
	Core,
	BlockTx,
	BlockData,
}