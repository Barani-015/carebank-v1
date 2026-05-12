async function getAIResponse(prompt, retries = 3, delay = 2000) {
  const OLLAMA_URL = 'http://127.0.0.1:11434';
  
  // Use YOUR exact model name from ollama list
  const MODEL_NAME = 'llama3.2:latest';  // ← This matches what you have
  
  console.log(`🤖 Using model: ${MODEL_NAME}`);
  console.log(`📝 Prompt: ${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}`);
  
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`🔄 Attempt ${i + 1}/${retries}...`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);
      
      const response = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          model: MODEL_NAME,  // Using llama3.2:latest
          prompt: prompt,
          stream: false,
          options: {
            temperature: 0.7,
            top_p: 0.9,
            num_predict: 512
          }
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      
      if (!data.response) {
        throw new Error('No response generated from model');
      }
      
      console.log("✅ AI response received successfully");
      
      return {
        response: data.response.trim(),
        success: true,
        model: MODEL_NAME
      };

    } catch (error) {
      console.error(`❌ Attempt ${i + 1} failed: ${error.message}`);
      
      if (i < retries - 1) {
        const waitTime = delay * Math.pow(1.5, i);
        console.log(`⏳ Retrying in ${waitTime / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      } else {
        console.error("❌ Ollama service unavailable after all retries.");
        return {
          response: "I'm sorry, the AI service is currently unavailable. Please make sure Ollama is running.\n\nTo fix this:\n1. Keep Ollama running in background\n2. Restart your Node.js server\n3. Try again",
          success: false
        };
      }
    }
  }
}

module.exports = { getAIResponse };