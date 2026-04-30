-- ============================================================================
-- 20260101000224_fund_source_outsource_and_freetext.sql
-- Item 4 — Part 1/2: add 'outsource' enum value to fund_source_type.
--
-- Split from a single combined migration so the new enum value can commit
-- before any DDL references it. Codex adversarial review flagged that
-- `ALTER TYPE ... ADD VALUE` followed by a CHECK constraint referencing the
-- new value can fail on fresh replay because the new value isn't visible to
-- other statements until commit.
--
-- Companion migration 20260101000228 adds the from_freetext_name column,
-- backfills, and recreates the source_has_from CHECK constraint with the
-- new enum value safely visible.
-- ============================================================================

ALTER TYPE fund_source_type ADD VALUE IF NOT EXISTS 'outsource';
