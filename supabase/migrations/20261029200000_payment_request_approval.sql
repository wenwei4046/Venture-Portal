-- ============================================================================
-- 20261029200000_payment_request_approval.sql
-- A department's approval before Finance (2026-10-29, PR ③ of docs/module-spec-payment-requests.md — "可以，开始做
-- PR ③"). The user's rows: "A tick on the person's (or title's) permissions, By management approve: ticked → the
-- department's Claim & approve holders approve first; unticked → straight to Finance … One approver is enough; an
-- approver may reject." The mockup's ②: the Marketing Manager's Claim & approve.
-- ============================================================================
--
-- By management approve is not a permission — it opens nothing, it routes one's own requests — so it is no cell:
-- its own two tables, as the sensitive fields' are (permission_template_flags, user_permission_flags; one flag
-- today, `claims_review`), the person's own tick over their title's template's (the person wins).
--
-- Claim & approve is a tab in the HR, Finance, Marketing and Department views (claims_approve, reach Dept): View
-- opens Claims · View, Approve opens Claims · Approve, at the holder's department. Who holds it in a department is
-- read from the cells the boxes stand for (the person's own cell, else their title's template's) —
-- current_actions() answers for the caller only; every write still asks the caller's own.
--
-- Submit routes a request: its sender ticked, not a holder themself, and somebody else in the department holds it
-- → Waiting for approval; else to Finance as before. An approver sends it to Finance or back to its sender (one
-- reason for all); its sender fixes it and sends it again. Their department's requests and files are theirs to read.
--
-- Notices (app_notifications, kind `claims`, about a `payment_request`): sent for approval → the department's
-- approvers; approved, sent back, rejected by Finance, paid → the sender. A notice never stops the work it tells of.
-- The Marketing view's bell lists them beside its own, and its sidebar counts what waits for the approver.
--
-- Seeded as §1 has it today: Marketing · Staff ticks By management approve; Marketing · Manager holds Claim &
-- approve. PGlite: tests/member-sql/validate-payment-request-approval.mjs.

-- ── By management approve: the tick ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.permission_template_flags (
  template_id uuid NOT NULL REFERENCES public.permission_templates(id) ON DELETE CASCADE,
  flag        text NOT NULL CHECK (flag IN ('claims_review')),
  PRIMARY KEY (template_id, flag)
);
CREATE TABLE IF NOT EXISTS public.user_permission_flags (
  user_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  flag       text NOT NULL CHECK (flag IN ('claims_review')),
  -- true = ticked although the template is not; false = unticked although it is.
  granted    boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, flag)
);
ALTER TABLE public.permission_template_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permission_flags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS permission_template_flags_read ON public.permission_template_flags;
CREATE POLICY permission_template_flags_read ON public.permission_template_flags FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS user_permission_flags_read ON public.user_permission_flags;
-- Read as a person's boxes are (user_permission_tabs_read); written only through permission_user_flags_set().
CREATE POLICY user_permission_flags_read ON public.user_permission_flags FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT public.has_perm('team')) OR (SELECT public.has_perm('permissions_manage')));
REVOKE ALL ON public.permission_template_flags, public.user_permission_flags FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.permission_template_flags, public.user_permission_flags TO authenticated;

INSERT INTO public.permission_table_reads (table_name, actions) VALUES
  ('user_permission_flags', ARRAY['accounts.manage', 'accounts.view', 'team.view:own'])
ON CONFLICT (table_name) DO UPDATE SET actions = EXCLUDED.actions;
SELECT public.permission_reads_guard('user_permission_flags');

SELECT public.audit_register('permission_template_flags', 'Template ticks', 'People', '{permissions_manage}', 'all',
  p_keys => '{template_id,flag}', p_labels => '{template_id,flag}');
SELECT public.audit_register('user_permission_flags', 'Personal ticks', 'People', '{permissions_manage}', 'all',
  p_keys => '{user_id,flag}', p_labels => '{user_id,flag}');

