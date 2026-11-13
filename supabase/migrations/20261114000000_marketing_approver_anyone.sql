-- Marketing — anybody on the team approves, and "the next stage's person" approves (2026-11-14).
-- The user, of the Approval picker that listed only MM / AMM / a Director: "approval 的人可以是全部人，有的时候是 next
-- step 的人", then, asked whether somebody named needs Marketing · Approve too: "被选上当审批人就能审".
--
--  1. Anybody on Marketing's roster may be named an approver — on a template (mkt_workflow_check, mkt_wf_publish_ready),
--     a plan and a quick task (mkt_levels_check already took the roster). Being named is what lets them decide:
--     mkt_stage_decide asks Marketing · Approve OR Edit (the Staff template holds Edit) — the level still names who.
--  2. A new approver id, 'next' — whoever does the stage after this one. It stays 'next' in the level; the person it
--     stands for is kept beside it as the level's `nextWho` (mkt_levels_next), set again whenever the next stage's person
--     changes: at Submit (after a 🔓 handoff's pick), on ⇄ Reassign, when a plan is saved; Replace Person swaps it.
--     Every reader goes through mkt_level_ids (the level's ids with 'next' read as `nextWho`, none while nobody is on the
--     next stage): who a level waits for, who is on it, its names, who is told. A level whose people are nobody yet is
--     passed over as an empty one. The last stage has no next stage: the builder never offers it there, publishing drops
--     it (mkt_wf_publish_ready) and the check refuses it.
-- Rewritten whole: our own functions from 20261113210000, production's bodies (md5 checked 2026-11-14). Swapped by
-- pg_temp.swap_check (whitespace-blind, exactly once; already swapped → left): the rest.
-- PGlite: tests/member-sql/validate-marketing-approver-anyone.mjs.

-- ── The level's people, 'next' read as its person ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_level_ids(p_level jsonb)
RETURNS text[]
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $fn$
DECLARE
  v_who text := CASE WHEN coalesce(p_level ->> 'nextWho', '') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                     THEN lower(p_level ->> 'nextWho') END;
BEGIN
  IF p_level IS NULL OR jsonb_typeof(p_level -> 'ids') IS DISTINCT FROM 'array' THEN
    RETURN '{}'::text[];
  END IF;
  RETURN ARRAY(SELECT z.x FROM (SELECT DISTINCT ON (y.x) y.x, y.o
                                  FROM (SELECT CASE WHEN t.x = 'next' THEN v_who ELSE t.x END AS x, t.o
                                          FROM jsonb_array_elements_text(p_level -> 'ids') WITH ORDINALITY AS t(x, o)) y
                                 WHERE y.x IS NOT NULL
                                 ORDER BY y.x, y.o) z
                ORDER BY z.o);
END
$fn$;

-- A level as any version of the data keeps it → {ids, rule} (+ picAll when both PICs are asked, + nextWho when it names
-- the next stage's person); unknown → NULL.
CREATE OR REPLACE FUNCTION public.mkt_level_norm(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $fn$
DECLARE
  v_ids jsonb;
BEGIN
  IF jsonb_typeof(p) IS DISTINCT FROM 'object' THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(p -> 'ids') = 'array' THEN
    v_ids := coalesce((SELECT jsonb_agg(z.x ORDER BY z.o)
                         FROM (SELECT DISTINCT ON (lower(btrim(t.x))) lower(btrim(t.x)) AS x, t.o
                                 FROM jsonb_array_elements_text(
                                        (SELECT coalesce(jsonb_agg(e), '[]'::jsonb) FROM jsonb_array_elements(p -> 'ids') e
                                          WHERE jsonb_typeof(e) = 'string')) WITH ORDINALITY AS t(x, o)
                                WHERE btrim(t.x) <> ''
                                ORDER BY lower(btrim(t.x)), t.o) z), '[]'::jsonb);
    RETURN jsonb_build_object('ids', v_ids, 'rule', CASE WHEN p ->> 'rule' = 'all' THEN 'all' ELSE 'any' END)
        || CASE WHEN (p ->> 'picAll' = 'true' OR p ->> 'all' = 'true') AND v_ids ? 'pic' THEN '{"picAll": true}'::jsonb ELSE '{}'::jsonb END
        || CASE WHEN v_ids ? 'next'
                     AND coalesce(p ->> 'nextWho', '') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                THEN jsonb_build_object('nextWho', lower(p ->> 'nextWho')) ELSE '{}'::jsonb END;
  END IF;
  IF p ->> 'kind' = 'person' AND btrim(coalesce(p ->> 'staff', '')) <> '' THEN
    RETURN jsonb_build_object('ids', jsonb_build_array(lower(btrim(p ->> 'staff'))), 'rule', 'any');
  END IF;
  IF p ->> 'kind' = 'pic' THEN
    RETURN jsonb_build_object('ids', '["pic"]'::jsonb, 'rule', 'any')
        || CASE WHEN p ->> 'all' = 'true' THEN '{"picAll": true}'::jsonb ELSE '{}'::jsonb END;
  END IF;
  IF p ->> 'kind' = 'assign' THEN
    RETURN jsonb_build_object('ids', jsonb_build_array(coalesce(nullif(lower(btrim(coalesce(p ->> 'staff', ''))), ''), 'assign')),
                              'rule', 'any');
  END IF;
  RETURN NULL;
END
$fn$;

-- Who a level still waits for: `any` — everyone on it until one approves, then nobody; `all` — those who have not.
CREATE OR REPLACE FUNCTION public.mkt_level_waits(p_level jsonb, p_ok jsonb)
RETURNS text[]
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $fn$
DECLARE
  v_ok  jsonb := CASE WHEN jsonb_typeof(p_ok) = 'object' THEN p_ok ELSE '{}'::jsonb END;
  v_ids text[];
BEGIN
  IF p_level IS NULL OR jsonb_typeof(p_level -> 'ids') IS DISTINCT FROM 'array' THEN
    RETURN '{}'::text[];
  END IF;
  v_ids := public.mkt_level_ids(p_level);
  IF coalesce(p_level ->> 'rule', 'any') <> 'all' THEN
    RETURN CASE WHEN EXISTS (SELECT 1 FROM unnest(v_ids) x WHERE v_ok ? x) THEN '{}'::text[] ELSE v_ids END;
  END IF;
  RETURN ARRAY(SELECT x FROM unnest(v_ids) x WHERE NOT (v_ok ? x));
END
$fn$;

-- The staff on a stage's levels (1-based level), legacy elements too; the next stage's person once known.
CREATE OR REPLACE FUNCTION public.mkt_appr_people(p_appr jsonb)
RETURNS TABLE (who uuid, lvl integer)
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $fn$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (x.id) x.id::uuid, l.o::integer
    FROM jsonb_array_elements(public.mkt_levels_norm(p_appr)) WITH ORDINALITY AS l(v, o),
         unnest(public.mkt_level_ids(l.v)) AS x(id)
   WHERE x.id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   ORDER BY x.id, l.o;
END
$fn$;

-- A level in words: "Rachel or Kelvin (PIC)" (any one), "Rachel & Daniel" (everyone); the next stage's person by name
-- once known, else "Next stage's person".
CREATE OR REPLACE FUNCTION public.mkt_level_names(p_level jsonb, p_pic text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_who text := CASE WHEN coalesce(p_level ->> 'nextWho', '') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                     THEN lower(p_level ->> 'nextWho') END;
BEGIN
  IF p_level IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN left(nullif(array_to_string(ARRAY(
           SELECT CASE WHEN z.x = 'pic' THEN coalesce(nullif(btrim(coalesce(p_pic, '')), '') || ' (PIC)', 'PIC')
                       WHEN z.x = 'assign' THEN 'Picked at assignment'
                       WHEN z.x = 'next' THEN 'Next stage''s person'
                       WHEN z.x ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                         THEN coalesce(public.mkt_staff_name(z.x::uuid), 'Somebody')
                       ELSE z.x END
             FROM (SELECT DISTINCT ON (y.x) y.x, y.o
                     FROM (SELECT CASE WHEN t.x = 'next' THEN coalesce(v_who, 'next') ELSE t.x END AS x, t.o
                             FROM jsonb_array_elements_text(p_level -> 'ids') WITH ORDINALITY AS t(x, o)) y
                    ORDER BY y.x, y.o) z
            ORDER BY z.o),
           CASE WHEN p_level ->> 'rule' = 'all' THEN ' & ' ELSE ' or ' END), ''), 200);
END
$fn$;

-- Tell everybody on a level (the staff; never the PIC — the link is theirs).
CREATE OR REPLACE FUNCTION public.mkt_level_tell(p_project uuid, p_level jsonb, p_title text, p_body text, p_type text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_id text;
BEGIN
  IF p_level IS NULL OR jsonb_typeof(p_level -> 'ids') IS DISTINCT FROM 'array' THEN
    RETURN;
  END IF;
  FOR v_id IN SELECT x FROM unnest(public.mkt_level_ids(p_level)) x
               WHERE x ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' LOOP
    PERFORM public.mkt_notify(v_id::uuid, p_project, p_title, p_body, p_type);
  END LOOP;
END
$fn$;

-- A stage's levels as a writer sends them, checked and written clean: ≤ 3 levels; each a string (a staff id, 'pic',
-- 'pic:all', 'next' — the quick builder's) or {ids, rule[, picAll]} (or a legacy {kind}); on each, somebody — a person
-- on Marketing's roster, the PIC or the next stage's person; the PIC once a stage, the next stage's person too; a person
-- on one level only; nobody 'picked at assignment' left. `p_pic_all` false drops picAll (one PIC named).
CREATE OR REPLACE FUNCTION public.mkt_levels_check(p_appr jsonb, p_roster uuid[], p_where text, p_pic_all boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SET search_path = public
AS $fn$
DECLARE
  v_out  jsonb := '[]'::jsonb;
  v_x    jsonb;
  v_lv   jsonb;
  v_id   text;
  v_seen text[] := '{}';
BEGIN
  IF p_appr IS NULL OR jsonb_typeof(p_appr) = 'null' THEN
    RETURN '[]'::jsonb;
  END IF;
  IF jsonb_typeof(p_appr) <> 'array' THEN
    RAISE EXCEPTION '%: not a list of approvals.', p_where USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_appr) > 3 THEN
    RAISE EXCEPTION '%: at most 3 approvals.', p_where USING ERRCODE = '22023';
  END IF;
  FOR v_x IN SELECT x FROM jsonb_array_elements(p_appr) x LOOP
    IF jsonb_typeof(v_x) = 'string' THEN
      v_lv := CASE WHEN v_x #>> '{}' = 'pic' THEN '{"ids": ["pic"], "rule": "any"}'::jsonb
                   WHEN v_x #>> '{}' = 'pic:all' THEN '{"ids": ["pic"], "rule": "any", "picAll": true}'::jsonb
                   ELSE jsonb_build_object('ids', jsonb_build_array(lower(btrim(v_x #>> '{}'))), 'rule', 'any') END;
    ELSE
      v_lv := public.mkt_level_norm(v_x);
    END IF;
    IF v_lv IS NULL OR jsonb_array_length(v_lv -> 'ids') = 0 THEN
      RAISE EXCEPTION '%: pick who approves it.', p_where USING ERRCODE = '22023';
    END IF;
    FOR v_id IN SELECT x FROM jsonb_array_elements_text(v_lv -> 'ids') x LOOP
      IF v_id = 'assign' THEN
        RAISE EXCEPTION '%: pick who approves it.', p_where USING ERRCODE = '22023';
      ELSIF v_id = 'pic' THEN
        IF 'pic' = ANY (v_seen) THEN
          RAISE EXCEPTION '%: the PIC twice.', p_where USING ERRCODE = '22023';
        END IF;
      ELSIF v_id = 'next' THEN
        IF 'next' = ANY (v_seen) THEN
          RAISE EXCEPTION '%: the next stage''s person twice.', p_where USING ERRCODE = '22023';
        END IF;
      ELSIF v_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR NOT (v_id::uuid = ANY (p_roster)) THEN
        RAISE EXCEPTION '%: an approver is not on Marketing''s team.', p_where USING ERRCODE = '22023';
      ELSIF v_id = ANY (v_seen) THEN
        RAISE EXCEPTION '%: the same approver twice.', p_where USING ERRCODE = '22023';
      END IF;
      v_seen := v_seen || v_id;
    END LOOP;
    IF NOT coalesce(p_pic_all, true) THEN
      v_lv := v_lv - 'picAll';
    END IF;
    v_out := v_out || jsonb_build_array(v_lv);
  END LOOP;
  RETURN v_out;
END
$fn$;

-- The levels with each 'next' standing for `p_who` (the next stage's person; NULL — nobody yet, or no next stage).
CREATE OR REPLACE FUNCTION public.mkt_levels_next(p_appr jsonb, p_who uuid)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $fn$
BEGIN
  IF jsonb_typeof(p_appr) IS DISTINCT FROM 'array' THEN
    RETURN p_appr;
  END IF;
  RETURN coalesce((SELECT jsonb_agg(CASE WHEN jsonb_typeof(x -> 'ids') = 'array' AND x -> 'ids' ? 'next'
                                         THEN CASE WHEN p_who IS NULL THEN x - 'nextWho'
                                                   ELSE x || jsonb_build_object('nextWho', p_who::text) END
                                         ELSE x END ORDER BY o)
                     FROM jsonb_array_elements(p_appr) WITH ORDINALITY AS t(x, o)), '[]'::jsonb);
END
$fn$;

-- A project's stages not done (one stage, or every one): each 'next' set to whoever is on the stage after it now.
CREATE OR REPLACE FUNCTION public.mkt_next_sync(p_project uuid, p_idx integer DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  UPDATE public.mkt_stages s
     SET appr = public.mkt_levels_next(s.appr, (SELECT n.owner_staff FROM public.mkt_stages n
                                                  WHERE n.project_id = s.project_id AND n.idx = s.idx + 1))
   WHERE s.project_id = p_project
     AND (p_idx IS NULL OR s.idx = p_idx)
     AND s.status <> 'done'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(s.appr) = 'array' THEN s.appr ELSE '[]'::jsonb END) l
                  WHERE jsonb_typeof(l -> 'ids') = 'array' AND l -> 'ids' ? 'next');
END
$fn$;

-- Replace Person: ids inside levels, and the next stage's person a level stands for.
CREATE OR REPLACE FUNCTION public.mkt_people_swap(p_list jsonb, p_from uuid, p_to uuid, p_appr boolean)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $fn$
DECLARE
  v_out jsonb := '[]'::jsonb;
  v_x   jsonb;
  v_id  text;
BEGIN
  IF jsonb_typeof(p_list) IS DISTINCT FROM 'array' THEN
    RETURN p_list;
  END IF;
  FOR v_x IN SELECT x FROM jsonb_array_elements(p_list) x LOOP
    IF p_appr THEN
      IF jsonb_typeof(v_x -> 'ids') = 'array' THEN
        -- A level of several (2026-11-13): the one replaced swapped in place, each id once.
        v_x := v_x || jsonb_build_object('ids', coalesce((
                 SELECT jsonb_agg(z.id ORDER BY z.n)
                   FROM (SELECT DISTINCT ON (y.id) y.id, y.n
                           FROM (SELECT CASE WHEN lower(t.id) = p_from::text THEN p_to::text ELSE lower(t.id) END AS id, t.n
                                   FROM jsonb_array_elements_text(v_x -> 'ids') WITH ORDINALITY AS t(id, n)) y
                          ORDER BY y.id, y.n) z), '[]'::jsonb));
        IF lower(coalesce(v_x ->> 'nextWho', '')) = p_from::text THEN
          v_x := v_x || jsonb_build_object('nextWho', p_to::text);
        END IF;
      ELSIF v_x ->> 'kind' = 'person' THEN
        v_id := lower(v_x ->> 'staff');
        IF v_id = p_from::text THEN
          v_id := p_to::text;
          v_x := v_x || jsonb_build_object('staff', v_id);
        END IF;
        CONTINUE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v_out) o
                               WHERE o ->> 'kind' = 'person' AND lower(o ->> 'staff') = v_id);
      END IF;
    ELSE
      CONTINUE WHEN jsonb_typeof(v_x) IS DISTINCT FROM 'string';
      v_id := lower(v_x #>> '{}');
      IF v_id = p_from::text THEN
        v_id := p_to::text;
      END IF;
      CONTINUE WHEN v_out @> jsonb_build_array(v_id);
      v_x := to_jsonb(v_id);
    END IF;
    v_out := v_out || jsonb_build_array(v_x);
  END LOOP;
  RETURN v_out;
END
$fn$;

REVOKE ALL ON FUNCTION public.mkt_level_ids(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_levels_next(jsonb, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_next_sync(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_level_ids(jsonb), public.mkt_levels_next(jsonb, uuid), public.mkt_next_sync(uuid, integer)
  TO service_role;

-- ── Statements swapped in production's bodies ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pg_temp.swap_check(p_sig regprocedure, p_old text, p_new text)
RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_src   text := (SELECT prosrc FROM pg_proc WHERE oid = p_sig);
  v_pat   text;
  v_found text;
  v_n     integer;
BEGIN
  IF strpos(v_src, p_new) > 0 THEN
    RETURN;  -- already swapped
  END IF;
  -- The old statement, every run of whitespace matching any run.
  v_pat := regexp_replace(regexp_replace(p_old, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'), '\s+', '\\s+', 'g');
  SELECT count(*) INTO v_n FROM regexp_matches(v_src, v_pat, 'g');
  IF v_n <> 1 THEN
    RAISE EXCEPTION '%: its statement is there % times, not once — production changed since this migration was written', p_sig, v_n;
  END IF;
  v_found := (regexp_match(v_src, '(' || v_pat || ')'))[1];
  EXECUTE replace(pg_get_functiondef(p_sig), v_found, p_new);
END
$fn$;

-- mkt_stage_decide: named on the level is what lets somebody decide — Marketing · Approve, or Edit (the team's).
SELECT pg_temp.swap_check('public.mkt_stage_decide(uuid,boolean,text)',
  $q$PERFORM public.mkt_need(ARRAY['marketing.approve'], 'Approving is not open to your account.');$q$,
  $q$PERFORM public.mkt_need(ARRAY['marketing.approve', 'marketing.edit'], 'Approving is not open to your account.');$q$);

-- mkt_stage_submit: the next stage's person set on this stage's levels (after the pick), then the first level with
-- somebody on it now.
SELECT pg_temp.swap_check('public.mkt_stage_submit(uuid,uuid)',
  $q$-- The first level with somebody on it.
  LOOP
    v_first := public.mkt_level_at(v_s.appr, v_lvl);
    EXIT WHEN v_first IS NULL OR jsonb_array_length(v_first -> 'ids') > 0;$q$,
  $q$-- The next stage's person on its levels (2026-11-14), then the first level with somebody on it.
  PERFORM public.mkt_next_sync(v_p.id, v_s.idx);
  v_s.appr := (SELECT s.appr FROM public.mkt_stages s WHERE s.project_id = v_p.id AND s.idx = v_s.idx);
  LOOP
    v_first := public.mkt_level_at(v_s.appr, v_lvl);
    EXIT WHEN v_first IS NULL OR cardinality(public.mkt_level_ids(v_first)) > 0;$q$);

-- mkt_level_ok: the next level with somebody on it now.
SELECT pg_temp.swap_check('public.mkt_level_ok(uuid,text)',
  $q$EXIT WHEN v_next IS NULL OR jsonb_array_length(v_next -> 'ids') > 0;$q$,
  $q$EXIT WHEN v_next IS NULL OR cardinality(public.mkt_level_ids(v_next)) > 0;$q$);

-- ⇄ Reassign: the stage before approves through 'next' — its levels follow the new person.
SELECT pg_temp.swap_check('public.mkt_stage_reassign(uuid,integer,uuid,text)',
  $q$PERFORM public.mkt_log(v_p.id, 'reassigned', v_s.idx, v_s.name, v_from || ' → ' || v_to, v_reason);$q$,
  $q$PERFORM public.mkt_next_sync(v_p.id, v_s.idx - 1);
  PERFORM public.mkt_log(v_p.id, 'reassigned', v_s.idx, v_s.name, v_from || ' → ' || v_to, v_reason);$q$);

-- A plan saved: every stage's 'next' follows the people it now names.
SELECT pg_temp.swap_check('public.mkt_deliverable_plan(uuid,jsonb)',
  $q$RETURN jsonb_build_object('id', v_p.id, 'track', v_p.track_id, 'reassigned', v_hands);$q$,
  $q$PERFORM public.mkt_next_sync(v_p.id);
  RETURN jsonb_build_object('id', v_p.id, 'track', v_p.track_id, 'reassigned', v_hands);$q$);

-- mkt_workflow_check: an approver is anybody on the team; 'next' on any stage but the last.
SELECT pg_temp.swap_check('public.mkt_workflow_check(jsonb,boolean,boolean)',
  $q$v_apprs  uuid[] := ARRAY(SELECT r.staff_id FROM public.mkt_roster() r
                            WHERE upper(coalesce(r.title, '')) LIKE '%MARKETING MANAGER%' OR upper(coalesce(r.title, '')) LIKE '%DIRECTOR%');$q$,
  $q$v_apprs  uuid[] := ARRAY(SELECT r.staff_id FROM public.mkt_roster() r);  -- anybody on the team (2026-11-14)$q$);
SELECT pg_temp.swap_check('public.mkt_workflow_check(jsonb,boolean,boolean)',
  $q$RAISE EXCEPTION 'Stage %: an approver who is not a Marketing manager or a Director on the team.', i + 1 USING ERRCODE = '22023';$q$,
  $q$RAISE EXCEPTION 'Stage %: an approver who is not on Marketing''s team.', i + 1 USING ERRCODE = '22023';$q$);
SELECT pg_temp.swap_check('public.mkt_workflow_check(jsonb,boolean,boolean)',
  $q$IF v_x IN ('pic', 'assign') THEN
            NULL;$q$,
  $q$IF v_x = 'next' THEN
            IF i = v_n - 1 THEN
              RAISE EXCEPTION 'Stage %: the last stage has no next stage to approve it.', i + 1 USING ERRCODE = '22023';
            END IF;
          ELSIF v_x IN ('pic', 'assign') THEN
            NULL;$q$);

-- mkt_wf_publish_ready: anybody on the team kept as an approver; 'next' kept but on the last stage.
SELECT pg_temp.swap_check('public.mkt_wf_publish_ready(jsonb,jsonb,boolean)',
  $q$v_apprs  text[] := ARRAY(SELECT lower(r.staff_id::text) FROM public.mkt_roster() r
                            WHERE upper(coalesce(r.title, '')) LIKE '%MARKETING MANAGER%' OR upper(coalesce(r.title, '')) LIKE '%DIRECTOR%');$q$,
  $q$v_apprs  text[] := ARRAY(SELECT lower(r.staff_id::text) FROM public.mkt_roster() r);  -- anybody on the team (2026-11-14)$q$);
SELECT pg_temp.swap_check('public.mkt_wf_publish_ready(jsonb,jsonb,boolean)',
  $q$WHERE x IN ('pic', 'assign') OR (x ~ v_uuid AND lower(x) = ANY (v_apprs))), '[]'::jsonb);$q$,
  $q$WHERE x IN ('pic', 'assign') OR (x = 'next' AND i < jsonb_array_length(p_stages) - 1)
                                 OR (x ~ v_uuid AND lower(x) = ANY (v_apprs))), '[]'::jsonb);$q$);

NOTIFY pgrst, 'reload schema';
