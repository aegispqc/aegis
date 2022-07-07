import * as net from 'net';
import { EventEmitter } from 'events';
import {
	interfaceNetwork, interfaceServicesOpt,
	Option, CallbackOption, p2pMessageObject
} from '../lib/interface';

import { Queue } from '../utils/queue';
import { BufferQueue } from './utils/bufferQueue';
import { Task } from '../../task';
import * as NetworkUtils from './utils/network';
import Param from '../p2pParam';
const SocketTimeout = Param.network.SocketTimeout || 30000;
const MaxErrorCount = Param.network.MaxErrorCount || 10;

import commandAddr from './command/addr';
import commandBlock from './command/block';
import commandBlockAck from './command/blockack';
import commandGetAddr from './command/getaddr';
import commandGetBlocks from './command/getblocks';
import commandGetData from './command/getdata';
import commandInv from './command/inv';
import commandMempool from './command/mempool';
import commandNotFound from './command/notfound';
import commandPing from './command/ping';
import commandPong from './command/pong';
import commandProto from './command/proto';
import commandReject from './command/reject';
import commandTx from './command/tx';
import commandVerack from './command/verack';
import commandVersion from './command/version';

const statusCode = {
	'disconnect': -1,
	'init': 0,
	'connected': 1,
}
interface CommandList {
	addr: commandAddr;
	block: commandBlock;
	blockack: commandBlockAck;
	getaddr: commandGetAddr;
	getblocks: commandGetBlocks;
	getdata: commandGetData;
	inv: commandInv;
	mempool: commandMempool;
	notfound: commandNotFound;
	ping: commandPing;
	pong: commandPong;
	reject: commandReject;
	tx: commandTx;
	verack: commandVerack;
	version: commandVersion;
}
var eventEmit = new EventEmitter();
type CallbackFunction = (...args: any[]) => void;

export default class Message {
	#socket?: net.Socket;
	#commandMessage: CommandList;
	#basicCommand: CallbackOption;
	#disconnetFunction?: Function;
	#handshakedFunction?: Function;
	#parseBlockMessageFunction?: Function;
	#readyParseBlockFunction: Function;
	#socketStatus: number;
	#pingNonce: Buffer;
	#pingRes?: Function;
	#netErrorCount: number;
	#yourVersionTmp: Option;
	#yourServices: bigint;
	#myServices: bigint;
	#serviceFullNode: boolean;
	#sendMessageQueue: Queue;
	#parserMessageQueue: BufferQueue;
	#flagOnListen: boolean;
	#flagSendVersion: boolean;
	#flagSendVerack: boolean;
	#flagGetVersion: boolean;
	#flagGetVerack: boolean;
	#timeStart: number;
	#timeLastCommand: number;
	#timeLastComm: number;
	#timeLastPing: number;
	#pingTimeout?: ReturnType<typeof setTimeout>;
	#handShakeTimeout?: ReturnType<typeof setTimeout>;
	constructor(network: interfaceNetwork, task: Task, servicesOpt: interfaceServicesOpt, CallBacks: CallbackOption) {
		this.#socket;
		this.#commandMessage = {
			addr: new commandAddr(network),
			block: new commandBlock(network),
			blockack: new commandBlockAck(network),
			getaddr: new commandGetAddr(network),
			getblocks: new commandGetBlocks(network, task),
			getdata: new commandGetData(network, task),
			inv: new commandInv(network, task),
			mempool: new commandMempool(network),
			notfound: new commandNotFound(network, task),
			ping: new commandPing(network),
			pong: new commandPong(network),
			reject: new commandReject(network),
			tx: new commandTx(network),
			verack: new commandVerack(network),
			version: new commandVersion(network)
		};

