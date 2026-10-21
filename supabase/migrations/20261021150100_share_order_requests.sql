-- ============================================================================
-- 20261021150100_share_order_requests.sql
-- Share order — a salesperson asks to share a bill, the colleague accepts, HR approves (2026-10-21 — the user, on
-- My sales orders' sheet: "在这里我希望能放一个三点菜单（三个 dot），发一个 request … share order … 我可以把这个 order allocation
-- 分在不同的 sales 之间。选好之后点确定，这张单就会发一个 request。同时在 HR 那边的 commission calculation 里，需要有一个接口来接收
-- 这个 request … 在旁边加一个 request 的 tab … HR 按 approve 之后，这个 order 就会自动被 share 过去"; the flow: 1. Lucas shares,
-- Anthony is notified first; 2. Anthony accepts; 3. only then it reaches HR; 4. HR sees the whole trail; 5. HR approves and
-- the bill's commission AND its sales value are split — their targets and the leaders' boards follow (the migration before
-- this one makes the Revenue app read shares).
-- ============================================================================
--
-- One request = one bill (sales_orders), sent by the salesperson the bill is on (its owner, sales_orders.staff_id), naming
-- one to five colleagues of the bill's sub-department's team and each one's part (0 < part < 1; the owner keeps the rest
-- and always keeps some). It moves:
--   partner   sent — each colleague named is told (the bell and the phone) and answers in the Revenue app
--   hr        every colleague accepted — on Comm Cal › the bill's month › Requests
--   approved  HR approved — each part written into sales_order_shares exactly as Comm Cal's own Share this bill writes it
--             (its guard still refuses a paid month, 23RUN, and parts that leave the owner nothing, 23SHR)
--   rejected  HR rejected it, with the reason
--   declined  a colleague declined
--   cancelled the owner withdrew it before HR decided
-- One open request (partner / hr) a bill at a time. Every step is an event with who and when — the trail HR reads. Who is
-- told: the colleagues when it is sent or withdrawn; the owner of each answer; everybody on it of HR's decision.
--
-- Tables (RLS on, NO policy, no client grants — every read and write is one of the functions below, as IT requests'):
--   sales_order_share_requests        the request: the bill, its month and sub-department, its owner, the note, the status, HR's decision
--   sales_order_share_request_parts   each colleague named: their part, their answer
--   sales_order_share_request_events  its trail: sent · accepted · declined · cancelled · approved · rejected
-- Functions (SECURITY DEFINER plpgsql; PUBLIC and anon revoked, `authenticated` granted):
--   member_share_order_context(order, staff)      the share sheet: the bill, why it cannot be shared now, its open request,
--                                                 who holds it, whom it may be shared with (the owner's own, or — staff given —
--                                                 the Principal's View as of them, read only)
--   member_share_order_send(order, parts, note)   the owner sends one (Profile · Requests · Create, as a claim)
--   member_share_order_answer(request, accept, note)  a colleague named accepts or declines
--   member_share_order_cancel(request)            the owner withdraws one still open
--   member_share_requests(staff, sub)             one's own: sent and received (staff given: the Principal's View as)
--   revenue_share_requests(sub, period)           Comm Cal's Requests tab: the month's (Revenue · View or Edit)
--   revenue_share_request_decide(request, approve, note)  HR approves or rejects (Revenue · Edit, on the month's page)
-- Helpers nobody calls but the functions above: share_requests_json, share_request_blocked, share_request_team.
-- PGlite: tests/member-sql/validate-share-requests.mjs.

-- ── The notices' kinds ──────────────────────────────────────────────────────
-- Widened from what each check holds now (other sessions add kinds too): nothing it allowed is dropped.

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

SELECT pg_temp.widen_check('public.app_notifications', 'app_notifications_kind_check', 'kind', ARRAY['share']);
SELECT pg_temp.widen_check('public.app_notifications', 'app_notifications_ref_kind_check', 'ref_kind', ARRAY['share_request']);

-- ── The tables ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sales_order_share_requests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          uuid NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  order_no          text NOT NULL,
  sub_department_id uuid NOT NULL REFERENCES public.comm_sub_departments(id),
  period_month      date NOT NULL,
  owner_staff_id    uuid NOT NULL REFERENCES public.hr_staff_costs(id),
  owner_name        text NOT NULL,
  sent_by           uuid NOT NULL REFERENCES public.users(id),
  note              text NOT NULL DEFAULT '' CHECK (length(note) <= 500),
  status            text NOT NULL DEFAULT 'partner' CHECK (status IN ('partner', 'hr', 'approved', 'rejected', 'declined', 'cancelled')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  decided_at        timestamptz,
  decided_by        uuid REFERENCES public.users(id),
  decided_by_name   text,
  decision_note     text CHECK (decision_note IS NULL OR length(decision_note) <= 500)
);
CREATE UNIQUE INDEX IF NOT EXISTS sales_order_share_requests_one_open
  ON public.sales_order_share_requests (order_id) WHERE status IN ('partner', 'hr');
CREATE INDEX IF NOT EXISTS sales_order_share_requests_month
  ON public.sales_order_share_requests (sub_department_id, period_month);
CREATE INDEX IF NOT EXISTS sales_order_share_requests_owner
  ON public.sales_order_share_requests (owner_staff_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.sales_order_share_request_parts (
  request_id  uuid NOT NULL REFERENCES public.sales_order_share_requests(id) ON DELETE CASCADE,
  staff_id    uuid NOT NULL REFERENCES public.hr_staff_costs(id),
  staff_name  text NOT NULL,
  share_pct   numeric(5, 4) NOT NULL CHECK (share_pct > 0 AND share_pct < 1),
  answer      text NOT NULL DEFAULT 'pending' CHECK (answer IN ('pending', 'accepted', 'declined')),
  answered_at timestamptz,
  answer_note text CHECK (answer_note IS NULL OR length(answer_note) <= 500),
  PRIMARY KEY (request_id, staff_id)
);
CREATE INDEX IF NOT EXISTS sales_order_share_request_parts_staff ON public.sales_order_share_request_parts (staff_id);

CREATE TABLE IF NOT EXISTS public.sales_order_share_request_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id     uuid NOT NULL REFERENCES public.sales_order_share_requests(id) ON DELETE CASCADE,
  step           text NOT NULL CHECK (step IN ('sent', 'accepted', 'declined', 'cancelled', 'approved', 'rejected')),
  actor_id       uuid REFERENCES public.users(id),
  actor_staff_id uuid REFERENCES public.hr_staff_costs(id),
  actor_name     text NOT NULL,
  note           text CHECK (note IS NULL OR length(note) <= 500),
  created_at     timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS sales_order_share_request_events_request
  ON public.sales_order_share_request_events (request_id, created_at);

ALTER TABLE public.sales_order_share_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_order_share_request_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_order_share_request_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sales_order_share_requests, public.sales_order_share_request_parts,
  public.sales_order_share_request_events FROM anon, authenticated;

SELECT public.audit_register('sales_order_share_requests', 'Share requests', 'Revenue', '{revenue}', 'all',
  p_keys => '{order_no}', p_labels => '{owner_name}');
SELECT public.audit_register('sales_order_share_request_parts', 'Share request parts', 'Revenue', '{revenue}', 'all',
  p_labels => '{staff_name}');
SELECT public.audit_register('sales_order_share_request_events', 'Share request trail', 'Revenue', '{}', 'none',
  p_reason => 'A request''s trail — each step is written once by its function and never changed: a record already');

-- ── Helpers the functions share (nobody's to call) ──────────────────────────

-- Who may hold a part of a bill of this sub-department: its current scheme's members today — active, not past their last
-- day, never a department head (the run ranks members only) — with whether their login is on.
CREATE OR REPLACE FUNCTION public.share_request_team(p_sub uuid)
RETURNS TABLE(staff_id uuid, name text, title text, user_id uuid, login boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_today  date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_scheme uuid;
BEGIN
  SELECT c.id INTO v_scheme FROM public.comm_schemes c
   WHERE c.sub_department_id = p_sub AND c.is_active
     AND c.effective_from <= v_today AND (c.effective_to IS NULL OR c.effective_to >= v_today)
   ORDER BY c.effective_from DESC, c.created_at DESC, c.id LIMIT 1;
  RETURN QUERY
  SELECT DISTINCT ON (s.id) s.id, s.employee_name, coalesce(t.name, st.name), s.user_id,
         coalesce(u.is_active, false)
    FROM public.comm_hierarchy h
    JOIN public.hr_staff_costs s ON s.id = h.staff_id
    LEFT JOIN public.titles t ON t.id = h.title_id
    LEFT JOIN public.titles st ON st.id = s.title_id
    LEFT JOIN public.users u ON u.id = s.user_id
   WHERE h.scheme_id = v_scheme AND s.status = 'active'
     AND (s.resignation_date IS NULL OR s.resignation_date >= v_today)
     AND h.effective_from <= v_today AND (h.effective_to IS NULL OR h.effective_to >= v_today)
     AND NOT coalesce(t.is_department_head, false) AND NOT coalesce(st.is_department_head, false)
   ORDER BY s.id, h.effective_from DESC;
END
$fn$;

-- Why who shares this bill cannot change now, in words, or NULL: its month in payroll (a paid run), or somebody paid on
-- it closed — the refusals Comm Cal's own Share this bill gives (run-actions.ts shareOrder).
CREATE OR REPLACE FUNCTION public.share_request_blocked(p_order uuid)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_month date;
  v_no    text;
  v_sub   uuid;
  v_who   text;
BEGIN
  SELECT so.period_month, so.order_no, b.sub_department_id INTO v_month, v_no, v_sub
    FROM public.sales_orders so JOIN public.sales_import_batches b ON b.id = so.batch_id
   WHERE so.id = p_order;
  IF v_month IS NULL THEN
    RETURN 'That bill is not there any more.';
  END IF;
  IF public.commission_order_period_locked(v_sub, v_month) THEN
    RETURN to_char(v_month, 'Mon YYYY') || ' is in payroll, so who shares ' || v_no || ' cannot change.';
  END IF;
  SELECT string_agg(DISTINCT s.employee_name || '’s ' || to_char(x.period_month, 'Mon YYYY'), ', ') INTO v_who
    FROM public.comm_salesperson_closes x JOIN public.hr_staff_costs s ON s.id = x.staff_id
   WHERE x.reopened_at IS NULL AND x.order_ids && ARRAY[p_order];
  IF v_who IS NOT NULL THEN
    RETURN v_who || ' is closed on Comm Cal, so who shares ' || v_no || ' cannot change until HR reopens it.';
  END IF;
  RETURN NULL;
END
$fn$;

-- Requests as the app and Comm Cal read them, in the order given; `mine` says what the reader is on each one.
CREATE OR REPLACE FUNCTION public.share_requests_json(p_ids uuid[], p_staff uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'id', r.id, 'status', r.status, 'orderId', r.order_id, 'orderNo', r.order_no,
             'periodMonth', to_char(r.period_month, 'YYYY-MM'), 'subDepartmentId', r.sub_department_id,
             'owner', jsonb_build_object('id', r.owner_staff_id, 'name', r.owner_name),
             'note', r.note, 'createdAt', r.created_at, 'updatedAt', r.updated_at,
             'decidedAt', r.decided_at, 'decidedByName', r.decided_by_name, 'decisionNote', r.decision_note,
             'mine', CASE WHEN p_staff IS NULL THEN NULL
                          WHEN r.owner_staff_id = p_staff THEN 'owner'
                          WHEN EXISTS (SELECT 1 FROM public.sales_order_share_request_parts y
                                        WHERE y.request_id = r.id AND y.staff_id = p_staff) THEN 'partner' END,
             'bill', (SELECT jsonb_build_object('date', so.order_date, 'customer', coalesce(nullif(btrim(so.customer_name), ''), ''),
                              'venue', coalesce(nullif(btrim(so.venue), ''), ''), 'total', so.order_total,
                              'ownerId', so.staff_id, 'counts', NOT so.cancelled,
                              'periodMonth', to_char(so.period_month, 'YYYY-MM'))
                        FROM public.sales_orders so WHERE so.id = r.order_id),
             'parts', coalesce((SELECT jsonb_agg(jsonb_build_object('id', y.staff_id, 'name', y.staff_name, 'pct', y.share_pct,
                                        'answer', y.answer, 'answeredAt', y.answered_at, 'note', y.answer_note)
                                      ORDER BY y.staff_name, y.staff_id)
                                  FROM public.sales_order_share_request_parts y WHERE y.request_id = r.id), '[]'::jsonb),
             'holders', coalesce((SELECT jsonb_agg(jsonb_build_object('id', h.staff_id, 'name', coalesce(hs.employee_name, ''),
                                          'pct', h.pct, 'owner', h.owner)
                                        ORDER BY h.owner DESC, hs.employee_name, h.staff_id)
                                    FROM (SELECT so.staff_id, 1 - coalesce((SELECT sum(sh.share_pct) FROM public.sales_order_shares sh
                                                  WHERE sh.order_id = so.id AND sh.staff_id IS DISTINCT FROM so.staff_id), 0) AS pct,
                                                 true AS owner
                                            FROM public.sales_orders so WHERE so.id = r.order_id AND so.staff_id IS NOT NULL
                                          UNION ALL
                                          SELECT sh.staff_id, sh.share_pct, false
                                            FROM public.sales_order_shares sh JOIN public.sales_orders so ON so.id = sh.order_id
                                           WHERE sh.order_id = r.order_id AND sh.staff_id IS DISTINCT FROM so.staff_id) h
                                    LEFT JOIN public.hr_staff_costs hs ON hs.id = h.staff_id), '[]'::jsonb),
             'events', coalesce((SELECT jsonb_agg(jsonb_build_object('step', e.step, 'name', e.actor_name, 'at', e.created_at,
                                         'note', e.note) ORDER BY e.created_at, e.id)
                                   FROM public.sales_order_share_request_events e WHERE e.request_id = r.id), '[]'::jsonb))
           ORDER BY x.ord)
      FROM unnest(p_ids) WITH ORDINALITY AS x(id, ord)
      JOIN public.sales_order_share_requests r ON r.id = x.id
  ), '[]'::jsonb);
END
$fn$;

REVOKE ALL ON FUNCTION public.share_request_team(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.share_request_blocked(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.share_requests_json(uuid[], uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.share_request_team(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.share_request_blocked(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.share_requests_json(uuid[], uuid) TO service_role;

-- ── The share sheet ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.member_share_order_context(p_order uuid, p_staff uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
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
    -- The Principal's View as of a member: their sheet, read only (member_principal_context refuses anybody else).
    PERFORM public.member_principal_context(p_staff, v_sub, NULL::uuid);
    v_staff := p_staff;
  END IF;
  IF v_order.id IS NULL OR v_order.staff_id IS DISTINCT FROM v_staff THEN
    RAISE EXCEPTION 'Only the salesperson on the bill can share it.' USING ERRCODE = '42501';
  END IF;
  SELECT r.id INTO v_open FROM public.sales_order_share_requests r WHERE r.order_id = p_order AND r.status IN ('partner', 'hr');
  RETURN jsonb_build_object(
    'orderId', v_order.id, 'orderNo', v_order.order_no, 'total', v_order.order_total,
    'blocked', CASE WHEN v_order.cancelled THEN v_order.order_no || ' does not count, so there is nothing to share.'
                    ELSE public.share_request_blocked(p_order) END,
    'request', CASE WHEN v_open IS NOT NULL THEN public.share_requests_json(ARRAY[v_open], v_staff) -> 0 END,
    'holders', coalesce((SELECT jsonb_agg(jsonb_build_object('id', h.staff_id, 'name', coalesce(hs.employee_name, ''), 'pct', h.pct,
                                  'owner', h.owner) ORDER BY h.owner DESC, hs.employee_name, h.staff_id)
                           FROM (SELECT v_order.staff_id AS staff_id,
                                        1 - coalesce((SELECT sum(sh.share_pct) FROM public.sales_order_shares sh
                                                       WHERE sh.order_id = p_order AND sh.staff_id IS DISTINCT FROM v_order.staff_id), 0) AS pct,
                                        true AS owner
                                 UNION ALL
                                 SELECT sh.staff_id, sh.share_pct, false FROM public.sales_order_shares sh
                                  WHERE sh.order_id = p_order AND sh.staff_id IS DISTINCT FROM v_order.staff_id) h
                           LEFT JOIN public.hr_staff_costs hs ON hs.id = h.staff_id), '[]'::jsonb),
    'team', coalesce((SELECT jsonb_agg(jsonb_build_object('id', t.staff_id, 'name', t.name, 'title', t.title,
                               'unavailable', CASE
                                 WHEN NOT t.login THEN 'No Revenue app login yet'
                                 WHEN EXISTS (SELECT 1 FROM public.comm_salesperson_closes x
                                               WHERE x.staff_id = t.staff_id AND x.sub_department_id = v_sub
                                                 AND x.period_month >= v_order.period_month AND x.reopened_at IS NULL)
                                   THEN 'Closed for ' || to_char(v_order.period_month, 'Mon YYYY') END)
                             ORDER BY t.name, t.staff_id)
                        FROM public.share_request_team(v_sub) t WHERE t.staff_id <> v_staff), '[]'::jsonb));
END
$fn$;

-- ── Send one ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.member_share_order_send(p_order uuid, p_parts jsonb, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me     uuid := auth.uid();
  v_staff  uuid := public.member_staff_id();
  v_order  public.sales_orders%ROWTYPE;
  v_sub    uuid;
  v_reason text;
  v_part   jsonb;
  v_text   text;
  v_pid    uuid;
  v_pct    numeric;
  v_ids    uuid[] := '{}';
  v_pcts   numeric[] := '{}';
  v_names  text[] := '{}';
  v_users  uuid[] := '{}';
  v_sum    numeric := 0;
  v_other  numeric;
  v_member record;
  v_change boolean := false;
  v_owner  text;
  v_note   text := btrim(coalesce(p_note, ''));
  v_id     uuid;
  i        integer;
BEGIN
  IF public.tab_box_closed('rev.requests', 'create') THEN
    RAISE EXCEPTION 'Sending a share request is not open to your account.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_order FROM public.sales_orders WHERE id = p_order;
  IF v_order.id IS NULL OR v_order.staff_id IS DISTINCT FROM v_staff THEN
    RAISE EXCEPTION 'Only the salesperson on the bill can share it.' USING ERRCODE = '42501';
  END IF;
  IF v_order.cancelled THEN
    RAISE EXCEPTION '% does not count, so there is nothing to share.', v_order.order_no USING ERRCODE = '22023';
  END IF;
  SELECT b.sub_department_id INTO v_sub FROM public.sales_import_batches b WHERE b.id = v_order.batch_id;
  v_reason := public.share_request_blocked(p_order);
  IF v_reason IS NOT NULL THEN
    RAISE EXCEPTION '%', v_reason USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sales_order_share_requests r WHERE r.order_id = p_order AND r.status IN ('partner', 'hr')) THEN
    RAISE EXCEPTION 'A share request for % is already open — follow it on the bill, or withdraw it first.', v_order.order_no
      USING ERRCODE = '23505';
  END IF;
  IF length(v_note) > 500 THEN
    RAISE EXCEPTION 'Keep the note to 500 characters.' USING ERRCODE = '22023';
  END IF;
  IF p_parts IS NULL OR jsonb_typeof(p_parts) <> 'array' OR jsonb_array_length(p_parts) = 0 THEN
    RAISE EXCEPTION 'Pick who to share it with.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_parts) > 5 THEN
    RAISE EXCEPTION 'Share a bill with up to 5 people at a time.' USING ERRCODE = '22023';
  END IF;

  FOR v_part IN SELECT value FROM jsonb_array_elements(p_parts) LOOP
    v_text := v_part ->> 'staffId';
    IF v_text IS NULL OR v_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'Pick who to share it with.' USING ERRCODE = '22023';
    END IF;
    v_pid := v_text::uuid;
    IF v_pid = v_staff THEN
      RAISE EXCEPTION 'It is your bill already — pick a colleague to share it with.' USING ERRCODE = '22023';
    END IF;
    IF v_pid = ANY (v_ids) THEN
      RAISE EXCEPTION 'The same person is there twice — remove one.' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(v_part -> 'pct') <> 'number' THEN
      RAISE EXCEPTION 'Give each colleague a part of the bill.' USING ERRCODE = '22023';
    END IF;
    v_pct := round((v_part ->> 'pct')::numeric, 4);
    IF NOT (v_pct > 0 AND v_pct < 1) THEN
      RAISE EXCEPTION 'A part is more than 0%% and less than 100%% of the bill.' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_member FROM public.share_request_team(v_sub) t WHERE t.staff_id = v_pid;
    IF v_member.staff_id IS NULL THEN
      RAISE EXCEPTION '% is not in this bill’s sub-department’s team, so no part of it would be paid to them.',
        coalesce((SELECT s.employee_name FROM public.hr_staff_costs s WHERE s.id = v_pid), 'That person') USING ERRCODE = '22023';
    END IF;
    IF NOT v_member.login THEN
      RAISE EXCEPTION '% has no Revenue app login yet, so they cannot accept. Ask HR to share it on Comm Cal.', v_member.name
        USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.comm_salesperson_closes x
                WHERE x.staff_id = v_pid AND x.sub_department_id = v_sub
                  AND x.period_month >= v_order.period_month AND x.reopened_at IS NULL) THEN
      RAISE EXCEPTION '%’s % is closed on Comm Cal, so they cannot take a part of this bill now.', v_member.name,
        to_char(v_order.period_month, 'Mon YYYY') USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.sales_order_shares sh WHERE sh.order_id = p_order AND sh.staff_id = v_pid
                    AND abs(sh.share_pct - v_pct) < 0.00005) THEN
      v_change := true;
    END IF;
    v_ids := v_ids || v_pid;
    v_pcts := v_pcts || v_pct;
    v_names := v_names || v_member.name;
    v_users := v_users || v_member.user_id;
    v_sum := v_sum + v_pct;
  END LOOP;

  -- The owner keeps a part: what the colleagues would hold, and what anybody else holds already.
  SELECT coalesce(sum(sh.share_pct), 0) INTO v_other FROM public.sales_order_shares sh
   WHERE sh.order_id = p_order AND sh.staff_id IS DISTINCT FROM v_staff AND NOT (sh.staff_id = ANY (v_ids));
  IF v_sum + v_other >= 0.99995 THEN
    RAISE EXCEPTION 'That leaves you nothing — you always keep a part of your own bill.' USING ERRCODE = '22023';
  END IF;
  IF NOT v_change THEN
    RAISE EXCEPTION 'They already hold those parts of % — nothing to change.', v_order.order_no USING ERRCODE = '22023';
  END IF;

  SELECT s.employee_name INTO v_owner FROM public.hr_staff_costs s WHERE s.id = v_staff;
  INSERT INTO public.sales_order_share_requests (order_id, order_no, sub_department_id, period_month, owner_staff_id, owner_name,
                                                 sent_by, note)
  VALUES (p_order, v_order.order_no, v_sub, v_order.period_month, v_staff, v_owner, v_me, v_note)
  RETURNING id INTO v_id;
  FOR i IN 1 .. array_length(v_ids, 1) LOOP
    INSERT INTO public.sales_order_share_request_parts (request_id, staff_id, staff_name, share_pct)
    VALUES (v_id, v_ids[i], v_names[i], v_pcts[i]);
  END LOOP;
  INSERT INTO public.sales_order_share_request_events (request_id, step, actor_id, actor_staff_id, actor_name, note)
  VALUES (v_id, 'sent', v_me, v_staff, v_owner, nullif(v_note, ''));

  BEGIN
    FOR i IN 1 .. array_length(v_ids, 1) LOOP
      PERFORM public.notify_people(ARRAY[v_users[i]], 'share', 'Share request · ' || v_order.order_no,
        v_owner || ' wants to share ' || v_order.order_no || ' with you: your part '
          || regexp_replace(to_char(round(v_pcts[i] * 100, 2), 'FM990.00'), '\.?0+$', '') || '% of RM '
          || to_char(v_order.order_total, 'FM999,999,990.00')
          || coalesce(' · ' || nullif(btrim(v_order.venue), ''), '') || '. Accept or decline in the Revenue app.',
        'share_request', v_id::text);
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'member_share_order_send: nobody was told of % (%)', v_order.order_no, SQLERRM;
  END;
  RETURN public.share_requests_json(ARRAY[v_id], v_staff) -> 0;
END
$fn$;

-- ── A colleague answers ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.member_share_order_answer(p_request uuid, p_accept boolean, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me      uuid := auth.uid();
  v_staff   uuid := public.member_staff_id();
  v_r       public.sales_order_share_requests%ROWTYPE;
  v_part    public.sales_order_share_request_parts%ROWTYPE;
  v_name    text;
  v_note    text := nullif(btrim(coalesce(p_note, '')), '');
  v_owner   uuid;
  v_waiting text;
BEGIN
  IF p_accept IS NULL THEN
    RAISE EXCEPTION 'Accept or decline.' USING ERRCODE = '22023';
  END IF;
  IF length(coalesce(v_note, '')) > 500 THEN
    RAISE EXCEPTION 'Keep the note to 500 characters.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_r FROM public.sales_order_share_requests WHERE id = p_request FOR UPDATE;
  SELECT * INTO v_part FROM public.sales_order_share_request_parts WHERE request_id = p_request AND staff_id = v_staff;
  IF v_r.id IS NULL OR v_part.request_id IS NULL THEN
    RAISE EXCEPTION 'That share request is not yours to answer.' USING ERRCODE = '42501';
  END IF;
  IF v_r.status <> 'partner' OR v_part.answer <> 'pending' THEN
    RAISE EXCEPTION 'This share request was answered already — it is %.',
      CASE WHEN v_part.answer = 'accepted' AND v_r.status = 'partner' THEN 'waiting for the others'
           ELSE CASE v_r.status WHEN 'hr' THEN 'with HR' WHEN 'approved' THEN 'approved' WHEN 'rejected' THEN 'rejected'
                                WHEN 'declined' THEN 'declined' WHEN 'cancelled' THEN 'withdrawn' ELSE v_r.status END END
      USING ERRCODE = '22023';
  END IF;
  v_name := v_part.staff_name;
  UPDATE public.sales_order_share_request_parts
     SET answer = CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END, answered_at = now(), answer_note = v_note
   WHERE request_id = p_request AND staff_id = v_staff;
  INSERT INTO public.sales_order_share_request_events (request_id, step, actor_id, actor_staff_id, actor_name, note)
  VALUES (p_request, CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END, v_me, v_staff, v_name, v_note);
  SELECT s.user_id INTO v_owner FROM public.hr_staff_costs s WHERE s.id = v_r.owner_staff_id;
  SELECT string_agg(y.staff_name, ', ' ORDER BY y.staff_name) INTO v_waiting
    FROM public.sales_order_share_request_parts y WHERE y.request_id = p_request AND y.answer = 'pending';

  IF NOT p_accept THEN
    UPDATE public.sales_order_share_requests SET status = 'declined', updated_at = now() WHERE id = p_request;
  ELSIF v_waiting IS NULL THEN
    UPDATE public.sales_order_share_requests SET status = 'hr', updated_at = now() WHERE id = p_request;
  ELSE
    UPDATE public.sales_order_share_requests SET updated_at = now() WHERE id = p_request;
  END IF;

  BEGIN
    IF NOT p_accept THEN
      PERFORM public.notify_people(
        ARRAY[v_owner] || ARRAY(SELECT s.user_id FROM public.sales_order_share_request_parts y
                                  JOIN public.hr_staff_costs s ON s.id = y.staff_id
                                 WHERE y.request_id = p_request AND y.answer = 'accepted'),
        'share', v_r.order_no || ' · share declined',
        v_name || ' declined sharing ' || v_r.order_no || '.' || coalesce(' “' || left(v_note, 200) || '”', ''),
        'share_request', p_request::text);
    ELSIF v_waiting IS NULL THEN
      PERFORM public.notify_people(ARRAY[v_owner], 'share', v_r.order_no || ' · accepted — with HR now',
        v_name || ' accepted sharing ' || v_r.order_no || '. HR approves it on Comm Cal.', 'share_request', p_request::text);
    ELSE
      PERFORM public.notify_people(ARRAY[v_owner], 'share', v_r.order_no || ' · ' || v_name || ' accepted',
        'Still waiting for ' || v_waiting || '.', 'share_request', p_request::text);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'member_share_order_answer: nobody was told of % (%)', v_r.order_no, SQLERRM;
  END;
  RETURN public.share_requests_json(ARRAY[p_request], v_staff) -> 0;
END
$fn$;

-- ── The owner withdraws one ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.member_share_order_cancel(p_request uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me    uuid := auth.uid();
  v_staff uuid := public.member_staff_id();
  v_r     public.sales_order_share_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_r FROM public.sales_order_share_requests WHERE id = p_request FOR UPDATE;
  IF v_r.id IS NULL OR v_r.owner_staff_id <> v_staff THEN
    RAISE EXCEPTION 'Only the salesperson who sent it can withdraw a share request.' USING ERRCODE = '42501';
  END IF;
  IF v_r.status NOT IN ('partner', 'hr') THEN
    RAISE EXCEPTION 'This share request is % already, so there is nothing to withdraw.',
      CASE v_r.status WHEN 'approved' THEN 'approved' WHEN 'rejected' THEN 'rejected' WHEN 'declined' THEN 'declined'
                      ELSE 'withdrawn' END USING ERRCODE = '22023';
  END IF;
  UPDATE public.sales_order_share_requests SET status = 'cancelled', updated_at = now() WHERE id = p_request;
  INSERT INTO public.sales_order_share_request_events (request_id, step, actor_id, actor_staff_id, actor_name)
  VALUES (p_request, 'cancelled', v_me, v_staff, v_r.owner_name);
  BEGIN
    PERFORM public.notify_people(ARRAY(SELECT s.user_id FROM public.sales_order_share_request_parts y
                                         JOIN public.hr_staff_costs s ON s.id = y.staff_id
                                        WHERE y.request_id = p_request AND y.answer <> 'declined'),
      'share', v_r.order_no || ' · share request withdrawn', v_r.owner_name || ' withdrew the request to share ' || v_r.order_no || '.',
      'share_request', p_request::text);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'member_share_order_cancel: nobody was told of % (%)', v_r.order_no, SQLERRM;
  END;
  RETURN public.share_requests_json(ARRAY[p_request], v_staff) -> 0;
END
$fn$;

-- ── One's own: sent and received ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.member_share_requests(p_staff uuid, p_sub_department uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
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
  RETURN public.share_requests_json(ARRAY(
    SELECT r.id FROM public.sales_order_share_requests r
     WHERE (r.owner_staff_id = v_staff
            OR EXISTS (SELECT 1 FROM public.sales_order_share_request_parts y WHERE y.request_id = r.id AND y.staff_id = v_staff))
       AND (r.status IN ('partner', 'hr') OR r.updated_at > now() - interval '90 days')
     ORDER BY (r.status IN ('partner', 'hr')) DESC, r.updated_at DESC, r.id
     LIMIT 60), v_staff);
END
$fn$;

-- ── Comm Cal › the month › Requests ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.revenue_share_requests(p_sub_department uuid, p_period date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT coalesce(public.has_any_action(ARRAY['revenue.view', 'revenue.edit']), false) THEN
    RAISE EXCEPTION 'Comm Cal is not open to your account.' USING ERRCODE = '42501';
  END IF;
  RETURN public.share_requests_json(ARRAY(
    SELECT r.id FROM public.sales_order_share_requests r
      LEFT JOIN public.sales_orders so ON so.id = r.order_id
     WHERE r.sub_department_id = p_sub_department
       AND coalesce(so.period_month, r.period_month) = date_trunc('month', p_period)::date
     ORDER BY CASE r.status WHEN 'hr' THEN 0 WHEN 'partner' THEN 1 ELSE 2 END, r.updated_at DESC, r.id
     LIMIT 300), NULL);
END
$fn$;

-- ── HR decides ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.revenue_share_request_decide(p_request uuid, p_approve boolean, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me      uuid := auth.uid();
  v_r       public.sales_order_share_requests%ROWTYPE;
  v_order   public.sales_orders%ROWTYPE;
  v_note    text := nullif(btrim(coalesce(p_note, '')), '');
  v_who     text;
  v_reason  text;
  v_part    record;
  v_waiting text;
  v_line    text;
  v_users   uuid[];
BEGIN
  IF NOT coalesce(public.has_any_action(ARRAY['revenue.edit']), false) THEN
    RAISE EXCEPTION 'Deciding share requests is not open to your account.' USING ERRCODE = '42501';
  END IF;
  PERFORM public.tab_write_guard(ARRAY['/revenue/[sub]/[period]'], ARRAY['revenue.edit']);
  IF p_approve IS NULL THEN
    RAISE EXCEPTION 'Approve or reject.' USING ERRCODE = '22023';
  END IF;
  IF length(coalesce(v_note, '')) > 500 THEN
    RAISE EXCEPTION 'Keep the note to 500 characters.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_r FROM public.sales_order_share_requests WHERE id = p_request FOR UPDATE;
  IF v_r.id IS NULL THEN
    RAISE EXCEPTION 'That share request is not there.' USING ERRCODE = '42501';
  END IF;
  IF v_r.status <> 'hr' THEN
    SELECT string_agg(y.staff_name, ', ' ORDER BY y.staff_name) INTO v_waiting
      FROM public.sales_order_share_request_parts y WHERE y.request_id = p_request AND y.answer = 'pending';
    RAISE EXCEPTION '%', CASE v_r.status
      WHEN 'partner' THEN 'It is still waiting for ' || coalesce(v_waiting, 'the colleagues') || ' to accept — HR decides once everybody has.'
      WHEN 'approved' THEN 'It was approved already.'
      WHEN 'rejected' THEN 'It was rejected already.'
      WHEN 'declined' THEN 'A colleague declined it, so there is nothing to approve.'
      ELSE 'The salesperson withdrew it.' END USING ERRCODE = '22023';
  END IF;
  IF NOT p_approve AND v_note IS NULL THEN
    RAISE EXCEPTION 'Say why it is rejected — the salespeople read it.' USING ERRCODE = '22023';
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
    IF v_order.staff_id IS DISTINCT FROM v_r.owner_staff_id THEN
      RAISE EXCEPTION '% is %’s now — it moved since % asked. Reject this request.', v_order.order_no,
        coalesce((SELECT s.employee_name FROM public.hr_staff_costs s WHERE s.id = v_order.staff_id), 'nobody'), v_r.owner_name
        USING ERRCODE = '22023';
    END IF;
    IF v_order.cancelled THEN
      RAISE EXCEPTION '% does not count any more — count it again first, or reject this request.', v_order.order_no
        USING ERRCODE = '22023';
    END IF;
    v_reason := public.share_request_blocked(v_r.order_id);
    IF v_reason IS NOT NULL THEN
      RAISE EXCEPTION '%', v_reason USING ERRCODE = '22023';
    END IF;
    FOR v_part IN SELECT y.staff_id, y.staff_name FROM public.sales_order_share_request_parts y WHERE y.request_id = p_request LOOP
      IF NOT EXISTS (SELECT 1 FROM public.share_request_team(v_r.sub_department_id) t WHERE t.staff_id = v_part.staff_id) THEN
        RAISE EXCEPTION '% is no longer in this sub-department’s team, so no part of it would be paid to them. Reject this request.',
          v_part.staff_name USING ERRCODE = '22023';
      END IF;
      IF EXISTS (SELECT 1 FROM public.comm_salesperson_closes x
                  WHERE x.staff_id = v_part.staff_id AND x.sub_department_id = v_r.sub_department_id
                    AND x.period_month >= v_order.period_month AND x.reopened_at IS NULL) THEN
        RAISE EXCEPTION '%’s % is closed. Reopen it on Comm Cal before giving % a part of this bill.', v_part.staff_name,
          to_char(v_order.period_month, 'Mon YYYY'), v_part.staff_name USING ERRCODE = '22023';
      END IF;
    END LOOP;
    -- Smaller parts first, so a part that shrinks makes room before one that grows (the table's guard refuses any moment
    -- the parts would leave the owner nothing).
    FOR v_part IN
      SELECT y.staff_id, y.share_pct FROM public.sales_order_share_request_parts y
        LEFT JOIN public.sales_order_shares sh ON sh.order_id = v_r.order_id AND sh.staff_id = y.staff_id
       WHERE y.request_id = p_request
       ORDER BY y.share_pct - coalesce(sh.share_pct, 0), y.staff_id
    LOOP
      INSERT INTO public.sales_order_shares (order_id, staff_id, share_pct)
      VALUES (v_r.order_id, v_part.staff_id, v_part.share_pct)
      ON CONFLICT (order_id, staff_id) DO UPDATE SET share_pct = EXCLUDED.share_pct;
    END LOOP;
    UPDATE public.sales_order_share_requests
       SET status = 'approved', updated_at = now(), decided_at = now(), decided_by = v_me, decided_by_name = v_who,
           decision_note = v_note
     WHERE id = p_request;
    INSERT INTO public.sales_order_share_request_events (request_id, step, actor_id, actor_name, note)
    VALUES (p_request, 'approved', v_me, v_who, v_note);
  ELSE
    UPDATE public.sales_order_share_requests
       SET status = 'rejected', updated_at = now(), decided_at = now(), decided_by = v_me, decided_by_name = v_who,
           decision_note = v_note
     WHERE id = p_request;
    INSERT INTO public.sales_order_share_request_events (request_id, step, actor_id, actor_name, note)
    VALUES (p_request, 'rejected', v_me, v_who, v_note);
  END IF;

  BEGIN
    v_users := ARRAY(SELECT s.user_id FROM public.hr_staff_costs s WHERE s.id = v_r.owner_staff_id)
            || ARRAY(SELECT s.user_id FROM public.sales_order_share_request_parts y JOIN public.hr_staff_costs s ON s.id = y.staff_id
                      WHERE y.request_id = p_request);
    IF p_approve THEN
      SELECT string_agg(h.name || ' ' || regexp_replace(to_char(round(h.pct * 100, 2), 'FM990.00'), '\.?0+$', '') || '%', ' · '
                        ORDER BY h.owner DESC, h.name) INTO v_line
        FROM (SELECT coalesce(s.employee_name, '') AS name,
                     1 - coalesce((SELECT sum(sh.share_pct) FROM public.sales_order_shares sh
                                    WHERE sh.order_id = so.id AND sh.staff_id IS DISTINCT FROM so.staff_id), 0) AS pct, true AS owner
                FROM public.sales_orders so LEFT JOIN public.hr_staff_costs s ON s.id = so.staff_id WHERE so.id = v_r.order_id
              UNION ALL
              SELECT coalesce(s.employee_name, ''), sh.share_pct, false
                FROM public.sales_order_shares sh JOIN public.sales_orders so ON so.id = sh.order_id
                LEFT JOIN public.hr_staff_costs s ON s.id = sh.staff_id
               WHERE sh.order_id = v_r.order_id AND sh.staff_id IS DISTINCT FROM so.staff_id) h;
      PERFORM public.notify_people(v_users, 'share', v_r.order_no || ' · shared',
        'HR approved: ' || coalesce(v_line, '') || '. Each part counts in its holder’s sales and commission.',
        'share_request', p_request::text);
    ELSE
      PERFORM public.notify_people(v_users, 'share', v_r.order_no || ' · share request rejected',
        'HR: “' || left(v_note, 300) || '”', 'share_request', p_request::text);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'revenue_share_request_decide: nobody was told of % (%)', v_r.order_no, SQLERRM;
  END;
  RETURN public.share_requests_json(ARRAY[p_request], NULL) -> 0;
END
$fn$;

-- The guard the scan reads (tab-write-guards.test.ts): the decision asks the month's page in the database, as the app's gate
-- in front of it does (requireActionOn('/revenue/[sub]/[period]', 'revenue', 'edit')). The body above carries it already;
-- this only checks it is there.
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

SELECT pg_temp.tab_guard('public.revenue_share_request_decide(uuid, boolean, text)',
  $$ARRAY['/revenue/[sub]/[period]']$$, ARRAY['revenue.edit']);

REVOKE ALL ON FUNCTION public.member_share_order_context(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.member_share_order_send(uuid, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.member_share_order_answer(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.member_share_order_cancel(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.member_share_requests(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revenue_share_requests(uuid, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revenue_share_request_decide(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_share_order_context(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.member_share_order_send(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.member_share_order_answer(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.member_share_order_cancel(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.member_share_requests(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revenue_share_requests(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revenue_share_request_decide(uuid, boolean, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
