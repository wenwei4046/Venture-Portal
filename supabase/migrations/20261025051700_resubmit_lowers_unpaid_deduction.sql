-- ============================================================================
-- 20261025051700_resubmit_lowers_unpaid_deduction.sql
-- HR › Payroll › Resubmit: an employee deduction no PV pays yet may come DOWN (2026-10-24 — HR on KRIS and PETER's
-- September: "kris and peter PCB I updated amount Kris - RM647.90 Peter - RM1429.15 … In Payment Statutory page
-- still showing Kris PCB amount - RM 1821.90").
-- ============================================================================
--
-- September's batch #3 (15 Oct) sent KRIS and PETER with PCB RM 1,821.90 each. On 19 Oct HR opened both for a
-- Resubmit and on 22 Oct typed the PCB LHDN's figures give: KRIS RM 647.90, PETER RM 1,429.15. Their net pay rises by
-- the same (RM 1,174.00 and RM 392.75); gross and the employer's statutory — what Finance funded — do not move.
-- HR › Payment › Statutory still offered RM 1,821.90 for each: it pays what the batches SENT, and the correction could
-- never be sent. A resubmit "only ever adds" (unified Payroll, 2026-09-27): Comm Cal's close, Complete, Director
-- Salary's Complete and Submit to Finance all refused "… resubmit can only add to what was sent — PCB went down".
--
-- That rule guards money already paid out, and none was: no LHDN PV carries either PCB (KWSP, SOCSO, EIS and SKBBK
-- went on 15 Oct; both salary PVs wait for the Principal and only grow). So:
--
-- 1. payroll_row_delta — an employee deduction (EPF / SOCSO / EIS employee share, PCB, SKBBK) that came down is no
--    longer a "fall" when (a) no live PV covers more of its scheme than the new figure and (b) the money stays the
--    employee's: net pay up by what the deductions came down (net + the employee's deductions does not fall). It is
--    listed under `lowered`, and the next batch carries it as a negative line: the statutory entitlement drops to the
--    new figure (payroll_statutory_entitlements sums the lines), the salary entitlement rises by the same, and a
--    batch that funds nothing is funded already (total 0). A deduction a PV already pays stays a fall, named
--    `<key>_on_pv`. Every caller reads `falls` as before, so the four refusals now refuse only what they should.
--    Production's body (md5 0b162c0d…, the copy in 20260927061000) with that one block added after its loop. EXECUTE
--    leaves `authenticated` too: it answers any row's pay to whoever asks (HANDOFF.md lists it as a way round the
--    salary masks) and only DEFINER functions call it — comm_close_sync_payroll, payroll_complete_rows,
--    director_payroll_complete, payroll_submit_batch, payroll_cancel_topup.
-- 2. payroll_money_label — the words for `<key>_on_pv`: "PCB (a PV already pays it)", so the refusal says what is
--    in the way.
-- 3. payment_cycle_unmasked — each person carries `resubmit_open`: their row is open for a Resubmit. HR › Payment
--    keeps their statutory out of a new PV until the resubmit is sent (the figures the batches sent may be the wrong
--    ones — Generate by Department would have paid LHDN RM 1,566.75 too much). Production's body (md5 cf21b5c3…, the
--    copy in 20260927061000 as payment_cycle) with ONE statement swapped (pg_temp.swap_check).
--
-- The batch's accrual JV books a deduction that came down on the debit side (src/lib/payroll-accrual.ts): KRIS and
-- PETER's batch is Dr 4074 PCB Payable 1,566.75 / Cr 4070 Salary Payable 1,566.75.
-- Running it twice changes nothing. PGlite: tests/revenue-payroll-sql/validate-resubmit-lowers-deduction.mjs.

BEGIN;

-- ── 0. Production as this was written against ──────────────────────────────

DO $$
BEGIN
  IF (SELECT md5(replace(prosrc, E'\r', '')) FROM pg_proc WHERE oid = 'public.payroll_row_delta(text,uuid)'::regprocedure)
     NOT IN ('0b162c0dd0cc485775c0007b981762ea', '6046bc9c7b4df19976a7f8d40a6d307a') THEN
    RAISE EXCEPTION 'payroll_row_delta changed in production since this migration was written — compare production''s body first';
  END IF;
  IF (SELECT md5(replace(prosrc, E'\r', '')) FROM pg_proc WHERE oid = 'public.payroll_money_label(text)'::regprocedure)
     NOT IN ('6a9916ebb8e578a9c993883f7f07fe90', 'bb24731c0b18ffd5473b366884fb4613') THEN
    RAISE EXCEPTION 'payroll_money_label changed in production since this migration was written — compare production''s body first';
  END IF;
  IF (SELECT md5(replace(prosrc, E'\r', '')) FROM pg_proc WHERE oid = 'public.payment_cycle_unmasked(date)'::regprocedure)
     NOT IN ('cf21b5c3c5580735dcf7af4112f3deb3', '534b03b7c47070dd7f745b1641a788a9') THEN
    RAISE EXCEPTION 'payment_cycle_unmasked changed in production since this migration was written — compare production''s body first';
  END IF;
