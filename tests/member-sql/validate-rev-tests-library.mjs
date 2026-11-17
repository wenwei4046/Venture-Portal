// Local PostgreSQL regression for 20261117010000 (2026-11-16 — the Revenue app's Free test and Library for IR; the
// owner's answers: the Principal and the Revenue Director write them, IR only, a test taken again, every question type,
// the Library's PDF / pictures / Word / links in categories, "New" until opened, scores kept — one's own to oneself,
// everybody's to the writers). The R2 move's table (20261023150000) runs, then this migration, twice. Under test: the
// permission rows and who holds them, current_permissions' member-app list, the tabs' cells; the bucket and its three
// policies; who reads (an IR member with the box open, a writer) and who is refused (Fair, a closed box, nobody); a test
// handed out without its answers, scored on the server, kept for a member, every question type; the writers' save,
// publish, delete and results; the Library's categories, files and links, New until opened. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
async function peek(sql, params = []) {
  const [{ cu, su }] = await q('SELECT current_user AS cu, session_user AS su')
  await db.exec('RESET ROLE')
  try {
    return await q(sql, params)
  } finally {
    if (cu !== su) await db.exec(`SET ROLE ${cu}`)
  }
}
const peek1 = async (sql, params = []) => Object.values((await peek(sql, params))[0])[0]
let checks = 0
const check = (actual, expected, what) => { assert.deepEqual(actual, expected, what); checks++ }
const refuses = async (sql, params, pattern, what) => {
  await assert.rejects(q(sql, params), err => pattern.test(String(err.message)), what)
  checks++
}
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`

const WRITER = ['rev_training.view', 'rev_training.create', 'rev_training.edit']
const U = { ann: id(1), ben: id(2), kris: id(3), peter: id(4), boss: id(5), nobody: id(6) }
const S = { ann: id(11), ben: id(12), kris: id(13), peter: id(14) }
const IR = id(21)
const FAIR = id(22)

/** Sign in as `user`, holding `actions`, with these Profile boxes closed. */
async function as(user, actions = [], closed = []) {
  await db.exec('RESET ROLE')
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false), set_config('test.actions', $2, false),
                  set_config('test.closed', $3, false)`, [user ?? '', actions.join(','), closed.join(',')])
  await db.exec('SET ROLE authenticated')
}

