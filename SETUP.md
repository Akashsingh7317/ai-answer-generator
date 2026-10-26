# AI Answer Generator: setup

Upload a PDF, ask questions (typed or spoken) and get a structured answer with a colour-coded flowchart.

## You need
- Python 3.11
- A Groq API key: https://console.groq.com/keys

## Run it
```
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS / Linux
pip install -r requirements.txt
```
Copy `.env.example` to `.env` and put your Groq API key in it, then:
```
python app.py
```
Open http://127.0.0.1:5000. The first PDF upload downloads the embedding model (about 90 MB) once.
A PDF that was indexed before loads again in a second or two.

## Share it on the internet (optional)
With the app running, start a Cloudflare quick tunnel and share the https://...trycloudflare.com link it prints:
```
cloudflared tunnel --url http://127.0.0.1:5000
```
Anyone with the link can use the app (and your Groq key), so share it only with people you trust.
Keep `FLASK_DEBUG` unset when the app is shared; set `FLASK_DEBUG=1` only for local development.
