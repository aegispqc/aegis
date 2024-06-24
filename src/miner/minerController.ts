import path from 'path';
import fs from 'fs/promises';
import { constants } from 'fs';
import os from 'os';
import { powParameter } from '../blockchain/pow';
import { MQPHash } from '../crypto/MQPHash';
import { Mine } from './mine';
import { shake256 } from '../crypto/hash';
import { spawn } from 'child_process';

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
		this.miners = [];
		this._fixNumber = 0;
		this.fixIndex = -1;
		this.fixStr = [];
		this.cudaRunning = [];
		this.enables = [];
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
				this.minerBinPath = path.join(minerBinDir, '/mineLinux');
				this.minerBinHash = Buffer.from('9ab38de89bc2596295449738a133b499a5d2e227d6faf8b324fa907dc8cb04a3', 'hex');
				minerBinPathSnapshot = path.join(__dirname, '/mineBin/mineLinux');
				break;
			case 'win32':
				this.minerBinPath = path.join(minerBinDir, '/mineWin.exe');
				this.minerBinHash = Buffer.from('501c6191ce49272a86a78c17e8c19ba15dc44101f906f80737933bb54895fcdb', 'hex');
				minerBinPathSnapshot = path.join(__dirname, '/mineBin/mineWin.exe');
				break;
			default:
				console.error('unkown os!');
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
			await fs.writeFile(this.minerBinPath, minerBin, { mode: 0o777 });
		}
		try {
			let minerBin = await fs.readFile(this.minerBinPath);
			let mbSha = shake256(minerBin);
			this.minerBinHashCheck = mbSha.equals(this.minerBinHash);
			console.log('minerBin Hash Check:', this.minerBinHashCheck);
		} catch (error) {
			console.log(error);
		}

		let m = new Mine(this);
		let numOfDev = await m.getDeviceCount();
		if (!numOfDev.err) {
			this.size = numOfDev.data;
		}
		else {
			this.size = 0;
		}
	}

	allGpuEnable() {
		this.enables = Array(this.size).fill(true);
	}

	setGpuEnable(gpuUse: boolean[] = []) {
		this.enables = gpuUse;
	}

	async setup(mqphash: MQPHash, nbit: Buffer, whichXWidth?: number) {
		this._numOfEquations = nbit.readUInt8(0) + powParameter.equationsOffset;
		this._numOfVariables = this._numOfEquations + 5;

		this.miners = [];
		this.fixStr = [];
		this.fixIndex = -1;

		if (this.size < 1) {
			this._minerRunFlag = false;
			return;
		}

		let enableCount = 0;
		for (let i = 0; i < this.size; i++) {
			this.miners.push(new Mine(this));

			if (!this.enables[i]) {
				this.enables[i] = false;
			}
			else {
				enableCount++;
			}
		}

		if (enableCount < 1) {
			this._minerRunFlag = false;
			return;
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
		else if (this.size <= 2) {
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
		return new Promise(async (r) => {
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
	static async getDeviceList(): Promise<{ error: any } | any[]> {
		return new Promise(async (r) => {
			let child = spawn('nvidia-smi', ['-L']);
			let str = '';
			let devices = [];
			child.on('exit', (code) => {
				let d = str.split(/\r\n|\n|\r/);
				for (let i = 0; i < d.length - 1; i++) {
					let tmp = d[i].split(' (UUID: ');
					let deviceName = tmp[0].split(': ')[1];
					let deviceUUID = tmp[1].slice(0, -1);
					console.log(d[i]);
					devices.push({ name: deviceName, uuid: deviceUUID });
				}
				r(devices);
			});
			child.stderr.on('data', (data) => {
				console.error(`stderr: ${data}`);
			});
			child.stdout.on('data', (data) => {
				str += data.toString();
			});
			child.on('error', (err) => {
				r({ error: err });
			});
		});
	}

	static async getGPUStatusByUuid(uuid: string) {
		return new Promise(async (r) => {
			let child = spawn('nvidia-smi', ['-i', uuid, '--query-gpu=utilization.gpu,utilization.memory,temperature.gpu,fan.speed,driver_version,memory.total,memory.used,memory.free', '--format=csv,noheader,nounits']);
			let str = '';
			let devices = [];
			child.on('exit', (code) => {

				r(str);
			});
			child.stderr.on('data', (data) => {
				console.error(`stderr: ${data}`);
			});
			child.stdout.on('data', (data) => {
				str += data.toString();
			});
			child.on('error', (err) => {
				r({ error: err });
			});
		});
	}

	static async getGPUStatus() {
		let list = await minerController.getDeviceList();
		if (!Array.isArray(list) && list.error) {
			return false;
		}
		let devices = [];
		if (Array.isArray(list)) for (let i = 0; i < list.length; i++) {
			let t = await minerController.getGPUStatusByUuid(list[i].uuid);
			t = t.toString().split(/, |\n|\r/);
			devices.push({
				'name': list[i].name,
				'uuid': list[i].uuid,
				'utilization.gpu': t[0],
				'utilization.memory': t[1],
				'temperature.gpu': t[2],
				'fan.speed': t[3],
				'driver_version': t[4],
				'memory.total': t[5],
				'memory.used': t[6],
				'memory.free': t[7]
			});
		}
		return devices;
	}
}

export { minerController };