-- A template's ticks, saved after its boxes (the same window's Save): the version its boxes left it at; bumped only
-- when a tick moved. Answers the version.
CREATE OR REPLACE FUNCTION public.permission_template_flags_set(p_template uuid, p_version integer, p_flags text[])
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_version integer;
  v_flags   text[] := ARRAY(SELECT DISTINCT f FROM unnest(coalesce(p_flags, '{}'::text[])) f ORDER BY f);
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_perm('permissions_manage') THEN
    RAISE EXCEPTION 'Only whoever manages permissions sets a template''s ticks' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_flags) f WHERE f IS NULL OR f NOT IN ('claims_review')) THEN
    RAISE EXCEPTION 'Not a tick a template takes';
  END IF;
  SELECT t.version INTO v_version FROM public.permission_templates t WHERE t.id = p_template FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That template is gone. Reload the page.';
  END IF;
  IF v_version IS DISTINCT FROM p_version THEN
    RAISE EXCEPTION 'Somebody saved this template since you opened it. Reload the page and try again.';
  END IF;
  IF v_flags IS DISTINCT FROM ARRAY(SELECT f.flag FROM public.permission_template_flags f WHERE f.template_id = p_template ORDER BY f.flag) THEN
    DELETE FROM public.permission_template_flags f WHERE f.template_id = p_template AND NOT (f.flag = ANY (v_flags));
    INSERT INTO public.permission_template_flags (template_id, flag)
    SELECT p_template, f FROM unnest(v_flags) f
    ON CONFLICT (template_id, flag) DO NOTHING;
    UPDATE public.permission_templates SET version = version + 1, updated_at = now() WHERE id = p_template
    RETURNING version INTO v_version;
  END IF;
  RETURN v_version;
END
$fn$;

-- The person's whole list: what is not in it goes (back to the template), what is, is kept.
CREATE OR REPLACE FUNCTION public.permission_user_flags_set(p_user uuid, p_flags jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_bad text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_perm('permissions_manage') THEN
    RAISE EXCEPTION 'Only whoever manages permissions sets a person''s own permissions' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user) THEN
    RAISE EXCEPTION 'That account is gone';
  END IF;
  IF jsonb_typeof(p_flags) IS DISTINCT FROM 'array' OR jsonb_array_length(p_flags) > 5 THEN
    RAISE EXCEPTION 'The ticks must be sent as a list';
  END IF;
  SELECT coalesce(f.flag, '?') INTO v_bad
    FROM jsonb_to_recordset(p_flags) AS f(flag text, granted boolean)
   WHERE f.flag IS NULL OR f.flag NOT IN ('claims_review') OR f.granted IS NULL
   LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '% is not a tick a person takes', v_bad;
  END IF;
  SELECT f.flag INTO v_bad FROM jsonb_to_recordset(p_flags) AS f(flag text, granted boolean)
   GROUP BY f.flag HAVING count(*) > 1 LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '% is listed twice', v_bad;
  END IF;
  DELETE FROM public.user_permission_flags u
   WHERE u.user_id = p_user
     AND NOT EXISTS (SELECT 1 FROM jsonb_to_recordset(p_flags) AS f(flag text, granted boolean) WHERE f.flag = u.flag);
  INSERT INTO public.user_permission_flags AS u (user_id, flag, granted, updated_by)
  SELECT p_user, f.flag, f.granted, auth.uid() FROM jsonb_to_recordset(p_flags) AS f(flag text, granted boolean)
  ON CONFLICT (user_id, flag) DO UPDATE
    SET granted = EXCLUDED.granted, updated_at = now(), updated_by = auth.uid()
    WHERE u.granted IS DISTINCT FROM EXCLUDED.granted;
END
$fn$;

