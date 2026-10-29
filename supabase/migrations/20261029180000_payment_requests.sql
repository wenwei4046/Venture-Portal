-- ============================================================================
-- 20261029180000_payment_requests.sql
-- Staff payment requests (2026-10-29, PR ② of docs/module-spec-payment-requests.md — the claim process the user
-- settled with the boss; "可以，开始做 PR ②"). Every department's staff send Finance their own claims and direct
-- payments from the Claim page; Finance works them on Payments › Payment request and makes the voucher.
-- ============================================================================
--
-- A request: what it is (a claim — "I paid, pay me back" — or a direct pay to a supplier), what it was for (items, each
-- its words and amount), the receipts or invoices (files in the private bucket below), who is paid (a claim: the
-- salary account on the person's People record, or another account this time; a direct pay: the supplier's name,
-- bank and account, typed — no reading of invoices for now, the user: "不要开key 先 … 暂时就让他们填"), and which
-- pool pays (the department's, or split with other departments and companies, the amounts typed by the requester).
--
-- Its way: draft → with Finance (Submit; PR ③ adds a department head's approval before Finance for whoever is ticked)
-- → in a PV (Finance's Create PV, the voucher made as any other) → paid with it. Finance may reject it back to the
-- requester with a reason (rejected → fixed → submitted again); the requester may cancel it while no PV has it. A
-- voided voucher puts its requests back with Finance; a deleted draft voucher too.
--
-- Tables (RLS on, NO policy, no client grants — every read and write is one of the functions below, as IT requests'
-- and Hiring's are):
--   payment_requests        one request: PRQ-YYMM-NNNN from its first submit; the requester (the login, their People
--                           record, their name and department as they were); kind, payee, the total of its items, the
--                           description (its items' words), where it stands, why it was rejected, the PV that pays it.
--   payment_request_items   what it was for, a line each.
--   payment_request_shares  a split: a company's or another department's part, and Finance's Bill back? answer (Yes
--                           drafts the invoice when the PV is made; its id kept here).
--   payment_request_files   its receipts and invoices.
-- The salary account is SNAPSHOT onto the request when it is sent (as payroll_voucher_lines snapshot theirs): the
-- account Finance pays is the one the requester saw. Read whole by the requester and by a reader with the Bank tick
-- (`sees_sensitive('bank')`), else as its last four.
--
-- Who may:
--   claims.create (own)  send one's own and follow them — the staff templates hold it already (Staff · Basic,
--                        Marketing, HR · Payroll, Finance · Maker, Director, Executive office, Ultimate, Full access).
--   Treasury             read every submitted request and its files (Finance and the Principal);
--     · Create           make the PV, each split's Bill back? answered with it (the page's box asked too —
--                        tab_write_guard); a Yes split's draft invoice asks Invoice · Create (billing.create) as well,
--                        before anything is written;
--     · Void / Approve   reject one back to its requester (as Return to HR).
-- The Claim page is each view's own row (the HR view's and Finance's tabs below, beside the Department view's and
-- Marketing's): one's own requests, whichever view one works in.
--
-- The bucket `payment-request-files` (R2 from the start, private, 25 MB a file): the BROWSER uploads into the uploader's
-- own folder `<uid>/…`; a request files only an object that is there, in the caller's own folder, not filed before. A
-- file is read (a short signed link, made at the tap) by its uploader, by whoever sent its request, and by Treasury
-- once the request is sent; an upload nobody filed, by its uploader alone, who may also remove it.
-- PGlite: tests/member-sql/validate-payment-requests.mjs.

-- ── The bucket ──────────────────────────────────────────────────────────────

INSERT INTO public.file_buckets (id, public, file_size_limit, allowed_mime_types, backend)
VALUES ('payment-request-files', false, 26214400, NULL, 'r2')
ON CONFLICT (id) DO NOTHING;

-- ── The tables ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.payment_requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_no       text UNIQUE,
  requester_id     uuid NOT NULL REFERENCES public.users(id),
  staff_id         uuid REFERENCES public.hr_staff_costs(id) ON DELETE SET NULL,
  requester_name   text NOT NULL CHECK (length(btrim(requester_name)) BETWEEN 1 AND 200),
  department_id    uuid NOT NULL REFERENCES public.departments(id),
  kind             text NOT NULL CHECK (kind IN ('claim', 'direct_pay')),
  pay_to_salary    boolean NOT NULL DEFAULT true,
  payee_name       text CHECK (payee_name IS NULL OR length(payee_name) <= 200),
  payee_bank       text CHECK (payee_bank IS NULL OR length(payee_bank) <= 120),
  payee_account_no text CHECK (payee_account_no IS NULL OR length(payee_account_no) <= 40),
  description      text NOT NULL DEFAULT '' CHECK (length(description) <= 200),
  total            numeric(15,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  needs_approval   boolean NOT NULL DEFAULT false,
  status           text NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'pending_approval', 'with_finance', 'rejected', 'in_pv', 'paid', 'cancelled')),
  rejected_stage   text CHECK (rejected_stage IS NULL OR rejected_stage IN ('approval', 'finance')),
  rejected_by      uuid REFERENCES public.users(id),
  rejected_at      timestamptz,
  reject_reason    text CHECK (reject_reason IS NULL OR length(reject_reason) <= 500),
  approved_by      uuid REFERENCES public.users(id),
  approved_at      timestamptz,
  submitted_at     timestamptz,
  pv_id            uuid REFERENCES public.payment_vouchers(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payment_requests_requester ON public.payment_requests (requester_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_requests_status ON public.payment_requests (status, submitted_at);
CREATE INDEX IF NOT EXISTS payment_requests_pv ON public.payment_requests (pv_id) WHERE pv_id IS NOT NULL;

-- A draft keeps what was typed; Submit asks for it whole (each item its words and an amount).
CREATE TABLE IF NOT EXISTS public.payment_request_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  uuid NOT NULL REFERENCES public.payment_requests(id) ON DELETE CASCADE,
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 200),
  amount      numeric(15,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  sort        integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS payment_request_items_request ON public.payment_request_items (request_id, sort);

CREATE TABLE IF NOT EXISTS public.payment_request_shares (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id    uuid NOT NULL REFERENCES public.payment_requests(id) ON DELETE CASCADE,
  party         text NOT NULL CHECK (party IN ('department', 'company')),
  department_id uuid REFERENCES public.departments(id),
  company_id    uuid REFERENCES public.companies(id),
  amount        numeric(15,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  bill_back     boolean,
  decided_by    uuid REFERENCES public.users(id),
  decided_at    timestamptz,
  invoice_id    uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  sort          integer NOT NULL DEFAULT 0,
  CHECK ((party = 'department' AND company_id IS NULL) OR (party = 'company' AND department_id IS NULL))
);
CREATE INDEX IF NOT EXISTS payment_request_shares_request ON public.payment_request_shares (request_id, sort);

CREATE TABLE IF NOT EXISTS public.payment_request_files (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id   uuid NOT NULL REFERENCES public.payment_requests(id) ON DELETE CASCADE,
  kind         text NOT NULL DEFAULT 'receipt' CHECK (kind IN ('receipt', 'supplier_invoice')),
  path         text NOT NULL UNIQUE,
  name         text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  content_type text,
  size         bigint,
  uploaded_by  uuid NOT NULL REFERENCES public.users(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payment_request_files_request ON public.payment_request_files (request_id);

ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_request_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_request_files ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_requests, public.payment_request_items, public.payment_request_shares,
  public.payment_request_files FROM anon, authenticated;

SELECT public.audit_register('payment_requests', 'Payment requests', 'Payments', '{treasury}', 'all',
  p_keys => '{request_no}', p_labels => '{requester_name,description}', p_ignore => '{updated_at}',
  p_bank => '{payee_bank,payee_account_no}');
SELECT public.audit_register('payment_request_shares', 'Payment request shares', 'Payments', '{treasury}', 'all');
SELECT public.audit_register('payment_request_items', 'Payment request items', 'Payments', '{}', 'none',
  p_reason => 'Rewritten with its request by the request''s own function; the request''s line records the change');
SELECT public.audit_register('payment_request_files', 'Payment request files', 'Payments', '{}', 'none',
  p_reason => 'A file is filed once with its request and never changed — a record already');

-- ── Helpers the functions share (nobody's to call) ──────────────────────────

-- The caller as a request keeps them: their active People record, its department, and the salary account HR holds.
CREATE OR REPLACE FUNCTION public.payment_request_me(p_user uuid,
  OUT staff_id uuid, OUT staff_name text, OUT department_id uuid, OUT department_name text, OUT segment_key text,
  OUT billing_mode text, OUT bank_name text, OUT bank_account_no text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  SELECT s.id, coalesce(nullif(btrim(s.employee_name), ''), 'Somebody'), d.id, d.name, d.segment_key, d.billing_mode_key,
         nullif(btrim(s.bank_name), ''), nullif(regexp_replace(coalesce(s.bank_account_no, ''), '[[:space:]-]', '', 'g'), '')
    INTO staff_id, staff_name, department_id, department_name, segment_key, billing_mode, bank_name, bank_account_no
    FROM public.hr_staff_costs s
    JOIN public.departments d ON d.id = s.department_id
   WHERE s.user_id = p_user AND s.status = 'active'
   ORDER BY s.created_at, s.id
   LIMIT 1;
END
$fn$;

-- An account as a reader sees it: whole, or its last four.
CREATE OR REPLACE FUNCTION public.payment_request_account(p_account text, p_whole boolean)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $fn$
  SELECT CASE WHEN nullif(btrim(coalesce(p_account, '')), '') IS NULL THEN NULL
              WHEN p_whole THEN p_account
              ELSE '•••• ' || right(regexp_replace(p_account, '[^0-9A-Za-z]', '', 'g'), 4) END;
$fn$;

-- The next number in the month the request is sent, PRQ-2610-0001 — taken once, at its first submit.
CREATE OR REPLACE FUNCTION public.payment_request_next_no(p_at timestamptz)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_prefix text := 'PRQ-' || to_char(p_at AT TIME ZONE 'Asia/Kuala_Lumpur', 'YYMM') || '-';
  v_n      integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('payment-request-no:' || v_prefix, 0));
  SELECT coalesce(max(substring(r.request_no FROM length(v_prefix) + 1)::integer), 0) + 1
    INTO v_n
    FROM public.payment_requests r
   WHERE r.request_no LIKE v_prefix || '%' AND substring(r.request_no FROM length(v_prefix) + 1) ~ '^\d+$';
  RETURN v_prefix || lpad(v_n::text, 4, '0');
END
$fn$;

-- Files the caller uploaded, as a request may take them: each in the caller's own folder of the bucket, there, not
-- filed before, named once. At most 10 at a time. Asked before anything is written.
CREATE OR REPLACE FUNCTION public.payment_request_files_check(p_files jsonb)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me   uuid := auth.uid();
  v_f    jsonb;
  v_path text;
BEGIN
  IF p_files IS NULL OR jsonb_typeof(p_files) <> 'array' OR jsonb_array_length(p_files) = 0 THEN
    RETURN;
  END IF;
  IF jsonb_array_length(p_files) > 10 THEN
    RAISE EXCEPTION 'Attach up to 10 files at a time.' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(DISTINCT f.value ->> 'path') FROM jsonb_array_elements(p_files) f) < jsonb_array_length(p_files) THEN
    RAISE EXCEPTION 'The same file is there twice — remove one.' USING ERRCODE = '22023';
  END IF;
  FOR v_f IN SELECT value FROM jsonb_array_elements(p_files) LOOP
    v_path := v_f ->> 'path';
    IF v_me IS NULL OR v_path IS NULL OR split_part(v_path, '/', 1) <> v_me::text OR strpos(v_path, '..') > 0
       OR NOT EXISTS (SELECT 1 FROM public.file_objects o WHERE o.bucket_id = 'payment-request-files' AND o.name = v_path) THEN
      RAISE EXCEPTION 'A file did not finish uploading — add it again.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.payment_request_files f WHERE f.path = v_path) THEN
      RAISE EXCEPTION 'That file is on a request already — add it again.' USING ERRCODE = '22023';
    END IF;
  END LOOP;
END
$fn$;

-- …filed on a request. Answers how many.
CREATE OR REPLACE FUNCTION public.payment_request_file_in(p_request uuid, p_files jsonb)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me   uuid := auth.uid();
  v_f    jsonb;
  v_path text;
  v_size bigint;
  v_type text;
  v_n    integer := 0;
BEGIN
  PERFORM public.payment_request_files_check(p_files);
  IF p_files IS NULL OR jsonb_typeof(p_files) <> 'array' THEN
    RETURN 0;
  END IF;
  FOR v_f IN SELECT value FROM jsonb_array_elements(p_files) LOOP
    v_path := v_f ->> 'path';
    -- What the bucket says it is, before what the browser said.
    SELECT CASE WHEN (o.metadata ->> 'size') ~ '^[0-9]{1,15}$' THEN (o.metadata ->> 'size')::bigint END, nullif(o.metadata ->> 'mimetype', '')
      INTO v_size, v_type
      FROM public.file_objects o WHERE o.bucket_id = 'payment-request-files' AND o.name = v_path;
    INSERT INTO public.payment_request_files (request_id, kind, path, name, content_type, size, uploaded_by)
    VALUES (p_request,
            CASE WHEN v_f ->> 'kind' = 'supplier_invoice' THEN 'supplier_invoice' ELSE 'receipt' END,
            v_path,
            left(coalesce(nullif(btrim(v_f ->> 'name'), ''), 'file'), 200),
            left(coalesce(v_type, nullif(btrim(v_f ->> 'contentType'), '')), 120),
            coalesce(v_size, CASE WHEN (v_f ->> 'size') ~ '^[0-9]{1,15}$' THEN (v_f ->> 'size')::bigint END),
            v_me);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END
$fn$;

-- Requests as the app reads them, in the order given. An account reads whole for its requester and for a reader with
-- the Bank tick, else as its last four.
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
             'payToSalary', r.pay_to_salary, 'payeeName', r.payee_name, 'payeeBank', r.payee_bank,
             'payeeAccount', public.payment_request_account(r.payee_account_no, r.requester_id = v_me OR v_bank),
             'description', r.description, 'total', r.total,
             'submittedAt', r.submitted_at, 'createdAt', r.created_at, 'updatedAt', r.updated_at,
             'rejectedStage', r.rejected_stage, 'rejectedAt', r.rejected_at, 'rejectReason', r.reject_reason,
             'rejectedByName', (SELECT coalesce(nullif(btrim(u.name), ''), 'Finance') FROM public.users u WHERE u.id = r.rejected_by),
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

REVOKE ALL ON FUNCTION public.payment_request_me(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.payment_request_account(text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.payment_request_next_no(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.payment_request_files_check(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.payment_request_file_in(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.payment_requests_json(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.payment_request_me(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.payment_request_account(text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.payment_request_next_no(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.payment_request_files_check(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.payment_request_file_in(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.payment_requests_json(uuid[]) TO service_role;

-- ── The requester ───────────────────────────────────────────────────────────

-- What the New request window offers: who sends it, their department and its pool, the salary account HR holds (its
-- bank and last four), and the departments and companies a share may name.
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
                             FROM public.companies c WHERE coalesce(c.is_active, true)), '[]'::jsonb));
END
$fn$;

CREATE OR REPLACE FUNCTION public.my_payment_requests()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_me AND u.is_active)
     OR NOT coalesce(public.has_any_action(ARRAY['claims.view:own']), false) THEN
    RAISE EXCEPTION 'Claim is not open to your account.' USING ERRCODE = '42501';
  END IF;
  RETURN public.payment_requests_json(ARRAY(
    SELECT r.id FROM public.payment_requests r WHERE r.requester_id = v_me ORDER BY r.created_at DESC, r.id LIMIT 100));
END
$fn$;

-- Save one's own draft (or a rejected one being fixed); with p_submit, check it whole and send it to Finance.
--   p_data: { kind: 'claim' | 'direct_pay',
--             payTo:    { salary: true }  or  { salary: false, bank, accountNo }     (a claim)
--             supplier: { name, bank, accountNo }                                     (a direct pay)
--             items:  [{ description, amount }],
--             shares: [{ party: 'department' | 'company', departmentId | companyId, amount }],
--             files:  [{ path, name, contentType, size }]   (new uploads to file),
--             removeFiles: [fileId] }
CREATE OR REPLACE FUNCTION public.payment_request_save(p_request uuid, p_data jsonb, p_submit boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me       uuid := auth.uid();
  m          record;
  r          public.payment_requests%ROWTYPE;
  v_id       uuid := p_request;
  v_kind     text := p_data ->> 'kind';
  v_salary   boolean;
  v_name     text;
  v_bank     text;
  v_account  text;
  v_item     jsonb;
  v_share    jsonb;
  v_amount   numeric;
  v_sort     integer;
  v_party    text;
  v_dept     uuid;
  v_company  uuid;
  v_total    numeric(15,2);
  v_shared   numeric(15,2);
  v_desc     text;
  v_n        integer;
BEGIN
  IF v_me IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_me AND u.is_active)
     OR NOT coalesce(public.has_any_action(ARRAY['claims.create:own']), false) THEN
    RAISE EXCEPTION 'Claim is not open to your account.' USING ERRCODE = '42501';
  END IF;
  IF p_data IS NULL OR jsonb_typeof(p_data) <> 'object' THEN
    RAISE EXCEPTION 'Nothing to save.' USING ERRCODE = '22023';
  END IF;
  IF v_kind IS NULL OR v_kind NOT IN ('claim', 'direct_pay') THEN
    RAISE EXCEPTION 'Pick what it is: I paid — pay me back, or pay a supplier directly.' USING ERRCODE = '22023';
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
    v_name := m.staff_name;
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
     SET kind = v_kind, pay_to_salary = v_salary, payee_name = v_name, payee_bank = v_bank, payee_account_no = v_account,
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
    IF v_kind = 'claim' AND v_salary AND (m.bank_name IS NULL OR m.bank_account_no IS NULL) THEN
      RAISE EXCEPTION 'HR has no salary account for you — pay into a different account this time, or ask HR to add yours.' USING ERRCODE = '22023';
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
    UPDATE public.payment_requests
       SET request_no = coalesce(request_no, public.payment_request_next_no(now())),
           -- The salary account the requester saw, kept as it is today.
           payee_bank = CASE WHEN v_kind = 'claim' AND v_salary THEN m.bank_name ELSE payee_bank END,
           payee_account_no = CASE WHEN v_kind = 'claim' AND v_salary THEN m.bank_account_no ELSE payee_account_no END,
           department_id = m.department_id,
           status = 'with_finance', submitted_at = now(),
           rejected_stage = NULL, rejected_by = NULL, rejected_at = NULL, reject_reason = NULL,
           updated_at = now()
     WHERE id = v_id;
  ELSIF r.id IS NOT NULL AND r.status = 'rejected' THEN
    -- Fixed but not sent yet: still Finance's reason on it until it goes again.
    UPDATE public.payment_requests SET status = 'rejected' WHERE id = v_id;
  END IF;

  RETURN public.payment_requests_json(ARRAY[v_id]) -> 0;
END
$fn$;

CREATE OR REPLACE FUNCTION public.payment_request_cancel(p_request uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me uuid := auth.uid();
  r    public.payment_requests%ROWTYPE;
BEGIN
  IF v_me IS NULL OR NOT coalesce(public.has_any_action(ARRAY['claims.create:own']), false) THEN
    RAISE EXCEPTION 'Claim is not open to your account.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM public.payment_requests WHERE id = p_request AND requester_id = v_me FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found.' USING ERRCODE = '42501';
  END IF;
  IF r.status NOT IN ('draft', 'pending_approval', 'with_finance', 'rejected') OR r.pv_id IS NOT NULL THEN
    RAISE EXCEPTION 'Finance has made its payment voucher — ask Finance to void it first.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.payment_requests SET status = 'cancelled', updated_at = now() WHERE id = p_request;
  RETURN public.payment_requests_json(ARRAY[p_request]) -> 0;
END
$fn$;

-- The path to sign for a file's reader: whoever sent its request; Treasury once it is sent.
CREATE OR REPLACE FUNCTION public.payment_request_file(p_file uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me uuid := auth.uid();
  f    record;
BEGIN
  SELECT pf.path, pf.name, pf.content_type, r.requester_id, r.status INTO f
    FROM public.payment_request_files pf JOIN public.payment_requests r ON r.id = pf.request_id
   WHERE pf.id = p_file;
  IF NOT FOUND OR v_me IS NULL
     OR NOT (f.requester_id = v_me OR (f.status NOT IN ('draft', 'cancelled') AND coalesce(public.has_perm('treasury'), false))) THEN
    RAISE EXCEPTION 'File not found.' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object('path', f.path, 'name', f.name, 'contentType', f.content_type);
END
$fn$;

-- ── Finance ─────────────────────────────────────────────────────────────────

-- Every request sent to Finance and not yet paid: with Finance, or in a voucher waiting for the Principal.
CREATE OR REPLACE FUNCTION public.payment_requests_for_finance()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT coalesce(public.has_perm('treasury'), false) THEN
    RAISE EXCEPTION 'Payment requests are Finance''s.' USING ERRCODE = '42501';
  END IF;
  RETURN public.payment_requests_json(ARRAY(
    SELECT r.id FROM public.payment_requests r
     WHERE r.status IN ('with_finance', 'in_pv')
     ORDER BY r.submitted_at, r.id LIMIT 500));
END
$fn$;

CREATE OR REPLACE FUNCTION public.payment_request_reject(p_request uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  r        public.payment_requests%ROWTYPE;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
  PERFORM public.tab_write_guard(ARRAY['/payments/requests'], ARRAY['treasury.void', 'treasury.approve']);
  IF auth.uid() IS NULL OR NOT public.has_any_action(ARRAY['treasury.void', 'treasury.approve']) THEN
    RAISE EXCEPTION 'payment_request_reject: needs Treasury · Void or Approve' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL THEN RAISE EXCEPTION 'Say why — the requester reads it to fix the request.'; END IF;
  SELECT * INTO r FROM public.payment_requests WHERE id = p_request FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF r.status <> 'with_finance' OR r.pv_id IS NOT NULL THEN
    RAISE EXCEPTION 'This request is not waiting for Finance';
  END IF;
  UPDATE public.payment_requests
     SET status = 'rejected', rejected_stage = 'finance', rejected_by = auth.uid(), rejected_at = now(),
         reject_reason = left(v_reason, 500), updated_at = now()
   WHERE id = p_request;
  -- A fixed request is answered afresh — but a share whose invoice is drafted keeps it (a voided one counts as none).
  UPDATE public.payment_request_shares x SET bill_back = NULL, decided_by = NULL, decided_at = NULL, invoice_id = NULL
   WHERE x.request_id = p_request
     AND (x.invoice_id IS NULL OR EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = x.invoice_id AND i.status = 'voided'));
  INSERT INTO public.access_log (user_id, resource_type, resource_id, action, metadata)
  VALUES (auth.uid(), 'payment_request', p_request::text, 'reject',
          jsonb_build_object('request', r.request_no, 'amount', r.total, 'reason', v_reason));
END
$fn$;

-- What a Create PV needs, asked before the voucher is made: requests waiting for Finance, one payee into one account;
-- their files to carry onto the voucher. (Bill back? is answered in the Create PV window, with the voucher — the user:
-- "我开pv 时就要确定是不是要开单了".)
CREATE OR REPLACE FUNCTION public.payment_requests_for_pv(p_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_n integer;
BEGIN
  PERFORM public.tab_write_guard(ARRAY['/payments/requests'], ARRAY['treasury.create']);
  IF auth.uid() IS NULL OR NOT public.has_any_action(ARRAY['treasury.create']) THEN
    RAISE EXCEPTION 'payment_requests_for_pv: needs Treasury · Create' USING ERRCODE = '42501';
  END IF;
  IF p_ids IS NULL OR cardinality(p_ids) = 0 OR cardinality(p_ids) > 20 THEN
    RAISE EXCEPTION 'Pick 1 to 20 requests for one voucher.';
  END IF;
  SELECT count(*) INTO v_n FROM public.payment_requests r WHERE r.id = ANY (p_ids) AND r.status = 'with_finance' AND r.pv_id IS NULL;
  IF v_n <> cardinality(ARRAY(SELECT DISTINCT unnest(p_ids))) THEN
    RAISE EXCEPTION 'A request is no longer waiting for Finance — reload and try again.';
  END IF;
  IF (SELECT count(DISTINCT (lower(btrim(coalesce(r.payee_name, ''))), coalesce(r.payee_account_no, '')))
        FROM public.payment_requests r WHERE r.id = ANY (p_ids)) > 1 THEN
    RAISE EXCEPTION 'One voucher pays one payee into one account — these requests pay different ones.';
  END IF;
  RETURN jsonb_build_object(
    'requests', public.payment_requests_json(ARRAY(
                  SELECT r.id FROM public.payment_requests r WHERE r.id = ANY (p_ids) ORDER BY r.submitted_at, r.id)),
    'files', coalesce((SELECT jsonb_agg(jsonb_build_object('id', f.id, 'path', f.path, 'name', f.name,
                                       'contentType', f.content_type, 'size', f.size) ORDER BY r.submitted_at, f.created_at, f.id)
                         FROM public.payment_request_files f JOIN public.payment_requests r ON r.id = f.request_id
                        WHERE f.request_id = ANY (p_ids)), '[]'::jsonb));
END
$fn$;

-- The voucher made: its requests are in it now, each split's Bill back? answered in the Create PV window is kept (the
-- user: "我开pv 时就要确定是不是要开单了"), and each Yes split's invoice is drafted — to the company, or to the department
-- — in Invoice, a DRAFT until Finance checks and issues it ("但都是draft 的状态？然后我检查了没有问题才开？"). Billed in the
-- requester's department's mode, so its pool has the money back when the invoice is settled; one line, booked to the
-- account the request's lines carry on this voucher (`p_bill`: [{ share, billBack, category }] — the invoice credits
-- it back, the house's contra-expense, as Notion's third to Cr 9087). One step: refused, nothing is tied and nothing
-- drafted (Create PV then voids the draft voucher it made). Answers the invoices drafted.
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
  -- Each split's Bill back?, answered in the Create PV window — every split but one whose invoice is drafted already (a
  -- voided one counts as none) — and the invoices the Yes ones draft, asked whole before anything is written.
  v_open := ARRAY(SELECT x.id FROM public.payment_request_shares x LEFT JOIN public.invoices i ON i.id = x.invoice_id
                   WHERE x.request_id = ANY (p_ids) AND (x.invoice_id IS NULL OR i.status = 'voided'));
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

-- The guards the scan reads (tab-write-guards.test.ts), checked against the bodies above.
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

SELECT pg_temp.tab_guard('public.payment_request_reject(uuid, text)',
  $$ARRAY['/payments/requests']$$, ARRAY['treasury.void', 'treasury.approve']);
SELECT pg_temp.tab_guard('public.payment_requests_for_pv(uuid[])',
  $$ARRAY['/payments/requests']$$, ARRAY['treasury.create']);
SELECT pg_temp.tab_guard('public.payment_requests_attach_pv(uuid[], uuid, jsonb)',
  $$ARRAY['/payments/requests']$$, ARRAY['treasury.create']);

-- ── A request follows its voucher ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.payment_requests_follow_their_voucher()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.payment_requests SET status = 'with_finance', pv_id = NULL, updated_at = now()
     WHERE pv_id = OLD.id AND status = 'in_pv';
    RETURN OLD;
  END IF;
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF NEW.status = 'paid' THEN
    UPDATE public.payment_requests SET status = 'paid', updated_at = now() WHERE pv_id = NEW.id AND status = 'in_pv';
  ELSIF NEW.status = 'voided' THEN
    UPDATE public.payment_requests SET status = 'with_finance', pv_id = NULL, updated_at = now()
     WHERE pv_id = NEW.id AND status IN ('in_pv', 'paid');
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS payment_requests_follow_voucher ON public.payment_vouchers;
CREATE TRIGGER payment_requests_follow_voucher
  AFTER UPDATE OF status ON public.payment_vouchers
  FOR EACH ROW EXECUTE FUNCTION public.payment_requests_follow_their_voucher();
DROP TRIGGER IF EXISTS payment_requests_follow_voucher_gone ON public.payment_vouchers;
CREATE TRIGGER payment_requests_follow_voucher_gone
  BEFORE DELETE ON public.payment_vouchers
  FOR EACH ROW EXECUTE FUNCTION public.payment_requests_follow_their_voucher();

REVOKE ALL ON FUNCTION public.payment_requests_follow_their_voucher() FROM PUBLIC, anon, authenticated;

-- ── The bucket's policies ───────────────────────────────────────────────────
-- They ask these two as the READER, so `authenticated` may call them (they answer for auth.uid() only).

CREATE OR REPLACE FUNCTION public.payment_request_object_readable(p_name text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL OR p_name IS NULL THEN
    RETURN false;
  END IF;
  -- One's own upload, filed or not.
  IF split_part(p_name, '/', 1) = v_me::text THEN
    RETURN true;
  END IF;
  -- A file of a request one sent.
  IF EXISTS (SELECT 1 FROM public.payment_request_files f JOIN public.payment_requests r ON r.id = f.request_id
              WHERE f.path = p_name AND r.requester_id = v_me) THEN
    RETURN true;
  END IF;
  -- Treasury: every filed file of a request that was sent.
  RETURN EXISTS (SELECT 1 FROM public.payment_request_files f JOIN public.payment_requests r ON r.id = f.request_id
                  WHERE f.path = p_name AND r.status NOT IN ('draft', 'cancelled'))
     AND coalesce(public.has_perm('treasury'), false);
END
$fn$;

CREATE OR REPLACE FUNCTION public.payment_request_object_removable(p_name text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN auth.uid() IS NOT NULL AND p_name IS NOT NULL AND split_part(p_name, '/', 1) = auth.uid()::text
     AND NOT EXISTS (SELECT 1 FROM public.payment_request_files f WHERE f.path = p_name);
END
$fn$;

REVOKE ALL ON FUNCTION public.payment_request_object_readable(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.payment_request_object_removable(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.payment_request_object_readable(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.payment_request_object_removable(text) TO authenticated, service_role;

DROP POLICY IF EXISTS "payment requests: in" ON public.file_objects;
CREATE POLICY "payment requests: in" ON public.file_objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'payment-request-files' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
DROP POLICY IF EXISTS "payment requests: read" ON public.file_objects;
CREATE POLICY "payment requests: read" ON public.file_objects FOR SELECT TO authenticated
  USING (bucket_id = 'payment-request-files' AND public.payment_request_object_readable(name));
DROP POLICY IF EXISTS "payment requests: out" ON public.file_objects;
CREATE POLICY "payment requests: out" ON public.file_objects FOR DELETE TO authenticated
  USING (bucket_id = 'payment-request-files' AND public.payment_request_object_removable(name));

-- ── Who may call them ───────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.payment_request_context() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_payment_requests() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.payment_request_save(uuid, jsonb, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.payment_request_cancel(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.payment_request_file(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.payment_requests_for_finance() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.payment_request_reject(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.payment_requests_for_pv(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.payment_requests_attach_pv(uuid[], uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.payment_request_context() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_payment_requests() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.payment_request_save(uuid, jsonb, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.payment_request_cancel(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.payment_request_file(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.payment_requests_for_finance() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.payment_request_reject(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.payment_requests_for_pv(uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.payment_requests_attach_pv(uuid[], uuid, jsonb) TO authenticated, service_role;

-- ── Claim in every view ─────────────────────────────────────────────────────
-- The staff send theirs from their own view's sidebar (the mockup: Claim above Meeting Rooms in each): the Department
-- view's and Marketing's rows are there already; the HR view gets its own tab (Admin, above the rooms) and Finance's
-- view its own (the account menu's Account) — one's own claims at Own, as the other two (lib/permission-tabs.ts).
INSERT INTO public.permission_page_tabs (page, tab_id) VALUES
  ('/claims', 'hr.my_claims'),
  ('/claims', 'fin.my_claims')
ON CONFLICT DO NOTHING;

INSERT INTO public.permission_tab_cells (tab_id, action, cell) VALUES
  ('hr.my_claims', 'view', 'claims.view'),
  ('hr.my_claims', 'create', 'claims.create'),
  ('hr.my_claims', 'edit', 'claims.edit'),
  ('fin.my_claims', 'view', 'claims.view'),
  ('fin.my_claims', 'create', 'claims.create'),
  ('fin.my_claims', 'edit', 'claims.edit')
ON CONFLICT DO NOTHING;

-- HR · Payroll keeps its ticks stored: its own claims are ticked in the HR view too (the cells it holds already —
-- Claims · View and Create at Own; nothing more). Finance's templates work theirs out from their cells.
INSERT INTO public.permission_template_tabs (template_id, tab_id, action)
SELECT t.id, 'hr.my_claims', a
  FROM public.permission_templates t, unnest(ARRAY['view', 'create']) a
 WHERE t.key = 'hr'
   AND EXISTS (SELECT 1 FROM public.permission_template_tabs x WHERE x.template_id = t.id)
ON CONFLICT (template_id, tab_id, action) DO NOTHING;

-- An editor left open on it saves over nothing it did not see.
UPDATE public.permission_templates SET version = version + 1, updated_at = now()
 WHERE key = 'hr';

NOTIFY pgrst, 'reload schema';
