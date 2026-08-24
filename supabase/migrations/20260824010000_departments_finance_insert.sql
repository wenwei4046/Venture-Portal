-- Manual department creation (2026-08-24, user: "要，principal 和 finance
-- 都可以加"). Settings gains a Departments tab where Principal AND Finance
-- can ADD departments. INSERT was principal-only; UPDATE stays principal-only
-- and the UI offers no rename at all — dept_to_segment() and a dozen TS maps
-- key off the FIVE core department NAMES, so renaming Marketing/HR/Finance/
-- Director Office/Director would silently re-segment their books. New
-- departments are "lightweight": staff/claims/inter-billing targets whose GL
-- folds into the Venture (corporate) segment until a full segment build is
-- done for them.

DROP POLICY IF EXISTS departments_principal_write ON departments;
CREATE POLICY departments_pf_insert ON departments
    FOR INSERT
    WITH CHECK (current_user_role() = ANY (ARRAY['principal'::user_role, 'finance'::user_role]));
