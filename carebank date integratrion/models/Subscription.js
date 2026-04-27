const mongoose = require('mongoose');

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
  couponCode: { type: String, default: null },
  razorpayOrderId: { type: String },
  razorpayPaymentId: { type: String },
  paymentStatus: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' }
}, { timestamps: true });

subscriptionSchema.index({ userId: 1 });
subscriptionSchema.index({ status: 1 });
subscriptionSchema.index({ endDate: 1 });

module.exports = mongoose.model('Subscription', subscriptionSchema);