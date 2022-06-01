import path from 'path';
import { creatPQCertPubKey, PQCertPubKey, PQCertRoot, } from '../blockchain/pqcert';
import { getSignSys } from '../blockchain/signType';
import { PQCertPubKeyJsonData } from "../blockchain/dataSchema/pqcertSchema";
import { getPushDataSizeBuffer, getCompactSizeBufferByNumber } from '../blockchain/util';
import { BlockTx } from "../core";
import { WalletDb, addressOpt } from './walletDb';
import { serialize } from 'bson';
import { genWallet, recoveryKey } from './genWallet';
import { SafePasswordBuf } from '../crypto/safePassword';

type recoverySeed = {
	keySeed: Buffer;
	addrSeed: Buffer;
	encryptionFlag: boolean;
	addrs: {
		addressSeed: addressOpt;
		label?: string;
	}[];
	label?: string;
}

type sign = {
	order: number;
	sign: Buffer;
}

function shuffle(arr: any[]) {
	for (let i = 0; i < arr.length; i++) {
		let r = Math.floor((Math.random() * arr.length));
		[arr[i], arr[r]] = [arr[r], arr[i]];
	}
}

class Wallet {
	db: WalletDb;
	wid: number;

	constructor(dbDir: string = path.join(process.cwd(), './walletFile/')) {
		this.db = new WalletDb(dbDir);
		this.wid = 0;
	}

	async genNewWallet(opt: Parameters<typeof genWallet>[0], aesKey?: Parameters<typeof genWallet>[1], label?: string) {
		let kp = genWallet(opt, aesKey);
		if (!kp) {
			return false;
		}
		kp.label = label;
		let suc = await this.db.addKeyPair(kp);
		return suc;
	}

	switchWallet(wid: number): boolean {
		let exist = this.db.keypairIsExist(wid);
		if (!exist) {
			return false;
		}

		this.wid = wid;
		return true;
	}

	async addAddress(addressOpt: addressOpt, label?: string): Promise<string | false> {
		let r = await this.db.createAddress(this.wid, addressOpt, label);

		if (!r) {
			return false;
		}
		return r.toString('hex');
	}

	getKeyPair() {
		let KP = this.db.getKeyPairById(this.wid);
		if (!KP) {
			return false;
		}
		let kps: any[] = KP.keypairs;
		kps.map((x, i) => {
			let Ss = getSignSys(x.signType);
			if (!Ss) {
				x.signSysName = '??';
				return x
			}
			x.signSysName = Ss.signSysName;
			return x
		});

		return kps;
	}

	async createAddress(pkhs: number[] | number, level: number = 2, fakeAmount: number = 1, version: number = 0, shuffleFlag: boolean = false, label?: string) {
		let addressOpt = { version, level, keys: undefined };
		let pkhArr: number[];
		if (typeof pkhs === 'number') {
			let w = await this.db.getKeyPairById(this.wid);
			if (!w) {
				return false;
			}

			if (pkhs > w.keypairs.length) {
				return false;
			}

			let keyO = w.keypairs.map((x, i) => i);
			shuffle(keyO);
			pkhArr = keyO.slice(0, pkhs);
		}
		else {
			pkhArr = pkhs;
		}

		if (level < 2) {
			return false;
		}

		if (pkhArr.length < level) {
			return false;
		}

		if (fakeAmount) {
			for (let i = 0; i < fakeAmount; i++) {
				pkhArr.push(-1);
			}
		}

		if (shuffleFlag) {
			shuffle(pkhArr);
		}

		addressOpt.keys = pkhArr;
		return await this.addAddress(addressOpt, label);
	}

	getPqcertRootByAddress(address: string | Buffer): false | PQCertRoot {
		let hashBuf = Buffer.isBuffer(address) ? address : Buffer.from(address, 'hex');
		let addressData = this.db.getAddress(this.wid, hashBuf);
		if (!addressData) {
			return false;
		}
		return addressData.pqcertRoot;
	}

