-- 20261025121000_marketing_billing.sql
-- 2026-10-24 — Marketing ②b-2b: billing drafts, Marketing's side (the user's answers 43–48, 50, 51 — spec §7). Finance's
-- one-click import is NOT built: the contracts generator (generate_monthly_invoices) drafts marketing_project invoices
-- today, and the user asks Chew first (answer 48).
--   The amount   mkt_projects.bill_amount — the manager's, typed when the project is made (a quote; the product's list
--                price offered — mkt_product_start, production's body, takes it; mkt_product_picker, production's body,
--                names the price), changed on its page (mkt_project_bill_set) — a one-time project's whole, a recurring
--                one's every month; no SST (answer 45).
--   When         a one-time project once it is done — the month it was done (answer 44); a recurring one every month,
--                fixed, from the month its work starts (mkt_product_begin, production's body, keeps bill_from) — paused
--                months too — to the month the manager presses Stop (mkt_product_stop, bill_until; answer 51). Stopped,
--                it closes once nothing of it is under way (mkt_product_settle, production's body).
--   The client   an outside client's billing name, address (six parts, held whole), phone and email — Marketing's, given
--                when it is added or edited (answer 50: mkt_sub_add re-made with p_bill, mkt_sub_edit production's body
--                with the four keys; mkt_client_bill reads them for its page). A group company is billed as Finance keeps it.
--   Confirmed    the manager confirms a month's lines (mkt_bill_confirm): each kept in mkt_bills as it was confirmed — the
--                amount, its words ("Social Media Management - Oct'26"), who and when — Finance's to import; withdrawn
--                (mkt_bill_withdraw) until then. The page: /marketing/billing (MANAGER TOOLS › 💰), mkt_billing(month).
--   The product page (mkt_product_project, production's body) shows the manager its amount and months.
-- PGlite: tests/member-sql/validate-marketing-billing.mjs.

-- ── The quote, a recurring project's months ─────────────────────────────────────────────────────────────────
-- bill_amount: the manager's amount, typed when the project is made (the product's list price offered) — a one-time
-- project's whole, a recurring one's every month. bill_from / bill_until: a recurring project's first month billed (the
-- month its work started) and its last (the month the manager stopped it); a one-time project is billed the month it
-- was done, and keeps neither.
ALTER TABLE public.mkt_projects ADD COLUMN IF NOT EXISTS bill_amount numeric(15,2);
ALTER TABLE public.mkt_projects ADD COLUMN IF NOT EXISTS bill_from date;
ALTER TABLE public.mkt_projects ADD COLUMN IF NOT EXISTS bill_until date;
ALTER TABLE public.mkt_projects DROP CONSTRAINT IF EXISTS mkt_projects_bill_check;
ALTER TABLE public.mkt_projects ADD CONSTRAINT mkt_projects_bill_check CHECK (
  (bill_amount IS NULL OR (kind = 'product' AND bill_amount > 0))
  AND (bill_from IS NULL OR (kind = 'product' AND extract(day FROM bill_from) = 1))
  AND (bill_until IS NULL OR (bill_from IS NOT NULL AND extract(day FROM bill_until) = 1 AND bill_until >= bill_from)));

-- ── An outside client's billing details (Marketing's own clients; a group company is billed as Finance keeps it) ──
-- bill_address: the portal's six parts held whole — { line1, line2, postcode, city, state, country } (lib/address), as an
-- invoice keeps a typed bill-to's (invoices.billable_to_freetext_address_parts); the page and the Server Action pick and
-- check them against Malaysia's list, the database their shape.
ALTER TABLE public.mkt_subsidiaries ADD COLUMN IF NOT EXISTS bill_name text;
ALTER TABLE public.mkt_subsidiaries ADD COLUMN IF NOT EXISTS bill_address jsonb;
ALTER TABLE public.mkt_subsidiaries ADD COLUMN IF NOT EXISTS bill_phone text;
ALTER TABLE public.mkt_subsidiaries ADD COLUMN IF NOT EXISTS bill_email text;
ALTER TABLE public.mkt_subsidiaries DROP CONSTRAINT IF EXISTS mkt_subsidiaries_bill_check;
ALTER TABLE public.mkt_subsidiaries ADD CONSTRAINT mkt_subsidiaries_bill_check CHECK (
  (company_id IS NULL OR (bill_name IS NULL AND bill_address IS NULL AND bill_phone IS NULL AND bill_email IS NULL))
  AND (bill_name IS NULL OR length(bill_name) BETWEEN 1 AND 120)
  AND (bill_address IS NULL OR jsonb_typeof(bill_address) = 'object')
  AND (bill_phone IS NULL OR length(bill_phone) BETWEEN 1 AND 40)
  AND (bill_email IS NULL OR length(bill_email) BETWEEN 3 AND 200));

-- ── What the manager confirmed — Finance's to import (not built: waits for the user's word with Chew) ──────────────
CREATE TABLE IF NOT EXISTS public.mkt_bills (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid NOT NULL REFERENCES public.mkt_projects(id),
  month          date NOT NULL CHECK (extract(day FROM month) = 1),
  subsidiary_id  uuid NOT NULL REFERENCES public.mkt_subsidiaries(id),
  amount         numeric(15,2) NOT NULL CHECK (amount > 0),
  words          text NOT NULL CHECK (length(words) BETWEEN 1 AND 200),
  status         text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'withdrawn')),
  confirmed_by   uuid REFERENCES public.users(id),
  confirmed_name text NOT NULL CHECK (length(confirmed_name) BETWEEN 1 AND 120),
  confirmed_at   timestamptz NOT NULL DEFAULT now(),
  withdrawn_by   uuid REFERENCES public.users(id),
  withdrawn_name text CHECK (length(withdrawn_name) BETWEEN 1 AND 120),
  withdrawn_at   timestamptz,
  CHECK ((status = 'withdrawn') = (withdrawn_at IS NOT NULL)),
  CHECK ((withdrawn_at IS NULL) = (withdrawn_name IS NULL))
);
-- One standing confirmation a project and month; a withdrawn one stays as it was, beside the next.
CREATE UNIQUE INDEX IF NOT EXISTS mkt_bills_live ON public.mkt_bills (project_id, month) WHERE status = 'confirmed';
CREATE INDEX IF NOT EXISTS mkt_bills_month ON public.mkt_bills (month);
ALTER TABLE public.mkt_bills ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mkt_bills FROM anon, authenticated;
SELECT public.audit_register('mkt_bills', 'Marketing billing', 'Marketing', '{}', 'none',
  p_reason => 'Each confirmation is its own record — who confirmed which project''s month at what amount, and who withdrew it and when; written by mkt_bill_confirm, changed only by its withdrawal');

