# VibeGPT — Complete Setup Guide (Windows)

> **How to use this document:** a step-by-step guide to run VibeGPT locally from a
> fresh clone. Follow it yourself or paste it into an AI coding assistant and ask
> it to execute the steps. Commands are exact. Do the steps **in order** — later
> steps depend on earlier ones.

---

## 🎯 Goal

Get these running on your machine:

1. **PostgreSQL + pgvector** (database) — Docker
2. **Ollama** (local LLM) — Docker *(optional if you use the gateway)*
3. **OmniRoute** (LLM gateway — MiMo & free models) — npm *(optional if you use Ollama)*
4. **FastAPI backend** (port 8000) + **document worker** — Python
5. **Next.js frontend** (port 3000) — Node.js

When done: open **http://localhost:3000**, log in, and start studying.

---

## 📋 Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| **Git** | any | https://git-scm.com |
| **Python** | **3.11–3.13** | ⚠️ **NOT 3.14** (`pydantic-core` fails to build). Check: `python --version`. |
| **Node.js** | **22.22+ or 24+** | https://nodejs.org — older 22.x triggers OmniRoute warnings; 24 LTS recommended. |
| **Docker Desktop** | any recent | https://docker.com — needed for Postgres + Ollama. |

---

## 1. Clone the repository

```powershell
git clone https://github.com/VibeLearning26/new-gpt.git VibeGPT
cd VibeGPT
```

Repo layout:

```
VibeGPT/
├── apps/web/            # Next.js 16 + React 19 + Tailwind v4 (port 3000)
├── apps/mobile/         # Flutter app (optional)
├── services/api/        # FastAPI + SQLAlchemy + Alembic + pgvector (port 8000)
├── infrastructure/      # docker-compose files, Caddyfile, SQL scripts
└── docs/                # security.md, vps-hardening.md
```

---

## 2. Start the infrastructure (Postgres + Ollama)

```powershell
cd infrastructure
docker compose up -d postgres ollama ollama-init
cd ..
```

- Postgres: `localhost:5432` (db `vibegpt`, user `vibegpt`, password `vibegpt_dev_password`)
- Ollama: `localhost:11434`, pulls `llama3.2:3b` automatically
- Ports are bound to **127.0.0.1 only** — never exposed to your LAN.

Verify:

```powershell
docker ps                                   # both containers healthy
```

---

## 3. Backend (FastAPI + worker)

```powershell
cd services/api

# Virtual environment
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# Dependencies (CPU-only torch is pinned — no CUDA download)
pip install -r requirements.txt

# Environment file
copy .env.example .env
```

Edit `services/api/.env` — the defaults work for local Ollama. Key settings:

```dotenv
APP_ENV=development
DATABASE_URL=postgresql+asyncpg://vibegpt:vibegpt_dev_password@localhost:5432/vibegpt
JWT_SECRET_KEY=<generate a random 64-char string for anything beyond local play>

# LLM: "ollama" (local) or "router" (OmniRoute gateway — step 3b)
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2:3b
```

Migrate + run:

```powershell
# Database migrations
python -m alembic upgrade head

# API (keep this terminal open)
python -m uvicorn app.main:app --port 8000
```

In a **second terminal** (same folder, venv activated) — the document indexer:

```powershell
python -m app.workers.document_worker
```

Verify: http://localhost:8000/api/v1/health → `{"status":"ok"}` (approx.).

### 3b. Optional: OmniRoute gateway (Xiaomi MiMo + free models)

Use this instead of (or alongside) local Ollama for stronger models.

```powershell
npm install -g omniroute
omniroute serve
```

1. Open **http://localhost:20128/dashboard** and add your upstream provider keys
   (OpenCode free models, Xiaomi MiMo, etc.).
2. In `services/api/.env`:

   ```dotenv
   LLM_PROVIDER=router
   ROUTER_BASE_URL=http://localhost:20128/v1
   ROUTER_API_KEY=                      # only if your gateway requires auth
   ROUTER_DEFAULT_MODEL=opencode-zen/mimo-v2.5-free
   ROUTER_DASHBOARD_URL=http://localhost:20128/dashboard
   # Comma-separated allowlist shown in the student model switcher:
   ROUTER_ALLOWED_MODELS=opencode-zen/big-pickle,opencode-zen/deepseek-v4-flash-free,opencode-zen/laguna-s-2.1-free,opencode-zen/ling-3.0-flash-free,opencode-zen/mimo-v2.5-free,opencode-zen/nemotron-3-ultra-free,opencode-zen/north-mini-code-free
   ```

3. Restart the API. Students can now switch models from the chat header.

**Troubleshooting OmniRoute:**
- `better-sqlite3 ... NODE_MODULE_VERSION` error after a Node upgrade →
  `omniroute runtime repair`