	getPqcertPubKeyByHash(hash: string | Buffer): PQCertPubKey | false {
		let w = this.db.getKeyPairById(this.wid);
		if (!w) {
			return false;
		}

		let hashBuf = Buffer.isBuffer(hash) ? hash : Buffer.from(hash, 'hex');
		for (let i = 0; i < w.keypairs.length; i++) {
			if (w.keypairs[i].hash.equals(hashBuf)) {
				let pqcertPubKeyJson: PQCertPubKeyJsonData = {
					version: w.keypairs[i].version,
					pqcertType: 1,
					signType: w.keypairs[i].signType,
					pubKey: w.keypairs[i].publicKey.toString('hex')
				}

				let pqcertPubKey = creatPQCertPubKey(pqcertPubKeyJson);
				if (!pqcertPubKey) {
					return false;
				}
				return pqcertPubKey;
			}
		}

		return false;
	}

	getAddress(address: string) {
		let w = this.db.getKeyPairById(this.wid);
		if (!w) {
			return false;
		}

		return this.db.getAddress(this.wid, Buffer.from(address, 'hex'));
	}

	getAddressDetails(address: string): false | { hash: string, version: number, level: number, signSys: string[], label?: string } {
		let w = this.db.getKeyPairById(this.wid);
		if (!w) {
			return false;
		}

		let addrData = this.db.getAddress(this.wid, Buffer.from(address, 'hex'));
		if (!addrData) {
			return false;
		}

		let signSys = [];
		for (let i = 0; i < addrData.addressSeed.keys.length; i++) {
			if (addrData.addressSeed.keys[i] === -1) {
				signSys[i] = 'FAKE';
				continue;
			}
			let kp = w.keypairs[addrData.addressSeed.keys[i]];
			if (!kp) {
				return false;
			}

			let Ss = getSignSys(kp.signType);
			if (!Ss) {
				return false;
			}
			signSys[i] = Ss.signSysName;
		}

		return {
			hash: address,
			version: addrData.pqcertRoot.version,
			level: addrData.pqcertRoot.level,
			label: addrData.label ? addrData.label : '',
			signSys
		}
	}

	getWalletList(): false | any[] {
		let data = this.db.getKeyPairList();
		if (!data) {
			return false;
		}
		return data;
	}

	isEncryption(): boolean {
		let kp = this.db.getKeyPairById(this.wid);
		if (!kp) {
			return false;
		}

		return kp.encryptionFlag;
	}

	sign(address: string, signNum: number[], data: Buffer, aesKeySafe?: SafePasswordBuf): false | sign[] {
		let kp = this.db.getKeyPairById(this.wid);
		if (!kp) {
			return false;
		}

		if (kp.encryptionFlag && !aesKeySafe) {
			return false;
		}

		let aesKey;
		if(aesKeySafe) {
			aesKey = aesKeySafe.data;
		}

		let addrData = this.db.getAddress(this.wid, Buffer.from(address, 'hex'));
		if (!addrData) {
			return false;
		}

		if (signNum.length !== addrData.pqcertRoot.level) {
			console.error(`WALLET ERROR: Insufficient number of signOrder! (${signNum.length})`);
			return false;
		}

		let sign: sign[] = [];
		for (let i = 0; i < signNum.length; i++) {
			if (i > 0 && signNum[i] <= signNum[i - 1]) {
				console.error(`WALLET ERROR: signOrder fail!`);
				return false;
			}

			let order = signNum[i];

			if (addrData.addressSeed.keys[order] === undefined) {
				console.error(`WALLET ERROR: signOrder (${order}) fail!`);
				return false;
			}

			if (addrData.addressSeed.keys[order] === -1) {
				console.error(`WALLET ERROR: signOrder (${order}) is fake!`);
				return false;
			}

			let key = kp.keypairs[addrData.addressSeed.keys[order]];
			if (!key) {
				console.error(`WALLET ERROR: key is not found!`);
				return false;
			}

			let Ss = getSignSys(key.signType);
			if (!Ss) {
				return false;
			}

			let ss = new Ss(key.privateKey, key.publicKey, kp.encryptionFlag);
			let signOne = ss.sign(data, aesKey);
			if (!signOne) {
				return false;
			}
			sign[i] = { order, sign: signOne };
			if (!sign[i].sign) {
				return false;
			}
		}

		return sign;
	}

