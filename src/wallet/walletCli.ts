import fs from 'fs';
import * as readline from 'node:readline';
import { stdin, stdout } from 'process';
import { Wallet } from './wallet';
import { BlockTx } from '../core';
import { getSignSysAll } from '../blockchain/signType';
import { getCompactSizeBufferByNumber } from '../blockchain/util';
import { methodParamsType, methodParamsTypeBigIntFloat, jsonReplacer, checkAddressIsBs58ck, chAddress } from './cliArg';
import bs58ck from '../crypto/bs58ck';
import methodParamssHelp from './walletStr';
import { PostRequest } from './postRequest';
import { shake256 } from '../crypto/hash';
import { rlQuestion, printMsg } from '../indexUtil/util'
import { deserialize, serialize } from 'bson';
import { jsonParse, jsonStringify } from '../api/json';
import { SafePasswordBuf } from '../crypto/safePassword';
import { bigIntToFloatString, floatToPercentage } from '../api/type';
import { OpReturn, Vout } from '../blockchain/blockTx';
import { getTableStr } from './util';

const colorize = require('json-colorizer');

type rpcOpt = {
	hostname: string;
	port: number;
	auth: {
		usr: string;
		pw: string;
	}
}

type cliReturn = {
	error?: any;
	result?: any;
	tableStr?: any;
}

const colorOpt = {
	colors: {
		BRACE: 'white',
		BRACKET: 'white',
		COLON: 'white',
		COMMA: 'white',
		STRING_KEY: 'white',
		STRING_LITERAL: 'green',
		NUMBER_LITERAL: 'yellow',
		BOOLEAN_LITERAL: 'yellow',
		NULL_LITERAL: 'yellow',
	}
}

let completions = Object.keys(methodParamsType).sort();

function completer(line) {
	var hits = completions.filter((c) => {
		if (c.indexOf(line) == 0) {
			return c;
		}
	});

	return [hits && hits.length ? hits : completions, line];
}

function requiredArg(paramName: string = 'argument'): any {
	throw new Error(`The ${paramName} is required`);
}

/**
 * @class
 * @classdesc wallet cli class
 */
class WalletCli {
	rpcOpt?: rpcOpt;
	sendId: number;
	jsonSpace: boolean;
	jsonColor: boolean;
	addressBs58ck: boolean;
	bigIntObjFloatFlag: boolean;
	runFlag: boolean;
	methodParamsType: object;
	auth: String;
	rl: readline.Interface;
	postRequest: PostRequest;
	wallet?: Wallet;
	additionalInterfaces: any;
	private _txTemp?: BlockTx;
	private initFlag: boolean;
	private jsonTable: boolean;

	constructor(rpcOpt?: rpcOpt, wallet?: Wallet, opt?: { jsonSpace?: boolean, jsonColor?: boolean, jsonTable: boolean, addressBs58ck?: boolean, bigIntObjFloatFlag?: boolean, additionalInterfaces?: any, rl?: readline.Interface }, rpcOnly: boolean = false) {
		this.rpcOpt = rpcOpt;
		this.sendId = 0;
		this.jsonSpace = typeof (opt?.jsonSpace) === "boolean" ? opt?.jsonSpace : true;
		this.jsonColor = typeof (opt?.jsonColor) === "boolean" ? opt?.jsonColor : true;
		this.addressBs58ck = typeof (opt?.addressBs58ck) === "boolean" ? opt?.addressBs58ck : true;
		this.bigIntObjFloatFlag = typeof (opt?.bigIntObjFloatFlag) === "boolean" ? opt?.bigIntObjFloatFlag : true;
		this.runFlag = false;
		this.methodParamsType = (this.bigIntObjFloatFlag) ? methodParamsTypeBigIntFloat : methodParamsType;
		this.rl = (opt.rl) ? opt.rl : readline.createInterface(stdin, stdout, completer);
		this.postRequest = new PostRequest(rpcOpt);
		if (!rpcOnly) {
			if (wallet) {
				this.wallet = wallet;
			}
			else {
				this.wallet = new Wallet();
			}
		}
		else {
			console.log('rpcOnly Mode');
			let rpcOnlyError = { error: 'rpcOnly flag = true, disable wallet mode' };
			this.cliMethod.generateWallet = async () => rpcOnlyError;
			this.cliMethod.importWalletFile = async () => rpcOnlyError;
			this.cliMethod.exportWalletFile = () => rpcOnlyError;
			this.cliMethod.walletGetSignSysList = () => rpcOnlyError;
			this.cliMethod.walletAddAddress = async () => rpcOnlyError;
			this.cliMethod.walletGetAddressList = () => rpcOnlyError;
			this.cliMethod.walletGetAddressDetails = () => rpcOnlyError;
			this.cliMethod.walletGetBalance = async () => rpcOnlyError;
			this.cliMethod.walletCreateTransation = async () => rpcOnlyError;
			this.cliMethod.walletCreateAdvancedTransation = async () => rpcOnlyError;
			this.cliMethod.walletSend = async () => rpcOnlyError;
			this.cliMethod.walletSendMany = async () => rpcOnlyError;
			this.cliMethod.walletGetTxList = async () => rpcOnlyError;
			this.cliMethod.walletGetUTXOList = async () => rpcOnlyError;
			this.cliMethod.walletAutoWatch = async () => rpcOnlyError;
			this.cliMethod.switchWallet = () => rpcOnlyError;
			this.cliMethod.txAddPqcertRoot = () => rpcOnlyError;
			this.cliMethod.txAddPqcertPubKey = () => rpcOnlyError;
			this.cliMethod.checkSignPqcert = async () => rpcOnlyError;
			this.cliMethod.signTx = async () => rpcOnlyError;
		}
		this.additionalInterfaces = (opt.additionalInterfaces) ? opt.additionalInterfaces : undefined;
		this.jsonTable = (opt.jsonTable === false) ? false : true;
	}

	async init(rlFlag?: boolean) {
		if (this.initFlag) {
			return;
		}
		this.initFlag = true;
		if (rlFlag) {
			console.log('Wallet cli starts!');
			this.rl.on('line', async (input: any) => {
				if (this.runFlag) {
					return;
				}

				this.pause();
				input = input.split(' ');
				//Removing the last space.
				while (input[input.length - 1].length === 0) {
					input.pop();
					if (input.length === 0) {
						return this.resume();
					}
				}

				//Remove leading space.
				while (input[0].length === 0) {
					input = input.slice(1);
					if (input.length === 0) {
						return this.resume();
					}
				}

				let method = input[0];
				let params = input.slice(1);

				if (!this.methodParamsType[method]) {
					console.error(`ERROR: The method '${method}' is not found`);
					return this.resume();
				}

				if (this.methodParamsType[method].length < params.length) {
					printMsg(`ERROR: params is over ${this.methodParamsType[method].length}`, true);
					return this.resume();
				}

				for (let i = 0; i < params.length; i++) {
					params[i] = this.methodParamsType[method][i](params[i]);
					if (params[i] === null) {
						console.error(`ERROR: params[${i}] is error`);
						return this.resume();
					}
				}

				if (this.cliMethod[method]) {
					let r
					try {
						r = (this.cliMethod[method].constructor.name === "AsyncFunction") ? await this.cliMethod[method].call(this, ...params) : this.cliMethod[method].call(this, ...params);
					}
					catch (e) {
						console.error('ERROR: ', e);
						return this.resume();
					}

					if (r.error) {
						console.error(r.error);
						return this.resume();
					}
					if (this.jsonTable && r.tableStr) {
						console.log(r.tableStr);
					}
					else if (typeof r.result === 'string') {
						console.log(r.result);
					}
					else {
						console.log(this.jsonStringify(r.result));
					}
				}
				else {
					let r = await this.post({ method, params, id: this.sendId });
					this.sendId++;

					if (r.err) {
						console.error('ERROR: ', r.err);
						return this.resume();
					}

					try {
						let obj = jsonParse(r.data);
						if (obj.error) {
							console.error('ERROR: ', obj.error);
							return this.resume();
						}

						let json = this.jsonStringify(obj.result);
						if (!json) {
							return this.resume();
						}

						console.log(json);

					}
					catch (e) {
						console.error(`ERROR: ${e}`);
						return this.resume();
					}
				}

				this.resume();
			});
		}

		this.postRequest.init();
	}

	pause() {
		// this.rl.pause();
		this.runFlag = true
	}

	resume() {
		// this.rl.resume();
		this.runFlag = false;
	}

	/**
	 * The help function can display the usage of the method and how to input parameters.
	 * @param methodName Show usage of the method. If not set show all method.
	 * @param detail Display simple or detail.
	 * @returns {cliReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	help(methodName?: string, detail?: boolean): cliReturn {
		if (!methodName) {
			let keysort = (Object.keys(methodParamssHelp)).sort();
			let r = '------- Help list -------\n';

			for (let i = 0; i < keysort.length; i++) {
				// for (let x in methodParamssHelp) {
				r += `\n${methodParamssHelp[keysort[i]].simple}\n`;
			}
			r += '-------------------------\n';
			return { result: r };
		}

		if (!methodParamssHelp[methodName]) {
			return { error: `ERROR: The method ${methodName} is not found` };
		}

		return { result: (detail) ? methodParamssHelp[methodName].detail : methodParamssHelp[methodName].simple };
	}

	/**
	 * Json Stringify function.
	 * @param obj object.
	 * @returns {false|string} If complete return `string` else return `false`.
	 */
	jsonStringify(obj) {
		let str;
		try {
			if (this.jsonSpace) {
				str = jsonStringify(obj, { space: ' ', bigIntObjFlag: false, bufferObjFlag: false, bigIntObjFloatFlag: this.bigIntObjFloatFlag });
				if (this.jsonColor) {
					return colorize(str, colorOpt);
				}
				else {
					return str;
				}
			}
			else {
				return JSON.stringify(obj, jsonReplacer);
			}
		}
		catch (e) {
			console.error(`ERROR: ${e}`);
			return false;
		}
	}

	async post(msg: any): Promise<{ err?: any, data?: any }> {
		return await this.postRequest.emit(msg);
	}

	/**
	 * Use space indentation when displaying JSON format.
	 * @param {boolean} b
	 */
	setJsonSpace(b: boolean) {
		this.jsonSpace = b;
		return { result: b };
	}

	/**
	 * Display color when displaying JSON format.
	 * @param {boolean} b
	 */
	setJsonColor(b: boolean) {
		this.jsonSpace = b;
		return { result: b };
	}

	setJsonTable(b: boolean) {
		this.jsonTable = b;
		return { result: b };
	}

	/**
	 * Clear Screen.
	 */
	clear() {
		console.clear();
		return { result: 'clear' };
	}

