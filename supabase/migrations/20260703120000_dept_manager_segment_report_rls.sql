-- Dept-manager own-department reports (2026-07). Applied to the live DB via MCP
-- apply_migration; file kept for repo parity.
--
-- Let a dept_manager read ONLY their own department's segment across the GL +
-- invoices, so the segment-scoped reports (P&L, Cash Flow, Debtor Aging) expose
-- nothing but their department — even a hand-typed ?segment= returns empty. The
-- reports read journal_lines / invoices via the RLS-respecting server client, so
-- these SELECT policies ARE the hard security boundary. Additive: principal /
-- finance policies are untouched (RLS policies are OR'd).

-- gl_segment of the currently logged-in dept_manager's department.
CREATE OR REPLACE FUNCTION public.current_user_segment()
RETURNS gl_segment
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT dept_to_segment(d.name)
  FROM users u JOIN departments d ON d.id = u.department_id
  WHERE u.id = auth.uid()
$$;

DROP POLICY IF EXISTS journal_entries_dept_manager_select ON journal_entries;
CREATE POLICY journal_entries_dept_manager_select ON journal_entries
  FOR SELECT TO public
  USING (
    current_user_role() = 'dept_manager'::user_role
    AND segment = current_user_segment()
  );

DROP POLICY IF EXISTS journal_lines_dept_manager_select ON journal_lines;
CREATE POLICY journal_lines_dept_manager_select ON journal_lines
  FOR SELECT TO public
  USING (
    current_user_role() = 'dept_manager'::user_role
    AND EXISTS (
      SELECT 1 FROM journal_entries je
      WHERE je.id = journal_lines.entry_id
        AND je.segment = current_user_segment()
    )
  );

DROP POLICY IF EXISTS invoices_dept_manager_select ON invoices;
CREATE POLICY invoices_dept_manager_select ON invoices
  FOR SELECT TO public
  USING (
    current_user_role() = 'dept_manager'::user_role
    AND billing_mode_to_segment(billing_mode::text) = current_user_segment()
  );