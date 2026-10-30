-- sales_order_bill_ref(p_order_no text, p_customer_so_no text) — production body md5 0b60d489d61e938c9799081ae7aa5f82
CREATE OR REPLACE FUNCTION public.sales_order_bill_ref(p_order_no text, p_customer_so_no text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
    SELECT COALESCE(
        UPPER(REGEXP_REPLACE(SUBSTRING(p_customer_so_no FROM '[A-Za-z]{2,4}\s*-?\s*[0-9]{3,}'), '[\s-]', '', 'g')),
        UPPER(REGEXP_REPLACE(BTRIM(p_order_no), '\s', '', 'g')));
$function$;

-- sales_order_ref_no(p_header jsonb) — production body md5 b5347a21721ef276f3584cdd5948741c
CREATE OR REPLACE FUNCTION public.sales_order_ref_no(p_header jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
    SELECT COALESCE(NULLIF(BTRIM(p_header->>'customer_so_no'), ''),
                    NULLIF(BTRIM(p_header->>'ref'), ''));
$function$;

-- revenue_possible_double_claims(p_sub_department_id uuid) — production body md5 cc5daca124a33c2a4487f63415f39648
CREATE OR REPLACE FUNCTION public.revenue_possible_double_claims(p_sub_department_id uuid)
 RETURNS TABLE(bill_ref text, order_id uuid, order_no text, period_month date, order_date date, staff_id uuid, employee_name text, agent_name text, order_total numeric, source text, paid_by_run boolean, dismissed boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    WITH live AS (
        -- Every bill a run could pay: in its month's committed batch, not
        -- excluded, and worth something (a "refer" document at RM 0 pays nobody).
        -- The paper number is read from the row, not rebuilt from the raw
        -- document for every bill (20260926110000).
        SELECT o.id, o.order_no, o.period_month, o.order_date, o.staff_id, o.agent_name,
               o.order_total, o.source, o.bill_ref AS ref
          FROM sales_orders o
          JOIN sales_import_batches b ON b.id = o.batch_id
         WHERE b.sub_department_id = p_sub_department_id
           AND b.status = 'committed'
           AND NOT o.cancelled
           AND o.order_total > 0
    ), paid AS (
        -- Every bill a run has paid, wherever its row sits now.
        SELECT DISTINCT ON (o.id)
               o.id, o.order_no, r.order_period_month AS period_month, o.order_date, o.staff_id,
               o.agent_name, o.order_total, o.source, o.bill_ref AS ref
          FROM comm_order_releases r
          JOIN comm_runs c ON c.id = r.run_id AND c.status IN ('applied', 'locked')
          JOIN sales_orders o ON o.order_no = r.order_no
          JOIN sales_import_batches b ON b.id = o.batch_id
                                     AND b.sub_department_id = r.sub_department_id
         WHERE r.sub_department_id = p_sub_department_id
         ORDER BY o.id
    ), bills AS (
        SELECT l.id, l.order_no, l.period_month, l.order_date, l.staff_id, l.agent_name,
               l.order_total, l.source, l.ref, (p.id IS NOT NULL) AS paid_by_run
          FROM live l LEFT JOIN paid p ON p.id = l.id
        UNION ALL
        SELECT p.id, p.order_no, p.period_month, p.order_date, p.staff_id, p.agent_name,
               p.order_total, p.source, p.ref, TRUE
          FROM paid p
         WHERE NOT EXISTS (SELECT 1 FROM live l WHERE l.id = p.id)
    ), groups AS (
        SELECT b.ref, ARRAY_AGG(b.id ORDER BY b.id) AS ids
          FROM bills b
         GROUP BY b.ref
        HAVING COUNT(*) > 1
    )
    SELECT b.ref, b.id, b.order_no, b.period_month, b.order_date, b.staff_id, s.employee_name,
           b.agent_name, b.order_total, b.source, b.paid_by_run,
           EXISTS (
               SELECT 1 FROM comm_double_claim_dismissals d
                WHERE d.sub_department_id = p_sub_department_id
                  AND d.bill_ref = b.ref
                  AND d.order_ids @> g.ids
           )
      FROM bills b
      JOIN groups g ON g.ref = b.ref
      LEFT JOIN hr_staff_costs s ON s.id = b.staff_id
     ORDER BY b.ref, b.period_month, b.order_date, b.order_no;
$function$;

-- revenue_dismiss_double_claim(p_sub_department_id uuid, p_bill_ref text, p_note text DEFAULT NULL::text) — production body md5 3f228702e1123d7fd0f64f9e6d3faa4e
CREATE OR REPLACE FUNCTION public.revenue_dismiss_double_claim(p_sub_department_id uuid, p_bill_ref text, p_note text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_ids UUID[];
BEGIN
    -- The group as it stands now, read here rather than trusted from a page.
    SELECT ARRAY_AGG(c.order_id ORDER BY c.order_id) INTO v_ids
      FROM revenue_possible_double_claims(p_sub_department_id) c
     WHERE c.bill_ref = p_bill_ref;
    IF v_ids IS NULL THEN
        RAISE EXCEPTION 'No bills share the number %', p_bill_ref;
    END IF;

    INSERT INTO comm_double_claim_dismissals
        (sub_department_id, bill_ref, order_ids, note, dismissed_by, dismissed_by_name)
    VALUES
        (p_sub_department_id, p_bill_ref, v_ids, NULLIF(BTRIM(p_note), ''), auth.uid(),
         (SELECT u.name FROM users u WHERE u.id = auth.uid()))
    ON CONFLICT (sub_department_id, bill_ref) DO UPDATE
       SET order_ids         = EXCLUDED.order_ids,
           note              = EXCLUDED.note,
           dismissed_by      = EXCLUDED.dismissed_by,
           dismissed_by_name = EXCLUDED.dismissed_by_name,
           dismissed_at      = NOW();

    RETURN CARDINALITY(v_ids);
END;
$function$;

