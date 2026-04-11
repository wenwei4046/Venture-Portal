# Full Portal Design Review — By Role

**Date:** 2026-04-11
**Reviewer:** Claude (Opus 4.6) via /design-review skill
**Target:** http://localhost:3000 (dev server)
**HEAD at start:** a87964b
**HEAD at end:** 79cda87 (9 commits from this review)
**Method:** Role-play. Log in as each of 4 roles, execute real daily processes end-to-end. Every button, status, label, copy, interaction — noted. Findings fixed atomically per commit.

---

## Commits from this review (9)

| Commit | Finding IDs | Summary |
|---|---|---|
| `f0016fe` | P-DASH-01..07 | Principal dashboard polish (RPC leak, RM consistency, italic labels, warm empty state) |
| `af60939` | P-PNL-01 | P&L report — 11 RM-strip callsites unified |
| `8b0fc32` | P-REP-01 + P-BR-01 | Reports landing copy + Base Rate drill-through to simulator |
| `43a300c` | P-SET-01 | Anchor link `#base-rate-simulator` on /settings |
| `6bd09a2` | F-STMT-01 | Statements list + detail RM consistency |
| `cee015e` | F-BIL-01 + F-REC-01 | Billing enum humanization + CSV preview RM |
| `f88c39f` | H-DS-01/02 + H-HRC-01 | Director Salary duplicate subtitle, Saving column RM, HR Costing table-name leak |
| `617fe34` | H-DP-01/02 | Director Pool card headlines RM |
| `79cda87` | M-DP-01 + M-MKT-01/02/03 | Dept Pool list + Marketing detail RM consistency |

---

## Full checklist — every page visited + every process executed

### ROLE 1: Principal (principal@venture.my)

**Process 1 — Morning dashboard check (`/dashboard`):**
- Checked: greeting, date, Free pool hero, sparkline, inline stats row (Pool/lent/Above buffer/Buffer), Pending approvals empty state, Margin panel (Weighted cost / Base rate / Net spread / Interest income / expense / Net interest), Subsidiaries table (8 entities, all Savings/Loans/Net columns), Billing & Dept Pool cards, Director Salary section cards, Director Pool drill-through link.
- **Findings: P-DASH-01..07 (all fixed in `f0016fe`)**

**Process 2 — Approvals backlog (`/approvals`):**
- Checked: heading, subtitle, Pending section (empty state "All caught up"), Recent decisions list (4 resolved items with type chip + status italic + date + amount).
- **P-APPR-01 (deferred)**: `Director advance top-up for Apr 2026: RM23,863.12` — no space between RM and number. Root cause: SQL function `save_director_salary_results` migration 31 line 152. Future migration.

**Process 3 — Monthly P&L (`/reports/pnl`):**
- Checked: heading, month picker, three sections (Treasury spread / Marketing P&L / Shared Services bill-back), all line items + subtotals, final HV Net Profit headline, per-section breakdown tiles, footer note "Director salary is pass-through".
- **Findings: P-PNL-01 (fixed in `af60939`)** — 11 RM-strip callsites unified.

**Process 4 — Base rate simulation (`/reports` → `/reports/base-rate` → `/reports/fund-summary`):**
- Checked: Reports landing card grid (4 cards with titles + descriptions), Base Rate History table (1 row + "Approved" column), Fund Summary page (Paid Capital table / Free Capital / Allocated / Free Cash hero).
- **Findings: P-REP-01 + P-BR-01 (fixed in `8b0fc32`)** — card copy fiction + missing drill-through. Fund Summary page is clean (ships with correct RM handling).

**Process 5 — Settings config (`/settings`):**
- Checked: Treasury section (Op Margin / Buffer / Saving Rate), Tier Premiums (T1-T4), Overdue Stages (Grace/Late1/Late2/Escalation), Company Tier Assignment (8 subs), Director Salary weightage (MK/WL/WS/WW), Base Rate Simulator at bottom.
- **Findings: P-SET-01 (fixed in `43a300c`)** — base-rate drill link dropped user at top; added `#base-rate-simulator` anchor.

