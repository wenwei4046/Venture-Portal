-- Production's bodies (2026-10-21, read with pg_get_functiondef on gixpptmfuryskbwkmiwz) of the two triggers on
-- fund_source_repayments that a voucher's reversal meets: block_repayment_on_inactive_fund_source (BEFORE INSERT — a
-- repayment only on an active / matured source) and check_fund_source_fully_repaid (AFTER INSERT — principal covering
-- the source flips it to repaid). validate-fund-source-reversal.mjs checks each md5(prosrc) against production's.

CREATE OR REPLACE FUNCTION public.block_repayment_on_inactive_fund_source()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_status TEXT;
BEGIN
    SELECT status INTO v_status
    FROM fund_sources
    WHERE id = NEW.fund_source_id;

    IF v_status NOT IN ('active', 'matured') THEN
        RAISE EXCEPTION 'Cannot record repayment on fund source with status %', v_status;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_fund_source_fully_repaid()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_principal    DECIMAL(15, 2);
    v_total_paid   DECIMAL(15, 2);
    v_status       TEXT;
BEGIN
    -- Only check on principal payments
    IF NEW.payment_type <> 'principal' THEN
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
      AND payment_type = 'principal';

    IF v_total_paid >= v_principal THEN
        UPDATE fund_sources
        SET status = 'repaid',
            repaid_at = NOW(),
            repaid_by = NEW.created_by
        WHERE id = NEW.fund_source_id;
    END IF;

    RETURN NEW;
END;
$function$;