		this.#basicCommand = {
			addr: (payload: any) => {
				let ips = payload?.data;
				if (ips && Array.isArray(ips)) {
					Message.eventEmit('peerNewAddr', undefined, ips);
				}
			},
			ping: (payload: any) => {
				if (this.#socketStatus !== statusCode['connected']) return;
				let nonce = payload?.nonce;
				if (Buffer.isBuffer(nonce)) {
					this.#priorityCmd('pong', { nonce });
				}
			},
			pong: (payload: any) => {
				clearTimeout(this.#pingTimeout);
				let nonce = payload?.nonce;
				if (Buffer.isBuffer(nonce) && nonce.equals(this.#pingNonce)) {
					this.#timeLastPing = Date.now();
					if (typeof this.#pingRes === 'function') {
						this.#pingRes(true);
					}
				}
				else {
					if (typeof this.#pingRes === 'function') {
						this.#pingRes(false);
					}
					else {
						this.disconnect(true);
					}
				}
				this.#pingRes = undefined;
				this.#pingNonce = Buffer.alloc(0);
			},
			verack: () => {
				this.#flagGetVerack = true;
				this.#checkHandshake();
			},
			version: (payload: any) => {
				if (!payload) {
					return this.networkError();
				}
				let verify = this.#verifyVersion(payload);
				if (!verify) {
					return this.networkError();
				}
				this.#yourVersionTmp = payload;
				this.#yourServices = payload.services;
				this.#verack();
				this.#flagGetVersion = true;
				this.#flagSendVerack = true;
				this.#checkHandshake();
			},
		}

		// callback
		this.#disconnetFunction = CallBacks?.disconnect;
		this.#handshakedFunction = CallBacks?.handshaked;
		this.#parseBlockMessageFunction = CallBacks?.parseBlockMessage;
		this.#readyParseBlockFunction = function () { };

		// socket
		this.#socketStatus = statusCode['init'];
		this.#pingNonce = Buffer.alloc(0);
		this.#netErrorCount = 0;
		this.#yourVersionTmp;
		this.#yourServices = 0n;
		this.#myServices = servicesOpt.data;

		// services
		this.#serviceFullNode = servicesOpt.list[0];

		// Queue
		this.#sendMessageQueue = new Queue(this.#sendCallback.bind(this));
		this.#parserMessageQueue = new BufferQueue(network.networkMagic, this.#checkMessageParse.bind(this), this.#parserCallback.bind(this));

		// flag
		this.#flagOnListen = false;
		this.#flagSendVersion = false;
		this.#flagSendVerack = false;
		this.#flagGetVersion = false;
		this.#flagGetVerack = false;

		// time
		this.#timeStart = Date.now();
		// the time of last get command
		this.#timeLastCommand = 0;
		// The time of last get socket data
		this.#timeLastComm = Date.now();
		// The time of last get ping command
		this.#timeLastPing = 0;

		// other
		this.#pingTimeout;
		this.#handShakeTimeout;
	}

	static eventEmit(event: string, ...args: any) {
		eventEmit.emit(event, ...args);
	}

	static eventOn(event: string, func: CallbackFunction) {
		eventEmit.on(event, func);
	}

	static eventOnce(event: string, func: CallbackFunction) {
		eventEmit.once(event, (...args) => {
			func(...args);
		});
	}

	setSocketStatus(status: string) {
		if (statusCode[status]) {
			this.#socketStatus = statusCode[status];
		}
	}

	listenOn() {
		if (!this.#flagOnListen && this.#socket) {
			this.#flagOnListen = true;
			this.#socketListen();
		}
	}

	#checkHandshake(): boolean {
		if (this.#flagGetVerack && this.#flagGetVersion
			&& this.#flagSendVersion && this.#flagSendVerack) {
			if (this.#socketStatus < statusCode['connected']) {
				this.#socketStatus = statusCode['connected'];
				clearInterval(this.#handShakeTimeout);
				if (typeof this.#handshakedFunction === 'function') {
					this.#handshakedFunction(this.#yourVersionTmp);
				}
				if (typeof this.#parseBlockMessageFunction === 'function') {
					this.#readyParseBlockFunction = this.#parseBlockMessageFunction;
				}
			}
			return true;
		}
		return false;
	}

	#verifyVersion(versionPayload): boolean {
		if (typeof versionPayload.startHeight !== 'number') {
			return false;
		}
		return true;
	}