	/**
	 * Create a new wallet.
	 * @returns {cliReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	async generateWallet(): Promise<cliReturn> {
		let ans;
		let kps = this.wallet.getKeyPair();
		if (!(!kps || kps.length == 0)) {
			ans = await rlQuestion(this.rl, 'Generate a wallet? (y/n): ');
			if (!ans.match(/^y(es)?$/i)) {
				return { result: 'Cancelled. ' };
			}
		}

		let label = await rlQuestion(this.rl, 'Enter your label for this wallet: ');

		ans = await rlQuestion(this.rl, 'Encrypt your wallet? (y/n): ');
		let aesKey: SafePasswordBuf;
		if (ans.match(/^y(es)?$/i)) {
			ans = await rlQuestion(this.rl, 'Please enter your password, the password (utf8) you enter will be used as the input of shake256 to generate the key: ', { passwordMode: true });
			let ans2 = await rlQuestion(this.rl, 'Please re-enter the password: ', { passwordMode: true });
			if (ans !== ans2) {
				return { error: 'ERROR: Password mismatch.' };
			}
			aesKey = new SafePasswordBuf(shake256(Buffer.from(ans, 'utf8')));
		}

		let opt = {
			keyTypes: getSignSysAll().map((x, i) => ({ version: 0, signType: i }))
		}

		let newWid = await this.wallet.genNewWallet(opt, aesKey, label);
		if (newWid === false) {
			return { error: 'Failed to create a new wallet. ' }
		}

		let originWid = this.wallet.getNowWid();
		let ansAddAddr = await rlQuestion(this.rl, 'New wallet was generated. Add an address to new wallet? (y/n): ');
		if (ansAddAddr.match(/^y(es)?$/i)) {
			if (!this.wallet.switchWallet(newWid)) {
				console.error(`ERROR: Add a new address failed`);
			}
			let r = await this.walletAddAddress();
			this.wallet.switchWallet(originWid);
			if (r.error) {
				console.error(r.error);
			}
			console.log(r.result);
		}

		if (newWid !== 0) {
			let ansSwitchWallet = await rlQuestion(this.rl, `Switch to new wallet(now wallet id:${originWid}, new wallet id:${newWid})?  (y/n): `);
			if (ansSwitchWallet.match(/^y(es)?$/i)) {
				let r = this.switchWallet(newWid);
				if (r.error) {
					console.error(r.error);
				}
				console.log(r.result);
			}
		}
		return { result: `Done.` };
	}

	/**
	 * Import wallet file location.
	 * @param {string} walletFilePath Wallet file location.
	 * @returns {cliReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	async importWalletFile(walletFilePath: string = requiredArg('walletFilePath')): Promise<cliReturn> {
		let walletBson = fs.readFileSync(walletFilePath);
		let walletJson = deserialize(walletBson, { promoteBuffers: true });

		if (walletJson.wallets == undefined || !Array.isArray(walletJson.wallets) || walletJson.wallets.length == 0) {
			return { error: 'ERROR: Failed to import wallet file!' };
		}

		console.log('\x1b[33m%s\x1b[0m', `There are ${walletJson.wallets.length} wallets to be imported!`);
		let result = [];
		for (let i = 0; i < walletJson.wallets.length; i++) {
			let aWallet = walletJson.wallets[i];

			console.log('\x1b[33m%s\x1b[0m', `Import wallet label: ${aWallet.label}`);
			let r = await this.importWalletByJson(aWallet);
			if (r) {
				result.push('Done')
			}
			else {
				result.push('Fail')
			}
		}

		return { result: `result of import wallet: ${result}` };
	}

	async importWalletByJson(walletJson) {
		let aesKey: SafePasswordBuf;
		if (walletJson.encryptionFlag) {
			let pw = await rlQuestion(this.rl, 'Please enter your password, the password (utf8) you enter will be used as the input of shake256 to generate the key: ', { passwordMode: true });
			aesKey = new SafePasswordBuf(shake256(Buffer.from(pw)));
		}

		let r = await this.wallet.importWallet(walletJson, aesKey);
		if (!r || !Array.isArray(r?.address)) {
			return false;
		}

		for (let i = 0; i < r.address.length; i++) {
			let address = r.address[i];
			let req = await this.post({
				method: "walletAddWatchAddress",
				params: [address]
			});
			if (req.err) {
				return { error: req.err };
			}
		}

		return true;
	}

	/**
	 * Export the location of the Wallet file.
	 * @param {string} walletFilePath Export wallet file location.
	 * @param {boolean} [exportAllFlag=false] Whether to export all wallet files.
	 * @returns {cliReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	exportWalletFile(path: string = requiredArg('path'), exportAllFlag: boolean = false): cliReturn {
		let fname = `${path}_${Date.now()}.wallet`;
		let exportJson;
		if (exportAllFlag) {
			exportJson = this.wallet.exportAllWallet();
		} else {
			exportJson = this.wallet.exportWallet();
		}

		if (!exportJson) {
			return { error: 'ERROR: exportWallet failed!' };
		}

		let bsonData = serialize(exportJson);
		if (!bsonData) {
			return { error: 'ERROR: exportWallet bsonData failed!' };
		}
		fs.writeFileSync(fname, bsonData);

		return { result: `Exporting wallet file succeeded: ${fname}` };
	}

	/**
	 * Get Wallet Sign System List.
	 * @returns {cliReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	walletGetSignSysList(): cliReturn {
		let kps = this.wallet.getKeyPair();
		if (!kps) {
			return { error: 'ERROR: Getting wallet keypairs failed' };
		}
		let data = [];
		for (let x in kps) {
			data.push({
				pubHash: kps[x].hash.toString('hex'),
				version: kps[x].version,
				signType: kps[x].signType,
				signName: kps[x].signSysName
			});
		}

		return { result: data };
	}

	/**
	 * Create a wallet address.
	 * `level` The number of required signatures out of the addresses.
	 * `fakeAmount` Number of fake pqcert, default is 1.
	 * `shuffleFlag]` Whether to switch the order of signatures.
	 * @returns {cliReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	async walletAddAddress(): Promise<cliReturn> {
		let r: string | false;
		let kps = this.wallet.getKeyPair();
		if (!kps) {
			return { error: 'ERROR: Getting wallet keypairs failed' };
		}

		let ans = await rlQuestion(this.rl, 'Quickly add an address? (y/n): ');
		if (ans.match(/^y(es)?$/i)) {
			let pkhs = [0, 1, 3];

			let Signatures = [];
			for (let i = 0; i < pkhs.length; i++) {
				Signatures.push(kps[pkhs[i]].signSysName);
			}

			let version = 0;
			let level = 2;
			let fakeAmount = 1;
			let shuffleFlag = false;

			let parameterTableData: any = {};
			parameterTableData['Signatrue'] = Signatures.join(', ');
			parameterTableData['Level'] = level;
			parameterTableData['Fake amount'] = fakeAmount;
			parameterTableData['Shuffle'] = shuffleFlag;
			console.log('New address Parameters: ');
			console.log(getTableStr(parameterTableData, undefined, { index: 'R', value: 'L' }));
			ans = await rlQuestion(this.rl, 'Above are the parameters of the new address, please confirm and generate? (y/n): ');

			if (!ans.match(/^y(es)?$/i)) {
				return { error: 'Cancelled.' };
			}

			r = await this.wallet.createAddress(pkhs, level, fakeAmount, version, shuffleFlag);
			if (!r) {
				return { error: 'ERROR: Generating address failed.' };
			}
		}
		else {
			let numOfSign = kps.length;
			ans = await rlQuestion(this.rl, `Enter the number of signatures mandatory (number >= 3, number <= ${numOfSign}): `);
			let numOfpkhs = parseInt(ans);
			if (numOfpkhs < 3 || Number.isNaN(numOfpkhs)) {
				return { error: 'ERROR: Number input error.' };
			}

			ans = await rlQuestion(this.rl, 'Randomly select the signature system? (y/n): ');
			let pkhs: number[] | number;
			if (ans.match(/^y(es)?$/i)) {
				pkhs = numOfpkhs;
			}
			else {
				let qusStr = `Which of the following ${numOfpkhs} signature systems you would like to choose for your signature: \n`;
				for (let x in kps) {
					qusStr += ` ${kps[x].signType}) ${kps[x].signSysName}\n`;
				}
				qusStr += 'Please enter the number and separate it with a comma(,).: ';
				let orderAns: any = await rlQuestion(this.rl, qusStr);
				orderAns = orderAns.split(',');
				if (orderAns.length !== numOfpkhs) {
					return { error: `ERROR: The number of signatures is incorrect! (It should be ${numOfpkhs}, you entered ${orderAns.length})` };
				}
				pkhs = orderAns.map((x: string) => parseInt(x));
			}

			let ansLv = await rlQuestion(this.rl, `Level? (number >= 2, number <= ${numOfSign}): `);
			let level = parseInt(ansLv);
			if (level < 2 || Number.isNaN(level) || level > numOfSign) {
				return { error: 'ERROR: Level input error.' };
			}

			let ansFake = await rlQuestion(this.rl, 'Number of fake signature?: ', { defultMsg: '1' });
			let fakeAmount = parseInt(ansFake);
			if (fakeAmount < 0 || Number.isNaN(fakeAmount)) {
				return { error: 'ERROR: Input error.' };
			}

			let ansShuf = await rlQuestion(this.rl, 'Shuffle the signature order? (y/n): ', { defultMsg: 'no' });
			let shuffleFlag = false;
			if (ansShuf.match(/^y(es)?$/i)) {
				shuffleFlag = true;
			}
			let version = 0;

			let ansLabel = await rlQuestion(this.rl, 'Label for this address: ');


			let Signatures = [];
			if (typeof pkhs !== 'number') {
				for (let i = 0; i < pkhs.length; i++) {
					Signatures.push(kps[pkhs[i]].signSysName);
				}
			}

			let parameterTableData: any = {};
			parameterTableData['Signatrue'] = Signatures.join(', ');
			parameterTableData['Level'] = level;
			parameterTableData['Fake amount'] = fakeAmount;
			parameterTableData['Shuffle'] = shuffleFlag;
			console.log('New address Parameters: ');
			console.log(getTableStr(parameterTableData, undefined, { index: 'R', value: 'L' }));
			ans = await rlQuestion(this.rl, 'Above are the parameters of the new address, please confirm and generate? (y/n): ');

			if (!ans.match(/^y(es)?$/i)) {
				return { result: 'Cancelled.' };
			}

			r = await this.wallet.createAddress(pkhs, level, fakeAmount, version, shuffleFlag, ansLabel);
			if (!r) {
				return { error: 'ERROR: Generating address failed.' };
			}
		}

		console.log('\x1b[33m%s\x1b[0m', 'Your address has been added, if you have a habit of backing up your wallet, please re-backup your wallet!!!');
		let r2 = await this.post({
			method: "walletAddWatchAddress",
			params: [r]
		});

		if (r2.err || r2.data.error) {
			console.log('\x1b[33m%s\x1b[0m', 'Not successfully synchronized with the node, please synchronize manually.(use walletAutoWatch)');
		}

		return { result: (this.addressBs58ck) ? bs58ck.encode(r) : r };
	}

	/**
	 * Get all addresses for the wallet.
	 * @returns {cliReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	walletGetAddressList(): cliReturn {
		let list = this.wallet.getAddressesList();
		if (!list) {
			return { error: 'ERROR: get addresses list was error.' };
		}
		return { result: (this.addressBs58ck) ? list.map(x => bs58ck.encode(x)) : list };
	}

	/**
	 * Wallet get address details.
	 * @param {string} address The wallet address.
	 * @param {boolean} origin show address origin data.
	 * @returns {cliReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	walletGetAddressDetails(address: string = requiredArg('address'), origin: boolean = false): cliReturn {
		if (address === undefined) {
			return { error: 'ERROR: input failed' };
		}
		let inputAddress = address;
		if (checkAddressIsBs58ck(address)) {
			let bs58 = bs58ck.decode(address);
			if (!bs58) {
				return { error: 'ERROR: base58check' };
			}
			address = bs58.toString('hex');
		}

		if (origin) {
			let result = this.wallet.getAddress(address);
			if (!result) {
				return { error: `ERROR: ${inputAddress} is not found` };
			}

			return { result };
		}

		let result = this.wallet.getAddressDetails(address);
		if (!result) {
			return { error: `ERROR: ${inputAddress} is not found` };
		}

		return { result };
	}

	/**
	 * Create transactions
	 * @param {string} srcAddress Send address.
	 * @param {string} tgtAddress Target address.
	 * @param {bigint} value send amount of coin.
	 * @param {bigint} extraValue Amount reserved for fee.
	 * @param {bigint} feeRatio Fee ratio. Do not less than 1.
	 * @param {boolean} rawFlag Whether the transaction is expressed in raw.
	 * @param {boolean} tempFlag Save this transaction raw temporarily.
	 * @returns {cliReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	async walletCreateTransation(srcAddress: string = requiredArg('srcAddress'), tgtAddress: string = requiredArg('tgtAddress'), value: bigint = requiredArg('value'), extraValue: bigint = 10000n, feeRatio: bigint = 1n, useAllUTXO: boolean = false, rawFlag: boolean = true, tempFlag: boolean = true): Promise<{ error?: any; result?: any; }> {
		if (checkAddressIsBs58ck(srcAddress)) {
			let bs58 = bs58ck.decode(srcAddress);
			if (!bs58) {
				return { error: 'ERROR: base58check' };
			}
			srcAddress = bs58.toString('hex');
		}
		if (checkAddressIsBs58ck(tgtAddress)) {
			let bs58 = bs58ck.decode(tgtAddress);
			if (!bs58) {
				return { error: 'ERROR: base58check' };
			}
			tgtAddress = bs58.toString('hex');
		}

		let r = await this.post({
			method: "walletCreateTransation",
			params: [srcAddress, tgtAddress, value.toString(), extraValue.toString(), feeRatio.toString(), useAllUTXO, rawFlag]
		});
		if (r.err) {
			return { error: r.err };
		}

		try {
			let obj = jsonParse(r.data);
			if (obj.error) {
				return { error: `ERROR: ${obj.error}` };
			}
			if (tempFlag) {
				let blockTx = BlockTx.jsonDataToClass((rawFlag) ? obj.result.blockTx.json : obj.result.blockTx);
				if (blockTx) {
					this.txTemp = blockTx;
				}
			}
			return { result: obj.result }
		}
		catch (e) {
			return { error: `ERROR: ${e}` };
		}
	}

	/**
	 * Create advanced transactions
	 * @param {string} srcAddress Send address.
	 * @param {object[]} target { address, value }[]
	 * @param {string} target[].address Target address.
	 * @param {string} target[].value Send amount of coin.
	 * @param {bigint} extraValue Amount reserved for fee.
	 * @param {bigint} feeRatio Fee ratio. Do not less than 1.
	 * @param {boolean} rawFlag Whether the transaction is expressed in raw.
	 * @param {boolean} tempFlag Save this transaction raw temporarily.
	 * @returns {cliReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	async walletCreateAdvancedTransation(srcAddress: string = requiredArg('srcAddress'), target: { address: string, value: bigint }[] | bigint = requiredArg('target'), extraValue: bigint = 10000n, feeRatio: bigint = 1n, useAllUTXO: boolean = false, rawFlag: boolean = true, tempFlag: boolean = true): Promise<{ error?: any; result?: any; }> {
		if (checkAddressIsBs58ck(srcAddress)) {
			let bs58 = bs58ck.decode(srcAddress);
			if (!bs58) {
				return { error: 'ERROR: base58check' };
			}
			srcAddress = bs58.toString('hex');
		}
		let r;
		if (typeof target === 'bigint') {
			r = await this.post({
				method: "walletCreateAdvancedTransation",
				params: [srcAddress, target.toString(), extraValue.toString(), feeRatio.toString(), useAllUTXO, rawFlag]
			});
		}
		else {
			let targetCopy = target.map(x => {
				let address;
				if (checkAddressIsBs58ck(x.address)) {
					let bs58 = bs58ck.decode(x.address);
					if (!bs58) {
						return { error: 'ERROR: base58check' };
					}
					address = bs58.toString('hex');
				}
				else {
					address = x.address;
				}
				return { address, value: x.value.toString() }
			});
			r = await this.post({
				method: "walletCreateAdvancedTransation",
				params: [srcAddress, targetCopy, extraValue.toString(), feeRatio.toString(), useAllUTXO, rawFlag]
			});
		}


		if (r.err) {
			return { error: r.err };
		}

		try {
			let obj = jsonParse(r.data);
			if (obj.error) {
				return { error: `ERROR: ${obj.error}` };
			}
			if (tempFlag) {
				let blockTx = BlockTx.jsonDataToClass((rawFlag) ? obj.result.blockTx.json : obj.result.blockTx);
				if (blockTx) {
					this.txTemp = blockTx;
				}
			}
			return { result: obj.result }
		}
		catch (e) {
			return { error: `ERROR: ${e}` };
		}
	}

	/**
	 * Get wallet balance.
	 * @returns {cliReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	async walletGetBalance(): Promise<cliReturn> {
		let addrList: any = this.wallet.getAddressesList();
		if (!addrList) {
			return { error: 'wallet is not found' }
		}
		let r = await this.post({
			method: "walletGetBalance",
			params: [addrList]
		});

		if (r.err) {
			return { error: r.err };
		}
		try {
			let obj = jsonParse(r.data);
			if (obj.error) {
				return { error: `ERROR: ${obj.error}` };
			}
			if (obj.result?.error) {
				return { error: `ERROR: ${obj.result?.error}` };
			}

			if (this.addressBs58ck) {
				for (let x in obj.result.sub) {
					let b58 = bs58ck.encode(x);
					obj.result.sub[b58] = obj.result.sub[x];
					delete obj.result.sub[x];
				}
			}
			let json = this.jsonStringify(obj.result);
			if (!json) {
				return { error: 'ERROR: jsonStringify failed' };
			}
			if (this.jsonTable) {
				let data = JSON.parse(jsonStringify(obj.result, { bigIntObjFlag: false, bufferObjFlag: false, bigIntObjFloatFlag: this.bigIntObjFloatFlag }));
				let cData = [];
				for (let x in data.sub) {
					cData.push({ address: x, confirmed: data.sub[x].confirmed, unconfirmed: data.sub[x].unconfirmed });
				}
				cData.push({ address: 'Total', confirmed: data.total.confirmed, unconfirmed: data.total.unconfirmed });
				let tableStr = getTableStr(cData, undefined, { address: 'L', confirmed: 'R', unconfirmed: 'R' });
				return { result: json, tableStr };
			}
			return { result: json }
		}
		catch (e) {
			return { error: `ERROR: ${e}` };
		}
	}

	/**
	 * The easy method. One-time transaction generation.
	 * @param {string} srcAddress Send address.
	 * @param {string} tgtAddress Target address.
	 * @param {bigint} value Send amount of coin.
	 * @param {number[]} signSelect This transaction is signed using the selected signature. And the length of the signature is related to the renewal fee.
	 * @param {bigint} feeRatio Fee ratio. Do not less than 1. 
	 * @param {boolean} useAllUTXO Use all UTXO
	 * @param {string} changeAddress Change address
	 * @returns {cliReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	async walletSend(srcAddress: string = requiredArg('srcAddress'), tgtAddress: string = requiredArg('tgtAddress'), value: bigint = requiredArg('value'), signSelect?: number[], opReturnStr?: string, feeRatio: bigint = 1n, useAllUTXO?: boolean, changeAddress?: string, checkFlag: boolean = true): Promise<{ result?: any, error?: any }> {
		let originInputSrcAddress = srcAddress;
		if (checkAddressIsBs58ck(srcAddress)) {
			let bs58 = bs58ck.decode(srcAddress);
			if (!bs58) {
				return { error: 'ERROR: base58check!' };
			}
			srcAddress = bs58.toString('hex');
		}

		if (checkAddressIsBs58ck(tgtAddress)) {
			let bs58 = bs58ck.decode(tgtAddress);
			if (!bs58) {
				return { error: 'ERROR: base58check!' };
			}
			tgtAddress = bs58.toString('hex');
		}

		if (useAllUTXO === undefined) {
			let ans = await rlQuestion(this.rl, 'Do you use all UTXO? (y/n): ');
			if (ans.match(/^y(es)?$/i)) {
				useAllUTXO = true;
			}
			else {
				useAllUTXO = false;
			}
		}

		if (changeAddress === undefined) {
			let ans = await rlQuestion(this.rl, `Set change address (default address is ${originInputSrcAddress}): `);
			if (ans === '') {
				changeAddress = srcAddress;
			}
			else if (!chAddress(ans)) {
				return { error: 'ERROR: change address' }
			}
			else {
				changeAddress = ans;
			}

			if (checkAddressIsBs58ck(changeAddress)) {
				let bs58 = bs58ck.decode(changeAddress);
				if (!bs58) {
					return { error: 'ERROR: base58check!' };
				}
				changeAddress = bs58.toString('hex');
			}
		}
		else {
			if (checkAddressIsBs58ck(changeAddress)) {
				let bs58 = bs58ck.decode(changeAddress);
				if (!bs58) {
					return { error: 'ERROR: base58check!' };
				}
				changeAddress = bs58.toString('hex');
			}
		}

		if (!signSelect) {
			let addressD = this.walletGetAddressDetails(srcAddress);
			if (addressD.error) {
				return { error: addressD.error };
			}

			let questionStr = `Which of the following ${addressD.result.level} signature systems you would like to choose for your signature: (FAKE is not an option)\n`;
			for (let i = 0; i < addressD.result.signSys.length; i++) {
				questionStr += ` ${i}) ${addressD.result.signSys[i]}\n`;
			}

			questionStr += 'Please enter the number and separate it with a comma. (must be in ascending order): ';
			let orderAns: any = await rlQuestion(this.rl, questionStr);
			orderAns = orderAns.split(',');
			if (orderAns.length !== addressD.result.level) {
				return { error: `ERROR: The number of signatures is incorrect! (It should be ${addressD.result.level}, you entered ${orderAns.length})` };
			}
			signSelect = orderAns.map(x => parseInt(x));
		}

		if (feeRatio < 1n) {
			return { error: 'ERROR: walletSend feeRatio < 1' };
		}

		let photon = this.wallet.getSignPhoton(srcAddress, signSelect);
		if (!photon) {
			return { error: 'ERROR: walletSend failed!' };
		}

		let pqcertCheck = await this.checkSignPqcert(srcAddress, signSelect, true);
		let pqcertAdd = [];
		if (pqcertCheck.error) {
			return { error: 'ERROR: Pqcert check error!' };
		}

		if (!pqcertCheck.result.root.check) {
			let pqcertRoot = this.wallet.getPqcertRootByAddress(srcAddress);
			if (!pqcertRoot) {
				return { error: 'pqcertRoot is not found!' }
			}
			photon += pqcertRoot.serialize.length * 2;
			let cs = getCompactSizeBufferByNumber(pqcertRoot.serialize.length);
			if (!cs) {
				return { error: 'ERROR: Pqcert error!' };
			}
			photon += cs.length;
			pqcertAdd.push(pqcertRoot);
		}

		for (let i = 0; i < pqcertCheck.result.pubHashs.length; i++) {
			if (!pqcertCheck.result.pubHashs[i].check) {
				let pqcertPubKey = this.wallet.getPqcertPubKeyByHash(pqcertCheck.result.pubHashs[i].hash);
				if (!pqcertPubKey) {
					return { error: 'pqcertPubKey is not found!' }
				}
				photon += pqcertPubKey.serialize.length * 2;
				let cs = getCompactSizeBufferByNumber(pqcertPubKey.serialize.length);
				if (!cs) {
					return { error: 'ERROR: pubHashs error!' };
				}
				photon += cs.length;
				pqcertAdd.push(pqcertPubKey);
			}
		}

		let opReturn: OpReturn;
		if (opReturnStr === undefined) {

			let oprAns: any = await rlQuestion(this.rl, 'Please enter an opreturn message (not required): ');
			opReturn = new OpReturn(Buffer.from(oprAns));
		}
		else {
			opReturn = new OpReturn(Buffer.from(opReturnStr));
		}

		photon += opReturn.serialize.length * 5;
		let oprCs = getCompactSizeBufferByNumber(opReturn.serialize.length);
		if (!oprCs) {
			return { error: 'ERROR: pubHashs error!' };
		}
		photon += oprCs.length;

		let extraValue = BigInt(photon) * feeRatio;

		let Signs = [];
		let addressDetails = this.wallet.getAddressDetails(srcAddress);
		if (!addressDetails) {
			return { error: 'addressDetails is not found!' }
		}
		for (let i = 0; i < signSelect.length; i++) {
			let signName = addressDetails.signSys[signSelect[i]];
			if (signName === 'FAKE') {
				return { error: 'sign is FAKE!' }
			}
			Signs.push(signName);
		}

		let r0 = await this.walletCreateTransation(srcAddress, tgtAddress, value, extraValue, feeRatio, useAllUTXO, true, false);
		if (r0.error) {
			return { error: r0.error };
		}

		if (!r0.result.blockTx.raw) {
			return { error: 'walletCreateTransation failed!' };
		}

		let nonSignTx = BlockTx.serializeToClass(Buffer.from(r0.result.blockTx.raw, 'hex'));
		if (!nonSignTx) {
			return { error: 'walletCreateTransation failed!' };
		}
		nonSignTx.setOpReturn(opReturn);
		for (let i = 0; i < pqcertAdd.length; i++) {
			let x = pqcertAdd[i];
			nonSignTx.addPqcert(x);
		}
		let inValue: bigint | string = BigInt(r0.result.inValue);
		let preChangeAmount: bigint = inValue - nonSignTx.vout[0].value;
		if (preChangeAmount <= 0n) {
			return { error: 'changeAmount failed!' };
		}
		let preChageVoutBuf = Vout.jsonDataToSerialize({
			value: preChangeAmount.toString(10),
			lockScript: `20${changeAddress}fc`
		});
		if (!preChageVoutBuf) {
			return { error: 'changeAmount failed!' };
		}
		nonSignTx.vout.push(new Vout(preChageVoutBuf));
		let nonSignTxRaw = nonSignTx.getSerialize();
		if (!nonSignTxRaw) {
			return { error: 'walletCreateTransation failed!' };
		}

		let r1: any = await this.signTx(srcAddress, signSelect, feeRatio, true, true, false, nonSignTxRaw.toString('hex'));
		if (r1.error) {
			return { error: r1.error };
		}

		if (!r1.result?.raw) {
			return { error: 'Signing failed' };
		}

		let thisTx = BlockTx.serializeToClass(Buffer.from(r1.result.raw, 'hex'));

		if (!thisTx) {
			return { error: 'Signing data failed!' };
		}

		let sendAmount: bigint | string = thisTx.vout[0].value;
		let changeAmount: bigint | string = (thisTx.vout[1]) ? thisTx.vout[1].value : 0n;
		let fee: bigint | string = inValue - sendAmount - changeAmount;
		let actualPhoton = thisTx.getPhoton();
		if (!actualPhoton) {
			return { error: 'Getting ActualPhoton failed!' };
		}

		let photonDetails = thisTx.getPhotonDetails();
		if (!photonDetails) {
			return { error: 'Getting Photon details failed!' };
		}

		let feeDetails = '';
		feeDetails += `unlockScript: ${floatToPercentage(photonDetails.unlockScriptPhoton / actualPhoton)},`;
		feeDetails += ` pqcert: ${floatToPercentage(photonDetails.pqcertPhoton / actualPhoton)},`;
		feeDetails += ` opReturn: ${floatToPercentage(photonDetails.opReturnPhoton / actualPhoton)},`;
		feeDetails += ` other: ${floatToPercentage(photonDetails.otherPhoton / actualPhoton)},`;

		if (this.bigIntObjFloatFlag) {
			inValue = bigIntToFloatString(inValue);
			sendAmount = bigIntToFloatString(sendAmount);
			changeAmount = bigIntToFloatString(changeAmount);
			fee = bigIntToFloatString(fee);
		}

		let tableData: any = {};
		tableData['Source'] = `${(this.addressBs58ck) ? bs58ck.encode(srcAddress) : srcAddress}`;
		tableData['Target'] = `${sendAmount} -> ${(this.addressBs58ck) ? bs58ck.encode(tgtAddress) : tgtAddress}`;
		tableData['UTXO amount'] = `${inValue}`;
		tableData['Sending'] = `${sendAmount}`;
		if (changeAmount === '0.00000000') {
			tableData['Change'] = '0';
		}
		else {
			tableData['Change'] = `${changeAmount} -> ${(this.addressBs58ck) ? bs58ck.encode(changeAddress) : changeAddress}`;
		}
		tableData['Fee amount'] = `${fee}`;
		tableData['Fee details'] = `${feeDetails}`;
		tableData['Photon amount'] = `${actualPhoton}`;
		tableData['Signatrue'] = `${Signs.join(', ')}`;
		console.log('Transaction details: ');
		console.log(getTableStr(tableData, undefined, { index: 'R', value: 'L' }));
		if (checkFlag) {
			let ans = await rlQuestion(this.rl, 'Please check if your transaction (above) is correct. (y/n): ');
			if (!ans.match(/^y(es)?$/i)) {
				this.clearTxTemp();
				return { error: 'Cancelled.' };
			}
		}
		return await this.sendTx(r1.result.raw);
	}

	/**
	 * The easy method. One-time transaction generation.
	 * @param {string} srcAddress Send address.
	 * @param {object[]} target { address, value }[]
	 * @param {string} target[].address Target address.
	 * @param {string} target[].value Send amount of coin.
	 * @param {number[]} signSelect This transaction is signed using the selected signature. And the length of the signature is related to the renewal fee.
	 * @param {bigint} feeRatio Fee ratio. Do not less than 1. 
	 * @param {boolean} useAllUTXO Use all UTXO
	 * @param {string} changeAddress Change address
	 * @returns {cliReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	async walletSendMany(srcAddress: string = requiredArg('srcAddress'), target: { address: string, value: bigint }[] = requiredArg('target'), signSelect?: number[], opReturnStr?: string, feeRatio: bigint = 1n, useAllUTXO?: boolean, changeAddress?: string, checkFlag: boolean = true): Promise<{ result?: any, error?: any }> {
		let originInputSrcAddress = srcAddress;
		if (checkAddressIsBs58ck(srcAddress)) {
			let bs58 = bs58ck.decode(srcAddress);
			if (!bs58) {
				return { error: 'ERROR: base58check!' };
			}
			srcAddress = bs58.toString('hex');
		}
		for (let i = 0; i < target.length; i++) {
			if (checkAddressIsBs58ck(target[i].address)) {
				let bs58 = bs58ck.decode(target[i].address);
				if (!bs58) {
					return { error: 'ERROR: base58check' };
				}
				target[i].address = bs58.toString('hex');
			}
		}

		if (useAllUTXO === undefined) {
			let ans = await rlQuestion(this.rl, 'Do you use all UTXO? (y/n): ');
			if (ans.match(/^y(es)?$/i)) {
				useAllUTXO = true;
			}
			else {
				useAllUTXO = false;
			}
		}

		if (changeAddress === undefined) {
			let ans = await rlQuestion(this.rl, `Set change address (default address is ${originInputSrcAddress}): `);
			if (ans === '') {
				changeAddress = srcAddress;
			}
			else if (!chAddress(ans)) {
				return { error: 'ERROR: change address' }
			}
			else {
				changeAddress = ans;
			}
			if (checkAddressIsBs58ck(changeAddress)) {
				let bs58 = bs58ck.decode(changeAddress);
				if (!bs58) {
					return { error: 'ERROR: base58check!' };
				}
				changeAddress = bs58.toString('hex');
			}
		}
		else {
			if (checkAddressIsBs58ck(changeAddress)) {
				let bs58 = bs58ck.decode(changeAddress);
				if (!bs58) {
					return { error: 'ERROR: base58check!' };
				}
				changeAddress = bs58.toString('hex');
			}
		}

		if (!signSelect) {
			let addressD = this.walletGetAddressDetails(srcAddress);
			if (addressD.error) {
				return { error: addressD.error };
			}

			let questionStr = `Which of the following ${addressD.result.level} signature systems you would like to choose for your signature: (FAKE is not an option)\n`;
			for (let i = 0; i < addressD.result.signSys.length; i++) {
				questionStr += ` ${i}) ${addressD.result.signSys[i]}\n`;
			}

			questionStr += 'Please enter the number and separate it with a comma. (must be in ascending order): ';

			let orderAns: any = await rlQuestion(this.rl, questionStr);
			orderAns = orderAns.split(',');
			if (orderAns.length !== addressD.result.level) {
				return { error: `ERROR: The number of signatures is incorrect! (It should be ${addressD.result.level}, you entered ${orderAns.length})` };
			}
			signSelect = orderAns.map(x => parseInt(x));
		}

		if (feeRatio < 1n) {
			return { error: 'ERROR: walletSend feeRatio < 1' };
		}

		let photon = this.wallet.getSignPhoton(srcAddress, signSelect);
		if (!photon) {
			return { error: 'ERROR: walletSend failed!' };
		}

		let pqcertCheck = await this.checkSignPqcert(srcAddress, signSelect, true);
		let pqcertAdd = [];
		if (pqcertCheck.error) {
			return { error: 'ERROR: Pqcert check error!' };
		}

		if (!pqcertCheck.result.root.check) {
			let pqcertRoot = this.wallet.getPqcertRootByAddress(srcAddress);
			if (!pqcertRoot) {
				return { error: 'pqcertRoot is not found!' }
			}

			photon += pqcertRoot.serialize.length * 2;
			let cs = getCompactSizeBufferByNumber(pqcertRoot.serialize.length);
			if (!cs) {
				return { error: 'ERROR: Pqcert error!' };
			}
			photon += cs.length;

			pqcertAdd.push(pqcertRoot);
		}

		for (let i = 0; i < pqcertCheck.result.pubHashs.length; i++) {
			if (!pqcertCheck.result.pubHashs[i].check) {
				let pqcertPubKey = this.wallet.getPqcertPubKeyByHash(pqcertCheck.result.pubHashs[i].hash);
				if (!pqcertPubKey) {
					return { error: 'pqcertPubKey is not found!' }
				}
				photon += pqcertPubKey.serialize.length * 2;
				let cs = getCompactSizeBufferByNumber(pqcertPubKey.serialize.length);
				if (!cs) {
					return { error: 'ERROR: pubHashs error!' };
				}
				photon += cs.length;
				pqcertAdd.push(pqcertPubKey);
			}
		}

		let opReturn: OpReturn;
		if (opReturnStr === undefined) {
			let oprAns: any = await rlQuestion(this.rl, 'Please enter an opreturn message (not required): ');
			opReturn = new OpReturn(Buffer.from(oprAns));
		}
		else {
			opReturn = new OpReturn(Buffer.from(opReturnStr));
		}

		photon += opReturn.serialize.length * 5;
		let oprCs = getCompactSizeBufferByNumber(opReturn.serialize.length);
		if (!oprCs) {
			return { error: 'ERROR: pubHashs error!' };
		}
		photon += oprCs.length;
		let extraValue = BigInt(photon) * feeRatio;
		let Signs = [];
		let addressDetails = this.wallet.getAddressDetails(srcAddress);
		if (!addressDetails) {
			return { error: 'addressDetails is not found!' }
		}
		for (let i = 0; i < signSelect.length; i++) {
			let signName = addressDetails.signSys[signSelect[i]];
			if (signName === 'FAKE') {
				return { error: 'sign is FAKE!' }
			}
			Signs.push(signName);
		}

		let r0 = await this.walletCreateAdvancedTransation(srcAddress, target, extraValue, feeRatio, useAllUTXO, true, false);
		if (r0.error) {
			return { error: r0.error };
		}

		if (!r0.result.blockTx.raw) {
			return { error: 'walletCreateTransation failed!' };
		}

		let nonSignTx = BlockTx.serializeToClass(Buffer.from(r0.result.blockTx.raw, 'hex'));
		if (!nonSignTx) {
			return { error: 'walletCreateTransation failed!' };
		}
		nonSignTx.setOpReturn(opReturn);
		for (let i = 0; i < pqcertAdd.length; i++) {
			let x = pqcertAdd[i];
			nonSignTx.addPqcert(x);
		}
		let inValue: bigint | string = BigInt(r0.result.inValue);
		let preChangeAmount: bigint = inValue - nonSignTx.vout.reduce((a, { value }) => a + value, 0n);
		if (preChangeAmount <= 0n) {
			return { error: 'changeAmount failed!' };
		}
		let preChageVoutBuf = Vout.jsonDataToSerialize({
			value: preChangeAmount.toString(10),
			lockScript: `20${changeAddress}fc`
		});
		if (!preChageVoutBuf) {
			return { error: 'changeAmount failed!' };
		}
		nonSignTx.vout.push(new Vout(preChageVoutBuf));
		let nonSignTxRaw = nonSignTx.getSerialize();
		if (!nonSignTxRaw) {
			return { error: 'walletCreateTransation failed!' };
		}

		let changeVoutIndex = nonSignTx.vout.length - 1;

		let r1: any = await this.signTx(srcAddress, signSelect, feeRatio, true, true, false, nonSignTxRaw.toString('hex'));
		if (r1.error) {
			return { error: r1.error };
		}
		if (!r1.result?.raw) {
			return { error: 'Signing failed' };
		}

		let thisTx = BlockTx.serializeToClass(Buffer.from(r1.result.raw, 'hex'));
		if (!thisTx) {
			return { error: 'Signing data failed!' };
		}

		let sendAmount: bigint | string = thisTx.vout.reduce((a, { value }, i) => ((i !== changeVoutIndex) ? a + value : a), 0n);
		let changeAmount: bigint | string = (thisTx.vout[changeVoutIndex]) ? thisTx.vout[changeVoutIndex].value : 0n;
		let fee: bigint | string = inValue - sendAmount - changeAmount;
		let actualPhoton = thisTx.getPhoton();
		if (!actualPhoton) {
			return { error: 'Getting ActualPhoton failed!' };
		}

		let photonDetails = thisTx.getPhotonDetails();
		if (!photonDetails) {
			return { error: 'Getting Photon details failed!' };
		}

		let feeDetails = '';
		feeDetails += `unlockScript: ${floatToPercentage(photonDetails.unlockScriptPhoton / actualPhoton)},`;
		feeDetails += ` pqcert: ${floatToPercentage(photonDetails.pqcertPhoton / actualPhoton)},`;
		feeDetails += ` opReturn: ${floatToPercentage(photonDetails.opReturnPhoton / actualPhoton)},`;
		feeDetails += ` other: ${floatToPercentage(photonDetails.otherPhoton / actualPhoton)},`;

		let finalChange: any = (thisTx.vout[changeVoutIndex]) ? { address: thisTx.vout[thisTx.vout.length - 1].address, value: thisTx.vout[thisTx.vout.length - 1].value } : null;
		if (finalChange && !finalChange.address) {
			return { error: "ERROR: final change address error" };
		}
		let finalTarget: any[] = thisTx.vout.slice(0, changeVoutIndex).map(({ address, value }) => ({ address, value }));
		if (this.bigIntObjFloatFlag) {
			inValue = bigIntToFloatString(inValue);
			sendAmount = bigIntToFloatString(sendAmount);
			fee = bigIntToFloatString(fee);
			if (finalChange) {
				finalChange.value = bigIntToFloatString(finalChange.value);
			}
			finalTarget.forEach(x => { x.value = bigIntToFloatString(x.value); });
		}

		let tableData: any = {};
		tableData['Source'] = `${(this.addressBs58ck) ? bs58ck.encode(srcAddress) : srcAddress}`;
		for (let i = 0; i < finalTarget.length; i++) {
			let thisAddr = finalTarget[i].address;
			if (!thisAddr) {
				return { error: "ERROR: tx error" };
			}
			tableData[`Target [${i}]`] = `${finalTarget[i].value} -> ${(this.addressBs58ck) ? bs58ck.encode(thisAddr) : finalTarget[i].address}`;
		}
		tableData['UTXO amount'] = `${inValue}`;
		tableData['Sending'] = `${sendAmount}`;
		if (finalChange) {
			tableData['Change'] = `${finalChange.value} -> ${(this.addressBs58ck) ? bs58ck.encode(finalChange.address) : finalChange.address}`;
		}
		else {
			tableData['Change'] = `0`;
		}
		tableData['Fee amount'] = `${fee}`;
		tableData['Fee details'] = `${feeDetails}`;
		tableData['Photon amount'] = `${actualPhoton}`;
		tableData['Signatrue'] = `${Signs.join(', ')}`;
		console.log('Transaction details: ');
		console.log(getTableStr(tableData, undefined, { index: 'R', value: 'L' }));
		if (checkFlag) {
			let ans = await rlQuestion(this.rl, 'Please check if your transaction (above) is correct. (y/n): ');
			if (!ans.match(/^y(es)?$/i)) {
				this.clearTxTemp();
				return { error: 'Cancelled.' };
			}
		}

		return await this.sendTx(r1.result.raw);
	}

	/**
	 * Wallet advanced sending
	 * @param srcAddressList 
	 * @param target 
	 * @param feeRatio 
	 * @returns {cliReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	async walletASend(srcAddressList: string[] = requiredArg('srcAddress'), target: { address: string, value: bigint }[] = requiredArg('target'), feeRatio: bigint = 1n): Promise<{ result?: any, error?: any }> {
		if (feeRatio < 1n) {
			return { error: 'ERROR: walletSend feeRatio < 1' };
		}
		let srcAddressDuplicateTable: { [key: string]: boolean } = {};
		let viewAddress = { srcAddressList: [], target: [] };
		for (let i = 0; i < srcAddressList.length; i++) {
			viewAddress.srcAddressList[i] = srcAddressList[i];
			if (srcAddressDuplicateTable[srcAddressList[i]]) {
				return { error: 'ERROR: The srcAddress are duplicated' };
			}
			srcAddressDuplicateTable[srcAddressList[i]] = true;
			if (checkAddressIsBs58ck(srcAddressList[i])) {
				let bs58 = bs58ck.decode(srcAddressList[i]);
				if (!bs58) {
					return { error: 'ERROR: base58check' };
				}
				srcAddressList[i] = bs58.toString('hex');
				if (!this.wallet.addressDoseExist(srcAddressList[i])) {
					return { error: 'ERROR: srcAddress is not found' };
				}
			}
		}
		let totalValue = 0n;
		for (let i = 0; i < target.length; i++) {
			viewAddress.target[i] = target[i].address;
			if (checkAddressIsBs58ck(target[i].address)) {
				let bs58 = bs58ck.decode(target[i].address);
				if (!bs58) {
					return { error: 'ERROR: base58check' };
				}
				target[i].address = bs58.toString('hex');
				totalValue += target[i].value;
			}
		}
		let balance: any = await this.post({
			method: "walletGetBalance",
			params: [srcAddressList]
		});
		if (balance.err) {
			return { error: balance.err };
		}
		try {
			let obj = jsonParse(balance.data);
			if (obj.error) {
				return { error: `ERROR: ${obj.error}` };
			}
			if (BigInt(obj.result.total.confirmed) < totalValue) {
				return { error: `ERROR: Insufficient balance` };
			}
			balance = obj;
		}
		catch (e) {
			return { error: `ERROR: ${e}` };
		}

		let useAllUTXO: string | boolean = await rlQuestion(this.rl, 'Do you use all UTXO? (y/n): ');
		if (useAllUTXO.match(/^y(es)?$/i)) {
			useAllUTXO = true;
		}
		else {
			useAllUTXO = false;
		}

		let opReturn: OpReturn;
		let oprAns: any = await rlQuestion(this.rl, 'Please enter an opreturn message (not required): ');
		opReturn = new OpReturn(Buffer.from(oprAns));

		let basePhoton = opReturn.serialize.length * 5;
		let voutCS = getCompactSizeBufferByNumber(target.length);
		if (!voutCS) {
			return { error: `ERROR: getCompactSizeBufferByNumber error` };;
		}
		basePhoton += voutCS.length;
		basePhoton += (target.length * 8);
		let oprCs = getCompactSizeBufferByNumber(opReturn.serialize.length);
		if (!oprCs) {
			return { error: 'ERROR: pubHashs error!' };
		}
		basePhoton += oprCs.length;
		let useValue = 0n;
		let totalExtraValue = 0n;
		let useAddress: { address: string, signSelect: number[], signSelectName: string[], inValue: bigint | string }[] = [];
		let thisBlockTx = BlockTx.jsonDataToClass({
			version: 0,
			vin: [],
			vout: target.map(({ address, value }) => ({ value: value.toString(), lockScript: `20${address}fc` })),
			pqcert: [],
			opReturn: opReturn.toString(),
			nLockTime: 0
		});
		if (!thisBlockTx) {
			return { error: 'ERROR: creat tx error!' };
		}

		let pqcertHashTable: { [key: string]: boolean } = {};
		for (let i = 0; i < srcAddressList.length; i++) {
			let srcAddress = srcAddressList[i];
			let useAllThis: string | boolean = false;
			if (useValue >= totalValue && !useAllUTXO) {
				let continue2Use = await rlQuestion(this.rl, `The transaction amount is sufficient, do you still need to use the (${viewAddress.srcAddressList[i]}) address, and use all UTXO? (y/n): `);
				if (!continue2Use.match(/^y(es)?$/i)) {
					break;
				}
				useAllThis = true;
			}
			if (!useAllUTXO && !useAllThis) {
				useAllThis = await rlQuestion(this.rl, `Do you use all UTXO from (${viewAddress.srcAddressList[i]}) address? (y/n): `);
				if (useAllThis.match(/^y(es)?$/i)) {
					useAllThis = true;
				}
				else {
					useAllThis = false;
				}
			}
			let thisAddrBalance = balance.result?.sub[srcAddress]?.confirmed;
			if (thisAddrBalance === undefined) {
				return { error: `${thisAddrBalance} balance not found` };
			}
			let thisValue = totalValue - useValue;
			let addressD = this.walletGetAddressDetails(srcAddress);
			if (addressD.error) {
				return { error: addressD.error };
			}

			let questionStr = `Now using "${(this.addressBs58ck) ? bs58ck.encode(srcAddressList[i]) : srcAddressList[i]}}", which of the following ${addressD.result.level} signature systems you would like to choose for your signature: (FAKE is not an option)\n`;
			for (let i = 0; i < addressD.result.signSys.length; i++) {
				questionStr += ` ${i}) ${(addressD.result.signSys[i])}\n`;
			}

			questionStr += 'Please enter the number and separate it with a comma. (must be in ascending order): ';

			let orderAns: any = await rlQuestion(this.rl, questionStr);
			orderAns = orderAns.split(',');
			if (orderAns.length !== addressD.result.level) {
				return { error: `ERROR: The number of signatures is incorrect! (It should be ${addressD.result.level}, you entered ${orderAns.length})` };
			}
			let signSelect = orderAns.map(x => parseInt(x));
			let photon = this.wallet.getSignPhoton(srcAddress, signSelect);
			if (!photon) {
				return { error: 'ERROR: walletSend failed!' };
			}

			let pqcertCheck = await this.checkSignPqcert(srcAddress, signSelect, true);
			let pqcertAdd = [];
			if (pqcertCheck.error) {
				return { error: 'ERROR: Pqcert check error!' };
			}

			if (!pqcertCheck.result.root.check) {
				if (!pqcertHashTable[srcAddress]) {
					let pqcertRoot = this.wallet.getPqcertRootByAddress(srcAddress);
					if (!pqcertRoot) {
						return { error: 'pqcertRoot is not found!' }
					}

					photon += pqcertRoot.serialize.length * 2;
					let cs = getCompactSizeBufferByNumber(pqcertRoot.serialize.length);
					if (!cs) {
						return { error: 'ERROR: Pqcert error!' };
					}
					photon += cs.length;
					pqcertAdd.push(pqcertRoot);
					pqcertHashTable[srcAddress] = true;
				}
			}

			for (let i = 0; i < pqcertCheck.result.pubHashs.length; i++) {
				if (!pqcertCheck.result.pubHashs[i].check) {
					if (!pqcertHashTable[pqcertCheck.result.pubHashs[i].hash]) {
						let pqcertPubKey = this.wallet.getPqcertPubKeyByHash(pqcertCheck.result.pubHashs[i].hash);
						if (!pqcertPubKey) {
							return { error: 'pqcertPubKey is not found!' };
						}
						photon += pqcertPubKey.serialize.length * 2;
						let cs = getCompactSizeBufferByNumber(pqcertPubKey.serialize.length);
						if (!cs) {
							return { error: 'ERROR: pubHashs error!' };
						}
						photon += cs.length;
						pqcertAdd.push(pqcertPubKey);
						pqcertHashTable[pqcertCheck.result.pubHashs[i].hash] = true;
					}
				}
			}

			let extraValue = (i === 0) ? BigInt(basePhoton + photon) * feeRatio : BigInt(photon) * feeRatio;
			let Signs = [];
			let addressDetails = this.wallet.getAddressDetails(srcAddress);
			if (!addressDetails) {
				return { error: 'addressDetails is not found!' }
			}
			for (let i = 0; i < signSelect.length; i++) {
				let signName = addressDetails.signSys[signSelect[i]];
				if (signName === 'FAKE') {
					return { error: 'sign is FAKE!' }
				}
				Signs.push(signName);
			}
			let r0;
			if (thisValue + extraValue + totalExtraValue > thisAddrBalance || useAllUTXO || useAllThis) {
				// use all utxo
				r0 = await this.walletCreateAdvancedTransation(srcAddress, 0n, extraValue + totalExtraValue, feeRatio, true, true, false);
				if (r0.result) {
					if (extraValue > r0.result.inValue) {
						totalExtraValue += (extraValue - r0.result.inValue);
					}

				}
			}
			else {
				r0 = await this.walletCreateAdvancedTransation(srcAddress, thisValue, extraValue + totalExtraValue, feeRatio, false, true, false);
				totalExtraValue = 0n;
			}
			if (r0.error) {
				return { error: r0.error };
			}
			useValue += r0.result.inValue;
			let tx = BlockTx.serializeToClass(Buffer.from(r0.result.blockTx.raw, 'hex'));
			if (!tx) {
				return { error: 'ERROR: BlockTx error!' };
			}
			for (let j = 0; j < tx.vin.length; j++) {
				thisBlockTx.vin.push(tx.vin[j]);
			}
			for (let j = 0; j < pqcertAdd.length; j++) {
				thisBlockTx.addPqcert(pqcertAdd[j]);
			}
			useAddress.push({ address: srcAddress, signSelect, signSelectName: Signs, inValue: r0.result.inValue });
		}

		let changeAddress: any = await rlQuestion(this.rl, `Set change address (default address is ${(this.addressBs58ck) ? bs58ck.encode(useAddress[useAddress.length - 1].address) : useAddress[useAddress.length - 1].address}): `);
		if (changeAddress === '') {
			changeAddress = useAddress[useAddress.length - 1].address;
		}
		else if (!chAddress(changeAddress)) {
			return { error: 'ERROR: change address' }
		}
		if (checkAddressIsBs58ck(changeAddress)) {
			let bs58 = bs58ck.decode(changeAddress);
			if (!bs58) {
				return { error: 'ERROR: base58check!' };
			}
			changeAddress = bs58.toString('hex');
		}

		let changeVout = Vout.jsonDataToSerialize({ value: (useValue - totalValue).toString(), lockScript: `20${changeAddress}fc` });
		if (!changeVout) {
			return { error: 'ERROR: changeVout!' };
		}
		thisBlockTx.vout.push(new Vout(changeVout, true));
		let changeVoutIndex = thisBlockTx.vout.length - 1;
		let txRaw = thisBlockTx.getSerialize();
		if (!txRaw) {
			return { error: 'ERROR: BlockTx raw error!' };
		}

		let r1: any = await this.signTxMultiAddress(useAddress, feeRatio, true, false, false, txRaw.toString('hex'));
		if (r1.error) {
			return { error: r1.error };
		}
		if (!r1.result?.raw) {
			return { error: 'Signing failed' };
		}
		let thisTx = BlockTx.serializeToClass(Buffer.from(r1.result.raw, 'hex'));
		if (!thisTx) {
			return { error: 'Signing data failed!' };
		}
		let finalTarget: any[] = thisTx.vout.slice(0, changeVoutIndex).map(({ address, value }) => ({ address, value }));
		let inValue: string;
		let changeAmount: bigint | string = (thisTx.vout[changeVoutIndex]) ? thisTx.vout[changeVoutIndex].value : 0n;
		let fee: bigint | string = useValue - totalValue - changeAmount;
		let sendAmount: string;
		let finalChange: any = (thisTx.vout[changeVoutIndex]) ? { address: thisTx.vout[thisTx.vout.length - 1].address, value: thisTx.vout[thisTx.vout.length - 1].value } : null;
		if (finalChange && !finalChange.address) {
			return { error: "ERROR: final change address error" };
		}
		let actualPhoton = thisTx.getPhoton();
		if (!actualPhoton) {
			return { error: 'Getting ActualPhoton failed!' };
		}
		let photonDetails = thisTx.getPhotonDetails();
		if (!photonDetails) {
			return { error: 'Getting Photon details failed!' };
		}
		let feeDetails = '';
		feeDetails += `unlockScript: ${floatToPercentage(photonDetails.unlockScriptPhoton / actualPhoton)},`;
		feeDetails += ` pqcert: ${floatToPercentage(photonDetails.pqcertPhoton / actualPhoton)},`;
		feeDetails += ` opReturn: ${floatToPercentage(photonDetails.opReturnPhoton / actualPhoton)},`;
		feeDetails += ` other: ${floatToPercentage(photonDetails.otherPhoton / actualPhoton)},`;
		if (this.bigIntObjFloatFlag) {
			inValue = bigIntToFloatString(useValue);
			sendAmount = bigIntToFloatString(totalValue);
			fee = bigIntToFloatString(fee);
			if (finalChange) {
				finalChange.value = bigIntToFloatString(finalChange.value);
			}
			finalTarget.forEach(x => { x.value = bigIntToFloatString(x.value); });
			useAddress.forEach(x => { x.inValue = bigIntToFloatString(<bigint>(x.inValue)); });
		}
		else {
			inValue = `${useValue}`;
			sendAmount = `${totalValue}`;

		}

		let tableData: any = {};
		for (let i = 0; i < useAddress.length; i++) {
			tableData[`Source [${i}]`] = `${(this.addressBs58ck) ? bs58ck.encode(useAddress[i].address) : useAddress[i].address} -> ${useAddress[i].inValue}`;
		}
		for (let i = 0; i < finalTarget.length; i++) {
			let thisAddr = finalTarget[i].address;
			if (!thisAddr) {
				return { error: "ERROR: tx error" };
			}
			tableData[`Target [${i}]`] = `${finalTarget[i].value} -> ${(this.addressBs58ck) ? bs58ck.encode(thisAddr) : finalTarget[i].address}`;
		}
		tableData['UTXO amount'] = `${inValue}`;
		tableData['Sending'] = `${sendAmount}`;
		if (finalChange) {
			tableData['Change'] = `${finalChange.value} -> ${(this.addressBs58ck) ? bs58ck.encode(finalChange.address) : finalChange.address}`;
		}
		else {
			tableData['Change'] = `0`;
		}
		tableData['Fee amount'] = `${fee}`;
		tableData['Fee details'] = `${feeDetails}`;
		tableData['Photon amount'] = `${actualPhoton}`;
		for (let i = 0; i < useAddress.length; i++) {
			tableData[`Signatrue [${i}]`] = `${((this.addressBs58ck) ? bs58ck.encode(useAddress[i].address) : useAddress[i].address).substring(0, 12)}... -> ${useAddress[i].signSelectName.join(', ')}`;
		}

		console.log('Transaction details: ');
		console.log(getTableStr(tableData, undefined, { index: 'R', value: 'L' }));
		let ans = await rlQuestion(this.rl, 'Please check if your transaction (above) is correct. (y/n): ');
		if (!ans.match(/^y(es)?$/i)) {
			return { error: 'Cancelled.' };
		}
		return await this.sendTx(r1.result.raw);
	}


	/**
	 * Get transactions for the wallet address.
	 * @param {string} address The wallet address.
	 * @param {number} [limit=20] 
	 * @param {number} [skip=0] 
	 * @param {boolean} [reverse=true] 
	 * @param {boolean} [normalFlag=false] 
	 * @returns {cliReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	async walletGetTxList(address: string = requiredArg('address'), limit: number = 20, skip: number = 0, reverse: boolean = true, normalFlag: boolean = true): Promise<cliReturn> {
		if (checkAddressIsBs58ck(address)) {
			let bs58 = bs58ck.decode(address);
			if (!bs58) {
				return { error: 'ERROR: base58check' };
			}
			address = bs58.toString('hex');
		}
		let r = await this.post({
			method: "walletGetTxList",
			params: [address, limit, skip, reverse, normalFlag]
		});
		if (r.err) {
			return { error: r.err };
		}
		let obj = jsonParse(r.data);
		if (obj.error) {
			return { error: obj.error };
		}
		if (this.addressBs58ck) {
			if (obj.result?.txList) {
				obj.result.txList.forEach(x => {
					if (x.address) {
						x.address = bs58ck.encode(x.address);
					}
				});

				obj.result.waitTx.forEach(x => {
					if (x.address) {
						x.address = bs58ck.encode(x.address);
					}
				});

				obj.result.mining.forEach(x => {
					if (x.address) {
						x.address = bs58ck.encode(x.address);
					}
				});
			}
		}

		let result = this.jsonStringify(obj.result);
		if (this.jsonTable) {
			let data = JSON.parse(jsonStringify(obj.result, { bigIntObjFlag: false, bufferObjFlag: false, bigIntObjFloatFlag: this.bigIntObjFloatFlag }));
			let tableStr = '';
			if (data.waitTx.length) {
				tableStr += 'In the queue: \n';
				data.waitTx = data.waitTx.map(({ txid, time, value, feeRatio }) => ({ txid, time: Math.round(time / 1000), sendValue: value.sendValue, receiveValue: value.receiveValue, feeRatio: Math.round(feeRatio * 1000) / 1000 }));
				tableStr += getTableStr(data.waitTx, undefined, { height: 'R', txn: 'R', time: 'R', sendValue: 'R', receiveValue: 'R', feeRatio: 'R' });
			}
			if (data.mining.length) {
				tableStr += 'Waiting for new blocks: \n';
				data.waitTx = data.mining.map(({ txid, time, value, feeRatio }) => ({ txid, time: Math.round(time / 1000), sendValue: value.sendValue, receiveValue: value.receiveValue, feeRatio: Math.round(feeRatio * 1000) / 1000 }));
				tableStr += getTableStr(data.mining, undefined, { height: 'R', txn: 'R', time: 'R', sendValue: 'R', receiveValue: 'R', feeRatio: 'R' });
			}
			tableStr += 'Confirmed: \n';
			if (normalFlag) {
				tableStr += getTableStr(data.txList, ['txid', 'height', 'txn', 'time', 'sendValue', 'receiveValue'], { height: 'R', txn: 'R', time: 'R', sendValue: 'R', receiveValue: 'R' });
			}
			else {
				data.txList = data.txList.map(({ txid, height, txn, type, vinn, voutn, value, voutspent }) => ({
					txid,
					height,
					txn,
					type: (type === 'receive') ? `receive; voutn=${voutn}; voutspent=${voutspent}` : `send; vinn=${vinn}`,
					value
				}))
				tableStr += getTableStr(data.txList, ['txid', 'height', 'txn', 'type', 'value'], { height: 'R', txn: 'R', time: 'R', vinn: 'R', voutn: 'R', value: 'R', voutspent: 'R' });
			}

			return { result, tableStr };
		}
		return { result };
	}

	/**
	 * Get the list of unused transactions in the wallet address.
	 * @param {string} address The wallet address.
	 * @param {number} [limit=20] 
	 * @param {number} [skip=0] 
	 * @param {boolean} [reverse=true] 
	 * @returns {cliReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	async walletGetUTXOList(address: string = requiredArg('address'), limit: number = 20, skip: number = 0, reverse: boolean = true) {
		if (checkAddressIsBs58ck(address)) {
			let bs58 = bs58ck.decode(address);
			if (!bs58) {
				return { error: 'ERROR: base58check' };
			}
			address = bs58.toString('hex');
		}

		let r = await this.post({
			method: "walletGetUTXOList",
			params: [address, limit, skip, reverse]
		});
		if (r.err) {
			return { error: r.err };
		}

		let obj = jsonParse(r.data);
		if (obj.error) {
			return { error: obj.error };
		}
		if (this.addressBs58ck) {
			if (obj.result?.txList) {
				obj.result.txList.forEach(x => {
					if (x.address) {
						x.address = bs58ck.encode(x.address);
					}
				});
			}
		}

		let result = this.jsonStringify(obj.result);
		if (this.jsonTable) {
			let data = JSON.parse(jsonStringify(obj.result, { bigIntObjFlag: false, bufferObjFlag: false, bigIntObjFloatFlag: this.bigIntObjFloatFlag }));
			let tableStr = getTableStr(data, ['txid', 'height', 'txn', 'voutn', 'value', 'status'], { height: 'R', txn: 'R', voutn: 'R', value: 'R' });
			return { result, tableStr };
		}
		return { result };
	}

	/**
	 * Transaction add pqcert root.
	 * @param {string} address Address requires Pqcert.
	 * @param {string} txRaw Transaction raw.
	 * @returns {cliReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	txAddPqcertRoot(address: string = requiredArg('pubHash'), txRaw?: string): cliReturn {
		if (checkAddressIsBs58ck(address)) {
			let bs58 = bs58ck.decode(address);
			if (!bs58) {
				return { error: 'ERROR: base58check' };
			}
			address = bs58.toString('hex');
		}

		let blockTx
		if (!txRaw) {
			blockTx = this.txTemp;
		}
		else {
			let txBuf = Buffer.from(txRaw, 'hex');
			blockTx = BlockTx.serializeToClass(txBuf, true);
			if (!blockTx) {
				return { error: 'ERROR: tx error' }
			}
		}

		let pqcertRoot = this.wallet.getPqcertRootByAddress(address);
		if (!pqcertRoot) {
			return { error: 'pqcertRoot is not found' };
		}

		blockTx.addPqcert(pqcertRoot);
		let json = blockTx.json;
		if (!json) {
			return { error: 'ERROR: ???' }
		}

		let raw: any = blockTx.getSerialize();
		if (!raw) {
			return { error: 'ERROR: ???' }
		}

		raw = raw.toString('hex');

		let result = this.jsonStringify({ json, raw });

		return { result };
	}

	/**
	 * Adding pqcert public keys to transaction.
	 * @param {string} pubHash pqcert public keys hash.
	 * @param {string} txRaw Transaction raw.
	 * @returns {cliReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	txAddPqcertPubKey(pubHash: string = requiredArg('pubHash'), txRaw?: string): cliReturn {
		let blockTx
		if (!txRaw) {
			blockTx = this.txTemp;
		}
		else {
			let txBuf = Buffer.from(txRaw, 'hex');
			blockTx = BlockTx.serializeToClass(txBuf, true);
			if (!blockTx) {
				return { error: 'ERROR: tx error' }
			}
		}

		let PqcertPubKey = this.wallet.getPqcertPubKeyByHash(pubHash);
		if (!PqcertPubKey) {
			return { error: 'ERROR: get PqcertPubKey failed.' }
		}

		blockTx.addPqcert(PqcertPubKey);
		let json = blockTx.json;
		if (!json) {
			return { error: 'ERROR: ???' }
		}

		let raw: any = blockTx.getSerialize();
		if (!raw) {
			return { error: 'ERROR: ???' }
		}

		raw = raw.toString('hex');

		let result = this.jsonStringify({ json, raw });

		return { result };
	}

	/**
	 * Verify that the pqcert has been submitted.
	 * @param {string} address address requires sign.
	 * @param {number[]} signSelect This transaction is signed using the selected signature. And the length of the signature is related to the renewal fee.
	 * @param {boolean} [returnObj=false] Whether to send back object data.
	 * @returns {cliReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	async checkSignPqcert(address: string = requiredArg('address'), signSelect: number[] = requiredArg('signSelect'), returnObj: boolean = false): Promise<cliReturn> {
		if (checkAddressIsBs58ck(address)) {
			let bs58 = bs58ck.decode(address);
			if (!bs58) {
				return { error: 'ERROR: base58check' };
			}
			address = bs58.toString('hex');
		}

		if (!Array.isArray(signSelect)) {
			return { error: 'ERROR: Input formatting error' };
		}

		let check: any = { root: {}, pubHashs: [] };

		let r = await this.post({ method: 'getPqcertByHash', params: [address] });
		if (r.err) {
			return { error: r.err };
		}

		let obj
		try {
			obj = jsonParse(r.data);
		}
		catch (e) {
			return { error: `ERROR: ${e}` };
		}

		check.root = { hash: address, check: (obj.error) ? false : true };
		let addressData = this.wallet.getAddress(address);
		if (!addressData) {
			return { error: 'addressData is not found' };
		}

		let pubHashs = addressData.pqcertRoot.getPubKeyHashAll();
		if (!pubHashs) {
			return { error: 'pubHashs is not found' };
		}

		for (let i = 0; i < signSelect.length; i++) {
			if (addressData.addressSeed.keys[signSelect[i]] === -1) {
				return { error: `ERROR: sign order ${signSelect[i]} is fake` };
			}

			let key = pubHashs[signSelect[i]].toString('hex');
			if (!key) {
				return { error: `ERROR: sign order ${signSelect[i]} is not found` };
			}

			let r = await this.post({ method: 'getPqcertByHash', params: [key] });
			if (r.err) {
				return { error: r.err };
			}

			try {
				obj = jsonParse(r.data);
			}
			catch (e) {
				return { error: `ERROR: ${e}` };
			}

			check.pubHashs[i] = { hash: key, check: (obj.error) ? false : true };
		}

		if (returnObj) {
			return { result: check };
		}

		let json = this.jsonStringify(check);
		if (!json) {
			return { error: true };
		}

		return { result: json };
	}

	/**
	 * Sign transaction.
	 * @param {string} address address requires sign.
	 * @param {number[]} signSelect This transaction is signed using the selected signature. And the length of the signature is related to the renewal fee.
	 * @param {bigint} feeRatio Fee ratio. Do not less than 1. 
	 * @param {boolean} rawFlag Whether the transaction is expressed in raw.
	 * @param {boolean} tempFlag Save this transaction raw temporarily.
	 * @param {boolean} autoAddPqcert Auto add pqcert.
	 * @param {string} txRaw Transaction raw.
	 * @returns {cliReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	async signTx(address: string = requiredArg('address'), signSelect: number[] = requiredArg('signSelect'), feeRatio: bigint = 1n, rawFlag: boolean = true, tempFlag: boolean = true, autoAddPqcert: boolean = true, txRaw: string = null): Promise<cliReturn> {
		if (address && checkAddressIsBs58ck(address)) {
			let bs58 = bs58ck.decode(address);
			if (!bs58) {
				return { error: 'ERROR: base58check' };
			}
			address = bs58.toString('hex');
		}

		if (!Array.isArray(signSelect)) {
			return { error: 'ERROR: Input formatting error' };
		}

		let blockTx = (txRaw) ? BlockTx.serializeToClass(Buffer.from(txRaw, 'hex')) : this.txTemp;
		if (!blockTx) {
			return { error: 'ERROR: blockTx error' };
		}

		if (autoAddPqcert) {
			let pqcertCheck = await this.checkSignPqcert(address, signSelect, true);
			if (pqcertCheck.error) {
				return { error: 'ERROR: Pqcert check error' };
			}

			if (!pqcertCheck.result.root.check) {
				let pqcertRoot = this.wallet.getPqcertRootByAddress(pqcertCheck.result.root.hash);
				if (!pqcertRoot) {
					return { error: 'pqcertRoot is not found' }
				}
				blockTx.addPqcert(pqcertRoot);
			}

			for (let i = 0; i < pqcertCheck.result.pubHashs.length; i++) {
				if (!pqcertCheck.result.pubHashs[i].check) {
					let PqcertPubKey = this.wallet.getPqcertPubKeyByHash(pqcertCheck.result.pubHashs[i].hash);
					if (!PqcertPubKey) {
						return { error: 'ERROR: PqcertPubKey is not found' }
					}
					blockTx.addPqcert(PqcertPubKey);
				}
			}
		}

		let aesKey: SafePasswordBuf;
		if (this.wallet.isEncryption()) {
			let ans = await rlQuestion(this.rl, 'Please enter your password: ', { passwordMode: true });
			aesKey = new SafePasswordBuf(shake256(Buffer.from(ans, 'utf8')));
		}

		let signedTx = this.wallet.signTx(address, blockTx, signSelect, feeRatio, undefined, aesKey);
		if (!signedTx) {
			return { error: 'ERROR: signTx failed' };
		}

		let json = signedTx.json;
		if (!json) {
			return { error: 'ERROR: ???' };
		}

		if (!rawFlag) {
			return { result: json };
		}

		let raw = signedTx.getSerialize();
		if (!raw) {
			return { error: 'ERROR: ???' };
		}

		if (tempFlag) {
			this.txTemp = signedTx;
		}

		return { result: { json, raw: raw.toString('hex') } };
	}

	async signTxMultiAddress(addressList: { address: string, signSelect: number[] }[] = requiredArg('address'), feeRatio: bigint = 1n, rawFlag: boolean = true, tempFlag: boolean = true, autoAddPqcert: boolean = true, txRaw: string = null): Promise<cliReturn> {
		for (let i = 0; i < addressList.length; i++) {
			if (checkAddressIsBs58ck(addressList[i].address)) {
				let bs58 = bs58ck.decode(addressList[i].address);
				if (!bs58) {
					return { error: 'ERROR: base58check' };
				}
				addressList[i].address = bs58.toString('hex');
			}

			if (!Array.isArray(addressList[i].signSelect)) {
				return { error: 'ERROR: Input formatting error' };
			}
		}

		let blockTx = (txRaw) ? BlockTx.serializeToClass(Buffer.from(txRaw, 'hex')) : this.txTemp;
		if (!blockTx) {
			return { error: 'ERROR: blockTx error' };
		}

		if (autoAddPqcert) {
			let pqcertHashTable: { [key: string]: boolean } = {};
			for (let j = 0; j < addressList.length; j++) {
				let { address, signSelect } = addressList[j];
				let pqcertCheck = await this.checkSignPqcert(address, signSelect, true);
				if (pqcertCheck.error) {
					return { error: 'ERROR: Pqcert check error' };
				}

				if (!pqcertCheck.result.root.check) {
					if (!pqcertHashTable[pqcertCheck.result.root.hash]) {
						let pqcertRoot = this.wallet.getPqcertRootByAddress(pqcertCheck.result.root.hash);
						if (!pqcertRoot) {
							return { error: 'pqcertRoot is not found' }
						}
						blockTx.addPqcert(pqcertRoot);
						pqcertHashTable[pqcertCheck.result.root.hash] = true;
					}
				}

				for (let i = 0; i < pqcertCheck.result.pubHashs.length; i++) {
					if (!pqcertCheck.result.pubHashs[i].check) {
						if (!pqcertHashTable[pqcertCheck.result.pubHashs[i].hash]) {
							let PqcertPubKey = this.wallet.getPqcertPubKeyByHash(pqcertCheck.result.pubHashs[i].hash);
							if (!PqcertPubKey) {
								return { error: 'ERROR: PqcertPubKey is not found' }
							}
							blockTx.addPqcert(PqcertPubKey);
							pqcertHashTable[pqcertCheck.result.pubHashs[i].hash] = true;
						}
					}
				}
			}
		}

		let aesKey: SafePasswordBuf;
		if (this.wallet.isEncryption()) {
			let ans = await rlQuestion(this.rl, 'Please enter your password: ', { passwordMode: true });
			aesKey = new SafePasswordBuf(shake256(Buffer.from(ans, 'utf8')));
		}

		let signedTx = this.wallet.signTxMultiAddress(addressList, blockTx, feeRatio, undefined, aesKey);
		if (!signedTx) {
			return { error: 'ERROR: signTx failed' };
		}

		let json = signedTx.json;
		if (!json) {
			return { error: 'ERROR: ???' };
		}

		if (!rawFlag) {
			return { result: json };
		}

		let raw = signedTx.getSerialize();
		if (!raw) {
			return { error: 'ERROR: ???' };
		}

		if (tempFlag) {
			this.txTemp = signedTx;
		}

		return { result: { json, raw: raw.toString('hex') } };
	}

	/**
	 * Get Temporary transaction data.
	 * @param {boolean} rawFlag Whether the transaction is expressed in raw.
	 * @returns {cliReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	async getTxTemp(rawFlag: boolean): Promise<cliReturn> {
		if (!this.txTemp) {
			return { error: 'ERROR: txTemp is not found' };
		}

		let json = this.txTemp.json;
		if (!json) {
			return { error: 'ERROR: ???' };
		}

		if (!rawFlag) {
			json = this.jsonStringify(json);
			if (!json) {
				return { error: 'ERROR: ???' };
			}
			return { result: json };
		}

		let raw: any = this.txTemp.getSerialize();
		if (!raw) {
			return { error: 'ERROR: ???' };
		}

		raw = raw.toString('hex');
		let result = this.jsonStringify({ json, raw });

		return { result };
	}

	/**
	 * Clear transaction temp.
	 * @returns {cliReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	clearTxTemp(): cliReturn {
		delete this.txTemp;

		return { result: 'Clear tx temp!' };
	}

	/**
	 * Send the temporary transaction data to rpc server.
	 * @returns {cliReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	async sendTxTemp(): Promise<cliReturn> {
		if (!this.txTemp) {
			return { error: 'ERROR: txTemp is not found' };
		}

		let r = await this.post({
			method: "addTx",
			params: [this.txTemp.json]
		});

		if (r.err) {
			return { error: r.err };
		}

		let result = jsonParse(r.data);

		result = this.jsonStringify(result);
		this.clearTxTemp();

		return { result };
	}

	/**
	 * Send the transaction by raw.
	 * @param {string} tx raw of transaction.
	 * @returns {cliReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	async sendTx(tx: string = requiredArg('tx')): Promise<cliReturn> {
		if (!tx) {
			return { error: 'ERROR: Send tx failed' };
		}
		let blockTx = BlockTx.serializeToClass(Buffer.from(tx, 'hex'));
		if (!blockTx) {
			return { error: 'ERROR: Send tx failed' };
		}

		let r = await this.post({
			method: "addTx",
			params: [blockTx.json]
		});

		if (r.err) {
			return { error: r.err };
		}

		let result = jsonParse(r.data);

		result = this.jsonStringify(result);

		return { result };
	}

	async mine(address: string | false, addCache: boolean = true, testMode: boolean = false) {
		if (address && checkAddressIsBs58ck(address)) {
			let bs58 = bs58ck.decode(address);
			if (!bs58) {
				return { error: 'ERROR: base58check' };
			}

			address = bs58.toString('hex');
		}

		let r = await this.post({
			method: "mine",
			params: [address, addCache, testMode]
		});

		if (r.err) {
			return { error: r.err };
		}

		let obj = jsonParse(r.data);
		if (obj.error) {
			return { error: obj.error };
		}

		let result = this.jsonStringify(obj.result);
		return { result };
	}

	/**
	 * Automatic watch wallet address.
	 * @returns {cliReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	async walletAutoWatch(): Promise<cliReturn> {
		let result = [];

		let addressList = this.wallet.getAddressesList();
		if (!addressList) {
			return { error: 'wallet is not found' };
		}

		for (let i = 0; i < addressList.length; i++) {
			let address = addressList[i];
			let r = await this.post({
				method: "walletAddWatchAddress",
				params: [address]
			});
			if (r.err) {
				return { error: r.err };
			}
			result.push((this.addressBs58ck) ? bs58ck.encode(address) : address);
		}
		return { result };
	}

	async exit(noQuestion?: boolean) {
		if (noQuestion) {
			this.rl.pause();
			if (this.wallet) {
				await this.wallet.exit();
			}
			this.postRequest.exit();
			process.exit();
		}
		else {
			let ans = await rlQuestion(this.rl, 'Sure you want to exit? (y/n): ');
			if (ans.match(/^y(es)?$/i)) {
				this.rl.pause();
				if (this.wallet) {
					await this.wallet.exit();
				}
				this.postRequest.exit();
				process.exit();
			}
			else {
				return { error: 'Cancelled.' };
			}
		}
	}

	/**
	 * Serialize the block transaction in Json format to raw format.
	 * @param jsonData the block transaction in Json format.
	 * @returns {cliReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	blockTxJson2Raw(jsonData: any = requiredArg('jsonData')): cliReturn {
		let raw = BlockTx.jsonDataToSerialize(jsonData);
		if (!raw) {
			return { error: `Serialization failed!` };
		}
		else {
			return { result: raw.toString('hex') };
		}
	}

	/**
	 * Transform the block transaction in raw format to Json format.
	 * @param {string} rawStr the block transaction in raw format
	 * @returns {cliReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	blockTxRaw2Json(rawStr: string = requiredArg('rawStr')): cliReturn {
		let raw = Buffer.from(rawStr, 'hex');
		let blockTxJsonData = BlockTx.serializeToJson(raw);
		if (!blockTxJsonData) {
			return { error: `Transformation failure!` };
		}
		else {
			return { result: jsonStringify(blockTxJsonData, { space: '', bufferObjFlag: false, bigIntObjFlag: false }) };
		}
	}

	/**
	 * change wallet.
	 * @param {number} walletID 
	 */
	switchWallet(walletID: number = requiredArg('walletID')) {
		if (this.wallet.switchWallet(walletID)) {
			return { result: 'Switch done.' };
		}
		return { error: 'ERROR: Wallet switch failed.' };
	}

