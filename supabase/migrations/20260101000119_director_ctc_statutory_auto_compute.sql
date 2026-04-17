-- Auto-fill director_ctc.employer_epf/socso/eis using lookup RPCs.
-- Previously compute_director_ctc_total() only summed fields that were always
-- NULL, so total_ctc effectively equaled basic+kpi+allowance and Employer
-- Statutory never entered CTC. Now we look up ER on (basic+kpi) wages, matching
-- CLAUDE.md ("basic+KPI with statutory, allowance without") and the same
-- basicRatio-based calc already used in calculateDirectorSalary.

CREATE OR REPLACE FUNCTION compute_director_ctc_total()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_bk DECIMAL := NEW.basic + NEW.kpi;
    v_epf_er DECIMAL;
    v_socso_er DECIMAL;
    v_eis_er DECIMAL;
BEGIN
    SELECT employer INTO v_epf_er FROM lookup_epf(v_bk);
    SELECT employer INTO v_socso_er FROM lookup_socso(v_bk);
    SELECT employer INTO v_eis_er FROM lookup_eis(v_bk);

    NEW.employer_epf := COALESCE(v_epf_er, 0);
    NEW.employer_socso := COALESCE(v_socso_er, 0);
    NEW.employer_eis := COALESCE(v_eis_er, 0);

    NEW.total_ctc := NEW.basic + NEW.kpi + NEW.allowance
                   + NEW.employer_epf + NEW.employer_socso + NEW.employer_eis;
    RETURN NEW;
END;
$$;

-- Backfill existing rows so historical data reflects correct ER + total_ctc.
UPDATE director_ctc SET basic = basic;
