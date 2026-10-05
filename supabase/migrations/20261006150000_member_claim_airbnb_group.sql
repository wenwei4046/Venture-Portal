-- ════════════════════════════════════════════════════════════════════════════
-- Airbnb: a small group claims its invoice up to HR's cap a night, and HR sets
-- how small; Claim rates lists the ERP's venues only (2026-10-06, user)
--
-- 1. SMALL GROUPS. Replaces 20261006050000's "exactly three share one rate a
--    night". HR sets the head count (`airbnb_group_max_pax`, 3 to start) and the
--    cap a night (`airbnb_group_cap_per_night` — the column that held the RM 220
--    HR saved for three, renamed). Up to that many people, the member types the
--    invoice's total and the claim is that, up to cap × nights — for one, two or
--    three people alike (user: N = 3, RM 220, 2 nights, invoice RM 500 → 220 × 2
--    = RM 440). More people: RM 65 a person a night, worked out, nothing typed
--    (user: 如果超过了上限人数…一个人 65 块，当时算下来是多少就是多少). No cap set:
--    every group per person, as before.
--
-- 2. THE ERP'S VENUES. Claim rates listed every venue of comm_venue_events: the
--    ERP's fairs AND the portal's own June–August calendar, typed by hand before
--    the ERP named the fairs, which spelt the same halls differently (BUKIT JALIL
--    STADIUM / STADIUM BUKIT JALIL, MITC MELAKA / MELAKA INTERNATIONAL TRADE
--    CENTRE). HR now sees only the venues an ERP fair names (user: 这些 Venue 本身
--    都是 synchronized from House ERP 的 Venue list，为什么…重复的？). A claim is only
--    for this month's or last month's weekends, every one of them ERP-named; the
--    regions already set for the old spellings stay, unused.
--
-- Money: no claim exists yet (0 member_requests). RM 25 a spot, RM 65 a person a
-- night, the flown regions and the venues' regions are untouched; the RM 220 now
-- caps a group of up to 3 instead of paying exactly 3.
--
-- The app still live calls the six-argument save and reads `perThreePaxNight`
-- until this ships: both keep working (the save keeps N; the key stays an alias).
--
-- Rollback: the functions as in 20261006050000;
--   ALTER TABLE member_claim_rates RENAME COLUMN airbnb_group_cap_per_night TO airbnb_three_pax_per_night;
--   ALTER TABLE member_claim_rates DROP COLUMN airbnb_group_max_pax;
--   DROP FUNCTION member_admin_save_claim_settings(text,numeric,numeric,jsonb,integer,numeric,jsonb);
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.member_claim_rates RENAME COLUMN airbnb_three_pax_per_night TO airbnb_group_cap_per_night;
COMMENT ON COLUMN public.member_claim_rates.airbnb_group_cap_per_night IS
 'Airbnb for a small group (up to airbnb_group_max_pax people): the most a night their invoice is paid up to (user 2026-10-06). Null = every group is paid per person.';
ALTER TABLE public.member_claim_rates ADD COLUMN IF NOT EXISTS airbnb_group_max_pax integer NOT NULL DEFAULT 3
 CHECK (airbnb_group_max_pax BETWEEN 1 AND 40);
COMMENT ON COLUMN public.member_claim_rates.airbnb_group_max_pax IS
 'Airbnb: up to this many people claim their invoice, up to airbnb_group_cap_per_night a night; more are paid per person (user 2026-10-06).';

