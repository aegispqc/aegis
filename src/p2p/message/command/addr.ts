import {
	interfaceNetwork, Option
} from '../../lib/interface';
import protoMessage from './proto';
import BufferWriter from '../utils/bufferWritter';
import BufferReader from '../utils/bufferReader';

/**
 * addr's payload
 * Size	 Description	Data type				Comments
 * 1+	 count			var_int 				Number of address entries (max: 1000).
 * 30x?	 addr_list		(uint32_t + net_addr)[]	Address of other nodes on the network. The uint32_t is a timestamp.
 */

export default class Addr extends protoMessage {
	constructor(network: interfaceNetwork) {
		super(network);

		this.command = 'addr';
		this.commandBuffer.write(this.command, 'ascii');
	}

	parsePayload(payload: Buffer) {
		let br = new BufferReader(payload);
		let count = br.varNum();
		let ips = [];
		if (typeof count === 'number' && count <= 1000) {
			for (let i = 0; i < count; i++) {
				ips[ips.length] = br.netAddr(true);
			}
		}
		return {
			data: ips
		};
	}

	async getPayload(payloadMessage: Option): Promise<Buffer | null> {
		if (!payloadMessage?.data || !Array.isArray(payloadMessage.data)) return null;

		let bw = new BufferWriter();
		let addrLen = payloadMessage.data.length;
		bw.varNum(addrLen);
		for (let i = 0; i < addrLen; i++) {
			let item = payloadMessage.data[i];
			if (item && typeof item === 'object') {
				let ip = item.ip;
				let port = item.port;
				if (item.status) {
					let timestamp = Math.floor(item.status.updateTime / 1000);
					let services = typeof item.status.services === 'bigint' ? item.status.services : 0n;
					bw.netAddr(services, ip, port, timestamp);
				}
			}
		}
		return bw.get();
	}
}