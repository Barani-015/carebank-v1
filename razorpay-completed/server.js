const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config();
const Razorpay = require('razorpay');
const crypto = require('crypto');

const app = express();

// ========== MIDDLEWARE ==========
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// ========== MONGODB MODELS ==========

// User Model
const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, select: false },
  createdAt: { type: Date, default: Date.now },
  // === NEW: Interview data storage ===
  interviewData: { type: Object, default: {} },
  interviewCompletedAt: { type: Date, default: null },
  // === NEW: Caregiver specific fields ===
  role: { type: String, enum: ['caregiver', 'care_recipient', 'family', 'admin'], default: 'caregiver' },
  skills: { type: [String], default: [] },
  certifications: { type: [Object], default: [] },
  availability: { type: Object, default: {} }
}, { timestamps: true });

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);

// Subscription Model
const subscriptionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  planKey: { type: String, enum: ['free', 'monthly', 'yearly'], default: 'free' },
  plan: { type: String, required: true },
  price: { type: Number, required: true },
  originalPrice: { type: Number },
  discountApplied: { type: Number, default: 0 },
  billing: { type: String, required: true },
  emoji: { type: String, required: true },
  isPremium: { type: Boolean, default: false },
  startDate: { type: Date, default: Date.now },
  endDate: { type: Date, default: null },
  status: { type: String, enum: ['active', 'expired', 'cancelled'], default: 'active' },
  couponCode: { type: String, default: null }
}, { timestamps: true });

// Add these to your existing subscriptionSchema
subscriptionSchema.add({
  razorpayOrderId: { type: String },
  razorpayPaymentId: { type: String },
  paymentStatus: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' }
});

subscriptionSchema.index({ userId: 1 });
subscriptionSchema.index({ status: 1 });
subscriptionSchema.index({ endDate: 1 });

const Subscription = mongoose.model('Subscription', subscriptionSchema);

// Transaction Model
const transactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true },
  amount: { type: Number, required: true, min: 0 },
  date: { type: Date, required: true, default: Date.now },
  category: { type: String, required: true },
  type: { type: String, enum: ['credit', 'debit'], required: true },
  status: { type: String, enum: ['success', 'failed', 'pending'], default: 'success' }
}, { timestamps: true });

transactionSchema.index({ userId: 1, date: -1 });
transactionSchema.index({ userId: 1, type: 1 });

const Transaction = mongoose.model('Transaction', transactionSchema);

// Coupon Model
const couponSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  discountPercent: { type: Number, required: true, min: 0, max: 100 },
  maxUses: { type: Number, default: 1, min: 1 },
  usedCount: { type: Number, default: 0 },
  validFrom: { type: Date, default: Date.now },
  validUntil: { type: Date, required: true },
  applicablePlans: { type: [String], enum: ['free', 'monthly', 'yearly'], default: ['monthly', 'yearly'] },
  isActive: { type: Boolean, default: true },
  description: { type: String }
}, { timestamps: true });

couponSchema.index({ code: 1 });
couponSchema.index({ validFrom: 1, validUntil: 1 });
couponSchema.index({ isActive: 1 });

const Coupon = mongoose.model('Coupon', couponSchema);

// Used Coupon Model
const usedCouponSchema = new mongoose.Schema({
  couponId: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription' },
  usedAt: { type: Date, default: Date.now }
}, { timestamps: true });

usedCouponSchema.index({ couponId: 1, userId: 1 }, { unique: true });

const UsedCoupon = mongoose.model('UsedCoupon', usedCouponSchema);


const paymentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  orderId: { type: String, required: true, unique: true },
  paymentId: { type: String },
  signature: { type: String },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  status: { type: String, enum: ['created', 'attempted', 'paid', 'failed'], default: 'created' },
  planKey: { type: String, required: true },
  couponCode: { type: String },
  discountPercent: { type: Number, default: 0 },
  receipt: { type: String },
  notes: { type: Object },
  errorDetails: { type: Object }
}, { timestamps: true });

const Payment = mongoose.model('Payment', paymentSchema);

// ========== PLAN CONFIGURATION ==========
const PLAN_MAP = {
  free: { name: 'Free', price: 0, billing: 'free', emoji: '🌟', isPremium: false, duration: null },
  monthly: { name: 'Pro Monthly', price: 499, billing: 'monthly', emoji: '🚀', isPremium: true, duration: 30 },
  yearly: { name: 'Pro Yearly', price: 4999, billing: 'yearly', emoji: '💎', isPremium: true, duration: 365 }
};


const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_YourTestKeyHere',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'your_secret_here'
});

// ========== AUTH MIDDLEWARE ==========
const auth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

// ========== HEALTH CHECK ==========
app.get('/api/test', (req, res) => {
  res.json({ success: true, message: 'Server is running!', timestamp: new Date().toISOString() });
});

// ========== AUTH ROUTES ==========
app.post('/api/auth/register', async (req, res) => {
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
    
    // Create free subscription
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
});

app.post('/api/auth/login', async (req, res) => {
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
});

app.post('/api/auth/logout', auth, (req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
});

// ========== USER ROUTES ==========
app.get('/api/user/me', auth, async (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      createdAt: req.user.createdAt
    }
  });
});

