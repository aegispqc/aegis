### `setJsonSpace`: indent:boolean
setJsonSpace    
Use space indentation when displaying JSON format.    
Arguments:    
1. indent (type boolean, required)  
    

### `setJsonColor`: colored:boolean
setJsonColor    
Display color when displaying JSON format.    

Arguments:    
1. colored (type boolean, required)  
    

### `clear`
clear    
Clear Screen.    
    

### `generateWallet`
generateWallet    
Create a new wallet.    
    

### `importWalletFile`: path:string seedFlag:boolean
importWalletFile    
Import wallet file location.    
    
Arguments:    

1. path (type string, required)  
Wallet file location.    

2. seedFlag (type boolean, optional, default=false)    
Whether or not to use the seed storage wallet.    
    

### `importWalletFile`: path:string seedFlag:boolean
importWalletFile    
Import wallet file location.    
    
Arguments:    

1. path (type string, required)  
Wallet file location.    

2. seedFlag (type boolean, optional, default=false)    
Whether or not to use the seed storage wallet.    
    

### `exportWalletFile`: path:string seedFlag:boolean
exportWalletFile    
Export the location of the Wallet file.    
    
Arguments:     

1. path (type string, required)  
Export wallet file location.    

2. seedFlag (type boolean, optional, default=false)    
Whether or not to use the seed storage wallet.    
    


### `exportWalletFile`: path:string seedFlag:boolean
exportWalletFile    
Export the location of the Wallet file.    
    
Arguments:    

1. path (type string, required)  
Export wallet file location.    

2. seedFlag (type boolean, optional, default=false)    
Whether or not to use the seed storage wallet.    
    


### `walletGetSignSysList`
walletGetSignSysList    
Get Wallet Sign System List.    
    
Exapmle:
```
> walletGetSignSysList
[
    {
        pubHash: 'b50fef02252c5f9f____________________________48944fd90e189ad86ab2',
        version: 0,
        signType: 0,
        signName: 'Secp256k1'
    },
    {
        pubHash: 'e89e31e61700e030_____________________________277f06385d607b53370',
        version: 0,
        signType: 1,
        signName: 'Nist_round3_Dilithium2'
    },
    {
        pubHash: '5a114d80df41e71b_____________________________3212d332da1569b5273',
        version: 0,
        signType: 2,
        signName: 'Nist_round3_Dilithium3'
    },
    {
        pubHash: '8d24c577cf1b8d2f_____________________________fe8cd8f9e0662335026',
        version: 0,
        signType: 3,
        signName: 'Nist_round3_falcon512'
    },
    {
        pubHash: 'be759e4cada79d07____________________________1da3cf353e8b0d441d8a',
        version: 0,
        signType: 4,
        signName: 'Nist_round3_falcon1024'
    }
]
```
    


### `walletAddAddress`: (Q&A Wizard)
walletAddAddress    
Create a wallet address use Q&A Wizard.    
    
* [level] The number of required signatures out of the addresses.    
* [fakeAmount] Number of fake pqcert, default is 1.    
* [shuffle] Whether to switch the order of signatures.    
    


### `walletGetAddressList`
walletGetAddressList    
Get all addresses for the wallet.    
    
Result:    
```
[
    "address1",
    "address2",
    ...
]
```
    


### `walletGetAddressDetails`: address:string origin:boolean=false
Arguments:
1. address (type string, required)
The wallet address.

2. origin (type boolean, optional, default = false)
show address origin data.


### `walletGetBalance`
walletGetBalance    
Returns the total available balance for all wallet address.    
    
Result:    
```
{
    "sub": {
        "walletAddress1": {
            "avl": "available balance",
            "lock": "0"
        },
        "walletAddress2": {
            "avl": "available balance",
            "lock": "0"
        }
    },
    "total": {
        "avl": "total available balance",
        "lock": "0"
    }
}
```
    


### `walletCreateTransation`: srcAddress:string tgtAddress:string value:number extraValue:number=10000 rawFlag:boolean=true, tempFlag:boolean=true
walletCreateTransation    
Add a new transaction.    
    
Arguments:    

1. srcAddress (type string, required)    
Send address.    

2. tgtAddress (type string, required)    
Target address.    

3. value (type number, required)    
send amount of coin.    

4. extraValue (type number, optional, default=10000n)    
Amount reserved for fee.    

5. rawFlag (type boolean, optional, default=true)    
Whether the transaction is expressed in raw.    

6. tempFlag (type boolean, optional, default=true)    
Save this transaction raw temporarily    
    



### `walletSend`: srcAddress:string tgtAddress:string value:number signOrder:number[] feeRatio:number=1
walletSend    
The easy method. One-time transaction generation.    
    
