const mongoose = require('mongoose');

const usedCouponSchema = new mongoose.Schema({
  couponId: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription' },
  usedAt: { type: Date, default: Date.now }
}, { timestamps: true });

usedCouponSchema.index({ couponId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('UsedCoupon', usedCouponSchema);