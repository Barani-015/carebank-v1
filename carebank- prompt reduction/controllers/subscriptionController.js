const Subscription = require('../models/Subscription');
const { PLAN_MAP } = require('../config/plans');

const getSubscription = async (req, res) => {
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
};

const updateSubscription = async (req, res) => {
  try {
    const { planKey, couponCode, discount } = req.body;
    const plan = PLAN_MAP[planKey];

    if (!plan) {
      return res.status(400).json({ success: false, message: 'Invalid plan' });
    }

    let finalPrice = plan.price;
    let discountApplied = 0;
    let appliedCouponCode = null;

    if (couponCode) {
      const Coupon = require('../models/Coupon');
      const UsedCoupon = require('../models/UsedCoupon');
      
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

    res.json({ success: true, subscription });
  } catch (error) {
    console.error('Update subscription error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { getSubscription, updateSubscription };