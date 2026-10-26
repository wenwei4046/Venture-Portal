-- 20261025035000_marketing_pic_both.sql
-- 2026-10-24 — Marketing ②b-2d-2b: "both PICs" on an approval (the user's answer 29 — "one PIC's approval is enough
-- unless a step needs both — set per approval (any / all)"). Two places ask a PIC: the intake minutes (the template's
-- rule *Both PICs sign off*, `rules.picAll`) and a stage's approval level (the Assignment Plan's PIC level,
-- `{ kind: 'pic', all: true }`). On a project with two PICs, such an approval waits for both; with one PIC, for that
-- one. Either PIC's changes send it back at once, as before.
--
-- mkt_projects + pic_ok — the minutes' approvals for the sending now: { sent: <link_sent_at as epoch>, "1": { name, at },
--   "2": { … } }; another sending's (resent, sent again after an edit) are stale and read as none.
-- mkt_stages + pic_ok — a stage's: { ver, lvl, "1": …, "2": … }; another version's or level's are stale.
-- Replaced from production's bodies (md5 equal — 20261025034000's, 20261025032000's, 20261023235800's):
--   mkt_minutes_check     the rules keep picAll (only with pic)
--   mkt_minutes_fill      both PICs signing off: a second PIC named or changed after approval approves again; an edit
--                         the PICs see while one's approval is in takes it back; the trail keeps whose it took back
--   mkt_pic_answer        both: the first approval kept, the minutes wait for the other's ("You approved already" to a
--                         second answer of the same PIC); both in — approved, as before
--   mkt_pic_stage_answer  the same for a stage's level that asks both
--   mkt_pic_page          + both / ok for the minutes; a stage's both / ok, and waiting only for the PIC yet to answer
--                         (while the level still has two to ask); an edit's `updated` says whether it took back theirs
--   mkt_product_project   + picOk — whose approvals the minutes have now
--   mkt_project           + the project's second PIC; a stage's picOk
--   mkt_deliverable_plan  the PIC level keeps all; one PIC level a stage
-- PGlite: tests/member-sql/validate-marketing-pic-both.mjs.

ALTER TABLE public.mkt_projects ADD COLUMN IF NOT EXISTS pic_ok jsonb CHECK (pic_ok IS NULL OR jsonb_typeof(pic_ok) = 'object');
ALTER TABLE public.mkt_stages ADD COLUMN IF NOT EXISTS pic_ok jsonb CHECK (pic_ok IS NULL OR jsonb_typeof(pic_ok) = 'object');

-- ── The minutes template's rules: + Both PICs sign off ───────────────────────────

CREATE OR REPLACE FUNCTION public.mkt_minutes_check(p_fields jsonb, p_rules jsonb, p_publish boolean)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_types text[] := ARRAY['Short text', 'Long text', 'Date', 'Number', 'People', 'Project link', 'Free space', 'Table', 'Signature'];
  v_n     integer := CASE WHEN jsonb_typeof(p_fields) = 'array' THEN jsonb_array_length(p_fields) ELSE -1 END;
  v_out   jsonb := '[]'::jsonb;
  v_f     jsonb;
  v_name  text;
  v_type  text;
  v_lock  boolean;
  v_names text[] := '{}';
  v_cols  jsonb;
  v_rules jsonb := '{}'::jsonb;
  v_key   text;
  j       integer;
