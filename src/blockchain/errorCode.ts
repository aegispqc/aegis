const ErrorCode = {
	'-1' : 'txValid fail',
	'-2' : 'blockData tx is duplicated',
	'-3' : 'photon is already the upper limit',
	'-4' : 'stopAddTxFlag is true',
	'-5' : 'double spending',
	'-6' : 'PQCert is duplicated',
	'-7' : 'miningBlock is not found',
	'-8' : 'lastBlock is not found',
	'-9' : 'blockVerify fail',
	'-10': 'block fork fail',
	'-11': 'addCacheTx Fail',
	'-12': 'voutspent already spent',
	'-13': 'unlcok script fail',
	'-14': 'tx hash fail',
	'-15': 'script runs repeated calls',
	'-16': 'script unlcok script is not found',
	'-17': 'less than the minimum fee ratio',
	'-18': 'less than minimum fee',
	'-19': 'script fail',

	'-50': 'task queue Full',
	'-51': 'task queue addTask argument is not a function',
	'-52': 'task queue is terminated',

	'-101': 'x not found',
};


export default ErrorCode;