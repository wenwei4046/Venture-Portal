-- ════════════════════════════════════════════════════════════════════════════
-- HOUZS Venture's own share of the directors' CTC (2026-10-13)
-- ════════════════════════════════════════════════════════════════════════════
-- The user, on Director Salary's Pool Breakdown (Billing): "i want add on houzs
-- venture itself in this as well. but when press save, once detech venture
-- itself got pay, will need to select the amount is deduct from which
-- department. then can pick more than 2 department as well, by amount or
-- percentage from the total amount. then confirm so that finance will get the
-- submittion to make the inter transfer fund." — and: "that fund can be select
-- from all department pay. so make sure all department, can be seleceted".
--
-- The Pool Breakdown is what each subsidiary pays for the directors
-- (director_ctc → the director_attribution invoices that fund the Director
-- pool). HOUZS Venture pays a share of its own, and nobody invoices HV: its
-- departments pay it, out of their pools, into the Director pool.
--
--   director_hv_shares       one row a month: HV's Basic / KPI / Allowance, its
--                            employer statutory (JADUAL, as director_ctc —
--                            compute_director_ctc_total, one head, or keyed by
--                            hand), the total, and where the submission stands:
--                            with_finance → transferred.
--   director_hv_share_lines  the departments that pay it — any department, by
--                            amount or by a percentage of the total; the lines
--                            add up to the total to the sen (a percentage's
--                            rounding goes to its biggest line,
--                            lib/director-hv-share.ts the same).
--
-- HR saves both with the grid (director_hv_share_save, Director Salary · Edit);
-- a month's share with nothing in it is no share. Finance's Transfer
-- (director_hv_share_transfer, Treasury · Create, on Payments › Dept Requests)
-- writes, for each paying department but the Director department itself,
-- exactly what an inter-billing done by hand writes today (HV-OR-202610-0518 is
-- one): an invoice billable to that department's pool in director_attribution,
-- dated the payroll month's last day — the salary's P&L month — issued with
-- its two journals (Director: Dr AR - Internal / Cr 5050 Salary Income; the
-- department: Dr 9030 Salary Expense / Cr AR - Internal), then received by
-- netting on the transfer date: no bank, the department's pool down
-- (inter_billing_out), the Director pool up (np_in), both "PV HV-OR-…:", with
-- the primary (Director, AR) and mirror (the department, 9030) source rows the
-- reports read. A Director line moves nothing: the Director pool bears it.
-- Undo (director_hv_share_undo, Treasury · Void, same page) takes it all back
-- the way a receipt's Void and an issued invoice's Void do — the pool rows
-- reversed (reverse_voucher_pool_rows), the invoice journals reversed in
-- pairs — and the share is with Finance again, open for HR to change.
--
-- Nothing reads or writes the two tables but these functions (RLS on, no
-- policy, no client grants — as Hiring's): the grid reads its month with
-- director_hv_share_of (Director Salary · View), Finance's list with
-- director_hv_share_queue (Treasury · View). The transfer and its undo ask
-- Dept Requests' page first (tab_write_guard, by pg_temp.tab_guard as mig
-- 20261011220100 does).
--
-- Rollback, in words (the database tool refuses the keyword): take away the
-- seven functions this file creates and the two tables with their lines in
-- audit_tables. Nothing else changes.
-- ════════════════════════════════════════════════════════════════════════════

-- The page's guard at the top of a body (mig 20261011220100's helpers, as they are).
CREATE OR REPLACE FUNCTION pg_temp.tab_guard_put(p_sig text, p_guard text)
RETURNS void
LANGUAGE plpgsql
AS $g$
DECLARE
  v_oid oid := p_sig::regprocedure;
  v_src text;
  v_def text;
  v_at  integer;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = v_oid;
  IF position(p_guard IN v_src) > 0 THEN
    RETURN;
  END IF;
  IF position('tab_write_guard' IN v_src) > 0 THEN
    RAISE EXCEPTION '% already asks other pages — change that guard with swap_check', p_sig;
  END IF;
  v_at := regexp_instr(v_src, '\mBEGIN\M', 1, 1, 1, 'i');
  IF v_at = 0 THEN
    RAISE EXCEPTION '% has no BEGIN', p_sig;
  END IF;
  v_def := pg_get_functiondef(v_oid);
  IF length(v_def) - length(replace(v_def, v_src, '')) <> length(v_src) THEN
    RAISE EXCEPTION '% — its body is not in its definition exactly once', p_sig;
  END IF;
  EXECUTE replace(v_def, v_src, left(v_src, v_at - 1) || E'\n  ' || p_guard || substr(v_src, v_at));
END
$g$;

CREATE OR REPLACE FUNCTION pg_temp.tab_guard(p_sig text, p_pages text, p_wants text[])
RETURNS void
LANGUAGE plpgsql
AS $g$
BEGIN
  PERFORM pg_temp.tab_guard_put(p_sig, format('PERFORM public.tab_write_guard(%s, ARRAY[%s]);', p_pages,
    array_to_string(ARRAY(SELECT quote_literal(w) FROM unnest(p_wants) w), ', ')));
END
$g$;

