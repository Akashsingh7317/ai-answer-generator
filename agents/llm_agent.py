import os
from groq import Groq
from dotenv import load_dotenv

# --------------------------------------------
# Load Environment Variables
# --------------------------------------------
load_dotenv(override=True)  # .env wins over an older GROQ_API_KEY set in Windows

api_key = os.getenv("GROQ_API_KEY")

if not api_key:
    raise ValueError("❌ GROQ_API_KEY not found in environment variables!")

print("✅ LLM Agent Key Loaded:", bool(api_key))

# --------------------------------------------
# Create Groq Client
# --------------------------------------------
client =  Groq(api_key=api_key)


# --------------------------------------------
# LLM Answer Function
# --------------------------------------------
def llm_answer(state: dict) -> dict:
    """
    LLM Node
    ALWAYS returns a dictionary.
    """

    try:
        question = state.get("question", "").strip()
        context = state.get("context", "").strip()

        if not question:
            return {"answer": "No question provided."}

        if not context:
            return {"answer": "The context does not contain this information."}

        # 🔥 Strong University Prompt
        prompt = f"""
You are generating a university-style academic answer.

STRICT RULES:
- Format everything in proper HTML.
- Use <h3> for section titles.
- Underline the Definition using <u>.
- Use <hr> between sections.
- Use <ul><li> for points.
- Use EXACTLY ONE <pre> block for the diagram.
- The diagram must be ASCII flowchart style.
- Do NOT use markdown (** or *).
- Output ONLY clean HTML.
- Do NOT explain outside HTML.

Context:
{context}

Question:
{question}

Generate sections in this order:

1. Definition
2. Introduction
3. Detailed Explanation
4. Diagram (inside <pre>)
5. Advantages
6. Disadvantages
7. Applications
8. Conclusion
"""

        # ✅ CORRECT GROQ MODEL NAME
        response = client.chat.completions.create(
            model="openai/gpt-oss-120b",   # 🔥 Safe + Fast + Supported
            messages=[
                {"role": "system", "content": "You are a professional academic answer generator."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.2,
            max_tokens=1200,
            reasoning_effort="low",   # gpt-oss thinks before answering; keep it short so max_tokens goes to the answer
        )

        answer = response.choices[0].message.content.strip()

        if not answer:
            answer = "The context does not contain this information."

        return {"answer": answer}

    except Exception as e:
        print("LLM Error:", str(e))
        return {"answer": f"[LLM ERROR] {str(e)}"}

