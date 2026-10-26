-- 20261025101000_marketing_subtasks.sql
-- 2026-10-24 — Marketing ②b-2c: subtasks (`Task Page.dc.html` › ✂️ Split into subtasks and Review delivery; My Space's
-- Delegated by me; `Task Map.dc.html`'s subtask station). The table (mkt_subtasks) is ①'s; this gives it its writes.
--   Split      the current stage's owner, once accepted, on a stage that may split (the Assignment Plan's Subtasks ✓): one
--              deliverable, somebody else on Marketing's roster with a login, a deadline from today to the stage's own.
--   Deliver    its assignee: files uploaded (bucket marketing, under subtask/ — the handoff's 📎 subtitles_BM_EN.srt),
--              links (https) and/or a note; v1, v2 … A file of the version before not sent again loses its bytes' row.
--   Review     the stage's owner: Approve, or Return with a reason (the assignee revises and delivers again); from the
--              third return on, the roster's Marketing managers are told too (the handoff: "Rachel has been notified").
--   Take back  the stage's owner, any not yet approved (a wrong person, a change of plan); its trail line stays, its
--              files' bytes' rows go.
--   The bucket subtask/ is Marketing · Edit's to send to, read as the rest of the bucket (View); a file a delivery
--              names is filed (mkt_lib_unfiled — production's body, deliveries counted), so its sender cannot take it
--              back from under the review.
--   The stage  is submitted (or completed) only once every subtask is approved — mkt_stage_submit, production's body
--              (= 20261023234000's), one check added.
--   The page   mkt_project — production's body (= 20261025035000's) — gives each subtask its delivery.
-- Each writes the project's trail (mkt_log) and tells whom it concerns (mkt_notify); nothing else is notified.
-- PGlite: tests/member-sql/validate-marketing-subtasks.mjs.

-- ── A subtask split off the current stage, by its owner ─────────────────────────────────────
-- To somebody else on Marketing's roster with a login; one deliverable (1–120 characters); a deadline from today to
-- the stage's own. The stage must have been accepted and may split (the Assignment Plan's Subtasks ✓).
CREATE OR REPLACE FUNCTION public.mkt_subtask_add(p_project uuid, p_title text, p_assignee uuid, p_due date)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me    uuid := public.mkt_me_staff();
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_p     public.mkt_projects;
  v_s     public.mkt_stages;
  v_title text;
  v_id    uuid;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.edit'], 'Working on a stage is not open to your account.');
  v_p := public.mkt_open_project(p_project);
  SELECT * INTO v_s FROM public.mkt_stages WHERE project_id = v_p.id AND idx = v_p.cur FOR UPDATE;
  IF v_me IS NULL OR v_s.owner_staff IS DISTINCT FROM v_me THEN
    RAISE EXCEPTION 'This stage is not yours.' USING ERRCODE = '42501';
  END IF;
  IF v_s.status NOT IN ('accepted', 'changes') THEN
    RAISE EXCEPTION 'Accept the stage first — or it is with its approver now.' USING ERRCODE = '22023';
  END IF;
  IF NOT v_s.split THEN
    RAISE EXCEPTION '% does not split into subtasks.', v_s.name USING ERRCODE = '22023';
  END IF;
  v_title := btrim(regexp_replace(coalesce(p_title, ''), '\s+', ' ', 'g'));
  IF length(v_title) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'Name the deliverable — 120 characters at most.' USING ERRCODE = '22023';
  END IF;
  IF p_assignee IS NULL OR p_assignee = v_me
     OR NOT EXISTS (SELECT 1 FROM public.mkt_roster() r WHERE r.staff_id = p_assignee AND r.user_id IS NOT NULL) THEN
    RAISE EXCEPTION 'A subtask goes to somebody else on Marketing''s roster.' USING ERRCODE = '22023';
  END IF;
  IF p_due IS NULL OR p_due < v_today THEN
    RAISE EXCEPTION 'Give it a deadline — today or later.' USING ERRCODE = '22023';
  END IF;
  IF v_s.due_on IS NOT NULL AND p_due > v_s.due_on THEN
    RAISE EXCEPTION 'Must be on or before % — the % stage deadline.', to_char(v_s.due_on, 'FMDD Mon'), v_s.name USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.mkt_subtasks (project_id, stage_idx, title, assignee, due_on, created_by)
  VALUES (v_p.id, v_s.idx, v_title, p_assignee, p_due, auth.uid())
  RETURNING id INTO v_id;
  UPDATE public.mkt_projects SET updated_at = now() WHERE id = v_p.id;
  PERFORM public.mkt_log(v_p.id, 'subtask', v_s.idx, v_s.name, public.mkt_staff_name(p_assignee),
            p_data => jsonb_build_object('subtask', v_id, 'title', v_title, 'to', p_assignee, 'due', p_due));
  PERFORM public.mkt_notify(p_assignee, v_p.id, public.mkt_actor() || ' gave you a subtask: ' || v_title,
            v_p.track_id || ' · ' || v_p.title || ' · due ' || to_char(p_due, 'FMDD Mon'), 'subtask');
  RETURN jsonb_build_object('id', v_p.id, 'track', v_p.track_id, 'subtask', v_id);
END
$fn$;

-- ── A delivery, by the subtask's assignee ───────────────────────────────────────────────────
-- What was made: files uploaded (the handoff's "📎 subtitles_BM_EN.srt"; sent ahead to the bucket under subtask/, ten
-- at most), links (https, ten at most) and/or a note; numbered v1, v2 … as it is returned and sent again. Back to the
-- stage's owner for Review delivery. A file of the last version not sent again loses its bytes' row.
CREATE OR REPLACE FUNCTION public.mkt_subtask_deliver(p_subtask uuid, p_note text, p_links jsonb, p_files jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me    uuid := public.mkt_me_staff();
  v_t     public.mkt_subtasks;
  v_p     public.mkt_projects;
  v_s     public.mkt_stages;
  v_note  text;
  v_links jsonb;
  v_files jsonb := '[]'::jsonb;
  v_e     jsonb;
  v_path  text;
  v_name  text;
  v_o     public.file_objects;
  v_v     integer;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.edit'], 'Working on a subtask is not open to your account.');
  SELECT * INTO v_t FROM public.mkt_subtasks WHERE id = p_subtask;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That subtask is not there.' USING ERRCODE = 'P0002';
  END IF;
  IF v_me IS NULL OR v_t.assignee IS DISTINCT FROM v_me THEN
    RAISE EXCEPTION 'This subtask is not yours.' USING ERRCODE = '42501';
  END IF;
  v_p := public.mkt_open_project(v_t.project_id);
  SELECT * INTO v_t FROM public.mkt_subtasks WHERE id = p_subtask FOR UPDATE;
  SELECT * INTO v_s FROM public.mkt_stages WHERE project_id = v_t.project_id AND idx = v_t.stage_idx;
  IF v_p.cur <> v_t.stage_idx OR v_s.status NOT IN ('accepted', 'changes') THEN
    RAISE EXCEPTION 'Its stage is not open for deliveries now.' USING ERRCODE = '22023';
  END IF;
  IF v_t.status = 'ready' THEN
    RAISE EXCEPTION 'Delivered already — waiting for % to review it.', public.mkt_staff_name(v_s.owner_staff) USING ERRCODE = '22023';
  END IF;
  IF v_t.status = 'approved' THEN
    RAISE EXCEPTION 'Approved already.' USING ERRCODE = '22023';
  END IF;
  v_note := nullif(btrim(coalesce(p_note, '')), '');
  IF length(v_note) > 1000 THEN
    RAISE EXCEPTION 'A note is at most 1,000 characters.' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('url', btrim(e ->> 'url'), 'label', left(btrim(coalesce(e ->> 'label', '')), 120))), '[]'::jsonb)
    INTO v_links
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_links) = 'array' THEN p_links ELSE '[]'::jsonb END) e
   WHERE jsonb_typeof(e) = 'object' AND btrim(coalesce(e ->> 'url', '')) <> '';
  IF jsonb_array_length(v_links) > 10 THEN
    RAISE EXCEPTION 'Ten links at most.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_links) e WHERE (e ->> 'url') !~* '^https?://\S+$' OR length(e ->> 'url') > 500) THEN
    RAISE EXCEPTION 'A link starts with https:// — 500 characters at most.' USING ERRCODE = '22023';
  END IF;
  -- The files: each in the bucket under subtask/, sent by this caller, and no other subtask's.
  FOR v_e IN SELECT e FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_files) = 'array' THEN p_files ELSE '[]'::jsonb END) e LOOP
    v_path := CASE WHEN jsonb_typeof(v_e) = 'object' THEN btrim(coalesce(v_e ->> 'path', '')) ELSE '' END;
    CONTINUE WHEN v_path = '' OR v_files @> jsonb_build_array(jsonb_build_object('path', v_path));
    SELECT * INTO v_o FROM public.file_objects o
     WHERE o.bucket_id = 'marketing' AND o.name = v_path AND o.owner_id = auth.uid()::text;
    IF NOT FOUND OR v_path !~ '^subtask/[0-9a-f-]{36}/[^/]+$' THEN
      RAISE EXCEPTION 'That file has not arrived — upload it again.' USING ERRCODE = 'P0002';
    END IF;
    IF EXISTS (SELECT 1 FROM public.mkt_subtasks x
                WHERE x.id <> v_t.id AND x.delivery -> 'files' @> jsonb_build_array(jsonb_build_object('path', v_path))) THEN
      RAISE EXCEPTION 'That file is another subtask''s.' USING ERRCODE = '23505';
    END IF;
    v_name := left(btrim(regexp_replace(coalesce(v_e ->> 'name', ''), '\s+', ' ', 'g')), 200);
    v_files := v_files || jsonb_build_array(jsonb_build_object('path', v_path,
                 'name', coalesce(nullif(v_name, ''), regexp_replace(v_path, '^.*/', '')),
                 'size', coalesce((v_o.metadata ->> 'size')::bigint, 0), 'mime', coalesce(v_o.metadata ->> 'mimetype', '')));
  END LOOP;
  IF jsonb_array_length(v_files) > 10 THEN
    RAISE EXCEPTION 'Ten files at most.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(v_files) = 0 AND jsonb_array_length(v_links) = 0 AND v_note IS NULL THEN
    RAISE EXCEPTION 'Add a file or a link to what you made, or a note.' USING ERRCODE = '22023';
  END IF;
  v_v := coalesce((v_t.delivery ->> 'v')::integer, 0) + 1;
  UPDATE public.mkt_subtasks
     SET status = 'ready', delivery = jsonb_build_object('v', v_v, 'files', v_files, 'links', v_links, 'note', v_note, 'at', now()),
         updated_at = now()
   WHERE id = v_t.id;
  -- The last version's files not sent again: their bytes' rows go (R2's hourly sweep takes the bytes).
  DELETE FROM public.file_objects o
   WHERE o.bucket_id = 'marketing'
     AND o.name IN (SELECT e ->> 'path' FROM jsonb_array_elements(coalesce(v_t.delivery -> 'files', '[]'::jsonb)) e)
     AND NOT v_files @> jsonb_build_array(jsonb_build_object('path', o.name));
  UPDATE public.mkt_projects SET updated_at = now() WHERE id = v_p.id;
  PERFORM public.mkt_log(v_p.id, 'delivered', v_s.idx, v_s.name, public.mkt_staff_name(v_s.owner_staff), p_version => 'v' || v_v,
            p_data => jsonb_build_object('subtask', v_t.id, 'title', v_t.title, 'links', v_links,
                        'files', (SELECT coalesce(jsonb_agg(f ->> 'name'), '[]'::jsonb) FROM jsonb_array_elements(v_files) f)));
  PERFORM public.mkt_notify(v_s.owner_staff, v_p.id, public.mkt_actor() || ' delivered ' || v_t.title,
            v_p.track_id || ' · ' || v_p.title, 'subtask');
  RETURN jsonb_build_object('id', v_p.id, 'track', v_p.track_id);
END
$fn$;

-- ── Review delivery, by the stage's owner ────────────────────────────────────────────────────
-- Approve it, or return it with a reason (the assignee revises and delivers again). From the third return on, the
-- roster's Marketing managers are told as well.
CREATE OR REPLACE FUNCTION public.mkt_subtask_review(p_subtask uuid, p_approve boolean, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me     uuid := public.mkt_me_staff();
  v_t      public.mkt_subtasks;
  v_p      public.mkt_projects;
  v_s      public.mkt_stages;
  v_reason text;
  v_n      integer;
  v_v      text;
  v_who    text;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.edit'], 'Working on a stage is not open to your account.');
  SELECT * INTO v_t FROM public.mkt_subtasks WHERE id = p_subtask;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That subtask is not there.' USING ERRCODE = 'P0002';
  END IF;
  v_p := public.mkt_open_project(v_t.project_id);
  SELECT * INTO v_t FROM public.mkt_subtasks WHERE id = p_subtask FOR UPDATE;
  SELECT * INTO v_s FROM public.mkt_stages WHERE project_id = v_t.project_id AND idx = v_t.stage_idx;
  IF v_me IS NULL OR v_s.owner_staff IS DISTINCT FROM v_me THEN
    RAISE EXCEPTION 'Only %''s owner reviews its subtasks.', v_s.name USING ERRCODE = '42501';
  END IF;
  IF v_t.status <> 'ready' THEN
    RAISE EXCEPTION 'Nothing delivered to review.' USING ERRCODE = '22023';
  END IF;
  v_v := 'v' || coalesce(v_t.delivery ->> 'v', '1');
  v_who := public.mkt_staff_name(v_t.assignee);
  IF coalesce(p_approve, false) THEN
    UPDATE public.mkt_subtasks SET status = 'approved', updated_at = now() WHERE id = v_t.id;
    PERFORM public.mkt_log(v_p.id, 'delivery approved', v_s.idx, v_s.name, v_who, p_version => v_v,
              p_data => jsonb_build_object('subtask', v_t.id, 'title', v_t.title));
    PERFORM public.mkt_notify(v_t.assignee, v_p.id, public.mkt_actor() || ' approved your delivery: ' || v_t.title,
              v_p.track_id || ' · ' || v_p.title, 'subtask');
  ELSE
    v_reason := btrim(coalesce(p_reason, ''));
    IF length(v_reason) NOT BETWEEN 1 AND 1000 THEN
      RAISE EXCEPTION 'Say what needs to change — 1,000 characters at most.' USING ERRCODE = '22023';
    END IF;
    v_n := v_t.returns + 1;
    UPDATE public.mkt_subtasks SET status = 'revising', returns = v_n, updated_at = now() WHERE id = v_t.id;
    PERFORM public.mkt_log(v_p.id, 'delivery returned', v_s.idx, v_s.name, v_who, p_reason => v_reason, p_version => v_v,
              p_data => jsonb_build_object('subtask', v_t.id, 'title', v_t.title, 'returns', v_n));
    PERFORM public.mkt_notify(v_t.assignee, v_p.id, public.mkt_actor() || ' returned your delivery: ' || v_t.title, v_reason, 'subtask');
    IF v_n >= 3 THEN
      PERFORM public.mkt_notify(r.staff_id, v_p.id, v_who || '''s delivery has been returned ' || v_n || ' times',
                v_t.title || ' · ' || v_p.track_id || ' · ' || v_p.title, 'subtask')
         FROM public.mkt_roster() r
        WHERE r.user_id IS NOT NULL AND upper(coalesce(r.title, '')) LIKE '%MARKETING MANAGER%' AND r.staff_id <> v_me;
    END IF;
  END IF;
  UPDATE public.mkt_projects SET updated_at = now() WHERE id = v_p.id;
  RETURN jsonb_build_object('id', v_p.id, 'track', v_p.track_id);
END
$fn$;

-- ── A subtask taken back, by the stage's owner ──────────────────────────────────────────────
-- Any not yet approved (an approved one is part of the stage's work). Its trail line stays; its files' bytes' rows go.
CREATE OR REPLACE FUNCTION public.mkt_subtask_remove(p_subtask uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me uuid := public.mkt_me_staff();
  v_t  public.mkt_subtasks;
  v_p  public.mkt_projects;
  v_s  public.mkt_stages;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.edit'], 'Working on a stage is not open to your account.');
  SELECT * INTO v_t FROM public.mkt_subtasks WHERE id = p_subtask;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That subtask is not there.' USING ERRCODE = 'P0002';
  END IF;
  v_p := public.mkt_open_project(v_t.project_id);
  SELECT * INTO v_t FROM public.mkt_subtasks WHERE id = p_subtask FOR UPDATE;
  SELECT * INTO v_s FROM public.mkt_stages WHERE project_id = v_t.project_id AND idx = v_t.stage_idx;
  IF v_me IS NULL OR v_s.owner_staff IS DISTINCT FROM v_me THEN
    RAISE EXCEPTION 'Only %''s owner takes a subtask back.', v_s.name USING ERRCODE = '42501';
  END IF;
  IF v_t.status = 'approved' THEN
    RAISE EXCEPTION 'Approved already — it stays.' USING ERRCODE = '22023';
  END IF;
  IF v_p.cur <> v_t.stage_idx OR v_s.status NOT IN ('accepted', 'changes') THEN
    RAISE EXCEPTION 'Its stage is not open now.' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.mkt_subtasks WHERE id = v_t.id;
  DELETE FROM public.file_objects o
   WHERE o.bucket_id = 'marketing'
     AND o.name IN (SELECT e ->> 'path' FROM jsonb_array_elements(coalesce(v_t.delivery -> 'files', '[]'::jsonb)) e);
  UPDATE public.mkt_projects SET updated_at = now() WHERE id = v_p.id;
  PERFORM public.mkt_log(v_p.id, 'subtask removed', v_s.idx, v_s.name, public.mkt_staff_name(v_t.assignee),
            p_data => jsonb_build_object('subtask', v_t.id, 'title', v_t.title));
  PERFORM public.mkt_notify(v_t.assignee, v_p.id, public.mkt_actor() || ' took back a subtask: ' || v_t.title,
            v_p.track_id || ' · ' || v_p.title, 'subtask');
  RETURN jsonb_build_object('id', v_p.id, 'track', v_p.track_id);
END
$fn$;

-- ── A file a delivery names is filed — production's body, deliveries counted ──────────────────────
CREATE OR REPLACE FUNCTION public.mkt_lib_unfiled(p_name text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN NOT EXISTS (SELECT 1 FROM public.mkt_lib_files f WHERE f.path = p_name)
     AND NOT EXISTS (SELECT 1 FROM public.mkt_subsidiaries s
                      WHERE s.profile ->> 'avatar_path' = p_name OR s.profile ->> 'banner_path' = p_name)
     AND NOT EXISTS (SELECT 1 FROM public.mkt_spaces sp
                      WHERE p_name IN (sp.cover_path, sp.avatar_path, sp.photo_path, sp.pet_path))
     AND NOT EXISTS (SELECT 1 FROM public.mkt_subtasks t
                      WHERE t.delivery -> 'files' @> jsonb_build_array(jsonb_build_object('path', p_name)));
END
$fn$;

-- ── A stage submitted or completed — production's body, its subtasks checked first ──────────────────
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
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.edit'], 'Working on a stage is not open to your account.');
  v_p := public.mkt_open_project(p_project);
  SELECT * INTO v_s FROM public.mkt_stages WHERE project_id = v_p.id AND idx = v_p.cur FOR UPDATE;
  IF v_me IS NULL OR v_s.owner_staff IS DISTINCT FROM v_me THEN
    RAISE EXCEPTION 'This stage is not yours.' USING ERRCODE = '42501';
  END IF;
  IF v_s.status NOT IN ('accepted', 'changes') THEN
    RAISE EXCEPTION 'Accept the stage first — or it is with its approver now.' USING ERRCODE = '22023';
  END IF;
  v_missing := public.mkt_stage_missing(v_s.spec, v_s.work);
  IF coalesce(array_length(v_missing, 1), 0) > 0 THEN
    RAISE EXCEPTION 'Fill in %.', array_to_string(v_missing, ', ') USING ERRCODE = '22023';
  END IF;
  -- Its subtasks first (②b-2c): every delivery approved, or the subtask taken back.
  IF EXISTS (SELECT 1 FROM public.mkt_subtasks t WHERE t.project_id = v_p.id AND t.stage_idx = v_s.idx AND t.status <> 'approved') THEN
    RAISE EXCEPTION 'Its subtasks are not all approved yet.' USING ERRCODE = '22023';
  END IF;
  -- The next stage, when it is this stage's owner's to pick (🔓).
  SELECT * INTO v_next FROM public.mkt_stages WHERE project_id = v_p.id AND idx = v_p.cur + 1 FOR UPDATE;
  IF FOUND AND v_next.mode = 'prev' AND v_next.owner_staff IS NULL THEN
    IF p_pick IS NULL OR NOT (p_pick = ANY (v_next.cands)) THEN
      RAISE EXCEPTION 'Pick who takes % next.', v_next.name USING ERRCODE = '22023';
    END IF;
    UPDATE public.mkt_stages SET owner_staff = p_pick WHERE project_id = v_p.id AND idx = v_next.idx;
    PERFORM public.mkt_log(v_p.id, 'picked', v_next.idx, v_next.name, public.mkt_staff_name(p_pick));
  END IF;
  v_first := v_s.appr -> 0;
  IF v_first IS NOT NULL THEN
    v_ver := v_s.ver + 1;
    UPDATE public.mkt_stages
       SET status = 'review', ver = v_ver, appr_idx = 0, submitted_at = now(), changes = NULL
     WHERE project_id = v_p.id AND idx = v_s.idx;
    UPDATE public.mkt_projects SET updated_at = now() WHERE id = v_p.id;
    PERFORM public.mkt_log(v_p.id, 'submitted', v_s.idx, v_s.name,
              CASE WHEN v_first ->> 'kind' = 'pic' THEN 'PIC' ELSE public.mkt_staff_name((v_first ->> 'staff')::uuid) END,
              p_version => 'v' || v_ver);
    IF v_first ->> 'kind' = 'person' THEN
      PERFORM public.mkt_notify((v_first ->> 'staff')::uuid, v_p.id,
                public.mkt_actor() || ' submitted ' || v_s.name || ' v' || v_ver || ' for your approval',
                v_p.track_id || ' · ' || v_p.title, 'review');
    END IF;
  ELSE
    PERFORM public.mkt_log(v_p.id, 'completed', v_s.idx, v_s.name);
    PERFORM public.mkt_advance(v_p.id);
  END IF;
  PERFORM public.mkt_top_up_due();
  RETURN jsonb_build_object('id', v_p.id, 'track', v_p.track_id);
END
$fn$;

-- ── One project — production's body, each subtask with its delivery ──────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_project(p_key text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_today  date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_key    text := btrim(coalesce(p_key, ''));
  v_p      public.mkt_projects;
  v_series uuid;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.view'], 'Marketing is not open to your account.');
  IF v_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT * INTO v_p FROM public.mkt_projects WHERE id = v_key::uuid;
  ELSE
    SELECT * INTO v_p FROM public.mkt_projects WHERE track_id = upper(v_key);
  END IF;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  v_series := coalesce(v_p.series_id, CASE WHEN v_p.kind = 'recurring' THEN v_p.id END);
  RETURN jsonb_build_object(
    'today', v_today,
    'me', public.mkt_me_staff(),
    'team', coalesce((SELECT jsonb_agg(jsonb_build_object('id', r.staff_id, 'user', r.user_id, 'full', r.full_name,
                                         'first', r.first_name, 'title', r.title, 'team', r.team, 'role', r.role_label,
                                         'color', r.color, 'capacity', r.capacity) ORDER BY r.first_name, r.staff_id)
                        FROM public.mkt_roster() r), '[]'::jsonb),
    'sub', (SELECT jsonb_build_object('id', x.id, 'code', x.code, 'name', x.name, 'dot', x.dot, 'emoji', x.emoji,
                                      'client', x.company_id IS NULL, 'pic', x.pic_name)
              FROM public.mkt_subsidiaries x WHERE x.id = v_p.subsidiary_id),
    'project', jsonb_build_object(
      'id', v_p.id, 'trackId', v_p.track_id, 'kind', v_p.kind, 'sub', v_p.subsidiary_id, 'title', v_p.title,
      'status', v_p.status, 'workflow', v_p.workflow_name, 'qType', v_p.q_type, 'brief', v_p.brief,
      'owner', v_p.owner_staff, 'pic', v_p.pic_name, 'pic2', v_p.pic2_name, 'cur', v_p.cur, 'series', v_p.series_id, 'run', v_p.run_no,
      'recur', v_p.recur, 'startsOn', v_p.starts_on, 'dueOn', v_p.due_on, 'createdAt', v_p.created_at,
      'createdBy', (SELECT u.name FROM public.users u WHERE u.id = v_p.created_by),
      'updatedAt', v_p.updated_at, 'doneAt', v_p.done_at,
      'free', CASE WHEN jsonb_typeof(v_p.canvas -> 'free') = 'array' THEN v_p.canvas -> 'free' ELSE '[]'::jsonb END,
      -- A deliverable (②b-2a): its product project, what it is of it, whether its template is locked.
      'parent', (SELECT jsonb_build_object('id', x.id, 'trackId', x.track_id, 'title', x.title, 'status', x.status)
                   FROM public.mkt_projects x WHERE x.id = v_p.parent_id),
      'deliv', v_p.deliv,
      'locked', coalesce((SELECT wv.locked FROM public.mkt_workflow_versions wv
                           WHERE wv.workflow_id = v_p.workflow_id AND wv.version = v_p.workflow_version), false)),
    'stages', coalesce((SELECT jsonb_agg(jsonb_build_object(
                           'project', s.project_id, 'idx', s.idx, 'name', s.name, 'dept', s.dept, 'mode', s.mode,
                           'owner', s.owner_staff, 'extra', s.extra, 'cands', to_jsonb(s.cands), 'sla', s.sla,
                           'appr', s.appr, 'split', s.split, 'spec', s.spec, 'work', s.work, 'startsOn', s.starts_on,
                           'dueOn', s.due_on, 'status', s.status, 'apprIdx', s.appr_idx, 'ver', s.ver,
                           'changes', s.changes, 'enteredAt', s.entered_at, 'acceptedAt', s.accepted_at,
                           'picOk', CASE WHEN s.pic_ok ->> 'ver' = s.ver::text AND s.pic_ok ->> 'lvl' = s.appr_idx::text
                                         THEN s.pic_ok - 'ver' - 'lvl' END,
                           'submittedAt', s.submitted_at, 'doneAt', s.done_at) ORDER BY s.idx)
                          FROM public.mkt_stages s WHERE s.project_id = v_p.id), '[]'::jsonb),
    'subtasks', coalesce((SELECT jsonb_agg(jsonb_build_object(
                             'id', t.id, 'project', t.project_id, 'stage', t.stage_idx, 'title', t.title,
                             'assignee', t.assignee, 'dueOn', t.due_on, 'status', t.status, 'returns', t.returns,
                             'delivery', CASE WHEN t.delivery = '{}'::jsonb THEN NULL ELSE t.delivery END,
                             'by', t.created_by, 'createdAt', t.created_at, 'updatedAt', t.updated_at)
                           ORDER BY t.created_at, t.id)
                            FROM public.mkt_subtasks t WHERE t.project_id = v_p.id), '[]'::jsonb),
    'events', coalesce((SELECT jsonb_agg(jsonb_build_object(
                           'id', e.id, 'at', e.at, 'actor', e.actor_name, 'action', e.action, 'stage', e.stage_idx,
                           'stageName', e.stage_name, 'fromTo', e.from_to, 'reason', e.reason, 'version', e.version,
                           'data', e.data) ORDER BY e.at, e.id)
                          FROM public.mkt_events e WHERE e.project_id = v_p.id), '[]'::jsonb),
    'series', CASE WHEN v_series IS NULL THEN NULL ELSE (
      SELECT jsonb_build_object('id', s.id, 'trackId', s.track_id, 'title', s.title, 'status', s.status,
               'recur', s.recur, 'owner', s.owner_staff,
               'runs', coalesce((SELECT jsonb_agg(jsonb_build_object('id', r.id, 'run', r.run_no, 'trackId', r.track_id,
                                          'status', r.status, 'startsOn', r.starts_on, 'dueOn', r.due_on, 'cur', r.cur,
                                          'stage', (SELECT x.status FROM public.mkt_stages x WHERE x.project_id = r.id AND x.idx = r.cur))
                                        ORDER BY r.run_no)
                                   FROM public.mkt_projects r WHERE r.series_id = s.id), '[]'::jsonb))
        FROM public.mkt_projects s WHERE s.id = v_series) END,
    'holidays', coalesce((SELECT jsonb_agg(jsonb_build_object('day', h.day, 'name', h.name) ORDER BY h.day)
                            FROM public.att_holidays h
                           WHERE h.deleted_at IS NULL AND h.day BETWEEN v_today - 31 AND v_today + 366
                             AND public.mkt_holiday_ok(h.states)), '[]'::jsonb));
END
$fn$;

-- ── Who may call what ──────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.mkt_subtask_add(uuid, text, uuid, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_subtask_deliver(uuid, text, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_subtask_review(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_subtask_remove(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_subtask_add(uuid, text, uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_subtask_deliver(uuid, text, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_subtask_review(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_subtask_remove(uuid) TO authenticated;

-- ── A delivery's files: sent under subtask/ by Marketing · Edit ──────────────────────────────
DROP POLICY IF EXISTS mkt_subtask_upload ON public.file_objects;
CREATE POLICY mkt_subtask_upload ON public.file_objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'marketing' AND (storage.foldername(name))[1] = 'subtask'
              AND (SELECT public.has_any_action(ARRAY['marketing.edit'])));

NOTIFY pgrst, 'reload schema';
