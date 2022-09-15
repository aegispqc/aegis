import path from 'path';
import * as lmdb from 'lmdb';

// 16byte
let ipStart = Buffer.from('00000000000000000000000000000000', 'hex');
let ipEnd = Buffer.from('ffffffffffffffffffffffffffffffff', 'hex');
// ip + port = 16 + 20 = 18
let ipPortStart = Buffer.from('000000000000000000000000000000000000', 'hex');
let ipPortEnd = Buffer.from('ffffffffffffffffffffffffffffffffffff', 'hex');
let ipv4Fill = Buffer.from('00000000000000000000ffff', 'hex');

function ipStrToBuf(ipStr: string): false | Buffer {
	let ipv4 = ipStr.split('.');
	if (ipv4.length === 4) {
		let ipBuf = Buffer.alloc(16);
		ipv4Fill.copy(ipBuf);
		for (let i = 0; i < 4; i++) {
			let u8 = parseInt(ipv4[i]);
			if (!(u8 >= 0 && u8 <= 255)) {
				return false;
			}
			ipBuf[i + 12] = u8;
		}
		return ipBuf;
	}

	let ipv6 = ipStr.split(':');
	if (ipv6.length === 8) {
		let ipBuf = Buffer.alloc(16);
		for (let i = 0; i < 8; i++) {
			let u16 = parseInt(ipv6[i], 16);
			if (!(u16 >= 0 && u16 <= 65535)) {
				return false;
			}

			ipBuf.writeUInt16BE(u16, i * 2);
		}
		return ipBuf;
	}

	return false;
}

function ipPortStrToBuf(ipPortStr: string) {
	if (typeof ipPortStr !== 'string') return false;
	let sp = ipPortStr.split(':');
	if (sp.length < 2) return false;
	let ipStr = sp.slice(0, -1).join(':');
	let port = parseInt(sp[sp.length - 1], 16);
	if (!(port >= 0 && port <= 65535)) {
		return false;
	}
	let ipBuf = ipStrToBuf(ipStr);
	if (!ipBuf) {
		return false;
	}

	let ipPortBuf = Buffer.alloc(18);
	ipBuf.copy(ipPortBuf);
	ipPortBuf.writeUInt16BE(port, 16);
	return ipPortBuf;
}

function ipBufToStr(ipBuf: Buffer) {
	if (ipv4Fill.equals(ipBuf.subarray(0, 12))) {
		return ipBuf.subarray(12).join('.');
	}
	return ipBuf.toString('hex').match(/.{1,4}/g).join(':');
}

function ipPortBufToObj(ipPortBuf: Buffer) {
	if (ipPortBuf.length !== 18) return false;
	let port = parseInt(ipPortBuf.subarray(16).toString("hex"), 16)
	let ip = ipBufToStr(ipPortBuf.subarray(0, -2));
	return { ip, port };
}

class P2pStatusDb {
	dbDir: string;
	basicSentence: number;
	parole: number;
	dbRoot: any;
	blacklistDb: any;
	peerDb: any;
	constructor(dbDir: string = path.join(process.cwd(), 'peers'), basicSentence: number = 300000, parole: number = 1800000) {
		this.dbDir = dbDir;
		this.basicSentence = basicSentence;
		this.parole = parole;
		this.dbRoot = lmdb.open({
			path: this.dbDir,
			name: 'p2p_status',
			maxReaders: 1
		});
		this.blacklistDb = this.dbRoot.openDB({ name: `blacklist`, keyIsBuffer: true });
		this.peerDb = this.dbRoot.openDB({ name: `peerlist`, keyIsBuffer: true });
	}

	/**
	 * @param ipBuf {Buffer} 16 byte
	 */
	async addBlackList(ipStr: string): Promise<false | { status: string; }> {
		let ipBuf = ipStrToBuf(ipStr);
		if (!ipBuf) {
			return false;
		}
		let item = this.blacklistDb.get(ipBuf);
		if (!item) {
			let status = 'in_jail';
			await this.blacklistDb.put(ipBuf, {
				status: 'in_jail',
				endTime: Date.now() + this.basicSentence,
				offenderLevel: 0,
			});
			return { status };
		}
		else if (item.status === 'in_jail') {
			return { status: 'unchanged' };
		}
		else if (item.status === 'in_parole') {
			item.status = 'in_jail';
			item.offenderLevel++;
			item.endTime = Date.now() + Math.pow(2, item.offenderLevel) * this.basicSentence;
			await this.blacklistDb.put(ipBuf, item);
			return { status: 'offender_level_up' };
		}
		else {
			return false;
		}
	}

	async deleteBlackList(ip: string) {
		let ipBuf = ipStrToBuf(ip);
		if (!ipBuf) {
			return false;
		}
		return await this.blacklistDb.remove(ipBuf);
	}

	async getBlackList() {
		let list = [];
		let now = Date.now();
		for (let { key, value } of this.blacklistDb.getRange({ start: ipStart, end: ipEnd, snapshot: false })) {
			if (value.status === 'in_jail') {
				if (now < value.endTime) {
					value.ip = ipBufToStr(key);
					list.push(value);
					continue;
				}

				if (now < value.endTime + this.parole) {
					await this.blacklistDb.remove(key);
					continue;
				}

				value.endTime += this.parole;
				value.status = 'in_parole';
				await this.blacklistDb.put(key, value);
				value.ip = ipBufToStr(key);
				list.push(value);
				continue;
			}

			if (value.status === 'in_parole') {
				if (now < value.endTime) {
					await this.blacklistDb.remove(key);
					continue;
				}
				value.ip = ipBufToStr(key);
				list.push(value);
			}
		}
		return list;
	}

