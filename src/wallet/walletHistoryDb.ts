import { BlockTx, Core } from '../core';
import { Task } from '../task';
import * as lmdb from 'lmdb';
import { TaskQueue } from '../blockchain/taskQueue';
import path from 'path';

// Address bytes not included
let keyStart = Buffer.from('00000000000000000000000000', 'hex');
let keyEnd = Buffer.from('ffffffffffffffffffffffffff', 'hex');
let normalKeyStart = Buffer.from('00000000', 'hex');
let normalKeyEnd = Buffer.from('ffffffff', 'hex');

type receiveKeyJson = {
	address: string | Buffer;
	height: number;
	txn: number;
	voutn: number;
	type: 0;
};

type sendKeyJson = {
	address: string | Buffer;
	height: number;
	txn: number;
	vinn: number;
	type: 1;
};

type normalKeyJson = {
	address: string | Buffer;
	height: number;
	txn: number;
};

type normalValueJson = {
	txid: Buffer;
	time: number;
	sendValue: bigint;
	receiveValue: bigint;
}

// 
// KeyBuffer
// | address <32 bytes> | height <4 bytes> | txn <4 bytes> | voutn or vinn <4 bytes> | type <1 bytes> |
// |                                      total <45 bytes>                                            |
// 
class KeyBuffer {
	buf: Buffer;
	constructor(data: Buffer | receiveKeyJson | sendKeyJson) {
		if (Buffer.isBuffer(data)) {
			this.buf = data;
		}
		else {
			this.buf = Buffer.alloc(45);
			this.address = data.address;
			this.height = data.height;
			this.txn = data.txn;
			if (data.type === 0) {
				this.voutn = data.voutn;
			}
			else {
				this.vinn = data.vinn;
			}
			this.type = data.type;
		}
	}

	get address(): string {
		return this.buf.toString('hex', 0, 32);
	}

	get addressBuf(): Buffer {
		return this.buf.subarray(0, 32);
	}

	get height() {
		return this.buf.readUInt32BE(32);
	}

	get txn() {
		return this.buf.readUInt32BE(36);
	}

	get voutn() {
		return this.buf.readUInt32BE(40);
	}

	get vinn() {
		return this.buf.readUInt32BE(40);
	}

	get type() {
		return this.buf.readUInt8(44);
	}

	set address(addr: string | Buffer) {
		if (typeof addr === 'string') {
			this.buf.write(addr, 0, 32, 'hex');
		}
		else {
			addr.copy(this.buf, 0, 0, 32);
		}
	}

	set height(v) {
		this.buf.writeInt32BE(v, 32);
	}

	set txn(v) {
		this.buf.writeInt32BE(v, 36);
	}

	set voutn(v) {
		this.buf.writeInt32BE(v, 40);
	}

	set vinn(v) {
		this.buf.writeInt32BE(v, 40);
	}

	set type(v) {
		this.buf.writeUInt8(v, 44);
	}
}

// NormalKeyBuffer
// | address <32 bytes> | height <4 bytes> | txn <4 bytes> |
// |                  total <40 bytes>                     |
// 
class NormalKeyBuffer {
	buf: Buffer;
	constructor(data: Buffer | normalKeyJson) {
		if (Buffer.isBuffer(data)) {
			this.buf = data;
		}
		else {
			this.buf = Buffer.alloc(45);
			this.address = data.address;
			this.height = data.height;
			this.txn = data.txn;
		}
	}

	get address(): string {
		return this.buf.toString('hex', 0, 32);
	}

	get addressBuf(): Buffer {
		return this.buf.subarray(0, 32);
	}

	get height() {
		return this.buf.readUInt32BE(32);
	}

	get txn() {
		return this.buf.readUInt32BE(36);
	}

	set address(addr: string | Buffer) {
		if (typeof addr === 'string') {
			this.buf.write(addr, 0, 32, 'hex');
		}
		else {
			addr.copy(this.buf, 0, 0, 32);
		}
	}

	set height(v) {
		this.buf.writeInt32BE(v, 32);
	}

