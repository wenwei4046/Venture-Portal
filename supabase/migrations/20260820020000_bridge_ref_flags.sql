-- Bridge pairing refs for dept managers (2026-08-20, user as Marketing
-- Manager: "还是没有薪水啊？"). The payroll/inter-billing cash-flow bridge
-- pairs a department's funding drain with the HR-pool custody receipt and
-- skips voided vouchers — but a dept_manager's RLS can only see their OWN
-- dept_pools rows and no payment_vouchers at all, so custodyRefs and the
-- voided set came back empty and the payroll bridge silently vanished from
-- every dept manager's cash flow (finance/principal were unaffected).
--
-- Fix: one SECURITY DEFINER helper returning ONLY voucher-number strings —
-- (a) voided voucher_nos, (b) payroll-custody-paired non-voided PV refs.
-- No amounts, no departments, no payees: nothing a dept manager shouldn't
-- hold. The bridge unions these with whatever its direct reads returned.

CREATE OR REPLACE FUNCTION public.bridge_ref_flags()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'voided',
    COALESCE(
      (SELECT jsonb_agg(DISTINCT voucher_no)
       FROM payment_vouchers
       WHERE status = 'voided' AND voucher_no IS NOT NULL),
      '[]'::jsonb
    ),
    'payroll_refs',
    COALESCE(
      (SELECT jsonb_agg(DISTINCT t.ref)
       FROM (
         SELECT substring(description from 'HV-PV-[0-9]+-[0-9]+') AS ref
         FROM dept_pools
         WHERE transaction_type = 'np_in'
           AND description LIKE '%payroll fund → %'
       ) t
       WHERE t.ref IS NOT NULL
         AND t.ref NOT IN (
           SELECT voucher_no FROM payment_vouchers
           WHERE status = 'voided' AND voucher_no IS NOT NULL
         )),
      '[]'::jsonb
    )
  );
$function$;

REVOKE ALL ON FUNCTION public.bridge_ref_flags() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bridge_ref_flags() TO authenticated;
