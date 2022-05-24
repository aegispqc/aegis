
import {
	interfaceNetwork, Option
} from '../../lib/interface';
import protoMessage from './proto';

/**
 * mempool's payload
 * none
 */

/**
 * return inv
 */

export default class MemPool extends protoMessage {
	constructor(network: interfaceNetwork) {
		super(network);

		this.command = 'mempool';
		this.commandBuffer.write(this.command, 'ascii');
	}

	parsePayload(payload: Buffer) {
		return {}
	}

	async getPayload(payloadMessage: Option): Promise<Buffer | null> {
		return Buffer.alloc(0);
	}
}