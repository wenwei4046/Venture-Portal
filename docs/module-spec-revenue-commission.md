# Module Spec — Revenue Department Commission Payroll

Status: **DRAFT — awaiting user brief on the Tier/rank ladder + a sample ERP export.**
Owner: Principal + HR. Author: 2026-08-31 session.
Related: `module-spec-phase3.md` (HR Costing), `db-schema.md`, `DESIGN.md`.

---

## 1. Problem

Today every payroll row is *imported already-computed* from InfoTech
(`hr_monthly_payroll`, source = `imported`, verbatim per the 2026-06-05 rule).

The **Revenue Department** (dept `186bd9e0…`, segment `revenue_department`,
pool GL `1090`, provisioned 2026-08-24) does not work that way. Its staff are
salespeople. Their pay is *derived* from an ERP **sales order** export:
per-order, per-product, per-quantity. The portal must compute their commission
from that raw data, not receive a finished number.

So payroll gains a second **source type**:

| Type | Source of truth | Departments |
|---|---|---|
| `imported` | InfoTech payroll export (verbatim) | HR, Finance, Marketing, IT, Director Office |
| `commission` | ERP sales export → commission engine | Revenue Department |

---

## 2. Core architectural decision — do NOT fork payroll

The commission engine is an **upstream feeder**, not a parallel payroll.

```
ERP order export (xlsx/csv)
        │  import (preview → commit)
        ▼
  sales_orders + sales_order_lines          ← raw facts, immutable per batch
        │
        │  + comm_ranks / comm_kpi_items / comm_kpi_thresholds
        │  + comm_bill_bonus_rules / comm_hierarchy   ← config (Settings)
        │  + sales_order_bill_tags                    ← manual 1st/2nd/3rd Bill picks
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
vouchers, GL segments and the whole approval chain already work and are audited.
Forking them for one department would double the surface area of every future
fix. The only thing genuinely new is *how `commission_amount` is arrived at*.

**Consequence:** the commission engine owes the payroll exactly one number per
salesperson per month, plus a drill-down page that justifies it.

---

## 3. The four commission components

All four are computed for one salesperson `S` in one period `P` (a month).

### 3.0 Line classification

Every `sales_order_lines` row is classified at **compute time** (not import
time, so re-configuring KPI items re-computes cleanly):

- **KPI line** — its `product_code` matches an active `comm_kpi_items` row for `P`.
- **Revenue line** — everything else.

> `PR(S)` = **product revenue** = Σ `line_amount` over S's *revenue* lines.
> KPI-item revenue is deliberately **excluded** — the item already earns a KPI
> allowance, so counting it twice would double-pay (user rule: *"这个 pillow 卖
> 250 块的 revenue 是不算进 product revenue 里面的"*).

### 3.1 Component 1 — Product Revenue Commission

```
C1 = PR(S) × rate(S)
```

`rate(S)` = the personal commission percentage of S's **rank** in period `P`
(Tier 1 = x%, Tier 2 = y%, …). Ranks live in `comm_ranks`; a person's rank for
a period comes from `comm_hierarchy` (effective-dated), and is **snapshotted**
into `comm_statements` when the run is computed.

### 3.2 Component 2 — KPI Item Commission

```
KPIqty  = Σ qty                       over KPI lines
KPIbase = Σ (qty × kpi_unit_amount)   over KPI lines     e.g. pillow → RM30/unit
bonus%  = highest comm_kpi_thresholds row whose min_qty ≤ KPIqty  (else 0)
C2      = KPIbase × (1 + bonus%)
```

Ladder example: `[{min_qty: 10, bonus_pct: 0.20}]` → 10+ KPI items sold uplifts
the whole KPI amount by 20%. Modelled as a ladder (not a single threshold) so
`[{10, 20%}, {25, 35%}]` works without a schema change.

### 3.3 Component 3 — Additional Order Bonus (1st / 2nd / 3rd Bill)

Rewards fast consecutive closing during a 3-day event. HR/Principal **manually
tags** which of a salesperson's orders is that **day's** 1st, 2nd or 3rd bill.

```
for each tagged order O of S with bill_rank r:
    OPR(O) = Σ line_amount over O's revenue lines
    C3 += OPR(O) × bill_pct(r)          [basis = 'pct_of_revenue']
       or OPR(O) × rate(S) × bill_pct(r) [basis = 'uplift_on_commission']
