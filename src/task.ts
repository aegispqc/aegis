import { Core, BlockData, BlockTx } from "./core";
import { TaskQueue } from "./blockchain/taskQueue";
import { MQPHash } from "./crypto/MQPHash";
import { minerController } from "./miner/minerController";
import BlockDataQueue from "./blockchain/blockDataQueue";
import { BlockForkVerify } from "./blockchain/blockFrokVerify";
import BlockHeader from "./blockchain/blockHeader";
import { delay, objectIsEmpty, testMinerAsync } from "./blockchain/util";
import { BlockDataFormat } from "./db/lmdb/blockchainDb";
import { WalletHistoryDb } from "./wallet/walletHistoryDb";
import { CacheData, CacheDataJson, CacheTx } from "./blockchain/cacheTx";
import { equationsOffset } from "./blockchain/pow";
import Notify from "./blockchain/notify";
import EventEmitter from "events";
import { OpReturn } from "./blockchain/blockTx";
import crypto from 'crypto';

let GBHBuf = Buffer.from('00000000000000000000000000000000000000000000000000000000000000000000000039cea7e7726e8e21cac9799a85b5a820955ea30e7cd9f251d1ab65a5b79587df00208c620b0008b42fe527e00000000000000000000000000000000000000000000000000000', 'hex');
let GBTxBuf = Buffer.from('0000000001000400000000ffffffff0100f08296050000002220b807bc0b4a12331a064be57f0380a44b14b43b2c09320e2f7abb3310f4601c16fc00324d6f7265207468616e207365637572652e006dc7a564cac9c45a2564d5c52e9e8e60ef54c491f8be283919dfa8b2a774d0aa00000000', 'hex');
let GB = BlockData.dataFormatToClass({
	height: 0,
	header: GBHBuf,
	txs: [GBTxBuf]
});

class Task {
	private taskQueue: TaskQueue;
	private getMiningBlockWaitRes: any[];
	private createMiningBlockFlag: boolean;

	core: Core;
	cacheTx: CacheTx;
	walletHistory?: WalletHistoryDb;
	mc: minerController;
	eventEmit: EventEmitter;
	notify: Notify;

	constructor(taskOpt: { taskAmount?: number, cacheMax?: number } = {},
		coreOpt: { dbDir?: string, minerFeeRatio?: bigint },
		walletHistoryOpt?: { dbDir?: string },
		notify?: { blockNotify?: string, blockForkNotify?: string, txNotify?: string }) {
		//-------
		let taskAmount = (taskOpt.taskAmount != undefined) ? taskOpt.taskAmount : 256;
		let cacheMax = (taskOpt.cacheMax != undefined) ? taskOpt.cacheMax : 8192;
		this.taskQueue = new TaskQueue(taskAmount);
		this.core = new Core(coreOpt.dbDir, coreOpt.minerFeeRatio);
		this.cacheTx = new CacheTx(cacheMax);
		this.walletHistory = (walletHistoryOpt) ? new WalletHistoryDb(this.core, walletHistoryOpt.dbDir) : undefined;
		this.mc = new minerController();
		this.eventEmit = new EventEmitter();
		this.notify = new Notify();
		this.getMiningBlockWaitRes = [];
		this.createMiningBlockFlag = false;

		if (notify) {
			for (let x in notify) {
				this.notify.add(x, notify[x]);
			}
		}
	}

	/**
	 * Initial task.
	 * @returns {boolean} Whether to complete
	 * @augments this.core.init
	 */
	async init(): Promise<boolean> {
		if (this.walletHistory) {
			await this.walletHistory.init();
			if (!this.walletHistory.checkVersion()) {
				console.log('An old version of the wallet history has been detected and an automatic upgrade is in progress...');
				await this.walletHistory.clearHistory();
				await new Promise(r => this.walletReindex(0, r));
				await this.walletHistory.updateVersion();
				console.log('Upgrade complete!');
			}
		}

		this.eventEmit.on('newBlock', (m) => {
			this.notify.exec('blockNotify', m.toString('hex'));
		});
		this.eventEmit.on('forkBlock', (m) => {
			this.notify.exec('blockForkNotify', JSON.stringify({ startHeight: m.startHeight, endHeight: m.endHeight, blockHashList: m.blockHashList.map(x => x.toString('hex')) }));
		});
		this.eventEmit.on('addTx', (m) => {
			this.notify.exec('txNotify', JSON.stringify({ txid: m.txid.toString('hex'), mining: m.mining }));
		});

		let coreInitR = this.core.init();
		await this.mc.init();
		if (!coreInitR) {
			if (GB) {
				console.log('Genesis is not found, so create.');
				let r = await this.core.createGenesis(GB);
				if (!r) {
					return r;
				}
				this.core.init();
				console.log('Creating genesis succeeded!');
				return r;
			}
		}
		return true;
	}

