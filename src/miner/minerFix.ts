import { str } from "ajv";
import { MQPHash } from "../crypto/MQPHash";
import { bufferBitModeString } from "../crypto/util";

class MinerFix {
	private mqphash: MQPHash;
	private m: number;
	private n: number;
	private _newN: number;

	private _newCoe: number;
	private _newCoeByte: number;
	private _unwantedNewCoeBit: number;


	public get newN(): number { return this._newN; }
	public get newCoe(): number { return this._newCoe; }
	public get newCoeByte(): number { return this._newCoeByte; }
	public get unwantedNewCoeBit(): number { return this._unwantedNewCoeBit; }


	constructor(mqphash: MQPHash, fixLenght: number) {
		this.mqphash = mqphash;
		this.m = mqphash.MQP.hashBit;
		this.n = mqphash.MQP.variables;
		this._newN = this.n - fixLenght;

		this._newCoe = ((this.newN * (this.newN + 1)) >> 1) + 1;
		if (this.newCoe % 8) {
			this._newCoeByte = (this._newCoe >> 3) + 1;
			this._unwantedNewCoeBit = (8 - this._newCoe % 8);
		}
		else {
			this._newCoeByte = this._newCoe >> 3;
			this._unwantedNewCoeBit = 0;
		}
	}

	fixOneEquation(fixString: string, coefficientByByte: string, unwantedBit: number) {
		let newN = this.n - fixString.length;
		let fixRe = /^[0-1]*$/
		if (!fixRe.test(fixString)) {
			console.log(`fix err : ${fixString}, not only has '0' and '1'`);
			return;
		}
		const fix = fixString.split('').map(x => Number(x));
		let mode = {
			unwantedBit: unwantedBit,
			removeSpace: true,
			displayUnwantedBit: true
		};
		let aLine = bufferBitModeString(Buffer.from(coefficientByByte, 'hex'), mode);

		if (aLine.length != ((this.n * (this.n + 1)) / 2) + 1) {
			console.log('data amount err.');
			return;
		}


		let sq: number[] = [];
		let lin: number[] = new Array(newN).fill(0);
		let theConst = 0;

		for (let i = 0; i < this.n; i++) {
			for (let j = i; j < this.n; j++) {
				let val = Number(aLine.charAt(0));
				aLine = aLine.slice(1);

				if (i >= newN) {
					if (j >= newN) {
						theConst ^= val & fix[i - newN] & fix[j - newN]
					}
					else {
						lin[j] ^= val & fix[i - newN]
					}
				}
				else {
					if (j >= newN) {
						lin[i] ^= val & fix[j - newN]
					}
					else {
						sq.push(val);
					}
				}

			}
		}
		let index: number = 0;
		for (let i = 0; i < newN; i++) {
			for (let j = i; j < newN; j++) {
				if (i === j) {
					sq[index] ^= lin[i];
				}
				index++;
			}
		}

		theConst ^= Number(aLine.charAt(0));
		sq.push(theConst);

		let tmp = sq.join('');

		let newCoe = ((newN * (newN + 1)) >> 1) + 1;
		let newCoeByte;
		let unwantedNewCoeBit;
		if (newCoe % 8) {
			newCoeByte = (newCoe >> 3) + 1;
			unwantedNewCoeBit = (8 - newCoe % 8);
		}
		else {
			newCoeByte = newCoe >> 3;
			unwantedNewCoeBit = 0;
		}

		if (newCoe % 8) {
			for (let i = 0; i < 8 - (newCoe % 8); i++) {
				tmp += '0';
			}
		}

		let tmpHex = '';
		for (let i = 0; i < tmp.length; i += 4) {
			let t = tmp.slice(i, i + 4);
			tmpHex += parseInt(t, 2).toString(16);
		}
		let newCoeBuf = Buffer.from(tmpHex, 'hex');
		
		return {
			newCoeBuf: newCoeBuf,
			newCoe: newCoe,
			newCoeByte: newCoeByte,
			unwantedNewCoeBit: unwantedNewCoeBit
		};
	}

	// get lengh 64 string
	fixBack(x64: string, fixStr: string) {
		if (x64.length !== 64) {
			return false;
		}
		let x = x64.slice(x64.length - this.newN, x64.length);
		x = x.concat(fixStr);
		
		for (let index = 0; index < this.mqphash.MQP.unwantedVariablesBit; index++) {
			x += '0';
		}

		let xBuf = Buffer.alloc(32);
		let index = 0;
		for (let i = 0; i < x.length; i += 8) {
			xBuf[index++] = parseInt(x.slice(i, i + 8), 2);
		}

		return xBuf;
	}
}

export { MinerFix };