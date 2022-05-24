
import {
	Long, serialize, deserialize, Binary
} from 'bson';
import { interfaceBlock } from '../../lib/interface';

export async function getblocksData(task, topHeight: number): Promise<Buffer[]> {
	let data: Buffer[] = [];
	let step = 1, DiscreteIndex = topHeight - 9;
	for (let i = topHeight; i > 0; i -= step) {
		let block = await task.getBlockHashByHeight(i);
		if (!block) break;
		if (DiscreteIndex >= i) step *= 2;
		data[data.length] = block;
	}
	let height_0 = await task.getBlockHashByHeight(0);
	if (height_0) {
		data[data.length] = height_0;
	}
	return data;
}

export function blockToBuffer(block: interfaceBlock): Buffer | null {
	if (!Buffer.isBuffer(block.hash) || !Buffer.isBuffer(block.header)
		|| typeof block.height !== 'number' || !Array.isArray(block.txs)) return null;
	let newblock = {
		hash: new Binary(block.hash),
		height: block.height,
		header: new Binary(block.header),
		txs: []
	}
	for (let i = 0; i < block.txs.length; i++) {
		newblock.txs.push((new Binary(block.txs[i])));
	}
	return serialize(newblock);
}

export function bufferToBlock(blockBuf: Buffer): Object | null {
	if (!Buffer.isBuffer(blockBuf)) return null;
	let parseBlock = deserialize(blockBuf, { promoteBuffers: true });
	return parseBlock;
}