	/**
	 * Create genesis block.
	 * @param {BlockData} blockData Block data.
	 * @returns Whether to complete.
	 */
	async createGenesis(...input: Parameters<Core['createGenesis']>) {
		return await this.core.createGenesis(...input);
	}

	/**
	 * Create mining block.
	 * @returns Whether to complete.
	 */
	createMiningBlock(...input: Parameters<Core['createMiningBlock']>) {
		return this.core.createMiningBlock(...input);
	}

	/**
	 * Add coinbase.
	 * @param {Buffer} address wallet address.
	 * @param {PQCertType[]} [pqcert] PQCert type array.
	 * @param {OpReturn} [opReturn] opReturn.
	 * @returns {number|false} If the completion returns number of transactions, the execution fails to return false.
	 */
	addCoinBase(...input: Parameters<Core['addCoinBase']>) {
		return this.core.addCoinBase(...input);
	}

	clearMint(...input: Parameters<Core['clearMint']>) {
		return this.core.clearMint(...input);
	}

	getLastBlock(...input: Parameters<Core['getLastBlock']>) {
		return this.core.getLastBlock(...input);
	}

	getBlockHashByHeight(...input: Parameters<Core['getBlockHashByHeight']>) {
		return this.core.getBlockHashByHeight(...input);
	}

	getBlockDataByHash(...input: Parameters<Core['getBlockDataByHash']>) {
		return this.core.getBlockDataByHash(...input);
	}

	getBlockDataByHeight(...input: Parameters<Core['getBlockDataByHeight']>) {
		return this.core.getBlockDataByHeight(...input);
	}

	getTransactionByTxid(...input: Parameters<Core['getTransactionByTxid']>) {
		return this.core.getTransactionByTxid(...input);
	}

	getPqcertByHash(...input: Parameters<Core['getPqcertByHash']>) {
		return this.core.getPqcertByHash(...input);
	}

	getSignedTxs(...input: Parameters<Core['getSignedTxs']>) {
		return this.core.getSignedTxs(...input);
	}

	blockHashDoesExist(...input: Parameters<Core['blockHashDoesExist']>) {
		return this.core.blockHashDoesExist(...input);
	}

	createTransation(...input: Parameters<Core['createTransation']>) {
		return this.core.createTransation(...input);
	}

	txValidator(...input: Parameters<Core['txValidator']>) {
		return this.core.txValidator(...input);
	}

	getDifficulty(...input: Parameters<Core['getDifficulty']>) {
		return this.core.getDifficulty(...input);
	}

	/**
	 * Enable to start add new transactions.
	 * @returns Whether to complete.
	 */
	async enableAddTx() {
		await this.taskQueue.addTask(async () => {
			this.core.enableAddTx();

			if (this.core.miningBlock) {
				let length = this.cacheTx.length;
				for (let i = 0; i < length; i++) {
					let data = this.cacheTx.first;
					if (!data) {
						break;
					}
					let r = await this.core.addTx(data.blockTx);
					if (r.err) {
						if (r.err === -3) {
							break;
						}
					}
					this.cacheTx.shiftTx();
				}
			}
		});

		return true;
	}

	/**
	 * Disable to add new transactions.
	 * @returns Whether to complete.
	 */
	async disableAddTx() {
		return await this.taskQueue.addTask(this.core.disableAddTx.bind(this.core));
	}

	/**
	 * Adding cache transactions to `blockTx`.
	 * @param {BlockTx} blockTx `blockTx` to be added.
	 * @returns Whether to complete.
	 */
	async addCacheTx(blockTx: BlockTx): Promise<number | false> {
		let r = await this.taskQueue.addTask(async (): Promise<number | false> => {
			let hash = blockTx.getHash('hex');
			if (!hash) {
				return false;
			}

			if (this.cacheTx.hash[hash]) {
				return false;
			}

			let r = this.core.txValidator(blockTx, this.core.nowHeight);
			if (!r) {
				return false;
			}
			let photon = blockTx.getPhoton();
			if (!photon) {
				return false;
			}

			let feeRatio = Number(r.fee) / photon;

			if (this.cacheTx.length > this.cacheTx.max - 1) {
				if (this.cacheTx.last.feeRatio >= feeRatio) {
					console.log('addCacheTx Failed: cache Fall');
					return false;
				}
				this.cacheTx.popTx();
			}

			let address = {}, allLastHashs: { hash: Buffer; voutn: number; }[] = [];
			for (let j = 0; j < blockTx.vin.length; j++) {
				let lastHashs = blockTx.vin[j].getLastVoutHashAll();
				if (!lastHashs) {
					continue;
				}
				allLastHashs.push(...lastHashs);
				if (!lastHashs[0]) {
					continue
				}
				let tx = this.walletHistory.checkTxInput(lastHashs[0].hash, lastHashs[0].voutn)
				if (tx) {
					if (!address[tx.address]) {
						address[tx.address] = { sendValue: 0n, receiveValue: 0n };
					}
					address[tx.address].sendValue += tx.value;
				}
				for (let k = 1; k < lastHashs.length; k++) {
					let tx = this.walletHistory.checkTxInput(lastHashs[k].hash, lastHashs[k].voutn)
					if (tx) {
						address[tx.address].sendValue += tx.value;
					}
				}
			}

			for (let j = 0; j < blockTx.vout.length; j++) {
				let addr: any = blockTx.vout[j].address;
				if (!addr) {
					continue;
				}

				addr = addr.toString('hex');
				let watchAddr = this.walletHistory.getWatchAddresses();
				if (watchAddr && watchAddr[addr]) {
					// address[addr] = true;
					if (!address[addr]) {
						address[addr] = { sendValue: 0n, receiveValue: 0n };
					}
					address[addr].receiveValue += blockTx.vout[j].value;
				}
			}

			if (this.core.miningBlock) {
				for (let i = 0; i < allLastHashs.length; i++) {
					if (this.core.miningBlock.lastVoutIsExist(allLastHashs[i].hash.toString('hex'), allLastHashs[i].voutn)) {
						return false;
					}
				}
			}

			return this.cacheTx.pushTx({ hash, blockTx, time: Date.now(), feeRatio, address });
		});

		if (r.taskErr) {
			return false;
		}

		return r.data;
	}

