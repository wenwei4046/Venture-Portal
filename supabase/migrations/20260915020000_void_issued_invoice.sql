-- 作废已开发票 · void_issued_invoice (user 2026-09-15). Born from seven
-- RM0.02–0.75 "Utilities" top-up invoices (HV-INV-202609-0021..0027) issued
-- to patch an allocator water bill keyed at RM36 instead of RM39. Until now
-- an ISSUED invoice had no exit but a Principal-approved credit note per
-- invoice, and the allocator lock ("已 issue 的记录不能再改") made the source
-- figure unfixable.
--
-- Semantics (mirrors void PV / void repayment): the invoice's active journal
-- entries are reversed with mirror entries and BOTH legs flagged is_reversed
-- (every report already drops such pairs), the row keeps its number and
-- flips to status 'voided'. Allowed only when nothing has attached to it:
-- no non-voided receipt, no batch settlement, no non-voided credit note, and
-- the period is open. Voided invoices are ignored by the allocator lock, so
-- the underlying allocation becomes editable / re-billable.

BEGIN;

CREATE OR REPLACE FUNCTION public.void_issued_invoice(p_invoice_id uuid, p_reason text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_role      user_role;
    v_uid       uuid;
    v_inv       record;
    v_receipts  integer;
    v_cns       integer;
    v_je        record;
    v_lines     jsonb;
    v_new_id    uuid;
    v_net       numeric;
    v_count     integer := 0;
    v_reason    text;
BEGIN
    v_role := current_user_role();
    IF v_role NOT IN ('finance', 'principal') THEN
        RAISE EXCEPTION 'void_issued_invoice: unauthorized role %', v_role
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_uid := auth.uid();
    v_reason := NULLIF(trim(coalesce(p_reason, '')), '');
    IF v_reason IS NULL THEN
        RAISE EXCEPTION '作废要写原因 — reason is required';
    END IF;

    SELECT id, invoice_no, status, period_month, settlement_voucher_id, total_amount
      INTO v_inv
      FROM invoices
     WHERE id = p_invoice_id
       FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'void_issued_invoice: invoice % not found', p_invoice_id;
    END IF;
    IF v_inv.status <> 'issued' THEN
        RAISE EXCEPTION '% 是 %，只有 issued 的发票可以作废（draft 直接删，paid 要先 void 收据）',
            v_inv.invoice_no, v_inv.status;
    END IF;
    IF is_period_locked(v_inv.period_month) THEN
        RAISE EXCEPTION '% 的月份已锁账，不能作废', v_inv.invoice_no;
    END IF;
    IF v_inv.settlement_voucher_id IS NOT NULL THEN
        RAISE EXCEPTION '% 已在合并收据里结算，先 void 那张收据', v_inv.invoice_no;
    END IF;

    SELECT count(*) INTO v_receipts
      FROM payment_vouchers pv
     WHERE pv.invoice_id = p_invoice_id
       AND pv.direction = 'credit'
       AND pv.status <> 'voided';
    IF v_receipts > 0 THEN
        RAISE EXCEPTION '% 已有 % 张收据，先 void 收据再作废发票', v_inv.invoice_no, v_receipts;
    END IF;

    SELECT count(*) INTO v_cns
      FROM credit_notes cn
     WHERE cn.invoice_id = p_invoice_id
       AND cn.status <> 'voided';
    IF v_cns > 0 THEN
        RAISE EXCEPTION '% 挂着 % 张 credit note，先处理掉', v_inv.invoice_no, v_cns;
    END IF;

    -- Reverse every active JE that references this invoice (the AR/revenue
    -- issue entry; for dept_pool bill-tos also the inter-billing clear).
    FOR v_je IN
        SELECT id, entry_no, segment, transaction_date
          FROM journal_entries
         WHERE reference_id = p_invoice_id
           AND is_reversed = false
         ORDER BY entry_no
    LOOP
        SELECT jsonb_agg(jsonb_build_object(
                 'account_code', jl.account_code,
                 'debit',  jl.credit,
                 'credit', jl.debit,
                 'description', 'Void - ' || coalesce(jl.description, '')
               ) ORDER BY jl.id)
          INTO v_lines
          FROM journal_lines jl
         WHERE jl.entry_id = v_je.id;
        IF v_lines IS NULL THEN
            RAISE EXCEPTION 'void_issued_invoice: % has no lines', v_je.entry_no;
        END IF;

        v_new_id := post_journal_entry(
            v_je.transaction_date,
            'Void of ' || v_je.entry_no || ' - invoice ' || v_inv.invoice_no || ' voided: ' || v_reason,
            'invoice',
            p_invoice_id,
            v_uid,
            v_lines,
            v_je.segment
        );

        SELECT round(sum(coalesce(debit, 0)) - sum(coalesce(credit, 0)), 2)
          INTO v_net
          FROM journal_lines
         WHERE entry_id IN (v_je.id, v_new_id);
        IF v_net IS NULL OR v_net <> 0 THEN
            RAISE EXCEPTION 'void_issued_invoice: pair %/% does not net to zero (net %)',
                v_je.entry_no, v_new_id, v_net;
        END IF;

        UPDATE journal_entries SET is_reversed = true, reversed_by_id = v_new_id WHERE id = v_je.id;
        UPDATE journal_entries SET is_reversed = true, reversed_by_id = v_je.id  WHERE id = v_new_id;
        v_count := v_count + 1;
    END LOOP;

    UPDATE invoices
       SET status = 'voided',
           description = coalesce(description, '') || ' [VOIDED: ' || v_reason || ']'
     WHERE id = p_invoice_id;

    INSERT INTO access_log (user_id, resource_type, resource_id, action, metadata)
    VALUES (v_uid, 'invoices', p_invoice_id::text, 'void',
        jsonb_build_object('invoice_no', v_inv.invoice_no, 'amount', v_inv.total_amount,
            'reason', v_reason, 'journal_entries_reversed', v_count));

    RETURN v_count;
END $function$;

COMMENT ON FUNCTION public.void_issued_invoice(uuid, text) IS
    '作废已开发票: reverses the invoice''s active JEs (mirror pairs, is_reversed), sets status voided, keeps the number. Refuses if any receipt / batch settlement / credit note is attached or the period is locked.';

COMMIT;
