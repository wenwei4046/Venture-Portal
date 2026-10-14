// Local PostgreSQL regression for 20261014100000 (2026-10-14 — the user ticked Product List View + Edit on the Revenue
// Director template and it did not open: "明明我这边已经打够了，为什么它并没有显示？"; then "因为 Revenue Director 本身
// 可以决定并调整一些 costing，所以为什么 Product List 本身是可以 access 给他看到的", and a side agent's note: open the
// Product List alone, never the Principal's admin domain). Production's permission helpers and the three Product List
// functions are loaded from `product-list-access-production.sql` (md5-checked), the Product List's tables stand in with
// production's policies, then the migration runs VERBATIM, twice. What is under test: a Revenue app account and a
// staff template whose ticks hold Product List open it and read / write exactly its tables; `has_scope('admin')` is
// still nobody's but the Principal's (the access log stays shut); a scheme opens for reading, never for writing; the
// costing gaps, the cost setting and a combo's removal ask Product List · View / Edit; an account without it reads
// nothing; the Principal's own templates and principal@ keep everything. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`

let checks = 0
const check = (actual, expected, what) => {
  assert.deepEqual(actual, expected, what)
  checks++
}
const reject = async (sql, params, pattern, what) => {
  await assert.rejects(() => q(sql, params), pattern, what)
  checks++
}
const text = async url => (await readFile(url, 'utf8')).replace(/\r\n/g, '\n')
const MIGRATION = '20261014100000_product_list_for_any_template'

const T_DIRECTOR = id(1), T_DIRECTOR_VIEW = id(2), T_TEAM = id(3), T_FULL = id(4), T_STAFF = id(5)
const PETER = id(11), MEMBER = id(12), CEO = id(13), SHARED = id(14), VIEWER = id(15), OFFICE = id(16)
const SCHEME = id(21)

/** Signed in as `user`, the authenticated role. */
async function as(user) {
  await db.exec('RESET ROLE')
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [user])
  await db.exec('SET ROLE authenticated')
}
const asOwner = async () => {
  await db.exec('RESET ROLE')
  await q(`SELECT set_config('request.jwt.claim.sub', '', false)`)
}
const count = async table => Number(await one(`SELECT count(*) FROM public.${table}`))

