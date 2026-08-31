# Module Spec — Revenue Department Commission Payroll

Status: **DRAFT.** Rules briefed 2026-08-31 and implemented in the engine.
Blocking gaps: the ~39 salespeople do not exist in the staff master, and the
KPI product list has not been chosen (§9).
Owner: Principal + HR.
Related: `module-spec-phase3.md` (HR Costing), `db-schema.md`, `DESIGN.md`.

---

## 1. Problem

Today every payroll row is *imported already-computed* from InfoTech
(`hr_monthly_payroll`, source = `imported`, verbatim per the 2026-06-05 rule).

The **Revenue Department** (dept `186bd9e0…`, segment `revenue_department`,
pool GL `1090`, provisioned 2026-08-24) does not work that way. Its staff are
salespeople with **no basic salary and no statutory allowance** — 100% of their
pay is commission, *derived* from an ERP sales-order export.

So payroll gains a second **source type**:

| Type | Source of truth | Departments |
|---|---|---|
| `imported` | InfoTech payroll export (verbatim) | HR, Finance, Marketing, IT, Director Office |
| `commission` | ERP sales export → commission engine | Revenue Department |

Commission settles **month to month on the calendar month** — August = 1 Aug
through 31 Aug (user, 2026-08-31).

---

## 2. Core architectural decision — do NOT fork payroll

The commission engine is an **upstream feeder**, not a parallel payroll.

```
ERP sales-order export (xlsx)
        │  import (parse → preview → match agents → commit)
        ▼
  sales_orders + sales_order_lines          ← raw facts, immutable per batch
        │
        │  + comm_ranks / comm_item_groups / comm_kpi_items
        │  + comm_kpi_thresholds / comm_open_bill_rules / comm_hierarchy
        │  + sales_order_open_bill_tags     ← 1st/2nd/3rd bill picks
        ▼
  COMMISSION ENGINE  (pure TS, src/lib/commission/engine.ts)
        │
        ▼
  comm_runs → comm_statements → comm_statement_lines   ← every ringgit traceable
        │
        │  apply_commission_run(period)   [atomic RPC]
        ▼
  hr_monthly_payroll.commission_amount     ← ONE field written
        │
        ▼
  existing trigger: pro-rata → EPF/SOCSO/EIS → PCB → gross → net
        │
        ▼
  payroll_runs → funding request → PV → GL   (all untouched)
```

**Why:** statutory lookups, payroll runs, funding, accrual JVs, disbursement
vouchers, GL segments and the whole approval chain already work and are
audited. Forking them for one department would double the surface area of every
future fix. The only genuinely new thing is *how `commission_amount` is arrived
at*.

---

## 3. Org structure — department › sub-department › scheme

The Revenue Department is divided into **sub-departments**, and *each one
calculates differently* (user, 2026-08-31). **Fair** — the roadshow / event
team — is the first, and the four components below are **Fair's** ruleset, not
the department's.

```
departments (Revenue Department)
  └── comm_sub_departments (Fair, …)
        └── comm_schemes                  ← knobs + per-component switches
              ├── comm_ranks              4 tiers, rates 5–10%
              ├── comm_item_groups        which ERP groups are commissionable
              ├── comm_kpi_items          product → flat KPI allowance
              ├── comm_kpi_thresholds     qty ladder → uplift
              ├── comm_open_bill_rules    1st/2nd/3rd bill of the day
              └── comm_hierarchy          who is under who, effective-dated
```

Settings gets a **Generate New Sub-Department** action. Creating one either
**clones** an existing sub-department's scheme (every rule row copied, with
`cloned_from_scheme_id` recorded) or starts empty for a bespoke ruleset. Because
each component can be switched off at scheme level
(`enable_product_revenue` / `enable_kpi` / `enable_open_bill` /
`enable_override`), a sub-department that only pays a flat percentage reuses the
same engine instead of getting a bespoke one.

`comm_hierarchy` enforces **one position per person at a time** across all
schemes, so nobody can sit in two sub-departments and be paid twice.

### 3.1 The tier ladder

