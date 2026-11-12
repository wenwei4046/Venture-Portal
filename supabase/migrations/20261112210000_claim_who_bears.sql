-- Who bears a claim (2026-11-12, the user: "如果他们提交claim, 可以不可以选全部department 包括venture 自己承担 还有就是也可能
-- 是提交时给percentage" → "principal user 提交时会选hr department … 不是以bill 的方式，而是代交"; the sample
-- mockups/claim-who-bears-mockup.html, picked "1A + 2A"):
--   · anyone sending a request may put it, whole or in part, on any other department with a pool — Director's too —
--     or on Venture itself (Venture Office, the venture_pool);
--   · a department's share is BORNE by that pool: the PV's line for it is charged there, no invoice, no Bill back?;
--     a company's share stays as it was (Finance's Bill back? in the Create PV window);
--   · a share is typed in ringgit or as a percent of the total (all of a request's shares one way); a percent's ringgit
--     is worked out here, truncated to the sen, the remainder the sender's department's;
--   · the shares may now come to the whole total ("Another department bears all of it").
-- No department share was ever saved before this (checked 2026-11-12), so none was billed the old way.

ALTER TABLE public.payment_request_shares
  ADD COLUMN IF NOT EXISTS percent numeric(5,2) CHECK (percent IS NULL OR (percent >= 0 AND percent <= 100));

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
                                         'companyId', s.company_id, 'companyName', co.name, 'amount', s.amount, 'percent', s.percent,
                                         'venture', coalesce(sd.is_internal, false),
                                         'pool', CASE WHEN s.party <> 'department' THEN NULL WHEN coalesce(sd.is_internal, false) THEN 'venture_pool'
                                                      WHEN sd.segment_key IS NOT NULL THEN 'dept_pool_' || sd.segment_key END,
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
    -- Who may bear a share: every other department with a pool of its own, Director's too, and Venture itself.
    'departments', coalesce((SELECT jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'venture', coalesce(d.is_internal, false))
                                              ORDER BY d.created_at, d.name)
                               FROM public.departments d
                              WHERE d.id <> m.department_id
                                AND (coalesce(d.is_internal, false) OR d.segment_key IS NOT NULL)), '[]'::jsonb),
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
  v_pct       numeric;
  v_pcts      integer := 0;
  v_pct_sum   numeric := 0;
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

  -- Who bears it: the department's pool, less what a share puts on another department (or Venture) — charged to its
  -- pool, no invoice — or on a company (billed back if Finance says so). A share is typed as ringgit, or as a percent of
  -- the total (its ringgit worked out here, down to the sen; the remainder stays the department's).
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
         SELECT 1 FROM public.departments d WHERE d.id = v_dept AND (coalesce(d.is_internal, false) OR d.segment_key IS NOT NULL))) THEN
      RAISE EXCEPTION 'Pick another department — your own bears the rest.' USING ERRCODE = '22023';
    END IF;
    IF v_company IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = v_company AND coalesce(c.is_active, true)) THEN
      RAISE EXCEPTION 'Pick a company from the list.' USING ERRCODE = '22023';
    END IF;
    v_amount := CASE WHEN btrim(coalesce(v_share ->> 'amount', '')) ~ '^\d{1,12}(\.\d{1,2})?$' THEN (v_share ->> 'amount')::numeric
                     WHEN btrim(coalesce(v_share ->> 'amount', '')) = '' THEN 0 END;
    IF v_amount IS NULL THEN
      RAISE EXCEPTION 'A share''s amount is a number of ringgit, like 108.30.' USING ERRCODE = '22023';
    END IF;
    v_pct := CASE WHEN btrim(coalesce(v_share ->> 'percent', '')) = '' THEN NULL
                  WHEN btrim(v_share ->> 'percent') ~ '^\d{1,3}(\.\d{1,2})?$' THEN btrim(v_share ->> 'percent')::numeric
                  ELSE -1 END;
    IF v_pct IS NOT NULL AND (v_pct < 0 OR v_pct > 100) THEN
      RAISE EXCEPTION 'A share''s percent is a number up to 100, like 33.33.' USING ERRCODE = '22023';
    END IF;
    IF v_pct IS NOT NULL THEN
      v_amount := trunc(v_total * v_pct / 100, 2);
      v_pcts := v_pcts + 1;
      v_pct_sum := v_pct_sum + v_pct;
    END IF;
    v_sort := v_sort + 1;
    INSERT INTO public.payment_request_shares (request_id, party, department_id, company_id, amount, percent, sort)
    VALUES (v_id, v_party, v_dept, v_company, round(v_amount, 2), v_pct, v_sort);
  END LOOP;
  IF v_pcts > 0 AND v_pcts < v_sort THEN
    RAISE EXCEPTION 'Split by amounts or by percents — not both.' USING ERRCODE = '22023';
  END IF;
  IF v_pct_sum > 100 THEN
    RAISE EXCEPTION 'The shares come to % percent — more than 100.', to_char(v_pct_sum, 'FM990.##') USING ERRCODE = '22023';
  END IF;
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
    IF v_shared > v_total THEN
      RAISE EXCEPTION 'The shares come to RM % — more than the RM % total.',
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

