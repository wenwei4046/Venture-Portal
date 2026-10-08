-- A member's claim is decided ONCE, in Member Services (2026-10-08).
--
-- Until now a Revenue member's claim (Outstation / Airbnb / plane ticket, sent
-- from the Revenue app) became a pending BENEFIT claim, and HR had to leave
-- Member Services — where all it could do was ask for more information — to
-- approve it a second time on the portal's Claims page (user: "他上面那个 claim
-- 他就会跳过来这边 … 一个一个就好了，不要那么多个，很麻烦"). The portal's Claims
-- page keeps POOL claims only, which Finance approves as before.
--
-- HR approves in Member Services and chooses where the money comes from, per
-- claim (user, 2026-10-08):
--
--   payroll   a 'special_claim' pay line in the member's Revenue payroll — the
--             month the claim was SUBMITTED, or, when that month is already
--             closed for them, the next month still open for them
--             (`member_claim_payroll_month`). Paid with the salary; the claim
--             turns paid when that payroll row does.
--   payment   a payment request to Finance: the claim waits, approved and
--             without a voucher, until Finance raises the voucher on Payments ›
--             Claim requests (`claim_create_payment_voucher`); the Principal
--             approves it like any other, and the claim turns paid with it.
--
-- Nothing is marked paid by hand any more: `claims_follow_their_voucher` and
-- `claims_follow_their_payroll` move a claim with the money. A claim's pay line
-- is the claim's — `revenue_save_pay_lines` (Comm Cal's pencil) can neither
-- change nor delete it.
--
-- The three functions replaced below are built from the repo's last copies,
-- which matched production's md5(prosrc) on 2026-10-08; the guard refuses to
-- run if production has moved since.

DO $guard$
DECLARE
  v_expected CONSTANT jsonb := jsonb_build_object(
    'public.member_admin_action(text,uuid,jsonb)', '0ee4c3f57c7ba328cc4bf3cc3547aa55',
    'public.revenue_save_pay_lines(uuid,date,jsonb,jsonb)', '02936bb542d580edea71e6c495c7d455',
    'public.member_request_json(uuid)', 'eba308147d3c0bb0430946a78e44c073');
  v_fn text;
  v_md5 text;
BEGIN
  FOR v_fn IN SELECT jsonb_object_keys(v_expected) LOOP
    SELECT md5(prosrc) INTO v_md5 FROM pg_proc WHERE oid = to_regprocedure(v_fn);
    IF v_md5 IS NOT NULL AND v_md5 <> v_expected->>v_fn THEN
      RAISE EXCEPTION '% changed on the database since this migration was written (md5 %)', v_fn, v_md5;
    END IF;
  END LOOP;
END $guard$;

-- ─── Where an approved claim goes ──────────────────────────────────────────

ALTER TABLE public.claims
  ADD COLUMN IF NOT EXISTS payout_route text
    CHECK (payout_route IS NULL OR payout_route IN ('payroll', 'payment'));

COMMENT ON COLUMN public.claims.payout_route IS
  'Where an approved member claim is paid from (2026-10-08): ''payroll'' = a special-claim pay line in claims.payroll_month; ''payment'' = a voucher Finance raises from Payments › Claim requests. NULL for pool claims and anything not yet approved.';

