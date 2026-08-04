-- Same-bank payroll funding is allowed (2026-08-04, user: "为什么来源不能选
-- 同个银行? 因为这只是inter fund transfer").
--
-- When payroll will be PAID OUT of the bank the cash already sits in, there is
-- no real inter-bank movement — but the funding PV must still run because
-- approval does the pool bookkeeping (drain each dept pool by its share, park
-- the round in HR custody) and flips the request to funded. With source = dest
-- every bank-side effect self-nets: the staging JE debits and credits the SAME
-- bank GL (balanced, zero net), the source cache -X and the
-- credit_dest_bank_on_bank_transfer trigger's +X cancel, and the void mirror
-- reverses symmetrically. The sufficient-balance check stays — salaries will
-- genuinely drain that bank.
--
-- Drop the source<>dest guard added by 20260804000000. Anchored replace,
-- idempotent.

DO $mig$
DECLARE
  v_def text; v_new text;
  v_anchor text := $a$        IF v_voucher.bank_account_id IS NOT NULL AND v_voucher.bank_account_id = v_dest_bank.id THEN
            RAISE EXCEPTION 'approve_single_voucher: source bank for voucher % is already the destination payroll account - source and destination must differ', v_voucher.voucher_no;
        END IF;$a$;
  v_repl text := $r$        -- Same-bank funding allowed (2026-08-04): payroll can pay out of the
        -- bank the cash already sits in. The staging JE debits and credits the
        -- same GL and the source/dest cache moves cancel - only the pool
        -- bookkeeping (drain dept pools, park in custody) has net effect.$r$;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'approve_single_voucher';
  IF v_def IS NULL THEN RAISE EXCEPTION 'approve_single_voucher not found'; END IF;

  -- Idempotent: guard already gone.
  IF v_def NOT LIKE '%source and destination must differ%' THEN RETURN; END IF;

  v_new := replace(v_def, v_anchor, v_repl);
  IF v_new = v_def THEN RAISE EXCEPTION 'same-bank anchor missing in approve_single_voucher'; END IF;
  EXECUTE v_new;
END $mig$;
