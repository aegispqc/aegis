import {
	interfaceNetwork,
	interfaceNetworkVersion, Option
} from '../../lib/interface';
import { isIPv4, isIPv6 } from 'net';
import protoMessage from './proto';
import * as NetworkUtils from '../utils/network';
import BufferWriter from '../utils/bufferWritter';
import BufferReader from '../utils/bufferReader';

/**
 * version's payload
 * Size	Description		Data type	Comments
 * 4	version			uint32_t	Identifies protocol version being used by the node.
 * 8	services		uint64_t	bitfield of features to be enabled for this connection.
 * 8	timestamp		uint64_t	standard UNIX timestamp in seconds.
 * 26	addr_recv		net_addr	The network address of the node receiving this message.
 * 26	addr_from		net_addr	Field can be ignored. This used to be the network address of the node emitting this message, but most P2P implementations send 26 dummy bytes. The "services" field of the address would also be redundant with the second field of the version message.
 * 32	user_id			uint32_t	User random id.
 * ?    user_agent      var_str     AEGIS core version.
 * 4	start_height	uint32_t	The last block received by the emitting node.
 * 1	relay			bool		Whether the remote peer should announce relayed transactions or not.
 */

export default class Version extends protoMessage {
	constructor(network: interfaceNetwork) {
		super(network);

		this.command = 'version';
		this.commandBuffer.write(this.command, 'ascii');
	}

	parsePayload(payload: Buffer): interfaceNetworkVersion {
		let br = new BufferReader(payload);
		let version = br.uint32();
		let services = br.uint64();
		let timestamp = br.uint64();
		let addrRecv = br.netAddr();
		let addrFrom = br.netAddr();
		let uid = '';
		let subVersion = '0.0.0';
		if (version < 2) {
			let nonce = br.custom(8);
			uid = (br.custom(32)).toString('hex');
		}
		else {
			uid = br.custom(32).toString('hex');
			subVersion = br.varStr();
		}
		let startHeight = br.uint32();
		let relay;
		if (br.isEnd()) {
			relay = true;
		}
		else {
			relay = Boolean(br.uint8());
		}
		return {
			version, services, timestamp,
			addrRecv, addrFrom, uid,
			subVersion, startHeight, relay
		}
	}

	static FormatIp(data: Option): string {
		let ip = '';
		if (typeof data.ip === 'string') {
			if (isIPv6(data.ip) || isIPv4(data.ip)) ip = data.ip;
			else ip = '0:0:0:0:0:0:0:0';
		}
		else {
			ip = '0:0:0:0:0:0:0:0';
		}
		return ip;
	}

	async getPayload(payloadMessage: Option): Promise<Buffer | null> {
		let recvIp = '';
		let recvPort = 0;
		let fromIp = '';
		let fromPort = 0;
		let lastHeight = typeof payloadMessage.height !== 'number' ? 0 : payloadMessage.height;
		let uid = Buffer.isBuffer(payloadMessage?.uid) ? payloadMessage.uid : NetworkUtils.createUid();
		let subVersion = typeof payloadMessage.subVersion !== 'string' ? '0.0.0' : payloadMessage.subVersion;
		let services = payloadMessage.services;
		let relay = payloadMessage?.relay === false ? 0 : 1;
		if (typeof payloadMessage?.recv === 'object') {
			recvIp = Version.FormatIp(payloadMessage.recv);
			if (typeof payloadMessage.recv.port === 'number') {
				recvPort = payloadMessage.recv.port;
			}
		}
		if (typeof payloadMessage?.from === 'object') {
			fromIp = Version.FormatIp(payloadMessage.from);
			if (typeof payloadMessage.from.port === 'number') {
				fromPort = payloadMessage.from.port;
			}
		}

		let bw = new BufferWriter();
		// version 4
		bw.uint32(this.protocolVersion);
		// service 8
		bw.uint64(services);
		// timestamp 8
		let bigIntTimestamp = BigInt(Math.round(Date.now() / 1000));
		bw.uint64(bigIntTimestamp);
		// addr_recv 26
		bw.netAddr(
			services,
			recvIp,
			recvPort
		);
		// addr_form 26
		bw.netAddr(
			services,
			fromIp,
			fromPort
		);
		// nonce -> user_id  
		bw.custom(uid);
		// user_id -> sub-version
		// next version /X.X.X/ -> /AEGIS:X.X.X/
		bw.varStr(`/${subVersion}/`);  // subVersion length only 7
		// bw.varStr(`/AEGIS:${subVersion}/`);  // next version
		// last_height
		bw.uint32(lastHeight);
		// relay
		bw.uint8(relay);
		return bw.get();
	}
}