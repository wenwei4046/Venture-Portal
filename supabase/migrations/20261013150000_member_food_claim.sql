-- ============================================================================
-- 20261013150000_member_food_claim.sql
-- The food claim (2026-10-13 — the user: "Food claim 本身只需要 set 它的 amount 就可以了
-- （per day 是多少钱）… 顺便要 set 什么 title 的人可以 entitle 这个 food claim（这是 for revenue
-- team 的人的）… 当他 submit 的时候，他就可以选他的 week（星期本身可以点）… 可能他是 9 号到 10 号，
-- 所以他可以点开它，选他是 claim 9 号到 10 号全部，或者只 claim 其中的某几天（比如可能他有一天没有去
-- 这样子）").
-- ============================================================================
--
-- 0. For the Fair sub-department only (the user, the same day: "this food claim is only for fair
--    sub-department"): `member_food_claim_sub()` names it — code FAIR, else the one called Fair, as
--    the Quote's calculator already finds it (member_data_snapshot).
-- 1. HR's two settings sit on the claim rates' one row: `food_rate_per_day` (RM a day; null = not
--    set) and `food_title_ids` (the titles whose holders may claim it), saved apart from Claim rates
--    (`food_updated_at` / `_by`).
-- 2. People › Member services › Food claim reads them with `member_admin_food_claim()` and saves them
--    with `member_admin_save_food_claim(rate, titles)` — the back office's own door
--    (member_is_manager('member_requests_manage')) and, as a new write, its action (member.manage).
--    Member Services' Edit box is the only box that stands for member.manage, so unticking it takes
--    the cell away whole: no tab_write_guard (as member_waiting_add, mig 20261011230000).
-- 3. The member's form reads the rate and the titles' names through `member_claim_settings()` (one
--    statement swapped into production's body).
-- 4. A food claim is a claim — `kind` 'claim', `claimType` 'food' — so HR decides it in Request
--    reviews like any other (Approve · add to payroll / request payment). `member_claim_food_detail`
--    works it out: Fair's (no other sub-department's), the member's title there among HR's (their
--    seat's, else their company title), the rate set, their own brand week (the same two layers as every claim:
--    member_claim_brand_week), the fair's days (its own, else the ERP booth's, else its weekend Friday
--    to Sunday), the days picked among them — each one come already — and the amount = days × the
--    rate a day. No invoice, no region: a meal is the same at a fair in KL. `member_claim_detail_for`
--    hands it a food claim (one statement swapped in).
-- 5. `member_prepare_request` titles it "Food claim · VENUE"; `member_submit_request` sends it with no
--    invoice, describes it "Food · 2 days × RM 20 · VENUE (week of 2026-10-09); 9 Oct, 10 Oct", and
--    first refuses a day already in another live food claim of the same person
--    (`member_food_claim_check`, under a lock per person). Each from production's body, one statement
--    swapped (pg_temp.swap_check: refuses when production changed since; a second run changes nothing).
--
-- No new table. Comments stay outside the function bodies.

-- ── 1. HR's settings ────────────────────────────────────────────────────────

ALTER TABLE public.member_claim_rates
  ADD COLUMN IF NOT EXISTS food_rate_per_day numeric(15,2),
  ADD COLUMN IF NOT EXISTS food_title_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS food_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS food_updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.member_claim_rates DROP CONSTRAINT IF EXISTS member_claim_rates_food_rate_check;
ALTER TABLE public.member_claim_rates ADD CONSTRAINT member_claim_rates_food_rate_check
  CHECK (food_rate_per_day IS NULL OR food_rate_per_day BETWEEN 0 AND 100000);
COMMENT ON COLUMN public.member_claim_rates.food_rate_per_day IS
  'The food claim (2026-10-13): RM a day a member claims for a day of their brand week''s fair. Null = not set. Written by member_admin_save_food_claim only.';
COMMENT ON COLUMN public.member_claim_rates.food_title_ids IS
  'The titles whose holders may send a food claim — the member''s seat title in the sub-department claimed for, else their company title (2026-10-13).';

-- The food claim's own saved-at / by say who saved it; a change of them alone is no change.
SELECT public.audit_register('member_claim_rates', 'Claim rates', 'Member services', '{member_requests_manage}',
  p_labels => '{base_name}', p_ignore => '{food_updated_at,food_updated_by}');

-- ── 0. The sub-department a food claim is for: Fair ─────────────────────────

CREATE OR REPLACE FUNCTION public.member_food_claim_sub()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 RETURN (SELECT d.id FROM public.comm_sub_departments d
          WHERE d.is_active AND (upper(coalesce(d.code,''))='FAIR' OR lower(btrim(d.name))='fair')
          ORDER BY (upper(coalesce(d.code,''))='FAIR') DESC, d.created_at, d.id LIMIT 1);
END
$function$;

REVOKE ALL ON FUNCTION public.member_food_claim_sub() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_food_claim_sub() TO service_role;
COMMENT ON FUNCTION public.member_food_claim_sub() IS
  'The sub-department a food claim is for (2026-10-13 — the user: "only for fair sub-department"): code FAIR, else the one called Fair. Asked by the food claim''s functions only.';

-- ── 2. People › Member services › Food claim ────────────────────────────────

CREATE OR REPLACE FUNCTION public.member_admin_food_claim()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date; v_rates public.member_claim_rates%ROWTYPE;
 v_sub uuid := public.member_food_claim_sub();
BEGIN
 IF public.member_is_manager('member_requests_manage') IS NOT TRUE THEN
  RAISE EXCEPTION 'HR request management access is required' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_rates FROM public.member_claim_rates WHERE id;
 RETURN jsonb_build_object(
  'subDepartmentId', v_sub,
  'subName', (SELECT d.name FROM public.comm_sub_departments d WHERE d.id = v_sub),
  'perDay', v_rates.food_rate_per_day,
  'titleIds', to_jsonb(coalesce(v_rates.food_title_ids, '{}'::uuid[])),
  'updatedAt', v_rates.food_updated_at,
  'updatedBy', (SELECT u.name FROM public.users u WHERE u.id = v_rates.food_updated_by),
  'titles', coalesce((
   SELECT jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'active', t.is_active, 'level', l.name,
     'people', (SELECT count(DISTINCT h.staff_id) FROM public.comm_hierarchy h
                  JOIN public.comm_schemes c ON c.id = h.scheme_id
                 WHERE h.title_id = t.id AND c.sub_department_id = v_sub AND c.is_active
                   AND h.effective_from <= v_today AND (h.effective_to IS NULL OR h.effective_to >= v_today)
                   AND c.effective_from <= v_today AND (c.effective_to IS NULL OR c.effective_to >= v_today)))
    ORDER BY l.rank DESC NULLS LAST, t.name)
   FROM public.titles t LEFT JOIN public.title_levels l ON l.id = t.level_id
   WHERE (t.is_active AND t.department_id = (SELECT d.department_id FROM public.comm_sub_departments d WHERE d.id = v_sub))
      OR t.id = ANY(coalesce(v_rates.food_title_ids, '{}'::uuid[]))
      OR EXISTS (SELECT 1 FROM public.comm_hierarchy h JOIN public.comm_schemes c ON c.id = h.scheme_id
                  WHERE h.title_id = t.id AND c.sub_department_id = v_sub AND c.is_active
                    AND h.effective_from <= v_today AND (h.effective_to IS NULL OR h.effective_to >= v_today))
  ), '[]'::jsonb));