-- ── A party's billing details, checked and tidied (nobody's to call but the functions below) ──────────────────────
-- In: { name, address, phone, email }, any of them; out: all four, each NULL when empty. The address's six parts are
-- words of their length; nothing of it given (the country alone) is no address.
CREATE OR REPLACE FUNCTION public.mkt_bill_party(p_bill jsonb)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $fn$
DECLARE
  v_in    jsonb := CASE WHEN jsonb_typeof(p_bill) = 'object' THEN p_bill ELSE '{}'::jsonb END;
  v_name  text;
  v_phone text;
  v_email text;
  v_a     jsonb := v_in -> 'address';
  v_addr  jsonb;
  v_k     text;
  v_v     text;
BEGIN
  FOR v_k IN SELECT jsonb_object_keys(v_in) LOOP
    IF v_k NOT IN ('name', 'address', 'phone', 'email') THEN
      RAISE EXCEPTION '"%" is not a billing detail.', v_k USING ERRCODE = '22023';
    END IF;
    IF v_k <> 'address' AND jsonb_typeof(v_in -> v_k) NOT IN ('string', 'null') THEN
      RAISE EXCEPTION 'Not words: %.', v_k USING ERRCODE = '22023';
    END IF;
  END LOOP;
  v_name := nullif(regexp_replace(btrim(coalesce(v_in ->> 'name', '')), '\s+', ' ', 'g'), '');
  IF length(v_name) > 120 THEN
    RAISE EXCEPTION 'A billing name of at most 120 characters.' USING ERRCODE = '22023';
  END IF;
  v_phone := nullif(btrim(coalesce(v_in ->> 'phone', '')), '');
  IF length(v_phone) > 40 OR v_phone !~ '^[+0-9 ()-]+$' THEN
    RAISE EXCEPTION 'A phone number, digits only.' USING ERRCODE = '22023';
  END IF;
  v_email := nullif(btrim(coalesce(v_in ->> 'email', '')), '');
  IF length(v_email) > 200 OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'An email address, like name@company.com.' USING ERRCODE = '22023';
  END IF;
  IF v_a IS NOT NULL AND jsonb_typeof(v_a) <> 'null' THEN
    IF jsonb_typeof(v_a) <> 'object' THEN
      RAISE EXCEPTION 'An address in its parts.' USING ERRCODE = '22023';
    END IF;
    v_addr := '{}'::jsonb;
    FOREACH v_k IN ARRAY ARRAY['line1', 'line2', 'postcode', 'city', 'state', 'country'] LOOP
      IF jsonb_typeof(v_a -> v_k) NOT IN ('string', 'null') THEN
        RAISE EXCEPTION 'Not words: the address''s %.', v_k USING ERRCODE = '22023';
      END IF;
      v_v := regexp_replace(btrim(coalesce(v_a ->> v_k, '')), '\s+', ' ', 'g');
      IF length(v_v) > (CASE WHEN v_k IN ('line1', 'line2') THEN 200 ELSE 80 END) THEN
        RAISE EXCEPTION 'The address''s % is too long.', v_k USING ERRCODE = '22023';
      END IF;
      v_addr := v_addr || jsonb_build_object(v_k, v_v);
    END LOOP;
    IF concat(v_addr ->> 'line1', v_addr ->> 'line2', v_addr ->> 'postcode', v_addr ->> 'city', v_addr ->> 'state') = '' THEN
      v_addr := NULL;
    ELSE
      IF v_addr ->> 'line1' = '' THEN
        RAISE EXCEPTION 'Fill in address line 1.' USING ERRCODE = '22023';
      END IF;
      IF v_addr ->> 'country' = '' THEN
        v_addr := v_addr || '{"country": "Malaysia"}'::jsonb;
      END IF;
    END IF;
  END IF;
  RETURN jsonb_build_object('name', v_name, 'address', v_addr, 'phone', v_phone, 'email', v_email);
END
$fn$;

