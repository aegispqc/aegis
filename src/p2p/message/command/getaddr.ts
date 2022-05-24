import {
	interfaceNetwork, Option
} from '../../lib/interface';
import protoMessage from './proto';

/**
 * getaddr's payload
 * none
 */

/**
 * return addr
 */

export default class GetAddr extends protoMessage {
	constructor(network: interfaceNetwork) {
		super(network);

		this.command = 'getaddr';
		this.commandBuffer.write(this.command, 'ascii');
	}

	parsePayload(payload: Buffer) {
		return {}
	}

	async getPayload(payloadMessage: Option): Promise<Buffer> {
		return Buffer.alloc(0);
	}
}