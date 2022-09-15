import * as lmdb from 'lmdb';
class IndexDb {
	readonly blockHeightIndexDb: lmdb.Database;
	readonly txidIndexDb: lmdb.Database;
	readonly pqcertIndexDb: lmdb.Database;

	constructor(dbRoot: lmdb.RootDatabase) {
		this.blockHeightIndexDb = dbRoot.openDB({ name: 'block_height_index', keyEncoding: 'uint32' });
		this.txidIndexDb = dbRoot.openDB({ name: 'block_txid_index', keyEncoding: 'binary' });
		this.pqcertIndexDb = dbRoot.openDB({ name: 'block_pqcert_index', keyEncoding: 'binary' });
	}

	async setHeightIndex(height: number, hash: Buffer) {
		return await this.blockHeightIndexDb.put(height, hash);
	}

	getHeightIndex(height: number) {
		return this.blockHeightIndexDb.get(height);
	}

	async deleteHeightIndex(height: number) {
		return await this.blockHeightIndexDb.remove(height);
	}

	async setTxIndex(txid: Buffer, blockHash: Buffer, txn: number, voutspent: (number | false)[]): Promise<boolean> {
		return await this.txidIndexDb.put(txid, [blockHash, txn, voutspent]);
	}

	async setTxIndexVoutSpent(txid: Buffer, voutspentN: number, height: number | false): Promise<false | { blockHash: Buffer, txn: number, voutspent: (number | false)[] }> {
		let tx = await this.getTxIndex(txid);
		if (!tx) {
			return false;
		}

		tx.voutspent[voutspentN] = height;
		let r = await this.setTxIndex(txid, tx.blockHash, tx.txn, tx.voutspent);
		if(!r) {
			return false;
		}
		return { blockHash: tx.blockHash, txn: tx.txn, voutspent: tx.voutspent };
	}

	getTxIndex(txid: Buffer): undefined | { blockHash: Buffer, txn: number, voutspent: (number | false)[] } {
		let txindex = this.txidIndexDb.get(txid);
		if (txindex) {
			return {
				blockHash: txindex[0],
				txn: txindex[1],
				voutspent: txindex[2]
			}
		}

		return txindex;
	}

	async deleteTxIndex(txid: Buffer) {
		return await this.txidIndexDb.remove(txid);
	}

	async setPqcertIndex(pqcid: Buffer, txid: Buffer, pqcertn: number) {
		return await this.pqcertIndexDb.put(pqcid, [txid, pqcertn]);
	}

	getPqcertIndex(pqcid: Buffer) {
		let pqcertIndex = this.pqcertIndexDb.get(pqcid);
		if (pqcertIndex) {
			return {
				txid: pqcertIndex[0],
				pqcertn: pqcertIndex[1]
			}
		}

		return pqcertIndex;
	}

	async deletePqcertIndex(pqcid: Buffer) {
		return await this.pqcertIndexDb.remove(pqcid);
	}
}

export { IndexDb };