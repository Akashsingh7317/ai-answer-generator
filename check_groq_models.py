import requests
import os

api_key = os.getenv("GROQ_API_KEY")
if not api_key:
    print("GROQ_API_KEY not set!")
    exit(1)

url = "https://api.groq.com/openai/v1/models"
headers = {
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json"
}

response = requests.get(url, headers=headers)

print("MODEL LIST RESPONSE:")
print(response.status_code)
print(response.text)
