import path from 'path';
import fs from 'fs/promises';
import { constants } from 'fs';
import os from 'os';
import { equationsOffset } from "../blockchain/pow";
import { MQPHash } from "../crypto/MQPHash";
import { Mine } from "./mine";
import { shake256 } from '../crypto/hash';


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

	public minerBinPath: string;
	public minerBinHash: Buffer;
	public minerBinHashCheck: boolean;
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
		this.minerBinPath = undefined;
		this.minerBinHash = undefined;
		this.minerBinHashCheck = false;
	}

	async init() {
		let minerBinPathSnapshot;
		const minerBinDir = path.join(process.cwd(), '/mineBin/');
		switch (os.platform()) {
			case 'linux':
				this.minerBinPath = path.join(minerBinDir, '/mine');
				this.minerBinHash = Buffer.from("123aa6ab9fbba1477af5e73f70ec8c082719139e592b9d5451d0de143559ee0d", "hex");
				minerBinPathSnapshot = path.join(__dirname, '/mineBin/mine');
				break;
			case 'win32':
				this.minerBinPath = path.join(minerBinDir, '/mineWin32.exe');
				this.minerBinHash = Buffer.from("5bf7ff13bb8420272991d5acd626eae239139c87809db3e1452865d2945e0ced", "hex");
				minerBinPathSnapshot = path.join(__dirname, '/mineBin/mineWin32.exe');
				break;
			default:
				console.error("unkow os!")
				this.minerBinPath = undefined;
				this.minerBinHash = undefined;
				return;
		}
		
		try {
			await fs.mkdir(minerBinDir);
		} catch (err) {
			if (err.code !== 'EEXIST') {
				console.error(`'${minerBinDir}' mkdir failed!`);
			}
		}

		try {
			await fs.access(this.minerBinPath, constants.X_OK);
		} catch {
			let minerBin = await fs.readFile(minerBinPathSnapshot);
			await fs.writeFile(this.minerBinPath, minerBin, {mode: 0o777});
		}
		try {
			let minerBin = await fs.readFile(this.minerBinPath);
			let mbSha = shake256(minerBin);
			this.minerBinHashCheck = mbSha.equals(this.minerBinHash);
			console.log('minerBin Hash Check:', this.minerBinHashCheck);
		} catch (error) {
			console.log(error);
		}
	}

	async setup(mqphash: MQPHash, nbit: Buffer, enables?: boolean[], whichXWidth?: number) {
		this._numOfEquations = nbit.readUInt8(0) + equationsOffset;
		this._numOfVariables = this._numOfEquations + 5;

		this.miners = [];
		this.enables = [];
		this.fixStr = [];
		this.fixIndex = -1;

		let crossbredOpt = {
			id: 0,
			d: 4,
			k: 10,
			t: 12,
			b: 0,
			print: false
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
			if (!enables) {
				this.enables.push(true);
			}
			else {
				this.enables.push(enables[i] !== undefined ? enables[i] : false);
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