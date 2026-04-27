const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const llamaService = require('../services/llamaService');
const { getFileContentForLlama } = require('../controllers/fileController');

// Check if Llama is available
router.get('/status', async (req, res) => {
    const available = await llamaService.isAvailable();
    res.json({
        success: true,
        available: available,
        model: process.env.LLAMA_MODEL || 'llama3.2',
        endpoint: process.env.OLLAMA_URL || 'http://localhost:11434'
    });
});

// Analyze a specific CSV file
router.post('/analyze/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        
        // Get file content (using your existing function)
        const db = mongoose.connection.db;
        const file = await db.collection('filescsv.files').findOne({ 
            _id: new mongoose.Types.ObjectId(fileId),
            'metadata.userId': req.user._id.toString()
        });
        
        if (!file) {
            return res.status(404).json({ success: false, message: 'File not found' });
        }
        
        // Get file content from your existing function
        const fileContentReq = { params: { fileId }, user: req.user };
        const fileContentRes = {
            json: (data) => data,
            status: () => ({ json: (data) => data })
        };
        
        // You'll need to adapt this to get the actual content
        // For now, we'll assume a helper function exists
        const content = await getFileContent(req.user._id, fileId);
        
        const analysis = await llamaService.generateCSVSummary(content, file.metadata?.originalName || file.filename);
        
        res.json({
            success: true,
            analysis: analysis,
            fileId: fileId
        });
        
    } catch (error) {
        console.error('Analysis error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Ask question about CSV
router.post('/ask/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        const { question } = req.body;
        
        if (!question) {
            return res.status(400).json({ success: false, message: 'Question is required' });
        }
        
        // Get file content
        const db = mongoose.connection.db;
        const file = await db.collection('filescsv.files').findOne({ 
            _id: new mongoose.Types.ObjectId(fileId),
            'metadata.userId': req.user._id.toString()
        });
        
        if (!file) {
            return res.status(404).json({ success: false, message: 'File not found' });
        }
        
        const content = await getFileContent(req.user._id, fileId);
        
        const answer = await llamaService.askAboutCSV(content, file.metadata?.originalName || file.filename, question);
        
        res.json({
            success: true,
            answer: answer,
            question: question,
            fileId: fileId
        });
        
    } catch (error) {
        console.error('Question error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Helper function to get file content
async function getFileContent(userId, fileId) {
    const fs = require('fs');
    const path = require('path');
    
    const LOCAL_UPLOAD_DIR = path.join(__dirname, '../uploads/csv');
    const userDir = path.join(LOCAL_UPLOAD_DIR, userId.toString());
    
    const db = mongoose.connection.db;
    const file = await db.collection('filescsv.files').findOne({ 
        _id: new mongoose.Types.ObjectId(fileId)
    });
    
    if (!file) throw new Error('File not found');
    
    const timestamp = file.uploadDate.getTime();
    const sanitizedName = (file.metadata?.originalName || file.filename).replace(/[^a-zA-Z0-9.-]/g, '_');
    const localFilePath = path.join(userDir, `${timestamp}-${sanitizedName}`);
    
    if (fs.existsSync(localFilePath)) {
        return fs.readFileSync(localFilePath, 'utf-8');
    }
    
    // Fallback to GridFS
    const { getGridFSBucket } = require('../services/fileUploadService');
    const bucket = getGridFSBucket();
    const downloadStream = bucket.openDownloadStream(file._id);
    
    return new Promise((resolve, reject) => {
        let data = '';
        downloadStream.on('data', (chunk) => data += chunk.toString());
        downloadStream.on('end', () => resolve(data));
        downloadStream.on('error', reject);
    });
}

module.exports = router;