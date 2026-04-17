# HR Payroll Redesign — Design Decisions (2026-04-17)

## Problem

Staff cost records are static — every month basic / allowance / OT / commission change, but current schema supports only delete-and-re-add, wiping history. No import from InfoTech HRMS. No monthly payroll concept. No bank-transfer file or payslip output.

## Core mental model

**Master data (静态) + Monthly payroll snapshot (月度)**.
One row per (employee × month). Master holds "who", monthly holds "how much this month".

## Decisions confirmed with user

| Topic | Decision |
|---|---|
| Director CTC flow | Unchanged — manual entry, existing 75/25 pipeline |
| InfoTech import | Only for non-director staff; column mapper UI on first upload; save template |
| Staff master additions | `employee_code`, `hire_date`, `resignation_date`, `epf_category` (Part A/B/C), `socso_category`, `is_epf_exempt`, `pcb_category`, `children_count`, `employment_type` |
| Salary history | Audit table `hr_staff_salary_history` on basic change |
| Commission — tiered per-unit | e.g. Telemarketer: 0–10 units × RM50, 11–30 × RM80, 30+ × RM100 |
| Commission — pct of base | e.g. MK % of Marketing dept NP / % of company sales / % of team commission sum; multiple rules sum |
| Commission — clawback | NO (rejected) |
| Approval level | Principal (not Finance) |
| Statement OPEX structure | 4 groups: Marketing / HR / Finance / Director |
| Bank transfer file | YES — Maybank2E / RHB REFLEX / PBB eAF / HL Connect (format TBD per user) |
| Payslip PDF | YES (Malaysian standard) |
| Pro-rata | YES — calendar days, applies to basic + stat-allow + OT, NOT commission, NOT non-stat-allow |
| Staff PCB | YES (add `pcb_category` + `children_count`, use `lookup_pcb`) |
| Alliance Bank pool | Separate pool; Finance transfers pooled money there before Principal approves payroll |
| Pool architecture | Separate `operating_pools` table for **HR / Finance / Director** (3 pools only — Digital dropped 2026-04-17); Marketing keeps existing `dept_pools` because it has revenue (commission, referral) → P&L semantics |
| Voucher sources max | Drop 3-cap trigger entirely (no upper limit) to allow 5-source bank transfers |
| NRIC | Add to staff + directors. **User confirmed 2026-04-17**: full NRIC list available — one-shot backfill in migration 138 |
| File download routes | Allow GET route handlers (read-only exception to CLAUDE.md no-API-routes rule) |
| Finance drill-down scope | **Confirmed 2026-04-17**: Finance sees individual salaries for **their own department** (Finance dept); other departments (Marketing/HR/Director) stay aggregate-only. ⚠️ **Diverges from current `docs/access-matrix.md`** which says Finance cannot see any individual salaries. Spec 1 must update access-matrix.md + RLS policy on `hr_monthly_payroll` / `hr_staff_costs` accordingly. |

## Spec boundaries

- **Spec 1**: monthly payroll core (enter / edit / import)
- **Spec 2**: consolidated statement + Principal approval
- **Spec 3**: per-dept operating pools + invoice pool routing
- **Spec 4**: bank transfer + Alliance pool
- **Spec 5**: payslip PDF + bank transfer files
- **Spec 6**: statutory compliance ZIP (KWSP / SOCSO / EIS / LHDN)

## Blockers — ALL RESOLVED 2026-04-17 ✅

| # | Topic | Answer |
|---|---|---|
| 1 | Pro-rata basis | Calendar days |
| 2 | Finance drill-down scope | Own dept individual / other depts aggregate (see decisions table — diverges from access-matrix.md, Spec 1 must reconcile) |
| 3 | 3-row voucher cap | Remove entirely (no limit) |
| 4 | NRIC backfill data | Available, one-shot backfill in Spec 6 / migration 138 |
| 5 | GET route handlers for file downloads | Allow (read-only exception to CLAUDE.md) |
| 6 | `operating_pools` vs `dept_pools` | Separate tables; Digital dropped; 3 new pools only |

## Deferred questions (non-blocking, decide at each spec kickoff)

1. Bank format for Spec 5 default — Alliance, Hong Leong, both?
2. Initial commission rules (Telemarketer, MK, other commission-eligible staff) — create via UI post-Spec-1
3. Payslip email delivery — v1 download-only (recommended); email = v2
4. Unpaid leave / leave import — defer to v2
5. Commission clawback — confirmed NO

## Pre-flight clean ✅

As of commit `d900f76` (2026-04-17), all pre-Spec-1 work is committed and pushed. Clean base for migration 120.

## References

- Full plan: [`docs/superpowers/plans/2026-04-17-hr-payroll-full-cycle-plan.md`](../plans/2026-04-17-hr-payroll-full-cycle-plan.md)
- CLAUDE.md conventions
- `docs/access-matrix.md` (RLS patterns 1–6)
- `docs/DESIGN.md` v2.0