-- ─── A fair claim as stored ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.member_claim_detail_for(p_detail jsonb, p_staff uuid, p_sub uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_type text := p_detail->>'claimType'; v_rates public.member_claim_rates%ROWTYPE; v_region public.member_claim_regions%ROWTYPE;
 v_week date; v_booth jsonb; v_fair uuid; v_venue_key text; v_venue text; v_fair_facts jsonb;
 v_start date; v_end date; v_pax integer; v_nights integer; v_group boolean; v_cap numeric; v_invoice numeric;
BEGIN
 IF v_type IS NULL OR v_type NOT IN ('outstation','airbnb') THEN RAISE EXCEPTION 'Choose Outstation or Airbnb'; END IF;
 IF coalesce(p_detail->>'week','')!~'^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Choose the brand week the claim is for'; END IF;
 v_week := (p_detail->>'week')::date;
 v_booth := public.member_claim_brand_week(p_staff, p_sub, v_week);
 IF v_booth IS NULL THEN
  RAISE EXCEPTION 'A claim is for your own brand week, and you have none that weekend. Pick it in My brand weeks, or ask HR.';
 END IF;
 v_fair := (v_booth->>'fairId')::uuid;
 SELECT e.venue_key, coalesce(nullif(btrim(v.display_name),''), e.venue_key) INTO v_venue_key, v_venue
  FROM public.comm_venue_events e LEFT JOIN public.comm_venues v ON v.venue_key=e.venue_key WHERE e.id=v_fair;
 -- What the claim is for comes from the database's own records, over whatever the phone sent.
 v_fair_facts := jsonb_build_object('week',v_week,'fairId',v_fair,'brand',v_booth->>'brand','location',v_venue,
  'venueKey',v_venue_key,'brandWeekPicked',coalesce((v_booth->>'picked')::boolean,false));
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
 IF coalesce(p_detail->>'invoiceHash','')!~'^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'A verified invoice is required'; END IF;
 IF coalesce(p_detail->>'start','')!~'^\d{4}-\d{2}-\d{2}$' OR coalesce(p_detail->>'end','')!~'^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Enter the check-in and check-out dates'; END IF;
 v_start := (p_detail->>'start')::date; v_end := (p_detail->>'end')::date;
 IF v_end<=v_start THEN RAISE EXCEPTION 'Check-out must be after check-in'; END IF;
 v_nights := v_end-v_start;
 IF v_nights>31 THEN RAISE EXCEPTION 'A stay of more than 31 nights is not a fair claim'; END IF;
 IF coalesce(p_detail->>'male','')!~'^\d{1,2}$' OR coalesce(p_detail->>'female','')!~'^\d{1,2}$' THEN RAISE EXCEPTION 'Check who stayed'; END IF;
 v_pax := (p_detail->>'male')::integer+(p_detail->>'female')::integer;
 IF v_pax<1 OR v_pax>40 THEN RAISE EXCEPTION 'Check who stayed'; END IF;
 -- By head count only. A small group claims its invoice, up to HR's cap a night; a bigger one is
 -- paid per person per night, nothing typed.
 v_group := v_pax<=coalesce(v_rates.airbnb_group_max_pax,3) AND coalesce(v_rates.airbnb_group_cap_per_night,0)>0;
 IF v_group THEN
  IF coalesce(p_detail->>'invoiceAmount','')!~'^\d{1,9}(\.\d{1,2})?$' OR (p_detail->>'invoiceAmount')::numeric<=0 THEN
   RAISE EXCEPTION 'Enter the stay''s total from its invoice';
  END IF;
  v_invoice := round((p_detail->>'invoiceAmount')::numeric,2);
  v_cap := round(v_nights*v_rates.airbnb_group_cap_per_night,2);
  RETURN (p_detail - 'region' - 'regionName' - 'spots' - 'amount' - 'planeTicket' - 'base' - 'threePax')
   || v_fair_facts || jsonb_build_object('category','Airbnb accommodation','pax',v_pax,'nights',v_nights,'group',true,
    'rate',v_rates.airbnb_group_cap_per_night,'cap',v_cap,'invoiceAmount',v_invoice,'amount',least(v_invoice,v_cap));
 END IF;
 IF coalesce(v_rates.airbnb_rate_per_pax_night,0)<=0 THEN RAISE EXCEPTION 'HR has not set the Airbnb rate yet'; END IF;
 RETURN (p_detail - 'region' - 'regionName' - 'spots' - 'amount' - 'planeTicket' - 'base' - 'threePax' - 'cap' - 'invoiceAmount')
  || v_fair_facts || jsonb_build_object('category','Airbnb accommodation','pax',v_pax,'nights',v_nights,'group',false,
   'rate',v_rates.airbnb_rate_per_pax_night,'amount',round(v_pax*v_nights*v_rates.airbnb_rate_per_pax_night,2));
END $function$;

-- member_submit_request: a small group's benefit claim says what the invoice was
-- and what it was capped at. Everything else is 20261006050000's.
CREATE OR REPLACE FUNCTION public.member_submit_request(p_request uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_staff uuid:=public.member_staff_id(); r public.member_requests%ROWTYPE; v_claim uuid; v_name text; v_dept uuid; v_path text; v_desc text;
BEGIN
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
 UPDATE public.member_requests SET status='submitted',submitted_at=now(),claim_id=v_claim WHERE id=r.id;
 RETURN public.member_request_json(r.id);
END $function$;

-- ─── What the member's form reads ───────────────────────────────────────────

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
$function$;
REVOKE ALL ON FUNCTION public.member_claim_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_claim_settings() TO authenticated;

-- ─── HR's side (People › Member services › Claim rates) ─────────────────────

-- The venues an ERP fair names, newest fair first, with the region HR set for
-- each; the rates; the regions. `perThreePaxNight` repeats the group cap for the
-- page still live until this ships.
CREATE OR REPLACE FUNCTION public.member_admin_claim_settings()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 IF NOT public.member_is_manager('member_requests_manage') THEN RAISE EXCEPTION 'HR request management access is required' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object(
  'base',coalesce((SELECT base_name FROM public.member_claim_rates WHERE id),'Klang Valley'),
  'perSpot',(SELECT rate_per_spot FROM public.member_claim_rates WHERE id),
  'perPaxNight',(SELECT airbnb_rate_per_pax_night FROM public.member_claim_rates WHERE id),
  'groupMaxPax',coalesce((SELECT airbnb_group_max_pax FROM public.member_claim_rates WHERE id),3),
  'groupCapPerNight',(SELECT airbnb_group_cap_per_night FROM public.member_claim_rates WHERE id),
  'perThreePaxNight',(SELECT airbnb_group_cap_per_night FROM public.member_claim_rates WHERE id),
  'updatedAt',(SELECT updated_at FROM public.member_claim_rates WHERE id),
  'updatedBy',(SELECT u.name FROM public.member_claim_rates r JOIN public.users u ON u.id=r.updated_by WHERE r.id),
  'regions',coalesce((SELECT jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'spots',g.spots,'active',g.is_active,'planeTicket',g.plane_ticket) ORDER BY g.sort_order, g.name)
   FROM public.member_claim_regions g),'[]'::jsonb),
  'venues',coalesce((SELECT jsonb_agg(jsonb_build_object('key',x.venue_key,'name',x.name,'fairs',x.fairs,'lastFair',x.last_fair,'regionId',m.region_id)
    ORDER BY x.last_fair DESC NULLS LAST, x.name)
   FROM (SELECT e.venue_key, min(coalesce(nullif(btrim(v.display_name),''),e.venue_key)) AS name, count(*) AS fairs, max(e.end_date) AS last_fair
         FROM public.comm_venue_events e LEFT JOIN public.comm_venues v ON v.venue_key=e.venue_key
         WHERE nullif(btrim(e.venue_key),'') IS NOT NULL
         GROUP BY e.venue_key
         HAVING bool_or(e.source='erp')) x
   LEFT JOIN public.member_claim_venue_regions m ON m.venue_key=x.venue_key),'[]'::jsonb));
