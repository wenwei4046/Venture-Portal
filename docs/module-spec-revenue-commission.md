# Module Spec — Revenue Department Commission Payroll

Status: **DRAFT.** Rules briefed 2026-08-31 and implemented in the engine.
Blocking gaps: the ~39 salespeople do not exist in the staff master, the KPI
product list has not been chosen, the brand↔Item-Code mapping is only known for
Akemi, and **the ERP export carries no cost, so the whole margin layer cannot
run yet** (§12).
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

| Mode | The user's words | Behaviour |
|---|---|---|
| **Fixed** | *"flexible — 我自己移去哪一个 title 就是哪一个 title"* | Whatever title a human moves them to is their title. Once promoted from 6% to 7%, the rate **stays at 7%** even in a month whose group sales miss 300k. |
| **Variable** | *"entitled 整个 target scheme"* | Recomputed every month from the scheme's targets: clear 300k this month → 7%; miss it next month → back to 6%. |

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

### 3.4 Promotion criteria — recorded, not enforced

> **Status: written down, nothing reads them.** The user's instruction
> (2026-08-31): *"这个本身先不需要 set goal，等之后 fixed 的时候我再重新写进去，
> 担心根据 restrictions 会有不同的算法。不过可以先写下来。"* They live in
> `comm_promotion_rules` with `is_enforced = FALSE`. The only gate the engine
> actually applies is `comm_ranks.group_sales_threshold`, which today carries
> the single 300k rung to Team Assistant.

Criteria sharing an `alternative_group` are **ANDed**; different groups are
**ORed**. That models the 7% → 8% rule exactly.

| From → To | Criteria |
|---|---|
| **5% → 6%** | Personal sales ≥ **100k for two consecutive months**. (At 5% you cannot hold a team, so it can only be personal.) |
| **6% → 7%** | **Group sales ≥ 300k.** ← the one live gate |
| **7% → 8%** | **Any one of:** (a) group sales ≥ 500k **and** 10 KPI items per head — a team of 5 needs 50 in total; (b) group sales ≥ 500k **and** margin at Tier 1; (c) group sales ≥ **700k** on its own, whatever the KPI and margin |
| **8% → 9%** | **All three, compulsory:** group sales ≥ 700k **and** margin Tier 1 **and** 10 KPI items per head |
| **9% → 10%** | Not yet specified — the user's "Tier 3" rules are still to come |

Two of these need machinery the engine does not have yet, which is another
reason not to enforce them today: `personal_sales … for 2 consecutive months`
needs history across runs, and `kpi_items_per_pax` needs a head-count of the
person's team.

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

### 4.6 Margin — the per-bill penalty and the monthly incentive

Margin thresholds follow the **brand** (user, 2026-08-31): Akemi, Zanotti,
Ergotex. What counts as a good margin differs — Akemi's incentive Tier 1 is
36% where Zanotti's is 33% — so each brand carries its own ladder in
`comm_margin_bands`. **A single sales order never crosses brands**, so brand is
an order-level fact; the engine warns if an imported bill's lines ever
disagree. Ergotex's ladder is deliberately empty for now and gets set in
Settings.

The user's worked ladder, for one brand:

| Band | Margin | Effect |
|---|---:|---|
| Incentive Tier 2 | 43% | a **further RM1,500** — RM2,500 in total |
| Incentive Tier 1 | 36% | **RM1,000** |
| Standard | 33% | reference label only |
| Low | 30% | reference label only |
| Below Tier 1 | 27% | that **bill's** commission **× 0.50** |
| Below Tier 2 | 25% | **× 0.25** |
| Below Tier 3 | 24% | **× 0** |

Read the incentive rungs as **"margin ≥ this"**, stacking up the ladder, and
the penalty rungs as **"margin ≤ this"**, most severe match winning. That
reproduces the brief's numbers exactly:

```
28% → no band matches                         → no penalty
27% → below tier 1                            → × 0.50
26% → below tier 1                            → × 0.50
25% → tier 1 and tier 2 match, tier 2 is worse → × 0.25
24% → all three match, tier 3 is worst         → × 0
38% → incentive tier 1                         → RM1,000
44% → tier 1 and tier 2                        → RM1,000 + RM1,500
```

**How margin is computed.** Goods only:

```
marginRevenue = Σ lineAmount   over lines in commissionable item groups
marginCost    = Σ costAmount   over the same lines
marginPct     = (marginRevenue − marginCost) / marginRevenue
```

Transport and disposal are excluded — they are pass-through service charges and
are not commissionable either. **Free bundled KPI items ARE included**: a
giveaway pillow has real cost and no revenue, which is exactly how giving them
away is supposed to hurt the margin.

