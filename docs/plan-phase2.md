# Phase 2 Plan — Dept Pool + Service Billing

**Status:** Draft. Awaiting user approval before execution.
**Created:** 2026-04-10
**Author:** Claude Opus 4.6 (1M context) + wenwei4046
**Source specs:** `docs/module-spec-phase2.md` (333 lines)
**Retro context:** `.context/retros/2026-04-10-1.json` (Phase 1 complete, 0 test files, M1/M2/M3 deferred)

---

## TL;DR

Phase 2 adds 2 modules: **Dept Pool** (per-department profit pool, Marketing only) and **Service Billing** (5 billing modes that feed monthly invoices into the Phase 1 Statement module). All schema already shipped in Phase 1 foundation (`20260101000004_billing.sql`, `20260101000006_pools.sql`, `20260101000007_hr.sql`). This is a pure app-layer build.

**9 Forge steps + 1 new Step 0 for test framework bootstrap.**

**Biggest risk:** Invoice math correctness. 5 billing modes × 8 subsidiaries × monthly periods = lots of surfaces where a rounding bug or edge case silently corrupts a statement that becomes legal dispute material. **This is why Step 0 test framework bootstrap is non-negotiable.**

---

## Phase 1 carry-forward items (must address during Phase 2)

From `/qa` finding deferral list and /retro growth areas:

| Item | Where | Phase 2 action |
|------|-------|----------------|
| **M1** — non-atomic loan+approval creation | `src/app/(portal)/fund-out/actions.ts:69-108` | Phase 2 Step 2 establishes the Postgres-function pattern; then backport to fund-out in a follow-up commit |
| **M2** — `cancelLoan` leaves orphan pending loans | `src/app/(portal)/fund-out/actions.ts:190-237` | Phase 2 Step 1 adds the `approval_requests` trigger that cascades rejection → referenced table; automatically fixes M2 as a side effect |
| **L2** — settings changes lack audit trail | `src/app/(portal)/settings/actions.ts` | Phase 2 Step 8 adds Rent/Utility split settings — at the same time, add the audit history tables for all settings |
| **Test framework** — 0 files | Entire repo | **Phase 2 Step 0** — bootstrap Vitest before any feature work |
| **Vercel build verification** | CI | **Phase 2 Step 0** also wires `npm run build` into a pre-push check |
| **Late-night pattern** | Personal | At least one daylight session per module. Not a technical change, just a pace commitment. |

---

## Phase 2 Forge Execution Order (10 steps)

### Step 0: Test framework bootstrap + Vercel build gate ✨ NEW

**Why:** Phase 1 shipped with 0 test files and no production build verification. Phase 2 moves money around in 5 different ways — this has to stop.

**Deliverables:**
1. `npm install -D vitest @vitest/ui @testing-library/react @testing-library/jest-dom happy-dom`
2. `vitest.config.ts` with happy-dom environment, path aliases
3. `TESTING.md` with the testing philosophy and how to run
4. Seed 5 real tests:
   - **Unit**: `formatMoney(1234.5) === 'RM 1,234.50'`, `formatMoney(-1000)` handling
   - **Unit**: `roles.canAccessBilling('finance') === true`, all 4 roles
   - **Integration**: `dashboard_summary` RPC returns expected JSONB shape (uses Supabase local or mock)
   - **Regression for M3**: escalation approval → tier downgrade happy path
   - **Regression for Step 8**: statement generation is idempotent on `.rerun()`
5. Package.json scripts: `"test": "vitest"`, `"test:watch": "vitest --watch"`, `"build:check": "next build"`
6. `.github/workflows/test.yml` — on push + pull_request, run `npm ci && npm test && npm run build:check`
7. Commit `chore: bootstrap Vitest test framework for Phase 2`

**Success criteria:** All 5 tests pass locally AND in GitHub Actions. `next build` completes without error.

**Effort:** 30-45 min CC.

---

### Step 1: Generic approval trigger + backfill M1/M2 fixes

**Why:** Phase 2 has multiple approval-triggered side effects (new contract, dept expense). Copying the brittle `approveRequest` pattern from Phase 1 is a mistake. Instead, invert the relationship: DB trigger handles the cascade, app layer just updates `approval_requests`.

