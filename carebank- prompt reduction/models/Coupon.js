 const mongoose = require('mongoose');

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

module.exports = mongoose.model('Coupon', couponSchema);