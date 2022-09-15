import http from 'http';
import * as crypto from 'crypto';

import PollCollector from './pollCollector';
import { Task } from '../task';
import P2P from '../p2p/p2p';
import BlockHeader from '../blockchain/blockHeader';
import { BlockTx } from '../blockchain/blockTx';
import { BlockData } from '../core';
import {
	getLastBlockValidate,
	getBlockDataByHashValidate,
	getBlockDataByHeightValidate,
	getTransactionByTxidValidate,
	getPqcertByHashValidate,
	newBlockValidate,
	newBlockOnlyTxidsValidate,
	createTransationValidate,
	mineValidate,
	getCacheTxByHashValidate,
	walletCreateTransationValidate,
	getBalanceValidate,
	getTxPoolValidate,
	walletAddWatchAddressValidate,
	walletGetTxListValidate,
	peerValidate,
	walletCreateAdvancedTransationValidate,
} from './dataSchema/input';
import { blockTxJsonData, blockTxJsonSchemaValidate } from '../blockchain/dataSchema/txSchema';
import ErrorCode from '../blockchain/errorCode';
import { shake256 } from '../crypto/hash';
import { PQCEncrypt } from '../crypto/PQCEncrypt';
import { jsonParse, jsonStringify } from './json';
import { Socket } from 'net';

type auth = {
	usr: string;
	pw: string;
}

type rpcOpt = {
	hostname?: string,
	port?: number,
	auth?: auth;
	PQCEncrypt?: {
		cliPubKey?: Buffer,
		aesKey?: Buffer,
		signSeed?: Buffer,
	}
}

type rpcReturn = {
	result?: any,
	error?: string;
}

//{"method": string, "params": any[] }
class RpcServer {
	private task: Task;
	private p2p?: P2P;
	private rpcOpt: rpcOpt;
	private basicAuth?: Buffer;
	private newBlockPollCollector: PollCollector;
	private forkBlockPollCollector: PollCollector;
	private addTxPollCollector: PollCollector;
	private server?: http.Server;
	private sockets: Set<Socket>;
	pqc?: PQCEncrypt;

	constructor(rpcOpt: rpcOpt, task: Task, p2p?: P2P) {
		this.task = task;
		this.p2p = p2p;
		if (typeof rpcOpt.hostname !== 'string') {
			rpcOpt.hostname = '127.0.0.1';
		}
		if (typeof rpcOpt.port !== 'number') {
			rpcOpt.port = 51978;
		}
		this.rpcOpt = rpcOpt;
		this.basicAuth;
		this.newBlockPollCollector = new PollCollector();
		this.forkBlockPollCollector = new PollCollector();
		this.addTxPollCollector = new PollCollector();

		if (rpcOpt.PQCEncrypt) {
			let signSeed = rpcOpt.PQCEncrypt.signSeed;
			let aesKey = rpcOpt.PQCEncrypt.aesKey;
			this.pqc = new PQCEncrypt(signSeed, aesKey);

			if (rpcOpt.PQCEncrypt.cliPubKey) {
				this.pqc.setCliPubKey(rpcOpt.PQCEncrypt.cliPubKey);
			}
		}

		let auth = this.rpcOpt.auth;
		if (auth && typeof auth.usr === "string" && typeof auth.pw === "string") {
			this.basicAuth = shake256(Buffer.from("Basic " + Buffer.from(auth.usr + ":" + auth.pw, 'utf8').toString('base64'), 'utf8'));
		}
	}

	start() {
		this.sockets = new Set();
		this.server = http.createServer(this.serverHandle.bind(this)).listen({ port: this.rpcOpt.port, host: this.rpcOpt.hostname }, () => {
			console.log(`RPC server started. PORT: ${this.rpcOpt.port}`);
		});

		this.server.on('connection', (socket) => {
			this.sockets.add(socket);
			socket.once('close', () => {
				this.sockets.delete(socket);
			});
		});

		this.task.eventEmit.on('newBlock', (m) => {
			this.newBlockPollCollector.send(m.toString('hex'));
		});
		this.task.eventEmit.on('forkBlock', (m) => {
			this.forkBlockPollCollector.send({ startHeight: m.startHeight, endHeight: m.endHeight, blockHashList: m.blockHashList.map(x => x.toString('hex')) });
		});
		this.task.eventEmit.on('addTx', (m) => {
			this.addTxPollCollector.send({ txid: m.txid.toString('hex'), mining: m.mining });
		});

		if (this.pqc) {
			this.pqc.clearSchedulingStart();
		}
	}

