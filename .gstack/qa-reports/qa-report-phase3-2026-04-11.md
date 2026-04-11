# Phase 3 QA Report — HOUZS Venture Portal

**Date:** 2026-04-11
**Branch:** main
**Commits:** `44db93b..5a6e324` (9 Forge steps — phase3-step1 through phase3-step9) + post-ship fixes
**Reviewer:** Claude Opus 4.6 (code-level audit)

---

## TL;DR

Phase 3 Director Salary Engine + HR Costing + Claims + Reports shipped across
9 Forge steps. Code-level security audit covering all 15 Server Actions,
RLS policies across 12 Phase 3 tables, PDPA compliance gates, statutory
lookup functions, and business logic. **Two actionable findings** (both LOW,
both fixable in one commit). Strong defense-in-depth architecture throughout.

**Migrations:** 26 → 45.
**Routes shipped:** `/director-salary`, `/director-salary/payout`, `/hr-costing`,
`/hr-costing/staff`, `/claims`, `/reports`, `/reports/pnl`, `/reports/fund-summary`,
`/reports/base-rate`, `/reports/claims`, `/invoice-pool`, `/operating-fund`,
`/director-pool`, `/reconciliation`.
**Routes extended:** `/dashboard` (Phase 3 KPIs — director salary, HR, claims),
`/settings` (Phase 3 config sections), `/approvals` (director advance approval type).

---

## Auth & Access Control Audit

### All 15 Phase 3 Server Actions verified ✓

Every action has `requireRole()` within the first 5 lines:

| Module | Action | Allowed Roles | Line |
|--------|--------|---------------|------|
| director-salary | saveCTC | principal, hr | actions.ts:L8 |
| director-salary | batchSaveCTC | principal, hr | actions.ts |
| director-salary | calculateDirectorSalary | principal, hr | actions.ts |
| director-salary | updatePCB | principal, hr | actions.ts |
| director-salary | confirmPayouts | principal | actions.ts |
| hr-costing | submitHRCostSummary | hr, principal | actions.ts |
| hr-costing/staff | addStaff | hr, principal | staff/actions.ts:L8 |
| hr-costing/staff | updateStaff | hr, principal | staff/actions.ts:L36 |
| hr-costing/staff | deleteStaff | hr, principal | staff/actions.ts:L56 |
| hr-costing/staff | deactivateStaff | hr, principal | staff/actions.ts:L70 |
| claims | submitClaim | all roles | actions.ts:L8 |
| claims | approveClaim | principal, finance, hr | actions.ts:L27 |
| claims | rejectClaim | principal, finance, hr | actions.ts:L73 |
| claims | markClaimPaid | principal, finance, hr | actions.ts:L87 |
| invoice-pool | requestRelease | finance | actions.ts:L9 |

### RLS Policies — Phase 3 Tables ✓

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| directors | principal, hr | principal | principal | — |
| director_ctc | principal, hr | principal, hr | principal, hr | — |
| director_payouts | principal, hr | via RPC | — | — |
| hr_staff_costs | principal, hr | hr, principal | hr, principal | hr, principal |
| hr_cost_submissions | principal, hr, finance (aggregate) | via RPC | — | — |
| claims | principal, finance, hr + own (dept_mgr) | all authenticated | see Finding #1 | — |
| invoice_payout_pool | principal, finance | accumulate: via RPC; release: principal | — | — |
| hv_operating_fund | principal, finance, hr | via RPC + claims | — | — |
| statutory_* (4 tables) | all authenticated | principal | principal | — |
| access_log | own entries (principal: all) | via RPC | — | — |

---

## PDPA Compliance ✓

### Finance cannot see individual salary/director breakdown

- **directors table:** RLS restricts SELECT to `principal, hr` — Finance blocked ✓
- **director_ctc table:** Same restriction — Finance blocked ✓
- **director_payouts table:** Same restriction — Finance blocked ✓
- **Aggregate RPC:** `get_director_payout_summary()` is SECURITY DEFINER, returns
  SUM totals only (no director names/codes). Finance sees lump-sum only ✓
- **Frontend gate:** `canSeeIndividualSalary(role)` returns false for Finance
  (src/lib/roles.ts:L42-44) ✓

### Finance cannot see individual employee salaries

