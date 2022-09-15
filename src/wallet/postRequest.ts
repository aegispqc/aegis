import { PQCEncrypt } from "../crypto/PQCEncrypt";
import http from 'http';

class PostRequest {
	opt: any;
	auth?: any;
	pqc?: PQCEncrypt;
	constructor(opt?: { auth?}) {
		this.opt = (opt) ? opt : {};

		if (!this.opt?.hostname) {
			this.opt.hostname = '127.0.0.1'
		}

		if (!this.opt?.port) {
			this.opt.port = 8899;
		}

		if (this.opt?.PQCEncrypt) {
			let signSeed = this.opt.PQCEncrypt.signSeed;
			let aesKey = this.opt.PQCEncrypt.aesKey;
			this.pqc = new PQCEncrypt(signSeed, aesKey);

			if (this.opt.PQCEncrypt.cliPubKey) {
				this.pqc.setCliPubKey(this.opt.PQCEncrypt.cliPubKey);
			}
		}

		this.auth = (this.opt.auth) ? 'Basic ' + Buffer.from(this.opt.auth.usr + ':' + this.opt.auth.pw, 'utf8').toString('base64') : null;
	}

	init() {
		if (this.pqc) {
			this.pqc.clearSchedulingStart();
		}
	}

	exit() {
		if (this.pqc) {
			this.pqc.clearSchedulingStop();
		}
	}

	async emit(msg: any, timeOut: number = 30000): Promise<{ err?: any, data?: any }> {
		return new Promise(r => {
			let data: any = JSON.stringify(msg)

			const options = {
				hostname: this.opt.hostname,
				port: this.opt.port,
				path: '',
				method: 'POST',
				headers: {
					// 'Content-Type': 'application/json',
					// 'Content-Length': data.length
				},
				timeout: timeOut
			}

			if (this.auth) {
				options.headers['Authorization'] = this.auth;
			}

			let req = http.request(options, res => {
				let rdata: any = [];
				if (res.statusCode !== 201) {
					r({ err: `status code: ${res.statusCode}` });
					return;
				}
				res.on('data', d => {
					rdata.push(d);
				});

				res.on('end', () => {
					rdata = Buffer.concat(rdata);
					if (this.pqc) {
						rdata = this.pqc.decryption(rdata);
						if (!rdata) {
							r({ err: 'Sign verify fail!' });
							return;
						}
					}
					r({ data: rdata.toString('utf8') });
				});
			})

			req.on('error', err => {
				r({ err: err });
			});

			req.on('timeout', () => {
				req.destroy();
				r({ err: 'timeout' });
			});

			if (this.pqc) {
				data = this.pqc.encryption(Buffer.from(data, 'utf8'));
				if (!data) {
					r({ err: 'Cli sign error!' });
				}
			}

			req.write(data);
			req.end();
		});
	}
}

export { PostRequest }