	serverHandle(req, res) {
		if (req.method !== 'POST') {
			res.writeHead(400, { 'Content-Type': 'text/json' });
			res.end();
			return;
		}

		if (this.basicAuth) {
			if (!crypto.timingSafeEqual(this.basicAuth, shake256(Buffer.from(req.headers.authorization, 'utf8')))) {
				res.writeHead(403, { 'Content-Type': 'text/json' });
				res.end(JSON.stringify({ error: 'status 403' }));
				return;
			}
		}

		let body: any = [];
		req.on('data', (chunk) => {
			body.push(chunk);
		});

		req.on('end', async () => {
			let dataJson;
			try {
				body = Buffer.concat(body);
				// pqc
				if (this.pqc) {
					body = this.pqc.decryption(body);
					if (!body) {
						res.writeHead(403, { 'Content-Type': 'text/json' });
						res.end(JSON.stringify({ error: 'status 403' }));
						return;
					}
				}
				body = body.toString('utf8');
				dataJson = jsonParse(body);
			}
			catch (e) {
				res.writeHead(400, { 'Content-Type': 'text/json' });
				res.end(JSON.stringify({ error: 'status 400' }));
				return;
			}

			let { method, params } = dataJson;
			let id = dataJson.id;
			let rdata;
			if (this.methodTable[method]) {
				console.log(`RPC method: ${method}`);
				rdata = await this.methodTable[method].call(this, ...params);
				if (rdata) {
					rdata.id = id;
				}
			}
			else if (this.pollTable[method]) {
				console.log(`RPC poll method: ${method}`);
				rdata = await this.pollTable[method].call(this, res, ...params);
				if (rdata?.error === 'close') {
					return;
				}
				if (rdata) {
					rdata.id = id;
				}
			}
			else {
				rdata = { error: `The method [${method}] is not found`, id };
			}

			rdata = jsonStringify(rdata);
			rdata = Buffer.from(rdata, 'utf8');
			if (this.pqc) {
				rdata = this.pqc.encryption(rdata);
				if (!rdata) {
					res.writeHead(500, { 'Content-Type': 'text/json' });
					res.end();
					return;
				}
			}

			res.writeHead(201, { 'Content-Type': 'text/json' });
			res.end(rdata);
		});
	}

	readonly methodTable: { [key: string]: (...parms: any) => Promise<rpcReturn> | rpcReturn } = {
		getLastBlock: this.getLastBlock,
		getBlockDataByHash: this.getBlockDataByHash,
		getBlockDataByHeight: this.getBlockDataByHeight,
		getTransactionByTxid: this.getTransactionByTxid,
		getPqcertByHash: this.getPqcertByHash,
		newBlock: this.newBlock,
		createTransation: this.createTransation,
		txValidator: this.txValidator,
		addTx: this.addTx,
		mine: this.mine,
		getMiningBlock: this.getMiningBlock,
		newBlockOnlyTxids: this.newBlockOnlyTxids,
		getDifficulty: this.getDifficulty,
		getTxPoolList: this.getTxPoolList,
		getTxPoolByTxid: this.getTxPoolByTxid,
		getStatus: this.getStatus,
		//------- wallet -------
		walletCreateTransation: this.walletCreateTransation,
		walletCreateAdvancedTransation: this.walletCreateAdvancedTransation,
		walletGetBalance: this.walletGetBalance,
		walletReindex: this.walletReindex,
		walletClearHistory: this.walletClearHistory,
		walletAddWatchAddress: this.walletAddWatchAddress,
		walletGetTxList: this.walletGetTxList,
		walletGetUTXOList: this.walletGetUTXOList,
		//------- p2p -------
		p2pAddPeer: this.p2pAddPeer,
		p2pDeletePeer: this.p2pDeletePeer,
		p2pAddBlackPeer: this.p2pAddBlackList,
		p2pDeleteBlackPeer: this.p2pDeleteBlackList,
		p2pStatus: this.p2pStatus,
		p2pGetPeerList: this.p2pGetPeerList,
		p2pGetBlackList: this.p2pGetBlackList
	}

