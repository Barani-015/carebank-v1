const express = require('express');
const { 
    uploadCSV, 
    getUserFiles, 
    deleteFile,
    downloadFile
} = require('../controllers/fileController');
const { upload } = require('../services/fileUploadService');
const auth = require('../middleware/auth');

const router = express.Router();

// Debug middleware
router.use((req, res, next) => {
    console.log('📌 File route hit:', req.method, req.url);
    console.log('📌 Content-Type:', req.headers['content-type']);
    next();
});

// Upload CSV file - WITHOUT PREMIUM CHECK
router.post('/upload', auth, upload, uploadCSV);

// Get user's uploaded files
router.get('/files', auth, getUserFiles);

// Download file by ID
router.get('/download/:fileId', auth, downloadFile);

// Delete file
router.delete('/files/:fileId', auth, deleteFile);

module.exports = router;