CREATE OR REPLACE FUNCTION public.payment_requests_attach_pv(p_ids uuid[], p_pv uuid, p_bill jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_n      integer;
  v_pv     record;
  s        record;
  v_cat    text;
  v_today  date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_period date;
  v_no     text;
  v_inv    uuid;
  v_out    jsonb := '[]'::jsonb;
  v_bill   jsonb := CASE WHEN jsonb_typeof(p_bill) = 'array' THEN p_bill ELSE '[]'::jsonb END;
  v_open   uuid[];
  v_todo   uuid[];
BEGIN
  PERFORM public.tab_write_guard(ARRAY['/payments/requests'], ARRAY['treasury.create']);
  IF auth.uid() IS NULL OR NOT public.has_any_action(ARRAY['treasury.create']) THEN
    RAISE EXCEPTION 'payment_requests_attach_pv: needs Treasury · Create' USING ERRCODE = '42501';
  END IF;
  v_period := date_trunc('month', v_today)::date;
  SELECT v.id, v.status, v.direction, v.voucher_no INTO v_pv FROM public.payment_vouchers v WHERE v.id = p_pv;
  IF NOT FOUND OR v_pv.direction <> 'debit' OR v_pv.status NOT IN ('draft', 'pending_approval') THEN
    RAISE EXCEPTION 'That voucher cannot take requests.';
  END IF;
  PERFORM 1 FROM public.payment_requests r WHERE r.id = ANY (p_ids) FOR UPDATE;
  SELECT count(*) INTO v_n FROM public.payment_requests r WHERE r.id = ANY (p_ids) AND r.status = 'with_finance' AND r.pv_id IS NULL;
  IF p_ids IS NULL OR v_n = 0 OR v_n <> cardinality(ARRAY(SELECT DISTINCT unnest(p_ids))) THEN
    RAISE EXCEPTION 'A request is no longer waiting for Finance — reload and try again.';
  END IF;
  -- A department's share (Venture's too) is borne by its pool on the voucher's own lines — nothing to bill back.
  -- Each company split's Bill back?, answered in the Create PV window — every split but one whose invoice is drafted already (a
  -- voided one counts as none) — and the invoices the Yes ones draft, asked whole before anything is written.
  v_open := ARRAY(SELECT x.id FROM public.payment_request_shares x LEFT JOIN public.invoices i ON i.id = x.invoice_id
                   WHERE x.request_id = ANY (p_ids) AND x.party = 'company' AND (x.invoice_id IS NULL OR i.status = 'voided'));
  IF EXISTS (SELECT 1 FROM unnest(v_open) o(id)
              WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_bill) b
                                 WHERE b.value ->> 'share' = o.id::text AND jsonb_typeof(b.value -> 'billBack') = 'boolean')) THEN
    RAISE EXCEPTION 'Answer Bill back? for each split.';
  END IF;
  v_todo := ARRAY(SELECT o.id FROM unnest(v_open) o(id)
                   WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(v_bill) b
                                  WHERE b.value ->> 'share' = o.id::text AND (b.value ->> 'billBack')::boolean));
  IF cardinality(v_todo) > 0 THEN
    IF NOT coalesce(public.has_any_action(ARRAY['billing.create']), false) THEN
      RAISE EXCEPTION 'Billing back needs Invoice · Create — answer No, or ask for it.' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT 1 FROM public.period_locks l WHERE l.period_month = v_period AND l.is_locked) THEN
      RAISE EXCEPTION 'Period % is closed — its invoices cannot be drafted. Contact Principal to reopen.', to_char(v_period, 'Mon YYYY');
    END IF;
    FOR s IN SELECT x.id FROM public.payment_request_shares x WHERE x.id = ANY (v_todo) LOOP
      v_cat := (SELECT nullif(btrim(b.value ->> 'category'), '') FROM jsonb_array_elements(v_bill) b WHERE b.value ->> 'share' = s.id::text LIMIT 1);
      IF v_cat IS NULL OR NOT EXISTS (SELECT 1 FROM public.payment_voucher_sources pvs WHERE pvs.voucher_id = p_pv AND pvs.account_code = v_cat) THEN
        RAISE EXCEPTION 'A bill back has no category from the voucher''s lines — pick each line''s category.';
      END IF;
    END LOOP;
  END IF;

  -- The answers, kept on the splits.
  UPDATE public.payment_request_shares x
     SET bill_back = (SELECT (b.value ->> 'billBack')::boolean FROM jsonb_array_elements(v_bill) b WHERE b.value ->> 'share' = x.id::text LIMIT 1),
         decided_by = auth.uid(), decided_at = now(), invoice_id = NULL
   WHERE x.id = ANY (v_open);
  UPDATE public.payment_requests SET status = 'in_pv', pv_id = p_pv, updated_at = now() WHERE id = ANY (p_ids);

  FOR s IN SELECT x.id, x.party, x.company_id, x.department_id, x.amount, r.request_no, r.requester_name, r.description,
                  d.billing_mode_key
             FROM public.payment_request_shares x
             JOIN public.payment_requests r ON r.id = x.request_id
             JOIN public.departments d ON d.id = r.department_id
            WHERE x.id = ANY (v_todo)
            ORDER BY r.submitted_at, r.id, x.sort, x.id LOOP
    v_cat := (SELECT nullif(btrim(b.value ->> 'category'), '') FROM jsonb_array_elements(v_bill) b WHERE b.value ->> 'share' = s.id::text LIMIT 1);
    v_no := public.mint_invoice_no(v_period);
    INSERT INTO public.invoices (invoice_no, period_month, billing_mode, category_code, base_amount, total_amount, status,
                                 invoice_date, due_date, description, reference_no, created_by, billable_to_type, company_id,
                                 billable_to_department_id)
    VALUES (v_no, v_period, s.billing_mode_key::public.billing_mode, NULL, s.amount, s.amount, 'draft',
            v_today, NULL, left('Bill back · ' || s.request_no || ' · ' || s.requester_name, 500), s.request_no, auth.uid(),
            (CASE WHEN s.party = 'company' THEN 'subsidiary' ELSE 'dept_pool' END)::public.billable_to_kind,
            CASE WHEN s.party = 'company' THEN s.company_id END, CASE WHEN s.party = 'department' THEN s.department_id END)
    RETURNING id INTO v_inv;
    INSERT INTO public.invoice_lines (invoice_id, line_no, description, amount, category_code)
    VALUES (v_inv, 1, left(coalesce(nullif(s.description, ''), 'Share of ' || s.request_no), 500), s.amount, v_cat);
    UPDATE public.payment_request_shares SET invoice_id = v_inv WHERE id = s.id;
    v_out := v_out || jsonb_build_object('share', s.id, 'invoiceId', v_inv, 'invoiceNo', v_no);
  END LOOP;

  INSERT INTO public.access_log (user_id, resource_type, resource_id, action, metadata)
  SELECT auth.uid(), 'payment_request', r.id::text, 'in_pv', jsonb_build_object('request', r.request_no, 'voucher', p_pv, 'voucher_no', v_pv.voucher_no)
    FROM public.payment_requests r WHERE r.id = ANY (p_ids);
  RETURN jsonb_build_object('invoices', v_out);
END
$fn$;

-- The guard the scan reads (tab-write-guards.test.ts), checked against the body above.
CREATE OR REPLACE FUNCTION pg_temp.tab_guard(p_sig text, p_pages text, p_wants text[])
RETURNS void
LANGUAGE plpgsql AS $g$
DECLARE
  v_line text := format('PERFORM public.tab_write_guard(%s, ARRAY[%s]);', p_pages,
    array_to_string(ARRAY(SELECT quote_literal(w) FROM unnest(p_wants) w), ', '));
BEGIN
  IF position(v_line IN (SELECT prosrc FROM pg_proc WHERE oid = p_sig::regprocedure)) = 0 THEN
    RAISE EXCEPTION '% does not ask its page: % is not in its body', p_sig, v_line;
  END IF;
END
$g$;

SELECT pg_temp.tab_guard('public.payment_requests_attach_pv(uuid[], uuid, jsonb)',
  $$ARRAY['/payments/requests']$$, ARRAY['treasury.create']);
