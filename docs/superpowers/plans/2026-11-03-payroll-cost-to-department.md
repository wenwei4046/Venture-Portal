# Payroll cost billed to another department (method B) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On HR Costing › Allocation a person's monthly employer cost can send a fixed RM or a % to another department. When Finance generates the month's payroll invoices, the system also bills each receiving department for what moved, through an automatic internal invoice. A cost-center receiver's monthly Bill to % then sends that money on to the companies.

**Architecture:**
- Payroll funding and accrual are untouched.
- One migration adds:
  - the person's department lines (`hr_staff_dept_moves`, the company split's lock rules);
  - reuse of `hr_pool_allocation` for the receivers' monthly Bill to %;
  - the missing *Inter-billing – IT* account;
  - changes to the two billing RPCs, and two new RPCs: moves by sender × receiver, and a per-receiver summary.
- TypeScript generalizes the own-share invoice's generate / issue / settle / void paths, from Venture Office to any receiving department. It extends the reconciliation to these internal invoices, and adds the Allocation page's department lines and receiver cards.

**Tech Stack:** Next.js 16 (App Router, server actions), TypeScript, Supabase Postgres (plpgsql, RLS, SECURITY DEFINER RPCs), Vitest + Testing Library (happy-dom), PGlite SQL tests (`tests/member-sql/*.mjs`).

**Spec:** `docs/superpowers/specs/2026-11-03-payroll-cost-to-department-design.md` (method B, approved 2026-11-03), sample `…-sample.html`.

## Global Constraints

- **Language:** portal text in English. Comments quote the user in Chinese with the date, as the codebase does.
- **Money:**
  - to the sen;
  - a % is of the person's whole employer cost (`gross + epf_er + socso_er + eis_er`);
  - a moved part is split over salary / allowance / EPF / SOCSO / EIS in proportion, and salary absorbs the rounding;
  - a fixed amount never exceeds the cost.
- **Locks:** department lines follow the company split's rules. They change only while the payroll row is a draft; Resubmit / Second payroll reopen them. Payroll's funding and accrual never change.
- **Departments:**
  - A centralized person (`departments.cost_model = 'centralized'`) may have department lines, never company lines.
  - A centralized receiver has no Bill to %.
  - Venture Office (`is_internal`) and departments without `segment_key` are never receivers. Nobody moves cost to their own department.
  - Departments come from the registry, never a literal list.
- **Who sees what:**
  - HR (`hr_costing.create` / `.edit`) writes moves and Bill to %.
  - Finance reads totals only, through SECURITY DEFINER RPCs.
  - No names on any invoice.
- **Database rules:**
  - New or altered policies use `has_scope` / `has_perm`, never `current_user_role()`.
  - Every new table registers `permission_table_reads` / `permission_table_writes` rows, mirrored in `src/lib/permission-table-{reads,writes}.ts`, plus `audit_register`.
  - Every new RPC goes in `src/test/read-paths.ts` and the RPC lists in `src/lib/supabase/read-only.ts` and `tests/member-sql/validate-reach.mjs`.
  - A replaced billing RPC body carries production's guard: the `has_any_action` swap of `20261009040000` L205–210.
- **Migration:**
  - one file, a free 14-digit number (`src/lib/migration-numbers.test.ts`), LF;
  - applied to production **before** the merge, only on the user's word: dry-run in BEGIN … ROLLBACK, then commit plus the `schema_migrations` row.
- **Records:** DESIGN.md gets a Part IV entry (next free version). Rules go in `.claude/rules/hr/` (Allocation) and `.claude/rules/finance/finance-view.md` (Payroll invoices). HANDOFF gets a checkpoint after the merge.

## Review Focus

1. **A change after the internal invoice was issued, or settled by netting.**
   - Vivian's RM 3,000 lowered to RM 2,000: the reconciliation lists the receiver as owing less, and Finance voids and regenerates the internal invoice. A settled one is voided through the receipt void, which reverses the netting in both pools.
   - A % line under a pay rise: the receiver owes more, and the reconciliation drafts an adjustment internal invoice.
2. **Regenerating the month's payroll invoices.**
   - `generateConsolidatedPayrollInvoices` today deletes every draft `payroll_consolidated` invoice of the period (`billing/actions.ts` L1826–1836), including the own-share and adjustment drafts.
   - Each generate must delete only its own kind's drafts: subsidiary, internal, own-share and adjustment.