- It exits immediately from background shells — run it in its own terminal
  (or `omniroute serve --daemon`).

---

## 4. Frontend (Next.js)

In a **third terminal**:

```powershell
cd apps/web
npm install
npm run dev
```

Open **http://localhost:3000**.

> If every route 404s after pulling new code: delete `apps/web/.next` and restart
> `npm run dev`.

---

## 5. Log in

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@vibegpt.local` | `admin123` |
| Student | `student@vibegpt.local` | `student123` |

These are **development** accounts created on first startup. For any shared or
production deployment: set `APP_ENV=production` (the API then refuses default
secrets), change `INITIAL_ADMIN_PASSWORD` before first boot, and enable admin
2FA at **Admin → Security**.

---

## 6. Using the app

### As admin
1. **Departments / Subjects** — create the academic structure (9 departments,
   8 semesters and 561 real 2024 course codes are pre-seeded).
2. **Documents** — upload PDF/PPTX/DOCX/XLSX (≤20 MB) into a subject. The worker
   extracts → chunks → embeds them; **publish** when ready.
3. **Answer format** — tune mark-based rules (2/3/5/8/10 marks word windows).
4. **Analytics** — live usage, tokens, performance charts.
5. **Router** — gateway status + dashboard link (when `LLM_PROVIDER=router`).
6. **Feedback** — student reports; reply, resolve, delete.
7. **Security** — admin TOTP 2FA enrollment + sign-out-all-devices.

### As student
1. **Subjects** — shows subjects that have published material; view/download
   files; filters by semester/department.
2. **Chat** — pick subject, marks (presets or custom 1–20) and model; answers are
   grounded in the subject's documents with `[S1]…` citations, or general
   knowledge when no material matches. Conversations persist as sessions in the
   sidebar (rename/delete/reopen). Rate or report any answer via **Feedback**.

---

## 7. Tests & checks

```powershell
# Backend (services/api, venv active)
ruff check .
pytest

# Frontend (apps/web)
npx tsc --noEmit
npm run lint
```

---

## 8. Production deployment (Oracle Cloud VPS)

Full details in `docs/vps-hardening.md` and `docs/security.md`. Summary:

1. Copy the repo to the VPS; create `/opt/vibegpt/.env` from
   `infrastructure/oracle.env.example` (**chmod 600**, every placeholder replaced,
   `APP_ENV=production`).
2. Point a **domain** at the VPS IP (automatic HTTPS needs a real domain — raw IPs
   cannot get public certificates).
3. Deploy:

   ```bash
   # With local Postgres:
   docker compose -f infrastructure/docker-compose.prod.yml up -d --build
   # With Supabase-hosted DB/storage:
   docker compose -f infrastructure/docker-compose.oracle.yml up -d --build
   ```

4. Only Caddy publishes 80/443; API/web/Ollama are internal-only. Containers run
   with dropped capabilities, no-new-privileges, PID and memory limits.
5. Restrict the Oracle Cloud Security List to 22 (your IP only), 80, 443; harden
   SSH (key-only, no root) per `docs/vps-hardening.md`.
6. Backups: `infrastructure/scripts/backup.sh` (pg_dump + uploads, 14 retained) —
   copy off-host; test restores with `restore.sh`.
7. Supabase users: apply `infrastructure/supabase-rls.sql` (deny-by-default RLS +
   private storage bucket). Least-privilege DB roles: `infrastructure/db-roles.sql`.

---

## 9. Troubleshooting

| Symptom | Fix |
|---|---|
| Frontend 404s on all routes | Delete `apps/web/.next`, restart `npm run dev` |
| `EADDRINUSE` / port busy | Old process still holds the port: `Get-NetTCPConnection -LocalPort 8000` → `Stop-Process -Id <pid>` |
| Login fails after pulling auth changes | Tokens now carry issuer/audience — just log in again (old tokens are rejected by design) |
| `JWT_SECRET_KEY` warning | Set a real random secret in `.env` (required in production) |
| Answers are slow | CPU inference is ~5–10 tok/s; use the OmniRoute gateway for faster models |
| OmniRoute `NODE_MODULE_VERSION` error | `omniroute runtime repair` |
| Postgres/Ollama unreachable from LAN | Intentional — dev ports bind 127.0.0.1 only; use the production topology for remote access |
| Demo data in DB | `student@vibegpt.local/student123` exists only when `APP_ENV=development`; never promote that database to production |

---

## 10. Git workflow

- `origin` = VibeGPT.git (archive — **do not push**)
- `new-origin` = new-gpt (shared repo — push here, only when asked)
- CI runs ruff + pytest (API), lint + build (web), analyze + build (mobile),
  plus CodeQL and Dependabot.
