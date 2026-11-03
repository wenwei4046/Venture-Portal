# Part of a person's payroll cost borne by another department — design

2026-11-03 · asked by Finance (the user) · sample: `2026-11-03-payroll-cost-to-department-sample.html` (open it in a browser; *Now* / *New*, *Fixed RM* / *%* and *+ Department* respond to clicks; the numbers do not recalculate).

## Why

The user's example: Director Office's Vivian. RM 3,000 of her monthly cost should be borne by the HR pool, and HR then bills that RM 3,000 to the companies by percentages HR chooses. "可能往后也会别的 department bill 去别的 department, 所以要确定" — so it must work between any two departments, not only Director Office → HR.

Today a person's monthly employer cost can only be split by % to companies (HR Costing › Allocation, `hr_staff_allocation`); whatever is left is HOUZS Venture's own share. Nothing lets a department carry part of someone else's pay, and nothing sets percentages per department (the January table `hr_pool_allocation`, department × company × % per month, was never used — 0 rows, no screen, verified 2026-11-03).

## What it does — decided by the user

1. **A person's split can send part of the cost to another department.** On HR Costing › Allocation, beside the company lines, *+ Department* adds a line: pick the department, then *Fixed RM* or *%* (the box appears only after the choice). A fixed amount and a percentage are both allowed ("可以是固定，可以是 percentage"). The part moved covers every cost item the split covers today — salary, allowance, EPF, SOCSO, EIS employer ("包括她的 epf socso, allowance 等等都要 bill 去 hr").
2. **The moved part is the receiving department's own cost — no internal invoice** ("为什么还需要 finance 开单… 就当做算去 hr 的 cost 了" → confirmed). For that month:
   - the payroll accrual books it in the receiving department's segment;
   - the payroll funding draws it from the receiving department's pool;
   - the sending department's figures (accrual, funding, billing, its leftover) leave it out.
   This is exactly how HOUZS Venture's share of the directors' pay already works (`20261013233000_director_hv_share_in_payroll.sql`): `payroll_batch_pool_parts` moves each department's part between pools in the funding breakdown, `payroll_batch_segment_sums` puts it in that department's segment in the accrual. Follow that pattern.
3. **Every month HR decides where a receiving department's money goes** ("每月 HR 自己定"). For each receiving **cost-center** department, a card lists who moved how much into it this month and lets HR set Bill to rows: company + %. The billed amounts join that department's section of each company's consolidated payroll invoice for the month, as Salary / Allowance / EPF / SOCSO / EIS lines in proportion to what was moved.
4. **What is not billed stays with the receiving department** ("也有可能是 hr pool 要承担" → confirmed). HR may set no % at all. Invoice generation is not blocked; Finance's generate preview shows "Stays in <department>: RM x" so it is visible.
5. **A centralized receiving department bears it all.** Director, Marketing and Revenue Department (today) bill the companies with their own invoices, so there is no % card for them: what they receive is simply their cost.
6. **Who can send cost out: everyone on HR's payroll, by the department's mode** (`departments.cost_model`, Settings › Departments, switched by the Principal). A cost-center person (HR, Finance, IT, Director Office today) may have company lines and department lines. A centralized person (Marketing, Revenue Department today) may have department lines only — no company % ("让他们也能吧" → "只能转给别的部门，不能直接分给公司" → "可以"). Today centralized people are not listed on Allocation and a guard refuses their splits; that refusal stays for company lines only.
7. **Set while the person's payroll row is a draft; it locks with the row**, like today's split (`guard_staff_allocation_follows_payroll`, `splitLock`) (confirmed). The funding request and the accrual JVs are made per batch when HR submits the month to Finance (`payroll_submit_batch` → `postPayrollBatchAccrualJVs`), so the move must be fixed by then. What happens when a submitted row is reopened (Resubmit, Second payroll): see *Open questions*.

## Goals

- Any department → any other department with a pool, without code changes when departments are added or switch mode (IT and Revenue Department are registry departments; never a literal list).
- Every sen of a person's cost lands in exactly one place: a company, a department, or the leftover (HOUZS Venture's own share for a cost center, the person's own pool for a centralized department). Accrual, funding and billing tie to each other per department.

## Non-goals

- No internal invoice, receipt or transfer between departments for this.
- No names or individual pay on companies' invoices or on Finance's billing pages (as today: Finance reads aggregates per department × company).
- Money received by a department is not moved on to a third department (one hop).
- Not the directors' payroll (`director_monthly_payroll`): HOUZS Venture's share of it already splits to departments (`director_hv_share`). Not the Billing Allocator, not rent / utility splits.

## Anti-goals (would make it a failure even if it runs)

- A department silently absorbing or losing money: the sender still being charged for what it moved, Venture Office billed for it through the own-share invoice, or a moved part missing from the receiver's funding or accrual.
- Funding, accrual and the invoices disagreeing about a department's payroll for the month.
- HR having to type the same Bill to %s every month with no way to carry them over.

## Constraints

- HR owns payroll and splits; Finance never writes HR's rows. New tables are written through HR's actions; Finance reads totals through security-definer functions, as `get_staff_billing_allocation` does.
- Portal text in English (replies to the user are in Chinese).
- Money to the sen. A percentage or a fixed amount of a person's cost is split over the cost items in proportion; rounding leftovers go to the largest line (as `director_hv_share` does).
- Validation: company % + department lines (a fixed amount counted as its share of the cost) ≤ 100% of the person's employer cost; a fixed amount ≤ that cost; no line to the person's own department.
- The migration goes to production before the merge (dry run, then commit with its `schema_migrations` row), LF line endings. The repo's scan tests apply (permission-table-reads / writes, tab-write-guards, report-export-gates, migration-numbers, read-paths).
- `assertPeriodOpen` / the payroll month lock as today.

