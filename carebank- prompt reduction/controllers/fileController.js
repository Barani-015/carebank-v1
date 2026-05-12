


// const Transaction = require('../models/Transaction');
// const fs = require('fs');
// const path = require('path');





// // Upload CSV file
// const uploadCSV = async (req, res) => {
//     try {
//         console.log('🎯 uploadCSV controller called');
//         console.log('📁 File object:', req.file);
        
//         if (!req.file) {
//             return res.status(400).json({ 
//                 success: false, 
//                 message: 'No file uploaded' 
//             });
//         }

//         // Verify file exists
//         if (!fs.existsSync(req.file.path)) {
//             console.error('❌ File not found at path:', req.file.path);
//             return res.status(500).json({ 
//                 success: false, 
//                 message: 'File was not saved properly' 
//             });
//         }

//         console.log('✅ File verified at:', req.file.path);
        
//         // Read and parse CSV
//         const csvData = fs.readFileSync(req.file.path, 'utf-8');
//         console.log('📖 CSV file read, size:', csvData.length, 'bytes');
//         console.log('📝 First 100 chars:', csvData.substring(0, 100));
        
//         // Parse CSV
//         const lines = csvData.split('\n').filter(line => line.trim());
        
//         if (lines.length < 2) {
//             throw new Error('CSV must have headers and at least one data row');
//         }
        
//         const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
//         console.log('📋 Headers:', headers);
        
//         // Try to find columns intelligently
//         const dateCol = findColumn(headers, ['date', 'transactiondate', 'day', 'transdate', 'posting date', 'value date']);
//         const descCol = findColumn(headers, ['description', 'desc', 'name', 'merchant', 'title', 'particulars', 'narration', 'details']);
//         const amountCol = findColumn(headers, ['amount', 'amt', 'price', 'value', 'total']);
//         const creditCol = findColumn(headers, ['credit', 'cr', 'deposit', 'incoming']);
//         const debitCol = findColumn(headers, ['debit', 'dr', 'withdrawal', 'outgoing', 'payment']);
//         const typeCol = findColumn(headers, ['type', 'transactiontype', 'txntype', 'dr/cr', 'credit/debit']);
        
//         console.log('🎯 Column mapping:', {
//             date: dateCol >= 0 ? headers[dateCol] : 'not found',
//             description: descCol >= 0 ? headers[descCol] : 'not found',
//             amount: amountCol >= 0 ? headers[amountCol] : 'not found',
//             credit: creditCol >= 0 ? headers[creditCol] : 'not found',
//             debit: debitCol >= 0 ? headers[debitCol] : 'not found',
//             type: typeCol >= 0 ? headers[typeCol] : 'not found'
//         });
        
//         const transactions = [];
        
//         // Process each row
//         const maxRows = Math.min(lines.length, 5000); // Increased limit
//         for (let i = 1; i < maxRows; i++) {
//             const line = lines[i].trim();
//             if (!line) continue;
            
//             const values = parseCSVLine(line);
            
//             // Determine transaction amount and type
//             let amount = 0;
//             let transactionType = 'debit'; // Default to debit
            
//             // Method 1: Check if there's a separate credit/debit column
//             if (creditCol >= 0 && values[creditCol]) {
//                 let creditValue = parseAmount(values[creditCol]);
//                 if (creditValue > 0) {
//                     amount = creditValue;
//                     transactionType = 'credit';
//                 }
//             }
            
//             if (debitCol >= 0 && values[debitCol] && amount === 0) {
//                 let debitValue = parseAmount(values[debitCol]);
//                 if (debitValue > 0) {
//                     amount = debitValue;
//                     transactionType = 'debit';
//                 }
//             }
            
//             // Method 2: Check for explicit type column
//             if (typeCol >= 0 && values[typeCol] && amount === 0) {
//                 const typeValue = values[typeCol].toString().toLowerCase();
//                 if (typeValue === 'credit' || typeValue === 'cr' || typeValue === 'c') {
//                     transactionType = 'credit';
//                 } else if (typeValue === 'debit' || typeValue === 'dr' || typeValue === 'd') {
//                     transactionType = 'debit';
//                 }
                
//                 // If we have type but no amount yet, look for amount column
//                 if (amountCol >= 0 && values[amountCol]) {
//                     amount = parseAmount(values[amountCol]);
//                 }
//             }
            
//             // Method 3: Use single amount column with sign detection
//             if (amount === 0 && amountCol >= 0 && values[amountCol]) {
//                 const amountStr = values[amountCol].toString();
//                 const isNegative = amountStr.includes('-') || amountStr.startsWith('(');
                