-- ── What is billed in which month (nobody's to call but the functions below) ─────────────────────────────────────
-- A product project only: a one-time one once, the month it was done (office time); a recurring one every month from the
-- one its work started to the one the manager stopped it — paused months too, as a fee (the user's answers 44, 51).
-- Never a month still to come.
CREATE OR REPLACE FUNCTION public.mkt_bill_due(p_from date, p_to date)
RETURNS TABLE (project_id uuid, month date)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_now   date := v_today - (extract(day FROM v_today)::integer - 1);
  v_from  date;
  v_to    date;
BEGIN
  IF p_from IS NULL OR p_to IS NULL THEN
    RETURN;
  END IF;
  v_from := p_from - (extract(day FROM p_from)::integer - 1);
  v_to := least(p_to - (extract(day FROM p_to)::integer - 1), v_now);
  IF v_from > v_to THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT p.id, d.m
    FROM public.mkt_projects p
    JOIN public.mkt_product_versions pv ON pv.product_id = p.product_id AND pv.version = p.product_version
    CROSS JOIN LATERAL (SELECT (p.done_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date AS day) dd
    CROSS JOIN LATERAL (SELECT dd.day - (extract(day FROM dd.day)::integer - 1) AS m) d
   WHERE p.kind = 'product' AND pv.kind = 'one' AND p.status = 'done' AND p.done_at IS NOT NULL
     AND d.m BETWEEN v_from AND v_to
  UNION ALL
  SELECT p.id, g.m::date
    FROM public.mkt_projects p
    JOIN public.mkt_product_versions pv ON pv.product_id = p.product_id AND pv.version = p.product_version
    CROSS JOIN LATERAL generate_series(greatest(p.bill_from, v_from)::timestamp, least(coalesce(p.bill_until, v_to), v_to)::timestamp,
                                       interval '1 month') AS g(m)
   WHERE p.kind = 'product' AND pv.kind = 'recurring' AND p.bill_from IS NOT NULL AND p.status <> 'cancelled';
END
$fn$;

-- ── An outside client's billing details, for its page's Edit (the manager's) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_client_bill(p_sub uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'A client''s billing details are the manager''s.');
  RETURN (SELECT jsonb_build_object('name', x.bill_name, 'address', x.bill_address, 'phone', x.bill_phone, 'email', x.bill_email)
            FROM public.mkt_subsidiaries x WHERE x.id = p_sub AND x.company_id IS NULL);
END
$fn$;

-- ── The month's billing (the manager's — /marketing/billing) ─────────────────────────────────────────────────────
-- Every line billed in the month (and any confirmed for it): the project, its product, one-time or monthly, its amount
-- now, its confirmation; the clients they are for — an outside client with its billing details, a group company with
-- the company Finance bills; and the other months of the last two years with a line still to confirm.
CREATE OR REPLACE FUNCTION public.mkt_billing(p_month date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_now   date := v_today - (extract(day FROM v_today)::integer - 1);
  v_month date := coalesce(p_month, v_today);
  v_ids   uuid[];
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'Billing is the manager''s.');
  v_month := least(v_month - (extract(day FROM v_month)::integer - 1), v_now);
  v_ids := ARRAY(SELECT d.project_id FROM public.mkt_bill_due(v_month, v_month) d
                 UNION
                 SELECT b.project_id FROM public.mkt_bills b WHERE b.month = v_month AND b.status = 'confirmed');
  RETURN jsonb_build_object(
    'today', v_today, 'month', v_month, 'now', v_now,
    'lines', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'project', p.id, 'track', p.track_id, 'title', p.title, 'sub', p.subsidiary_id, 'status', p.status,
               'product', pv.name, 'kind', pv.kind, 'doneAt', p.done_at, 'from', p.bill_from, 'until', p.bill_until,
               'amount', p.bill_amount,
               'bill', (SELECT jsonb_build_object('id', b.id, 'amount', b.amount, 'words', b.words, 'by', b.confirmed_name,
                                                  'at', b.confirmed_at)
                          FROM public.mkt_bills b WHERE b.project_id = p.id AND b.month = v_month AND b.status = 'confirmed'))
             ORDER BY p.track_id)
        FROM public.mkt_projects p
        JOIN public.mkt_product_versions pv ON pv.product_id = p.product_id AND pv.version = p.product_version
       WHERE p.id = ANY (v_ids)), '[]'::jsonb),
    'subs', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', x.id, 'code', x.code, 'name', x.name, 'dot', x.dot, 'emoji', x.emoji, 'client', x.company_id IS NULL,
               'company', (SELECT c.name FROM public.companies c WHERE c.id = x.company_id),
               'bill', CASE WHEN x.company_id IS NULL
                            THEN jsonb_build_object('name', x.bill_name, 'address', x.bill_address, 'phone', x.bill_phone,
                                                    'email', x.bill_email) END)
             ORDER BY x.sort_order, lower(x.name))
        FROM public.mkt_subsidiaries x
       WHERE x.id IN (SELECT p.subsidiary_id FROM public.mkt_projects p WHERE p.id = ANY (v_ids))), '[]'::jsonb),
    'open', coalesce((
      SELECT jsonb_agg(jsonb_build_object('month', z.month, 'due', z.n) ORDER BY z.month DESC)
        FROM (SELECT d.month, count(*) AS n
                FROM public.mkt_bill_due((v_now - interval '24 months')::date, v_now) d
               WHERE d.month <> v_month
                 AND NOT EXISTS (SELECT 1 FROM public.mkt_bills b
                                  WHERE b.project_id = d.project_id AND b.month = d.month AND b.status = 'confirmed')
               GROUP BY d.month) z), '[]'::jsonb));
END
$fn$;