**Process 6 — Audit log (`/audit-log`):**
- Checked: heading, filter pills (All/Director Payouts/Director Print/HR Staff Costs), empty state card.
- **No findings.** Clean.

### ROLE 2: Finance (finance@venture.my)

**Process 1 — Dashboard (`/dashboard`):**
- Role-specific: "Good evening, Finance Manager." greeting, Margin panel moved to right column in hero grid (vs Principal full-width). 12 sidebar items.
- **Finding — F-NAV-01 (noted, not fixed):** Finance has no "Approvals" sidebar entry but submits approval requests (loans, contracts). Workflow gap — Finance can't see "things I submitted pending Principal approval". Needs product decision (my-submissions page? filter on approvals?).

**Process 2 — Fund IN list (`/fund-in`):**
- Checked: heading, Record new fund source CTA, Total paid capital hero (with smaller `.00` cents typography trick — beautiful), Weighted average cost right panel, Fund sources table.
- **No findings.** Page is exceptional — the `.00` cents rendered smaller than the main number is a lovely typographic detail.

**Process 3 — Fund IN new form (`/fund-in/new`):**
- Checked: Source type toggle pills (Subsidiary savings / Director loan), Subsidiary dropdown, Amount + Cost rate inputs (with unit suffixes), Lock-in period + Effective date, Notes textarea, "Record fund source" rust button, "Rate locks at save" italic warning.
- **No findings.** Form is very well designed.

**Process 4 — Fund OUT list (`/fund-out`):**
- Checked: heading, Export CSV + Record new loan CTAs, Total outstanding hero + Weighted effective rate, Loans table (Company / Principal / Outstanding / Rate / Tier / Status / View).
- **No findings.** Same broadsheet pattern as Fund IN.

**Process 5 — Overdue check (`/overdue`):**
- Checked: heading, Detect overdue CTA, Penalty outstanding hero with `RM —` for zero, empty state "All loans current."
- **No findings.** Perfect warm empty state.

**Process 6 — Month-end statements (`/statements` → `/statements/[id]`):**
- Checked: Statements list (COMPANY / INVOICE / CONTRA / NET / STATUS columns, 8 rows), statement detail page (hero Net amount, Invoice items section, Contra items section, Final summary card, Actions).
- **Findings: F-STMT-01 (fixed in `6bd09a2`)** — RM-strip across list + detail (6 callsites).

**Process 7 — Reconciliation (`/reconciliation`):**
- Checked: heading, Upload CSV card, supported columns hint.
- **Findings: F-REC-01 (fixed in `cee015e`, latent)** — `CSVUpload.tsx` preview had 2 RM-strip callsites (debit/credit columns). Fixed preemptively.

