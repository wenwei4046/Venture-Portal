-- Lead View › Showroom visits and Insight › Overview (2026-11-17 — the owner, with the showroom's Google Sheet and its
-- "Performance Overview": "lead view 也要做overview 的功能，数据要以上的资料，分不同的outlet", then "照这样做" to the plan:
-- ad spend from Meta by ad account → outlet, visits and sales recorded in Lead View (the sheet's columns), each record
-- with its own source; the salesperson table later, an outside link for the outlets later).
--
-- SHOWROOM VISITS. `lead_visits` — one row per customer who came to an outlet, as the sheet keeps it: the day, name,
-- phone, salesperson (words), brand (words — an outlet sells several), source (Facebook · XHS · Google · Referral ·
-- Organic · WhatsApp), what they asked about, remarks, price offered, status (Follow up · Close sales · Not buying), and
-- once bought: purchase day, order no., items, sales, repeat purchase, purchase reason, remarks. A phone that is a
-- Lead View customer's links the row to that chat (`contact_id`). Read with `lead_visits(from, to)` (Lead View · View;
-- the visits OR purchases in those days), written with `lead_save_visit` / `lead_delete_visit` (Lead View · Edit,
-- Leads' page). Outlet staff (the Team, mig 20261110220100) read and write their own outlets only. Soft-deleted.
--
-- AD SPEND. `lead_ad_accounts` — the Meta ad accounts the system user can read, each on an outlet (set on Overview,
-- `lead_set_ad_account_outlet`, Lead View · Manage — no page guard: Insight has no write box, the cell decides). `lead_ad_spend` —
-- each account's spend per day, split Lead funnel / Branding by the campaign's objective, read from Meta's insights by
-- the server with the system user's token when somebody with Lead View · Manage opens Overview (or presses Refresh) and
-- kept with `lead_save_ad_spend` (Manage, no page guard) — no new service-role caller; a cache, not audited.
--
-- OVERVIEW. `lead_overview(from, to)` (Lead View · View): per outlet (and "no outlet"): online inquiries (chats
-- started, the customer's outlet as the card works it out), visits by source, orders and sales by source (Close sales
-- with a purchase day in the range), spend (Lead funnel, Branding). The page does the arithmetic (lib/leads/overview.ts).

CREATE TABLE IF NOT EXISTS public.lead_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id uuid NOT NULL REFERENCES public.lead_outlets(id) ON DELETE CASCADE,
  visit_on date NOT NULL,
  name text NOT NULL DEFAULT '' CHECK (length(name) <= 120),
  phone text NOT NULL DEFAULT '' CHECK (phone ~ '^[0-9]{0,20}$'),
  sales_person text NOT NULL DEFAULT '' CHECK (length(sales_person) <= 80),
  brand text NOT NULL DEFAULT '' CHECK (length(brand) <= 80),
  source text NOT NULL DEFAULT 'facebook' CHECK (source IN ('facebook', 'xhs', 'google', 'referral', 'organic', 'whatsapp')),
  products text NOT NULL DEFAULT '' CHECK (length(products) <= 500),
  remarks text NOT NULL DEFAULT '' CHECK (length(remarks) <= 500),
  price_offered numeric(12, 2) CHECK (price_offered IS NULL OR price_offered >= 0),
  status text NOT NULL DEFAULT 'follow_up' CHECK (status IN ('follow_up', 'close_sales', 'not_buying')),
  purchase_on date,
  order_no text NOT NULL DEFAULT '' CHECK (length(order_no) <= 40),
  items text NOT NULL DEFAULT '' CHECK (length(items) <= 500),
  sales numeric(12, 2) CHECK (sales IS NULL OR sales >= 0),
  repeat_purchase boolean NOT NULL DEFAULT false,
  purchase_reason text NOT NULL DEFAULT '' CHECK (length(purchase_reason) <= 500),
  purchase_remarks text NOT NULL DEFAULT '' CHECK (length(purchase_remarks) <= 500),
  contact_id uuid REFERENCES public.lead_contacts(id) ON DELETE SET NULL,
  created_by_name text NOT NULL DEFAULT '',
  updated_by_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS lead_visits_outlet_day ON public.lead_visits (outlet_id, visit_on) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS lead_visits_outlet_bought ON public.lead_visits (outlet_id, purchase_on) WHERE deleted_at IS NULL AND status = 'close_sales';
ALTER TABLE public.lead_visits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lead_visits FROM PUBLIC, anon, authenticated;
SELECT public.audit_register('lead_visits', 'Lead View showroom visits', 'Member services', '{leads}', 'all');

CREATE TABLE IF NOT EXISTS public.lead_ad_accounts (
  account_id text PRIMARY KEY CHECK (account_id ~ '^[0-9]{1,24}$'),
  name text NOT NULL DEFAULT '' CHECK (length(name) <= 200),
  outlet_id uuid REFERENCES public.lead_outlets(id) ON DELETE SET NULL,
  seen_at timestamptz NOT NULL DEFAULT now(),
  updated_by_name text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lead_ad_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lead_ad_accounts FROM PUBLIC, anon, authenticated;
SELECT public.audit_register('lead_ad_accounts', 'Lead View ad accounts', 'Member services', '{leads}', 'all');

CREATE TABLE IF NOT EXISTS public.lead_ad_spend (
  account_id text NOT NULL REFERENCES public.lead_ad_accounts(account_id) ON DELETE CASCADE,
  day date NOT NULL,
  funnel numeric(12, 2) NOT NULL DEFAULT 0,
  branding numeric(12, 2) NOT NULL DEFAULT 0,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, day)
);
ALTER TABLE public.lead_ad_spend ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lead_ad_spend FROM PUBLIC, anon, authenticated;
SELECT public.audit_register('lead_ad_spend', 'Lead View ad spend', 'Member services', '{}', 'none',
  p_reason => 'a copy of Meta''s own figures, read again on its own; who put each ad account on its outlet is lead_ad_accounts''s');

-- A phone as the module keeps it: digits, a leading 60 read as 0 (Lead View's phones are 0123384721).
CREATE OR REPLACE FUNCTION public.lead_phone_digits(p text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN d ~ '^60[1-9]' THEN '0' || substr(d, 3) ELSE d END
    FROM (SELECT regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') d) x
$$;
REVOKE ALL ON FUNCTION public.lead_phone_digits(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_phone_digits(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.lead_visit_json(v public.lead_visits)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'id', v.id, 'outletId', v.outlet_id, 'visitOn', v.visit_on, 'name', v.name, 'phone', v.phone,
    'salesPerson', v.sales_person, 'brand', v.brand, 'source', v.source, 'products', v.products, 'remarks', v.remarks,
    'priceOffered', v.price_offered, 'status', v.status, 'purchaseOn', v.purchase_on, 'orderNo', v.order_no,
    'items', v.items, 'sales', v.sales, 'repeat', v.repeat_purchase, 'purchaseReason', v.purchase_reason,
    'purchaseRemarks', v.purchase_remarks, 'contactId', v.contact_id,
    'createdBy', v.created_by_name, 'updatedBy', v.updated_by_name, 'updatedAt', v.updated_at)
$$;
REVOKE ALL ON FUNCTION public.lead_visit_json(public.lead_visits) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_visit_json(public.lead_visits) TO service_role;

-- Is this outlet inside the caller's scope? (lead_my_outlets(): NULL = every outlet.)
CREATE OR REPLACE FUNCTION public.lead_outlet_mine(p_outlet uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v uuid[] := public.lead_my_outlets();
BEGIN
  RETURN v IS NULL OR p_outlet = ANY (v);
END
$$;
REVOKE ALL ON FUNCTION public.lead_outlet_mine(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_outlet_mine(uuid) TO service_role;

-- The visits made or bought in [from, to] (both included), latest first.
CREATE OR REPLACE FUNCTION public.lead_visits(p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_scope uuid[];
BEGIN
  PERFORM public.lead_need(ARRAY['leads.view'], 'Lead View needs Lead View · View.');
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 400 THEN
    RAISE EXCEPTION 'A range of days, 400 at most.' USING ERRCODE = '22023';
  END IF;
  v_scope := public.lead_my_outlets();
  RETURN coalesce((SELECT jsonb_agg(public.lead_visit_json(v) ORDER BY v.visit_on DESC, v.created_at DESC)
                     FROM public.lead_visits v
                    WHERE v.deleted_at IS NULL
                      AND (v_scope IS NULL OR v.outlet_id = ANY (v_scope))
                      AND (v.visit_on BETWEEN p_from AND p_to OR v.purchase_on BETWEEN p_from AND p_to)), '[]'::jsonb);
END
$$;
REVOKE ALL ON FUNCTION public.lead_visits(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_visits(date, date) TO authenticated, service_role;

-- Add (p_id NULL) or change one visit; the whole row comes in p (lead_visit_json's keys). Answers the saved row.
CREATE OR REPLACE FUNCTION public.lead_save_visit(p_id uuid, p jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_who text;
  v_outlet uuid;
  v_old public.lead_visits;
  v_row public.lead_visits;
  v_phone text;
  v_status text;
  v_contact uuid;
  v_txt text;
  v_key text;
  v_max int;
  v_num numeric;
BEGIN
  PERFORM public.lead_need(ARRAY['leads.edit'], 'Showroom visits need Lead View · Edit.');
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN
    RAISE EXCEPTION 'A visit, please.' USING ERRCODE = '22023';
  END IF;
  v_who := left(public.lead_actor_name(), 80);
  IF p_id IS NOT NULL THEN
    SELECT * INTO v_old FROM public.lead_visits WHERE id = p_id AND deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND OR NOT public.lead_outlet_mine(v_old.outlet_id) THEN
      RAISE EXCEPTION 'That visit is gone.' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  v_outlet := nullif(p->>'outletId', '')::uuid;
  IF v_outlet IS NULL OR NOT EXISTS (SELECT 1 FROM public.lead_outlets o WHERE o.id = v_outlet AND o.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Which outlet?' USING ERRCODE = '22023';
  END IF;
  IF NOT public.lead_outlet_mine(v_outlet) THEN
    RAISE EXCEPTION 'That outlet is not one of yours.' USING ERRCODE = '42501';
  END IF;
  IF coalesce(p->>'visitOn', '') !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RAISE EXCEPTION 'The day they came, please.' USING ERRCODE = '22023';
  END IF;
  v_phone := public.lead_phone_digits(p->>'phone');
  IF length(v_phone) > 20 THEN
    RAISE EXCEPTION 'A phone of 20 digits at most.' USING ERRCODE = '22023';
  END IF;
  IF btrim(coalesce(p->>'name', '')) = '' AND v_phone = '' THEN
    RAISE EXCEPTION 'A name or a phone, please.' USING ERRCODE = '22023';
  END IF;
  IF coalesce(p->>'source', '') NOT IN ('facebook', 'xhs', 'google', 'referral', 'organic', 'whatsapp') THEN
    RAISE EXCEPTION 'Where did they come from?' USING ERRCODE = '22023';
  END IF;
  v_status := coalesce(p->>'status', 'follow_up');
  IF v_status NOT IN ('follow_up', 'close_sales', 'not_buying') THEN
    RAISE EXCEPTION 'Follow up, Close sales or Not buying.' USING ERRCODE = '22023';
  END IF;
  IF v_status = 'close_sales' AND coalesce(p->>'purchaseOn', '') !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RAISE EXCEPTION 'A closed sale needs its purchase day.' USING ERRCODE = '22023';
  END IF;
  IF v_status = 'close_sales' AND coalesce(nullif(p->>'sales', '')::numeric, 0) <= 0 THEN
    RAISE EXCEPTION 'A closed sale needs its amount.' USING ERRCODE = '22023';
  END IF;
  FOR v_key, v_max IN SELECT * FROM (VALUES ('name', 120), ('salesPerson', 80), ('brand', 80), ('products', 500), ('remarks', 500),
                                             ('orderNo', 40), ('items', 500), ('purchaseReason', 500), ('purchaseRemarks', 500)) k(a, b) LOOP
    v_txt := btrim(coalesce(p->>v_key, ''));
    IF length(v_txt) > v_max THEN
      RAISE EXCEPTION '% is too long (% characters at most).', v_key, v_max USING ERRCODE = '22023';
    END IF;
  END LOOP;
  FOREACH v_key IN ARRAY ARRAY['priceOffered', 'sales'] LOOP
    IF coalesce(p->>v_key, '') <> '' THEN
      BEGIN
        v_num := (p->>v_key)::numeric;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'An amount in ringgit, please.' USING ERRCODE = '22023';
      END;
      IF v_num < 0 OR v_num >= 10000000000 THEN
        RAISE EXCEPTION 'An amount in ringgit, please.' USING ERRCODE = '22023';
      END IF;
    END IF;
  END LOOP;

  -- The Lead View customer with that phone, the latest to write (none for a walk-in).
  IF length(v_phone) >= 9 THEN
    SELECT c.id INTO v_contact FROM public.lead_contacts c
     WHERE c.phone = v_phone AND NOT c.is_test ORDER BY c.last_at DESC NULLS LAST LIMIT 1;
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.lead_visits (outlet_id, visit_on, created_by_name, updated_by_name) VALUES (v_outlet, (p->>'visitOn')::date, v_who, v_who)
    RETURNING id INTO p_id;
  END IF;
  UPDATE public.lead_visits SET
    outlet_id = v_outlet, visit_on = (p->>'visitOn')::date, name = btrim(coalesce(p->>'name', '')), phone = v_phone,
    sales_person = btrim(coalesce(p->>'salesPerson', '')), brand = btrim(coalesce(p->>'brand', '')), source = p->>'source',
    products = btrim(coalesce(p->>'products', '')), remarks = btrim(coalesce(p->>'remarks', '')),
    price_offered = round(nullif(p->>'priceOffered', '')::numeric, 2), status = v_status,
    purchase_on = CASE WHEN v_status = 'close_sales' THEN (p->>'purchaseOn')::date END,
    order_no = btrim(coalesce(p->>'orderNo', '')), items = btrim(coalesce(p->>'items', '')),
    sales = CASE WHEN v_status = 'close_sales' THEN round(nullif(p->>'sales', '')::numeric, 2) END,
    repeat_purchase = coalesce((p->>'repeat')::boolean, false),
    purchase_reason = btrim(coalesce(p->>'purchaseReason', '')), purchase_remarks = btrim(coalesce(p->>'purchaseRemarks', '')),
    contact_id = v_contact, updated_by_name = v_who, updated_at = now()
   WHERE id = p_id
  RETURNING * INTO v_row;
  RETURN public.lead_visit_json(v_row);
END
$$;
REVOKE ALL ON FUNCTION public.lead_save_visit(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_save_visit(uuid, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.lead_delete_visit(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_outlet uuid;
BEGIN
  PERFORM public.lead_need(ARRAY['leads.edit'], 'Showroom visits need Lead View · Edit.');
  SELECT outlet_id INTO v_outlet FROM public.lead_visits WHERE id = p_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR NOT public.lead_outlet_mine(v_outlet) THEN
    RAISE EXCEPTION 'That visit is gone.' USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.lead_visits SET deleted_at = now(), updated_at = now(), updated_by_name = left(public.lead_actor_name(), 80) WHERE id = p_id;
END
$$;
REVOKE ALL ON FUNCTION public.lead_delete_visit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_delete_visit(uuid) TO authenticated, service_role;

-- An ad account's outlet (NULL = none). Lead View · Manage; no page guard — Insight, where it is set, has no write box, so
-- the cell decides (as lead_assign).
CREATE OR REPLACE FUNCTION public.lead_set_ad_account_outlet(p_account text, p_outlet uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.manage'], 'An ad account''s outlet needs Lead View · Manage.');
  IF NOT EXISTS (SELECT 1 FROM public.lead_ad_accounts WHERE account_id = p_account) THEN
    RAISE EXCEPTION 'That ad account is not one Lead View can read.' USING ERRCODE = 'P0002';
  END IF;
  IF p_outlet IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.lead_outlets o WHERE o.id = p_outlet AND o.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'That outlet is gone.' USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.lead_ad_accounts SET outlet_id = p_outlet, updated_by_name = left(public.lead_actor_name(), 80), updated_at = now()
   WHERE account_id = p_account AND outlet_id IS DISTINCT FROM p_outlet;
END
$$;
REVOKE ALL ON FUNCTION public.lead_set_ad_account_outlet(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_set_ad_account_outlet(text, uuid) TO authenticated, service_role;

-- What Meta answered: p_accounts [{accountId, name}] (the system user's ad accounts, seen now) and p_rows
-- [{accountId, day, funnel, branding}] (each account's days in the range read; the server sends 0 for a day Meta skips).
CREATE OR REPLACE FUNCTION public.lead_save_ad_spend(p_accounts jsonb, p_rows jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_who text;
BEGIN
  PERFORM public.lead_need(ARRAY['leads.manage'], 'Ad spend needs Lead View · Manage.');
  p_accounts := coalesce(p_accounts, '[]'::jsonb);
  p_rows := coalesce(p_rows, '[]'::jsonb);
  IF jsonb_typeof(p_accounts) <> 'array' OR jsonb_typeof(p_rows) <> 'array'
     OR jsonb_array_length(p_accounts) > 200 OR jsonb_array_length(p_rows) > 20000 THEN
    RAISE EXCEPTION 'Ad accounts and their days, please.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_accounts) e WHERE coalesce(e->>'accountId', '') !~ '^[0-9]{1,24}$')
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_rows) e
                 WHERE coalesce(e->>'accountId', '') !~ '^[0-9]{1,24}$' OR coalesce(e->>'day', '') !~ '^\d{4}-\d{2}-\d{2}$'
                    OR jsonb_typeof(e->'funnel') <> 'number' OR jsonb_typeof(e->'branding') <> 'number'
                    OR (e->>'funnel')::numeric < 0 OR (e->>'branding')::numeric < 0) THEN
    RAISE EXCEPTION 'Ad accounts and their days, please.' USING ERRCODE = '22023';
  END IF;
  v_who := left(public.lead_actor_name(), 80);
  INSERT INTO public.lead_ad_accounts (account_id, name, seen_at, updated_by_name)
  SELECT DISTINCT ON (e->>'accountId') e->>'accountId', left(coalesce(e->>'name', ''), 200), now(), v_who
    FROM jsonb_array_elements(p_accounts) e
  ON CONFLICT (account_id) DO UPDATE SET name = EXCLUDED.name, seen_at = now();
  INSERT INTO public.lead_ad_spend (account_id, day, funnel, branding, fetched_at)
  SELECT DISTINCT ON (e->>'accountId', e->>'day') e->>'accountId', (e->>'day')::date,
         round((e->>'funnel')::numeric, 2), round((e->>'branding')::numeric, 2), now()
    FROM jsonb_array_elements(p_rows) e
   WHERE EXISTS (SELECT 1 FROM public.lead_ad_accounts a WHERE a.account_id = e->>'accountId')
  ON CONFLICT (account_id, day) DO UPDATE SET funnel = EXCLUDED.funnel, branding = EXCLUDED.branding, fetched_at = now();
END
$$;
REVOKE ALL ON FUNCTION public.lead_save_ad_spend(jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_save_ad_spend(jsonb, jsonb) TO authenticated, service_role;

-- Overview's figures for [from, to] (office days, both included), by outlet; outletId NULL = no outlet.
CREATE OR REPLACE FUNCTION public.lead_overview(p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_scope uuid[];
BEGIN
  PERFORM public.lead_need(ARRAY['leads.view'], 'Lead View needs Lead View · View.');
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 400 THEN
    RAISE EXCEPTION 'A range of days, 400 at most.' USING ERRCODE = '22023';
  END IF;
  v_scope := public.lead_my_outlets();
  RETURN jsonb_build_object(
    'inquiries', coalesce((
      SELECT jsonb_agg(jsonb_build_object('outletId', x.o, 'n', x.n))
        FROM (SELECT CASE WHEN c.outlet_by = 'cs' THEN c.outlet_id ELSE ao.outlet_id END o, count(*)::int n
                FROM public.lead_contacts c
                LEFT JOIN public.lead_ad_outlets ao ON ao.ad_id = c.ad_id
               WHERE NOT c.is_test
                 AND (c.created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date BETWEEN p_from AND p_to
                 AND public.lead_outlet_ok(v_scope, c.outlet_by, c.outlet_id, c.ad_id)
               GROUP BY 1) x), '[]'::jsonb),
    'visits', coalesce((
      SELECT jsonb_agg(jsonb_build_object('outletId', x.outlet_id, 'source', x.source, 'n', x.n))
        FROM (SELECT v.outlet_id, v.source, count(*)::int n FROM public.lead_visits v
               WHERE v.deleted_at IS NULL AND v.visit_on BETWEEN p_from AND p_to
                 AND (v_scope IS NULL OR v.outlet_id = ANY (v_scope))
               GROUP BY 1, 2) x), '[]'::jsonb),
    'sales', coalesce((
      SELECT jsonb_agg(jsonb_build_object('outletId', x.outlet_id, 'source', x.source, 'orders', x.n, 'amount', x.amount))
        FROM (SELECT v.outlet_id, v.source, count(*)::int n, coalesce(sum(v.sales), 0) amount FROM public.lead_visits v
               WHERE v.deleted_at IS NULL AND v.status = 'close_sales' AND v.purchase_on BETWEEN p_from AND p_to
                 AND (v_scope IS NULL OR v.outlet_id = ANY (v_scope))
               GROUP BY 1, 2) x), '[]'::jsonb),
    'spend', coalesce((
      SELECT jsonb_agg(jsonb_build_object('outletId', x.outlet_id, 'funnel', x.funnel, 'branding', x.branding))
        FROM (SELECT a.outlet_id, sum(s.funnel) funnel, sum(s.branding) branding
                FROM public.lead_ad_spend s JOIN public.lead_ad_accounts a ON a.account_id = s.account_id
               WHERE s.day BETWEEN p_from AND p_to
                 AND (v_scope IS NULL OR a.outlet_id = ANY (v_scope))
               GROUP BY 1) x), '[]'::jsonb),
    'accounts', CASE WHEN v_scope IS NULL THEN coalesce((
      SELECT jsonb_agg(jsonb_build_object('accountId', a.account_id, 'name', a.name, 'outletId', a.outlet_id,
                                          'fetchedAt', (SELECT max(s.fetched_at) FROM public.lead_ad_spend s
                                                         WHERE s.account_id = a.account_id AND s.day BETWEEN p_from AND p_to),
                                          'days', (SELECT count(*)::int FROM public.lead_ad_spend s
                                                    WHERE s.account_id = a.account_id AND s.day BETWEEN p_from AND p_to))
                       ORDER BY a.name)
        FROM public.lead_ad_accounts a), '[]'::jsonb) ELSE '[]'::jsonb END);
END
$$;
REVOKE ALL ON FUNCTION public.lead_overview(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_overview(date, date) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
