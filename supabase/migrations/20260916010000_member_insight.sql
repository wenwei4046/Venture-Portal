-- ============================================================================
-- 20260916010000_member_insight.sql
-- Insight: live personal sales, the department ranking, and downline status
-- HOUZS Venture Portal
--
-- The member app has so far shown a salesperson what a RUN decided: the
-- statement's commission, its KPI counts, its margins. A run happens once a
-- month, so for most of the month the answer to "how am I doing" is last
-- month's answer. Insight reads the committed sales orders directly and
-- answers it for today.
--
-- Three things, over one shared scoreboard:
--
--   1. MY SALES        own commissionable revenue this month, KPI units, the
--                      gap to the next rung's gate, the blended margin, and
--                      every order with the margin band it falls in.
--   2. RANKING         everybody, ranked, split by sub-department (Fair, IR,
--                      …). Sales and margin only: no commission, no salary,
--                      no rate — those stay between a member, HR and the
--                      Principal.
--   3. DOWNLINE        the same numbers for the caller's own subtree, so an
--                      upline can see who is carrying and who is stuck.
--
-- WHAT "UP TO DATE" MEANS HERE, precisely, because a number that disagrees
-- with the payslip is worse than no number at all:
--
--   * Only COMMISSIONABLE lines count — the item groups the scheme pays on
--     plus its KPI products — exactly as engine.ts counts them.
--   * The DEPOSIT GATE applies. An order under the threshold pays nothing
--     yet, so it is reported separately as `held`, never inside `sales`.
--   * CARRY-FORWARD is honoured: an older order whose deposit has since
--     cleared and which no run has released (comm_order_releases) counts
--     towards this month, the month it will in fact pay in.
--   * MARGIN prefers a keyed-in manual margin, then line costs. An order with
--     neither counts in sales but is excluded from the blended margin, and
--     the count of such orders travels alongside so the UI can say so rather
--     than quietly reporting a margin drawn from half the orders.
--
-- Nothing here writes. Every function is STABLE, SECURITY DEFINER, and
-- projects JSON rather than opening sales_orders to a member role.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The permission.
--
-- A neutral member account may only ever hold the keys named at the end of
-- current_permissions() (mig 20260912060000), so that allowlist has to learn
-- this one or granting it would do nothing at all.
-- ----------------------------------------------------------------------------
INSERT INTO public.permission_defs(key,label,section,scope,description,sort_order) VALUES
 ('member_insight','Member insight','Revenue member','none','Live own sales, department ranking and downline performance. Sales figures only — never another member''s pay.',316)
ON CONFLICT(key) DO UPDATE SET scope='none',label=EXCLUDED.label,description=EXCLUDED.description;

INSERT INTO public.role_default_permissions(role,permission_key)
SELECT 'revenue_member'::public.user_role,'member_insight'
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.current_permissions() RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH me AS (
  SELECT id,role FROM public.users WHERE id=auth.uid() AND is_active
 ), my_title AS (
  SELECT s.title_id FROM public.hr_staff_costs s WHERE s.user_id=(SELECT id FROM me) AND s.title_id IS NOT NULL LIMIT 1
 ), title_is_configured AS (
  SELECT EXISTS(SELECT 1 FROM public.title_permissions tp WHERE tp.title_id=(SELECT title_id FROM my_title)) AS yes
 ), inherited AS (
  SELECT tp.permission_key AS key FROM public.title_permissions tp
  WHERE tp.title_id=(SELECT title_id FROM my_title) AND (SELECT yes FROM title_is_configured)
   AND (SELECT role FROM me)<>'revenue_member'
  UNION
  SELECT rdp.permission_key FROM public.role_default_permissions rdp
  WHERE rdp.role=(SELECT role FROM me) AND (NOT(SELECT yes FROM title_is_configured) OR (SELECT role FROM me)='revenue_member')
 ), overrides AS (
  SELECT permission_key AS key,granted FROM public.user_permissions WHERE user_id=(SELECT id FROM me)
 ), resolved AS (
  SELECT i.key FROM inherited i WHERE NOT EXISTS(SELECT 1 FROM overrides o WHERE o.key=i.key AND NOT o.granted)
  UNION SELECT o.key FROM overrides o WHERE o.granted
 )
 SELECT coalesce(array_agg(key),'{}'::text[]) FROM resolved
 WHERE (SELECT role FROM me)<>'revenue_member'
  OR key=ANY(ARRAY['member_portal','member_quote','member_requests','member_memos','member_insight']);