	/**
	 * get wallet list.
	 * @returns {cliReturn} If complete return `{result: any}` else return `{error: any}`.
	 */
	getWalletList() {
		let kp = this.wallet.getWalletList();
		if (!kp) {
			return { error: 'ERROR: Get wallet list failed.' };
		}

		if (kp.length === 0) {
			return { error: 'ERROR: no wallet.' };
		}

		let allSignSys = getSignSysAll().map((x, i) => ({ version: 0, signType: i, signSysName: x.signSysName }));
		let tableStr = '';
		let sst = {};
		for (let i = 0; i < allSignSys.length; i++) {
			sst[`S${allSignSys[i].signType}`] = allSignSys[i].signSysName;
		}
		tableStr += "Sign type table:\n";
		tableStr += getTableStr(sst, undefined, { value: "L" }) + "\n";

		let wl: any[] = Array(kp.length);
		for (let i = 0; i < kp.length; i++) {
			let addressList = this.wallet.getAddressesList(kp[i].id);
			if (!addressList) {
				return { error: `ERROR: Get wallet ${kp[i].id} addresses list failed.` };
			}
			wl[kp[i].id] = {
				label: kp[i].label != undefined ? kp[i].label : '',
				Encryption: kp[i].encryptionFlag,
				"Address amount": addressList.length
			};
			for (let j = 0; j < allSignSys.length; j++) {
				if (kp[i].keypairs.find(element => element === allSignSys[j].signSysName)) {
					wl[kp[i].id][`S${allSignSys[j].signType}`] = "V";
				}
				else {
					wl[kp[i].id][`S${allSignSys[j].signType}`] = " ";
				}
			}
		}

		tableStr += "Wallet list: \x1b[33m[(index) is wid.]\x1b[0m\n";
		tableStr += getTableStr(wl, undefined, { label: "L", Encryption: "L" });
		console.log(tableStr);
		return { result: undefined }
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
	 *  memoryUsed,
	 * 	nowWalletID
	 * }
	 * ```
	 */
	async getStatus() {
		let r = await this.post({
			method: "getStatus",
			params: []
		});

		if (r.err) {
			return { error: r.err };
		}

		let obj = jsonParse(r.data);
		if (obj.error) {
			return { err: `ERROR:${obj.error}` }
		}
		if (this.wallet) {
			obj.result['nowWalletID'] = this.wallet.getNowWid();
		}

		if (this.jsonTable) {
			let tableStr = '';
			tableStr += getTableStr(obj.result, undefined, { index: "R", value: "L" });
			return { result: obj.result, tableStr };
		}
		return obj;
	}

	cliMethod =
		{
			help: this.help,
			//------- console set -------
			setJsonSpace: this.setJsonSpace,
			setJsonColor: this.setJsonColor,
			setJsonTable: this.setJsonTable,
			clear: this.clear,
			exit: this.exit,
			getStatus: this.getStatus,
			//------- wallet -------
			generateWallet: this.generateWallet,
			importWalletFile: this.importWalletFile,
			exportWalletFile: this.exportWalletFile,
			walletGetSignSysList: this.walletGetSignSysList,
			walletAddAddress: this.walletAddAddress,
			walletGetAddressList: this.walletGetAddressList,
			walletGetAddressDetails: this.walletGetAddressDetails,
			walletGetBalance: this.walletGetBalance,
			walletCreateTransation: this.walletCreateTransation,
			walletCreateAdvancedTransation: this.walletCreateAdvancedTransation,
			walletASend: this.walletASend,
			walletSend: this.walletSend,
			walletSendMany: this.walletSendMany,
			walletGetTxList: this.walletGetTxList,
			walletGetUTXOList: this.walletGetUTXOList,
			walletAutoWatch: this.walletAutoWatch,
			switchWallet: this.switchWallet,
			getWalletList: this.getWalletList,
			//------- tx -------
			txAddPqcertRoot: this.txAddPqcertRoot,
			txAddPqcertPubKey: this.txAddPqcertPubKey,
			getTxTemp: this.getTxTemp,
			//------- sign -------
			checkSignPqcert: this.checkSignPqcert,
			signTx: this.signTx,
			clearTxTemp: this.clearTxTemp,
			//------- send -------
			sendTxTemp: this.sendTxTemp,
			sendTx: this.sendTx,
			//------- mine -----
			mine: this.mine,
			//------- transform -------
			blockTxJson2Raw: this.blockTxJson2Raw,
			blockTxRaw2Json: this.blockTxRaw2Json,
		}

	set txTemp(blockTx: BlockTx) {
		this._txTemp = blockTx;
	}

	get txTemp() {
		return this._txTemp;
	}
}

export { WalletCli }