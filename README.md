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

The frontend requires `NEXT_PUBLIC_API_URL`. For local development, create `frontend/.env.local` from [frontend/.env.example](./frontend/.env.example); in Vercel, set it as a project environment variable before building.

Open `http://localhost:3000`.

## Backend API

- `GET /health` returns `{"status":"ok"}`.
- `POST /interview/start` accepts `topic` and `difficulty` (`Easy`, `Medium`, or `Hard`) and returns the first `message` plus an `ended` boolean.
- `POST /interview/answer` accepts `topic`, `difficulty`, and the full `conversation` so far, including the candidate's latest answer as the final message. Each message has a `role` (`interviewer` or `candidate`) and `content`. The response returns the next interviewer `message` and `ended` boolean. When `ended` is `true`, no more answers should be submitted.
- `POST /report` accepts `topic`, `difficulty`, and the complete `conversation`. It returns `score` (0-100), `performance_band`, evidence-based `strengths` and `weaknesses`, `topics_to_revise`, `overall_verdict`, and `result`. Bands are Excellent (85+), Good (70-84), Adequate (55-69), and Weak (below 55). Pass is 70 or above.

No database or server-side interview state is used: the frontend retains and sends the conversation with each answer and report request. CORS permits HTTP(S) origins on `localhost` and `127.0.0.1` at any port, plus production origins configured in `FRONTEND_ORIGINS` as a comma-separated list.

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

## Deploying to Render and Vercel

### Render backend

Create a **Web Service** from this GitHub repository:

- **Root Directory:** `backend`
- **Runtime:** Python
- **Build Command:** `pip install -r requirements.txt`
- **Start Command:** `./start.sh`

Render supplies the listening `PORT`; `backend/start.sh` binds Uvicorn to `0.0.0.0` and that port. Add these environment variables in the Render service settings:

- `GROQ_API_KEY`: your Groq API key (secret)
- `GROQ_MODEL`: `openai/gpt-oss-120b` (optional; this is the default)
- `FRONTEND_ORIGINS`: your deployed Vercel origin, for example `https://ai-interview-coach.vercel.app` (no path). Add multiple origins separated by commas if needed.

After the first backend deploy, verify `https://<your-render-service>.onrender.com/health`.

### Vercel frontend

Import the same GitHub repository as a Vercel project:

- **Root Directory:** `frontend`
- **Framework Preset:** Next.js
- **Build Command:** `npm run build`
- **Install Command:** `npm install`

Set this environment variable for Production (and Preview too if you want preview deployments to call the backend):

- `NEXT_PUBLIC_API_URL`: `https://<your-render-service>.onrender.com` (no trailing slash)

Deploy once to get the Vercel domain, then add that exact origin to Render’s `FRONTEND_ORIGINS` and redeploy/restart the backend. If you use a custom Vercel domain, add its `https://` origin too. Redeploy the frontend after changing `NEXT_PUBLIC_API_URL` because Next.js embeds `NEXT_PUBLIC_*` variables at build time.
