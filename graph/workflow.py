from langgraph.graph import StateGraph, END
from agents.retriever_agent import create_retriever
from agents.llm_agent import llm_answer


class GraphState(dict):
    pass


def create_workflow():
    graph = StateGraph(GraphState)
    retriever = create_retriever()

    if retriever is None:
        raise RuntimeError("Retriever not created")

    def retriever_node(state: dict) -> dict:
        question = state.get("question", "")

        docs = retriever.get_relevant_texts(question) or []

        if not docs:
            print("[WARN] No relevant context found. Using ALL documents.")
            docs = getattr(retriever, "texts", [])

        context = "\n\n".join(docs) if docs else ""

        print(f"[DEBUG] Context length: {len(context)}")

        return {
            "question": question,
            "context": context
        }

    graph.add_node("retriever", retriever_node)
    graph.add_node("llm", llm_answer)

    graph.set_entry_point("retriever")
    graph.add_edge("retriever", "llm")
    graph.add_edge("llm", END)

    return graph.compile()
