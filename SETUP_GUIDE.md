# VibeGPT — Complete Local Setup Guide (Windows)

> **How to use this document:** This is a complete, step-by-step guide to get the
> VibeGPT website running locally from a fresh clone. You can either follow it
> yourself **or paste the whole thing into an AI coding assistant** (Kilo, Claude,
> Cursor, etc.) and ask it to execute the steps for you. Every command is exact and
> tested. Do the steps **in order** — later steps depend on earlier ones.

---

## 🎯 Goal

Get these four things running on your machine:

1. **PostgreSQL + pgvector** (database) — via Docker
2. **Ollama** (local LLM for AI answers) — via Docker
3. **FastAPI backend** (port 8000) + **document worker** — Python
4. **Next.js frontend** (port 3000) — Node.js

When done, you open **http://localhost:3000** and log in.

---

## 📋 Prerequisites (install these first)

| Tool | Version | Notes |
|------|---------|-------|
| **Git** | any | https://git-scm.com |
| **Python** | **3.11, 3.12, or 3.13** | ⚠️ **NOT 3.14** — `pydantic-core` fails to build on 3.14. Check with `python --version`. If you have 3.14, install 3.12 from https://python.org and use the `py -3.12` launcher. |
| **Node.js** | 20+ | https://nodejs.org (LTS) |
| **Docker Desktop** | latest | https://docker.com/products/docker-desktop — enable the **WSL 2 backend** during install. |

Verify before continuing:

```powershell
git --version
python --version       # must be 3.11–3.13
node --version         # must be 20+
docker --version
```

---

## Step 1 — Clone the repository

```powershell
git clone https://github.com/VibeLearning26/new-gpt.git VibeGPT
cd VibeGPT
```

> If you already have a clone, update it instead:
> ```powershell
> cd VibeGPT
> git pull origin main
> ```

---

## Step 2 — Configure the environment file

```powershell
Copy-Item .env.example .env
```

Open `.env` and change **these two values** (the rest are fine as-is for local dev):

```env
# Set a random secret (any long random string works for local dev)
JWT_SECRET_KEY=paste-a-long-random-string-here

# Set the admin password you want to use
INITIAL_ADMIN_PASSWORD=admin123
```

Leave these as they are (they point at the local Docker services):

```env
DATABASE_URL=postgresql+asyncpg://vibegpt:vibegpt_dev_password@localhost:5432/vibegpt
OLLAMA_BASE_URL=http://localhost:11434
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_DEMO_MODE=false
```

> ⚠️ **Never commit `.env`.** It is git-ignored.

---

## Step 3 — Start the database and Ollama (Docker)

Make sure **Docker Desktop is open and the engine is running** (green icon).

```powershell
cd infrastructure
docker compose --env-file ../.env up postgres ollama -d
cd ..
```

Wait until both are healthy:

```powershell
docker ps
# Look for: vibegpt-postgres  (healthy)  and  vibegpt-ollama
```

---

## Step 4 — Pull the LLM model (first time only)

```powershell
docker exec vibegpt-ollama ollama pull llama3.2:3b
```

This downloads ~2 GB. Wait for it to finish. (AI answers won't work without it,
but the rest of the site will.)

---

## Step 5 — Backend setup (Python)

```powershell
cd services/api

# Create a virtual environment with a supported Python (use 3.12 if 3.14 is default)
py -3.12 -m venv .venv
# (or: python -m venv .venv   if your default python is already 3.11–3.13)

.venv\Scripts\activate

pip install --upgrade pip
pip install -r requirements.txt
```

> This installs torch + sentence-transformers and can take a few minutes.

### 5a. Create the database schema

```powershell
alembic upgrade head
```

### 5b. Seed the academic curriculum (departments, semesters, subjects)

The backend auto-creates the admin + student accounts and semesters on first
start, but the **subjects** come from the curriculum seed script:

```powershell
python -m scripts.seed_curriculum
```

Expected output ends with: `Done: 9 departments, 561 subjects created.`

> This script is idempotent — safe to re-run; it clears and rebuilds the
> departments/subjects each time.

---

## Step 6 — Frontend setup (Node.js)

```powershell
cd apps/web
npm install
cd ..\..
```

---

## Step 7 — Run the app (three terminals)

