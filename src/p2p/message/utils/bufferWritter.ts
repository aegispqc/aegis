import { Option, interfaceIp } from '../../lib/interface';
import * as NetworkUtils from './network';

export default class BufferWriter {
	bufArr: Buffer[];
	bufLen: number;
	constructor() {
		this.bufArr = [];
		this.bufLen = 0;
	}

	custom(buf: Buffer): boolean {
		if (buf.length < 1) return false;
		this.bufArr[this.bufArr.length] = buf;
		this.bufLen += buf.length;
		return true;
	}

	uint8(value: number) {
		let buf = Buffer.alloc(1);
		buf.writeUInt8(value);
		this.bufArr[this.bufArr.length] = buf;
		this.bufLen += 1;
	}

	uint16(value: number) {
		let buf = Buffer.alloc(2);
		buf.writeUInt16LE(value);
		this.bufArr[this.bufArr.length] = buf;
		this.bufLen += 2;
	}

	uint32(value: number) {
		let buf = Buffer.alloc(4);
		buf.writeUInt32LE(value);
		this.bufArr[this.bufArr.length] = buf;
		this.bufLen += 4;
	}

	uint32BE(value: number) {
		let buf = Buffer.alloc(4);
		buf.writeUInt32BE(value);
		this.bufArr[this.bufArr.length] = buf;
		this.bufLen += 4;
	}

	uint64(bigValue: bigint) {
		let buf = Buffer.alloc(8);
		buf.writeBigUInt64LE(bigValue);
		this.bufArr[this.bufArr.length] = buf;
		this.bufLen += 8;
	}

	hash(hash: Buffer | string): boolean {
		if (Buffer.isBuffer(hash)) {
			return this.custom(hash);
		}
		else {
			let hashBuffer = Buffer.from(hash, 'hex');
			return this.custom(hashBuffer);
		}
	}

	nonceBuffer(buf: Buffer) {
		this.custom(buf);
	}

	get() {
		return Buffer.concat(this.bufArr, this.bufLen);
	}

	_ipAddr(addr: Option) {
		if (!addr?.ip || typeof addr?.port !== 'number') return;
		this.custom(NetworkUtils.writeIpBuffer(addr.ip));
		this.uint16(addr.port);
	}

	netAddr(services: bigint, ip: string, port: number, time?: number) {
		if (typeof time === 'number' && !isNaN(time)) {
			this.uint32(time);
		}
		this.uint64(services);  // services
		this._ipAddr({ ip, port });
	}

	varNum(num: number) {
		let buf;
		if (num < 0xFD) {
			buf = Buffer.alloc(1);
			buf.writeUInt8(num);
		}
		else if (num <= 0xFFFF) {
			buf = Buffer.alloc(3);
			buf.writeUInt8(0xFD, 0);
			buf.writeUInt16LE(num, 1);
		}
		else if (num <= 0xFFFFFFFF) {
			buf = Buffer.alloc(5);
			buf.writeUInt8(0xFE, 0);
			buf.writeUInt32LE(num, 1);
		}
		else {
			buf = Buffer.alloc(9);
			buf.writeUInt8(0xFF, 0);
			let bigint = BigInt(num)
			buf.writeBigUInt64LE(bigint, 1);
		}
		this.custom(buf);
	}

	varStr(str: string) {
		let length = str.length;
		this.varNum(length);
		let buf = Buffer.from(str, 'ascii');
		this.custom(buf);
	}
}