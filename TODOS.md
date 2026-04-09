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
- [ ] **M1: Wrap loan + approval_request creation in a Postgres function for atomicity.** Currently `createLoan` in `src/app/(portal)/fund-out/actions.ts` does 2 separate INSERTs; if step 2 fails, orphan `pending_approval` loan that Finance cannot self-heal. Fix: `CREATE FUNCTION create_loan_with_approval(...)` running in a single transaction, called via `supabase.rpc()`. _Effort: S. Deferred per Phase 2 unattended-run decision — rare race, not worth the risk during Phase 2._

### High-value, high-urgency (original autoplan)
- [ ] **Bank statement CSV import + reconciliation.** Without this, the portal is authoritative but disconnected from actual bank balances. 6-month regret scenario: portal shows RM200K, bank shows RM180K, nobody knows where the gap is. _Effort: S (2-3 days CC / 1 week human). Source: CEO Premise 3._
- [ ] **Slack webhook notifications.** Principal + Finance don't sit in portal all day. Notify on: new approval request, approval decision, overdue detected, statement issued/paid. _Effort: S. Source: CEO Exp 3._
- [ ] **Read-access audit log.** Track who viewed sensitive salary/director data. Postgres triggers on SELECT for `director_payouts`, `hr_staff_costs`. LHDN + internal governance compliance. _Effort: S. Source: CEO Sec 3.3._
- [ ] **Base rate what-if simulator.** Principal plays with "what if I add RM100K paid capital at 0.8%?" before committing. _Effort: M. Source: CEO Exp 5._

### Medium-value
- [ ] **Loan portfolio CSV export.** For Principal's external accountant/auditor. Not implemented in Phase 1 (confirmed by /qa audit). _Effort: XS. Source: CEO Exp 4._
- [ ] **Mobile polish for Loan Create, Settings, Base Rate Calculator.** Phase 1 MVP mobile: Dashboard + Approval only. Desktop-only for complex forms. _Effort: M. Source: Design Pass 6._
- [ ] **Bespoke PDF statement template design.** Phase 1 ships minimal HV header + table (actually Phase 1 ships HTML statement page; PDF export deferred to Phase 1.5). Upgrade to branded letterhead with logo. _Effort: M (designer work). Source: Design T3._
- [x] ~~**Company tier history tracking**~~ → Done via unified `config_audit_log` in Phase 2 Step 8.

### Phase 2 cosmetic follow-ups (non-blocking)
- [ ] **Dept pool overview balance formatting.** `/dept-pool` list shows Marketing balance as "RM -500.00" instead of `(500.00)` parenthesis notation. Apply the same wrap as other detail pages. Source: Phase 2 QA report.
- [ ] **Marketing project contract CRUD UI.** `/billing` Marketing Projects section lists contracts but has no create/edit flow. Finance currently inserts contracts via DB. Source: module-spec-phase2.
- [ ] **Fixed split invoice generation.** `generate_monthly_invoices` does not yet consume `rent_splits` / `utility_splits` templates — extend Step 5 RPC to include rent/utility × monthly total. Source: Phase 2 plan.
- [ ] **Fold migrations 21 + 25 back into parent migrations.** On a future `supabase db reset`, consolidate migration 20 with its fix (21) and migration 23 with its fix (25).

### Low-urgency
- [ ] **Multi-currency support.** Phase 1 is MYR-only. HOUZS expansion to SG/TH needs this. _Effort: L. Source: CEO Exp 7._
- [ ] **Dark mode.** _Effort: M. Source: Design Pass 6._
- [ ] **Complex animations / page transitions.** Add sparingly later. _Effort: S. Source: Design Pass 4._

---

## Phase 2 prerequisites (before Phase 2 starts)

- [ ] **Rename `monthly_statement_lines.category` enum to text + lookup table.** Current enum hardcodes Phase 2 categories. When Phase 3 adds a new category, it's a DB migration. Change to `category_code text` + `statement_categories` reference table. _Effort: S. Source: CEO Subagent. Critical to avoid Phase 2 DB migration pain._

---

## Phase 3 prerequisites (MUST be done in Phase 1 per eng review)

- [ ] **Add `effective_from`/`effective_to` columns to all 4 statutory tables** (`epf_third_schedule`, `socso_act4_schedule`, `eis_act800_schedule`, `pcb_jadual`). When Malaysian statutory rates change (annually), Phase 3 must be able to recompute historical months with the old rates. Retrofit cost at Phase 3 = 10x. _Effort: XS schema only. Source: CEO + Eng subagent._
- [ ] **Add `calculation_snapshot` JSONB column to `director_payouts`.** Immutable record of all inputs (CTC, weightage, rate versions) at time of calculation. Makes director pay disputes resolvable. _Effort: XS schema only. Source: CEO subagent._
- [ ] **Add workflow state to `approval_requests`:** `workflow_state` (pending / needs_info / approved / rejected / delegated), `assigned_to`, `due_at`, `escalation_chain`. Prevents Principal becoming the bottleneck when on vacation. _Effort: S schema + UI. Source: CEO subagent._
- [ ] **Seed statutory tables now** (EPF/SOCSO/EIS/PCB). ~500 rows total. Needed for Phase 3 but seed during Phase 1 setup so Phase 3 isn't blocked. Source PDFs committed to `supabase/seed/sources/`. _Effort: M (need to transcribe from LHDN/KWSP/PERKESO PDFs). Source: CEO Sec 9.7._

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