await db.exec(`
  CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT 'authenticated' $$;
  CREATE SCHEMA storage;
  CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS
    $$ SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  GRANT USAGE ON SCHEMA auth, storage, public TO authenticated, anon, service_role;

  CREATE FUNCTION public.has_any_action(p_wants text[]) RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT EXISTS (SELECT 1 FROM unnest(p_wants) w WHERE w = ANY (string_to_array(current_setting('test.actions', true), ',')))
  $$;
  CREATE FUNCTION public.tab_box_closed(p_tab text, p_action text) RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT (p_tab || '.' || p_action) = ANY (string_to_array(current_setting('test.closed', true), ','))
  $$;
  -- The other buckets' policy helpers (20261023150000 carries every storage.objects policy): none is under test here.
  CREATE FUNCTION public.test_flag(p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.has_scope(p_scopes text[]) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.has_perm(p_key text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
  CREATE FUNCTION public.member_is_manager(p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.member_is_revenue_account() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.crm_me() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
  CREATE FUNCTION public.crm_can_reply(p uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.crm_my_can() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb $$;
  CREATE FUNCTION public.guest_link_may_upload(p_code text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.hiring_file_in_use(p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.hr_doc_file_unused(p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.hr_doc_readable_by_hr(p text, p_owner text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.hr_file_readable_by_member(p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.it_request_object_readable(p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.it_request_object_removable(p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.member_form_template_unused(p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE TYPE public.payment_voucher_status AS ENUM ('draft', 'pending_approval', 'approved', 'paid');
  CREATE TABLE public.payment_vouchers (id uuid PRIMARY KEY, status public.payment_voucher_status NOT NULL);
  CREATE TABLE public.payment_attachments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), storage_path text NOT NULL);
  CREATE TABLE public.crm_contacts (id uuid PRIMARY KEY);
  CREATE TABLE public.member_requests (id uuid PRIMARY KEY, created_by uuid, status text, kind text);
  CREATE TABLE public.member_request_attachments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid, object_path text);
  GRANT SELECT ON public.payment_vouchers, public.payment_attachments, public.crm_contacts, public.member_requests,
    public.member_request_attachments TO authenticated, anon;

  CREATE TABLE public.audit_registered(t text PRIMARY KEY, reads text[]);
  CREATE FUNCTION public.audit_register(p_table text, p_label text, p_area text, p_read text[], p_mode text DEFAULT 'all',
    p_keys text[] DEFAULT '{}', p_labels text[] DEFAULT '{}', p_ignore text[] DEFAULT '{}', p_omit text[] DEFAULT '{}',
    p_diff boolean DEFAULT false, p_salary text[] DEFAULT '{}', p_nric text[] DEFAULT '{}', p_bank text[] DEFAULT '{}',
    p_needs text DEFAULT NULL, p_actor_column text DEFAULT NULL, p_reason text DEFAULT NULL) RETURNS void LANGUAGE sql AS $$
    INSERT INTO public.audit_registered VALUES (p_table, p_read) ON CONFLICT (t) DO UPDATE SET reads = excluded.reads
  $$;

  -- The permission catalog, as production's keys have it.
  CREATE TABLE public.permission_functions (key text PRIMARY KEY, label text, section text, actions text[], scopes text[],
    description text, sort_order int);
  CREATE TABLE public.permission_defs (key text PRIMARY KEY, label text, section text, scope text, description text, sort_order int);
  CREATE TABLE public.permission_cell_keys (function_key text, action text, legacy_key text, min_scope text, gate text,
    PRIMARY KEY (function_key, action, legacy_key));
  CREATE TABLE public.permission_key_actions (legacy_key text, function_key text, action text, PRIMARY KEY (legacy_key, function_key, action));
  CREATE TABLE public.role_default_permissions (role text, permission_key text, PRIMARY KEY (role, permission_key));
  CREATE TABLE public.permission_templates (id uuid PRIMARY KEY, key text UNIQUE, version int NOT NULL DEFAULT 1, updated_at timestamptz);
  CREATE TABLE public.permission_template_grants (template_id uuid, function_key text, action text, scope text,
    PRIMARY KEY (template_id, function_key, action));
  CREATE TABLE public.permission_template_tabs (template_id uuid, tab_id text, action text, PRIMARY KEY (template_id, tab_id, action));
  CREATE TABLE public.permission_tab_cells (tab_id text, action text, cell text, PRIMARY KEY (tab_id, action, cell));
  INSERT INTO public.permission_templates (id, key) VALUES
    ('${id(31)}', 'revenue_director'), ('${id(32)}', 'ultimate'), ('${id(33)}', 'revenue_team'), ('${id(34)}', 'staff');
  -- Revenue Team ticks Profile · Documentation; Ultimate stores ticks (another tab); the Director and Staff · Basic none.
  INSERT INTO public.permission_template_tabs VALUES ('${id(33)}', 'rev.documentation', 'view'), ('${id(32)}', 'hr.people', 'view');
  INSERT INTO public.permission_tab_cells VALUES ('rev.documentation', 'view', 'revenue_app.view');
  -- current_permissions: only the member-app list matters here.
  CREATE FUNCTION public.current_permissions() RETURNS text[] LANGUAGE plpgsql STABLE AS $f$
  BEGIN
    RETURN ARRAY(SELECT key FROM unnest(ARRAY['member_portal','x']) key WHERE key IS NOT NULL
      OR key=ANY(ARRAY['member_portal','member_quote','member_requests','member_memos','member_insight','member_crm','crm_manage','product_list','it_requests']));
  END
  $f$;

  CREATE TABLE public.users (id uuid PRIMARY KEY, name text, email text);
  CREATE TABLE public.hr_staff_costs (id uuid PRIMARY KEY, employee_name text NOT NULL, user_id uuid, status text NOT NULL DEFAULT 'active');
  CREATE TABLE public.comm_sub_departments (id uuid PRIMARY KEY, name text NOT NULL, is_active boolean NOT NULL DEFAULT true);
  CREATE TABLE public.memberships (staff_id uuid, sub_department_id uuid);
  CREATE FUNCTION public.member_has_membership(p_staff uuid, p_sub uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT EXISTS (SELECT 1 FROM public.memberships m WHERE m.staff_id = p_staff AND m.sub_department_id = p_sub)
  $$;
  CREATE FUNCTION public.member_staff_id() RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
  DECLARE v uuid;
  BEGIN
    SELECT s.id INTO v FROM public.hr_staff_costs s WHERE s.user_id = auth.uid() AND s.status = 'active';
    IF v IS NULL THEN RAISE EXCEPTION 'No active Revenue staff record is linked to this account' USING ERRCODE = '42501'; END IF;
    RETURN v;
  END $$;

  INSERT INTO public.users (id, name, email) VALUES
    ('${U.ann}', 'Ann', 'ann@x.my'), ('${U.ben}', 'Ben', 'ben@x.my'), ('${U.kris}', 'Kris', 'kris@x.my'),
    ('${U.peter}', 'Peter', 'peter@x.my'), ('${U.boss}', 'Principal', 'principal@x.my'), ('${U.nobody}', 'Nobody', 'n@x.my');
  INSERT INTO public.hr_staff_costs (id, employee_name, user_id) VALUES
    ('${S.ann}', 'ANN LIM', '${U.ann}'), ('${S.ben}', 'BEN TAN', '${U.ben}'), ('${S.kris}', 'KRIS WONG', '${U.kris}'),
    ('${S.peter}', 'PETER NG', '${U.peter}');
  INSERT INTO public.comm_sub_departments (id, name) VALUES ('${FAIR}', 'Fair'), ('${IR}', 'IR');
  -- Ann and Ben sell for IR, Kris for Fair; Peter (the Revenue Director) for both.
  INSERT INTO public.memberships VALUES ('${S.ann}', '${IR}'), ('${S.ben}', '${IR}'), ('${S.kris}', '${FAIR}'),
    ('${S.peter}', '${IR}'), ('${S.peter}', '${FAIR}');
`)

