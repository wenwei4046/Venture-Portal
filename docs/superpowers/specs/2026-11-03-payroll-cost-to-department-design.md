# Part of a person's payroll cost billed to another department — design

2026-11-03 · asked by Finance (the user) · sample: `2026-11-03-payroll-cost-to-department-sample.html`. Open it in a browser. *Now* / *New*, *Fixed RM* / *%* and *+ Department* respond to clicks; the numbers do not recalculate. Its ④ shows the earlier method A; method B replaces it, see *What it does* 2.

## Why

The user's example is Director Office's Vivian. RM 3,000 of her monthly cost should be borne by HR, and HR then bills that RM 3,000 to the companies by percentages HR chooses.

The user: "可能往后也会别的 department bill 去别的 department, 所以要确定". So it must work between any two departments, not only Director Office → HR.

What exists today:
- A person's monthly employer cost can only be split by % to companies (HR Costing › Allocation, `hr_staff_allocation`). Whatever is left is HOUZS Venture's own share, billed to Venture Office when the department's bill-back is on.
- Nothing lets a department carry part of someone else's pay.
- Nothing sets percentages per department. The January table `hr_pool_allocation` (department × company × % per month) was never used: 0 rows, no screen (verified 2026-11-03).

## What it does — decided by the user

1. **A person's split can send part of the cost to another department.**
   - On HR Costing › Allocation, beside the company lines, *+ Department* adds a line. HR picks the department, then *Fixed RM* or *%*. The box appears only after the choice.
   - Both are allowed: "可以是固定，可以是 percentage".
   - The part moved covers every cost item the split covers today: salary, allowance, EPF, SOCSO and EIS employer ("包括她的 epf socso, allowance 等等都要 bill 去 hr").

2. **The move is billed: an automatic internal invoice. This is method B.**
   - The user: "我说的意思是example 从director office split 薪水去hr, 也要开一张bill" and "这就是我说的转过去要开单". They were shown two methods:
     - A: the part is the receiver's own cost from the start, with no invoice;
     - B: an internal invoice, as the one to Venture Office.
     They answered "对，我决定还是要方法b".
   - **Payroll itself is unchanged.** The person's pay stays in their own department's accrual JV and funding.
   - **The invoice.** When Finance generates the month's payroll invoices, the system also makes one internal invoice per receiving department. In it, the sending departments bill the receiver for what moved, by sender and cost item: Salary, Allowance, EPF, SOCSO and EIS.
   - **Its issue and settlement** are those of the own-share invoice to Venture Office:
     - Issued, the sender recovers (Dr 3030 / Cr 5020, in the sender's segment). The receiver bears it (Dr *Inter-billing – <receiver>* / Cr 3030, in the receiver's segment).
     - It is settled by netting: the sender's pool `np_in` +, the receiver's pool `inter_billing_out` −, and no money leaves a bank.
   - **On the reports**, the sender shows an inter-billing recovery and the receiver an inter-billing cost.

3. **Every month HR decides where a receiving department's money goes** ("每月 HR 自己定").
   - Each receiving **cost-center** department gets a card. It lists who moved how much into it this month, and lets HR set Bill to rows: company and %.
   - The billed amounts join that department's section of each company's consolidated payroll invoice. They are merged into its own Salary / Allowance / EPF / SOCSO / EIS lines, in proportion to what was moved ("就一起吧").

4. **What is not billed stays with the receiving department** ("也有可能是 hr pool 要承担" → confirmed).
   - HR may set no % at all.
   - Invoice generation is not blocked; Finance's generate preview shows "Stays in <department>: RM x".

5. **A centralized receiving department bears it all.** Director, Marketing and Revenue Department (today) bill the companies with their own invoices. So there is no % card for them: what they receive is simply their cost.

6. **Who can send cost out: everyone on HR's payroll, by the department's mode.** The mode is `departments.cost_model`, set in Settings › Departments and switched by the Principal.
   - A cost-center person (HR, Finance, IT and Director Office today) may have company lines and department lines.
   - A centralized person (Marketing and Revenue Department today) may have department lines only, no company % ("让他们也能吧" → "只能转给别的部门，不能直接分给公司" → "可以").

