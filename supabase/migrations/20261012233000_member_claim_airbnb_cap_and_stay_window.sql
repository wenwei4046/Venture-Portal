-- Airbnb claims, the user's two calls of 2026-10-12.
--
-- 1. The rate per person a night is a CAP, not a fixed amount ("per pax max cap is this amount, not like
--    per pax fix this amount" — "it is different from transport's by spot"). Every Airbnb claim now
--    types its invoice's total and is paid it up to a cap by head count: up to HR's small group, HR's
--    figure a night × nights (as since 2026-10-06); more people, the rate per person a night × people ×
--    nights. Both are stored as they were for the small group: `cap`, `invoiceAmount`, `amount` = the
--    lesser.
-- 2. A stay falls between the day before the fair and the day after it ("开始天减一到结束天加一 … 这个
--    17 到 21 号就是 maximum 他们可以定的日期范围"), with a night of the fair as before. A fair whose days
--    are not known is its weekend's, Friday to Sunday. This replaces "at most 7 nights": the window is
--    the limit (a 7-day fair opens 8 nights).
--
-- member_claim_detail_for — from production's body, md5 16ab593ef7a5a275455b6b9b11b11b20
--   (= 20261012150000_brand_weeks_from_the_erp), two statements swapped: the stay's check and the amount.
-- member_submit_request — from production's body, md5 5a923a78e77864ea6d9b0f6e0062bd30 (the guard of
--   20261011220200), one swap: a claim's description reads "invoice RM 600, up to RM 65 a pax a night"
--   for an Airbnb stay sent with its total, as a small group's already did; one stored before keeps its
--   old line.
-- CREATE OR REPLACE keeps both functions' owner and grants.

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
 IF v_type IS NULL OR v_type NOT IN ('outstation','airbnb') THEN RAISE EXCEPTION 'Choose Outstation or Airbnb'; END IF;
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
END $function$;

CREATE OR REPLACE FUNCTION public.member_submit_request(p_request uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_staff uuid:=public.member_staff_id(); r public.member_requests%ROWTYPE; v_claim uuid; v_name text; v_dept uuid; v_path text; v_desc text;
BEGIN
  PERFORM public.member_send_guard((SELECT mr.kind FROM public.member_requests mr WHERE mr.id = p_request));
 IF NOT public.has_perm('member_requests') THEN RAISE EXCEPTION 'Request access is not enabled' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.member_requests WHERE id=p_request AND created_by=auth.uid() AND staff_id=v_staff FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Request not found' USING ERRCODE='42501'; END IF;
 IF r.status<>'draft' THEN RETURN public.member_request_json(r.id); END IF;
 IF r.kind='claim' THEN
 -- Attachment metadata can only be attested by the server after inspecting its bytes.
 SELECT a.object_path INTO v_path FROM public.member_request_attachments a JOIN storage.objects o ON o.bucket_id='member-invoices' AND o.name=a.object_path
 WHERE a.request_id=r.id AND a.uploaded_by=auth.uid() AND a.content_sha256=r.detail->>'invoiceHash' ORDER BY a.created_at DESC LIMIT 1;
 -- An outstation claim by road is paid by the fixed rate, with no invoice; a plane ticket has one (2026-10-06).
 IF v_path IS NULL AND (coalesce(r.detail->>'claimType','')<>'outstation' OR coalesce((r.detail->>'planeTicket')::boolean,false)) THEN
  RAISE EXCEPTION 'A verified invoice is required before submitting';
 END IF;
 SELECT employee_name,department_id INTO v_name,v_dept FROM public.hr_staff_costs WHERE id=v_staff;
 v_desc:=CASE
  WHEN r.detail->>'claimType'='outstation' AND coalesce((r.detail->>'planeTicket')::boolean,false) THEN
   concat('Plane ticket · ',r.detail->>'base',' → ',r.detail->>'regionName',' · ',r.detail->>'location',' (week of ',r.detail->>'week',')')
  WHEN r.detail->>'claimType'='outstation' THEN
   concat('Outstation · ',r.detail->>'base',' → ',r.detail->>'regionName',' · ',r.detail->>'spots',' spots × RM ',r.detail->>'rate',
   ' · ',r.detail->>'location',' (week of ',r.detail->>'week',')')
  WHEN r.detail->>'claimType'='airbnb' AND coalesce((r.detail->>'group')::boolean,false) THEN
   concat('Airbnb · ',r.detail->>'pax',' pax × ',r.detail->>'nights',' nights · invoice RM ',r.detail->>'invoiceAmount',
   ', up to RM ',r.detail->>'rate',' a night · ',r.detail->>'location','; ',r.detail->>'start',' — ',r.detail->>'end')
  WHEN r.detail->>'claimType'='airbnb' AND r.detail ? 'invoiceAmount' THEN
   concat('Airbnb · ',r.detail->>'pax',' pax × ',r.detail->>'nights',' nights · invoice RM ',r.detail->>'invoiceAmount',
   ', up to RM ',r.detail->>'rate',' a pax a night · ',r.detail->>'location','; ',r.detail->>'start',' — ',r.detail->>'end')
  WHEN r.detail->>'claimType'='airbnb' THEN
   concat('Airbnb · ',r.detail->>'pax',' pax × ',r.detail->>'nights',' nights × RM ',r.detail->>'rate',
   ' · ',r.detail->>'location','; ',r.detail->>'start',' — ',r.detail->>'end')
  ELSE concat(r.detail->>'category',': ',r.detail->>'location','; ',r.detail->>'start',' — ',r.detail->>'end') END;
 IF r.claim_id IS NULL THEN
 INSERT INTO public.claims(claim_type,claimant_name,department_id,amount,description,receipt_url,status,source_pool,created_by)
 VALUES('benefit',v_name,v_dept,(r.detail->>'amount')::numeric,v_desc,
 CASE WHEN v_path IS NULL THEN NULL ELSE 'member-invoices/'||v_path END,'pending','venture_pool',auth.uid()) RETURNING id INTO v_claim;
 ELSE
 UPDATE public.claims SET amount=(r.detail->>'amount')::numeric,
 description=v_desc,
 receipt_url=CASE WHEN v_path IS NULL THEN NULL ELSE 'member-invoices/'||v_path END
 WHERE id=r.claim_id AND created_by=auth.uid() AND status='pending' RETURNING id INTO v_claim;
 IF v_claim IS NULL THEN RAISE EXCEPTION 'Claim has already been reviewed; its approved amount and invoice cannot be changed'; END IF;
 END IF;
 END IF;
 IF r.kind='waiting' AND coalesce((SELECT f.require_upload FROM public.member_waiting_forms f ORDER BY f.version DESC LIMIT 1),false)
 AND NOT EXISTS(SELECT 1 FROM public.member_request_attachments a JOIN storage.objects o ON o.bucket_id='member-invoices' AND o.name=a.object_path
  WHERE a.request_id=r.id AND a.uploaded_by=auth.uid() AND a.content_sha256=r.detail->>'signedFormHash') THEN
  RAISE EXCEPTION 'Upload the signed application form before sending';
 END IF;
 IF r.kind='replacement' AND coalesce((SELECT f.require_upload FROM public.member_replacement_forms f ORDER BY f.version DESC LIMIT 1),false)
 AND NOT EXISTS(SELECT 1 FROM public.member_request_attachments a JOIN storage.objects o ON o.bucket_id='member-invoices' AND o.name=a.object_path
  WHERE a.request_id=r.id AND a.uploaded_by=auth.uid() AND a.content_sha256=r.detail->>'signedFormHash') THEN
  RAISE EXCEPTION 'Upload the signed replacement form before sending';
 END IF;
 UPDATE public.member_requests SET status='submitted',submitted_at=now(),claim_id=v_claim WHERE id=r.id;
 RETURN public.member_request_json(r.id);
END $function$;
