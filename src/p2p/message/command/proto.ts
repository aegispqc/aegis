
import {
	interfaceNetwork, Option, p2pMessageObject
} from '../../lib/interface';
import { sha2d } from '../../../crypto/hash';
import { intToBuffer } from '../utils/network';
import Param from '../../p2pParam';
import BufferWriter from '../utils/bufferWritter';

/**
 * Message structure
 * Size  Description	Data type	Comments
 * 4	 magic		  	uint32_t	Magic value indicating message origin network, and used to seek to next message when stream state is unknown
 * 12	 command		char[12]	ASCII string identifying the packet content, NULL padded (non-NULL padding results in packet rejected)
 * 4	 length		 	uint32_t	Length of payload in number of bytes
 * 4	 checksum	   	uint32_t	First 4 bytes of sha256(sha256(payload))
 * ?	 payload		uchar[]	 	The actual data
 */

const getCommandList: { [key: string]: boolean } = {
	version: true,
	verack: true,
	addr: true,
	inv: true,
	getdata: true,
	notfound: true,
	getblocks: true,
	getheaders: true,
	tx: true,
	block: true,
	blockack: true,
	headers: true,
	getaddr: true,
	mempool: true,
	ping: true,
	pong: true,
	reject: true
};
const ProtocolByte: { [key: string]: number } = {
	magic: 4,
	command: 12,
	length: 4,
	checksum: 4
}
var networkMagic: Buffer = Buffer.alloc(4);
export default class MessageProto {
	network: interfaceNetwork;
	command: string;
	commandBuffer: Buffer;
	protocolVersion: number;
	services: bigint;
	constructor(network: interfaceNetwork) {
		this.network = network;
		networkMagic.writeUInt32LE(network.networkMagic);

		this.command = '';
		this.commandBuffer = Buffer.alloc(MessageProto.ProtocolOfByte('command'));
		this.protocolVersion = Param.common.Version;
	}

	static ProtocolOfByte = function (type: string): any {
		return ProtocolByte[type];
	}

	static CheckCommand = function (type: string): any {
		return getCommandList[type];
	}

	/**
	 * parse message's payload
	 * @param payload { Buffer }
	 * @returns empty object
	 */
	parsePayload(payload: Buffer) {
		return {};
	}

	async getPayload(payloadMessage: Option): Promise<Buffer | null> {
		return Buffer.alloc(0);
	}

	static parseBuffer(bufferMessage: Buffer): p2pMessageObject | { err: number, length?: number } {
		if (bufferMessage.length < 24) return { err: -1 };

		let magic = bufferMessage.slice(0, 4);
		if (!magic.equals(networkMagic)) return { err: -2 };
		let command = bufferMessage.slice(4, 16).toString('ascii').replace(/\x00/g, '');
		let length = bufferMessage.slice(16, 20).readUInt32LE();
		if (bufferMessage.length < length + 24) return { err: -3, length: length + 24 };
		let checksum = bufferMessage.slice(20, 24);
		let payloadBuffer = bufferMessage.slice(24, 24 + length);
		let remainBuffer = bufferMessage.slice(24 + length);

		let errCode: number | undefined;
		if (!MessageProto.CheckCommand(command)) {
			errCode = -11;
		}

		let rechecksum = sha2d(payloadBuffer).slice(0, MessageProto.ProtocolOfByte('checksum'));
		if (!rechecksum.equals(checksum)) {
			errCode = -12;
		}

		return {
			data: {
				err: errCode,
				magic,
				command,
				length,
				checksum,
				payloadBuffer
			},
			remain: remainBuffer
		};
	}

	async getBuffer(payloadMessage: Option): Promise<Buffer | null> {
		let bw = new BufferWriter();
		// magic
		bw.custom(networkMagic);
		// command
		bw.custom(this.commandBuffer);

		let payload = await this.getPayload(payloadMessage);

		if (Buffer.isBuffer(payload)) {
			// length
			bw.custom(intToBuffer(payload.length, MessageProto.ProtocolOfByte('length')));
			// checksum
			bw.custom(Buffer.from(sha2d(payload)).slice(0, MessageProto.ProtocolOfByte('checksum')));

			bw.custom(payload);
		}
		else {
			return null;
		}

		return bw.get();
	}
}