-- Marketing Workflow Builder 2a — the running-task engine (2026-11-13; docs/design_handoff_workflow_builder/README.md ›
-- Interactions & behavior, State / data model; the shared rules in src/lib/marketing/flow.ts — this file is their twin).
-- Runs after 20261113200000_marketing_wf_builder_v2.sql (the template side: groups, categories, the template / version
-- JSON); everything here reads a version's stages in either shape, so it runs over a database without that file too.
--
-- The user's decisions it carries (the build contract, 2026-11-13):
--   5. No Accept step: a stage is its doer's to work as soon as it opens. Status `todo` is never left standing — a
--      BEFORE INSERT / UPDATE trigger turns it into `accepted` (accepted_at = coalesce(entered_at, now())), so every
--      writer that still opens a stage `todo` (mkt_task_begin, mkt_run_make, mkt_product_run_next, mkt_replace_person,
--      mkt_deliverable_plan, mkt_task_create) opens it worked. The rows standing `todo` are accepted below.
--   6. Working days are Monday to Friday — no holidays (mkt_stage_dates). Due 18:00 office time; late = whole days past
--      that, rounded up (mkt_overdue_sweep; flow.ts › lateDays).
--   Approval levels {ids, rule}: `any` passes on the first approval, `all` waits for everyone on the level; levels run
--   in order, each telling the next. Who approved the level now is `mkt_stages.appr_ok` (id → when); the PIC is the id
--   'pic' (with two PICs on a level that asks both — `picAll` — `pic_ok` keeps the first PIC's approval as before, and
--   'pic' joins appr_ok once the PIC side has passed). Legacy elements ({kind: 'person' | 'pic' | 'assign'}) are still
--   read everywhere (mkt_level_norm); new writes keep the new shape.
--   Request changes goes back to the stage's `back` (or stays), clearing the approvals from there to here, the stage's
--   clock restarted (entered_at = now()), its doer told.
--   Done: +60 XP to everybody on the task (the pet's ledger), the version's finish.notify told, `after: feedback` read by
--   the PIC's page as three working days more.
--
-- Production's bodies (project gixpptmfuryskbwkmiwz, read 2026-11-13 — md5(prosrc), compared with the newest migration
-- copy, line endings as stored):
--   rewritten whole, from the copy equal to production's:
--     mkt_stage_dates      b401ef3e17941465750476d644f52c8b = 20261025031000 (CRLF as stored)
--     mkt_stage_submit     3ce2a0ce5c3e611c4f8d691a6ace63f2 = 20261025101000
--     mkt_stage_decide     8b873e16265f15dcc92a347477aae50f = 20261023234000
--     mkt_advance          96296c26561be536460e2864843238ae = 20261025037000
--     mkt_pic_stage_answer 8ca62c0415e5496cd509a7a33adba9f7 = 20261025235000
--     mkt_product_begin    57b99e183758aa2802a1a0f71a4152d6 = 20261025131000
--     mkt_deliverable_plan 0fb2cb1fdc4e4c44a9ac786592feea22 = 20261025181000
--     mkt_replace_scan     d32b240ea07b65735840364016c2fb5e = 20261025036000
--     mkt_stage_people     19a5270a3e96f6744687a10f8e5a5080 = 20261025036000
--     mkt_people_swap      8b3745b1986c2ec2550583751fc5615a = 20261025036000
--   statements swapped in place (pg_temp.swap_check — production's statement, whitespace-blind, exactly once):
--     mkt_task_create      0015ca8c3da9e46b402b789bcaba6da2 = 20261025235000
--     mkt_board            12e4f97c28706202ae44394f6cd8c943 = 20261026001000
--     mkt_shell            f1ec6fe88b6175d762abc1364c31d1a8 (production = 20261023234000 + 20261029200000's swap)
--     mkt_project          d65fda792f66d84111124a2a990b4ac3 = 20261025235000
--     mkt_pic_page         e3eeec37702cec596b5081732924e857 (production = 20261025235900 + 20261112180000's swaps)
--     mkt_pic_work         4f916a67f222ce7a7f6b4511c2ab6680 = 20261025235000
--     mkt_pic_calendar     59090436d630fff84943e650ae13a444 = 20261025235500
--     mkt_nudge            8a65f985d5a8f7d5ed46db44f994bb1d = 20261023234000
--     mkt_free_block       cdb4332d104d568eaf0f4cc39c26d692 = 20261023234000
--     mkt_replace_person   78e05198f675c4779d1784436f4d3103 = 20261025036000
--     mkt_product_run_next 4b37e90833b30eb2724da9d8f6e7e6b9 = 20261025181000
--     mkt_stage_save       d852759a5aee0ce49fbdb5509e610e1c = 20261025191000 (a Table field takes its rows)
--     mkt_stage_missing    4a6c6e932dc90191cfd5112bbc1e3b9c (production; a table its canvas marks required)
--   left alone (read, nothing to change):
--     mkt_task_begin, mkt_run_make — open stage 1 `todo` (the trigger accepts it) and date through mkt_stage_dates;
--     mkt_stage_accept — no stage is `todo` any more, so it refuses ("nothing to accept"); the UI has no Accept;
--     mkt_products, mkt_workflow_check, mkt_quote_assign — a template's stages (lane T's), never a running stage;
--     mkt_board / mkt_project / mkt_pic_calendar's `holidays` — HR's holidays as ⚑ key dates on calendars, not dates.
-- New: mkt_stage_reassign, mkt_task_column (Server Actions in src/lib/marketing/task-actions.ts), mkt_overdue_sweep
-- (the hourly cron /api/member-queue, the service role's alone), the level helpers.

-- ── Columns ─────────────────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.mkt_stages
  ADD COLUMN IF NOT EXISTS appr_ok jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS late_told_at timestamptz;
ALTER TABLE public.mkt_stages DROP CONSTRAINT IF EXISTS mkt_stages_appr_ok_check;
ALTER TABLE public.mkt_stages ADD CONSTRAINT mkt_stages_appr_ok_check CHECK (jsonb_typeof(appr_ok) = 'object');

ALTER TABLE public.mkt_projects
  ADD COLUMN IF NOT EXISTS overdue jsonb,
  ADD COLUMN IF NOT EXISTS finish jsonb,
  ADD COLUMN IF NOT EXISTS extra_cols jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.mkt_projects DROP CONSTRAINT IF EXISTS mkt_projects_overdue_check;
ALTER TABLE public.mkt_projects ADD CONSTRAINT mkt_projects_overdue_check CHECK (overdue IS NULL OR jsonb_typeof(overdue) = 'object');
ALTER TABLE public.mkt_projects DROP CONSTRAINT IF EXISTS mkt_projects_finish_check;
ALTER TABLE public.mkt_projects ADD CONSTRAINT mkt_projects_finish_check CHECK (finish IS NULL OR jsonb_typeof(finish) = 'object');
ALTER TABLE public.mkt_projects DROP CONSTRAINT IF EXISTS mkt_projects_extra_cols_check;
ALTER TABLE public.mkt_projects ADD CONSTRAINT mkt_projects_extra_cols_check CHECK (jsonb_typeof(extra_cols) = 'object');

-- The template's own (lane T adds them in 20261113200000; here too, so this file reads them over any database).
ALTER TABLE public.mkt_workflow_versions
  ADD COLUMN IF NOT EXISTS overdue jsonb,
  ADD COLUMN IF NOT EXISTS finish jsonb;

-- The pet's ledger takes a task's done (+60 XP to each on it, once a task and person).
ALTER TABLE public.mkt_pet_log DROP CONSTRAINT IF EXISTS mkt_pet_log_kind_check;
ALTER TABLE public.mkt_pet_log ADD CONSTRAINT mkt_pet_log_kind_check CHECK (kind IN ('stage', 'feed', 'workout', 'done'));
ALTER TABLE public.mkt_pet_log DROP CONSTRAINT IF EXISTS mkt_pet_log_xp_check;
ALTER TABLE public.mkt_pet_log ADD CONSTRAINT mkt_pet_log_xp_check CHECK (xp BETWEEN 0 AND 60);
CREATE UNIQUE INDEX IF NOT EXISTS mkt_pet_log_done ON public.mkt_pet_log (project_id, staff) WHERE kind = 'done';

-- ── A stage's group is a group key; no stage stands `todo` ──────────────────────────────────────────────────────────

-- A group key as it is ('' none), or a People title read as the group its words name (groups.ts › groupTone's order;
-- a manager's title is no group). Lets every writer that still sends a title keep working.
CREATE OR REPLACE FUNCTION public.mkt_dept_key(p text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $fn$
DECLARE
  v text := upper(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g'));
BEGIN
  IF btrim(coalesce(p, '')) = '' THEN
    RETURN '';
  END IF;
  IF btrim(p) ~ '^[a-z0-9_]{1,24}$' THEN
    RETURN btrim(p);
  END IF;
  IF v LIKE '%MARKETING MANAGER%' THEN RETURN ''; END IF;
  IF v ~ 'VIDEO|CONTENT|PHOTO' THEN RETURN 'content'; END IF;
  IF v ~ 'GRAPHIC|DESIGN' THEN RETURN 'design'; END IF;
  IF v LIKE '%SOCIAL%' THEN RETURN 'social'; END IF;
  IF v ~ 'VISUAL MERCHANDIS|EVENT|BRAND' THEN RETURN 'brand'; END IF;
  IF v ~ '(^|[^A-Z])ADS([^A-Z]|$)|MARKETING EXECUTIVE|TELEMARKET' THEN RETURN 'ads'; END IF;
  RETURN '';
END
$fn$;

CREATE OR REPLACE FUNCTION public.mkt_stages_engine_v2()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  -- No Accept (the user's decision 5): a stage opened `todo` is its doer's to work at once.
  IF NEW.status = 'todo' THEN
    NEW.status := 'accepted';
    NEW.accepted_at := coalesce(NEW.entered_at, now());
  END IF;
  NEW.dept := public.mkt_dept_key(NEW.dept);
  RETURN NEW;
END
$fn$;
REVOKE ALL ON FUNCTION public.mkt_stages_engine_v2() FROM PUBLIC, anon, authenticated;

UPDATE public.mkt_stages SET status = 'accepted', accepted_at = coalesce(accepted_at, entered_at, now()) WHERE status = 'todo';
UPDATE public.mkt_stages SET dept = public.mkt_dept_key(dept) WHERE dept IS DISTINCT FROM public.mkt_dept_key(dept);
ALTER TABLE public.mkt_stages DROP CONSTRAINT IF EXISTS mkt_stages_dept_check;
ALTER TABLE public.mkt_stages ADD CONSTRAINT mkt_stages_dept_check CHECK (dept = '' OR dept ~ '^[a-z0-9_]{1,24}$');

DROP TRIGGER IF EXISTS mkt_stages_engine_v2 ON public.mkt_stages;
CREATE TRIGGER mkt_stages_engine_v2 BEFORE INSERT OR UPDATE ON public.mkt_stages
  FOR EACH ROW EXECUTE FUNCTION public.mkt_stages_engine_v2();

-- ── The level helpers (flow.ts's twins) ─────────────────────────────────────────────────────────────────────────────

-- A level as any version of the data keeps it → {ids, rule} (+ picAll when both PICs are asked); unknown → NULL.
CREATE OR REPLACE FUNCTION public.mkt_level_norm(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $fn$
DECLARE
  v_ids jsonb;
BEGIN
  IF jsonb_typeof(p) IS DISTINCT FROM 'object' THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(p -> 'ids') = 'array' THEN
    v_ids := coalesce((SELECT jsonb_agg(z.x ORDER BY z.o)
                         FROM (SELECT DISTINCT ON (lower(btrim(t.x))) lower(btrim(t.x)) AS x, t.o
                                 FROM jsonb_array_elements_text(
                                        (SELECT coalesce(jsonb_agg(e), '[]'::jsonb) FROM jsonb_array_elements(p -> 'ids') e
                                          WHERE jsonb_typeof(e) = 'string')) WITH ORDINALITY AS t(x, o)
                                WHERE btrim(t.x) <> ''
                                ORDER BY lower(btrim(t.x)), t.o) z), '[]'::jsonb);
    RETURN jsonb_build_object('ids', v_ids, 'rule', CASE WHEN p ->> 'rule' = 'all' THEN 'all' ELSE 'any' END)
        || CASE WHEN (p ->> 'picAll' = 'true' OR p ->> 'all' = 'true') AND v_ids ? 'pic' THEN '{"picAll": true}'::jsonb ELSE '{}'::jsonb END;
  END IF;
  IF p ->> 'kind' = 'person' AND btrim(coalesce(p ->> 'staff', '')) <> '' THEN
    RETURN jsonb_build_object('ids', jsonb_build_array(lower(btrim(p ->> 'staff'))), 'rule', 'any');
  END IF;
  IF p ->> 'kind' = 'pic' THEN
    RETURN jsonb_build_object('ids', '["pic"]'::jsonb, 'rule', 'any')
        || CASE WHEN p ->> 'all' = 'true' THEN '{"picAll": true}'::jsonb ELSE '{}'::jsonb END;
  END IF;
  IF p ->> 'kind' = 'assign' THEN
    RETURN jsonb_build_object('ids', jsonb_build_array(coalesce(nullif(lower(btrim(coalesce(p ->> 'staff', ''))), ''), 'assign')),
                              'rule', 'any');
  END IF;
  RETURN NULL;
END
$fn$;

-- Every level of a stage, normalized, at its own position (an unreadable one: nobody on it).
CREATE OR REPLACE FUNCTION public.mkt_levels_norm(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $fn$
BEGIN
  IF jsonb_typeof(p) IS DISTINCT FROM 'array' THEN
    RETURN '[]'::jsonb;
  END IF;
  RETURN coalesce((SELECT jsonb_agg(coalesce(public.mkt_level_norm(x), '{"ids": [], "rule": "any"}'::jsonb) ORDER BY o)
                     FROM jsonb_array_elements(p) WITH ORDINALITY AS t(x, o)), '[]'::jsonb);
END
$fn$;

CREATE OR REPLACE FUNCTION public.mkt_level_at(p_appr jsonb, p_idx integer)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $fn$
BEGIN
  IF jsonb_typeof(p_appr) IS DISTINCT FROM 'array' OR p_idx IS NULL OR p_idx < 0 OR p_idx >= jsonb_array_length(p_appr) THEN
    RETURN NULL;
  END IF;
  RETURN coalesce(public.mkt_level_norm(p_appr -> p_idx), '{"ids": [], "rule": "any"}'::jsonb);
END
$fn$;

-- Who a level still waits for: `any` — everyone on it until one approves, then nobody; `all` — those who have not.
CREATE OR REPLACE FUNCTION public.mkt_level_waits(p_level jsonb, p_ok jsonb)
RETURNS text[]
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $fn$
DECLARE
  v_ok  jsonb := CASE WHEN jsonb_typeof(p_ok) = 'object' THEN p_ok ELSE '{}'::jsonb END;
  v_ids text[];
BEGIN
  IF p_level IS NULL OR jsonb_typeof(p_level -> 'ids') IS DISTINCT FROM 'array' THEN
    RETURN '{}'::text[];
  END IF;
  v_ids := ARRAY(SELECT x FROM jsonb_array_elements_text(p_level -> 'ids') x);
  IF coalesce(p_level ->> 'rule', 'any') <> 'all' THEN
    RETURN CASE WHEN EXISTS (SELECT 1 FROM unnest(v_ids) x WHERE v_ok ? x) THEN '{}'::text[] ELSE v_ids END;
  END IF;
  RETURN ARRAY(SELECT x FROM unnest(v_ids) x WHERE NOT (v_ok ? x));
END
$fn$;

-- Who the stage's level now still waits for (its appr, level, approvals so far).
CREATE OR REPLACE FUNCTION public.mkt_stage_waits(p_appr jsonb, p_idx integer, p_ok jsonb)
RETURNS text[]
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $fn$
BEGIN
  RETURN public.mkt_level_waits(public.mkt_level_at(p_appr, p_idx), p_ok);
END
$fn$;

-- The staff on a stage's levels (1-based level), legacy elements too.
CREATE OR REPLACE FUNCTION public.mkt_appr_people(p_appr jsonb)
RETURNS TABLE (who uuid, lvl integer)
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $fn$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (x.id) x.id::uuid, l.o::integer
    FROM jsonb_array_elements(public.mkt_levels_norm(p_appr)) WITH ORDINALITY AS l(v, o),
         jsonb_array_elements_text(l.v -> 'ids') AS x(id)
   WHERE x.id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   ORDER BY x.id, l.o;
END
$fn$;

-- Does any level ask the PIC?
CREATE OR REPLACE FUNCTION public.mkt_levels_pic(p_appr jsonb)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $fn$
BEGIN
  RETURN EXISTS (SELECT 1 FROM jsonb_array_elements(public.mkt_levels_norm(p_appr)) l WHERE l -> 'ids' ? 'pic');
END
$fn$;

-- The levels with only the people `p_keep` names kept (a carried month: those still on the roster); a level left
-- with nobody goes.
CREATE OR REPLACE FUNCTION public.mkt_levels_keep(p_appr jsonb, p_keep uuid[])
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $fn$
BEGIN
  RETURN coalesce((
    SELECT jsonb_agg(k.lv ORDER BY k.o)
      FROM (SELECT l.o, l.v || jsonb_build_object('ids', coalesce((
                     SELECT jsonb_agg(x.id ORDER BY x.n) FROM jsonb_array_elements_text(l.v -> 'ids') WITH ORDINALITY AS x(id, n)
                      WHERE x.id !~ '^[0-9a-f]{8}-' OR x.id::uuid = ANY (p_keep)), '[]'::jsonb)) AS lv
              FROM jsonb_array_elements(public.mkt_levels_norm(p_appr)) WITH ORDINALITY AS l(v, o)) k
     WHERE jsonb_array_length(k.lv -> 'ids') > 0), '[]'::jsonb);
END
$fn$;

-- A level in words: "Rachel or Kelvin (PIC)" (any one), "Rachel & Daniel" (everyone).
CREATE OR REPLACE FUNCTION public.mkt_level_names(p_level jsonb, p_pic text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF p_level IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN left(nullif(array_to_string(ARRAY(
           SELECT CASE WHEN x = 'pic' THEN coalesce(nullif(btrim(coalesce(p_pic, '')), '') || ' (PIC)', 'PIC')
                       WHEN x = 'assign' THEN 'Picked at assignment'
                       WHEN x ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                         THEN coalesce(public.mkt_staff_name(x::uuid), 'Somebody')
                       ELSE x END
             FROM jsonb_array_elements_text(p_level -> 'ids') WITH ORDINALITY AS t(x, o) ORDER BY o),
           CASE WHEN p_level ->> 'rule' = 'all' THEN ' & ' ELSE ' or ' END), ''), 200);
END
$fn$;

-- Tell everybody on a level (the staff; never the PIC — the link is theirs).
CREATE OR REPLACE FUNCTION public.mkt_level_tell(p_project uuid, p_level jsonb, p_title text, p_body text, p_type text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_id text;
BEGIN
  IF p_level IS NULL OR jsonb_typeof(p_level -> 'ids') IS DISTINCT FROM 'array' THEN
    RETURN;
  END IF;
  FOR v_id IN SELECT x FROM jsonb_array_elements_text(p_level -> 'ids') x
               WHERE x ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' LOOP
    PERFORM public.mkt_notify(v_id::uuid, p_project, p_title, p_body, p_type);
  END LOOP;
END
$fn$;

-- A stage's levels as a writer sends them, checked and written clean: ≤ 3 levels; each a string (a staff id, 'pic',
-- 'pic:all' — the quick builder's) or {ids, rule[, picAll]} (or a legacy {kind}); on each, somebody — a person on
-- Marketing's roster or the PIC; the PIC once a stage; a person on one level only; nobody 'picked at assignment' left.
-- `p_pic_all` false drops picAll (one PIC named).
CREATE OR REPLACE FUNCTION public.mkt_levels_check(p_appr jsonb, p_roster uuid[], p_where text, p_pic_all boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SET search_path = public
AS $fn$
DECLARE
  v_out  jsonb := '[]'::jsonb;
  v_x    jsonb;
  v_lv   jsonb;
  v_id   text;
  v_seen text[] := '{}';
BEGIN
  IF p_appr IS NULL OR jsonb_typeof(p_appr) = 'null' THEN
    RETURN '[]'::jsonb;
  END IF;
  IF jsonb_typeof(p_appr) <> 'array' THEN
    RAISE EXCEPTION '%: not a list of approvals.', p_where USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_appr) > 3 THEN
    RAISE EXCEPTION '%: at most 3 approvals.', p_where USING ERRCODE = '22023';
  END IF;
  FOR v_x IN SELECT x FROM jsonb_array_elements(p_appr) x LOOP
    IF jsonb_typeof(v_x) = 'string' THEN
      v_lv := CASE WHEN v_x #>> '{}' = 'pic' THEN '{"ids": ["pic"], "rule": "any"}'::jsonb
                   WHEN v_x #>> '{}' = 'pic:all' THEN '{"ids": ["pic"], "rule": "any", "picAll": true}'::jsonb
                   ELSE jsonb_build_object('ids', jsonb_build_array(lower(btrim(v_x #>> '{}'))), 'rule', 'any') END;
    ELSE
      v_lv := public.mkt_level_norm(v_x);
    END IF;
    IF v_lv IS NULL OR jsonb_array_length(v_lv -> 'ids') = 0 THEN
      RAISE EXCEPTION '%: pick who approves it.', p_where USING ERRCODE = '22023';
    END IF;
    FOR v_id IN SELECT x FROM jsonb_array_elements_text(v_lv -> 'ids') x LOOP
      IF v_id = 'assign' THEN
        RAISE EXCEPTION '%: pick who approves it.', p_where USING ERRCODE = '22023';
      ELSIF v_id = 'pic' THEN
        IF 'pic' = ANY (v_seen) THEN
          RAISE EXCEPTION '%: the PIC twice.', p_where USING ERRCODE = '22023';
        END IF;
      ELSIF v_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR NOT (v_id::uuid = ANY (p_roster)) THEN
        RAISE EXCEPTION '%: an approver is not on Marketing''s team.', p_where USING ERRCODE = '22023';
      ELSIF v_id = ANY (v_seen) THEN
        RAISE EXCEPTION '%: the same approver twice.', p_where USING ERRCODE = '22023';
      END IF;
      v_seen := v_seen || v_id;
    END LOOP;
    IF NOT coalesce(p_pic_all, true) THEN
      v_lv := v_lv - 'picAll';
    END IF;
    v_out := v_out || jsonb_build_array(v_lv);
  END LOOP;
  RETURN v_out;
END
$fn$;

-- `n` working days (Monday to Friday) after a day.
CREATE OR REPLACE FUNCTION public.mkt_add_work_days(p_day date, p_n integer)
RETURNS date
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $fn$
DECLARE
  v_day  date := p_day;
  v_left integer := greatest(coalesce(p_n, 0), 0);
BEGIN
  IF p_day IS NULL THEN
    RETURN NULL;
  END IF;
  WHILE v_left > 0 LOOP
    v_day := v_day + 1;
    IF extract(isodow FROM v_day) < 6 THEN
      v_left := v_left - 1;
    END IF;
  END LOOP;
  RETURN v_day;
END
$fn$;

-- ── Dates: Monday to Friday, no holidays (the user's decision 6; flow.ts › flowDates) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_stage_dates(p_base date, p_slas integer[])
RETURNS TABLE (idx integer, starts_on date, due_on date)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_day   date := p_base;
  v_start date;
  v_left  integer;
  i       integer;
BEGIN
  FOR i IN 1 .. coalesce(array_length(p_slas, 1), 0) LOOP
    IF i = 1 THEN
      v_start := p_base;
    ELSE
      v_start := v_day;
      LOOP
        v_start := v_start + 1;
        EXIT WHEN extract(isodow FROM v_start) < 6;
      END LOOP;
    END IF;
    v_left := greatest(coalesce(p_slas[i], 1), 1);
    WHILE v_left > 0 LOOP
      v_day := v_day + 1;
      IF extract(isodow FROM v_day) < 6 THEN
        v_left := v_left - 1;
      END IF;
    END LOOP;
    idx := i - 1;
    starts_on := v_start;
    due_on := v_day;
    RETURN NEXT;
  END LOOP;
END
$fn$;

-- ── The machine ─────────────────────────────────────────────────────────────────────────────────────────────────────

-- One approval on the level now of the stage now (a staff id, or 'pic' once the PIC side passed): kept; the level
-- passed — the next level (told), or the stage done (mkt_advance). Answers {passed, next, done}. Callers check who.
CREATE OR REPLACE FUNCTION public.mkt_level_ok(p_project uuid, p_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_p    public.mkt_projects;
  v_s    public.mkt_stages;
  v_ok   jsonb;
  v_lvl  integer;
  v_next jsonb;
BEGIN
  SELECT * INTO v_p FROM public.mkt_projects WHERE id = p_project FOR UPDATE;
  SELECT * INTO v_s FROM public.mkt_stages WHERE project_id = v_p.id AND idx = v_p.cur FOR UPDATE;
  v_ok := coalesce(v_s.appr_ok, '{}'::jsonb) || jsonb_build_object(p_id, now());
  IF cardinality(public.mkt_stage_waits(v_s.appr, v_s.appr_idx, v_ok)) > 0 THEN
    UPDATE public.mkt_stages SET appr_ok = v_ok WHERE project_id = v_p.id AND idx = v_s.idx;
    UPDATE public.mkt_projects SET updated_at = now() WHERE id = v_p.id;
    RETURN jsonb_build_object('passed', false,
                              'waits', to_jsonb(public.mkt_stage_waits(v_s.appr, v_s.appr_idx, v_ok)));
  END IF;
  -- The next level with somebody on it.
  v_lvl := v_s.appr_idx + 1;
  LOOP
    v_next := public.mkt_level_at(v_s.appr, v_lvl);
    EXIT WHEN v_next IS NULL OR jsonb_array_length(v_next -> 'ids') > 0;
    v_lvl := v_lvl + 1;
  END LOOP;
  IF v_next IS NOT NULL THEN
    UPDATE public.mkt_stages SET appr_idx = v_lvl, appr_ok = '{}'::jsonb, pic_ok = NULL
     WHERE project_id = v_p.id AND idx = v_s.idx;
    UPDATE public.mkt_projects SET updated_at = now() WHERE id = v_p.id;
    PERFORM public.mkt_level_tell(v_p.id, v_next,
              coalesce(public.mkt_staff_name(v_s.owner_staff), 'The team') || ' submitted ' || v_s.name || ' v' || v_s.ver
                || ' for your approval',
              v_p.track_id || ' · ' || v_p.title, 'review');
    RETURN jsonb_build_object('passed', true, 'next', v_next, 'done', false);
  END IF;
  UPDATE public.mkt_stages SET appr_ok = v_ok WHERE project_id = v_p.id AND idx = v_s.idx;
  PERFORM public.mkt_advance(v_p.id);
  RETURN jsonb_build_object('passed', true, 'next', NULL, 'done', true);
END
$fn$;

-- Changes asked on the stage now: back to its `back` (an earlier stage — it takes them, those between wait again) or
-- it stays; the approvals from there to here cleared, the stage's clock restarted. Answers the stage that takes them.
CREATE OR REPLACE FUNCTION public.mkt_stage_back(p_project uuid, p_changes jsonb)
RETURNS public.mkt_stages
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_p    public.mkt_projects;
  v_s    public.mkt_stages;
  v_back integer;
  v_to   public.mkt_stages;
BEGIN
  SELECT * INTO v_p FROM public.mkt_projects WHERE id = p_project FOR UPDATE;
  SELECT * INTO v_s FROM public.mkt_stages WHERE project_id = v_p.id AND idx = v_p.cur FOR UPDATE;
  v_back := CASE WHEN jsonb_typeof(v_s.spec -> 'back') = 'number' THEN (v_s.spec ->> 'back')::integer END;
  IF v_back IS NOT NULL AND v_back >= 0 AND v_back < v_s.idx THEN
    UPDATE public.mkt_stages
       SET status = 'planned', appr_idx = 0, appr_ok = '{}'::jsonb, pic_ok = NULL, changes = NULL, done_at = NULL,
           late_told_at = NULL
     WHERE project_id = v_p.id AND idx > v_back AND idx <= v_s.idx;
    UPDATE public.mkt_stages
       SET status = 'changes', appr_idx = 0, appr_ok = '{}'::jsonb, pic_ok = NULL, entered_at = now(), done_at = NULL,
           late_told_at = NULL, changes = p_changes || jsonb_build_object('from', v_s.name)
     WHERE project_id = v_p.id AND idx = v_back;
    UPDATE public.mkt_projects SET cur = v_back, updated_at = now() WHERE id = v_p.id;
  ELSE
    UPDATE public.mkt_stages
       SET status = 'changes', appr_idx = 0, appr_ok = '{}'::jsonb, pic_ok = NULL, entered_at = now(), late_told_at = NULL,
           changes = p_changes
     WHERE project_id = v_p.id AND idx = v_s.idx;
    UPDATE public.mkt_projects SET updated_at = now() WHERE id = v_p.id;
  END IF;
  SELECT * INTO v_to FROM public.mkt_stages WHERE project_id = v_p.id
     AND idx = CASE WHEN v_back IS NOT NULL AND v_back >= 0 AND v_back < v_s.idx THEN v_back ELSE v_s.idx END;
  RETURN v_to;
END
$fn$;

-- Submit (production's body, 20261025101000): the first level's people told — each of them, any or all.
CREATE OR REPLACE FUNCTION public.mkt_stage_submit(p_project uuid, p_pick uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me      uuid := public.mkt_me_staff();
  v_p       public.mkt_projects;
  v_s       public.mkt_stages;
  v_next    public.mkt_stages;
  v_missing text[];
  v_first   jsonb;
  v_ver     integer;
  v_lvl     integer := 0;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.edit'], 'Working on a stage is not open to your account.');
  v_p := public.mkt_open_project(p_project);
  SELECT * INTO v_s FROM public.mkt_stages WHERE project_id = v_p.id AND idx = v_p.cur FOR UPDATE;
  IF v_me IS NULL OR v_s.owner_staff IS DISTINCT FROM v_me THEN
    RAISE EXCEPTION 'This stage is not yours.' USING ERRCODE = '42501';
  END IF;
  IF v_s.status NOT IN ('accepted', 'changes') THEN
    RAISE EXCEPTION 'It is with its approver now.' USING ERRCODE = '22023';
  END IF;
  v_missing := public.mkt_stage_missing(v_s.spec, v_s.work);
  IF coalesce(array_length(v_missing, 1), 0) > 0 THEN
    RAISE EXCEPTION 'Fill in %.', array_to_string(v_missing, ', ') USING ERRCODE = '22023';
  END IF;
  -- Its subtasks first (②b-2c): every delivery approved, or the subtask taken back.
  IF EXISTS (SELECT 1 FROM public.mkt_subtasks t WHERE t.project_id = v_p.id AND t.stage_idx = v_s.idx AND t.status <> 'approved') THEN
    RAISE EXCEPTION 'Its subtasks are not all approved yet.' USING ERRCODE = '22023';
  END IF;
  -- The next stage, when it is this stage's owner's to pick (🔓 — the shortlist).
  SELECT * INTO v_next FROM public.mkt_stages WHERE project_id = v_p.id AND idx = v_p.cur + 1 FOR UPDATE;
  IF FOUND AND v_next.mode = 'prev' AND v_next.owner_staff IS NULL THEN
    IF p_pick IS NULL OR NOT (p_pick = ANY (v_next.cands)) THEN
      RAISE EXCEPTION 'Pick who takes % next.', v_next.name USING ERRCODE = '22023';
    END IF;
    UPDATE public.mkt_stages SET owner_staff = p_pick WHERE project_id = v_p.id AND idx = v_next.idx;
    PERFORM public.mkt_log(v_p.id, 'picked', v_next.idx, v_next.name, public.mkt_staff_name(p_pick));
  END IF;
  -- The first level with somebody on it.
  LOOP
    v_first := public.mkt_level_at(v_s.appr, v_lvl);
    EXIT WHEN v_first IS NULL OR jsonb_array_length(v_first -> 'ids') > 0;
    v_lvl := v_lvl + 1;
  END LOOP;
  IF v_first IS NOT NULL THEN
    v_ver := v_s.ver + 1;
    UPDATE public.mkt_stages
       SET status = 'review', ver = v_ver, appr_idx = v_lvl, appr_ok = '{}'::jsonb, pic_ok = NULL, submitted_at = now(),
           changes = NULL
     WHERE project_id = v_p.id AND idx = v_s.idx;
    UPDATE public.mkt_projects SET updated_at = now() WHERE id = v_p.id;
    PERFORM public.mkt_log(v_p.id, 'submitted', v_s.idx, v_s.name, public.mkt_level_names(v_first, v_p.pic_name),
              p_version => 'v' || v_ver);
    PERFORM public.mkt_level_tell(v_p.id, v_first,
              public.mkt_actor() || ' submitted ' || v_s.name || ' v' || v_ver || ' for your approval',
              v_p.track_id || ' · ' || v_p.title, 'review');
  ELSE
    PERFORM public.mkt_log(v_p.id, 'completed', v_s.idx, v_s.name);
    PERFORM public.mkt_advance(v_p.id);
  END IF;
  PERFORM public.mkt_top_up_due();
  RETURN jsonb_build_object('id', v_p.id, 'track', v_p.track_id);
END
$fn$;

-- Decide (production's body, 20261023234000): whoever the level now still waits for; an approval kept, the level on
-- once it passed (any / all); changes back to the stage's `back` (or here), approvals cleared, the clock restarted.
CREATE OR REPLACE FUNCTION public.mkt_stage_decide(p_project uuid, p_approve boolean, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me     uuid := public.mkt_me_staff();
  v_p      public.mkt_projects;
  v_s      public.mkt_stages;
  v_lv     jsonb;
  v_ok     jsonb;
  v_left   text[];
  v_then   jsonb;
  v_to     public.mkt_stages;
  v_reason text := btrim(coalesce(p_reason, ''));
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.approve'], 'Approving is not open to your account.');
  v_p := public.mkt_open_project(p_project);
  SELECT * INTO v_s FROM public.mkt_stages WHERE project_id = v_p.id AND idx = v_p.cur FOR UPDATE;
  IF v_s.status <> 'review' THEN
    RAISE EXCEPTION 'Nothing is waiting for approval on this task.' USING ERRCODE = '22023';
  END IF;
  v_lv := public.mkt_level_at(v_s.appr, v_s.appr_idx);
  IF v_me IS NULL OR NOT (v_me::text = ANY (public.mkt_level_waits(v_lv, v_s.appr_ok))) THEN
    RAISE EXCEPTION 'This approval is not yours.' USING ERRCODE = '42501';
  END IF;
  IF p_approve IS NULL THEN
    RAISE EXCEPTION 'Approve, or request changes.' USING ERRCODE = '22023';
  END IF;
  IF p_approve THEN
    v_ok := coalesce(v_s.appr_ok, '{}'::jsonb) || jsonb_build_object(v_me::text, now());
    v_left := public.mkt_level_waits(v_lv, v_ok);
    v_then := public.mkt_level_at(v_s.appr, v_s.appr_idx + 1);
    PERFORM public.mkt_log(v_p.id, 'approved', v_s.idx, v_s.name,
              CASE WHEN cardinality(v_left) = 0 AND v_then IS NOT NULL THEN public.mkt_level_names(v_then, v_p.pic_name) END,
              p_version => 'v' || v_s.ver,
              p_data => CASE WHEN cardinality(v_left) > 0
                             THEN jsonb_build_object('level', v_s.appr_idx + 1, 'waiting',
                                    public.mkt_level_names(jsonb_build_object('ids', to_jsonb(v_left), 'rule', 'all'), v_p.pic_name))
                             ELSE jsonb_build_object('level', v_s.appr_idx + 1) END);
    PERFORM public.mkt_level_ok(v_p.id, v_me::text);
  ELSE
    IF length(v_reason) NOT BETWEEN 1 AND 1000 THEN
      RAISE EXCEPTION 'Say what to change (at most 1,000 characters).' USING ERRCODE = '22023';
    END IF;
    v_to := public.mkt_stage_back(v_p.id, jsonb_build_object('by', public.mkt_actor(), 'staff', v_me, 'reason', v_reason,
                                                              'at', now(), 'ver', v_s.ver));
    IF v_to.idx < v_s.idx THEN
      PERFORM public.mkt_log(v_p.id, 'changes', v_s.idx, v_s.name, public.mkt_staff_name(v_to.owner_staff), v_reason,
                             'v' || v_s.ver, jsonb_build_object('back', v_to.idx, 'to', v_to.name));
      PERFORM public.mkt_notify(v_to.owner_staff, v_p.id, 'Changes requested on ' || v_s.name || ' — back to ' || v_to.name,
                                '"' || v_reason || '"', 'changes');
    ELSE
      PERFORM public.mkt_log(v_p.id, 'changes', v_s.idx, v_s.name, public.mkt_staff_name(v_s.owner_staff), v_reason,
                             'v' || v_s.ver);
      PERFORM public.mkt_notify(v_s.owner_staff, v_p.id, 'Changes requested on ' || v_s.name, '"' || v_reason || '"', 'changes');
    END IF;
  END IF;
  PERFORM public.mkt_top_up_due();
  RETURN jsonb_build_object('id', v_p.id, 'track', v_p.track_id);
END
$fn$;

-- The stage now done (production's body, 20261025037000): +10 / +20 XP to its doer as before; the next stage opened —
-- its doer's to work at once, told with its due day; the last one: the task done, +60 XP to everybody on it, the
-- version's finish.notify told.
CREATE OR REPLACE FUNCTION public.mkt_advance(p_project uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_p    public.mkt_projects;
  v_next public.mkt_stages;
  v_fin  jsonb;
  v_who  uuid;
  v_n    integer := 0;
BEGIN
  SELECT * INTO v_p FROM public.mkt_projects WHERE id = p_project FOR UPDATE;
  UPDATE public.mkt_stages SET status = 'done', done_at = now(), appr_idx = 0
   WHERE project_id = v_p.id AND idx = v_p.cur;
  -- The pet's XP (⑦-5 — the user's answer 32): whoever did the stage, +10 — +20 a product project's (or a deliverable's) —
  -- and a snack; once a stage and person, nothing taken back.
  INSERT INTO public.mkt_pet_log (staff, kind, xp, snacks, project_id, stage_idx)
  SELECT s.owner_staff, 'stage', CASE WHEN v_p.kind IN ('product', 'deliverable') THEN 20 ELSE 10 END, 1, v_p.id, s.idx
    FROM public.mkt_stages s
   WHERE s.project_id = v_p.id AND s.idx = v_p.cur AND s.owner_staff IS NOT NULL
  ON CONFLICT DO NOTHING;
  SELECT * INTO v_next FROM public.mkt_stages WHERE project_id = v_p.id AND idx = v_p.cur + 1;
  IF NOT FOUND THEN
    UPDATE public.mkt_projects SET status = 'done', done_at = now(), updated_at = now() WHERE id = v_p.id;
    -- Done (the handoff's celebration: "{team} each get +60 XP"): everybody on the task — each stage's doer and the
    -- staff approving it — once a task and person.
    INSERT INTO public.mkt_pet_log (staff, kind, xp, project_id)
    SELECT DISTINCT w.who, 'done', 60, v_p.id
      FROM (SELECT s.owner_staff AS who FROM public.mkt_stages s WHERE s.project_id = v_p.id AND s.owner_staff IS NOT NULL
            UNION
            SELECT a.who FROM public.mkt_stages s, public.mkt_appr_people(s.appr) a WHERE s.project_id = v_p.id) w
     WHERE EXISTS (SELECT 1 FROM public.hr_staff_costs h WHERE h.id = w.who)
    ON CONFLICT DO NOTHING;
    -- Told, as the version's 🏁 Task done says: everybody on it, Marketing's managers, whoever asked for it (its owner);
    -- the PIC reads it on the link (finish.picText) — nothing to send them.
    v_fin := v_p.finish;
    IF jsonb_typeof(v_fin) = 'object' AND jsonb_typeof(v_fin -> 'notify') = 'array' THEN
      FOR v_who IN
        SELECT DISTINCT x.who FROM (
          SELECT s.owner_staff AS who FROM public.mkt_stages s
           WHERE v_fin -> 'notify' ? 'all' AND s.project_id = v_p.id AND s.owner_staff IS NOT NULL
          UNION
          SELECT a.who FROM public.mkt_stages s, public.mkt_appr_people(s.appr) a
           WHERE v_fin -> 'notify' ? 'all' AND s.project_id = v_p.id
          UNION
          SELECT v_p.owner_staff WHERE (v_fin -> 'notify' ? 'all' OR v_fin -> 'notify' ? 'req') AND v_p.owner_staff IS NOT NULL
          UNION
          SELECT r.staff_id FROM public.mkt_roster() r
           WHERE v_fin -> 'notify' ? 'mm' AND upper(coalesce(r.title, '')) LIKE '%MARKETING MANAGER%') x
         WHERE x.who IS NOT NULL
      LOOP
        CONTINUE WHEN v_who IS NOT DISTINCT FROM public.mkt_me_staff();
        PERFORM public.mkt_notify(v_who, v_p.id, left('🏁 Done: ' || v_p.title, 200), v_p.track_id || ' · ' || v_p.title, 'done');
        v_n := v_n + 1;
      END LOOP;
    END IF;
    PERFORM public.mkt_log(v_p.id, 'closed', p_data => jsonb_build_object('xp', 60, 'told', v_n));
    IF v_p.series_id IS NOT NULL THEN
      PERFORM public.mkt_series_settle(v_p.series_id);
    END IF;
    -- A deliverable done: its product project is, once its last one is (②b-2a).
    IF v_p.parent_id IS NOT NULL THEN
      PERFORM public.mkt_product_settle(v_p.parent_id);
    END IF;
    RETURN;
  END IF;
  UPDATE public.mkt_projects SET cur = v_next.idx, updated_at = now() WHERE id = v_p.id;
  UPDATE public.mkt_stages
     SET status = 'accepted', entered_at = now(), accepted_at = now(), appr_idx = 0, appr_ok = '{}'::jsonb, pic_ok = NULL,
         changes = NULL, late_told_at = NULL
   WHERE project_id = v_p.id AND idx = v_next.idx;
  PERFORM public.mkt_log(v_p.id, 'opened', v_next.idx, v_next.name, public.mkt_staff_name(v_next.owner_staff));
  IF v_next.owner_staff IS NOT NULL THEN
    PERFORM public.mkt_notify(v_next.owner_staff, v_p.id,
              'Your turn: ' || v_next.name || coalesce(', due ' || to_char(v_next.due_on, 'FMDD Mon'), ''),
              v_p.track_id || ' · ' || v_p.title, 'open');
  END IF;
END
$fn$;

-- The PIC answers on the link (production's body, 20261025235000): a 'pic' id inside any level — waited for while the
-- level still waits for it; two PICs on a level asking both keep the first's approval (pic_ok) until the other's.
CREATE OR REPLACE FUNCTION public.mkt_pic_stage_answer(p_code text, p_project uuid, p_version integer, p_decision text,
  p_name text DEFAULT NULL, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_code   text := lower(btrim(coalesce(p_code, '')));
  v_parent public.mkt_projects;
  v_p      public.mkt_projects;
  v_s      public.mkt_stages;
  v_lv     jsonb;
  v_then   jsonb;
  v_left   text[];
  v_to     public.mkt_stages;
  v_name   text := btrim(coalesce(p_name, ''));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_who    text;
  v_you    integer;
  v_ok     jsonb;
  v_other  text;
BEGIN
  IF v_code !~ '^[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'This link is closed.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_parent FROM public.mkt_projects
   WHERE (link_code = v_code OR (link2_code = v_code AND nullif(btrim(coalesce(pic2_name, '')), '') IS NOT NULL))
     AND (kind = 'product' OR (kind IN ('quick', 'recurring') AND series_id IS NULL)) AND status NOT IN ('minutes', 'cancelled');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This link is closed.' USING ERRCODE = '22023';
  END IF;
  v_you := CASE WHEN v_parent.link_code = v_code THEN 1 ELSE 2 END;
  -- The work the link follows (mkt_pic_work): a product project's deliverables — a task itself, a series' runs (②a-5).
  SELECT * INTO v_p FROM public.mkt_projects WHERE id = p_project AND id IN (SELECT w FROM public.mkt_pic_work(v_parent.id) w) FOR UPDATE;
  IF NOT FOUND OR v_p.status <> 'active' THEN
    RAISE EXCEPTION 'Nothing is waiting for your approval on it now.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_s FROM public.mkt_stages WHERE project_id = v_p.id AND idx = v_p.cur FOR UPDATE;
  IF NOT FOUND OR v_s.status <> 'review' OR NOT ('pic' = ANY (public.mkt_stage_waits(v_s.appr, v_s.appr_idx, v_s.appr_ok))) THEN
    RAISE EXCEPTION 'Nothing is waiting for your approval on it now.' USING ERRCODE = '22023';
  END IF;
  IF p_version IS DISTINCT FROM v_s.ver THEN
    RAISE EXCEPTION 'The team sent a newer version since you opened this page — reload it to see.' USING ERRCODE = '22023';
  END IF;
  v_lv := public.mkt_level_at(v_s.appr, v_s.appr_idx);

  IF p_decision = 'approve' THEN
    IF length(v_name) NOT BETWEEN 3 AND 80 THEN
      RAISE EXCEPTION 'Type your full name to sign off.' USING ERRCODE = '22023';
    END IF;
    v_who := left(v_name || ' (PIC)', 120);
    -- A level that asks both PICs, on a project with two (②b-2d-2b): the first approval is kept for this version at this
    -- level, and the stage waits for the other's.
    IF coalesce(v_lv ->> 'picAll' = 'true', false) AND nullif(btrim(coalesce(v_parent.pic2_name, '')), '') IS NOT NULL THEN
      v_ok := CASE WHEN v_s.pic_ok ->> 'ver' = v_s.ver::text AND v_s.pic_ok ->> 'lvl' = v_s.appr_idx::text THEN v_s.pic_ok
                   ELSE jsonb_build_object('ver', v_s.ver, 'lvl', v_s.appr_idx) END;
      v_other := CASE v_you WHEN 1 THEN v_parent.pic2_name ELSE v_parent.pic_name END;
      IF v_ok ? v_you::text THEN
        RAISE EXCEPTION 'You approved this version already — it waits for %.', v_other USING ERRCODE = '22023';
      END IF;
      v_ok := v_ok || jsonb_build_object(v_you::text, jsonb_build_object('name', v_name, 'at', now()));
      UPDATE public.mkt_stages SET pic_ok = v_ok WHERE project_id = v_p.id AND idx = v_s.idx;
      IF NOT (v_ok ? (3 - v_you)::text) THEN
        INSERT INTO public.mkt_events (project_id, actor_user, actor_name, action, stage_idx, stage_name, from_to, version, data)
        VALUES (v_p.id, NULL, v_who, 'pic approved', v_s.idx, left(v_s.name, 80), left(v_other || ' (PIC)', 120), 'v' || v_s.ver,
                jsonb_build_object('pic', v_you, 'waiting', v_other));
        UPDATE public.mkt_projects SET updated_at = now() WHERE id = v_p.id;
        PERFORM public.mkt_notify(v_s.owner_staff, v_p.id, left(v_name || ' (PIC) approved ' || v_s.name || ' — waiting for ' || v_other, 200),
                  v_p.track_id || ' · ' || v_p.title, 'pic_approved');
        RETURN public.mkt_pic_page(v_code);
      END IF;
    END IF;
    v_left := public.mkt_level_waits(v_lv, coalesce(v_s.appr_ok, '{}'::jsonb) || jsonb_build_object('pic', now()));
    v_then := public.mkt_level_at(v_s.appr, v_s.appr_idx + 1);
    INSERT INTO public.mkt_events (project_id, actor_user, actor_name, action, stage_idx, stage_name, from_to, version, data)
    VALUES (v_p.id, NULL, v_who, 'pic approved', v_s.idx, left(v_s.name, 80),
            CASE WHEN cardinality(v_left) > 0 OR v_then IS NULL THEN NULL ELSE public.mkt_level_names(v_then, v_parent.pic_name) END,
            'v' || v_s.ver,
            jsonb_build_object('pic', v_you)
              || CASE WHEN cardinality(v_left) > 0
                      THEN jsonb_build_object('waiting', public.mkt_level_names(jsonb_build_object('ids', to_jsonb(v_left), 'rule', 'all'), v_parent.pic_name))
                      ELSE '{}'::jsonb END);
    PERFORM public.mkt_level_ok(v_p.id, 'pic');
    PERFORM public.mkt_notify(v_s.owner_staff, v_p.id, left(v_name || ' (PIC) approved ' || v_s.name, 200),
              v_p.track_id || ' · ' || v_p.title, 'pic_approved');
  ELSIF p_decision = 'changes' THEN
    IF length(v_reason) NOT BETWEEN 5 AND 1000 THEN
      RAISE EXCEPTION 'Say what should change — 5 to 1,000 characters.' USING ERRCODE = '22023';
    END IF;
    v_who := left(coalesce(nullif(left(v_name, 80), ''),
                           nullif(btrim(CASE v_you WHEN 2 THEN v_parent.pic2_name ELSE v_parent.pic_name END), ''), 'The PIC')
                  || ' (PIC)', 120);
    v_to := public.mkt_stage_back(v_p.id, jsonb_build_object('by', v_who, 'staff', NULL, 'reason', v_reason, 'at', now(),
                                                              'ver', v_s.ver));
    IF v_to.idx < v_s.idx THEN
      INSERT INTO public.mkt_events (project_id, actor_user, actor_name, action, stage_idx, stage_name, from_to, reason, version, data)
      VALUES (v_p.id, NULL, v_who, 'pic changes', v_s.idx, left(v_s.name, 80), public.mkt_staff_name(v_to.owner_staff), v_reason,
              'v' || v_s.ver, jsonb_build_object('back', v_to.idx, 'to', v_to.name, 'pic', v_you));
      PERFORM public.mkt_notify(v_to.owner_staff, v_p.id, 'Changes requested on ' || v_s.name || ' — back to ' || v_to.name,
                '"' || v_reason || '"', 'changes');
    ELSE
      INSERT INTO public.mkt_events (project_id, actor_user, actor_name, action, stage_idx, stage_name, from_to, reason, version, data)
      VALUES (v_p.id, NULL, v_who, 'pic changes', v_s.idx, left(v_s.name, 80), public.mkt_staff_name(v_s.owner_staff), v_reason,
              'v' || v_s.ver, jsonb_build_object('pic', v_you));
      PERFORM public.mkt_notify(v_s.owner_staff, v_p.id, 'Changes requested on ' || v_s.name, '"' || v_reason || '"', 'changes');
    END IF;
  ELSE
    RAISE EXCEPTION 'Approve, or say what should change.' USING ERRCODE = '22023';
  END IF;
  -- The deliverable's owner hears it too, when it is somebody else.
  IF v_p.owner_staff IS DISTINCT FROM v_s.owner_staff THEN
    PERFORM public.mkt_notify(v_p.owner_staff, v_p.id,
              left(CASE WHEN p_decision = 'approve' THEN v_name || ' (PIC) approved ' ELSE v_who || ' asked for changes on ' END || v_s.name, 200),
              v_p.track_id || ' · ' || v_p.title, CASE WHEN p_decision = 'approve' THEN 'pic_approved' ELSE 'pic_changes' END);
  END IF;
  RETURN public.mkt_pic_page(v_code);
END
$fn$;

-- ── A product project's work starts (production's body, 20261025131000) ──────────────────────────────────────────────
-- Each deliverable's stages from its action's workflow version, in either shape: the version's levels (an 'assign'
-- id waits for the plan), its group key; the stage's fields = the canvas's fields this stage fills in (by its `sid` —
-- or, a version before 2a, by its index — each with its section's title, its ⭐ and 👁 with the section's: required when
-- either is, shown to the PIC when both are), a table's columns with their own stage / ⭐ / 👁. The version's overdue
-- and finish copied onto each deliverable — a version published later never changes it.
CREATE OR REPLACE FUNCTION public.mkt_product_begin(p_project uuid, p_run_day integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_p     public.mkt_projects;
  v_pv    public.mkt_product_versions;
  v_g     jsonb;
  v_it    jsonb;
  v_qty   integer;
  v_wv    public.mkt_workflow_versions;
  v_w     public.mkt_workflows;
  v_total integer;
  v_n     integer := 0;
  v_id    uuid;
  k       integer;
  v_run   integer;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'Starting the work is the manager''s.');
  SELECT * INTO v_p FROM public.mkt_projects WHERE id = p_project FOR UPDATE;
  IF NOT FOUND OR v_p.kind <> 'product' THEN
    RAISE EXCEPTION 'That project is not there.' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (SELECT 1 FROM public.mkt_projects d WHERE d.parent_id = v_p.id) THEN
    RAISE EXCEPTION 'Its work has started already.' USING ERRCODE = '22023';
  END IF;
  IF NOT (v_p.status = 'approved' OR (v_p.status IN ('waiting_pic', 'changes') AND v_p.override IS NOT NULL)) THEN
    RAISE EXCEPTION 'The work starts once the PIC approves the minutes — or once it is started before approval.'
      USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_pv FROM public.mkt_product_versions WHERE product_id = v_p.product_id AND version = v_p.product_version;
  -- A recurring one runs every month on its run day (②b-2f — the user's answer 12): the one asked, else today's (the
  -- 28th at most, so every month has it).
  IF v_pv.kind = 'recurring' THEN
    v_run := coalesce(p_run_day, least(extract(day FROM (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)::integer, 28));
    IF v_run NOT BETWEEN 1 AND 28 THEN
      RAISE EXCEPTION 'Pick a run day from the 1st to the 28th.' USING ERRCODE = '22023';
    END IF;
  END IF;
  v_total := coalesce((SELECT sum((it ->> 'qty')::integer)
                         FROM jsonb_array_elements(v_pv.groups) g, jsonb_array_elements(coalesce(g -> 'items', '[]'::jsonb)) it
                        WHERE coalesce(it ->> 'qty', '') ~ '^[0-9]{1,3}$'), 0);
  IF v_total = 0 THEN
    RAISE EXCEPTION 'The product includes nothing to make.' USING ERRCODE = '22023';
  END IF;
  IF v_total > 300 THEN
    RAISE EXCEPTION 'A product project makes at most 300 deliverables (this product %).', v_total USING ERRCODE = '22023';
  END IF;
  FOR v_g IN SELECT x FROM jsonb_array_elements(v_pv.groups) x LOOP
    FOR v_it IN SELECT x FROM jsonb_array_elements(coalesce(v_g -> 'items', '[]'::jsonb)) x LOOP
      v_qty := CASE WHEN coalesce(v_it ->> 'qty', '') ~ '^[0-9]{1,3}$' THEN (v_it ->> 'qty')::integer ELSE 0 END;
      CONTINUE WHEN v_qty = 0;
      SELECT * INTO v_wv FROM public.mkt_workflow_versions
       WHERE workflow_id = (v_it ->> 'workflow')::uuid AND version = (v_it ->> 'workflowVersion')::integer;
      IF NOT FOUND THEN
        RAISE EXCEPTION '"%": its workflow is not there.', v_it ->> 'name' USING ERRCODE = '22023';
      END IF;
      SELECT * INTO v_w FROM public.mkt_workflows WHERE id = v_wv.workflow_id;
      FOR k IN 1 .. v_qty LOOP
        v_n := v_n + 1;
        INSERT INTO public.mkt_projects (track_id, kind, subsidiary_id, title, status, product_id, product_version,
                                         workflow_id, workflow_version, workflow_name, owner_staff, pic_name, pic_whatsapp,
                                         pic2_name, pic2_whatsapp, parent_id, deliv, canvas_def, overdue, finish, created_by)
        VALUES (v_p.track_id || '-D' || lpad(v_n::text, CASE WHEN v_total >= 100 THEN 3 ELSE 2 END, '0'), 'deliverable',
                v_p.subsidiary_id,
                left(btrim(v_it ->> 'name') || CASE WHEN v_qty > 1 THEN ' ' || k || '/' || v_qty ELSE '' END, 140),
                'planning', v_p.product_id, v_p.product_version, v_wv.workflow_id, v_wv.version,
                left(v_w.action || ' · ' || v_w.tname, 120), v_p.owner_staff, v_p.pic_name, v_p.pic_whatsapp,
                v_p.pic2_name, v_p.pic2_whatsapp, v_p.id,
                jsonb_build_object('group', btrim(coalesce(v_g ->> 'name', '')), 'item', btrim(v_it ->> 'name'),
                                   'n', k, 'of', v_qty)
                  || CASE WHEN v_pv.kind = 'recurring' THEN '{"run": 1}'::jsonb ELSE '{}'::jsonb END,
                v_wv.canvas,
                CASE WHEN jsonb_typeof(v_wv.overdue) = 'object' THEN v_wv.overdue END,
                CASE WHEN jsonb_typeof(v_wv.finish) = 'object' THEN v_wv.finish END,
                auth.uid())
        RETURNING id INTO v_id;
        INSERT INTO public.mkt_stages (project_id, idx, name, dept, mode, cands, sla, appr, split, spec, status)
        SELECT v_id, (x.n - 1)::integer, x.st ->> 'name', coalesce(x.st ->> 'dept', ''),
               CASE WHEN v_wv.locked OR x.n = 1 OR x.st -> 'who' ->> 'mode' IS DISTINCT FROM 'prev' THEN 'assign' ELSE 'prev' END,
               ARRAY(SELECT c::uuid FROM jsonb_array_elements_text(coalesce(x.st -> 'who' -> 'cands', '[]'::jsonb)) c),
               (x.st ->> 'sla')::integer, coalesce(x.st -> 'appr', '[]'::jsonb),
               coalesce((x.st ->> 'split')::boolean, false) AND NOT v_wv.locked,
               jsonb_strip_nulls(jsonb_build_object(
                 'sid', x.st ->> 'sid',
                 'form', coalesce(x.st -> 'form', '[]'::jsonb) || coalesce((
                           SELECT jsonb_agg(sf.f || jsonb_build_object(
                                    'section', coalesce(nullif(sc.sec ->> 'id', ''), sc.sec ->> 'title'),
                                    'sectionTitle', sc.sec ->> 'title',
                                    'req', sf.f ->> 'type' <> 'Note'
                                           AND (coalesce(sf.f ->> 'req', 'true') <> 'false' OR coalesce(sc.sec ->> 'req', 'false') = 'true'),
                                    'pic', coalesce(sf.f ->> 'pic', 'true') <> 'false' AND coalesce(sc.sec ->> 'pic', 'true') <> 'false')
                                  ORDER BY sc.so, sf.fo)
                             FROM jsonb_array_elements(coalesce(v_wv.canvas -> 'sections', '[]'::jsonb)) WITH ORDINALITY AS sc(sec, so),
                                  jsonb_array_elements(coalesce(sc.sec -> 'fields', '[]'::jsonb)) WITH ORDINALITY AS sf(f, fo)
                            WHERE (x.st ? 'sid' AND sf.f ->> 'stage' = x.st ->> 'sid')
                               OR (NOT (x.st ? 'sid') AND coalesce(sf.f ->> 'stage', '') ~ '^[0-9]{1,2}$'
                                   AND (sf.f ->> 'stage')::integer = x.n - 1)), '[]'::jsonb),
                 'back', x.st -> 'back', 'sec', x.st -> 'sec', 'picText', nullif(x.st ->> 'picText', ''))),
               'planned'
          FROM jsonb_array_elements(v_wv.stages) WITH ORDINALITY AS x(st, n);
      END LOOP;
    END LOOP;
  END LOOP;
  -- A recurring one is billed from this month (②b-2b — the user's answer 51).
  UPDATE public.mkt_projects SET status = 'active', updated_at = now(),
                                 bill_from = CASE WHEN v_pv.kind = 'recurring' THEN (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date - (extract(day FROM (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)::integer - 1) END,
                                 run_day = CASE WHEN v_pv.kind = 'recurring' THEN v_run END
   WHERE id = v_p.id;
  PERFORM public.mkt_log(v_p.id, 'work started', p_data => jsonb_build_object('deliverables', v_n)
            || CASE WHEN v_run IS NOT NULL THEN jsonb_build_object('runDay', v_run) ELSE '{}'::jsonb END);
  RETURN jsonb_build_object('id', v_p.id, 'track', v_p.track_id, 'deliverables', v_n);
END
$fn$;

-- ── A deliverable's plan (production's body, 20261025181000) ─────────────────────────────────────────────────────────
-- Levels of several people, any or all (mkt_levels_check — an 'assign' id must be a person by now); compared in their
-- normal shape, so a stage planned before 2a stays "as it was"; everybody on a level told once.
CREATE OR REPLACE FUNCTION public.mkt_deliverable_plan(p_project uuid, p_plan jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_today  date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_me     uuid := public.mkt_me_staff();
  v_uuid   text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_roster uuid[] := ARRAY(SELECT r.staff_id FROM public.mkt_roster() r);
  v_p      public.mkt_projects;
  v_parent public.mkt_projects;
  v_locked boolean;
  v_n      integer;
  v_open   boolean;
  v_start  date;
  v_at     timestamptz;
  v_st     jsonb;
  v_s      public.mkt_stages;
  v_owner  uuid;
  v_appr   jsonb;
  v_was    jsonb;
  v_sla    integer;
  v_split  boolean;
  v_reason text;
  v_rows   jsonb := '[]'::jsonb;
  v_hands  integer := 0;
  v_other  integer := 0;
  i        integer;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'Planning the work is the manager''s.');
  SELECT * INTO v_p FROM public.mkt_projects WHERE id = p_project FOR UPDATE;
  IF NOT FOUND OR v_p.kind <> 'deliverable' THEN
    RAISE EXCEPTION 'That deliverable is not there.' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_parent FROM public.mkt_projects WHERE id = v_p.parent_id;
  -- Paused (②b-2g), the work made carries on: planned too.
  IF v_parent.status NOT IN ('active', 'paused') THEN
    RAISE EXCEPTION 'Its product project is not running (%).', v_parent.status USING ERRCODE = '22023';
  END IF;
  IF v_p.status NOT IN ('planning', 'active') THEN
    RAISE EXCEPTION 'This deliverable is %.', v_p.status USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_plan) IS DISTINCT FROM 'object' OR jsonb_typeof(p_plan -> 'stages') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Not a plan.' USING ERRCODE = '22023';
  END IF;
  v_locked := coalesce((SELECT wv.locked FROM public.mkt_workflow_versions wv
                         WHERE wv.workflow_id = v_p.workflow_id AND wv.version = v_p.workflow_version), false);
  v_n := (SELECT count(*) FROM public.mkt_stages s WHERE s.project_id = v_p.id);
  IF jsonb_array_length(p_plan -> 'stages') <> v_n THEN
    RAISE EXCEPTION 'The plan names % stages; this deliverable has %.', jsonb_array_length(p_plan -> 'stages'), v_n
      USING ERRCODE = '22023';
  END IF;
  -- Open: its start day has come — stage 1 is on somebody's plate. Its start day stays then.
  v_open := v_p.status = 'active' AND v_p.starts_on <= v_today;
  IF v_open THEN
    v_start := v_p.starts_on;
    IF coalesce(p_plan ->> 'start', v_start::text) <> v_start::text THEN
      RAISE EXCEPTION 'It has opened — its start day stays %.', to_char(v_start, 'FMDD Mon') USING ERRCODE = '22023';
    END IF;
  ELSE
    IF coalesce(p_plan ->> 'start', '') !~ '^\d{4}-\d{2}-\d{2}$' THEN
      RAISE EXCEPTION 'Pick the day it starts.' USING ERRCODE = '22023';
    END IF;
    v_start := (p_plan ->> 'start')::date;
    IF v_start < v_today THEN
      RAISE EXCEPTION 'Pick the day it starts — today or later.' USING ERRCODE = '22023';
    END IF;
    IF v_start > v_today + 400 THEN
      RAISE EXCEPTION 'Pick a start day within the next 400 days.' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Each stage, checked.
  FOR i IN 0 .. v_n - 1 LOOP
    v_st := p_plan -> 'stages' -> i;
    SELECT * INTO v_s FROM public.mkt_stages WHERE project_id = v_p.id AND idx = i FOR UPDATE;
    IF jsonb_typeof(v_st) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Stage % (%): not a stage.', i + 1, v_s.name USING ERRCODE = '22023';
    END IF;
    IF coalesce(v_st ->> 'owner', '') = '' THEN
      IF v_s.mode <> 'prev' OR v_locked OR i = 0 THEN
        RAISE EXCEPTION 'Stage % (%): choose someone.', i + 1, v_s.name USING ERRCODE = '22023';
      END IF;
      v_owner := NULL;
    ELSIF (v_st ->> 'owner') !~ v_uuid OR NOT ((v_st ->> 'owner')::uuid = ANY (v_roster)) THEN
      RAISE EXCEPTION 'Stage % (%): pick a person on Marketing''s team.', i + 1, v_s.name USING ERRCODE = '22023';
    ELSE
      v_owner := (v_st ->> 'owner')::uuid;
    END IF;
    v_appr := public.mkt_levels_check(v_st -> 'appr', v_roster, format('Stage %s (%s)', i + 1, v_s.name), true);
    v_was := public.mkt_levels_norm(v_s.appr);
    v_sla := CASE WHEN coalesce(v_st ->> 'sla', '') ~ '^[0-9]{1,3}$' THEN (v_st ->> 'sla')::integer END;
    IF v_sla IS NULL OR v_sla NOT BETWEEN 1 AND 30 THEN
      RAISE EXCEPTION 'Stage % (%): 1 to 30 working days.', i + 1, v_s.name USING ERRCODE = '22023';
    END IF;
    v_split := coalesce(v_st ->> 'split', 'false') = 'true' AND NOT v_locked;
    v_reason := nullif(btrim(coalesce(p_plan -> 'reasons' ->> i::text, '')), '');
    IF v_open THEN
      -- What is done stays; the stage waiting for its approval keeps its people; a stage begun keeps its days; a stage
      -- that changes hands says why.
      IF v_s.status = 'done' THEN
        IF v_owner IS DISTINCT FROM v_s.owner_staff OR v_appr <> v_was OR v_sla <> v_s.sla OR v_split <> v_s.split THEN
          RAISE EXCEPTION 'Stage % (%) is done — it stays as it was.', i + 1, v_s.name USING ERRCODE = '22023';
        END IF;
      ELSE
        IF v_s.status = 'review' AND (v_owner IS DISTINCT FROM v_s.owner_staff OR v_appr <> v_was) THEN
          RAISE EXCEPTION 'Stage % (%) waits for its approval — change it after.', i + 1, v_s.name USING ERRCODE = '22023';
        END IF;
        IF v_s.status <> 'planned' AND v_sla <> v_s.sla THEN
          RAISE EXCEPTION 'Stage % (%) has begun — its working days stay.', i + 1, v_s.name USING ERRCODE = '22023';
        END IF;
        IF v_owner IS DISTINCT FROM v_s.owner_staff AND v_s.owner_staff IS NOT NULL
           AND length(coalesce(v_reason, '')) NOT BETWEEN 5 AND 300 THEN
          RAISE EXCEPTION 'Stage % (%): say why it changes hands — 5 to 300 characters.', i + 1, v_s.name USING ERRCODE = '22023';
        END IF;
      END IF;
    END IF;
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
                'idx', i, 'name', v_s.name, 'status', v_s.status, 'was', v_s.owner_staff, 'owner', v_owner,
                'extra', nullif(left(btrim(coalesce(v_st ->> 'extra', '')), 40), ''), 'appr', v_appr, 'sla', v_sla,
                'split', v_split, 'reason', v_reason,
                'other', v_appr <> v_was OR v_sla <> v_s.sla OR v_split <> v_s.split));
  END LOOP;

  -- Written: what is not done; then the dates — from the start day, each stage its working days, Monday to Friday
  -- (a stage begun keeps its own).
  UPDATE public.mkt_stages s
     SET owner_staff = (r ->> 'owner')::uuid, extra = r ->> 'extra', appr = r -> 'appr', sla = (r ->> 'sla')::integer,
         split = (r ->> 'split')::boolean
    FROM jsonb_array_elements(v_rows) r
   WHERE s.project_id = v_p.id AND s.idx = (r ->> 'idx')::integer AND s.status <> 'done';
  UPDATE public.mkt_stages s SET starts_on = d.starts_on, due_on = d.due_on
    FROM public.mkt_stage_dates(v_start, ARRAY(SELECT x.sla FROM public.mkt_stages x WHERE x.project_id = v_p.id ORDER BY x.idx)) d
   WHERE s.project_id = v_p.id AND s.idx = d.idx AND (NOT v_open OR s.status = 'planned');

  IF NOT v_open THEN
    -- Stage 1 opens on the start day — its person's to work then (no Accept).
    v_at := CASE WHEN v_start <= v_today THEN now() ELSE v_start::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur' END;
    UPDATE public.mkt_stages
       SET status = 'planned', entered_at = NULL, accepted_at = NULL, appr_idx = 0, appr_ok = '{}'::jsonb, changes = NULL
     WHERE project_id = v_p.id AND idx > 0;
    UPDATE public.mkt_stages
       SET status = 'accepted', entered_at = v_at, accepted_at = v_at, appr_idx = 0, appr_ok = '{}'::jsonb, changes = NULL
     WHERE project_id = v_p.id AND idx = 0;
    UPDATE public.mkt_projects
       SET status = 'active', cur = 0, starts_on = v_start,
           due_on = (SELECT max(s.due_on) FROM public.mkt_stages s WHERE s.project_id = v_p.id), updated_at = now()
     WHERE id = v_p.id;
    PERFORM public.mkt_log(v_p.id, CASE WHEN v_p.status = 'planning' THEN 'planned' ELSE 'replanned' END,
              p_data => jsonb_build_object('start', v_start));
    -- Everybody on it hears, once, at the first stage they are on — doing it or approving it.
    PERFORM public.mkt_notify(o.who, v_p.id,
              CASE WHEN v_p.status = 'planning' THEN 'You''re on the plan for "' ELSE 'The plan changed for "' END
                || v_p.title || '"',
              v_p.track_id || ' · Stage ' || (o.idx + 1) || ' · ' || o.name || ' · starts ' || to_char(o.starts, 'FMDD Mon'),
              'task')
       FROM (SELECT DISTINCT ON (w.who) w.who, w.idx, w.name, w.starts
               FROM (SELECT s.owner_staff AS who, s.idx, s.name, s.starts_on AS starts
                       FROM public.mkt_stages s WHERE s.project_id = v_p.id AND s.owner_staff IS NOT NULL
                     UNION ALL
                     SELECT a.who, s.idx, s.name, s.starts_on
                       FROM public.mkt_stages s, public.mkt_appr_people(s.appr) a
                      WHERE s.project_id = v_p.id) w
              ORDER BY w.who, w.idx) o
      WHERE o.who IS DISTINCT FROM v_me;
  ELSE
    -- Mid-way: each change of hands logged with its reason; the stage now open is the new person's (its clock again).
    FOR v_st IN SELECT x FROM jsonb_array_elements(v_rows) x WHERE x ->> 'status' <> 'done' LOOP
      i := (v_st ->> 'idx')::integer;
      IF (v_st ->> 'other')::boolean THEN
        v_other := v_other + 1;
      END IF;
      CONTINUE WHEN (v_st ->> 'owner') IS NOT DISTINCT FROM (v_st ->> 'was');
      v_hands := v_hands + 1;
      PERFORM public.mkt_log(v_p.id, 'reassigned', i, v_st ->> 'name',
                coalesce(public.mkt_staff_name((v_st ->> 'was')::uuid), 'Picked by the stage before') || ' → '
                  || coalesce(public.mkt_staff_name((v_st ->> 'owner')::uuid), 'Picked by the stage before'),
                v_st ->> 'reason');
      IF i = v_p.cur AND v_st ->> 'status' IN ('todo', 'accepted') THEN
        UPDATE public.mkt_stages SET status = 'accepted', entered_at = now(), accepted_at = now(), late_told_at = NULL
         WHERE project_id = v_p.id AND idx = i;
      END IF;
      IF (v_st ->> 'owner') IS NOT NULL THEN
        PERFORM public.mkt_notify((v_st ->> 'owner')::uuid, v_p.id,
                  CASE WHEN i = v_p.cur THEN 'Your turn: ' ELSE 'You''re on the plan: ' END || (v_st ->> 'name'),
                  v_p.track_id || ' · ' || v_p.title || coalesce(' — "' || (v_st ->> 'reason') || '"', ''),
                  CASE WHEN i = v_p.cur THEN 'open' ELSE 'task' END);
      END IF;
      IF (v_st ->> 'was') IS NOT NULL THEN
        PERFORM public.mkt_notify((v_st ->> 'was')::uuid, v_p.id,
                  (v_st ->> 'name') || ' of "' || v_p.title || '" moved to '
                    || coalesce(public.mkt_staff_name((v_st ->> 'owner')::uuid), 'the stage before''s pick'),
                  coalesce('"' || (v_st ->> 'reason') || '"', ''), 'task');
      END IF;
    END LOOP;
    IF v_other > 0 THEN
      PERFORM public.mkt_log(v_p.id, 'plan changed', p_data => jsonb_build_object('stages', v_other));
    END IF;
    UPDATE public.mkt_projects
       SET due_on = (SELECT max(s.due_on) FROM public.mkt_stages s WHERE s.project_id = v_p.id), updated_at = now()
     WHERE id = v_p.id;
  END IF;
  RETURN jsonb_build_object('id', v_p.id, 'track', v_p.track_id, 'reassigned', v_hands);
END
$fn$;

-- ── Replace Person: ids inside levels (production's bodies, 20261025036000) ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.mkt_people_swap(p_list jsonb, p_from uuid, p_to uuid, p_appr boolean)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $fn$
DECLARE
  v_out jsonb := '[]'::jsonb;
  v_x   jsonb;
  v_id  text;
BEGIN
  IF jsonb_typeof(p_list) IS DISTINCT FROM 'array' THEN
    RETURN p_list;
  END IF;
  FOR v_x IN SELECT x FROM jsonb_array_elements(p_list) x LOOP
    IF p_appr THEN
      IF jsonb_typeof(v_x -> 'ids') = 'array' THEN
        -- A level of several (2026-11-13): the one replaced swapped in place, each id once.
        v_x := v_x || jsonb_build_object('ids', coalesce((
                 SELECT jsonb_agg(z.id ORDER BY z.n)
                   FROM (SELECT DISTINCT ON (y.id) y.id, y.n
                           FROM (SELECT CASE WHEN lower(t.id) = p_from::text THEN p_to::text ELSE lower(t.id) END AS id, t.n
                                   FROM jsonb_array_elements_text(v_x -> 'ids') WITH ORDINALITY AS t(id, n)) y
                          ORDER BY y.id, y.n) z), '[]'::jsonb));
      ELSIF v_x ->> 'kind' = 'person' THEN
        v_id := lower(v_x ->> 'staff');
        IF v_id = p_from::text THEN
          v_id := p_to::text;
          v_x := v_x || jsonb_build_object('staff', v_id);
        END IF;
        CONTINUE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v_out) o
                               WHERE o ->> 'kind' = 'person' AND lower(o ->> 'staff') = v_id);
      END IF;
    ELSE
      CONTINUE WHEN jsonb_typeof(v_x) IS DISTINCT FROM 'string';
      v_id := lower(v_x #>> '{}');
      IF v_id = p_from::text THEN
        v_id := p_to::text;
      END IF;
      CONTINUE WHEN v_out @> jsonb_build_array(v_id);
      v_x := to_jsonb(v_id);
    END IF;
    v_out := v_out || jsonb_build_array(v_x);
  END LOOP;
  RETURN v_out;
END
$fn$;

CREATE OR REPLACE FUNCTION public.mkt_stage_people(p_stages jsonb)
RETURNS TABLE (who uuid, n integer, name text, role text)
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $fn$
  SELECT lower(c)::uuid, s.n::integer, s.st ->> 'name', 'cand'::text
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_stages) = 'array' THEN p_stages ELSE '[]'::jsonb END)
         WITH ORDINALITY s(st, n),
         jsonb_array_elements_text(CASE WHEN jsonb_typeof(s.st -> 'who' -> 'cands') = 'array' THEN s.st -> 'who' -> 'cands'
                                        ELSE '[]'::jsonb END) c
   WHERE c ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  UNION ALL
  SELECT a.who, s.n::integer, s.st ->> 'name', 'appr'::text
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_stages) = 'array' THEN p_stages ELSE '[]'::jsonb END)
         WITH ORDINALITY s(st, n),
         public.mkt_appr_people(s.st -> 'appr') a
$fn$;

CREATE OR REPLACE FUNCTION public.mkt_replace_scan(p_staff uuid DEFAULT NULL)
RETURNS TABLE (staff uuid, grp text, key text, role text, ref uuid, ctx jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
BEGIN
  -- The templates: the version published and the draft — one place a template, with every stage that names them.
  RETURN QUERY
  SELECT x.who, 'tpl'::text, 'wf:' || w.id::text, 'template'::text, w.id,
         jsonb_build_object('action', w.action, 'tname', w.tname, 'version', w.version,
                            'drafted', w.version > 0 AND w.published_rev IS DISTINCT FROM w.draft_rev,
                            'at', jsonb_agg(DISTINCT jsonb_build_object('n', x.n, 'stage', x.name, 'role', x.role)))
    FROM public.mkt_workflows w
    LEFT JOIN public.mkt_workflow_versions v ON v.workflow_id = w.id AND v.version = w.version
    CROSS JOIN LATERAL (SELECT * FROM public.mkt_stage_people(v.stages)
                        UNION
                        SELECT * FROM public.mkt_stage_people(w.draft)) x
   WHERE p_staff IS NULL OR x.who = p_staff
   GROUP BY x.who, w.id, w.action, w.tname, w.version, w.published_rev, w.draft_rev;

  -- A series' plan — its runs to come: one place a series.
  RETURN QUERY
  SELECT y.who, 'series'::text, 'series:' || p.id::text, 'series'::text, p.id,
         jsonb_build_object('track', p.track_id, 'title', p.title, 'status', p.status,
                            'at', jsonb_agg(DISTINCT jsonb_build_object('n', y.idx + 1, 'stage', y.name, 'role', y.role)))
    FROM public.mkt_projects p
    CROSS JOIN LATERAL (
      SELECT s.owner_staff AS who, s.idx, s.name, 'owner'::text AS role
        FROM public.mkt_stages s WHERE s.project_id = p.id AND s.owner_staff IS NOT NULL
      UNION ALL
      SELECT c, s.idx, s.name, 'cand' FROM public.mkt_stages s, unnest(s.cands) c WHERE s.project_id = p.id
      UNION ALL
      SELECT a.who, s.idx, s.name, 'appr'
        FROM public.mkt_stages s, public.mkt_appr_people(s.appr) a
       WHERE s.project_id = p.id) y
   WHERE p.kind = 'recurring' AND p.series_id IS NULL AND p.status IN ('active', 'paused')
     AND (p_staff IS NULL OR y.who = p_staff)
   GROUP BY y.who, p.id, p.track_id, p.title, p.status;

  -- A stage of an open project (a series' own plan above): doing it, a 🔓 candidate (before it starts), approving it —
  -- `waiting` when the level now still waits for them.
  RETURN QUERY
  SELECT y.who,
         CASE WHEN s.status = 'planned' THEN 'up' WHEN y.role = 'owner' THEN 'hand' ELSE 'appr' END,
         'st:' || s.project_id::text || ':' || s.idx || ':' || y.role, y.role, s.project_id,
         jsonb_build_object('track', p.track_id, 'title', p.title, 'kind', p.kind, 'idx', s.idx, 'stage', s.name,
                            'status', s.status, 'starts', s.starts_on, 'due', s.due_on, 'ver', s.ver,
                            'late', s.due_on < v_today, 'owner', s.owner_staff, 'cands', to_jsonb(s.cands),
                            'appr', coalesce((SELECT jsonb_agg(a.who::text ORDER BY a.lvl, a.who) FROM public.mkt_appr_people(s.appr) a),
                                             '[]'::jsonb),
                            'level', y.lvl,
                            'waiting', s.status = 'review' AND y.role = 'appr' AND y.lvl = s.appr_idx + 1
                                       AND y.who::text = ANY (public.mkt_stage_waits(s.appr, s.appr_idx, s.appr_ok)))
    FROM public.mkt_stages s
    JOIN public.mkt_projects p ON p.id = s.project_id
    CROSS JOIN LATERAL (
      SELECT s.owner_staff AS who, 'owner'::text AS role, NULL::integer AS lvl WHERE s.owner_staff IS NOT NULL
      UNION ALL
      SELECT c, 'cand', NULL FROM unnest(s.cands) c WHERE s.status = 'planned'
      UNION ALL
      SELECT a.who, 'appr', a.lvl FROM public.mkt_appr_people(s.appr) a) y
   WHERE s.status <> 'done' AND p.status NOT IN ('done', 'cancelled')
     AND NOT (p.kind = 'recurring' AND p.series_id IS NULL)
     AND (p_staff IS NULL OR y.who = p_staff);

  -- A subtask not yet approved.
  RETURN QUERY
  SELECT t.assignee, 'hand'::text, 'sub:' || t.id::text, 'subtask'::text, t.project_id,
         jsonb_build_object('track', p.track_id, 'title', p.title, 'kind', p.kind, 'idx', t.stage_idx, 'stage', s.name,
                            'subtask', t.title, 'status', t.status, 'due', t.due_on, 'late', t.due_on < v_today)
    FROM public.mkt_subtasks t
    JOIN public.mkt_projects p ON p.id = t.project_id
    JOIN public.mkt_stages s ON s.project_id = t.project_id AND s.idx = t.stage_idx
   WHERE t.status <> 'approved' AND p.status NOT IN ('done', 'cancelled')
     AND (p_staff IS NULL OR t.assignee = p_staff);

  -- A project they own, still open (a series too).
  RETURN QUERY
  SELECT p.owner_staff, 'own'::text, 'own:' || p.id::text, 'project'::text, p.id,
         jsonb_build_object('track', p.track_id, 'title', p.title, 'kind', p.kind, 'status', p.status, 'due', p.due_on,
                            'series', p.kind = 'recurring' AND p.series_id IS NULL)
    FROM public.mkt_projects p
   WHERE p.owner_staff IS NOT NULL AND p.status NOT IN ('done', 'cancelled')
     AND (p_staff IS NULL OR p.owner_staff = p_staff);
END
$fn$;

-- ── Statements swapped in production's bodies ──────────────────────────────────────────────────────────────────────

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

-- mkt_task_create: a quick task's levels in the new shape (one person, several — any or all — the PIC); its stages'
-- group is the person's Marketing team when that is a group (never a manager's).
SELECT pg_temp.swap_check('public.mkt_task_create(uuid,text,text,text,text,jsonb,jsonb,uuid,jsonb,jsonb)',
  $q$v_appr := '[]'::jsonb;
    IF jsonb_typeof(v_st -> 'appr') = 'array' THEN
      IF jsonb_array_length(v_st -> 'appr') > 3 THEN
        RAISE EXCEPTION 'Stage %: at most 3 approvals.', i + 1 USING ERRCODE = '22023';
      END IF;
      FOR v_x IN SELECT x FROM jsonb_array_elements_text(v_st -> 'appr') x LOOP
        -- 🔗 The PIC on the link (②a-5 — the user's answer 52): once a stage — either PIC's approval, or, the task naming
        -- two, both PICs' ('pic:all').
        IF v_x IN ('pic', 'pic:all') THEN
          IF v_appr @> '[{"kind": "pic"}]'::jsonb THEN
            RAISE EXCEPTION 'Stage %: the PIC twice.', i + 1 USING ERRCODE = '22023';
          END IF;
          v_appr := v_appr || jsonb_build_array(CASE WHEN v_x = 'pic:all' AND v_pic2 IS NOT NULL THEN jsonb_build_object('kind', 'pic', 'all', true)
                                                     ELSE jsonb_build_object('kind', 'pic') END);
          v_picn := v_picn + 1;
          CONTINUE;
        END IF;
        IF v_x !~ v_uuid OR NOT (v_x::uuid = ANY (v_roster)) THEN
          RAISE EXCEPTION 'Stage %: an approver is not on Marketing''s team.', i + 1 USING ERRCODE = '22023';
        END IF;
        IF v_appr @> jsonb_build_array(jsonb_build_object('kind', 'person', 'staff', v_x::uuid)) THEN
          RAISE EXCEPTION 'Stage %: the same approver twice.', i + 1 USING ERRCODE = '22023';
        END IF;
        v_appr := v_appr || jsonb_build_array(jsonb_build_object('kind', 'person', 'staff', v_x::uuid));
      END LOOP;
    END IF;$q$,
  $q$-- Its levels (2026-11-13 — the Workflow Builder 2a's shape): {ids, rule} — a staff id, 'pic' or 'pic:all' as a
    -- level of one, or a level of several, any or all (mkt_levels_check).
    v_appr := public.mkt_levels_check(v_st -> 'appr', v_roster, 'Stage ' || (i + 1), v_pic2 IS NOT NULL);
    IF public.mkt_levels_pic(v_appr) THEN
      v_picn := v_picn + 1;
    END IF;$q$);
SELECT pg_temp.swap_check('public.mkt_task_create(uuid,text,text,text,text,jsonb,jsonb,uuid,jsonb,jsonb)',
  $q$v_ptext := CASE WHEN v_appr @> '[{"kind": "pic"}]'::jsonb THEN$q$,
  $q$v_ptext := CASE WHEN public.mkt_levels_pic(v_appr) THEN$q$);
SELECT pg_temp.swap_check('public.mkt_task_create(uuid,text,text,text,text,jsonb,jsonb,uuid,jsonb,jsonb)',
  $q$'dept', coalesce((SELECT left(regexp_replace(btrim(t.name), '\s+', ' ', 'g'), 80)
                                     FROM public.hr_staff_costs s JOIN public.titles t ON t.id = s.title_id WHERE s.id = v_who), ''),$q$,
  $q$'dept', coalesce((SELECT CASE WHEN r.team ~ '^[a-z0-9_]{1,24}$' AND r.team <> 'manager' THEN r.team END
                                     FROM public.mkt_roster() r WHERE r.staff_id = v_who), ''),$q$);

-- mkt_board: each stage's levels and who approved the level now (My turn / Waiting are flow.ts's tileOf over them).
SELECT pg_temp.swap_check('public.mkt_board(date,date)',
  $q$'enteredAt', s.entered_at, 'acceptedAt', s.accepted_at, 'submittedAt', s.submitted_at,
                           'doneAt', s.done_at) ORDER BY s.project_id, s.idx)$q$,
  $q$'enteredAt', s.entered_at, 'acceptedAt', s.accepted_at, 'submittedAt', s.submitted_at,
                           'doneAt', s.done_at, 'levels', public.mkt_levels_norm(s.appr), 'apprOk', s.appr_ok) ORDER BY s.project_id, s.idx)$q$);

-- mkt_shell: My turn — the doer now, or anybody the level now still waits for.
SELECT pg_temp.swap_check('public.mkt_shell()',
  $q$OR (s.status = 'review' AND (s.appr -> s.appr_idx ->> 'kind') = 'person' AND (s.appr -> s.appr_idx ->> 'staff') = v_me::text))$q$,
  $q$OR (s.status = 'review' AND v_me::text = ANY (public.mkt_stage_waits(s.appr, s.appr_idx, s.appr_ok))))$q$);

-- mkt_project: per stage its levels, approvals, overdue notice; per project the overdue / finish settings, the task's
-- own table columns, the workflow (category, template, version), the canvas's sections; the viewer's managing.
SELECT pg_temp.swap_check('public.mkt_project(text)',
  $q$'submittedAt', s.submitted_at, 'doneAt', s.done_at) ORDER BY s.idx)$q$,
  $q$'submittedAt', s.submitted_at, 'doneAt', s.done_at, 'levels', public.mkt_levels_norm(s.appr), 'apprOk', s.appr_ok,
                           'lateToldAt', s.late_told_at, 'picText', nullif(s.spec ->> 'picText', '')) ORDER BY s.idx)$q$);
SELECT pg_temp.swap_check('public.mkt_project(text)',
  $q$WHERE wv.workflow_id = v_p.workflow_id AND wv.version = v_p.workflow_version), false)),$q$,
  $q$WHERE wv.workflow_id = v_p.workflow_id AND wv.version = v_p.workflow_version), false),
      -- Workflow Builder 2a (mig 20261113210000): the settings copied when its work started, the doer's own columns.
      'overdue', v_p.overdue, 'finish', v_p.finish, 'extraCols', v_p.extra_cols,
      'wf', (SELECT jsonb_build_object('category', w.action, 'tname', w.tname, 'version', v_p.workflow_version)
               FROM public.mkt_workflows w WHERE w.id = v_p.workflow_id),
      'sections', coalesce((SELECT jsonb_agg(jsonb_build_object('id', sc ->> 'id', 'emoji', sc ->> 'emoji', 'title', sc ->> 'title',
                                                                'stage', sc -> 'stage') ORDER BY so)
                              FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_p.canvas_def -> 'sections') = 'array'
                                                             THEN v_p.canvas_def -> 'sections' ELSE '[]'::jsonb END)
                                   WITH ORDINALITY AS q(sc, so)), '[]'::jsonb)),$q$);
SELECT pg_temp.swap_check('public.mkt_project(text)',
  $q$'me', public.mkt_me_staff(),$q$,
  $q$'me', public.mkt_me_staff(),
    'manages', coalesce(public.has_any_action(ARRAY['marketing.manage']), false),$q$);

-- mkt_pic_page: waiting for THIS PIC — 'pic' still awaited on the level now (any / all), a level asking both no longer
-- for the one who approved; done, what the PIC reads (finish.picText) and how long their link stays for feedback.
SELECT pg_temp.swap_check('public.mkt_pic_page(text)',
  $q$'waiting', s.status = 'review' AND s.appr -> s.appr_idx ->> 'kind' = 'pic'
                                      AND NOT (coalesce(s.appr -> s.appr_idx ->> 'all' = 'true', false)
                                               AND nullif(btrim(coalesce(v_p.pic2_name, '')), '') IS NOT NULL
                                               AND coalesce(s.pic_ok ->> 'ver' = s.ver::text AND s.pic_ok ->> 'lvl' = s.appr_idx::text
                                                            AND s.pic_ok ? v_you::text, false)),
                           'both', s.appr -> s.appr_idx ->> 'kind' = 'pic' AND coalesce(s.appr -> s.appr_idx ->> 'all' = 'true', false)
                                   AND nullif(btrim(coalesce(v_p.pic2_name, '')), '') IS NOT NULL,$q$,
  $q$'waiting', s.status = 'review' AND 'pic' = ANY (public.mkt_stage_waits(s.appr, s.appr_idx, s.appr_ok))
                                      AND NOT (coalesce(public.mkt_level_at(s.appr, s.appr_idx) ->> 'picAll' = 'true', false)
                                               AND nullif(btrim(coalesce(v_p.pic2_name, '')), '') IS NOT NULL
                                               AND coalesce(s.pic_ok ->> 'ver' = s.ver::text AND s.pic_ok ->> 'lvl' = s.appr_idx::text
                                                            AND s.pic_ok ? v_you::text, false)),
                           'both', coalesce(public.mkt_level_at(s.appr, s.appr_idx) -> 'ids' ? 'pic', false)
                                   AND coalesce(public.mkt_level_at(s.appr, s.appr_idx) ->> 'picAll' = 'true', false)
                                   AND nullif(btrim(coalesce(v_p.pic2_name, '')), '') IS NOT NULL,$q$);
SELECT pg_temp.swap_check('public.mkt_pic_page(text)',
  $q$'id', d.id, 'title', d.title, 'status', d.status, 'startsOn', d.starts_on, 'dueOn', d.due_on,$q$,
  $q$'id', d.id, 'title', d.title, 'status', d.status, 'startsOn', d.starts_on, 'dueOn', d.due_on,
               'stageNames', (SELECT coalesce(jsonb_agg(x.name ORDER BY x.idx), '[]'::jsonb) FROM public.mkt_stages x WHERE x.project_id = d.id),
               'finish', CASE WHEN d.status = 'done' AND jsonb_typeof(d.finish) = 'object' THEN jsonb_build_object(
                           'picText', nullif(d.finish ->> 'picText', ''), 'celebration', d.finish ->> 'celebration',
                           'feedbackUntil', CASE WHEN d.finish ->> 'after' = 'feedback'
                                                 THEN public.mkt_add_work_days((d.done_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date, 3) END) END,$q$);

-- A table as the PIC reads it: only the columns shown to them (a column's 👁; never a Person column — no staff names),
-- the rows as the team filled them in (else the template's starting rows), each cell a text.
CREATE OR REPLACE FUNCTION public.mkt_pic_table(p_field jsonb, p_v jsonb)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $fn$
DECLARE
  v_in   jsonb := p_v;
  v_keep integer[];
BEGIN
  IF jsonb_typeof(v_in) = 'string' THEN
    BEGIN
      v_in := (v_in #>> '{}')::jsonb;
    EXCEPTION WHEN others THEN
      v_in := NULL;
    END;
  END IF;
  IF jsonb_typeof(v_in) = 'object' THEN
    v_in := v_in -> 'rows';
  END IF;
  IF jsonb_typeof(v_in) IS DISTINCT FROM 'array' THEN
    v_in := CASE WHEN jsonb_typeof(p_field -> 'rows') = 'array' THEN p_field -> 'rows' ELSE '[]'::jsonb END;
  END IF;
  v_keep := ARRAY(SELECT (c.o - 1)::integer
                    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_field -> 'cols') = 'array' THEN p_field -> 'cols' ELSE '[]'::jsonb END)
                         WITH ORDINALITY AS c(col, o)
                   WHERE coalesce(c.col ->> 'pic', 'true') <> 'false' AND coalesce(c.col ->> 'type', 'Text') <> 'Person'
                   ORDER BY c.o);
  RETURN jsonb_build_object(
    'cols', coalesce((SELECT jsonb_agg(p_field -> 'cols' -> k ->> 'name' ORDER BY n) FROM unnest(v_keep) WITH ORDINALITY AS u(k, n)), '[]'::jsonb),
    'rows', coalesce((SELECT jsonb_agg((SELECT coalesce(jsonb_agg(to_jsonb(CASE WHEN jsonb_typeof(r -> k) IN ('string', 'number') THEN r ->> k
                                                                                WHEN r -> k = 'true'::jsonb THEN 'true' ELSE '' END) ORDER BY n), '[]'::jsonb)
                                          FROM unnest(v_keep) WITH ORDINALITY AS u(k, n)) ORDER BY ro)
                        FROM jsonb_array_elements(v_in) WITH ORDINALITY AS t(r, ro) WHERE jsonb_typeof(r) = 'array'), '[]'::jsonb));
END
$fn$;
REVOKE ALL ON FUNCTION public.mkt_pic_table(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_pic_table(jsonb, jsonb) TO service_role;

SELECT pg_temp.swap_check('public.mkt_pic_page(text)',
  $q$'value', CASE WHEN f ->> 'type' = 'Person' AND coalesce(s.work -> 'vals' ->> (f ->> 'label'), '')$q$,
  $q$'value', CASE WHEN f ->> 'type' = 'Table' THEN public.mkt_pic_table(f, s.work -> 'vals' -> (f ->> 'label'))
                                                     WHEN f ->> 'type' = 'Person' AND coalesce(s.work -> 'vals' ->> (f ->> 'label'), '')$q$);

-- mkt_pic_work: a run waiting for the PIC — 'pic' still awaited on its level now.
SELECT pg_temp.swap_check('public.mkt_pic_work(uuid)',
  $q$AND s.appr -> s.appr_idx ->> 'kind' = 'pic';$q$,
  $q$AND 'pic' = ANY (public.mkt_stage_waits(s.appr, s.appr_idx, s.appr_ok));$q$);

-- mkt_pic_calendar: a level asking the PIC, ahead or still waiting for them.
SELECT pg_temp.swap_check('public.mkt_pic_calendar(text)',
  $q$WHERE a.v ->> 'kind' = 'pic' AND a.o - 1 >= CASE WHEN s.status = 'review' THEN coalesce(s.appr_idx, 0) ELSE 0 END) l$q$,
  $q$WHERE coalesce(public.mkt_level_norm(a.v) -> 'ids' ? 'pic', false)
               AND a.o - 1 >= CASE WHEN s.status = 'review' THEN coalesce(s.appr_idx, 0) ELSE 0 END
               AND NOT (s.status = 'review' AND a.o - 1 = s.appr_idx AND s.appr_ok ? 'pic')) l$q$);
SELECT pg_temp.swap_check('public.mkt_pic_calendar(text)',
  $q$AND coalesce(s.appr -> s.appr_idx ->> 'all' = 'true', false)$q$,
  $q$AND coalesce(public.mkt_level_at(s.appr, s.appr_idx) ->> 'picAll' = 'true', false)$q$);

-- mkt_nudge: in review, the first person the level now still waits for.
SELECT pg_temp.swap_check('public.mkt_nudge(uuid)',
  $q$CASE WHEN v_s.appr -> v_s.appr_idx ->> 'kind' = 'person' THEN (v_s.appr -> v_s.appr_idx ->> 'staff')::uuid END$q$,
  $q$(SELECT u.x::uuid FROM unnest(public.mkt_stage_waits(v_s.appr, v_s.appr_idx, v_s.appr_ok)) WITH ORDINALITY AS u(x, o)
                    WHERE u.x ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' ORDER BY u.o LIMIT 1)$q$);

-- mkt_free_block: an approver on any level is on the task.
SELECT pg_temp.swap_check('public.mkt_free_block(uuid,text,jsonb)',
  $q$OR s.appr @> jsonb_build_array(jsonb_build_object('kind', 'person', 'staff', v_me))$q$,
  $q$OR EXISTS (SELECT 1 FROM public.mkt_appr_people(s.appr) a WHERE a.who = v_me)$q$);

-- mkt_replace_person: an approver already on a stage's levels; the one replaced loses their approval in hand.
SELECT pg_temp.swap_check('public.mkt_replace_person(uuid,uuid,text[],text)',
  $q$v_dupe := EXISTS (SELECT 1 FROM jsonb_array_elements(v_s.appr) a
                           WHERE a ->> 'kind' = 'person' AND lower(a ->> 'staff') = p_to::text);$q$,
  $q$v_dupe := EXISTS (SELECT 1 FROM public.mkt_appr_people(v_s.appr) a WHERE a.who = p_to);$q$);
SELECT pg_temp.swap_check('public.mkt_replace_person(uuid,uuid,text[],text)',
  $q$UPDATE public.mkt_stages SET appr = public.mkt_people_swap(appr, p_from, p_to, true)
         WHERE project_id = v_id AND idx = v_idx;$q$,
  $q$UPDATE public.mkt_stages SET appr = public.mkt_people_swap(appr, p_from, p_to, true), appr_ok = appr_ok - p_from::text
         WHERE project_id = v_id AND idx = v_idx;$q$);

-- mkt_product_run_next: a carried month's levels read by their people; the version's overdue / finish carried.
SELECT pg_temp.swap_check('public.mkt_product_run_next(uuid)',
  $q$AND NOT EXISTS (SELECT 1 FROM public.mkt_stages s, jsonb_array_elements(s.appr) a
                       WHERE s.project_id = v_src.id AND a ->> 'kind' = 'person' AND NOT ((a ->> 'staff')::uuid = ANY (v_roster)));$q$,
  $q$AND NOT EXISTS (SELECT 1 FROM public.mkt_stages s, public.mkt_appr_people(s.appr) a
                       WHERE s.project_id = v_src.id AND NOT (a.who = ANY (v_roster)));$q$);
SELECT pg_temp.swap_check('public.mkt_product_run_next(uuid)',
  $q$SELECT (a ->> 'staff')::uuid, s.idx, s.name, s.starts_on
                         FROM public.mkt_stages s, jsonb_array_elements(s.appr) a
                        WHERE s.project_id = v_id AND a ->> 'kind' = 'person') w$q$,
  $q$SELECT a.who, s.idx, s.name, s.starts_on
                         FROM public.mkt_stages s, public.mkt_appr_people(s.appr) a
                        WHERE s.project_id = v_id) w$q$);
SELECT pg_temp.swap_check('public.mkt_product_run_next(uuid)',
  $q$coalesce((SELECT jsonb_agg(a) FROM jsonb_array_elements(s.appr) a
                        WHERE a ->> 'kind' <> 'person' OR (a ->> 'staff')::uuid = ANY (v_roster)), '[]'::jsonb),$q$,
  $q$public.mkt_levels_keep(s.appr, v_roster),$q$);
SELECT pg_temp.swap_check('public.mkt_product_run_next(uuid)',
  $q$pic2_name, pic2_whatsapp, parent_id, deliv, canvas_def, starts_on, created_by)$q$,
  $q$pic2_name, pic2_whatsapp, parent_id, deliv, canvas_def, overdue, finish, starts_on, created_by)$q$);
SELECT pg_temp.swap_check('public.mkt_product_run_next(uuid)',
  $q$v_src.canvas_def,
            v_start, v_p.created_by)$q$,
  $q$v_src.canvas_def,
            v_src.overdue, v_src.finish, v_start, v_p.created_by)$q$);

-- ── A table filled in on the task page (README › Tables: + Add row, the doer's own columns) ──────────────────────
-- A Table field's answer: {rows: string[][]} (or the rows, or their JSON as a text — the page's) — each row at most the template's columns and the task's own (extra_cols),
-- each cell a text of at most 500 (a tick as 'true' / ''), 200 rows at most. Rows and columns added here are this
-- task's only.
CREATE OR REPLACE FUNCTION public.mkt_table_value(p_field jsonb, p_extra jsonb, p_v jsonb)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $fn$
DECLARE
  v_width integer := CASE WHEN jsonb_typeof(p_field -> 'cols') = 'array' THEN jsonb_array_length(p_field -> 'cols') ELSE 0 END
                     + CASE WHEN jsonb_typeof(p_extra) = 'array' THEN jsonb_array_length(p_extra) ELSE 0 END;
  v_rows  jsonb := '[]'::jsonb;
  v_r     jsonb;
  v_row   jsonb;
  v_c     jsonb;
  v_in    jsonb := p_v;
BEGIN
  -- The page may send the JSON of its rows as a text, or the rows alone.
  IF jsonb_typeof(v_in) = 'string' THEN
    BEGIN
      v_in := (v_in #>> '{}')::jsonb;
    EXCEPTION WHEN others THEN
      v_in := NULL;
    END;
  END IF;
  IF jsonb_typeof(v_in) = 'array' THEN
    v_in := jsonb_build_object('rows', v_in);
  END IF;
  IF jsonb_typeof(v_in) IS DISTINCT FROM 'object' OR jsonb_typeof(v_in -> 'rows') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION '"%": not a table.', p_field ->> 'label' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(v_in -> 'rows') > 200 THEN
    RAISE EXCEPTION '"%": at most 200 rows.', p_field ->> 'label' USING ERRCODE = '22023';
  END IF;
  FOR v_r IN SELECT x FROM jsonb_array_elements(v_in -> 'rows') x LOOP
    IF jsonb_typeof(v_r) IS DISTINCT FROM 'array' OR jsonb_array_length(v_r) > greatest(v_width, 1) THEN
      RAISE EXCEPTION '"%": a row of at most % cells.', p_field ->> 'label', greatest(v_width, 1) USING ERRCODE = '22023';
    END IF;
    v_row := '[]'::jsonb;
    FOR v_c IN SELECT x FROM jsonb_array_elements(v_r) x LOOP
      v_c := to_jsonb(CASE WHEN jsonb_typeof(v_c) IN ('string', 'number') THEN v_c #>> '{}'
                           WHEN v_c = 'true'::jsonb THEN 'true' ELSE '' END);
      IF length(v_c #>> '{}') > 500 THEN
        RAISE EXCEPTION '"%": a cell of at most 500 characters.', p_field ->> 'label' USING ERRCODE = '22023';
      END IF;
      v_row := v_row || jsonb_build_array(v_c);
    END LOOP;
    v_rows := v_rows || jsonb_build_array(v_row);
  END LOOP;
  RETURN jsonb_build_object('rows', v_rows);
END
$fn$;
REVOKE ALL ON FUNCTION public.mkt_table_value(jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_table_value(jsonb, jsonb, jsonb) TO service_role;

-- mkt_stage_save (production's body, d852759a…): a Table field of the stage takes its rows.
SELECT pg_temp.swap_check('public.mkt_stage_save(uuid,jsonb)',
  $q$CONTINUE WHEN NOT (v_k = ANY (v_ok));$q$,
  $q$-- A table of the stage (Workflow Builder 2a): its rows, the template's columns and the task's own.
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_s.spec -> 'form') = 'array' THEN v_s.spec -> 'form' ELSE '[]'::jsonb END) tf
                  WHERE tf ->> 'type' = 'Table' AND tf ->> 'label' = v_k) THEN
        v_vals := CASE WHEN jsonb_typeof(v_v) = 'null' THEN v_vals - v_k ELSE v_vals || jsonb_build_object(v_k, (
                    SELECT public.mkt_table_value(tf, v_p.extra_cols -> coalesce(tf ->> 'id', tf ->> 'label'), v_v)
                      FROM jsonb_array_elements(v_s.spec -> 'form') tf WHERE tf ->> 'type' = 'Table' AND tf ->> 'label' = v_k LIMIT 1)) END;
        CONTINUE;
      END IF;
      CONTINUE WHEN NOT (v_k = ANY (v_ok));$q$);

-- mkt_stage_missing (production's body, 4a6c6e93…): a table its canvas marks required has a row; a column marked
-- required and filled in at this stage (or any) is filled on every row. A table with no ⭐ of its own (a quick task's,
-- a version before 2a) is asked nothing, as before.
SELECT pg_temp.swap_check('public.mkt_stage_missing(jsonb,jsonb)',
  $q$CONTINUE WHEN f ->> 'type' IN ('Note', 'Table');$q$,
  $q$IF f ->> 'type' = 'Table' AND f ? 'req' THEN
      v_inputs := v_inputs + 1;
      v := CASE WHEN jsonb_typeof(v_vals -> (f ->> 'label') -> 'rows') = 'array' THEN v_vals -> (f ->> 'label') -> 'rows' ELSE '[]'::jsonb END;
      IF (f -> 'req' = 'true'::jsonb AND jsonb_array_length(v) = 0)
         OR EXISTS (SELECT 1 FROM jsonb_array_elements(v) r,
                                  jsonb_array_elements(CASE WHEN jsonb_typeof(f -> 'cols') = 'array' THEN f -> 'cols' ELSE '[]'::jsonb END)
                                    WITH ORDINALITY AS c(col, o)
                     WHERE c.col -> 'req' = 'true'::jsonb
                       AND (coalesce(c.col ->> 'stage', '') = '' OR c.col ->> 'stage' = coalesce(p_spec ->> 'sid', ''))
                       AND btrim(coalesce(r ->> (c.o::integer - 1), '')) = '') THEN
        v_out := v_out || (f ->> 'label');
      END IF;
      CONTINUE;
    END IF;
    CONTINUE WHEN f ->> 'type' IN ('Note', 'Table');$q$);

-- ── New writes ──────────────────────────────────────────────────────────────────────────────────────────────────────

-- ⇄ Reassign (Marketing · Manage): a stage not done changes hands; the new person and the old told, a line on the trail.
CREATE OR REPLACE FUNCTION public.mkt_stage_reassign(p_project uuid, p_stage integer, p_staff uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_p      public.mkt_projects;
  v_s      public.mkt_stages;
  v_reason text := nullif(btrim(regexp_replace(coalesce(p_reason, ''), '\s+', ' ', 'g')), '');
  v_from   text;
  v_to     text;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'Reassigning a stage is the manager''s.');
  SELECT * INTO v_p FROM public.mkt_projects WHERE id = p_project FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That task is not there.' USING ERRCODE = 'P0002';
  END IF;
  IF v_p.kind = 'product' OR (v_p.kind = 'recurring' AND v_p.series_id IS NULL) THEN
    RAISE EXCEPTION 'Reassign a stage of a task, a run or a deliverable.' USING ERRCODE = '22023';
  END IF;
  IF v_p.status NOT IN ('active', 'paused', 'planning') THEN
    RAISE EXCEPTION 'That task is not open (%).', v_p.status USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_s FROM public.mkt_stages WHERE project_id = v_p.id AND idx = p_stage FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That stage is not there.' USING ERRCODE = 'P0002';
  END IF;
  IF v_s.status = 'done' THEN
    RAISE EXCEPTION '% is done — it stays as it was.', v_s.name USING ERRCODE = '22023';
  END IF;
  IF p_staff IS NULL OR NOT EXISTS (SELECT 1 FROM public.mkt_roster() r WHERE r.staff_id = p_staff) THEN
    RAISE EXCEPTION 'Pick a person on Marketing''s team.' USING ERRCODE = '22023';
  END IF;
  IF p_staff IS NOT DISTINCT FROM v_s.owner_staff THEN
    RAISE EXCEPTION '% is on it already.', public.mkt_staff_name(p_staff) USING ERRCODE = '22023';
  END IF;
  IF length(coalesce(v_reason, '')) > 300 THEN
    RAISE EXCEPTION 'Say why in at most 300 characters.' USING ERRCODE = '22023';
  END IF;
  v_from := coalesce(public.mkt_staff_name(v_s.owner_staff), 'Nobody yet');
  v_to := public.mkt_staff_name(p_staff);
  UPDATE public.mkt_stages
     SET owner_staff = p_staff,
         entered_at = CASE WHEN idx = v_p.cur AND status IN ('accepted', 'changes') THEN now() ELSE entered_at END,
         late_told_at = NULL
   WHERE project_id = v_p.id AND idx = v_s.idx;
  UPDATE public.mkt_projects SET updated_at = now() WHERE id = v_p.id;
  PERFORM public.mkt_log(v_p.id, 'reassigned', v_s.idx, v_s.name, v_from || ' → ' || v_to, v_reason);
  PERFORM public.mkt_notify(p_staff, v_p.id,
            CASE WHEN v_s.idx = v_p.cur AND v_s.status <> 'planned' THEN 'Your turn: ' ELSE 'You''re on the plan: ' END
              || v_s.name || coalesce(', due ' || to_char(v_s.due_on, 'FMDD Mon'), ''),
            v_p.track_id || ' · ' || v_p.title || coalesce(' — "' || v_reason || '"', ''),
            CASE WHEN v_s.idx = v_p.cur THEN 'open' ELSE 'task' END);
  IF v_s.owner_staff IS NOT NULL THEN
    PERFORM public.mkt_notify(v_s.owner_staff, v_p.id, left(v_s.name || ' of "' || v_p.title || '" moved to ' || v_to, 200),
              coalesce('"' || v_reason || '"', v_p.track_id), 'task');
  END IF;
  RETURN jsonb_build_object('id', v_p.id, 'track', v_p.track_id);
END
$fn$;

-- + Add column / × (the doer now, while the stage is theirs): a column of this task only on a table its stage fills in;
-- at most 8 a table; one taken off only by whoever added it, its cells with it.
CREATE OR REPLACE FUNCTION public.mkt_task_column(p_project uuid, p_field text, p_op text, p_col jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me    uuid := public.mkt_me_staff();
  v_p     public.mkt_projects;
  v_s     public.mkt_stages;
  v_f     jsonb;
  v_key   text;
  v_extra jsonb;
  v_name  text;
  v_type  text;
  v_id    text;
  v_pos   integer;
  v_base  integer;
  v_vals  jsonb;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.edit'], 'Working on a stage is not open to your account.');
  v_p := public.mkt_open_project(p_project);
  SELECT * INTO v_s FROM public.mkt_stages WHERE project_id = v_p.id AND idx = v_p.cur FOR UPDATE;
  IF v_me IS NULL OR v_s.owner_staff IS DISTINCT FROM v_me THEN
    RAISE EXCEPTION 'This stage is not yours.' USING ERRCODE = '42501';
  END IF;
  IF v_s.status NOT IN ('accepted', 'changes') THEN
    RAISE EXCEPTION 'It is with its approver now.' USING ERRCODE = '22023';
  END IF;
  SELECT f INTO v_f FROM jsonb_array_elements(coalesce(v_s.spec -> 'form', '[]'::jsonb)) f
   WHERE f ->> 'type' = 'Table' AND (f ->> 'id' = p_field OR (NOT (f ? 'id') AND f ->> 'label' = p_field))
   LIMIT 1;
  IF v_f IS NULL THEN
    RAISE EXCEPTION 'That table is not this stage''s.' USING ERRCODE = '22023';
  END IF;
  v_key := coalesce(v_f ->> 'id', v_f ->> 'label');
  v_extra := CASE WHEN jsonb_typeof(v_p.extra_cols -> v_key) = 'array' THEN v_p.extra_cols -> v_key ELSE '[]'::jsonb END;
  v_base := CASE WHEN jsonb_typeof(v_f -> 'cols') = 'array' THEN jsonb_array_length(v_f -> 'cols') ELSE 0 END;
  IF p_op = 'add' THEN
    v_name := btrim(regexp_replace(coalesce(p_col ->> 'name', ''), '\s+', ' ', 'g'));
    v_type := coalesce(p_col ->> 'type', 'Text');
    IF length(v_name) NOT BETWEEN 1 AND 40 THEN
      RAISE EXCEPTION 'Name the column (at most 40 characters).' USING ERRCODE = '22023';
    END IF;
    IF v_type NOT IN ('Text', 'Number', 'Checkbox', 'Date', 'Person') THEN
      RAISE EXCEPTION 'A column is Text, Number, Checkbox, Date or Person.' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(v_extra) >= 8 THEN
      RAISE EXCEPTION 'At most 8 columns of your own on a table.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(v_f -> 'cols', '[]'::jsonb) || v_extra) c
                WHERE lower(c ->> 'name') = lower(v_name)) THEN
      RAISE EXCEPTION 'The table has a column "%" already.', v_name USING ERRCODE = '22023';
    END IF;
    v_id := 'x' || substr(md5(gen_random_uuid()::text), 1, 10);
    v_extra := v_extra || jsonb_build_array(jsonb_build_object('id', v_id, 'name', v_name, 'type', v_type, 'by', v_me,
                                                                'stage', v_s.idx));
    PERFORM public.mkt_log(v_p.id, 'column added', v_s.idx, v_s.name, v_f ->> 'label', v_name);
  ELSIF p_op = 'remove' THEN
    v_id := p_col ->> 'id';
    SELECT o::integer - 1 INTO v_pos FROM jsonb_array_elements(v_extra) WITH ORDINALITY AS t(c, o) WHERE c ->> 'id' = v_id;
    IF v_pos IS NULL THEN
      RAISE EXCEPTION 'That column is not there.' USING ERRCODE = '22023';
    END IF;
    IF v_extra -> v_pos ->> 'by' IS DISTINCT FROM v_me::text THEN
      RAISE EXCEPTION 'Only whoever added a column takes it off.' USING ERRCODE = '42501';
    END IF;
    v_name := v_extra -> v_pos ->> 'name';
    v_extra := v_extra - v_pos;
    -- Its cells go with it: the rows' cell at its place (the template's columns, then the task's own).
    v_vals := v_s.work -> 'vals' -> (v_f ->> 'label');
    IF jsonb_typeof(v_vals -> 'rows') = 'array' THEN
      UPDATE public.mkt_stages
         SET work = jsonb_set(work, ARRAY['vals', v_f ->> 'label', 'rows'],
                      coalesce((SELECT jsonb_agg(CASE WHEN jsonb_typeof(r) = 'array' THEN r - (v_base + v_pos) ELSE r END ORDER BY o)
                                  FROM jsonb_array_elements(v_vals -> 'rows') WITH ORDINALITY AS t(r, o)), '[]'::jsonb))
       WHERE project_id = v_p.id AND idx = v_s.idx;
    END IF;
    PERFORM public.mkt_log(v_p.id, 'column removed', v_s.idx, v_s.name, v_f ->> 'label', v_name);
  ELSE
    RAISE EXCEPTION 'Add a column, or take one off.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.mkt_projects
     SET extra_cols = CASE WHEN jsonb_array_length(v_extra) = 0 THEN extra_cols - v_key
                           ELSE jsonb_set(extra_cols, ARRAY[v_key], v_extra) END,
         updated_at = now()
   WHERE id = v_p.id;
  RETURN jsonb_build_object('id', v_p.id, 'track', v_p.track_id, 'field', v_key, 'cols', v_extra);
END
$fn$;

-- ⏰ The overdue sweep (the service role's, from the hourly /api/member-queue): the stage now of each running task whose
-- overdue settings it carries, late by `days` (whole days past 18:00 of its due day, rounded up) — its people told,
-- once, or once a day when `repeat`; from 9:00 office time; a line on the trail. `action: reassign` asks the managers
-- to reassign it. Answers how many stages were told about.
CREATE OR REPLACE FUNCTION public.mkt_overdue_sweep(p_at timestamptz DEFAULT now())
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_local  timestamp := coalesce(p_at, now()) AT TIME ZONE 'Asia/Kuala_Lumpur';
  v_today  date := (coalesce(p_at, now()) AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  r        record;
  v_cfg    jsonb;
  v_late   integer;
  v_days   integer;
  v_repeat boolean;
  v_kinds  text[];
  v_who    uuid[];
  v_mm     uuid[];
  v_u      uuid;
  v_names  text;
  v_title  text;
  v_n      integer := 0;
BEGIN
  IF extract(hour FROM v_local) < 9 THEN
    RETURN 0;  -- never a phone before 9:00
  END IF;
  v_mm := ARRAY(SELECT x.staff_id FROM public.mkt_roster() x WHERE upper(coalesce(x.title, '')) LIKE '%MARKETING MANAGER%');
  FOR r IN
    SELECT p.id AS pid, p.track_id, p.title, p.overdue, s.idx, s.name, s.status, s.owner_staff, s.due_on, s.entered_at,
           s.late_told_at, s.appr, s.appr_idx, s.appr_ok
      FROM public.mkt_projects p
      JOIN public.mkt_stages s ON s.project_id = p.id AND s.idx = p.cur
     WHERE p.status = 'active' AND jsonb_typeof(p.overdue) = 'object'
       AND NOT (p.kind = 'recurring' AND p.series_id IS NULL)
       AND coalesce(p.starts_on, v_today) <= v_today
       AND s.status IN ('todo', 'accepted', 'changes', 'review') AND s.due_on IS NOT NULL
       AND s.due_on < v_today + 1
     ORDER BY p.track_id
       FOR UPDATE OF s SKIP LOCKED
  LOOP
    v_cfg := r.overdue;
    v_late := ceil(extract(epoch FROM (coalesce(p_at, now()) - ((r.due_on + time '18:00') AT TIME ZONE 'Asia/Kuala_Lumpur'))) / 86400.0)::integer;
    CONTINUE WHEN v_late <= 0;
    v_days := CASE WHEN coalesce(v_cfg ->> 'days', '') ~ '^[0-9]{1,2}$' THEN least(greatest((v_cfg ->> 'days')::integer, 1), 10) ELSE 1 END;
    CONTINUE WHEN v_late < v_days;
    v_repeat := coalesce(v_cfg ->> 'repeat', 'true') <> 'false';
    IF r.late_told_at IS NOT NULL AND r.late_told_at >= coalesce(r.entered_at, '-infinity'::timestamptz) THEN
      CONTINUE WHEN NOT v_repeat;
      CONTINUE WHEN (r.late_told_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date >= v_today;
    END IF;
    v_kinds := CASE WHEN jsonb_typeof(v_cfg -> 'notify') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(v_cfg -> 'notify'))
                    ELSE ARRAY['doer', 'mm'] END;
    v_who := ARRAY(
      SELECT DISTINCT w FROM (
        SELECT r.owner_staff AS w WHERE 'doer' = ANY (v_kinds) AND r.status <> 'review'
        UNION ALL
        SELECT x::uuid FROM unnest(public.mkt_stage_waits(r.appr, r.appr_idx, r.appr_ok)) x
         WHERE 'doer' = ANY (v_kinds) AND r.status = 'review'
           AND x ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        UNION ALL
        SELECT m FROM unnest(v_mm) m WHERE 'mm' = ANY (v_kinds) OR v_cfg ->> 'action' = 'reassign'
        UNION ALL
        SELECT x.staff_id FROM public.mkt_roster() x WHERE 'director' = ANY (v_kinds) AND upper(coalesce(x.title, '')) LIKE '%DIRECTOR%'
        UNION ALL
        SELECT n.owner_staff FROM public.mkt_stages n WHERE 'next' = ANY (v_kinds) AND n.project_id = r.pid AND n.idx = r.idx + 1
      ) z WHERE w IS NOT NULL);
    v_title := '⏰ ' || r.name || ' is ' || v_late || 'd overdue';
    FOREACH v_u IN ARRAY v_who LOOP
      PERFORM public.mkt_notify(v_u, r.pid,
                left(v_title || CASE WHEN v_cfg ->> 'action' = 'reassign' AND v_u = ANY (v_mm) THEN ' · reassign it?' ELSE '' END, 200),
                r.track_id || ' · ' || r.title, 'overdue');
    END LOOP;
    v_names := array_to_string(ARRAY(SELECT coalesce(public.mkt_staff_name(u), 'Somebody') FROM unnest(v_who) u ORDER BY 1), ', ');
    UPDATE public.mkt_stages SET late_told_at = coalesce(p_at, now()) WHERE project_id = r.pid AND idx = r.idx;
    INSERT INTO public.mkt_events (project_id, actor_user, actor_name, action, stage_idx, stage_name, from_to, reason, data)
    VALUES (r.pid, NULL, 'Overdue reminder', 'overdue', r.idx, left(r.name, 80), left(nullif(v_names, ''), 200),
            CASE WHEN v_cfg ->> 'action' = 'reassign' THEN 'Reassign it?' END,
            jsonb_build_object('late', v_late, 'action', coalesce(v_cfg ->> 'action', 'remind'), 'told', cardinality(v_who),
                               'repeat', v_repeat));
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END
$fn$;

-- ── Who may call them ───────────────────────────────────────────────────────────────────────────────────────────────
-- Helpers only DEFINER functions call: nobody's but the owner's (and the service role's).
REVOKE ALL ON FUNCTION public.mkt_dept_key(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_level_norm(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_levels_norm(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_level_at(jsonb, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_level_waits(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_stage_waits(jsonb, integer, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_appr_people(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_levels_pic(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_levels_keep(jsonb, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_level_names(jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_level_tell(uuid, jsonb, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_levels_check(jsonb, uuid[], text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_add_work_days(date, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_level_ok(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_stage_back(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_dept_key(text), public.mkt_level_norm(jsonb), public.mkt_levels_norm(jsonb),
  public.mkt_level_at(jsonb, integer), public.mkt_level_waits(jsonb, jsonb), public.mkt_stage_waits(jsonb, integer, jsonb),
  public.mkt_appr_people(jsonb), public.mkt_levels_pic(jsonb), public.mkt_levels_keep(jsonb, uuid[]),
  public.mkt_level_names(jsonb, text), public.mkt_level_tell(uuid, jsonb, text, text, text),
  public.mkt_levels_check(jsonb, uuid[], text, boolean), public.mkt_add_work_days(date, integer),
  public.mkt_level_ok(uuid, text), public.mkt_stage_back(uuid, jsonb) TO service_role;

-- The new writes: a signed-in caller's (each asks its action itself).
REVOKE ALL ON FUNCTION public.mkt_stage_reassign(uuid, integer, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_task_column(uuid, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_stage_reassign(uuid, integer, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_task_column(uuid, text, text, jsonb) TO authenticated;

-- The sweep: the service role's alone.
REVOKE ALL ON FUNCTION public.mkt_overdue_sweep(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_overdue_sweep(timestamptz) TO service_role;

NOTIFY pgrst, 'reload schema';
