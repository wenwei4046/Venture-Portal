-- Inter-billing nature split for dept managers (2026-08-20, user: "然后
-- inter-billing 那行也帮我拆开"). The bridge splits a payer's inter-billing
-- line by nature (rent / utilities / salary…) using payment_voucher_sources
-- mirror rows — RLS-blocked for dept_manager, so their line degraded to one
-- lump while finance saw the split.
--
-- bridge_mirror_slices() returns {voucher_no, account_code, amount} mirror
-- slices, scoped hard by role: finance/principal get all; a dept_manager gets
-- ONLY slices of vouchers their OWN department paid (an inter_billing_out
-- pool row referencing the voucher) — never another department's breakdown.

CREATE OR REPLACE FUNCTION public.bridge_mirror_slices()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_role user_role;
    v_dept uuid;
BEGIN
    v_role := current_user_role();
    IF v_role IN ('principal', 'finance') THEN
        RETURN COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'voucher_no', pv.voucher_no,
                'account_code', s.account_code,
                'amount', s.amount))
            FROM payment_voucher_sources s
            JOIN payment_vouchers pv ON pv.id = s.voucher_id
            WHERE s.role = 'mirror' AND pv.voucher_no IS NOT NULL
        ), '[]'::jsonb);
    ELSIF v_role = 'dept_manager' THEN
        v_dept := current_user_department_id();
        IF v_dept IS NULL THEN RETURN '[]'::jsonb; END IF;
        RETURN COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'voucher_no', pv.voucher_no,
                'account_code', s.account_code,
                'amount', s.amount))
            FROM payment_voucher_sources s
            JOIN payment_vouchers pv ON pv.id = s.voucher_id
            WHERE s.role = 'mirror' AND pv.voucher_no IS NOT NULL
              AND EXISTS (
                SELECT 1 FROM dept_pools dp
                WHERE dp.department_id = v_dept
                  AND dp.transaction_type = 'inter_billing_out'
                  AND dp.description LIKE '%' || pv.voucher_no || '%'
              )
        ), '[]'::jsonb);
    END IF;
    RETURN '[]'::jsonb;
END;
$function$;

REVOKE ALL ON FUNCTION public.bridge_mirror_slices() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bridge_mirror_slices() TO authenticated;
