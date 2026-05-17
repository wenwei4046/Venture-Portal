-- 20260101000256_journal_lines_reject_header_post.sql
--
-- Mig 246 added the header-rejection trigger covering account_code on
-- `payment_voucher_sources`, `invoices`, and `fund_sources`. It does NOT
-- cover `journal_lines` directly. That gap let `approveRequestGroup`
-- (loan disbursement) post `Dr 3020 Loans Receivable / Cr Bank` even
-- after `3020` became a header (`3051 Amount Due From - Carres` was
-- added as its child). The 50,000 line on the header silently
-- disappeared from the Trial Balance (which filters to leaf accounts
-- only), producing a Σ Dr ≠ Σ Cr imbalance.
--
-- This migration plugs the gap: any INSERT or UPDATE on
-- `journal_lines.account_code` is rejected if it targets a header
-- (any account_code that is referenced as a parent_code by another
-- COA row). All future code paths — including handwritten SQL via the
-- Management API — fail loud at the DB layer instead of producing a
-- silent imbalance.

BEGIN;

CREATE OR REPLACE FUNCTION public.journal_lines_reject_header_post()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    v_has_child BOOLEAN;
    v_account_name TEXT;
BEGIN
    SELECT TRUE INTO v_has_child
      FROM chart_of_accounts
     WHERE parent_code = NEW.account_code
     LIMIT 1;

    IF v_has_child THEN
        SELECT name INTO v_account_name
          FROM chart_of_accounts
         WHERE code = NEW.account_code;

        RAISE EXCEPTION
            'journal_lines: cannot post to header account % (%). Use a leaf account (one of its children).',
            NEW.account_code, COALESCE(v_account_name, 'unknown');
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_journal_lines_reject_header_post ON journal_lines;
CREATE TRIGGER trg_journal_lines_reject_header_post
  BEFORE INSERT OR UPDATE OF account_code ON journal_lines
  FOR EACH ROW
  EXECUTE FUNCTION journal_lines_reject_header_post();

COMMIT;
