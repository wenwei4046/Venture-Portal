CREATE FUNCTION public.member_admin_snapshot() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_requests boolean:=public.member_is_manager('member_requests_manage'); v_memos boolean:=public.member_is_manager('member_memos_manage'); v_principal boolean;
BEGIN
 IF NOT v_requests AND NOT v_memos THEN RAISE EXCEPTION 'HR management access is required' USING ERRCODE='42501'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND is_active AND role='principal') INTO v_principal;
 RETURN jsonb_build_object('canManageRequests',v_requests,'canPublishMemos',v_memos,'canConfigureProducts',v_principal,
 'requests',(SELECT coalesce(jsonb_agg(public.member_request_json(r.id) ORDER BY r.created_at DESC),'[]') FROM public.member_requests r WHERE r.status<>'draft' AND v_requests),
 'departments',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'name',d.name,'capacity',c.headcount_limit,
 'occupied',public.member_occupied(d.id,(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date),'reserved',(SELECT count(*) FROM public.member_requests r WHERE r.sub_department_id=d.id AND r.status IN('reserved','accepted') AND r.reservation_expires_at>now()
 AND (r.allocated_staff_id IS NULL OR NOT public.member_has_membership(r.allocated_staff_id,d.id))))),'[]')
 FROM public.comm_sub_departments d LEFT JOIN public.member_department_capacity c ON c.sub_department_id=d.id WHERE d.is_active),
 'events',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (SELECT request_id,actor_id,from_status,to_status,note,created_at FROM public.member_request_events WHERE v_requests ORDER BY created_at DESC LIMIT 300) x),
 'candidates',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.employee_name,'departmentId',s.department_id,'titleId',s.title_id)),'[]')
 FROM public.hr_staff_costs s JOIN public.departments d ON d.id=s.department_id WHERE v_requests AND s.status='active' AND d.payroll_source='commission'),
 'titles',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'departmentId',t.department_id,
 'subDepartmentIds',(SELECT coalesce(jsonb_agg(DISTINCT c.sub_department_id),'[]') FROM public.comm_ranks r JOIN public.comm_schemes c ON c.id=r.scheme_id WHERE r.title_id=t.id AND c.is_active))),'[]') FROM public.titles t WHERE t.is_active),
 'uplines',(SELECT coalesce(jsonb_agg(x.payload),'[]') FROM (SELECT DISTINCT jsonb_build_object('id',s.id,'name',s.employee_name,'subDepartmentId',c.sub_department_id,'titleId',h.title_id) AS payload
 FROM public.comm_hierarchy h JOIN public.hr_staff_costs s ON s.id=h.staff_id JOIN public.comm_schemes c ON c.id=h.scheme_id JOIN public.comm_ranks r ON r.id=h.rank_id
 WHERE v_requests AND s.status='active' AND c.is_active AND r.can_recruit AND h.effective_from<=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date
 AND (h.effective_to IS NULL OR h.effective_to>=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)) x),
 'products',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'code',p.item_code,'name',coalesce(p.product_name,p.item_code),
 'brand',coalesce(p.brand_code,''),'category',coalesce(o.category,''),'size',coalesce(o.size,''),'color',coalesce(o.color,''),
 'gift',coalesce(o.gift,false),'available',p.is_active AND coalesce(o.available,false),'version',concat(to_jsonb(p.updated_at)#>>'{}',':',to_jsonb(o.updated_at)#>>'{}')) ORDER BY p.item_code),'[]')
 FROM public.comm_products p LEFT JOIN public.member_product_options o ON o.product_id=p.id WHERE v_principal AND p.is_active),
 'memos',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'title',m.title,'body',m.body,'sender',m.sender,'publishedAt',m.published_at,
 'effectiveAt',m.effective_at,'version',m.version,'requiresAck',m.requires_ack,'readAt',NULL,'acknowledgedAt',NULL,
 'departments',(SELECT coalesce(jsonb_agg(d.name),'[]') FROM public.member_memo_audiences a JOIN public.comm_sub_departments d ON d.id=a.sub_department_id WHERE a.memo_id=m.id)) ORDER BY m.published_at DESC),'[]')
 FROM public.member_memos m WHERE v_memos));
END $$;

