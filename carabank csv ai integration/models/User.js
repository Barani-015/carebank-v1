const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, select: false },
  createdAt: { type: Date, default: Date.now },
  interviewData: { type: Object, default: {} },
  interviewCompletedAt: { type: Date, default: null },
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

module.exports = mongoose.model('User', userSchema);