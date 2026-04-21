# Cross-Role Data Consistency Hotspots

> Fields that surface in ≥2 role views. Mismatch of even RM 0.01 is a **P0 bug** — this is the whole reason the VP E2E auditor exists. After Stage 2 (2026-04-22, mig 195-203), every balance mutation also writes a `journal_entries` row — so consistency now also extends to the GL ledger.

## 1. loans.outstanding
- Principal: dashboard waterfall (`loans_outstanding`)
- Finance: `/fund-out` list + `/overdue` detector
- Reports: base-rate calculator
- Source of truth: `loan_outstanding` view (`principal - SUM(repayments WHERE payment_type='principal')`)

## 2. dept_pool_balances.balance (per dept)
- Principal: `/dept-pool`, `/dashboard`
- Finance: `/dept-pool`
- Dept Manager: `/dept-pool/{slug}`, own `/dashboard`
- Source: `dept_pool_balances` view (`SUM(np_in) - SUM(expense_out)` per dept)
- **GL counterpart (post mig 198/200/202)**: `trial_balance` for 3030/3040/3050/3070/3080

## 3. Director Salary period total
- HR + Principal: see per-director (`director_payouts.gross_amount`)
- Finance: sees only 6-line aggregate via `get_director_payout_summary` RPC
- **Invariant**: SUM(HR per-director gross_amount) == Finance's `out_total_75_net + out_total_75_er + out_total_75_pcb + out_total_25_invoice + out_total_advance + out_total_saving`
- **GL counterpart (post mig 201)**: 3 journal entries — Director Pool funding (3010→3080), 25% split (3080→3060), 5% saving (3080→3020)

## 4. HR Cost Summary
- HR + Principal: see per-employee (`hr_staff_costs`)
- Finance: sees only dept lump sum via `get_hr_cost_summary` RPC
- **Invariant**: SUM(basic+statutory+allowance) per dept from HR view == Finance's lump-sum row

## 5. Payroll-run total_amount
- HR: dashboard cycle board (step 3 total)
- Principal: `/approvals/payroll-run/[id]`
- Finance: `/payments/payroll-requests`
- Source: `payroll_runs.total_amount`

## 6. hv_operating_fund / venture_pool balance
- Principal + Finance: dashboard hero
- Principal + Finance: `/operating-fund` page
- Source: `venture_pool_balance` view

## 7. Pending approvals count
- Principal dashboard card (`pending_approvals_count`)
- `/approvals` page actual row count
- HR dashboard cycle step 5 status (if period payroll)
- Finance dashboard "Awaiting your sign-off" list

## 8. Invoice Payout Pool balance
- Principal + Finance: dashboard + `/invoice-pool`
- Source: `invoice_payout_pool` (`SUM(accumulate) - SUM(release)`)
- **GL counterpart (post mig 201)**: 3060 Invoice Payout Pool equity

## 9. journal_entries tally per reference (NEW — added post Stage 2)
For every `reference_type / reference_id` pair, SUM(debit) - SUM(credit) across lines MUST equal 0. Zero tolerance. `trial_balance` view aggregates this — any non-zero balance on an individual reference is a drift.

## Invariant verification query
```sql
-- Universal tally check for any business action
SELECT je.reference_type, je.reference_id, je.description,
       SUM(jl.debit) AS dr, SUM(jl.credit) AS cr,
       SUM(jl.debit) - SUM(jl.credit) AS drift
  FROM journal_entries je
  JOIN journal_lines jl ON jl.entry_id = je.id
 WHERE je.created_at > NOW() - INTERVAL '10 minutes'
 GROUP BY je.id
 HAVING SUM(jl.debit) - SUM(jl.credit) <> 0;  -- must be EMPTY
```
