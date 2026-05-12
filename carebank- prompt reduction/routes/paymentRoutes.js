const express = require('express');
const {
  getRazorpayKey,
  createOrder,
  verifyPayment,
  getPaymentStatus,
  getPaymentHistory,
  webhook
} = require('../controllers/paymentController');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/razorpay-key', auth, getRazorpayKey);
router.get('/key', auth, getRazorpayKey);
router.post('/create-order', auth, createOrder);
router.post('/verify', auth, verifyPayment);
router.get('/status/:orderId', auth, getPaymentStatus);
router.get('/history', auth, getPaymentHistory);
router.post('/webhook', webhook);

module.exports = router;