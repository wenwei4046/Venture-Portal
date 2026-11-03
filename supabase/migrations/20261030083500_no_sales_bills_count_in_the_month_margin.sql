-- ============================================================================
-- 20261030083500_no_sales_bills_count_in_the_month_margin.sql
-- A bill with no sales counts against the month's margin (2026-10-30).
-- ============================================================================
--
-- The user, shown that nine of October's Fair bills read "No cost · Cost pending" in the Revenue app though every one
-- of their costs was known — a pillow, a bed frame, a protector given on a bill of its own at RM 0 (HC-SO-2610-034,
-- -095, -096 …): "show, no sales. but consider margin negative as well. make sure in the calculation of monthly".
--
-- Such a bill has no margin of its own — nothing to divide by — so member_order_facts gave it none, and every month's
-- margin left it out: its cost never counted, while a free pillow on a paid bill counts against that bill's margin.
-- Now its cost counts against the month, as a sale at a margin below nothing would; its own margin stays none, and
-- the app calls it "No sales".
--
--   member_order_facts        one more column, no_sales_cost: for a bill whose margin base (its main sales less its
--                             KPI items and option charges) is RM 0 or less, what its goods cost on the Revenue Team
--                             basis — the holder's part of it — once every goods line is costed; NULL for a bill that
--                             sells, and for one whose goods still wait for a cost. Its return type changes, so it is
--                             made again from production's body (md5 100ac1c8…), four statements swapped; its grant and
--                             comment as before.
--   member_scoreboard         the month's margin cost takes such a bill in, and its revenue none of it — never less
--   member_scoreboard_range   than nothing, where its KPI items and charges took more than it sold; a gift that costs
--                             nothing is no part of the margin; "cost pending" counts every bill still waiting for a
--                             cost, one with no sales too (one statement each).
--   member_arena_for_staff    the same, per person and per brand (two statements). A brand given away and never sold
--                             has a cost and no margin revenue: the app reads it as below every tier (lib/member/arena.ts).
--   member_order_book_for_staff             each bill says `noSales`, and the book carries `margins` — the margin of
--   member_principal_department_order_book  its counted bills, overall, per brand and per month (Today cuts one month
--                                           out of a two-month book), as percentages: the app reads them instead of
--                                           adding the bills' margins up itself, since a bill with no sales has none
--                                           to add; no cost leaves the server (two and three statements).
--
-- Only a bill with goods: a bill of transport alone is still none of the margin's business. Nothing moves pay: Fair
-- and IR pay no margin incentive or penalty (both off). On production (2026-10-30): 9 of October's 361 Fair bills,
-- 2 of July's; none in August or September.
-- Comm Cal's engine does the same (lib/commission/engine.ts, `noSalesCost` and the month's brand tallies).
--
-- PGlite: tests/member-sql/validate-no-sales-margin.mjs (production's six bodies, md5-checked; the migration verbatim,
-- twice).

BEGIN;

-- Production's bodies, or this migration's own once it has run.
DO $$
DECLARE
  r record;
  v_md5 text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('public.member_order_facts(uuid, date, date)', '100ac1c83635cbf163069dff6e52e26b', '137eb24ba94e9c5bb49789225ff4c271'),
      ('public.member_scoreboard(uuid, date)', '80bc6819f6f93eae002d4cf1b06f3808', '86c5cf201f42a5ac0ec3a13910c2b17d'),
      ('public.member_scoreboard_range(uuid, date, date)', 'f8d61d1177ab8982ecd2fe7770dec580', '8a3ad7360a1a875436d84201aedbe114'),
      ('public.member_arena_for_staff(uuid, uuid, uuid, text, text, boolean)', '4211a03044b601342c1be49ece19e8bd', '051de9ea5b73791a8ee5b0edd556fe94'),
      ('public.member_order_book_for_staff(uuid, uuid, date, date)', 'ef349e49b1c5a003f8831b0e9aa7cde5', 'ece458d6f851856de44959f14fe88840'),
      ('public.member_principal_department_order_book(uuid, text, text)', '70f0a8f669bff28250ecb6fa2577772d', '5d14f2b5eb1d10cc763429ab6431a44f')
    ) AS t(sig, before_md5, after_md5)
  LOOP
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_md5 FROM pg_proc WHERE oid = r.sig::regprocedure;
    IF v_md5 NOT IN (r.before_md5, r.after_md5) THEN
      RAISE EXCEPTION '% is md5 %, not the body this migration was written from', r.sig, v_md5;
    END IF;
  END LOOP;
END $$;

-- The old text, every run of whitespace matching any run, replaced by the new — found exactly once, or refused.
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

