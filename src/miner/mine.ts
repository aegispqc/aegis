import { MQPHash } from '../crypto/MQPHash';
import { equationsOffset, verifyPoW } from '../blockchain/pow';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import os from 'os';
import { MinerFix } from './minerFix';
import { minerController } from './minerController';

class Mine {
	private m: number;
	private n: number;
	private startSMCount: number;
	private whichXWidth: number;
	private mqphash: MQPHash;
	private nbit: Buffer;
	private child: ChildProcessWithoutNullStreams;
	private deviceID: number;
	private _minerController: minerController;

	private path: string;
	private x_data: any;

	public get minerController(): minerController { return this._minerController; }

	constructor(mc: minerController) {
		this._minerController = mc;
	}

	init(mqphash: MQPHash, nbit: Buffer, whichXWidth?: number) {
		this.m = nbit.readUInt8(0) + equationsOffset;
		this.n = this.m + 5;
		this.startSMCount = 0;
		this.whichXWidth = whichXWidth ? whichXWidth : 1000;
		this.mqphash = mqphash;
		this.nbit = nbit;
		this.setDiviceID(0);
	}

	setDiviceID(id: number) {
		this.deviceID = id;
	}

	async cal(fix?: string): Promise<{ err?: string, errCode?: number, result?: any }> {
		return new Promise((r) => {
			if (this._minerController.minerBinPath == undefined) {
				r({ err: 'no path!' });
			}

			let equations;
			let opts;
			let mf: MinerFix;
			if (fix) {
				mf = new MinerFix(this.mqphash, fix.length);
				equations = this.mqphash.MQP.equations.map(x => mf.fixOneEquation(fix, x.toString('hex'), this.mqphash.MQP.unwantedCoefficientBit).newCoeBuf.toString('hex'));
				opts = ['2', `${this.deviceID}`, `${this.m}`, `${mf.newN}`, `${this.whichXWidth}`, `${this.startSMCount}`, `${mf.newCoe}`];
			}
			else {
				equations = this.mqphash.MQP.equations.map(x => x.toString('hex'));
				opts = ['2', `${this.deviceID}`, `${this.m}`, `${this.n}`, `${this.whichXWidth}`, `${this.startSMCount}`, `${this.mqphash.MQP.coefficient}`];
			}
			let str = '';
			this.child = spawn(this._minerController.minerBinPath, opts);
			this.child.stdin.write(equations.join('\n'));
			this.child.stdin.write('\nend\n');
			
			this.child.stdout.on('data', (data) => {
				str += data.toString();
			});

			this.child.on('exit', (code) => {
				if (code == 0) {
					let words = str.toString().split('x found:');
					if (words[1] == undefined) {
						r({ errCode: -101 });
					}
					else {
						//fix back
						this.x_data = JSON.parse(words[1]);
						if (fix) {
							this.x_data.xBuf = mf.fixBack(this.x_data.x, fix);
						}
						r({ result: this.x_data });
					}
				}
			});

			this.child.on('close', (code, signal) => {
				if (signal === 'SIGTERM') {
					r({ err: 'child process terminated due to receipt of signal SIGTERM!' });
				}else
				{
					r({ err: 'child process terminated!' });
				}
			});

			this.child.stderr.on('data', (data) => {
				console.error(`stderr: ${data}`);
			});
		});
	}

	private checkSolution(): boolean {
		let solution = this.x_data.x;
		let x = solution.slice(solution.length - this.n, solution.length);

		for (let index = 0; index < this.mqphash.MQP.unwantedVariablesBit; index++) {
			x += '0';
		}

		let xBuf = Buffer.alloc(32);
		let index = 0;

		for (let i = 0; i < x.length; i += 8) {
			xBuf[index++] = parseInt(x.slice(i, i + 8), 2);
		}
		this.x_data.xBuf = xBuf;

		return this.mqphash.checkIsSolution(xBuf.subarray(0, this.mqphash.MQP.variablesByte));
	}

	async getX(devID: number = 0, startSMCount: number = 0, cb?: Function): Promise<any> {
		this.setDiviceID(devID);
		this.startSMCount = startSMCount;
		let fix = this.minerController.getNextFixStr();
		while (true) {
			let x;
			if (this.minerController.fixNumber > 0) {
				if (fix) {
					x = await this.cal(fix);
				} else {
					if (!this.minerController.otherMachineRunning(devID)) {
						if (cb) cb(false);
					}
					this.minerController.setMachineStoping(devID);
					return false;
				}
			}
			else {
				x = await this.cal();
			}

			if (x.errCode === -101) {
				if (this.minerController.fixNumber > 0) {//fix next
					console.log(fix, 'this fix str not found。');
					fix = this.minerController.getNextFixStr();
					continue;
				}
				else {
					if (cb) cb(false);
					return false;
				}
			}

			if (x.err || !x.result) {
				if (cb) cb(false);
				return false;
			}

			if (this.minerController.fixNumber > 0) {
				if (!this.mqphash.checkIsSolution(x.result.xBuf.subarray(0, this.mqphash.MQP.variablesByte))) {
					continue;
				}
			}
			else {
				if (!this.checkSolution()) {
					if (cb) cb(false);
					return false;
				}
			}

			if (verifyPoW(this.mqphash.MQP.seed, this.nbit, x.result.xBuf)) {
				if (cb) cb(x.result.xBuf);
				return x.result.xBuf;
			}
			this.startSMCount = Number(x.result.smCount) + 1 || 0;
		}
	}

	stopFind() {
		if (this.child) {
			let r = this.child.kill();
			this.child = null;
		}
	}

	async getDeviceCount(): Promise<any> {
		return new Promise((r) => {
			if (this._minerController.minerBinPath == undefined) {
				r({ err: 'no path!' });
			}

			let str = '';
			let opts = ['0', '0'];
			const child = spawn(this._minerController.minerBinPath, opts);

			child.on('exit', (code) => {
				if (code == 0) {
					let words = str.toString().split('Device count:');
					if (words[1] == undefined) {
						r({ err: 'x not found.' });
					} else {
						this.x_data = JSON.parse(words[1]);
						r(this.x_data);
					}
				}
			});
			child.stderr.on('data', (data) => {
				console.error(`stderr: ${data}`);
			});
			child.stdout.on('data', (data) => {
				str += data.toString();
			});
		});
	}

	async getNumOfExecution(): Promise<any> {
		return new Promise((r) => {
			if (this._minerController.minerBinPath == undefined) {
				r({ err: 'no path!' });
			}

			let str = '';
			let opts = ['1', '0', `${this.m}`, `${this.n}`];
			const child = spawn(this._minerController.minerBinPath, opts);

			child.on('exit', (code) => {
				if (code == 0) {
					let words = str.toString().split('Total number of executions:');
					if (words[1] == undefined) {
						r({ err: 'error' });
					} else {
						this.x_data = JSON.parse(words[1]);
						r(this.x_data);
					}
				}
			});
			child.stderr.on('data', (data) => {
				console.error(`stderr: ${data}`);
			});
			child.stdout.on('data', (data) => {
				str += data.toString();
			});
		});
	}
}

export { Mine };