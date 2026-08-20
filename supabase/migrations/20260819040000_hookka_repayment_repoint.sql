-- Data fix (2026-08-20): the 10:36 loan-repayment recording (principal
-- 5,702.00 + interest 1,235.35 = 6,937.35, exactly the 4% payoff of the
-- 1 Mar 2026 Hookka compound loan) was keyed against the WRONG loan — the
-- 52,500 flat 0% Hookka loan (be48b571). User: "这笔我收到的钱我记录错loan了".
--
-- Both loans belong to Hookka, so the money side is already right: same bank
-- (cache bump untouched), same receivable leaf (3055 family), same 5027
-- interest credit — the JE LINES need no change. Only the loan linkage is
-- wrong, so this re-points rather than void+recreate:
--   repayments.loan_id, journal_entries.reference_id/description
--   (reference_type='repayment'), venture_pool.reference_id/description.
-- Result: 52,500 flat loan back to untouched; the 5,702 compound loan shows
-- fully collected.
--
-- wrong loan: be48b571-2878-42eb-803a-1a4f3a4d83c4 (52,500 flat, 26 Mar 2026)
-- right loan: 30779a6d-54ba-4350-ac1f-a48584d9857c ( 5,702 compound, 1 Mar 2026)

UPDATE repayments
SET loan_id = '30779a6d-54ba-4350-ac1f-a48584d9857c'
WHERE id IN ('94e1c033-8f3a-4b5b-9650-d92194fd06d4',   -- interest 1,235.35
             '9c61bad4-eebe-4e73-b1f8-a17a93b01923')   -- principal 5,702.00
  AND loan_id = 'be48b571-2878-42eb-803a-1a4f3a4d83c4';

UPDATE journal_entries
SET reference_id = '30779a6d-54ba-4350-ac1f-a48584d9857c',
    description  = replace(description,
                           'be48b571-2878-42eb-803a-1a4f3a4d83c4',
                           '30779a6d-54ba-4350-ac1f-a48584d9857c')
WHERE entry_no IN ('JE-202608-0513', 'JE-202608-0514')
  AND reference_type = 'repayment'
  AND reference_id = 'be48b571-2878-42eb-803a-1a4f3a4d83c4';

UPDATE venture_pool
SET reference_id = '30779a6d-54ba-4350-ac1f-a48584d9857c',
    description  = replace(description,
                           'be48b571-2878-42eb-803a-1a4f3a4d83c4',
                           '30779a6d-54ba-4350-ac1f-a48584d9857c')
WHERE id = 'ca97e1b2-f69f-45ac-96c7-c89de557c660'
  AND reference_id = 'be48b571-2878-42eb-803a-1a4f3a4d83c4';

-- The auto-flip trigger (repayment fully covers principal → fully_repaid)
-- fires on repayments INSERT only, so the re-point above skipped it — mirror
-- it for the correctly-paid-off loan.
UPDATE loans SET status = 'fully_repaid', updated_at = now()
WHERE id = '30779a6d-54ba-4350-ac1f-a48584d9857c' AND status = 'active';
