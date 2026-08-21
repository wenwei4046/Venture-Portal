-- Marketing / dept-manager self-service (2026-08-20, user: "我现在要做
-- marketing user 的功能" → 开单/看回款 + Receipt & Payment report + dashboard
-- cards + contract tracking).
--
-- dept_manager could already SELECT their own segment's invoices / journal /
-- contracts / pool (RLS via current_user_segment()). This migration adds the
-- three missing DB pieces:
--
-- (1) mint_invoice_no: let dept_manager mint too — it only issues a number
--     under the advisory lock; the INSERT policy below is the real gate.
-- (2) invoices_dept_manager_insert: a dept manager may create DRAFT invoices
--     for their OWN segment only (billing_mode maps to their segment), as
--     themselves. Issue/approve stays finance/principal — a manager can never
--     post revenue.
-- (3) dept_invoice_settlements(): per-invoice receipts + approved-CN sums for
--     the caller's segment (finance/principal may pass a segment). SECURITY
--     DEFINER because payment_vouchers / credit_notes have no dept_manager
--     SELECT policy — the RPC exposes only aggregate sums per issued invoice,
--     which is exactly what 看回款 / 未收 needs and nothing more.

CREATE OR REPLACE FUNCTION public.mint_invoice_no(p_period date)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_role user_role;
    v_yyyymm TEXT := to_char(p_period, 'YYYYMM');
    v_seq INTEGER;
BEGIN
    v_role := current_user_role();
    IF v_role NOT IN ('finance', 'principal', 'dept_manager') THEN
        RAISE EXCEPTION 'mint_invoice_no: only finance/principal/dept_manager may mint, got %', v_role
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('hv_invoice_no'));

    SELECT COALESCE(MAX(
               (regexp_replace(invoice_no, '^HV-INV-\d{6}-', ''))::int
           ), 0) + 1
      INTO v_seq
      FROM invoices
     WHERE invoice_no LIKE 'HV-INV-' || v_yyyymm || '-%';

    RETURN 'HV-INV-' || v_yyyymm || '-' || lpad(v_seq::TEXT, 4, '0');
END;
$function$;

DROP POLICY IF EXISTS invoices_dept_manager_insert ON invoices;
CREATE POLICY invoices_dept_manager_insert ON invoices
    FOR INSERT
    WITH CHECK (
        current_user_role() = 'dept_manager'::user_role
        AND status = 'draft'::invoice_status
        AND billing_mode_to_segment((billing_mode)::text) = current_user_segment()
        AND created_by = auth.uid()
    );

CREATE OR REPLACE FUNCTION public.dept_invoice_settlements(p_segment gl_segment DEFAULT NULL)
RETURNS TABLE(invoice_id uuid, receipts numeric, credits numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_role user_role;
    v_seg  gl_segment;
BEGIN
    v_role := current_user_role();
    IF v_role = 'dept_manager' THEN
        v_seg := current_user_segment();
    ELSIF v_role IN ('finance', 'principal') THEN
        v_seg := COALESCE(p_segment, 'marketing'::gl_segment);
    ELSE
        RAISE EXCEPTION 'dept_invoice_settlements: role % may not read settlements', v_role
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_seg IS NULL THEN
        RAISE EXCEPTION 'dept_invoice_settlements: caller has no segment';
    END IF;

    RETURN QUERY
    SELECT i.id,
           COALESCE((SELECT SUM(pv.amount) FROM payment_vouchers pv
                     WHERE pv.invoice_id = i.id
                       AND pv.direction = 'credit'
                       AND pv.status <> 'voided'), 0)::numeric AS receipts,
           COALESCE((SELECT SUM(cn.amount) FROM credit_notes cn
                     WHERE cn.invoice_id = i.id
                       AND cn.status = 'approved'), 0)::numeric AS credits
    FROM invoices i
    WHERE i.status = 'issued'
      AND billing_mode_to_segment((i.billing_mode)::text) = v_seg;
END;
$function$;

REVOKE ALL ON FUNCTION public.dept_invoice_settlements(gl_segment) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dept_invoice_settlements(gl_segment) TO authenticated;
