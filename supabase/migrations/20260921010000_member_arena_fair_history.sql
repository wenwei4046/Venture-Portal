-- ═══════════════════════════════════════════════════════════════════════════
-- The Arena's Fair results, now that the portal owns a fair calendar
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Until today the Arena's "Championship & Fair results" page said plainly that
-- fair history was NOT CONNECTED: weekly finishes need each fair's venue and
-- its start and end dates, and an order date beside a branch label cannot
-- identify a completed fair. `20260920050000_the_fair_sets_the_month` gave
-- `comm_venue_events` a `start_date`/`end_date` and stamps every bill with
-- `sales_orders.fair_event_id` by trigger, so a finish at a fair is now a fact
-- the portal holds rather than something a screen would have to infer.
--
-- PROVISIONAL, AND THE BOARD SAYS SO. A recorded sale is not attendance.
-- Somebody who worked a fair and sold nothing looks exactly like somebody who
-- was never there, and a bill nothing could place is missing information
-- rather than a zero. Nothing here settles a result or awards a point; the
-- snapshot carries `provisional` and the count of bills still unplaced so the
-- reader can see how much of the picture is missing.
--
-- SCOPE IS THE ARENA'S SCOPE. The same roster, the same latest-committed
-- document per order_no, the same deposit gate and the same commissionable
-- line definition as `member_arena_for_staff` — a fair's sales have to agree
-- with the month's sales, or the two boards argue with each other. Names,
-- sales and finishes only: no peer pay, no cost, no per-product detail.
--
-- ROLLBACK
--   DROP FUNCTION member_principal_arena_history(uuid,uuid);
--   DROP FUNCTION member_arena_history(uuid);
--   DROP FUNCTION member_arena_history_for_staff(uuid,uuid);

