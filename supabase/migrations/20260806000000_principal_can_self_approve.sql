-- 20260806000000_principal_can_self_approve.sql
-- Principal may approve their own submissions (user directive 2026-08-06).
--
-- Why: Principal is the only approver in the portal. Since View-as (PR #19) the
-- Principal routinely creates a PV while masked as HR/Finance, switches back to
-- Principal, and finds the card unapprovable. no_self_approval left those
-- requests permanently stuck — nobody in the system could approve OR reject
-- them (PV-0111 on 2026-07-24; the Aug-2026 payroll disbursement group of 32
-- vouchers, RM 75,850.50). return_voucher_to_draft was the workaround; it stays
-- as an escape hatch but is no longer the only way out.
--
-- Scope: Principal only. Finance / HR / dept_manager still cannot approve their
-- own claims — claims_approvers_update keeps that block for non-principals.
--
--   1. drop CHECK no_self_approval on approval_requests
--   2. strip the "cannot approve own submission" guard from the 3 approve RPCs
--   3. claims_approvers_update: exempt principal from created_by <> auth.uid()

-- 1 ── approval_requests CHECK ───────────────────────────────────────────────
-- approved_by is only ever written by an approve RPC / Server Action that
-- already runs requireRole(['principal']), so dropping the CHECK does not open
-- self-approval to any other role.
ALTER TABLE approval_requests DROP CONSTRAINT IF EXISTS no_self_approval;

COMMENT ON TABLE approval_requests IS
    'Cross-cutting approval queue. All modules submit here; Principal approves. '
    'Self-approval allowed since mig 20260806000000 — Principal is the sole '
    'approver and View-as makes self-submission routine.';

-- 2 ── approve RPC guards ───────────────────────────────────────────────────
-- approve_single_voucher / approve_voucher_batch / approve_voucher_batch_partial
-- are 300-700 lines each and get re-declared by many later migrations;
-- re-pasting their bodies here would guarantee drift. Patch the guard statement
-- in place instead — the RAISE becomes NULL;, leaving the enclosing IF inert.
-- (Plain NULL; with no trailing comment: two of the three guards are written on
-- a single line, so a -- comment would swallow their END IF;)
DO $patch$
DECLARE
    r RECORD;
    v_def TEXT;
BEGIN
    FOR r IN
        SELECT p.oid, p.proname
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.prokind = 'f'
          AND p.proname IN (
              'approve_single_voucher',
              'approve_voucher_batch',
              'approve_voucher_batch_partial'
          )
    LOOP
        v_def := regexp_replace(
            pg_get_functiondef(r.oid),
            'RAISE EXCEPTION ''[a-z_]+: cannot approve own submission'';',
            'NULL;',
            'g'
        );
        EXECUTE v_def;
        RAISE NOTICE 'patched self-approval guard out of %', r.proname;
    END LOOP;
END
$patch$;

-- 3 ── claims: principal exempt, other approvers still blocked ───────────────
DROP POLICY IF EXISTS claims_approvers_update ON claims;

CREATE POLICY claims_approvers_update ON claims
    FOR UPDATE
    USING (
        current_user_role() = 'principal'::user_role
        OR (
            created_by <> auth.uid()
            AND (
                (claim_type = 'project'::claim_type AND current_user_role() = 'finance'::user_role)
                OR (claim_type = 'benefit'::claim_type AND current_user_role() = 'hr'::user_role)
            )
        )
    );

COMMENT ON POLICY claims_approvers_update ON claims IS
    'Principal may approve any claim including their own (mig 20260806000000). '
    'Finance/HR still cannot approve a claim they created themselves.';
