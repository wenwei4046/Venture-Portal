-- Marketing Product Builder — a product publishes on its basics (2026-11-13, the user's decision): a name, a type,
-- something included (a category with a named action of quantity 1 or more), a list price above 0 and the day it takes
-- effect. An action no longer has to be linked to a PUBLISHED workflow: it may stay unlinked (the version keeps
-- `workflow: null` for it) or be linked to a workflow not yet published (the version keeps the workflow's id and no
-- `workflowVersion`). The builder still WARNS about such an action; it never refuses for it.
--
-- Kept: the intake minutes template must be picked and published. A product project's first step is its intake meeting —
-- mkt_product_start opens the minutes on the version's intake_version — so a version without one could not start a
-- project at all; that is the project's own start, not a link between templates.
--
-- The running side (an action with no published workflow on the project's version):
--   mkt_product_begin (Plan assignments →) makes no deliverable for it — never a deliverable with no stages, which
--   nothing could plan, work or close (a one-time project would never settle). The deliverables are numbered over the
--   ones made only; the trail gets `work started` with data.notMade (each such action, "Reel ×2") and a line of its
--   own, `not made` (its reason: "Reel ×2 — no workflow linked"); the project's owner is told when somebody else
--   started the work (mkt_notify never tells the caller), and the result carries `notMade` too. When NOTHING the
--   version includes runs on a published workflow, the work does not start — refused in words that say why (the
--   project stays approved; a new version with the actions linked starts new projects).
--   mkt_product_run_next (a recurring product's months) makes each month from the deliverables of the month before,
--   so a skipped action is never made in a later month either and nothing in it reads the version's actions — left
--   as 20261113210000 swapped it (checked by the PGlite run below: the second month made from the first).
--
-- Production's bodies (project gixpptmfuryskbwkmiwz, read 2026-11-13 — md5(prosrc)):
--   mkt_product_groups   b42bba32449b01a686b548e44d457488  (statements swapped in place below)
--   mkt_product_publish  1afc61ff12408ba06513b6d1e4d028cb  (read, nothing to change: its own checks are the basics,
--                                                            the intake and the day; the links were mkt_product_groups')
--   mkt_product_begin    57b99e183758aa2802a1a0f71a4152d6  (production's — rewritten whole by 20261113210000, which
--                                                            runs first; the statements below are swapped in THAT body)
--   mkt_product_run_next 4b37e90833b30eb2724da9d8f6e7e6b9  (read, nothing to change — see above)
-- Every change is pg_temp.swap_check (production's statement, whitespace-blind, exactly once; already swapped → left),
-- so nothing else in those bodies moves. PGlite: tests/member-sql/validate-marketing-product-basics.mjs.

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

-- ── mkt_product_groups: publishing no longer asks for a published workflow on each action ─────────────────────────
SELECT pg_temp.swap_check('public.mkt_product_groups(jsonb,boolean)',
  $q$IF p_publish AND v_wf IS NULL THEN
        RAISE EXCEPTION '"%": link a workflow.', v_name USING ERRCODE = '22023';
      END IF;
      IF p_publish AND v_ver IS NULL THEN
        RAISE EXCEPTION '"%": its workflow is not published yet.', v_name USING ERRCODE = '22023';
      END IF;$q$,
  $q$-- An action publishes unlinked, or linked to a workflow not published yet (2026-11-13 — the user: a product
      -- publishes on its basics); its work is not made (mkt_product_begin).$q$);
-- Its version keeps `workflow: null` for an unlinked action (strip_nulls would leave the key out).
SELECT pg_temp.swap_check('public.mkt_product_groups(jsonb,boolean)',
  $q$v_items := v_items || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'name', v_name, 'qty', v_qty, 'price', v_price, 'workflow', v_wf,
        'workflowVersion', CASE WHEN p_publish THEN v_ver END)));$q$,
  $q$v_items := v_items || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'name', v_name, 'qty', v_qty, 'price', v_price, 'workflow', v_wf,
        'workflowVersion', CASE WHEN p_publish THEN v_ver END))
        || CASE WHEN p_publish AND v_wf IS NULL THEN '{"workflow": null}'::jsonb ELSE '{}'::jsonb END);$q$);

