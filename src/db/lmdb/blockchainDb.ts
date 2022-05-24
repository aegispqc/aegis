import * as lmdb from 'lmdb';
import BlockHeader from '../../blockchain/blockHeader';
import { BlockTx } from '../../blockchain/blockTx';
import BlockData from '../../blockchain/blockData';
import { IndexDb } from './IndexDb';
import { PQCertType } from '../../blockchain/pqcert';

type blockDbData = [number, Buffer, Buffer[]];
type txIndexData = Parameters<IndexDb["setTxIndex"]>;
type pqcertIndexData = Parameters<IndexDb["setPqcertIndex"]>;
type lastVoutSpentData = Parameters<IndexDb["setTxIndexVoutSpent"]>;

type BlockDataFormat = {
	hash?: Buffer;
	height: number;
	header: Buffer;
	txs: Buffer[];
}

/**
 * Get tx retrun
 * @typedef {Object} getTxReturn
 * @property {Buffer} blockHash
 * @property {number} blockHeight
 * @property {number} blockTxn
 * @property {BlockTx} blockTx
 * @property {(false | number)[]} voutspent
 */
type getTxReturn = {
	blockHash: Buffer,
	blockHeight: number,
	blockTxn: number,
	blockTx: BlockTx,
	voutspent: (false | number)[]
}

class BlockchainDb {
	private dbRoot: any;
	private coveredDb: any
	private blockDb: any;
	private statusDb: any;
	private indexDb: IndexDb;

	constructor(dbPath: string) {
		this.dbRoot = lmdb.open({
			path: dbPath,
			name: 'blockchain',
			maxDbs: 10
		});
		/** Covered db */
		this.coveredDb = lmdb.open({
			path: `${dbPath}/covered`,
			name: 'covered',
			maxDbs: 2
		});
		/** Block db */
		this.blockDb = this.dbRoot.openDB({ name: 'block_data', keyIsBuffer: true });
		/** Status db */
		this.statusDb = this.dbRoot.openDB({ name: 'block_status' });
		/** Index db */
		this.indexDb = new IndexDb(this.dbRoot);
	}

	/**
	 * Create genesis block.
	 * @param {number} hash block hash.
	 * @param {number} BlockDataFormat Format for writing to the database.
	 * @param {number} blockData pqcert index.
	 * @param {number} txIndex transaction Index.
	 * @param {number} pqcertIndex block hash.
	 * @returns {boolean}
	 */
	async createGenesis(hash: Buffer, BlockDataFormat: BlockDataFormat, blockData: BlockData,
		txIndex: txIndexData[], pqcertIndex: pqcertIndexData[]): Promise<boolean> {
		if (!blockData.blockHeader.isGenesis()) {
			console.error(`Create genesis block is fail !!! block: `);
			console.error(blockData.blockHeader.json);
			return false;
		}

		let dbData = BlockchainDb.getDbdata(BlockDataFormat);

		await this.blockDb.put(hash, dbData);
		await this.indexDb.setHeightIndex(BlockDataFormat.height, hash);

		for (let i = 0; i < txIndex.length; i++) {
			await this.indexDb.setTxIndex(...txIndex[i]);
		}

		for (let i = 0; i < pqcertIndex.length; i++) {
			await this.indexDb.setPqcertIndex(...pqcertIndex[i]);
		}
		await this.statusDb.put('last-blockhash', hash);

		return true;
	}

	/**
	 * Get block data by hash.
	 * @param {number} hash block hash.
	 * @returns {(BlockDataFormat|false)}  Returns a BlockDataFormat if the block exists, or false if it does not.
	 */
	getBlockDataByHash(hash: Buffer): false | BlockDataFormat {
		let dbdata = this.blockDb.get(hash);
		if(!dbdata) {
			return false;
		}
		dbdata = BlockchainDb.getDataByDbdata(dbdata, hash);
		return dbdata;
	}

	/**
	 * Get block hash by height.
	 * @param {number} height block height.
	 * @returns {(Buffer|false)} Returns a hash if the block exists, or false if it does not.
	 */
	getBlockHashByHeight(height: number) {
		return this.indexDb.getHeightIndex(height);
	}

	/**
	 * Get block data by height.
	 * @param {number} height block height.
	 * @returns {(BlockDataFormat|false)}  Returns a BlockDataFormat if the block exists, or false if it does not.
	 */
	getBlockDataByHeight(height: number) {
		let hash = this.getBlockHashByHeight(height);
		if (!hash) {
			return hash;
		}
		return this.getBlockDataByHash(hash);
	}

