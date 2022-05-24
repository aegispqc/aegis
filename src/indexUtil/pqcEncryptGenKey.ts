import * as fs from 'fs';
import * as readline from 'node:readline';
import { stdin, stdout } from 'process';
import { PQCEncrypt } from '../crypto/PQCEncrypt';
import { rlClose, rlQuestion, toFileJson } from './util';
import path from 'path';

const defultConfigPath = path.join(process.cwd(), './config.json');
const defultWalletConfigPath = path.join(process.cwd(), './wconfig.json');

async function pqcEncryptGenKey(optionPath?: string, isNode: boolean = true) {
	if (!optionPath) {
		optionPath = (isNode) ? defultConfigPath : defultWalletConfigPath;
	}
	let config
	try {
		config = require(optionPath);
	}
	catch (e) {
		console.error('ERROR: config.json not found');
		process.exit();
	}

	let rl = readline.createInterface(stdin, stdout);
	let op = (config?.rpcOpt?.PQCEncrypt?.cliPubKey) ? 'update' : 'add';
	let target = (isNode) ? 'client' : 'node';
	if (config?.rpcOpt?.PQCEncrypt?.signSeed) {
		let pqc = new PQCEncrypt(Buffer.from(config.rpcOpt.PQCEncrypt.signSeed, 'base64'), Buffer.from(config.rpcOpt.PQCEncrypt.aesKey, 'base64'));
		console.log(`Already exists key: `);
		console.log(`---------------------  Aes key   ---------------------\n${pqc.aesKey.toString('base64')}`);
		console.log(`--------------------- Public key ---------------------\n${pqc.pubKey.toString('base64')}\n------------------------------------------------------`);

		let ans = await rlQuestion(rl, `The PQCEncrypt already exists, do you want to ${op} a new ${target} public key? (y/n) : `);
		if (!ans.match(/^y(es)?$/i)) {
			rlClose(rl);
			return;
		}

		ans = await rlQuestion(rl, `Please enter your client's public key. (base64) : `);
		config.rpcOpt.PQCEncrypt.cliPubKey = ans;
		fs.writeFileSync(optionPath, JSON.stringify(config, null, ' '));
		console.log(`${op} ${target} public key success!`);
		rlClose(rl);
		return;
	}

	let ans = await rlQuestion(rl, `The PQCEncrypt  doesn't exist, do you want to create it? (y/n) : `);
	if (!ans.match(/^y(es)?$/i)) {
		rlClose(rl);
		process.exit();
		return;
	}

	ans = await rlQuestion(rl, `Do you want to use the existing aes key? (y/n) : `);
	let aesKey;
	if (ans.match(/^y(es)?$/i)) {
		aesKey = await rlQuestion(rl, `Please enter your aes key. (base64) : `);
	}

	if (!config.rpcOpt.PQCEncrypt) {
		config.rpcOpt.PQCEncrypt = {};
	}

	let pqc = new PQCEncrypt(undefined, aesKey);
	config.rpcOpt.PQCEncrypt.signSeed = pqc.signSeed.toString('base64');
	config.rpcOpt.PQCEncrypt.aesKey = pqc.aesKey.toString('base64');

	fs.writeFileSync(optionPath, toFileJson(config));
	console.log(`Create PQCEncrypt success!`);
	console.log(`---------------------  Aes key   ---------------------\n${pqc.aesKey.toString('base64')}`);
	console.log(`--------------------- Public key ---------------------\n${pqc.pubKey.toString('base64')}\n------------------------------------------------------`);
	rlClose(rl);
}


export { pqcEncryptGenKey }