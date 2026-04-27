-- ============================================================================
-- 20260101000218_pvs_account_override.sql
-- Per-source GL/account_type override on payment_voucher_sources.
--
-- Why
-- ---
-- Decision B (user 2026-04-28): the BS/PL preview on the PV form is
-- auto-derived from category, but the user wants the option to override per
-- source row when the situation truly demands it (one-off reclassification,
-- unusual one-time entry). Override carries a mandatory reason for audit.
--
-- Override fields are NULL by default → category drives. Only when set do
-- approval_single_voucher / approve_voucher_batch override the GL account
-- when posting the journal entry. Keeps category-level config the norm and
-- override the exception.
--
-- Constraint: when any override field is set, ALL THREE must be set together
-- (account_type, gl_account_code, reason) to avoid half-overridden rows.
-- ============================================================================

BEGIN;

ALTER TABLE payment_voucher_sources
    ADD COLUMN override_account_type account_type,
    ADD COLUMN override_gl_account_code VARCHAR(20) REFERENCES chart_of_accounts(code),
    ADD COLUMN override_reason TEXT;

COMMENT ON COLUMN payment_voucher_sources.override_account_type IS
    'Per-row override of category.account_type. NULL means follow category. When set, override_gl_account_code and override_reason must also be set.';
COMMENT ON COLUMN payment_voucher_sources.override_gl_account_code IS
    'Per-row override of category.gl_account_code. NULL means follow category. Must agree with override_account_type when set.';
COMMENT ON COLUMN payment_voucher_sources.override_reason IS
    'Required when override_account_type is set. Free-text auditor-readable reason for the override.';

ALTER TABLE payment_voucher_sources
    ADD CONSTRAINT pvs_override_all_or_none
    CHECK (
        (override_account_type IS NULL
         AND override_gl_account_code IS NULL
         AND override_reason IS NULL)
        OR
        (override_account_type IS NOT NULL
         AND override_gl_account_code IS NOT NULL
         AND override_reason IS NOT NULL
         AND length(trim(override_reason)) > 0)
    );

-- Trigger to validate override pair matches chart_of_accounts.type
CREATE OR REPLACE FUNCTION pvs_override_consistency_check()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_gl_type account_type;
BEGIN
    IF NEW.override_gl_account_code IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT type INTO v_gl_type
      FROM chart_of_accounts
     WHERE code = NEW.override_gl_account_code;

    IF v_gl_type IS NULL THEN
        RAISE EXCEPTION
            'pvs_override: GL account "%" not in chart_of_accounts',
            NEW.override_gl_account_code;
    END IF;

    IF v_gl_type <> NEW.override_account_type THEN
        RAISE EXCEPTION
            'pvs_override: GL account % is type=% but override_account_type=%',
            NEW.override_gl_account_code, v_gl_type, NEW.override_account_type;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pvs_override_consistency_check_trigger ON payment_voucher_sources;
CREATE TRIGGER pvs_override_consistency_check_trigger
    BEFORE INSERT OR UPDATE ON payment_voucher_sources
    FOR EACH ROW
    EXECUTE FUNCTION pvs_override_consistency_check();

COMMIT;
