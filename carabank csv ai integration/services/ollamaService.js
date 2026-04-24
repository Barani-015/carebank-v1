async function getAIResponse(prompt, retries = 5, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`Attempting to connect to Python service... (attempt ${i + 1}/${retries})`);

      const response = await fetch('http://localhost:5000/chat', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ prompt: prompt }),
        timeout: 30000
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server Error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log("AI response received successfully");
      
      return data;

    } catch (error) {
      console.error(`Attempt ${i + 1} failed: ${error.message}`);
      
      if (i < retries - 1) {
        console.log(`Retrying in ${delay / 1000}s...`);
        await new Promise(res => setTimeout(res, delay));
        delay = Math.min(delay * 1.5, 10000);
      } else {
        console.error("Python service unavailable after all retries.");
        return {
          response: "I'm sorry, the AI service is currently unavailable. Please try again later.",
          success: false
        };
      }
    }
  }
}

module.exports = { getAIResponse };