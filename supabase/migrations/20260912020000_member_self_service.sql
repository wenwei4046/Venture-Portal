-- Member self-service. Requires the complete 20260911 commission migration chain.
-- No seeded people, costs, caps, orders, claims or memos. All member permissions
-- intentionally imply NO legacy admin/hr/treasury table scope.
INSERT INTO public.permission_defs(key,label,section,scope,description,sort_order) VALUES
 ('member_portal','Member account','Revenue member','none','Own membership, income and authorised team.',310),
 ('member_quote','Member quotation','Revenue member','none','Fair quotation using current authorised products.',311),
 ('member_requests','Member requests','Revenue member','none','Submit and follow own HR requests.',312),
 ('member_memos','Member memos','Revenue member','none','Read and acknowledge addressed announcements.',313),
 ('member_requests_manage','Review member requests','People','none','HR review, capacity reservations and request audit.',314),
 ('member_memos_manage','Publish member memos','People','none','Publish versioned announcements for Revenue members.',315)
ON CONFLICT(key) DO UPDATE SET scope='none';
INSERT INTO public.role_default_permissions(role,permission_key)
SELECT 'revenue_member'::public.user_role,k FROM unnest(ARRAY['member_portal','member_quote','member_requests','member_memos']) k
ON CONFLICT DO NOTHING;
INSERT INTO public.role_default_permissions(role,permission_key)
SELECT r::public.user_role,k FROM unnest(ARRAY['principal','hr']) r CROSS JOIN unnest(ARRAY['member_requests_manage','member_memos_manage']) k
ON CONFLICT DO NOTHING;

CREATE TABLE public.member_product_options (
 product_id uuid PRIMARY KEY REFERENCES public.comm_products(id) ON DELETE CASCADE,
 category text NOT NULL CHECK(length(category) BETWEEN 1 AND 80),
 size text NOT NULL DEFAULT '', color text NOT NULL DEFAULT '',
 gift boolean NOT NULL DEFAULT false, available boolean NOT NULL DEFAULT true,
 updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid REFERENCES public.users(id)
);
COMMENT ON TABLE public.member_product_options IS 'Explicit salesperson catalogue. A cost-list product is unavailable until Principal configures its selling metadata. No costs stored here.';
CREATE TABLE public.member_department_capacity (
 sub_department_id uuid PRIMARY KEY REFERENCES public.comm_sub_departments(id),
 headcount_limit integer NOT NULL CHECK(headcount_limit BETWEEN 1 AND 10000),
 updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid REFERENCES public.users(id)
);
CREATE TABLE public.member_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_by uuid NOT NULL REFERENCES public.users(id),
 staff_id uuid NOT NULL REFERENCES public.hr_staff_costs(id), sub_department_id uuid NOT NULL REFERENCES public.comm_sub_departments(id),
 kind text NOT NULL CHECK(kind IN ('claim','replacement','waiting')),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','needs_info','approved','rejected','waiting','reserved','accepted','allocated','executed','withdrawn','expired')),
 title text NOT NULL, detail jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(detail)='object'),
 claim_id uuid REFERENCES public.claims(id), idempotency_key uuid NOT NULL,
 note text, allocated_staff_id uuid REFERENCES public.hr_staff_costs(id),
 reserved_at timestamptz, reservation_expires_at timestamptz,
 reviewed_by uuid REFERENCES public.users(id), reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), submitted_at timestamptz,
 UNIQUE(created_by,idempotency_key)
);
CREATE INDEX member_requests_queue ON public.member_requests(sub_department_id,status,created_at,id);
CREATE UNIQUE INDEX member_waiting_unique_contact ON public.member_requests(sub_department_id,(detail->>'contact'))
 WHERE kind='waiting' AND status IN ('submitted','needs_info','waiting','reserved','accepted');
CREATE TABLE public.member_request_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL REFERENCES public.member_requests(id),
 actor_id uuid REFERENCES public.users(id), from_status text, to_status text NOT NULL,
 note text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.member_request_attachments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL REFERENCES public.member_requests(id),
 uploaded_by uuid NOT NULL REFERENCES public.users(id), object_path text NOT NULL UNIQUE,
 mime_type text NOT NULL CHECK(mime_type IN ('image/jpeg','image/png','application/pdf')),
 size_bytes integer NOT NULL CHECK(size_bytes BETWEEN 1 AND 3145728),
 content_sha256 text NOT NULL CHECK(content_sha256 ~ '^[0-9a-f]{64}$'), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.member_memos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
 body text NOT NULL CHECK(length(body) BETWEEN 1 AND 30000), sender text NOT NULL,
 version integer NOT NULL CHECK(version>0), published_at timestamptz NOT NULL DEFAULT now(),
 effective_at date NOT NULL, requires_ack boolean NOT NULL DEFAULT true,
 created_by uuid NOT NULL REFERENCES public.users(id)
);
CREATE TABLE public.member_memo_audiences (
 memo_id uuid NOT NULL REFERENCES public.member_memos(id), sub_department_id uuid NOT NULL REFERENCES public.comm_sub_departments(id),
 PRIMARY KEY(memo_id,sub_department_id)
);
CREATE TABLE public.member_memo_receipts (
 memo_id uuid NOT NULL REFERENCES public.member_memos(id), user_id uuid NOT NULL REFERENCES public.users(id),
 version integer NOT NULL, read_at timestamptz NOT NULL DEFAULT now(), acknowledged_at timestamptz,
 PRIMARY KEY(memo_id,user_id,version)
);