| Tier | Rates | Notes |
|---|---|---|
| Revenue Specialist | **5%** → **6%** → **7%** | 5% **may not recruit**. Reaching 6% unlocks recruiting and overriding the 5%s. 6% → 7% at **300k**. |
| Team Assistant | **7%**, **8%** | each with a sales target |
| Team Leader | **9%** | |
| Senior Team Leader | **10%** | |

Rates **overlap across tiers** (7% is both a senior Revenue Specialist and a
junior Team Assistant), so `comm_ranks.rank_key` — not the rate — is the
identity. `can_recruit` is `false` only on `rs_5`; the engine warns if anyone is
placed under a rank that may not recruit.

Promotion is **manual for now**: the portal shows progress toward the threshold
and a human promotes. Auto-promotion needs Q1 (§9) answered — the brief says
300k but not 300k *of what*.

---

## 4. The four commission components (Fair)

Computed for one salesperson `S` in one calendar month `P`.

### 4.0 Line classification

Every `sales_order_lines` row is classified at **compute time** (not import
time, so re-configuring KPI items or item groups re-computes cleanly):

1. **KPI line** — `product_code` matches an active `comm_kpi_items` row.
2. **Commissionable** — `item_group` is marked commissionable.
3. **Excluded** — `item_group` is marked non-commissionable.
4. **Unknown group** — not in `comm_item_groups` at all → treated as **not**
   commissionable **and raises a run warning**. A new ERP group can never
   silently start or stop paying.

Item-group policy (user, 2026-08-31):

| Group | Commissionable | July 2026 revenue |
|---|---|---:|
| MATTRESS | ✅ | 2,326,517.00 |
| SOFA | ✅ | 436,455.00 |
| BEDFRAME | ✅ | 63,602.00 |
| ACC (accessories) | ✅ | 3,133.30 |
| DINING | ✅ | 2,000.00 |
| **TRANS** (transport charges) | ❌ | 27,444.00 |
| **OTHER** (disposal, misc) | ❌ | 2,210.00 |

> `PR(S)` = **product revenue** = Σ `line_amount` over S's *commissionable,
> non-KPI* lines. July's commissionable base is **RM2,831,707.30** of
> RM2,861,361.30 booked — RM29,654.00 dropped.

### 4.1 C1 — Product revenue commission

```
C1 = PR(S) × rate(S)
```

`rate(S)` comes from S's rank in `comm_hierarchy` as at `P`, and is
**snapshotted** onto the statement when the run computes.

### 4.2 C2 — KPI items

```
KPIqty  = Σ qty                       over KPI lines
KPIbase = Σ (qty × kpi_unit_amount)   over KPI lines     e.g. pillow → RM50
bonus%  = highest comm_kpi_thresholds rung whose min_qty ≤ KPIqty  (else 0)
C2      = KPIbase × (1 + bonus%)
```

The brief's worked example: 10 × RM50 = RM500, +20% on top = **RM600**. ✅

KPI-item revenue is **excluded from `PR`** — the item already earns its
allowance, so counting it twice would double-pay. In practice most KPI items are
**bundled free** (see §5), which is precisely the case a flat allowance exists
to reward. Modelled as a ladder, not a single threshold, so `Tier 2` can be
added later without a schema change.

### 4.3 C3 — Open Bill (1st / 2nd / 3rd bill of the event day)

Rewards writing consecutive bills during a 3-day event. HR/Principal picks which
of a salesperson's orders is that **day's** 1st, 2nd or 3rd bill.

```
for each tagged order O of S with rank r:
    OPR(O) = commissionable, non-KPI revenue of O
    C3 += OPR(O) × rate(S) × billPct(r)      billPct = 50% / 40% / 30%
```

Confirmed by the brief: *"10,000 at 7% — compute the 7% first, then add 50%"*
→ 700 commission + **350 bonus** = 1,050 on that order. It follows the person's
**current** rate, so a promotion changes the bonus, and it is **additive** — the
tagged order still earns its normal C1.

`comm_schemes.open_bill_basis` also supports `pct_of_revenue` as a documented
alternative for a future sub-department. Nothing uses it today.

