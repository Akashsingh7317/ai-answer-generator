from flask import Flask, render_template, request, jsonify
from werkzeug.utils import secure_filename
from main import get_answer
from agents.retriever_agent import create_retriever, get_embeddings
import os
import webbrowser
import threading

app = Flask(__name__)
app.config["UPLOAD_FOLDER"] = "uploads"
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024

os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)

retriever = None
current_doc = None  # name of the PDF the retriever was built from

# PDFs are indexed in a background thread while the page polls /upload/status.
# upload_job is always replaced, never mutated, so readers see a consistent dict.
upload_job = {"state": "idle"}
upload_lock = threading.Lock()

# Texts get_answer (main.py) returns in place of an answer
NO_ANSWER_TEXTS = {
    "Empty question.",
    "No PDF loaded. Please upload a PDF first.",
    "No answer generated.",
    "Something went wrong while generating answer.",
}


# 🔹 CLEAN MERMAID FUNCTION (ONLY FOR FLOWCHART)
def clean_mermaid(diagram):
    if not diagram:
        return None

    diagram = diagram.replace("```mermaid", "")
    diagram = diagram.replace("```", "")
    diagram = diagram.strip()

    # Ensure it starts with flowchart
    if not diagram.lower().startswith("flowchart"):
        diagram = "flowchart TD\n" + diagram

    return diagram


# 📄 Read + index a PDF (runs in a background thread)
def process_pdf(filepath, doc_name):
    global retriever, current_doc, upload_job

    def on_progress(done, total):
        global upload_job
        upload_job = {"state": "running", "stage": "indexing", "done": done, "total": total, "doc_name": doc_name}

    try:
        new_retriever = create_retriever(custom_file=filepath, on_progress=on_progress)
    except Exception as e:
        new_retriever = None
        print("Retriever Error:", e)

    # create_retriever leaves the vectorstore empty when no text could be read;
    # the previous document (if any) stays active
    if getattr(new_retriever, "vectorstore", None) is None:
        upload_job = {
            "state": "error",
            "message": "Could not process this PDF. Make sure it is a valid PDF with selectable text.",
            "doc_name": current_doc,
        }
        return

    retriever, current_doc = new_retriever, doc_name
    upload_job = {"state": "done", "doc_name": doc_name}


@app.route("/")
def index():
    return render_template("index.html", doc_name=current_doc)


# 📄 Upload PDF
@app.route("/upload", methods=["POST"])
def upload():
    global upload_job

    file = request.files.get("pdf_file")

    if not file or not file.filename.lower().endswith(".pdf"):
        return jsonify(ok=False, message="Please upload a valid PDF file.", doc_name=current_doc), 400

    with upload_lock:
        if upload_job["state"] == "running":
            return jsonify(ok=False, message="Another PDF is still being processed.", doc_name=current_doc), 409

        filename = secure_filename(file.filename)
        if not filename.lower().endswith(".pdf"):
            filename = "document.pdf"
        filepath = os.path.join(app.config["UPLOAD_FOLDER"], filename)
        file.save(filepath)

        upload_job = {"state": "running", "stage": "reading", "done": 0, "total": 0, "doc_name": file.filename}
        threading.Thread(target=process_pdf, args=(filepath, file.filename), daemon=True).start()

    return jsonify(ok=True), 202


@app.route("/upload/status")
def upload_status():
    return jsonify(upload_job)


# ❓ Ask Question
@app.route("/ask", methods=["POST"])
def ask():
    if retriever is None:
        return jsonify(ok=False, need_upload=True, message="Please upload and process a PDF first."), 400

    data = request.get_json(silent=True)
    question = (data.get("question") or "").strip() if isinstance(data, dict) else ""

    if not question:
        return jsonify(ok=False, message="Please enter a question."), 400

    try:
        result = get_answer(question, retriever)
    except Exception as e:
        print("Answer generation error:", e)
        return jsonify(ok=False, message="Something went wrong while generating answer."), 500

    # EXPECT: { "text": "...", "flowchart": "mermaid code" }
    answer_text = result.get("text", "")
    flowchart_code = clean_mermaid(result.get("flowchart"))

    # Model failures come back as "[LLM ERROR] ..." text; a missing flowchart alone is not a failure
    if not answer_text or answer_text in NO_ANSWER_TEXTS or answer_text.startswith("[LLM ERROR]"):
        return jsonify(ok=False, message=answer_text or "No answer generated."), 502

    return jsonify(ok=True, answer=answer_text, flowchart=flowchart_code, doc_name=current_doc)


@app.errorhandler(413)
def file_too_large(e):
    return jsonify(ok=False, message="PDF is too large (max 16 MB).", doc_name=current_doc), 413


def open_browser():
    webbrowser.open_new("http://127.0.0.1:5000")


if __name__ == "__main__":
    # Load the embedding model in the background so the first upload doesn't wait for it
    threading.Thread(target=get_embeddings, daemon=True).start()
    threading.Timer(1.5, open_browser).start()
    # Debug mode lets a browser run code on this PC, so it stays off unless FLASK_DEBUG=1
    app.run(debug=os.getenv("FLASK_DEBUG") == "1", use_reloader=False)
