-- A region may be "No claim" (2026-11-01 — the user, circling Member services › Transport claim's Outstation box, its
-- Base and Rate per spot: "i need a option for select a spot that can be no claim for transport and airbnb, even though
-- it is not a base spot"). Until now only a region of 0 spots was local (KL), so a venue outside the Klang Valley that
-- HR does not pay for (AEON NILAI, AEON RAWANG …) had to be put in KL.
--
-- 1. member_claim_regions.no_claim — HR picks such regions under Outstation's Base. A fair in one is claimed as the
--    base's is: no outstation claim and no Airbnb stay, whatever its spots (kept as typed). A region flown to is never
--    one — its air ticket is the claim.
-- 2. member_admin_claim_settings (HR's panel) and member_claim_settings (the member's form) hand each region's noClaim.
-- 3. member_admin_save_claim_settings stores it: noClaim is ticked or not; absent = as it was (a page opened before this
--    keeps it); a region both flown to and no claim is refused.
-- 4. member_claim_detail_for refuses an outstation claim and an Airbnb stay for a fair in a no-claim region, first of
--    anything about its region — so a claim already sent keeps what it was worked out at.
--
-- Production's bodies, statements swapped (pg_temp.swap_check: refuses when production changed since; a second run
-- changes nothing); the file ends by checking the four bodies' md5 against what was tested
-- (tests/member-sql/validate-no-claim-regions.mjs). Comments stay outside the function bodies.

ALTER TABLE public.member_claim_regions ADD COLUMN IF NOT EXISTS no_claim boolean NOT NULL DEFAULT false;

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

-- ── 2. Each region's noClaim, read ──────────────────────────────────────────

SELECT pg_temp.swap_check('public.member_admin_claim_settings()'::regprocedure,
  $old$'active',g.is_active,'planeTicket',g.plane_ticket)$old$,
  $new$'active',g.is_active,'planeTicket',g.plane_ticket,'noClaim',g.no_claim)$new$);

SELECT pg_temp.swap_check('public.member_claim_settings()'::regprocedure,
  $old$'spots',g.spots,'planeTicket',g.plane_ticket)$old$,
  $new$'spots',g.spots,'planeTicket',g.plane_ticket,'noClaim',g.no_claim)$new$);

-- ── 3. …and saved ───────────────────────────────────────────────────────────

SELECT pg_temp.swap_check('public.member_admin_save_claim_settings(text, numeric, numeric, jsonb, integer, numeric, jsonb)'::regprocedure,
  $old$IF v_row ? 'planeTicket' AND jsonb_typeof(v_row->'planeTicket')<>'boolean' THEN RAISE EXCEPTION 'Air ticket is ticked or not'; END IF;$old$,
  $new$IF v_row ? 'planeTicket' AND jsonb_typeof(v_row->'planeTicket')<>'boolean' THEN RAISE EXCEPTION 'Air ticket is ticked or not'; END IF;
  IF v_row ? 'noClaim' AND jsonb_typeof(v_row->'noClaim')<>'boolean' THEN RAISE EXCEPTION 'No claim is ticked or not'; END IF;$new$);

SELECT pg_temp.swap_check('public.member_admin_save_claim_settings(text, numeric, numeric, jsonb, integer, numeric, jsonb)'::regprocedure,
  $old$INSERT INTO public.member_claim_regions (name, spots, sort_order, is_active, plane_ticket, updated_at, updated_by)
   VALUES (trim(v_row->>'name'), (v_row->>'spots')::integer, v_i, true, coalesce((v_row->>'planeTicket')::boolean,false), now(), auth.uid()) RETURNING id INTO v_id;$old$,
  $new$INSERT INTO public.member_claim_regions (name, spots, sort_order, is_active, plane_ticket, no_claim, updated_at, updated_by)
   VALUES (trim(v_row->>'name'), (v_row->>'spots')::integer, v_i, true, coalesce((v_row->>'planeTicket')::boolean,false), coalesce((v_row->>'noClaim')::boolean,false), now(), auth.uid()) RETURNING id INTO v_id;$new$);

