const mongoose = require('mongoose');

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

module.exports = mongoose.model('Payment', paymentSchema);