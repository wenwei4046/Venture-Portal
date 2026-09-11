# Module Spec — Revenue Department Commission Payroll

Status: **DRAFT.** Rules briefed 2026-08-31 and implemented in the engine.
Blocking gaps: the ~39 salespeople do not exist in the staff master, the KPI
product list has not been chosen, the brand↔Item-Code mapping is only known for
Akemi, and **the ERP export carries no cost, so the whole margin layer cannot
run yet** (§12).
Owner: Principal + HR.
Related: `module-spec-phase3.md` (HR Costing), `db-schema.md`, `DESIGN.md`.

Programme scope: the original percentage ladder, unlimited group/override
roll-up and one-rung progression below describe **Fair**. IR's confirmed
exceptions and current implementation boundary are in **§15**; do not
cross-apply the two programmes.

---

## Month-end payroll commission adjustments — 2026-09-11

After Revenue commission is confirmed and before payroll is submitted or paid,
HR or Principal can edit Gross Commission in payroll. The editor shows the
confirmed source, requested gross and signed adjustment, and requires a reason
such as a debit note or dropped sale. Saving uses a dedicated audited adjustment
action, not the ordinary payroll input update.

Gross Commission uses the same inline amount input and row Save button as other
payroll fields. Save opens the adjustment review window with that draft amount;
Cancel leaves the inline draft intact. Header Save also requires that review
before saving an adjusted row. When normal inputs such as Basic change together
with Gross Commission, the reviewed save commits both in one transaction.
A nonzero saved adjustment has a small dot within the existing cell; hover shows
the amount and reason, and clicking opens the paycheck detail. Zero adjustments
have no marker or second line, keeping the grid's existing row and column sizes.

`payroll gross commission = synced Revenue commission + payroll adjustment`.
For a source of RM13,000, entering RM14,000 records +RM1,000; entering RM12,000
records −RM1,000. The source statements, sales, commission rules and upstream
entitlements retain their calculated values. Payroll Balance, Net, CTC and
subsequent PV amounts use the adjusted gross. Basic and its saved statutory
deductions are preserved when only this adjustment changes.

The normal month-end source is already fixed. If Revenue is explicitly reopened
and synced again, the signed adjustment is retained once: a new source of
RM15,000 with +RM1,000 produces RM16,000. An editor opened against older source
or adjustment values must be refreshed before saving. Missing source values
must not be guessed as zero; otherwise a replacement amount could be counted
again on the next sync.

If reopening would temporarily make gross commission negative, payroll retains
its last valid snapshot until the source is synced again. The unconfirmed run
blocks adjustment and payroll submission throughout that transition. Adjustment
history also survives deletion of an orphan draft payroll row after a salesperson
is removed from a reopened calculation.

Revenue calculation pages and each employee's statement show the payroll
adjustment and reason separately from source results. These are staff/month
totals across all Revenue sub-departments, not another earning to add to every
individual sub-department statement. Resetting to the source records a zero
adjustment with a reason; audit history remains.

## Net basic, statutory and commission payments — 2026-09-11 clarification

This clarification replaces the earlier EPF-only split below for newly computed
Revenue payroll. Basic follows the ordinary payroll deduction process. Its
salary PV pays **net basic**. The gross commission funds net basic, employee
contributions/tax, employer contributions, and the remaining commission PV.

```text
actual basic       = basic salary × saved pro-rata ratio, rounded to cents
net basic          = actual basic − EPF EE − SOCSO EE − EIS EE − PCB
employer statutory = EPF ER + SOCSO ER + EIS ER
payroll gross      = gross commission − employer statutory + other earnings − deduction
payroll net        = payroll gross − employee statutory − PCB/WHT − SKBBK
commission balance = payroll net − net basic
```

PCB for this Revenue arrangement uses actual basic less employee EPF, with the
employee's existing category/children lookup. HR can override PCB; that amount
persists through recomputation until Reset to JADUAL. This is the user's payroll
configuration, not a general tax calculation for imported departments.

Example: gross commission RM10,000; basic RM5,000; employee EPF/SOCSO/EIS
RM584.65; PCB RM112.65; employer EPF/SOCSO/EIS RM746.55. Basic salary PV is
RM4,302.70 and commission salary PV is RM4,253.45. Institution PVs separately
pay RM697.30 employee contributions/tax and RM746.55 employer contributions.
All four allocations total RM10,000. Ordinary additional payroll adjustments
remain in the commission portion; negative components stay visible and prevent
submission/payment.

Account 1 retains the existing employee bank fields. Account 2 is optional and
requires a complete bank/account pair. Each basic or commission salary payment
selects its own receiving account. PVs retain the selected bank snapshot; later
profile edits never change an existing voucher. Component coverage prevents
duplicate basic or commission payments, and a payroll row is fully paid only
when all positive components are paid. Historical whole-net vouchers cover the
whole row. Voiding restores only the affected component's availability.

`payout_split_version = 2` identifies this model. Existing imported and finalized
payroll is not recalculated by deployment. Refreshing an open commission draft
adopts the model. The legacy amendment below documents the preceding release.

## Payroll integration — earlier 2026-09-11 amendment

This amendment supersedes the older Apply step and the basic-plus-commission
formula described below. Revenue's **Compute & sync payroll** saves a clean
calculation and synchronizes payroll in one transaction. No separate Revenue
submission is needed. Warnings leave a calculation unsynced; correct them and
recompute. Payroll's existing monthly Finance/funding workflow remains shared.

`commission_amount` is the sum of the person's gross commission across all
applied/locked sub-departments for the month. A new commission payroll row uses
the staff master's basic; subsequent syncs retain the month's edited basic.

```text
basic pay          = basic salary × saved pro-rata ratio (rounded to cents)
commission balance = gross commission − basic pay − EPF employer − EPF employee
gross pay          = gross commission − EPF employer + other earnings − deduction
net pay            = gross pay − employee statutory − tax − SKBBK
```

Basic is funded from commission; employee EPF is counted once. A full commission
person uses basic 0. Existing statutory/tax settings remain the lookup inputs;
SOCSO/EIS, withholding/PCB and other adjustments retain their existing treatment.
Negative commission balances remain visible and block Finance submission until
resolved. Payroll funding includes Revenue CTC; accruals use its registered GL
segment and record withholding in the LHDN payable account alongside PCB, with
a separate description.

Payroll adds a department selector and Basic pay / Commission balance payout
columns; the paycheck and payslip explain the split and link its source
statements. InfoTech import and copying last month never replace Revenue's
commission. Source-linked rows are managed in Commission Calculation; an
unlinked draft placeholder can be deleted from payroll. Reopening
one programme removes only its share and preserves the others; finalized,
funded, vouchered and closed periods cannot be changed by sync.

Migrations `20260913010000` (split/funding) and `20260913020000` (automatic sync)
do not rewrite historical payroll. `commission_balance = NULL` identifies the
legacy formula; recomputing a draft converts it. An old finalized row keeps its
original amounts and display. Deploy the migrations before the application.

Verification: `node tests/revenue-payroll-sql/validate-revenue-payroll-sync.mjs` and
`node tests/revenue-payroll-sql/validate-revenue-payroll.mjs` (isolated PostgreSQL/PGlite),
plus the Revenue payroll helper, accrual and payroll UI Vitest tests.

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
through 31 Aug (Fair: user, 2026-08-31; IR monthly qualification and recurring
group incentive: user, 2026-09-11, §15).

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
              ├── comm_rank_defs          the ranks: "Rank A · 9%" (the Rank tab)
              ├── comm_ranks              the title ladder: one rung per title, pointing at a rank
              ├── comm_item_groups        which ERP groups are commissionable
              ├── comm_kpi_items          product → flat KPI allowance
              ├── comm_kpi_thresholds     qty ladder → uplift
              ├── comm_open_bill_rules    1st/2nd/3rd bill of the day
              └── comm_hierarchy          who is under who, effective-dated
