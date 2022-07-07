import { interfaceNetwork, Option } from '../../lib/interface';
import protoMessage from './proto';
import BufferReader from '../utils/bufferReader';

/**
 * ping's payload
 * Size	 Description  Data type  Comments
 * 8	 nonce		uint64_t   random nonce
 */

/**
 * return pong
 */

export default class Ping extends protoMessage {
	constructor(network: interfaceNetwork) {
		super(network);

		this.command = 'ping';
		this.commandBuffer.write(this.command, 'ascii');
	}

	parsePayload(payload: Buffer) {
		if (Buffer.isBuffer(payload) && payload.length === 8) {
			return { nonce: payload };
		}
		else {
			return null;
		}
	}

	async getPayload(payloadMessage: Option): Promise<Buffer | null> {
		if (!Buffer.isBuffer(payloadMessage?.nonce)) {
			return null;
		}
		else {
			return payloadMessage.nonce;
		}
	}
}