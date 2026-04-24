const express = require('express');
const { getDashboardStats, getSpendingByCategory } = require('../controllers/analyticsController');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/dashboard', auth, getDashboardStats);
router.get('/spending-by-category', auth, getSpendingByCategory);

module.exports = router;