	/**
	 * Get last block.
	 * @returns {(BlockDataFormat|false)}  Returns a BlockDataFormat if the block exists, or false if it does not.
	 */
	getLastBlock(): false | BlockDataFormat {
		let lastHash = this.statusDb.get('last-blockhash');
		if (!lastHash) {
			return false;
		}

		return this.getBlockDataByHash(lastHash);
	}

	/**
	 * Set new block
	 * @param {Buffer} hash block hash.
	 * @param {BlockDataFormat} BlockDataFormat Format for writing to the database.
	 * @param {Parameters<IndexDb["setTxIndex"]>[]} txIndex transaction Index.
	 * @param {Parameters<IndexDb["setPqcertIndex"]>[]} pqcertIndex pqcert index.
	 * @param {Parameters<IndexDb["setTxIndexVoutSpent"]>[]} lastVoutSpent vout spent.
	 * @returns {Promise<boolean>} success or not.
	 */
	async setBlock(hash: Buffer, BlockDataFormat: BlockDataFormat,
		txIndex: txIndexData[], pqcertIndex: pqcertIndexData[],
		lastVoutSpent: lastVoutSpentData[]): Promise<boolean> {
		let dbData = BlockchainDb.getDbdata(BlockDataFormat);

		await this.blockDb.put(hash, dbData);
		// index 
		await this.indexDb.setHeightIndex(BlockDataFormat.height, hash);

		for (let i = 0; i < txIndex.length; i++) {
			await this.indexDb.setTxIndex(...txIndex[i]);
		}

		for (let i = 0; i < pqcertIndex.length; i++) {
			await this.indexDb.setPqcertIndex(...pqcertIndex[i]);
		}

		for (let i = 0; i < lastVoutSpent.length; i++) {
			await this.indexDb.setTxIndexVoutSpent(...lastVoutSpent[i]);
		}

		await this.statusDb.put('last-blockhash', hash);

		return true;
	}

	/**
	 * Delete block by hash
	 * @param {Buffer} hash block hash.
	 * @returns {Promise<false | { voutspentRetraction: { txid: Buffer, txn: number, voutn: number }[] }>} success or not.
	 */
	async deleteBlock(hash: Buffer): Promise<false | { voutspentRetraction: { txid: Buffer, txn: number, voutn: number }[] }> {
		let lastHash = this.statusDb.get('last-blockhash');
		if (!hash.equals(lastHash)) {
			return false;
		}

		let blockData = this.getBlockDataByHash(hash);

		if (!blockData) {
			return false;
		}

		if (blockData.height === 0) {
			return false;
		}

		let height = blockData.height;
		let blockHeader = new BlockHeader(blockData.header);
		let txs: BlockTx[] = [];
		let txHash = [];

		for (let i = 0; i < blockData.txs.length; i++) {
			let tx = BlockTx.serializeToClass(blockData.txs[i]);
			if (!tx) {
				return false;
			}

			txs[i] = tx;
			txHash[i] = txs[i].getHash();
			if (!txHash[i]) {
				return false;
			}
		}

		let voutspentRetraction: { txid: Buffer, txn: number, voutn: number }[] = [];
		for (let i = 0; i < txs.length; i++) {
			for (let j = 0; j < txs[i].pqcert.length; j++) {
				await this.indexDb.deletePqcertIndex(txs[i].pqcert[j].getHash());
			}
			for (let j = 0; j < txs[i].vin.length; j++) {
				let lastVoutHash = txs[i].vin[j].getLastVoutHashAll();
				if (!lastVoutHash) {
					console.error('lastVoutHash is not found');
					continue;
				}
				for (let k = 0; k < lastVoutHash.length; k++) {
					let txUpdate = await this.indexDb.setTxIndexVoutSpent(lastVoutHash[k].hash, lastVoutHash[k].voutn, false);
					if (!txUpdate) {
						console.error('txUpdate fail');
						continue;
					}
					voutspentRetraction.push({ txid: lastVoutHash[k].hash, txn: txUpdate.txn, voutn: lastVoutHash[k].voutn });
				}
			}
			await this.indexDb.deleteTxIndex(txHash[i]);
		}

		await this.indexDb.deleteHeightIndex(height);
		await this.blockDb.remove(hash);
		await this.statusDb.put('last-blockhash', blockHeader.rawPrehash);
		await this.coveredDb.put(hash, BlockchainDb.getDbdata(blockData));
		return { voutspentRetraction };
	}

