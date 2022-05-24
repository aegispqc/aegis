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

class PQCEncrypt {
	private falcon512?: Falcon512;
	private secp256k1?: Secp256k1
	signSeed: Buffer;
	aesKey: Buffer;
	pubKey: Buffer;
	cliPubKey: Buffer;

	constructor(signSeed: Buffer = cpt.randomBytes(32), aesKey: Buffer = cpt.randomBytes(32)) {
		this.signSeed = signSeed;
		this.cliPubKey;
		this.aesKey = aesKey;

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

	decryption(sdata: Buffer, timeVerify: number = 5): Buffer | false {
		let data = decryption(sdata, this.aesKey);
		if (!data) {
			return false;
		}

		let msgTime = data.readUInt32BE(0);
		let falconSignLen = data.readUInt16BE(4) + 42;
		let falconSign = data.subarray(4, 4 + falconSignLen);
		let eccSign = data.subarray(4 + falconSignLen, 4 + falconSignLen + Secp256k1.signatureSize);
		let msg = data.subarray(4 + falconSignLen + Secp256k1.signatureSize);
		if(timeVerify) {
			let now = Math.floor(Date.now() / 1000);
			if((now - msgTime) > timeVerify || (msgTime - now) > timeVerify) {
				console.log('PQCEncrypt time verify fail');
				return false;
			}
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
}

export { PQCEncrypt };