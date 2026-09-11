CREATE FUNCTION public.member_request_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='INSERT' THEN
 INSERT INTO public.member_request_events(request_id,actor_id,to_status,note) VALUES(NEW.id,auth.uid(),NEW.status,NEW.note);
 ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
 INSERT INTO public.member_request_events(request_id,actor_id,from_status,to_status,note) VALUES(NEW.id,auth.uid(),OLD.status,NEW.status,NEW.note);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER member_requests_audit AFTER INSERT OR UPDATE ON public.member_requests FOR EACH ROW EXECUTE FUNCTION public.member_request_audit();

CREATE FUNCTION public.member_prepare_request(p_kind text,p_sub_department uuid,p_detail jsonb,p_idempotency uuid,p_revision uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_staff uuid:=public.member_staff_id(); v_existing public.member_requests%ROWTYPE; v_id uuid; v_title text;
 v_original uuid; v_valid boolean; v_date date;
BEGIN
 IF NOT public.has_perm('member_requests') THEN RAISE EXCEPTION 'Request access is not enabled' USING ERRCODE='42501'; END IF;
 IF p_kind NOT IN ('claim','replacement','waiting') OR p_idempotency IS NULL OR jsonb_typeof(p_detail)<>'object' OR octet_length(p_detail::text)>120000 THEN RAISE EXCEPTION 'Invalid request'; END IF;
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
 IF p_kind='claim' THEN
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
END $$;

CREATE FUNCTION public.member_submit_request(p_request uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_staff uuid:=public.member_staff_id(); r public.member_requests%ROWTYPE; v_claim uuid; v_name text; v_dept uuid; v_path text;
BEGIN
 IF NOT public.has_perm('member_requests') THEN RAISE EXCEPTION 'Request access is not enabled' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.member_requests WHERE id=p_request AND created_by=auth.uid() AND staff_id=v_staff FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Request not found' USING ERRCODE='42501'; END IF;
 IF r.status<>'draft' THEN RETURN public.member_request_json(r.id); END IF;
 IF r.kind='claim' THEN
 -- Attachment metadata can only be attested by the server after inspecting its bytes.
 SELECT a.object_path INTO v_path FROM public.member_request_attachments a JOIN storage.objects o ON o.bucket_id='member-invoices' AND o.name=a.object_path
 WHERE a.request_id=r.id AND a.uploaded_by=auth.uid() AND a.content_sha256=r.detail->>'invoiceHash' ORDER BY a.created_at DESC LIMIT 1;
 IF v_path IS NULL THEN RAISE EXCEPTION 'A verified invoice is required before submitting'; END IF;
 SELECT employee_name,department_id INTO v_name,v_dept FROM public.hr_staff_costs WHERE id=v_staff;
 IF r.claim_id IS NULL THEN
 INSERT INTO public.claims(claim_type,claimant_name,department_id,amount,description,receipt_url,status,source_pool,created_by)
 VALUES('benefit',v_name,v_dept,(r.detail->>'amount')::numeric,
 concat(r.detail->>'category',': ',r.detail->>'location','; ',r.detail->>'start',' — ',r.detail->>'end'),
 'member-invoices/'||v_path,'pending','venture_pool',auth.uid()) RETURNING id INTO v_claim;
 ELSE
 UPDATE public.claims SET amount=(r.detail->>'amount')::numeric,
 description=concat(r.detail->>'category',': ',r.detail->>'location','; ',r.detail->>'start',' — ',r.detail->>'end'),
 receipt_url='member-invoices/'||v_path
 WHERE id=r.claim_id AND created_by=auth.uid() AND status='pending' RETURNING id INTO v_claim;
 IF v_claim IS NULL THEN RAISE EXCEPTION 'Claim has already been reviewed; its approved amount and invoice cannot be changed'; END IF;
 END IF;
 END IF;
 UPDATE public.member_requests SET status='submitted',submitted_at=now(),claim_id=v_claim WHERE id=r.id;
 RETURN public.member_request_json(r.id);
END $$;

CREATE FUNCTION public.member_occupied(p_sub uuid,p_date date) RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT count(DISTINCT h.staff_id)::integer FROM public.comm_hierarchy h JOIN public.comm_schemes c ON c.id=h.scheme_id
 WHERE c.sub_department_id=p_sub AND h.effective_from<=p_date AND (h.effective_to IS NULL OR h.effective_to>=p_date);
$$;
CREATE FUNCTION public.member_reserve_waiting(p_sub uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_cap integer; v_free integer; v_id uuid; v_count integer:=0; v_today date:=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('member-capacity:'||p_sub,0));
 SELECT headcount_limit INTO v_cap FROM public.member_department_capacity WHERE sub_department_id=p_sub FOR UPDATE;
 IF NOT FOUND THEN RETURN 0; END IF;
 -- An accepted applicant already installed in the roster occupies the same
 -- seat. Expiry must not strand that real membership in a second queue slot.
 UPDATE public.member_requests SET status='allocated',reservation_expires_at=NULL,note='Accepted applicant membership verified when the reservation expired.'
 WHERE sub_department_id=p_sub AND kind='waiting' AND status='accepted' AND reservation_expires_at<=now()
 AND allocated_staff_id IS NOT NULL AND public.member_has_membership(allocated_staff_id,p_sub);
 UPDATE public.member_requests SET status='expired',reserved_at=NULL,reservation_expires_at=NULL,note='The reservation expired. HR may re-assess eligibility before returning this application to the queue.'
 WHERE sub_department_id=p_sub AND kind='waiting' AND status IN('reserved','accepted') AND reservation_expires_at<=now();
 SELECT v_cap-public.member_occupied(p_sub,v_today)-count(*) INTO v_free FROM public.member_requests r
 WHERE sub_department_id=p_sub AND kind='waiting' AND status IN('reserved','accepted') AND reservation_expires_at>now()
 AND (allocated_staff_id IS NULL OR NOT public.member_has_membership(allocated_staff_id,p_sub));
 WHILE v_free>0 LOOP
 SELECT id INTO v_id FROM public.member_requests WHERE sub_department_id=p_sub AND kind='waiting' AND status='waiting'
 -- Future applicants remain eligible, but are not reserved before their requested start date.
 AND (detail->>'start')::date<=v_today
 ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1;
 EXIT WHEN v_id IS NULL;
 UPDATE public.member_requests SET status='reserved',reserved_at=now(),reservation_expires_at=now()+interval '72 hours',note='A position is reserved for 72 hours. HR must record applicant acceptance before allocation.' WHERE id=v_id;
 v_count:=v_count+1; v_free:=v_free-1;
 END LOOP;
 RETURN v_count;
END $$;

-- Deferred until transaction end so a legitimate close+open replacement is
-- evaluated against its final occupancy, not an intermediate empty slot.
CREATE FUNCTION public.member_capacity_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_sub uuid; v_cap integer; v_reserved integer; v_date date; v_staff uuid;
BEGIN
 IF TG_OP='DELETE' THEN SELECT sub_department_id INTO v_sub FROM public.comm_schemes WHERE id=OLD.scheme_id;
 ELSE SELECT sub_department_id INTO v_sub FROM public.comm_schemes WHERE id=NEW.scheme_id; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('member-capacity:'||v_sub,0));
 SELECT headcount_limit INTO v_cap FROM public.member_department_capacity WHERE sub_department_id=v_sub FOR UPDATE;
 IF FOUND AND TG_OP<>'DELETE' THEN
 FOR v_date IN SELECT DISTINCT d FROM (
 SELECT greatest(NEW.effective_from,(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date) d
 UNION SELECT h.effective_from FROM public.comm_hierarchy h JOIN public.comm_schemes c ON c.id=h.scheme_id
 WHERE c.sub_department_id=v_sub AND h.effective_from>=NEW.effective_from AND (NEW.effective_to IS NULL OR h.effective_from<=NEW.effective_to)
 ) dates LOOP
 SELECT count(*) INTO v_reserved FROM public.member_requests r WHERE r.sub_department_id=v_sub AND r.kind='waiting'
 AND r.status IN('reserved','accepted') AND r.reservation_expires_at>now()
 AND (r.allocated_staff_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.comm_hierarchy h JOIN public.comm_schemes c ON c.id=h.scheme_id
 WHERE c.sub_department_id=v_sub AND h.staff_id=r.allocated_staff_id AND h.effective_from<=v_date AND (h.effective_to IS NULL OR h.effective_to>=v_date)));
 IF public.member_occupied(v_sub,v_date)+v_reserved>v_cap THEN RAISE EXCEPTION 'Department capacity including reserved positions has been reached'; END IF;
 END LOOP;
 END IF;
 PERFORM public.member_reserve_waiting(v_sub);
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER member_capacity_guard AFTER INSERT OR UPDATE OR DELETE ON public.comm_hierarchy DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.member_capacity_changed();

REVOKE ALL ON FUNCTION public.member_request_audit(),public.member_prepare_request(text,uuid,jsonb,uuid,uuid),public.member_submit_request(uuid),public.member_occupied(uuid,date),public.member_reserve_waiting(uuid),public.member_capacity_changed() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.member_prepare_request(text,uuid,jsonb,uuid,uuid),public.member_submit_request(uuid) TO authenticated;