END $function$;
REVOKE ALL ON FUNCTION public.member_admin_claim_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_admin_claim_settings() TO authenticated;

-- HR saves the rates, the regions in order ({id?, name, spots, planeTicket?}) — a
-- region left out is retired — the Airbnb small group (how many people, the cap
-- a night) and the venues' regions ({key, region: a region's name, or null to
-- clear}). p_venues null leaves every venue as it is.
CREATE OR REPLACE FUNCTION public.member_admin_save_claim_settings(p_base text, p_per_spot numeric, p_per_pax_night numeric, p_regions jsonb,
 p_group_max_pax integer, p_group_cap numeric, p_venues jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_row jsonb; v_i integer := 0; v_keep uuid[] := '{}'; v_id uuid; v_key text; v_region uuid;
BEGIN
 IF NOT public.member_is_manager('member_requests_manage') THEN RAISE EXCEPTION 'HR request management access is required' USING ERRCODE='42501'; END IF;
 IF p_base IS NULL OR length(trim(p_base)) NOT BETWEEN 1 AND 60 THEN RAISE EXCEPTION 'Name the base every route starts from'; END IF;
 IF (p_per_spot IS NOT NULL AND (p_per_spot<0 OR p_per_spot>100000)) OR (p_per_pax_night IS NOT NULL AND (p_per_pax_night<0 OR p_per_pax_night>100000))
  OR (p_group_cap IS NOT NULL AND (p_group_cap<0 OR p_group_cap>100000)) THEN
  RAISE EXCEPTION 'Rates must be between RM 0 and RM 100,000';
 END IF;
 IF p_group_max_pax IS NULL OR p_group_max_pax NOT BETWEEN 1 AND 40 THEN RAISE EXCEPTION 'A small group is 1 to 40 people'; END IF;
 IF jsonb_typeof(p_regions)<>'array' OR jsonb_array_length(p_regions)>60 THEN RAISE EXCEPTION 'Invalid regions'; END IF;
 IF p_venues IS NOT NULL AND (jsonb_typeof(p_venues)<>'array' OR jsonb_array_length(p_venues)>1000) THEN RAISE EXCEPTION 'Invalid venues'; END IF;
 INSERT INTO public.member_claim_rates (id, base_name, rate_per_spot, airbnb_rate_per_pax_night, airbnb_group_max_pax, airbnb_group_cap_per_night, updated_at, updated_by)
 VALUES (true, trim(p_base), p_per_spot, p_per_pax_night, p_group_max_pax, p_group_cap, now(), auth.uid())
 ON CONFLICT (id) DO UPDATE SET base_name=EXCLUDED.base_name, rate_per_spot=EXCLUDED.rate_per_spot,
  airbnb_rate_per_pax_night=EXCLUDED.airbnb_rate_per_pax_night, airbnb_group_max_pax=EXCLUDED.airbnb_group_max_pax,
  airbnb_group_cap_per_night=EXCLUDED.airbnb_group_cap_per_night, updated_at=now(), updated_by=auth.uid();
 FOR v_row IN SELECT value FROM jsonb_array_elements(p_regions) LOOP
  v_i := v_i+1;
  IF coalesce(trim(v_row->>'name'),'')='' OR length(trim(v_row->>'name'))>40 THEN RAISE EXCEPTION 'Every region needs a name'; END IF;
  IF coalesce(v_row->>'spots','')!~'^\d{1,3}$' OR (v_row->>'spots')::integer>100 THEN RAISE EXCEPTION 'Spots must be a whole number from 0 to 100'; END IF;
  IF v_row ? 'planeTicket' AND jsonb_typeof(v_row->'planeTicket')<>'boolean' THEN RAISE EXCEPTION 'Plane ticket is ticked or not'; END IF;
  v_id := CASE WHEN coalesce(v_row->>'id','')~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (v_row->>'id')::uuid END;
  IF v_id IS NULL THEN SELECT id INTO v_id FROM public.member_claim_regions WHERE lower(trim(name))=lower(trim(v_row->>'name')); END IF;
  IF v_id IS NULL THEN
   INSERT INTO public.member_claim_regions (name, spots, sort_order, is_active, plane_ticket, updated_at, updated_by)
   VALUES (trim(v_row->>'name'), (v_row->>'spots')::integer, v_i, true, coalesce((v_row->>'planeTicket')::boolean,false), now(), auth.uid()) RETURNING id INTO v_id;
  ELSE
   UPDATE public.member_claim_regions SET name=trim(v_row->>'name'), spots=(v_row->>'spots')::integer, sort_order=v_i,
    is_active=true, plane_ticket=CASE WHEN v_row ? 'planeTicket' THEN (v_row->>'planeTicket')::boolean ELSE plane_ticket END,
    updated_at=now(), updated_by=auth.uid() WHERE id=v_id;
  END IF;
  IF v_id=ANY(v_keep) THEN RAISE EXCEPTION 'Two regions share the name %', trim(v_row->>'name'); END IF;
  v_keep := v_keep||v_id;
 END LOOP;
 UPDATE public.member_claim_regions SET is_active=false, updated_at=now(), updated_by=auth.uid() WHERE is_active AND NOT (id=ANY(v_keep));
 IF p_venues IS NOT NULL THEN
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_venues) LOOP
   v_key := v_row->>'key';
   IF coalesce(btrim(v_key),'')='' OR NOT EXISTS(SELECT 1 FROM public.comm_venue_events WHERE venue_key=v_key) THEN
    RAISE EXCEPTION 'No fair has been held at %', coalesce(v_key,'that venue');
   END IF;
   IF coalesce(btrim(v_row->>'region'),'')='' THEN
    DELETE FROM public.member_claim_venue_regions WHERE venue_key=v_key;
   ELSE
    SELECT id INTO v_region FROM public.member_claim_regions WHERE is_active AND lower(trim(name))=lower(trim(v_row->>'region'));
    IF v_region IS NULL THEN RAISE EXCEPTION 'There is no region called %', v_row->>'region'; END IF;
    INSERT INTO public.member_claim_venue_regions (venue_key, region_id, updated_at, updated_by)
    VALUES (v_key, v_region, now(), auth.uid())
    ON CONFLICT (venue_key) DO UPDATE SET region_id=EXCLUDED.region_id, updated_at=now(), updated_by=auth.uid()
     WHERE member_claim_venue_regions.region_id IS DISTINCT FROM EXCLUDED.region_id;
   END IF;
  END LOOP;
 END IF;
 RETURN public.member_admin_claim_settings();
