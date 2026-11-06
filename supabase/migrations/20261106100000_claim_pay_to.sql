-- A claim's Pay to (2026-11-06, the user: "这个payment request pay to 的人default 是自己，但要可以选或自己打"; the
-- sample mockups/claim-pay-to-mockup.html, A and A): the one sending it unless they change it — a person from People
-- (into their salary account as HR has it, or another account) or a name typed (its bank and account typed too).
-- From, the approval and the notices stay with the one who sent it. A colleague's salary account is read by Finance
-- with the Bank tick, never by whoever picked them. Without staffId and name (the code live before this merges) it
-- still means oneself, as before.

ALTER TABLE public.payment_requests
  ADD COLUMN IF NOT EXISTS payee_staff_id uuid REFERENCES public.hr_staff_costs(id) ON DELETE SET NULL;

-- Every claim so far paid the one who sent it.
UPDATE public.payment_requests SET payee_staff_id = staff_id
 WHERE kind = 'claim' AND payee_staff_id IS NULL AND staff_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.payment_requests_json(p_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me   uuid := auth.uid();
  v_bank boolean := coalesce(public.sees_sensitive('bank'), false);
BEGIN
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'id', r.id, 'requestNo', r.request_no, 'status', r.status, 'kind', r.kind, 'mine', r.requester_id = v_me,
             'requesterName', r.requester_name, 'departmentId', r.department_id, 'departmentName', d.name,
             'pool', CASE WHEN d.segment_key IS NULL THEN NULL ELSE 'dept_pool_' || d.segment_key END,
             'billingMode', d.billing_mode_key,
             'payToSalary', r.pay_to_salary, 'payeeName', r.payee_name, 'payeeStaffId', r.payee_staff_id,
             -- A colleague's salary account stays out of the reach of whoever picked them: HR's and Finance's to read.
             'payeeBank', CASE WHEN r.requester_id = v_me AND NOT v_bank AND r.kind = 'claim' AND r.pay_to_salary
                                    AND r.payee_staff_id IS DISTINCT FROM r.staff_id THEN NULL ELSE r.payee_bank END,
             'payeeAccount', CASE WHEN r.requester_id = v_me AND NOT v_bank AND r.kind = 'claim' AND r.pay_to_salary
                                       AND r.payee_staff_id IS DISTINCT FROM r.staff_id THEN NULL
                                  ELSE public.payment_request_account(r.payee_account_no, r.requester_id = v_me OR v_bank) END,
             'description', r.description, 'total', r.total,
             'submittedAt', r.submitted_at, 'createdAt', r.created_at, 'updatedAt', r.updated_at,
             'rejectedStage', r.rejected_stage, 'rejectedAt', r.rejected_at, 'rejectReason', r.reject_reason,
             'rejectedByName', (SELECT coalesce(nullif(btrim(u.name), ''), 'Finance') FROM public.users u WHERE u.id = r.rejected_by),
             'needsApproval', r.needs_approval, 'approvedAt', r.approved_at,
             'approvedByName', (SELECT coalesce(nullif(btrim(u.name), ''), 'Their manager') FROM public.users u WHERE u.id = r.approved_by),
             'reviewers', CASE WHEN r.status = 'pending_approval' THEN
                            coalesce((SELECT jsonb_agg(a.name ORDER BY a.name) FROM public.payment_request_approvers(r.department_id) a
                                       WHERE a.user_id <> r.requester_id), '[]'::jsonb) END,
             'pvId', r.pv_id, 'pvNo', v.voucher_no, 'pvStatus', v.status,
             'items', coalesce((SELECT jsonb_agg(jsonb_build_object('id', i.id, 'description', i.description, 'amount', i.amount)
                                               ORDER BY i.sort, i.id)
                                  FROM public.payment_request_items i WHERE i.request_id = r.id), '[]'::jsonb),
             'shares', coalesce((SELECT jsonb_agg(jsonb_build_object(
                                         'id', s.id, 'party', s.party, 'departmentId', s.department_id, 'departmentName', sd.name,
                                         'departmentBillingMode', sd.billing_mode_key,
                                         'companyId', s.company_id, 'companyName', co.name, 'amount', s.amount,
                                         'billBack', s.bill_back, 'invoiceId', s.invoice_id, 'invoiceNo', inv.invoice_no,
                                         'invoiceStatus', inv.status) ORDER BY s.sort, s.id)
                                   FROM public.payment_request_shares s
                                   LEFT JOIN public.departments sd ON sd.id = s.department_id
                                   LEFT JOIN public.companies co ON co.id = s.company_id
                                   LEFT JOIN public.invoices inv ON inv.id = s.invoice_id
                                  WHERE s.request_id = r.id), '[]'::jsonb),
             'files', coalesce((SELECT jsonb_agg(jsonb_build_object('id', f.id, 'kind', f.kind, 'name', f.name,
                                         'contentType', f.content_type, 'size', f.size) ORDER BY f.created_at, f.id)
                                  FROM public.payment_request_files f WHERE f.request_id = r.id), '[]'::jsonb))
           ORDER BY x.ord)
      FROM unnest(p_ids) WITH ORDINALITY AS x(id, ord)
      JOIN public.payment_requests r ON r.id = x.id
      JOIN public.departments d ON d.id = r.department_id
      LEFT JOIN public.payment_vouchers v ON v.id = r.pv_id
  ), '[]'::jsonb);
