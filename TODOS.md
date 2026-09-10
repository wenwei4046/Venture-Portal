# TODOS — HOUZS Venture Portal

Deferred items from `/autoplan` review on 2026-04-09 (commit 8d8fe62)
and `/qa` Phase 1 acceptance audit on 2026-04-10 (commit 9a5e663).

**Phase 1 Treasury: ✅ SHIPPED 2026-04-10.** 9-step Forge pipeline complete.
See `.gstack/qa-reports/qa-report-phase1-2026-04-10.md` for the full audit.

**Phase 2 Dept Pool + Billing: ✅ SHIPPED 2026-04-10.** 9-step Forge pipeline
complete. See `.gstack/qa-reports/qa-report-phase2-2026-04-10.md`.

**Phase 3 Salary + HR + Reports: ✅ SHIPPED 2026-04-10.** 9-step Forge pipeline
complete. QA audit on 2026-04-11. See `.gstack/qa-reports/qa-report-phase3-2026-04-11.md`.

---

## Owed — one line (2026-09-10)

- **Person → sub-department column.** `comm_sync_position` picks a
  department's OLDEST active sub-department (`comm_scheme_for_department`).
  Revenue has one (Fair), so this is exact today; the day a second
  sub-department exists, which scheme a person earns under needs a column on
  `hr_staff_costs` (or a mapping table) and the function reads it instead.
- **Positions of inactive staff.** Deactivation leaves the open position as
  it is (payroll decides the leaving month). One inactive test row ("testing")
  still holds a position; harmless, nobody points at it.

## ✅ Completed (Phase 2)

- **M2: cancelLoan orphan fix** — shipped in Phase 2 Step 2 via
  `cancel_loan_and_approval(UUID, TEXT)` SECURITY DEFINER RPC +
  "Cancel this loan" button on the loan detail page. Migration 17.
- **L2: Settings audit history** — shipped in Phase 2 Step 8 as unified
  `config_audit_log` table with single trigger function covering
  treasury_config, tier_config, overdue_config, companies, rent_splits,
  utility_splits. Migrations 23 + 25.
- **Test framework bootstrap** — shipped in Phase 2 Step 1. Vitest +
  happy-dom + CI workflow, 0 → 48 passing tests.

---

## Phase 1.5 (remaining tech debt)

### Medium severity
- [x] ~~**M1: Wrap loan + approval_request creation in a Postgres function for atomicity.**~~ → Done in `b3c006b`. `create_loan_with_approval` SECURITY DEFINER RPC (migration 34) wraps both inserts atomically. `fund-out/actions.ts` now calls `supabase.rpc()`.

### High-value, high-urgency (original autoplan)
- [x] ~~**Bank statement CSV import + reconciliation.**~~ → Done in `8e8a03f`.
- [x] ~~**Slack webhook notifications.**~~ → Done in `74f1d2b`.
- [x] ~~**Read-access audit log.**~~ → Done in `b3c006b`. `access_log` table (migration 35) + `log_data_access` RPC + `/audit-log` page (Principal only). Fires on director payout view, director salary print, HR staff costs view.
- [x] ~~**Base rate what-if simulator.**~~ → Done in `e87841b`.

### Medium-value
- [x] ~~**Loan portfolio CSV export.**~~ → Done in `88abbe7`.
- [x] ~~**Mobile polish for Loan Create, Settings, Base Rate Calculator.**~~ → Done in `b3c006b`. Responsive form padding, stacking action buttons, Link fixes.
- [x] ~~**Bespoke PDF statement template design.**~~ → Done in `b3c006b`. Branded letterhead print page at `/statements/[id]/print` with HV company details, status badge, category breakdown, print button.
- [x] ~~**Company tier history tracking**~~ → Done via unified `config_audit_log` in Phase 2 Step 8.

### Phase 2 cosmetic follow-ups (non-blocking)
- [x] ~~**Dept pool overview balance formatting.**~~ → Already using parenthesis notation (confirmed in Phase 2 QA).
- [x] ~~**Marketing project contract CRUD UI.**~~ → Done in `b3c006b`. `ContractForm` client component + `/billing/contracts/new` + `/billing/contracts/[id]/edit` pages + `createContract`/`updateContract` server actions + approval request flow.
- [x] ~~**Fixed split invoice generation.**~~ → Done in `b3c006b`. `generate_fixed_split_invoices` RPC (migration 36) consumes `rent_splits` / `utility_splits` tables. `FixedSplitPanel` now has input fields for monthly totals.
- [x] ~~**Fold migrations 21 + 25 back into parent migrations.**~~ → Not needed: migration 20 already has the fix from 21, migration 25 is idempotent via CREATE OR REPLACE. Both are safe for future `db reset`.