-- ── 1. Tables ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.director_hv_shares (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month    date          NOT NULL UNIQUE,
  -- As director_ctc: the components HR keys, the employer statutory the
  -- trigger looks up from Basic + KPI (or keeps, keyed by hand), the total.
  basic           numeric(15,2) NOT NULL DEFAULT 0,
  kpi             numeric(15,2) NOT NULL DEFAULT 0,
  allowance       numeric(15,2) NOT NULL DEFAULT 0,
  employer_epf    numeric(15,2),
  employer_socso  numeric(15,2),
  employer_eis    numeric(15,2),
  total_ctc       numeric(15,2),
  heads           integer       NOT NULL DEFAULT 1,
  er_manual       boolean       NOT NULL DEFAULT false,
  -- How HR split it: by amount, or by a percentage of the total.
  split_mode      text          NOT NULL DEFAULT 'amount',
  status          text          NOT NULL DEFAULT 'with_finance',
  submitted_by    uuid          REFERENCES public.users (id),
  submitted_at    timestamptz   NOT NULL DEFAULT now(),
  transferred_by  uuid          REFERENCES public.users (id),
  transferred_at  timestamptz,
  transfer_date   date,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT director_hv_shares_month CHECK (extract(day FROM period_month) = 1),
  CONSTRAINT director_hv_shares_amounts CHECK (basic >= 0 AND kpi >= 0 AND allowance >= 0),
  CONSTRAINT director_hv_shares_heads CHECK (heads >= 1),
  CONSTRAINT director_hv_shares_split_mode CHECK (split_mode IN ('amount', 'percent')),
  CONSTRAINT director_hv_shares_status CHECK (status IN ('with_finance', 'transferred')),
  CONSTRAINT director_hv_shares_transferred CHECK (
    (status = 'transferred') = (transferred_at IS NOT NULL AND transfer_date IS NOT NULL))
);

COMMENT ON TABLE public.director_hv_shares IS
  'HOUZS Venture''s own share of the directors'' CTC for a month (2026-10-13) — the Pool Breakdown''s HV row. Nobody invoices HV: the departments in director_hv_share_lines pay it into the Director pool when Finance transfers it (director_hv_share_transfer). Read and written only by the director_hv_share_* functions.';

CREATE TABLE IF NOT EXISTS public.director_hv_share_lines (
  id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id       uuid          NOT NULL REFERENCES public.director_hv_shares (id) ON DELETE CASCADE,
  line_no        integer       NOT NULL,
  department_id  uuid          NOT NULL REFERENCES public.departments (id),
  amount         numeric(15,2) NOT NULL,
  -- The percentage HR typed, when the split was by percentage.
  pct            numeric(9,4),
  -- What Finance's transfer wrote for this department (NULL for the Director
  -- department, which moves nothing, and until the transfer).
  invoice_id     uuid          REFERENCES public.invoices (id),
  voucher_id     uuid          REFERENCES public.payment_vouchers (id),
  CONSTRAINT director_hv_share_lines_amount CHECK (amount > 0),
  CONSTRAINT director_hv_share_lines_pct CHECK (pct IS NULL OR (pct > 0 AND pct <= 100)),
  CONSTRAINT director_hv_share_lines_department UNIQUE (share_id, department_id),
  CONSTRAINT director_hv_share_lines_line_no UNIQUE (share_id, line_no)
);

COMMENT ON TABLE public.director_hv_share_lines IS
  'Which departments pay HOUZS Venture''s share of the directors'' CTC (director_hv_shares), and how much — they add up to its total. Every department may pay; the Director department''s own line moves nothing.';

CREATE INDEX IF NOT EXISTS director_hv_share_lines_invoice ON public.director_hv_share_lines (invoice_id);
CREATE INDEX IF NOT EXISTS director_hv_share_lines_voucher ON public.director_hv_share_lines (voucher_id);

-- The employer statutory and the total, as director_ctc's (the same function):
-- only when a figure changes, never when the status moves.
CREATE OR REPLACE TRIGGER trg_director_hv_shares_total
  BEFORE INSERT OR UPDATE OF basic, kpi, allowance, heads, er_manual, employer_epf, employer_socso, employer_eis
  ON public.director_hv_shares
  FOR EACH ROW EXECUTE FUNCTION public.compute_director_ctc_total();

CREATE OR REPLACE TRIGGER trg_director_hv_shares_updated_at
  BEFORE UPDATE ON public.director_hv_shares
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.director_hv_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.director_hv_share_lines ENABLE ROW LEVEL SECURITY;

-- No client grants: the functions below are the way in.
REVOKE ALL ON public.director_hv_shares, public.director_hv_share_lines FROM PUBLIC, anon, authenticated;

SELECT public.audit_register('director_hv_shares', 'HOUZS Venture director share', 'Directors', '{director_salary,treasury}', 'all',
  p_labels => '{period_month,status}',
  p_salary => '{basic,kpi,allowance,employer_epf,employer_socso,employer_eis,total_ctc}');
SELECT public.audit_register('director_hv_share_lines', 'HOUZS Venture director share — departments', 'Directors', '{director_salary,treasury}', 'all',
  p_labels => '{share_id,department_id}');

