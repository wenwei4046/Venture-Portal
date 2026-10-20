-- ============================================================================
-- 20261021013000_it_requests_permission.sql
-- IT requests join the permission matrix (2026-10-20 — the user: "i want add on a button to get submit for IT support
-- or help" in the Revenue app's Profile › Settings, which everybody may use; "as Revenue Director 的 view，或者像更大职位
-- log in 进去的时候，左边这里 category 就会多一个 IT request。这边的 list 就会显示出来他们 submit 上来的 request change
-- 以及带上来的 file"). The module itself — its tables, bucket and functions — is the next migration.
-- ============================================================================
--
-- 1. The function `it_requests` (Admin): View = read everybody's requests and their files; Edit = write a note on one
--    and set its status (New · In progress · Fixed · Closed), which tells whoever sent it. Every reach "all". Sending
--    one and following one's own need no cell: they are open to every signed-in account, as a memo addressed to you is
--    yours.
-- 2. The key `it_requests`, scope none: no table's row policy opens for it — the module's tables are read and written
--    only through its own functions, which ask has_any_action. Opened by IT requests · View.
-- 3. Who holds it: the shared Principal login (role default), the two full-access templates (Ultimate, Full) and the
--    Revenue Director template — the user's "Revenue Director … 或者像更大职位". The Revenue Director's ticks are stored
--    (a template saved on tabs closes every box its ticks leave out), so they gain the new tab's two boxes too.
-- 4. A Revenue app account may hold the key: `current_permissions()`'s member-app list, production's body with that one
--    statement swapped (pg_temp.swap_check, as 20261014100000 did for the Product List).
-- 5. The tab `rev.it_requests` ("IT requests", the Revenue app, reach all) in the database's copy of the registry —
--    added by name, never seeded whole: production's registry holds rows main does not (the Leads tabs).
-- Nobody loses anything; nobody gains more than the above. Running it twice changes nothing.

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
    RAISE EXCEPTION '%: its statement is there % times, not once — production changed since this migration was written', p_sig, v_n;
  END IF;
  v_found := (regexp_match(v_src, '(' || v_pat || ')'))[1];
  EXECUTE replace(pg_get_functiondef(p_sig), v_found, p_new);
END
$fn$;

-- ── 1. The function ─────────────────────────────────────────────────────────

INSERT INTO public.permission_functions (key, label, section, actions, scopes, description, sort_order) VALUES
  ('it_requests', 'IT requests', 'Admin', ARRAY['view', 'edit'], ARRAY['all'],
   'What people send IT from the app — a bug, a new feature, a suggestion — with their screenshots and files. View = read everybody''s; Edit = write a note on one and set its status, which tells whoever sent it.',
   219)
ON CONFLICT (key) DO NOTHING;

-- ── 2. The key ──────────────────────────────────────────────────────────────

INSERT INTO public.permission_defs (key, label, section, scope, description, sort_order) VALUES
  ('it_requests', 'IT requests', 'Admin', 'none',
   'Everybody''s IT requests, their files and notes. Opened by IT requests · View.', 219)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.permission_cell_keys (function_key, action, legacy_key, min_scope, gate) VALUES
  ('it_requests', 'view', 'it_requests', 'all', NULL)
ON CONFLICT (function_key, action, legacy_key) DO NOTHING;

INSERT INTO public.permission_key_actions (legacy_key, function_key, action) VALUES
  ('it_requests', 'it_requests', 'view'), ('it_requests', 'it_requests', 'edit')
ON CONFLICT (legacy_key, function_key, action) DO NOTHING;

-- ── 3. Who holds it ─────────────────────────────────────────────────────────

INSERT INTO public.role_default_permissions (role, permission_key) VALUES ('principal', 'it_requests')
ON CONFLICT (role, permission_key) DO NOTHING;

INSERT INTO public.permission_template_grants (template_id, function_key, action, scope)
SELECT t.id, 'it_requests', a, 'all'
  FROM public.permission_templates t, unnest(ARRAY['view', 'edit']) a
 WHERE t.key IN ('ultimate', 'full', 'revenue_director')
ON CONFLICT (template_id, function_key, action) DO NOTHING;

-- A template whose ticks are stored keeps the new tab open only when it is ticked.
INSERT INTO public.permission_template_tabs (template_id, tab_id, action)
SELECT t.id, 'rev.it_requests', a
  FROM public.permission_templates t, unnest(ARRAY['view', 'edit']) a
 WHERE t.key IN ('ultimate', 'full', 'revenue_director')
   AND EXISTS (SELECT 1 FROM public.permission_template_tabs x WHERE x.template_id = t.id)
ON CONFLICT (template_id, tab_id, action) DO NOTHING;

-- An editor left open on any of them saves over nothing it did not see.
UPDATE public.permission_templates SET version = version + 1, updated_at = now()
 WHERE key IN ('ultimate', 'full', 'revenue_director');

-- ── 4. A Revenue app account may hold it ────────────────────────────────────

SELECT pg_temp.swap_check('public.current_permissions()'::regprocedure,
  $old$OR key=ANY(ARRAY['member_portal','member_quote','member_requests','member_memos','member_insight','member_crm','crm_manage','product_list'])$old$,
  $new$OR key=ANY(ARRAY['member_portal','member_quote','member_requests','member_memos','member_insight','member_crm','crm_manage','product_list','it_requests'])$new$);

-- ── 5. The tab, in the database's copy of the registry ──────────────────────

INSERT INTO public.permission_tab_cells (tab_id, action, cell) VALUES
  ('rev.it_requests', 'view', 'it_requests.view'),
  ('rev.it_requests', 'edit', 'it_requests.edit')
ON CONFLICT DO NOTHING;
