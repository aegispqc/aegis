import {
	interfaceNetwork, interfaceInv, Option
} from '../../lib/interface';
import protoMessage from './proto';
import { Task } from '../../../task';
import BufferWriter from '../utils/bufferWritter';
import BufferReader from '../utils/bufferReader';
import { BlockTx } from '../../../blockchain/blockTx';

var typeOfInv: { [index: string]: any } = {
	0: 'ERROR',
	1: 'Tx',
	2: 'Block',
}

/**
 * inventory's type
 * 
 * Value	Name		 Description
 * 0		ERROR		 Any data of with this number may be ignored.
 * 1		MSG_TX		 Hash is related to a transaction.
 * 2		MSG_BLOCK	 Hash is related to a data block.
 */

/**
 * inventory's format
 * 
 * Size	 Description	Data type	 Comments
 * 4	 type			uint32_t	 Identifies the object type linked to this inventory.
 * 32	 hash			char[32]	 Hash of the object.
 */

/**
 * inv's payload
 * 
 * Size	 Description	Data type	 Comments
 * 1+	 count			var_int		 Number of inventory entries
 * 36x?	 inventory		inv_vect[]	 Inventory vectors
 */

export default class Inv extends protoMessage {
	task: Task;
	constructor(network: interfaceNetwork, task: Task) {
		super(network);

		this.task = task;
		this.command = 'inv';
		this.commandBuffer.write(this.command, 'ascii');
	}

	async #getBlockData(blocks) {
		let blockArr = [];
		let notfound = [];
		let knownLastHeight = 0;
		let knownLastHash = Buffer.alloc(0);
		if (Array.isArray(blocks) && blocks.length > 0) {
			for (let i = 0; i < blocks.length; i++) {
				let blockItem = await this.task.getBlockDataByHash(blocks[i]);
				if (!blockItem) {
					notfound[notfound.length] = blocks[i];
				}
				else {
					blockArr[blockArr.length] = blockItem;
					if (blockItem.height > knownLastHeight) {
						knownLastHeight = blockItem.height;
						knownLastHash = blockItem.hash;
					}
				}
			}
		}
		return {
			notfound,
			blocks: blockArr,
			knownLastHeight,
			knownLastHash
		}
	}

	async #getTxData(txs) {
		let txsArr = [];
		let notfound = [];
		if (Array.isArray(txs) && txs.length > 0) {
			for (let i = 0; i < txs.length; i++) {
				let txItem = await this.task.getTransactionByTxid(txs[i]);
				if (!txItem || !txItem.blockTx) {
					let txCache = await this.task.getTxPool(txs[i]);
					if (!txCache || !txCache.blockTx) {
						notfound[notfound.length] = txs[i];
					}
					else {
						let txClass = BlockTx.jsonDataToClass(txCache.blockTx);
						if (txClass) {
							txsArr[txsArr.length] = txClass.getSerialize();
						}
						else {
							notfound[notfound.length] = txs[i];
						}
					}
				}
				else {
					txsArr[txsArr.length] = txItem.blockTx.getSerialize();
				}
			}
		}
		return {
			notfound,
			txs: txsArr
		}
	}

	async parsePayload(payload: Buffer) {
		let br = new BufferReader(payload);
		let count = br.varNum();
		let inv: { [index: string]: any } = {};
		if (typeof count === 'number' && count <= 50000) {
			for (var i = 0; i < count; i++) {
				let type = br.uint16();
				let hash = br.hash();
				if (type && typeOfInv[type]) {
					if (!inv[type]) inv[type] = [];
					inv[type].push(hash);
				}
			}
		}
		let block: any[] = [], tx: any[] = [];
		let notfound = {};
		// Tx
		if (Array.isArray(inv['1'])) {
			let txData = await this.#getTxData(inv['1']);
			tx = txData.txs;
			if (Array.isArray(txData.notfound) && txData.notfound.length > 0) {
				notfound['1'] = txData.notfound;
			}
		}
		// Block
		let knownLastHeight = 0;
		let knownLastHash = Buffer.alloc(0);
		if (Array.isArray(inv['2'])) {
			let blockData = await this.#getBlockData(inv['2']);
			block = blockData.blocks;
			if (Array.isArray(blockData.notfound) && blockData.notfound.length > 0) {
				notfound['2'] = blockData.notfound;
			}

			if (typeof blockData.knownLastHeight === 'number'
				&& Buffer.isBuffer(blockData.knownLastHash)) {
				knownLastHeight = blockData.knownLastHeight;
				knownLastHash = blockData.knownLastHash;
			}
		}
		return {
			data: {
				block,
				tx,
				notfound,
				knownLastHeight,
				knownLastHash
			}
		};
	}

	static FormatInvData(invData: Option): interfaceInv[] {
		let inv = [];
		for (let i in typeOfInv) {
			if (Array.isArray(invData[i])) {
				let invItemArray = invData[i];
				let type = parseInt(i);
				for (let j = 0; j < invItemArray.length; j++) {
					inv.push({
						type,
						hash: invItemArray[j]
					});
				}
			}
		}
		return inv;
	}

	async getPayload(payloadMessage: Option): Promise<Buffer | null> {
		if (!payloadMessage || typeof payloadMessage !== 'object') return Buffer.alloc(0);
		let bw = new BufferWriter();
		let invData = Inv.FormatInvData(payloadMessage);
		if (invData.length === 0) return null;
		bw.varNum(invData.length);
		for (let i = 0; i < invData.length; i++) {
			bw.uint16(invData[i].type);
			bw.hash(invData[i].hash);
		}
		return bw.get();
	}
}