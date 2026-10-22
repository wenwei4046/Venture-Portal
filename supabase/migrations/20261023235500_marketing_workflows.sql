-- ============================================================================
-- 20261023235500_marketing_workflows.sql
-- Marketing's Workflow Builder — ③ of the Claude Design handoff "HOUZS Marketing Module Setup" (2026-10-23; the
-- user: "全部照设计做", in order): the stages each kind of work goes through, kept as templates grouped by their action
-- ("Reels video" · "Full production", "Reels video" · "Quick edit" …), edited as a draft and published as numbered
-- versions — a project keeps the version it started on ("12 active tasks stay on v2"). The Product Builder links a
-- product's lines to them; the Assignment plan starts a project from a published version (both later).
-- ============================================================================
--
-- A template's stage (`Workflow Builder.dc.html`, not quick):
--   { name, dept, who: { mode: assign (the manager picks when planning each project) | prev (🔓 the stage before
--     picks, from cands — never the first stage), cands: [People ids] }, sla (working days, 1–30),
--     appr: [{ kind: person, staff } | { kind: pic } (the PIC, through the link) | { kind: assign } (a person picked
--     at assignment)] — at most 3 levels, in order, split (may it split into subtasks), back (the earlier stage
--     changes go back to; none = stay on this stage), picText (what the PIC sees on the link: department words, no
--     names, no prices), form ([{ label, type, cols?, rows? }] — a table's preset rows: a cell filled in is fixed
--     for the team, a blank one is theirs to fill in) }
-- The draft keeps every stage as it was typed — 🔓 hand-offs and subtasks included while the whole workflow is
-- locked, so unlocking gives them back. A published version is the workflow as it runs: locked, every stage is
-- assigned by the manager — no 🔓 hand-offs, no subtasks.
-- Tables (RLS on, NO policy, no client grants — the functions below, as the rest of Marketing's):
--   mkt_workflows          a template: its action and name, emoji, note, the product's promise (working days), its
--                          lock, its draft (saved as it is typed, draft_rev counting the saves), its last version.
--   mkt_workflow_versions  each version published, whole and never changed — who, when. A project names one
--                          (mkt_projects.workflow_id / workflow_version now reference it).
-- Functions (SECURITY DEFINER, plpgsql; PUBLIC and anon revoked, `authenticated` granted), Marketing · Manage:
--   mkt_workflows()                   the templates with their drafts, versions and live projects
--   mkt_workflow_save(id, rev, patch) a template made (id null), or what changed of it saved — refused when somebody
--                                     saved it since (rev): nobody's edit is written over unseen
--   mkt_workflow_publish(id, rev)     the draft, checked whole, published as the next version
--   mkt_workflow_clone(id)            a new template of the same action from its draft ("… copy")
-- The page `/marketing/workflows` joins the database's copy of the tab registry under the manager's tools' tab.
-- PGlite: tests/member-sql/validate-marketing-workflows.mjs.

CREATE TABLE IF NOT EXISTS public.mkt_workflows (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action        text NOT NULL CHECK (action = btrim(action) AND length(action) BETWEEN 1 AND 60),
  tname         text NOT NULL CHECK (tname = btrim(tname) AND length(tname) BETWEEN 1 AND 60),
  emoji         text NOT NULL DEFAULT '✨' CHECK (length(emoji) BETWEEN 1 AND 16),
  note          text CHECK (length(note) <= 120),
  promise       integer CHECK (promise BETWEEN 1 AND 365),
  locked        boolean NOT NULL DEFAULT false,
  draft         jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(draft) = 'array'),
  draft_rev     integer NOT NULL DEFAULT 1 CHECK (draft_rev >= 1),
  version       integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  published_rev integer CHECK (published_rev >= 1),
  created_by    uuid REFERENCES public.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid REFERENCES public.users(id),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK ((version = 0) = (published_rev IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS mkt_workflows_name ON public.mkt_workflows (lower(action), lower(tname));

CREATE TABLE IF NOT EXISTS public.mkt_workflow_versions (
  workflow_id  uuid NOT NULL REFERENCES public.mkt_workflows(id),
  version      integer NOT NULL CHECK (version >= 1),
  stages       jsonb NOT NULL CHECK (jsonb_typeof(stages) = 'array' AND jsonb_array_length(stages) >= 1),
  locked       boolean NOT NULL,
  promise      integer,
  published_by uuid REFERENCES public.users(id),
  published_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workflow_id, version)
);

-- A project started from a template names a version that was published (empty on 2026-10-23: no project has one).
ALTER TABLE public.mkt_projects DROP CONSTRAINT IF EXISTS mkt_projects_workflow_version_fkey;
ALTER TABLE public.mkt_projects ADD CONSTRAINT mkt_projects_workflow_version_fkey
  FOREIGN KEY (workflow_id, workflow_version) REFERENCES public.mkt_workflow_versions (workflow_id, version);
CREATE INDEX IF NOT EXISTS mkt_projects_workflow ON public.mkt_projects (workflow_id) WHERE workflow_id IS NOT NULL;

ALTER TABLE public.mkt_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mkt_workflow_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mkt_workflows, public.mkt_workflow_versions FROM anon, authenticated;

SELECT public.audit_register('mkt_workflows', 'Marketing workflow templates', 'Marketing', '{}', 'none',
  p_reason => 'A draft is saved as it is typed; each version published is kept whole, with who and when, in mkt_workflow_versions');
SELECT public.audit_register('mkt_workflow_versions', 'Marketing workflow versions', 'Marketing', '{}', 'none',
  p_reason => 'Each version published, written once and never changed — a record already');

-- ── A template's stages, checked (nobody's to call but the functions below) ─
-- As a draft (p_publish false): the shapes and limits; each stage kept as typed, names half-typed included. As
-- published: every stage, field and column named, each field once; each 🔓 stage with its candidates and a stage
-- before it; everybody named on Marketing's team — and the lock applied (no 🔓 hand-offs, no subtasks).
-- Answers the stages written clean.
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
          v_form := v_form || jsonb_build_array(jsonb_build_object('label', v_label, 'type', 'Table', 'cols', v_cols, 'rows', v_rows));
        ELSE
          v_form := v_form || jsonb_build_array(jsonb_build_object('label', v_label, 'type', v_f ->> 'type'));
        END IF;
      END LOOP;
    END IF;

    v_back := CASE WHEN jsonb_typeof(v_st -> 'back') = 'number' AND (v_st ->> 'back') ~ '^[0-9]{1,2}$'
                        AND (v_st ->> 'back')::integer < i THEN (v_st ->> 'back')::integer END;
    IF length(coalesce(v_st ->> 'picText', '')) > 120 THEN
      RAISE EXCEPTION 'Stage %: what the PIC sees — at most 120 characters.', i + 1 USING ERRCODE = '22023';
    END IF;
    v_split := coalesce(v_st ->> 'split', '') = 'true' AND NOT (p_publish AND p_locked);

    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'name', v_name, 'dept', v_st ->> 'dept', 'who', jsonb_build_object('mode', v_mode, 'cands', v_cands), 'sla', v_sla,
      'appr', v_appr, 'split', v_split, 'back', to_jsonb(v_back), 'picText', btrim(coalesce(v_st ->> 'picText', '')),
      'form', v_form));
  END LOOP;
  RETURN v_out;
