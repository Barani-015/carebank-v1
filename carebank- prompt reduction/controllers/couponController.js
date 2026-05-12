const Coupon = require('../models/Coupon');
const UsedCoupon = require('../models/UsedCoupon');
const Subscription = require('../models/Subscription');
const { PLAN_MAP } = require('../config/plans');

const validateCoupon = async (req, res) => {
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
    
    const coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });
    
    if (!coupon) {
      return res.json({ 
        success: true, 
        valid: false, 
        message: 'Invalid coupon code. Please check and try again.' 
      });
    }
    
    if (!coupon.isActive) {
      return res.json({ 
        success: true, 
        valid: false, 
        message: 'This coupon is no longer active.' 
      });
    }
    
    const now = new Date();
    const validFrom = new Date(coupon.validFrom);
    const validUntil = new Date(coupon.validUntil);
    
    if (now < validFrom) {
      return res.json({ 
        success: true, 
        valid: false, 
        message: `This coupon is not valid until ${validFrom.toLocaleDateString()}.` 
      });
    }
    
    if (now > validUntil) {
      return res.json({ 
        success: true, 
        valid: false, 
        message: `This coupon expired on ${validUntil.toLocaleDateString()}.` 
      });
    }
    
    if (coupon.usedCount >= coupon.maxUses) {
      return res.json({ 
        success: true, 
        valid: false, 
        message: `This coupon has already been used ${coupon.maxUses} times and is no longer available.` 
      });
    }
    
    const alreadyUsed = await UsedCoupon.findOne({
      couponId: coupon._id,
      userId: req.user._id
    });
    
    if (alreadyUsed) {
      return res.json({ 
        success: true, 
        valid: false, 
        message: 'You have already used this coupon. Each coupon can only be used once per account.' 
      });
    }
    
    let applicablePlans = coupon.applicablePlans || ['monthly', 'yearly'];
    
    if (coupon.discountPercent === 100) {
      applicablePlans = ['monthly'];
    }
    
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
};

const applyCoupon = async (req, res) => {
  try {
    const { couponCode, planKey } = req.body;
    
    if (!couponCode || !planKey) {
      return res.status(400).json({ 
        success: false, 
        message: 'Coupon code and plan key are required' 
      });
    }
    
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
    
    if (!coupon.applicablePlans.includes(planKey)) {
      return res.status(400).json({ 
        success: false, 
        message: `This coupon is not applicable for the ${planKey} plan` 
      });
    }
    
    if (coupon.usedCount >= coupon.maxUses) {
      return res.status(400).json({ 
        success: false, 
        message: 'This coupon has reached its usage limit' 
      });
    }
    
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
    
    const originalPrice = plan.price;
    const discountAmount = (originalPrice * coupon.discountPercent) / 100;
    const finalPrice = Math.max(0, originalPrice - discountAmount);
    
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
    
    await UsedCoupon.create({
      couponId: coupon._id,
      userId: req.user._id,
      subscriptionId: subscription._id
    });
    
    coupon.usedCount += 1;
    await coupon.save();
    
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
};

const getAvailableCoupons = async (req, res) => {
  try {
    const now = new Date();
    
    const coupons = await Coupon.find({ 
      isActive: true,
      validFrom: { $lte: now },
      validUntil: { $gte: now }
    });
    
    const usedCoupons = await UsedCoupon.find({ 
      userId: req.user._id 
    }).select('couponId');
    
    const usedCouponIds = usedCoupons.map(uc => uc.couponId.toString());
    
    const availableCoupons = coupons.filter(coupon => {
      if (usedCouponIds.includes(coupon._id.toString())) return false;
      if (coupon.usedCount >= coupon.maxUses) return false;
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
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const listCoupons = async (req, res) => {
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
};

const createCoupon = async (req, res) => {
  try {
    const { code, discountPercent, maxUses, validUntil, applicablePlans, description } = req.body;
    
    if (!code || !discountPercent || !validUntil) {
      return res.status(400).json({ 
        success: false, 
        message: 'Code, discount percent, and valid until date are required' 
      });
    }
    
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
    
    res.json({
      success: true,
      message: 'Coupon created successfully',
      coupon
    });
    
  } catch (error) {
    console.error('Create coupon error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const debugCoupons = async (req, res) => {
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
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const getUserCoupons = async (req, res) => {
  try {
    const usedCoupons = await UsedCoupon.find({ userId: req.user._id })
      .populate('couponId')
      .sort({ usedAt: -1 });
    
    res.json({ success: true, usedCoupons });
  } catch (error) {
    console.error('Get user coupons error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = {
  validateCoupon,
  applyCoupon,
  getAvailableCoupons,
  listCoupons,
  createCoupon,
  debugCoupons,
  getUserCoupons
};