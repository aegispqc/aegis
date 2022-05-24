interface bufferBitModeOpt {
	unwantedBit?: number;
	removeSpace?: boolean;
	displayUnwantedBit?: boolean;
}

function getBufferBit(buf: Buffer, bitIndex: number): 0 | 1 {
	let byteIndex = bitIndex >> 3;
	let relativeIndex = bitIndex % 8;

	return <0 | 1>((buf[byteIndex] >> (7 - relativeIndex)) & 1);
}

function setBufferBit(buf: Buffer, bitIndex: number, value: 0 | 1): boolean {
	let byteIndex = bitIndex >> 3;
	let relativeIndex = bitIndex % 8;

	if (byteIndex > buf.length) {
		return false;
	}

	if (value) {
		buf[byteIndex] |= (1 << (7 - relativeIndex));
	}
	else {
		buf[byteIndex] &= ~(1 << (7 - relativeIndex));
	}

	return true;
}

function setBufferShiftBit(buf: Buffer, shiftBit: number, value: Buffer): boolean {
	let byteIndex = shiftBit >> 3;
	let relativeIndex = shiftBit % 8;

	if (byteIndex > buf.length) {
		return false;
	}

	if (!relativeIndex) {
		buf[byteIndex] = value[0];
	}
	else {
		let bufTemp = Buffer.alloc(2);
		let mask = Buffer.alloc(2);

		bufTemp[0] = value[0] >> relativeIndex;
		bufTemp[1] = value[0] << (8 - relativeIndex);

		mask[1] = (0xff >> relativeIndex);
		mask[0] = ~mask[1];

		buf[byteIndex] = buf[byteIndex] & (bufTemp[0] | mask[0]) | bufTemp[0];

		if (buf[byteIndex + 1]) {
			buf[byteIndex + 1] = buf[byteIndex + 1] & (bufTemp[1] | mask[1]) | bufTemp[1];
		}
	}

	return true;
}

function setZeroBufferShiftBit(buf: Buffer, shiftBit: number, value: Buffer): boolean {
	let byteIndex = shiftBit >> 3;
	let relativeIndex = shiftBit % 8;

	if (byteIndex > buf.length) {
		return false;
	}

	if (!relativeIndex) {
		for (let i = byteIndex, j = 0; i < buf.length && j < value.length; i++, j++) {
			buf[i] = value[j];
		}

	}
	else {
		let bufTemp = Buffer.alloc(2);

		for (let i = byteIndex, j = 0; i < buf.length && j < value.length; i++, j++) {
			bufTemp[0] = value[j] >> relativeIndex;
			bufTemp[1] = value[j] << (8 - relativeIndex);
			buf[i] |= bufTemp[0];

			if (buf[i + 1] != undefined) {
				buf[i + 1] |= bufTemp[1];
			}
		}
	}
	return true;
}

function setBufferFillZero(buf: Buffer, shiftBit: number): boolean {
	let byteIndex = shiftBit >> 3;
	let relativeIndex = shiftBit % 8;

	if (byteIndex > buf.length) {
		return false;
	}

	buf[byteIndex] = buf[byteIndex] >> relativeIndex;
	buf[byteIndex] = buf[byteIndex] << relativeIndex;

	for (let i = byteIndex + 1; i < buf.length; i++) {
		buf[i] = 0x00;
	}

	return true;
}

function bufferShiftOneBit(buf: Buffer) {
	let lastBit = 0;
	for (let i = 0; i < buf.length; i++) {
		if (lastBit) {
			lastBit = buf[i] & 0x01;
			buf[i] >>= 1;
			buf[i] |= 0x80;
		}
		else {
			lastBit = buf[i] & 0x01;
			buf[i] >>= 1;
		}
	}
}

function bufferUnshiftOneBit(buf: Buffer) {
	let lastBit = 0;
	for (let i = buf.length - 1; i >= 0; i--) {
		if (lastBit) {
			lastBit = buf[i] & 0x80;
			buf[i] <<= 1;
			buf[i] |= 0x01;
		}
		else {
			lastBit = buf[i] & 0x80;
			buf[i] <<= 1;
		}
	}
}

function bufferAnd(a: Buffer, b: Buffer, c: Buffer) {
	for (let i = 0; i < a.length; i++) {
		c[i] = a[i] & b[i];
	}
}

function bufferXor(a: Buffer, b: Buffer, c: Buffer) {
	for (let i = 0; i < a.length; i++) {
		c[i] = a[i] ^ b[i];
	}
}

function bufferXorInside(buf: Buffer): 0 | 1 {
	let temp = 0x00;

	for (let i = 0; i < buf.length; i++) {
		temp ^= buf[i];
	}

	temp = temp ^ (temp >> 4);
	temp = temp ^ (temp >> 2);
	temp = temp ^ (temp >> 1);

	return <0 | 1>(temp & 1);
}


function bufferBitModeString(buf: Buffer, opt?: bufferBitModeOpt): string {
	let temp = '';

	for (let i = 0; i < buf.length; i++) {
		temp += buf[i].toString(2).padStart(8, '0');
	}

	let tempArr = temp.match(/.{1,8}/g);
	temp = opt?.removeSpace ? tempArr.join('') : tempArr.join(' ');

	if (opt?.unwantedBit) {
		let stringIndex = ((buf.length << 3) - opt.unwantedBit);
		if (!opt.removeSpace) {
			stringIndex += (stringIndex >> 3);
		}
		temp = opt.displayUnwantedBit ? `${temp.slice(0, stringIndex)}` : `${temp.slice(0, stringIndex)} <unwantedBit>: ${temp.slice(stringIndex)}`;
	}

	return temp;
}

function checkBufferIsZero(buf: Buffer): boolean {
	for (let i = 0; i < buf.length; i++) {
		if (buf[i] !== 0) {
			return false;
		}
	}

	return true;
}

export {
	getBufferBit,
	setBufferBit,
	setBufferShiftBit,
	setZeroBufferShiftBit,
	setBufferFillZero,
	bufferShiftOneBit,
	bufferUnshiftOneBit,
	bufferAnd,
	bufferXor,
	bufferXorInside,
	bufferBitModeString,
	checkBufferIsZero,
}