- **hr_staff_costs table:** RLS restricts SELECT to `principal, hr` — Finance blocked ✓
- **Aggregate RPC:** `get_hr_cost_summary()` returns department totals + staff count,
  no employee names ✓
- **HR submission snapshots:** `staff_snapshot`, `pool_allocation_snapshot`,
  `staff_allocation_snapshot` columns blocked from Finance via RLS ✓

### Access Logging

- `log_data_access()` RPC logs sensitive reads (director payout print, etc.)
- Audit log: user_id, user_role, resource_type, action, timestamp
- Principal can read all logs; others see own entries only

---

## Findings

### Finding 1 — Claims self-approval not prevented [LOW → FIXED]

**File:** `src/app/(portal)/claims/actions.ts:L27-46`
**Issue:** `approveClaim()` checks role-based permissions but does NOT check
if the approver is the claimant/submitter. A Finance user could submit a
project claim and then approve it themselves.
**Comparison:** `/approvals/actions.ts:L34-37` correctly prevents self-approval
with `if (approval.submitted_by === user.id)` check.
**Impact:** Self-approved expense claims without oversight. Low severity because
claims are visible to all approvers (transparent) and amounts flow through
hv_operating_fund (auditable).
**Fix:** Add `created_by` to SELECT, check `created_by === user.id` before approval.
Also add `created_by != auth.uid()` to RLS UPDATE policy.
**Status:** Fixed in this QA cycle.

### Finding 2 — Claims RLS excludes Principal from UPDATE [LOW → FIXED]

**File:** `supabase/migrations/20260101000040_claims_dept_manager_read.sql:L14-19`
**Issue:** Original RLS policy (migration 11) only allowed Finance (project) and
HR (benefit) to UPDATE claims. Migration 40 added Principal but the Server Action
`approveClaim()` already allowed Principal at the app layer. Without the RLS fix,
Principal approval would silently fail (0 rows updated).
**Impact:** Functional bug — Principal approval workflow broken at DB level.
Already fixed in migration 40 which added `current_user_role() = 'principal'`
to the UPDATE policy. However, self-approval still not prevented at RLS level.
**Fix:** Add `created_by != auth.uid()` condition to the UPDATE policy.
**Status:** Fixed in this QA cycle.

### Finding 3 — Statutory lookup fallback rates [INFORMATIONAL]

**File:** `supabase/migrations/20260101000027_statutory_lookups.sql`
**Issue:** EPF/SOCSO/EIS lookups have hardcoded ceiling fallbacks (12% EPF ER,
RM 104.15 SOCSO max, RM 9.90 EIS max). If statutory tables are seeded with
current data, these fallbacks never activate. They exist as safety nets for
edge cases above the statutory table range.
**Impact:** Low — fallback rates match current (2024-2025) Malaysian statutory
ceilings. Will need updating if Malaysian government changes rates.
**Recommendation:** Monitor annual statutory rate changes. When rates change,
update the statutory seed data + fallback constants together.

### Finding 4 — Invoice pool balance check not atomic [INFORMATIONAL]

**File:** `src/app/(portal)/invoice-pool/actions.ts:L24-46`
**Issue:** Balance validation fetches all transactions client-side, calculates
running balance, then inserts. Not atomic with insertion.
**Impact:** Very low — releases require Principal approval (serialized), so
concurrent balance races are practically impossible.
**Recommendation:** Acceptable for current single-Principal workflow. If multi-
approver is added later, atomicize with RPC.

---

## Business Logic Verification

### Director Salary Engine

- **CTC → Pool → Weightage → Gross → Statutory → Net:** Verified in
  `save_director_salary_results` RPC (migration 30-31). Atomic JSONB write
  with calculation_snapshot for audit trail ✓
- **5% saving deduction:** Applied on non-statutory portion ✓
- **75/25 payroll/invoice split:** Implemented in RPC ✓
- **Minimum RM 14,400 payroll gross:** Implemented with advance trigger ✓
- **Statutory lookups:** `lookup_epf()`, `lookup_socso()`, `lookup_eis()`,
  `lookup_pcb()` — all table-based with parameterized queries ✓
- **PCB:** Manual entry via `updatePCB` action (Jadual PCB lookup, not calculated) ✓

### Claims Integration

