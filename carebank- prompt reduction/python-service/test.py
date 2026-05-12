from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import requests
import json
import os
import pandas as pd
from pathlib import Path
from typing import Dict, List, Any
import logging
import traceback
from functools import lru_cache
from datetime import datetime, timedelta
import numpy as np

# RAG imports
try:
    from sentence_transformers import SentenceTransformer
    import faiss
    RAG_AVAILABLE = True
except ImportError:
    RAG_AVAILABLE = False
    print("⚠️ Warning: sentence-transformers or faiss not installed. RAG features disabled.")
    print("   Install with: pip install sentence-transformers faiss-cpu")

app = Flask(__name__)
CORS(app)

# Configuration
OLLAMA_URL = "http://127.0.0.1:11434"
# MODEL_NAME = "llama3.2:latest"  # or "llama3.2:1b" for faster responses
# MODEL_NAME = "llama3.2:1b-instruct-q4_0"
MODEL_NAME = "qwen2.5:1.5b"

# IMPORTANT: Point to your uploadsCSVs folder (relative to this script)
BASE_DIR = Path(__file__).parent.parent
UPLOAD_CSV_FOLDER = BASE_DIR / "uploadsCSVs"

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ============= CSV CACHE SYSTEM =============
csv_cache = {}
CACHE_TTL = 300  # Cache for 5 minutes

def get_cached_csv_data(user_id: str):
    """Get CSV data from cache or load fresh"""
    current_time = datetime.now()
    
    if user_id in csv_cache:
        cache_entry = csv_cache[user_id]
        if current_time - cache_entry['timestamp'] < timedelta(seconds=CACHE_TTL):
            logger.info(f"📦 Using CACHED CSV data for user {user_id}")
            return cache_entry['data']
    
    # Load fresh data
    logger.info(f"🔄 Loading FRESH CSV data for user {user_id}")
    csv_data = load_user_csv_files(user_id)
    
    # Store in cache
    csv_cache[user_id] = {
        'data': csv_data,
        'timestamp': current_time
    }
    
    return csv_data

def invalidate_cache(user_id: str = None):
    """Invalidate cache for a specific user or all users"""
    if user_id:
        csv_cache.pop(user_id, None)
        logger.info(f"🗑️ Cache invalidated for user {user_id}")
    else:
        csv_cache.clear()
        logger.info(f"🗑️ All cache invalidated")