END
$fn$;

CREATE OR REPLACE FUNCTION public.payment_request_context()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me uuid := auth.uid();
  m    record;
BEGIN
  IF v_me IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_me AND u.is_active)
     OR NOT coalesce(public.has_any_action(ARRAY['claims.create:own']), false) THEN
    RAISE EXCEPTION 'Claim is not open to your account.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO m FROM public.payment_request_me(v_me);
  IF m.staff_id IS NULL THEN
    RAISE EXCEPTION 'Your login is not on a People record yet — ask HR to link it.' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object(
    'name', m.staff_name,
    'staffId', m.staff_id,
    'departmentId', m.department_id,
    'departmentName', m.department_name,
    'pool', CASE WHEN m.segment_key IS NULL THEN NULL ELSE 'dept_pool_' || m.segment_key END,
    'salaryAccount', CASE WHEN m.bank_name IS NULL OR m.bank_account_no IS NULL THEN NULL
                          ELSE jsonb_build_object('bank', m.bank_name, 'last4', right(m.bank_account_no, 4)) END,
    'departments', coalesce((SELECT jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name) ORDER BY d.created_at, d.name)
                               FROM public.departments d
                              WHERE NOT coalesce(d.is_internal, false) AND d.id <> m.department_id
                                AND coalesce(d.segment_key, '') <> 'director'), '[]'::jsonb),
    'companies', coalesce((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) ORDER BY c.name)
                             FROM public.companies c WHERE coalesce(c.is_active, true)), '[]'::jsonb),
    -- Pay to's list: everyone in People today — their names and departments, and only whether HR holds an account.
    'people', coalesce((SELECT jsonb_agg(jsonb_build_object(
                                 'id', s.id, 'name', btrim(s.employee_name), 'department', d.name,
                                 'hasSalary', nullif(btrim(s.bank_name), '') IS NOT NULL
                                              AND nullif(regexp_replace(coalesce(s.bank_account_no, ''), '[[:space:]-]', '', 'g'), '') IS NOT NULL)
                               ORDER BY btrim(s.employee_name), s.id)
                          FROM public.hr_staff_costs s
                          JOIN public.departments d ON d.id = s.department_id
                         WHERE s.status = 'active' AND nullif(btrim(s.employee_name), '') IS NOT NULL), '[]'::jsonb),
    'reviewers', (SELECT jsonb_agg(x.name ORDER BY x.name) FROM public.payment_request_reviewers(v_me, m.department_id) x));
END
$fn$;