	calcSignSize(address: string, signNum: number[]): false | number {
		let kp = this.db.getKeyPairById(this.wid);
		if (!kp) {
			return false;
		}

		let addrData = this.db.getAddress(this.wid, Buffer.from(address, 'hex'));
		if (!addrData) {
			console.error(`WALLET ERROR: addresses (${address}) is not found!`);
			return false;
		}

		if (signNum.length !== addrData.pqcertRoot.level) {
			console.error(`WALLET ERROR: Insufficient number of signOrder! (${signNum.length})`);
			return false;
		}

		let signSize: number = 0;
		for (let i = 0; i < signNum.length; i++) {
			if (i > 0 && signNum[i] <= signNum[i - 1]) {
				console.error(`WALLET ERROR: signOrder fail!`);
				return false;
			}

			let order = signNum[i];

			if (addrData.addressSeed.keys[order] === undefined) {
				console.error(`WALLET ERROR: signOrder (${order}) fail!`);
				return false;
			}

			if (addrData.addressSeed.keys[order] === -1) {
				console.error(`WALLET ERROR: signOrder (${order}) is fake!`);
				return false;
			}

			let key = kp.keypairs[addrData.addressSeed.keys[order]];
			if (!key) {
				console.error(`WALLET ERROR: key is not found!`);
				return false;
			}

			let Ss = getSignSys(key.signType);
			if (!Ss) {
				return false;
			}

			let size = Ss.signatureSize;
			let pushDataBuf = getPushDataSizeBuffer(1 + size);
			if (!pushDataBuf) {
				return false;
			}
			signSize += pushDataBuf.length + 1 + size; // pauhData order sign
		}
		return signSize;
	}

	getSignPhoton(address: string, signOrder: number[]): false | number {
		let photon = 0;
		let signSize = this.calcSignSize(address, signOrder);

		if (!signSize) {
			return false;
		}

		photon += (signSize + 2) * 3; // +2 -> hashType and push 1byte; unlockscript size x3
		let compactSize = getCompactSizeBufferByNumber(signSize);
		if (!compactSize) {
			return false;
		}
		photon += (compactSize.length); // compactSize diff
		return photon;
	}

	signTx(address: string, blockTx: BlockTx, signNum: number[], feeRatio: bigint = 1n, changeOrder?: number, aesKeySafe?: SafePasswordBuf) {
		if (!changeOrder) {
			changeOrder = blockTx.vout.length - 1;
		}
		else if (changeOrder > blockTx.vout.length - 1) {
			return false;
		}

		let txBuf = blockTx.getSerialize();
		if (!txBuf) {
			return false;
		}

		let txOr = BlockTx.serializeToClass(txBuf);
		if (!txOr) {
			return false;
		}

		let txNonUlks = BlockTx.serializeToClass(txBuf);
		if (!txNonUlks) {
			return false;
		}

		txNonUlks.vin.forEach(x => {
			x.resetUnlockScript(Buffer.alloc(0)); // unlockscript = <buffer >
		});

		let ulksPhoton = txNonUlks.getPhoton();
		if (!ulksPhoton) {
			return false;
		}

		let signPhoton = this.getSignPhoton(address, signNum);
		if (!signPhoton) {
			return false;
		}

		signPhoton = signPhoton * txNonUlks.vin.length;

		// - (txNonUlks.vin.length): ulksPhoton CompactSize = 0: 1byte
		let photon = signPhoton + ulksPhoton - (txNonUlks.vin.length);

		let fee = (BigInt(photon) * feeRatio);

		let orValue: bigint = txNonUlks.vout[changeOrder].value - fee;

		if (orValue < 0n) {
			return false;
		}

		txNonUlks.vout[changeOrder].value = orValue;
		txOr.vout[changeOrder].value = orValue;

		let unlockScripts = [];
		for (let i = 0; i < txOr.vin.length; i++) {
			let lastUlks = txOr.vin[i].getUnlockScript();
			if (!lastUlks) {
				return false;
			}
			txNonUlks.vin[i].resetUnlockScript(lastUlks);

			let hashtype = Buffer.from([1, 0, 0, 0]);
			let signMsg = txNonUlks.getSerialize();

			if (!signMsg) {
				return false;
			}

			signMsg = Buffer.concat([signMsg, hashtype]);
			let sign = this.sign(address, signNum, signMsg, aesKeySafe);
			if (!sign) {
				return false;
			}

			let unlockScript: any = [];
			for (let j = 0; j < sign.length; j++) {
				let pushN = getPushDataSizeBuffer(sign[j].sign.length + 1);
				if (!pushN) {
					return false;
				}

				unlockScript.push(pushN);
				unlockScript.push(Buffer.from([sign[j].order]));
				unlockScript.push(sign[j].sign);
			}
			unlockScript.push(Buffer.from([1, 1])); //hashtype
			unlockScript = Buffer.concat(unlockScript);

			unlockScripts[i] = unlockScript;
			txNonUlks.vin[i].resetUnlockScript(Buffer.alloc(0));
		}

		for (let i = 0; i < unlockScripts.length; i++) {
			txNonUlks.vin[i].resetUnlockScript(unlockScripts[i]);
		}

		return txNonUlks;
	}

