-- ============================================================================
-- 20261016300400_lead_view_tabs_tickable.sql
-- Lead View (2026-10-16) is a sixth view of People › Permissions (`lead.*`,
-- src/lib/permission-tabs.ts TAB_VIEWS), so a template — "Customer Service",
-- once HR makes it — and a person's own boxes may tick its tabs.
-- ============================================================================
--
-- The two tables of ticks (mig 20261011010000) and the functions that check a
-- tick before saving it know five views by a pattern, '(hr|fin|pri|dept|rev)\.'.
-- Each learns the sixth:
--   1. the CHECK on permission_template_tabs.tab_id and user_permission_tabs.tab_id
--      (found by what they say, whatever their names);
--   2. every public function whose body holds the pattern: production's body,
--      that pattern alone swapped, nothing else in the body, its settings or its
--      grants moved (pg_get_functiondef + replace, as the guards' migrations do).
-- Refuses to finish if a pattern is left anywhere.

DO $do$
DECLARE
  r record;
  v_old constant text := '(hr|fin|pri|dept|rev)\.';
  v_new constant text := '(hr|fin|pri|dept|rev|lead)\.';
  v_def text;
BEGIN
  -- 1. The CHECKs.
  FOR r IN
    SELECT c.conrelid::regclass AS tbl, c.conname, pg_get_constraintdef(c.oid) AS def
      FROM pg_constraint c
     WHERE c.contype = 'c'
       AND c.conrelid IN ('public.permission_template_tabs'::regclass, 'public.user_permission_tabs'::regclass)
       AND position(v_old IN pg_get_constraintdef(c.oid)) > 0
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s', r.tbl, r.conname, replace(r.def, v_old, v_new));
  END LOOP;

  -- 2. The functions.
  FOR r IN
    SELECT p.oid, p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prokind = 'f' AND position(v_old IN p.prosrc) > 0
  LOOP
    v_def := pg_get_functiondef(r.oid);
    EXECUTE replace(v_def, v_old, v_new);
  END LOOP;

  -- Nothing left with five views only.
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND position(v_old IN p.prosrc) > 0)
     OR EXISTS (SELECT 1 FROM pg_constraint c
                 WHERE c.conrelid IN ('public.permission_template_tabs'::regclass, 'public.user_permission_tabs'::regclass)
                   AND position(v_old IN pg_get_constraintdef(c.oid)) > 0) THEN
    RAISE EXCEPTION 'a tab check still knows five views only';
  END IF;
END
$do$;

NOTIFY pgrst, 'reload schema';