	/**
	 * Adding transactions to block.
	 * @param {BlockTx} blockTx `blockTx` to be added.
	 * @param {boolean} addCacheFlag Whether to add cache transactions to block.
	 * @returns {Object} return data or err.
	 */
	async addTx(blockTx: BlockTx, addCacheFlag: boolean = false): Promise<{ data?: any, err?: number }> {
		let r = await this.taskQueue.addTask(this.core.addTx.bind(this.core, blockTx));
		if (r.taskErr) {
			return { err: r.taskErr };
		}

		if (r.data?.err) {
			if (r.data.err === -3 || r.data.err === -4 || r.data.err === -7) {
				if (addCacheFlag) {
					let addR = await this.addCacheTx(blockTx);
					if (!addR) {
						return { err: -11 };
					}

					let txid = blockTx.getHash();
					this.eventEmit.emit('addTx', { txid, mining: false });
					return { data: true };
				}
			}

			return { err: r.data.err };
		}

		let txid = blockTx.getHash();
		this.eventEmit.emit('addTx', { txid, mining: true });
		return { data: true };
	}

	/**
	 * Create a new block.
	 * @param {blockData} blockData New block of data.
	 * @returns {Object} return data or err.
	 */
	async newBlock(blockData: BlockData): Promise<{ data?: any, err?: number }> {
		let r = await this.taskQueue.addTask(async () => {
			return await this.core.newBlock(blockData);
		});

		if (r.taskErr) {
			return { err: r.taskErr };
		}

		if (r.data.err) {
			return { err: r.data.err };
		}

		let hash = r.data.data;
		let miningBlock = this.core.miningBlock;
		this.core.clearMint();

		//back cache!
		if (miningBlock) {
			let waitHash = miningBlock.blockHeader.getHash();
			let thisHash = blockData.blockHeader.getHash();

			if (!waitHash.equals(thisHash)) {
				for (let i = 1; i < miningBlock.txs.length; i++) {
					if (!blockData.txids[miningBlock.txs[i].txid]) {
						await this.addCacheTx(miningBlock.txs[i].blockTx);
					}
					else {
						this.cacheTx.deleteMiningByHash(miningBlock.txs[i].txid);
					}
				}
			}
			else {
				this.cacheTx.clearMiningAll();
			}
		}
		this.core.init();
		this.cacheTx.deleteTxsByHashs(Object.keys(blockData.txids));
		this.cacheTx.freeCacheTxTimeOut();
		this.updateWalletByBlockHash(hash);
		this.mc.stopFind();
		this.eventEmit.emit('newBlock', hash);
		return { data: hash };
	}

	/**
	 * New task after adding blocks.
	 * @param {number} blockAmount Block amount.
	 * @param {Function} finishFun finish task.
	 * @returns {BlockDataQueue} Block data queue.
	 */
	newAddBlockTask(blockAmount: number, finishFun: (err: { hash: Buffer } | boolean) => Promise<boolean>): BlockDataQueue {
		let backFun = async (blockData: BlockData): Promise<boolean> => {
			let r = await this.newBlock(blockData);
			if (r.err) {
				finishFun({
					hash: blockData.blockHeader.getHash()
				});
				return false;
			}
			return true;
		};

		return new BlockDataQueue(blockAmount, backFun, finishFun);
	}