//                 // Remove negative sign and parentheses
//                 let cleanAmount = amountStr.replace(/[^0-9.-]/g, '');
//                 amount = Math.abs(parseFloat(cleanAmount));
                
//                 if (isNaN(amount)) amount = 0;
                
//                 // Determine type based on sign
//                 if (amountStr.includes('-') || amountStr.startsWith('(')) {
//                     transactionType = 'debit';
//                 } else {
//                     transactionType = 'credit';
//                 }
//             }
            
//             // Skip if amount is zero
//             if (amount === 0) {
//                 console.log(`⚠️ Skipping row ${i}: amount is 0`);
//                 continue;
//             }
            
//             // Get description
//             let description = `Transaction ${i}`;
//             if (descCol >= 0 && values[descCol]) {
//                 description = values[descCol].toString().trim();
//                 // Truncate if too long
//                 if (description.length > 100) {
//                     description = description.substring(0, 100);
//                 }
//             }
            
//             // Get date
//             let transactionDate = new Date().toISOString().split('T')[0];
//             if (dateCol >= 0 && values[dateCol]) {
//                 transactionDate = formatDate(values[dateCol]);
//             }
            
//             const transaction = {
//                 userId: req.user._id,
//                 name: description,
//                 amount: amount,
//                 date: transactionDate,
//                 category: 'Imported',
//                 type: transactionType,
//                 status: 'success',
//                 createdAt: new Date()
//             };
            
//             transactions.push(transaction);
//         }
        
//         console.log(`📊 Parsed ${transactions.length} transactions`);
//         console.log(`📈 Type breakdown: Credit: ${transactions.filter(t => t.type === 'credit').length}, Debit: ${transactions.filter(t => t.type === 'debit').length}`);
        
//         // Save to database
//         if (transactions.length > 0) {
//             await Transaction.insertMany(transactions);
//             console.log(`💾 Saved ${transactions.length} transactions to database`);
//         } else {
//             console.warn('⚠️ No valid transactions found in CSV');
//             return res.status(400).json({
//                 success: false,
//                 message: 'No valid transactions found in CSV file. Please check the format.'
//             });
//         }
        
//         // Return success response
//         res.json({
//             success: true,
//             message: `Successfully uploaded and processed ${transactions.length} transactions`,
//             data: {
//                 file: {
//                     originalName: req.file.originalname,
//                     savedName: req.file.filename,
//                     path: req.file.path,
//                     size: req.file.size
//                 },
//                 transactions: {
//                     count: transactions.length,
//                     creditCount: transactions.filter(t => t.type === 'credit').length,
//                     debitCount: transactions.filter(t => t.type === 'debit').length,
//                     sample: transactions.slice(0, 5)
//                 }
//             }
//         });
        
//     } catch (error) {
//         console.error('❌ Upload error:', error);
//         res.status(500).json({ 
//             success: false, 
//             message: 'Failed to upload file: ' + error.message 
//         });
//     }
// };

// // Get user files
// const getUserFiles = async (req, res) => {
//     try {
//         const userDir = path.join(__dirname, '..', 'uploadsCSVs', req.user._id.toString());
//         console.log('📁 Looking for files in:', userDir);
        
//         let files = [];
        
//         if (fs.existsSync(userDir)) {
//             const fileList = fs.readdirSync(userDir);
//             console.log(`📄 Found ${fileList.length} files`);
            
//             for (const filename of fileList) {
//                 const filePath = path.join(userDir, filename);
//                 const stats = fs.statSync(filePath);
                
//                 files.push({
//                     id: filename,
//                     name: filename,
//                     size: stats.size,
//                     uploadDate: stats.mtime,
//                     path: filePath
//                 });
//             }
            
//             files.sort((a, b) => b.uploadDate - a.uploadDate);
//         } else {
//             console.log('⚠️ User directory does not exist yet');
//         }
        
//         res.json({
//             success: true,
//             files: files,
//             count: files.length
//         });
        
//     } catch (error) {
//         console.error('Error:', error);
//         res.status(500).json({ success: false, message: error.message });
//     }
// };

// // Download file
// const downloadFile = async (req, res) => {
//     try {
//         const { fileId } = req.params;
//         const userDir = path.join(__dirname, '..', 'uploadsCSVs', req.user._id.toString());
//         const filePath = path.join(userDir, fileId);
        
//         console.log('📥 Downloading file:', filePath);
        
