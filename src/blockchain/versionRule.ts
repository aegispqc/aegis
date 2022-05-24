type Version = {
	hdVer: number;
	txVer: number;
	pqcertVer: number;
}

const versionNum: number[]= [
	0
]

const versionEndHeight: number[] = [
	4030165
]

const versionList: { [key: number]: Version } = {
	'0': {
		hdVer: 0,
		txVer: 0,
		pqcertVer: 0,
	}
}

const defaultVersion = versionList[0];

function getVersionByHeight(height: number) {
	for (let i = 0; i < versionEndHeight.length; i++) {
		if (height < versionEndHeight[i]) {
			return versionList[versionNum[i]];
		}
	}

	return defaultVersion;
}

function getVersion(v) {
	return versionList[v]
}

export { Version, defaultVersion, getVersionByHeight, getVersion };