CREATE FUNCTION public.member_arena_history_for_staff(p_sub_department uuid,p_scheme uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_today date:=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_current date:=date_trunc('month',v_today)::date;
  v_result jsonb;
BEGIN
  WITH roster AS (
    SELECT DISTINCT s.id,s.employee_name AS name FROM comm_hierarchy h
    JOIN hr_staff_costs s ON s.id=h.staff_id
    LEFT JOIN titles t ON t.id=h.title_id LEFT JOIN titles st ON st.id=s.title_id
    WHERE h.scheme_id=p_scheme AND s.status='active'
      AND h.effective_from<=v_today AND (h.effective_to IS NULL OR h.effective_to>=v_today)
      AND NOT coalesce(t.is_department_head,false) AND NOT coalesce(st.is_department_head,false)
  ), sources AS (
    -- A document may be repeated by imports. Choose its latest committed source
    -- within this department once, rather than summing duplicate snapshots.
    SELECT DISTINCT ON (so.order_no) so.* FROM sales_orders so
    JOIN sales_import_batches ib ON ib.id=so.batch_id
    WHERE ib.sub_department_id=p_sub_department AND ib.status='committed' AND so.period_month<=v_current
    ORDER BY so.order_no,so.created_at DESC,so.id
  ), scoped AS (
    SELECT so.*,c.enable_kpi,coalesce(r.period_month,v_current) AS recognition_month,
      r.id IS NOT NULL OR c.deposit_threshold_pct IS NULL OR so.order_total<=0
        OR so.paid_amount+0.005>=round(so.order_total*c.deposit_threshold_pct,2) AS cleared
    FROM sources so JOIN comm_schemes c ON c.id=p_scheme
    LEFT JOIN comm_order_releases r ON r.order_no=so.order_no AND r.sub_department_id=p_sub_department
    WHERE NOT so.cancelled AND so.order_date<=v_today AND so.staff_id IN (SELECT id FROM roster)
  ), line_scope AS (
    SELECT o.id,o.staff_id,o.fair_event_id,o.cleared,l.line_amount,
      EXISTS(SELECT 1 FROM comm_item_groups g WHERE g.scheme_id=p_scheme
        AND upper(btrim(g.item_group))=upper(btrim(l.item_group)) AND g.commissionable) AS is_goods,
      o.enable_kpi AND EXISTS(SELECT 1 FROM comm_kpi_items k WHERE k.scheme_id=p_scheme
        AND upper(btrim(k.product_code))=upper(btrim(l.product_code))
        AND k.effective_from<=(o.recognition_month+interval '1 month - 1 day')::date
        AND (k.effective_to IS NULL OR k.effective_to>=(o.recognition_month+interval '1 month - 1 day')::date)) AS is_kpi
    FROM scoped o JOIN sales_order_lines l ON l.order_id=o.id
  ), order_facts AS (
    SELECT l.id,l.staff_id,l.fair_event_id,l.cleared,sum(l.line_amount) AS revenue
    FROM line_scope l WHERE l.is_goods OR l.is_kpi
    GROUP BY l.id,l.staff_id,l.fair_event_id,l.cleared
  ), fairs AS (
    -- A fair still open has no finish yet, and an undated calendar row is a
    -- place somebody has not told the portal the dates of.
    SELECT e.id,coalesce(nullif(btrim(v.display_name),''),e.venue_key) AS venue,
      e.start_date,e.end_date,e.period_month
    FROM comm_venue_events e LEFT JOIN comm_venues v ON v.venue_key=e.venue_key
    WHERE e.start_date IS NOT NULL AND e.end_date IS NOT NULL AND e.end_date<=v_today
  ), fair_people AS (
    SELECT f.id AS event_id,p.id AS staff_id,p.name,
      coalesce(sum(o.revenue) FILTER(WHERE o.cleared),0) AS sales,
      coalesce(sum(o.revenue) FILTER(WHERE NOT o.cleared),0) AS held,
      count(*) FILTER(WHERE o.cleared) AS orders
    FROM fairs f JOIN order_facts o ON o.fair_event_id=f.id JOIN roster p ON p.id=o.staff_id
    GROUP BY f.id,p.id,p.name
  ), events AS (
    SELECT f.id,f.venue,f.start_date,f.end_date,f.period_month,
      jsonb_agg(jsonb_build_object('id',fp.staff_id,'name',fp.name,
        'sales',fp.sales,'held',fp.held,'orders',fp.orders) ORDER BY fp.name,fp.staff_id) AS people
    FROM fairs f JOIN fair_people fp ON fp.event_id=f.id
    GROUP BY f.id,f.venue,f.start_date,f.end_date,f.period_month
  ), loose AS (
    -- What no fair could claim. Reported, never spread over the fairs that did.
    SELECT count(*) AS orders,coalesce(sum(o.revenue),0) AS sales
    FROM order_facts o WHERE o.fair_event_id IS NULL AND o.cleared
  )
  SELECT jsonb_build_object(
    'asOf',now(),'provisional',true,
    'events',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'venue',e.venue,
      'start',e.start_date,'end',e.end_date,'periodMonth',to_char(e.period_month,'YYYY-MM'),
      'people',e.people) ORDER BY e.end_date,e.start_date,e.id) FROM events e),'[]'::jsonb),
    'unassignedOrders',(SELECT orders FROM loose),
    'unassignedSales',(SELECT sales FROM loose),
    'championship',jsonb_build_object('status','pending',
      'reason','Championship totals need every ranking source and a settled scoring ledger. Fair finishes stand on their own until then.'))
  INTO v_result;
  RETURN v_result;
END $$;

-- Employee entry point: own active membership, the existing Arena boundary.
CREATE FUNCTION public.member_arena_history(p_sub_department uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  RETURN public.member_arena_history_for_staff(p_sub_department,public.member_arena_scheme(p_sub_department));
END $$;

-- Principal read context: the selected staff authorizes the read and is never
-- a changed session claim. The board itself is the department's, as it is for
-- the member — a Principal sees no more of it than the member does.
CREATE FUNCTION public.member_principal_arena_history(p_staff uuid,p_sub_department uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  RETURN public.member_arena_history_for_staff(p_sub_department,public.member_principal_context(p_staff,p_sub_department));
END $$;

REVOKE ALL ON FUNCTION public.member_arena_history_for_staff(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.member_arena_history(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.member_principal_arena_history(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.member_arena_history(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.member_principal_arena_history(uuid,uuid) TO authenticated;

COMMENT ON FUNCTION public.member_arena_history_for_staff(uuid,uuid) IS
  'Completed-fair results for one Revenue sub-department, from comm_venue_events dates and sales_orders.fair_event_id. Same roster, committed sources, deposit gate and commissionable lines as member_arena_for_staff. Provisional: a sale is not attendance, and unplaced bills are reported rather than spread.';
COMMENT ON FUNCTION public.member_arena_history(uuid) IS
  'Authenticated member Fair results, own active membership only. Names, fair sales and finishes; no peer pay, cost or product detail, no awarded points.';
COMMENT ON FUNCTION public.member_principal_arena_history(uuid,uuid) IS
  'Principal read context only. The selected staff authorizes the read; the board is the same department board the member sees.';
