const express = require('express');
const {
  getQuestions,
  getQuestionsByCategory,
  submitInterview,
  ollamaTest
} = require('../controllers/aiController');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/interview/questions', auth, getQuestions);
router.get('/interview/category/:category', auth, getQuestionsByCategory);
router.post('/interview/submit', auth, submitInterview);
router.post('/ollama-test', auth, ollamaTest);

module.exports = router;