await db.exec((await readFile(new URL('20261023150000_file_storage_r2.sql', migrations), 'utf8')).replace(/\r\n/g, '\n'))
const mig = (await readFile(new URL('20261117010000_rev_tests_library.sql', migrations), 'utf8')).replace(/\r\n/g, '\n')
await db.exec(mig)
await db.exec(mig) // twice: nothing changes, nothing breaks

// ── The permission, who holds it, the tabs ──────────────────────────────────────
check(await peek(`SELECT key, section, actions, scopes FROM public.permission_functions`),
  [{ key: 'rev_training', section: 'People', actions: ['view', 'create', 'edit'], scopes: ['all'] }], 'the function, three actions, reach all')
check(await peek(`SELECT key, scope FROM public.permission_defs`), [{ key: 'rev_training', scope: 'none' }], 'its key opens no row policy')
check(await peek1(`SELECT count(*)::int FROM public.permission_key_actions WHERE legacy_key = 'rev_training'`), 3, 'the key gives its three actions')
check(await peek(`SELECT role FROM public.role_default_permissions`), [{ role: 'principal' }], 'the Principal login holds it')
check((await peek(`SELECT t.key, g.action FROM public.permission_template_grants g JOIN public.permission_templates t ON t.id = g.template_id
  ORDER BY 1, 2`)).map(r => `${r.key}:${r.action}`),
  ['revenue_director:create', 'revenue_director:edit', 'revenue_director:view', 'ultimate:create', 'ultimate:edit', 'ultimate:view'],
  'the Revenue Director and Ultimate full access write them — nobody else')
check((await peek(`SELECT t.key, x.tab_id, x.action FROM public.permission_template_tabs x JOIN public.permission_templates t ON t.id = x.template_id
  WHERE x.tab_id LIKE 'rev.t%' OR x.tab_id = 'rev.library' ORDER BY 1, 2, 3`)).map(r => `${r.key}:${r.tab_id}.${r.action}`),
  ['revenue_team:rev.library.view', 'revenue_team:rev.tests.view',
   'ultimate:rev.training.create', 'ultimate:rev.training.edit', 'ultimate:rev.training.view'],
  'a template that stores ticks: Revenue Team (Documentation ticked) gets Free test and Library; Ultimate the writers\' tab; the Director stores none')
check(await peek1(`SELECT version FROM public.permission_templates WHERE key = 'revenue_team'`) > 1, true, 'an editor left open saves over nothing')
check((await peek(`SELECT tab_id || '.' || action || '=' || cell AS c FROM public.permission_tab_cells WHERE tab_id <> 'rev.documentation' ORDER BY 1`)).map(r => r.c),
  ['rev.library.view=revenue_app.view', 'rev.tests.view=revenue_app.view', 'rev.training.create=rev_training.create',
   'rev.training.edit=rev_training.edit', 'rev.training.view=rev_training.view'], 'the boxes\' cells in the registry')
check(await peek1(`SELECT strpos(prosrc, $$'it_requests','rev_training'])$$) > 0 FROM pg_proc WHERE proname = 'current_permissions'`), true,
  'a Revenue app account may hold the key')
check((await peek(`SELECT t FROM public.audit_registered WHERE t LIKE 'rev_%' ORDER BY t`)).map(r => r.t),
  ['rev_lib_categories', 'rev_lib_items', 'rev_lib_seen', 'rev_test_attempts', 'rev_test_questions', 'rev_tests'], 'every new table audited')
check(await peek(`SELECT public, (file_size_limit / 1048576)::int AS mb, allowed_mime_types, backend FROM public.file_buckets WHERE id = 'rev-library'`),
  [{ public: false, mb: 2048, allowed_mime_types: null, backend: 'r2' }], 'the bucket: private, R2, 2 GB, any type')
