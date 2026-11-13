-- ============================================================================
-- 20261113200000_marketing_wf_builder_v2.sql
-- The Workflow Builder 2a (2026-11-13 — `docs/design_handoff_workflow_builder/`, the user's decisions in the build
-- contract): the template side.
-- ============================================================================
--
--   Groups       mkt_groups — Marketing's own groups (Content 295, Social Media 235, Design 350, Ads 270, Brand 195 —
--                oklch hues), "+ New group" takes the next hue of [60, 150, 20, 110, 320, 250]. A template stage's
--                `dept` is a group key ('' = none). Replaces "a group is a People title" for templates.
--   Categories   mkt_workflow_categories — what the picker calls a category (the old "action"): a name (unique,
--                whatever the case) and an emoji. mkt_workflows.category_id; `action` and `emoji` stay, kept equal
--                to the category's (renaming a category renames it on every template; products read `action`).
--   A stage      { sid (stable key, [a-z0-9]{6,40}), name, dept (a group key), who {mode, cands}, sla 1–30,
--                  appr [{ids: [staff uuid | 'pic' | 'assign'], rule: 'any' | 'all'}] (≤ 3 levels; a person on one
--                  level only; 'pic' once a stage), split, back, picText } — no `form`, no `sec`: fields live in the
--                canvas, each naming the stage that fills it in by its sid.
--   Canvas       { req {pic}, sections [{ id, emoji, title, stage: sid | null, locked, req, pic,
--                  fields [{ id, label, type, stage: sid | null, req, pic, cal?, opts?, list?,
--                            cols? [{ id, name, type, stage, req, pic }], rows? }] }] }
--   Template     + overdue (when a stage is late — workflow-wide) and finish (when the task is done: notify,
--                after, picText, celebration, gifPath) on mkt_workflows and mkt_workflow_versions.
--   Approvers    a published stage's approvers are Marketing's managers (a title holding MARKETING MANAGER — MM, AMM)
--                or a title holding DIRECTOR, on the roster (the user allowed a Director — decision 7).
--   GIF          a celebration GIF / WebP / APNG / PNG (≤ 4 MB) goes to the bucket `marketing` under `workflow/`
--                (an INSERT policy: Marketing · Manage); read as the rest of the bucket.
--
-- Production's two drafts (2026-11-13: both never published, 0 versions, 0 projects on a workflow) are moved to the
-- new shapes below: each action a category, every stage a sid, each old level a level of its own, the People title
-- in `dept` a group by its words (groupTone's words; none → Design), each stage's fields and its section settings a
-- canvas section of that stage (the canvas's own sections' stage index → that stage's sid).
--
-- Rewritten from PRODUCTION's bodies (pg_get_functiondef, 2026-11-13; md5(prosrc)):
--   mkt_workflows        32e67870e7a7d4cd7a383ebd2897d87f  + categories, groups, categoryId, overdue, finish, the
--                                                           published stages and promise (the publish review's diff)
--   mkt_workflow_save    927fba2422e9cc96001e91635417e076  + category, overdue, finish; the new stage and canvas checks
--   mkt_workflow_check   89771fedf6a6cb3b96f177ce2ca73b3b  the new stage shape (see above)
--   mkt_canvas_check     ce567458c911529e131d67440aef5c88  (jsonb, integer, boolean) → (jsonb, text[], boolean): stages
--                                                           by sid; every field and table column names a real sid
--   mkt_canvas_stage     e0b66831899f462053ffaabdfce7d18c  dropped (an index; mkt_canvas_sid takes its place)
--   mkt_workflow_publish 559d3fa04bbc5f20697d5576b20a1e3b  + snapshots overdue and finish; the canvas by sid
--   mkt_workflow_clone   c04f79dcad97478b4776a69ee6ba2d4a  + category, overdue, finish
--   mkt_workflow_delete  52307e5bcc72983d6df0f838e1eabcff  unchanged (a template once published stays — answer 8)
--   mkt_field_extras     f9dd9a976d85b4f86fa07f41bee58db2  unchanged, called as before
--   mkt_products         deb02f05da5054459d315777baf4e2df  one expression swapped in place (pg_get_functiondef + replace, refused
--                                                           unless found exactly once): the PIC count reads {ids} levels too
-- New (SECURITY DEFINER, Marketing · Manage): mkt_wf_category_add / _rename / _icon / _delete, mkt_workflow_rename,
-- mkt_group_add. Helpers only these call: mkt_canvas_sid, mkt_wf_overdue, mkt_wf_finish, mkt_wf_stage_sections.
-- PGlite: tests/member-sql/validate-marketing-wf-builder-v2.mjs.

-- ── Groups ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mkt_groups (
  key        text PRIMARY KEY CHECK (key ~ '^[a-z0-9_]{1,24}$'),
  name       text NOT NULL CHECK (name = btrim(name) AND length(name) BETWEEN 1 AND 40),
  hue        integer NOT NULL CHECK (hue BETWEEN 0 AND 359),
  sort       integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS mkt_groups_name ON public.mkt_groups (lower(name));
ALTER TABLE public.mkt_groups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mkt_groups FROM anon, authenticated;
SELECT public.audit_register('mkt_groups', 'Marketing groups', 'Marketing', '{}', 'none',
  p_reason => 'Marketing''s own groups — a name and a colour; a group added is the only change, never edited or removed');
INSERT INTO public.mkt_groups (key, name, hue, sort) VALUES
  ('content', 'Content', 295, 1), ('social', 'Social Media', 235, 2), ('design', 'Design', 350, 3),
  ('ads', 'Ads', 270, 4), ('brand', 'Brand', 195, 5)
ON CONFLICT (key) DO NOTHING;

-- ── Categories ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mkt_workflow_categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL CHECK (name = btrim(name) AND length(name) BETWEEN 1 AND 60),
  emoji      text NOT NULL DEFAULT '✨' CHECK (length(emoji) BETWEEN 1 AND 16),
  sort       integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS mkt_workflow_categories_name ON public.mkt_workflow_categories (lower(name));
ALTER TABLE public.mkt_workflow_categories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mkt_workflow_categories FROM anon, authenticated;
SELECT public.audit_register('mkt_workflow_categories', 'Marketing workflow categories', 'Marketing', '{}', 'none',
  p_reason => 'How the Workflow Builder''s picker groups templates — a name and an emoji; each template keeps its own versions');

ALTER TABLE public.mkt_workflows ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.mkt_workflow_categories(id);
ALTER TABLE public.mkt_workflows ADD COLUMN IF NOT EXISTS overdue jsonb NOT NULL
  DEFAULT '{"days": 1, "notify": ["doer", "mm"], "action": "remind", "repeat": true}'::jsonb;
ALTER TABLE public.mkt_workflows ADD COLUMN IF NOT EXISTS finish jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.mkt_workflow_versions ADD COLUMN IF NOT EXISTS overdue jsonb NOT NULL
  DEFAULT '{"days": 1, "notify": ["doer", "mm"], "action": "remind", "repeat": true}'::jsonb;
ALTER TABLE public.mkt_workflow_versions ADD COLUMN IF NOT EXISTS finish jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS mkt_workflows_category ON public.mkt_workflows (category_id);

-- ── Helpers (only the functions below call them) ─────────────────────────────

-- A canvas's stage: a sid the template has, else null.
CREATE OR REPLACE FUNCTION public.mkt_canvas_sid(p_v jsonb, p_sids text[])
RETURNS text
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $fn$
BEGIN
  IF jsonb_typeof(p_v) IS DISTINCT FROM 'string' OR NOT ((p_v #>> '{}') = ANY (coalesce(p_sids, '{}'))) THEN
    RETURN NULL;
  END IF;
  RETURN p_v #>> '{}';
END
$fn$;

-- When a stage is late (workflow-wide): late by 1–10 working days, who is told, remind or ask to reassign, daily.
CREATE OR REPLACE FUNCTION public.mkt_wf_overdue(p_v jsonb)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $fn$
DECLARE
  v_o    jsonb := CASE WHEN jsonb_typeof(p_v) = 'object' THEN p_v ELSE '{}'::jsonb END;
  v_days integer := 1;
BEGIN
  IF v_o ? 'days' THEN
    IF jsonb_typeof(v_o -> 'days') IS DISTINCT FROM 'number' OR (v_o ->> 'days') !~ '^[0-9]{1,2}$'
       OR (v_o ->> 'days')::integer NOT BETWEEN 1 AND 10 THEN
      RAISE EXCEPTION 'Late by 1 to 10 working days.' USING ERRCODE = '22023';
    END IF;
    v_days := (v_o ->> 'days')::integer;
  END IF;
  IF v_o ? 'notify' AND jsonb_typeof(v_o -> 'notify') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Not a list of people to tell.' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object(
    'days', v_days,
    'notify', CASE WHEN v_o ? 'notify'
                   THEN coalesce((SELECT jsonb_agg(k ORDER BY o) FROM unnest(ARRAY['doer', 'mm', 'director', 'next']) WITH ORDINALITY u(k, o)
                                   WHERE v_o -> 'notify' ? k), '[]'::jsonb)
                   ELSE '["doer", "mm"]'::jsonb END,
    'action', CASE WHEN v_o ->> 'action' = 'reassign' THEN 'reassign' ELSE 'remind' END,
    'repeat', coalesce((v_o -> 'repeat') <> 'false'::jsonb, true));
END
$fn$;

-- When the task is done: who is told, close or keep open for the PIC's feedback, what the PIC reads, the
-- celebration, an uploaded GIF (`workflow/<uuid>/<name>` in `marketing` — one the caller has just sent, or the one
-- the template already shows).
CREATE OR REPLACE FUNCTION public.mkt_wf_finish(p_v jsonb, p_category text, p_was text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_f     jsonb := CASE WHEN jsonb_typeof(p_v) = 'object' THEN p_v ELSE '{}'::jsonb END;
  v_gif   text := nullif(btrim(coalesce(v_f ->> 'gifPath', '')), '');
  v_celeb text := coalesce(v_f ->> 'celebration', 'fireworks');
  v_pic   text;
  v_meta  jsonb;
BEGIN
  IF v_f ? 'notify' AND jsonb_typeof(v_f -> 'notify') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Not a list of people to tell.' USING ERRCODE = '22023';
  END IF;
  v_pic := CASE WHEN v_f ? 'picText' THEN btrim(coalesce(v_f ->> 'picText', ''))
                ELSE 'Your ' || lower(coalesce(p_category, 'task')) || ' is ready' END;
  IF length(v_pic) > 120 THEN
    RAISE EXCEPTION 'What the PIC sees when it is done — at most 120 characters.' USING ERRCODE = '22023';
  END IF;
  IF NOT (v_celeb = ANY (ARRAY['fireworks', 'cheers', 'movie', 'confetti', 'custom'])) THEN
    RAISE EXCEPTION 'Pick a celebration.' USING ERRCODE = '22023';
  END IF;
  -- A GIF another template already shows (a clone's) is kept as it is.
  IF v_gif IS NOT NULL AND v_gif IS DISTINCT FROM p_was
     AND NOT EXISTS (SELECT 1 FROM public.mkt_workflows w WHERE w.finish ->> 'gifPath' = v_gif) THEN
    IF v_gif !~ '^workflow/[0-9a-f-]{36}/[^/]+$' THEN
      RAISE EXCEPTION 'That GIF has not arrived — upload it again.' USING ERRCODE = 'P0002';
    END IF;
    SELECT o.metadata INTO v_meta FROM public.file_objects o
     WHERE o.bucket_id = 'marketing' AND o.name = v_gif AND o.owner_id = auth.uid()::text;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'That GIF has not arrived — upload it again.' USING ERRCODE = 'P0002';
    END IF;
    IF NOT (lower(coalesce(v_meta ->> 'mimetype', '')) = ANY (ARRAY['image/gif', 'image/webp', 'image/apng', 'image/png']))
       OR coalesce(v_meta ->> 'size', '') !~ '^[0-9]{1,15}$' OR (v_meta ->> 'size')::bigint > 4000000 THEN
      RAISE EXCEPTION 'A GIF, WebP or APNG under 4 MB.' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF v_celeb = 'custom' AND v_gif IS NULL THEN
    v_celeb := 'fireworks';
  END IF;
  RETURN jsonb_build_object(
    'notify', CASE WHEN v_f ? 'notify'
                   THEN coalesce((SELECT jsonb_agg(k ORDER BY o) FROM unnest(ARRAY['all', 'mm', 'pic', 'req']) WITH ORDINALITY u(k, o)
                                   WHERE v_f -> 'notify' ? k), '[]'::jsonb)
                   ELSE '["all"]'::jsonb END,
    'after', CASE WHEN v_f ->> 'after' = 'feedback' THEN 'feedback' ELSE 'close' END,
    'picText', v_pic,
    'celebration', v_celeb,
    'gifPath', to_jsonb(v_gif));
END
$fn$;

-- A canvas section per stage (🎯, titled by the stage, required, shown to the PIC) — a new template's canvas.
CREATE OR REPLACE FUNCTION public.mkt_wf_stage_sections(p_stages jsonb)
RETURNS jsonb
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $fn$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', 'x' || (s ->> 'sid'), 'emoji', '🎯', 'title', left(coalesce(s ->> 'name', ''), 60),
           'stage', s ->> 'sid', 'locked', false, 'req', true, 'pic', true, 'fields', '[]'::jsonb) ORDER BY i), '[]'::jsonb)
    FROM jsonb_array_elements(coalesce(p_stages, '[]'::jsonb)) WITH ORDINALITY x(s, i)
$fn$;

-- ── A template's stages, checked ─────────────────────────────────────────────
-- Production's body; the stage is the new shape: a sid, a group key, levels of {ids, rule}; no form, no section.
CREATE OR REPLACE FUNCTION public.mkt_workflow_check(p_stages jsonb, p_publish boolean, p_locked boolean)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uuid   text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_roster uuid[] := ARRAY(SELECT r.staff_id FROM public.mkt_roster() r);
  -- Who may approve a version: Marketing's managers (MM, AMM) and a Director, on the roster (decision 7).
  v_apprs  uuid[] := ARRAY(SELECT r.staff_id FROM public.mkt_roster() r
                            WHERE upper(coalesce(r.title, '')) LIKE '%MARKETING MANAGER%' OR upper(coalesce(r.title, '')) LIKE '%DIRECTOR%');
  v_groups text[] := ARRAY(SELECT g.key FROM public.mkt_groups g);
  v_n      integer := CASE WHEN jsonb_typeof(p_stages) = 'array' THEN jsonb_array_length(p_stages) ELSE -1 END;
  v_out    jsonb := '[]'::jsonb;
  v_sids   text[] := '{}';
  v_st     jsonb;
  v_sid    text;
  v_name   text;
  v_dept   text;
  v_mode   text;
  v_cands  jsonb;
  v_sla    integer;
  v_appr   jsonb;
  v_a      jsonb;
  v_ids    text[];
  v_raw    text[];
  v_used   text[];
  v_rule   text;
  v_pic    boolean;
  v_back   integer;
  v_x      text;
  v_split  boolean;
  i        integer;
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
    -- Its key: kept as sent; a stage sent without one gets one.
    v_sid := coalesce(v_st ->> 'sid', '');
    IF v_sid = '' THEN
      v_sid := 's' || left(md5(random()::text || clock_timestamp()::text || i::text), 12);
    ELSIF v_sid !~ '^[a-z0-9]{6,40}$' THEN
      RAISE EXCEPTION 'Stage %: not a stage''s key.', i + 1 USING ERRCODE = '22023';
    END IF;
    IF v_sid = ANY (v_sids) THEN
      RAISE EXCEPTION 'Stage %: two stages with the same key.', i + 1 USING ERRCODE = '22023';
    END IF;
    v_sids := v_sids || v_sid;

    v_name := btrim(coalesce(v_st ->> 'name', ''));
    IF length(v_name) > 80 THEN
      RAISE EXCEPTION 'Stage %: a name of at most 80 characters.', i + 1 USING ERRCODE = '22023';
    END IF;
    IF p_publish AND v_name = '' THEN
      RAISE EXCEPTION 'Stage %: give it a name.', i + 1 USING ERRCODE = '22023';
    END IF;
    v_dept := btrim(coalesce(v_st ->> 'dept', ''));
    IF v_dept <> '' AND NOT (v_dept = ANY (v_groups)) THEN
      RAISE EXCEPTION 'Stage %: pick its group from the list.', i + 1 USING ERRCODE = '22023';
    END IF;

    -- Who: MM assigns, or 🔓 the stage before hands it to one of a shortlist.
    v_mode := CASE WHEN v_st -> 'who' ->> 'mode' = 'prev' THEN 'prev' ELSE 'assign' END;
    v_cands := '[]'::jsonb;
    IF jsonb_typeof(v_st -> 'who' -> 'cands') = 'array' THEN
      IF jsonb_array_length(v_st -> 'who' -> 'cands') > 20 THEN
        RAISE EXCEPTION 'Stage %: at most 20 people on the shortlist.', i + 1 USING ERRCODE = '22023';
      END IF;
      FOR v_x IN SELECT x FROM jsonb_array_elements_text(v_st -> 'who' -> 'cands') x LOOP
        -- A draft keeps somebody who has left the team (the builder shows it); a version runs only on the team.
        IF v_x !~ v_uuid OR (p_publish AND NOT (v_x::uuid = ANY (v_roster))) THEN
          RAISE EXCEPTION 'Stage %: somebody on the shortlist is not on Marketing''s team.', i + 1 USING ERRCODE = '22023';
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
        RAISE EXCEPTION 'Stage 1: there is no stage before it to hand it over.' USING ERRCODE = '22023';
      END IF;
      IF jsonb_array_length(v_cands) = 0 THEN
        RAISE EXCEPTION 'Stage %: a 🔓 handoff needs somebody on its shortlist.', i + 1 USING ERRCODE = '22023';
      END IF;
    END IF;
    IF p_publish AND v_mode = 'assign' THEN
      v_cands := '[]'::jsonb;
    END IF;

    v_sla := CASE WHEN coalesce(v_st ->> 'sla', '') ~ '^[0-9]{1,3}$' THEN (v_st ->> 'sla')::integer END;
    IF v_sla IS NULL OR v_sla NOT BETWEEN 1 AND 30 THEN
      RAISE EXCEPTION 'Stage %: 1 to 30 working days.', i + 1 USING ERRCODE = '22023';
    END IF;

    -- Approval: up to three levels in turn, each one or more people (any one of them, or everyone).
    v_appr := '[]'::jsonb;
    v_used := '{}';
    v_pic := false;
    IF jsonb_typeof(v_st -> 'appr') = 'array' THEN
      IF jsonb_array_length(v_st -> 'appr') > 3 THEN
        RAISE EXCEPTION 'Stage %: at most 3 approval levels.', i + 1 USING ERRCODE = '22023';
      END IF;
      FOR v_a IN SELECT x FROM jsonb_array_elements(v_st -> 'appr') x LOOP
        -- An older level (one person, the PIC, or picked at assignment) reads as a level of one.
        IF jsonb_typeof(v_a -> 'ids') = 'array' THEN
          v_raw := ARRAY(SELECT x FROM jsonb_array_elements_text(v_a -> 'ids') x);
          v_rule := CASE WHEN v_a ->> 'rule' = 'all' THEN 'all' ELSE 'any' END;
        ELSIF v_a ->> 'kind' = 'person' THEN
          v_raw := ARRAY[coalesce(v_a ->> 'staff', '')];
          v_rule := 'any';
        ELSIF v_a ->> 'kind' IN ('pic', 'assign') THEN
          v_raw := ARRAY[v_a ->> 'kind'];
          v_rule := 'any';
        ELSE
          RAISE EXCEPTION 'Stage %: an approval level it cannot hold.', i + 1 USING ERRCODE = '22023';
        END IF;
        IF cardinality(v_raw) > 10 THEN
          RAISE EXCEPTION 'Stage %: at most 10 approvers on a level.', i + 1 USING ERRCODE = '22023';
        END IF;
        v_ids := '{}';
        FOREACH v_x IN ARRAY v_raw LOOP
          IF v_x IN ('pic', 'assign') THEN
            NULL;
          ELSIF v_x ~ v_uuid THEN
            v_x := lower(v_x);
            IF p_publish AND NOT (v_x::uuid = ANY (v_apprs)) THEN
              RAISE EXCEPTION 'Stage %: an approver who is not a Marketing manager or a Director on the team.', i + 1 USING ERRCODE = '22023';
            END IF;
          ELSE
            RAISE EXCEPTION 'Stage %: an approval nobody on the team can give.', i + 1 USING ERRCODE = '22023';
          END IF;
          CONTINUE WHEN v_x = ANY (v_ids);
          IF v_x = 'pic' THEN
            IF v_pic THEN
              RAISE EXCEPTION 'Stage %: the PIC approves it once.', i + 1 USING ERRCODE = '22023';
            END IF;
            v_pic := true;
          ELSIF v_x <> 'assign' THEN
            IF v_x = ANY (v_used) THEN
              RAISE EXCEPTION 'Stage %: somebody approves on two levels.', i + 1 USING ERRCODE = '22023';
            END IF;
            v_used := v_used || v_x;
          END IF;
          v_ids := v_ids || v_x;
        END LOOP;
        IF p_publish AND cardinality(v_ids) = 0 THEN
          RAISE EXCEPTION 'Stage %: choose who approves each level.', i + 1 USING ERRCODE = '22023';
        END IF;
        v_appr := v_appr || jsonb_build_array(jsonb_build_object('ids', to_jsonb(v_ids), 'rule', v_rule));
      END LOOP;
    END IF;

    v_back := CASE WHEN jsonb_typeof(v_st -> 'back') = 'number' AND (v_st ->> 'back') ~ '^[0-9]{1,2}$'
                        AND (v_st ->> 'back')::integer < i THEN (v_st ->> 'back')::integer END;
    IF length(coalesce(v_st ->> 'picText', '')) > 120 THEN
      RAISE EXCEPTION 'Stage %: what the PIC sees — at most 120 characters.', i + 1 USING ERRCODE = '22023';
    END IF;
    v_split := coalesce(v_st ->> 'split', '') = 'true' AND NOT (p_publish AND p_locked);

    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'sid', v_sid, 'name', v_name, 'dept', v_dept,
      'who', jsonb_build_object('mode', v_mode, 'cands', v_cands), 'sla', v_sla,
      'appr', v_appr, 'split', v_split, 'back', to_jsonb(v_back), 'picText', btrim(coalesce(v_st ->> 'picText', ''))));
  END LOOP;
  RETURN v_out;
END
$fn$;
REVOKE ALL ON FUNCTION public.mkt_workflow_check(jsonb, boolean, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_workflow_check(jsonb, boolean, boolean) TO service_role;

-- ── A template's canvas, checked ─────────────────────────────────────────────
-- Production's body; every section, field and table column names its stage by sid (a sid the template no longer has
-- reads as none — a version refuses a field or column with none).
DROP FUNCTION IF EXISTS public.mkt_canvas_check(jsonb, integer, boolean);
DROP FUNCTION IF EXISTS public.mkt_canvas_stage(jsonb, integer);
CREATE OR REPLACE FUNCTION public.mkt_canvas_check(p_canvas jsonb, p_sids text[], p_publish boolean)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SET search_path = public
AS $fn$
DECLARE
  v_c      jsonb := CASE WHEN jsonb_typeof(p_canvas) = 'object' THEN p_canvas ELSE '{}'::jsonb END;
  v_types  text[] := ARRAY['Text', 'Number', 'Select', 'Multi-select', 'Date', 'Person', 'File', 'Checkbox', 'Table', 'Note'];
  v_ctypes text[] := ARRAY['Text', 'Number', 'Checkbox', 'Date', 'Person'];
  v_secs   jsonb := '[]'::jsonb;
  v_ids    text[] := '{}';
  v_s      jsonb;
  v_f      jsonb;
  v_col    jsonb;
  v_row    jsonb;
  v_fields jsonb;
  v_cols   jsonb;
  v_rows   jsonb;
  v_title  text;
  v_emoji  text;
  v_label  text;
  v_labels text[];
  v_where  text;
  v_id     text;
  v_sec_id text;
  v_type   text;
  v_stage  text;
  v_out    jsonb;
  i        integer := 0;
  k        integer;
BEGIN
  IF v_c ? 'sections' AND jsonb_typeof(v_c -> 'sections') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Not a list of sections.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(coalesce(v_c -> 'sections', '[]'::jsonb)) > 40 THEN
    RAISE EXCEPTION 'A canvas has at most 40 sections.' USING ERRCODE = '22023';
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
    -- An id the page keeps (a running task's values are kept by the field's id); one missing or sent twice: a new one.
    v_id := coalesce(v_s ->> 'id', '');
    IF v_id !~ '^[a-z0-9]{1,40}$' OR v_id = ANY (v_ids) THEN
      v_id := 'c' || left(md5(random()::text || clock_timestamp()::text || i::text), 12);
    END IF;
    v_ids := v_ids || v_id;
    v_sec_id := v_id;

    v_fields := '[]'::jsonb;
    v_labels := '{}';
    IF v_s ? 'fields' AND jsonb_typeof(v_s -> 'fields') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION '%: not a list of fields.', v_where USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(coalesce(v_s -> 'fields', '[]'::jsonb)) > 20 THEN
      RAISE EXCEPTION '%: at most 20 fields.', v_where USING ERRCODE = '22023';
    END IF;
    FOR v_f IN SELECT x FROM jsonb_array_elements(coalesce(v_s -> 'fields', '[]'::jsonb)) x LOOP
      v_type := coalesce(v_f ->> 'type', '');
      IF jsonb_typeof(v_f) IS DISTINCT FROM 'object' OR NOT (v_type = ANY (v_types)) THEN
        RAISE EXCEPTION '%: a field of a kind it cannot hold.', v_where USING ERRCODE = '22023';
      END IF;
      v_label := btrim(coalesce(v_f ->> 'label', ''));
      IF length(v_label) > (CASE WHEN v_type = 'Note' THEN 300 ELSE 60 END) OR (p_publish AND v_label = '') THEN
        RAISE EXCEPTION '%: name each field (a note at most 300 characters, a field 60).', v_where USING ERRCODE = '22023';
      END IF;
      IF p_publish AND v_type <> 'Note' THEN
        IF v_label = ANY (v_labels) THEN
          RAISE EXCEPTION '%: two fields called "%".', v_where, v_label USING ERRCODE = '22023';
        END IF;
        v_labels := v_labels || v_label;
      END IF;
      v_id := coalesce(v_f ->> 'id', '');
      IF v_id !~ '^[a-z0-9]{1,40}$' OR v_id = ANY (v_ids) THEN
        v_id := 'f' || left(md5(random()::text || clock_timestamp()::text || v_label), 12);
      END IF;
      v_ids := v_ids || v_id;
      v_stage := public.mkt_canvas_sid(v_f -> 'stage', p_sids);
      IF p_publish AND v_stage IS NULL THEN
        RAISE EXCEPTION '%: "%" — pick the stage that fills it in.', v_where, v_label USING ERRCODE = '22023';
      END IF;
      v_out := jsonb_build_object('id', v_id, 'label', v_label, 'type', v_type, 'stage', to_jsonb(v_stage))
        || public.mkt_field_extras(v_f, v_type, v_label, p_publish, v_where, false);

      -- A table: its columns, each filled in at its own stage, ⭐ and 👁 of its own; its preset rows.
      IF v_type = 'Table' THEN
        IF jsonb_typeof(v_f -> 'cols') IS DISTINCT FROM 'array' OR jsonb_array_length(v_f -> 'cols') NOT BETWEEN 1 AND 12 THEN
          RAISE EXCEPTION '%: "%" — a table has 1 to 12 columns.', v_where, v_label USING ERRCODE = '22023';
        END IF;
        v_cols := '[]'::jsonb;
        k := 0;
        FOR v_col IN SELECT x FROM jsonb_array_elements(v_f -> 'cols') x LOOP
          k := k + 1;
          IF jsonb_typeof(v_col) IS DISTINCT FROM 'object'
             OR length(btrim(coalesce(v_col ->> 'name', ''))) NOT BETWEEN (CASE WHEN p_publish THEN 1 ELSE 0 END) AND 40
             OR NOT (coalesce(v_col ->> 'type', '') = ANY (v_ctypes)) THEN
            RAISE EXCEPTION '%: "%" — name each column (at most 40 characters).', v_where, v_label USING ERRCODE = '22023';
          END IF;
          v_id := coalesce(v_col ->> 'id', '');
          IF v_id !~ '^[a-z0-9]{1,40}$' OR v_id = ANY (v_ids) THEN
            v_id := 'k' || left(md5(random()::text || clock_timestamp()::text || k::text), 12);
          END IF;
          v_ids := v_ids || v_id;
          v_stage := public.mkt_canvas_sid(v_col -> 'stage', p_sids);
          IF p_publish AND v_stage IS NULL THEN
            RAISE EXCEPTION '%: the column "%" — pick the stage that fills it in.', v_where, btrim(v_col ->> 'name') USING ERRCODE = '22023';
          END IF;
          v_cols := v_cols || jsonb_build_array(jsonb_build_object('id', v_id, 'name', btrim(coalesce(v_col ->> 'name', '')),
            'type', v_col ->> 'type', 'stage', to_jsonb(v_stage),
            'req', coalesce((v_col -> 'req') = 'true'::jsonb, false), 'pic', coalesce((v_col -> 'pic') = 'true'::jsonb, false)));
        END LOOP;
        v_rows := '[]'::jsonb;
        IF jsonb_typeof(v_f -> 'rows') = 'array' THEN
          IF jsonb_array_length(v_f -> 'rows') > 50 THEN
            RAISE EXCEPTION '%: "%" — at most 50 preset rows.', v_where, v_label USING ERRCODE = '22023';
          END IF;
          FOR v_row IN SELECT x FROM jsonb_array_elements(v_f -> 'rows') x LOOP
            IF jsonb_typeof(v_row) IS DISTINCT FROM 'array' OR jsonb_array_length(v_row) <> jsonb_array_length(v_cols)
               OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_row) c WHERE jsonb_typeof(c) <> 'string' OR length(c #>> '{}') > 200) THEN
              RAISE EXCEPTION '%: "%" — a preset row is one short line per column.', v_where, v_label USING ERRCODE = '22023';
            END IF;
            v_rows := v_rows || jsonb_build_array(v_row);
          END LOOP;
        END IF;
        v_out := v_out || jsonb_build_object('cols', v_cols, 'rows', v_rows);
      END IF;
      v_fields := v_fields || jsonb_build_array(v_out);
    END LOOP;

    v_secs := v_secs || jsonb_build_array(jsonb_build_object(
      'id', v_sec_id,
      'emoji', v_emoji, 'title', v_title, 'stage', to_jsonb(public.mkt_canvas_sid(v_s -> 'stage', p_sids)),
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
REVOKE ALL ON FUNCTION public.mkt_canvas_check(jsonb, text[], boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_canvas_check(jsonb, text[], boolean) TO service_role;
REVOKE ALL ON FUNCTION public.mkt_canvas_sid(jsonb, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_canvas_sid(jsonb, text[]) TO service_role;
REVOKE ALL ON FUNCTION public.mkt_wf_overdue(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_wf_overdue(jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.mkt_wf_finish(jsonb, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_wf_finish(jsonb, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.mkt_wf_stage_sections(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_wf_stage_sections(jsonb) TO service_role;

-- ── The two drafts on production, moved to the new shapes ───────────────────
DO $mig$
DECLARE
  t        record;
  v_cat    uuid;
  v_stages jsonb;
  v_secs   jsonb;
  v_own    jsonb;
  v_sids   text[];
  v_st     jsonb;
  v_sid    text;
  v_t      text;
  v_dept   text;
  v_appr   jsonb;
  v_fields jsonb;
  v_f      jsonb;
  v_sec    jsonb;
  i        integer;
  j        integer;
BEGIN
  -- Each action a category (its first template's emoji).
  INSERT INTO public.mkt_workflow_categories (name, emoji, sort, created_by, created_at)
  SELECT DISTINCT ON (lower(w.action)) w.action, w.emoji,
         (dense_rank() OVER (ORDER BY lower(w.action)))::integer, w.created_by, w.created_at
    FROM public.mkt_workflows w
   WHERE w.category_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.mkt_workflow_categories c WHERE lower(c.name) = lower(w.action))
   ORDER BY lower(w.action), w.created_at, w.id;
  UPDATE public.mkt_workflows w SET category_id = c.id
    FROM public.mkt_workflow_categories c
   WHERE w.category_id IS NULL AND lower(c.name) = lower(w.action);

  FOR t IN SELECT * FROM public.mkt_workflows
            WHERE jsonb_array_length(draft) > 0 AND NOT (draft -> 0 ? 'sid') LOOP
    v_stages := '[]'::jsonb;
    v_secs := '[]'::jsonb;
    v_sids := '{}';
    FOR i IN 0 .. jsonb_array_length(t.draft) - 1 LOOP
      v_st := t.draft -> i;
      v_sid := 's' || left(md5(t.id::text || ':' || i::text), 12);
      v_sids := v_sids || v_sid;
      -- A People title → a group by its words (groupTone's); none known → Design.
      v_t := upper(coalesce(v_st ->> 'dept', ''));
      v_dept := CASE
        WHEN v_t ~ 'VIDEO|CONTENT|PHOTO' THEN 'content'
        WHEN v_t ~ 'GRAPHIC|DESIGN' THEN 'design'
        WHEN v_t LIKE '%SOCIAL%' THEN 'social'
        WHEN v_t ~ 'VISUAL MERCHANDIS|EVENT|BRAND' THEN 'brand'
        WHEN v_t ~ '\mADS\M|MARKETING EXECUTIVE|TELEMARKET' THEN 'ads'
        ELSE 'design' END;
      -- Each old level (one person, the PIC, or one picked at assignment) a level of its own.
      SELECT coalesce(jsonb_agg(jsonb_build_object('ids', jsonb_build_array(
               CASE WHEN a ->> 'kind' = 'person' THEN lower(a ->> 'staff') ELSE a ->> 'kind' END), 'rule', 'any') ORDER BY o), '[]'::jsonb)
        INTO v_appr
        FROM jsonb_array_elements(coalesce(v_st -> 'appr', '[]'::jsonb)) WITH ORDINALITY x(a, o)
       WHERE a ->> 'kind' IN ('person', 'pic', 'assign');
      v_stages := v_stages || jsonb_build_array(jsonb_build_object(
        'sid', v_sid, 'name', coalesce(v_st ->> 'name', ''), 'dept', v_dept,
        'who', coalesce(v_st -> 'who', '{"mode": "assign", "cands": []}'::jsonb), 'sla', coalesce(v_st -> 'sla', '1'::jsonb),
        'appr', v_appr, 'split', coalesce(v_st -> 'split', 'false'::jsonb), 'back', coalesce(v_st -> 'back', 'null'::jsonb),
        'picText', coalesce(v_st ->> 'picText', '')));
      -- Its fields and its section's settings: a canvas section of this stage.
      v_sec := CASE WHEN jsonb_typeof(v_st -> 'sec') = 'object' THEN v_st -> 'sec' ELSE '{}'::jsonb END;
      v_fields := '[]'::jsonb;
      j := 0;
      FOR v_f IN SELECT x FROM jsonb_array_elements(coalesce(v_st -> 'form', '[]'::jsonb)) x LOOP
        j := j + 1;
        v_fields := v_fields || jsonb_build_array((v_f - 'cols' - 'section')
          || jsonb_build_object('id', 'f' || left(md5(v_sid || ':' || j::text), 12), 'stage', v_sid)
          || CASE WHEN v_f ->> 'type' = 'Table' THEN jsonb_build_object('cols', coalesce((
               SELECT jsonb_agg(c || jsonb_build_object('id', 'k' || left(md5(v_sid || ':' || j::text || ':' || o::text), 12),
                                                        'stage', v_sid, 'req', false, 'pic', coalesce((v_f -> 'pic') <> 'false'::jsonb, true)) ORDER BY o)
                 FROM jsonb_array_elements(coalesce(v_f -> 'cols', '[]'::jsonb)) WITH ORDINALITY y(c, o)), '[]'::jsonb))
               ELSE '{}'::jsonb END);
      END LOOP;
      v_secs := v_secs || jsonb_build_array(jsonb_build_object(
        'id', 'x' || v_sid, 'emoji', coalesce(nullif(v_sec ->> 'emoji', ''), '🎯'), 'title', left(coalesce(v_st ->> 'name', ''), 60),
        'stage', v_sid, 'locked', coalesce((v_sec -> 'locked') = 'true'::jsonb, false),
        'req', coalesce((v_sec -> 'req') <> 'false'::jsonb, true), 'pic', coalesce((v_sec -> 'pic') <> 'false'::jsonb, true),
        'fields', v_fields));
    END LOOP;
    -- The canvas's own sections: their stage (an index) → that stage's sid.
    SELECT coalesce(jsonb_agg(s || jsonb_build_object(
             'id', 'c' || left(md5(t.id::text || ':sec:' || o::text), 12),
             'stage', CASE WHEN jsonb_typeof(s -> 'stage') = 'number' THEN to_jsonb(v_sids[(s ->> 'stage')::integer + 1]) ELSE 'null'::jsonb END,
             'fields', coalesce((SELECT jsonb_agg(f || jsonb_build_object(
                         'id', 'f' || left(md5(t.id::text || ':sec:' || o::text || ':' || p::text), 12),
                         'stage', CASE WHEN jsonb_typeof(f -> 'stage') = 'number' THEN to_jsonb(v_sids[(f ->> 'stage')::integer + 1]) ELSE 'null'::jsonb END)
                         ORDER BY p)
                       FROM jsonb_array_elements(coalesce(s -> 'fields', '[]'::jsonb)) WITH ORDINALITY z(f, p)), '[]'::jsonb)) ORDER BY o), '[]'::jsonb)
      INTO v_own
      FROM jsonb_array_elements(coalesce(t.canvas -> 'sections', '[]'::jsonb)) WITH ORDINALITY x(s, o);
    UPDATE public.mkt_workflows
       SET draft = v_stages,
           canvas = jsonb_build_object('req', coalesce(t.canvas -> 'req', '{"pic": true}'::jsonb), 'sections', v_secs || v_own)
     WHERE id = t.id;
  END LOOP;

  -- Every template's finish, spelt out (the defaults the handoff draws).
  UPDATE public.mkt_workflows
     SET finish = jsonb_build_object('notify', '["all"]'::jsonb, 'after', 'close', 'picText', 'Your ' || lower(action) || ' is ready',
                                     'celebration', 'fireworks', 'gifPath', NULL)
   WHERE finish = '{}'::jsonb;
END
$mig$;
ALTER TABLE public.mkt_workflows ALTER COLUMN category_id SET NOT NULL;

-- ── The builder's reader ─────────────────────────────────────────────────────
-- Production's body + the categories, the groups, each template's category, overdue and finish, and its last version's
-- stages and promise (what the publish review compares the draft with).
CREATE OR REPLACE FUNCTION public.mkt_workflows()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'The Workflow Builder is the manager''s.');
  RETURN jsonb_build_object(
    'categories', coalesce((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'emoji', c.emoji, 'sort', c.sort)
                                             ORDER BY c.sort, lower(c.name), c.id)
                              FROM public.mkt_workflow_categories c), '[]'::jsonb),
    'groups', coalesce((SELECT jsonb_agg(jsonb_build_object('key', g.key, 'name', g.name, 'hue', g.hue) ORDER BY g.sort, g.created_at, g.key)
                          FROM public.mkt_groups g), '[]'::jsonb),
    'workflows', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'id', w.id, 'categoryId', w.category_id, 'action', w.action, 'tname', w.tname, 'emoji', w.emoji, 'note', w.note,
             'promise', w.promise, 'locked', w.locked, 'draft', w.draft, 'canvas', w.canvas, 'overdue', w.overdue,
             'finish', w.finish, 'rev', w.draft_rev, 'version', w.version,
             'changed', w.published_rev IS DISTINCT FROM w.draft_rev,
             'pubStages', v.stages, 'pubPromise', v.promise,
             'publishedAt', v.published_at, 'publishedBy', (SELECT u.name FROM public.users u WHERE u.id = v.published_by),
             'updatedAt', w.updated_at, 'updatedBy', (SELECT u.name FROM public.users u WHERE u.id = w.updated_by),
             'live', (SELECT count(*) FROM public.mkt_projects p
                       WHERE p.workflow_id = w.id AND p.status NOT IN ('done', 'cancelled')))
           ORDER BY c.sort, lower(c.name), w.created_at, w.id)
      FROM public.mkt_workflows w
      JOIN public.mkt_workflow_categories c ON c.id = w.category_id
      LEFT JOIN public.mkt_workflow_versions v ON v.workflow_id = w.id AND v.version = w.version), '[]'::jsonb));
END
$fn$;

-- ── Saved as it is typed ─────────────────────────────────────────────────────
-- Production's body + a template's category (made: `category` an id, or `action` a name found or made — the Product
-- Builder's + New action workflow), overdue and finish; the new checks. A new template with no canvas sent gets a
-- section per stage.
CREATE OR REPLACE FUNCTION public.mkt_workflow_save(p_id uuid, p_rev integer, p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_w       public.mkt_workflows;
  v_cat     public.mkt_workflow_categories;
  v_patch   jsonb := coalesce(p_patch, '{}'::jsonb);
  v_action  text;
  v_tname   text;
  v_note    text;
  v_promise integer;
  v_locked  boolean;
  v_stages  jsonb;
  v_canvas  jsonb;
  v_overdue jsonb;
  v_finish  jsonb;
  v_sids    text[];
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

  -- Its category: an id; or, made from a name (found whatever the case, or made); else the one it has.
  IF v_patch ? 'category' THEN
    SELECT * INTO v_cat FROM public.mkt_workflow_categories c WHERE c.id::text = (v_patch ->> 'category');
    IF NOT FOUND THEN
      RAISE EXCEPTION 'That category is not there any more.' USING ERRCODE = 'P0002';
    END IF;
  ELSIF p_id IS NULL THEN
    v_action := btrim(coalesce(v_patch ->> 'action', ''));
    IF length(v_action) NOT BETWEEN 1 AND 60 THEN
      RAISE EXCEPTION 'Name the category and the template (at most 60 characters each).' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_cat FROM public.mkt_workflow_categories c WHERE lower(c.name) = lower(v_action);
    IF NOT FOUND THEN
      IF length(coalesce(nullif(btrim(coalesce(v_patch ->> 'emoji', '')), ''), '✨')) > 16 THEN
        RAISE EXCEPTION 'One emoji.' USING ERRCODE = '22023';
      END IF;
      INSERT INTO public.mkt_workflow_categories (name, emoji, sort, created_by, updated_by)
      VALUES (v_action, coalesce(nullif(btrim(coalesce(v_patch ->> 'emoji', '')), ''), '✨'),
              coalesce((SELECT max(sort) FROM public.mkt_workflow_categories), 0) + 1, auth.uid(), auth.uid())
      RETURNING * INTO v_cat;
    END IF;
  ELSE
    SELECT * INTO v_cat FROM public.mkt_workflow_categories c WHERE c.id = v_w.category_id;
  END IF;
  v_action := v_cat.name;

  v_tname := CASE WHEN v_patch ? 'tname' OR p_id IS NULL THEN btrim(coalesce(v_patch ->> 'tname', '')) ELSE v_w.tname END;
  IF length(v_tname) NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'Name the category and the template (at most 60 characters each).' USING ERRCODE = '22023';
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
  v_sids := ARRAY(SELECT s ->> 'sid' FROM jsonb_array_elements(v_stages) s);
  v_canvas := public.mkt_canvas_check(
    CASE WHEN v_patch ? 'canvas' THEN v_patch -> 'canvas'
         WHEN p_id IS NULL THEN jsonb_build_object('req', jsonb_build_object('pic', true), 'sections', public.mkt_wf_stage_sections(v_stages))
         ELSE v_w.canvas END,
    v_sids, false);
  v_overdue := public.mkt_wf_overdue(CASE WHEN v_patch ? 'overdue' OR p_id IS NULL THEN v_patch -> 'overdue' ELSE v_w.overdue END);
  v_finish := CASE WHEN v_patch ? 'finish' OR p_id IS NULL
                   THEN public.mkt_wf_finish(v_patch -> 'finish', v_action, CASE WHEN p_id IS NULL THEN NULL ELSE v_w.finish ->> 'gifPath' END)
                   ELSE v_w.finish END;

  IF EXISTS (SELECT 1 FROM public.mkt_workflows w
              WHERE lower(w.action) = lower(v_action) AND lower(w.tname) = lower(v_tname) AND w.id IS DISTINCT FROM p_id) THEN
    RAISE EXCEPTION '"% · %" is there already.', v_action, v_tname USING ERRCODE = '23505';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.mkt_workflows (category_id, action, tname, emoji, note, promise, locked, draft, canvas, overdue, finish,
                                      created_by, updated_by)
    VALUES (v_cat.id, v_action, v_tname, v_cat.emoji, v_note, v_promise, v_locked, v_stages, v_canvas, v_overdue, v_finish,
            auth.uid(), auth.uid())
    RETURNING * INTO v_w;
  ELSE
    UPDATE public.mkt_workflows
       SET category_id = v_cat.id, action = v_action, emoji = v_cat.emoji, tname = v_tname, note = v_note, promise = v_promise,
           locked = v_locked, draft = v_stages, canvas = v_canvas, overdue = v_overdue, finish = v_finish,
           draft_rev = draft_rev + 1, updated_by = auth.uid(), updated_at = now()
     WHERE id = p_id
    RETURNING * INTO v_w;
  END IF;
  PERFORM public.mkt_top_up_due();
  RETURN jsonb_build_object('id', v_w.id, 'rev', v_w.draft_rev, 'category', v_cat.id);
END
$fn$;

-- ── Published on the basics (2026-11-13 — the user: "基本资料有了就能 public") ─────────
-- A version needs only its basics: at least one stage, every stage named. Whatever else is unfinished in the draft is
-- tidied INTO THE VERSION (the draft keeps it as typed; the builder shows each as a ⚠️ — workflows.ts `publishFixups`,
-- its TS twin): a 🔓 handoff on stage 1, or with nobody left on its shortlist, runs as MM assigns; somebody no longer
-- on the team leaves a shortlist; an approver who is not a Marketing manager or a Director on the team leaves their
-- level, and a level left with nobody goes; on the canvas a field or column with no name goes (a table left with no
-- column goes), one with no stage (or a stage taken out) is filled in at its section's stage, else the last stage; a
-- second field of one name in a section is numbered ("Caption (2)"); a choice with no options and no shared list is a
-- Text; a date's calendar mark of no known kind goes; a section with no name is named for its stage (else "Section n").
-- Returns {stages, canvas} for mkt_workflow_check / mkt_canvas_check, which then refuse nothing but the basics.
CREATE OR REPLACE FUNCTION public.mkt_wf_publish_ready(p_stages jsonb, p_canvas jsonb, p_locked boolean)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SET search_path = public
AS $fn$
DECLARE
  v_uuid   text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_roster text[] := ARRAY(SELECT lower(r.staff_id::text) FROM public.mkt_roster() r);
  v_apprs  text[] := ARRAY(SELECT lower(r.staff_id::text) FROM public.mkt_roster() r
                            WHERE upper(coalesce(r.title, '')) LIKE '%MARKETING MANAGER%' OR upper(coalesce(r.title, '')) LIKE '%DIRECTOR%');
  v_kinds  text[] := ARRAY['post', 'shoot', 'meeting', 'ads_live', 'ads_end', 'report'];
  v_stages jsonb := '[]'::jsonb;
  v_sids   text[] := '{}';
  v_names  text[] := '{}';
  v_st     jsonb;
  v_who    jsonb;
  v_cands  jsonb;
  v_levels jsonb;
  v_a      jsonb;
  v_ids    jsonb;
  i        integer := 0;
  v_c      jsonb := CASE WHEN jsonb_typeof(p_canvas) = 'object' THEN p_canvas ELSE '{}'::jsonb END;
  v_secs   jsonb := '[]'::jsonb;
  v_s      jsonb;
  v_f      jsonb;
  v_col    jsonb;
  v_fields jsonb;
  v_cols   jsonb;
  v_labels text[];
  v_label  text;
  v_n      integer;
  v_secst  text;
  v_title  text;
  k        integer := 0;
BEGIN
  IF jsonb_typeof(p_stages) IS DISTINCT FROM 'array' THEN
    RETURN jsonb_build_object('stages', p_stages, 'canvas', p_canvas);
  END IF;
  FOR v_st IN SELECT x FROM jsonb_array_elements(p_stages) x LOOP
    IF jsonb_typeof(v_st) <> 'object' THEN
      v_stages := v_stages || jsonb_build_array(v_st);
      i := i + 1;
      CONTINUE;
    END IF;
    v_sids := v_sids || coalesce(v_st ->> 'sid', '');
    v_names := v_names || btrim(coalesce(v_st ->> 'name', ''));
    -- Who: a handoff with nobody left to pick from (or on stage 1, or locked) runs as MM assigns.
    v_who := CASE WHEN jsonb_typeof(v_st -> 'who') = 'object' THEN v_st -> 'who' ELSE '{"mode": "assign", "cands": []}'::jsonb END;
    v_cands := coalesce((SELECT jsonb_agg(x) FROM jsonb_array_elements_text(
                           CASE WHEN jsonb_typeof(v_who -> 'cands') = 'array' THEN v_who -> 'cands' ELSE '[]'::jsonb END) x
                          WHERE lower(x) = ANY (v_roster)), '[]'::jsonb);
    IF v_who ->> 'mode' = 'prev' AND (i = 0 OR p_locked OR jsonb_array_length(v_cands) = 0) THEN
      v_who := jsonb_build_object('mode', 'assign', 'cands', '[]'::jsonb);
    ELSE
      v_who := jsonb_build_object('mode', coalesce(v_who ->> 'mode', 'assign'), 'cands', v_cands);
    END IF;
    -- Approval: only the PIC, "picked at assignment", and Marketing's managers / Directors on the team; empty levels go.
    v_levels := '[]'::jsonb;
    IF jsonb_typeof(v_st -> 'appr') = 'array' THEN
      FOR v_a IN SELECT x FROM jsonb_array_elements(v_st -> 'appr') x LOOP
        IF jsonb_typeof(v_a -> 'ids') = 'array' THEN
          v_ids := coalesce((SELECT jsonb_agg(x) FROM jsonb_array_elements_text(v_a -> 'ids') x
                              WHERE x IN ('pic', 'assign') OR (x ~ v_uuid AND lower(x) = ANY (v_apprs))), '[]'::jsonb);
          IF jsonb_array_length(v_ids) > 0 THEN
            v_levels := v_levels || jsonb_build_array(jsonb_build_object('ids', v_ids, 'rule', CASE WHEN v_a ->> 'rule' = 'all' THEN 'all' ELSE 'any' END));
          END IF;
        ELSIF v_a ->> 'kind' = 'person' THEN
          IF lower(coalesce(v_a ->> 'staff', '')) = ANY (v_apprs) THEN
            v_levels := v_levels || jsonb_build_array(v_a);
          END IF;
        ELSE
          v_levels := v_levels || jsonb_build_array(v_a);
        END IF;
      END LOOP;
    END IF;
    v_stages := v_stages || jsonb_build_array(v_st || jsonb_build_object('who', v_who, 'appr', v_levels));
    i := i + 1;
  END LOOP;

  -- The canvas.
  IF jsonb_typeof(v_c -> 'sections') = 'array' THEN
    FOR v_s IN SELECT x FROM jsonb_array_elements(v_c -> 'sections') x LOOP
      k := k + 1;
      CONTINUE WHEN jsonb_typeof(v_s) <> 'object';
      v_secst := CASE WHEN coalesce(v_s ->> 'stage', '') = ANY (v_sids) THEN v_s ->> 'stage' END;
      v_title := btrim(coalesce(v_s ->> 'title', ''));
      IF v_title = '' THEN
        v_title := coalesce(nullif(v_names[array_position(v_sids, v_secst)], ''), 'Section ' || k);
      END IF;
      v_fields := '[]'::jsonb;
      v_labels := '{}';
      FOR v_f IN SELECT x FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_s -> 'fields') = 'array' THEN v_s -> 'fields' ELSE '[]'::jsonb END) x LOOP
        CONTINUE WHEN jsonb_typeof(v_f) <> 'object';
        v_label := btrim(coalesce(v_f ->> 'label', ''));
        CONTINUE WHEN v_label = '';
        IF coalesce(v_f ->> 'type', '') <> 'Note' THEN
          v_n := 1;
          WHILE (CASE WHEN v_n = 1 THEN v_label ELSE left(v_label, 54) || ' (' || v_n || ')' END) = ANY (v_labels) LOOP
            v_n := v_n + 1;
          END LOOP;
          IF v_n > 1 THEN
            v_label := left(v_label, 54) || ' (' || v_n || ')';
          END IF;
          v_labels := v_labels || v_label;
        END IF;
        v_f := v_f || jsonb_build_object('label', v_label, 'stage', to_jsonb(
          CASE WHEN coalesce(v_f ->> 'stage', '') = ANY (v_sids) THEN v_f ->> 'stage' ELSE coalesce(v_secst, v_sids[cardinality(v_sids)]) END));
        IF v_f ->> 'type' IN ('Select', 'Multi-select')
           AND coalesce(v_f ->> 'list', '') = ''
           AND coalesce(jsonb_array_length(CASE WHEN jsonb_typeof(v_f -> 'opts') = 'array' THEN v_f -> 'opts' END), 0) = 0 THEN
          v_f := (v_f - 'opts' - 'list') || '{"type": "Text"}'::jsonb;
        END IF;
        IF jsonb_typeof(v_f -> 'cal') = 'object' AND NOT (coalesce(v_f -> 'cal' ->> 'kind', '') = ANY (v_kinds)) THEN
          v_f := v_f - 'cal';
        END IF;
        IF v_f ->> 'type' = 'Table' THEN
          v_cols := '[]'::jsonb;
          FOR v_col IN SELECT x FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_f -> 'cols') = 'array' THEN v_f -> 'cols' ELSE '[]'::jsonb END) x LOOP
            CONTINUE WHEN jsonb_typeof(v_col) <> 'object' OR btrim(coalesce(v_col ->> 'name', '')) = '';
            v_cols := v_cols || jsonb_build_array(v_col || jsonb_build_object('stage', to_jsonb(
              CASE WHEN coalesce(v_col ->> 'stage', '') = ANY (v_sids) THEN v_col ->> 'stage' ELSE v_f ->> 'stage' END)));
          END LOOP;
          CONTINUE WHEN jsonb_array_length(v_cols) = 0;
          v_f := v_f || jsonb_build_object('cols', v_cols);
        END IF;
        v_fields := v_fields || jsonb_build_array(v_f);
      END LOOP;
      v_secs := v_secs || jsonb_build_array(v_s || jsonb_build_object('title', v_title, 'fields', v_fields));
    END LOOP;
    v_c := v_c || jsonb_build_object('sections', v_secs);
  END IF;
  RETURN jsonb_build_object('stages', v_stages, 'canvas', v_c);
END
$fn$;
REVOKE ALL ON FUNCTION public.mkt_wf_publish_ready(jsonb, jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_wf_publish_ready(jsonb, jsonb, boolean) TO service_role;

-- ── Published ────────────────────────────────────────────────────────────────
-- Production's body + the canvas checked by sid; the version keeps the overdue rule and the finish as published.
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
  -- The basics only (2026-11-13): the rest of the draft is tidied into the version (mkt_wf_publish_ready).
  v_canvas := public.mkt_wf_publish_ready(v_w.draft, v_w.canvas, v_w.locked);
  v_stages := public.mkt_workflow_check(v_canvas -> 'stages', true, v_w.locked);
  v_canvas := public.mkt_canvas_check(v_canvas -> 'canvas', ARRAY(SELECT s ->> 'sid' FROM jsonb_array_elements(v_stages) s), true);
  INSERT INTO public.mkt_workflow_versions (workflow_id, version, stages, canvas, locked, promise, overdue, finish, published_by)
  VALUES (v_w.id, v_w.version + 1, v_stages, v_canvas, v_w.locked, v_w.promise, public.mkt_wf_overdue(v_w.overdue), v_w.finish, auth.uid());
  UPDATE public.mkt_workflows
     SET version = v_w.version + 1, published_rev = v_w.draft_rev, updated_by = auth.uid(), updated_at = now()
   WHERE id = v_w.id;
  PERFORM public.mkt_top_up_due();
  RETURN jsonb_build_object('id', v_w.id, 'version', v_w.version + 1, 'rev', v_w.draft_rev,
    'live', (SELECT count(*) FROM public.mkt_projects p WHERE p.workflow_id = v_w.id AND p.status NOT IN ('done', 'cancelled')));
END
$fn$;

-- ── Cloned ───────────────────────────────────────────────────────────────────
-- Production's body + its category, overdue and finish.
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
  RETURN public.mkt_workflow_save(NULL, NULL, jsonb_build_object('category', v_w.category_id, 'tname', v_tname,
    'note', v_w.note, 'promise', v_w.promise, 'locked', v_w.locked, 'stages', v_w.draft, 'canvas', v_w.canvas,
    'overdue', v_w.overdue, 'finish', v_w.finish))
    || jsonb_build_object('tname', v_tname);
END
$fn$;

-- ── A template renamed from the picker (its draft's next count) ──────────────
CREATE OR REPLACE FUNCTION public.mkt_workflow_rename(p_id uuid, p_tname text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_w     public.mkt_workflows;
  v_tname text := btrim(coalesce(p_tname, ''));
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'The Workflow Builder is the manager''s.');
  SELECT * INTO v_w FROM public.mkt_workflows WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That template is not there any more.' USING ERRCODE = 'P0002';
  END IF;
  IF length(v_tname) NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'Name the template (at most 60 characters).' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.mkt_workflows w
              WHERE w.category_id = v_w.category_id AND lower(w.tname) = lower(v_tname) AND w.id <> p_id) THEN
    RAISE EXCEPTION '"% · %" is there already.', v_w.action, v_tname USING ERRCODE = '23505';
  END IF;
  IF v_tname = v_w.tname THEN
    RETURN jsonb_build_object('id', v_w.id, 'rev', v_w.draft_rev);
  END IF;
  UPDATE public.mkt_workflows SET tname = v_tname, draft_rev = draft_rev + 1, updated_by = auth.uid(), updated_at = now()
   WHERE id = p_id RETURNING * INTO v_w;
  RETURN jsonb_build_object('id', v_w.id, 'rev', v_w.draft_rev);
END
$fn$;

-- ── Categories ───────────────────────────────────────────────────────────────
-- Made with a Standard template of one stage (the prototype's commitAct: Stage 1, Design, MM assigns, 2 days, no
-- approval, promise 3) — a name already there, whatever the case, is refused.
CREATE OR REPLACE FUNCTION public.mkt_wf_category_add(p_name text, p_emoji text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_name  text := btrim(coalesce(p_name, ''));
  v_emoji text := nullif(btrim(coalesce(p_emoji, '')), '');
  v_cat   public.mkt_workflow_categories;
  v_tpl   jsonb;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'The Workflow Builder is the manager''s.');
  IF length(v_name) NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'Name the category (at most 60 characters).' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.mkt_workflow_categories c WHERE lower(c.name) = lower(v_name)) THEN
    RAISE EXCEPTION '"%" already exists', v_name USING ERRCODE = '23505';
  END IF;
  IF v_emoji IS NULL THEN
    v_emoji := coalesce((SELECT e FROM unnest(ARRAY['📦', '🎨', '📸', '🎤', '🗂️', '✨', '🧾', '📰']) WITH ORDINALITY u(e, o)
                          WHERE NOT EXISTS (SELECT 1 FROM public.mkt_workflow_categories c WHERE c.emoji = u.e) ORDER BY o LIMIT 1), '📦');
  END IF;
  IF length(v_emoji) > 16 THEN
    RAISE EXCEPTION 'One emoji.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.mkt_workflow_categories (name, emoji, sort, created_by, updated_by)
  VALUES (v_name, v_emoji, coalesce((SELECT max(sort) FROM public.mkt_workflow_categories), 0) + 1, auth.uid(), auth.uid())
  RETURNING * INTO v_cat;
  v_tpl := public.mkt_workflow_save(NULL, NULL, jsonb_build_object('category', v_cat.id, 'tname', 'Standard', 'promise', 3,
    'stages', jsonb_build_array(jsonb_build_object('name', 'Stage 1', 'dept', 'design', 'who', jsonb_build_object('mode', 'assign', 'cands', '[]'::jsonb),
      'sla', 2, 'appr', '[]'::jsonb, 'split', false, 'back', NULL, 'picText', ''))));
  RETURN v_tpl || jsonb_build_object('category', v_cat.id);
END
$fn$;

CREATE OR REPLACE FUNCTION public.mkt_wf_category_rename(p_id uuid, p_name text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_name text := btrim(coalesce(p_name, ''));
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'The Workflow Builder is the manager''s.');
  PERFORM 1 FROM public.mkt_workflow_categories WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That category is not there any more.' USING ERRCODE = 'P0002';
  END IF;
  IF length(v_name) NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'Name the category (at most 60 characters).' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.mkt_workflow_categories c WHERE lower(c.name) = lower(v_name) AND c.id <> p_id) THEN
    RAISE EXCEPTION '"%" already exists', v_name USING ERRCODE = '23505';
  END IF;
  UPDATE public.mkt_workflow_categories SET name = v_name, updated_by = auth.uid(), updated_at = now() WHERE id = p_id;
  -- Every template keeps its category's name as its action (products and older readers read it).
  UPDATE public.mkt_workflows SET action = v_name, updated_at = now() WHERE category_id = p_id AND action IS DISTINCT FROM v_name;
END
$fn$;

CREATE OR REPLACE FUNCTION public.mkt_wf_category_icon(p_id uuid, p_emoji text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_emoji text := btrim(coalesce(p_emoji, ''));
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'The Workflow Builder is the manager''s.');
  IF length(v_emoji) NOT BETWEEN 1 AND 16 THEN
    RAISE EXCEPTION 'One emoji.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.mkt_workflow_categories SET emoji = v_emoji, updated_by = auth.uid(), updated_at = now() WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That category is not there any more.' USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.mkt_workflows SET emoji = v_emoji WHERE category_id = p_id;
END
$fn$;

-- Deleted with its templates — only while none of them was ever published (a published template stays, its versions
-- kept: the user's answer 8) and no product's draft links one.
CREATE OR REPLACE FUNCTION public.mkt_wf_category_delete(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_cat     public.mkt_workflow_categories;
  v_tpl     text;
  v_product text;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'The Workflow Builder is the manager''s.');
  SELECT * INTO v_cat FROM public.mkt_workflow_categories WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That category is not there any more.' USING ERRCODE = 'P0002';
  END IF;
  PERFORM 1 FROM public.mkt_workflows WHERE category_id = p_id FOR UPDATE;
  SELECT w.tname INTO v_tpl FROM public.mkt_workflows w WHERE w.category_id = p_id AND w.version > 0 ORDER BY w.created_at LIMIT 1;
  IF v_tpl IS NOT NULL THEN
    RAISE EXCEPTION '"%" was published — a published template stays, its versions are kept.', v_tpl USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(nullif(p.name, ''), p.code) INTO v_product
    FROM public.mkt_products p
   CROSS JOIN LATERAL jsonb_array_elements(p.groups) g
   CROSS JOIN LATERAL jsonb_array_elements(coalesce(g -> 'items', '[]'::jsonb)) i
   WHERE i ->> 'workflow' IN (SELECT w.id::text FROM public.mkt_workflows w WHERE w.category_id = p_id)
   ORDER BY p.code
   LIMIT 1;
  IF v_product IS NOT NULL THEN
    RAISE EXCEPTION 'The product "%" links a template of this category — unlink it there first.', v_product USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.mkt_workflows WHERE category_id = p_id;
  DELETE FROM public.mkt_workflow_categories WHERE id = p_id;
END
$fn$;

-- ── + New group ──────────────────────────────────────────────────────────────
-- A name (unique, whatever the case), a key made from it, the next hue of [60, 150, 20, 110, 320, 250].
CREATE OR REPLACE FUNCTION public.mkt_group_add(p_name text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_base text;
  v_key  text;
  v_hues integer[] := ARRAY[60, 150, 20, 110, 320, 250];
  v_n    integer;
  v_g    public.mkt_groups;
  k      integer := 1;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'The Workflow Builder is the manager''s.');
  IF length(v_name) NOT BETWEEN 1 AND 40 THEN
    RAISE EXCEPTION 'Name the group (at most 40 characters).' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.mkt_groups g WHERE lower(g.name) = lower(v_name)) THEN
    RAISE EXCEPTION '"%" already exists', v_name USING ERRCODE = '23505';
  END IF;
  LOCK TABLE public.mkt_groups IN SHARE ROW EXCLUSIVE MODE;
  v_base := left(trim(both '_' FROM regexp_replace(lower(v_name), '[^a-z0-9]+', '_', 'g')), 20);
  IF v_base = '' THEN
    v_base := 'g';
  END IF;
  v_key := v_base;
  WHILE EXISTS (SELECT 1 FROM public.mkt_groups g WHERE g.key = v_key) LOOP
    k := k + 1;
    v_key := v_base || '_' || k;
  END LOOP;
  SELECT count(*) INTO v_n FROM public.mkt_groups;
  INSERT INTO public.mkt_groups (key, name, hue, sort, created_by)
  VALUES (v_key, v_name, v_hues[((greatest(v_n - 5, 0)) % 6) + 1],
          coalesce((SELECT max(sort) FROM public.mkt_groups), 0) + 1, auth.uid())
  RETURNING * INTO v_g;
  RETURN jsonb_build_object('key', v_g.key, 'name', v_g.name, 'hue', v_g.hue);
END
$fn$;

REVOKE ALL ON FUNCTION public.mkt_workflows() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_workflow_save(uuid, integer, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_workflow_publish(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_workflow_clone(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_workflow_rename(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_wf_category_add(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_wf_category_rename(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_wf_category_icon(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_wf_category_delete(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_group_add(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_workflows() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_workflow_save(uuid, integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_workflow_publish(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_workflow_clone(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_workflow_rename(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_wf_category_add(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_wf_category_rename(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_wf_category_icon(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_wf_category_delete(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_group_add(text) TO authenticated;

-- ── A celebration GIF: the manager's, under workflow/, an image ≤ 4 MB ────────
DROP POLICY IF EXISTS mkt_workflow_gif_upload ON public.file_objects;
CREATE POLICY mkt_workflow_gif_upload ON public.file_objects FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'marketing'::text) AND ((storage.foldername(name))[1] = 'workflow'::text)
    AND coalesce(metadata ->> 'size', '') ~ '^[0-9]{1,15}$' AND (metadata ->> 'size')::bigint <= 4000000
    AND lower(coalesce(metadata ->> 'mimetype', '')) IN ('image/gif', 'image/webp', 'image/apng', 'image/png')
    AND (SELECT public.has_any_action(ARRAY['marketing.manage'::text])));

-- ── The Product Builder's "PIC approves n×" reads the new levels too ─────────
-- mkt_products (production's md5 deb02f05da5054459d315777baf4e2df): its one count of the PIC's approvals swapped in
-- place in production's body — a level whose ids hold 'pic' counts as the old {kind: 'pic'} did. Nothing else moves.
DO $swap$
DECLARE
  v_def text;
  v_old text := $q$WHERE a ->> 'kind' = 'pic'))$q$;
  v_new text := $q$WHERE a ->> 'kind' = 'pic' OR coalesce(a -> 'ids', '[]'::jsonb) ? 'pic'))$q$;
BEGIN
  SELECT replace(pg_get_functiondef(p.oid), E'\r', '') INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'mkt_products' AND p.pronargs = 0;
  IF v_def IS NULL OR position(v_new IN v_def) > 0 THEN
    RETURN; -- not here (a test database), or swapped already
  END IF;
  IF (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 THEN
    RAISE EXCEPTION 'mkt_products: the PIC count is not there exactly once — compare with production first';
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
END
$swap$;
