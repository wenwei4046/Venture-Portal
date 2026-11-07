-- ============================================================================
-- 20261108011500_gwp_bodies_without_cr.sql
-- The five bodies 20261108010000 wrote, without the carriage returns they carried (2026-11-08).
-- ============================================================================
--
-- 20261108010000_gifts_with_purchase went onto production from a Windows checkout's CRLF copy (`db query -f`), so
-- the lines it wrote — catalogue_save_gwp and sales_order_gwp_free whole, the statements it swapped into
-- member_quote_cost_rules, revenue_month_orders and member_order_facts_with_old_bills — end in \r. SQL reads \r as
-- whitespace and no string literal of theirs spans a line, so each runs as written. But md5(prosrc) is not the md5
-- that migration names (it checks the body without \r), and a later migration made from the repo's LF copy would be
-- refused by its guard, or miss a swap. Found by the old bills' session (venture-portal-9c, 2026-11-08 ~01:15 KL).
--
-- Each body is made again from production's own definition with its \r taken out — nothing else. CREATE OR REPLACE
-- keeps its owner, its grants and its comment. A body without \r is left alone; one that is not 20261108010000's
-- (its md5 once \r is taken out) is refused. Checked at the end: md5(prosrc) as it stands is that migration's.
--
--   catalogue_save_gwp(uuid, jsonb)                      → 9769e1ae67c9a0516e2613d3a924c539
--   sales_order_gwp_free(uuid[])                         → 658722b990b11b99acc37995ce8dc8f3
--   member_quote_cost_rules(uuid)                        → 9973901db6f5109566723a1ed4ad2b67
--   revenue_month_orders(uuid, date)                     → 99c8386e4549d99c963b250c4538ce80
--   member_order_facts_with_old_bills(uuid, date, date)  → 6904a0dd72dcc3abe5b4463071bbe077
--
-- Applied LF: the file's \r taken out before `db query -f`, as 20261107230000 and 20261107235500 went on.
-- PGlite: tests/member-sql/validate-gifts-with-purchase.mjs (each body given \r on every line, then this migration
-- verbatim, twice; a body changed since refused).

BEGIN;

DO $$
DECLARE
  r record;
  v_src text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('public.catalogue_save_gwp(uuid, jsonb)', '9769e1ae67c9a0516e2613d3a924c539'),
      ('public.sales_order_gwp_free(uuid[])', '658722b990b11b99acc37995ce8dc8f3'),
      ('public.member_quote_cost_rules(uuid)', '9973901db6f5109566723a1ed4ad2b67'),
      ('public.revenue_month_orders(uuid, date)', '99c8386e4549d99c963b250c4538ce80'),
      ('public.member_order_facts_with_old_bills(uuid, date, date)', '6904a0dd72dcc3abe5b4463071bbe077')
    ) AS t(sig, after_md5)
  LOOP
    IF to_regprocedure(r.sig) IS NULL THEN
      RAISE EXCEPTION '% is not on this database', r.sig;
    END IF;
    SELECT prosrc INTO v_src FROM pg_proc WHERE oid = to_regprocedure(r.sig);
    IF md5(replace(v_src, E'\r', '')) IS DISTINCT FROM r.after_md5 THEN
      RAISE EXCEPTION '% is md5 % without its carriage returns: not the body 20261108010000 wrote', r.sig, md5(replace(v_src, E'\r', ''));
    END IF;
    IF position(E'\r' IN v_src) > 0 THEN
      EXECUTE replace(pg_get_functiondef(to_regprocedure(r.sig)), E'\r', '');
    END IF;
  END LOOP;
END $$;

-- What this migration left: each body 20261108010000's exactly, no \r in it — md5(prosrc) as it stands.
DO $$
DECLARE
  r record;
  v_md5 text;
  v_bad text := '';
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('public.catalogue_save_gwp(uuid, jsonb)', '9769e1ae67c9a0516e2613d3a924c539'),
      ('public.sales_order_gwp_free(uuid[])', '658722b990b11b99acc37995ce8dc8f3'),
      ('public.member_quote_cost_rules(uuid)', '9973901db6f5109566723a1ed4ad2b67'),
      ('public.revenue_month_orders(uuid, date)', '99c8386e4549d99c963b250c4538ce80'),
      ('public.member_order_facts_with_old_bills(uuid, date, date)', '6904a0dd72dcc3abe5b4463071bbe077')
    ) AS t(sig, after_md5)
  LOOP
    SELECT md5(prosrc) INTO v_md5 FROM pg_proc WHERE oid = to_regprocedure(r.sig);
    IF v_md5 IS DISTINCT FROM r.after_md5 THEN
      v_bad := v_bad || format(' %s is md5 %s;', r.sig, v_md5);
    END IF;
  END LOOP;
  IF v_bad <> '' THEN
    RAISE EXCEPTION 'Not the bodies 20261108010000 wrote, without carriage returns:%', v_bad;
  END IF;
END $$;

COMMIT;

-- Rollback, in words: nothing to put back — the bodies differ from what production had only by their \r.
