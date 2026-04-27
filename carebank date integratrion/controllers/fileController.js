const Transaction = require('../models/Transaction');
const fs = require('fs');
const path = require('path');

// Upload CSV file
const uploadCSV = async (req, res) => {
    try {
        console.log('🎯 uploadCSV controller called');
        console.log('📁 File object:', req.file);
        
        if (!req.file) {
            return res.status(400).json({ 
                success: false, 
                message: 'No file uploaded' 
            });
        }

        // Verify file exists
        if (!fs.existsSync(req.file.path)) {
            console.error('❌ File not found at path:', req.file.path);
            return res.status(500).json({ 
                success: false, 
                message: 'File was not saved properly' 
            });
        }

        console.log('✅ File verified at:', req.file.path);
        
        // Read and parse CSV
        const csvData = fs.readFileSync(req.file.path, 'utf-8');
        console.log('📖 CSV file read, size:', csvData.length, 'bytes');
        console.log('📝 First 100 chars:', csvData.substring(0, 100));
        
        // Parse CSV
        const lines = csvData.split('\n').filter(line => line.trim());
        
        if (lines.length < 2) {
            throw new Error('CSV must have headers and at least one data row');
        }
        
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        console.log('📋 Headers:', headers);
        
        // Try to find columns intelligently
        const dateCol = findColumn(headers, ['date', 'transactiondate', 'day', 'transdate']);
        const descCol = findColumn(headers, ['description', 'desc', 'name', 'merchant', 'title', 'particulars']);
        const amountCol = findColumn(headers, ['amount', 'amt', 'price', 'value', 'total', 'credit', 'debit']);
        
        console.log('🎯 Column mapping:', {
            date: dateCol >= 0 ? headers[dateCol] : 'not found',
            description: descCol >= 0 ? headers[descCol] : 'not found',
            amount: amountCol >= 0 ? headers[amountCol] : 'not found'
        });
        
        const transactions = [];
        
        // Process each row (limit to first 100 for testing)
        const maxRows = Math.min(lines.length, 101);
        for (let i = 1; i < maxRows; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const values = parseCSVLine(line);
            
            let amount = 0;
            if (amountCol >= 0 && values[amountCol]) {
                // Clean amount string
                let amountStr = values[amountCol].toString();
                amountStr = amountStr.replace(/[^0-9.-]/g, '');
                amount = parseFloat(amountStr);
                if (isNaN(amount)) amount = 0;
            }
            
            if (amount !== 0) {
                const transaction = {
                    userId: req.user._id,
                    name: descCol >= 0 ? values[descCol] : `Transaction ${i}`,
                    amount: Math.abs(amount),
                    date: dateCol >= 0 ? formatDate(values[dateCol]) : new Date().toISOString().split('T')[0],
                    category: 'Imported',
                    type: amount > 0 ? 'credit' : 'debit',
                    status: 'success',
                    createdAt: new Date()
                };
                transactions.push(transaction);
            }
        }
        
        console.log(`📊 Parsed ${transactions.length} transactions`);
        
        // Save to database
        if (transactions.length > 0) {
            await Transaction.insertMany(transactions);
            console.log(`💾 Saved ${transactions.length} transactions to database`);
        }
        
        // Return success response
        res.json({
            success: true,
            message: `Successfully uploaded and processed ${transactions.length} transactions`,
            data: {
                file: {
                    originalName: req.file.originalname,
                    savedName: req.file.filename,
                    path: req.file.path,
                    size: req.file.size
                },
                transactions: {
                    count: transactions.length,
                    sample: transactions.slice(0, 5)
                }
            }
        });
        
    } catch (error) {
        console.error('❌ Upload error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to upload file: ' + error.message 
        });
    }
};

// Get user files
const getUserFiles = async (req, res) => {
    try {
        const userDir = path.join(__dirname, '..', 'uploadsCSVs', req.user._id.toString());
        console.log('📁 Looking for files in:', userDir);
        
        let files = [];
        
        if (fs.existsSync(userDir)) {
            const fileList = fs.readdirSync(userDir);
            console.log(`📄 Found ${fileList.length} files`);
            
            for (const filename of fileList) {
                const filePath = path.join(userDir, filename);
                const stats = fs.statSync(filePath);
                
                files.push({
                    id: filename,
                    name: filename,
                    size: stats.size,
                    uploadDate: stats.mtime,
                    path: filePath
                });
            }
            
            files.sort((a, b) => b.uploadDate - a.uploadDate);
        } else {
            console.log('⚠️ User directory does not exist yet');
        }
        
        res.json({
            success: true,
            files: files,
            count: files.length
        });
        
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Download file
const downloadFile = async (req, res) => {
    try {
        const { fileId } = req.params;
        const userDir = path.join(__dirname, '..', 'uploadsCSVs', req.user._id.toString());
        const filePath = path.join(userDir, fileId);
        
        console.log('📥 Downloading file:', filePath);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, message: 'File not found' });
        }
        
        res.download(filePath);
        
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Delete file
const deleteFile = async (req, res) => {
    try {
        const { fileId } = req.params;
        const userDir = path.join(__dirname, '..', 'uploadsCSVs', req.user._id.toString());
        const filePath = path.join(userDir, fileId);
        
        console.log('🗑️ Deleting file:', filePath);
        
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        
        res.json({ success: true, message: 'File deleted successfully' });
        
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Helper functions
const findColumn = (headers, possibleNames) => {
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
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
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
    
    // Remove quotes from values
    return result.map(v => v.replace(/^"|"$/g, ''));
};

const formatDate = (dateStr) => {
    if (!dateStr) return new Date().toISOString().split('T')[0];
    
    try {
        // Try parsing the date
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
            return date.toISOString().split('T')[0];
        }
    } catch (e) {
        console.warn('Date parsing failed:', dateStr);
    }
    
    return new Date().toISOString().split('T')[0];
};

module.exports = {
    uploadCSV,
    getUserFiles,
    deleteFile,
    downloadFile
};