-- ── 2. Helpers (only the functions below call them) ─────────────────────────

-- Every department, the one list HR picks from ("make sure all department can
-- be selected"): the Director department too (its line stays in its pool), and
-- Venture Office, HV's own.
CREATE OR REPLACE FUNCTION public.director_hv_share_departments()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'internal', d.is_internal)
                            ORDER BY d.is_internal, d.name), '[]'::jsonb)
    FROM public.departments d
$fn$;

-- A share as the pages read it. Finance's list leaves out the components (the
-- total is what moves); HR's grid reads them.
CREATE OR REPLACE FUNCTION public.director_hv_share_json(p_share_id uuid, p_components boolean)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
  SELECT jsonb_build_object(
           'id', s.id,
           'period_month', s.period_month,
           'total_ctc', s.total_ctc,
           'split_mode', s.split_mode,
           'status', s.status,
           'submitted_at', s.submitted_at,
           'submitted_by', su.name,
           'transferred_at', s.transferred_at,
           'transfer_date', s.transfer_date,
           'transferred_by', tu.name,
           'lines', coalesce((
             SELECT jsonb_agg(jsonb_build_object(
                      'department_id', l.department_id,
                      'department', d.name,
                      -- The Director department's own line: the Director pool bears it, nothing moves.
                      'stays', (d.segment_key = 'director' AND NOT d.is_internal),
                      'amount', l.amount,
                      'pct', l.pct,
                      'invoice_id', l.invoice_id,
                      'invoice_no', i.invoice_no,
                      'voucher_id', l.voucher_id,
                      'voucher_no', v.voucher_no) ORDER BY l.line_no)
               FROM public.director_hv_share_lines l
               JOIN public.departments d ON d.id = l.department_id
               LEFT JOIN public.invoices i ON i.id = l.invoice_id
               LEFT JOIN public.payment_vouchers v ON v.id = l.voucher_id
              WHERE l.share_id = s.id), '[]'::jsonb))
         || CASE WHEN p_components THEN jsonb_build_object(
              'basic', s.basic,
              'kpi', s.kpi,
              'allowance', s.allowance,
              'employer_epf', s.employer_epf,
              'employer_socso', s.employer_socso,
              'employer_eis', s.employer_eis,
              'er_manual', s.er_manual)
            ELSE '{}'::jsonb END
    FROM public.director_hv_shares s
    LEFT JOIN public.users su ON su.id = s.submitted_by
    LEFT JOIN public.users tu ON tu.id = s.transferred_by
   WHERE s.id = p_share_id
$fn$;

-- ── 3. Reads ────────────────────────────────────────────────────────────────

-- Director Salary's grid: the month's share, and every department to pick from.
CREATE OR REPLACE FUNCTION public.director_hv_share_of(p_period date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF public.has_any_action(ARRAY['director_salary.view', 'director_salary.edit']) IS NOT TRUE THEN
    RAISE EXCEPTION 'director_hv_share_of: needs Director Salary · View' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'departments', public.director_hv_share_departments(),
    'share', (SELECT public.director_hv_share_json(s.id, true)
                FROM public.director_hv_shares s
               WHERE s.period_month = p_period));
END
$fn$;

-- Payments › Dept Requests: the shares waiting for Finance, and the last
-- twelve transferred (their documents, and Undo).
CREATE OR REPLACE FUNCTION public.director_hv_share_queue()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF public.has_any_action(ARRAY['treasury.view', 'treasury.create', 'treasury.void']) IS NOT TRUE THEN
    RAISE EXCEPTION 'director_hv_share_queue: needs Treasury · View' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'pending', coalesce((
      SELECT jsonb_agg(public.director_hv_share_json(s.id, false) ORDER BY s.period_month)
        FROM public.director_hv_shares s
       WHERE s.status = 'with_finance'), '[]'::jsonb),
    'transferred', coalesce((
      SELECT jsonb_agg(t.share ORDER BY t.at DESC)
        FROM (SELECT public.director_hv_share_json(s.id, false) AS share, s.transferred_at AS at
                FROM public.director_hv_shares s
               WHERE s.status = 'transferred'
               ORDER BY s.transferred_at DESC
               LIMIT 12) t), '[]'::jsonb));
END
$fn$;

