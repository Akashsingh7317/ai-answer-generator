from groq import Groq
import os

client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

def critic(state):
    original_answer = state["answer"]

    response = client.chat.completions.create(
        model="llama3-8b-8192",
        messages=[
            {
                "role": "system",
                "content": "You are an expert academic reviewer and editor."
            },
            {
                "role": "user",
                "content": f"""
Review the following answer for:
- Correctness
- Clarity
- Completeness
- Logical flow
- Structure

Then provide:
1. Short critique
2. Improved and corrected version of the answer

Answer:
{original_answer}
"""
            }
        ]
    )

    result = response.choices[0].message.content

    return {
        "evaluation": result,
        "final_answer": result   # or parse improved section separately
    }