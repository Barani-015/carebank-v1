from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import json
import os
import pandas as pd
from pathlib import Path
from typing import Dict, List, Any
import logging
import traceback

app = Flask(__name__)
CORS(app)

# Configuration
OLLAMA_URL = "http://127.0.0.1:11434"
MODEL_NAME = "llama3.2:latest"  # or "llama3.2:1b"

# IMPORTANT: Point to your uploadsCSVs folder (relative to this script)
# Since script.py is in python-service folder, we need to go up one level
BASE_DIR = Path(__file__).parent.parent  # Goes up to CAREBANK FILE STORING
UPLOAD_CSV_FOLDER = BASE_DIR / "uploadsCSVs"  # Your existing folder

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ============= STAGE 1: CSV READING FUNCTIONS =============

def load_user_csv_files(user_id: str) -> Dict[str, pd.DataFrame]:
    """
    Load all CSV files from user-specific folder in uploadsCSVs
    
    Args:
        user_id: The user ID folder name (e.g., '69ddec0ea6caed6e9922a769')
        
    Returns:
        Dictionary with filename as key and DataFrame as value
    """
    user_folder = UPLOAD_CSV_FOLDER / str(user_id)
    
    logger.info(f"Looking for user folder: {user_folder}")
    
    if not user_folder.exists():
        raise FileNotFoundError(f"User folder {user_id} not found at {user_folder}")
    
    csv_data = {}
    
    # Read all CSV files in the user folder
    csv_files = list(user_folder.glob("*.csv"))
    logger.info(f"Found {len(csv_files)} CSV files in {user_folder}")
    
    for csv_file in csv_files:
        try:
            # Try different encodings if needed
            try:
                df = pd.read_csv(csv_file, encoding='utf-8')
            except UnicodeDecodeError:
                df = pd.read_csv(csv_file, encoding='latin1')
            
            csv_data[csv_file.name] = df
            logger.info(f"✅ Loaded: {csv_file.name} ({len(df)} rows, {len(df.columns)} columns)")
            
            # Log column names for debugging
            logger.info(f"   Columns: {', '.join(df.columns.tolist()[:5])}...")
            
        except Exception as e:
            logger.error(f"❌ Error loading {csv_file.name}: {e}")
    
    if not csv_data:
        raise ValueError(f"No CSV files found in {user_folder}")
    
    return csv_data