	verify(sign: sign[], data: Buffer, address: string): boolean {
		let kp = this.db.getKeyPairById(this.wid);
		if (!kp) {
			return false;
		}

		let addrData = this.db.getAddress(this.wid, Buffer.from(address, 'hex'));
		if (!addrData) {
			console.error(`WALLET ERROR: addresses (${address}) is not found!`);
			return false;
		}

		if (sign.length !== addrData.pqcertRoot.level) {
			console.error(`WALLET ERROR: Insufficient number of sign! (${sign.length})`);
			return false;
		}

		for (let i = 0; i < sign.length; i++) {
			if (i > 0 && sign[i].order <= sign[i - 1].order) {
				console.error(`WALLET ERROR: sign fail!`);
				return false;
			}

			let order = sign[i].order;

			if (addrData.addressSeed.keys[order] === undefined) {
				console.error(`WALLET ERROR: signOrder (${order}) fail!`);
				return false;
			}

			if (addrData.addressSeed.keys[order] === -1) {
				console.error(`WALLET ERROR: signOrder (${order}) is fake!`);
				return false;
			}

			let key = kp.keypairs[addrData.addressSeed.keys[order]];
			if (!key) {
				console.error(`WALLET ERROR: key is not found!`);
				return false;
			}

			let Ss = getSignSys(key.signType);
			if (!Ss) {
				return false;
			}

			if (!Ss.verify(sign[i].sign, data, key.publicKey)) {
				return false;
			}
		}

		return true;
	}

	getAddressesList(wid?: number): string[] | false {
		if (wid == undefined) {
			wid = this.wid;
		}
		let addrBufList = this.db.getAddressList(wid);
		if (!addrBufList) {
			return false;
		}
		return addrBufList.map(x => x.toString('hex'));
	}

	toJson(): any | false {
		let kp = this.db.getKeyPairById(this.wid);
		if (!kp) {
			return false;
		}

		let addrs = this.db.getAllAddress(this.wid);
		let temp = {
			root: kp,
			addrs: []
		}

		for (let i = 0; i < addrs.length; i++) {
			temp.addrs[i] = {
				pqcertRoot: addrs[i].pqcertRoot.json,
				addressSeed: addrs[i].addressSeed,
				label: addrs[i].label
			}
		}
		return temp;
	}

	toBson(): Buffer | false {
		let json = this.toJson();
		if (!json) {
			return false;
		}

		return serialize(json);
	}
	