ALTER TABLE public.revenue_pay_lines
  ADD COLUMN IF NOT EXISTS claim_id uuid UNIQUE REFERENCES public.claims(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.revenue_pay_lines.claim_id IS
  'The approved claim that put this line here (2026-10-08). Such a line changes only with its claim: revenue_save_pay_lines neither edits nor deletes it.';

-- ─── The month a claim's pay line lands in ─────────────────────────────────
-- The month it was submitted; never one before the sub-department's cutover
-- (a month the portal does not pay); never a month locked for the accounts or
-- closed for good; and never a month whose payroll row for this person has
-- moved on from draft (completed on Comm Cal, with Finance, paid) — the next
-- month still open for them instead. NULL when none of the next 24 is.

CREATE OR REPLACE FUNCTION public.member_claim_payroll_month(p_staff uuid, p_sub uuid, p_from date)
RETURNS date
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_month date := date_trunc('month', p_from)::date;
  v_cut   date;
  v_row   hr_monthly_payroll%ROWTYPE;
BEGIN
  IF p_staff IS NULL OR p_from IS NULL THEN RETURN NULL; END IF;
  SELECT first_paid_month INTO v_cut FROM comm_cutovers WHERE sub_department_id = p_sub;
  IF v_cut IS NOT NULL AND v_cut > v_month THEN v_month := v_cut; END IF;
  FOR i IN 1..24 LOOP
    IF NOT EXISTS (SELECT 1 FROM period_locks WHERE period_month = v_month AND is_locked)
       AND NOT payroll_month_closed(v_month) THEN
      SELECT * INTO v_row FROM hr_monthly_payroll WHERE staff_id = p_staff AND period_month = v_month;
      IF NOT FOUND OR (v_row.source = 'commission' AND v_row.status = 'draft') THEN
        RETURN v_month;
      END IF;
    END IF;
    v_month := (v_month + interval '1 month')::date;
  END LOOP;
  RETURN NULL;
END
$fn$;

REVOKE ALL ON FUNCTION public.member_claim_payroll_month(uuid, uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_claim_payroll_month(uuid, uuid, date) TO service_role;

-- ─── HR's decision ─────────────────────────────────────────────────────────
-- Reached only through member_admin_action (approve / reject on a claim). The
-- caller holds the request row; this locks the claim beside it.

CREATE OR REPLACE FUNCTION public.member_review_claim(p_request uuid, p_action text, p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r            member_requests%ROWTYPE;
  c            claims%ROWTYPE;
  v_note       text := nullif(btrim(coalesce(p_data->>'note', '')), '');
  v_route      text := p_data->>'route';
  v_name       text;
  v_source     text;
  v_month      date;
  v_row        hr_monthly_payroll%ROWTYPE;
  v_has_row    boolean := false;
  v_line       uuid;
  v_desc       text;
  v_order      integer;
  v_earnings   numeric(15,2);
  v_deductions numeric(15,2);
BEGIN
  IF NOT public.member_is_manager('member_requests_manage') THEN
    RAISE EXCEPTION 'HR request management access is required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO r FROM member_requests WHERE id = p_request FOR UPDATE;
  IF NOT FOUND OR r.kind <> 'claim' THEN RAISE EXCEPTION 'Claim request not found'; END IF;
  IF r.status NOT IN ('submitted', 'needs_info') THEN
    RAISE EXCEPTION 'This claim has already been decided';
  END IF;
  SELECT * INTO c FROM claims WHERE id = r.claim_id FOR UPDATE;
  IF NOT FOUND OR c.status <> 'pending' THEN
    RAISE EXCEPTION 'This claim has already been decided';
  END IF;

  IF p_action = 'reject' THEN
    IF v_note IS NULL THEN RAISE EXCEPTION 'Say why the claim is rejected'; END IF;
    UPDATE claims SET status = 'rejected', approved_by = auth.uid(), approved_at = now() WHERE id = c.id;
    UPDATE member_requests
       SET status = 'rejected', note = v_note, reviewed_by = auth.uid(), reviewed_at = now()
     WHERE id = r.id;
    RETURN public.member_request_json(r.id);
  END IF;

  IF p_action <> 'approve' THEN RAISE EXCEPTION 'Unsupported claim action'; END IF;
  IF v_route IS NULL OR v_route NOT IN ('payroll', 'payment') THEN
    RAISE EXCEPTION 'Choose how the claim is paid: with their payroll, or by a payment from Finance';
  END IF;

  IF v_route = 'payroll' THEN
    SELECT s.employee_name, d.payroll_source::text INTO v_name, v_source
      FROM hr_staff_costs s LEFT JOIN departments d ON d.id = s.department_id
     WHERE s.id = r.staff_id;
    IF v_source IS DISTINCT FROM 'commission' THEN
      RAISE EXCEPTION '% is not paid through the Revenue payroll. Request a payment from Finance instead',
        coalesce(v_name, 'This person');
    END IF;

    v_month := public.member_claim_payroll_month(
      r.staff_id, r.sub_department_id,
      (coalesce(r.submitted_at, r.created_at) AT TIME ZONE 'Asia/Kuala_Lumpur')::date);
    IF v_month IS NULL THEN
      RAISE EXCEPTION 'No payroll month is open for %. Request a payment from Finance instead', v_name;
    END IF;

    -- The lock every Revenue payroll write takes, then the row again under it.
    PERFORM pg_advisory_xact_lock(hashtext('commission_payroll:' || v_month::text));
    SELECT * INTO v_row FROM hr_monthly_payroll
     WHERE staff_id = r.staff_id AND period_month = v_month FOR UPDATE;
    v_has_row := FOUND;
    IF v_has_row AND (v_row.source <> 'commission' OR v_row.status <> 'draft') THEN
      RAISE EXCEPTION '%''s payroll for % has just moved on. Try again', v_name, to_char(v_month, 'FMMonth YYYY');
    END IF;

    v_desc := nullif(btrim(left(concat_ws(' · ', r.request_no, nullif(btrim(c.description), '')), 200)), '');
    SELECT coalesce(max(sort_order), 0) + 1 INTO v_order
      FROM revenue_pay_lines WHERE staff_id = r.staff_id AND period_month = v_month;
    INSERT INTO revenue_pay_lines (staff_id, period_month, kind, description, amount, sort_order,
                                   created_by, updated_by, claim_id)
    VALUES (r.staff_id, v_month, 'special_claim', v_desc, c.amount, v_order, auth.uid(), auth.uid(), c.id)
    RETURNING id INTO v_line;

    -- The row, if the month has one, takes the new totals — the totals trigger
    -- re-reads them and recomputes gross and net around them.
    IF v_has_row THEN
      SELECT t.earnings, t.deductions INTO v_earnings, v_deductions
        FROM revenue_pay_line_totals(r.staff_id, v_month) t;
      UPDATE hr_monthly_payroll
         SET pay_line_earnings = v_earnings, pay_line_deductions = v_deductions
       WHERE id = v_row.id;
    END IF;

    INSERT INTO access_log (user_id, resource_type, resource_id, action, metadata)
    VALUES (auth.uid(), 'revenue_pay_lines', r.staff_id::text, 'claim_line',
            jsonb_build_object('period', v_month, 'staff', v_name, 'claim', c.id, 'request', r.request_no,
                               'line', v_line, 'amount', c.amount,
                               'payroll_row', CASE WHEN v_has_row THEN v_row.id END));
  END IF;

  UPDATE claims
     SET status = 'approved', approved_by = auth.uid(), approved_at = now(),
         payout_route = v_route, payroll_month = v_month
   WHERE id = c.id;
  UPDATE member_requests
     SET status = 'approved', note = coalesce(v_note, 'Approved'), reviewed_by = auth.uid(), reviewed_at = now()
   WHERE id = r.id;
  RETURN public.member_request_json(r.id);
END
$fn$;

REVOKE ALL ON FUNCTION public.member_review_claim(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_review_claim(uuid, text, jsonb) TO service_role;

-- ─── member_admin_action: a claim's approve / reject come here ─────────────

CREATE OR REPLACE FUNCTION public.member_admin_action(p_action text,p_request uuid DEFAULT NULL,p_data jsonb DEFAULT '{}') RETURNS jsonb
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
 -- A claim is decided HERE since 2026-10-08 (member_review_claim): approved
 -- once, then paid with the member's payroll or by a voucher Finance raises and
 -- the Principal approves. Nothing is ever marked paid from this queue.
 IF r.kind='claim' THEN
 IF p_action IN('approve','reject') THEN RETURN public.member_review_claim(r.id,p_action,p_data); END IF;
 IF p_action<>'needs_info' OR r.status NOT IN('submitted','needs_info') OR v_note IS NULL THEN RAISE EXCEPTION 'Return the claim with a note, approve it or reject it'; END IF;
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

-- ─── Finance raises the voucher ────────────────────────────────────────────
-- For a member claim HR approved as a payment request, and for a pool claim
-- whose voucher was voided: the claim_payout voucher approveClaim drafts for a
-- pool claim (Venture Pool or the chosen pool, G&A 9000), numbered the way
-- generate_pv_for_dept_request numbers, waiting for the Principal.

CREATE OR REPLACE FUNCTION public.claim_create_payment_voucher(p_claim uuid, p_bank uuid, p_method text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  c       claims%ROWTYPE;
  v_no    text;
  v_pv    uuid;
  v_pool  text;
  v_ref   text;
  v_desc  text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_perm('treasury') THEN
    RAISE EXCEPTION 'Only Finance may raise a payment voucher' USING ERRCODE = '42501';
  END IF;
  IF p_method IS NULL OR p_method NOT IN ('bank_transfer', 'cheque', 'cash') THEN
    RAISE EXCEPTION 'Choose how the claim is paid: bank transfer, cheque or cash';
  END IF;

  SELECT * INTO c FROM claims WHERE id = p_claim FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Claim not found'; END IF;
  IF c.status <> 'approved' OR c.voucher_id IS NOT NULL THEN
    RAISE EXCEPTION 'This claim is not waiting for a payment voucher';
  END IF;
  IF c.claim_type = 'benefit' AND c.payout_route IS DISTINCT FROM 'payment' THEN
    RAISE EXCEPTION 'This claim is paid with the payroll, not by a voucher';
  END IF;
  IF c.amount IS NULL OR c.amount <= 0 THEN RAISE EXCEPTION 'This claim has no amount to pay'; END IF;
  IF NOT EXISTS (SELECT 1 FROM bank_accounts WHERE id = p_bank AND status = 'active') THEN
    RAISE EXCEPTION 'Choose an active bank account to pay from';
  END IF;

  v_pool := coalesce(nullif(c.source_pool, ''), 'venture_pool');
  SELECT request_no INTO v_ref FROM member_requests WHERE claim_id = c.id LIMIT 1;
  v_desc := concat('Claim payout: ', c.claimant_name, ' — ',
                   concat_ws(' · ', v_ref, nullif(btrim(coalesce(c.description, '')), '')));

  PERFORM pg_advisory_xact_lock(hashtext('hv_voucher_no'));
  SELECT 'HV-PV-' || to_char(now(), 'YYYYMM') || '-' ||
         lpad((coalesce(max((regexp_replace(voucher_no, '^HV-PV-\d{6}-', ''))::int), 0) + 1)::text, 4, '0')
    INTO v_no
    FROM payment_vouchers
   WHERE voucher_no LIKE 'HV-PV-' || to_char(now(), 'YYYYMM') || '-%';

  INSERT INTO payment_vouchers (voucher_no, voucher_type, direction, status, amount, payee_name,
                                bank_account_id, description, payment_method, source_pool,
                                reference_type, reference_id, payment_date, created_by)
  VALUES (v_no, 'claim_payout', 'debit', 'pending_approval', c.amount, c.claimant_name,
          p_bank, v_desc, p_method, v_pool,
          'claim', c.id, (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date, auth.uid())
  RETURNING id INTO v_pv;

  INSERT INTO payment_voucher_sources (voucher_id, pool, amount, account_code)
  VALUES (v_pv, v_pool, c.amount, '9000');

  INSERT INTO approval_requests (request_type, reference_id, reference_table, submitted_by,
                                 description, amount, status, workflow_state)
  VALUES ('payment_voucher', v_pv, 'payment_vouchers', auth.uid(),
          format('%s: Claim payout — %s', v_no, c.claimant_name), c.amount, 'pending', 'submitted');

  UPDATE claims SET voucher_id = v_pv WHERE id = c.id;

  INSERT INTO access_log (user_id, resource_type, resource_id, action, metadata)
  VALUES (auth.uid(), 'claim', c.id::text, 'create_payment_voucher',
          jsonb_build_object('voucher', v_pv, 'voucher_no', v_no, 'amount', c.amount,
                             'bank', p_bank, 'method', p_method, 'request', v_ref));
  RETURN v_pv;
END
$fn$;

REVOKE ALL ON FUNCTION public.claim_create_payment_voucher(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_create_payment_voucher(uuid, uuid, text) TO authenticated;

-- ─── Finance's queue: Payments › Claim requests ────────────────────────────
-- Approved claims Finance pays by voucher: those waiting for one, and those
-- whose voucher waits for the Principal. A member claim's request number comes
-- from member_requests, which Finance cannot read itself — so this reads it for
-- them, for a treasury holder only.

CREATE OR REPLACE FUNCTION public.claim_payment_queue()
RETURNS TABLE (
  claim_id         uuid,
  claim_type       text,
  claimant_name    text,
  department       text,
  amount           numeric,
  description      text,
  source_pool      text,
  request_no       text,
  approved_by_name text,
  approved_at      timestamptz,
  voucher_id       uuid,
  voucher_no       text,
  voucher_status   text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT c.id, c.claim_type::text, c.claimant_name, d.name, c.amount, c.description, c.source_pool,
         r.request_no, u.name, c.approved_at, c.voucher_id, v.voucher_no, v.status::text
    FROM claims c
    LEFT JOIN departments d ON d.id = c.department_id
    LEFT JOIN member_requests r ON r.claim_id = c.id
    LEFT JOIN users u ON u.id = c.approved_by
    LEFT JOIN payment_vouchers v ON v.id = c.voucher_id
   WHERE (SELECT public.has_perm('treasury'))
     AND c.status = 'approved'
     AND (c.payout_route = 'payment' OR c.claim_type = 'project')
     AND (c.voucher_id IS NULL OR v.status IN ('draft', 'pending_approval', 'approved'))
   ORDER BY c.approved_at NULLS LAST, c.id;
$fn$;

REVOKE ALL ON FUNCTION public.claim_payment_queue() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_payment_queue() TO authenticated;

-- ─── A claim moves with its money ──────────────────────────────────────────
-- Its voucher paid → the claim is paid. Its voucher voided → the claim waits
-- for a new one (and if it had been paid, the money came back: approved again).

CREATE OR REPLACE FUNCTION public.claims_follow_their_voucher()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.reference_type IS DISTINCT FROM 'claim' OR NEW.reference_id IS NULL
     OR NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF NEW.status = 'paid' THEN
    UPDATE claims SET status = 'paid'
     WHERE id = NEW.reference_id AND voucher_id = NEW.id AND status = 'approved';
  ELSIF NEW.status = 'voided' THEN
    UPDATE claims
       SET voucher_id = NULL,
           status = CASE WHEN status = 'paid' THEN 'approved'::claim_status ELSE status END
     WHERE id = NEW.reference_id AND voucher_id = NEW.id AND status IN ('approved', 'paid');
  END IF;
  RETURN NEW;
END
$fn$;

REVOKE ALL ON FUNCTION public.claims_follow_their_voucher() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER trg_claims_follow_their_voucher
  AFTER UPDATE OF status ON public.payment_vouchers
  FOR EACH ROW EXECUTE FUNCTION public.claims_follow_their_voucher();

-- Its payroll row paid → the claim is paid. Forward only: a paid row reopened
-- for a Second payroll or a Resubmit has already paid the line.

CREATE OR REPLACE FUNCTION public.claims_follow_their_payroll()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.status IS DISTINCT FROM 'paid' OR OLD.status IS NOT DISTINCT FROM 'paid' THEN
    RETURN NEW;
  END IF;
  UPDATE claims c SET status = 'paid'
    FROM revenue_pay_lines l
   WHERE l.claim_id = c.id AND l.staff_id = NEW.staff_id AND l.period_month = NEW.period_month
     AND c.status = 'approved';
  RETURN NEW;
END
$fn$;

REVOKE ALL ON FUNCTION public.claims_follow_their_payroll() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER trg_claims_follow_their_payroll
  AFTER UPDATE OF status ON public.hr_monthly_payroll
  FOR EACH ROW EXECUTE FUNCTION public.claims_follow_their_payroll();

-- ─── Comm Cal's pencil leaves a claim's line alone ─────────────────────────

CREATE OR REPLACE FUNCTION public.revenue_save_pay_lines(
    p_staff_id UUID, p_period DATE, p_lines JSONB, p_seen JSONB
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
    v_name      TEXT;
    v_source    TEXT;
    v_row       hr_monthly_payroll%ROWTYPE;
    v_has_row   BOOLEAN := FALSE;
    v_stored    TEXT[];
    v_seen      TEXT[];
    v_before    JSONB;
    v_after     JSONB;
    v_line      JSONB;
    v_id        UUID;
    v_kind      TEXT;
    v_desc      TEXT;
    v_amount    NUMERIC;
    v_keep      UUID[] := '{}';
    v_order     INTEGER := 0;
    v_changed   BOOLEAN := FALSE;
    v_earnings  NUMERIC(15,2);
    v_deductions NUMERIC(15,2);
BEGIN
    IF auth.uid() IS NULL OR NOT (has_scope(ARRAY['admin']) OR has_scope(ARRAY['hr'])) THEN
        RAISE EXCEPTION 'Only HR or the Principal may change a salesperson''s pay' USING ERRCODE = '42501';
    END IF;
    IF p_staff_id IS NULL OR p_period IS NULL OR EXTRACT(DAY FROM p_period) <> 1 THEN
        RAISE EXCEPTION 'Pay lines belong to a person and the first day of a month';
    END IF;
    IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR jsonb_typeof(p_seen) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Pay lines must be sent as a list';
    END IF;
    IF jsonb_array_length(p_lines) > 50 THEN
        RAISE EXCEPTION 'A month holds at most 50 pay lines';
    END IF;

    SELECT s.employee_name, d.payroll_source::TEXT INTO v_name, v_source
      FROM hr_staff_costs s LEFT JOIN departments d ON d.id = s.department_id
     WHERE s.id = p_staff_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Salesperson not found'; END IF;
    IF v_source IS DISTINCT FROM 'commission' THEN
        RAISE EXCEPTION '% is not paid through the Revenue payroll. Key their pay on HR Costing', v_name;
    END IF;

    -- The lock every Revenue payroll write takes, then the month's own guard:
    -- Principal or HR, the period open, payroll not submitted, no voucher.
    PERFORM pg_advisory_xact_lock(hashtext('commission_payroll:' || p_period::TEXT));
    PERFORM assert_commission_payroll_open(p_period);

    SELECT * INTO v_row FROM hr_monthly_payroll
     WHERE staff_id = p_staff_id AND period_month = p_period FOR UPDATE;
    v_has_row := FOUND;
    IF v_has_row AND v_row.source <> 'commission' THEN
        RAISE EXCEPTION '%''s payroll for % is not a Revenue payroll row. Change it on HR Costing',
            v_name, to_char(p_period, 'FMMonth YYYY');
    END IF;
    IF v_has_row AND v_row.status <> 'draft' THEN
        RAISE EXCEPTION '%''s payroll for % is %. Reopen payroll before changing pay lines',
            v_name, to_char(p_period, 'FMMonth YYYY'), v_row.status;
    END IF;

    -- What the editor opened must still be what is stored.
    SELECT COALESCE(array_agg(l.id::TEXT || ':' || l.version ORDER BY l.id::TEXT || ':' || l.version), '{}'),
           COALESCE(jsonb_agg(jsonb_build_object('id', l.id, 'kind', l.kind, 'description', l.description,
               'amount', l.amount) ORDER BY l.sort_order, l.created_at), '[]'::JSONB)
      INTO v_stored, v_before
      FROM revenue_pay_lines l
     WHERE l.staff_id = p_staff_id AND l.period_month = p_period;
    SELECT COALESCE(array_agg(x ORDER BY x), '{}') INTO v_seen
      FROM jsonb_array_elements_text(p_seen) x;
    IF v_stored IS DISTINCT FROM v_seen THEN
        RAISE EXCEPTION 'Pay lines for % changed since you opened them. Reload and try again', v_name;
    END IF;

    FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
        v_order := v_order + 1;
        IF jsonb_typeof(v_line) IS DISTINCT FROM 'object' THEN
            RAISE EXCEPTION 'Line % is not a pay line', v_order;
        END IF;
        v_kind := v_line->>'kind';
        IF v_kind IS NULL OR v_kind NOT IN ('special_claim', 'allowance', 'incentive', 'deduction') THEN
            RAISE EXCEPTION 'Line %: choose what the line is', v_order;
        END IF;
        v_desc := NULLIF(btrim(COALESCE(v_line->>'description', '')), '');
        IF v_desc IS NOT NULL AND length(v_desc) > 200 THEN
            RAISE EXCEPTION 'Line %: keep the description under 200 characters', v_order;
        END IF;
        IF jsonb_typeof(v_line->'amount') IS DISTINCT FROM 'number' THEN
            RAISE EXCEPTION 'Line %: enter an amount', v_order;
        END IF;
        v_amount := (v_line->>'amount')::NUMERIC;
        IF v_amount <= 0 OR v_amount <> round(v_amount, 2) OR v_amount > 9999999999999.99 THEN
            RAISE EXCEPTION 'Line %: the amount must be more than 0, to the sen', v_order;
        END IF;

        v_id := NULLIF(v_line->>'id', '')::UUID;
        IF v_id IS NULL THEN
            INSERT INTO revenue_pay_lines (staff_id, period_month, kind, description, amount, sort_order,
                                           created_by, updated_by)
            VALUES (p_staff_id, p_period, v_kind, v_desc, v_amount, v_order, auth.uid(), auth.uid())
            RETURNING id INTO v_id;
            v_changed := TRUE;
        ELSE
            IF v_id = ANY (v_keep) THEN
                RAISE EXCEPTION 'Line % is listed twice', v_order;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM revenue_pay_lines
                            WHERE id = v_id AND staff_id = p_staff_id AND period_month = p_period) THEN
                RAISE EXCEPTION 'Line % is not one of %''s lines for %', v_order, v_name, to_char(p_period, 'FMMonth YYYY');
            END IF;
            -- A line an approved claim put here (2026-10-08) is the claim's:
            -- sent back unchanged it stays, changed it is refused.
            IF EXISTS (SELECT 1 FROM revenue_pay_lines
                        WHERE id = v_id AND claim_id IS NOT NULL
                          AND ROW(kind, description, amount) IS DISTINCT FROM ROW(v_kind, v_desc, v_amount)) THEN
                RAISE EXCEPTION 'Line % came from an approved claim. It changes only with the claim, in Member Services', v_order;
            END IF;
            UPDATE revenue_pay_lines
               SET kind = v_kind, description = v_desc, amount = v_amount, sort_order = v_order,
                   version = version + 1, updated_by = auth.uid(), updated_at = now()
             WHERE id = v_id
               AND ROW(kind, description, amount, sort_order) IS DISTINCT FROM ROW(v_kind, v_desc, v_amount, v_order);
            IF FOUND THEN v_changed := TRUE; END IF;
        END IF;
        v_keep := v_keep || v_id;
    END LOOP;

    -- Never a claim's line: the editor leaves those out of p_lines.
    DELETE FROM revenue_pay_lines
     WHERE staff_id = p_staff_id AND period_month = p_period AND NOT (id = ANY (v_keep))
       AND claim_id IS NULL;
    IF FOUND THEN v_changed := TRUE; END IF;

    SELECT t.earnings, t.deductions INTO v_earnings, v_deductions
      FROM revenue_pay_line_totals(p_staff_id, p_period) t;

    -- The row, if the month has one, takes the new totals — the totals trigger
    -- re-reads them itself and recomputes gross, tax and net around them.
    IF v_has_row AND v_changed THEN
        UPDATE hr_monthly_payroll
           SET pay_line_earnings = v_earnings, pay_line_deductions = v_deductions
         WHERE id = v_row.id;
    END IF;

    IF v_changed THEN
        SELECT COALESCE(jsonb_agg(jsonb_build_object('id', l.id, 'kind', l.kind, 'description', l.description,
                   'amount', l.amount) ORDER BY l.sort_order, l.created_at), '[]'::JSONB)
          INTO v_after
          FROM revenue_pay_lines l
         WHERE l.staff_id = p_staff_id AND l.period_month = p_period;
        INSERT INTO access_log (user_id, resource_type, resource_id, action, metadata)
        VALUES (auth.uid(), 'revenue_pay_lines', p_staff_id::TEXT, 'save',
                jsonb_build_object('period', p_period, 'staff', v_name,
                                   'before', v_before, 'after', v_after,
                                   'payroll_row', CASE WHEN v_has_row THEN v_row.id END));
    END IF;

    RETURN jsonb_build_object('changed', v_changed, 'earnings', v_earnings, 'deductions', v_deductions,
                              'payroll_updated', v_has_row AND v_changed);
END;
$fn$;

-- ─── The request says where its money went ─────────────────────────────────

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
 'note',r.note,'claimId',r.claim_id,
 -- Where an approved claim went (2026-10-08): into a payroll month, or a voucher.
 'payout',CASE WHEN c.payout_route IS NULL THEN NULL ELSE jsonb_build_object('route',c.payout_route,
  'payrollMonth',c.payroll_month,'voucherNo',v.voucher_no,'voucherStatus',v.status) END)
 FROM public.member_requests r LEFT JOIN public.claims c ON c.id=r.claim_id
 LEFT JOIN public.payment_vouchers v ON v.id=c.voucher_id WHERE r.id=p_request;
$function$;

NOTIFY pgrst, 'reload schema';
