-- member_admin_save_claim_settings(p_base text, p_per_spot numeric, p_per_pax_night numeric, p_regions jsonb, p_group_max_pax integer, p_group_cap numeric, p_venues jsonb) — production md5(prosrc) 3c2fa3448f3b6496bfb9756dcdfc8c8c
CREATE OR REPLACE FUNCTION public.member_admin_save_claim_settings(p_base text, p_per_spot numeric, p_per_pax_night numeric, p_regions jsonb, p_group_max_pax integer, p_group_cap numeric, p_venues jsonb)
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
END $function$
;

-- member_submit_request(p_request uuid) — production md5(prosrc) ec5470f1b4db7732d492957a202c9f15
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
 SELECT a.object_path INTO v_path FROM public.member_request_attachments a JOIN public.file_objects o ON o.bucket_id='member-invoices' AND o.name=a.object_path
 WHERE a.request_id=r.id AND a.uploaded_by=auth.uid() AND a.content_sha256=r.detail->>'invoiceHash' ORDER BY a.created_at DESC LIMIT 1;
 -- An outstation claim by road is paid by the fixed rate, with no invoice; a plane ticket has one (2026-10-06).
 IF v_path IS NULL AND (coalesce(r.detail->>'claimType','') NOT IN ('outstation','food') OR coalesce((r.detail->>'planeTicket')::boolean,false)) THEN
  RAISE EXCEPTION 'A verified invoice is required before submitting';
 END IF;
 PERFORM public.member_food_claim_check(r.id);
 SELECT employee_name,department_id INTO v_name,v_dept FROM public.hr_staff_costs WHERE id=v_staff;
 v_desc:=CASE
  WHEN r.detail->>'claimType'='food' THEN public.member_food_claim_line(r.detail)
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
 AND NOT EXISTS(SELECT 1 FROM public.member_request_attachments a JOIN public.file_objects o ON o.bucket_id='member-invoices' AND o.name=a.object_path
  WHERE a.request_id=r.id AND a.uploaded_by=auth.uid() AND a.content_sha256=r.detail->>'signedFormHash') THEN
  RAISE EXCEPTION 'Upload the signed application form before sending';
 END IF;
 IF r.kind='replacement' AND coalesce((SELECT f.require_upload FROM public.member_replacement_forms f ORDER BY f.version DESC LIMIT 1),false)
 AND NOT EXISTS(SELECT 1 FROM public.member_request_attachments a JOIN public.file_objects o ON o.bucket_id='member-invoices' AND o.name=a.object_path
  WHERE a.request_id=r.id AND a.uploaded_by=auth.uid() AND a.content_sha256=r.detail->>'signedFormHash') THEN
  RAISE EXCEPTION 'Upload the signed replacement form before sending';
 END IF;
 UPDATE public.member_requests SET status='submitted',submitted_at=now(),claim_id=v_claim WHERE id=r.id;
 RETURN public.member_request_json(r.id);
END $function$
;

