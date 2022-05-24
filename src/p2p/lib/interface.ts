
export interface Option {
	[key:string]: any;
}

export interface CallbackOption {
	[key:string]: Function;
}

export interface interfaceIp {
	v4:	 string;
	v6:	 string;
}

export interface interfaceServicesOpt {
	list:	boolean[],
	data:	bigint
}

export interface interfaceNetworkAddress {
	err?:			boolean;
	ipPortStr?:		string;
	ip:				string;
	port:			number;
	status?: {
		addTime:	number;
		updateTime: number;
		services:	BigInt;
		relay?:		boolean;
		permanent?:	boolean;
	}
}

export interface interfaceNetwork {
	name:			string;
	alias:			string;
	networkMagic:	number;
	dnsSeeds:		string[];
	ip?:			string[];
	relay?:			boolean;
}

export interface interfaceNetworkNet {
	time?:		BigInt;
	services:	BigInt;
	ip:			string;
	port:		number;
}

export interface interfaceNetworkVersion {
	version:		number;
	services:		BigInt;
	timestamp:		BigInt;
	addrRecv:		interfaceNetworkNet;
	addrFrom:		interfaceNetworkNet;
	nonce:			Buffer;
	uid:			string;
	startHeight:	number;
	relay:			boolean;
}

export interface interfaceBlock {
	hash:		Buffer;
	height:		number;
	header:		Buffer;
	txs:		Buffer[];
}

export interface interfaceBlockHeader {
	version:		number;
	prevBlock:		Buffer;
	merkleRoot:		Buffer;
	timestamp:		number;
	bits:			number;
	nonce:			Buffer;
	txnCount:		number;
}

export interface interfaceInv {
	type:	number;
	hash:	Buffer | string;
}

export interface interfaceInvObject {
	[key:string]: Buffer[];
}

export interface interfaceMessageObject {
	err?:			number;
	data?:			any;
	magic:			Buffer;
	command:		string;
	length:			number;
	checksum:		Buffer;
	payloadBuffer:	Buffer;
	payload?:		Option;
}

export interface p2pMessageObject {
	data:	interfaceMessageObject;
	remain:	Buffer;
}