-- ============================================================================
-- 20261114123500_booth_names_the_bill.sql
-- A bill is the brand of the booth it was opened at (2026-11-14).
-- ============================================================================
--
-- The user, with the brands' own cost ratios (20261114121700): "其实在 Houzs erp open sales order的时候，那边是能够选择它开的
-- 账单是什么 brand。说白了，你应该是可以 capture 得到每一张销售单都是在什么 brand 的 booth 开单的，所以你就可以跟着那个 brand 的
-- margin 去计算". Asked about a bill opened at one brand's booth that sells another's goods — HC-SO-2609-190, an Akemi
-- mattress at the ZANOTTI booth, an Akemi bill until now because the ERP's Branding is worked out from the products —
-- whether the booth should decide its ratio alone, everything, or nothing: "全跟 booth" — the ratio, the margin ladder,
-- and the brand Comm Cal and the Revenue app show.
--
-- erp_sync_order_brand, in order: another ERP company's order is that company's brand (2990s, 20261112003700) → THE
-- BOOTH the bill was opened at (the ERP's fair pick, `fair.brand`, not a cancelled one) → the ERP's Branding → the
-- salesperson's pick (`vpBrand`) → the portal's pick (`sales_order_brand_picks`) → (its callers) the lines. Until now the
-- booth came after the Branding and both picks: it named a bill only when nothing else did. A booth whose word names no
-- brand (a fair keyed after it closed, a hall of several booths — the ERP sends no brand then) changes nothing.
--
-- The bills it moves: every one whose booth names a brand other than the one it carries, restamped as the feed would
-- stamp it now (sales_order_restamp_brand: the bill, and each of its lines that names no brand of its own — a line keeps
-- its product's brand). On 2026-11-14 that was eight of Fair's bills, each from its products' brand to its booth's:
-- six live — HC-SO-2609-190, -263 (Akemi's goods at Zanotti's booth), -269 (Zanotti's at Akemi's), -305 (Dunlopillo's at
-- Zanotti's), -308 (Zanotti's at Dunlopillo's), HC-SO-2611-013 (Dunlopillo's at Akemi's) — and two cancelled
-- (HC-SO-2609-303, HC-SO-2610-407); thirteen of their lines that name no brand followed. No month was locked.
--
-- Made from PRODUCTION's body (2026-11-14 KL, pg_get_functiondef, md5 of prosrc — tests/member-sql/
-- booth-names-the-bill-production.sql), refused if it has changed since; a second run changes nothing.
--
--   erp_sync_order_brand(jsonb, uuid)      c1c371268abf92b9cbe27824bc080057       → dfee8025b6a9616d3ae30bed7e61ac6b
--
-- PGlite: tests/member-sql/validate-booth-names-the-bill.mjs (production's bodies, md5-checked; the migration verbatim,
-- twice).

BEGIN;

DO $$
DECLARE
  v_md5 text;
BEGIN
  IF to_regprocedure('public.erp_sync_order_brand(jsonb, uuid)') IS NULL THEN
    RAISE EXCEPTION 'erp_sync_order_brand(jsonb, uuid) is not on this database';
  END IF;
  SELECT md5(replace(prosrc, E'\r', '')) INTO v_md5 FROM pg_proc WHERE oid = 'public.erp_sync_order_brand(jsonb, uuid)'::regprocedure;
  IF v_md5 IS DISTINCT FROM 'c1c371268abf92b9cbe27824bc080057' AND v_md5 IS DISTINCT FROM 'dfee8025b6a9616d3ae30bed7e61ac6b' THEN
    RAISE EXCEPTION 'erp_sync_order_brand is md5 %, not the body this migration was written from', v_md5;
  END IF;
END $$;

-- The old text, every run of whitespace matching any run, replaced by the new — found exactly once, or refused
-- (20261031210000's).
CREATE OR REPLACE FUNCTION pg_temp.swap_text(p_src text, p_old text, p_new text)
RETURNS text
LANGUAGE plpgsql AS $fn$
DECLARE
  v_pat   text := regexp_replace(regexp_replace(p_old, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'), '\s+', '\\s+', 'g');
  v_n     integer;
  v_found text;
BEGIN
  SELECT count(*) INTO v_n FROM regexp_matches(p_src, v_pat, 'g');
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'A statement this migration swaps is there % times, not once — production changed since it was written: %', v_n, left(p_old, 80);
  END IF;
  v_found := (regexp_match(p_src, '(' || v_pat || ')'))[1];
  RETURN replace(p_src, v_found, p_new);
END
$fn$;

-- The booth first: the four answers after the company's, its own moved ahead of the other three.
DO $$
DECLARE
  v_def text;
BEGIN
  IF (SELECT md5(replace(prosrc, E'\r', '')) FROM pg_proc WHERE oid = 'public.erp_sync_order_brand(jsonb, uuid)'::regprocedure)
     = 'dfee8025b6a9616d3ae30bed7e61ac6b' THEN
    RETURN;  -- made already
  END IF;
  v_def := pg_temp.swap_text(pg_get_functiondef('public.erp_sync_order_brand(jsonb, uuid)'::regprocedure),
$o$erp_sync_brand_code(p_order->>'brand'),
        erp_sync_brand_code(p_order->>'brandPick'),
        (SELECT p.brand_code FROM sales_order_brand_picks p WHERE p.order_id = p_order_id),
        CASE WHEN LOWER(COALESCE(p_order->'fair'->>'status', '')) <> 'cancelled'
             THEN erp_sync_brand_code(p_order->'fair'->>'brand') END);$o$,
$n$-- (20261114123500) The booth the bill was opened at — the ERP's fair pick, not a cancelled one — ahead of the
        -- products' Branding and both picks (the user: "全跟 booth").
        CASE WHEN LOWER(COALESCE(p_order->'fair'->>'status', '')) <> 'cancelled'
             THEN erp_sync_brand_code(p_order->'fair'->>'brand') END,
        erp_sync_brand_code(p_order->>'brand'),
        erp_sync_brand_code(p_order->>'brandPick'),
        (SELECT p.brand_code FROM sales_order_brand_picks p WHERE p.order_id = p_order_id));$n$);
  EXECUTE v_def;
END $$;

-- Every bill whose booth names another brand, restamped as the feed stamps it now. A second run finds none.
DO $$
DECLARE
  r   record;
  v_n integer := 0;
BEGIN
  FOR r IN
    SELECT o.id
      FROM sales_orders o
     WHERE o.source = 'erp_sync'
       AND LOWER(COALESCE(o.raw->'fair'->>'status', '')) <> 'cancelled'
       AND erp_sync_brand_code(o.raw->'fair'->>'brand') IS NOT NULL
       AND o.brand_code IS DISTINCT FROM erp_sync_brand_code(o.raw->'fair'->>'brand')
     ORDER BY o.id
  LOOP
    PERFORM sales_order_restamp_brand(r.id);
    v_n := v_n + 1;
  END LOOP;
  RAISE NOTICE 'booth names the bill: % bills restamped', v_n;
END $$;

DO $$
DECLARE
  v_md5 text;
BEGIN
  SELECT md5(replace(prosrc, E'\r', '')) INTO v_md5 FROM pg_proc WHERE oid = 'public.erp_sync_order_brand(jsonb, uuid)'::regprocedure;
  IF v_md5 IS DISTINCT FROM 'dfee8025b6a9616d3ae30bed7e61ac6b' THEN
    RAISE EXCEPTION 'Not the body this migration makes: erp_sync_order_brand ended as md5 %', v_md5;
  END IF;
END $$;

COMMENT ON FUNCTION public.erp_sync_order_brand(jsonb, uuid) IS
    'A bill''s brand from its ERP delivery (2026-11-14): another ERP company''s order is that company''s brand; else the brand of the booth it was opened at (fair.brand, not a cancelled booth); else the ERP''s Branding; else the salesperson''s pick (vpBrand); else the portal''s pick. NULL — the caller reads the lines.';

COMMIT;

-- Rollback, in words: put erp_sync_order_brand back as production had it (md5 c1c37126… — tests/member-sql/
-- booth-names-the-bill-production.sql holds it), then restamp the same bills (sales_order_restamp_brand) — each goes back
-- to its products' brand.
