import {
	interfaceNetwork, Option
} from '../../lib/interface';
import protoMessage from './proto';
import BufferWriter from '../utils/bufferWritter';
import BufferReader from '../utils/bufferReader';
import rejectTemplate from '../rejectTemplate';

/**
 * reject's payload
 * Size	Description	Data type	Comments
 * 1+	message		var_str		type of message rejected.
 * 1	ccode		char		code	relating to rejected message.
 * 1+	reason		var_str		text version of reason for rejection.
 * 0+	data		char		Optional extra data provided by some errors. Currently, all errors which provide this field fill it with the TXID or block header hash of the object being rejected, so the field is 32 bytes.
 */

export default class Reject extends protoMessage {
	constructor(network: interfaceNetwork) {
		super(network);

		this.command = 'reject';
		this.commandBuffer.write(this.command, 'ascii');
	}

	parsePayload(payload: Buffer) {
		let br = new BufferReader(payload);
		let message = br.varStr();
		let ccode = br.uint8();
		let reason = br.varStr();
		let data;
		if (!br.isEnd()) {
			data = br.getRemain();
		}
		return {
			data: {
				message, ccode, reason, data
			}
		};
	}

	async getPayload(payloadMessage: Option): Promise<Buffer | null> {
		if (!payloadMessage || typeof payloadMessage !== 'object') return null;
		let templateType = payloadMessage.template;
		let rejectData = rejectTemplate[templateType];
		if (!rejectData || typeof rejectData !== 'object') {
			rejectData = {};
		}
		if (typeof payloadMessage.customData === 'object') {
			for (let i in payloadMessage.customData) {
				rejectData[i] = payloadMessage.customData;
			}
		}
		if (typeof rejectData.ccode !== 'number') {
			rejectData.ccode = 0x00;
		}
		let bw = new BufferWriter();
		if (!rejectData.message) rejectData.message = '';
		bw.varStr(rejectData.message);
		bw.uint8(rejectData.ccode);
		if (!rejectData.reason) rejectData.reason = '';
		bw.varStr(rejectData.reason);
		if (Buffer.isBuffer(rejectData.data)) bw.custom(rejectData.data);
		return bw.get();
	}
}