	/**
	 * Fork block
	 * @param {Buffer} preHash The hash of the previous block.
	 * @param {BlockData[]} blocks 
	 * @returns Whether to complete.
	 */
	async forkBlock(preHash: Buffer, blocks: BlockData[]) {
		console.log('forkBlock start: ', preHash.toString('hex'));
		let tk = await this.taskQueue.addTask(async () => {
			let forkLastBlock = this.getBlockDataByHash(preHash);
			if (!forkLastBlock) {
				return false;
			}

			let startHeight = forkLastBlock.height + 1;
			let endHeight = startHeight + blocks.length;
			let lastBlock = this.getLastBlock();
			if (!lastBlock) {
				return false;
			}
			console.log(`forkBlock: start height: ${startHeight} endHeight: ${endHeight} thisHeight: ${lastBlock.height}`);

			if (lastBlock.height >= endHeight) {
				return false;
			}

			let blockForkVerify = new BlockForkVerify(this.core, preHash, startHeight, endHeight);

			for (let i = 0; i < blocks.length; i++) {
				let r = await blockForkVerify.addBlock(blocks[i]);
				if (!r) {
					return false;
				}
			}

			if (!blockForkVerify.headerIsReady()) {
				return false;
			}

			let forkV = await blockForkVerify.verify();
			if (!forkV) {
				return false;
			}

			if (this.walletHistory) {
				//reindex stop
				this.walletHistory.reindexFlag = false;
			}
			// fork step start: 0 -> task queue stop; 1 -> delete old block; 2 -> newBlock
			let voutspentRetraction: { height: number, txn: number, voutn: number }[] = [];
			for (let i = lastBlock.height; i >= startHeight; i--) {
				let blockHash = this.core.getBlockHashByHeight(i);
				if (!blockHash) {
					return false;
				}

				let deleteR = await this.core.deleteBlock(blockHash);
				if (!deleteR) {
					return false;
				}
				for (let j = 0; j < deleteR.voutspentRetraction.length; j++) {
					voutspentRetraction.push({ height: i, txn: deleteR.voutspentRetraction[j].txn, voutn: deleteR.voutspentRetraction[j].voutn });
				}
			}

			if (this.walletHistory) {
				this.walletHistory.deleteOverHeight(startHeight);
				this.walletHistory.setUpdateHeight(startHeight - 1);
			}

			let forkBlockHashList = [];
			for (let i = 0; i < blockForkVerify.blockList.length; i++) {
				let r = await this.core.newBlock(blockForkVerify.blockList[i].blockData);
				if (r.err) {
					return false;
				}
				this.cacheTx.deleteTxsByHashs(Object.keys(blockForkVerify.blockList[i].blockData.txids));
				forkBlockHashList[i] = r.data;
			}

			if (this.walletHistory) {
				this.walletHistory.recheckUTXO(voutspentRetraction);
				this.walletReindex(startHeight);
			}

			return { startHeight, endHeight, blockHashList: forkBlockHashList };
		});

		if (tk.taskErr || !tk.data) {
			console.error('forkBlock fail: ');
			return false;
		}

		this.core.init();
		this.eventEmit.emit('forkBlock', tk.data);

		return true;
	}

	/**
	 * @param {Buffer|false} address Receiving address. If set `false` then stop mine.
	 * @param {boolean} inCacheTxFlag In cache transaction flag.
	 * @param {boolean} testFlag Test mode flag.
	 */
	async mine(address: Buffer | false, inCacheTxFlag: boolean = false, testFlag: boolean = false) {
		if (address === false) {
			console.log('miner stop!!');
			this.mc.stopContinuous();
		}
		else {
			if (this.mc.minerRunFlag) {
				console.log('miner already start!!');
				return;
			}
			if (!this.mc.minerBinHashCheck) {
				console.log('minerBinHash was change!');
				return;
			}
			console.log('miner start!!');
			this.mc.startContinuous();
			this.mineOnce(address, inCacheTxFlag, testFlag);
		}
	}

	/**
	 * Mining one block.
	 * @param {Buffer} address Receiving address.
	 * @param {boolean} inCacheTxFlag In cache transaction flag.
	 * @param {boolean} testFlag Test mode flag.
	 * @returns Whether to complete.
	 */
	async mineOnce(address: Buffer, inCacheTxFlag: boolean = false, testFlag: boolean = false) {
		let lastBlock = this.getLastBlock();
		if (!lastBlock) {
			return false;
		}

		if ((BlockHeader.serializeToJson(lastBlock.header).time) >= Math.floor(Date.now() / 1000)) {
			await delay(1000);
		}

		if (!this.core.miningBlock) {
			await this.createMiningBlock();
		}
		let miningBlock = this.core.miningBlock;

		this.addCoinBase(address);
		if (inCacheTxFlag) {
			await this.enableAddTx();
		}
		await this.disableAddTx();

		let isReady = miningBlock.txsReady();
		if (!isReady) {
			console.error('isReady failed!');
			return false;
		}

		let seed = miningBlock.blockHeader.getPowSeed();
		let m = miningBlock.blockHeader.rawNBit.readUInt8(0) + equationsOffset;
		let n = m + 5;
		let mqphash = new MQPHash(seed, m, n);

		let x;
		if (testFlag) {
			this.mc.getXTset();
			x = await testMinerAsync(mqphash, miningBlock.blockHeader.rawNBit, this.mc);
		}
		else {
			let whichXWidth: number = 1000;
			await this.mc.setup(mqphash, miningBlock.blockHeader.rawNBit, null, whichXWidth);
			x = await this.mc.getX();
		}

		if (!x) {
			// This seed not found.
			if (!this.mc.interruptFlag) {
				this.mineOnce(address, inCacheTxFlag, testFlag);
				return false;
			}
		}
		else {
			miningBlock.setNonce(x);
			let r = await this.newBlock(miningBlock);
			console.log(`Miner ${(r.err) ? 'Failed' : 'Suc'} newBlock height ${this.core.nowHeight}`);
		}

		if (this.mc.minerRunFlag) {
			this.mineOnce(address, inCacheTxFlag, testFlag);
		}
	}

