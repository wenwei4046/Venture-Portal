-- A commission team's pay apart in a batch's accrual (2026-10-21, user: 那accrual
-- 分开底薪和佣金记 → 对，跟8月一样分开记 → 自动 accrual 也改成这样).
--
-- Per segment, the batch's commission lines (payroll rows from Comm Cal,
-- snapshot source 'commission'):
--   salary        gross less the non-statutory allowance and the pay-line
--                 deductions (= net + the employee's statutory + PCB +
--                 withholding + SKBBK − non-statutory allowance), top-ups too;
--   basic         the salaried people's basic_salary (first submissions only —
--                 a top-up carries a difference, not the basic again);
--   travelling / accommodation / food
--                 their special_claim pay lines of the month by kind (Airbnb,
--                 hotel → accommodation; food, meal → food; air tickets,
--                 transport → travelling), first submissions only and only
--                 while the person's pay lines still add up to what the batch
--                 carried (else it all stays commission).
-- lib/payroll-accrual books basic on 9030, the claims on 9090 / 9098 / 9084
-- and the rest on 9093 — as the hand-posted JE-202608-0875 and JE-202609-0945.
-- Read through DEFINER as payroll_batch_accrual_sums is: the caller is HR
-- submitting, or retrying, a batch.

CREATE OR REPLACE FUNCTION public.payroll_batch_commission_split(p_batch_id uuid)
RETURNS TABLE(segment text, salary numeric, basic numeric, travelling numeric, accommodation numeric, food numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    IF auth.uid() IS NULL OR NOT coalesce(has_perm('hr_costing'), false) THEN
        RAISE EXCEPTION 'payroll_batch_commission_split: not permitted' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY
    WITH b AS (
        SELECT pb.period_month FROM public.payroll_batches pb WHERE pb.id = p_batch_id
    ), lines AS (
        SELECT l.staff_id, l.segment_key AS seg, l.is_topup,
               l.net + l.epf_ee + l.socso_ee + l.eis_ee + l.pcb + l.withholding_tax + l.skbbk
                 - l.non_statutory_allowance AS pay,
               coalesce((l.snapshot->>'basic_salary')::numeric, 0) AS basic_salary,
               coalesce((l.snapshot->>'pay_line_earnings')::numeric, 0) AS earnings
          FROM public.payroll_batch_lines l
         WHERE l.batch_id = p_batch_id
           AND l.bucket IS DISTINCT FROM 'director'
           AND l.snapshot->>'source' = 'commission'
    ), claims AS (
        SELECT pl.staff_id,
               sum(pl.amount) FILTER (WHERE pl.kind <> 'deduction') AS earned,
               sum(pl.amount) FILTER (WHERE pl.kind = 'special_claim'
                   AND pl.description ~* '(airbnb|hotel|hostel|accommodation|homestay|lodging)') AS accommodation,
               sum(pl.amount) FILTER (WHERE pl.kind = 'special_claim'
                   AND pl.description !~* '(airbnb|hotel|hostel|accommodation|homestay|lodging)'
                   AND pl.description ~* '(food|meal|makan)') AS food,
               sum(pl.amount) FILTER (WHERE pl.kind = 'special_claim'
                   AND pl.description !~* '(airbnb|hotel|hostel|accommodation|homestay|lodging)'
                   AND pl.description !~* '(food|meal|makan)'
                   AND pl.description ~* '(air ?ticket|flight|transport|trnasport|toll|parking|petrol|mileage|grab|taxi)') AS travelling
          FROM public.revenue_pay_lines pl, b
         WHERE pl.period_month = b.period_month
           AND pl.staff_id IN (SELECT lines.staff_id FROM lines)
         GROUP BY pl.staff_id
    )
    SELECT ln.seg::text,
           round(sum(ln.pay), 2),
           round(coalesce(sum(ln.basic_salary) FILTER (WHERE NOT ln.is_topup), 0), 2),
           round(coalesce(sum(c.travelling) FILTER (WHERE NOT ln.is_topup AND abs(coalesce(c.earned, 0) - ln.earnings) <= 0.005), 0), 2),
           round(coalesce(sum(c.accommodation) FILTER (WHERE NOT ln.is_topup AND abs(coalesce(c.earned, 0) - ln.earnings) <= 0.005), 0), 2),
           round(coalesce(sum(c.food) FILTER (WHERE NOT ln.is_topup AND abs(coalesce(c.earned, 0) - ln.earnings) <= 0.005), 0), 2)
      FROM lines ln
      LEFT JOIN claims c ON c.staff_id = ln.staff_id
     GROUP BY ln.seg;
END;
$function$;

REVOKE ALL ON FUNCTION public.payroll_batch_commission_split(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.payroll_batch_commission_split(uuid) TO authenticated;
