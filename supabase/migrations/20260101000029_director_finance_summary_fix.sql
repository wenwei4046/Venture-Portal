-- Fix: get_director_payout_summary GROUP BY error
-- salary_pool join was not aggregated properly
CREATE OR REPLACE FUNCTION get_director_payout_summary(p_period DATE)
RETURNS TABLE (
    out_period_month DATE, out_payout_count INTEGER,
    out_total_payroll_gross DECIMAL, out_total_payroll_net DECIMAL,
    out_total_epf_er DECIMAL, out_total_epf_ee DECIMAL,
    out_total_socso_er DECIMAL, out_total_socso_ee DECIMAL,
    out_total_eis_er DECIMAL, out_total_eis_ee DECIMAL,
    out_total_pcb DECIMAL, out_total_invoice DECIMAL,
    out_total_advance DECIMAL, out_total_saving DECIMAL,
    out_total_statutory_surplus DECIMAL, out_pool_total DECIMAL,
    out_status TEXT
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_role user_role;
BEGIN
    v_role := current_user_role();
    IF v_role NOT IN ('principal', 'finance', 'hr') THEN
        RAISE EXCEPTION 'insufficient_privilege'
            USING HINT = 'Only principal, finance, or hr can view director payout summary';
    END IF;
    RETURN QUERY
    WITH payouts AS (
        SELECT COUNT(id)::INTEGER AS cnt,
            COALESCE(SUM(payroll_gross),0) AS sum_payroll_gross,
            COALESCE(SUM(payroll_net),0) AS sum_payroll_net,
            COALESCE(SUM(payroll_epf_er),0) AS sum_epf_er,
            COALESCE(SUM(payroll_epf_ee),0) AS sum_epf_ee,
            COALESCE(SUM(payroll_socso_er),0) AS sum_socso_er,
            COALESCE(SUM(payroll_socso_ee),0) AS sum_socso_ee,
            COALESCE(SUM(payroll_eis_er),0) AS sum_eis_er,
            COALESCE(SUM(payroll_eis_ee),0) AS sum_eis_ee,
            COALESCE(SUM(payroll_pcb),0) AS sum_pcb,
            COALESCE(SUM(invoice_total),0) AS sum_invoice,
            COALESCE(SUM(advance_amount),0) AS sum_advance,
            COALESCE(SUM(saving_amount),0) AS sum_saving,
            COALESCE(SUM(statutory_surplus),0) AS sum_surplus,
            CASE WHEN COUNT(id)=0 THEN 'no_data'
                 WHEN COUNT(id) FILTER (WHERE status='draft')>0 THEN 'draft'
                 WHEN COUNT(id) FILTER (WHERE status='confirmed')>0 THEN 'confirmed'
                 ELSE 'paid' END AS agg_status
        FROM director_payouts WHERE period_month = p_period
    ), pool AS (
        SELECT COALESCE(total_pool,0) AS pool_total
        FROM salary_pool WHERE period_month = p_period
    )
    SELECT p_period, po.cnt,
        po.sum_payroll_gross, po.sum_payroll_net,
        po.sum_epf_er, po.sum_epf_ee,
        po.sum_socso_er, po.sum_socso_ee,
        po.sum_eis_er, po.sum_eis_ee,
        po.sum_pcb, po.sum_invoice,
        po.sum_advance, po.sum_saving,
        po.sum_surplus,
        COALESCE(pl.pool_total,0),
        po.agg_status
    FROM payouts po LEFT JOIN pool pl ON TRUE;
END;
$$;
