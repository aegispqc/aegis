import { floatStringToBigInt } from "../api/type";
import bs58ck from "../crypto/bs58ck";

function checkAddressIsBs58ck(address: string) {
	let ags = address.slice(0, 4);
	if (ags === 'AGS_') {
		let bs58 = bs58ck.decode(address);
		if (!bs58) {
			return false;
		}
		return true;
	}
	return false;
}

let rHexStr = /^([a-f0-9]{2})+$/g;
function checkAddressIsHex(address: string) {
	if (address.length !== 64) {
		return false;
	}
	return rHexStr.test(address);
}

let chStr = (x) => x;
let chInt = (x) => {
	let r = parseInt(x);
	if (isNaN(r)) {
		return null;
	}

	return r;
}
let chUint = (x) => {
	let r = parseInt(x);
	if (r < 0 || isNaN(r)) {
		return null;
	}

	return r;
}
let chBool = (x) => (x !== 'false' && x !== '0');
let chBigInt = (x) => {
	try {
		return BigInt(x);
	}
	catch (e) {
		return null;
	}
}
let chObj = (x) => {
	try {
		let obj = JSON.parse(x);
		return obj;
	}
	catch (e) {
		console.log(e);
	}

	return null
};
let chMineAddr = (x) => {
	if (x === 'false' || x === '0') {
		return false;
	}
	else {
		return x;
	}
};
let chAddessValueArray = (x) => {
	try {
		let obj = JSON.parse(x);
		if (!Array.isArray(obj)) {
			return null
		}
		for (let i = 0; i < obj.length; i++) {
			if (!obj[i].address || !obj[i].value) {
				return null
			}
			obj[i].value = BigInt(obj[i].value)
		}
		return obj
	}
	catch (e) {
		console.log(e);
	}

	return null
}
let chAddessValueArrayFloat = (x) => {
	try {
		let obj = JSON.parse(x);
		if (!Array.isArray(obj)) {
			return null
		}
		for (let i = 0; i < obj.length; i++) {
			if (!obj[i].address || !obj[i].value) {
				return null
			}
			obj[i].value = floatStringToBigInt(obj[i].value);
		}
		return obj
	}
	catch (e) {
		console.log(e);
	}
	return null
}

let chAddress = (x) => {
	if (!checkAddressIsHex(x) && !checkAddressIsBs58ck(x)) {
		return null;
	}
	return x;
}

let chAddressHex = (x) => {
	if (!checkAddressIsHex(x) && !checkAddressIsBs58ck(x)) {
		return null;
	}
	if (checkAddressIsBs58ck(x)) {
		let hex = bs58ck.decode(x);
		if (!hex) {
			return false;
		}
		return hex.toString('hex');
	}
	return x;
}

let chAddessArray = (x) => {
	try {
		let obj = JSON.parse(x);
		if (!Array.isArray(obj)) {
			return null
		}
		for (let i = 0; i < obj.length; i++) {
			if (!checkAddressIsHex(obj[i]) && !checkAddressIsBs58ck(obj[i])) {
				return null;
			}
		}
		return obj
	}
	catch (e) {
		console.log(e);
	}
	return null
}

let chAddessSignSelectArray = (x) => {
	try {
		let obj = JSON.parse(x);
		if (!Array.isArray(obj)) {
			return null
		}
		for (let i = 0; i < obj.length; i++) {
			if (!checkAddressIsHex(obj[i].address) && !checkAddressIsBs58ck(obj[i].address)) {
				return null;
			}
			if (!Array.isArray(obj[i].signSelect)) {
				return null
			}
		}
		return obj
	}
	catch (e) {
		console.log(e);
	}
	return null
}

let chHexString = (x) => {
	if (x.length !== 64) {
		return false;
	}
	return rHexStr.test(x);
}

function jsonReplacer(k, v) {
	if (typeof v === 'bigint') {
		return v.toString();
	}
	else if (v.type === 'Buffer') {
		return Buffer.from(v.data).toString('hex');
	}

	return v;
}