	exportAllWallet() {
		let kps = this.db.getKeyPairList(true);
		if (!kps) {
			return false;
		}

		let result = [];
		for (let wid = 0; wid < kps.length; wid++) {
			let kp = this.db.getKeyPairById(wid);
			if (!kp) {
				return false;
			}
			let addrs = this.db.getAllAddress(wid);
			let temp = {
				keySeed: kp.seed,
				addrSeed: kp.addrSeed,
				encryptionFlag: kp.encryptionFlag,
				label: kp.label,
				addrs: []
			}
	
			for (let i = 0; i < addrs.length; i++) {
				temp.addrs[i] = { addressSeed: addrs[i].addressSeed, label: addrs[i].label };
			}
			result.push(temp);
		}
		
		return { wallets: result, time: Date.now() };
	}

	getNowWid() {
		return this.wid;
	}

	exportWallet() {
		let kp = this.db.getKeyPairById(this.wid);
		if (!kp) {
			return false;
		}

		let addrs = this.db.getAllAddress(this.wid);
		let temp = {
			keySeed: kp.seed,
			addrSeed: kp.addrSeed,
			encryptionFlag: kp.encryptionFlag,
			label: kp.label,
			addrs: []
		}

		for (let i = 0; i < addrs.length; i++) {
			temp.addrs[i] = { addressSeed: addrs[i].addressSeed, label: addrs[i].label };
		}

		return { wallets: [temp], time: Date.now() };
	}

	async importWallet(recoverySeed: recoverySeed, aesKeySafe: SafePasswordBuf) {
		if(recoverySeed.encryptionFlag && !aesKeySafe) {
			return false;
		}

		let keyData = recoveryKey(recoverySeed.keySeed, recoverySeed.addrSeed, aesKeySafe);
		if(!keyData) {
			return false;
		}
		
		let kpList = this.db.getKeyPairList(true);
		if (!kpList) {
			return false;
		}

		let kpHash = {};
		for (let i = 0; i < keyData.keypairs.length; i++) {
			let pqcertPubKeyJson: PQCertPubKeyJsonData = {
				version: keyData.keypairs[i].version,
				pqcertType: 1,
				signType: keyData.keypairs[i].signType,
				pubKey: keyData.keypairs[i].publicKey.toString('hex')
			}

			let pqcertPubKey = creatPQCertPubKey(pqcertPubKeyJson);
			if (!pqcertPubKey) {
				return false;
			}
			let hash = pqcertPubKey.getHash();
			if(!hash) {
				return false;
			}

			let hashStr = hash.toString('hex');
			if (kpHash[hashStr]) {
				return false;
			}

			kpHash[hashStr] = true;
		}

		let duplicatedWid: false | number = false;
		for (let i = 0; i < kpList.length; i++) {
			let sameCount = 0;
			for (let j = 0; j < kpList[i].keypairs.length; j++) {
				if (keyData.keypairs[j].publicKey.equals(kpList[i].keypairs[j].publicKey)) {
					sameCount++;
				}
			}

			// is same
			if (sameCount === kpList[i].keypairs.length) {
				console.log(`The key pair is duplicated with ${i}`);
				duplicatedWid = i;
				break;
			}

		}

		let newWid;
		if (duplicatedWid === false) {
			// new pey pair
			keyData.label = recoverySeed.label;
			let suc = await this.db.addKeyPair(keyData);
			if (suc === false) {
				console.log(`importWallet fail!`);
				return false;
			}
			console.log(`importWallet KeyPair success!`);
			newWid = suc;
		}
		else {
			console.log(`The key already exists: wid ${duplicatedWid}`);
			return false;
		}

		// ----- add address 
		let address = [];
		for (let i = 0; i < recoverySeed.addrs.length; i++) {
			let r = await this.db.createAddress(newWid, recoverySeed.addrs[i].addressSeed, recoverySeed.addrs[i].label);
			if(!r) {
				console.log('createAddress fail', recoverySeed.addrs[i].addressSeed);
			}
			else {
				address.push(r.toString('hex'));
				console.log('createAddress success: ', r.toString('hex'));
			}
		}
		return { address };
	}

	async exit() {
		await this.db.exit();
	}
}


export { Wallet };