import {
	interfaceNetwork, Option
} from '../../lib/interface';
import protoMessage from './proto';
import { Task } from '../../../task';
import BufferWriter from '../utils/bufferWritter';
import BufferReader from '../utils/bufferReader';

/**
 * getblocks's payload
 * Size	Description			  Data type	  Comments
 * 4	version				  uint32_t	  the protocol version
 * 1+	hash count			  var_int	  number of block locator hash entries
 * 32+	block locator hashes  char[32]	  block locator object; newest back to genesis block (dense to start, but then sparse)
 * 32	hash_stop			  char[32]	  hash of the last desired block; set to zero to get as many blocks as possible (500)
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

	async #verifyBlocks(blocks: Buffer[]) {
		if (blocks.length === 0) return 0;

		let highestVerifiedHeight = 0;
		for (let i = 0; i < blocks.length; i++) {
			let block = await this.task.getBlockDataByHash(blocks[i]);
			if (!block) {
				highestVerifiedHeight = 0;
			}
			else if (highestVerifiedHeight === 0) {
				highestVerifiedHeight = block.height;
			}
		}

		return highestVerifiedHeight;
	}

	async parsePayload(payload: Buffer) {
		let br = new BufferReader(payload);
		let version = br.uint32();
		let count = br.varNum();
		let blocks = [];
		if (typeof count !== 'number') return null;

		count = Math.min(count, this._MAX_POSSIBLE_GET);
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

		let verifiedHeight = await this.#verifyBlocks(blocks);

		return {
			data: {
				version,
				verifiedHeight
			}
		};
	}

	async getblocksData(topHeight): Promise<Buffer[]> {
		let data: Buffer[] = [];
		let step = 1, DiscreteIndex = topHeight - 9;
		for (let i = topHeight; i > 0; i -= step) {
			let block = await this.task.getBlockDataByHeight(i);
			if (!block) break;
			if (DiscreteIndex >= i) step *= 2;
			data[data.length] = block.hash;
		}

		let height_0 = await this.task.getBlockDataByHeight(0);
		if (height_0) {
			data[data.length] = height_0.hash;
		}

		return data;
	}

	async getPayload(message: Option): Promise<Buffer | null> {
		if (!message || !Array.isArray(message.data) || message.data.length === 0) return null;

		let bw = new BufferWriter();
		bw.uint32(this.protocolVersion);
		let blocks = message.data;
		let blocksLen = blocks.length;
		bw.varNum(blocksLen - 1);
		for (let i = 0; i < blocksLen; i++) {
			bw.hash(blocks[i]);
		}
		// hash_stop
		bw.hash(blocks[blocksLen - 1]);

		return bw.get();
	}
}