CREATE OR REPLACE FUNCTION public.payment_request_save(p_request uuid, p_data jsonb, p_submit boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me        uuid := auth.uid();
  m           record;
  r           public.payment_requests%ROWTYPE;
  v_id        uuid := p_request;
  v_kind      text := p_data ->> 'kind';
  v_salary    boolean;
  v_name      text;
  v_bank      text;
  v_account   text;
  v_pay_staff uuid;
  v_pay_bank  text;
  v_pay_acct  text;
  v_item      jsonb;
  v_share     jsonb;
  v_amount    numeric;
  v_sort      integer;
  v_party     text;
  v_dept      uuid;
  v_company   uuid;
  v_total     numeric(15,2);
  v_shared    numeric(15,2);
  v_desc      text;
  v_n         integer;
  v_reviewers uuid[];
BEGIN
  IF v_me IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_me AND u.is_active)
     OR NOT coalesce(public.has_any_action(ARRAY['claims.create:own']), false) THEN
    RAISE EXCEPTION 'Claim is not open to your account.' USING ERRCODE = '42501';
  END IF;
  IF p_data IS NULL OR jsonb_typeof(p_data) <> 'object' THEN
    RAISE EXCEPTION 'Nothing to save.' USING ERRCODE = '22023';
  END IF;
  IF v_kind IS NULL OR v_kind NOT IN ('claim', 'direct_pay') THEN
    RAISE EXCEPTION 'Pick what it is: a claim, or pay a supplier directly.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO m FROM public.payment_request_me(v_me);
  IF m.staff_id IS NULL THEN
    RAISE EXCEPTION 'Your login is not on a People record yet — ask HR to link it.' USING ERRCODE = '22023';
  END IF;
  -- Files are checked before anything is written.
  PERFORM public.payment_request_files_check(p_data -> 'files');

  IF v_id IS NULL THEN
    INSERT INTO public.payment_requests (requester_id, staff_id, requester_name, department_id, kind)
    VALUES (v_me, m.staff_id, m.staff_name, m.department_id, v_kind)
    RETURNING id INTO v_id;
  ELSE
    SELECT * INTO r FROM public.payment_requests WHERE id = v_id AND requester_id = v_me FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Request not found.' USING ERRCODE = '42501';
    END IF;
    IF r.status NOT IN ('draft', 'rejected') THEN
      RAISE EXCEPTION 'This request is with Finance — it can no longer be changed. Cancel it to send another.' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Who is paid.
  IF v_kind = 'claim' THEN
    v_salary := coalesce((p_data -> 'payTo' ->> 'salary')::boolean, true);
    -- A person from People, a name typed, or (neither said) the one sending it.
    v_pay_staff := CASE WHEN (p_data -> 'payTo' ->> 'staffId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                        THEN (p_data -> 'payTo' ->> 'staffId')::uuid END;
    IF v_pay_staff IS NULL AND NOT (coalesce(p_data -> 'payTo', '{}'::jsonb) ? 'name') THEN
      v_pay_staff := m.staff_id;
    END IF;
    IF v_pay_staff IS NOT NULL THEN
      SELECT btrim(s.employee_name), nullif(btrim(s.bank_name), ''),
             nullif(regexp_replace(coalesce(s.bank_account_no, ''), '[[:space:]-]', '', 'g'), '')
        INTO v_name, v_pay_bank, v_pay_acct
        FROM public.hr_staff_costs s
       WHERE s.id = v_pay_staff AND s.status = 'active';
      IF NOT FOUND THEN
        RAISE EXCEPTION 'That person is no longer in People — pick someone else or type the name.' USING ERRCODE = '22023';
      END IF;
    ELSE
      -- Not in People: HR holds no account for a typed name.
      v_name := nullif(btrim(p_data -> 'payTo' ->> 'name'), '');
      v_salary := false;
    END IF;
    v_bank := CASE WHEN v_salary THEN NULL ELSE nullif(btrim(p_data -> 'payTo' ->> 'bank'), '') END;
    v_account := CASE WHEN v_salary THEN NULL ELSE nullif(regexp_replace(coalesce(p_data -> 'payTo' ->> 'accountNo', ''), '[[:space:]-]', '', 'g'), '') END;
  ELSE
    v_salary := false;
    v_name := nullif(btrim(p_data -> 'supplier' ->> 'name'), '');
    v_bank := nullif(btrim(p_data -> 'supplier' ->> 'bank'), '');
    v_account := nullif(regexp_replace(coalesce(p_data -> 'supplier' ->> 'accountNo', ''), '[[:space:]-]', '', 'g'), '');
  END IF;
  IF length(coalesce(v_name, '')) > 200 OR length(coalesce(v_bank, '')) > 120 THEN
    RAISE EXCEPTION 'Keep the name and the bank short.' USING ERRCODE = '22023';
  END IF;
  IF v_account IS NOT NULL AND v_account !~ '^[0-9A-Za-z]{4,30}$' THEN
    RAISE EXCEPTION 'An account number is digits only.' USING ERRCODE = '22023';
  END IF;

  -- What it was for.
  IF jsonb_typeof(coalesce(p_data -> 'items', '[]'::jsonb)) <> 'array' OR jsonb_array_length(coalesce(p_data -> 'items', '[]'::jsonb)) > 30 THEN
    RAISE EXCEPTION 'Up to 30 items on one request.' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.payment_request_items WHERE request_id = v_id;
  v_sort := 0;
  FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(p_data -> 'items', '[]'::jsonb)) LOOP
    v_amount := CASE WHEN btrim(coalesce(v_item ->> 'amount', '')) ~ '^\d{1,12}(\.\d{1,2})?$' THEN (v_item ->> 'amount')::numeric
                     WHEN btrim(coalesce(v_item ->> 'amount', '')) = '' THEN 0 END;
    IF v_amount IS NULL THEN
      RAISE EXCEPTION 'An item''s amount is a number of ringgit, like 99.90.' USING ERRCODE = '22023';
    END IF;
    IF nullif(btrim(coalesce(v_item ->> 'description', '')), '') IS NULL AND v_amount = 0 THEN
      CONTINUE; -- an empty row
    END IF;
    v_sort := v_sort + 1;
    INSERT INTO public.payment_request_items (request_id, description, amount, sort)
    VALUES (v_id, left(btrim(coalesce(v_item ->> 'description', '')), 200), round(v_amount, 2), v_sort);
  END LOOP;
  SELECT coalesce(sum(i.amount), 0), left(coalesce(string_agg(nullif(i.description, ''), ' · ' ORDER BY i.sort), ''), 200)
    INTO v_total, v_desc
    FROM public.payment_request_items i WHERE i.request_id = v_id;

  -- Which pool pays: the department's, less what a share puts on a company or another department.
  IF jsonb_typeof(coalesce(p_data -> 'shares', '[]'::jsonb)) <> 'array' OR jsonb_array_length(coalesce(p_data -> 'shares', '[]'::jsonb)) > 10 THEN
    RAISE EXCEPTION 'Up to 10 shares on one request.' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.payment_request_shares WHERE request_id = v_id;
  v_sort := 0;
  FOR v_share IN SELECT value FROM jsonb_array_elements(coalesce(p_data -> 'shares', '[]'::jsonb)) LOOP
    v_party := v_share ->> 'party';
    IF v_party IS NULL OR v_party NOT IN ('department', 'company') THEN
      RAISE EXCEPTION 'A share is a company''s or a department''s.' USING ERRCODE = '22023';
    END IF;
    v_dept := CASE WHEN v_party = 'department' AND (v_share ->> 'departmentId') ~* '^[0-9a-f-]{36}$' THEN (v_share ->> 'departmentId')::uuid END;
    v_company := CASE WHEN v_party = 'company' AND (v_share ->> 'companyId') ~* '^[0-9a-f-]{36}$' THEN (v_share ->> 'companyId')::uuid END;
    IF v_dept IS NOT NULL AND (v_dept = m.department_id OR NOT EXISTS (
         SELECT 1 FROM public.departments d WHERE d.id = v_dept AND NOT coalesce(d.is_internal, false) AND coalesce(d.segment_key, '') <> 'director')) THEN
      RAISE EXCEPTION 'Pick another department — your own pays the rest.' USING ERRCODE = '22023';
    END IF;
    IF v_company IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = v_company AND coalesce(c.is_active, true)) THEN
      RAISE EXCEPTION 'Pick a company from the list.' USING ERRCODE = '22023';
    END IF;
    v_amount := CASE WHEN btrim(coalesce(v_share ->> 'amount', '')) ~ '^\d{1,12}(\.\d{1,2})?$' THEN (v_share ->> 'amount')::numeric
                     WHEN btrim(coalesce(v_share ->> 'amount', '')) = '' THEN 0 END;
    IF v_amount IS NULL THEN
      RAISE EXCEPTION 'A share''s amount is a number of ringgit, like 108.30.' USING ERRCODE = '22023';
    END IF;
    v_sort := v_sort + 1;
    INSERT INTO public.payment_request_shares (request_id, party, department_id, company_id, amount, sort)
    VALUES (v_id, v_party, v_dept, v_company, round(v_amount, 2), v_sort);
  END LOOP;
  SELECT coalesce(sum(s.amount), 0) INTO v_shared FROM public.payment_request_shares s WHERE s.request_id = v_id;

  -- The files: new ones filed, removed ones let go (their upload stays the uploader's to remove).
  IF jsonb_typeof(coalesce(p_data -> 'removeFiles', '[]'::jsonb)) = 'array' THEN
    DELETE FROM public.payment_request_files f
     WHERE f.request_id = v_id
       AND f.id::text IN (SELECT jsonb_array_elements_text(p_data -> 'removeFiles'));
  END IF;
  PERFORM public.payment_request_file_in(v_id, p_data -> 'files');

  UPDATE public.payment_requests
     SET kind = v_kind, pay_to_salary = v_salary, payee_name = v_name, payee_staff_id = v_pay_staff, payee_bank = v_bank, payee_account_no = v_account,
         total = v_total, description = v_desc, status = 'draft', updated_at = now()
   WHERE id = v_id;

  IF coalesce(p_submit, false) THEN
    IF NOT EXISTS (SELECT 1 FROM public.payment_request_items i WHERE i.request_id = v_id) THEN
      RAISE EXCEPTION 'Add what it was for — at least one item.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.payment_request_items i WHERE i.request_id = v_id AND (btrim(i.description) = '' OR i.amount <= 0)) THEN
      RAISE EXCEPTION 'Every item needs its words and an amount.' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.payment_request_files f WHERE f.request_id = v_id) THEN
      RAISE EXCEPTION 'Add the receipts or invoices.' USING ERRCODE = '22023';
    END IF;
    IF v_kind = 'claim' AND v_name IS NULL THEN
      RAISE EXCEPTION 'Add who to pay.' USING ERRCODE = '22023';
    END IF;
    IF v_kind = 'claim' AND v_salary AND (v_pay_bank IS NULL OR v_pay_acct IS NULL) THEN
      IF v_pay_staff = m.staff_id THEN
        RAISE EXCEPTION 'HR has no salary account for you — pay into a different account this time, or ask HR to add yours.' USING ERRCODE = '22023';
      END IF;
      RAISE EXCEPTION 'HR has no salary account for % — pay into another account, or ask HR to add it.', v_name USING ERRCODE = '22023';
    END IF;
    IF v_kind = 'direct_pay' AND v_name IS NULL THEN
      RAISE EXCEPTION 'Add the supplier''s name.' USING ERRCODE = '22023';
    END IF;
    IF NOT (v_kind = 'claim' AND v_salary) AND (v_bank IS NULL OR v_account IS NULL) THEN
      RAISE EXCEPTION 'Add the bank and the account number to pay into.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.payment_request_shares s WHERE s.request_id = v_id
                AND (s.amount <= 0 OR (s.party = 'department' AND s.department_id IS NULL) OR (s.party = 'company' AND s.company_id IS NULL))) THEN
      RAISE EXCEPTION 'Each share needs who it is and an amount.' USING ERRCODE = '22023';
    END IF;
    IF v_shared >= v_total THEN
      RAISE EXCEPTION 'The shares come to RM % — your department pays the rest, so they must be less than the RM % total.',
        to_char(v_shared, 'FM999,999,990.00'), to_char(v_total, 'FM999,999,990.00') USING ERRCODE = '22023';
    END IF;
    SELECT count(*) INTO v_n FROM public.payment_requests x
     WHERE x.requester_id = v_me AND x.submitted_at > now() - interval '1 day';
    IF v_n >= 30 THEN
      RAISE EXCEPTION 'That is 30 requests in a day — send the rest tomorrow.' USING ERRCODE = '54000';
    END IF;
    -- Ticked, not an approver themself, and somebody else in the department approves: they approve it first.
    v_reviewers := ARRAY(SELECT x.user_id FROM public.payment_request_reviewers(v_me, m.department_id) x);
    UPDATE public.payment_requests
       SET request_no = coalesce(request_no, public.payment_request_next_no(now())),
           -- The salary account of whoever is paid, kept as it is today.
           payee_bank = CASE WHEN v_kind = 'claim' AND v_salary THEN v_pay_bank ELSE payee_bank END,
           payee_account_no = CASE WHEN v_kind = 'claim' AND v_salary THEN v_pay_acct ELSE payee_account_no END,
           department_id = m.department_id,
           status = CASE WHEN cardinality(v_reviewers) > 0 THEN 'pending_approval' ELSE 'with_finance' END,
           needs_approval = cardinality(v_reviewers) > 0,
           submitted_at = now(),
           rejected_stage = NULL, rejected_by = NULL, rejected_at = NULL, reject_reason = NULL,
           approved_by = NULL, approved_at = NULL,
           updated_at = now()
     WHERE id = v_id;
    IF cardinality(v_reviewers) > 0 THEN
      PERFORM public.payment_request_tell(v_reviewers,
        CASE WHEN v_kind = 'claim' THEN 'A claim to approve — ' ELSE 'A payment to approve — ' END || m.staff_name,
        'RM ' || to_char(v_total, 'FM999,999,990.00') || ' · ' || coalesce(nullif(v_desc, ''), 'no description'), v_id);
    END IF;
  ELSIF r.id IS NOT NULL AND r.status = 'rejected' THEN
    -- Fixed but not sent yet: still the reason on it until it goes again.
    UPDATE public.payment_requests SET status = 'rejected' WHERE id = v_id;
  END IF;

  RETURN public.payment_requests_json(ARRAY[v_id]) -> 0;
END
$fn$;
