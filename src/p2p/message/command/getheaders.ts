
import { interfaceNetwork } from '../../lib/interface';
import getblocksMessage from './getblocks';
import { Task } from '../../../task';

/**
 * payload
 * The same as GETBLOCKS message
 */

/**
 * return headers
 */

export default class GetHeaders extends getblocksMessage {
	constructor(network: interfaceNetwork, task: Task) {
		super(network, task);

		this.command = 'getheaders';
		this.commandBuffer.write(this.command, 'ascii');
		this._MAX_POSSIBLE_GET = 2000;
	}
}