-- Is a person's request approved in their department first? Their own tick, else their title's template's.
CREATE OR REPLACE FUNCTION public.payment_request_review_of(p_user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT coalesce(
    (SELECT f.granted FROM public.user_permission_flags f WHERE f.user_id = p_user AND f.flag = 'claims_review'),
    EXISTS (SELECT 1 FROM public.permission_template_flags tf
             WHERE tf.flag = 'claims_review'
               AND tf.template_id = (SELECT t.template_id FROM public.hr_staff_costs s JOIN public.titles t ON t.id = s.title_id
                                      WHERE s.user_id = p_user ORDER BY s.created_at, s.id LIMIT 1)));
$fn$;

-- ── Claim & approve: the tab, and who holds it ─────────────────────────────

INSERT INTO public.permission_page_tabs (page, tab_id) VALUES
  ('/claims', 'hr.claims_approve'),
  ('/claims', 'fin.claims_approve'),
  ('/claims', 'mkt.claims_approve'),
  ('/claims', 'dept.claims_approve')
ON CONFLICT DO NOTHING;

INSERT INTO public.permission_tab_cells (tab_id, action, cell) VALUES
  ('hr.claims_approve', 'view', 'claims.view'),
  ('hr.claims_approve', 'approve', 'claims.approve'),
  ('fin.claims_approve', 'view', 'claims.view'),
  ('fin.claims_approve', 'approve', 'claims.approve'),
  ('mkt.claims_approve', 'view', 'claims.view'),
  ('mkt.claims_approve', 'approve', 'claims.approve'),
  ('dept.claims_approve', 'view', 'claims.view'),
  ('dept.claims_approve', 'approve', 'claims.approve')
ON CONFLICT DO NOTHING;

-- A department's Claim & approve holders: active logins on an active People record there whose Claims · Approve is
-- at Dept — their own cell when they have one (a removed one counts as none), else their title's template's.
CREATE OR REPLACE FUNCTION public.payment_request_approvers(p_department uuid)
RETURNS TABLE (user_id uuid, name text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT DISTINCT ON (u.id) u.id, coalesce(nullif(btrim(s.employee_name), ''), nullif(btrim(u.name), ''), 'Somebody')
    FROM public.hr_staff_costs s
    JOIN public.users u ON u.id = s.user_id AND u.is_active
    LEFT JOIN public.titles t ON t.id = s.title_id
   WHERE s.department_id = p_department AND s.status = 'active'
     AND coalesce(
           (SELECT coalesce(c.scope, '') = 'dept' FROM public.user_permission_cells c
             WHERE c.user_id = u.id AND c.function_key = 'claims' AND c.action = 'approve' LIMIT 1),
           EXISTS (SELECT 1 FROM public.permission_template_grants g
                    WHERE g.template_id = t.template_id AND g.function_key = 'claims' AND g.action = 'approve' AND g.scope = 'dept'))
   ORDER BY u.id, s.created_at;
$fn$;

-- Who approves a person's request first: their department's holders but themself — none when they are not ticked,
-- or hold it themself (the mockup: "Yours go straight to Finance").
CREATE OR REPLACE FUNCTION public.payment_request_reviewers(p_user uuid, p_department uuid)
RETURNS TABLE (user_id uuid, name text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT a.user_id, a.name FROM public.payment_request_approvers(p_department) a
   WHERE a.user_id <> p_user
     AND public.payment_request_review_of(p_user)
     AND NOT EXISTS (SELECT 1 FROM public.payment_request_approvers(p_department) me WHERE me.user_id = p_user);
$fn$;

-- ── Notices ────────────────────────────────────────────────────────────────
-- The notices' kinds as production lists them today, with the claims' added (read, not retyped: a kind another
-- migration added since is kept).

DO $notices$
DECLARE
  v_kinds text[];
  v_refs  text[];
BEGIN
  SELECT ARRAY(SELECT DISTINCT m[1] FROM regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''', 'g') AS m ORDER BY 1)
    INTO v_kinds FROM pg_constraint c
   WHERE c.conrelid = 'public.app_notifications'::regclass AND c.conname = 'app_notifications_kind_check';
  -- Written back as production writes it (ARRAY['a'::text, …]), so the next reader finds every kind again.
  IF cardinality(v_kinds) > 0 AND NOT ('claims' = ANY (v_kinds)) THEN
    ALTER TABLE public.app_notifications DROP CONSTRAINT app_notifications_kind_check;
    EXECUTE format('ALTER TABLE public.app_notifications ADD CONSTRAINT app_notifications_kind_check CHECK (kind = ANY (ARRAY[%s]))',
                   (SELECT string_agg(quote_literal(k) || '::text', ', ' ORDER BY k) FROM unnest(v_kinds || ARRAY['claims']) k));
  END IF;
  SELECT ARRAY(SELECT DISTINCT m[1] FROM regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''', 'g') AS m ORDER BY 1)
    INTO v_refs FROM pg_constraint c
   WHERE c.conrelid = 'public.app_notifications'::regclass AND c.conname = 'app_notifications_ref_kind_check';
  IF cardinality(v_refs) > 0 AND NOT ('payment_request' = ANY (v_refs)) THEN
    ALTER TABLE public.app_notifications DROP CONSTRAINT app_notifications_ref_kind_check;
    EXECUTE format('ALTER TABLE public.app_notifications ADD CONSTRAINT app_notifications_ref_kind_check CHECK (ref_kind = ANY (ARRAY[%s]))',
                   (SELECT string_agg(quote_literal(k) || '::text', ', ' ORDER BY k) FROM unnest(v_refs || ARRAY['payment_request']) k));
  END IF;
END
$notices$;

-- A request's notice to the people named (never the one who did it — notify_people). A notice never stops the work
-- it tells of: one that cannot be written only warns.
CREATE OR REPLACE FUNCTION public.payment_request_tell(p_users uuid[], p_title text, p_body text, p_request uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.notify_people(p_users, 'claims', left(p_title, 200), left(coalesce(p_body, ''), 400), 'payment_request', p_request::text);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'payment request notice not written: %', SQLERRM;
END
$fn$;

-- ── The requests as the app reads them: who approved, who approves ─────────

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

-- The New request window, and who approves first (null: it goes straight to Finance).
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
                             FROM public.companies c WHERE coalesce(c.is_active, true)), '[]'::jsonb),
    'reviewers', (SELECT jsonb_agg(x.name ORDER BY x.name) FROM public.payment_request_reviewers(v_me, m.department_id) x));