check(await peek1(`SELECT count(*)::int FROM pg_policies WHERE tablename = 'file_objects' AND policyname LIKE 'rev_library_%'`), 3, 'its three policies')
for (const fn of ['rev_tests_mine()', 'rev_test_take(uuid)', 'rev_test_submit(uuid,jsonb)', 'rev_test_save(jsonb)', 'rev_library()',
  'rev_lib_item_add(uuid,text,text,text,text,text)']) {
  check([await one(`SELECT has_function_privilege('anon', 'public.${fn}', 'EXECUTE')`), await one(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE')`)],
    [false, true], `${fn}: a sign-in's, never the publishable key's`)
}
for (const fn of ['rev_training_reader(text)', 'rev_training_need(text)', 'rev_training_staff()'])
  check(await one(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE')`), false, `${fn} is nobody's to call`)
check(await peek(`SELECT name FROM public.rev_lib_categories ORDER BY sort_order`).then(r => r.map(x => x.name)),
  ['Product knowledge', 'Sales skills', 'Company rules'], 'three categories to start with')

// ── Writing a test ──────────────────────────────────────────────────────────────
const TEST = {
  title: '  Mattress basics  ', intro: 'Ten minutes.', published: false,
  questions: [
    { kind: 'single', prompt: 'Which layer is latex?', choices: ['Top', 'Base', 'Cover'], correct: [0], explain: 'The comfort layer.' },
    { kind: 'multiple', prompt: 'Which are pocket springs?', choices: ['A', 'B', 'C', 'D'], correct: [3, 1] },
    { kind: 'truefalse', prompt: 'A deposit is refundable.', choices: ['ignored'], correct: [1] },
  ],
}
await as(U.ann)
await refuses(`SELECT public.rev_test_save($1)`, [JSON.stringify(TEST)], /Create is not ticked/, 'a seller writes no test')
await as(U.peter, ['rev_training.view', 'rev_training.edit'])
await refuses(`SELECT public.rev_test_save($1)`, [JSON.stringify(TEST)], /Create is not ticked/, 'a new test is Create\'s')
await as(U.peter, WRITER)
const bad = (patch, pattern, what) => refuses(`SELECT public.rev_test_save($1)`, [JSON.stringify({ ...TEST, ...patch })], pattern, what)
await bad({ title: ' ' }, /Give the test a title/, 'a title')
await bad({ questions: [] }, /at least one question/, 'a question')
await bad({ questions: [{ kind: 'single', prompt: 'Q', choices: ['A', 'B'], correct: [] }] }, /Question 1: mark the right answer/, 'a right answer')
await bad({ questions: [{ kind: 'single', prompt: 'Q', choices: ['A', 'B'], correct: [0, 1] }] }, /only one answer can be right/, 'one answer for single')
await bad({ questions: [{ kind: 'single', prompt: 'Q', choices: ['A', ''], correct: [0] }] }, /fill in every answer/, 'no empty answer')
await bad({ questions: [{ kind: 'single', prompt: 'Q', choices: ['A'], correct: [0] }] }, /2 to 8 answers/, 'two answers at least')
await bad({ questions: [{ kind: 'essay', prompt: 'Q', choices: ['A', 'B'], correct: [0] }] }, /pick its type/, 'a known type')
const T1 = await one(`SELECT public.rev_test_save($1)`, [JSON.stringify(TEST)])
check(await peek(`SELECT title, published, by_name FROM public.rev_tests WHERE id = $1`, [T1]),
  [{ title: 'Mattress basics', published: false, by_name: 'PETER NG' }], 'saved tidied, a draft, by its writer')
check((await peek(`SELECT kind, choices, correct FROM public.rev_test_questions WHERE test_id = $1 ORDER BY position`, [T1]))
  .map(r => `${r.kind}:${r.choices.join('/')}:${r.correct.join(',')}`),
  ['single:Top/Base/Cover:0', 'multiple:A/B/C/D:1,3', 'truefalse:True/False:1'], 'every type; true / false\'s answers its own; right answers in order')

// ── Who reads ───────────────────────────────────────────────────────────────────
await as(U.ann)
check(await one(`SELECT jsonb_array_length(public.rev_tests_mine())`), 0, 'a draft is not handed out')
await as(U.peter, WRITER)
await q(`SELECT public.rev_test_publish($1, true)`, [T1])
await as(U.ann)
const mine = await one(`SELECT public.rev_tests_mine()`)
check(mine.map(t => [t.title, t.questions, t.attempts, t.best]), [['Mattress basics', 3, 0, null]], 'published: IR\'s to take')
await as(U.kris)
await refuses(`SELECT public.rev_tests_mine()`, [], /Free test is for IR's team/, 'Fair\'s seller: not theirs (the owner: 只给IR)')
await refuses(`SELECT public.rev_library()`, [], /The Library is for IR's team/, '…nor the Library')
await as(U.nobody)
await refuses(`SELECT public.rev_tests_mine()`, [], /for IR's team/, 'a login with no staff record')
await as(U.ann, [], ['rev.tests.view'])
await refuses(`SELECT public.rev_tests_mine()`, [], /Free test is not open to your account/, 'an unticked Profile · Free test')
check(await one(`SELECT jsonb_typeof(public.rev_library())`), 'array', '…leaves the Library open')
await as(U.boss, WRITER)
check(await one(`SELECT jsonb_array_length(public.rev_tests_mine())`), 1, 'the Principal (no staff record) sees it as IR does')

// ── Taking it ───────────────────────────────────────────────────────────────────
await as(U.ann)
const taken = await one(`SELECT public.rev_test_take($1)`, [T1])
check(taken.questions.map(x => Object.keys(x).sort().join(',')), Array(3).fill('choices,id,kind,points,prompt'), 'handed out without its answers (its points shown)')
check(taken.questions[2].choices, ['True', 'False'], 'true / false')
const [q1, q2, q3] = taken.questions.map(x => x.id)
const r1 = await one(`SELECT public.rev_test_submit($1, $2)`, [T1, JSON.stringify({ [q1]: [0], [q2]: [1], [q3]: [9, 1, 'x'] })])
check([r1.score, r1.total, r1.saved], [2, 3, true], 'several answers need every right one; a choice out of range is dropped')
check(r1.review.map(x => [x.right, x.correct]), [[true, [0]], [false, [1, 3]], [true, [1]]], 'then what was right, question by question')
check(r1.review[0].explain, 'The comfort layer.', 'and why')
const r2 = await one(`SELECT public.rev_test_submit($1, $2)`, [T1, JSON.stringify({ [q1]: [0], [q2]: [3, 1], [q3]: [1] })])
check(r2.score, 3, 'taken again (the owner: 可以重做)')
const r3 = await one(`SELECT public.rev_test_submit($1, $2)`, [T1, JSON.stringify({})])
check([r3.score, r3.total], [0, 3], 'nothing answered scores nothing')
check((await one(`SELECT public.rev_tests_mine()`)).map(t => [t.attempts, t.best, t.last, t.lastTotal]), [[3, 3, 0, 3]],
  'their own: three tries, best 3, last 0 of 3')
await refuses(`SELECT public.rev_test_submit($1, '[1]')`, [T1], /Answer the questions first/, 'answers are by question')
await as(U.ben)
check((await one(`SELECT public.rev_tests_mine()`)).map(t => t.attempts), [0], 'never somebody else\'s scores')
await refuses(`SELECT public.rev_test_results($1)`, [T1], /View is not ticked/, 'everybody\'s scores are the writers\'')
await as(U.boss, WRITER)
const rb = await one(`SELECT public.rev_test_submit($1, $2)`, [T1, JSON.stringify({ [q1]: [0] })])
check([rb.score, rb.saved], [1, false], 'the Principal tries it — scored, not kept (no staff record)')
check(await peek1(`SELECT count(*)::int FROM public.rev_test_attempts`), 3, 'only Ann\'s three are kept')

// ── Results ────────────────────────────────────────────────────────────────────
const res = await one(`SELECT public.rev_test_results($1)`, [T1])
check(res.map(r => [r.name, r.attempts, r.best, r.last]),
  [['ANN LIM', 3, 3, 0], ['BEN TAN', 0, null, null], ['PETER NG', 0, null, null]],
  'every member of IR today — who took it first, the rest Not taken; Fair\'s Kris not listed')
const admin = await one(`SELECT public.rev_tests_admin()`)
check(admin.map(t => [t.title, t.people, t.attempts, t.published]), [['Mattress basics', 1, 3, true]], 'the writers\' list')
check((await one(`SELECT public.rev_test_admin($1)`, [T1])).questions[1].correct, [1, 3], 'the editor reads the answers')

// ── Editing, taking down, deleting ─────────────────────────────────────────────
await as(U.peter, ['rev_training.view', 'rev_training.create'])
await refuses(`SELECT public.rev_test_save($1)`, [JSON.stringify({ ...TEST, id: T1 })], /Edit is not ticked/, 'changing one is Edit\'s')
await refuses(`SELECT public.rev_test_publish($1, false)`, [T1], /Edit is not ticked/, 'so is taking it down')
await as(U.peter, WRITER)
await q(`SELECT public.rev_test_save($1)`, [JSON.stringify({ ...TEST, id: T1, title: 'Mattress basics II', published: true,
  questions: TEST.questions.slice(0, 1) })])
check(await peek1(`SELECT count(*)::int FROM public.rev_test_questions WHERE test_id = $1`, [T1]), 1, 'questions written again from the list')
check(await peek1(`SELECT count(*)::int FROM public.rev_test_attempts WHERE test_id = $1`, [T1]), 3, 'old scores stay')
await q(`SELECT public.rev_test_delete($1)`, [T1])
await as(U.ann)
check(await one(`SELECT jsonb_array_length(public.rev_tests_mine())`), 0, 'deleted: out of the app')
await refuses(`SELECT public.rev_test_take($1)`, [T1], /not open any more/, 'and not to be taken')

// ── Library: categories ─────────────────────────────────────────────────────────
await as(U.peter, WRITER)
const CAT = await one(`SELECT public.rev_lib_category_save(NULL, '  Objection handling ')`)
await refuses(`SELECT public.rev_lib_category_save(NULL, 'objection HANDLING')`, [], /already/, 'never twice, whatever the case')
await refuses(`SELECT public.rev_lib_category_save(NULL, ' ')`, [], /Name the category/, 'a name')
await as(U.ann)
await refuses(`SELECT public.rev_lib_category_save(NULL, 'Mine')`, [], /Create is not ticked/, 'a seller makes none')

// ── Library: files and links ────────────────────────────────────────────────────
const P1 = `library/${id(901)}/price-list.pdf`
const put = (name, size = 2048, type = 'application/pdf') =>
  q(`INSERT INTO public.file_objects (bucket_id, name, metadata) VALUES ('rev-library', $1, $2)`, [name, JSON.stringify({ size, mimetype: type })])
await as(U.ann)
await refuses(`INSERT INTO public.file_objects (bucket_id, name, metadata) VALUES ('rev-library', $1, '{"size":1,"mimetype":"application/pdf"}')`,
  [`library/${id(902)}/x.pdf`], /row-level security/, 'a seller puts no file in the bucket')
await as(U.peter, WRITER)
await refuses(`INSERT INTO public.file_objects (bucket_id, name, metadata) VALUES ('rev-library', 'elsewhere/x.pdf', '{"size":1,"mimetype":"application/pdf"}')`,
  [], /row-level security/, 'only under library/')
await put(P1)
await refuses(`SELECT public.rev_lib_item_add($1, 'Price list', 'file', $2, NULL, NULL)`, [CAT, `library/${id(903)}/never.pdf`],
  /did not arrive/, 'a file whose bytes never came')
const F1 = await one(`SELECT public.rev_lib_item_add($1, ' Price list ', 'file', $2, NULL, 'November')`, [CAT, P1])
await refuses(`SELECT public.rev_lib_item_add($1, 'Video', 'link', NULL, 'javascript:alert(1)', NULL)`, [CAT], /full link/, 'a link is an address')
const L1 = await one(`SELECT public.rev_lib_item_add($1, 'Showroom tour', 'link', NULL, 'https://youtu.be/abc', NULL)`, [CAT])
check(await peek(`SELECT title, kind, file_name, mime, size::int, by_name FROM public.rev_lib_items WHERE id = $1`, [F1]),
  [{ title: 'Price list', kind: 'file', file_name: 'price-list.pdf', mime: 'application/pdf', size: 2048, by_name: 'PETER NG' }],
  'the file: its name, type and size from the bucket\'s row')

await as(U.ann)
const lib = await one(`SELECT public.rev_library()`)
const cat = lib.find(c => c.id === CAT)
check(cat.items.map(i => [i.title, i.kind, i.seen]), [['Showroom tour', 'link', false], ['Price list', 'file', false]], 'newest first, both New')
check(await one(`SELECT count(*)::int FROM public.file_objects WHERE name = $1`, [P1]), 1, 'the member may read the file it names')
check(await one(`SELECT public.rev_library_open($1)`, [L1]), { kind: 'link', path: null, url: 'https://youtu.be/abc', fileName: null }, 'opened: where it is')
check((await one(`SELECT public.rev_library()`)).find(c => c.id === CAT).items.map(i => i.seen), [true, false], 'no longer New for them')
await as(U.ben)
check((await one(`SELECT public.rev_library()`)).find(c => c.id === CAT).items.map(i => i.seen), [false, false], '…still New for Ben')
await as(U.kris)
check(await one(`SELECT count(*)::int FROM public.file_objects WHERE name = $1`, [P1]), 0, 'Fair\'s seller cannot read the file')
await as(U.ann, [], ['rev.library.view'])
check(await one(`SELECT count(*)::int FROM public.file_objects WHERE name = $1`, [P1]), 0, 'nor one whose Library box is closed')

// ── Library: change, delete ─────────────────────────────────────────────────────
await as(U.peter, WRITER)
const OTHER = await peek1(`SELECT id FROM public.rev_lib_categories WHERE name = 'Sales skills'`)
await q(`SELECT public.rev_lib_item_edit($1, $2, 'Tour of KL showroom', 'https://youtu.be/xyz', 'New one')`, [L1, OTHER])
check(await peek(`SELECT category_id = $2 AS moved, title, url FROM public.rev_lib_items WHERE id = $1`, [L1, OTHER]),
  [{ moved: true, title: 'Tour of KL showroom', url: 'https://youtu.be/xyz' }], 'moved, renamed, a new address')
await refuses(`SELECT public.rev_lib_category_delete($1)`, [OTHER], /Move or delete what is in this category first/, 'a category with something in it stays')
await as(U.ann)
await refuses(`SELECT public.rev_lib_item_delete($1)`, [F1], /Edit is not ticked/, 'a seller deletes nothing')
await as(U.peter, WRITER)
await q(`SELECT public.rev_lib_item_delete($1)`, [F1])
check(await peek1(`SELECT count(*)::int FROM public.file_objects WHERE name = $1`, [P1]), 0, 'deleted: the bytes\' row with it (R2\'s sweep takes the bytes)')
await as(U.ann)
check((await one(`SELECT public.rev_library()`)).find(c => c.id === CAT).items, [], 'out of the app')
await refuses(`SELECT public.rev_library_open($1)`, [F1], /not in the Library any more/, 'and not to be opened')
await as(U.peter, WRITER)
const EMPTY = await one(`SELECT public.rev_lib_category_save(NULL, 'Spare')`)
await q(`SELECT public.rev_lib_category_delete($1)`, [EMPTY])
check(await peek1(`SELECT count(*)::int FROM public.rev_lib_categories WHERE id = $1`, [EMPTY]), 0, 'an empty category goes')

// ── Points and written answers (2026-11-17 — the owner: "每题设不同分数；简答题／段落题（人工改）需要") ──
await as(U.peter, WRITER)
await refuses(`SELECT public.rev_test_save($1)`, [JSON.stringify({ title: 'Bad', questions: [{ kind: 'single', prompt: 'Q', choices: ['A', 'B'], correct: [0], points: 0 }] })],
  /give it 1 to 100 points/, 'a question is worth 1 to 100 points')
const T2 = await one(`SELECT public.rev_test_save($1)`, [JSON.stringify({ title: 'Selling a mattress', published: true, questions: [
  { kind: 'single', prompt: 'Queen is how wide?', choices: ['150 cm', '180 cm'], correct: [0], points: 2 },
  { kind: 'short', prompt: 'Name our latex brand.', points: 3, choices: ['ignored'], correct: [0] },
  { kind: 'paragraph', prompt: 'How do you answer "too expensive"?', points: 5, explain: 'Value, warranty, instalments.' },
  { kind: 'short', prompt: 'Your favourite model?', points: 1 },
] })])
check((await peek(`SELECT kind, points, cardinality(choices) AS c, cardinality(correct) AS r FROM public.rev_test_questions WHERE test_id = $1 ORDER BY position`, [T2]))
  .map(r => `${r.kind}:${r.points}:${r.c}:${r.r}`), ['single:2:2:1', 'short:3:0:0', 'paragraph:5:0:0', 'short:1:0:0'],
  'every question its own points; a written one keeps no choices and no right answer')
await as(U.ann)
const t2 = await one(`SELECT public.rev_test_take($1)`, [T2])
check(t2.questions.map(q => [q.kind, q.points]), [['single', 2], ['short', 3], ['paragraph', 5], ['short', 1]], 'handed out with each question\'s points')
const [w1, w2, w3, w4] = t2.questions.map(q => q.id)
const long = 'x'.repeat(400)
const r4 = await one(`SELECT public.rev_test_submit($1, $2)`, [T2, JSON.stringify({ [w1]: [0], [w2]: `  ${long}  `, [w3]: 'Show the value.', [w4]: [1] })])
check([r4.score, r4.total, r4.pending, r4.saved], [2, 11, true, true], 'the choice question\'s 2 of 11; the written ones wait')
check(r4.review.map(r => [r.kind, r.awarded, r.pending]), [['single', 2, false], ['short', null, true], ['paragraph', null, true], ['short', 0, false]],
  'a written answer waits for its mark; a blank one (or a choice sent to it) is 0')
const A4 = r4.attemptId
check((await peek(`SELECT answers ->> $2 AS a FROM public.rev_test_attempts WHERE id = $1`, [A4, w2]))[0].a.length, 300, 'a short answer is kept to 300 characters')
const mine2 = (await one(`SELECT public.rev_tests_mine()`)).find(t => t.id === T2)
check([mine2.points, mine2.written, mine2.best, mine2.last, mine2.lastPending, mine2.lastId === A4], [11, true, null, 2, true, true],
  'their list: 11 points, written answers in it, no best while it waits, the last waiting')
check((await one(`SELECT public.rev_test_attempt($1)`, [A4])).pending, true, 'they read their own attempt')
await refuses(`SELECT public.rev_test_mark($1, '{}')`, [A4], /Edit is not ticked/, 'a seller marks nothing')
await as(U.ben)
await refuses(`SELECT public.rev_test_attempt($1)`, [A4], /somebody else's/, 'nor reads somebody else\'s attempt')

// A writer changes the test before marking: the attempt keeps the test as it was taken.
await as(U.peter, WRITER)
await q(`SELECT public.rev_test_save($1)`, [JSON.stringify({ id: T2, title: 'Selling a mattress', published: true, questions: [
  { kind: 'single', prompt: 'Changed', choices: ['A', 'B'], correct: [1], points: 1 }] })])
const toMark = await one(`SELECT public.rev_tests_to_mark()`)
check(toMark.map(m => [m.title, m.name, m.score, m.total]), [['Selling a mattress', 'ANN LIM', 2, 11]], 'what waits for marking')
check((await one(`SELECT public.rev_tests_admin()`)).find(t => t.id === T2).toMark, 1, 'the writers\' list counts it')
const seen = await one(`SELECT public.rev_test_attempt($1)`, [A4])
check(seen.questions.map(x => x.prompt), ['Queen is how wide?', 'Name our latex brand.', 'How do you answer "too expensive"?', 'Your favourite model?'],
  'the attempt as it was taken, though the test changed')
check(seen.questions.every(x => !('correct' in x)), true, '…its questions without their answers (the review carries them)')
await as(U.peter, ['rev_training.view'])
await refuses(`SELECT public.rev_test_mark($1, '{}')`, [A4], /Edit is not ticked/, 'marking is Edit\'s')
await as(U.peter, WRITER)
await refuses(`SELECT public.rev_test_mark($1, $2)`, [A4, JSON.stringify({ [w2]: { points: 3 } })], /Give every written answer its points/, 'every written answer at once')
await refuses(`SELECT public.rev_test_mark($1, $2)`, [A4, JSON.stringify({ [w2]: { points: 3 }, [w3]: { comment: 'no points' } })], /Give every written answer its points/, 'a mark is its points')
await refuses(`SELECT public.rev_test_mark($1, $2)`, [A4, JSON.stringify({ [w2]: { points: 4 }, [w3]: { points: 2 } })], /at most its question's 3 points/, 'never past the question\'s points')
const marked = await one(`SELECT public.rev_test_mark($1, $2)`, [A4, JSON.stringify({ [w2]: { points: 3 }, [w3]: { points: 2, comment: ' Say the warranty too. ' } })])
check([marked.score, marked.total, marked.pending, marked.markedByName], [7, 11, false, 'PETER NG'], 'marked: 2 + 3 + 2 of 11, by its writer')
check(marked.review.map(r => [r.awarded, r.comment ?? '']), [[2, ''], [3, ''], [2, 'Say the warranty too.'], [0, '']], 'each written answer\'s points and comment')
check(await one(`SELECT jsonb_array_length(public.rev_tests_to_mark())`), 0, 'nothing waits now')
await as(U.ann)
const mine3 = (await one(`SELECT public.rev_tests_mine()`)).find(t => t.id === T2)
check([mine3.best, mine3.bestTotal, mine3.last, mine3.lastPending], [7, 11, 7, false], 'their best is the marked score')
await as(U.peter, WRITER)
const again = await one(`SELECT public.rev_test_mark($1, $2)`, [A4, JSON.stringify({ [w2]: { points: 1 }, [w3]: { points: 5 } })])
check(again.score, 8, 'marked again: the marks replaced')
const res2 = (await one(`SELECT public.rev_test_results($1)`, [T2])).find(r => r.name === 'ANN LIM')
check([res2.best, res2.last, res2.lastPending], [8, 8, false], 'the writers\' scores follow the marks')
check(await one(`SELECT has_function_privilege('authenticated', 'public.rev_test_review_json(jsonb,jsonb,jsonb)', 'EXECUTE')`), false, 'the review helper is nobody\'s to call')

console.log(`validate-rev-tests-library: ${checks} checks passed`)
