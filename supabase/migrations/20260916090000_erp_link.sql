-- 20260916090000_erp_link.sql
--
-- THE ERP LINK — the portal PULLS sales orders from the Houzs ERP's REST API
-- with a key somebody pasted on Fair's Commission Calculation page.
--
-- The push feed (20260905010000_erp_live_sync) needs the ERP's database to run
-- an outbox that its team has not applied; the link needs nothing from the ERP
-- but a bearer key it already issues. Both roads end in the SAME ingest RPC
-- (`ingest_erp_sales_order`), the same batches, orders, lines and event log —
-- a pulled order and a pushed one are indistinguishable downstream.
--
-- THE KEY NEVER SITS IN A TABLE THE APP READS. It lives in Supabase Vault
-- (encrypted at rest) under the name 'erp_link:<sub_department_id>', reachable
-- only through the three SECURITY DEFINER functions at the bottom, which only
-- the service role may execute. `erp_links` holds everything ABOUT the link —
-- the address, the last four characters, who linked it, the last check, the
-- last sync — and that is what the page shows. Nothing a browser session can
-- call returns the key.
--
-- Additive: two tables, three functions. Reversal: DROP FUNCTION the three,
-- DROP TABLE erp_pull_docs, DROP TABLE erp_links, and DELETE FROM vault.secrets
-- WHERE name LIKE 'erp_link:%'.