**Deliverables:**
1. New migration `20260101000017_approval_cascade_trigger.sql`:
   - `CREATE FUNCTION handle_approval_cascade()` — switches on `reference_table` and `request_type`, applies the side effect with `SECURITY DEFINER` to bypass RLS where needed
   - `CREATE TRIGGER on_approval_status_change AFTER UPDATE ON approval_requests WHEN status changed from pending`
   - Handles: `new_loan` (activate loan OR cancel on reject) — **fixes M1 + M2 in one go**
   - Handles: `escalation` (tier downgrade on approve) — **migrates M3 fix from app layer to DB**
   - Ready for Phase 2: `new_contract`, `dept_expense` handlers stubbed but empty
2. Refactor `src/app/(portal)/approvals/actions.ts` — remove the switch statement, rely on trigger
3. Refactor `src/app/(portal)/fund-out/actions.ts`:
   - `createLoan`: wrap loan + approval_request INSERT in new Postgres function `create_loan_with_approval()` (M1 fix)
   - `cancelLoan`: now just updates approval_request, trigger cascades to loan (M2 fix)
4. Regression tests for M1 (atomicity on approval insert failure) + M2 (cascade on rejection)

**Success criteria:** All Phase 1 E2E flows still work + M1/M2 regression tests pass.

**Effort:** 90-120 min CC.

---

### Step 2: Service Billing schema verification + seed data

**Why:** Phase 2 reads from `hr_staff_costs`, `hr_staff_allocation`, `hr_pool_allocation`, `service_contracts`, `invoices`. All tables exist from Phase 1 foundation. Need to verify schemas match the spec and seed minimal data for development.

**Deliverables:**
1. Read each Phase 2 table schema, cross-reference `docs/module-spec-phase2.md` business logic
2. If any field missing → migration `20260101000018_billing_schema_fixes.sql`
3. Seed scripts for development:
   - `scripts/seed-hr-staff.mjs` — create 3 staff per department (HR/Finance/Marketing) with basic/statutory/allowance
   - `scripts/seed-hr-allocations.mjs` — 4 HR pool splits per company, Finance attribution per staff member
   - `scripts/seed-marketing-projects.mjs` — 2 project contracts for Carres + HC
4. DB inspection script `scripts/check-billing.mjs` to verify what's loaded

**Success criteria:** `scripts/seed-hr-staff.mjs` runs cleanly, data visible in Supabase dashboard.

**Effort:** 45-60 min CC.

---

### Step 3: HR Cost Summary submission flow

**Why:** HR submits department cost totals to Finance. Finance can only see aggregated data (not individual salaries per Access Matrix). This is the data-visibility partition the whole project hinges on.

**Deliverables:**
1. `src/app/(portal)/hr-costing/` — new route group for HR users only
2. `actions.ts`:
   - `submitHRCostSummary(period_month)` — HR finalizes their monthly cost data; creates an immutable snapshot in a new table `hr_cost_submissions` OR marks `hr_staff_costs` rows as `submitted`
3. `src/app/(portal)/billing/_components/HRCostSummaryView.tsx` — Finance view that reads from `get_hr_cost_summary()` RPC (already exists from Phase 1, verify it works)
4. RLS audit: verify Finance absolutely cannot read `hr_staff_costs.basic_salary` directly
5. Unit tests: `get_hr_cost_summary()` returns expected shape, filters by role

**Success criteria:** HR sees individual staff, Finance sees only lump sums. RLS blocks Finance from raw `hr_staff_costs` SELECT.

**Effort:** 90 min CC.

---

### Step 4: Billing module UI shell + 5 billing mode entry points

**Why:** Wire up `/billing` as the central module with 5 sub-flows. Start with read-only list views; mutations come in Step 5.

**Deliverables:**
1. `src/app/(portal)/billing/page.tsx` — Billing Overview (by dept + by company tables per spec Page 1)
2. `src/app/(portal)/billing/_components/`:
   - `HRPoolSplitSection.tsx` — displays HR allocations
   - `FinanceAttributionSection.tsx` — displays Finance per-staff allocations
   - `FinanceMgmtFeeSection.tsx` — manager-only slice
   - `MarketingProjectList.tsx` — project contracts + CRUD
   - `FixedSplitPanel.tsx` — Rent/Utility input + apply
   - `NonBillableList.tsx` — non-billable expenses
