-- ============================================================================
-- 20261112210000_brand_kpi_member.sql
-- 2990s' own KPI items in the Revenue app (2026-11-12).
-- ============================================================================
--
-- 20261112200000 gave a brand on its own commission scheme KPI items of its own — 2990s' Upgrade fabric and Upgrade
-- latex seat — and the run pays them whatever the sub-department's own KPI switch says (the user: "2990s 独立照发").
-- The Revenue app still asked for no KPI item while that switch is off (Fair's is): Today's KPI tile, Insight's KPI
-- card and page, a bill's KPI count and the Arena's KPI board read *Not counted*, and a member's sales kept the
-- upgrade's money the run takes off. The user, 2026-11-12, of a 2990s bill: "他唯一不会出现的，只是所谓的 margin
-- arena，但他会出现到 sales arena、brand arena，同时还有 KPI item 的 arena"; and of the switch: in a month Fair's is off
-- the KPI arena ranks 2990s' items alone.
--
-- Now, while a brand on its own scheme has KPI items of its own:
--   1. The facts (member_order_facts_with_old_bills) and both order books ask the hits. comm_kpi_hits reads the
--      sub-department's switch itself since 20261112200000, so with the switch off it answers a brand's own items on
--      that brand's bills and nothing else: such a bill counts its units (kpi_qty — Today, Insight, the scoreboards, My
--      team, the Arena's KPI board) and its sales leave out what the bill charged for the upgrade, as Comm Cal's
--      Commissionable and the run do (2990-SO-2611-022: RM 2,990 of RM 3,240). No other bill moves.
--   2. The member's KPI summary (member_kpi_for_staff — the member's own, the Principal's and a leader's reads all end
--      in it) is ON: it lists the brand's own items, each with its brand, beside the sub-department's own while that
--      switch is on. The threshold is the sub-department's ladder and is read against the sub-department's own units
--      alone (`ladderTotal` — a brand's units are no part of that ladder, as in the run): none while the switch is off.
--   3. The whole sub-department's reading (member_principal_department_insight — the Principal viewing nobody, a
--      Revenue Director) says KPI counts while a brand's item is in force on the window's last day; its threshold is
--      still the sub-department's, asked while its switch is on.
--
-- Four functions have one statement swapped and one is written whole, each from PRODUCTION's body (2026-11-12, md5 of
-- prosrc; member_kpi_for_staff as 20261112200000 left it) and refused if production's body has changed since. No
-- signature changes, so every grant stays.
--
-- Rollback, in words: put the four statements back to the switch alone and re-apply the body 20261112200000 left for
-- member_kpi_for_staff — or end the brand's items (effective_to): a brand with no item finds none.
--
-- PGlite: tests/member-sql/validate-brand-kpi-member.mjs (production's bodies, md5-checked; the migration verbatim,
-- twice).

BEGIN;

CREATE TEMP TABLE brand_kpi_member_fns (proc text PRIMARY KEY, written_from text NOT NULL, makes text NOT NULL) ON COMMIT DROP;
INSERT INTO brand_kpi_member_fns VALUES
  ('public.member_order_facts_with_old_bills(uuid, date, date)',     'c839f5c6887b77dda97f86898e6f1da3', 'f99143e964e5c299515a24ab5063a6d3'),
  ('public.member_order_book_for_staff(uuid, uuid, date, date)',     '3a4b29f5ca1f1b674536cc4d606e9993', 'b9c724715bb62031799818b77cdbeead'),
  ('public.member_principal_department_order_book(uuid, text, text)', '59e5b8cc4abd4586fc02387ccf1d4d9c', '4dcf0bbe8a627107fa54c81fe866710e'),
  ('public.member_principal_department_insight(uuid, text, text)',   '6cc446a75ff9a772c3c2c332db7f16da', 'a5ef71b6965f42a12cead545ca76132f'),
  ('public.member_kpi_for_staff(uuid, uuid, date)',                  '2c34201f1ed847022e3bc6b306b574f1', '768efaf49b751da6731d3da1c38a7e93');

-- A brand's own items are 20261112200000's.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'comm_kpi_items' AND column_name = 'brand_id') THEN
    RAISE EXCEPTION 'comm_kpi_items.brand_id is not here: apply 20261112200000_brand_kpi_items first';
  END IF;