# ============= RAG SYSTEM =============
class CSV_RAG_System:
    """Retrieval system for CSV data to reduce context size"""
    
    def __init__(self):
        self.encoder = None
        self.indexes = {}
        self.text_chunks = {}
        self.user_summaries = {}
        
    def init_encoder(self):
        """Initialize the embedding model (lazy loading)"""
        if self.encoder is None and RAG_AVAILABLE:
            logger.info("🔧 Initializing embedding model...")
            self.encoder = SentenceTransformer('all-MiniLM-L6-v2')
            logger.info("✅ Embedding model ready")
    
    def index_user_data(self, user_id: str, csv_data: Dict[str, pd.DataFrame]):
        """Create searchable index for user's CSV data"""
        if not RAG_AVAILABLE:
            logger.warning("RAG not available, skipping indexing")
            return
        
        self.init_encoder()
        
        # Create quick summary for the user
        self._create_user_summary(user_id, csv_data)
        
        # Convert CSV data to text chunks
        all_chunks = []
        
        for filename, df in csv_data.items():
            # Create one chunk per row (but limit to reasonable amount)
            max_rows_to_index = min(len(df), 5000)
            
            for idx in range(max_rows_to_index):
                row = df.iloc[idx]
                chunk_parts = []
                for col in df.columns:
                    value = row[col]
                    if pd.notna(value):
                        chunk_parts.append(f"{col}: {value}")
                
                chunk_text = f"[FILE: {filename}] " + " | ".join(chunk_parts)
                all_chunks.append({
                    'text': chunk_text,
                    'filename': filename,
                    'row_index': idx,
                    'row_data': row.to_dict()
                })
            
            if len(df) > max_rows_to_index:
                logger.info(f"⚠️ {filename}: Indexed {max_rows_to_index} of {len(df)} rows")
        
        # Create embeddings and FAISS index
        if all_chunks:
            texts = [chunk['text'] for chunk in all_chunks]
            embeddings = self.encoder.encode(texts, show_progress_bar=False)
            
            dimension = embeddings.shape[1]
            index = faiss.IndexFlatL2(dimension)
            index.add(embeddings.astype('float32'))
            
            self.indexes[user_id] = index
            self.text_chunks[user_id] = all_chunks
            
            logger.info(f"✅ Indexed {len(all_chunks)} rows for user {user_id}")
    
    def _create_user_summary(self, user_id: str, csv_data: Dict[str, pd.DataFrame]):
        """Create a quick summary of user's data"""
        summary = {
            'total_files': len(csv_data),
            'total_rows': 0,
            'date_range': None,
            'total_spending': 0,
            'total_income': 0,
            'top_categories': {}
        }
        
        all_dates = []
        
        for filename, df in csv_data.items():
            summary['total_rows'] += len(df)
            
            if 'amount' in df.columns:
                if 'type' in df.columns:
                    summary['total_spending'] += df[df['type'] == 'debit']['amount'].sum()
                    summary['total_income'] += df[df['type'] == 'credit']['amount'].sum()
                    
                    if 'category' in df.columns:
                        category_spend = df[df['type'] == 'debit'].groupby('category')['amount'].sum().to_dict()
                        for cat, amt in category_spend.items():
                            if cat in summary['top_categories']:
                                summary['top_categories'][cat] += amt
                            else:
                                summary['top_categories'][cat] = amt
                else:
                    summary['total_spending'] += df['amount'].sum()
            
            if 'date' in df.columns:
                try:
                    dates = pd.to_datetime(df['date'], errors='coerce')
                    all_dates.extend(dates.dropna().tolist())
                except:
                    pass
        
        if summary['top_categories']:
            summary['top_categories'] = dict(sorted(summary['top_categories'].items(), key=lambda x: x[1], reverse=True)[:5])
        
        if all_dates:
            summary['date_range'] = {
                'from': min(all_dates).strftime('%Y-%m-%d'),
                'to': max(all_dates).strftime('%Y-%m-%d')
            }
        
        self.user_summaries[user_id] = summary
        logger.info(f"📊 Created summary for user {user_id}")
    
    def get_summary_context(self, user_id: str) -> str:
        """Get quick summary context for general questions"""
        if user_id not in self.user_summaries:
            return None
        
        summary = self.user_summaries[user_id]
        context = f"""
📊 QUICK SUMMARY:
- Total files: {summary['total_files']}
- Total transactions: {summary['total_rows']}
- Total spending: ₹{summary['total_spending']:,.2f}
- Total income: ₹{summary['total_income']:,.2f}
"""
        if summary['date_range']:
            context += f"- Date range: {summary['date_range']['from']} to {summary['date_range']['to']}\n"
        
        if summary['top_categories']:
            context += f"\n💰 TOP SPENDING CATEGORIES:\n"
            for cat, amt in list(summary['top_categories'].items())[:5]:
                context += f"  • {cat}: ₹{amt:,.2f}\n"
        
        return context
    
    def retrieve_relevant_data(self, user_id: str, question: str, top_k: int = 10) -> str:
        """Retrieve only the most relevant rows"""
        if not RAG_AVAILABLE or user_id not in self.indexes:
            return None
        
        self.init_encoder()
        
        question_embedding = self.encoder.encode([question])
        index = self.indexes[user_id]
        distances, indices = index.search(question_embedding.astype('float32'), top_k)
        
        relevant_chunks = []
        for idx in indices[0]:
            if idx < len(self.text_chunks[user_id]):
                relevant_chunks.append(self.text_chunks[user_id][idx])
        
        context_parts = ["🔍 MOST RELEVANT TRANSACTIONS:\n"]
        for i, chunk in enumerate(relevant_chunks, 1):
            context_parts.append(f"{i}. From {chunk['filename']}:")
            row_text = []
            for key, value in chunk['row_data'].items():
                if pd.notna(value):
                    if key == 'amount':
                        row_text.append(f"{key}: ₹{value:,.2f}")
                    elif key == 'date':
                        row_text.append(f"{key}: {value}")
                    else:
                        row_text.append(f"{key}: {value}")
            context_parts.append("   " + " | ".join(row_text))
        
        return "\n".join(context_parts)

