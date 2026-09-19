-- ============================================================================
-- THE MEMBER APP WAS SHOWING THE WRONG MARGIN -- AND THE WRONG LAYER (2026-09-19)
--
-- There are two margins on a Revenue bill and they are not interchangeable:
--
--   layer 1  price vs the ERP's own cost            -- what the company makes
--   layer 2  price vs cost / revenue_cost_divisor   -- what the salesperson is
--                                                      measured and paid on
--
-- Fair's divisor is 0.7, so the Revenue Team's cost is the ERP cost plus
-- roughly 43%. Layer 2 is the only one a salesperson is meant to see: it is
-- the margin their incentive tier is judged on, and layer 1 is the company's
-- own number (user, 2026-09-19).
--
-- The engine has divided since PR #114, and so have the Quote calculator and
-- revenue_month_orders. `member_order_facts` never did -- it computed
-- 1 - cost/revenue on the raw ERP cost. Every member-facing read model is
-- built on this one function (Arena, Insight, the scoreboards, the Principal
-- view); it is also the only member-side function that touches cost_amount at
-- all, and RLS keeps sales_orders and sales_order_lines to hr and admin. So
-- this single division is the whole boundary, and one line moves the entire
-- member app from layer 1 to layer 2.
--
-- What it was worth: on September 2026 every brand margin in the app read
-- 12 to 22 points high. Five of twenty-five people would have been shown an
-- incentive tier the run does not pay -- ZACK's Zanotti read 41.1% against a
-- real 15.8%, PEI FEN's Ergotex 49.0% against 27.1%.
--
-- A manual margin is still taken as typed, exactly as billMargin() takes it:
-- somebody who overrides a bill's margin is stating the answer, not the cost.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.member_order_facts(p_scheme uuid,p_from date,p_until date)
RETURNS TABLE(
 order_id uuid,staff_id uuid,order_no text,order_date date,source_period date,
 recognition_month date,brand text,cleared boolean,revenue numeric,
 goods_revenue numeric,margin_pct numeric,kpi_qty numeric,manual boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH scheme AS (
  SELECT c.*,(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date AS today,
   date_trunc('month',now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date AS current_month
  FROM public.comm_schemes c WHERE c.id=p_scheme
 ), sources AS (
  -- Resolve the newest committed document BEFORE checking owner, cancellation
  -- or order date, so an older imported version can never be revived.
  SELECT DISTINCT ON (so.order_no) so.* FROM public.sales_orders so
  JOIN public.sales_import_batches ib ON ib.id=so.batch_id
  JOIN scheme c ON c.sub_department_id=ib.sub_department_id
  WHERE ib.status='committed' AND so.period_month<=c.current_month
  ORDER BY so.order_no,so.created_at DESC,so.id
 ), scoped AS (
  SELECT so.*,c.enable_kpi,coalesce(r.period_month,c.current_month) AS recognition,
   -- The Revenue Team cost basis. Guarded the way marginBase() guards it: a
   -- missing or nonsense divisor divides by one rather than erasing the cost.
   CASE WHEN coalesce(c.revenue_cost_divisor,0)>0 THEN c.revenue_cost_divisor ELSE 1 END AS cost_divisor,
   r.id IS NOT NULL OR c.deposit_threshold_pct IS NULL OR so.order_total<=0
    OR so.paid_amount+0.005>=round(so.order_total*c.deposit_threshold_pct,2) AS is_cleared
  FROM sources so CROSS JOIN scheme c
  LEFT JOIN public.comm_order_releases r ON r.order_no=so.order_no AND r.sub_department_id=c.sub_department_id
  WHERE NOT so.cancelled AND so.order_date<=c.today
 ), line_scope AS (
  SELECT o.id,o.staff_id,o.order_no,o.order_date,o.period_month,o.recognition,
   o.brand_code,o.is_cleared,o.manual_margin_pct,o.cost_divisor,l.line_amount,l.cost_amount,l.qty,
   EXISTS(SELECT 1 FROM public.comm_item_groups g WHERE g.scheme_id=p_scheme
    AND upper(btrim(g.item_group))=upper(btrim(l.item_group)) AND g.commissionable) AS is_goods,
   o.enable_kpi AND EXISTS(SELECT 1 FROM public.comm_kpi_items k WHERE k.scheme_id=p_scheme
    AND upper(btrim(k.product_code))=upper(btrim(l.product_code))
    AND k.effective_from<=(o.recognition+interval '1 month - 1 day')::date
    AND (k.effective_to IS NULL OR k.effective_to>=(o.recognition+interval '1 month - 1 day')::date)) AS is_kpi
  FROM scoped o JOIN public.sales_order_lines l ON l.order_id=o.id
  WHERE (p_from IS NULL OR o.recognition>=p_from) AND (p_until IS NULL OR o.recognition<p_until)
 )
 SELECT l.id,l.staff_id,l.order_no,l.order_date,l.period_month,l.recognition,
  coalesce(nullif(btrim(l.brand_code),''),'UNCLASSIFIED'),l.is_cleared,sum(l.line_amount),
  coalesce(sum(l.line_amount) FILTER(WHERE l.is_goods),0),
  CASE WHEN coalesce(sum(l.line_amount) FILTER(WHERE l.is_goods),0)<=0 THEN NULL
   WHEN l.manual_margin_pct IS NOT NULL THEN l.manual_margin_pct
   WHEN bool_and(l.cost_amount IS NOT NULL) FILTER(WHERE l.is_goods)
    -- Layer 2: the cost the salesperson is measured on, not the invoice cost.
    THEN 1-(sum(l.cost_amount/l.cost_divisor) FILTER(WHERE l.is_goods))/(sum(l.line_amount) FILTER(WHERE l.is_goods)) END,
  sum(CASE WHEN l.is_kpi THEN l.qty ELSE 0 END),l.manual_margin_pct IS NOT NULL
 FROM line_scope l WHERE l.is_goods OR l.is_kpi
 GROUP BY l.id,l.staff_id,l.order_no,l.order_date,l.period_month,l.recognition,
  l.brand_code,l.is_cleared,l.manual_margin_pct;
$$;

COMMENT ON FUNCTION public.member_order_facts(uuid,date,date) IS
 'One private document-facts calculation for Insight, Arena and recent Income orders. Margin is the REVENUE TEAM margin - cost divided by comm_schemes.revenue_cost_divisor, the same basis the engine pays on - because the company''s own margin is not the salesperson''s to see. Authorization stays in the public/member entry points.';
