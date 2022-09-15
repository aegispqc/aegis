import { WalletCli } from '../wallet/walletCli';
import { walletConfigValidate } from './configValidate';
import path from 'path';
import { Wallet } from '../wallet/wallet';

const defaultWalletConfig = {
	rpcOpt: {
		hostname: '127.0.0.1',
		port: 51978,
		auth: {
			usr: 'demo',
			pw: ''
		}
	},

	walletDataPath: path.join(process.cwd(), './walletFile'),
	jsonSpace: true,
	jsonColor: true,
	addressBs58ck: true,
	bigIntObjFloatFlag: true,
}

let exiting = false;
async function exitHandler(walletCli) {
	if(!exiting) {
		exiting = true;
		console.log("\nExit...");
		await walletCli.exit(true);
		console.log("Exit!!");
		process.exit();
	}
}

function init(config, rpcOnly = false) {
	let v = walletConfigValidate(config);
	if (!v) {
		console.error(walletConfigValidate.errors);
		return;
	}

	if (config.rpcOpt.PQCEncrypt) {
		for (let x in config.rpcOpt.PQCEncrypt) {
			config.rpcOpt.PQCEncrypt[x] = Buffer.from(config.rpcOpt.PQCEncrypt[x], 'base64');
		}
	}

	let wallet;
	if (!rpcOnly) {
		wallet = new Wallet(config.walletDataPath);
	}
	let walletCli = new WalletCli(config.rpcOpt, wallet, { jsonSpace: config.jsonSpace, jsonColor: config.jsonColor,  jsonTable: config.jsonTable, addressBs58ck: config.addressBs58ck }, rpcOnly);

	walletCli.init(true);

	process.on('exit', exitHandler.bind(null, walletCli));
	process.on('SIGINT', exitHandler.bind(null, walletCli));
	process.on('SIGUSR1', exitHandler.bind(null, walletCli));
	process.on('SIGUSR2', exitHandler.bind(null, walletCli));
	process.on('SIGTERM', exitHandler.bind(null, walletCli));
	process.on('uncaughtException', (e) => {
		console.error(`[${(new Date().toISOString())}] `, e);
	});
}

export default init
export { defaultWalletConfig }