	async getMiningBlock(): Promise<{ data?: any, err?: string }> {
		if (this.core.miningBlock && this.createMiningBlockFlag) {
			return new Promise((r) => this.getMiningBlockWaitRes.push(r));
		}

		// create mining block.
		if (!this.core.miningBlock) {
			this.createMiningBlockFlag = true;
			this.createMiningBlock();
			this.addCoinBase(Buffer.from('ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', 'hex'), undefined, new OpReturn(crypto.randomBytes(16)));
			await this.enableAddTx();
			await this.disableAddTx();
			this.createMiningBlockFlag = false;
		}

		if (!this.core.miningBlock || this.core.miningBlock.txs[0] === undefined) {
			this.getMiningBlockWaitRes.forEach(resFn => resFn({ err: 'Coinbase Serialize failed.' }));
			this.getMiningBlockWaitRes = [];
			return { err: 'Coinbase was undefined.' };
		}
		let coinBaseRaw = this.core.miningBlock.txs[0].blockTx.getSerialize();
		if (!coinBaseRaw) {
			this.getMiningBlockWaitRes.forEach(resFn => resFn({ err: 'Coinbase Serialize failed.' }));
			this.getMiningBlockWaitRes = [];
			return { err: 'Coinbase Serialize failed.' };
		}

		let headerRaw = this.core.miningBlock.blockHeader.raw.toString('hex');
		let nktp = this.core.miningBlock.getMerkleTreeOnlyCoinBase();

		if (!nktp) {
			this.getMiningBlockWaitRes.forEach(resFn => resFn({ err: 'nktp fail' }));
			this.getMiningBlockWaitRes = [];
			return { err: 'nktp fail' };
		}

		this.getMiningBlockWaitRes.forEach(resFn => resFn({ data: { coinBaseRaw, headerRaw, nktp } }));
		this.getMiningBlockWaitRes = [];
		return { data: { coinBaseRaw, headerRaw, nktp } };
	}
	/**
	 * Add a new block, blockTx Only Txis.
	 * @param {object} block 
	 * @param {string} block.hash block hash.
	 * @param {string} block.header block header.(raw format)
	 * @param {string} block.coinbaseRaw Transactions in the block.(raw format)
	 * @returns {rpcReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	async newBlockOnlyTxids(block: { hash: string, header: string, coinbaseRaw: string }): Promise<{ data?: any, err?: string }> {
		let blockHeader = new BlockHeader(Buffer.from(block.header, 'hex'), true);
		let realHash = blockHeader.getHash('hex');
		if (block.hash !== realHash) {
			return { err: `Block hash mismatch (${block.hash} is not equal to ${realHash})` };
		}

		if (!this.core.miningBlock) {
			return { err: 'miningBlock was not found.' };
		}
		let blockData = new BlockData(blockHeader);
		let tx = BlockTx.serializeToClass(Buffer.from(block.coinbaseRaw, 'hex'));
		if (!tx) {
			return { err: 'Create coinBase class failed.' };
		}
		if (blockData.addTx(tx).err) {
			return { err: `Add coinbase tx is failed` };
		}
		for (let i = 1; i < this.core.miningBlock.txs.length; i++) {

			if (blockData.addTx(this.core.miningBlock.txs[i].blockTx).err) {
				return { err: `add txids[${i}]: is failed` };
			}
		}

		let result = await this.newBlock(blockData);
		if (result.err) {
			return { err: `newBlock failed. err code: ${result.err}` };
		}

		return { data: result.data };
	}

	/**
	 * get transaction pool list.
	 */
	async getTxPoolList() {
		let cache = await this.cacheTx.getTxList().map(x => ({ txid: x.hash, time: x.time, feeRatio: x.feeRatio }));
		let mining = this.cacheTx.getMiningTxList().map(x => ({ txid: x.hash, time: x.time, feeRatio: x.feeRatio }));
		return { cache, cacheAmount: cache.length, mining, miningAmount: mining.length };
	}