-- ── mkt_product_begin: an action with no published workflow is not made ───────────────────────────────────────────
SELECT pg_temp.swap_check('public.mkt_product_begin(uuid,integer)',
  $q$v_run   integer;
BEGIN$q$,
  $q$v_run   integer;
  v_skip  jsonb := '[]'::jsonb;  -- the actions not made: no published workflow on this version
BEGIN$q$);
SELECT pg_temp.swap_check('public.mkt_product_begin(uuid,integer)',
  $q$v_total := coalesce((SELECT sum((it ->> 'qty')::integer)
                         FROM jsonb_array_elements(v_pv.groups) g, jsonb_array_elements(coalesce(g -> 'items', '[]'::jsonb)) it
                        WHERE coalesce(it ->> 'qty', '') ~ '^[0-9]{1,3}$'), 0);$q$,
  $q$v_skip := coalesce((SELECT jsonb_agg(btrim(coalesce(it ->> 'name', ''))
                                         || CASE WHEN (it ->> 'qty')::integer > 1 THEN ' ×' || (it ->> 'qty') ELSE '' END
                                         ORDER BY g.o, i.o)
                         FROM jsonb_array_elements(v_pv.groups) WITH ORDINALITY g(v, o),
                              jsonb_array_elements(coalesce(g.v -> 'items', '[]'::jsonb)) WITH ORDINALITY i(it, o)
                        WHERE CASE WHEN coalesce(it ->> 'qty', '') ~ '^[0-9]{1,3}$' THEN (it ->> 'qty')::integer ELSE 0 END > 0
                          AND (coalesce(it ->> 'workflow', '') = '' OR coalesce(it ->> 'workflowVersion', '') !~ '^[0-9]+$')), '[]'::jsonb);
  v_total := coalesce((SELECT sum((it ->> 'qty')::integer)
                         FROM jsonb_array_elements(v_pv.groups) g, jsonb_array_elements(coalesce(g -> 'items', '[]'::jsonb)) it
                        WHERE coalesce(it ->> 'qty', '') ~ '^[0-9]{1,3}$'
                          AND coalesce(it ->> 'workflow', '') <> '' AND coalesce(it ->> 'workflowVersion', '') ~ '^[0-9]+$'), 0);
  IF v_total = 0 AND jsonb_array_length(v_skip) > 0 THEN
    RAISE EXCEPTION 'Nothing on v% of this product runs on a published workflow yet — link its actions in the Product Builder and publish it; new projects start on that version.',
      v_p.product_version USING ERRCODE = '22023';
  END IF;$q$);
SELECT pg_temp.swap_check('public.mkt_product_begin(uuid,integer)',
  $q$CONTINUE WHEN v_qty = 0;$q$,
  $q$CONTINUE WHEN v_qty = 0;
      CONTINUE WHEN coalesce(v_it ->> 'workflow', '') = '' OR coalesce(v_it ->> 'workflowVersion', '') !~ '^[0-9]+$';$q$);
SELECT pg_temp.swap_check('public.mkt_product_begin(uuid,integer)',
  $q$PERFORM public.mkt_log(v_p.id, 'work started', p_data => jsonb_build_object('deliverables', v_n)
            || CASE WHEN v_run IS NOT NULL THEN jsonb_build_object('runDay', v_run) ELSE '{}'::jsonb END);$q$,
  $q$PERFORM public.mkt_log(v_p.id, 'work started', p_data => jsonb_build_object('deliverables', v_n)
            || CASE WHEN v_run IS NOT NULL THEN jsonb_build_object('runDay', v_run) ELSE '{}'::jsonb END
            || CASE WHEN jsonb_array_length(v_skip) > 0 THEN jsonb_build_object('notMade', v_skip) ELSE '{}'::jsonb END);
  IF jsonb_array_length(v_skip) > 0 THEN
    PERFORM public.mkt_log(v_p.id, 'not made',
              p_reason => (SELECT string_agg(x, ', ') FROM jsonb_array_elements_text(v_skip) x) || ' — no workflow linked',
              p_data => jsonb_build_object('notMade', v_skip));
    IF v_p.owner_staff IS NOT NULL THEN
      PERFORM public.mkt_notify(v_p.owner_staff, v_p.id,
                'Not made: ' || jsonb_array_length(v_skip) || ' action' || CASE WHEN jsonb_array_length(v_skip) = 1 THEN '' ELSE 's' END
                  || ' with no workflow',
                v_p.track_id || ' · ' || (SELECT string_agg(x, ', ') FROM jsonb_array_elements_text(v_skip) x), 'task');
    END IF;
  END IF;$q$);
SELECT pg_temp.swap_check('public.mkt_product_begin(uuid,integer)',
  $q$RETURN jsonb_build_object('id', v_p.id, 'track', v_p.track_id, 'deliverables', v_n);$q$,
  $q$RETURN jsonb_build_object('id', v_p.id, 'track', v_p.track_id, 'deliverables', v_n, 'notMade', v_skip);$q$);

NOTIFY pgrst, 'reload schema';
