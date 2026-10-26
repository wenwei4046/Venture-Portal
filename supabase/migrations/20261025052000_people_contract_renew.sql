-- ============================================================================
-- 20261025052000_people_contract_renew.sql
-- A contract renewed, and the letters filed with an employment status (2026-10-24 — the user: "如果是加一个 renew
-- button 的话，流程是这样：当它已经 expired 之后，到时候按一下 renew，就可以再选一次是几个月，对不对？同时要 attach 一个新的
-- contract"; "我们 select 那个 state 的时候，我要他能够 attach 一个 form … 当然包括 letter 的 type，当他一选了之后，就自动
-- attach 进 document data center 里面").
-- ============================================================================
--
-- hr_staff_costs:
--   contract_start   the first day of the contract they are on now — NULL: their hire date, as every contract was
--                    counted before this (Add Staff, the waiting list's Transfer and the person's card file a contract
--                    so). Renew on the person's page sets it — the day after the old contract's end unless HR picks
--                    another — with the new period. Off a contract it is cleared (trigger hr_staff_costs_contract_start),
--                    so a contract filed again later counts from the hire date again.
--   contract_end     GENERATED as before, from contract_start when there is one: the start + the months − 1 day (a
--                    contract ending 30 Sep 2027 renewed for 12 months → 1 Oct 2027 to 30 Sep 2028);
--                    lib/employment-status.ts › contractEnd counts it the same way.
-- A renewal moves the end, so an acknowledgement given for the old end answers nothing about the new one: both
-- reminders come again, 30 and 15 days before it (contract_reviews and notify_term_ends read contract_end, unchanged).
--
-- hr_letter_type_choices(): the Data center's letter types — what People's forms offer beside the status (Add Staff,
-- the waiting list's Transfer, the person's card, Renew), each letter then filed by hr_letter_file as the Data center's
-- own Upload files it. Documentation · Create, as filing one asks; STABLE, reading only.
--
-- notify_probation_due (20261025012000): nothing has called it since #719's deploy (the hourly sweep calls
-- notify_term_ends) — dropped, as 20261025046500 said.
-- PGlite: tests/member-sql/validate-contract-renew.mjs.

-- ── The contract they are on now starts here ────────────────────────────────

ALTER TABLE public.hr_staff_costs ADD COLUMN IF NOT EXISTS contract_start date;

ALTER TABLE public.hr_staff_costs DROP CONSTRAINT IF EXISTS hr_staff_costs_contract_start_check;
ALTER TABLE public.hr_staff_costs ADD CONSTRAINT hr_staff_costs_contract_start_check
  CHECK (contract_start IS NULL OR employment_status = 'contract');

ALTER TABLE public.hr_staff_costs ALTER COLUMN contract_end SET EXPRESSION AS (
  CASE WHEN employment_status = 'contract' AND coalesce(contract_start, hire_date) IS NOT NULL AND contract_months IS NOT NULL
       THEN (coalesce(contract_start, hire_date) + make_interval(months => contract_months::integer))::date - 1
  END
);

-- A session reads hr_staff_costs column by column (mig 20261009050100): this one is nobody's secret.
GRANT SELECT (contract_start) ON public.hr_staff_costs TO authenticated;

-- Off a contract (and filed on anything else) there is no contract to start.

CREATE OR REPLACE FUNCTION public.hr_staff_costs_contract_start()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  IF NEW.employment_status IS DISTINCT FROM 'contract' THEN
    NEW.contract_start := NULL;
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS hr_staff_costs_contract_start ON public.hr_staff_costs;
CREATE TRIGGER hr_staff_costs_contract_start
BEFORE INSERT OR UPDATE OF employment_status, contract_start
ON public.hr_staff_costs
FOR EACH ROW EXECUTE FUNCTION public.hr_staff_costs_contract_start();

-- ── The letter types People's forms offer ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.hr_letter_type_choices()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF public.has_any_action(ARRAY['documentation.create']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Filing a letter needs Documentation · Create' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'compulsory', t.compulsory) ORDER BY t.sort_order, t.name)
      FROM public.hr_letter_types t
     WHERE t.deleted_at IS NULL
  ), '[]'::jsonb);
END
$fn$;

REVOKE ALL ON FUNCTION public.hr_letter_type_choices() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_letter_type_choices() TO authenticated;

-- ── The sweep nothing calls any more ────────────────────────────────────────

DROP FUNCTION IF EXISTS public.notify_probation_due(timestamptz);