	readonly pollTable: { [key: string]: (...parms: any) => Promise<rpcReturn> | rpcReturn } = {
		pollingNewBlock: this.pollingNewBlock,
		pollingForkBlock: this.pollingForkBlock,
		pollingAddTx: this.pollingAddTx
	}

	/**
	 * Get last block data.
	 * @param {boolean} txsFlag Show all transactions.
	 * @param {boolean} raw Whether the transaction is expressed in raw.
	 * @returns {rpcReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	async getLastBlock(txsFlag: boolean = false, raw: boolean = false): Promise<rpcReturn> {
		if (!getLastBlockValidate({ raw })) {
			console.error(getLastBlockValidate.errors);
			return { error: getLastBlockValidate.errors[0].message };
		}

		let block = await this.task.getLastBlock();
		if (!block) {
			return { error: `Last block was not found!` };
		}

		if (!txsFlag) {
			delete block.txs;
		}

		if (raw) {
			return { result: block };
		}

		return { result: RpcServer.BlockDataToJson(block) };
	}

	/**
	 * Get block data by hash.
	 * @param {string} hash block Hash.
	 * @param {boolean} txsFlag Whether to return the transactions.
	 * @param {boolean} raw Whether the transaction is expressed in raw.
	 * @returns {rpcReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	async getBlockDataByHash(hash: string, txsFlag: boolean = false, raw: boolean = false): Promise<rpcReturn> {
		if (!getBlockDataByHashValidate({ hash, raw })) {
			console.error(getBlockDataByHashValidate.errors);
			return { error: getBlockDataByHashValidate.errors[0].message };
		}

		let hashBuf = Buffer.from(hash, 'hex');
		let block = await this.task.getBlockDataByHash(hashBuf);
		if (!block) {
			return { error: `block (${hash}) is not found!` };
		}

		if (!txsFlag) {
			delete block.txs;
		}

		if (raw) {
			return { result: block };
		}

		return { result: RpcServer.BlockDataToJson(block) };
	}

	/**
	 * Get block data by height.
	 * @param {number} height block height.
	 * @param {boolean} txsFlag Whether to return the transactions.
	 * @param {boolean} raw Whether the transaction is expressed in raw.
	 * @returns {rpcReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	async getBlockDataByHeight(height: number, txsFlag: boolean = false, raw: boolean = false): Promise<rpcReturn> {
		if (!getBlockDataByHeightValidate({ height, raw })) {
			console.error(getBlockDataByHeightValidate.errors);
			return { error: getBlockDataByHeightValidate.errors[0].message };
		}

		let block = await this.task.getBlockDataByHeight(height);
		if (!block) {
			return { error: `block height (${height}) is not found!` };
		}

		if (!txsFlag) {
			delete block.txs;
		}

		if (raw) {
			return { result: block };
		}
		return { result: RpcServer.BlockDataToJson(block) };
	}

	/**
	 * Get transaction by txid
	 * @param {string} txid Transaction ID.
	 * @param {boolean} raw Whether the transaction is expressed in raw.
	 * @returns {rpcReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	async getTransactionByTxid(txid: string, raw?: boolean): Promise<rpcReturn> {
		if (!getTransactionByTxidValidate({ txid, raw })) {
			console.error(getTransactionByTxidValidate.errors);
			return { error: getTransactionByTxidValidate.errors[0].message };
		}

		let txidBuf = Buffer.from(txid, 'hex');
		let tx = await this.task.getTransactionByTxid(txidBuf);
		if (!tx) {
			return { error: `Tx (${txid}) is not found!` };
		}

		if (raw) {
			let txRaw = tx.blockTx.getSerialize();
			if (!txRaw) {
				return { error: `getTx (${txid}) is not fail!` };
			}
			return { result: { txid, blockHash: tx.blockHash, blockHeight: tx.blockHeight, blockTxn: tx.blockTxn, tx: txRaw, voutspent: tx.voutspent } };
		}

		let txJson = tx.blockTx.json;
		if (!txJson) {
			return { error: `getTx (${txid}) is fail!` };
		}

		return { result: { txid, blockHash: tx.blockHash, blockHeight: tx.blockHeight, blockTxn: tx.blockTxn, tx: txJson, voutspent: tx.voutspent } };
	}

	/**
	 * Get pqcert by hash.
	 * @param {string} hash block Hash.
	 * @param {boolean} raw Whether the transaction is expressed in raw.
	 * @returns {rpcReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	async getPqcertByHash(hash: string, raw?: boolean): Promise<rpcReturn> {
		if (!getPqcertByHashValidate({ hash, raw })) {
			console.error(getPqcertByHashValidate.errors);
			return { error: getPqcertByHashValidate.errors[0].message };
		}

		let hashBuf = Buffer.from(hash, 'hex');
		let pqcert = await this.task.getPqcertByHash(hashBuf);
		if (!pqcert) {
			return { error: `pqcert (${hash}) is not found!` };
		}

		if (raw) {
			return { result: { hash: hash, pqcert: pqcert.serialize } };
		}

		let pqcertJson = pqcert.json;
		if (!pqcertJson) {
			return { error: `pqcert (${hash}) is fail!` };
		}

		return { result: pqcertJson };
	}

	/**
	 * Add a new block.
	 * @param {object} block 
	 * @param {string} block.hash block hash.
	 * @param {string} block.header block header.(raw format)
	 * @param {string[]} block.txs Transactions in the block.(raw format)
	 * @returns {rpcReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	async newBlock(block: { hash: string, header: string, txs: string[] }): Promise<rpcReturn> {
		if (!newBlockValidate({ block })) {
			console.error(newBlockValidate.errors);
			return { error: newBlockValidate.errors[0].message };
		}

		let blockHeader = new BlockHeader(Buffer.from(block.header, 'hex'), true);
		let realHash = blockHeader.getHash('hex');
		if (block.hash !== realHash) {
			return { error: `Block hash mismatch (${block.hash} is not equal to ${realHash})` };
		}

		let blockData = new BlockData(blockHeader);
		let txs = [];

		for (let i = 0; i < block.txs.length; i++) {
			txs[i] = BlockTx.serializeToClass(Buffer.from(block.txs[i], 'hex'));
			if (!txs[i]) {
				return { error: `txs[${i}] is fail` };
			}

			if (blockData.addTx(txs[i]).err) {
				return { error: `txs[${i}] is fail` };
			}
		}

		let result = await this.task.newBlock(blockData);
		if (result.err) {
			return { error: `newBlock fail` };
		}

		return { result: result.data };
	}

	/**
	 * create new transation.
	 * @param {object} data 
	 * @param {object[][]} data.vin vin array.
	 * @param {string[][]} data.vin[][].txid Source transaction id.
	 * @param {number} data.vin[][].voutn this transaction which vout.
	 * @param {object[]} data.vout vout array.
	 * @param {string} data.vout[].address Receiving address.
	 * @param {string} data.vout[].value Send amount.
	 * @param {string} data.changeAddress Change address.
	 * @param {string} [data.opReturn] opReturn.
	 * @param {boolean} replaceLS Automatic replacement of unlock for transaction vin.
	 * @param {boolean} rawFlag Whether the transaction is expressed in raw.
	 * @returns {rpcReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	async createTransation(data: { vin: { txid: string, voutn: number }[][], vout: { address: string, value: string }[], changeAddress: string, opReturn?: string }, replaceLS: boolean = false, rawFlag: boolean = false): Promise<rpcReturn> {
		if (!createTransationValidate({ tx: data, replaceLS })) {
			console.error(createTransationValidate.errors);
			return { error: createTransationValidate.errors[0].message };
		}

		let thisVin = [];
		for (let i = 0; i < data.vin.length; i++) {
			thisVin[i] = []
			for (let j = 0; j < data.vin[i].length; j++) {
				thisVin[i][j] = {
					txid: Buffer.from(data.vin[i][j].txid, 'hex'),
					voutn: data.vin[i][j].voutn
				};
			}
		}

		let thisVout = [];
		for (let i = 0; i < data.vout.length; i++) {
			thisVout[i] = {
				address: Buffer.from(data.vout[i].address, 'hex'),
				value: BigInt(data.vout[i].value)
			}
		}

		let opReturn = Buffer.from((data.opReturn) ? data.opReturn : '', 'hex');

		let r = await this.task.createTransation(thisVin, thisVout, opReturn, replaceLS);
		if (!r) {
			return { error: `createTransation fail!` };
		}

		let blockTx = r.blockTx;
		let txJson = blockTx.json;
		if (!txJson) {
			return { error: `createTransation fail!` };
		}

		if (rawFlag) {
			let raw: any = blockTx.getSerialize();
			if (!raw) {
				return { error: `createTransation fail!` };
			}
			raw = raw.toString('hex');

			return { result: { inValue: r.inValue, blockTx: { json: txJson, raw } } };
		}

		return { result: { inValue: r.inValue, blockTx: txJson } };
	}

	/**
	 * Transation validator.
	 * @param {blockTxJsonData} tx transation
	 * @returns {rpcReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	async txValidator(tx: blockTxJsonData): Promise<rpcReturn> {
		if (!blockTxJsonSchemaValidate(tx)) {
			console.error(blockTxJsonSchemaValidate.errors);
			return { error: blockTxJsonSchemaValidate.errors[0].message };
		}

		let blockTx = BlockTx.jsonDataToClass(tx);
		if (!blockTx) {
			return { error: `tx fail!` };
		}

		let v = await this.task.txValidator(blockTx, this.task.core.nowHeight, false);

		if (!v) {
			return { error: `txValidator fail!` };
		}

		return { result: { valid: true, fee: v.fee } }
	}

	/**
	 * Add transation.
	 * @param {blockTxJsonData} tx transation
	 * @returns {rpcReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	async addTx(tx: blockTxJsonData): Promise<rpcReturn> {
		if (!blockTxJsonSchemaValidate(tx)) {
			console.error(blockTxJsonSchemaValidate.errors);
			return { error: blockTxJsonSchemaValidate.errors[0].message };
		}

		let blockTx = BlockTx.jsonDataToClass(tx);
		if (!blockTx) {
			return { error: `blockTx fail!` };
		}

		let r = await this.task.addTx(blockTx, true);

		if (r.err) {
			return { error: ErrorCode[r.err] };
		}

		return { result: { suc: true, txid: blockTx.getHash('hex') } };
	}

	/**
	 * Get a list of cache and mining transactions.
	 */
	async getTxPoolList() {
		return { result: await this.task.getTxPoolList() };
	}