# Initialize RAG system
rag_system = CSV_RAG_System()

# ============= CSV READING FUNCTIONS =============

def load_user_csv_files(user_id: str) -> Dict[str, pd.DataFrame]:
    """Load all CSV files from user-specific folder"""
    user_folder = UPLOAD_CSV_FOLDER / str(user_id)
    
    logger.info(f"Looking for user folder: {user_folder}")
    
    if not user_folder.exists():
        raise FileNotFoundError(f"User folder {user_id} not found at {user_folder}")
    
    csv_data = {}
    csv_files = list(user_folder.glob("*.csv"))
    logger.info(f"Found {len(csv_files)} CSV files in {user_folder}")
    
    for csv_file in csv_files:
        try:
            try:
                df = pd.read_csv(csv_file, encoding='utf-8')
            except UnicodeDecodeError:
                df = pd.read_csv(csv_file, encoding='latin1')
            
            csv_data[csv_file.name] = df
            logger.info(f"✅ Loaded: {csv_file.name} ({len(df)} rows, {len(df.columns)} columns)")
        except Exception as e:
            logger.error(f"❌ Error loading {csv_file.name}: {e}")
    
    if not csv_data:
        raise ValueError(f"No CSV files found in {user_folder}")
    
    return csv_data

def prepare_csv_context(csv_data: Dict[str, pd.DataFrame], user_id: str = None, question: str = None, max_rows: int = 5) -> str:
    """Prepare CSV context with RAG support"""
    # Try RAG first for specific questions
    if user_id and question and RAG_AVAILABLE:
        general_keywords = ['overview', 'summary', 'total', 'all', 'every', 'complete']
        is_general = any(keyword in question.lower() for keyword in general_keywords)
        
        if is_general:
            summary_context = rag_system.get_summary_context(user_id)
            if summary_context:
                logger.info(f"📊 Using SUMMARY context for general question")
                return summary_context
        
        relevant_data = rag_system.retrieve_relevant_data(user_id, question, top_k=10)
        if relevant_data:
            logger.info(f"🎯 Using RAG retrieval - only 10 most relevant rows")
            return relevant_data
    
    # Fallback to lightweight context
    logger.info(f"📄 Using lightweight context")
    context_parts = []
    
    for filename, df in csv_data.items():
        context_parts.append(f"\n{'='*50}")
        context_parts.append(f"📄 FILE: {filename}")
        context_parts.append(f"{'='*50}")
        context_parts.append(f"Total rows: {len(df)}")
        context_parts.append(f"Columns: {', '.join(df.columns.tolist()[:8])}")
        
        context_parts.append(f"\nSample data (first {max_rows} rows):")
        if len(df.columns) > 10:
            important_cols = ['date', 'amount', 'type', 'category', 'name', 'description']
            available_cols = [col for col in important_cols if col in df.columns]
            if available_cols:
                context_parts.append(df[available_cols].head(max_rows).to_string())
            else:
                context_parts.append(df.head(max_rows).to_string())
        else:
            context_parts.append(df.head(max_rows).to_string())
        
        if 'amount' in df.columns:
            if 'type' in df.columns:
                debit_total = df[df['type'] == 'debit']['amount'].sum()
                context_parts.append(f"\n💰 Total spending: ₹{debit_total:,.2f}")
            else:
                context_parts.append(f"\n💰 Total amount: ₹{df['amount'].sum():,.2f}")
    
    return "\n".join(context_parts)

