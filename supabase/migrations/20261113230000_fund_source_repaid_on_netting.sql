-- A fund source repaid by contra (2026-11-13 — the user, of BI#36 HC 10,400 still "active" at RM 0.00: "这个是不是不应该
-- 出现了？" → "做"). A contra records the fund source's principal as 'netting' (approve_fund_contra), and
-- check_fund_source_fully_repaid counted only 'principal', so a source cleared by contra stayed active. It now counts
-- both, as fund_source_outstanding and isFundSourcePrincipal do: the source turns repaid once its principal is covered
-- (the same rule as an ordinary repayment). undo_fund_contra already reopens it.

CREATE OR REPLACE FUNCTION public.check_fund_source_fully_repaid()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_principal    DECIMAL(15, 2);
    v_total_paid   DECIMAL(15, 2);
    v_status       TEXT;
BEGIN
    -- Only principal and netting (a contra's principal) can repay it.
    IF NEW.payment_type NOT IN ('principal', 'netting') THEN
        RETURN NEW;
    END IF;

    SELECT f.amount, f.status
    INTO v_principal, v_status
    FROM fund_sources f
    WHERE f.id = NEW.fund_source_id;

    -- Only transition active/matured sources
    IF v_status NOT IN ('active', 'matured') THEN
        RETURN NEW;
    END IF;

    SELECT COALESCE(SUM(amount), 0)
    INTO v_total_paid
    FROM fund_source_repayments
    WHERE fund_source_id = NEW.fund_source_id
      AND payment_type IN ('principal', 'netting');

    IF v_total_paid >= v_principal THEN
        UPDATE fund_sources
        SET status = 'repaid',
            repaid_at = NOW(),
            repaid_by = NEW.created_by
        WHERE id = NEW.fund_source_id;
    END IF;

    RETURN NEW;
END;
$fn$;