## The parts

**Data.** A table of a person's department lines per month (staff, period, receiving department, amount or % — exactly one), tied to the payroll row like `hr_staff_allocation` (same foreign key to `hr_monthly_payroll(staff_id, period_month)`, cascades with it). The receiving department's monthly Bill to %: reuse `hr_pool_allocation` (department × company × period, `split_pct` 0–1, unique per department + company + period), which was made for this and never used. Extend the split guard: lines change only while the payroll row is a draft and the month is open; a centralized person may have department lines but no company lines; the receiver must be a department with a pool.

**Funding.** In `payroll_batch_pool_parts`, for each person in the batch with department lines: the sending department's required amount less the moved part, the receiving department's more — the same shape as the `hv` part for directors.

**Accrual.** In `payroll_batch_segment_sums` (and wherever the staff accrual groups by department, `lib/payroll-accrual.ts`): the receiving segment gets the moved part of the person's employer cost, every other figure (basic, allowance, statutory employer and employee, PCB, net) in the same proportion, net balancing the JV — as the directors' share does.

**Billing.** `get_staff_billing_allocation` / the consolidated payroll invoices:
- the sender's company lines stay % of the person's whole cost; the sender's leftover (own share) excludes department lines, so Venture Office is not billed for what moved;
- each receiving cost-center department adds, per company, (what it received this month) × (its Bill to %) to its section, split into the cost items in proportion and merged into that section's existing Salary / Allowance / EPF / SOCSO / EIS lines (Settled B);
- what a receiving department does not bill stays in its pool. It is not added to that department's own-share invoice to Venture Office, even when its `own_share_billback` is on (see my call 5).

**HR's screen.** As the sample, inside today's Allocation page:
- each card gains *+ Department* (pick the department, then *Fixed RM* / *%*); the HV row reads the leftover after companies and departments;
- centralized departments' people are listed, with *+ Department* only, and their leftover row reads "Stays in <department>";
- one "Moved into <department>" card per receiving cost-center department with something moved in that month: who and how much (with the cost items), Bill to rows, the auto "Stays in <department>" row, *+ Company*, *Copy last month's %*, *Save*.

**Elsewhere.** HR › Payroll's *Submit to Finance* preview (CTC by department) shows moved parts under the receiving department. Reports need no change of their own: they read segments and pools, so Director Office's P&L shows less salary and HR's more.

## Left to the builder

Table and column names; where helpers live; the shape of the generate preview's "Stays in" line; how the card list is ordered; tests; the order of the work.

## Settled after the builder check

A. **Department lines lock at the first Submit to Finance.** A Resubmit or Second payroll does not reopen them; only Finance sending the batch back does, as with directors' HV share. Finance can send a batch back only while no funding PV has been raised for it, or after voiding one (`payroll_send_back_batch`). Once the funding PV completes, the money has moved, so that month's move is final. A month already submitted before this is built cannot take a move. (The user asked "如果 finance send back 他们才能改？" — answered yes.)

B. **On a company's payroll invoice, the moved money is merged into the receiving department's own Salary / Allowance / EPF / SOCSO / EIS lines** ("就一起吧"). There are no separate lines and no source department named. The sample's ④ shows it merged.

C. **A change after Finance has billed the month** works as today when HR corrects payroll after the invoices are issued. The reconciliation (对数补差, `billing/actions.ts`) compares what should be billed with what was billed, per company and department:
   - a company now owes more: Finance creates one adjustment invoice per company in the consolidated format;
   - a company now owes less: it is listed in the report only, because consolidated invoices take no credit note, and Finance decides whether to void and reissue.

   By A, a move itself cannot change once the funding has been paid. What can change after billing is HR's Bill to % (my call 6), or more moved-in money from a later batch that month.

D. **Company splits keep today's behaviour.** A Resubmit or Second payroll reopens them, as now ("公司 split 维持现在" → "可以"): HR can correct a wrong % themselves, and Reconcile payroll shows any company over- or under-billed. Only department lines (A) stay locked until Finance sends the batch back.

The user confirmed every point above and each of the calls below as they came up (2026-11-03, "可以了吗？"); this document is the approved design.

## My calls — not decided by the user, to check

1. Percentages are of the person's whole employer cost; a fixed amount is split over the cost items in proportion and may not exceed the cost.
2. One hop: a receiving department's card has company rows only.
3. Venture Office (internal) is not offered as a receiving department; the own-share switch already sends leftovers there.
4. Directors' payroll stays on its own HV-share window.
5. A receiving department's unbilled part always stays in its pool, even when its `own_share_billback` is on.
6. A receiving department's Bill to % stays editable until the payroll month is closed for good. The month's invoices use the % as it stands when Finance generates them. Anything moved in or changed afterwards (a department paid later — Revenue Department closes mid-month — a Second payroll, a changed %) goes out through the existing reconciliation adjustment invoice (对数补差, `billing/actions.ts`), which must therefore count receiving departments' billed amounts too. So money moved in after the invoices were made is never stuck in the department.
9. A top-up batch carries only the difference: a % department line moves the same % of the difference; a fixed RM line's amount does not grow, so the difference stays with the sending department.
7. Centralized departments' people are listed under folded department bands (Revenue Department has 30+ people), opened on a click.
8. *Copy last month* copies department lines and Bill to %s along with company splits.
