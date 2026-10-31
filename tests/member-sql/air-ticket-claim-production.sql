-- member_transport_claim_open(p_staff uuid, p_sub uuid) — production md5(prosrc) 113c1c1cb851788854f8dfba4f9f3987
CREATE OR REPLACE FUNCTION public.member_transport_claim_open(p_staff uuid, p_sub uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_title uuid;
  v_title_name text;
BEGIN
  SELECT h.title_id, t.name INTO v_title, v_title_name
    FROM public.comm_hierarchy h
    JOIN public.comm_schemes c ON c.id = h.scheme_id
    LEFT JOIN public.titles t ON t.id = h.title_id
   WHERE h.staff_id = p_staff AND c.sub_department_id = p_sub AND c.is_active
     AND h.effective_from <= v_today AND (h.effective_to IS NULL OR h.effective_to >= v_today)
     AND c.effective_from <= v_today AND (c.effective_to IS NULL OR c.effective_to >= v_today)
   ORDER BY c.effective_from DESC
   LIMIT 1;
  IF (v_title = ANY (coalesce((SELECT r.transport_title_ids FROM public.member_claim_rates r WHERE r.id), '{}'::uuid[]))) IS NOT TRUE THEN
    RAISE EXCEPTION 'A transport claim is not open to %. HR picks the titles that may claim it.', coalesce(v_title_name, 'your title')
      USING ERRCODE = '42501';
  END IF;
END
$function$
;

-- member_admin_transport_claim() — production md5(prosrc) d34f444dea32e48012d138d03589aefd
CREATE OR REPLACE FUNCTION public.member_admin_transport_claim()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_rates public.member_claim_rates%ROWTYPE;
BEGIN
  IF public.member_is_manager('member_requests_manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'HR request management access is required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_rates FROM public.member_claim_rates WHERE id;
  RETURN jsonb_build_object(
    'titleIds', to_jsonb(coalesce(v_rates.transport_title_ids, '{}'::uuid[])),
    'updatedAt', v_rates.transport_updated_at,
    'updatedBy', (SELECT u.name FROM public.users u WHERE u.id = v_rates.transport_updated_by),
    'titles', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'active', t.is_active, 'level', l.name,
        'people', (SELECT count(DISTINCT h.staff_id) FROM public.comm_hierarchy h
                     JOIN public.comm_schemes c ON c.id = h.scheme_id
                     JOIN public.comm_sub_departments d ON d.id = c.sub_department_id
                    WHERE h.title_id = t.id AND d.is_active AND c.is_active
                      AND h.effective_from <= v_today AND (h.effective_to IS NULL OR h.effective_to >= v_today)
                      AND c.effective_from <= v_today AND (c.effective_to IS NULL OR c.effective_to >= v_today)))
        ORDER BY l.rank DESC NULLS LAST, t.name)
      FROM public.titles t
      LEFT JOIN public.title_levels l ON l.id = t.level_id
      WHERE (t.is_active AND t.department_id IN (SELECT d.department_id FROM public.comm_sub_departments d WHERE d.is_active))
         OR t.id = ANY (coalesce(v_rates.transport_title_ids, '{}'::uuid[]))
         OR EXISTS (SELECT 1 FROM public.comm_hierarchy h
                      JOIN public.comm_schemes c ON c.id = h.scheme_id
                      JOIN public.comm_sub_departments d ON d.id = c.sub_department_id
                     WHERE h.title_id = t.id AND d.is_active AND c.is_active
                       AND h.effective_from <= v_today AND (h.effective_to IS NULL OR h.effective_to >= v_today))
    ), '[]'::jsonb));
END
$function$
;

