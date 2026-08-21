-- Receipt payee names for the AR per-debtor split (2026-08-20, user: "我想
-- 看到的是还没收回的就好"). The Monthly R&P debtor breakdown attributes 3030
-- credits via payment_vouchers.payee_name — RLS-blocked for dept_manager, so
-- ALL their collections fell into 未标示 (−108,801.48 on the marketing view)
-- and every debtor row only ever grew. Names only — no amounts, no dates.

CREATE OR REPLACE FUNCTION public.receipt_party_refs()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT jsonb_agg(jsonb_build_object('id', pv.id, 'payee', pv.payee_name))
     FROM payment_vouchers pv
     WHERE pv.direction = 'credit' AND pv.payee_name IS NOT NULL),
    '[]'::jsonb
  );
$function$;

REVOKE ALL ON FUNCTION public.receipt_party_refs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.receipt_party_refs() TO authenticated;
