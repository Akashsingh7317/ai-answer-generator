import hashlib
import os
import threading
from langchain_community.document_loaders import (
    DirectoryLoader,
    TextLoader,
    PyMuPDFLoader
)
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import Chroma
from langchain_huggingface import HuggingFaceEmbeddings

EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
EMBED_BATCH = 32  # chunks embedded per step; progress is reported after each step

_embeddings = None
_embeddings_lock = threading.Lock()


# ⚡ Load the embedding model once per process (loading takes several seconds)
def get_embeddings():
    global _embeddings

    with _embeddings_lock:
        if _embeddings is None:
            import torch  # slow to import; only needed here

            # torch only uses physical cores by default; all logical cores embed faster
            torch.set_num_threads(os.cpu_count() or 1)
            _embeddings = HuggingFaceEmbeddings(model_name=EMBEDDING_MODEL)

    return _embeddings


class MyRetriever:
    def __init__(self, persist_dir="vector_cache"):
        print("[INFO] Initializing Retriever...")

        self.embeddings = get_embeddings()

        self.persist_dir = persist_dir
        self.vectorstore = None

        print("[INFO] Retriever initialized successfully.")

    # 🔥 LOAD TXT + PDF (Supports Upload File)
    def load_docs(self, data_dir="data", custom_file=None):

        documents = []

        # ✅ If uploaded file is provided
        if custom_file:
            print(f"[INFO] Loading custom file: {custom_file}")

            if custom_file.endswith(".pdf"):
                # PyMuPDF reads PDFs many times faster than pypdf
                loader = PyMuPDFLoader(custom_file)
                documents.extend(loader.load())

            elif custom_file.endswith(".txt"):
                loader = TextLoader(custom_file)
                documents.extend(loader.load())

            return documents

        # ✅ Otherwise load from data folder
        if not os.path.exists(data_dir):
            os.makedirs(data_dir)
            print(f"[INFO] '{data_dir}' created. Add .txt or .pdf files and rerun.")
            return []

        # Load TXT files
        txt_loader = DirectoryLoader(
            data_dir,
            glob="*.txt",
            loader_cls=TextLoader
        )
        documents.extend(txt_loader.load())

        # Load PDF files
        pdf_loader = DirectoryLoader(
            data_dir,
            glob="*.pdf",
            loader_cls=PyMuPDFLoader
        )
        documents.extend(pdf_loader.load())

        print(f"[INFO] Loaded {len(documents)} documents.")
        return documents

    def split_docs(self, docs):
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=800,
            chunk_overlap=100
        )

        split_documents = splitter.split_documents(docs)
        print(f"[INFO] Split into {len(split_documents)} chunks.")
        return split_documents

    def create_vectorstore(self, docs, on_progress=None):
        if not docs:
            print("[WARN] No documents to create vectorstore.")
            return None

        # One collection per document, named by a hash of its text: a PDF indexed
        # before is reused instead of embedded again, and PDFs never mix in results
        digest = hashlib.sha256(EMBEDDING_MODEL.encode("utf-8"))
        for doc in docs:
            digest.update(doc.page_content.encode("utf-8") + b"\0")
        collection_name = f"doc-{digest.hexdigest()[:40]}"

        vectorstore = Chroma(
            collection_name=collection_name,
            embedding_function=self.embeddings,
            persist_directory=self.persist_dir
        )

        stored = len(vectorstore.get(include=[])["ids"])
        if stored == len(docs):
            print("[INFO] Reusing stored vectors (this document was indexed before).")
            if on_progress:
                on_progress(len(docs), len(docs))
            return vectorstore

        if stored:
            # Leftovers from an earlier attempt that didn't finish
            vectorstore.delete_collection()
            vectorstore = Chroma(
                collection_name=collection_name,
                embedding_function=self.embeddings,
                persist_directory=self.persist_dir
            )

        print("[INFO] Creating vectorstore...")

        # Similar-length chunks embed faster together (less padding); order doesn't matter in the store
        docs = sorted(docs, key=lambda doc: len(doc.page_content))
        for start in range(0, len(docs), EMBED_BATCH):
            vectorstore.add_documents(docs[start:start + EMBED_BATCH])
            if on_progress:
                on_progress(min(start + EMBED_BATCH, len(docs)), len(docs))

        print("[INFO] Vectorstore created and persisted.")
        return vectorstore

    def get_relevant_texts(self, query):
        if not self.vectorstore:
            print("[WARN] Vectorstore not initialized.")
            return []

        results = self.vectorstore.similarity_search(query, k=3)

        return [doc.page_content for doc in results]


# ✅ Updated create_retriever
def create_retriever(custom_file=None, on_progress=None):

    retriever = MyRetriever()

    docs = retriever.load_docs(custom_file=custom_file)

    if not docs:
        print("[WARN] No documents found.")
        return retriever

    split_docs = retriever.split_docs(docs)

    retriever.vectorstore = retriever.create_vectorstore(split_docs, on_progress)

    print(f"[INFO] Retriever created successfully.")

    return retriever