```

The Rules page gets a **Generate New Sub-Department** action. Creating one
either **clones** an existing sub-department's scheme (every rule row copied,
with `cloned_from_scheme_id` recorded) or starts **blank** for a bespoke ruleset.
Blank means blank (2026-09-10): the new scheme is written with every component
switch OFF and no deposit gate — `lib/commission/scheme-defaults.ts` — so
nothing pays until somebody switches a component on and writes its rules. (The
`comm_schemes` column defaults are all TRUE, for schemes inserted by scripts;
before this a blank sub-department opened on a Scheme rules tab with every box
ticked, as if Fair's had been copied.) Because each component can be switched
off at scheme level (`enable_product_revenue` / `enable_kpi` /
`enable_open_bill` / `enable_override` / `enable_margin_penalty` /
`enable_margin_incentive`), a sub-department that only pays a flat percentage
reuses the same engine instead of getting a bespoke one.

`comm_hierarchy` holds **one position per person per scheme**
(`one_position_per_scheme`, 2026-09-10): a person may be a member of several
sub-departments, each membership with its own title, upline and rank — Lucas
reports to Stanley in Fair and may lead Stanley in IR. The HOME sub-department
(the department's oldest) is **derived from `hr_staff_costs.reports_to` and the
company title by trigger** — one line: who somebody reports to is who earns the
override on their sales, the rank comes from the title (raised, never lowered),
and the app writes only the rank. Every other sub-department's memberships are
the app's own writes (§3.0, Team tab; `docs/db-schema.md` "One line" and
"Memberships").

**The Revenue Director (user, 2026-09-11)** stands above all of it. A title
may *head* its department (`titles.is_department_head`, set under People ›
Roles): it is on no ladder and holds no rank — "Revenue Director 本身不会进入
任何 Rank，也不会出现在该 Department 的 Title Ladder 里面" — and no override
climbs to it. Which director(s) a sub-department reports to is a fact of the
sub-department (`comm_sub_department_directors`, set on the Team tab's
**Reports to** section): Fair reports to Peter and Kris, IR to Peter, so the
whole department reports to a Revenue Director directly — every team leader
and every standalone member is drawn under the director(s) of the
sub-department they are on. That line is DERIVED, never written per person:
two directors do not fit in one `reports_to`, and a new team leader reports
to them the day their tree begins. In the database the commission line stops
below a head: reporting to one leaves `comm_hierarchy.upline_staff_id` null,
so the engine's tree ends at the leader (§4.5). Above the directors sits the
CEO — a later step.

### 3.0 Where it lives in the portal

**Moved 2026-09-01.** Commission was a page under **HR Costing**, beside
Payroll and Payment. The user's correction: *"它其实是 Revenue Department"* — it
is a department with its own teams, not one of HR's monthly chores. It now has
its own group under **Departments**, alongside Director:

```
II. DEPARTMENTS
  ▾ Director
      · Director Salary
      · Director Pool
  ▾ Revenue
      ▾ Fair                ← one entry per sub-department, read from the DB
          · Comm Cal        ← /revenue/fair
          · Staff Hierarchy
          · Rules
      · Product List        ← department-wide, Principal only
  · Claims
