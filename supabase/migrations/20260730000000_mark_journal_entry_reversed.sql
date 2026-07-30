-- Void/reversal pairs must FLAG themselves (2026-07-30, user: "cancel 或 void
-- 的不要算,我的 ledger 也不应该呈现").
--
-- Voiding a paid voucher posts a mirror-image reversing JE, but nothing ever
-- set journal_entries.is_reversed — so the ~8 report queries that filter
-- `is_reversed = false` (ledger, trial balance, balance sheet…) filtered
-- nothing, and both legs showed as live rows. Totals were never wrong (each
-- pair nets to zero); the noise was in the ledger and drill-downs.
--
-- je_no_update blocks UPDATE for every role by design, so the flagging must
-- run through a SECURITY DEFINER RPC. BOTH legs get flagged: excluding only
-- the original would leave the reversal counted alone and BREAK the totals.
-- reversed_by_id cross-links the pair so the audit trail stays navigable —
-- nothing is deleted, only marked.

CREATE OR REPLACE FUNCTION mark_journal_entry_reversed(p_original_id uuid, p_reversal_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role user_role;
    v_net  numeric;
BEGIN
    v_role := current_user_role();
    IF v_role NOT IN ('finance', 'principal') THEN
        RAISE EXCEPTION 'mark_journal_entry_reversed: unauthorized role %', v_role
            USING ERRCODE = '42501';
    END IF;

    IF p_original_id IS NULL OR p_reversal_id IS NULL OR p_original_id = p_reversal_id THEN
        RAISE EXCEPTION 'mark_journal_entry_reversed: need two distinct entry ids';
    END IF;

    -- Guard the invariant the exclusion relies on: the pair MUST net to zero,
    -- otherwise hiding both legs would move the trial balance.
    SELECT round(sum(coalesce(debit, 0)) - sum(coalesce(credit, 0)), 2)
      INTO v_net
      FROM journal_lines
     WHERE entry_id IN (p_original_id, p_reversal_id);
    IF v_net IS NULL OR v_net <> 0 THEN
        RAISE EXCEPTION 'mark_journal_entry_reversed: pair does not net to zero (net %) — refusing to hide it', v_net;
    END IF;

    UPDATE journal_entries SET is_reversed = true, reversed_by_id = p_reversal_id
     WHERE id = p_original_id;
    UPDATE journal_entries SET is_reversed = true, reversed_by_id = p_original_id
     WHERE id = p_reversal_id;
END $$;

REVOKE EXECUTE ON FUNCTION mark_journal_entry_reversed(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION mark_journal_entry_reversed(uuid, uuid) TO authenticated;
