-- ════════════════════════════════════════════════════════════════════════════
-- Member requests: a number, a history the member can read, Cancel, and fair
-- claims priced by HR's rates (2026-10-05, the Revenue app's Profile)
--
-- 1. REQUEST NUMBERS. Every request gets `RQ-YYMM-NNN` the moment it is first
--    sent to HR (status leaves draft): YYMM is the Kuala Lumpur month it was
--    sent, NNN counts that month's requests. A resubmission keeps its number;
--    a number is never changed or reused. member_request_json returns it, and
--    the request's staff id (a Principal's snapshot holds everybody's).
--
-- 2. HISTORY. member_request_history(p_request): who moved it, when, and why —
--    the request's own events plus, for a claim, the decision HR took in
--    Claims and the payment. The member's own request, or anybody's for the
--    Principal and HR's request managers. Bookkeeping events (a status that
--    did not change, e.g. "Candidate linked") are left out.
--
-- 3. CANCEL. member_cancel_request(p_request): the member withdraws a request
--    HR has not acted on — still pending, or returned for more information.
--    Status `withdrawn` (already allowed by the CHECK); a claim's pending
--    benefit claim is removed so it can never be approved by mistake. 23REQ
--    when HR has already decided.
--
-- 4. FAIR CLAIMS (user 2026-10-05). Outstation = spots for the route (from the
--    base, return) × rate per spot, no invoice; Airbnb = people × nights ×
--    rate per person per night, invoice required. The rates are HR's:
--    member_claim_rates (one row) + member_claim_regions, seeded with the
--    prototype's numbers the user chose (KL 0, Penang 4, Ipoh 2, Melaka 2,
--    Johor 3, Pahang 3, Sabah 6, Sarawak 6 spots; RM 50 a spot; Airbnb RM 65 a
--    person a night). member_claim_detail() works the amount out and
--    member_prepare_request stores ITS answer — a browser's figure is never
--    the one paid. A claim without `claimType` follows the old rules exactly.
--    member_claim_settings() is what the member's form reads;
--    member_admin_claim_settings / member_admin_save_claim_settings are HR's
--    (People › Member services › Claim rates).
--
-- 5. VIEW AS. member_principal_memo_receipts(p_staff): which memos the viewed
--    person has read and acknowledged — the Principal's own receipts are not
--    theirs.
--
-- Nothing existing changes amount: no claim exists yet (0 member_requests on
-- 2026-10-05) and the old claim shape is untouched.
--
-- Rollback:
--   DROP TRIGGER member_requests_number ON member_requests; DROP FUNCTION member_requests_number();
--   DROP FUNCTION member_next_request_no(timestamptz), member_request_history(uuid), member_cancel_request(uuid),
--     member_claim_detail(jsonb), member_claim_settings(), member_admin_claim_settings(),
--     member_admin_save_claim_settings(text, numeric, numeric, jsonb), member_principal_memo_receipts(uuid);
--   DROP TABLE member_claim_regions, member_claim_rates;
--   ALTER TABLE member_requests DROP COLUMN request_no;
--   then member_request_json / member_prepare_request / member_submit_request as in 20260912020000 / 040000.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Request numbers ─────────────────────────────────────────────────────

ALTER TABLE public.member_requests ADD COLUMN IF NOT EXISTS request_no text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_member_requests_request_no ON public.member_requests (request_no) WHERE request_no IS NOT NULL;
COMMENT ON COLUMN public.member_requests.request_no IS
  'RQ-YYMM-NNN, given when the request is first sent to HR (Kuala Lumpur month of submitted_at, counted within that month). Never changed or reused (2026-10-05).';