-- member_admin_save_transport_claim(p_titles uuid[]) — production md5(prosrc) 5e11c8bd9ec72e740e79455cb49178ba
CREATE OR REPLACE FUNCTION public.member_admin_save_transport_claim(p_titles uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_titles uuid[];
BEGIN
  IF public.member_is_manager('member_requests_manage') IS NOT TRUE
     OR public.has_any_action(ARRAY['member.manage']) IS NOT TRUE THEN
    RAISE EXCEPTION 'HR request management access is required' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}'::uuid[]) INTO v_titles
    FROM unnest(coalesce(p_titles, '{}'::uuid[])) x WHERE x IS NOT NULL;
  IF cardinality(v_titles) > 60 THEN
    RAISE EXCEPTION 'Keep it to 60 titles';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_titles) x WHERE NOT EXISTS (SELECT 1 FROM public.titles t WHERE t.id = x)) THEN
    RAISE EXCEPTION 'A title picked is no longer in People. Reload the page and pick again';
  END IF;
  INSERT INTO public.member_claim_rates (id, transport_title_ids, transport_updated_at, transport_updated_by)
  VALUES (true, v_titles, now(), auth.uid())
  ON CONFLICT (id) DO UPDATE SET transport_title_ids = EXCLUDED.transport_title_ids,
    transport_updated_at = EXCLUDED.transport_updated_at, transport_updated_by = EXCLUDED.transport_updated_by;
  RETURN public.member_admin_transport_claim();
END
$function$
;

-- member_claim_settings() — production md5(prosrc) 4c3516c3ff57b268a89b84dfa90f171d
CREATE OR REPLACE FUNCTION public.member_claim_settings()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 SELECT jsonb_build_object(
  'base',coalesce((SELECT base_name FROM public.member_claim_rates WHERE id),'Klang Valley'),
  'perSpot',(SELECT rate_per_spot FROM public.member_claim_rates WHERE id),
  'perPaxNight',(SELECT airbnb_rate_per_pax_night FROM public.member_claim_rates WHERE id),
  'groupMaxPax',coalesce((SELECT airbnb_group_max_pax FROM public.member_claim_rates WHERE id),3),
  'groupCapPerNight',(SELECT airbnb_group_cap_per_night FROM public.member_claim_rates WHERE id),
  'transport',jsonb_build_object('titles',coalesce((SELECT jsonb_agg(t.name ORDER BY t.name) FROM public.titles t WHERE t.id=ANY(coalesce((SELECT transport_title_ids FROM public.member_claim_rates WHERE id),'{}'::uuid[]))),'[]'::jsonb)),
  'food',jsonb_build_object('subDepartmentId',public.member_food_claim_sub(),'perDay',(SELECT food_rate_per_day FROM public.member_claim_rates WHERE id),'titles',coalesce((SELECT jsonb_agg(t.name ORDER BY t.name) FROM public.titles t WHERE t.id=ANY(coalesce((SELECT food_title_ids FROM public.member_claim_rates WHERE id),'{}'::uuid[]))),'[]'::jsonb)),
  'regions',coalesce((SELECT jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'spots',g.spots,'planeTicket',g.plane_ticket) ORDER BY g.sort_order, g.name)
   FROM public.member_claim_regions g WHERE g.is_active),'[]'::jsonb),
  'fairs',coalesce((SELECT jsonb_agg(jsonb_build_object('fairId',e.id,'venue',coalesce(nullif(btrim(v.display_name),''),e.venue_key),'regionId',g.id)
    ORDER BY e.start_date, e.id)
   FROM public.comm_venue_events e
   LEFT JOIN public.comm_venues v ON v.venue_key=e.venue_key
   LEFT JOIN public.member_claim_venue_regions m ON m.venue_key=e.venue_key
   LEFT JOIN public.member_claim_regions g ON g.id=m.region_id AND g.is_active
   WHERE e.start_date>=(date_trunc('month',now() AT TIME ZONE 'Asia/Kuala_Lumpur')-interval '1 month'-interval '7 days')::date
     AND e.start_date<=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date),'[]'::jsonb))
 WHERE public.has_perm('member_requests') OR public.member_is_manager('member_requests_manage');
$function$
;

