const nodemailer = require('nodemailer');

// Configure email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail', // or 'smtp.gmail.com'
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Generate 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Send OTP email
const sendOTPEmail = async (email, otp) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 500px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; padding: 20px; background: linear-gradient(135deg, #7c6af7, #a78bfa); border-radius: 12px; color: white; }
        .otp-code { font-size: 36px; font-weight: bold; text-align: center; padding: 20px; letter-spacing: 8px; background: #f1f3f5; border-radius: 12px; margin: 20px 0; }
        .footer { text-align: center; font-size: 12px; color: #666; margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>🔐 CareBank Email Verification</h2>
        </div>
        <p>Hello,</p>
        <p>We received a request to verify your email address. Use the verification code below to complete your registration:</p>
        <div class="otp-code">${otp}</div>
        <p>This code will expire in <strong>5 minutes</strong>.</p>
        <p>If you didn't request this, please ignore this email.</p>
        <div class="footer">
          <p>Stay secure with CareBank — Your Autonomous Financial AI</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const mailOptions = {
    from: `"CareBank" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'CareBank - Your Verification Code',
    html: html
  };

  try {
    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Email send error:', error);
    return false;
  }
};

module.exports = { generateOTP, sendOTPEmail };