// ========== SUBSCRIPTION ROUTES ==========
app.get('/api/subscription', auth, async (req, res) => {
  try {
    let subscription = await Subscription.findOne({ userId: req.user._id });
    
    if (!subscription) {
      const freePlan = PLAN_MAP.free;
      subscription = await Subscription.create({
        userId: req.user._id,
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
    }

    res.json({ success: true, subscription });
  } catch (error) {
    console.error('Get subscription error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.put('/api/subscription', auth, async (req, res) => {
  try {
    const { planKey, couponCode, discount } = req.body;
    const plan = PLAN_MAP[planKey];

    if (!plan) {
      return res.status(400).json({ success: false, message: 'Invalid plan' });
    }

    let finalPrice = plan.price;
    let discountApplied = 0;
    let appliedCouponCode = null;
    let couponId = null;

    // Apply coupon if provided
    if (couponCode) {
      const coupon = await Coupon.findOne({ 
        code: couponCode.toUpperCase(),
        isActive: true,
        validFrom: { $lte: new Date() },
        validUntil: { $gte: new Date() }
      });

      if (coupon && coupon.applicablePlans.includes(planKey)) {
        const alreadyUsed = await UsedCoupon.findOne({
          couponId: coupon._id,
          userId: req.user._id
        });

        if (!alreadyUsed && coupon.usedCount < coupon.maxUses) {
          discountApplied = coupon.discountPercent;
          finalPrice = plan.price * (1 - discountApplied / 100);
          appliedCouponCode = coupon.code;
          couponId = coupon._id;
          
          // Increment coupon usage
          coupon.usedCount += 1;
          await coupon.save();
        }
      }
    } else if (discount) {
      discountApplied = discount;
      finalPrice = plan.price * (1 - discount / 100);
    }

    let endDate = null;
    if (plan.duration) {
      endDate = new Date();
      endDate.setDate(endDate.getDate() + plan.duration);
    }

    const subscription = await Subscription.findOneAndUpdate(
      { userId: req.user._id },
      {
        planKey,
        plan: plan.name,
        price: finalPrice,
        originalPrice: plan.price,
        discountApplied,
        billing: plan.billing,
        emoji: plan.emoji,
        isPremium: plan.isPremium,
        startDate: new Date(),
        endDate,
        status: 'active',
        couponCode: appliedCouponCode
      },
      { new: true, upsert: true }
    );

    // Record used coupon if applied
    if (couponId) {
      await UsedCoupon.create({
        couponId,
        userId: req.user._id,
        subscriptionId: subscription._id
      });
    }

    res.json({ success: true, subscription });
  } catch (error) {
    console.error('Update subscription error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


app.post('/api/coupons/validate', auth, async (req, res) => {
  try {
    const { couponCode } = req.body;
    
    if (!couponCode) {
      return res.json({ 
        success: true, 
        valid: false, 
        message: 'Please enter a coupon code' 
      });
    }
    
    console.log(`🔍 Validating coupon: ${couponCode} for user: ${req.user.email}`);
    
    // Find coupon in database
    const coupon = await Coupon.findOne({ 
      code: couponCode.toUpperCase()
    });
    
    if (!coupon) {
      console.log(`❌ Coupon ${couponCode} not found in database`);
      return res.json({ 
        success: true, 
        valid: false, 
        message: 'Invalid coupon code. Please check and try again.' 
      });
    }
    
    console.log(`📋 Found coupon: ${coupon.code}, discount: ${coupon.discountPercent}%, active: ${coupon.isActive}`);
    
    // Check if coupon is active
    if (!coupon.isActive) {
      console.log(`❌ Coupon ${coupon.code} is inactive`);
      return res.json({ 
        success: true, 
        valid: false, 
        message: 'This coupon is no longer active.' 
      });
    }
    
    const now = new Date();
    const validFrom = new Date(coupon.validFrom);
    const validUntil = new Date(coupon.validUntil);
    
    // Check validity period
    if (now < validFrom) {
      const daysUntil = Math.ceil((validFrom - now) / (1000 * 60 * 60 * 24));
      console.log(`❌ Coupon ${coupon.code} not yet valid. Starts in ${daysUntil} days`);
      return res.json({ 
        success: true, 
        valid: false, 
        message: `This coupon is not valid until ${validFrom.toLocaleDateString()}.` 
      });
    }
    
    if (now > validUntil) {
      console.log(`❌ Coupon ${coupon.code} expired on ${validUntil.toLocaleDateString()}`);
      return res.json({ 
        success: true, 
        valid: false, 
        message: `This coupon expired on ${validUntil.toLocaleDateString()}.` 
      });
    }
    
    // Check usage limit
    if (coupon.usedCount >= coupon.maxUses) {
      console.log(`❌ Coupon ${coupon.code} has reached its usage limit (${coupon.maxUses}/${coupon.maxUses})`);
      return res.json({ 
        success: true, 
        valid: false, 
        message: `This coupon has already been used ${coupon.maxUses} times and is no longer available.` 
      });
    }
    
    // Check if user already used this coupon
    const alreadyUsed = await UsedCoupon.findOne({
      couponId: coupon._id,
      userId: req.user._id
    });
    
    if (alreadyUsed) {
      console.log(`❌ User ${req.user.email} has already used coupon ${coupon.code}`);
      return res.json({ 
        success: true, 
        valid: false, 
        message: 'You have already used this coupon. Each coupon can only be used once per account.' 
      });
    }
    
    // Get current subscription to determine which plans are applicable
    const subscription = await Subscription.findOne({ userId: req.user._id });
    let applicablePlans = coupon.applicablePlans || ['monthly', 'yearly'];
    
    // For 100% discount coupons, only allow monthly plan
    if (coupon.discountPercent === 100) {
      applicablePlans = ['monthly'];
    }
    
    console.log(`✅ Coupon ${coupon.code} is valid! ${coupon.discountPercent}% discount on plans: ${applicablePlans.join(', ')}`);
    
    // Return success response with coupon details
    res.json({
      success: true,
      valid: true,
      discount: coupon.discountPercent,
      couponCode: coupon.code,
      message: `🎉 ${coupon.discountPercent}% discount applied! ${coupon.description || ''}`,
      description: coupon.description,
      applicablePlans: applicablePlans,
      remainingUses: coupon.maxUses - coupon.usedCount - 1
    });
    
  } catch (error) {
    console.error('Validate coupon error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while validating coupon. Please try again.' 
    });
  }
});

app.post('/api/coupons/apply', auth, async (req, res) => {
  try {
    const { couponCode, planKey } = req.body;
    
    if (!couponCode || !planKey) {
      return res.status(400).json({ 
        success: false, 
        message: 'Coupon code and plan key are required' 
      });
    }
    
    console.log(`🎫 Applying coupon ${couponCode} to plan ${planKey} for user ${req.user.email}`);
    
    // Find and validate coupon
    const coupon = await Coupon.findOne({ 
      code: couponCode.toUpperCase(),
      isActive: true,
      validFrom: { $lte: new Date() },
      validUntil: { $gte: new Date() }
    });
    
    if (!coupon) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid or expired coupon code' 
      });
    }
    
    // Check if coupon is applicable to this plan
    if (!coupon.applicablePlans.includes(planKey)) {
      return res.status(400).json({ 
        success: false, 
        message: `This coupon is not applicable for the ${planKey} plan` 
      });
    }
    
    // Check usage limit
    if (coupon.usedCount >= coupon.maxUses) {
      return res.status(400).json({ 
        success: false, 
        message: 'This coupon has reached its usage limit' 
      });
    }
    
    // Check if user already used this coupon
    const alreadyUsed = await UsedCoupon.findOne({
      couponId: coupon._id,
      userId: req.user._id
    });
    
    if (alreadyUsed) {
      return res.status(400).json({ 
        success: false, 
        message: 'You have already used this coupon' 
      });
    }
    
    const plan = PLAN_MAP[planKey];
    if (!plan) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid plan selected' 
      });
    }
    
    // Calculate discounted price
    const originalPrice = plan.price;
    const discountAmount = (originalPrice * coupon.discountPercent) / 100;
    const finalPrice = Math.max(0, originalPrice - discountAmount);
    
    // Calculate end date
    let endDate = null;
    if (plan.duration) {
      endDate = new Date();
      endDate.setDate(endDate.getDate() + plan.duration);
    }
    
    // Update or create subscription
    const subscription = await Subscription.findOneAndUpdate(
      { userId: req.user._id },
      {
        planKey,
        plan: plan.name,
        price: finalPrice,
        originalPrice: originalPrice,
        discountApplied: coupon.discountPercent,
        billing: plan.billing,
        emoji: plan.emoji,
        isPremium: plan.isPremium,
        startDate: new Date(),
        endDate,
        status: 'active',
        couponCode: coupon.code
      },
      { new: true, upsert: true }
    );
    
    // Record coupon usage
    await UsedCoupon.create({
      couponId: coupon._id,
      userId: req.user._id,
      subscriptionId: subscription._id
    });
    
    // Increment coupon usage count
    coupon.usedCount += 1;
    await coupon.save();
    
    console.log(`✅ Coupon ${coupon.code} applied successfully! New price: ₹${finalPrice} (was ₹${originalPrice})`);
    
    res.json({
      success: true,
      message: `Coupon applied! You saved ${coupon.discountPercent}% (₹${discountAmount.toLocaleString()})`,
      subscription,
      discount: {
        percent: coupon.discountPercent,
        amount: discountAmount,
        originalPrice,
        finalPrice
      }
    });
    
  } catch (error) {
    console.error('Apply coupon error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while applying coupon' 
    });
  }
});

