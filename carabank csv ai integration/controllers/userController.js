const User = require('../models/User');

const getMe = async (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      createdAt: req.user.createdAt
    }
  });
};

const getInterviewData = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('interviewData interviewCompletedAt role skills certifications');
    res.json({
      success: true,
      hasCompleted: !!user.interviewCompletedAt,
      data: user.interviewData,
      role: user.role,
      skills: user.skills,
      certifications: user.certifications
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { getMe, getInterviewData };