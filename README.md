# AEGIS 
AEGIS is a brand-new, experimental quantum-resistant cryptocurrency that conceptualizes the decentralization of the Bitcoin white paper, integrates a variety of digital signature algorithms based on modern cryptography and post-quantum cryptography, and improves the efficiency of various algorithmic applications.

**The aegisPQC code is complete, please feel free to maintain and fork it.**

## What is AEGIS Core?
AEGIS Core is programmed to decide which blockchain contains valid transactions with multiple post-quantum signature algorithms.  
  
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
./aegis
```
windows
```bash
./aegis.exe
```
#### Setting full node config
Execute the full node for the first time, it will ask for configuration parameters.
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
./aegis wallet
```
windows
```bash
./aegis.exe wallet
```
#### setting wallet config
Enter the individual needs in order.
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

## AEGIS Wallet - Get started using AEGIS
#### Start walletCli
linux
```bash
./aegis wallet
```
windows
```bash
./aegis.exe wallet
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

## AEGIS Wallet - Send amount
There are three methods to send the amount.

### 1. walletSend
The first and easiest method.
```bash
> walletSend "srcAddress" "tgtAddress" 100
Do you use all UTXO? (y/n): n
Set change address (default address is "srcAddress"):
Which of the following 2 signature systems you would like to choose for your signature: (FAKE is not an option)
 0) Secp256k1
 1) Nist_round3_Dilithium3
 2) Nist_round3_Dilithium5
 3) Nist_round3_Falcon512
 4) FAKE
Please enter the number and separate it with a comma. (must be in ascending order): 0,1
Please enter an opreturn message (not required):
Transaction details:
┌───────────────┬──────────────────────────────────────────────────────────────────────────┐
│    (index)    │                                  Values                                  │
├───────────────┼──────────────────────────────────────────────────────────────────────────┤
│        Source │  "srcAddress"                                                            │
│        Target │  100.00000000 -> "tgtAddress1"                                           │
│   UTXO amount │  240.00000000                                                            │
│       Sending │  200.00000000                                                            │
│        Change │  39.99989720 -> "srcAddress"                                             │
│    Fee amount │  0.00010280                                                              │
│   Fee details │  unlockScript: 98.2%, pqcert: < 0.1%, opReturn: < 0.1%, other: 1.8%,     │
│ Photon amount │  10280                                                                   │
│     Signatrue │  Secp256k1, Nist_round3_Dilithium3                                       │
└───────────────┴──────────────────────────────────────────────────────────────────────────┘
Please check if your transaction (above) is correct. (y/n):y
{
 "result": {
  "suc": true,
  "txid": "*************************************************"
 }
}

#see more
> help walletSend 1
#Check transaction when transaction was unconfirmed.
> getTxPoolList
> getTxPoolByTxid "txid"
#Check transaction when transaction was confirmed.
> getTransactionByTxid "txid"
```
### 2. walletSendMany
Send amount to multiple addresses.
```bash
> walletSendMany "srcAddress" [{"address":"tgtAddress1","value":"100"},{"address":"tgtAddress2","value":"100"}]
Do you use all UTXO? (y/n): n
Set change address (default address is "srcAddress"):
Which of the following 2 signature systems you would like to choose for your signature: (FAKE is not an option)
 0) Secp256k1
 1) Nist_round3_Dilithium3
 2) Nist_round3_Dilithium5
 3) Nist_round3_Falcon512
 4) FAKE
