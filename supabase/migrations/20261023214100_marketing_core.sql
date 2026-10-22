-- ============================================================================
-- 20261023214100_marketing_core.sql
-- Marketing's view — the tables its projects live in and the readers its first pages draw from (2026-10-23, the
-- Claude Design handoff "HOUZS Marketing Module Setup"; the permission is the migration before this one).
-- ============================================================================
--
-- Tables (RLS on, NO policy, no client grants — every read and write is one of the functions below or of a later
-- migration, as Attendance's and IT's are):
--   mkt_subsidiaries  who a project is for: each group company (its `companies` row; the Track ID's code is its short
--                     code) and Marketing's own clients outside the group (no company — the user, asked about the
--                     handoff's "+ Add subsidiary": "会，marketing 自己的客户名单"). The dot and emoji the sidebar draws,
--                     the default PIC, the Library's brand look (`profile`).
--   mkt_team          Marketing's roster as Marketing reads it: each person's team (Content, Social Media, Design, Ads,
--                     Brand — or a manager), the words under their name, their colour, how many tasks fill them. The
--                     roster is the Marketing department's active People; a row here only says otherwise.
--   mkt_projects      a product project (MKT-…), a quick task (TSK-…) or a recurring task (RCR-…; each run its own row
--                     under the series): who it is for, what it runs on, where it stands.
--   mkt_stages        a project's stages in order: who does it, how long, who approves it (people, then the PIC on the
--                     link), whether it may split into subtasks, where it stands.
--   mkt_subtasks      a stage split into subtasks — each delivered back to the stage's owner, who reviews it.
--   mkt_events        each project's trail: who did what, when, on which stage, why — the Audit trail tab and the map.
-- Readers (SECURITY DEFINER, plpgsql, STABLE; PUBLIC and anon revoked, `authenticated` granted):
--   mkt_board(from, to)  Marketing · View — the roster, the subsidiaries, the projects open (or done in the last 60
--                        days, or with a stage due in [from, to]) with their stages and subtasks, the holidays: what
--                        My Space, the Calendar, Projects and Tracking draw. Raw facts; the pages reckon from them.
--   mkt_shell()          Marketing · View — the sidebar: who is signed in (as Marketing knows them), the subsidiaries
--                        with the caller's own count on each, the counts beside My Space / Calendar / Projects /
--                        Tracking, the unread notices.
--   mkt_search(q)        Marketing · View — Track IDs, titles and people, for the top bar.
--   mkt_notices(n)       the caller's own Marketing notices (kind 'marketing'), newest first.
-- PGlite: tests/member-sql/validate-marketing.mjs.

