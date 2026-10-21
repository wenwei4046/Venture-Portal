-- ============================================================================
-- 20261021150000_shared_bills_in_the_revenue_app.sql
-- A shared bill counts in its holders' parts in the Revenue app too (2026-10-21 — the user, on the share request:
-- "HR 最终 approve 之后，这个 sales order 的 commission 就会拆分一半，sales amount / sales order value 也会分一半。因为这不能
-- 单单只分 commission，sales order value 也必须分一半，这会直接影响到他们的 sales target。当然，Leader 那边的排行榜全部也是同步").
-- ============================================================================
--
-- Comm Cal has paid a shared bill in parts since 2026-09-24 (`sales_order_shares`, lib/commission/shares.ts): each holder
-- is paid on their part at their own rate and it climbs their own upline. The Revenue app never read the shares — the
-- owner's Insight, Today, Arena and team boards counted the whole bill and the holder's counted nothing (comm-cal.md ›
-- SHARED BILLS: "Member Insight/Arena do not read shares yet"). Now every member read counts a shared bill the way the
-- engine splits it:
--
--   sales_order_parts(orders)   one row per holder of each bill: the owner (sales_orders.staff_id) with 1 − Σ shares, and
--                               every other holder with their share — the split splitOrdersByShares makes. Shares naming
--                               the owner, or adding up to the whole bill, are left out as the split leaves them out (the
--                               table's guard refuses both, 23SHR). A helper the functions below call, once per statement
--                               (never per row); nobody else's to call.
--   member_order_facts          a shared bill is its holders' rows: each holder's part of the sales and of the margin base,
--                               the owner the rest to the sen; its KPI items the same way. The margin and the deposit are
--                               the bill's own — ratios, the same on every part, as on Comm Cal. Every board reads these
--                               rows (member_scoreboard / _range → Insight, the team and downline boards, a director's
--                               whole sub-department; member_arena_for_staff → the Arena's Sales / Margin / KPI boards and
--                               the Championship; member_order_book_for_staff → My sales orders), so they all move together.
--   member_kpi_for_staff        a shared bill's KPI items are its holders', in their parts (Today's and Insight's KPI card).
--   member_order_book_for_staff a holder's lines' KPI in their part; and each bill says whether it is the reader's own
--                               (`own`) and, when shared, every holder's part (`share`: part, holders) — My sales orders'
--                               sheet names them.
--   member_arena_booth_history_for_staff  the Fair results' booth boards count each holder's part too. Brand weeks (where
--                               somebody worked a weekend) still read the bills each seller opened.
--   member_honours_forget_share_month    a share added, changed or taken off forgets the bill's month's kept honours, as a
--                               bill or a line changing does (the share's own trigger, AFTER each row).
--
-- Every function is changed from PRODUCTION's body, one statement swapped at a time (pg_temp.swap_check: the old statement
-- found exactly once, whitespace-insensitive, or the migration stops). Production's bodies on 2026-10-21: member_order_facts
-- md5 736faa07…, member_kpi_for_staff(uuid, uuid, date) f7ef4792…, member_order_book_for_staff 4553c366…,
-- member_arena_booth_history_for_staff 5cd3631a… — kept verbatim in tests/member-sql/share-bills-production.sql.
-- PGlite: tests/member-sql/validate-share-requests.mjs.

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

-- ── Each holder of a bill, and their part ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.sales_order_parts(p_orders uuid[])
RETURNS TABLE(order_id uuid, staff_id uuid, part numeric, owner_staff_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
 WITH o AS (
  SELECT so.id,so.staff_id FROM public.sales_orders so WHERE so.id=ANY(p_orders)
 ), held AS (
  SELECT sh.order_id,sh.staff_id,sh.share_pct FROM public.sales_order_shares sh JOIN o ON o.id=sh.order_id
  WHERE sh.staff_id IS DISTINCT FROM o.staff_id AND sh.share_pct>0 AND sh.share_pct<1
 ), given AS (
  SELECT h.order_id,sum(h.share_pct) AS pct FROM held h GROUP BY h.order_id HAVING sum(h.share_pct)<1
 )
 SELECT o.id,o.staff_id,1-coalesce(g.pct,0),o.staff_id FROM o LEFT JOIN given g ON g.order_id=o.id
 UNION ALL
 SELECT h.order_id,h.staff_id,h.share_pct,o.staff_id FROM held h JOIN given g ON g.order_id=h.order_id JOIN o ON o.id=h.order_id
$fn$;

REVOKE ALL ON FUNCTION public.sales_order_parts(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_order_parts(uuid[]) TO service_role;

-- ── member_order_facts: a shared bill is its holders' rows ──────────────────

SELECT pg_temp.swap_check('public.member_order_facts(uuid, date, date)',
$q$  WHERE b.has_goods OR k.order_id IS NOT NULL
 )
 SELECT s.id,s.staff_id,s.order_no,s.order_date,s.period_month,s.recognition,
  coalesce(nullif(btrim(s.brand_code),''),'UNCLASSIFIED'),s.is_cleared,s.main,s.margin_base,
  CASE WHEN s.margin_base<=0 THEN NULL
   WHEN s.manual_margin_pct IS NOT NULL THEN s.manual_margin_pct
   WHEN s.costed THEN 1-s.team_cost/s.margin_base END,
  s.kpi_qty,s.manual_margin_pct IS NOT NULL
 FROM split s;$q$,
$q$  WHERE b.has_goods OR k.order_id IS NOT NULL
 ), parts AS (
  SELECT p.order_id,p.staff_id,p.part,p.staff_id IS NOT DISTINCT FROM p.owner_staff_id AS owner
  FROM public.sales_order_parts(ARRAY(SELECT s.id FROM split s)) p
 ), given AS (
  SELECT x.order_id,sum(round(s.main*x.part,2)) AS main,sum(round(s.margin_base*x.part,2)) AS margin_base,
   sum(s.kpi_qty*x.part) AS kpi_qty
  FROM parts x JOIN split s ON s.id=x.order_id WHERE NOT x.owner GROUP BY x.order_id
 )
 SELECT s.id,x.staff_id,s.order_no,s.order_date,s.period_month,s.recognition,
  coalesce(nullif(btrim(s.brand_code),''),'UNCLASSIFIED'),s.is_cleared,
  CASE WHEN x.owner THEN s.main-coalesce(g.main,0) ELSE round(s.main*x.part,2) END,
  CASE WHEN x.owner THEN s.margin_base-coalesce(g.margin_base,0) ELSE round(s.margin_base*x.part,2) END,
  CASE WHEN s.margin_base<=0 THEN NULL
   WHEN s.manual_margin_pct IS NOT NULL THEN s.manual_margin_pct
   WHEN s.costed THEN 1-s.team_cost/s.margin_base END,
  CASE WHEN x.owner THEN s.kpi_qty-coalesce(g.kpi_qty,0) ELSE s.kpi_qty*x.part END,
  s.manual_margin_pct IS NOT NULL
 FROM split s JOIN parts x ON x.order_id=s.id LEFT JOIN given g ON g.order_id=s.id;$q$);

-- ── member_kpi_for_staff: a shared bill's KPI items in the reader's part ────

SELECT pg_temp.swap_check('public.member_kpi_for_staff(uuid, uuid, date)',
$q$SELECT h.item_id,sum(h.qty) AS qty
  FROM public.comm_kpi_hits(p_scheme,ARRAY(SELECT o.id FROM eligible_orders o),v_rules_at) h
  GROUP BY h.item_id$q$,
$q$SELECT h.item_id,sum(h.qty*coalesce(pt.part,1)) AS qty
  FROM public.comm_kpi_hits(p_scheme,ARRAY(SELECT o.id FROM eligible_orders o),v_rules_at) h
  LEFT JOIN public.sales_order_parts(ARRAY(SELECT o.id FROM eligible_orders o)) pt ON pt.order_id=h.order_id AND pt.staff_id=v_staff
  GROUP BY h.item_id$q$);

-- ── member_order_book_for_staff: the reader's part, and who holds the rest ──

SELECT pg_temp.swap_check('public.member_order_book_for_staff(uuid, uuid, date, date)',
$q$ ), hits AS ($q$,
$q$
 ), parts AS (
  SELECT p.order_id,p.staff_id,p.part,p.owner_staff_id
  FROM public.sales_order_parts(ARRAY(SELECT f.order_id FROM facts f)) p
 ), hits AS ($q$);

-- One swap, not two: a LANGUAGE sql body is checked as it is created, so the part read and the join it reads go in together.
SELECT pg_temp.swap_check('public.member_order_book_for_staff(uuid, uuid, date, date)',
$q$SELECT h.line_id,sum(h.qty) AS qty
  FROM scheme c
  CROSS JOIN LATERAL (SELECT DISTINCT f.recognition_month FROM facts f WHERE c.enable_kpi) m
  CROSS JOIN LATERAL public.comm_kpi_hits(p_scheme,
   ARRAY(SELECT f.order_id FROM facts f WHERE f.recognition_month=m.recognition_month),
   (m.recognition_month+interval '1 month - 1 day')::date) h
  GROUP BY h.line_id$q$,
$q$SELECT h.line_id,sum(h.qty*coalesce(pt.part,1)) AS qty
  FROM scheme c
  CROSS JOIN LATERAL (SELECT DISTINCT f.recognition_month FROM facts f WHERE c.enable_kpi) m
  CROSS JOIN LATERAL public.comm_kpi_hits(p_scheme,
   ARRAY(SELECT f.order_id FROM facts f WHERE f.recognition_month=m.recognition_month),
   (m.recognition_month+interval '1 month - 1 day')::date) h
  LEFT JOIN parts pt ON pt.order_id=h.order_id AND pt.staff_id=p_staff
  GROUP BY h.line_id$q$);

SELECT pg_temp.swap_check('public.member_order_book_for_staff(uuid, uuid, date, date)',
$q$'lines',(SELECT coalesce(jsonb_agg(jsonb_build_object($q$,
$q$'own',so.staff_id IS NOT DISTINCT FROM p_staff,
    'share',CASE WHEN EXISTS(SELECT 1 FROM parts y WHERE y.order_id=f.order_id AND y.staff_id IS DISTINCT FROM y.owner_staff_id)
     THEN jsonb_build_object(
      'part',(SELECT y.part FROM parts y WHERE y.order_id=f.order_id AND y.staff_id=p_staff),
      'holders',(SELECT jsonb_agg(jsonb_build_object('id',y.staff_id,'name',coalesce(hs.employee_name,''),'pct',y.part,
          'owner',y.staff_id IS NOT DISTINCT FROM y.owner_staff_id)
        ORDER BY (y.staff_id IS NOT DISTINCT FROM y.owner_staff_id) DESC,hs.employee_name,y.staff_id)
        FROM parts y LEFT JOIN public.hr_staff_costs hs ON hs.id=y.staff_id WHERE y.order_id=f.order_id)) END,
    'lines',(SELECT coalesce(jsonb_agg(jsonb_build_object($q$);

-- ── member_arena_booth_history_for_staff: each holder's part on the booth boards ──

SELECT pg_temp.swap_check('public.member_arena_booth_history_for_staff(uuid, uuid)',
$q$), appearances AS ($q$,
$q$), held_parts AS (
    SELECT pt.order_id,pt.staff_id,pt.part,pt.staff_id IS NOT DISTINCT FROM pt.owner_staff_id AS owner
    FROM public.sales_order_parts(ARRAY(SELECT o.id FROM order_facts o WHERE o.fair_event_id IS NOT NULL)) pt
  ), held_given AS (
    SELECT x.order_id,sum(round(o.revenue*x.part,2)) AS revenue
    FROM held_parts x JOIN order_facts o ON o.id=x.order_id WHERE NOT x.owner GROUP BY x.order_id
  ), order_parts AS (
    SELECT o.id,x.staff_id,o.fair_event_id,o.booth_pick,o.own_brand,o.cleared,
      CASE WHEN x.owner THEN o.revenue-coalesce(g.revenue,0) ELSE round(o.revenue*x.part,2) END AS revenue
    FROM order_facts o JOIN held_parts x ON x.order_id=o.id LEFT JOIN held_given g ON g.order_id=o.id
  ), appearances AS ($q$);

SELECT pg_temp.swap_check('public.member_arena_booth_history_for_staff(uuid, uuid)',
$q$FROM order_facts o JOIN fairs f ON f.id=o.fair_event_id$q$,
$q$FROM order_parts o JOIN fairs f ON f.id=o.fair_event_id$q$);

-- ── A share changing forgets its bill's month's kept honours ────────────────

CREATE OR REPLACE FUNCTION public.member_honours_forget_share_month()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.member_honour_months) THEN RETURN NULL; END IF;
 IF TG_OP <> 'INSERT' THEN
  DELETE FROM public.member_honour_months m
   USING public.sales_orders so JOIN public.sales_import_batches b ON b.id = so.batch_id
   WHERE so.id = OLD.order_id AND m.sub_department_id = b.sub_department_id
     AND m.period_month = date_trunc('month', so.period_month)::date;
 END IF;
 IF TG_OP <> 'DELETE' THEN
  DELETE FROM public.member_honour_months m
   USING public.sales_orders so JOIN public.sales_import_batches b ON b.id = so.batch_id
   WHERE so.id = NEW.order_id AND m.sub_department_id = b.sub_department_id
     AND m.period_month = date_trunc('month', so.period_month)::date;
 END IF;
 RETURN NULL;
END
$fn$;

REVOKE ALL ON FUNCTION public.member_honours_forget_share_month() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS member_honours_share_changed ON public.sales_order_shares;
CREATE TRIGGER member_honours_share_changed
  AFTER INSERT OR UPDATE OR DELETE ON public.sales_order_shares
  FOR EACH ROW EXECUTE FUNCTION public.member_honours_forget_share_month();

NOTIFY pgrst, 'reload schema';
