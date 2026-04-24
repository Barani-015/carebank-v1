const Transaction = require('../models/Transaction');

const getDashboardStats = async (req, res) => {
  try {
    const transactions = await Transaction.find({ userId: req.user._id });
    
    let balance = 0, spending = 0, income = 0;
    
    transactions.forEach(tx => {
      if (tx.type === 'credit') {
        balance += tx.amount;
        income += tx.amount;
      } else {
        balance -= tx.amount;
        spending += tx.amount;
      }
    });
    
    const savingsRate = income > 0 ? Math.round((income - spending) / income * 100) : 0;
    
    res.json({
      success: true,
      balance,
      spending,
      income,
      savingsRate
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const getSpendingByCategory = async (req, res) => {
  try {
    const transactions = await Transaction.aggregate([
      { $match: { userId: req.user._id, type: 'debit' } },
      { $group: { _id: '$category', total: { $sum: '$amount' } } },
      { $sort: { total: -1 } }
    ]);
    
    const categories = transactions.map(t => t._id);
    const amounts = transactions.map(t => t.total);
    
    res.json({ success: true, categories, amounts });
  } catch (error) {
    console.error('Spending by category error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { getDashboardStats, getSpendingByCategory };