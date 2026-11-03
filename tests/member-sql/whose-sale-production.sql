-- erp_sync_after_delivery(p_sub_department_id uuid, p_doc_no text, p_order jsonb, p_result jsonb, p_before jsonb) — production body md5 bd437686f00688e1491f47096ca21001
CREATE OR REPLACE FUNCTION public.erp_sync_after_delivery(p_sub_department_id uuid, p_doc_no text, p_order jsonb, p_result jsonb, p_before jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_status TEXT := p_result->>'status';
    v_event  UUID := NULLIF(p_result->>'eventId', '')::UUID;
    v_bill   UUID;
    v_period DATE;
    v_after  JSONB;
BEGIN
    IF p_doc_no IS NULL OR v_status IS NULL OR v_status NOT IN ('applied', 'held') THEN
        RETURN p_result;
    END IF;
    BEGIN
        SELECT o.id, o.period_month INTO v_bill, v_period
          FROM sales_orders o
          JOIN sales_import_batches b ON b.id = o.batch_id AND b.sub_department_id = p_sub_department_id
         WHERE o.order_no = p_doc_no AND o.source = 'erp_sync';
        IF p_before IS NULL AND v_bill IS NULL THEN
            RETURN p_result;
        END IF;
        IF COALESCE((p_order->>'deleted')::BOOLEAN, FALSE) THEN
            v_after := COALESCE(p_before, '{}'::JSONB) || JSONB_BUILD_OBJECT('deleted', TRUE, 'status', 'DELETED', 'commissionable', 0);
        ELSE
            v_after := erp_order_state(p_order, erp_sync_scheme_of(p_sub_department_id));
        END IF;
        IF v_status = 'applied' AND v_bill IS NOT NULL THEN
            PERFORM erp_sync_note_adjustment(v_bill, p_order, v_event);
        END IF;
        PERFORM erp_sync_note_change(p_sub_department_id, p_doc_no, v_bill, v_event, v_status,
                    COALESCE(v_period, NULLIF(p_result->>'periodMonth', '')::DATE),
                    p_before, v_after, NULLIF(p_order->>'snapshotAt', '')::TIMESTAMPTZ);
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'erp_sync_after_delivery(%): %', p_doc_no, SQLERRM;
        IF v_event IS NOT NULL THEN
            UPDATE erp_sync_events
               SET warnings = ARRAY_APPEND(warnings, 'change_trail_failed')
             WHERE id = v_event;
        END IF;
    END;
    RETURN p_result;
END;
$function$;

-- revenue_exclude_order(p_order_id uuid, p_note text DEFAULT NULL::text) — production body md5 7ee04244a6240b640f22f6fefdf5dff9
CREATE OR REPLACE FUNCTION public.revenue_exclude_order(p_order_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_order     sales_orders%ROWTYPE;
    v_sub       UUID;
    v_note      TEXT := NULLIF(BTRIM(COALESCE(p_note, '')), '');
    v_open_bill BOOLEAN;
    v_rank      SMALLINT;
    v_auto      BOOLEAN;
    v_by        UUID;
    v_at        TIMESTAMPTZ;
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

    -- In a month that pays Open Bill, the pick leaves with the bill.
    v_open_bill := comm_open_bill_on(v_sub, v_order.period_month);
    IF v_open_bill THEN
        SELECT t.bill_rank, t.auto_suggested, t.tagged_by, t.tagged_at
          INTO v_rank, v_auto, v_by, v_at
          FROM sales_order_open_bill_tags t
         WHERE t.order_id = p_order_id;
    END IF;

    INSERT INTO sales_order_exclusions (
        order_id, note, open_bill_rank, open_bill_auto, open_bill_tagged_by, open_bill_tagged_at,
        excluded_by, excluded_by_name)
    SELECT p_order_id, v_note, v_rank, v_auto, v_by, v_at, u.id, u.name
      FROM (SELECT 1) one
      LEFT JOIN users u ON u.id = auth.uid();
    -- (sales_order_exclusions_apply has taken the bill out.)

    IF v_rank IS NOT NULL THEN
        DELETE FROM sales_order_open_bill_tags WHERE order_id = p_order_id;
    END IF;

    IF v_order.source = 'erp_sync' THEN
        -- The rest of the salesperson's day moves up, as when the ERP cancels a bill.
        PERFORM erp_sync_resequence_day(v_order.agent_key, v_order.event_date);
        PERFORM erp_sync_suggest_open_bills(v_order.staff_id, v_order.event_date);
    END IF;
    PERFORM erp_sync_refresh_batch(v_order.batch_id);

    RETURN JSONB_BUILD_OBJECT('orderNo', v_order.order_no, 'changed', TRUE, 'openBillRank', v_rank);
END;
$function$;

-- revenue_include_order(p_order_id uuid) — production body md5 031c10a95cfe299c9ffac48bcf52698b
CREATE OR REPLACE FUNCTION public.revenue_include_order(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_order    sales_orders%ROWTYPE;
    v_sub      UUID;
    v_ex       sales_order_exclusions%ROWTYPE;
    v_auto     BOOLEAN;
    v_n        INTEGER := 0;
BEGIN
    SELECT o.* INTO v_order FROM sales_orders o WHERE o.id = p_order_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'That bill is no longer in the portal. Refresh the page.';
    END IF;
    SELECT b.sub_department_id INTO v_sub FROM sales_import_batches b WHERE b.id = v_order.batch_id;
    PERFORM lock_commission_order_periods(v_sub, ARRAY[v_order.period_month]);

    IF commission_order_period_locked(v_sub, v_order.period_month) THEN
        RAISE EXCEPTION 'The run for % has paid. Reopen it before changing which of its bills count.',
            TO_CHAR(v_order.period_month, 'FMMonth YYYY')
            USING ERRCODE = '23RUN';
    END IF;

    DELETE FROM sales_order_exclusions WHERE order_id = p_order_id RETURNING * INTO v_ex;
    IF NOT FOUND THEN
        RETURN JSONB_BUILD_OBJECT('orderNo', v_order.order_no, 'changed', FALSE, 'counts', NOT v_order.cancelled);
    END IF;
    -- (sales_order_exclusions_apply has handed the bill back to its own verdict.)
    SELECT o.* INTO v_order FROM sales_orders o WHERE o.id = p_order_id;

    IF v_order.source = 'erp_sync' THEN
        PERFORM erp_sync_resequence_day(v_order.agent_key, v_order.event_date);
    END IF;

    -- Its Open Bill pick comes back, unless somebody claimed the rank by hand
    -- meanwhile. A suggestion the feed made while the bill was out gives way.
    IF v_ex.open_bill_rank IS NOT NULL AND NOT v_order.cancelled AND v_order.staff_id IS NOT NULL
       AND comm_open_bill_on(v_sub, v_order.period_month)
       AND NOT EXISTS (SELECT 1 FROM sales_order_open_bill_tags t WHERE t.order_id = p_order_id) THEN
        v_auto := COALESCE(v_ex.open_bill_auto, FALSE);
        DELETE FROM sales_order_open_bill_tags t
         WHERE t.sub_department_id = v_sub
           AND t.staff_id = v_order.staff_id
           AND t.event_date = v_order.event_date
           AND t.bill_rank = v_ex.open_bill_rank
           AND t.auto_suggested;
        INSERT INTO sales_order_open_bill_tags (
            order_id, staff_id, event_date, bill_rank, auto_suggested, tagged_by, tagged_at)
        SELECT p_order_id, v_order.staff_id, v_order.event_date, v_ex.open_bill_rank, v_auto,
               -- Whoever made the pick, while they still have an account.
               (SELECT u.id FROM users u WHERE u.id = v_ex.open_bill_tagged_by),
               COALESCE(v_ex.open_bill_tagged_at, NOW())
        ON CONFLICT DO NOTHING;
        GET DIAGNOSTICS v_n = ROW_COUNT;
    END IF;

    IF v_order.source = 'erp_sync' THEN
        PERFORM erp_sync_suggest_open_bills(v_order.staff_id, v_order.event_date);
    END IF;
    PERFORM erp_sync_refresh_batch(v_order.batch_id);

    RETURN JSONB_BUILD_OBJECT(
        'orderNo', v_order.order_no,
        'changed', TRUE,
        'counts', NOT v_order.cancelled,
        -- Out for another reason all along: counting it by hand cannot bring it in.
        'stillOut', CASE WHEN NOT v_order.cancelled THEN NULL
                         WHEN v_order.excluded_reason = 'ignored_agent' THEN 'its salesperson is not ours'
                         WHEN v_order.erp_on_hold THEN 'it is on hold in the ERP'
                         WHEN v_order.erp_status = 'DELETED' THEN 'it was deleted in the ERP'
                         WHEN v_order.erp_status IS NOT NULL
                             THEN 'it is ' || LOWER(REPLACE(v_order.erp_status, '_', ' ')) || ' in the ERP'
                         ELSE 'it is excluded' END,
        'openBillRank', CASE WHEN v_n > 0 THEN v_ex.open_bill_rank END);
END;
$function$;

-- sales_order_excluded_by_hand(p_order_id uuid) — production body md5 7216ddf2b362a0254079edc04d69f217
CREATE OR REPLACE FUNCTION public.sales_order_excluded_by_hand(p_order_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT EXISTS (SELECT 1 FROM sales_order_exclusions WHERE order_id = p_order_id);
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

