# Going Live on the Hybrid Cloud (Free-First) Architecture

This runbook makes VibeGPT live using the hybrid architecture below —
**without touching the frontend UI, animations, Flutter app, or RAG logic**:

```
                    ┌────────────────────────── Cloudflare ──────────────────────────┐
 Students/Admins ──▶│  yourdomain.com (zone)                                        │
 (web + mobile)     │    ├── Worker route  /api/*  → vibegpt-gateway (this repo)    │
                    │    │     rate limit · auth gate · security headers · token    │
                    │    └── Pages custom domain  → Next.js static export           │
                    └───────────────┬────────────────────────────────────────────────┘
                                    │ (outbound-only tunnel — no open VPS ports)
                    ┌───────────────▼────── Oracle Cloud Free Tier VPS ──────────────┐
                    │  cloudflared ─▶ Caddy (requires X-Origin-Token) ─▶ FastAPI     │
                    │  + document worker + Ollama                                   │
                    └───────────────┬───────────────────────┬────────────────────────┘
                                    │                       │
                          Supabase PostgreSQL           Supabase Storage
                          (+ pgvector, RLS)             (private documents bucket)
```

Same-origin design: the Worker owns `/api/*` on the same domain the Pages
site is served from (Workers routes take precedence over Pages custom
domains — [docs](https://developers.cloudflare.com/workers/configuration/routing/routes/)),
so the browser never makes a cross-site call. The existing
`SameSite=Lax` refresh cookie, JWT flow, and `NEXT_PUBLIC_API_URL=/api/v1`
relative base all keep working unchanged.

Rollback at every step: the VPS keeps the plain-Oracle deployment files, and
each stage below is independently reversible.

---

## 0. Prerequisites

| Item | Notes |
|------|-------|
| Cloudflare account (free) | zone added for your domain (name servers pointed at Cloudflare) |
| Supabase project (free) | PostgreSQL + pgvector + Storage |
| Oracle Cloud Free Tier VPS | already deployed per [`../ORACLE_DEPLOYMENT.md`](../ORACLE_DEPLOYMENT.md) |
| Node.js 22+ + wrangler | for the Worker gateway and Pages deploys |
| A real domain | required for the same-origin topology (HTTPS + cookies) |

Generate the shared secrets once and store them safely:

```bash
openssl rand -hex 32   # ORIGIN_TOKEN  (Worker secret ↔ Caddy)
openssl rand -hex 32   # JWT_SECRET_KEY (already on the VPS)
```

---

## 1. Database + Storage on Supabase

Already covered by the Oracle guide — summary:

1. Create the Supabase project; note the project ref.
2. SQL editor → run [`../supabase-storage-setup.sql`](../supabase-storage-setup.sql),
   then [`../supabase-rls.sql`](../supabase-rls.sql).
3. Confirm `CREATE EXTENSION vector;` is active (Table editor → extensions).
4. Set on the VPS `.env`:
   `DATABASE_URL` (Supabase **session pooler**, port 5432, `?ssl=require`),
   `STORAGE_BACKEND=supabase`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`.
5. Migrations run automatically at API startup (`alembic upgrade head`).
   To import existing VPS data first: `pg_dump` locally → `psql` into
   Supabase pooler (see `../scripts/backup.sh` / `../scripts/restore.sh`).

## 2. Origin on the Oracle VPS (base stack)

Follow [`../ORACLE_DEPLOYMENT.md`](../ORACLE_DEPLOYMENT.md) sections 1–5 so
API + worker + Ollama run against Supabase and answer `GET /api/v1/health`.
**Do not open ports 3000/8000 publicly** — the next step replaces public
ingress entirely.

## 3. Tunnel (no public ingress)

1. Cloudflare dashboard → **Zero Trust → Networks → Tunnels → Create tunnel**
   (cloudflared flavor). Name it `vibegpt-origin`. Copy the connector token.
2. In the tunnel's **Public Hostname** tab add:

   | Subdomain             | Domain      | Service         |
   |-----------------------|-------------|-----------------|
   | `origin` (or similar) | yourdomain  | `http://caddy:80` |

   This creates the proxied DNS record for `origin.yourdomain.com` and issues
   the tunnel token. The hostname is deliberately not linked from anywhere.
3. On the VPS `.env`, set (see `oracle.env.example` for the full block):
   `ORIGIN_DOMAIN=origin.yourdomain.com`, `ORIGIN_TOKEN=<shared secret>`,
   `CLOUDFLARE_TUNNEL_TOKEN=<connector token>`.
4. Start with the overlay:

   ```bash
   cd infrastructure
   docker compose --env-file ../.env \
     -f docker-compose.oracle.yml -f docker-compose.cloudflare.yml up -d
   ```

5. Verify the origin is gated:

   ```bash
   curl -i https://origin.yourdomain.com/api/v1/health          # → 403 (no token)
   curl -i -H "X-Origin-Token: <shared secret>" \
       https://origin.yourdomain.com/api/v1/health               # → 200 {"status": "ok"}
   ```

   Optional hardening: put Cloudflare Access (Zero Trust, free ≤ 50 users) in
   front of `origin.yourdomain.com` with a service token as an independent
   second gate in addition to `X-Origin-Token`.

## 4. Worker gateway

```bash
cd infrastructure/cloudflare/gateway
npm install
npx wrangler login
```

1. Edit `wrangler.jsonc`:
   - `vars.ORIGIN_URL` → `https://origin.yourdomain.com`
   - optionally raise/lower the rate limit (`simple.limit` / `period`).
2. Set the shared secret (never write it in the file):

   ```bash
   npx wrangler secret put ORIGIN_TOKEN
   ```

3. Deploy and attach the route (either works):

   ```bash
   npx wrangler deploy
   ```

   - Dashboard: **Workers → vibegpt-gateway → Settings → Domains & Routes →
     Add → Route**: `yourdomain.com/api/*`, or
   - uncomment the `routes` stanza in `wrangler.jsonc` with your zone id and
     re-run `wrangler deploy`.

4. Watch security events live:

   ```bash
   npm run tail
   ```

Gateway behavior (details in `src/index.ts`): public allowlist for
`auth/login|refresh|logout*` and `health|ready|version|stats|visit`;
everything else needs a Bearer token present (FastAPI still fully validates
JWTs and roles); per-token→per-IP rate limit at the edge; 25 MB body cap;
security headers; `Cache-Control: no-store` on API responses.

## 5. Frontend on Cloudflare Pages

The Next.js app is fully client-rendered, so Pages serves it as a static
export from the same source — `next.config.ts` switches automatically when
Cloudflare sets `CF_PAGES=1` during the build (local/Docker builds unchanged).

1. Push the repository to GitHub/GitLab.
2. Dashboard → **Workers & Pages → Create → Pages → Connect to Git**:
   - Project name `vibegpt`, production branch `main`
   - Framework preset: **Next.js (Static HTML export)**
   - Build command: `npx next build` — run from `apps/web`
   - Build output directory: `apps/web/out`
   - Environment variables (Production and Preview):
     | Name                  | Value        |
     |-----------------------|--------------|
     | `NEXT_PUBLIC_API_URL` | `/api/v1`    |
     | `NEXT_PUBLIC_DEMO_MODE` | `false`    |
3. Deploy. Verify `https://vibegpt.pages.dev` loads the landing page with all
   animations intact.
4. **Custom domain (same-origin mode):** Pages → project →
   **Custom domains → Set up → yourdomain.com**. Cloudflare creates the DNS
   record; keep it proxied (orange cloud).
5. Confirm the split routing:
   - `https://yourdomain.com/` → Pages site
   - `https://yourdomain.com/api/v1/health` → gateway → origin `{"status":"ok"}`

No custom domain yet (temporary preview)? Set `NEXT_PUBLIC_API_URL` to the
Worker's `workers.dev` URL, deploy the Worker with
`ALLOWED_ORIGINS=https://vibegpt.pages.dev` and
`FORCE_SAMESITE_NONE=true` vars (rewrites the refresh cookie for cross-site
use), and add the pages.dev origin to `CORS_ORIGINS` on the VPS. The custom
domain path above is strongly preferred.

## 6. Mobile app

The Flutter app is unchanged. Point its base URL at
`https://yourdomain.com/api/v1` in its environment/config, rebuild, and test
login + question flow over the live gateway.

## 7. Go-live test checklist (run before announcing)

From the spec — all must pass against `https://yourdomain.com`:

- [ ] Student login (and MFA if enabled) issues tokens; refresh survives a reload
- [ ] Admin login; dashboard loads
- [ ] Admin uploads a PDF/DOCX/PPTX/XLSX → appears in Supabase Storage bucket
- [ ] Document worker processes it: chunks + embeddings visible in Supabase tables
- [ ] Student asks a question → grounded answer with citations and mark-based format
- [ ] Citations reference the uploaded material
- [ ] Chat sessions: create, rename, delete, reload
- [ ] Rate limiting: >120 req/min returns 429 (watch `npm run tail` in gateway/)
- [ ] Origin unreachable without token: direct `curl` to `origin.yourdomain.com` → 403
- [ ] Mobile app login + answering
- [ ] Landing page animations, WebGL visuals, and markdown answers render identically
- [ ] Rollback rehearsal: `docker compose -f docker-compose.oracle.yml up -d` still boots

## 8. Cost & limits snapshot (free tiers)

| Service        | Free allowance (approx.) | VibeGPT usage                  |
|----------------|--------------------------|--------------------------------|
| Cloudflare Pages | 500 builds/mo, unlimited static requests | static frontend |
| Cloudflare Workers | 100k req/day | API gateway only |
| Workers rate-limit binding | modest quotas — gateway fails open | per-user limits |
| Supabase       | 500 MB DB, 1 GB storage, 2 GB egress | docs + vectors |
| Oracle Ampere A1 | 4 OCPU / 24 GB RAM (always free) | API, worker, Ollama |

## 9. Rollback

- **Frontend**: disconnect the Pages custom domain; DNS back to the VPS.
- **Gateway**: delete the Workers route — traffic falls through to Pages.
- **Origin**: `docker compose --env-file ../.env -f docker-compose.oracle.yml up -d`
  restores the public Caddy + web topology (requires domain DNS back on the VPS).
- **Database**: Supabase remains authoritative either way; keep the
  pre-migration `pg_dump` from `../scripts/backup.sh`.
