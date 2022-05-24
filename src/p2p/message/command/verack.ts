import {
	interfaceNetwork, Option
} from '../../lib/interface';
import protoMessage from './proto';

/**
 * verack's payload
 * none
 */
export default class VerAck extends protoMessage {
	constructor(network: interfaceNetwork) {
		super(network);

		this.command = 'verack';
		this.commandBuffer.write(this.command, 'ascii');
	}

	parsePayload(payload: Buffer) {
		return {};
	}

	async getPayload(payloadMessage: Option): Promise<Buffer | null> {
		return Buffer.alloc(0);
	}
}