import { Secp256k1 } from '../crypto/secp256k1';
import { signSysType } from '../crypto/signSysIF';
import { Dilithium3, Dilithium5 } from '../pqc/nistRound3/dilithium';
import { Falcon512, Falcon1024 } from '../pqc/nistRound3/falcon';

let signSys: signSysType[] = [
	/*0:*/ Secp256k1,
	/*1:*/ Dilithium3,
	/*2:*/ Dilithium5,
	/*3:*/ Falcon512,
	/*4:*/ Falcon1024,
]

function getSignSys(type: number) {
	return signSys[type] || false;
}

function getSignSysAll() {
	return signSys.slice(0);
}

function verify(signType: number, signature: Buffer, data: Buffer, pubk: Buffer): boolean {
	return (signSys[signType].verify || (() => false))(signature, data, pubk);
}

function verifyMulti(input: { signType: number, signature: Buffer, pubk: Buffer }[], data: Buffer): boolean {
	for (let i = 0; i < input.length; i++) {
		let v = verify(input[i].signType, input[i].signature, data, input[i].pubk);
		if (!v) {
			return false;
		}
	}

	return true;
}

export { getSignSys, getSignSysAll, verify, verifyMulti };