	set txn(v) {
		this.buf.writeInt32BE(v, 36);
	}
}

class NormalData {
	address: string;
	data: normalValueJson;
	constructor(address: string, txid: Buffer, time: number) {
		this.address = address;
		this.data = { txid, time, sendValue: 0n, receiveValue: 0n };
	}
}

class WalletHistoryDb {
	core: Core;
	dbDir: string;
	dbRoot: lmdb.RootDatabase;
	optionDb: lmdb.Database;
	historyDb: lmdb.Database;
	historyUTXODb: lmdb.Database;
	normalHistroyDb: lmdb.Database;
	watchAddress: { [key: string]: true };
	watchAddressIsEmpty: boolean;
	reindexFlag: boolean;
	resetFlag: boolean;
	taskQueue: TaskQueue;
	constructor(core: Core, dbDir: string = path.join(process.cwd(), './walletHistoryDb/')) {
		this.core = core;
		this.dbDir = dbDir;
		this.reindexFlag = false;
		this.resetFlag = false;
		this.watchAddress = {};
		this.watchAddressIsEmpty = true;
		this.taskQueue = new TaskQueue(100);
	}

	async init() {
		this.dbRoot = lmdb.open({
			path: this.dbDir,
			name: 'wallet',
			maxDbs: 12,
			maxReaders: 1
		});

		this.optionDb = this.dbRoot.openDB({ name: 'option' });

		let watchAddr = this.optionDb.get('watchAddr');
		if (!watchAddr) {
			watchAddr = { type: 'watchAddr', addr: {} };
			await this.optionDb.put('watchAddr', watchAddr);
			await this.optionDb.put('version', 1);
		}

		this.historyDb = this.dbRoot.openDB({ name: 'history', keyEncoding: 'binary' });
		this.historyUTXODb = this.dbRoot.openDB({ name: 'history_utxo', keyEncoding: 'binary' });
		this.normalHistroyDb = this.dbRoot.openDB({ name: 'normal_history', keyEncoding: 'binary' });

		for (let x in watchAddr.addr) {
			if (this.watchAddressIsEmpty) {
				this.watchAddressIsEmpty = false;
			}
			this.watchAddress[x] = true;
		}
	}

	checkVersion(): boolean {
		let version = this.optionDb.get('version');
		if (!version || version < 1) {
			return false;
		}
		return true;
	}

	async updateVersion() {
		await this.optionDb.put('version', 1);
	}

	getWatchAddresses() {
		return this.watchAddress;
	}

	getUpdatedHeight(): number {
		let watchAddr = this.optionDb.get('watchAddr');
		if (!watchAddr || watchAddr.height === undefined) {
			return 0;
		}

		return watchAddr.height;
	}

	async setUpdateHeight(height: number) {
		let r = await this.taskQueue.addTask(async (): Promise<boolean> => {
			let watchAddr = this.optionDb.get('watchAddr');
			if (watchAddr) {
				watchAddr.height = height;
				return await this.optionDb.put('watchAddr', watchAddr);
			}

			return false;
		});

		if (r.taskErr) {
			return false;
		}

		return r.data;
	}

	async addAddress(address: string) {
		let r = await this.taskQueue.addTask(async (): Promise<boolean> => {
			let watchAddr = this.optionDb.get('watchAddr');
			if (!watchAddr) {
				watchAddr = { type: 'watchAddr', addr: { [address]: true } };
				await this.optionDb.put('watchAddr', watchAddr);
				return true;
			}

			if (watchAddr.addr[address]) {
				return false;
			}

			watchAddr.addr[address] = true;

			await this.optionDb.put('watchAddr', watchAddr);
			this.watchAddress[address] = true;
			if (this.watchAddressIsEmpty) {
				this.watchAddressIsEmpty = false;
			}

			return true;
		});

		if (r.taskErr) {
			return false;
		}

		return r.data;
	}

