-- ============================================================================
-- 20261023214000_marketing_permission.sql
-- Marketing's own view joins the permission matrix (2026-10-23 — the user, handing over the Claude Design handoff
-- "HOUZS Marketing Module Setup": "这个东西是当做 Marketing Department 的 marketing view（一个单独的 department
-- view）… 这里其实就是他们的 desktop view"; asked who holds the manager tools: "MM + AMM"). The module's tables and
-- functions are the next migration.
-- ============================================================================
--
-- 1. The function `marketing` (Departments): View = Marketing's view — My Space, the Calendar, the projects, the
--    Library; Create = start a project, a quick task or a recurring task; Edit = work the stages one is on (accept,
--    fill in, submit, split into subtasks, review a delivery); Approve = approve a stage or send it back as its
--    approver; Manage = the manager tools — the Tracking Dashboard, the builders (workflows, products, minutes),
--    assignment plans, Replace Person, the clients, cost and margin. Every reach "all": the department's work is
--    the department's.
-- 2. The key `marketing`, scope none: no table's row policy opens on it — the module's tables are read and written
--    only through its own functions, which ask has_any_action. Opened by Marketing · View.
-- 3. A new tab view `mkt` (Marketing view): the tab ids' CHECKs and the two save functions' patterns take it — from
--    what production holds now (its patterns also carry `lead`, another branch's view), one alternative added.
-- 4. Who holds it: the shared Principal login (role default) and the full-access templates (Ultimate, Full); two new
--    templates — *Marketing · Manager* (every cell) and *Marketing · Staff* (View, Edit) — each with what Staff ·
--    Basic gives (the Overview, one's own claims, the meeting rooms), so nobody on them holds less than before, their
--    ticks stored: Marketing's view only. MARKETING MANAGER and ASSISTANT MARKETING MANAGER point at the manager's;
--    Marketing's other titles — those still on Staff · Basic — at the staff's.
-- 5. Its tabs in the database's copy of the registry, added by name — never seeded whole (production holds rows main
--    does not, the Leads tabs).
-- 6. History: an area `Marketing` for the module's tables. Notices: the kind `marketing`, its ref `mkt_project`.
-- Nobody loses anything. Running it twice changes nothing.

-- ── Helpers (this migration's own) ──────────────────────────────────────────

-- A check that lists values (`x = ANY (ARRAY['a', 'b'])`) widened by some, nothing it allowed dropped (other
-- sessions add values too) — 20261021020100's.
CREATE OR REPLACE FUNCTION pg_temp.widen_check(p_table regclass, p_name text, p_column text, p_add text[])
RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_def  text;
  v_vals text[];
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO v_def FROM pg_constraint c WHERE c.conrelid = p_table AND c.conname = p_name;
  IF v_def IS NULL THEN
    RAISE EXCEPTION '% has no constraint %', p_table, p_name;
  END IF;
  v_vals := ARRAY(SELECT DISTINCT btrim(v, '"') FROM regexp_matches(v_def, '''([^'']+)''', 'g') m,
                         unnest(CASE WHEN m[1] LIKE '{%}' THEN string_to_array(btrim(m[1], '{}'), ',') ELSE ARRAY[m[1]] END) v);
  IF v_vals @> p_add THEN
    RETURN;
  END IF;
  v_vals := ARRAY(SELECT DISTINCT x FROM unnest(v_vals || p_add) x ORDER BY x);
  EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', p_table, p_name);
  EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I CHECK (%I = ANY (ARRAY[%s]))', p_table, p_name, p_column,
                 (SELECT string_agg(quote_literal(x), ', ' ORDER BY x) FROM unnest(v_vals) x));
END
$fn$;

-- A tab-id pattern `^(hr|fin|pri|dept|rev…)\.` in a CHECK takes `mkt` — whatever else production's holds stays.
CREATE OR REPLACE FUNCTION pg_temp.tab_check_takes_mkt(p_table regclass, p_name text)
RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO v_def FROM pg_constraint c WHERE c.conrelid = p_table AND c.conname = p_name;
  IF v_def IS NULL THEN
    RAISE EXCEPTION '% has no constraint %', p_table, p_name;
  END IF;
  IF strpos(v_def, '|mkt') > 0 THEN
    RETURN;  -- taken already
  END IF;
  IF strpos(v_def, '|dept|rev') = 0 THEN
    RAISE EXCEPTION '%: its pattern has no "|dept|rev" — production changed since this migration was written', p_name;
  END IF;
  EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', p_table, p_name);
  EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s', p_table, p_name, replace(v_def, '|dept|rev', '|dept|rev|mkt'));
END
$fn$;

-- …and a function whose body holds such a pattern: production's body, the alternative added, nothing else touched.
CREATE OR REPLACE FUNCTION pg_temp.tab_pattern_takes_mkt(p_sig regprocedure)
RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_src text := (SELECT prosrc FROM pg_proc WHERE oid = p_sig);
BEGIN
  IF strpos(v_src, '|mkt') > 0 THEN
    RETURN;  -- taken already
  END IF;
  IF strpos(v_src, '|dept|rev') = 0 THEN
    RAISE EXCEPTION '%: its body has no "|dept|rev" — production changed since this migration was written', p_sig;
  END IF;
  EXECUTE replace(pg_get_functiondef(p_sig), '|dept|rev', '|dept|rev|mkt');
END
$fn$;

-- ── 1. The function ─────────────────────────────────────────────────────────

INSERT INTO public.permission_functions (key, label, section, actions, scopes, description, sort_order) VALUES
  ('marketing', 'Marketing', 'Departments', ARRAY['view', 'create', 'edit', 'approve', 'manage'], ARRAY['all'],
   'Marketing''s own view. View = My Space, the calendar, the projects and the Library; Create = start a project, a quick task or a recurring task; Edit = work the stages one is on; Approve = approve a stage or send it back; Manage = the manager tools (tracking, the workflow, product and minutes builders, assignment plans, Replace Person, clients, cost and margin).',
   145)
ON CONFLICT (key) DO NOTHING;

-- ── 2. The key ──────────────────────────────────────────────────────────────

INSERT INTO public.permission_defs (key, label, section, scope, description, sort_order) VALUES
  ('marketing', 'Marketing', 'Departments', 'none',
   'Marketing''s view — its projects, stages, calendar and Library. Opened by Marketing · View.', 145)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.permission_cell_keys (function_key, action, legacy_key, min_scope, gate) VALUES
  ('marketing', 'view', 'marketing', 'all', NULL)
ON CONFLICT (function_key, action, legacy_key) DO NOTHING;

INSERT INTO public.permission_key_actions (legacy_key, function_key, action) VALUES
  ('marketing', 'marketing', 'view'), ('marketing', 'marketing', 'create'), ('marketing', 'marketing', 'edit'),
  ('marketing', 'marketing', 'approve'), ('marketing', 'marketing', 'manage')
ON CONFLICT (legacy_key, function_key, action) DO NOTHING;

-- ── 3. The Marketing view's tabs may be stored ──────────────────────────────

SELECT pg_temp.tab_check_takes_mkt('public.permission_template_tabs', 'permission_template_tabs_tab_id_check');
SELECT pg_temp.tab_check_takes_mkt('public.user_permission_tabs', 'user_permission_tabs_tab_id_check');
SELECT pg_temp.tab_pattern_takes_mkt('public.permission_template_tabs_save(uuid, integer, text[], jsonb, text[], jsonb)'::regprocedure);
SELECT pg_temp.tab_pattern_takes_mkt('public.permission_user_tabs_set(uuid, jsonb, jsonb)'::regprocedure);

-- ── 4. Who holds it ─────────────────────────────────────────────────────────

INSERT INTO public.role_default_permissions (role, permission_key) VALUES ('principal', 'marketing')
ON CONFLICT (role, permission_key) DO NOTHING;

INSERT INTO public.permission_template_grants (template_id, function_key, action, scope)
SELECT t.id, 'marketing', a, 'all'
  FROM public.permission_templates t, unnest(ARRAY['view', 'create', 'edit', 'approve', 'manage']) a
 WHERE t.key IN ('ultimate', 'full')
ON CONFLICT (template_id, function_key, action) DO NOTHING;

INSERT INTO public.permission_templates (key, name, description, base_role, sort_order) VALUES
  ('mkt_manager', 'Marketing · Manager',
   'Marketing''s view with its manager tools: starts projects, plans who does what, approves, builds the workflows, products and minutes, sees cost and margin. Their own claims and the meeting rooms.',
   'staff', 92),
  ('mkt_staff', 'Marketing · Staff',
   'Marketing''s view: their space, the calendar, the projects and stages they are on, the Library. Their own claims and the meeting rooms.',
   'staff', 94)
ON CONFLICT (key) DO NOTHING;

-- What Staff · Basic gives, as it stands — so a title moved off it keeps all of it.
INSERT INTO public.permission_template_grants (template_id, function_key, action, scope)
SELECT m.id, g.function_key, g.action, g.scope
  FROM public.permission_templates m
  JOIN public.permission_templates s ON s.key = 'staff'
  JOIN public.permission_template_grants g ON g.template_id = s.id
 WHERE m.key IN ('mkt_manager', 'mkt_staff')
ON CONFLICT (template_id, function_key, action) DO NOTHING;

INSERT INTO public.permission_template_grants (template_id, function_key, action, scope)
SELECT t.id, 'marketing', g.action, 'all'
  FROM (VALUES ('mkt_manager', 'view'), ('mkt_manager', 'create'), ('mkt_manager', 'edit'), ('mkt_manager', 'approve'),
               ('mkt_manager', 'manage'), ('mkt_staff', 'view'), ('mkt_staff', 'edit')) AS g(template_key, action)
  JOIN public.permission_templates t ON t.key = g.template_key
ON CONFLICT (template_id, function_key, action) DO NOTHING;

-- A template whose ticks are stored keeps the new tabs open only when they are ticked.
INSERT INTO public.permission_template_tabs (template_id, tab_id, action)
SELECT t.id, x.tab_id, x.action
  FROM public.permission_templates t,
       (VALUES ('mkt.overview', 'view'), ('mkt.calendar', 'view'), ('mkt.projects', 'view'), ('mkt.projects', 'create'),
               ('mkt.projects', 'edit'), ('mkt.projects', 'approve'), ('mkt.tracking', 'view')) AS x(tab_id, action)
 WHERE t.key IN ('ultimate', 'full')
   AND EXISTS (SELECT 1 FROM public.permission_template_tabs y WHERE y.template_id = t.id)
ON CONFLICT (template_id, tab_id, action) DO NOTHING;

-- The two new templates keep their ticks: Marketing's view only. Worked out from their cells instead, Staff · Basic's
-- own claims and rooms would tick the Department view's tabs beside Marketing's (tabs of one reach are ticked side by
-- side), and the template would live in two views. Each tick stands for cells the template holds — none more.
INSERT INTO public.permission_template_tabs (template_id, tab_id, action)
SELECT t.id, x.tab_id, x.action
  FROM public.permission_templates t
  JOIN (VALUES ('mkt_manager', 'mkt.overview', 'view'), ('mkt_manager', 'mkt.calendar', 'view'),
               ('mkt_manager', 'mkt.projects', 'view'), ('mkt_manager', 'mkt.projects', 'create'),
               ('mkt_manager', 'mkt.projects', 'edit'), ('mkt_manager', 'mkt.projects', 'approve'),
               ('mkt_manager', 'mkt.tracking', 'view'),
               ('mkt_manager', 'mkt.my_claims', 'view'), ('mkt_manager', 'mkt.my_claims', 'create'),
               ('mkt_manager', 'mkt.my_claims', 'edit'),
               ('mkt_manager', 'mkt.meeting_rooms', 'view'), ('mkt_manager', 'mkt.meeting_rooms', 'create'),
               ('mkt_staff', 'mkt.overview', 'view'), ('mkt_staff', 'mkt.calendar', 'view'),
               ('mkt_staff', 'mkt.projects', 'view'), ('mkt_staff', 'mkt.projects', 'edit'),
               ('mkt_staff', 'mkt.my_claims', 'view'), ('mkt_staff', 'mkt.my_claims', 'create'),
               ('mkt_staff', 'mkt.my_claims', 'edit'),
               ('mkt_staff', 'mkt.meeting_rooms', 'view'), ('mkt_staff', 'mkt.meeting_rooms', 'create'))
       AS x(template_key, tab_id, action) ON x.template_key = t.key
ON CONFLICT (template_id, tab_id, action) DO NOTHING;

-- An editor left open on one saves over nothing it did not see.
UPDATE public.permission_templates SET version = version + 1, updated_at = now()
 WHERE key IN ('ultimate', 'full');

-- Marketing's titles: the two managers on the manager's template, the rest — those still on Staff · Basic (or on
-- none) — on the staff's. A title somebody already moved elsewhere keeps its template.
UPDATE public.titles t
   SET template_id = pt.id, updated_at = now()
  FROM public.departments d, public.permission_templates pt
 WHERE t.department_id = d.id AND d.segment_key = 'marketing'
   AND pt.key = CASE WHEN t.name IN ('MARKETING MANAGER', 'ASSISTANT MARKETING MANAGER') THEN 'mkt_manager' ELSE 'mkt_staff' END
   AND (t.template_id IS NULL OR t.template_id = (SELECT s.id FROM public.permission_templates s WHERE s.key = 'staff'));

-- ── 5. The tabs, in the database's copy of the registry ─────────────────────

INSERT INTO public.permission_page_tabs (page, tab_id) VALUES
  ('/marketing', 'mkt.overview'),
  ('/marketing/calendar', 'mkt.calendar'),
  ('/marketing/projects', 'mkt.projects'),
  ('/marketing/projects/[id]', 'mkt.projects'),
  ('/marketing/tracking', 'mkt.tracking'),
  ('/claims', 'mkt.my_claims'),
  ('/admin/rooms', 'mkt.meeting_rooms')
ON CONFLICT DO NOTHING;

INSERT INTO public.permission_tab_cells (tab_id, action, cell) VALUES
  ('mkt.overview', 'view', 'dashboard.view'),
  ('mkt.calendar', 'view', 'marketing.view'),
  ('mkt.projects', 'view', 'marketing.view'),
  ('mkt.projects', 'create', 'marketing.create'),
  ('mkt.projects', 'edit', 'marketing.edit'),
  ('mkt.projects', 'approve', 'marketing.approve'),
  ('mkt.tracking', 'view', 'marketing.manage'),
  ('mkt.my_claims', 'view', 'claims.view'),
  ('mkt.my_claims', 'create', 'claims.create'),
  ('mkt.my_claims', 'edit', 'claims.edit'),
  ('mkt.meeting_rooms', 'view', 'rooms.view'),
  ('mkt.meeting_rooms', 'create', 'rooms.create'),
  ('mkt.meeting_rooms', 'edit', 'rooms.edit')
ON CONFLICT DO NOTHING;

-- ── 6. History and notices ──────────────────────────────────────────────────

SELECT pg_temp.widen_check('public.audit_tables', 'audit_tables_area_check', 'area', ARRAY['Marketing']);
SELECT pg_temp.widen_check('public.app_notifications', 'app_notifications_kind_check', 'kind', ARRAY['marketing']);
SELECT pg_temp.widen_check('public.app_notifications', 'app_notifications_ref_kind_check', 'ref_kind', ARRAY['mkt_project']);