3. Follow Anthropic-flavored DESIGN.md patterns (broadsheet grid, serif hero, rust accent)
4. Playwright E2E smoke test: Finance navigates to /billing, sees all 5 sections

**Success criteria:** Finance can navigate all 5 billing views. Empty states rendered cleanly.

**Effort:** 120 min CC (mostly component scaffolding).

---

### Step 5: Invoice generation logic — the heart of Phase 2

**Why:** This is where the 5 billing modes actually compute invoice line items. Highest-risk step in Phase 2 because math correctness = dispute material.

**Deliverables:**
1. New Postgres function `generate_monthly_invoices(p_period_month date)`:
   - Loops through all 5 modes per the spec's `generate_monthly_invoices` pseudocode
   - Inserts into `invoices` table with proper `billing_mode`, `company_id`, `period_month`, `amount`
   - Handles non-billable → deducts from `hv_operating_fund` (Phase 3 prereq table)
   - Idempotent: re-running for same period cleans and regenerates draft invoices only
2. `src/app/(portal)/billing/actions.ts`:
   - `generateInvoicesForPeriod(period_month)` — Finance calls the RPC
3. UI: "Generate invoices" button on `/billing` with confirmation panel (modeled after `GenerateStatementsButton`)
4. **TESTS (this is the critical one):**
   - Unit: HR pool split math — `dept_total × split_pct` for 3 companies rounds correctly
   - Unit: Finance attribution — per-staff × allocation_pct
   - Unit: Rent split — 100% total constraint, HV's share deducted from operating fund
   - Integration: full `generate_monthly_invoices` run against seeded data, assert count + totals
   - Edge case: re-running on same period doesn't double-count
   - Edge case: missing HR pool allocation for a period → surfaces a clear error, not silent zero

**Success criteria:** All billing tests pass. Manual E2E: generate April 2026 invoices, verify numbers match spec example (RM 27,150 total for HC).

**Effort:** 180-240 min CC — the hardest step in Phase 2.

---

### Step 6: Wire invoices into Monthly Statements

**Why:** Phase 1 Step 8 left the "Invoice items" section empty with a Phase 2 TODO. Now fill it in.

**Deliverables:**
1. Extend `generateStatements` Server Action (Phase 1 `statements/actions.ts`):
   - After creating the statement, query `invoices` for the same period + company
   - Insert one `monthly_statement_lines` row per invoice with `line_type = 'invoice'`, `category_code = <billing_mode>`
2. `statements/[id]/page.tsx` — remove the "No invoice items" placeholder, render actual lines (code already supports it, just need data)
3. Update `statements/page.tsx` hero to show invoice total > 0
4. E2E Playwright test: generate invoices → generate statements → verify statement detail page shows all 5 billing modes

**Success criteria:** A generated April 2026 statement for HC shows RM 27,150 total across 4 invoice line types (HR pool, Finance attribution, Finance mgmt fee, Rent/Utility).

**Effort:** 60-90 min CC.

---

### Step 7: Dept Pool UI — Marketing P&L

**Why:** Marketing is the only dept with actual P&L (others are cost-to-cost). Build the `/dept-pool` routes last because they depend on billing data.

**Deliverables:**
1. `src/app/(portal)/dept-pool/page.tsx` — Overview (all depts) for Principal/Finance
2. `src/app/(portal)/dept-pool/marketing/page.tsx` — Marketing detail (P&L + NP trend + expense history)
3. `dept_pool/actions.ts`:
   - `calculateDeptNP(department_id, period_month)` — RPC function that aggregates revenue - staff cost - expenses
   - `submitDeptExpense(formData)` — Dept Manager creates approval_request with request_type='dept_expense'
4. `_components/ExpenseForm.tsx` — client component for Dept Manager expense submission
5. Recharts bar chart for monthly NP trend
6. Wire Step 1's approval trigger to handle `dept_expense` side effect (insert into `dept_pools` with `transaction_type = 'expense_out'`)

**Success criteria:** Marketing Manager can submit expense, Principal approves it, expense shows in history + pool balance decreases.

**Effort:** 120 min CC.

---

### Step 8: Settings update — Rent/Utility split + audit history tables (fixes L2)

**Why:** Phase 2 introduces Rent/Utility which need per-company split %. Principal configures these in Settings. At the same time, backport /qa L2 fix: add audit history tables for all settings.

