import * as fs from 'fs';
import { Command } from 'commander';
import initNode from './src/indexUtil/node';
import { pqcEncryptGenKey } from './src/indexUtil/pqcEncryptGenKey';
import initWallet from './src/indexUtil/wallet';
import { wizard, wizardWallet } from './src/indexUtil/wizard';
import { toFileJson } from './src/indexUtil/util';
import path from 'path';

const defultConfigPath = path.join(process.cwd(), './config.json');
const defultWalletConfigPath = path.join(process.cwd(), './wconfig.json');

const SegfaultHandler = require('segfault-handler');
SegfaultHandler.registerHandler('crash.log');

console.log(`Program is activated. Node: ${process.version}`);

async function getConfig(path?: string, isNode: boolean = true) {
	let config;
	if (!path) {
		path = (isNode) ? defultConfigPath : defultWalletConfigPath;
	}

	try {
		return require(path);
	}
	catch (e) {
		config = (isNode) ? await wizard() : await wizardWallet();

		fs.writeFileSync(path, toFileJson(config));

		return getConfig(path);
	}
}


const program = new Command();

program
	.option('-c, --config [type]')
	.option('-bn, --block-notify [type]')
	.option('-bfn, --block-fork-notify [type]')
	.option('-tn, --tx-notify [type]')
	.action(async (script, options) => {
		let opt = await getConfig(defultConfigPath);
		let { blockNotify, blockForkNotify, txNotify } = options._optionValues;
		initNode(opt, { blockNotify, blockForkNotify, txNotify });
	});

program
	.command('wallet')
	.option('-wc, --wallet-config [type]')
	.action(async (script, options) => {
		console.log('Wallet mode!');
		let opt = await getConfig(options._optionValues.walletConfig, false);
		initWallet(opt);
	});

program
	.command('genPQCEncrypt')
	.option('-c, --config [type]')
	.action((script, options) => {
		console.log('genPQCEncrypt');
		let opt = options._optionValues;
		pqcEncryptGenKey(opt.config);
	});

program
	.command('walletGenPQCEncrypt')
	.option('-wc, --wallet-config [type]')
	.action((script, options) => {
		console.log('walletGenPQCEncrypt');
		let opt = options._optionValues;
		pqcEncryptGenKey(opt.walletConfig, false);

	});

program.parse(process.argv);



