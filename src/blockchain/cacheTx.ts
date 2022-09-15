import { BlockTx } from "./blockTx";

type CacheData = {
	hash: string;
	blockTx: BlockTx;
	time: number;
	feeRatio: number;
	address: {
		[key: string]: {
			sendValue: 0n;
			receiveValue: 0n;
		};
	};
	mining?: boolean;
};

type CacheDataJson = {
	hash: string;
	blockTx: any;
	time: number;
	feeRatio: number;
	mining?: boolean;
};

type CacheList = {
	hash: string;
	time: number;
	feeRatio: number;
	address?:
	{
		[key: string]: {
			sendValue: 0n;
			receiveValue: 0n;
		};
	};
}[];

class CacheTx {
	data: CacheData[];
	hash: { [key: string]: CacheData };
	miningTx: { [key: string]: CacheData };
	max: number;
	private lastVout: { [key: number]: string };
	private pqcert: { [key: number]: boolean };
	private timeOut: number;
	constructor(cacheMax: number, timeOut: number = 1800000) {
		this.data = [];
		this.hash = {};
		this.miningTx = {};
		this.max = cacheMax;
		this.lastVout = {};
		this.pqcert = {};
		this.timeOut = timeOut;
	}

	pushTx(data: CacheData): number | false {
		if (this.data.length >= this.max) {
			return false;
		}

		let lastVout = {};

		for (let j = 0; j < data.blockTx.vin.length; j++) {
			let lastVoutHash = data.blockTx.vin[j].getLastVoutHashAll();
			if (!lastVoutHash) {
				return false;
			}

			for (let k = 0; k < lastVoutHash.length; k++) {
				let hashN = `${lastVoutHash[k].hash.toString('hex')}_${lastVoutHash[k].voutn}`;
				if (lastVout[hashN] || this.lastVout[hashN]) {
					return false;
				}
				lastVout[hashN] = data.hash;
			}
		}

		for (let j = 0; j < data.blockTx.pqcert.length; j++) {
			let hash = <string>data.blockTx.pqcert[j].getHash('hex');
			if (this.pqcert[hash]) {
				return false;
			}
			this.pqcert[hash] = true;
		}

		if (this.miningTx[data.hash]) {
			if (Date.now() - this.miningTx[data.hash].time > this.timeOut) {
				delete this.miningTx[data.hash];
				return false;
			}
			data.time = this.miningTx[data.hash].time;
		}

		delete this.miningTx[data.hash];
		this.data.push(data);
		this.hash[data.hash] = data;
		this.data.sort((x, y) => y.feeRatio - x.feeRatio);

		for (let x in lastVout) {
			this.lastVout[x] = lastVout[x];
		}

		return this.data.length;
	}

	popTx() {
		let data = this.data.pop();
		delete this.hash[data.hash];

		// pqcert lastVout 
		for (let j = 0; j < data.blockTx.vin.length; j++) {
			let lastVoutHash = data.blockTx.vin[j].getLastVoutHashAll();
			if (!lastVoutHash) {
				continue;
			}

			for (let k = 0; k < lastVoutHash.length; k++) {
				let hashN = `${lastVoutHash[k].hash.toString('hex')}_${lastVoutHash[k].voutn}`;
				delete this.lastVout[hashN];
			}
		}

		for (let j = 0; j < data.blockTx.pqcert.length; j++) {
			let hash = <string>data.blockTx.pqcert[j].getHash('hex');
			delete this.pqcert[hash];
		}

		return data;
	}

	shiftTx(): false | CacheData {
		let data = this.data.shift();
		if (!data) {
			return false;
		}
		delete this.hash[data.hash];

		for (let j = 0; j < data.blockTx.vin.length; j++) {
			let lastVoutHash = data.blockTx.vin[j].getLastVoutHashAll();
			if (!lastVoutHash) {
				continue;
			}

			for (let k = 0; k < lastVoutHash.length; k++) {
				let hashN = `${lastVoutHash[k].hash.toString('hex')}_${lastVoutHash[k].voutn}`;
				delete this.lastVout[hashN];
			}
		}

		for (let j = 0; j < data.blockTx.pqcert.length; j++) {
			let hash = <string>data.blockTx.pqcert[j].getHash('hex');
			delete this.pqcert[hash];
		}

		this.miningTx[data.hash] = data;
		return data;
	}

