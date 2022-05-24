import path from 'path';
import * as dns from 'dns';
import { isIPv4, isIPv6, Socket } from 'net';
import { networkInterfaces, type } from 'os';
import {
	interfaceNetwork, interfaceNetworkAddress
} from '../lib/interface';
import P2PMessage from '../message/message';
import { P2pStatusDb } from '../p2pStatusDb';
import Param from '../p2pParam';

const SocketTimeout = Param.network.SocketTimeout;
const ListenPort = Param.network.ListenPort;
const RetentionTimeOfNode = Param.limitTime.RetentionTimeOfNode;
const NetworkInterfaces = networkInterfaces();
var localAddress: string[] = [];
for (let i in NetworkInterfaces) {
	let item = NetworkInterfaces[i];
	if (Array.isArray(item)) {
		item.forEach(element => {
			localAddress[localAddress.length] = element.address;
		});
	}
}
interface interfaceConnectTimeout {
	[key: string]: {
		timeoutCount: number;
		lastConnectTime: number;
	}
}
class P2PAddress {
	network: interfaceNetwork;
	#permanentNode: interfaceNetworkAddress[];
	#p2pStatusDb: P2pStatusDb;
	#connectTimeoutCache: interfaceConnectTimeout;
	constructor(network: interfaceNetwork, dbDir: string = path.join(process.cwd(), 'peers')) {
		this.network = network;
		this.#permanentNode = [];
		this.#p2pStatusDb = new P2pStatusDb(dbDir);
		this.#connectTimeoutCache = {};
	}

	initialize() {
		if (Array.isArray(this.network.ip)) {
			this.network.ip.map((item: string | interfaceNetworkAddress) => {
				if (!item) return;
				if (typeof item === 'string') {
					this.#addPermanentNode(item);
				}
				else if (typeof item === 'object') {
					this.#addPermanentNode(item.ip, item.port);
				}
			});
		}

		let dnsSeeds = this.network.dnsSeeds;
		if (Array.isArray(dnsSeeds)) {
			for (let i = 0; i < dnsSeeds.length; i++) {
				P2PAddress.resolveDnsSeed(dnsSeeds[i]);
			}
		}
	}

	/**
	 * Resolve DNS seed.
	 * @param {string} seed url
	 */
	static resolveDnsSeed(seed: string) {
		dns.resolve(seed, (err, ips) => {
			if (err) return;
			P2PMessage.eventEmit('peerNewAddr', undefined, ips);
		});
	}

	static ipv4ToIpv6(ip: string): string | false {
		if (isIPv6(ip)) return ip;
		else if (!isIPv4(ip)) return false;

		let ipv4Data = ip.split('.');
		for (let i = 0; i < ipv4Data.length; i++) {
			let item = ipv4Data[i];
			ipv4Data[i] = (parseInt(item)).toString(16).toLowerCase().padStart(2, '0');
		}

		return '0000:0000:0000:0000:0000:ffff:' + ipv4Data[0] + ipv4Data[1] + ':' + ipv4Data[2] + ipv4Data[3];
	}

	static ipv6ToIpv4(ip: string): string | false {
		if (isIPv4(ip)) return ip;
		else if (!isIPv6(ip)) return false;

		ip = ip.toLowerCase();
		if (ip.includes('::ffff:') || ip.includes('0000:0000:0000:0000:ffff:') || ip.includes('0:0:0:0:ffff:')) {
			let ipv4Data = ip.split(':ffff:')[1];
			if (isIPv4(ipv4Data)) return ipv4Data;
			let ipv4Hex = ipv4Data.split(':');
			let frontHex = Buffer.alloc(2);
			let behindHex = Buffer.alloc(2);

			frontHex.writeUInt16BE(parseInt(ipv4Hex[0], 16));
			behindHex.writeUInt16BE(parseInt(ipv4Hex[1], 16));

			let ipv4 = frontHex.readUInt8(0) + '.' + frontHex.readUInt8(1) + '.' + behindHex.readUInt8(0) + '.' + + behindHex.readUInt8(1);
			frontHex = undefined;
			behindHex = undefined;
			return ipv4;
		}
		else {
			return false;
		}
	}

	static formatIpv6(ip: string): string | false {
		if (isIPv6(ip)) {
			if (ip.split('.').length === 4 && ip.toLowerCase().includes(':ffff:')) {
				ip = ip.split(':ffff:')[1];
			}
		}
		if (isIPv4(ip)) {
			let ipv6 = P2PAddress.ipv4ToIpv6(ip);
			if (!ipv6) return false;
			ip = ipv6;
		}
		else if (!isIPv6(ip)) {
			return false;
		}

		let ipv6Data = ip.split(':');
		if (ipv6Data[0] === '') ipv6Data[0] = '0000';
		for (let i = 0; i < ipv6Data.length; i++) {
			if (ipv6Data[i] === '') {
				let createNum = 9 - ipv6Data.length;
				let addData = '0000';
				for (let j = 1; j < createNum; j++) {
					addData += ':0000';
				}
				ipv6Data[i] = addData;
			}
			else {
				ipv6Data[i] = ipv6Data[i].padStart(4, '0');
			}
		}

		return ipv6Data.join(':');
	}

