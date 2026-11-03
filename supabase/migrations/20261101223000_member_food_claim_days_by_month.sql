-- ============================================================================
-- 20261101223000_member_food_claim_days_by_month.sql
-- A food claim's DAY goes with its own month (2026-11-01 — the user, over a fair of 29 Oct – 1 Nov: "有些 fee 会
-- 跨月份 … 那它 11 月 1 号就是 claim 在 11 月"; asked whether 1 Nov goes with October's food or November's, "按日期拆").
-- ============================================================================
--
-- Until now a weekend went whole to the month of its Friday: the fair of 29 Oct – 1 Nov was October's, its 1 Nov
-- sent with October's food. Now each day is claimed with its own month's: that weekend's 29–31 Oct with October's,
-- its 1 Nov with November's (sent from 1 Dec). A weekend across two months is on both claims.
--
-- `member_claim_food_detail` (production's body, md5 8f05a34c… = the copy in 20261013200000, two statements swapped):
--   1. a weekend of the claim is one whose Friday is in the month or the month either side (it was: in the month);
--   2. every day ticked is in the month, else "1 Nov is claimed with Nov 2026's food: a day goes with its own month"
--      (after the check that it is a day of the fair).
-- Nothing else changes: one claim a person a month, a day claimed once (`member_food_claim_taken` — so a 1 Nov an
-- October claim already holds stays claimed there and November's cannot take it again), the month over before it is
-- sent, HR's rate. Claims already sent are not touched: none is worked out again after it is sent.

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
  IF v_friday<(v_month-interval '1 month')::date OR v_friday>=(v_month+interval '2 month')::date THEN RAISE EXCEPTION 'The weekend of % is not one of %', to_char(v_friday,'FMDD Mon'), v_label; END IF;
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
  SELECT min(d) INTO v_bad FROM unnest(v_days) d WHERE date_trunc('month',d::timestamp)::date<>v_month;
  IF v_bad IS NOT NULL THEN
   RAISE EXCEPTION '% is claimed with %''s food: a day goes with its own month', to_char(v_bad,'FMDD Mon'), to_char(v_bad,'FMMon YYYY');
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
  'A food claim worked out (2026-10-13): a month, once it is over — the brand weeks the member worked (their own, Fair only) with a day in it, and the days of it ticked, each in the month (2026-11-01: a day goes with its own month); the seat''s title among HR''s; days × HR''s rate a day. Called by member_claim_detail_for only.';