Arguments:    

1. srcAddress (type string, required)    
Send address.    

2. tgtAddress (type string, required)    
Target address.    

3. value (type number, required)    
send amount of coin.    

4. signOrder(type number[], required)    
This transaction uses sign order. And the length of the signature is related to the renewal fee.    

5. feeRatio (type number, optional, default=1)    
Fee ratio. Do not less than 1.    
    


### `walletSendMany`: srcAddress:string target:{address:string,value:string}[] signSelect:number[] opReturnStr:string feeRatio:number=1 useAllUTXO:boolean changeAddress:string checkFlag:boolean
walletSendMany    
Send to multiple addresses.    
    
Arguments:    

1. srcAddress (type string, required)    
Send address.    

2. target (type Array, required)    
Target address and amount.    
```
Format:
{ address: string, value: string }[]

Example:
[{ "address" : "address1", "value" : "100" }, { "address": "address2", "value" : "100" }]
```

3. signSelect (type number[], optional)    
This transaction is signed using the selected signature. And the length of the signature is related to the renewal fee.    

4. opReturnStr (type string, optional)    
Message    

5. feeRatio (type number, optional, default = 1)    
Fee ratio. Do not less than 1.  

6. useAllUTXO (type boolean, optional)    
Whether to use all the UTXO.    

7. changeAddress (type string, optional)    
Address for change.    

8. checkFlag (type boolean, optional, default = true)    
check Flag. Whether to make the final confirmation.    
    


### `walletASend`: srcAddressList:string[] target:{address:string,value:string}[]} feeRatio:number=1
walletASend
Advanced walletSend.    
    
Arguments:    

1. srcAddress (type string[], required)    
Send address.    
```
Example:
[ "address1", "address2", "address3", ... ]
```

2. target (type object[], required)    
Target address and amount.    
```
Format:
{ address: string, value: string }[]

Example:
[{ "address" : "address1", "value" : "100" }, { "address" : "address2", "value" : "100" }]
```

3. feeRatio (type number, optional, default = 1)    
Fee ratio. Do not less than 1.  
    


### `txAddPqcertRoot`: address:string txRaw?:string
txAddPqcertRoot    
Transaction add pqcert root.    
    
Arguments:    

1. address (type string, required)    
address requires Pqcert.    

2. txRaw (type string, optional)    
Transaction raw.    
    


### `txAddPqcertPubKey`: pubHash:string txRaw?:string
txAddPqcertPubKey    
Adding pqcert public keys to transaction.    
    
Arguments:    

1. pubHash (type string, required)    
pqcert public keys hash.    

2. txRaw (type string, optional)    
Transaction raw.    
    


### `signTx`: address:string signOrder:number[] rawFlag:boolean=true tempFlag:boolean=true autoAddPqcert:boolean=true txRaw?:string
signTx    
sign transaction.    
    
Arguments:    

1. address (type string, required)    
address requires sign.    

2. signOrder(type number[], required)    
This transaction uses sign order. And the length of the signature is related to the renewal fee.    

3. rawFlag (type boolean, optional, default=true)    
Whether the transaction is expressed in raw.    

4. tempFlag (type boolean, optional, default=true)    
Save this transaction raw temporarily.    

5. autoAddPqcert (type boolean, optional, default=true)    
Auto add pqcert.    

6. txRaw (type string, optional)    
Transaction raw.    
    


### `checkSignPqcert`: address: string, signOrder: number[], returnObj: boolean = false
checkSignPqcert    
Verify that the pqcert has been submitted.    
    
Arguments:    

1. address (type string, required)    
address requires sign.    

2. signOrder(type number[], required)    
This transaction uses sign order. And the length of the signature is related to the renewal fee.    

3. returnObj (type boolean, optional, default=false)    
Whether to send back object data.    
    


### `getTxTemp`: rawFlag:boolean=true
getTxTemp    
get Temporary transaction data.    
    
Arguments:    

1. rawFlag (type boolean, optional, default=true)    
Whether the transaction is expressed in raw.    
    


### `sendTxTemp`
sendTxTemp    
Send the temporary transaction data to rpc server.    
    


### `sendTx`: txRaw:string
sendTx    
Send the transaction by raw.    
    
Arguments:    

1. txRaw (type string, required)    
raw of transaction.    
    


### `getLastBlock`: txsFlag:boolean=false rawFlag:boolean=false
getLastBlock    
    
Arguments:    

1. txsFlag (type boolean, optional, default=false)    
Whether to return the transactions.    

2. rawFlag (type boolean, optional, default=false)    
Whether the transaction is expressed in raw.    
    


### `getBlockDataByHash`: hash:string txsFlag:boolean=false rawFlag:boolean=false
getBlockDataByHash  
    
