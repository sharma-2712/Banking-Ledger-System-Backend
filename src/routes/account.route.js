const express=require('express')
const authMiddleware=require('../middleware/auth.middleware')
const accountController=require('../controller/account.controller')

const router=express.Router()

// POST /api/accounts/
// Create a New Account

router.post("/",authMiddleware.authMiddleware,accountController.createAccountController)

module.exports=router