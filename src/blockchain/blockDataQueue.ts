import BlockData from "./blockData";

type preFun = (blockData: BlockData) => Promise<boolean>;
type backFun = (blockData: BlockData) => Promise<boolean>;
type finishFun = (err: { hash: Buffer } | boolean) => Promise<any>;

class BlockDataQueue {
	private blockList: (BlockData | null)[];
	private blockHash: { [key: string]: BlockData };
	private readyAmount: number;
	private runIndex: number;
	private backFun: backFun;
	private finishFun?: finishFun;
	private preFun?: preFun;
	private stopFlag: boolean;
	private runFlag: boolean;

	constructor(n: number, backFun: backFun, finishFun?: finishFun, preFun?: preFun) {
		this.blockList = new Array(n);
		this.blockHash = {};
		this.readyAmount = 0;
		this.runIndex = 0;
		this.backFun = backFun;
		this.finishFun = finishFun;
		this.preFun = (preFun) ? preFun : null;

		this.stopFlag = false;
		this.runFlag = false;
	}

	add(blockData: BlockData, index: number): boolean {
		if (this.stopFlag) {
			return false;
		}

		if (this.preFun) {
			if (!this.preFun(blockData)) {
				return false
			}
		}

		if (index >= this.blockList.length || index < this.runIndex
			|| this.readyAmount >= this.blockList.length) {
			return false;
		}

		if (this.blockList[index]) {
			return false;
		}

		let hash = blockData.blockHeader.getHash('hex');
		if (this.blockHash[hash]) {
			return false;
		}

		if (this.blockList[index - 1]) {
			let preHash = this.blockList[index - 1].blockHeader.getHash();
			if (!preHash.equals(blockData.blockHeader.rawPrehash)) {
				return false;
			}
		}

		if (this.blockList[index + 1]) {
			let preHash = this.blockList[index + 1].blockHeader.rawPrehash;
			if (!preHash.equals(blockData.blockHeader.getHash())) {
				return false;
			}
		}

		this.blockList[index] = blockData;
		this.blockHash[hash] = this.blockList[index];
		this.readyAmount++;
		this.run();
		return true;
	}

	async run() {
		if (this.runFlag || !this.blockList[this.runIndex]) {
			return;
		}

		this.runFlag = true;
		while (this.blockList[this.runIndex] && !this.stopFlag) {
			let hash = this.blockList[this.runIndex].blockHeader.getHash('hex');
			let r = await this.backFun(this.blockList[this.runIndex]);
			if (!r) {
				this.stop();
				return false;
			}
			delete this.blockHash[hash];
			delete this.blockList[this.runIndex];
			this.runIndex++;
		}
		this.runFlag = false;

		if (typeof this.finishFun === 'function' && this.isFinish()) {
			this.finishFun(false);
		}
	}

	stop() {
		this.blockList = [];
		this.blockHash = {};
		this.stopFlag = true;
	}

	isFail() {
		return this.stopFlag;
	}

	isFull() {
		return this.readyAmount === this.blockList.length;
	}

	isFinish() {
		return this.runIndex === this.blockList.length;
	}
}

export default BlockDataQueue;