### Low-urgency
- [ ] **Multi-currency support.** Phase 1 is MYR-only. HOUZS expansion to SG/TH needs this. _Effort: L. Source: CEO Exp 7._
- [x] ~~**Dark mode.**~~ → Done on 2026-04-11. Warm charcoal palette via CSS variables (RGB triplets). System preference + manual toggle in TopBar. FOUC prevention script. See DESIGN.md dark mode section.
- [ ] **Complex animations / page transitions.** Add sparingly later. _Effort: S. Source: Design Pass 4._

---

## Phase 2 prerequisites (before Phase 2 starts)

- [x] ~~**Rename `monthly_statement_lines.category` enum to text + lookup table.**~~ → Already implemented in migration 3. Schema uses `category_code TEXT REFERENCES statement_categories(code)` with a lookup table from the start. No enum was ever created.

---

## Phase 3 prerequisites (✅ ALL DONE — verified 2026-04-10)

- [x] ~~**`effective_from`/`effective_to` on statutory tables**~~ → Present in migration 8. All 4 tables have both columns + CHECK constraint.
- [x] ~~**`calculation_snapshot` JSONB on `director_payouts`**~~ → Present in migration 5 (line 156).
- [x] ~~**Workflow state on `approval_requests`**~~ → `workflow_state`, `assigned_to`, `due_at`, `escalation_chain` all present in migration 1 (lines 111-114).
- [x] ~~**Seed statutory tables**~~ → Done in Phase 3 Step 1. EPF 400 rows, SOCSO 64, EIS 54, PCB 140,661.

---

## Phase 4 (Treasury Refactor) follow-ups

Added 2026-04-19 during the Voucher Attachments (Phase A) eng review. These
surfaced as scope-creep during the plan review and were explicitly deferred.

### Medium severity
- [ ] **Dedup `formatRequestType` across 3 files.**
  - **What:** Three separate maps of `request_type → label` exist in
    `src/app/(portal)/approvals/page.tsx` (13 types, ALL-CAPS),
    `src/app/(portal)/approvals/[id]/page.tsx` (12 types, Title Case, missing
    `payroll_run`), and
    `src/app/(portal)/approvals/_components/CombinedApprovalCard.tsx`
    (only 2 types).
  - **Why:** Broken Window. Adding a new request_type requires editing 3
    files; easy to miss one and end up with raw `hr_opex` rendered in some
    view but `HR OPEX` in another.
  - **Pros:** One source of truth; future additions safer.
  - **Cons:** Pure refactor; UX debate on whether the canonical label should
    be ALL CAPS (list) or Title Case (detail) — may need two exports.
  - **Context:** Phase 4 Voucher Attachments eng review Issue #5.
  - **Depends on:** nothing.

### High severity
- [x] ~~**Batch approval atomicity (`approve_voucher_batch` RPC).**~~ → Done
  on 2026-04-19 in migration 171 (full β scope). `approve_voucher_batch`
  SECURITY DEFINER PL/pgSQL function ports the entire side-effect chain —
  status flip, bank debit, pool adjust, repayment sync, GL journal — into
  one Postgres transaction. Pre-validates role, period, voucher state, and
  bank balance before any mutation. Replaces the TS for-loop in the batch
  branch of `approveRequestGroup`; any RAISE EXCEPTION rolls back the whole
  batch, so partial-paid state is no longer possible. Loan OUT branch (1
  loan + 1 voucher) still uses the TS helper (scope intentionally kept
  narrow — only 1 voucher so partial-fail exposure is negligible).

### Medium severity
- [ ] **Phase B voucher PDF generation planning doc.**
  - **What:** Design document for auto-generating canonical supporting PDFs
    per voucher_type — payroll summary, payslip, invoice copy, loan memo,
    claim form.
  - **Why:** Principal's "every voucher must carry supporting docs" rule is
    currently enforced by Finance uploading manually. Auto-generation closes
    the gap and makes Phase C (DB trigger enforcing ≥1 attachment) realistic.
  - **Pros:** Clarifies Phase B scope before implementation; surfaces design
    questions (which PDF lib, which trigger point, what goes on the PDF).
  - **Cons:** Document-only; no code value until Phase B starts.
  - **Context:** Memory `project_voucher_attachments_pending.md` has the
    voucher_type → PDF mapping table. This TODO is to expand it into a real
    design doc with lib choice + trigger semantics + template guidelines.
  - **Depends on:** Phase A ship + real-world feedback from Finance/Principal
    on what's missing.

---

## Compliance / Legal (NOT engineering tasks — route to Principal)

- [ ] **Malaysian tax agent + company secretary sign-off before go-live.** Check:
  - Companies Act 2016 s.224 — intercompany loans need formal director approval
  - ITA s.140 — thin capitalization / transfer pricing compliance
  - Bank Negara Malaysia Financial Services Act 2013 — is "savings + lending at spread" considered deposit-taking?
  - LHDN transfer pricing documentation — are tier-based rates arm's length?
  - PDPA — employee PII handling, retention, subject-access-request process
  - Withholding tax treatment on interest payments to related parties
  - Overdue penalty enforceability between sister companies (risk of LHDN recharacterization as profit-shifting)
