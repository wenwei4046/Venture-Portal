-- Allow dept_manager to read their own submitted claims.
-- Previously only principal/finance/hr could SELECT from claims,
-- so dept_manager could submit but never see their claims.

CREATE POLICY claims_own_select ON claims
    FOR SELECT USING (
        current_user_role() = 'dept_manager'
        AND created_by = auth.uid()
    );

-- Also allow principal to update (approve/reject) any claim type
-- (principal should be able to approve both benefit and project claims)
DROP POLICY IF EXISTS claims_approvers_update ON claims;
CREATE POLICY claims_approvers_update ON claims
    FOR UPDATE USING (
        current_user_role() = 'principal'
        OR (claim_type = 'project' AND current_user_role() = 'finance')
        OR (claim_type = 'benefit' AND current_user_role() = 'hr')
    );
