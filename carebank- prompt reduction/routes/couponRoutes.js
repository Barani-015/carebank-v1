const express = require('express');
const {
  validateCoupon,
  applyCoupon,
  getAvailableCoupons,
  listCoupons,
  createCoupon,
  debugCoupons,
  getUserCoupons
} = require('../controllers/couponController');
const auth = require('../middleware/auth');

const router = express.Router();

router.post('/validate', auth, validateCoupon);
router.post('/apply', auth, applyCoupon);
router.get('/available', auth, getAvailableCoupons);
router.get('/list', auth, listCoupons);
router.post('/create', auth, createCoupon);
router.get('/debug/all', auth, debugCoupons);
router.get('/user', auth, getUserCoupons);

module.exports = router;