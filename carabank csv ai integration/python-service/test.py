from ollama import chat


str = input("Enter your question?")
# This will call the locally running model
response = chat(
    model='llama3.2',
    messages=[{
        'role': 'user', 
        'content': str
    }]
)

print(response['message']['content'])