	async addTx(blockTx: BlockTx, height: number, time: number, txn: number) {
		await this.taskQueue.addTask(async () => {
			let txid = blockTx.getHash();
			if (!txid) {
				console.error('block hash error');
				return;
			}

			let normalData: { [key: string]: NormalData } = {};
			for (let i = 0; i < blockTx.vin.length; i++) {
				let x = blockTx.vin[i];
				let lastHashs = x.getLastVoutHashAll();
				if (!lastHashs) {
					console.error('lastHashs error');
					return;
				}
				if (!lastHashs[0]) {
					continue;
				}
				let tx = this.checkTxInput(lastHashs[0].hash, lastHashs[0].voutn);
				if (!tx) {
					continue;
				}
				if (!normalData[tx.address]) {
					normalData[tx.address] = new NormalData(tx.address, txid, time);
				}
				let totalValue = tx.value;
				for (let j = 1; j < lastHashs.length; j++) {
					let y = lastHashs[j];
					let tx = this.checkTxInput(y.hash, y.voutn);
					if (tx) {
						totalValue += tx.value;
					}
				}
				normalData[tx.address].data.sendValue = totalValue;
				await this.addTxSend(tx.address, height, txid, i, txn, totalValue, time);
			}

			for (let i = 0; i < blockTx.vout.length; i++) {
				let x = blockTx.vout[i];
				let address: any = x.address;
				if (!address) {
					console.error('address error');
					return;
				}
				address = address.toString('hex');
				if (this.watchAddress[address]) {
					if (!normalData[address]) {
						normalData[address] = new NormalData(address, txid, time);
					}
					normalData[address].data.receiveValue += x.value;
					await this.addTxReceive(address, height, txid, i, txn, x.value, time);
				}
			}

			for (let x in normalData) {
				await this.addNormalTx({ address: x, height, txn }, normalData[x].data);
			}
		});
	}

	private async addTxReceive(address: string, height: number, txid: Buffer, voutn: number, txn: number, value: bigint, time: number): Promise<boolean> {
		let key = new KeyBuffer({ address, height, txn, voutn, type: 0 });

		let oldTx = this.historyDb.get(key.buf);
		if (oldTx) {
			return false;
		}

		await this.historyDb.put(key.buf, { value, txid, time });
		let txindex = this.core.getTxIndex(txid);
		if (txindex && !txindex.voutspent[voutn]) { //utxo cache
			await this.historyUTXODb.put(key.buf, { value, txid, time });
		}

		return true;
	}

	private async addTxSend(address: string, height: number, txid: Buffer, vinn: number, txn: number, value: BigInt, time: number): Promise<boolean> {
		let key = new KeyBuffer({ address, height, txn, vinn, type: 1 })

		let oldTx = this.historyDb.get(key.buf);
		if (oldTx) {
			return false;
		}

		await this.historyDb.put(key.buf, { value: value, txid, time });

		return true;
	}

	private async addNormalTx(key: normalKeyJson, value: normalValueJson) {
		let keyBuf = new NormalKeyBuffer(key);
		await this.normalHistroyDb.put(keyBuf.buf, value);
	}

	async getBalance(address: string, poolLastVoutIsExist?: Task['poolLastVoutIsExist']): Promise<false | bigint> {
		let r = await this.taskQueue.addTask(async () => {
			if (!this.watchAddress[address]) {
				return false;
			}

			let confirmed = 0n;
			let removeList = [];
			let start = Buffer.concat([Buffer.from(address, 'hex'), keyStart]);
			let end = Buffer.concat([Buffer.from(address, 'hex'), keyEnd]);
			for (let { key, value } of this.historyUTXODb.getRange({ start, end, snapshot: false })) {
				let k = new KeyBuffer(<Buffer>key);
				let voutn = k.voutn;
				let txid = this.core.getTxIndex(value.txid);
				if (!txid) {
					continue;
				}
				if (txid.voutspent[voutn]) { //utxo cache delete 
					removeList.push(key);
					continue;
				}

				if (poolLastVoutIsExist) {
					if (!poolLastVoutIsExist(value.txid.toString('hex'), voutn)) {
						confirmed += value.value;
					}
				}
				else {
					confirmed += value.value;
				}
			}

			for (let i = 0; i < removeList.length; i++) {
				await this.historyUTXODb.remove(removeList[i]);
			}

			return confirmed;
		});

		if (r.taskErr) {
			return false;
		}

		return r.data;
	}

