-- Permission templates: a function, an action on it, and how far it reaches
-- (2026-10-08, the People Management revamp — Claude Design handoff
-- "design_handoff_people_permissions", agreed with the user step by step).
--
-- Until now a permission was one of 35 module-shaped keys, on or off, granted
-- by a title (title_permissions — not one title had any) or, failing that, by
-- the role the account was created with. Now:
--
--   permission_functions          the matrix rows: the design's 22, plus
--                                 Member Services (its two manage keys had no
--                                 home), Revenue app (the member app's keys —
--                                 there is no role to carry them any more) and
--                                 Switch views (what makes "Ultimate full
--                                 access" more than "Full access").
--   permission_templates          a named bundle of cells — what replaces the
--                                 role as "the bundle" (user: 之前是他们用 role
--                                 来打包) — hung on a TITLE, not an account.
--   permission_template_grants    its cells: function × action × scope.
--   permission_template_sensitive the salary / NRIC / bank fields it may see.
--   titles.template_id            each title points at one template.
--   user_permission_cells         one person raised or lowered on one cell
--                                 (scope NULL = ✕), on top of their template.
--
-- THE GATES STILL READ MODULE KEYS. This migration changes what decides access,
-- not yet how finely it is enforced: `current_permissions()` turns a person's
-- cells into the module keys every gate and RLS policy already asks about
-- (`permission_cell_keys`). Enforcing each action and each reach is the next
-- three steps (actions; own / dept in RLS; sensitive-field masking). Until
-- then a cell opens its key only where the key cannot reach further than the
-- cell says — FAIL CLOSED:
--   * a key that opens a whole data domain (hr / treasury / admin) needs the
--     cell at All — a Dept cell must not open the company;
--   * an hr-domain key needs the template to see salaries (CLAUDE.md: only HR
--     and the Principal see individual salaries), a treasury-domain key needs
--     Treasury itself, and an admin-domain key — the Principal's own powers,
--     users and payroll runs among them — needs a Principal template.
-- What a cell is held back from is shown beside the matrix, never silent.
--
-- NOBODY'S ACCESS CHANGES TODAY. The ten templates are seeded and hung on the
-- titles agreed with the user, but the one title held by somebody who can sign
-- in (ACCOUNTS EXECUTIVE) is left without one, and the four shared accounts
-- (principal@ / finance@ / hr@ / marketing@) have no title at all: they keep
-- their role's defaults until the user moves them. The one key added to a
-- role is `view_switch` on the Principal's — what the View-as switcher reads
-- from now on instead of the role.
--
-- And every change to who may do what is kept: `audit_events` + the trigger
-- `audit_row_change()` (user: 所有步骤其实都要有 audit history … 谁按错、谁加了
-- 什么、谁改了什么) — the start of the app-wide history, here on permissions,
-- titles and accounts. It is the general form of `config_audit_log` (Phase 2,
-- eight config tables, read by no page); the app-wide step folds that in.

-- ─── The guard: what this replaces is what production runs ─────────────────

DO $guard$
DECLARE
  v_md5 text;
BEGIN
  SELECT md5(prosrc) INTO v_md5 FROM pg_proc WHERE oid = to_regprocedure('public.current_permissions()');
  IF v_md5 IS NOT NULL AND v_md5 <> '7df96ce0cd4aa1cb6642d4352d582174' THEN
    RAISE EXCEPTION 'current_permissions() changed on the database since this migration was written (md5 %)', v_md5;
  END IF;
END $guard$;

-- ─── The history: every row change to the tables it is attached to ────────

CREATE TABLE IF NOT EXISTS public.audit_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  -- auth.uid() at the time: NULL for a migration or the service role.
  actor_id    uuid,
  table_name  text NOT NULL,
  -- The row's key as text — its id, or the composite key joined with ':'.
  row_key     text,
  op          text NOT NULL CHECK (op IN ('INSERT', 'UPDATE', 'DELETE')),
  old_row     jsonb,
  new_row     jsonb,
  -- On UPDATE, the columns that changed.
  changed     text[],
  -- One save is one transaction: its rows share this.
  txid        bigint NOT NULL DEFAULT txid_current()
);

COMMENT ON TABLE public.audit_events IS
  'Row-level history (2026-10-08): who changed what, before and after. Written only by the trigger audit_row_change(); read by holders of audit_log. Starts on permissions, titles and accounts; the rest of the app follows.';

