# AEGIS 
AEGIS is a brand-new, experimental quantum-resistant cryptocurrency that conceptualizes the decentralization of the Bitcoin white paper, integrates a variety of digital signature algorithms based on modern cryptography and post-quantum cryptography, and improves the efficiency of various algorithmic applications.

## What is AEGIS Core?
Aegis Core is programmed to decide which blockchain contains valid transactions with multiple post-quantum signature algorithms.  
The current digital signature algorithms used by AEGIS are as follows:

1. **Secp256k1**
2. **Dilithium3** - CRYSTALS-DILITHIUM (quantum-resistant) Nist PQC Round 3 Submissions
3. **Dilithium5** - CRYSTALS-DILITHIUM (quantum-resistant) Nist PQC Round 3 Submissions
4. **Falcon512** - Falcon (quantum-resistant) Nist PQC Round 3 Submissions
5. **Falcon1024** - Falcon (quantum-resistant) Nist PQC Round 3 Submissions

## Quick start
### 1. Start full node
linux
```bash
./app
```
windows
```bash
./app.exe
```
#### Setting full node config
```bash
coreOpt.dbDir: .\data\blockDb
coreOpt.minerFeeRatio: 1
walletHistoryOpt.dbDir: .\data\walletHistoryDb
rpcOpt.hostname: 127.0.0.1
rpcOpt.port: 51978
rpcOpt.auth.usr: [custom]
rpcOpt.auth.pw: [custom]
rpcOpt.disable: false
p2pOpt.peerDir: .\data\peers
p2pOpt.maxConnect: 256
p2pOpt.listenPort: 51977
p2pOpt.serverDisable: false
services.fullnode: true
eventLog.newBlock: true
eventLog.forkBlock: true
eventLog.addTx: false
eventLog.p2p: true
```
**PS. full node config will save in config.json**

### 2. Start walletCli
linux
```bash
./index wallet
```
windows
```bash
./index.exe wallet
```
#### setting wallet config
```bash
rpcOpt.hostname: 127.0.0.1
rpcOpt.port: 51978
rpcOpt.auth.usr: [same as rpc server auth.usr]
rpcOpt.auth.pw: [same as rpc server auth.pw]
walletDataPath: .\walletFile
jsonSpace: true
jsonColor: true
addressBs58ck: true
bigIntObjFloatFlag: true
```
**PS. wallet config will save in wconfig.json**

## Wallet usage
#### Start walletCli
linux
```bash
./index wallet
```
windows
```bash
./index.exe wallet
```
#### Generate a wallet
```bash
> generateWallet
```
#### Generate an address
```bash
> walletAddAddress
```
#### Backup wallets (option)
```bash
> exportWalletFile [filePath]
```

#### Start mining
```bash
> mine [yourAddress]
```
**PS. Currently supported drives and cuda versions**
* Driver Version: 470 or above.
* CUDA Version: 11 or above.

#### more
If you want to know more, please see [more](./src/wallet/readme.md).
or use help method.
```bash
> help
> help [method name]
```