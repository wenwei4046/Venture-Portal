-- Mig 20260721010000: approve_voucher_batch gets the same bank-balance guard
-- as approve_single_voucher (audit finding 2026-07-21).
--
-- approve_voucher_batch decremented the bank cache WITHOUT a sufficiency
-- check — a grouped approval (e.g. the payroll disbursement batch) could
-- silently drive Alliance negative. approve_voucher_batch_partial already
-- pre-checks per-bank debit totals (jsonb aggregation) and the single-PV RPC
-- has always guarded; this aligns the remaining one (anchored transform of
-- the LIVE definition, fail loud if the anchor drifts).

BEGIN;

DO $mig$
DECLARE
    v_fn      TEXT;
    v_name    TEXT;
    v_src     TEXT;
    v_anchor  TEXT;
    v_repl    TEXT;
    v_cnt     INT;
BEGIN
    v_anchor := 'IF FOUND THEN
                v_bank_gl_code := COALESCE(v_bank.gl_account_code, ''3000'');
                v_new_balance := CASE WHEN v_voucher.direction=''credit'' THEN v_bank.current_balance + v_voucher.amount ELSE v_bank.current_balance - v_voucher.amount END;';
    v_repl := 'IF FOUND THEN
                v_bank_gl_code := COALESCE(v_bank.gl_account_code, ''3000'');
                -- Mig 20260721010000: same guard as approve_single_voucher —
                -- an outgoing voucher must fit in the bank.
                IF v_voucher.direction = ''debit'' AND v_bank.current_balance < v_voucher.amount THEN
                    RAISE EXCEPTION ''voucher % needs RM % but the bank only holds RM %'', v_voucher.voucher_no, v_voucher.amount, v_bank.current_balance;
                END IF;
                v_new_balance := CASE WHEN v_voucher.direction=''credit'' THEN v_bank.current_balance + v_voucher.amount ELSE v_bank.current_balance - v_voucher.amount END;';

    FOREACH v_fn IN ARRAY ARRAY[
        'approve_voucher_batch(uuid,uuid,text)'
    ] LOOP
        v_src := pg_get_functiondef(v_fn::regprocedure);
        v_cnt := (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor);
        IF v_cnt <> 1 THEN
            RAISE EXCEPTION 'mig 20260721010000: expected exactly 1 bank-decrement anchor in %, found %', v_fn, v_cnt;
        END IF;
        v_src := replace(v_src, v_anchor, v_repl);
        EXECUTE v_src;
    END LOOP;
END;
$mig$;

COMMIT;
