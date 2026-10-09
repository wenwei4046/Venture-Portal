-- ============================================================================
-- 20261010010000_team_directory.sql
-- Team · View without the Salary tick opens People (PR4b of the People
-- Management revamp, 2026-10-10 — the user chose 1b and 2b).
-- ============================================================================
--
-- The Executive office template (Team · View at All) and the Department head
-- template (Team · View at Dept) hold Team · View but not Salary amounts. The
-- `team` key the People pages asked for opens the staff table itself — pay
-- columns and all — so PR1's fail-closed rule held it back from both, and
-- People Management and Hierarchy stayed shut for them (CLAUDE.md › PR4).
--
-- They read People through two readers instead, never the table:
--
-- 1. A new key, `team_directory` (scope none: no domain, so no table's row
--    policy ever opens for it), opened by Team · View at ANY reach with no
--    gate. It is NOT one of the Team function's View keys (no
--    permission_key_actions row), so Team · Create / Edit / Manage still need
--    the `team` key exactly as before — this opens reading and nothing else.
-- 2. `team_directory(ids)` — the staff rows the caller's Team · View reaches
--    (All: everybody; Dept: their own department; Own: themselves), every
--    column a person page shows, except what is ticked away (1b: everything
--    but salary, NRIC and bank accounts): the pay figures are NULL without
--    Salary amounts, the NRIC and the account numbers •••• without their own
--    ticks — the rule PR4's readers apply. The columns are named one by one,
--    so a column added to the table later stays out until somebody adds it.
-- 3. `team_org_chart()` — every active person's chart facts (name, code,
--    title, department, who they report to) for any Team · View holder. 2b: a
--    Department head reads the whole company's chart with names and titles
--    only, and the roster of their own department through (2).
--
-- The `team` key's own path is untouched: HR and the Principal still read the
-- table under its row policies.

-- ── 1. The key ──────────────────────────────────────────────────────────────

INSERT INTO public.permission_defs (key, label, section, scope, description, sort_order)
VALUES ('team_directory', 'People directory', 'People', 'none',
        'The roster and the org chart without pay — names, titles, contact. Opened by Team · View at any reach; that reach decides whose rows.',
        111)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.permission_cell_keys (function_key, action, legacy_key, min_scope, gate)
VALUES ('team', 'view', 'team_directory', 'own', NULL)
ON CONFLICT (function_key, action, legacy_key) DO NOTHING;

-- ── 2. The roster, as far as Team · View reaches ────────────────────────────