let methodParamsType = {
	help: [chStr, chBool],
	//------- cli -------
	setJsonSpace: [chBool],
	setJsonColor: [chBool],
	setJsonTable: [chBool],
	clear: [],
	exit: [chBool],
	//------- wallet -------
	generateWallet: [],
	importWalletFile: [chStr],
	exportWalletFile: [chStr, chBool],
	walletGetSignSysList: [],
	walletAddAddress: [],
	walletGetAddressList: [],
	walletGetAddressDetails: [chAddress, chBool],
	walletGetBalance: [],
	walletCreateTransation: [chAddress, chAddress, chBigInt, chBigInt, chBigInt, chBool, chBool],
	walletCreateAdvancedTransation: [chAddress, chAddessValueArray, chBigInt, chBigInt, chBool, chBool, chBool],
	walletSend: [chAddress, chAddress, chBigInt, chObj, chStr, chBigInt, chBool, chAddress, chBool],
	walletSendMany: [chAddress, chAddessValueArray, chObj, chStr, chBigInt, chBool, chAddress],
	walletASend: [chAddessArray, chAddessValueArray, chBigInt], // -------------------------------- test ----------------
	txAddPqcertRoot: [chAddress, chStr],
	txAddPqcertPubKey: [chHexString, chStr],
	signTx: [chAddress, chObj, chBigInt, chBool, chBool, chBool, chStr],
	checkSignPqcert: [chAddress, chObj, chBool],
	getTxTemp: [chBool],
	sendTxTemp: [],
	sendTx: [chStr],
	walletAutoWatch: [],
	blockTxJson2Raw: [chObj],
	blockTxRaw2Json: [chStr],
	switchWallet: [chInt],
	getWalletList: [],
	walletGetTxList: [chStr, chUint, chUint, chBool, chBool],
	walletGetUTXOList: [chStr, chUint, chUint, chBool],
	//------- rpc -------
	getLastBlock: [chBool, chBool],
	getBlockDataByHash: [chStr, chBool, chBool],
	getBlockDataByHeight: [chUint, chBool, chBool],
	getTransactionByTxid: [chStr, chBool],
	getPqcertByHash: [chStr, chBool],
	getPqcertDetailsByHash: [chStr, chBool],
	getTxPoolList: [],
	getTxPoolByTxid: [chStr],
	newBlock: [chObj],
	createTransation: [chObj, chBool, chBool],
	txValidator: [chObj],
	addTx: [chObj],
	mine: [chMineAddr, chBool, chBool],
	getDifficulty: [chBool],
	getStatus: [],
	walletReindex: [chInt],
	walletClearHistory: [],
	walletAddWatchAddress: [chAddressHex],
	pollingNewBlock: [],
	//---- rpc - p2p ----
	p2pAddPeer: [chStr, chUint],
	p2pDeletePeer: [chStr, chUint],
	p2pAddBlackPeer: [chStr],
	p2pDeleteBlackPeer: [chStr],
	p2pStatus: [],
	p2pGetPeerList: [],
	p2pGetBlackList: [],
};

let methodParamsTypeBigIntFloat = {};

for (let x in methodParamsType) {
	methodParamsTypeBigIntFloat[x] = [];
	for (let i = 0; i < methodParamsType[x].length; i++) {
		if (methodParamsType[x][i] === chBigInt) {
			methodParamsTypeBigIntFloat[x][i] = floatStringToBigInt;
		}
		else if (methodParamsType[x][i] === chAddessValueArray) {
			methodParamsTypeBigIntFloat[x][i] = chAddessValueArrayFloat;
		}
		else {
			methodParamsTypeBigIntFloat[x][i] = methodParamsType[x][i]
		}
	}
}

export { checkAddressIsBs58ck, chAddress, jsonReplacer, methodParamsType, methodParamsTypeBigIntFloat };