END
$function$;

REVOKE ALL ON FUNCTION public.member_admin_food_claim() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_admin_food_claim() TO authenticated;
COMMENT ON FUNCTION public.member_admin_food_claim() IS
  'People › Member services › Food claim (2026-10-13): Fair, the rate a day, the titles that may claim it, and every Revenue title with how many hold it in Fair now. member_is_manager(''member_requests_manage'').';

CREATE OR REPLACE FUNCTION public.member_admin_save_food_claim(p_per_day numeric, p_titles uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_titles uuid[];
BEGIN
 IF public.member_is_manager('member_requests_manage') IS NOT TRUE
    OR public.has_any_action(ARRAY['member.manage']) IS NOT TRUE THEN
  RAISE EXCEPTION 'HR request management access is required' USING ERRCODE='42501';
 END IF;
 IF p_per_day IS NOT NULL AND (p_per_day < 0 OR p_per_day > 100000 OR p_per_day <> round(p_per_day, 2)) THEN
  RAISE EXCEPTION 'The rate a day must be an amount from RM 0 to RM 100,000, to the sen';
 END IF;
 SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}'::uuid[]) INTO v_titles FROM unnest(coalesce(p_titles, '{}'::uuid[])) x WHERE x IS NOT NULL;
 IF cardinality(v_titles) > 60 THEN RAISE EXCEPTION 'Keep it to 60 titles'; END IF;
 IF EXISTS (SELECT 1 FROM unnest(v_titles) x WHERE NOT EXISTS (SELECT 1 FROM public.titles t WHERE t.id = x)) THEN
  RAISE EXCEPTION 'A title picked is no longer in People. Reload the page and pick again';
 END IF;
 IF cardinality(v_titles) > 0 AND coalesce(p_per_day, 0) <= 0 THEN
  RAISE EXCEPTION 'Set the rate a day before picking who may claim it';
 END IF;
 INSERT INTO public.member_claim_rates (id, food_rate_per_day, food_title_ids, food_updated_at, food_updated_by)
 VALUES (true, p_per_day, v_titles, now(), auth.uid())
 ON CONFLICT (id) DO UPDATE SET food_rate_per_day = EXCLUDED.food_rate_per_day, food_title_ids = EXCLUDED.food_title_ids,
   food_updated_at = EXCLUDED.food_updated_at, food_updated_by = EXCLUDED.food_updated_by;
 RETURN public.member_admin_food_claim();
