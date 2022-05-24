import { randomBytes } from "crypto";
import { decryption } from "./aes256gmc";

type coreApiType = {
	genkey: (publicKey: Buffer, privateKey: Buffer, seed: Buffer) => boolean;
	genkeyBySeed: (publicKey: Buffer, privateKey: Buffer, seed: Buffer) => boolean;
	genSkBySeed: (privateKey: Buffer, seed: Buffer) => boolean;
	genPkBySeed: (privateKey: Buffer, seed: Buffer) => boolean;
	sign: (signature: Buffer, data: Buffer, sk: Buffer) => boolean;
	signBySeed: (signature: Buffer, data: Buffer, seed: Buffer) => boolean;
	verifySign: (signature: Buffer, data: Buffer, publicKey: Buffer) => boolean;
	getSkLength: () => number;
	getPkLength: () => number;
	getSignLength: () => number;
	getNonceLength: () => number;
	getSeedLength: () => number;
};

let abstractCore: coreApiType = {
	genkey(publicKey, privateKey, seed) {
		console.error("Abstract methods cannot be used directly");
		return false;
	},
	genkeyBySeed(publicKey, privateKey, seed): boolean {
		console.error("Abstract methods cannot be used directly");
		return false;
	},
	genSkBySeed(privateKey: Buffer, seed: Buffer): boolean {
		console.error("Abstract methods cannot be used directly");
		return false;
	},
	genPkBySeed(privateKey: Buffer, seed: Buffer): boolean {
		console.error("Abstract methods cannot be used directly");
		return false;
	},
	sign(signature: Buffer, data: Buffer, sk: Buffer): boolean {
		console.error("Abstract methods cannot be used directly");
		return false;
	},
	signBySeed(signature: Buffer, data: Buffer, seed: Buffer): boolean {
		console.error("Abstract methods cannot be used directly");
		return false;
	},
	verifySign(signature: Buffer, data: Buffer, publicKey: Buffer): boolean {
		console.error("Abstract methods cannot be used directly");
		return false;
	},
	getSkLength(): number {
		console.error("Abstract methods cannot be used directly");
		return 0;
	},
	getPkLength(): number {
		console.error("Abstract methods cannot be used directly");
		return 0;
	},
	getSignLength(): number {
		console.error("Abstract methods cannot be used directly");
		return 0;
	},
	getNonceLength(): number {
		console.error("Abstract methods cannot be used directly");
		return 0;
	},
	getSeedLength(): number {
		console.error("Abstract methods cannot be used directly");
		return 0;
	},
}


function getSignSysIF() {
	return class SignSys {
		private privateKey: Buffer;
		publicKey: Buffer;
		encryptedPrivateKeyMode: boolean;

		private static _signCore: coreApiType = abstractCore;
		private static _signSysName?: string = 'Abstract';

		constructor(privateKey: Buffer, publicKey: Buffer, encryptedPrivateKeyMode: boolean = false) {
			this.privateKey = privateKey;
			this.publicKey = publicKey;
			this.encryptedPrivateKeyMode = encryptedPrivateKeyMode;
		}

		get privateKeySize() {
			return SignSys.privateKeySize;
		}

		get publicKeySize() {
			return SignSys.publicKeySize;
		}

		get signatureSize() {
			return SignSys.signatureSize;
		}

		get seedSize() {
			return SignSys.seedSize;
		}

		get signSysName() {
			return SignSys._signSysName;
		}

		static get signCore(): coreApiType {
			if (!SignSys._signCore) {
				return abstractCore;
			}
			return SignSys._signCore;
		}

		static get privateKeySize(): number {
			return SignSys.signCore.getSkLength();
		}

		static get publicKeySize(): number {
			return SignSys.signCore.getPkLength();
		}

		static get signatureSize(): number {
			return SignSys.signCore.getSignLength();
		}

		static get seedSize(): number {
			return SignSys.signCore.getSeedLength();
		}

		static get signSysName(): string {
			return SignSys._signSysName;
		}

		static set signSysName(x: string) {
			SignSys._signSysName = x;
		}

		static set signCore(x: coreApiType) {
			SignSys._signCore = x;
		}

		sign(data: Buffer, aesKey?: Buffer): false | Buffer {
			let sk;
			if (this.encryptedPrivateKeyMode) {
				if (!aesKey) {
					return false;
				}

				sk = decryption(this.privateKey, aesKey);
				if (!sk) {
					return false;
				}
			}
			else {
				sk = this.privateKey;
			}

			return SignSys.sign(data, sk);
		}

		verify(signature: Buffer, data: Buffer): boolean {
			return SignSys.verify(signature, data, this.publicKey);
		}

		static genKey(seed?: Buffer): { privateKey: Buffer, publicKey: Buffer, seed: Buffer } | false {
			let privateKey = Buffer.alloc(SignSys.privateKeySize);
			let publicKey = Buffer.alloc(SignSys.publicKeySize);
			if (!seed) {
				seed = randomBytes(SignSys.signCore.getSeedLength());
			}
			if (!SignSys.signCore.genkeyBySeed(publicKey, privateKey, seed)) {
				return false;
			}
			else {
				return { privateKey, publicKey, seed };
			}
		}

		static verify(signature: Buffer, data: Buffer, publicKey: Buffer): boolean {
			return SignSys.signCore.verifySign(signature, data, publicKey);
		}

		static sign(data: Buffer, privateKey: Buffer): Buffer | false {
			let signMsg = Buffer.alloc(SignSys.signCore.getSignLength());
			let r = SignSys.signCore.sign(signMsg, data, privateKey);
			if (!r) {
				return false;
			}
			return signMsg;
		}
	}
}

type signSysType = ReturnType<typeof getSignSysIF>;

export { getSignSysIF, signSysType };

