-- AR by customer, step 1 of 2: the resolver (2026-09-29).
--
-- 3030 "Accounts Receivable - Subs" is one pooled account — 419 lines, every
-- subsidiary, every external customer and every internal dept recharge in the
-- same bucket, so the reports can only ever show one number (user: "account
-- receivable 我看不到 detail 是吗" → "做2，本身就应该要有顾客 maintenance 的
-- 层面"). Step 2 gives 3030 a child per customer; once it has children the
-- header guard stops anything posting to 3030 itself, so EVERY posting path
-- has to resolve a customer account first. This step ships that resolution
-- while 3030 is still childless: the functions below simply return '3030'
-- until the children exist, so nothing changes until step 2 lands.
--
-- companies.ar_account_code is the maintenance point — Settings › Companies
-- edits it, and a company without one falls through to AR - Other rather than
-- failing an invoice.

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS ar_account_code text REFERENCES chart_of_accounts(code);

COMMENT ON COLUMN companies.ar_account_code IS
  'Receivable account this customer''s invoices post to (a child of 3030). NULL = fall through to AR - Other.';

-- ── The three resolvers ────────────────────────────────────────────────────
-- Order: the company''s own account → the internal account for a dept-pool
-- recharge → AR - Other for an external name → 3030 while the split has not
-- happened yet.

CREATE OR REPLACE FUNCTION public.ar_account_code_for(
  p_company_id uuid,
  p_department_id uuid DEFAULT NULL,
  p_freetext text DEFAULT NULL
) RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT c.ar_account_code FROM companies c
      WHERE c.id = p_company_id AND c.ar_account_code IS NOT NULL),
    (SELECT a.code FROM chart_of_accounts a
      WHERE a.code = '3073' AND a.is_active AND p_department_id IS NOT NULL),
    (SELECT a.code FROM chart_of_accounts a
      WHERE a.code = '3039' AND a.is_active),
    '3030'
  );
$$;

CREATE OR REPLACE FUNCTION public.ar_account_for_invoice(p_invoice_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT public.ar_account_code_for(i.company_id, i.billable_to_department_id, i.billable_to_freetext_name)
    FROM invoices i WHERE i.id = p_invoice_id;
$$;

-- A receipt names its customer through the invoice it settles, else through
-- the voucher's payee company.
CREATE OR REPLACE FUNCTION public.ar_account_for_voucher(p_voucher_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT public.ar_account_for_invoice(pv.invoice_id) FROM payment_vouchers pv
      WHERE pv.id = p_voucher_id AND pv.invoice_id IS NOT NULL),
    (SELECT public.ar_account_code_for(pv.payee_company_id, NULL, pv.payee_name)
       FROM payment_vouchers pv WHERE pv.id = p_voucher_id),
    '3030'
  );
$$;

-- Every account in the family — the reports and the reassign guards ask for it.
CREATE OR REPLACE FUNCTION public.ar_account_codes()
RETURNS text[]
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT ARRAY['3030'] || COALESCE(
    (SELECT array_agg(code ORDER BY code) FROM chart_of_accounts WHERE parent_code = '3030'),
    '{}'::text[]);
$$;

-- ── Patch the posted-receipt legs in place ────────────────────────────────
-- The three approval functions each credit a hardcoded '3030' when a receipt
-- is approved. They are ~20k of SQL apiece, so rather than restate them the
-- literal is swapped in their own stored definition — one occurrence each,
-- asserted below.
DO $$
DECLARE
  v_name text;
  v_def text;
  v_hits int;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['approve_single_voucher', 'approve_voucher_batch', 'approve_voucher_batch_partial'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO v_def
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = v_name;
    IF v_def IS NULL THEN RAISE EXCEPTION 'function % not found', v_name; END IF;

    SELECT count(*) INTO v_hits FROM regexp_matches(v_def, '''3030''', 'g');
    IF v_hits <> 1 THEN
      RAISE EXCEPTION '% has % occurrences of the 3030 literal, expected 1', v_name, v_hits;
    END IF;

    v_def := replace(v_def, '''3030''', 'public.ar_account_for_voucher(v_voucher.id)');
    EXECUTE v_def;
  END LOOP;
END $$;

-- ── The reassign guards cover the whole family ────────────────────────────
-- Both refuse to move an AR leg (it is settlement, not a category choice).
-- With children that guard has to name them too.
DO $$
DECLARE v_def text; v_hits int;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'reassign_voucher_gl_account';
  SELECT count(*) INTO v_hits FROM regexp_matches(v_def, 'p_old_account = ''3030''', 'g');
  IF v_hits <> 1 THEN RAISE EXCEPTION 'reassign_voucher_gl_account: % guards found, expected 1', v_hits; END IF;
  v_def := replace(v_def, 'p_old_account = ''3030''', 'p_old_account = ANY(public.ar_account_codes())');
  EXECUTE v_def;

  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'reassign_invoice_gl_account';
  SELECT count(*) INTO v_hits FROM regexp_matches(v_def, 'jl.account_code <> ''3030''', 'g');
  IF v_hits <> 1 THEN RAISE EXCEPTION 'reassign_invoice_gl_account: % candidate filters found, expected 1', v_hits; END IF;
  v_def := replace(v_def, 'jl.account_code <> ''3030''', 'NOT (jl.account_code = ANY(public.ar_account_codes()))');
  v_def := replace(v_def, 'p_new_account IN (''3000'', ''3030'')',
                          'p_new_account = ''3000'' OR p_new_account = ANY(public.ar_account_codes())');
  EXECUTE v_def;
END $$;
