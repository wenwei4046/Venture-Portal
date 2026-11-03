-- Air ticket, in every word (2026-11-01 — the user, told that the new column on *Who can claim transport* says "Air
-- ticket claim" while the regions table and the Revenue app still said "Plane ticket": "go with the same name Air
-- ticket claim").
--
-- What a person reads, from now on and on the two flown-to claims already sent:
-- 1. member_claim_detail_for: *Add the air ticket's invoice*, *Enter the air ticket's price, as its invoice shows*, and
--    the claim's category 'Air ticket' (was 'Plane ticket').
-- 2. member_prepare_request: a flown-to claim is titled *Air ticket claim · <venue>* (was *Plane ticket claim*).
-- 3. member_submit_request: its claim line for HR and Finance reads *Air ticket · Klang Valley → Sabah · …* (was
--    *Plane ticket · …*).
-- 4. member_transport_claim_open: *An air ticket claim is not open to …*, *… may claim an air ticket only.*
-- 5. member_admin_save_claim_settings: *Air ticket is ticked or not*.
-- 6. The flown-to claims sent before this (RQ-2610-018 and RQ-2610-025, 2026-10-31, both waiting for HR): their title,
--    their category and their claim line while it is pending say Air ticket too. Wording only — no amount, invoice or
--    status moves. A title change pings the sender's bell to read again (revenue_bell_ping): no notice, and no entry in
--    the request's history (member_request_audit records status changes only). A claim no longer pending keeps the
--    words its voucher was made with.
--
-- Names in code stay: plane_ticket (the region's column), planeTicket (the claim's flag), the gate's part 'plane'.
-- Production's bodies, statements swapped (pg_temp.swap_check: refuses when production changed since; a second run
-- changes nothing); the file ends by checking the five bodies' md5 against what was tested. Comments stay outside the
-- function bodies.

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

-- ── 1. A flown-to claim worked out ──────────────────────────────────────────

SELECT pg_temp.swap_check('public.member_claim_detail_for(jsonb, uuid, uuid)'::regprocedure,
  $old$RAISE EXCEPTION 'Add the plane ticket''s invoice';$old$,
  $new$RAISE EXCEPTION 'Add the air ticket''s invoice';$new$);

SELECT pg_temp.swap_check('public.member_claim_detail_for(jsonb, uuid, uuid)'::regprocedure,
  $old$RAISE EXCEPTION 'Enter the plane ticket''s price, as its invoice shows';$old$,
  $new$RAISE EXCEPTION 'Enter the air ticket''s price, as its invoice shows';$new$);

SELECT pg_temp.swap_check('public.member_claim_detail_for(jsonb, uuid, uuid)'::regprocedure,
  $old$jsonb_build_object('category','Plane ticket',$old$,
  $new$jsonb_build_object('category','Air ticket',$new$);

-- ── 2. Its title ────────────────────────────────────────────────────────────

SELECT pg_temp.swap_check('public.member_prepare_request(text, uuid, jsonb, uuid, uuid)'::regprocedure,
  $old$THEN 'Plane ticket claim'$old$,
  $new$THEN 'Air ticket claim'$new$);

-- ── 3. Its claim line ───────────────────────────────────────────────────────

SELECT pg_temp.swap_check('public.member_submit_request(uuid)'::regprocedure,
  $old$concat('Plane ticket · ',$old$,
  $new$concat('Air ticket · ',$new$);

-- ── 4. Who may send it ──────────────────────────────────────────────────────

SELECT pg_temp.swap_check('public.member_transport_claim_open(uuid, uuid, text)'::regprocedure,
  $old$'A plane ticket claim is not open to %. HR picks the titles that may claim it.'$old$,
  $new$'An air ticket claim is not open to %. HR picks the titles that may claim it.'$new$);

SELECT pg_temp.swap_check('public.member_transport_claim_open(uuid, uuid, text)'::regprocedure,
  $old$'% may claim a plane ticket only. HR picks the titles that may claim the rest.'$old$,
  $new$'% may claim an air ticket only. HR picks the titles that may claim the rest.'$new$);

-- ── 5. HR's regions, refused ────────────────────────────────────────────────

SELECT pg_temp.swap_check('public.member_admin_save_claim_settings(text, numeric, numeric, jsonb, integer, numeric, jsonb)'::regprocedure,
  $old$RAISE EXCEPTION 'Plane ticket is ticked or not'$old$,
  $new$RAISE EXCEPTION 'Air ticket is ticked or not'$new$);

-- ── 6. The flown-to claims already sent ─────────────────────────────────────

UPDATE public.member_requests
   SET title = 'Air ticket claim' || substr(title, length('Plane ticket claim') + 1)
 WHERE kind = 'claim' AND title LIKE 'Plane ticket claim%';

UPDATE public.member_requests
   SET detail = jsonb_set(detail, '{category}', '"Air ticket"'::jsonb)
 WHERE kind = 'claim' AND detail->>'category' = 'Plane ticket';

UPDATE public.claims c
   SET description = 'Air ticket · ' || substr(c.description, length('Plane ticket · ') + 1)
 WHERE c.status = 'pending' AND c.description LIKE 'Plane ticket · %'
   AND EXISTS (SELECT 1 FROM public.member_requests r WHERE r.claim_id = c.id);

-- ── What runs now is what was tested ────────────────────────────────────────
-- The PGlite check (tests/member-sql/validate-air-ticket-wording.mjs, over production's bodies) and a dry run on
-- production that rolled back gave these same five bodies; anything else refuses the whole migration.
DO $do$
DECLARE
  v_bad text;
BEGIN
  SELECT string_agg(x.sig || ' ' || coalesce(md5(replace(p.prosrc, E'\r', '')), 'missing'), '; ') INTO v_bad
    FROM (VALUES
      ('public.member_claim_detail_for(jsonb, uuid, uuid)', 'b71ef189b2a191caba6979a0a183f50f'),
      ('public.member_prepare_request(text, uuid, jsonb, uuid, uuid)', '1a764a63ee0148b6713faed1f91a9888'),
      ('public.member_submit_request(uuid)', '66cd30a907ccc7727d90a8714fb064f5'),
      ('public.member_transport_claim_open(uuid, uuid, text)', '93be4fca66dd68fd34976a64059c67fd'),
      ('public.member_admin_save_claim_settings(text, numeric, numeric, jsonb, integer, numeric, jsonb)', '95c21350bba631f035fcc2c07991a612')
    ) AS x(sig, want)
    LEFT JOIN pg_proc p ON p.oid = to_regprocedure(x.sig)
   WHERE md5(replace(p.prosrc, E'\r', '')) IS DISTINCT FROM x.want;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Not the bodies that were tested: %', v_bad;
  END IF;
END
$do$;

NOTIFY pgrst, 'reload schema';
