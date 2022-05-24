import * as crypto from 'crypto';
import { isIPv4, isIPv6 } from 'net';

export function intToBuffer(num: number, size?: number): Buffer {
	let bytes = [];
	while (num !== 0) {
		bytes[bytes.length] = num & 0x00ff;
		num = num >>> 8;
	}
	if (typeof size === 'number') {
		if (size > bytes.length) {
			while (size > bytes.length) {
				bytes[bytes.length] = 0;
			}
		}
		else {
			bytes = bytes.slice(0, size);
		}
	}
	return Buffer.from(bytes);
}

export function parseBuffer(buffer_message: any): { err?: boolean, buffer?: Buffer } {
	let buffer;
	if (!buffer_message) {
		return { err: true };
	}
	else if (Buffer.isBuffer(buffer_message)) {
		buffer = buffer_message;
	}
	else if (typeof buffer_message === 'string' && buffer_message !== '') {
		buffer = Buffer.from(buffer_message, 'hex');
	}
	else {
		return { err: true }
	}
	return { buffer }
}

export function createNonce(size: number): Buffer {
	return crypto.randomBytes(size);
}

export function createUid(): Buffer {
	return crypto.randomBytes(32);
}

export function writeIpBuffer(ip: string): Buffer {
	let buffer = Buffer.alloc(16);
	if (typeof ip !== 'string') return
	if (ip.includes('.') && ip.includes(':ffff:')) {
		ip = ip.split(':ffff:')[1];
	}
	if (isIPv4(ip)) {
		buffer.writeUInt32BE(0);
		buffer.writeUInt32BE(0, 4);
		buffer.writeUInt32BE(0x0000FFFF, 8);
		let ipv4 = ip.split('.');
		for (let i = 0; i < ipv4.length; i++) {
			buffer.writeUInt8(parseInt(ipv4[i]), 12 + i);
		}
	}
	else {
		let ipv6 = ip.split(':');
		for (let i = 0; i < ipv6.length; i++) {
			buffer.writeUInt16BE(parseInt(ipv6[i], 16), 2 * i);
		}
	}
	return buffer;
}

export function readIpBuffer(buf: Buffer): string {
	let ip = [];
	let isIpv4 = true;
	for (let i = 0; i < 6; i++) {
		let index: number = ip.length;
		ip[index] = buf.readUInt16BE(2 * i).toString(16);
		if (isIpv4) {
			if (i < 5 && ip[index] !== '0') {
				isIpv4 = false;
			}
			else if (i === 5 && ip[index] !== 'ffff') {
				isIpv4 = false;
			}
		}
	}
	if (isIpv4) {
		let ipv4 = [];
		for (let i = 0; i < 4; i++) {
			ipv4[ipv4.length] = buf.readUInt8(12 + i);
		}
		return ipv4.join('.');
	}
	else {
		for (let i = 0; i < 2; i++) {
			ip[ip.length] = buf.readUInt16BE(12 + (2 * i)).toString(16);
		}
		return ip.join(':');
	}
}