END
$fn$;

REVOKE ALL ON FUNCTION public.mkt_workflow_check(jsonb, boolean, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_workflow_check(jsonb, boolean, boolean) TO service_role;

-- ── The builder's reader ────────────────────────────────────────────────────
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
             'locked', w.locked, 'draft', w.draft, 'rev', w.draft_rev, 'version', w.version,
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
-- p_id null: a new template — p_patch { action, tname, stages, emoji?, note?, promise?, locked? }. Otherwise only the
-- parts given change: tname, emoji, note, promise (null clears it), locked, stages; p_rev is the draft the caller
-- last saw, and a draft saved by somebody since is not written over. Answers { id, rev }.
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

  IF EXISTS (SELECT 1 FROM public.mkt_workflows w
              WHERE lower(w.action) = lower(v_action) AND lower(w.tname) = lower(v_tname) AND w.id IS DISTINCT FROM p_id) THEN
    RAISE EXCEPTION '"% · %" is there already.', v_action, v_tname USING ERRCODE = '23505';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.mkt_workflows (action, tname, emoji, note, promise, locked, draft, created_by, updated_by)
    VALUES (v_action, v_tname, v_emoji, v_note, v_promise, v_locked, v_stages, auth.uid(), auth.uid())
    RETURNING * INTO v_w;
  ELSE
    UPDATE public.mkt_workflows
       SET tname = v_tname, emoji = v_emoji, note = v_note, promise = v_promise, locked = v_locked, draft = v_stages,
           draft_rev = draft_rev + 1, updated_by = auth.uid(), updated_at = now()
     WHERE id = p_id
    RETURNING * INTO v_w;
  END IF;
  PERFORM public.mkt_top_up_due();
  RETURN jsonb_build_object('id', v_w.id, 'rev', v_w.draft_rev);
END
$fn$;

-- ── Published: the draft as the caller saw it, checked whole, is the next version ──
CREATE OR REPLACE FUNCTION public.mkt_workflow_publish(p_id uuid, p_rev integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_w      public.mkt_workflows;
  v_stages jsonb;
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
  INSERT INTO public.mkt_workflow_versions (workflow_id, version, stages, locked, promise, published_by)
  VALUES (v_w.id, v_w.version + 1, v_stages, v_w.locked, v_w.promise, auth.uid());
  UPDATE public.mkt_workflows
     SET version = v_w.version + 1, published_rev = v_w.draft_rev, updated_by = auth.uid(), updated_at = now()
   WHERE id = v_w.id;
  PERFORM public.mkt_top_up_due();
  RETURN jsonb_build_object('id', v_w.id, 'version', v_w.version + 1, 'rev', v_w.draft_rev,
    'live', (SELECT count(*) FROM public.mkt_projects p WHERE p.workflow_id = v_w.id AND p.status NOT IN ('done', 'cancelled')));
END
$fn$;

-- ── Cloned: a new template of the same action, from this one's draft ────────
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
    'note', v_w.note, 'promise', v_w.promise, 'locked', v_w.locked, 'stages', v_w.draft)) || jsonb_build_object('tname', v_tname);
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

-- ── The builder's page in the database's copy of the tab registry: the manager's tools ──
INSERT INTO public.permission_page_tabs (page, tab_id) VALUES ('/marketing/workflows', 'mkt.tracking')
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