### 4.4 C4 — Hierarchy override

Classic **differential roll-up**: each person earns their own rate on their own
volume; each upline earns the difference between their rate and the highest rate
already paid below them.

```
paid = rate(D)
for A in ancestors(D), nearest first:
    diff = max(0, rate(A) - paid)
    if diff > 0: credit A with  diff × PR(D)
    paid = max(paid, rate(A))
```

Worked example — a full chain, downline sells RM10,000:

| Person | Rate | Earns | Why |
|---|---|---:|---|
| Revenue Specialist | 5% | 500 | own |
| Team Assistant | 7% | 200 | 7 − 5 |
| Team Leader | 9% | 200 | 9 − 7 |
| Senior Team Leader | 10% | 100 | 10 − 9 |
| | | **1,000** | never more than the top rate (10%) |

Two rates that are equal compress to zero automatically, which is exactly the
brief's *"reaching 6% lets you override the 5%s"*. Override base is `PR(D)`
(KPI excluded; `override_includes_kpi` defaults false).

### 4.5 Total

```
commission_amount(S, P) = C1 + C2 + C3 + C4
```

Rounding: every statement **line** is rounded to 2dp and every subtotal is the
sum of its rounded lines, so `Σ lines === total` holds exactly. `comm_statements`
carries a CHECK that makes a component/total drift impossible to store.

---

## 5. What the ERP export actually looks like

Confirmed against `July SO.xlsx` (2026-08-31). The parser
(`src/lib/import/erp-sales-order.ts`) reproduces every figure below.

| | |
|---|---|
| Rows / orders / agents | 3,261 lines → **691 orders** → **40 agents** |
| Date range | **2026-07-01 → 2026-08-15** (473 July orders + 218 August) |
| July / August value | RM2,861,361.30 / RM1,243,027.00 |
| Cancelled | 1 (`ZZTEST-0001`, `Cancelled = 'T'`) |
| Branches | KL 2,470 · PG 677 · SRW 102 · SBH 12 lines |

**One row per order line; the order header repeats on every line.** Grouping is
by `Doc. No.`.

Five things that shaped the design:

1. **`Total` and `Tax` appear TWICE** — once in the order-header block and once
   in the line block. A naive header-name map resolves `Total` to the *line*
   total and every package order looks discounted. Columns are therefore
   resolved *relative to `Item Group`*, which separates the two blocks. With
   that fixed, header `Total` = `SubTotal (Ex)` = Σ line `Total (Ex)` for **all
   691 orders**, tax is always 0 and `Discount` is never used.
2. **Package pricing.** 607 of 691 orders put the whole order value on ONE line
   (usually the mattress); the bundled bedframe/pillows/protectors are qty > 0
   at RM0. Per-line amounts are *not* a per-product revenue split — only sums
   across an order are meaningful. ACC has 1,523 lines / 3,042 units but only
   **13 lines carry money** (RM4,683 in the whole file).
3. **The agent is a free-text name with no code, and the names are dirty** —
   trailing spaces (`"MELVIN CHONG "`, `"ETHAN SOO "`), mixed case (`Peifen`,
   `Zack`, `Lim Yau Wei`, `Hwasheng`), plus non-people (`OTHERS`,
   `Test Sales Director`, `HOUZS CENTURY`, `GRACE`). Hence `comm_agent_aliases`
   (many spellings → one person), not a code column. **Of the 40 agents, exactly
   one (`SIA JONAS`) already exists in the staff master — and in Marketing, not
   Revenue.**
4. **No time of day** — every `Date` cell is midnight, so the order in which
   bills were written can only come from the running `Doc. No.` (SO-012578 …
   SO-013266; sorting 688 orders by number gives just 2 date inversions). The
   importer uses it to *suggest* Open Bill ranks. In July, 300 of 473 orders
   were their agent's 2nd bill or later that day — picking all of them by hand
   would be unreasonable.
5. **The export is a date RANGE, not a month.** A "July" file carrying six
   weeks of orders would pay August work inside the July run, so
   `selectPeriod()` filters to the calendar month and reports what it dropped.

