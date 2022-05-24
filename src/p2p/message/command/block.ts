import {
	interfaceNetwork, Option
} from '../../lib/interface';
import protoMessage from './proto';
import * as BlockUtils from '../utils/block';

/**
 * block's payload
 */
export default class BlockMessage extends protoMessage {
	constructor(network: interfaceNetwork) {
		super(network);

		this.command = 'block';
		this.commandBuffer.write(this.command, 'ascii');
	}

	parsePayload(payload: Buffer) {
		let block = BlockUtils.bufferToBlock(payload);
		if (!block) return null;
		return {
			data: block
		};
	}

	async getPayload(payloadMessage: Option): Promise<Buffer | null> {
		if (!payloadMessage?.data
			|| typeof payloadMessage.data !== 'object') return null;

		let blockBuffer = BlockUtils.blockToBuffer(payloadMessage.data);
		if (!Buffer.isBuffer(blockBuffer)) return null;
		return blockBuffer;
	}
}