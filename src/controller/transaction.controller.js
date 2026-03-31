const transactionModel=require('../models/transaction.model')
const ledgerModel=require('../models/ledger.model')
const accountModel=require('../models/account.model')

const emailService=require("../services/email.service")

const mongoose=require('mongoose')
/*
* Create a new transaction
>> THE 10-STEP TRANSFER FLOW:
* 1. Validate request
* 2. Validate idempotency key
* 3. Check account status
* 4. Derive sender balance from ledger
* 5. Create transaction (PENDING)
* 6. Create DEBIT ledger entry
* 7. Create CREDIT ledger entry
* 8. Mark transaction COMPLETED
* 9. Commit MongoDB session
* 10. Send email notification
 */



// 1 Validate Request
async function createTransactions(req,res){
    const[fromAccount,toAccount,amount,idempotencyKey]=req.body;

    if(!fromAccount || !toAccount || !amount || !idempotencyKey){
        return res.status(400).json({
            message:"FromAccount,ToAccount,Amount and Idempotency Key are required "
        })
    }

    const fromUserAccount=await accountModel.findOne({
        _id:fromAccount,
    })
    const toUserAccount=await accountModel.findOne({
        _id:toAccount,
    })

    if(!fromUserAccount || !toUserAccount){
        return res.status(400).json({
            message:"Invalid fromAccount or to Account"
        })
    }

    
//2. Validate Idempotency key

const isTransactionAlreadyExists=await transactionModel.findOne({
    idempotencyKey:idempotencyKey
})

if(isTransactionAlreadyExists){
    if(isTransactionAlreadyExists.status=="COMPLETED"){
        return res.status(200).json({
        message:"Transaction Already Completed",
        transaction:isTransactionAlreadyExists
    })
    }
    if(isTransactionAlreadyExists.status=="PENDING"){
        return res.status(200).json({
        message:"Transaction still in  Processing",
    })
    }

    if(isTransactionAlreadyExists.status=="FAILED"){
        return res.status(500).json({
        message:"Transaction processing failed",
    })
    }
    if(isTransactionAlreadyExists.status=="REVERSED"){
        return res.status(200).json({
        message:"Transaction was reversed Please retry again!!",
        transaction:isTransactionAlreadyExists
    })
    }
    }

    //3. Check Account Status
    if(fromUserAccount.status!== 'ACTIVE'|| toUserAccount.status !=='ACTIVE'){
        return res.status(400).json({
            message:"Both fromAccount & toAccount must be ACTIVE to process transaction"
        })
    }

    // 4. Derive Sender balance Ledger

    const balance=await fromUserAccount.getBalance()

    if(balance<amount){
        return res.status(400).json({
            message:`Insufficient balance. Current balance is ${balance}, Requested amount is ${amount}`
        })
    }

    // 5. Create transaction (PENDING)

    const session=await mongoose.startSession()
    session.startTransaction()

    const transaction=await transactionModel.create({
        fromAccount,
        toAccount,
        amount,
        idempotencyKey,
        status:"PENDING"
    },{session})
    const debitLedgerEntry=await ledgerModel.create({
        account:fromAccount,
        amount:amount,
        transaction:transaction._id,
        type:"DEBIT"
    },{session})

    const creditLedgerEntry=await ledgerModel.create({
        account:toAccount,
        amount:amount,
        transaction:transaction._id,
        type:"CREDIT"
    },{session})

    transaction.status="COMPLETED"
    await transaction.save({session})

    await session.commitTransaction()
    session.endSession()

    // *10: Send Email Notification

    await emailService.sendTransactionEmail(req.user.email,req.name,amount,toAccount)

    return res.status(201).json({
        message:"Transaction Completed Successfully",
        transaction:transaction
    })
}


async function createInitialFundsTransaction(req,res){
    const {toAccount,amount,idempotencyKey}=req.body;
    if(!toAccount|| !amount ||!idempotencyKey){
        return res.status(400).json({
            message:"FromAccount,Amount and Idempotency Key are required "
        })
    }

    const toUserAccount=await accountModel.findOne({
        _id:toAccount,
    })
    if(!toUserAccount){
        return res.status(400).json({
            message:"Invalid toAccount"
        })
    }
    const fromUserAccount=await accountModel.findOne({
        user:req.user._id
    }) 
    if(!fromUserAccount){
        return res.status(400).json({
            message:"System User Account Not Found"
        })
    }

    const session=await mongoose.startSession()
    session.startTransaction()

    const transaction=await transactionModel.create({
        fromAccount:fromUserAccount._id,
        toAccount,
        amount,
        idempotencyKey,
        status:"PENDING",

    },{session})
    
    const debitLedgerEntry=await ledgerModel.create({
        account:fromUserAccount._id,
        amount:amount,
        transaction:transaction._id,
        type:"DEBIT"},{session})
    
    const creditLedgerEntry=await ledgerModel.create({
        account:toAccount,
        amount:amount,
        transaction:transaction._id,
        type:"CREDIT"
    },{ session })

    transaction.status="COMPLETED"
    await transaction.save({session})

    await session.commitTransaction()
    session.endSession()

    return res.status(201).json({
        message:"Initial Funds transaction completed successfully",
        transaction:transaction
    })


}
module.exports={createTransactions,createInitialFundsTransaction}

