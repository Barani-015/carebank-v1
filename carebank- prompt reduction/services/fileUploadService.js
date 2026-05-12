const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Define upload directory - absolute path for clarity
const UPLOAD_DIR = path.join(__dirname, '..', 'uploadsCSVs');

// Ensure main upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    console.log('📁 Created main upload directory:', UPLOAD_DIR);
}

// Configure storage
const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        // Get user ID from authenticated user
        const userId = req.user._id.toString();
        
        // Create user-specific folder
        const userDir = path.join(UPLOAD_DIR, userId);
        
        // Create directory if it doesn't exist
        if (!fs.existsSync(userDir)) {
            fs.mkdirSync(userDir, { recursive: true });
            console.log('📁 Created user directory:', userDir);
        }
        
        console.log('📂 Saving file to:', userDir);
        cb(null, userDir);
    },
    filename: function(req, file, cb) {
        // Create unique filename: timestamp_originalname
        const timestamp = Date.now();
        const originalName = file.originalname;
        const filename = `${timestamp}_${originalName}`;
        console.log('📄 Generated filename:', filename);
        cb(null, filename);
    }
});

// File filter - only CSV
const fileFilter = (req, file, cb) => {
    console.log('🔍 Checking file:', file.originalname, 'Type:', file.mimetype);
    
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
        console.log('✅ CSV file accepted');
        cb(null, true);
    } else {
        console.log('❌ File rejected - not a CSV');
        cb(new Error('Only CSV files are allowed'), false);
    }
};

// Create multer instance
const uploadMiddleware = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    fileFilter: fileFilter
}).single('csvFile');

// Export wrapped middleware
const upload = (req, res, next) => {
    console.log('🚀 Upload middleware executing...');
    
    uploadMiddleware(req, res, (err) => {
        if (err) {
            console.error('❌ Upload error:', err);
            
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ 
                    success: false, 
                    message: 'File size exceeds 50MB limit' 
                });
            }
            
            return res.status(400).json({ 
                success: false, 
                message: err.message 
            });
        }
        
        if (!req.file) {
            console.log('⚠️ No file in request');
            return res.status(400).json({ 
                success: false, 
                message: 'No file uploaded. Please use field name "csvFile"' 
            });
        }
        
        console.log('✅ File uploaded successfully!');
        console.log('   Original name:', req.file.originalname);
        console.log('   Saved as:', req.file.filename);
        console.log('   Location:', req.file.path);
        console.log('   Size:', req.file.size, 'bytes');
        
        next();
    });
};

module.exports = { upload };