def format_transaction_query(user_id: str, question: str, csv_data: Dict[str, pd.DataFrame]) -> str:
    """Format prompt with optimized context"""
    csv_context = prepare_csv_context(csv_data, user_id=user_id, question=question, max_rows=3)
    
    prompt = f"""You are a helpful assistant for the CareBank project, specialized in analyzing transaction data.

    **CRITICAL INSTRUCTION: Respond ONLY in English. Do NOT use German, French, Spanish, or any other language.**

USER ID: {user_id}

TRANSACTION DATA:
{csv_context}

Based STRICTLY on the data above, answer this question: {question}

INSTRUCTIONS:
1. Respond in ENGLISH only
2. Be concise and specific
3. Use exact numbers with ₹ symbol
4. Show dates in DD/MM/YYYY format when relevant
5. If data doesn't contain the answer, say so

Answer in English:"""

    return prompt

def query_llama_with_csv(user_id: str, question: str) -> Dict[str, Any]:
    """Query Llama with CSV data - NON-STREAMING version"""
    # Quick check for simple greetings
    simple_greetings = ['hi', 'hello', 'hey', 'greetings', 'good morning', 'good afternoon', 'good evening']
    if question.lower().strip() in simple_greetings:
        return {
            "success": True,
            "response": f"Hello! I'm your Budget Planner AI assistant. I can help you analyze your transactions. Try asking:\n\n• What's my total spending?\n• Show my top 5 expenses\n• How much did I spend on food?",
            "model": MODEL_NAME,
            "user_id": user_id,
            "csv_files_loaded": [],
            "total_files": 0,
            "total_rows": 0,
            "prompt_length": 0,
            "rag_used": False
        }
    
    try:
        start_time = datetime.now()
        logger.info(f"📂 Loading CSV files for user: {user_id}")
        
        csv_data = get_cached_csv_data(user_id)
        
        # Build RAG index for this user if not exists
        if RAG_AVAILABLE and user_id not in rag_system.indexes:
            logger.info(f"🔨 Building RAG index for user {user_id}")
            rag_system.index_user_data(user_id, csv_data)
        
        prompt = format_transaction_query(user_id, question, csv_data)
        prompt_length = len(prompt)
        logger.info(f"📝 Prompt length: {prompt_length} characters")
        logger.info(f"❓ Question: {question}")
        
        # NON-STREAMING request to Ollama
        response = requests.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": MODEL_NAME,
                "prompt": prompt,
                "stream": False,  # Important: No streaming here
                "options": {
                    "temperature": 0.1,
                    "num_predict": 1024,
                    "top_k": 40,
                    "top_p": 0.9,
                }
            },
            timeout=(30, 120)  # 2 minutes timeout
        )
        
        result = response.json()
        elapsed_time = (datetime.now() - start_time).total_seconds()
        
        total_rows = sum(len(df) for df in csv_data.values())
        
        logger.info(f"✅ Response generated in {elapsed_time:.2f} seconds")
        
        return {
            "success": True,
            "response": result.get('response', 'No response generated'),
            "model": MODEL_NAME,
            "user_id": user_id,
            "csv_files_loaded": list(csv_data.keys()),
            "total_files": len(csv_data),
            "total_rows": total_rows,
            "prompt_length": prompt_length,
            "response_time_seconds": elapsed_time,
            "rag_used": RAG_AVAILABLE and user_id in rag_system.indexes
        }
        
    except requests.exceptions.Timeout:
        logger.error(f"❌ Ollama timeout")
        return {
            "success": False,
            "response": "The analysis is taking too long. Please try a more specific question.",
            "error": "Timeout"
        }
    except Exception as e:
        logger.error(f"❌ Unexpected error: {e}")
        logger.error(traceback.format_exc())
        return {
            "success": False,
            "response": f"Error processing request: {str(e)}",
            "error": str(e)
        }