try {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    CREATE TYPE public.user_role AS ENUM ('principal', 'finance', 'hr', 'dept_manager', 'revenue_member', 'staff');

    CREATE TABLE public.users(id uuid PRIMARY KEY, role public.user_role, is_active boolean NOT NULL DEFAULT true);
    CREATE TABLE public.permission_templates(id uuid PRIMARY KEY, name text, base_role public.user_role);
    CREATE TABLE public.titles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, template_id uuid);
    CREATE TABLE public.hr_staff_costs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, title_id uuid);
    CREATE TABLE public.permission_template_grants(template_id uuid, function_key text, action text, scope text);
    CREATE TABLE public.user_permission_cells(user_id uuid, function_key text, action text, scope text);
    CREATE TABLE public.permission_template_sensitive(template_id uuid, field text);
    CREATE TABLE public.permission_cell_keys(function_key text, action text, legacy_key text, min_scope text, gate text);
    CREATE TABLE public.title_permissions(title_id uuid, permission_key text);
    CREATE TABLE public.role_default_permissions(role public.user_role, permission_key text);
    CREATE TABLE public.user_permissions(user_id uuid, permission_key text, granted boolean);
    CREATE TABLE public.permission_defs(key text PRIMARY KEY, scope text NOT NULL
      CHECK (scope = ANY (ARRAY['admin', 'treasury', 'hr', 'shared', 'none'])));
    CREATE TABLE public.permission_key_actions(legacy_key text, function_key text, action text);
    CREATE TABLE public.permission_table_reads(table_name text PRIMARY KEY, actions text[]);
    CREATE TABLE public.permission_table_writes(table_name text, command text, actions text[]);

    -- The Product List's tables (the columns its functions name) and one the admin domain alone opens.
    CREATE TABLE public.erp_products(erp_id text PRIMARY KEY, erp_company_id bigint NOT NULL DEFAULT 1, item_code text, removed_at timestamptz, active boolean NOT NULL DEFAULT true);
    CREATE TABLE public.catalogue_skus(erp_product_id text PRIMARY KEY, price numeric, price_grid jsonb);
    CREATE TABLE public.catalogue_models(erp_model_id text PRIMARY KEY, offered boolean);
    CREATE TABLE public.catalogue_option_prices(pool text, value text, price numeric);
    CREATE TABLE public.catalogue_combos(erp_company_id bigint, base_model text, slots_key text, removed_at timestamptz, removed_by uuid);
    CREATE TABLE public.catalogue_combo_prices(erp_company_id bigint, base_model text, slots_key text, price numeric);
    CREATE TABLE public.comm_schemes(id uuid PRIMARY KEY, revenue_cost_divisor numeric, enable_kpi boolean NOT NULL DEFAULT false, updated_at timestamptz);
    CREATE TABLE public.comm_cost_ratios(scheme_id uuid, erp_product_id text, product_code text, ratio numeric, updated_by uuid, updated_at timestamptz,
      UNIQUE (scheme_id, erp_product_id));
    CREATE TABLE public.comm_brands(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text);
    CREATE TABLE public.comm_sub_departments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text);
    CREATE TABLE public.erp_product_models(erp_id text PRIMARY KEY);
    CREATE TABLE public.erp_maintenance_options(id text PRIMARY KEY);
    CREATE TABLE public.erp_fabrics(id text PRIMARY KEY);
    CREATE TABLE public.erp_sync_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), doc_no text, status text);
    CREATE TABLE public.sales_orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), erp_company_id bigint, order_date date, cancelled boolean NOT NULL DEFAULT false);
    CREATE TABLE public.sales_order_lines(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid, product_code text, item_group text, product_name text,
      brand_code text, qty numeric, line_amount numeric, cost_detail jsonb, cost_source text);
    CREATE TABLE public.access_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), path text);
  `)

  // ── Production's helpers and the three functions ─────────────────────────────────────────────────────────────
  await db.exec(await text(new URL('product-list-access-production.sql', import.meta.url)))
  const md5Of = sig => one('SELECT md5(prosrc) FROM pg_proc WHERE oid = $1::regprocedure', [sig])
  const production = {
    'public.current_permissions()': '1416f048980d8a2b70843c1512cb81f9', 'public.has_perm(text)': '2a720f7f844a1234bbda3da1be45de27',
    'public.has_scope(text[])': '58a0754281440abc45af67a7cd44c445', 'public.current_actions()': '8efd652f9c5692587cba94cf0d5fe9a7',
    'public.has_any_action(text[])': '3b261bc9d13cac97f6bdd1debb2a6618', 'public.may_read(text)': '25dedfe0d79c67c3dbfb0d71090cd6e8',
    'public.may_write(text,text)': 'a78f99b12ba6c24a5e27b87c7c30d1ac', 'public.revenue_costing_gaps(date,date)': '47e17f532a41dd0bd8a8e6cc03a56769',
    'public.catalogue_save_cost_setting(uuid,numeric,jsonb,text[])': '6f9b97a8b70fcc51cdd17b67d219190c',
    'public.catalogue_remove_combos(jsonb)': '25a03e2f35e8aa08c40ab95e89b9ca64',
  }
  for (const [sig, md5] of Object.entries(production)) check(await md5Of(sig), md5, `${sig} is production’s`)

  // Production's policies on those tables: the admin domain (and HR's reads), and the restrictive action checks.
  const tables = ['catalogue_skus', 'catalogue_models', 'catalogue_option_prices', 'catalogue_combos', 'catalogue_combo_prices', 'comm_schemes',
    'comm_cost_ratios', 'comm_brands', 'comm_sub_departments', 'erp_products', 'erp_product_models', 'erp_maintenance_options', 'erp_fabrics',
    'erp_sync_events', 'sales_orders', 'sales_order_lines']
  const readOnly = new Set(['erp_products', 'erp_product_models', 'erp_maintenance_options', 'erp_fabrics'])
  for (const t of tables) {
    await db.exec(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;
      GRANT SELECT, INSERT, UPDATE, DELETE ON public.${t} TO authenticated;
      ${readOnly.has(t)
        ? `CREATE POLICY ${t}_read ON public.${t} FOR SELECT USING (((SELECT has_scope(ARRAY['admin']))) OR ((SELECT has_scope(ARRAY['hr']))));`
        : `CREATE POLICY ${t}_principal_all ON public.${t} FOR ALL USING ((SELECT has_scope(ARRAY['admin']))) WITH CHECK ((SELECT has_scope(ARRAY['admin'])));
           CREATE POLICY ${t}_hr_select ON public.${t} FOR SELECT USING ((SELECT has_scope(ARRAY['hr'])));`}
      CREATE POLICY needs_action_select ON public.${t} AS RESTRICTIVE FOR SELECT USING ((SELECT may_read('${t}')));
      ${readOnly.has(t) ? '' : `
      CREATE POLICY needs_action_insert ON public.${t} AS RESTRICTIVE FOR INSERT WITH CHECK ((SELECT may_write('${t}', 'INSERT')));
      CREATE POLICY needs_action_update ON public.${t} AS RESTRICTIVE FOR UPDATE WITH CHECK ((SELECT may_write('${t}', 'UPDATE')));
      CREATE POLICY needs_action_delete ON public.${t} AS RESTRICTIVE FOR DELETE USING ((SELECT may_write('${t}', 'DELETE')));`}`)
  }
  await db.exec(`ALTER TABLE public.access_log ENABLE ROW LEVEL SECURITY; GRANT SELECT ON public.access_log TO authenticated;
    CREATE POLICY access_log_admin ON public.access_log FOR SELECT USING ((SELECT has_scope(ARRAY['admin'])));`)


  // ── The catalog as production has it (the rows these checks read) ──────────────────────────────────────────
  await db.exec(`
    INSERT INTO public.permission_defs VALUES ('product_list', 'admin'), ('settings', 'admin'), ('audit_log', 'admin'),
      ('member_portal', 'none'), ('member_insight', 'none'), ('hr_costing', 'hr');
    INSERT INTO public.permission_cell_keys VALUES ('product_list', 'view', 'product_list', 'all', 'principal'),
      ('settings', 'view', 'settings', 'all', 'principal'), ('audit_log', 'view', 'audit_log', 'all', 'principal'),
      ('revenue_app', 'view', 'member_portal', 'own', NULL), ('revenue_app', 'view', 'member_insight', 'own', NULL);
    INSERT INTO public.permission_key_actions VALUES ('product_list', 'product_list', 'view'), ('product_list', 'product_list', 'edit'),
      ('settings', 'settings', 'view'), ('audit_log', 'audit_log', 'view'), ('member_portal', 'revenue_app', 'view');
    INSERT INTO public.role_default_permissions VALUES ('principal', 'product_list'), ('principal', 'settings'), ('principal', 'audit_log');
    INSERT INTO public.permission_table_reads VALUES
      ('catalogue_skus', '{product_list.edit,product_list.view,revenue.create,revenue.edit,revenue.manage,revenue.view:own}'),
      ('catalogue_models', '{product_list.edit,product_list.view}'),
      ('catalogue_option_prices', '{product_list.edit,product_list.view,revenue.create,revenue.edit,revenue.manage}'),
      ('catalogue_combos', '{product_list.edit,product_list.view,revenue.edit}'),
      ('catalogue_combo_prices', '{product_list.edit,product_list.view,revenue.create,revenue.edit,revenue.manage}'),
      ('comm_schemes', '{accounts.view,product_list.edit,product_list.view,revenue.create,revenue.edit,revenue.manage,revenue.view:own,team.create,team.view:own}'),
      ('comm_cost_ratios', '{product_list.edit,product_list.view,revenue.edit,revenue.manage,revenue.view:own}'),
      ('comm_brands', '{product_list.view,revenue.create,revenue.edit,revenue.manage,revenue.view:own}'),
      ('comm_sub_departments', '{accounts.view,hr_costing.view:own,product_list.view,revenue.create,revenue.edit,revenue.manage,revenue.view:own,team.create,team.view:own}'),
      ('erp_products', '{product_list.edit,product_list.view,revenue.create,revenue.edit,revenue.manage,revenue.view:own}'),
      ('erp_product_models', '{product_list.view}'),
      ('erp_maintenance_options', '{product_list.view,revenue.manage,revenue.view:own}'),
      ('erp_fabrics', '{product_list.view,revenue.create,revenue.edit,revenue.manage}'),
      ('erp_sync_events', '{product_list.view,revenue.create,revenue.edit,revenue.manage,revenue.view:own}'),
      ('sales_orders', '{product_list.view,revenue.create,revenue.edit,revenue.manage,revenue.view:own}'),
      ('sales_order_lines', '{product_list.view,revenue.create,revenue.edit,revenue.manage,revenue.view:own}');
    INSERT INTO public.permission_table_writes
      SELECT t, c, '{product_list.edit}'::text[] FROM unnest(ARRAY['catalogue_skus', 'catalogue_models', 'catalogue_option_prices', 'catalogue_combos', 'catalogue_combo_prices']) t,
        unnest(ARRAY['INSERT', 'UPDATE', 'DELETE']) c
      UNION ALL SELECT 'comm_cost_ratios', c, '{revenue.manage,product_list.edit}'::text[] FROM unnest(ARRAY['INSERT', 'UPDATE', 'DELETE']) c
      UNION ALL SELECT 'comm_schemes', c, '{revenue.manage,product_list.edit}'::text[] FROM unnest(ARRAY['INSERT', 'UPDATE', 'DELETE']) c;
  `)
  // Templates: the Revenue Director (as the user saved it), one with View only, the Revenue Team, a full-access one, a staff one.
  await q(`INSERT INTO public.permission_templates VALUES ($1, 'Revenue Director', 'revenue_member'), ($2, 'Director · view', 'revenue_member'),
    ($3, 'Revenue Team', 'revenue_member'), ($4, 'Ultimate full access', 'principal'), ($5, 'Executive office', 'staff')`,
  [T_DIRECTOR, T_DIRECTOR_VIEW, T_TEAM, T_FULL, T_STAFF])
  const grant = (t, rows) => Promise.all(rows.map(([fn, action, scope]) => q('INSERT INTO public.permission_template_grants VALUES ($1, $2, $3, $4)', [t, fn, action, scope])))
  const app = [['revenue_app', 'view', 'own'], ['revenue_app', 'create', 'own']]
  await grant(T_DIRECTOR, [...app, ['product_list', 'view', 'all'], ['product_list', 'edit', 'all']])
  await grant(T_DIRECTOR_VIEW, [...app, ['product_list', 'view', 'all']])
  await grant(T_TEAM, app)
  await grant(T_FULL, [['product_list', 'view', 'all'], ['product_list', 'edit', 'all'], ['settings', 'view', 'all'], ['audit_log', 'view', 'all']])
  await grant(T_STAFF, [['product_list', 'view', 'all']])
  for (const [user, role, template] of [[PETER, 'revenue_member', T_DIRECTOR], [MEMBER, 'revenue_member', T_TEAM], [CEO, 'principal', T_FULL],
    [VIEWER, 'revenue_member', T_DIRECTOR_VIEW], [OFFICE, 'staff', T_STAFF]]) {
    const title = await one('INSERT INTO public.titles(name, template_id) VALUES ($1, $2) RETURNING id', [`title ${role}`, template])
    await q('INSERT INTO public.users VALUES ($1, $2)', [user, role])
    await q('INSERT INTO public.hr_staff_costs(user_id, title_id) VALUES ($1, $2)', [user, title])
  }
  await q(`INSERT INTO public.users VALUES ($1, 'principal')`, [SHARED]) // principal@: no staff row, the role's defaults

  // The catalogue, a scheme, a month of bills, the ERP's deliveries, the access log.
  await db.exec(`
    INSERT INTO public.erp_products(erp_id, item_code) VALUES ('E1', 'AK-QUEEN'), ('E2', 'AK-KING');
    INSERT INTO public.catalogue_skus VALUES ('E1', 2000, NULL);
    INSERT INTO public.catalogue_models VALUES ('M1', true);
    INSERT INTO public.catalogue_combos VALUES (1, 'SOFA-A', '3+2', NULL, NULL);
    INSERT INTO public.catalogue_combo_prices VALUES (1, 'SOFA-A', '3+2', 3000);
    INSERT INTO public.comm_schemes VALUES ('${SCHEME}', 0.7);
    INSERT INTO public.comm_brands(code) VALUES ('AKEMI');
    INSERT INTO public.comm_sub_departments(name) VALUES ('Fair');
    INSERT INTO public.erp_product_models VALUES ('M1'); INSERT INTO public.erp_maintenance_options VALUES ('O1'); INSERT INTO public.erp_fabrics VALUES ('F1');
    INSERT INTO public.erp_sync_events(doc_no, status) VALUES ('catalogue', 'applied'), ('HC-SO-1', 'created'), ('HC-SO-2', 'created');
    INSERT INTO public.sales_orders(id, erp_company_id, order_date) VALUES ('${id(31)}', 1, '2026-10-05');
    INSERT INTO public.sales_order_lines(order_id, product_code, item_group, product_name, brand_code, qty, line_amount, cost_source)
      VALUES ('${id(31)}', 'AK-KING', 'MATTRESS', 'King', 'AKEMI', 1, 4000, NULL);
    INSERT INTO public.access_log(path) VALUES ('/payroll'), ('/settings');
  `)

  // ── Before: the box is ticked and opens nothing ──────────────────────────────────────────────────────────────
  await as(PETER)
  check(await one(`SELECT public.has_perm('product_list')`), false, 'before: PETER’s template ticks it, the key is held back')
  check(await count('catalogue_skus'), 0, 'before: PETER reads no SKU')
  check(await q('SELECT * FROM public.revenue_costing_gaps($1, $2)', ['2026-10-01', '2026-11-01']), [],
    'before: the costing gaps ran as the caller and said "no gaps" to whoever could not read the bills')
  await asOwner()

  // ── The migration, verbatim — twice, the second changing nothing ────────────────────────────────────────────
  const migration = await text(new URL(`${MIGRATION}.sql`, migrations))
  await db.exec(migration)
  const touched = ['public.current_permissions()', 'public.revenue_costing_gaps(date,date)', 'public.catalogue_save_cost_setting(uuid,numeric,jsonb,text[])',
    'public.catalogue_remove_combos(jsonb)']
  const bodies = async () => Promise.all(touched.map(md5Of))
  const once = await bodies()
  const policies = async () => Number(await one(`SELECT count(*) FROM pg_policies WHERE policyname LIKE '%product_list'`))
  const policyCount = await policies()
  await db.exec(migration)
  check([await bodies(), await policies()], [once, policyCount], 'applying it twice changes nothing')
  check(policyCount, 14, 'fourteen of the Product List’s tables open to the key')
  check(await one(`SELECT scope FROM public.permission_defs WHERE key = 'product_list'`), 'none', 'the key is no admin-domain key')
  check(await one(`SELECT gate FROM public.permission_cell_keys WHERE function_key = 'product_list'`), null, 'and no Principal gate holds it')
  for (const fn of ['revenue_costing_gaps(date,date)', 'catalogue_save_cost_setting(uuid,numeric,jsonb,text[])']) {
    check(await one(`SELECT prosecdef FROM pg_proc WHERE oid = 'public.${fn}'::regprocedure`), true, `${fn} runs as its owner, asking its action`)
    check(await one(`SELECT has_function_privilege('anon', 'public.${fn}', 'EXECUTE')`), false, `the publishable key cannot call ${fn}`)
    check(await one(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE')`), true, `a signed-in login can call ${fn}`)
  }

  // ── PETER: Product List View + Edit, nothing of the admin domain ────────────────────────────────────────────
  await as(PETER)
  check((await one('SELECT public.current_permissions()')).sort(), ['member_insight', 'member_portal', 'product_list'], 'PETER holds the key beside his app’s')
  check(await one(`SELECT public.has_scope(ARRAY['admin'])`), false, 'and not the admin domain')
  check(await count('access_log'), 0, 'the access log stays shut')
  check([await count('catalogue_skus'), await count('catalogue_models'), await count('catalogue_combos'), await count('catalogue_combo_prices'),
    await count('erp_products'), await count('erp_product_models'), await count('erp_maintenance_options'), await count('erp_fabrics'),
    await count('comm_brands'), await count('comm_schemes'), await count('comm_sub_departments')], [1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1],
  'he reads the catalogue, the ERP’s mirror and the rules the page reads')
  check(await count('erp_sync_events'), 1, 'of the ERP’s deliveries, only the catalogue’s')
  check([await count('sales_orders'), await count('sales_order_lines')], [0, 0], 'no bill opens to the key')
  await q(`INSERT INTO public.catalogue_skus VALUES ('E2', 3000, NULL)`)
  check(await count('catalogue_skus'), 2, 'he prices a SKU')
  check(Number(await one(`WITH u AS (UPDATE public.comm_schemes SET enable_kpi = true RETURNING 1) SELECT count(*) FROM u`)), 0, 'a scheme does not open for writing')
  check((await q('SELECT item_code, in_sku_master, has_price FROM public.revenue_costing_gaps($1, $2)', ['2026-10-01', '2026-11-01']))
    .map(r => [r.item_code, r.in_sku_master, r.has_price]), [['AK-KING', true, true]], 'the costing gaps read every bill for him, the bills themselves still shut')
  check(await one(`SELECT public.catalogue_save_cost_setting($1, 0.65, '[{"erp_product_id":"E1","ratio":0.6}]'::jsonb, NULL)`, [SCHEME]), 2, 'he saves the cost setting')
  await asOwner()
  check([Number(await one('SELECT revenue_cost_divisor FROM public.comm_schemes')), await one('SELECT enable_kpi FROM public.comm_schemes'),
    await one('SELECT updated_by FROM public.comm_cost_ratios')], [0.65, false, PETER], 'only the ratio moved, saved as his')
  await as(PETER)
  check(await one(`SELECT public.catalogue_remove_combos('[{"base_model":"SOFA-A","slots_key":"3+2"}]'::jsonb)`), 1, 'he removes a combo')

  // ── View only: reads, never writes ──────────────────────────────────────────────────────────────────────────
  await as(VIEWER)
  check(await count('catalogue_skus'), 2, 'View alone reads the catalogue')
  await reject(`INSERT INTO public.catalogue_models VALUES ('M2', true)`, [], /row-level security/, 'and writes none of it')
  await reject(`SELECT public.catalogue_save_cost_setting($1, 0.5, NULL, NULL)`, [SCHEME], /needs Product List · Edit/, 'nor the cost setting')
  await reject(`SELECT public.catalogue_remove_combos('[{"base_model":"SOFA-A","slots_key":"3+2"}]'::jsonb)`, [], /needs Product List · Edit/, 'nor a combo')

  // ── The Revenue Team: nothing ───────────────────────────────────────────────────────────────────────────────
  await as(MEMBER)
  check(await one(`SELECT public.has_perm('product_list')`), false, 'a member without the tick holds no key')
  check([await count('catalogue_skus'), await count('comm_schemes'), await count('erp_sync_events')], [0, 0, 0], 'and reads nothing of it')
  await reject('SELECT * FROM public.revenue_costing_gaps($1, $2)', ['2026-10-01', '2026-11-01'], /needs Product List · View/, 'the costing gaps refuse them')
  await reject(`SELECT public.catalogue_save_cost_setting($1, 0.5, NULL, NULL)`, [SCHEME], /needs Product List · Edit/, 'the cost setting too')

  // ── A staff template ticked on it opens it too — the gate is gone ───────────────────────────────────────────
  await as(OFFICE)
  check([await one(`SELECT public.has_perm('product_list')`), await one(`SELECT public.has_scope(ARRAY['admin'])`), await count('catalogue_skus')],
    [true, false, 2], 'a staff template ticked on Product List reads it, still outside the admin domain')

  // ── The Principal's own: everything, as before ─────────────────────────────────────────────────────────────
  for (const [who, label] of [[CEO, 'a full-access template'], [SHARED, 'principal@']]) {
    await as(who)
    check([await one(`SELECT public.has_perm('product_list')`), await one(`SELECT public.has_scope(ARRAY['admin'])`), await count('access_log'),
      await count('erp_sync_events'), await count('sales_order_lines')], [true, true, 2, 3, 1], `${label} keeps the admin domain and every row`)
  }
  await asOwner()

  console.log(`PASS: ${checks} Product List access checks (20261014100000 verbatim, twice, over production’s bodies). No live I/O.`)
} finally {
  await db.close()
}
