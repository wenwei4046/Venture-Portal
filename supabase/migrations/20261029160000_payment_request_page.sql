-- ============================================================================
-- 20261029160000_payment_request_page.sql
-- Finance › Payments › Payment request (2026-10-29, PR ① of docs/module-spec-payment-requests.md — the claim process
-- the user settled with the boss: "revenue team 的报销remain 经过hr审批，然后给finance", "finance 拒绝后可以再交过，
-- revenue 的finance 会退回给hr", "确定revenue 的是经过hr 的哦").
-- ============================================================================
--
-- 1. The page `/payments/requests` on Finance's Payments tab (`fin.payments`), in the database's copy of the
--    registry — added by name, never seeded whole (production holds rows main does not).
-- 2. Finance opens a member's claim invoice once HR approved the claim to be paid by Finance — not before, and not
--    after the claim goes back: `finance_reads_member_invoice(name)` answers the bucket's new SELECT policy
--    `member_invoice_read_finance` (the file's row in file_objects, which an R2 link is signed from), and
--    `finance_member_claim_invoice(claim)` names the claim's invoice for the page (the member's own row policies on
--    member_requests and its attachments stay as they are). Treasury, as claim_payment_queue() asks — Finance and the
--    Principal ("principal 也要能看到哦").
-- 3. Return to HR — `finance_return_member_claim(claim, reason)`: a member's claim approved for payment, with no
--    payment voucher, goes back to HR's Member Services. The claim is pending again (its route, approver and payroll
--    month cleared), the request submitted again; HR decides it again (approve, reject, or ask the member). The
--    reason is HR's, not the member's (the agreed design: "HR sees it (not LUCAS)"): it is the note of the step in
--    the request's history HR reads (member_request_audit writes it from the status change) and the body of HR's
--    notice, and the note the member reads on the request is cleared. Treasury · Void or Approve — as Send back to
--    HR on a payroll batch — and the page's box, as the action in front of it.
-- 4. notify_member_request(): HR's notice for such a request reads "Claim returned by Finance · <member>", its body
--    the reason; a new request and an answered one read as before.
-- 5. member_request_history() — the member's own history of a request: that step is shown without its note.
-- Nothing else changes. Running it twice changes nothing.

-- ── 0. The bodies replaced over ─────────────────────────────────────────────
-- Production's, md5 checked 2026-10-29 — or this file's own, run again:
--   notify_member_request  fa1392507b5410cdcadc747fb48cf45a (20261011180000_notifications)
--   member_request_history 6049e2b5ea783ec82f2b22565b940d5b (20261005030000_member_requests_numbers_claims)

DO $mig$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.notify_member_request()'::regprocedure)
       NOT IN ('fa1392507b5410cdcadc747fb48cf45a', 'd4b63e9983062890ea8cfe58fb4b7229') THEN
    RAISE EXCEPTION 'payment_request_page: notify_member_request is no longer the body this was written from';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.member_request_history(uuid)'::regprocedure)
       NOT IN ('6049e2b5ea783ec82f2b22565b940d5b', 'b7d0c97ff0a9e4825c12b359f7646168') THEN
    RAISE EXCEPTION 'payment_request_page: member_request_history is no longer the body this was written from';
  END IF;
END $mig$;

-- ── 1. The page ─────────────────────────────────────────────────────────────

INSERT INTO public.permission_page_tabs (page, tab_id) VALUES
  ('/payments/requests', 'fin.payments')
ON CONFLICT DO NOTHING;

-- ── 2. Finance opens a member's claim invoice ───────────────────────────────

CREATE OR REPLACE FUNCTION public.finance_reads_member_invoice(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  -- A claim HR approved to be paid by Finance (or paid by Finance since): the queue Finance works from.
  SELECT (SELECT public.has_perm('treasury'))
     AND EXISTS (
       SELECT 1
         FROM member_request_attachments a
         JOIN member_requests r ON r.id = a.request_id AND r.kind = 'claim'
         JOIN claims c ON c.id = r.claim_id
        WHERE a.object_path = p_name
          AND c.claim_type = 'benefit'
          AND c.payout_route = 'payment'
          AND c.status IN ('approved', 'paid'));
$$;

COMMENT ON FUNCTION public.finance_reads_member_invoice(text) IS
  'Payment request (2026-10-29): may this account open this member-invoices file — Treasury, and the file belongs to a member''s claim HR approved to be paid by Finance. The bucket''s member_invoice_read_finance policy asks it.';

DROP POLICY IF EXISTS member_invoice_read_finance ON public.file_objects;
CREATE POLICY member_invoice_read_finance ON public.file_objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'member-invoices' AND public.finance_reads_member_invoice(name));

CREATE OR REPLACE FUNCTION public.finance_member_claim_invoice(p_claim uuid)
RETURNS TABLE(object_path text, mime_type text, size_bytes integer, file_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  -- The invoice the member sent and HR saw: the attachment the request's invoiceHash names (Member services' own
  -- choice of it), the latest of that content. An outstation claim by road has none.
  SELECT a.object_path, a.mime_type, a.size_bytes, coalesce(nullif(btrim(r.detail->>'invoiceName'), ''), 'Invoice')
    FROM claims c
    JOIN member_requests r ON r.claim_id = c.id AND r.kind = 'claim'
    JOIN member_request_attachments a ON a.request_id = r.id AND a.content_sha256 = r.detail->>'invoiceHash'
   WHERE c.id = p_claim
     AND (SELECT public.has_perm('treasury'))
     AND c.claim_type = 'benefit'
     AND c.payout_route = 'payment'
     AND c.status IN ('approved', 'paid')
   ORDER BY a.created_at DESC
   LIMIT 1;