END
$fn$;

-- ── Submit routes it: approved in the department first, or straight to Finance ──

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
    -- Ticked, not an approver themself, and somebody else in the department approves: they approve it first.
    v_reviewers := ARRAY(SELECT x.user_id FROM public.payment_request_reviewers(v_me, m.department_id) x);
    UPDATE public.payment_requests
       SET request_no = coalesce(request_no, public.payment_request_next_no(now())),
           -- The salary account the requester saw, kept as it is today.
           payee_bank = CASE WHEN v_kind = 'claim' AND v_salary THEN m.bank_name ELSE payee_bank END,
           payee_account_no = CASE WHEN v_kind = 'claim' AND v_salary THEN m.bank_account_no ELSE payee_account_no END,
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

-- ── Claim & approve: their department's requests, and their writes ─────────

-- Every sent request of the approver's department (theirs among them), its holders, and whether they may approve.
CREATE OR REPLACE FUNCTION public.payment_requests_for_approval()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me uuid := auth.uid();
  m    record;
BEGIN
  IF v_me IS NULL OR NOT coalesce(public.has_any_action(ARRAY['claims.view:dept']), false) THEN
    RAISE EXCEPTION 'Claim & approve is not open to your account.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO m FROM public.payment_request_me(v_me);
  IF m.department_id IS NULL THEN
    RAISE EXCEPTION 'Your login is not on a People record yet — ask HR to link it.' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object(
    'departmentName', m.department_name,
    'canApprove', coalesce(public.has_any_action(ARRAY['claims.approve:dept']), false),
    'approvers', coalesce((SELECT jsonb_agg(jsonb_build_object('id', a.user_id, 'name', a.name) ORDER BY a.name)
                             FROM public.payment_request_approvers(m.department_id) a), '[]'::jsonb),
    'requests', public.payment_requests_json(ARRAY(
                  SELECT r.id FROM public.payment_requests r
                   WHERE r.department_id = m.department_id AND r.status NOT IN ('draft', 'cancelled')
                   ORDER BY r.submitted_at DESC NULLS LAST, r.id LIMIT 500)));
END
$fn$;

-- What waits for the caller's approval — a sidebar's number (0 for anybody else).
CREATE OR REPLACE FUNCTION public.payment_requests_waiting_count()
RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me   uuid := auth.uid();
  v_dept uuid;
BEGIN
  IF v_me IS NULL OR NOT coalesce(public.has_any_action(ARRAY['claims.approve:dept']), false) THEN
    RETURN 0;
  END IF;
  SELECT m.department_id INTO v_dept FROM public.payment_request_me(v_me) m;
  RETURN (SELECT count(*)::integer FROM public.payment_requests r
           WHERE r.department_id = v_dept AND r.status = 'pending_approval' AND r.requester_id <> v_me);
END
$fn$;

