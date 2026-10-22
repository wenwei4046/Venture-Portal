-- ============================================================================
-- 20261024002000_marketing_product_projects.sql
-- Marketing's 📦 product projects, the first part (②b of the Claude Design handoff "HOUZS Marketing Module Setup";
-- the user: "全部照设计做", in order) — New Project's product branch up to the PIC's answer: a subsidiary and a
-- product picked, the project made on the product's version in effect today, its intake meeting minutes (the
-- product's intake template, as that version names it) filled in with the PIC, signed by those who attended, then
-- sent: the tracking link made and the project waits for the PIC — or, when the template asks no PIC sign-off, the
-- minutes complete and the project is approved. A manager may start before the PIC approves, with a reason (kept in
-- the trail). The PIC's own page (the link) and the Assignment plan come next.
-- ============================================================================
--
-- A product project's way (mkt_projects.status): minutes (the intake minutes being filled in) → waiting_pic (sent:
-- the link made, link_sent_at) → changes (the PIC asked for changes, pic_reply) → waiting_pic again (resent) →
-- approved (the PIC approved on the link — or, with no PIC sign-off, the minutes completed). After approval an edit of
-- something the PIC sees sends it back to waiting_pic ("needs PIC re-approval"); an internal one never does.
-- Tables (RLS on, NO policy, no client grants — the functions below, as the rest of Marketing's):
--   mkt_minutes   a meeting's minutes on a project: the template version they follow, what was written (vals, by
--                 field name), who signed (signed, attendee → when), the meeting notes (internal), draft · sent (with
--                 the PIC) · completed, locked once completed when the template says so; one per project is its intake.
--   mkt_projects  + link_sent_at (when the PIC was last sent the link), pic_reply (the PIC's last answer).
-- Functions (SECURITY DEFINER, plpgsql; PUBLIC and anon revoked, `authenticated` granted):
--   mkt_product_picker()                   Marketing · Manage — the products on sale, each at its version in effect
--   mkt_product_start(sub, product)        Marketing · Manage — the project and its intake minutes made
--   mkt_product_project(key)               Marketing · View — a product project's page: the project, its product,
--                                          its minutes with their templates, the team, the trail
--   mkt_minutes_fill(minutes, rev, patch)  Marketing · Manage — what was written saved, never over another's save
--   mkt_minutes_sign(minutes)              Marketing · Edit — an attendee signs, as themselves
--   mkt_minutes_send(minutes, rev)         Marketing · Manage — the intake minutes, checked whole, sent to the PIC
--   mkt_project_override(project, reason)  Marketing · Manage — started before the PIC approves, with a reason
--   mkt_project_resend(project)            Marketing · Manage — sent to the PIC again after changes
-- The functions' own (PUBLIC, anon and authenticated revoked): mkt_product_in_effect, mkt_minutes_value,
-- mkt_minutes_missing, mkt_minutes_attendees.
-- PGlite: tests/member-sql/validate-marketing-product-projects.mjs.

ALTER TABLE public.mkt_projects ADD COLUMN IF NOT EXISTS link_sent_at timestamptz;
ALTER TABLE public.mkt_projects ADD COLUMN IF NOT EXISTS pic_reply jsonb
  CHECK (pic_reply IS NULL OR jsonb_typeof(pic_reply) = 'object');

CREATE TABLE IF NOT EXISTS public.mkt_minutes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid NOT NULL REFERENCES public.mkt_projects(id) ON DELETE CASCADE,
  template_id      uuid NOT NULL,
  template_version integer NOT NULL,
  intake           boolean NOT NULL DEFAULT false,
  title            text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 80),
  vals             jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(vals) = 'object'),
  signed           jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(signed) = 'object'),
  notes            text NOT NULL DEFAULT '' CHECK (length(notes) <= 4000),
  status           text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'completed')),
  locked           boolean NOT NULL DEFAULT false,
  rev              integer NOT NULL DEFAULT 1 CHECK (rev >= 1),
  completed_at     timestamptz,
  completed_by     text CHECK (length(completed_by) <= 120),
  created_by       uuid REFERENCES public.users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid REFERENCES public.users(id),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (template_id, template_version) REFERENCES public.mkt_minutes_versions (template_id, version),
  CHECK ((status = 'completed') = (completed_at IS NOT NULL)),
  CHECK (NOT locked OR status = 'completed')
);
CREATE UNIQUE INDEX IF NOT EXISTS mkt_minutes_intake ON public.mkt_minutes (project_id) WHERE intake;
CREATE INDEX IF NOT EXISTS mkt_minutes_project ON public.mkt_minutes (project_id);

