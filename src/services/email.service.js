require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    type: 'OAuth2',
    user: process.env.EMAIL_USER,
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    refreshToken: process.env.REFRESH_TOKEN,
  },
});

// Verify the connection configuration
transporter.verify((error) => {
  if (error) {
    console.error('Error connecting to email server:', error);
  } else {
    console.log('Email server is ready to send messages');
  }
});
// Function to send email
const sendEmail = async (to, subject, text, html) => {
  try {
    const info = await transporter.sendMail({
      from: `"Banking Ledger" <${process.env.EMAIL_USER}>`, // sender address
      to, // list of receivers
      subject, // Subject line
      text, // plain text body
      html, // html body
    });

    console.log('Message sent: %s', info.messageId);
    console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
  } catch (error) {
    console.error('Error sending email:', error);
  }
};

async function sendRegistrationEmail(userEmail,name){
    const subject = "Welcome to Banking Ledger System";

    const text = `Hello ${name}, \n\n Thank you for registering at Banking Ledger.
    We're excited to have you on board!\n\n Best Regards , \n The Banking Ledger Team`;

    const html = `
<div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f4f4f4;">
  <div style="max-width: 500px; margin: auto; background: white; padding: 20px; border-radius: 10px;">
    
    <h2 style="color: #2c3e50;">Welcome, ${name} 👋</h2>
    
    <p>Thank you for registering at <strong>Banking Ledger</strong>.</p>
    
    <p>We're excited to have you on board! 🎉</p>
    
    <hr/>
    
    <p style="font-size: 14px; color: gray;">
      If you did not create this account, please ignore this email.
    </p>
    
    <p>Best Regards,<br/><strong>Banking Ledger Team</strong></p>
  
  </div>
</div>
`;
    await sendEmail(userEmail,subject,text,html);

}

async function sendTransactionEmail(userEmail, name, amount, toAccount) {
  const subject = "Transaction Successful ✅";

  const text = `Hello ${name},

Your transaction was successful.

Amount: ₹${amount}
Transfer To: ${toAccount}

Thank you for using Banking Ledger.

Regards,
Banking Ledger Team`;

  const html = `
<div style="font-family: Arial; padding:20px; background:#f4f4f4;">
  <div style="max-width:500px; margin:auto; background:white; padding:20px; border-radius:10px;">
    
    <h2 style="color:green;">Transaction Successful ✅</h2>
    
    <p>Hello <strong>${name}</strong>,</p>
    
    <p>Your money transfer was completed successfully.</p>
    
    <ul>
      <li><strong>Amount:</strong> ₹${amount}</li>
      <li><strong>Transferred To:</strong> ${toAccount}</li>
    </ul>

    <hr/>

    <p style="color:gray; font-size:14px;">
      If this transaction wasn't initiated by you, contact support immediately.
    </p>

    <p><strong>Banking Ledger Team 💙</strong></p>
  </div>
</div>
`;

  await sendEmail(userEmail, subject, text, html);
}

async function sendTransactionFailureEmail(userEmail, name, amount, toAccount) {
  const subject = "Transaction Failed ❌";

  const text = `Hello ${name},

Unfortunately, your transaction failed.

Amount: ₹${amount}
toAccount: ${toAccount}

Please try again or contact support.

Regards,
Banking Ledger Team`;

  const html = `
<div style="font-family: Arial; padding:20px; background:#f4f4f4;">
  <div style="max-width:500px; margin:auto; background:white; padding:20px; border-radius:10px;">
    
    <h2 style="color:red;">Transaction Failed ❌</h2>
    
    <p>Hello <strong>${name}</strong>,</p>
    
    <p>We regret to inform you that your transaction could not be completed.</p>
    
    <ul>
      <li><strong>Amount:</strong> ₹${amount}</li>
      <li><strong>Reason:</strong> ${toAccount}</li>
    </ul>

    <hr/>

    <p>Please try again or contact support.</p>
    
    <p><strong>Banking Ledger Team</strong></p>
  </div>
</div>
`;

  await sendEmail(userEmail, subject, text, html);
}

module.exports = {sendRegistrationEmail,sendTransactionEmail,sendTransactionFailureEmail};