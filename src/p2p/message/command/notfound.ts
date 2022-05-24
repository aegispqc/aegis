
import { interfaceNetwork } from '../../lib/interface';
import invMessage from './inv';
import { Task } from '../../../task';

/**
 * notfound's payload
 * The same as INV message
 */

export default class NotFound extends invMessage {
	constructor(network: interfaceNetwork, task: Task) {
		super(network, task);

		this.command = 'notfound';
		this.commandBuffer.write(this.command, 'ascii');
	}
}