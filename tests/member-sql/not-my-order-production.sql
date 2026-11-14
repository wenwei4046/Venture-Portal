-- member_staff_id() — production body md5 a979898c84f67c45f29ba168cfaf98de
CREATE OR REPLACE FUNCTION public.member_staff_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_perm('member_portal') THEN RAISE EXCEPTION 'Member account access is not enabled' USING ERRCODE='42501'; END IF;
 SELECT s.id INTO v_id FROM public.users u JOIN public.hr_staff_costs s ON s.user_id=u.id
 JOIN public.departments d ON d.id=s.department_id
 WHERE u.id=auth.uid() AND u.is_active AND s.status='active' AND d.payroll_source='commission'
 AND (s.hire_date IS NULL OR s.hire_date<=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)
 AND (s.resignation_date IS NULL OR s.resignation_date>=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date);
 IF v_id IS NULL THEN RAISE EXCEPTION 'No active Revenue staff record is linked to this account' USING ERRCODE='42501'; END IF;
 RETURN v_id;
END $function$;

-- sales_order_excluded_by_hand(uuid) — production body md5 7216ddf2b362a0254079edc04d69f217
CREATE OR REPLACE FUNCTION public.sales_order_excluded_by_hand(p_order_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT EXISTS (SELECT 1 FROM sales_order_exclusions WHERE order_id = p_order_id);
$function$;

-- sales_order_exclusions_guard() — production body md5 668b2cdb68a609f97e0854e345b09a23
CREATE OR REPLACE FUNCTION public.sales_order_exclusions_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_order_id UUID;
    v_sub      UUID;
    v_month    DATE;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_order_id := OLD.order_id;
    ELSE
        v_order_id := NEW.order_id;
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.order_id <> OLD.order_id THEN
        RAISE EXCEPTION 'An exclusion belongs to one bill; take it off and put a new one on';
    END IF;

    SELECT b.sub_department_id, o.period_month INTO v_sub, v_month
      FROM sales_orders o JOIN sales_import_batches b ON b.id = o.batch_id
     WHERE o.id = v_order_id;

    -- Which bills a month counts is what its run paid on. Same refusal as
    -- sharing, recosting or moving a bill of that month.
    IF FOUND AND commission_order_period_locked(v_sub, v_month) THEN
        RAISE EXCEPTION 'The run for % has paid. Reopen it before changing which of its bills count.',
            TO_CHAR(v_month, 'FMMonth YYYY')
            USING ERRCODE = '23RUN';
    END IF;

    -- NOT FOUND on a DELETE: the bill itself went first (ON DELETE CASCADE).
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$function$;

-- sales_order_exclusions_apply() — production body md5 184f8f92c12bc9f51e0d6781865f6989
CREATE OR REPLACE FUNCTION public.sales_order_exclusions_apply()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- sales_orders_manual_exclusion stamps the reason on the way through.
        UPDATE sales_orders
           SET cancelled = TRUE
         WHERE id = NEW.order_id
           AND (NOT cancelled OR excluded_reason IS NULL);
        RETURN NEW;
    END IF;

    -- Back to whatever the document itself says: for a bill the ERP feeds, the
    -- rule ingest_erp_sales_order applies (CANCELLED, DRAFT and a hold earn
    -- nothing; a deletion is DELETED); a file import only ever writes live
    -- bills. sales_orders_ignored_agent takes an ignored salesperson's bill
    -- straight back out, and a bill whose reason is that one is left alone.
    UPDATE sales_orders
       SET cancelled = CASE WHEN source = 'erp_sync'
                            THEN COALESCE(erp_status, '') IN ('CANCELLED', 'DRAFT', 'ON_HOLD', 'DELETED')
                                 OR COALESCE(erp_on_hold, FALSE)
                            ELSE FALSE END,
           excluded_reason = NULL
     WHERE id = OLD.order_id
       AND excluded_reason = 'manual';
    RETURN OLD;
END;
$function$;

-- sales_orders_apply_manual_exclusion() — production body md5 d710c06b20487cbebe24cdd9d4711d1e
CREATE OR REPLACE FUNCTION public.sales_orders_apply_manual_exclusion()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    IF NEW.excluded_reason = 'ignored_agent' THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND sales_order_excluded_by_hand(NEW.id) THEN
        NEW.cancelled := TRUE;
        NEW.excluded_reason := 'manual';
    ELSIF NEW.excluded_reason = 'manual' THEN
        -- Counted again since the row was last written. Whoever did that set
        -- `cancelled` back to the document's own verdict; the stale reason
        -- must not outlive it.
        NEW.excluded_reason := NULL;
    END IF;
    RETURN NEW;
END;
$function$;

-- revenue_exclude_order(uuid,text) — production body md5 fcb2c81ab4ce49553572f1a9fc43b5db
CREATE OR REPLACE FUNCTION public.revenue_exclude_order(p_order_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_order     sales_orders%ROWTYPE;
    v_sub       UUID;
    v_note      TEXT := NULLIF(BTRIM(COALESCE(p_note, '')), '');
BEGIN
    SELECT o.* INTO v_order FROM sales_orders o WHERE o.id = p_order_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'That bill is no longer in the portal. Refresh the page.';
    END IF;
    SELECT b.sub_department_id INTO v_sub FROM sales_import_batches b WHERE b.id = v_order.batch_id;
    -- One writer per month at a time: the lock every write to its orders takes.
    PERFORM lock_commission_order_periods(v_sub, ARRAY[v_order.period_month]);
    SELECT o.* INTO v_order FROM sales_orders o WHERE o.id = p_order_id FOR UPDATE;

    IF commission_order_period_locked(v_sub, v_order.period_month) THEN
        RAISE EXCEPTION 'The run for % has paid. Reopen it before changing which of its bills count.',
            TO_CHAR(v_order.period_month, 'FMMonth YYYY')
            USING ERRCODE = '23RUN';
    END IF;

    IF sales_order_excluded_by_hand(p_order_id) THEN
        -- Already out by hand: saying so again can only change why.
        IF v_note IS NOT NULL THEN
            UPDATE sales_order_exclusions SET note = v_note WHERE order_id = p_order_id;
        END IF;
        RETURN JSONB_BUILD_OBJECT('orderNo', v_order.order_no, 'changed', FALSE);
    END IF;

    IF v_order.cancelled THEN
        RAISE EXCEPTION '% already does not count: %', v_order.order_no,
            CASE WHEN v_order.excluded_reason = 'ignored_agent' THEN 'its salesperson is not ours'
                 WHEN v_order.erp_on_hold THEN 'it is on hold in the ERP'
                 WHEN v_order.erp_status = 'DELETED' THEN 'it was deleted in the ERP'
                 WHEN v_order.erp_status IS NOT NULL
                     THEN 'it is ' || LOWER(REPLACE(v_order.erp_status, '_', ' ')) || ' in the ERP'
                 ELSE 'it is excluded' END
            USING ERRCODE = '23EXC';
    END IF;

    INSERT INTO sales_order_exclusions (
        order_id, note, excluded_by, excluded_by_name)
    SELECT p_order_id, v_note, u.id, u.name
      FROM (SELECT 1) one
      LEFT JOIN users u ON u.id = auth.uid();
    -- (sales_order_exclusions_apply has taken the bill out.)

    IF v_order.source = 'erp_sync' THEN
        -- The rest of the salesperson's day moves up, as when the ERP cancels a bill.
        PERFORM erp_sync_resequence_day(v_order.agent_key, v_order.event_date);
    END IF;
    PERFORM erp_sync_refresh_batch(v_order.batch_id);

    RETURN JSONB_BUILD_OBJECT('orderNo', v_order.order_no, 'changed', TRUE);
END;
$function$;

-- share_request_blocked(uuid) — production body md5 23ded4ba1424897388e56e0c9b52e5e1
CREATE OR REPLACE FUNCTION public.share_request_blocked(p_order uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_month date;
  v_no    text;
  v_sub   uuid;
  v_who   text;
BEGIN
  SELECT so.period_month, so.order_no, b.sub_department_id INTO v_month, v_no, v_sub
    FROM public.sales_orders so JOIN public.sales_import_batches b ON b.id = so.batch_id
   WHERE so.id = p_order;
  IF v_month IS NULL THEN
    RETURN 'That bill is not there any more.';
  END IF;
  IF public.commission_order_period_locked(v_sub, v_month) THEN
    RETURN to_char(v_month, 'Mon YYYY') || ' is in payroll, so who shares ' || v_no || ' cannot change.';
  END IF;
  SELECT string_agg(DISTINCT s.employee_name || '’s ' || to_char(x.period_month, 'Mon YYYY'), ', ') INTO v_who
    FROM public.comm_salesperson_closes x JOIN public.hr_staff_costs s ON s.id = x.staff_id
   WHERE x.reopened_at IS NULL AND x.order_ids && ARRAY[p_order];
  IF v_who IS NOT NULL THEN
    RETURN v_who || ' is closed on Comm Cal, so who shares ' || v_no || ' cannot change until HR reopens it.';
  END IF;  IF EXISTS (SELECT 1 FROM public.sales_order_shares sh JOIN public.sales_orders so ON so.id = sh.order_id
              WHERE sh.order_id = p_order AND sh.staff_id IS DISTINCT FROM so.staff_id) THEN
    RETURN v_no || ' is shared already — HR changes who shares it on Comm Cal.';
  END IF;
  RETURN NULL;
END
$function$;

