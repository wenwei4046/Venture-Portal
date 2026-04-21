-- Mig 202: P1-6b fix — credit_dept_pool_on_invoice_paid posts a JE.
--
-- Drift
-- -----
-- When a billing_payment PV is paid, this trigger credits the corresponding
-- dept pool (np_in) without a matching journal entry. GL does not reflect
-- the equity movement into the dept pool.
--
-- Model
-- -----
-- Approach: treat the dept pool credit as an internal reclassification
-- from HV Operating Fund → Dept Pool (both equity). This preserves revenue
-- recognition in 4030 (set up by mig 203 AR accrual in approveInvoice), and
-- keeps the PV settlement JE (dr bank / cr 1040 AR) untouched.
--
--     dr 3010 HV Operating Fund  X
--     cr 3xxx Dept Pool          X
--     reference_type = 'invoice_paid_credit'
--
-- Rationale: the revenue earned from this invoice is attributed to the
-- department that owns the billing_mode. Rather than re-routing the
-- revenue account, we reclassify equity once the cash has landed: HV's
-- operating fund "pays forward" the dept pool. Net effect across all JEs
-- for one invoice issue+paid cycle:
--   · Bank     +X  (PV paid)
--   · AR        0  (accrued at issue, settled at paid)
--   · Revenue  +X  (accrued at issue)
--   · HV Op   -X   (reclassified to dept pool here)
--   · Dept Pl +X   (new equity here)
-- Equity net: +X (from revenue), correctly landing in the dept pool.

BEGIN;

CREATE OR REPLACE FUNCTION credit_dept_pool_on_invoice_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invoice      invoices%ROWTYPE;
    v_dept_name    TEXT;
    v_dept_id      UUID;
    v_actor        UUID;
    v_gl_code      VARCHAR(20);
BEGIN
    IF NEW.voucher_type <> 'billing_payment'
       OR NEW.reference_type <> 'invoice'
       OR NEW.reference_id IS NULL THEN
        RETURN NEW;
    END IF;

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

    v_dept_name := CASE v_invoice.billing_mode
        WHEN 'hr_attribution'              THEN 'HR'
        WHEN 'finance_attribution'         THEN 'Finance'
        WHEN 'director_office_attribution' THEN 'Director Office'
        WHEN 'director_attribution'        THEN 'Director'
        WHEN 'marketing_project'           THEN 'Marketing'
        ELSE NULL
    END;

    IF v_dept_name IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT id INTO v_dept_id FROM departments WHERE name = v_dept_name;
    IF v_dept_id IS NULL THEN
        RAISE NOTICE 'credit_dept_pool_on_invoice_paid: department % not found', v_dept_name;
        RETURN NEW;
    END IF;

    v_actor := COALESCE(NEW.approved_by, NEW.created_by);

    -- Existing behaviour (unchanged): dept_pools np_in row.
    INSERT INTO dept_pools (
        department_id, transaction_type, amount,
        period_month, description, created_by
    ) VALUES (
        v_dept_id,
        'np_in',
        NEW.amount,
        COALESCE(v_invoice.period_month, DATE_TRUNC('month', CURRENT_DATE)::DATE),
        'Invoice ' || COALESCE(v_invoice.invoice_no, 'no #') || ' settled — ' || NEW.payee_name,
        v_actor
    );

    -- Mig 202: post the equity reclassification JE.
    v_gl_code := dept_pool_gl_code(v_dept_name);
    IF v_gl_code IS NULL THEN
        RAISE EXCEPTION
            'credit_dept_pool_on_invoice_paid: no GL code for dept "%"',
            v_dept_name;
    END IF;

    PERFORM post_journal_entry(
        COALESCE(NEW.payment_date, CURRENT_DATE),
        format('Dept Pool credited from invoice %s settlement',
               COALESCE(v_invoice.invoice_no, NEW.reference_id::TEXT)),
        'invoice_paid_credit',
        NEW.id,
        v_actor,
        jsonb_build_array(
            jsonb_build_object('account_code', '3010',
                               'debit',  NEW.amount,
                               'description', 'HV Operating Fund → ' || v_dept_name || ' Pool'),
            jsonb_build_object('account_code', v_gl_code,
                               'credit', NEW.amount,
                               'description', v_dept_name || ' Pool funded from invoice settlement')
        )
    );

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION credit_dept_pool_on_invoice_paid IS
    'Mig 202 (P1-6b drift fix): credits dept pool np_in AND posts balanced JE dr 3010 HV Operating Fund / cr 3xxx Dept Pool.';

COMMIT;
