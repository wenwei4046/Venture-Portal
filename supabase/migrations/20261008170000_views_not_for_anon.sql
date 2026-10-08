-- Three views were readable WITHOUT signing in (found 2026-10-08 while profiling page speed).
--
-- dept_pool_balances, fund_source_outstanding and hr_monthly_payroll_summary are
-- owned by postgres and are not security_invoker, so they read their tables past
-- RLS — on purpose, they are the aggregate views a signed-in role (Finance) reads
-- instead of the detail. But `anon` held every privilege on them too: the
-- publishable key that ships in every browser bundle, with no session at all,
-- answered GET /rest/v1/<view> with 8 department pool balances, 47 fund-source
-- outstanding rows and 19 payroll summary rows, while the tables underneath
-- answered 0. Nothing in the app reads them without a session (every caller is a
-- signed-in page or the service role), so anon simply loses them; what a
-- signed-in role may read is unchanged here.
REVOKE ALL ON public.dept_pool_balances FROM anon;
REVOKE ALL ON public.fund_source_outstanding FROM anon;
REVOKE ALL ON public.hr_monthly_payroll_summary FROM anon;

DO $$
DECLARE v text;
BEGIN
  FOREACH v IN ARRAY ARRAY['dept_pool_balances', 'fund_source_outstanding', 'hr_monthly_payroll_summary'] LOOP
    IF has_table_privilege('anon', format('public.%I', v), 'SELECT') THEN
      RAISE EXCEPTION 'anon can still read public.%', v;
    END IF;
    IF NOT has_table_privilege('authenticated', format('public.%I', v), 'SELECT') THEN
      RAISE EXCEPTION 'a signed-in role lost public.%', v;
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
