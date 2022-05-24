import * as cpt from 'crypto';

type BinaryToTextEncoding = 'base64' | 'hex';

function sha256(data: Buffer): Buffer;
function sha256(data: Buffer, dig: BinaryToTextEncoding): string;
function sha256(data, dig?): Buffer | string {
	return cpt.createHash('sha256').update(data).digest(dig);
}

function shake256(data: Buffer): Buffer;
function shake256(data: Buffer, dig: BinaryToTextEncoding): string;
function shake256(data, dig?): Buffer | string {
	return cpt.createHash('shake256').update(data).digest(dig);
}

function shake256XOF(data: Buffer, outputLength: number): Buffer;
function shake256XOF(data: Buffer, outputLength: number, dig: BinaryToTextEncoding): string;
function shake256XOF(data, outputLength = 32, dig?): Buffer | string {
	return cpt.createHash('shake256', { outputLength }).update(data).digest(dig);
}

function sha2d(data: Buffer): Buffer;
function sha2d(data: Buffer, dig: BinaryToTextEncoding): string;
function sha2d(data, dig?): Buffer | string {
	return sha256(sha256(data), dig);
}

export { sha256, shake256, shake256XOF, sha2d }