import * as readline from 'node:readline';
import { stdin, stdout } from 'process';
import { defaultNodeConfig } from './node';
import { defaultWalletConfig } from './wallet';
import { rlClose, rlQuestion } from './util';

const changeType = {
	string: (x) => x,
	bigint: (x) => BigInt(x),
	number: (x) => Number(x),
	boolean: (x) => (x !== 'false' && x !== '0')
}

async function setConfig(rl, data, keyDot = null) {
	if (typeof data === 'object') {
		let target = {};
		for (let x in data) {
			let kd = (keyDot) ? `${keyDot}.${x}` : x;
			target[x] = await setConfig(rl, data[x], `${kd}`);
		}

		return target;
	}
	else {
		let ans = await rlQuestion(rl, `${keyDot}: `, (typeof data !== 'string') ? data.toString() : data);
		ans = (changeType[typeof data]) ? changeType[typeof data](ans) : ans;
		return ans;
	}
}

async function wizard() {
	let rl = readline.createInterface(stdin, stdout);
	let ans = await rlQuestion(rl, `Can't find configuration file and need to set it up? (y/n) : `);
	if (!ans.match(/^y(es)?$/i)) {
		rlClose(rl);
		console.log('exit');
		process.exit();
	}

	let config = {};
	config = await setConfig(rl, defaultNodeConfig);

	console.log(config);

	return config;
}

async function wizardWallet() {
	let rl = readline.createInterface(stdin, stdout);
	let ans = await rlQuestion(rl, `Can't find configuration file and need to set it up? (y/n) : `);
	if (!ans.match(/^y(es)?$/i)) {
		rlClose(rl);
		console.log('exit');
		process.exit();
	}

	let config = {};
	config = await setConfig(rl, defaultWalletConfig);

	console.log(config);
	rlClose(rl);
	return config
}


export { wizard, wizardWallet }