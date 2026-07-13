-- ─────────────────────────────────────────────────────────────────────────────
-- Director CTC: per-head employer statutory (user report 2026-07-13).
--
-- The CTC Input grid keys ONE row per subsidiary holding the company's total
-- B+K, and the trigger looked up EPF/SOCSO/EIS ER on that lump sum — a
-- one-head assumption. Wrong when a subsidiary pays CTC for MORE THAN ONE
-- director: SOCSO/EIS cap per person (104.15 / 11.90 at the RM6,000
-- ceiling), so e.g. HOUZS Century with 2 directors must contribute
-- 2 × 104.15 = 208.30 SOCSO ER and 2 × 11.90 = 23.80 EIS ER, not one cap.
--
-- New director_ctc.heads (default 1): how many directors this company's CTC
-- covers. The trigger now looks up statutory on B+K ÷ heads and multiplies
-- back by heads (equal-split assumption). heads=1 rows behave exactly as
-- before. Existing rows keep heads=1 — HR sets the real headcount in the
-- grid and re-saves.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE director_ctc
    ADD COLUMN heads INTEGER NOT NULL DEFAULT 1 CHECK (heads >= 1);

COMMENT ON COLUMN director_ctc.heads IS
    'Number of directors this company''s CTC covers. Employer statutory = heads × lookup(B+K ÷ heads) — SOCSO/EIS cap per person, so a 2-director subsidiary contributes two caps.';

CREATE OR REPLACE FUNCTION public.compute_director_ctc_total()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_heads INTEGER := GREATEST(COALESCE(NEW.heads, 1), 1);
    v_bk_per_head DECIMAL := (NEW.basic + NEW.kpi) / v_heads;
    v_epf_er DECIMAL;
    v_socso_er DECIMAL;
    v_eis_er DECIMAL;
BEGIN
    SELECT employer INTO v_epf_er FROM lookup_epf(v_bk_per_head);
    SELECT employer INTO v_socso_er FROM lookup_socso(v_bk_per_head);
    SELECT employer INTO v_eis_er FROM lookup_eis(v_bk_per_head);

    NEW.employer_epf := COALESCE(v_epf_er, 0) * v_heads;
    NEW.employer_socso := COALESCE(v_socso_er, 0) * v_heads;
    NEW.employer_eis := COALESCE(v_eis_er, 0) * v_heads;

    NEW.total_ctc := NEW.basic + NEW.kpi + NEW.allowance
                   + NEW.employer_epf + NEW.employer_socso + NEW.employer_eis;
    RETURN NEW;
END;
$function$;
