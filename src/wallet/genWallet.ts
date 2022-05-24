import { randomBytes } from "crypto";
import { getSignSys } from "../blockchain/signType";
import { FullSkewedHashTree } from "../crypto/fullSkewedHashTree";
import { sha2d, shake256, shake256XOF } from "../crypto/hash";
import { serialize, deserialize } from 'bson';
import { encryption, decryption } from '../crypto/aes256gmc';
import { Keypair } from "./walletDb";
import { SafePasswordBuf } from "../crypto/safePassword";

type keySeed = {
	seed: Buffer;
	keyTypes: [number, number][]
}

function leftHashFun(data: Buffer): Buffer {
	return sha2d(shake256(data));
}

function rightHashFun(data: Buffer): Buffer {
	return shake256(sha2d(data));
}

function getSeedTree(seed: Buffer, level: number): FullSkewedHashTree {
	return new FullSkewedHashTree(seed, level, leftHashFun, rightHashFun);
}

function genWallet(opt: { keyTypes: { version: number, signType: number }[] }, aesKey?: SafePasswordBuf): Keypair | false {
	let keySeed = randomBytes(32);
	let addrSeed = randomBytes(32);
	let fhashtree = getSeedTree(keySeed, opt.keyTypes.length);
	let keys: any = [];
	let keyTypes = [];

	for (let i = 0; i < opt.keyTypes.length; i++) {
		let sign = getSignSys(opt.keyTypes[i].signType);
		if (!sign) {
			return false;
		}

		let seed = fhashtree.getLeftNode(i);
		if (!seed) {
			return false;
		}

		seed = shake256XOF(seed, sign.seedSize);

		let key = sign.genKey(seed);
		if (!key) {
			return false;
		}

		keys[i] = { version: opt.keyTypes[i].version, signType: opt.keyTypes[i].signType, privateKey: key.privateKey, publicKey: key.publicKey };
		keyTypes[i] = [opt.keyTypes[i].version, opt.keyTypes[i].signType];
	}


	if (aesKey) {
		keys.forEach((x) => {
			let originKey = x.privateKey;
			
			x.privateKey = encryption(x.privateKey, aesKey.data);
			originKey.fill(0);
		});

		let originKeySeed = keySeed;
		keySeed = encryption(keySeed, aesKey.data);
		originKeySeed.fill(0);
		aesKey.free();
	}
	let seedSerialize = serialize({ seed: keySeed, keyTypes });
	fhashtree.free();
	return { keypairs: keys, seed: seedSerialize, addrSeed, encryptionFlag: (aesKey) ? true : false };
}

function recoveryKey(seed: Buffer, addrSeed: Buffer, aesKey?: SafePasswordBuf): Keypair | false {
	let seedJson = deserialize(seed, { promoteBuffers: true });
	let keySeed = seedJson.seed;
	if (aesKey) { 

		keySeed = decryption(keySeed, aesKey.data);
	}
	let fhashtree = getSeedTree(keySeed, seedJson.keyTypes.length);
	let keys: any = [];

	for (let i = 0; i < seedJson.keyTypes.length; i++) {
		let sign = getSignSys(seedJson.keyTypes[i][1]);
		
		if (!sign) {
			return false;
		}

		let seed = fhashtree.getLeftNode(i);
		if (!seed) {
			return false;
		}

		seed = shake256XOF(seed, sign.seedSize);

		let key = sign.genKey(seed);
		if (!key) {
			return false;
		}

		keys[i] = { version: seedJson.keyTypes[i][0], signType: seedJson.keyTypes[i][1], privateKey: key.privateKey, publicKey: key.publicKey };
	}

	if (aesKey) {
		keys.forEach((x) => {
			let originKey = x.privateKey;
			x.privateKey = encryption(x.privateKey, aesKey.data);
			originKey.fill(0);
		});

		keySeed = encryption(keySeed, aesKey.data);
	}

	fhashtree.free();
	return { keypairs: keys, seed, addrSeed, encryptionFlag: (aesKey) ? true : false };
}

export { genWallet, getSeedTree, recoveryKey, keySeed }




