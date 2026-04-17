-- ============================================================================
-- 20260101000133_invoice_pool_routing.sql
-- Spec 3 (HR Payroll Redesign) — route invoices into per-department pools
-- HOUZS Venture Portal
--
-- Adds invoices.routes_to_pool and two triggers:
--   1. BEFORE INSERT/UPDATE of billing_mode: derive routes_to_pool from
--      billing_mode so every invoice knows which OPEX pool catches its cash.
--   2. AFTER UPDATE on payment_vouchers when a billing_payment voucher
--      transitions to 'paid': insert an invoice_settled_in row in
--      operating_pools for the invoice's routes_to_pool (NULL = Marketing,
--      which stays in dept_pools per plan).
--
-- Mapping:
--   hr_pool_split       -> hr_opex
--   finance_attribution -> finance_opex
--   marketing_project   -> NULL (dept_pools path — unchanged)
--   fixed_split         -> NULL (non-dept invoicing — no pool target today)
--   non_billable        -> NULL (never actually paid as revenue)
--
-- director_opex billing_mode is deferred until the director-OPEX invoicing
-- feature lands; operating_pool_type has the slot ready.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Column
-- ----------------------------------------------------------------------------

ALTER TABLE invoices
    ADD COLUMN routes_to_pool operating_pool_type;

COMMENT ON COLUMN invoices.routes_to_pool IS
    'Spec 3: which OPEX pool gets credited when this invoice is paid. NULL = Marketing (goes via dept_pools) or non-dept invoice.';

-- ----------------------------------------------------------------------------
-- 2) Derivation trigger — keeps routes_to_pool in sync with billing_mode
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION derive_invoice_routes_to_pool()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.routes_to_pool := CASE NEW.billing_mode
        WHEN 'hr_pool_split'       THEN 'hr_opex'::operating_pool_type
        WHEN 'finance_attribution' THEN 'finance_opex'::operating_pool_type
        ELSE NULL
    END;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_invoices_route_to_pool
    BEFORE INSERT OR UPDATE OF billing_mode ON invoices
    FOR EACH ROW
    EXECUTE FUNCTION derive_invoice_routes_to_pool();

-- Backfill existing invoices
UPDATE invoices
   SET routes_to_pool = CASE billing_mode
       WHEN 'hr_pool_split'       THEN 'hr_opex'::operating_pool_type
       WHEN 'finance_attribution' THEN 'finance_opex'::operating_pool_type
       ELSE NULL
   END
 WHERE routes_to_pool IS NULL;

-- ----------------------------------------------------------------------------
-- 3) Pool-credit trigger — fires when a billing_payment voucher is paid
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION credit_operating_pool_on_invoice_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invoice      invoices%ROWTYPE;
    v_actor        UUID;
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
        RETURN NEW;  -- already handled at earlier transition
    END IF;

    SELECT * INTO v_invoice FROM invoices WHERE id = NEW.reference_id;
    IF NOT FOUND OR v_invoice.routes_to_pool IS NULL THEN
        -- Marketing and other unrouted invoices stay in their existing flow
        RETURN NEW;
    END IF;

    -- Fall back to the voucher's approver for the audit trail attribution
    v_actor := COALESCE(NEW.approved_by, NEW.created_by);

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
    'Spec 3: when a billing_payment voucher flips to paid, credit the invoice''s routed operating_pool. SECURITY DEFINER so it works for finance under RLS.';

CREATE TRIGGER trg_credit_operating_pool_on_paid
    AFTER INSERT OR UPDATE OF status ON payment_vouchers
    FOR EACH ROW
    WHEN (NEW.status = 'paid' AND NEW.voucher_type = 'billing_payment')
    EXECUTE FUNCTION credit_operating_pool_on_invoice_paid();