app.get('/api/coupons/available', auth, async (req, res) => {
  try {
    const now = new Date();
    
    // Get all active coupons
    const coupons = await Coupon.find({ 
      isActive: true,
      validFrom: { $lte: now },
      validUntil: { $gte: now }
    });
    
    // Get coupons already used by user
    const usedCoupons = await UsedCoupon.find({ 
      userId: req.user._id 
    }).select('couponId');
    
    const usedCouponIds = usedCoupons.map(uc => uc.couponId.toString());
    
    // Filter available coupons
    const availableCoupons = coupons.filter(coupon => {
      // Check if user already used this coupon
      if (usedCouponIds.includes(coupon._id.toString())) {
        return false;
      }
      // Check if coupon has remaining uses
      if (coupon.usedCount >= coupon.maxUses) {
        return false;
      }
      return true;
    });
    
    res.json({
      success: true,
      coupons: availableCoupons.map(c => ({
        id: c._id,
        code: c.code,
        discount: c.discountPercent,
        description: c.description,
        applicablePlans: c.applicablePlans,
        validUntil: c.validUntil,
        remainingUses: c.maxUses - c.usedCount
      }))
    });
    
  } catch (error) {
    console.error('Get available coupons error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});



// List all active coupons
app.get('/api/coupons/list', auth, async (req, res) => {
  try {
    const coupons = await Coupon.find({ 
      isActive: true,
      validUntil: { $gte: new Date() }
    }).select('code discountPercent maxUses usedCount validUntil applicablePlans description');
    
    res.json({ 
      success: true, 
      coupons: coupons.map(c => ({
        code: c.code,
        discount: c.discountPercent,
        usesLeft: c.maxUses - c.usedCount,
        validUntil: c.validUntil,
        applicablePlans: c.applicablePlans,
        description: c.description
      }))
    });
  } catch (error) {
    console.error('List coupons error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});



app.post('/api/coupons/create', auth, async (req, res) => {
  try {
    // Optional: Add admin check here
    // if (!req.user.isAdmin) return res.status(403).json({ success: false, message: 'Admin only' });
    
    const { code, discountPercent, maxUses, validUntil, applicablePlans, description } = req.body;
    
    if (!code || !discountPercent || !validUntil) {
      return res.status(400).json({ 
        success: false, 
        message: 'Code, discount percent, and valid until date are required' 
      });
    }
    
    // Check if coupon already exists
    const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() });
    if (existingCoupon) {
      return res.status(400).json({ 
        success: false, 
        message: 'Coupon code already exists' 
      });
    }
    
    const coupon = await Coupon.create({
      code: code.toUpperCase(),
      discountPercent,
      maxUses: maxUses || 1,
      validFrom: new Date(),
      validUntil: new Date(validUntil),
      applicablePlans: applicablePlans || ['monthly', 'yearly'],
      isActive: true,
      description: description || `${discountPercent}% discount coupon`
    });
    
    console.log(`✅ New coupon created: ${coupon.code} (${discountPercent}% off)`);
    
    res.json({
      success: true,
      message: 'Coupon created successfully',
      coupon
    });
    
  } catch (error) {
    console.error('Create coupon error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});


app.get('/api/coupons/debug/all', auth, async (req, res) => {
  try {
    const coupons = await Coupon.find({});
    const now = new Date();
    
    const couponDetails = coupons.map(c => ({
      code: c.code,
      discountPercent: c.discountPercent,
      isActive: c.isActive,
      usedCount: c.usedCount,
      maxUses: c.maxUses,
      validFrom: c.validFrom,
      validUntil: c.validUntil,
      isValidNow: c.isActive && 
                   c.validFrom <= now && 
                   c.validUntil >= now &&
                   c.usedCount < c.maxUses,
      applicablePlans: c.applicablePlans,
      description: c.description
    }));
    
    res.json({
      success: true,
      currentTime: now.toISOString(),
      coupons: couponDetails
    });
    
  } catch (error) {
    console.error('Debug coupons error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});

// Get user's used coupons
app.get('/api/coupons/user', auth, async (req, res) => {
  try {
    const usedCoupons = await UsedCoupon.find({ userId: req.user._id })
      .populate('couponId')
      .sort({ usedAt: -1 });
    
    res.json({ success: true, usedCoupons });
  } catch (error) {
    console.error('Get user coupons error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ========== TRANSACTION ROUTES ==========
app.get('/api/transactions', auth, async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    
    const transactions = await Transaction.find({ userId: req.user._id })
      .sort({ date: -1 })
      .skip(parseInt(offset))
      .limit(parseInt(limit));
    
    const total = await Transaction.countDocuments({ userId: req.user._id });
    
    res.json({ 
      success: true, 
      transactions,
      total,
      page: Math.floor(offset / limit) + 1,
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/api/transactions/import', auth, async (req, res) => {
  try {
    const { transactions } = req.body;
    
    const importedTransactions = [];
    for (const tx of transactions) {
      const transaction = await Transaction.create({
        userId: req.user._id,
        name: tx.name,
        amount: tx.amount,
        date: new Date(tx.date),
        category: tx.category,
        type: tx.type,
        status: tx.status
      });
      importedTransactions.push(transaction);
    }
    
    res.json({
      success: true,
      transactions: importedTransactions,
      importedCount: importedTransactions.length
    });
  } catch (error) {
    console.error('Import transactions error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/api/transactions', auth, async (req, res) => {
  try {
    const transaction = await Transaction.create({
      userId: req.user._id,
      ...req.body
    });
    res.json({ success: true, transaction });
  } catch (error) {
    console.error('Create transaction error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ========== ANALYTICS ROUTES ==========
app.get('/api/analytics/dashboard', auth, async (req, res) => {
  try {
    const transactions = await Transaction.find({ userId: req.user._id });
    
    let balance = 0, spending = 0, income = 0;
    
    transactions.forEach(tx => {
      if (tx.type === 'credit') {
        balance += tx.amount;
        income += tx.amount;
      } else {
        balance -= tx.amount;
        spending += tx.amount;
      }
    });
    
    const savingsRate = income > 0 ? Math.round((income - spending) / income * 100) : 0;
    
    res.json({
      success: true,
      balance,
      spending,
      income,
      savingsRate
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.get('/api/analytics/spending-by-category', auth, async (req, res) => {
  try {
    const transactions = await Transaction.aggregate([
      { $match: { userId: req.user._id, type: 'debit' } },
      { $group: { _id: '$category', total: { $sum: '$amount' } } },
      { $sort: { total: -1 } }
    ]);
    
    const categories = transactions.map(t => t._id);
    const amounts = transactions.map(t => t.total);
    
    res.json({ success: true, categories, amounts });
  } catch (error) {
    console.error('Spending by category error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


// ========== DATABASE INITIALIZATION ==========
const initializeDatabase = async () => {
  try {
    // Check if coupons exist
    const couponCount = await Coupon.countDocuments();
    if (couponCount === 0) {
      console.log('📝 Creating default coupons...');
      
      const defaultCoupons = [
        {
          code: "WELCOME50",
          discountPercent: 100,
          maxUses: 50,
          usedCount: 0,
          validFrom: new Date("2024-01-01"),
          validUntil: new Date("2025-12-31"),
          applicablePlans: ["monthly"],
          isActive: true,
          description: "Get Monthly Plan FREE! 🎉"
        },
        {
          code: "SAVE50",
          discountPercent: 50,
          maxUses: 30,
          usedCount: 0,
          validFrom: new Date("2024-01-01"),
          validUntil: new Date("2025-12-31"),
          applicablePlans: ["monthly", "yearly"],
          isActive: true,
          description: "50% off on any Pro plan"
        },
        {
          code: "FREEBIE",
          discountPercent: 100,
          maxUses: 20,
          usedCount: 0,
          validFrom: new Date("2024-01-01"),
          validUntil: new Date("2025-12-31"),
          applicablePlans: ["monthly"],
          isActive: true,
          description: "Free Monthly Plan - Limited time!"
        },
        {
          code: "YEARLY30",
          discountPercent: 30,
          maxUses: 100,
          usedCount: 0,
          validFrom: new Date("2024-01-01"),
          validUntil: new Date("2025-12-31"),
          applicablePlans: ["yearly"],
          isActive: true,
          description: "30% off on Yearly Plan"
        },
        {
          code: "SUMMER20",
          discountPercent: 20,
          maxUses: 50,
          usedCount: 0,
          validFrom: new Date("2024-06-01"),
          validUntil: new Date("2024-08-31"),
          applicablePlans: ["monthly", "yearly"],
          isActive: true,
          description: "20% Summer Discount"
        },
        {
          code: "DEMO2024",
          discountPercent: 100,
          maxUses: 999,
          usedCount: 0,
          validFrom: new Date("2024-01-01"),
          validUntil: new Date("2025-12-31"),
          applicablePlans: ["monthly"],
          isActive: true,
          description: "Demo coupon - Get Pro Monthly for FREE!"
        }
      ];
      
      // Clear existing coupons
      await Coupon.deleteMany({});
      
      // Insert new coupons
      const result = await Coupon.insertMany(defaultCoupons);
      console.log(`✅ Created ${result.length} coupons`);
      
      // Log all created coupons
      result.forEach(coupon => {
        console.log(`   📌 ${coupon.code}: ${coupon.discountPercent}% off - ${coupon.description}`);
      });
    } else {
      console.log(`📋 Found ${couponCount} existing coupons in database`);
      
      // Show active coupons
      const activeCoupons = await Coupon.find({ 
        isActive: true, 
        validUntil: { $gte: new Date() } 
      });
      
      if (activeCoupons.length > 0) {
        console.log('\n🎫 Active Coupons:');
        activeCoupons.forEach(coupon => {
          console.log(`   📌 ${coupon.code}: ${coupon.discountPercent}% off (${coupon.maxUses - coupon.usedCount} uses left) - ${coupon.description}`);
        });
      }
    }
    
    // Create demo user if not exists
    const demoUser = await User.findOne({ email: 'demo@carebank.com' });
    if (!demoUser) {
      console.log('📝 Creating demo user...');
      
      const user = await User.create({
        name: 'Demo User',
        email: 'demo@carebank.com',
        password: 'demo123'
      });
      
      const demoTransactions = [
        { name: 'Salary Credit', amount: 45000, date: new Date('2024-03-15'), category: 'Income', type: 'credit', status: 'success' },
        { name: 'Swiggy', amount: 342, date: new Date('2024-03-14'), category: 'Food', type: 'debit', status: 'success' },
        { name: 'Amazon.in', amount: 1499, date: new Date('2024-03-13'), category: 'Shopping', type: 'debit', status: 'failed' },
        { name: 'Zomato', amount: 567, date: new Date('2024-03-12'), category: 'Food', type: 'debit', status: 'success' },
        { name: 'Uber', amount: 180, date: new Date('2024-03-11'), category: 'Transport', type: 'debit', status: 'success' },
        { name: 'Netflix', amount: 499, date: new Date('2024-03-10'), category: 'Entertainment', type: 'debit', status: 'success' },
        { name: 'Electricity Bill', amount: 1200, date: new Date('2024-03-09'), category: 'Utilities', type: 'debit', status: 'success' },
        { name: 'Refund', amount: 800, date: new Date('2024-03-08'), category: 'Income', type: 'credit', status: 'success' }
      ];
      
      for (const tx of demoTransactions) {
        await Transaction.create({ userId: user._id, ...tx });
      }
      
      await Subscription.create({
        userId: user._id,
        planKey: 'free',
        plan: 'Free',
        price: 0,
        billing: 'free',
        emoji: '🌟',
        isPremium: false,
        startDate: new Date(),
        endDate: null,
        status: 'active'
      });
      
      console.log('✅ Demo user created: demo@carebank.com / demo123');
    }
    
  } catch (error) {
    console.error('Database initialization error:', error);
  }
};




// ========== RAZORPAY PAYMENT ROUTES (Add AFTER auth middleware, BEFORE error handling) ==========

// 1. Get Razorpay Key
app.get('/api/payments/razorpay-key', auth, (req, res) => {
  try {
    res.json({
      success: true,
      key: process.env.RAZORPAY_KEY_ID || 'rzp_test_YourTestKeyHere'
    });
  } catch (error) {
    console.error('Error getting Razorpay key:', error);
    res.status(500).json({ success: false, message: 'Failed to get payment key' });
  }
});

// 2. Alternative endpoint for Razorpay key (frontend uses both)
app.get('/api/payments/key', auth, (req, res) => {
  try {
    res.json({
      success: true,
      key: process.env.RAZORPAY_KEY_ID || 'rzp_test_YourTestKeyHere'
    });
  } catch (error) {
    console.error('Error getting Razorpay key:', error);
    res.status(500).json({ success: false, message: 'Failed to get payment key' });
  }
});

// 3. Create Razorpay Order
app.post('/api/payments/create-order', auth, async (req, res) => {
  try {
    const { planKey, couponCode, discountPercent } = req.body;
    
    console.log(`📝 Creating order for user: ${req.user.email}, Plan: ${planKey}`);
    
    const plan = PLAN_MAP[planKey];
    if (!plan) {
      return res.status(400).json({ success: false, message: 'Invalid plan' });
    }
    
    let amount = plan.price;
    let discount = 0;
    let appliedCoupon = null;
    
    // Apply coupon if provided
    if (couponCode) {
      const coupon = await Coupon.findOne({ 
        code: couponCode.toUpperCase(),
        isActive: true,
        validFrom: { $lte: new Date() },
        validUntil: { $gte: new Date() }
      });
      
      if (coupon && coupon.applicablePlans.includes(planKey)) {
        const alreadyUsed = await UsedCoupon.findOne({
          couponId: coupon._id,
          userId: req.user._id
        });
        
        if (!alreadyUsed && coupon.usedCount < coupon.maxUses) {
          discount = coupon.discountPercent;
          amount = plan.price * (1 - discount / 100);
          appliedCoupon = coupon;
          console.log(`🎫 Coupon applied: ${couponCode} - ${discount}% off`);
        }
      }
    } else if (discountPercent) {
      discount = discountPercent;
      amount = plan.price * (1 - discount / 100);
    }
    
    // Round to 2 decimal places and convert to paise
    amount = Math.round(amount * 100) / 100;
    const amountInPaise = Math.round(amount * 100);
    
    // Create a short receipt (under 40 chars as required by Razorpay)
    const timestamp = Date.now().toString().slice(-10);
    const shortUserId = req.user._id.toString().slice(-6);
    const receipt = `rcpt_${shortUserId}_${timestamp}`;
    
    console.log(`💰 Order details: ₹${amount} (${amountInPaise} paise) - Receipt: ${receipt}`);
    
    // Create Razorpay order
    const options = {
      amount: amountInPaise,
      currency: 'INR',
      receipt: receipt,
      notes: {
        userId: req.user._id.toString(),
        planKey: planKey,
        planName: plan.name,
        couponCode: couponCode || 'none',
        discountPercent: discount.toString(),
        userEmail: req.user.email
      }
    };
    
    const order = await razorpay.orders.create(options);
    
    // Save payment record
    const payment = new Payment({
      userId: req.user._id,
      orderId: order.id,
      amount: amount,
      currency: order.currency,
      status: 'created',
      planKey: planKey,
      couponCode: couponCode,
      discountPercent: discount,
      receipt: receipt,
      notes: options.notes
    });
    await payment.save();
    
    console.log(`✅ Razorpay order created successfully: ${order.id}`);
    
    res.json({
      success: true,
      orderId: order.id,
      amount: amountInPaise,
      currency: order.currency,
      amountDecimal: amount,
      discount: discount
    });
    
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.error?.description || 'Failed to create payment order. Please try again.' 
    });
  }
});

// 4. Verify Razorpay Payment
app.post('/api/payments/verify', auth, async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      planKey,
      couponCode,
      discountPercent
    } = req.body;
    
    console.log(`🔐 Verifying payment for order: ${razorpay_order_id}`);
    
    // Verify signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");
    
    const isAuthentic = expectedSignature === razorpay_signature;
    
    if (!isAuthentic) {
      console.log(`❌ Signature verification failed for order: ${razorpay_order_id}`);
      
      await Payment.findOneAndUpdate(
        { orderId: razorpay_order_id },
        { 
          status: 'failed',
          errorDetails: { message: 'Signature verification failed' }
        }
      );
      
      return res.status(400).json({ 
        success: false, 
        message: 'Payment verification failed - Invalid signature' 
      });
    }
    
    console.log(`✅ Signature verified for order: ${razorpay_order_id}`);
    
    // Get payment record
    const payment = await Payment.findOne({ orderId: razorpay_order_id });
    if (!payment) {
      console.log(`❌ Payment record not found for order: ${razorpay_order_id}`);
      return res.status(404).json({ 
        success: false, 
        message: 'Payment record not found' 
      });
    }
    
    // Update payment status
    payment.paymentId = razorpay_payment_id;
    payment.signature = razorpay_signature;
    payment.status = 'paid';
    await payment.save();
    
    console.log(`💾 Payment record updated: ${razorpay_payment_id}`);
    
    // Get the plan
    const targetPlanKey = planKey || payment.planKey;
    const plan = PLAN_MAP[targetPlanKey];
    if (!plan) {
      return res.status(400).json({ success: false, message: 'Invalid plan' });
    }
    
    // Calculate end date
    let endDate = null;
    if (plan.duration) {
      endDate = new Date();
      endDate.setDate(endDate.getDate() + plan.duration);
    }
    
    // Update subscription
    const discountPct = payment.discountPercent || discountPercent || 0;
    const finalPrice = plan.price * (1 - discountPct / 100);
    
    let subscription = await Subscription.findOne({ userId: req.user._id });
    
    if (subscription) {
      subscription.planKey = targetPlanKey;
      subscription.plan = plan.name;
      subscription.price = finalPrice;
      subscription.originalPrice = plan.price;
      subscription.discountApplied = discountPct;
      subscription.billing = plan.billing;
      subscription.emoji = plan.emoji;
      subscription.isPremium = plan.isPremium;
      subscription.startDate = new Date();
      subscription.endDate = endDate;
      subscription.status = 'active';
      subscription.couponCode = couponCode || payment.couponCode;
      subscription.razorpayOrderId = razorpay_order_id;
      subscription.razorpayPaymentId = razorpay_payment_id;
      subscription.paymentStatus = 'completed';
      await subscription.save();
      console.log(`📋 Subscription updated for user: ${req.user.email}`);
    } else {
      subscription = await Subscription.create({
        userId: req.user._id,
        planKey: targetPlanKey,
        plan: plan.name,
        price: finalPrice,
        originalPrice: plan.price,
        discountApplied: discountPct,
        billing: plan.billing,
        emoji: plan.emoji,
        isPremium: plan.isPremium,
        startDate: new Date(),
        endDate: endDate,
        status: 'active',
        couponCode: couponCode || payment.couponCode,
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        paymentStatus: 'completed'
      });
      console.log(`📋 New subscription created for user: ${req.user.email}`);
    }
    
    // Create transaction record
    await Transaction.create({
      userId: req.user._id,
      name: `${plan.name} Subscription`,
      amount: finalPrice,
      date: new Date(),
      category: 'Subscription',
      type: 'debit',
      status: 'success',
      razorpayPaymentId: razorpay_payment_id,
      razorpayOrderId: razorpay_order_id
    });
    
    console.log(`💰 Transaction record created for ₹${finalPrice}`);
    
    // Mark coupon as used if applicable
    const usedCouponCode = couponCode || payment.couponCode;
    if (usedCouponCode) {
      const coupon = await Coupon.findOne({ code: usedCouponCode.toUpperCase() });
      if (coupon) {
        const alreadyUsed = await UsedCoupon.findOne({ 
          couponId: coupon._id, 
          userId: req.user._id 
        });
        
        if (!alreadyUsed) {
          await UsedCoupon.create({
            couponId: coupon._id,
            userId: req.user._id,
            subscriptionId: subscription._id
          });
          
          // Increment coupon usage count
          coupon.usedCount += 1;
          await coupon.save();
          console.log(`🎫 Coupon ${coupon.code} marked as used (${coupon.usedCount}/${coupon.maxUses})`);
        }
      }
    }
    
    console.log(`🎉 Payment verified and subscription activated for ${req.user.email}: ${plan.name}`);
    
    res.json({
      success: true,
      message: 'Payment verified successfully! Subscription activated.',
      subscription: {
        planKey: subscription.planKey,
        plan: subscription.plan,
        name: subscription.plan,
        price: subscription.price,
        emoji: subscription.emoji,
        isPremium: subscription.isPremium,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        billing: subscription.billing
      }
    });
    
  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Payment verification failed: ' + error.message 
    });
  }
});

// 5. Get Payment Status
app.get('/api/payments/status/:orderId', auth, async (req, res) => {
  try {
    const { orderId } = req.params;
    
    const payment = await Payment.findOne({ orderId: orderId, userId: req.user._id });
    if (!payment) {
      return res.status(404).json({ 
        success: false, 
        message: 'Payment not found' 
      });
    }
    
    res.json({
      success: true,
      status: payment.status,
      paymentId: payment.paymentId,
      amount: payment.amount,
      planKey: payment.planKey,
      createdAt: payment.createdAt
    });
    
  } catch (error) {
    console.error('Get payment status error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get payment status' 
    });
  }
});

// 6. Get Payment History
app.get('/api/payments/history', auth, async (req, res) => {
  try {
    const payments = await Payment.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(20);
    
    res.json({
      success: true,
      payments: payments.map(p => ({
        orderId: p.orderId,
        paymentId: p.paymentId,
        amount: p.amount,
        status: p.status,
        planKey: p.planKey,
        createdAt: p.createdAt
      }))
    });
    
  } catch (error) {
    console.error('Get payment history error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get payment history' 
    });
  }
});

// 7. Webhook for Razorpay (Optional - for automatic payment confirmation)
app.post('/api/payments/webhook', async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers['x-razorpay-signature'];
    
    // Verify webhook signature
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(JSON.stringify(req.body))
      .digest('hex');
    
    if (signature !== expectedSignature) {
      return res.status(400).json({ success: false, message: 'Invalid signature' });
    }
    
    const { event, payload } = req.body;
    
    if (event === 'payment.captured') {
      const paymentEntity = payload.payment.entity;
      const orderId = paymentEntity.order_id;
      const paymentId = paymentEntity.id;
      
      console.log(`📡 Webhook: Payment captured for order ${orderId}`);
      
      // Find and update payment
      const payment = await Payment.findOne({ orderId: orderId });
      if (payment && payment.status !== 'paid') {
        payment.status = 'paid';
        payment.paymentId = paymentId;
        await payment.save();
        
        // Activate subscription
        const plan = PLAN_MAP[payment.planKey];
        if (plan) {
          let endDate = null;
          if (plan.duration) {
            endDate = new Date();
            endDate.setDate(endDate.getDate() + plan.duration);
          }
          
          await Subscription.findOneAndUpdate(
            { userId: payment.userId },
            {
              planKey: payment.planKey,
              plan: plan.name,
              price: payment.amount,
              originalPrice: plan.price,
              discountApplied: payment.discountPercent,
              billing: plan.billing,
              emoji: plan.emoji,
              isPremium: plan.isPremium,
              startDate: new Date(),
              endDate: endDate,
              status: 'active',
              couponCode: payment.couponCode,
              razorpayOrderId: orderId,
              razorpayPaymentId: paymentId,
              paymentStatus: 'completed'
            },
            { upsert: true }
          );
          
          console.log(`✅ Webhook: Subscription activated for user ${payment.userId}`);
        }
      }
    }
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ success: false, message: 'Webhook processing failed' });
  }
});

console.log('✅ Razorpay payment routes initialized');




// ========== ERROR HANDLING MIDDLEWARE ==========
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).json({ success: false, message: 'Something went wrong!' });
});



// ========== AI AGENT INTERVIEW QUESTIONS API ==========
const fs = require('fs');
// const path = require('path');

// Path to your questions file
const questionsPath = path.join(__dirname, 'backend-data', 'care-bank-questions.json');

// Load questions on server start
let interviewQuestions = [];
try {
  const questionsData = fs.readFileSync(questionsPath, 'utf8');
  interviewQuestions = JSON.parse(questionsData);
  console.log(`✅ Loaded ${interviewQuestions.length} interview questions`);
} catch (err) {
  console.error('❌ Error loading interview questions:', err.message);
  // Fallback empty array
  interviewQuestions = [];
}

// GET endpoint to fetch all interview questions
app.get('/api/ai/interview/questions', auth, (req, res) => {
  res.json({
    success: true,
    count: interviewQuestions.length,
    questions: interviewQuestions
  });
});

// GET endpoint to fetch questions by category
app.get('/api/ai/interview/category/:category', auth, (req, res) => {
  const { category } = req.params;
  const filtered = interviewQuestions.filter(q => 
    q.category?.toLowerCase() === category.toLowerCase()
  );
  res.json({
    success: true,
    count: filtered.length,
    category,
    questions: filtered
  });
});

// POST endpoint to submit interview answers
app.post('/api/ai/interview/submit', auth, async (req, res) => {
  try {
    const { answers } = req.body; // Expecting { questionId: answer, ... }
    
    // Store answers in user profile (you'll need to add this field to User schema)
    // Option 1: Add interviewData field to User model
    await User.findByIdAndUpdate(req.user._id, {
      $set: { interviewData: answers, interviewCompletedAt: new Date() }
    });
    
    res.json({
      success: true,
      message: 'Interview responses saved successfully',
      completedAt: new Date()
    });
  } catch (error) {
    console.error('Error saving interview:', error);
    res.status(500).json({ success: false, message: 'Failed to save responses' });
  }
});

// GET user's interview data
app.get('/api/user/interview-data', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('interviewData interviewCompletedAt role skills certifications');
    res.json({
      success: true,
      hasCompleted: !!user.interviewCompletedAt,
      data: user.interviewData,
      role: user.role,
      skills: user.skills,
      certifications: user.certifications
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ========== START SERVER ==========
const PORT = process.env.PORT || 3000;

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/carebank', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(async () => {
  console.log('✅ MongoDB Connected to carebank database');
  await initializeDatabase();
  
  app.listen(PORT, () => {
    console.log(`\n🚀 Server running on http://localhost:${PORT}`);
    console.log(`📡 Test endpoint: http://localhost:${PORT}/api/test`);
    console.log(`🔐 Login: POST http://localhost:${PORT}/api/auth/login`);
    console.log(`🎫 Coupon validation: POST http://localhost:${PORT}/api/coupons/validate`);
    console.log(`📋 List coupons: GET http://localhost:${PORT}/api/coupons/list\n`);
  });
})
.catch(err => {
  console.error('❌ MongoDB Connection Error:', err);
  process.exit(1);
});