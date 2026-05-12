// const fs = require('fs');
// const path = require('path');
// const axios = require('axios');

// class LlamaService {
//     constructor() {
//         // Ollama API endpoint (default local)
//         this.ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
//         this.model = process.env.LLAMA_MODEL || 'llama3.2';
//     }

//     // Check if Ollama is running
//     async isAvailable() {
//         try {
//             const response = await axios.get(`${this.ollamaUrl}/api/tags`);
//             return response.status === 200;
//         } catch (error) {
//             console.error('Ollama not available:', error.message);
//             return false;
//         }
//     }

//     // Read CSV file content
//     readCSVFile(localPath) {
//         try {
//             if (!fs.existsSync(localPath)) {
//                 throw new Error(`File not found: ${localPath}`);
//             }
//             const content = fs.readFileSync(localPath, 'utf-8');
//             return content;
//         } catch (error) {
//             console.error('Error reading CSV:', error);
//             throw error;
//         }
//     }

//     // Get CSV data as structured format
//     parseCSVToJson(csvContent) {
//         const lines = csvContent.split('\n');
//         if (lines.length < 2) return [];
        
//         const headers = lines[0].split(',').map(h => h.trim());
//         const data = [];
        
//         for (let i = 1; i < Math.min(lines.length, 100); i++) { // Limit to first 100 rows
//             if (!lines[i].trim()) continue;
            
//             const values = this.parseCSVLine(lines[i]);
//             const row = {};
//             headers.forEach((header, idx) => {
//                 row[header] = values[idx] || '';
//             });
//             data.push(row);
//         }
        
//         return data;
//     }

//     parseCSVLine(line) {
//         const result = [];
//         let current = '';
//         let inQuotes = false;
        
//         for (const char of line) {
//             if (char === '"') {
//                 inQuotes = !inQuotes;
//             } else if (char === ',' && !inQuotes) {
//                 result.push(current.trim());
//                 current = '';
//             } else {
//                 current += char;
//             }
//         }
//         result.push(current.trim());
//         return result;
//     }

//     // Generate summary of CSV data
//     async generateCSVSummary(csvContent, fileName) {
//         const csvData = this.parseCSVToJson(csvContent);
        
//         const prompt = `You are a financial data analyst. Analyze this CSV file named "${fileName}" and provide a summary.

// CSV Data (first 50 rows):
// ${JSON.stringify(csvData.slice(0, 50), null, 2)}

// Please provide:
// 1. A brief overview of what this data represents
// 2. Key statistics (total transactions, date range, total amount)
// 3. Spending patterns or trends you notice
// 4. Any anomalies or interesting insights
// 5. Recommendations based on this data

// Response:`;

//         return await this.queryLlama(prompt);
//     }

//     // Answer specific question about CSV
//     async askAboutCSV(csvContent, fileName, question) {
//         const csvData = this.parseCSVToJson(csvContent);
        
//         const prompt = `You are a financial AI assistant. Based on the CSV data from "${fileName}", answer the user's question.

// CSV Data (first 100 rows):
// ${JSON.stringify(csvData.slice(0, 100), null, 2)}

// User Question: ${question}

// Instructions:
// - Only answer based on the data provided
// - If the data doesn't contain the answer, say so
// - Be specific and use actual numbers from the data
// - Provide actionable insights

// Answer:`;

//         return await this.queryLlama(prompt);
//     }

//     // Query Llama model
//     async queryLlama(prompt) {
//         try {
//             const response = await axios.post(`${this.ollamaUrl}/api/generate`, {
//                 model: this.model,
//                 prompt: prompt,
//                 stream: false,
//                 options: {
//                     temperature: 0.7,
//                     top_p: 0.9,
//                     top_k: 40
//                 }
//             });
            
//             return {
//                 success: true,
//                 response: response.data.response,
//                 model: this.model
//             };
            
//         } catch (error) {
//             console.error('Llama query error:', error);
            
//             // Fallback response if Ollama is not running
//             if (error.code === 'ECONNREFUSED') {
//                 return {
//                     success: false,
//                     error: 'Ollama service is not running. Please run: ollama serve',
//                     response: "⚠️ AI service is not available. Please ensure Ollama is running with Llama model installed.\n\nTo set up:\n1. Install Ollama from https://ollama.ai\n2. Run 'ollama pull llama3'\n3. Run 'ollama serve'"
//                 };
//             }
            
//             return {
//                 success: false,
//                 error: error.message,
//                 response: "Sorry, I encountered an error processing your request."
//             };
//         }
//     }

//     // Analyze all user files
//     async analyzeAllUserFiles(userId, files) {
//         const analyses = [];
        
//         for (const file of files) {
//             if (file.localPath && fs.existsSync(file.localPath)) {
//                 const content = this.readCSVFile(file.localPath);
//                 const summary = await this.generateCSVSummary(content, file.originalName);
//                 analyses.push({
//                     fileId: file.id,
//                     fileName: file.originalName,
//                     summary: summary
//                 });
//             }
//         }
        
//         return analyses;
//     }
// }

// module.exports = new LlamaService();



// const fetch = require('node-fetch');

async function getAIResponse(prompt, retries = 3, delay = 2000) {
  // Use Ollama directly instead of Python service
  const OLLAMA_URL = 'http://127.0.0.1:11434'; // Use 127.0.0.1 instead of localhost
  
  // Get available model - check which model you have installed
  let modelName = 'llama3.2'; // Default
  
  try {
    // Check available models
    const modelsRes = await fetch(`${OLLAMA_URL}/api/tags`);
    const modelsData = await modelsRes.json();
    
    if (modelsData.models && modelsData.models.length > 0) {
      modelName = modelsData.models[0].name;
      console.log(`📦 Using model: ${modelName}`);
    } else {
      console.log('⚠️ No models found. Please run: ollama pull llama2');
    }
  } catch (error) {
    console.log('⚠️ Could not fetch models, using default:', modelName);
  }
  
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`🔄 Connecting to Ollama (attempt ${i + 1}/${retries})...`);
      
      const response = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          model: modelName,
          prompt: prompt,
          stream: false,
          options: {
            temperature: 0.7,
            top_p: 0.9
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama Error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log("✅ AI response received successfully");
      
      return {
        response: data.response,
        success: true
      };

    } catch (error) {
      console.error(`❌ Attempt ${i + 1} failed: ${error.message}`);
      
      if (i < retries - 1) {
        console.log(`⏳ Retrying in ${delay / 1000}s...`);
        await new Promise(res => setTimeout(res, delay));
        delay = Math.min(delay * 1.5, 10000);
      } else {
        console.error("❌ Ollama service unavailable after all retries.");
        return {
          response: "I'm sorry, the AI service is currently unavailable. Please make sure Ollama is running.\n\nTo fix this:\n1. Open a terminal and run: ollama serve\n2. Pull a model: ollama pull llama2\n3. Try again.",
          success: false
        };
      }
    }
  }
}

module.exports = { getAIResponse };