//         if (!fs.existsSync(filePath)) {
//             return res.status(404).json({ success: false, message: 'File not found' });
//         }
        
//         res.download(filePath);
        
//     } catch (error) {
//         console.error('Error:', error);
//         res.status(500).json({ success: false, message: error.message });
//     }
// };

// // Delete file
// const deleteFile = async (req, res) => {
//     try {
//         const { fileId } = req.params;
//         const userDir = path.join(__dirname, '..', 'uploadsCSVs', req.user._id.toString());
//         const filePath = path.join(userDir, fileId);
        
//         console.log('🗑️ Deleting file:', filePath);
        
//         if (fs.existsSync(filePath)) {
//             fs.unlinkSync(filePath);
//         }
        
//         res.json({ success: true, message: 'File deleted successfully' });
        
//     } catch (error) {
//         console.error('Error:', error);
//         res.status(500).json({ success: false, message: error.message });
//     }
// };

// // Helper function to parse amount from string
// const parseAmount = (value) => {
//     if (!value) return 0;
//     const cleanValue = value.toString().replace(/[^0-9.-]/g, '');
//     const amount = parseFloat(cleanValue);
//     return isNaN(amount) ? 0 : Math.abs(amount);
// };

// // Helper functions
// const findColumn = (headers, possibleNames) => {
//     for (const name of possibleNames) {
//         const index = headers.findIndex(h => h.includes(name));
//         if (index !== -1) return index;
//     }
//     return -1;
// };

// const parseCSVLine = (line) => {
//     const result = [];
//     let current = '';
//     let inQuotes = false;
    
//     for (let i = 0; i < line.length; i++) {
//         const char = line[i];
        
//         if (char === '"') {
//             inQuotes = !inQuotes;
//         } else if (char === ',' && !inQuotes) {
//             result.push(current.trim());
//             current = '';
//         } else {
//             current += char;
//         }
//     }
//     result.push(current.trim());
    
//     // Remove quotes from values
//     return result.map(v => v.replace(/^"|"$/g, ''));
// };

// const formatDate = (dateStr) => {
//     if (!dateStr) return new Date().toISOString().split('T')[0];
    
//     try {
//         // Handle different date formats
//         let date = new Date(dateStr);
        
//         // If that fails, try parsing DD/MM/YYYY or MM/DD/YYYY
//         if (isNaN(date.getTime()) && dateStr.includes('/')) {
//             const parts = dateStr.split('/');
//             if (parts.length === 3) {
//                 // Try DD/MM/YYYY first
//                 date = new Date(`${parts[1]}/${parts[0]}/${parts[2]}`);
//                 if (isNaN(date.getTime())) {
//                     // Try MM/DD/YYYY
//                     date = new Date(`${parts[0]}/${parts[1]}/${parts[2]}`);
//                 }
//             }
//         }
        
//         if (!isNaN(date.getTime())) {
//             return date.toISOString().split('T')[0];
//         }
//     } catch (e) {
//         console.warn('Date parsing failed:', dateStr);
//     }
    
//     return new Date().toISOString().split('T')[0];
// };

// module.exports = {
//     uploadCSV,
//     getUserFiles,
//     deleteFile,
//     downloadFile
// };













const Transaction = require('../models/Transaction');
const fs = require('fs');
const path = require('path');

