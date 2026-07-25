-- VibeGPT – Least-privilege database roles (optional hardening).
--
-- The app currently connects as the table-owning `vibegpt` role. For a
-- hardened deployment, create a restricted runtime role and point
-- DATABASE_URL at it. Run as a superuser/owner. Migrations should keep
-- running as the owner role (vibegpt); the runtime role only gets DML.
--
-- Usage: psql "$DATABASE_URL" -f infrastructure/db-roles.sql

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'vibegpt_app') THEN
        CREATE ROLE vibegpt_app LOGIN PASSWORD 'CHANGE_ME_strong_runtime_password';
    END IF;
END
$$;

GRANT CONNECT ON DATABASE vibegpt TO vibegpt_app;
GRANT USAGE ON SCHEMA public TO vibegpt_app;

-- DML only: no CREATE, no DROP, no TRUNCATE, no role management.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO vibegpt_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO vibegpt_app;

-- Future tables created by migrations inherit the same grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO vibegpt_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO vibegpt_app;

-- The runtime role must never bypass RLS or create extensions.
ALTER ROLE vibegpt_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

-- Then set, in the API environment:
--   DATABASE_URL=postgresql+asyncpg://vibegpt_app:CHANGE_ME...@host:5432/vibegpt
-- Keep the owner role (vibegpt) for `alembic upgrade head` only.
