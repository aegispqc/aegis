import { shake256 } from './hash';

class MerkleTree {
	level: number;
	tree: Buffer[][];

	constructor(leaves: Buffer[]) {
		this.init(leaves);
	}

	private init(leaves: Buffer[]) {
		this.level = Math.ceil(Math.log2(leaves.length)) + 1;
		this.tree = [leaves];

		for (let h = 0; h < this.level - 1; h++) {
			this.tree[h + 1] = [];
			for (let w = 0; w < this.tree[h].length; w += 2) {
				let temp = Buffer.concat([this.tree[h][w], (this.tree[h][w + 1] || this.tree[h][w])]);
				this.tree[h + 1].push(shake256(temp));
			}
		}
	}

	get root() {
		return this.tree[this.tree.length - 1][0];
	}

	pruning(leavesFlag: boolean[]): false | (Buffer | null)[][] {
		if(this.level === 1) {
			return [[this.tree[0][0]]];
		}
		if (this.tree[0].length !== leavesFlag.length) {
			return false;
		}
		let pruningTree = [[]];
		let pruningStatus = [[]];
		for (let i = 0; i < this.tree[0].length; i += 2) {
			if (leavesFlag[i] || leavesFlag[i + 1]) {
				pruningTree[0][i] = this.tree[0][i];
				pruningStatus[0][i] = true;
				if (this.tree[0][i + 1] !== undefined) {
					pruningTree[0][i + 1] = this.tree[0][i + 1];
					pruningStatus[0][i + 1] = true;
				}
			}
			else {
				pruningTree[0][i] = null;
				pruningStatus[0][i] = false;
				if (this.tree[0][i + 1] !== undefined) {
					pruningTree[0][i + 1] = null;
					pruningStatus[0][i] = false;
				}
			}
		}
		for (let h = 0; h < this.level - 2; h++) {
			pruningTree[h + 1] = [];
			pruningStatus[h + 1] = [];
			for (let i = 0, j = 0; i < pruningTree[h].length; i += 4, j += 2) {
				pruningStatus[h + 1][j] = (pruningStatus[h][i] && pruningStatus[h][i + 1]) || (pruningStatus[h][i] && pruningStatus[h][i + 1] === undefined);
				pruningStatus[h + 1][j + 1] = pruningStatus[h][i + 2] && pruningStatus[h][i + 3] || (pruningStatus[h][i + 2] && pruningStatus[h][i + 3] === undefined);
				if ((!pruningStatus[h + 1][j]) && pruningStatus[h + 1][j + 1]) {
					if (this.tree[h + 1][j] !== undefined) {
						pruningTree[h + 1][j] = this.tree[h + 1][j];
					}
					pruningStatus[h + 1][j] = true;
				}
				else {
					if (this.tree[h + 1][j] !== undefined) {
						pruningTree[h + 1][j] = null;
					}
				}
				if (pruningStatus[h + 1][j] && (!pruningStatus[h + 1][j + 1])) {
					if (this.tree[h + 1][j + 1] !== undefined) {
						pruningTree[h + 1][j + 1] = this.tree[h + 1][j + 1];
					}
					pruningStatus[h + 1][j + 1] = true;
				}
				else {
					if (this.tree[h + 1][j + 1] !== undefined) {
						pruningTree[h + 1][j + 1] = null;
					}
				}
			}
		}
		return pruningTree;
	}

	static getRoot(tree: (Buffer | null)[][], h: number = 0, i: number = 0): false | Buffer {
		if(tree.length === 1 && tree[0].length === 1) {
			return tree[0][0];
		}
		if (h >= tree.length) {
			return false;
		}
		let hr = tree.length - h;
		let l: Buffer | null | false = tree[hr - 1][i];
		if (l === null) {
			l = MerkleTree.getRoot(tree, h + 1, i << 1);
			if (l === false) {
				return false;
			}
		}
		let r: Buffer | null | false | undefined = tree[hr - 1][i + 1];
		if (r === null) {
			r = MerkleTree.getRoot(tree, h + 1, (i + 1) << 1);
			if (r === false) {
				return false;
			}
		}
		else if (r === undefined) {
			r = l;
		}
		let temp = Buffer.concat([l, r]);
		return shake256(temp);
	}
}

export { MerkleTree };