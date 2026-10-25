-- 20261026023000_marketing_bill_import.sql
-- 2026-10-26 — Finance imports Marketing's billing (Marketing ②b-2h). The user, asked whose figures Marketing is invoiced
-- by: "A" — the lines Marketing's manager confirmed (/marketing/billing, mig 20261025121000), Finance importing them with
-- one click; then, asked how: a product carries its revenue account, set once; the invoice date left for Finance to fill;
-- an invoice deleted or voided puts its lines back to confirmed and not imported. Finance's own *Generate Marketing
-- invoices* drafted from Marketing contracts (none on production, 2026-10-26) and first deleted the month's Marketing
-- drafts — typed ones too; the hub's generator imports these lines instead, deleting nothing (generate_monthly_invoices
-- itself is left as it is).
--   mkt_products.revenue_account  the revenue account its billing posts to — Finance's chart, an active revenue account
--                 under 5030 Service Management Charge (5011–5019 today; mkt_revenue_list). Set at once by Marketing ·
--                 Manage (mkt_product_account), no new version: the next import takes it.
--   mkt_bills.invoice_id  the invoice a confirmed line is on — none again when Finance deletes it (the key's SET NULL);
--                 a voided one counts as none.
--   mkt_bill_import_preview(month)  Billing · View or Create: the month's confirmed lines — the party each bills (a group
--                 company, or an outside client by Marketing's billing name), its words, amount, account, invoice — and
--                 the month's Marketing invoices typed by hand (on no line), so the same work is not billed twice.
--   mkt_bill_import(month)  Billing · Create (the hub's generator's gate and pages): each party's lines on no live
--                 invoice go on one draft — "Marketing Service - Oct'26", a line each, no invoice date — added to the
--                 draft an import made for that party this month while it is a draft and still bills that party, else
--                 a new one (mint_invoice_no); an outside client's billing name, address (address_compose), phone and
--                 email; never a closed month or one still to come.
--   mkt_products, mkt_billing, mkt_bill_withdraw  production's bodies: the account and its list; a line's invoice; a line
--                 Finance has on a live invoice is not withdrawn.
-- PGlite: tests/member-sql/validate-marketing-bill-import.mjs.

ALTER TABLE public.mkt_products ADD COLUMN IF NOT EXISTS revenue_account varchar(20)
  REFERENCES public.chart_of_accounts(code) ON DELETE SET NULL;
ALTER TABLE public.mkt_bills ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS mkt_bills_invoice ON public.mkt_bills (invoice_id) WHERE invoice_id IS NOT NULL;

-- ── The accounts a Marketing product's revenue may post to ──────────────────────────────────────────────────────
-- Finance's revenue accounts under 5030 Service Management Charge — active, none another's header — by code, named as
-- Finance's chart names them.
CREATE OR REPLACE FUNCTION public.mkt_revenue_list()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object('code', c.code, 'name', regexp_replace(btrim(c.name), '\s+', ' ', 'g')) ORDER BY c.code)
      FROM public.chart_of_accounts c
     WHERE c.parent_code = '5030' AND c.type::text = 'revenue' AND c.is_active
       AND NOT EXISTS (SELECT 1 FROM public.chart_of_accounts k WHERE k.parent_code = c.code)), '[]'::jsonb);
END
$fn$;

-- ── A product's revenue account: Marketing · Manage, at once (no new version) ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_product_account(p_product uuid, p_code text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_code text := nullif(btrim(coalesce(p_code, '')), '');
  v_id   uuid;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'The Product Builder is the manager''s.');
  SELECT id INTO v_id FROM public.mkt_products WHERE id = p_product FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That product is not there.' USING ERRCODE = 'P0002';
  END IF;
  IF v_code IS NOT NULL AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(public.mkt_revenue_list()) a WHERE a ->> 'code' = v_code) THEN
    RAISE EXCEPTION 'Pick its revenue account from the list.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.mkt_products SET revenue_account = v_code, updated_by = auth.uid(), updated_at = now() WHERE id = v_id;
  RETURN jsonb_build_object('product', v_id, 'account', v_code);
