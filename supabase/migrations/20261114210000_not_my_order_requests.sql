-- ============================================================================
-- 20261114210000_not_my_order_requests.sql
-- Not my order — a salesperson says a bill is not theirs, HR approves, and it counts for nothing (2026-11-14 — the user,
-- after IT-0010: SHAWN keys and scans bills for others, and the ERP makes whoever keys one its salesperson, so ZNT6430
-- sat in his November margin. "如果同时他们能够来 select 他们的 sales order，就是 press 在电话的时候，then 他可以写 request
-- 'not my order'，and then HR approve。这样它就会直接变成是完完全全 don't count 的形式 … 现在他们那边本来就有一个 function
-- （比如三个点之类的），按他们的 sales order 可以 share 单，现在是多了一个 function").
-- ============================================================================
--
-- One request = one bill (sales_orders), sent from the Revenue app by the salesperson the bill is on (sales_orders.staff_id)
-- with a reason (required — whose it is, or why it is not theirs). It moves:
--   hr        sent — HR is told (topic revenue.shares, the share_taken notice: Comm Cal's month, its Requests tab)
--   approved  HR approved — the bill is taken out exactly as Comm Cal's *Don't count this bill* takes it out
--             (revenue_exclude_order in HR's name, note "Not SHAWN's order — <reason>"): out of the month's sales, margin,
--             commission, override, KPI, the Revenue app and the Arena, and it stays out whatever the ERP sends next
--   rejected  HR rejected it, saying why — the bill keeps counting
--   cancelled the salesperson withdrew it before HR decided
-- One open request (hr) a bill. Refused while the bill does not count, its month is in payroll (a run applied), a close
-- holds it, it is shared (any sales_order_shares part) or a share request is open on it — and a share request is refused
-- while one of these is open (share_request_blocked, one statement added). The salesperson is told of HR's decision (ref
-- not_mine_request → the request in the Revenue app).
--
-- Table (RLS on, NO policy, no client grants — every read and write is one of the functions below, as share requests'):
--   sales_order_not_mine_requests   the request: the bill, its month and sub-department, who sent it and why, the status,
--                                   HR's decision
-- Functions (SECURITY DEFINER plpgsql; PUBLIC and anon revoked, `authenticated` granted):
--   member_not_mine_context(order, staff)   the sheet: the bill, why it cannot be sent now, its open request (staff given:
--                                           the Principal's View as, read only)
--   member_not_mine_send(order, reason)     the salesperson sends one (Profile · Requests · Create, as a share request)
--   member_not_mine_cancel(request)         the salesperson withdraws one still with HR
--   member_not_mine_requests(staff, sub)    one's own, open first, then the last 90 days' (staff given: View as)
--   revenue_not_mine_requests(sub, period)  Comm Cal › Requests: the month's (Revenue · View or Edit)
--   revenue_not_mine_decide(request, approve, note)  HR approves or rejects (Revenue · Edit, on the month's page)
-- Helpers nobody calls but the functions above: not_mine_requests_json, not_mine_request_blocked.
-- PGlite: tests/member-sql/validate-not-my-order.mjs.

BEGIN;

-- share_request_blocked as production runs it, or as this migration leaves it.
DO $$
DECLARE
  v_md5 text;
BEGIN
  IF to_regprocedure('public.share_request_blocked(uuid)') IS NULL THEN
    RAISE EXCEPTION 'public.share_request_blocked(uuid) is not on this database';
  END IF;
  SELECT md5(replace(prosrc, E'\r', '')) INTO v_md5 FROM pg_proc WHERE oid = to_regprocedure('public.share_request_blocked(uuid)');
  IF v_md5 IS DISTINCT FROM '23ded4ba1424897388e56e0c9b52e5e1' AND v_md5 IS DISTINCT FROM 'b7322ef67305370994b72a8215573882' THEN
    RAISE EXCEPTION 'public.share_request_blocked(uuid) is md5 %, not the body this migration was written from', v_md5;
  END IF;
END $$;

-- ── The notice's kind ───────────────────────────────────────────────────────
-- Widened from what the check holds now (other sessions add kinds too): nothing it allowed is dropped.

CREATE OR REPLACE FUNCTION pg_temp.widen_check(p_table regclass, p_name text, p_column text, p_add text[])
RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_def  text;
  v_vals text[];
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO v_def FROM pg_constraint c WHERE c.conrelid = p_table AND c.conname = p_name;
  IF v_def IS NULL THEN
    RAISE EXCEPTION '% has no constraint %', p_table, p_name;
  END IF;
  v_vals := ARRAY(SELECT DISTINCT btrim(v, '"') FROM regexp_matches(v_def, '''([^'']+)''', 'g') m,
                         unnest(CASE WHEN m[1] LIKE '{%}' THEN string_to_array(btrim(m[1], '{}'), ',') ELSE ARRAY[m[1]] END) v);
  IF v_vals @> p_add THEN
    RETURN;
  END IF;
  v_vals := ARRAY(SELECT DISTINCT x FROM unnest(v_vals || p_add) x ORDER BY x);
  EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', p_table, p_name);
  EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I CHECK (%I = ANY (ARRAY[%s]))', p_table, p_name, p_column,
                 (SELECT string_agg(quote_literal(x), ', ' ORDER BY x) FROM unnest(v_vals) x));
END
$fn$;

-- not_mine_request: HR's decision on one's request, to the salesperson — the Revenue app opens that request.
SELECT pg_temp.widen_check('public.app_notifications', 'app_notifications_ref_kind_check', 'ref_kind', ARRAY['not_mine_request']);

-- ── The table ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sales_order_not_mine_requests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          uuid NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  order_no          text NOT NULL,
  sub_department_id uuid NOT NULL REFERENCES public.comm_sub_departments(id),
  period_month      date NOT NULL,
  staff_id          uuid NOT NULL REFERENCES public.hr_staff_costs(id),
  staff_name        text NOT NULL,
  sent_by           uuid NOT NULL REFERENCES public.users(id),
  reason            text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 500),
  status            text NOT NULL DEFAULT 'hr' CHECK (status IN ('hr', 'approved', 'rejected', 'cancelled')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  decided_at        timestamptz,
  decided_by        uuid REFERENCES public.users(id),
  decided_by_name   text,
  decision_note     text CHECK (decision_note IS NULL OR length(decision_note) <= 500)
);
CREATE UNIQUE INDEX IF NOT EXISTS sales_order_not_mine_requests_one_open
  ON public.sales_order_not_mine_requests (order_id) WHERE status = 'hr';
CREATE INDEX IF NOT EXISTS sales_order_not_mine_requests_month
  ON public.sales_order_not_mine_requests (sub_department_id, period_month);
CREATE INDEX IF NOT EXISTS sales_order_not_mine_requests_staff
  ON public.sales_order_not_mine_requests (staff_id, created_at DESC);

ALTER TABLE public.sales_order_not_mine_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sales_order_not_mine_requests FROM anon, authenticated;

SELECT public.audit_register('sales_order_not_mine_requests', 'Not my order requests', 'Revenue', '{revenue}', 'all',
  p_keys => '{order_no}', p_labels => '{staff_name}');

COMMENT ON TABLE public.sales_order_not_mine_requests IS
  $c$Not my order (20261114210000): a salesperson's request that a bill on them is not theirs — sent from the Revenue app, approved by HR on Comm Cal › Requests (the bill taken out as Don't count this bill takes it out) or rejected; one open (hr) a bill. Read and written only through member_not_mine_* and revenue_not_mine_*.$c$;

-- ── Helpers the functions share (nobody's to call) ──────────────────────────

-- Requests as the app and Comm Cal read them, in the order given.
CREATE OR REPLACE FUNCTION public.not_mine_requests_json(p_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'id', r.id, 'status', r.status, 'orderId', r.order_id, 'orderNo', r.order_no,
             'periodMonth', to_char(r.period_month, 'YYYY-MM'), 'subDepartmentId', r.sub_department_id,
             'staff', jsonb_build_object('id', r.staff_id, 'name', r.staff_name),
             'reason', r.reason, 'createdAt', r.created_at, 'updatedAt', r.updated_at,
             'decidedAt', r.decided_at, 'decidedByName', r.decided_by_name, 'decisionNote', r.decision_note,
             'bill', (SELECT jsonb_build_object('date', so.order_date, 'customer', coalesce(nullif(btrim(so.customer_name), ''), ''),
                              'venue', coalesce(nullif(btrim(so.venue), ''), ''), 'total', so.order_total,
                              'ownerId', so.staff_id, 'counts', NOT so.cancelled,
                              'periodMonth', to_char(so.period_month, 'YYYY-MM'))
                        FROM public.sales_orders so WHERE so.id = r.order_id))
           ORDER BY x.ord)
      FROM unnest(p_ids) WITH ORDINALITY AS x(id, ord)
      JOIN public.sales_order_not_mine_requests r ON r.id = x.id
  ), '[]'::jsonb);