-- ── The link ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS erp_links (
    sub_department_id UUID PRIMARY KEY REFERENCES comm_sub_departments(id) ON DELETE CASCADE,
    base_url          TEXT NOT NULL,
    company_id        INTEGER NOT NULL DEFAULT 1,
    key_hint          TEXT NOT NULL,
    identity          JSONB,
    linked_by         UUID REFERENCES users(id) ON DELETE SET NULL,
    linked_by_name    TEXT,
    linked_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_check_at     TIMESTAMPTZ,
    last_check_ok     BOOLEAN,
    last_check_note   TEXT,
    last_pull_at      TIMESTAMPTZ,
    last_pull_period  DATE,
    last_pull_note    TEXT,
    last_pull_stats   JSONB,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE erp_links IS
    'One row per commission programme linked to the Houzs ERP by API key. The key itself is in Vault (erp_link:<sub_department_id>); this row is what the Comm Cal page shows about the link.';
COMMENT ON COLUMN erp_links.key_hint IS 'The last characters of the key, so a human can tell which key is in — never the key.';
COMMENT ON COLUMN erp_links.identity IS 'Who the ERP said the key is (GET /api/auth/me) when it was linked: {id, name, role, service}.';
COMMENT ON COLUMN erp_links.company_id IS 'The ERP company the pull reads (X-Company-Id). Houzs Century = 1.';

ALTER TABLE erp_links ENABLE ROW LEVEL SECURITY;

-- Same wall as erp_sync_events: admin and hr scopes, nobody else.
CREATE POLICY erp_links_principal_all ON erp_links FOR ALL
    USING ((SELECT has_scope(ARRAY['admin'])))
    WITH CHECK ((SELECT has_scope(ARRAY['admin'])));
CREATE POLICY erp_links_hr_all ON erp_links FOR ALL
    USING ((SELECT has_scope(ARRAY['hr'])))
    WITH CHECK ((SELECT has_scope(ARRAY['hr'])));

-- ── What a pull remembers per document ──────────────────────────────────────
--
-- A month has hundreds of orders and the ERP's list answers with the header
-- of each; fetching every document's lines every time would be hundreds of
-- requests to learn that nothing changed. So a pull hashes the commission-
-- relevant header fields of each list row, keeps the hash here, and only
-- fetches the documents whose hash moved (or that it has never seen). A
-- document that was here last time and is missing from the ERP's list is
-- fetched once more to learn whether it was deleted or merely re-dated.

CREATE TABLE IF NOT EXISTS erp_pull_docs (
    sub_department_id UUID NOT NULL REFERENCES comm_sub_departments(id) ON DELETE CASCADE,
    doc_no            TEXT NOT NULL,
    period_month      DATE,
    list_hash         TEXT NOT NULL,
    last_seen_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_ingested_at  TIMESTAMPTZ,
    last_status       TEXT,
    PRIMARY KEY (sub_department_id, doc_no)
);

COMMENT ON TABLE erp_pull_docs IS
    'Per document, the hash of the ERP list row the last pull saw. A pull fetches a document only when this moves.';

CREATE INDEX IF NOT EXISTS idx_erp_pull_docs_period ON erp_pull_docs (sub_department_id, period_month);

ALTER TABLE erp_pull_docs ENABLE ROW LEVEL SECURITY;

CREATE POLICY erp_pull_docs_principal_all ON erp_pull_docs FOR ALL
    USING ((SELECT has_scope(ARRAY['admin'])))
    WITH CHECK ((SELECT has_scope(ARRAY['admin'])));
CREATE POLICY erp_pull_docs_hr_all ON erp_pull_docs FOR ALL
    USING ((SELECT has_scope(ARRAY['hr'])))
    WITH CHECK ((SELECT has_scope(ARRAY['hr'])));

-- ── The key, in Vault ───────────────────────────────────────────────────────
--
-- Three doors, all SECURITY DEFINER (the vault schema is not exposed to
-- PostgREST and its functions belong to supabase_admin), all executable by the
-- service role ONLY. The server actions on the Comm Cal page reach them through
-- the service-role client — src/lib/erp-link/secret.ts, the admin client's
-- third caller — after requirePermission('revenue'). An HR user's browser
-- session cannot call them: EXECUTE is revoked from authenticated below.

CREATE OR REPLACE FUNCTION erp_link_put_secret(p_sub UUID, p_secret TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_name TEXT := 'erp_link:' || p_sub::TEXT;
    v_id   UUID;
BEGIN
    IF p_sub IS NULL THEN
        RAISE EXCEPTION 'erp_link_put_secret: a sub-department is required';
    END IF;
    IF COALESCE(BTRIM(p_secret), '') = '' THEN
        RAISE EXCEPTION 'erp_link_put_secret: a key is required';
    END IF;
    SELECT id INTO v_id FROM vault.secrets WHERE name = v_name ORDER BY created_at LIMIT 1;
    IF v_id IS NULL THEN
        PERFORM vault.create_secret(p_secret, v_name, 'Houzs ERP API key for the commission feed');
    ELSE
        PERFORM vault.update_secret(v_id, p_secret);
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION erp_link_get_secret(p_sub UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_secret TEXT;
BEGIN
    IF p_sub IS NULL THEN
        RETURN NULL;
    END IF;
    SELECT decrypted_secret INTO v_secret
      FROM vault.decrypted_secrets
     WHERE name = 'erp_link:' || p_sub::TEXT
     ORDER BY created_at
     LIMIT 1;
    RETURN v_secret;
END;
$$;

CREATE OR REPLACE FUNCTION erp_link_drop_secret(p_sub UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_sub IS NULL THEN
        RETURN;
    END IF;
    DELETE FROM vault.secrets WHERE name = 'erp_link:' || p_sub::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION erp_link_put_secret(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION erp_link_get_secret(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION erp_link_drop_secret(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION erp_link_put_secret(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION erp_link_get_secret(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION erp_link_drop_secret(UUID) TO service_role;

COMMENT ON FUNCTION erp_link_put_secret(UUID, TEXT) IS 'Store or replace the ERP API key for a programme in Vault. Service role only.';
COMMENT ON FUNCTION erp_link_get_secret(UUID) IS 'Read the ERP API key for a programme from Vault. Service role only — never callable from a browser session.';
COMMENT ON FUNCTION erp_link_drop_secret(UUID) IS 'Forget the ERP API key for a programme. Service role only.';
