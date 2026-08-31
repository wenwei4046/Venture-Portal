# Module Spec — Revenue Department Commission Payroll

Status: **DRAFT.** Rules briefed 2026-08-31 and implemented in the engine.
Blocking gaps: the ~39 salespeople do not exist in the staff master, and the
KPI product list has not been chosen (§11).
Owner: Principal + HR.
Related: `module-spec-phase3.md` (HR Costing), `db-schema.md`, `DESIGN.md`.

---

## 1. Problem

Today every payroll row is *imported already-computed* from InfoTech
(`hr_monthly_payroll`, source = `imported`, verbatim per the 2026-06-05 rule).

The **Revenue Department** (dept `186bd9e0…`, segment `revenue_department`,
pool GL `1090`, provisioned 2026-08-24) does not work that way. Its staff are
salespeople with **no basic salary and no statutory allowance** — 100% of their
pay is commission, *derived* from an ERP sales-order export, and taxed by
**Withholding Tax rather than PCB**.

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
        │  + comm_order_releases            ← which orders have been paid
        │
        │  apply_commission_run(period)     [atomic RPC]
        ▼
  hr_monthly_payroll.commission_amount     ← ONE field written
        │
        ▼
  existing trigger: pro-rata → EPF/SOCSO/EIS → tax → gross → net
        │
        ▼
  payroll_runs → funding request → PV → GL   (all untouched)
```

Statutory lookups, payroll runs, funding, accrual JVs, disbursement vouchers,
GL segments and the whole approval chain already work and are audited. The only
genuinely new thing is *how `commission_amount` is arrived at* — plus one
carefully-scoped tax branch (§5).

---

## 3. Org structure — department › sub-department › scheme

The Revenue Department is divided into **sub-departments**, and *each one
calculates differently* (user, 2026-08-31). **Fair** — the roadshow / event
team — is the first, and the components below are **Fair's** ruleset, not the
department's.

```
departments (Revenue Department)
  └── comm_sub_departments (Fair, …)
        └── comm_schemes                  ← knobs + per-component switches
              ├── comm_ranks              the tier ladder
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
| Revenue Specialist | **5%** → **6%** | 5% **may not recruit**. 6% unlocks recruiting and overriding the 5%s. |
| Team Assistant | **7%** → **8%** | 7% is reached at **300k of group sales** |
| Team Leader | **9%** | |
| Senior Team Leader | **10%** | |

> There is **no 7% Revenue Specialist** — 7% is where Team Assistant begins
> (corrected by the user 2026-08-31).

### 3.2 Group sales — what the threshold measures

**Group sales = the person's own commissionable revenue + their entire downline
subtree's**, for that month. The user's example:

| | Own | Group |
|---|---:|---:|
| Revenue Specialist | 200,000 | |
| ├─ downline A | 100,000 | |
| └─ downline B | 100,000 | |
| **group total** | | **400,000** → clears 300k → entitled to Team Assistant |

Only revenue that actually passed the deposit gate (§4.1) counts, so the
threshold measures money the company can really recognise.

### 3.3 Fixed vs Variable rate — per salesperson

Once someone reaches Team Assistant, their rate can be set two ways, and each
salesperson is ticked one or the other:

| Mode | Behaviour |
|---|---|
| **Fixed** | Once promoted from 6% to 7%, the rate **stays at 7%** even in a month whose group sales miss 300k. |
| **Variable** | Recomputed every month: clear 300k this month → 7%; miss it next month → back to 6%. |

Implementation: `comm_hierarchy.rank_id` is the **attained** rank — the whole
story in fixed mode, and the floor a variable person can never drop below.
`comm_ranks.group_sales_threshold` is what a variable person climbs to.
`comm_schemes.default_rate_mode` is the common standard; a person's own
`rate_mode` overrides it.

Either way the engine reports `qualifiesForRankKey`, so a **fixed** person who
has just cleared 300k surfaces as *due a promotion* rather than silently staying
put. Promotion itself stays a human action — one click that writes a new
effective-dated hierarchy row.

The effective rate is what everything else uses: product commission, the Open
Bill uplift, and the override differential.

---

## 4. The commission components (Fair)

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
> non-KPI, deposit-cleared* lines. July's commissionable base is
> **RM2,831,707.30** of RM2,861,361.30 booked — RM29,654.00 dropped.

### 4.1 The deposit gate