`BALANCE` / `PAYEMENT` are also captured: 324 orders fully paid, 360 part-paid,
6 unpaid. Nothing reads them today — see Q3.

---

## 6. Data model

New tables. `sales_*` = imported facts, `comm_*` = config + results. The dormant
`commission_rules` / `commission_inputs` from migration 123 are marked
**DEPRECATED** — never wired to any UI, and too weak for this.

| Table | Holds |
|---|---|
| `comm_sub_departments` | Fair, and whatever comes next |
| `comm_schemes` | knobs + the four component switches + `cloned_from_scheme_id` |
| `comm_ranks` | tier, rank, rate, `can_recruit`, promotion threshold |
| `comm_item_groups` | ERP group → commissionable? |
| `comm_kpi_items` / `comm_kpi_thresholds` | KPI products and the qty ladder |
| `comm_open_bill_rules` | 50 / 40 / 30% |
| `comm_hierarchy` | effective-dated upline + rank; one position per person |
| `comm_agent_aliases` | ERP agent name → `hr_staff_costs` |
| `sales_import_batches` | one per file; one `committed` batch per period |
| `sales_orders` / `sales_order_lines` | the raw facts, plus `raw` JSONB |
| `sales_order_open_bill_tags` | the picks, with `auto_suggested` |
| `comm_runs` | one per sub-department per month |
| `comm_statements` / `comm_statement_lines` | results + the audit trail |

Changes to existing tables: `departments.payroll_source`
(`imported` \| `commission`). Nothing else.

**Revenue staff need no schema change to be paid pure commission**:
`hr_staff_costs.basic_salary` already allows 0 (migration 141; HV020 is the
precedent), `hr_employment_type` already has `commission_eligible`
(migration 120), and `compute_hr_monthly_payroll` bases EPF/SOCSO/EIS on
`prorated basic + statutory allowance` — with both at 0 every statutory lookup
returns 0 on its own, with zero risk to departments that *do* carry a basic.

> ⚠️ **PCB still applies.** The trigger computes PCB on gross, which for these
> staff is the entire commission, so `net = commission − PCB`. Left as-is on
> purpose — commission is taxable income — but confirm (Q2).

**Cycle safety, twice.** `comm_hierarchy` has a `BEFORE` trigger that walks the
chain and rejects a cycle (depth cap 20); the engine independently carries a
visited set and depth cap. Dragging a manager under their own downline in the
org chart is exactly how one gets created, and a cycle here would be a silent
money bug rather than a crash.

**RLS:** `principal` ALL, `hr` ALL, `finance` **DENY**, `dept_manager` DENY.
These tables *are* individual salary detail, and CLAUDE.md's standing rule is
that Finance never sees per-employee pay.

---

## 7. Engine placement — hybrid, per the Director Salary precedent

Math in **TypeScript** (`src/lib/commission/`), atomic write via one RPC
(`apply_commission_run`). Same choice the user made for the salary engine.

```
src/lib/commission/
  types.ts        — inputs/outputs, no Supabase types
  engine.ts       — classification, C1–C4, assembly; every helper exported
  engine.test.ts  — 34 worked examples incl. both of the brief's Open Bill cases
src/lib/import/
  erp-sales-order.ts       — the parser (column resolution, dates, agents, sequencing)
  erp-sales-order.test.ts  — 25 tests on a golden grid mirroring the real export
```

Status: **built and green** — 614 tests pass across the suite (was 555).

---

## 8. UI

Following `DESIGN.md` v3.0 (`.page-head`, `.ledger-table`, `.num`, `.sect-head`).

