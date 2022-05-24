import * as readline from 'node:readline';

/**
 * Use `readline` to ask users question.
 * @param {readline.Interface} rl readline
 * @param {string} question Question to ask users.
 * @returns {Promise<string>} users answer
 * 
 * How to generate AbortSignal:
 * ```
 * const ac = new AbortController();
 * const signal = ac.signal;
 * ```
 * 
 * ```
signal.addEventListener('abort', () => {
  console.log('The food question timed out');
}, { once: true });

setTimeout(() => ac.abort(), 10000);
 * ```
 */
function rlQuestion(rl: readline.Interface, question: string, option?: string | { defultMsg?: any, passwordMode?: boolean, signal?: AbortSignal }): Promise<string> {
	return new Promise((r) => {
		let signal = option && typeof option !== 'string' ? option.signal : undefined;
		let passwordMode = option && typeof option !== 'string' ? option.passwordMode : undefined;

		if (passwordMode && (rl['output'].clearLine !== undefined)) {
			function passwordIn(msg: string) {
				rl['output'].clearLine();
				readline.cursorTo(rl['output'], 0);
				rl['output'].write(Array(rl.line.length + 1).join('*'));
			}

			rl.question(question + '\n', { signal }, (msg) => {
				rl['input'].removeListener('data', passwordIn);
				rl['history'] = rl['history'].slice(1);
				r(msg);
			});
			rl['input'].on('data', passwordIn);

			if (signal) {
				signal.addEventListener('abort', () => {
					rl['input'].removeListener('data', passwordIn);
					rl['history'] = rl['history'].slice(1);
				}, { once: true });
			}
		}
		else {
			rl.question(question, { signal }, r);
		}

		if (typeof option === 'string') {
			rl.write(option);
		}
		else if (option && option.defultMsg) {
			if (typeof option.defultMsg !== 'string') {
				option.defultMsg = option.defultMsg.toString();
			}
			rl.write(option.defultMsg);
		}
	});
}

function rlClose(rl: readline.Interface) {
	rl.close()
	rl.removeAllListeners()
}

function toFileJson(data) {
	return JSON.stringify(data, (key, value) => {
		return typeof value === 'bigint' ? value.toString() : value;
	}, ' ');
}

export { rlQuestion, rlClose, toFileJson }