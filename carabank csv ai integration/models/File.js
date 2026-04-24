const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  filename: { type: String, required: true },
  originalName: { type: String, required: true },
  fileSize: { type: Number, required: true },
  mimeType: { type: String, default: 'text/csv' },
  uploadDate: { type: Date, default: Date.now },
  transactionCount: { type: Number, default: 0 },
  status: { type: String, enum: ['processing', 'completed', 'failed'], default: 'processing' },
  fileId: { type: mongoose.Schema.Types.ObjectId, required: true } // Reference to GridFS file
}, { timestamps: true });

fileSchema.index({ userId: 1, uploadDate: -1 });

module.exports = mongoose.model('File', fileSchema);