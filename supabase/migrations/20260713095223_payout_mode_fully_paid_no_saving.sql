-- ─────────────────────────────────────────────────────────────────────────────
-- Fully Paid mode redefined (user 2026-07-13): staff-style payout.
--
-- fully_paid no longer deducts the 5% saving. The TS engine
-- (src/lib/salary.ts) now computes: no saving, no 75/25 — 100% of gross
-- (post advance-offset) pays as ONE standard payroll; invoice side stays
-- zeroed. Doc-only migration: updates the column comment. Historic rows
-- keep their snapshotted figures (only July 2026 ever used fully_paid,
-- still draft — HR recalculates it under the new rule).
-- ─────────────────────────────────────────────────────────────────────────────

COMMENT ON COLUMN director_payouts.payout_mode IS
    'split = 5% saving then 75% payroll / 25% invoice (classic); fully_paid = '
    'staff-style: NO saving, 100% of gross paid as one standard payroll, '
    'invoice side 0 (redefined 2026-07-13; was 95%-after-saving).';