```

`bill_pct`: rank 1 = 50%, rank 2 = 40%, rank 3 = 30% (`comm_bill_bonus_rules`,
effective-dated).

> ⚠️ **OPEN QUESTION Q1 — the basis.** The brief says the bonus is *"based on
> product revenue, not the existing commission rate"*, which literally means
> **50% of the order's revenue** — i.e. an RM10,000 first bill pays RM5,000
> bonus. That is 7–10× the normal commission and is almost certainly not the
> intent. The likely intent is a **50% uplift on that order's commission**
> (RM10,000 × 7% × 50% = RM350). The schema therefore carries a scheme-level
> `bill_bonus_basis` toggle and **defaults to `uplift_on_commission`** until
> confirmed. See §8.

Tagging constraints:
- one tag per order (an order can't be both 1st and 2nd bill);
- unique `(staff_id, event_date, bill_rank)` — one 1st Bill per person per day;
- tagged orders **still earn** their normal C1 (the bonus is additive) — **Q2**.

### 3.4 Component 4 — Hierarchy Override (upline / downline)

Classic **differential roll-up**. Each person earns their own rate on their own
volume; each upline earns the *difference* between their rate and the highest
rate already paid below them, on the downline's volume.

Algorithm (per downline `D`, walking up the chain):

```
paid = rate(D)
for A in ancestors(D), nearest first:
    diff = max(0, rate(A) - paid)
    if diff > 0: credit A with  diff × PR(D)
    paid = max(paid, rate(A))
