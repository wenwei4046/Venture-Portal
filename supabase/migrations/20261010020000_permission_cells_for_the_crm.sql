-- ============================================================================
-- 20261010020000_permission_cells_for_the_crm.sql
-- The CRM joins the permission matrix (2026-10-10; user: the CRM is for the
-- Revenue team's members, and the Revenue Director and the CEO run its
-- assignment, ads and every setting).
-- ============================================================================
--
-- The CRM (migs 20261002*–20261009230000, its colleague's) decides everything
-- from a TITLE: crm_role_map, IR's memberships, "the Principal is the Boss".
-- Nothing in the matrix could open it, close it or hand somebody its Control
-- panel. This file is the matrix half — the row, its keys, the templates; the
-- CRM's own functions ask these cells in 20261010030000.
--
-- 1. The function `crm` (People, after the Revenue app): View · Edit · Manage,
--    reach Own or All.
--      View · Own   open their CRM: their customers, and their team's below them
--      View · All   everybody's customers — the Control panel's boards
--      Edit · Own   work their customers: reply, book, outcomes, share and move
--      Edit · All   act in anybody's chat
--      Manage       assignment (organic leads, ads to teams, full time), ads,
--                   showrooms — the Control panel's settings
-- 2. Two keys, both scope none (no table's row policy opens for them):
--    `member_crm` (View at any reach opens it) and `crm_manage` (Manage). They
--    are the function's View keys (permission_key_actions), so has_action()
--    asks for one of them, and a Revenue app account may hold them
--    (current_permissions()'s member allowlist learns both — the one
--    statement swapped in production's body).
-- 3. The shared Principal login (no template) gets `crm_manage` by default —
--    the Boss's Control panel, as before. A Revenue app account with NO
--    template gets no CRM: the matrix decides through the title's template.
-- 4. Templates: Revenue Team + View and Edit at Own; a new Revenue Director
--    template (the Revenue app + every CRM cell at All) for the Revenue
--    Director title, which wore Revenue Team; Ultimate and Full + every CRM
--    cell at All. Nobody who signs in today moves: no Revenue title has a
--    login, and the Principal's login keeps the Control panel.

-- ── The production this was written against ────────────────────────────────

CREATE OR REPLACE FUNCTION pg_temp.swap_check(p_sig regprocedure, p_old text, p_new text)
RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_src   text := (SELECT prosrc FROM pg_proc WHERE oid = p_sig);
  v_pat   text;
  v_found text;
  v_n     integer;
BEGIN
  IF strpos(v_src, p_new) > 0 THEN
    RETURN;  -- already swapped
  END IF;
  -- The old statement, every run of whitespace matching any run.
  v_pat := regexp_replace(regexp_replace(p_old, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'), '\s+', '\\s+', 'g');
  SELECT count(*) INTO v_n FROM regexp_matches(v_src, v_pat, 'g');
  IF v_n <> 1 THEN
    RAISE EXCEPTION '%: its check is there % times, not once — production changed since this migration was written', p_sig, v_n;
  END IF;
  v_found := (regexp_match(v_src, '(' || v_pat || ')'))[1];
  EXECUTE replace(pg_get_functiondef(p_sig), v_found, p_new);
END
$fn$;

-- ── 1. The function ─────────────────────────────────────────────────────────

INSERT INTO public.permission_functions (key, label, section, actions, scopes, description, sort_order)
VALUES ('crm', 'CRM', 'People', ARRAY['view', 'edit', 'manage'], ARRAY['own', 'all'],
        'The Revenue team''s WhatsApp and Messenger customers and their showroom visits. Own: their own customers and their team''s below them; All: everybody''s (the Control panel). Edit = reply, book, share and move; Manage = assignment, ads, full time and showrooms.',
        129)
ON CONFLICT (key) DO NOTHING;

-- ── 2. The keys ─────────────────────────────────────────────────────────────

INSERT INTO public.permission_defs (key, label, section, scope, description, sort_order) VALUES
  ('member_crm', 'Member CRM', 'Revenue member', 'none',
   'Their customers and visits in the CRM, and their team''s below them. Opened by CRM · View.', 317),
  ('crm_manage', 'CRM control panel', 'Revenue member', 'none',
   'Everybody''s customers in the CRM, and its assignment, ads, full time and showrooms. Opened by CRM · Manage.', 318)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.permission_cell_keys (function_key, action, legacy_key, min_scope, gate) VALUES
  ('crm', 'view', 'member_crm', 'own', NULL),
  ('crm', 'manage', 'crm_manage', 'all', NULL)
ON CONFLICT (function_key, action, legacy_key) DO NOTHING;

INSERT INTO public.permission_key_actions (legacy_key, function_key, action) VALUES
  ('member_crm', 'crm', 'view'), ('member_crm', 'crm', 'edit'),
  ('crm_manage', 'crm', 'view'), ('crm_manage', 'crm', 'edit'), ('crm_manage', 'crm', 'manage')
ON CONFLICT (legacy_key, function_key, action) DO NOTHING;

-- The shared Principal login: the Boss's Control panel, as the CRM gave it.
INSERT INTO public.role_default_permissions (role, permission_key) VALUES ('principal', 'crm_manage')
ON CONFLICT (role, permission_key) DO NOTHING;

-- A Revenue app account holds only the member app's keys — now the CRM's too.
SELECT pg_temp.swap_check('public.current_permissions()',
  $q$OR key=ANY(ARRAY['member_portal','member_quote','member_requests','member_memos','member_insight'])$q$,
  $q$OR key=ANY(ARRAY['member_portal','member_quote','member_requests','member_memos','member_insight','member_crm','crm_manage'])$q$);

-- ── 3. The templates ────────────────────────────────────────────────────────

-- Revenue Team: their own CRM.
INSERT INTO public.permission_template_grants (template_id, function_key, action, scope)
SELECT t.id, 'crm', a, 'own' FROM public.permission_templates t, unnest(ARRAY['view', 'edit']) a
 WHERE t.key = 'revenue_team'
ON CONFLICT (template_id, function_key, action) DO NOTHING;

-- Ultimate and Full access: everything, the CRM included.
INSERT INTO public.permission_template_grants (template_id, function_key, action, scope)
SELECT t.id, 'crm', a, 'all' FROM public.permission_templates t, unnest(ARRAY['view', 'edit', 'manage']) a
 WHERE t.key IN ('ultimate', 'full')
ON CONFLICT (template_id, function_key, action) DO NOTHING;

-- The Revenue Director: their own Revenue app, and the CRM's Control panel.
INSERT INTO public.permission_templates (key, name, description, base_role, sort_order)
VALUES ('revenue_director', 'Revenue Director',
        'Their own Revenue app, and the CRM''s Control panel: everybody''s customers, assignment, ads and showrooms.',
        'revenue_member', 105)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.permission_template_grants (template_id, function_key, action, scope)
SELECT t.id, g.fn, g.action, g.scope
  FROM public.permission_templates t,
       (VALUES ('revenue_app', 'view', 'own'), ('revenue_app', 'create', 'own'),
               ('crm', 'view', 'all'), ('crm', 'edit', 'all'), ('crm', 'manage', 'all')) AS g(fn, action, scope)
 WHERE t.key = 'revenue_director'
ON CONFLICT (template_id, function_key, action) DO NOTHING;

-- An editor left open on any of them saves over nothing it did not see.
UPDATE public.permission_templates SET version = version + 1, updated_at = now()
 WHERE key IN ('revenue_team', 'ultimate', 'full');

-- The Revenue Director title (Revenue Department, heads it) wore Revenue Team.
UPDATE public.titles t SET template_id = (SELECT id FROM public.permission_templates WHERE key = 'revenue_director')
 WHERE t.name = 'Revenue Director' AND t.is_department_head
   AND t.department_id IN (SELECT id FROM public.departments WHERE name = 'Revenue Department')
   AND t.template_id IS DISTINCT FROM (SELECT id FROM public.permission_templates WHERE key = 'revenue_director');
