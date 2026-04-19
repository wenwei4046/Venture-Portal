-- ============================================================================
-- 20260101000177_invoice_submission_requests.sql
-- PR #5: dept_manager Request Credit (Invoice Submission) workflow.
--
-- Marketing fills the same Create Invoice form Finance uses; submits to
-- Finance for generation. Finance reviews + clicks Generate (auto-filled)
-- or Reject. No Principal in between for invoices.
-- ============================================================================

CREATE TYPE invoice_submission_request_status AS ENUM (
    'pending',     -- Submitted, awaiting Finance
    'generated',   -- Finance generated invoice(s) — generated_invoice_ids set
    'rejected',    -- Finance rejected — Marketing must re-submit
    'cancelled'    -- Marketing cancelled before Finance acted
);

CREATE TABLE invoice_submission_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    requested_by UUID NOT NULL REFERENCES users(id),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Invoice metadata (mirrors invoices columns)
    period_month DATE NOT NULL,
    invoice_date DATE NOT NULL,
    due_date DATE NOT NULL,
    description TEXT NOT NULL,
    reference_no TEXT,

    -- Multi-row line items: [{ subsidiary_id: uuid, amount: number }, ...]
    -- One row → one invoice generated when Finance approves.
    line_items JSONB NOT NULL,

    status invoice_submission_request_status NOT NULL DEFAULT 'pending',

    -- Set when Finance generates: array of generated invoice ids.
    generated_invoice_ids UUID[],
    generated_by UUID REFERENCES users(id),
    generated_at TIMESTAMPTZ,

    rejection_reason TEXT,
    rejected_by UUID REFERENCES users(id),
    rejected_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_isr_dept_status ON invoice_submission_requests (department_id, status);
CREATE INDEX idx_isr_status ON invoice_submission_requests (status);

CREATE OR REPLACE FUNCTION touch_invoice_submission_requests_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_isr_touch_updated_at
    BEFORE UPDATE ON invoice_submission_requests
    FOR EACH ROW EXECUTE FUNCTION touch_invoice_submission_requests_updated_at();

ALTER TABLE invoice_submission_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY isr_principal_all
    ON invoice_submission_requests FOR ALL
    USING (current_user_role() = 'principal')
    WITH CHECK (current_user_role() = 'principal');

CREATE POLICY isr_finance_select
    ON invoice_submission_requests FOR SELECT
    USING (current_user_role() = 'finance');

CREATE POLICY isr_finance_update
    ON invoice_submission_requests FOR UPDATE
    USING (current_user_role() = 'finance')
    WITH CHECK (current_user_role() = 'finance');

CREATE POLICY isr_dept_manager_select_own
    ON invoice_submission_requests FOR SELECT
    USING (current_user_role() = 'dept_manager'
        AND department_id = current_user_department_id());