```

The group's children are **rows in `comm_sub_departments`**, not constants:
`(portal)/layout.tsx` reads them and hands them to the sidebar and the mobile
More sheet through `NavData` (see `nav-config.ts`). Creating a sub-department
therefore adds a sidebar entry, which is why `createSubDepartment` revalidates
the whole shell.

Each sub-department has **three views**, because each one calculates
differently and there is no meaningful department-level view of a calculation:

| View | Route | What it is |
|---|---|---|
| Comm Cal | `/revenue/<sub>` | the months, and this sub-department's run against each. Titled *Commission Calculation* on the page |
| Staff Hierarchy | `…/hierarchy` | a combined chart of active sibling sub-departments, and the route's **Team** table (`?tab=team`) where a rank is set (§10) |
| Rules | `…/rules` | every rule the engine reads — eight tabs, one section each (`?tab=`, §9) |

They are **children of the sub-department in the sidebar**, not a tab rail on
the page (user, 2026-09-01: "这个其实是进去 subtab 的选择,而不是在这个里面").
Choosing which view of Fair to open is navigation, so it lives where the rest
of the navigation lives; the page itself only ever renders the one view it is.
Fair's own row stays a link — one click still lands on the calculation — and
the chevron beside it folds the three away. The sidebar label is *Comm Cal*
because the full name does not fit the 220px rail three levels in.

The tabs *inside* Rules and Staff Hierarchy (2026-09-05) are a different
thing: sections of one view, not views. Nine tables end to end were a scroll,
not a page, so Rules became eight tabs on the header's rule and the
salespeople table went to sit beside the chart it mirrors (user: "我要把下面
那些分析的 1、2、3、4 全部变成一个 tab tab tab"). `SlidingTabs` on a
`.page-head.tabbed` header, `?tab=` pushed with the browser's own history so
a switch costs no round trip — see DESIGN.md.

The slug is derived from the sub-department's **name** (`Fair` → `fair`), which
is what `uq_sub_department_name` makes unique; `code` is nullable and
unconstrained, so it cannot address a row. `createSubDepartment` refuses a name
that would slug to a reserved static child (`products`) or collide with an
existing one — a shadowed sub-department would be unreachable rather than
broken, and only its creator would ever find out.

### 3.1 The tier ladder (Fair)

| Tier | Rates | Notes |
|---|---|---|
| Revenue Specialist | **5%** → **6%** | 5% **may not recruit**. 6% unlocks recruiting and overriding the 5%s. |
| Team Assistant | **7%** → **8%** | 7% is reached at **300k of group sales** |
| Team Leader | **9%** | |
| Senior Team Leader | **10%** | |

> There is **no 7% Revenue Specialist** — 7% is where Team Assistant begins
> (corrected by the user 2026-08-31).

**Each rung belongs to a title** (2026-09-03). `comm_ranks.title_id` points at
a row of `titles` — the same rows Team → Role & Permission manages — and the
Rules page picks it from a dropdown rather than typing a tier label. The
Revenue Department carries six titles and the live ladder maps 1:1:

| Rung | Title |
|---|---|
| 5% | Revenue Specialist |
| 6% | Senior Revenue Specialist |
| 7% | Team Assistant |
| 8% | Senior Team Assistant |
| 9% | Team Leader |
| 10% | Senior Team Leader |

Several rungs may share a title; a title sits on the ladder where its lowest
rung sits. Nothing reads `titles.sort_order`, and nothing reads the
company-wide `title_levels` rungs (Assistant … Head of Department) either —
those compare titles *across* departments for the People org chart, while the
commission ladder is the one authority on which Revenue title outranks which,
because that is what the rate follows.

**Fair's percentage ranks are lettered from the top by rate** (user 2026-09-05).
IR adds a package rank ordered above percentage ranks; see §15.3. The
following rate-only catalogue history describes Fair:

> Rank 你不用想一个名字 … 它直接变成 Rank A equal to 5% rate 这样。可能从 Rank H
> 以此类推到 Rank A，最高到 SS，这样反推过去，它就是 equal with 它的 rate。

A rung used to be named after its title with the rate stapled on ("Team
Leader - 9%"), which read as if the title and the rank were one thing. They
are not: a Team Leader who misses target is still a Team Leader, paid a rank
down. So nobody names a rung any more. The ladder is lettered from the **top**
— **SS** for the highest rate, then **A, B, C …** downward — and the letter
follows the rate:

| Rank | Rate | Title of the rung |
|---|---|---|
| SS | 10% | Senior Team Leader |
| A | 9% | Team Leader |
| B | 8% | Senior Team Assistant |
| C | 7% | Team Assistant |
| D | 6% | Senior Revenue Specialist |
| E | 5% | Revenue Specialist |

**The rank is a row of its own** (user 2026-09-05 evening, migration
`20260905060000_rank_catalog`):

> 这个 rank 基本上是可选的，rate 是不能选的，因为 rate 绑定了 rank。你帮我加多一个
> rank 的 tab，点进去后我可以配置 rank A 等于多少 rate … title 本身不能用 dropdown
> 选（只有 add new 那边才可以），选好后 title 就是 fixed 的；rank 那边有 dropdown
> option；rate 不能直接改，除非我在 rank 的那个 tab 里去调。

`comm_rank_defs` is the catalogue — one row per (scheme, rate), the **Ranks**
tab (section IX). `comm_ranks` stays the ladder: one rung per title, holding
the gates and `can_recruit`, with `rank_def_id` pointing at the rank it pays.
The rung's `product_rate` / `label` / `sort_order` are trigger-kept copies of
the rank's (`comm_ranks_follow_rank_def` on the way in,
`comm_rank_defs_propagate` pushing a re-rate down), so the engine, the
statements and the hierarchy read exactly what they read before. Letters are
counted over the **catalogue**, so a rank nobody has put a title on yet still
takes its place (add an 11% rank and Senior Team Leader's 10% becomes Rank A).
A rank pays one title (`uq_comm_rank_def`); a rung written with only a rate —
old code, a clone — is matched to the rank at that rate or mints one.

A rung added above shifts every letter down — that is the point, the letters
count from the top. `src/lib/commission/ranks.ts` (15 tests) is the one
place that letters: every page computes from the rates it holds, and
`upsertRank` re-sequences the whole ladder after every write — `sort_order`
10/20/30 … by rate from the bottom, `comm_ranks.label` "Rank SS" / "Rank A"
… from the top — so a rung keyed in at 6.5% lands between 6% and 7%, and the
engine's "one rung up" always means the next rate up. Two rungs on one rate
would be two names for one pay: refused in the action and by
`uq_comm_rank_rate` (migration `20260905010000_rank_letters.sql`, which also
relettered the live ladder). `rank_key` — what a statement snapshots and a
promotion rule points at — is minted from the title's initials and the rate
(`stl_11`) and never carries the letter, so history never moves when the
letters do. The run dashboard and a statement show the letter their key
wears *today*.

### 3.1.1 The title is a ratchet; the rank floats

The user's rule (2026-09-02):

> 如果他曾经 hit 到哪一个 tier level，就 hit 到相应的那个 grade。这个月是 6 月，他的
> title 就变 Team Assistant 了；7 月没 hit 到 target，他的 percentage 就跌回去他之前的
> percent，但是 title 还是 Team Assistant。Title 只会上，不会下。只有 rank 会上还是下，
> 除非那个人是 fixed rank。

So a salesperson carries **two facts that move differently**:

| | Lives in | Up | Down |
|---|---|---|---|
| **Title** | `hr_staff_costs.title_id` (the People page's title) | the month a run is **applied** whose paid rank belongs to a higher title — and a manual placement at such a rank | **never by the engine**; a human demotes on People |
| **Rank %** | `comm_hierarchy.rank_id` = the floor; the month's effective rank on the statement | group sales clear a rung (`variable`) | back to the floor when the target is missed (`variable`); pinned (`fixed`) |

June: a Senior Revenue Specialist on `variable` clears 300k → paid at 7%,
title raised to Team Assistant. July: misses it → paid at 6%, **title stays
Team Assistant**. The floor rank is untouched by either month.

**One rung at a time, and two kinds of gate** (user 2026-09-03, the answer to
Q11):

> 如果他只是单月达到 300k 的话，还是一样不能够跳过限制，他需要连续两个月达到那个
> criteria 才能变成 Senior Revenue Specialist，而不是直接升到 Team Assistant。

A month can lift somebody at most **one rung above their floor**, and only if
*that* rung's gate holds. A rung carries at most one gate:

| Gate | Column on `comm_ranks` | Kind | Today |
|---|---|---|---|
| Group sales this month | `group_sales_threshold` | **monthly** — paid that rung this month, back to the floor next month | 300k → Team Assistant |
| Own sales, N months running | `personal_sales_threshold` × `consecutive_months` | **earned** — the title raised at apply is the record; every later month climbs from that rung | 100k × 2 → Senior Revenue Specialist |

So the 5% Specialist who sells 300k alone is paid 5% (the 300k gate is two
rungs up); two months running of 100k make them Senior and pay 6% in the
second month; only *then* does the 300k gate apply to them. The earlier
months' own revenue comes from those months' runs (`comm_statements.
product_revenue`, deposit-cleared) — an unrun month is unknown, not zero, and
no streak crosses it, so the first month a sub-department runs nobody can pass
a two-month streak.

The earned rung is why a Team Assistant drops to **6%**, not 5%, in July: the
engine's floor is `max(placed rank, the highest streak-gated rung at or below
the title's rung)` in `variable` mode (`earnedFloor`, `titles.ts`). A `fixed`
person is paid exactly the rank a human placed them at. The statement's
`base_rank_key` records the floor actually climbed from, and Rules IX says
"paid from Revenue Specialist - 6% — earned by title" beside a placed rank the
title has lifted.

Mechanics:

- `comm_statements.rank_title_id` snapshots the title of the rank paid;
  `promotes_to_title_id` is the engine's **preview** of the ratchet (the run
  dashboard shows `TITLE → TEAM ASSISTANT ON APPLY`).
- `apply_commission_run` decides afresh from the **live** staff record, raises
  `hr_staff_costs.title_id` (mirroring `designation`, which the payroll export
  reads), and writes one row to **`comm_title_promotions`** per raise. The
  toast reports `N title(s) raised`.
- `reopen_commission_run` takes the money back out of payroll and **does not
  lower the title** — a ratchet only goes one way.
- A manual placement on the Rules page or the org chart at a rank above the
  held title raises it the same way, logged with `run_id = NULL`.
- The People org chart's ladder rule (`hr_staff_respects_ladder`, SQLSTATE
  `23LAD`) can refuse a raise that would stand above the person's
  `reports_to` line on the company ladder. The apply then fails **loudly**,
  naming the person and the line, and the whole month rolls back — commission
  does not quietly step around a reporting line the People chart got wrong.

**"Can recruit" follows the title, not the month's rank** (user 2026-09-03). A
Team Assistant who slips back to 5% for a month keeps the team they built, and
the run must not stall on it. A title may recruit when any rung it carries
may; only somebody with no title yet is judged by the rank they were placed
at. Enforced in three places with one helper (`src/lib/commission/titles.ts`):
the engine's warning, `setPosition`'s guard, and the two pages' upline pickers.

### 3.2 Group sales — what the threshold measures (Fair)

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
`rate_mode` overrides it. The **title** is a separate fact and only ever goes
up — §3.1.1.