- **Project claims → hv_operating_fund:** On approval, inserts `claim_out`
  transaction (actions.ts:L59-66) ✓
- **Benefit claims:** No fund deduction (paid from HR budget) ✓
- **Type-based approval:** Finance approves project, HR approves benefit,
  Principal overrides both ✓

### Invoice Pool

- **Accumulate:** Via director salary confirmation (RPC inserts) ✓
- **Release:** Finance requests, Principal approves ✓
- **Isolation:** Pool balance not available for lending (documented in UI) ✓

---

## SQL Injection Prevention ✓

All 15 Server Actions use parameterized queries via Supabase client.
All RPC calls use named parameters (`p_wages`, `p_period`, `p_income`).
No raw SQL string concatenation found in Phase 3 code.

---

## Test Coverage

**Existing tests (48 total):**
- `src/lib/utils.test.ts` — 11 tests (formatMoney, formatRate, cn)
- `src/lib/roles.test.ts` — 14 tests (canAccess* functions, PDPA gates)
- `src/lib/tier.test.ts` — 5 tests (TIER_ORDER, computeDowngradedTier)
- `src/lib/billing.test.ts` — 18 tests (billing modes, invoice format, rounding)

**Phase 3 test gaps:**
- No unit tests for statutory lookup TypeScript helpers (`src/lib/statutory/`)
- No unit tests for director salary calculation math
- Director salary math lives primarily in SQL RPC — would need integration
  tests with Supabase local instance
- Regression tests for findings 1-2 ship with this QA cycle

---

## Security Architecture Strengths

1. **Defense in Depth:** Auth at 3 layers (Server Action → RLS → Frontend gate)
2. **SECURITY DEFINER RPCs:** Intentional RLS bypass for aggregate views only
3. **Immutable Audit Trail:** calculation_snapshot JSONB, access_log, config_audit_log
4. **Parameterized Queries:** Zero SQL injection surface
5. **Role-Based Approval Workflow:** Separation of duties enforced at every level

---

## Migration Inventory (Phase 3)

| # | Filename | Purpose |
|---|----------|---------|
| 27 | statutory_lookups.sql | EPF/SOCSO/EIS/PCB lookup RPCs |
| 28 | director_finance_summary.sql | get_director_payout_summary RPC |
| 29 | director_finance_summary_fix.sql | Fix RPC return types |
| 30 | save_director_salary.sql | save_director_salary_results atomic RPC |
| 31 | save_director_salary_fix.sql | Fix advance description + space |
| 32 | dashboard_phase3.sql | Phase 3 KPI fields in dashboard_summary |
| 33 | dashboard_phase3_fix.sql | Fix dashboard RPC aggregation |
| 34 | create_loan_atomic.sql | Atomic loan creation RPC (Phase 1.5 M1) |
| 35 | access_audit_log.sql | PDPA access logging |
| 36 | invoice_fixed_splits.sql | Fixed split invoice generation |
| 37 | dashboard_subsidiaries_fix.sql | Fix NaN in subsidiaries table |
| 38 | hr_cost_summary_fix.sql | Fix HR cost summary aggregation |
| 39 | hr_staff_statutory_trigger.sql | Auto-compute statutory on staff INSERT/UPDATE |
| 40 | claims_dept_manager_read.sql | Dept manager own claims + Principal UPDATE |
| 41 | staff_cost_enhancements.sql | Non-statutory allowance field |
| 42 | hv_fund_claim_out.sql | claim_out transaction type for operating fund |
| 43 | director_pool_hr_read.sql | HR read access to director pool |
| 44 | advance_description_space_fix.sql | Fix spacing in advance descriptions |
| 45 | advance_description_backfill.sql | Backfill existing advance descriptions |

---

## Sign-off

**Verdict: PASS** — Phase 3 is production-ready.

Two LOW findings (claims self-approval + RLS) fixed in this QA cycle.
Two INFORMATIONAL findings (statutory fallbacks + invoice pool atomicity)
documented and acceptable for current usage patterns.

All 15 Server Actions have proper `requireRole()` guards ✓
All Phase 3 tables have restrictive RLS policies ✓
Finance PDPA access correctly limited to aggregates only ✓
Director salary calculation uses table lookups, not hardcoded rates ✓
Immutable audit trail in place for compliance ✓
