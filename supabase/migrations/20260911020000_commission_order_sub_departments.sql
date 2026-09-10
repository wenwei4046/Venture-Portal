-- Orders belong to one sub-department, independently of a person's memberships.
-- The existing Houzs ERP contract always feeds Fair. IR gets separate batches.
-- No live data is silently reassigned: ambiguous historical ownership aborts.

CREATE OR REPLACE FUNCTION public.erp_sync_sub_department()
RETURNS UUID
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
DECLARE v_ids UUID[]; v_id UUID;
BEGIN
    SELECT array_agg(s.id) INTO v_ids
      FROM comm_sub_departments s
      JOIN departments d ON d.id = s.department_id
     WHERE d.payroll_source = 'commission'
       AND (upper(s.code) = 'FAIR' OR lower(s.name) = 'fair');
    IF coalesce(array_length(v_ids, 1), 0) <> 1 THEN
        RAISE EXCEPTION 'ERP order ownership requires exactly one Fair sub-department';
    END IF;
    v_id := v_ids[1];
    IF EXISTS (
        SELECT 1 FROM comm_sub_departments fair
          JOIN comm_sub_departments older ON older.department_id = fair.department_id
         WHERE fair.id = v_id AND older.is_active
           AND (older.created_at, older.id) < (fair.created_at, fair.id)
    ) THEN
        RAISE EXCEPTION 'Fair is not the home sub-department; review ERP ownership before migrating';
    END IF;
    RETURN v_id;
END;
$$;

ALTER TABLE public.sales_import_batches
  ADD COLUMN sub_department_id UUID REFERENCES public.comm_sub_departments(id) ON DELETE RESTRICT;
ALTER TABLE public.comm_order_releases
  ADD COLUMN sub_department_id UUID REFERENCES public.comm_sub_departments(id) ON DELETE RESTRICT;
ALTER TABLE public.sales_order_open_bill_tags
  ADD COLUMN sub_department_id UUID REFERENCES public.comm_sub_departments(id) ON DELETE RESTRICT;
ALTER TABLE public.erp_sync_events
  ADD COLUMN sub_department_id UUID REFERENCES public.comm_sub_departments(id) ON DELETE RESTRICT;

DO $$
DECLARE v_fair UUID := public.erp_sync_sub_department();
BEGIN
    IF EXISTS (SELECT 1 FROM comm_runs WHERE batch_id IS NOT NULL AND sub_department_id <> v_fair)
       OR EXISTS (
           SELECT 1 FROM comm_order_releases r JOIN comm_runs c ON c.id = r.run_id
            WHERE c.sub_department_id <> v_fair
       ) THEN
        RAISE EXCEPTION 'Historical non-Fair runs reference department-wide sales. Review ownership before migration';
    END IF;
    UPDATE sales_import_batches SET sub_department_id = v_fair;
    UPDATE comm_order_releases r SET sub_department_id = c.sub_department_id
      FROM comm_runs c WHERE c.id = r.run_id;
    UPDATE sales_order_open_bill_tags t SET sub_department_id = b.sub_department_id
      FROM sales_orders o JOIN sales_import_batches b ON b.id = o.batch_id
     WHERE o.id = t.order_id;
    UPDATE erp_sync_events SET sub_department_id = v_fair;
END;
$$;

ALTER TABLE public.sales_import_batches ALTER COLUMN sub_department_id SET NOT NULL;
ALTER TABLE public.comm_order_releases ALTER COLUMN sub_department_id SET NOT NULL;
ALTER TABLE public.sales_order_open_bill_tags ALTER COLUMN sub_department_id SET NOT NULL;
ALTER TABLE public.erp_sync_events
  ALTER COLUMN sub_department_id SET NOT NULL,
  ALTER COLUMN sub_department_id SET DEFAULT public.erp_sync_sub_department();

DROP INDEX public.uq_sales_batch_committed_per_period;
CREATE UNIQUE INDEX uq_sales_batch_committed_per_sub_period
  ON public.sales_import_batches(sub_department_id, period_month) WHERE status = 'committed';
CREATE INDEX idx_sales_batch_sub_period
  ON public.sales_import_batches(sub_department_id, period_month, status);
ALTER TABLE public.comm_order_releases DROP CONSTRAINT comm_order_releases_order_no_key;
ALTER TABLE public.comm_order_releases
  ADD CONSTRAINT uq_comm_release_per_sub_order UNIQUE(sub_department_id, order_no);
ALTER TABLE public.sales_order_open_bill_tags DROP CONSTRAINT uq_bill_rank_per_staff_day;
ALTER TABLE public.sales_order_open_bill_tags
  ADD CONSTRAINT uq_bill_rank_per_sub_staff_day UNIQUE(sub_department_id, staff_id, event_date, bill_rank);
CREATE INDEX idx_erp_sync_events_sub_received
  ON public.erp_sync_events(sub_department_id, received_at DESC);

COMMENT ON COLUMN public.sales_import_batches.sub_department_id IS
  'The programme that owns every order in this batch. Existing sales and the Houzs ERP feed belong to Fair.';
COMMENT ON TABLE public.comm_order_releases IS
  'Paid order identities are unique within a sub-department across imports and periods. Different programmes may use the same document number.';

-- A settled carry-forward release also protects the order's original period.
CREATE OR REPLACE FUNCTION public.commission_order_period_locked(p_sub_department_id UUID, p_period DATE)
RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1 FROM comm_runs
         WHERE sub_department_id = p_sub_department_id AND period_month = p_period
           AND status IN ('applied', 'locked')
    ) OR EXISTS (
        SELECT 1 FROM comm_order_releases r JOIN comm_runs c ON c.id = r.run_id
         WHERE r.sub_department_id = p_sub_department_id AND r.order_period_month = p_period
           AND c.status IN ('applied', 'locked')
    );
$$;

CREATE OR REPLACE FUNCTION public.erp_sync_period_locked(p_period DATE)
RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path = public AS $$
    SELECT commission_order_period_locked(erp_sync_sub_department(), p_period);
$$;

CREATE OR REPLACE FUNCTION public.lock_commission_order_periods(p_sub_department_id UUID, p_periods DATE[])
RETURNS VOID LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_period DATE;
BEGIN
    FOR v_period IN SELECT DISTINCT d FROM unnest(p_periods) d WHERE d IS NOT NULL ORDER BY d LOOP
        PERFORM pg_advisory_xact_lock(hashtext('commission_orders:' || p_sub_department_id || ':' || v_period));
    END LOOP;
END;
$$;

