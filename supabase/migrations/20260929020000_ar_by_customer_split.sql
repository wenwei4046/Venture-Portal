-- AR by customer, step 2 of 2: the split (2026-09-29).
--
-- Gives 3030 a child per customer and moves all 419 existing lines onto them,
-- so "Accounts Receivable" opens up in the reports the way "Amount due from"
-- already does. From here the header guard blocks posting to 3030 itself —
-- which is what the user asked for ("对，我就是要 3030 不能记账了") — and every
-- posting path resolves a customer account through ar_account_code_for()
-- (step 1, mig 20260929010000), shipped ahead of this.
--
-- Each line's owner is read off the record it came from, never guessed:
--   invoice JE            → that invoice's counterparty
--   receipt / void        → the invoice it settles, else the voucher's payee
--   credit note           → the invoice it credits
--   five hand-read lines  → named below; each cancels another line of the same
--                           party, so they move as pairs.
-- Checked before running: the per-customer totals equal the unpaid-invoice
-- totals read straight from the invoices table, to the sen.
--
-- Order matters. coa_reject_child_under_posted_account refuses a child while
-- the parent still carries postings, so the accounts are born parentless, the
-- history moves onto them, and only then are they filed under 3030.

INSERT INTO chart_of_accounts (code, name, type, parent_code, is_active, sort_order, cash_flow_category)
VALUES
  ('3031', 'AR - HOUZS Century',   'asset', NULL, true, 41, (SELECT cash_flow_category FROM chart_of_accounts WHERE code = '3030')),
  ('3032', 'AR - The Cont',        'asset', NULL, true, 42, (SELECT cash_flow_category FROM chart_of_accounts WHERE code = '3030')),
  ('3033', 'AR - Carres',          'asset', NULL, true, 43, (SELECT cash_flow_category FROM chart_of_accounts WHERE code = '3030')),
  ('3034', 'AR - Dream Crafter',   'asset', NULL, true, 44, (SELECT cash_flow_category FROM chart_of_accounts WHERE code = '3030')),
  ('3035', 'AR - 2990',            'asset', NULL, true, 45, (SELECT cash_flow_category FROM chart_of_accounts WHERE code = '3030')),
  ('3036', 'AR - Hookka',          'asset', NULL, true, 46, (SELECT cash_flow_category FROM chart_of_accounts WHERE code = '3030')),
  ('3037', 'AR - Ohana',           'asset', NULL, true, 47, (SELECT cash_flow_category FROM chart_of_accounts WHERE code = '3030')),
  ('3038', 'AR - CMI',             'asset', NULL, true, 48, (SELECT cash_flow_category FROM chart_of_accounts WHERE code = '3030')),
  ('3039', 'AR - Other customers', 'asset', NULL, true, 49, (SELECT cash_flow_category FROM chart_of_accounts WHERE code = '3030')),
  ('3073', 'AR - Internal (dept)', 'asset', NULL, true, 50, (SELECT cash_flow_category FROM chart_of_accounts WHERE code = '3030'))
ON CONFLICT (code) DO NOTHING;

-- The maintenance point: which account each customer bills to.
UPDATE companies SET ar_account_code = '3031' WHERE short_code = 'HC'    AND ar_account_code IS NULL;
UPDATE companies SET ar_account_code = '3032' WHERE short_code = 'CONTS' AND ar_account_code IS NULL;
UPDATE companies SET ar_account_code = '3033' WHERE short_code = 'CAR'   AND ar_account_code IS NULL;
UPDATE companies SET ar_account_code = '3034' WHERE short_code = 'DC'    AND ar_account_code IS NULL;
UPDATE companies SET ar_account_code = '3035' WHERE short_code = '2990'  AND ar_account_code IS NULL;
UPDATE companies SET ar_account_code = '3036' WHERE short_code = 'HK'    AND ar_account_code IS NULL;
UPDATE companies SET ar_account_code = '3037' WHERE short_code = 'OHN'   AND ar_account_code IS NULL;
UPDATE companies SET ar_account_code = '3038' WHERE short_code = 'CMI'   AND ar_account_code IS NULL;