$$;
REVOKE ALL ON FUNCTION public.current_permissions() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.current_permissions() TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. The scoreboard: one row per salesperson with orders in a scheme-month.
--
-- Internal. Every caller below is itself SECURITY DEFINER and has already
-- established what the caller may see, so this is revoked from everyone.
-- ----------------------------------------------------------------------------
CREATE FUNCTION public.member_scoreboard(p_scheme uuid,p_period date)
RETURNS TABLE(
 staff_id uuid,
 order_count integer,
 sales numeric,
 held numeric,
 kpi_qty numeric,
 margin_revenue numeric,
 margin_cost numeric,
 blind_orders integer,
 last_order date
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH scheme AS (
  SELECT c.id,c.sub_department_id,coalesce(c.deposit_threshold_pct,0) AS deposit
  FROM public.comm_schemes c WHERE c.id=p_scheme
 ), scoped AS (
  -- This month's orders, plus older ones no run has released: those pay in
  -- the month their deposit clears, which may well be this one.
  SELECT so.id,so.staff_id,so.order_date,so.order_total,so.paid_amount,so.manual_margin_pct
  FROM public.sales_orders so
  JOIN public.sales_import_batches ib ON ib.id=so.batch_id
  JOIN scheme sc ON sc.sub_department_id=ib.sub_department_id
  WHERE ib.status='committed' AND NOT so.cancelled AND so.staff_id IS NOT NULL
   AND (so.period_month=p_period OR (so.period_month<p_period
    AND NOT EXISTS(SELECT 1 FROM public.comm_order_releases r WHERE r.order_no=so.order_no)))
 ), per_order AS (
  SELECT o.id,o.staff_id,o.order_date,
   o.paid_amount+0.005>=o.order_total*(SELECT deposit FROM scheme) AS cleared,
   sum(l.line_amount) AS revenue,
   CASE WHEN o.manual_margin_pct IS NOT NULL THEN o.manual_margin_pct
        WHEN bool_and(l.cost_amount IS NOT NULL) AND sum(l.line_amount)>0
        THEN (sum(l.line_amount)-sum(l.cost_amount))/sum(l.line_amount) END AS margin_pct,
   sum(CASE WHEN EXISTS(SELECT 1 FROM public.comm_kpi_items k WHERE k.scheme_id=p_scheme
     AND upper(btrim(k.product_code))=upper(btrim(l.product_code))
     AND k.effective_from<=o.order_date AND (k.effective_to IS NULL OR k.effective_to>=o.order_date))
    THEN l.qty ELSE 0 END) AS kpi_qty
  FROM scoped o JOIN public.sales_order_lines l ON l.order_id=o.id
  WHERE EXISTS(SELECT 1 FROM public.comm_item_groups g
    WHERE g.scheme_id=p_scheme AND g.item_group=l.item_group AND g.commissionable)
   OR EXISTS(SELECT 1 FROM public.comm_kpi_items k WHERE k.scheme_id=p_scheme
    AND upper(btrim(k.product_code))=upper(btrim(l.product_code))
    AND k.effective_from<=o.order_date AND (k.effective_to IS NULL OR k.effective_to>=o.order_date))
  GROUP BY o.id,o.staff_id,o.order_date,o.order_total,o.paid_amount,o.manual_margin_pct
 )
 SELECT p.staff_id,
  count(*) FILTER (WHERE p.cleared)::integer,
  coalesce(sum(p.revenue) FILTER (WHERE p.cleared),0),
  coalesce(sum(p.revenue) FILTER (WHERE NOT p.cleared),0),
  coalesce(sum(p.kpi_qty) FILTER (WHERE p.cleared),0),
  coalesce(sum(p.revenue) FILTER (WHERE p.cleared AND p.margin_pct IS NOT NULL),0),
  coalesce(sum(p.revenue*(1-p.margin_pct)) FILTER (WHERE p.cleared AND p.margin_pct IS NOT NULL),0),
  count(*) FILTER (WHERE p.cleared AND p.margin_pct IS NULL)::integer,
  max(p.order_date) FILTER (WHERE p.cleared)
 FROM per_order p GROUP BY p.staff_id;
$$;
COMMENT ON FUNCTION public.member_scoreboard(uuid,date) IS
 'Live commissionable performance per salesperson for one scheme-month: deposit-cleared sales, revenue the gate is holding, KPI units, and the revenue/cost pair a blended margin is taken from. Carried-forward orders included; orders with no usable margin count in sales and are excluded from the margin pair.';

-- ----------------------------------------------------------------------------
-- 3. Everybody in a scheme, with their live numbers. Including the people
--    with none — a leaderboard that hides the bottom is not a leaderboard.
-- ----------------------------------------------------------------------------
CREATE FUNCTION public.member_department_board(p_scheme uuid,p_period date)
RETURNS TABLE(
 staff_id uuid,name text,title text,sales numeric,held numeric,order_count integer,
 kpi_qty numeric,margin_revenue numeric,margin_cost numeric,blind_orders integer,last_order date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT s.id,s.employee_name,coalesce(t.name,'Title not configured'),
  coalesce(b.sales,0),coalesce(b.held,0),coalesce(b.order_count,0),coalesce(b.kpi_qty,0),
  coalesce(b.margin_revenue,0),coalesce(b.margin_cost,0),coalesce(b.blind_orders,0),b.last_order
 FROM public.comm_hierarchy h
 JOIN public.hr_staff_costs s ON s.id=h.staff_id
 LEFT JOIN public.titles t ON t.id=h.title_id
 LEFT JOIN public.member_scoreboard(p_scheme,p_period) b ON b.staff_id=s.id
 WHERE h.scheme_id=p_scheme
  AND h.effective_from<=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date
  AND (h.effective_to IS NULL OR h.effective_to>=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)
  AND s.status='active';
$$;
COMMENT ON FUNCTION public.member_department_board(uuid,date) IS
 'One row per active member of a scheme with their live sales, everybody included. Sales and margin only: commission, rate and salary never leave the statement.';

-- ----------------------------------------------------------------------------
-- 4. The caller's subtree in a scheme, with the same numbers.
-- ----------------------------------------------------------------------------
CREATE FUNCTION public.member_downline_board(p_scheme uuid,p_staff uuid,p_period date)
RETURNS TABLE(
 staff_id uuid,name text,title text,upline_id uuid,depth integer,
 sales numeric,held numeric,order_count integer,kpi_qty numeric,
 margin_revenue numeric,margin_cost numeric,blind_orders integer,last_order date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH RECURSIVE positions AS (
  SELECT h.* FROM public.comm_hierarchy h WHERE h.scheme_id=p_scheme
  AND h.effective_from<=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date
  AND (h.effective_to IS NULL OR h.effective_to>=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)
 ), tree AS (
  SELECT h.staff_id,h.upline_staff_id,h.title_id,ARRAY[h.staff_id] AS visited,0 AS depth
  FROM positions h WHERE h.staff_id=p_staff
  UNION ALL
  SELECT h.staff_id,h.upline_staff_id,h.title_id,t.visited||h.staff_id,t.depth+1
  FROM positions h JOIN tree t ON h.upline_staff_id=t.staff_id
  WHERE t.depth<20 AND NOT h.staff_id=ANY(t.visited)
 )
 SELECT s.id,s.employee_name,coalesce(ti.name,'Title not configured'),t.upline_staff_id,t.depth,
  coalesce(b.sales,0),coalesce(b.held,0),coalesce(b.order_count,0),coalesce(b.kpi_qty,0),
  coalesce(b.margin_revenue,0),coalesce(b.margin_cost,0),coalesce(b.blind_orders,0),b.last_order
 FROM tree t
 JOIN public.hr_staff_costs s ON s.id=t.staff_id
 LEFT JOIN public.titles ti ON ti.id=t.title_id
 LEFT JOIN public.member_scoreboard(p_scheme,p_period) b ON b.staff_id=t.staff_id
 WHERE t.depth>0 AND s.status='active';
$$;
COMMENT ON FUNCTION public.member_downline_board(uuid,uuid,date) IS
 'The caller''s subtree in one scheme with each person''s live sales. Depth 0 — the caller — is excluded; that is the `me` block.';

-- ----------------------------------------------------------------------------
-- 5. The caller's own orders, with the facts a margin band is read from.
-- ----------------------------------------------------------------------------
CREATE FUNCTION public.member_insight_orders(p_scheme uuid,p_staff uuid,p_period date) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH scheme AS (
  SELECT c.sub_department_id,coalesce(c.deposit_threshold_pct,0) AS deposit
  FROM public.comm_schemes c WHERE c.id=p_scheme
 ), scoped AS (
  SELECT so.id,so.order_no,so.order_date,so.brand_code,so.period_month,
   so.manual_margin_pct,so.order_total,so.paid_amount
  FROM public.sales_orders so
  JOIN public.sales_import_batches ib ON ib.id=so.batch_id
  JOIN scheme sc ON sc.sub_department_id=ib.sub_department_id
  WHERE ib.status='committed' AND NOT so.cancelled AND so.staff_id=p_staff
   AND (so.period_month=p_period OR (so.period_month<p_period
    AND NOT EXISTS(SELECT 1 FROM public.comm_order_releases r WHERE r.order_no=so.order_no)))
  ORDER BY so.order_date DESC,so.order_no DESC LIMIT 200
 ), per_order AS (
  SELECT o.id,o.order_no,o.order_date,o.brand_code,o.period_month,o.manual_margin_pct,
   o.paid_amount+0.005>=o.order_total*(SELECT deposit FROM scheme) AS cleared,
   sum(l.line_amount) AS revenue,
   CASE WHEN o.manual_margin_pct IS NOT NULL THEN o.manual_margin_pct*100
        WHEN bool_and(l.cost_amount IS NOT NULL) AND sum(l.line_amount)>0
        THEN (sum(l.line_amount)-sum(l.cost_amount))/sum(l.line_amount)*100 END AS margin,
   sum(CASE WHEN EXISTS(SELECT 1 FROM public.comm_kpi_items k WHERE k.scheme_id=p_scheme
     AND upper(btrim(k.product_code))=upper(btrim(l.product_code))
     AND k.effective_from<=o.order_date AND (k.effective_to IS NULL OR k.effective_to>=o.order_date))
    THEN l.qty ELSE 0 END) AS kpi_qty
  FROM scoped o JOIN public.sales_order_lines l ON l.order_id=o.id
  WHERE EXISTS(SELECT 1 FROM public.comm_item_groups g
    WHERE g.scheme_id=p_scheme AND g.item_group=l.item_group AND g.commissionable)
   OR EXISTS(SELECT 1 FROM public.comm_kpi_items k WHERE k.scheme_id=p_scheme
    AND upper(btrim(k.product_code))=upper(btrim(l.product_code))
    AND k.effective_from<=o.order_date AND (k.effective_to IS NULL OR k.effective_to>=o.order_date))
  GROUP BY o.id,o.order_no,o.order_date,o.brand_code,o.period_month,o.manual_margin_pct,
   o.order_total,o.paid_amount
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',p.id,'number',p.order_no,'brand',coalesce(p.brand_code,'Uncategorised'),
  'revenue',p.revenue,'margin',p.margin,'date',p.order_date,
  'manual',p.manual_margin_pct IS NOT NULL,'cleared',p.cleared,
  'kpiQty',p.kpi_qty,'carried',p.period_month<p_period
 ) ORDER BY p.order_date DESC,p.order_no DESC),'[]'::jsonb) FROM per_order p;
$$;

-- ----------------------------------------------------------------------------
-- 6. Insight itself.
--
-- One block per membership the caller holds: a sub-department is a world of
-- its own (mig 20260910160000) with its own title, upline, ladder and orders.
-- ----------------------------------------------------------------------------
CREATE FUNCTION public.member_insight_snapshot(p_period text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
 v_staff uuid:=public.member_staff_id();
 v_today date:=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
 v_period date;
 v_blocks jsonb;
BEGIN
 IF NOT public.has_perm('member_insight') THEN
  RAISE EXCEPTION 'Insight is not enabled for this account' USING ERRCODE='42501';
 END IF;
 v_period:=date_trunc('month',coalesce(
  CASE WHEN p_period ~ '^\d{4}-\d{2}$' THEN to_date(p_period||'-01','YYYY-MM-DD') END,
  v_today))::date;
 IF v_period>date_trunc('month',v_today)::date THEN
  v_period:=date_trunc('month',v_today)::date;
 END IF;

 SELECT coalesce(jsonb_agg(b.block ORDER BY b.ord,b.department),'[]'::jsonb) INTO v_blocks FROM (
  SELECT d.created_at AS ord,d.name AS department,jsonb_build_object(
   'membershipId',d.id,
   'schemeId',c.id,
   'department',d.name,
   'title',coalesce(t.name,'Title not configured'),
   'rank',coalesce(r.label,'Rank not configured'),
   'rankSort',coalesce(r.sort_order,0),

   -- What the caller has done this month.
   'me',jsonb_build_object(
    'staffId',v_staff,
    'name',(SELECT employee_name FROM public.hr_staff_costs WHERE id=v_staff),
    'sales',coalesce(mine.sales,0),
    'held',coalesce(mine.held,0),
    'orders',coalesce(mine.order_count,0),
    'kpiQty',coalesce(mine.kpi_qty,0),
    'marginRevenue',coalesce(mine.margin_revenue,0),
    'marginCost',coalesce(mine.margin_cost,0),
    'blindOrders',coalesce(mine.blind_orders,0),
    'lastOrder',mine.last_order),

   -- The next rung, its gate, and how a personal-sales streak stands. The
   -- 100k gate is 100k in `months` months RUNNING (mig 20260903040000), so a
   -- single month's gap is only half the answer.
   'target',(
    SELECT jsonb_build_object(
     'rank',nx.label,
     'personal',nx.personal_sales_threshold,
     'months',nx.consecutive_months,
     'group',nx.group_sales_threshold,
     'streak',CASE WHEN nx.personal_sales_threshold IS NULL THEN NULL ELSE (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
       'period',to_char(m.month,'YYYY-MM'),
       'sales',m.sales,
       'live',m.month=v_period,
       'met',m.sales>=nx.personal_sales_threshold) ORDER BY m.month),'[]'::jsonb)
      FROM (
       SELECT (v_period-(g.back||' months')::interval)::date AS month,
        CASE WHEN g.back=0 THEN coalesce(mine.sales,0) ELSE coalesce((
         SELECT st.product_revenue FROM public.comm_statements st
         JOIN public.comm_runs r2 ON r2.id=st.run_id
         WHERE st.staff_id=v_staff AND r2.scheme_id=c.id
          AND r2.period_month=(v_period-(g.back||' months')::interval)::date
         LIMIT 1),0) END AS sales
       FROM generate_series(0,greatest(nx.consecutive_months,1)-1) AS g(back)
      ) m) END)
    FROM public.comm_ranks nx
    WHERE nx.scheme_id=c.id AND nx.sort_order>coalesce(r.sort_order,-1)
    ORDER BY nx.sort_order LIMIT 1),

   -- Every sub-department of this department, ranked. The caller's own first.
   'boards',(SELECT coalesce(jsonb_agg(x.board ORDER BY x.own DESC,x.ord,x.name),'[]'::jsonb) FROM (
     SELECT bd.name,bd.created_at AS ord,(bd.id=d.id) AS own,jsonb_build_object(
      'departmentId',bd.id,'department',bd.name,'own',bd.id=d.id,
      'rows',(SELECT coalesce(jsonb_agg(jsonb_build_object(
        'staffId',p.staff_id,'name',p.name,'title',p.title,
        'sales',p.sales,'held',p.held,'orders',p.order_count,'kpiQty',p.kpi_qty,
        'marginRevenue',p.margin_revenue,'marginCost',p.margin_cost,
        'blindOrders',p.blind_orders,'lastOrder',p.last_order,
        'self',p.staff_id=v_staff) ORDER BY p.sales DESC,p.name),'[]'::jsonb)
       FROM public.member_department_board(bc.id,v_period) p)) AS board
     FROM public.comm_sub_departments bd
     JOIN public.comm_schemes bc ON bc.sub_department_id=bd.id AND bc.is_active
      AND bc.effective_from<=v_today AND (bc.effective_to IS NULL OR bc.effective_to>=v_today)
     WHERE bd.is_active AND bd.department_id=d.department_id
    ) x),

   -- The caller's own subtree in this scheme.
   'downline',(SELECT coalesce(jsonb_agg(jsonb_build_object(
     'staffId',p.staff_id,'name',p.name,'title',p.title,'uplineId',p.upline_id,'depth',p.depth,
     'sales',p.sales,'held',p.held,'orders',p.order_count,'kpiQty',p.kpi_qty,
     'marginRevenue',p.margin_revenue,'marginCost',p.margin_cost,
     'blindOrders',p.blind_orders,'lastOrder',p.last_order)
     ORDER BY p.depth,p.sales DESC,p.name),'[]'::jsonb)
    FROM public.member_downline_board(c.id,v_staff,v_period) p),

   'orders',public.member_insight_orders(c.id,v_staff,v_period)
  ) AS block
  FROM public.comm_hierarchy h
  JOIN public.comm_schemes c ON c.id=h.scheme_id
  JOIN public.comm_sub_departments d ON d.id=c.sub_department_id
  LEFT JOIN public.titles t ON t.id=h.title_id
  LEFT JOIN public.comm_ranks r ON r.id=h.rank_id
  LEFT JOIN LATERAL public.member_scoreboard(c.id,v_period) mine ON mine.staff_id=v_staff
  WHERE h.staff_id=v_staff AND h.effective_from<=v_today
   AND (h.effective_to IS NULL OR h.effective_to>=v_today)
   AND d.is_active AND c.is_active AND c.effective_from<=v_today
   AND (c.effective_to IS NULL OR c.effective_to>=v_today)
 ) b;

 RETURN jsonb_build_object(
  'period',to_char(v_period,'YYYY-MM'),
  'asOf',now(),
  'live',v_period=date_trunc('month',v_today)::date,
  'blocks',v_blocks);