-- ── The tables ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.mkt_subsidiaries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid UNIQUE REFERENCES public.companies(id),
  code         text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9]{2,6}$'),
  name         text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  pic_name     text CHECK (length(pic_name) <= 80),
  pic_whatsapp text CHECK (length(pic_whatsapp) <= 40),
  dot          text NOT NULL DEFAULT 'oklch(0.62 0.02 60)' CHECK (dot ~ '^(oklch|rgb)\([0-9. /]+\)$'),
  emoji        text CHECK (length(emoji) <= 16),
  profile      jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order   integer NOT NULL DEFAULT 100,
  active       boolean NOT NULL DEFAULT true,
  created_by   uuid REFERENCES public.users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mkt_team (
  staff_id   uuid PRIMARY KEY REFERENCES public.hr_staff_costs(id) ON DELETE CASCADE,
  team       text CHECK (team IN ('manager', 'content', 'social', 'design', 'ads', 'brand')),
  role_label text CHECK (length(role_label) <= 60),
  color      text CHECK (color ~ '^(oklch|rgb)\([0-9. /]+\)$'),
  capacity   integer NOT NULL DEFAULT 5 CHECK (capacity BETWEEN 1 AND 20),
  in_roster  boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES public.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mkt_projects (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id         text NOT NULL UNIQUE CHECK (track_id ~ '^(MKT|TSK|RCR)-[A-Z0-9]{2,6}-[0-9]{4}-[0-9]{3}(-R[0-9]{2,3})?$'),
  kind             text NOT NULL CHECK (kind IN ('product', 'quick', 'recurring')),
  subsidiary_id    uuid NOT NULL REFERENCES public.mkt_subsidiaries(id),
  title            text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 140),
  status           text NOT NULL DEFAULT 'active'
                   CHECK (status IN ('minutes', 'waiting_pic', 'changes', 'approved', 'active', 'paused', 'done', 'cancelled')),
  product_id       uuid,
  product_version  integer,
  workflow_id      uuid,
  workflow_version integer,
  workflow_name    text CHECK (length(workflow_name) <= 120),
  q_type           text CHECK (q_type IN ('ads', 'social', 'content', 'brand', 'other')),
  brief            text CHECK (length(brief) <= 4000),
  owner_staff      uuid REFERENCES public.hr_staff_costs(id),
  pic_name         text CHECK (length(pic_name) <= 80),
  pic_whatsapp     text CHECK (length(pic_whatsapp) <= 40),
  cur              integer NOT NULL DEFAULT 0 CHECK (cur >= 0),
  series_id        uuid REFERENCES public.mkt_projects(id),
  run_no           integer CHECK (run_no >= 1),
  recur            jsonb,
  starts_on        date,
  due_on           date,
  link_code        text UNIQUE,
  override         jsonb,
  canvas_def       jsonb,
  canvas           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by       uuid REFERENCES public.users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  done_at          timestamptz,
  CHECK ((series_id IS NULL) = (run_no IS NULL))
);
CREATE INDEX IF NOT EXISTS mkt_projects_open ON public.mkt_projects (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS mkt_projects_series ON public.mkt_projects (series_id) WHERE series_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.mkt_stages (
  project_id   uuid NOT NULL REFERENCES public.mkt_projects(id) ON DELETE CASCADE,
  idx          integer NOT NULL CHECK (idx BETWEEN 0 AND 29),
  name         text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  dept         text NOT NULL DEFAULT 'social' CHECK (dept IN ('content', 'social', 'design', 'ads', 'brand')),
  mode         text NOT NULL DEFAULT 'assign' CHECK (mode IN ('person', 'assign', 'prev')),
  owner_staff  uuid REFERENCES public.hr_staff_costs(id),
  extra        text CHECK (length(extra) <= 40),
  cands        uuid[] NOT NULL DEFAULT '{}',
  sla          integer NOT NULL DEFAULT 1 CHECK (sla BETWEEN 1 AND 60),
  appr         jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(appr) = 'array'),
  split        boolean NOT NULL DEFAULT false,
  spec         jsonb NOT NULL DEFAULT '{}'::jsonb,
  starts_on    date,
  due_on       date,
  status       text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'todo', 'accepted', 'review', 'changes', 'done')),
  appr_idx     integer NOT NULL DEFAULT 0 CHECK (appr_idx >= 0),
  ver          integer NOT NULL DEFAULT 0 CHECK (ver >= 0),
  work         jsonb NOT NULL DEFAULT '{}'::jsonb,
  changes      jsonb,
  entered_at   timestamptz,
  accepted_at  timestamptz,
  submitted_at timestamptz,
  done_at      timestamptz,
  PRIMARY KEY (project_id, idx)
);
CREATE INDEX IF NOT EXISTS mkt_stages_owner ON public.mkt_stages (owner_staff) WHERE status IN ('todo', 'accepted', 'review', 'changes');
CREATE INDEX IF NOT EXISTS mkt_stages_due ON public.mkt_stages (due_on);