CREATE OR REPLACE FUNCTION public.member_next_request_no(p_at timestamptz)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_prefix text := 'RQ-'||to_char(p_at AT TIME ZONE 'Asia/Kuala_Lumpur','YYMM')||'-'; v_n integer;
BEGIN
 -- One counter per month: two requests sent at the same instant wait for each other.
 PERFORM pg_advisory_xact_lock(hashtextextended('member-request-no:'||v_prefix,0));
 SELECT coalesce(max(substring(request_no FROM length(v_prefix)+1)::integer),0)+1 INTO v_n
 FROM public.member_requests WHERE request_no LIKE v_prefix||'%' AND substring(request_no FROM length(v_prefix)+1)~'^\d+$';
 RETURN v_prefix||lpad(v_n::text,3,'0');
END $function$;
REVOKE ALL ON FUNCTION public.member_next_request_no(timestamptz) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.member_requests_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 IF TG_OP='UPDATE' AND OLD.request_no IS NOT NULL THEN
  NEW.request_no := OLD.request_no;
 ELSIF NEW.request_no IS NULL AND NEW.status<>'draft' THEN
  NEW.request_no := public.member_next_request_no(coalesce(NEW.submitted_at,now()));
 END IF;
 RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION public.member_requests_number() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS member_requests_number ON public.member_requests;
CREATE TRIGGER member_requests_number BEFORE INSERT OR UPDATE ON public.member_requests
 FOR EACH ROW EXECUTE FUNCTION public.member_requests_number();

-- Requests already sent (none on 2026-10-05), numbered in the order they were sent.
DO $$
DECLARE r record;
BEGIN
 FOR r IN SELECT id, coalesce(submitted_at, created_at) AS at FROM public.member_requests
  WHERE request_no IS NULL AND status<>'draft' ORDER BY coalesce(submitted_at, created_at), id LOOP
  UPDATE public.member_requests SET request_no=public.member_next_request_no(r.at) WHERE id=r.id;
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.member_request_json(p_request uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 SELECT jsonb_build_object('id',r.id,'kind',r.kind,'title',r.title,
 'status',CASE WHEN r.kind='claim' AND c.status IN ('approved','paid','rejected') THEN c.status::text ELSE r.status END,
 'createdAt',r.created_at,'submittedAt',r.submitted_at,'requestNo',r.request_no,'staffId',r.staff_id,
 'detail',r.detail || jsonb_build_object('subDepartmentId',r.sub_department_id,'department',(SELECT name FROM public.comm_sub_departments WHERE id=r.sub_department_id),'reservationExpiresAt',r.reservation_expires_at,'allocatedStaffId',r.allocated_staff_id),
 'note',r.note,'claimId',r.claim_id)
 FROM public.member_requests r LEFT JOIN public.claims c ON c.id=r.claim_id WHERE r.id=p_request;
$function$;

-- ─── 2. History ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.member_request_history(p_request uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r public.member_requests%ROWTYPE;
BEGIN
 SELECT * INTO r FROM public.member_requests WHERE id=p_request;
 IF NOT FOUND OR NOT ((r.created_by=auth.uid() AND public.has_perm('member_requests')) OR public.member_is_manager('member_requests_manage')) THEN
  RAISE EXCEPTION 'Request not found' USING ERRCODE='42501';
 END IF;
 RETURN (
  WITH ev AS (
   SELECT e.created_at AS at, e.to_status AS status, e.from_status AS "from", e.note, e.actor_id
   FROM public.member_request_events e
   WHERE e.request_id=r.id AND e.from_status IS DISTINCT FROM e.to_status AND e.to_status<>'draft'
   UNION ALL
   -- A claim is decided in Claims, not on the request.
   SELECT c.approved_at, CASE WHEN c.status='rejected' THEN 'rejected' ELSE 'approved' END, 'submitted', NULL, c.approved_by
   FROM public.claims c WHERE r.kind='claim' AND c.id=r.claim_id AND c.status IN ('approved','rejected','paid') AND c.approved_at IS NOT NULL
   UNION ALL
   SELECT coalesce(v.executed_at, v.payment_date::timestamptz, c.approved_at), 'paid', 'approved',
    CASE WHEN c.payroll_month IS NOT NULL THEN 'With '||to_char(c.payroll_month,'FMMonth')||' payroll' END, v.executed_by
   FROM public.claims c LEFT JOIN public.payment_vouchers v ON v.id=c.voucher_id
   WHERE r.kind='claim' AND c.id=r.claim_id AND c.status='paid'
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
   'at',ev.at,'status',ev.status,'from',ev."from",'note',ev.note,
   'actor',CASE WHEN ev.actor_id=r.created_by THEN 'you' WHEN ev.actor_id IS NULL THEN 'system'
    WHEN u.role='principal' THEN 'principal' WHEN u.role='finance' THEN 'finance' ELSE 'hr' END,
   'actorName',CASE WHEN ev.actor_id IS NULL OR ev.actor_id=r.created_by THEN NULL
    ELSE nullif(split_part(trim(coalesce(u.name,'')),' ',1),'') END
  ) ORDER BY ev.at, CASE ev.status WHEN 'submitted' THEN 0 WHEN 'paid' THEN 2 ELSE 1 END),'[]'::jsonb)
  FROM ev LEFT JOIN public.users u ON u.id=ev.actor_id
  WHERE ev.at IS NOT NULL
 );
