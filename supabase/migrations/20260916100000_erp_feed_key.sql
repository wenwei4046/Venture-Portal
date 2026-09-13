-- 20260916100000_erp_feed_key.sql
--
-- THE ERP'S API KEY, PASTED ON THE PORTAL. The Houzs ERP's Venture Portal Feed
-- page generates a key and sends every changed sales order to the portal's
-- receiver with it (`x-sync-secret`). Somebody with the revenue permission
-- pastes that key once on Fair's Commission Calculation page, and from then on
-- the receiver accepts deliveries carrying it — no Vercel environment variable
-- to set, no database console. `ERP_SYNC_SECRET` on Vercel keeps working as a
-- second accepted secret for as long as it is set.
--
-- THE KEY NEVER SITS IN A TABLE THE APP READS. It lives in Supabase Vault
-- (encrypted at rest) under the name 'erp_link:<sub_department_id>', reachable
-- only through the SECURITY DEFINER functions below, which only the service
-- role may execute — whatever an HR user's server action can read with their
-- session, their browser can read too, and this key opens the receiver.
-- `erp_links` holds what the page shows: the last four characters, who pasted
-- it and when.
--
-- Additive: one table, four functions. Reversal: DROP FUNCTION the four,
-- DROP TABLE erp_links, DELETE FROM vault.secrets WHERE name LIKE 'erp_link:%'.

CREATE TABLE IF NOT EXISTS erp_links (
    sub_department_id UUID PRIMARY KEY REFERENCES comm_sub_departments(id) ON DELETE CASCADE,
    key_hint          TEXT NOT NULL,
    linked_by         UUID REFERENCES users(id) ON DELETE SET NULL,
    linked_by_name    TEXT,
    linked_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE erp_links IS
    'One row per commission programme whose ERP feed key has been pasted on the portal. The key itself is in Vault (erp_link:<sub_department_id>); this row is what the Comm Cal page shows about it.';
COMMENT ON COLUMN erp_links.key_hint IS 'The last characters of the key, so a human can tell which key is in — never the key.';

ALTER TABLE erp_links ENABLE ROW LEVEL SECURITY;

-- Same wall as erp_sync_events: admin and hr scopes, nobody else.
CREATE POLICY erp_links_principal_all ON erp_links FOR ALL
    USING ((SELECT has_scope(ARRAY['admin'])))
    WITH CHECK ((SELECT has_scope(ARRAY['admin'])));
CREATE POLICY erp_links_hr_all ON erp_links FOR ALL
    USING ((SELECT has_scope(ARRAY['hr'])))
    WITH CHECK ((SELECT has_scope(ARRAY['hr'])));

-- ── The key, in Vault ───────────────────────────────────────────────────────
--
-- Four doors, all SECURITY DEFINER (the vault schema is not exposed to
-- PostgREST and its functions belong to supabase_admin), all executable by the
-- service role ONLY. The portal reaches them through the service-role client —
-- src/lib/erp-sync/feed-key.ts, the admin client's third caller: the link
-- actions after requirePermission('revenue'), and the receiver, which has no
-- session at all. EXECUTE is revoked from authenticated below, so an HR user's
-- browser session cannot call them.

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
        PERFORM vault.create_secret(BTRIM(p_secret), v_name, 'Houzs ERP feed key for the commission feed');
    ELSE
        PERFORM vault.update_secret(v_id, BTRIM(p_secret));
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

-- The receiver's one call: the key for the programme the ERP feed belongs to
-- (Fair — erp_sync_sub_department()), or NULL when none is pasted. Never
-- raises: a portal with no Fair yet is "not configured", not an error.
CREATE OR REPLACE FUNCTION erp_feed_secret()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sub UUID;
BEGIN
    BEGIN
        v_sub := erp_sync_sub_department();
    EXCEPTION WHEN OTHERS THEN
        RETURN NULL;
    END;
    RETURN erp_link_get_secret(v_sub);
END;
$$;

REVOKE ALL ON FUNCTION erp_link_put_secret(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION erp_link_get_secret(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION erp_link_drop_secret(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION erp_feed_secret() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION erp_link_put_secret(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION erp_link_get_secret(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION erp_link_drop_secret(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION erp_feed_secret() TO service_role;

COMMENT ON FUNCTION erp_link_put_secret(UUID, TEXT) IS 'Store or replace the ERP feed key for a programme in Vault. Service role only.';
COMMENT ON FUNCTION erp_link_get_secret(UUID) IS 'Read the ERP feed key for a programme from Vault. Service role only — never callable from a browser session.';
COMMENT ON FUNCTION erp_link_drop_secret(UUID) IS 'Forget the ERP feed key for a programme. Service role only.';
COMMENT ON FUNCTION erp_feed_secret() IS 'The key the ERP feed receiver accepts (the Fair programme''s pasted key), or NULL. Service role only.';
