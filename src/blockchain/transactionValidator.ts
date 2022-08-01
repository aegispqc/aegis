import { BlockchainDb } from '../db/lmdb/blockchainDb';
import { BlockTx } from './blockTx';
import ScriptContainer from './script';
import { getRewardByHeight } from './reward';
import { Version } from './versionRule';
import { ForkTxDb } from './blockFrokVerify';

class TxValidator {
	private blockTx: BlockTx;
	private blockDb: BlockchainDb;
	private version: Version;
	public errorCode?: number;

	constructor(blockTx: BlockTx, blockDb: BlockchainDb, version: Version) {
		this.blockTx = blockTx;
		this.blockDb = blockDb;
		this.version = version;
		this.errorCode = null;
	}

	verify(feeRatio: bigint = 1n, blockHeight: number, isCoinBase: boolean, totalFee?: bigint): { fee: bigint } | false {
		let inCoin: bigint = 0n;
		let outCoin: bigint = 0n;
		let fee: bigint = 0n;
		let lastVout = [];

		if (!this.blockTx.isValid(isCoinBase, this.version)) {
			this.errorCode = -1;
			return false;
		}

		if (isCoinBase) {
			inCoin = getRewardByHeight(blockHeight);
			if (totalFee) {
				inCoin += totalFee;
			}
		}

		if (feeRatio < 1n) {
			this.errorCode = -17;
			return false;
		}

		let photon = this.blockTx.getPhoton();
		if (!photon) {
			this.errorCode = -1;
			return false;
		}

		let feeMin = (isCoinBase) ? 0n : BigInt(photon) * feeRatio;

		for (let i = 0; i < this.blockTx.vout.length; i++) {
			let value = this.blockTx.vout[i].value;
			outCoin += value;
		}

		if (!this.blockDb.checkTxIsNotDuplicated(this.blockTx)) {
			this.errorCode = -2;
			return false;
		}

		for (let i = 0; i < this.blockTx.vin.length; i++) {
			let lastVoutHashes = this.blockTx.vin[i].getLastVoutHashAll();
			if (!lastVoutHashes) {
				this.errorCode = -1;
				return false;
			}

			lastVout[i] = [];
			for (let j = 0; j < lastVoutHashes.length; j++) {
				let lastVoutTx = this.blockDb.getTransactionByTxid(lastVoutHashes[j].hash);

				if (!lastVoutTx) {
					this.errorCode = -8;
					return false;
				}

				// voutn not found
				if (!lastVoutTx.blockTx.vout[lastVoutHashes[j].voutn]) {
					this.errorCode = -8;
					return false;
				}

				// voutspent
				if (lastVoutTx.voutspent[lastVoutHashes[j].voutn] !== false) {
					this.errorCode = -12;
					return false;
				}

				lastVout[i][j] = { tx: lastVoutTx.blockTx, voutn: lastVoutHashes[j].voutn }
				let value = lastVoutTx.blockTx.vout[lastVoutHashes[j].voutn].value;
				inCoin += value;
			}
		}

		fee = inCoin - outCoin;

		if (fee < feeMin) {
			this.errorCode = -18;
			return false;
		}

		if (isCoinBase) {
			if(!this.blockTx.vin[0].isCoinBase(blockHeight)) {
				this.errorCode = -1;
				return false;
			}

			return { fee };
		}

		for (let i = 0; i < this.blockTx.vin.length; i++) {
			let scriptContainer = new ScriptContainer(this.blockDb, this.blockTx, i, lastVout[i], blockHeight);
			let scriptValidator = scriptContainer.run();
			if (!scriptValidator) {
				if (scriptContainer.errorCode) {
					this.errorCode = scriptContainer.errorCode;
				}
				else {
					this.errorCode = -19;
				}
				return false;
			}
		}

		return { fee };
	}

	verifyFork(forkCache: ForkTxDb, forkStartHeight: number, feeRatio: bigint = 1n, blockHeight: number, isCoinBase: boolean, totalFee?: bigint): { fee: bigint } | false {
		let inCoin: bigint = 0n;
		let outCoin: bigint = 0n;
		let fee: bigint = 0n;
		let lastVout = [];

		if (!this.blockTx.isValid(isCoinBase, this.version)) {
			this.errorCode = -1;
			return false;
		}

		if (isCoinBase) {
			inCoin = getRewardByHeight(blockHeight);
			if (totalFee) {
				inCoin += totalFee;
			}
		}

		if (feeRatio < 1n) {
			this.errorCode = -17;
			return false;
		}

		let photon = this.blockTx.getPhoton();
		if (!photon) {
			this.errorCode = -1;
			return false;
		}

		let feeMin = (isCoinBase) ? 0n : BigInt(photon) * feeRatio;

		for (let i = 0; i < this.blockTx.vout.length; i++) {
			let value = this.blockTx.vout[i].value;
			outCoin += value;
		}

		if (!this.blockDb.checkTxIsNotDuplicatedFork(this.blockTx, forkStartHeight)) {
			this.errorCode = -2;
			return false;
		}


		for (let i = 0; i < this.blockTx.vin.length; i++) {
			let lastVoutHashes = this.blockTx.vin[i].getLastVoutHashAll();
			if (!lastVoutHashes) {
				this.errorCode = -1;
				return false;
			}

			lastVout[i] = [];
			for (let j = 0; j < lastVoutHashes.length; j++) {
				let lastVoutTx: any = this.blockDb.getTransactionByTxid(lastVoutHashes[j].hash);
				let forkCacheTx = false;
				if(lastVoutTx) {
					if(lastVoutTx.blockHeight >= forkStartHeight) { //over forkStartHeight
						lastVoutTx = undefined;
					}
				}
				if(!lastVoutTx) {
					lastVoutTx = forkCache.getTransactionByTxid(lastVoutHashes[j].hash);
					if (!lastVoutTx) {
						this.errorCode = -8;
						return false;
					}
					forkCacheTx = true;
				}

				// voutn not found
				if (!lastVoutTx.blockTx.vout[lastVoutHashes[j].voutn]) {
					this.errorCode = -8;
					return false;
				}

				// voutspent
				if (lastVoutTx.voutspent[lastVoutHashes[j].voutn] !== false) { 
					// voutspent is earlier than the fork height
					if(!forkCacheTx) {
						if(lastVoutTx.voutspent[lastVoutHashes[j].voutn] < forkStartHeight) {
							this.errorCode = -12;
							return false;
						}
					}
					else {
						this.errorCode = -12;
						return false;
					}
				}

				lastVout[i][j] = { tx: lastVoutTx.blockTx, voutn: lastVoutHashes[j].voutn }
				let value = lastVoutTx.blockTx.vout[lastVoutHashes[j].voutn].value;
				inCoin += value;
			}
		}

		fee = inCoin - outCoin;

		if (fee < feeMin) {
			this.errorCode = -18;
			return false;
		}

		for (let i = 0; i < this.blockTx.vin.length; i++) {
			if (isCoinBase) {
				continue;
			}
			let scriptContainer = new ScriptContainer(this.blockDb, this.blockTx, i, lastVout[i], blockHeight, forkCache.pqcert);
			let scriptValidator = scriptContainer.run();
			if (!scriptValidator) {
				if (scriptContainer.errorCode) {
					this.errorCode = scriptContainer.errorCode;
				}
				else {
					this.errorCode = -19;
				}
				return false;
			}
		}

		return { fee };
	}
}

export { TxValidator };