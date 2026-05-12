const express = require('express');
const { getSubscription, updateSubscription } = require('../controllers/subscriptionController');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/subscription', auth, getSubscription);
router.put('/subscription', auth, updateSubscription);

module.exports = router;