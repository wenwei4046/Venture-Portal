-- ============================================================================
-- 20261011131000_full_access_template_name.sql
-- "Full access" says what sets it apart from "Ultimate full access" (2026-10-11).
-- ============================================================================
--
-- No title points at "Full access": it is "Ultimate full access" less one
-- cell — switching to see the portal as HR, Finance or the Revenue team.
-- Asked whether to delete it, the user chose to keep it under a name that
-- says so ("Go with full access without switching view"), so a title is not
-- pointed at it by mistake for the full one. Data only: its key, its cells
-- and its description ("…without switching views.") stay.

UPDATE public.permission_templates
   SET name = 'Full access · no view switching', updated_at = now()
 WHERE key = 'full' AND name = 'Full access';