-- member_claim_detail_for(p_detail jsonb, p_staff uuid, p_sub uuid) — production md5(prosrc) 8c2668612b2f43f0479e9eaf54a11d3e
CREATE OR REPLACE FUNCTION public.member_claim_detail_for(p_detail jsonb, p_staff uuid, p_sub uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_type text := p_detail->>'claimType'; v_rates public.member_claim_rates%ROWTYPE; v_region public.member_claim_regions%ROWTYPE;
 v_week date; v_booth jsonb; v_fair uuid; v_venue_key text; v_venue text; v_fair_facts jsonb; v_fair_start date; v_fair_end date;
 v_start date; v_end date; v_pax integer; v_nights integer; v_group boolean; v_cap numeric; v_invoice numeric;
BEGIN
 IF v_type='food' THEN RETURN public.member_claim_food_detail(p_detail, p_staff, p_sub); END IF;
 IF v_type IS NULL OR v_type NOT IN ('outstation','airbnb') THEN RAISE EXCEPTION 'Choose Outstation or Airbnb'; END IF;
 PERFORM public.member_transport_claim_open(p_staff, p_sub);
 IF coalesce(p_detail->>'week','')!~'^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Choose the brand week the claim is for'; END IF;
 v_week := (p_detail->>'week')::date;
 v_booth := public.member_claim_brand_week(p_staff, p_sub, v_week);
 IF v_booth IS NULL THEN
  RAISE EXCEPTION 'A claim is for your own brand week, and you have none that weekend: the ERP''s Sales Attending lists you at no booth and you wrote no fair bills. Ask HR to add you in the ERP.';
 END IF;
 v_fair := (v_booth->>'fairId')::uuid;
 SELECT e.venue_key, coalesce(nullif(btrim(v.display_name),''), e.venue_key), e.start_date, e.end_date INTO v_venue_key, v_venue, v_fair_start, v_fair_end
  FROM public.comm_venue_events e LEFT JOIN public.comm_venues v ON v.venue_key=e.venue_key WHERE e.id=v_fair;
 -- A booth the portal has no fair for yet (nothing written there): the ERP's place and days.
 IF v_fair IS NULL THEN
  v_venue_key := nullif(v_booth->>'venueKey','');
  v_venue := coalesce(nullif(v_booth->>'venue',''), v_venue_key);
  v_fair_start := nullif(v_booth->>'start','')::date;
  v_fair_end := nullif(v_booth->>'end','')::date;
 END IF;
 -- What the claim is for comes from the database's own records, over whatever the phone sent.
 v_fair_facts := jsonb_build_object('week',v_week,'fairId',v_fair,'brand',v_booth->>'brand','location',v_venue,
  'venueKey',v_venue_key,'brandWeekPicked',coalesce((v_booth->>'picked')::boolean,false),'brandWeekSource',v_booth->>'source');
 SELECT * INTO v_rates FROM public.member_claim_rates WHERE id;
 IF v_type='outstation' THEN
  SELECT g.* INTO v_region FROM public.member_claim_venue_regions m
   JOIN public.member_claim_regions g ON g.id=m.region_id AND g.is_active
   WHERE m.venue_key=v_venue_key;
  IF NOT FOUND THEN RAISE EXCEPTION 'HR has not set the region for % yet, so an outstation claim for it cannot be sent.', v_venue; END IF;
  IF v_region.plane_ticket THEN
   IF coalesce(p_detail->>'invoiceHash','')!~'^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Add the plane ticket''s invoice'; END IF;
   IF coalesce(p_detail->>'amount','')!~'^\d{1,9}(\.\d{1,2})?$' OR (p_detail->>'amount')::numeric<=0 THEN
    RAISE EXCEPTION 'Enter the plane ticket''s price, as its invoice shows';
   END IF;
   RETURN (p_detail - 'region' - 'regionName' - 'spots' - 'rate' - 'start' - 'end' - 'male' - 'female' - 'pax' - 'nights' - 'group' - 'cap' - 'invoiceAmount')
    || v_fair_facts || jsonb_build_object('category','Plane ticket','base',v_rates.base_name,'region',v_region.id,
     'regionName',v_region.name,'planeTicket',true,'amount',round((p_detail->>'amount')::numeric,2));
  END IF;
  IF v_region.spots<=0 THEN RAISE EXCEPTION '% is in %, local to %, so there is no outstation claim', v_venue, v_region.name, coalesce(v_rates.base_name,'Klang Valley'); END IF;
  IF coalesce(v_rates.rate_per_spot,0)<=0 THEN RAISE EXCEPTION 'HR has not set the rate per spot yet'; END IF;
  RETURN (p_detail - 'invoiceHash' - 'invoiceName' - 'start' - 'end' - 'male' - 'female' - 'pax' - 'nights' - 'amount' - 'planeTicket' - 'group' - 'cap' - 'invoiceAmount')
   || v_fair_facts || jsonb_build_object('category','Outstation','base',v_rates.base_name,'region',v_region.id,'regionName',v_region.name,
    'spots',v_region.spots,'rate',v_rates.rate_per_spot,'planeTicket',false,'amount',round(v_region.spots*v_rates.rate_per_spot,2));
 END IF;
 -- Airbnb is for an outstation fair only (user 2026-10-06): the region HR set for its venue is away
 -- from the base — spots above 0, or flown to.
 SELECT g.* INTO v_region FROM public.member_claim_venue_regions m
  JOIN public.member_claim_regions g ON g.id=m.region_id AND g.is_active
  WHERE m.venue_key=v_venue_key;
 IF NOT FOUND THEN RAISE EXCEPTION 'HR has not set the region for % yet, so an Airbnb claim for it cannot be sent.', v_venue; END IF;
 IF v_region.spots<=0 AND NOT v_region.plane_ticket THEN
  RAISE EXCEPTION '% is in %, local to %, so there is no Airbnb claim', v_venue, v_region.name, coalesce(v_rates.base_name,'Klang Valley');
 END IF;
 IF coalesce(p_detail->>'invoiceHash','')!~'^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'A verified invoice is required'; END IF;
 IF coalesce(p_detail->>'start','')!~'^\d{4}-\d{2}-\d{2}$' OR coalesce(p_detail->>'end','')!~'^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Enter the check-in and check-out dates'; END IF;
 v_start := (p_detail->>'start')::date; v_end := (p_detail->>'end')::date;
 IF v_end<=v_start THEN RAISE EXCEPTION 'Check-out must be after check-in'; END IF;
 v_nights := v_end-v_start;
 -- From the day before the fair to the day after it at most (user 2026-10-12: a fair of 18-20 Sep opens
 -- the 17th for check-in and the 21st for check-out), with a night of the fair: in on or before its last
 -- day, out after its first. A fair whose days are not known is its weekend's, Friday to Sunday. This
 -- replaces "at most 7 nights" (2026-10-06).
 IF v_fair_start IS NULL OR v_fair_end IS NULL THEN v_fair_start := v_week; v_fair_end := v_week+2; END IF;
 IF v_start<v_fair_start-1 OR v_end>v_fair_end+1 THEN
  RAISE EXCEPTION 'Check in from % and check out by %: the day before the fair to the day after', to_char(v_fair_start-1,'FMDD Mon'), to_char(v_fair_end+1,'FMDD Mon YYYY');
 END IF;
 IF v_start>v_fair_end OR v_end<=v_fair_start THEN
  RAISE EXCEPTION 'The stay must cover the fair''s days, % to %', to_char(v_fair_start,'FMDD Mon'), to_char(v_fair_end,'FMDD Mon YYYY');
 END IF;
 IF coalesce(p_detail->>'male','')!~'^\d{1,2}$' OR coalesce(p_detail->>'female','')!~'^\d{1,2}$' THEN RAISE EXCEPTION 'Check who stayed'; END IF;
 v_pax := (p_detail->>'male')::integer+(p_detail->>'female')::integer;
 IF v_pax<1 OR v_pax>40 THEN RAISE EXCEPTION 'Check who stayed'; END IF;
 -- The invoice's total, up to a cap by head count: a small group's is HR's figure a night x nights,
 -- a bigger one's the rate per person a night x people x nights -- a cap too, never a fixed amount
 -- (user 2026-10-12: "per pax max cap is this amount, not like per pax fix this amount").
 IF coalesce(p_detail->>'invoiceAmount','')!~'^\d{1,9}(\.\d{1,2})?$' OR (p_detail->>'invoiceAmount')::numeric<=0 THEN
  RAISE EXCEPTION 'Enter the stay''s total from its invoice';
 END IF;
 v_invoice := round((p_detail->>'invoiceAmount')::numeric,2);
 v_group := v_pax<=coalesce(v_rates.airbnb_group_max_pax,3) AND coalesce(v_rates.airbnb_group_cap_per_night,0)>0;
 IF v_group THEN
  v_cap := round(v_nights*v_rates.airbnb_group_cap_per_night,2);
  RETURN (p_detail - 'region' - 'regionName' - 'spots' - 'amount' - 'planeTicket' - 'base' - 'threePax')
   || v_fair_facts || jsonb_build_object('category','Airbnb accommodation','region',v_region.id,'regionName',v_region.name,
    'pax',v_pax,'nights',v_nights,'group',true,
    'rate',v_rates.airbnb_group_cap_per_night,'cap',v_cap,'invoiceAmount',v_invoice,'amount',least(v_invoice,v_cap));
 END IF;
 IF coalesce(v_rates.airbnb_rate_per_pax_night,0)<=0 THEN RAISE EXCEPTION 'HR has not set the Airbnb rate yet'; END IF;
 v_cap := round(v_pax*v_nights*v_rates.airbnb_rate_per_pax_night,2);
 RETURN (p_detail - 'region' - 'regionName' - 'spots' - 'amount' - 'planeTicket' - 'base' - 'threePax')
  || v_fair_facts || jsonb_build_object('category','Airbnb accommodation','region',v_region.id,'regionName',v_region.name,
   'pax',v_pax,'nights',v_nights,'group',false,
   'rate',v_rates.airbnb_rate_per_pax_night,'cap',v_cap,'invoiceAmount',v_invoice,'amount',least(v_invoice,v_cap));
END $function$
;

-- member_prepare_request(p_kind text, p_sub_department uuid, p_detail jsonb, p_idempotency uuid, p_revision uuid) — production md5(prosrc) c235d970bc4bb6f55ce9fb17716164eb
CREATE OR REPLACE FUNCTION public.member_prepare_request(p_kind text, p_sub_department uuid, p_detail jsonb, p_idempotency uuid, p_revision uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_staff uuid:=public.member_staff_id(); v_existing public.member_requests%ROWTYPE; v_id uuid; v_title text;
 v_original uuid; v_valid boolean; v_date date;
BEGIN
  PERFORM public.member_send_guard(p_kind);
 IF NOT public.has_perm('member_requests') THEN RAISE EXCEPTION 'Request access is not enabled' USING ERRCODE='42501'; END IF;
 IF p_kind NOT IN ('claim','replacement','waiting') OR p_idempotency IS NULL OR jsonb_typeof(p_detail)<>'object' OR octet_length(p_detail::text)>120000 THEN RAISE EXCEPTION 'Invalid request'; END IF;
 -- A fair claim: its brand week's fair, its venue's region and HR's rate, worked out here — never sent.
 IF p_kind='claim' AND p_detail ? 'claimType' THEN p_detail := public.member_claim_detail_for(p_detail, v_staff, p_sub_department); END IF;
 IF p_revision IS NOT NULL THEN
 SELECT * INTO v_existing FROM public.member_requests WHERE id=p_revision AND created_by=auth.uid() AND staff_id=v_staff FOR UPDATE;
 IF NOT FOUND OR v_existing.kind<>p_kind OR v_existing.sub_department_id<>p_sub_department OR v_existing.idempotency_key<>p_idempotency THEN RAISE EXCEPTION 'Only your returned request may be revised' USING ERRCODE='42501'; END IF;
 IF v_existing.status<>'needs_info' THEN
 IF v_existing.detail=p_detail AND v_existing.status IN('draft','submitted') THEN RETURN jsonb_build_object('id',v_existing.id,'userId',auth.uid(),'status',v_existing.status); END IF;
 IF NOT (v_existing.status='submitted' AND p_kind IN ('waiting','replacement')) AND NOT (v_existing.status='draft' AND p_kind='claim' AND v_existing.claim_id IS NOT NULL) THEN RAISE EXCEPTION 'Request is no longer awaiting your information; refresh and retry'; END IF;
 END IF;
 IF p_kind='claim' AND NOT EXISTS(SELECT 1 FROM public.claims WHERE id=v_existing.claim_id AND status='pending') THEN RAISE EXCEPTION 'Only a pending claim may be supplemented'; END IF;
 ELSE
 SELECT * INTO v_existing FROM public.member_requests WHERE created_by=auth.uid() AND idempotency_key=p_idempotency;
 IF FOUND THEN
 IF v_existing.kind<>p_kind OR v_existing.sub_department_id<>p_sub_department OR v_existing.detail<>p_detail THEN RAISE EXCEPTION 'This submission key has already been used for a different request'; END IF;
 RETURN jsonb_build_object('id',v_existing.id,'userId',auth.uid(),'status',v_existing.status);
 END IF;
 END IF;
 IF p_kind='waiting' THEN
 IF NOT EXISTS(SELECT 1 FROM public.comm_sub_departments d WHERE public.member_has_membership(v_staff,d.id)) THEN RAISE EXCEPTION 'An active Revenue membership is required' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.comm_sub_departments d JOIN public.hr_staff_costs s ON s.department_id=d.department_id
 WHERE s.id=v_staff AND d.id=p_sub_department AND d.is_active) THEN RAISE EXCEPTION 'Invalid intended department'; END IF;
 ELSE
 IF NOT public.member_has_membership(v_staff,p_sub_department) THEN RAISE EXCEPTION 'Request department is not an active membership' USING ERRCODE='42501'; END IF;
 END IF;
 IF p_kind='claim' AND p_detail ? 'claimType' THEN
 IF p_detail->>'claimType'='food' THEN PERFORM public.member_food_claim_taken(v_staff, p_detail, p_revision); END IF;
 v_title:=CASE WHEN p_detail->>'claimType'='food' THEN 'Food claim · '||coalesce(p_detail->>'monthLabel','') WHEN coalesce((p_detail->>'planeTicket')::boolean,false) THEN 'Plane ticket claim'
  WHEN p_detail->>'claimType'='outstation' THEN 'Outstation claim' ELSE 'Airbnb claim' END
  ||CASE WHEN coalesce(p_detail->>'location','')<>'' THEN ' · '||(p_detail->>'location') ELSE '' END;
 ELSIF p_kind='claim' THEN
 PERFORM public.member_transport_claim_open(v_staff, p_sub_department);
 IF coalesce(p_detail->>'invoiceHash','')!~'^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'A verified invoice hash is required'; END IF;
 IF coalesce(p_detail->>'location','')='' OR coalesce(p_detail->>'start','')='' OR coalesce(p_detail->>'end','')='' THEN RAISE EXCEPTION 'Location and stay dates are required'; END IF;
 IF (p_detail->>'amount')::numeric<=0 OR (p_detail->>'amount')::numeric>999999999 THEN RAISE EXCEPTION 'Invalid claim amount'; END IF;
 IF (p_detail->>'end')::date<(p_detail->>'start')::date THEN RAISE EXCEPTION 'Check-out must not precede check-in'; END IF;
 v_title:=(p_detail->>'location')||' · 住宿报销';
 ELSE
 IF length(trim(coalesce(p_detail->>'newPerson','')))<1 AND NOT(p_kind='replacement' AND p_detail->>'replacementSource'='vacancy') THEN RAISE EXCEPTION 'Applicant name is required'; END IF;
 IF p_kind='waiting' THEN
 IF coalesce(p_detail->>'contact','')='' OR coalesce(p_detail->>'signature','')='' OR (p_detail->>'consent') IS DISTINCT FROM 'true' OR coalesce(p_detail->>'start','')='' THEN RAISE EXCEPTION 'Applicant contact, date, signature and confirmation are required'; END IF;
 v_date:=CASE WHEN p_detail->>'start'='anytime' THEN NULL ELSE (p_detail->>'start')::date END;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce((SELECT f.fields FROM public.member_waiting_forms f ORDER BY f.version DESC LIMIT 1),'[]'::jsonb)) q
  WHERE coalesce((q->>'required')::boolean,false) AND NOT coalesce((q->>'builtin')::boolean,false)
  AND length(trim(coalesce((SELECT a->>'value' FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_detail->'answers')='array' THEN p_detail->'answers' ELSE '[]'::jsonb END) a WHERE a->>'id'=q->>'id' LIMIT 1),'')))=0)
 THEN RAISE EXCEPTION 'Answer every required question on the waiting-list form'; END IF;
 IF p_detail ? 'signatureImage' THEN
 IF length(p_detail->>'signatureImage')>100000 OR (p_detail->>'signatureImage')!~'^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$' THEN RAISE EXCEPTION 'Invalid signature image'; END IF;
 IF octet_length(decode(split_part(p_detail->>'signatureImage',',',2),'base64'))>65536 OR substring(decode(split_part(p_detail->>'signatureImage',',',2),'base64') FROM 1 FOR 8)<>decode('89504e470d0a1a0a','hex') THEN RAISE EXCEPTION 'Invalid PNG signature'; END IF;
 END IF;
 v_title:=(p_detail->>'newPerson')||' · Waiting List';
 ELSE
 IF p_detail->>'destination' NOT IN ('member_exit','resignation','transfer') THEN RAISE EXCEPTION 'Choose membership exit, company resignation or transfer'; END IF;
 v_original:=(p_detail->>'originalStaffId')::uuid;
 WITH RECURSIVE descendants AS(
 SELECT h.staff_id,h.scheme_id,ARRAY[h.staff_id] AS visited FROM public.comm_hierarchy h JOIN public.comm_schemes c ON c.id=h.scheme_id
 WHERE h.staff_id=v_staff AND c.sub_department_id=p_sub_department AND c.is_active
 AND h.effective_from<=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date AND (h.effective_to IS NULL OR h.effective_to>=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)
 UNION ALL SELECT h.staff_id,h.scheme_id,d.visited||h.staff_id FROM public.comm_hierarchy h JOIN descendants d ON h.upline_staff_id=d.staff_id AND h.scheme_id=d.scheme_id
 WHERE h.effective_from<=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date AND (h.effective_to IS NULL OR h.effective_to>=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)
 AND cardinality(d.visited)<20 AND NOT h.staff_id=ANY(d.visited)
 ) SELECT EXISTS(SELECT 1 FROM descendants WHERE staff_id=v_original) INTO v_valid;
 IF NOT v_valid THEN RAISE EXCEPTION 'Only yourself or an authorised downline may be proposed for replacement' USING ERRCODE='42501'; END IF;
 IF coalesce(p_detail->>'reason','')='' OR coalesce(p_detail->>'effective','')='' THEN RAISE EXCEPTION 'Reason and effective date are required'; END IF;
 v_date:=(p_detail->>'effective')::date;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce((SELECT f.fields FROM public.member_replacement_forms f ORDER BY f.version DESC LIMIT 1),'[]'::jsonb)) q
  WHERE coalesce((q->>'required')::boolean,false) AND NOT coalesce((q->>'builtin')::boolean,false)
  AND length(trim(coalesce((SELECT a->>'value' FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_detail->'answers')='array' THEN p_detail->'answers' ELSE '[]'::jsonb END) a WHERE a->>'id'=q->>'id' LIMIT 1),'')))=0)
 THEN RAISE EXCEPTION 'Answer every required question on the replacement form'; END IF;
 IF p_detail->>'destination'='transfer' AND NOT EXISTS(SELECT 1 FROM public.comm_sub_departments d JOIN public.hr_staff_costs s ON s.department_id=d.department_id
 WHERE s.id=v_staff AND d.id=(p_detail->>'targetDepartmentId')::uuid AND d.id<>p_sub_department AND d.is_active) THEN RAISE EXCEPTION 'Choose a different valid receiving department'; END IF;
 v_title:=coalesce(nullif(p_detail->>'newPerson',''),'释放席位')||' · Replacement';
 END IF;
 END IF;
 IF p_revision IS NULL THEN
 INSERT INTO public.member_requests(created_by,staff_id,sub_department_id,kind,title,detail,idempotency_key)
 VALUES(auth.uid(),v_staff,p_sub_department,p_kind,v_title,p_detail,p_idempotency) RETURNING id INTO v_id;
 ELSE
 UPDATE public.member_requests SET status='draft',title=v_title,detail=p_detail,idempotency_key=p_idempotency,allocated_staff_id=NULL,note=CASE WHEN status='submitted' THEN 'Updated by the member'||coalesce(' · '||(SELECT string_agg(m.l, ', ' ORDER BY m.o) FROM (VALUES (1,'newPerson',CASE WHEN p_kind='waiting' THEN 'new member name' ELSE 'replacement name' END), (2,'contact','phone number'),(3,'start','preferred start date'),(4,'effective','planned effective date'), (5,'reason','reason and arrangement'),(6,'answers','answers'),(7,'signedFormHash','signed form')) m(o,k,l) WHERE v_existing.detail->m.k IS DISTINCT FROM p_detail->m.k),'') ELSE note END WHERE id=p_revision AND created_by=auth.uid() AND (status='needs_info' OR (status='submitted' AND kind IN ('waiting','replacement')) OR (status='draft' AND kind='claim' AND claim_id IS NOT NULL)) RETURNING id INTO v_id;
 IF v_id IS NULL THEN RAISE EXCEPTION 'Request changed while you were editing; refresh and retry'; END IF;
 END IF;
 RETURN jsonb_build_object('id',v_id,'userId',auth.uid(),'status','draft');
END $function$
;