**Process 8 — Service Billing (`/billing`):**
- Checked: heading, period picker, Generate invoices CTA, hero total, right column stats (HR snapshot / Marketing contracts / Invoices this period), Invoices section with per-mode breakdown + invoice table (Invoice # / Company / Mode / Amount / Status), 5 billing mode sections below (HR Pool Split / Marketing Projects / Finance Attribution / Finance Mgmt Fee / Fixed Split).
- **Findings: F-BIL-01 (fixed in `cee015e`)** — `hr_pool_split` / `marketing_project` / `finance_attribution` / `finance_mgmt_fee` / `fixed_split` raw snake_case enums leaked into the UI in 6 places (InvoicesList breakdown + MODE column + 5 dev-tag spans next to section headings). Added `formatBillingMode()` helper + removed dev tags.

### ROLE 3: HR Manager (hr@venture.my)

**Process 1 — HR Overview dashboard (`/dashboard`):**
- Checked: custom HR view (4 KPI cards: Total Headcount / Monthly Payroll / Pending Claims / Director Salary), Needs your review section, By Department table, Monthly Status cards (HR Cost Submission + Director Salary Status).
- **No findings.** (This is the dashboard I built earlier in this session — already polished.)

**Process 2 — Staff CRUD (`/hr-costing/staff`):**
- Checked: "← Back to HR Costing" breadcrumb, heading, rich table (NAME / DEPARTMENT / BASIC / STATUTORY ALLOW / NON-STAT ALLOW / EPF ER / TOTAL CTC / TYPE / ACTIONS), per-row Delete links, Add Staff form at bottom (Name / Department / Basic Salary / Statutory Allow / Non-Stat Allow / Type dropdown).
- **No findings.** Type column correctly distinguishes "Mgmt Fee" (rust italic) from "Attribution".

**Process 3 — HR Costing submission (`/hr-costing`):**
- Checked: heading, Manage Staff CTA, submitted period hero, right column totals (basic / statutory / allowance / total CTC), By department live aggregate table, Submission history table.
- **Findings: H-HRC-01 (fixed in `f88c39f`)** — "Live aggregate from `hr_staff_costs`" leaked raw table name. Also empty state said "Seed via `npm run seed:hr-staff`" (dev instruction in user UI).

**Process 4 — Director Salary compute (`/director-salary`):**
- Checked: heading, bilingual subtitle, period picker, Salary Pool hero + 5-row totals (Total Payroll/Invoice/Saving/Advance/Net to Directors), CTC Input grid (8 companies × 4 columns + total), Director Pool Total row, Save CTC button, Calculate section + button, Per-Director Payouts table (4 directors × 6 columns).
- **Findings: H-DS-01/02 (fixed in `f88c39f`)** — duplicate Chinese subtitle (two paragraphs saying the same thing), Saving column missing RM prefix.

**Process 5 — Director Pool unified view (`/director-pool`):**
- Checked: heading, 3 cards (Director Saving / Director Invoice / Claims Deducted), Director Saving transaction table, Director Invoice transaction table.
- **Findings: H-DP-01/02 (fixed in `617fe34`)** — Director Saving card + Claims Deducted card missing RM prefix on negatives (while Director Invoice card had it).

**Process 6 — Claims (`/claims`):**
- Checked: heading, + New Claim CTA, Benefit Claims / Pool Claims tabs, claim row (Claimant / Description / Amount / Status / Date).
- **No findings.** Clean tab UI.

### ROLE 4: Marketing Manager / dept_manager (marketing@venture.my)

**Process 1 — Dashboard fallback (`/dashboard`):**
- Checked: cold fallback "Dashboard / Treasury data is available to Principal and Finance only. / Use the sidebar to navigate to your modules."
- **Finding — M-DASH-01 (deferred, feature request):** Cold fallback. Should mirror the HR dashboard pattern — role-specific overview showing Marketing pool balance + pending expenses + this month's spend. **Future PR.**

**Process 2 — Dept Pool list (`/dept-pool`):**
- Checked: heading, "Total pool deployed to Treasury" hero, By department table (1 row — Marketing), cost-to-cost footer explanation.
- **Findings: M-DP-01 (fixed in `79cda87`)** — NP column missing RM prefix on negatives.

**Process 3 — Marketing pool detail + submit expense (`/dept-pool/marketing`):**
- Checked: breadcrumb, "Department pool / Marketing / Period April 2026", Pool balance hero, right column NP breakdown (Revenue / Staff cost / Dept expenses / Net profit), Expense history table, New expense form at bottom.
- **Findings: M-MKT-01/02/03 (fixed in `79cda87`)** — hero Pool balance, right column stats, and expense history Amount column all had RM-strip on negatives.

**Process 4 — Claims submit (`/claims`):**
- Checked: Same as HR view — tabs + table + CTA.
- **No findings.**

---

## Scoring by role (1-10, higher is more user-friendly)

I'm scoring each role against 5 dimensions: **Ease of Click** (CTAs obvious, fewest stuck moments), **Ease of Read** (hierarchy, readability, copy clarity), **Warmth** (vs stiff ERP), **Beauty**, **Friction Points**.

### 👑 Principal — 46/50

| Dimension | Score | Notes |
|---|---|---|
| Ease of Click | 9/10 | Clear sidebar (17 items, well-named), CTAs prominent. Only friction was the base-rate simulator being buried — now fixed with anchor. |
| Ease of Read | 10/10 | Broadsheet hierarchy is exceptional. Serif italic labels, tabular mono numbers, semantic colors. Subsidiaries table reads like a newspaper. |
| Warmth | 10/10 | "Good evening, Principal." + italic rust + "Pending your hand" section + "All caught up" empty states. Zero ERP feel. |
| Beauty | 10/10 | The Anthropic-flavored warm-cream + rust aesthetic peaks here. Margin panel card, subsidiaries table, Fund Summary hero — all camera-ready. |
| Friction | 7/10 | Base rate workflow disconnect was the biggest issue (history → simulator) — fixed. Some `.replace('RM ', '')` inconsistencies — fixed. |

### 💼 Finance — 45/50

| Dimension | Score | Notes |
|---|---|---|
| Ease of Click | 9/10 | Clear sidebar (12 items). Record new fund source / Record new loan CTAs obvious. F-NAV-01 (no "Approvals" link) is a gap but deferred. |
| Ease of Read | 10/10 | Statements, Fund IN, Fund OUT — all use the same broadsheet pattern. `RM —` for zero, italic status labels, right-aligned mono numbers. |
| Warmth | 10/10 | "All loans current." empty state. "Rate locks at save" italic warning on forms. Not corporate — personal. |
| Beauty | 10/10 | Fund IN hero with smaller `.00` cents is a showcase detail. Subsidiaries table carries across. Billing page with humanized modes now looks polished. |
| Friction | 6/10 | Had more RM-strip issues than Principal (statements + billing) but all fixed. Fund-in `.replace(/\.\d{2}$/, '')` typography trick is specific to that one page (correct to keep). |

### 🧑‍💼 HR Manager — 41/50

| Dimension | Score | Notes |
|---|---|---|
| Ease of Click | 8/10 | Small sidebar (5 items) — easy nav. "Manage Staff" CTA on HR Costing. Director Salary has clear Save/Calculate/Detail flow. Add Staff form at bottom of /hr-costing/staff — acceptable but less discoverable than top. |
| Ease of Read | 9/10 | Staff table has 9 columns — dense but readable. HR Dashboard KPI cards match the Principal aesthetic. Bilingual Chinese subtitles are a warm touch. |
| Warmth | 9/10 | HR dashboard is warm (mine). Claims empty state "All caught up" is warm. Staff page has clean italic TYPE column. |
| Beauty | 8/10 | Director Salary CTC Input grid is functional but dense. Per-Director Payouts table is clean. Slight style variation (bilingual subtitles) is charming. |
| Friction | 7/10 | `hr_staff_costs` table name leak — fixed. Duplicate Chinese subtitle on Director Salary — fixed. Saving column + Director Pool cards RM — fixed. |

### 📣 Marketing Manager — 35/50

| Dimension | Score | Notes |
|---|---|---|
| Ease of Click | 7/10 | Tiny sidebar (3 items: Overview / Dept Pool / Claims). No workflow friction — but also **no role-specific dashboard**. Lands on a cold fallback. |
| Ease of Read | 8/10 | Dept Pool detail page is clean — hero balance + right stats + expense history. Once fixed for RM consistency, reads well. |
| Warmth | 6/10 | **Dashboard fallback is COLD.** "Treasury data is available to Principal and Finance only" reads like "this is not for you" — opposite of warm. |
| Beauty | 7/10 | Dept pool detail + marketing pool pages are pretty. But the fallback dashboard is a big blank canvas with a dry paragraph. |
| Friction | 7/10 | Had 4 RM-strip issues (now fixed). Biggest unfixed friction: no dedicated dashboard. Deferred as feature work. |

---

## 🏆 WINNER: **Principal** (46/50)

The **Principal role has the most user-friendly design**, narrowly edging out Finance (45/50).

**Why Principal wins:**

1. **The dashboard is the pinnacle** of the warm-ledger aesthetic. Free pool hero, margin panel, subsidiaries table with italic creditor/debtor/even labels, Director Salary + Director Pool cards — it's a *curated morning coffee experience*, not a KPI dump.

2. **Approvals page + detail flow** is tight. "Pending your hand" → click → approve dialog with request-type-aware copy (fixed earlier in this session) → "All caught up" empty state. Zero corporate ceremony.

3. **Reports section** (P&L, Fund Summary, Base Rate History) now has coherent drill-throughs (after P-BR-01/P-SET-01 fixes). The P&L page is a beautiful bank-model breakdown.

4. **Settings** is a single long page (not tabs) but manageable — Principal is the only user who goes here, so deep scrolling is fine for an occasional visit.

5. **Audit Log** is quietly good — filter pills, empty state, compliance framing ("LHDN + internal governance compliance").

**Why Finance is so close:** Finance is actually **arguably more polished on forms** (Fund IN new, Fund OUT new have beautiful helper copy + unit suffixes + "Rate locks at save" italics). The `.00` cents typography trick on Fund IN hero is breathtaking. If the brief was "which role does the most *work* most smoothly", Finance might win. But Principal has the better ceremonial experience — the dashboard-as-news-front aesthetic.

**Why HR is 3rd:** Strong underneath — the HR dashboard I built works, the bilingual touches are charming, the Director Salary engine page is functional. But the CTC Input grid is dense, Director Salary has many mandatory steps (CTC → Save → Calculate → Per-Director Payouts → Save → Confirm), and the Staff Cost page is 9 columns wide. HR does more **work** per visit than Principal, which inherently creates more friction.

**Why Marketing is 4th:** Not because the pages are bad — `/dept-pool/marketing` is actually quite pretty. It's because the **dashboard fallback is cold**. First impression matters enormously. A Marketing Manager opening the portal sees *"Treasury data is available to Principal and Finance only"* — a sentence that starts with exclusion. Every other role gets a personalized greeting + dashboard. **M-DASH-01 is the most impactful deferred finding in this review.**

---

## Deferred findings (not fixed — need product decision)

| ID | Severity | Description | Why deferred |
|---|---|---|---|
| P-APPR-01 | Low | `RM23,863.12` no-space in approval description | DB data + SQL function; needs new migration |
| F-NAV-01 | Medium | Finance has no way to track "my submitted approvals" pending Principal | Product decision: new page? filter? |
| M-DASH-01 | **High** | Marketing (dept_manager) dashboard is a cold fallback instead of role-specific overview | Feature work — build mini-dashboard like HR |

---

## Systemic pattern still in the codebase

The `.replace('RM ', '')` pattern is the root cause of 40+ of the findings I fixed this session. A **proper long-term fix** would be:

1. Add a `formatMoneyBare(x)` helper to `src/lib/utils.ts` returning `1,234.56` / `(1,234.56)` without RM
2. Sweep all remaining `.replace('RM ', '')` callsites and replace with the helper
3. Remaining callsites (mostly inside dense tables like `director-salary/[directorId]/page.tsx` statutory deductions table) keep the bare pattern but via the helper

I didn't do this sweep because it's a **non-trivial refactor** (~30 files touched, needs individual callsite judgment). Each role walkthrough fixed the pages where the inconsistency was **visible and inconsistent within a single card/card-row/column** — the places that actually hurt the user. The remaining callsites are in places where bare numbers are the entire column convention, and adding RM back would be its own disruption.

Recommend scheduling this as a **standalone polish PR** when there's capacity.

---

## Rating → Final recommendations

1. **Short term (next session):**
   - Build the Marketing Manager mini-dashboard (M-DASH-01) — biggest UX win for a forgotten role
   - Decide on Finance "my submissions" workflow (F-NAV-01)
   - Migration for the advance description spacing (P-APPR-01) — batch with other SQL polish

2. **Medium term:**
   - `formatMoneyBare` helper + sweep
   - Consider whether /settings should become tabbed (treasury / tier / overdue / company / director / simulator)

3. **Long term:**
   - Role-specific dashboards for all non-treasury roles
   - Mobile audit (I only looked at desktop this session)