	async checkIpStatus(ipStr: string): Promise<{ status: string; } | null> {
		let ipBuf = ipStrToBuf(ipStr);
		if (!ipBuf) {
			return null;
		}

		let item = this.blacklistDb.get(ipBuf);
		let now = Date.now();
		if (!item) {
			return { status: 'friendly' };
		}
		else if (item.status === 'in_jail') {
			if (now < item.endTime) {
				return { status: item.status };
			}

			if (now < item.endTime + this.parole) {
				await this.blacklistDb.remove(ipBuf);
				return { status: 'friendly' };
			}

			item.endTime += this.parole;
			item.status = 'in_parole';
			await this.blacklistDb.put(ipBuf, item);
			return { status: item.status };
		}
		else if (item.status === 'in_parole') {
			if (now < item.endTime) {
				await this.blacklistDb.remove(ipBuf);
				return { status: 'friendly' };
			}
			return { status: item.status };
		}
		else {
			return { status: 'friendly' };
		}
	}

	async addPeer(ipPortStr: string, isPermanent: boolean = false) {
		let ipPortBuf = ipPortStrToBuf(ipPortStr);
		if (!ipPortBuf) {
			return false;
		}
		let peer = this.peerDb.get(ipPortBuf);
		if (peer) {
			return false;
		}
		let now = Date.now();
		return await this.peerDb.put(ipPortBuf, { addTime: now, updateTime: now, services: 0n, version: 0, subVersion: '0.0.0', relay: false, permanent: isPermanent });
	}

	async deletePeer(ipPortStr: string) {
		let ipPortBuf = ipPortStrToBuf(ipPortStr);
		if (!ipPortBuf) {
			return false;
		}

		return await this.peerDb.remove(ipPortBuf);
	}

	getPeerList() {
		let list = [];
		for (let { key, value } of this.peerDb.getRange({ start: ipPortStart, end: ipPortEnd, snapshot: false })) {
			list.push(Object.assign({ status: value }, ipPortBufToObj(key)));
		}

		return list;
	}

	getPeer(ipPortStr: string) {
		let ipPortBuf = ipPortStrToBuf(ipPortStr);
		if (!ipPortBuf) {
			return false;
		}

		let data = this.peerDb.get(ipPortBuf);
		if (!data) {
			return false;
		}

		return Object.assign({ status: data }, ipPortBufToObj(ipPortBuf));
	}

	async updatePeer(ipPortStr: string, updateTime: number, version: number, subVersion: string, services: bigint, relay: boolean) {
		let ipPortBuf = ipPortStrToBuf(ipPortStr);
		if (!ipPortBuf) {
			return false;
		}
		let data = this.peerDb.get(ipPortBuf);
		if (!data) {
			return false;
		}
		if (updateTime > data.updateTime) {
			data.updateTime = updateTime;
		}
		if (typeof version === 'number') {
			data.version = version;
		}
		if (typeof subVersion === 'string') {
			data.subVersion = subVersion;
		}
		if (typeof services === 'bigint') {
			data.services = services;
		}
		if (typeof relay === 'boolean') {
			data.relay = relay;
		}

		return await this.peerDb.put(ipPortBuf, data);
	}

	async updatePeerTime(ipPortStr: string, updateTime: number) {
		let ipPortBuf = ipPortStrToBuf(ipPortStr);
		if (!ipPortBuf) {
			return false;
		}
		let data = this.peerDb.get(ipPortBuf);
		if (!data) {
			return false;
		}
		if (updateTime > data.updateTime) {
			data.updateTime = updateTime;
		}

		return await this.peerDb.put(ipPortBuf, data);
	}

	async updatePeerServices(ipPortStr: string, services: bigint) {
		let ipPortBuf = ipPortStrToBuf(ipPortStr);
		if (!ipPortBuf) {
			return false;
		}
		let data = this.peerDb.get(ipPortBuf);
		if (!data) {
			return false;
		}
		if (typeof services === 'bigint') {
			data.services = services;
		}

		return await this.peerDb.put(ipPortBuf, data);
	}

	async updatePeerIsRelay(ipPortStr: string, relay: boolean) {
		let ipPortBuf = ipPortStrToBuf(ipPortStr);
		if (!ipPortBuf) {
			return false;
		}
		let data = this.peerDb.get(ipPortBuf);
		if (!data) {
			return false;
		}
		if (typeof relay === 'boolean') {
			data.relay = relay;
		}

		return await this.peerDb.put(ipPortBuf, data);
	}

	async updatePeerVersion(ipPortStr: string, version: number) {
		let ipPortBuf = ipPortStrToBuf(ipPortStr);
		if (!ipPortBuf) {
			return false;
		}
		let data = this.peerDb.get(ipPortBuf);
		if (!data) {
			return false;
		}
		if (typeof version === 'number') {
			data.version = version;
		}

		return await this.peerDb.put(ipPortBuf, data);
	}

	async updatePeerSubVersion(ipPortStr: string, subVersion: string) {
		let ipPortBuf = ipPortStrToBuf(ipPortStr);
		if (!ipPortBuf) {
			return false;
		}
		let data = this.peerDb.get(ipPortBuf);
		if (!data) {
			return false;
		}
		if (typeof subVersion === 'string') {
			data.subVersion = subVersion;
		}

		return await this.peerDb.put(ipPortBuf, data);
	}
}

export { P2pStatusDb, ipStrToBuf, ipBufToStr, ipPortStrToBuf, ipPortBufToObj };