def prepare_csv_context(csv_data: Dict[str, pd.DataFrame], max_rows: int = 20) -> str:
    """
    Prepare CSV data with PROPER DATE HANDLING for Llama
    """
    context_parts = []
    
    for filename, df in csv_data.items():
        context_parts.append(f"\n{'='*60}")
        context_parts.append(f"📄 FILE: {filename}")
        context_parts.append(f"{'='*60}")
        context_parts.append(f"Total rows: {len(df)}")
        context_parts.append(f"Columns: {', '.join(df.columns.tolist())}")
        
        # IMPORTANT: Check and format date column
        date_column = None
        for col in df.columns:
            if 'date' in col.lower() or 'day' in col.lower():
                date_column = col
                break
        
        if date_column:
            # Convert to datetime for proper handling
            try:
                df['parsed_date'] = pd.to_datetime(df[date_column], errors='coerce')
                
                # Add date range information
                min_date = df['parsed_date'].min()
                max_date = df['parsed_date'].max()
                context_parts.append(f"\n📅 DATE RANGE: {min_date.strftime('%B %d, %Y')} to {max_date.strftime('%B %d, %Y')}")
                
                # Add daily spending summary
                if 'amount' in df.columns:
                    # Create a date-spending summary
                    df_temp = df.copy()
                    df_temp['date_only'] = df_temp['parsed_date'].dt.date
                    
                    # Group by date for spending
                    if 'type' in df_temp.columns:
                        daily_spend = df_temp[df_temp['type'] == 'debit'].groupby('date_only')['amount'].sum()
                    else:
                        daily_spend = df_temp.groupby('date_only')['amount'].sum()
                    
                    # Get top 5 spending days
                    top_days = daily_spend.nlargest(5)
                    context_parts.append(f"\n💸 TOP 5 SPENDING DAYS:")
                    for date, amount in top_days.items():
                        context_parts.append(f"  • {date}: ₹{amount:,.2f}")
                    
                    # Get highest spending day
                    highest_day = daily_spend.nlargest(1)
                    if not highest_day.empty:
                        date, amount = next(iter(highest_day.items()))
                        context_parts.append(f"\n⭐ HIGHEST SPENDING DAY: {date} (₹{amount:,.2f})")
                
                # Show sample with formatted dates
                context_parts.append(f"\n📊 SAMPLE TRANSACTIONS (with proper dates):")
                sample_df = df.head(max_rows).copy()
                if 'parsed_date' in sample_df.columns:
                    sample_df['formatted_date'] = sample_df['parsed_date'].dt.strftime('%Y-%m-%d (%A)')
                    
                    # Show key columns
                    show_cols = []
                    if 'formatted_date' in sample_df.columns:
                        show_cols.append('formatted_date')
                    if 'name' in sample_df.columns or 'description' in sample_df.columns:
                        name_col = 'name' if 'name' in sample_df.columns else 'description'
                        show_cols.append(name_col)
                    if 'amount' in sample_df.columns:
                        show_cols.append('amount')
                    if 'category' in sample_df.columns:
                        show_cols.append('category')
                    if 'type' in sample_df.columns:
                        show_cols.append('type')
                    
                    if show_cols:
                        context_parts.append(sample_df[show_cols].to_string())
                    else:
                        context_parts.append(sample_df.to_string())
                else:
                    context_parts.append(sample_df.to_string())
                    
            except Exception as e:
                logger.warning(f"Could not parse dates in {filename}: {e}")
                context_parts.append(f"\n📊 Data sample (first {max_rows} rows):")
                context_parts.append(df.head(max_rows).to_string())
        else:
            # No date column found
            context_parts.append(f"\n⚠️ No date column found in {filename}")
            context_parts.append(f"\n📊 Data sample (first {max_rows} rows):")
            context_parts.append(df.head(max_rows).to_string())
        
        # Add category summary if available
        if 'category' in df.columns and 'amount' in df.columns:
            context_parts.append(f"\n📊 SPENDING BY CATEGORY:")
            if 'type' in df.columns:
                category_spend = df[df['type'] == 'debit'].groupby('category')['amount'].sum().sort_values(ascending=False)
            else:
                category_spend = df.groupby('category')['amount'].sum().sort_values(ascending=False)
            
            for cat, amt in category_spend.head(5).items():
                context_parts.append(f"  • {cat}: ₹{amt:,.2f}")
    
    return "\n".join(context_parts)

def format_transaction_query(user_id: str, question: str, csv_data: Dict[str, pd.DataFrame]) -> str:
    """
    Format a prompt with EMPHASIS on DATE-based questions
    """
    csv_context = prepare_csv_context(csv_data, max_rows=15)
    
    prompt = f"""You are a helpful assistant for the CareBank project, specialized in analyzing transaction and financial data with SPECIFIC DATE HANDLING.

USER ID: {user_id}

Here is the transaction data from CSV files with proper date formatting:

{csv_context}

The data ABOVE includes:
- Specific dates in YYYY-MM-DD (Day of week) format
- Transaction amounts with ₹ symbol
- Categories and types (debit/credit)

Based STRICTLY on the data above, answer this question: {question}

IMPORTANT RULES FOR DATE QUESTIONS:
1. If asked "on which day" - look at the date column and find the exact date
2. If asked "last month" - analyze the date range provided
3. Always give the specific date in DD/MM/YYYY format
4. Include the day name (Monday, Tuesday, etc.) when possible
5. Show the exact amount and transaction description

Example response format for "On which day did I spend the most?":
"Based on your transactions, you spent the most on FRIDAY, MAY 29, 2025 with a total of ₹245.50 across 3 transactions:
• 10:30 AM - Shopping at Walmart: ₹125.30
• 3:45 PM - Restaurant: ₹85.20
• 7:20 PM - Entertainment: ₹35.00"

Now answer: {question}"""

    return prompt

