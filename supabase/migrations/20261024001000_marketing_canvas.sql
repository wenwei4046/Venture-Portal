-- ============================================================================
-- 20261024001000_marketing_canvas.sql
-- Marketing's Canvas Template Editor — ③ of the Claude Design handoff "HOUZS Marketing Module Setup" (the Workflow
-- Builder's *Canvas template* tab, `Canvas Template Editor.dc.html`; the user: "全部照设计做", in order): how the task
-- page of a project started from a workflow template is laid out, kept with the template's draft and published with
-- its versions. A project's page (②b) and the PIC's link (⑤) draw it.
-- ============================================================================
--
-- The canvas, top to bottom: 📋 Requirements (from the intake minutes; read-only, always first — only whether the PIC
-- sees it is set), a section per stage holding the fields that stage fills in (its title is the stage's name), the
-- manager's own sections, the Free space (always last; the only place colleagues add their own blocks).
--   a stage's section:  stages[i].sec = { emoji, locked (colleagues can't delete it), req (required before the stage
--                       submits), pic (shown to the PIC) } — default 🎯, not locked, required, shown.
--   a field's settings: on stages[i].form[j] and on the manager's own fields — req (required before submit; never a
--                       note), pic (shown to the PIC), cal (a date on the calendar: { label, tone — a team's colour,
--                       pic — on the PIC's calendar too }), opts (a choice's options).
--   the template's:     canvas = { req: { pic }, sections: [{ emoji, title, stage (the stage it belongs to, or null =
--                       any), locked, req, pic, fields: [{ label, type, stage (the stage that fills it in), req, pic,
--                       cal?, opts? }] }] } — after the stages' sections, in this order.
-- A section's ⭐ and a field's ⭐ both stand: a field is required when its section is too; the PIC sees a field when he
-- sees its section too. A stage moved or taken out is followed by the builder; here an index out of range is dropped
-- (null) in a draft and refused when published, as every name left blank and a choice with no options.
-- Changed (each from production's body, compared by md5 on 2026-10-23 — equal to 20261023235500's copies; one
-- statement added each): mkt_workflow_check keeps a stage's section and a field's settings; mkt_workflows() answers the
-- canvas; mkt_workflow_save(id, rev, patch) takes it (`canvas`) and keeps it in step with the stages; publishing checks
-- it whole and keeps it with the version; a clone copies it.
-- New (the functions' own — PUBLIC, anon and authenticated revoked): mkt_field_extras, mkt_canvas_stage, mkt_canvas_check.
-- PGlite: tests/member-sql/validate-marketing-canvas.mjs.

ALTER TABLE public.mkt_workflows
  ADD COLUMN IF NOT EXISTS canvas jsonb NOT NULL DEFAULT '{"req": {"pic": true}, "sections": []}'::jsonb
  CHECK (jsonb_typeof(canvas) = 'object');
ALTER TABLE public.mkt_workflow_versions
  ADD COLUMN IF NOT EXISTS canvas jsonb NOT NULL DEFAULT '{"req": {"pic": true}, "sections": []}'::jsonb
  CHECK (jsonb_typeof(canvas) = 'object');

-- ── A field's settings on the canvas, checked (the functions' own) ──────────
-- p_default: whether an unset ⭐ / 👁 is on (a stage's own fields: yes; the manager's: the builder always says).
CREATE OR REPLACE FUNCTION public.mkt_field_extras(p_f jsonb, p_type text, p_label text, p_publish boolean, p_where text, p_default boolean)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $fn$
DECLARE
  v_out   jsonb;
  v_cal   jsonb;
  v_label text;
  v_opts  jsonb := '[]'::jsonb;
  v_o     text;
  v_seen  text[] := '{}';