# ============= FLASK API ENDPOINTS =============

@app.route('/chat', methods=['POST'])
def chat():
    """Simple chat endpoint without CSV context"""
    try:
        data = request.get_json()
        prompt = data.get('prompt', '')
        
        if not prompt:
            return jsonify({'success': False, 'message': 'Prompt is required'}), 400
        
        logger.info(f"💬 Simple chat prompt: {prompt[:100]}...")
        
        response = requests.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": MODEL_NAME,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": 0.7,
                    "num_predict": 1024
                }
            },
            timeout=(30, 60)
        )
        
        result = response.json()
        
        return jsonify({
            'success': True,
            'response': result.get('response', 'No response generated'),
            'model': MODEL_NAME
        })
        
    except requests.exceptions.Timeout:
        return jsonify({'success': False, 'response': "Request timeout"}), 504
    except Exception as e:
        logger.error(f"Chat error: {e}")
        return jsonify({'success': False, 'response': f"Error: {str(e)}"}), 500

@app.route('/chat/transaction', methods=['POST'])
def chat_transaction():
    """
    Chat with CSV transaction data
    Expected JSON: {"user_id": "xxx", "question": "Show me my spending"}
    """
    try:
        data = request.get_json()
        user_id = data.get('user_id', '')
        question = data.get('question', '')
        
        if not user_id:
            return jsonify({'success': False, 'message': 'user_id is required'}), 400
        
        if not question:
            return jsonify({'success': False, 'message': 'question is required'}), 400
        
        logger.info(f"📨 Transaction query received - User: {user_id}")
        
        result = query_llama_with_csv(user_id, question)
        
        if result["success"]:
            return jsonify(result)
        else:
            return jsonify(result), 404
            
    except Exception as e:
        logger.error(f"Transaction chat error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/user/csv_files', methods=['GET'])
def list_user_csv_files():
    """List all CSV files for a specific user"""
    try:
        user_id = request.args.get('user_id')
        
        if not user_id:
            return jsonify({'success': False, 'message': 'user_id parameter required'}), 400
        
        user_folder = UPLOAD_CSV_FOLDER / str(user_id)
        
        if not user_folder.exists():
            return jsonify({
                'success': False,
                'message': f'User folder not found for {user_id}'
            }), 404
        
        csv_files = []
        for csv_file in user_folder.glob("*.csv"):
            try:
                df_sample = pd.read_csv(csv_file, nrows=5)
                csv_files.append({
                    'filename': csv_file.name,
                    'size_kb': round(csv_file.stat().st_size / 1024, 2),
                    'rows_preview': len(df_sample),
                    'columns': len(df_sample.columns),
                    'column_names': df_sample.columns.tolist()[:10]
                })
            except Exception as e:
                csv_files.append({
                    'filename': csv_file.name,
                    'size_kb': round(csv_file.stat().st_size / 1024, 2),
                    'error': str(e)
                })
        
        return jsonify({
            'success': True,
            'user_id': user_id,
            'csv_files': csv_files,
            'total_files': len(csv_files)
        })
        
    except Exception as e:
        logger.error(f"List CSV error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/user/all_users', methods=['GET'])
def list_all_users():
    """List all users who have CSV folders"""
    try:
        if not UPLOAD_CSV_FOLDER.exists():
            return jsonify({'success': False, 'message': 'UploadsCSVs folder not found'}), 404
        
        users = []
        for user_folder in UPLOAD_CSV_FOLDER.iterdir():
            if user_folder.is_dir():
                csv_count = len(list(user_folder.glob("*.csv")))
                users.append({
                    'user_id': user_folder.name,
                    'csv_count': csv_count
                })
        
        return jsonify({
            'success': True,
            'users': users,
            'total_users': len(users)
        })
        
    except Exception as e:
        logger.error(f"List users error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/user/cache/invalidate', methods=['POST'])
def invalidate_user_cache():
    """Invalidate cache for a user"""
    try:
        data = request.get_json()
        user_id = data.get('user_id')
        
        if user_id:
            invalidate_cache(user_id)
            if RAG_AVAILABLE and user_id in rag_system.indexes:
                del rag_system.indexes[user_id]
                del rag_system.text_chunks[user_id]
            return jsonify({'success': True, 'message': f'Cache invalidated for user {user_id}'})
        else:
            invalidate_cache()
            if RAG_AVAILABLE:
                rag_system.indexes.clear()
                rag_system.text_chunks.clear()
            return jsonify({'success': True, 'message': 'All cache invalidated'})
            
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'success': True,
        'status': 'running',
        'model': MODEL_NAME,
        'ollama_url': OLLAMA_URL,
        'csv_folder_exists': UPLOAD_CSV_FOLDER.exists(),
        'rag_available': RAG_AVAILABLE,
        'cache_size': len(csv_cache)
    })

@app.route('/debug/info', methods=['GET'])
def debug_info():
    """Debug endpoint"""
    return jsonify({
        'base_dir': str(BASE_DIR),
        'csv_folder': str(UPLOAD_CSV_FOLDER),
        'csv_folder_exists': UPLOAD_CSV_FOLDER.exists(),
        'rag_available': RAG_AVAILABLE,
        'cache_size': len(csv_cache)
    })

if __name__ == '__main__':
    # Create uploadsCSVs folder if it doesn't exist
    UPLOAD_CSV_FOLDER.mkdir(parents=True, exist_ok=True)
    
    print(f"\n{'='*60}")
    print(f"🚀 Starting CareBank AI Service with OPTIMIZATIONS")
    print(f"{'='*60}")
    print(f"📁 Base Directory: {BASE_DIR}")
    print(f"📂 CSV Folder: {UPLOAD_CSV_FOLDER}")
    print(f"📡 Ollama URL: {OLLAMA_URL}")
    print(f"🤖 Using Model: {MODEL_NAME}")
    print(f"🌐 Server: http://0.0.0.0:5000")
    print(f"{'='*60}")
    print(f"\n⚡ OPTIMIZATIONS ENABLED:")
    print(f"  ✅ CSV Caching (5 minute TTL)")
    print(f"  ✅ RAG Retrieval ({'AVAILABLE' if RAG_AVAILABLE else 'NOT AVAILABLE'})")
    print(f"  ✅ Smart Context Truncation")
    print(f"{'='*60}")
    print(f"\n📋 Available Endpoints:")
    print(f"  POST /chat - Simple chat (no CSV)")
    print(f"  POST /chat/transaction - Chat with CSV data")
    print(f"  GET  /user/csv_files?user_id=xxx - List user's CSV files")
    print(f"  GET  /user/all_users - List all users")
    print(f"  POST /user/cache/invalidate - Clear cache")
    print(f"  GET  /health - Health check")
    print(f"{'='*60}")
    print(f"\n⏱️  EXPECTED PERFORMANCE:")
    print(f"  - First query (with indexing): 15-20 seconds")
    print(f"  - Subsequent queries: 5-10 seconds")
    print(f"{'='*60}\n")
    
    # Run WITHOUT debug=True to prevent restarts
    app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)
















































































    from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import pandas as pd
