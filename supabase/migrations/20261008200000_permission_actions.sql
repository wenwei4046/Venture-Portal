-- ============================================================================
-- 20261008200000_permission_actions.sql
-- Each action of the matrix takes effect (PR2 of the People Management revamp).
-- ============================================================================
--
-- PR1 (20261008120000) drew the matrix — function × action × scope — and let a
-- template open the module keys the gates already read. A key opened a whole
-- module: whoever could see Treasury could raise, edit, void and export in it,
-- and only the Principal could approve anything (the approval functions asked
-- `role = 'principal'`). So a Finance · Checker could still raise payments and
-- a Director could sign off nothing (user: every cell must truly take effect).
--
-- This gives each caller their ACTIONS — `fn.action` → how far — and one
-- question to ask of them:
--
--   current_actions()               the caller's actions, as jsonb
--                                   {"treasury.create": "all", "claims.approve": "dept", …}
--   has_action(fn, action, scope)   do they hold it, at least that far
--
-- A titled person holds their template's cells with their own cells laid over
-- them — exactly the cells the matrix shows. An account with no template (the
-- four shared accounts, and anybody whose title has none yet) holds what its
-- keys already allowed, through `permission_key_actions`: Treasury opens
-- Treasury's view, create, edit, void and export, Corrections its approve, and
-- so on — so the Principal still approves everything and nobody's access moves
-- on the day. A department manager's department pages are theirs at Dept.
--
-- The gates follow in the app (`requireAction`, `canDo` — lib/permission-
-- actions.ts). The approval functions still ask `role = 'principal'` until
-- approvals go by domain (the next step). `team` gives `team.manage` because
-- titles and the ladder were the roster's (HR) before Manage had a cell.

-- ─── What a key allowed, as actions ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.permission_key_actions (
  legacy_key   text NOT NULL REFERENCES public.permission_defs(key),
  function_key text NOT NULL REFERENCES public.permission_functions(key),
  action       text NOT NULL,
  PRIMARY KEY (legacy_key, function_key, action)
);

COMMENT ON TABLE public.permission_key_actions IS
  'What a module key allowed before actions took effect, as actions (2026-10-08): how current_actions() reads an account with no permission template, so the four shared accounts and untemplated titles keep exactly the access they had. A template''s cells never pass through here.';

INSERT INTO public.permission_key_actions (legacy_key, function_key, action)
SELECT k.legacy_key, k.function_key, k.action
  FROM (VALUES
    ('dashboard', 'dashboard', 'view'),
    ('approvals', 'approvals', 'view'), ('approvals', 'approvals', 'approve'),
    ('treasury', 'treasury', 'view'), ('treasury', 'treasury', 'create'), ('treasury', 'treasury', 'edit'),
    ('treasury', 'treasury', 'void'), ('treasury', 'treasury', 'export'),
    ('override', 'treasury', 'approve'),
    ('billing', 'billing', 'view'), ('billing', 'billing', 'create'), ('billing', 'billing', 'edit'),
    ('billing', 'billing', 'void'), ('billing', 'billing', 'export'),
    ('categories', 'categories', 'view'), ('categories', 'categories', 'manage'),
    ('hr_costing', 'hr_costing', 'view'), ('hr_costing', 'hr_costing', 'create'), ('hr_costing', 'hr_costing', 'edit'),
    ('hr_costing', 'hr_costing', 'approve'), ('hr_costing', 'hr_costing', 'export'),
    ('revenue', 'revenue', 'view'), ('revenue', 'revenue', 'create'), ('revenue', 'revenue', 'edit'),
    ('revenue', 'revenue', 'approve'), ('revenue', 'revenue', 'export'), ('revenue', 'revenue', 'manage'),
    ('product_list', 'product_list', 'view'), ('product_list', 'product_list', 'edit'),
    ('director_salary', 'director_salary', 'view'), ('director_salary', 'director_salary', 'edit'),
    ('director_salary', 'director_salary', 'approve'),
    ('director_pool', 'director_pool', 'view'), ('director_pool', 'director_pool', 'edit'),
    ('team', 'team', 'view'), ('team', 'team', 'create'), ('team', 'team', 'edit'), ('team', 'team', 'manage'),
    ('team_invite', 'accounts', 'view'), ('team_invite', 'accounts', 'create'),
    ('permissions_manage', 'accounts', 'view'), ('permissions_manage', 'accounts', 'manage'),
    ('dept_pool', 'dept_pool', 'view'), ('dept_pool', 'dept_pool', 'export'),
    ('venture_pool', 'venture_pool', 'view'), ('venture_pool', 'venture_pool', 'create'),
    ('venture_pool', 'venture_pool', 'edit'), ('venture_pool', 'venture_pool', 'export'),
    ('opex', 'opex', 'view'), ('opex', 'opex', 'export'),
    ('my_billing', 'my_billing', 'view'), ('my_billing', 'my_billing', 'create'),
    ('claims', 'claims', 'view'), ('claims', 'claims', 'create'), ('claims', 'claims', 'edit'), ('claims', 'claims', 'void'),
    ('claims_approve', 'claims', 'approve'),
    ('reports', 'reports', 'view'), ('reports', 'reports', 'export'),
    ('dept_reports', 'dept_reports', 'view'), ('dept_reports', 'dept_reports', 'export'),
    ('reconciliation', 'reconciliation', 'view'), ('reconciliation', 'reconciliation', 'create'),
    ('reconciliation', 'reconciliation', 'edit'), ('reconciliation', 'reconciliation', 'approve'),
    ('audit_log', 'audit_log', 'view'), ('audit_log', 'audit_log', 'export'),
    ('settings', 'settings', 'view'), ('settings', 'settings', 'manage'),
    ('department_mode', 'settings', 'manage'),
    ('member_requests_manage', 'member', 'view'), ('member_requests_manage', 'member', 'manage'),
    ('member_memos_manage', 'member', 'view'), ('member_memos_manage', 'member', 'manage'),
    ('member_portal', 'revenue_app', 'view'), ('member_insight', 'revenue_app', 'view'),
    ('member_memos', 'revenue_app', 'view'), ('member_quote', 'revenue_app', 'create'),
    ('member_requests', 'revenue_app', 'create'),
    ('view_switch', 'view_switch', 'view')
  ) AS k(legacy_key, function_key, action)
 WHERE EXISTS (SELECT 1 FROM public.permission_defs d WHERE d.key = k.legacy_key)
   AND EXISTS (SELECT 1 FROM public.permission_functions f WHERE f.key = k.function_key AND k.action = ANY (f.actions))