-- ─── RPC: submit_invoice_request ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION submit_invoice_request(
    p_period_month DATE,
    p_invoice_date DATE,
    p_due_date DATE,
    p_description TEXT,
    p_reference_no TEXT,
    p_line_items JSONB
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_request_id UUID;
    v_dept_id UUID := current_user_department_id();
    v_total_rows INT;
BEGIN
    IF current_user_role() <> 'dept_manager' THEN
        RAISE EXCEPTION 'Only dept_manager can submit invoice requests'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_dept_id IS NULL THEN
        RAISE EXCEPTION 'dept_manager must have a department_id';
    END IF;
    IF p_period_month IS NULL OR p_invoice_date IS NULL OR p_due_date IS NULL THEN
        RAISE EXCEPTION 'period / invoice date / due date are required';
    END IF;
    IF p_description IS NULL OR length(trim(p_description)) = 0 THEN
        RAISE EXCEPTION 'description is required';
    END IF;
    IF p_line_items IS NULL OR jsonb_typeof(p_line_items) <> 'array' THEN
        RAISE EXCEPTION 'line_items must be a JSON array';
    END IF;
    SELECT count(*) INTO v_total_rows FROM jsonb_array_elements(p_line_items);
    IF v_total_rows = 0 THEN
        RAISE EXCEPTION 'at least one line item is required';
    END IF;

    INSERT INTO invoice_submission_requests (
        department_id, requested_by, period_month, invoice_date, due_date,
        description, reference_no, line_items, status
    ) VALUES (
        v_dept_id, auth.uid(), date_trunc('month', p_period_month)::date,
        p_invoice_date, p_due_date, trim(p_description),
        nullif(trim(p_reference_no), ''), p_line_items, 'pending'
    ) RETURNING id INTO v_request_id;

    RETURN v_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION submit_invoice_request(DATE, DATE, DATE, TEXT, TEXT, JSONB) TO authenticated;

-- ─── RPC: generate_invoices_from_request ─────────────────────────────────────

CREATE OR REPLACE FUNCTION generate_invoices_from_request(p_request_id UUID)
RETURNS UUID[]
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_request invoice_submission_requests%ROWTYPE;
    v_item JSONB;
    v_subsidiary_id UUID;
    v_amount DECIMAL(15, 2);
    v_invoice_no TEXT;
    v_invoice_id UUID;
    v_generated UUID[] := ARRAY[]::UUID[];
BEGIN
    IF current_user_role() <> 'finance' THEN
        RAISE EXCEPTION 'Only finance can generate invoices' USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT * INTO v_request
      FROM invoice_submission_requests
     WHERE id = p_request_id AND status = 'pending';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Request % not pending', p_request_id;
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(v_request.line_items)
    LOOP
        v_subsidiary_id := (v_item->>'subsidiary_id')::uuid;
        v_amount := (v_item->>'amount')::decimal;
        IF v_subsidiary_id IS NULL OR v_amount IS NULL OR v_amount <= 0 THEN
            RAISE EXCEPTION 'invalid line item: %', v_item;
        END IF;

        SELECT 'HV-INV-' || to_char(NOW(), 'YYYYMM') || '-' ||
               lpad((COALESCE(MAX(
                   (regexp_replace(invoice_no, '^HV-INV-\d{6}-', ''))::int
               ), 0) + 1)::text, 4, '0')
          INTO v_invoice_no
          FROM invoices
         WHERE invoice_no LIKE 'HV-INV-' || to_char(NOW(), 'YYYYMM') || '-%';

        INSERT INTO invoices (
            invoice_no, company_id, period_month, billing_mode,
            base_amount, total_amount, status, sst_rate, sst_amount,
            invoice_date, due_date, description, reference_no, created_by
        ) VALUES (
            v_invoice_no, v_subsidiary_id, v_request.period_month, 'marketing_project',
            v_amount, v_amount, 'draft', 0, 0,
            v_request.invoice_date, v_request.due_date,
            v_request.description, v_request.reference_no, v_user_id
        ) RETURNING id INTO v_invoice_id;

        v_generated := array_append(v_generated, v_invoice_id);
    END LOOP;

    UPDATE invoice_submission_requests
       SET status = 'generated',
           generated_invoice_ids = v_generated,
           generated_by = v_user_id,
           generated_at = NOW()
     WHERE id = p_request_id;

    RETURN v_generated;
END;
$$;

GRANT EXECUTE ON FUNCTION generate_invoices_from_request(UUID) TO authenticated;

-- ─── RPC: reject_invoice_request ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION reject_invoice_request(p_request_id UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF current_user_role() <> 'finance' THEN
        RAISE EXCEPTION 'Only finance can reject' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
        RAISE EXCEPTION 'rejection reason is required';
    END IF;

    UPDATE invoice_submission_requests
       SET status = 'rejected',
           rejection_reason = trim(p_reason),
           rejected_by = auth.uid(),
           rejected_at = NOW()
     WHERE id = p_request_id AND status = 'pending';
END;
$$;

GRANT EXECUTE ON FUNCTION reject_invoice_request(UUID, TEXT) TO authenticated;