	/**
	 * Get the transaction in the list of cache and mining transactions with transaction ID.
	 * @param {string} txid Txid of the transaction in the list of cache and mining transactions.
	 * @returns {rpcReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	async getTxPoolByTxid(txid: string) {
		if (!getTxPoolValidate({ txid })) {
			console.error(getTxPoolValidate.errors);
			return { error: getTxPoolValidate.errors[0].message };
		}

		let data = this.task.getTxPool(Buffer.from(txid, 'hex'));
		if (!data) {
			return { error: `txid (${txid}) is not found` };
		}

		return { result: data };
	}

	/**
	 * Get cache transaction by hash.
	 * @param hash transaction hash.
	 * @returns {rpcReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	async getCacheTxByHash(hash: string) {
		if (!getCacheTxByHashValidate({ hash })) {
			console.error(getCacheTxByHashValidate.errors);
			return { error: getCacheTxByHashValidate.errors[0].message };
		}

		return { result: this.task.getCacheTxByHash(hash) };
	}

	async mine(address: string | false, inCacheTxFlag: boolean = true, testFlag?: boolean): Promise<rpcReturn> {
		if (!mineValidate({ address, inCacheTxFlag, testFlag })) {
			console.error(mineValidate.errors);
			return { error: mineValidate.errors[0].message };
		}
		let addrBuf;
		if (address === false) {
			addrBuf = false;

		}
		else {
			addrBuf = Buffer.from(address, 'hex');
		}
		this.task.mine(addrBuf, inCacheTxFlag, testFlag);

		return { result: true };
	}

	/**
	 * @returns {rpcReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	async getMiningBlock(): Promise<rpcReturn> {
		let r = await this.task.getMiningBlock();
		if (r.err) {
			return { error: r.err };
		}
		return { result: r.data };
	}

	/**
	 * Add a new block, blockTx Only Txis.
	 * @param {object} block 
	 * @param {string} block.hash block hash.
	 * @param {string} block.header block header.(raw format)
	 * @param {string[]} block.txids Transactions in the block.(raw format)
	 * @returns {rpcReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	async newBlockOnlyTxids(block: { hash: string, header: string, coinbaseRaw: string }): Promise<rpcReturn> {
		if (!newBlockOnlyTxidsValidate({ block })) {
			console.error(newBlockOnlyTxidsValidate.errors);
			return { error: newBlockOnlyTxidsValidate.errors[0].message };
		}
		let r = await this.task.newBlockOnlyTxids(block);
		if (r.err) {
			return { error: r.err };
		}
		return { result: r.data };
	}


	/**
	 * Get PoW difficulty
	 * @param {boolean} raw Whether the difficulty is expressed in raw.
	 * @returns {rpcReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	async getDifficulty(raw: boolean): Promise<rpcReturn> {
		let r = await this.task.getDifficulty(raw);
		if (r === false) {
			return { error: 'getDifficulty' };
		}

		if (raw) {
			return { result: r.toString('hex') };
		}

		return { result: r };
	}

	/**
	 * Now status.
	 * @returns 
	 * ```
	 * {
	 *  time,	  	
	 *  nowHeight, 
	 *  difficulty, 
	 *  mining,	
	 *  walletReindexing,	
	 *  txPoolLen, 
	 *  memoryUsed
	 * }
	 * ```
	 */
	async getStatus(): Promise<rpcReturn> {
		let r = await this.task.getStatus();
		if (this.p2p) {
			r.connections = this.p2p.getConnections();
			r.version = this.p2p.getVersion();
		}
		return { result: r };
	}

