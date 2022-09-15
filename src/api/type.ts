function bigIntToString(v: bigint): string {
	return v.toString();
}

function bigIntToObj(v: bigint) {
	return {
		_agsJsonType: 'bigint',
		value: v.toString()
	};
}

function bigIntToFloatString(v: bigint): string {
	let str: any = v.toString().padStart(9, '0');
	str = str.split('');
	str.splice(-8, 0, '.');
	return str.join('');
}

function floatStringToBigInt(v: string) {
	let str = v.split('.');
	let ip = BigInt(str[0]);
	let fp = BigInt((str[1] || '0').slice(0, 8).padEnd(8, '0'));
	return (ip * 100000000n) + fp;
}

function bufferToString(v: Buffer, bufferEncode: BufferEncoding) {
	return v.toString(bufferEncode);
}

function bufferToObj(v: Buffer, bufferEncode: BufferEncoding) {
	return {
		_agsJsonType: 'buffer',
		value: v.toString(bufferEncode)
	};
}

function floatToPercentage(v: number, decimal: number = 1) {
	let p = Math.round(v * 100 * Math.pow(10, decimal));
	if (p === 0) {
		return `< ${Math.pow(10, -decimal)}%`
	}
	p /= Math.pow(10, decimal);
	return `${p}%`;
}

export { bigIntToString, bigIntToObj, bufferToString, bufferToObj, bigIntToFloatString, floatStringToBigInt, floatToPercentage }