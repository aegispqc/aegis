class PollCollector {
	private resList: Set<any>;
	constructor() {
		this.resList = new Set();
	}

	addRes(res) {
		return new Promise((r) => {
			res.once('close', () => {
				res.destroy();
				this.resList.delete(r);
				r({ error: 'close' });
			});
			this.resList.add(r);
		});
	}

	send(data) {
		for (let r of this.resList) {
			r({ result: data });
			this.resList.delete(r);
		}
	}
}

export default PollCollector;