ALTER TABLE public.mkt_minutes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mkt_minutes FROM anon, authenticated;

SELECT public.audit_register('mkt_minutes', 'Marketing meeting minutes', 'Marketing', '{}', 'none',
  p_reason => 'Written as the meeting goes; who sent, signed, approved and changed them after approval is the project''s trail (mkt_events)');

-- ── The version of a product in effect today: the newest published one taking effect by today (the functions' own) ──
CREATE OR REPLACE FUNCTION public.mkt_product_in_effect(p_product uuid)
RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN (SELECT max(v.version) FROM public.mkt_product_versions v
           JOIN public.mkt_products p ON p.id = v.product_id
          WHERE v.product_id = p_product AND p.status = 'active'
            AND v.effective_from <= (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date);
END
$fn$;

-- ── A field's value as minutes keep it, or refused (the functions' own): by the field's kind ──
-- Text as typed (short ≤ 200, long ≤ 4000); a date YYYY-MM-DD; a number as written; People a list of ids; a table its
-- rows (one short line per column); the Free space its own columns and rows. Empty = null (nothing kept).
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
  END IF;
  RAISE EXCEPTION '"%" is not written in.', v_name USING ERRCODE = '22023';
END
$fn$;

-- ── What is still empty of what the minutes require (the functions' own) — the project link fills itself ──
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
       OR (jsonb_typeof(v_v) = 'object' AND NOT EXISTS (
             SELECT 1 FROM jsonb_array_elements(coalesce(v_v -> 'rows', '[]'::jsonb)) r, jsonb_array_elements_text(r) c
              WHERE btrim(c) <> '')) THEN
      v_out := v_out || (v_f ->> 'name');
    END IF;
  END LOOP;
  RETURN v_out;
END
$fn$;

-- ── Who attended: the minutes' locked People field (the functions' own) ──
CREATE OR REPLACE FUNCTION public.mkt_minutes_attendees(p_fields jsonb, p_vals jsonb)
RETURNS uuid[]
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $fn$
DECLARE
  v_name text := (SELECT f ->> 'name' FROM jsonb_array_elements(coalesce(p_fields, '[]'::jsonb)) f
                   WHERE f ->> 'type' = 'People' AND coalesce((f -> 'lock') = 'true'::jsonb, false) LIMIT 1);
BEGIN
  IF v_name IS NULL OR jsonb_typeof(p_vals -> v_name) IS DISTINCT FROM 'array' THEN
    RETURN '{}';
  END IF;
  RETURN ARRAY(SELECT x::uuid FROM jsonb_array_elements_text(p_vals -> v_name) x);
END
$fn$;

REVOKE ALL ON FUNCTION public.mkt_product_in_effect(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_minutes_value(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_minutes_missing(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_minutes_attendees(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_product_in_effect(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mkt_minutes_value(jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.mkt_minutes_missing(jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.mkt_minutes_attendees(jsonb, jsonb) TO service_role;

-- ── New Project's products: those on sale, each at its version in effect today ──
CREATE OR REPLACE FUNCTION public.mkt_product_picker()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'Starting a product project is the manager''s.');
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'id', p.id, 'code', p.code, 'name', v.name, 'kind', v.kind, 'version', v.version, 'note', v.note,
             'description', v.description,
             'actions', (SELECT count(*) FROM jsonb_array_elements(v.groups) g, jsonb_array_elements(g -> 'items') it),
             'intake', jsonb_build_object('id', t.id, 'name', t.name, 'version', v.intake_version,
                                          'fields', jsonb_array_length(mv.fields)))
           ORDER BY lower(v.name), p.code)
      FROM public.mkt_products p
      JOIN public.mkt_product_versions v ON v.product_id = p.id AND v.version = public.mkt_product_in_effect(p.id)
      JOIN public.mkt_minutes_templates t ON t.id = v.intake_id
      JOIN public.mkt_minutes_versions mv ON mv.template_id = v.intake_id AND mv.version = v.intake_version
     WHERE p.status = 'active'), '[]'::jsonb);
END
$fn$;

-- ── A product project started: on the product's version in effect, its intake minutes ready to fill in ──
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
                                   pic_name, pic_whatsapp, created_by)
  VALUES (v_track, 'product', v_sub.id, left(v_sub.name || ' · ' || v_pv.name || ' · ' || to_char(v_today, 'Mon YYYY'), 140),
          'minutes', p_product, v_ver, v_me, v_sub.pic_name, v_sub.pic_whatsapp, auth.uid())
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

-- ── A product project's page ────────────────────────────────────────────────
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
        FROM (SELECT * FROM public.mkt_events WHERE project_id = v_p.id ORDER BY id DESC LIMIT 40) e), '[]'::jsonb));