	/**
	 * Add a new transaction.
	 * @param {string} srcAddress Send address.
	 * @param {string} tgtAddress Target address.
	 * @param {string} value Send amount of coin.
	 * @param {string} extraValue Amount reserved for fee.
	 * @param {string} feeRatio Fee ratio. Do not less than 1. 
	 * @param {boolean} useAllUTXO Use all UTXO
	 * @param {boolean} rawFlag Whether the transaction is expressed in raw.
	 * @returns {rpcReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	async walletCreateTransation(srcAddress: string, tgtAddress: string, value: string, extraValue: string = '0', feeRatio: string = '1', useAllUTXO: boolean = false, rawFlag: boolean): Promise<rpcReturn> {
		if (!walletCreateTransationValidate({ srcAddress, tgtAddress, value, extraValue, feeRatio, rawFlag })) {
			console.error(walletCreateTransationValidate.errors);
			return { error: walletCreateTransationValidate.errors[0].message };
		}

		let valueBig = BigInt(value);
		let extraValueBig = BigInt(extraValue);
		let feeRatioBig = BigInt(feeRatio);
		let r = await this.task.walletCreateTransation(srcAddress, tgtAddress, valueBig, extraValueBig, feeRatioBig, useAllUTXO);
		if (!r) {
			return { error: `createTransation fail!` };
		}

		let blockTx = r.blockTx;

		let txJson = blockTx.json;
		if (!txJson) {
			return { error: `createTransation fail!` };
		}

		if (rawFlag) {
			let raw: any = blockTx.getSerialize();
			if (!raw) {
				return { error: `createTransation fail!` };
			}
			raw = raw.toString('hex');

			return { result: { inValue: r.inValue, blockTx: { json: txJson, raw } } };
		}

		return { result: { inValue: r.inValue, blockTx: txJson } };
	}

	/**
	 * Add a new transaction.
	 * @param {string} srcAddress Send address.
	 * @param {object[]} target { address, value }[]
	 * @param {string} target[].address Target address.
	 * @param {string} target[].value Send amount of coin.
	 * @param {string} extraValue Amount reserved for fee.
	 * @param {string} feeRatio Fee ratio. Do not less than 1. 
	 * @param {boolean} useAllUTXO Use all UTXO
	 * @param {boolean} rawFlag Whether the transaction is expressed in raw.
	 * @returns {rpcReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	async walletCreateAdvancedTransation(srcAddress: string, target: { address: string, value: string }[] | string, extraValue: string = '0', feeRatio: string = '1', useAllUTXO: boolean = false, rawFlag: boolean): Promise<rpcReturn> {
		if (!walletCreateAdvancedTransationValidate({ srcAddress, target, extraValue, feeRatio, rawFlag })) {
			console.error(walletCreateAdvancedTransationValidate.errors);
			return { error: walletCreateAdvancedTransationValidate.errors[0].message };
		}

		let r
		let extraValueBig = BigInt(extraValue);
		let feeRatioBig = BigInt(feeRatio);
		if (typeof target === 'string') {
			r = await this.task.walletCreateAdvancedTransation(srcAddress, BigInt(target), extraValueBig, feeRatioBig, useAllUTXO);
		}
		else {
			let targetBig = target.map(({ address, value }) => ({ address, value: BigInt(value) }));
			r = await this.task.walletCreateAdvancedTransation(srcAddress, targetBig, extraValueBig, feeRatioBig, useAllUTXO);
		}

		if (!r) {
			return { error: `createTransation fail!` };
		}

		let blockTx = r.blockTx;

		let txJson = blockTx.json;
		if (!txJson) {
			return { error: `createTransation fail!` };
		}

		if (rawFlag) {
			let raw: any = blockTx.getSerialize();
			if (!raw) {
				return { error: `createTransation fail!` };
			}
			raw = raw.toString('hex');

			return { result: { inValue: r.inValue, blockTx: { json: txJson, raw } } };
		}

		return { result: { inValue: r.inValue, blockTx: txJson } };
	}

	/**
	 * Get wallet balance.
	 * @param {string|string[]} address One address or multiple addresses.
	 * @returns {rpcReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	async walletGetBalance(address: string | string[]): Promise<rpcReturn> {
		if (!getBalanceValidate({ address })) {
			console.error(getBalanceValidate.errors);
			return { error: getBalanceValidate.errors[0].message };
		}

		let r: any = await this.task.walletGetBalance(address);
		if (!r) {
			return { error: `address (${address}) is not found. Try running walletAutoWatch.` };
		}

		return { result: r };
	}

	/**
	 * wallet reindex
	 * @param {number} startHeight Reindexing the starting height of the wallet.
	 * @returns {rpcReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	walletReindex(startHeight: number): rpcReturn {
		if (startHeight !== undefined && typeof startHeight !== 'number') {
			return { error: 'type error' };
		}

		let r = this.task.walletReindex(startHeight);
		if (!r) {
			return { error: 'Fail' };
		}
		return { result: 'Done' };
	}

	/**
	 * Clear wallet history.
	 * @returns {rpcReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	async walletClearHistory(): Promise<rpcReturn> {
		let r = await this.task.walletClearHistory();
		if (!r) {
			return { error: 'Fail' };
		}
		return { result: 'Done' };
	}

	/**
	 * Need to monitor the address of the wallet.
	 * @param {string} address Monitor the address.
	 * @returns {rpcReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	async walletAddWatchAddress(address: string): Promise<rpcReturn> {
		if (!walletAddWatchAddressValidate({ address })) {
			console.error(walletAddWatchAddressValidate.errors);
			return { error: walletAddWatchAddressValidate.errors[0].message };
		}

		let r = await this.task.walletAddWatchAddress(address);
		if (!r) {
			return { error: 'Fail' };
		}
		return { result: 'Done' };
	}

	/**
	 * Get transactions for single or multiple addresses.
	 * @param {string} address Watch address.
	 * @param {number} [limit=20] Number of limit.
	 * @param {number} [skip=0] Number of skip.
	 * @returns {rpcReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	async walletGetTxList(address: string, limit: number = 20, skip: number = 0, reverse: boolean = true, normalFlag?: boolean): Promise<rpcReturn> {
		if (!walletGetTxListValidate({ address, limit, skip, reverse, normalFlag })) {
			console.error(walletGetTxListValidate.errors);
			return { error: walletGetTxListValidate.errors[0].message };
		}
		let r = await this.task.walletGetTxList(address, { limit, skip, reverse }, normalFlag);
		if (!r) {
			return { error: 'Fail' };
		}

		return { result: r };
	}

	/**
	 * Get untraded list.
	 * @param {string} address Watch address.
	 * @param {number} [limit=20] Number of limit.
	 * @param {number} [skip=0] Number of skip.
	 * @param {boolean} [reverse=0] Sort Reverse.
	 * @returns {rpcReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	async walletGetUTXOList(address: string, limit: number = 20, skip: number = 0, reverse: boolean = true): Promise<rpcReturn> {
		if (!walletGetTxListValidate({ address, limit, skip })) {
			console.error(walletGetTxListValidate.errors);
			return { error: walletGetTxListValidate.errors[0].message };
		}
		let r = await this.task.walletGetUTXOList(address, { limit, skip, reverse });
		if (!r) {
			return { error: 'Fail' };
		}
		return { result: r };
	}

	/**
	 * Add a new connectable node.
	 * Try to connect to the new node before joining and add to the connection table if you can connect.
	 * @param {string} ip Input ip.
	 * @param {string} port Input server's port.
	 * @returns {rpcReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	async p2pAddPeer(ip: string, port?: number): Promise<rpcReturn> {
		if (!this.p2p) {
			return { error: 'The p2p not found.' };
		}
		if (!peerValidate({ ip, port })) {
			console.error(peerValidate.errors);
			return { error: peerValidate.errors[0].message };
		}
		let r = await this.p2p.addPeer(ip, port);
		return { result: r };
	}

	/**
	 * Delete connectable nodes.
	 * Delete the specified node in the connection table.
	 * @param {string} peer Input ip and port. format: "[ip]:[port]"
	 * @returns {rpcReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	async p2pDeletePeer(ip: string, port?: number): Promise<rpcReturn> {
		if (!this.p2p) {
			return { error: 'The p2p not found.' };
		}
		if (!peerValidate({ ip, port })) {
			console.error(peerValidate.errors);
			return { error: peerValidate.errors[0].message };
		}
		let r = await this.p2p.deletePeer(ip, port);
		return { result: r };
	}

	/**
	 * Add a new list of blacklistable connections.
	 * Disable specified ip connection.
	 * @param {string} ip ip address.
	 * @returns {rpcReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	async p2pAddBlackList(ip: string): Promise<rpcReturn> {
		if (!this.p2p) {
			return { error: 'The p2p not found.' };
		}
		if (!peerValidate({ ip })) {
			console.error(peerValidate.errors);
			return { error: peerValidate.errors[0].message };
		}
		let r = await this.p2p.addBlackList(ip);
		return { result: r };
	}

	/**
	 * Delete connectable blacklist.
	 * @param {string} peer ip address.
	 * @returns {rpcReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	async p2pDeleteBlackList(ip: string): Promise<rpcReturn> {
		if (!this.p2p) {
			return { error: 'The p2p not found.' };
		}
		if (!peerValidate({ ip })) {
			console.error(peerValidate.errors);
			return { error: peerValidate.errors[0].message };
		}
		let r = await this.p2p.deleteBlackList(ip);
		return { result: r };
	}

	/**
	 * List the status of nodes that are currently connected.
	 * @returns {rpcReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	async p2pStatus(): Promise<rpcReturn> {
		if (!this.p2p) {
			return { error: 'The p2p not found.' };
		}
		let r = await this.p2p.getStatus();
		return { result: r };
	}

	/**
	 * List connectable nodes.
	 * @returns {rpcReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	async p2pGetPeerList(): Promise<rpcReturn> {
		if (!this.p2p) {
			return { error: 'The p2p not found.' };
		}
		let r = await this.p2p.getPeerList();
		return { result: r };
	}

	/**
	 * List all banned ip address.
	 * @returns {rpcReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	async p2pGetBlackList(): Promise<rpcReturn> {
		if (!this.p2p) {
			return { error: 'The p2p not found.' };
		}
		let r = await this.p2p.getBlackList();
		return { result: r };
	}

	async pollingNewBlock(res, nowHash?: string): Promise<rpcReturn> {
		if (nowHash && this.task.core.nowHash !== nowHash) {
			return { result: this.task.core.nowHash };
		}
		let data = await this.newBlockPollCollector.addRes(res);
		if (!data) {
			return { error: 'pollingNewBlock fail' };
		}
		return data;
	}

	async pollingForkBlock(res): Promise<rpcReturn> {
		let data = await this.forkBlockPollCollector.addRes(res);
		if (!data) {
			return { error: 'pollingForkBlock fail' };
		}
		return data;
	}

	async pollingAddTx(res): Promise<rpcReturn> {
		let data = await this.addTxPollCollector.addRes(res);
		if (!data) {
			return { error: 'pollingAddTx fail' };
		}
		return data;
	}

	exit() {
		console.log('rpc server exit');
		if (!this.server) {
			return;
		}
		if (this.pqc) {
			this.pqc.clearSchedulingStop();
		}
		return new Promise(r => {
			for (let socket of this.sockets) {
				socket.destroy();
				this.sockets.delete(socket);
			}
			this.server.close(r);
		});
	}

	/**
	 * BlockData to json.
	 * @param {BlockDataFormat} block BlockData.
	 * @returns 
	 */
	static BlockDataToJson(block) {
		block.header = (new BlockHeader(block.header, true)).json;
		if (block.txs) {
			block.txs = block.txs.map(x => BlockTx.serializeToJson(x));
		}
		return block;
	}
}

export default RpcServer;