import { interfaceNetwork, Option } from '../../lib/interface';
import protoMessage from './proto';
import { createNonce } from '../utils/network';
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
		let br = new BufferReader(payload);
		if (br.length >= 8) {
			return { nonce: br.custom(8) };
		}
		else {
			return { nonce: br.getRemain() };
		}
	}

	async getPayload(payloadMessage: Option): Promise<Buffer | null> {
		if (!Buffer.isBuffer(payloadMessage.nonce)) {
			return createNonce(8);
		}
		else {
			return payloadMessage.nonce;
		}
	}
}