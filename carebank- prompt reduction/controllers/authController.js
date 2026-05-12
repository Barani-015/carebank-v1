// const jwt = require('jsonwebtoken');
// const User = require('../models/User');
// const Subscription = require('../models/Subscription');
// const { PLAN_MAP } = require('../config/plans');
// const Otp = require('../models/Otp'); // Add this line
// const { generateOTP, sendOTPEmail } = require('../services/emailService'); // Add this line

// const register = async (req, res) => {
//   try {
//     const { name, email, password } = req.body;

//     if (!name || !email || !password) {
//       return res.status(400).json({ success: false, message: 'Please provide all fields' });
//     }

//     if (password.length < 6) {
//       return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
//     }

//     const existingUser = await User.findOne({ email });
//     if (existingUser) {
//       return res.status(400).json({ success: false, message: 'Email already registered' });
//     }

//     const user = await User.create({ name, email, password });
    
//     const freePlan = PLAN_MAP.free;
//     await Subscription.create({
//       userId: user._id,
//       planKey: 'free',
//       plan: freePlan.name,
//       price: freePlan.price,
//       billing: freePlan.billing,
//       emoji: freePlan.emoji,
//       isPremium: freePlan.isPremium,
//       startDate: new Date(),
//       endDate: null,
//       status: 'active'
//     });

//     const token = jwt.sign(
//       { id: user._id, email: user.email },
//       process.env.JWT_SECRET || 'your-secret-key',
//       { expiresIn: '7d' }
//     );

//     res.json({
//       success: true,
//       token,
//       user: {
//         id: user._id,
//         name: user.name,
//         email: user.email,
//         createdAt: user.createdAt
//       }
//     });
//   } catch (error) {
//     console.error('Registration error:', error);
//     res.status(500).json({ success: false, message: error.message });
//   }
// };

// const login = async (req, res) => {
//   try {
//     const { email, password } = req.body;

//     if (!email || !password) {
//       return res.status(400).json({ success: false, message: 'Please provide email and password' });
//     }

//     const user = await User.findOne({ email }).select('+password');
//     if (!user) {
//       return res.status(401).json({ success: false, message: 'Invalid credentials' });
//     }

//     const isPasswordValid = await user.comparePassword(password);
//     if (!isPasswordValid) {
//       return res.status(401).json({ success: false, message: 'Invalid credentials' });
//     }

//     const token = jwt.sign(
//       { id: user._id, email: user.email },
//       process.env.JWT_SECRET || 'your-secret-key',
//       { expiresIn: '7d' }
//     );

//     res.json({
//       success: true,
//       token,
//       user: {
//         id: user._id,
//         name: user.name,
//         email: user.email,
//         createdAt: user.createdAt
//       }
//     });
//   } catch (error) {
//     console.error('Login error:', error);
//     res.status(500).json({ success: false, message: 'Server error' });
//   }
// };

// const logout = async (req, res) => {
//   res.json({ success: true, message: 'Logged out successfully' });
// };

// module.exports = { register, login, logout };

























const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const { PLAN_MAP } = require('../config/plans');
const Otp = require('../models/Otp'); // Add this line
const { generateOTP, sendOTPEmail } = require('../services/emailService'); // Add this line

const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide all fields' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    const user = await User.create({ name, email, password });
    
    const freePlan = PLAN_MAP.free;
    await Subscription.create({
      userId: user._id,
      planKey: 'free',
      plan: freePlan.name,
      price: freePlan.price,
      billing: freePlan.billing,
      emoji: freePlan.emoji,
      isPremium: freePlan.isPremium,
      startDate: new Date(),
      endDate: null,
      status: 'active'
    });

    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide email and password' });
    }

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const logout = async (req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
};

// ========== ADD THESE NEW OTP METHODS ==========

const sendOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    // Check if email already registered
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    // Delete any existing OTP for this email
    await Otp.deleteMany({ email: email.toLowerCase() });

    // Generate new OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Save OTP to database
    await Otp.create({
      email: email.toLowerCase(),
      otp: otp,
      expiresAt: expiresAt
    });

    // Send email
    const emailSent = await sendOTPEmail(email, otp);

    if (emailSent) {
      res.json({
        success: true,
        message: 'OTP sent successfully',
        expiry: expiresAt.getTime()
      });
    } else {
      // For development - log OTP to console
      console.log(`\n📧 ===== OTP VERIFICATION =====`);
      console.log(`Email: ${email}`);
      console.log(`OTP Code: ${otp}`);
      console.log(`=============================\n`);
      
      res.json({
        success: true,
        message: 'OTP generated (check server console for code)',
        expiry: expiresAt.getTime(),
        devOtp: process.env.NODE_ENV === 'development' ? otp : undefined
      });
    }
  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({ success: false, message: 'Failed to send OTP' });
  }
};

const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Email and OTP are required' });
    }

    // Find the OTP record
    const otpRecord = await Otp.findOne({
      email: email.toLowerCase(),
      otp: otp,
      expiresAt: { $gt: new Date() },
      verified: false
    });

    if (!otpRecord) {
      // Increment attempts for existing record
      await Otp.updateOne(
        { email: email.toLowerCase(), otp: otp },
        { $inc: { attempts: 1 } }
      );
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
    }

    // Check attempts limit (max 5 attempts)
    if (otpRecord.attempts >= 5) {
      await Otp.deleteOne({ _id: otpRecord._id });
      return res.status(400).json({ success: false, message: 'Too many attempts. Please request a new code.' });
    }

    // Mark as verified
    await Otp.updateOne(
      { _id: otpRecord._id },
      { verified: true }
    );

    // Delete used OTP after verification
    setTimeout(async () => {
      await Otp.deleteOne({ _id: otpRecord._id });
    }, 5000);

    res.json({ success: true, message: 'OTP verified successfully' });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ success: false, message: 'Failed to verify OTP' });
  }
};

module.exports = { register, login, logout, sendOtp, verifyOtp };