```

Worked example — the user's case, extended to 3 levels:

| Person | Rate | Own PR | Earns |
|---|---|---|---|
| Me | 7% | 0 | override on Alvin: (7%−5%) × PR(Alvin) = **2% × PR(Alvin)** |
| Alvin | 5% | 20,000 | own 5% × 20,000 = 1,000; override on Ben: (5%−3%) × PR(Ben) |
| Ben | 3% | 10,000 | own 3% × 10,000 = 300 |

Ben's 10,000 pays out: Ben 3% + Alvin 2% + Me 2% = 7% total — never more than
the top rate. Equal rates compress to zero automatically. No infinite loop:
`comm_hierarchy` enforces acyclicity (§4.7).

Override base = `PR(D)` (KPI lines excluded, same as C1). Scheme flag
`override_includes_kpi` defaults `false`.

### 3.5 Total

```
commission_amount(S, P) = C1 + C2 + C3 + C4          (rounded to 2dp once, at the end)
```

---

## 4. Data model

New tables. Prefix `sales_*` = imported facts, `comm_*` = config + results.
(The dormant `commission_rules` / `commission_inputs` from migration 123 are
**deprecated** — never wired to any UI, and too weak for this. They get a
`COMMENT ... DEPRECATED` and stay for history.)

### 4.1 `sales_import_batches`
One row per ERP file import. `period_month`, `file_name`, `file_hash`,
`row_count`, `order_count`, `imported_by`, `status` (`draft|committed|superseded`),
`notes`. Re-importing the same month supersedes the previous batch rather than
duplicating — the engine only reads the `committed` batch for that period.

### 4.2 `sales_orders`
`batch_id`, `period_month`, `order_no`, `order_date`, `event_date`
(defaults to `order_date`; the 3-day event may straddle a boundary),
`customer_name`, `erp_sales_code`, `staff_id` (matched, nullable → review
queue), `company_id` (nullable — which subsidiary the sale belongs to),
`order_total`, `raw` JSONB.
Unique `(batch_id, order_no)`.

### 4.3 `sales_order_lines`
`order_id`, `line_no`, `product_code`, `product_name`, `qty`, `unit_price`,
`line_amount`, `raw` JSONB. **No `is_kpi` column** — classification is derived
at compute time from `comm_kpi_items`.

### 4.4 `comm_schemes`
Named, versioned, effective-dated knob-holder: `bill_bonus_basis`
(`pct_of_revenue` | `uplift_on_commission`), `override_includes_kpi`,
`commission_is_statutory_wage` (see Q5), `rounding` (`per_component` | `total`).
One active scheme at a time; the run snapshots `scheme_id`.

### 4.5 `comm_ranks`
`scheme_id`, `rank_key` (`tier_1`…), `label`, `product_rate` DECIMAL(9,6),
`sort_order`. **Awaiting the user's Tier brief** — the ladder shape here is the
one piece of §3 that is not yet specified.

### 4.6 `comm_kpi_items` / `comm_kpi_thresholds`
- `comm_kpi_items`: `product_code`, `product_name`, `kpi_amount` per unit,
  `effective_from/to`, `is_active`. (Pillow → RM30.)
- `comm_kpi_thresholds`: `min_qty`, `bonus_pct`, `effective_from/to`. Ladder.

### 4.7 `comm_hierarchy`
The **payroll-purpose** org chart — deliberately separate from
`hr_staff_costs.department_id` and from any app-role hierarchy.

`staff_id`, `upline_staff_id` (nullable = top), `rank_id`, `effective_from`,
`effective_to`. One active row per staff at any date (exclusion constraint).
Cycle prevention: a `BEFORE INSERT/UPDATE` trigger walks the chain (depth cap
20) and rejects if `staff_id` reappears.

### 4.8 `sales_order_bill_tags`
`order_id` (unique), `staff_id`, `event_date`, `bill_rank` (1|2|3),
`tagged_by`, `tagged_at`. Unique `(staff_id, event_date, bill_rank)`.

### 4.9 `comm_bill_bonus_rules`
`scheme_id`, `bill_rank`, `pct`, `effective_from/to`.

### 4.10 `comm_runs`
`period_month` (unique among non-superseded), `scheme_id`, `batch_id`,
`status` (`draft|computed|applied|locked`), `computed_at/by`, `applied_at/by`,
`total_commission`, `staff_count`.
Lifecycle: `draft → computed` (engine ran) `→ applied` (written into
`hr_monthly_payroll`) `→ locked` (payroll run submitted; period-lock aware).
Recompute is allowed while every touched payroll row is still `draft`.

### 4.11 `comm_statements`
One per (run × staff). Snapshots: `rank_key`, `product_rate`, `upline_staff_id`.
Figures: `product_revenue`, `product_commission`, `kpi_qty`, `kpi_base`,
`kpi_threshold_pct`, `kpi_commission`, `bill_bonus`, `override_commission`,
`total_commission`.

### 4.12 `comm_statement_lines`
The audit trail — **the reason this module is trustable**. One row per
contributing fact:
`statement_id`, `component` (`product_revenue|kpi_item|kpi_threshold|bill_bonus|override`),
`source_order_id` / `source_line_id` / `source_staff_id` (the downline, for
overrides), `basis_amount`, `rate`, `qty`, `amount`, `note`.

Invariant enforced by the RPC: `Σ lines.amount = statement.total_commission`
per statement, and `Σ statements.total = run.total_commission`.

### 4.13 Schema changes to existing tables
- `departments.payroll_source` TEXT NOT NULL DEFAULT `'imported'`
  CHECK IN (`'imported'`,`'commission'`). Revenue Department → `'commission'`.
- `hr_staff_costs.erp_sales_code` TEXT — the ERP's salesperson code. Matching
  falls back to fuzzy name (same convention as the InfoTech import), and the
  import wizard writes the code back once a human confirms a match.

### 4.14 RLS
Mirrors `hr_monthly_payroll` exactly: `principal` ALL; `hr` full R/W while the
run is `draft|computed`; `finance` **DENY** on `comm_statements` /
`comm_statement_lines` / `sales_*` (they are per-individual salary detail —
CLAUDE.md: *Finance CANNOT see individual employee salaries*); `dept_manager`
DENY, with a later possible read-only own-department carve-out for the Revenue
Department manager (**Q6**).

---

## 5. Engine placement — hybrid, per the Director Salary precedent

Math in **TypeScript** (`src/lib/commission/engine.ts`, pure functions, no I/O),
atomic write via **one RPC** (`apply_commission_run`). Same choice the user made
for the salary engine (memory: *hybrid salary engine — TS math + SQL atomic
write*).

Rationale: this math is the gnarliest in the portal (four interacting
components, a tree walk, a threshold ladder, an exclusion rule). It must be
unit-testable against hand-worked examples without a database.

```
src/lib/commission/
  types.ts        — inputs/outputs, no Supabase types
  engine.ts       — classification, C1–C4, assembly. Every helper exported
                    so it can be tested on its own.
  engine.test.ts  — 30 worked examples incl. the user's Me/Alvin/Ben chain
