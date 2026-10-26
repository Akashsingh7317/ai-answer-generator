from agents.retriever_agent import create_retriever

retriever = create_retriever()

if retriever:
    print("Retriever is ready!")
else:
    print("No documents found. Add .txt or .pdf files into 'data/' folder.")