BEGIN
  v_out := jsonb_build_object(
    'req', CASE WHEN p_type = 'Note' THEN false
                WHEN jsonb_typeof(p_f -> 'req') = 'boolean' THEN (p_f ->> 'req')::boolean ELSE p_default END,
    'pic', CASE WHEN jsonb_typeof(p_f -> 'pic') = 'boolean' THEN (p_f ->> 'pic')::boolean ELSE p_default END);

  -- A date on the calendar: its name there (the field's when blank), a team's colour, the PIC's calendar or not.
  IF p_type = 'Date' AND jsonb_typeof(p_f -> 'cal') = 'object' THEN
    v_cal := p_f -> 'cal';
    v_label := coalesce(nullif(btrim(coalesce(v_cal ->> 'label', '')), ''), p_label);
    IF length(v_label) > 40 THEN
      RAISE EXCEPTION '%: a name on the calendar of at most 40 characters.', p_where USING ERRCODE = '22023';
    END IF;
    IF coalesce(v_cal ->> 'tone', '') NOT IN ('content', 'social', 'design', 'ads', 'brand') THEN
      RAISE EXCEPTION '%: pick the date''s colour on the calendar.', p_where USING ERRCODE = '22023';
    END IF;
    v_out := v_out || jsonb_build_object('cal', jsonb_build_object('label', v_label, 'tone', v_cal ->> 'tone',
      'pic', coalesce((v_cal -> 'pic') = 'true'::jsonb, false)));
  END IF;

  -- A choice's options: short, each once; a version's choice has at least one.
  IF p_type IN ('Select', 'Multi-select') THEN
    IF jsonb_typeof(p_f -> 'opts') = 'array' THEN
      IF jsonb_array_length(p_f -> 'opts') > 30 THEN
        RAISE EXCEPTION '%: a choice has at most 30 options.', p_where USING ERRCODE = '22023';
      END IF;
      FOR v_o IN SELECT btrim(x) FROM jsonb_array_elements_text(p_f -> 'opts') x LOOP
        IF length(v_o) > 40 THEN
          RAISE EXCEPTION '%: an option of at most 40 characters.', p_where USING ERRCODE = '22023';
        END IF;
        CONTINUE WHEN v_o = '';
        IF p_publish AND lower(v_o) = ANY (v_seen) THEN
          RAISE EXCEPTION '%: the option "%" is there twice.', p_where, v_o USING ERRCODE = '22023';
        END IF;
        v_seen := v_seen || lower(v_o);
        v_opts := v_opts || to_jsonb(v_o);
      END LOOP;
    ELSIF p_f ? 'opts' AND jsonb_typeof(p_f -> 'opts') IS DISTINCT FROM 'null' THEN
      RAISE EXCEPTION '%: not a list of options.', p_where USING ERRCODE = '22023';
    END IF;
    IF p_publish AND jsonb_array_length(v_opts) = 0 THEN
      RAISE EXCEPTION '%: "%" — give the choice its options.', p_where, p_label USING ERRCODE = '22023';
    END IF;
    v_out := v_out || jsonb_build_object('opts', v_opts);
  END IF;
  RETURN v_out;
END
$fn$;

REVOKE ALL ON FUNCTION public.mkt_field_extras(jsonb, text, text, boolean, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_field_extras(jsonb, text, text, boolean, text, boolean) TO service_role;

-- ── A stage named by its index: one of the n there are, or none (the functions' own) ──
CREATE OR REPLACE FUNCTION public.mkt_canvas_stage(p_v jsonb, p_n integer)
RETURNS integer
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $fn$
BEGIN
  IF jsonb_typeof(p_v) IS DISTINCT FROM 'number' OR (p_v #>> '{}') !~ '^[0-9]{1,2}$' THEN
    RETURN NULL;
  END IF;
  RETURN CASE WHEN (p_v #>> '{}')::integer < p_n THEN (p_v #>> '{}')::integer END;
END
$fn$;

REVOKE ALL ON FUNCTION public.mkt_canvas_stage(jsonb, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_canvas_stage(jsonb, integer) TO service_role;

-- ── The manager's own sections, checked against the stages there are (the functions' own) ──
-- As a draft: shapes and limits, half-typed names kept, a stage index out of range dropped. As published: every section
-- and field named, a field once in its section, each field with the stage that fills it in, every choice with options.
CREATE OR REPLACE FUNCTION public.mkt_canvas_check(p_canvas jsonb, p_n integer, p_publish boolean)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $fn$
DECLARE
  v_c      jsonb := CASE WHEN jsonb_typeof(p_canvas) = 'object' THEN p_canvas ELSE '{}'::jsonb END;
  v_types  text[] := ARRAY['Text', 'Select', 'Multi-select', 'Date', 'Person', 'File', 'Checkbox'];
  v_secs   jsonb := '[]'::jsonb;
  v_s      jsonb;
  v_f      jsonb;
  v_fields jsonb;
  v_title  text;
  v_emoji  text;
  v_label  text;
  v_labels text[];
  v_where  text;
  v_stage  integer;
  i        integer := 0;
BEGIN
  IF v_c ? 'sections' AND jsonb_typeof(v_c -> 'sections') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Not a list of sections.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(coalesce(v_c -> 'sections', '[]'::jsonb)) > 12 THEN
    RAISE EXCEPTION 'A canvas has at most 12 sections of its own.' USING ERRCODE = '22023';
  END IF;
  FOR v_s IN SELECT x FROM jsonb_array_elements(coalesce(v_c -> 'sections', '[]'::jsonb)) x LOOP
    i := i + 1;
    IF jsonb_typeof(v_s) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Section %: not a section.', i USING ERRCODE = '22023';
    END IF;
    v_title := btrim(coalesce(v_s ->> 'title', ''));
    IF length(v_title) > 60 OR (p_publish AND v_title = '') THEN
      RAISE EXCEPTION 'Section %: give it a name (at most 60 characters).', i USING ERRCODE = '22023';
    END IF;
    v_where := CASE WHEN v_title = '' THEN format('Section %s', i) ELSE format('"%s"', v_title) END;
    v_emoji := coalesce(nullif(btrim(coalesce(v_s ->> 'emoji', '')), ''), '📝');
    IF length(v_emoji) > 16 THEN
      RAISE EXCEPTION '%: one emoji.', v_where USING ERRCODE = '22023';
    END IF;
    v_stage := public.mkt_canvas_stage(v_s -> 'stage', p_n);

    v_fields := '[]'::jsonb;
    v_labels := '{}';
    IF v_s ? 'fields' AND jsonb_typeof(v_s -> 'fields') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION '%: not a list of fields.', v_where USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(coalesce(v_s -> 'fields', '[]'::jsonb)) > 20 THEN
      RAISE EXCEPTION '%: at most 20 fields.', v_where USING ERRCODE = '22023';
    END IF;
    FOR v_f IN SELECT x FROM jsonb_array_elements(coalesce(v_s -> 'fields', '[]'::jsonb)) x LOOP
      IF jsonb_typeof(v_f) IS DISTINCT FROM 'object' OR NOT (coalesce(v_f ->> 'type', '') = ANY (v_types)) THEN
        RAISE EXCEPTION '%: a field of a kind it cannot hold.', v_where USING ERRCODE = '22023';
      END IF;
      v_label := btrim(coalesce(v_f ->> 'label', ''));
      IF length(v_label) > 60 OR (p_publish AND v_label = '') THEN
        RAISE EXCEPTION '%: name each field (at most 60 characters).', v_where USING ERRCODE = '22023';
      END IF;
      IF p_publish THEN
        IF v_label = ANY (v_labels) THEN
          RAISE EXCEPTION '%: two fields called "%".', v_where, v_label USING ERRCODE = '22023';
        END IF;
        v_labels := v_labels || v_label;
      END IF;
      v_fields := v_fields || jsonb_build_array(
        jsonb_build_object('label', v_label, 'type', v_f ->> 'type',
          'stage', to_jsonb(public.mkt_canvas_stage(v_f -> 'stage', p_n)))
        || public.mkt_field_extras(v_f, v_f ->> 'type', v_label, p_publish, v_where, false));
      IF p_publish AND v_fields -> -1 -> 'stage' = 'null'::jsonb THEN
        RAISE EXCEPTION '%: "%" — pick the stage that fills it in.', v_where, v_label USING ERRCODE = '22023';
      END IF;
    END LOOP;

    v_secs := v_secs || jsonb_build_array(jsonb_build_object(
      'emoji', v_emoji, 'title', v_title, 'stage', to_jsonb(v_stage),
      'locked', coalesce((v_s -> 'locked') = 'true'::jsonb, false),
      'req', coalesce((v_s -> 'req') = 'true'::jsonb, false),
      'pic', coalesce((v_s -> 'pic') = 'true'::jsonb, false),
      'fields', v_fields));
  END LOOP;
  RETURN jsonb_build_object(
    'req', jsonb_build_object('pic', coalesce((v_c -> 'req' -> 'pic') <> 'false'::jsonb, true)),
    'sections', v_secs);
END
$fn$;

REVOKE ALL ON FUNCTION public.mkt_canvas_check(jsonb, integer, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_canvas_check(jsonb, integer, boolean) TO service_role;

-- ── A template's stages, checked (nobody's to call but the functions below) ─
-- As a draft (p_publish false): the shapes and limits; each stage kept as typed, names half-typed included. As
-- published: every stage, field and column named, each field once; each 🔓 stage with its candidates and a stage
-- before it; everybody named on Marketing's team — and the lock applied (no 🔓 hand-offs, no subtasks).
-- Answers the stages written clean — each with its section on the canvas, each field with its settings (2026-10-23).
CREATE OR REPLACE FUNCTION public.mkt_workflow_check(p_stages jsonb, p_publish boolean, p_locked boolean)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uuid   text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_types  text[] := ARRAY['Text', 'Number', 'Select', 'Multi-select', 'Date', 'Person', 'File', 'Checkbox', 'Table', 'Note'];
  v_roster uuid[] := ARRAY(SELECT r.staff_id FROM public.mkt_roster() r);
  v_n      integer := CASE WHEN jsonb_typeof(p_stages) = 'array' THEN jsonb_array_length(p_stages) ELSE -1 END;
  v_out    jsonb := '[]'::jsonb;
  v_st     jsonb;
  v_name   text;
  v_mode   text;
  v_cands  jsonb;
  v_sla    integer;
  v_appr   jsonb;
  v_a      jsonb;
  v_form   jsonb;
  v_f      jsonb;
  v_label  text;
  v_labels text[];
  v_cols   jsonb;
  v_rows   jsonb;
  v_row    jsonb;
  v_back   integer;
  v_x      text;
  v_split  boolean;
  v_sec    jsonb;
  i        integer;
  j        integer;
BEGIN
  IF v_n < 0 THEN
    RAISE EXCEPTION 'Not a list of stages.' USING ERRCODE = '22023';
  END IF;
  IF v_n > 20 THEN
    RAISE EXCEPTION 'A workflow has at most 20 stages.' USING ERRCODE = '22023';
  END IF;
  IF p_publish AND v_n = 0 THEN
    RAISE EXCEPTION 'Add a stage first.' USING ERRCODE = '22023';
  END IF;
  FOR i IN 0 .. v_n - 1 LOOP
    v_st := p_stages -> i;
    IF jsonb_typeof(v_st) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Stage %: not a stage.', i + 1 USING ERRCODE = '22023';
    END IF;
    v_name := btrim(coalesce(v_st ->> 'name', ''));
    IF length(v_name) > 80 THEN
      RAISE EXCEPTION 'Stage %: a name of at most 80 characters.', i + 1 USING ERRCODE = '22023';
    END IF;
    IF p_publish AND v_name = '' THEN
      RAISE EXCEPTION 'Stage %: give it a name.', i + 1 USING ERRCODE = '22023';
    END IF;
    IF coalesce(v_st ->> 'dept', '') NOT IN ('content', 'social', 'design', 'ads', 'brand') THEN
      RAISE EXCEPTION 'Stage %: pick its team.', i + 1 USING ERRCODE = '22023';
    END IF;

    -- Who: picked at assignment, or by the stage before from a list.
    v_mode := CASE WHEN v_st -> 'who' ->> 'mode' = 'prev' THEN 'prev' ELSE 'assign' END;
    v_cands := '[]'::jsonb;
    IF jsonb_typeof(v_st -> 'who' -> 'cands') = 'array' THEN
      IF jsonb_array_length(v_st -> 'who' -> 'cands') > 20 THEN
        RAISE EXCEPTION 'Stage %: at most 20 candidates.', i + 1 USING ERRCODE = '22023';
      END IF;
      FOR v_x IN SELECT x FROM jsonb_array_elements_text(v_st -> 'who' -> 'cands') x LOOP
        -- A draft keeps somebody who has left the team (the builder shows it); a version runs only on the team.
        IF v_x !~ v_uuid OR (p_publish AND NOT (v_x::uuid = ANY (v_roster))) THEN
          RAISE EXCEPTION 'Stage %: a candidate is not on Marketing''s team.', i + 1 USING ERRCODE = '22023';
        END IF;
        IF NOT v_cands @> to_jsonb(ARRAY[lower(v_x)]) THEN
          v_cands := v_cands || to_jsonb(ARRAY[lower(v_x)]);
        END IF;
      END LOOP;
    END IF;
    IF p_publish AND p_locked THEN
      v_mode := 'assign';
    END IF;
    IF p_publish AND v_mode = 'prev' THEN
      IF i = 0 THEN
        RAISE EXCEPTION 'Stage 1: there is no stage before it to pick its person.' USING ERRCODE = '22023';
      END IF;
      IF jsonb_array_length(v_cands) = 0 THEN
        RAISE EXCEPTION 'Stage %: a 🔓 stage needs at least one candidate.', i + 1 USING ERRCODE = '22023';
      END IF;
    END IF;
    IF p_publish AND v_mode = 'assign' THEN
      v_cands := '[]'::jsonb;
    END IF;

    v_sla := CASE WHEN coalesce(v_st ->> 'sla', '') ~ '^[0-9]{1,3}$' THEN (v_st ->> 'sla')::integer END;
    IF v_sla IS NULL OR v_sla NOT BETWEEN 1 AND 30 THEN
      RAISE EXCEPTION 'Stage %: 1 to 30 working days.', i + 1 USING ERRCODE = '22023';
    END IF;

    -- Approval levels: a person on the team, the PIC through the link, or a person picked at assignment.
    v_appr := '[]'::jsonb;
    IF jsonb_typeof(v_st -> 'appr') = 'array' THEN
      IF jsonb_array_length(v_st -> 'appr') > 3 THEN
        RAISE EXCEPTION 'Stage %: at most 3 approval levels.', i + 1 USING ERRCODE = '22023';
      END IF;
      FOR v_a IN SELECT x FROM jsonb_array_elements(v_st -> 'appr') x LOOP
        IF v_a ->> 'kind' = 'assign' THEN
          v_appr := v_appr || jsonb_build_array(jsonb_build_object('kind', 'assign'));
        ELSIF v_a ->> 'kind' = 'pic' THEN
          IF v_appr @> jsonb_build_array(jsonb_build_object('kind', 'pic')) THEN
            RAISE EXCEPTION 'Stage %: the PIC approves it once.', i + 1 USING ERRCODE = '22023';
          END IF;
          v_appr := v_appr || jsonb_build_array(jsonb_build_object('kind', 'pic'));
        ELSIF v_a ->> 'kind' = 'person' AND coalesce(v_a ->> 'staff', '') ~ v_uuid
              AND (NOT p_publish OR (v_a ->> 'staff')::uuid = ANY (v_roster)) THEN
          IF v_appr @> jsonb_build_array(jsonb_build_object('kind', 'person', 'staff', lower(v_a ->> 'staff'))) THEN
            RAISE EXCEPTION 'Stage %: the same approver twice.', i + 1 USING ERRCODE = '22023';
          END IF;
          v_appr := v_appr || jsonb_build_array(jsonb_build_object('kind', 'person', 'staff', lower(v_a ->> 'staff')));
        ELSE
          RAISE EXCEPTION 'Stage %: an approval nobody on the team can give.', i + 1 USING ERRCODE = '22023';
        END IF;
      END LOOP;
    END IF;

    -- The fields it fills in: as a quick task's (mkt_task_create), and a table's preset rows.
    v_form := '[]'::jsonb;
    v_labels := '{}';
    IF jsonb_typeof(v_st -> 'form') = 'array' THEN
      IF jsonb_array_length(v_st -> 'form') > 20 THEN
        RAISE EXCEPTION 'Stage %: at most 20 fields.', i + 1 USING ERRCODE = '22023';
      END IF;
      FOR v_f IN SELECT x FROM jsonb_array_elements(v_st -> 'form') x LOOP
        IF NOT (coalesce(v_f ->> 'type', '') = ANY (v_types)) THEN
          RAISE EXCEPTION 'Stage %: a field of a kind it cannot hold.', i + 1 USING ERRCODE = '22023';
        END IF;
        v_label := btrim(coalesce(v_f ->> 'label', ''));
        IF length(v_label) > (CASE WHEN v_f ->> 'type' = 'Note' THEN 300 ELSE 60 END)
           OR (p_publish AND v_label = '') THEN
          RAISE EXCEPTION 'Stage %: name each field (a note at most 300 characters, a field 60).', i + 1 USING ERRCODE = '22023';
        END IF;
        -- A draft may hold two fields of one name while they are typed; a version may not.
        IF p_publish AND v_f ->> 'type' <> 'Note' THEN
          IF v_label = ANY (v_labels) THEN
            RAISE EXCEPTION 'Stage %: two fields called "%".', i + 1, v_label USING ERRCODE = '22023';
          END IF;
          v_labels := v_labels || v_label;
        END IF;
        IF v_f ->> 'type' = 'Table' THEN
          IF jsonb_typeof(v_f -> 'cols') IS DISTINCT FROM 'array' OR jsonb_array_length(v_f -> 'cols') NOT BETWEEN 1 AND 8 THEN
            RAISE EXCEPTION 'Stage %: a table has 1 to 8 columns.', i + 1 USING ERRCODE = '22023';
          END IF;
          v_cols := '[]'::jsonb;
          FOR j IN 0 .. jsonb_array_length(v_f -> 'cols') - 1 LOOP
            IF length(btrim(coalesce(v_f -> 'cols' -> j ->> 'name', ''))) NOT BETWEEN (CASE WHEN p_publish THEN 1 ELSE 0 END) AND 40
               OR coalesce(v_f -> 'cols' -> j ->> 'type', '') NOT IN ('Text', 'Number', 'Checkbox', 'Date', 'Person') THEN
              RAISE EXCEPTION 'Stage %: name each column of a table (at most 40 characters).', i + 1 USING ERRCODE = '22023';
            END IF;
            v_cols := v_cols || jsonb_build_array(jsonb_build_object('name', btrim(v_f -> 'cols' -> j ->> 'name'), 'type', v_f -> 'cols' -> j ->> 'type'));
          END LOOP;
          v_rows := '[]'::jsonb;
          IF jsonb_typeof(v_f -> 'rows') = 'array' THEN
            IF jsonb_array_length(v_f -> 'rows') > 50 THEN
              RAISE EXCEPTION 'Stage %: a table has at most 50 preset rows.', i + 1 USING ERRCODE = '22023';
            END IF;
            FOR v_row IN SELECT x FROM jsonb_array_elements(v_f -> 'rows') x LOOP
              IF jsonb_typeof(v_row) IS DISTINCT FROM 'array' OR jsonb_array_length(v_row) <> jsonb_array_length(v_cols)
                 OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_row) c WHERE jsonb_typeof(c) <> 'string' OR length(c #>> '{}') > 200) THEN
                RAISE EXCEPTION 'Stage %: a preset row is one short line per column.', i + 1 USING ERRCODE = '22023';
              END IF;
              v_rows := v_rows || jsonb_build_array(v_row);
            END LOOP;
          END IF;
          v_form := v_form || jsonb_build_array(jsonb_build_object('label', v_label, 'type', 'Table', 'cols', v_cols, 'rows', v_rows)
            || public.mkt_field_extras(v_f, 'Table', v_label, p_publish, format('Stage %s', i + 1), true));
        ELSE
          v_form := v_form || jsonb_build_array(jsonb_build_object('label', v_label, 'type', v_f ->> 'type')
            || public.mkt_field_extras(v_f, v_f ->> 'type', v_label, p_publish, format('Stage %s', i + 1), true));
        END IF;
      END LOOP;
    END IF;

    v_back := CASE WHEN jsonb_typeof(v_st -> 'back') = 'number' AND (v_st ->> 'back') ~ '^[0-9]{1,2}$'
                        AND (v_st ->> 'back')::integer < i THEN (v_st ->> 'back')::integer END;
    IF length(coalesce(v_st ->> 'picText', '')) > 120 THEN
      RAISE EXCEPTION 'Stage %: what the PIC sees — at most 120 characters.', i + 1 USING ERRCODE = '22023';
    END IF;
    v_split := coalesce(v_st ->> 'split', '') = 'true' AND NOT (p_publish AND p_locked);

    -- Its section on the canvas: 🎯, not locked, required, shown to the PIC — unless set.
    v_sec := CASE WHEN jsonb_typeof(v_st -> 'sec') = 'object' THEN v_st -> 'sec' ELSE '{}'::jsonb END;
    IF length(coalesce(v_sec ->> 'emoji', '')) > 16 THEN
      RAISE EXCEPTION 'Stage %: its section takes one emoji.', i + 1 USING ERRCODE = '22023';
    END IF;

    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'name', v_name, 'dept', v_st ->> 'dept', 'who', jsonb_build_object('mode', v_mode, 'cands', v_cands), 'sla', v_sla,
      'appr', v_appr, 'split', v_split, 'back', to_jsonb(v_back), 'picText', btrim(coalesce(v_st ->> 'picText', '')),
      'form', v_form,
      'sec', jsonb_build_object('emoji', coalesce(nullif(btrim(coalesce(v_sec ->> 'emoji', '')), ''), '🎯'),
        'locked', coalesce((v_sec -> 'locked') = 'true'::jsonb, false),
        'req', coalesce((v_sec -> 'req') <> 'false'::jsonb, true),
        'pic', coalesce((v_sec -> 'pic') <> 'false'::jsonb, true))));
  END LOOP;
  RETURN v_out;
END
$fn$;

REVOKE ALL ON FUNCTION public.mkt_workflow_check(jsonb, boolean, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_workflow_check(jsonb, boolean, boolean) TO service_role;

-- ── The builder's reader — with each template's canvas ──────────────────────
CREATE OR REPLACE FUNCTION public.mkt_workflows()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'The Workflow Builder is the manager''s.');
  RETURN jsonb_build_object('workflows', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'id', w.id, 'action', w.action, 'tname', w.tname, 'emoji', w.emoji, 'note', w.note, 'promise', w.promise,
             'locked', w.locked, 'draft', w.draft, 'canvas', w.canvas, 'rev', w.draft_rev, 'version', w.version,
             'changed', w.published_rev IS DISTINCT FROM w.draft_rev,
             'publishedAt', v.published_at, 'publishedBy', (SELECT u.name FROM public.users u WHERE u.id = v.published_by),
             'updatedAt', w.updated_at, 'updatedBy', (SELECT u.name FROM public.users u WHERE u.id = w.updated_by),
             'live', (SELECT count(*) FROM public.mkt_projects p
                       WHERE p.workflow_id = w.id AND p.status NOT IN ('done', 'cancelled')))
           ORDER BY lower(w.action), w.created_at, w.id)
      FROM public.mkt_workflows w
      LEFT JOIN public.mkt_workflow_versions v ON v.workflow_id = w.id AND v.version = w.version), '[]'::jsonb));
