import { shake256, shake256XOF } from './hash'
import {
	getBufferBit,
	setBufferBit,
	bufferUnshiftOneBit,
	setZeroBufferShiftBit,
	bufferAnd,
	bufferXorInside,
	bufferBitModeString
} from './util';

interface createQuestionReturn {
	seed: Buffer;
	equations: Buffer[];
	variables: number;
	variablesByte: number;
	unwantedVariablesBit: number;
	coefficient: number;
	coefficientByte: number;
	unwantedCoefficientBit: number;
	hashBit: number;
	hashByte: number;
	unwantedHashBit: number;
}

class MQPHash {
	private _MQP: createQuestionReturn;

	constructor(seed: Buffer, equationsN: number, variablesN: number) {
		this._MQP = MQPHash.createMQP(seed, equationsN, variablesN);
	}

	// MQP read only
	get MQP() { return this._MQP; }

	/* 
		MQPHash fi (i=1,2,...,m)
		fi(x1, x2, .....xn) = ( summation ( 1 <= j <= k <= n ) akj * xj * xk ) + c = 0
	*/
	private static createMQP(seed: Buffer, equationsN: number, variablesN: number): createQuestionReturn {
		let variablesByte;
		let unwantedVariablesBit;

		if (variablesN % 8) {
			variablesByte = (variablesN >> 3) + 1;
			unwantedVariablesBit = 8 - variablesN % 8;
		}
		else {
			variablesByte = variablesN >> 3;
			unwantedVariablesBit = 0;
		}

		let equations = Array(equationsN);
		let coefficient = ((variablesN * (variablesN + 1)) >> 1) + 1;
		let coefficientByte;
		let unwantedCoefficientBit;

		if (coefficient % 8) {
			coefficientByte = (coefficient >> 3) + 1;
			unwantedCoefficientBit = (8 - coefficient % 8);
		}
		else {
			coefficientByte = coefficient >> 3;
			unwantedCoefficientBit = 0;
		}

		let hashByte;
		let unwantedHashBit = (equationsN % 8) ? 8 - (equationsN % 8) : 0;
		if (equationsN % 8) {
			hashByte = (equationsN >> 3) + 1;
			unwantedHashBit = (8 - equationsN % 8);
		}
		else {
			hashByte = equationsN >> 3;
			unwantedHashBit = 0;
		}

		let allCoefficient: Buffer = shake256XOF(seed, coefficientByte * equationsN);
		for (let i = 0; i < equationsN; i++) {
			let byteStart = i * coefficientByte;
			equations[i] = allCoefficient.subarray(byteStart, byteStart + coefficientByte);
			// Discard extra bits
			equations[i][coefficientByte - 1] >>= unwantedCoefficientBit;
			equations[i][coefficientByte - 1] <<= unwantedCoefficientBit;
		}
		return {
			seed,
			equations,
			variables: variablesN,
			variablesByte,
			unwantedVariablesBit,
			coefficient,
			coefficientByte,
			unwantedCoefficientBit,
			hashBit: equations.length,
			hashByte,
			unwantedHashBit
		};
	}

	xToXx(x: Buffer): Buffer | false {
		if (x.length !== this._MQP.variablesByte) {
			console.error(`error input buffer length: ${x.length}, need: ${this._MQP.variablesByte}`);
			return false;
		}
		else if (x[x.length - 1] & (~(0xff << this._MQP.unwantedVariablesBit))) {
			console.error(`error input bit, last ${this._MQP.unwantedVariablesBit} bits is not zero`, bufferBitModeString(x));
			return false;
		}

		let xixj = Buffer.alloc(this._MQP.coefficientByte);
		let xTemp = Buffer.alloc(this._MQP.variablesByte);
		let setIndex = 0;

		x.copy(xTemp);

		for (let i = 0; i < this._MQP.variables; i++) {
			let xi = getBufferBit(x, i);

			if (xi) {
				setZeroBufferShiftBit(xixj, setIndex, xTemp);
			}

			bufferUnshiftOneBit(xTemp);
			setIndex += (this._MQP.variables - i);
		}

		setBufferBit(xixj, this._MQP.coefficient - 1, 1);	//Constant
		return xixj;
	}

	update(x: Buffer): any {
		let xixj = this.xToXx(x);
		if (!xixj) {
			return false;
		}

		let resultL = this._MQP.hashByte;
		let result = Buffer.alloc(resultL); //equations length = hash length

		let tempBuf = Buffer.alloc(this._MQP.coefficientByte);

		for (let m = 0; m < this._MQP.equations.length; m++) {
			bufferAnd(this._MQP.equations[m], xixj, tempBuf);
			let sum = bufferXorInside(tempBuf);
			setBufferBit(result, m, sum);
		}

		return result;
	}

	checkIsSolution(x: Buffer): boolean {
		let xixj = this.xToXx(x);
		if (!xixj) {
			return false;
		}

		let tempBuf = Buffer.alloc(this._MQP.coefficientByte);
		for (let m = 0; m < this._MQP.equations.length; m++) {
			bufferAnd(this._MQP.equations[m], xixj, tempBuf);
			let sum = bufferXorInside(tempBuf);
			if (sum !== 0) {
				return false;
			}
		}

		return true;
	}
}

export { MQPHash }