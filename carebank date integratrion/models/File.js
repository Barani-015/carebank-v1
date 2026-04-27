const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  fileName: {
    type: String,
    required: true
  },
  originalName: {
    type: String,
    required: true
  },
  fileSize: {
    type: Number,
    required: true
  },
  fileType: {
    type: String,
    default: 'text/csv'
  },
  filePath: {
    type: String,
    required: true
  },
  transactionCount: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['uploading', 'processing', 'completed', 'failed'],
    default: 'uploading'
  },
  uploadDate: {
    type: Date,
    default: Date.now
  },
  processedAt: {
    type: Date
  },
  errorMessage: {
    type: String
  }
});

module.exports = mongoose.model('File', fileSchema);