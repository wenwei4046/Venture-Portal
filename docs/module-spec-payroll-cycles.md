# Payroll cycles — three payrolls, three closing dates

**Status:** design, nothing built. Written 2026-09-16.
**Owner:** Principal. **Reads:** HR, Finance.
**Prerequisite for:** the monthly payroll report set (§8).

Every figure marked **MEASURED** was read off the live database on 2026-09-16
and is reproducible from the queries named beside it. Everything else is a
proposal.

---

## 1. The problem, in one sentence

The company runs **three payrolls with three different closing dates**, and the
portal treats *a month's payroll* as one atomic thing — so closing the first
one closes all of them.

This is not a theory. **MEASURED:** August 2026 was submitted on **4 September**.
Since then the August commission run cannot be computed at all — pressing
*Compute* on Revenue → Fair → August answers:

> Payroll for Aug 2026 has already been submitted. Reopen payroll before
> changing commission

August's Revenue commission has therefore never been calculated, and
`payroll_runs.revenue_opex_total` is **0.00 in every run ever created** (five
runs, June–August). The 15th-of-the-month Revenue close and the 7th-of-the-month
close for everyone else cannot both exist in today's model.

---

## 2. What the three payrolls actually are

**MEASURED** — staff counts and where each one's data lives today:

| Track | Departments | People | Data lives in | Source of figures | Closing |
|---|---|---:|---|---|---|
| **`imported`** | Marketing (13), HR (6), Finance (5), IT (2), Director Office (1) | 27 | `hr_monthly_payroll` (`source = 'imported'`) | InfoTech import | 7th |
| **`director`** | Director (4 board members, incl. the CEO) | 4 | `director_monthly_payroll` + `director_salary_submissions` | the Director Salary calculator | 7th |
| **`revenue`** | Revenue Department | 31 | `hr_monthly_payroll` (`source = 'commission'`) | the commission engine | 15th |

Two things follow from that table, and they decide the whole design:

1. **The `director` track is already separate.** It has its own tables and its
   own closing record; no board member has ever had an `hr_monthly_payroll`
   row. Nothing needs to be prised apart there — it only needs naming.
2. **The collision is `imported` ↔ `revenue` alone.** They share one table and
   one closing gate.

### The gate, exactly

`submit_payroll_to_principal(p_period)` does five things, all month-wide:

1. refuses if **any** row of that month is already `submitted` / `paid`;
2. refuses if **any** live `payroll_runs` row exists for the month;
3. refuses unless **every** Revenue `comm_runs` row for the month is
   `applied` / `locked`;
4. sets **every** `hr_monthly_payroll` row of the month to `submitted`;
5. writes **one** `payroll_runs` row (immediately `approved` — the name is
   historical, there is no Principal step) and **one**
   `payroll_payment_requests` row for the whole company.

`assert_commission_payroll_open(p_period)` then refuses every commission write
for that month, because a run exists.

So step 4 closes Revenue on the 7th, and step 3 would have demanded Revenue be
finished before the 7th anyway. Both halves of the conflict are in one function.

### What is already fine

The **payment layer is already scoped** and does not need rebuilding:

- `create_payroll_disbursement_vouchers(p_period, p_scope, p_payment_date, p_granularity, p_department_id, p_payroll_row_ids, p_component_selections)`
- `create_payroll_statutory_batch(p_period, p_schemes[], p_scope, p_granularity, p_department_id, p_payroll_row_ids, p_payment_date, …)`

Both already take a department, a hand-picked set of people and their own
payment date — that is the HR → Payment page. **Only the CLOSE is month-wide.**

---

## 3. The model: a cycle is (month × track)

> A **payroll cycle** is one month of one track. It owns its own rows, its own
> closing, its own funding request, its own vouchers and its own reports.
> Nothing about one cycle can block another.

### Which track a person belongs to

Track is a property of the **department**, not of the row — so HR can see it,
and moving a department between tracks is configuration rather than code:

