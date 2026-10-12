-- ============================================================================
-- 20261013160000_member_food_claim_hardening.sql
-- The food claim after its review (2026-10-13, the same day as 20261013150000).
-- ============================================================================
--
-- 1. A day already claimed is refused when the claim is PREPARED, not only when it is sent. A food
--    claim HR sent back is turned into a draft by member_prepare_request before member_submit_request
--    checks its days, so a refusal there left it a draft no list shows and nobody could revise, cancel
--    or decide. The check is its own function now, `member_food_claim_clash(staff, days, except)`
--    (the same lock per person), asked by prepare before anything is written and by submit again —
--    the last word. And a claim a refused send still left a draft (its claims row pending) may be
--    revised again, as a returned one is.
-- 2. The title check holds for NULL (`IS NOT TRUE` — CLAUDE.md: a guard must hold for somebody who has
--    none) and asks the member's SEAT title in Fair only — what the app shows and asks (`foodOpenTo`);
--    the company-title fallback is gone (every live Fair seat has a title on 2026-10-13).
-- 3. The fair's days are the booth's own first — the ERP's Sales Attending dates the app's tiles show
--    (`claimWeeks` → the history's `weeks`) — then the portal fair's, then its weekend's.
--
-- member_claim_food_detail and member_food_claim_check are this feature's own (20261013150000), their
-- bodies md5-equal to production's (19f0dbad… / a975eb59…), replaced whole. member_prepare_request:
-- production's body (f7720621…), three statements swapped (pg_temp.swap_check). No comments inside
-- the bodies.

CREATE OR REPLACE FUNCTION public.member_food_claim_clash(p_staff uuid, p_days jsonb, p_except uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_taken text;
BEGIN
 IF p_staff IS NULL THEN RETURN; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('member_food_claim:'||p_staff::text));
 SELECT string_agg(to_char(x.d,'FMDD Mon'),', ' ORDER BY x.d) INTO v_taken
  FROM (SELECT DISTINCT (o_day#>>'{}')::date AS d
          FROM public.member_requests o
         CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(o.detail->'days')='array' THEN o.detail->'days' ELSE '[]'::jsonb END) o_day
         WHERE o.staff_id=p_staff AND o.id IS DISTINCT FROM p_except AND o.kind='claim' AND o.detail->>'claimType'='food'
           AND o.status NOT IN ('draft','withdrawn','rejected')
           AND (o_day#>>'{}') IN (SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(p_days)='array' THEN p_days ELSE '[]'::jsonb END))) x;
 IF v_taken IS NOT NULL THEN
  RAISE EXCEPTION 'Food is already claimed for %. Untick those days and send it again.', v_taken;
 END IF;
END
$function$;

REVOKE ALL ON FUNCTION public.member_food_claim_clash(uuid, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_food_claim_clash(uuid, jsonb, uuid) TO service_role;
COMMENT ON FUNCTION public.member_food_claim_clash(uuid, jsonb, uuid) IS
  'A food claim''s days are its own (2026-10-13): refuses a day another live food claim (not a draft, cancelled or rejected) of the same person holds, under a lock per person. Asked by member_prepare_request and, again, member_submit_request (through member_food_claim_check).';

CREATE OR REPLACE FUNCTION public.member_food_claim_check(p_request uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r public.member_requests%ROWTYPE;
BEGIN
 SELECT * INTO r FROM public.member_requests WHERE id=p_request;
 IF NOT FOUND OR r.kind<>'claim' OR coalesce(r.detail->>'claimType','')<>'food' THEN RETURN; END IF;
 PERFORM public.member_food_claim_clash(r.staff_id, r.detail->'days', r.id);
END
$function$;

REVOKE ALL ON FUNCTION public.member_food_claim_check(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_food_claim_check(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.member_claim_food_detail(p_detail jsonb, p_staff uuid, p_sub uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date; v_rates public.member_claim_rates%ROWTYPE;
 v_week date; v_booth jsonb; v_fair uuid; v_venue_key text; v_venue text; v_fair_start date; v_fair_end date;
 v_title uuid; v_title_name text; v_days date[]; v_bad date;
BEGIN
 IF p_sub IS DISTINCT FROM public.member_food_claim_sub() THEN RAISE EXCEPTION 'A food claim is for the Fair sub-department only'; END IF;
 IF coalesce(p_detail->>'week','')!~'^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Choose the brand week the claim is for'; END IF;
 v_week := (p_detail->>'week')::date;
 SELECT * INTO v_rates FROM public.member_claim_rates WHERE id;
 SELECT h.title_id, t.name INTO v_title, v_title_name
  FROM public.comm_hierarchy h JOIN public.comm_schemes c ON c.id=h.scheme_id LEFT JOIN public.titles t ON t.id=h.title_id
  WHERE h.staff_id=p_staff AND c.sub_department_id=p_sub AND c.is_active
   AND h.effective_from<=v_today AND (h.effective_to IS NULL OR h.effective_to>=v_today)
   AND c.effective_from<=v_today AND (c.effective_to IS NULL OR c.effective_to>=v_today)
  ORDER BY c.effective_from DESC LIMIT 1;
 IF (v_title = ANY(coalesce(v_rates.food_title_ids,'{}'::uuid[]))) IS NOT TRUE THEN
  RAISE EXCEPTION 'A food claim is not open to %. HR picks the titles that may claim it.', coalesce(v_title_name,'your title');
 END IF;
 IF coalesce(v_rates.food_rate_per_day,0)<=0 THEN RAISE EXCEPTION 'HR has not set the food claim''s rate a day yet'; END IF;
 v_booth := public.member_claim_brand_week(p_staff, p_sub, v_week);
 IF v_booth IS NULL THEN
  RAISE EXCEPTION 'A food claim is for your own brand week, and you have none that weekend: the ERP''s Sales Attending lists you at no booth and you wrote no fair bills. Ask HR to add you in the ERP.';
 END IF;
 v_fair := nullif(v_booth->>'fairId','')::uuid;
 SELECT e.venue_key, coalesce(nullif(btrim(v.display_name),''), e.venue_key), e.start_date, e.end_date INTO v_venue_key, v_venue, v_fair_start, v_fair_end
  FROM public.comm_venue_events e LEFT JOIN public.comm_venues v ON v.venue_key=e.venue_key WHERE e.id=v_fair;
 IF v_fair IS NULL THEN
  v_venue_key := nullif(v_booth->>'venueKey','');
  v_venue := coalesce(nullif(v_booth->>'venue',''), v_venue_key);
 END IF;
 IF nullif(v_booth->>'start','') IS NOT NULL AND nullif(v_booth->>'end','') IS NOT NULL THEN
  v_fair_start := (v_booth->>'start')::date;
  v_fair_end := (v_booth->>'end')::date;
 END IF;
 IF v_fair_start IS NULL OR v_fair_end IS NULL OR v_fair_end<v_fair_start THEN v_fair_start := v_week; v_fair_end := v_week+2; END IF;
 IF jsonb_typeof(p_detail->'days') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Choose the days you claim food for'; END IF;
 IF jsonb_array_length(p_detail->'days') NOT BETWEEN 1 AND 31
  OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_detail->'days') d WHERE jsonb_typeof(d)<>'string' OR (d#>>'{}')!~'^\d{4}-\d{2}-\d{2}$') THEN
  RAISE EXCEPTION 'Choose the days you claim food for';
 END IF;
 SELECT array_agg(DISTINCT x.d ORDER BY x.d) INTO v_days FROM (SELECT (d#>>'{}')::date AS d FROM jsonb_array_elements(p_detail->'days') d) x;
 SELECT min(d) INTO v_bad FROM unnest(v_days) d WHERE d<v_fair_start OR d>v_fair_end;
 IF v_bad IS NOT NULL THEN
  RAISE EXCEPTION 'Food is claimed for the fair''s own days, % to %', to_char(v_fair_start,'FMDD Mon'), to_char(v_fair_end,'FMDD Mon YYYY');
 END IF;
 SELECT min(d) INTO v_bad FROM unnest(v_days) d WHERE d>v_today;
 IF v_bad IS NOT NULL THEN
  RAISE EXCEPTION '% has not come yet: a day is claimed once it has', to_char(v_bad,'FMDD Mon');
 END IF;
 RETURN jsonb_build_object('claimType','food','week',v_week,'notes',left(coalesce(p_detail->>'notes',''),1500),
  'fairId',v_fair,'brand',v_booth->>'brand','location',v_venue,'venueKey',v_venue_key,
  'brandWeekPicked',coalesce((v_booth->>'picked')::boolean,false),'brandWeekSource',v_booth->>'source',
  'category','Food','fairStart',v_fair_start,'fairEnd',v_fair_end,'titleName',v_title_name,
  'days',to_jsonb(v_days),'dayCount',cardinality(v_days),'rate',v_rates.food_rate_per_day,
  'amount',round(cardinality(v_days)*v_rates.food_rate_per_day,2));
END
$function$;

REVOKE ALL ON FUNCTION public.member_claim_food_detail(jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_claim_food_detail(jsonb, uuid, uuid) TO service_role;

-- ── member_prepare_request: production's body, three statements swapped ──────

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

-- 1. A day already claimed is refused before anything is written: a returned claim stays returned.
SELECT pg_temp.swap_check('public.member_prepare_request(text, uuid, jsonb, uuid, uuid)'::regprocedure,
  $old$v_title:=CASE WHEN p_detail->>'claimType'='food' THEN 'Food claim' WHEN coalesce((p_detail->>'planeTicket')::boolean,false) THEN 'Plane ticket claim'$old$,
  $new$IF p_detail->>'claimType'='food' THEN PERFORM public.member_food_claim_clash(v_staff, p_detail->'days', p_revision); END IF;
 v_title:=CASE WHEN p_detail->>'claimType'='food' THEN 'Food claim' WHEN coalesce((p_detail->>'planeTicket')::boolean,false) THEN 'Plane ticket claim'$new$);

-- 2. A claim a refused send left a draft (its claims row still pending) may be revised again.
SELECT pg_temp.swap_check('public.member_prepare_request(text, uuid, jsonb, uuid, uuid)'::regprocedure,
  $old$IF NOT (v_existing.status='submitted' AND p_kind IN ('waiting','replacement')) THEN RAISE EXCEPTION 'Request is no longer awaiting your information; refresh and retry'; END IF;$old$,
  $new$IF NOT (v_existing.status='submitted' AND p_kind IN ('waiting','replacement')) AND NOT (v_existing.status='draft' AND p_kind='claim' AND v_existing.claim_id IS NOT NULL) THEN RAISE EXCEPTION 'Request is no longer awaiting your information; refresh and retry'; END IF;$new$);

SELECT pg_temp.swap_check('public.member_prepare_request(text, uuid, jsonb, uuid, uuid)'::regprocedure,
  $old$WHERE id=p_revision AND created_by=auth.uid() AND (status='needs_info' OR (status='submitted' AND kind IN ('waiting','replacement'))) RETURNING id INTO v_id;$old$,
  $new$WHERE id=p_revision AND created_by=auth.uid() AND (status='needs_info' OR (status='submitted' AND kind IN ('waiting','replacement')) OR (status='draft' AND kind='claim' AND claim_id IS NOT NULL)) RETURNING id INTO v_id;$new$);

NOTIFY pgrst, 'reload schema';
