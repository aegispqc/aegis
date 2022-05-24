import * as net from 'net';
import { randomBytes, randomInt } from 'crypto';
import { EventEmitter } from 'events';
import {
	interfaceNetwork, interfaceNetworkAddress, Option
} from './lib/interface';
import * as BlockUtils from './message/utils/block';
import AddrTable from './utils/addrTable';
import Peer from './peer';
import P2PMessage from './message/message';
import Param from './p2pParam';
import { Task } from '../task';
import P2PAddress from './utils/addrTable';
import { delay } from '../blockchain/util';

interface interfaceConnectionObject {
	[key: string]: Peer;
}

const ListenPort = Param.network.ListenPort || 51977;
const TimeToCheckConnection = Param.network.TimeToCheckConnection || 300000;
const ActiveConnection = Param.network.percentOfActiveConnection || 6.25;
const SocketTimeout = Param.network.SocketTimeout || 30000;
const AliveAddr = Param.limitTime.AliveAddr || 3600000;
const FillConnect = Param.limitTime.FillConnect || 60000;
const HeartbeatTime = Param.limitTime.Heartbeat || 60000;
export default class P2P {
	readonly #network: interfaceNetwork;
	readonly #task: Task;
	readonly #p2pEvent: EventEmitter;
	readonly uid: Buffer;
	#fillConnectTime: number;
	#flagBlockInSync: boolean;
	#addrTable: AddrTable;
	#lastBlock: { height: number, hash: Buffer };
	#connectedIp: interfaceConnectionObject;
	// #connectCache: { [key: string]: number };
	#connectCache: interfaceConnectionObject;
	#server?: net.Server;
	readonly #maxConnectAmount: number;
	readonly #activeConnectAmount: number;
	#connectedType: { active: number, passive: number }
	#p2pOpt: Option;
	#services: boolean[];
	#servicesData: bigint;
	#syncBlockQueue: any[];
	#flagInitialize: boolean;
	#flagBeingFilledConnect: boolean;
	#flagPolling: boolean;
	constructor(network: interfaceNetwork, task: Task, option: Option, servicesOpt: Option) {
		this.#network = network;
		this.#task = task;
		this.#p2pEvent = task.eventEmit;
		// your uid
		this.uid = randomBytes(32);
		// limit fill connect time 
		this.#fillConnectTime = 0;
		// block in sync
		this.#flagBlockInSync = false;
		// address table
		this.#addrTable = new AddrTable(network, option.peerDir);
		// last block
		this.#lastBlock = {
			height: 0,
			hash: Buffer.alloc(0)
		};
		// connected peer
		this.#connectedIp = {};
		// connecting peer (no handshake yet)
		this.#connectCache = {};
		// net server
		this.#server;
		this.#maxConnectAmount = option.maxConnect || 256;
		this.#activeConnectAmount = Math.ceil(this.#maxConnectAmount * ActiveConnection / 100);
		this.#connectedType = {
			active: 0,
			passive: 0
		}

		this.#p2pOpt = option;
		this.#syncBlockQueue = [];
		// flag
		this.#flagInitialize = false;
		this.#flagPolling = true;
		this.#flagBeingFilledConnect = false;
		// services
		this.#services = [servicesOpt.fullnode].reverse();
		this.#servicesData = 0n;
		let servicesDataTemp = 1n;
		// 
		for (let i = 0; i < this.#services.length; i++) {
			if (this.#services[i]) {
				this.#servicesData += servicesDataTemp;
			}
			servicesDataTemp *= 2n;
		}
	}

	async initialize(): Promise<boolean> {
		if (this.#flagInitialize !== false) return false;
		this.#flagInitialize = true;
		this.#addrTable.initialize();

		let lastBlock = await this.#task.getLastBlock();
		if (!lastBlock) {
			this.#p2pEvent.emit('p2pError', { label: 'block', text: 'Get the last block error by p2p initialization.' });
			return false;
		}
		this.#lastBlock = {
			hash: lastBlock.hash,
			height: lastBlock.height
		};
		this.peerEventListener();
		this.p2pEventListener();
		this.#connectPolling();
		this.#Heartbeat();
		return true;
	}

	async #connectPolling() {
		while (this.#flagPolling) {
			this.#clearConnectCache();
			this.checkConnected();
			if (this.length === 0) {
				await delay(30000);
			}
			else {
				await delay(TimeToCheckConnection);
			}
		}
	}

	async #Heartbeat() {
		while (this.#flagPolling) {
			for (let i in this.#connectedIp) {
				if (!this.#connectedIp[i]) continue;
				this.#connectedIp[i].sendMessage('ping');
				await delay(50);
			}
			await delay(HeartbeatTime);
		}
	}

	/**
	 * Get connected peer amount.
	 * @returns {number} Number of the peer connections.
	 */
	get length(): number {
		return Object.keys(this.#connectedIp).length;
	}

	/**
	 * The server can receive other peer connections.
	 * @returns {boolean} Whether the server activation successful or not.
	 */
	serverOn(port: number): boolean {
		if (this.#server) {
			console.log('The server is up.');
			return false;
		}
		else if (port < 1 || port > 65535) {
			port = ListenPort;
		}
		this.#server = net.createServer({},
			async (socket: net.Socket) => {
				if (!socket.remoteAddress || typeof socket.remotePort !== 'number') {
					return socket.destroy();
				}
				if (this.length >= this.#maxConnectAmount) {
					return socket.destroy();
				}
				let ipStatus = await this.#addrTable.checkIpStatus(socket.remoteAddress);
				if (ipStatus && ipStatus.status === 'in_jail') {
					return socket.destroy();
				}
				let peer = this.#createPeer({
					ip: socket.remoteAddress,
					port: socket.remotePort
				}, socket);
				if (!peer) {
					return socket.destroy();
				}
				else if (this.#flagBlockInSync === true) {
					peer.lockSyncBlock('');
				}
			});
		this.#server.listen(port);
		return true;
	}

	p2pEventListener() {
		this.#p2pEvent.on('addTx', async (data: { txid: Buffer, mining: boolean }) => {
			if (Buffer.isBuffer(data.txid)) {
				this.broadcast('inv', { '1': [data.txid] });
			}
		});

		this.#p2pEvent.on('newBlock', async (blockHash: Buffer) => {
			if (!Buffer.isBuffer(blockHash)) return;
			await this.#updateLastHeight();
			if (this.#flagBlockInSync) {
				this.#map((peer: Peer) => {
					peer.lastBlock = this.#lastBlock;
				});
			}
			else {
				let getblocksData = await BlockUtils.getblocksData(this.#task, this.#lastBlock.height);
				this.#map((peer: Peer) => {
					peer.lastBlock = this.#lastBlock;
					peer.resyncAfterNewBlock(getblocksData);
				});
			}
		});
	}

	peerEventListener() {
		/**
		 * Connect after handshaked success.
		 * Check if the maximum number of connections is exceeded.
		 * Check if it is a blacklist.
		 * 
		 * If the peer can be connected, try to connect and add in connectable table.
		 */
		P2PMessage.eventOn('peerConnected', async (peer: Peer, addrSource) => {
			let ipPortStr = peer.ipPortStr;
			if (this.#connectCache[ipPortStr]) {
				this.#connectCache[ipPortStr] = undefined;
			}
			this.#addrTable.connectTimeout(ipPortStr, false);
			if (this.length > this.#maxConnectAmount) {
				let addrs = this.getAliveAddr();
				let disconnectPeer = peer;
				if (!peer.isPassiveConnect) {
					let passivePeer = this.#getRandomPassivePeer();
					if (passivePeer) {
						disconnectPeer = passivePeer;
					}
				}
				disconnectPeer.sendMessage('addr', addrs);
				setTimeout(() => {
					disconnectPeer.disconnect();
				}, 100);
				return;
			}
			else {
				let uid = addrSource.uid;
				let ipStatus = await this.#addrTable.checkIpStatus(peer.ip);
				if (this.#connectedIp[uid]) {
					let isAlive = await this.#connectedIp[uid].checkPeerAlive();
					if (isAlive) {
						peer.sendMessage('reject', 'invalidUidDuplicate');
						setTimeout(() => {
							peer.disconnect();
						}, 100);
						return;
					}
					else {
						this.#connectedIp[uid].disconnect();
						delete this.#connectedIp[uid];
						this.#connectedIp[uid] = peer;
					}
				}
				else if (ipStatus?.status === 'in_jail') {
					peer.sendMessage('reject', 'invalidpeerIsMalicious');
					setTimeout(() => {
						peer.disconnect();
					}, 100);
					return;
				}
				else if (this.#checkIpPortDuplicate(ipPortStr)) {
					peer.sendMessage('reject', 'invalidUidDuplicate');
					setTimeout(() => {
						peer.disconnect();
					}, 100);
					return;
				}
				else {
					this.#connectedIp[uid] = peer;
				}
			}
			if (peer.isPassiveConnect) {
				this.#connectedType.passive++;
			}
			else {
				this.#connectedType.active++;
			}
			this.#p2pEvent.emit('p2pConnection', { ip: peer.ip, port: peer.port });
			if (typeof addrSource?.listenPort === 'number' && addrSource.listenPort !== peer.port) {
				let canConnect = await this.#addrTable.addConnect({
					ip: peer.ip,
					port: addrSource.listenPort
				});
				if (canConnect[0] && typeof canConnect[0] === 'object' && canConnect[0].port > 0) {
					peer.setListenPort(addrSource.listenPort);
				}
			}
			this.#addrTable.updatePeer(ipPortStr, Date.now(), addrSource.services, addrSource.relay)
		});

		/**
		 * The peer disconnect
		 * If the peer is malicious, limit connection.
		 * If the peer timeout count exceeds the specified number of times,  deleted from the connectable table.
		 */
		P2PMessage.eventOn('peerDisconnect', (peer: Peer, isMalicious: boolean, isTimeout?: boolean) => {
			let uid = peer.yourUid;
			let ipPortStr = peer.ipPortStr;
			if (this.#connectCache[ipPortStr]) {
				if (typeof this.#connectCache[ipPortStr]?.disconnect === 'function') {
					this.#connectCache[ipPortStr].disconnect();
				}
				this.#connectCache[ipPortStr] = undefined;
			}
			if (isMalicious) {
				this.#addrTable.addBlackList(peer.ip);
			}
			if (isTimeout) {
				this.#addrTable.connectTimeout(peer.ipPortStr, true);
			}
			if (this.#connectedIp[uid] && this.#connectedIp[uid].ipPortStr === peer.ipPortStr) {
				if (peer.isPassiveConnect) {
					this.#connectedType.passive--;
				}
				else {
					this.#connectedType.active--;
				}
				this.#connectedIp[uid].disconnect();
				delete this.#connectedIp[uid];
			}
			this.#p2pEvent.emit('p2pDisconnection', { ip: peer.ip, port: peer.port, isMalicious, isTimeout });
			this.#fillConnect();
		});

		/**
		 * The uid duplicate
		 */
		P2PMessage.eventOn('peerUidDuplicate', async (peer: Peer, data: any) => {
			if (peer.isPassiveConnect === true) return;
			let uidPeers = this.#getPeersByUid(peer.yourUid);
			for (let i = 0; i < uidPeers.length; i++) {
				if (uidPeers[i].ipPortStr === peer.ipPortStr) continue;
				uidPeers[i].addUidInterdependent(peer.ipPortStr);
			}
		});

		/**
		 * Get new address.
		 */
		P2PMessage.eventOn('peerNewAddr', async (peer: Peer, ips: any[]) => {
			let result = await this.#addrTable.addConnect(ips);
			this.#connect(result);
		});

		/**
		 * Request addresses.
		 */
		P2PMessage.eventOn('peerGetAddr', (peer: Peer) => {
			let addrs = this.getAliveAddr();
			peer.sendMessage('addr', addrs);
		});

		P2PMessage.eventOn('peerAskForSyncBlock', async (peer: Peer, data: any) => {

			if (!data || typeof data !== 'object'
				|| !Buffer.isBuffer(data.knownLastHash)
				|| typeof data.knownLastHeight !== 'number'
				|| !Array.isArray(data.blockHash)) {
				return;
			}
			this.#syncBlockQueue.push({
				// ipPort: peer.ipPortStr,
				uid: peer.yourUid,
				data
			});
			if (this.#flagBlockInSync !== true) {
				this.#blockPeerSyncBlock(data.blockHash.length);
			}
		});

		/**
		 * Block synchronization completed.
		 */
		P2PMessage.eventOn('peerBlockSyncFinish', async (peer: Peer, err: boolean) => {
			this.#syncBlockQueue = [];
			await this.#updateLastHeight();
			let getblocksData = await BlockUtils.getblocksData(this.#task, this.#lastBlock.height);
			this.#unlockPeerSyncBlock(getblocksData);
		});
	}

	updateConnectedType() {
		let active = 0;
		let passive = 0;
		this.#map((peer) => {
			if (peer.isPassiveConnect) {
				passive++;
			}
			else {
				active++;
			}
		})
		this.#connectedType.passive = passive;
		this.#connectedType.active = active;
	}

	#clearConnectCache() {
		let nowDate = Date.now();
		for (let i in this.#connectCache) {
			if (!this.#connectCache[i]) {
				delete this.#connectCache[i];
			}
			else if (nowDate > this.#connectCache[i].networkStatus.time.start + SocketTimeout * 6) {
				this.#connectCache[i].disconnect(true, false);
			}
		}
	}
	/**
	 * check connected peer
	 */
	checkConnected() {
		this.updateConnectedType();
		if (this.#activeConnectAmount > this.#connectedType.active) {
			this.broadcast('getaddr');
			this.#fillConnect();
		}
		this.#map((peer) => {
			this.#addrTable.updatePeerTime(peer.ipPortStr, peer.networkStatus.time.lastComm);
		});
	}

	async #updateLastHeight(): Promise<boolean> {
		let lastBlock = await this.#task.getLastBlock();
		if (!lastBlock) return false;
		this.#lastBlock = {
			height: lastBlock.height,
			hash: lastBlock.hash
		};
		return true;
	}

	#blockPeerSyncBlock(syncAmount) {
		this.#flagBlockInSync = true;
		setTimeout(() => {
			let length = this.#syncBlockQueue.length;
			randomInt(length, length * 3, (err, n) => {
				let tokenIndex = 0;
				if (!err) tokenIndex = n % length;
				// let tokenIpPort = this.#syncBlockQueue[tokenIndex].ipPort;
				let tokenUid = this.#syncBlockQueue[tokenIndex].uid;
				let tokenPeer = this.#connectedIp[tokenUid];
				if (!tokenPeer) {
					let i = 0;
					for (; i < length; i++) {
						tokenIndex = i;
						// tokenIpPort = this.#syncBlockQueue[tokenIndex].ipPort;
						tokenUid = this.#syncBlockQueue[tokenIndex].uid;
						tokenPeer = this.#connectedIp[tokenUid];
						if (tokenPeer && tokenPeer.networkStatus.socketStatus !== -1) {
							break;
						}
					}
					if (i === length) {
						P2PMessage.eventEmit('peerBlockSyncFinish', undefined, true);
						return;
					}
				}
				let r = tokenPeer.syncBlockProcess(this.#syncBlockQueue[tokenIndex].data);
				if (r === false) {
					P2PMessage.eventEmit('peerBlockSyncFinish', tokenPeer, true);
				}
				else {
					this.#map((peer: Peer) => {
						peer.lockSyncBlock(tokenUid);
					});
				}
			});
		}, Math.min(syncAmount * 100, 1000));
	}

	#unlockPeerSyncBlock(lastGetblocksData?: Buffer[]) {
		this.#flagBlockInSync = false;
		let lastBlock = this.#lastBlock;
		this.#map((peer: Peer) => {
			peer.lastBlock = lastBlock;
			peer.unlockSyncBlock();
			if (lastGetblocksData) {
				peer.resyncAfterNewBlock(lastGetblocksData);
			}
		});
	}

	broadcast(cmd: string, message?: any) {
		this.#map((peer: Peer) => {
			peer.sendMessage(cmd, message);
		});
	}

	getAliveAddr(): interfaceNetworkAddress[] {
		let aliveTime = Date.now() - AliveAddr;
		let addrs = this.#addrTable.getPeerList();
		let aliveAddr = [];
		for (let i = 0; i < addrs.length; i++) {
			let item = addrs[i];
			if (item.status?.updateTime && aliveTime > item.status.updateTime) continue;
			aliveAddr[aliveAddr.length] = item;
		}
		return aliveAddr;
	}

	async #fillConnect() {
		if (this.#flagBeingFilledConnect === false
			&& this.#activeConnectAmount > this.#connectedType.active
			&& Date.now() > this.#fillConnectTime + FillConnect) {
			this.#flagBeingFilledConnect = true;
			let list = this.#addrTable.getPeerList();
			let i = 0;
			let connectQueue = [];
			while (i < list.length) {
				let remoteNetwork = this.#checkPeer(list[i]);
				if (remoteNetwork && !this.#checkUidInterdependent(remoteNetwork.ipPortStr)) {
					connectQueue[connectQueue.length] = remoteNetwork;
				}
				i++;
				if (i >= list.length || connectQueue.length >= this.#activeConnectAmount) {
					this.#connect(connectQueue);
					await delay(SocketTimeout);
					if (i >= list.length || this.#activeConnectAmount <= this.#connectedType.active) {
						break;
					}
					else {
						connectQueue = [];
					}
				}
			}
			this.#fillConnectTime = Date.now();
			this.#flagBeingFilledConnect = false;
		}
	}

	#checkPeer(netAddr: interfaceNetworkAddress, socket?: net.Socket): interfaceNetworkAddress | null {
		if (!netAddr || typeof netAddr !== 'object' || netAddr.err
			|| typeof netAddr.ip !== 'string' || typeof netAddr.port !== 'number') return null;
		let remoteNetwork = AddrTable.FormatNetworkData(netAddr);
		if (!remoteNetwork) return null;
		else if (this.#checkIpPortDuplicate(remoteNetwork.ipPortStr)) return null;
		else if (!socket && this.#connectCache[remoteNetwork.ipPortStr]
			&& Date.now() < this.#connectCache[remoteNetwork.ipPortStr].networkStatus.time.lastComm + SocketTimeout * 4) {
			return null;
		}
		else return remoteNetwork;
	}

	#checkUidInterdependent(ipPortStr: string): boolean {
		for (let i in this.#connectedIp) {
			if (Array.isArray(this.#connectedIp[i].uidInterdependent)
				&& this.#connectedIp[i].uidInterdependent.includes(ipPortStr)) {
				return true;
			}
		}
		return false;
	}

	#checkIpPortDuplicate(ipPort: string): boolean {
		for (let i in this.#connectedIp) {
			if (this.#connectedIp[i].ipPortStr === ipPort) {
				return true;
			}
		}
		return false;
	}

	#createPeer(remoteNetwork: interfaceNetworkAddress, socket?: net.Socket): Peer | null {
		if (!remoteNetwork.ipPortStr) {
			remoteNetwork = this.#checkPeer(remoteNetwork, socket);
			if (!remoteNetwork || this.#checkUidInterdependent(remoteNetwork.ipPortStr)) {
				return null;
			}
		}
		let peer = new Peer(this.#network, this.#task,
			{
				addr: remoteNetwork,
				uid: this.uid,
				lastBlock: this.#lastBlock,
				relay: this.#p2pOpt.relay,
				listenPort: this.#p2pOpt.listenPort,
				socket
			},
			{
				list: this.#services,
				data: this.#servicesData
			});
		if (this.#flagBlockInSync === true) {
			peer.lockSyncBlock('');
		}
		if (!socket) {
			this.#connectCache[remoteNetwork.ipPortStr] = peer;
		}
		return peer;
	}

	#connect(ips: interfaceNetworkAddress[]) {
		if (Array.isArray(ips) && ips.length > 0) {
			for (let i = 0; i < ips.length; i++) {
				this.#createPeer(ips[i]);
			}
		}
	}

	#getRandomPassivePeer(): Peer | undefined {
		let passivePeers = [];
		this.#map((peer: Peer) => {
			if (peer.isPassiveConnect) {
				passivePeers.push(peer.yourUid);
			}
		});
		let randomIndex = Math.floor(Math.random() * passivePeers.length);
		return this.#connectedIp[passivePeers[randomIndex]];
	}

	#getPeersByUid(uid: string): Peer[] {
		let r = [];
		for (let i in this.#connectedIp) {
			if (this.#connectedIp[i].yourUid === uid) {
				r[r.length] = this.#connectedIp[i];
			}
		}
		return r;
	}

	displayAllStatus() {
		return this.#mapData((peer: Peer) => {
			return peer.status;
		})
	}

	#map(func: Function) {
		for (let i in this.#connectedIp) {
			if (!this.#connectedIp[i]) delete this.#connectedIp[i];
			func(this.#connectedIp[i]);
		}
	}

	#mapData(func: Function) {
		let data = [];
		for (let i in this.#connectedIp) {
			if (!this.#connectedIp[i]) delete this.#connectedIp[i];
			data[data.length] = func(this.#connectedIp[i]);
		}
		return data;
	}

	getConnections(): number {
		return this.length;
	}

	async addPeer(ip: string, port?: number): Promise<boolean> {
		let r = await this.#addrTable.addConnect({
			ip: ip,
			port: port || ListenPort
		});
		if (r[0] && r[0]?.ip !== '' && r[0]?.port !== 0) {
			this.#connect([{ ip: r[0].ip, port: r[0].port }]);
		}
		if (!r[0]?.err) {
			return true
		}
		return false;
	};

	async deletePeer(ip: string, port?: number): Promise<boolean> {
		let ipPortStr = P2PAddress.getIpPortString(ip, (port || ListenPort));
		let result = await this.#addrTable.deletePeer(ipPortStr);
		return result;
	};

	async getPeerList(): Promise<any[] | false> {
		return await this.#addrTable.getPeerList();
	};

	async addBlackList(ip: string): Promise<boolean> {
		let r = await this.#addrTable.addBlackList(ip);
		if (typeof r[0]?.status === 'string') {
			return true;
		}
		return false;
	};

	async deleteBlackList(ip: string): Promise<boolean> {
		return await this.#addrTable.deleteBlack(ip);
	};

	async getBlackList(): Promise<any[]> {
		return await this.#addrTable.getBlackList();
	};

	async getStatus(): Promise<{ amounts: number, list: any[] }> {
		let list = this.#mapData((peer: Peer) => {
			return peer.status;
		});
		return {
			amounts: this.length,
			list
		};
	};

	async exit() {
		console.log('p2p server exit');
		this.#flagPolling = false;
		this.#map((peer: Peer) => {
			console.log(`exit--${peer.ip}:${peer.port}`);
			peer.disconnect();
		});
		for (let i in this.#connectCache) {
			if (this.#connectCache[i]) {
				let peer = this.#connectCache[i];
				console.log(`exit--${peer.ip}:${peer.port} in cache`);
				this.#connectCache[i].disconnect();
			}
		}
		if (this.#server) {
			return new Promise(r => {
				this.#server.close(r);
			});
		}
		else {
			return;
		}
	}
}