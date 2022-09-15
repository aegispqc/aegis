import { bigIntToObj, bigIntToString, bufferToObj, bufferToString, bigIntToFloatString, floatStringToBigInt } from './type';

type jsonStringifyOpt = {

	space?: string;
	bufferEncode?: BufferEncoding;
	bufferObjFlag?: boolean;
	bigIntObjFlag?: boolean;
	bigIntObjFloatFlag?: boolean;
}

function jsonStringify(data, opt: jsonStringifyOpt = {}) {
	if (opt.space === undefined) {
		opt.space = ' ';
	}
	if (opt.bufferEncode === undefined) {
		opt.bufferEncode = 'hex';
	}
	if (opt.bufferObjFlag === undefined) {
		opt.bufferObjFlag = true;
	}
	if (opt.bigIntObjFlag === undefined) {
		opt.bigIntObjFlag = true;
	}

	let bigIntTo = (opt.bigIntObjFlag) ? bigIntToObj : bigIntToString;
	let bufferTo = (opt.bufferObjFlag) ? bufferToObj : bufferToString;
	if (opt.bigIntObjFloatFlag) {
		bigIntTo = bigIntToFloatString;
	}

	return JSON.stringify(data, (k, v) => {
		if (v && v.type === 'Buffer') {
			return bufferTo(Buffer.from(v.data), opt.bufferEncode);
		}
		else if (typeof v === 'bigint') {
			return bigIntTo(v);
		}
		else {
			return v;
		}
	}, opt.space);
}

function jsonParse(data: string, opt: { bufferEncode?: BufferEncoding } = {}) {
	let r
	if (!opt.bufferEncode) {
		opt.bufferEncode = 'hex';
	}
	try {
		r = JSON.parse(data, (k, v) => {
			if (v?._agsJsonType) {
				if (v._agsJsonType === 'bigint') {
					return BigInt(v.value);
				}
				else if (v._agsJsonType === 'buffer') {
					return Buffer.from(v.value, opt.bufferEncode);
				}

			}
			return v;
		});

	} catch (e) {
		throw new Error(e);
	}

	return r;
}

export { jsonStringify, jsonParse };