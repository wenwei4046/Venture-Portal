-- ============================================================================
-- 20261013200000_member_food_claim_by_month.sql
-- A food claim is sent for a MONTH (2026-10-13 — the user: "they will submit by total month, for every pax,
-- dont by week submit"; after a side note that a claim a brand week would leave HR a hundred to decide).
-- ============================================================================
--
-- One food claim a person a month: every brand week of that month they worked (the weekend's Friday in the
-- month — a fair of 30 Oct – 1 Nov is October's), and the days of each they worked. Sent once the month is
-- over (from the 1st of the next), so no day of it is still to come and nothing is left for a second claim.
-- What the phone sends: { claimType 'food', month 'YYYY-MM', weeks [{ week, days [...] }], notes }.
--
-- 1. `member_claim_food_detail` works the month out, week by week as before (the member's own brand week,
--    the booth's days, else the portal fair's, else the weekend's; Fair only; the seat's title among HR's,
--    IS NOT TRUE; the rate set) and stores { month, monthLabel, weeks [{ week, fairId, brand, location,
--    venueKey, source, fairStart, fairEnd, days }], days, dayCount, rate, amount = days × the rate }.
-- 2. `member_food_claim_taken(staff, detail, except)` (a lock per person) refuses a month another live food
--    claim of the same person has, and any day one holds — asked by member_prepare_request before anything
--    is written and by member_submit_request again (through member_food_claim_check). It replaces
--    member_food_claim_clash, which goes.
-- 3. The request is titled "Food claim · Oct 2026"; the claims row's line is `member_food_claim_line`:
--    "Food · 6 days × RM 20.00 · Oct 2026; MID VALLEY 2 Oct, 3 Oct, 4 Oct; IOI GECC 9 Oct, 10 Oct, 11 Oct".
--
-- No food claim had been sent when this was written (0 member requests in production). The two functions of
-- this feature are replaced whole (their bodies md5-equal to production's: food detail aab98f18…, check
-- 7f6f950f…); member_prepare_request (eb87b3c1…) and member_submit_request (522365ce…): production's bodies,
-- statements swapped by pg_temp.swap_check. No comments inside the bodies.

CREATE OR REPLACE FUNCTION public.member_claim_food_detail(p_detail jsonb, p_staff uuid, p_sub uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date; v_rates public.member_claim_rates%ROWTYPE;
 v_month date; v_label text; v_week jsonb; v_friday date; v_seen date[] := '{}'; v_booth jsonb; v_fair uuid; v_venue_key text;
 v_venue text; v_fair_start date; v_fair_end date; v_days date[]; v_all date[] := '{}'; v_weeks jsonb := '[]'::jsonb;
 v_title uuid; v_title_name text; v_bad date;
BEGIN
 IF p_sub IS DISTINCT FROM public.member_food_claim_sub() THEN RAISE EXCEPTION 'A food claim is for the Fair sub-department only'; END IF;
 IF coalesce(p_detail->>'month','')!~'^\d{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'Choose the month the food claim is for'; END IF;
 v_month := ((p_detail->>'month')||'-01')::date;
 v_label := to_char(v_month,'FMMon YYYY');
 IF v_today<(v_month+interval '1 month')::date THEN
  RAISE EXCEPTION 'Food for % is claimed once the month is over, from %', v_label, to_char((v_month+interval '1 month')::date,'FMDD Mon YYYY');
 END IF;
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
 IF jsonb_typeof(p_detail->'weeks') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Tick the days you worked at the fairs'; END IF;
 IF jsonb_array_length(p_detail->'weeks') NOT BETWEEN 1 AND 6 THEN RAISE EXCEPTION 'Tick the days you worked at the fairs'; END IF;
 FOR v_week IN SELECT w FROM jsonb_array_elements(p_detail->'weeks') w LOOP
  IF jsonb_typeof(v_week) IS DISTINCT FROM 'object' OR coalesce(v_week->>'week','')!~'^\d{4}-\d{2}-\d{2}$' THEN
   RAISE EXCEPTION 'Tick the days you worked at the fairs';
  END IF;
  v_friday := (v_week->>'week')::date;
  IF date_trunc('month',v_friday::timestamp)::date<>v_month THEN RAISE EXCEPTION 'The weekend of % is not one of %', to_char(v_friday,'FMDD Mon'), v_label; END IF;
  IF v_friday=ANY(v_seen) THEN RAISE EXCEPTION 'Tick the days you worked at the fairs'; END IF;
  v_seen := v_seen||v_friday;
  v_booth := public.member_claim_brand_week(p_staff, p_sub, v_friday);
  IF v_booth IS NULL THEN
   RAISE EXCEPTION 'You have no brand week the weekend of %: the ERP''s Sales Attending lists you at no booth and you wrote no fair bills. Ask HR to add you in the ERP.', to_char(v_friday,'FMDD Mon');
  END IF;
  v_fair := nullif(v_booth->>'fairId','')::uuid;
  v_venue_key := NULL; v_venue := NULL; v_fair_start := NULL; v_fair_end := NULL;
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
  IF v_fair_start IS NULL OR v_fair_end IS NULL OR v_fair_end<v_fair_start THEN v_fair_start := v_friday; v_fair_end := v_friday+2; END IF;
  IF jsonb_typeof(v_week->'days') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Tick the days you worked at the fairs'; END IF;
  IF jsonb_array_length(v_week->'days') NOT BETWEEN 1 AND 31
   OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_week->'days') d WHERE jsonb_typeof(d)<>'string' OR (d#>>'{}')!~'^\d{4}-\d{2}-\d{2}$') THEN
   RAISE EXCEPTION 'Tick the days you worked at the fairs';
  END IF;
  SELECT array_agg(DISTINCT x.d ORDER BY x.d) INTO v_days FROM (SELECT (d#>>'{}')::date AS d FROM jsonb_array_elements(v_week->'days') d) x;
  SELECT min(d) INTO v_bad FROM unnest(v_days) d WHERE d<v_fair_start OR d>v_fair_end;
  IF v_bad IS NOT NULL THEN
   RAISE EXCEPTION 'Food is claimed for the fair''s own days: % to % for the weekend of %', to_char(v_fair_start,'FMDD Mon'), to_char(v_fair_end,'FMDD Mon'), to_char(v_friday,'FMDD Mon');
  END IF;
  SELECT min(d) INTO v_bad FROM unnest(v_days) d WHERE d>v_today;
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION '% has not come yet: a day is claimed once it has', to_char(v_bad,'FMDD Mon'); END IF;
  IF v_all && v_days THEN RAISE EXCEPTION 'A day is in two weekends: tick each day once'; END IF;
  v_all := v_all||v_days;
  v_weeks := v_weeks||jsonb_build_array(jsonb_build_object('week',v_friday,'fairId',v_fair,'brand',v_booth->>'brand','location',v_venue,
   'venueKey',v_venue_key,'source',v_booth->>'source','fairStart',v_fair_start,'fairEnd',v_fair_end,'days',to_jsonb(v_days)));
 END LOOP;
 SELECT array_agg(d ORDER BY d) INTO v_all FROM unnest(v_all) d;
 RETURN jsonb_build_object('claimType','food','category','Food','month',to_char(v_month,'YYYY-MM'),'monthLabel',v_label,
  'notes',left(coalesce(p_detail->>'notes',''),1500),'titleName',v_title_name,
  'weeks',(SELECT jsonb_agg(w ORDER BY w->>'week') FROM jsonb_array_elements(v_weeks) w),
  'days',to_jsonb(v_all),'dayCount',cardinality(v_all),'rate',v_rates.food_rate_per_day,
  'amount',round(cardinality(v_all)*v_rates.food_rate_per_day,2));
END
$function$;

REVOKE ALL ON FUNCTION public.member_claim_food_detail(jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_claim_food_detail(jsonb, uuid, uuid) TO service_role;
COMMENT ON FUNCTION public.member_claim_food_detail(jsonb, uuid, uuid) IS
  'A food claim worked out (2026-10-13): a month, once it is over — each of its brand weeks the member worked (their own, Fair only) and the days of it ticked; the seat''s title among HR''s; days × HR''s rate a day. Called by member_claim_detail_for only.';

CREATE OR REPLACE FUNCTION public.member_food_claim_taken(p_staff uuid, p_detail jsonb, p_except uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_no text; v_taken text;
BEGIN
 IF p_staff IS NULL THEN RETURN; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('member_food_claim:'||p_staff::text));
 SELECT coalesce(o.request_no,'another request') INTO v_no FROM public.member_requests o
  WHERE o.staff_id=p_staff AND o.id IS DISTINCT FROM p_except AND o.kind='claim' AND o.detail->>'claimType'='food'
    AND o.status NOT IN ('draft','withdrawn','rejected') AND o.detail->>'month'=p_detail->>'month'
  ORDER BY o.created_at LIMIT 1;
 IF v_no IS NOT NULL THEN
  RAISE EXCEPTION 'Food for % is already claimed (%): a month is claimed once. Cancel that one to send it again.', coalesce(p_detail->>'monthLabel',p_detail->>'month'), v_no;
 END IF;
 SELECT string_agg(to_char(x.d,'FMDD Mon'),', ' ORDER BY x.d) INTO v_taken
  FROM (SELECT DISTINCT (o_day#>>'{}')::date AS d
          FROM public.member_requests o
         CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(o.detail->'days')='array' THEN o.detail->'days' ELSE '[]'::jsonb END) o_day
         WHERE o.staff_id=p_staff AND o.id IS DISTINCT FROM p_except AND o.kind='claim' AND o.detail->>'claimType'='food'
           AND o.status NOT IN ('draft','withdrawn','rejected')
           AND (o_day#>>'{}') IN (SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(p_detail->'days')='array' THEN p_detail->'days' ELSE '[]'::jsonb END))) x;
 IF v_taken IS NOT NULL THEN
  RAISE EXCEPTION 'Food is already claimed for %. Untick those days and send it again.', v_taken;
 END IF;
END
$function$;

REVOKE ALL ON FUNCTION public.member_food_claim_taken(uuid, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_food_claim_taken(uuid, jsonb, uuid) TO service_role;
COMMENT ON FUNCTION public.member_food_claim_taken(uuid, jsonb, uuid) IS
  'A food claim is the month''s only one, and its days its own (2026-10-13): refuses a month another live food claim (not a draft, cancelled or rejected) of the same person has, and any day one holds — under a lock per person. Asked by member_prepare_request and, again, member_submit_request (member_food_claim_check).';

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
 PERFORM public.member_food_claim_taken(r.staff_id, r.detail, r.id);
END
$function$;

REVOKE ALL ON FUNCTION public.member_food_claim_check(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_food_claim_check(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.member_food_claim_line(p_detail jsonb)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
 SELECT concat('Food · ',p_detail->>'dayCount',CASE WHEN p_detail->>'dayCount'='1' THEN ' day' ELSE ' days' END,' × RM ',p_detail->>'rate',
  ' · ',p_detail->>'monthLabel','; ',
  (SELECT string_agg(concat(coalesce(w->>'location','A fair'),' ',
    (SELECT string_agg(to_char(d::date,'FMDD Mon'),', ' ORDER BY d) FROM jsonb_array_elements_text(w->'days') d)),'; ' ORDER BY w->>'week')
     FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_detail->'weeks')='array' THEN p_detail->'weeks' ELSE '[]'::jsonb END) w))
$function$;

REVOKE ALL ON FUNCTION public.member_food_claim_line(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_food_claim_line(jsonb) TO service_role;
COMMENT ON FUNCTION public.member_food_claim_line(jsonb) IS
  'A food claim''s line on its claims row (2026-10-13): "Food · 6 days × RM 20.00 · Oct 2026; MID VALLEY 2 Oct, 3 Oct, 4 Oct; …". Called by member_submit_request only.';

-- ── Production's bodies, statements swapped ──────────────────────────────────

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

-- The month's only claim, its days its own — before anything is written.
SELECT pg_temp.swap_check('public.member_prepare_request(text, uuid, jsonb, uuid, uuid)'::regprocedure,
  $old$IF p_detail->>'claimType'='food' THEN PERFORM public.member_food_claim_clash(v_staff, p_detail->'days', p_revision); END IF;$old$,
  $new$IF p_detail->>'claimType'='food' THEN PERFORM public.member_food_claim_taken(v_staff, p_detail, p_revision); END IF;$new$);

-- "Food claim · Oct 2026".
SELECT pg_temp.swap_check('public.member_prepare_request(text, uuid, jsonb, uuid, uuid)'::regprocedure,
  $old$WHEN p_detail->>'claimType'='food' THEN 'Food claim' WHEN coalesce((p_detail->>'planeTicket')::boolean,false) THEN 'Plane ticket claim'$old$,
  $new$WHEN p_detail->>'claimType'='food' THEN 'Food claim · '||coalesce(p_detail->>'monthLabel','') WHEN coalesce((p_detail->>'planeTicket')::boolean,false) THEN 'Plane ticket claim'$new$);

-- The claims row's line.
SELECT pg_temp.swap_check('public.member_submit_request(uuid)'::regprocedure,
  $old$WHEN r.detail->>'claimType'='food' THEN
   concat('Food · ',r.detail->>'dayCount',CASE WHEN r.detail->>'dayCount'='1' THEN ' day' ELSE ' days' END,' × RM ',r.detail->>'rate',
   ' · ',r.detail->>'location',' (week of ',r.detail->>'week','); ',
   (SELECT string_agg(to_char(d::date,'FMDD Mon'),', ' ORDER BY d) FROM jsonb_array_elements_text(r.detail->'days') d))$old$,
  $new$WHEN r.detail->>'claimType'='food' THEN public.member_food_claim_line(r.detail)$new$);

-- Nothing asks it any more.
DROP FUNCTION IF EXISTS public.member_food_claim_clash(uuid, jsonb, uuid);

NOTIFY pgrst, 'reload schema';