from pathlib import Path
from typing import Dict, Any
import logging
import traceback
from datetime import datetime, timedelta

# RAG imports
try:
    from sentence_transformers import SentenceTransformer
    import faiss
    RAG_AVAILABLE = True
except ImportError:
    RAG_AVAILABLE = False

app = Flask(__name__)
CORS(app)

OLLAMA_URL = "http://127.0.0.1:11434"
MODEL_NAME = "qwen2.5:1.5b"
BASE_DIR = Path(__file__).parent.parent
UPLOAD_CSV_FOLDER = BASE_DIR / "uploadsCSVs"

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

csv_cache = {}
CACHE_TTL = 300

def get_cached_csv_data(user_id: str):
    current_time = datetime.now()
    if user_id in csv_cache:
        cache_entry = csv_cache[user_id]
        if current_time - cache_entry['timestamp'] < timedelta(seconds=CACHE_TTL):
            return cache_entry['data']
    
    csv_data = load_user_csv_files(user_id)
    csv_cache[user_id] = {'data': csv_data, 'timestamp': current_time}
    return csv_data

def invalidate_cache(user_id: str = None):
    if user_id:
        csv_cache.pop(user_id, None)
    else:
        csv_cache.clear()

class CSV_RAG_System:
    def __init__(self):
        self.encoder = None
        self.indexes = {}
        self.text_chunks = {}
        self.user_summaries = {}
        
    def init_encoder(self):
        if self.encoder is None and RAG_AVAILABLE:
            self.encoder = SentenceTransformer('all-MiniLM-L6-v2')
    
    def index_user_data(self, user_id: str, csv_data: Dict[str, pd.DataFrame]):
        if not RAG_AVAILABLE:
            return
        self.init_encoder()
        self._create_user_summary(user_id, csv_data)
        
        all_chunks = []
        for filename, df in csv_data.items():
            for idx in range(min(len(df), 5000)):
                row = df.iloc[idx]
                chunk_parts = [f"{col}: {row[col]}" for col in df.columns if pd.notna(row[col])]
                chunk_text = f"[FILE: {filename}] " + " | ".join(chunk_parts)
                all_chunks.append({'text': chunk_text, 'filename': filename, 'row_data': row.to_dict()})
        
        if all_chunks:
            texts = [chunk['text'] for chunk in all_chunks]
            embeddings = self.encoder.encode(texts, show_progress_bar=False)
            index = faiss.IndexFlatL2(embeddings.shape[1])
            index.add(embeddings.astype('float32'))
            self.indexes[user_id] = index
            self.text_chunks[user_id] = all_chunks
    
    def _create_user_summary(self, user_id: str, csv_data: Dict[str, pd.DataFrame]):
        summary = {'total_files': len(csv_data), 'total_rows': 0, 'total_spending': 0, 'total_income': 0}
        for df in csv_data.values():
            summary['total_rows'] += len(df)
            if 'amount' in df.columns:
                if 'type' in df.columns:
                    summary['total_spending'] += df[df['type'] == 'debit']['amount'].sum()
                    summary['total_income'] += df[df['type'] == 'credit']['amount'].sum()
                else:
                    summary['total_spending'] += df['amount'].sum()
        self.user_summaries[user_id] = summary
    
    def get_summary_context(self, user_id: str) -> str:
        if user_id not in self.user_summaries:
            return None
        s = self.user_summaries[user_id]
        return f"Total files: {s['total_files']}, Total rows: {s['total_rows']}, Spending: ₹{s['total_spending']:,.2f}, Income: ₹{s['total_income']:,.2f}"
    
    def retrieve_relevant_data(self, user_id: str, question: str, top_k: int = 10) -> str:
        if not RAG_AVAILABLE or user_id not in self.indexes:
            return None
        self.init_encoder()
        q_embedding = self.encoder.encode([question])
        _, indices = self.indexes[user_id].search(q_embedding.astype('float32'), top_k)
        
        context = []
        for idx in indices[0]:
            if idx < len(self.text_chunks[user_id]):
                chunk = self.text_chunks[user_id][idx]
                row_text = [f"{k}: ₹{v:,.2f}" if k == 'amount' and pd.notna(v) else f"{k}: {v}" for k, v in chunk['row_data'].items() if pd.notna(v)]
                context.append(" | ".join(row_text))
        return "\n".join(context) if context else None

