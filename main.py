import os
from agents.retriever_agent import create_retriever
from agents.llm_agent import llm_answer
from agents.diagram_agent import generate_mermaid_diagram


# --------------------------------------------
# API KEY CHECK
# --------------------------------------------
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

if not GROQ_API_KEY:
    print("[ERROR] GROQ_API_KEY not found!")
    exit(1)

print("GROQ API Key Loaded: True")


# --------------------------------------------
# Load Retriever
# --------------------------------------------
def load_retriever(pdf_path=None):
    try:
        if pdf_path:
            print(f"[INFO] Loading PDF from: {pdf_path}")
            return create_retriever(custom_file=pdf_path)
        else:
            print("[INFO] Loading retriever from data folder")
            return create_retriever()
    except Exception as e:
        print(f"[ERROR] Retriever loading failed: {e}")
        return None


# --------------------------------------------
# CLEAN MERMAID OUTPUT
# --------------------------------------------
def clean_mermaid(diagram):
    if not diagram:
        return None

    diagram = diagram.replace("```mermaid", "")
    diagram = diagram.replace("```", "")
    diagram = diagram.strip()

    if not diagram.lower().startswith("flowchart"):
        diagram = "flowchart TD\n" + diagram

    return diagram


# --------------------------------------------
# Get Answer + Flowchart
# --------------------------------------------
def get_answer(question, retriever):

    if not question or not question.strip():
        return {"text": "Empty question.", "flowchart": None}

    if retriever is None or retriever.vectorstore is None:
        return {
            "text": "No PDF loaded. Please upload a PDF first.",
            "flowchart": None
        }

    try:
        docs = retriever.get_relevant_texts(question)
        context = "\n\n".join(docs)

        print(f"[DEBUG] Context length: {len(context)}")

        result = llm_answer({
            "question": question,
            "context": context
        })

        answer = result.get("answer", "").strip()

        if not answer:
            return {
                "text": "No answer generated.",
                "flowchart": None
            }

        # --------------------------------------------
        # Generate Mermaid Flowchart
        # --------------------------------------------
        print("[INFO] Generating Mermaid Flowchart...")
        flowchart_code = generate_mermaid_diagram(answer)
        flowchart_code = clean_mermaid(flowchart_code)

        return {
            "text": answer,
            "flowchart": flowchart_code
        }

    except Exception as e:
        print(f"[ERROR] Answer generation failed: {e}")
        return {
            "text": "Something went wrong while generating answer.",
            "flowchart": None
        }


# ---------------- CLI Version ---------------- #

def run_system():
    print("\n--- AI Answer Generator ---\n")

    retriever = load_retriever()

    if retriever is None:
        print("[ERROR] Could not load retriever.")
        return

    question = input("Enter your question: ").strip()

    if not question:
        print("[ERROR] Empty query.")
        return

    result = get_answer(question, retriever)

    print("\n--- AI Answer ---\n")
    print(result["text"])

    if result["flowchart"]:
        print("\nMermaid Flowchart Code:\n")
        print(result["flowchart"])

    print("\n-----------------\n")


if __name__ == "__main__":
    run_system()