CREATE INDEX IF NOT EXISTS audit_events_table_time ON public.audit_events (table_name, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_actor_time ON public.audit_events (actor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_txid ON public.audit_events (txid);

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_events_read ON public.audit_events
  FOR SELECT TO authenticated
  USING ((SELECT public.has_perm('audit_log')));
REVOKE ALL ON public.audit_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.audit_events TO authenticated;

-- TG_ARGV[0]: the key columns, comma-separated ('' = the row's id).
-- TG_ARGV[1]: columns whose change alone is not worth a row (comma-separated).
CREATE OR REPLACE FUNCTION public.audit_row_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_old     jsonb;
  v_new     jsonb;
  v_row     jsonb;
  v_changed text[];
  v_ignore  text[] := CASE WHEN TG_NARGS > 1 AND TG_ARGV[1] <> '' THEN string_to_array(TG_ARGV[1], ',') ELSE '{}'::text[] END;
  v_cols    text[] := CASE WHEN TG_NARGS > 0 AND TG_ARGV[0] <> '' THEN string_to_array(TG_ARGV[0], ',') ELSE ARRAY['id'] END;
  v_key     text;
BEGIN
  IF TG_OP <> 'INSERT' THEN v_old := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN v_new := to_jsonb(NEW); END IF;
  IF TG_OP = 'UPDATE' THEN
    SELECT array_agg(k ORDER BY k) INTO v_changed
      FROM jsonb_object_keys(v_new) k
     WHERE v_new -> k IS DISTINCT FROM v_old -> k
       AND NOT (k = ANY (v_ignore));
    IF v_changed IS NULL THEN RETURN NULL; END IF;
  END IF;
  v_row := coalesce(v_new, v_old);
  SELECT string_agg(coalesce(v_row ->> c, ''), ':' ORDER BY ord) INTO v_key
    FROM unnest(v_cols) WITH ORDINALITY AS u(c, ord);
  INSERT INTO public.audit_events (actor_id, table_name, row_key, op, old_row, new_row, changed)
  VALUES (auth.uid(), TG_TABLE_NAME, v_key, TG_OP, v_old, v_new, v_changed);
  RETURN NULL;
END
$fn$;

REVOKE ALL ON FUNCTION public.audit_row_change() FROM PUBLIC, anon, authenticated;

-- ─── The matrix rows ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.permission_functions (
  key         text PRIMARY KEY,
  label       text NOT NULL,
  section     text NOT NULL CHECK (section IN ('Daily', 'People', 'Departments', 'Reports', 'Admin')),
  -- The actions this function has, in the matrix's order; the others are hatched.
  actions     text[] NOT NULL CHECK (
                actions <@ ARRAY['view', 'create', 'edit', 'approve', 'void', 'export', 'manage']
                AND 'view' = ANY (actions)),
  -- The reaches a cell may take, narrowest first: Own · Dept · All.
  scopes      text[] NOT NULL CHECK (scopes <@ ARRAY['own', 'dept', 'all'] AND cardinality(scopes) > 0),
  description text,
  sort_order  integer NOT NULL
);

COMMENT ON TABLE public.permission_functions IS
  'The Permissions matrix rows (2026-10-08): what each function may be granted — its actions and how far a grant reaches.';

INSERT INTO public.permission_functions (key, label, section, actions, scopes, description, sort_order) VALUES
  ('dashboard',       'Overview',           'Daily',       ARRAY['view'], ARRAY['all'], 'The landing dashboard.', 10),
  ('approvals',       'Approvals',          'Daily',       ARRAY['view','approve'], ARRAY['all'], 'The Principal queue: approve or reject what others submit.', 20),
  ('treasury',        'Treasury',           'Daily',       ARRAY['view','create','edit','approve','void','export'], ARRAY['all'], 'Payments, receipts, invoices, fund in and out, overdue, statements. Approve includes amending a booked loan or fund source.', 30),
  ('billing',         'Billing',            'Daily',       ARRAY['view','create','edit','void','export'], ARRAY['all'], 'Service contracts, invoice generation, the billing allocator.', 40),
  ('categories',      'Chart of Account',   'Daily',       ARRAY['view','manage'], ARRAY['all'], 'GL categories that route every voucher.', 50),
  ('hr_costing',      'HR Costing',         'People',      ARRAY['view','create','edit','approve','export'], ARRAY['own','dept','all'], 'Monthly payroll runs, staff costs, HR payments.', 60),
  ('revenue',         'Revenue Department', 'People',      ARRAY['view','create','edit','approve','export','manage'], ARRAY['own','dept','all'], 'Commission runs, rules and the sales hierarchy.', 70),
  ('product_list',    'Product list',       'People',      ARRAY['view','edit'], ARRAY['all'], 'What a product costs — the margin a commission run is judged against.', 80),
  ('director_salary', 'Director Salary',    'People',      ARRAY['view','edit','approve'], ARRAY['all'], 'The director salary engine.', 90),
  ('director_pool',   'Director Pool',      'People',      ARRAY['view','edit'], ARRAY['all'], 'The director pool calculator.', 100),
  ('team',            'Team & roster',      'People',      ARRAY['view','create','edit','manage'], ARRAY['own','dept','all'], 'The roster, the org chart and the titles. Create = add people; Edit = change a person; Manage = the structure — titles and the ladder.', 110),
  ('accounts',        'Logins & invites',   'People',      ARRAY['view','create','manage'], ARRAY['all'], 'Who can sign in. Create = invite; Manage = permission templates and personal exceptions.', 120),
  ('member',          'Member Services',    'People',      ARRAY['view','manage'], ARRAY['all'], 'Revenue members'' requests (their claims among them), memos, brand weeks and claim rates.', 125),
  ('revenue_app',     'Revenue app',        'People',      ARRAY['view','create'], ARRAY['own'], 'The Revenue app: their own sales, income, memos and insight. Create = quotes and requests.', 128),
  ('dept_pool',       'Dept Pool',          'Departments', ARRAY['view','export'], ARRAY['dept','all'], 'Department pool balances and P&L.', 140),
  ('venture_pool',    'Venture Pool',       'Departments', ARRAY['view','create','edit','export'], ARRAY['all'], 'The HV holding-company cash ledger.', 150),
  ('opex',            'OPEX',               'Departments', ARRAY['view','export'], ARRAY['dept','all'], 'A department''s payroll breakdown.', 160),
  ('my_billing',      'My Billing',         'Departments', ARRAY['view','create'], ARRAY['dept','all'], 'A department manager''s own invoices.', 170),
  ('claims',          'Claims',             'Departments', ARRAY['view','create','edit','approve','void'], ARRAY['own','dept','all'], 'Pool claims. A Revenue member''s own claim is decided in Member Services.', 180),
  ('reports',         'Reports',            'Reports',     ARRAY['view','export'], ARRAY['all'], 'Whole-company reports: balance sheet, trial balance, ledger.', 190),
  ('dept_reports',    'Department reports', 'Reports',     ARRAY['view','export'], ARRAY['dept','all'], 'P&L, cash flow and debtor aging for one department.', 200),
  ('reconciliation',  'Reconciliation',     'Reports',     ARRAY['view','create','edit','approve'], ARRAY['all'], 'Bank reconciliation and journal entries.', 210),
  ('audit_log',       'Audit log',          'Admin',       ARRAY['view','export'], ARRAY['all'], 'Who read and changed what.', 220),
  ('settings',        'Settings',           'Admin',       ARRAY['view','manage'], ARRAY['all'], 'Treasury config, companies, banks, periods, directors. Manage includes each department''s mode.', 230),
  ('view_switch',     'Switch views',       'Admin',       ARRAY['view'], ARRAY['all'], 'See the portal as HR, Finance or the Revenue team — Ultimate full access.', 240)
ON CONFLICT (key) DO UPDATE
  SET label = EXCLUDED.label, section = EXCLUDED.section, actions = EXCLUDED.actions,
      scopes = EXCLUDED.scopes, description = EXCLUDED.description, sort_order = EXCLUDED.sort_order;

-- The one capability the matrix grants that no key named before.
INSERT INTO public.permission_defs (key, label, section, scope, description, sort_order) VALUES
  ('view_switch', 'Switch views', 'Admin', 'none', 'See the portal as HR, Finance or the Revenue team (View as).', 245)
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.role_default_permissions (role, permission_key) VALUES ('principal', 'view_switch')
ON CONFLICT DO NOTHING;

-- ─── What a cell opens while the gates read module keys ────────────────────
-- min_scope: the narrowest reach of the cell that opens the key. gate: what
-- else the person's template must hold — 'salary' (it sees salary amounts),
-- 'treasury' (it grants Treasury · View) or 'principal' (it is a Principal
-- template). Both are the fail-closed rule above, and both go when the gates
-- ask for cells.

CREATE TABLE IF NOT EXISTS public.permission_cell_keys (
  function_key text NOT NULL REFERENCES public.permission_functions(key) ON DELETE CASCADE,
  action       text NOT NULL,
  legacy_key   text NOT NULL REFERENCES public.permission_defs(key) ON DELETE CASCADE,
  min_scope    text NOT NULL DEFAULT 'own' CHECK (min_scope IN ('own', 'dept', 'all')),
  gate         text CHECK (gate IN ('salary', 'treasury', 'principal')),
  PRIMARY KEY (function_key, action, legacy_key)
);

COMMENT ON TABLE public.permission_cell_keys IS
  'Transitional (2026-10-08): the module keys a matrix cell opens while gates and RLS still ask for module keys, and the fail-closed conditions on each. Goes when they ask for cells.';

INSERT INTO public.permission_cell_keys (function_key, action, legacy_key, min_scope, gate) VALUES
  ('dashboard',       'view',    'dashboard',              'own', NULL),
  ('approvals',       'view',    'approvals',              'all', 'principal'),
  ('treasury',        'view',    'treasury',               'all', 'treasury'),
  ('treasury',        'approve', 'override',               'all', 'principal'),
  ('billing',         'view',    'billing',                'all', 'treasury'),
  ('categories',      'view',    'categories',             'all', 'treasury'),
  ('hr_costing',      'view',    'hr_costing',             'all', 'salary'),
  ('revenue',         'view',    'revenue',                'all', 'salary'),
  ('product_list',    'view',    'product_list',           'all', 'principal'),
  ('director_salary', 'view',    'director_salary',        'all', 'salary'),
  ('director_pool',   'view',    'director_pool',          'all', 'salary'),
  ('team',            'view',    'team',                   'all', 'salary'),
  ('accounts',        'create',  'team_invite',            'all', 'principal'),
  ('accounts',        'manage',  'permissions_manage',     'all', 'principal'),
  ('member',          'manage',  'member_requests_manage', 'all', NULL),
  ('member',          'manage',  'member_memos_manage',    'all', NULL),
  ('dept_pool',       'view',    'dept_pool',              'own', NULL),
  ('venture_pool',    'view',    'venture_pool',           'all', 'treasury'),
  ('opex',            'view',    'opex',                   'own', NULL),
  ('my_billing',      'view',    'my_billing',             'own', NULL),
  ('claims',          'view',    'claims',                 'own', NULL),
  ('claims',          'approve', 'claims_approve',         'all', NULL),
  ('reports',         'view',    'reports',                'all', 'treasury'),
  ('dept_reports',    'view',    'dept_reports',           'own', NULL),
  ('reconciliation',  'view',    'reconciliation',         'all', 'treasury'),
  ('audit_log',       'view',    'audit_log',              'all', 'principal'),
  ('settings',        'view',    'settings',               'all', 'principal'),
  ('settings',        'manage',  'department_mode',        'all', 'principal'),
  ('revenue_app',     'view',    'member_portal',          'own', NULL),
  ('revenue_app',     'view',    'member_memos',           'own', NULL),
  ('revenue_app',     'view',    'member_insight',         'own', NULL),
  ('revenue_app',     'create',  'member_quote',           'own', NULL),
  ('revenue_app',     'create',  'member_requests',        'own', NULL),
  ('view_switch',     'view',    'view_switch',            'all', 'principal')
ON CONFLICT (function_key, action, legacy_key) DO UPDATE
  SET min_scope = EXCLUDED.min_scope, gate = EXCLUDED.gate;

-- ─── Templates ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.permission_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text NOT NULL UNIQUE CHECK (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  name        text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  description text CHECK (description IS NULL OR length(description) <= 400),
  -- The account kind its holders are given: which app they land in and which
  -- role-keyed screens they see, until those read permissions too. Never shown.
  base_role   public.user_role NOT NULL DEFAULT 'staff',
  sort_order  integer NOT NULL DEFAULT 0,
  -- Bumped by every save: a template saved over a newer save is refused.
  version     integer NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS permission_templates_name_key ON public.permission_templates (lower(name));

COMMENT ON TABLE public.permission_templates IS
  'A named bundle of permission cells (2026-10-08). Each title points at one; saving one changes everybody on it. base_role = the account kind its holders get.';

CREATE TABLE IF NOT EXISTS public.permission_template_grants (
  template_id  uuid NOT NULL REFERENCES public.permission_templates(id) ON DELETE CASCADE,
  function_key text NOT NULL REFERENCES public.permission_functions(key) ON DELETE CASCADE,
  action       text NOT NULL,
  scope        text NOT NULL CHECK (scope IN ('own', 'dept', 'all')),
  PRIMARY KEY (template_id, function_key, action)
);

CREATE TABLE IF NOT EXISTS public.permission_template_sensitive (
  template_id uuid NOT NULL REFERENCES public.permission_templates(id) ON DELETE CASCADE,
  field       text NOT NULL CHECK (field IN ('salary', 'nric', 'bank')),
  PRIMARY KEY (template_id, field)
);

-- A cell must be one its function has, reaching no further than it may.
-- A NULL scope (✕, a person held back) is valid wherever the action is.
CREATE OR REPLACE FUNCTION public.permission_cell_is_valid(p_function text, p_action text, p_scope text)
RETURNS boolean
LANGUAGE sql STABLE SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.permission_functions f
     WHERE f.key = p_function AND p_action = ANY (f.actions)
       AND (p_scope IS NULL OR p_scope = ANY (f.scopes)));
$fn$;

CREATE OR REPLACE FUNCTION public.permission_grant_valid()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  IF NOT public.permission_cell_is_valid(NEW.function_key, NEW.action, NEW.scope) THEN
    RAISE EXCEPTION '%.% cannot be granted %', NEW.function_key, NEW.action, coalesce(NEW.scope, '✕')
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$fn$;

CREATE OR REPLACE TRIGGER permission_template_grants_valid
  BEFORE INSERT OR UPDATE ON public.permission_template_grants
  FOR EACH ROW EXECUTE FUNCTION public.permission_grant_valid();

CREATE OR REPLACE TRIGGER audit_permission_templates
  AFTER INSERT OR UPDATE OR DELETE ON public.permission_templates
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('', 'version,updated_at,updated_by');
CREATE OR REPLACE TRIGGER audit_permission_template_grants
  AFTER INSERT OR UPDATE OR DELETE ON public.permission_template_grants
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('template_id,function_key,action', '');
CREATE OR REPLACE TRIGGER audit_permission_template_sensitive
  AFTER INSERT OR UPDATE OR DELETE ON public.permission_template_sensitive
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('template_id,field', '');

-- ─── A title's template ────────────────────────────────────────────────────

ALTER TABLE public.titles
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.permission_templates(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.titles.template_id IS
  'The permission template this title''s holders follow (2026-10-08). NULL = none yet: holders keep their account''s legacy role defaults. Set only by holders of accounts.manage.';

-- A title's template is a permission decision, not a roster edit: HR may
-- rename a title or open a new one, only accounts.manage may point it at a
-- template.
CREATE OR REPLACE FUNCTION public.titles_template_guard()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.template_id IS NOT DISTINCT FROM OLD.template_id THEN RETURN NEW; END IF;
  ELSIF NEW.template_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NOT NULL AND NOT public.has_perm('permissions_manage') THEN
    RAISE EXCEPTION 'Only whoever manages permissions points a title at a template'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$fn$;

REVOKE ALL ON FUNCTION public.titles_template_guard() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER titles_template_guard
  BEFORE INSERT OR UPDATE OF template_id ON public.titles
  FOR EACH ROW EXECUTE FUNCTION public.titles_template_guard();

CREATE OR REPLACE TRIGGER audit_titles
  AFTER INSERT OR UPDATE OR DELETE ON public.titles
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('', 'updated_at');

-- ─── One person raised or lowered on one cell ──────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_permission_cells (
  user_id      uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  function_key text NOT NULL REFERENCES public.permission_functions(key) ON DELETE CASCADE,
  action       text NOT NULL,
  -- NULL = ✕: the person is held back from what the template allows.
  scope        text CHECK (scope IS NULL OR scope IN ('own', 'dept', 'all')),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid REFERENCES public.users(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, function_key, action)
);

COMMENT ON TABLE public.user_permission_cells IS
  'Per-person exceptions to the title''s template (2026-10-08): a cell raised to a scope, or lowered to nothing (scope NULL). Apply only while the person''s title has a template.';

CREATE OR REPLACE TRIGGER user_permission_cells_valid
  BEFORE INSERT OR UPDATE ON public.user_permission_cells
  FOR EACH ROW EXECUTE FUNCTION public.permission_grant_valid();

CREATE OR REPLACE TRIGGER audit_user_permission_cells
  AFTER INSERT OR UPDATE OR DELETE ON public.user_permission_cells
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('user_id,function_key,action', 'updated_at,updated_by');

-- The accounts and the old per-key grants keep their history too.
CREATE OR REPLACE TRIGGER audit_users
  AFTER INSERT OR DELETE OR UPDATE OF role, is_active, department_id, name, email ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('', 'updated_at,last_seen_at');
CREATE OR REPLACE TRIGGER audit_user_permissions
  AFTER INSERT OR UPDATE OR DELETE ON public.user_permissions
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('user_id,permission_key', '');
CREATE OR REPLACE TRIGGER audit_title_permissions
  AFTER INSERT OR UPDATE OR DELETE ON public.title_permissions
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('title_id,permission_key', '');

-- ─── Reads: open to anyone signed in, as the old catalog is; writes go
-- through the functions below only ──────────────────────────────────────────

ALTER TABLE public.permission_functions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permission_cell_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permission_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permission_template_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permission_template_sensitive ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permission_cells ENABLE ROW LEVEL SECURITY;

CREATE POLICY permission_functions_read ON public.permission_functions FOR SELECT TO authenticated USING (true);
CREATE POLICY permission_cell_keys_read ON public.permission_cell_keys FOR SELECT TO authenticated USING (true);
CREATE POLICY permission_templates_read ON public.permission_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY permission_template_grants_read ON public.permission_template_grants FOR SELECT TO authenticated USING (true);
CREATE POLICY permission_template_sensitive_read ON public.permission_template_sensitive FOR SELECT TO authenticated USING (true);
-- A person's exceptions: their own, and whoever runs the roster or permissions.
CREATE POLICY user_permission_cells_read ON public.user_permission_cells FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT public.has_perm('team')) OR (SELECT public.has_perm('permissions_manage')));

REVOKE ALL ON public.permission_functions, public.permission_cell_keys, public.permission_templates,
  public.permission_template_grants, public.permission_template_sensitive, public.user_permission_cells
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.permission_functions, public.permission_cell_keys, public.permission_templates,
  public.permission_template_grants, public.permission_template_sensitive, public.user_permission_cells
  TO authenticated;

-- ─── The account kind follows the template ─────────────────────────────────
-- The hidden role an account carries is its title's template's base_role —
-- re-derived whenever the person, their title or the title's template moves.
-- A title with no template leaves the account as it was (the legacy path), and
-- an account with no person behind it (the four shared ones) is never touched.

CREATE OR REPLACE FUNCTION public.sync_user_role(p_user uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_role public.user_role;
  v_dept uuid;
BEGIN
  IF p_user IS NULL THEN RETURN; END IF;
  SELECT pt.base_role, s.department_id INTO v_role, v_dept
    FROM public.hr_staff_costs s
    JOIN public.titles t ON t.id = s.title_id
    JOIN public.permission_templates pt ON pt.id = t.template_id
   WHERE s.user_id = p_user
   LIMIT 1;
  IF v_role IS NULL THEN RETURN; END IF;
  UPDATE public.users
     SET role = v_role, department_id = coalesce(v_dept, department_id)
   WHERE id = p_user
     AND (role IS DISTINCT FROM v_role OR department_id IS DISTINCT FROM coalesce(v_dept, department_id));
END
$fn$;

REVOKE ALL ON FUNCTION public.sync_user_role(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_user_role(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.hr_staff_sync_user_role()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  PERFORM public.sync_user_role(NEW.user_id);
  RETURN NULL;
END
$fn$;

REVOKE ALL ON FUNCTION public.hr_staff_sync_user_role() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER hr_staff_costs_sync_user_role
  AFTER INSERT OR UPDATE OF title_id, user_id, department_id ON public.hr_staff_costs
  FOR EACH ROW WHEN (NEW.user_id IS NOT NULL)
  EXECUTE FUNCTION public.hr_staff_sync_user_role();

CREATE OR REPLACE FUNCTION public.titles_sync_user_roles()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  PERFORM public.sync_user_role(s.user_id)
     FROM public.hr_staff_costs s
    WHERE s.title_id = NEW.id AND s.user_id IS NOT NULL;
  RETURN NULL;
END
$fn$;

REVOKE ALL ON FUNCTION public.titles_sync_user_roles() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER titles_sync_user_roles
  AFTER UPDATE OF template_id ON public.titles
  FOR EACH ROW EXECUTE FUNCTION public.titles_sync_user_roles();

-- What somebody with a login may do follows their title — so moving them onto
-- a title with ANOTHER template, or giving a person a login, is a permission
-- decision too: whoever edits the roster cannot promote somebody (themselves
-- included) by retitling them. Moves inside one template (a promotion up the
-- Revenue ladder) and everybody without a login stay HR's.
CREATE OR REPLACE FUNCTION public.hr_staff_permission_guard()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_from uuid;
  v_to   uuid;
BEGIN
  IF NEW.user_id IS NULL OR auth.uid() IS NULL OR public.has_perm('permissions_manage') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.user_id IS NOT DISTINCT FROM OLD.user_id AND NEW.title_id IS NOT DISTINCT FROM OLD.title_id THEN
      RETURN NEW;
    END IF;
    IF NEW.user_id IS NOT DISTINCT FROM OLD.user_id THEN
      SELECT template_id INTO v_from FROM public.titles WHERE id = OLD.title_id;
      SELECT template_id INTO v_to FROM public.titles WHERE id = NEW.title_id;
      IF v_from IS NOT DISTINCT FROM v_to THEN RETURN NEW; END IF;
    END IF;
  END IF;
  RAISE EXCEPTION 'This person signs in: moving them to a title on another permission template changes what they can do. Ask whoever manages permissions.'
    USING ERRCODE = '42501';
END
$fn$;

REVOKE ALL ON FUNCTION public.hr_staff_permission_guard() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER hr_staff_costs_permission_guard
  BEFORE INSERT OR UPDATE OF title_id, user_id ON public.hr_staff_costs
  FOR EACH ROW EXECUTE FUNCTION public.hr_staff_permission_guard();

-- ─── The ten templates, and the titles that use them ───────────────────────
-- The design's eight (TEMPLATES in People Management v2.dc.html, grants as
-- drawn), with HR · Payroll also running Member Services; "Principal · Full
-- access" split into Full access and Ultimate full access (user: 我可以 switch
-- 过去任何的 tab); and Revenue Team for the Revenue app.

INSERT INTO public.permission_templates (key, name, description, base_role, sort_order) VALUES
  ('ultimate',     'Ultimate full access', 'Everything, company-wide, including approvals and settings — and switching to see the portal as HR, Finance or the Revenue team. Keep it to the owner.', 'principal', 10),
  ('full',         'Full access',          'Everything, company-wide, including approvals and settings, without switching views.', 'principal', 20),
  ('director',     'Director',             'Reads the whole company and signs off money. Raises their own claims.', 'staff', 30),
  ('office',       'Executive office',     'Sees the approval queue and the reports a director is asked about, without acting on them.', 'staff', 40),
  ('fin_checker',  'Finance · Checker',    'Approves what Finance makers raise, reconciles and reports. Does not raise payments.', 'finance', 50),
  ('fin_maker',    'Finance · Maker',      'Raises payments, invoices and journal entries for a checker to approve.', 'finance', 60),
  ('hr',           'HR · Payroll',         'Runs the roster, payroll and the Revenue members'' requests. Nothing that touches the bank.', 'hr', 70),
  ('dept_head',    'Department head',      'Their own department only: its pool, OPEX, billing, reports and claims to approve.', 'dept_manager', 80),
  ('staff',        'Staff · Basic',        'The overview and their own claims.', 'staff', 90),
  ('revenue_team', 'Revenue Team',         'The Revenue app: their own sales, income, quotes and requests.', 'revenue_member', 100)
ON CONFLICT (key) DO NOTHING;

-- Full and Ultimate: every action of every portal function, as far as it reaches.
INSERT INTO public.permission_template_grants (template_id, function_key, action, scope)
SELECT t.id, f.key, a.action, f.scopes[cardinality(f.scopes)]
  FROM public.permission_templates t
 CROSS JOIN public.permission_functions f
 CROSS JOIN LATERAL unnest(f.actions) AS a(action)
 WHERE t.key IN ('full', 'ultimate')
   AND f.key NOT IN ('revenue_app', 'view_switch')
ON CONFLICT DO NOTHING;
INSERT INTO public.permission_template_grants (template_id, function_key, action, scope)
SELECT t.id, 'view_switch', 'view', 'all' FROM public.permission_templates t WHERE t.key = 'ultimate'
ON CONFLICT DO NOTHING;

INSERT INTO public.permission_template_grants (template_id, function_key, action, scope)
SELECT t.id, g.function_key, g.action, g.scope
  FROM (VALUES
    ('director', 'dashboard', 'view', 'all'),
    ('director', 'approvals', 'view', 'all'), ('director', 'approvals', 'approve', 'all'),
    ('director', 'treasury', 'view', 'all'), ('director', 'treasury', 'create', 'all'),
    ('director', 'treasury', 'approve', 'all'), ('director', 'treasury', 'export', 'all'),
    ('director', 'reports', 'view', 'all'), ('director', 'reports', 'export', 'all'),
    ('director', 'dept_reports', 'view', 'all'),
    ('director', 'director_salary', 'view', 'all'), ('director', 'director_salary', 'approve', 'all'),
    ('director', 'director_pool', 'view', 'all'),
    ('director', 'venture_pool', 'view', 'all'),
    ('director', 'claims', 'view', 'own'), ('director', 'claims', 'create', 'own'),
    ('director', 'team', 'view', 'all'),

    ('office', 'dashboard', 'view', 'all'),
    ('office', 'approvals', 'view', 'all'),
    ('office', 'reports', 'view', 'all'),
    ('office', 'team', 'view', 'all'),
    ('office', 'claims', 'view', 'own'), ('office', 'claims', 'create', 'own'),

    ('fin_checker', 'dashboard', 'view', 'all'),
    ('fin_checker', 'treasury', 'view', 'all'), ('fin_checker', 'treasury', 'approve', 'all'), ('fin_checker', 'treasury', 'export', 'all'),
    ('fin_checker', 'billing', 'view', 'all'), ('fin_checker', 'billing', 'export', 'all'),
    ('fin_checker', 'categories', 'view', 'all'), ('fin_checker', 'categories', 'manage', 'all'),
    ('fin_checker', 'dept_pool', 'view', 'all'),
    ('fin_checker', 'venture_pool', 'view', 'all'), ('fin_checker', 'venture_pool', 'export', 'all'),
    ('fin_checker', 'reports', 'view', 'all'), ('fin_checker', 'reports', 'export', 'all'),
    ('fin_checker', 'dept_reports', 'view', 'all'), ('fin_checker', 'dept_reports', 'export', 'all'),
    ('fin_checker', 'reconciliation', 'view', 'all'), ('fin_checker', 'reconciliation', 'approve', 'all'),
    ('fin_checker', 'claims', 'view', 'all'), ('fin_checker', 'claims', 'approve', 'all'),

    ('fin_maker', 'dashboard', 'view', 'all'),
    ('fin_maker', 'treasury', 'view', 'all'), ('fin_maker', 'treasury', 'create', 'all'), ('fin_maker', 'treasury', 'edit', 'all'),
    ('fin_maker', 'billing', 'view', 'all'), ('fin_maker', 'billing', 'create', 'all'), ('fin_maker', 'billing', 'edit', 'all'),
    ('fin_maker', 'venture_pool', 'view', 'all'), ('fin_maker', 'venture_pool', 'create', 'all'),
    ('fin_maker', 'reconciliation', 'view', 'all'), ('fin_maker', 'reconciliation', 'create', 'all'), ('fin_maker', 'reconciliation', 'edit', 'all'),
    ('fin_maker', 'claims', 'view', 'own'), ('fin_maker', 'claims', 'create', 'own'),

    ('hr', 'dashboard', 'view', 'all'),
    ('hr', 'hr_costing', 'view', 'all'), ('hr', 'hr_costing', 'create', 'all'), ('hr', 'hr_costing', 'edit', 'all'), ('hr', 'hr_costing', 'export', 'all'),
    ('hr', 'revenue', 'view', 'all'), ('hr', 'revenue', 'edit', 'all'),
    ('hr', 'director_salary', 'view', 'all'), ('hr', 'director_salary', 'edit', 'all'),
    ('hr', 'director_pool', 'view', 'all'),
    ('hr', 'team', 'view', 'all'), ('hr', 'team', 'create', 'all'), ('hr', 'team', 'edit', 'all'),
    ('hr', 'accounts', 'view', 'all'),
    ('hr', 'member', 'view', 'all'), ('hr', 'member', 'manage', 'all'),
    ('hr', 'claims', 'view', 'own'), ('hr', 'claims', 'create', 'own'),

    ('dept_head', 'dashboard', 'view', 'all'),
    ('dept_head', 'dept_pool', 'view', 'dept'), ('dept_head', 'dept_pool', 'export', 'dept'),
    ('dept_head', 'opex', 'view', 'dept'),
    ('dept_head', 'my_billing', 'view', 'dept'), ('dept_head', 'my_billing', 'create', 'dept'),
    ('dept_head', 'claims', 'view', 'dept'), ('dept_head', 'claims', 'create', 'own'), ('dept_head', 'claims', 'approve', 'dept'),
    ('dept_head', 'dept_reports', 'view', 'dept'), ('dept_head', 'dept_reports', 'export', 'dept'),
    ('dept_head', 'team', 'view', 'dept'),

    ('staff', 'dashboard', 'view', 'all'),
    ('staff', 'claims', 'view', 'own'), ('staff', 'claims', 'create', 'own'), ('staff', 'claims', 'edit', 'own'),

    ('revenue_team', 'revenue_app', 'view', 'own'), ('revenue_team', 'revenue_app', 'create', 'own')
  ) AS g(template_key, function_key, action, scope)
  JOIN public.permission_templates t ON t.key = g.template_key
ON CONFLICT DO NOTHING;

INSERT INTO public.permission_template_sensitive (template_id, field)
SELECT t.id, s.field
  FROM (VALUES
    ('ultimate', 'salary'), ('ultimate', 'nric'), ('ultimate', 'bank'),
    ('full', 'salary'), ('full', 'nric'), ('full', 'bank'),
    ('director', 'salary'),
    ('fin_checker', 'bank'),
    ('fin_maker', 'bank'),
    ('hr', 'salary'), ('hr', 'nric'), ('hr', 'bank')
  ) AS s(template_key, field)
  JOIN public.permission_templates t ON t.key = s.template_key
ON CONFLICT DO NOTHING;

-- The titles, as agreed with the user (2026-10-08). ACCOUNTS EXECUTIVE — the
-- one title somebody who can sign in holds — waits for the user's choice.
UPDATE public.titles t
   SET template_id = pt.id
  FROM (VALUES
    ('Director', 'CHIEF EXECUTIVE OFFICER', 'ultimate'),
    ('Director', 'DIRECTOR', 'director'),
    ('Director Office', 'PERSONAL ASSISTANT', 'office'),
    ('Finance', 'ASSISTANT FINANCE MANAGER', 'fin_checker'),
    ('Finance', 'SENIOR ACCOUNT EXECUTIVE', 'fin_maker'),
    ('Finance', 'ACCOUNTS ASSISTANT', 'fin_maker'),
    ('HR', 'HR MANAGER', 'hr'),
    ('HR', 'SENIOR HR EXECUTIVE', 'hr'),
    ('HR', 'HR EXECUTIVE', 'hr'),
    ('HR', 'HR ASSISTANT', 'hr'),
    ('Marketing', 'MARKETING MANAGER', 'dept_head'),
    ('Marketing', 'ASSISTANT MARKETING MANAGER', 'staff'),
    ('Marketing', 'CONTENT CREATOR', 'staff'),
    ('Marketing', 'EVENT SPECIALIST CUM VISUAL MERCHANDISER EXECUTIVE', 'staff'),
    ('Marketing', 'GRAPHIC DESIGNER', 'staff'),
    ('Marketing', 'SENIOR MARKETING EXECUTIVE', 'staff'),
    ('Marketing', 'SENIOR VIDEOGRAPHER & VIDEO EDITOR', 'staff'),
    ('Marketing', 'SOCIAL MEDIA SPECIALIST', 'staff'),
    ('Marketing', 'TELEMARKETER', 'staff'),
    ('Marketing', 'VIDEOGRAPHER & VIDEO EDITOR', 'staff'),
    ('IT', 'IT DEVELOPER EXECUTIVE', 'staff'),
    ('IT', 'INTERNSHIP', 'staff'),
    ('Revenue Department', 'Revenue Director', 'revenue_team'),
    ('Revenue Department', 'Senior Team Leader', 'revenue_team'),
    ('Revenue Department', 'Team Leader', 'revenue_team'),
    ('Revenue Department', 'Senior Team Assistant', 'revenue_team'),
    ('Revenue Department', 'Team Assistant', 'revenue_team'),
    ('Revenue Department', 'Senior Revenue Specialist', 'revenue_team'),
    ('Revenue Department', 'Revenue Specialist', 'revenue_team')
  ) AS m(department, title, template_key)
  JOIN public.departments d ON d.name = m.department
  JOIN public.permission_templates pt ON pt.key = m.template_key
 WHERE t.name = m.title AND t.department_id = d.id AND t.template_id IS NULL;

-- ─── Who may do what, resolved ─────────────────────────────────────────────
-- A person whose title has a template: the template's cells, overlaid with
-- their own cell exceptions, opened into module keys as permission_cell_keys
-- allows (scope reached, gate held); salary amounts open the two salary keys.
-- Anybody else: their title's legacy title_permissions, else their role's
-- defaults — exactly as before. Then, for both, the old per-key exceptions
-- (user_permissions), and a revenue_member account still only ever holds the
-- member app's keys.

CREATE OR REPLACE FUNCTION public.current_permissions() RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH me AS (
  SELECT id,role FROM public.users WHERE id=auth.uid() AND is_active
 ), my_title AS (
  SELECT s.title_id,t.template_id FROM public.hr_staff_costs s JOIN public.titles t ON t.id=s.title_id
  WHERE s.user_id=(SELECT id FROM me) LIMIT 1
 ), my_template AS (
  SELECT pt.id,pt.base_role FROM public.permission_templates pt WHERE pt.id=(SELECT template_id FROM my_title)
 ), cells AS (
  SELECT g.function_key,g.action,g.scope FROM public.permission_template_grants g
  WHERE g.template_id=(SELECT id FROM my_template)
   AND NOT EXISTS(SELECT 1 FROM public.user_permission_cells u
    WHERE u.user_id=(SELECT id FROM me) AND u.function_key=g.function_key AND u.action=g.action)
  UNION ALL
  SELECT u.function_key,u.action,u.scope FROM public.user_permission_cells u
  WHERE u.user_id=(SELECT id FROM me) AND u.scope IS NOT NULL AND EXISTS(SELECT 1 FROM my_template)
 ), sees_salary AS (
  SELECT EXISTS(SELECT 1 FROM public.permission_template_sensitive s
   WHERE s.template_id=(SELECT id FROM my_template) AND s.field='salary') AS yes
 ), template_keys AS (
  SELECT k.legacy_key AS key FROM cells c
  JOIN public.permission_cell_keys k ON k.function_key=c.function_key AND k.action=c.action
  WHERE array_position(ARRAY['own','dept','all'],c.scope)>=array_position(ARRAY['own','dept','all'],k.min_scope)
   AND (k.gate IS NULL
    OR (k.gate='salary' AND (SELECT yes FROM sees_salary))
    OR (k.gate='treasury' AND EXISTS(SELECT 1 FROM cells t WHERE t.function_key='treasury' AND t.action='view'))
    OR (k.gate='principal' AND (SELECT base_role FROM my_template)='principal'))
  UNION
  SELECT unnest(ARRAY['salary_individual','payroll_payouts']) WHERE (SELECT yes FROM sees_salary)
 ), title_is_configured AS (
  SELECT EXISTS(SELECT 1 FROM public.title_permissions tp WHERE tp.title_id=(SELECT title_id FROM my_title)) AS yes
 ), inherited AS (
  SELECT key FROM template_keys WHERE EXISTS(SELECT 1 FROM my_template)
  UNION
  SELECT tp.permission_key FROM public.title_permissions tp
  WHERE tp.title_id=(SELECT title_id FROM my_title) AND (SELECT yes FROM title_is_configured)
   AND NOT EXISTS(SELECT 1 FROM my_template) AND (SELECT role FROM me)<>'revenue_member'
  UNION
  SELECT rdp.permission_key FROM public.role_default_permissions rdp
  WHERE rdp.role=(SELECT role FROM me) AND NOT EXISTS(SELECT 1 FROM my_template)
   AND (NOT(SELECT yes FROM title_is_configured) OR (SELECT role FROM me)='revenue_member')
 ), overrides AS (
  SELECT permission_key AS key,granted FROM public.user_permissions WHERE user_id=(SELECT id FROM me)
 ), resolved AS (
  SELECT i.key FROM inherited i WHERE NOT EXISTS(SELECT 1 FROM overrides o WHERE o.key=i.key AND NOT o.granted)
  UNION SELECT o.key FROM overrides o WHERE o.granted
 )
 SELECT coalesce(array_agg(key),'{}'::text[]) FROM resolved
 WHERE (SELECT role FROM me)<>'revenue_member'
  OR key=ANY(ARRAY['member_portal','member_quote','member_requests','member_memos','member_insight']);
$$;
REVOKE ALL ON FUNCTION public.current_permissions() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.current_permissions() TO authenticated;

-- ─── Writing them: accounts.manage (permissions_manage) only ───────────────

-- A list of cells as the matrix sends it: [{function_key, action, scope}].
CREATE OR REPLACE FUNCTION public.permission_cells_of(p_cells jsonb)
RETURNS TABLE (function_key text, action text, scope text)
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT c.function_key, c.action, c.scope
    FROM jsonb_to_recordset(CASE WHEN jsonb_typeof(p_cells) = 'array' THEN p_cells ELSE '[]'::jsonb END)
      AS c(function_key text, action text, scope text);
$fn$;

-- A new template, empty or a copy of another (its cells, its fields, its kind).
CREATE OR REPLACE FUNCTION public.permission_template_create(p_name text, p_description text, p_copy_from uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_name text := btrim(coalesce(p_name, ''));
  v_base text;
  v_key  text;
  v_n    integer := 1;
  v_id   uuid;
  v_role public.user_role := 'staff';
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_perm('permissions_manage') THEN
    RAISE EXCEPTION 'Only whoever manages permissions makes a template' USING ERRCODE = '42501';
  END IF;
  IF length(v_name) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'Give the template a name, up to 80 characters'; END IF;
  IF length(coalesce(p_description, '')) > 400 THEN RAISE EXCEPTION 'Keep the description under 400 characters'; END IF;
  IF EXISTS (SELECT 1 FROM public.permission_templates WHERE lower(name) = lower(v_name)) THEN
    RAISE EXCEPTION 'There is already a template called %', v_name;
  END IF;
  IF p_copy_from IS NOT NULL THEN
    SELECT base_role INTO v_role FROM public.permission_templates WHERE id = p_copy_from;
    IF NOT FOUND THEN RAISE EXCEPTION 'The template to copy is gone'; END IF;
  END IF;
  -- The key a person never types: the name in snake_case, made unique.
  v_base := trim(BOTH '_' FROM regexp_replace(lower(v_name), '[^a-z0-9]+', '_', 'g'));
  v_base := rtrim(left(v_base, 34), '_');
  IF v_base !~ '^[a-z][a-z0-9_]' THEN v_base := rtrim('tpl_' || v_base, '_'); END IF;
  v_key := v_base;
  WHILE EXISTS (SELECT 1 FROM public.permission_templates WHERE key = v_key) LOOP
    v_n := v_n + 1;
    v_key := v_base || '_' || v_n;
  END LOOP;
  INSERT INTO public.permission_templates (key, name, description, base_role, sort_order, created_by, updated_by)
  VALUES (v_key, v_name, nullif(btrim(coalesce(p_description, '')), ''), v_role,
          coalesce((SELECT max(sort_order) FROM public.permission_templates), 0) + 10, auth.uid(), auth.uid())
  RETURNING id INTO v_id;
  IF p_copy_from IS NOT NULL THEN
    INSERT INTO public.permission_template_grants (template_id, function_key, action, scope)
    SELECT v_id, function_key, action, scope FROM public.permission_template_grants WHERE template_id = p_copy_from;
    INSERT INTO public.permission_template_sensitive (template_id, field)
    SELECT v_id, field FROM public.permission_template_sensitive WHERE template_id = p_copy_from;
  END IF;
  RETURN v_id;
END
$fn$;

-- One save of one template: its cells, its sensitive fields, and — for the
-- people the user chose — their own exceptions on the cells that changed,
-- dropped so they follow the template again. Refused over a newer save.
CREATE OR REPLACE FUNCTION public.permission_template_save(
  p_template uuid, p_version integer, p_grants jsonb, p_sensitive text[], p_reset jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  t        public.permission_templates%ROWTYPE;
  v_bad    text;
  v_titles integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_perm('permissions_manage') THEN
    RAISE EXCEPTION 'Only whoever manages permissions changes a template' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO t FROM public.permission_templates WHERE id = p_template FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'That template is gone'; END IF;
  IF t.version IS DISTINCT FROM p_version THEN
    RAISE EXCEPTION '% was changed by somebody else since you opened it. Reload and try again', t.name;
  END IF;
  IF jsonb_typeof(p_grants) IS DISTINCT FROM 'array' OR jsonb_array_length(p_grants) > 400 THEN
    RAISE EXCEPTION 'The cells must be sent as a list';
  END IF;

  SELECT coalesce(c.function_key, '?') || '.' || coalesce(c.action, '?') INTO v_bad
    FROM public.permission_cells_of(p_grants) c
   WHERE c.scope IS NULL OR NOT public.permission_cell_is_valid(c.function_key, c.action, c.scope)
   LIMIT 1;
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION '% cannot be granted that way', v_bad; END IF;
  SELECT c.function_key || '.' || c.action INTO v_bad
    FROM public.permission_cells_of(p_grants) c
   GROUP BY c.function_key, c.action HAVING count(*) > 1 LIMIT 1;
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION '% is listed twice', v_bad; END IF;
  -- Any action brings View up with it: none may reach further than View.
  SELECT c.function_key INTO v_bad
    FROM public.permission_cells_of(p_grants) c
    LEFT JOIN public.permission_cells_of(p_grants) v ON v.function_key = c.function_key AND v.action = 'view'
   WHERE c.action <> 'view'
     AND coalesce(array_position(ARRAY['own','dept','all'], v.scope), 0) < array_position(ARRAY['own','dept','all'], c.scope)
   LIMIT 1;
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION '%: an action reaches further than View', v_bad; END IF;
  IF EXISTS (SELECT 1 FROM unnest(coalesce(p_sensitive, '{}'::text[])) f WHERE f IS NULL OR f NOT IN ('salary', 'nric', 'bank')) THEN
    RAISE EXCEPTION 'Sensitive fields are salary, nric and bank';
  END IF;

  DELETE FROM public.permission_template_grants g
   WHERE g.template_id = p_template
     AND NOT EXISTS (SELECT 1 FROM public.permission_cells_of(p_grants) c
                      WHERE c.function_key = g.function_key AND c.action = g.action);
  INSERT INTO public.permission_template_grants AS g (template_id, function_key, action, scope)
  SELECT p_template, c.function_key, c.action, c.scope FROM public.permission_cells_of(p_grants) c
  ON CONFLICT (template_id, function_key, action) DO UPDATE
    SET scope = EXCLUDED.scope
    WHERE g.scope IS DISTINCT FROM EXCLUDED.scope;

  DELETE FROM public.permission_template_sensitive s
   WHERE s.template_id = p_template AND NOT (s.field = ANY (coalesce(p_sensitive, '{}'::text[])));
  INSERT INTO public.permission_template_sensitive (template_id, field)
  SELECT DISTINCT p_template, f FROM unnest(coalesce(p_sensitive, '{}'::text[])) f
  ON CONFLICT DO NOTHING;

  -- Exceptions the user chose to put back on the template — only of people on it.
  IF jsonb_typeof(p_reset) = 'array' AND jsonb_array_length(p_reset) > 0 THEN
    DELETE FROM public.user_permission_cells u
     USING jsonb_to_recordset(p_reset) AS r(user_id uuid, function_key text, action text)
     WHERE u.user_id = r.user_id AND u.function_key = r.function_key AND u.action = r.action
       AND EXISTS (SELECT 1 FROM public.hr_staff_costs s JOIN public.titles ti ON ti.id = s.title_id
                    WHERE s.user_id = u.user_id AND ti.template_id = p_template);
  END IF;

  UPDATE public.permission_templates
     SET version = version + 1, updated_at = now(), updated_by = auth.uid()
   WHERE id = p_template;
  SELECT count(*) INTO v_titles FROM public.titles WHERE template_id = p_template;
  RETURN jsonb_build_object('version', t.version + 1, 'titles', v_titles);
END
$fn$;

-- A title moves to another template, at once.
CREATE OR REPLACE FUNCTION public.permission_title_set_template(p_title uuid, p_template uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_perm('permissions_manage') THEN
    RAISE EXCEPTION 'Only whoever manages permissions points a title at a template' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.titles WHERE id = p_title) THEN RAISE EXCEPTION 'That title is gone'; END IF;
  IF p_template IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.permission_templates WHERE id = p_template) THEN
    RAISE EXCEPTION 'That template is gone';
  END IF;
  UPDATE public.titles SET template_id = p_template WHERE id = p_title AND template_id IS DISTINCT FROM p_template;
END
$fn$;

-- One person's exceptions, the whole set: [{function_key, action, scope|null}].
CREATE OR REPLACE FUNCTION public.permission_user_cells_set(p_user uuid, p_cells jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_bad text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_perm('permissions_manage') THEN
    RAISE EXCEPTION 'Only whoever manages permissions sets a person''s own permissions' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user) THEN RAISE EXCEPTION 'That account is gone'; END IF;
  IF jsonb_typeof(p_cells) IS DISTINCT FROM 'array' OR jsonb_array_length(p_cells) > 400 THEN
    RAISE EXCEPTION 'The cells must be sent as a list';
  END IF;

  SELECT coalesce(c.function_key, '?') || '.' || coalesce(c.action, '?') INTO v_bad
    FROM public.permission_cells_of(p_cells) c
   WHERE NOT public.permission_cell_is_valid(c.function_key, c.action, c.scope)
   LIMIT 1;
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION '% cannot be set that way', v_bad; END IF;
  SELECT c.function_key || '.' || c.action INTO v_bad
    FROM public.permission_cells_of(p_cells) c
   GROUP BY c.function_key, c.action HAVING count(*) > 1 LIMIT 1;
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION '% is listed twice', v_bad; END IF;

  DELETE FROM public.user_permission_cells u
   WHERE u.user_id = p_user
     AND NOT EXISTS (SELECT 1 FROM public.permission_cells_of(p_cells) c
                      WHERE c.function_key = u.function_key AND c.action = u.action);
  INSERT INTO public.user_permission_cells AS u (user_id, function_key, action, scope, updated_by)
  SELECT p_user, c.function_key, c.action, c.scope, auth.uid() FROM public.permission_cells_of(p_cells) c
  ON CONFLICT (user_id, function_key, action) DO UPDATE
    SET scope = EXCLUDED.scope, updated_at = now(), updated_by = auth.uid()
    WHERE u.scope IS DISTINCT FROM EXCLUDED.scope;
END
$fn$;

-- A person's old per-key exceptions (the matrix before templates), cleared so
-- only their template and their cells decide.
CREATE OR REPLACE FUNCTION public.permission_user_clear_legacy(p_user uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_n integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_perm('permissions_manage') THEN
    RAISE EXCEPTION 'Only whoever manages permissions clears a person''s exceptions' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.user_permissions WHERE user_id = p_user;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END
$fn$;

-- The history of who may do what, for the Permissions tab: newest first.
CREATE OR REPLACE FUNCTION public.permission_history(p_limit integer DEFAULT 200)
RETURNS TABLE (
  id bigint, occurred_at timestamptz, actor_name text, table_name text, row_key text,
  op text, old_row jsonb, new_row jsonb, changed text[], txid bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT e.id, e.occurred_at,
         CASE WHEN e.actor_id IS NULL THEN 'System' ELSE coalesce(u.name, u.email, 'Removed account') END,
         e.table_name, e.row_key, e.op, e.old_row, e.new_row, e.changed, e.txid
    FROM public.audit_events e
    LEFT JOIN public.users u ON u.id = e.actor_id
   WHERE ((SELECT public.has_perm('permissions_manage')) OR (SELECT public.has_perm('audit_log')))
     AND e.table_name IN ('permission_templates', 'permission_template_grants', 'permission_template_sensitive',
                          'user_permission_cells', 'titles', 'users', 'user_permissions', 'title_permissions')
   ORDER BY e.occurred_at DESC, e.id DESC
   LIMIT least(greatest(coalesce(p_limit, 200), 1), 2000);
$fn$;

REVOKE ALL ON FUNCTION public.permission_cell_is_valid(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.permission_cell_is_valid(text, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.permission_cells_of(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.permission_cells_of(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.permission_template_create(text, text, uuid),
  public.permission_template_save(uuid, integer, jsonb, text[], jsonb),
  public.permission_title_set_template(uuid, uuid),
  public.permission_user_cells_set(uuid, jsonb),
  public.permission_user_clear_legacy(uuid),
  public.permission_history(integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.permission_template_create(text, text, uuid),
  public.permission_template_save(uuid, integer, jsonb, text[], jsonb),
  public.permission_title_set_template(uuid, uuid),
  public.permission_user_cells_set(uuid, jsonb),
  public.permission_user_clear_legacy(uuid),
  public.permission_history(integer)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
