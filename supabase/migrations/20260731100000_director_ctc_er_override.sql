-- Mig 20260731100000: manual ER-statutory override on the Pool Breakdown
-- (user request 2026-07-31: "EPF ER / SOCSO ER / EIS ER 可以帮我调成可以更改吗").
--
-- The Pool Breakdown grid auto-computes employer EPF/SOCSO/EIS from B+K via
-- the JADUAL lookups (per-head, heads = companies.director_heads). When the
-- lookup disagrees with InfoTech's actual figures, HR needs to key the real
-- numbers over it. New er_manual flag on director_ctc:
--   · FALSE (default) — trigger keeps computing ER from B+K as before;
--   · TRUE — the row's employer_* values are kept as sent (client-keyed);
--     total_ctc still recomputes from whatever ER values the row carries.
-- The grid excludes er_manual companies from its live re-lookup and offers an
-- "Auto" reset that clears the flag.

BEGIN;

ALTER TABLE director_ctc
    ADD COLUMN er_manual BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN director_ctc.er_manual IS
    'Mig 20260731100000: TRUE = employer_epf/socso/eis were keyed manually — '
    'the compute trigger must not overwrite them with the JADUAL lookup.';

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
    IF NEW.er_manual THEN
        -- Manual override (mig 20260731100000): keep the keyed ER values.
        NEW.employer_epf   := COALESCE(NEW.employer_epf, 0);
        NEW.employer_socso := COALESCE(NEW.employer_socso, 0);
        NEW.employer_eis   := COALESCE(NEW.employer_eis, 0);
    ELSE
        SELECT employer INTO v_epf_er FROM lookup_epf(v_bk_per_head);
        SELECT employer INTO v_socso_er FROM lookup_socso(v_bk_per_head);
        SELECT employer INTO v_eis_er FROM lookup_eis(v_bk_per_head);

        NEW.employer_epf := COALESCE(v_epf_er, 0) * v_heads;
        NEW.employer_socso := COALESCE(v_socso_er, 0) * v_heads;
        NEW.employer_eis := COALESCE(v_eis_er, 0) * v_heads;
    END IF;

    NEW.total_ctc := NEW.basic + NEW.kpi + NEW.allowance
                   + NEW.employer_epf + NEW.employer_socso + NEW.employer_eis;
    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION compute_director_ctc_total() IS
    'Mig 20260731100000: JADUAL per-head ER lookup unless er_manual — then the '
    'keyed employer_* values stick. total_ctc always recomputed.';

COMMIT;
