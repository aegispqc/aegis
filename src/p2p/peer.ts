import * as net from 'net';
import {
	interfaceNetwork, interfaceNetworkAddress,
	interfaceNetworkVersion, Option, interfaceInvObject, interfaceServicesOpt
} from './lib/interface';

import * as BlockUtils from './message/utils/block';
import P2PMessage from './message/message';
import P2PAddress from './utils/addrTable';
import Param from './p2pParam';
import { Task } from '../task';
import BlockDataQueue from '../blockchain/blockDataQueue';
import BlockData from '../blockchain/blockData';
import BlockHeader from '../blockchain/blockHeader';
import { BlockTx } from '../blockchain/blockTx';

const MaxSyncBlockAmount = Param.block.MaxSyncBlockAmount || 100;
const LimitAccessAddressTime = Param.limitTime.GetAddr;
const SyncBlockTimeout = Param.limitTime.SyncBlockTimeout;
const SocketTimeout = Param.network.SocketTimeout || 30000;
const ConnectionTimeout = Param.network.ConnectionTimeout || 1800000;
const ListenPort: number = Param.network.ListenPort;
const PeerStatusList = ['connect', 'ready', 'error', 'timeout', 'close'];
const LockBlockCommand = ['block', 'headers'];

interface peerSetting {
	addr: interfaceNetworkAddress,
	uid: Buffer,
	lastBlock?: {
		height: number;
		hash: Buffer;
	}
	relay: boolean;
	listenPort?: number;
	socket?: net.Socket
}

