-- ════════════════════════════════════════════════════════════════════════════
-- HOUZS Venture's director share is PAYROLL, paid by its departments (2026-10-13)
-- ════════════════════════════════════════════════════════════════════════════
-- 20261013170000 sent the share to Finance, who moved it from the departments'
-- pools into the Director pool as an inter-billing (an invoice and a receipt by
-- netting a department). The user, the same day: "应该是直接转出去，就是 payout
-- 出去 payroll 才对 我刚才讲错了，不是转入 direct pool，而是直接变成 payroll。
-- 当然，这个 payroll 是由正常的 HR payroll 那边去进行，它不会去到 finance 那边" —
-- and, shown October's RM 100,000 of directors' pay (RM 85,000 billed to the
-- subsidiaries, RM 15,000 HV's: Marketing 50% / Revenue 30% / Venture Office
-- 15% / Director 5%), picked "对，就是这样": the payroll's funding reads
-- Director pool RM 85,750 · Marketing RM 7,500 · Revenue RM 4,500 · Venture
-- Office RM 2,250, no invoice, no transfer, and each department's part of the
-- salary on its own P&L.
--
-- So the share rides the directors' payroll:
--   • HR saves it as before (director_hv_share_save); it is OPEN until the
--     month's directors go to Finance in a payroll batch (HR › Payroll's Submit
--     to Finance), which CARRIES it (status in_payroll, batch_id — the trigger
--     on the batch's funding request). Carried, it is locked; Finance sending
--     that batch back opens it again (the trigger on the batch's status).
--     While the month's directors are with Finance and nothing carries it, it
--     cannot be added or changed — it would ride no batch.
--   • The batch's funding breakdown (get_payroll_breakdown_by_pool → the new
--     payroll_batch_pool_parts) asks each department HR picked for its part
--     and the Director pool for that much less — what Finance's funding PV
--     defaults to, so approving it drains those pools (Venture Office's too:
--     apply_pool_adjustment now finds a department with no segment by its name,
--     dept_pool_venture_office).
--   • The batch's accrual JVs (payroll_batch_accrual_sums → the new
--     payroll_batch_segment_sums) put each department's part of the directors'
--     figures in its own segment — its CTC exactly what HR gave it, every other
--     figure in the same proportion, its net what keeps the JV balanced — and
--     leave the rest in the director segment. Venture Office's is corporate.
--   • The Director department's own line moves nothing: the Director pool and
--     the director segment keep it.
--
-- Gone: the transfer, its undo and Finance's list (director_hv_share_transfer,
-- _undo, _queue) and the columns that held their documents. Production had no
-- share when this was written (checked 2026-10-13); the file refuses a
-- transferred one.
--
-- Production's bodies, one statement swapped each (read off pg_proc on
-- 2026-10-13; the swap refuses if production changed since):
--   get_payroll_breakdown_by_pool   2aa983c9b754c3757ebaf895c65d3abc
--   payroll_batch_accrual_sums      3e911acea1d3d123f28044312c42b2cc
--   apply_pool_adjustment           d56823837d79e886393ce7b30056d66f
--
-- Rollback, in words (the database tool refuses the keyword): put the three
-- statements back as they were (the md5s above), take away the two triggers,
-- their functions, payroll_batch_pool_parts and payroll_batch_segment_sums, and
-- re-apply 20261013170000's director_hv_share_* functions over its columns.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 0. Production's bodies, as this file was written against them ─────────