BEGIN
  IF v_n < 0 THEN
    RAISE EXCEPTION 'Not a list of fields.' USING ERRCODE = '22023';
  END IF;
  IF v_n > 40 THEN
    RAISE EXCEPTION 'Minutes have at most 40 fields.' USING ERRCODE = '22023';
  END IF;
  FOR v_f IN SELECT x FROM jsonb_array_elements(p_fields) x LOOP
    IF jsonb_typeof(v_f) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Not a field.' USING ERRCODE = '22023';
    END IF;
    v_type := coalesce(v_f ->> 'type', '');
    IF NOT (v_type = ANY (v_types)) THEN
      RAISE EXCEPTION 'A field of a kind minutes cannot hold.' USING ERRCODE = '22023';
    END IF;
    v_name := btrim(coalesce(v_f ->> 'name', ''));
    IF length(v_name) > 60 OR (p_publish AND v_name = '') THEN
      RAISE EXCEPTION 'Name each field (at most 60 characters).' USING ERRCODE = '22023';
    END IF;
    IF p_publish THEN
      IF lower(v_name) = ANY (v_names) THEN
        RAISE EXCEPTION 'Two fields called "%".', v_name USING ERRCODE = '22023';
      END IF;
      v_names := v_names || lower(v_name);
    END IF;
    -- The two every minutes keep: the project it is for and its attendees — locked, always required.
    v_lock := v_type = 'Project link' OR (v_type = 'People' AND coalesce(v_f ->> 'lock', '') = 'true');
    v_cols := NULL;
    IF v_type = 'Table' THEN
      IF jsonb_typeof(v_f -> 'cols') IS DISTINCT FROM 'array' OR jsonb_array_length(v_f -> 'cols') NOT BETWEEN 1 AND 8 THEN
        RAISE EXCEPTION '"%": a table has 1 to 8 columns.', v_name USING ERRCODE = '22023';
      END IF;
      v_cols := '[]'::jsonb;
      FOR j IN 0 .. jsonb_array_length(v_f -> 'cols') - 1 LOOP
        IF length(btrim(coalesce(v_f -> 'cols' -> j ->> 'name', ''))) NOT BETWEEN (CASE WHEN p_publish THEN 1 ELSE 0 END) AND 40
           OR coalesce(v_f -> 'cols' -> j ->> 'type', '') NOT IN ('Text', 'Number', 'Date', 'Person') THEN
          RAISE EXCEPTION '"%": name each column (at most 40 characters).', v_name USING ERRCODE = '22023';
        END IF;
        v_cols := v_cols || jsonb_build_array(jsonb_build_object('name', btrim(v_f -> 'cols' -> j ->> 'name'), 'type', v_f -> 'cols' -> j ->> 'type'));
      END LOOP;
    END IF;
    v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'name', v_name, 'type', v_type,
      'req', v_lock OR coalesce(v_f ->> 'req', '') = 'true',
      'pic', coalesce(v_f ->> 'pic', '') = 'true',
      'lock', v_lock,
      'cols', v_cols)));
  END LOOP;
  IF (SELECT count(*) FROM jsonb_array_elements(v_out) f WHERE f ->> 'type' = 'Project link') > 1
     OR (SELECT count(*) FROM jsonb_array_elements(v_out) f WHERE f ->> 'type' = 'Signature') > 1 THEN
    RAISE EXCEPTION 'Minutes link one project and keep one set of signatures.' USING ERRCODE = '22023';
  END IF;
  IF p_publish AND (NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_out) f WHERE f ->> 'type' = 'Project link')
                    OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_out) f WHERE f ->> 'type' = 'People' AND (f ->> 'lock')::boolean)) THEN
    RAISE EXCEPTION 'Minutes keep the project they are for and their attendees.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(coalesce(p_rules, '{}'::jsonb)) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Not a set of rules.' USING ERRCODE = '22023';
  END IF;
  FOREACH v_key IN ARRAY ARRAY['sign', 'pic', 'picAll', 'project', 'file', 'lock'] LOOP
    v_rules := v_rules || jsonb_build_object(v_key, coalesce(p_rules ->> v_key, '') = 'true');
  END LOOP;
  -- Both PICs sign off only where a PIC signs off at all (2026-10-24 — the user's answer 29).
  IF NOT (v_rules ->> 'pic')::boolean THEN
    v_rules := v_rules || '{"picAll": false}'::jsonb;
  END IF;
  RETURN jsonb_build_object('fields', v_out, 'rules', v_rules);
END
$fn$;

-- ── The minutes: a second PIC who must sign off approves again ───────────────────

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
  v_ok      jsonb;
  v_took    jsonb;
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
    -- …unless both PICs sign off (②b-2d-2b): then a second PIC named or changed after approval approves too.
    IF coalesce((v_mv.rules -> 'picAll') = 'true'::jsonb, false) AND v_pic2 IS NOT NULL AND v_pic2 IS DISTINCT FROM v_p.pic2_name THEN
      v_seen := v_seen || 'Second PIC'::text;
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

  -- Approved, then changed where the PIC sees: the PIC approves again. So too while the minutes wait for both PICs with
  -- one's approval in (②b-2d-2b): what they approved changed — theirs no longer counts. The trail keeps whose approvals
  -- the edit took back (`took`), so each PIC's page says whether it was theirs.
  v_ok := CASE WHEN v_p.pic_ok ->> 'sent' = (extract(epoch FROM v_p.link_sent_at))::text THEN v_p.pic_ok - 'sent' ELSE '{}'::jsonb END;
  IF v_m.intake AND coalesce((v_mv.rules -> 'pic') = 'true'::jsonb, false) AND cardinality(v_seen) > 0
     AND (v_p.status = 'approved' OR (v_p.status = 'waiting_pic' AND v_ok <> '{}'::jsonb)) THEN
    v_reapp := true;
    v_took := CASE WHEN v_ok <> '{}'::jsonb
                   THEN (SELECT jsonb_agg(jsonb_build_object('pic', e.k::integer, 'name', e.v ->> 'name') ORDER BY e.k)
                           FROM jsonb_each(v_ok) e(k, v) WHERE e.k IN ('1', '2'))
                   WHEN v_p.pic_reply ->> 'decision' = 'approved'
                   THEN jsonb_build_array(jsonb_build_object('pic', CASE WHEN v_p.pic_reply ->> 'pic' = '2' THEN 2 ELSE 1 END,
                                                             'name', v_p.pic_reply ->> 'name'))
                   ELSE '[]'::jsonb END;
    UPDATE public.mkt_projects SET status = 'waiting_pic', link_sent_at = now(), pic_reply = NULL, updated_at = now()
     WHERE id = v_p.id;
    PERFORM public.mkt_log(v_p.id, 'edited after approval', p_reason => array_to_string(v_seen, ', '),
                           p_data => jsonb_build_object('fields', to_jsonb(v_seen), 'took', coalesce(v_took, '[]'::jsonb)));
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

-- ── A PIC's answer on the minutes: both, when the template asks it ───────────────

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
  v_ok     jsonb;
  v_other  text;
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
    -- Both PICs sign off when the template asks it and the project has two (②b-2d-2b): the first approval is kept for
    -- this sending, and the minutes wait for the other's.
    IF coalesce((v_mv.rules -> 'picAll') = 'true'::jsonb, false) AND nullif(btrim(coalesce(v_p.pic2_name, '')), '') IS NOT NULL THEN
      v_ok := CASE WHEN v_p.pic_ok ->> 'sent' = (extract(epoch FROM v_p.link_sent_at))::text THEN v_p.pic_ok ELSE jsonb_build_object('sent', (extract(epoch FROM v_p.link_sent_at))::text) END;
      v_other := CASE v_you WHEN 1 THEN v_p.pic2_name ELSE v_p.pic_name END;
      IF v_ok ? v_you::text THEN
        RAISE EXCEPTION 'You approved already — the minutes wait for %.', v_other USING ERRCODE = '22023';
      END IF;
      v_ok := v_ok || jsonb_build_object(v_you::text, jsonb_build_object('name', v_name, 'at', now()));
      UPDATE public.mkt_projects SET pic_ok = v_ok, updated_at = now() WHERE id = v_p.id;
      IF NOT (v_ok ? (3 - v_you)::text) THEN
        INSERT INTO public.mkt_events (project_id, actor_user, actor_name, action, reason, data)
        VALUES (v_p.id, NULL, left(v_name || ' (PIC)', 120), 'pic approved', v_m.title, jsonb_build_object('pic', v_you, 'waiting', v_other));
        FOREACH v_s IN ARRAY v_to LOOP
          PERFORM public.mkt_notify(v_s, v_p.id, left(v_name || ' approved the minutes — waiting for ' || v_other, 200), v_p.title, 'pic_approved');
        END LOOP;
        RETURN public.mkt_pic_page(v_code);
      END IF;
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

-- ── A PIC's answer on a stage: both, when its level asks it ──────────────────────

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
  v_ok     jsonb;
  v_other  text;
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
    -- A level that asks both PICs, on a project with two (②b-2d-2b): the first approval is kept for this version at this
    -- level, and the stage waits for the other's.
    IF coalesce(v_s.appr -> v_s.appr_idx ->> 'all' = 'true', false) AND nullif(btrim(coalesce(v_parent.pic2_name, '')), '') IS NOT NULL THEN
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

-- ── What a PIC reads: whose approvals are in, and what still waits for them ──────

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
    -- Both PICs sign off the minutes (②b-2d-2b): whose approvals this sending has.
    'both', coalesce((v_mv.rules -> 'picAll') = 'true'::jsonb, false) AND nullif(btrim(coalesce(v_p.pic2_name, '')), '') IS NOT NULL,
    'ok', CASE WHEN v_p.pic_ok ->> 'sent' = (extract(epoch FROM v_p.link_sent_at))::text THEN v_p.pic_ok - 'sent' END,
    'updated', CASE WHEN v_p.status = 'waiting_pic' AND v_last.action = 'edited after approval'
                    THEN jsonb_build_object('fields', v_last.reason, 'at', v_last.at,
                           -- Whose approval the edit took back (②b-2d-2b): this PIC's — or only the other's, named. An
                           -- edit from before there were two took back the one PIC's.
                           'mine', jsonb_typeof(v_last.data -> 'took') IS DISTINCT FROM 'array'
                                   OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_last.data -> 'took') t WHERE t ->> 'pic' = v_you::text),
                           'by', CASE WHEN jsonb_typeof(v_last.data -> 'took') = 'array'
                                      THEN (SELECT t ->> 'name' FROM jsonb_array_elements(v_last.data -> 'took') t
                                             WHERE t ->> 'pic' IS DISTINCT FROM v_you::text LIMIT 1) END) END,
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
                           -- Waiting for THIS PIC: a level asking both waits no longer for the one who approved — while
                           -- it still has two to ask (the other taken off, it waits for the one left again, never stuck).
                           'waiting', s.status = 'review' AND s.appr -> s.appr_idx ->> 'kind' = 'pic'
                                      AND NOT (coalesce(s.appr -> s.appr_idx ->> 'all' = 'true', false)
                                               AND nullif(btrim(coalesce(v_p.pic2_name, '')), '') IS NOT NULL
                                               AND coalesce(s.pic_ok ->> 'ver' = s.ver::text AND s.pic_ok ->> 'lvl' = s.appr_idx::text
                                                            AND s.pic_ok ? v_you::text, false)),
                           'both', s.appr -> s.appr_idx ->> 'kind' = 'pic' AND coalesce(s.appr -> s.appr_idx ->> 'all' = 'true', false)
                                   AND nullif(btrim(coalesce(v_p.pic2_name, '')), '') IS NOT NULL,
                           'ok', CASE WHEN s.pic_ok ->> 'ver' = s.ver::text AND s.pic_ok ->> 'lvl' = s.appr_idx::text
                                      THEN s.pic_ok - 'ver' - 'lvl' END,
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

