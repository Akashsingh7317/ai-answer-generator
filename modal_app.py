"""Runs the app on Modal (https://modal.com) so it stays online when this PC is off.

Deploy:  pip install modal  ->  modal token new  ->  modal deploy modal_app.py
The Groq key comes from the Modal secret "custom-secret" (GROQ_API_KEY).
"""
import subprocess
from pathlib import Path

import modal

PROJECT_DIR = Path(__file__).parent
APP_DIR = "/root/app"

# Same install steps as the Dockerfile: the requirements.txt freeze with --no-deps and a
# CPU-only torch build, then the embedding model downloaded into the image
image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install("torch==2.10.0+cpu", index_url="https://download.pytorch.org/whl/cpu", extra_options="--no-deps")
    .pip_install_from_requirements(str(PROJECT_DIR / "requirements.txt"), extra_options="--no-deps")
    .pip_install("setuptools", "gunicorn")
    .run_commands(
        "python -c \"from sentence_transformers import SentenceTransformer; "
        "SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')\""
    )
    .add_local_dir(
        PROJECT_DIR,
        APP_DIR,
        copy=True,
        ignore=[".env", "**/.env", ".git/**", "venv/**", "uploads/**", "vector_cache/**", "**/__pycache__/**"],
    )
)

app = modal.App("ai-answer-generator", image=image)


@app.function(
    secrets=[modal.Secret.from_name("custom-secret")],
    # (reserved, limit): billing follows the small reservation while idle, and
    # indexing a PDF can still burst up to the limit
    cpu=(0.125, 2.0),
    memory=(1024, 2048),
    max_containers=1,  # the loaded PDF and the upload progress live in one process
    scaledown_window=15 * 60,  # keep running 15 minutes after the last request
)
@modal.concurrent(max_inputs=100)
@modal.web_server(port=7860, startup_timeout=300, label="ai-answer-generator")
def web():
    subprocess.Popen(
        ["gunicorn", "--workers", "1", "--threads", "8", "--timeout", "600", "--bind", "0.0.0.0:7860", "app:app"],
        cwd=APP_DIR,
    )
