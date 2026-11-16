-- ============================================================================
-- 20261117010000_rev_tests_library.sql
-- The Revenue app's Free test and Library (2026-11-16 — the owner: IR's salespeople take simple tests "so the team can
-- check what they know", and a Library of reading so new people get up to speed. The owner's answers the same day:
-- the Principal and the Revenue Director write them; IR only; a test may be taken again; every question type — one
-- answer, several answers, true / false; the Library takes PDF, pictures, Word and links; the Library has categories and
-- marks what one has not opened yet "New"; a person's scores are kept — they see their own, the writers see everybody's).
-- ============================================================================
--
-- 1. The function `rev_training` ("Free test & Library", People — beside Revenue app and CRM): View = read every test with its answers and
--    everybody's scores, and the whole Library; Create = write a new test, a new category, add to the Library;
--    Edit = change, publish, take down and delete them. Every reach "all". Its key, scope none: no row policy opens
--    for it — the tables below are read and written only through their own functions, which ask has_any_action.
--    Held by the Principal login (role default), the Revenue Director template and the Ultimate full access template.
--    A Revenue app account may hold the key (`current_permissions()`'s member-app list, production's body with that
--    one statement swapped — as 20261021020000 did for IT requests).
-- 2. Three tabs of People › Permissions' Revenue app, added to the database's registry by name (never seeded whole):
--    `rev.tests` (Profile · Free test, View) and `rev.library` (Profile · Library, View) over the app's `revenue_app`
--    cells, as Profile · Documentation; `rev.training` (Free test & Library · Manage) over `rev_training`'s.
-- 3. Who takes a test and reads the Library: a member of IR today (`member_has_membership` on the sub-department named
--    IR) whose Profile box is open — or anybody holding Free test & Library · View, who sees it as IR does.
-- 4. Tables (RLS on, NO policy, no client grants): rev_tests, rev_test_questions, rev_test_attempts, rev_lib_categories,
--    rev_lib_items, rev_lib_seen. A test's answers never leave the database for a person taking it: rev_test_take hands
--    the questions without them; rev_test_submit scores on the server and only then shows what was right.
-- 5. Files live in R2 (portal-wide/storage.md › A NEW BUCKET): bucket `rev-library`, private, 2 GB a file, any type.
--    Create puts a file under library/; a reader of the Library reads the files its items name; Edit deletes them.
-- PGlite: tests/member-sql/validate-rev-tests-library.mjs. Running it twice changes nothing.

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
  v_pat := regexp_replace(regexp_replace(p_old, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'), '\s+', '\\s+', 'g');
  SELECT count(*) INTO v_n FROM regexp_matches(v_src, v_pat, 'g');
  IF v_n <> 1 THEN
    RAISE EXCEPTION '%: its statement is there % times, not once — production changed since this migration was written', p_sig, v_n;
  END IF;
  v_found := (regexp_match(v_src, '(' || v_pat || ')'))[1];
  EXECUTE replace(pg_get_functiondef(p_sig), v_found, p_new);
END
$fn$;

-- ── 1. The function, its key, who holds it ─────────────────────────────────────

INSERT INTO public.permission_functions (key, label, section, actions, scopes, description, sort_order) VALUES
  ('rev_training', 'Free test & Library', 'People', ARRAY['view', 'create', 'edit'], ARRAY['all'],
   'The Revenue app''s Free test and Library for IR. View = every test with its answers, everybody''s scores, the whole Library; Create = write a test, add to the Library; Edit = change, publish, take down and delete them.',
   130)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.permission_defs (key, label, section, scope, description, sort_order) VALUES
  ('rev_training', 'Free test & Library', 'People', 'none',
   'Writing the Revenue app''s Free tests and Library, and reading everybody''s scores. Opened by Free test & Library · View.', 130)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.permission_cell_keys (function_key, action, legacy_key, min_scope, gate) VALUES
  ('rev_training', 'view', 'rev_training', 'all', NULL)
ON CONFLICT (function_key, action, legacy_key) DO NOTHING;

INSERT INTO public.permission_key_actions (legacy_key, function_key, action) VALUES
  ('rev_training', 'rev_training', 'view'), ('rev_training', 'rev_training', 'create'), ('rev_training', 'rev_training', 'edit')
ON CONFLICT (legacy_key, function_key, action) DO NOTHING;

INSERT INTO public.role_default_permissions (role, permission_key) VALUES ('principal', 'rev_training')
ON CONFLICT (role, permission_key) DO NOTHING;

INSERT INTO public.permission_template_grants (template_id, function_key, action, scope)
SELECT t.id, 'rev_training', a, 'all'
  FROM public.permission_templates t, unnest(ARRAY['view', 'create', 'edit']) a
 WHERE t.key IN ('revenue_director', 'ultimate')
ON CONFLICT (template_id, function_key, action) DO NOTHING;

-- A template whose ticks are stored keeps a new tab open only when it is ticked: the writers' tab for its holders,
-- the two Profile pages for every template that ticks Profile · Documentation (the app's other reading page).
INSERT INTO public.permission_template_tabs (template_id, tab_id, action)
SELECT t.id, 'rev.training', a
  FROM public.permission_templates t, unnest(ARRAY['view', 'create', 'edit']) a
 WHERE t.key IN ('revenue_director', 'ultimate')
   AND EXISTS (SELECT 1 FROM public.permission_template_tabs x WHERE x.template_id = t.id)
ON CONFLICT (template_id, tab_id, action) DO NOTHING;

INSERT INTO public.permission_template_tabs (template_id, tab_id, action)
SELECT x.template_id, p.tab, 'view'
  FROM public.permission_template_tabs x, unnest(ARRAY['rev.tests', 'rev.library']) p(tab)
 WHERE x.tab_id = 'rev.documentation' AND x.action = 'view'
ON CONFLICT (template_id, tab_id, action) DO NOTHING;

UPDATE public.permission_templates SET version = version + 1, updated_at = now()
 WHERE key IN ('revenue_director', 'ultimate')
    OR id IN (SELECT template_id FROM public.permission_template_tabs WHERE tab_id IN ('rev.tests', 'rev.library'));

SELECT pg_temp.swap_check('public.current_permissions()'::regprocedure,
  $old$OR key=ANY(ARRAY['member_portal','member_quote','member_requests','member_memos','member_insight','member_crm','crm_manage','product_list','it_requests'])$old$,
  $new$OR key=ANY(ARRAY['member_portal','member_quote','member_requests','member_memos','member_insight','member_crm','crm_manage','product_list','it_requests','rev_training'])$new$);

-- ── 2. The tabs, in the database's copy of the registry ────────────────────────

-- The app's pages are not portal pages (permission_page_tabs holds none of /member): only the boxes' cells go in —
-- the two Profile pages over Profile · Documentation's cell, the writers' tab over its own.
INSERT INTO public.permission_tab_cells (tab_id, action, cell) VALUES
  ('rev.tests', 'view', 'revenue_app.view'),
  ('rev.library', 'view', 'revenue_app.view'),
  ('rev.training', 'view', 'rev_training.view'),
  ('rev.training', 'create', 'rev_training.create'),
  ('rev.training', 'edit', 'rev_training.edit')
ON CONFLICT DO NOTHING;

-- ── 3. The bucket ──────────────────────────────────────────────────────────────

INSERT INTO public.file_buckets (id, public, file_size_limit, allowed_mime_types, backend)
VALUES ('rev-library', false, 2147483648, NULL, 'r2')
ON CONFLICT (id) DO NOTHING;

-- ── 4. Tables ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.rev_tests (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title      text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 120),
  intro      text NOT NULL DEFAULT '' CHECK (length(intro) <= 1000),
  published  boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.users(id),
  by_name    text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.rev_test_questions (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id  uuid NOT NULL REFERENCES public.rev_tests(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position >= 0),
  kind     text NOT NULL CHECK (kind IN ('single', 'multiple', 'truefalse')),
  prompt   text NOT NULL CHECK (length(btrim(prompt)) BETWEEN 1 AND 1000),
  choices  text[] NOT NULL CHECK (cardinality(choices) BETWEEN 2 AND 8),
  correct  integer[] NOT NULL CHECK (cardinality(correct) >= 1),
  explain  text NOT NULL DEFAULT '' CHECK (length(explain) <= 1000)
);
CREATE INDEX IF NOT EXISTS rev_test_questions_test ON public.rev_test_questions (test_id, position);

CREATE TABLE IF NOT EXISTS public.rev_test_attempts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id    uuid NOT NULL REFERENCES public.rev_tests(id),
  staff_id   uuid NOT NULL REFERENCES public.hr_staff_costs(id),
  user_id    uuid REFERENCES public.users(id),
  answers    jsonb NOT NULL DEFAULT '{}'::jsonb,
  score      integer NOT NULL CHECK (score >= 0),
  total      integer NOT NULL CHECK (total >= 1 AND score <= total),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rev_test_attempts_test ON public.rev_test_attempts (test_id, staff_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.rev_lib_categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 60),
  sort_order integer NOT NULL DEFAULT 100,
  created_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS rev_lib_categories_name ON public.rev_lib_categories (lower(btrim(name)));

CREATE TABLE IF NOT EXISTS public.rev_lib_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.rev_lib_categories(id),
  title       text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  kind        text NOT NULL CHECK (kind IN ('file', 'link')),
  path        text UNIQUE CHECK (path IS NULL OR path ~ '^library/[0-9a-f-]{36}/[^/]+$'),
  file_name   text,
  mime        text NOT NULL DEFAULT '',
  size        bigint CHECK (size IS NULL OR size >= 0),
  url         text CHECK (url IS NULL OR (url ~ '^https?://[^\s]+$' AND length(url) <= 1000)),
  note        text NOT NULL DEFAULT '' CHECK (length(note) <= 500),
  created_by  uuid REFERENCES public.users(id),
  by_name     text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  CHECK ((kind = 'file' AND path IS NOT NULL AND url IS NULL) OR (kind = 'link' AND url IS NOT NULL AND path IS NULL))
);
CREATE INDEX IF NOT EXISTS rev_lib_items_category ON public.rev_lib_items (category_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.rev_lib_seen (
  item_id uuid NOT NULL REFERENCES public.rev_lib_items(id),
  user_id uuid NOT NULL REFERENCES public.users(id),
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, user_id)
);

ALTER TABLE public.rev_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rev_test_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rev_test_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rev_lib_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rev_lib_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rev_lib_seen ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rev_tests, public.rev_test_questions, public.rev_test_attempts, public.rev_lib_categories,
  public.rev_lib_items, public.rev_lib_seen FROM anon, authenticated;

SELECT public.audit_register('rev_tests', 'Free tests', 'Revenue', '{rev_training}', 'all',
  p_keys => '{id}', p_labels => '{title}');
SELECT public.audit_register('rev_test_questions', 'Free test questions', 'Revenue', '{rev_training}', 'all',
  p_keys => '{id}', p_labels => '{test_id,position}');
SELECT public.audit_register('rev_test_attempts', 'Free test scores', 'Revenue', '{rev_training}', 'all',
  p_keys => '{id}', p_labels => '{test_id,staff_id}');
SELECT public.audit_register('rev_lib_categories', 'Library categories', 'Revenue', '{rev_training}', 'all',
  p_keys => '{name}', p_labels => '{name}');
SELECT public.audit_register('rev_lib_items', 'Library', 'Revenue', '{rev_training}', 'all',
  p_keys => '{id}', p_labels => '{title}');
SELECT public.audit_register('rev_lib_seen', 'Library opened', 'Revenue', '{rev_training}', 'all',
  p_keys => '{item_id,user_id}');

-- The handoff had none; the owner's own examples (2026-11-16): product knowledge, how to sell, company rules.
INSERT INTO public.rev_lib_categories (name, sort_order) VALUES
  ('Product knowledge', 1), ('Sales skills', 2), ('Company rules', 3)
ON CONFLICT DO NOTHING;

-- ── 5. Who may ─────────────────────────────────────────────────────────────────

-- IR: the sub-department of that name (the owner: "只给IR").
CREATE OR REPLACE FUNCTION public.rev_training_sub()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT d.id FROM public.comm_sub_departments d WHERE upper(btrim(d.name)) = 'IR' ORDER BY d.is_active DESC LIMIT 1;
$fn$;

-- The caller's Revenue staff record, or NULL (never an error — member_staff_id's is the reader's to say).
CREATE OR REPLACE FUNCTION public.rev_training_staff()
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN public.member_staff_id();
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END
$fn$;

-- May the caller read this Profile page (`rev.tests` / `rev.library`)? A writer (Free test & Library · View) always; a
-- member of IR today whose box is open. Refuses in the app's words.
CREATE OR REPLACE FUNCTION public.rev_training_reader(p_tab text)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_staff uuid;
  v_page  text := CASE WHEN p_tab = 'rev.tests' THEN 'Free test' ELSE 'The Library' END;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in first.' USING ERRCODE = '42501';
  END IF;
  IF public.has_any_action(ARRAY['rev_training.view']) THEN
    RETURN;
  END IF;
  v_staff := public.rev_training_staff();
  IF v_staff IS NULL OR NOT public.member_has_membership(v_staff, public.rev_training_sub()) THEN
    RAISE EXCEPTION '% is for IR''s team.', v_page USING ERRCODE = '42501';
  END IF;
  IF public.tab_box_closed(p_tab, 'view') THEN
    RAISE EXCEPTION '% is not open to your account.', v_page USING ERRCODE = '42501';
  END IF;
END
$fn$;

CREATE OR REPLACE FUNCTION public.rev_training_need(p_action text)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_any_action(ARRAY['rev_training.' || p_action]) THEN
    RAISE EXCEPTION '%', CASE p_action
      WHEN 'view' THEN 'Free test & Library · View is not ticked for you.'
      WHEN 'create' THEN 'Free test & Library · Create is not ticked for you.'
      ELSE 'Free test & Library · Edit is not ticked for you.' END USING ERRCODE = '42501';
  END IF;
END
$fn$;

CREATE OR REPLACE FUNCTION public.rev_training_actor()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT coalesce(
    (SELECT s.employee_name FROM public.hr_staff_costs s WHERE s.user_id = auth.uid() AND s.status = 'active' LIMIT 1),
    (SELECT coalesce(nullif(btrim(u.name), ''), u.email) FROM public.users u WHERE u.id = auth.uid()),
    'Someone');
$fn$;

-- A Library file is the reader's to read when an item out of the bin names it (the bucket's SELECT policy asks).
CREATE OR REPLACE FUNCTION public.rev_lib_file_readable(p_name text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.rev_lib_items i WHERE i.path = p_name AND i.deleted_at IS NULL) THEN
    RETURN false;
  END IF;
  PERFORM public.rev_training_reader('rev.library');
  RETURN true;
EXCEPTION WHEN insufficient_privilege THEN
  RETURN false;
END
$fn$;

-- A file put in but never filed is its sender's to take back.
CREATE OR REPLACE FUNCTION public.rev_lib_unfiled(p_name text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT NOT EXISTS (SELECT 1 FROM public.rev_lib_items i WHERE i.path = p_name);
$fn$;

REVOKE ALL ON FUNCTION public.rev_training_sub(), public.rev_training_staff(), public.rev_training_reader(text),
  public.rev_training_need(text), public.rev_training_actor() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rev_lib_file_readable(text), public.rev_lib_unfiled(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rev_lib_file_readable(text), public.rev_lib_unfiled(text) TO authenticated;

DROP POLICY IF EXISTS rev_library_files_read ON public.file_objects;
CREATE POLICY rev_library_files_read ON public.file_objects FOR SELECT TO authenticated
  USING ((bucket_id = 'rev-library'::text) AND ((SELECT public.has_any_action(ARRAY['rev_training.view'::text]))
    OR public.rev_lib_file_readable(name) OR ((owner_id = ((SELECT auth.uid()))::text) AND public.rev_lib_unfiled(name))));
DROP POLICY IF EXISTS rev_library_files_upload ON public.file_objects;
CREATE POLICY rev_library_files_upload ON public.file_objects FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'rev-library'::text) AND ((storage.foldername(name))[1] = 'library'::text)
    AND (SELECT public.has_any_action(ARRAY['rev_training.create'::text])));
DROP POLICY IF EXISTS rev_library_files_delete ON public.file_objects;
CREATE POLICY rev_library_files_delete ON public.file_objects FOR DELETE TO authenticated
  USING ((bucket_id = 'rev-library'::text) AND ((SELECT public.has_any_action(ARRAY['rev_training.edit'::text]))
    OR ((owner_id = ((SELECT auth.uid()))::text) AND public.rev_lib_unfiled(name))));

-- ── 6. Free test — taking one ──────────────────────────────────────────────────

-- The tests one may take: published (a writer sees drafts too, marked), with one's own scores.
CREATE OR REPLACE FUNCTION public.rev_tests_mine()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_staff  uuid;
  v_writer boolean;
BEGIN
  PERFORM public.rev_training_reader('rev.tests');
  v_staff := public.rev_training_staff();
  v_writer := public.has_any_action(ARRAY['rev_training.view']);
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'id', t.id, 'title', t.title, 'intro', t.intro, 'published', t.published, 'updatedAt', t.updated_at,
             'questions', (SELECT count(*) FROM public.rev_test_questions q WHERE q.test_id = t.id),
             'attempts', coalesce(a.n, 0), 'best', a.best, 'last', a.last, 'lastTotal', a.last_total, 'lastAt', a.last_at)
           ORDER BY t.published DESC, t.updated_at DESC)
      FROM public.rev_tests t
      LEFT JOIN LATERAL (
        SELECT count(*) AS n, max(x.score) AS best,
               (array_agg(x.score ORDER BY x.created_at DESC))[1] AS last,
               (array_agg(x.total ORDER BY x.created_at DESC))[1] AS last_total,
               max(x.created_at) AS last_at
          FROM public.rev_test_attempts x WHERE x.test_id = t.id AND x.staff_id = v_staff
      ) a ON v_staff IS NOT NULL
     WHERE t.deleted_at IS NULL AND (t.published OR v_writer)
       AND EXISTS (SELECT 1 FROM public.rev_test_questions q WHERE q.test_id = t.id)
  ), '[]'::jsonb);
