const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const { getGridFSBucket } = require('../services/fileUploadService');

// Upload CSV file
const uploadCSV = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        // Parse CSV and import transactions
        const transactions = await parseAndImportCSV(req.file, req.user._id);

        res.json({
            success: true,
            message: `Successfully uploaded and processed ${transactions.length} transactions`,
            file: {
                id: req.file.id,
                name: req.file.originalname,
                size: req.file.size,
                transactionCount: transactions.length,
                uploadDate: new Date()
            },
            transactions: transactions
        });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Parse CSV and import transactions
const parseAndImportCSV = async (file, userId) => {
    const bucket = getGridFSBucket();
    const transactions = [];
    
    return new Promise((resolve, reject) => {
        const downloadStream = bucket.openDownloadStream(file.id);
        let csvData = '';
        
        downloadStream.on('data', (chunk) => {
            csvData += chunk.toString();
        });
        
        downloadStream.on('end', async () => {
            try {
                // Parse CSV
                const lines = csvData.split('\n');
                if (lines.length < 2) {
                    reject(new Error('CSV file is empty'));
                    return;
                }
                
                const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
                
                // Find column indexes
                const nameIndex = findColumnIndex(headers, ['name', 'title', 'description', 'merchant', 'transaction']);
                const amountIndex = findColumnIndex(headers, ['amount', 'price', 'value', 'amt']);
                const dateIndex = findColumnIndex(headers, ['date', 'time', 'day', 'transaction_date']);
                const categoryIndex = findColumnIndex(headers, ['category', 'tag', 'type']);
                const statusIndex = findColumnIndex(headers, ['status', 'state']);
                
                // Parse each row
                for (let i = 1; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line) continue;
                    
                    const values = parseCSVLine(line);
                    const amount = parseAmount(values[amountIndex]);
                    
                    if (amount === 0) continue;
                    
                    const transaction = {
                        userId: userId,
                        name: nameIndex >= 0 ? (values[nameIndex] || 'Unknown Transaction') : 'CSV Transaction',
                        amount: Math.abs(amount),
                        date: dateIndex >= 0 ? formatDate(values[dateIndex]) : new Date(),
                        category: categoryIndex >= 0 ? (values[categoryIndex] || 'Other') : 'Other',
                        type: amount > 0 ? 'credit' : 'debit',
                        status: statusIndex >= 0 ? (values[statusIndex]?.toLowerCase().includes('fail') ? 'failed' : 'success') : 'success'
                    };
                    
                    transactions.push(transaction);
                }
                
                // Bulk insert transactions
                if (transactions.length > 0) {
                    await Transaction.insertMany(transactions);
                }
                
                resolve(transactions);
                
            } catch (error) {
                reject(error);
            }
        });
        
        downloadStream.on('error', (error) => {
            reject(error);
        });
    });
};

// Helper functions
const findColumnIndex = (headers, possibleNames) => {
    for (const name of possibleNames) {
        const index = headers.findIndex(h => h.includes(name));
        if (index !== -1) return index;
    }
    return -1;
};

const parseCSVLine = (line) => {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (const char of line) {
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result;
};

const parseAmount = (value) => {
    if (!value) return 0;
    const cleaned = value.toString().replace(/[^0-9.-]/g, '');
    const amount = parseFloat(cleaned);
    return isNaN(amount) ? 0 : amount;
};

const formatDate = (dateStr) => {
    if (!dateStr) return new Date();
    try {
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) return date;
    } catch (e) {}
    return new Date();
};

// Download CSV file by ID
const downloadFile = async (req, res) => {
    try {
        const { fileId } = req.params;
        const { inline } = req.query;
        
        console.log(`📥 Download request for file: ${fileId}`);
        
        const db = mongoose.connection.db;
        const bucket = new mongoose.mongo.GridFSBucket(db, { 
            bucketName: 'filescsv'
        });
        
        let downloadStream;
        let filename = 'downloaded.csv';
        
        try {
            const objectId = new mongoose.Types.ObjectId(fileId);
            downloadStream = bucket.openDownloadStream(objectId);
            
            // Get file info
            const files = await db.collection('filescsv.files').findOne({ _id: objectId });
            if (files && files.metadata && files.metadata.originalName) {
                filename = files.metadata.originalName;
            } else if (files && files.filename) {
                filename = files.filename;
            }
            
        } catch (err) {
            console.error('Error opening download stream:', err);
            return res.status(404).json({ 
                success: false, 
                message: 'File not found in GridFS' 
            });
        }
        
        // Set response headers
        if (inline === 'true') {
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        } else {
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        }
        
        downloadStream.on('error', (error) => {
            console.error('Download stream error:', error);
            if (!res.headersSent) {
                res.status(404).json({ success: false, message: 'File not found' });
            }
        });
        
        downloadStream.pipe(res);
        
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to download file: ' + error.message 
        });
    }
};

// Get user's uploaded files
const getUserFiles = async (req, res) => {
    try {
        const db = mongoose.connection.db;
        
        const files = await db.collection('filescsv.files').find({
            'metadata.userId': req.user._id.toString()
        }).sort({ uploadDate: -1 }).toArray();
        
        const formattedFiles = files.map(file => ({
            id: file._id,
            filename: file.filename,
            originalName: file.metadata?.originalName || file.filename,
            fileSize: file.length,
            uploadDate: file.uploadDate,
            contentType: file.contentType
        }));
        
        res.json({
            success: true,
            files: formattedFiles
        });
        
    } catch (error) {
        console.error('Get files error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to get files' 
        });
    }
};

// Delete file
const deleteFile = async (req, res) => {
    try {
        const { fileId } = req.params;
        
        const db = mongoose.connection.db;
        const bucket = new mongoose.mongo.GridFSBucket(db, { 
            bucketName: 'filescsv'
        });
        
        const file = await db.collection('filescsv.files').findOne({ 
            _id: new mongoose.Types.ObjectId(fileId),
            'metadata.userId': req.user._id.toString()
        });
        
        if (!file) {
            return res.status(404).json({ 
                success: false, 
                message: 'File not found or unauthorized' 
            });
        }
        
        await bucket.delete(new mongoose.Types.ObjectId(fileId));
        
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

// Make sure all functions are exported
module.exports = {
    uploadCSV,
    getUserFiles,
    deleteFile,
    downloadFile
};