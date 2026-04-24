const express = require('express');
const { 
    uploadCSV, 
    getUserFiles, 
    deleteFile,
    downloadFile
    // Remove downloadFileByFilename if not implemented
} = require('../controllers/fileController');
const { upload } = require('../services/fileUploadService');
const auth = require('../middleware/auth');

const router = express.Router();

// Upload CSV file
router.post('/upload', auth, (req, res, next) => {
    if (!req.user.isPremium && req.user.role !== 'admin') {
        return res.status(403).json({ 
            success: false, 
            message: 'Premium subscription required for CSV upload' 
        });
    }
    next();
}, upload, uploadCSV);

// Get user's uploaded files
router.get('/files', auth, getUserFiles);

// Download file by ID
router.get('/download/:fileId', auth, downloadFile);

// Delete file
router.delete('/files/:fileId', auth, deleteFile);

module.exports = router;