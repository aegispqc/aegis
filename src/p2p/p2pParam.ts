
// common
const Version: number = 1;

// network
// server defalut listen port
const ListenPort: number = 51977;
// Maximum amount of errors tolerated
const MaxErrorCount: number = 10;
// The socket's connection timeout
const ConnectionTimeout: number = 90 * 60 * 1000; // 90min
// The socket communication timeout
const SocketTimeout: number = 30 * 1000; // 30s
// check connection amount or too long without communication
const TimeToCheckConnection: number = 5 * 60 * 1000; // 5min
// Actively connect other address
const percentOfActiveConnection: number = 6.25; // 6.25%

// block
const MaxSyncBlockAmount: number = 50;

// time (ms)
// alive address time
const AliveAddr: number = 1 * 60 * 60 * 1000;  // 1hour
// limit get address time
const GetAddr: number = 5 * 60 * 1000; // 5min
// limit fill connect
const FillConnect: number = 1 * 60 * 1000; // 1min
const Heartbeat: number = 60 * 1000; // 60s
const SyncBlockTimeout: number = 30 * 1000; // 30s
const RetentionTimeOfNode: number = 14 * 24 * 60 * 60 * 1000;  // 2 week


export default {
	common: { Version },
	network: { ListenPort, MaxErrorCount, percentOfActiveConnection, SocketTimeout, ConnectionTimeout, TimeToCheckConnection },
	block: { MaxSyncBlockAmount },
	limitTime: { AliveAddr, Heartbeat, GetAddr, FillConnect, SyncBlockTimeout, RetentionTimeOfNode }
}