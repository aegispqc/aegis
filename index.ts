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

console.log('Program is activated');

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
	.option('-tm, --test-mode')
	.action(async (script, options) => {
		let opt = await getConfig(defultConfigPath);
		let { blockNotify, blockForkNotify, txNotify, testMode } = options._optionValues;
		initNode(opt, { blockNotify, blockForkNotify, txNotify}, testMode);
	});

program
	.command('wallet')
	.option('-wc, --wallet-config [type]')
	.option('-ro, --rpc-only')
	.action(async (script, options) => {
		console.log('Wallet mode!');
		let opt = await getConfig(options._optionValues.walletConfig, false);
		initWallet(opt, options._optionValues.rpcOnly);
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