ON CONFLICT DO NOTHING;

ALTER TABLE public.permission_key_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY permission_key_actions_read ON public.permission_key_actions FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.permission_key_actions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.permission_key_actions TO authenticated;

SELECT public.audit_register('permission_key_actions', 'Keys to actions', 'People', '{permissions_manage}',
  p_keys => '{legacy_key,function_key,action}', p_labels => '{legacy_key,function_key,action}');

-- ─── The caller's actions ──────────────────────────────────────────────────
-- A titled person: their template's cells, their own cells over them (a cell
-- of their own with no reach takes the template's away). Anybody else: what
-- their keys allowed, at All — a department manager's department pages at
-- Dept. Two answers for one action keep the further.

CREATE OR REPLACE FUNCTION public.current_actions()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH me AS (
    SELECT id, role FROM public.users WHERE id = auth.uid() AND is_active
  ), my_title AS (
    SELECT t.template_id FROM public.hr_staff_costs s JOIN public.titles t ON t.id = s.title_id
     WHERE s.user_id = (SELECT id FROM me) LIMIT 1
  ), my_template AS (
    SELECT pt.id FROM public.permission_templates pt WHERE pt.id = (SELECT template_id FROM my_title)
  ), cells AS (
    SELECT g.function_key, g.action, g.scope
      FROM public.permission_template_grants g
     WHERE g.template_id = (SELECT id FROM my_template)
       AND NOT EXISTS (SELECT 1 FROM public.user_permission_cells u
                        WHERE u.user_id = (SELECT id FROM me) AND u.function_key = g.function_key AND u.action = g.action)
    UNION ALL
    SELECT u.function_key, u.action, u.scope
      FROM public.user_permission_cells u
     WHERE u.user_id = (SELECT id FROM me) AND u.scope IS NOT NULL AND EXISTS (SELECT 1 FROM my_template)
    UNION ALL
    SELECT k.function_key, k.action,
           CASE WHEN (SELECT role FROM me)::text = 'dept_manager'
                 AND k.function_key IN ('dept_pool', 'opex', 'my_billing', 'dept_reports', 'claims')
                THEN 'dept' ELSE 'all' END
      FROM unnest(public.current_permissions()) AS p(key)
      JOIN public.permission_key_actions k ON k.legacy_key = p.key
     WHERE NOT EXISTS (SELECT 1 FROM my_template)
  )
  SELECT coalesce(jsonb_object_agg(fa, scope), '{}'::jsonb)
    FROM (
      SELECT c.function_key || '.' || c.action AS fa,
             (array_agg(c.scope ORDER BY array_position(ARRAY['own', 'dept', 'all'], c.scope) DESC))[1] AS scope
        FROM cells c
       WHERE EXISTS (SELECT 1 FROM me)
       GROUP BY 1
    ) x;
$fn$;

-- Do they hold this action, at least this far — and one of the keys that open
-- the function's pages (those that allowed its View)? A cell never reaches
-- past the module key PR1's rules gave or withheld: a template's Approvals ·
-- Approve without the Approvals key approves nothing, here as in the app
-- (canDo, lib/permission-actions.ts).
CREATE OR REPLACE FUNCTION public.has_action(p_function text, p_action text, p_scope text DEFAULT 'all')
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT coalesce(
           array_position(ARRAY['own', 'dept', 'all'], public.current_actions() ->> (p_function || '.' || p_action))
             >= array_position(ARRAY['own', 'dept', 'all'], coalesce(p_scope, 'all')),
           false)
     AND (NOT EXISTS (SELECT 1 FROM public.permission_key_actions k
                       WHERE k.function_key = p_function AND k.action = 'view')
          OR EXISTS (SELECT 1 FROM public.permission_key_actions k
                      WHERE k.function_key = p_function AND k.action = 'view'
                        AND k.legacy_key = ANY (public.current_permissions())));
$fn$;

REVOKE ALL ON FUNCTION public.current_actions(), public.has_action(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_actions(), public.has_action(text, text, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
