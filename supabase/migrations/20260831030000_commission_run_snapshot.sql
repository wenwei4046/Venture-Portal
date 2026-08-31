-- ============================================================================
-- 20260831030000_commission_run_snapshot.sql
-- What a commission run has to remember, and where a payroll figure came from
-- HOUZS Venture Portal
--
-- Deliberately separate from the RPCs that follow (040000) for one reason:
-- `ALTER TYPE ... ADD VALUE` may not be USED in the transaction that adds it,
-- and every migration here runs as one transaction. The value is added now;
-- apply_commission_run() writes it next file.
--
-- Nothing in this file touches an existing row. The enum gains a value nobody
-- holds yet, and comm_runs gains three columns that default to empty arrays.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Where a payroll figure came from
--
-- The three existing values all describe a HUMAN putting the number there:
-- 'imported' is the InfoTech export read verbatim, 'manual' is a hand edit,
-- 'carried_forward' is last month copied. A Revenue Department row is none of
-- those — it is DERIVED, by the commission engine, from an ERP sales export,
-- and it is rewritten every time the run is recomputed.
--
-- It matters beyond a label. The payroll import writes 'imported' over whole
-- periods, and a person reading the grid needs to know that editing a
-- commission row by hand will be overwritten by the next Apply.
-- ----------------------------------------------------------------------------

ALTER TYPE hr_monthly_payroll_source ADD VALUE IF NOT EXISTS 'commission';

-- ----------------------------------------------------------------------------
-- The run's own snapshot of which orders paid, which waited, and which were cut
--
-- These could all be recomputed from sales_orders on demand, and the period
-- page does exactly that today. A run must not work that way: re-importing a
-- month replaces every sales_orders row, so a run that recomputed its own
-- history would silently change what it said it paid.
--
--   released_orders  — [{order_id, order_no, staff_id, order_period_month,
--                        product_revenue}]. apply_commission_run() copies these
--                        into comm_order_releases, which is what makes paying
--                        an order twice impossible.
--   deferred_orders  — held by the deposit gate. Not lost: each one pays in the
--                      month its deposit clears, and this is the evidence of
--                      how much commission is waiting on collections.
--   penalised_orders — bills whose margin fell into a penalty band, with what
--                      the penalty removed. Already reflected in the statement
--                      lines; kept here so the run can explain itself.
-- ----------------------------------------------------------------------------

ALTER TABLE comm_runs
    ADD COLUMN IF NOT EXISTS released_orders JSONB NOT NULL DEFAULT '[]'::JSONB,
    ADD COLUMN IF NOT EXISTS deferred_orders JSONB NOT NULL DEFAULT '[]'::JSONB,
    ADD COLUMN IF NOT EXISTS penalised_orders JSONB NOT NULL DEFAULT '[]'::JSONB;

COMMENT ON COLUMN comm_runs.released_orders IS
    'Orders this run pays for, snapshotted at compute time. apply_commission_run() turns each into a comm_order_releases row (UNIQUE order_no), so an order carried forward from a deposit-gated month can only ever be paid once.';
COMMENT ON COLUMN comm_runs.deferred_orders IS
    'Orders held back by the deposit gate at compute time. Nothing is lost — each pays in the month its deposit clears.';
COMMENT ON COLUMN comm_runs.penalised_orders IS
    'Bills that lost commission to a below-margin band, with the amount withheld. Memo only: the statement lines are already net of it.';

-- Reopening a run needs to know whether it was ever applied, and reversing one
-- needs to be visible. A run goes applied -> draft only through
-- reopen_commission_run(), which zeroes the payroll figures it wrote.
ALTER TABLE comm_runs
    ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reopened_by UUID REFERENCES users(id);

COMMENT ON COLUMN comm_runs.reopened_at IS
    'Last time an applied run was pulled back to draft. The reopen zeroes hr_monthly_payroll.commission_amount for its statements and deletes its comm_order_releases, so the orders return to the pool.';

COMMENT ON COLUMN hr_monthly_payroll.source IS
    'Where the figures came from. imported: the InfoTech export, verbatim. manual: a hand edit. carried_forward: last month copied. commission: DERIVED by the commission engine from an ERP sales export and rewritten on every Apply — a hand edit to such a row will not survive the next run.';
