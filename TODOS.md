# TODOS — HOUZS Venture Portal

Deferred items from `/autoplan` review on 2026-04-09 (commit 8d8fe62)
and `/qa` Phase 1 acceptance audit on 2026-04-10 (commit 9a5e663).

**Phase 1 Treasury: ✅ SHIPPED 2026-04-10.** 9-step Forge pipeline complete.
See `.gstack/qa-reports/qa-report-phase1-2026-04-10.md` for the full audit.

**Phase 2 Dept Pool + Billing: ✅ SHIPPED 2026-04-10.** 9-step Forge pipeline
complete. See `.gstack/qa-reports/qa-report-phase2-2026-04-10.md`.

---

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
- [ ] **Dark mode.** _Effort: M. Source: Design Pass 6._
- [ ] **Complex animations / page transitions.** Add sparingly later. _Effort: S. Source: Design Pass 4._

---

## Phase 2 prerequisites (before Phase 2 starts)

- [ ] **Rename `monthly_statement_lines.category` enum to text + lookup table.** Current enum hardcodes Phase 2 categories. When Phase 3 adds a new category, it's a DB migration. Change to `category_code text` + `statement_categories` reference table. _Effort: S. Source: CEO Subagent. Critical to avoid Phase 2 DB migration pain._

---

## Phase 3 prerequisites (✅ ALL DONE — verified 2026-04-10)

- [x] ~~**`effective_from`/`effective_to` on statutory tables**~~ → Present in migration 8. All 4 tables have both columns + CHECK constraint.
- [x] ~~**`calculation_snapshot` JSONB on `director_payouts`**~~ → Present in migration 5 (line 156).
- [x] ~~**Workflow state on `approval_requests`**~~ → `workflow_state`, `assigned_to`, `due_at`, `escalation_chain` all present in migration 1 (lines 111-114).
- [x] ~~**Seed statutory tables**~~ → Done in Phase 3 Step 1. EPF 400 rows, SOCSO 64, EIS 54, PCB 140,661.

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
