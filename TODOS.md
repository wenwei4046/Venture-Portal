# TODOS — HOUZS Venture Portal

Deferred items from `/autoplan` review on 2026-04-09 (commit 8d8fe62).

---

## Phase 1.5 (after MVP ships)

### High-value, high-urgency
- [ ] **Bank statement CSV import + reconciliation.** Without this, the portal is authoritative but disconnected from actual bank balances. 6-month regret scenario: portal shows RM200K, bank shows RM180K, nobody knows where the gap is. _Effort: S (2-3 days CC / 1 week human). Source: CEO Premise 3._
- [ ] **Slack webhook notifications.** Principal + Finance don't sit in portal all day. Notify on: new approval request, approval decision, overdue detected, statement issued/paid. _Effort: S. Source: CEO Exp 3._
- [ ] **Read-access audit log.** Track who viewed sensitive salary/director data. Postgres triggers on SELECT for `director_payouts`, `hr_staff_costs`. LHDN + internal governance compliance. _Effort: S. Source: CEO Sec 3.3._
- [ ] **Base rate what-if simulator.** Principal plays with "what if I add RM100K paid capital at 0.8%?" before committing. _Effort: M. Source: CEO Exp 5._

### Medium-value
- [ ] **Loan portfolio CSV export.** For Principal's external accountant/auditor. _Effort: XS. Source: CEO Exp 4 (was auto-added — may be done in Phase 1 already)._
- [ ] **Mobile polish for Loan Create, Settings, Base Rate Calculator.** Phase 1 MVP mobile: Dashboard + Approval only. Desktop-only for complex forms. _Effort: M. Source: Design Pass 6._
- [ ] **Bespoke PDF statement template design.** Phase 1 ships minimal HV header + table. Upgrade to branded letterhead with logo. _Effort: M (designer work). Source: Design T3._
- [ ] **Company tier history tracking.** Current schema has `companies.tier` as a single field. Audit needs history: when did HC go from T2 to T3? _Effort: S. Source: CEO Exp 6 / Eng 10.2. Auto-added to Phase 1 schema — verify._

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