SELECT pg_temp.swap_check('public.member_admin_save_claim_settings(text, numeric, numeric, jsonb, integer, numeric, jsonb)'::regprocedure,
  $old$plane_ticket=CASE WHEN v_row ? 'planeTicket' THEN (v_row->>'planeTicket')::boolean ELSE plane_ticket END,$old$,
  $new$plane_ticket=CASE WHEN v_row ? 'planeTicket' THEN (v_row->>'planeTicket')::boolean ELSE plane_ticket END,
    no_claim=CASE WHEN v_row ? 'noClaim' THEN (v_row->>'noClaim')::boolean ELSE no_claim END,$new$);

SELECT pg_temp.swap_check('public.member_admin_save_claim_settings(text, numeric, numeric, jsonb, integer, numeric, jsonb)'::regprocedure,
  $old$IF v_id=ANY(v_keep) THEN RAISE EXCEPTION 'Two regions share the name %', trim(v_row->>'name'); END IF;$old$,
  $new$IF v_id=ANY(v_keep) THEN RAISE EXCEPTION 'Two regions share the name %', trim(v_row->>'name'); END IF;
  IF EXISTS (SELECT 1 FROM public.member_claim_regions WHERE id=v_id AND no_claim AND plane_ticket) THEN
   RAISE EXCEPTION '% is flown to, so it cannot be set as no claim', trim(v_row->>'name');
  END IF;$new$);

-- ── 4. A fair in a no-claim region: neither claim ───────────────────────────

SELECT pg_temp.swap_check('public.member_claim_detail_for(jsonb, uuid, uuid)'::regprocedure,
  $old$IF NOT FOUND THEN RAISE EXCEPTION 'HR has not set the region for % yet, so an outstation claim for it cannot be sent.', v_venue; END IF;$old$,
  $new$IF NOT FOUND THEN RAISE EXCEPTION 'HR has not set the region for % yet, so an outstation claim for it cannot be sent.', v_venue; END IF;
  IF v_region.no_claim THEN RAISE EXCEPTION '% is in %, which HR set as no claim, so there is no outstation claim', v_venue, v_region.name; END IF;$new$);

SELECT pg_temp.swap_check('public.member_claim_detail_for(jsonb, uuid, uuid)'::regprocedure,
  $old$IF NOT FOUND THEN RAISE EXCEPTION 'HR has not set the region for % yet, so an Airbnb claim for it cannot be sent.', v_venue; END IF;$old$,
  $new$IF NOT FOUND THEN RAISE EXCEPTION 'HR has not set the region for % yet, so an Airbnb claim for it cannot be sent.', v_venue; END IF;
 IF v_region.no_claim THEN RAISE EXCEPTION '% is in %, which HR set as no claim, so there is no Airbnb claim', v_venue, v_region.name; END IF;$new$);

-- ── What runs now is what was tested ────────────────────────────────────────
-- The PGlite check (tests/member-sql/validate-no-claim-regions.mjs, over production's bodies) and a dry run on
-- production that rolled back gave these same four bodies; anything else refuses the whole migration.
DO $do$
DECLARE
  v_bad text;
BEGIN
  SELECT string_agg(x.sig || ' ' || coalesce(md5(replace(p.prosrc, E'\r', '')), 'missing'), '; ') INTO v_bad
    FROM (VALUES
      ('public.member_admin_claim_settings()', 'TBD'),
      ('public.member_claim_settings()', 'TBD'),
      ('public.member_admin_save_claim_settings(text, numeric, numeric, jsonb, integer, numeric, jsonb)', 'TBD'),
      ('public.member_claim_detail_for(jsonb, uuid, uuid)', 'TBD')
    ) AS x(sig, want)
    LEFT JOIN pg_proc p ON p.oid = to_regprocedure(x.sig)
   WHERE md5(replace(p.prosrc, E'\r', '')) IS DISTINCT FROM x.want;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Not the bodies that were tested: %', v_bad;
  END IF;
END
$do$;

NOTIFY pgrst, 'reload schema';