END $$;

-- Each is production's body, or this migration's own once it has run — else nothing is touched.
DO $$
DECLARE
  v_fn  record;
  v_md5 text;
BEGIN
  FOR v_fn IN SELECT * FROM brand_kpi_member_fns ORDER BY proc LOOP
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_md5 FROM pg_proc WHERE oid = to_regprocedure(v_fn.proc);
    IF v_md5 IS NULL THEN
      RAISE EXCEPTION '% is not on this database', v_fn.proc;
    END IF;
    IF v_md5 IS DISTINCT FROM v_fn.written_from AND v_md5 IS DISTINCT FROM v_fn.makes THEN
      RAISE EXCEPTION '% is md5 %, not the body this migration was written from', v_fn.proc, v_md5;
    END IF;
  END LOOP;
END $$;

-- ── 1. The gates: asked while the switch is on, or a brand has KPI items of its own ──────────────────────────────────
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

-- A function made again from the body the database holds, its statements swapped in pairs (old, new) — unless it is
-- this migration's own body already.
CREATE OR REPLACE FUNCTION pg_temp.remake(p_proc text, p_swaps text[])
RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_oid   regprocedure := to_regprocedure(p_proc);
  v_makes text;
  v_def   text;
  i       integer;
BEGIN
  SELECT makes INTO STRICT v_makes FROM brand_kpi_member_fns WHERE proc = p_proc;
  IF (SELECT md5(replace(prosrc, E'\r', '')) FROM pg_proc WHERE oid = v_oid) = v_makes THEN
    RETURN;  -- made already
  END IF;
  v_def := pg_get_functiondef(v_oid);
  FOR i IN 1 .. array_length(p_swaps, 1) / 2 LOOP
    v_def := pg_temp.swap_text(v_def, p_swaps[2 * i - 1], p_swaps[2 * i]);
  END LOOP;
  EXECUTE v_def;
END
$fn$;

