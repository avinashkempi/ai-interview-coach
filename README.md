# AI Interview Coach

The project contains a Next.js frontend and a FastAPI backend. The frontend lets you choose an interview topic and difficulty, then starts a session with the first AI-generated question. The backend provides Groq-powered interview turns and structured interview reports.

## Backend setup

From the project folder:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
cp .env.example .env
```

Add your Groq API key to `backend/.env` as `GROQ_API_KEY`. Keep this key private; do not put it in `.env.example` or commit `.env`. The backend defaults to `openai/gpt-oss-120b`. If that model is not enabled for your Groq account, set `GROQ_MODEL` in `backend/.env` to a model ID available in your Groq Console, then restart the backend. A model access error returns an actionable message naming this setting.

Start the backend from the `backend` folder:

```bash
source .venv/bin/activate
uvicorn main:app --reload --port 8000
```

On startup, the backend prints a ready message with the health-check route (`GET /health`) and API documentation route (`/docs`). Request validation errors return HTTP 422 with a concise explanation, missing Groq configuration returns HTTP 503, provider errors return HTTP 502, and unexpected server errors are logged and return a generic HTTP 500 message.

## Frontend setup

In a second terminal, from the project folder:

```bash
cd frontend
npm install
npm run dev
```

The frontend calls `http://localhost:8000` by default. To use a different backend URL, create `frontend/.env.local` (see [frontend/.env.example](./frontend/.env.example)) and set `NEXT_PUBLIC_API_URL`.

Open `http://localhost:3000`.

## Backend API

- `GET /health` returns `{"status":"ok"}`.
- `POST /interview/start` accepts `topic` and `difficulty` (`Easy`, `Medium`, or `Hard`) and returns the first `message` plus an `ended` boolean.
- `POST /interview/answer` accepts `topic`, `difficulty`, and the full `conversation` so far, including the candidate's latest answer as the final message. Each message has a `role` (`interviewer` or `candidate`) and `content`. The response returns the next interviewer `message` and `ended` boolean. When `ended` is `true`, no more answers should be submitted.
- `POST /report` accepts `topic`, `difficulty`, and the complete `conversation`. It returns `score` (0-100), `performance_band`, evidence-based `strengths` and `weaknesses`, `topics_to_revise`, `overall_verdict`, and `result`. Bands are Excellent (85+), Good (70-84), Adequate (55-69), and Weak (below 55). Pass is 70 or above.

No database or server-side interview state is used: the frontend retains and sends the conversation with each answer and report request. CORS permits HTTP(S) origins on `localhost` and `127.0.0.1` at any port.

Example interview start:

```bash
curl -X POST http://localhost:8000/interview/start \
  -H 'Content-Type: application/json' \
  -d '{"topic":"Python generators","difficulty":"Medium"}'
```

Example answer submission (include all previous turns and the latest candidate answer):

```bash
curl -X POST http://localhost:8000/interview/answer \
  -H 'Content-Type: application/json' \
  -d '{"topic":"Python generators","difficulty":"Medium","conversation":[{"role":"interviewer","content":"What is a generator?"},{"role":"candidate","content":"An iterator that yields values lazily."}]}'
```

Set `GROQ_API_KEY` before starting the backend. If it is missing, AI endpoints respond with HTTP 503. Provider failures or invalid model output return HTTP 502; request validation errors return HTTP 422.