-- Ownership is immutable once a batch exists. 'erp_sync' is the existing
-- Fair endpoint, never an untrusted field an IR feed may choose for itself.
CREATE OR REPLACE FUNCTION public.guard_commission_batch_scope()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM lock_commission_order_periods(OLD.sub_department_id, ARRAY[OLD.period_month]);
        IF commission_order_period_locked(OLD.sub_department_id, OLD.period_month) THEN
            RAISE EXCEPTION 'These sales have an applied commission run; reopen it before deleting their batch';
        END IF;
        RETURN OLD;
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.sub_department_id IS DISTINCT FROM OLD.sub_department_id THEN
        RAISE EXCEPTION 'An import batch cannot change sub-department';
    END IF;
    IF TG_OP = 'UPDATE' AND (NEW.period_month IS DISTINCT FROM OLD.period_month
                            OR NEW.source IS DISTINCT FROM OLD.source) THEN
        RAISE EXCEPTION 'An import batch cannot change source or month';
    END IF;
    IF NEW.source = 'erp_sync' AND NEW.sub_department_id <> erp_sync_sub_department() THEN
        RAISE EXCEPTION 'The Houzs ERP feed belongs to Fair';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status = 'committed' AND NEW.status <> OLD.status THEN
        PERFORM lock_commission_order_periods(OLD.sub_department_id, ARRAY[OLD.period_month]);
        IF commission_order_period_locked(OLD.sub_department_id, OLD.period_month) THEN
            RAISE EXCEPTION 'These sales have an applied commission run; reopen it before retiring their batch';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER sales_import_batches_scope
  BEFORE INSERT OR UPDATE OR DELETE ON public.sales_import_batches
  FOR EACH ROW EXECUTE FUNCTION public.guard_commission_batch_scope();

-- Direct table writes use the same guard as the human and machine paths.
-- This also protects carried-forward orders after a later run released them.
CREATE OR REPLACE FUNCTION public.guard_commission_order_scope()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_batch sales_import_batches%ROWTYPE; v_old sales_import_batches%ROWTYPE;
BEGIN
    IF TG_OP <> 'INSERT' THEN
        SELECT * INTO v_old FROM sales_import_batches WHERE id = OLD.batch_id;
        -- A guarded parent-batch delete cascades after its row has gone.
        IF NOT FOUND AND TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        IF NOT FOUND THEN RAISE EXCEPTION 'Sales order batch not found'; END IF;
    END IF;
    IF TG_OP <> 'DELETE' THEN
        SELECT * INTO STRICT v_batch FROM sales_import_batches WHERE id = NEW.batch_id;
        IF NEW.period_month <> v_batch.period_month OR NEW.source <> v_batch.source THEN
            RAISE EXCEPTION 'Sales order source and month must match its batch';
        END IF;
        IF TG_OP = 'UPDATE' AND v_old.sub_department_id <> v_batch.sub_department_id THEN
            RAISE EXCEPTION 'A sales order cannot change sub-department';
        END IF;
    END IF;
    PERFORM lock_commission_order_periods(coalesce(v_batch.sub_department_id, v_old.sub_department_id),
        ARRAY[v_batch.period_month, v_old.period_month]);
    IF (TG_OP <> 'INSERT' AND commission_order_period_locked(v_old.sub_department_id, v_old.period_month))
       OR (TG_OP <> 'DELETE' AND commission_order_period_locked(v_batch.sub_department_id, v_batch.period_month)) THEN
        RAISE EXCEPTION 'These sales have an applied commission run; reopen it before changing orders';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER sales_orders_commission_scope
  BEFORE INSERT OR UPDATE OR DELETE ON public.sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_commission_order_scope();

CREATE OR REPLACE FUNCTION public.guard_commission_order_child()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_order RECORD; v_ids UUID[];
BEGIN
    IF TG_OP = 'INSERT' THEN v_ids := ARRAY[NEW.order_id];
    ELSIF TG_OP = 'DELETE' THEN v_ids := ARRAY[OLD.order_id];
    ELSE v_ids := ARRAY[NEW.order_id, OLD.order_id]; END IF;
    FOR v_order IN
        SELECT DISTINCT b.sub_department_id, o.period_month
          FROM sales_orders o JOIN sales_import_batches b ON b.id = o.batch_id
         WHERE o.id = ANY(v_ids) ORDER BY b.sub_department_id, o.period_month
    LOOP
        PERFORM lock_commission_order_periods(v_order.sub_department_id, ARRAY[v_order.period_month]);
        IF commission_order_period_locked(v_order.sub_department_id, v_order.period_month) THEN
            RAISE EXCEPTION 'These sales have an applied commission run; reopen it before changing order inputs';
        END IF;
    END LOOP;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER sales_order_lines_commission_scope
  BEFORE INSERT OR UPDATE OR DELETE ON public.sales_order_lines
  FOR EACH ROW EXECUTE FUNCTION public.guard_commission_order_child();
CREATE TRIGGER sales_order_tags_commission_scope
  BEFORE INSERT OR UPDATE OR DELETE ON public.sales_order_open_bill_tags
  FOR EACH ROW EXECUTE FUNCTION public.guard_commission_order_child();

CREATE OR REPLACE FUNCTION public.guard_commission_release_scope()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_sub UUID;
BEGIN
    SELECT sub_department_id INTO STRICT v_sub FROM comm_runs WHERE id = NEW.run_id;
    IF NEW.sub_department_id IS NOT NULL AND NEW.sub_department_id <> v_sub THEN
        RAISE EXCEPTION 'Order release does not belong to its run sub-department';
    END IF;
    NEW.sub_department_id := v_sub;
    RETURN NEW;
END;
$$;
CREATE TRIGGER comm_order_releases_scope
  BEFORE INSERT OR UPDATE ON public.comm_order_releases
  FOR EACH ROW EXECUTE FUNCTION public.guard_commission_release_scope();

CREATE OR REPLACE FUNCTION public.guard_open_bill_scope()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_sub UUID; v_staff UUID; v_event DATE;
BEGIN
    SELECT b.sub_department_id, o.staff_id, o.event_date INTO STRICT v_sub, v_staff, v_event
      FROM sales_orders o JOIN sales_import_batches b ON b.id = o.batch_id WHERE o.id = NEW.order_id;
    IF NEW.sub_department_id IS NOT NULL AND NEW.sub_department_id <> v_sub THEN
        RAISE EXCEPTION 'Open Bill tag does not belong to its order sub-department';
    END IF;
    IF NEW.staff_id IS DISTINCT FROM v_staff OR NEW.event_date IS DISTINCT FROM v_event THEN
        RAISE EXCEPTION 'Open Bill tag must match its order salesperson and event date';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM comm_schemes WHERE sub_department_id = v_sub
                    AND is_active AND effective_to IS NULL AND enable_open_bill) THEN
        RAISE EXCEPTION 'Open Bill is disabled for this sub-department';
    END IF;
    NEW.sub_department_id := v_sub;
    RETURN NEW;
END;
$$;
CREATE TRIGGER sales_order_open_bill_tags_scope
  BEFORE INSERT OR UPDATE ON public.sales_order_open_bill_tags
  FOR EACH ROW EXECUTE FUNCTION public.guard_open_bill_scope();