-- The facts: every board, Today, Insight and the Arena read a bill's sales and its KPI units here.
SELECT pg_temp.remake('public.member_order_facts_with_old_bills(uuid, date, date)', ARRAY[
    $o$CROSS JOIN LATERAL (SELECT DISTINCT w.recognition FROM windowed w WHERE c.enable_kpi) m$o$,
    $n$-- (20261112210000) … or a brand on its own scheme has KPI items of its own: counted whatever the switch says
  -- (comm_kpi_hits reads the switch for the sub-department's own).
  CROSS JOIN LATERAL (SELECT DISTINCT w.recognition FROM windowed w WHERE c.enable_kpi
    OR EXISTS(SELECT 1 FROM public.comm_kpi_items bk WHERE bk.scheme_id=c.id AND bk.brand_id IS NOT NULL)) m$n$
]);

-- A member's bills, line by line.
SELECT pg_temp.remake('public.member_order_book_for_staff(uuid, uuid, date, date)', ARRAY[
    $o$CROSS JOIN LATERAL (SELECT DISTINCT f.recognition_month FROM facts f WHERE c.enable_kpi) m$o$,
    $n$-- (20261112210000) … or a brand on its own scheme has KPI items of its own.
  CROSS JOIN LATERAL (SELECT DISTINCT f.recognition_month FROM facts f WHERE c.enable_kpi
    OR EXISTS(SELECT 1 FROM public.comm_kpi_items bk WHERE bk.scheme_id=c.id AND bk.brand_id IS NOT NULL)) m$n$
]);

-- The whole sub-department's bills (the Principal viewing nobody, a Revenue Director).
SELECT pg_temp.remake('public.member_principal_department_order_book(uuid, text, text)', ARRAY[
    $o$CROSS JOIN LATERAL (SELECT DISTINCT f.recognition_month FROM facts f WHERE c.enable_kpi) m$o$,
    $n$-- (20261112210000) … or a brand on its own scheme has KPI items of its own.
  CROSS JOIN LATERAL (SELECT DISTINCT f.recognition_month FROM facts f WHERE c.enable_kpi
    OR EXISTS(SELECT 1 FROM public.comm_kpi_items bk WHERE bk.scheme_id=c.id AND bk.brand_id IS NOT NULL)) m$n$
]);

-- The whole sub-department's reading: whether KPI counts. Its threshold stays the sub-department's own ladder's.
SELECT pg_temp.remake('public.member_principal_department_insight(uuid, text, text)', ARRAY[
    $o$'kpi',(SELECT jsonb_build_object('enabled',coalesce(c.enable_kpi,false),$o$,
    $n$-- (20261112210000) … or a brand on its own scheme has KPI items of its own in force that day.
  'kpi',(SELECT jsonb_build_object('enabled',coalesce(c.enable_kpi,false)
     OR EXISTS(SELECT 1 FROM public.comm_kpi_items bk
       JOIN public.comm_brands bb ON bb.id=bk.brand_id AND bb.scheme_id=bk.scheme_id
       WHERE bk.scheme_id=c.id AND bb.own_scheme AND bb.is_active
        AND bk.effective_from<=(upper(v_range)-1) AND (bk.effective_to IS NULL OR bk.effective_to>=(upper(v_range)-1))),$n$
]);

-- ── 2. The member's KPI summary ──────────────────────────────────────────────────────────────────────────────────────
-- Production's body as 20261112200000 left it (md5 2c34201f…), with: a brand's own items counted whatever the switch
-- says (v_brand); the summary off only when neither counts; the threshold the sub-department's ladder's, asked while
-- its switch is on and read against the sub-department's own units (ladderTotal); each brand's item named with its
-- brand, after the sub-department's own.
DO $$
BEGIN
  IF (SELECT md5(replace(prosrc, E'\r', '')) FROM pg_proc
       WHERE oid = to_regprocedure('public.member_kpi_for_staff(uuid, uuid, date)'))
     = (SELECT makes FROM brand_kpi_member_fns WHERE proc = 'public.member_kpi_for_staff(uuid, uuid, date)') THEN
    RETURN;  -- made already
  END IF;
  EXECUTE $def$
CREATE OR REPLACE FUNCTION public.member_kpi_for_staff(p_staff uuid, p_scheme uuid, p_period date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
 v_staff uuid:=p_staff;
 v_today date:=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
 v_period date:=coalesce(date_trunc('month',p_period)::date,date_trunc('month',v_today)::date);
 v_rules_at date:=(v_period+interval '1 month - 1 day')::date;
 v_sub uuid;
 v_enabled boolean;
 v_brand boolean;
 v_threshold integer;
 v_items jsonb;
 v_total numeric;
 v_ladder numeric;
BEGIN
 SELECT c.sub_department_id,c.enable_kpi
 INTO v_sub,v_enabled
 FROM public.comm_schemes c
 JOIN public.comm_sub_departments d ON d.id=c.sub_department_id
 WHERE c.id=p_scheme AND c.is_active AND d.is_active
  AND c.effective_from<=v_today AND (c.effective_to IS NULL OR c.effective_to>=v_today)
  AND ((public.member_has_membership(v_staff,d.id)
  AND EXISTS(SELECT 1 FROM public.comm_hierarchy h WHERE h.scheme_id=c.id AND h.staff_id=v_staff
    AND h.effective_from<=v_today AND (h.effective_to IS NULL OR h.effective_to>=v_today)))
   OR public.member_director_scheme(v_staff,d.id)=c.id);
 IF v_sub IS NULL THEN
  RAISE EXCEPTION 'An active membership in this scheme is required' USING ERRCODE='42501';
 END IF;
 IF v_period>date_trunc('month',v_today)::date THEN
  RAISE EXCEPTION 'Choose a month that has started' USING ERRCODE='22023';
 END IF;

 -- (20261112210000) A brand on its own commission scheme has KPI items of its own (2990s): counted whatever the
 -- sub-department's switch says.
 v_brand:=EXISTS(SELECT 1 FROM public.comm_kpi_items k
  JOIN public.comm_brands b ON b.id=k.brand_id AND b.scheme_id=k.scheme_id
  WHERE k.scheme_id=p_scheme AND b.own_scheme AND b.is_active
   AND k.effective_from<=v_rules_at AND (k.effective_to IS NULL OR k.effective_to>=v_rules_at));

 IF NOT v_enabled AND NOT v_brand THEN
  RETURN jsonb_build_object('schemeId',p_scheme,'period',to_char(v_period,'YYYY-MM'),
   'asOf',now(),'enabled',false,'items','[]'::jsonb,'total',0,'threshold',NULL,'hit',NULL);
 END IF;

 -- The commission run selects its configuration at period end. Retain the
 -- FIRST rung even after it is reached; the old MemberKpi.target is next-unmet.
 -- (20261112210000) The ladder is the sub-department's own items': none while its switch is off.
 SELECT min(k.min_qty) INTO v_threshold FROM public.comm_kpi_thresholds k
 WHERE v_enabled AND k.scheme_id=p_scheme AND k.effective_from<=v_rules_at
  AND (k.effective_to IS NULL OR k.effective_to>=v_rules_at);

 WITH configured AS (
  -- A SKU (by its code) or a bed frame's / sofa's special (2026-09-27) — the sub-department's own while its switch
  -- is on, and (20261112210000) a brand's own on its own scheme, named with the brand. Its code says the brand too:
  -- the same special may be the sub-department's own item, and the app reads each code once.
  SELECT k.id,
   CASE WHEN b.id IS NOT NULL THEN upper(btrim(b.code))||' · '||btrim(k.option_value)
        WHEN k.source='option' THEN btrim(k.option_value) ELSE upper(btrim(k.product_code)) END AS code,
   coalesce(nullif(btrim(k.product_name),''),
    CASE WHEN k.source='option' THEN btrim(k.option_value) ELSE btrim(k.product_code) END) AS label,
   upper(btrim(b.code)) AS brand
  FROM public.comm_kpi_items k
  LEFT JOIN public.comm_brands b ON b.id=k.brand_id AND b.scheme_id=k.scheme_id AND b.own_scheme AND b.is_active
  WHERE k.scheme_id=p_scheme
   AND CASE WHEN k.brand_id IS NULL THEN v_enabled ELSE b.id IS NOT NULL END
   AND k.effective_from<=v_rules_at AND (k.effective_to IS NULL OR k.effective_to>=v_rules_at)
 ), eligible_orders AS (
  -- The month's deposit-cleared bills, recognised exactly as Insight's sales.
  SELECT f.order_id AS id FROM public.member_order_facts(p_scheme,v_period,(v_period+interval '1 month')::date) f
  WHERE f.staff_id=v_staff AND f.cleared
 ), hits AS (
  SELECT h.item_id,sum(h.qty*coalesce(pt.part,1)) AS qty
  FROM public.comm_kpi_hits(p_scheme,ARRAY(SELECT o.id FROM eligible_orders o),v_rules_at) h
  LEFT JOIN public.sales_order_parts(ARRAY(SELECT o.id FROM eligible_orders o)) pt ON pt.order_id=h.order_id AND pt.staff_id=v_staff
  GROUP BY h.item_id
 ), quantities AS (
  SELECT c.code,c.label,c.brand,coalesce(h.qty,0) AS quantity
  FROM configured c LEFT JOIN hits h ON h.item_id=c.id
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object('productCode',code,'label',label,'quantity',quantity)
    || CASE WHEN brand IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('brand',brand) END
   ORDER BY brand NULLS FIRST,label,code),'[]'::jsonb),coalesce(sum(quantity),0),
  coalesce(sum(quantity) FILTER(WHERE brand IS NULL),0)
 INTO v_items,v_total,v_ladder FROM quantities;

 RETURN jsonb_build_object('schemeId',p_scheme,'period',to_char(v_period,'YYYY-MM'),
  'asOf',now(),'enabled',true,'items',v_items,'total',v_total,'ladderTotal',v_ladder,'threshold',v_threshold,
  'hit',CASE WHEN v_threshold IS NULL THEN NULL ELSE v_ladder>=v_threshold END);
END $function$
  $def$;
END $$;

-- ── 3. What stands now is what was tested ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_fn  record;
  v_md5 text;
  v_bad text := '';
BEGIN
  FOR v_fn IN SELECT * FROM brand_kpi_member_fns ORDER BY proc LOOP
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_md5 FROM pg_proc WHERE oid = to_regprocedure(v_fn.proc);
    IF v_md5 IS DISTINCT FROM v_fn.makes THEN
      v_bad := v_bad || format(' %s ended as md5 %s;', v_fn.proc, v_md5);
    END IF;
  END LOOP;
  IF v_bad <> '' THEN
    RAISE EXCEPTION 'Not the bodies this migration makes:%', v_bad;
  END IF;
END $$;

COMMIT;