END
$fn$;

-- ── What Finance would import for a month: Billing · View or Create ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_bill_import_preview(p_month date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_month date;
  v_accts jsonb := public.mkt_revenue_list();
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['billing.view', 'billing.create']) THEN
    RAISE EXCEPTION 'Billing is not open to your account.' USING ERRCODE = '42501';
  END IF;
  IF p_month IS NULL THEN
    RAISE EXCEPTION 'Pick the month.' USING ERRCODE = '22023';
  END IF;
  v_month := p_month - (extract(day FROM p_month)::integer - 1);
  RETURN jsonb_build_object(
    'month', v_month,
    'locked', EXISTS (SELECT 1 FROM public.period_locks l WHERE l.period_month = v_month AND l.is_locked),
    'lines', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'bill', b.id, 'project', p.id, 'track', p.track_id, 'title', p.title, 'words', b.words, 'amount', b.amount,
               'sub', jsonb_build_object('id', s.id, 'code', s.code, 'name', s.name),
               'party', CASE WHEN s.company_id IS NOT NULL
                             THEN jsonb_build_object('kind', 'subsidiary', 'id', s.company_id, 'name', c.name, 'code', c.short_code)
                             ELSE jsonb_build_object('kind', 'client', 'id', s.id, 'name', coalesce(nullif(btrim(s.bill_name), ''), s.name),
                                                     'code', s.code) END,
               'account', (SELECT a FROM jsonb_array_elements(v_accts) a WHERE a ->> 'code' = pr.revenue_account),
               'invoice', (SELECT jsonb_build_object('id', i.id, 'no', i.invoice_no, 'status', i.status)
                             FROM public.invoices i WHERE i.id = b.invoice_id AND i.status <> 'voided'))
             ORDER BY coalesce(c.short_code, s.name), s.name, p.track_id, b.id)
        FROM public.mkt_bills b
        JOIN public.mkt_projects p ON p.id = b.project_id
        JOIN public.mkt_subsidiaries s ON s.id = b.subsidiary_id
        LEFT JOIN public.companies c ON c.id = s.company_id
        LEFT JOIN public.mkt_products pr ON pr.id = p.product_id
       WHERE b.month = v_month AND b.status = 'confirmed'), '[]'::jsonb),
    -- The month's Marketing invoices typed by hand — on no line of Marketing's — not voided.
    'typed', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', i.id, 'no', i.invoice_no, 'status', i.status, 'total', i.total_amount,
                                          'party', coalesce(c.name, i.billable_to_freetext_name), 'code', c.short_code,
                                          'words', i.description)
             ORDER BY coalesce(c.short_code, i.billable_to_freetext_name), i.invoice_no)
        FROM public.invoices i
        LEFT JOIN public.companies c ON c.id = i.company_id
       WHERE i.period_month = v_month AND i.billing_mode::text = 'marketing_project' AND i.status <> 'voided'
         AND NOT EXISTS (SELECT 1 FROM public.mkt_bills x WHERE x.invoice_id = i.id)), '[]'::jsonb));
END
$fn$;

-- ── Imported: Billing · Create — each party's lines on no live invoice, on one draft ───────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_bill_import(p_month date)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_now   date := v_today - (extract(day FROM v_today)::integer - 1);
  v_month date;
  v_accts jsonb := public.mkt_revenue_list();
  v_words text;
  v_party record;
  v_inv   public.invoices;
  v_s     public.mkt_subsidiaries;
  v_line  integer;
  v_new   boolean;
  v_made  integer := 0;
  v_added integer := 0;
  v_lines integer := 0;
  v_out   jsonb := '[]'::jsonb;
