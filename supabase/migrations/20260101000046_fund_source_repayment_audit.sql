-- ============================================================================
-- 20260101000046_fund_source_repayment_audit.sql
-- Track who/when a fund source was marked repaid + audit the state transition.
-- HOUZS Venture Portal (VP)
--
-- Background: prior to this migration, repaying a fund source flipped
-- `status` to 'repaid' with only `updated_at` as metadata — no record of
-- which Finance user pressed the button. Principal had no way to audit
-- "did HV actually wire the principal back to the subsidiary?".
--
-- Changes:
--   1. Add `repaid_at` + `repaid_by` columns on fund_sources
--   2. Backfill existing repaid rows with repaid_at = updated_at
--   3. Integrity check: status=repaid requires repaid_at
--   4. Trigger on status transitions → config_audit_log (reuses the existing
--      SECURITY DEFINER log_config_change() which falls through to NEW.id for
--      unknown table_names, so no function change needed)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Columns
-- ----------------------------------------------------------------------------

ALTER TABLE fund_sources
    ADD COLUMN repaid_at TIMESTAMPTZ,
    ADD COLUMN repaid_by UUID REFERENCES users(id);

COMMENT ON COLUMN fund_sources.repaid_at IS
    'When this source was marked repaid. For rows repaid before this migration, backfilled from updated_at as best-known approximation.';
COMMENT ON COLUMN fund_sources.repaid_by IS
    'Which Finance user marked it repaid. NULL for rows repaid before this migration (historically unknown).';

-- ----------------------------------------------------------------------------
-- 2. Backfill existing repaid rows
--
-- Prior repayments only left updated_at as a timestamp and no record of which
-- user clicked the button. Use updated_at as the best-known `repaid_at` and
-- leave `repaid_by` NULL for historical rows — the UI renders "by —" for
-- unknown actors.
-- ----------------------------------------------------------------------------

UPDATE fund_sources
SET repaid_at = updated_at
WHERE status = 'repaid' AND repaid_at IS NULL;

-- ----------------------------------------------------------------------------
-- 3. Integrity
--
-- Defensive check: status=repaid requires a repaid_at timestamp so we never
-- end up with a repaid row that has no repayment date. `repaid_by` stays
-- nullable so historical rows pass (repaid_by is unknown for them); new
-- repayments are set via the server action and flow through to the UI.
-- ----------------------------------------------------------------------------

ALTER TABLE fund_sources
    ADD CONSTRAINT repaid_at_when_repaid CHECK (
        status <> 'repaid' OR repaid_at IS NOT NULL
    );

-- ----------------------------------------------------------------------------
-- 4. Audit trigger on status transitions
--
-- config_audit_log has SECURITY DEFINER log_config_change() that bypasses the
-- no-insert RLS policy. Its row_key extraction has an ELSE fallthrough to
-- NEW.id::TEXT, so fund_sources rows are keyed by their UUID automatically.
--
-- The WHEN clause ensures we only write an audit row on an actual status
-- change, not every UPDATE (notes edit, version bump, etc.).
-- ----------------------------------------------------------------------------

CREATE TRIGGER fund_sources_status_audit
    AFTER UPDATE ON fund_sources
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION log_config_change();

COMMENT ON TRIGGER fund_sources_status_audit ON fund_sources IS
    'Writes a row to config_audit_log whenever a fund source transitions state (active → matured → repaid, etc.). row_key = fund_sources.id. Surface via /fund-in/<id> or audit export.';
