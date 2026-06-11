-- Inverse of mig 256: that trigger blocks POSTING journal lines to a header
-- account, but nothing stopped CREATING a child under an account that already
-- HAS postings — which silently turns the posted account into a header and
-- drops its lines off the leaf-only Trial Balance (Σ Dr ≠ Σ Cr). Happened
-- 2026-06-11: child 9095 was added under 9088 Advertisement, hiding 9088's
-- 2,807.34 claim from the TB until the line was re-pointed.
--
-- Any INSERT or UPDATE that sets chart_of_accounts.parent_code to an account
-- with existing journal_lines now fails loud with a move-the-postings-first
-- message.
-- (Applied via MCP apply_migration on 2026-06-11; file kept for repo parity.)

BEGIN;

CREATE OR REPLACE FUNCTION public.coa_reject_child_under_posted_account()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    v_posted BOOLEAN;
    v_parent_name TEXT;
BEGIN
    IF NEW.parent_code IS NULL THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.parent_code IS NOT DISTINCT FROM OLD.parent_code THEN
        RETURN NEW;
    END IF;

    SELECT TRUE INTO v_posted
      FROM journal_lines
     WHERE account_code = NEW.parent_code
     LIMIT 1;

    IF v_posted THEN
        SELECT name INTO v_parent_name
          FROM chart_of_accounts
         WHERE code = NEW.parent_code;

        RAISE EXCEPTION
            'Cannot create a sub-account under % (%): it already has journal postings. Move its postings to a leaf account first, then add the sub-account.',
            NEW.parent_code, COALESCE(v_parent_name, 'unknown');
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS coa_reject_child_under_posted_account ON public.chart_of_accounts;
CREATE TRIGGER coa_reject_child_under_posted_account
    BEFORE INSERT OR UPDATE OF parent_code ON public.chart_of_accounts
    FOR EACH ROW
    EXECUTE FUNCTION public.coa_reject_child_under_posted_account();

COMMIT;