	async getTxList(address: string, option?: { limit?: number, skip?: number, reverse?: boolean }): Promise<false | any[]> {
		let r = await this.taskQueue.addTask(async () => {
			if (!this.watchAddress[address]) {
				return false;
			}

			if (!option.limit) {

				option.limit = 20;
			}
			if (!option.skip && option.skip !== 0) {

				option.skip = 0;
			}

			let start, end, reverse;
			if (option.reverse) {
				start = Buffer.concat([Buffer.from(address, 'hex'), keyEnd]);
				end = Buffer.concat([Buffer.from(address, 'hex'), keyStart]);
				reverse = true;
			}
			else {
				start = Buffer.concat([Buffer.from(address, 'hex'), keyStart]);
				end = Buffer.concat([Buffer.from(address, 'hex'), keyEnd]);
				reverse = false;
			}

			let data = [];
			for (let { key, value } of this.historyDb.getRange({ start, end, reverse, limit: option.limit, offset: option.skip, snapshot: false })) {
				let k = new KeyBuffer(<Buffer>key);
				let type = k.type;
				let txid = value.txid;
				if (type === 0) {
					let voutn = k.voutn;
					let temp: any = { address, txid: txid.toString('hex'), height: k.height, txn: k.txn, voutn, type: 'receive', value: value.value };
					let txIndex = this.core.getTxIndex(txid);
					if (!txIndex) {
						continue;
					}
					temp.voutspent = txIndex.voutspent[voutn];
					data.push(temp)
				}
				else {
					let vinn = k.vinn;
					let temp: any = { address, txid: txid.toString('hex'), height: k.height, txn: k.txn, vinn, type: 'send', value: value.value };
					data.push(temp)
				}
			}
			return data;
		});

		if (r.taskErr) {
			return false;
		}

		return r.data;
	}

	async getUTXOList(address: string, option?: { limit?: number, skip?: number, reverse?: boolean }): Promise<false | any[]> {
		let r = await this.taskQueue.addTask(async () => {
			if (!this.watchAddress[address]) {
				return false;
			}

			if (!option.limit) {
				option.limit = 20;
			}
			if (!option.skip && option.skip !== 0) {
				option.skip = 0;
			}

			let start, end, reverse;
			if (option.reverse) {
				start = Buffer.concat([Buffer.from(address, 'hex'), keyEnd]);
				end = Buffer.concat([Buffer.from(address, 'hex'), keyStart]);
				reverse = true;
			}
			else {
				start = Buffer.concat([Buffer.from(address, 'hex'), keyStart]);
				end = Buffer.concat([Buffer.from(address, 'hex'), keyEnd]);
				reverse = false;
			}

			let data = [];
			let removeList = [];
			for (let { key, value } of this.historyUTXODb.getRange({ start, end, reverse, limit: option.limit, offset: option.skip, snapshot: false })) {
				let k = new KeyBuffer(<Buffer>key);
				let txid = value.txid;
				let voutn = k.voutn;
				let temp: any = { address, txid: txid.toString('hex'), height: k.height, txn: k.txn, voutn, value: value.value };

				let txindex = this.core.getTxIndex(txid);
				if (!txindex) {
					continue;
				}
				if (txindex.voutspent[voutn]) { //utxo cache delete 
					removeList.push(key);
					continue;
				}

				data.push(temp);
			}

			for (let i = 0; i < removeList.length; i++) {
				await this.historyUTXODb.remove(removeList[i]);
			}
			return data;
		});

		if (r.taskErr) {
			return false;
		}

		return r.data;
	}