3. **A receiver whose only company rows come from moved-in money.**
   - The billing RPC's `WHERE EXISTS (company_agg)` filter must not drop them.
   - Moved-in money must never feed the receiver's HV / own-share row.
4. **The payer side for every department.**
   - The issue step finds *Inter-billing – <receiver>* by name for HR, Finance, Director Office, Marketing, Revenue Department, Director and the new IT account.
   - Settlement nets to zero across pools.
   - A centralized sender (a Marketing person moving cost to Finance) recovers into its own pool.
5. **The sender's leftover and the receiver's leftover.**
   - The sender's own-share invoice to Venture Office excludes what moved.
   - The receiver's unbilled moved-in money is in no invoice and shows as "Stays in <dept>".
   - All billed amounts over all departments equal the payroll's cost for the month.

---

### Task 1: Department lines, the receivers' Bill to %, and the IT account

**Files:**
- Create: `supabase/migrations/<free 14-digit>_payroll_cost_moves.sql` (sections 1–3; Task 2 adds its sections)
- Create: `tests/member-sql/validate-payroll-cost-moves.mjs` (model on `tests/member-sql/validate-director-hv-share.mjs`: PGlite, migrations run verbatim over production's md5-checked bodies)
- Modify: `src/lib/permission-table-reads.ts`, `src/lib/permission-table-writes.ts`, `src/lib/supabase/database.types.ts`

**Interfaces:**
- Produces the table `hr_staff_dept_moves`:
  - `id uuid PK`, `staff_id uuid`, `period_month date` (1st);
  - `department_id uuid` (FK `departments`, the receiver);
  - `amount numeric(15,2) NULL`, `pct numeric(7,6) NULL` — exactly one is set, `amount > 0`, `0 < pct ≤ 1`;
  - `created_by uuid NOT NULL`, `created_at timestamptz`;
  - FK `(staff_id, period_month)` → `hr_monthly_payroll` ON UPDATE CASCADE ON DELETE CASCADE;
  - `UNIQUE (staff_id, period_month, department_id)`.
- Produces `guard_staff_dept_moves()`, a BEFORE INSERT / UPDATE / DELETE trigger, SECURITY DEFINER. It mirrors `guard_staff_allocation_follows_payroll` (`20260930050000` L81–162): the payroll functions pass, the person must be on payroll, the month must not be closed for good, and the row must be draft. It differs as follows:
  - it allows a centralized person;
  - it refuses a receiver that is the person's own department, internal, or without `segment_key`.
  - Refusals use ERRCODE `23PAY` and `splitLockMessage`'s words.
- Changes `hr_pool_allocation`:
  - a DELETE policy (`has_scope(ARRAY['hr'])`) replacing `no_delete USING(FALSE)`, plus a DELETE registry row;
  - the read registry gains `hr_costing.view:own`;
  - `guard_pool_allocation()` refuses a centralized, internal or pool-less department and a month closed for good;
  - a new table comment.
- Adds the account *Inter-billing - IT* (expense, parent `9050`, next free code in the 905x range), and the same for any registry department with a pool and no such account.

- [ ] **Step 1: Write the failing SQL tests.**
  - `a line takes amount or pct, not both, not neither`.
  - `a draft row's line saves; a completed or submitted row's line is refused with the split's words`.
  - `Resubmit (payroll_open_topup) puts the row back to draft and the line can change again`.
  - `a centralized person's line saves; their company split is still refused`.
  - `no line to the person's own department, to Venture Office, or to a department with no segment`.
  - `hr_pool_allocation: HR deletes and re-inserts a receiver's month; a centralized department's row is refused; a month closed for good refuses`.
  - `every department with a pool has an "Inter-billing - <name>" expense account`.
- [ ] **Step 2: Run** `node tests/member-sql/validate-payroll-cost-moves.mjs`. Expected: FAIL.
- [ ] **Step 3: Write sections 1–3** (copy the RLS, grants, audit and registry format from `20261030020000_fabric_upgrades.sql` L92–147).
- [ ] **Step 4: Mirror the registries; regenerate the types.**
- [ ] **Step 5: Run** the SQL test and `npx vitest run src/lib/permission-table-reads.test.ts src/lib/permission-table-writes.test.ts src/lib/migration-numbers.test.ts src/lib/audit`. Expected: PASS.
- [ ] **Step 6: Commit.**

### Task 2: Billing RPCs — the sender less what moved, receivers billing on, moves by department

**Files:**
- Modify: the migration (section 4: `get_staff_billing_allocation`, `get_staff_own_share_allocation` whole from `20261005100000` with production's guard; section 5: new `get_staff_dept_moves_allocation`, `get_payroll_moves_summary`)
- Modify: `src/test/read-paths.ts`, `src/lib/supabase/read-only.ts`, `tests/member-sql/validate-reach.mjs`, `src/lib/supabase/database.types.ts`
- Test: the SQL test

**Interfaces:**
- **Moved part per person, per receiver, per cost item:**
  - `pct`: `round(item × pct, 2)`;
  - `amount`: the cost items × `amount / cost`;
  - salary takes the rounding, so the items add up to `round(cost × pct, 2)` or to `amount`.
- `get_staff_billing_allocation(p_period_month)`: same return shape.
  - The sender's `dept_tot`, and so its HV row, is less the moved parts. Its company rows stay a % of the whole cost.
  - Each cost-center receiver adds `moved_in` per item × `hr_pool_allocation.split_pct`, folded into its department × company rows (UNION, then GROUP BY). Salary absorbs the rounding.
  - Moved-in money is not in the receiver's `dept_tot` or HV row.
  - `WHERE EXISTS` counts moved-in company rows.
- `get_staff_own_share_allocation(p_period_month)`: the sender's leftover is less the moved parts. Nothing is added for receivers.
- New `get_staff_dept_moves_allocation(p_period_month)` → rows of:
  - `(from_department_id, from_department_name, to_department_id, to_department_name, staff_count, amount, salary_amount, allowance_amount, epf_amount, socso_amount, eis_amount)`;
  - SECURITY DEFINER, gate `has_any_action(ARRAY['billing.view','hr_costing.view'])`, REVOKE from PUBLIC and anon;
  - submitted or paid rows only, like the billing RPC.
- New `get_payroll_moves_summary(p_period_month)` → `(department_id, department_name, cost_model, moved_in, billed, stays)`, with the same gate. `billed` is 0 for a centralized receiver.

- [ ] **Step 1: Write the failing SQL tests.**
  - `Vivian (Director Office, 6,000; 2990 25% / CAR 25% / HR RM 3,000): Director Office reads 2990 1,500, CAR 1,500, no HV row`.
  - `moves allocation: Director Office → HR 3,000 split 2,450 / 150 / 338 / 52.05 / 9.95`.
  - `HR's Bill to 2990 30% / CAR 30% / CONTS 20%: HR's rows grow by 900 / 900 / 600, merged with HR's own staff rows; HR's HV row unchanged`.
  - `no Bill to %: HR's rows unchanged; the summary says moved_in 3,000, billed 0, stays 3,000`.
  - `a centralized receiver's Bill to % rows are ignored; its summary billed 0`.
  - `own share: Director Office's leftover excludes the 3,000; HR's is unchanged`.
  - `a receiver with no staff split of its own still gets its moved-in company rows`.
  - `the cost items of every row add up to its amount`.
  - `over all departments, companies + moves + HV equal the payroll's cost`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** sections 4–5. Register the RPCs.
- [ ] **Step 4: Run** the SQL test, `npx vitest run src/lib/permission-table-reads.test.ts src/lib/tab-write-guards.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 3: Internal invoices — generate with the payroll invoices; issue, settle and void for any receiver

**Files:**
- Modify: `src/app/(portal)/billing/actions.ts`:
  - `PAYROLL_DEPT_TO_SEGMENT` → the registry's `deptNameToSegment` (`lib/billing.ts` L157–172);
  - the generate clean-up at L1826–1836;
  - new `generateDeptMoveInvoices`;
  - the own-share paths at L2174–2356, generalized;
  - issue at `approveInvoice` / `approveInvoicesForPeriod` L2358+, L2493–2544, L2565+, L2689–2728.
- Modify: `src/app/(portal)/payments/actions.ts` (the consolidated settle by netting, and the Venture-Office overlay guard), and the receipt void (`voidPaidReceipt`, `reverse_voucher_pool_rows`) only if a test shows it is needed.
- Modify: `src/app/(portal)/statements/invoice-actions.ts` (`hubGeneratePayrollInvoices` also makes the internal invoices; `hubPayrollPreview` returns them)
- Test: `src/app/(portal)/billing/*.test.ts` (with `recordingSupabase`), `src/app/(portal)/payments/*.test.ts` for the settle

**Interfaces:**
- Consumes: `get_staff_dept_moves_allocation` (Task 2), `buildConsolidatedInvoiceLines` (`lib/staff-allocation.ts` L393).
- `generateDeptMoveInvoices(periodMonth: string, categoryCode: string): Promise<{ generated: number; receivers: string[] }>`:
  - One DRAFT per receiving department: `billing_mode 'payroll_consolidated'`, `billable_to_type 'dept_pool'`, the receiver's department as payer.
  - Lines per sending department's segment and cost item (`"<Item> - <Mon'yy>"`, segment = sender's), each line's category = the chosen payroll category.
  - A marker in `reference_no` (for example `DPM-YYYYMM`) so its own drafts, and only those, are replaced on a second generate.
- `generateConsolidatedPayrollInvoices`: deletes only `billable_to_type = 'subsidiary'` drafts that are not adjustments. It calls `generateDeptMoveInvoices` after the companies' invoices.
- **Issue** (`payroll_consolidated` + `dept_pool`):
  - per sender segment Dr 3030 / Cr 5020 (recovery), segment forced, as today for the own-share invoice;
  - the payer's expense Dr *Inter-billing – <payer>* / Cr 3030 in the **payer's** segment (Venture Office keeps `corporate`).
- **Settle** by netting: each sender's pool `np_in` +slice; the payer's pool `inter_billing_out` −total; no bank JE. The Venture-Office overlay fires only when Venture Office is the payer.
- **Void:** the existing receipt void reverses both pools and the GL.

- [ ] **Step 1: Write the failing tests.**
  - `generate makes one internal draft per receiver: Director Office → HR 3,000 with five lines on segment director_office`.
  - `a second generate replaces only the internal drafts; the own-share and adjustment drafts stay`.
  - `the companies' generate no longer deletes the own-share draft`.
  - `issue posts Dr 3030 / Cr 5020 on director_office and Dr 9053 (Inter-billing - HR) / Cr 3030 on hr; 3030 nets 0`.
  - `issue for IT as payer finds the new Inter-billing - IT account`.
  - `settle by netting: Director Office np_in +3,000, HR inter_billing_out −3,000, no bank JE; the Venture-Office overlay does not fire`.
  - `a Marketing → Finance move settles into Marketing's pool`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the files and `npx vitest run src/lib/write-pages.test.ts src/lib/report-export-gates.test.ts src/lib/permission-table-writes.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 4: The reconciliation covers internal invoices

**Files:**
- Modify: `src/app/(portal)/billing/actions.ts` (`loadPayrollBillingDeltas` L1918–1992, `fetchPayrollBillingDelta`, `generatePayrollAdjustmentInvoices` L2007–2146), `src/lib/payroll-billing-delta.ts`
- Modify: `src/app/(portal)/statements/_components/GenerateDialogs.tsx` (`ReconcileDialog` L271–370: a section for departments)
- Test: `src/lib/payroll-billing-delta.test.ts`, `GenerateDialogs.test.tsx`

**Interfaces:**
- What a receiver should be billed comes from `get_staff_dept_moves_allocation`, by sender segment and item. What it was billed comes from its issued, paid or paid-via-netting internal invoices, marker included.
- The delta is per receiver, per sender segment, per item, through the same `computeBillingDeltas`.
- **Under-billed:** one adjustment internal invoice per receiver (marker `· adjustment`).
- **Over-billed:** listed with "Void the internal invoice and generate again".

- [ ] **Step 1: Write the failing tests.**
  - `Vivian's line raised by a 40% pay rise: HR under-billed 200 → one adjustment draft to HR`.
  - `3,000 lowered to 2,000 after issue: HR over-billed 1,000, listed, no draft`.
  - `companies' deltas unchanged by internal invoices`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 5: Split rules and previews in TypeScript

**Files:**
- Modify: `src/lib/staff-allocation.ts`
- Test: `src/lib/staff-allocation.test.ts`

**Interfaces:**
- Produces:
  - `export interface DeptMoveRow { departmentId: string; kind: 'amount' | 'pct'; value: number }` (`value` in RM, or 0–100 for pct, as typed).
  - `validateDeptMoves(employerCost: number, companies: AllocationRow[], moves: DeptMoveRow[], ownDepartmentId: string, centralized: boolean)` → `{ ok: true } | { ok: false; error: string }`.
  - `movePreview(employerCost, companies, moves)` → `{ companies: Line[]; moves: Array<{ departmentId; amount; pct }>; hvAmount; billedTotal; movedTotal }`.
  - `billToPreview(received: number, rows: AllocationRow[])` → `{ lines; stays }`.
- **Validation rules:**
  - one line per department;
  - not the person's own department;
  - a value > 0;
  - pct ≤ 100;
  - companies % + moves (as % of the cost) ≤ 100;
  - a fixed amount ≤ the cost;
  - a centralized person's company rows are refused.

- [ ] **Step 1: Write the failing tests.**
  - `Vivian RM 3,000 of 6,000 with 2990 25% / CAR 25% leaves HV 0`.
  - `40% leaves HV 10% = 600`.
  - `a fixed amount over the cost is refused`.
  - `own department refused`.
  - `centralized: companies refused, departments allowed`.
  - `billToPreview(3,000, 30/30/20) → 900/900/600, stays 600`.
  - `lines + stays = received to the sen`.
- [ ] **Step 2: Run** `npx vitest run src/lib/staff-allocation.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 6: Allocation actions — save lines with the split; receivers' Bill to %; copy last month

**Files:**
- Modify: `src/app/(portal)/hr-costing/allocation/actions.ts`
- Test: `src/app/(portal)/hr-costing/allocation/actions.test.ts` (new; mock style from `payments/requests/actions.test.ts` with `recordingSupabase`)

**Interfaces:**
- `saveStaffAllocation(staffId, periodMonth, rows, moves: DeptMoveRow[] = [])` → `SaveSplitResult`.
  - It validates both.
  - It replaces `hr_staff_allocation` rows (skipped for a centralized person) and `hr_staff_dept_moves` rows (delete, then insert).
  - Database refusals are returned as words.
- `saveDeptBillTo(departmentId: string, periodMonth: string, rows: AllocationRow[])` → `SaveSplitResult`.
  - Gate: `requireActionOn('/hr-costing/allocation', 'hr_costing', 'edit')`, then `assertPeriodOpen`.
  - A centralized department is refused in words.
  - It replaces that department's `hr_pool_allocation` rows for the month.
- `copyAllocationsFromLastMonth(periodMonth)` also copies:
  - last month's department lines, for draft rows that have none;
  - the receivers' Bill to %, for receivers with none this month.
  - The result gains `copiedMoves` and `copiedBillTo`, and `splitCopyNote` says them.

- [ ] **Step 1: Write the failing tests.**
  - `saves companies and moves together`.
  - `a centralized person saves moves only`.
  - `a refusal comes back as words`.
  - `saveDeptBillTo replaces a month`.
  - `saveDeptBillTo refuses a centralized department`.
  - `copy brings last month's moves and Bill to % only where none exist`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests and `npx vitest run src/lib/write-pages.test.ts src/lib/permission-table-writes.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 7: Allocation page and editor — + Department, centralized bands, "Moved into" cards

**Files:**
- Modify: `src/app/(portal)/hr-costing/allocation/[period]/page.tsx`, `_components/AllocationEditor.tsx`, `_components/CopyAllocationsButton.tsx`
- Create: `src/app/(portal)/hr-costing/allocation/_components/MovedIntoCard.tsx`
- Test: `AllocationEditor.test.tsx`, new `MovedIntoCard.test.tsx`

**Interfaces:**
- **What the page loads:**
  - `department_modes()` for ids, names, `cost_model`, `is_internal` and `segment_key`;
  - `hr_staff_dept_moves` for the month;
  - `hr_pool_allocation` for the month;
  - each person's department id.
- `StaffAllocationData` gains `departmentId` and `moves: DeptMoveRow[]`.
- `MovedIntoCard` props: `{ period, department: { id; name }, incoming: Array<{ name; fromDept; amount; parts: { salary; allowance; epf; socso; eis } }>, billTo: AllocationRow[], companies, readOnly, locked }`.
- **Rendering**, as the sample ①–③:
  - *+ Department* adds a row. Its select excludes the person's own department, internal departments and those without a pool. *Fixed RM* / *%* is unpicked until chosen, and the box appears after the choice.
  - The HV row reads the leftover after companies and moves, or "Stays in <dept>" for a centralized person.
  - Centralized people appear under folded department bands (`Marketing · 12 people`) with *+ Department* only.
  - One `MovedIntoCard` per receiving cost-center department with moves this month. Its auto row reads "Stays in <dept>". It has *+ Company*, *Copy last month's %* and *Save*.
  - Locks are the split's (`splitLock`).
- **UI rules:** English. Follow the dashboard-design skill and its style guide. Use the page's own kit: the Tailwind classes, `chip`, and `Select` from `@/components/hrv/select`. Numbers right-aligned and tabular. No horizontal scroll at phone width.

- [ ] **Step 1: Write the failing tests** (role-based, as `AllocationEditor.test.tsx`).
  - `+ Department adds a row whose box shows only after Fixed RM or % is picked`.
  - `the department list leaves out the person's own department, Venture Office and pool-less departments`.
  - `HV reads 0.00% for Vivian 25/25 + RM 3,000`.
  - `a centralized person shows + Department only; leftover "Stays in Marketing"`.
  - `a submitted person's lines are locked with the split's words; after Resubmit they open`.
  - `MovedIntoCard lists incoming and its Bill to rows; "Stays in HR" is the remainder`.
  - `Save calls saveDeptBillTo`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Visual check** with the real-component Vite harness (memory `visual-check-headless-chrome`): 1280px and phone width, transitions off. Screenshot for the user. Delete `zz-harness/` before committing.
- [ ] **Step 6: Commit.**

### Task 8: Finance's Payroll invoices dialog, and the payroll basis

**Files:**
- Modify: `src/app/(portal)/billing/actions.ts` (`fetchConsolidatedPayrollPreview` → `{ companies, internal, staysIn }`), `src/app/(portal)/statements/invoice-actions.ts` (`hubPayrollPreview`), `src/app/(portal)/statements/_components/GenerateDialogs.tsx`:
  - `PayrollInvoicesDialog`: internal invoices after the companies, then "Stays in", including the empty state;
  - `OwnShareDialog`: its hint at L465 says moved parts are billed to the receiving department, not Venture Office.
- Modify: `src/app/(portal)/statements/_lib/invoice-hub.ts` L96–101 and L272–320, `src/lib/billing-sheet.ts` L89–125. The payroll basis counts a receiver's moved-in money as part of what it must bill, and the internal invoice lines as the sender's billed.
- Test: `GenerateDialogs.test.tsx` L140–175, and the invoice-hub and billing-sheet tests

**Interfaces:**
- `PayrollInvoicesDialog` lists:
  - the companies, as today;
  - `Director Office → HR · RM 3,000.00` per internal invoice;
  - `Stays in HR · RM 600.00` for each receiver with `stays > 0`.

- [ ] **Step 1: Write the failing tests.**
  - `the preview lists the internal invoice and "Stays in HR · RM 600" with HR's Bill to at 80%`.
  - `the empty state still shows an internal invoice when no company is billed`.
  - `the payroll basis reads Director Office fully billed and HR's required including 3,000`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the files and `npx vitest run src/lib/report-export-gates.test.ts src/lib/permission-table-reads.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 9: Records, the full check, the PR, production

- [ ] **Step 1: Write the records:** DESIGN.md Part IV entry plus a line in HR Costing's section; `.claude/rules/hr/` (Allocation) and `.claude/rules/finance/finance-view.md` (Payroll invoices). Quote the user's decisions from the spec.
- [ ] **Step 2: Run the full check.**
  - `npx eslint` on the changed files;
  - `npx tsc --noEmit` (judge only our files; known local failures are `MemberWorkspace.principal.test.tsx`, `commission/*.test.ts` and `supabase/read-only.test.ts` on stale `node_modules`);
  - `npx vitest run` in the background. Known local-only failures: `erp-sync/catalogue` and `crm/palette` (CRLF); long scans time out under the full run and pass alone;
  - every `tests/member-sql/validate-*.mjs` touching payroll or billing.
- [ ] **Step 3: Commit, push, open the PR**, with the user's quotes, the tests and the migration's name.
- [ ] **Step 4: Production.** Before any merge, and only on the user's word: dry-run the migration on production in BEGIN … ROLLBACK, then apply it with its `schema_migrations` row. Re-check against production's data:
  - `get_payroll_moves_summary` for October returns no rows;
  - `get_staff_billing_allocation` for October equals its value before the migration, to the sen;
  - every department with a pool has its inter-billing account.
- [ ] **Step 5: Merge** on the user's word, read the deploy once, and write the HANDOFF checkpoint.
