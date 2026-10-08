-- 20261004020000_member_month_follows_close.sql
--
-- THE MONTH A BILL COUNTS IN, IN THE MEMBER APP (user 2026-10-04).
--
-- member_order_facts recognised every bill no run had released in the CURRENT
-- month. On 1 October that emptied September for everybody (nobody had been
-- closed on Comm Cal yet) and doubled October, and the swap would have undone
-- itself around the 15th, when September closes. Insight, Arena, Today and the
-- Championship all read these facts, so every one of them showed it.
--
-- The rule is now the run's own:
--   * a bill counts in its OWN month (`period_month`, the fair's) while that
--     month is still open for its salesperson;
--   * once the month is closed for them — a standing close on Comm Cal
--     (comm_salesperson_closes), or the sub-department's run applied for the
--     whole month — the bills that close released stay there for good
--     (comm_order_releases, as before);
--   * a bill the close did NOT pay — still under the deposit, or keyed after
--     the close — moves to the first month still open for them, where the
--     next close pays it: the run's carry-forward;
--   * a month before the portal pays (comm_first_paid_month) was settled by
--     hand and is never carried, as before.
-- So the month just gone keeps its own bills while it is being closed, and a
-- close is final.
--
-- member_kpi_for_staff carried its own copy of the old rule; it now reads the
-- facts, so a KPI count can never disagree with the sales beside it, and it
-- takes a month (Insight reads any month, Today the month still being closed).
-- member_order_book_for_staff also says which months are closed for the
-- member and when the portal began paying, so the app can mark a month Live
-- or final and open on the month still being closed.
--
-- Member app only: the commission run (TypeScript, loadCommissionInput) and
-- payroll are untouched. Nothing here moves money.

-- ── 1. member_order_facts: own month until closed ───────────────────────────
CREATE OR REPLACE FUNCTION public.member_order_facts(p_scheme uuid, p_from date, p_until date)
 RETURNS TABLE(order_id uuid, staff_id uuid, order_no text, order_date date, source_period date, recognition_month date, brand text, cleared boolean, revenue numeric, goods_revenue numeric, margin_pct numeric, kpi_qty numeric, manual boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 WITH scheme AS (
  SELECT c.*,(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date AS today,
   public.comm_first_paid_month(c.sub_department_id) AS first_paid,
   date_trunc('month',now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date AS current_month
  FROM public.comm_schemes c WHERE c.id=p_scheme
 ), closed AS (
  -- The last month each salesperson was closed for on Comm Cal (a standing
  -- close; a reopened one is not).
  SELECT x.staff_id,max(x.period_month) AS last_closed
  FROM public.comm_salesperson_closes x JOIN scheme c ON c.sub_department_id=x.sub_department_id
  WHERE x.reopened_at IS NULL
  GROUP BY x.staff_id
 ), run_closed AS (
  -- A run applied for the whole month closes it for everybody.
  SELECT max(r.period_month) AS last_closed
  FROM public.comm_runs r
  JOIN public.comm_schemes rs ON rs.id=r.scheme_id
  JOIN scheme c ON c.sub_department_id=rs.sub_department_id
  WHERE r.status IN ('applied','locked')
 ), sources AS (
  -- Resolve the newest committed document BEFORE checking owner, cancellation
  -- or order date, so an older imported version can never be revived.
  SELECT DISTINCT ON (so.order_no) so.* FROM public.sales_orders so
  JOIN public.sales_import_batches ib ON ib.id=so.batch_id
  JOIN scheme c ON c.sub_department_id=ib.sub_department_id
  WHERE ib.status='committed' AND so.period_month<=c.current_month
  ORDER BY so.order_no,so.created_at DESC,so.id
 ), scoped AS (
  SELECT so.*,c.enable_kpi,
   -- Released: the month that close paid it in, for good. Before the portal
   -- pays (20260926020000): its own month, settled by hand. Otherwise its own
   -- month until that month is closed for its salesperson, then the first
   -- month still open for them (20261004020000).
   coalesce(r.period_month,
    CASE WHEN so.period_month<c.first_paid THEN so.period_month
     ELSE greatest(so.period_month,
      (cl.last_closed+interval '1 month')::date,
      (rc.last_closed+interval '1 month')::date) END) AS recognition,
   -- The Revenue Team cost basis. Guarded the way marginBase() guards it: a
   -- missing or nonsense divisor divides by one rather than erasing the cost.
   CASE WHEN coalesce(c.revenue_cost_divisor,0)>0 THEN c.revenue_cost_divisor ELSE 1 END AS cost_divisor,
   r.id IS NOT NULL OR coalesce(so.period_month<c.first_paid,false)
    OR c.deposit_threshold_pct IS NULL OR so.order_total<=0
    OR so.paid_amount+0.005>=round(so.order_total*c.deposit_threshold_pct,2) AS is_cleared
  FROM sources so CROSS JOIN scheme c CROSS JOIN run_closed rc
  LEFT JOIN closed cl ON cl.staff_id=so.staff_id
  LEFT JOIN public.comm_order_releases r ON r.order_no=so.order_no AND r.sub_department_id=c.sub_department_id
  WHERE NOT so.cancelled AND so.order_date<=c.today
 ), windowed AS (
  SELECT o.* FROM scoped o
  WHERE (p_from IS NULL OR o.recognition>=p_from) AND (p_until IS NULL OR o.recognition<p_until)
 ), kpi AS (
  -- (2026-09-27) The KPI items each bill carries, in force at the end of the
  -- month it is recognised in (the run's as-at): their amount is paid flat as
  -- KPI, off its sales. One call per month, none while KPI is off.
  SELECT h.order_id,sum(h.qty*h.unit_amount) AS amount,sum(h.qty) AS qty
  FROM scheme c
  CROSS JOIN LATERAL (SELECT DISTINCT w.recognition FROM windowed w WHERE c.enable_kpi) m
  CROSS JOIN LATERAL public.comm_kpi_hits(p_scheme,
   ARRAY(SELECT w.id FROM windowed w WHERE w.recognition=m.recognition),
   (m.recognition+interval '1 month - 1 day')::date) h
  GROUP BY h.order_id
 ), line_scope AS (
  SELECT o.id,o.staff_id,o.order_no,o.order_date,o.period_month,o.recognition,
   o.brand_code,o.is_cleared,o.manual_margin_pct,l.line_amount,l.cost_amount,
   -- Layer 2: the cost the salesperson is measured on, not the invoice cost —
   -- each line at its SKU's own ratio, else the scheme's (2026-09-27).
   l.cost_amount/coalesce(cr.ratio,o.cost_divisor) AS team_cost,
   EXISTS(SELECT 1 FROM public.comm_item_groups g WHERE g.scheme_id=p_scheme
    AND upper(btrim(g.item_group))=upper(btrim(l.item_group)) AND g.commissionable) AS is_goods
  FROM windowed o JOIN public.sales_order_lines l ON l.order_id=o.id
  LEFT JOIN public.comm_cost_ratios cr ON cr.scheme_id=p_scheme
   AND upper(btrim(cr.product_code))=upper(btrim(l.product_code))
 ), bills AS (
  SELECT l.id,l.staff_id,l.order_no,l.order_date,l.period_month,l.recognition,
   l.brand_code,l.is_cleared,l.manual_margin_pct,
   coalesce(sum(l.line_amount) FILTER(WHERE l.is_goods),0) AS goods,
   bool_and(l.cost_amount IS NOT NULL) FILTER(WHERE l.is_goods) AS costed,
   sum(l.team_cost) FILTER(WHERE l.is_goods) AS team_cost,
   bool_or(l.is_goods) AS has_goods
  FROM line_scope l
  GROUP BY l.id,l.staff_id,l.order_no,l.order_date,l.period_month,l.recognition,
   l.brand_code,l.is_cleared,l.manual_margin_pct
 ), split AS (
  -- comm_kpi_hits pays only what a bill's sales cover.
  SELECT b.*,coalesce(k.qty,0) AS kpi_qty,b.goods-coalesce(k.amount,0) AS main
  FROM bills b LEFT JOIN kpi k ON k.order_id=b.id
  WHERE b.has_goods OR k.order_id IS NOT NULL
 )
 SELECT s.id,s.staff_id,s.order_no,s.order_date,s.period_month,s.recognition,
  coalesce(nullif(btrim(s.brand_code),''),'UNCLASSIFIED'),s.is_cleared,s.main,s.main,
  CASE WHEN s.main<=0 THEN NULL
   WHEN s.manual_margin_pct IS NOT NULL THEN s.manual_margin_pct
   WHEN s.costed THEN 1-s.team_cost/s.main END,
  s.kpi_qty,s.manual_margin_pct IS NOT NULL
 FROM split s;
$function$;

-- ── 2. KPI items of any month, on the facts ─────────────────────────────────
-- Was its own copy of the old rule (unreleased = the current month) and only
-- ever the current month. Each function gains a month as an OVERLOAD with no
-- default (a default would make the old two-argument call ambiguous), and the
-- old signature now hands over to it with NULL = the current month — so every
-- existing caller keeps working and reads the new rule.
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
 v_threshold integer;
 v_items jsonb;
 v_total numeric;
BEGIN
 SELECT c.sub_department_id,c.enable_kpi
 INTO v_sub,v_enabled
 FROM public.comm_schemes c
 JOIN public.comm_sub_departments d ON d.id=c.sub_department_id
 WHERE c.id=p_scheme AND c.is_active AND d.is_active
  AND c.effective_from<=v_today AND (c.effective_to IS NULL OR c.effective_to>=v_today)
  AND public.member_has_membership(v_staff,d.id)
  AND EXISTS(SELECT 1 FROM public.comm_hierarchy h WHERE h.scheme_id=c.id AND h.staff_id=v_staff
    AND h.effective_from<=v_today AND (h.effective_to IS NULL OR h.effective_to>=v_today));
 IF v_sub IS NULL THEN
  RAISE EXCEPTION 'An active membership in this scheme is required' USING ERRCODE='42501';
 END IF;
 IF v_period>date_trunc('month',v_today)::date THEN
  RAISE EXCEPTION 'Choose a month that has started' USING ERRCODE='22023';
 END IF;

 IF NOT v_enabled THEN
  RETURN jsonb_build_object('schemeId',p_scheme,'period',to_char(v_period,'YYYY-MM'),
   'asOf',now(),'enabled',false,'items','[]'::jsonb,'total',0,'threshold',NULL,'hit',NULL);
 END IF;

 -- The commission run selects its configuration at period end. Retain the
 -- FIRST rung even after it is reached; the old MemberKpi.target is next-unmet.
 SELECT min(k.min_qty) INTO v_threshold FROM public.comm_kpi_thresholds k
 WHERE k.scheme_id=p_scheme AND k.effective_from<=v_rules_at
  AND (k.effective_to IS NULL OR k.effective_to>=v_rules_at);

 WITH configured AS (
  -- A SKU (by its code) or a bed frame's / sofa's special (2026-09-27).
  SELECT k.id,
   CASE WHEN k.source='option' THEN btrim(k.option_value) ELSE upper(btrim(k.product_code)) END AS code,
   coalesce(nullif(btrim(k.product_name),''),
    CASE WHEN k.source='option' THEN btrim(k.option_value) ELSE btrim(k.product_code) END) AS label
  FROM public.comm_kpi_items k WHERE k.scheme_id=p_scheme
   AND k.effective_from<=v_rules_at AND (k.effective_to IS NULL OR k.effective_to>=v_rules_at)
 ), eligible_orders AS (
  -- The month's deposit-cleared bills, recognised exactly as Insight's sales.
  SELECT f.order_id AS id FROM public.member_order_facts(p_scheme,v_period,(v_period+interval '1 month')::date) f
  WHERE f.staff_id=v_staff AND f.cleared
 ), hits AS (
  SELECT h.item_id,sum(h.qty) AS qty
  FROM public.comm_kpi_hits(p_scheme,ARRAY(SELECT o.id FROM eligible_orders o),v_rules_at) h
  GROUP BY h.item_id
 ), quantities AS (
  SELECT c.code,c.label,coalesce(h.qty,0) AS quantity
  FROM configured c LEFT JOIN hits h ON h.item_id=c.id
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object('productCode',code,'label',label,'quantity',quantity)
   ORDER BY label,code),'[]'::jsonb),coalesce(sum(quantity),0)
 INTO v_items,v_total FROM quantities;

 RETURN jsonb_build_object('schemeId',p_scheme,'period',to_char(v_period,'YYYY-MM'),
  'asOf',now(),'enabled',true,'items',v_items,'total',v_total,'threshold',v_threshold,
  'hit',CASE WHEN v_threshold IS NULL THEN NULL ELSE v_total>=v_threshold END);
END $function$;

-- 'YYYY-MM', or NULL for the current month.
CREATE OR REPLACE FUNCTION public.member_kpi_month(p_period text)
 RETURNS date
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
BEGIN
 IF p_period IS NULL OR p_period='' THEN RETURN NULL; END IF;
 IF p_period !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
  RAISE EXCEPTION 'Choose a valid month' USING ERRCODE='22023';
 END IF;
 RETURN (p_period||'-01')::date;
END $function$;

CREATE OR REPLACE FUNCTION public.member_kpi_summary(p_scheme uuid, p_period text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_staff uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT coalesce(public.has_perm('member_portal'),false) THEN
  RAISE EXCEPTION 'Member portal access is required' USING ERRCODE='42501';
 END IF;
 v_staff:=public.member_staff_id();
 RETURN public.member_kpi_for_staff(v_staff,p_scheme,public.member_kpi_month(p_period));
END $function$;

CREATE OR REPLACE FUNCTION public.member_principal_kpi_summary(p_staff uuid, p_scheme uuid, p_period text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 PERFORM public.member_principal_context(p_staff,(SELECT sub_department_id FROM public.comm_schemes WHERE id=p_scheme),p_scheme);
 RETURN public.member_kpi_for_staff(p_staff,p_scheme,public.member_kpi_month(p_period))
  || jsonb_build_object('principalView',true,'viewedStaffId',p_staff);
END $function$;

-- The old signatures: the current month, through the new ones.
CREATE OR REPLACE FUNCTION public.member_kpi_for_staff(p_staff uuid, p_scheme uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT public.member_kpi_for_staff(p_staff,p_scheme,NULL::date) $function$;

CREATE OR REPLACE FUNCTION public.member_kpi_summary(p_scheme uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT public.member_kpi_summary(p_scheme,NULL::text) $function$;

CREATE OR REPLACE FUNCTION public.member_principal_kpi_summary(p_staff uuid, p_scheme uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT public.member_principal_kpi_summary(p_staff,p_scheme,NULL::text) $function$;

REVOKE ALL ON FUNCTION public.member_kpi_for_staff(uuid,uuid,date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.member_kpi_month(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.member_kpi_summary(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.member_principal_kpi_summary(uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_kpi_summary(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.member_principal_kpi_summary(uuid,uuid,text) TO authenticated;

-- ── 3. The order book says which months are final ───────────────────────────
-- `closedMonths`: every month closed for this member here (their standing
-- closes, and any month the sub-department's run was applied for whole).
-- `paysFrom`: the first month the portal pays (before it: settled by hand).
CREATE OR REPLACE FUNCTION public.member_order_book_for_staff(p_staff uuid, p_scheme uuid, p_from date, p_until date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 WITH scheme AS (
  SELECT c.id,c.sub_department_id,c.enable_kpi,c.deposit_threshold_pct FROM public.comm_schemes c WHERE c.id=p_scheme
 ), facts AS (
  SELECT f.* FROM public.member_order_facts(p_scheme,p_from,p_until) f WHERE f.staff_id=p_staff
 ), hits AS (
  -- The KPI items of each line, in force at the end of the month its bill is
  -- recognised in (member_order_facts' as-at). None while KPI is off.
  SELECT h.line_id,sum(h.qty) AS qty
  FROM scheme c
  CROSS JOIN LATERAL (SELECT DISTINCT f.recognition_month FROM facts f WHERE c.enable_kpi) m
  CROSS JOIN LATERAL public.comm_kpi_hits(p_scheme,
   ARRAY(SELECT f.order_id FROM facts f WHERE f.recognition_month=m.recognition_month),
   (m.recognition_month+interval '1 month - 1 day')::date) h
  GROUP BY h.line_id
 )
 SELECT jsonb_build_object(
  'from',to_char(p_from,'YYYY-MM'),
  'through',to_char((p_until-interval '1 day')::date,'YYYY-MM'),
  'asOf',now(),
  'paysFrom',(SELECT to_char(public.comm_first_paid_month(c.sub_department_id),'YYYY-MM') FROM scheme c),
  'closedMonths',(SELECT coalesce(jsonb_agg(z.m ORDER BY z.m),'[]'::jsonb) FROM (
    SELECT to_char(x.period_month,'YYYY-MM') AS m FROM public.comm_salesperson_closes x JOIN scheme c ON c.sub_department_id=x.sub_department_id
    WHERE x.staff_id=p_staff AND x.reopened_at IS NULL
    UNION
    SELECT to_char(r.period_month,'YYYY-MM') FROM public.comm_runs r
    JOIN public.comm_schemes rs ON rs.id=r.scheme_id JOIN scheme c ON c.sub_department_id=rs.sub_department_id
    WHERE r.status IN ('applied','locked')) z),
  'orders',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id',f.order_id,
    'number',f.order_no,
    'ref',nullif(btrim(so.bill_ref),''),
    'customer',coalesce(nullif(btrim(so.customer_name),''),''),
    'date',f.order_date,
    'sourceMonth',to_char(f.source_period,'YYYY-MM'),
    'recognitionMonth',to_char(f.recognition_month,'YYYY-MM'),
    'brand',f.brand,
    'venue',coalesce(nullif(btrim(so.venue),''),''),
    'fairStart',ev.start_date,
    'fairEnd',ev.end_date,
    'organiser',coalesce(org.name,nullif(btrim(ev.erp_organiser_text),'')),
    -- The fair weekend the bill belongs to, named by its Friday (a fair is in
    -- the week it opens); a bill no fair claims, by the week it was written.
    'week',(date_trunc('week',coalesce(ev.start_date,f.order_date))::date+4),
    'revenue',f.revenue,
    'margin',CASE WHEN f.margin_pct IS NULL THEN NULL ELSE round(f.margin_pct*100,2) END,
    'kpiQty',f.kpi_qty,
    'cleared',f.cleared,
    'carried',f.source_period<f.recognition_month,
    'manual',f.manual,
    'total',so.order_total,
    'paid',so.paid_amount,
    'depositNeeded',CASE WHEN c.deposit_threshold_pct IS NULL THEN NULL ELSE round(so.order_total*c.deposit_threshold_pct,2) END,
    'lines',(SELECT coalesce(jsonb_agg(jsonb_build_object(
      'name',coalesce(nullif(btrim(l.product_name),''),l.product_code,''),
      'code',l.product_code,
      'qty',l.qty,
      'amount',l.line_amount,
      'goods',EXISTS(SELECT 1 FROM public.comm_item_groups g WHERE g.scheme_id=p_scheme
        AND upper(btrim(g.item_group))=upper(btrim(l.item_group)) AND g.commissionable),
      'kpiQty',coalesce(h.qty,0))
      ORDER BY l.line_no,l.id),'[]'::jsonb)
     FROM public.sales_order_lines l LEFT JOIN hits h ON h.line_id=l.id
     WHERE l.order_id=f.order_id))
   ORDER BY f.order_date,f.order_no)
  FROM facts f
  CROSS JOIN scheme c
  JOIN public.sales_orders so ON so.id=f.order_id
  LEFT JOIN public.comm_venue_events ev ON ev.id=so.fair_event_id
  LEFT JOIN public.comm_organisers org ON org.id=ev.organiser_id),'[]'::jsonb));
$function$;

NOTIFY pgrst, 'reload schema';