END
$fn$;

-- ── Minutes saved as written ────────────────────────────────────────────────
-- p_patch: vals (field name → value; only those given change; null clears), notes, and on the intake minutes the
-- PIC's name (pic) and WhatsApp (whatsapp). p_rev: the minutes the caller last saw — another's save is never written
-- over. After the PIC approved, a change to something the PIC sees sends the project back to them; an internal one
-- (a field the PIC does not see, the WhatsApp, the notes) never does. Answers { rev, status, minutes, reapproval }.
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
  IF (v_patch ? 'pic' OR v_patch ? 'whatsapp') AND NOT v_m.intake THEN
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
  IF v_patch ? 'pic' OR v_patch ? 'whatsapp' THEN
    UPDATE public.mkt_projects SET pic_name = v_pic, pic_whatsapp = v_wa, updated_at = now() WHERE id = v_p.id;
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

-- ── An attendee signs, as themselves ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_minutes_sign(p_minutes uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me uuid := public.mkt_me_staff();
  v_m  public.mkt_minutes;
  v_mv public.mkt_minutes_versions;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.edit'], 'Signing minutes is not open to your account.');
  SELECT * INTO v_m FROM public.mkt_minutes WHERE id = p_minutes FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Those minutes are not there any more.' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_mv FROM public.mkt_minutes_versions WHERE template_id = v_m.template_id AND version = v_m.template_version;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_mv.fields) f WHERE f ->> 'type' = 'Signature') THEN
    RAISE EXCEPTION 'These minutes take no signatures.' USING ERRCODE = '22023';
  END IF;
  IF v_m.locked OR v_m.status = 'completed' THEN
    RAISE EXCEPTION 'These minutes are complete.' USING ERRCODE = '22023';
  END IF;
  IF v_me IS NULL OR NOT (v_me = ANY (public.mkt_minutes_attendees(v_mv.fields, v_m.vals))) THEN
    RAISE EXCEPTION 'Only those who attended sign — each for themselves.' USING ERRCODE = '42501';
  END IF;
  IF v_m.signed ? v_me::text THEN
    RETURN jsonb_build_object('rev', v_m.rev);
  END IF;
  UPDATE public.mkt_minutes
     SET signed = signed || jsonb_build_object(v_me::text, jsonb_build_object('at', now())), updated_at = now()
   WHERE id = v_m.id
  RETURNING * INTO v_m;
  PERFORM public.mkt_log(v_m.project_id, 'signed', p_reason => v_m.title);
  RETURN jsonb_build_object('rev', v_m.rev);
END
$fn$;

-- ── The intake minutes, checked whole and sent: the tracking link made; the PIC answers on it ──
-- Every required field filled, the PIC named, every attendee signed when the template asks it. With PIC sign-off the
-- project waits for the PIC; without it the minutes complete (locked when the template says) and the project is
-- approved. Answers { status, minutes, link }.
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
  IF coalesce((v_mv.rules -> 'sign') = 'true'::jsonb, false)
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(v_mv.fields) f WHERE f ->> 'type' = 'Signature') THEN
    v_unsign := ARRAY(SELECT coalesce(public.mkt_staff_name(a), 'Somebody') FROM unnest(public.mkt_minutes_attendees(v_mv.fields, v_m.vals)) a
                       WHERE NOT (v_m.signed ? a::text));
    IF cardinality(v_unsign) > 0 THEN
      RAISE EXCEPTION 'Waiting for signatures: %.', array_to_string(v_unsign, ', ') USING ERRCODE = '22023';
    END IF;
  END IF;

  v_link := coalesce(v_p.link_code, replace(gen_random_uuid()::text, '-', ''));
  IF coalesce((v_mv.rules -> 'pic') = 'true'::jsonb, false) THEN
    UPDATE public.mkt_minutes SET status = 'sent', rev = rev + 1, updated_by = auth.uid(), updated_at = now()
     WHERE id = v_m.id RETURNING * INTO v_m;
    UPDATE public.mkt_projects SET status = 'waiting_pic', link_code = v_link, link_sent_at = now(), pic_reply = NULL,
                                   updated_at = now()
     WHERE id = v_p.id;
    PERFORM public.mkt_log(v_p.id, 'link sent', p_reason => v_p.pic_name);
  ELSE
    UPDATE public.mkt_minutes
       SET status = 'completed', completed_at = now(), completed_by = public.mkt_actor(),
           locked = coalesce((v_mv.rules -> 'lock') = 'true'::jsonb, false), rev = rev + 1, updated_by = auth.uid(), updated_at = now()
     WHERE id = v_m.id RETURNING * INTO v_m;
    UPDATE public.mkt_projects SET status = 'approved', link_code = v_link, updated_at = now() WHERE id = v_p.id;
    PERFORM public.mkt_log(v_p.id, 'minutes completed', p_reason => v_m.title);
  END IF;
  RETURN jsonb_build_object('status', (SELECT p.status FROM public.mkt_projects p WHERE p.id = v_p.id),
                            'minutes', v_m.status, 'rev', v_m.rev, 'link', v_link);