-- ── Lines confirmed — the month's, these projects' (the manager's) ───────────────────────────────────────────────
-- Each must be billed in the month and have its amount; one confirmed already is left as it is. The amount and the
-- line's words are kept as they were confirmed ("Social Media Management - Oct'26"); the project's trail says so (its
-- month, never the figure). Answers the month as it now stands.
CREATE OR REPLACE FUNCTION public.mkt_bill_confirm(p_month date, p_projects uuid[])
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_now   date := v_today - (extract(day FROM v_today)::integer - 1);
  v_month date;
  v_id    uuid;
  v_p     public.mkt_projects;
  v_name  text;
  v_n     integer := 0;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'Confirming billing is the manager''s.');
  IF p_month IS NULL THEN
    RAISE EXCEPTION 'Pick the month.' USING ERRCODE = '22023';
  END IF;
  v_month := p_month - (extract(day FROM p_month)::integer - 1);
  IF v_month > v_now THEN
    RAISE EXCEPTION 'A month still to come is not billed yet.' USING ERRCODE = '22023';
  END IF;
  IF coalesce(cardinality(p_projects), 0) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Pick what to confirm — at most 200 at once.' USING ERRCODE = '22023';
  END IF;
  FOREACH v_id IN ARRAY p_projects LOOP
    SELECT * INTO v_p FROM public.mkt_projects WHERE id = v_id FOR UPDATE;
    IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.mkt_bill_due(v_month, v_month) d WHERE d.project_id = v_id) THEN
      RAISE EXCEPTION '% is not billed in %.', coalesce(v_p.track_id, 'That project'), to_char(v_month, 'Mon YYYY')
        USING ERRCODE = '22023';
    END IF;
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.mkt_bills b WHERE b.project_id = v_id AND b.month = v_month AND b.status = 'confirmed');
    IF v_p.bill_amount IS NULL THEN
      RAISE EXCEPTION '%: give it its amount first.', v_p.track_id USING ERRCODE = '22023';
    END IF;
    v_name := (SELECT pv.name FROM public.mkt_product_versions pv
                WHERE pv.product_id = v_p.product_id AND pv.version = v_p.product_version);
    INSERT INTO public.mkt_bills (project_id, month, subsidiary_id, amount, words, confirmed_by, confirmed_name)
    VALUES (v_id, v_month, v_p.subsidiary_id, v_p.bill_amount,
            left(coalesce(nullif(btrim(v_name), ''), v_p.title), 180) || ' - ' || to_char(v_month, 'Mon') || '''' || to_char(v_month, 'YY'),
            auth.uid(), public.mkt_actor());
    PERFORM public.mkt_log(v_id, 'billing confirmed', p_data => jsonb_build_object('month', to_char(v_month, 'YYYY-MM')));
    v_n := v_n + 1;
  END LOOP;
  RETURN public.mkt_billing(v_month) || jsonb_build_object('confirmed', v_n);
END
$fn$;

-- ── A confirmation taken back (the manager's) — the line is the month's to confirm again ─────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_bill_withdraw(p_bill uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_b public.mkt_bills;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'Withdrawing a confirmation is the manager''s.');
  SELECT * INTO v_b FROM public.mkt_bills WHERE id = p_bill FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That confirmation is not there.' USING ERRCODE = 'P0002';
  END IF;
  IF v_b.status <> 'confirmed' THEN
    RAISE EXCEPTION 'It was withdrawn already.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.mkt_bills
     SET status = 'withdrawn', withdrawn_by = auth.uid(), withdrawn_name = public.mkt_actor(), withdrawn_at = now()
   WHERE id = v_b.id;
  PERFORM public.mkt_log(v_b.project_id, 'billing withdrawn', p_data => jsonb_build_object('month', to_char(v_b.month, 'YYYY-MM')));
  RETURN public.mkt_billing(v_b.month);
END
$fn$;

-- ── A product project's amount changed (the manager's) ───────────────────────────────────────────────────────────
-- A one-time project's, until its billing is confirmed; a recurring one's for every month not confirmed yet (a month
-- confirmed keeps its figure). The trail says it changed, never the figure — amounts are the manager's, the trail
-- everybody's.
CREATE OR REPLACE FUNCTION public.mkt_project_bill_set(p_project uuid, p_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_p public.mkt_projects;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'A project''s amount is the manager''s.');
  SELECT * INTO v_p FROM public.mkt_projects WHERE id = p_project FOR UPDATE;
  IF NOT FOUND OR v_p.kind <> 'product' THEN
    RAISE EXCEPTION 'Only a product project carries an amount.' USING ERRCODE = 'P0002';
  END IF;
  IF v_p.status = 'cancelled' THEN
    RAISE EXCEPTION 'That project was cancelled.' USING ERRCODE = '22023';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount >= 10000000000000 OR p_amount <> round(p_amount, 2) THEN
    RAISE EXCEPTION 'An amount in ringgit above zero, at most two decimals.' USING ERRCODE = '22023';
  END IF;
  IF (SELECT pv.kind FROM public.mkt_product_versions pv
       WHERE pv.product_id = v_p.product_id AND pv.version = v_p.product_version) = 'one'
     AND EXISTS (SELECT 1 FROM public.mkt_bills b WHERE b.project_id = v_p.id AND b.status = 'confirmed') THEN
    RAISE EXCEPTION 'Its billing is confirmed — withdraw it on Billing first.' USING ERRCODE = '22023';
  END IF;
  IF p_amount IS DISTINCT FROM v_p.bill_amount THEN
    UPDATE public.mkt_projects SET bill_amount = p_amount, updated_at = now() WHERE id = v_p.id;
    PERFORM public.mkt_log(v_p.id, 'amount set');
  END IF;
  RETURN public.mkt_product_project(v_p.id::text);
END
$fn$;

-- ── A recurring project stopped (the manager's — the user's answer 51: "直到经理按停止") ──────────────────────────
-- The month it is pressed is its last billed; work under way carries on, and the project closes once nothing of it is
-- (now, or when its last deliverable is done — mkt_product_settle).
CREATE OR REPLACE FUNCTION public.mkt_product_stop(p_project uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_now   date := v_today - (extract(day FROM v_today)::integer - 1);
  v_p     public.mkt_projects;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'Stopping a recurring project is the manager''s.');
  SELECT * INTO v_p FROM public.mkt_projects WHERE id = p_project FOR UPDATE;
  IF NOT FOUND OR v_p.kind <> 'product' THEN
    RAISE EXCEPTION 'That project is not there.' USING ERRCODE = 'P0002';
  END IF;
  IF (SELECT pv.kind FROM public.mkt_product_versions pv
       WHERE pv.product_id = v_p.product_id AND pv.version = v_p.product_version) IS DISTINCT FROM 'recurring' THEN
    RAISE EXCEPTION 'Only a recurring project is stopped — a one-time one closes once its deliverables are done.'
      USING ERRCODE = '22023';
  END IF;
  IF v_p.bill_from IS NULL THEN
    RAISE EXCEPTION 'Its work has not started — nothing is billed yet.' USING ERRCODE = '22023';
  END IF;
  IF v_p.bill_until IS NOT NULL OR v_p.status NOT IN ('active', 'paused') THEN
    RAISE EXCEPTION 'It has stopped already.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.mkt_projects SET bill_until = greatest(v_now, v_p.bill_from), updated_at = now() WHERE id = v_p.id;
  PERFORM public.mkt_log(v_p.id, 'stopped', p_data => jsonb_build_object('until', to_char(greatest(v_now, v_p.bill_from), 'YYYY-MM')));
  PERFORM public.mkt_product_settle(v_p.id);
  RETURN public.mkt_product_project(v_p.id::text);
END
$fn$;

-- ── A client added — re-made with its billing details (an old call without them still answers) ──────────────
DROP FUNCTION IF EXISTS public.mkt_sub_add(text, text);
CREATE OR REPLACE FUNCTION public.mkt_sub_add(p_name text, p_pic text DEFAULT NULL, p_bill jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_pic  text := nullif(regexp_replace(btrim(coalesce(p_pic, '')), '\s+', ' ', 'g'), '');
  v_base text;
  v_code text;
  v_n    integer := 1;
  v_s    public.mkt_subsidiaries;
  v_bill jsonb;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'Adding a client is the manager''s.');
  IF length(v_name) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'Name the company or client — at most 80 characters.' USING ERRCODE = '22023';
  END IF;
  IF length(v_pic) > 80 THEN
    RAISE EXCEPTION 'A PIC''s name of at most 80 characters.' USING ERRCODE = '22023';
  END IF;
  -- Its billing details (②b-2b — the user's answer 50: Marketing fills them when adding the client).
  v_bill := public.mkt_bill_party(p_bill);
  PERFORM pg_advisory_xact_lock(hashtext('mkt_sub_add'));
  IF EXISTS (SELECT 1 FROM public.mkt_subsidiaries x WHERE lower(x.name) = lower(v_name) AND x.active) THEN
    RAISE EXCEPTION '% is on the list already.', v_name USING ERRCODE = '23505';
  END IF;
  v_base := left(upper(regexp_replace(v_name, '[^A-Za-z0-9]', '', 'g')), 4);
  IF length(v_base) < 2 THEN
    v_base := 'OTH';
  END IF;
  v_code := v_base;
  WHILE EXISTS (SELECT 1 FROM public.mkt_subsidiaries x WHERE x.code = v_code) LOOP
    v_n := v_n + 1;
    IF v_n > 999 THEN
      RAISE EXCEPTION 'No code is left for "%".', v_name USING ERRCODE = '54000';
    END IF;
    v_code := left(v_base, 6 - length(v_n::text)) || v_n::text;
  END LOOP;
  INSERT INTO public.mkt_subsidiaries (code, name, pic_name, created_by, bill_name, bill_address, bill_phone, bill_email)
  VALUES (v_code, v_name, v_pic, auth.uid(), v_bill ->> 'name', CASE WHEN jsonb_typeof(v_bill -> 'address') = 'object' THEN v_bill -> 'address' END,
          v_bill ->> 'phone', v_bill ->> 'email')
  RETURNING * INTO v_s;
  RETURN jsonb_build_object('id', v_s.id, 'code', v_s.code, 'name', v_s.name, 'dot', v_s.dot, 'emoji', v_s.emoji,
                            'client', true, 'pic', v_s.pic_name, 'bill', jsonb_build_object('name', v_s.bill_name, 'address', v_s.bill_address, 'phone', v_s.bill_phone, 'email', v_s.bill_email));
END
$fn$;

-- ── A client edited — production's body, its billing details ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_sub_edit(p_sub uuid, p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  v_s     public.mkt_subsidiaries;
  v_key   text;
  v_name  text;
  v_pic   text;
  v_wa    text;
  v_pic2  text;
  v_wa2   text;
  v_bill  jsonb;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'Editing a client is the manager''s.');
  IF jsonb_typeof(v_patch) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Nothing to save.' USING ERRCODE = '22023';
  END IF;
  FOR v_key IN SELECT jsonb_object_keys(v_patch) LOOP
    IF v_key NOT IN ('name', 'pic', 'whatsapp', 'pic2', 'whatsapp2', 'billName', 'billAddress', 'billPhone', 'billEmail') THEN
      RAISE EXCEPTION '"%" is not a client''s to change.', v_key USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(v_patch -> v_key) NOT IN ('string', 'null') AND NOT (v_key = 'billAddress' AND jsonb_typeof(v_patch -> v_key) = 'object') THEN
      RAISE EXCEPTION 'Not words: %.', v_key USING ERRCODE = '22023';
    END IF;
  END LOOP;
  SELECT * INTO v_s FROM public.mkt_subsidiaries WHERE id = p_sub AND active FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That client is not there.' USING ERRCODE = 'P0002';
  END IF;
  v_name := v_s.name;
  v_pic := v_s.pic_name;
  v_wa := v_s.pic_whatsapp;
  v_pic2 := v_s.pic2_name;
  v_wa2 := v_s.pic2_whatsapp;

  IF v_patch ? 'name' THEN
    v_name := regexp_replace(btrim(coalesce(v_patch ->> 'name', '')), '\s+', ' ', 'g');
    IF v_name IS DISTINCT FROM v_s.name THEN
      IF v_s.company_id IS NOT NULL THEN
        RAISE EXCEPTION 'A group company keeps its own name — only Marketing''s clients are renamed here.' USING ERRCODE = '22023';
      END IF;
      IF length(v_name) NOT BETWEEN 1 AND 80 THEN
        RAISE EXCEPTION 'Name the client — at most 80 characters.' USING ERRCODE = '22023';
      END IF;
      -- As mkt_sub_add: a name on the list already (a group company's too, whatever the case) is refused.
      PERFORM pg_advisory_xact_lock(hashtext('mkt_sub_add'));
      IF EXISTS (SELECT 1 FROM public.mkt_subsidiaries x WHERE lower(x.name) = lower(v_name) AND x.active AND x.id <> v_s.id) THEN
        RAISE EXCEPTION '% is on the list already.', v_name USING ERRCODE = '23505';
      END IF;
    END IF;
  END IF;
  IF v_patch ? 'pic' THEN
    v_pic := nullif(regexp_replace(btrim(coalesce(v_patch ->> 'pic', '')), '\s+', ' ', 'g'), '');
  END IF;
  IF v_patch ? 'pic2' THEN
    v_pic2 := nullif(regexp_replace(btrim(coalesce(v_patch ->> 'pic2', '')), '\s+', ' ', 'g'), '');
  END IF;
  IF length(v_pic) > 80 OR length(v_pic2) > 80 THEN
    RAISE EXCEPTION 'A PIC''s name of at most 80 characters.' USING ERRCODE = '22023';
  END IF;
  IF v_patch ? 'whatsapp' THEN
    v_wa := nullif(btrim(coalesce(v_patch ->> 'whatsapp', '')), '');
  END IF;
  IF v_patch ? 'whatsapp2' THEN
    v_wa2 := nullif(btrim(coalesce(v_patch ->> 'whatsapp2', '')), '');
  END IF;
  IF length(v_wa) > 40 OR v_wa !~ '^[+0-9 ()-]+$' OR length(v_wa2) > 40 OR v_wa2 !~ '^[+0-9 ()-]+$' THEN
    RAISE EXCEPTION 'A WhatsApp number, digits only.' USING ERRCODE = '22023';
  END IF;
  IF v_pic2 IS NOT NULL AND v_pic IS NULL THEN
    RAISE EXCEPTION 'Name the first PIC before a second.' USING ERRCODE = '22023';
  END IF;
  IF v_pic2 IS NOT NULL AND lower(v_pic2) = lower(v_pic) THEN
    RAISE EXCEPTION 'The second PIC is somebody else.' USING ERRCODE = '22023';
  END IF;

  -- Its billing details (②b-2b — the user's answer 50): an outside client's; a group company is billed as Finance keeps it.
  IF v_s.company_id IS NOT NULL AND EXISTS (SELECT 1 FROM jsonb_each(v_patch) e
                                            WHERE e.key IN ('billName', 'billAddress', 'billPhone', 'billEmail')
                                              AND jsonb_typeof(e.value) <> 'null') THEN
    RAISE EXCEPTION 'A group company is billed as Finance keeps it — its billing details are not Marketing''s.' USING ERRCODE = '22023';
  END IF;
  v_bill := public.mkt_bill_party(jsonb_build_object(
    'name', CASE WHEN v_patch ? 'billName' THEN v_patch -> 'billName' ELSE to_jsonb(v_s.bill_name) END,
    'address', CASE WHEN v_patch ? 'billAddress' THEN v_patch -> 'billAddress' ELSE coalesce(v_s.bill_address, 'null'::jsonb) END,
    'phone', CASE WHEN v_patch ? 'billPhone' THEN v_patch -> 'billPhone' ELSE to_jsonb(v_s.bill_phone) END,
    'email', CASE WHEN v_patch ? 'billEmail' THEN v_patch -> 'billEmail' ELSE to_jsonb(v_s.bill_email) END));

  UPDATE public.mkt_subsidiaries
     SET name = v_name, pic_name = v_pic, pic_whatsapp = v_wa, pic2_name = v_pic2, pic2_whatsapp = v_wa2, updated_at = now(),
         bill_name = v_bill ->> 'name', bill_address = CASE WHEN jsonb_typeof(v_bill -> 'address') = 'object' THEN v_bill -> 'address' END,
         bill_phone = v_bill ->> 'phone', bill_email = v_bill ->> 'email'
   WHERE id = v_s.id
  RETURNING * INTO v_s;
  RETURN jsonb_build_object('id', v_s.id, 'code', v_s.code, 'name', v_s.name, 'dot', v_s.dot, 'emoji', v_s.emoji,
                            'client', v_s.company_id IS NULL, 'pic', v_s.pic_name, 'whatsapp', v_s.pic_whatsapp,
                            'pic2', v_s.pic2_name, 'whatsapp2', v_s.pic2_whatsapp,
                            'bill', CASE WHEN v_s.company_id IS NULL THEN jsonb_build_object('name', v_s.bill_name, 'address', v_s.bill_address, 'phone', v_s.bill_phone, 'email', v_s.bill_email) END);
END
$fn$;

-- ── A product project started — re-made with its amount (an old call without one takes the list price) ──────
DROP FUNCTION IF EXISTS public.mkt_product_start(uuid, uuid);
CREATE OR REPLACE FUNCTION public.mkt_product_start(p_sub uuid, p_product uuid, p_amount numeric DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_today  date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_me     uuid := public.mkt_me_staff();
  v_sub    public.mkt_subsidiaries;
  v_ver    integer;
  v_pv     public.mkt_product_versions;
  v_mv     public.mkt_minutes_versions;
  v_tname  text;
  v_att    text;
  v_track  text;
  v_id     uuid;
  v_min    uuid;
  v_amount numeric;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'Starting a product project is the manager''s.');
  SELECT * INTO v_sub FROM public.mkt_subsidiaries WHERE id = p_sub AND active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pick who the project is for.' USING ERRCODE = '22023';
  END IF;
  v_ver := public.mkt_product_in_effect(p_product);
  IF v_ver IS NULL THEN
    RAISE EXCEPTION 'That product is not on sale today.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_pv FROM public.mkt_product_versions WHERE product_id = p_product AND version = v_ver;
  -- Its amount (②b-2b — the user's answer 43: typed when it is made, a quote): the product's list price unless another
  -- is given — a one-time project's whole, a recurring one's every month.
  v_amount := coalesce(p_amount, v_pv.price);
  IF v_amount IS NULL OR v_amount <= 0 OR v_amount >= 10000000000000 OR v_amount <> round(v_amount, 2) THEN
    RAISE EXCEPTION 'An amount in ringgit above zero, at most two decimals.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_mv FROM public.mkt_minutes_versions WHERE template_id = v_pv.intake_id AND version = v_pv.intake_version;
  v_tname := (SELECT t.name FROM public.mkt_minutes_templates t WHERE t.id = v_pv.intake_id);
  v_att := (SELECT f ->> 'name' FROM jsonb_array_elements(v_mv.fields) f
             WHERE f ->> 'type' = 'People' AND coalesce((f -> 'lock') = 'true'::jsonb, false) LIMIT 1);

  v_track := public.mkt_next_track('MKT', v_sub.code);
  INSERT INTO public.mkt_projects (track_id, kind, subsidiary_id, title, status, product_id, product_version, owner_staff,
                                   pic_name, pic_whatsapp, pic2_name, pic2_whatsapp, created_by, bill_amount)
  VALUES (v_track, 'product', v_sub.id, left(v_sub.name || ' · ' || v_pv.name || ' · ' || to_char(v_today, 'Mon YYYY'), 140),
          'minutes', p_product, v_ver, v_me, v_sub.pic_name, v_sub.pic_whatsapp, v_sub.pic2_name, v_sub.pic2_whatsapp, auth.uid(), v_amount)
  RETURNING id INTO v_id;
  -- Whoever starts it attends the meeting.
  INSERT INTO public.mkt_minutes (project_id, template_id, template_version, intake, title, vals, created_by, updated_by)
  VALUES (v_id, v_pv.intake_id, v_pv.intake_version, true, left(coalesce(v_tname, 'Meeting minutes'), 80),
          CASE WHEN v_me IS NOT NULL AND v_att IS NOT NULL THEN jsonb_build_object(v_att, jsonb_build_array(v_me)) ELSE '{}'::jsonb END,
          auth.uid(), auth.uid())
  RETURNING id INTO v_min;
  PERFORM public.mkt_log(v_id, 'created', p_data => jsonb_build_object('product', v_pv.name, 'version', v_ver));
  RETURN jsonb_build_object('id', v_id, 'track', v_track, 'minutes', v_min);
END
$fn$;

-- ── Its work started — production's body, a recurring one billed from this month ─────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_product_begin(p_project uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_p     public.mkt_projects;
  v_pv    public.mkt_product_versions;
  v_g     jsonb;
  v_it    jsonb;
  v_qty   integer;
  v_wv    public.mkt_workflow_versions;
  v_w     public.mkt_workflows;
  v_total integer;
  v_n     integer := 0;
  v_id    uuid;
  k       integer;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'Starting the work is the manager''s.');
  SELECT * INTO v_p FROM public.mkt_projects WHERE id = p_project FOR UPDATE;
  IF NOT FOUND OR v_p.kind <> 'product' THEN
    RAISE EXCEPTION 'That project is not there.' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (SELECT 1 FROM public.mkt_projects d WHERE d.parent_id = v_p.id) THEN
    RAISE EXCEPTION 'Its work has started already.' USING ERRCODE = '22023';
  END IF;
  IF NOT (v_p.status = 'approved' OR (v_p.status IN ('waiting_pic', 'changes') AND v_p.override IS NOT NULL)) THEN
    RAISE EXCEPTION 'The work starts once the PIC approves the minutes — or once it is started before approval.'
      USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_pv FROM public.mkt_product_versions WHERE product_id = v_p.product_id AND version = v_p.product_version;
  v_total := coalesce((SELECT sum((it ->> 'qty')::integer)
                         FROM jsonb_array_elements(v_pv.groups) g, jsonb_array_elements(coalesce(g -> 'items', '[]'::jsonb)) it
                        WHERE coalesce(it ->> 'qty', '') ~ '^[0-9]{1,3}$'), 0);
  IF v_total = 0 THEN
    RAISE EXCEPTION 'The product includes nothing to make.' USING ERRCODE = '22023';
  END IF;
  IF v_total > 300 THEN
    RAISE EXCEPTION 'A product project makes at most 300 deliverables (this product %).', v_total USING ERRCODE = '22023';
  END IF;
  FOR v_g IN SELECT x FROM jsonb_array_elements(v_pv.groups) x LOOP
    FOR v_it IN SELECT x FROM jsonb_array_elements(coalesce(v_g -> 'items', '[]'::jsonb)) x LOOP
      v_qty := CASE WHEN coalesce(v_it ->> 'qty', '') ~ '^[0-9]{1,3}$' THEN (v_it ->> 'qty')::integer ELSE 0 END;
      CONTINUE WHEN v_qty = 0;
      SELECT * INTO v_wv FROM public.mkt_workflow_versions
       WHERE workflow_id = (v_it ->> 'workflow')::uuid AND version = (v_it ->> 'workflowVersion')::integer;
      IF NOT FOUND THEN
        RAISE EXCEPTION '"%": its workflow is not there.', v_it ->> 'name' USING ERRCODE = '22023';
      END IF;
      SELECT * INTO v_w FROM public.mkt_workflows WHERE id = v_wv.workflow_id;
      FOR k IN 1 .. v_qty LOOP
        v_n := v_n + 1;
        INSERT INTO public.mkt_projects (track_id, kind, subsidiary_id, title, status, product_id, product_version,
                                         workflow_id, workflow_version, workflow_name, owner_staff, pic_name, pic_whatsapp,
                                         pic2_name, pic2_whatsapp, parent_id, deliv, canvas_def, created_by)
        VALUES (v_p.track_id || '-D' || lpad(v_n::text, CASE WHEN v_total >= 100 THEN 3 ELSE 2 END, '0'), 'deliverable',
                v_p.subsidiary_id,
                left(btrim(v_it ->> 'name') || CASE WHEN v_qty > 1 THEN ' ' || k || '/' || v_qty ELSE '' END, 140),
                'planning', v_p.product_id, v_p.product_version, v_wv.workflow_id, v_wv.version,
                left(v_w.action || ' · ' || v_w.tname, 120), v_p.owner_staff, v_p.pic_name, v_p.pic_whatsapp,
                v_p.pic2_name, v_p.pic2_whatsapp, v_p.id,
                jsonb_build_object('group', btrim(coalesce(v_g ->> 'name', '')), 'item', btrim(v_it ->> 'name'),
                                   'n', k, 'of', v_qty),
                v_wv.canvas, auth.uid())
        RETURNING id INTO v_id;
        -- Its stages, as its template's version has them: the first always the manager's to assign; a locked template
        -- all of them, and none split. A stage's fields are its own and the canvas's own sections' fields of it.
        INSERT INTO public.mkt_stages (project_id, idx, name, dept, mode, cands, sla, appr, split, spec, status)
        SELECT v_id, (x.n - 1)::integer, x.st ->> 'name', coalesce(x.st ->> 'dept', ''),
               CASE WHEN v_wv.locked OR x.n = 1 OR x.st -> 'who' ->> 'mode' IS DISTINCT FROM 'prev' THEN 'assign' ELSE 'prev' END,
               ARRAY(SELECT c::uuid FROM jsonb_array_elements_text(coalesce(x.st -> 'who' -> 'cands', '[]'::jsonb)) c),
               (x.st ->> 'sla')::integer, coalesce(x.st -> 'appr', '[]'::jsonb),
               coalesce((x.st ->> 'split')::boolean, false) AND NOT v_wv.locked,
               jsonb_strip_nulls(jsonb_build_object(
                 'form', coalesce(x.st -> 'form', '[]'::jsonb) || coalesce((
                           SELECT jsonb_agg(sf.f || jsonb_build_object('section', sc.sec ->> 'title') ORDER BY sc.so, sf.fo)
                             FROM jsonb_array_elements(coalesce(v_wv.canvas -> 'sections', '[]'::jsonb)) WITH ORDINALITY AS sc(sec, so),
                                  jsonb_array_elements(coalesce(sc.sec -> 'fields', '[]'::jsonb)) WITH ORDINALITY AS sf(f, fo)
                            WHERE coalesce(sf.f ->> 'stage', '') ~ '^[0-9]{1,2}$' AND (sf.f ->> 'stage')::integer = x.n - 1), '[]'::jsonb),
                 'back', x.st -> 'back', 'sec', x.st -> 'sec', 'picText', nullif(x.st ->> 'picText', ''))),
               'planned'
          FROM jsonb_array_elements(v_wv.stages) WITH ORDINALITY AS x(st, n);
      END LOOP;
    END LOOP;
  END LOOP;
  -- A recurring one is billed from this month (②b-2b — the user's answer 51).
  UPDATE public.mkt_projects SET status = 'active', updated_at = now(),
                                 bill_from = CASE WHEN v_pv.kind = 'recurring' THEN (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date - (extract(day FROM (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)::integer - 1) END
   WHERE id = v_p.id;
  PERFORM public.mkt_log(v_p.id, 'work started', p_data => jsonb_build_object('deliverables', v_n));
  RETURN jsonb_build_object('id', v_p.id, 'track', v_p.track_id, 'deliverables', v_n);
END
$fn$;

-- ── A product project closed — production's body, a stopped recurring one too ────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_product_settle(p_parent uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_p public.mkt_projects;
BEGIN
  SELECT * INTO v_p FROM public.mkt_projects WHERE id = p_parent FOR UPDATE;
  IF NOT FOUND OR v_p.kind <> 'product' OR v_p.status <> 'active' THEN
    RETURN;
  END IF;
  IF (SELECT pv.kind FROM public.mkt_product_versions pv
       WHERE pv.product_id = v_p.product_id AND pv.version = v_p.product_version) IS DISTINCT FROM 'one'
     -- A recurring one, once the manager stopped it (②b-2b).
     AND v_p.bill_until IS NULL THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.mkt_projects d WHERE d.parent_id = v_p.id AND d.status NOT IN ('done', 'cancelled')) THEN
    RETURN;
  END IF;
  UPDATE public.mkt_projects SET status = 'done', done_at = now(), updated_at = now() WHERE id = v_p.id;
  PERFORM public.mkt_log(v_p.id, 'closed');
END
$fn$;

-- ── A product project's page — production's body, its billing for the manager ────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_product_project(p_key text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_key text := btrim(coalesce(p_key, ''));
  v_p   public.mkt_projects;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.view'], 'Marketing is not open to your account.');
  IF v_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT * INTO v_p FROM public.mkt_projects WHERE id = v_key::uuid;
  ELSE
    SELECT * INTO v_p FROM public.mkt_projects WHERE track_id = upper(v_key);
  END IF;
  IF NOT FOUND OR v_p.kind <> 'product' THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object(
    'today', (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date,
    'me', public.mkt_me_staff(),
    'team', coalesce((SELECT jsonb_agg(jsonb_build_object('id', r.staff_id, 'user', r.user_id, 'full', r.full_name,
                                         'first', r.first_name, 'title', r.title, 'team', r.team, 'role', r.role_label,
                                         'color', r.color, 'capacity', r.capacity) ORDER BY r.first_name, r.staff_id)
                        FROM public.mkt_roster() r), '[]'::jsonb),
    'sub', (SELECT jsonb_build_object('id', x.id, 'code', x.code, 'name', x.name, 'dot', x.dot, 'emoji', x.emoji,
                                      'client', x.company_id IS NULL, 'pic', x.pic_name)
              FROM public.mkt_subsidiaries x WHERE x.id = v_p.subsidiary_id),
    'project', jsonb_build_object(
      'id', v_p.id, 'track', v_p.track_id, 'title', v_p.title, 'status', v_p.status, 'owner', v_p.owner_staff,
      'ownerName', public.mkt_staff_name(v_p.owner_staff), 'pic', v_p.pic_name, 'whatsapp', v_p.pic_whatsapp,
      'pic2', v_p.pic2_name, 'whatsapp2', v_p.pic2_whatsapp, 'link2', v_p.link2_code,
      'picOk', CASE WHEN v_p.pic_ok ->> 'sent' = (extract(epoch FROM v_p.link_sent_at))::text THEN v_p.pic_ok - 'sent' END,
      'link', v_p.link_code, 'linkSentAt', v_p.link_sent_at, 'picReply', v_p.pic_reply, 'override', v_p.override,
      'createdAt', v_p.created_at,
      'product', (SELECT jsonb_build_object('id', pv.product_id, 'version', pv.version, 'name', pv.name, 'kind', pv.kind,
                                            'note', pv.note)
                    FROM public.mkt_product_versions pv WHERE pv.product_id = v_p.product_id AND pv.version = v_p.product_version)),
    -- Its billing (②b-2b), the manager's: the amount, a recurring one's months, what was confirmed.
    'bill', CASE WHEN coalesce(public.has_any_action(ARRAY['marketing.manage']), false) THEN jsonb_build_object(
              'amount', v_p.bill_amount, 'from', v_p.bill_from, 'until', v_p.bill_until,
              'confirmed', (SELECT count(*) FROM public.mkt_bills b WHERE b.project_id = v_p.id AND b.status = 'confirmed'),
              'last', (SELECT max(b.month) FROM public.mkt_bills b WHERE b.project_id = v_p.id AND b.status = 'confirmed')) END,
    'minutes', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', m.id, 'title', m.title, 'intake', m.intake, 'status', m.status, 'locked', m.locked, 'rev', m.rev,
               'vals', m.vals, 'signed', m.signed, 'notes', m.notes, 'completedAt', m.completed_at, 'completedBy', m.completed_by,
               'updatedAt', m.updated_at, 'updatedBy', (SELECT u.name FROM public.users u WHERE u.id = m.updated_by),
               'template', jsonb_build_object('id', m.template_id, 'version', m.template_version,
                                              'name', (SELECT t.name FROM public.mkt_minutes_templates t WHERE t.id = m.template_id),
                                              'fields', mv.fields, 'rules', mv.rules))
             ORDER BY m.intake DESC, m.created_at, m.id)
        FROM public.mkt_minutes m
        JOIN public.mkt_minutes_versions mv ON mv.template_id = m.template_id AND mv.version = m.template_version
       WHERE m.project_id = v_p.id), '[]'::jsonb),
    'trail', coalesce((
      SELECT jsonb_agg(jsonb_build_object('at', e.at, 'actor', e.actor_name, 'action', e.action, 'reason', e.reason,
                                          'data', e.data) ORDER BY e.id DESC)
        FROM (SELECT * FROM public.mkt_events WHERE project_id = v_p.id ORDER BY id DESC LIMIT 40) e), '[]'::jsonb),
    -- Its deliverables (②b-2a): each with where it stands — its stage now and whose, how many of its stages are done.
    'deliverables', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', d.id, 'trackId', d.track_id, 'title', d.title, 'status', d.status, 'cur', d.cur, 'deliv', d.deliv,
               'workflow', d.workflow_name, 'startsOn', d.starts_on, 'dueOn', d.due_on, 'doneAt', d.done_at,
               'stages', (SELECT count(*) FROM public.mkt_stages s WHERE s.project_id = d.id),
               'done', (SELECT count(*) FROM public.mkt_stages s WHERE s.project_id = d.id AND s.status = 'done'),
               'stage', (SELECT jsonb_build_object('idx', s.idx, 'name', s.name, 'status', s.status, 'owner', s.owner_staff,
                                                   'dueOn', s.due_on)
                           FROM public.mkt_stages s WHERE s.project_id = d.id AND s.idx = d.cur))
             ORDER BY d.track_id)
        FROM public.mkt_projects d WHERE d.parent_id = v_p.id), '[]'::jsonb));
END
$fn$;

-- ── The products on sale — production's body, their list price ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_product_picker()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'Starting a product project is the manager''s.');
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'id', p.id, 'code', p.code, 'name', v.name, 'kind', v.kind, 'version', v.version, 'note', v.note,
             'description', v.description, 'price', v.price,
             'actions', (SELECT count(*) FROM jsonb_array_elements(v.groups) g, jsonb_array_elements(g -> 'items') it),
             'intake', jsonb_build_object('id', t.id, 'name', t.name, 'version', v.intake_version,
                                          'fields', jsonb_array_length(mv.fields)))
           ORDER BY lower(v.name), p.code)
      FROM public.mkt_products p
      JOIN public.mkt_product_versions v ON v.product_id = p.id AND v.version = public.mkt_product_in_effect(p.id)
      JOIN public.mkt_minutes_templates t ON t.id = v.intake_id
      JOIN public.mkt_minutes_versions mv ON mv.template_id = v.intake_id AND mv.version = v.intake_version
     WHERE p.status = 'active'), '[]'::jsonb);
END
$fn$;

-- ── Who may call what ─────────────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.mkt_bill_party(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mkt_bill_due(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_bill_party(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.mkt_bill_due(date, date) TO service_role;
REVOKE ALL ON FUNCTION public.mkt_sub_add(text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_sub_add(text, text, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.mkt_product_start(uuid, uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_product_start(uuid, uuid, numeric) TO authenticated;
REVOKE ALL ON FUNCTION public.mkt_client_bill(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_client_bill(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.mkt_billing(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_billing(date) TO authenticated;
REVOKE ALL ON FUNCTION public.mkt_bill_confirm(date, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_bill_confirm(date, uuid[]) TO authenticated;
REVOKE ALL ON FUNCTION public.mkt_bill_withdraw(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_bill_withdraw(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.mkt_project_bill_set(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_project_bill_set(uuid, numeric) TO authenticated;
REVOKE ALL ON FUNCTION public.mkt_product_stop(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_product_stop(uuid) TO authenticated;

-- ── The page in the database's copy of the tab registry (the Tracking tab, as the builders) ──
INSERT INTO public.permission_page_tabs (page, tab_id) VALUES ('/marketing/billing', 'mkt.tracking')
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
