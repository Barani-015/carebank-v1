// const mongoose = require('mongoose');
// const fs = require('fs');
// const { ObjectId } = require('mongodb');

// async function downloadFileDirectly() {
//     try {
//         // Connect to MongoDB
//         await mongoose.connect('mongodb://localhost:27017/carebank');
//         console.log('✅ Connected to MongoDB');
        
//         const db = mongoose.connection.db;
        
//         // List all available files first
//         console.log('\n📁 Available files in database:\n');
//         const allFiles = await db.collection('csvFiles.files').find({}).toArray();

        
        
//         if (allFiles.length === 0) {
//             console.log('❌ No files found in database');
//             return;
//         }
        
//         allFiles.forEach((file, index) => {
//             console.log(`${index + 1}. File ID: ${file._id}`);
//             console.log(`   Filename: ${file.filename}`);
//             console.log(`   Original Name: ${file.metadata?.originalName || 'N/A'}`);
//             console.log(`   Size: ${(file.length / 1024).toFixed(2)} KB`);
//             console.log(`   Upload Date: ${file.uploadDate}`);
//             console.log(`   User ID: ${file.metadata?.userId || 'N/A'}`);
//             console.log('---');
//         });
        
//         // Try both file IDs
//         const fileIdsToTry = [
//             '69e99a3fe2d57e413c7884a2',  // First file
//             '69e99cd3e2d57e413c78873a',
//             '69e99a3fe2d57e413c7884a3',
//             '69e99cd3e2d57e413c78873b'   // Second file
//         ];
        
//         let success = false;
        
//         for (const fileId of fileIdsToTry) {
//             console.log(`\n📥 Trying to download file: ${fileId}`);
            
//             try {
//                 const objectId = new ObjectId(fileId);
                
//                 // Find the file
//                 const file = await db.collection('csvFiles.files').findOne({ _id: objectId });
                
//                 if (!file) {
//                     console.log(`❌ File ${fileId} not found`);
//                     continue;
//                 }
                
//                 console.log(`✅ Found file: ${file.filename}`);
//                 console.log(`📊 Size: ${(file.length / 1024).toFixed(2)} KB`);
                
//                 // Get the original filename
//                 let outputFilename = file.metadata?.originalName || file.filename;
//                 if (!outputFilename.endsWith('.csv')) {
//                     outputFilename = outputFilename + '.csv';
//                 }
                
//                 console.log(`💾 Saving as: ${outputFilename}`);
                
//                 // Create GridFS bucket
//                 const bucket = new mongoose.mongo.GridFSBucket(db, { 
//                     bucketName: 'csvFiles' 
//                 });
                
//                 // Download the file
//                 const downloadStream = bucket.openDownloadStream(objectId);
//                 const writeStream = fs.createWriteStream(outputFilename);
                
//                 let errorOccurred = false;
                
//                 await new Promise((resolve, reject) => {
//                     downloadStream.on('error', (err) => {
//                         console.error('❌ Download error:', err);
//                         errorOccurred = true;
//                         reject(err);
//                     });
                    
//                     writeStream.on('error', (err) => {
//                         console.error('❌ Write error:', err);
//                         errorOccurred = true;
//                         reject(err);
//                     });
                    
//                     writeStream.on('finish', () => {
//                         if (!errorOccurred) {
//                             console.log(`✅ File downloaded successfully as: ${outputFilename}`);
//                             resolve();
//                         }
//                     });
                    
//                     downloadStream.pipe(writeStream);
//                 });
                
//                 success = true;
//                 break;
                
//             } catch (err) {
//                 console.error(`❌ Failed to download ${fileId}:`, err.message);
//             }
//         }
        
//         if (!success) {
//             console.log('\n❌ Could not download any file');
//         }
        
//         process.exit(0);
        
//     } catch (error) {
//         console.error('❌ Error:', error);
//         process.exit(1);
//     }
// }

// // Run the download
// downloadFileDirectly();






const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { ObjectId } = require('mongodb');

async function downloadSpecificFile() {
    try {
        // Connect to MongoDB
        await mongoose.connect('mongodb://localhost:27017/carebank');
        console.log('✅ Connected to MongoDB');
        
        const db = mongoose.connection.db;
        
        // Create downloadedcsv folder
        const downloadFolder = path.join(__dirname, 'downloadedcsv');
        if (!fs.existsSync(downloadFolder)) {
            fs.mkdirSync(downloadFolder, { recursive: true });
            console.log(`📁 Created folder: ${downloadFolder}`);
        }
        
        // Specific file ID (the one with 650 rows)
        const fileId = '69e99cd3e2d57e413c78873a';
        
        // Find the file
        const file = await db.collection('csvFiles.files').findOne({ 
            _id: new ObjectId(fileId) 
        });
        
        if (!file) {
            console.log(`❌ File not found with ID: ${fileId}`);
            return;
        }
        
        console.log(`\n📄 File found:`);
        console.log(`   ID: ${file._id}`);
        console.log(`   Original Name: ${file.metadata?.originalName || file.filename}`);
        console.log(`   Size: ${(file.length / 1024).toFixed(2)} KB`);
        
        // Save as downloadedcsv.csv
        const savePath = path.join(downloadFolder, 'downloadedcsv.csv');
        console.log(`💾 Saving to: ${savePath}`);
        
        const bucket = new mongoose.mongo.GridFSBucket(db, { 
            bucketName: 'csvFiles' 
        });
        
        const downloadStream = bucket.openDownloadStream(new ObjectId(fileId));
        const writeStream = fs.createWriteStream(savePath);
        
        await new Promise((resolve, reject) => {
            writeStream.on('finish', () => {
                console.log(`\n✅ File downloaded successfully!`);
                console.log(`📂 Location: ${savePath}`);
                resolve();
            });
            writeStream.on('error', reject);
            downloadStream.on('error', reject);
            downloadStream.pipe(writeStream);
        });
        
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

downloadSpecificFile();