CREATE FUNCTION public.member_staff_id() RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_perm('member_portal') THEN RAISE EXCEPTION 'Member account access is not enabled' USING ERRCODE='42501'; END IF;
 SELECT s.id INTO v_id FROM public.users u JOIN public.hr_staff_costs s ON s.user_id=u.id
 JOIN public.departments d ON d.id=s.department_id
 WHERE u.id=auth.uid() AND u.is_active AND s.status='active' AND d.payroll_source='commission'
 AND (s.hire_date IS NULL OR s.hire_date<=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)
 AND (s.resignation_date IS NULL OR s.resignation_date>=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date);
 IF v_id IS NULL THEN RAISE EXCEPTION 'No active Revenue staff record is linked to this account' USING ERRCODE='42501'; END IF;
 RETURN v_id;
END $$;
CREATE FUNCTION public.member_is_manager(p_permission text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND is_active
 AND (role='principal' OR (p_permission IN ('member_requests_manage','member_memos_manage') AND public.has_perm(p_permission))));
$$;
CREATE FUNCTION public.member_has_membership(p_staff uuid,p_sub uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.comm_hierarchy h JOIN public.comm_schemes c ON c.id=h.scheme_id
 JOIN public.comm_sub_departments d ON d.id=c.sub_department_id
 WHERE h.staff_id=p_staff AND d.id=p_sub AND d.is_active AND c.is_active
 AND h.effective_from<=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date
 AND (h.effective_to IS NULL OR h.effective_to>=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)
 AND c.effective_from<=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date
 AND (c.effective_to IS NULL OR c.effective_to>=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date));
$$;
CREATE FUNCTION public.member_request_json(p_request uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('id',r.id,'kind',r.kind,'title',r.title,
 'status',CASE WHEN r.kind='claim' AND c.status IN ('approved','paid','rejected') THEN c.status::text ELSE r.status END,
 'createdAt',r.created_at,'detail',r.detail || jsonb_build_object('subDepartmentId',r.sub_department_id,'department',(SELECT name FROM public.comm_sub_departments WHERE id=r.sub_department_id),'reservationExpiresAt',r.reservation_expires_at,'allocatedStaffId',r.allocated_staff_id),
 'note',r.note,'claimId',r.claim_id)
 FROM public.member_requests r LEFT JOIN public.claims c ON c.id=r.claim_id WHERE r.id=p_request;
$$;
CREATE FUNCTION public.member_visible_memo(p_memo uuid,p_staff uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.member_memos m JOIN public.member_memo_audiences a ON a.memo_id=m.id
 WHERE m.id=p_memo AND m.published_at<=now() AND public.member_has_membership(p_staff,a.sub_department_id));
$$;

-- New tables are private by default. Member data is projected by narrow RPCs.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['member_product_options','member_department_capacity','member_requests','member_request_events','member_request_attachments','member_memos','member_memo_audiences','member_memo_receipts'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM anon,authenticated',t);
 END LOOP;
END $$;
GRANT SELECT ON public.member_requests,public.member_request_attachments TO authenticated;
CREATE POLICY member_request_own_read ON public.member_requests FOR SELECT TO authenticated
 USING(created_by=(SELECT auth.uid()) AND (SELECT public.has_perm('member_requests')) OR (SELECT public.member_is_manager('member_requests_manage')));
CREATE POLICY member_attachment_own_read ON public.member_request_attachments FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.member_requests r WHERE r.id=request_id));
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES('member-invoices','member-invoices',false,3145728,ARRAY['image/jpeg','image/png','application/pdf'])
 ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=3145728,allowed_mime_types=EXCLUDED.allowed_mime_types;
CREATE POLICY member_invoice_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(
 bucket_id='member-invoices' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text
 AND EXISTS(SELECT 1 FROM public.member_requests r WHERE r.id::text=(storage.foldername(name))[2] AND r.created_by=auth.uid() AND r.status='draft' AND r.kind='claim')
);
CREATE POLICY member_invoice_read ON storage.objects FOR SELECT TO authenticated USING(
 bucket_id='member-invoices' AND EXISTS(SELECT 1 FROM public.member_request_attachments a
 JOIN public.member_requests r ON r.id=a.request_id WHERE a.object_path=name
 AND (r.created_by=auth.uid() OR public.member_is_manager('member_requests_manage')))
);
CREATE POLICY member_invoice_draft_delete ON storage.objects FOR DELETE TO authenticated USING(
 bucket_id='member-invoices' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text
 AND EXISTS(SELECT 1 FROM public.member_requests r WHERE r.id::text=(storage.foldername(name))[2] AND r.created_by=auth.uid() AND r.status='draft')
 AND NOT EXISTS(SELECT 1 FROM public.member_request_attachments a WHERE a.object_path=name)
);

-- No public execution on helpers (especially member_request_json, which is an
-- internal projection, not a way to read an arbitrary request identifier).
REVOKE ALL ON FUNCTION public.member_staff_id(),public.member_is_manager(text),public.member_has_membership(uuid,uuid),public.member_request_json(uuid),public.member_visible_memo(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.member_is_manager(text) TO authenticated;