| Route | Purpose |
|---|---|
| `/hr-costing/commission` | period landing — months with sales data, run status per sub-department |
| `…/[period]` | run dashboard: hero total, per-salesperson `.ledger-table` (PR / C1 / KPI / Open Bill / Override / Total), Compute + Apply |
| `…/[period]/[staffId]` | one salesperson's statement — four components, each expandable to its `comm_statement_lines` |
| `…/[period]/import` | ERP import wizard: parse → period + cancelled report → **agent matching** → commit |
| `…/[period]/open-bills` | day-by-day board, pre-filled from `sequence_in_day`, reviewed by a human |
| `/hr-costing/commission/org-chart` | the org chart (below) |
| Settings → **Commission** tab | sub-departments (+ Generate New), scheme switches, rank ladder, item groups, KPI items, thresholds, Open Bill rates |

**Org chart.** A tree diagram with n8n-style connector lines where a salesperson
can be **dragged onto another team member** to re-parent them. Recommended
library: **`@xyflow/react`** — n8n's own canvas is Vue Flow, the sibling port of
the same project, so this is the closest match to the reference. Every drop
writes a new effective-dated `comm_hierarchy` row rather than mutating the old
one, so past runs never move; the cycle trigger rejects an illegal drop, and a
drop under a `can_recruit = false` rank is refused in the UI.

**Payroll grid change** (`PayrollRow.tsx`): for staff in a
`payroll_source = 'commission'` department the Commission cell becomes
**read-only** with a `from commission run` badge linking to the statement, so a
hand-edit can't silently diverge from the audit trail.

---

## 9. Build order

| # | Step | State |
|---|---|---|
| 1 | Migration: 16 tables + RLS + `payroll_source` + the Fair seed | ✅ written, dry-run verified, **not applied** |
| 2 | Pure TS engine + tests | ✅ 34 tests |
| 3 | ERP parser + tests | ✅ 25 tests, verified against the real file |
| 4 | **Create the ~39 salespeople** in the Revenue Department | ⛔ blocked — needs the staff list (§10 Q4) |
| 5 | Settings → Commission tab (sub-dept, ranks, item groups, KPI items, thresholds, Open Bill) | ready to build |
| 6 | Org chart (`@xyflow/react`, drag-to-reparent) | ready to build |
| 7 | Import wizard + agent matching | ready to build |
| 8 | Open Bill board | after 7 |
| 9 | `compute_commission_run` + `apply_commission_run` RPCs + run dashboard + statement page | after 5–8 |
| 10 | Payroll writeback + read-only cell | after 9 |
| 11 | Revenue Dept P&L / pool 1090 wiring | separate scope |

Steps 5–8 need no further answers and can proceed now.

---

## 10. Open questions

| # | Question | Why it matters |
|---|---|---|
| **Q1** | The Revenue Specialist's **300k** promotion — 300k of *personal* sales, *group* sales, or recruitment? And over what window (cumulative? rolling 12 months?) Same for the Team Assistant 7%→8% target. | `promotion_basis` is deliberately NULL and promotion is manual until answered |
| **Q2** | **PCB** on a pure-commission salesperson — deduct as the trigger does today, or not? | the only deduction left on their payslip |
| **Q3** | Commission on the **order** or on **collection**? 360 of 691 July/August orders were only part-paid. The brief says the period is the calendar month but not which date drives it; the engine currently uses the SO date. | pays commission on money not yet received |
| **Q4** | The **staff list** for the ~39 salespeople — names, NRIC, bank accounts, hire dates, and which sub-department each belongs to. | nothing can run until they exist in `hr_staff_costs` |
| **Q5** | The **KPI product list**: which of the 26 ACC item codes, at what amount? Sizing check — RM50 on the five commonest pillow codes would have paid **≈ RM63,000** of KPI in July against ≈ RM141,000 of product commission at a flat 5%. Worth confirming that scale is intended. | drives `comm_kpi_items` |
| **Q6** | Should the Revenue Dept manager (`dept_manager` role) see their team's commission? | RLS scope; DENY for now |

---

## 11. Non-goals (v1)

- No clawback / cancelled-order reversal across periods (an order cancelled in a
  later month does not retro-adjust a locked run) — needs its own rule.
- No auto-promotion between ranks (see Q1).
- No target / quota tracking or leaderboards.
- No commission accrual JV separate from the existing payroll accrual.
- The Revenue Department's own P&L, billing mode and pool 1090 flows are out of
  scope (step 11).
