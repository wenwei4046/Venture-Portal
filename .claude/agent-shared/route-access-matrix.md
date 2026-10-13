# Route × Role Access Matrix

> Derived from `src/lib/roles.ts`, `src/components/layout/Sidebar.tsx`, and `requireRole(...)` call sites in server actions. Use to decide "what the agent should see visible / clickable / 200 OK" per role during E2E.
>
> ✅ allowed · PIN = extra gate · — = 404 or redirect to `/dashboard`
>
> **2026-10-14:** the columns are the four shared logins' fallback kinds. Access itself now comes from each account's title → permission template (CLAUDE.md › Permissions; the kind defaults are `ROLE_DEFAULTS` in `src/lib/permission-actions.test.ts`), so an account with a template can differ from its column.

| Route | principal | finance | hr | dept_manager | Guard source |
|---|---|---|---|---|---|
| `/dashboard` | ✅ | ✅ | ✅ (HR's Overview) | ✅ (dept-specific) | `requireAuth` |
| `/approvals`, `/approvals/[id]` | ✅ | — | — | — | `approvals/page.tsx:23` |
| `/approvals/payroll-run/[id]` | ✅ act | — | ✅ view | — | `payroll-run/[id]/page.tsx:54,105` |
| `/audit-log` | ✅ | — | — | — | `audit-log/page.tsx:12` |
| `/settings` | ✅ | — | — | — | `settings/page.tsx:33` |
| `/payments` + `/payments/new` | ✅ | ✅ | — | — | `payments/page.tsx:42` |
| `/payments/payroll-requests` | ✅ | ✅ | — | — | `payroll-requests/page.tsx:29` |
| `/payments/dept-requests` | ✅ | ✅ | — | — | `dept-requests/page.tsx:9` |
| `/fund-in` (+new, detail) | ✅ | ✅ | — | — | `fund-in/page.tsx:35` |
| `/fund-out` (+new, detail) | ✅ | ✅ | — | — | `fund-out/page.tsx:28` |
| `/statements` (+detail, print) | ✅ | ✅ gen | — | — | `statements/page.tsx:10,41` |
| `/reconciliation` | ✅ | ✅ | — | — | `reconciliation/page.tsx:8` |
| `/invoice-pool` | ✅ | ✅ | — | — | `invoice-pool/page.tsx:7` |
| `/venture-pool` (was `/operating-fund`) | ✅ | ✅ | — | — | `venture-pool/page.tsx` (`requirePermission('venture_pool')`) |
| `/billing` + contracts | ✅ | ✅ write | — | — | `BillingView.tsx:31,150` |
| `/billing/requests` | ✅ | ✅ | — | — | `billing/requests/page.tsx:14` |
| `/hr-costing` (+payroll, payment, allocation, payroll import) | ✅ | — | ✅ | — | `hr-costing/page.tsx:31` |
| `/hr-costing/payroll/[period]/[staffId]/payslip` | ✅ | — | ✅ | — | `payslip/page.tsx:17` |
| `/director-salary` | ✅ | — (was ✅ **PIN** 777333; the PIN gate is gone) | ✅ | — | `director-salary/page.tsx` (`requirePermission('director_salary')`) |
| `/director-salary/[directorId]` (+print) | ✅ | — | ✅ | — | `[directorId]/page.tsx:14` |
| `/director-pool` | ✅ | — | ✅ | — | `director-pool/page.tsx` (`requirePermission('director_pool')` — v2, 2026-07-21) |
| `/dept-pool` (index) | ✅ all | ✅ all | — | ✅ own | `dept-pool/page.tsx:27,32` |
| `/dept-pool/marketing`, `/dept-pool/[slug]` | ✅ | ✅ | — | ✅ own only | `marketing/page.tsx:46` |
| `/dept-pool/submissions` | ✅ | ✅ execute | — | ✅ view | `submissions/page.tsx:40,102` |
| `/dept-pool/contracts/new` | — | ✅ | — | ✅ | `contracts/new/page.tsx:7` |
| `/opex` | — | — | — | ✅ own | `opex/page.tsx:21` |
| `/claims` | ✅ | ✅ project | ✅ benefit | ✅ submit only | `claims/page.tsx:13` |
| `/reports` + `/reports/*` | ✅ | ✅ | ✅ claims | — | `reports/page.tsx:28` |

## Sidebar conditional rendering
- **HR**: dashboard renders HR's Overview — three entry cards (Import Employment List · Import Payroll · Calculate Director Salary) over `hr_dashboard_summary` (NOT treasury) — `dashboard/page.tsx`. Treasury RPC returns `{error: 'Access denied'}` for HR.
- **Dept Manager**: dashboard shows own-dept pool only (line 483+). Must have `user.department_id` set or crashes.
- **Director Salary from Finance**: `DirectorPinGate` blocks until PIN 777333 is entered — `director-salary/page.tsx:20-25`. **Gone (checked 2026-10-14):** no page renders `DirectorPinGate`; Finance has no `director_salary` permission, so `/director-salary` is closed to it.

## Known UI/RLS mismatches to E2E-verify
- `/claims` page admits dept_manager (`canAccessClaims(dept_manager)=true`, `roles.ts:41`), but RLS `claims_privileged_select` excludes dept_manager. Dept manager sees empty list. Intent unclear — the E2E auditor should probe this and report.
- `director_payouts_hr_update` RLS allows Finance to UPDATE payout status, wider than the read policy. Cross-check when payout lifecycle changes.
