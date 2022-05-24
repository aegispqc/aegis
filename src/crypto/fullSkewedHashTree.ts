type hashFun = (i: Buffer) => Buffer;

class FullSkewedHashTree {
	private seed: Buffer;
	private level: number;
	private node: Buffer[][];
	private hashL: hashFun;
	private hashR: hashFun;
	constructor(seed: Buffer, level: number, hashL: hashFun, hashR: hashFun) {
		this.seed = seed;
		this.level = level;
		this.node = Array(level);
		this.hashL = hashL;
		this.hashR = hashR;
		this.init();
	}

	private init() {
		this.node[0] = [
			this.hashL(this.seed),
			this.hashR(this.seed),
		];

		for (let i = 1; i < this.level; i++) {
			this.node[i] = [
				this.hashL(this.node[i - 1][1]),
				this.hashR(this.node[i - 1][1]),
			];
		}
	}

	getLevel() {
		return this.level;
	}

	getLeftNode(n): false | Buffer {
		if (n >= this.level) {
			return false;
		}

		return this.node[n][0];
	}

	getLastLeftNode() {
		return this.node[this.level - 1][0];
	}

	getAllLeftNode(): Buffer[] {
		return this.node.map(x => x[0]);
	}

	getRigthNode(n): false | Buffer {
		if (n >= this.level) {
			return false;
		}

		return this.node[n][1];
	}

	getAllRigthNode(): Buffer[] {
		return this.node.map(x => x[1]);
	}

	getLeaf(n): false | Buffer {
		if (n > this.level) {
			return false;
		}

		if (n === this.level) {
			this.node[n - 1][1];
		}

		return this.node[n][0];
	}

	getAllleaves(): Buffer[] {
		let leaves = this.node.map(x => x[0]);
		leaves[this.level] = this.node[this.level - 1][1];
		return leaves;
	}

	getTail(): Buffer {
		return this.node[this.level - 1][1];
	}

	freeRightNode() {
		for (let i = 0; i < this.node.length - 1; i++) { //The last right node (tail) is not freed.
			this.node[i][1].fill(0);
			this.node[i][1] = Buffer.from('');
		}
	}

	freeSeed() {
		this.seed.fill(0);
		this.seed = Buffer.from('');
	}

	free() {
		this.freeSeed();
		this.freeRightNode();
	}

	levelExtension() {
		this.node[this.level] = [
			this.hashL(this.node[this.level - 1][1]),
			this.hashR(this.node[this.level - 1][1]),
		];
		this.level += 1;
	}
}



export { FullSkewedHashTree };


//------- Example: -------
/*

import { sha256, shake256 } from './hash';
class FullSkewedHashTreeSha2Sha3 extends FullSkewedHashTree {
	constructor(seed: Buffer, level: number) {
		super(seed, level, <hashFun>sha256, <hashFun>shake256);
	}
}

class FullSkewedHashTreeSha2Sha2Nonce extends FullSkewedHashTree {
	constructor(seed: Buffer, level: number) {
		let nonce = sha256(seed);
		let seedNew = sha256(Buffer.concat([nonce, seed]));
		let hashR: hashFun = (i) => sha256(Buffer.concat([nonce, i]));
		super(seedNew, level, <hashFun>sha256, hashR);
	}
}

class FullSkewedHashTreeSha3Sha3Nonce extends FullSkewedHashTree {
	constructor(seed: Buffer, level: number) {
		let nonce = shake256(seed);
		let seedNew = shake256(Buffer.concat([nonce, seed]));
		let hashR: hashFun = (i) => shake256(Buffer.concat([nonce, i]));
		super(seedNew, level, <hashFun>shake256, hashR);
	}
}

*/