	/**
	 * get transaction pool.
	 * @param {Buffer} hash transaction hash.
	 * @returns Cache data.
	 */
	getTxPool(hash: Buffer): false | CacheData | CacheDataJson {
		let hashStr = hash.toString('hex');
		let cache = <CacheData>this.cacheTx.getTx(hashStr, true);
		if (cache) {
			return cache;
		}
	}

	/**
	 * The last Vout of the pool is exist.
	 * @param {string} hash 
	 * @param {number} n 
	 * @returns Whether to complete.
	 */
	poolLastVoutIsExist(hash: string, n: number) {
		let cache = this.cacheTx.lastVoutIsExist(hash, n);
		if (cache) {
			return true;
		}
		if (this.core.miningBlock && this.core.miningBlock.lastVoutIsExist(hash, n)) {
			return true;
		}
		return false;
	}

	/**
	 * Get cache transaction by hash.
	 * @param hash transaction hash.
	 * @returns cache data.
	 */
	getCacheTxByHash(hash: string) {
		return this.cacheTx.getTx(hash);
	}

	/**
	 * Update wallet by block hash.
	 * @param {Buffer} hash block hash.
	 * @returns Whether to complete.
	 */
	async updateWalletByBlockHash(hash: Buffer) {
		if (!this.walletHistory || this.walletHistory.watchAddressIsEmpty) {
			return false;
		}

		let block = await this.getBlockDataByHash(hash);
		if (!block) {
			return false;
		}

		await this.updateWalletByBlock(block);
	}

	/**
	 * Update wallet by block.
	 * @param {BlockDataFormat} block block hash.
	 * @returns Whether to complete.
	 */
	async updateWalletByBlock(block: BlockDataFormat) {
		if (!this.walletHistory || this.walletHistory.watchAddressIsEmpty) {
			return false;
		}
		let blockHeader = new BlockHeader(block.header);
		for (let i = 0; i < block.txs.length; i++) {
			let blockTx = BlockTx.serializeToClass(block.txs[i]);
			if (!blockTx) {
				continue;
			}
			await this.updateWalletByTx(blockTx, block.height, blockHeader.getTime(), i);
		}
		await this.walletHistory.setUpdateHeight(block.height);
	}

	/**
	 * Update wallet by transaction.
	 * @param {BlockTx} blockTx Block transaction.
	 * @param {number} height Block height.
	 * @param {number} time Block time.
	 * @param {number} txn Block txn.
	 * @returns Whether to complete.
	 */
	async updateWalletByTx(blockTx: BlockTx, height: number, time: number, txn: number) {
		if (!this.walletHistory || this.walletHistory.watchAddressIsEmpty) {
			return false;
		}
		await this.walletHistory.addTx(blockTx, height, time, txn);
	}

	/**
	 * Now status.
	 * @returns 
	 * ```
	 * {
	 *  time,	  	
	 *  nowHeight, 
	 *  difficulty, 
	 *  mining,	
	 *  walletReindexing,	
	 *  txPoolLen, 
	 *  memoryUsed
	 * }
	 * ```
	 */
	async getStatus() {
		let txPool = await this.getTxPoolList();
		let r = {
			time: Date.now(),
			connections: 0,
			version: 0,
			nowHeight: this.core.nowHeight,
			difficulty: this.core.getDifficulty(),
			mining: this.mc.minerRunFlag,
			walletReindexing: (this.walletHistory) ? this.walletHistory.reindexFlag : false,
			txPoolLen: txPool.cacheAmount + txPool.miningAmount,
			memoryUsed: `${process.memoryUsage().heapUsed >>> 20} MB`
		}

		return r;
	}

	/**
	 * Reindex wallet.
	 * @param {number} startHeight Reindex start height.
	 * @returns Whether to complete.
	 */
	walletReindex(startHeight?: number, finishCB = (endHeight) => { }): boolean {
		if (!this.walletHistory) {
			finishCB(-1);
			return false;
		}
		if (startHeight < 0) {
			this.walletHistory.reindexFlag = false;
			finishCB(-1);
			return true;
		}
		if (this.walletHistory.reindexFlag) {
			finishCB(-1);
			return false;
		}
		if (startHeight === undefined) {
			startHeight = this.walletHistory.getUpdatedHeight();
		}

		if (objectIsEmpty(this.walletHistory.getWatchAddresses())) {
			finishCB(-1);
			return true;
		}
		this.walletHistory.reindexFlag = true;
		(async () => {
			console.log(`Start re-indexing wallets. height: ${startHeight}`, new Date(Date.now()));
			do {
				let block = this.getBlockDataByHeight(startHeight);
				if (!block) {
					this.walletHistory.reindexFlag = false;
					console.log(`Wallet indexing completed! height: ${startHeight - 1}`, new Date(Date.now()));
					return finishCB(startHeight - 1);
				}
				await this.updateWalletByBlock(block);
				startHeight++;
				if (startHeight % 100 === 0) {
					console.log(`Re-indexing progress: ${startHeight} / ${this.core.nowHeight}`);
				}

			} while (this.walletHistory.reindexFlag);
			console.log(`Stop re-indexing wallets. height: ${startHeight - 1}`, new Date(Date.now()));
			finishCB(startHeight - 1);
		})();

		return true;
	}

