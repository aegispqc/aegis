import { interfaceNetwork } from '../../lib/interface';
import pingMessage from './ping';

/**
 * ping's payload
 * Size		Description		Data type	Comments
 * 8		nonce			uint64_t	random nonce
 */

export default class Pong extends pingMessage {
	constructor(network: interfaceNetwork) {
		super(network);

		this.command = 'pong';
		this.commandBuffer.write(this.command, 'ascii');
	}
}