**An order pays no commission until the customer has deposited the configured
share of the order total.** At a 50% threshold, a 10,000 order needs 5,000 in
before any of it counts (user, 2026-08-31).

- The gate measures against the ERP **header total** — what the customer was
  actually invoiced — not the commissionable subset. A 10,000 + 500 transport
  order needs 5,250.
- It withholds the **whole** order: product commission, its KPI allowances and
  its Open Bill bonus all wait together.
- Nothing is lost. An order under the threshold in July simply pays in the month
  its deposit clears, tagged `carried from 2026-07` on the statement line.
- `comm_order_releases` (UNIQUE on `order_no`) is what makes that safe: an order
  can only ever be paid once, no matter how many times the file is re-imported.
- The run dashboard shows `deferredRevenue` per person and a list of shortfalls,
  so collections know exactly what to chase.

`comm_schemes.deposit_threshold_pct` is per sub-department; `NULL` disables it.

### 4.2 C1 — Product revenue commission

```
C1 = PR(S) × effectiveRate(S)
```

### 4.3 C2 — KPI items

```
KPIqty  = Σ qty                       over KPI lines
KPIbase = Σ (qty × kpi_unit_amount)   over KPI lines     e.g. pillow → RM50
bonus%  = highest comm_kpi_thresholds rung whose min_qty ≤ KPIqty  (else 0)
C2      = KPIbase × (1 + bonus%)
```

The brief's worked example: 10 × RM50 = RM500, +20% on top = **RM600**. ✅

KPI-item revenue is **excluded from `PR`** — the item already earns its
allowance, so counting it twice would double-pay. In practice most KPI items are
**bundled free** (see §6), which is precisely the case a flat allowance exists
to reward. Modelled as a ladder, not a single threshold, so a `Tier 2` can be
added later without a schema change.

### 4.4 C3 — Open Bill (1st / 2nd / 3rd bill of the event day)

Rewards writing consecutive bills during a 3-day event. HR/Principal picks which
of a salesperson's orders is that **day's** 1st, 2nd or 3rd bill.

```
for each tagged order O of S with rank r:
    OPR(O) = commissionable, non-KPI revenue of O
    C3 += OPR(O) × effectiveRate(S) × billPct(r)      billPct = 50% / 40% / 30%
```

Per the brief: *"10,000 at 7% — compute the 7% first, then add 50%"* → 700
commission + **350 bonus** = 1,050 on that order; at 5% it is 500 + 250. It
follows the person's **current** rate — so a variable-rate salesperson who
cleared 300k this month gets the bigger bonus too — and it is **additive**: the
tagged order still earns its normal C1.

### 4.5 C4 — Hierarchy override

Classic **differential roll-up**: each person earns their own rate on their own
volume; each upline earns the difference between their rate and the highest rate
already paid below them.

```
paid = effectiveRate(D)
for A in ancestors(D), nearest first:
    diff = max(0, effectiveRate(A) - paid)
    if diff > 0: credit A with  diff × PR(D)
    paid = max(paid, effectiveRate(A))
```

Worked example — a full chain, downline sells RM10,000:

| Person | Rate | Earns | Why |
|---|---|---:|---|
| Revenue Specialist | 5% | 500 | own |
| Team Assistant | 7% | 200 | 7 − 5 |
| Team Leader | 9% | 200 | 9 − 7 |
| Senior Team Leader | 10% | 100 | 10 − 9 |
| | | **1,000** | never more than the top rate (10%) |

Two equal rates compress to zero automatically, which is exactly the brief's
*"reaching 6% lets you override the 5%s"*.

### 4.6 Total

```
commission_amount(S, P) = C1 + C2 + C3 + C4
```

Rounding: every statement **line** is rounded to 2dp and every subtotal is the
sum of its rounded lines, so `Σ lines === total` holds exactly.
`comm_statements` carries a CHECK that makes a component/total drift impossible
to store.

---

## 5. Tax — Withholding instead of PCB

Revenue salespeople have **no PCB**. They pay **Withholding Tax at 2% of total
salary**, and it is a per-person tick — some are withheld, some are not (user,
2026-08-31).

This is the one place the commission work touches shared payroll machinery, so
it lives in its own migration (`20260831020000_withholding_tax.sql`) and is
deliberately conservative:

- `hr_staff_costs.tax_mode` ∈ (`pcb`, `withholding`, `none`), **defaulting to
  `pcb`** — every existing employee is untouched.
