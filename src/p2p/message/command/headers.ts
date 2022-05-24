
import { 
	interfaceNetwork, Option
} from '../../lib/interface';
import protoMessage from './proto';
import BufferWriter from '../utils/bufferWritter';
import BufferReader from '../utils/bufferReader';

/**
 * Size	 Description	Data type		Comments
 * 4	 version		int32_t	Block 	version information (note, this is signed).
 * 32	 prev_block		char[32]		The hash value of the previous block this particular block references.
 * 32	 merkle_root	char[32]		The reference to a Merkle tree collection which is a hash of all transactions related to this block.
 * 4	 timestamp		uint32_t		A timestamp recording when this block was created.
 * 4	 bits			uint32_t		The calculated difficulty target being used for this block.
 * 4	 nonce			uint32_t		The nonce used to generate this block… to allow variations of the header and compute different hashes.
 * 1+	 txn_count		var_int			Number of transaction entries.
 * 32*n  txn's hash	 	tx_hash[]   	
 */

/**
 * headers's payload
 * 
 * Size	 Description	Data type		 Comments
 * 1+	 count			var_int			 Number of block headers.
 * 81x?	 headers		block_header[]	 Block headers.
 */

export default class Headers extends protoMessage {
	constructor(network: interfaceNetwork) {
		super(network);

		this.command = 'headers';
		this.commandBuffer.write(this.command, 'ascii');
	}

	parsePayload(payload: Buffer) {
		let br = new BufferReader(payload);
		let count = br.varNum();
		let headers = [];
		if (typeof count !== 'number') return null;
		for (var i = 0; i < count; i++) {
			let txs = br.varNum();
			let headerBufferLength = br.varNum();
			headers[i] = {
				txs,
				header: br.custom(headerBufferLength)
			};
		}
		return {
			data: headers
		};
	}

	async getPayload(payloadMessage: Option): Promise<Buffer | null> {
		if (!payloadMessage?.data || !Array.isArray(payloadMessage.data)) null;
		let bw = new BufferWriter();
		let blocks = payloadMessage.data;
		let blocksLen = blocks.length;
		bw.varNum(blocksLen);
		for (let i = 0; i < blocksLen; i++) {
			let block = blocks[i];
			bw.varNum(block.txs.length);
			bw.varNum(block.header.length);
			bw.custom(block.header);
		}
		return bw.get();
	}
}