-- Guard the save/apply boundary without replacing save_commission_run's
-- statement mapping (the IR package migration extends that mapping separately).
CREATE OR REPLACE FUNCTION public.guard_commission_run_scope()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM comm_schemes s WHERE s.id = NEW.scheme_id
                    AND s.sub_department_id = NEW.sub_department_id) THEN
        RAISE EXCEPTION 'Commission run scheme belongs to another sub-department';
    END IF;
    IF NEW.batch_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM sales_import_batches b WHERE b.id = NEW.batch_id
          AND b.sub_department_id = NEW.sub_department_id AND b.period_month = NEW.period_month
    ) THEN
        RAISE EXCEPTION 'Commission run batch belongs to another sub-department or month';
    END IF;
    IF NEW.status IN ('computed', 'applied') THEN
        IF NEW.batch_id IS NULL OR NOT EXISTS (SELECT 1 FROM sales_import_batches
              WHERE id = NEW.batch_id AND status = 'committed') THEN
            RAISE EXCEPTION 'Commission run requires its current committed batch; recompute after re-import';
        END IF;
        IF EXISTS (
            SELECT 1 FROM jsonb_array_elements(coalesce(NEW.released_orders, '[]')) r
            LEFT JOIN sales_orders o ON o.id = (r->>'order_id')::UUID
            LEFT JOIN sales_import_batches b ON b.id = o.batch_id
            WHERE o.id IS NULL OR b.sub_department_id <> NEW.sub_department_id
               OR b.status <> 'committed' OR o.period_month > NEW.period_month
               OR o.order_no IS DISTINCT FROM r->>'order_no'
               OR o.period_month IS DISTINCT FROM (r->>'order_period_month')::DATE
               OR o.staff_id IS DISTINCT FROM (r->>'staff_id')::UUID OR o.cancelled
        ) THEN
            RAISE EXCEPTION 'Run contains a foreign, changed or retired order; recompute this sub-department';
        END IF;
        IF EXISTS (
            SELECT 1 FROM (
                SELECT r->>'orderId' AS order_id FROM jsonb_array_elements(coalesce(NEW.deferred_orders, '[]')) r
                UNION ALL
                SELECT r->>'orderId' AS order_id FROM jsonb_array_elements(coalesce(NEW.penalised_orders, '[]')) r
            ) snapshot
            LEFT JOIN sales_orders o ON o.id = snapshot.order_id::UUID
            LEFT JOIN sales_import_batches b ON b.id = o.batch_id
            WHERE o.id IS NULL OR b.sub_department_id <> NEW.sub_department_id
               OR b.status <> 'committed' OR o.period_month > NEW.period_month
        ) THEN
            RAISE EXCEPTION 'Run deferred or penalised snapshot contains a foreign or retired order';
        END IF;
        IF EXISTS (
            SELECT 1 FROM comm_statement_lines l
            JOIN comm_statements s ON s.id = l.statement_id
            JOIN sales_orders o ON o.id = l.source_order_id
            JOIN sales_import_batches b ON b.id = o.batch_id
            WHERE s.run_id = NEW.id AND b.sub_department_id <> NEW.sub_department_id
        ) THEN
            RAISE EXCEPTION 'Statement line references an order from another sub-department';
        END IF;
        IF EXISTS (
            SELECT 1 FROM comm_statement_lines l
            JOIN comm_statements s ON s.id = l.statement_id
            JOIN sales_order_lines line ON line.id = l.source_line_id
            JOIN sales_orders o ON o.id = line.order_id
            JOIN sales_import_batches b ON b.id = o.batch_id
            WHERE s.run_id = NEW.id AND (b.sub_department_id <> NEW.sub_department_id
              OR (l.source_order_id IS NOT NULL AND l.source_order_id <> o.id))
        ) THEN
            RAISE EXCEPTION 'Statement trace references a foreign or mismatched order line';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER comm_runs_order_scope
  BEFORE INSERT OR UPDATE ON public.comm_runs
  FOR EACH ROW EXECUTE FUNCTION public.guard_commission_run_scope();

-- File rows are staged in a draft batch. Replacing the committed batch is one
-- transaction, so a failed upload does not retire the previous good import.
CREATE OR REPLACE FUNCTION public.commit_sales_import_batch(p_batch_id UUID, p_suggest_open_bills BOOLEAN DEFAULT TRUE)
RETURNS INTEGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_batch sales_import_batches%ROWTYPE; v_open_bill BOOLEAN; v_suggested INTEGER := 0;
BEGIN
    IF current_user_role() NOT IN ('principal', 'hr') THEN
        RAISE EXCEPTION 'Only Principal or HR may commit a sales import';
    END IF;
    SELECT * INTO STRICT v_batch FROM sales_import_batches WHERE id = p_batch_id FOR UPDATE;
    PERFORM pg_advisory_xact_lock(hashtext('commission_orders:' || v_batch.sub_department_id || ':' || v_batch.period_month));
    IF v_batch.source <> 'file' OR v_batch.status <> 'draft' THEN
        RAISE EXCEPTION 'Only a draft file import can be committed';
    END IF;
    IF commission_order_period_locked(v_batch.sub_department_id, v_batch.period_month) THEN
        RAISE EXCEPTION 'These sales have an applied commission run; reopen it before re-importing';
    END IF;
    IF EXISTS (SELECT 1 FROM sales_import_batches WHERE sub_department_id = v_batch.sub_department_id
                 AND period_month = v_batch.period_month AND status = 'committed' AND source = 'erp_sync') THEN
        RAISE EXCEPTION 'This sub-department month is fed live from the ERP';
    END IF;
    IF EXISTS (SELECT 1 FROM sales_orders WHERE batch_id = p_batch_id AND period_month <> v_batch.period_month) THEN
        RAISE EXCEPTION 'An import contains orders from another month';
    END IF;
    UPDATE sales_import_batches SET status = 'superseded', superseded_at = now()
     WHERE sub_department_id = v_batch.sub_department_id AND period_month = v_batch.period_month
       AND status = 'committed';
    UPDATE sales_import_batches SET status = 'committed' WHERE id = p_batch_id;

    SELECT enable_open_bill INTO v_open_bill FROM comm_schemes
     WHERE sub_department_id = v_batch.sub_department_id AND is_active AND effective_to IS NULL;
    -- Retired imports must not reserve the day's bill ranks forever. Preserve
    -- human picks when the replacement still names the same salesperson/day.
    WITH previous AS (
        DELETE FROM sales_order_open_bill_tags t USING sales_orders o, sales_import_batches b
         WHERE t.order_id = o.id AND o.batch_id = b.id
           AND b.sub_department_id = v_batch.sub_department_id
           AND b.period_month = v_batch.period_month AND b.id <> p_batch_id
        RETURNING o.order_no, t.staff_id, t.event_date, t.bill_rank, t.auto_suggested, t.tagged_by, t.tagged_at
    )
    INSERT INTO sales_order_open_bill_tags(order_id, staff_id, event_date, bill_rank, auto_suggested, tagged_by, tagged_at)
    SELECT o.id, o.staff_id, o.event_date, p.bill_rank, FALSE, p.tagged_by, p.tagged_at
      FROM previous p JOIN sales_orders o ON o.batch_id = p_batch_id AND o.order_no = p.order_no
     WHERE v_open_bill AND NOT p.auto_suggested AND NOT o.cancelled
       AND o.staff_id = p.staff_id AND o.event_date = p.event_date
    ON CONFLICT DO NOTHING;

    IF p_suggest_open_bills AND v_open_bill THEN
        INSERT INTO sales_order_open_bill_tags(order_id, staff_id, event_date, bill_rank, auto_suggested, tagged_by)
        SELECT o.id, o.staff_id, o.event_date, o.sequence_in_day, TRUE, auth.uid()
          FROM sales_orders o WHERE o.batch_id = p_batch_id AND NOT o.cancelled
           AND o.staff_id IS NOT NULL AND o.sequence_in_day BETWEEN 1 AND 3
        ON CONFLICT DO NOTHING;
        GET DIAGNOSTICS v_suggested = ROW_COUNT;
    END IF;
    RETURN v_suggested;
