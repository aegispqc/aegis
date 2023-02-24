import { MQPHash } from '../crypto/MQPHash';
import { shake256XOF } from '../crypto/hash';

const powParameter = {
	equationsOffset: 31,
	nbitSampleRate: 200,
	referenceSeconds: 600
}

/**
 * @param {Buffer} seed - Block Header, Does not contain
 * @param {Buffer} nbit - 2 byte; First is equations (Rough adjustment), last is threshold (Fine-tune)
 * @param {Buffer} x - 32byte; Hash input 
 */
function verifyPoW(seed: Buffer, nbit: Buffer, x: Buffer): boolean {
	let equationsN = nbit.readUInt8(0) + powParameter.equationsOffset;
	let variablesN = equationsN + 5;
	let threshold = nbit.readUInt8(1);

	if (x.length !== 32) {
		return false;
	}

	//------- step 1 create mpqhash function -------
	let powHash = new MQPHash(seed, equationsN, variablesN);

	for (let i = powHash.MQP.variablesByte; i < 32; i++) {
		if (x[i] !== 0) {
			return false;
		}
	}

	if ((x[powHash.MQP.variablesByte - 1] & (~(0xff << powHash.MQP.unwantedVariablesBit))) !== 0) {
		return false;
	}

	x = x.subarray(0, powHash.MQP.variablesByte);
	//------- step 2 mpqhash(x) = zero, Confirm whether x is the solution of the system of equations ------- 
	let isSolution = powHash.checkIsSolution(x);
	if (!isSolution) {
		return false;
	}

	//------- step 3 Let x2 = shake256(x), and set the extra bits to 0 ------- 
	let x2 = shake256XOF(x, powHash.MQP.variablesByte);
	x2[x2.length - 1] >>= powHash.MQP.unwantedVariablesBit;
	x2[x2.length - 1] <<= powHash.MQP.unwantedVariablesBit;

	//------- step 4 Get the hashvalue of mpqhash(x2) -------
	let hashVal = powHash.update(x2);
	if (!hashVal) {
		return false;
	}

	//------- step 5 Let hashVal = shake256(hashVal), and take the first 9 bits as the integer value -------
	hashVal = shake256XOF(hashVal, 2);		// 2 byte = 16 bit 
	hashVal = (hashVal[0] << 1) | (hashVal[1] >> 7);		//first 9 bits to integer value (big-endian)

	//------- step 6 Compare with threshold -------
	if (threshold < hashVal) {
		return true;
	}
	else {
		return false;
	}
}

function calculateNbit(targetTime: number, lastNbit: Buffer, windowSize: number, windowTimeStart: number, windowTimeEnd: number): Buffer {
	let exponent = lastNbit.readUInt8(0);
	let threshold = lastNbit.readUInt8(1);
	let actualTime = (windowTimeEnd - windowTimeStart) / windowSize;
	let timeRatio = actualTime / targetTime;
	let speedRatio = 1 / timeRatio;

	let nbitDigitize = exponent + Math.log2(512 / (512 - threshold));
	let newNbitDigitize = nbitDigitize + Math.log2(speedRatio);
	let newExponent;
	let newThreshold;

	if (newNbitDigitize < 1) {
		newNbitDigitize = 1;
		newExponent = 1;
		newThreshold = 0;
	}
	else {
		newExponent = Math.floor(newNbitDigitize);
		newThreshold = 512 / (2 ** (newNbitDigitize - newExponent));
		newThreshold = Math.floor(512 - newThreshold);
	}

	if (newThreshold > 255) {
		newThreshold = 255;
	}
	else if (newThreshold < 0) {
		newThreshold = 0;
	}

	let newNbit = Buffer.alloc(2);
	newNbit.writeUInt8(newExponent);
	newNbit.writeUInt8(newThreshold, 1);
	return newNbit;
}

function getDifficultyByNbit(nbit: Buffer): number {
	let exponent = nbit.readUInt8(0);
	let threshold = nbit.readUInt8(1);
	return exponent + Math.log2(512 / (512 - threshold));
}

function setPow(newEquationsOffset = 31, newNbitSampleRate = 200, newReferenceSeconds = 600) {
	powParameter.equationsOffset = newEquationsOffset;
	powParameter.nbitSampleRate = newNbitSampleRate;
	powParameter.referenceSeconds = newReferenceSeconds;
}

export {
	verifyPoW,
	calculateNbit,
	powParameter,
	getDifficultyByNbit,
	setPow
}