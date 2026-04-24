 const Transaction = require('../models/Transaction');

const getTransactions = async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    
    const transactions = await Transaction.find({ userId: req.user._id })
      .sort({ date: -1 })
      .skip(parseInt(offset))
      .limit(parseInt(limit));
    
    const total = await Transaction.countDocuments({ userId: req.user._id });
    
    res.json({ 
      success: true, 
      transactions,
      total,
      page: Math.floor(offset / limit) + 1,
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const importTransactions = async (req, res) => {
  try {
    const { transactions } = req.body;
    
    const importedTransactions = [];
    for (const tx of transactions) {
      const transaction = await Transaction.create({
        userId: req.user._id,
        name: tx.name,
        amount: tx.amount,
        date: new Date(tx.date),
        category: tx.category,
        type: tx.type,
        status: tx.status
      });
      importedTransactions.push(transaction);
    }
    
    res.json({
      success: true,
      transactions: importedTransactions,
      importedCount: importedTransactions.length
    });
  } catch (error) {
    console.error('Import transactions error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const createTransaction = async (req, res) => {
  try {
    const transaction = await Transaction.create({
      userId: req.user._id,
      ...req.body
    });
    res.json({ success: true, transaction });
  } catch (error) {
    console.error('Create transaction error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { getTransactions, importTransactions, createTransaction };