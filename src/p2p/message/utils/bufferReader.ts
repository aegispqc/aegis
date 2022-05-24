import * as NetworkUtils from './network';
import { interfaceNetworkNet } from '../../lib/interface';

export default class BufferReader {
	buf: Buffer;
	bufIndex: number;
	maxSize: number;
	constructor(buffer: Buffer) {
		this.buf = buffer;
		this.bufIndex = 0;
		this.maxSize = buffer.length;
	}

	isEnd() {
		return this.bufIndex >= this.maxSize;
	}

	get length() {
		return this.maxSize;
	}

	get remainNow() {
		return this.maxSize - this.bufIndex;
	}

	getBufferFromNow(size: number) {
		if (this.bufIndex + size > this.maxSize) return null;
		return this.buf.slice(this.bufIndex, this.bufIndex + size);
	}

	indexShiftRight(size: number) {
		if (this.bufIndex + size > this.maxSize) return false;
		this.bufIndex += size;

		return true;
	}

	custom(size: number): Buffer | null {
		if (this.bufIndex + size > this.maxSize) return null;
		let data = this.buf.slice(this.bufIndex, this.bufIndex + size);
		this.bufIndex += size;

		return data;
	}

	getRemain() {
		return this.custom(this.remainNow);
	}

	uint8(): number | null {
		if (this.bufIndex + 1 > this.maxSize) return null;
		let data = this.buf.readUInt8(this.bufIndex);
		this.bufIndex += 1;

		return data;
	}

	uint16(): number | null {
		if (this.bufIndex + 2 > this.maxSize) return null;
		let data = this.buf.readUInt16LE(this.bufIndex);
		this.bufIndex += 2;

		return data;
	}

	uint32(): number | null {
		if (this.bufIndex + 4 > this.maxSize) return null;
		let data = this.buf.readUInt32LE(this.bufIndex);
		this.bufIndex += 4;

		return data;
	}

	uint64(): bigint | null {
		if (this.bufIndex + 8 > this.maxSize) return null;
		let data = this.buf.readBigInt64LE(this.bufIndex);
		this.bufIndex += 8;

		return data;
	}

	_ipAddr(): string | null {
		let ipBuf = this.custom(16);
		let ip = ipBuf ? NetworkUtils.readIpBuffer(ipBuf) : null;
		return ip;
	}

	netAddr(hasTimestamp?: boolean): interfaceNetworkNet | null {
		if (hasTimestamp && this.bufIndex + 30 > this.maxSize) return null;
		else if (this.bufIndex + 26 > this.maxSize) return null;
		let time
		if (hasTimestamp) {
			time = this.uint32();
		}
		let services = this.uint64();
		let ip = this._ipAddr();
		let port = this.uint16();

		return { time, services, ip, port };
	}

	hash(): Buffer | null {
		return this.custom(32);
	}

	nonceBuffer(): Buffer | null {
		return this.custom(32);
	}

	uid(): Buffer | null {
		return this.custom(32);
	}

	varNum(): number | null {
		let encode = this.uint8();
		switch (encode) {
			case 0xFD:
				return this.uint16();
			case 0xFE:
				return this.uint32();
			case 0xFF:
				let bignum = this.uint64();
				if (bignum === null) return null;
				if (bignum > BigInt(Number.MAX_SAFE_INTEGER)) {
					return null;
				}
				return Number(bignum);

			default:
				return encode;
		}
	};

	varStr(): string | null {
		let value = this.varNum();
		if (typeof value === 'number') {
			let data = this.custom(value);
			if (data) {
				return data.toString('ascii');
			}
		}
		return null;
	}
}