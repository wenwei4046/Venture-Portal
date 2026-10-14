-- ============================================================================
-- 20261015030000_attendance_permission.sql
-- HR › Attendance (2026-10-15, the Claude Design handoff "Attendance Prototype
-- Design": Today, Records, Requests, Leave balances, Month close, Settings,
-- Readiness). A new module joins the permission matrix ahead of its pages.
-- ============================================================================
--
-- 1. One function, every reach "all" (attendance is the company's):
--      attendance  View · Create · Edit · Approve
--                  View    every Attendance page (who is in, the month's
--                          records, requests, balances, the close, settings,
--                          readiness)
--                  Create  a request on somebody's behalf, leave booked by HR
--                  Edit    correct a day (Records), a whole day for everyone,
--                          a balance (opening / adjustment), the settings, the
--                          month close (decide a day, close, reopen)
--                  Approve decide a request — HR's step, or the upline's on
--                          their behalf
-- 2. One key, scope none (no row policy opens for it — the module's tables are
--    read and written only through its own functions, which ask
--    has_any_action): attendance.
-- 3. Accounts with no template: the Principal and HR.
-- 4. Templates: Ultimate, Full and HR every new cell.
--
-- Nobody loses anything; no page reads these cells until the pages land.

INSERT INTO public.permission_functions (key, label, section, actions, scopes, description, sort_order) VALUES
  ('attendance', 'Attendance', 'People', ARRAY['view', 'create', 'edit', 'approve'], ARRAY['all'],
   'Who is in today, the month''s records, leave and overtime requests, leave balances, the month close and the clock-in settings. Create = a request or leave booked on somebody''s behalf; Edit = correct days, balances, settings and close the month; Approve = decide a request.',
   125)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.permission_defs (key, label, section, scope, description, sort_order) VALUES
  ('attendance', 'Attendance', 'People', 'none',
   'Attendance: today, records, requests, leave balances, month close, settings and readiness. Opened by Attendance · View.', 125)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.permission_cell_keys (function_key, action, legacy_key, min_scope, gate) VALUES
  ('attendance', 'view', 'attendance', 'all', NULL)
ON CONFLICT (function_key, action, legacy_key) DO NOTHING;

INSERT INTO public.permission_key_actions (legacy_key, function_key, action) VALUES
  ('attendance', 'attendance', 'view'), ('attendance', 'attendance', 'create'),
  ('attendance', 'attendance', 'edit'), ('attendance', 'attendance', 'approve')
ON CONFLICT (legacy_key, function_key, action) DO NOTHING;

INSERT INTO public.role_default_permissions (role, permission_key) VALUES
  ('principal', 'attendance'), ('hr', 'attendance')
ON CONFLICT (role, permission_key) DO NOTHING;

INSERT INTO public.permission_template_grants (template_id, function_key, action, scope)
SELECT t.id, 'attendance', a, 'all'
  FROM public.permission_templates t, unnest(ARRAY['view', 'create', 'edit', 'approve']) a
 WHERE t.key IN ('ultimate', 'full', 'hr')
ON CONFLICT (template_id, function_key, action) DO NOTHING;

UPDATE public.permission_templates SET version = version + 1, updated_at = now()
 WHERE key IN ('ultimate', 'full', 'hr');
