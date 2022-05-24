import { equationsOffset } from "../blockchain/pow";
import { MQPHash } from "../crypto/MQPHash";
import { Mine } from "./mine";

const maxN = 63; //If bigger then fix it.

class minerController {
	public miners: Mine[];
	public enables: boolean[];
	public size: number;

	private _minerRunFlag: boolean;
	private _interruptFlag: boolean;

	private _fixNumber: number;
	private fixIndex: number;
	private fixStr: string[];
	private cudaRunning: boolean[];

	private _numOfEquations: number;
	private _numOfVariables: number;

	public get fixNumber(): number { return this._fixNumber; }

	public get minerRunFlag(): boolean { return this._minerRunFlag; }
	public get interruptFlag(): boolean { return this._interruptFlag; }
	

	constructor() {
		this._fixNumber = 0;
		this.fixIndex = -1;
		this.fixStr = [];
		this.cudaRunning = [];
		this._minerRunFlag = false;
		this._interruptFlag = true;
	}

	async init(mqphash: MQPHash, nbit: Buffer, enables?: boolean[], whichXWidth?: number) {
		this._numOfEquations = nbit.readUInt8(0) + equationsOffset;
		this._numOfVariables = this._numOfEquations + 5;

		this.miners = [];
		this.enables = [];
		this.fixStr = [];

		let crossbredOpt = {
			id: 0,
			d: 4,
			k: 10,
			t: 12,
			b: 0,
			print:false
		}
		
		let m = new Mine(this);
		let numOfDev = await m.getDeviceCount();
		this.size = numOfDev;
		if (this.size < 1) {
			this._minerRunFlag = false;
			return;
		}

		for (let i = 0; i < this.size; i++) {
			this.miners.push(new Mine(this));
			if (enables == undefined) {
				this.enables.push(true);
			}
			else {
				this.enables.push(enables[i] !== undefined ? enables[i] : true);
			}
		}

		for (let devID = 0; devID < this.size; devID++) {
			if (this.enables[devID]) {
				this.miners[devID].init(mqphash, nbit, whichXWidth);
			}
		}

		// set fixnumber
		if (this.size <= 1) {
			this._fixNumber = 0;
		}
		else if (this.size = 2) {
			this._fixNumber = 1;
		}
		else if (this.size <= 4) {
			this._fixNumber = 2;
		}
		else if (this.size <= 8) {
			this._fixNumber = 3;
		}
		else if (this.size <= 16) {
			this._fixNumber = 4;
		}

		//The number of variables exceeds the number of countable variables. Need fix it.
		if (maxN < this._numOfVariables) {
			let diffN = this._numOfVariables - maxN;
			if (diffN > this._fixNumber) {
				this._fixNumber = diffN;
			}
		}

		//create fix str Array.
		if (this.fixNumber > 0) {
			let fLen: number = Math.pow(2, this.fixNumber)
			for (let i = 0; i < fLen; i++) {
				let str = i.toString(2);
				for (let j = 0; this.fixNumber > str.length; j++) {
					str = '0' + str;
				}
				this.fixStr.push(str);
			}
		}

		
		this.cudaRunning = [];
		for (let devID = 0; devID < this.size; devID++) {
			this.cudaRunning.push(false);
		}
	}

	async getXTset() {
		this._interruptFlag = false;
	}

	async getX(): Promise<any> {
		this._interruptFlag = false;
		this.cudaRunning.fill(false);
		return new Promise((r) => {
			let unStart = true;
			for (let devID = 0; devID < this.size; devID++) {
				if (this.enables[devID]) {
					this.miners[devID].getX(devID, 0, r);
					this.cudaRunning[devID] = true;
					unStart = false;
				}
			}

			if (unStart) {
				r(false);
			}
		})
	}

	stopFind() {
		this._interruptFlag = true;

		for (let devID = 0; devID < this.size; devID++) {
			if (this.miners[devID] != undefined) {
				this.miners[devID].stopFind();
			}
		}
	}

	startContinuous() {
		this._minerRunFlag = true;
	}

	stopContinuous() {
		this._minerRunFlag = false;
		this.stopFind();
	}

	getNextFixStr(): string | false {
		if (this.fixNumber === 0 ||
			this.fixStr.length == 0 ||
			this.fixIndex == this.fixStr.length - 1) {
			return false
		}

		this.fixIndex++;
		return this.fixStr[this.fixIndex];
	}

	otherMachineRunning(myid: number): boolean {
		let sameoneRun = false;
		for (let index = 0; index < this.cudaRunning.length; index++) {
			if (index === myid) {
				continue;
			}

			if (this.cudaRunning[index]) {
				sameoneRun = true;
			}
		}
		return sameoneRun;
	}

	setMachineStoping(myid: number) {
		this.cudaRunning[myid] = false;
	}


}


export { minerController };