CREATE OR REPLACE FUNCTION pg_temp.swap_check(p_sig regprocedure, p_old text, p_new text)
RETURNS void
LANGUAGE plpgsql AS $fn$
BEGIN
  IF strpos((SELECT prosrc FROM pg_proc WHERE oid = p_sig), p_new) > 0 THEN
    RETURN;  -- already swapped
  END IF;
  EXECUTE pg_temp.swap_text(pg_get_functiondef(p_sig), p_old, p_new);
END
$fn$;

-- ── member_order_facts: what a bill with no sales costs ─────────────────────
DO $$
DECLARE
  v_sig regprocedure := 'public.member_order_facts(uuid, date, date)'::regprocedure;
  v_def text;
BEGIN
  IF pg_get_function_result(v_sig) LIKE '%no_sales_cost%' THEN
    RETURN;  -- made already
  END IF;
  v_def := pg_get_functiondef(v_sig);
  v_def := pg_temp.swap_text(v_def,
    'kpi_qty numeric, manual boolean)',
    'kpi_qty numeric, manual boolean, no_sales_cost numeric)');
  v_def := pg_temp.swap_text(v_def,
    'b.goods-coalesce(k.amount,0)-b.charges AS margin_base',
    'b.goods-coalesce(k.amount,0)-b.charges AS margin_base,
   CASE WHEN b.goods-coalesce(k.amount,0)-b.charges<=0 AND coalesce(b.costed,true) THEN coalesce(b.team_cost,0) END AS no_sales_cost');
  v_def := pg_temp.swap_text(v_def,
    'sum(s.kpi_qty*x.part) AS kpi_qty',
    'sum(s.kpi_qty*x.part) AS kpi_qty,sum(round(s.no_sales_cost*x.part,2)) AS no_sales_cost');
  v_def := pg_temp.swap_text(v_def,
    's.manual_margin_pct IS NOT NULL
 FROM split s JOIN parts x',
    's.manual_margin_pct IS NOT NULL,
  CASE WHEN x.owner THEN s.no_sales_cost-coalesce(g.no_sales_cost,0) ELSE round(s.no_sales_cost*x.part,2) END
 FROM split s JOIN parts x');
  EXECUTE 'DROP FUNCTION public.member_order_facts(uuid, date, date)';
  EXECUTE v_def;
END $$;

COMMENT ON FUNCTION public.member_order_facts(uuid, date, date) IS
  'One private document-facts calculation for Insight, Arena and recent Income orders. Margin is the REVENUE TEAM margin - cost divided by comm_schemes.revenue_cost_divisor, the same basis the engine pays on - because the company''s own margin is not the salesperson''s to see. A bill of a month before the portal pays (comm_cutovers) is recognised in its own month as settled. Authorization stays in the public/member entry points. no_sales_cost (2026-10-30): a bill with no sales of its own (margin base RM 0 or less) has no margin, but what its goods cost — the holder''s part, once every goods line is costed — counts against the month''s margin.';

REVOKE ALL ON FUNCTION public.member_order_facts(uuid, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_order_facts(uuid, date, date) TO service_role;

-- ── The month's margin, person by person ───────────────────────────────────
SELECT pg_temp.swap_check('public.member_scoreboard(uuid, date)'::regprocedure,
$old$  coalesce(sum(f.goods_revenue) FILTER(WHERE f.cleared AND f.margin_pct IS NOT NULL),0),
  coalesce(sum(f.goods_revenue*(1-f.margin_pct)) FILTER(WHERE f.cleared AND f.margin_pct IS NOT NULL),0),
  count(*) FILTER(WHERE f.cleared AND f.goods_revenue>0 AND f.margin_pct IS NULL)::integer,$old$,
$new$  coalesce(sum(greatest(f.goods_revenue,0)) FILTER(WHERE f.cleared AND (f.margin_pct IS NOT NULL OR f.no_sales_cost>0)),0),
  coalesce(sum(coalesce(f.goods_revenue*(1-f.margin_pct),f.no_sales_cost)) FILTER(WHERE f.cleared AND (f.margin_pct IS NOT NULL OR f.no_sales_cost>0)),0),
  count(*) FILTER(WHERE f.cleared AND f.margin_pct IS NULL AND f.no_sales_cost IS NULL)::integer,$new$);

SELECT pg_temp.swap_check('public.member_scoreboard_range(uuid, date, date)'::regprocedure,
$old$  coalesce(sum(f.goods_revenue) FILTER(WHERE f.cleared AND f.margin_pct IS NOT NULL),0),
  coalesce(sum(f.goods_revenue*(1-f.margin_pct)) FILTER(WHERE f.cleared AND f.margin_pct IS NOT NULL),0),
  count(*) FILTER(WHERE f.cleared AND f.goods_revenue>0 AND f.margin_pct IS NULL)::integer,$old$,
$new$  coalesce(sum(greatest(f.goods_revenue,0)) FILTER(WHERE f.cleared AND (f.margin_pct IS NOT NULL OR f.no_sales_cost>0)),0),
  coalesce(sum(coalesce(f.goods_revenue*(1-f.margin_pct),f.no_sales_cost)) FILTER(WHERE f.cleared AND (f.margin_pct IS NOT NULL OR f.no_sales_cost>0)),0),
  count(*) FILTER(WHERE f.cleared AND f.margin_pct IS NULL AND f.no_sales_cost IS NULL)::integer,$new$);

-- ── The Arena: per person and per brand ─────────────────────────────────────
SELECT pg_temp.swap_check('public.member_arena_for_staff(uuid, uuid, uuid, text, text, boolean)'::regprocedure,
$old$f.margin_pct AS margin,f.kpi_qty AS kpi,f.recognition_month AS month$old$,
$new$f.margin_pct AS margin,f.kpi_qty AS kpi,f.recognition_month AS month,f.no_sales_cost$new$);

SELECT pg_temp.swap_check('public.member_arena_for_staff(uuid, uuid, uuid, text, text, boolean)'::regprocedure,
$old$        'marginRevenue',coalesce(sum(f.goods_revenue) FILTER(WHERE f.cleared AND f.margin IS NOT NULL),0),
        'marginCost',coalesce(sum(f.goods_revenue*(1-f.margin)) FILTER(WHERE f.cleared AND f.margin IS NOT NULL),0),
        'blindOrders',count(*) FILTER(WHERE f.cleared AND f.goods_revenue>0 AND f.margin IS NULL)) AS score$old$,
$new$        'marginRevenue',coalesce(sum(greatest(f.goods_revenue,0)) FILTER(WHERE f.cleared AND (f.margin IS NOT NULL OR f.no_sales_cost>0)),0),
        'marginCost',coalesce(sum(coalesce(f.goods_revenue*(1-f.margin),f.no_sales_cost)) FILTER(WHERE f.cleared AND (f.margin IS NOT NULL OR f.no_sales_cost>0)),0),
        'blindOrders',count(*) FILTER(WHERE f.cleared AND f.margin IS NULL AND f.no_sales_cost IS NULL)) AS score$new$);

-- ── A member's bills: which have no sales, and the margin they make together ──
SELECT pg_temp.swap_check('public.member_order_book_for_staff(uuid, uuid, date, date)'::regprocedure,
$old$'margin',CASE WHEN f.margin_pct IS NULL THEN NULL ELSE round(f.margin_pct*100,2) END,$old$,
$new$'margin',CASE WHEN f.margin_pct IS NULL THEN NULL ELSE round(f.margin_pct*100,2) END,
    'noSales',f.margin_pct IS NULL AND f.no_sales_cost IS NOT NULL,$new$);

SELECT pg_temp.swap_check('public.member_order_book_for_staff(uuid, uuid, date, date)'::regprocedure,
$old$'orders',coalesce((SELECT jsonb_agg(jsonb_build_object($old$,
$new$'margins',(WITH mb AS (
     SELECT to_char(f.recognition_month,'YYYY-MM') AS month,f.brand,sum(greatest(f.goods_revenue,0)) AS rev,
      sum(coalesce(f.goods_revenue*(1-f.margin_pct),f.no_sales_cost)) AS cost
     FROM facts f WHERE f.cleared AND (f.margin_pct IS NOT NULL OR f.no_sales_cost>0) GROUP BY 1,2)
   SELECT jsonb_build_object(
    'overall',(SELECT CASE WHEN sum(m.rev)>0 THEN round((sum(m.rev)-sum(m.cost))/sum(m.rev)*100,4) END FROM mb m),
    'brands',coalesce((SELECT jsonb_object_agg(x.brand,CASE WHEN x.rev>0 THEN round((x.rev-x.cost)/x.rev*100,4) END)
      FROM (SELECT m.brand,sum(m.rev) AS rev,sum(m.cost) AS cost FROM mb m GROUP BY m.brand) x),'{}'::jsonb),
    'months',coalesce((SELECT jsonb_object_agg(y.month,jsonb_build_object(
      'overall',CASE WHEN y.rev>0 THEN round((y.rev-y.cost)/y.rev*100,4) END,
      'brands',(SELECT jsonb_object_agg(z.brand,CASE WHEN z.rev>0 THEN round((z.rev-z.cost)/z.rev*100,4) END) FROM mb z WHERE z.month=y.month)))
      FROM (SELECT m.month,sum(m.rev) AS rev,sum(m.cost) AS cost FROM mb m GROUP BY m.month) y),'{}'::jsonb))),
  'orders',coalesce((SELECT jsonb_agg(jsonb_build_object($new$);

-- ── The Principal's whole sub-department: every bill once ──────────────────
SELECT pg_temp.swap_check('public.member_principal_department_order_book(uuid, text, text)'::regprocedure,
$old$sum(f.revenue) AS revenue,min(f.margin_pct) AS margin_pct,sum(f.kpi_qty) AS kpi_qty,bool_or(f.manual) AS manual$old$,
$new$sum(f.revenue) AS revenue,min(f.margin_pct) AS margin_pct,sum(f.kpi_qty) AS kpi_qty,bool_or(f.manual) AS manual,
   sum(f.goods_revenue) AS goods_revenue,sum(f.no_sales_cost) AS no_sales_cost$new$);

SELECT pg_temp.swap_check('public.member_principal_department_order_book(uuid, text, text)'::regprocedure,
$old$'margin',CASE WHEN f.margin_pct IS NULL THEN NULL ELSE round(f.margin_pct*100,2) END,$old$,
$new$'margin',CASE WHEN f.margin_pct IS NULL THEN NULL ELSE round(f.margin_pct*100,2) END,
    'noSales',f.margin_pct IS NULL AND f.no_sales_cost IS NOT NULL,$new$);

SELECT pg_temp.swap_check('public.member_principal_department_order_book(uuid, text, text)'::regprocedure,
$old$'orders',coalesce((SELECT jsonb_agg(jsonb_build_object($old$,
$new$'margins',(WITH mb AS (
     SELECT to_char(f.recognition_month,'YYYY-MM') AS month,f.brand,sum(greatest(f.goods_revenue,0)) AS rev,
      sum(coalesce(f.goods_revenue*(1-f.margin_pct),f.no_sales_cost)) AS cost
     FROM facts f WHERE f.cleared AND (f.margin_pct IS NOT NULL OR f.no_sales_cost>0) GROUP BY 1,2)
   SELECT jsonb_build_object(
    'overall',(SELECT CASE WHEN sum(m.rev)>0 THEN round((sum(m.rev)-sum(m.cost))/sum(m.rev)*100,4) END FROM mb m),
    'brands',coalesce((SELECT jsonb_object_agg(x.brand,CASE WHEN x.rev>0 THEN round((x.rev-x.cost)/x.rev*100,4) END)
      FROM (SELECT m.brand,sum(m.rev) AS rev,sum(m.cost) AS cost FROM mb m GROUP BY m.brand) x),'{}'::jsonb),
    'months',coalesce((SELECT jsonb_object_agg(y.month,jsonb_build_object(
      'overall',CASE WHEN y.rev>0 THEN round((y.rev-y.cost)/y.rev*100,4) END,
      'brands',(SELECT jsonb_object_agg(z.brand,CASE WHEN z.rev>0 THEN round((z.rev-z.cost)/z.rev*100,4) END) FROM mb z WHERE z.month=y.month)))
      FROM (SELECT m.month,sum(m.rev) AS rev,sum(m.cost) AS cost FROM mb m GROUP BY m.month) y),'{}'::jsonb))),
  'orders',coalesce((SELECT jsonb_agg(jsonb_build_object($new$);

-- The bodies production runs after this migration — every one that is not, named at once.
DO $$
DECLARE
  r record;
  v_md5 text;
  v_bad text := '';
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('public.member_order_facts(uuid, date, date)', '137eb24ba94e9c5bb49789225ff4c271'),
      ('public.member_scoreboard(uuid, date)', '86c5cf201f42a5ac0ec3a13910c2b17d'),
      ('public.member_scoreboard_range(uuid, date, date)', '8a3ad7360a1a875436d84201aedbe114'),
      ('public.member_arena_for_staff(uuid, uuid, uuid, text, text, boolean)', '051de9ea5b73791a8ee5b0edd556fe94'),
      ('public.member_order_book_for_staff(uuid, uuid, date, date)', 'ece458d6f851856de44959f14fe88840'),
      ('public.member_principal_department_order_book(uuid, text, text)', '5d14f2b5eb1d10cc763429ab6431a44f')
    ) AS t(sig, after_md5)
  LOOP
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_md5 FROM pg_proc WHERE oid = r.sig::regprocedure;
    IF v_md5 <> r.after_md5 THEN
      v_bad := v_bad || format(' %s came out md5 %s, not %s;', r.sig, v_md5, r.after_md5);
    END IF;
  END LOOP;
  IF v_bad <> '' THEN
    RAISE EXCEPTION 'Not the bodies this migration makes:%', v_bad;
  END IF;
END $$;

COMMIT;
