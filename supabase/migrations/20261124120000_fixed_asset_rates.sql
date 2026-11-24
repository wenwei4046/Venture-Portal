-- Fixed assets depreciate at an annual rate (2026-11-24 — the user's Carres PPE listing as the sample, then: "输入每年
-- 折旧率 %"). A class carries its rate (10% = a tenth of the cost a year, so ten years); an asset may carry its own.
-- The monthly charge is the depreciable amount × rate ÷ 12, until nothing is left. life_months stays filled (the
-- months the rate comes to, rounded up) for whoever read it; nothing works from it any more.

ALTER TABLE public.fa_classes ADD COLUMN IF NOT EXISTS rate_pct numeric(6, 3);
UPDATE public.fa_classes SET rate_pct = round(1200.0 / life_months, 3) WHERE rate_pct IS NULL;
ALTER TABLE public.fa_classes ALTER COLUMN rate_pct SET NOT NULL;
ALTER TABLE public.fa_classes DROP CONSTRAINT IF EXISTS fa_classes_rate_pct_check;
ALTER TABLE public.fa_classes ADD CONSTRAINT fa_classes_rate_pct_check CHECK (rate_pct > 0 AND rate_pct <= 100);

ALTER TABLE public.fa_assets ADD COLUMN IF NOT EXISTS rate_pct numeric(6, 3);
UPDATE public.fa_assets SET rate_pct = round(1200.0 / life_months, 3) WHERE rate_pct IS NULL AND life_months IS NOT NULL;
ALTER TABLE public.fa_assets DROP CONSTRAINT IF EXISTS fa_assets_rate_pct_check;
ALTER TABLE public.fa_assets ADD CONSTRAINT fa_assets_rate_pct_check CHECK (rate_pct IS NULL OR (rate_pct > 0 AND rate_pct <= 100));

COMMENT ON COLUMN public.fa_classes.rate_pct IS 'Annual depreciation rate, % of the depreciable amount (2026-11-24).';
COMMENT ON COLUMN public.fa_assets.rate_pct IS 'The asset''s own annual rate; null = its class''s.';

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
    'classes', coalesce((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'rate_pct', c.rate_pct,
        'residual_pct', c.residual_pct, 'start_rule', c.start_rule, 'asset_account', c.asset_account,
        'accum_account', c.accum_account, 'expense_account', c.expense_account, 'is_active', c.is_active)
        ORDER BY c.sort_order, c.name) FROM fa_classes c), '[]'::jsonb),
    'assets', coalesce((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'class_id', a.class_id,
        'in_service_date', a.in_service_date, 'rate_pct', a.rate_pct, 'disposed_on', a.disposed_on, 'notes', a.notes)
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

-- ── A class kept: {id?, name, rate_pct, residual_pct, start_rule, asset_account, accum_account, expense_account, is_active}
CREATE OR REPLACE FUNCTION public.fa_save_class(p jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_id   uuid := nullif(p ->> 'id', '')::uuid;
  v_code text;
  v_rate numeric := (p ->> 'rate_pct')::numeric;
BEGIN
  PERFORM public.tab_write_guard(ARRAY['/reconciliation/fixed-assets'], ARRAY['reconciliation.edit']);
  IF auth.uid() IS NOT NULL AND NOT coalesce(public.has_any_action(ARRAY['reconciliation.edit']), false) THEN
    RAISE EXCEPTION 'fa_save_class: needs Reconciliation · Edit' USING ERRCODE = '42501';
  END IF;
  IF v_rate IS NULL OR v_rate <= 0 OR v_rate > 100 THEN RAISE EXCEPTION 'The rate is more than 0 and at most 100%%'; END IF;
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
    INSERT INTO fa_classes (name, rate_pct, life_months, residual_pct, start_rule, asset_account, accum_account, expense_account, is_active, updated_by)
    VALUES (btrim(p ->> 'name'), v_rate, ceil(1200 / v_rate)::int, coalesce((p ->> 'residual_pct')::numeric, 0),
            coalesce(p ->> 'start_rule', 'purchase_month'), p ->> 'asset_account', p ->> 'accum_account', p ->> 'expense_account',
            coalesce((p ->> 'is_active')::boolean, true), auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE fa_classes SET name = btrim(p ->> 'name'), rate_pct = v_rate, life_months = ceil(1200 / v_rate)::int,
           residual_pct = coalesce((p ->> 'residual_pct')::numeric, 0), start_rule = coalesce(p ->> 'start_rule', 'purchase_month'),
           asset_account = p ->> 'asset_account', accum_account = p ->> 'accum_account', expense_account = p ->> 'expense_account',
           is_active = coalesce((p ->> 'is_active')::boolean, true), updated_by = auth.uid(), updated_at = now()
     WHERE id = v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Class not found'; END IF;
  END IF;
  RETURN v_id;
END
$fn$;

-- ── An asset kept: {id?, name, class_id, in_service_date, rate_pct?, disposed_on?, notes?, line_ids[]}.
CREATE OR REPLACE FUNCTION public.fa_save_asset(p jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_id    uuid := nullif(p ->> 'id', '')::uuid;
  v_lines uuid[] := ARRAY(SELECT (x)::uuid FROM jsonb_array_elements_text(coalesce(p -> 'line_ids', '[]'::jsonb)) x);
  v_rate  numeric := nullif(p ->> 'rate_pct', '')::numeric;
BEGIN
  PERFORM public.tab_write_guard(ARRAY['/reconciliation/fixed-assets'], ARRAY['reconciliation.edit']);
  IF auth.uid() IS NOT NULL AND NOT coalesce(public.has_any_action(ARRAY['reconciliation.edit']), false) THEN
    RAISE EXCEPTION 'fa_save_asset: needs Reconciliation · Edit' USING ERRCODE = '42501';
  END IF;
  IF coalesce(array_length(v_lines, 1), 0) = 0 THEN RAISE EXCEPTION 'An asset is made of at least one purchase line'; END IF;
  IF v_rate IS NOT NULL AND (v_rate <= 0 OR v_rate > 100) THEN RAISE EXCEPTION 'The rate is more than 0 and at most 100%%'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_lines) l WHERE NOT EXISTS (
      SELECT 1 FROM journal_lines jl WHERE jl.id = l AND jl.account_code IN (SELECT asset_account FROM fa_classes))) THEN
    RAISE EXCEPTION 'A line is not on an account a class depreciates';
  END IF;
  IF nullif(p ->> 'disposed_on', '') IS NOT NULL AND (p ->> 'disposed_on')::date < (p ->> 'in_service_date')::date THEN
    RAISE EXCEPTION 'Disposed before it was in service';
  END IF;
  IF v_id IS NULL THEN
    INSERT INTO fa_assets (name, class_id, in_service_date, rate_pct, disposed_on, notes, updated_by)
    VALUES (btrim(p ->> 'name'), (p ->> 'class_id')::uuid, (p ->> 'in_service_date')::date, v_rate,
            nullif(p ->> 'disposed_on', '')::date, nullif(btrim(coalesce(p ->> 'notes', '')), ''), auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE fa_assets SET name = btrim(p ->> 'name'), class_id = (p ->> 'class_id')::uuid, in_service_date = (p ->> 'in_service_date')::date,
           rate_pct = v_rate, life_months = NULL, disposed_on = nullif(p ->> 'disposed_on', '')::date,
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

-- Each write still asks its page (src/lib/tab-write-guards.test.ts).
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