rag_system = CSV_RAG_System()

def load_user_csv_files(user_id: str) -> Dict[str, pd.DataFrame]:
    user_folder = UPLOAD_CSV_FOLDER / str(user_id)
    if not user_folder.exists():
        raise FileNotFoundError(f"User folder {user_id} not found")
    
    csv_data = {}
    for csv_file in user_folder.glob("*.csv"):
        try:
            df = pd.read_csv(csv_file, encoding='utf-8')
        except UnicodeDecodeError:
            df = pd.read_csv(csv_file, encoding='latin1')
        csv_data[csv_file.name] = df
    return csv_data

def prepare_csv_context(csv_data: Dict[str, pd.DataFrame], user_id: str = None, question: str = None) -> str:
    if user_id and question and RAG_AVAILABLE:
        if any(kw in question.lower() for kw in ['overview', 'summary', 'total']):
            summary = rag_system.get_summary_context(user_id)
            if summary:
                return summary
        relevant = rag_system.retrieve_relevant_data(user_id, question)
        if relevant:
            return relevant
    
    parts = []
    for filename, df in csv_data.items():
        parts.append(f"File: {filename} ({len(df)} rows)")
        if 'amount' in df.columns:
            total = df['amount'].sum() if 'type' not in df.columns else df[df['type'] == 'debit']['amount'].sum()
            parts.append(f"Total: ₹{total:,.2f}")
        parts.append(df.head(3).to_string())
    return "\n".join(parts)

