const { Console } = require('console');
const { Transform } = require('stream');

const ts = new Transform({ transform(chunk, enc, cb) { cb(null, chunk) } })
const logger = new Console({ stdout: ts })

function getTableStr(tabularData, properties?: string[], align: { [key: string]: 'R' | 'L' } = {}) {
	let temp = JSON.parse(JSON.stringify(tabularData)); // clone
	if (Array.isArray(tabularData)) {
		for (let x in align) {
			let key = x;
			let value = align[x];
			if (value === 'R' || value === 'L') {
				let longest = 0;
				for (let y in temp) {
					let ele = temp[y];
					if (ele[key]) {
						let length = ele[key].toString().length;
						if (length > longest) {
							longest = length;
						}
					}
				}
				if (value === 'R') {
					for (let y in temp) {
						let ele = temp[y];
						if (ele[key]) {
							ele[key] = ele[key].toString().padStart(longest, ' ');
						}
					};
				}
				if (value === 'L') {
					for (let y in temp) {
						let ele = temp[y];
						if (ele[key]) {
							ele[key] = ele[key].toString().padEnd(longest, ' ');
						}
					};
				}
			}
		}
	}
	else {
		if (align.index === 'R' || align.index === 'L') {
			let longestIndex = 0;
			let cTemp = {};
			for (let y in temp) {
				if (y.toString().length > longestIndex) {
					longestIndex = y.toString().length;
				}
			}
			if (align.index === 'R') {
				for (let y in temp) {
					let pad = y.toString().padStart(longestIndex, ' ');
					cTemp[pad] = temp[y];
				}
			}
			else {
				for (let y in temp) {
					let pad = y.toString().padEnd(longestIndex, ' ');
					cTemp[pad] = temp[y];
				}
			}
			temp = cTemp;
		}
		if (align.value === 'R' || align.value === 'L') {
			let longestValue = 0;
			for (let y in temp) {
				if (temp[y].toString().length > longestValue) {
					longestValue = temp[y].toString().length;
				}
			}
			if (align.value === 'R') {
				for (let y in temp) {
					let pad = temp[y].toString().padStart(longestValue, ' ');
					if (pad !== temp[y]) {
						temp[y] = pad;
					}
				}
			}
			else {
				for (let y in temp) {
					let pad = temp[y].toString().padEnd(longestValue, ' ');
					if (pad !== temp[y]) {
						temp[y] = pad;
					}
				}
			}

		}
	}
	logger.table(temp, properties);
	let str = (ts.read() || '').toString();
	str = str.replaceAll("'", ' ');
	return str;
}

export { getTableStr }