-- ════════════════════════════════════════════════════════════════════════════
-- A fair claim is for the member's own brand week, its region comes from the
-- fair's venue, some regions fly, and three people share one Airbnb rate
-- (2026-10-06, user)
--
-- 1. ONLY YOUR BRAND WEEK. A claim names a fair weekend (`week`, its Friday);
--    the fair is the booth the Arena scores the member at that weekend — the
--    brand they picked in My brand weeks, else the one they opened the most
--    bills for (user: 他不能 claim 其他不属于他的 brand week … 没有选择 brand
--    week，就 auto-allocate 给他). member_claim_brand_week() reads it from
--    member_arena_booth_history_for_staff, the very boards the app shows. A
--    member with no brand week that weekend has nothing to claim. The fair,
--    its venue and the brand are written onto the claim by the database; what
--    the phone sent for them is overwritten.
--
-- 2. THE VENUE SETS THE REGION. member_claim_venue_regions maps each venue the
--    ERP's fairs name (comm_venue_events.venue_key, listed as they arrive) to a
--    region; HR sets it on People › Member services › Claim rates (user: 这个
--    venue 本身就会 auto detect ERP 里面现有的所有 venue，在这边选 region 就可以了).
--    The member no longer picks a region. A venue HR has not mapped cannot be
--    claimed for yet (user's choice).
--
-- 3. PLANE TICKETS. A region may be ticked `plane_ticket` (Sabah, Sarawak —
--    HR ticks them). An outstation claim there is the ticket's price, typed by
--    the member with the ticket's invoice, no cap (user: 飞机票我们是没有一个
--    fixed amount 的); HR checks it against the invoice.
--
-- 4. THREE PEOPLE. Airbnb is per person per night, by head count only (user:
--    no need count as boy and girl); exactly three people share
--    `airbnb_three_pax_per_night` instead — a mixed group of three needs two
--    rooms (user: 3 pax → the limit I set, e.g. 220; more than 3 → 65 per pax).
--    Null = three are paid per person like everybody else.
--
-- Money: no claim exists yet (0 member_requests on 2026-10-06), so nothing
-- already sent changes. The rates already set (RM 25 a spot, RM 65 a person a
-- night) are untouched; nothing is ticked, mapped or set by this migration.
--
-- Rollback:
--   member_prepare_request / member_submit_request / member_claim_settings /
--   member_admin_claim_settings / the 4-argument member_admin_save_claim_settings
--   as in 20261005030000;
--   DROP FUNCTION member_admin_save_claim_settings(text,numeric,numeric,jsonb,numeric,jsonb),
--     member_claim_detail_for(jsonb,uuid,uuid), member_claim_brand_week(uuid,uuid,date);
--   DROP TABLE member_claim_venue_regions;
--   ALTER TABLE member_claim_regions DROP COLUMN plane_ticket;
--   ALTER TABLE member_claim_rates DROP COLUMN airbnb_three_pax_per_night;
-- ════════════════════════════════════════════════════════════════════════════

-- ─── The new facts ──────────────────────────────────────────────────────────

ALTER TABLE public.member_claim_regions ADD COLUMN IF NOT EXISTS plane_ticket boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.member_claim_regions.plane_ticket IS
 'The fairs here are flown to (Sabah, Sarawak): an outstation claim is the plane ticket''s price, typed by the member with its invoice — no spots, no cap (user 2026-10-06).';

ALTER TABLE public.member_claim_rates ADD COLUMN IF NOT EXISTS airbnb_three_pax_per_night numeric(15,2)
 CHECK (airbnb_three_pax_per_night IS NULL OR airbnb_three_pax_per_night >= 0);
COMMENT ON COLUMN public.member_claim_rates.airbnb_three_pax_per_night IS
 'Airbnb for exactly three people: RM a night for the three together, whoever they are (user 2026-10-06). Null = three are paid per person like everybody else.';