- `hr_staff_costs.withholding_rate` defaults to `0.02`, editable per person.
- `hr_monthly_payroll.withholding_tax` defaults to 0, so the net formula is
  arithmetically identical for everyone still on PCB.
- Gross, the statutory wage base and the run's CTC total are **unchanged**.
  Withholding Tax is an employee-side deduction exactly like PCB, so payroll
  funding and the GL posting are untouched.

**Verified**: the migration was dry-run against the live schema and the
recompute fingerprint over all 38 existing payroll rows is byte-identical
before and after (`a3a28e0c…`), with total withholding of 0. A staff flipped to
`withholding` produced gross 1,000 → PCB 0 → WHT 20 → net 980.

Revenue staff also need **no schema change to be paid pure commission**:
`hr_staff_costs.basic_salary` already allows 0 (migration 141; HV020 is the
precedent), `hr_employment_type` already has `commission_eligible`
(migration 120), and the statutory base is `prorated basic + statutory
allowance` — with both at 0, every statutory lookup returns 0 by itself.

> ⚠️ **Remittance is not built.** PCB is filed to LHDN through the statutory
> export; WHT goes to LHDN on a different form. The statutory route needs a WHT
> section before the first Revenue payroll is actually paid out (§11 Q4).

---

## 6. What the ERP export actually looks like

Confirmed against `July SO.xlsx` (2026-08-31). The parser
(`src/lib/import/erp-sales-order.ts`) reproduces every figure below.

| | |
|---|---|
| Rows / orders / agents | 3,261 lines → **691 orders** → **40 agents** |
| Date range | **2026-07-01 → 2026-08-15** (473 July orders + 218 August) |
| July / August value | RM2,861,361.30 / RM1,243,027.00 |
| Cancelled | 1 (`ZZTEST-0001`, `Cancelled = 'T'`) |
| Branches | KL 2,470 · PG 677 · SRW 102 · SBH 12 lines |
| Collection state | 324 orders fully paid · 360 part-paid · 6 unpaid |

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

`BALANCE` feeds `sales_orders.paid_amount` (a generated column,
`order_total − balance`), which is what the deposit gate measures.

---

## 7. Data model

New tables. `sales_*` = imported facts, `comm_*` = config + results. The dormant
`commission_rules` / `commission_inputs` from migration 123 are marked
**DEPRECATED** — never wired to any UI, and too weak for this.

| Table | Holds |
|---|---|
| `comm_sub_departments` | Fair, and whatever comes next |
| `comm_schemes` | knobs, component switches, deposit threshold, default rate mode, `cloned_from_scheme_id` |
| `comm_ranks` | tier, rank, rate, `can_recruit`, `group_sales_threshold` |
| `comm_item_groups` | ERP group → commissionable? |
| `comm_kpi_items` / `comm_kpi_thresholds` | KPI products and the qty ladder |
| `comm_open_bill_rules` | 50 / 40 / 30% |
| `comm_hierarchy` | effective-dated upline + attained rank + `rate_mode`; one position per person |
| `comm_agent_aliases` | ERP agent name → `hr_staff_costs` |
| `sales_import_batches` | one per file; one `committed` batch per period |
| `sales_orders` / `sales_order_lines` | the raw facts, plus `raw` JSONB |
| `sales_order_open_bill_tags` | the picks, with `auto_suggested` |
| `comm_runs` | one per sub-department per month |
| `comm_statements` / `comm_statement_lines` | results + the audit trail |
| `comm_order_releases` | which orders have been paid — the deposit gate's safety net |

Changes to existing tables: `departments.payroll_source`,
`hr_staff_costs.tax_mode` + `withholding_rate`,
`hr_monthly_payroll.withholding_tax`.

**Cycle safety, twice.** `comm_hierarchy` has a `BEFORE` trigger that walks the
chain and rejects a cycle (depth cap 20); the engine independently carries a
visited set and depth cap, in both the override roll-up and the group-revenue
roll-up. Dragging a manager under their own downline in the org chart is exactly
how one gets created, and a cycle here would be a silent money bug rather than a
crash.

**RLS:** `principal` ALL, `hr` ALL, `finance` **DENY**, `dept_manager` DENY.
These tables *are* individual salary detail, and CLAUDE.md's standing rule is
that Finance never sees per-employee pay.

---

## 8. Engine placement — hybrid, per the Director Salary precedent

Math in **TypeScript** (`src/lib/commission/`), atomic write via one RPC
(`apply_commission_run`). Same choice the user made for the salary engine.