	async walletClearHistory() {
		if (!this.walletHistory) {
			return false;
		}

		return await this.walletHistory.clearHistory();
	}

	/**
	 * Add watch wallet address.
	 * @param address watch address.
	 * @returns Whether to complete.
	 */
	async walletAddWatchAddress(address: string) {
		if (!this.walletHistory) {
			return false;
		}

		if (this.walletHistory.reindexFlag) {
			return false;
		}

		return await this.walletHistory.addAddress(address);
	}

	/**
	 * Create new transation.
	 * @param {string} srcAddress Send address.
	 * @param {string} tgtAddress Target address.
	 * @param {bigint} value send amount of coin.
	 * @param {bigint} extraValue Amount reserved for fee.
	 * @param {bigint} feeRatio Fee ratio. Do not less than 1.
	 * @param {boolean} useAllUTXO Use all UTXO
	 * @returns {false|BlockTx} Whether to complete.
	 */
	async walletCreateTransation(srcAddress: string, tgtAddress: string, value: bigint, extraValue: bigint = 0n, feeRatio: bigint = 1n, useAllUTXO: boolean = false): Promise<false | { inValue: bigint, blockTx: BlockTx }> {
		if (!this.walletHistory) {
			return false;
		}

		if (this.walletHistory.reindexFlag) {
			return false;
		}

		let lastvout: any = await this.taskQueue.addTask(async () => {
			return await this.walletHistory.createNewTx(srcAddress, value, extraValue, 2, feeRatio, useAllUTXO, this.poolLastVoutIsExist.bind(this));
		});
		if (lastvout.taskErr || !lastvout.data) {
			return false;
		}
		lastvout = lastvout.data;

		lastvout.forEach(x => {
			x.txid = Buffer.from(x.txid, 'hex');
		});

		let vin = [lastvout];
		let vout = [
			{
				address: Buffer.from(tgtAddress, 'hex'),
				value: value
			}
		];
		let r = await this.core.createTransation(vin, vout, undefined, true);
		return r;
	}

	/**
	 * Create new transation.
	 * @param {string} srcAddress Send address.
	 * @param {string} tgtAddress Target address.
	 * @param {bigint} value send amount of coin.
	 * @param {bigint} extraValue Amount reserved for fee.
	 * @param {bigint} feeRatio Fee ratio. Do not less than 1.
	 * @param {boolean} useAllUTXO Use all UTXO
	 * @returns {false|BlockTx} Whether to complete.
	 */
	async walletCreateAdvancedTransation(srcAddress: string, target: { address: string, value: bigint }[] | bigint, extraValue: bigint = 0n, feeRatio: bigint = 1n, useAllUTXO: boolean = false): Promise<false | { inValue: bigint, blockTx: BlockTx }> {
		if (!this.walletHistory) {
			return false;
		}
		if (this.walletHistory.reindexFlag) {
			return false;
		}
		// find utxo (lastvout)
		if (typeof target == 'bigint') {
			let lastvout: any = await this.taskQueue.addTask(async () => {
				return await this.walletHistory.createNewTx(srcAddress, target, extraValue, 0, feeRatio, useAllUTXO, this.poolLastVoutIsExist.bind(this));
			});
			if (lastvout.taskErr || !lastvout.data) {
				return false;
			}
			lastvout = lastvout.data;
			lastvout.forEach(x => {
				x.txid = Buffer.from(x.txid, 'hex');
			});
			let vin = [lastvout];
			let vout = [];
			let r = await this.core.createTransation(vin, vout, undefined, true);
			return r;
		}
		else {
			let targetAmount = target.length;
			let totalValue = target.reduce((a, { value }) => a + value, 0n);
			let lastvout: any = await this.taskQueue.addTask(async () => {
				return await this.walletHistory.createNewTx(srcAddress, totalValue, extraValue, targetAmount + 1, feeRatio, useAllUTXO, this.poolLastVoutIsExist.bind(this));
			});
			if (lastvout.taskErr || !lastvout.data) {
				return false;
			}
			lastvout = lastvout.data;
			lastvout.forEach(x => {
				x.txid = Buffer.from(x.txid, 'hex');
			});
			let vin = [lastvout];
			let vout = target.map(({ address, value }) => ({ address: Buffer.from(address, 'hex'), value }));
			let r = await this.core.createTransation(vin, vout, undefined, true);
			return r;
		}
	}