Either way the engine reports `qualifiesForRankKey`, so a **fixed** person who
has just cleared 300k surfaces as *due a promotion* rather than silently staying
put. Promotion itself stays a human action — one click that writes a new
effective-dated hierarchy row.

The effective rate is what everything else uses: product commission, the Open
Bill uplift, and the override differential.

### 3.4 Promotion criteria — recorded; two of them live on the ladder

> **Status: written down; the engine reads the ladder, not this table.** The
> user's instruction (2026-08-31): *"这个本身先不需要 set goal，等之后 fixed 的
> 时候我再重新写进去，担心根据 restrictions 会有不同的算法。不过可以先写下来。"*
> They live in `comm_promotion_rules` with `is_enforced = FALSE`. The gates the
> engine actually applies are the two on `comm_ranks` (§3.1.1): the 300k
> group-sales rung to Team Assistant, and — since 2026-09-03 — the 100k × 2
> months personal-sales streak to Senior Revenue Specialist. Rules VIII marks
> a line `LIVE · LADDER GATE` when it matches one of those columns.

Criteria sharing an `alternative_group` are **ANDed**; different groups are
**ORed**. That models the 7% → 8% rule exactly.

| From → To | Criteria |
|---|---|
| **5% → 6%** | **Personal sales ≥ 100k for two consecutive months.** ← live since 2026-09-03 (`personal_sales_threshold` × `consecutive_months` on rs_6). At 5% you cannot hold a team, so it can only be personal. |
| **6% → 7%** | **Group sales ≥ 300k.** ← live (`group_sales_threshold` on ta_7) |
| **7% → 8%** | **Any one of:** (a) group sales ≥ 500k **and** 10 KPI items per head — a team of 5 needs 50 in total; (b) group sales ≥ 500k **and** margin at Tier 1; (c) group sales ≥ **700k** on its own, whatever the KPI and margin |
| **8% → 9%** | **All three, compulsory:** group sales ≥ 700k **and** margin Tier 1 **and** 10 KPI items per head |
| **9% → 10%** | Not yet specified — the user's "Tier 3" rules are still to come |

`kpi_items_per_pax` needs a head-count of the person's team, and the margin
tier needs the cost feed (Q1); neither is wired, which is why the 7% → 8% and
8% → 9% steps stay recorded only. The consecutive-months machinery now
exists: a streak reads the earlier months' runs (§3.1.1).

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

The chain stops below the **Revenue Director** (2026-09-11): the Team Leader
reports to the director on both charts, but the director holds no rank and is
never a `comm_hierarchy` row, so the roll-up ends at the top of the leader's
tree and nothing reaches the director — "该 Hierarchy 仅用于 reporting，不用于
commission overriding". `comm_sync_position` writes a null upline for anybody
whose `reports_to` heads the department (§3).

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

The Add Staff form (People → People Management → Add person) is where that is
filed: picking any `payroll_source = 'commission'` department shows a **Fully
commission based** tick, on by default, which locks basic / statutory
allowance / non-statutory allowance at 0.00 and saves the person as
`commission_eligible`. Untick it for the odd Revenue hire who does draw a
basic. The tick does not touch `tax_mode` — Withholding Tax stays the
per-person tick on the sub-department's Staff Hierarchy page (§5).

The Edit form (own page and the person card) carries the same tick for a
person in such a department, in place of the Employment Type select. While
it is on, the Salary and Statutory sections are not shown at all and a save
writes only the four columns that say "fully commission based"; the statutory
categories are left as they were. The card's Details panel and the person
page read the same way (`isFullyCommissionBased` in `src/lib/staff-form.ts`:
`commission_eligible` AND a commission department — outside one, the flag
keeps its older "basic + commission rules" meaning and the pay fields stay).

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
| `comm_ranks` | `title_id` → `titles` (replaced `tier_key` / `tier_label` 2026-09-03), rank, rate, `can_recruit`, the monthly `group_sales_threshold`, the earned `personal_sales_threshold` × `consecutive_months` |
| `comm_item_groups` | ERP group → commissionable? |
| `comm_kpi_items` / `comm_kpi_thresholds` | KPI products and the qty ladder |
| `comm_open_bill_rules` | 50 / 40 / 30% |
| `comm_brands` | Akemi / Zanotti / Ergotex + the Item-Code prefixes that identify them |
| `comm_margin_bands` | each brand's margin ladder (incentive / reference / penalty) |
| `comm_promotion_rules` | the promotion criteria, recorded with `is_enforced = FALSE` |
| `comm_hierarchy` | effective-dated upline + attained rank + `rate_mode`; one position per person |
| `comm_agent_aliases` | ERP agent name → `hr_staff_costs` |
| `sales_import_batches` | one per file; one `committed` batch per sub-department and period |
| `sales_orders` / `sales_order_lines` | the raw facts, plus `brand_code`, `cost_amount` and `raw` JSONB |
| `sales_order_open_bill_tags` | the picks, with `auto_suggested` |
| `comm_runs` | one per sub-department per month |
| `comm_statements` / `comm_statement_lines` | results + the audit trail; `rank_title_id` (title of the rank paid) and `promotes_to_title_id` (the ratchet, previewed) |
| `comm_statement_brand_margins` | the per-brand margin behind one statement — which brand capped the incentive |
| `comm_order_releases` | which orders have been paid — the deposit gate's safety net |
| `comm_title_promotions` | every time a title was raised — by an applied run (`run_id`) or a manual placement (`run_id NULL`). Never lowered here; reopen writes nothing |

Changes to existing tables: `departments.payroll_source`,
`hr_staff_costs.tax_mode` + `withholding_rate`,
`hr_monthly_payroll.withholding_tax`.

**Cycle safety, twice.** `comm_hierarchy` has a `BEFORE` trigger that walks the
chain and rejects a cycle (depth cap 20); the engine independently carries a
visited set and depth cap, in both the override roll-up and the group-revenue
roll-up. Assigning a manager to their own downline through a targeted card drop,
the Upline picker or a connector would create one; each path rejects that move.
A cycle here would be a silent money bug rather than a crash. Blank-space
dragging only changes the visual layout.

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
src/app/(portal)/revenue/
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

## 9. The consolidated rules page