-- ── A product project's page: + whose approvals the minutes have ────────────────

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
      'picOk', CASE WHEN v_p.pic_ok ->> 'sent' = (extract(epoch FROM v_p.link_sent_at))::text THEN v_p.pic_ok - 'sent' END,
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

-- ── A task's page: + the second PIC; a stage's PIC approvals ────────────────────

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

-- ── A deliverable's plan: the PIC level, either or both ──────────────────────────

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
  v_a      jsonb;
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
  IF v_parent.status <> 'active' THEN
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
    v_appr := '[]'::jsonb;
    IF v_st ? 'appr' AND jsonb_typeof(v_st -> 'appr') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Stage % (%): not a list of approvals.', i + 1, v_s.name USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(v_st -> 'appr') = 'array' THEN
      IF jsonb_array_length(v_st -> 'appr') > 3 THEN
        RAISE EXCEPTION 'Stage % (%): at most 3 approvals.', i + 1, v_s.name USING ERRCODE = '22023';
      END IF;
      FOR v_a IN SELECT x FROM jsonb_array_elements(v_st -> 'appr') x LOOP
        IF v_a ->> 'kind' = 'pic' THEN
          -- Either PIC, or both (②b-2d-2b — the user's answer 29: set per approval); one PIC level a stage.
          v_a := jsonb_build_object('kind', 'pic') || CASE WHEN v_a ->> 'all' = 'true' THEN '{"all": true}'::jsonb ELSE '{}'::jsonb END;
          IF v_appr @> '[{"kind": "pic"}]'::jsonb THEN
            RAISE EXCEPTION 'Stage % (%): the same approval twice.', i + 1, v_s.name USING ERRCODE = '22023';
          END IF;
        ELSIF v_a ->> 'kind' = 'person' AND coalesce(v_a ->> 'staff', '') ~ v_uuid AND (v_a ->> 'staff')::uuid = ANY (v_roster) THEN
          v_a := jsonb_build_object('kind', 'person', 'staff', (v_a ->> 'staff')::uuid);
        ELSE
          RAISE EXCEPTION 'Stage % (%): pick who approves it.', i + 1, v_s.name USING ERRCODE = '22023';
        END IF;
        IF v_appr @> jsonb_build_array(v_a) THEN
          RAISE EXCEPTION 'Stage % (%): the same approval twice.', i + 1, v_s.name USING ERRCODE = '22023';
        END IF;
        v_appr := v_appr || jsonb_build_array(v_a);
      END LOOP;
    END IF;
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
        IF v_owner IS DISTINCT FROM v_s.owner_staff OR v_appr <> v_s.appr OR v_sla <> v_s.sla OR v_split <> v_s.split THEN
          RAISE EXCEPTION 'Stage % (%) is done — it stays as it was.', i + 1, v_s.name USING ERRCODE = '22023';
        END IF;
      ELSE
        IF v_s.status = 'review' AND (v_owner IS DISTINCT FROM v_s.owner_staff OR v_appr <> v_s.appr) THEN
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
                'other', v_appr <> v_s.appr OR v_sla <> v_s.sla OR v_split <> v_s.split));
  END LOOP;

  -- Written: what is not done; then the dates — from the start day, each stage its working days, weekends and
  -- Selangor's holidays skipped (a stage begun keeps its own).
  UPDATE public.mkt_stages s
     SET owner_staff = (r ->> 'owner')::uuid, extra = r ->> 'extra', appr = r -> 'appr', sla = (r ->> 'sla')::integer,
         split = (r ->> 'split')::boolean
    FROM jsonb_array_elements(v_rows) r
   WHERE s.project_id = v_p.id AND s.idx = (r ->> 'idx')::integer AND s.status <> 'done';
  UPDATE public.mkt_stages s SET starts_on = d.starts_on, due_on = d.due_on
    FROM public.mkt_stage_dates(v_start, ARRAY(SELECT x.sla FROM public.mkt_stages x WHERE x.project_id = v_p.id ORDER BY x.idx)) d
   WHERE s.project_id = v_p.id AND s.idx = d.idx AND (NOT v_open OR s.status = 'planned');

  IF NOT v_open THEN
    -- Stage 1 opens on the start day — on the board then, its person's to Accept (the manager's own, accepted).
    v_at := CASE WHEN v_start <= v_today THEN now() ELSE v_start::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur' END;
    UPDATE public.mkt_stages
       SET status = 'planned', entered_at = NULL, accepted_at = NULL, appr_idx = 0, changes = NULL
     WHERE project_id = v_p.id AND idx > 0;
    UPDATE public.mkt_stages
       SET status = CASE WHEN owner_staff = v_me THEN 'accepted' ELSE 'todo' END, entered_at = v_at,
           accepted_at = CASE WHEN owner_staff = v_me THEN v_at END, appr_idx = 0, changes = NULL
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
                     SELECT (a ->> 'staff')::uuid, s.idx, s.name, s.starts_on
                       FROM public.mkt_stages s, jsonb_array_elements(s.appr) a
                      WHERE s.project_id = v_p.id AND a ->> 'kind' = 'person') w
              ORDER BY w.who, w.idx) o
      WHERE o.who IS DISTINCT FROM v_me;
  ELSE
    -- Mid-way: each change of hands logged with its reason; the stage now open is the new person's to Accept again.
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
        UPDATE public.mkt_stages SET status = 'todo', entered_at = now(), accepted_at = NULL
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

NOTIFY pgrst, 'reload schema';
