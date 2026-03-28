const userModel=require('../models/user.model')
const jwt=require('jsonwebtoken')

async function authMiddleware(req,res,next){
    const token=req.cookies.token || req.header.authorization?.split(" ")[1]

    if(!token){
        return res.status(401).json({
            message:"Unauthorized access,token is missing"
        })
    }
    try {
        const decoded=jwt.verify(token,process.env.JWT_SECRET_KEY)
        
         const user = await userModel
        .findById(decoded.userId)
        .select("-password");

        req.user=user
        return next()
        
    } catch (error) {
        return res.status(401).json({
            message:"Unauthorized Access, Token is Invalid"
        })
        
    }
}

module.exports={authMiddleware}