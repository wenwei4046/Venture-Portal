-- Manual JVs only wrote the GL: a JV touching a bank account's GL code
-- (3000/3010) moved the ledger but left bank_accounts.current_balance (the
-- cache that drives the bank pages AND the approval sufficiency check)
-- untouched — guaranteed drift. User request 2026-06-12: JVs must affect the
-- corresponding accounts including the bank.
--
-- Fix: a shared helper applies the bank-cache delta for a set of JV lines
-- (debit on a bank GL code = +, credit = −; sign -1 reverses). The three JV
-- RPCs call it: create applies, delete reverses, update reverses the OLD
-- lines then applies the NEW ones. All inside the same transaction as the
-- GL write, so cache and ledger cannot diverge.
--
-- Pool ledgers are intentionally NOT wired: pools are not GL accounts, a JV
-- line cannot identify a pool. Pool movements stay on the voucher flows.
-- (Applied via MCP apply_migration on 2026-06-12; file kept for repo parity.)

CREATE OR REPLACE FUNCTION public.jv_apply_bank_cache(p_entry_id uuid, p_sign integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT ba.id AS bank_id,
           SUM(COALESCE(jl.debit, 0) - COALESCE(jl.credit, 0)) AS delta
      FROM journal_lines jl
      JOIN bank_accounts ba ON ba.gl_account_code = jl.account_code
     WHERE jl.entry_id = p_entry_id
     GROUP BY ba.id
    HAVING SUM(COALESCE(jl.debit, 0) - COALESCE(jl.credit, 0)) <> 0
  LOOP
    UPDATE bank_accounts
       SET current_balance = current_balance + (p_sign * r.delta)
     WHERE id = r.bank_id;
  END LOOP;
END $function$;

REVOKE ALL ON FUNCTION public.jv_apply_bank_cache(uuid, integer) FROM PUBLIC;
-- Internal helper: callable only from the SECURITY DEFINER JV RPCs (owner),
-- not granted to authenticated.

-- Patch the three JV RPCs from their live definitions (anchored, verified).
DO $$
DECLARE
    def TEXT;
BEGIN
    -- create: apply cache after the lines insert (RETURN v_entry_id; is the tail)
    SELECT pg_get_functiondef(p.oid) INTO def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='create_manual_journal_voucher';
    IF def IS NULL THEN RAISE EXCEPTION 'create_manual_journal_voucher not found'; END IF;
    IF position('RETURN v_entry_id;' IN def) = 0 THEN RAISE EXCEPTION 'create JV: tail anchor missing'; END IF;
    IF position('jv_apply_bank_cache' IN def) > 0 THEN RAISE EXCEPTION 'create JV: already patched'; END IF;
    def := replace(def,
        'RETURN v_entry_id;',
        'PERFORM jv_apply_bank_cache(v_entry_id, 1);' || E'\n\n  ' || 'RETURN v_entry_id;');
    EXECUTE def;

    -- update: reverse OLD lines before the delete, apply NEW after the entry update
    SELECT pg_get_functiondef(p.oid) INTO def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='update_manual_journal_voucher';
    IF def IS NULL THEN RAISE EXCEPTION 'update_manual_journal_voucher not found'; END IF;
    IF position('DELETE FROM journal_lines WHERE entry_id = p_entry_id;' IN def) = 0 THEN RAISE EXCEPTION 'update JV: delete anchor missing'; END IF;
    IF position('jv_apply_bank_cache' IN def) > 0 THEN RAISE EXCEPTION 'update JV: already patched'; END IF;
    def := replace(def,
        'DELETE FROM journal_lines WHERE entry_id = p_entry_id;',
        'PERFORM jv_apply_bank_cache(p_entry_id, -1);' || E'\n  ' ||
        'DELETE FROM journal_lines WHERE entry_id = p_entry_id;');
    -- Anchor on the UNIQUE tail of the entry UPDATE ('segment = v_segment'
    -- exists since mig 20260612000000) — a bare 'WHERE id = p_entry_id;'
    -- would also match the reference_type SELECT near the top.
    IF position('segment = v_segment
  WHERE id = p_entry_id;' IN def) = 0 THEN RAISE EXCEPTION 'update JV: entry-update tail anchor missing'; END IF;
    def := replace(def,
        'segment = v_segment
  WHERE id = p_entry_id;',
        'segment = v_segment
  WHERE id = p_entry_id;' || E'\n\n  ' ||
        'PERFORM jv_apply_bank_cache(p_entry_id, 1);');
    EXECUTE def;

    -- delete: reverse before the entry (and its lines, via cascade) goes away.
    -- Runs after the manual_jv guard, while the lines still exist.
    SELECT pg_get_functiondef(p.oid) INTO def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='delete_manual_journal_voucher';
    IF def IS NULL THEN RAISE EXCEPTION 'delete_manual_journal_voucher not found'; END IF;
    IF position('jv_apply_bank_cache' IN def) > 0 THEN RAISE EXCEPTION 'delete JV: already patched'; END IF;
    IF position('DELETE FROM journal_entries WHERE id = p_entry_id;' IN def) = 0 THEN RAISE EXCEPTION 'delete JV: entry-delete anchor missing'; END IF;
    def := replace(def,
        'DELETE FROM journal_entries WHERE id = p_entry_id;',
        'PERFORM jv_apply_bank_cache(p_entry_id, -1);' || E'\n  ' ||
        'DELETE FROM journal_entries WHERE id = p_entry_id;');
    EXECUTE def;

    RAISE NOTICE 'patched create/update/delete_manual_journal_voucher';
END
$$;
