-- ════════════════════════════════════════════════════════════════════════════
-- gl_net_by_account — a balance per account, summed in the database (2026-10-08)
--
-- The Ledger's BALANCE B/F and the Trial Balance downloaded every journal line
-- they needed just to add it up in the app: ~3,860 lines in four pages for the
-- Ledger's opening balances, all ~4,230 in five for the Trial Balance — two
-- round trips of ~90 ms each plus the transfer, on every open. This answers
-- the sum instead: one row per account (77 today), ~29 ms with the RLS checks.
--
-- Σ (debit − credit) over every line of a journal entry that is NOT reversed
-- and is dated strictly BEFORE p_before — exactly what both readers kept:
--   Ledger opening         p_before = the period's first day
--   Trial Balance as at D  p_before = D + 1 day
-- p_codes narrows it to those accounts (the Ledger's leaf set); null = all.
--
-- SECURITY INVOKER (the default) on purpose: RLS on journal_lines and
-- journal_entries answers exactly as it did for the direct reads, so a
-- department manager still sums only their own segment's entries. Not for
-- anon — RLS would answer nothing, but nobody signed out has a reason to ask.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.gl_net_by_account(
  p_before date,
  p_codes text[] DEFAULT NULL
)
RETURNS TABLE (account_code text, net numeric)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT l.account_code::text,
         sum(coalesce(l.debit, 0) - coalesce(l.credit, 0))
    FROM public.journal_lines l
    JOIN public.journal_entries e ON e.id = l.entry_id
   WHERE e.is_reversed = false
     AND e.transaction_date < p_before
     AND (p_codes IS NULL OR l.account_code = ANY (p_codes))
   GROUP BY l.account_code
$$;

REVOKE ALL ON FUNCTION public.gl_net_by_account(date, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gl_net_by_account(date, text[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.gl_net_by_account(date, text[]) IS
  'Σ(debit − credit) per account over non-reversed journal entries dated before p_before (Ledger B/F, Trial Balance). SECURITY INVOKER: RLS applies.';

NOTIFY pgrst, 'reload schema';
