const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const fs = require('fs');
const path = require('path');

// Upload CSV file
const uploadCSV = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        console.log(`📄 File uploaded: ${req.file.originalname}`);
        console.log(`📄 Stored at: ${req.file.path}`);
        console.log(`📄 Size: ${req.file.size} bytes`);

        res.json({
            success: true,
            message: 'File uploaded successfully',
            file: {
                originalName: req.file.originalname,
                filename: req.file.filename,
                size: req.file.size,
                path: req.file.path,
                uploadDate: new Date()
            }
        });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Get all user files
const getUserFiles = async (req, res) => {
    try {
        const userDir = path.join(__dirname, '../uploadsCSVs', req.user._id.toString());
        
        let files = [];
        
        if (fs.existsSync(userDir)) {
            const fileList = fs.readdirSync(userDir);
            files = fileList.map(filename => ({
                filename: filename,
                path: path.join(userDir, filename),
                size: fs.statSync(path.join(userDir, filename)).size,
                uploadDate: fs.statSync(path.join(userDir, filename)).mtime
            }));
        }
        
        res.json({
            success: true,
            files: files
        });
        
    } catch (error) {
        console.error('Get files error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to get files' 
        });
    }
};

// Download file
const downloadFile = async (req, res) => {
    try {
        const { fileId } = req.params;
        const userDir = path.join(__dirname, '../uploadsCSVs', req.user._id.toString());
        
        if (!fs.existsSync(userDir)) {
            return res.status(404).json({ success: false, message: 'No files found' });
        }
        
        const files = fs.readdirSync(userDir);
        
        if (files.length === 0) {
            return res.status(404).json({ success: false, message: 'File not found' });
        }
        
        // For now, download the first file
        const filePath = path.join(userDir, files[0]);
        
        res.download(filePath, files[0], (err) => {
            if (err) {
                console.error('Download error:', err);
                if (!res.headersSent) {
                    res.status(500).json({ success: false, message: 'Download failed' });
                }
            }
        });
        
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to download file' 
        });
    }
};

// Delete file
const deleteFile = async (req, res) => {
    try {
        const { fileId } = req.params;
        const userDir = path.join(__dirname, '../uploadsCSVs', req.user._id.toString());
        
        if (fs.existsSync(userDir)) {
            const files = fs.readdirSync(userDir);
            if (files.length > 0) {
                fs.unlinkSync(path.join(userDir, files[0]));
            }
        }
        
        res.json({ 
            success: true, 
            message: 'File deleted successfully' 
        });
        
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to delete file' 
        });
    }
};

module.exports = {
    uploadCSV,
    getUserFiles,
    deleteFile,
    downloadFile
};