**Deliverables:**
1. New migration `20260101000019_settings_history.sql`:
   - `treasury_config_history`, `tier_config_history`, `overdue_config_history`, `company_tier_history`, `rent_split_history`, `utility_split_history` — all with `changed_by`, `changed_at`, snapshot of old row
   - Update triggers on each config table to write to history
2. New tables: `rent_splits`, `utility_splits` (company × pct per period)
3. `settings/_components/RentSplitSection.tsx` + `UtilitySplitSection.tsx`
4. `settings/actions.ts`:
   - `updateRentSplits` — validates total = 100%, upserts rows
   - `updateUtilitySplits` — same
5. Settings page: add 2 new sections
6. Tests: rent split total must equal 100% (edge case: round-trip 33.33 × 3)

**Success criteria:** Principal sets rent split, billing generation uses it. History shows old value + new value + changed_by.

**Effort:** 90 min CC.

---

### Step 9: Dashboard update — add Dept Pool + Billing Float data

**Why:** `dashboard_summary()` RPC currently surfaces Phase 1 Treasury data. Phase 2 needs to add: total dept pool balance, billing float (unpaid invoices), per-dept NP.

**Deliverables:**
1. Migration `20260101000020_dashboard_billing.sql` — extend `dashboard_summary()` JSONB with:
   - `dept_pool_total` — sum of all active dept pool balances
   - `billing_float` — sum of unpaid invoices in `draft`/`issued` status
   - `marketing_np_this_month` — current month Marketing P&L snapshot
2. `dashboard/page.tsx` — add new section "Dept pools" with per-dept balance (Principal + Finance only)
3. Add billing float to the existing hero or add a new card
4. Integration test: `dashboard_summary` shape includes new fields

**Success criteria:** Dashboard shows dept pool totals. Numbers match what `/dept-pool` page shows.

**Effort:** 60 min CC.

---

## Sidebar + role access updates

Phase 2 sidebar becomes (per spec):
- **Principal**: Dashboard, Fund IN, Fund OUT, Overdue, Statements, Approvals, **Dept Pool**, **Billing**, Director Salary (P3), HR Costing (P3), Reports (P3), Settings
- **Finance**: Dashboard, Fund IN, Fund OUT, Overdue, Statements, **Billing**, Reports (P3)
- **HR**: **HR Costing** (submit only), **Billing** (view HR aggregate only)
- **Dept Manager**: **Dept Pool** (own dept only)

Update `src/components/layout/Sidebar.tsx` in Step 4 when the billing route goes live.

---

## Critical decisions before starting

### Decision 1: `hr_cost_submissions` snapshot table or in-place `status` flag?

**Option A** — new table `hr_cost_submissions` that snapshots HR data at submit time. More storage, immutable audit trail.
**Option B** — add `status='draft'|'submitted'|'invoiced'` to `hr_staff_costs`. Simpler, no snapshot.

**Recommendation:** Option A. Submitted HR data becomes the basis for invoices that become legal documents. The snapshot is worth the storage.

### Decision 2: Invoice regeneration policy

If Finance regenerates invoices for a period that already has invoices in `issued` or `paid` status — what happens?

**Option A** — Skip issued/paid invoices, regenerate only drafts.
**Option B** — Create new invoices and flag old ones as `superseded`.
**Option C** — Error out, force manual intervention.

**Recommendation:** Option A. Matches the Phase 1 `generateStatements` pattern. Issued invoices are legally committed; don't touch them.

### Decision 3: Rent/Utility totals — HV share

Per spec Page 4: "HV (self) 10% → non-billable". The RM 1,000 HV share goes to `hv_operating_fund` as an expense. But `hv_operating_fund` is a Phase 3 table in spirit (Director Salary Engine manages it).

**Option A** — Implement `hv_operating_fund` writes as part of Phase 2 Step 5.
**Option B** — Defer non-billable bookkeeping to Phase 3, just log the amount in a Phase 2 `non_billable_expenses` table.

**Recommendation:** Option A. `hv_operating_fund` table already exists in Phase 1 foundation schema. Might as well wire it now rather than carry a TODO.

### Decision 4: Tests-first vs shim-first

Option A — Write the test for every Server Action/RPC before the implementation (TDD).
Option B — Write the implementation first, then tests (traditional).
Option C — Write the implementation with Claude, then ask Claude to write tests after each step.

