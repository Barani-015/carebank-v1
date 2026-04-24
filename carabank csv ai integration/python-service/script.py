# from flask import Flask, request, jsonify
# import ollama # Import the whole module to avoid naming conflicts

# app = Flask(__name__)

# @app.route('/chat', methods=['POST'])
# def handle_chat(): # Changed name from 'chat' to avoid shadowing the ollama.chat function
#     print("python module called...")
#     try:
#         data = request.json
#         # 'prompt' must be a string inside quotes: data['prompt']
#         user_message = data.get('prompt', '') 

#         # Use ollama.chat explicitly
#         response = ollama.chat(model='llama3.2', messages=[
#             {'role': 'user', 'content': user_message},
#         ])
        
#         # You MUST return a response to Flask, or it sends an HTML error (500)
#         return jsonify({"response": response['message']['content']})
    
#     except Exception as e:
#         print(f"Error: {e}")
#         return jsonify({"error": str(e)}), 500

# if __name__ == '__main__':
#     app.run(port=5000, debug=True)


# Python Flask server (app.py)
# from flask import Flask, request, jsonify
# from flask_cors import CORS
# import ollama  # or your preferred AI library

# app = Flask(__name__)
# CORS(app)  # Enable CORS for all routes

# @app.route('/chat', methods=['POST'])
# def chat():
#     try:
#         data = request.get_json()
#         prompt = data.get('prompt', '')
        
#         if not prompt:
#             return jsonify({'error': 'No prompt provided'}), 400
        
#         # Example using Ollama
#         response = ollama.chat(model='llama3.2', messages=[
#             {'role': 'user', 'content': prompt}
#         ])
        
#         return jsonify({
#             'response': response['message']['content'],
#             'success': True
#         })
        
#     except Exception as e:
#         print(f"Error: {e}")
#         return jsonify({
#             'error': str(e),
#             'success': False
#         }), 500

# @app.route('/health', methods=['GET'])
# def health():
#     return jsonify({'status': 'healthy'})

# if __name__ == '__main__':
#     app.run(host='0.0.0.0', port=5000, debug=True)








const ollamaTest = async (req, res) => {
    try {
        const { prompt } = req.body;
        
        if (!prompt) {
            return res.status(400).json({ 
                success: false, 
                message: 'Prompt is required' 
            });
        }
        
        console.log(`[AI REQUEST] Received prompt: ${prompt.substring(0, 100)}...`);
        console.log(`[AI REQUEST] User ID: ${req.user._id}`);
        
        // Pass user ID to the AI service
        const aiResponse = await getAIResponse(prompt, req.user._id.toString());
        
        res.json({
            success: true,
            response: aiResponse.response || aiResponse
        });
        
    } catch (error) {
        console.error('Error getting AI response:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to get AI response',
            error: error.message 
        });
    }
};