CREATE TABLE IF NOT EXISTS public.mkt_subtasks (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  stage_idx  integer NOT NULL,
  title      text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 120),
  assignee   uuid NOT NULL REFERENCES public.hr_staff_costs(id),
  due_on     date,
  status     text NOT NULL DEFAULT 'working' CHECK (status IN ('working', 'ready', 'revising', 'approved')),
  returns    integer NOT NULL DEFAULT 0 CHECK (returns >= 0),
  delivery   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (project_id, stage_idx) REFERENCES public.mkt_stages(project_id, idx) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS mkt_subtasks_stage ON public.mkt_subtasks (project_id, stage_idx);
CREATE INDEX IF NOT EXISTS mkt_subtasks_assignee ON public.mkt_subtasks (assignee) WHERE status <> 'approved';

CREATE TABLE IF NOT EXISTS public.mkt_events (
  id         bigserial PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.mkt_projects(id) ON DELETE CASCADE,
  at         timestamptz NOT NULL DEFAULT now(),
  actor_user uuid REFERENCES public.users(id),
  actor_name text NOT NULL CHECK (length(actor_name) BETWEEN 1 AND 120),
  action     text NOT NULL CHECK (length(action) BETWEEN 1 AND 60),
  stage_idx  integer,
  stage_name text CHECK (length(stage_name) <= 80),
  from_to    text CHECK (length(from_to) <= 200),
  reason     text CHECK (length(reason) <= 1000),
  version    text CHECK (length(version) <= 60),
  file       text CHECK (length(file) <= 200),
  corrects   bigint REFERENCES public.mkt_events(id),
  data       jsonb
);
CREATE INDEX IF NOT EXISTS mkt_events_project ON public.mkt_events (project_id, at);

ALTER TABLE public.mkt_subsidiaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_team ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_subtasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mkt_subsidiaries, public.mkt_team, public.mkt_projects, public.mkt_stages, public.mkt_subtasks,
  public.mkt_events FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.mkt_events_id_seq FROM anon, authenticated;

SELECT public.audit_register('mkt_subsidiaries', 'Marketing subsidiaries & clients', 'Marketing', '{marketing}', 'all',
  p_keys => '{code}', p_labels => '{name}');
SELECT public.audit_register('mkt_team', 'Marketing roster', 'Marketing', '{marketing}', 'all',
  p_keys => '{staff_id}', p_labels => '{role_label}');
SELECT public.audit_register('mkt_projects', 'Marketing projects', 'Marketing', '{}', 'none',
  p_reason => 'Each project keeps its own trail, mkt_events, written by the functions that change it — read on its Audit trail tab');
SELECT public.audit_register('mkt_stages', 'Marketing project stages', 'Marketing', '{}', 'none',
  p_reason => 'A stage moves only through the project''s functions, each of which writes the project''s trail (mkt_events)');
SELECT public.audit_register('mkt_subtasks', 'Marketing subtasks', 'Marketing', '{}', 'none',
  p_reason => 'A subtask moves only through the project''s functions, each of which writes the project''s trail (mkt_events)');
SELECT public.audit_register('mkt_events', 'Marketing project trail', 'Marketing', '{}', 'none',
  p_reason => 'The trail itself — each line written once by a function and never changed: a record already');

-- The group's companies, in the handoff's order, with its dots and emoji (the handoff's Colive is Ohana's place).
INSERT INTO public.mkt_subsidiaries (company_id, code, name, dot, emoji, sort_order)
SELECT c.id, upper(c.short_code), c.name, v.dot, v.emoji, v.ord
  FROM public.companies c
  JOIN (VALUES ('CAR', 'oklch(0.70 0.12 235)', '🛋️', 1), ('2990', 'oklch(0.64 0.15 295)', '🏡', 2),
               ('HC', 'oklch(0.52 0.06 55)', '🏛️', 3), ('HK', 'oklch(0.70 0.13 345)', '🪴', 4),
               ('OHN', 'oklch(0.66 0.10 195)', '🛏️', 5), ('DC', 'oklch(0.56 0.15 270)', '✨', 6),
               ('CMI', 'oklch(0.60 0.03 250)', '🔩', 7), ('CONTS', 'oklch(0.62 0.12 320)', '🚚', 8)) AS v(code, dot, emoji, ord)
    ON upper(c.short_code) = v.code
 WHERE c.is_active
