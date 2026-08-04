-- Payroll funding destination bank is Finance's choice (2026-08-04, user:
-- "hr request fund 我没办法设定他是转去什么银行").
--
-- The app now writes the CHOSEN destination bank's GL code on the funding PV's
-- payment_voucher_sources rows (was hardcoded '3010'). Everything downstream
-- already keys off the PVS rows — the credit_dest_bank_on_bank_transfer
-- trigger, its void mirror, and both batch approvers — EXCEPT
-- approve_single_voucher, which resolved v_dest_bank by a hardcoded
-- gl_account_code='3010' lookup and would have posted the staging JE against
-- Alliance no matter what the voucher said. Patch it to resolve the
-- destination from the voucher's own PVS rows (falling back to 3010 for
-- legacy vouchers). Anchored replace, idempotent.

DO $mig$
DECLARE
  v_def text; v_new text;
  v_anchor text := $a$SELECT id, gl_account_code, bank_name INTO v_dest_bank
          FROM bank_accounts WHERE status = 'active' AND gl_account_code = '3010' LIMIT 1;
        IF v_dest_bank.id IS NULL THEN
            RAISE EXCEPTION 'approve_single_voucher: no active Alliance payroll bank (GL 3010) found for payroll staging transfer';
        END IF;
        IF v_voucher.bank_account_id IS NOT NULL AND v_voucher.bank_account_id = v_dest_bank.id THEN
            RAISE EXCEPTION 'approve_single_voucher: source bank for voucher % is already the Alliance payroll account - pick the bank the cash comes FROM', v_voucher.voucher_no;
        END IF;$a$;
  v_repl text := $r$SELECT b.id, b.gl_account_code, b.bank_name INTO v_dest_bank
          FROM bank_accounts b
         WHERE b.status = 'active'
           AND b.gl_account_code = COALESCE(
                 (SELECT s.account_code FROM payment_voucher_sources s
                   WHERE s.voucher_id = v_voucher.id AND COALESCE(s.role, '') <> 'mirror'
                   LIMIT 1),
                 '3010')
         LIMIT 1;
        IF v_dest_bank.id IS NULL THEN
            RAISE EXCEPTION 'approve_single_voucher: no active destination payroll bank found for staging transfer (voucher %)', v_voucher.voucher_no;
        END IF;
        IF v_voucher.bank_account_id IS NOT NULL AND v_voucher.bank_account_id = v_dest_bank.id THEN
            RAISE EXCEPTION 'approve_single_voucher: source bank for voucher % is already the destination payroll account - source and destination must differ', v_voucher.voucher_no;
        END IF;$r$;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'approve_single_voucher';
  IF v_def IS NULL THEN RAISE EXCEPTION 'approve_single_voucher not found'; END IF;

  -- Idempotent: already patched.
  IF v_def LIKE '%no active destination payroll bank found%' THEN RETURN; END IF;

  v_new := replace(v_def, v_anchor, v_repl);
  IF v_new = v_def THEN RAISE EXCEPTION 'dest-bank anchor missing in approve_single_voucher'; END IF;
  EXECUTE v_new;
END $mig$;
