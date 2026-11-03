-- ════════════════════════════════════════════════════════════════════════════
-- Settings › Departments' *Bill back salary* asks the cell, not the kind (2026-11-03)
-- ════════════════════════════════════════════════════════════════════════════
-- The user ticked Bill back salary for HR and it sprang back. setDepartmentBillback asks Settings · Manage
-- (`categories.manage`), which a Finance-kind login holds, but the table's UPDATE policy was still January's
-- `current_user_role() = 'principal'` (20260101000011): for a Finance session the UPDATE matched no row and raised
-- nothing, so the action "succeeded" and the tick sprang back on the refresh.
--
-- 1. The UPDATE policy asks what `permission_table_writes` already lists for it (categories.manage, settings.manage —
--    `TABLE_WRITES.departments`), as every row policy since PR3c does (no `current_user_role()` in a policy).
-- 2. January kept UPDATE principal-only on purpose (20260824010000: a rename re-segments the books — dept_to_segment()
--    and the app key off the core department NAMES), and a department's mode is Department mode's
--    (`department_set_cost_model`, has_perm('department_mode')). So a SESSION's own UPDATE may now change the
--    bill-back alone; every other column changes through its own SECURITY DEFINER step (provision_full_department,
--    department_set_cost_model), which runs as the owner and is not this guard's. The app writes nothing else
--    straight to the table (checked 2026-11-03: `setDepartmentBillback` is its one `.update`).
-- INSERT (Add department, principal + finance by kind since 20260824010000) is left as it is.

DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'departments' AND policyname = 'departments_principal_update') THEN
    RAISE EXCEPTION 'departments_principal_update is not on the table — read production''s policies before changing them';
  END IF;
END
$guard$;

DROP POLICY IF EXISTS departments_principal_update ON public.departments;
DROP POLICY IF EXISTS departments_settings_update ON public.departments;
CREATE POLICY departments_settings_update ON public.departments
    FOR UPDATE TO authenticated
    USING ((SELECT public.has_any_action(ARRAY['categories.manage', 'settings.manage'])))
    WITH CHECK ((SELECT public.has_any_action(ARRAY['categories.manage', 'settings.manage'])));

CREATE OR REPLACE FUNCTION public.departments_session_writes_billback_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
    -- A signed-in session writing the table itself (not a DEFINER step, not a migration).
    IF current_user = 'authenticated'
       AND (to_jsonb(NEW) - 'own_share_billback') IS DISTINCT FROM (to_jsonb(OLD) - 'own_share_billback') THEN
        RAISE EXCEPTION 'Only Bill back salary changes here — a department''s name, segment, pool and mode change through their own steps'
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_departments_session_writes_billback_only ON public.departments;
CREATE TRIGGER trg_departments_session_writes_billback_only
    BEFORE UPDATE ON public.departments
    FOR EACH ROW EXECUTE FUNCTION public.departments_session_writes_billback_only();

COMMENT ON POLICY departments_settings_update ON public.departments IS
    'Settings · Manage (categories.manage / settings.manage) updates a department — the bill-back alone, by trg_departments_session_writes_billback_only (2026-11-03).';