7. **Department lines follow the company split's rules.**
   - They change while the person's payroll row is a draft (`guard_staff_allocation_follows_payroll`, `splitLock`).
   - A Resubmit or Second payroll reopens them. Finance's Send back is not needed ("不是说不用 send back 吗？她 resubmit 就行？", answered by method B).
   - Payroll's money does not move with them, so nothing needs undoing; only invoices change, see 8.

8. **A change after Finance has billed the month** goes through the reconciliation, as today when HR corrects payroll after the invoices are issued (对数补差, `billing/actions.ts`).
   - Companies:
     - a company now owes more: Finance creates one adjustment invoice per company in the consolidated format;
     - a company now owes less: it is listed only, because consolidated invoices take no credit note, and Finance decides.
   - Internal invoices, the same way:
     - a receiver now owes more (a pay rise under a % line, or a bigger line): an adjustment internal invoice;
     - a receiver now owes less (Vivian's RM 3,000 changed to RM 2,000): it is listed, and Finance voids that internal invoice and generates it again. Nothing outside the group is involved.
   - Company splits keep today's behaviour ("公司 split 维持现在" → "可以").

## Goals

- **Any two departments.** Any department → any other department with a pool, without code changes when departments are added or switch mode. IT and Revenue Department are registry departments, so never a literal list.
- **Every sen lands in one place.** Every sen of a person's cost is billed to exactly one place: a company, a department through the internal invoice, or the leftover. The leftover is HOUZS Venture's own share for a cost center, or the person's own pool for a centralized department.
- **Everything ties.** Company invoices, internal invoices and own-share invoices tie to the payroll's cost per department.

## Non-goals

- Payroll funding and the payroll accrual JVs do not change.
- No names or individual pay on any invoice, company or internal, or on Finance's billing pages. HR's Allocation page shows who moved what, as it shows pay today.
- Money received by a department is not moved on to a third department: one hop.
- Not the directors' payroll (`director_monthly_payroll`). HOUZS Venture's share of it already splits to departments (`director_hv_share`).
- Not the Billing Allocator, and not rent or utility splits.

## Anti-goals (would make it a failure even if it runs)

- A department silently absorbing or losing money, for example:
  - the sender billing the moved part again through its own-share invoice to Venture Office;
  - the receiver's unbilled part added to its own own-share invoice;
  - a receiver billing companies for money no internal invoice charged it.
- The internal invoice and the department lines disagreeing after the reconciliation.
- HR having to type the same Bill to %s every month with no way to carry them over.

## Constraints

- **HR's data.** HR owns payroll and splits; Finance never writes HR's rows. New tables are written through HR's actions. Finance reads totals through security-definer functions, as `get_staff_billing_allocation` does.
- **Language.** Portal text in English; replies to the user in Chinese.
- **Money.**
  - To the sen.
  - A percentage is of the person's whole employer cost.
  - A fixed amount is split over the cost items in proportion and never exceeds the cost.
  - Rounding is taken by the salary line, as the billing RPC does today.
- **Validation.** Company % + department lines (a fixed amount counted as its share of the cost) ≤ 100% of the person's employer cost. No line goes to the person's own department, to Venture Office (internal), or to a department without a pool.
- **Accounts.** Each receiving department needs an expense account named *Inter-billing – <department>*. The issue step finds it by name; without one it skips the expense JE. 9051–9056 and 9001 exist; IT has none, so the migration adds it.
- **Migration.** It goes to production before the merge: a dry run, then commit with its `schema_migrations` row. LF line endings. The repo's scan tests apply: permission-table-reads / writes, tab-write-guards, write-pages, report-export-gates, migration-numbers, read-paths.

## The parts

**Data.**
- A table of a person's department lines per month: staff, period, receiving department, and an amount or a %, exactly one of the two. It is tied to the payroll row like `hr_staff_allocation`, with the same foreign key and cascade.
- Its guard mirrors the split guard: a draft row only, an open month, and the person on payroll. It differs in two ways: it allows a centralized person, and it refuses an invalid receiver.
- The receivers' monthly Bill to % reuses `hr_pool_allocation`. It gains a delete path and a guard that refuses centralized departments and closed months.

**Billing (SQL).**
- `get_staff_billing_allocation`:
  - the sender's company rows stay a % of the whole cost;
  - the sender's HV (own-share) row excludes the moved parts;
  - each cost-center receiver's company rows add (what moved into it) × (its Bill to %), merged by company.
- `get_staff_own_share_allocation`: the sender's leftover excludes the moved parts.
- New: what moved this month per sending × receiving department, by cost item. This is the internal invoices' source.
- New: per receiver, what moved in, what its Bill to % bills, and what stays. This is the preview's "Stays in".

**Internal invoices.**
- They are generated with the month's payroll invoices: one draft per receiver, `billing_mode payroll_consolidated`, `billable_to_type dept_pool`, lines per sending department's segment and cost item, no names.
- Issue, settlement by netting and void are the own-share invoice's paths, generalized from Venture Office to any receiving department.
- The reconciliation covers them.

**Finance's screen.** The Payroll invoices dialog's preview shows the companies' invoices as today, then the internal invoices (*Director Office → HR · RM 3,000*), then any "Stays in <department>". The payroll basis reads a receiver's moved-in money as part of what it must bill.

**HR's screen.** As the sample, inside today's Allocation page:
- each card gains *+ Department* (pick the department, then *Fixed RM* / *%*); the HV row reads the leftover after companies and departments;
- centralized departments' people are listed with *+ Department* only, their leftover row reading "Stays in <department>";
- one "Moved into <department>" card per receiving cost-center department with something moved in that month. It shows who and how much (with the cost items), Bill to rows, the auto "Stays in <department>" row, *+ Company*, *Copy last month's %* and *Save*.

**Elsewhere.** Payroll's *Submit to Finance*, funding and accrual are unchanged.

## Left to the builder

Table and column names; where helpers live; the preview's exact layout; the internal invoice lines' words; how the card list is ordered; tests; the order of the work.

## Settled after the builder check

A. **Locks**: superseded by method B. Department lines follow the company split (*What it does* 7).

B. **On a company's payroll invoice, the moved money is merged into the receiving department's own Salary / Allowance / EPF / SOCSO / EIS lines** ("就一起吧"). There are no separate lines and no source department named.

C. **Changes after billing** are covered by *What it does* 8.

D. **Company splits keep today's behaviour.** A Resubmit or Second payroll reopens them, as now ("公司 split 维持现在" → "可以").

E. **Method B** ("对，我决定还是要方法b", 2026-11-03). It replaces the earlier no-invoice design (A), in which the moved part was the receiver's cost in funding and accrual and locked at the first Submit to Finance.

The user confirmed every point above and each of the calls below as they came up (2026-11-03). This document is the approved design.

## My calls — not decided by the user, to check

1. Percentages are of the person's whole employer cost. A fixed amount is split over the cost items in proportion and may not exceed the cost.
2. One hop: a receiving department's card has company rows only.
3. Venture Office (internal) is not offered as a receiving department; the own-share switch already sends leftovers there.
4. Directors' payroll stays on its own HV-share window.
5. A receiving department's unbilled part always stays in its pool, even when its `own_share_billback` is on.
6. A receiving department's Bill to % stays editable until the payroll month is closed for good. The month's invoices use the % as it stands when Finance generates them; later changes go through the reconciliation.
7. Centralized departments' people are listed under folded department bands (Revenue Department has 30+ people), opened on a click.
8. *Copy last month* copies department lines and Bill to %s along with company splits.
9. One internal invoice per receiving department per month. Its lines are grouped by sending department and cost item, with no names. It is settled by netting, like the own-share invoice.
10. A department without an *Inter-billing – <department>* expense account gets one (IT today), added in the migration.
11. Internal invoices are drafts generated with the month's payroll invoices by the same Generate. A receiver that owes less after a change has its internal invoice voided and generated again.