END
$function$;

REVOKE ALL ON FUNCTION public.member_admin_save_food_claim(numeric, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_admin_save_food_claim(numeric, uuid[]) TO authenticated;
COMMENT ON FUNCTION public.member_admin_save_food_claim(numeric, uuid[]) IS
  'People › Member services › Food claim''s Save (2026-10-13): the rate a day and the titles that may claim it — a title needs a rate. member_is_manager(''member_requests_manage'') + member.manage.';

-- ── 4. A food claim worked out ──────────────────────────────────────────────

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
 IF v_title IS NULL THEN
  SELECT s.title_id, t.name INTO v_title, v_title_name FROM public.hr_staff_costs s LEFT JOIN public.titles t ON t.id=s.title_id WHERE s.id=p_staff;
 END IF;
 IF v_title IS NULL OR NOT (v_title = ANY(coalesce(v_rates.food_title_ids,'{}'::uuid[]))) THEN
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
  v_fair_start := nullif(v_booth->>'start','')::date;
  v_fair_end := nullif(v_booth->>'end','')::date;
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
COMMENT ON FUNCTION public.member_claim_food_detail(jsonb, uuid, uuid) IS
  'A food claim worked out (2026-10-13): the member''s title among HR''s, their own brand week, the fair''s days picked (each come already), days × HR''s rate a day. Called by member_claim_detail_for only.';

-- A day is claimed for food once: refused when another live food claim of the same person has it.
CREATE OR REPLACE FUNCTION public.member_food_claim_check(p_request uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r public.member_requests%ROWTYPE; v_taken text;
BEGIN
 SELECT * INTO r FROM public.member_requests WHERE id=p_request;
 IF NOT FOUND OR r.kind<>'claim' OR coalesce(r.detail->>'claimType','')<>'food' THEN RETURN; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('member_food_claim:'||r.staff_id::text));
 SELECT string_agg(to_char(x.d,'FMDD Mon'),', ' ORDER BY x.d) INTO v_taken
  FROM (SELECT DISTINCT (o_day#>>'{}')::date AS d
          FROM public.member_requests o
         CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(o.detail->'days')='array' THEN o.detail->'days' ELSE '[]'::jsonb END) o_day
         WHERE o.staff_id=r.staff_id AND o.id<>r.id AND o.kind='claim' AND o.detail->>'claimType'='food'
           AND o.status NOT IN ('draft','withdrawn','rejected')
           AND (o_day#>>'{}') IN (SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(r.detail->'days')='array' THEN r.detail->'days' ELSE '[]'::jsonb END))) x;
 IF v_taken IS NOT NULL THEN
  RAISE EXCEPTION 'Food is already claimed for %. Untick those days and send it again.', v_taken;
 END IF;
END
$function$;

REVOKE ALL ON FUNCTION public.member_food_claim_check(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_food_claim_check(uuid) TO service_role;
COMMENT ON FUNCTION public.member_food_claim_check(uuid) IS
  'A food claim''s days are its own (2026-10-13): refuses a day another live food claim (not a draft, cancelled or rejected) of the same person already has. Called by member_submit_request only, under a lock per person.';

-- ── 3 and 5. Production's bodies, one statement swapped each ────────────────

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

-- 3. The member's form: the rate a day and the titles' names.
SELECT pg_temp.swap_check('public.member_claim_settings()'::regprocedure,
  $old$'groupCapPerNight',(SELECT airbnb_group_cap_per_night FROM public.member_claim_rates WHERE id),$old$,
  $new$'groupCapPerNight',(SELECT airbnb_group_cap_per_night FROM public.member_claim_rates WHERE id),
  'food',jsonb_build_object('subDepartmentId',public.member_food_claim_sub(),'perDay',(SELECT food_rate_per_day FROM public.member_claim_rates WHERE id),'titles',coalesce((SELECT jsonb_agg(t.name ORDER BY t.name) FROM public.titles t WHERE t.id=ANY(coalesce((SELECT food_title_ids FROM public.member_claim_rates WHERE id),'{}'::uuid[]))),'[]'::jsonb)),$new$);

-- 4. Every claim is worked out here; a food claim by its own function.
SELECT pg_temp.swap_check('public.member_claim_detail_for(jsonb, uuid, uuid)'::regprocedure,
  $old$IF v_type IS NULL OR v_type NOT IN ('outstation','airbnb') THEN RAISE EXCEPTION 'Choose Outstation or Airbnb'; END IF;$old$,
  $new$IF v_type='food' THEN RETURN public.member_claim_food_detail(p_detail, p_staff, p_sub); END IF;
 IF v_type IS NULL OR v_type NOT IN ('outstation','airbnb') THEN RAISE EXCEPTION 'Choose Outstation or Airbnb'; END IF;$new$);

-- 5a. Its title.
SELECT pg_temp.swap_check('public.member_prepare_request(text, uuid, jsonb, uuid, uuid)'::regprocedure,
  $old$v_title:=CASE WHEN coalesce((p_detail->>'planeTicket')::boolean,false) THEN 'Plane ticket claim'$old$,
  $new$v_title:=CASE WHEN p_detail->>'claimType'='food' THEN 'Food claim' WHEN coalesce((p_detail->>'planeTicket')::boolean,false) THEN 'Plane ticket claim'$new$);

-- 5b. No invoice for a food claim, as for Outstation by road.
SELECT pg_temp.swap_check('public.member_submit_request(uuid)'::regprocedure,
  $old$IF v_path IS NULL AND (coalesce(r.detail->>'claimType','')<>'outstation' OR coalesce((r.detail->>'planeTicket')::boolean,false)) THEN$old$,
  $new$IF v_path IS NULL AND (coalesce(r.detail->>'claimType','') NOT IN ('outstation','food') OR coalesce((r.detail->>'planeTicket')::boolean,false)) THEN$new$);

-- 5c. A day is claimed for food once.
SELECT pg_temp.swap_check('public.member_submit_request(uuid)'::regprocedure,
  $old$SELECT employee_name,department_id INTO v_name,v_dept FROM public.hr_staff_costs WHERE id=v_staff;$old$,
  $new$PERFORM public.member_food_claim_check(r.id);
 SELECT employee_name,department_id INTO v_name,v_dept FROM public.hr_staff_costs WHERE id=v_staff;$new$);

-- 5d. The claims row's line: "Food · 2 days × RM 20 · MITEC (week of 2026-10-09); 9 Oct, 10 Oct".
SELECT pg_temp.swap_check('public.member_submit_request(uuid)'::regprocedure,
  $old$v_desc:=CASE
  WHEN r.detail->>'claimType'='outstation' AND coalesce((r.detail->>'planeTicket')::boolean,false) THEN$old$,
  $new$v_desc:=CASE
  WHEN r.detail->>'claimType'='food' THEN
   concat('Food · ',r.detail->>'dayCount',CASE WHEN r.detail->>'dayCount'='1' THEN ' day' ELSE ' days' END,' × RM ',r.detail->>'rate',
   ' · ',r.detail->>'location',' (week of ',r.detail->>'week','); ',
   (SELECT string_agg(to_char(d::date,'FMDD Mon'),', ' ORDER BY d) FROM jsonb_array_elements_text(r.detail->'days') d))
  WHEN r.detail->>'claimType'='outstation' AND coalesce((r.detail->>'planeTicket')::boolean,false) THEN$new$);

NOTIFY pgrst, 'reload schema';