Please enter the number and separate it with a comma. (must be in ascending order): 0,1
Please enter an opreturn message (not required):
Transaction details:
┌───────────────┬──────────────────────────────────────────────────────────────────────────┐
│    (index)    │                                  Values                                  │
├───────────────┼──────────────────────────────────────────────────────────────────────────┤
│        Source │  "srcAddress"                                                            │
│    Target [0] │  100.00000000 -> "tgtAddress1"                                           │
│    Target [1] │  100.00000000 -> "tgtAddress2"                                           │
│   UTXO amount │  240.00000000                                                            │
│       Sending │  200.00000000                                                            │
│        Change │  39.99989720 -> "srcAddress"                                             │
│    Fee amount │  0.00010280                                                              │
│   Fee details │  unlockScript: 98.2%, pqcert: < 0.1%, opReturn: < 0.1%, other: 1.8%,     │
│ Photon amount │  10280                                                                   │
│     Signatrue │  Secp256k1, Nist_round3_Dilithium3                                       │
└───────────────┴──────────────────────────────────────────────────────────────────────────┘
Please check if your transaction (above) is correct. (y/n): y
{
 "result": {
  "suc": true,
  "txid": "*************************************************"
 }
}

#see more
> help walletSendMany 1
```
### 3. walletASend
Advanced walletSend.
```bash
> walletASend ["srcAddress1","srcAddress2","srcAddress3"] [{"address":"tgtAddress","value":"150"}]
Do you use all UTXO? (y/n): n
Please enter an opreturn message (not required):
Do you use all UTXO from ("srcAddress1") address? (y/n): y
Now using "srcAddress1", which of the following 2 signature systems you would like to choose for your signature: (FAKE is not an option)
 0) Secp256k1
 1) Nist_round3_Dilithium3
 2) Nist_round3_Falcon512
 3) FAKE
Please enter the number and separate it with a comma. (must be in ascending order): 0,1
Do you use all UTXO from ("srcAddress2") address? (y/n): y
Now using "srcAddress2", which of the following 2 signature systems you would like to choose for your signature: (FAKE is not an option)
 0) Secp256k1
 1) Nist_round3_Dilithium3
 2) Nist_round3_Dilithium5
 3) Nist_round3_Falcon512
 4) FAKE
Please enter the number and separate it with a comma. (must be in ascending order): 0,1
The transaction amount is sufficient, do you still need to use the ("srcAddress3") address, and use all UTXO? (y/n): y
Now using "srcAddress3", which of the following 3 signature systems you would like to choose for your signature: (FAKE is not an option)
 0) Nist_round3_Dilithium5
 1) FAKE
 2) Secp256k1
 3) Nist_round3_Dilithium3
 4) Nist_round3_Falcon512
Please enter the number and separate it with a comma. (must be in ascending order): 0,2,3
Set change address (default address is "srcAddress3"):
Transaction details:
┌───────────────┬────────────────────────────────────────────────────────────────────────────────┐
│    (index)    │                                     Values                                     │
├───────────────┼────────────────────────────────────────────────────────────────────────────────┤
│    Source [0] │  "srcAddress1" -> 100.00000000                                                 │
│    Source [1] │  "srcAddress2" -> 100.00000000                                                 │
│    Source [2] │  "srcAddress3" -> 100.00000000                                                 │
│    Target [0] │  150.00000000 -> "tgtAddress"                                                  │
│   UTXO amount │  300.00000000                                                                  │
│       Sending │  150.00000000                                                                  │
│        Change │  149.99955418 -> "srcAddress3"                                                 │
│    Fee amount │  0.00044582                                                                    │
│   Fee details │  unlockScript: 98.9%, pqcert: 0.6%, opReturn: < 0.1%, other: 0.5%,             │
│ Photon amount │  44582                                                                         │
│ Signatrue [0] │  "srcAddress1" -> Secp256k1, Nist_round3_Dilithium3                            │
│ Signatrue [1] │  "srcAddress2" -> Secp256k1, Nist_round3_Dilithium3                            │
│ Signatrue [2] │  "srcAddress3" -> Nist_round3_Dilithium5, Secp256k1, Nist_round3_Dilithium3    │
└───────────────┴────────────────────────────────────────────────────────────────────────────────┘

Please check if your transaction (above) is correct. (y/n): y
{
 "result": {
  "suc": true,
  "txid": "*************************************************"
 }
}

#see more
> help walletASend 1
```