```sql
ALTER TABLE departments
  ADD COLUMN payroll_track TEXT NOT NULL DEFAULT 'imported'
  CHECK (payroll_track IN ('imported', 'director', 'revenue'));

UPDATE departments SET payroll_track = 'revenue'  WHERE name = 'Revenue Department';
UPDATE departments SET payroll_track = 'director' WHERE name = 'Director';
```

`departments.payroll_source` already exists and says where the *figures* come
from (`imported` / `commission`). `payroll_track` says when the month
*closes*. They are different questions and today they are conflated — Director
Office is `payroll_source = 'imported'` and closes with the 7th batch, while
Director is also `imported` but closes through its own calculator.

**One deliberate exception:** a **revenue-share row belongs to the `revenue`
cycle whatever department the person sits in** (§5). The CEO is in Director and
is paid on both the 7th and the 15th.

### The closing record

`payroll_runs` becomes one row per cycle rather than one per month:

```sql
ALTER TABLE payroll_runs
  ADD COLUMN track TEXT NOT NULL DEFAULT 'imported'
  CHECK (track IN ('imported', 'director', 'revenue'));

-- a month may have three live runs, one per track, and no more
CREATE UNIQUE INDEX uq_payroll_run_period_track
  ON payroll_runs (period_month, track) WHERE status <> 'rejected';
```

The existing per-department total columns stay; each run fills only its own
track's columns and `total_amount` follows.

### The calendar

Configuration, not per-month state — the state is the run:

```sql
CREATE TABLE payroll_calendar (
  track        TEXT PRIMARY KEY,
  closing_day  SMALLINT NOT NULL,   -- 7 / 7 / 15
  pay_day      SMALLINT,            -- when net pay leaves the bank
  note         TEXT
);
```

This is what lets a page say *"Revenue · closes 15 Sep · 3 days left"* instead
of HR holding it in their head.

### What changes, function by function

| Function | Change |
|---|---|
| `submit_payroll_to_principal(period)` | → `(period, track)`. Every check, the status update, the totals and the funding request scope to that track's departments. Check 3 (Revenue commission applied) applies **only** to the `revenue` track. |
| `assert_commission_payroll_open(period)` | Look only at `payroll_runs` rows with `track = 'revenue'`. The 7th close then cannot lock commission out. |
| `reopen_payroll_run(run_id)` | Already per-run; confirm it only reopens its own track's rows. |
| `create_payroll_disbursement_vouchers` / `create_payroll_statutory_batch` | No change needed. Optionally accept `p_track` as a convenience filter. |
| `payroll_salary_coverage(period)` / `payroll_statutory_coverage(period)` | Add `track` to the breakdown so the Payment page can show coverage per cycle. |

Nothing above changes how a single person's pay is calculated. The arithmetic
(`compute_hr_monthly_payroll`, `lib/revenue-pay.ts`) is untouched.

---

## 4. The Revenue basic arrangement

The mechanism already exists and is already tested — what is missing is that
**nobody is configured to use it. MEASURED:** all 29 fully-commissioned Revenue
staff have `basic_salary = 0`; the only non-zero basics in the department are
KRIS (38,000) and a stray record literally named **`testing`** (5,000, no
employee code) that will land in payroll if it is not deleted.

Setting `hr_staff_costs.basic_salary` is the whole configuration. Worked
through with the user's own example — RM 10,000 commission, RM 4,000 basic,
EPF Part A / SOCSO first category / PCB KA1, no children (**MEASURED** against
the live schedules):

| | RM |
|---|---:|
| Gross commission | 10,000.00 |
| less employer EPF (13% of 4,000) | (520.00) |
| less employer SOCSO | (69.15) |
| less employer EIS | (7.90) |
| **Gross pay** | **9,402.95** |
| less employee EPF (11% of 4,000) | (440.00) |
| less employee SOCSO | (19.75) |
| less employee EIS | (7.90) |
| less PCB | (13.45) |
| **Net pay** | **8,921.85** |