END;
$$;
REVOKE ALL ON FUNCTION public.commit_sales_import_batch(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commit_sales_import_batch(UUID, BOOLEAN) TO authenticated;


-- Existing atomic ERP ingest, now routed to Fair and scoped by batch owner.
CREATE OR REPLACE FUNCTION erp_sync_suggest_open_bills(p_staff_id UUID, p_event_date DATE)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    n INTEGER := 0;
BEGIN
    IF p_staff_id IS NULL OR p_event_date IS NULL OR NOT EXISTS (
        SELECT 1 FROM comm_schemes WHERE sub_department_id = erp_sync_sub_department()
          AND is_active AND effective_to IS NULL AND enable_open_bill
    ) THEN
        RETURN 0;
    END IF;

    DELETE FROM sales_order_open_bill_tags t
     USING sales_orders o
     WHERE t.order_id = o.id
       AND t.staff_id = p_staff_id AND t.event_date = p_event_date
       AND t.auto_suggested AND o.source = 'erp_sync'
       AND NOT erp_sync_period_locked(o.period_month);

    INSERT INTO sales_order_open_bill_tags (order_id, staff_id, event_date, bill_rank, auto_suggested)
    SELECT o.id, p_staff_id, p_event_date, o.sequence_in_day, TRUE
      FROM sales_orders o
     WHERE o.source = 'erp_sync' AND o.staff_id = p_staff_id
       AND o.event_date = p_event_date AND NOT o.cancelled
       AND NOT erp_sync_period_locked(o.period_month)
       AND o.sequence_in_day BETWEEN 1 AND 3
       AND NOT EXISTS (SELECT 1 FROM sales_order_open_bill_tags h WHERE h.order_id = o.id)
       AND NOT EXISTS (
           SELECT 1 FROM sales_order_open_bill_tags h
            WHERE h.sub_department_id = erp_sync_sub_department()
              AND h.staff_id = p_staff_id AND h.event_date = p_event_date
              AND h.bill_rank = o.sequence_in_day);
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION ingest_erp_sales_order(p_order JSONB, p_replay_of UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_sub_id        UUID := erp_sync_sub_department();
    v_doc_no        TEXT := NULLIF(BTRIM(p_order->>'docNo'), '');
    v_snapshot      TIMESTAMPTZ := NULLIF(p_order->>'snapshotAt', '')::TIMESTAMPTZ;
    v_deleted       BOOLEAN := COALESCE((p_order->>'deleted')::BOOLEAN, FALSE);
    v_status        TEXT := UPPER(COALESCE(NULLIF(BTRIM(p_order->>'status'), ''), 'CONFIRMED'));
    v_on_hold       BOOLEAN := COALESCE((p_order->>'onHold')::BOOLEAN, FALSE);
    v_order_date    DATE := NULLIF(p_order->>'orderDate', '')::DATE;
    v_period        DATE;
    v_existing      sales_orders%ROWTYPE;
    v_found         BOOLEAN := FALSE;
    v_batch_id      UUID;
    v_batch_source  TEXT;
    v_agent_name    TEXT;
    v_agent_key     TEXT;
    v_sp_id         TEXT := NULLIF(BTRIM(p_order->>'salespersonId'), '');
    v_staff_id      UUID;
    v_brand         TEXT;
    v_line_brand    TEXT;
    v_total         NUMERIC(15, 2) := COALESCE((p_order->>'total')::NUMERIC, 0);
    v_balance       NUMERIC(15, 2) := NULLIF(p_order->>'balance', '')::NUMERIC;
    v_excluded      BOOLEAN;
    v_event_date    DATE;
    v_order_id      UUID;
    v_warnings      TEXT[] := '{}';
    v_lines         JSONB := COALESCE(p_order->'lines', '[]'::JSONB);
    v_line          JSONB;
    v_line_no       INTEGER := 0;
    v_no_cost       INTEGER := 0;
    v_no_brand      INTEGER := 0;
    v_by_brand      JSONB := '{}'::JSONB;
    v_item_code     TEXT;
    v_qty           NUMERIC;
    v_amount        NUMERIC;
    v_cost          NUMERIC;
    v_unit_cost     NUMERIC;
    v_old_agent_key TEXT;
    v_old_event     DATE;
    v_old_staff     UUID;
    v_old_batch     UUID;
    v_result        JSONB;
BEGIN
    IF v_doc_no IS NULL THEN
        RAISE EXCEPTION 'docNo is required';
    END IF;

    -- Two deliveries of the same document never interleave.
    PERFORM pg_advisory_xact_lock(hashtext('erp_sync:' || v_doc_no));

    SELECT * INTO v_existing FROM sales_orders WHERE order_no = v_doc_no AND source = 'erp_sync';
    v_found := FOUND;
    -- The source endpoint owns Fair regardless of fields in the delivery.
    IF v_found AND NOT EXISTS (SELECT 1 FROM sales_import_batches
            WHERE id = v_existing.batch_id AND sub_department_id = v_sub_id) THEN
        RAISE EXCEPTION 'Existing ERP document belongs to another sub-department';
    END IF;
    PERFORM lock_commission_order_periods(v_sub_id, ARRAY[
        CASE WHEN v_found THEN v_existing.period_month END, date_trunc('month', v_order_date)::DATE]);

    -- ── Ordering guard ─────────────────────────────────────────────────────
    IF v_found AND v_snapshot IS NOT NULL AND v_existing.erp_snapshot_at IS NOT NULL THEN
        IF v_snapshot = v_existing.erp_snapshot_at THEN
            RETURN erp_sync_log(v_doc_no, v_existing.period_month, 'duplicate',
                                'same snapshot already applied', '{}', v_snapshot, NULL, p_replay_of);
        ELSIF v_snapshot < v_existing.erp_snapshot_at THEN
            RETURN erp_sync_log(v_doc_no, v_existing.period_month, 'stale',
                                'a newer snapshot is already applied', '{}', v_snapshot, NULL, p_replay_of);
        END IF;
    END IF;

    -- ── Deleted in the ERP ─────────────────────────────────────────────────
    IF v_deleted THEN
        IF NOT v_found THEN
            RETURN erp_sync_log(v_doc_no, NULL, 'skipped', 'deleted before the portal ever saw it',
                                '{}', v_snapshot, NULL, p_replay_of);
        END IF;
        IF erp_sync_period_locked(v_existing.period_month) THEN
            RETURN erp_sync_log(v_doc_no, v_existing.period_month, 'held',
                                'deleted in the ERP after the month''s run was applied — reopen the run and replay',
                                '{}', v_snapshot, p_order, p_replay_of);
        END IF;
        UPDATE sales_orders
           SET cancelled = TRUE, erp_status = 'DELETED', erp_snapshot_at = v_snapshot,
               synced_at = NOW(), sequence_in_day = NULL
         WHERE id = v_existing.id;
        DELETE FROM sales_order_open_bill_tags WHERE order_id = v_existing.id AND auto_suggested;
        PERFORM erp_sync_resequence_day(v_existing.agent_key, v_existing.event_date);
        PERFORM erp_sync_suggest_open_bills(v_existing.staff_id, v_existing.event_date);
        PERFORM erp_sync_refresh_batch(v_existing.batch_id);
        RETURN erp_sync_log(v_doc_no, v_existing.period_month, 'applied', 'excluded: deleted in the ERP',
                            '{}', v_snapshot, NULL, p_replay_of);
    END IF;

    IF v_order_date IS NULL THEN
        RAISE EXCEPTION 'orderDate is required for %', v_doc_no;
    END IF;
    v_period := DATE_TRUNC('month', v_order_date)::DATE;
    -- Both the old and new source months were locked in calendar order above.

    -- The ERP's own commission rule: CANCELLED, DRAFT and a hold earn nothing.
    -- CLOSED (the customer took 7 of 10) still earns. Unknown statuses earn.
    v_excluded := v_status IN ('CANCELLED', 'DRAFT', 'ON_HOLD') OR v_on_hold;

    -- A draft the portal has never seen is not a sale yet.
    IF NOT v_found AND v_status = 'DRAFT' THEN
        RETURN erp_sync_log(v_doc_no, v_period, 'skipped', 'draft — not a sale yet',
                            '{}', v_snapshot, NULL, p_replay_of);
    END IF;

    -- ── Locks ──────────────────────────────────────────────────────────────
    IF erp_sync_period_locked(v_period)
       OR (v_found AND v_existing.period_month <> v_period AND erp_sync_period_locked(v_existing.period_month)) THEN
        RETURN erp_sync_log(v_doc_no, v_period, 'held',
                            'the month''s commission run is applied or locked — reopen it and replay',
                            '{}', v_snapshot, p_order, p_replay_of);
    END IF;

    -- ── The period's batch ─────────────────────────────────────────────────
    SELECT id, source INTO v_batch_id, v_batch_source
      FROM sales_import_batches
     WHERE sub_department_id = v_sub_id AND period_month = v_period AND status = 'committed';
    IF v_batch_id IS NULL THEN
        INSERT INTO sales_import_batches (sub_department_id, period_month, file_name, source, status, notes)
        VALUES (v_sub_id, v_period, 'ERP live sync', 'erp_sync', 'committed',
                'Fed live from the Houzs Century ERP. Orders are upserted as they change.')
        ON CONFLICT (sub_department_id, period_month) WHERE status = 'committed' DO NOTHING
        RETURNING id INTO v_batch_id;
        IF v_batch_id IS NULL THEN
            SELECT id, source INTO v_batch_id, v_batch_source
              FROM sales_import_batches
             WHERE sub_department_id = v_sub_id AND period_month = v_period AND status = 'committed';
        ELSE
            v_batch_source := 'erp_sync';
        END IF;
    END IF;
    IF v_batch_source <> 'erp_sync' THEN
        RETURN erp_sync_log(v_doc_no, v_period, 'held',
                            'the month was imported from a file — retire that import to let the live feed own it',
                            '{}', v_snapshot, p_order, p_replay_of);
    END IF;

    -- ── Who sold it ────────────────────────────────────────────────────────
    v_agent_name := COALESCE(NULLIF(BTRIM(p_order->>'salespersonName'), ''), '(no salesperson)');
    v_agent_key  := UPPER(REGEXP_REPLACE(BTRIM(v_agent_name), '\s+', ' ', 'g'));

    IF v_sp_id IS NOT NULL THEN
        SELECT staff_id INTO v_staff_id FROM comm_agent_aliases WHERE erp_salesperson_id = v_sp_id;
    END IF;
    IF v_staff_id IS NULL THEN
        SELECT staff_id INTO v_staff_id FROM comm_agent_aliases WHERE agent_key = v_agent_key;
    END IF;
    IF v_staff_id IS NULL AND v_found THEN
        v_staff_id := v_existing.staff_id;
    END IF;
    IF v_staff_id IS NULL AND NOT v_excluded THEN
        v_warnings := ARRAY_APPEND(v_warnings, 'unmatched_salesperson');
    END IF;

    -- ── Brand: the ERP's Branding first, then the lines, then the prefixes ──
    v_brand := erp_sync_brand_code(p_order->>'brand');
    IF v_brand IS NULL THEN
        FOR v_line IN SELECT * FROM JSONB_ARRAY_ELEMENTS(v_lines) LOOP
            v_line_brand := COALESCE(erp_sync_brand_code(v_line->>'brand'),
                                     erp_sync_brand_by_prefix(v_line->>'itemCode'));
            IF v_line_brand IS NOT NULL THEN
                v_amount := COALESCE((v_line->>'amount')::NUMERIC, 0);
                v_by_brand := JSONB_SET(v_by_brand, ARRAY[v_line_brand],
                                        TO_JSONB(COALESCE((v_by_brand->>v_line_brand)::NUMERIC, 0) + v_amount));
            END IF;
        END LOOP;
        SELECT key INTO v_brand
          FROM JSONB_EACH_TEXT(v_by_brand)
         ORDER BY value::NUMERIC DESC, key
         LIMIT 1;
    END IF;

    -- ── Header ─────────────────────────────────────────────────────────────
    IF v_found THEN
        v_old_agent_key := v_existing.agent_key;
        v_old_event     := v_existing.event_date;
        v_old_staff     := v_existing.staff_id;
        v_old_batch     := v_existing.batch_id;
        -- An event day a human moved off the order date stays where they put it.
        v_event_date := CASE WHEN v_existing.event_date = v_existing.order_date
                             THEN v_order_date ELSE v_existing.event_date END;
        UPDATE sales_orders
           SET batch_id = v_batch_id,
               period_month = v_period,
               order_date = v_order_date,
               event_date = v_event_date,
               debtor_code = NULLIF(p_order->>'debtorCode', ''),
               customer_name = NULLIF(p_order->>'customerName', ''),
               agent_name = v_agent_name,
               agent_key = v_agent_key,
               staff_id = v_staff_id,
               location = NULLIF(p_order->>'location', ''),
               brand_code = v_brand,
               order_total = v_total,
               balance = v_balance,
               cancelled = v_excluded,
               erp_status = v_status,
               erp_on_hold = v_on_hold,
               erp_salesperson_id = v_sp_id,
               erp_company_id = NULLIF(p_order->>'companyId', '')::BIGINT,
               erp_snapshot_at = v_snapshot,
               erp_created_at = NULLIF(p_order->>'createdAt', '')::TIMESTAMPTZ,
               synced_at = NOW(),
               raw = p_order->'raw'
         WHERE id = v_existing.id
         RETURNING id INTO v_order_id;
    ELSE
        v_event_date := v_order_date;
        INSERT INTO sales_orders (
            batch_id, period_month, order_no, order_date, event_date, debtor_code, customer_name,
            agent_name, agent_key, staff_id, location, brand_code, order_total, balance, cancelled,
            source, erp_status, erp_on_hold, erp_salesperson_id, erp_company_id, erp_snapshot_at,
            erp_created_at, synced_at, raw)
        VALUES (
            v_batch_id, v_period, v_doc_no, v_order_date, v_event_date,
            NULLIF(p_order->>'debtorCode', ''), NULLIF(p_order->>'customerName', ''),
            v_agent_name, v_agent_key, v_staff_id, NULLIF(p_order->>'location', ''), v_brand,
            v_total, v_balance, v_excluded,
            'erp_sync', v_status, v_on_hold, v_sp_id, NULLIF(p_order->>'companyId', '')::BIGINT,
            v_snapshot, NULLIF(p_order->>'createdAt', '')::TIMESTAMPTZ, NOW(), p_order->'raw')
        RETURNING id INTO v_order_id;
    END IF;

    -- ── Lines: the delivery is a full snapshot, so the set is replaced ──────
    DELETE FROM sales_order_lines WHERE order_id = v_order_id;
    FOR v_line IN SELECT * FROM JSONB_ARRAY_ELEMENTS(v_lines) LOOP
        v_line_no   := v_line_no + 1;
        v_item_code := COALESCE(NULLIF(BTRIM(v_line->>'itemCode'), ''), '(none)');
        v_qty       := COALESCE((v_line->>'qty')::NUMERIC, 0);
        v_amount    := COALESCE((v_line->>'amount')::NUMERIC, 0);
        v_line_brand := COALESCE(erp_sync_brand_code(v_line->>'brand'), v_brand,
                                 erp_sync_brand_by_prefix(v_item_code));

        -- Cost: the ERP's line cost when it carries one; the Product List when
        -- it does not; NULL (and a warning) when neither knows.
        v_cost := NULLIF(v_line->>'cost', '')::NUMERIC;
        IF v_cost IS NULL OR (v_cost = 0 AND v_amount <> 0) THEN
            v_unit_cost := NULL;
            SELECT unit_cost INTO v_unit_cost
              FROM comm_products
             WHERE UPPER(BTRIM(item_code)) = UPPER(BTRIM(v_item_code)) AND is_active
             LIMIT 1;
            v_cost := CASE WHEN v_unit_cost IS NULL THEN NULL ELSE ROUND(v_unit_cost * v_qty, 2) END;
        END IF;
        IF v_cost IS NULL THEN v_no_cost := v_no_cost + 1; END IF;
        IF v_line_brand IS NULL THEN v_no_brand := v_no_brand + 1; END IF;

        INSERT INTO sales_order_lines (
            order_id, line_no, item_group, product_code, product_name, description2, uom, location,
            qty, unit_price, line_amount, brand_code, cost_amount, raw)
        VALUES (
            v_order_id,
            COALESCE(NULLIF(v_line->>'lineNo', '')::INTEGER, v_line_no),
            COALESCE(NULLIF(BTRIM(v_line->>'itemGroup'), ''), 'UNGROUPED'),
            v_item_code,
            NULLIF(v_line->>'description', ''),
            NULLIF(v_line->>'description2', ''),
            NULLIF(v_line->>'uom', ''),
            NULLIF(v_line->>'location', ''),
            v_qty,
            COALESCE((v_line->>'unitPrice')::NUMERIC, 0),
            v_amount,
            v_line_brand,
            v_cost,
            v_line);
    END LOOP;

    IF NOT v_excluded THEN
        IF v_brand IS NULL THEN v_warnings := ARRAY_APPEND(v_warnings, 'no_brand'); END IF;
        IF v_no_cost > 0 THEN v_warnings := ARRAY_APPEND(v_warnings, 'lines_without_cost:' || v_no_cost); END IF;
        IF v_no_brand > 0 THEN v_warnings := ARRAY_APPEND(v_warnings, 'lines_without_brand:' || v_no_brand); END IF;
    END IF;

    -- ── The day's running order and the Open Bill suggestions ──────────────
    IF v_excluded THEN
        DELETE FROM sales_order_open_bill_tags WHERE order_id = v_order_id AND auto_suggested;
    END IF;
    PERFORM erp_sync_resequence_day(v_agent_key, v_event_date);
    PERFORM erp_sync_suggest_open_bills(v_staff_id, v_event_date);
    IF v_found AND (v_old_agent_key <> v_agent_key OR v_old_event <> v_event_date) THEN
        PERFORM erp_sync_resequence_day(v_old_agent_key, v_old_event);
    END IF;
    IF v_found AND v_old_staff IS NOT NULL
       AND (v_old_staff IS DISTINCT FROM v_staff_id OR v_old_event <> v_event_date) THEN
        PERFORM erp_sync_suggest_open_bills(v_old_staff, v_old_event);
    END IF;

    PERFORM erp_sync_refresh_batch(v_batch_id);
    IF v_old_batch IS NOT NULL AND v_old_batch <> v_batch_id THEN
        PERFORM erp_sync_refresh_batch(v_old_batch);
    END IF;

    v_result := erp_sync_log(v_doc_no, v_period, 'applied',
                             CASE WHEN v_excluded THEN 'excluded: ' || CASE WHEN v_on_hold THEN 'on hold' ELSE LOWER(v_status) END
                                  WHEN v_found THEN 'updated' ELSE 'created' END,
                             v_warnings, v_snapshot, NULL, p_replay_of);
    RETURN v_result || JSONB_BUILD_OBJECT('orderId', v_order_id);
END;
$$;

-- Preserve the membership title ratchet and sum across applied programmes.
CREATE OR REPLACE FUNCTION public.apply_commission_run(p_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_role         TEXT := current_user_role();
    v_run          comm_runs%ROWTYPE;
    v_blocked      INTEGER;
    v_payroll_run  TEXT;
    v_staff        INTEGER := 0;
    v_released     INTEGER := 0;
    v_promoted     INTEGER := 0;
    v_clash        TEXT;
    v_p            RECORD;
    v_hit_pos      INTEGER;
    v_cur_pos      INTEGER;
    v_title_name   TEXT;
    v_ladder_msg   TEXT;
    v_home_scheme  UUID;
BEGIN
    IF v_role NOT IN ('principal', 'hr') THEN
        RAISE EXCEPTION 'Only Principal or HR may apply a commission run';
    END IF;

    -- All programmes share one payroll field; serialize its monthly sum.
    PERFORM pg_advisory_xact_lock(hashtext('commission_payroll:' ||
        (SELECT period_month::TEXT FROM comm_runs WHERE id = p_run_id)));
    SELECT * INTO v_run FROM comm_runs WHERE id = p_run_id FOR UPDATE;
    PERFORM lock_commission_order_periods(v_run.sub_department_id, ARRAY[v_run.period_month] || ARRAY(
        SELECT (o->>'order_period_month')::DATE FROM jsonb_array_elements(v_run.released_orders) o));
    IF v_run.id IS NULL THEN
        RAISE EXCEPTION 'Commission run not found';
    END IF;
    IF v_run.status <> 'computed' THEN
        RAISE EXCEPTION 'Only a computed run can be applied — this one is %', v_run.status;
    END IF;

    -- The warnings are not advisory. Every one of them is a case where the run
    -- knows it paid the wrong amount: an unclassified item group, a
    -- salesperson with sales and no rank, a placement that should not exist.
    IF jsonb_array_length(COALESCE(v_run.warnings, '[]'::JSONB)) > 0 THEN
        RAISE EXCEPTION 'This run has % unresolved warning(s). Clear them and recompute before applying.',
            jsonb_array_length(v_run.warnings);
    END IF;

    -- Invariant 4, half one: the payroll RUN for the month must still be open.
    SELECT status::TEXT INTO v_payroll_run
      FROM payroll_runs
     WHERE period_month = v_run.period_month
       AND status IN ('submitted', 'approved', 'paid')
     ORDER BY CASE status WHEN 'paid' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END
     LIMIT 1;
    IF v_payroll_run IS NOT NULL THEN
        RAISE EXCEPTION 'The % payroll run is % — reopen it before changing commission',
            to_char(v_run.period_month, 'Mon YYYY'), v_payroll_run;
    END IF;

    -- Invariant 4, half two: and so must every row we are about to write.
    SELECT COUNT(*) INTO v_blocked
      FROM comm_statements s
      JOIN hr_monthly_payroll p
        ON p.staff_id = s.staff_id AND p.period_month = v_run.period_month
     WHERE s.run_id = p_run_id AND p.status <> 'draft';

    IF v_blocked > 0 THEN
        RAISE EXCEPTION '% payroll row(s) for % are no longer draft — commission cannot be written into a submitted month',
            v_blocked, to_char(v_run.period_month, 'Mon YYYY');
    END IF;

    -- Invariant 5, checked before writing anything so the message names the
    -- order rather than surfacing a raw constraint violation.
    SELECT r.order_no INTO v_clash
      FROM jsonb_array_elements(v_run.released_orders) AS o
      JOIN comm_order_releases r ON r.order_no = o ->> 'order_no'
       AND r.sub_department_id = v_run.sub_department_id
     WHERE r.run_id <> p_run_id
     LIMIT 1;

    IF v_clash IS NOT NULL THEN
        RAISE EXCEPTION 'Order % has already been paid by an earlier run. Recompute this month so it is excluded.', v_clash;
    END IF;

    -- ── Payroll ────────────────────────────────────────────────────────────
    -- commission_amount is the ONLY payroll field this module writes. Since
    -- 2026-09-10 several sub-departments may pay the same person the same
    -- month, so the figure is the SUM of every applied run's statement for
    -- that person and month: this run's, plus whatever other sub-departments
    -- have already applied. A re-apply of this sub-department replaces only
    -- its own share (the earlier run was reopened, so it is not 'applied').
    INSERT INTO hr_monthly_payroll (staff_id, period_month, commission_amount, source, status, created_by)
    SELECT s.staff_id,
           v_run.period_month,
           s.total_commission + COALESCE((
             SELECT SUM(os.total_commission)
               FROM comm_statements os
               JOIN comm_runs orr ON orr.id = os.run_id
              WHERE os.staff_id = s.staff_id
                AND orr.period_month = v_run.period_month
                AND orr.status = 'applied'
                AND orr.id <> p_run_id
           ), 0),
           'commission', 'draft', auth.uid()
      FROM comm_statements s
     WHERE s.run_id = p_run_id
    ON CONFLICT (staff_id, period_month) DO UPDATE
       SET commission_amount = EXCLUDED.commission_amount,
           source            = 'commission',
           updated_at        = NOW();

    GET DIAGNOSTICS v_staff = ROW_COUNT;

    -- ── Releases ───────────────────────────────────────────────────────────
    INSERT INTO comm_order_releases (
        sub_department_id, order_no, run_id, staff_id, period_month, order_period_month, product_revenue
    )
    SELECT
        v_run.sub_department_id,
        o ->> 'order_no',
        p_run_id,
        (o ->> 'staff_id')::UUID,
        v_run.period_month,
        (o ->> 'order_period_month')::DATE,
        COALESCE((o ->> 'product_revenue')::DECIMAL, 0)
      FROM jsonb_array_elements(v_run.released_orders) AS o
    ;

    GET DIAGNOSTICS v_released = ROW_COUNT;

    -- ── The title ratchet ──────────────────────────────────────────────────
    -- "Title 只会上，不会下" (user 2026-09-02). The month somebody is PAID a
    -- rank whose title sits higher on this ladder than the title they hold
    -- HERE, their membership's title is raised to it and stays there. The
    -- rank follows inside the row (comm_hierarchy_rank_follows_title).
    --
    -- The company title rises with it only when this run is the HOME
    -- sub-department's — that is the title HR calls them by and the People
    -- chart draws. An IR promotion is IR's; Fair's is everybody's.
    FOR v_p IN
        SELECT s.staff_id, s.rank_title_id, h.id AS membership_id,
               h.title_id AS current_title_id, st.employee_name, st.department_id
          FROM comm_statements s
          JOIN comm_hierarchy h
            ON h.staff_id = s.staff_id AND h.scheme_id = v_run.scheme_id AND h.effective_to IS NULL
          JOIN hr_staff_costs st ON st.id = s.staff_id
         WHERE s.run_id = p_run_id
           AND s.rank_title_id IS NOT NULL
           AND s.rank_title_id IS DISTINCT FROM h.title_id
    LOOP
        SELECT MIN(sort_order) INTO v_hit_pos
          FROM comm_ranks
         WHERE scheme_id = v_run.scheme_id AND title_id = v_p.rank_title_id;
        SELECT MIN(sort_order) INTO v_cur_pos
          FROM comm_ranks
         WHERE scheme_id = v_run.scheme_id AND title_id = v_p.current_title_id;

        IF v_hit_pos IS NOT NULL AND (v_cur_pos IS NULL OR v_hit_pos > v_cur_pos) THEN
            SELECT name INTO v_title_name FROM titles WHERE id = v_p.rank_title_id;

            UPDATE comm_hierarchy
               SET title_id = v_p.rank_title_id
             WHERE id = v_p.membership_id;

            v_home_scheme := comm_scheme_for_department(v_p.department_id);
            IF v_home_scheme = v_run.scheme_id THEN
                -- `designation` mirrors the title's name (titles migration,
                -- 2026-09-01): the payroll export reads it.
                --
                -- hr_staff_respects_ladder (the People org chart's rule,
                -- SQLSTATE 23LAD) may refuse this if the raised title would
                -- stand above the person's reports_to line on the company
                -- ladder. That is a People-chart fact commission cannot
                -- settle, so the apply stops here, says whose line it is, and
                -- the whole month rolls back.
                BEGIN
                    UPDATE hr_staff_costs
                       SET title_id = v_p.rank_title_id,
                           designation = v_title_name
                     WHERE id = v_p.staff_id;
                EXCEPTION WHEN SQLSTATE '23LAD' THEN
                    v_ladder_msg := SQLERRM;
                    RAISE EXCEPTION 'Could not raise %''s title to % — %. Fix their reporting line on People (or where that title sits on the company ladder), then apply again.',
                        v_p.employee_name, v_title_name, v_ladder_msg;
                END;
            END IF;

            INSERT INTO comm_title_promotions (
                run_id, staff_id, period_month, from_title_id, to_title_id, promoted_by
            )
            VALUES (
                p_run_id, v_p.staff_id, v_run.period_month,
                v_p.current_title_id, v_p.rank_title_id, auth.uid()
            );

            v_promoted := v_promoted + 1;
        END IF;
    END LOOP;

    UPDATE comm_runs
       SET status = 'applied', applied_at = NOW(), applied_by = auth.uid()
     WHERE id = p_run_id;

    RETURN jsonb_build_object(
        'run_id', p_run_id,
        'period_month', v_run.period_month,
        'staff_written', v_staff,
        'orders_released', v_released,
        'titles_promoted', v_promoted,
        'total_commission', v_run.total_commission
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.reopen_commission_run(p_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_role        TEXT := current_user_role();
    v_run         comm_runs%ROWTYPE;
    v_payroll_run TEXT;
    v_blocked     INTEGER;
    v_zeroed      INTEGER := 0;
    v_dropped     INTEGER := 0;
BEGIN
    IF v_role NOT IN ('principal', 'hr') THEN
        RAISE EXCEPTION 'Only Principal or HR may reopen a commission run';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('commission_payroll:' ||
        (SELECT period_month::TEXT FROM comm_runs WHERE id = p_run_id)));
    SELECT * INTO v_run FROM comm_runs WHERE id = p_run_id FOR UPDATE;
    PERFORM lock_commission_order_periods(v_run.sub_department_id, ARRAY[v_run.period_month] || ARRAY(
        SELECT (o->>'order_period_month')::DATE FROM jsonb_array_elements(v_run.released_orders) o));
    IF v_run.id IS NULL THEN
        RAISE EXCEPTION 'Commission run not found';
    END IF;
    IF v_run.status NOT IN ('applied', 'computed') THEN
        RAISE EXCEPTION 'Nothing to reopen — the run is %', v_run.status;
    END IF;

    SELECT status::TEXT INTO v_payroll_run
      FROM payroll_runs
     WHERE period_month = v_run.period_month
       AND status IN ('submitted', 'approved', 'paid')
     ORDER BY CASE status WHEN 'paid' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END
     LIMIT 1;
    IF v_payroll_run IS NOT NULL THEN
        RAISE EXCEPTION 'The % payroll run is % — reopen that first',
            to_char(v_run.period_month, 'Mon YYYY'), v_payroll_run;
    END IF;

    SELECT COUNT(*) INTO v_blocked
      FROM comm_statements s
      JOIN hr_monthly_payroll p
        ON p.staff_id = s.staff_id AND p.period_month = v_run.period_month
     WHERE s.run_id = p_run_id AND p.status <> 'draft';

    IF v_blocked > 0 THEN
        RAISE EXCEPTION '% payroll row(s) for % are no longer draft',
            v_blocked, to_char(v_run.period_month, 'Mon YYYY');
    END IF;

    IF v_run.status = 'applied' THEN
        -- Not zero: what the OTHER sub-departments' applied runs still pay
        -- this person for the month. This run is still 'applied' here, so it
        -- is excluded by id rather than by status.
        UPDATE hr_monthly_payroll p
           SET commission_amount = COALESCE((
                 SELECT SUM(os.total_commission)
                   FROM comm_statements os
                   JOIN comm_runs orr ON orr.id = os.run_id
                  WHERE os.staff_id = p.staff_id
                    AND orr.period_month = v_run.period_month
                    AND orr.status = 'applied'
                    AND orr.id <> p_run_id
               ), 0),
               updated_at = NOW()
          FROM comm_statements s
         WHERE s.run_id = p_run_id
           AND p.staff_id = s.staff_id
           AND p.period_month = v_run.period_month;
        GET DIAGNOSTICS v_zeroed = ROW_COUNT;

        DELETE FROM comm_order_releases WHERE run_id = p_run_id;
        GET DIAGNOSTICS v_dropped = ROW_COUNT;
    END IF;

    UPDATE comm_runs
       SET status = 'draft', applied_at = NULL, applied_by = NULL,
           reopened_at = NOW(), reopened_by = auth.uid()
     WHERE id = p_run_id;

    RETURN jsonb_build_object(
        'run_id', p_run_id,
        'payroll_rows_zeroed', v_zeroed,
        'releases_dropped', v_dropped
    );
END;
$function$;

-- Matching or day resequencing must leave already-paid source months untouched.
CREATE OR REPLACE FUNCTION erp_sync_resequence_day(p_agent_key TEXT, p_event_date DATE)
RETURNS VOID
LANGUAGE sql
SET search_path = public
AS $$
    UPDATE sales_orders o
       SET sequence_in_day = s.rn
      FROM (
          SELECT id, ROW_NUMBER() OVER (ORDER BY erp_created_at NULLS LAST, order_no) AS rn
            FROM sales_orders
           WHERE source = 'erp_sync' AND agent_key = p_agent_key
             AND event_date = p_event_date AND NOT cancelled
             AND NOT erp_sync_period_locked(period_month)
      ) s
     WHERE o.id = s.id AND o.sequence_in_day IS DISTINCT FROM s.rn;

    UPDATE sales_orders
       SET sequence_in_day = NULL
     WHERE source = 'erp_sync' AND agent_key = p_agent_key
       AND event_date = p_event_date AND cancelled
       AND NOT erp_sync_period_locked(period_month) AND sequence_in_day IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION match_erp_salesperson(p_agent_key TEXT, p_erp_salesperson_id TEXT, p_staff_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_key      TEXT := UPPER(REGEXP_REPLACE(BTRIM(COALESCE(p_agent_key, '')), '\s+', ' ', 'g'));
    v_sp_id    TEXT := NULLIF(BTRIM(p_erp_salesperson_id), '');
    v_sample   TEXT;
    v_orders   INTEGER := 0;
    r          RECORD;
BEGIN
    IF v_key = '' AND v_sp_id IS NULL THEN
        RAISE EXCEPTION 'Nothing to match on';
    END IF;
    IF p_staff_id IS NULL THEN
        RAISE EXCEPTION 'Pick a salesperson';
    END IF;

    SELECT agent_name INTO v_sample
      FROM sales_orders
     WHERE source = 'erp_sync' AND (agent_key = v_key OR (v_sp_id IS NOT NULL AND erp_salesperson_id = v_sp_id))
     ORDER BY synced_at DESC NULLS LAST
     LIMIT 1;

    -- One alias per spelling, and one per ERP identity. An existing alias for
    -- the spelling is re-pointed rather than duplicated.
    IF v_key <> '' THEN
        INSERT INTO comm_agent_aliases (agent_key, agent_name_sample, staff_id, erp_salesperson_id, created_by)
        VALUES (v_key, COALESCE(v_sample, v_key), p_staff_id, v_sp_id, auth.uid())
        ON CONFLICT (agent_key) DO UPDATE
            SET staff_id = EXCLUDED.staff_id,
                erp_salesperson_id = COALESCE(EXCLUDED.erp_salesperson_id, comm_agent_aliases.erp_salesperson_id);
    ELSE
        INSERT INTO comm_agent_aliases (agent_key, agent_name_sample, staff_id, erp_salesperson_id, created_by)
        VALUES ('ERP:' || v_sp_id, COALESCE(v_sample, v_sp_id), p_staff_id, v_sp_id, auth.uid())
        ON CONFLICT (agent_key) DO UPDATE SET staff_id = EXCLUDED.staff_id;
    END IF;

    -- Every live order still waiting on this person, in months that can move.
    FOR r IN
        SELECT o.id, o.agent_key, o.event_date, o.batch_id
          FROM sales_orders o
         WHERE o.source = 'erp_sync' AND o.staff_id IS NULL
           AND (o.agent_key = v_key OR (v_sp_id IS NOT NULL AND o.erp_salesperson_id = v_sp_id))
           AND NOT erp_sync_period_locked(o.period_month)
    LOOP
        UPDATE sales_orders SET staff_id = p_staff_id WHERE id = r.id;
        v_orders := v_orders + 1;
    END LOOP;

    FOR r IN
        SELECT DISTINCT o.event_date, o.batch_id
          FROM sales_orders o
         WHERE o.source = 'erp_sync' AND o.staff_id = p_staff_id
           AND NOT erp_sync_period_locked(o.period_month)
           AND (o.agent_key = v_key OR (v_sp_id IS NOT NULL AND o.erp_salesperson_id = v_sp_id))
    LOOP
        PERFORM erp_sync_suggest_open_bills(p_staff_id, r.event_date);
        PERFORM erp_sync_refresh_batch(r.batch_id);
    END LOOP;

    RETURN JSONB_BUILD_OBJECT('ordersMatched', v_orders);
END;
$$;
