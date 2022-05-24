import { BufferReader } from './util';
import { BlockchainDb } from '../db/lmdb/blockchainDb';
import { PQCertType, PQCertPubKey, PQCertRoot, PQCertGroup } from './pqcert';
import { verifyMulti } from './signType';
import { BlockTx } from './blockTx';

type lastVout = {
	tx: BlockTx;
	voutn: number;
}

class ScriptContainer {
	private stack: any[];
	private pqcertCache: { [key: string]: PQCertType };
	private blockDb: BlockchainDb;
	private bufReader: BufferReader;
	private txData: BlockTx;
	private txn: number;
	private lastVout: lastVout[];
	private height: number;
	private isRun: Boolean;
	private forkPqcertCache: { [key: string]: PQCertType };
	errorCode?: number

	constructor(blockDb: BlockchainDb, txData: BlockTx, txn: number, lastVout: lastVout[], height: number, forkPqcertCache?: { [key: string]: PQCertType }) {
		this.stack = [];
		this.blockDb = blockDb;
		this.txData = txData;
		this.txn = txn;
		this.lastVout = lastVout;
		this.height = height;
		this.isRun = false;

		this.pqcertCache = {};
		for (let i = 0; i < this.txData.pqcert.length; i++) {
			let hash = <string>this.txData.pqcert[i].getHash('hex');
			this.pqcertCache[hash] = this.txData.pqcert[i];
		}

		this.forkPqcertCache = (forkPqcertCache) ? forkPqcertCache : {};
	}

	run() {
		if (this.isRun) {
			this.errorCode = -15;
			return false;
		}

		this.isRun = true;

		let vin = this.txData.vin[this.txn];
		if (!vin) {
			this.errorCode = -1;
			return false;
		}

		let unlockScript = vin.getUnlockScript();
		if (!unlockScript) {
			this.errorCode = -16;
			return false;
		}

		let lockScript;
		for (let i = 0; i < this.lastVout.length; i++) {
			if (!this.lastVout[i].tx.vout[this.lastVout[i].voutn]) {
				return false;
			}
			let temp = this.lastVout[i].tx.vout[this.lastVout[i].voutn].lockScript;

			if (!temp) {
				return false;
			}

			if (i === 0) {
				lockScript = temp;
			}
			if (i > 0) {
				if (!lockScript.equals(temp)) {
					return false;
				}
			}
		}

		if (!lockScript) {
			return false;
		}

		let script = Buffer.concat([unlockScript, lockScript]);
		this.bufReader = new BufferReader(script);

		while (1) {
			let op = this.bufReader.readUInt8();
			if (ScriptContainer.OPs[op]) {
				if (!ScriptContainer.OPs[op].call(this)) {
					return false;
				}
			}
			else {
				return false;
			}

			if (this.bufReader.isEnd()) {
				if (this.stack.length === 1 && this.stack[0] === true) {
					return true;
				}
				else {
					return false;
				}
			}
		}
	}

	getSignedTx(): BlockTx | false {
		let signedTxBuf = this.txData.getSerialize();
		if (!signedTxBuf) {
			return false;
		}

		let signedTx = BlockTx.serializeToClass(signedTxBuf);
		if (!signedTx) {
			return false;
		}

		for (let i = 0; i < signedTx.vin.length; i++) {
			if (i !== this.txn) {
				signedTx.vin[i].resetUnlockScript(Buffer.alloc(0));
			}
			else {
				let lastlockScript;
				for (let i = 0; i < this.lastVout.length; i++) {
					let lastVoutData = this.lastVout[i].tx;
					if (!lastVoutData || !lastVoutData.vout[this.lastVout[i].voutn]) {
						return false;
					}
					let temp = lastVoutData.vout[this.lastVout[i].voutn].lockScript;

					if (i > 0) {
						if (!lastlockScript.equals(temp)) {
							return false;
						}
					}

					lastlockScript = temp;
				}

				signedTx.vin[i].resetUnlockScript(lastlockScript);
			}
		}

		return signedTx;
	}

