const fs = require('fs');
const path = require('path');
const User = require('../models/User');
const { getAIResponse } = require('../services/ollamaService');

const questionsPath = path.join(__dirname, '../backend-data', 'care-bank-questions.json');
let interviewQuestions = [];

try {
  const questionsData = fs.readFileSync(questionsPath, 'utf8');
  interviewQuestions = JSON.parse(questionsData);
  console.log(`✅ Loaded ${interviewQuestions.length} interview questions`);
} catch (err) {
  console.error('❌ Error loading interview questions:', err.message);
  interviewQuestions = [];
}

const getQuestions = async (req, res) => {
  res.json({
    success: true,
    count: interviewQuestions.length,
    questions: interviewQuestions
  });
};

const getQuestionsByCategory = async (req, res) => {
  const { category } = req.params;
  const filtered = interviewQuestions.filter(q => 
    q.category?.toLowerCase() === category.toLowerCase()
  );
  res.json({
    success: true,
    count: filtered.length,
    category,
    questions: filtered
  });
};

const submitInterview = async (req, res) => {
  try {
    const { answers } = req.body;
    
    await User.findByIdAndUpdate(req.user._id, {
      $set: { interviewData: answers, interviewCompletedAt: new Date() }
    });
    
    res.json({
      success: true,
      message: 'Interview responses saved successfully',
      completedAt: new Date()
    });
  } catch (error) {
    console.error('Error saving interview:', error);
    res.status(500).json({ success: false, message: 'Failed to save responses' });
  }
};

const ollamaTest = async (req, res) => {
  try {
    const { prompt } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ 
        success: false, 
        message: 'Prompt is required' 
      });
    }
    
    console.log(`[AI REQUEST] Received prompt: ${prompt.substring(0, 100)}...`);
    
    const aiResponse = await getAIResponse(prompt);
    
    res.json({
      success: true,
      response: aiResponse.response || aiResponse
    });
    
  } catch (error) {
    console.error('Error getting AI response:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get AI response',
      error: error.message 
    });
  }
};

module.exports = {
  getQuestions,
  getQuestionsByCategory,
  submitInterview,
  ollamaTest
};