-- Approve — send to Finance: requests of the approver's department waiting for approval, none their own. Claims ·
-- Approve at Dept is asked, not the page's box: every box for that cell is on /claims, so closing them closes the
-- cell (tab-guards-scan's narrows()).
CREATE OR REPLACE FUNCTION public.payment_request_approve(p_ids uuid[])
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me   uuid := auth.uid();
  v_dept uuid;
  v_name text;
  v_n    integer;
  x      record;
BEGIN
  IF v_me IS NULL OR NOT coalesce(public.has_any_action(ARRAY['claims.approve:dept']), false) THEN
    RAISE EXCEPTION 'payment_request_approve: needs Claim & approve' USING ERRCODE = '42501';
  END IF;
  IF p_ids IS NULL OR cardinality(p_ids) = 0 OR cardinality(p_ids) > 50 THEN
    RAISE EXCEPTION 'Pick 1 to 50 requests.';
  END IF;
  SELECT m.department_id, m.staff_name INTO v_dept, v_name FROM public.payment_request_me(v_me) m;
  PERFORM 1 FROM public.payment_requests r WHERE r.id = ANY (p_ids) FOR UPDATE;
  SELECT count(*) INTO v_n FROM public.payment_requests r
   WHERE r.id = ANY (p_ids) AND r.status = 'pending_approval' AND r.department_id = v_dept AND r.requester_id <> v_me;
  IF v_dept IS NULL OR v_n <> cardinality(ARRAY(SELECT DISTINCT unnest(p_ids))) THEN
    RAISE EXCEPTION 'A request is no longer waiting for your approval — reload and try again.';
  END IF;
  UPDATE public.payment_requests r
     SET status = 'with_finance', approved_by = v_me, approved_at = now(), updated_at = now()
   WHERE r.id = ANY (p_ids);
  FOR x IN SELECT r.id, r.requester_id, r.request_no, r.total FROM public.payment_requests r WHERE r.id = ANY (p_ids) LOOP
    PERFORM public.payment_request_tell(ARRAY[x.requester_id], 'Approved by ' || coalesce(v_name, 'your manager') || ' — with Finance now',
      coalesce(x.request_no, 'Your request') || ' · RM ' || to_char(x.total, 'FM999,999,990.00'), x.id);
  END LOOP;
  INSERT INTO public.access_log (user_id, resource_type, resource_id, action, metadata)
  SELECT v_me, 'payment_request', r.id::text, 'approve', jsonb_build_object('request', r.request_no, 'amount', r.total)
    FROM public.payment_requests r WHERE r.id = ANY (p_ids);
  RETURN v_n;
END
$fn$;

-- Reject: back to their senders with one reason for all, to fix and send again.
CREATE OR REPLACE FUNCTION public.payment_request_send_back(p_ids uuid[], p_reason text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me     uuid := auth.uid();
  v_dept   uuid;
  v_name   text;
  v_n      integer;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  x        record;
BEGIN
  IF v_me IS NULL OR NOT coalesce(public.has_any_action(ARRAY['claims.approve:dept']), false) THEN
    RAISE EXCEPTION 'payment_request_send_back: needs Claim & approve' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Say what to fix — they read it to send the request again.';
  END IF;
  IF p_ids IS NULL OR cardinality(p_ids) = 0 OR cardinality(p_ids) > 50 THEN
    RAISE EXCEPTION 'Pick 1 to 50 requests.';
  END IF;
  SELECT m.department_id, m.staff_name INTO v_dept, v_name FROM public.payment_request_me(v_me) m;
  PERFORM 1 FROM public.payment_requests r WHERE r.id = ANY (p_ids) FOR UPDATE;
  SELECT count(*) INTO v_n FROM public.payment_requests r
   WHERE r.id = ANY (p_ids) AND r.status = 'pending_approval' AND r.department_id = v_dept AND r.requester_id <> v_me;
  IF v_dept IS NULL OR v_n <> cardinality(ARRAY(SELECT DISTINCT unnest(p_ids))) THEN
    RAISE EXCEPTION 'A request is no longer waiting for your approval — reload and try again.';
  END IF;
  UPDATE public.payment_requests r
     SET status = 'rejected', rejected_stage = 'approval', rejected_by = v_me, rejected_at = now(),
         reject_reason = left(v_reason, 500), approved_by = NULL, approved_at = NULL, updated_at = now()
   WHERE r.id = ANY (p_ids);
  FOR x IN SELECT r.id, r.requester_id, r.request_no FROM public.payment_requests r WHERE r.id = ANY (p_ids) LOOP
    PERFORM public.payment_request_tell(ARRAY[x.requester_id], 'Sent back by ' || coalesce(v_name, 'your manager') || ' — fix it and send it again',
      coalesce(x.request_no, 'Your request') || ': ' || v_reason, x.id);
  END LOOP;
  INSERT INTO public.access_log (user_id, resource_type, resource_id, action, metadata)
  SELECT v_me, 'payment_request', r.id::text, 'send_back', jsonb_build_object('request', r.request_no, 'amount', r.total, 'reason', v_reason)
    FROM public.payment_requests r WHERE r.id = ANY (p_ids);
  RETURN v_n;
END
$fn$;

-- ── Their files: the department's Claim & approve reads them too ──────────

CREATE OR REPLACE FUNCTION public.payment_request_file(p_file uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me uuid := auth.uid();
  f    record;
BEGIN
  SELECT pf.path, pf.name, pf.content_type, r.requester_id, r.status, r.department_id INTO f
    FROM public.payment_request_files pf JOIN public.payment_requests r ON r.id = pf.request_id
   WHERE pf.id = p_file;
  IF NOT FOUND OR v_me IS NULL
     OR NOT (f.requester_id = v_me
             OR (f.status NOT IN ('draft', 'cancelled') AND coalesce(public.has_perm('treasury'), false))
             OR (f.status NOT IN ('draft', 'cancelled') AND coalesce(public.has_any_action(ARRAY['claims.view:dept']), false)
                 AND f.department_id = (SELECT m.department_id FROM public.payment_request_me(v_me) m))) THEN
    RAISE EXCEPTION 'File not found.' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object('path', f.path, 'name', f.name, 'contentType', f.content_type);
END
$fn$;

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
  -- The department's Claim & approve: every filed file of a request of their department that was sent.
  IF coalesce(public.has_any_action(ARRAY['claims.view:dept']), false)
     AND EXISTS (SELECT 1 FROM public.payment_request_files f JOIN public.payment_requests r ON r.id = f.request_id
                  WHERE f.path = p_name AND r.status NOT IN ('draft', 'cancelled')
                    AND r.department_id = (SELECT m.department_id FROM public.payment_request_me(v_me) m)) THEN
    RETURN true;
  END IF;
  -- Treasury: every filed file of a request that was sent.
  RETURN EXISTS (SELECT 1 FROM public.payment_request_files f JOIN public.payment_requests r ON r.id = f.request_id
                  WHERE f.path = p_name AND r.status NOT IN ('draft', 'cancelled'))
     AND coalesce(public.has_perm('treasury'), false);
END
$fn$;

-- ── Finance's reject and the paid voucher tell the sender ──────────────────

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
  PERFORM public.payment_request_tell(ARRAY[r.requester_id], 'Rejected by Finance — fix it and send it again',
    coalesce(r.request_no, 'Your request') || ': ' || v_reason, p_request);
END
$fn$;

CREATE OR REPLACE FUNCTION public.payment_requests_follow_their_voucher()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  x record;
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
    FOR x IN SELECT r.id, r.requester_id, r.request_no FROM public.payment_requests r WHERE r.pv_id = NEW.id AND r.status = 'in_pv' LOOP
      PERFORM public.payment_request_tell(ARRAY[x.requester_id], 'Paid — ' || coalesce(NEW.voucher_no, 'its voucher'),
        coalesce(x.request_no, 'Your request') || ' was paid with ' || coalesce(NEW.voucher_no, 'its voucher') || '.', x.id);
    END LOOP;
    UPDATE public.payment_requests SET status = 'paid', updated_at = now() WHERE pv_id = NEW.id AND status = 'in_pv';
  ELSIF NEW.status = 'voided' THEN
    UPDATE public.payment_requests SET status = 'with_finance', pv_id = NULL, updated_at = now()
     WHERE pv_id = NEW.id AND status IN ('in_pv', 'paid');
  END IF;
  RETURN NEW;
END
$fn$;

-- ── Marketing's bell lists them, and its sidebar counts what waits ────────
-- Production's statements, whitespace-blind, each exactly once (as 20261028120000).

CREATE OR REPLACE FUNCTION pg_temp.swap_check(p_sig regprocedure, p_old text, p_new text)
RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_src   text := (SELECT prosrc FROM pg_proc WHERE oid = p_sig);
  v_pat   text;
  v_found text;
  v_n     integer;
BEGIN
  IF strpos(v_src, p_new) > 0 THEN
    RETURN;  -- already swapped
  END IF;
  -- The old statement, every run of whitespace matching any run.
  v_pat := regexp_replace(regexp_replace(p_old, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'), '\s+', '\\s+', 'g');
  SELECT count(*) INTO v_n FROM regexp_matches(v_src, v_pat, 'g');
  IF v_n <> 1 THEN
    RAISE EXCEPTION '%: its statement is there % times, not once — production changed since this migration was written', p_sig, v_n;
  END IF;
  v_found := (regexp_match(v_src, '(' || v_pat || ')'))[1];
  EXECUTE replace(pg_get_functiondef(p_sig), v_found, p_new);
END
$fn$;

SELECT pg_temp.swap_check('public.mkt_notices(integer)',
  $q$'read', n.read_at IS NOT NULL, 'data', n.data)$q$,
  $q$'read', n.read_at IS NOT NULL, 'data', n.data, 'refKind', n.ref_kind)$q$);
SELECT pg_temp.swap_check('public.mkt_notices(integer)',
  $q$WHERE x.user_id = auth.uid() AND x.kind = 'marketing'$q$,
  $q$WHERE x.user_id = auth.uid() AND x.kind IN ('marketing', 'claims')$q$);
SELECT pg_temp.swap_check('public.mkt_shell()',
  $q$ELSE 0 END),
    'notices', (SELECT count(*) FROM public.app_notifications n
                 WHERE n.user_id = auth.uid() AND n.kind = 'marketing' AND n.read_at IS NULL));$q$,
  $q$ELSE 0 END,
      'claims', public.payment_requests_waiting_count()),
    'notices', (SELECT count(*) FROM public.app_notifications n
                 WHERE n.user_id = auth.uid() AND n.kind IN ('marketing', 'claims') AND n.read_at IS NULL));$q$);

