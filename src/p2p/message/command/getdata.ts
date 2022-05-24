import { interfaceNetwork } from '../../lib/interface';
import { Task } from '../../../task';
import invMessage from './inv';

/**
 * payload
 * The same as INV message
 */

/**
 * return tx
 */

export default class GetData extends invMessage {
	constructor(network: interfaceNetwork, task: Task) {
		super(network, task);

		this.command = 'getdata';
		this.commandBuffer.write(this.command, 'ascii');
	}
}