Arguments:    

1. hash (type string, required)    
This block hash.    

2. txsFlag (type boolean, optional, default=false)    
Whether to return the transactions.    

3. rawFlag (type boolean, optional, default=false)    
Whether the transaction is expressed in raw.    
    


### `getBlockDataByHeight`: height:number txsFlag:boolean=false rawFlag:boolean=false
getBlockDataByHeight    
Get the block data by Height.    
    
Arguments:    

1. height (type number, required)    
Want to get height of the block.    

2. txsFlag (type boolean, optional, default=false)    
Whether to return the transactions.    

3. rawFlag (type boolean, optional, default=false)    
Whether the transaction is expressed in raw.    
    


### `getTransactionByTxid`: txid: string, rawFlag?: boolean
getTransactionByTxid    
Get transaction By transaction id.    
    
Arguments:    

1. txid (type string, required)    
Want to get the height of the block.    

2. rawFlag (type boolean, optional, default=false)    
Whether the transaction is expressed in raw.    
    


### `getPqcertByHash`: pqcertHash:string, raw?:boolean
getPqcertByHash    
Get pqcert By pqcert hash.    
    
Arguments:    

1. pqcertHash (type string, required)    

2. rawFlag (type boolean, optional, default=false)    
Whether the transaction is expressed in raw.    
    


### `getTxPoolList`
getTxPoolList    
Get a list of cache and mining transactions.    
    


### `getTxPoolByTxid`: txid:string
getTxPoolByTxid    
Get the transaction in the list of cache and mining transactions with transaction ID.    
    
Arguments:    

1. txid (type string, required)    
Txid of the transaction in the list of cache and mining transactions.    
    


### `newBlock`: block:{hash:string, header:string, txs:string[] }
newBlock    
Add a new block.    
    
Arguments:    

1. block (type object, required)    
Format:    
```
{
    hash:string,
    header:string,
    txs:string[]
}
```
    


### `createTransation`: data:obj replaceLS:boolean=false rawFlag:boolean=false
createTransation    
    
Arguments:    

1. data (type object, required)  
Transation data.    
Format:    
```
{ 
    vin: { 
        txid: string, 
        voutn: number 
    }[][], 
    vout: { 
        address: string, 
        value: string 
    }[], 
    changeAddress: string, 
    opReturn?: string 
}
```

2. replaceLS (type boolean, optional, default=false)    
Automatic replacement of unlock for transaction vin.    

3. rawFlag (type boolean, optional, default=false)    
Whether the transaction is expressed in raw.    
    


### `txValidator`: tx:blockTxJsonData
txValidator    
transaction validator.    
    
Arguments:    

1. tx (type blockTxJsonData, required)  
type blockTxJsonData format:    
```
{
    hash?: string;
    version: number;
    vin: vinJsonData[];
    vout: voutJsonData[];
    pqcert: PQCertJsonData[];
    opReturn: string
    nLockTime: number;
}
```
    


### `addTx`: tx:blockTxJsonData
addTx    
add transaction.    
    
Arguments:    

1. tx (type blockTxJsonData, required)  
type blockTxJsonData format:    
```
{
    hash?: string;
    version: number;
    vin: vinJsonData[];
    vout: voutJsonData[];
    pqcert: PQCertJsonData[];
    opReturn: string
    nLockTime: number;
}
```
    


### `mine`: address:string|false
mine    
start mining or stop mining.    
    
Arguments:    

1. address (type string, required)  
Mining Address. If give 'false' then trun off the miner.    
    


### `getDifficulty`: raw:boolen
getDifficulty    
Get PoW difficulty    
    


### `walletReindex`: startHeight:number
walletReindex    
    
Arguments:    

1. startHeight (type number, required)  
Re-index the starting height of the wallet.    
    


### `walletClearHistory`
walletClearHistory    
Clear wallet history    
    


### `walletAddWatchAddress`: address:string
walletAddWatchAddress    
Need to monitor the address of the wallet.    
    
Arguments:    

1. address (type string, required)  
Monitor the address.    
    


### `walletGetTxList`: address:string limit:number skip:number reverse:boolean
walletGetTxList    
Get transactions for single or multiple addresses    
    
Arguments:    

1. address (type string, required) 
2. limit (type number, default: 20)
3. skip (type number, default: 0)
4. reverse (type boolean, default: true)
    

### `walletGetUTXOList`: address:string limit:number=20 skip:number=0 reverse:boolean=true
walletGetUTXOList    
Get unused transactions for single or multiple addresses.    
    
Arguments:    

1. address (type string, required) 
2. limit (type number, default = 20)
3. skip (type number, default = 0)
4. reverse (type boolean, default = true)
    
