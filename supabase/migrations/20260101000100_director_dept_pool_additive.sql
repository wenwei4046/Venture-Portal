-- ============================================================================
-- 20260101000100_director_dept_pool_additive.sql
-- Phase 7 Step 1 — ADDITIVE: seed Director dept + backfill salary_pool
-- snapshots into dept_pools. Does NOT drop salary_pool (deferred to Step 2).
-- Does NOT reroute any RPC. Safe to roll back.
-- Also drops 2 orphan RPCs from migration 000072 (director payout voucher
-- flow was discarded in favor of the Phase 7 redesign).
-- ============================================================================

BEGIN;

-- ─── 1) Seed Director department ─────────────────────────────────────────────
INSERT INTO departments (name) VALUES ('Director')
ON CONFLICT (name) DO NOTHING;

-- ─── 2) Backfill salary_pool snapshots → dept_pools ─────────────────────────
-- Each salary_pool row captures total_ctc_in for that month. Per Phase 7
-- design the full CTC lands in Director Pool as revenue pooling; the 5/75/25
-- split is internal accounting. Backfill preserves balance per period.
-- Idempotent: skips rows already backfilled (matched by description prefix).
INSERT INTO dept_pools (
    department_id,
    transaction_type,
    amount,
    period_month,
    description,
    created_by,
    created_at
)
SELECT
    (SELECT id FROM departments WHERE name = 'Director'),
    'np_in',
    sp.total_ctc_in,
    sp.period_month,
    'Backfill from salary_pool snapshot (Phase 7 Step 1)',
    NULL,
    sp.created_at
FROM salary_pool sp
WHERE sp.total_ctc_in IS NOT NULL
  AND sp.total_ctc_in > 0
  AND NOT EXISTS (
      SELECT 1 FROM dept_pools dp
      WHERE dp.department_id = (SELECT id FROM departments WHERE name = 'Director')
        AND dp.period_month = sp.period_month
        AND dp.description = 'Backfill from salary_pool snapshot (Phase 7 Step 1)'
  );

-- ─── 3) Ensure composite index for balance queries ──────────────────────────
CREATE INDEX IF NOT EXISTS dept_pools_dept_period_idx
    ON dept_pools (department_id, period_month);

-- ─── 4) Drop orphan RPCs from migration 000072 ──────────────────────────────
-- Director payout voucher flow was discarded in favor of the Phase 7 redesign
-- (director payout will deduct from Director Pool via payment_voucher_sources,
-- not via these Finance-safe peek RPCs).
DROP FUNCTION IF EXISTS list_director_payouts_to_pay(DATE);
DROP FUNCTION IF EXISTS get_director_payout_for_voucher(UUID);

COMMIT;
