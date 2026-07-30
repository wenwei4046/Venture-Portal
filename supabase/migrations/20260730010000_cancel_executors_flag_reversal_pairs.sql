-- Cancelling a LOAN or a FUND SOURCE must flag its reversal pair
-- (2026-07-30, user: "cancelled 的就不应该进我的 ledger,同理不应该显示在我的
-- cash flow").
--
-- Both executors already post a mirror-image reversing JE, but neither set
-- journal_entries.is_reversed — so the pair stayed visible on both legs.
-- Worse than cosmetic for loans: the Hookka 98,000 disbursement sat in MAY and
-- its cancellation in JUNE, so the monthly cash flow showed a 98k outflow in
-- one month and a 98k inflow in the next for money that never moved.
--
-- Applied to the LIVE definitions with anchored text replacement (the same
-- technique used for mig-156): assert the anchor appears exactly once, refuse
-- if already patched, then re-create. mark_journal_entry_reversed itself
-- refuses any pair that doesn't net to zero, so this can never hide a real
-- balance.
--
-- The historical Hookka pair was flagged by the same RPC alongside this.

DO $mig$
DECLARE
  v_def text; v_new text; v_hits int;
  v_anchor text := ') INTO v_je_id;';
BEGIN
  -- ── execute_loan_cancel ──
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'execute_loan_cancel';
  IF v_def IS NULL THEN RAISE EXCEPTION 'execute_loan_cancel not found'; END IF;

  IF v_def NOT ILIKE '%v_disb_je_id%' THEN
    v_hits := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
    IF v_hits <> 1 THEN RAISE EXCEPTION 'loan cancel: anchor count = %', v_hits; END IF;

    v_new := replace(v_def, 'v_je_id UUID;', 'v_je_id UUID;
    v_disb_je_id UUID;');
    v_new := replace(v_new, 'INSERT INTO venture_pool (', 'SELECT id INTO v_disb_je_id
      FROM journal_entries
     WHERE reference_type = ''loan'' AND reference_id = p_loan_id
       AND description NOT ILIKE ''%cancellation reversal%''
       AND is_reversed = false
     ORDER BY created_at
     LIMIT 1;

    INSERT INTO venture_pool (');
    v_new := replace(v_new, v_anchor, ') INTO v_je_id;

    -- Flag the disbursement JE and this reversal as a closed pair so every
    -- is_reversed=false report drops BOTH legs (mig 20260730000000).
    IF v_disb_je_id IS NOT NULL THEN
        PERFORM mark_journal_entry_reversed(v_disb_je_id, v_je_id);
    END IF;');
    EXECUTE v_new;
  END IF;

  -- ── execute_fund_source_cancel ──
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'execute_fund_source_cancel';
  IF v_def IS NULL THEN RAISE EXCEPTION 'execute_fund_source_cancel not found'; END IF;

  IF v_def NOT ILIKE '%v_act_je_id%' THEN
    v_hits := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
    IF v_hits <> 1 THEN RAISE EXCEPTION 'fund source cancel: anchor count = %', v_hits; END IF;

    v_new := replace(v_def, 'v_je_id UUID;', 'v_je_id UUID;
    v_act_je_id UUID;');
    v_new := replace(v_new, 'INSERT INTO venture_pool (', 'SELECT id INTO v_act_je_id
      FROM journal_entries
     WHERE reference_type = ''fund_source'' AND reference_id = p_fund_source_id
       AND description NOT ILIKE ''%cancellation reversal%''
       AND is_reversed = false
     ORDER BY created_at
     LIMIT 1;

    INSERT INTO venture_pool (');
    v_new := replace(v_new, v_anchor, ') INTO v_je_id;

    -- Same closed-pair flagging as the loan path.
    IF v_act_je_id IS NOT NULL THEN
        PERFORM mark_journal_entry_reversed(v_act_je_id, v_je_id);
    END IF;');
    EXECUTE v_new;
  END IF;
END $mig$;
