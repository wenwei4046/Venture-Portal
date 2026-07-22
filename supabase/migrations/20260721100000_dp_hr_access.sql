-- ============================================================================
-- 20260721100000_dp_hr_access.sql
-- Director Pool calculator: grant HR access (user decision 2026-07-21).
-- Replaces the principal-only policies on every dp_* table with
-- principal + hr. Finance / dept_manager remain excluded.
-- ============================================================================

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'dp_settings', 'dp_directors', 'dp_companies', 'dp_fixed_overrides',
        'dp_months', 'dp_inputs', 'dp_director_inputs', 'dp_contra'
    ] LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_principal_all', t);
        EXECUTE format(
            'CREATE POLICY %I ON %I FOR ALL USING (current_user_role() IN (''principal'', ''hr'')) WITH CHECK (current_user_role() IN (''principal'', ''hr''))',
            t || '_principal_hr_all', t
        );
    END LOOP;
END $$;