-- ── 4. HR saves the share (the grid's Save, after the departments window) ────

CREATE OR REPLACE FUNCTION public.director_hv_share_save(
  p_period     date,
  p_basic      numeric,
  p_kpi        numeric,
  p_allowance  numeric,
  p_er_manual  boolean,
  p_epf        numeric,
  p_socso      numeric,
  p_eis        numeric,
  p_split_mode text,
  p_lines      jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid    uuid := auth.uid();
  v_basic  numeric(15,2) := round(coalesce(p_basic, 0), 2);
  v_kpi    numeric(15,2) := round(coalesce(p_kpi, 0), 2);
  v_allow  numeric(15,2) := round(coalesce(p_allowance, 0), 2);
  v_manual boolean := coalesce(p_er_manual, false);
  v_epf    numeric(15,2) := round(coalesce(p_epf, 0), 2);
  v_socso  numeric(15,2) := round(coalesce(p_socso, 0), 2);
  v_eis    numeric(15,2) := round(coalesce(p_eis, 0), 2);
  v_share  public.director_hv_shares%ROWTYPE;
  v_found  boolean;
  v_id     uuid;
  v_total  numeric(15,2);
  v_n      integer;
  v_line   jsonb;
  v_dept   uuid;
  v_depts  uuid[] := '{}';
  v_pcts   numeric[] := '{}';
  v_amts   numeric[] := '{}';
  v_sum    numeric;
  v_big    integer;
  i        integer;
BEGIN
  IF v_uid IS NULL OR public.has_any_action(ARRAY['director_salary.edit']) IS NOT TRUE THEN
    RAISE EXCEPTION 'director_hv_share_save: needs Director Salary · Edit' USING ERRCODE = '42501';
  END IF;
  IF p_period IS NULL OR extract(day FROM p_period) <> 1 THEN
    RAISE EXCEPTION 'A month is its first day, e.g. 2026-10-01';
  END IF;
  IF public.is_period_locked(p_period) THEN
    RAISE EXCEPTION 'The accounting period % is locked', to_char(p_period, 'FMMonth YYYY');
  END IF;
  IF v_basic < 0 OR v_kpi < 0 OR v_allow < 0 OR v_epf < 0 OR v_socso < 0 OR v_eis < 0 THEN
    RAISE EXCEPTION 'HOUZS Venture''s amounts cannot be below zero';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('director_hv_share:' || p_period::text));
  SELECT * INTO v_share FROM public.director_hv_shares WHERE period_month = p_period FOR UPDATE;
  v_found := FOUND;

  -- Transferred: the grid saved again with the same figures is nothing to do;
  -- different figures wait for Finance's Undo.
  IF v_found AND v_share.status = 'transferred' THEN
    IF v_share.basic = v_basic AND v_share.kpi = v_kpi AND v_share.allowance = v_allow
       AND v_share.er_manual = v_manual
       AND (NOT v_manual OR (v_share.employer_epf = v_epf AND v_share.employer_socso = v_socso
                             AND v_share.employer_eis = v_eis)) THEN
      RETURN jsonb_build_object('status', 'transferred', 'total', v_share.total_ctc);
    END IF;
    RAISE EXCEPTION 'Finance has transferred HOUZS Venture''s share for % — it changes once Finance undoes the transfer',
      to_char(p_period, 'FMMonth YYYY') USING ERRCODE = '23PAY';
  END IF;

  -- Nothing paid by HV this month: no share (its lines go with it).
  IF v_basic + v_kpi + v_allow = 0 THEN
    IF v_found THEN
      DELETE FROM public.director_hv_shares WHERE id = v_share.id;
    END IF;
    RETURN jsonb_build_object('status', 'none', 'total', 0);
  END IF;

  IF p_split_mode IS NULL OR p_split_mode NOT IN ('amount', 'percent') THEN
    RAISE EXCEPTION 'Split HOUZS Venture''s share by amount or by percentage';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Pick the departments HOUZS Venture''s share is deducted from';
  END IF;
  v_n := jsonb_array_length(p_lines);
  IF v_n > 20 THEN
    RAISE EXCEPTION 'At most 20 departments';
  END IF;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    IF coalesce(v_line->>'department_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'Pick a department on every line';
    END IF;
    v_dept := (v_line->>'department_id')::uuid;
    IF NOT EXISTS (SELECT 1 FROM public.departments WHERE id = v_dept) THEN
      RAISE EXCEPTION 'Pick a department on every line';
    END IF;
    IF v_dept = ANY (v_depts) THEN
      RAISE EXCEPTION '% is picked twice', (SELECT name FROM public.departments WHERE id = v_dept);
    END IF;
    v_depts := v_depts || v_dept;
    IF p_split_mode = 'percent' THEN
      IF coalesce(v_line->>'pct', '') !~ '^\d+(\.\d+)?$' THEN
        RAISE EXCEPTION 'Every department needs a percentage';
      END IF;
      v_pcts := v_pcts || round((v_line->>'pct')::numeric, 4);
    ELSE
      IF coalesce(v_line->>'amount', '') !~ '^\d+(\.\d+)?$' THEN
        RAISE EXCEPTION 'Every department needs an amount';
      END IF;
      v_amts := v_amts || round((v_line->>'amount')::numeric, 2);
    END IF;
  END LOOP;

  INSERT INTO public.director_hv_shares AS s (
      period_month, basic, kpi, allowance, er_manual, employer_epf, employer_socso, employer_eis,
      heads, split_mode, status, submitted_by, submitted_at)
  VALUES (p_period, v_basic, v_kpi, v_allow, v_manual, v_epf, v_socso, v_eis,
      1, p_split_mode, 'with_finance', v_uid, now())
  ON CONFLICT (period_month) DO UPDATE
     SET basic = EXCLUDED.basic,
         kpi = EXCLUDED.kpi,
         allowance = EXCLUDED.allowance,
         er_manual = EXCLUDED.er_manual,
         employer_epf = EXCLUDED.employer_epf,
         employer_socso = EXCLUDED.employer_socso,
         employer_eis = EXCLUDED.employer_eis,
         split_mode = EXCLUDED.split_mode,
         status = 'with_finance',
         submitted_by = EXCLUDED.submitted_by,
         submitted_at = now()
  RETURNING s.id, s.total_ctc INTO v_id, v_total;

  IF p_split_mode = 'percent' THEN
    v_sum := 0;
    FOR i IN 1..v_n LOOP
      IF v_pcts[i] <= 0 OR v_pcts[i] > 100 THEN
        RAISE EXCEPTION 'A percentage is more than 0 and at most 100';
      END IF;
      v_sum := v_sum + v_pcts[i];
    END LOOP;
    IF abs(v_sum - 100) > 0.0001 THEN
      RAISE EXCEPTION 'The percentages add up to %, not 100%%', rtrim(rtrim(v_sum::text, '0'), '.') || '%';
    END IF;
    -- Each line its percentage of the total to the sen; what rounding leaves
    -- goes to the biggest percentage (the first of equals).
    v_sum := 0;
    v_big := 1;
    FOR i IN 1..v_n LOOP
      v_amts := v_amts || round(v_total * v_pcts[i] / 100, 2);
      v_sum := v_sum + v_amts[i];
      IF v_pcts[i] > v_pcts[v_big] THEN
        v_big := i;
      END IF;
    END LOOP;
    v_amts[v_big] := v_amts[v_big] + (v_total - v_sum);
    FOR i IN 1..v_n LOOP
      IF v_amts[i] <= 0 THEN
        RAISE EXCEPTION 'A percentage too small for a sen of RM %', to_char(v_total, 'FM999,999,990.00');
      END IF;
    END LOOP;
  ELSE
    v_sum := 0;
    FOR i IN 1..v_n LOOP
      IF v_amts[i] <= 0 THEN
        RAISE EXCEPTION 'Every department pays more than RM 0.00';
      END IF;
      v_sum := v_sum + v_amts[i];
    END LOOP;
    IF v_sum <> v_total THEN
      RAISE EXCEPTION 'The departments add up to RM %, but HOUZS Venture''s total is RM %',
        to_char(v_sum, 'FM999,999,990.00'), to_char(v_total, 'FM999,999,990.00');
    END IF;
  END IF;

  DELETE FROM public.director_hv_share_lines WHERE share_id = v_id;
  FOR i IN 1..v_n LOOP
    INSERT INTO public.director_hv_share_lines (share_id, line_no, department_id, amount, pct)
    VALUES (v_id, i, v_depts[i], v_amts[i], CASE WHEN p_split_mode = 'percent' THEN v_pcts[i] END);
  END LOOP;

  RETURN jsonb_build_object('status', 'with_finance', 'total', v_total, 'amounts', to_jsonb(v_amts));
END
$fn$;

-- ── 5. Finance transfers it ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.director_hv_share_transfer(p_share_id uuid, p_date date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid       uuid := auth.uid();
  v_date      date := coalesce(p_date, (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date);
  v_share     public.director_hv_shares%ROWTYPE;
  v_director  uuid;
  v_inv_date  date;
  v_yyyymm    text;
  v_short     text;
  v_desc      text;
  v_line      record;
  v_inv_no    text;
  v_inv_id    uuid;
  v_ar        text;
  v_seg       gl_segment;
  v_pool      text;
  v_seq       integer;
  v_vno       text;
  v_pv_id     uuid;
  v_rdesc     text;
  v_invoices  text[] := '{}';
  v_receipts  text[] := '{}';
BEGIN
  IF v_uid IS NULL OR public.has_any_action(ARRAY['treasury.create']) IS NOT TRUE THEN
    RAISE EXCEPTION 'director_hv_share_transfer: needs Treasury · Create' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_share FROM public.director_hv_shares WHERE id = p_share_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That HOUZS Venture share is not there any more — HR may have changed it';
  END IF;
  IF v_share.status <> 'with_finance' THEN
    RAISE EXCEPTION 'HOUZS Venture''s share for % is transferred already', to_char(v_share.period_month, 'FMMonth YYYY');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.director_hv_share_lines WHERE share_id = v_share.id)
     OR (SELECT sum(amount) FROM public.director_hv_share_lines WHERE share_id = v_share.id) IS DISTINCT FROM v_share.total_ctc THEN
    RAISE EXCEPTION 'The departments do not add up to HOUZS Venture''s total — HR saves the split again';
  END IF;

  -- The salary's month owns the cost (invoices dated its last day); the money
  -- moves on the transfer date.
  v_inv_date := (v_share.period_month + interval '1 month' - interval '1 day')::date;
  IF public.is_period_locked(v_inv_date) THEN
    RAISE EXCEPTION 'The accounting period % is locked — its invoices are dated %',
      to_char(v_inv_date, 'FMMonth YYYY'), to_char(v_inv_date, 'FMDD Mon YYYY');
  END IF;
  IF public.is_period_locked(v_date) THEN
    RAISE EXCEPTION 'The accounting period % is locked — pick another transfer date', to_char(v_date, 'FMMonth YYYY');
  END IF;

  SELECT id INTO v_director FROM public.departments WHERE segment_key = 'director' AND NOT is_internal LIMIT 1;
  IF v_director IS NULL THEN
    RAISE EXCEPTION 'The Director department is not there';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('director_hv_share_transfer'));

  v_yyyymm := to_char(v_share.period_month, 'YYYYMM');
  v_short := to_char(v_share.period_month, 'Mon') || '''' || to_char(v_share.period_month, 'YY');
  v_desc := 'Director salary — HOUZS Venture''s share, ' || to_char(v_share.period_month, 'FMMonth YYYY');

  FOR v_line IN
    SELECT l.id, l.department_id, l.amount, d.name, d.segment_key
      FROM public.director_hv_share_lines l
      JOIN public.departments d ON d.id = l.department_id
     WHERE l.share_id = v_share.id
     ORDER BY l.line_no
  LOOP
    -- The Director department's own line: the Director pool bears it, nothing moves.
    CONTINUE WHEN v_line.department_id = v_director;

    -- The invoice, numbered as mint_invoice_no numbers one (its lock, its month's next).
    PERFORM pg_advisory_xact_lock(hashtext('hv_invoice_no'));
    SELECT 'HV-INV-' || v_yyyymm || '-' || lpad((coalesce(max(
             (regexp_replace(invoice_no, '^HV-INV-\d{6}-', ''))::int), 0) + 1)::text, 4, '0')
      INTO v_inv_no
      FROM public.invoices
     WHERE invoice_no LIKE 'HV-INV-' || v_yyyymm || '-%';

    INSERT INTO public.invoices (
        invoice_no, period_month, billing_mode, category_code, base_amount, total_amount, status,
        invoice_date, due_date, description, created_by,
        billable_to_type, billable_to_department_id, company_id)
    VALUES (
        v_inv_no, v_share.period_month, 'director_attribution', NULL, v_line.amount, v_line.amount, 'issued',
        v_inv_date, NULL, v_desc, v_uid,
        'dept_pool', v_line.department_id, NULL)
    RETURNING id INTO v_inv_id;

    INSERT INTO public.invoice_lines (invoice_id, line_no, description, amount, category_code)
    VALUES (v_inv_id, 1, 'Director salary (HV share) - ' || v_short, v_line.amount, '5050');

    v_ar := coalesce(public.ar_account_for_invoice(v_inv_id), '3073');
    -- Venture Office has no segment of its own: its slice is 'corporate'.
    v_seg := coalesce(v_line.segment_key, 'corporate')::gl_segment;
    v_pool := 'dept_pool_' || regexp_replace(lower(v_line.name), '\s+', '_', 'g');

    -- Issued, as approveInvoice issues an inter-billing: the Director's income…
    PERFORM public.post_journal_entry(
      v_inv_date,
      'Invoice ' || v_inv_no || ' issued',
      'invoice', v_inv_id, v_uid,
      jsonb_build_array(
        jsonb_build_object('account_code', v_ar, 'debit', v_line.amount, 'description', 'AR — invoice ' || v_inv_no),
        jsonb_build_object('account_code', '5050', 'credit', v_line.amount,
                           'description', 'Director salary (HV share) - ' || v_short)),
      'director'::gl_segment);
    -- …and the paying department's salary cost (5050 → 9030, lib/inter-billing-nature).
    PERFORM public.post_journal_entry(
      v_inv_date,
      'Invoice ' || v_inv_no || ' issued — inter-billing expense (' || v_line.name || ')',
      'invoice', v_inv_id, v_uid,
      jsonb_build_array(
        jsonb_build_object('account_code', '9030', 'debit', v_line.amount,
                           'description', 'Inter-billing (' || v_line.name || ') — by nature'),
        jsonb_build_object('account_code', v_ar, 'credit', v_line.amount,
                           'description', 'AR cleared — inter-billing ' || v_inv_no)),
      v_seg);

    -- Received by netting, as a receipt against it does: the voucher's number
    -- as the receipt form makes one (every voucher counted, the next free).
    SELECT count(*) + 1 INTO v_seq FROM public.payment_vouchers;
    LOOP
      v_vno := 'HV-OR-' || to_char(v_date, 'YYYYMM') || '-' || lpad(v_seq::text, 4, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.payment_vouchers WHERE voucher_no = v_vno);
      v_seq := v_seq + 1;
    END LOOP;
    v_rdesc := 'Settle invoice ' || v_inv_no || ' — ' || v_line.name || ': ' || v_desc;

    INSERT INTO public.payment_vouchers (
        voucher_no, voucher_type, direction, source_pool, target_pool, status, amount,
        payee_name, invoice_id, description, payment_method,
        created_by, approved_by, approved_at, executed_by, executed_at, payment_date)
    VALUES (
        v_vno, 'billing_payment', 'credit', NULL, 'dept_pool_director', 'paid', v_line.amount,
        v_line.name, v_inv_id, v_rdesc, 'netting',
        v_uid, v_uid, now(), v_uid, now(), v_date)
    RETURNING id INTO v_pv_id;
    -- (trg_pv_mark_invoice_paid_on_insert has marked the invoice paid.)

    INSERT INTO public.payment_voucher_sources (voucher_id, pool, amount, account_code)
    VALUES (v_pv_id, 'dept_pool_director', v_line.amount, v_ar);
    INSERT INTO public.payment_voucher_sources (voucher_id, pool, amount, account_code, role)
    VALUES (v_pv_id, v_pool, v_line.amount, '9030', 'mirror');

    INSERT INTO public.dept_pools (department_id, transaction_type, amount, description, created_by)
    VALUES (v_director, 'np_in', v_line.amount, 'PV ' || v_vno || ': ' || v_rdesc, v_uid);
    INSERT INTO public.dept_pools (department_id, transaction_type, amount, description, created_by)
    VALUES (v_line.department_id, 'inter_billing_out', v_line.amount,
            'PV ' || v_vno || ': Inter-billing — ' || v_line.name || ' (settles ' || v_rdesc || ')', v_uid);

    UPDATE public.director_hv_share_lines SET invoice_id = v_inv_id, voucher_id = v_pv_id WHERE id = v_line.id;
    v_invoices := v_invoices || v_inv_no;
    v_receipts := v_receipts || v_vno;
  END LOOP;

  UPDATE public.director_hv_shares
     SET status = 'transferred', transferred_by = v_uid, transferred_at = now(), transfer_date = v_date
   WHERE id = v_share.id;

  INSERT INTO public.access_log (user_id, resource_type, resource_id, action, metadata)
  VALUES (v_uid, 'director_hv_share', v_share.id::text, 'transfer',
          jsonb_build_object('period', v_share.period_month, 'total', v_share.total_ctc, 'date', v_date,
                             'invoices', to_jsonb(v_invoices), 'receipts', to_jsonb(v_receipts)));

  RETURN jsonb_build_object('invoices', to_jsonb(v_invoices), 'receipts', to_jsonb(v_receipts));
END
$fn$;

-- ── 6. …and may take it back ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.director_hv_share_undo(p_share_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid       uuid := auth.uid();
  v_share     public.director_hv_shares%ROWTYPE;
  v_inv_date  date;
  v_line      record;
  v_pv        record;
  v_inv       record;
  v_je        record;
  v_lines     jsonb;
  v_new_id    uuid;
  v_net       numeric;
  v_receipts  text[] := '{}';
  v_invoices  text[] := '{}';
BEGIN
  IF v_uid IS NULL OR public.has_any_action(ARRAY['treasury.void']) IS NOT TRUE THEN
    RAISE EXCEPTION 'director_hv_share_undo: needs Treasury · Void' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_share FROM public.director_hv_shares WHERE id = p_share_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That HOUZS Venture share is not there any more';
  END IF;
  IF v_share.status <> 'transferred' THEN
    RAISE EXCEPTION 'HOUZS Venture''s share for % is not transferred', to_char(v_share.period_month, 'FMMonth YYYY');
  END IF;
  v_inv_date := (v_share.period_month + interval '1 month' - interval '1 day')::date;
  IF public.is_period_locked(v_inv_date) THEN
    RAISE EXCEPTION 'The accounting period % is locked — its invoices cannot be voided', to_char(v_inv_date, 'FMMonth YYYY');
  END IF;

  FOR v_line IN
    SELECT l.id, l.invoice_id, l.voucher_id
      FROM public.director_hv_share_lines l
     WHERE l.share_id = v_share.id AND (l.invoice_id IS NOT NULL OR l.voucher_id IS NOT NULL)
     ORDER BY l.line_no
  LOOP
    -- The receipt, as a receipt's Void: its pool rows reversed (no bank, no
    -- journal — it was netting), then voided. One voided by hand already
    -- reversed its own rows.
    IF v_line.voucher_id IS NOT NULL THEN
      SELECT id, voucher_no, status INTO v_pv FROM public.payment_vouchers WHERE id = v_line.voucher_id FOR UPDATE;
      IF FOUND AND v_pv.status = 'paid' THEN
        PERFORM public.reverse_voucher_pool_rows(v_pv.voucher_no);
        UPDATE public.payment_vouchers SET status = 'voided' WHERE id = v_pv.id AND status = 'paid';
        v_receipts := v_receipts || v_pv.voucher_no::text;
      END IF;
    END IF;

    -- The invoice, as an issued invoice's Void: every journal of it reversed
    -- in a pair, then voided.
    IF v_line.invoice_id IS NOT NULL THEN
      SELECT id, invoice_no, status INTO v_inv FROM public.invoices WHERE id = v_line.invoice_id FOR UPDATE;
      IF FOUND AND v_inv.status <> 'voided' THEN
        FOR v_je IN
          SELECT id, entry_no, segment, transaction_date
            FROM public.journal_entries
           WHERE reference_id = v_inv.id AND is_reversed = false
           ORDER BY entry_no
        LOOP
          SELECT jsonb_agg(jsonb_build_object(
                   'account_code', jl.account_code,
                   'debit', jl.credit,
                   'credit', jl.debit,
                   'description', 'Void - ' || coalesce(jl.description, '')) ORDER BY jl.id)
            INTO v_lines
            FROM public.journal_lines jl
           WHERE jl.entry_id = v_je.id;
          CONTINUE WHEN v_lines IS NULL;
          v_new_id := public.post_journal_entry(
            v_je.transaction_date,
            'Void of ' || v_je.entry_no || ' - invoice ' || v_inv.invoice_no || ' voided: HOUZS Venture share transfer undone',
            'invoice', v_inv.id, v_uid, v_lines, v_je.segment);
          SELECT round(sum(coalesce(debit, 0)) - sum(coalesce(credit, 0)), 2) INTO v_net
            FROM public.journal_lines WHERE entry_id IN (v_je.id, v_new_id);
          IF v_net IS NULL OR v_net <> 0 THEN
            RAISE EXCEPTION 'director_hv_share_undo: % and its reversal do not net to zero (%)', v_je.entry_no, v_net;
          END IF;
          UPDATE public.journal_entries SET is_reversed = true, reversed_by_id = v_new_id WHERE id = v_je.id;
          UPDATE public.journal_entries SET is_reversed = true, reversed_by_id = v_je.id WHERE id = v_new_id;
        END LOOP;
        UPDATE public.invoices
           SET status = 'voided',
               description = coalesce(description, '') || ' [VOIDED: HOUZS Venture share transfer undone]'
         WHERE id = v_inv.id;
        v_invoices := v_invoices || v_inv.invoice_no::text;
      END IF;
    END IF;

    UPDATE public.director_hv_share_lines SET invoice_id = NULL, voucher_id = NULL WHERE id = v_line.id;
  END LOOP;

  UPDATE public.director_hv_shares
     SET status = 'with_finance', transferred_by = NULL, transferred_at = NULL, transfer_date = NULL
   WHERE id = v_share.id;

  INSERT INTO public.access_log (user_id, resource_type, resource_id, action, metadata)
  VALUES (v_uid, 'director_hv_share', v_share.id::text, 'undo',
          jsonb_build_object('period', v_share.period_month, 'total', v_share.total_ctc,
                             'invoices', to_jsonb(v_invoices), 'receipts', to_jsonb(v_receipts)));

  RETURN jsonb_build_object('invoices', to_jsonb(v_invoices), 'receipts', to_jsonb(v_receipts));
END
$fn$;

-- ── 7. Who may call what ─────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.director_hv_share_departments() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.director_hv_share_json(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.director_hv_share_departments() TO service_role;
GRANT EXECUTE ON FUNCTION public.director_hv_share_json(uuid, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.director_hv_share_of(date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.director_hv_share_queue() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.director_hv_share_save(date, numeric, numeric, numeric, boolean, numeric, numeric, numeric, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.director_hv_share_transfer(uuid, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.director_hv_share_undo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.director_hv_share_of(date), public.director_hv_share_queue(),
  public.director_hv_share_save(date, numeric, numeric, numeric, boolean, numeric, numeric, numeric, text, jsonb),
  public.director_hv_share_transfer(uuid, date), public.director_hv_share_undo(uuid)
  TO authenticated, service_role;

-- The transfer and its undo ask Dept Requests' page first (as mig 20261011220100's).
SELECT pg_temp.tab_guard('public.director_hv_share_transfer(uuid, date)',
  $$ARRAY['/payments/dept-requests']$$, ARRAY['treasury.create']);
SELECT pg_temp.tab_guard('public.director_hv_share_undo(uuid)',
  $$ARRAY['/payments/dept-requests']$$, ARRAY['treasury.void']);

-- ── Guards ──────────────────────────────────────────────────────────────────

DO $guard$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY['public.director_hv_share_of(date)', 'public.director_hv_share_queue()',
                              'public.director_hv_share_save(date, numeric, numeric, numeric, boolean, numeric, numeric, numeric, text, jsonb)',
                              'public.director_hv_share_transfer(uuid, date)', 'public.director_hv_share_undo(uuid)',
                              'public.director_hv_share_departments()', 'public.director_hv_share_json(uuid, boolean)'] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '%: the publishable key may call it', v_fn;
    END IF;
  END LOOP;
  IF has_function_privilege('authenticated', 'public.director_hv_share_json(uuid, boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.director_hv_share_departments()', 'EXECUTE') THEN
    RAISE EXCEPTION 'the share''s helpers are for its functions only';
  END IF;
  IF position('tab_write_guard' IN (SELECT prosrc FROM pg_proc WHERE oid = 'public.director_hv_share_transfer(uuid, date)'::regprocedure)) = 0
     OR position('tab_write_guard' IN (SELECT prosrc FROM pg_proc WHERE oid = 'public.director_hv_share_undo(uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'the transfer and its undo ask their page first';
  END IF;
  IF has_table_privilege('authenticated', 'public.director_hv_shares', 'SELECT')
     OR has_table_privilege('authenticated', 'public.director_hv_share_lines', 'SELECT') THEN
    RAISE EXCEPTION 'the share''s tables are read through its functions only';
  END IF;
END
$guard$;