	pqcertRootVerify(pqcertRoot: PQCertRoot, sighashFlag?: number) {
		let level = pqcertRoot.level;
		let signData = [];

		if (sighashFlag === undefined) {
			let sighashFlag = this.stack.pop();

			if (sighashFlag.readUInt8() !== 1) {
				return false;
			}
		}
		else if (sighashFlag !== 1) {
			return false;
		}

		let signedTx = this.getSignedTx();
		if (!signedTx) {
			return false;
		}

		for (let i = 0; i < level; i++) {
			let data = this.stack.pop();
			if (!data) {
				return false;
			}

			signData[i] = {
				n: data.readUInt8(0),
				signature: data.subarray(1)
			};

			if (i > 0) {
				if (signData[i - 1].n <= signData[i].n) {
					return false;
				}
			}

			let pubhash = pqcertRoot.getPubKeyHash(signData[i].n);
			if (!pubhash) {
				return false;
			}

			let pubhashStr = pubhash.toString('hex');

			let pqcertPubKey = this.blockDb.getPqcertByHash(pubhash);

			if (!pqcertPubKey) {
				pqcertPubKey = this.pqcertCache[pubhashStr];
				if (!pqcertPubKey) {
					pqcertPubKey = this.forkPqcertCache[pubhashStr];
					if (!pqcertPubKey) {
						return false;
					}
				}
			}

			if (pqcertPubKey.pqcertType !== 1) {
				return false;
			}
			pqcertPubKey = <PQCertPubKey>pqcertPubKey;
			signData[i].pubk = pqcertPubKey.pubKey;
			signData[i].signType = pqcertPubKey.signType;
		}

		let signedTxRaw = signedTx.getSerialize();
		let HashType = Buffer.from([1, 0, 0, 0]);
		if (!signedTxRaw) {
			return false;
		}
		return verifyMulti(signData, Buffer.concat([signedTxRaw, HashType]));
	}

	pqcertGroupVerify(pqcertGroup: PQCertGroup) {
		let level = pqcertGroup.level;
		let signData = [];
		let sighashFlag = this.stack.pop();
		let signedTx;
		if (sighashFlag.readUInt8() === 1) {
			signedTx = this.getSignedTx();
			if (!signedTx) {
				return false;
			}
		}
		else {
			return false;
		}

		let lastMemberId
		for (let i = 0; i < level; i++) {
			let memberId = this.stack.pop();
			if (!memberId) {
				return false;
			}

			memberId = memberId.readUint8();

			if (i > 0) {
				if (lastMemberId <= memberId) {
					return false;
				}
			}

			lastMemberId = memberId;

			let member = pqcertGroup.getMember(memberId);
			if (!member) {
				return false;
			}

			if (member.lockTime) {
				if (member.lockTime > this.height) {
					return false;
				}
			}

			let pqcert = this.blockDb.getPqcertByHash(member.hash);
			let memberHashStr = member.hash.toString('hex');

			if (!pqcert) {
				pqcert = this.pqcertCache[memberHashStr];
				if (!pqcert) {
					pqcert = this.forkPqcertCache[memberHashStr];
					if (!pqcert) {
						return false;
					}
				}
			}

			if (pqcert.pqcertType !== 0) {
				return false;
			}

			let v = this.pqcertRootVerify(<PQCertRoot>pqcert, 0x01);
			if (!v) {
				return false;
			}
		}

		return true;
	}

	static OPs = {}
}

//------- OP TABLE -------

for (let i = 1; i < 75; i++) {
	let pushN = i;
	ScriptContainer.OPs[i] = function () {
		let data = this.bufReader.subarray(pushN);
		this.bufReader.addReadOffset(pushN);
		this.stack.push(data);
		return true;
	}
}

ScriptContainer.OPs[76] = function () { //76~255;

	let pushN = this.bufReader.readUInt8();
	if (pushN < 76) { //strict
		return false;
	}
	let data = this.bufReader.subarray(pushN);
	this.bufReader.addReadOffset(pushN);
	this.stack.push(data);
	return true;
}

ScriptContainer.OPs[77] = function () { //256~65535;

	let pushN = this.bufReader.readUInt16LE();
	if (pushN < 256) { //strict
		return false;
	}
	let data = this.bufReader.subarray(pushN);
	this.bufReader.addReadOffset(pushN);
	this.stack.push(data);
	return true;
}

ScriptContainer.OPs[78] = function () { //65536~0xffffffff;

	let pushN = this.bufReader.readUInt32LE();
	if (pushN < 65536) { //strict
		return false;
	}
	let data = this.bufReader.subarray(pushN);
	this.bufReader.addReadOffset(pushN);
	this.stack.push(data);
	return true;
}

ScriptContainer.OPs[252] = function OP_CHECKPQCERT() {
	let address = this.stack.pop();
	let addressStr = address.toString('hex');

	let pqcert = this.blockDb.getPqcertByHash(address);
	if (!pqcert) {
		pqcert = this.pqcertCache[addressStr];
		if (!pqcert) {
			pqcert = this.forkPqcertCache[addressStr];
			if (!pqcert) {
				return false;
			}
		}
	}

	if (pqcert.pqcertType === 0) {
		let v = this.pqcertRootVerify(pqcert);
		if (this.stack.length === 0) {
			this.stack.push(v);
			return v;
		}
		else {
			return false;
		}

	}
	else if (pqcert.pqcertType === 2) {
		let v = this.pqcertGroupVerify(pqcert);
		if (this.stack.length === 0) {
			this.stack.push(v);
			return v;
		}
		else {
			return false;
		}
	}
	else {
		return false;
	}
}

export default ScriptContainer;