END $function$;
REVOKE ALL ON FUNCTION public.member_admin_save_claim_settings(text, numeric, numeric, jsonb, integer, numeric, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_admin_save_claim_settings(text, numeric, numeric, jsonb, integer, numeric, jsonb) TO authenticated;

-- The six-argument save (20261006050000) the page still live calls: its
-- three-person rate is the group cap now, and the head count stays as it is.
CREATE OR REPLACE FUNCTION public.member_admin_save_claim_settings(p_base text, p_per_spot numeric, p_per_pax_night numeric, p_regions jsonb,
 p_three_pax_night numeric, p_venues jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 RETURN public.member_admin_save_claim_settings(p_base, p_per_spot, p_per_pax_night, p_regions,
  coalesce((SELECT airbnb_group_max_pax FROM public.member_claim_rates WHERE id),3), p_three_pax_night, p_venues);
END $function$;

-- The four-argument save (20261005030000): the small group and the venues stay as they are.
CREATE OR REPLACE FUNCTION public.member_admin_save_claim_settings(p_base text, p_per_spot numeric, p_per_pax_night numeric, p_regions jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 RETURN public.member_admin_save_claim_settings(p_base, p_per_spot, p_per_pax_night, p_regions,
  coalesce((SELECT airbnb_group_max_pax FROM public.member_claim_rates WHERE id),3),
  (SELECT airbnb_group_cap_per_night FROM public.member_claim_rates WHERE id), NULL::jsonb);
END $function$;
