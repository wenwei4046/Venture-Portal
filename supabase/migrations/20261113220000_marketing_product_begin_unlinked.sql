-- Marketing — a product item with no workflow makes no deliverable, kept through the Workflow Builder 2a engine
-- (2026-11-13). The user ("不一定要 link workflow 才能 public") had this built twice the same day: #1042's
-- 20261113160000_marketing_product_wf_optional (applied to production — publishing asks no workflow, a linked one is
-- published first; mkt_product_begin makes deliverables only for items with a workflow and starts even when none has
-- one) and this branch. #1042's is the one that stands. But 20261113210000 (the engine) rewrites mkt_product_begin
-- WHOLE from the body before #1042 — so this migration puts #1042's rule back into THAT body, statement by statement,
-- and says what was left out:
--   the deliverables are counted and made over the items with a workflow only (#1042's); no refusal when none has one
--   (#1042's — "The product includes nothing to make." goes too); the trail's `work started` carries data.notMade (each
--   item left out, "Reel ×2") and a line of its own, `not made` ("Reel ×2 — no workflow linked"); the project's owner is
--   told when somebody else started the work (mkt_notify never tells the caller); the result carries `notMade`.
-- mkt_product_groups is #1042's on production and is not touched here. mkt_product_run_next makes each month from the
-- deliverables of the month before, so an item left out never comes back — unchanged.
-- Every change is pg_temp.swap_check (whitespace-blind, exactly once; already swapped → left), applied to the body
-- 20261113210000 leaves. PGlite: tests/member-sql/validate-marketing-product-basics.mjs.

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

-- ── mkt_product_begin: an item with no workflow makes no deliverable (#1042's rule, on the engine's body) ───────────────────────────────────────────
SELECT pg_temp.swap_check('public.mkt_product_begin(uuid,integer)',
  $q$v_run   integer;
BEGIN$q$,
  $q$v_run   integer;
  v_skip  jsonb := '[]'::jsonb;  -- the items not made: no workflow
BEGIN$q$);
SELECT pg_temp.swap_check('public.mkt_product_begin(uuid,integer)',
  $q$v_total := coalesce((SELECT sum((it ->> 'qty')::integer)
                         FROM jsonb_array_elements(v_pv.groups) g, jsonb_array_elements(coalesce(g -> 'items', '[]'::jsonb)) it
                        WHERE coalesce(it ->> 'qty', '') ~ '^[0-9]{1,3}$'), 0);
  IF v_total = 0 THEN
    RAISE EXCEPTION 'The product includes nothing to make.' USING ERRCODE = '22023';
  END IF;$q$,
  $q$v_skip := coalesce((SELECT jsonb_agg(btrim(coalesce(it ->> 'name', ''))
                                         || CASE WHEN (it ->> 'qty')::integer > 1 THEN ' ×' || (it ->> 'qty') ELSE '' END
                                         ORDER BY g.o, i.o)
                         FROM jsonb_array_elements(v_pv.groups) WITH ORDINALITY g(v, o),
                              jsonb_array_elements(coalesce(g.v -> 'items', '[]'::jsonb)) WITH ORDINALITY i(it, o)
                        WHERE CASE WHEN coalesce(it ->> 'qty', '') ~ '^[0-9]{1,3}$' THEN (it ->> 'qty')::integer ELSE 0 END > 0
                          AND coalesce(it ->> 'workflow', '') = ''), '[]'::jsonb);
  v_total := coalesce((SELECT sum((it ->> 'qty')::integer)
                         FROM jsonb_array_elements(v_pv.groups) g, jsonb_array_elements(coalesce(g -> 'items', '[]'::jsonb)) it
                        WHERE coalesce(it ->> 'qty', '') ~ '^[0-9]{1,3}$'
                          AND coalesce(it ->> 'workflow', '') <> ''), 0);
  -- An item with no workflow makes no deliverable; a product with none linked still starts — it makes nothing (#1042).$q$);
SELECT pg_temp.swap_check('public.mkt_product_begin(uuid,integer)',
  $q$CONTINUE WHEN v_qty = 0;$q$,
  $q$CONTINUE WHEN v_qty = 0;
      CONTINUE WHEN coalesce(v_it ->> 'workflow', '') = '';$q$);
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
                'Not made: ' || jsonb_array_length(v_skip) || ' item' || CASE WHEN jsonb_array_length(v_skip) = 1 THEN '' ELSE 's' END
                  || ' with no workflow',
                v_p.track_id || ' · ' || (SELECT string_agg(x, ', ') FROM jsonb_array_elements_text(v_skip) x), 'task');
    END IF;
  END IF;$q$);
SELECT pg_temp.swap_check('public.mkt_product_begin(uuid,integer)',
  $q$RETURN jsonb_build_object('id', v_p.id, 'track', v_p.track_id, 'deliverables', v_n);$q$,
  $q$RETURN jsonb_build_object('id', v_p.id, 'track', v_p.track_id, 'deliverables', v_n, 'notMade', v_skip);$q$);

NOTIFY pgrst, 'reload schema';
