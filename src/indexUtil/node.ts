import * as cpt from 'crypto';
import RpcServer from '../api/rpcServer';
import { Task } from '../task';
import { configValidate } from './configValidate';
import path from 'path';
import P2P from '../p2p/p2p';
import { mainNet, testNet } from '../p2p/lib/networkList';

const defaultNodeConfig = {
	coreOpt: {
		dbDir: path.join('./', 'data', 'blockDb'),
		minerFeeRatio: 1n,
	},
	walletHistoryOpt: {
		dbDir: path.join('./', 'data', 'walletHistoryDb'),
	},
	rpcOpt: {
		hostname: '127.0.0.1',
		port: 51978,
		auth: {
			usr: 'demo',
			pw: cpt.randomBytes(16).toString('base64')
		},
		disable: false
	},
	p2pOpt: {
		peerDir: path.join('./', 'data', 'peers'),
		maxConnect: 256,
		listenPort: 51977,
		serverDisable: false
	},
	services: {
		fullnode: true,
	},
	eventLog: {
		newBlock: true,
		forkBlock: true,
		addTx: false,
		p2p: true
	}
}

async function init(config, notify?: { blockNotify?: string, blockForkNotify?: string, txNotify?: string }, testMode?: boolean) {
	const originalLog = console.log;
	console.log = (...input) => {
		originalLog(`[${(new Date().toISOString())}]`, ...input);
	};
	const originalErr = console.error;
	console.error = (...input) => {
		originalErr(`[${(new Date().toISOString())}]`, ...input);
	};

	let v = configValidate(config);
	if (!v) {
		console.error(configValidate.errors);
		return;
	}

	if (config.coreOpt?.minerFeeRatio) {
		config.coreOpt.minerFeeRatio = BigInt(config.coreOpt.minerFeeRatio);
	}

	let task = new Task(config.taskOpt, config.coreOpt, config.walletHistoryOpt, notify, testMode);
	await task.init();

	let p2p;
	if (config.p2pOpt) {
		if (testMode) {
			p2p = new P2P(testNet, task, config.p2pOpt, config.services);
		}
		else {
			p2p = new P2P(mainNet, task, config.p2pOpt, config.services);
		}
		let r = await p2p.initialize();
		if (r && config.p2pOpt.serverDisable !== true) {
			p2p.serverOn(config.p2pOpt.listenPort);
		}
	}

	let rpcServer;
	if (config.rpcOpt && !config.rpcOpt.disable) {
		if (config.rpcOpt.PQCEncrypt) {
			for (let x in config.rpcOpt.PQCEncrypt) {
				config.rpcOpt.PQCEncrypt[x] = Buffer.from(config.rpcOpt.PQCEncrypt[x], 'base64');
			}
		}
		rpcServer = new RpcServer(config.rpcOpt, task, p2p);
		rpcServer.start();
	}

	if (config.eventLog) {
		if (config.eventLog.newBlock) {
			task.eventEmit.on('newBlock', (m) => {
				console.log(`newBlock: "${m.toString('hex')}"`);
			});
		}
		if (config.eventLog.forkBlock) {
			task.eventEmit.on('forkBlock', (m) => {
				console.log(`forkBlock: ${JSON.stringify({ startHeight: m.startHeight, endHeight: m.endHeight, blockHashList: m.blockHashList.map(x => x.toString('hex')) })}`);
			});
		}
		if (config.eventLog.addTx) {
			task.eventEmit.on('addTx', (m) => {
				console.log(`addTx: ${JSON.stringify({ txid: m.txid.toString('hex'), mining: m.mining })}`);
			});
		}
		if (config.eventLog.p2p) {
			task.eventEmit.on('p2pError', (m) => {
				console.log(`p2pError: ${JSON.stringify({ label: m.label, text: m.text })}`);
			});
			task.eventEmit.on('p2pConnection', (m) => {
				console.log(`connection: ${JSON.stringify({ ip: m.ip, port: m.port })}`);
			});
			task.eventEmit.on('p2pDisconnection', (m) => {
				console.log(`disconnection: ${JSON.stringify({ ip: m.ip, port: m.port, malicious: m.isMalicious, timeout: m.isTimeout })}`);
			});
		}
	}

	let exiting = false;
	async function exitHandler() {
		if (!exiting) {
			exiting = true;
			console.log("\nExit...");
			let p = [];
			if (p2p) {
				p.push(p2p.exit());
			}
			if (rpcServer) {
				p.push(rpcServer.exit());
			}
			p.push(task.exit());

			await Promise.all(p);

			console.log("Exit!!");
			process.exit();
		}
	}

	process.on('exit', exitHandler);
	process.on('SIGINT', exitHandler);
	process.on('SIGUSR1', exitHandler);
	process.on('SIGUSR2', exitHandler);
	process.on('SIGTERM', exitHandler);
	process.on('uncaughtException', (e) => {
		console.error(e);
	});
}

export default init
export { defaultNodeConfig }