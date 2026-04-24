const express = require('express');
const path = require('path');
require('dotenv').config();

// Import configurations - NOTE: Use object destructuring
const { connectDB, initializeDatabase } = require('./config/database');

// Import middleware
const { corsMiddleware } = require('./middleware/cors');
const requestLogger = require('./middleware/requestLogger');
const errorHandler = require('./middleware/errorHandler');

// Import routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');
const couponRoutes = require('./routes/couponRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const aiRoutes = require('./routes/aiRoutes');
const fileRoutes = require('./routes/fileRoutes');

const app = express();

// ========== MIDDLEWARE ==========
app.use(corsMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);
app.use(express.static(path.join(__dirname, 'public')));

// ========== ROUTES ==========
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api', subscriptionRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api', transactionRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/files', fileRoutes);

// Health check
app.get('/api/test', (req, res) => {
  res.json({ success: true, message: 'Server is running!', timestamp: new Date().toISOString() });
});

// Error handling
app.use(errorHandler);

// ========== START SERVER ==========
const PORT = process.env.PORT || 3000;

// Connect to database and start server
connectDB().then(async () => {
  await initializeDatabase();
  
  app.listen(PORT, () => {
    console.log(`\n🚀 Server running on http://localhost:${PORT}`);
    console.log(`📡 Test endpoint: http://localhost:${PORT}/api/test`);
    console.log(`🔐 Login: POST http://localhost:${PORT}/api/auth/login`);
    console.log(`🎫 Coupon validation: POST http://localhost:${PORT}/api/coupons/validate`);
    console.log(`📋 List coupons: GET http://localhost:${PORT}/api/coupons/list\n`);
  });
}).catch(err => {
  console.error('❌ Failed to start server:', err);
  process.exit(1);
});