You need **three separate terminal windows**, all running at the same time.

**Terminal 1 — Backend API (port 8000):**
```powershell
cd services/api
.venv\Scripts\activate
uvicorn app.main:app --port 8000
```
Leave it running. You should see `Application startup complete`.

**Terminal 2 — Document worker (indexes uploaded files):**
```powershell
cd services/api
.venv\Scripts\activate
python -m app.workers.document_worker
```
Leave it running. You should see `Document worker started (poll_interval=10s...)`.

> ⚠️ **The worker is required.** Uploads stay stuck at "processing" forever if
> the worker isn't running.

**Terminal 3 — Frontend (port 3000):**
```powershell
cd apps/web
npm run dev
```
Leave it running. You should see `✓ Ready` and `Local: http://localhost:3000`.

---

## Step 8 — Open and log in

Go to **http://localhost:3000**

| Role | Email | Password |
|------|-------|----------|
| **Admin** | `admin@vibegpt.local` | whatever you set as `INITIAL_ADMIN_PASSWORD` in `.env` (e.g. `admin123`) |
| **Student** | `student@vibegpt.local` | `student123` |

✅ If you can log in and see the dashboard, the setup is complete.

---

## 🔧 Troubleshooting

### "Python 3.14" / `pydantic-core` build error
Your Python is too new. Install Python 3.12 and recreate the venv:
```powershell
Remove-Item -Recurse -Force .venv
py -3.12 -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

### Docker Desktop won't open
1. Make sure WSL 2 is installed: `wsl --update` then `wsl --shutdown` (run in an **Admin** PowerShell).
2. Delete stale lock files, then reopen Docker Desktop:
   ```powershell
   Remove-Item "$env:LOCALAPPDATA\Docker\*.lock" -Force
   ```
3. If it still crashes, reinstall Docker Desktop (your project files are safe — they live in your `VibeGPT` folder, not in Docker).

### "There is not enough space on the disk" (Docker)
Your **C: drive is nearly full**. Free up space:
```powershell
npm cache clean --force          # clears the npm cache (often several GB)
pip cache purge                  # clears the pip cache
```
Then restart Docker Desktop. Also check Docker Desktop → Settings → Resources for the virtual disk size.

### Frontend loads but every page is 404 (or `/` is 404)
This is a stale Turbopack cache. Clear it and restart the frontend:
```powershell
# stop the frontend (Ctrl+C in its terminal), then:
cd apps/web
Remove-Item .next -Recurse -Force
npm run dev
```

### "Failed to fetch" in the browser
The **backend API isn't running** (or crashed). Make sure Terminal 1 (uvicorn on
port 8000) is running. Test it:
```powershell
curl http://localhost:8000/api/v1/health     # should return ok / 200
```

### Uploads stuck at "processing"
The **document worker** (Terminal 2) isn't running. Start it:
```powershell
cd services/api
.venv\Scripts\activate
python -m app.workers.document_worker
```

### Login fails / "invalid credentials"
- The admin account is created on the **first backend startup** using
  `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD` from `.env`. If you changed the
  password *after* the first run, the DB still has the old one. Either reset the DB
  (drop and recreate the `vibegpt` database, then restart the backend) or use the
  password that was set on first run.
- Student login is always `student@vibegpt.local` / `student123`.

### No subjects show up
Run the curriculum seed (Step 5b):
```powershell
cd services/api
.venv\Scripts\activate
python -m scripts.seed_curriculum
```

---

## ✅ Final checklist

- [ ] Python 3.11–3.13 (not 3.14)
- [ ] `.env` created with a `JWT_SECRET_KEY` and `INITIAL_ADMIN_PASSWORD`
- [ ] Docker: `vibegpt-postgres` (healthy) + `vibegpt-ollama` running
- [ ] `ollama pull llama3.2:3b` done
- [ ] `pip install -r requirements.txt` done in `services/api/.venv`
- [ ] `alembic upgrade head` done
- [ ] `python -m scripts.seed_curriculum` done (9 departments, 561 subjects)
- [ ] `npm install` done in `apps/web`
- [ ] Terminal 1: API on 8000 — running
- [ ] Terminal 2: document worker — running
- [ ] Terminal 3: frontend on 3000 — running
- [ ] http://localhost:3000 loads and you can log in
