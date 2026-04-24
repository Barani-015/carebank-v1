const express = require('express');
const { getMe, getInterviewData } = require('../controllers/userController');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/me', auth, getMe);
router.get('/interview-data', auth, getInterviewData);

module.exports = router;