END $function$;
REVOKE ALL ON FUNCTION public.member_request_history(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_request_history(uuid) TO authenticated;

-- ─── 3. Cancel ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.member_cancel_request(p_request uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_staff uuid:=public.member_staff_id(); r public.member_requests%ROWTYPE;
BEGIN
 IF NOT public.has_perm('member_requests') THEN RAISE EXCEPTION 'Request access is not enabled' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.member_requests WHERE id=p_request AND created_by=auth.uid() AND staff_id=v_staff FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Request not found' USING ERRCODE='42501'; END IF;
 IF r.status NOT IN ('submitted','needs_info') THEN
  RAISE EXCEPTION 'HR has already acted on this request, so it can no longer be cancelled.' USING ERRCODE='23REQ';
 END IF;
 IF r.kind='claim' AND r.claim_id IS NOT NULL THEN
  PERFORM 1 FROM public.claims WHERE id=r.claim_id AND status='pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'HR has already decided this claim, so it can no longer be cancelled.' USING ERRCODE='23REQ'; END IF;
 END IF;
 UPDATE public.member_requests SET status='withdrawn', note='Cancelled by the member', claim_id=NULL WHERE id=r.id;
 -- The pending benefit claim goes with it: nobody can approve a withdrawn claim by mistake.
 IF r.kind='claim' AND r.claim_id IS NOT NULL THEN DELETE FROM public.claims WHERE id=r.claim_id AND status='pending'; END IF;
 RETURN public.member_request_json(r.id);
END $function$;
REVOKE ALL ON FUNCTION public.member_cancel_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_cancel_request(uuid) TO authenticated;

-- ─── 4. Fair claims: HR's rates ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.member_claim_rates (
 id boolean PRIMARY KEY DEFAULT true CHECK (id),
 base_name text NOT NULL DEFAULT 'Klang Valley' CHECK (length(trim(base_name)) BETWEEN 1 AND 60),
 rate_per_spot numeric(15,2) CHECK (rate_per_spot IS NULL OR rate_per_spot >= 0),
 airbnb_rate_per_pax_night numeric(15,2) CHECK (airbnb_rate_per_pax_night IS NULL OR airbnb_rate_per_pax_night >= 0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL
);
COMMENT ON TABLE public.member_claim_rates IS
 'HR''s fair-claim rates (2026-10-05), one row: the base every outstation route starts from, RM per spot, and Airbnb RM per person per night. Written by member_admin_save_claim_settings only.';

CREATE TABLE IF NOT EXISTS public.member_claim_regions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 40),
 spots integer NOT NULL CHECK (spots BETWEEN 0 AND 100),
 sort_order integer NOT NULL DEFAULT 0,
 is_active boolean NOT NULL DEFAULT true,
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_member_claim_regions_name ON public.member_claim_regions (lower(trim(name)));
COMMENT ON TABLE public.member_claim_regions IS
 'A fair region and its spots for the return trip from the base (2026-10-05). 0 spots = local: no outstation claim. A region is retired (is_active false), never deleted, so an old claim still names it.';

ALTER TABLE public.member_claim_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_claim_regions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS member_claim_rates_read ON public.member_claim_rates;
CREATE POLICY member_claim_rates_read ON public.member_claim_rates FOR SELECT TO authenticated
 USING ((SELECT public.member_is_manager('member_requests_manage')));
DROP POLICY IF EXISTS member_claim_regions_read ON public.member_claim_regions;
CREATE POLICY member_claim_regions_read ON public.member_claim_regions FOR SELECT TO authenticated
 USING ((SELECT public.member_is_manager('member_requests_manage')));
REVOKE ALL ON public.member_claim_rates, public.member_claim_regions FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.member_claim_rates, public.member_claim_regions FROM authenticated;

-- The user's starting numbers (2026-10-05): the prototype's spots, RM 50 a spot, RM 65 a person a night.
INSERT INTO public.member_claim_rates (id, base_name, rate_per_spot, airbnb_rate_per_pax_night)
 VALUES (true, 'Klang Valley', 50, 65) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.member_claim_regions (name, spots, sort_order)
 SELECT v.name, v.spots, v.sort_order FROM (VALUES ('KL',0,1),('Penang',4,2),('Ipoh',2,3),('Melaka',2,4),('Johor',3,5),('Pahang',3,6),('Sabah',6,7),('Sarawak',6,8)) AS v(name, spots, sort_order)
 WHERE NOT EXISTS (SELECT 1 FROM public.member_claim_regions r WHERE lower(trim(r.name))=lower(v.name));

-- What a member's claim form reads: the base, the rates, the active regions.
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
  'regions',coalesce((SELECT jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'spots',g.spots) ORDER BY g.sort_order, g.name)
   FROM public.member_claim_regions g WHERE g.is_active),'[]'::jsonb))
 WHERE public.has_perm('member_requests') OR public.member_is_manager('member_requests_manage');