BEGIN
  PERFORM public.tab_write_guard(ARRAY['/invoices/[id]'], ARRAY['billing.create']);
  IF auth.uid() IS NULL OR NOT public.has_any_action(ARRAY['billing.create']) THEN
    RAISE EXCEPTION 'Importing Marketing''s billing needs Billing · Create.' USING ERRCODE = '42501';
  END IF;
  IF p_month IS NULL THEN
    RAISE EXCEPTION 'Pick the month.' USING ERRCODE = '22023';
  END IF;
  v_month := p_month - (extract(day FROM p_month)::integer - 1);
  IF v_month > v_now THEN
    RAISE EXCEPTION 'A month still to come is not billed yet.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.period_locks l WHERE l.period_month = v_month AND l.is_locked) THEN
    RAISE EXCEPTION 'Period % is closed. Contact Principal to reopen.', to_char(v_month, 'Mon YYYY') USING ERRCODE = '22023';
  END IF;
  -- One import a month at a time: the second reads what the first wrote.
  PERFORM pg_advisory_xact_lock(hashtext('mkt_bill_import:' || v_month::text));
  v_words := 'Marketing Service - ' || to_char(v_month, 'Mon') || '''' || to_char(v_month, 'YY');

  -- Each party with lines confirmed and on no live invoice (none, or a voided one): a group company by its company, an
  -- outside client by itself.
  FOR v_party IN
    SELECT s.company_id AS company, CASE WHEN s.company_id IS NULL THEN s.id END AS client,
           array_agg(b.id ORDER BY p.track_id, b.id) AS bills
      FROM public.mkt_bills b
      JOIN public.mkt_projects p ON p.id = b.project_id
      JOIN public.mkt_subsidiaries s ON s.id = b.subsidiary_id
      LEFT JOIN public.companies c ON c.id = s.company_id
     WHERE b.month = v_month AND b.status = 'confirmed'
       AND NOT EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = b.invoice_id AND i.status <> 'voided')
     GROUP BY s.company_id, CASE WHEN s.company_id IS NULL THEN s.id END
     ORDER BY min(coalesce(c.short_code, s.name)), min(s.name)
  LOOP
    -- The draft an import made for this party this month — a line of its own on it — while it is a draft and still
    -- bills that party: added to.
    SELECT i.* INTO v_inv FROM public.invoices i
     WHERE i.status = 'draft' AND i.period_month = v_month AND i.billing_mode::text = 'marketing_project'
       AND i.billable_to_type::text = CASE WHEN v_party.client IS NULL THEN 'subsidiary' ELSE 'freetext' END
       AND i.company_id IS NOT DISTINCT FROM v_party.company
       AND EXISTS (SELECT 1 FROM public.mkt_bills x JOIN public.mkt_subsidiaries xs ON xs.id = x.subsidiary_id
                    WHERE x.invoice_id = i.id AND xs.company_id IS NOT DISTINCT FROM v_party.company
                      AND (CASE WHEN xs.company_id IS NULL THEN xs.id END) IS NOT DISTINCT FROM v_party.client)
     ORDER BY i.created_at, i.id
     LIMIT 1
     FOR UPDATE;
    v_new := NOT FOUND;
    IF NOT v_new THEN
      v_line := (SELECT coalesce(max(l.line_no), 0) FROM public.invoice_lines l WHERE l.invoice_id = v_inv.id);
      v_added := v_added + 1;
    ELSE
      IF v_party.client IS NOT NULL THEN
        SELECT * INTO v_s FROM public.mkt_subsidiaries WHERE id = v_party.client;
      END IF;
      INSERT INTO public.invoices (invoice_no, period_month, billing_mode, category_code, base_amount, total_amount, status,
                                   invoice_date, due_date, description, created_by, billable_to_type, company_id,
                                   billable_to_freetext_name, billable_to_freetext_address, billable_to_freetext_address_parts,
                                   billable_to_freetext_phone, billable_to_freetext_email)
      VALUES (public.mint_invoice_no(v_month), v_month, 'marketing_project', NULL,
              (SELECT sum(b.amount) FROM public.mkt_bills b WHERE b.id = ANY (v_party.bills)),
              (SELECT sum(b.amount) FROM public.mkt_bills b WHERE b.id = ANY (v_party.bills)), 'draft',
              NULL, NULL, v_words, auth.uid(),
              (CASE WHEN v_party.client IS NULL THEN 'subsidiary' ELSE 'freetext' END)::public.billable_to_kind, v_party.company,
              CASE WHEN v_party.client IS NOT NULL THEN coalesce(nullif(btrim(v_s.bill_name), ''), v_s.name) END,
              CASE WHEN v_party.client IS NOT NULL AND v_s.bill_address IS NOT NULL
                   THEN public.address_compose(v_s.bill_address ->> 'line1', v_s.bill_address ->> 'line2', v_s.bill_address ->> 'postcode',
                                               v_s.bill_address ->> 'city', v_s.bill_address ->> 'state', v_s.bill_address ->> 'country') END,
              CASE WHEN v_party.client IS NOT NULL THEN v_s.bill_address END,
              CASE WHEN v_party.client IS NOT NULL THEN nullif(btrim(v_s.bill_phone), '') END,
              CASE WHEN v_party.client IS NOT NULL THEN nullif(btrim(v_s.bill_email), '') END)
      RETURNING * INTO v_inv;
      v_line := 0;
      v_made := v_made + 1;
    END IF;
    -- A line each: its words, its amount, its product's revenue account while Finance's chart still offers it.
    INSERT INTO public.invoice_lines (invoice_id, line_no, description, amount, category_code)
    SELECT v_inv.id, v_line + u.o::integer, b.words, b.amount,
           (SELECT a ->> 'code' FROM jsonb_array_elements(v_accts) a WHERE a ->> 'code' = pr.revenue_account)
      FROM unnest(v_party.bills) WITH ORDINALITY AS u(id, o)
      JOIN public.mkt_bills b ON b.id = u.id
      JOIN public.mkt_projects p ON p.id = b.project_id
      LEFT JOIN public.mkt_products pr ON pr.id = p.product_id;
    UPDATE public.invoices i
       SET base_amount = t.total, total_amount = t.total
      FROM (SELECT sum(l.amount) AS total FROM public.invoice_lines l WHERE l.invoice_id = v_inv.id) t
     WHERE i.id = v_inv.id;
    UPDATE public.mkt_bills SET invoice_id = v_inv.id WHERE id = ANY (v_party.bills);
    v_lines := v_lines + cardinality(v_party.bills);
    v_out := v_out || jsonb_build_array(jsonb_build_object('id', v_inv.id, 'no', v_inv.invoice_no, 'lines', cardinality(v_party.bills),
                                                           'added', NOT v_new));
  END LOOP;
  RETURN jsonb_build_object('month', v_month, 'made', v_made, 'added', v_added, 'lines', v_lines, 'invoices', v_out);
END
$fn$;


CREATE OR REPLACE FUNCTION public.mkt_products()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'The Product Builder is the manager''s.');
  RETURN jsonb_build_object(
    'products', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', p.id, 'code', p.code, 'name', p.name, 'description', p.description, 'kind', p.kind, 'groups', p.groups,
               'intake', p.intake_id, 'price', p.price, 'cost', p.cost, 'account', p.revenue_account, 'effectiveFrom', p.effective_from,
               'status', p.status, 'retiredOn', p.retired_on, 'rev', p.draft_rev, 'version', p.version,
               'changed', p.published_rev IS DISTINCT FROM p.draft_rev,
               'live', (SELECT count(*) FROM public.mkt_projects x WHERE x.product_id = p.id AND x.status NOT IN ('done', 'cancelled')),
               'history', coalesce((SELECT jsonb_agg(jsonb_build_object('version', v.version, 'at', v.published_at, 'note', v.note,
                                                                         'by', (SELECT u.name FROM public.users u WHERE u.id = v.published_by))
                                                      ORDER BY v.version DESC)
                                      FROM public.mkt_product_versions v WHERE v.product_id = p.id), '[]'::jsonb),
               'updatedAt', p.updated_at, 'updatedBy', (SELECT u.name FROM public.users u WHERE u.id = p.updated_by))
             ORDER BY CASE p.status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END, p.created_at, p.id)
        FROM public.mkt_products p), '[]'::jsonb),
    -- The revenue accounts a product's billing may post to (2026-10-26 — Finance's chart; mkt_revenue_list).
    'accounts', public.mkt_revenue_list(),
    -- The pickers: every workflow template and minutes template, published or not (a draft is linked, then published).
    'workflows', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', w.id, 'action', w.action, 'tname', w.tname, 'version', w.version,
               'stages', jsonb_array_length(coalesce(v.stages, w.draft)),
               'days', (SELECT coalesce(sum((s ->> 'sla')::integer), 0) FROM jsonb_array_elements(coalesce(v.stages, w.draft)) s),
               'pic', (SELECT count(*) FROM jsonb_array_elements(coalesce(v.stages, w.draft)) s, jsonb_array_elements(s -> 'appr') a
                        WHERE a ->> 'kind' = 'pic'))
             ORDER BY lower(w.action), w.created_at)
        FROM public.mkt_workflows w
        LEFT JOIN public.mkt_workflow_versions v ON v.workflow_id = w.id AND v.version = w.version), '[]'::jsonb),
    'minutes', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'version', t.version,
               'fields', jsonb_array_length(t.fields)) ORDER BY t.created_at)
        FROM public.mkt_minutes_templates t), '[]'::jsonb));
END
$fn$;

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
                                                  'at', b.confirmed_at,
                                                  -- The invoice Finance put it on (2026-10-26), unless voided.
                                                  'invoice', (SELECT jsonb_build_object('no', i.invoice_no, 'status', i.status)
                                                                FROM public.invoices i WHERE i.id = b.invoice_id AND i.status <> 'voided'))
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

CREATE OR REPLACE FUNCTION public.mkt_bill_withdraw(p_bill uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_b public.mkt_bills;
  v_no text;
  v_st text;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'Withdrawing a confirmation is the manager''s.');
  SELECT * INTO v_b FROM public.mkt_bills WHERE id = p_bill FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That confirmation is not there.' USING ERRCODE = 'P0002';
  END IF;
  IF v_b.status <> 'confirmed' THEN
    RAISE EXCEPTION 'It was withdrawn already.' USING ERRCODE = '22023';
  END IF;
  -- On an invoice Finance has (2026-10-26): not withdrawn from under it — Finance deletes the draft, or voids it, first.
  SELECT i.invoice_no, i.status::text INTO v_no, v_st FROM public.invoices i WHERE i.id = v_b.invoice_id AND i.status <> 'voided';
  IF FOUND THEN
    RAISE EXCEPTION 'Finance has it on % (%) — ask Finance to %, then withdraw it.', v_no, initcap(replace(v_st, '_', ' ')),
      CASE WHEN v_st = 'draft' THEN 'delete that draft' ELSE 'void that invoice' END USING ERRCODE = '22023';
  END IF;
  UPDATE public.mkt_bills
     SET status = 'withdrawn', withdrawn_by = auth.uid(), withdrawn_name = public.mkt_actor(), withdrawn_at = now()
   WHERE id = v_b.id;
  PERFORM public.mkt_log(v_b.project_id, 'billing withdrawn', p_data => jsonb_build_object('month', to_char(v_b.month, 'YYYY-MM')));
  RETURN public.mkt_billing(v_b.month);
END
$fn$;

-- The import asks the invoice page's Create box in the database too, as generate_monthly_invoices does — said here so
-- src/lib/tab-write-guards.test.ts holds it to the app's gate in front of it (hubImportMarketing).
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
SELECT pg_temp.tab_guard('public.mkt_bill_import(date)', $$ARRAY['/invoices/[id]']$$, ARRAY['billing.create']);

REVOKE ALL ON FUNCTION public.mkt_revenue_list() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_revenue_list() TO service_role;
REVOKE ALL ON FUNCTION public.mkt_product_account(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_bill_import_preview(date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_bill_import(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_product_account(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_bill_import_preview(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_bill_import(date) TO authenticated;

NOTIFY pgrst, 'reload schema';
