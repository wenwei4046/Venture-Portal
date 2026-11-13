-- Interest in suspense: where a deal's own accounts sit (2026-11-13, after the go-live of 20261113140000).
--
-- The chart refuses a sub-account under an account that already has postings (coa_reject_child_under_posted_account),
-- and every counterparty account (3053 The Cont, 4052 HOUZS Century …) carries history the user will not have moved
-- ("不想弄乱"). So a deal's own account sits beside its counterparty, under the same group (3020 Loans Receivable,
-- 4100 / 4200 Amount Due to), its name saying whose it is; its IIS account under 3060 / 4060. ensure_deal_accounts
-- makes them there; no per-counterparty IIS account is made any more.

CREATE OR REPLACE FUNCTION public.ensure_deal_accounts(p_kind text, p_id uuid, p_park boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_live     date;
  v_code     text;
  v_iis      text;
  v_cp       text;
  v_party    text;
  v_short    text;
  v_initials text;
  v_rate     numeric;
  v_words    text;
  v_amount   numeric;
  v_start    date;
  v_tag      text;
  v_iisroot  text;
  v_iiscp    text;
  v_label    text;
  v_insusp   boolean;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT coalesce(public.has_any_action(ARRAY['treasury.create', 'treasury.edit', 'treasury.approve', 'approvals.approve']), false) THEN
    RAISE EXCEPTION 'ensure_deal_accounts: needs Treasury' USING ERRCODE = '42501';
  END IF;
  SELECT live_from INTO v_live FROM iis_settings;
  IF v_live IS NULL AND NOT coalesce(p_park, false) THEN
    RETURN NULL;
  END IF;

  IF p_kind = 'loan' THEN
    SELECT l.gl_account_code, l.iis_account_code, co.name, co.short_code, l.effective_rate, coalesce(l.repayment_terms, ''), l.principal, l.disbursement_date
      INTO v_code, v_iis, v_party, v_short, v_rate, v_words, v_amount, v_start
      FROM loans l JOIN companies co ON co.id = l.company_id WHERE l.id = p_id FOR UPDATE OF l;
    IF NOT FOUND THEN RAISE EXCEPTION 'Loan % not found', p_id; END IF;
    IF v_code IS NOT NULL THEN RETURN jsonb_build_object('account', v_code, 'iis', v_iis); END IF;
    SELECT code INTO v_cp FROM chart_of_accounts
     WHERE parent_code = '3020' AND is_active AND code NOT BETWEEN '3100' AND '3899'
       AND (name ILIKE '%' || v_party || '%' OR (v_short IS NOT NULL AND name ILIKE '%' || v_short || '%'))
     ORDER BY code LIMIT 1;
    IF v_cp IS NULL THEN
      RAISE EXCEPTION 'No account under 3020 Loans Receivable for % — add "Amount due from - %" first', v_party, v_party;
    END IF;
    v_iisroot := '3060';
  ELSIF p_kind = 'fund_source' THEN
    SELECT f.account_code, f.iis_account_code,
           coalesce(c.name, d.name, dp.name, nullif(f.from_freetext_name, ''), 'Fund source'), c.short_code,
           CASE WHEN d.name IS NOT NULL THEN (SELECT string_agg(left(w, 1), '' ORDER BY o) FROM unnest((string_to_array(btrim(d.name), ' '))[2:]) WITH ORDINALITY AS t(w, o)) END,
           f.cost_rate, coalesce(f.notes, ''), f.amount, f.effective_date
      INTO v_cp, v_iis, v_party, v_short, v_initials, v_rate, v_words, v_amount, v_start
      FROM fund_sources f
      LEFT JOIN companies c ON c.id = f.from_company_id
      LEFT JOIN directors d ON d.id = f.from_director_id
      LEFT JOIN departments dp ON dp.id = f.from_department_id
     WHERE f.id = p_id FOR UPDATE OF f;
    IF NOT FOUND THEN RAISE EXCEPTION 'Fund source % not found', p_id; END IF;
    IF v_cp IS NULL THEN RAISE EXCEPTION 'The fund source has no account'; END IF;
    IF v_cp BETWEEN '4300' AND '4699' THEN RETURN jsonb_build_object('account', v_cp, 'iis', v_iis); END IF;
    v_iisroot := '4060';
  ELSE
    RAISE EXCEPTION 'Unknown deal kind %', p_kind;
  END IF;

  v_tag := (regexp_match(v_words, '\[(?:LO|BI)[^\]]*\]'))[1];
  v_label := left(coalesce(v_tag || ' · ', '') || v_party || ' · RM ' || to_char(v_amount, 'FM999,999,990.00') || ' · ' || to_char(v_start, 'YYYY-MM-DD'), 120);

  -- The deal's own account: the next free code of its range — in suspense or not, so the code says where its interest goes.
  v_insusp := coalesce(v_rate, 0) > 0 AND v_words !~ '\[(LO|BI)#19\]';
  SELECT n::text INTO v_code FROM generate_series(
           CASE WHEN p_kind = 'loan' THEN CASE WHEN v_insusp THEN 3100 ELSE 3400 END ELSE CASE WHEN v_insusp THEN 4300 ELSE 4600 END END,
           CASE WHEN p_kind = 'loan' THEN CASE WHEN v_insusp THEN 3399 ELSE 3499 END ELSE CASE WHEN v_insusp THEN 4599 ELSE 4699 END END) n
   WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = n::text) ORDER BY n LIMIT 1;
  IF v_code IS NULL THEN RAISE EXCEPTION 'No free code left for a deal account'; END IF;
  INSERT INTO chart_of_accounts (code, name, type, parent_code, is_active, sort_order, cash_flow_category, is_internal_fund)
  SELECT v_code, v_label, cp.type, CASE WHEN p_park THEN NULL ELSE cp.parent_code END, true, cp.sort_order, cp.cash_flow_category, cp.is_internal_fund
    FROM chart_of_accounts cp WHERE cp.code = v_cp;

  -- Bearing interest (not the back-to-back LO#19 / BI#19): its IIS account under 3060 / 4060.
  IF v_insusp THEN
    v_iiscp := v_iisroot;
    SELECT n::text INTO v_iis FROM generate_series(CASE WHEN p_kind = 'loan' THEN 3500 ELSE 4700 END, CASE WHEN p_kind = 'loan' THEN 3899 ELSE 4999 END) n
     WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = n::text) ORDER BY n LIMIT 1;
    IF v_iis IS NULL THEN RAISE EXCEPTION 'No free code left for an IIS account'; END IF;
    INSERT INTO chart_of_accounts (code, name, type, parent_code, is_active, sort_order, cash_flow_category, is_internal_fund)
    SELECT v_iis, left(coalesce(v_tag || ' IIS · ', 'IIS · ') || v_party || ' · RM ' || to_char(v_amount, 'FM999,999,990.00'), 120),
           r.type, CASE WHEN p_park THEN NULL ELSE v_iiscp END, true, r.sort_order, r.cash_flow_category, r.is_internal_fund
      FROM chart_of_accounts r WHERE r.code = v_iiscp;
  END IF;

  IF p_kind = 'loan' THEN
    UPDATE loans SET gl_account_code = v_code, iis_account_code = v_iis, updated_at = now() WHERE id = p_id;
  ELSE
    UPDATE fund_sources SET account_code = v_code, iis_account_code = v_iis, updated_at = now() WHERE id = p_id;
  END IF;
  RETURN jsonb_build_object('account', v_code, 'iis', v_iis);
END
$fn$;
