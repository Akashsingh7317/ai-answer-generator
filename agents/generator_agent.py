from langchain_openai import ChatOpenAI
llm = ChatOpenAI(model="gpt-4o-mini")

def generator(state):
    prompt = f"""
    Prepare answer in UNIVERSITY FORMAT:
    1. Definition
    2. Explanation
    3. Diagram (ASCII)
    4. Applications
    5. Advantages
    6. Disadvantages

    Query: {state['query']}
    Context Summary: {state['summary']}
    """
    answer = llm.predict(prompt)
    return {"answer": answer}