END
$fn$;

-- Why a bill cannot be said not to be its salesperson's now — or NULL. Asked when the sheet opens, when one is sent and
-- again when HR approves; the words are the salesperson's and HR's alike.
CREATE OR REPLACE FUNCTION public.not_mine_request_blocked(p_order uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_order public.sales_orders%ROWTYPE;
  v_sub   uuid;
  v_who   text;
BEGIN
  SELECT * INTO v_order FROM public.sales_orders WHERE id = p_order;
  IF v_order.id IS NULL THEN
    RETURN 'That bill is not there any more.';
  END IF;
  IF v_order.cancelled THEN
    RETURN v_order.order_no || ' does not count already — it is in nobody''s sales.';
  END IF;
  SELECT b.sub_department_id INTO v_sub FROM public.sales_import_batches b WHERE b.id = v_order.batch_id;
  IF public.commission_order_period_locked(v_sub, v_order.period_month) THEN
    RETURN to_char(v_order.period_month, 'Mon YYYY') || ' is in payroll, so ' || v_order.order_no || ' cannot be taken out now.';
  END IF;
  -- A close that gave its commission (Don't count this bill asks the same, billsClosedReason).
  SELECT string_agg(DISTINCT s.employee_name || '’s ' || to_char(x.period_month, 'Mon YYYY'), ', ') INTO v_who
    FROM public.comm_salesperson_closes x JOIN public.hr_staff_costs s ON s.id = x.staff_id
   WHERE x.reopened_at IS NULL AND x.order_ids && ARRAY[p_order];
  IF v_who IS NOT NULL THEN
    RETURN v_who || ' is closed on Comm Cal, so ' || v_order.order_no || ' cannot be taken out until HR reopens it.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sales_order_shares sh WHERE sh.order_id = p_order AND sh.staff_id IS DISTINCT FROM v_order.staff_id) THEN
    RETURN v_order.order_no || ' is shared — HR changes who holds it on Comm Cal.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sales_order_share_requests r WHERE r.order_id = p_order AND r.status IN ('partner', 'hr')) THEN
    RETURN 'A share request for ' || v_order.order_no || ' is open — withdraw it first.';
  END IF;
  RETURN NULL;
END
$fn$;

REVOKE ALL ON FUNCTION public.not_mine_requests_json(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.not_mine_request_blocked(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.not_mine_requests_json(uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.not_mine_request_blocked(uuid) TO service_role;

-- ── The Revenue app ─────────────────────────────────────────────────────────

-- The sheet: the bill, why it cannot be sent now, the request open on it. p_staff given: the Principal's View as of a
-- member (member_principal_context refuses anybody else) — read only, as the share sheet.
CREATE OR REPLACE FUNCTION public.member_not_mine_context(p_order uuid, p_staff uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_staff uuid;
  v_order public.sales_orders%ROWTYPE;
  v_sub   uuid;
  v_open  uuid;
BEGIN
  SELECT * INTO v_order FROM public.sales_orders WHERE id = p_order;
  SELECT b.sub_department_id INTO v_sub FROM public.sales_import_batches b WHERE b.id = v_order.batch_id;
  IF p_staff IS NULL THEN
    v_staff := public.member_staff_id();
  ELSE
    PERFORM public.member_principal_context(p_staff, v_sub, NULL::uuid);
    v_staff := p_staff;
  END IF;
  IF v_order.id IS NULL OR v_order.staff_id IS DISTINCT FROM v_staff THEN
    RAISE EXCEPTION 'Only the salesperson on the bill can say it is not theirs.' USING ERRCODE = '42501';
  END IF;
  SELECT r.id INTO v_open FROM public.sales_order_not_mine_requests r WHERE r.order_id = p_order AND r.status = 'hr';
  RETURN jsonb_build_object(
    'orderId', v_order.id, 'orderNo', v_order.order_no, 'total', v_order.order_total,
    'customer', coalesce(nullif(btrim(v_order.customer_name), ''), ''),
    'blocked', CASE WHEN v_open IS NULL THEN public.not_mine_request_blocked(p_order) END,
    'request', CASE WHEN v_open IS NOT NULL THEN public.not_mine_requests_json(ARRAY[v_open]) -> 0 END);
END
$fn$;

-- The salesperson on the bill sends one, with the reason; HR is told.
CREATE OR REPLACE FUNCTION public.member_not_mine_send(p_order uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me      uuid := auth.uid();
  v_staff   uuid := public.member_staff_id();
  v_order   public.sales_orders%ROWTYPE;
  v_sub     uuid;
  v_reason  text := btrim(coalesce(p_reason, ''));
  v_blocked text;
  v_name    text;
  v_id      uuid;
  v_slug    text;
BEGIN
  IF public.tab_box_closed('rev.requests', 'create') THEN
    RAISE EXCEPTION 'Sending a request is not open to your account.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_order FROM public.sales_orders WHERE id = p_order;
  IF v_order.id IS NULL OR v_order.staff_id IS DISTINCT FROM v_staff THEN
    RAISE EXCEPTION 'Only the salesperson on the bill can say it is not theirs.' USING ERRCODE = '42501';
  END IF;
  IF v_reason = '' THEN
    RAISE EXCEPTION 'Say whose order it is, or why it is not yours — HR reads it.' USING ERRCODE = '22023';
  END IF;
  IF length(v_reason) > 500 THEN
    RAISE EXCEPTION 'Keep the reason to 500 characters.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sales_order_not_mine_requests r WHERE r.order_id = p_order AND r.status = 'hr') THEN
    RAISE EXCEPTION 'A Not my order request for % is with HR already — follow it on the bill, or withdraw it first.', v_order.order_no
      USING ERRCODE = '23505';
  END IF;
  v_blocked := public.not_mine_request_blocked(p_order);
  IF v_blocked IS NOT NULL THEN
    RAISE EXCEPTION '%', v_blocked USING ERRCODE = '22023';
  END IF;

  SELECT b.sub_department_id INTO v_sub FROM public.sales_import_batches b WHERE b.id = v_order.batch_id;
  SELECT s.employee_name INTO v_name FROM public.hr_staff_costs s WHERE s.id = v_staff;
  BEGIN
    INSERT INTO public.sales_order_not_mine_requests (order_id, order_no, sub_department_id, period_month, staff_id, staff_name,
                                                      sent_by, reason)
    VALUES (p_order, v_order.order_no, v_sub, v_order.period_month, v_staff, v_name, v_me, v_reason)
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'A Not my order request for % is with HR already — follow it on the bill, or withdraw it first.', v_order.order_no
      USING ERRCODE = '23505';
  END;

  -- HR: whoever may change the month's bills on Comm Cal (the topic share_request_take_effect tells), opened on its Requests.
  BEGIN
    SELECT btrim(regexp_replace(lower(btrim(d.name)), '[^a-z0-9]+', '-', 'g'), '-') INTO v_slug
      FROM public.comm_sub_departments d WHERE d.id = v_sub;
    PERFORM public.notify_topic('revenue.shares', 'share', left(v_order.order_no || ' · not ' || v_name || '’s order?', 200),
      left(v_name || ' says ' || v_order.order_no || ' is not theirs (RM '
        || regexp_replace(to_char(v_order.order_total, 'FM999,999,990.00'), '\.00$', '')
        || coalesce(', ' || left(nullif(btrim(v_order.customer_name), ''), 60), '') || '): “' || left(v_reason, 200)
        || '”. Approve or reject it on Comm Cal › Requests.', 400),
      'share_taken', coalesce(v_slug, v_sub::text) || '/' || to_char(v_order.period_month, 'YYYY-MM-DD'));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'member_not_mine_send: nobody was told of % (%)', v_order.order_no, SQLERRM;
  END;
  RETURN public.not_mine_requests_json(ARRAY[v_id]) -> 0;
END
$fn$;

-- The salesperson withdraws one HR has not decided.
CREATE OR REPLACE FUNCTION public.member_not_mine_cancel(p_request uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_staff uuid := public.member_staff_id();
  v_r     public.sales_order_not_mine_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_r FROM public.sales_order_not_mine_requests WHERE id = p_request FOR UPDATE;
  IF v_r.id IS NULL OR v_r.staff_id <> v_staff THEN
    RAISE EXCEPTION 'Only the salesperson who sent it can withdraw it.' USING ERRCODE = '42501';
  END IF;
  IF v_r.status <> 'hr' THEN
    RAISE EXCEPTION '%', CASE v_r.status WHEN 'approved' THEN 'HR approved it already, so there is nothing to withdraw.'
                                          WHEN 'rejected' THEN 'HR rejected it already, so there is nothing to withdraw.'
                                          ELSE 'It was withdrawn already.' END USING ERRCODE = '22023';
  END IF;
  UPDATE public.sales_order_not_mine_requests SET status = 'cancelled', updated_at = now() WHERE id = p_request;
  RETURN public.not_mine_requests_json(ARRAY[p_request]) -> 0;
END
$fn$;

-- One's own: those with HR first, then the last 90 days'. p_staff given: the Principal's View as of that member.
CREATE OR REPLACE FUNCTION public.member_not_mine_requests(p_staff uuid, p_sub_department uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_staff uuid;
BEGIN
  IF p_staff IS NULL THEN
    v_staff := public.member_staff_id();
  ELSE
    PERFORM public.member_principal_context(p_staff, p_sub_department, NULL::uuid);
    v_staff := p_staff;
  END IF;
  RETURN public.not_mine_requests_json(ARRAY(
    SELECT r.id FROM public.sales_order_not_mine_requests r
     WHERE r.staff_id = v_staff
       AND (r.status = 'hr' OR r.updated_at > now() - interval '90 days')
     ORDER BY (r.status = 'hr') DESC, r.updated_at DESC, r.id
     LIMIT 60));
END
$fn$;

-- ── Comm Cal ────────────────────────────────────────────────────────────────

-- The month's requests (the bill's month; the month it was sent in when the bill is gone): HR's first.
CREATE OR REPLACE FUNCTION public.revenue_not_mine_requests(p_sub_department uuid, p_period date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT coalesce(public.has_any_action(ARRAY['revenue.view', 'revenue.edit']), false) THEN
    RAISE EXCEPTION 'Comm Cal is not open to your account.' USING ERRCODE = '42501';
  END IF;
  RETURN public.not_mine_requests_json(ARRAY(
    SELECT r.id FROM public.sales_order_not_mine_requests r
      LEFT JOIN public.sales_orders so ON so.id = r.order_id
     WHERE r.sub_department_id = p_sub_department
       AND coalesce(so.period_month, r.period_month) = date_trunc('month', p_period)::date
     ORDER BY CASE r.status WHEN 'hr' THEN 0 ELSE 1 END, r.updated_at DESC, r.id
     LIMIT 300));
END
$fn$;

-- HR approves (the bill taken out, as Don't count this bill takes it out) or rejects (saying why); the salesperson is told.
CREATE OR REPLACE FUNCTION public.revenue_not_mine_decide(p_request uuid, p_approve boolean, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me      uuid := auth.uid();
  v_r       public.sales_order_not_mine_requests%ROWTYPE;
  v_order   public.sales_orders%ROWTYPE;
  v_note    text := nullif(btrim(coalesce(p_note, '')), '');
  v_who     text;
  v_blocked text;
BEGIN
  IF NOT coalesce(public.has_any_action(ARRAY['revenue.edit']), false) THEN
    RAISE EXCEPTION 'Deciding these requests is not open to your account.' USING ERRCODE = '42501';
  END IF;
  PERFORM public.tab_write_guard(ARRAY['/revenue/[sub]/[period]'], ARRAY['revenue.edit']);
  IF p_approve IS NULL THEN
    RAISE EXCEPTION 'Approve or reject.' USING ERRCODE = '22023';
  END IF;
  IF length(coalesce(v_note, '')) > 500 THEN
    RAISE EXCEPTION 'Keep the note to 500 characters.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_r FROM public.sales_order_not_mine_requests WHERE id = p_request FOR UPDATE;
  IF v_r.id IS NULL THEN
    RAISE EXCEPTION 'That request is not there.' USING ERRCODE = '42501';
  END IF;
  IF v_r.status <> 'hr' THEN
    RAISE EXCEPTION '%', CASE v_r.status WHEN 'approved' THEN 'It was approved already.'
                                          WHEN 'rejected' THEN 'It was rejected already.'
                                          ELSE 'The salesperson withdrew it.' END USING ERRCODE = '22023';
  END IF;
  IF NOT p_approve AND v_note IS NULL THEN
    RAISE EXCEPTION 'Say why it is rejected — the salesperson reads it.' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(nullif(btrim(s.employee_name), ''), nullif(btrim(u.name), ''), u.email, 'HR') INTO v_who
    FROM public.users u
    LEFT JOIN LATERAL (SELECT x.employee_name FROM public.hr_staff_costs x WHERE x.user_id = u.id AND x.status = 'active'
                        ORDER BY x.created_at, x.id LIMIT 1) s ON true
   WHERE u.id = v_me;
  v_who := coalesce(v_who, 'HR');

  IF p_approve THEN
    SELECT * INTO v_order FROM public.sales_orders WHERE id = v_r.order_id;
    IF v_order.id IS NULL THEN
      RAISE EXCEPTION 'The bill is not there any more — reject this request.' USING ERRCODE = '22023';
    END IF;
    IF v_order.staff_id IS DISTINCT FROM v_r.staff_id THEN
      RAISE EXCEPTION '% is %’s now — it moved since % asked. Reject this request.', v_order.order_no,
        coalesce((SELECT s.employee_name FROM public.hr_staff_costs s WHERE s.id = v_order.staff_id), 'nobody'), v_r.staff_name
        USING ERRCODE = '22023';
    END IF;
    IF v_order.cancelled THEN
      -- Taken out by hand meanwhile: what was asked is done — approved, the exclusion and its note left as they are.
      IF NOT public.sales_order_excluded_by_hand(v_order.id) THEN
        RAISE EXCEPTION '% does not count already (the ERP keeps it out) — reject this request, saying so.', v_order.order_no
          USING ERRCODE = '22023';
      END IF;
    ELSE
      v_blocked := public.not_mine_request_blocked(v_r.order_id);
      IF v_blocked IS NOT NULL THEN
        RAISE EXCEPTION '%', v_blocked USING ERRCODE = '22023';
      END IF;
      -- Comm Cal's own Don't count this bill, in HR's name: out of everything, kept through every ERP re-send.
      PERFORM public.revenue_exclude_order(v_r.order_id, left('Not ' || v_r.staff_name || '’s order — ' || v_r.reason, 500));
    END IF;
    UPDATE public.sales_order_not_mine_requests
       SET status = 'approved', updated_at = now(), decided_at = now(), decided_by = v_me, decided_by_name = v_who,
           decision_note = v_note
     WHERE id = p_request;
  ELSE
    UPDATE public.sales_order_not_mine_requests
       SET status = 'rejected', updated_at = now(), decided_at = now(), decided_by = v_me, decided_by_name = v_who,
           decision_note = v_note
     WHERE id = p_request;
  END IF;

  BEGIN
    PERFORM public.notify_people(ARRAY(SELECT s.user_id FROM public.hr_staff_costs s WHERE s.id = v_r.staff_id),
      'share',
      CASE WHEN p_approve THEN v_r.order_no || ' · not counted' ELSE v_r.order_no || ' · request rejected' END,
      left(CASE WHEN p_approve
                THEN 'HR approved: it is out of your sales, margin and commission.' || coalesce(' “' || left(v_note, 200) || '”', '')
                ELSE 'HR: “' || left(v_note, 300) || '” It stays in your sales.' END, 400),
      'not_mine_request', p_request::text);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'revenue_not_mine_decide: nobody was told of % (%)', v_r.order_no, SQLERRM;
  END;
  RETURN public.not_mine_requests_json(ARRAY[p_request]) -> 0;
END
$fn$;

REVOKE ALL ON FUNCTION public.member_not_mine_context(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.member_not_mine_send(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.member_not_mine_cancel(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.member_not_mine_requests(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revenue_not_mine_requests(uuid, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revenue_not_mine_decide(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_not_mine_context(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.member_not_mine_send(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.member_not_mine_cancel(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.member_not_mine_requests(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revenue_not_mine_requests(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revenue_not_mine_decide(uuid, boolean, text) TO authenticated;

COMMENT ON FUNCTION public.member_not_mine_send(uuid, text) IS
  $c$Not my order (20261114210000): the salesperson on a bill says it is not theirs, with a reason (1–500) — Profile · Requests · Create; refused while it does not count, its month is in payroll, a close holds it, it is shared, a share request or another of these is open on it. HR is told (topic revenue.shares, ref share_taken '<slug>/<YYYY-MM-01>').$c$;
COMMENT ON FUNCTION public.revenue_not_mine_decide(uuid, boolean, text) IS
  $c$Not my order (20261114210000): Revenue · Edit on Comm Cal's month page. Approve re-checks the bill (still the requester's, counting, not in payroll, no close, not shared) and takes it out with revenue_exclude_order in HR's name, note "Not NAME's order — reason"; a bill taken out by hand meanwhile is approved as it stands. Reject needs a reason. The salesperson is told (ref not_mine_request).$c$;

-- ── A share request waits while one of these is open ───────────────────────
-- share_request_blocked (production's body, one statement swapped): the share sheet, the send, the colleague's Accept and
-- HR's Approve all ask it, so a bill said not to be its salesperson's is shared by nobody until HR answers.

CREATE OR REPLACE FUNCTION pg_temp.swap_text(p_src text, p_old text, p_new text)
RETURNS text
LANGUAGE plpgsql AS $fn$
DECLARE
  v_pat   text := regexp_replace(regexp_replace(p_old, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'), '\s+', '\\s+', 'g');
  v_n     integer;
  v_found text;
BEGIN
  SELECT count(*) INTO v_n FROM regexp_matches(p_src, v_pat, 'g');
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'A statement this migration swaps is there % times, not once — production changed since it was written: %', v_n, left(p_old, 80);
  END IF;
  v_found := (regexp_match(p_src, '(' || v_pat || ')'))[1];
  RETURN replace(p_src, v_found, p_new);
END
$fn$;

DO $$
DECLARE
  v_def text;
BEGIN
  IF (SELECT md5(replace(prosrc, E'\r', '')) FROM pg_proc WHERE oid = to_regprocedure('public.share_request_blocked(uuid)'))
     = 'b7322ef67305370994b72a8215573882' THEN
    RETURN;  -- made already
  END IF;
  v_def := pg_temp.swap_text(pg_get_functiondef(to_regprocedure('public.share_request_blocked(uuid)')),
    $q$RETURN NULL;$q$,
    $q$IF EXISTS (SELECT 1 FROM public.sales_order_not_mine_requests nm WHERE nm.order_id = p_order AND nm.status = 'hr') THEN
    RETURN 'A Not my order request for ' || v_no || ' is with HR — it cannot be shared until HR answers it.';
  END IF;
  RETURN NULL;$q$);
  EXECUTE v_def;
END $$;

COMMIT;
