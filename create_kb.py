import os

# Path to kb folder
kb_path = "./kb"
os.makedirs(kb_path, exist_ok=True)  # create folder if it doesn't exist

# Sample documents
docs = {
    "doc1.txt": "Python is a high-level programming language used for web development, AI, and data science.",
    "doc2.txt": "LangChain is a framework to build applications with LLMs and connect them to your own data.",
    "doc3.txt": "FAISS is a library for efficient similarity search and clustering of dense vectors."
}

# Write docs to kb folder
for filename, content in docs.items():
    with open(os.path.join(kb_path, filename), "w", encoding="utf-8") as f:
        f.write(content)

print("Sample documents added to ./kb folder")
