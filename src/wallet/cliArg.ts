import { floatStringToBigInt } from "../api/type";

let chStr = (x) => x;
let chInt = (x) => parseInt(x);

let chUint = (x) => {
	let r = parseInt(x);
	if(r <0) {
		return null;
	}

	return r;
}

let chBool = (x) => (x !== 'false' && x !== '0');
let chBigInt = (x) => BigInt(x);

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
	clear: [],
	exit: [chBool],
	//------- wallet -------
	generateWallet: [],
	importWalletFile: [chStr],
	exportWalletFile: [chStr, chBool],
	walletGetSignSysList: [],
	walletAddAddress: [],
	walletGetAddressList: [],
	walletGetAddressDetails: [chStr, chBool],
	walletGetBalance: [],
	walletCreateNewTransation: [chStr, chStr, chBigInt, chBigInt, chBigInt, chBool, chBool],
	walletSend: [chStr, chStr, chBigInt, chObj, chStr, chBigInt],
	txAddPqcertRoot: [chStr, chStr],
	txAddPqcertPubKey: [chStr, chStr],
	signTx: [chStr, chObj, chBigInt, chBool, chBool, chBool, chStr],
	checkSignPqcert: [chStr, chObj, chBool],
	getTxTemp: [chBool],
	sendTxTemp: [],
	sendTx: [chStr],
	walletAutoWatch:[],
	blockTxJson2Raw:[chObj],
	blockTxRaw2Json:[chStr],
	switchWallet: [chInt],
	getWalletList: [],
	//------- rpc -------
	getLastBlock: [chBool, chBool],
	getBlockDataByHash: [chStr, chBool, chBool],
	getBlockDataByHeight: [chUint, chBool, chBool],
	getTransactionByTxid: [chStr, chBool],
	getPqcertByHash: [chStr, chBool],
	getTxPoolList: [],
	getTxPoolByTxid: [chStr],
	newBlock: [chObj],
	createNewTransation: [chObj, chBool, chBool],
	txValidator: [chObj],
	addTx: [chObj],
	mine: [chMineAddr, chBool, chBool],
	getDifficulty: [chBool],
	getStatus: [],
	walletReindex: [chInt],
	walletClearHistory: [],
	walletAddWatchAddress: [chStr],
	walletGetTxList: [chStr, chUint, chUint, chBool],
	walletGetUTXOList: [chStr, chUint, chUint, chBool],
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

for(let x in methodParamsType) {
	methodParamsTypeBigIntFloat[x] = [];
	for(let i=0; i<methodParamsType[x].length; i++) {
		if(methodParamsType[x][i] === chBigInt) {
			methodParamsTypeBigIntFloat[x][i] = floatStringToBigInt;
		}
		else {
			methodParamsTypeBigIntFloat[x][i] = methodParamsType[x][i]
		}
	}
}

export {methodParamsType, methodParamsTypeBigIntFloat, jsonReplacer};