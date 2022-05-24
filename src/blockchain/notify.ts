import { exec  } from 'child_process';

class Notify {
	private list: { [key: string]: string };
	constructor() {
		this.list = {}
	}

	add(notifyName, notifyScript) {
		this.list[notifyName] = notifyScript;
	}

	exec(notifyName: string, value: string) {
		if(this.list[notifyName]) {
			let notifyScript = this.list[notifyName].replaceAll('%s', value);
			exec(notifyScript);
		}
	}
}

export default Notify;