**What the penalty scales.** The bill's own product commission, its Open Bill
bonus, **and every upline's override on it** (user decision 2026-08-31). It is
implemented as a *penalty-weighted revenue*: each bill contributes
`revenue × multiplier` to the base an upline overrides on, so a halved bill is
halved for everyone in the chain and the "never more than the top rate"
invariant survives.

| | 10,000 bill at 26% margin, × 0.5 |
|---|---:|
| Revenue Specialist 5% | 250 |
| Team Assistant 7% (override) | 100 |
| Team Leader 9% (override) | 100 |
| Senior Team Leader 10% (override) | 50 |
| **total** | **500** = 10% of 5,000 |

It does **not** scale the flat KPI allowance — that is paid for moving the item,
not for the margin — and it does not reduce **group sales**, which is a sales
figure used for promotion, not a commission figure.

### 4.6.1 The incentive is per brand, and every brand must clear the tier

*Per-bill* for the penalty, *monthly* for the incentive — and the monthly
figure is computed **brand by brand**. A salesperson is entitled to a tier only
when **every brand they sold that month** clears it (user, 2026-08-31):

> Three weekends selling one brand at Tier 2, and a fourth weekend selling
> another brand below Tier 2 → **the month is not a Tier 2 month.**

Formally, the entitled tiers are the **intersection** of what each brand's own
monthly margin clears, and the amounts stack across that intersection.

| Akemi (T1 36%, T2 43%) | Zanotti (T1 33%, T2 40%) | Entitled | Paid |
|---|---|---|---:|
| 45% → T1, T2 | 35% → T1 | T1 | **1,000** |
| 45% → T1, T2 | 41% → T1, T2 | T1, T2 | **2,500** |
| 45% → T1, T2 | 30% → nothing | — | **0** |

Anything that makes one brand unjudgeable — no cost data, no ladder configured
(Ergotex today), or sales carrying no brand at all — **blocks the whole
incentive and says why**, rather than quietly paying on the brands that happen
to be judgeable. `comm_statement_brand_margins` stores the per-brand breakdown
so the salesperson can see which brand capped them.

> ⛔ **This cannot run yet.** The ERP sales-order export has **no cost column**,
> so margin is unknowable from the data we have. The engine takes cost per line
> as an input, skips the penalty when it is missing, and raises a run warning
> naming how many orders were affected — deliberately loud, because silently
> paying full commission on a bad-margin bill is the failure mode to avoid. See
> §12 Q1.

### 4.7 Total

```
commission_amount(S, P) = C1 + C2 + C3 + C4 + margin incentive
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
| `comm_brands` | Akemi / Zanotti / Ergotex + the Item-Code prefixes that identify them |
| `comm_margin_bands` | each brand's margin ladder (incentive / reference / penalty) |
| `comm_promotion_rules` | the promotion criteria, recorded with `is_enforced = FALSE` |
| `comm_hierarchy` | effective-dated upline + attained rank + `rate_mode`; one position per person |
| `comm_agent_aliases` | ERP agent name → `hr_staff_costs` |
| `sales_import_batches` | one per file; one `committed` batch per period |
| `sales_orders` / `sales_order_lines` | the raw facts, plus `brand_code`, `cost_amount` and `raw` JSONB |
| `sales_order_open_bill_tags` | the picks, with `auto_suggested` |
| `comm_runs` | one per sub-department per month |
| `comm_statements` / `comm_statement_lines` | results + the audit trail |
| `comm_statement_brand_margins` | the per-brand margin behind one statement — which brand capped the incentive |
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
  engine.ts       — six passes: deposit gate → group revenue → rate
                    resolution → C1/C2/C3 (each bill scaled by its margin
                    penalty) → C4 → monthly margin incentive. Every helper
                    exported.
  engine.test.ts  — 88 worked examples incl. every figure the briefs quote
src/lib/import/
  erp-sales-order.ts       — the parser (column resolution, dates, agents, sequencing)
  erp-sales-order.test.ts  — 25 tests on a golden grid mirroring the real export
```

```
src/lib/commission/
  run-payload.ts       — the seam: Postgres rows -> EngineInput, EngineResult
                         -> the save_commission_run payload
  run-payload.test.ts  — 16 tests on the mapping itself
src/app/(portal)/hr-costing/commission/
  run-actions.ts       — computeRun / applyRun / reopenRun, plus the two
                         review-board edits (Open Bill rank, manual margin)
```

### 8.1 The write half — three RPCs

`save_commission_run` / `apply_commission_run` / `reopen_commission_run`
(migration `20260831040000`). All three are **SECURITY INVOKER** on purpose:
RLS is the outer wall — principal and hr only, and hr may only touch a *draft*
payroll row — and the explicit guards inside are the inner one. A SECURITY
DEFINER here would quietly hand HR the ability to rewrite a submitted month.

They do no arithmetic beyond checking that the numbers handed to them add up.
The invariants, none of which the client is trusted with:

1. Sum of a statement's lines = its `total_commission`. (The five components
   already tally to the total by CHECK; this covers the drill-down.)
2. Sum of the statements = the run's total.
3. An **applied or locked run is never overwritten in place** — recomputing it
   would leave money in payroll describing statements that no longer exist.
4. Payroll is written only for a month whose payroll run has not **settled**
   (submitted / approved / paid) and whose rows are all still draft. A
   *rejected* payroll run is dead and does not block — a period legitimately
   holds several `payroll_runs` rows.
5. An order is released exactly once, ever (`comm_order_releases.order_no` is
   UNIQUE), so an order carried forward by the deposit gate cannot pay twice.
6. **Reopening reverses everything the apply wrote**: `commission_amount` back
   to 0 and the releases deleted, so the orders return to the pool.

`apply_commission_run` also refuses while **any warning stands**. That is not a
nag: every warning the engine raises is a case where it knows the figure is
wrong — an unclassified item group whose revenue it silently dropped, a
salesperson with sales and no rank paid at 0%, a placement that should not
exist.

### 8.2 What the run remembers

`comm_runs` carries three JSONB snapshots — `released_orders`,
`deferred_orders`, `penalised_orders` (migration `20260831030000`). These could
all be recomputed from `sales_orders`, and the period page did exactly that
before the run existed. A run must not work that way: **re-importing a month
replaces every `sales_orders` row**, so a run that recomputed its own history
would silently disagree with the money already in payroll.

`hr_monthly_payroll.source` gains a fourth value, `commission`. The other three
all describe a human putting the number there; a Revenue row is *derived*, and
rewritten on every Apply, so a hand edit to one will not survive the next run.

### 8.3 Carry-forward

A run's input is not just its own month. It is every committed order up to and
including that month which no applied run has paid for yet — so an order the
deposit gate held in June arrives in July's run, at its **original**
`period_month`, and the statement line says "carried from 2026-06". Orders an
earlier run already paid are still passed to the engine, flagged: dropping them
at the query would work for commission but their revenue would vanish from
group sales, and group sales drive promotions.

Status: **built and green** — 710 tests pass across the suite (was 555), and the
three RPCs were proved on the live schema in a rolled-back transaction: both
tally guards refuse, warnings block the apply, an applied run refuses to be
recomputed, a rejected payroll run does not block while a submitted one does,
and apply then reopen leaves payroll exactly where it started (gross 10,000,
PCB 0, WHT 200, net 9,800, then back to 0).

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

**VII. Brands and margin bands** — a brand picker, then that brand's ladder.
Incentive rows carry an RM amount, penalty rows a multiplier; the two never mix
in one column, so the table reads as one continuous ladder.

```
BRAND: ( ) Akemi  (•) Zanotti  ( ) Ergotex        item code prefixes [ ZNT-, ZN- ]

BAND                   KIND        MARGIN    COMMISSION    MONTHLY INCENTIVE
Incentive Tier 2       incentive   >= 43%       full            +1,500.00
Incentive Tier 1       incentive   >= 36%       full            +1,000.00
Standard margin        reference   >= 33%       full                   —
Low margin             reference   >= 30%       full                   —
Below margin Tier 1    penalty     <= 27%       x 50%                  —
Below margin Tier 2    penalty     <= 25%       x 25%                  —
Below margin Tier 3    penalty     <= 24%       x 0                    —
                                                        [ + add band ]
```

**VIII. Promotion criteria** — read-only for now, with an `enforced` column that
is off everywhere. Rows in the same `ALT` group are ANDed; different groups are
alternatives.

```
FROM → TO      ALT   CRITERION              THRESHOLD        ENFORCED
5% → 6%         1    Personal sales         100,000 x 2 mth     [ ]
6% → 7%         1    Group sales            300,000             [✓]
7% → 8%         1    Group sales            500,000             [ ]
7% → 8%         1    KPI items per head     10                  [ ]
7% → 8%         2    Group sales            500,000             [ ]
7% → 8%         2    Margin band            Incentive Tier 1    [ ]
7% → 8%         3    Group sales            700,000             [ ]
8% → 9%         1    Group sales            700,000             [ ]
8% → 9%         1    Margin band            Incentive Tier 1    [ ]
8% → 9%         1    KPI items per head     10                  [ ]
```

**IX. Salespeople** — the per-person tick table the whole tab exists for.
"Manual" is the user's *flexible* (a human sets the title); "Scheme" is
*entitled to the target scheme* (the monthly targets set it).

