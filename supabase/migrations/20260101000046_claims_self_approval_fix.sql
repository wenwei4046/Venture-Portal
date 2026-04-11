-- Fix: prevent self-approval of claims at RLS level (defense in depth).
-- Server Action also checks created_by !== user.id, but RLS is the
-- authoritative gate.  Also ensures Principal can approve any claim type.

DROP POLICY IF EXISTS claims_approvers_update ON claims;
CREATE POLICY claims_approvers_update ON claims
    FOR UPDATE USING (
        created_by != auth.uid()
        AND (
            current_user_role() = 'principal'
            OR (claim_type = 'project' AND current_user_role() = 'finance')
            OR (claim_type = 'benefit' AND current_user_role() = 'hr')
        )
    );
