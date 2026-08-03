-- Multi-batch billing per period (2026-08-01, user: issued the drafts, then
-- "如果我用新的费用要开呢?").
--
-- The period-wide lock made an issued month read-only forever. Instead each
-- allocation now remembers WHICH invoice batch billed it (billed_ref =
-- the invoices.reference_no it went out under):
--   · new expenses can always be added to any month;
--   · Generate bills only allocations whose billed_ref is NULL or whose
--     batch's invoices were all deleted (drafts) — under a fresh reference
--     ALC-YYYYMM, then ALC-YYYYMM-2, -3, …;
--   · edit/delete locks are PER ALLOCATION: blocked only while its own
--     batch still has live invoices.
--
-- Backfill: months that already have ALC-YYYYMM invoices get that ref stamped
-- on their allocations (Aug 2026's four Job Street rows → ALC-202608).

ALTER TABLE alloc_txns ADD COLUMN IF NOT EXISTS billed_ref TEXT;

UPDATE alloc_txns t
SET billed_ref = 'ALC-' || to_char(t.period_month, 'YYYYMM')
WHERE t.billed_ref IS NULL
  AND EXISTS (
    SELECT 1 FROM invoices i
    WHERE i.reference_no = 'ALC-' || to_char(t.period_month, 'YYYYMM')
  );