def query_llama_with_csv(user_id: str, question: str) -> Dict[str, Any]:
    if question.lower().strip() in ['hi', 'hello', 'hey']:
        return {"success": True, "response": "Hello! Ask me about your spending, totals, or categories.", "model": MODEL_NAME, "user_id": user_id}
    
    try:
        csv_data = get_cached_csv_data(user_id)
        if RAG_AVAILABLE and user_id not in rag_system.indexes:
            rag_system.index_user_data(user_id, csv_data)
        
        context = prepare_csv_context(csv_data, user_id, question)
        prompt = f"Based on this data: {context}\n\nAnswer concisely in English: {question}"
        
        resp = requests.post(f"{OLLAMA_URL}/api/generate", json={"model": MODEL_NAME, "prompt": prompt, "stream": False, "options": {"temperature": 0.1, "num_predict": 512}}, timeout=60)
        result = resp.json()
        
        return {"success": True, "response": result.get('response', ''), "model": MODEL_NAME, "user_id": user_id}
    except Exception as e:
        return {"success": False, "response": f"Error: {str(e)}", "error": str(e)}

@app.route('/chat/transaction', methods=['POST'])
def chat_transaction():
    data = request.get_json()
    user_id = data.get('user_id', '')
    question = data.get('question', '')
    
    if not user_id or not question:
        return jsonify({'success': False, 'message': 'user_id and question required'}), 400
    
    result = query_llama_with_csv(user_id, question)
    return jsonify(result)

@app.route('/user/csv_files', methods=['GET'])
def list_user_csv_files():
    user_id = request.args.get('user_id')
    if not user_id:
        return jsonify({'success': False, 'message': 'user_id required'}), 400
    
    user_folder = UPLOAD_CSV_FOLDER / str(user_id)
    if not user_folder.exists():
        return jsonify({'success': False, 'message': 'User not found'}), 404
    
    files = [{'filename': f.name, 'size_kb': round(f.stat().st_size / 1024, 2)} for f in user_folder.glob("*.csv")]
    return jsonify({'success': True, 'user_id': user_id, 'csv_files': files, 'total_files': len(files)})

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({'success': True, 'status': 'running', 'model': MODEL_NAME, 'rag_available': RAG_AVAILABLE})

if __name__ == '__main__':
    UPLOAD_CSV_FOLDER.mkdir(parents=True, exist_ok=True)
    print(f"🚀 Server running on http://0.0.0.0:5000")
    app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)