
import { p2pMessageObject } from '../../lib/interface';

export class BufferQueue {
	#magicBuffer: Buffer;
	#queue: Buffer[];
	#isRun: boolean;
	#checkCb: Function;
	#cb: Function;
	#waitBuffer?: Buffer;
	#waitBufferIndex: number;
	constructor(magicBuffer: number, checkCallback, processCallback) {
		this.#magicBuffer = Buffer.alloc(4);
		this.#magicBuffer.writeUInt32LE(magicBuffer);
		this.#queue = [];
		this.#isRun = false;
		this.#checkCb = checkCallback;
		this.#cb = processCallback;
		this.#waitBuffer;
		this.#waitBufferIndex = 0;
	}

	add(data: Buffer) {
		if (Buffer.isBuffer(data) && data.length > 0) {
			this.#queue.push(data);
		}
	}

	start() {
		if (this.#isRun) return;
		this.#isRun = true;
		this.#process();
	}

	stop() {
		this.#isRun = false;
	}

	isEmpty() {
		return this.#queue.length === 0 ? true : false;
	}

	async #mergeData(buffer: Buffer): Promise<boolean> {
		if (!Buffer.isBuffer(this.#waitBuffer) || !Buffer.isBuffer(buffer)) return false;
		if (this.#waitBufferIndex + buffer.length >= this.#waitBuffer.length) {
			let end = this.#waitBuffer.length - this.#waitBufferIndex;
			buffer.copy(this.#waitBuffer, this.#waitBufferIndex, 0, end);
			if(buffer.length > end){
				this.#addRemain(buffer.subarray(end))
			}
			let r = await this.#pushMessage(this.#waitBuffer);
			if(r){
				this.#waitBuffer = undefined;
				this.#waitBufferIndex = 0;
			}
		}
		else {
			buffer.copy(this.#waitBuffer, this.#waitBufferIndex);
			this.#waitBufferIndex += buffer.length;
		}
		return true;
	}

	#addRemain(remain: Buffer) {
		if (!Buffer.isBuffer(remain) || remain.length < 1) return;
		if (this.isEmpty()) {
			this.add(remain);
		}
		else {
			let checkBuffer = Buffer.concat([remain, this.#queue.shift()]);
			let magicIndex = checkBuffer.indexOf(this.#magicBuffer)
			if (magicIndex > -1) {
				this.#queue.unshift(checkBuffer.subarray(magicIndex));
			}
		}
	}

	async #checkData(data: Buffer): Promise<p2pMessageObject | false> {
		let parsedData = await this.#checkCb(data);
		if (!parsedData || typeof parsedData !== 'object') {
			return false;
		}
		if (typeof parsedData.err === 'number') {
			let errCode = parsedData.err;
			if (errCode === -1) {
				if (Buffer.isBuffer(this.#queue[0])) {
					this.#queue[0] = Buffer.concat([data, this.#queue[0]]);
				}
				else {
					this.#queue[0] = data;
					this.stop();
				}
			}
			else if (errCode === -3 && typeof parsedData.length === 'number' && parsedData.length > 0) {
				if (!Buffer.isBuffer(this.#waitBuffer)) {
					this.#waitBuffer = Buffer.allocUnsafe(parsedData.length);
					data.copy(this.#waitBuffer, 0)
					this.#waitBufferIndex = data.length;
				}
			}
			return false;
		}
		else if (parsedData.data) {
			return parsedData;
		}
		return false;
	}

	async #pushMessage(buffer: Buffer): Promise<boolean>{
		let r = await this.#checkData(buffer);
		if (r && r.data) {
			await this.#cb(r.data);
			this.#addRemain(r.remain);
			return true;
		}
		return false;
	}

	async #process() {
		if (!this.#isRun || this.isEmpty()) {
			return this.#isRun = false;
		}
		let data = this.#queue.shift();
		if (!Buffer.isBuffer(data)) {
			return this.#process();
		}
		else if (Buffer.isBuffer(this.#waitBuffer)) {
			await this.#mergeData(data);
			return this.#process();
		}
		await this.#pushMessage(data);
		if (this.#isRun) {
			this.#process();
		}
	}
}