-- ── Who may call them ──────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.payment_request_review_of(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.payment_request_approvers(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.payment_request_reviewers(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.payment_request_tell(uuid[], text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.payment_request_review_of(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.payment_request_approvers(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.payment_request_reviewers(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.payment_request_tell(uuid[], text, text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.permission_template_flags_set(uuid, integer, text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.permission_user_flags_set(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.payment_requests_for_approval() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.payment_requests_waiting_count() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.payment_request_approve(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.payment_request_send_back(uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.permission_template_flags_set(uuid, integer, text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.permission_user_flags_set(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.payment_requests_for_approval() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.payment_requests_waiting_count() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.payment_request_approve(uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.payment_request_send_back(uuid[], text) TO authenticated, service_role;

-- ── Seeded as §1 has it today ──────────────────────────────────────────────
-- Marketing · Staff's requests are approved in Marketing first; Marketing · Manager (the Manager and the Assistant
-- Manager) holds Claim & approve — its boxes, and the cells they stand for. An editor left open on either saves over
-- nothing it did not see.

INSERT INTO public.permission_template_flags (template_id, flag)
SELECT t.id, 'claims_review' FROM public.permission_templates t WHERE t.key = 'mkt_staff'
ON CONFLICT (template_id, flag) DO NOTHING;

INSERT INTO public.permission_template_tabs (template_id, tab_id, action)
SELECT t.id, 'mkt.claims_approve', a
  FROM public.permission_templates t, unnest(ARRAY['view', 'approve']) a
 WHERE t.key = 'mkt_manager'
   AND EXISTS (SELECT 1 FROM public.permission_template_tabs x WHERE x.template_id = t.id)
ON CONFLICT (template_id, tab_id, action) DO NOTHING;

INSERT INTO public.permission_template_grants (template_id, function_key, action, scope)
SELECT t.id, 'claims', a, 'dept'
  FROM public.permission_templates t, unnest(ARRAY['view', 'approve']) a
 WHERE t.key = 'mkt_manager'
ON CONFLICT (template_id, function_key, action) DO UPDATE SET scope = 'dept'
 WHERE public.permission_template_grants.scope IS DISTINCT FROM 'all';

UPDATE public.permission_templates SET version = version + 1, updated_at = now()
 WHERE key IN ('mkt_staff', 'mkt_manager');

NOTIFY pgrst, 'reload schema';
