
export class BufferQueue {
	#magicBuffer: Buffer;
	#queue: Buffer[];
	#isRun: boolean;
	#checkCb: Function;
	#cb: Function;
	#waitData: boolean;
	constructor(magicBuffer: number, checkCallback, processCallback) {
		this.#magicBuffer = Buffer.alloc(4);
		this.#magicBuffer.writeUInt32LE(magicBuffer);
		this.#queue = [];
		this.#isRun = false;
		this.#checkCb = checkCallback;
		this.#cb = processCallback;
		this.#waitData = false;
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

	#mergeData(startIndex: number, endIndex: number): boolean {
		let buffer = [];
		let length = 0;
		for (let i = startIndex; i <= endIndex; i++) {
			if (Buffer.isBuffer(this.#queue[i])) {
				buffer.push(this.#queue[i]);
				length += this.#queue[i].length;
			}
		}
		let newBuffer = Buffer.concat(buffer, length);
		this.#queue.splice(startIndex, endIndex - startIndex + 1, newBuffer);
		return true;
	}

	#addRemain(remain) {
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

	async #process() {
		if (this.isEmpty()) {
			this.#isRun = false;
			return;
		}

		this.#isRun = true;
		let data = Buffer.alloc(0);
		if (this.#waitData && this.#queue.length > 1) {
			this.#mergeData(0, 1);
			this.#waitData = false;
		}
		data = this.#queue[0];
		if (!data.includes(this.#magicBuffer)) {
			this.#queue.shift();
			return this.#process();
		}

		let parsedData = await this.#checkCb(data);
		if (typeof parsedData === 'number' && parsedData > -1) {
			this.#waitData = true;
			if (this.#queue.length <= 1) {
				return this.stop();
			}
		}
		else if (parsedData && typeof parsedData === 'object') {
			this.#queue.shift();
			this.#waitData = false;
			await this.#cb(parsedData.data);
			if (Buffer.isBuffer(parsedData.remain) && parsedData.remain.length > 0) {
				this.#addRemain(parsedData.remain);
			}
		}
		if (this.#isRun) {
			this.#process();
		}
	}
}