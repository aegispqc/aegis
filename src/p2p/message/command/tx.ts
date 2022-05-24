import {
	interfaceNetwork, Option
} from '../../lib/interface';
import protoMessage from './proto';

/**
 * tx's payload
 */
export default class TXMessage extends protoMessage {
	constructor(network: interfaceNetwork) {
		super(network);

		this.command = 'tx';
		this.commandBuffer.write(this.command, 'ascii');
	}

	parsePayload(payload: Buffer) {
		return {
			data: payload
		};
	}

	async getPayload(payloadMessage: Option): Promise<Buffer | null> {
		if (!payloadMessage?.data || !Buffer.isBuffer(payloadMessage.data)) return null;
		return payloadMessage.data;
	}
}