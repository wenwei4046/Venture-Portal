-- Fixed assets and their depreciation (2026-11-24 — the user: "能做一个折旧表在系统吗？" … "这个我要自己能维护" →
-- "Yes, build it"). Finance keeps the classes (life, residual, when it starts, which accounts) and the register (each
-- purchase on a fixed-asset account is an asset, its lines grouped by what was bought); the page works the schedule
-- out (lib/fixed-assets.ts) and posts it month by month: one journal entry a month, Dr depreciation, Cr accumulated
-- depreciation, the asset by asset lines under it — fa_postings remembers what each month posted for each asset, so a
-- month is never posted twice and a later month takes what is left over what is left of the life. Undo reverses the
-- months from one on (a VOID pair, as a voucher's), for a class changed after them.

-- ── The accounts ────────────────────────────────────────────────────────────
INSERT INTO public.chart_of_accounts (code, name, type, parent_code, cash_flow_category, sort_order, is_active)
VALUES
  ('2090', 'Accumulated Depreciation - Equipment / Computer', 'fixed_asset', NULL, 'investing', 2090, true),
  ('2091', 'Accumulated Depreciation - Renovation', 'fixed_asset', NULL, 'investing', 2091, true),
  ('2092', 'Accumulated Depreciation - Furniture & Fittings', 'fixed_asset', NULL, 'investing', 2092, true),
  ('9100', 'Depreciation', 'expense', NULL, 'operating', 9100, true)
ON CONFLICT (code) DO NOTHING;

-- ── The classes: how a kind of asset is depreciated ─────────────────────────
CREATE TABLE IF NOT EXISTS public.fa_classes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL UNIQUE CHECK (btrim(name) <> ''),
  life_months     integer NOT NULL CHECK (life_months BETWEEN 1 AND 600),
  residual_pct    numeric(5, 2) NOT NULL DEFAULT 0 CHECK (residual_pct >= 0 AND residual_pct < 100),
  start_rule      text NOT NULL DEFAULT 'purchase_month' CHECK (start_rule IN ('purchase_month', 'next_month')),
  asset_account   varchar NOT NULL REFERENCES public.chart_of_accounts(code),
  accum_account   varchar NOT NULL REFERENCES public.chart_of_accounts(code),
  expense_account varchar NOT NULL REFERENCES public.chart_of_accounts(code),
  is_active       boolean NOT NULL DEFAULT true,
  sort_order      integer NOT NULL DEFAULT 100,
  updated_by      uuid REFERENCES public.users(id),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ── The register: an asset, and the purchase lines it is made of ────────────
CREATE TABLE IF NOT EXISTS public.fa_assets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL CHECK (btrim(name) <> ''),
  class_id        uuid NOT NULL REFERENCES public.fa_classes(id),
  in_service_date date NOT NULL,
  life_months     integer CHECK (life_months IS NULL OR life_months BETWEEN 1 AND 600),
  disposed_on     date,
  notes           text,
  updated_by      uuid REFERENCES public.users(id),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.fa_asset_lines (
  journal_line_id uuid PRIMARY KEY REFERENCES public.journal_lines(id),
  asset_id        uuid NOT NULL REFERENCES public.fa_assets(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS fa_asset_lines_asset ON public.fa_asset_lines (asset_id);

-- ── What each month posted for each asset ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fa_postings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id         uuid NOT NULL REFERENCES public.fa_assets(id),
  month            date NOT NULL CHECK (month = date_trunc('month', month)::date),
  amount           numeric(15, 2) NOT NULL CHECK (amount >= 0),
  journal_entry_id uuid NOT NULL REFERENCES public.journal_entries(id),
  created_by       uuid REFERENCES public.users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, month)
);
CREATE INDEX IF NOT EXISTS fa_postings_month ON public.fa_postings (month);

ALTER TABLE public.fa_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fa_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fa_asset_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fa_postings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fa_classes, public.fa_assets, public.fa_asset_lines, public.fa_postings FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.fa_classes, public.fa_assets, public.fa_asset_lines, public.fa_postings TO service_role;

SELECT public.audit_register('fa_classes', 'Fixed asset classes', 'Treasury', '{reconciliation}', p_labels => '{name,life_months}');
SELECT public.audit_register('fa_assets', 'Fixed assets', 'Treasury', '{reconciliation}', p_labels => '{name,in_service_date}');
SELECT public.audit_register('fa_asset_lines', 'Fixed asset purchase lines', 'Treasury', '{reconciliation}', p_labels => '{asset_id}');
SELECT public.audit_register('fa_postings', 'Depreciation postings', 'Treasury', '{reconciliation}', p_labels => '{month,amount}');

-- The classes to start from — Finance changes them on the page.
INSERT INTO public.fa_classes (name, life_months, residual_pct, start_rule, asset_account, accum_account, expense_account, sort_order) VALUES
  ('Computer & equipment', 36, 0, 'purchase_month', '2000', '2090', '9100', 10),
  ('Renovation', 60, 0, 'purchase_month', '2001', '2091', '9100', 20),
  ('Furniture & fittings', 60, 0, 'purchase_month', '2002', '2092', '9100', 30)
ON CONFLICT (name) DO NOTHING;

-- ── The page's tab ──────────────────────────────────────────────────────────
INSERT INTO public.permission_page_tabs (page, tab_id) VALUES
  ('/reconciliation/fixed-assets', 'fin.journal_entries')
ON CONFLICT DO NOTHING;

-- ── Reading: the classes, the register, the purchase lines, what was posted ─
CREATE OR REPLACE FUNCTION public.fa_read()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT coalesce(public.has_any_action(ARRAY['reconciliation.view']), false) THEN
    RAISE EXCEPTION 'fa_read: needs Reconciliation · View' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'classes', coalesce((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'life_months', c.life_months,
        'residual_pct', c.residual_pct, 'start_rule', c.start_rule, 'asset_account', c.asset_account,
        'accum_account', c.accum_account, 'expense_account', c.expense_account, 'is_active', c.is_active)
        ORDER BY c.sort_order, c.name) FROM fa_classes c), '[]'::jsonb),
    'assets', coalesce((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'class_id', a.class_id,
        'in_service_date', a.in_service_date, 'life_months', a.life_months, 'disposed_on', a.disposed_on, 'notes', a.notes)
        ORDER BY a.in_service_date, a.name) FROM fa_assets a), '[]'::jsonb),
    -- Every live line on an account a class depreciates.
    'lines', coalesce((SELECT jsonb_agg(jsonb_build_object('id', jl.id, 'date', je.transaction_date, 'entry_no', je.entry_no,
        'entry_description', je.description, 'description', jl.description, 'account', jl.account_code,
        'amount', coalesce(jl.debit, 0) - coalesce(jl.credit, 0), 'asset_id', fl.asset_id)
        ORDER BY je.transaction_date, je.created_at, jl.created_at)
      FROM journal_lines jl
      JOIN journal_entries je ON je.id = jl.entry_id AND NOT je.is_reversed
      LEFT JOIN fa_asset_lines fl ON fl.journal_line_id = jl.id
      WHERE jl.account_code IN (SELECT asset_account FROM fa_classes)), '[]'::jsonb),
    'postings', coalesce((SELECT jsonb_agg(jsonb_build_object('asset_id', p.asset_id, 'month', to_char(p.month, 'YYYY-MM'),
        'amount', p.amount, 'journal_entry_id', p.journal_entry_id) ORDER BY p.month) FROM fa_postings p), '[]'::jsonb)
  );
