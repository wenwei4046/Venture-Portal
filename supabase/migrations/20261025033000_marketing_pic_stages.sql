-- 20261025033000_marketing_pic_stages.sql
-- 2026-10-24 — Marketing ②b-2d-1: the PIC decides a deliverable's stage on their link (`PIC Task Link.dc.html`). A
-- stage whose approval level is the PIC's waited for nobody since ②b-2a; now the PIC answers it on the product project's
-- own link, /t/<code> — the same code their minutes went to.
--
-- Replaced from production's body (md5 equal — 20261024003000's):
--   mkt_pic_page(code)    + 'work': each deliverable planned (not one still being planned, nor one cancelled) — where it
--                         stands, its stages done ÷ all — and its stage now: waiting for the PIC or not, what they may
--                         see of it (its fields marked for the PIC — never a note, never one its section hides from
--                         them — as the team filled them in, a person by their first name; its links; never the team's
--                         notes), and the PIC's last answer on it.
-- New (a stranger's, by name, as mkt_pic_answer — it checks the code itself; PUBLIC revoked):
--   mkt_pic_stage_answer(code, deliverable, version, decision, name, reason)
--                         the deliverable is the code's product project's, its stage now waits for the PIC, at the
--                         version they read; approve — their full name, 3–80 characters: on to the next approval, or
--                         the stage done and the next one open; changes — 5–1,000 characters: back to the stage's owner,
--                         or to the stage the template names, as an approver's changes. The trail names the PIC
--                         ("<name> (PIC)"); the stage's owner and the deliverable's are told.
-- PGlite: tests/member-sql/validate-marketing-pic-stages.mjs.

-- ── What the PIC reads ──────────────────────────────────────────────────────────
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
BEGIN
  IF v_code !~ '^[0-9a-f]{32}$' THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_p FROM public.mkt_projects
   WHERE link_code = v_code AND kind = 'product' AND status NOT IN ('minutes', 'cancelled');
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
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
                                                  'stage', e.stage_name, 'version', e.version, 'at', e.at)
                          FROM public.mkt_events e
                         WHERE e.project_id = d.id AND e.action IN ('pic approved', 'pic changes')
                         ORDER BY e.id DESC LIMIT 1))
             ORDER BY d.track_id)
        FROM public.mkt_projects d
       WHERE d.parent_id = v_p.id AND d.status NOT IN ('planning', 'cancelled')), '[]'::jsonb));
END
$fn$;

-- ── The PIC's answer on a stage ─────────────────────────────────────────────────
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
BEGIN
  IF v_code !~ '^[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'This link is closed.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_parent FROM public.mkt_projects
   WHERE link_code = v_code AND kind = 'product' AND status NOT IN ('minutes', 'cancelled');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This link is closed.' USING ERRCODE = '22023';
  END IF;
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
    INSERT INTO public.mkt_events (project_id, actor_user, actor_name, action, stage_idx, stage_name, from_to, version)
    VALUES (v_p.id, NULL, v_who, 'pic approved', v_s.idx, left(v_s.name, 80),
            CASE WHEN v_then IS NULL THEN NULL WHEN v_then ->> 'kind' = 'pic' THEN 'PIC'
                 ELSE public.mkt_staff_name((v_then ->> 'staff')::uuid) END,
            'v' || v_s.ver);
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
    v_who := left(coalesce(nullif(left(v_name, 80), ''), nullif(btrim(v_parent.pic_name), ''), 'The PIC') || ' (PIC)', 120);
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
              'v' || v_s.ver, jsonb_build_object('back', v_back, 'to', v_to.name));
      PERFORM public.mkt_notify(v_to.owner_staff, v_p.id, 'Changes requested on ' || v_s.name || ' — back to ' || v_to.name,
                '"' || v_reason || '"', 'changes');
    ELSE
      UPDATE public.mkt_stages
         SET status = 'changes', appr_idx = 0,
             changes = jsonb_build_object('by', v_who, 'staff', NULL, 'reason', v_reason, 'at', now(), 'ver', v_s.ver)
       WHERE project_id = v_p.id AND idx = v_s.idx;
      UPDATE public.mkt_projects SET updated_at = now() WHERE id = v_p.id;
      INSERT INTO public.mkt_events (project_id, actor_user, actor_name, action, stage_idx, stage_name, from_to, reason, version)
      VALUES (v_p.id, NULL, v_who, 'pic changes', v_s.idx, left(v_s.name, 80), public.mkt_staff_name(v_s.owner_staff), v_reason,
              'v' || v_s.ver);
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

-- A stranger's, by name — it checks the code itself (CLAUDE.md › Do NOT: a DEFINER function open to anon checks its own
-- caller).
REVOKE ALL ON FUNCTION public.mkt_pic_stage_answer(text, uuid, integer, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mkt_pic_stage_answer(text, uuid, integer, text, text, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
