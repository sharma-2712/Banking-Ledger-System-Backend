const mongoose=require("mongoose")
const bcrypt=require('bcryptjs')
const userSchema=mongoose.Schema({
    email:{
        type:String,
        required:[true,"Email is required for creating a user"],
        trim:true,
        lowercase:true,
        match:[/.+@.+\..+/, 'Please fill a valid email address'],
        unique:[true,"Email Already Exists"]
    },
    name:{
        type:String,
        required:[true,"Name is required for creating an account"],
    },
    password:{
        type:String,
        required:[true,"Password is required for creating an account"],
        minlength:[6,"Password Should be contain more than 6 characters"],
        select:false
    },
    systemUser:{
        type:Boolean,
        default:false,
        immutable:true,
        select:false
    }

},{
    timestamps:true
})

userSchema.pre("save", async function(){
    if(!this.isModified("password")){
        return 
    }
    const hash =await bcrypt.hash(this.password,10);
    this.password=hash
    return 
})

userSchema.methods.comparePassword=async function(password){
    return await bcrypt.compare(password,this.password);
}

const userModel=mongoose.model("user",userSchema)

module.exports=userModel