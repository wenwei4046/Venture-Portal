-- ============================================================================
-- 20260101000155_director_invoice_routing.sql
-- Task 4 — route director_office_attribution + director_attribution invoices
-- HOUZS Venture Portal
--
-- Building on migration 154's enum additions:
--
--   director_office_attribution → operating_pools.director_opex
--       Uses the existing routes_to_pool enum column. Knock-off credit
--       flows through the same credit_operating_pool_on_invoice_paid trigger.
--
--   director_attribution → dept_pools (Director dept)
--       dept_pools is a different table than operating_pools, so we can't
--       put it in the routes_to_pool enum. Instead, credit_operating_pool_on
--       _invoice_paid gets a second branch: if billing_mode='director_
--       attribution', insert into dept_pools (Director dept) as np_in.
--
-- Also seeds Director + Director Office departments if missing — either
-- may not exist depending on the user's setup history.
-- ============================================================================

-- ── 1) Seed departments if missing (idempotent) ─────────────────────────────

INSERT INTO departments (name)
SELECT 'Director'
WHERE NOT EXISTS (SELECT 1 FROM departments WHERE name = 'Director');

INSERT INTO departments (name)
SELECT 'Director Office'
WHERE NOT EXISTS (SELECT 1 FROM departments WHERE name = 'Director Office');

-- ── 2) Extend derive_invoice_routes_to_pool for Director Office ─────────────

CREATE OR REPLACE FUNCTION derive_invoice_routes_to_pool()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.routes_to_pool := CASE NEW.billing_mode
        WHEN 'hr_pool_split'               THEN 'hr_opex'::operating_pool_type
        WHEN 'finance_attribution'         THEN 'finance_opex'::operating_pool_type
        WHEN 'director_office_attribution' THEN 'director_opex'::operating_pool_type
        ELSE NULL
    END;
    RETURN NEW;
END;
$$;

-- Backfill existing invoices for the new mode (director_attribution stays NULL —
-- its credit flows via dept_pools, handled in the knock-off trigger below).
UPDATE invoices
   SET routes_to_pool = 'director_opex'::operating_pool_type
 WHERE billing_mode = 'director_office_attribution'
   AND routes_to_pool IS NULL;

-- ── 3) Extend credit_operating_pool_on_invoice_paid for director_attribution ─

CREATE OR REPLACE FUNCTION credit_operating_pool_on_invoice_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invoice     invoices%ROWTYPE;
    v_actor       UUID;
    v_director_dept_id UUID;
BEGIN
    -- Only act on billing_payment vouchers linked to an invoice
    IF NEW.voucher_type <> 'billing_payment'
       OR NEW.reference_type <> 'invoice'
       OR NEW.reference_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Only act on the moment of status->paid
    IF NEW.status <> 'paid' THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status = 'paid' THEN
        RETURN NEW;
    END IF;

    SELECT * INTO v_invoice FROM invoices WHERE id = NEW.reference_id;
    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    v_actor := COALESCE(NEW.approved_by, NEW.created_by);

    -- Branch 1: director_attribution → dept_pools (Director dept)
    IF v_invoice.billing_mode = 'director_attribution' THEN
        SELECT id INTO v_director_dept_id FROM departments WHERE name = 'Director';
        IF v_director_dept_id IS NOT NULL THEN
            INSERT INTO dept_pools (
                department_id, transaction_type, amount,
                period_month, description, created_by
            ) VALUES (
                v_director_dept_id,
                'np_in',
                NEW.amount,
                v_invoice.period_month,
                'Invoice settled — ' || COALESCE(v_invoice.invoice_no, 'no #') || ' — ' || NEW.payee_name,
                v_actor
            );
        ELSE
            RAISE NOTICE 'credit_operating_pool_on_invoice_paid: Director dept missing — skipping credit for invoice %', v_invoice.id;
        END IF;
        RETURN NEW;
    END IF;

    -- Branch 2: invoices with routes_to_pool set → operating_pools
    IF v_invoice.routes_to_pool IS NULL THEN
        RETURN NEW;  -- Marketing + non-billable + fixed_split: unrouted
    END IF;

    INSERT INTO operating_pools (
        pool_type, transaction_type, amount,
        reference_type, reference_id,
        period_month, description, created_by
    ) VALUES (
        v_invoice.routes_to_pool,
        'invoice_settled_in',
        NEW.amount,
        'payment_voucher',
        NEW.id,
        v_invoice.period_month,
        'Invoice settled — ' || COALESCE(v_invoice.invoice_no, 'no #') || ' — ' || NEW.payee_name,
        v_actor
    );

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION credit_operating_pool_on_invoice_paid IS
    'Task 4: extends migration 133 to route director_attribution invoices into dept_pools (Director dept) instead of operating_pools. director_office_attribution uses the routes_to_pool enum path (director_opex).';