END
$fn$;

-- ── Saved as it is typed ────────────────────────────────────────────────────
-- p_id null: a new template — p_patch { action, tname, stages, emoji?, note?, promise?, locked?, canvas? }. Otherwise only
-- the parts given change: tname, emoji, note, promise (null clears it), locked, stages, canvas; p_rev is the draft the
-- caller last saw, and a draft saved by somebody since is not written over. The canvas follows the stages there are
-- (a stage's index out of range is dropped). Answers { id, rev }.
CREATE OR REPLACE FUNCTION public.mkt_workflow_save(p_id uuid, p_rev integer, p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_w       public.mkt_workflows;
  v_patch   jsonb := coalesce(p_patch, '{}'::jsonb);
  v_action  text;
  v_tname   text;
  v_emoji   text;
  v_note    text;
  v_promise integer;
  v_locked  boolean;
  v_stages  jsonb;
  v_canvas  jsonb;
  v_by      text;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'The Workflow Builder is the manager''s.');
  IF jsonb_typeof(v_patch) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Nothing to save.' USING ERRCODE = '22023';
  END IF;
  IF p_id IS NOT NULL THEN
    SELECT * INTO v_w FROM public.mkt_workflows WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'That template is not there any more.' USING ERRCODE = 'P0002';
    END IF;
    IF p_rev IS DISTINCT FROM v_w.draft_rev THEN
      v_by := coalesce((SELECT u.name FROM public.users u WHERE u.id = v_w.updated_by), 'Somebody');
      RAISE EXCEPTION '% changed this template since you opened it — reload to see it.', v_by USING ERRCODE = '40001';
    END IF;
  END IF;

  v_action := CASE WHEN p_id IS NULL THEN btrim(coalesce(v_patch ->> 'action', '')) ELSE v_w.action END;
  v_tname := CASE WHEN v_patch ? 'tname' OR p_id IS NULL THEN btrim(coalesce(v_patch ->> 'tname', '')) ELSE v_w.tname END;
  IF length(v_action) NOT BETWEEN 1 AND 60 OR length(v_tname) NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'Name the action and the template (at most 60 characters each).' USING ERRCODE = '22023';
  END IF;
  v_emoji := CASE WHEN v_patch ? 'emoji' OR p_id IS NULL
                  THEN coalesce(nullif(btrim(coalesce(v_patch ->> 'emoji', '')), ''), '✨') ELSE v_w.emoji END;
  IF length(v_emoji) > 16 THEN
    RAISE EXCEPTION 'One emoji.' USING ERRCODE = '22023';
  END IF;
  v_note := CASE WHEN v_patch ? 'note' OR p_id IS NULL THEN nullif(btrim(coalesce(v_patch ->> 'note', '')), '') ELSE v_w.note END;
  IF length(v_note) > 120 THEN
    RAISE EXCEPTION 'A note of at most 120 characters.' USING ERRCODE = '22023';
  END IF;
  IF v_patch ? 'promise' OR p_id IS NULL THEN
    IF jsonb_typeof(v_patch -> 'promise') = 'number' AND (v_patch ->> 'promise') ~ '^[0-9]{1,3}$'
       AND (v_patch ->> 'promise')::integer BETWEEN 1 AND 365 THEN
      v_promise := (v_patch ->> 'promise')::integer;
    ELSIF coalesce(jsonb_typeof(v_patch -> 'promise'), 'null') = 'null' THEN
      v_promise := NULL;
    ELSE
      RAISE EXCEPTION 'A promise of 1 to 365 working days.' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_promise := v_w.promise;
  END IF;
  IF (v_patch ? 'locked' OR p_id IS NULL) AND coalesce(jsonb_typeof(v_patch -> 'locked'), 'boolean') <> 'boolean' THEN
    RAISE EXCEPTION 'Locked or not.' USING ERRCODE = '22023';
  END IF;
  v_locked := CASE WHEN v_patch ? 'locked' OR p_id IS NULL THEN coalesce((v_patch ->> 'locked')::boolean, false) ELSE v_w.locked END;
  IF v_patch ? 'stages' OR p_id IS NULL THEN
    v_stages := public.mkt_workflow_check(coalesce(v_patch -> 'stages', '[]'::jsonb), false, v_locked);
  ELSE
    v_stages := v_w.draft;
  END IF;
  v_canvas := public.mkt_canvas_check(CASE WHEN v_patch ? 'canvas' OR p_id IS NULL THEN v_patch -> 'canvas' ELSE v_w.canvas END,
                                      jsonb_array_length(v_stages), false);

  IF EXISTS (SELECT 1 FROM public.mkt_workflows w
              WHERE lower(w.action) = lower(v_action) AND lower(w.tname) = lower(v_tname) AND w.id IS DISTINCT FROM p_id) THEN
    RAISE EXCEPTION '"% · %" is there already.', v_action, v_tname USING ERRCODE = '23505';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.mkt_workflows (action, tname, emoji, note, promise, locked, draft, canvas, created_by, updated_by)
    VALUES (v_action, v_tname, v_emoji, v_note, v_promise, v_locked, v_stages, v_canvas, auth.uid(), auth.uid())
    RETURNING * INTO v_w;
  ELSE
    UPDATE public.mkt_workflows
       SET tname = v_tname, emoji = v_emoji, note = v_note, promise = v_promise, locked = v_locked, draft = v_stages,
           canvas = v_canvas, draft_rev = draft_rev + 1, updated_by = auth.uid(), updated_at = now()
     WHERE id = p_id
    RETURNING * INTO v_w;
  END IF;
  PERFORM public.mkt_top_up_due();
  RETURN jsonb_build_object('id', v_w.id, 'rev', v_w.draft_rev);
END
$fn$;

-- ── Published: the draft as the caller saw it, checked whole, is the next version — its canvas with it ──
CREATE OR REPLACE FUNCTION public.mkt_workflow_publish(p_id uuid, p_rev integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_w      public.mkt_workflows;
  v_stages jsonb;
  v_canvas jsonb;
  v_by     text;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'The Workflow Builder is the manager''s.');
  SELECT * INTO v_w FROM public.mkt_workflows WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That template is not there any more.' USING ERRCODE = 'P0002';
  END IF;
  IF p_rev IS DISTINCT FROM v_w.draft_rev THEN
    v_by := coalesce((SELECT u.name FROM public.users u WHERE u.id = v_w.updated_by), 'Somebody');
    RAISE EXCEPTION '% changed this template since you opened it — reload to see it.', v_by USING ERRCODE = '40001';
  END IF;
  IF v_w.published_rev = v_w.draft_rev THEN
    RAISE EXCEPTION 'Nothing has changed since v%.', v_w.version USING ERRCODE = '22023';
  END IF;
  v_stages := public.mkt_workflow_check(v_w.draft, true, v_w.locked);
  v_canvas := public.mkt_canvas_check(v_w.canvas, jsonb_array_length(v_stages), true);
  INSERT INTO public.mkt_workflow_versions (workflow_id, version, stages, canvas, locked, promise, published_by)
  VALUES (v_w.id, v_w.version + 1, v_stages, v_canvas, v_w.locked, v_w.promise, auth.uid());
  UPDATE public.mkt_workflows
     SET version = v_w.version + 1, published_rev = v_w.draft_rev, updated_by = auth.uid(), updated_at = now()
   WHERE id = v_w.id;
  PERFORM public.mkt_top_up_due();
  RETURN jsonb_build_object('id', v_w.id, 'version', v_w.version + 1, 'rev', v_w.draft_rev,
    'live', (SELECT count(*) FROM public.mkt_projects p WHERE p.workflow_id = v_w.id AND p.status NOT IN ('done', 'cancelled')));
END
$fn$;

-- ── Cloned: a new template of the same action, from this one's draft — its canvas too ──
CREATE OR REPLACE FUNCTION public.mkt_workflow_clone(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_w     public.mkt_workflows;
  v_tname text;
  n       integer := 1;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'The Workflow Builder is the manager''s.');
  SELECT * INTO v_w FROM public.mkt_workflows WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That template is not there any more.' USING ERRCODE = 'P0002';
  END IF;
  v_tname := left(v_w.tname, 55) || ' copy';
  WHILE EXISTS (SELECT 1 FROM public.mkt_workflows w WHERE lower(w.action) = lower(v_w.action) AND lower(w.tname) = lower(v_tname)) LOOP
    n := n + 1;
    v_tname := left(v_w.tname, 52) || ' copy ' || n;
  END LOOP;
  RETURN public.mkt_workflow_save(NULL, NULL, jsonb_build_object('action', v_w.action, 'tname', v_tname, 'emoji', v_w.emoji,
    'note', v_w.note, 'promise', v_w.promise, 'locked', v_w.locked, 'stages', v_w.draft, 'canvas', v_w.canvas))
    || jsonb_build_object('tname', v_tname);
END
$fn$;

REVOKE ALL ON FUNCTION public.mkt_workflows() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_workflow_save(uuid, integer, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_workflow_publish(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_workflow_clone(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_workflows() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_workflow_save(uuid, integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_workflow_publish(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_workflow_clone(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