CREATE TABLE IF NOT EXISTS public.member_claim_venue_regions (
 venue_key text PRIMARY KEY CHECK (length(btrim(venue_key)) BETWEEN 1 AND 200),
 region_id uuid NOT NULL REFERENCES public.member_claim_regions(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL
);
COMMENT ON TABLE public.member_claim_venue_regions IS
 'The region each fair venue is in (2026-10-06): an outstation claim''s region is the one HR set for its fair''s venue (comm_venue_events.venue_key), never the member''s pick. Written by member_admin_save_claim_settings only.';
ALTER TABLE public.member_claim_venue_regions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS member_claim_venue_regions_read ON public.member_claim_venue_regions;
CREATE POLICY member_claim_venue_regions_read ON public.member_claim_venue_regions FOR SELECT TO authenticated
 USING ((SELECT public.member_is_manager('member_requests_manage')));
REVOKE ALL ON public.member_claim_venue_regions FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.member_claim_venue_regions FROM authenticated;

-- ─── 1. The member's brand week, as the Arena has it ────────────────────────

-- The booth a member's claim for a fair weekend is about: the one the Arena
-- scores them at (their pick, else the brand they opened the most bills for),
-- else — picked, but nothing written at that brand's booth — that brand's
-- booth there with the most bills. NULL: no brand week that weekend.
CREATE OR REPLACE FUNCTION public.member_claim_brand_week(p_staff uuid, p_sub uuid, p_week date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_today date:=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date; v_scheme uuid; v_events jsonb; v_event jsonb; v_pick text; v_picked boolean;
BEGIN
 SELECT c.id INTO v_scheme FROM public.comm_hierarchy h JOIN public.comm_schemes c ON c.id=h.scheme_id
  WHERE h.staff_id=p_staff AND c.sub_department_id=p_sub AND c.is_active
   AND h.effective_from<=v_today AND (h.effective_to IS NULL OR h.effective_to>=v_today)
   AND c.effective_from<=v_today AND (c.effective_to IS NULL OR c.effective_to>=v_today)
  ORDER BY c.effective_from DESC LIMIT 1;
 IF v_scheme IS NULL THEN RETURN NULL; END IF;
 v_events:=coalesce(public.member_arena_booth_history_for_staff(p_sub,v_scheme)->'events','[]'::jsonb);
 SELECT e INTO v_event FROM jsonb_array_elements(v_events) e
  WHERE e->>'week'=p_week::text AND EXISTS(SELECT 1 FROM jsonb_array_elements(e->'people') p
   WHERE p->>'id'=p_staff::text AND coalesce((p->>'scoring')::boolean,true))
  LIMIT 1;
 IF v_event IS NOT NULL THEN
  SELECT coalesce((p->>'confirmed')::boolean,false) INTO v_picked FROM jsonb_array_elements(v_event->'people') p WHERE p->>'id'=p_staff::text LIMIT 1;
  RETURN (v_event - 'people') || jsonb_build_object('picked',coalesce(v_picked,false));
 END IF;
 SELECT k.value INTO v_pick FROM public.member_arena_brand_weeks w CROSS JOIN LATERAL jsonb_each_text(w.picks) k
  WHERE w.staff_id=p_staff AND w.sub_department_id=p_sub AND k.key=p_week::text AND nullif(btrim(k.value),'') IS NOT NULL
  LIMIT 1;
 IF v_pick IS NULL THEN RETURN NULL; END IF;
 SELECT e INTO v_event FROM jsonb_array_elements(v_events) e
  WHERE e->>'week'=p_week::text AND e->>'brand'=v_pick
  ORDER BY (SELECT coalesce(sum((p->>'orders')::numeric),0) FROM jsonb_array_elements(e->'people') p) DESC, e->>'id'
  LIMIT 1;
 IF v_event IS NULL THEN RETURN NULL; END IF;
 RETURN (v_event - 'people') || jsonb_build_object('picked',true);
END $function$;
REVOKE ALL ON FUNCTION public.member_claim_brand_week(uuid, uuid, date) FROM PUBLIC, anon, authenticated;

-- ─── 2–4. A fair claim as stored: its fair, its region, its amount ─────────

CREATE OR REPLACE FUNCTION public.member_claim_detail_for(p_detail jsonb, p_staff uuid, p_sub uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_type text := p_detail->>'claimType'; v_rates public.member_claim_rates%ROWTYPE; v_region public.member_claim_regions%ROWTYPE;
 v_week date; v_booth jsonb; v_fair uuid; v_venue_key text; v_venue text; v_fair_facts jsonb;
 v_start date; v_end date; v_pax integer; v_nights integer; v_three boolean; v_rate numeric;
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
   RETURN (p_detail - 'region' - 'regionName' - 'spots' - 'rate' - 'start' - 'end' - 'male' - 'female' - 'pax' - 'nights' - 'threePax')
    || v_fair_facts || jsonb_build_object('category','Plane ticket','base',v_rates.base_name,'region',v_region.id,
     'regionName',v_region.name,'planeTicket',true,'amount',round((p_detail->>'amount')::numeric,2));
  END IF;
  IF v_region.spots<=0 THEN RAISE EXCEPTION '% is in %, local to %, so there is no outstation claim', v_venue, v_region.name, coalesce(v_rates.base_name,'Klang Valley'); END IF;
  IF coalesce(v_rates.rate_per_spot,0)<=0 THEN RAISE EXCEPTION 'HR has not set the rate per spot yet'; END IF;
  RETURN (p_detail - 'invoiceHash' - 'invoiceName' - 'start' - 'end' - 'male' - 'female' - 'pax' - 'nights' - 'amount' - 'planeTicket' - 'threePax')
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
 -- By head count only; exactly three share one rate a night when HR has set it.
 v_three := v_pax=3 AND coalesce(v_rates.airbnb_three_pax_per_night,0)>0;
 v_rate := CASE WHEN v_three THEN v_rates.airbnb_three_pax_per_night ELSE v_rates.airbnb_rate_per_pax_night END;
 IF coalesce(v_rate,0)<=0 THEN RAISE EXCEPTION 'HR has not set the Airbnb rate yet'; END IF;
 RETURN (p_detail - 'region' - 'regionName' - 'spots' - 'amount' - 'planeTicket' - 'base')
  || v_fair_facts || jsonb_build_object('category','Airbnb accommodation','pax',v_pax,'nights',v_nights,'threePax',v_three,
   'rate',v_rate,'amount',round(v_nights*CASE WHEN v_three THEN v_rate ELSE v_pax*v_rate END,2));
END $function$;
REVOKE ALL ON FUNCTION public.member_claim_detail_for(jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.member_claim_detail(jsonb) IS
 'Superseded 2026-10-06 by member_claim_detail_for(detail, staff, sub-department): a claim is for the member''s own brand week, and its region is its venue''s. Kept for rollback; nothing calls it.';

-- member_prepare_request: a fair claim is worked out for the member and the
-- sub-department it is sent from; a plane ticket's title says so. Everything
-- else is 20261005030000's, unchanged.
CREATE OR REPLACE FUNCTION public.member_prepare_request(p_kind text, p_sub_department uuid, p_detail jsonb, p_idempotency uuid, p_revision uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_staff uuid:=public.member_staff_id(); v_existing public.member_requests%ROWTYPE; v_id uuid; v_title text;
 v_original uuid; v_valid boolean; v_date date;
BEGIN
 IF NOT public.has_perm('member_requests') THEN RAISE EXCEPTION 'Request access is not enabled' USING ERRCODE='42501'; END IF;
 IF p_kind NOT IN ('claim','replacement','waiting') OR p_idempotency IS NULL OR jsonb_typeof(p_detail)<>'object' OR octet_length(p_detail::text)>120000 THEN RAISE EXCEPTION 'Invalid request'; END IF;
 -- A fair claim: its brand week's fair, its venue's region and HR's rate, worked out here — never sent.
 IF p_kind='claim' AND p_detail ? 'claimType' THEN p_detail := public.member_claim_detail_for(p_detail, v_staff, p_sub_department); END IF;
 IF p_revision IS NOT NULL THEN
 SELECT * INTO v_existing FROM public.member_requests WHERE id=p_revision AND created_by=auth.uid() AND staff_id=v_staff FOR UPDATE;
 IF NOT FOUND OR v_existing.kind<>p_kind OR v_existing.sub_department_id<>p_sub_department OR v_existing.idempotency_key<>p_idempotency THEN RAISE EXCEPTION 'Only your returned request may be revised' USING ERRCODE='42501'; END IF;
 IF v_existing.status<>'needs_info' THEN
 IF v_existing.detail=p_detail AND v_existing.status IN('draft','submitted') THEN RETURN jsonb_build_object('id',v_existing.id,'userId',auth.uid(),'status',v_existing.status); END IF;
 RAISE EXCEPTION 'Request is no longer awaiting your information; refresh and retry';
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
 v_title:=CASE WHEN coalesce((p_detail->>'planeTicket')::boolean,false) THEN 'Plane ticket claim'
  WHEN p_detail->>'claimType'='outstation' THEN 'Outstation claim' ELSE 'Airbnb claim' END
  ||CASE WHEN coalesce(p_detail->>'location','')<>'' THEN ' · '||(p_detail->>'location') ELSE '' END;
 ELSIF p_kind='claim' THEN
 IF coalesce(p_detail->>'invoiceHash','')!~'^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'A verified invoice hash is required'; END IF;
 IF coalesce(p_detail->>'location','')='' OR coalesce(p_detail->>'start','')='' OR coalesce(p_detail->>'end','')='' THEN RAISE EXCEPTION 'Location and stay dates are required'; END IF;
 IF (p_detail->>'amount')::numeric<=0 OR (p_detail->>'amount')::numeric>999999999 THEN RAISE EXCEPTION 'Invalid claim amount'; END IF;
 IF (p_detail->>'end')::date<(p_detail->>'start')::date THEN RAISE EXCEPTION 'Check-out must not precede check-in'; END IF;
 v_title:=(p_detail->>'location')||' · 住宿报销';
 ELSE
 IF length(trim(coalesce(p_detail->>'newPerson','')))<1 AND NOT(p_kind='replacement' AND p_detail->>'replacementSource'='vacancy') THEN RAISE EXCEPTION 'Applicant name is required'; END IF;
 IF p_kind='waiting' THEN
 IF coalesce(p_detail->>'contact','')='' OR coalesce(p_detail->>'signature','')='' OR (p_detail->>'consent') IS DISTINCT FROM 'true' OR coalesce(p_detail->>'start','')='' THEN RAISE EXCEPTION 'Applicant contact, date, signature and confirmation are required'; END IF;
 v_date:=(p_detail->>'start')::date;
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
 IF p_detail->>'destination'='transfer' AND NOT EXISTS(SELECT 1 FROM public.comm_sub_departments d JOIN public.hr_staff_costs s ON s.department_id=d.department_id
 WHERE s.id=v_staff AND d.id=(p_detail->>'targetDepartmentId')::uuid AND d.id<>p_sub_department AND d.is_active) THEN RAISE EXCEPTION 'Choose a different valid receiving department'; END IF;
 v_title:=coalesce(nullif(p_detail->>'newPerson',''),'释放席位')||' · Replacement';
 END IF;
 END IF;
 IF p_revision IS NULL THEN
 INSERT INTO public.member_requests(created_by,staff_id,sub_department_id,kind,title,detail,idempotency_key)
 VALUES(auth.uid(),v_staff,p_sub_department,p_kind,v_title,p_detail,p_idempotency) RETURNING id INTO v_id;
 ELSE
 UPDATE public.member_requests SET status='draft',title=v_title,detail=p_detail,idempotency_key=p_idempotency,allocated_staff_id=NULL WHERE id=p_revision AND created_by=auth.uid() AND status='needs_info' RETURNING id INTO v_id;
 IF v_id IS NULL THEN RAISE EXCEPTION 'Request changed while you were editing; refresh and retry'; END IF;
 END IF;
 RETURN jsonb_build_object('id',v_id,'userId',auth.uid(),'status','draft');
END $function$;

-- member_submit_request: a plane ticket needs its invoice as an Airbnb stay does;
-- the benefit claim says what each kind is for. Everything else is unchanged.
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
  WHEN r.detail->>'claimType'='airbnb' AND coalesce((r.detail->>'threePax')::boolean,false) THEN
   concat('Airbnb · 3 pax · ',r.detail->>'nights',' nights × RM ',r.detail->>'rate',' a night for the three · ',r.detail->>'location','; ',r.detail->>'start',' — ',r.detail->>'end')
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

-- The rates, the active regions (and which fly), and the fairs a claim can be
-- for now — this month and last — each with the region HR set for its venue.
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
  'perThreePaxNight',(SELECT airbnb_three_pax_per_night FROM public.member_claim_rates WHERE id),
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

-- Every venue the ERP's fairs have named, newest fair first, with the region
-- HR set for it (null = not yet), beside the rates and regions.
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
  'perThreePaxNight',(SELECT airbnb_three_pax_per_night FROM public.member_claim_rates WHERE id),
  'updatedAt',(SELECT updated_at FROM public.member_claim_rates WHERE id),
  'updatedBy',(SELECT u.name FROM public.member_claim_rates r JOIN public.users u ON u.id=r.updated_by WHERE r.id),
  'regions',coalesce((SELECT jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'spots',g.spots,'active',g.is_active,'planeTicket',g.plane_ticket) ORDER BY g.sort_order, g.name)
   FROM public.member_claim_regions g),'[]'::jsonb),
  'venues',coalesce((SELECT jsonb_agg(jsonb_build_object('key',x.venue_key,'name',x.name,'fairs',x.fairs,'lastFair',x.last_fair,'regionId',m.region_id)
    ORDER BY x.last_fair DESC NULLS LAST, x.name)
   FROM (SELECT e.venue_key, min(coalesce(nullif(btrim(v.display_name),''),e.venue_key)) AS name, count(*) AS fairs, max(e.end_date) AS last_fair
         FROM public.comm_venue_events e LEFT JOIN public.comm_venues v ON v.venue_key=e.venue_key
         WHERE nullif(btrim(e.venue_key),'') IS NOT NULL
         GROUP BY e.venue_key) x
   LEFT JOIN public.member_claim_venue_regions m ON m.venue_key=x.venue_key),'[]'::jsonb));
END $function$;
REVOKE ALL ON FUNCTION public.member_admin_claim_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_admin_claim_settings() TO authenticated;

-- HR saves the rates, the regions in order ({id?, name, spots, planeTicket?}) — a
-- region left out is retired — the three-person Airbnb rate, and the venues'
-- regions ({key, region: a region's name, or null to clear}). p_venues null
-- leaves every venue as it is.
CREATE OR REPLACE FUNCTION public.member_admin_save_claim_settings(p_base text, p_per_spot numeric, p_per_pax_night numeric, p_regions jsonb,
 p_three_pax_night numeric, p_venues jsonb)
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
  OR (p_three_pax_night IS NOT NULL AND (p_three_pax_night<0 OR p_three_pax_night>100000)) THEN
  RAISE EXCEPTION 'Rates must be between RM 0 and RM 100,000';
 END IF;
 IF jsonb_typeof(p_regions)<>'array' OR jsonb_array_length(p_regions)>60 THEN RAISE EXCEPTION 'Invalid regions'; END IF;
 IF p_venues IS NOT NULL AND (jsonb_typeof(p_venues)<>'array' OR jsonb_array_length(p_venues)>1000) THEN RAISE EXCEPTION 'Invalid venues'; END IF;
 INSERT INTO public.member_claim_rates (id, base_name, rate_per_spot, airbnb_rate_per_pax_night, airbnb_three_pax_per_night, updated_at, updated_by)
 VALUES (true, trim(p_base), p_per_spot, p_per_pax_night, p_three_pax_night, now(), auth.uid())
 ON CONFLICT (id) DO UPDATE SET base_name=EXCLUDED.base_name, rate_per_spot=EXCLUDED.rate_per_spot,
  airbnb_rate_per_pax_night=EXCLUDED.airbnb_rate_per_pax_night, airbnb_three_pax_per_night=EXCLUDED.airbnb_three_pax_per_night,
  updated_at=now(), updated_by=auth.uid();
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
REVOKE ALL ON FUNCTION public.member_admin_save_claim_settings(text, numeric, numeric, jsonb, numeric, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_admin_save_claim_settings(text, numeric, numeric, jsonb, numeric, jsonb) TO authenticated;

-- The four-argument save (20261005030000) keeps working while the app that
-- calls it is still live: the three-person rate, the planes and the venues stay
-- as they are.
CREATE OR REPLACE FUNCTION public.member_admin_save_claim_settings(p_base text, p_per_spot numeric, p_per_pax_night numeric, p_regions jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 RETURN public.member_admin_save_claim_settings(p_base, p_per_spot, p_per_pax_night, p_regions,
  (SELECT airbnb_three_pax_per_night FROM public.member_claim_rates WHERE id), NULL::jsonb);
END $function$;
REVOKE ALL ON FUNCTION public.member_admin_save_claim_settings(text, numeric, numeric, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_admin_save_claim_settings(text, numeric, numeric, jsonb) TO authenticated;
