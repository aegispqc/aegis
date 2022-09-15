import path from 'path';
import * as lmdb from 'lmdb';
import { TaskQueue } from '../blockchain/taskQueue';
import { PQCertPubKeyJsonData, PQCertRootJsonData } from '../blockchain/dataSchema/pqcertSchema';
import { randomBytes } from 'crypto';
import { creatPQCertPubKey, creatPQCertRoot, PQCertRoot } from '../blockchain/pqcert';
import { getSignSys } from '../blockchain/signType';
import { getSeedTree } from './genWallet';

let keyU32Start = 0;
let keyU32End = 0xff_ff_ff_ff;
let addressKeyStart = Buffer.from('00000000000000000000000000000000000000000000000000000000000000000000000000000000', 'hex');
let addressKeyEnd = Buffer.from('ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', 'hex');
let hashStart = Buffer.from('0000000000000000000000000000000000000000000000000000000000000000', 'hex');
let hashEnd = Buffer.from('ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', 'hex');

type Keypair = {
	seed: Buffer;
	addrSeed: Buffer;
	keypairs: {
		hash?: Buffer;
		version: number;
		signType: number;
		privateKey: Buffer;
		publicKey: Buffer;
	}[];
	encryptionFlag: boolean;
	label?: string;
}

type addressOpt = {
	version: number;
	level: number;
	keys: number[];
}

type addressData = {
	pqcertRoot: Buffer;
	addressSeed: addressOpt;
	label?: string;
}

class AddressKeyBuffer {
	buf: Buffer;
	constructor(data: Buffer | { wid: number, addN: number, hash: Buffer }) {
		if (Buffer.isBuffer(data)) {
			this.buf = data;
		}
		else {
			this.buf = Buffer.alloc(40);
			this.buf.writeUInt32BE(data.wid, 0);
			this.buf.writeUInt32BE(data.addN, 4);
			data.hash.copy(this.buf, 8, 0, 32);
		}
	}

	get wid() {
		return this.buf.readUInt32BE(0);
	}

	get addN() {
		return this.buf.readUInt32BE(4);
	}

	get hash() {
		return this.buf.subarray(8, 40);
	}
}

class WalletDb {
	dbDir: string;
	dbRoot: any;
	keyPairDb: any;
	addressDb: any;
	taskQueue: TaskQueue;
	constructor(dbDir: string = path.join(process.cwd(), './walletFile/')) {
		this.dbDir = dbDir;
		this.dbRoot = lmdb.open({
			path: this.dbDir,
			name: 'wallet',
			maxReaders: 1
		});

		this.keyPairDb = this.dbRoot.openDB({ name: `wallet_keypair`, keyIsUint32: true });
		this.addressDb = this.dbRoot.openDB({ name: `wallet_address`, keyIsBuffer: true });
		this.taskQueue = new TaskQueue(100);

		//------- Try to read the database -------
		let keyPairList = this.getKeyPairList()
		console.log('key pair list: ', (keyPairList) ? keyPairList.map(x => x.id) : []);
	}

	keypairIsExist(wid: number): boolean {
		return this.keyPairDb.doesExist(wid);
	}

	async addKeyPair(data: Keypair): Promise<number | false> {
		let r = await this.taskQueue.addTask(async () => {
			let thisId = this.getLastKeyPairId() + 1;
			if (this.keypairIsExist(thisId)) {
				return false;
			}

			for (let i = 0; i < data.keypairs.length; i++) {
				let pqcertPubKeyJson: PQCertPubKeyJsonData = {
					version: data.keypairs[i].version,
					pqcertType: 1,
					signType: data.keypairs[i].signType,
					pubKey: data.keypairs[i].publicKey.toString('hex')
				};

				let pqcertPubKey = creatPQCertPubKey(pqcertPubKeyJson);
				if (!pqcertPubKey) {
					return false;
				}
				let hash = pqcertPubKey.getHash();
				if (!hash) {
					return false;
				}
				data.keypairs[i].hash = hash;
			}


			let suc = await this.keyPairDb.put(thisId, data);
			if (suc) {
				return thisId;
			}
			return false;
		});

		if (r.taskErr) {
			return false;
		}

		return r.data;
	}

	async createAddress(wid: number, addressOpt: addressOpt, label?: string): Promise<false | Buffer> {
		let r = await this.taskQueue.addTask(async () => {
			let kp = this.getKeyPairById(wid);
			if (!kp) {
				return false;
			}

			let lastAddrN = this.getLastAddressN(wid);
			let fakeCount = this.getAddressFakeCount(wid);
			fakeCount++;
			let fakeTree = getSeedTree(kp.addrSeed, fakeCount);

			let pqcertRootJson: PQCertRootJsonData = {
				version: addressOpt.version,
				pqcertType: 0,
				level: addressOpt.level,
				pubKeyHashes: []
			};

			let fake = 0;
			for (let i = 0; i < addressOpt.keys.length; i++) {
				if (addressOpt.keys[i] == -1) {
					let thisFake = fakeTree.getLastLeftNode();
					pqcertRootJson.pubKeyHashes.push(thisFake.toString('hex'));
					fake++;
					fakeTree.levelExtension();
					continue;
				}
				if (addressOpt.keys[i] >= kp.keypairs.length) {
					return false;
				}
				if (!kp.keypairs[addressOpt.keys[i]]) {
					return false;
				}
				pqcertRootJson.pubKeyHashes.push(kp.keypairs[addressOpt.keys[i]].hash.toString('hex'));
			}
			let valid = addressOpt.keys.length - fake;
			if (addressOpt.level > valid) {
				return false;
			}

			let pqcertRoot = creatPQCertRoot(pqcertRootJson);
			if (!pqcertRoot) {
				return false;
			}
			if (!pqcertRoot.verify()) {
				return false;
			}
			let hash = pqcertRoot.getHash();
			if (!hash) {
				return false;
			}

			let addressKeyBuffer = new AddressKeyBuffer({ wid, addN: lastAddrN + 1, hash });
			if (this.addressDb.doesExist(addressKeyBuffer.buf)) {
				return false;
			}
			if (this.addressDoesExist(wid, hash)) {
				return false;
			}

			let suc = await this.addressDb.put(addressKeyBuffer.buf, { pqcertRoot: pqcertRoot.serialize, addressSeed: addressOpt, label });
			if (!suc) {
				return false;
			}

			return hash;
		});

		if (r.taskErr) {
			return false;
		}

		return r.data;
	}