	/**
	 * Check if the IP is local.
	 * @param {string} ip
	 * @returns {boolean}
	 */
	static isLocal(ip: string): boolean {
		if (isIPv6(ip)) {
			if (ip.includes('.')) {
				let ipv4mapped = ip.split(':ffff:')[1];
				if (ipv4mapped && localAddress.includes(ipv4mapped)) {
					return true;
				}
				else if (localAddress.includes(ip)) {
					return true;
				}
			}
			else if (localAddress.includes(ip)) {
				return true;
			}
		}
		else if (isIPv4(ip) && localAddress.includes(ip)) {
			return true;
		}

		return false;
	}

	/**
	 * Check if the IP is private.
	 * @param {string} ip
	 * @returns {boolean}
	 */
	static isPrivate(ip: string): boolean {
		let isPrivateIp = ip.match(/(^127\.)|(^192\.168\.)|(^10\.)|(^172\.1[6-9]\.)|(^172\.2[0-9]\.)|(^172\.3[0-1]\.)|(^::1$)|(^[fF][cCdD])/);
		if (Array.isArray(isPrivateIp) && isPrivateIp.length > 0) {
			return true;
		}
		else {
			return false;
		}
	}

	/**
	 * Formatting ip + port as a string.
	 * @param {string} ip ipv4 or ipv6
	 * @param {number} port
	 * @returns {string}
	 */
	static getIpPortString(ip: string, port?: number): string {
		if (typeof port !== 'number') {
			port = ListenPort;
		}
		return P2PAddress.formatIpv6(ip) + ':' + port.toString(16);
	}

	/**
	 * Format the connection address and check the contents.
	 * @param {string | interfaceNetworkAddrBasic} data 
	 * @returns {interfaceNetworkAddrBasic | null}
	 */
	static FormatNetworkData(data: string | interfaceNetworkAddress): interfaceNetworkAddress | null {
		let networkData: interfaceNetworkAddress = {
			ip: '',
			port: ListenPort
		};

		if (typeof data === 'string') {
			if (isIPv6(data) || isIPv4(data)) {
				networkData.ip = data;
			}
			else {
				return null;
			}
		}
		else {
			networkData = data;
		}

		if (P2PAddress.isLocal(networkData.ip)) {
			return null;
		}
		if (typeof networkData?.port !== 'number'
			|| networkData.port < 1 || networkData.port > 65535) {
			networkData.port = ListenPort;
		}
		networkData.ipPortStr = P2PAddress.getIpPortString(networkData.ip, networkData.port);
		return networkData;
	}

	/**
	 * add peer in db.
	 * @param {string} ipPortStr (ip + port) string
	 * @returns boolean
	 */
	async #addPeer(ip: string, port: number, ipPortStr: string): Promise<boolean> {
		if (!ipPortStr || typeof ipPortStr !== 'string') return false;
		let ipv4 = P2PAddress.ipv6ToIpv4(ip);