END
$fn$;

-- ── A class kept: {id?, name, life_months, residual_pct, start_rule, asset_account, accum_account, expense_account, is_active}
CREATE OR REPLACE FUNCTION public.fa_save_class(p jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_id   uuid := nullif(p ->> 'id', '')::uuid;
  v_code text;
BEGIN
  PERFORM public.tab_write_guard(ARRAY['/reconciliation/fixed-assets'], ARRAY['reconciliation.edit']);
  IF auth.uid() IS NOT NULL AND NOT coalesce(public.has_any_action(ARRAY['reconciliation.edit']), false) THEN
    RAISE EXCEPTION 'fa_save_class: needs Reconciliation · Edit' USING ERRCODE = '42501';
  END IF;
  FOREACH v_code IN ARRAY ARRAY[p ->> 'asset_account', p ->> 'accum_account', p ->> 'expense_account'] LOOP
    IF NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = v_code AND is_active) THEN
      RAISE EXCEPTION 'No active account %', coalesce(v_code, '(none)');
    END IF;
    IF EXISTS (SELECT 1 FROM chart_of_accounts WHERE parent_code = v_code) THEN
      RAISE EXCEPTION 'Account % is a header — pick one under it', v_code;
    END IF;
  END LOOP;
  IF (SELECT type FROM chart_of_accounts WHERE code = p ->> 'asset_account')::text <> 'fixed_asset'
     OR (SELECT type FROM chart_of_accounts WHERE code = p ->> 'accum_account')::text <> 'fixed_asset' THEN
    RAISE EXCEPTION 'The asset and accumulated depreciation accounts are fixed-asset accounts';
  END IF;
  IF (SELECT type FROM chart_of_accounts WHERE code = p ->> 'expense_account')::text NOT IN ('expense', 'cost') THEN
    RAISE EXCEPTION 'The depreciation account is an expense account';
  END IF;
  IF v_id IS NULL THEN
    INSERT INTO fa_classes (name, life_months, residual_pct, start_rule, asset_account, accum_account, expense_account, is_active, updated_by)
    VALUES (btrim(p ->> 'name'), (p ->> 'life_months')::int, coalesce((p ->> 'residual_pct')::numeric, 0),
            coalesce(p ->> 'start_rule', 'purchase_month'), p ->> 'asset_account', p ->> 'accum_account', p ->> 'expense_account',
            coalesce((p ->> 'is_active')::boolean, true), auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE fa_classes SET name = btrim(p ->> 'name'), life_months = (p ->> 'life_months')::int,
           residual_pct = coalesce((p ->> 'residual_pct')::numeric, 0), start_rule = coalesce(p ->> 'start_rule', 'purchase_month'),
           asset_account = p ->> 'asset_account', accum_account = p ->> 'accum_account', expense_account = p ->> 'expense_account',
           is_active = coalesce((p ->> 'is_active')::boolean, true), updated_by = auth.uid(), updated_at = now()
     WHERE id = v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Class not found'; END IF;
  END IF;
  RETURN v_id;
END
$fn$;

-- ── An asset kept: {id?, name, class_id, in_service_date, life_months?, disposed_on?, notes?, line_ids[]}.
-- Its lines are the ones named; a line taken from another asset leaves it, and an asset left with none goes.
CREATE OR REPLACE FUNCTION public.fa_save_asset(p jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_id    uuid := nullif(p ->> 'id', '')::uuid;
  v_lines uuid[] := ARRAY(SELECT (x)::uuid FROM jsonb_array_elements_text(coalesce(p -> 'line_ids', '[]'::jsonb)) x);
BEGIN
  PERFORM public.tab_write_guard(ARRAY['/reconciliation/fixed-assets'], ARRAY['reconciliation.edit']);
  IF auth.uid() IS NOT NULL AND NOT coalesce(public.has_any_action(ARRAY['reconciliation.edit']), false) THEN
    RAISE EXCEPTION 'fa_save_asset: needs Reconciliation · Edit' USING ERRCODE = '42501';
  END IF;
  IF coalesce(array_length(v_lines, 1), 0) = 0 THEN RAISE EXCEPTION 'An asset is made of at least one purchase line'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_lines) l WHERE NOT EXISTS (
      SELECT 1 FROM journal_lines jl WHERE jl.id = l AND jl.account_code IN (SELECT asset_account FROM fa_classes))) THEN
    RAISE EXCEPTION 'A line is not on an account a class depreciates';
  END IF;
  IF nullif(p ->> 'disposed_on', '') IS NOT NULL AND (p ->> 'disposed_on')::date < (p ->> 'in_service_date')::date THEN
    RAISE EXCEPTION 'Disposed before it was in service';
  END IF;
  IF v_id IS NULL THEN
    INSERT INTO fa_assets (name, class_id, in_service_date, life_months, disposed_on, notes, updated_by)
    VALUES (btrim(p ->> 'name'), (p ->> 'class_id')::uuid, (p ->> 'in_service_date')::date, nullif(p ->> 'life_months', '')::int,
            nullif(p ->> 'disposed_on', '')::date, nullif(btrim(coalesce(p ->> 'notes', '')), ''), auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE fa_assets SET name = btrim(p ->> 'name'), class_id = (p ->> 'class_id')::uuid, in_service_date = (p ->> 'in_service_date')::date,
           life_months = nullif(p ->> 'life_months', '')::int, disposed_on = nullif(p ->> 'disposed_on', '')::date,
           notes = nullif(btrim(coalesce(p ->> 'notes', '')), ''), updated_by = auth.uid(), updated_at = now()
     WHERE id = v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Asset not found'; END IF;
  END IF;
  DELETE FROM fa_asset_lines WHERE asset_id = v_id AND journal_line_id <> ALL (v_lines);
  INSERT INTO fa_asset_lines (journal_line_id, asset_id) SELECT l, v_id FROM unnest(v_lines) l
  ON CONFLICT (journal_line_id) DO UPDATE SET asset_id = excluded.asset_id;
  -- An asset its lines all left, and nothing posted for it, goes.
  DELETE FROM fa_assets a WHERE a.id <> v_id AND NOT EXISTS (SELECT 1 FROM fa_asset_lines fl WHERE fl.asset_id = a.id)
     AND NOT EXISTS (SELECT 1 FROM fa_postings fp WHERE fp.asset_id = a.id);
  RETURN v_id;
END
$fn$;

-- ── Posting: one row a month — {month 'YYYY-MM', date, description, lines, postings: [{asset_id, amount}]} ─
CREATE OR REPLACE FUNCTION public.fa_post(p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  r     jsonb;
  x     jsonb;
  v_je  uuid;
  v_mon date;
  v_n   integer := 0;
BEGIN
  PERFORM public.tab_write_guard(ARRAY['/reconciliation/fixed-assets'], ARRAY['reconciliation.create']);
  IF auth.uid() IS NOT NULL AND NOT coalesce(public.has_any_action(ARRAY['reconciliation.create']), false) THEN
    RAISE EXCEPTION 'fa_post: needs Reconciliation · Create' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_rows) <> 'array' THEN RAISE EXCEPTION 'Nothing to post'; END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    v_mon := ((r ->> 'month') || '-01')::date;
    IF v_mon > date_trunc('month', (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)::date THEN
      RAISE EXCEPTION 'Depreciation for % is not due yet', r ->> 'month';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(r -> 'postings') x2
                WHERE EXISTS (SELECT 1 FROM fa_postings fp WHERE fp.asset_id = (x2 ->> 'asset_id')::uuid AND fp.month = v_mon)) THEN
      RAISE EXCEPTION '% is already posted for an asset — refresh the page', r ->> 'month';
    END IF;
    v_je := post_journal_entry((r ->> 'date')::date, left(coalesce(r ->> 'description', 'Depreciation'), 240), 'depreciation',
                               NULL, auth.uid(), r -> 'lines');
    FOR x IN SELECT value FROM jsonb_array_elements(r -> 'postings') LOOP
      INSERT INTO fa_postings (asset_id, month, amount, journal_entry_id, created_by)
      VALUES ((x ->> 'asset_id')::uuid, v_mon, round((x ->> 'amount')::numeric, 2), v_je, auth.uid());
    END LOOP;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END
$fn$;

-- ── Undo: every month from p_from on — each entry reversed by a VOID entry, the pair kept out of the reports ─
CREATE OR REPLACE FUNCTION public.fa_undo_from(p_from date)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_je    record;
  v_lines jsonb;
  v_void  uuid;
  v_n     integer := 0;
BEGIN
  PERFORM public.tab_write_guard(ARRAY['/reconciliation/fixed-assets'], ARRAY['reconciliation.create']);
  IF auth.uid() IS NOT NULL AND NOT coalesce(public.has_any_action(ARRAY['reconciliation.create']), false) THEN
    RAISE EXCEPTION 'fa_undo_from: needs Reconciliation · Create' USING ERRCODE = '42501';
  END IF;
  FOR v_je IN SELECT DISTINCT je.id, je.transaction_date, je.description
                FROM fa_postings fp JOIN journal_entries je ON je.id = fp.journal_entry_id
               WHERE fp.month >= date_trunc('month', p_from)::date AND NOT je.is_reversed
               ORDER BY je.transaction_date DESC LOOP
    SELECT jsonb_agg(jsonb_build_object('account_code', jl.account_code, 'debit', coalesce(jl.credit, 0), 'credit', coalesce(jl.debit, 0),
                     'description', 'Reversal — ' || coalesce(jl.description, '')))
      INTO v_lines FROM journal_lines jl WHERE jl.entry_id = v_je.id;
    v_void := post_journal_entry(v_je.transaction_date, left('VOID: reversal of ' || v_je.description, 240), 'depreciation_void',
                                 v_je.id, auth.uid(), v_lines);
    UPDATE journal_entries SET is_reversed = true, reversed_by_id = v_void WHERE id = v_je.id;
    UPDATE journal_entries SET is_reversed = true, reversed_by_id = v_je.id WHERE id = v_void;
    v_n := v_n + 1;
  END LOOP;
  DELETE FROM fa_postings WHERE month >= date_trunc('month', p_from)::date;
  RETURN v_n;
END
$fn$;

-- Each write asks its page, as the app's gate in front of it (src/lib/tab-write-guards.test.ts).
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

SELECT pg_temp.tab_guard('public.fa_save_class(jsonb)', $$ARRAY['/reconciliation/fixed-assets']$$, ARRAY['reconciliation.edit']);
SELECT pg_temp.tab_guard('public.fa_save_asset(jsonb)', $$ARRAY['/reconciliation/fixed-assets']$$, ARRAY['reconciliation.edit']);
SELECT pg_temp.tab_guard('public.fa_post(jsonb)', $$ARRAY['/reconciliation/fixed-assets']$$, ARRAY['reconciliation.create']);
SELECT pg_temp.tab_guard('public.fa_undo_from(date)', $$ARRAY['/reconciliation/fixed-assets']$$, ARRAY['reconciliation.create']);

REVOKE ALL ON FUNCTION public.fa_read() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fa_save_class(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fa_save_asset(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fa_post(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fa_undo_from(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fa_read() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fa_save_class(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fa_save_asset(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fa_post(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fa_undo_from(date) TO authenticated, service_role;