```
NAME            SUB-DEPT   UPLINE        ATTAINED RANK   RATE MODE            WITHHOLDING   WHT %
YUNY            Fair       —             Team Leader 9%  (•)Manual ( )Scheme     [✓]        2.00
TAN KAR JIUN    Fair       YUNY          Team Asst 7%    ( )Manual (•)Scheme     [✓]        2.00
LUCAS           Fair       YUNY          Rev Spec 6%     ( )Manual (•)Scheme     [ ]          —
SALLY           Fair       TAN KAR JIUN  Rev Spec 5%     ( )Manual (•)Scheme     [✓]        2.00
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
| `…/[period]` | run dashboard: hero total, per-salesperson `.ledger-table` (PR / group / C1 / KPI / Open Bill / Override / Incentive / Total), warnings, penalised bills, orders waiting on a deposit, Compute + Apply + Reopen |
| `…/[period]/statement/[staffId]` | one salesperson's month ringgit by ringgit — the figures, margin brand by brand, and a section per component drilling into `comm_statement_lines` |
| `…/[period]/import` | ERP import wizard: parse → period + cancelled report → **agent matching** → commit |
| `…/[period]/open-bill` | day-by-day board, pre-filled from `sequence_in_day`, reviewed by a human. Defaults to the salesperson-days still on a suggestion |
| `/hr-costing/commission/org-chart` | the org chart (below) |
| Settings → **Commission** | §9 |

The deferred-orders list is a section on the run dashboard rather than a page
of its own: it is read once, alongside the total it is holding back.

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
| 1 | Migration: 22 tables + RLS + `payroll_source` + the Fair seed (ladder, item groups, Open Bill rates, brands, Akemi's margin ladder, promotion criteria) | ✅ **applied live** 2026-08-31 |
| 2 | Withholding Tax migration (tax_mode, WHT column, trigger branch) | ✅ **applied live**, regression-verified |
| 3 | Pure TS engine + tests | ✅ 91 tests |
| 4 | ERP parser + tests | ✅ 25 tests, verified against the real file |
| 5 | **Create the ~39 salespeople** in the Revenue Department | ⛔ blocked — needs the staff list (Q2) |
| 6 | Settings → Commission tab (§9) | ✅ built |
| 7 | Org chart (`@xyflow/react`, drag-to-reparent) | ✅ built |
| 8 | Import wizard + agent matching | ✅ built |
| 9 | Open Bill board | ✅ built |
| 10 | `save_` / `apply_` / `reopen_commission_run` RPCs + run dashboard + statement drill-down | ✅ built, **applied live** 2026-08-31 |
| 11 | Payroll read-only Commission cell for `payroll_source = 'commission'` staff | not started |
| 12 | Cost feed → margin penalty and incentive go live | ⛔ blocked — the SO export has no cost column (Q1) |
| 13 | WHT remittance in the statutory export | before the first real payout |
| 14 | Revenue Dept P&L / pool 1090 wiring | separate scope |

Steps 6–10 are done. What is left needs answers, not code: step 5 (the staff
list) is the practical blocker on running a real month, and steps 12–14 wait on
Q1, Q8 and a separate scope.

---

## 12. Open questions

| # | Question | Why it matters |
|---|---|---|
| **Q1** | **Where does cost come from?** The sales-order export has no cost column, so margin — and therefore the whole penalty/incentive layer — cannot be computed. Either a cost price per Item Code, or a second ERP export carrying cost or margin per line. | blocks the entire margin layer |
| **Q2** | The **staff list** for the ~39 salespeople — names, NRIC, bank accounts, hire dates, sub-department, upline, attained rank, manual/scheme rate mode, and who is withheld. | nothing can run until they exist in `hr_staff_costs` |
| **Q3** | **Brand mapping** for Zanotti and Ergotex. Akemi is seeded as `AK-` / `AKE` (those codes carry AKEMI product descriptions). The July export's other prefixes are `NTYR- JM- AERO- HOK- DSL- AMN- CH-` — which belong to which brand, and what happens to the ones that belong to none? | an order that resolves to no brand blocks that person's incentive |
| **Q4** | The **KPI product list**: which of the 26 ACC item codes, at what amount? Sizing check — RM50 on the five commonest pillow codes would have paid **≈ RM63,000** of KPI in July against ≈ RM141,000 of product commission at a flat 5%. | drives `comm_kpi_items` |
| **Q5** | The **Zanotti and Ergotex ladders** — only Zanotti's Tier 1 (33%) is known, and Ergotex has none. Until a brand has a ladder, selling it blocks that salesperson's incentive entirely. | seeded partially, by design |
| **Q6** | What promotes **5% → 6%** is recorded as *personal* sales (at 5% you cannot hold a team) — confirm that reading. | `comm_promotion_rules` |
| **Q8** | **WHT remittance** — which LHDN form / schedule, so the statutory export can produce it. | legally required before the first payout |
| **Q9** | Is the deposit threshold really **50%**, and is it the same for every sub-department? | it is a per-scheme setting; 50% is seeded |
| **Q10** | Should the Revenue Dept manager (`dept_manager` role) see their team's commission? | RLS scope; DENY for now |

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
