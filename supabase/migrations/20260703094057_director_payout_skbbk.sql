-- ─────────────────────────────────────────────────────────────────────────────
-- Director Salary: add SKBBK deduction (user request 2026-07-03).
--
-- Same semantics as hr_monthly_payroll.skbbk_amount (migration 20260703080000):
-- SKBBK is a PERKESO employee deduction taken from the employee's own gross.
-- NET-ONLY —
--   payroll_net = payroll_gross − EPF ER/EE − SOCSO ER/EE − EIS ER/EE
--                 − PCB − SKBBK
-- Payroll gross, the statutory wage base, PCB, ER OUT and the statutory
-- surplus are all UNCHANGED.
--
-- Manual entry on the payout detail page (no lookup table). The calculation
-- engine always writes fresh draft rows, so a recalculation resets SKBBK to 0
-- — same lifecycle as PCB / statutory overrides.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE director_payouts
    ADD COLUMN IF NOT EXISTS payroll_skbbk DECIMAL(15, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN director_payouts.payroll_skbbk IS
    'SKBBK employee deduction (RM) on the 75% payroll — keyed by HR on the payout detail page. NET-ONLY: subtracted after statutory + PCB; gross, statutory wage base, ER OUT and surplus are unaffected. Reset to 0 on recalculation.';