DO $guard$
BEGIN
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.get_payroll_breakdown_by_pool(uuid)'::regprocedure))
       <> '2aa983c9b754c3757ebaf895c65d3abc'
     AND position('payroll_batch_pool_parts' IN (SELECT prosrc FROM pg_proc WHERE oid = 'public.get_payroll_breakdown_by_pool(uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'get_payroll_breakdown_by_pool changed on production since this file was written';
  END IF;
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.payroll_batch_accrual_sums(uuid)'::regprocedure))
       <> '3e911acea1d3d123f28044312c42b2cc'
     AND position('payroll_batch_segment_sums' IN (SELECT prosrc FROM pg_proc WHERE oid = 'public.payroll_batch_accrual_sums(uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'payroll_batch_accrual_sums changed on production since this file was written';
  END IF;
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.apply_pool_adjustment(text, text, numeric, text, uuid, uuid, timestamptz, uuid)'::regprocedure))
       <> 'd56823837d79e886393ce7b30056d66f'
     AND position('segment_key IS NULL AND' IN (SELECT prosrc FROM pg_proc WHERE oid = 'public.apply_pool_adjustment(text, text, numeric, text, uuid, uuid, timestamptz, uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'apply_pool_adjustment changed on production since this file was written';
  END IF;
  IF EXISTS (SELECT 1 FROM public.director_hv_shares WHERE status = 'transferred') THEN
    RAISE EXCEPTION 'A HOUZS Venture share was transferred by Finance — undo it before this migration';
  END IF;
END
$guard$;

-- One statement of a production body swapped for another (whitespace-blind,
-- exactly once — as mig 20261013030000's).
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

-- ─── 1. The share's own tables: carried by a batch, not transferred ─────────

ALTER TABLE public.director_hv_shares DROP CONSTRAINT IF EXISTS director_hv_shares_transferred;
ALTER TABLE public.director_hv_shares DROP CONSTRAINT IF EXISTS director_hv_shares_status;
UPDATE public.director_hv_shares SET status = 'open' WHERE status = 'with_finance';
ALTER TABLE public.director_hv_shares
  ALTER COLUMN status SET DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES public.payroll_batches (id),
  ADD CONSTRAINT director_hv_shares_status CHECK (status IN ('open', 'in_payroll')),
  ADD CONSTRAINT director_hv_shares_carried CHECK ((status = 'in_payroll') = (batch_id IS NOT NULL));
ALTER TABLE public.director_hv_shares
  DROP COLUMN IF EXISTS transferred_by,
  DROP COLUMN IF EXISTS transferred_at,
  DROP COLUMN IF EXISTS transfer_date;
CREATE INDEX IF NOT EXISTS director_hv_shares_batch ON public.director_hv_shares (batch_id);

ALTER TABLE public.director_hv_share_lines
  DROP COLUMN IF EXISTS invoice_id,
  DROP COLUMN IF EXISTS voucher_id;

COMMENT ON TABLE public.director_hv_shares IS
  'HOUZS Venture''s own share of the directors'' CTC for a month (2026-10-13) — the Pool Breakdown''s HV row. Nobody invoices HV: the departments in director_hv_share_lines pay it as payroll — the payroll batch that carries the month''s directors (batch_id, status in_payroll) asks their pools for it and books it in their segments. Read and written only by the director_hv_share_* functions and the batch triggers.';
COMMENT ON TABLE public.director_hv_share_lines IS
  'Which departments pay HOUZS Venture''s share of the directors'' CTC (director_hv_shares), and how much — they add up to its total. Every department may pay; the Director department''s own line moves nothing.';

-- Finance's transfer, its undo and its list are gone (20261013170000's).
DROP FUNCTION IF EXISTS public.director_hv_share_transfer(uuid, date);
DROP FUNCTION IF EXISTS public.director_hv_share_undo(uuid);
DROP FUNCTION IF EXISTS public.director_hv_share_queue();

-- ─── 2. How the pages read a share ──────────────────────────────────────────

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
           'batch_id', s.batch_id,
           'batch_no', b.batch_no,
           'batch_submitted_at', b.submitted_at,
           'lines', coalesce((
             SELECT jsonb_agg(jsonb_build_object(
                      'department_id', l.department_id,
                      'department', d.name,
                      -- The Director department's own line: the Director pool bears it, nothing moves.
                      'stays', (d.segment_key IS NOT DISTINCT FROM 'director' AND NOT d.is_internal),
                      'amount', l.amount,
                      'pct', l.pct) ORDER BY l.line_no)
               FROM public.director_hv_share_lines l
               JOIN public.departments d ON d.id = l.department_id
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
    LEFT JOIN public.payroll_batches b ON b.id = s.batch_id
   WHERE s.id = p_share_id
$fn$;

-- ─── 3. HR saves it — not while a batch carries it, nor once the directors went without it ──

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
  v_batch  integer;
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

  -- Carried by a payroll batch: the grid saved again with the same figures is
  -- nothing to do; different figures wait for Finance to send that batch back.
  IF v_found AND v_share.status = 'in_payroll' THEN
    IF v_share.basic = v_basic AND v_share.kpi = v_kpi AND v_share.allowance = v_allow
       AND v_share.er_manual = v_manual
       AND (NOT v_manual OR (v_share.employer_epf = v_epf AND v_share.employer_socso = v_socso
                             AND v_share.employer_eis = v_eis)) THEN
      RETURN jsonb_build_object('status', 'in_payroll', 'total', v_share.total_ctc);
    END IF;
    SELECT batch_no INTO v_batch FROM public.payroll_batches WHERE id = v_share.batch_id;
    RAISE EXCEPTION 'HOUZS Venture''s share for % went to Finance with payroll batch #% — it changes once that batch is sent back',
      to_char(p_period, 'FMMonth YYYY'), v_batch USING ERRCODE = '23PAY';
  END IF;

  -- Nothing paid by HV this month: no share (its lines go with it).
  IF v_basic + v_kpi + v_allow = 0 THEN
    IF v_found THEN
      DELETE FROM public.director_hv_shares WHERE id = v_share.id;
    END IF;
    RETURN jsonb_build_object('status', 'none', 'total', 0);
  END IF;

  -- The month's directors went to Finance without it: no batch would carry it.
  IF EXISTS (SELECT 1 FROM public.director_monthly_payroll
              WHERE period_month = p_period AND status IN ('submitted', 'paid')) THEN
    RAISE EXCEPTION 'The directors of % are with Finance already — HOUZS Venture''s share goes with them, so their batch is sent back first',
      to_char(p_period, 'FMMonth YYYY') USING ERRCODE = '23PAY';
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
      1, p_split_mode, 'open', v_uid, now())
  ON CONFLICT (period_month) DO UPDATE
     SET basic = EXCLUDED.basic,
         kpi = EXCLUDED.kpi,
         allowance = EXCLUDED.allowance,
         er_manual = EXCLUDED.er_manual,
         employer_epf = EXCLUDED.employer_epf,
         employer_socso = EXCLUDED.employer_socso,
         employer_eis = EXCLUDED.employer_eis,
         split_mode = EXCLUDED.split_mode,
         status = 'open',
         batch_id = NULL,
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

  RETURN jsonb_build_object('status', 'open', 'total', v_total, 'amounts', to_jsonb(v_amts));
END
$fn$;

-- ─── 4. The batch that carries the month's directors carries the share ──────

-- When a payroll batch's funding request is filed (payroll_submit_batch), the
-- batch carries the month's open share if it carries the month's directors —
-- their first send, not a resubmit's difference. The departments' part may not
-- be more than the directors' CTC in the batch.
CREATE OR REPLACE FUNCTION public.director_hv_share_follows_batch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_period    date;
  v_directors numeric;
  v_share     public.director_hv_shares%ROWTYPE;
  v_moved     numeric;
BEGIN
  IF NEW.batch_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT period_month INTO v_period FROM public.payroll_batches WHERE id = NEW.batch_id;
  SELECT sum(ctc) INTO v_directors
    FROM public.payroll_batch_lines
   WHERE batch_id = NEW.batch_id AND bucket = 'director' AND NOT is_topup;
  IF coalesce(v_directors, 0) <= 0 THEN
    RETURN NEW;
  END IF;
  SELECT * INTO v_share FROM public.director_hv_shares
   WHERE period_month = v_period AND status = 'open' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;
  SELECT coalesce(sum(l.amount), 0) INTO v_moved
    FROM public.director_hv_share_lines l
    JOIN public.departments d ON d.id = l.department_id
   WHERE l.share_id = v_share.id AND (d.segment_key IS DISTINCT FROM 'director' OR d.is_internal);
  IF v_moved > v_directors THEN
    RAISE EXCEPTION 'HOUZS Venture''s share puts RM % on its departments — more than the directors'' payroll of RM % in this batch; check the Pool Breakdown on Director Salary',
      to_char(v_moved, 'FM999,999,990.00'), to_char(v_directors, 'FM999,999,990.00') USING ERRCODE = '23PAY';
  END IF;
  UPDATE public.director_hv_shares SET status = 'in_payroll', batch_id = NEW.batch_id WHERE id = v_share.id;
  RETURN NEW;
END
$fn$;

CREATE OR REPLACE TRIGGER trg_director_hv_share_follows_batch
  AFTER INSERT ON public.payroll_payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.director_hv_share_follows_batch();

-- Finance sends the batch back (payroll_send_back_batch): the share is HR's again.
CREATE OR REPLACE FUNCTION public.director_hv_share_back_with_batch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.status = 'sent_back' AND OLD.status IS DISTINCT FROM 'sent_back' THEN
    UPDATE public.director_hv_shares SET status = 'open', batch_id = NULL WHERE batch_id = NEW.id;
  END IF;
  RETURN NEW;
END
$fn$;

CREATE OR REPLACE TRIGGER trg_director_hv_share_back_with_batch
  AFTER UPDATE OF status ON public.payroll_batches
  FOR EACH ROW EXECUTE FUNCTION public.director_hv_share_back_with_batch();

-- ─── 5. What the batch asks each pool for ───────────────────────────────────

-- A row a paying department, as get_payroll_breakdown_by_pool's batch branch
-- always read them — plus, when the batch carries HOUZS Venture's share, each
-- department HR picked for its part, and the Director pool for that much less.
CREATE OR REPLACE FUNCTION public.payroll_batch_pool_parts(p_batch_id uuid)
RETURNS TABLE(pool_key text, dept_name text, required_amount numeric, pool_balance numeric)
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
  WITH director AS (
    SELECT id FROM public.departments WHERE segment_key = 'director' LIMIT 1
  ), hv AS (
    SELECT CASE WHEN d.segment_key IS NOT NULL THEN 'dept_pool_' || d.segment_key
                ELSE 'dept_pool_' || regexp_replace(lower(d.name), '\s+', '_', 'g') END AS pool_key,
           d.name AS dept_name, d.id AS dept_id, hl.amount
      FROM public.director_hv_shares s
      JOIN public.director_hv_share_lines hl ON hl.share_id = s.id
      JOIN public.departments d ON d.id = hl.department_id
     WHERE s.batch_id = p_batch_id
       AND (d.segment_key IS DISTINCT FROM 'director' OR d.is_internal)
  ), parts AS (
    SELECT CASE WHEN l.bucket = 'director' THEN 'dept_pool_director'
                ELSE 'dept_pool_' || coalesce(d.segment_key, l.segment_key) END AS pool_key,
           CASE WHEN l.bucket = 'director' THEN 'Director' ELSE coalesce(d.name, l.department_name) END AS dept_name,
           CASE WHEN l.bucket = 'director' THEN (SELECT id FROM director) ELSE l.department_id END AS dept_id,
           l.ctc AS amount
      FROM public.payroll_batch_lines l
      LEFT JOIN public.departments d ON d.id = l.department_id
     WHERE l.batch_id = p_batch_id
    UNION ALL
    SELECT pool_key, dept_name, dept_id, amount FROM hv
    UNION ALL
    SELECT 'dept_pool_director', 'Director', (SELECT id FROM director), -amount FROM hv
  )
  SELECT p.pool_key::text, p.dept_name::text, sum(p.amount)::DECIMAL(15, 2),
         coalesce((SELECT dpb.balance FROM public.dept_pool_balances dpb WHERE dpb.department_id = p.dept_id), 0)::DECIMAL(15, 2)
    FROM parts p
   GROUP BY p.pool_key, p.dept_name, p.dept_id
  HAVING sum(p.amount) <> 0
   ORDER BY 2
$fn$;

SELECT pg_temp.swap_check('public.get_payroll_breakdown_by_pool(uuid)'::regprocedure,
$old$RETURN QUERY
        SELECT CASE WHEN l.bucket = 'director' THEN 'dept_pool_director'
                    ELSE 'dept_pool_' || coalesce(d.segment_key, l.segment_key) END::TEXT,
               CASE WHEN l.bucket = 'director' THEN 'Director' ELSE coalesce(d.name, l.department_name) END::TEXT,
               sum(l.ctc)::DECIMAL(15, 2),
               coalesce((SELECT dpb.balance FROM dept_pool_balances dpb
                          WHERE dpb.department_id = CASE WHEN l.bucket = 'director'
                                THEN (SELECT id FROM departments WHERE segment_key = 'director' LIMIT 1)
                                ELSE l.department_id END), 0)::DECIMAL(15, 2)
          FROM payroll_batch_lines l
          LEFT JOIN departments d ON d.id = l.department_id
         WHERE l.batch_id = v_batch.id
         GROUP BY 1, 2, l.bucket, l.department_id
        HAVING sum(l.ctc) <> 0
         ORDER BY 2;$old$,
$new$RETURN QUERY
        SELECT * FROM public.payroll_batch_pool_parts(v_batch.id) ORDER BY 2;$new$);

-- ─── 6. What the batch books in each segment ────────────────────────────────

-- The accrual JVs' figures a segment, as payroll_batch_accrual_sums always
-- read them — plus, when the batch carries HOUZS Venture's share, each paying
-- department's part of the directors' figures in its own segment (Venture
-- Office: corporate), taken off the director segment. A part's CTC (gross +
-- employer EPF / SOCSO / EIS) is exactly what HR gave the department; every
-- other figure is the same proportion of the directors', to the sen; its net
-- is what keeps its JV balanced.
CREATE OR REPLACE FUNCTION public.payroll_batch_segment_sums(p_batch_id uuid)
RETURNS TABLE(segment text, gross numeric, non_statutory_allowance numeric, epf_er numeric, epf_ee numeric,
              socso_er numeric, socso_ee numeric, eis_er numeric, eis_ee numeric, pcb numeric,
              withholding_tax numeric, net numeric, skbbk numeric)
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
  WITH dir AS (
    SELECT coalesce(sum(l.ctc), 0) AS ctc,
           coalesce(sum(l.non_statutory_allowance), 0) AS nsa,
           coalesce(sum(l.epf_er), 0) AS epf_er, coalesce(sum(l.epf_ee), 0) AS epf_ee,
           coalesce(sum(l.socso_er), 0) AS socso_er, coalesce(sum(l.socso_ee), 0) AS socso_ee,
           coalesce(sum(l.eis_er), 0) AS eis_er, coalesce(sum(l.eis_ee), 0) AS eis_ee,
           coalesce(sum(l.pcb), 0) AS pcb, coalesce(sum(l.withholding_tax), 0) AS wht,
           coalesce(sum(l.skbbk), 0) AS skbbk
      FROM public.payroll_batch_lines l
     WHERE l.batch_id = p_batch_id AND l.bucket = 'director'
  ), moves AS (
    SELECT coalesce(d.segment_key, 'corporate') AS segment, hl.amount
      FROM public.director_hv_shares s
      JOIN public.director_hv_share_lines hl ON hl.share_id = s.id
      JOIN public.departments d ON d.id = hl.department_id
     WHERE s.batch_id = p_batch_id
       AND (d.segment_key IS DISTINCT FROM 'director' OR d.is_internal)
  ), shares AS (
    SELECT m.segment, m.amount,
           round(dir.epf_er * m.amount / dir.ctc, 2) AS epf_er,
           round(dir.socso_er * m.amount / dir.ctc, 2) AS socso_er,
           round(dir.eis_er * m.amount / dir.ctc, 2) AS eis_er,
           round(dir.nsa * m.amount / dir.ctc, 2) AS nsa,
           round(dir.epf_ee * m.amount / dir.ctc, 2) AS epf_ee,
           round(dir.socso_ee * m.amount / dir.ctc, 2) AS socso_ee,
           round(dir.eis_ee * m.amount / dir.ctc, 2) AS eis_ee,
           round(dir.pcb * m.amount / dir.ctc, 2) AS pcb,
           round(dir.wht * m.amount / dir.ctc, 2) AS wht,
           round(dir.skbbk * m.amount / dir.ctc, 2) AS skbbk
      FROM moves m CROSS JOIN dir
     WHERE dir.ctc > 0
  ), parts AS (
    SELECT segment,
           amount - epf_er - socso_er - eis_er AS gross,
           nsa, epf_er, epf_ee, socso_er, socso_ee, eis_er, eis_ee, pcb, wht, skbbk,
           (amount - epf_er - socso_er - eis_er) - epf_ee - socso_ee - eis_ee - pcb - wht - skbbk AS net
      FROM shares
  ), figures AS (
    SELECT CASE WHEN l.bucket = 'director' THEN 'director' ELSE l.segment_key END AS segment,
           l.gross, l.non_statutory_allowance AS nsa, l.epf_er, l.epf_ee, l.socso_er, l.socso_ee,
           l.eis_er, l.eis_ee, l.pcb, l.withholding_tax AS wht, l.net, l.skbbk
      FROM public.payroll_batch_lines l
     WHERE l.batch_id = p_batch_id
    UNION ALL
    SELECT segment, gross, nsa, epf_er, epf_ee, socso_er, socso_ee, eis_er, eis_ee, pcb, wht, net, skbbk
      FROM parts
    UNION ALL
    SELECT 'director', -gross, -nsa, -epf_er, -epf_ee, -socso_er, -socso_ee, -eis_er, -eis_ee, -pcb, -wht, -net, -skbbk
      FROM parts
  )
  SELECT f.segment::text, sum(f.gross), sum(f.nsa), sum(f.epf_er), sum(f.epf_ee), sum(f.socso_er), sum(f.socso_ee),
         sum(f.eis_er), sum(f.eis_ee), sum(f.pcb), sum(f.wht), sum(f.net), sum(f.skbbk)
    FROM figures f
   GROUP BY f.segment
$fn$;

SELECT pg_temp.swap_check('public.payroll_batch_accrual_sums(uuid)'::regprocedure,
$old$RETURN QUERY
    SELECT CASE WHEN l.bucket = 'director' THEN 'director' ELSE l.segment_key END,
           sum(l.gross), sum(l.non_statutory_allowance), sum(l.epf_er), sum(l.epf_ee),
           sum(l.socso_er), sum(l.socso_ee), sum(l.eis_er), sum(l.eis_ee), sum(l.pcb),
           sum(l.withholding_tax), sum(l.net), sum(l.skbbk)
      FROM payroll_batch_lines l
     WHERE l.batch_id = p_batch_id
     GROUP BY 1;$old$,
$new$RETURN QUERY
    SELECT * FROM public.payroll_batch_segment_sums(p_batch_id);$new$);

-- ─── 7. A department with no segment is still a pool (Venture Office) ───────

SELECT pg_temp.swap_check('public.apply_pool_adjustment(text, text, numeric, text, uuid, uuid, timestamptz, uuid)'::regprocedure,
$old$SELECT id, name INTO v_dept_id, v_dept_name
            FROM departments
            WHERE segment_key = substring(p_pool from 11)
            LIMIT 1;$old$,
$new$SELECT id, name INTO v_dept_id, v_dept_name
            FROM departments
            WHERE segment_key = substring(p_pool from 11)
               OR (segment_key IS NULL AND regexp_replace(lower(name), '\s+', '_', 'g') = substring(p_pool from 11))
            ORDER BY segment_key NULLS LAST
            LIMIT 1;$new$);

-- ─── 8. Who may call what ───────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.director_hv_share_json(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.director_hv_share_json(uuid, boolean) TO service_role;
REVOKE ALL ON FUNCTION public.director_hv_share_save(date, numeric, numeric, numeric, boolean, numeric, numeric, numeric, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.director_hv_share_save(date, numeric, numeric, numeric, boolean, numeric, numeric, numeric, text, jsonb)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.payroll_batch_pool_parts(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.payroll_batch_segment_sums(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.payroll_batch_pool_parts(uuid), public.payroll_batch_segment_sums(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.director_hv_share_follows_batch() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.director_hv_share_back_with_batch() FROM PUBLIC, anon, authenticated;

-- ─── Guards ─────────────────────────────────────────────────────────────────

DO $guard$
DECLARE
  v_fn text;
BEGIN
  IF to_regprocedure('public.director_hv_share_transfer(uuid, date)') IS NOT NULL
     OR to_regprocedure('public.director_hv_share_undo(uuid)') IS NOT NULL
     OR to_regprocedure('public.director_hv_share_queue()') IS NOT NULL THEN
    RAISE EXCEPTION 'the transfer, its undo and its list are gone';
  END IF;
  FOREACH v_fn IN ARRAY ARRAY['public.director_hv_share_of(date)',
                              'public.director_hv_share_save(date, numeric, numeric, numeric, boolean, numeric, numeric, numeric, text, jsonb)',
                              'public.director_hv_share_json(uuid, boolean)', 'public.director_hv_share_departments()',
                              'public.payroll_batch_pool_parts(uuid)', 'public.payroll_batch_segment_sums(uuid)'] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '%: the publishable key may call it', v_fn;
    END IF;
  END LOOP;
  IF has_function_privilege('authenticated', 'public.payroll_batch_pool_parts(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.payroll_batch_segment_sums(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'the batch helpers are for their functions only';
  END IF;
  IF position('payroll_batch_pool_parts' IN (SELECT prosrc FROM pg_proc WHERE oid = 'public.get_payroll_breakdown_by_pool(uuid)'::regprocedure)) = 0
     OR position('payroll_batch_segment_sums' IN (SELECT prosrc FROM pg_proc WHERE oid = 'public.payroll_batch_accrual_sums(uuid)'::regprocedure)) = 0
     OR position('segment_key IS NULL AND' IN (SELECT prosrc FROM pg_proc
          WHERE oid = 'public.apply_pool_adjustment(text, text, numeric, text, uuid, uuid, timestamptz, uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'a swap did not take';
  END IF;
END
$guard$;