CREATE FUNCTION public.member_admin_action(p_action text,p_request uuid DEFAULT NULL,p_data jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.member_requests%ROWTYPE; v_note text:=nullif(trim(p_data->>'note'),''); v_sub uuid; v_cap integer;
 v_staff uuid; v_title uuid; v_rank uuid; v_scheme uuid; v_dept uuid; v_original uuid; v_now date:=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
 v_state text; v_name text; v_upline uuid;
BEGIN
 IF NOT public.member_is_manager('member_requests_manage') THEN RAISE EXCEPTION 'HR request management access is required' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_data)<>'object' OR octet_length(p_data::text)>20000 THEN RAISE EXCEPTION 'Invalid action data'; END IF;
 IF p_action IN('set_capacity','process_queue') THEN
 v_sub:=(p_data->>'subDepartmentId')::uuid;
 IF NOT EXISTS(SELECT 1 FROM public.comm_sub_departments WHERE id=v_sub AND is_active) THEN RAISE EXCEPTION 'Department not found'; END IF;
 IF p_action='set_capacity' THEN
 v_cap:=(p_data->>'capacity')::integer;
 IF v_cap<1 OR v_cap>10000 THEN RAISE EXCEPTION 'Capacity must be from 1 to 10000'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('member-capacity:'||v_sub,0));
 IF v_cap<public.member_occupied(v_sub,v_now)+(SELECT count(*) FROM public.member_requests WHERE sub_department_id=v_sub AND status IN('reserved','accepted') AND reservation_expires_at>now()
 AND (allocated_staff_id IS NULL OR NOT public.member_has_membership(allocated_staff_id,v_sub))) THEN RAISE EXCEPTION 'Capacity cannot be below occupied and reserved positions'; END IF;
 INSERT INTO public.member_department_capacity(sub_department_id,headcount_limit,updated_by) VALUES(v_sub,v_cap,auth.uid())
 ON CONFLICT(sub_department_id) DO UPDATE SET headcount_limit=EXCLUDED.headcount_limit,updated_at=now(),updated_by=auth.uid();
 END IF;
 RETURN jsonb_build_object('reserved',public.member_reserve_waiting(v_sub));
 END IF;
 SELECT sub_department_id INTO v_sub FROM public.member_requests WHERE id=p_request;
 IF v_sub IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended('member-capacity:'||v_sub,0)); END IF;
 SELECT * INTO r FROM public.member_requests WHERE id=p_request FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
 -- Claims remain in the established HR claim -> voucher -> payment flow.
 -- Never invent another approval route or mark money paid from this queue.
 IF r.kind='claim' THEN
 IF p_action<>'needs_info' OR r.status NOT IN('submitted','needs_info') OR v_note IS NULL THEN RAISE EXCEPTION 'Approve or reject the linked benefit claim in Claims; its status updates automatically'; END IF;
 PERFORM 1 FROM public.claims WHERE id=r.claim_id AND status='pending' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Only a pending claim may be returned for supporting information'; END IF;
 UPDATE public.member_requests SET status='needs_info',note=v_note,reviewed_by=auth.uid(),reviewed_at=now() WHERE id=r.id;
 RETURN public.member_request_json(r.id);
 END IF;
 IF p_action IN('reject','needs_info') THEN
 IF r.status NOT IN('submitted','needs_info','waiting','reserved','accepted','approved') OR v_note IS NULL THEN RAISE EXCEPTION 'This action requires an open request and an explanation'; END IF;
 IF r.kind='waiting' AND r.allocated_staff_id IS NOT NULL AND public.member_has_membership(r.allocated_staff_id,r.sub_department_id) THEN RAISE EXCEPTION 'This accepted applicant is already in the roster. Confirm allocation; manage any later departure through a replacement request.'; END IF;
 v_state:=CASE WHEN p_action='reject' THEN 'rejected' ELSE 'needs_info' END;
 UPDATE public.member_requests SET status=v_state,note=v_note,reviewed_by=auth.uid(),reviewed_at=now(),reserved_at=NULL,reservation_expires_at=NULL WHERE id=r.id;
 PERFORM public.member_reserve_waiting(r.sub_department_id);
 ELSIF p_action IN('qualify','approve') THEN
 IF r.status NOT IN('submitted','needs_info','expired') OR v_note IS NULL THEN RAISE EXCEPTION 'Record the eligibility/approval reason for an open request'; END IF;
 UPDATE public.member_requests SET status=CASE WHEN kind='waiting' THEN 'waiting' ELSE 'approved' END,note=v_note,reviewed_by=auth.uid(),reviewed_at=now() WHERE id=r.id;
 IF r.kind='waiting' THEN PERFORM public.member_reserve_waiting(r.sub_department_id); END IF;
 ELSIF p_action='accept' THEN
 IF (p_data->>'applicantConfirmed')='true' THEN v_note:=coalesce(v_note,'HR confirmed that the applicant accepted the reserved position.'); END IF;
 IF r.kind<>'waiting' OR r.status<>'reserved' OR r.reservation_expires_at<=now() OR v_note IS NULL OR (p_data->>'applicantConfirmed') IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'An active reservation and documented applicant acceptance are required'; END IF;
 UPDATE public.member_requests SET status='accepted',note=v_note,reviewed_by=auth.uid(),reviewed_at=now() WHERE id=r.id;
 ELSIF p_action IN('bind_candidate','create_candidate') THEN
 IF r.status NOT IN('reserved','accepted','approved') OR (r.kind='waiting' AND r.reservation_expires_at<=now()) THEN RAISE EXCEPTION 'A valid reservation or approved replacement is required'; END IF;
 SELECT department_id INTO v_dept FROM public.comm_sub_departments WHERE id=r.sub_department_id;
 IF p_action='create_candidate' THEN
 IF r.status<>'accepted' OR r.kind<>'waiting' THEN RAISE EXCEPTION 'Create a candidate only after recorded waiting-list acceptance'; END IF;
 IF r.allocated_staff_id IS NOT NULL THEN RETURN public.member_request_json(r.id); END IF;
 v_title:=(p_data->>'titleId')::uuid;
 SELECT c.id,cr.id INTO v_scheme,v_rank FROM public.comm_schemes c JOIN public.comm_ranks cr ON cr.scheme_id=c.id
 WHERE c.sub_department_id=r.sub_department_id AND c.is_active AND c.effective_from<=v_now AND (c.effective_to IS NULL OR c.effective_to>=v_now)
 AND cr.title_id=v_title ORDER BY cr.sort_order LIMIT 1;
 IF v_rank IS NULL THEN RAISE EXCEPTION 'Choose a title configured on this department ladder'; END IF;
 IF v_scheme IS DISTINCT FROM public.comm_scheme_for_department(v_dept) THEN RAISE EXCEPTION 'New roster entries automatically join the home department. For this non-home department, create the person in People, then bind the candidate and add the intended membership in Revenue.'; END IF;
 v_upline:=nullif(p_data->>'uplineStaffId','')::uuid;
 IF v_upline IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.comm_hierarchy h JOIN public.comm_ranks cr ON cr.id=h.rank_id
 WHERE h.scheme_id=v_scheme AND h.staff_id=v_upline AND cr.can_recruit AND h.effective_from<=v_now AND (h.effective_to IS NULL OR h.effective_to>=v_now)) THEN RAISE EXCEPTION 'Choose an active recruiter in the receiving department'; END IF;
 -- The capacity trigger is deferred: creation and binding reserve the SAME
 -- seat in this transaction. No account credentials are created here.
 INSERT INTO public.hr_staff_costs(employee_name,department_id,title_id,basic_salary,allowances,non_statutory_allowance,
 employment_type,tax_mode,withholding_rate,hire_date,contact_number,status,created_by,reports_to)
 VALUES(r.detail->>'newPerson',v_dept,v_title,0,0,0,'commission_eligible','withholding',0.02,
 greatest((r.detail->>'start')::date,v_now),r.detail->>'contact','active',auth.uid(),v_upline) RETURNING id INTO v_staff;
 UPDATE public.member_requests SET allocated_staff_id=v_staff WHERE id=r.id;
 IF NOT public.member_has_membership(v_staff,r.sub_department_id) THEN
 INSERT INTO public.comm_hierarchy(scheme_id,staff_id,title_id,rank_id,upline_staff_id,effective_from,created_by)
 VALUES(v_scheme,v_staff,v_title,v_rank,v_upline,date_trunc('month',v_now)::date,auth.uid());
 END IF;
 ELSE
 v_staff:=(p_data->>'staffId')::uuid;
 SELECT employee_name INTO v_name FROM public.hr_staff_costs WHERE id=v_staff AND department_id=v_dept AND status='active';
 IF v_name IS NULL OR lower(trim(v_name))<>lower(trim(r.detail->>'newPerson')) THEN RAISE EXCEPTION 'Candidate must match the named applicant and department'; END IF;
 UPDATE public.member_requests SET allocated_staff_id=v_staff WHERE id=r.id;
 END IF;
 INSERT INTO public.member_request_events(request_id,actor_id,from_status,to_status,note) VALUES(r.id,auth.uid(),r.status,r.status,'Candidate linked to roster: '||v_staff);
 ELSIF p_action='allocate' THEN
 IF r.kind<>'waiting' OR r.status<>'accepted' OR r.reservation_expires_at<=now() OR r.allocated_staff_id IS NULL THEN RAISE EXCEPTION 'Accepted reservation and linked candidate are required'; END IF;
 IF NOT public.member_has_membership(r.allocated_staff_id,r.sub_department_id) THEN RAISE EXCEPTION 'Complete the candidate membership in People/Revenue before confirming allocation'; END IF;
 UPDATE public.member_requests SET status='allocated',note=coalesce(v_note,'Membership verified and position allocated.'),reviewed_by=auth.uid(),reviewed_at=now(),reservation_expires_at=NULL WHERE id=r.id;
 ELSIF p_action='execute' THEN
 IF r.kind<>'replacement' OR r.status<>'approved' OR (r.allocated_staff_id IS NULL AND coalesce(r.detail->>'replacementSource','new')<>'vacancy') OR (r.detail->>'effective')::date>v_now THEN RAISE EXCEPTION 'An approved, due replacement with a linked successor is required'; END IF;
 v_original:=(r.detail->>'originalStaffId')::uuid;
 IF public.member_has_membership(v_original,r.sub_department_id) THEN RAISE EXCEPTION 'Complete the original member exit in People/Revenue first'; END IF;
 IF coalesce(r.detail->>'replacementSource','new')<>'vacancy' AND NOT public.member_has_membership(r.allocated_staff_id,r.sub_department_id) THEN RAISE EXCEPTION 'Complete the successor membership first'; END IF;
 IF r.detail->>'destination'='transfer' AND NOT public.member_has_membership(v_original,(r.detail->>'targetDepartmentId')::uuid) THEN RAISE EXCEPTION 'Receiving department membership has not been completed'; END IF;
 IF r.detail->>'destination'='resignation' AND NOT EXISTS(SELECT 1 FROM public.hr_staff_costs WHERE id=v_original AND status='inactive' AND resignation_date<=v_now) THEN RAISE EXCEPTION 'Company resignation has not been recorded in People'; END IF;
 UPDATE public.member_requests SET status='executed',note=coalesce(v_note,'Roster and membership changes verified.'),reviewed_by=auth.uid(),reviewed_at=now() WHERE id=r.id;
 ELSE RAISE EXCEPTION 'Unsupported HR action';
 END IF;
 RETURN public.member_request_json(r.id);
