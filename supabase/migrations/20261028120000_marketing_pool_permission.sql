-- ============================================================================
-- 20261028120000_marketing_pool_permission.sql
-- Marketing's own pool in Marketing's view (2026-10-28 — the user: "如果我只想给marketing 的manager 看自己的pool";
-- no box could: Dept Pool reads every department's pool or none. Then, of Finance's Marketing - Cash Flow: "我要
-- exactly 给他们看这个part", and "照这样做：Marketing view 加一行，打开就是 Finance 那页 Marketing 的 P&L / Cash
-- Flow，只有 Marketing，Excel/PDF 也给").
-- ============================================================================
--
-- 1. The function `marketing_pool` (Departments): View = the page — Marketing's P&L and Cash Flow month by month, as
--    Dept Pool shows Finance Marketing's, every line it opens; Export = their Excel and PDF. Reach "all": the page is
--    Marketing's and nothing else's.
-- 2. The key `marketing_pool`, scope none: no table's row policy opens on it. The page reads the ledger through the
--    service role once it has asked for this View, Marketing's segment named in code — never taken from the request.
-- 3. Who holds it: the shared Principal login (role default) and the full-access templates (Ultimate, Full), as they
--    hold every module. Marketing · Manager does not until somebody ticks it (People Management › Permissions ›
--    Marketing view › Pool).
-- 4. The tab `mkt.pool` ("Pool", the Marketing view) and its page `/marketing/pool`, in the database's copy of the
--    registry — added by name, never seeded whole (production holds rows main does not).
-- 5. bridge_mirror_slices() serves the service role every slice, as it serves Finance, so the pool's Cash Flow puts
--    Marketing's share of a shared bill on its own account, as Finance's page does.
-- Nobody loses anything. Running it twice changes nothing.

-- ── 1. The function ─────────────────────────────────────────────────────────

INSERT INTO public.permission_functions (key, label, section, actions, scopes, description, sort_order) VALUES
  ('marketing_pool', 'Marketing pool', 'Departments', ARRAY['view', 'export'], ARRAY['all'],
   'Marketing''s own P&L and Cash Flow in Marketing''s view, as Dept Pool shows Finance Marketing''s — never another department''s. View = the page and every line it opens; Export = its Excel and PDF.',
   146)
ON CONFLICT (key) DO NOTHING;

-- ── 2. The key ──────────────────────────────────────────────────────────────

INSERT INTO public.permission_defs (key, label, section, scope, description, sort_order) VALUES
  ('marketing_pool', 'Marketing pool', 'Departments', 'none',
   'Marketing''s own P&L and Cash Flow in Marketing''s view. Opened by Marketing pool · View.', 146)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.permission_cell_keys (function_key, action, legacy_key, min_scope, gate) VALUES
  ('marketing_pool', 'view', 'marketing_pool', 'all', NULL)
ON CONFLICT (function_key, action, legacy_key) DO NOTHING;

INSERT INTO public.permission_key_actions (legacy_key, function_key, action) VALUES
  ('marketing_pool', 'marketing_pool', 'view'), ('marketing_pool', 'marketing_pool', 'export')
ON CONFLICT (legacy_key, function_key, action) DO NOTHING;

-- ── 3. Who holds it ─────────────────────────────────────────────────────────

INSERT INTO public.role_default_permissions (role, permission_key) VALUES ('principal', 'marketing_pool')
ON CONFLICT (role, permission_key) DO NOTHING;

INSERT INTO public.permission_template_grants (template_id, function_key, action, scope)
SELECT t.id, 'marketing_pool', a, 'all'
  FROM public.permission_templates t, unnest(ARRAY['view', 'export']) a
 WHERE t.key IN ('ultimate', 'full')
ON CONFLICT (template_id, function_key, action) DO NOTHING;

-- A template whose ticks are stored keeps the new tab open only when it is ticked.
INSERT INTO public.permission_template_tabs (template_id, tab_id, action)
SELECT t.id, 'mkt.pool', 'view'
  FROM public.permission_templates t
 WHERE t.key IN ('ultimate', 'full')
   AND EXISTS (SELECT 1 FROM public.permission_template_tabs x WHERE x.template_id = t.id)
ON CONFLICT (template_id, tab_id, action) DO NOTHING;

-- An editor left open on one saves over nothing it did not see.
UPDATE public.permission_templates SET version = version + 1, updated_at = now()
 WHERE key IN ('ultimate', 'full');

-- ── 4. The tab, in the database's copy of the registry ──────────────────────

INSERT INTO public.permission_page_tabs (page, tab_id) VALUES
  ('/marketing/pool', 'mkt.pool')
ON CONFLICT DO NOTHING;

INSERT INTO public.permission_tab_cells (tab_id, action, cell) VALUES
  ('mkt.pool', 'view', 'marketing_pool.export'),
  ('mkt.pool', 'view', 'marketing_pool.view')
ON CONFLICT DO NOTHING;

-- ── 5. The bridge's mirror slices, for the service role ─────────────────────
-- Finance's Cash Flow puts each department's share of a shared bill on the paying side's own account (rent 9094,
-- utilities, salary…) through bridge_mirror_slices(). That function serves every slice to a Reports or Department
-- reports reader and none to a caller with no sign-in. The pool reads as the service role, so its Cash Flow would
-- have put Marketing's Office Rental on the bridge's own line, not on 9094 as Finance sees it. Checked on production:
-- the service role read 0 of the 21 slices. The service role reads those two tables whole anyway; now it reads the
-- slices as Finance does. Every signed-in caller is asked exactly as before. pg_temp.swap_check works as in
-- 20261009040000: production's statement, whitespace-blind, exactly once.

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

SELECT pg_temp.swap_check('public.bridge_mirror_slices()',
  $q$IF public.has_any_action(ARRAY['dept_reports.view', 'reports.view']) THEN$q$,
  $q$IF auth.role() = 'service_role' OR public.has_any_action(ARRAY['dept_reports.view', 'reports.view']) THEN$q$);
