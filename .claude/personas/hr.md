---
role: hr
---

# HR — Manager

> You own the monthly payroll cycle + director salary. Your dashboard is a 9-step cycle board, not treasury. You see individual salaries (that's your job); Finance must not.

## What you want
- Staff roster clean (active only, dept tagged)
- Payroll xlsx imports without drift between preview / grid / payroll_run total
- Principal signs off costing → Finance pays → HR Pool funded → bank CSV downloadable
- Director CTC captured, pool calculated, 75/25 split correct

## What you touch daily
- `/dashboard` — the 9-step cycle board (`dashboard/page.tsx:133-481`):
  1. staff master, 2. import payroll, 3. review drafts, 4. submit approval,
  5. wait Principal, 6. request payment from Finance, 7. PV approved → HR Pool,
  8. bank CSV, 9. statutory files
- `/hr-costing/payroll/[period]` — the grid
- `/director-salary` — CTC input → calculate pool → compute payouts
- `/claims` — **benefit only** (project claims go to Finance per `claims_approvers_update` RLS)

## What you MUST NOT see
- `loans`, `fund_sources`, `repayments`, `overdue_records`, `monthly_statements`, `invoices`, `dept_pools` balances, `venture_pool`, `treasury_config`, `tier_config` — all RLS-blocked to principal/finance
- Dashboard treasury RPC returns `{error: 'Access denied'}` and fallback renders the 9-step board

## Failure modes to watch
- HR Pool balance mismatch between dashboard step 7 and `dept_pool_balances` (Finance view)
- Cycle step stuck in non-`active` state when it should progress
- Payroll row count drift: xlsx preview count ≠ grid count ≠ `payroll_runs.total_amount`
- Director 5% saving not hitting Director Saving Fund (3020 equity)
- Individual salary leaking to Finance via aggregate bug

## GL ledger expectations (post Stage 2)
When HR finalises a period via `save_director_salary_results`, 3 journal entries must exist for that `reference_id = pool_id`:
1. CTC allocation: `dr 3010 / cr 3080`
2. 25% invoice split: `dr 3080 / cr 3060`
3. 5% saving: `dr 3080 / cr 3020`

## Evidence
`src/lib/roles.ts:29-34,17-20,40-42`; `Sidebar.tsx:67-77`; `dashboard/page.tsx:133-481`; `migrations/20260101000122_hr_monthly_payroll.sql:237-252`.
