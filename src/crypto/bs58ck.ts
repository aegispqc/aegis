import bs58 from 'bs58';
import { shake256XOF } from '../crypto/hash';

function decode(address: string): false | Buffer {
	let ags = address.slice(0, 4);
	if (ags !== 'AGS_') {
		return false;
	}
	let buf = bs58.decode(address.slice(4));
	let bufChecksum = buf.subarray(-4);
	let hash = buf.subarray(0, - 4);
	let checksum = shake256XOF(hash, 4);
	if (!checksum.equals(bufChecksum)) {
		return false;
	}

	return hash;
}

function encode(hash: Buffer | string): string {
	if (typeof hash === 'string') {
		hash = Buffer.from(hash, 'hex');
	}

	let checksum = shake256XOF(hash, 4);
	return `AGS_${bs58.encode(Buffer.concat([hash, checksum]))}`;
}

export default {

	encode,
	decode
}