	getLastKeyPairId() {
		let id = -1;
		for (let key of this.keyPairDb.getKeys({ start: keyU32End, reverse: true, limit: 1, snapshot: false })) {
			id = key;
			break;
		}
		return id;
	}

	getKeyPairList(raw: boolean = false) {
		let data = [];
		for (let { key, value } of this.keyPairDb.getRange({ start: keyU32Start, end: keyU32End, snapshot: false })) {
			if (!raw) {
				let kps = [];
				for (let i = 0; i < value.keypairs.length; i++) {
					let Ss = getSignSys(value.keypairs[i].signType);
					if (!Ss) {
						return false;
					}
					kps.push(Ss.signSysName);
				}
				data.push({ id: key, keypairs: kps, encryptionFlag: value.encryptionFlag, label: value.label });
			}
			else {
				data.push({ id: key, keypairs: value.keypairs, encryptionFlag: value.encryptionFlag, label: value.label });
			}
		}

		return data;
	}

	getKeyPairById(id: number): false | Keypair {
		return this.keyPairDb.get(id);
	}

	getAddressList(id: number): Buffer[] | false {
		let exist = this.keyPairDb.doesExist(id);
		if (!exist) {
			return false;
		}

		let start = new AddressKeyBuffer({ wid: id, addN: 0, hash: hashStart });
		let end = new AddressKeyBuffer({ wid: id, addN: 0xff_ff_ff_ff, hash: hashEnd });

		let list = [];
		for (let { key } of this.addressDb.getRange({ start: start.buf, end: end.buf, snapshot: false })) {
			let bufK = new AddressKeyBuffer(key);
			list.push(bufK.hash);
		}

		return list;
	}

	getAddress(id: number, hash: Buffer): { pqcertRoot: PQCertRoot, addressSeed: addressOpt, label?: string } | false {
		let start = new AddressKeyBuffer({ wid: id, addN: 0, hash: hashStart });
		for (let { key, value } of this.addressDb.getRange({ start, snapshot: false })) {
			let ak = new AddressKeyBuffer(key);

			if (hash.equals(ak.hash)) {
				value.pqcertRoot = creatPQCertRoot(value.pqcertRoot);
				return value;
			}
		}
		return false;
	}

	getAllAddress(wid: number): { hash: Buffer, pqcertRoot: PQCertRoot, addressSeed: addressOpt, label?: string }[] {
		let addresses = [];
		let start = new AddressKeyBuffer({ wid, addN: 0, hash: hashStart });
		let end = new AddressKeyBuffer({ wid, addN: 0xff_ff_ff_ff, hash: hashEnd });

		for (let { key, value } of this.addressDb.getRange({ start: start.buf, end: end.buf, snapshot: false })) {
			let bufK = new AddressKeyBuffer(key);
			value.pqcertRoot = creatPQCertRoot(value.pqcertRoot);
			addresses.push({ hash: bufK.hash, ...value });
		}

		return addresses;
	}

	getLastAddressN(wid: number) {
		let addN = -1;
		let start = new AddressKeyBuffer({ wid, addN: 0xff_ff_ff_ff, hash: hashEnd });
		for (let key of this.addressDb.getKeys({ start, reverse: true, limit: 1, snapshot: false })) {
			let ak = new AddressKeyBuffer(key);
			addN = ak.addN;
			break;
		}
		return addN;
	}

	getAddressFakeCount(wid: number) {
		let start = new AddressKeyBuffer({ wid, addN: 0, hash: hashStart });
		let end = new AddressKeyBuffer({ wid, addN: 0xff_ff_ff_ff, hash: hashEnd });

		let fakeCount = 0;
		for (let { value } of this.addressDb.getRange({ start: start.buf, end: end.buf, snapshot: false })) {
			value.addressSeed.keys.forEach((x) => {
				if (x === -1) {
					fakeCount++;
				}
			});
		}
		return fakeCount;
	}

	addressDoesExist(wid: number, address: Buffer) {
		let start = new AddressKeyBuffer({ wid, addN: 0, hash: hashStart });
		for (let key of this.addressDb.getKeys({ start, snapshot: false })) {
			let ak = new AddressKeyBuffer(key);

			if (address.equals(ak.hash)) {
				return true;
			}
		}
		return false;
	}

	async exit() {
		await this.taskQueue.terminate();
		console.log('WalletDb Task exit');
	}
}

export { WalletDb, addressOpt, Keypair };