	async getNormalTxList(address: string, option?: { limit?: number, skip?: number, reverse?: boolean }): Promise<false | any[]> {
		let r = await this.taskQueue.addTask(async () => {
			if (!this.watchAddress[address]) {
				return false;
			}

			if (!option.limit) {
				option.limit = 20;
			}
			if (!option.skip && option.skip !== 0) {
				option.skip = 0;
			}

			let start, end, reverse;
			if (option.reverse) {
				start = Buffer.concat([Buffer.from(address, 'hex'), normalKeyEnd]);
				end = Buffer.concat([Buffer.from(address, 'hex'), normalKeyStart]);
				reverse = true;
			}
			else {
				start = Buffer.concat([Buffer.from(address, 'hex'), normalKeyStart]);
				end = Buffer.concat([Buffer.from(address, 'hex'), normalKeyEnd]);
				reverse = false;
			}

			let data: ({ address: string, height: number, txn: number } & normalValueJson)[] = [];
			for (let { key, value } of this.normalHistroyDb.getRange({ start, end, reverse, limit: option.limit, offset: option.skip, snapshot: false })) {
				let k = new KeyBuffer(<Buffer>key);
				let temp: { address: string, height: number, txn: number } & normalValueJson = { address, txid: value.txid.toString('hex'), height: k.height, txn: k.txn, time: value.time, sendValue: value.sendValue, receiveValue: value.receiveValue };
				data.push(temp);
			}

			return data;
		});

		if (r.taskErr) {
			return false;
		}

		return r.data;
	}

	checkTxInput(hash: Buffer, voutn: number): { address: string, value: bigint } | false {
		let lastTx = this.core.getTransactionByTxid(hash);
		if (!lastTx) {
			return false;
		}

		for (let x in this.watchAddress) {
			let key = new KeyBuffer({ address: x, height: lastTx.blockHeight, txn: lastTx.blockTxn, voutn, type: 0 });
			if (this.historyDb.doesExist(key.buf)) {
				return { address: x, value: lastTx.blockTx.vout[voutn].value };
			}
		}

		return false;
	}

	async deleteOverHeight(height: number) {
		console.log('deleteOverHeight: ', height);
		await this.taskQueue.addTask(async () => {
			this.resetFlag = true;
			let startHeight = new KeyBuffer({ address: '0000000000000000000000000000000000000000000000000000000000000000', height, txn: 0, voutn: 0, type: 0 });
			let normalStartHeight = new NormalKeyBuffer({ address: '0000000000000000000000000000000000000000000000000000000000000000', height, txn: 0 });
			for (let x in this.watchAddress) {
				let removeList = [];
				startHeight.address = x;
				normalStartHeight.address = x;
				let start = startHeight.buf;
				let end = Buffer.concat([Buffer.from(x, 'hex'), keyEnd]);
				// history
				for (let key of this.historyDb.getKeys({ start, end, snapshot: false })) {
					removeList.push(key);
				}
				for (let i = 0; i < removeList.length; i++) {
					await this.historyDb.remove(removeList[i]);
				}
				// UTXO 
				removeList = [];
				for (let key of this.historyUTXODb.getKeys({ start, end, snapshot: false })) {
					removeList.push(key);
				}
				for (let i = 0; i < removeList.length; i++) {
					await this.historyUTXODb.remove(removeList[i]);
				}
				// normal
				removeList = [];
				start = normalStartHeight.buf
				end = Buffer.concat([Buffer.from(x, 'hex'), normalKeyEnd]);
				for (let key of this.normalHistroyDb.getKeys({ start, end, snapshot: false })) {
					removeList.push(key);
				}
				for (let i = 0; i < removeList.length; i++) {
					await this.normalHistroyDb.remove(removeList[i]);
				}
			}
			this.resetFlag = false;
		});
	}

	async recheckUTXOAll() {
		await this.taskQueue.addTask(async () => {
			console.log('recheck utxo all');
			for (let x in this.watchAddress) {
				let start = Buffer.concat([Buffer.from(x, 'hex'), keyStart]);
				let end = Buffer.concat([Buffer.from(x, 'hex'), keyEnd]);

				for (let { key, value } of this.historyDb.getRange({ start, end, snapshot: false })) {
					let k = new KeyBuffer(<Buffer>key);
					if (k.type === 1) { // type=1 is send
						continue;
					}
					let voutn = k.voutn;
					let txindex = this.core.getTxIndex(value.txid);
					if (txindex && !txindex.voutspent[voutn]) { //utxo cache
						if (!this.historyUTXODb.doesExist(key)) {
							await this.historyUTXODb.put(key, { value: value.value, txid: value.txid });
						}
					}
				}
			}
			console.log('recheck utxo finish!');
		});
	}

