-- ============================================================================
-- 20261017140000_dept_manager_gone_data.sql
-- The Dept Manager goes (2026-10-17 — the user, asked whether the department manager's desktop needs Me: "no need,
-- may delete that template … 后面我就是开新的每一个部门，比如说 finance、HR 等等 … 这个就删掉吧 不需要了"; asked how far,
-- "全删：连程序一起拿掉"). Each department gets a view of its own later, as Finance and HR have.
-- ============================================================================
--
-- The data, first — so that nobody holds the kind or its department reach before the code and the policies that
-- served it go (20261017160000):
-- 1. The one title on the Department head template, MARKETING MANAGER (worn by SIA JOSIAH, no login), goes onto
--    Staff · Basic, as the department's other titles are.
-- 2. The Department head template (`dept_head`, base `dept_manager`) is deleted; its 14 cells go with it (ON DELETE
--    CASCADE) and the audit keeps each.
-- 3. The kind's role defaults (7 rows of `role_default_permissions`).
-- 4. The one login of the kind, marketing@venture.my, is closed: inactive, an ordinary staff kind with no template.
--    Not deleted: its 64 page views in `access_log` (audit) hold it (ON DELETE NO ACTION), and the audit is never
--    rewritten. Its sign-in is banned through the Auth admin API the same day.
-- Production state read 2026-10-17 (Explore inventory): no invoice, approval, pool, contract or request ever came
-- from it.

DO $guard$
DECLARE
  v_others integer;
BEGIN
  SELECT count(*) INTO v_others FROM public.users WHERE role = 'dept_manager' AND email IS DISTINCT FROM 'marketing@venture.my';
  IF v_others > 0 THEN
    RAISE EXCEPTION 'Another Dept Manager login appeared (%): decide about it before this runs', v_others;
  END IF;
END
$guard$;

-- 1. MARKETING MANAGER onto Staff · Basic.
UPDATE public.titles t
   SET template_id = s.id
  FROM public.permission_templates s, public.permission_templates d
 WHERE s.key = 'staff' AND d.key = 'dept_head' AND t.template_id = d.id;

-- 2. The template (and its cells).
DELETE FROM public.permission_templates WHERE key = 'dept_head';

-- 3. The kind's defaults.
DELETE FROM public.role_default_permissions WHERE role = 'dept_manager';

-- 4. marketing@: closed, not deleted.
UPDATE public.users SET is_active = false, role = 'staff' WHERE email = 'marketing@venture.my' AND role = 'dept_manager';