$function$;
REVOKE ALL ON FUNCTION public.member_claim_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_claim_settings() TO authenticated;

-- A fair claim's detail as stored: checked, and its amount worked out from the rates.
CREATE OR REPLACE FUNCTION public.member_claim_detail(p_detail jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_type text := p_detail->>'claimType'; v_rates public.member_claim_rates%ROWTYPE; v_region public.member_claim_regions%ROWTYPE;
 v_start date; v_end date; v_pax integer; v_nights integer;
BEGIN
 IF v_type IS NULL OR v_type NOT IN ('outstation','airbnb') THEN RAISE EXCEPTION 'Choose Outstation or Airbnb'; END IF;
 IF coalesce(p_detail->>'week','')!~'^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Choose the brand week the claim is for'; END IF;
 SELECT * INTO v_rates FROM public.member_claim_rates WHERE id;
 IF v_type='outstation' THEN
  IF coalesce(p_detail->>'region','')!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'Choose the fair region'; END IF;
  SELECT * INTO v_region FROM public.member_claim_regions WHERE id=(p_detail->>'region')::uuid AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Choose the fair region'; END IF;
  IF v_region.spots<=0 THEN RAISE EXCEPTION '% fairs are local, so there is no outstation claim', coalesce(v_rates.base_name,'Klang Valley'); END IF;
  IF coalesce(v_rates.rate_per_spot,0)<=0 THEN RAISE EXCEPTION 'HR has not set the rate per spot yet'; END IF;
  RETURN (p_detail - 'invoiceHash' - 'invoiceName' - 'start' - 'end' - 'male' - 'female' - 'pax' - 'nights' - 'amount')
   || jsonb_build_object('category','Outstation','base',v_rates.base_name,'regionName',v_region.name,'spots',v_region.spots,
    'rate',v_rates.rate_per_spot,'amount',round(v_region.spots*v_rates.rate_per_spot,2));
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
 IF coalesce(v_rates.airbnb_rate_per_pax_night,0)<=0 THEN RAISE EXCEPTION 'HR has not set the Airbnb rate yet'; END IF;
 RETURN (p_detail - 'region' - 'regionName' - 'spots' - 'amount')
  || jsonb_build_object('category','Airbnb accommodation','pax',v_pax,'nights',v_nights,
   'rate',v_rates.airbnb_rate_per_pax_night,'amount',round(v_pax*v_nights*v_rates.airbnb_rate_per_pax_night,2));
END $function$;
REVOKE ALL ON FUNCTION public.member_claim_detail(jsonb) FROM PUBLIC, anon, authenticated;

-- HR's view of the rates (People › Member services › Claim rates).
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
  'updatedAt',(SELECT updated_at FROM public.member_claim_rates WHERE id),
  'updatedBy',(SELECT u.name FROM public.member_claim_rates r JOIN public.users u ON u.id=r.updated_by WHERE r.id),
  'regions',coalesce((SELECT jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'spots',g.spots,'active',g.is_active) ORDER BY g.sort_order, g.name)
   FROM public.member_claim_regions g),'[]'::jsonb));
