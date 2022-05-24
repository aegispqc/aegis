function taskRun(tasks) {
	return new Promise(r => {
		setImmediate(async () => {
			let thisTask = tasks.shift();
			if (!thisTask) {
				return r(true);
			}

			await thisTask();
			return r(await taskRun(tasks));
		});
	});
}

class TaskQueue {
	private maxTask: number;
	private tasks: any[];
	private isRun: boolean;
	private isTerminated: boolean;
	private finishFun: () => any;

	constructor(maxTask: number = 20) {
		this.maxTask = maxTask;
		this.tasks = [];
		this.isRun = false;
		this.isTerminated = false;
	}

	addTask(task): Promise<{ taskErr?: number, data?: any }> {
		return new Promise(async (r) => {
			if(this.isTerminated) {
				return r({ taskErr: -52 });
			}
			if (this.tasks.length >= this.maxTask) {
				return r({ taskErr: -50 });
			}
			if (typeof task !== 'function') {
				return r({ taskErr: -51 });
			}

			if (task.constructor.name === "AsyncFunction") {
				this.tasks.push(async () => {
					r({ data: await task() });
				});
			}
			else {
				this.tasks.push(async () => {
					r({ data: task() });
				});
			}
			if (!this.isRun) {
				this.isRun = true;
				await taskRun(this.tasks);
				this.isRun = false;
				if(this.isTerminated && this.finishFun) {
					this.finishFun();
				}
			}
		});
	}

	isFinish() {
		return !this.isRun;
	}

	terminate() {
		this.isTerminated = true;
		if(this.isFinish()) {
			console.log('Task queue Completion!');
			return true;
		}
		return new Promise((r) => {
			console.log('The task queue is still running, waiting for completion...');
			this.finishFun = () => { 
				console.log('Task queue Completion!');
				r(true);
			};
		});
	}
}

export { TaskQueue };