**Recommendation:** Option C. You're already working in AI-compressed loops. TDD would add friction without catching bugs your E2E Playwright + /qa audit wouldn't already catch. Post-implementation tests from Claude are fine if the mandate is: "every new Server Action gets 1 happy + 1 edge case test before the commit."

---

## Effort estimate

| Step | CC time | Cumulative |
|------|---------|------------|
| 0 — Test bootstrap | 40 min | 0:40 |
| 1 — Approval trigger + M1/M2 | 100 min | 2:20 |
| 2 — Schema verify + seed | 50 min | 3:10 |
| 3 — HR Cost Summary | 90 min | 4:40 |
| 4 — Billing UI shell | 120 min | 6:40 |
| 5 — Invoice generation ⚠️ | 210 min | 10:10 |
| 6 — Wire into statements | 75 min | 11:25 |
| 7 — Dept Pool UI | 120 min | 13:25 |
| 8 — Settings + audit | 90 min | 14:55 |
| 9 — Dashboard extension | 60 min | 15:55 |

**Total: ~16 hours CC time.** For a human team, this would be 3-4 weeks. With Claude Opus 4.6 + Forge pipeline, realistically 3-4 sessions spread over 2-3 days at a sustainable pace.

**Recommended session breakdown:**
- **Session A (3h)**: Steps 0, 1, 2 — Foundation + test infra + approval trigger
- **Session B (4h)**: Steps 3, 4 — HR submission + billing UI shell
- **Session C (4h)**: Step 5 alone — Invoice generation (the hard one, don't rush)
- **Session D (4h)**: Steps 6, 7 — Statement wiring + Dept Pool
- **Session E (2.5h)**: Steps 8, 9 — Settings + Dashboard + final /qa pass

At least 2 of these should be daylight sessions per the retro's sustainable-pace habit.

---

## Risks + mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Invoice math bug silently corrupts statements | Med | High (legal) | Step 5 has 6 test cases; Step 6 E2E verifies expected totals |
| Phase 2 schema drift vs Phase 1 foundation | Low | Med | Step 2 verifies tables before code; any drift → migration in same step |
| RLS leak: Finance sees individual salaries | Low | **Critical** (PII) | Step 3 has explicit RLS audit as success criterion |
| Circular dependency: billing needs statements which need invoices | Already mitigated | — | Forge order solves this: Step 5 creates invoices, Step 6 wires them in |
| Approval trigger breaks Phase 1 flows | Med | High | Step 1 includes Phase 1 regression tests; run full Playwright suite before commit |
| Late-night single-session burnout | Med | Med | Enforce 2+ daylight sessions (B, D) |
| /qa Playwright MCP disconnects mid-session | High (known) | Low | Fallback to `npm run test` + manual browser checks |

---

## Success criteria for Phase 2 complete

1. All 9 Forge steps shipped with commits in linear history
2. Phase 1 M1 + M2 fixed as side effects of Step 1
3. At minimum 20 passing tests (0 → 20 delta)
4. GitHub Actions CI runs test + build on every push
5. E2E: Finance generates April 2026 invoices → generates statements → HC shows RM 27,150 total across 4 line types
6. `/qa` Phase 2 audit: 0 critical, 0 high, max 3 medium deferred
7. `docs/plan-phase2.md` archived to `docs/module-spec-phase2-implemented.md` with actual vs planned deltas
8. Updated `CLAUDE.md` to "Phase 2 (✅ Shipped YYYY-MM-DD)"
9. New `/retro` at end of Phase 2 shows: test files ≥ 20, deep sessions ≥ 4, streak ≥ 3 days

---

## Not in Phase 2 scope (explicitly deferred)

- **PDF statement export** — still Phase 1.5
- **Bank statement CSV import** — Phase 1.5
- **Mobile polish for billing forms** — Phase 1.5
- **Multi-currency** — Phase 3+
- **Compliance sign-off gate** — separate legal workstream (TODOS.md)
- **Director salary / HR costing beyond aggregate view** — Phase 3
- **Reports module** — Phase 3

---

## Ready to execute?

**Next action (if user approves):** Start Session A — Steps 0, 1, 2.

```
/plan-eng-review docs/plan-phase2.md   # optional: outside voice review
# or just:
Start Phase 2 Step 0
```