END $$;

-- ----------------------------------------------------------------------------
-- 7. The mapping map.
--
-- The member Team tab drew the caller's own branch as an indented list. The
-- portal's chart draws a department as a map — frames, teams, lines — and the
-- user asked for the same thing here: every sub-department, everybody in one,
-- and who reports to whom.
--
-- Names, titles and reporting lines only. A rank is pay-adjacent, so it keeps
-- travelling through member_tree_json for the caller's own branch alone.
-- ----------------------------------------------------------------------------
CREATE FUNCTION public.member_org_map() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
 v_staff uuid:=public.member_staff_id();
 v_today date:=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
 v_department uuid;
 v_departments jsonb;
 v_people jsonb;
BEGIN
 SELECT s.department_id INTO v_department FROM public.hr_staff_costs s WHERE s.id=v_staff;

 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',d.id,'schemeId',c.id,'name',d.name,'code',coalesce(d.code,d.name),
  'capacity',cap.headcount_limit,
  'mine',public.member_has_membership(v_staff,d.id),
  'directors',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',ds.id,'name',ds.employee_name)
    ORDER BY ds.employee_name),'[]'::jsonb)
   FROM public.comm_sub_department_directors dd
   JOIN public.hr_staff_costs ds ON ds.id=dd.staff_id
   WHERE dd.sub_department_id=d.id AND ds.status='active')
 ) ORDER BY d.created_at,d.id),'[]'::jsonb) INTO v_departments
 FROM public.comm_sub_departments d
 JOIN public.comm_schemes c ON c.sub_department_id=d.id AND c.is_active
  AND c.effective_from<=v_today AND (c.effective_to IS NULL OR c.effective_to>=v_today)
 LEFT JOIN public.member_department_capacity cap ON cap.sub_department_id=d.id
 WHERE d.is_active AND d.department_id=v_department;

 -- One node per MEMBERSHIP, not per person: somebody in Fair and IR stands in
 -- both frames, under a different upline and a different title in each.
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',c.id||':'||h.staff_id,'staffId',h.staff_id,'departmentId',d.id,'schemeId',c.id,
  'name',s.employee_name,'code',s.employee_code,
  'title',coalesce(t.name,'Title not configured'),
  'parentId',CASE WHEN h.upline_staff_id IS NOT NULL THEN c.id||':'||h.upline_staff_id END,
  'self',h.staff_id=v_staff,
  'mine',public.member_has_membership(v_staff,d.id)
 ) ORDER BY s.employee_name),'[]'::jsonb) INTO v_people
 FROM public.comm_hierarchy h
 JOIN public.comm_schemes c ON c.id=h.scheme_id AND c.is_active
  AND c.effective_from<=v_today AND (c.effective_to IS NULL OR c.effective_to>=v_today)
 JOIN public.comm_sub_departments d ON d.id=c.sub_department_id AND d.is_active
  AND d.department_id=v_department
 JOIN public.hr_staff_costs s ON s.id=h.staff_id AND s.status='active'
 LEFT JOIN public.titles t ON t.id=h.title_id
 WHERE h.effective_from<=v_today AND (h.effective_to IS NULL OR h.effective_to>=v_today);

 RETURN jsonb_build_object('asOf',now(),
  'departments',coalesce(v_departments,'[]'::jsonb),
  'people',coalesce(v_people,'[]'::jsonb));
END $$;
COMMENT ON FUNCTION public.member_org_map() IS
 'Every sub-department of the caller''s department and everybody placed in one, as a chart needs them: membership-scoped id, name, title, upline. No pay of any kind.';

-- ----------------------------------------------------------------------------
-- 8. Grants. The scoreboard and the two boards are internal to the snapshot.
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION
 public.member_scoreboard(uuid,date),
 public.member_department_board(uuid,date),
 public.member_downline_board(uuid,uuid,date),
 public.member_insight_orders(uuid,uuid,date),
 public.member_insight_snapshot(text),
 public.member_org_map()
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.member_insight_snapshot(text),public.member_org_map() TO authenticated;
