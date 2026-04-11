-- Allow HR to read hv_operating_fund and invoice_payout_pool
-- for the Director Pool page.

DROP POLICY IF EXISTS hv_fund_pf_select ON hv_operating_fund;
CREATE POLICY hv_fund_select ON hv_operating_fund
    FOR SELECT USING (current_user_role() IN ('principal', 'finance', 'hr'));

DROP POLICY IF EXISTS invoice_pool_pf_select ON invoice_payout_pool;
CREATE POLICY invoice_pool_select ON invoice_payout_pool
    FOR SELECT USING (current_user_role() IN ('principal', 'finance', 'hr'));
