
import { interfaceNetwork, Option } from '../../lib/interface';
import protoMessage from './proto';

/**
 * blockack's payload
 * Size	 Description	Data type	Comments
 * 32	 hash			char[32]	Hash of received blocks
 */


/**
 * return next block
 */

export default class BlockAck extends protoMessage {
	constructor(network: interfaceNetwork) {
		super(network);

		this.command = 'blockack';
		this.commandBuffer.write(this.command, 'ascii');
	}

	parsePayload(payload: Buffer) {
		if (Buffer.isBuffer(payload)) {
			return { hash: payload };
		}
		else {
			return null;
		}
	}

	async getPayload(message: Option): Promise<Buffer | null> {
		if (Buffer.isBuffer(message?.data)) {
			return message.data;
		}
		else if (typeof message?.data === 'string') {
			return Buffer.from(message.data, 'hex');
		}
		else {
			return null;
		}
	}
}