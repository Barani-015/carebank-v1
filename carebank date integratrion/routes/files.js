const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');
const router = express.Router();
const auth = require('../middleware/auth');
const File = require('../models/File');
const Transaction = require('../models/Transaction');

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `${req.user._id}-${uniqueSuffix}-${file.originalname}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'), false);
    }
  }
});

// Upload CSV file
router.post('/upload', auth, upload.single('csvFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    // Create file record in database
    const fileRecord = new File({
      userId: req.user._id,
      fileName: req.file.filename,
      originalName: req.file.originalname,
      fileSize: req.file.size,
      fileType: req.file.mimetype,
      filePath: req.file.path,
      status: 'processing',
      uploadDate: new Date()
    });

    await fileRecord.save();

    // Parse CSV and save transactions
    const transactions = [];
    let rowCount = 0;
    let errorCount = 0;

    await new Promise((resolve, reject) => {
      fs.createReadStream(req.file.path)
        .pipe(csv())
        .on('data', (row) => {
          rowCount++;
          try {
            const transaction = parseCSVRow(row);
            if (transaction) {
              transaction.userId = req.user._id;
              transaction.fileId = fileRecord._id;
              transactions.push(transaction);
            }
          } catch (err) {
            errorCount++;
            console.error(`Error parsing row ${rowCount}:`, err);
          }
        })
        .on('end', async () => {
          // Bulk insert transactions
          if (transactions.length > 0) {
            await Transaction.insertMany(transactions);
          }
          
          // Update file record
          fileRecord.transactionCount = transactions.length;
          fileRecord.status = 'completed';
          fileRecord.processedAt = new Date();
          await fileRecord.save();
          
          resolve();
        })
        .on('error', reject);
    });

    res.json({
      success: true,
      message: `File uploaded successfully. Processed ${transactions.length} transactions.`,
      fileId: fileRecord._id,
      transactionCount: transactions.length,
      transactions: transactions
    });

  } catch (error) {
    console.error('Upload error:', error);
    
    // Update file status to failed if exists
    if (req.file) {
      const fileRecord = await File.findOne({ fileName: req.file.filename });
      if (fileRecord) {
        fileRecord.status = 'failed';
        fileRecord.errorMessage = error.message;
        await fileRecord.save();
      }
    }
    
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to upload file'
    });
  }
});

// Parse CSV row helper function
function parseCSVRow(row) {
  // Try to find columns by various names
  const amount = parseAmount(
    row.amount || row.Amount || row.price || row.Price || 
    row.value || row.Value || row.debit || row.credit || '0'
  );
  
  if (amount === 0) return null;
  
  // Determine transaction type
  let type = 'debit';
  if (row.type === 'credit' || row.type === 'Credit' || 
      row.credit || row.Credit || 
      (row.type && row.type.toLowerCase().includes('credit'))) {
    type = 'credit';
  }
  
  return {
    name: row.name || row.Name || row.description || row.Description || row.title || 'Transaction',
    amount: amount,
    date: formatDate(row.date || row.Date || row.transaction_date || new Date()),
    category: row.category || row.Category || 'Other',
    type: type,
    status: row.status === 'failed' ? 'failed' : 'success'
  };
}

function parseAmount(value) {
  if (!value) return 0;
  const num = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
  return isNaN(num) ? 0 : Math.abs(num);
}

function formatDate(dateStr) {
  try {
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    }
  } catch (e) {}
  return new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

// Get user's uploaded files
router.get('/files', auth, async (req, res) => {
  try {
    const files = await File.find({ userId: req.user._id })
      .sort({ uploadDate: -1 })
      .select('_id originalName fileSize transactionCount status uploadDate');
    
    res.json({
      success: true,
      files: files
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Delete a file and its associated transactions
router.delete('/files/:fileId', auth, async (req, res) => {
  try {
    const file = await File.findOne({
      _id: req.params.fileId,
      userId: req.user._id
    });
    
    if (!file) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }
    
    // Delete the physical file
    if (fs.existsSync(file.filePath)) {
      fs.unlinkSync(file.filePath);
    }
    
    // Delete file record
    await file.deleteOne();
    
    // Optionally: Delete associated transactions
    // await Transaction.deleteMany({ fileId: req.params.fileId });
    
    res.json({
      success: true,
      message: 'File deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get file details
router.get('/files/:fileId', auth, async (req, res) => {
  try {
    const file = await File.findOne({
      _id: req.params.fileId,
      userId: req.user._id
    });
    
    if (!file) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }
    
    const transactions = await Transaction.find({
      fileId: req.params.fileId,
      userId: req.user._id
    });
    
    res.json({
      success: true,
      file: file,
      transactions: transactions
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;