- [ ] **Add "legal sign-off required" gate to CLAUDE.md** so development cannot go live without compliance check.

---

## Contingency plan (if Phase 1 hits a wall)

- [ ] **Fallback: Xero + Retool prototype.** If after 4 weeks of Phase 1 development the team hasn't shipped Fund IN + Fund OUT, pause and spend 1 week prototyping `Xero (for intercompany loans) + Retool (for Principal dashboards) + separate custom Director Salary Engine for Phase 3`. This is the escape hatch if custom Phase 1 proves too ambitious. Source: CEO Approach C._
- [ ] **Fallback: PayrollPanda / Kakitangan.com evaluation** for Phase 3 statutory compliance. 1 day to test if vendor can handle EPF/SOCSO/EIS/PCB filing, eliminating 4 statutory tables + annual update burden. Source: CEO subagent._

---

## Phase 1 review findings (for reference — these are implementation tasks, not deferred)

See `~/.gstack/projects/wenwei4046-Venture-Portal/main-autoplan-phase1-*-20260409-213746.md` for full findings across:
- CEO review (premises, scope, architecture, security, observability)
- Design review (DESIGN.md, state components, hierarchy, a11y)
- Eng review (rate lock, idempotency, RLS matrix, indexes, test plan)
- Test plan artifact (~150 tests across unit/integration/RLS/E2E)

---

## mig 209-211 follow-ups (surfaced by vp-e2e-role-auditor on 2026-04-25)

### Low severity
- [ ] **Align statutory-lookup B+K wage basis with engine `offsetBkRatio`.**
  - **What:** `src/app/(portal)/director-salary/actions.ts:197,212` computes
    statutory lookup keys using `pool.basicRatio` on `payrollGross / invoiceBase`,
    but the engine (`src/lib/salary.ts:164`) splits the actual `payrollBk/allow`
    using the post-offset `offsetBkRatio = bkShare/afterOffset`. When advance
    offset consumes part of allowance, `offsetBkRatio` > `pool.basicRatio`.
  - **Why:** Effect is small (WL example on 2026-05 test: statutory-lookup basis
    8,063.90 vs stored `payroll_bk=8,961.67`) and does NOT cause journal drift —
    component totals are self-consistent within the stored row. But the
    "lookup wage" and the "reported wage" are off by a slice when advance
    offset fires.
  - **Pros:** Perfect self-consistency across payout fields; avoids a future
    auditor question.
  - **Cons:** Requires restructuring `actions.ts` to compute statutory
    deductions from `offsetBkRatio` post-engine, not pre-engine from
    `pool.basicRatio`.
  - **Context:** vp-e2e-role-auditor 🟢 GREEN verdict on 2026-04-25, finding #3.
  - **Depends on:** nothing.

- **Inter-billing settlement is not transactionally atomic** (`src/app/(portal)/payments/actions.ts`, `createPaymentVoucher`)
  - **What:** An inter-billing settlement performs sequential non-transactional Supabase
    inserts: voucher → receiving `np_in` (adjustPool) → paying `inter_billing_out`
    dept_pool → `role='mirror'` payment_voucher_sources → invoice status. As of
    `9f2c1a6` the paying-side `inter_billing_out` insert (and its paying-dept
    resolution) now FAIL LOUD (throw) instead of silently swallowing — so a
    failure is detectable, the invoice stays `issued`/retryable, and no mirror
    row is written. But the receiving-side `np_in` (committed earlier in the
    sequence) is left orphaned without its paired `inter_billing_out` until the
    settlement is retried/reconciled.
  - **Fix:** Wrap the whole inter-billing credit branch (np_in + inter_billing_out
    + mirror + invoice-status) in a single Postgres transaction — realistically a
    `SECURITY DEFINER` RPC, since the Supabase JS client has no client-side tx.
  - **Why deferred:** Fail-loud (9f2c1a6) already stops the silent-wrong-books
    failure mode (the production bug: HV-INV-202605-0004/0005 settled, receiving
    np_in + mirror committed, paying HR/Director Office never debited, zero error
    — backfilled manually 2026-05-18). Full atomicity touches the whole write
    path + RLS/trigger surface (`check_dept_pool_sufficient`,
    `pvs_enforce_sum_matches_voucher`); bolting it onto the targeted fix would be
    scope creep on a hot financial path.
  - **Context:** Found via systematic-debugging audit 2026-05-18 (user reported
    inter-bill settled but paying dept showed no /dept-pool deduction).
  - **Depends on:** nothing.
