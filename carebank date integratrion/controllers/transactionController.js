const Transaction = require('../models/Transaction');

const getTransactions = async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;
    
    if (!Transaction) {
      console.error('Transaction model is not loaded');
      return res.status(500).json({ success: false, message: 'Database model error' });
    }
    
    const transactions = await Transaction.find({ userId: req.user._id })
      .sort({ date: -1 })
      .skip(parseInt(offset))
      .limit(parseInt(limit))
      .populate('fileId', 'originalName uploadDate'); // Include file info
    
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
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

const importTransactions = async (req, res) => {
  try {
    const { transactions, fileId } = req.body;
    
    if (!transactions || !Array.isArray(transactions)) {
      return res.status(400).json({ success: false, message: 'Invalid transactions data' });
    }
    
    const importedTransactions = [];
    for (const tx of transactions) {
      const transactionData = {
        userId: req.user._id,
        name: tx.name || 'Transaction',
        amount: tx.amount || 0,
        date: tx.date || new Date().toLocaleDateString(),
        category: tx.category || 'Other',
        type: tx.type || 'debit',
        status: tx.status || 'success'
      };
      
      // Only add fileId if provided (optional)
      if (fileId) {
        transactionData.fileId = fileId;
      }
      
      const transaction = new Transaction(transactionData);
      const saved = await transaction.save();
      importedTransactions.push(saved);
    }
    
    res.json({
      success: true,
      transactions: importedTransactions,
      importedCount: importedTransactions.length
    });
  } catch (error) {
    console.error('Import transactions error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

const createTransaction = async (req, res) => {
  try {
    const transactionData = {
      userId: req.user._id,
      ...req.body
    };
    
    // If fileId is provided, use it, otherwise it's optional
    const transaction = new Transaction(transactionData);
    const saved = await transaction.save();
    res.json({ success: true, transaction: saved });
  } catch (error) {
    console.error('Create transaction error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

module.exports = { getTransactions, importTransactions, createTransaction };