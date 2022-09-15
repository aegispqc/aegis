import { randomBytes } from 'crypto';
import secp256k1 from 'secp256k1';
import { shake256 } from './hash';

import { getSignSysIF } from './signSysIF';

let Secp256k1Core = {
	genkey(publicKey: Buffer, privateKey: Buffer, seed: Buffer): boolean {
		for (let i = 0; i < 10; i++) {
			let sd = randomBytes(32);
			if (secp256k1.privateKeyVerify(sd)) {
				let pk = secp256k1.publicKeyCreate(sd);
				if (pk) {
					pk = Buffer.from(pk.buffer);
					sd.copy(privateKey);
					pk.copy(publicKey);
					sd.copy(seed);
					return true;
				}
			}
		}

		return false;
	},
	genkeyBySeed(publicKey: Buffer, privateKey: Buffer, seed: Buffer): boolean {
		let sk = shake256(seed);
		if (!secp256k1.privateKeyVerify(sk)) {
			return false;
		}
		let pk = secp256k1.publicKeyCreate(sk);
		if (!pk) {
			return false
		}

		pk = Buffer.from(pk.buffer);
		sk.copy(privateKey);
		pk.copy(publicKey);

		return true;
	},
	genSkBySeed(privateKey: Buffer, seed: Buffer): boolean {
		let sk = shake256(seed);
		if (!secp256k1.privateKeyVerify(sk)) {
			return false;
		}

		sk.copy(privateKey);
		return true;
	},
	genPkBySeed(publicKey: Buffer, seed: Buffer): boolean {
		let sk = shake256(seed);
		if (!secp256k1.privateKeyVerify(sk)) {
			return false;
		}
		let pk = secp256k1.publicKeyCreate(sk);
		if (!pk) {
			return false
		}

		pk = Buffer.from(pk.buffer);
		pk.copy(publicKey);
		return true;
	},
	sign(signature: Buffer, data: Buffer, sk: Buffer): boolean {
		let nonce = randomBytes(32);
		let sign = secp256k1.ecdsaSign(shake256(data), sk, { data: nonce }).signature;
		if (!sign) {
			return false;
		}
		sign = Buffer.from(sign.buffer);
		sign.copy(signature);
		return true;
	},
	signBySeed(signature: Buffer, data: Buffer, seed: Buffer): boolean {
		let sk = shake256(seed);
		if (!secp256k1.privateKeyVerify(sk)) {
			return false;
		}

		return Secp256k1Core.sign(signature, data, sk);
	},
	verifySign(signature: Buffer, data: Buffer, publicKey: Buffer): boolean {
		return secp256k1.ecdsaVerify(signature, shake256(data), publicKey);
	},
	getSkLength(): number {
		return 32;
	},
	getPkLength(): number {
		return 33;
	},
	getSignLength(): number {
		return 64;
	},
	getNonceLength(): number {
		return 32;
	},
	getSeedLength(): number {
		return 32;
	},
}

let signSysIF = getSignSysIF();
signSysIF.signCore = Secp256k1Core;
signSysIF.signSysName = 'Secp256k1';

class Secp256k1 extends signSysIF {
	constructor(privateKey: Buffer, publicKey: Buffer, encryptedPrivateKeyMode: boolean = false) {
		super(privateKey, publicKey, encryptedPrivateKeyMode);
	}
}

export { Secp256k1 };