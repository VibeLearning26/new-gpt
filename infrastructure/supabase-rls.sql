-- VibeGPT – Supabase Row Level Security policies.
--
-- Apply ONLY if you host the VibeGPT schema inside a Supabase project
-- (oracle deployment option). The FastAPI backend connects with the
-- service-role key (RLS bypass) and remains the single authorization
-- authority; these policies are defense-in-depth against any direct
-- anon-key access to the database.
--
-- If the backend uses Supabase Auth JWTs in future, replace the
-- permissive policies with claim-based checks, e.g.:
--   USING (auth.uid() = user_id)
--
-- Usage: run in the Supabase SQL editor or
--   psql "$SUPABASE_DB_URL" -f infrastructure/supabase-rls.sql

-- ── Enable RLS on every sensitive table ─────────────────────
ALTER TABLE IF EXISTS users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS refresh_tokens      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS departments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS semesters           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS subjects            ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS modules             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS documents           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS document_chunks     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS question_logs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS question_sources    ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS saved_answers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS feedback            ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS chat_sessions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS audit_logs          ENABLE ROW LEVEL SECURITY;

-- ── Deny-by-default for anon / authenticated direct access ──
-- All authorization decisions are made in FastAPI (service role), so no
-- anon or direct-authenticated rows should ever be readable. If you later
-- expose tables to Supabase client SDKs, add narrow policies per table.

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'users', 'refresh_tokens', 'departments', 'semesters', 'subjects',
        'modules', 'documents', 'document_chunks', 'question_logs',
        'question_sources', 'saved_answers', 'feedback', 'chat_sessions',
        'audit_logs'
    ]
    LOOP
        EXECUTE format(
            'CREATE POLICY deny_anon_%1$I ON %1$I FOR ALL TO anon USING (false) WITH CHECK (false)',
            t
        );
    END LOOP;
END
$$;

-- ── Storage bucket ──────────────────────────────────────────
-- Documents bucket must be PRIVATE; the API serves files through the
-- authenticated /student/documents/{id}/file endpoint, never via public URLs.
-- In the Supabase dashboard: Storage → documents → Public bucket = OFF.
-- Policy: no anon read; service role (API) manages objects.
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO UPDATE SET public = false;

CREATE POLICY documents_service_only ON storage.objects
    FOR ALL TO anon, authenticated
    USING (false) WITH CHECK (false);