	/**
	 * Check block data is not duplicated.
	 * @param {BlockData} blockData 
	 * @returns {boolean}
	 */
	checkDataIsNotDuplicated(blockData: BlockData): boolean {
		for (let i = 0; i < blockData.txs.length; i++) {
			if (!this.checkTxIsNotDuplicated(blockData.txs[i].blockTx)) {
				return false;
			}
		}

		return true;
	}

	/**
	 * Check tx is not duplicated. Include pqcert.
	 * @param {blockTx} blockTx 
	 * @returns {boolean}
	 */
	checkTxIsNotDuplicated(blockTx: BlockTx): boolean {
		let hash = blockTx.getHash();
		if (!hash) {
			return false;
		}

		let oddTx = this.indexDb.getTxIndex(hash);
		if (oddTx) {
			return false;
		}

		for (let i = 0; i < blockTx.pqcert.length; i++) {
			let oddPqc = this.indexDb.getPqcertIndex(blockTx.pqcert[i].getHash());
			if (oddPqc) {
				return false;
			}
		}

		return true;
	}

	/**
	 * Check tx is not duplicated. Forks
	 * @param {blockTx} blockTx 
	 * @param {number} forkStartHeight fork start height
	 * @returns {boolean}
	 */
	checkTxIsNotDuplicatedFork(blockTx: BlockTx, forkStartHeight: number): boolean {
		let hash = blockTx.getHash();
		if (!hash) {
			return false;
		}

		let oddTx = this.indexDb.getTxIndex(hash);
		if (oddTx) {
			let block = this.getBlockDataByHash(oddTx.blockHash);
			if (block && block.height < forkStartHeight) {
				return false;
			}
		}

		for (let i = 0; i < blockTx.pqcert.length; i++) {
			let oddPqc = this.indexDb.getPqcertIndex(blockTx.pqcert[i].getHash());
			if (oddPqc) {
				let oddTx = this.indexDb.getTxIndex(oddPqc.txid);
				if (oddTx) {
					let block = this.getBlockDataByHash(oddTx.blockHash);
					if (block && block.height < forkStartHeight) {
						return false;
					}
				}
				return false;
			}
		}

		return true;
	}

	/**
	 * Get transaction by txid.
	 * @param {Buffer} txid
	 * @returns {(getTxReturn|false)}
	 */
	getTransactionByTxid(txid: Buffer): getTxReturn | false {
		let txIndex = this.indexDb.getTxIndex(txid);
		if (!txIndex) {
			return false;
		}

		let block = this.getBlockDataByHash(txIndex.blockHash);
		if (!block) {
			return false;
		}

		if (!block.txs[txIndex.txn]) {
			return false;
		}

		let tx = BlockTx.serializeToClass(block.txs[txIndex.txn]);
		if (!tx) {
			return false;
		}

		return { blockHash: txIndex.blockHash, blockHeight: block.height, blockTxn: txIndex.txn, blockTx: tx, voutspent: txIndex.voutspent };
	}

	/**
	 * Get tx index.
	 * @param {Buffer} txid 
	 * @returns 
	 */
	getTxIndex(txid: Buffer) {
		return this.indexDb.getTxIndex(txid);
	}

	/**
	 * Get pqcert by hash.
	 * @param {Buffer} hash pqcert hash.
	 * @returns {(false|PQCertType)}
	 */
	getPqcertByHash(hash: Buffer): false | PQCertType {
		let pqcIndex = this.indexDb.getPqcertIndex(hash);
		if (!pqcIndex) {
			return false;
		}

		let tx = this.getTransactionByTxid(pqcIndex.txid);
		if (!tx) {
			return false;
		}

		return tx.blockTx.pqcert[pqcIndex.pqcertn];
	}

	/**
	 * Get block data by db data
	 * @param {blockDbData} data 
	 * @param {Buffer} hash 
	 * @returns {BlockDataFormat}
	 */
	static getDataByDbdata(data: blockDbData, hash: Buffer): BlockDataFormat {
		return {
			hash,
			height: data[0],
			header: data[1],
			txs: data[2]
		}
	}

	/**
	 * Data Format Conversion
	 * @param {BlockDataFormat} data 
	 * @returns {blockDbData}
	 */
	static getDbdata(data: BlockDataFormat): blockDbData {
		return [data.height, data.header, data.txs];
	}
}

export { BlockchainDb, BlockDataFormat, txIndexData, pqcertIndexData, lastVoutSpentData };