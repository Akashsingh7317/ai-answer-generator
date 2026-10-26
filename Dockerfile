# Container for Hugging Face Spaces (Docker SDK). Local runs don't need it: see SETUP.md.
FROM python:3.12-slim

# Spaces run the container as user 1000; the app writes uploads/ and vector_cache/ next to app.py
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    PYTHONUNBUFFERED=1
RUN mkdir -p $HOME/app
WORKDIR $HOME/app

# requirements.txt is a pip freeze in which langchain-huggingface 1.2.0 asks for huggingface-hub<1.0
# while the freeze has 1.4.1 (the combination works), so it is installed as-is with --no-deps.
# torch comes from the CPU index: the PyPI Linux wheel pulls in about 3 GB of CUDA libraries.
COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir --user --no-deps torch==2.10.0+cpu --index-url https://download.pytorch.org/whl/cpu \
 && pip install --no-cache-dir --user --no-deps -r requirements.txt \
 && pip install --no-cache-dir --user setuptools gunicorn \
 && (pip check || true)

# Download the embedding model now so the first PDF upload doesn't wait for it
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')"

COPY --chown=user . .

# One worker: the loaded PDF and the upload progress live in this process's memory
CMD ["gunicorn", "--workers", "1", "--threads", "8", "--timeout", "600", "--bind", "0.0.0.0:7860", "app:app"]