END
$$;

-- ── 1. A deduction no PV pays yet may come down ─────────────────────────────

CREATE OR REPLACE FUNCTION public.payroll_row_delta(p_scope TEXT, p_row_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_now     JSONB := payroll_row_money(p_scope, p_row_id);
    v_sent    JSONB := payroll_row_submitted_money(p_scope, p_row_id);
    v_out     JSONB;
    v_key     TEXT;
    v_d       NUMERIC;
    v_falls   TEXT[] := '{}';
    v_rises   BOOLEAN := FALSE;
    v_down    TEXT[] := '{}';
    v_lowered TEXT[] := '{}';
    v_period  DATE;
    v_scheme  TEXT;
    v_owed    NUMERIC;
    v_covered NUMERIC;
BEGIN
    IF v_now IS NULL THEN
        RETURN NULL;
    END IF;
    v_out := jsonb_build_object('lines', (v_sent->>'lines')::INT, 'split_version', v_now->'split_version');
    FOREACH v_key IN ARRAY ARRAY['gross', 'net', 'epf_er', 'epf_ee', 'socso_er', 'socso_ee',
        'eis_er', 'eis_ee', 'pcb', 'withholding_tax', 'skbbk', 'non_statutory_allowance',
        'basic_pay_net', 'commission_balance'] LOOP
        v_d := round(coalesce((v_now->>v_key)::NUMERIC, 0) - coalesce((v_sent->>v_key)::NUMERIC, 0), 2);
        v_out := v_out || jsonb_build_object(v_key, v_d);
        IF v_d < 0 AND v_key IN ('epf_ee', 'socso_ee', 'eis_ee', 'pcb', 'skbbk') THEN
            v_down := v_down || v_key;
        ELSIF v_d < 0 THEN
            v_falls := v_falls || v_key;
        ELSIF v_d > 0 THEN
            v_rises := TRUE;
        END IF;
    END LOOP;
    IF cardinality(v_down) > 0 THEN
        IF (v_sent->>'lines')::INT = 0
           OR (v_out->>'net')::NUMERIC + (v_out->>'epf_ee')::NUMERIC + (v_out->>'socso_ee')::NUMERIC
              + (v_out->>'eis_ee')::NUMERIC + (v_out->>'pcb')::NUMERIC + (v_out->>'withholding_tax')::NUMERIC
              + (v_out->>'skbbk')::NUMERIC < 0 THEN
            v_falls := v_falls || v_down;
        ELSE
            SELECT r.period_month INTO v_period FROM (
                SELECT mp.period_month FROM hr_monthly_payroll mp WHERE p_scope = 'staff' AND mp.id = p_row_id
                UNION ALL
                SELECT dmp.period_month FROM director_monthly_payroll dmp WHERE p_scope = 'directors' AND dmp.id = p_row_id
            ) r;
            FOREACH v_key IN ARRAY v_down LOOP
                v_scheme := CASE v_key WHEN 'epf_ee' THEN 'KWSP' WHEN 'socso_ee' THEN 'SOCSO'
                    WHEN 'eis_ee' THEN 'EIS' WHEN 'pcb' THEN 'PCB' ELSE 'SKBBK' END;
                v_owed := CASE v_scheme
                    WHEN 'KWSP' THEN coalesce((v_now->>'epf_er')::NUMERIC, 0) + coalesce((v_now->>'epf_ee')::NUMERIC, 0)
                    WHEN 'SOCSO' THEN coalesce((v_now->>'socso_er')::NUMERIC, 0) + coalesce((v_now->>'socso_ee')::NUMERIC, 0)
                    WHEN 'EIS' THEN coalesce((v_now->>'eis_er')::NUMERIC, 0) + coalesce((v_now->>'eis_ee')::NUMERIC, 0)
                    WHEN 'PCB' THEN coalesce((v_now->>'pcb')::NUMERIC, 0)
                    ELSE coalesce((v_now->>'skbbk')::NUMERIC, 0) END;
                SELECT coalesce(sum(c.amount), 0) INTO v_covered
                  FROM payroll_statutory_coverage(v_period) c
                 WHERE c.scope = p_scope AND c.row_id = p_row_id AND c.scheme = v_scheme;
                IF v_covered > v_owed + 0.005 THEN
                    v_falls := v_falls || (v_key || '_on_pv');
                ELSE
                    v_lowered := v_lowered || v_key;
                END IF;
            END LOOP;
        END IF;
    END IF;
    RETURN v_out || jsonb_build_object('falls', to_jsonb(v_falls), 'rises', v_rises, 'lowered', to_jsonb(v_lowered));
END;
$fn$;

REVOKE ALL ON FUNCTION public.payroll_row_delta(TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.payroll_row_delta(TEXT, UUID) TO service_role;

COMMENT ON FUNCTION public.payroll_row_delta(TEXT, UUID) IS
    'A payroll row as it stands less what its standing batches sent, per figure; `falls` = figures a resubmit may not lower (refused by every caller), `lowered` = employee deductions it may: no live PV covers more of the scheme than the new figure, and the net pay rises by what they came down (2026-10-24). Called by the payroll''s DEFINER functions only.';

-- ── 2. The words for a deduction a PV already pays ─────────────────────────

CREATE OR REPLACE FUNCTION public.payroll_money_label(p_key TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $fn$
    SELECT CASE regexp_replace(p_key, '_on_pv$', '')
        WHEN 'gross' THEN 'gross' WHEN 'net' THEN 'net pay'
        WHEN 'epf_er' THEN 'EPF (employer)' WHEN 'epf_ee' THEN 'EPF (employee)'
        WHEN 'socso_er' THEN 'SOCSO (employer)' WHEN 'socso_ee' THEN 'SOCSO (employee)'
        WHEN 'eis_er' THEN 'EIS (employer)' WHEN 'eis_ee' THEN 'EIS (employee)'
        WHEN 'pcb' THEN 'PCB' WHEN 'withholding_tax' THEN 'withholding tax'
        WHEN 'skbbk' THEN 'SKBBK' WHEN 'non_statutory_allowance' THEN 'non-statutory allowance'
        WHEN 'basic_pay_net' THEN 'net basic' WHEN 'commission_balance' THEN 'commission balance'
        ELSE regexp_replace(p_key, '_on_pv$', '') END
        || CASE WHEN p_key ~ '_on_pv$' THEN ' (a PV already pays it)' ELSE '' END;
$fn$;

-- ── 3. HR › Payment knows whose resubmit is still open ─────────────────────

CREATE OR REPLACE FUNCTION pg_temp.swap_check(p_sig regprocedure, p_old text, p_new text)
RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_src   text := (SELECT prosrc FROM pg_proc WHERE oid = p_sig);
  v_pat   text;
  v_found text;
  v_n     integer;
BEGIN
  IF strpos(v_src, p_new) > 0 THEN
    RETURN;  -- already swapped
  END IF;
  -- The old statement, every run of whitespace matching any run.
  v_pat := regexp_replace(regexp_replace(p_old, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'), '\s+', '\\s+', 'g');
  SELECT count(*) INTO v_n FROM regexp_matches(v_src, v_pat, 'g');
  IF v_n <> 1 THEN
    RAISE EXCEPTION '%: its statement is there % times, not once — production changed since this migration was written', p_sig, v_n;
  END IF;
  v_found := (regexp_match(v_src, '(' || v_pat || ')'))[1];
  EXECUTE replace(pg_get_functiondef(p_sig), v_found, p_new);
END
$fn$;

SELECT pg_temp.swap_check('public.payment_cycle_unmasked(date)'::regprocedure,
$old$'source',mp.source,'payout_split_version',mp.payout_split_version,$old$,
$new$'source',mp.source,'payout_split_version',mp.payout_split_version,
            'resubmit_open',coalesce(mp.topup_opened_at IS NOT NULL AND mp.topup_kind='resubmit',false)
                OR EXISTS (SELECT 1 FROM director_monthly_payroll dm WHERE person->>'scope'='directors'
                    AND dm.id=(person->>'row_id')::uuid AND dm.topup_opened_at IS NOT NULL AND dm.topup_kind='resubmit'),$new$);

-- ── What landed is what this file says ─────────────────────────────────────

DO $$
BEGIN
  IF (SELECT md5(replace(prosrc, E'\r', '')) FROM pg_proc WHERE oid = 'public.payroll_row_delta(text,uuid)'::regprocedure)
     IS DISTINCT FROM '6046bc9c7b4df19976a7f8d40a6d307a' THEN
    RAISE EXCEPTION 'payroll_row_delta did not land as this file''s body';
  END IF;
  IF has_function_privilege('authenticated', 'public.payroll_row_delta(text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'payroll_row_delta is still callable by a session';
  END IF;
  IF (SELECT md5(replace(prosrc, E'\r', '')) FROM pg_proc WHERE oid = 'public.payroll_money_label(text)'::regprocedure)
     IS DISTINCT FROM 'bb24731c0b18ffd5473b366884fb4613' THEN
    RAISE EXCEPTION 'payroll_money_label did not land as this file''s body';
  END IF;
  IF (SELECT md5(replace(prosrc, E'\r', '')) FROM pg_proc WHERE oid = 'public.payment_cycle_unmasked(date)'::regprocedure)
     IS DISTINCT FROM '534b03b7c47070dd7f745b1641a788a9' THEN
    RAISE EXCEPTION 'payment_cycle_unmasked did not land as this file''s body';
  END IF;
  IF has_function_privilege('authenticated', 'public.payment_cycle_unmasked(date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'payment_cycle_unmasked is callable by a session';
  END IF;
END
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