> **Moved 2026-08-31**, out of a tab inside Settings — a principal + finance
> page with no sidebar entry for HR, so the one screen that configures HR's own
> payroll was reachable by URL alone.
>
> **Moved again 2026-09-01** with the rest of the module (§3.0). It is now
> `/revenue/<sub-department>/rules`, the third tab of a sub-department. The
> Product List went with it and stayed at department level,
> `/revenue/products`: `comm_products` carries no `scheme_id` — there is one
> cost master for the whole department — and the user confirmed on 2026-08-31
> that it stays with the module rather than returning to Settings. Still
> Principal-only: HR sets the rules, not what a product costs.
>
> The layout below is unchanged apart from the picker (see next paragraph).
>
> **Tabbed 2026-09-05.** The sections are a tab rail on the header's rule —
> `?tab=scheme|ladder|groups|kpi|thresholds|open-bill|brands|promotion|ranks`
> — one section on screen at a time, the numerals kept on the section heads.
> *+ Generate new sub-department* moved into the header's action slot and
> opens its panel above the active tab. Section IX, the salespeople, moved to
> Staff Hierarchy's **Team** tab (§10) — beside the chart that moves them —
> and the same evening the number went to the ninth tab, **Ranks** (§3.1):
> the rate catalogue the ladder picks from.
>
> **Gated 2026-09-11.** The rail shows only the tabs the scheme uses. Scheme
> rules, Title ladder and Ranks are always there; every other tab is a table
> one switch on Scheme rules reads, and it appears only while that switch is
> on (user, on IR's page: "上面的 tab 是 depend on 我 turn on 它才会跳出来"):
> KPI item allowance → Item groups, KPI items, KPI threshold ladder; Open
> Bill bonus → Open Bill rates; Below-margin penalty *or* Monthly margin
> incentive → Brands & margin bands (one brand ladder holds both kinds of
> rung). Promotion criteria has no switch — it is recorded policy — so it
> shows while anything is recorded. One guard: a scheme that has already
> classified item groups keeps that tab whatever its switches say, because
> Product revenue commission reads the classification (§4.0) and a rule the
> run applies must stay in sight. So IR shows three tabs and Fair nine; a
> `?tab=` naming a hidden tab opens Scheme rules, where its switch is.
> `lib/commission/rules-tabs.ts`.

One page holds every rule, threshold and per-person tick, laid out as dense
tables following `DESIGN.md` v3.0 (`.ledger-table`, `.num`, `.sect-head`).

**Scoping is the route's job, not a picker's** (2026-09-01). It used to open a
sub-department picker at the top and filter the page from it; the sidebar now
asks the same question one level up, and `/revenue/fair/rules` loads Fair's
scheme and nothing else. Two answers to one question is how a ladder gets
edited while another team's name is on screen. **+ Generate New Sub-Department**
stays on the page — a new one usually starts as a clone of the ruleset you are
looking at — and the new sub-department appears in the sidebar.

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

The three group-package parameters IR added (§15.3) — Group sales layers,
Override layers, Direct-line limit — sit in the same table but are not
switches: `updateScheme` requires them at 2 / 2 / 3 whenever Group incentive
package is on, and blank means "every layer" for a percentage-only scheme.
Their ON cell wore a dash, which read as a switch that cannot be turned on;
since 2026-09-11 it wears an **`IR`** chip instead, on every sub-department's
page, so the row says whose parameters these are (user: "把那个 dash 换成
IR … 这样就知道它是属于 IR").

The table's ORDER is the saved scheme's, not the catalogue's (same day, user:
"默认是 IR 专属的排在最上面 … 接下来排我现在打勾的那些 … 剩下的 balance，你就放那些没
有打勾的"): the three IR parameters first, then the switches that are on, then
the switches that are off, Default rate mode last. Inside a group the
catalogue order holds, and a row moves only when Save lands — the page
re-reads the scheme — never while a box is being ticked.
`lib/commission/scheme-rule-order.ts`.

**II. Title ladder** — `comm_ranks`. One rung per title. The **title is
fixed** once the rung exists (2026-09-05 evening: "选好后 title 就是 fixed 的") —
only the blank row at the bottom, the one that adds a rung, has the title
dropdown (the Revenue Department's titles, §3.1). The **Rank column is a
dropdown** of the catalogue (§3.1, "Rank B · 8%"; a rank another title holds is
greyed with that title's name), and the **rate is read-only** — it follows the
rank. Adding a rung mints its `rank_key` from the title's initials and the
rank's rate. A rung takes at most one gate: a monthly group-sales target, or
an earned personal-sales streak (§3.1.1).

```
TITLE                       RANK          RATE    CAN RECRUIT   GROUP SALES TARGET   PERSONAL SALES STREAK
[Revenue Specialist      ▾] RANK E         5.00%      [ ]              —                  —
[Senior Revenue Special… ▾] RANK D         6.00%      [✓]              —          100,000 × 2 mths
[Team Assistant          ▾] RANK C         7.00%      [✓]        300,000.00                —
[Senior Team Assistant   ▾] RANK B         8.00%      [✓]              —                  —
[Team Leader             ▾] RANK A         9.00%      [✓]              —                  —
[Senior Team Leader      ▾] RANK SS       10.00%      [✓]              —                  —
[— pick a title —        ▾] lettered by      11      [✓]              —                  —        [ Add ]
                            its rate
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

**IX. Ranks** — `comm_rank_defs`, the catalogue (2026-09-05 evening, §3.1). One
row per rank: the letter as a chip (counted from the top, never typed) and the
**rate** — the only place a rate is typed. Nothing else: which title a rank is
paid to is the ladder's business, not this tab's (user 2026-09-06, "这边主要是
setting for rate"). A blank row adds a rank; an unused rank can be removed; a
rank a title sits on cannot. Re-rating a rank changes what every month from now pays on it; a month
already computed keeps the rate it snapshotted. Adding a rank above the others
moves every letter down, and a rank nobody has put a title on yet still holds
its place.

*(IX was the salespeople until earlier the same day — **moved** to Staff
Hierarchy's Team tab, see §10. It sat here as the per-person tick table with an
upline picker on every row, which made two places to move somebody. Now the
chart moves people and the table sets the rank, and they are two tabs of one
page.)*

---

## 10. Other UI

Below `/revenue/<sub>`, runs (`uq_comm_run_per_sub_dept_period`), scheme rules,
the Team table and sales batches stay scoped to that sub-department. The
hierarchy canvas also shows its active sibling sub-departments, with each
scheme and membership kept separate. The IR continuation adds `sales_import_batches.sub_department_id`
and one committed batch per (sub-department, period). Carry-forward and paid
order identities use that same boundary. The existing Houzs ERP feed always
belongs to Fair; an IR file import cannot supersede Fair's batch.

| Route | Purpose |
|---|---|
| `/revenue` | no page of its own — redirects to the first sub-department. Serves the old `/hr-costing/commission/*` links and the not-set-up-yet case |
| `/revenue/<sub>` | **Commission Calculation** — months with sales data and this sub-department's run status against each. Sidebar: *Comm Cal* |
| `…/<sub>/hierarchy` | **Staff Hierarchy** — the combined department chart, and `?tab=team` the route's Team table (both below) |
| `…/<sub>/rules` | **Rules** — every rule the engine reads (§9) |
| `…/<sub>/[period]` | run dashboard: hero total, per-salesperson `.ledger-table` (PR / group / C1 / KPI / Open Bill / Override / Incentive / Total), warnings, penalised bills, orders waiting on a deposit, Compute + Apply + Reopen |
| `…/<sub>/[period]/statement/[staffId]` | one salesperson's month ringgit by ringgit — the figures, margin brand by brand, and a section per component drilling into `comm_statement_lines` |
| `…/<sub>/[period]/import` | Sales import wizard: parse → period + cancelled report → **agent matching** → commit, scoped to this sub-department |
| `…/<sub>/[period]/open-bill` | day-by-day board, pre-filled from `sequence_in_day`, reviewed by a human. Defaults to the salesperson-days still on a suggestion |
| `/revenue/products` | item code → unit cost + brand — department-wide, Principal only |

All of `/revenue` is Principal + HR (`canAccessRevenue`); the Product List
narrows to Principal (`canAccessProductList`).

The deferred-orders list is a section on the run dashboard rather than a page
of its own: it is read once, alongside the total it is holding back.

**Org chart** (combined canvas, 2026-09-11). Built with **`@xyflow/react`**, with
database-style connector lines and three visual levels: a tinted outer frame
for each sub-department, growing rounded rectangular frames around its teams, and member
cards. The overview loads permitted active siblings of the route's department
that have an active scheme. Each membership keeps its own title, rank and
upline, even when the same person appears in several regions. Subdued title
badges show the full membership title and a small mnemonic; pay and rank chips
remain neutral. Department shortcuts and search move the viewport without
merging those memberships.

**Drag to arrange or transfer.** Team borders and headings move whole teams to
free world coordinates on the pannable canvas. Members align in hierarchy rows
inside each team; a blank-space card drop springs back to its slot. Its frame
stays steady while the card is carried. Holding over a
specific person for 450ms arms a transfer, with the intended upline shown before
release. An accepted transfer carries the member's subtree, preserving all
descendant relationships, and realigns the affected teams around their existing
leaders. Frames grow or shrink with those memberships. A failed or cancelled transfer returns to the starting
arrangement. Blank-space drops never detach a member; the Upline menu's Top of
team action does that explicitly.

Dragging a team or department heading or border with the left or right mouse
button, or touch, moves all its members together; heading arrow keys also move
the group. Escape, pointer cancellation and lost capture restore its original
layout. On release, overlapping teams and departments move aside as whole groups.
**Tidy** aligns hierarchy rows and separates overlaps, keeping freely chosen
team leader origins. There is no fixed page grid or manually resized team box.
Browser layout memory is scoped to the set of schemes; each card is identified
by scheme and staff ID.

**Motion.** Transferred members settle with a gentle 500ms spring; neighboring
groups use a 500ms transition without overshoot. Connectors have rounded corners,
and a fading halo marks the landing. If needed, the camera eases out over 400ms,
then focuses the destination after the cards settle. Pointer or wheel input
cancels automatic camera movement. Reduced motion skips these animations.

**Validated upline edits:** targeted drops, a card's Upline picker, the selected
member's Change upline action, and connectors within a sub-department all call
`moveOnChart` with the membership's scheme and raw staff IDs. On the home
sub-department, `moveReportingLine` writes `hr_staff_costs.reports_to`, and the
database derives the effective-dated `comm_hierarchy` position from the
company line and title. Elsewhere, `moveMembership` changes that scheme's own
membership without touching People. Existing cycle, title, direct-line
capacity and permission checks still apply. Cross-sub-department drops and
connectors are refused, including between two memberships of the same person.
Rearranging cards, or passing over a target without arming and releasing it,
does not change an upline, title or rank.

**Team tab** (2026-09-05, was Rules IX). One row per salesperson: name, the
title they hold, their rank, rate mode, upline, Withholding Tax. The user's
line between the two tabs: "Hierarchy table 那边 … 是可以随意调动的; Team
table 那边 … 只可以换它的 rank 罢了" — so the chart's targeted drops, Upline
picker and connectors change the line, and the table changes **nothing but the rank** (with the rate
mode, which is the rank's own setting; `setStaffRank`). Its Upline column is
text — who they earn under here. A title gives its rank on its own (the floor
rung, by trigger), so the table only ever raises one. The route's chart region
and Team tab share one `loadTeam` read; other chart regions load their own
schemes. An explicit upline edit is therefore what that sub-department's table
shows when it re-renders. Withholding Tax stays editable here because it is a payroll fact of
the person with no other home in the module.

Two shapes since 2026-09-10 (memberships per sub-department): on the **home**
sub-department (the department's oldest — Fair) the rows are the whole
department, **Title** is the company title (read-only: the ratchet, §3.1.1,
raised by an applied run, lowered only on People), and somebody whose title
has no rung reads `no rank yet`. On every **other** sub-department (IR) the
rows are its members: an **Add to IR** row above the table (a person from the
department + the title they hold here, which needs a rung on IR's ladder), a
Title picker per row with the company title in small print beneath when it
differs, and a **Remove** on the row once nobody earns under them. Nothing on
an IR row touches People.

```
NAME            TITLE                 RANK              RATE MODE        UPLINE                 WITHHOLDING
YUNY            Team Leader           [Rank A · 9%  ▾]  [Manual       ▾] top of a tree             [✓] 2.00 %
TAN KAR JIUN    Team Assistant        [Rank D · 6%  ▾]  [Scheme target▾] YUNY  since 2026-09-01     [✓] 2.00 %
LUCAS           Senior Rev Specialist [Rank D · 6%  ▾]  [Scheme target▾] YUNY  since 2026-09-01     [ ]
SALLY           Revenue Specialist    [Rank E · 5%  ▾]  [scheme default▾] SHAWN since 2026-09-01    [✓] 2.00 %
```

**Reports to** (2026-09-11) opens the Team tab, above the members: the
sub-department's Revenue Director(s) as chips with a Remove each, and an add
row offering the department's heads (titles with *Heads the department* under
People › Roles) not yet directing it. Both write `comm_sub_department_directors`
(`addDirector` / `removeDirector`) and come back with a note; a director is
never a row of the Team table. A member at the top of a tree reads
`top of a tree · reports to KRIS · PETER` in the Upline column. On the chart the
directors stand on a rail above every sub-department frame, each once, with one
dashed line per frame they direct landing on the frame's top edge and
`Reports to KRIS · PETER` on the frame's header — nothing is drawn inside the
frame (design A, 2026-09-12; DESIGN.md `.space-director`); People › Hierarchy
still draws its dashed line from the home sub-department's directors to the
top of every tree.

**Payroll grid change** (`PayrollRow.tsx`, built): for staff in a
`payroll_source = 'commission'` department the Commission cell is **read-only**
with a `from commission run` badge linking to that month's statement — or
`awaiting the run` when no statement exists yet. A hand edit cannot silently
diverge from the audit trail, and it cannot get past the Server Action either:
`resolveCommissionWrite` (`src/lib/commission/derived-commission.ts`, 7 tests)
drops an unchanged value that rode along with a legitimate edit and refuses one
that would actually move the number.

**Withholding Tax on the grid and the payslip.** PCB and WHT are mutually
exclusive, and both the expanded grid panel and the payslip showed only PCB —
so a Revenue salesperson's payslip reported a Net Pay that did not equal Gross
minus Total Deductions. Both now show whichever tax applies, and
`updateStaffStatutory` subtracts WHT when it recomputes net, or overriding any
statutory on a Revenue row would have quietly handed back their tax.

---

## 11. Build order

| # | Step | State |
|---|---|---|
| 1 | Migration: 22 tables + RLS + `payroll_source` + the Fair seed (ladder, item groups, Open Bill rates, brands, Akemi's margin ladder, promotion criteria) | ✅ **applied live** 2026-08-31 |
| 2 | Withholding Tax migration (tax_mode, WHT column, trigger branch) | ✅ **applied live**, regression-verified |
| 3 | Pure TS engine + tests | ✅ 91 tests |
| 4 | ERP parser + tests | ✅ 25 tests, verified against the real file |
| 5 | **Create the ~39 salespeople** in the Revenue Department | ⛔ blocked — needs the staff list (Q2) |
| 6 | The rules page (§9) + Product list | ✅ built; moved out of Settings 2026-08-31 |
| 7 | Org chart (`@xyflow/react`, nested department spaces, layout dragging and explicit upline edits) | ✅ built |
| 8 | Import wizard + agent matching | ✅ built |
| 9 | Open Bill board | ✅ built |
| 10 | `save_` / `apply_` / `reopen_commission_run` RPCs + run dashboard + statement drill-down | ✅ built, **applied live** 2026-08-31 |
| 11 | Payroll read-only Commission cell + WHT on the grid and the payslip | ✅ built |
| 11a | Rung → title, the title ratchet, can-recruit by title, `+ add rung` (§3.1.1) — `20260903030000_rank_title_ratchet.sql` | ✅ built, **applied live** 2026-09-03; apply → reopen walked in the browser |
| 11b | One rung at a time + the earned personal-sales streak gate (100k × 2 → Senior Revenue Specialist) — `20260903040000_personal_sales_streak_gate.sql` | ✅ built, **applied live** 2026-09-03 |
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
| ~~**Q1**~~ | ~~**Where does cost come from?** The sales-order export has no cost column…~~ **Answered 2026-09-05 by the ERP live feed (§14):** every delivered line carries the ERP's `line_cost_sen`, stamped onto `sales_order_lines.cost_amount`; the Product List is the fallback for a line the ERP sends without one. Only file-imported months still depend on the Product List. | closed for live months |
| **Q2** | The **staff list** for the ~39 salespeople — names, NRIC, bank accounts, hire dates, sub-department, upline, attained rank, manual/scheme rate mode, and who is withheld. | nothing can run until they exist in `hr_staff_costs` |
| **Q3** | **Brand mapping** for Zanotti and Ergotex. Akemi is seeded as `AK-` / `AKE` (those codes carry AKEMI product descriptions). The July export's other prefixes are `NTYR- JM- AERO- HOK- DSL- AMN- CH-` — which belong to which brand, and what happens to the ones that belong to none? | an order that resolves to no brand blocks that person's incentive |
| **Q4** | The **KPI product list**: which of the 26 ACC item codes, at what amount? Sizing check — RM50 on the five commonest pillow codes would have paid **≈ RM63,000** of KPI in July against ≈ RM141,000 of product commission at a flat 5%. | drives `comm_kpi_items` |
| **Q5** | The **Zanotti and Ergotex ladders** — only Zanotti's Tier 1 (33%) is known, and Ergotex has none. Until a brand has a ladder, selling it blocks that salesperson's incentive entirely. | seeded partially, by design |
| **Q6** | What promotes **5% → 6%** is recorded as *personal* sales (at 5% you cannot hold a team) — confirm that reading. | `comm_promotion_rules` |
| **Q8** | **WHT remittance** — which LHDN form / schedule, so the statutory export can produce it. | legally required before the first payout |
| **Q9** | Is the deposit threshold really **50%**, and is it the same for every sub-department? | it is a per-scheme setting; 50% is seeded |
| **Q10** | Should the Revenue Dept manager (`dept_manager` role) see their team's commission? | RLS scope; DENY for now |
| ~~**Q11**~~ | ~~A 5% Revenue Specialist who sells 300k on their own is paid at 7% and titled Team Assistant, skipping 6%.~~ **Answered 2026-09-03: no skipping.** They stay a Specialist until two months running of 100k make them Senior; only then does the 300k gate apply. Built as the earned streak gate + one-rung-per-month rule (§3.1.1). | closed |

---

## 14. ERP live feed (2026-09-05)

The xlsx import is no longer the only way sales orders arrive. The Houzs ERP
(`Houzs-Century/Houzs-ERP`, a Cloudflare Worker over Supabase) **pushes every
changed sales order to the portal seconds after it is saved**, using the same
outbox + pg_cron + pg_net shape it already runs for its 2990 POS mirror. The
portal upserts it into the SAME `sales_*` tables, so nothing below the import
step changed.

```
scm.mfg_sales_orders (+items, +payments)  ── AFTER trigger ──▶  scm.venture_portal_outbox
        pg_cron 10 s → net.http_post ──▶  POST /api/erp/v1/sales-orders   (x-sync-secret)
                                              │  src/lib/erp-sync/contract.ts  (sen→RM, PII off, statuses)
                                              ▼
                                   ingest_erp_sales_order(p_order)   [atomic RPC]
                                              │
                       sales_import_batches (source = 'erp_sync', ONE per period, stays committed)
                       sales_orders (upsert by doc no) + sales_order_lines (replaced) + Open Bill suggestions
                       erp_sync_events (every delivery, its outcome, held payloads)
```

What the feed changes, and what it does not:

| | |
|---|---|
| One committed batch per period | unchanged — a live month has ONE `erp_sync` batch that orders are upserted into; the importer refuses a live month and the feed holds deliveries for a file-imported one |
| `cancelled` | for a live order means *excluded from commission*; `erp_status` / `erp_on_hold` say why. The ERP's own rule is mirrored: CANCELLED / DRAFT / the hold marker earn nothing, **CLOSED still earns** |
| cost | now per line from the ERP (Q1 closed) |
| brand | the ERP's `branding` column first, then the lines, then the Item Code prefixes |
| salesperson | the ERP's `scm.staff` uuid, matched once on the Comm Cal page and remembered (`comm_agent_aliases.erp_salesperson_id`); the spelling match is the fallback |
| Open Bill | the ERP has a real creation time, so 1st/2nd/3rd bill of the day is derived from it and re-suggested as orders arrive; human picks are never touched |
| applied / locked months | the feed never writes into them — the delivery is **held** with its payload, counted on the Comm Cal page, and replayed by a human after `reopen_commission_run`. Cross-period clawback is still §13 |
| ordering | `snapshotAt` from the ERP; an older snapshot arriving late is ignored |
| the Comm Cal page | shows the feed: last event N s ago, salespeople to match, held deliveries per month with Replay, the last 15 deliveries |

The contract the ERP team builds against, and the SQL they apply, live in
`docs/erp-sync/`. The receiver is the portal's only POST route handler — the
machine-ingest exception in CLAUDE.md.

---

## 13. Non-goals (v1)

- No clawback / cancelled-order reversal across periods (an order cancelled
  after its commission was released does not retro-adjust a locked run) — needs
  its own rule.
- No automatic promotion of the **floor rank**; the portal flags eligibility
  and a human clicks. (The **title** does move by itself — up only — the month
  a higher rank is paid; §3.1.1.)
- No target / quota tracking or leaderboards beyond the group-sales figure.
- No commission accrual JV separate from the existing payroll accrual.
- The Revenue Department's own P&L, billing mode and pool 1090 flows are out of
  scope (step 13).

---

## 15. Investment Renovation (IR) — opening-month expansion gate confirmed, 2026-09-11

IR is a separate programme from Fair. The source annexure is
`revenue-ir-annexure.md`; its original wording is preserved there. Explicit
management answers below take precedence over conflicting annexure text.
The implementation is tracked in [PR #82](https://github.com/wenwei4046/Venture-Portal/pull/82),
including its release checks and deployment links. After integrating
`origin/main` at `177f0a0`, 1,147 tests passed; 120 disposable-database checks
cover the six migrations and expanded payouts. The implementation build
passed before release, and all six migrations passed a rollback-only
production rehearsal with the 60 payroll rows unchanged. These preflight
results do not themselves establish a completed deployment. See `HANDOFF.md`
for the migration list and remaining work. The fourth-line payout and
subsequent expansion rules are confirmed below. Recurring subsidy Claims
are a later batch.

### 15.1 Confirmed decisions

- **Percentage ladder:** RS remains **3%**, confirmed after a question about
  3.3%; TA is 3.5%, earned by RM200,000 personal sales in each of two
  consecutive months; TL is 4%, with an RM800,000 monthly group target.
  RS cannot recruit. TA/TL/STL may hold up to three direct lines before
  earning SDL expansion entitlement.
- **STL package replaces percentage pay when a group qualifies.** The user
  reconfirmed "取代 4%：只拿 RM6,000／达标组，另计补贴". At least one
  qualifying group switches the month's payout to RM6,000 per qualifying
  group, with no personal percentage commission or percentage override.
  The car/property subsidy has a separate RM2,000 cap per qualifying group.
  A group at RM1.5M, RM2M or more still pays exactly one package.
- **Monthly qualification and recurring group incentive.** Confirmed by the
  user on 2026-09-11: "每月重新计算，每个达标月都发 RM6,000／组". Assess
  TL's RM800,000 group-sales threshold and each STL group's RM1,000,000
  threshold afresh each calendar month. Do not accumulate sales across
  months to reach those targets. Pay RM6,000 per qualifying group in every
  qualifying month; it is not a one-time promotion reward. For example, a
  group with RM600,000 in August and RM400,000 in September qualifies in
  neither month; RM1,000,000 in each month qualifies for RM6,000 in each.
- **Fallback is explicitly TL 4%.** If no direct group qualifies next month,
  pay the TL 4% percentage structure for that month, even with a persisted
  STL title or rank. This restores percentage commission and applicable
  two-layer overrides. A title remains earned; monthly package pay does not.
- **Ordinary group targets count two generations:** own personal sales +
  directs' personal sales + their immediate children's personal sales. The
  third generation and deeper are excluded. This applies to all IR ranks.
- **Each package group reuses the leader's own sales:** for a leader L and
  direct D, its qualifying revenue is `personal(L) + personal(D) +
  sum(personal(C) for C reporting directly to D)`. Personal(L) deliberately
  appears in every direct group's target. Own RM200,000 plus A's RM800,000
  and B's RM800,000 gives two qualifying RM1M groups: RM12,000 cash incentive
  and RM4,000 separate subsidy cap. Actual combined revenue is RM1.8M;
  never sum the overlapping group targets into personal/actual revenue.
  Each group must independently meet RM1M; one group's surplus cannot make
  up another group's shortfall.
- **The first group incentive needs no TL title or three-child structure.**
  A direct line reaching the target under that formula is sufficient. The
  direct need not itself be TL, and can have zero children. A qualifying TA
  can reach the STL package without first spending a month at TL; Fair's
  one-rung-per-month restriction does not block this IR package qualification.
- **Overrides use compressed percentage differences over two actual layers.**
  TL 4% → TA 3.5% → RS 3% on an RS sale pays RS 3%, TA 0.5%, TL 0.5%.
  The rate already paid below is the maximum encountered; equal-rate layers
  pay zero but still consume a layer. Stop after two links, with no payment
  or target contribution from a third layer. Package recipients receive no
  percentage override in qualifying months.
- **Full Spec earns SDL eligibility for the initial expansion.** Full Spec means
  three direct lines, each holding three immediate directs, and all three
  groups independently qualifying at RM1M. This earns the higher **SDL**
  level and eligibility for a fourth direct. Already opened lines remain
  available after a weak month. The latest clarification limits the earlier
  permanent-entitlement interpretation: unused qualification does not grant
  an opening in a later weak month. Full Spec is not required to earn the
  first STL group package.
- **The fourth and later groups use the same payout formula.** Every line
  repeats the leader's own personal sales in its two-layer RM1M target and
  independently earns RM6,000 cash plus a separate RM2,000 subsidy cap.
- **Expansion is gated by the actual opening month.** After the initial
  Full Spec stage, four existing lines must all meet RM1M in the calendar
  month the fifth line actually opens; five of five must qualify in the
  month the sixth opens, and so on. An unused qualification from an earlier
  month cannot be banked for a later weak month. Add one line at each stage,
  with no upper limit specified. These later stages do not require each
  line to have three immediate children. A weak line prevents expansion
  that month, even if the newest line qualifies, but every independently
  qualifying line still earns its package. Already opened lines and their
  slots remain available in later weak months; future expansion beyond that
  opened capacity requires current-month qualification again.
- **Subsidy registration is once per instalment arrangement.** Register the
  hire-purchase document once, then pay monthly subject to qualification and
  the applicable instalment/cap. Re-submit when the instalment changes.
  It is a non-cash benefit through Claims, with no statutory deductions;
  do not add it to the engine's cash commission total.
- **Keep Fair's rules separate.** IR does not use Fair's KPI item allowance,
  Open Bill bonus, margin penalty or margin incentive. Its deposit gate is
  still undecided.

### 15.2 Questions still requiring business answers

1. Where do Appointment and Closing figures come from, who maintains them,
   and is the tier fixed per person or assessed monthly? Percentage
   denominators must be defined before the tier KPI can be computed.
2. What is the introducer's closing percentage and how is it split with the
   closer?
3. Confirm the house-assignment amount is RM10 per house per month and supply
   the assignment dates/data source.
4. Define IR's deposit gate. Until answered, do not silently copy Fair's 50%.

### 15.3 Implementation boundaries identified during resumption

- **Package order and catalogue:** model rate, group-incentive amount and
  per-group subsidy cap explicitly. Package ranks sort above percentage
  ranks even with a zero product rate. Letters remain generated SS, A, B…;
  they are not manually named. Catalogue uniqueness and cloning must use
  the full package rather than rate alone, so same-rate distinct packages
  do not collapse. Preserve Fair's existing percentage order and labels.
- **Pure group helper:** `src/lib/commission/ir-groups.ts` returns a separate
  breakdown for each direct: leader personal, direct personal, second-layer
  personal contributions, target result, fixed incentive and subsidy cap.
  It intentionally reuses leader revenue without mutating personal sales,
  rejects corrupt hierarchy qualification, and reports monthly Full Spec.
  The highest already opened SDL capacity must be persisted separately from
  current-month eligibility so existing slots survive later missed targets.
  Keep immutable evidence of each qualification; historical evidence does
  not bank an unused right to open a line in a later weak month. The initial
  three-by-three Full Spec test remains distinct from later
  all-existing-lines qualification.
- **Engine settings:** `groupSalesDepth = 2`, `overrideDepth = 2`, and
  `enableGroupIncentive = true` select IR's behavior. Absent depth settings
  preserve Fair's full tree/chain. A package rank supplies its monthly
  `groupSalesThreshold`, `groupIncentiveAmount`, and `groupSubsidyCap`.
  Percentage fallback is the TL rung below STL, including for somebody
  whose stored rank/title has already reached STL. A package without its
  group target must warn and block applying the run.
- **Statements/payroll:** emit one `group_incentive` statement line per
  qualifying group, include it in component totals and `total_commission`,
  and persist the qualifying-group breakdown. Keep `group_subsidy_cap`
  outside the cash total; Claims consumes this cap later. Maintain exact
  rounded line/component/run totals and the existing sum across applied
  sub-departments in shared payroll.
- **Hierarchy:** IR is a non-home sub-department and edits its own
  memberships. Enforce direct-line limits in the membership write/DB path
  as well as the chart; changing only `reports_to` would miss IR entirely.
  Start at three places, retain the highest already opened capacity in
  `opened_direct_line_limit`, and require current-period eligibility before
  an opening exceeds it. Four is the first expansion, not a permanent
  maximum. Migration `20260911060000_progressive_ir_direct_lines.sql` records
  opened capacity, effective current-period limits and immutable
  qualification evidence.
- **Order isolation prerequisite:** scope batches and carry-forward orders
  by sub-department before accepting IR's separate sales feed, including
  committed-batch uniqueness and the Fair ERP ingest path (`TODOS.md`,
  "Orders per sub-department"). This work is included in PR #82; its migration
  and matching app must be active together before an IR run can be applied.
- **Delivery batches:** (1) order isolation, rank packages, two-layer
  overrides, recruitment limits, group incentives and statement breakdown;
  (2) recurring subsidy registration through Claims; (3) tier KPI,
  introducer split and house assignments after their data sources and rules
  are defined. Each calculation change needs focused regression coverage
  plus the repository test/build checks.