def query_llama_with_csv(user_id: str, question: str) -> Dict[str, Any]:
    # Skip CSV processing for simple greetings
    simple_greetings = ['hi', 'hello', 'hey', 'greetings', 'good morning', 'good afternoon', 'good evening']
    if question.lower().strip() in simple_greetings:
        return {
            "success": True,
            "response": f"Hello! I'm your Budget Planner AI assistant. I can help you analyze your transactions from your CSV files. Try asking things like:\n\n• 'What are my top 5 expenses?'\n• 'How much did I spend on food last month?'\n• 'Show me my spending by category'",
            "model": MODEL_NAME,
            "user_id": user_id,
            "csv_files_loaded": [],
            "total_files": 0,
            "total_rows": 0,
            "prompt_length": 0
        }
    try:
        logger.info(f"📂 Loading CSV files for user: {user_id}")
        csv_data = load_user_csv_files(user_id)
        
        prompt = format_transaction_query(user_id, question, csv_data)
        prompt_length = len(prompt)
        logger.info(f"📝 Prompt length: {prompt_length} characters")
        
        if prompt_length > 120000:
            logger.warning(f"Prompt is very large ({prompt_length} chars). Consider reducing CSV data.")
        
        logger.info(f"🤖 Sending query to {MODEL_NAME}")
        logger.info(f"❓ Question: {question}")
        
        # INCREASED TIMEOUTS FOR BETTER RESPONSES - 10 minutes
        response = requests.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": MODEL_NAME,
                "prompt": prompt,
                "stream": True,  # Enable streaming
                "options": {
                    "temperature": 0.1,
                    "num_predict": 2048,  # Increased from 1024 to 2048 for better answers
                    "top_k": 40,
                    "top_p": 0.9,
                }
            },
            timeout=(30, 600),  # (connection timeout, read timeout) - 10 minutes read timeout
            stream=True  # Enable HTTP streaming
        )
        
        # Collect streaming response
        full_response = ""
        for line in response.iter_lines():
            if line:
                try:
                    json_line = json.loads(line)
                    if 'response' in json_line:
                        full_response += json_line['response']
                    if json_line.get('done', False):
                        break
                except json.JSONDecodeError:
                    continue
        
        total_rows = sum(len(df) for df in csv_data.values())
        
        return {
            "success": True,
            "response": full_response,
            "model": MODEL_NAME,
            "user_id": user_id,
            "csv_files_loaded": list(csv_data.keys()),
            "total_files": len(csv_data),
            "total_rows": total_rows,
            "prompt_length": prompt_length
        }
        
    except requests.exceptions.Timeout:
        logger.error(f"❌ Ollama timeout after 10 minutes")
        return {
            "success": False,
            "response": "The analysis is taking longer than expected. This could be due to:\n• Very large CSV files (try asking more specific questions)\n• Heavy server load\n• Complex analysis request\n\nPlease try breaking down your question into smaller parts, for example:\n• 'Show my top 5 expenses' instead of 'Show all transactions'\n• 'How much did I spend on food?' instead of a general analysis\n\nYour request is still being processed in the background if streaming.",
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

def smart_sample_csv(df: pd.DataFrame, max_rows: int = 50) -> pd.DataFrame:
    """
    Intelligently sample CSV data for large files
    """
    if len(df) <= max_rows:
        return df
    
    # Take first 10 rows, last 10 rows, and random sample in between
    first_rows = df.head(10)
    last_rows = df.tail(10)
    
    # Get random sample of remaining rows
    remaining_count = max_rows - 20
    if remaining_count > 0 and len(df) > 20:
        middle_rows = df.iloc[10:-10].sample(n=min(remaining_count, len(df) - 20))
        return pd.concat([first_rows, middle_rows, last_rows])
    
    return pd.concat([first_rows, last_rows])

def prepare_csv_context(csv_data: Dict[str, pd.DataFrame], max_rows: int = 5) -> str:
    """
    Prepare CSV data as context for Llama 3.2 - OPTIMIZED VERSION
    Sends only summaries, not raw data to avoid timeout
    """
    context_parts = []
    
    for filename, df in csv_data.items():
        context_parts.append(f"\n{'='*50}")
        context_parts.append(f"📄 FILE: {filename}")
        context_parts.append(f"{'='*50}")
        context_parts.append(f"Total rows: {len(df)}")
        context_parts.append(f"Columns: {', '.join(df.columns.tolist())}")
        
        # ONLY show first 5 rows as sample (not 100)
        context_parts.append(f"\nSample data (first {max_rows} rows):")
        context_parts.append(df.head(max_rows).to_string())
        
        # Add SUMMARY STATISTICS instead of full data
        if 'amount' in df.columns:
            # Separate debit and credit
            if 'type' in df.columns:
                debit_df = df[df['type'] == 'debit']
                credit_df = df[df['type'] == 'credit']
                
                if not debit_df.empty:
                    total_spent = debit_df['amount'].sum()
                    avg_spent = debit_df['amount'].mean()
                    context_parts.append(f"\n💰 Spending Summary:")
                    context_parts.append(f"  Total spent: ₹{total_spent:,.2f}")
                    context_parts.append(f"  Average transaction: ₹{avg_spent:,.2f}")
                    context_parts.append(f"  Number of debits: {len(debit_df)}")
                    
                    # Top 5 categories by spending
                    if 'category' in debit_df.columns:
                        top_cats = debit_df.groupby('category')['amount'].sum().sort_values(ascending=False).head(5)
                        context_parts.append(f"  Top 5 categories: {dict(top_cats)}")
                
                if not credit_df.empty:
                    total_income = credit_df['amount'].sum()
                    context_parts.append(f"\n📈 Income Summary:")
                    context_parts.append(f"  Total income: ₹{total_income:,.2f}")
                    context_parts.append(f"  Number of credits: {len(credit_df)}")
            
            else:
                # If no type column, just show total
                context_parts.append(f"\n💰 Total amount: ₹{df['amount'].sum():,.2f}")
        
        # Date range if date column exists
        if 'date' in df.columns:
            try:
                df['date_parsed'] = pd.to_datetime(df['date'], errors='coerce')
                min_date = df['date_parsed'].min()
                max_date = df['date_parsed'].max()
                if pd.notna(min_date) and pd.notna(max_date):
                    context_parts.append(f"\n📅 Date range: {min_date.strftime('%Y-%m-%d')} to {max_date.strftime('%Y-%m-%d')}")
            except:
                pass
    
    return "\n".join(context_parts)

# ============= FLASK API ENDPOINTS =============

@app.route('/chat', methods=['POST'])
def chat():
    """Original chat endpoint without CSV context - NOW WITH 10 MINUTE TIMEOUT"""
    try:
        data = request.get_json()
        prompt = data.get('prompt', '')
        
        if not prompt:
            return jsonify({'success': False, 'message': 'Prompt is required'}), 400
        
        logger.info(f"💬 Simple chat prompt: {prompt[:100]}...")
        
        # Simple chat without CSV context - NOW WITH 10 MINUTE TIMEOUT
        response = requests.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": MODEL_NAME,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": 0.7,
                    "num_predict": 2048  # Also increased to 2048 for better responses
                }
            },
            timeout=(30, 600)  # (connection timeout, read timeout) - 10 minutes read timeout
        )
        
        result = response.json()
        
        return jsonify({
            'success': True,
            'response': result.get('response', 'No response generated'),
            'model': MODEL_NAME
        })
        
    except requests.exceptions.Timeout:
        logger.error(f"❌ Simple chat timeout after 10 minutes")
        return jsonify({
            'success': False, 
            'response': "The request is taking too long. Please try a simpler question or check if Ollama is responding properly."
        }), 504
    except Exception as e:
        logger.error(f"Chat error: {e}")
        return jsonify({'success': False, 'response': f"Error: {str(e)}"}), 500

