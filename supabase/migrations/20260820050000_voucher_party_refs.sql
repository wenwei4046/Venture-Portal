-- Payee names for BOTH directions (2026-08-20, user: "payment 那边我也要看到
-- 花出去的钱的breakdown"). Supersedes receipt_party_refs (credit-only): the
-- Monthly R&P now attributes money-out bank lines per payee too, and payment
-- vouchers are debit-direction. Names only — no amounts, no dates.

CREATE OR REPLACE FUNCTION public.voucher_party_refs()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT jsonb_agg(jsonb_build_object('id', pv.id, 'payee', pv.payee_name))
     FROM payment_vouchers pv
     WHERE pv.payee_name IS NOT NULL),
    '[]'::jsonb
  );
$function$;

REVOKE ALL ON FUNCTION public.voucher_party_refs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.voucher_party_refs() TO authenticated;

DROP FUNCTION IF EXISTS public.receipt_party_refs();
