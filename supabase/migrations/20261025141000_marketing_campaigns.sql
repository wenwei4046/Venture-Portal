-- 2026-10-24 — Marketing ④-2b: campaigns (the user's answer 13: "a campaign is a product project with a run period: its
-- stages prepare it — a truck event's script, sourcing, approval, decoration … — then it runs a week or a month; the
-- timeline shows which campaign runs when"). The handoff's New Project keeps it in the intake minutes: *Campaign period
-- ⭐ 👁 — [date] to [date]*, the PIC's to see and approve.
--   The field      a minutes field of its own kind, *Campaign period* (from, to — the end on or after the start, within a
--                  year; one a template): mkt_minutes_check, mkt_minutes_value, mkt_minutes_missing — production's bodies.
--   The project    mkt_projects.campaign_from / campaign_until: the intake's period, both days else none, set as the
--                  minutes are written (mkt_minutes_fill — production's body; the trail keeps each change). Seen by the
--                  PIC, a change after their approval sends it back to them, as any field they see.
--   Read           the board (mkt_board: a campaign while it runs and 60 days after, or in the range asked), the product
--                  page (mkt_product_project), the PIC's link (mkt_pic_page) — production's bodies.

ALTER TABLE public.mkt_projects ADD COLUMN IF NOT EXISTS campaign_from date;
ALTER TABLE public.mkt_projects ADD COLUMN IF NOT EXISTS campaign_until date;
ALTER TABLE public.mkt_projects DROP CONSTRAINT IF EXISTS mkt_projects_campaign_check;
ALTER TABLE public.mkt_projects ADD CONSTRAINT mkt_projects_campaign_check
  CHECK ((campaign_from IS NULL) = (campaign_until IS NULL)
         AND (campaign_from IS NULL OR (kind = 'product' AND campaign_until >= campaign_from)));

-- ── The minutes: the kind, one a template (production's body) ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_minutes_check(p_fields jsonb, p_rules jsonb, p_publish boolean)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_types text[] := ARRAY['Short text', 'Long text', 'Date', 'Number', 'People', 'Project link', 'Free space', 'Table', 'Signature',
                              'Campaign period'];
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
  -- A campaign's run period (answer 13): one a template — its project runs once.
  IF (SELECT count(*) FROM jsonb_array_elements(v_out) f WHERE f ->> 'type' = 'Campaign period') > 1 THEN
    RAISE EXCEPTION 'Minutes keep one campaign period.' USING ERRCODE = '22023';
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

-- ── Its value: from and to (production's body) ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_minutes_value(p_field jsonb, p_v jsonb)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $fn$
DECLARE
  v_type text := p_field ->> 'type';
  v_name text := p_field ->> 'name';
  v_s    text;
  v_cols integer;
  v_row  jsonb;
  v_x    text;
  v_out  jsonb := '[]'::jsonb;
  v_from text;
  v_to   text;
  v_d1   date;
  v_d2   date;
BEGIN
  IF p_v IS NULL OR jsonb_typeof(p_v) = 'null' THEN
    RETURN NULL;
  END IF;
  IF v_type IN ('Short text', 'Long text', 'Date', 'Number') THEN
    IF jsonb_typeof(p_v) NOT IN ('string', 'number') THEN
      RAISE EXCEPTION '"%": not something it takes.', v_name USING ERRCODE = '22023';
    END IF;
    v_s := p_v #>> '{}';
    IF v_type = 'Short text' AND length(v_s) > 200 OR v_type = 'Long text' AND length(v_s) > 4000 THEN
      RAISE EXCEPTION '"%": at most % characters.', v_name, CASE WHEN v_type = 'Short text' THEN 200 ELSE 4000 END USING ERRCODE = '22023';
    END IF;
    IF btrim(v_s) = '' THEN
      RETURN NULL;
    END IF;
    IF v_type = 'Date' THEN
      IF v_s !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
        RAISE EXCEPTION '"%": a date.', v_name USING ERRCODE = '22023';
      END IF;
      BEGIN
        PERFORM v_s::date;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION '"%": a date.', v_name USING ERRCODE = '22023';
      END;
    ELSIF v_type = 'Number' AND btrim(v_s) !~ '^-?[0-9]{1,12}([.][0-9]{1,4})?$' THEN
      RAISE EXCEPTION '"%": a number.', v_name USING ERRCODE = '22023';
    END IF;
    RETURN to_jsonb(CASE WHEN v_type = 'Number' THEN btrim(v_s) ELSE v_s END);
  ELSIF v_type = 'People' THEN
    IF jsonb_typeof(p_v) IS DISTINCT FROM 'array' OR jsonb_array_length(p_v) > 30 THEN
      RAISE EXCEPTION '"%": at most 30 people.', v_name USING ERRCODE = '22023';
    END IF;
    FOR v_x IN SELECT x FROM jsonb_array_elements_text(p_v) x LOOP
      IF v_x !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION '"%": somebody who is not on the team.', v_name USING ERRCODE = '22023';
      END IF;
      IF NOT v_out @> to_jsonb(ARRAY[lower(v_x)]) THEN
        v_out := v_out || to_jsonb(ARRAY[lower(v_x)]);
      END IF;
    END LOOP;
    RETURN CASE WHEN jsonb_array_length(v_out) = 0 THEN NULL ELSE v_out END;
  ELSIF v_type IN ('Table', 'Free space') THEN
    IF jsonb_typeof(p_v) IS DISTINCT FROM 'object' OR jsonb_typeof(p_v -> 'rows') IS DISTINCT FROM 'array'
       OR jsonb_array_length(p_v -> 'rows') > 50 THEN
      RAISE EXCEPTION '"%": at most 50 rows.', v_name USING ERRCODE = '22023';
    END IF;
    IF v_type = 'Table' THEN
      v_cols := jsonb_array_length(coalesce(p_field -> 'cols', '[]'::jsonb));
    ELSE
      IF jsonb_typeof(p_v -> 'cols') IS DISTINCT FROM 'array' OR jsonb_array_length(p_v -> 'cols') NOT BETWEEN 1 AND 8
         OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_v -> 'cols') c WHERE jsonb_typeof(c) <> 'string' OR length(c #>> '{}') > 40) THEN
        RAISE EXCEPTION '"%": 1 to 8 columns, each named in at most 40 characters.', v_name USING ERRCODE = '22023';
      END IF;
      v_cols := jsonb_array_length(p_v -> 'cols');
    END IF;
    FOR v_row IN SELECT x FROM jsonb_array_elements(p_v -> 'rows') x LOOP
      IF jsonb_typeof(v_row) IS DISTINCT FROM 'array' OR jsonb_array_length(v_row) <> v_cols
         OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_row) c WHERE jsonb_typeof(c) <> 'string' OR length(c #>> '{}') > 500) THEN
        RAISE EXCEPTION '"%": a row is one short line per column.', v_name USING ERRCODE = '22023';
      END IF;
    END LOOP;
    RETURN CASE WHEN v_type = 'Table' THEN jsonb_build_object('rows', p_v -> 'rows')
                ELSE jsonb_build_object('cols', p_v -> 'cols', 'rows', p_v -> 'rows') END;
  -- A campaign's run period (answer 13): from and to, each a date — or empty while it is being typed; the end on or
  -- after the start, within a year.
  ELSIF v_type = 'Campaign period' THEN
    IF jsonb_typeof(p_v) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION '"%": a start and an end.', v_name USING ERRCODE = '22023';
    END IF;
    v_from := nullif(btrim(coalesce(p_v ->> 'from', '')), '');
    v_to := nullif(btrim(coalesce(p_v ->> 'to', '')), '');
    IF (v_from IS NOT NULL AND v_from !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') OR (v_to IS NOT NULL AND v_to !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') THEN
      RAISE EXCEPTION '"%": dates.', v_name USING ERRCODE = '22023';
    END IF;
    BEGIN
      v_d1 := v_from::date;
      v_d2 := v_to::date;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION '"%": dates.', v_name USING ERRCODE = '22023';
    END;
    IF v_d1 IS NOT NULL AND v_d2 IS NOT NULL AND (v_d2 < v_d1 OR v_d2 - v_d1 > 365) THEN
      RAISE EXCEPTION '"%": it ends on or after its start, within a year.', v_name USING ERRCODE = '22023';
    END IF;
    RETURN CASE WHEN v_d1 IS NULL AND v_d2 IS NULL THEN NULL
                ELSE jsonb_build_object('from', v_d1::text, 'to', v_d2::text) END;
  END IF;
  RAISE EXCEPTION '"%" is not written in.', v_name USING ERRCODE = '22023';
END
$fn$;

-- ── Required: both its days (production's body) ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_minutes_missing(p_fields jsonb, p_vals jsonb)
RETURNS text[]
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $fn$
DECLARE
  v_f   jsonb;
  v_v   jsonb;
  v_out text[] := '{}';
BEGIN
  FOR v_f IN SELECT x FROM jsonb_array_elements(coalesce(p_fields, '[]'::jsonb)) x LOOP
    CONTINUE WHEN v_f ->> 'type' IN ('Project link', 'Signature');
    CONTINUE WHEN NOT (coalesce((v_f -> 'req') = 'true'::jsonb, false) OR coalesce((v_f -> 'lock') = 'true'::jsonb, false));
    v_v := p_vals -> (v_f ->> 'name');
    IF v_v IS NULL OR jsonb_typeof(v_v) = 'null'
       OR (jsonb_typeof(v_v) = 'string' AND btrim(v_v #>> '{}') = '')
       OR (jsonb_typeof(v_v) = 'array' AND jsonb_array_length(v_v) = 0)
       -- A campaign's run period: both its days (answer 13).
       OR (jsonb_typeof(v_v) = 'object' AND v_f ->> 'type' = 'Campaign period'
           AND (coalesce(v_v ->> 'from', '') = '' OR coalesce(v_v ->> 'to', '') = ''))
       OR (jsonb_typeof(v_v) = 'object' AND v_f ->> 'type' IS DISTINCT FROM 'Campaign period' AND NOT EXISTS (
             SELECT 1 FROM jsonb_array_elements(coalesce(v_v -> 'rows', '[]'::jsonb)) r, jsonb_array_elements_text(r) c
              WHERE btrim(c) <> '')) THEN
      v_out := v_out || (v_f ->> 'name');
    END IF;
  END LOOP;
  RETURN v_out;
END
$fn$;

-- ── The intake's period on its project (production's body) ───────────────────────────────────────────────
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
  v_cf      date;
  v_cu      date;
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
  -- A campaign's run period (answer 13): the intake's, on its project — both days, else none; the trail keeps each change.
  IF v_m.intake THEN
    v_f := (SELECT f FROM jsonb_array_elements(v_mv.fields) f WHERE f ->> 'type' = 'Campaign period' LIMIT 1);
    IF v_f IS NOT NULL THEN
      v_v := v_vals -> (v_f ->> 'name');
      IF coalesce(v_v ->> 'from', '') <> '' AND coalesce(v_v ->> 'to', '') <> '' THEN
        v_cf := (v_v ->> 'from')::date;
        v_cu := (v_v ->> 'to')::date;
      END IF;
      IF v_cf IS DISTINCT FROM v_p.campaign_from OR v_cu IS DISTINCT FROM v_p.campaign_until THEN
        UPDATE public.mkt_projects SET campaign_from = v_cf, campaign_until = v_cu, updated_at = now() WHERE id = v_p.id;
        PERFORM public.mkt_log(v_p.id, 'campaign period', p_data => jsonb_build_object('from', v_cf, 'until', v_cu));
      END IF;
    END IF;
  END IF;
  RETURN jsonb_build_object('rev', v_m.rev, 'minutes', v_m.status, 'reapproval', v_reapp,
                            'status', (SELECT p.status FROM public.mkt_projects p WHERE p.id = v_m.project_id));
END
$fn$;

-- ── The board: a campaign and its run period (production's body) ────────────────────────────────────────
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
        -- A campaign while it runs, and for 60 days after — or in the range asked (answer 13).
        OR p.campaign_until >= v_today - 60
        OR (p_from IS NOT NULL AND p_to IS NOT NULL AND p.campaign_from <= p_to AND p.campaign_until >= p_from)
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
                             'updatedAt', p.updated_at, 'doneAt', p.done_at,
                             'campaign', CASE WHEN p.campaign_from IS NOT NULL
                                              THEN jsonb_build_object('from', p.campaign_from, 'until', p.campaign_until) END) ORDER BY x.ord)
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

-- ── The product page: its run period (production's body) ────────────────────────────────────────────────
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
      -- A campaign's run period (answer 13), from its intake minutes.
      'campaign', CASE WHEN v_p.campaign_from IS NOT NULL THEN jsonb_build_object('from', v_p.campaign_from, 'until', v_p.campaign_until) END,
      -- Its months (②b-2f): the run day, the first month, how many made, the month it stops — the work's, not money.
      'runs', CASE WHEN v_p.run_day IS NOT NULL THEN jsonb_build_object('day', v_p.run_day, 'first', v_p.bill_from,
                'made', public.mkt_product_runs_made(v_p.id), 'until', v_p.bill_until) END,
      'product', (SELECT jsonb_build_object('id', pv.product_id, 'version', pv.version, 'name', pv.name, 'kind', pv.kind,
                                            'note', pv.note)
                    FROM public.mkt_product_versions pv WHERE pv.product_id = v_p.product_id AND pv.version = v_p.product_version)),
    -- Its billing (②b-2b), the manager's: the amount, a recurring one's months, what was confirmed.
    'bill', CASE WHEN coalesce(public.has_any_action(ARRAY['marketing.manage']), false) THEN jsonb_build_object(
              'amount', v_p.bill_amount, 'from', v_p.bill_from, 'until', v_p.bill_until,
              'confirmed', (SELECT count(*) FROM public.mkt_bills b WHERE b.project_id = v_p.id AND b.status = 'confirmed'),
              'last', (SELECT max(b.month) FROM public.mkt_bills b WHERE b.project_id = v_p.id AND b.status = 'confirmed')) END,
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

-- ── The PIC's link: the period read (production's body) ──────────────────────────────────────────────────
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
      WHEN 'Campaign period' THEN CASE WHEN jsonb_typeof(v_v) = 'object' THEN jsonb_build_object('from', v_v -> 'from', 'to', v_v -> 'to') END
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
                           'links', CASE WHEN jsonb_typeof(s.work -> 'links') = 'array' THEN s.work -> 'links' ELSE '[]'::jsonb END,
                           -- Its files (②b-2e): the stage's own Files, and a File field's when the PIC sees the field; each
                           -- opened through /t/<code>/f/<key> (mkt_pic_file), never by its path.
                           'files', coalesce((
                              SELECT jsonb_agg(jsonb_build_object('key', split_part(x.f ->> 'path', '/', 2), 'name', x.f ->> 'name',
                                       'size', x.f -> 'size', 'mime', x.f ->> 'mime', 'field', x.f ->> 'field') ORDER BY x.o)
                                FROM jsonb_array_elements(CASE WHEN jsonb_typeof(s.work -> 'files') = 'array' THEN s.work -> 'files' ELSE '[]'::jsonb END)
                                     WITH ORDINALITY AS x(f, o)
                               WHERE public.mkt_pic_sees_file(s.spec, x.f ->> 'field')), '[]'::jsonb))
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

NOTIFY pgrst, 'reload schema';
