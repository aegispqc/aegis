import {
	interfaceNetwork, Option
} from '../../lib/interface';
import protoMessage from './proto';
import { Task } from '../../../task';
import BufferWriter from '../utils/bufferWritter';
import BufferReader from '../utils/bufferReader';

/**
 * getblocks's payload
 * Size	Description				Data type	Comments
 * 4	version					uint32_t	the protocol version
 * 1+	hash count				var_int		number of block locator hash entries
 * 32+	block locator hashes	char[32]	block locator object; newest back to genesis block (dense to start, but then sparse)
 * 32	hash_stop				char[32]	hash of the last desired block; set to zero to get as many blocks as possible (500)
 * 4	last height				uint32_t	the last height
 * 4    start height			uint32_t	the first block locator hash height
 */

/**
 * return inv
 */

export default class GetBlocks extends protoMessage {
	_MAX_POSSIBLE_GET: number;
	task: Task;
	constructor(network: interfaceNetwork, task: Task) {
		super(network);

		this.task = task;
		this.command = 'getblocks';
		this.commandBuffer.write(this.command, 'ascii');
		this._MAX_POSSIBLE_GET = 500;
	}

	async #verifyBlocksSimplified(blocks: Buffer[]) {
		if (blocks.length === 0) return 0;
		let getBlockHeight = true;
		let verifiedHeight = 0;
		for (let i = 0; i < blocks.length; i++) {
			let isExist = await this.task.blockHashDoesExist(blocks[i]);
			if (!isExist) {
				getBlockHeight = true;
				verifiedHeight = 0;
			}
			else if (getBlockHeight) {
				let block = await this.task.getBlockDataByHash(blocks[i]);
				if (block) {
					verifiedHeight = block.height;
					getBlockHeight = false;
				}
			}
		}
		return verifiedHeight;
	}

	async #verifyBlocks(startHeight: number, blocks: Buffer[]) {
		if (startHeight <= 0 || blocks.length === 0) return 0;
		let lastBlock = await this.task.getLastBlock();
		if (!lastBlock) return 0;
		let lastHeight = lastBlock.height;
		let verifiedHeight = 0;
		let step = 1;
		let i = 0;
		if (startHeight > lastHeight) {
			i = startHeight - lastHeight;
			if (i > 9) {
				return 0;
			}
		}
		for (; i < blocks.length && startHeight > 0; i++) {
			let hash = await this.task.getBlockHashByHeight(startHeight);
			if (!hash || !hash.equals(blocks[i])) {
				verifiedHeight = 0;
			}
			else if (startHeight > verifiedHeight) {
				verifiedHeight = startHeight;
			}
			if (i >= 9) {
				step *= 2;
			}
			startHeight -= step;
		}
		return verifiedHeight;
	}

	async parsePayload(payload: Buffer) {
		let br = new BufferReader(payload);
		let version = br.uint32();
		let count = br.varNum();
		let blocks = [];
		if (typeof count !== 'number') return null;
		else if (count > this._MAX_POSSIBLE_GET) return null;
		for (let i = 0; i < count; i++) {
			let item = br.hash();
			if (item) {
				blocks.push(item);
			}
			else {
				return null;
			}
		}
		let stopBlock = br.hash();
		if (stopBlock) {
			blocks.push(stopBlock);
		}
		else {
			return null;
		}
		let senderLastHeight = -1;
		let verifiedHeight = 0;
		if (br.isEnd() || br.remainLen === 32) {
			verifiedHeight = await this.#verifyBlocksSimplified(blocks);
		}
		else {
			senderLastHeight = br.uint32();
			let startHeight = br.uint32();
			if (senderLastHeight === null || startHeight === null) {
				verifiedHeight = await this.#verifyBlocksSimplified(blocks);
			}
			else {
				verifiedHeight = await this.#verifyBlocks(startHeight, blocks);
			}
		}
		return {
			data: {
				version,
				verifiedHeight,
				height: senderLastHeight
			}
		};
	}

	async getPayload(message: Option): Promise<Buffer | null> {
		if (!message || !Array.isArray(message?.data) || message.data.length === 0
			|| typeof message.height !== 'number' || typeof message.startHeight !== 'number') return null;

		let bw = new BufferWriter();
		bw.uint32(this.protocolVersion);
		let blocks = message.data;
		let blocksLen = blocks.length;
		bw.varNum(blocksLen - 1);
		for (let i = 0; i < blocksLen - 1; i++) {
			bw.hash(blocks[i]);
		}
		// hash_stop
		bw.hash(blocks[blocksLen - 1]);
		bw.uint32(message.height);
		bw.uint32(message.startHeight);

		return bw.get();
	}
}