Paid as two salary lines: **net basic 3,518.90** + **commission balance
5,402.95**. Cost to the company is exactly the 10,000 — the employer's share is
funded out of the commission, which is what "公司帮忙出，从 10,000 里扣" means
in ledger terms.

A fully-commissioned person has basic 0, so the statutory base is 0 and every
contribution with it; their net *is* their commission. Both shapes already
render correctly on Revenue → the month → **What this month pays**.

---

## 5. The CEO's revenue share (1%)

Nothing for this exists today. **Decided 2026-09-16: the basis is every
committed sales order dated in the month** — excluding only what the ERP has
cancelled, drafted or put on hold. Not deposit-gated, not margin-adjusted, not
net of the commissionable/non-commissionable split.

**MEASURED** on that definition:

| Month | Committed bills | Committed sales | 1% |
|---|---:|---:|---:|
| August 2026 | 317 | RM 1,995,705.00 | **RM 19,957.05** |
| September 2026 (to the 16th) | 199 | RM 1,194,402.60 | **RM 11,944.03** |

### How to model it

A rule, plus an amount computed when the revenue cycle closes:

```sql
CREATE TABLE comm_revenue_shares (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id        UUID NOT NULL REFERENCES hr_staff_costs(id),
  department_id   UUID NOT NULL REFERENCES departments(id),
  pct             NUMERIC(6,4) NOT NULL,      -- 0.0100
  basis           TEXT NOT NULL DEFAULT 'committed_sales',
  effective_from  DATE NOT NULL,
  effective_to    DATE,
  note            TEXT
);
```

The computed amount lands in that person's `hr_monthly_payroll` row for the
month as a `source = 'commission'` row, so it inherits the whole existing
payslip path: statutory, tax, net, the salary PV split, the pay board. It shows
on the board as its own line, *"Revenue share · 1% of committed sales"*.

**Why not put the CEO into the commission engine as the top of the tree:** a
title with `titles.is_department_head` is refused a rung, a rank and an override
by the database itself (SQLSTATE `23DIR`). The engine is built so a department
head earns nothing from the tree. A revenue share is a different thing and
deserves its own small rule.

**Why there is no conflict with the board salary:** `hr_monthly_payroll` is
unique on `(staff_id, period_month)`, but the CEO's board salary lives in
`director_monthly_payroll`. So the CEO holds one row in each table — board
salary closing on the 7th, revenue share closing on the 15th — and neither
overwrites the other.

**Open:** is the 1% subject to EPF / SOCSO / EIS? On today's model it is not,
because those are read off basic + statutory allowance and the CEO's is 0.
Confirm with the payroll agent before the first payment (§10).

---

## 6. The statutory filing timeline — the real constraint

EPF, SOCSO, EIS and PCB are each **one submission per employer per month, due
by the 15th of the following month**. Revenue closes **on the 15th**. The
complete statutory file for a month therefore cannot exist until the day it is
due — zero buffer, every month, for as long as that is the closing date.

This is a process decision, not a system limit: the portal can already produce
a statutory batch per department and per payment date. The three ways out:

1. **Move Revenue's close to the 10th–12th.** Simplest, safest, no compliance
   question. The commission month is complete at month end; the 15th appears to
   be habit rather than necessity.
2. **File each cycle separately** — the 7th batch on time, the Revenue batch on
   the 15th. Technically supported today. *Confirm with the agent that KWSP and
   PERKESO accept more than one submission for the same month.*
3. Estimate and amend. Not recommended.

Whichever is chosen, it belongs in `payroll_calendar` so the portal can warn
before the date rather than after.

---

## 7. What HR should see: one page per month

**The month, all three cycles** — the page HR opens on the 7th and the 15th:

| Cycle | Closing | Status | People | Gross | Employer cost | Net | Blocking |
|---|---|---|---:|---:|---:|---:|---|
| Imported | 7 Sep | Closed · funded | 27 | … | … | … | — |
| Director | 7 Sep | Closed | 4 | … | … | … | — |
| Revenue | 15 Sep | **Open · 3 days** | 31 | … | … | … | 29 warnings, 7 unmatched agents |

"Blocking" is the important column: it is what stops the cycle closing, read
from the same checks `submit` will run, shown *before* somebody presses the
button rather than as an error afterwards.

---

## 8. The report set

### Per cycle (month × track) — five

| # | Report | Fields | Today |
|---|---|---|---|
| 1 | **Pay register** | per person: basic, allowances, commission by component, gross, EPF/SOCSO/EIS (EE and ER), PCB or WHT, deductions, **net**; totals per department | ✅ Revenue (`/revenue/[sub]/[period]/pay`). ❌ imported, ❌ director |
| 2 | **Bank transfer file** | name, bank, account no, net amount, reference | ✅ `hr-costing/payroll/[period]/bank-transfer` — needs a track filter |
| 3 | **Statutory schedule** | per body (KWSP / SOCSO / EIS / LHDN): employee, NRIC, wage base, EE, ER, total | ✅ generator exists — needs the track dimension (§6) |
| 4 | **Funding request** | employer cost per department, the pool it draws on, the PVs raised | ✅ per month — needs to become per cycle |
| 5 | **Variance vs last month** | per person and per department: gross, net, statutory, Δ and Δ%, with new joiners and leavers flagged | ❌ **not built — build this one first** |

Report 5 is the one that earns its keep. Every payroll error found late is
found by someone noticing a number moved; a variance report finds them on the
7th instead of after payment.

### Cross-cycle — one

6. **The month, all three cycles** (§7) — status, closing date, totals,
   blockers, and a link into each cycle.

### Already built, and where they fit

The Revenue drill-downs shipped on 2026-09-16 (PR #121) sit *underneath*
report 1 for the revenue cycle: the month's bills, one bill's lines, the pay
board, and a payslip showing Open Bill bill by bill. They are the evidence
behind the register, which is what makes the register checkable.

---

## 9. Rollout order

**Phase A — unblock (the only urgent part).** `departments.payroll_track`,
`payroll_runs.track` + the unique index, `submit_payroll_to_principal(period,
track)`, `assert_commission_payroll_open` scoped to the revenue track. After
this the 7th and the 15th coexist, and **August 2026's Revenue commission can
finally be computed** without disturbing the August salaries already paid.

**Phase B — make the cycle visible.** `payroll_calendar`, the month overview
page (§7), the blocking list, track filters on the existing reports.

**Phase C — the CEO's revenue share.** `comm_revenue_shares`, the computation
at close, the line on the pay board.

**Phase D — the reports.** Variance first, then the imported and director pay
registers, then the statutory dimension.

Phase A is a migration and one function; B–D are additive.

---

## 10. Decisions still open

1. **Revenue's closing date** — keep the 15th and accept a same-day statutory
   filing, or move to the 10th–12th (§6). *Everything else waits on nothing;
   this one shapes the calendar.*
2. **Does KWSP / PERKESO accept two submissions in one month?** Ask the agent.
   If yes, option 2 in §6 is available.
3. **Is the CEO's 1% subject to EPF / SOCSO / EIS?** Today's model says no
   because the base is basic + allowance. Confirm before the first payment.
4. **Are full-commission salespeople subject to EPF?** The same question, for
   29 people. The schema carries both treatments — `tax_mode = 'pcb'` (employee)
   and `tax_mode = 'withholding'` at 2% (agent) — and all 29 are currently set
   to `pcb` with no statutory, which is the combination worth double-checking.
5. **Which salespeople take a basic, and how much** (§4). A data entry, not a
   build.
6. **The `testing` staff record in Revenue** (basic 5,000, no employee code) —
   delete before the first Revenue payroll.