@app.route('/chat/transaction', methods=['POST'])
def chat_transaction():
    """
    Chat with CSV transaction data
    Expected JSON: {"user_id": "69ddec0ea6caed6e9922a769", "question": "Show me all transactions"}
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
        
        # Process query with CSV context
        result = query_llama_with_csv(user_id, question)
        
        if result["success"]:
            return jsonify(result)
        else:
            return jsonify(result), 404
            
    except Exception as e:
        logger.error(f"Transaction chat error: {e}")
        return jsonify({'success': False, 'response': f"Error: {str(e)}"}), 500

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
                'message': f'User folder not found for {user_id}',
                'path': str(user_folder)
            }), 404
        
        csv_files = []
        for csv_file in user_folder.glob("*.csv"):
            try:
                # Try to read first few rows to get info
                df_sample = pd.read_csv(csv_file, nrows=5)
                csv_files.append({
                    'filename': csv_file.name,
                    'size_kb': round(csv_file.stat().st_size / 1024, 2),
                    'rows_preview': len(df_sample),
                    'columns': len(df_sample.columns),
                    'column_names': df_sample.columns.tolist()
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
            'total_files': len(csv_files),
            'folder_path': str(user_folder)
        })
        
    except Exception as e:
        logger.error(f"List CSV error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/user/all_users', methods=['GET'])
def list_all_users():
    """List all users who have CSV folders in uploadsCSVs"""
    try:
        if not UPLOAD_CSV_FOLDER.exists():
            return jsonify({
                'success': False,
                'message': f'UploadsCSVs folder not found at {UPLOAD_CSV_FOLDER}'
            }), 404
        
        users = []
        for user_folder in UPLOAD_CSV_FOLDER.iterdir():
            if user_folder.is_dir():
                csv_count = len(list(user_folder.glob("*.csv")))
                users.append({
                    'user_id': user_folder.name,
                    'csv_count': csv_count,
                    'folder_path': str(user_folder)
                })
        
        return jsonify({
            'success': True,
            'users': users,
            'total_users': len(users),
            'csv_folder_path': str(UPLOAD_CSV_FOLDER)
        })
        
    except Exception as e:
        logger.error(f"List users error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'success': True,
        'status': 'running',
        'model': MODEL_NAME,
        'ollama_url': OLLAMA_URL,
        'csv_folder': str(UPLOAD_CSV_FOLDER),
        'csv_folder_exists': UPLOAD_CSV_FOLDER.exists()
    })

@app.route('/debug/info', methods=['GET'])
def debug_info():
    """Debug endpoint to check paths"""
    return jsonify({
        'base_dir': str(BASE_DIR),
        'csv_folder': str(UPLOAD_CSV_FOLDER),
        'csv_folder_exists': UPLOAD_CSV_FOLDER.exists(),
        'python_version': os.sys.version,
        'pandas_version': pd.__version__
    })

if __name__ == '__main__':
    # Create uploadsCSVs folder if it doesn't exist (for safety)
    UPLOAD_CSV_FOLDER.mkdir(parents=True, exist_ok=True)
    
    # Increase Flask timeout for long-running requests
    import sys
    if sys.version_info >= (3, 7):
        import signal
        signal.signal(signal.SIGINT, lambda s, f: sys.exit(0))
    
    print(f"\n{'='*60}")
    print(f"🚀 Starting CareBank AI Service with CSV Integration")
    print(f"{'='*60}")
    print(f"📁 Base Directory: {BASE_DIR}")
    print(f"📂 CSV Folder: {UPLOAD_CSV_FOLDER}")
    print(f"📂 CSV Folder exists: {UPLOAD_CSV_FOLDER.exists()}")
    print(f"📡 Ollama URL: {OLLAMA_URL}")
    print(f"🤖 Using Model: {MODEL_NAME}")
    print(f"🌐 Server: http://0.0.0.0:5000")
    print(f"{'='*60}")
    print(f"\n📋 Available Endpoints:")
    print(f"  POST /chat - Simple chat (no CSV)")
    print(f"  POST /chat/transaction - Chat with CSV data")
    print(f"  GET  /user/csv_files?user_id=xxx - List user's CSV files")
    print(f"  GET  /user/all_users - List all users with CSV data")
    print(f"  GET  /health - Health check")
    print(f"  GET  /debug/info - Debug information")
    print(f"{'='*60}")
    print(f"\n⏱️  Timeout Settings (UPDATED):")
    print(f"  - CSV Query Timeout: 10 minutes (600 seconds)")
    print(f"  - Simple Chat Timeout: 10 minutes (600 seconds) ✅ NOW MATCHING")
    print(f"  - Connection Timeout: 30 seconds")
    print(f"  - Token Limit: 2048 tokens per response")
    print(f"{'='*60}\n")
    
    # List existing users on startup
    if UPLOAD_CSV_FOLDER.exists():
        users = [d.name for d in UPLOAD_CSV_FOLDER.iterdir() if d.is_dir()]
        if users:
            print(f"📊 Found {len(users)} user(s) with CSV data:")
            for user in users:
                csv_count = len(list((UPLOAD_CSV_FOLDER / user).glob("*.csv")))
                print(f"   - {user} ({csv_count} CSV files)")
        else:
            print(f"⚠️  No user folders found in {UPLOAD_CSV_FOLDER}")
    else:
        print(f"⚠️  UploadsCSVs folder not found at {UPLOAD_CSV_FOLDER}")
    
    print(f"\n{'='*60}\n")
    
    # Run with longer timeout for development
    app.run(host='0.0.0.0', port=5000, debug=True, threaded=True)