	#socketListen() {
		this.#socket.on('data', (msg: Buffer) => {
			this.#timeLastComm = Date.now();
			this.#parserMessageQueue.add(msg);
			this.#parserMessageQueue.start();
		});
	}

	setSocket(socket: net.Socket) {
		this.#socket = socket;
		if (!this.#sendMessageQueue.isEmpty()) {
			this.#sendMessageQueue.start();
		}
		if (this.#flagOnListen) {
			this.#socketListen();
		}
	}

	async #sendCallback(data) {
		let messageBuffer = await this.#commandMessage[data.type].getBuffer(data.message);
		if (Buffer.isBuffer(messageBuffer)) {
			await this.#socketWriteSync(messageBuffer);
		}
	}

	#socketWriteSync(messageBuffer) {
		return new Promise((res: Function) => {
			this.#socket.write(messageBuffer, function () {
				res();
			});
		});
	}

	async #checkMessageParse(buffer: Buffer): Promise<p2pMessageObject | { err: number, length?: number }> {
		return commandProto.parseBuffer(buffer);
	}

	async #parserCallback(message) {
		if (!message || typeof message !== 'object') {
			return;
		}
		if (message.err) {
			if (message.data) {
				this.cmd('reject', message.data);
			}
			else {
				this.cmd('reject', {
					template: 'networkMalformed'
				});
			}
			return;
		}
		message['payload'] = await this.parsePayload(message.command, message.payloadBuffer);
		if (this.#basicCommand[message.command]) {
			await this.#basicCommand[message.command](message.payload);
		}
		else {
			await this.#readyParseBlockFunction(message.command, message.payload);
		}
	}

	networkError(isMalicious: boolean = false): boolean {
		if (isMalicious === true) {
			this.disconnect(true);
			return true;
		}
		if (++this.#netErrorCount >= MaxErrorCount) {
			this.disconnect(true);
			return true;
		}
		else {
			return false;
		}
	}

	cmd(type: string, message?: Option): boolean {
		if (this.#commandMessage[type]) {
			this.#sendMessageQueue.add({ type, message });
			this.#sendMessageQueue.start();
			return true;
		}
		else {
			return false;
		}
	}

	#priorityCmd(type: string, message?: Option) {
		if (this.#commandMessage[type]) {
			this.#sendMessageQueue.priorityAdd({ type, message });
			this.#sendMessageQueue.start();
			return true;
		}
		else {
			return false;
		}
	}

	parsePayload(type: string, payloadBuffer: Buffer) {
		if (this.#commandMessage[type]) {
			this.#timeLastCommand = Date.now();
			return this.#commandMessage[type].parsePayload(payloadBuffer);
		}
		else {
			return null;
		}
	}

	disconnect(isMalicious: boolean = false, isTimeout?: boolean) {
		if (this.#socketStatus < 0) {
			if (typeof this.#disconnetFunction === 'function') {
				this.#disconnetFunction(isMalicious, isTimeout);
			}
			return;
		}
		this.setSocketStatus('disconnect');
		clearInterval(this.#handShakeTimeout);
		clearTimeout(this.#pingTimeout);
		this.cmd = (type: string, message?: Option): boolean => { return false };
		this.parsePayload = (type: string, payloadBuffer: Buffer) => { return null };
		this.#sendMessageQueue.stop();
		this.#parserMessageQueue.stop();
		if (typeof this.#disconnetFunction === 'function') {
			this.#disconnetFunction(isMalicious, isTimeout);
		}
	}

	ping() {
		if (this.#pingNonce.length !== 0) return;
		if (this.#socketStatus !== statusCode['connected'] && Date.now() < this.#timeStart + SocketTimeout * 4) return;
		clearTimeout(this.#pingTimeout);
		let nonce = NetworkUtils.createNonce(8);
		this.cmd('ping', { nonce });
		this.#pingNonce = nonce;
		this.#pingTimeout = setTimeout(() => {
			this.disconnect(true, false);
		}, SocketTimeout);
	}

	pingAsync(): Promise<boolean> {
		return new Promise((res) => {
			let nonce;
			if (this.#pingNonce.length === 0) {
				clearTimeout(this.#pingTimeout);
				nonce = NetworkUtils.createNonce(8);
				this.cmd('ping', { nonce });
				this.#pingNonce = nonce;
				this.#pingTimeout = setTimeout(() => {
					this.#pingRes = undefined;
					this.#pingNonce = Buffer.alloc(0);
					res(false);
				}, SocketTimeout);
			}
			else {
				res(false);
			}
			this.#pingRes = res;
		});
	}

	version(versionData) {
		if (!versionData || typeof versionData !== 'object') return;
		this.#flagSendVersion = true;
		versionData.services = this.#myServices;
		this.#priorityCmd('version', versionData);

		if (!this.#handShakeTimeout) {
			let handshakeError = 0;
			this.#handShakeTimeout = setInterval(() => {
				let status = this.#checkHandshake();
				if (!status) {
					handshakeError++;
					if (handshakeError >= 3) {
						this.disconnect(false, true);
					}
					else if (!this.#flagGetVerack) {
						this.#priorityCmd('version', versionData);
					}
				}
			}, Math.floor(SocketTimeout / 3));
		}
	}

	#verack() {
		this.#priorityCmd('verack', {});
	}

	get status() {
		return {
			time: {
				lastCommand: this.#timeLastCommand,
				lastComm: this.#timeLastComm,
				lastPing: this.#timeLastPing,
				start: this.#timeStart
			},
			socketStatus: this.#socketStatus,
			services: this.#yourServices,
			servicesData: {
				fullNode: this.#serviceFullNode
			},
			errorCount: this.errorCount
		}
	}

	get errorCount() {
		return this.#netErrorCount;
	}
}