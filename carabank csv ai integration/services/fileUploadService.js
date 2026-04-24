const multer = require('multer');
const { GridFsStorage } = require('multer-gridfs-storage');
const crypto = require('crypto');
const path = require('path');
const mongoose = require('mongoose');

// Create storage engine
const createStorage = () => {
  return new GridFsStorage({
    url: process.env.MONGODB_URI || 'mongodb://localhost:27017/carebank',
    options: { useUnifiedTopology: true },
    file: (req, file) => {
      return new Promise((resolve, reject) => {
        crypto.randomBytes(16, (err, buf) => {
          if (err) return reject(err);
          const filename = buf.toString('hex') + path.extname(file.originalname);
          const fileInfo = {
            filename: filename,
            bucketName: 'filescsv',  // ← Change this to match your collection
            metadata: {
              userId: req.user._id.toString(),
              originalName: file.originalname,
              uploadDate: new Date(),
              fileSize: file.size
            }
          };
          resolve(fileInfo);
        });
      });
    }
  });
};

// Configure multer for CSV files
const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
    cb(null, true);
  } else {
    cb(new Error('Only CSV files are allowed'), false);
  }
};

const upload = (req, res, next) => {
  const storage = createStorage();
  const uploadMiddleware = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
    fileFilter: fileFilter
  }).single('csvFile');
  
  uploadMiddleware(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, message: 'File size exceeds 50MB limit' });
      }
      return res.status(400).json({ success: false, message: err.message });
    }
    next();
  });
};

// Get GridFS bucket
const getGridFSBucket = () => {
  const db = mongoose.connection.db;
  return new mongoose.mongo.GridFSBucket(db, {
    bucketName: 'csvFiles'
  });
};

module.exports = { upload, getGridFSBucket };