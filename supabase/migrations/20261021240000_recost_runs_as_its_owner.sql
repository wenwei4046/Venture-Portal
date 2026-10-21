-- ============================================================================
-- 20261021240000_recost_runs_as_its_owner.sql
-- Comm Cal › the month › Orders › "Recost the month from the Product List" runs as its owner (2026-10-21 — the user:
-- "i want start from october dy, help me recost together"; the click could not finish October).
-- ============================================================================
--
-- On production the button answered a 500 for Fair · October (1,282 lines on 275 bills; the page showed a minified
-- React error, the database "canceling statement due to statement timeout"), and nothing was written: the transaction
-- rolled back. recost_sales_order_lines ran as the caller (SECURITY INVOKER) and prices a month line by line —
-- catalogue_line_option_charge twice, catalogue_line_cost once (the SKU looked up twice, the fabric's tier, the SKU's
-- price), then catalogue_apply_combos and catalogue_apply_sofa_charges per sofa bill. Each call is a query of its own,
-- and under the caller's row policies every one asks the permission helpers again: erp_products alone asks four
-- (has_perm, has_scope twice, may_read), catalogue_skus and erp_fabrics four more. Measured on production as the
-- Principal, in rolled-back transactions:
--
--   catalogue_line_option_charge × 1,282   10.0 s     as the owner 0.27 s
--   catalogue_line_cost          × 1,282   28.2 s     as the owner 0.60 s
--   catalogue_apply_combos       × 41       1.7 s
--   catalogue_apply_sofa_charges × 41       1.8 s
--   the whole recost                       55.7 s     as the owner 1.54 s
--
-- The `authenticated` role's statement_timeout is 8 s, so a month past a couple of hundred lines could not be
-- recosted from the page — exactly the months a price keyed on the Product List has to reach.
--
-- The same costing, as the function's owner: SECURITY DEFINER, asking its caller first what the app's gate in front of
-- it asks (requireActionOn('/revenue/[sub]/[period]/orders', 'revenue', 'edit')): Revenue · Edit, and the page's box
-- (tab_write_guard). Nobody gains a write: the row policies it ran under let a caller change sales_order_lines with
-- the HR or admin scope AND may_write('sales_order_lines', 'UPDATE') (Revenue · Create / Edit / Manage); on
-- production on 2026-10-21 the 7 logins holding Revenue · Edit are exactly the 7 those policies let change the lines
-- (39 logins checked, none on one side only). What changes for them is that the costing reads the whole Product List
-- whoever presses — under the caller's own read policies a price they could not read costed its line as unpriced.
--
-- Production's body (md5 f12258b5…, the copy in 20261006050000) with ONE statement swapped (pg_temp.swap_check): the
-- caller's check goes in front of the paid-month check; what landed is checked at the end (md5 9a9f5cf1…, running as
-- its owner, closed to anon). EXECUTE leaves
-- PUBLIC and anon, which it held while it ran as the caller. Running it twice changes nothing.
-- PGlite: tests/member-sql/validate-recost-runs-as-owner.mjs.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.swap_check(p_sig regprocedure, p_old text, p_new text)
RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_src   text := (SELECT prosrc FROM pg_proc WHERE oid = p_sig);
  v_pat   text;
  v_found text;
  v_n     integer;
