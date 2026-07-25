# VibeGPT Security Documentation

Living document — update with every security change. Last hardened: 2026-07-25.

## 1. Objectives & Trust Boundaries

- Students access **only** published material for subjects they are authorized for.
- Secrets (DB, JWT, gateway keys, Supabase) exist **only** server-side; browsers and the mobile app never see them.
- The LLM gateway (OmniRoute/9Router) and Ollama are **never** publicly reachable.
- All authorization is enforced in FastAPI + SQL predicates; frontend guards are UX only.

```
Browser/Flutter ──HTTPS──▶ Caddy (80/443, only public entry)
                             ├─▶ Next.js (internal :3000)
                             └─▶ FastAPI (internal :8000) ──▶ Postgres+pgvector (internal)
                                                        ──▶ Ollama (internal :11434)
                                                        ──▶ OmniRoute (loopback :20128) ──▶ upstream LLM providers
```

## 2. Authentication Design (current)

- Custom FastAPI JWT (HS256), Argon2id password hashing (passlib).
- Access token: 30 min, bearer header. **Web currently stores it in sessionStorage** — migration to in-memory + HttpOnly-cookie refresh is planned (Phase B).
- Refresh token: 7 days, HttpOnly cookie (`Secure` in prod, `SameSite=Lax`, `Path=/api/v1/auth`), **rotated every refresh**, stored as SHA-256 hash with `revoked_at`/`replaced_by`.
- Login: 5/min per client IP (proxy-aware), generic error (no enumeration), audit-logged with IP/UA.
- Production startup **refuses** default `JWT_SECRET_KEY` and default admin password.
- Planned (Phase B): refresh reuse detection/family revocation, iss/aud claims, revoke-all-devices, revoke-on-password-change, admin TOTP MFA.

## 3. Role Model & Authorization

Roles: `student`, `admin`, `super_admin` (faculty planned). Enforced via `require_role` dependencies; user state (active/archived) re-checked from DB on every request. Admins intentionally inherit the student experience (Student view); their sessions/feedback remain per-user.

## 4. Subject-Based Retrieval Isolation (critical)

Every vector query filters **in-SQL** (`app/rag/retrieval.py`):
`Document.status == PUBLISHED AND Document.is_active AND DocumentChunk.is_active AND Document.subject_id == :subject_id` (+ optional module). Subject access itself is verified per-request (`_require_subject_access`: explicit grant or cohort match). Regression tests: `tests/rag/test_retrieval_isolation.py`.

## 5. Prompt-Injection Model

System prompts declare documents/questions **untrusted** and forbid role/override/secret-disclosure instructions. The real boundaries are §4 isolation, server-side authorization, and network isolation — prompt text is a layer, not a wall.

## 6. File Upload Pipeline

Admin-only · 20/hour per client · extension allowlist (pdf/pptx/docx/xlsx) · streamed 20 MB cap · global 25 MB body cap · SHA-256 + duplicate rejection · PDF magic bytes · OOXML zip-container validation with **decompression limits** (≤2048 entries, ≤256 MB uncompressed, path-traversal rejection) · random server filename (original kept as metadata) · quarantine status (`PROCESSING`) until admin publishes · storage outside web root (local dir or private Supabase bucket). No virus scanner yet — not claimed; integration point is the worker claim step.

## 7. API Protections

- CORS: explicit origins only, methods/headers restricted, credentials on.
- Rate limiting: SlowAPI, **proxy-aware** client key (XFF trusted only from loopback/RFC1918 peers — `TRUSTED_PROXIES`), Retry-After via default 429 handler. Limits: login 5/min, answers 20/min, uploads 20/hour.
- Global body-cap middleware (413).
- Correlation IDs: `X-Request-ID` echoed; 401/403/429 logged as `security_event` with path/client/request_id.
- OpenAPI/docs disabled when `APP_ENV=production`.

## 8. LLM Gateway & Ollama

- Gateway (OmniRoute): OpenAI-compatible; key injected server-side (`ROUTER_API_KEY`); dashboard loopback-only in compose; model allowlist `ROUTER_ALLOWED_MODELS`.
- Ollama: no published ports in prod/oracle; loopback-only in dev; backend-only callers.
- Generation: 300 s timeout, single uvicorn worker (1 OCPU), container `mem_limit` as backpressure.

## 9. Secrets Management

- `.env`/`.env.*` gitignored (except `*.example`); examples contain placeholders only.
- Full-history scan (2026-07-25): no committed JWT secrets, Supabase keys, or private keys.
- Production `.env`: root-owned `chmod 600` on the VPS (`/opt/vibegpt/.env`).
- Rotation: treat any exposed secret as compromised → rotate → revoke → check logs → document. History rewrite ≠ safety.

## 10. Docker Security

- Prod/oracle: only Caddy publishes 80/443 (+443/udp); everything else `expose`/internal.
- All containers: `cap_drop: [ALL]`, `no-new-privileges`, `pids_limit`, `mem_limit` (prod), log rotation; Caddy `read_only` + tmpfs.
- API/web images: multi-stage, non-root users. No privileged containers, no Docker socket mounts.
- Dev compose: all ports bound to **127.0.0.1** only.
- Memory budget (6 GB): caddy 192m · web 512m · api 1.5–1.8g · worker 1.5–1.8g · ollama 2.5g · postgres 1g (local only) + 2 GB swap.

## 11. Caddy & TLS

Automatic HTTPS for real domains (raw IPs unsupported). Headers: HSTS, nosniff, X-Frame-DENY, Referrer-Policy, Permissions-Policy, **CSP report-only** (promote to enforcing once clean), 30 MB body cap, 300 s proxy timeouts for LLM routes.

## 12. Database

- Statement timeout 30 s + idle-in-transaction 60 s (engine connect args).
- Least-privilege runtime role script: `infrastructure/db-roles.sql` (optional; migrations stay owner-role).
- Supabase option: deny-by-default RLS + private storage bucket: `infrastructure/supabase-rls.sql`.

## 13. Logging & Monitoring

- AuditLog table: logins (+IP/UA), admin actions. Security events (401/403/429) logged with correlation IDs.
- Container healthchecks + restart policies; Caddy rotated access logs.
- Recommended external: uptime check, cert-expiry alert, disk/mem alerts, failed-login spike alerts.

## 14. Backups & Rollback

- `infrastructure/scripts/backup.sh` (pg_dump custom format + uploads tarball, 14 retained) — copy off-host.
- `infrastructure/scripts/restore.sh` — restore drill into a throwaway DB. **A backup is not verified until a restore succeeds.**
- Deploy rollback: `git revert <sha>` per focused commit; keep previous image tags; migrations have `downgrade()` paths.

## 15. VPS Hardening

See `docs/vps-hardening.md`: distro detection, key-only SSH with lockout prevention, default-deny firewall, Oracle Security Lists, Docker daemon checks, swap.

## 16. Known Limitations

- Web access token in sessionStorage until Phase B lands.
- No admin MFA yet (Phase B).
- No refresh-token family revocation yet (Phase B).
- No virus scanning (documented placeholder).
- VPS host hardening status: unverified (no server access during audit).
- Supabase RLS: script provided, not applied/verified (no console access).

## 17. Review Schedule

Re-audit on: dependency major bumps, auth changes, new public endpoints, deployment topology changes, or every 3 months.