		// The private ip cannot be added to the list
		if ((typeof ipv4 === 'string' && P2PAddress.isPrivate(ipv4)) || P2PAddress.isPrivate(ip)) {
			return true;
		}
		return await this.#p2pStatusDb.addPeer(ipPortStr, false);
	}

	async #addPermanentNode(ip: string, port?: number) {
		if (typeof port !== 'number') port = ListenPort;
		let networkData = P2PAddress.FormatNetworkData({ ip, port });
		if (networkData && networkData.ipPortStr) {
			await this.#p2pStatusDb.addPeer(networkData.ipPortStr, true);
		}
	}

	/**
	 * get all peer's list
	 * @returns 
	 */
	getPeerList(): interfaceNetworkAddress[] {
		let peerList = this.#p2pStatusDb.getPeerList();
		if (Array.isArray(peerList)) {
			return peerList.concat(this.#permanentNode);
		}
		else {
			return this.#permanentNode;
		}
	}
	/**
	 * search peer by ipPortStr
	 * @param {string} ipPortStr (ip + port) string
	 * @returns 
	 */
	getPeer(ipPortStr: string) {
		return this.#p2pStatusDb.getPeer(ipPortStr);
	}

	/**
	 * Update the last communication time of the peer
	 * @param {string} ipPortStr (ip + port) string
	 * @param {number} updateTime now Date ms
	 * @returns 
	 */
	updatePeerTime(ipPortStr: string, updateTime: number) {
		return this.#p2pStatusDb.updatePeerTime(ipPortStr, updateTime);
	}
	/**
	 * Update the services of the peer
	 * @param ipPortStr string - (ip + port) string
	 * @param services bigint - services data
	 * @returns 
	 */
	updatePeerServices(ipPortStr: string, services: bigint) {
		return this.#p2pStatusDb.updatePeerServices(ipPortStr, services);
	}
	/**
	 * Update whether the peer is a relay
	 * @param {string} ipPortStr (ip + port) string
	 * @param {boolean} relay the peer is relay node
	 * @returns 
	 */
	updatePeerIsRelay(ipPortStr: string, relay: boolean) {
		return this.#p2pStatusDb.updatePeerIsRelay(ipPortStr, relay);
	}
	/**
	 * Update the data of the peer
	 * @param {string} ipPortStr (ip + port) string
	 * @param {number} updateTime now Date ms
	 * @param {bigint} services services data
	 * @param {boolean} relay the peer is relay node
	 * @returns 
	 */
	updatePeer(ipPortStr: string, updateTime: number, services: bigint, relay: boolean) {
		return this.#p2pStatusDb.updatePeer(ipPortStr, updateTime, services, relay);
	}

	/**
	 * Delete the node if it fails to reach 10 times.
	 * @param {string} ipPortStr (ip + port) string
	 * @param {boolean} isTimeout if true, add timeout count.
	 * @returns 
	 */
	connectTimeout(ipPortStr: string, isTimeout: boolean) {
		if (!isTimeout) {
			delete this.#connectTimeoutCache[ipPortStr];
			return;
		}
		if (!this.#connectTimeoutCache[ipPortStr]) {
			this.#connectTimeoutCache[ipPortStr] = {
				timeoutCount: 0,
				lastConnectTime: 0
			}
		}
		if (++this.#connectTimeoutCache[ipPortStr].timeoutCount > 9) {
			delete this.#connectTimeoutCache[ipPortStr];
			let data = this.getPeer(ipPortStr);
			if (data && typeof data.status?.updateTime === 'number'
				&& Date.now() > data.status.updateTime + RetentionTimeOfNode
				&& !data.status?.permanent) {
				this.deletePeer(ipPortStr);
			}
		}
		else {
			this.#connectTimeoutCache[ipPortStr].lastConnectTime = Date.now();
		}
	}

	deletePeer(ipPortStr: string) {
		return this.#p2pStatusDb.deletePeer(ipPortStr);
	}

	getBlackList() {
		return this.#p2pStatusDb.getBlackList();
	}

	async addBlackList(ip: string): Promise<false | { status: string; }> {
		let formatData = P2PAddress.formatIpv6(ip);
		if (formatData) {
			return await this.#p2pStatusDb.addBlackList(formatData);
		}
		return false;
	}

	deleteBlack(ip: string) {
		return this.#p2pStatusDb.deleteBlackList(ip);
	}

	async checkIpStatus(ip: string): Promise<{ status: string; } | null> {
		let formatData = P2PAddress.formatIpv6(ip);
		if (formatData) {
			return await this.#p2pStatusDb.checkIpStatus(ip);
		}
		else {
			return null;
		}
	}

	#tryConnect(ip: string, port: number): Promise<interfaceNetworkAddress> {
		return new Promise(res => {
			let ipPort = P2PAddress.getIpPortString(ip, port);
			let existData = this.getPeer(ipPort);
			if (existData && typeof existData === 'object') {
				return res({
					err: true,
					ip,
					port
				});
			}
			let socket = new Socket();
			socket.setTimeout(SocketTimeout);
			socket.on('ready', async () => {
				let addData = await this.#addPeer(ip, port, ipPort);
				if (addData) {
					res({
						err: false,
						ip,
						port
					});
				}
				else {
					res({
						err: true,
						ip: '',
						port: 0
					});
				}
				socket.destroy();
			});
			let cannotConnect = () => {
				socket.destroy();
				res({
					err: true,
					ip: '',
					port: 0
				});
			}
			socket.on('timeout', cannotConnect);
			socket.on('error', cannotConnect);
			socket.connect(port, ip);
		});
	}

	async addConnect(ips: Array<string | interfaceNetworkAddress> | interfaceNetworkAddress): Promise<interfaceNetworkAddress[]> {
		let tryConnect = [];
		if (Array.isArray(ips)) {
			tryConnect = ips;
		}
		else {
			tryConnect = [ips];
		}
		let returnData = [];
		for (let i = 0; i < tryConnect.length; i++) {
			if (!tryConnect[i]) continue;
			let networkData = P2PAddress.FormatNetworkData(tryConnect[i]);
			if (!networkData) continue;
			returnData[returnData.length] = this.#tryConnect(networkData.ip, networkData.port);
		}

		return Promise.all(returnData);
	}
}

export default P2PAddress;