END
$fn$;

-- One test to take: its questions and choices, never which are right.
CREATE OR REPLACE FUNCTION public.rev_test_take(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_test public.rev_tests;
BEGIN
  PERFORM public.rev_training_reader('rev.tests');
  SELECT * INTO v_test FROM public.rev_tests t
   WHERE t.id = p_id AND t.deleted_at IS NULL AND (t.published OR public.has_any_action(ARRAY['rev_training.view']));
  IF v_test.id IS NULL THEN
    RAISE EXCEPTION 'That test is not open any more.' USING ERRCODE = 'P0002';
  END IF;
  RETURN jsonb_build_object('id', v_test.id, 'title', v_test.title, 'intro', v_test.intro,
    'questions', coalesce((SELECT jsonb_agg(jsonb_build_object('id', q.id, 'kind', q.kind, 'prompt', q.prompt,
                                              'choices', to_jsonb(q.choices)) ORDER BY q.position)
                             FROM public.rev_test_questions q WHERE q.test_id = p_id), '[]'::jsonb));
END
$fn$;

-- Hand a test in: `p_answers` = { "<question id>": [choice index, …] }. Scored here — a question is right when exactly
-- its right choices were picked. Kept for a member of Revenue (`saved`); a writer with no staff record just sees the
-- score. Answers then what was right, question by question.
CREATE OR REPLACE FUNCTION public.rev_test_submit(p_id uuid, p_answers jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_staff  uuid;
  v_test   public.rev_tests;
  v_total  integer;
  v_score  integer;
  v_review jsonb;
  v_clean  jsonb;
BEGIN
  PERFORM public.rev_training_reader('rev.tests');
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' THEN
    RAISE EXCEPTION 'Answer the questions first.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_test FROM public.rev_tests t
   WHERE t.id = p_id AND t.deleted_at IS NULL AND (t.published OR public.has_any_action(ARRAY['rev_training.view']));
  IF v_test.id IS NULL THEN
    RAISE EXCEPTION 'That test is not open any more.' USING ERRCODE = 'P0002';
  END IF;

  WITH q AS (
    SELECT q.id, q.position, q.correct, q.explain,
           CASE WHEN jsonb_typeof(p_answers -> q.id::text) = 'array'
                THEN ARRAY(SELECT DISTINCT (e #>> '{}')::integer FROM jsonb_array_elements(p_answers -> q.id::text) e
                            WHERE jsonb_typeof(e) = 'number' AND (e #>> '{}') ~ '^[0-9]+$'
                              AND (e #>> '{}')::integer < cardinality(q.choices) ORDER BY 1)
                ELSE ARRAY[]::integer[] END AS chosen
      FROM public.rev_test_questions q WHERE q.test_id = p_id
  )
  SELECT count(*)::integer,
         count(*) FILTER (WHERE chosen = ARRAY(SELECT unnest(correct) ORDER BY 1))::integer,
         jsonb_agg(jsonb_build_object('id', id, 'chosen', to_jsonb(chosen), 'correct', to_jsonb(correct),
                                      'right', chosen = ARRAY(SELECT unnest(correct) ORDER BY 1), 'explain', explain)
                   ORDER BY position),
         coalesce(jsonb_object_agg(id::text, to_jsonb(chosen)), '{}'::jsonb)
    INTO v_total, v_score, v_review, v_clean
    FROM q;
  IF v_total = 0 THEN
    RAISE EXCEPTION 'That test has no questions yet.' USING ERRCODE = '22023';
  END IF;

  v_staff := public.rev_training_staff();
  IF v_staff IS NOT NULL THEN
    INSERT INTO public.rev_test_attempts (test_id, staff_id, user_id, answers, score, total)
    VALUES (p_id, v_staff, auth.uid(), v_clean, v_score, v_total);
  END IF;
  RETURN jsonb_build_object('score', v_score, 'total', v_total, 'saved', v_staff IS NOT NULL, 'review', v_review);
END
$fn$;

-- ── 7. Free test — writing and results (Free test & Library) ───────────────────

CREATE OR REPLACE FUNCTION public.rev_tests_admin()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.rev_training_need('view');
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'id', t.id, 'title', t.title, 'intro', t.intro, 'published', t.published, 'byName', t.by_name,
             'updatedAt', t.updated_at,
             'questions', (SELECT count(*) FROM public.rev_test_questions q WHERE q.test_id = t.id),
             'people', (SELECT count(DISTINCT x.staff_id) FROM public.rev_test_attempts x WHERE x.test_id = t.id),
             'attempts', (SELECT count(*) FROM public.rev_test_attempts x WHERE x.test_id = t.id))
           ORDER BY t.updated_at DESC)
      FROM public.rev_tests t WHERE t.deleted_at IS NULL
  ), '[]'::jsonb);
END
$fn$;

-- One test with its answers, for its editor.
CREATE OR REPLACE FUNCTION public.rev_test_admin(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v jsonb;
BEGIN
  PERFORM public.rev_training_need('view');
  SELECT jsonb_build_object('id', t.id, 'title', t.title, 'intro', t.intro, 'published', t.published,
           'questions', coalesce((SELECT jsonb_agg(jsonb_build_object('id', q.id, 'kind', q.kind, 'prompt', q.prompt,
                                    'choices', to_jsonb(q.choices), 'correct', to_jsonb(q.correct), 'explain', q.explain)
                                    ORDER BY q.position)
                                    FROM public.rev_test_questions q WHERE q.test_id = t.id), '[]'::jsonb))
    INTO v FROM public.rev_tests t WHERE t.id = p_id AND t.deleted_at IS NULL;
  IF v IS NULL THEN
    RAISE EXCEPTION 'That test is not there any more.' USING ERRCODE = 'P0002';
  END IF;
  RETURN v;
END
$fn$;

-- Save a test whole: { id?, title, intro, published, questions: [{ kind, prompt, choices[], correct[], explain }] }.
-- A new one is Create's; changing one, Edit's. Its questions are written again from the list.
CREATE OR REPLACE FUNCTION public.rev_test_save(p_test jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_id        uuid := nullif(p_test ->> 'id', '')::uuid;
  v_title     text := btrim(coalesce(p_test ->> 'title', ''));
  v_intro     text := btrim(coalesce(p_test ->> 'intro', ''));
  v_published boolean := coalesce((p_test ->> 'published')::boolean, false);
  v_q         jsonb;
  v_i         integer := 0;
  v_kind      text;
  v_prompt    text;
  v_choices   text[];
  v_correct   integer[];
BEGIN
  PERFORM public.rev_training_need(CASE WHEN v_id IS NULL THEN 'create' ELSE 'edit' END);
  IF v_title = '' THEN
    RAISE EXCEPTION 'Give the test a title.' USING ERRCODE = '22023';
  END IF;
  IF length(v_title) > 120 THEN
    RAISE EXCEPTION 'Keep the title to 120 characters.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_test -> 'questions') <> 'array' OR jsonb_array_length(p_test -> 'questions') = 0 THEN
    RAISE EXCEPTION 'Add at least one question.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_test -> 'questions') > 100 THEN
    RAISE EXCEPTION 'A test takes up to 100 questions.' USING ERRCODE = '22023';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.rev_tests (title, intro, published, created_by, by_name)
    VALUES (v_title, v_intro, v_published, auth.uid(), public.rev_training_actor())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.rev_tests SET title = v_title, intro = v_intro, published = v_published, updated_at = now()
     WHERE id = v_id AND deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'That test is not there any more.' USING ERRCODE = 'P0002';
    END IF;
    DELETE FROM public.rev_test_questions WHERE test_id = v_id;
  END IF;

  FOR v_q IN SELECT e FROM jsonb_array_elements(p_test -> 'questions') e LOOP
    v_i := v_i + 1;
    v_kind := coalesce(v_q ->> 'kind', 'single');
    v_prompt := btrim(coalesce(v_q ->> 'prompt', ''));
    IF v_kind NOT IN ('single', 'multiple', 'truefalse') THEN
      RAISE EXCEPTION 'Question %: pick its type.', v_i USING ERRCODE = '22023';
    END IF;
    IF v_prompt = '' THEN
      RAISE EXCEPTION 'Question %: write the question.', v_i USING ERRCODE = '22023';
    END IF;
    IF v_kind = 'truefalse' THEN
      v_choices := ARRAY['True', 'False'];
    ELSE
      v_choices := ARRAY(SELECT btrim(c #>> '{}') FROM jsonb_array_elements(coalesce(v_q -> 'choices', '[]'::jsonb)) c);
      IF EXISTS (SELECT 1 FROM unnest(v_choices) c WHERE c = '') THEN
        RAISE EXCEPTION 'Question %: fill in every answer, or remove the empty one.', v_i USING ERRCODE = '22023';
      END IF;
      IF cardinality(v_choices) < 2 OR cardinality(v_choices) > 8 THEN
        RAISE EXCEPTION 'Question %: give 2 to 8 answers to pick from.', v_i USING ERRCODE = '22023';
      END IF;
    END IF;
    v_correct := ARRAY(SELECT DISTINCT (c #>> '{}')::integer FROM jsonb_array_elements(coalesce(v_q -> 'correct', '[]'::jsonb)) c
                        WHERE (c #>> '{}') ~ '^[0-9]+$' AND (c #>> '{}')::integer < cardinality(v_choices) ORDER BY 1);
    IF cardinality(v_correct) = 0 THEN
      RAISE EXCEPTION 'Question %: mark the right answer.', v_i USING ERRCODE = '22023';
    END IF;
    IF v_kind <> 'multiple' AND cardinality(v_correct) > 1 THEN
      RAISE EXCEPTION 'Question %: only one answer can be right — or make it a several-answers question.', v_i USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.rev_test_questions (test_id, position, kind, prompt, choices, correct, explain)
    VALUES (v_id, v_i - 1, v_kind, v_prompt, v_choices, v_correct, left(btrim(coalesce(v_q ->> 'explain', '')), 1000));
  END LOOP;
  RETURN v_id;
END
$fn$;

-- Publish or take down (Edit).
CREATE OR REPLACE FUNCTION public.rev_test_publish(p_id uuid, p_on boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.rev_training_need('edit');
  UPDATE public.rev_tests SET published = coalesce(p_on, false), updated_at = now() WHERE id = p_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That test is not there any more.' USING ERRCODE = 'P0002';
  END IF;
END
$fn$;

-- Delete (Edit): it leaves the app; its scores stay in the history.
CREATE OR REPLACE FUNCTION public.rev_test_delete(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.rev_training_need('edit');
  UPDATE public.rev_tests SET deleted_at = now(), published = false WHERE id = p_id AND deleted_at IS NULL;
END
$fn$;

-- Everybody's scores on one test: every member of IR today, those who took it first, and anybody else who did.
CREATE OR REPLACE FUNCTION public.rev_test_results(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_sub uuid := public.rev_training_sub();
BEGIN
  PERFORM public.rev_training_need('view');
  IF NOT EXISTS (SELECT 1 FROM public.rev_tests t WHERE t.id = p_id) THEN
    RAISE EXCEPTION 'That test is not there any more.' USING ERRCODE = 'P0002';
  END IF;
  RETURN coalesce((
    WITH people AS (
      SELECT DISTINCT s.id, s.employee_name AS name
        FROM public.hr_staff_costs s
       WHERE s.status = 'active' AND public.member_has_membership(s.id, v_sub)
      UNION
      SELECT DISTINCT s.id, s.employee_name FROM public.rev_test_attempts x JOIN public.hr_staff_costs s ON s.id = x.staff_id
       WHERE x.test_id = p_id
    )
    SELECT jsonb_agg(jsonb_build_object('staffId', p.id, 'name', p.name, 'attempts', coalesce(a.n, 0), 'best', a.best,
                                        'last', a.last, 'total', a.total, 'lastAt', a.last_at)
                     ORDER BY a.n IS NULL, a.best DESC NULLS LAST, p.name)
      FROM people p
      LEFT JOIN LATERAL (
        SELECT count(*) AS n, max(x.score) AS best,
               (array_agg(x.score ORDER BY x.created_at DESC))[1] AS last,
               (array_agg(x.total ORDER BY x.created_at DESC))[1] AS total,
               max(x.created_at) AS last_at
          FROM public.rev_test_attempts x WHERE x.test_id = p_id AND x.staff_id = p.id
        HAVING count(*) > 0
      ) a ON true
  ), '[]'::jsonb);
END
$fn$;

-- ── 8. Library ─────────────────────────────────────────────────────────────────

-- The categories, in order, each with its items out of the bin, newest first; `seen` = the caller opened it.
CREATE OR REPLACE FUNCTION public.rev_library()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.rev_training_reader('rev.library');
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name,
             'items', coalesce((SELECT jsonb_agg(jsonb_build_object(
                         'id', i.id, 'title', i.title, 'kind', i.kind, 'path', i.path, 'fileName', i.file_name,
                         'mime', i.mime, 'size', i.size, 'url', i.url, 'note', i.note, 'byName', i.by_name,
                         'createdAt', i.created_at,
                         'seen', EXISTS (SELECT 1 FROM public.rev_lib_seen s WHERE s.item_id = i.id AND s.user_id = auth.uid()))
                         ORDER BY i.created_at DESC)
                         FROM public.rev_lib_items i WHERE i.category_id = c.id AND i.deleted_at IS NULL), '[]'::jsonb))
           ORDER BY c.sort_order, c.name)
      FROM public.rev_lib_categories c
  ), '[]'::jsonb);
END
$fn$;

-- Opened: no longer New for the caller. Answers where it is (a file's path, or a link's address).
CREATE OR REPLACE FUNCTION public.rev_library_open(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v jsonb;
BEGIN
  PERFORM public.rev_training_reader('rev.library');
  SELECT jsonb_build_object('kind', i.kind, 'path', i.path, 'url', i.url, 'fileName', i.file_name) INTO v
    FROM public.rev_lib_items i WHERE i.id = p_id AND i.deleted_at IS NULL;
  IF v IS NULL THEN
    RAISE EXCEPTION 'That is not in the Library any more.' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.rev_lib_seen (item_id, user_id) VALUES (p_id, auth.uid()) ON CONFLICT DO NOTHING;
  RETURN v;
END
$fn$;

-- A category: a new one (Create) or renamed (Edit).
CREATE OR REPLACE FUNCTION public.rev_lib_category_save(p_id uuid, p_name text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_name text := btrim(coalesce(p_name, ''));
  v_id   uuid := p_id;
BEGIN
  PERFORM public.rev_training_need(CASE WHEN p_id IS NULL THEN 'create' ELSE 'edit' END);
  IF v_name = '' OR length(v_name) > 60 THEN
    RAISE EXCEPTION 'Name the category (up to 60 characters).' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.rev_lib_categories c WHERE lower(btrim(c.name)) = lower(v_name) AND c.id IS DISTINCT FROM p_id) THEN
    RAISE EXCEPTION 'There is a category called % already.', v_name USING ERRCODE = '23505';
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.rev_lib_categories (name, sort_order, created_by)
    VALUES (v_name, coalesce((SELECT max(sort_order) + 1 FROM public.rev_lib_categories), 1), auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.rev_lib_categories SET name = v_name WHERE id = p_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'That category is not there any more.' USING ERRCODE = 'P0002';
    END IF;
  END IF;
  RETURN v_id;
END
$fn$;

-- Delete a category (Edit) — refused while anything is in it.
CREATE OR REPLACE FUNCTION public.rev_lib_category_delete(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.rev_training_need('edit');
  IF EXISTS (SELECT 1 FROM public.rev_lib_items i WHERE i.category_id = p_id AND i.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Move or delete what is in this category first.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.rev_lib_items i WHERE i.category_id = p_id) THEN
    -- Deleted items keep their category for the history: the category goes out of the list by name only.
    RAISE EXCEPTION 'This category has deleted items in its history, so rename it instead.' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.rev_lib_categories WHERE id = p_id;
END
$fn$;

-- Add to the Library (Create): a file the caller just put under library/ in the bucket, or a link.
CREATE OR REPLACE FUNCTION public.rev_lib_item_add(p_category uuid, p_title text, p_kind text, p_path text, p_url text, p_note text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_title text := btrim(coalesce(p_title, ''));
  v_url   text := nullif(btrim(coalesce(p_url, '')), '');
  v_o     public.file_objects;
  v_id    uuid;
BEGIN
  PERFORM public.rev_training_need('create');
  IF NOT EXISTS (SELECT 1 FROM public.rev_lib_categories c WHERE c.id = p_category) THEN
    RAISE EXCEPTION 'Pick a category.' USING ERRCODE = '22023';
  END IF;
  IF v_title = '' OR length(v_title) > 200 THEN
    RAISE EXCEPTION 'Give it a title (up to 200 characters).' USING ERRCODE = '22023';
  END IF;
  IF p_kind = 'file' THEN
    SELECT * INTO v_o FROM public.file_objects o
     WHERE o.bucket_id = 'rev-library' AND o.name = p_path AND o.owner_id = auth.uid()::text;
    IF v_o.name IS NULL OR p_path !~ '^library/[0-9a-f-]{36}/[^/]+$' THEN
      RAISE EXCEPTION 'The file did not arrive — send it again.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.rev_lib_items (category_id, title, kind, path, file_name, mime, size, note, created_by, by_name)
    VALUES (p_category, v_title, 'file', p_path, regexp_replace(p_path, '^.*/', ''),
            coalesce(v_o.metadata ->> 'mimetype', ''), nullif(v_o.metadata ->> 'size', '')::bigint,
            left(btrim(coalesce(p_note, '')), 500), auth.uid(), public.rev_training_actor())
    RETURNING id INTO v_id;
  ELSIF p_kind = 'link' THEN
    IF v_url IS NULL OR v_url !~ '^https?://[^\s]+$' OR length(v_url) > 1000 THEN
      RAISE EXCEPTION 'Paste the full link, starting https://' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.rev_lib_items (category_id, title, kind, url, note, created_by, by_name)
    VALUES (p_category, v_title, 'link', v_url, left(btrim(coalesce(p_note, '')), 500), auth.uid(), public.rev_training_actor())
    RETURNING id INTO v_id;
  ELSE
    RAISE EXCEPTION 'Add a file or a link.' USING ERRCODE = '22023';
  END IF;
  RETURN v_id;
END
$fn$;

-- Change an item's title, category, note — and a link's address (Edit).
CREATE OR REPLACE FUNCTION public.rev_lib_item_edit(p_id uuid, p_category uuid, p_title text, p_url text, p_note text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_item  public.rev_lib_items;
  v_title text := btrim(coalesce(p_title, ''));
  v_url   text := nullif(btrim(coalesce(p_url, '')), '');
BEGIN
  PERFORM public.rev_training_need('edit');
  SELECT * INTO v_item FROM public.rev_lib_items WHERE id = p_id AND deleted_at IS NULL;
  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'That is not in the Library any more.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.rev_lib_categories c WHERE c.id = p_category) THEN
    RAISE EXCEPTION 'Pick a category.' USING ERRCODE = '22023';
  END IF;
  IF v_title = '' OR length(v_title) > 200 THEN
    RAISE EXCEPTION 'Give it a title (up to 200 characters).' USING ERRCODE = '22023';
  END IF;
  IF v_item.kind = 'link' AND (v_url IS NULL OR v_url !~ '^https?://[^\s]+$' OR length(v_url) > 1000) THEN
    RAISE EXCEPTION 'Paste the full link, starting https://' USING ERRCODE = '22023';
  END IF;
  UPDATE public.rev_lib_items
     SET category_id = p_category, title = v_title, note = left(btrim(coalesce(p_note, '')), 500),
         url = CASE WHEN kind = 'link' THEN v_url ELSE NULL END, updated_at = now()
   WHERE id = p_id;
END
$fn$;

-- Delete (Edit): out of the app; a file's bytes' row goes too (R2's hourly sweep takes the bytes).
CREATE OR REPLACE FUNCTION public.rev_lib_item_delete(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_path text;
BEGIN
  PERFORM public.rev_training_need('edit');
  UPDATE public.rev_lib_items SET deleted_at = now() WHERE id = p_id AND deleted_at IS NULL RETURNING path INTO v_path;
  IF v_path IS NOT NULL THEN
    DELETE FROM public.file_objects WHERE bucket_id = 'rev-library' AND name = v_path;
  END IF;
END
$fn$;

REVOKE ALL ON FUNCTION public.rev_tests_mine(), public.rev_test_take(uuid), public.rev_test_submit(uuid, jsonb),
  public.rev_tests_admin(), public.rev_test_admin(uuid), public.rev_test_save(jsonb), public.rev_test_publish(uuid, boolean),
  public.rev_test_delete(uuid), public.rev_test_results(uuid), public.rev_library(), public.rev_library_open(uuid),
  public.rev_lib_category_save(uuid, text), public.rev_lib_category_delete(uuid),
  public.rev_lib_item_add(uuid, text, text, text, text, text), public.rev_lib_item_edit(uuid, uuid, text, text, text),
  public.rev_lib_item_delete(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rev_tests_mine(), public.rev_test_take(uuid), public.rev_test_submit(uuid, jsonb),
  public.rev_tests_admin(), public.rev_test_admin(uuid), public.rev_test_save(jsonb), public.rev_test_publish(uuid, boolean),
  public.rev_test_delete(uuid), public.rev_test_results(uuid), public.rev_library(), public.rev_library_open(uuid),
  public.rev_lib_category_save(uuid, text), public.rev_lib_category_delete(uuid),
  public.rev_lib_item_add(uuid, text, text, text, text, text), public.rev_lib_item_edit(uuid, uuid, text, text, text),
  public.rev_lib_item_delete(uuid) TO authenticated;