BEGIN
  IF strpos(v_src, p_new) > 0 THEN
    RETURN;  -- already swapped
  END IF;
  -- The old statement, every run of whitespace matching any run.
  v_pat := regexp_replace(regexp_replace(p_old, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'), '\s+', '\\s+', 'g');
  SELECT count(*) INTO v_n FROM regexp_matches(v_src, v_pat, 'g');
  IF v_n <> 1 THEN
    RAISE EXCEPTION '%: its statement is there % times, not once — production changed since this migration was written', p_sig, v_n;
  END IF;
  v_found := (regexp_match(v_src, '(' || v_pat || ')'))[1];
  EXECUTE replace(pg_get_functiondef(p_sig), v_found, p_new);
END
$fn$;

-- Each statement starts at its first word: a leading run of space would match the line break before it too.

-- ── The caller is asked first, as the page's gate asks ─────────────────────

SELECT pg_temp.swap_check('public.recost_sales_order_lines(uuid,date)'::regprocedure,
$old$IF commission_order_period_locked(p_sub_department_id, p_period) THEN$old$,
$new$-- Runs as its owner (2026-10-21): under the caller's row policies every line's costing asked the
    -- permission helpers again, and October's 1,282 lines took 56 s, past the 8 s a request may run.
    -- So the caller is asked here, as the app's gate in front of it asks: Revenue · Edit, the page's box.
    IF NOT COALESCE(public.has_any_action(ARRAY['revenue.edit']), FALSE) THEN
        RAISE EXCEPTION 'Recosting a month needs Revenue · Edit.' USING ERRCODE = '42501';
    END IF;
    PERFORM public.tab_write_guard(ARRAY['/revenue/[sub]/[period]/orders'], ARRAY['revenue.edit']);

    IF commission_order_period_locked(p_sub_department_id, p_period) THEN$new$);

ALTER FUNCTION public.recost_sales_order_lines(uuid, date) SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.recost_sales_order_lines(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recost_sales_order_lines(uuid, date) TO authenticated;

COMMENT ON FUNCTION public.recost_sales_order_lines(uuid, date) IS
    'Re-prices one sub-department''s month from the Product List: every line (catalogue_line_cost), then every sofa build (catalogue_apply_combos). Runs as its owner, asking the caller Revenue · Edit and the Orders page''s box first (2026-10-21: as the caller, 1,282 lines took 56 s). Refuses a paid month (23RUN). Returns the lines whose cost moved, the lines still without a cost, the bills fully costed.';

-- The guard the scan reads (tab-write-guards.test.ts): the recost asks the Orders page in the database, as the app's
-- gate in front of it does. The body above carries it already; this only checks it is there.
CREATE OR REPLACE FUNCTION pg_temp.tab_guard(p_sig text, p_pages text, p_wants text[])
RETURNS void
LANGUAGE plpgsql AS $g$
DECLARE
  v_line text := format('PERFORM public.tab_write_guard(%s, ARRAY[%s]);', p_pages,
    array_to_string(ARRAY(SELECT quote_literal(w) FROM unnest(p_wants) w), ', '));
BEGIN
  IF position(v_line IN (SELECT prosrc FROM pg_proc WHERE oid = p_sig::regprocedure)) = 0 THEN
    RAISE EXCEPTION '% does not ask its page: % is not in its body', p_sig, v_line;
  END IF;
END
$g$;

SELECT pg_temp.tab_guard('public.recost_sales_order_lines(uuid, date)',
  $$ARRAY['/revenue/[sub]/[period]/orders']$$, ARRAY['revenue.edit']);

-- ── What landed is what this file says ─────────────────────────────────────

DO $$
DECLARE
    v_md5     TEXT;
    v_definer BOOLEAN;
BEGIN
    SELECT md5(replace(prosrc, E'\r', '')), prosecdef INTO v_md5, v_definer
      FROM pg_proc WHERE oid = 'public.recost_sales_order_lines(uuid,date)'::regprocedure;
    IF v_md5 IS DISTINCT FROM '9a9f5cf1a8f6e476c603f67b60b23621' THEN
        RAISE EXCEPTION 'recost_sales_order_lines landed as md5 %, not this file''s body', v_md5;
    END IF;
    IF NOT v_definer THEN
        RAISE EXCEPTION 'recost_sales_order_lines does not run as its owner';
    END IF;
    IF has_function_privilege('anon', 'public.recost_sales_order_lines(uuid,date)', 'EXECUTE') THEN
        RAISE EXCEPTION 'recost_sales_order_lines is still open to anon';
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