class Peer {
	#task: Task;
	readonly myUid: Buffer;
	yourUid?: string;
	#message: P2PMessage;
	#socket: net.Socket;
	readonly addr: interfaceNetworkAddress;
	readonly ip: string;
	readonly port: number;
	readonly ipPortStr: string;
	readonly isPassiveConnect: boolean;
	readonly myListenPort: number;
	lastGetAddrTime: number;
	#myLastHeight: number;
	#myLastHash: Buffer;
	#yourVersion: number;
	#yourLastHeight: number;
	#blockSentHeight: number;
	#resendBlock: number;
	#isMalicious: boolean;
	#isConnectTimeout: boolean;
	#flagIsDisconnect: boolean;
	#flagForkReady: boolean;
	#flagRelay: boolean;
	#flagBlockInSync: boolean;
	#flagLockBlockSync: boolean;
	isRelayPeer: boolean;
	#blockDataQueue?: BlockDataQueue;
	#verifiedBlockHash?: Buffer;
	#verifiedBlockHeight?: number;
	#listenPort: number;
	uidInterdependent: string[];
	#waitForkDataQueue: BlockData[];
	#afterForkDataQueue: BlockData[];
	#connectTimeout?: ReturnType<typeof setTimeout>;
	#blockSyncTimeout?: ReturnType<typeof setTimeout>;
	constructor(network: interfaceNetwork, task: Task, setting: peerSetting, servicesOpt: interfaceServicesOpt) {
		this.#task = task;
		this.myUid = setting.uid;
		this.#message = new P2PMessage(network, task, servicesOpt, {
			disconnect: this.disconnect.bind(this),
			handshaked: this.#handshakedCallback.bind(this),
			parseBlockMessage: this.#parseSocketMessage.bind(this)
		});

		// net data
		this.ip = setting.addr.ip;
		this.port = setting.addr.port || ListenPort;
		this.ipPortStr = setting.addr.ipPortStr ? setting.addr.ipPortStr : P2PAddress.getIpPortString(this.ip, this.port);
		this.myListenPort = setting.listenPort || ListenPort;

		// send getaddr time
		this.lastGetAddrTime = 0;
		// peer is malicious
		this.#isMalicious = false;
		this.#isConnectTimeout = false;

		// last block
		if (setting.lastBlock) {
			this.#myLastHeight = setting.lastBlock.height ? setting.lastBlock.height : 0;
			this.#myLastHash = setting.lastBlock.hash ? setting.lastBlock.hash : Buffer.alloc(0);
		}
		this.#yourVersion = 0;
		this.#yourLastHeight = 0;
		// last sent block height
		this.#blockSentHeight = 0;
		// resend the same block
		this.#resendBlock = 0;

		// sync block data queue
		this.#blockDataQueue;
		// Hash value of the last verified block
		this.#verifiedBlockHash;
		// Height of the last verified block
		this.#verifiedBlockHeight;
		// uid's interdependent in address table
		this.uidInterdependent = [];
		// Waiting for a fork in the data queue
		this.#waitForkDataQueue = [];
		// Sync blocks after fork completion
		this.#afterForkDataQueue = [];
		// peer flow timeout
		this.#connectTimeout;
		// sync block timeout
		this.#blockSyncTimeout;

		// flags
		this.#flagIsDisconnect = false;
		this.#flagRelay = false;
		// Whether the block is in sync or not
		this.#flagBlockInSync = false;
		// Other peers are being synchronized
		this.#flagLockBlockSync = false;
		// Whether to prepare for fork
		this.#flagForkReady = false;
		// The peer can connect port
		this.#listenPort = -1;
		// The peer is Relay
		this.isRelayPeer = false;

		if (setting.socket) {
			this.isPassiveConnect = true;
			this.#socket = setting.socket;
			this.#netStatusProcess('connect');
			this.#netStatusProcess('ready');
			if (ConnectionTimeout > 0) {
				this.#socket.setTimeout(ConnectionTimeout);
			}
		}
		else {
			this.isPassiveConnect = false;
			this.#createSocket();
		}
		this.#message.setSocket(this.#socket);
		this.listenOn();
	}

	#emitEvent(event: string, ...args: any) {
		P2PMessage.eventEmit(event, this, ...args);
	}

	listenOn() {
		PeerStatusList.map(status_event => {
			this.#socket.on(status_event, msg => {
				this.#netStatusProcess(status_event, msg);
			});
		});
		this.#message.listenOn();
	}

	async checkPeerAlive(): Promise<boolean> {
		return await this.#message.pingAsync();
	}

	#createSocket() {
		this.#socket = new net.Socket();
		this.#socket.setTimeout(ConnectionTimeout);
		this.#listenPort = this.port;
		this.#socket.connect(this.port, this.ip);
	}

	disconnect(isMalicious: boolean = false, isTimeout: boolean = false) {
		if (this.#flagIsDisconnect) return;
		this.#flagIsDisconnect = true;
		this.#isMalicious = isMalicious;
		this.#isConnectTimeout = isTimeout;
		this.#message.disconnect();
		this.#socket.destroy();
		clearTimeout(this.#connectTimeout);
		this.sendMessage = (cmd: any, message?: any) => { };
	}

	get networkStatus() {
		return this.#message.status;
	}

	get status() {
		return {
			ip: this.ip,
			port: this.port,
			height: this.#yourLastHeight,
			version: this.#yourVersion,
			networkStatus: this.networkStatus,
			isRelayPeer: this.isRelayPeer,
			blockInSync: this.#flagBlockInSync,
			lockBlock: this.#flagLockBlockSync,
			listenPort: this.#listenPort
		}
	}

	async #commandProcess(command: string, payload?: any) {
		switch (command) {
			default:
				break;
			case 'getaddr':
				let DateNow = Date.now();
				if (this.lastGetAddrTime + LimitAccessAddressTime > DateNow) return;
				this.#emitEvent('peerGetAddr');
				break;
			case 'notfound':
				let notfound = payload?.data;
				if (!notfound || typeof notfound !== 'object') return;
				this.#notfoundProcess(notfound);
				break;
			case 'getdata':
				let getData = payload?.data;
				this.#getdataProcess(getData);
				break;
			case 'getblocks':
				let getblocks = payload?.data;
				if (!getblocks) return;
				let verifiedHeight = getblocks.verifiedHeight;
				if (typeof verifiedHeight !== 'number') {
					verifiedHeight = 0;
				}
				this.#getblocksProcess(verifiedHeight);
				break;
			case 'mempool':
				let poolList = await this.#task.getTxPoolList();
				if (!poolList || !Array.isArray(poolList.cache)) return;
				let memtx = [];
				let cache = poolList.cache;
				for (let i = 0; i < cache.length; i++) {
					let item = cache[i];
					if (item && typeof item === 'object' && typeof item.txid === 'string') {
						memtx[memtx.length] = Buffer.from(item.txid, 'hex');
					}
				}
				if (memtx.length > 0) {
					this._inv({ '1': memtx });
				}
				break;
			case 'inv':
				let inv = payload?.data;
				this.#invProcess(inv);
				break;
			case 'block':
				let block = payload?.data;
				if (!block || (!Buffer.isBuffer(block.header) && !Array.isArray(block.txs))) return;
				this.#blockProcess(block);
				break;
			case 'tx':
				let tx = payload?.data;
				if (!Buffer.isBuffer(tx)) return;
				let txClass = BlockTx.serializeToClass(tx);
				if (txClass) {
					await this.#task.addTx(txClass, true);
				}
				break;
			case 'reject':
				let rejectMsg = payload?.data;
				if (!rejectMsg) return;
				let ccode = rejectMsg.ccode;
				let ccodeLabel = ccode & 0x0f;
				let ccodeType = ccode >>> 4;
				this.#rejectProcess(ccodeType, ccodeLabel);
				break;
		}
	}

	async #netStatusProcess(status: string, msg?: any) {
		switch (status) {
			case 'connect':
			case 'end':
			default:
				break;
			case 'ready':
				this.#connectTimeout = setTimeout(() => {
					this.disconnect(false, true);
				}, SocketTimeout);
				this.#message.setSocketStatus('connecting');
				this._version();
				break;
			case 'close':
				if (this.#flagBlockInSync) {
					this.#blockSyncFinish(true);
				}
				this.#emitEvent('peerDisconnect', this.#isMalicious, this.#isConnectTimeout);
				break;
			case 'error':
				if (msg && typeof msg === 'object') {
					if (msg.code === 'ETIMEDOUT') {
						this.disconnect(false, true);
					}
					else {
						this.#error();
					}
				}
				else {
					this.#error();
				}
				break;
			case 'timeout':
				if (this.#message.status.socketStatus === 0) {
					// can't connect
					if (this.#listenPort === this.port) {
						this.#listenPort = -1;
					}
					this.#emitEvent('peerDisconnect', false, true);
					this.disconnect();
				}
				else {
					this._ping();
				}
				break;
		}
	}

	set lastBlock(blockData) {
		if (this.#flagBlockInSync) return;
		if (blockData && typeof blockData === 'object') {
			if (typeof blockData.height === 'number' && Buffer.isBuffer(blockData.hash)) {
				this.#myLastHeight = blockData.height;
				this.#myLastHash = blockData.hash;
			}
		}
	}

	lockSyncBlock(lockByUid: string) {
		if (this.yourUid === lockByUid) {
			this.#flagBlockInSync = true;
		}
		else {
			this.#flagLockBlockSync = true;
		}
	}

	unlockSyncBlock() {
		this.#flagLockBlockSync = false;
		this.#resetSyncBlockData();
	}

	addUidInterdependent(ipPortStr: string) {
		if (this.uidInterdependent.includes(ipPortStr)) return;
		this.uidInterdependent[this.uidInterdependent.length] = ipPortStr;
		if (this.uidInterdependent.length > 5) {
			this.uidInterdependent.shift();
		}
	}

	#error(isMalicious: boolean = false) {
		if (this.#isMalicious === true) {
			this.#isMalicious = isMalicious;
		}
		if (this.#message.networkError()) {
			this.disconnect(isMalicious);
		}
	}

	setListenPort(port: number) {
		if (port < 1 || port > 65535) return;
		this.#listenPort = port;
	}

	async #handshakedCallback(versionData: interfaceNetworkVersion) {
		if (!versionData || typeof versionData !== 'object') return;
		clearTimeout(this.#connectTimeout);
		let yourListenPort = 0;
		if (typeof versionData.addrFrom?.port === 'number') {
			yourListenPort = versionData.addrFrom.port;
			if (isNaN(yourListenPort) || yourListenPort < 0 || yourListenPort > 65535) {
				yourListenPort = 0;
			}
		}
		this.yourUid = versionData.uid;
		this.#yourVersion = versionData.version;
		this.#emitEvent('peerConnected', {
			uid: versionData.uid,
			ip: this.ip,
			port: this.port,
			listenPort: yourListenPort,
			services: this.networkStatus.services,
			relay: versionData.relay
		});

		this.#yourLastHeight = versionData.startHeight;
		this.isRelayPeer = versionData.relay;
		this._getaddr();
		this._mempool();
		let getblocksData = await BlockUtils.getblocksData(this.#task, Math.min(this.#myLastHeight, this.#yourLastHeight));
		this._getblocks(getblocksData);
		this.#connectTimeout = setTimeout(() => {
			this.disconnect();
		}, SocketTimeout);
		if (ConnectionTimeout > 0) {
			this.#socket.setTimeout(ConnectionTimeout);
		}
	}

	async #sendBlockInv(startHeight: number, endHeight: number, forceEndHeight?: number) {
		let inv = [];
		endHeight = Math.min(endHeight, startHeight + MaxSyncBlockAmount - 1);
		if (typeof forceEndHeight === 'number' && forceEndHeight > endHeight) {
			endHeight = forceEndHeight;
		}
		for (let i = startHeight; i <= endHeight; i++) {
			let item = await this.#task.getBlockHashByHeight(i);
			if (item) {
				inv[inv.length] = item;
			}
			else {
				break;
			}
		}
		if (inv.length > 0) {
			this._inv({
				'2': inv
			});
		}
	}

	#resetSyncBlockData() {
		clearTimeout(this.#blockSyncTimeout);
		this.#blockDataQueue = undefined;
		this.#waitForkDataQueue = [];
		this.#afterForkDataQueue = [];
		this.#flagBlockInSync = false;
		this.#flagForkReady = false;
	}

	async #blockSyncFinish(err: boolean | { hash: Buffer }, isFork?: boolean) {
		this.#resetSyncBlockData();
		this.#emitEvent('peerBlockSyncFinish', err, isFork);
		if (err) {
			if (typeof err === 'object'
				&& Buffer.isBuffer(err.hash)) {
				this._reject('blockInvalid', {
					data: err.hash
				});
			}
		}
		else {
			let lastBlock = this.#task.getLastBlock();
			if (!lastBlock) return;
			this.#verifiedBlockHeight = lastBlock.height;
			this.#verifiedBlockHash = lastBlock.hash;
			if (this.#verifiedBlockHeight > this.#yourLastHeight) {
				this.#yourLastHeight = lastBlock.height;
			}
		}
	}

	async #getblocksProcess(verifiedHeight: number) {
		clearTimeout(this.#connectTimeout);
		if (this.#blockSentHeight > verifiedHeight) {
			if (this.#resendBlock++ > 10) {
				return this.disconnect(true);
			}
			this.#blockSentHeight = verifiedHeight;
		}
		else {
			this.#resendBlock = 0;
		}

		let verifiedBlock = await this.#task.getBlockDataByHeight(verifiedHeight);
		if (!verifiedBlock) return;
		if (this.#verifiedBlockHeight !== 0
			&& this.#verifiedBlockHeight > verifiedHeight
			&& this.#yourLastHeight >= this.#myLastHeight) {
			let getblocksData = await BlockUtils.getblocksData(this.#task, Math.min(this.#myLastHeight, this.#yourLastHeight));
			this._getblocks(getblocksData);
			this.#verifiedBlockHash = verifiedBlock.hash;
			this.#verifiedBlockHeight = verifiedHeight;
			if (verifiedHeight > this.#yourLastHeight) {
				this.#yourLastHeight = verifiedHeight;
			}
			return;
		}
		this.#verifiedBlockHash = verifiedBlock.hash;
		this.#verifiedBlockHeight = verifiedHeight;
		if (verifiedHeight > this.#yourLastHeight) {
			this.#yourLastHeight = verifiedHeight;
		}

		if (this.#flagLockBlockSync || this.#flagBlockInSync) {
			return;
		}
		if (this.#myLastHeight > this.#yourLastHeight) {
			if (this.#yourLastHeight !== verifiedHeight) {
				await this.#sendBlockInv(verifiedHeight + 1, this.#myLastHeight, this.#yourLastHeight + 1);
			}
			else {
				await this.#sendBlockInv(verifiedHeight + 1, this.#myLastHeight);
			}
		}
		else {
			this.#resetSyncBlockData();
		}
	}

	async #invProcess(inv) {
		if (!inv || typeof inv !== 'object') return null;
		// block
		let topHeight = Math.max(this.#verifiedBlockHeight, inv.knownLastHeight);
		if (this.#flagLockBlockSync || this.#flagBlockInSync) { }
		else if (inv.notfound['2']?.length
			&& (topHeight + inv.notfound['2'].length) > this.#myLastHeight) {
			let topHash = this.#verifiedBlockHeight > inv.knownLastHeight ? this.#verifiedBlockHash : inv.knownLastHash;
			if (typeof inv.knownLastHeight === 'number'
				&& Buffer.isBuffer(inv.knownLastHash)
				&& inv.knownLastHeight > this.#verifiedBlockHeight) {
				this.#verifiedBlockHeight = inv.knownLastHeight;
				this.#verifiedBlockHash = inv.knownLastHash;
			}
			this.#emitEvent('peerAskForSyncBlock', {
				knownLastHash: topHash,
				knownLastHeight: topHeight,
				blockHash: inv.notfound['2'].slice(0)
			});
		}
		else if (typeof inv.knownLastHeight === 'number'
			&& inv.knownLastHeight > this.#yourLastHeight) {
			this.#yourLastHeight = inv.knownLastHeight;
			this.#verifiedBlockHeight = inv.knownLastHeight;
			this.#verifiedBlockHash = inv.knownLastHash;
			let getblocksData = await BlockUtils.getblocksData(this.#task, inv.knownLastHeight);
			this._getblocks(getblocksData);
		}
		inv.notfound['2'] = [];
		// tx
		if (inv.notfound['1']?.length) {
			let tx_notfound = [];
			let tx = inv.notfound['1'];
			let length = tx.length;
			for (let i = 0; i < length; i++) {
				if (!(await this.#task.getTransactionByTxid(tx[i]))
					&& !(await this.#task.getTxPool(tx[i]))) {
					tx_notfound.push(tx[i]);
				}
			}
			inv.notfound['1'] = tx_notfound;
		}

		this._getdata(inv.notfound);
	}

	#setBlockSyncTimeout() {
		this.#blockSyncTimeout = setTimeout(() => {
			if (this.#blockDataQueue) {
				this.#blockDataQueue.stop();
				this.#blockDataQueue = undefined;
			}
			this.#blockSyncFinish(true);
		}, SyncBlockTimeout);
	}

	syncBlockProcess(data: any): boolean {
		if (!data || typeof data !== 'object') return false;
		if (this.networkStatus.socketStatus === -1) return false;
		let knownLastHash = data.knownLastHash;
		let knownLastHeight = data.knownLastHeight;
		let blocksData = data.blockHash;
		if (!Buffer.isBuffer(knownLastHash) || typeof knownLastHeight !== 'number'
			|| !Array.isArray(blocksData) || blocksData.length < 1) return false;
		if (this.#myLastHeight > this.#verifiedBlockHeight
			&& blocksData.length + knownLastHeight > this.#myLastHeight) {
			this.#flagForkReady = true;
			this.#blockDataQueue = new BlockDataQueue(
				blocksData.length,
				async (blockData) => {
					this.#waitForkDataQueue.push(blockData);
					return true;
				},
				async (err) => {
					let forkResult = await this.#task.forkBlock(
						this.#verifiedBlockHash,
						this.#waitForkDataQueue
					);
					if (forkResult) {
						// success
						if (Array.isArray(this.#afterForkDataQueue)) {
							for (let i = 0; i < this.#afterForkDataQueue.length; i++) {
								await this.#task.newBlock(this.#afterForkDataQueue[i]);
							}
						}
						this.#blockSyncFinish(false, true);
					}
					else {
						this._reject('blockForkFail', {});
						this.#blockSyncFinish(true);
					}
					this.#waitForkDataQueue = [];
					return true;
				}
			)
		}
		else if (blocksData.length > 1) {
			console.log(`sync blocks from ${this.#myLastHeight + 1} to ${this.#myLastHeight + blocksData.length}`);
			this.#blockDataQueue = this.#task.newAddBlockTask(
				blocksData.length,
				this.#blockSyncFinish.bind(this)
			);
		}
		this._getdata({ '2': blocksData });
		this.#setBlockSyncTimeout();
		return true;
	}

	async #blockProcess(block) {
		let blockHash = block.hash;
		if (this.#flagBlockInSync) {
			clearTimeout(this.#blockSyncTimeout);
			this.#setBlockSyncTimeout();
		}
		else {
			return;
		}
		let blockData = new BlockData(new BlockHeader(block.header));
		for (let i = 0; i < block.txs.length; i++) {
			let txItem = BlockTx.serializeToClass(block.txs[i]);
			if (txItem) {
				blockData.addTx(txItem);
			}
			else {
				blockData = undefined;
				this._reject('blockMalformed', {
					data: blockHash
				});
				this.#blockSyncFinish(true);
				return;
			}
		}

		if (this.#blockDataQueue) {
			let index = 0;
			if (this.#flagForkReady) {
				index = block.height - this.#verifiedBlockHeight - 1;
			}
			else {
				index = block.height - this.#myLastHeight - 1;
			}
			if (index < 0) {
				this.#blockDataQueue.stop();
				this.#blockSyncFinish(false);
				this.#blockDataQueue = undefined;
				return;
			}
			let status = this.#blockDataQueue.add(blockData, index);
			if (!status) {
				this.#afterForkDataQueue.push(blockData);
			}
			else {
				if (this.#blockDataQueue.isFail()) {
					this.#blockDataQueue = undefined;
				}
				else if (this.#blockDataQueue.isFinish()) {
					this.#blockDataQueue = undefined;
				}
			}
		}
		else {
			let r = await this.#task.newBlock(blockData);
			if (!r || r.err) {
				let checkBlock = await this.#task.getBlockDataByHash(blockHash);
				if (checkBlock) {
					this._reject('blockDuplicate', {
						data: blockHash
					});
				}
				else {
					this._reject('blockInvalid', {
						data: blockHash
					});
				}
				let getblocksData = await BlockUtils.getblocksData(this.#task, Math.min(this.#myLastHeight, this.#yourLastHeight));
				this._getblocks(getblocksData);
				this.#blockSyncFinish(true);
			}
			else {
				this.#yourLastHeight = block.height;
				this.#verifiedBlockHeight = block.height;
				this.#verifiedBlockHash = blockHash;
				this.#blockSyncFinish(false);
			}
		}
	}

	async #notfoundProcess(notfound: interfaceInvObject) {
		let blocks = notfound['2'];
		if (Array.isArray(blocks) && blocks.length > 0) {
			this.#blockSyncFinish(true);
		}
	}

	async #getdataProcess(getdata) {
		if (!getdata || typeof getdata !== 'object') return null;
		if (Object.keys(getdata.notfound).length > 0) {
			this._notfound(getdata.notfound);
		}
		let blocks = getdata.block;
		if (Array.isArray(blocks) && blocks.length > 0) {
			for (let i = 0; i < blocks.length; i++) {
				this._block(blocks[i]);
			}
		}
		let txs = getdata.tx;
		if (Array.isArray(txs) && txs.length > 0) {
			for (let i = 0; i < txs.length; i++) {
				this._tx(txs[i]);
			}
		}
	}

	#rejectProcess(type, label) {
		if (type === 0) {
			if (label === 4) {
				this.#emitEvent('peerUidDuplicate')
			}
		}
	}

	async resyncAfterNewBlock(getblocksData: Buffer[], isFork?: boolean) {
		if (this.#myLastHeight > this.#yourLastHeight) {
			if (isFork) {
				let blocksData = await BlockUtils.getblocksData(this.#task, this.#yourLastHeight);
				this._getblocks(blocksData);
			}
			else {
				await this.#sendBlockInv(this.#verifiedBlockHeight + 1, this.#myLastHeight);
			}
		}
		else {
			this._getblocks(getblocksData);
		}
	}

	async #parseSocketMessage(command: string, payload?: any) {
		if (this.#flagLockBlockSync && LockBlockCommand.includes(command)) {
			if (this.#flagBlockInSync) {
				this.#flagLockBlockSync = false;
			}
			else {
				return;
			}
		}
		await this.#commandProcess(command, payload);
	}

	#socketEmit(cmd: string, message?: Option): boolean {
		return this.#message.cmd(cmd, message);
	}

	_addr(addrs) {
		if (!Array.isArray(addrs)) return;
		this.lastGetAddrTime = Date.now();
		let index = 0;
		do {
			let addrItem = addrs.slice(index, index + 1000);
			if (addrItem.length === 0) break;
			this.#socketEmit('addr', {
				data: addrItem
			});
			index += 1000;
		} while (index < addrs.length);
	}

	_ping() {
		this.#message.ping();
	}

	_version() {
		this.#message.version({
			uid: this.myUid,
			height: this.#myLastHeight,
			recv: {
				ip: this.ip,
				port: this.port,
			},
			from: {
				ip: '0.0.0.0',
				port: this.myListenPort,
			},
			relay: this.#flagRelay
		});
	}

	_getaddr() {
		this.#socketEmit('getaddr', {});
	}

	_mempool() {
		this.#socketEmit('mempool', {});
	}

	async _getblocks(getblocksData: Buffer[]) {
		this.#socketEmit('getblocks', { data: getblocksData });
	}

	_block(block) {
		if (block.height > this.#blockSentHeight) {
			this.#blockSentHeight = block.height;
		}
		this.#socketEmit('block', {
			data: block
		});
	}

	async _tx(tx: { data: Buffer }) {
		this.#socketEmit('tx', {
			data: tx
		});
	}

	_notfound(data) {
		if (data && typeof data === 'object') {
			this.#socketEmit('notfound', data);
		}
	}

	_reject(templateType: string, customData) {
		this.#socketEmit('reject', {
			template: templateType,
			data: customData
		});
	}

	_getdata(data) {
		if (data && typeof data === 'object') {
			this.#socketEmit('getdata', data);
		}
	}

	_inv(data) {
		if (data && typeof data === 'object') {
			this.#socketEmit('inv', data);
		}
	}

	sendMessage(cmd: string, message?: Option | string) {
		if (typeof this['_' + cmd] === 'function') {
			this['_' + cmd](message);
		}
	}
}

export default Peer;