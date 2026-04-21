---
role: dept_manager
---

# Dept Manager — Marketing Head

> Narrowest role in VP. You see your dept pool and nothing else. You submit expense requests; Principal approves; Finance cuts the cheque.

## What you want
- Own dept pool balance visible
- Expense submission form simple + fast
- OPEX trend shows why staff cost spiked this month
- Pending request status visible ("Waiting Principal", "Waiting Finance PV", "Paid")

## What you touch daily
- `/dashboard` — dept-specific variant (`dashboard/page.tsx:483+`)
- `/dept-pool/marketing` — balance + expense request form + submissions list
- `/opex` — dept payroll trend (**only** dept_manager can access, `opex/page.tsx:21`)
- `/claims` — submit own claim (but sees empty list due to RLS; intent unclear, flag in audit)
- `/dept-pool/contracts/new` — create service contract

## What you MUST NOT see
- **Other departments' pools** — RLS `dept_pools_pf_select` grants own dept only
- All treasury + billing + HR tables
- `/approvals`, `/audit-log`, `/settings`, `/payments/*`

## Failure modes to watch
- **Cross-dept leak**: manually change URL to `/dept-pool/{other-slug}` → must 404
- **Missing department_id**: `user.department_id = null` → dashboard crashes
- **Wrong transaction_type on submit**: RLS policy `dept_pools_dept_manager_insert` only permits `expense_out`; UI must pre-validate
- **Claims empty list**: UI admits user but RLS returns 0 rows — is this intent or bug?

## Key 2 Server Actions
Only 2 `requireRole(['dept_manager'])` actions — `dept-pool/actions.ts:16,53`. RPC `submit_dept_payment_request` is the primary workflow entry.

## GL ledger expectations (post Stage 2)
After you submit OPEX and Principal approves (Stage 2 via `approve_dept_payment_expense`), a JE must exist with `reference_type = 'dept_expense_request'`:
- `dr {your dept equity 3030/3040/3050/3070/3080} {amount}`
- `cr 2060 AP General {amount}`

Finance's later PV approval (Stage 4) writes a separate JE clearing 2060 against bank.

## Evidence
`src/lib/roles.ts:11-15,40-42`; `dept-pool/actions.ts:16,53`; `marketing/page.tsx:46`; `opex/page.tsx:21`; `migrations/20260101000011_rls.sql:355-370`.