ON CONFLICT DO NOTHING;

-- ── Helpers the functions share (nobody's to call) ──────────────────────────

-- The caller's People record, the one their login names (as Me finds it).
CREATE OR REPLACE FUNCTION public.mkt_me_staff()
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN (SELECT s.id FROM public.hr_staff_costs s
           WHERE s.user_id = auth.uid() AND s.status = 'active'
           ORDER BY s.created_at, s.id LIMIT 1);
END
$fn$;

-- Refused unless the caller holds one of these cells.
CREATE OR REPLACE FUNCTION public.mkt_need(p_wants text[], p_words text)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(public.has_any_action(p_wants), false) THEN
    RAISE EXCEPTION '%', coalesce(p_words, 'Marketing is not open to your account.') USING ERRCODE = '42501';
  END IF;
END
$fn$;

-- A title's team until Marketing says otherwise (mkt_team): the managers, the video people, the designers, social
-- media, and the rest by what their title does. A title it does not know: none (the manager sets it).
CREATE OR REPLACE FUNCTION public.mkt_title_team(p_title text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $fn$
DECLARE
  t text := upper(coalesce(p_title, ''));
BEGIN
  RETURN CASE
    WHEN t LIKE '%MARKETING MANAGER%' THEN 'manager'
    WHEN t LIKE '%VIDEO%' OR t LIKE '%CONTENT%' OR t LIKE '%PHOTO%' THEN 'content'
    WHEN t LIKE '%GRAPHIC%' OR t LIKE '%DESIGN%' THEN 'design'
    WHEN t LIKE '%SOCIAL%' THEN 'social'
    WHEN t LIKE '%VISUAL MERCHANDIS%' OR t LIKE '%EVENT%' OR t LIKE '%BRAND%' THEN 'brand'
    WHEN t LIKE '%ADS%' OR t LIKE '%MARKETING EXECUTIVE%' OR t LIKE '%TELEMARKET%' THEN 'ads'
    ELSE NULL
  END;
END
$fn$;

-- Marketing's roster: the Marketing department's active People (less any its manager took off), and anybody else its
-- manager put on — each with their team, words, colour and capacity, their login, their first name.
CREATE OR REPLACE FUNCTION public.mkt_roster()
RETURNS TABLE (staff_id uuid, user_id uuid, full_name text, first_name text, title text, team text, role_label text,
               color text, capacity integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN QUERY
  SELECT s.id, s.user_id, s.employee_name,
         coalesce(nullif(btrim(s.first_name), ''), split_part(btrim(s.employee_name), ' ', 1)),
         t.name,
         coalesce(m.team, public.mkt_title_team(t.name)),
         m.role_label, m.color, coalesce(m.capacity, 5)
    FROM public.hr_staff_costs s
    LEFT JOIN public.titles t ON t.id = s.title_id
    LEFT JOIN public.departments d ON d.id = s.department_id
    LEFT JOIN public.mkt_team m ON m.staff_id = s.id
   WHERE s.status = 'active'
     AND ((d.segment_key = 'marketing' AND coalesce(m.in_roster, true)) OR coalesce(m.in_roster, false));
END
$fn$;

REVOKE ALL ON FUNCTION public.mkt_me_staff() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_need(text[], text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_title_team(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_roster() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_me_staff() TO service_role;
GRANT EXECUTE ON FUNCTION public.mkt_need(text[], text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mkt_title_team(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mkt_roster() TO service_role;

-- ── The board: what My Space, the Calendar, Projects and Tracking draw ──────

CREATE OR REPLACE FUNCTION public.mkt_board(p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_ids   uuid[];
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.view'], 'Marketing is not open to your account.');
  IF p_from IS NOT NULL AND p_to IS NOT NULL AND (p_to < p_from OR p_to - p_from > 400) THEN
    RAISE EXCEPTION 'Pick a range of at most 400 days.' USING ERRCODE = '22023';
  END IF;
  -- Open, done or stopped lately, or with a stage due in the range asked — at most 1,500, the newest first.
  v_ids := ARRAY(
    SELECT p.id FROM public.mkt_projects p
     WHERE p.status NOT IN ('done', 'cancelled')
        OR p.updated_at > now() - interval '60 days'
        OR (p_from IS NOT NULL AND p_to IS NOT NULL
            AND EXISTS (SELECT 1 FROM public.mkt_stages s WHERE s.project_id = p.id AND s.due_on BETWEEN p_from AND p_to))
     ORDER BY p.updated_at DESC, p.id LIMIT 1500);
  RETURN jsonb_build_object(
    'today', v_today,
    'me', public.mkt_me_staff(),
    'team', coalesce((SELECT jsonb_agg(jsonb_build_object('id', r.staff_id, 'user', r.user_id, 'full', r.full_name,
                                         'first', r.first_name, 'title', r.title, 'team', r.team, 'role', r.role_label,
                                         'color', r.color, 'capacity', r.capacity) ORDER BY r.first_name, r.staff_id)
                        FROM public.mkt_roster() r), '[]'::jsonb),
    'subs', coalesce((SELECT jsonb_agg(jsonb_build_object('id', x.id, 'code', x.code, 'name', x.name, 'dot', x.dot,
                                         'emoji', x.emoji, 'client', x.company_id IS NULL, 'pic', x.pic_name)
                                       ORDER BY x.sort_order, x.name)
                        FROM public.mkt_subsidiaries x WHERE x.active), '[]'::jsonb),
    'projects', coalesce((SELECT jsonb_agg(jsonb_build_object(
                             'id', p.id, 'trackId', p.track_id, 'kind', p.kind, 'sub', p.subsidiary_id, 'title', p.title,
                             'status', p.status, 'workflow', p.workflow_name, 'qType', p.q_type, 'owner', p.owner_staff,
                             'pic', p.pic_name, 'cur', p.cur, 'series', p.series_id, 'run', p.run_no,
                             'recur', CASE WHEN p.kind = 'recurring' AND p.series_id IS NULL THEN p.recur END,
                             'startsOn', p.starts_on, 'dueOn', p.due_on, 'createdAt', p.created_at,
                             'updatedAt', p.updated_at, 'doneAt', p.done_at) ORDER BY x.ord)
                            FROM unnest(v_ids) WITH ORDINALITY AS x(id, ord) JOIN public.mkt_projects p ON p.id = x.id), '[]'::jsonb),
    'stages', coalesce((SELECT jsonb_agg(jsonb_build_object(
                           'project', s.project_id, 'idx', s.idx, 'name', s.name, 'dept', s.dept, 'mode', s.mode,
                           'owner', s.owner_staff, 'extra', s.extra, 'cands', to_jsonb(s.cands), 'sla', s.sla,
                           'appr', s.appr, 'split', s.split, 'startsOn', s.starts_on, 'dueOn', s.due_on,
                           'status', s.status, 'apprIdx', s.appr_idx, 'ver', s.ver, 'changes', s.changes,
                           'enteredAt', s.entered_at, 'acceptedAt', s.accepted_at, 'submittedAt', s.submitted_at,
                           'doneAt', s.done_at) ORDER BY s.project_id, s.idx)
                          FROM public.mkt_stages s WHERE s.project_id = ANY (v_ids)), '[]'::jsonb),
    'subtasks', coalesce((SELECT jsonb_agg(jsonb_build_object(
                             'id', t.id, 'project', t.project_id, 'stage', t.stage_idx, 'title', t.title,
                             'assignee', t.assignee, 'dueOn', t.due_on, 'status', t.status, 'returns', t.returns,
                             'by', t.created_by, 'createdAt', t.created_at, 'updatedAt', t.updated_at)
                           ORDER BY t.created_at, t.id)
                            FROM public.mkt_subtasks t WHERE t.project_id = ANY (v_ids)), '[]'::jsonb),
    -- Every holiday HR keeps (Attendance › Holidays), from a month back to a year ahead: stage dates skip them.
    'holidays', coalesce((SELECT jsonb_agg(jsonb_build_object('day', h.day, 'name', h.name, 'states', h.states) ORDER BY h.day)
                            FROM public.att_holidays h
                           WHERE h.deleted_at IS NULL AND h.day BETWEEN v_today - 31 AND v_today + 366), '[]'::jsonb));
END
$fn$;

-- ── The sidebar ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.mkt_shell()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_me    uuid := public.mkt_me_staff();
  v_mine  jsonb;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.view'], 'Marketing is not open to your account.');
  -- What is on the caller's plate: their stages to accept, work on or fix, the approvals waiting for them, the
  -- deliveries of their subtasks waiting for their review — each with the subsidiary it is for and its due date.
  WITH turn AS (
    SELECT p.subsidiary_id AS sub, s.due_on AS due
      FROM public.mkt_stages s JOIN public.mkt_projects p ON p.id = s.project_id
     WHERE v_me IS NOT NULL AND p.status = 'active' AND NOT (p.kind = 'recurring' AND p.series_id IS NULL) AND p.cur = s.idx
       AND ((s.owner_staff = v_me AND s.status IN ('todo', 'accepted', 'changes'))
         OR (s.status = 'review' AND (s.appr -> s.appr_idx ->> 'kind') = 'person' AND (s.appr -> s.appr_idx ->> 'staff') = v_me::text))
    UNION ALL
    SELECT p.subsidiary_id, t.due_on
      FROM public.mkt_subtasks t
      JOIN public.mkt_stages s ON s.project_id = t.project_id AND s.idx = t.stage_idx
      JOIN public.mkt_projects p ON p.id = t.project_id
     WHERE v_me IS NOT NULL AND p.status = 'active' AND NOT (p.kind = 'recurring' AND p.series_id IS NULL)
       AND p.cur = s.idx AND s.status IN ('accepted', 'changes')
       AND ((s.owner_staff = v_me AND t.assignee <> v_me AND t.status = 'ready')
         OR (t.assignee = v_me AND s.owner_staff IS DISTINCT FROM v_me AND t.status IN ('working', 'revising')))
  )
  SELECT jsonb_build_object(
           'turn', count(*),
           'today', count(*) FILTER (WHERE due <= v_today),
           'subs', coalesce(jsonb_object_agg(sub, n) FILTER (WHERE sub IS NOT NULL), '{}'::jsonb))
    INTO v_mine
    FROM (SELECT sub, due, count(*) OVER (PARTITION BY sub) AS n FROM turn) z;
  RETURN jsonb_build_object(
    'today', v_today,
    'me', (SELECT jsonb_build_object('id', r.staff_id, 'full', r.full_name, 'first', r.first_name, 'title', r.title,
                                     'team', r.team, 'role', r.role_label, 'color', r.color)
             FROM public.mkt_roster() r WHERE r.staff_id = v_me),
    'subs', coalesce((SELECT jsonb_agg(jsonb_build_object('id', x.id, 'code', x.code, 'name', x.name, 'dot', x.dot,
                                         'emoji', x.emoji, 'client', x.company_id IS NULL,
                                         'count', coalesce((v_mine -> 'subs' ->> x.id::text)::int, 0))
                                       ORDER BY x.sort_order, x.name)
                        FROM public.mkt_subsidiaries x WHERE x.active), '[]'::jsonb),
    'counts', jsonb_build_object(
      'myspace', coalesce((v_mine ->> 'turn')::int, 0),
      'calendar', coalesce((v_mine ->> 'today')::int, 0),
      -- Product projects waiting for their manager: minutes to finish, the PIC's changes, a plan to make.
      'projects', CASE WHEN coalesce(public.has_any_action(ARRAY['marketing.manage', 'marketing.create']), false) THEN
                    (SELECT count(*) FROM public.mkt_projects p WHERE p.status IN ('minutes', 'changes', 'approved')) ELSE 0 END,
      -- Ongoing stages past their due date, for whoever tracks them.
      'tracking', CASE WHEN coalesce(public.has_any_action(ARRAY['marketing.manage']), false) THEN
                    (SELECT count(*) FROM public.mkt_stages s JOIN public.mkt_projects p ON p.id = s.project_id
                      WHERE p.cur = s.idx AND p.status = 'active' AND NOT (p.kind = 'recurring' AND p.series_id IS NULL)
                        AND s.status IN ('todo', 'accepted', 'review', 'changes') AND s.due_on < v_today) ELSE 0 END),
    'notices', (SELECT count(*) FROM public.app_notifications n
                 WHERE n.user_id = auth.uid() AND n.kind = 'marketing' AND n.read_at IS NULL));
END
$fn$;

-- ── The top bar's search ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.mkt_search(p_q text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_q text := btrim(coalesce(p_q, ''));
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.view'], 'Marketing is not open to your account.');
  IF length(v_q) < 2 THEN
    RETURN jsonb_build_object('projects', '[]'::jsonb, 'people', '[]'::jsonb);
  END IF;
  IF length(v_q) > 60 THEN
    v_q := left(v_q, 60);
  END IF;
  RETURN jsonb_build_object(
    'projects', coalesce((SELECT jsonb_agg(jsonb_build_object('trackId', z.track_id, 'title', z.title, 'kind', z.kind,
                                             'status', z.status, 'sub', z.subsidiary_id))
                            FROM (SELECT p.track_id, p.title, p.kind, p.status, p.subsidiary_id
                                    FROM public.mkt_projects p
                                   WHERE p.track_id ILIKE '%' || v_q || '%' OR p.title ILIKE '%' || v_q || '%'
                                   ORDER BY (p.status IN ('done', 'cancelled')), p.updated_at DESC LIMIT 8) z), '[]'::jsonb),
    'people', coalesce((SELECT jsonb_agg(jsonb_build_object('id', r.staff_id, 'first', r.first_name, 'full', r.full_name,
                                           'title', r.title, 'team', r.team))
                          FROM (SELECT * FROM public.mkt_roster() x
                                 WHERE x.full_name ILIKE '%' || v_q || '%' OR x.first_name ILIKE '%' || v_q || '%'
                                 ORDER BY x.first_name LIMIT 6) r), '[]'::jsonb));
END
$fn$;

-- ── The bell: the caller's own Marketing notices ────────────────────────────

CREATE OR REPLACE FUNCTION public.mkt_notices(p_limit integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in with an active account.' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id', n.id, 'title', n.title, 'body', n.body, 'ref', n.ref_id,
                                      'at', n.created_at, 'read', n.read_at IS NOT NULL, 'data', n.data)
                                    ORDER BY n.created_at DESC, n.id)
                     FROM (SELECT * FROM public.app_notifications x
                            WHERE x.user_id = auth.uid() AND x.kind = 'marketing'
                            ORDER BY x.created_at DESC, x.id LIMIT least(greatest(coalesce(p_limit, 30), 1), 100)) n), '[]'::jsonb);
END
$fn$;

REVOKE ALL ON FUNCTION public.mkt_board(date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_shell() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_search(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_notices(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_board(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_shell() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_search(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_notices(integer) TO authenticated;