END $$;

CREATE FUNCTION public.member_publish_memo(p_title text,p_body text,p_sender text,p_effective date,p_requires_ack boolean,p_departments uuid[],p_version integer DEFAULT 1) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid; v_count integer;
BEGIN
 IF NOT public.member_is_manager('member_memos_manage') THEN RAISE EXCEPTION 'Memo publishing access is required' USING ERRCODE='42501'; END IF;
 IF p_departments IS NULL OR cardinality(p_departments)=0 OR length(trim(p_sender)) NOT BETWEEN 1 AND 120 OR p_effective IS NULL THEN RAISE EXCEPTION 'Sender, effective date and audience are required'; END IF;
 SELECT count(DISTINCT id) INTO v_count FROM public.comm_sub_departments WHERE id=ANY(p_departments) AND is_active;
 IF v_count<>(SELECT count(DISTINCT x) FROM unnest(p_departments) x) THEN RAISE EXCEPTION 'Audience includes an unavailable department'; END IF;
 INSERT INTO public.member_memos(title,body,sender,version,effective_at,requires_ack,created_by)
 VALUES(trim(p_title),trim(p_body),trim(p_sender),p_version,p_effective,p_requires_ack,auth.uid()) RETURNING id INTO v_id;
 INSERT INTO public.member_memo_audiences(memo_id,sub_department_id) SELECT v_id,x FROM unnest(p_departments) x ON CONFLICT DO NOTHING;
 RETURN jsonb_build_object('id',v_id,'title',trim(p_title),'version',p_version);
