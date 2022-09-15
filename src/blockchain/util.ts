import { equationsOffset, verifyPoW } from "./pow";

type BinaryToTextEncoding = 'base64' | 'hex';

const SIPrefixTable = ['', ' Kibi', ' Mebi', ' Gibi', ' Tebi', ' Pebi', ' Exbi', ' Zebi', ' Yobi'];

function getCompactSizeByBuffer(input: Buffer): { value: number, offset: number } | false {
	let firstByte = input[0];
	if (firstByte <= 252) {
		return { value: firstByte, offset: 1 };
	}
	else if (firstByte === 253) {
		return { value: input.readUInt16LE(1), offset: 3 };
	}
	else if (firstByte === 254) {
		return { value: input.readUInt32LE(1), offset: 5 };
	}
	else { // disable uint64
		console.error('CompactSize length units longer than uint32 are not supported');
		return false;
	}
}

function getCompactSizeBufferByNumber(input: number): Buffer | false {
	let u8 = 252;
	let u16 = 0xffff;
	let u32 = 0xffffffff;

	if (!Number.isInteger(input) || input > Number.MAX_SAFE_INTEGER) {
		return false;
	}
	else if (input <= u8) {
		let csbuf = Buffer.from([0]);
		csbuf.writeUInt8(<number>input, 0);
		return csbuf;
	}
	else if (input <= u16) {
		let csbuf = Buffer.from([0xfd, 0, 0]);
		csbuf.writeUInt16LE(<number>input, 1);
		return csbuf;
	}
	else if (input <= u32) {
		let csbuf = Buffer.from([0xfe, 0, 0, 0, 0]);
		csbuf.writeUInt32LE(<number>input, 1);
		return csbuf;
	}
	else { // disable uint64
		console.error('CompactSize length units longer than uint32 are not supported');
		return false;
	}
}

function getPushDataSizeBuffer(n: number): Buffer | false {
	if (n < 1) {
		return false;
	}

	if (n <= 75) {
		let buf = Buffer.alloc(1);
		buf.writeUInt8(n);
		return buf;
	}

	if (n <= 255) {
		let buf = Buffer.from('4C00', 'hex');
		buf.writeUInt8(n, 1);
		return buf;
	}

	if (n <= 65535) {
		let buf = Buffer.from('4D0000', 'hex');
		buf.writeUInt16LE(n, 1);
		return buf;
	}

	if (n <= 0xffffffff) {
		let buf = Buffer.from('4E00000000', 'hex');
		buf.writeUInt32LE(n, 1);
		return buf;
	}

	return false;
}

class BufferReader {
	private buf: Buffer;
	private readOffset: number;
	constructor(buf: Buffer) {
		this.buf = buf;
		this.readOffset = 0;
	}

	readUInt64LE(): bigint {
		let data = this.buf.readBigUInt64LE(this.readOffset);
		this.readOffset += 8;
		return data;
	}

	readUInt32LE(): number {
		let data = this.buf.readUInt32LE(this.readOffset);
		this.readOffset += 4;
		return data;
	}

	readUInt16LE(): number {
		let data = this.buf.readUInt16LE(this.readOffset);
		this.readOffset += 2;
		return data;
	}

	readUInt8(): number {
		let data = this.buf.readUInt8(this.readOffset);
		this.readOffset += 1;
		return data;
	}

	readCompactSize(): number | false {
		let data = getCompactSizeByBuffer(this.buf.subarray(this.readOffset));
		if (!data) {
			return false;
		}
		this.readOffset += data.offset;
		return data.value;
	}

	subarray(amount?: number) {
		let end = (amount !== undefined) ? this.readOffset + amount : undefined;
		return this.buf.subarray(this.readOffset, end);
	}

	readString(byte?: number, dig: BinaryToTextEncoding = 'hex'): string {
		let end = (byte >= 0) ? this.readOffset + byte : this.buf.length;
		let data = this.buf.toString(dig, this.readOffset, end);
		this.readOffset += (end - this.readOffset);
		return data;
	}

	getReadOffset(): number {
		return this.readOffset;
	}

	setReadOffset(offset): void {
		this.readOffset = offset;
	}

	addReadOffset(add): void {
		this.readOffset += add;
	}

	isEnd(strict: boolean = false): boolean {
		return (strict) ? (this.readOffset === this.buf.length) : (this.readOffset >= this.buf.length);
	}
}

function delay(ms: number) {
	return new Promise(r => setTimeout(r, ms));
}

function bufferIncrease(a: Buffer, b: Buffer, variablesByte: number) {
	for (let i = 0; i < a.length; i++) {
		let last = a[i]++;

		if (i !== variablesByte - 1) {
			b[i] = a[i];
		}
		else {
			b[i] = parseInt(a[i].toString(2).padStart(8, '0').split("").reverse().join(""), 2);
		}

		if (a[i] > last) {
			break;
		}
	}
}

function SIPrefix(n: number | bigint) {
	let right, m, mod;
	if (typeof n === 'bigint') {
		right = 10n;
		m = 0b1111111111n;
		mod = 0n;
	}
	else {
		right = 10;
		m = 0b1111111111;
		mod = 0;
	}

	let d
	for (let i = 0; i < SIPrefixTable.length; i++) {
		if (n < 1024) {
			d = (mod) ? `.${mod.toString().padStart(3, '0')}` : '';
			return `${n}${d}${SIPrefixTable[i]}`;
		}

		mod = (<any>n) & m;
		(<any>n) >>= right;
	}

	d = (mod) ? `.${mod.toString().padStart(3, '0')}` : '';
	return `${n}${d}${SIPrefixTable[SIPrefixTable.length - 1]}`;
}

async function testMinerAsync(mqh, nbitI, miner) {
	// console.log('testMinerAsync start!');
	let xMax = (nbitI.readUInt8(0) + equationsOffset + 5);
	let xbuf = Buffer.alloc(32);
	let xbuf2 = Buffer.alloc(32);
	xMax = 2 ** xMax;

	for (let x = 0; x < xMax; x++, bufferIncrease(xbuf, xbuf2, mqh.MQP.variablesByte)) {
		if (miner.interruptFlag) {
			return false;
		}
		if (mqh.checkIsSolution(xbuf2.subarray(0, mqh.MQP.variablesByte))) {
			// console.log('checkIsSolution!!!: ', x);
			if (verifyPoW(mqh.MQP.seed, nbitI, xbuf2)) {
				return xbuf2;
			}
		}

		if (x % 1000 === 0) {
			await delay(100);
			if (x % 1000000 === 0) {
				console.log('testMiner nonce', xbuf2.subarray(0, mqh.MQP.variablesByte).toString('hex'));
			}
		}
	}

	return false;
}

function objectIsEmpty(obj: { [key: string]: any }) {
	return Object.entries(obj).length === 0;
}


export { getCompactSizeByBuffer, getCompactSizeBufferByNumber, getPushDataSizeBuffer, BufferReader, delay, SIPrefix, testMinerAsync, objectIsEmpty };