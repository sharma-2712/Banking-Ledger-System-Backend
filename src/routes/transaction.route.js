const {Router}=require('express')
const authMiddleware=require('../middleware/auth.middleware')
const transactionRoute=Router()

const transactionController=require('../controller/transaction.controller')

// POST /api/transaction/

//Create new Transactiom
transactionRoute.post("/",authMiddleware.authMiddleware,transactionController.createTransactions)

// POST /api/transactions/system/initial-funds
//Create initial funds transaction from system Admin

transactionRoute.post("/system/initial-funds",authMiddleware.authSystemUserMiddleware,transactionController.createInitialFundsTransaction)


module.exports=transactionRoute