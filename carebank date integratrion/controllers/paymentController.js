const crypto = require('crypto');
const { razorpay } = require('../config/razorpay');
const { PLAN_MAP } = require('../config/plans');
const Payment = require('../models/Payment');
const Subscription = require('../models/Subscription');
const Transaction = require('../models/Transaction');
const Coupon = require('../models/Coupon');
const UsedCoupon = require('../models/UsedCoupon');
const User = require('../models/User');

const getRazorpayKey = async (req, res) => {
  try {
    res.json({
      success: true,
      key: process.env.RAZORPAY_KEY_ID || 'rzp_test_YourTestKeyHere'
    });
  } catch (error) {
    console.error('Error getting Razorpay key:', error);
    res.status(500).json({ success: false, message: 'Failed to get payment key' });
  }
};

const createOrder = async (req, res) => {
  try {
    const { planKey, couponCode, discountPercent } = req.body;
    
    const plan = PLAN_MAP[planKey];
    if (!plan) {
      return res.status(400).json({ success: false, message: 'Invalid plan' });
    }
    
    let amount = plan.price;
    let discount = 0;
    let appliedCoupon = null;
    
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
        }
      }
    } else if (discountPercent) {
      discount = discountPercent;
      amount = plan.price * (1 - discount / 100);
    }
    
    amount = Math.round(amount * 100) / 100;
    const amountInPaise = Math.round(amount * 100);
    
    const timestamp = Date.now().toString().slice(-10);
    const shortUserId = req.user._id.toString().slice(-6);
    const receipt = `rcpt_${shortUserId}_${timestamp}`;
    
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
};

const verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      planKey,
      couponCode,
      discountPercent
    } = req.body;
    
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");
    
    const isAuthentic = expectedSignature === razorpay_signature;
    
    if (!isAuthentic) {
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
    
    const payment = await Payment.findOne({ orderId: razorpay_order_id });
    if (!payment) {
      return res.status(404).json({ 
        success: false, 
        message: 'Payment record not found' 
      });
    }
    
    payment.paymentId = razorpay_payment_id;
    payment.signature = razorpay_signature;
    payment.status = 'paid';
    await payment.save();
    
    const targetPlanKey = planKey || payment.planKey;
    const plan = PLAN_MAP[targetPlanKey];
    if (!plan) {
      return res.status(400).json({ success: false, message: 'Invalid plan' });
    }
    
    let endDate = null;
    if (plan.duration) {
      endDate = new Date();
      endDate.setDate(endDate.getDate() + plan.duration);
    }
    
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
    }
    
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
          
          coupon.usedCount += 1;
          await coupon.save();
        }
      }
    }
    
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
};

const getPaymentStatus = async (req, res) => {
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
};

const getPaymentHistory = async (req, res) => {
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
};

const webhook = async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers['x-razorpay-signature'];
    
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
      
      const payment = await Payment.findOne({ orderId: orderId });
      if (payment && payment.status !== 'paid') {
        payment.status = 'paid';
        payment.paymentId = paymentId;
        await payment.save();
        
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
        }
      }
    }
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ success: false, message: 'Webhook processing failed' });
  }
};

module.exports = {
  getRazorpayKey,
  createOrder,
  verifyPayment,
  getPaymentStatus,
  getPaymentHistory,
  webhook
};