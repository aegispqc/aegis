
/**
 * Reject ccode
 * Front 4 bits - type of rejection
 * 0000 network error
 * 0001 reject tx
 * 0002 reject block
 * 
 * Last 4 bits - reasons for rejection
 * 0000 other
 * 0001 MALFORMED
 * 0002 INVALID
 * 0003 OBSOLETE
 * 0004 DUPLICATE
 * 0005 NONSTANDARD
 * 0006 MALICIOUS
 * 
 * tx 
 * 0011 Dust
 * 0012 INSUFFICIENTFEE
 * 0013 CHECKPOINT
 */ 

export default {
	'networkMalformed': {
		message: '',
		ccode: 0x01,
		reason: ''
	},
	'invalidNetwork': {
		message: '',
		ccode: 0x01,
		reason: 'Network magic not match'
	},
	'invalidCommand': {
		message: '',
		ccode: 0x01,
		reason: 'Command not found'
	},
	'invalidChecksum': {
		message: '',
		ccode: 0x02,
		reason: 'Checksum error'
	},
	'invalidUidDuplicate': {
		message: '',
		ccode: 0x04,
		reason: 'Uid duplicate'
	},
	'invalidpeerIsMalicious': {
		message: '',
		ccode: 0x06,
		reason: 'You are malicious'
	},
	'invalidFork': {
		message: 'inv',
		ccode: 0x22,
		reason: 'Fork data are invalid'
	},
	'tx': {
		message: 'tx',
		ccode: 0x12,
		reason: 'New tx error'
	},
	'blockDuplicate': {
		message: 'block',
		ccode: 0x24,
		reason: ''
	},
	'blockMalformed': {
		message: 'block',
		ccode: 0x21,
		reason: ''
	},
	'blockInvalid': {
		message: 'block',
		ccode: 0x22,
		reason: ''
	},
	'blockForkFail': {
		message: 'block',
		ccode: 0x22,
		reason: 'Fork failure'
	},
	'txDuplicate': {
		message: 'tx',
		ccode: 0x14,
		reason: ''
	},
	'dust': {
		message: 'tx',
		ccode: 0x1b,
		reason: ''
	},
	'txFee': {
		message: 'tx',
		ccode: 0x1c,
		reason: "Tx's fee not enough"
	}
}