// Category detection function
function detectCategory(description, amount, transactionType) {
    const desc = (description || '').toLowerCase();
    
    // Only categorize debit transactions (spending)
    if (transactionType === 'credit') {
        return 'Income';
    }
    
    // Food & Dining
    if (desc.includes('swiggy') || desc.includes('zomato') || desc.includes('restaurant') || 
        desc.includes('food') || desc.includes('cafe') || desc.includes('starbucks') ||
        desc.includes('pizza') || desc.includes('burger') || desc.includes('mcdonalds') ||
        desc.includes('kfc') || desc.includes('dominos') || desc.includes('dining') ||
        desc.includes('eat') || desc.includes('meal') || desc.includes('lunch') ||
        desc.includes('dinner') || desc.includes('breakfast') || desc.includes('coffee')) {
        return 'Food & Dining';
    }
    
    // Shopping
    if (desc.includes('amazon') || desc.includes('flipkart') || desc.includes('myntra') ||
        desc.includes('ajio') || desc.includes('nykaa') || desc.includes('shopping') ||
        desc.includes('mall') || desc.includes('zara') || desc.includes('h&m') ||
        desc.includes('pantaloons') || desc.includes('westside') || desc.includes('lifestyle') ||
        desc.includes('cloth') || desc.includes('shoe') || desc.includes('fashion') ||
        desc.includes('grocery') || desc.includes('bigbasket') || desc.includes('dmart')) {
        return 'Shopping';
    }
    
    // Transportation
    if (desc.includes('uber') || desc.includes('ola') || desc.includes('metro') ||
        desc.includes('bus') || desc.includes('train') || desc.includes('petrol') ||
        desc.includes('fuel') || desc.includes('gas') || desc.includes('taxi') ||
        desc.includes('rapido') || desc.includes('auto') || desc.includes('cab') ||
        desc.includes('transport') || desc.includes('travel') || desc.includes('flight') ||
        desc.includes('indigo') || desc.includes('makemytrip') || desc.includes('redbus')) {
        return 'Transport';
    }
    
    // Entertainment
    if (desc.includes('netflix') || desc.includes('prime') || desc.includes('hotstar') ||
        desc.includes('movie') || desc.includes('cinema') || desc.includes('spotify') ||
        desc.includes('youtube') || desc.includes('theatre') || desc.includes('gaana') ||
        desc.includes('disney') || desc.includes('hbo') || desc.includes('jiosaavn') ||
        desc.includes('bookmyshow') || desc.includes('game') || desc.includes('gaming')) {
        return 'Entertainment';
    }
    
    // Bills & Utilities
    if (desc.includes('electricity') || desc.includes('water') || desc.includes('gas') ||
        desc.includes('broadband') || desc.includes('wifi') || desc.includes('mobile') ||
        desc.includes('phone') || desc.includes('bill') || desc.includes('rent') ||
        desc.includes('maintenance') || desc.includes('society') || desc.includes('jio') ||
        desc.includes('airtel') || desc.includes('vi') || desc.includes('vodafone') ||
        desc.includes('act') || desc.includes('internet')) {
        return 'Bills & Utilities';
    }
    
    // Healthcare
    if (desc.includes('hospital') || desc.includes('clinic') || desc.includes('doctor') ||
        desc.includes('pharmacy') || desc.includes('medicine') || desc.includes('health') ||
        desc.includes('med') || desc.includes('apollo') || desc.includes('fortis') ||
        desc.includes('diagnostic') || desc.includes('lab') || desc.includes('dental')) {
        return 'Healthcare';
    }
    
    // Education
    if (desc.includes('school') || desc.includes('college') || desc.includes('university') ||
        desc.includes('course') || desc.includes('book') || desc.includes('education') ||
        desc.includes('tuition') || desc.includes('class') || desc.includes('learning') ||
        desc.includes('udemy') || desc.includes('coursera')) {
        return 'Education';
    }
    
    // Subscription
    if (desc.includes('subscription') || desc.includes('monthly') || desc.includes('renewal') ||
        desc.includes('membership') || desc.includes('premium') || desc.includes('app')) {
        return 'Subscriptions';
    }
    
    // Banking/ATM
    if (desc.includes('atm') || desc.includes('withdrawal') || desc.includes('cash')) {
        return 'Cash Withdrawal';
    }
    
    return 'Other';
}

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
        const dateCol = findColumn(headers, ['date', 'transactiondate', 'day', 'transdate', 'posting date', 'value date']);
        const descCol = findColumn(headers, ['description', 'desc', 'name', 'merchant', 'title', 'particulars', 'narration', 'details']);
        const amountCol = findColumn(headers, ['amount', 'amt', 'price', 'value', 'total']);
        const creditCol = findColumn(headers, ['credit', 'cr', 'deposit', 'incoming']);
        const debitCol = findColumn(headers, ['debit', 'dr', 'withdrawal', 'outgoing', 'payment']);
        const typeCol = findColumn(headers, ['type', 'transactiontype', 'txntype', 'dr/cr', 'credit/debit']);
        
        console.log('🎯 Column mapping:', {
            date: dateCol >= 0 ? headers[dateCol] : 'not found',
            description: descCol >= 0 ? headers[descCol] : 'not found',
            amount: amountCol >= 0 ? headers[amountCol] : 'not found',
            credit: creditCol >= 0 ? headers[creditCol] : 'not found',
            debit: debitCol >= 0 ? headers[debitCol] : 'not found',
            type: typeCol >= 0 ? headers[typeCol] : 'not found'
        });
        
        const transactions = [];
        const categoryStats = {}; // Track categories for debug
        
        // Process each row
        const maxRows = Math.min(lines.length, 5000);
        for (let i = 1; i < maxRows; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const values = parseCSVLine(line);
            
            // Determine transaction amount and type
            let amount = 0;
            let transactionType = 'debit'; // Default to debit
            
            // Method 1: Check if there's a separate credit/debit column
            if (creditCol >= 0 && values[creditCol]) {
                let creditValue = parseAmount(values[creditCol]);
                if (creditValue > 0) {
                    amount = creditValue;
                    transactionType = 'credit';
                }
            }
            
            if (debitCol >= 0 && values[debitCol] && amount === 0) {
                let debitValue = parseAmount(values[debitCol]);
                if (debitValue > 0) {
                    amount = debitValue;
                    transactionType = 'debit';
                }
            }
            
            // Method 2: Check for explicit type column
            if (typeCol >= 0 && values[typeCol] && amount === 0) {
                const typeValue = values[typeCol].toString().toLowerCase();
                if (typeValue === 'credit' || typeValue === 'cr' || typeValue === 'c') {
                    transactionType = 'credit';
                } else if (typeValue === 'debit' || typeValue === 'dr' || typeValue === 'd') {
                    transactionType = 'debit';
                }
                
                if (amountCol >= 0 && values[amountCol]) {
                    amount = parseAmount(values[amountCol]);
                }
            }
            
            // Method 3: Use single amount column with sign detection
            if (amount === 0 && amountCol >= 0 && values[amountCol]) {
                const amountStr = values[amountCol].toString();
                const isNegative = amountStr.includes('-') || amountStr.startsWith('(');
                
                let cleanAmount = amountStr.replace(/[^0-9.-]/g, '');
                amount = Math.abs(parseFloat(cleanAmount));
                
                if (isNaN(amount)) amount = 0;
                
                if (amountStr.includes('-') || amountStr.startsWith('(')) {
                    transactionType = 'debit';
                } else {
                    transactionType = 'credit';
                }
            }
            
            // Skip if amount is zero
            if (amount === 0) {
                console.log(`⚠️ Skipping row ${i}: amount is 0`);
                continue;
            }
            
            // Get description
            let description = `Transaction ${i}`;
            if (descCol >= 0 && values[descCol]) {
                description = values[descCol].toString().trim();
                if (description.length > 100) {
                    description = description.substring(0, 100);
                }
            }
            
            // Get date
            let transactionDate = new Date().toISOString().split('T')[0];
            if (dateCol >= 0 && values[dateCol]) {
                transactionDate = formatDate(values[dateCol]);
            }
            
            // DETECT CATEGORY BASED ON DESCRIPTION AND TYPE
            const category = detectCategory(description, amount, transactionType);
            
            // Track category stats
            categoryStats[category] = (categoryStats[category] || 0) + 1;
            
            const transaction = {
                userId: req.user._id,
                name: description,
                amount: amount,
                date: transactionDate,
                category: category,  // ← NOW USING DETECTED CATEGORY!
                type: transactionType,
                status: 'success',
                createdAt: new Date()
            };
            
            transactions.push(transaction);
        }
        
        console.log(`📊 Parsed ${transactions.length} transactions`);
        console.log(`📈 Type breakdown: Credit: ${transactions.filter(t => t.type === 'credit').length}, Debit: ${transactions.filter(t => t.type === 'debit').length}`);
        console.log(`📊 Category breakdown:`, categoryStats);
        
        // Save to database
        if (transactions.length > 0) {
            await Transaction.insertMany(transactions);
            console.log(`💾 Saved ${transactions.length} transactions to database`);
        } else {
            console.warn('⚠️ No valid transactions found in CSV');
            return res.status(400).json({
                success: false,
                message: 'No valid transactions found in CSV file. Please check the format.'
            });
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
                    creditCount: transactions.filter(t => t.type === 'credit').length,
                    debitCount: transactions.filter(t => t.type === 'debit').length,
                    categories: categoryStats,
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

// Helper function to parse amount from string
const parseAmount = (value) => {
    if (!value) return 0;
    const cleanValue = value.toString().replace(/[^0-9.-]/g, '');
    const amount = parseFloat(cleanValue);
    return isNaN(amount) ? 0 : Math.abs(amount);
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
        let date = new Date(dateStr);
        
        if (isNaN(date.getTime()) && dateStr.includes('/')) {
            const parts = dateStr.split('/');
            if (parts.length === 3) {
                date = new Date(`${parts[1]}/${parts[0]}/${parts[2]}`);
                if (isNaN(date.getTime())) {
                    date = new Date(`${parts[0]}/${parts[1]}/${parts[2]}`);
                }
            }
        }
        
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