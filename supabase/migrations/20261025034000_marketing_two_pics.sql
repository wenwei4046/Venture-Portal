-- 20261025034000_marketing_two_pics.sql
-- 2026-10-24 — Marketing ②b-2d-2a: a client's details edited, and a company's second PIC (the user's answer 29 —
-- "Clients may be renamed, their PIC changed; a company may carry one or two PICs; one PIC's approval is enough unless a
-- step needs both"). Both PICs on the subsidiary and on a product project; each PIC their own link (/t/<code>); either
-- one's answer counts — "both" per approval comes next (②b-2d-2b).
--
-- mkt_subsidiaries + pic2_name, pic2_whatsapp; mkt_projects + pic2_name, pic2_whatsapp, link2_code (the second PIC's
--   own link: made when the minutes are sent with them named — or when they are named after — and gone when they are
--   taken off, so a link handed to somebody no longer a PIC closes).
-- New (SECURITY DEFINER; PUBLIC and anon revoked, `authenticated` granted; Marketing · Manage):
--   mkt_sub_edit(sub, patch)  a client's name (Marketing's own clients only — a group company's name is its own), its
--                             PIC and their WhatsApp, its second PIC and theirs — only what the patch names changes; a
--                             second PIC needs a first. The history: audit_changes (mkt_subsidiaries is audited).
-- Replaced from production's bodies (md5 equal — 20261025032000's, 20261024002000's, 20261024003000's; mkt_pic_page and
-- mkt_pic_stage_answer 20261025033000's, applied the same day):
--   mkt_board             the subsidiaries carry both PICs and their WhatsApp numbers
--   mkt_product_start     a project starts with its subsidiary's two PICs
--   mkt_product_project   + the second PIC, their WhatsApp, their link
--   mkt_minutes_fill      + pic2 / whatsapp2 (the intake minutes'); the PICs go to the project's deliverables too. Only a
--                         change of the FIRST PIC sends approved minutes back to the PIC — either PIC's approval counts
--   mkt_minutes_send      the second PIC's link too; their WhatsApp asked when they are named; the trail names both
--   mkt_project_resend    the trail names both
--   mkt_product_begin     the deliverables carry both PICs
--   mkt_pic_page          either PIC's link: which one holds it ('you' 1 · 2), their name, the other's; whose each answer was
--   mkt_pic_answer        either PIC's link; the reply and the trail say which PIC answered
--   mkt_pic_stage_answer  the same, on a deliverable's stage
-- PGlite: tests/member-sql/validate-marketing-two-pics.mjs.

-- ── The second PIC ───────────────────────────────────────────────────────────────
ALTER TABLE public.mkt_subsidiaries ADD COLUMN IF NOT EXISTS pic2_name text CHECK (length(pic2_name) <= 80);
ALTER TABLE public.mkt_subsidiaries ADD COLUMN IF NOT EXISTS pic2_whatsapp text CHECK (length(pic2_whatsapp) <= 40);
ALTER TABLE public.mkt_projects ADD COLUMN IF NOT EXISTS pic2_name text CHECK (length(pic2_name) <= 80);
ALTER TABLE public.mkt_projects ADD COLUMN IF NOT EXISTS pic2_whatsapp text CHECK (length(pic2_whatsapp) <= 40);
ALTER TABLE public.mkt_projects ADD COLUMN IF NOT EXISTS link2_code text UNIQUE;

-- ── A client's details edited ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_sub_edit(p_sub uuid, p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  v_s     public.mkt_subsidiaries;
  v_key   text;
  v_name  text;
  v_pic   text;
  v_wa    text;
  v_pic2  text;
  v_wa2   text;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'Editing a client is the manager''s.');
  IF jsonb_typeof(v_patch) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Nothing to save.' USING ERRCODE = '22023';
  END IF;
  FOR v_key IN SELECT jsonb_object_keys(v_patch) LOOP
    IF v_key NOT IN ('name', 'pic', 'whatsapp', 'pic2', 'whatsapp2') THEN
      RAISE EXCEPTION '"%" is not a client''s to change.', v_key USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(v_patch -> v_key) NOT IN ('string', 'null') THEN
      RAISE EXCEPTION 'Not words: %.', v_key USING ERRCODE = '22023';
    END IF;
  END LOOP;
  SELECT * INTO v_s FROM public.mkt_subsidiaries WHERE id = p_sub AND active FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That client is not there.' USING ERRCODE = 'P0002';
  END IF;
  v_name := v_s.name;
  v_pic := v_s.pic_name;
  v_wa := v_s.pic_whatsapp;
  v_pic2 := v_s.pic2_name;
  v_wa2 := v_s.pic2_whatsapp;

  IF v_patch ? 'name' THEN
    v_name := regexp_replace(btrim(coalesce(v_patch ->> 'name', '')), '\s+', ' ', 'g');
    IF v_name IS DISTINCT FROM v_s.name THEN
      IF v_s.company_id IS NOT NULL THEN
        RAISE EXCEPTION 'A group company keeps its own name — only Marketing''s clients are renamed here.' USING ERRCODE = '22023';
      END IF;
      IF length(v_name) NOT BETWEEN 1 AND 80 THEN
        RAISE EXCEPTION 'Name the client — at most 80 characters.' USING ERRCODE = '22023';
      END IF;
      -- As mkt_sub_add: a name on the list already (a group company's too, whatever the case) is refused.
      PERFORM pg_advisory_xact_lock(hashtext('mkt_sub_add'));
      IF EXISTS (SELECT 1 FROM public.mkt_subsidiaries x WHERE lower(x.name) = lower(v_name) AND x.active AND x.id <> v_s.id) THEN
        RAISE EXCEPTION '% is on the list already.', v_name USING ERRCODE = '23505';
      END IF;
    END IF;
  END IF;
  IF v_patch ? 'pic' THEN
    v_pic := nullif(regexp_replace(btrim(coalesce(v_patch ->> 'pic', '')), '\s+', ' ', 'g'), '');
  END IF;
  IF v_patch ? 'pic2' THEN
    v_pic2 := nullif(regexp_replace(btrim(coalesce(v_patch ->> 'pic2', '')), '\s+', ' ', 'g'), '');
  END IF;
  IF length(v_pic) > 80 OR length(v_pic2) > 80 THEN
    RAISE EXCEPTION 'A PIC''s name of at most 80 characters.' USING ERRCODE = '22023';
  END IF;
  IF v_patch ? 'whatsapp' THEN
    v_wa := nullif(btrim(coalesce(v_patch ->> 'whatsapp', '')), '');
  END IF;
  IF v_patch ? 'whatsapp2' THEN
    v_wa2 := nullif(btrim(coalesce(v_patch ->> 'whatsapp2', '')), '');
  END IF;
  IF length(v_wa) > 40 OR v_wa !~ '^[+0-9 ()-]+$' OR length(v_wa2) > 40 OR v_wa2 !~ '^[+0-9 ()-]+$' THEN
    RAISE EXCEPTION 'A WhatsApp number, digits only.' USING ERRCODE = '22023';
  END IF;
  IF v_pic2 IS NOT NULL AND v_pic IS NULL THEN
    RAISE EXCEPTION 'Name the first PIC before a second.' USING ERRCODE = '22023';
  END IF;
  IF v_pic2 IS NOT NULL AND lower(v_pic2) = lower(v_pic) THEN
    RAISE EXCEPTION 'The second PIC is somebody else.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.mkt_subsidiaries
     SET name = v_name, pic_name = v_pic, pic_whatsapp = v_wa, pic2_name = v_pic2, pic2_whatsapp = v_wa2, updated_at = now()
   WHERE id = v_s.id
  RETURNING * INTO v_s;
  RETURN jsonb_build_object('id', v_s.id, 'code', v_s.code, 'name', v_s.name, 'dot', v_s.dot, 'emoji', v_s.emoji,
                            'client', v_s.company_id IS NULL, 'pic', v_s.pic_name, 'whatsapp', v_s.pic_whatsapp,
                            'pic2', v_s.pic2_name, 'whatsapp2', v_s.pic2_whatsapp);
END
$fn$;

REVOKE ALL ON FUNCTION public.mkt_sub_edit(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_sub_edit(uuid, jsonb) TO authenticated;

-- ── The board: both PICs on each subsidiary ──────────────────────────────────────

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
  -- Open, done or stopped lately, or with a stage due in the range asked — at most 1,500, the newest first. A run of a
  -- recurring task before its day, or held by a pause, is not on it: its series draws it. Nor is a deliverable not
  -- planned yet, or before its start day: its product project lists it (②b-2a).
  v_ids := ARRAY(
    SELECT p.id FROM public.mkt_projects p
     WHERE NOT (p.series_id IS NOT NULL AND (p.starts_on > v_today OR p.status = 'paused'))
       AND NOT (p.parent_id IS NOT NULL AND (p.status = 'planning' OR p.starts_on > v_today))
       AND (p.status NOT IN ('done', 'cancelled')
        OR p.updated_at > now() - interval '60 days'
        OR (p_from IS NOT NULL AND p_to IS NOT NULL
            AND EXISTS (SELECT 1 FROM public.mkt_stages s WHERE s.project_id = p.id AND s.due_on BETWEEN p_from AND p_to)))
     ORDER BY p.updated_at DESC, p.id LIMIT 1500);
  RETURN jsonb_build_object(
    'today', v_today,
    'me', public.mkt_me_staff(),
    'team', coalesce((SELECT jsonb_agg(jsonb_build_object('id', r.staff_id, 'user', r.user_id, 'full', r.full_name,
                                         'first', r.first_name, 'title', r.title, 'team', r.team, 'role', r.role_label,
                                         'color', r.color, 'capacity', r.capacity) ORDER BY r.first_name, r.staff_id)
                        FROM public.mkt_roster() r), '[]'::jsonb),
    'subs', coalesce((SELECT jsonb_agg(jsonb_build_object('id', x.id, 'code', x.code, 'name', x.name, 'dot', x.dot,
                                         'emoji', x.emoji, 'client', x.company_id IS NULL, 'pic', x.pic_name,
                                         'whatsapp', x.pic_whatsapp, 'pic2', x.pic2_name, 'whatsapp2', x.pic2_whatsapp)
                                       ORDER BY x.sort_order, x.name)
                        FROM public.mkt_subsidiaries x WHERE x.active), '[]'::jsonb),
    'projects', coalesce((SELECT jsonb_agg(jsonb_build_object(
                             'id', p.id, 'trackId', p.track_id, 'kind', p.kind, 'sub', p.subsidiary_id, 'title', p.title,
                             'status', p.status, 'workflow', p.workflow_name, 'qType', p.q_type, 'owner', p.owner_staff,
                             'pic', p.pic_name, 'cur', p.cur, 'series', p.series_id, 'run', p.run_no, 'parent', p.parent_id,
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
    -- The holidays HR keeps for Selangor (Attendance › Holidays), from a month back to a year ahead: stage dates skip them.
    'holidays', coalesce((SELECT jsonb_agg(jsonb_build_object('day', h.day, 'name', h.name, 'states', h.states) ORDER BY h.day)
                            FROM public.att_holidays h
                           WHERE h.deleted_at IS NULL AND h.day BETWEEN v_today - 31 AND v_today + 366
                             AND public.mkt_holiday_ok(h.states)), '[]'::jsonb));
END
$fn$;

-- ── A product project starts with its subsidiary's PICs ──────────────────────────

CREATE OR REPLACE FUNCTION public.mkt_product_start(p_sub uuid, p_product uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_today  date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_me     uuid := public.mkt_me_staff();
  v_sub    public.mkt_subsidiaries;
  v_ver    integer;
  v_pv     public.mkt_product_versions;
  v_mv     public.mkt_minutes_versions;
  v_tname  text;
  v_att    text;
  v_track  text;
  v_id     uuid;
  v_min    uuid;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'Starting a product project is the manager''s.');
  SELECT * INTO v_sub FROM public.mkt_subsidiaries WHERE id = p_sub AND active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pick who the project is for.' USING ERRCODE = '22023';
  END IF;
  v_ver := public.mkt_product_in_effect(p_product);
  IF v_ver IS NULL THEN
    RAISE EXCEPTION 'That product is not on sale today.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_pv FROM public.mkt_product_versions WHERE product_id = p_product AND version = v_ver;
  SELECT * INTO v_mv FROM public.mkt_minutes_versions WHERE template_id = v_pv.intake_id AND version = v_pv.intake_version;
  v_tname := (SELECT t.name FROM public.mkt_minutes_templates t WHERE t.id = v_pv.intake_id);
  v_att := (SELECT f ->> 'name' FROM jsonb_array_elements(v_mv.fields) f
             WHERE f ->> 'type' = 'People' AND coalesce((f -> 'lock') = 'true'::jsonb, false) LIMIT 1);

  v_track := public.mkt_next_track('MKT', v_sub.code);
  INSERT INTO public.mkt_projects (track_id, kind, subsidiary_id, title, status, product_id, product_version, owner_staff,
                                   pic_name, pic_whatsapp, pic2_name, pic2_whatsapp, created_by)
  VALUES (v_track, 'product', v_sub.id, left(v_sub.name || ' · ' || v_pv.name || ' · ' || to_char(v_today, 'Mon YYYY'), 140),
          'minutes', p_product, v_ver, v_me, v_sub.pic_name, v_sub.pic_whatsapp, v_sub.pic2_name, v_sub.pic2_whatsapp, auth.uid())
  RETURNING id INTO v_id;
  -- Whoever starts it attends the meeting.
  INSERT INTO public.mkt_minutes (project_id, template_id, template_version, intake, title, vals, created_by, updated_by)
  VALUES (v_id, v_pv.intake_id, v_pv.intake_version, true, left(coalesce(v_tname, 'Meeting minutes'), 80),
          CASE WHEN v_me IS NOT NULL AND v_att IS NOT NULL THEN jsonb_build_object(v_att, jsonb_build_array(v_me)) ELSE '{}'::jsonb END,
          auth.uid(), auth.uid())
  RETURNING id INTO v_min;
  PERFORM public.mkt_log(v_id, 'created', p_data => jsonb_build_object('product', v_pv.name, 'version', v_ver));
  RETURN jsonb_build_object('id', v_id, 'track', v_track, 'minutes', v_min);
END
$fn$;

-- ── A product project's page: + the second PIC and their link ───────────────────

CREATE OR REPLACE FUNCTION public.mkt_product_project(p_key text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_key text := btrim(coalesce(p_key, ''));
  v_p   public.mkt_projects;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.view'], 'Marketing is not open to your account.');
  IF v_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT * INTO v_p FROM public.mkt_projects WHERE id = v_key::uuid;
  ELSE
    SELECT * INTO v_p FROM public.mkt_projects WHERE track_id = upper(v_key);
  END IF;
  IF NOT FOUND OR v_p.kind <> 'product' THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object(
    'today', (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date,
    'me', public.mkt_me_staff(),
    'team', coalesce((SELECT jsonb_agg(jsonb_build_object('id', r.staff_id, 'user', r.user_id, 'full', r.full_name,
                                         'first', r.first_name, 'title', r.title, 'team', r.team, 'role', r.role_label,
                                         'color', r.color, 'capacity', r.capacity) ORDER BY r.first_name, r.staff_id)
                        FROM public.mkt_roster() r), '[]'::jsonb),
    'sub', (SELECT jsonb_build_object('id', x.id, 'code', x.code, 'name', x.name, 'dot', x.dot, 'emoji', x.emoji,
                                      'client', x.company_id IS NULL, 'pic', x.pic_name)
              FROM public.mkt_subsidiaries x WHERE x.id = v_p.subsidiary_id),
    'project', jsonb_build_object(
      'id', v_p.id, 'track', v_p.track_id, 'title', v_p.title, 'status', v_p.status, 'owner', v_p.owner_staff,
      'ownerName', public.mkt_staff_name(v_p.owner_staff), 'pic', v_p.pic_name, 'whatsapp', v_p.pic_whatsapp,
      'pic2', v_p.pic2_name, 'whatsapp2', v_p.pic2_whatsapp, 'link2', v_p.link2_code,
      'link', v_p.link_code, 'linkSentAt', v_p.link_sent_at, 'picReply', v_p.pic_reply, 'override', v_p.override,
      'createdAt', v_p.created_at,
      'product', (SELECT jsonb_build_object('id', pv.product_id, 'version', pv.version, 'name', pv.name, 'kind', pv.kind,
                                            'note', pv.note)
                    FROM public.mkt_product_versions pv WHERE pv.product_id = v_p.product_id AND pv.version = v_p.product_version)),
    'minutes', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', m.id, 'title', m.title, 'intake', m.intake, 'status', m.status, 'locked', m.locked, 'rev', m.rev,
               'vals', m.vals, 'signed', m.signed, 'notes', m.notes, 'completedAt', m.completed_at, 'completedBy', m.completed_by,
               'updatedAt', m.updated_at, 'updatedBy', (SELECT u.name FROM public.users u WHERE u.id = m.updated_by),
               'template', jsonb_build_object('id', m.template_id, 'version', m.template_version,
                                              'name', (SELECT t.name FROM public.mkt_minutes_templates t WHERE t.id = m.template_id),
                                              'fields', mv.fields, 'rules', mv.rules))
             ORDER BY m.intake DESC, m.created_at, m.id)
        FROM public.mkt_minutes m
        JOIN public.mkt_minutes_versions mv ON mv.template_id = m.template_id AND mv.version = m.template_version
       WHERE m.project_id = v_p.id), '[]'::jsonb),
    'trail', coalesce((
      SELECT jsonb_agg(jsonb_build_object('at', e.at, 'actor', e.actor_name, 'action', e.action, 'reason', e.reason,
                                          'data', e.data) ORDER BY e.id DESC)
        FROM (SELECT * FROM public.mkt_events WHERE project_id = v_p.id ORDER BY id DESC LIMIT 40) e), '[]'::jsonb),
    -- Its deliverables (②b-2a): each with where it stands — its stage now and whose, how many of its stages are done.
    'deliverables', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', d.id, 'trackId', d.track_id, 'title', d.title, 'status', d.status, 'cur', d.cur, 'deliv', d.deliv,
               'workflow', d.workflow_name, 'startsOn', d.starts_on, 'dueOn', d.due_on, 'doneAt', d.done_at,
               'stages', (SELECT count(*) FROM public.mkt_stages s WHERE s.project_id = d.id),
               'done', (SELECT count(*) FROM public.mkt_stages s WHERE s.project_id = d.id AND s.status = 'done'),
               'stage', (SELECT jsonb_build_object('idx', s.idx, 'name', s.name, 'status', s.status, 'owner', s.owner_staff,
                                                   'dueOn', s.due_on)
                           FROM public.mkt_stages s WHERE s.project_id = d.id AND s.idx = d.cur))
             ORDER BY d.track_id)
        FROM public.mkt_projects d WHERE d.parent_id = v_p.id), '[]'::jsonb));
END
$fn$;

-- ── The intake minutes: + the second PIC ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.mkt_minutes_fill(p_minutes uuid, p_rev integer, p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_m       public.mkt_minutes;
  v_p       public.mkt_projects;
  v_mv      public.mkt_minutes_versions;
  v_patch   jsonb := coalesce(p_patch, '{}'::jsonb);
  v_vals    jsonb;
  v_key     text;
  v_f       jsonb;
  v_v       jsonb;
  v_roster  uuid[] := ARRAY(SELECT r.staff_id FROM public.mkt_roster() r);
  v_x       uuid;
  v_seen    text[] := '{}';
  v_pic     text;
  v_wa      text;
  v_pic2    text;
  v_wa2     text;
  v_notes   text;
  v_att     uuid[];
  v_signed  jsonb;
  v_by      text;
  v_reapp   boolean := false;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'Writing the minutes is the manager''s.');
  IF jsonb_typeof(v_patch) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Nothing to save.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_m FROM public.mkt_minutes WHERE id = p_minutes FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Those minutes are not there any more.' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_p FROM public.mkt_projects WHERE id = v_m.project_id FOR UPDATE;
  IF v_p.status IN ('done', 'cancelled') THEN
    RAISE EXCEPTION 'That project is closed.' USING ERRCODE = '22023';
  END IF;
  IF p_rev IS DISTINCT FROM v_m.rev THEN
    v_by := coalesce((SELECT u.name FROM public.users u WHERE u.id = v_m.updated_by), 'Somebody');
    RAISE EXCEPTION '% changed these minutes since you opened them — reload to see them.', v_by USING ERRCODE = '40001';
  END IF;
  IF v_m.locked THEN
    RAISE EXCEPTION 'These minutes are locked.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_mv FROM public.mkt_minutes_versions WHERE template_id = v_m.template_id AND version = v_m.template_version;

  v_vals := v_m.vals;
  IF v_patch ? 'vals' THEN
    IF jsonb_typeof(v_patch -> 'vals') IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Not a set of answers.' USING ERRCODE = '22023';
    END IF;
    FOR v_key IN SELECT jsonb_object_keys(v_patch -> 'vals') LOOP
      v_f := (SELECT f FROM jsonb_array_elements(v_mv.fields) f WHERE f ->> 'name' = v_key LIMIT 1);
      IF v_f IS NULL THEN
        RAISE EXCEPTION '"%" is not on these minutes.', v_key USING ERRCODE = '22023';
      END IF;
      v_v := public.mkt_minutes_value(v_f, v_patch -> 'vals' -> v_key);
      IF v_f ->> 'type' = 'People' AND v_v IS NOT NULL THEN
        -- Somebody already listed stays though they left the team; somebody new is on it.
        FOR v_x IN SELECT x::uuid FROM jsonb_array_elements_text(v_v) x LOOP
          IF NOT (v_x = ANY (v_roster)) AND NOT coalesce((v_m.vals -> v_key) @> to_jsonb(ARRAY[v_x::text]), false) THEN
            RAISE EXCEPTION '"%": somebody who is not on the team.', v_key USING ERRCODE = '22023';
          END IF;
        END LOOP;
      END IF;
      IF (v_vals -> v_key) IS DISTINCT FROM v_v AND coalesce((v_f -> 'pic') = 'true'::jsonb, false) THEN
        v_seen := v_seen || v_key;
      END IF;
      v_vals := CASE WHEN v_v IS NULL THEN v_vals - v_key ELSE jsonb_set(v_vals, ARRAY[v_key], v_v) END;
    END LOOP;
  END IF;

  v_notes := CASE WHEN v_patch ? 'notes' THEN coalesce(v_patch ->> 'notes', '') ELSE v_m.notes END;
  IF length(v_notes) > 4000 THEN
    RAISE EXCEPTION 'Meeting notes of at most 4000 characters.' USING ERRCODE = '22023';
  END IF;
  v_pic := v_p.pic_name;
  v_wa := v_p.pic_whatsapp;
  v_pic2 := v_p.pic2_name;
  v_wa2 := v_p.pic2_whatsapp;
  IF (v_patch ? 'pic' OR v_patch ? 'whatsapp' OR v_patch ? 'pic2' OR v_patch ? 'whatsapp2') AND NOT v_m.intake THEN
    RAISE EXCEPTION 'The PIC is set on the intake minutes.' USING ERRCODE = '22023';
  END IF;
  IF v_patch ? 'pic' THEN
    v_pic := nullif(btrim(coalesce(v_patch ->> 'pic', '')), '');
    IF length(v_pic) > 80 THEN
      RAISE EXCEPTION 'A PIC''s name of at most 80 characters.' USING ERRCODE = '22023';
    END IF;
    IF v_pic IS DISTINCT FROM v_p.pic_name THEN
      v_seen := v_seen || 'PIC name'::text;
    END IF;
  END IF;
  IF v_patch ? 'whatsapp' THEN
    v_wa := nullif(btrim(coalesce(v_patch ->> 'whatsapp', '')), '');
    IF length(v_wa) > 40 OR v_wa !~ '^[+0-9 ()-]+$' THEN
      RAISE EXCEPTION 'A WhatsApp number, digits only.' USING ERRCODE = '22023';
    END IF;
  END IF;
  -- The second PIC (2026-10-24 — the user's answer 29), on their own link. Either PIC's approval counts, so a change of
  -- the second sends nothing back.
  IF v_patch ? 'pic2' THEN
    v_pic2 := nullif(btrim(coalesce(v_patch ->> 'pic2', '')), '');
    IF length(v_pic2) > 80 THEN
      RAISE EXCEPTION 'A PIC''s name of at most 80 characters.' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF v_patch ? 'whatsapp2' THEN
    v_wa2 := nullif(btrim(coalesce(v_patch ->> 'whatsapp2', '')), '');
    IF length(v_wa2) > 40 OR v_wa2 !~ '^[+0-9 ()-]+$' THEN
      RAISE EXCEPTION 'A WhatsApp number, digits only.' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Whoever is no longer an attendee no longer signs.
  v_att := public.mkt_minutes_attendees(v_mv.fields, v_vals);
  v_signed := coalesce((SELECT jsonb_object_agg(k, v) FROM jsonb_each(v_m.signed) s(k, v) WHERE k::uuid = ANY (v_att)), '{}'::jsonb);

  -- Approved, then changed where the PIC sees: the PIC approves again.
  IF v_m.intake AND v_p.status = 'approved' AND coalesce((v_mv.rules -> 'pic') = 'true'::jsonb, false)
     AND cardinality(v_seen) > 0 THEN
    v_reapp := true;
    UPDATE public.mkt_projects SET status = 'waiting_pic', link_sent_at = now(), pic_reply = NULL, updated_at = now()
     WHERE id = v_p.id;
    PERFORM public.mkt_log(v_p.id, 'edited after approval', p_reason => array_to_string(v_seen, ', '),
                           p_data => jsonb_build_object('fields', to_jsonb(v_seen)));
  END IF;
  IF v_patch ? 'pic' OR v_patch ? 'whatsapp' OR v_patch ? 'pic2' OR v_patch ? 'whatsapp2' THEN
    -- The second PIC's own link: made when they are named once the link has gone out, gone when they are taken off.
    UPDATE public.mkt_projects
       SET pic_name = v_pic, pic_whatsapp = v_wa, pic2_name = v_pic2, pic2_whatsapp = v_wa2,
           link2_code = CASE WHEN v_pic2 IS NULL THEN NULL
                             WHEN link_code IS NOT NULL THEN coalesce(link2_code, replace(gen_random_uuid()::text, '-', ''))
                             ELSE link2_code END,
           updated_at = now()
     WHERE id = v_p.id;
    -- Its deliverables name the same PICs.
    UPDATE public.mkt_projects SET pic_name = v_pic, pic_whatsapp = v_wa, pic2_name = v_pic2, pic2_whatsapp = v_wa2
     WHERE parent_id = v_p.id;
  END IF;

  UPDATE public.mkt_minutes
     SET vals = v_vals, signed = v_signed, notes = v_notes,
         status = CASE WHEN v_reapp THEN 'sent' ELSE status END,
         completed_at = CASE WHEN v_reapp THEN NULL ELSE completed_at END,
         completed_by = CASE WHEN v_reapp THEN NULL ELSE completed_by END,
         rev = rev + 1, updated_by = auth.uid(), updated_at = now()
   WHERE id = v_m.id
  RETURNING * INTO v_m;
  RETURN jsonb_build_object('rev', v_m.rev, 'minutes', v_m.status, 'reapproval', v_reapp,
                            'status', (SELECT p.status FROM public.mkt_projects p WHERE p.id = v_m.project_id));
END
$fn$;

-- ── The minutes sent: each PIC their own link ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.mkt_minutes_send(p_minutes uuid, p_rev integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_m       public.mkt_minutes;
  v_p       public.mkt_projects;
  v_mv      public.mkt_minutes_versions;
  v_missing text[];
  v_unsign  text[];
  v_by      text;
  v_link    text;
  v_link2   text;
  v_names   text;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'Sending the minutes is the manager''s.');
  SELECT * INTO v_m FROM public.mkt_minutes WHERE id = p_minutes FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Those minutes are not there any more.' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_p FROM public.mkt_projects WHERE id = v_m.project_id FOR UPDATE;
  IF NOT v_m.intake OR v_p.kind <> 'product' THEN
    RAISE EXCEPTION 'Only a product project''s intake minutes go to the PIC.' USING ERRCODE = '22023';
  END IF;
  IF p_rev IS DISTINCT FROM v_m.rev THEN
    v_by := coalesce((SELECT u.name FROM public.users u WHERE u.id = v_m.updated_by), 'Somebody');
    RAISE EXCEPTION '% changed these minutes since you opened them — reload to see them.', v_by USING ERRCODE = '40001';
  END IF;
  IF v_p.status <> 'minutes' THEN
    RAISE EXCEPTION 'These minutes were sent already.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_mv FROM public.mkt_minutes_versions WHERE template_id = v_m.template_id AND version = v_m.template_version;
  v_missing := public.mkt_minutes_missing(v_mv.fields, v_m.vals);
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'Still to fill in: %.', array_to_string(v_missing, ', ') USING ERRCODE = '22023';
  END IF;
  IF nullif(btrim(coalesce(v_p.pic_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Name the PIC.' USING ERRCODE = '22023';
  END IF;
  -- The link goes to the PIC on WhatsApp (⭐ on the handoff's meeting card) — when they approve on it.
  IF coalesce((v_mv.rules -> 'pic') = 'true'::jsonb, false)
     AND length(regexp_replace(coalesce(v_p.pic_whatsapp, ''), '[^0-9]', '', 'g')) < 8 THEN
    RAISE EXCEPTION 'Add the PIC''s WhatsApp.' USING ERRCODE = '22023';
  END IF;
  IF coalesce((v_mv.rules -> 'pic') = 'true'::jsonb, false) AND nullif(btrim(coalesce(v_p.pic2_name, '')), '') IS NOT NULL
     AND length(regexp_replace(coalesce(v_p.pic2_whatsapp, ''), '[^0-9]', '', 'g')) < 8 THEN
    RAISE EXCEPTION 'Add the second PIC''s WhatsApp.' USING ERRCODE = '22023';
  END IF;
  IF coalesce((v_mv.rules -> 'sign') = 'true'::jsonb, false)
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(v_mv.fields) f WHERE f ->> 'type' = 'Signature') THEN
    v_unsign := ARRAY(SELECT coalesce(public.mkt_staff_name(a), 'Somebody') FROM unnest(public.mkt_minutes_attendees(v_mv.fields, v_m.vals)) a
                       WHERE NOT (v_m.signed ? a::text));
    IF cardinality(v_unsign) > 0 THEN
      RAISE EXCEPTION 'Waiting for signatures: %.', array_to_string(v_unsign, ', ') USING ERRCODE = '22023';
    END IF;
  END IF;

  v_link := coalesce(v_p.link_code, replace(gen_random_uuid()::text, '-', ''));
  -- Each PIC their own link (2026-10-24 — the user's answer 29): the second PIC's when they are named.
  v_link2 := CASE WHEN nullif(btrim(coalesce(v_p.pic2_name, '')), '') IS NOT NULL
                  THEN coalesce(v_p.link2_code, replace(gen_random_uuid()::text, '-', '')) END;
  v_names := v_p.pic_name || coalesce(' and ' || nullif(btrim(coalesce(v_p.pic2_name, '')), ''), '');
  IF coalesce((v_mv.rules -> 'pic') = 'true'::jsonb, false) THEN
    UPDATE public.mkt_minutes SET status = 'sent', rev = rev + 1, updated_by = auth.uid(), updated_at = now()
     WHERE id = v_m.id RETURNING * INTO v_m;
    UPDATE public.mkt_projects SET status = 'waiting_pic', link_code = v_link, link2_code = v_link2, link_sent_at = now(),
                                   pic_reply = NULL, updated_at = now()
     WHERE id = v_p.id;
    PERFORM public.mkt_log(v_p.id, 'link sent', p_reason => v_names);
  ELSE
    UPDATE public.mkt_minutes
       SET status = 'completed', completed_at = now(), completed_by = public.mkt_actor(),
           locked = coalesce((v_mv.rules -> 'lock') = 'true'::jsonb, false), rev = rev + 1, updated_by = auth.uid(), updated_at = now()
     WHERE id = v_m.id RETURNING * INTO v_m;
    UPDATE public.mkt_projects SET status = 'approved', link_code = v_link, link2_code = v_link2, updated_at = now()
     WHERE id = v_p.id;
    PERFORM public.mkt_log(v_p.id, 'minutes completed', p_reason => v_m.title);
  END IF;
  RETURN jsonb_build_object('status', (SELECT p.status FROM public.mkt_projects p WHERE p.id = v_p.id),
                            'minutes', v_m.status, 'rev', v_m.rev, 'link', v_link, 'link2', v_link2);
END
$fn$;

-- ── Resent: the trail names both PICs ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.mkt_project_resend(p_project uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_p public.mkt_projects;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'Sending to the PIC is the manager''s.');
  SELECT * INTO v_p FROM public.mkt_projects WHERE id = p_project FOR UPDATE;
  IF NOT FOUND OR v_p.kind <> 'product' THEN
    RAISE EXCEPTION 'That project is not there.' USING ERRCODE = 'P0002';
  END IF;
  IF v_p.status <> 'changes' THEN
    RAISE EXCEPTION 'Nothing was sent back to resend.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.mkt_projects SET status = 'waiting_pic', link_sent_at = now(), updated_at = now() WHERE id = v_p.id;
  PERFORM public.mkt_log(v_p.id, 'resent',
                         p_reason => v_p.pic_name || coalesce(' and ' || nullif(btrim(coalesce(v_p.pic2_name, '')), ''), ''));
  RETURN jsonb_build_object('status', 'waiting_pic');
END
$fn$;

-- ── The work starts: its deliverables carry both PICs ────────────────────────────

CREATE OR REPLACE FUNCTION public.mkt_product_begin(p_project uuid)
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
                                         pic2_name, pic2_whatsapp, parent_id, deliv, canvas_def, created_by)
        VALUES (v_p.track_id || '-D' || lpad(v_n::text, CASE WHEN v_total >= 100 THEN 3 ELSE 2 END, '0'), 'deliverable',
                v_p.subsidiary_id,
                left(btrim(v_it ->> 'name') || CASE WHEN v_qty > 1 THEN ' ' || k || '/' || v_qty ELSE '' END, 140),
                'planning', v_p.product_id, v_p.product_version, v_wv.workflow_id, v_wv.version,
                left(v_w.action || ' · ' || v_w.tname, 120), v_p.owner_staff, v_p.pic_name, v_p.pic_whatsapp,
                v_p.pic2_name, v_p.pic2_whatsapp, v_p.id,
                jsonb_build_object('group', btrim(coalesce(v_g ->> 'name', '')), 'item', btrim(v_it ->> 'name'),
                                   'n', k, 'of', v_qty),
                v_wv.canvas, auth.uid())
        RETURNING id INTO v_id;
        -- Its stages, as its template's version has them: the first always the manager's to assign; a locked template
        -- all of them, and none split. A stage's fields are its own and the canvas's own sections' fields of it.
        INSERT INTO public.mkt_stages (project_id, idx, name, dept, mode, cands, sla, appr, split, spec, status)
        SELECT v_id, (x.n - 1)::integer, x.st ->> 'name', coalesce(x.st ->> 'dept', ''),
               CASE WHEN v_wv.locked OR x.n = 1 OR x.st -> 'who' ->> 'mode' IS DISTINCT FROM 'prev' THEN 'assign' ELSE 'prev' END,
               ARRAY(SELECT c::uuid FROM jsonb_array_elements_text(coalesce(x.st -> 'who' -> 'cands', '[]'::jsonb)) c),
               (x.st ->> 'sla')::integer, coalesce(x.st -> 'appr', '[]'::jsonb),
               coalesce((x.st ->> 'split')::boolean, false) AND NOT v_wv.locked,
               jsonb_strip_nulls(jsonb_build_object(
                 'form', coalesce(x.st -> 'form', '[]'::jsonb) || coalesce((
                           SELECT jsonb_agg(sf.f || jsonb_build_object('section', sc.sec ->> 'title') ORDER BY sc.so, sf.fo)
                             FROM jsonb_array_elements(coalesce(v_wv.canvas -> 'sections', '[]'::jsonb)) WITH ORDINALITY AS sc(sec, so),
                                  jsonb_array_elements(coalesce(sc.sec -> 'fields', '[]'::jsonb)) WITH ORDINALITY AS sf(f, fo)
                            WHERE coalesce(sf.f ->> 'stage', '') ~ '^[0-9]{1,2}$' AND (sf.f ->> 'stage')::integer = x.n - 1), '[]'::jsonb),
                 'back', x.st -> 'back', 'sec', x.st -> 'sec', 'picText', nullif(x.st ->> 'picText', ''))),
               'planned'
          FROM jsonb_array_elements(v_wv.stages) WITH ORDINALITY AS x(st, n);
      END LOOP;
    END LOOP;
  END LOOP;
  UPDATE public.mkt_projects SET status = 'active', updated_at = now() WHERE id = v_p.id;
  PERFORM public.mkt_log(v_p.id, 'work started', p_data => jsonb_build_object('deliverables', v_n));
  RETURN jsonb_build_object('id', v_p.id, 'track', v_p.track_id, 'deliverables', v_n);
END
$fn$;

-- ── What a PIC reads: either PIC's link ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.mkt_pic_page(p_code text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_code  text := lower(btrim(coalesce(p_code, '')));
  v_p     public.mkt_projects;
  v_m     public.mkt_minutes;
  v_mv    public.mkt_minutes_versions;
  v_f     jsonb;
  v_v     jsonb;
  v_val   jsonb;
  v_out   jsonb := '[]'::jsonb;
  v_last  public.mkt_events;
  v_you   integer;
BEGIN
  IF v_code !~ '^[0-9a-f]{32}$' THEN
    RETURN NULL;
  END IF;
  -- Either PIC's own link (2026-10-24 — the user's answer 29); the second's only while they are on the project.
  SELECT * INTO v_p FROM public.mkt_projects
   WHERE (link_code = v_code OR (link2_code = v_code AND nullif(btrim(coalesce(pic2_name, '')), '') IS NOT NULL))
     AND kind = 'product' AND status NOT IN ('minutes', 'cancelled');
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  v_you := CASE WHEN v_p.link_code = v_code THEN 1 ELSE 2 END;
  SELECT * INTO v_m FROM public.mkt_minutes WHERE project_id = v_p.id AND intake;
  SELECT * INTO v_mv FROM public.mkt_minutes_versions WHERE template_id = v_m.template_id AND version = v_m.template_version;

  -- The fields the PIC sees, as written — people by their first names, a table's columns with its rows.
  FOR v_f IN SELECT f FROM jsonb_array_elements(coalesce(v_mv.fields, '[]'::jsonb)) f LOOP
    CONTINUE WHEN NOT coalesce((v_f -> 'pic') = 'true'::jsonb, false) OR v_f ->> 'type' = 'Project link';
    v_v := v_m.vals -> (v_f ->> 'name');
    v_val := CASE v_f ->> 'type'
      WHEN 'People' THEN coalesce((SELECT jsonb_agg(public.mkt_staff_name(x::uuid))
                                     FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_v) = 'array' THEN v_v ELSE '[]'::jsonb END) x
                                    WHERE x ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'), '[]'::jsonb)
      WHEN 'Signature' THEN coalesce((SELECT jsonb_agg(public.mkt_staff_name(k::uuid))
                                        FROM jsonb_object_keys(v_m.signed) k
                                       WHERE k ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'), '[]'::jsonb)
      WHEN 'Table' THEN jsonb_build_object(
        'cols', coalesce((SELECT jsonb_agg(c ->> 'name') FROM jsonb_array_elements(coalesce(v_f -> 'cols', '[]'::jsonb)) c), '[]'::jsonb),
        'rows', CASE WHEN jsonb_typeof(v_v -> 'rows') = 'array' THEN v_v -> 'rows' ELSE '[]'::jsonb END)
      WHEN 'Free space' THEN jsonb_build_object(
        'cols', CASE WHEN jsonb_typeof(v_v -> 'cols') = 'array' THEN v_v -> 'cols' ELSE '[]'::jsonb END,
        'rows', CASE WHEN jsonb_typeof(v_v -> 'rows') = 'array' THEN v_v -> 'rows' ELSE '[]'::jsonb END)
      ELSE CASE WHEN jsonb_typeof(v_v) = 'string' THEN v_v ELSE NULL END
    END;
    v_out := v_out || jsonb_build_array(jsonb_build_object('name', v_f ->> 'name', 'type', v_f ->> 'type', 'value', v_val));
  END LOOP;

  -- Why it waits again: changed after they approved, or resent after the changes they asked for.
  SELECT * INTO v_last FROM public.mkt_events
   WHERE project_id = v_p.id AND action IN ('link sent', 'resent', 'edited after approval')
   ORDER BY id DESC LIMIT 1;

  RETURN jsonb_build_object(
    'today', (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date,
    'sub', (SELECT x.name FROM public.mkt_subsidiaries x WHERE x.id = v_p.subsidiary_id),
    'product', (SELECT pv.name FROM public.mkt_product_versions pv
                 WHERE pv.product_id = v_p.product_id AND pv.version = v_p.product_version),
    'title', v_p.title, 'track', v_p.track_id, 'status', v_p.status,
    -- Which PIC holds this link, their name, and the other PIC's (names only).
    'you', v_you, 'pic', CASE v_you WHEN 2 THEN v_p.pic2_name ELSE v_p.pic_name END,
    'other', CASE v_you WHEN 2 THEN v_p.pic_name ELSE nullif(btrim(coalesce(v_p.pic2_name, '')), '') END,
    'owner', public.mkt_staff_name(v_p.owner_staff),
    'startedAt', v_p.created_at, 'sentAt', v_p.link_sent_at,
    'reply', v_p.pic_reply,
    'updated', CASE WHEN v_p.status = 'waiting_pic' AND v_last.action = 'edited after approval'
                    THEN jsonb_build_object('fields', v_last.reason, 'at', v_last.at) END,
    'asked', CASE WHEN v_p.status = 'waiting_pic' AND v_last.action = 'resent' AND v_p.pic_reply ->> 'decision' = 'changes'
                  THEN jsonb_build_object('reason', v_p.pic_reply ->> 'reason', 'at', v_p.pic_reply ->> 'at') END,
    'minutes', jsonb_build_object('title', v_m.title, 'fields', v_out),
    -- The work (②b-2d): each deliverable planned — where it stands — and the stage waiting for the PIC, with what they
    -- may see of it: its fields marked for the PIC (never a note, never one its section hides from them), its links;
    -- never the team's own notes. Their last answer on each.
    'work', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', d.id, 'title', d.title, 'status', d.status, 'startsOn', d.starts_on, 'dueOn', d.due_on,
               'stages', (SELECT count(*) FROM public.mkt_stages s WHERE s.project_id = d.id),
               'done', (SELECT count(*) FROM public.mkt_stages s WHERE s.project_id = d.id AND s.status = 'done'),
               'stage', (SELECT jsonb_build_object(
                           'idx', s.idx, 'name', s.name, 'status', s.status, 'dueOn', s.due_on, 'ver', s.ver,
                           'waiting', s.status = 'review' AND s.appr -> s.appr_idx ->> 'kind' = 'pic',
                           'note', nullif(btrim(coalesce(s.spec ->> 'picText', '')), ''),
                           'fields', CASE WHEN s.spec -> 'sec' ->> 'pic' = 'false' THEN '[]'::jsonb ELSE coalesce((
                              SELECT jsonb_agg(jsonb_build_object('name', f ->> 'label', 'type', f ->> 'type',
                                       'value', CASE WHEN f ->> 'type' = 'Person' AND coalesce(s.work -> 'vals' ->> (f ->> 'label'), '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                                                     THEN to_jsonb(public.mkt_staff_name((s.work -> 'vals' ->> (f ->> 'label'))::uuid))
                                                     ELSE s.work -> 'vals' -> (f ->> 'label') END) ORDER BY x.o)
                                FROM jsonb_array_elements(coalesce(s.spec -> 'form', '[]'::jsonb)) WITH ORDINALITY AS x(f, o)
                               WHERE coalesce(f ->> 'pic', 'true') <> 'false' AND f ->> 'type' <> 'Note'), '[]'::jsonb) END,
                           'links', CASE WHEN jsonb_typeof(s.work -> 'links') = 'array' THEN s.work -> 'links' ELSE '[]'::jsonb END)
                           FROM public.mkt_stages s WHERE s.project_id = d.id AND s.idx = d.cur),
               'last', (SELECT jsonb_build_object('action', e.action, 'name', e.actor_name, 'reason', e.reason,
                                                  'stage', e.stage_name, 'version', e.version, 'at', e.at,
                                                  'pic', CASE WHEN e.data ->> 'pic' IN ('1', '2') THEN (e.data ->> 'pic')::integer END)
                          FROM public.mkt_events e
                         WHERE e.project_id = d.id AND e.action IN ('pic approved', 'pic changes')
                         ORDER BY e.id DESC LIMIT 1))
             ORDER BY d.track_id)
        FROM public.mkt_projects d
       WHERE d.parent_id = v_p.id AND d.status NOT IN ('planning', 'cancelled')), '[]'::jsonb));
END
$fn$;

-- ── A PIC's answer on the minutes: either PIC's link; the reply says whose ───────

CREATE OR REPLACE FUNCTION public.mkt_pic_answer(p_code text, p_decision text, p_name text DEFAULT NULL, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_code   text := lower(btrim(coalesce(p_code, '')));
  v_p      public.mkt_projects;
  v_m      public.mkt_minutes;
  v_mv     public.mkt_minutes_versions;
  v_name   text := btrim(coalesce(p_name, ''));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_who    text;
  v_to     uuid[];
  v_s      uuid;
  v_you    integer;
BEGIN
  IF v_code !~ '^[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'This link is closed.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_p FROM public.mkt_projects
   WHERE (link_code = v_code OR (link2_code = v_code AND nullif(btrim(coalesce(pic2_name, '')), '') IS NOT NULL))
     AND kind = 'product' AND status NOT IN ('minutes', 'cancelled')
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This link is closed.' USING ERRCODE = '22023';
  END IF;
  v_you := CASE WHEN v_p.link_code = v_code THEN 1 ELSE 2 END;
  IF v_p.status IS DISTINCT FROM 'waiting_pic' THEN
    RAISE EXCEPTION 'Nothing is waiting for your approval now.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_m FROM public.mkt_minutes WHERE project_id = v_p.id AND intake FOR UPDATE;
  SELECT * INTO v_mv FROM public.mkt_minutes_versions WHERE template_id = v_m.template_id AND version = v_m.template_version;
  -- Who is told: whoever owns the project; with nobody, Marketing's managers.
  v_to := CASE WHEN v_p.owner_staff IS NOT NULL THEN ARRAY[v_p.owner_staff]
               ELSE ARRAY(SELECT r.staff_id FROM public.mkt_roster() r WHERE r.team = 'manager') END;

  IF p_decision = 'approve' THEN
    IF length(v_name) NOT BETWEEN 3 AND 80 THEN
      RAISE EXCEPTION 'Type your full name to sign off.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.mkt_minutes
       SET status = 'completed', completed_at = now(), completed_by = left(v_name || ' (PIC)', 120),
           locked = coalesce((v_mv.rules -> 'lock') = 'true'::jsonb, false), rev = rev + 1, updated_by = NULL, updated_at = now()
     WHERE id = v_m.id;
    UPDATE public.mkt_projects
       SET status = 'approved', pic_reply = jsonb_build_object('decision', 'approved', 'name', v_name, 'reason', '', 'at', now(), 'pic', v_you),
           updated_at = now()
     WHERE id = v_p.id;
    INSERT INTO public.mkt_events (project_id, actor_user, actor_name, action, reason, data)
    VALUES (v_p.id, NULL, left(v_name || ' (PIC)', 120), 'pic approved', v_m.title, jsonb_build_object('pic', v_you));
    FOREACH v_s IN ARRAY v_to LOOP
      PERFORM public.mkt_notify(v_s, v_p.id, left(v_name || ' approved the minutes', 200), v_p.title, 'pic_approved');
    END LOOP;
  ELSIF p_decision = 'changes' THEN
    IF length(v_reason) NOT BETWEEN 5 AND 500 THEN
      RAISE EXCEPTION 'Say what should change — 5 to 500 characters.' USING ERRCODE = '22023';
    END IF;
    v_who := coalesce(nullif(left(v_name, 80), ''), nullif(btrim(CASE v_you WHEN 2 THEN v_p.pic2_name ELSE v_p.pic_name END), ''),
                      'The PIC');
    UPDATE public.mkt_projects
       SET status = 'changes', pic_reply = jsonb_build_object('decision', 'changes', 'name', v_who, 'reason', v_reason, 'at', now(), 'pic', v_you),
           updated_at = now()
     WHERE id = v_p.id;
    INSERT INTO public.mkt_events (project_id, actor_user, actor_name, action, reason, data)
    VALUES (v_p.id, NULL, left(v_who || ' (PIC)', 120), 'pic changes', v_reason, jsonb_build_object('pic', v_you));
    FOREACH v_s IN ARRAY v_to LOOP
      PERFORM public.mkt_notify(v_s, v_p.id, left(v_who || ' asked for changes', 200), left(v_reason, 400), 'pic_changes');
    END LOOP;
  ELSE
    RAISE EXCEPTION 'Approve, or say what should change.' USING ERRCODE = '22023';
  END IF;
  RETURN public.mkt_pic_page(v_code);
END
$fn$;

-- ── A PIC's answer on a stage: either PIC's link; the trail says whose ───────────

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
  v_then   jsonb;
  v_back   integer;
  v_to     public.mkt_stages;
  v_name   text := btrim(coalesce(p_name, ''));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_who    text;
  v_you    integer;
BEGIN
  IF v_code !~ '^[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'This link is closed.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_parent FROM public.mkt_projects
   WHERE (link_code = v_code OR (link2_code = v_code AND nullif(btrim(coalesce(pic2_name, '')), '') IS NOT NULL))
     AND kind = 'product' AND status NOT IN ('minutes', 'cancelled');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This link is closed.' USING ERRCODE = '22023';
  END IF;
  v_you := CASE WHEN v_parent.link_code = v_code THEN 1 ELSE 2 END;
  SELECT * INTO v_p FROM public.mkt_projects WHERE id = p_project AND parent_id = v_parent.id FOR UPDATE;
  IF NOT FOUND OR v_p.status <> 'active' THEN
    RAISE EXCEPTION 'Nothing is waiting for your approval on it now.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_s FROM public.mkt_stages WHERE project_id = v_p.id AND idx = v_p.cur FOR UPDATE;
  IF NOT FOUND OR v_s.status <> 'review' OR v_s.appr -> v_s.appr_idx ->> 'kind' IS DISTINCT FROM 'pic' THEN
    RAISE EXCEPTION 'Nothing is waiting for your approval on it now.' USING ERRCODE = '22023';
  END IF;
  IF p_version IS DISTINCT FROM v_s.ver THEN
    RAISE EXCEPTION 'The team sent a newer version since you opened this page — reload it to see.' USING ERRCODE = '22023';
  END IF;

  IF p_decision = 'approve' THEN
    IF length(v_name) NOT BETWEEN 3 AND 80 THEN
      RAISE EXCEPTION 'Type your full name to sign off.' USING ERRCODE = '22023';
    END IF;
    v_who := left(v_name || ' (PIC)', 120);
    v_then := v_s.appr -> (v_s.appr_idx + 1);
    INSERT INTO public.mkt_events (project_id, actor_user, actor_name, action, stage_idx, stage_name, from_to, version, data)
    VALUES (v_p.id, NULL, v_who, 'pic approved', v_s.idx, left(v_s.name, 80),
            CASE WHEN v_then IS NULL THEN NULL WHEN v_then ->> 'kind' = 'pic' THEN 'PIC'
                 ELSE public.mkt_staff_name((v_then ->> 'staff')::uuid) END,
            'v' || v_s.ver, jsonb_build_object('pic', v_you));
    IF v_then IS NOT NULL THEN
      UPDATE public.mkt_stages SET appr_idx = appr_idx + 1 WHERE project_id = v_p.id AND idx = v_s.idx;
      UPDATE public.mkt_projects SET updated_at = now() WHERE id = v_p.id;
      IF v_then ->> 'kind' = 'person' THEN
        PERFORM public.mkt_notify((v_then ->> 'staff')::uuid, v_p.id,
                  public.mkt_staff_name(v_s.owner_staff) || ' submitted ' || v_s.name || ' v' || v_s.ver || ' for your approval',
                  v_p.track_id || ' · ' || v_p.title, 'review');
      END IF;
    ELSE
      PERFORM public.mkt_advance(v_p.id);
    END IF;
    PERFORM public.mkt_notify(v_s.owner_staff, v_p.id, left(v_name || ' (PIC) approved ' || v_s.name, 200),
              v_p.track_id || ' · ' || v_p.title, 'pic_approved');
  ELSIF p_decision = 'changes' THEN
    IF length(v_reason) NOT BETWEEN 5 AND 1000 THEN
      RAISE EXCEPTION 'Say what should change — 5 to 1,000 characters.' USING ERRCODE = '22023';
    END IF;
    v_who := left(coalesce(nullif(left(v_name, 80), ''),
                           nullif(btrim(CASE v_you WHEN 2 THEN v_parent.pic2_name ELSE v_parent.pic_name END), ''), 'The PIC')
                  || ' (PIC)', 120);
    v_back := CASE WHEN jsonb_typeof(v_s.spec -> 'back') = 'number' THEN (v_s.spec ->> 'back')::integer END;
    IF v_back IS NOT NULL AND v_back < v_s.idx THEN
      -- Back to the stage the template named: it takes the changes; this one and those between wait for it again.
      SELECT * INTO v_to FROM public.mkt_stages WHERE project_id = v_p.id AND idx = v_back FOR UPDATE;
      UPDATE public.mkt_stages SET status = 'planned', appr_idx = 0, changes = NULL, done_at = NULL
       WHERE project_id = v_p.id AND idx > v_back AND idx <= v_s.idx;
      UPDATE public.mkt_stages
         SET status = 'changes', appr_idx = 0, entered_at = now(), done_at = NULL,
             changes = jsonb_build_object('by', v_who, 'staff', NULL, 'reason', v_reason, 'at', now(), 'ver', v_s.ver, 'from', v_s.name)
       WHERE project_id = v_p.id AND idx = v_back;
      UPDATE public.mkt_projects SET cur = v_back, updated_at = now() WHERE id = v_p.id;
      INSERT INTO public.mkt_events (project_id, actor_user, actor_name, action, stage_idx, stage_name, from_to, reason, version, data)
      VALUES (v_p.id, NULL, v_who, 'pic changes', v_s.idx, left(v_s.name, 80), public.mkt_staff_name(v_to.owner_staff), v_reason,
              'v' || v_s.ver, jsonb_build_object('back', v_back, 'to', v_to.name, 'pic', v_you));
      PERFORM public.mkt_notify(v_to.owner_staff, v_p.id, 'Changes requested on ' || v_s.name || ' — back to ' || v_to.name,
                '"' || v_reason || '"', 'changes');
    ELSE
      UPDATE public.mkt_stages
         SET status = 'changes', appr_idx = 0,
             changes = jsonb_build_object('by', v_who, 'staff', NULL, 'reason', v_reason, 'at', now(), 'ver', v_s.ver)
       WHERE project_id = v_p.id AND idx = v_s.idx;
      UPDATE public.mkt_projects SET updated_at = now() WHERE id = v_p.id;
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

NOTIFY pgrst, 'reload schema';
