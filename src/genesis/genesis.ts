import BlockData from "../blockchain/blockData";

let GBHBuf = Buffer.from('00000000000000000000000000000000000000000000000000000000000000000000000039cea7e7726e8e21cac9799a85b5a820955ea30e7cd9f251d1ab65a5b79587df00208c620b0008b42fe527e00000000000000000000000000000000000000000000000000000', 'hex');
let GBTxBuf = Buffer.from('0000000001000400000000ffffffff0100f08296050000002220b807bc0b4a12331a064be57f0380a44b14b43b2c09320e2f7abb3310f4601c16fc00324d6f7265207468616e207365637572652e006dc7a564cac9c45a2564d5c52e9e8e60ef54c491f8be283919dfa8b2a774d0aa00000000', 'hex');

let GB = BlockData.dataFormatToClass({
	height: 0,
	header: GBHBuf,
	txs: [GBTxBuf]
});

export default GB;