	async recheckUTXO(voutspentRetraction: { height: number, txn: number, voutn: number }[]) {
		await this.taskQueue.addTask(async () => {
			console.log('recheck utxo all');
			let buf = Buffer.alloc(45);
			buf.fill(0);
			let k = new KeyBuffer(buf);

			for (let x in this.watchAddress) {
				k.address = x;
				for (let i = 0; i < voutspentRetraction.length; i++) {

					k.height = voutspentRetraction[i].height;
					k.txn = voutspentRetraction[i].txn;
					k.voutn = voutspentRetraction[i].voutn;
					let r = this.historyDb.get(k.buf);
					if (!r) {
						continue;
					}
					let txindex = this.core.getTxIndex(r.txid);
					if (txindex && !txindex.voutspent[voutspentRetraction[i].voutn]) { //utxo cache
						if (!this.historyUTXODb.doesExist(k.buf)) {
							console.log('wallet voutspentRetraction: ', voutspentRetraction[i]);
							await this.historyUTXODb.put(k.buf, { value: r.value, txid: r.txid });
						}
					}
				}
			}
			console.log('recheck utxo finish!');
		});
	}

	async createNewTx(address: string, value: bigint, extraValue: bigint = 0n, voutAmount: number = 1, feeRatio: bigint = 1n, useAllUTXO: boolean = false, poolLastVoutIsExist?: Task['poolLastVoutIsExist']) {
		if (value < 0n) {
			return false;
		}
		else if (!useAllUTXO && value === 0n) {
			return false;
		}
		let useAllFlag = false;
		if (useAllUTXO && value === 0n) {
			useAllFlag = true;
		}

		let r = await this.taskQueue.addTask(async () => {
			let targetAmount = value + extraValue;
			if (!this.watchAddress[address]) {
				return false;
			}

			let lastVout = [];
			let removeList = [];
			let amount = 0n;
			let vinCount = 0;

			let start = Buffer.concat([Buffer.from(address, 'hex'), keyStart]);
			let end = Buffer.concat([Buffer.from(address, 'hex'), keyEnd]);
			let enough = false;

			for (let { key, value } of this.historyUTXODb.getRange({ start, end, snapshot: false })) {
				let k = new KeyBuffer(<Buffer>key);
				let voutn = k.voutn;

				let txid = this.core.getTxIndex(value.txid);
				if (!txid) {
					continue;
				}

				if (txid.voutspent[voutn]) { //utxo cache delete 
					removeList.push(key);
					continue;
				}

				if (poolLastVoutIsExist) {
					if (poolLastVoutIsExist(value.txid.toString('hex'), voutn)) {
						continue;
					}
				}

				lastVout.push({ txid: value.txid.toString('hex'), voutn: k.voutn });
				amount += BigInt(value.value);
				vinCount++;
				let basePhoton = BlockTx.getBasePhoton([vinCount], voutAmount);
				if (!basePhoton) {
					return false;
				}
				if (amount > targetAmount + (BigInt(basePhoton) * feeRatio)) {
					enough = true;
					if (!useAllUTXO) {
						break;
					}
				}
			}
			for (let i = 0; i < removeList.length; i++) {
				await this.historyUTXODb.remove(removeList[i]);
			}
			if (enough || useAllFlag) {
				return lastVout;
			}
			return false;
		})

		if (r.taskErr) {
			return false;
		}

		return r.data;
	}

	async clearHistory(): Promise<boolean> {
		this.historyDb.clearSync();
		this.historyUTXODb.clearSync();
		this.normalHistroyDb.clearSync();
		await this.setUpdateHeight(0);
		return true;
	}

	async exit(){
		await this.taskQueue.terminate();
		await this.dbRoot.close();
		console.log('Wallet history db exit');
	}
}

export { WalletHistoryDb }