END
$fn$;

-- ── Started before the PIC approves: the manager's reason in the trail ──────
CREATE OR REPLACE FUNCTION public.mkt_project_override(p_project uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_p      public.mkt_projects;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_o      jsonb;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'Starting before the PIC approves is the manager''s.');
  SELECT * INTO v_p FROM public.mkt_projects WHERE id = p_project FOR UPDATE;
  IF NOT FOUND OR v_p.kind <> 'product' THEN
    RAISE EXCEPTION 'That project is not there.' USING ERRCODE = 'P0002';
  END IF;
  IF v_p.status NOT IN ('waiting_pic', 'changes') THEN
    RAISE EXCEPTION 'Only a project waiting for the PIC starts before approval.' USING ERRCODE = '22023';
  END IF;
  IF v_p.override IS NOT NULL THEN
    RAISE EXCEPTION 'It was started before approval already.' USING ERRCODE = '22023';
  END IF;
  IF length(v_reason) NOT BETWEEN 5 AND 300 THEN
    RAISE EXCEPTION 'Say why — 5 to 300 characters.' USING ERRCODE = '22023';
  END IF;
  v_o := jsonb_build_object('by', public.mkt_actor(), 'at', now(), 'reason', v_reason);
  UPDATE public.mkt_projects SET override = v_o, updated_at = now() WHERE id = v_p.id;
  PERFORM public.mkt_log(v_p.id, 'started before approval', p_reason => v_reason);
  RETURN jsonb_build_object('override', v_o);
END
$fn$;

-- ── Sent to the PIC again, after the changes they asked for ─────────────────
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
  PERFORM public.mkt_log(v_p.id, 'resent', p_reason => v_p.pic_name);
  RETURN jsonb_build_object('status', 'waiting_pic');
END
$fn$;

REVOKE ALL ON FUNCTION public.mkt_product_picker() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_product_start(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_product_project(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_minutes_fill(uuid, integer, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_minutes_sign(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_minutes_send(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_project_override(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_project_resend(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_product_picker() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_product_start(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_product_project(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_minutes_fill(uuid, integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_minutes_sign(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_minutes_send(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_project_override(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_project_resend(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
