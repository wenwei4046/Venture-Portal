-- 20260806000100_payroll_run_self_approve.sql
-- Follow-up to 20260806000000: approve_payroll_run carried its own copy of the
-- self-approval guard ("approver cannot also be the submitter"). Same directive,
-- same reasoning — Principal is the sole approver, so the guard only ever
-- deadlocked runs the Principal submitted themselves.
--
-- Patched in place (same technique as mig 20260806000000): the RAISE becomes
-- NULL;, leaving the enclosing IF inert. reject_payroll_run has no such guard.

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
          AND p.proname = 'approve_payroll_run'
    LOOP
        v_def := regexp_replace(
            pg_get_functiondef(r.oid),
            'RAISE EXCEPTION\s+''approve_payroll_run: approver cannot also be the submitter'';',
            'NULL;',
            'g'
        );
        EXECUTE v_def;
    END LOOP;
END
$patch$;
