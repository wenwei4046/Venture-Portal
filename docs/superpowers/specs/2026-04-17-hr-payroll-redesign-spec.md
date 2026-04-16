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
| Pool architecture | Separate `operating_pools` table for HR/Finance/Director/Digital; Marketing keeps existing `dept_pools` (P&L semantics) |
| Voucher sources max | Drop 3-cap trigger to allow 5-source bank transfers |
| NRIC | Add to staff + directors for Spec 6 statutory files |
| File download routes | Allow GET route handlers (read-only exception to CLAUDE.md no-API-routes rule) |

## Spec boundaries

- **Spec 1**: monthly payroll core (enter / edit / import)
- **Spec 2**: consolidated statement + Principal approval
- **Spec 3**: per-dept operating pools + invoice pool routing
- **Spec 4**: bank transfer + Alliance pool
- **Spec 5**: payslip PDF + bank transfer files
- **Spec 6**: statutory compliance ZIP (KWSP / SOCSO / EIS / LHDN)

## Top-5 blockers for Spec 1 kickoff (needs user confirmation)

1. Pro-rata basis confirmation (calendar vs working days)
2. Finance drill-down scope (Director only, or also Mkt / HR / Fin staff?)
3. 3-row voucher cap removal OK?
4. NRIC values available for backfill?
5. `dept_pools` vs `operating_pools` separation OK?

## Pre-flight known issues in the worktree

- Uncommitted: `supabase/migrations/20260101000119_director_ctc_statutory_auto_compute.sql`
- Modified but unstaged: `src/app/(portal)/director-salary/{_components/CTCInputGrid.tsx, page.tsx}`, `src/app/(portal)/director-salary/page.tsx`, `scripts/check-remote-migrations.mjs`

These must land before Spec 1 starts so migration 120 has a clean base.

## References

- Full plan: [`docs/superpowers/plans/2026-04-17-hr-payroll-full-cycle-plan.md`](../plans/2026-04-17-hr-payroll-full-cycle-plan.md)
- CLAUDE.md conventions
- `docs/access-matrix.md` (RLS patterns 1–6)
- `docs/DESIGN.md` v2.0
