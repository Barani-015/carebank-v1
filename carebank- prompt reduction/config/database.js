const mongoose = require('mongoose');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const Transaction = require('../models/Transaction');
const Coupon = require('../models/Coupon');
const UsedCoupon = require('../models/UsedCoupon');
const { PLAN_MAP } = require('./plans');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/carebank', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ MongoDB Connected to carebank database');
    return mongoose.connection;
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error);
    throw error;
  }
};

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
      
      await Coupon.deleteMany({});
      const result = await Coupon.insertMany(defaultCoupons);
      console.log(`✅ Created ${result.length} coupons`);
      
      result.forEach(coupon => {
        console.log(`   📌 ${coupon.code}: ${coupon.discountPercent}% off - ${coupon.description}`);
      });
    } else {
      console.log(`📋 Found ${couponCount} existing coupons in database`);
      
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

// Make sure both functions are exported correctly
module.exports = { 
  connectDB, 
  initializeDatabase 
};