```
src/lib/commission/
  types.ts        — inputs/outputs, no Supabase types
  engine.ts       — five passes: deposit gate → group revenue → rate
                    resolution → C1/C2/C3 → C4. Every helper exported.
  engine.test.ts  — 55 worked examples incl. every figure the brief quotes
src/lib/import/
  erp-sales-order.ts       — the parser (column resolution, dates, agents, sequencing)
  erp-sales-order.test.ts  — 25 tests on a golden grid mirroring the real export
```

Status: **built and green** — 635 tests pass across the suite (was 555).

---

## 9. The consolidated Settings tab

One **Commission** tab holds every rule, threshold and per-person tick, laid out
as dense tables following `DESIGN.md` v3.0 (`.ledger-table`, `.num`,
`.sect-head`). A sub-department picker at the top scopes everything below it,
with **+ Generate New Sub-Department** beside it (clone an existing scheme, or
start blank).

**I. Scheme rules** — one row per switch, so the whole calculation is visible at a glance.

```
RULE                                    SETTING
Product revenue commission              [✓]
KPI item allowance                      [✓]
Open Bill bonus                         [✓]        basis  ( ) % of revenue  (•) uplift on commission
Hierarchy override                      [✓]        include KPI revenue in the base  [ ]
Deposit gate                            [✓]        threshold  [ 50 ] % of order total
Default rate mode                                  ( ) Fixed   (•) Variable
```

**II. Tier ladder** — `comm_ranks`.

```
TIER                 RANK     RATE    CAN RECRUIT   GROUP SALES TARGET
Revenue Specialist   5%       5.00%      [ ]              —
Revenue Specialist   6%       6.00%      [✓]              —
Team Assistant       7%       7.00%      [✓]        300,000.00
Team Assistant       8%       8.00%      [✓]              —
Team Leader          9%       9.00%      [✓]              —
Senior Team Leader   10%     10.00%      [✓]              —
```

**III. Item groups** — `comm_item_groups`, with last month's revenue beside each
row so the impact of a tick is obvious.

```
ITEM GROUP    COMMISSIONABLE    JULY REVENUE
MATTRESS           [✓]          2,326,517.00
SOFA               [✓]            436,455.00
BEDFRAME           [✓]             63,602.00
ACC                [✓]              3,133.30
DINING             [✓]              2,000.00
TRANS              [ ]             27,444.00
OTHER              [ ]              2,210.00
```

**IV. KPI items** — pick from the ERP's product codes; qty and value from last
month shown so the cost of a rate is visible before it is saved.

```
ITEM CODE                     NAME                    KPI AMOUNT   ACTIVE   JULY QTY
AK-CS AIRLOFT COMFY PIL       Cool Silk Airloft         50.00       [✓]        467
NTYR-CS LTX PIL + CSC         Latex Pillow + CSC        50.00       [✓]        368
AK- ESSENTIAL BOLSTER         Soft Bolster              30.00       [ ]        433
                                                        [ + add item code ]
```

**V. KPI threshold ladder** — `TIER · MIN QTY · BONUS %` (Tier 1 · 10 · 20%).

**VI. Open Bill rates** — `1st 50% · 2nd 40% · 3rd 30%`.

**VII. Salespeople** — the per-person tick table the whole tab exists for.

```
NAME            SUB-DEPT   UPLINE        ATTAINED RANK   RATE MODE        WITHHOLDING   WHT %
YUNY            Fair       —             Team Leader 9%  (•)Fix ( )Var       [✓]        2.00
TAN KAR JIUN    Fair       YUNY          Team Asst 7%    ( )Fix (•)Var       [✓]        2.00
LUCAS           Fair       YUNY          Rev Spec 6%     ( )Fix (•)Var       [ ]          —
SALLY           Fair       TAN KAR JIUN  Rev Spec 5%     ( )Fix (•)Var       [✓]        2.00
```

Rules the table enforces inline: an upline whose rank has `can_recruit = false`
cannot be chosen; changing a rank or upline writes a **new effective-dated
`comm_hierarchy` row** rather than mutating the old one, so past runs never
move; a person who qualifies for a higher rank than they hold shows a
`due promotion → Team Assistant 7%` chip with a one-click promote.

---

## 10. Other UI

