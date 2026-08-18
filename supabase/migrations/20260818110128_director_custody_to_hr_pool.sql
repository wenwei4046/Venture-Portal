-- Mig 20260818110128: director salary custody moves to the HR pool
-- (user decision 2026-08-18: "director pool fund out to hr pool, then 再由
--  hr pool 出粮出去").
--
-- ── The bug this fixes ──────────────────────────────────────────────────────
--
-- The custody model (mig 20260720140000) runs payroll funding in two halves,
-- both fired by approve_single_voucher on the funding PV:
--
--     drain  — take the money OUT of the pools that bear the cost
--              (one payment_voucher_sources row per source pool)
--     park   — put the FULL round INTO the custody pool (the request's
--              target_pool), which the payouts then drain
--
-- For staff the two halves point at different pools, so it works:
--
--     drain  Marketing / Finance / HR / Director Office   −99,755.35
--     park   HR pool                                      +99,755.35
--
-- Mig 20260727100000 gave directors the same pipeline but set
-- target_pool = 'dept_pool_director' ("so director money never swells HR's
-- pool"). The drain side for a run-less request is ALSO dept_pool_director
-- (get_payroll_breakdown_by_pool returns a single dept_pool_director row), so
-- both halves landed on the same pool and cancelled out:
--
--     drain  Director pool  −65,309.67
--     park   Director pool  +65,309.67   ← same pool, net zero
--
-- The money was never wrong — the balance still nets to the right figure
-- because the payouts drain the same pool afterwards. But every round leaves
-- a phantom ± pair in dept_pools, inflating the Director pool's cumulative
-- In and Out by the full round amount (RM 130,285.87 over Jun + Jul 2026) and
-- with it the In/Out columns on /dept-pool.
--
-- ── What changes ────────────────────────────────────────────────────────────
--
-- Custody moves to dept_pool_hr — the same transit pool staff already use —
-- and the director payouts + statutory drain it from there:
--
--     drain   Director pool  −65,309.67   ← Director still bears the cost
--     park    HR pool        +65,309.67   ← transit, same as staff
--     payout  HR pool        −43,135.67   ← the 4 directors
--     stat    HR pool        −22,174.00   ← EPF / SOCSO / EIS / PCB
--
-- HR pool nets to zero (it is transit, never a beneficiary); Director pool
-- takes exactly one clean debit. No phantom rows.
--
-- This reverses the direction of mig 213 (user decision 2026-04-26, "paying
-- them out from HR Pool was wrong — it bypassed the Director Pool entirely").
-- That concern is satisfied a different way now: the Director pool is still
-- the pool that bears the cost, via the drain side. What moved is only the
-- transit stop. Superseded knowingly (user decision 2026-08-18).
--
-- NOT changed: get_payroll_breakdown_by_pool's run-less branch still returns
-- dept_pool_director — that is the drain side, i.e. who pays, and it stays
-- Director. approve_single_voucher needs no edit either: its custody credit
-- already follows the request's target_pool (mig 20260727100000).
--
-- Historical rows are left untouched. The phantom pairs already booked for
-- Jun/Jul 2026 stay as they are; cleaning those is a separate data decision.

BEGIN;

-- ── 1. submit_director_salary_to_finance: file the request against HR ────────

DO $mig$
DECLARE
    v_src TEXT; v_anchor TEXT; v_repl TEXT; v_cnt INT;
BEGIN
    v_src := pg_get_functiondef('submit_director_salary_to_finance(date,uuid)'::regprocedure);

    v_anchor := $a$'dept_pool_director', 'submitted'$a$;
    v_repl   := $a$'dept_pool_hr', 'submitted'$a$;
    v_cnt := (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor);
    IF v_cnt <> 1 THEN
        RAISE EXCEPTION 'mig 20260818110128: submit target_pool anchor found % times', v_cnt;
    END IF;
    v_src := replace(v_src, v_anchor, v_repl);

    EXECUTE v_src;
END;
$mig$;

COMMENT ON FUNCTION submit_director_salary_to_finance(date, uuid) IS
    'Mig 20260818110128: the auto-filed funding request now targets '
    'dept_pool_hr — director money transits HR custody like staff, while the '
    'cost is still drained from dept_pool_director.';

-- ── 2. validate_payroll_payment_request_insert: expect dept_pool_hr ──────────

DO $mig$
DECLARE
    v_src TEXT; v_anchor TEXT; v_repl TEXT; v_cnt INT;
BEGIN
    v_src := pg_get_functiondef('validate_payroll_payment_request_insert()'::regprocedure);

    v_anchor := $a$NEW.target_pool <> 'dept_pool_director'$a$;
    v_repl   := $a$NEW.target_pool <> 'dept_pool_hr'$a$;
    v_cnt := (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor);
    IF v_cnt <> 1 THEN
        RAISE EXCEPTION 'mig 20260818110128: validate CHECK anchor found % times', v_cnt;
    END IF;
    v_src := replace(v_src, v_anchor, v_repl);

    v_anchor := $a$target_pool must be dept_pool_director, got %$a$;
    v_repl   := $a$target_pool must be dept_pool_hr (custody), got %$a$;
    v_cnt := (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor);
    IF v_cnt <> 1 THEN
        RAISE EXCEPTION 'mig 20260818110128: validate message anchor found % times', v_cnt;
    END IF;
    v_src := replace(v_src, v_anchor, v_repl);

    EXECUTE v_src;
END;
$mig$;

-- ── 3. create_payroll_disbursement_vouchers: director payouts drain HR ───────

DO $mig$
DECLARE
    v_src TEXT; v_anchor TEXT; v_repl TEXT; v_cnt INT;
BEGIN
    v_src := pg_get_functiondef('create_payroll_disbursement_vouchers(date,text,date)'::regprocedure);

    -- voucher.source_pool
    v_anchor := $a$'dept_pool_director', v_payout_bank_id,$a$;
    v_repl   := $a$'dept_pool_hr', v_payout_bank_id,$a$;
    v_cnt := (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor);
    IF v_cnt <> 1 THEN
        RAISE EXCEPTION 'mig 20260818110128: disbursement source_pool anchor found % times', v_cnt;
    END IF;
    v_src := replace(v_src, v_anchor, v_repl);

    -- payment_voucher_sources row (GL 4070 unchanged — only the pool moves)
    v_anchor := $a$'dept_pool_director', v_dir.payroll_net, '4070'$a$;
    v_repl   := $a$'dept_pool_hr', v_dir.payroll_net, '4070'$a$;
    v_cnt := (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor);
    IF v_cnt <> 1 THEN
        RAISE EXCEPTION 'mig 20260818110128: disbursement PVS anchor found % times', v_cnt;
    END IF;
    v_src := replace(v_src, v_anchor, v_repl);

    v_anchor := $a$drains dept_pool_director$a$;
    v_repl   := $a$drains dept_pool_hr (custody; mig 20260818110128)$a$;
    v_cnt := (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor);
    IF v_cnt <> 1 THEN
        RAISE EXCEPTION 'mig 20260818110128: disbursement comment anchor found % times', v_cnt;
    END IF;
    v_src := replace(v_src, v_anchor, v_repl);

    EXECUTE v_src;
END;
$mig$;

COMMENT ON FUNCTION create_payroll_disbursement_vouchers(date, text, date) IS
    'Mig 20260818110128: director payout vouchers now source from '
    'dept_pool_hr (the custody pool the funding round parked into), same as '
    'staff. Supersedes mig 213 — the Director pool still bears the cost, but '
    'via the funding drain rather than the payout.';

-- ── 4. create_payroll_statutory_vouchers: director share drains HR ───────────

DO $mig$
DECLARE
    v_src TEXT; v_anchor TEXT; v_repl TEXT; v_cnt INT;
BEGIN
    v_src := pg_get_functiondef('create_payroll_statutory_vouchers(date,text,date,uuid)'::regprocedure);

    v_anchor := $a$'dept_pool_director', v_dir_amt, v_acct$a$;
    v_repl   := $a$'dept_pool_hr', v_dir_amt, v_acct$a$;
    v_cnt := (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor);
    IF v_cnt <> 1 THEN
        RAISE EXCEPTION 'mig 20260818110128: statutory PVS anchor found % times', v_cnt;
    END IF;
    v_src := replace(v_src, v_anchor, v_repl);

    EXECUTE v_src;
END;
$mig$;

COMMENT ON FUNCTION create_payroll_statutory_vouchers(date, text, date, uuid) IS
    'Mig 20260818110128: both the staff and the director share now drain '
    'dept_pool_hr (custody). The two payment_voucher_sources rows are kept '
    'separate so the split stays legible, but they hit the same pool.';

-- ── 5. create_payroll_statutory_director_topup ──────────────────────────────
-- The "is the director share already carried?" probe keyed on the source row
-- being dept_pool_director. With both shares on dept_pool_hr that no longer
-- discriminates, so it moves to the voucher description, which mig
-- 20260731040000 guarantees matches the shares actually on the voucher
-- (' (staff)' / ' (directors)' / ' (staff + directors)').

DO $mig$
DECLARE
    v_src TEXT; v_anchor TEXT; v_repl TEXT; v_cnt INT;
BEGIN
    v_src := pg_get_functiondef('create_payroll_statutory_director_topup(date,text,date,uuid)'::regprocedure);

    v_anchor := $a$s.pool = 'dept_pool_director'$a$;
    v_repl   := $a$pv.description LIKE '%directors)%'$a$;
    v_cnt := (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor);
    IF v_cnt <> 1 THEN
        RAISE EXCEPTION 'mig 20260818110128: topup probe anchor found % times', v_cnt;
    END IF;
    v_src := replace(v_src, v_anchor, v_repl);

    -- voucher.source_pool
    v_anchor := $a$'dept_pool_director', v_bank.id,$a$;
    v_repl   := $a$'dept_pool_hr', v_bank.id,$a$;
    v_cnt := (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor);
    IF v_cnt <> 1 THEN
        RAISE EXCEPTION 'mig 20260818110128: topup source_pool anchor found % times', v_cnt;
    END IF;
    v_src := replace(v_src, v_anchor, v_repl);

    -- payment_voucher_sources row
    v_anchor := $a$'dept_pool_director', v_dir_amt, v_acct$a$;
    v_repl   := $a$'dept_pool_hr', v_dir_amt, v_acct$a$;
    v_cnt := (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor);
    IF v_cnt <> 1 THEN
        RAISE EXCEPTION 'mig 20260818110128: topup PVS anchor found % times', v_cnt;
    END IF;
    v_src := replace(v_src, v_anchor, v_repl);

    EXECUTE v_src;
END;
$mig$;

COMMENT ON FUNCTION create_payroll_statutory_director_topup(date, text, date, uuid) IS
    'Mig 20260818110128: drains dept_pool_hr (custody) like the main voucher; '
    'the already-carried probe reads the voucher description instead of the '
    'source pool, which no longer distinguishes the two shares.';

COMMIT;
