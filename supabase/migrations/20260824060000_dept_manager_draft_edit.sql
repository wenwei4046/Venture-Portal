-- Dept managers manage their OWN draft invoices (2026-08-24, user: "dept
-- manager 改/删自己的 draft invoice 补上"). Scope is triple-locked: draft
-- status only + own segment (billing mode) + rows they created themselves.
-- Issued/paid invoices stay untouchable; Finance/Principal policies are
-- unchanged (permissive policies OR together).

CREATE POLICY invoices_dept_manager_update ON invoices
    FOR UPDATE
    USING (
        current_user_role() = 'dept_manager'::user_role
        AND status = 'draft'::invoice_status
        AND created_by = auth.uid()
        AND billing_mode_to_segment((billing_mode)::text) = current_user_segment()
    );

CREATE POLICY invoices_dept_manager_delete ON invoices
    FOR DELETE
    USING (
        current_user_role() = 'dept_manager'::user_role
        AND status = 'draft'::invoice_status
        AND created_by = auth.uid()
        AND billing_mode_to_segment((billing_mode)::text) = current_user_segment()
    );