END $function$;
REVOKE ALL ON FUNCTION public.member_admin_claim_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_admin_claim_settings() TO authenticated;

-- HR saves the rates: the base, RM per spot, RM per person per night, and the
-- regions in order ({id?, name, spots}); a region left out is retired.
CREATE OR REPLACE FUNCTION public.member_admin_save_claim_settings(p_base text, p_per_spot numeric, p_per_pax_night numeric, p_regions jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_row jsonb; v_i integer := 0; v_keep uuid[] := '{}'; v_id uuid;
BEGIN
 IF NOT public.member_is_manager('member_requests_manage') THEN RAISE EXCEPTION 'HR request management access is required' USING ERRCODE='42501'; END IF;
 IF p_base IS NULL OR length(trim(p_base)) NOT BETWEEN 1 AND 60 THEN RAISE EXCEPTION 'Name the base every route starts from'; END IF;
 IF (p_per_spot IS NOT NULL AND (p_per_spot<0 OR p_per_spot>100000)) OR (p_per_pax_night IS NOT NULL AND (p_per_pax_night<0 OR p_per_pax_night>100000)) THEN
  RAISE EXCEPTION 'Rates must be between RM 0 and RM 100,000';
 END IF;
 IF jsonb_typeof(p_regions)<>'array' OR jsonb_array_length(p_regions)>60 THEN RAISE EXCEPTION 'Invalid regions'; END IF;
 INSERT INTO public.member_claim_rates (id, base_name, rate_per_spot, airbnb_rate_per_pax_night, updated_at, updated_by)
 VALUES (true, trim(p_base), p_per_spot, p_per_pax_night, now(), auth.uid())
 ON CONFLICT (id) DO UPDATE SET base_name=EXCLUDED.base_name, rate_per_spot=EXCLUDED.rate_per_spot,
  airbnb_rate_per_pax_night=EXCLUDED.airbnb_rate_per_pax_night, updated_at=now(), updated_by=auth.uid();
 FOR v_row IN SELECT value FROM jsonb_array_elements(p_regions) LOOP
  v_i := v_i+1;
  IF coalesce(trim(v_row->>'name'),'')='' OR length(trim(v_row->>'name'))>40 THEN RAISE EXCEPTION 'Every region needs a name'; END IF;
  IF coalesce(v_row->>'spots','')!~'^\d{1,3}$' OR (v_row->>'spots')::integer>100 THEN RAISE EXCEPTION 'Spots must be a whole number from 0 to 100'; END IF;
  v_id := CASE WHEN coalesce(v_row->>'id','')~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (v_row->>'id')::uuid END;
  IF v_id IS NULL THEN SELECT id INTO v_id FROM public.member_claim_regions WHERE lower(trim(name))=lower(trim(v_row->>'name')); END IF;
  IF v_id IS NULL THEN
   INSERT INTO public.member_claim_regions (name, spots, sort_order, is_active, updated_at, updated_by)
   VALUES (trim(v_row->>'name'), (v_row->>'spots')::integer, v_i, true, now(), auth.uid()) RETURNING id INTO v_id;
  ELSE
   UPDATE public.member_claim_regions SET name=trim(v_row->>'name'), spots=(v_row->>'spots')::integer, sort_order=v_i,
    is_active=true, updated_at=now(), updated_by=auth.uid() WHERE id=v_id;
  END IF;
  IF v_id=ANY(v_keep) THEN RAISE EXCEPTION 'Two regions share the name %', trim(v_row->>'name'); END IF;
  v_keep := v_keep||v_id;
 END LOOP;
 UPDATE public.member_claim_regions SET is_active=false, updated_at=now(), updated_by=auth.uid() WHERE is_active AND NOT (id=ANY(v_keep));
 RETURN public.member_admin_claim_settings();
END $function$;
REVOKE ALL ON FUNCTION public.member_admin_save_claim_settings(text, numeric, numeric, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_admin_save_claim_settings(text, numeric, numeric, jsonb) TO authenticated;

-- member_prepare_request: a fair claim's detail is worked out first, so a retry
-- with the same key compares like with like; everything else is unchanged.
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
 -- A fair claim (2026-10-05): its amount is HR's rate, worked out here, never sent.
 IF p_kind='claim' AND p_detail ? 'claimType' THEN p_detail := public.member_claim_detail(p_detail); END IF;
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
 v_title:=CASE p_detail->>'claimType' WHEN 'outstation' THEN 'Outstation claim' ELSE 'Airbnb claim' END
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

-- member_submit_request: an outstation claim has no invoice; its benefit claim
-- says what it is for. Everything else is unchanged.
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
 -- An outstation claim is paid by the fixed rate: there is no invoice to attest (2026-10-05).
 IF v_path IS NULL AND coalesce(r.detail->>'claimType','')<>'outstation' THEN RAISE EXCEPTION 'A verified invoice is required before submitting'; END IF;
 SELECT employee_name,department_id INTO v_name,v_dept FROM public.hr_staff_costs WHERE id=v_staff;
 v_desc:=CASE r.detail->>'claimType'
  WHEN 'outstation' THEN concat('Outstation · ',r.detail->>'base',' → ',r.detail->>'regionName',' · ',r.detail->>'spots',' spots × RM ',r.detail->>'rate',
   ' · ',r.detail->>'location',' (week of ',r.detail->>'week',')')
  WHEN 'airbnb' THEN concat('Airbnb · ',r.detail->>'pax',' pax × ',r.detail->>'nights',' nights × RM ',r.detail->>'rate',
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

-- ─── 5. View as: the viewed person's memo receipts ──────────────────────────

CREATE OR REPLACE FUNCTION public.member_principal_memo_receipts(p_staff uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role='principal' AND is_active) THEN
  RAISE EXCEPTION 'An active Principal account is required' USING ERRCODE='42501';
 END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('memoId',r.memo_id,'readAt',r.read_at,'acknowledgedAt',r.acknowledged_at))
  FROM public.member_memo_receipts r JOIN public.member_memos m ON m.id=r.memo_id AND m.version=r.version
  JOIN public.hr_staff_costs s ON s.user_id=r.user_id WHERE s.id=p_staff),'[]'::jsonb);
END $function$;
REVOKE ALL ON FUNCTION public.member_principal_memo_receipts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_principal_memo_receipts(uuid) TO authenticated;