DO $$
DECLARE
  v_before numeric;
  v_after numeric;
  v_left int;
BEGIN
  SELECT COALESCE(SUM(COALESCE(debit, 0) - COALESCE(credit, 0)), 0) INTO v_before
    FROM journal_lines WHERE account_code = '3030';

  WITH owner AS (
    SELECT jl.id,
      COALESCE(
        CASE WHEN je.reference_type = 'invoice'
             THEN COALESCE(ci.ar_account_code, CASE WHEN i.billable_to_department_id IS NOT NULL THEN '3073' END, '3039') END,
        CASE WHEN je.reference_type LIKE 'payment_voucher%'
             THEN COALESCE(cpi.ar_account_code, CASE WHEN pi2.billable_to_department_id IS NOT NULL THEN '3073' END,
                           CASE WHEN pi2.id IS NOT NULL THEN '3039' END) END,
        CASE WHEN je.reference_type LIKE 'payment_voucher%' THEN cpay.ar_account_code END,
        CASE WHEN je.reference_type = 'credit_note'
             THEN COALESCE(ccn.ar_account_code, CASE WHEN icn.billable_to_department_id IS NOT NULL THEN '3073' END, '3039') END,
        -- The five read by hand (2026-09-29): two reclass pairs and the receipt
        -- one of them reverses. Each nets to zero against a line of the same
        -- party, so the customer balances are unaffected either way.
        CASE je.entry_no
          WHEN 'JE-202605-0057' THEN '3031'  -- HC 3D Design Fee Return receipt
          WHEN 'JE-202606-0107' THEN '3031'  -- its reclass
          WHEN 'JE-202606-0108' THEN '3032'  -- CONTS interest reclass
          WHEN 'JE-202606-0109' THEN '3034'  -- I-000078 Notion, ruled Dream Crafter's
        END,
        CASE WHEN je.description LIKE 'I-000078%' THEN '3034' END
      ) AS target
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.entry_id
    LEFT JOIN invoices i ON i.id = je.reference_id AND je.reference_type = 'invoice'
    LEFT JOIN companies ci ON ci.id = i.company_id
    LEFT JOIN payment_vouchers pv ON pv.id = je.reference_id AND je.reference_type LIKE 'payment_voucher%'
    LEFT JOIN invoices pi2 ON pi2.id = pv.invoice_id
    LEFT JOIN companies cpi ON cpi.id = pi2.company_id
    LEFT JOIN companies cpay ON cpay.id = pv.payee_company_id
    LEFT JOIN credit_notes cn ON cn.id = je.reference_id AND je.reference_type = 'credit_note'
    LEFT JOIN invoices icn ON icn.id = cn.invoice_id
    LEFT JOIN companies ccn ON ccn.id = icn.company_id
    WHERE jl.account_code = '3030'
  )
  UPDATE journal_lines jl SET account_code = owner.target
    FROM owner WHERE owner.id = jl.id AND owner.target IS NOT NULL;

  SELECT COUNT(*) INTO v_left FROM journal_lines WHERE account_code = '3030';
  IF v_left > 0 THEN
    RAISE EXCEPTION '% lines could not be attributed to a customer — nothing moved', v_left;
  END IF;

  UPDATE chart_of_accounts SET parent_code = '3030'
   WHERE code IN ('3031','3032','3033','3034','3035','3036','3037','3038','3039','3073');

  SELECT COALESCE(SUM(COALESCE(debit, 0) - COALESCE(credit, 0)), 0) INTO v_after
    FROM journal_lines WHERE account_code = ANY(public.ar_account_codes());
  IF round(v_after, 2) <> round(v_before, 2) THEN
    RAISE EXCEPTION 'AR family is % after the move, was % before', v_after, v_before;
  END IF;
END $$;
