-- 20261005110000_member_quote_cost_rules.sql
--
-- Nobody may open the browser and see how our cost is made up (user
-- 2026-10-05). The member calculator judges a margin on the Revenue Team's
-- cost — cost ÷ comm_schemes.revenue_cost_divisor, or a SKU's own ratio in
-- comm_cost_ratios — and the quote context handed both back to whoever called
-- it. member_quote_context runs under the member's own login, which their
-- browser holds, so the ratio was one PostgREST call away from any member.
--
-- The first of two migrations:
--   1. (this one) member_quote_cost_rules(p_scheme): the scheme's ratio and
--      the SKUs' own, executable by the service role ONLY. lib/member/server.ts
--      reads it after member_quote_context has authorised the session — the
--      way it reads member_catalogue's prices. Additive: nothing reads it
--      until the code that does is live.
--   2. (20261005120000, applied once that code is live) the quote contexts
--      and the order book stop returning the ratio.
--
-- Also: comm_standing_close_total(staff, period) — a person's closed
-- commission for a month — was executable by anon and authenticated and asks
-- nothing of the caller (SECURITY DEFINER, so comm_salesperson_closes' RLS
-- never applied): anyone holding the public anon key and a staff id could
-- read anybody's closed commission. Its only callers, payroll_submit_batch
-- and comm_close_sync_payroll, are SECURITY DEFINER and run as the owner, so
-- the grant served nobody else. Service role only now.

CREATE OR REPLACE FUNCTION public.member_quote_cost_rules(p_scheme uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
 SELECT jsonb_build_object(
  'costDivisor',(SELECT coalesce(c.revenue_cost_divisor,1) FROM public.comm_schemes c WHERE c.id=p_scheme),
  'costRatios',(SELECT coalesce(jsonb_object_agg(r.product_code,r.ratio),'{}'::jsonb)
   FROM public.comm_cost_ratios r WHERE r.scheme_id=p_scheme));
$function$;

COMMENT ON FUNCTION public.member_quote_cost_rules(uuid) IS
  'How a scheme works out the Revenue Team''s cost for the member calculator: costDivisor (comm_schemes.revenue_cost_divisor; null when there is no such scheme) and costRatios ({ product code: ratio }, comm_cost_ratios). Service role only — lib/member/server.ts reads it after member_quote_context authorised the session, and it never reaches a browser (user 2026-10-05).';

REVOKE ALL ON FUNCTION public.member_quote_cost_rules(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_quote_cost_rules(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.comm_standing_close_total(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.comm_standing_close_total(uuid, date) TO service_role;

NOTIFY pgrst, 'reload schema';