	deleteTxsByHashs(hashs: string[]): boolean {
		let hashList = {};
		for (let i = 0; i < hashs.length; i++) {
			if (!this.hash[hashs[i]]) {
				continue;
			}
			if (!hashList[hashs[i]]) {
				hashList[hashs[i]] = true;
			}
		}
		for (let i = 0; i < this.data.length; i++) {
			if (hashList[this.data[i].hash]) {
				this.deleteTxByIndex(i);
				i--;
			}
		}
		return true;
	}

	deleteTxByHash(hash: string): boolean {
		if (!this.hash[hash]) {
			return false;
		}
		for (let i = 0; i < this.data.length; i++) {
			if (this.data[i].hash === hash) {
				return this.deleteTxByIndex(i)
			}
		}
	}

	deleteTxByIndex(i: number): boolean {
		let data = this.data[i];
		if (!data) {
			return false;
		}

		let hash = data.hash;
		delete this.hash[hash];
		this.data.splice(i, 1);

		for (let j = 0; j < data.blockTx.vin.length; j++) {
			let lastVoutHash = data.blockTx.vin[j].getLastVoutHashAll();
			if (!lastVoutHash) {
				continue;
			}

			for (let k = 0; k < lastVoutHash.length; k++) {
				let hashN = `${lastVoutHash[k].hash.toString('hex')}_${lastVoutHash[k].voutn}`;
				delete this.lastVout[hashN];
			}
		}

		for (let j = 0; j < data.blockTx.pqcert.length; j++) {
			let hash = <string>data.blockTx.pqcert[j].getHash('hex');
			delete this.pqcert[hash];
		}

		return true;
	}

	deleteMiningByHash(hash: string) {
		if (this.miningTx[hash]) {
			delete this.miningTx[hash];
		}
	}

	freeCacheTxTimeOut() {
		let now = Date.now();
		for (let i = 0; i < this.data.length; i++) {
			if ((now - this.data[i].time) > this.timeOut) {
				this.deleteTxByIndex(i);
			}
		}

		for (let x in this.miningTx) {
			if ((now - this.miningTx[x].time) > this.timeOut) {
				delete this.miningTx[x];
			}
		}
	}

	clearMiningAll() {
		this.miningTx = {};
	}

	clearAll() {
		this.data = [];
		this.hash = {};
		this.lastVout = {};
		this.pqcert = {};
		this.miningTx = {};
	}

	getTx(hash: string, json: boolean = false): CacheData | CacheDataJson | false {
		let data, blockTx, mining = false;
		if (this.hash[hash]) {
			data = this.hash[hash];
		}
		else if (this.miningTx[hash]) {
			data = this.miningTx[hash];
			mining = true;
		}
		else {
			return false;
		}

		if (json) {
			blockTx = data.blockTx.json;

		}
		else {
			blockTx = data.blockTx
		}

		return {
			hash,
			blockTx: blockTx,
			time: data.time,
			feeRatio: data.feeRatio,
			mining
		};
	}

	getTxList(blockTxFlag?: boolean): CacheList | CacheData[] {
		if (blockTxFlag) {
			return <CacheData[]>this.data.map(x => ({ hash: x.hash, time: x.time, feeRatio: x.feeRatio, address: x.address, blockTx: x.blockTx }));
		}
		return <CacheList>this.data.map(x => ({ hash: x.hash, time: x.time, feeRatio: x.feeRatio, address: x.address }));
	}

	getMiningTxList(blockTxFlag?: boolean): CacheList | CacheData[] {
		let tx = [];

		if (blockTxFlag) {
			for (let x in this.miningTx) {
				tx.push({ hash: this.miningTx[x].hash, time: this.miningTx[x].time, feeRatio: this.miningTx[x].feeRatio, address: this.miningTx[x].address, blockTx: this.miningTx[x].blockTx });
			}

			return tx;
		}
		for (let x in this.miningTx) {
			tx.push({ hash: this.miningTx[x].hash, time: this.miningTx[x].time, feeRatio: this.miningTx[x].feeRatio, address: this.miningTx[x].address });
		}

		return tx;
	}

	isExist(hash: string): boolean {
		if (!this.hash[hash]) {
			return false;
		}

		return true;
	}

	lastVoutIsExist(hash: string, n: number): boolean {
		if (this.lastVout[`${hash}_${n}`]) {
			return true;
		}

		return false;
	}

	getLastVoutUsed(hash: string, n: number): false | string {
		if (this.lastVout[`${hash}_${n}`]) {
			return this.lastVout[`${hash}_${n}`];
		}

		return false;
	}

	get length() {
		return this.data.length;
	}

	get last() {
		return this.data[this.data.length - 1];
	}

	get first() {
		return this.data[0];
	}
}


export { CacheTx, CacheData, CacheDataJson }