CREATE OR REPLACE FUNCTION public.team_directory(p_staff_ids uuid[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS MATERIALIZED (
    SELECT (public.has_perm('team') OR public.has_perm('team_directory')) AS opens,
           public.current_actions() ->> 'team.view' AS reach,
           public.sees_sensitive('salary') AS salary,
           public.sees_sensitive('nric') AS nric,
           public.sees_sensitive('bank') AS bank,
           public.current_user_department_id() AS dept,
           auth.uid() AS uid
  )
  SELECT coalesce(jsonb_agg(
           jsonb_build_object(
             'id', s.id, 'employee_name', s.employee_name, 'employee_code', s.employee_code,
             'designation', s.designation, 'status', s.status, 'department_id', s.department_id,
             'home_sub_department_id', s.home_sub_department_id, 'title_id', s.title_id,
             'reports_to', s.reports_to, 'user_id', s.user_id, 'infotech_code', s.infotech_code,
             'hire_date', s.hire_date, 'resignation_date', s.resignation_date,
             'employment_type', s.employment_type, 'tax_mode', s.tax_mode,
             'epf_category', s.epf_category, 'socso_category', s.socso_category,
             'is_epf_exempt', s.is_epf_exempt, 'pcb_category', s.pcb_category,
             'children_count', s.children_count,
             'contact_number', s.contact_number, 'email', s.email, 'address', s.address,
             'emergency_contact_name', s.emergency_contact_name,
             'emergency_contact_phone', s.emergency_contact_phone,
             'emergency_contact_relationship', s.emergency_contact_relationship,
             'bank_name', s.bank_name, 'bank_name_2', s.bank_name_2,
             'created_by', s.created_by, 'created_at', s.created_at, 'updated_at', s.updated_at
           )
           || jsonb_build_object(
             -- What they are paid: only with Salary amounts ticked.
             'basic_salary', CASE WHEN me.salary THEN s.basic_salary END,
             'allowances', CASE WHEN me.salary THEN s.allowances END,
             'non_statutory_allowance', CASE WHEN me.salary THEN s.non_statutory_allowance END,
             'epf_er', CASE WHEN me.salary THEN s.epf_er END,
             'socso_er', CASE WHEN me.salary THEN s.socso_er END,
             'eis_er', CASE WHEN me.salary THEN s.eis_er END,
             'total_ctc', CASE WHEN me.salary THEN s.total_ctc END,
             'withholding_rate', CASE WHEN me.salary THEN s.withholding_rate END,
             -- PR4's rule: the value to a holder of the tick, •••• to anybody else, NULL as NULL.
             'nric', CASE WHEN nullif(btrim(s.nric), '') IS NULL OR me.nric THEN s.nric ELSE '••••' END,
             'bank_account_no', CASE WHEN nullif(btrim(s.bank_account_no), '') IS NULL OR me.bank
                                     THEN s.bank_account_no ELSE '••••' END,
             'bank_account_no_2', CASE WHEN nullif(btrim(s.bank_account_no_2), '') IS NULL OR me.bank
                                       THEN s.bank_account_no_2 ELSE '••••' END,
             'departments', CASE WHEN d.id IS NULL THEN NULL
                                 ELSE jsonb_build_object('name', d.name, 'payroll_source', d.payroll_source, 'segment_key', d.segment_key) END,
             'titles', CASE WHEN t.id IS NULL THEN NULL
                            ELSE jsonb_build_object('id', t.id, 'name', t.name, 'level_id', t.level_id,
                                                    'template_id', t.template_id, 'is_department_head', t.is_department_head) END,
             'users', CASE WHEN u.id IS NULL THEN NULL
                           ELSE jsonb_build_object('id', u.id, 'name', u.name, 'email', u.email, 'role', u.role,
                                                   'is_active', u.is_active, 'last_seen_at', u.last_seen_at) END
           )
           ORDER BY s.employee_name, s.id), '[]'::jsonb)
    FROM me
    CROSS JOIN public.hr_staff_costs s
    LEFT JOIN public.departments d ON d.id = s.department_id
    LEFT JOIN public.titles t ON t.id = s.title_id
    LEFT JOIN public.users u ON u.id = s.user_id
   WHERE me.opens
     AND (p_staff_ids IS NULL OR s.id = ANY (p_staff_ids))
     AND (me.reach = 'all'
          OR (me.reach = 'dept' AND me.dept IS NOT NULL AND s.department_id = me.dept)
          OR (me.reach = 'own' AND me.uid IS NOT NULL AND s.user_id = me.uid))
$$;

COMMENT ON FUNCTION public.team_directory(uuid[]) IS
  'People for a Team · View holder without the staff table (PR4b, 2026-10-10): the rows their reach covers, pay NULL without Salary amounts, NRIC / accounts •••• without their ticks.';

-- ── 3. The whole company's chart: names and titles ──────────────────────────

-- The chart also hangs each Revenue tree from its sub-department's director(s)
-- (CLAUDE.md › REVENUE DIRECTOR): which sub-departments there are and who
-- directs each come with the people — structure, not pay. A person's further
-- Revenue memberships (the commission tree) stay on Revenue's own chart.
CREATE OR REPLACE FUNCTION public.team_org_chart()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS MATERIALIZED (
    SELECT (public.has_perm('team') OR public.has_perm('team_directory'))
           AND public.current_actions() ? 'team.view' AS opens
  )
  SELECT CASE WHEN NOT me.opens THEN NULL ELSE jsonb_build_object(
    'people', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', s.id, 'employee_name', s.employee_name, 'employee_code', s.employee_code,
               'reports_to', s.reports_to, 'designation', s.designation, 'title_id', s.title_id,
               'department_id', s.department_id,
               'titles', CASE WHEN t.id IS NULL THEN NULL
                              ELSE jsonb_build_object('name', t.name, 'level_id', t.level_id, 'is_department_head', t.is_department_head) END,
               'departments', CASE WHEN d.id IS NULL THEN NULL
                                   ELSE jsonb_build_object('name', d.name, 'payroll_source', d.payroll_source) END
             ) ORDER BY s.employee_name, s.id), '[]'::jsonb)
        FROM public.hr_staff_costs s
        LEFT JOIN public.titles t ON t.id = s.title_id
        LEFT JOIN public.departments d ON d.id = s.department_id
       WHERE s.status = 'active'),
    'sub_departments', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('id', sd.id, 'name', sd.name, 'department_id', sd.department_id,
                                                   'created_at', sd.created_at) ORDER BY sd.name, sd.id), '[]'::jsonb)
        FROM public.comm_sub_departments sd
       WHERE sd.is_active),
    'directors', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('staff_id', x.staff_id, 'sub_department_id', x.sub_department_id)
                                ORDER BY x.sub_department_id, x.staff_id), '[]'::jsonb)
        FROM public.comm_sub_department_directors x)
  ) END
    FROM me
$$;

COMMENT ON FUNCTION public.team_org_chart() IS
  'The company chart for any Team · View holder (PR4b, 2026-10-10): every active person''s name, code, title, department and reporting line, the Revenue sub-departments and their directors. NULL without Team · View.';

REVOKE ALL ON FUNCTION public.team_directory(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.team_org_chart() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_directory(uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.team_org_chart() TO authenticated, service_role;