| Route | Purpose |
|---|---|
| `/hr-costing/commission` | period landing — months with sales data, run status per sub-department |
| `…/[period]` | run dashboard: hero total, per-salesperson `.ledger-table` (PR / group / C1 / KPI / Open Bill / Override / Total), deferred-revenue tile, Compute + Apply |
| `…/[period]/[staffId]` | one salesperson's statement — components expandable to their `comm_statement_lines` |
| `…/[period]/import` | ERP import wizard: parse → period + cancelled report → **agent matching** → commit |
| `…/[period]/open-bills` | day-by-day board, pre-filled from `sequence_in_day`, reviewed by a human |
| `…/[period]/deferred` | orders waiting on a deposit top-up, with the shortfall |
| `/hr-costing/commission/org-chart` | the org chart (below) |
| Settings → **Commission** | §9 |

**Org chart.** A tree diagram with n8n-style connector lines where a salesperson
can be **dragged onto another team member** to re-parent them. Recommended
library: **`@xyflow/react`** — n8n's own canvas is Vue Flow, the sibling port of
the same project, so this is the closest match to the reference. Every drop
writes a new effective-dated `comm_hierarchy` row; the cycle trigger rejects an
illegal drop, and a drop under a `can_recruit = false` rank is refused in the UI.

**Payroll grid change** (`PayrollRow.tsx`): for staff in a
`payroll_source = 'commission'` department the Commission cell becomes
**read-only** with a `from commission run` badge linking to the statement, so a
hand-edit can't silently diverge from the audit trail.

---

## 11. Build order

| # | Step | State |
|---|---|---|
| 1 | Migration: 17 tables + RLS + `payroll_source` + the Fair seed | ✅ written, dry-run verified, **not applied** |
| 2 | Withholding Tax migration (tax_mode, WHT column, trigger branch) | ✅ written, regression-verified, **not applied** |
| 3 | Pure TS engine + tests | ✅ 55 tests |
| 4 | ERP parser + tests | ✅ 25 tests, verified against the real file |
| 5 | **Create the ~39 salespeople** in the Revenue Department | ⛔ blocked — needs the staff list (Q2) |
| 6 | Settings → Commission tab (§9) | ready to build |
| 7 | Org chart (`@xyflow/react`, drag-to-reparent) | ready to build |
| 8 | Import wizard + agent matching | ready to build |
| 9 | Open Bill board + deferred-orders page | after 8 |
| 10 | `compute_commission_run` + `apply_commission_run` RPCs + run dashboard + statement page | after 6–9 |
| 11 | Payroll writeback + read-only cell | after 10 |
| 12 | WHT remittance in the statutory export | before the first real payout |
| 13 | Revenue Dept P&L / pool 1090 wiring | separate scope |

Steps 6–9 need no further answers and can proceed now.

---

## 12. Open questions

| # | Question | Why it matters |
|---|---|---|
| **Q1** | The remaining **group-sales targets**: what promotes 5% → 6%, and what are the Team Assistant 7% → 8%, Team Leader and Senior Team Leader thresholds? Only `ta_7 = 300k` is known. | a `variable` salesperson can currently only climb to 7%; the higher rungs never trigger |
| **Q2** | The **staff list** for the ~39 salespeople — names, NRIC, bank accounts, hire dates, sub-department, upline, attained rank, fixed/variable, and who is withheld. | nothing can run until they exist in `hr_staff_costs` |
| **Q3** | The **KPI product list**: which of the 26 ACC item codes, at what amount? Sizing check — RM50 on the five commonest pillow codes would have paid **≈ RM63,000** of KPI in July against ≈ RM141,000 of product commission at a flat 5%. Worth confirming that scale is intended. | drives `comm_kpi_items` |
| **Q4** | **WHT remittance** — which LHDN form / schedule, so the statutory export can produce it. | legally required before the first payout |
| **Q5** | Is the deposit threshold really **50%**, and is it the same for every sub-department? | it is a per-scheme setting; 50% is seeded |
| **Q6** | Should the Revenue Dept manager (`dept_manager` role) see their team's commission? | RLS scope; DENY for now |

---

## 13. Non-goals (v1)

- No clawback / cancelled-order reversal across periods (an order cancelled
  after its commission was released does not retro-adjust a locked run) — needs
  its own rule.
- No automatic promotion between ranks; the portal flags eligibility and a human
  clicks.
- No target / quota tracking or leaderboards beyond the group-sales figure.
- No commission accrual JV separate from the existing payroll accrual.
- The Revenue Department's own P&L, billing mode and pool 1090 flows are out of
  scope (step 13).