$$;

COMMENT ON FUNCTION public.finance_member_claim_invoice(uuid) IS
  'Payment request (2026-10-29): a member claim''s invoice for Finance (Treasury), once HR approved the claim to be paid by Finance — its path in member-invoices, type, size and name. None for a claim without one.';

-- ── 3. Return to HR ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.finance_return_member_claim(p_claim uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  c        claims%ROWTYPE;
  r        member_requests%ROWTYPE;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_pv     text;
BEGIN
  PERFORM public.tab_write_guard(ARRAY['/payments/requests'], ARRAY['treasury.void', 'treasury.approve']);
  IF auth.uid() IS NULL OR NOT public.has_any_action(ARRAY['treasury.void', 'treasury.approve']) THEN
    RAISE EXCEPTION 'finance_return_member_claim: needs Treasury · Void or Approve' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL THEN RAISE EXCEPTION 'Say why the claim goes back to HR'; END IF;

  SELECT * INTO c FROM claims WHERE id = p_claim FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Claim not found'; END IF;
  SELECT * INTO r FROM member_requests WHERE claim_id = c.id AND kind = 'claim' FOR UPDATE;
  IF NOT FOUND OR c.claim_type <> 'benefit' THEN
    RAISE EXCEPTION 'Only a member''s claim goes back to HR';
  END IF;
  IF c.status <> 'approved' OR c.payout_route IS DISTINCT FROM 'payment' OR r.status <> 'approved' THEN
    RAISE EXCEPTION 'This claim is not waiting for a payment voucher';
  END IF;
  IF c.voucher_id IS NOT NULL THEN
    SELECT voucher_no INTO v_pv FROM payment_vouchers WHERE id = c.voucher_id;
    RAISE EXCEPTION 'This claim already has a payment voucher (%). Void it first', coalesce(v_pv, 'not numbered yet');
  END IF;

  UPDATE claims
     SET status = 'pending', approved_by = NULL, approved_at = NULL, payout_route = NULL, payroll_month = NULL
   WHERE id = c.id;
  -- Submitted again, for HR to decide. The reason rides on the status change — into the step HR's history shows
  -- (member_request_audit) and HR's notice (notify_member_request) — and then leaves the note the member reads.
  UPDATE member_requests
     SET status = 'submitted', note = left('Returned by Finance: ' || v_reason, 1000), reviewed_by = NULL, reviewed_at = NULL
   WHERE id = r.id;
  UPDATE member_requests SET note = NULL WHERE id = r.id;

  INSERT INTO access_log (user_id, resource_type, resource_id, action, metadata)
  VALUES (auth.uid(), 'claim', c.id::text, 'return_to_hr',
          jsonb_build_object('request', r.request_no, 'amount', c.amount, 'reason', v_reason));
END
$$;

COMMENT ON FUNCTION public.finance_return_member_claim(uuid, text) IS
  'Payment request (2026-10-29): Finance returns a member''s claim HR approved for payment, with no payment voucher, to HR — the claim pending again, the request submitted again; the reason in the history HR reads and in HR''s notice, never in what the member reads. Treasury · Void or Approve, and the page''s box.';

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

SELECT pg_temp.tab_guard('public.finance_return_member_claim(uuid, text)',
  $$ARRAY['/payments/requests']$$, ARRAY['treasury.void', 'treasury.approve']);

-- ── 4. HR's notice ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_member_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_name text;
  v_kind text := CASE NEW.kind WHEN 'claim' THEN 'claim' WHEN 'waiting' THEN 'waiting list' ELSE 'replacement' END;
BEGIN
  IF NEW.status IS DISTINCT FROM 'submitted' OR (TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM 'submitted') THEN
    RETURN NULL;
  END IF;
  SELECT s.employee_name INTO v_name FROM public.hr_staff_costs s WHERE s.id = NEW.staff_id;
  -- Approved and submitted again: Finance returned it (finance_return_member_claim), its note the reason.
  PERFORM public.notify_topic('member.requests', 'review',
    CASE WHEN TG_OP = 'UPDATE' AND OLD.status = 'needs_info' THEN initcap(v_kind) || ' answered · '
         WHEN TG_OP = 'UPDATE' AND OLD.status = 'approved' THEN initcap(v_kind) || ' returned by Finance · '
         ELSE 'New ' || v_kind || ' · ' END || coalesce(v_name, 'A member'),
    CASE WHEN TG_OP = 'UPDATE' AND OLD.status = 'approved' THEN coalesce(NEW.note, NEW.title) ELSE NEW.title END,
    'member_request', NEW.id::text);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_member_request: %', SQLERRM;
  RETURN NULL;
END
$function$;

-- ── 5. The member's own history of a request ────────────────────────────────
-- Production's body (20261005030000), the one change: a claim's step from approved back to submitted — Finance's
-- return — keeps its note from the member.

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
   SELECT e.created_at AS at, e.to_status AS status, e.from_status AS "from",
    -- Finance's reason for sending a claim back is HR's (2026-10-29).
    CASE WHEN r.kind='claim' AND e.from_status='approved' AND e.to_status='submitted' THEN NULL ELSE e.note END AS note, e.actor_id
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

-- ── Who may call them ───────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.finance_reads_member_invoice(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finance_member_claim_invoice(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finance_return_member_claim(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_reads_member_invoice(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finance_member_claim_invoice(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finance_return_member_claim(uuid, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