END $$;

CREATE FUNCTION public.member_configure_product(p_product uuid,p_category text,p_size text,p_color text,p_gift boolean,p_available boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND is_active AND role='principal') THEN RAISE EXCEPTION 'Only Principal may publish products to the member catalogue' USING ERRCODE='42501'; END IF;
 IF length(coalesce(p_size,''))>100 OR length(coalesce(p_color,''))>100 THEN RAISE EXCEPTION 'Size or colour is too long'; END IF;
 INSERT INTO public.member_product_options(product_id,category,size,color,gift,available,updated_by)
 VALUES(p_product,p_category,coalesce(p_size,''),coalesce(p_color,''),p_gift,p_available,auth.uid())
 ON CONFLICT(product_id) DO UPDATE SET category=EXCLUDED.category,size=EXCLUDED.size,color=EXCLUDED.color,gift=EXCLUDED.gift,available=EXCLUDED.available,updated_at=now(),updated_by=auth.uid();
 RETURN jsonb_build_object('id',p_product,'configured',true);
END $$;
REVOKE ALL ON FUNCTION public.member_admin_snapshot(),public.member_admin_action(text,uuid,jsonb),public.member_publish_memo(text,text,text,date,boolean,uuid[],integer),public.member_configure_product(uuid,text,text,text,boolean,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.member_admin_snapshot(),public.member_admin_action(text,uuid,jsonb),public.member_publish_memo(text,text,text,date,boolean,uuid[],integer),public.member_configure_product(uuid,text,text,text,boolean,boolean) TO authenticated;
