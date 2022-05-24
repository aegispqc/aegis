import {
	interfaceNetwork, Option
} from '../../lib/interface';
import protoMessage from './proto';

export default class Sendheaders extends protoMessage {
	constructor(network: interfaceNetwork) {
		super(network);

		this.command = 'sendheaders';
		this.commandBuffer.write(this.command, 'ascii');
	}

	parsePayload(payload: Buffer) {
		return {}
	}

	async getPayload(payloadMessage: Option): Promise<Buffer | null> {
		return Buffer.alloc(0);
	}
}