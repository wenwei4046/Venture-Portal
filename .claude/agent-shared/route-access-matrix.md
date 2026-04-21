# Route × Role Access Matrix

> Derived from `src/lib/roles.ts`, `src/components/layout/Sidebar.tsx`, and `requireRole(...)` call sites in server actions. Use to decide "what the agent should see visible / clickable / 200 OK" per role during E2E.
>
> ✅ allowed · PIN = extra gate · — = 404 or redirect to `/dashboard`

| Route | principal | finance | hr | dept_manager | Guard source |
|---|---|---|---|---|---|
| `/dashboard` | ✅ | ✅ | ✅ (cycle board) | ✅ (dept-specific) | `requireAuth` |
| `/approvals`, `/approvals/[id]` | ✅ | — | — | — | `approvals/page.tsx:23` |
| `/approvals/payroll-run/[id]` | ✅ act | — | ✅ view | — | `payroll-run/[id]/page.tsx:54,105` |
| `/audit-log` | ✅ | — | — | — | `audit-log/page.tsx:12` |
| `/settings` | ✅ | — | — | — | `settings/page.tsx:33` |
| `/payments` + `/payments/new` | ✅ | ✅ | — | — | `payments/page.tsx:42` |
| `/payments/payroll-requests` | ✅ | ✅ | — | — | `payroll-requests/page.tsx:29` |
| `/payments/dept-requests` | ✅ | ✅ | — | — | `dept-requests/page.tsx:9` |
| `/fund-in` (+new, detail) | ✅ | ✅ | — | — | `fund-in/page.tsx:35` |
| `/fund-out` (+new, detail) | ✅ | ✅ | — | — | `fund-out/page.tsx:28` |
| `/overdue` | ✅ | ✅ act | — | — | `overdue/page.tsx:24,60` |
| `/statements` (+detail, print) | ✅ | ✅ gen | — | — | `statements/page.tsx:10,41` |
| `/reconciliation` | ✅ | ✅ | — | — | `reconciliation/page.tsx:8` |
| `/invoice-pool` | ✅ | ✅ | — | — | `invoice-pool/page.tsx:7` |
| `/operating-fund` | ✅ | ✅ | — | — | `operating-fund/page.tsx:6` |
| `/billing` + contracts | ✅ | ✅ write | — | — | `BillingView.tsx:31,150` |
| `/billing/requests` | ✅ | ✅ | — | — | `billing/requests/page.tsx:14` |
| `/hr-costing` (+staff, payroll, payment, import) | ✅ | — | ✅ | — | `hr-costing/page.tsx:31` |
| `/hr-costing/payroll/[period]/[staffId]/payslip` | ✅ | — | ✅ | — | `payslip/page.tsx:17` |
| `/director-salary` | ✅ | ✅ **PIN** 777333 | ✅ | — | `director-salary/page.tsx:17-25` |
| `/director-salary/[directorId]` (+print) | ✅ | — | ✅ | — | `[directorId]/page.tsx:14` |
| `/director-pool` | ✅ | ✅ | — | — | `director-pool/page.tsx:9` |
| `/dept-pool` (index) | ✅ all | ✅ all | — | ✅ own | `dept-pool/page.tsx:27,32` |
| `/dept-pool/marketing`, `/dept-pool/[slug]` | ✅ | ✅ | — | ✅ own only | `marketing/page.tsx:46` |
| `/dept-pool/submissions` | ✅ | ✅ execute | — | ✅ view | `submissions/page.tsx:40,102` |
| `/dept-pool/contracts/new` | — | ✅ | — | ✅ | `contracts/new/page.tsx:7` |
| `/opex` | — | — | — | ✅ own | `opex/page.tsx:21` |
| `/claims` | ✅ | ✅ project | ✅ benefit | ✅ submit only | `claims/page.tsx:13` |
| `/reports` + `/reports/*` | ✅ | ✅ | ✅ claims | — | `reports/page.tsx:28` |

## Sidebar conditional rendering
- **HR**: dashboard renders a 9-step Monthly Payroll Cycle board (NOT treasury) — `dashboard/page.tsx:127-481`. Treasury RPC returns `{error: 'Access denied'}` for HR.
- **Dept Manager**: dashboard shows own-dept pool only (line 483+). Must have `user.department_id` set or crashes.
- **Director Salary from Finance**: `DirectorPinGate` blocks until PIN 777333 is entered — `director-salary/page.tsx:20-25`.

## Known UI/RLS mismatches to E2E-verify
- `/claims` page admits dept_manager (`canAccessClaims(dept_manager)=true`, `roles.ts:41`), but RLS `claims_privileged_select` excludes dept_manager. Dept manager sees empty list. Intent unclear — the E2E auditor should probe this and report.
- `director_payouts_hr_update` RLS allows Finance to UPDATE payout status, wider than the read policy. Cross-check when payout lifecycle changes.
