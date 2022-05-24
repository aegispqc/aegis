import { Option } from '../lib/interface';

function delay(time) {
	return new Promise(res => {
		setTimeout(() => {
			res(true);
		}, time);
	});
}

export class Queue {
	#queue: Option[];
	#isRun: boolean;
	#cb: Function;
	#delayTime: number;
	constructor(processCallback: Function, delay?: number) {
		this.#queue = [];
		this.#isRun = false;
		this.#cb = processCallback;
		if (typeof delay === 'number') {
			this.#delayTime = delay;
		}
	}

	add(data) {
		this.#queue.push(data);
	}

	priorityAdd(data){
		this.#queue.unshift(data);
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

	async #process() {
		this.#isRun = true;
		let data = this.#queue.shift();
		if (data) {
			await this.#cb(data);
		}
		if (this.#delayTime) {
			await delay(this.#delayTime);
		}
		if (this.isEmpty()) {
			this.#isRun = false;
			return;
		}
		if (this.#isRun) {
			this.#process();
		}
	}
}