```

Status: **built and green** (`npx vitest run src/lib/commission` → 30 passed).

The Server Action loads inputs → calls the pure engine → posts the whole result
as one JSONB payload to `apply_commission_run(p_period, p_payload)`, which
deletes and re-inserts statements + lines in one transaction and verifies the
sum invariant before committing.

---

## 6. UI

Following `DESIGN.md` v3.0 (`.page-head`, `.ledger-table`, `.num`, `.sect-head`).

| Route | Purpose |
|---|---|
| `/hr-costing/commission` | period landing — months with sales data, run status |
| `/hr-costing/commission/[period]` | run dashboard: hero total, per-salesperson `.ledger-table` (PR / C1 / KPI / Bill / Override / Total), Compute + Apply buttons |
| `/hr-costing/commission/[period]/[staffId]` | one salesperson's statement — the four components, each expandable to its `comm_statement_lines` |
| `/hr-costing/commission/[period]/import` | ERP import wizard (mirrors `ImportWizard.tsx`: parse client-side → preview → commit) |
| `/hr-costing/commission/[period]/bills` | day-by-day 1st/2nd/3rd Bill tagging board |
| `/hr-costing/commission/hierarchy` | the payroll org chart — drag/select upline, set rank |
| Settings → **Commission** tab | scheme knobs, rank ladder, KPI items, KPI thresholds, bill bonus rates |

Payroll grid change (`PayrollRow.tsx`): for staff in a `payroll_source =
'commission'` department, the Commission cell is **read-only** with a
`from commission run` badge linking to the statement. Prevents a hand-edit
silently diverging from the audit trail.

Sidebar: `HR Costing → Commission`, gated `principal + hr`.

---

## 7. Build order

Each step ends with build + E2E + commit, per the project's per-task rule.

| # | Step | Blocked by |
|---|---|---|
| 0 | This spec + user answers | Q1–Q7 |
| 1 | ✅ Migration written + dry-run verified (BEGIN/ROLLBACK on live schema) — **not yet applied** | Q3 fills rows, not shape |
| 2 | ✅ Pure TS engine + unit tests (worked examples) | Q1/Q2/Q4 are config toggles, not blockers |
| 3 | Settings → Commission tab (scheme, ranks, KPI items, thresholds, bill rates) | 1 |
| 4 | Hierarchy page + cycle guard | 1 |
| 5 | ERP import: parser + wizard + staff matching | **sample export file** |
| 6 | Bill tagging board | 5 |
| 7 | `compute_commission_run` + `apply_commission_run` RPCs + run dashboard + statement page | 2–6 |
| 8 | Payroll writeback + read-only cell + `payroll_source` wiring | 7 |
| 9 | Revenue Dept P&L / pool 1090 wiring (commission as dept cost) | 8, separate scope |

Steps 1–4 need no ERP file and can ship first.

---

## 8. Open questions

| # | Question | Why it matters | Default assumed |
|---|---|---|---|
| **Q1** | Additional Order bonus: 50% **of the order's product revenue**, or a 50% **uplift on that order's commission**? | 7–10× difference in payout | `uplift_on_commission` |
| **Q2** | Does a tagged 1st/2nd/3rd Bill order **also** earn normal product commission? | additive vs replacement | additive |
| **Q3** | The Tier/rank ladder — how many tiers, what rates, and what promotes someone? | drives `comm_ranks` + `comm_hierarchy` | *user to brief* |
| **Q4** | Override: unlimited levels with differential roll-up as in §3.4, or **one level only** (direct downline)? | changes C4 materially | unlimited roll-up |
| **Q5** | Malaysian statutory: commission **is** EPF/SOCSO-liable wages, but `compute_hr_monthly_payroll` excludes it from the statutory base. For Revenue staff commission is most of the pay → material under-contribution. Turn it on for this department? | compliance | flagged, **not changed** (would alter existing depts) |
| **Q6** | Should the Revenue Dept manager (`dept_manager` role) see their team's commission? | RLS scope | DENY for now |
| **Q7** | ERP name + a **sample export file** — one row per order line, or per order? Which columns? | step 5 cannot start without it | — |

---

## 9. Non-goals (v1)

- No clawback / cancelled-order reversal across periods (a cancelled order in a
  later month does not retro-adjust a locked run) — needs its own rule.
- No target/quota tracking or leaderboards.
- No commission accrual JV separate from the existing payroll accrual.
- The Revenue Department's own P&L, billing mode and pool 1090 flows are out of
  scope here (step 9, separate spec).
