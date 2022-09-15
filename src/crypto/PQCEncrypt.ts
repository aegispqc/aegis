import * as cpt from 'crypto';
import { verifyMulti } from '../blockchain/signType';
import { Falcon512 } from '../pqc/nistRound3/falcon';
import { encryption, decryption } from './aes256gmc';
import { FullSkewedHashTree } from './fullSkewedHashTree';
import { sha2d, shake256, shake256XOF } from './hash';
import { Secp256k1 } from './secp256k1';

function leftHashFun(data: Buffer): Buffer {
	return sha2d(shake256(data));
}

function rightHashFun(data: Buffer): Buffer {
	return shake256(sha2d(data));
}

class TimeValidatedHash {
	private readonly timeStep: number;
	private readonly hashTable: Set<string>;
	private readonly timeTable: Map<number, string[]>;
	constructor(timeStep: number = 60) {
		this.timeStep = timeStep;
		this.hashTable = new Set();
		this.timeTable = new Map();
	}

	add(hash: string, time: number): boolean {
		if (this.hashTable.has(hash)) {
			return false;
		}
		this.hashTable.add(hash);
		let timeUnit = Math.floor(time / this.timeStep);
		if (!this.timeTable.has(timeUnit)) {
			this.timeTable.set(timeUnit, []);
		}
		this.timeTable.get(timeUnit).push(hash);
		return true;
	}

	clear() {
		let now = Math.floor(Date.now() / this.timeStep) + 2;
		this.timeTable.forEach((value, key) => {
			if (key < now) {
				this.timeTable.delete(key);
				value.forEach(x => {
					this.hashTable.delete(x);
				});
			}
		});
	}
}

class PQCEncrypt {
	private falcon512?: Falcon512;
	private secp256k1?: Secp256k1;
	private timeValidatedHash: TimeValidatedHash;
	private clearTimmer?: ReturnType<typeof setInterval>;
	readonly signSeed: Buffer;
	readonly aesKey: Buffer;
	readonly pubKey: Buffer;
	cliPubKey: Buffer;

	constructor(signSeed: Buffer = cpt.randomBytes(32), aesKey: Buffer = cpt.randomBytes(32)) {
		this.signSeed = signSeed;
		this.aesKey = aesKey;
		this.timeValidatedHash = new TimeValidatedHash(60);

		let pubkey = [];
		let fhashtree = new FullSkewedHashTree(signSeed, 2, leftHashFun, rightHashFun);
		let falconSeed = fhashtree.getLeftNode(0);
		if (!falconSeed) {
			return;
		}

		let falconKeyPair = Falcon512.genKey(shake256XOF(falconSeed, Falcon512.seedSize));
		if (!falconKeyPair) {
			return;
		}
		this.falcon512 = new Falcon512(falconKeyPair.privateKey, falconKeyPair.publicKey);
		pubkey[0] = falconKeyPair.publicKey;

		let eccSeed = fhashtree.getLeftNode(1);
		if (!eccSeed) {
			return;
		}
		let secp256k1KeyPair = Secp256k1.genKey(shake256XOF(eccSeed, Secp256k1.seedSize));
		if (!secp256k1KeyPair) {
			return;
		}
		this.secp256k1 = new Secp256k1(secp256k1KeyPair.privateKey, secp256k1KeyPair.publicKey);
		pubkey[1] = secp256k1KeyPair.publicKey;
		this.pubKey = Buffer.concat(pubkey);

	}

	setCliPubKey(pubKey: Buffer) {
		this.cliPubKey = pubKey;
		console.log(`Verifying PQCEncryption's signature is enabled.`);
	}

	getPubKey(): Buffer | false {
		return (this.pubKey) ? this.pubKey : false;
	}

	encryption(msg: Buffer): Buffer | false {
		if (!this.falcon512 || !this.secp256k1) {
			return false;
		}
		let falconSign = this.falcon512.sign(msg);
		if (!falconSign) {
			return false;
		}
		let eccSign = this.secp256k1.sign(msg);
		if (!eccSign) {
			return false;
		}
		let time = Math.floor(Date.now() / 1000);
		let timeBuf = Buffer.alloc(4);
		timeBuf.writeUInt32BE(time);

		return encryption(Buffer.concat([timeBuf, falconSign, eccSign, msg]), this.aesKey);
	}

	decryption(sdata: Buffer, timeVerify: number = 30): Buffer | false {
		let data = decryption(sdata, this.aesKey);
		if (!data) {
			return false;
		}

		let msgTime = data.readUInt32BE(0);
		let falconSignLen = data.readUInt16BE(4) + 42;
		let falconSign = data.subarray(4, 4 + falconSignLen);
		let eccSign = data.subarray(4 + falconSignLen, 4 + falconSignLen + Secp256k1.signatureSize);
		let msg = data.subarray(4 + falconSignLen + Secp256k1.signatureSize);
		let now = Math.floor(Date.now() / 1000);
		if (timeVerify) {
			if ((now - msgTime) > timeVerify || (msgTime - now) > timeVerify) {
				console.log('PQCEncrypt time verify fail');
				return false;
			}
		}
		if (!this.timeValidatedHash.add(shake256XOF(sdata, 16, 'base64'), now)) {
			return false;
		}
		if (!this.cliPubKey) {
			return msg;
		}
		let verifySign = [
			{ signType: 3, signature: falconSign, pubk: this.cliPubKey.subarray(0, Falcon512.publicKeySize) },
			{ signType: 0, signature: eccSign, pubk: this.cliPubKey.subarray(Falcon512.publicKeySize, Falcon512.publicKeySize + Secp256k1.publicKeySize) }
		]
		if (verifyMulti(verifySign, msg)) {
			return msg;
		}

		return false;
	}

	clearSchedulingStart() {
		if (this.clearTimmer) {
			clearInterval(this.clearTimmer);
		}
		this.clearTimmer = setInterval(() => {
			this.timeValidatedHash.clear();
		}, 120000);
	}

	clearSchedulingStop() {
		if (this.clearTimmer) {
			clearInterval(this.clearTimmer);
		}
	}
}

export { PQCEncrypt };