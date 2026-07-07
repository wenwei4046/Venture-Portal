-- Applied to the live DB via MCP apply_migration; file kept for repo parity.
--
-- The active bank accounts' GL codes (e.g. 3000, 3010) — NO balances. The Cash
-- Flow reports need these to identify which journal lines are cash movements.
-- dept_managers are blocked from bank_accounts by RLS (it holds company-wide
-- balances), which zeroed out their Cash Flow / Monthly Cash Flow. This
-- SECURITY DEFINER function exposes ONLY the codes (already visible in
-- chart_of_accounts), so a dept manager's Cash Flow finds the bank lines;
-- opening/closing cash is still computed from their own segment's journal lines
-- (RLS-scoped), so no company-wide balance leaks. Same result for
-- principal/finance (identical code set), so it's a safe swap everywhere.
CREATE OR REPLACE FUNCTION public.bank_gl_codes()
RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(array_agg(gl_account_code), ARRAY[]::text[])
  FROM bank_accounts
  WHERE gl_account_code IS NOT NULL AND status = 'active'
$$;