	/**
	 * Get transactions for single or multiple addresses.
	 * @param {string} address Watch address.
	 * @param {object} opt 
	 * @param {number} opt.limit Number of limit.
	 * @param {number} opt.skip Number of skip.
	 * @param {boolean} opt.reverse Sort Reverse.
	 * @returns {false|object} Whether to complete.
	 */
	async walletGetTxList(address: string, opt: { limit?: number, skip?: number, reverse?: boolean }, normalFlag?: Boolean) {
		if (!this.walletHistory) {
			return false;
		}
		let txList: any = await this.taskQueue.addTask(async () => {
			return (normalFlag) ? await this.walletHistory.getNormalTxList(address, opt) : await this.walletHistory.getTxList(address, opt);
		});
		if (txList.taskErr || !txList.data) {
			return false;
		}
		txList = txList.data;
		let waitTx = [];
		let mining = [];

		this.cacheTx.getTxList(true).forEach((x: CacheData) => {
			if (!x.address || !x.address[address]) {
				return;
			}
			waitTx.push({
				address,
				txid: x.hash,
				value: {
					sendValue: x.address[address].sendValue,
					receiveValue: x.address[address].receiveValue
				},
				time: x.time,
				feeRatio: x.feeRatio
			});
		});

		this.cacheTx.getMiningTxList(true).forEach((x: CacheData) => {
			if (!x.address || !x.address[address]) {
				return;
			}
			mining.push({
				address,
				txid: x.hash,
				value: {
					sendValue: x.address[address].sendValue,
					receiveValue: x.address[address].receiveValue
				},
				time: x.time,
				feeRatio: x.feeRatio
			});
		});
		return { waitTx, mining, txList };
	}

	/**
	 * Get untraded list.
	 * @param {string} address Watch address.
	 * @param {object} opt 
	 * @param {number} opt.limit Number of limit.
	 * @param {number} opt.skip Number of skip.
	 * @param {boolean} opt.reverse Sort Reverse.
	 * @returns {false|object[]} Whether to complete.
	 */
	async walletGetUTXOList(address: string, opt: { limit: number, skip: number, reverse?: boolean }) {
		if (!this.walletHistory) {
			return false;
		}
		let txList: any = await this.taskQueue.addTask(async () => {
			let utxoList = await this.walletHistory.getUTXOList(address, opt);
			if (!utxoList) {
				return false;
			}
			utxoList.forEach((x) => {
				if (this.cacheTx.lastVoutIsExist(x.txid, x.voutn)) {
					x.status = 'waiting';
				}
				else if (this.core.miningBlock?.lastVoutIsExist(x.txid, x.voutn)) {
					x.status = 'mining';
				}
				else {
					x.status = 'normal';
				}
			});
			return utxoList;
		});
		if (txList.taskErr || !txList.data) {
			return false;
		}
		txList = txList.data;
		return txList;
	}

	async walletGetBalanceOne(address: string) {
		let balance: any = await this.taskQueue.addTask(async () => {
			return await this.walletHistory.getBalance(address, this.poolLastVoutIsExist.bind(this));
		});
		if (balance.taskErr || balance.data === false) {
			return false;
		}
		balance = balance.data;
		let r = { confirmed: balance, unconfirmed: 0n };
		let addressBuf = Buffer.from(address, 'hex');

		let cacheTx = <CacheData[]>this.cacheTx.getTxList(true);
		cacheTx.forEach(x => {
			if (x.address && x.address[address]) {
				let vout = x.blockTx.getTxOutValues();
				vout.forEach((y) => {
					if (y.address && addressBuf.equals(y.address)) {
						r.unconfirmed += y.value;
					}
				});
			}
		});

		let miningTx = <CacheData[]>this.cacheTx.getMiningTxList(true)
		miningTx.forEach(x => {
			if (x.address && x.address[address]) {
				let vout = x.blockTx.getTxOutValues();
				vout.forEach((y) => {
					if (y.address && addressBuf.equals(y.address)) {
						r.unconfirmed += y.value;
					}
				});
			}
		});
		return r;
	}

	async walletGetBalance(address: string | string[]) {
		if (!this.walletHistory) {
			return { error: 'Wallet db is not found!' };
		}
		if (Array.isArray(address)) {
			let total: any = { confirmed: 0n, unconfirmed: 0n };
			let sub = {};
			for (let i = 0; i < address.length; i++) {
				let r = await this.walletGetBalanceOne(address[i]);
				if (!r) {
					return { error: `address (${address[i]}) is not found. Try running walletAutoWatch.` };
				}

				total.confirmed += r.confirmed;
				total.unconfirmed += r.unconfirmed;
				sub[address[i]] = r;
			}
			return { sub, total };
		}

		let r = await this.walletGetBalanceOne(address);
		if (!r) {
			return { error: `address (${address}) is not found. Try running walletAutoWatch.` };
		}
		return { confirmed: r.confirmed, unconfirmed: r.unconfirmed };
	}

	async exit() {
		await this.taskQueue.terminate();
		console.log('Task exit');
	}
}

export { Task, CacheTx };