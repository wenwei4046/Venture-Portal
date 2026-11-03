# Payroll cost moved to another department — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On HR Costing › Allocation a person's monthly employer cost can send a fixed RM or a % to another department. That part becomes the receiving department's own cost in funding, accrual and billing. A cost-center receiver's monthly Bill to % sends it on to the companies.

**Architecture:**
- One migration adds:
  - the person's department lines (`hr_staff_dept_moves`), locked by the first batch that carries them;
  - reuse of `hr_pool_allocation` for the receivers' monthly Bill to %;
  - SQL changes to the batch's funding parts (`payroll_batch_pool_parts`), the accrual sums (`payroll_batch_segment_sums`, `payroll_batch_commission_split`) and the billing RPCs (`get_staff_billing_allocation`, `get_staff_own_share_allocation`), all following the directors' HV-share pattern (`20261013233000`).
- TypeScript adds:
  - department lines and receiver cards to the Allocation page;
  - moves to the Submit to Finance preview;
  - a "Stays in" line to the Payroll invoices dialog;
  - moves to the payroll-basis and Marketing P&L reads.

**Tech Stack:** Next.js 16 (App Router, server actions), TypeScript, Supabase Postgres (plpgsql, RLS, SECURITY DEFINER RPCs), Vitest + Testing Library (happy-dom), PGlite SQL tests (`tests/member-sql/*.mjs`).

**Spec:** `docs/superpowers/specs/2026-11-03-payroll-cost-to-department-design.md` (approved 2026-11-03), sample `…-sample.html`.

## Global Constraints

- **Language:** portal text in English. Comments quote the user in Chinese with the date, as the codebase does.
- **Money:**
  - to the sen;
  - a % is of the person's whole employer cost (`gross + epf_er + socso_er + eis_er`);
  - a moved part is split over salary / allowance / EPF / SOCSO / EIS in proportion, and salary absorbs the rounding;
  - a fixed amount never exceeds the cost.
- **Locks:**
  - Department lines lock at the first Submit to Finance. Only Finance's Send back of **that** batch reopens them. Resubmit and Second payroll do not.
  - Company splits keep today's rules.
- **Departments:**
  - A centralized person (`departments.cost_model = 'centralized'`) may have department lines, never company lines.
  - A centralized receiver has no Bill to %.
  - Venture Office (`is_internal`) and departments without `segment_key` are never receivers. Nobody moves cost to their own department.
  - Department lists come from the registry (`departments`, `department_modes()`), never a literal.
- **Who writes what:** HR (`hr_costing.create` / `.edit`) writes moves and Bill to %. Finance reads totals only, through SECURITY DEFINER RPCs, and never sees names.
- **Database rules:**
  - New or altered policies use `has_scope` / `has_perm`, never `current_user_role()`.
  - Every new table registers `permission_table_reads` / `permission_table_writes` rows, mirrored in `src/lib/permission-table-{reads,writes}.ts`, plus `audit_register`.
  - Every new RPC goes in `src/test/read-paths.ts`.
- **Migration:**
  - one file, a free 14-digit number (`src/lib/migration-numbers.test.ts`), LF;
  - applied to production **before** the merge, only on the user's word: dry-run in BEGIN … ROLLBACK, then commit plus the `schema_migrations` row;
  - replaced function bodies carry production's current guard: the `has_any_action` swap of `20261009040000` and the `tab_write_guard` lines of `20261011220100`.
- **Records:** DESIGN.md gets a Part IV entry (next free version). `.claude/rules/hr/` or `finance/finance-view.md` get a section. HANDOFF gets a checkpoint after the merge.

## Review Focus

1. **A top-up batch** (Resubmit / Second payroll) carries only the difference.
   - A % line must move the same % of that line's CTC.
   - A fixed line moves nothing on a top-up.
   - A top-up whose CTC is 0 (only net or PCB moved) must move nothing and divide by nothing.
2. **A Revenue (commission-team) person** moving cost.
   - The commission split must lose the same proportion, so the sender's `9030 = salary − c.salary + c.basic` never goes negative.
   - Otherwise `dr()` skips it and the JV no longer balances.
3. **Send back of a later top-up batch** must not unlock lines stamped by the first batch.
   - Send back returns rows to *completed*, not draft. HR must Unlock before editing, and the guard must still allow the edit then.
4. **A receiver whose only company rows come from moved-in money.**
   - The billing RPC's `WHERE EXISTS (company_agg)` filter must not drop them.
   - Moved-in money must never feed the receiver's HV / own-share row.
5. **A person whose department changes after the batch**, or a receiver switched to centralized after Bill to % was set.
   - The receiver is always the move's `department_id`, in all three places: funding, accrual and billing.
   - The sender follows each place's existing rule: the batch line's department in funding and accrual, the roster department in billing. The move must still net to zero across departments in each place.
   - A centralized receiver's Bill to % rows are ignored, not billed. Its received money stays as its cost.

---

### Task 1: Department lines table, its lock, and the receivers' Bill to %

**Files:**
- Create: `supabase/migrations/<free 14-digit>_payroll_cost_moves.sql` (sections 1–3 of the file; Tasks 2–4 add their sections to the same file)
- Create: `tests/member-sql/validate-payroll-cost-moves.mjs` (model on `tests/member-sql/validate-director-hv-share.mjs`: PGlite, the migrations run verbatim over production's md5-checked bodies)
- Modify: `src/lib/permission-table-reads.ts`, `src/lib/permission-table-writes.ts`, `src/lib/supabase/database.types.ts`

**Interfaces:**
- Produces the table `hr_staff_dept_moves`:
  - `id uuid PK`, `staff_id uuid`, `period_month date` (1st);
  - `department_id uuid` (FK `departments`, the receiver);
  - `amount numeric(15,2) NULL`, `pct numeric(7,6) NULL` — exactly one is set, `amount > 0`, `0 < pct ≤ 1`;
  - `batch_id uuid NULL` (FK `payroll_batches`, the batch that carried the line first);
  - `created_by uuid NOT NULL`, `created_at timestamptz`;
  - FK `(staff_id, period_month)` → `hr_monthly_payroll` ON UPDATE CASCADE ON DELETE CASCADE;
  - `UNIQUE (staff_id, period_month, department_id)`.
- Produces `guard_staff_dept_moves()`, a BEFORE INSERT / UPDATE / DELETE trigger, SECURITY DEFINER. It lets `app.payroll_lifecycle` through and refuses with ERRCODE `23PAY` and the words below:
  - the row is carried (`batch_id IS NOT NULL`): "locked with batch #n — Finance's Send back reopens it";
  - the payroll row is not draft: `splitLockMessage`'s words;
  - the month is closed for good;
  - the receiver is the person's own department, internal, or without `segment_key`.
- Produces two triggers:
  - `stamp_dept_moves_on_batch_line`, AFTER INSERT ON `payroll_batch_lines`, scope `staff`, `NOT is_topup`: sets `batch_id = NEW.batch_id` where `batch_id IS NULL` for that staff and period;
  - `release_dept_moves_on_send_back`, AFTER UPDATE OF status ON `payroll_batches`, when the status becomes `sent_back`: clears `batch_id` where `batch_id = NEW.id`.
- Changes `hr_pool_allocation`:
  - a DELETE policy (`has_scope(ARRAY['hr'])`) replacing `no_delete USING(FALSE)`, plus a DELETE registry row;
  - the read registry gains `hr_costing.view:own`;
  - a guard trigger `guard_pool_allocation` that refuses a centralized, internal or pool-less department and a month closed for good;
  - a new table comment.

- [ ] **Step 1: Write the failing SQL tests** in `validate-payroll-cost-moves.mjs`.
  - `a line takes amount or pct, not both, not neither`.
  - `a draft row's line saves; a completed row's line is refused with the split's words`.
  - `submitting the row stamps its lines with the batch; any change is then refused "locked with batch #1"`.
  - `Resubmit (payroll_open_topup) leaves the lines locked; Send back of the top-up batch leaves them locked; Send back of batch #1 releases them`.
  - `no line to the person's own department, to Venture Office, or to a department with no segment`.
  - `hr_pool_allocation: HR deletes and re-inserts a receiver's month; a centralized department's row is refused; a month closed for good refuses`.
- [ ] **Step 2: Run** `node tests/member-sql/validate-payroll-cost-moves.mjs`. Expected: FAIL (the table does not exist).
- [ ] **Step 3: Write the migration's sections 1–3.**
  - Copy the RLS, grants, `audit_register` and registry format from `20261030020000_fabric_upgrades.sql` L92–147.
  - Reads: `ARRAY['hr_costing.create','hr_costing.edit','hr_costing.view:own']`.
  - Writes: `hr_costing.create` / `.edit` for INSERT, UPDATE and DELETE.
- [ ] **Step 4: Mirror the registries** in `permission-table-reads.ts` / `permission-table-writes.ts`, and regenerate `database.types.ts` (the two tables).
- [ ] **Step 5: Run the SQL test and the scans.** Run `node tests/member-sql/validate-payroll-cost-moves.mjs` and `npx vitest run src/lib/permission-table-reads.test.ts src/lib/permission-table-writes.test.ts src/lib/migration-numbers.test.ts src/lib/audit`. Expected: PASS.
- [ ] **Step 6: Commit.**

### Task 2: Funding — the moved part drawn from the receiver's pool

**Files:**
- Modify: the migration (section 4: `CREATE OR REPLACE public.payroll_batch_pool_parts(uuid)`, whole, keeping its grants: `service_role` only)
- Test: `tests/member-sql/validate-payroll-cost-moves.mjs`

**Interfaces:**
- Consumes: `hr_staff_dept_moves` (Task 1).
- Produces: `payroll_batch_pool_parts(p_batch_id)`, same return shape. Each staff line of the batch with moves gets two entries:
  - `+moved` on the receiver's pool key, name and id;
  - `−moved` on the line's own pool key.
  - The keys use the same formulas as the existing parts, so `GROUP BY` merges them.
- The amount moved on one batch line, `moved(line, move)`:
  - `pct`: `round(line.ctc × pct, 2)`;
  - `amount`: `least(amount, line.ctc)` on `NOT is_topup`, 0 on a top-up;
  - and if the line's `ctc ≤ 0`: 0.

- [ ] **Step 1: Write the failing tests.**
  - `Vivian (Director Office, CTC 6,000) moves RM 3,000 to HR: batch #1's parts read Director Office −3,000 against its own line, HR +3,000; the request total is unchanged`.
  - `a 40% line on a top-up batch of CTC 500 moves 200; a fixed line moves 0 on the top-up`.
  - `a top-up with CTC 0 moves nothing`.
  - `directors' HV-share parts are unchanged`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** a `staff_moves` CTE beside the `hv` CTE (pattern `20261013233000` L459–480).
- [ ] **Step 4: Run.** Expected: PASS. Then run the HV-share test `node tests/member-sql/validate-director-hv-share.mjs`: still PASS.
- [ ] **Step 5: Commit.**

### Task 3: Accrual — the moved part booked in the receiver's segment

**Files:**
- Modify: the migration (section 5: `CREATE OR REPLACE public.payroll_batch_segment_sums(uuid)` whole; `public.payroll_batch_commission_split(uuid)` whole from `20261021210000` L22–72)
- Test: `tests/member-sql/validate-payroll-cost-moves.mjs`; `src/lib/payroll-accrual.test.ts` (one case through `batchAccrualSums`)

**Interfaces:**
- Consumes: the `moved(line, move)` rule from Task 2.
- Produces: `payroll_batch_segment_sums` with a per-line staff part. The proportion is `moved / line.ctc`.
  - CTC exact.
  - Gross = moved − the part's employer contributions.
  - Every other figure (er, ee, PCB, withholding, SKBBK, non-statutory allowance) in proportion.
  - Net = gross − ee − pcb − wht − skbbk.
  - The part is added under the receiver's `segment_key` and subtracted from `line.segment_key`.
- Produces: `payroll_batch_commission_split`. A commission person's moved proportion leaves the sender segment's `salary`, `basic` and claims. The receiver gets nothing there, so its part books through the plain salary mapping (`9030` / `9084` / statutory).
- `src/lib/payroll-accrual.ts`: no code change unless a test shows one.

- [ ] **Step 1: Write the failing tests.**
  - `Vivian's batch: the director_office JV totals cost − 3,000, the hr JV includes 3,000; both balance (Dr = Cr)`.
  - `a Revenue salesperson (commission) moves 25% to Finance: revenue_department's 9030 stays ≥ 0 and its JV balances; finance's JV carries 25% as salary`.
  - `a top-up batch's part follows Task 2's moved()`.
  - In `payroll-accrual.test.ts`: `batchAccrualSums over a moved part's figures balances`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement**, following `20261013233000` L518–580, per line instead of per batch total.
- [ ] **Step 4: Run** both test files. Expected: PASS. The HV-share test still passes.
- [ ] **Step 5: Commit.**

### Task 4: Billing — sender without the moved part; cost-center receivers bill by their monthly %

**Files:**
- Modify: the migration (section 6: `get_staff_billing_allocation`, `get_staff_own_share_allocation` whole, from `20261005100000`, carrying the `20261009040000` L205–210 guard; section 7: new `get_payroll_moves_summary(p_period_month date)`)
- Modify: `src/app/(portal)/billing/actions.ts` (`PAYROLL_DEPT_TO_SEGMENT` → the registry's `deptNameToSegment`, `lib/billing.ts` L157–172)
- Modify: `src/test/read-paths.ts` (`DEFINER_RPCS` + the new RPC), `src/lib/supabase/read-only.ts`, `tests/member-sql/validate-reach.mjs` (lists that name billing RPCs)
- Test: the SQL test; `src/app/(portal)/billing/actions.test.ts` (or the nearest existing billing test) for the segment mapping

**Interfaces:**
- `get_staff_billing_allocation(p_period_month)`: same return shape.
  - The sender's `dept_tot` (and so its HV row) excludes the moved parts by component. Its company rows stay % of the whole cost.
  - Each cost-center receiver gets `moved_in` per component × `hr_pool_allocation.split_pct`, folded into its department × company rows (UNION, then GROUP BY). Salary absorbs the rounding.
  - Moved-in money is not in the receiver's `dept_tot` or HV row.
  - The `WHERE EXISTS` filter counts moved-in company rows.
  - The receiver department is resolved the same way as the funding (Task 2).
- `get_staff_own_share_allocation(p_period_month)`: the sender's leftover excludes moved parts. Nothing is added for receivers.
- New `get_payroll_moves_summary(p_period_month)` → rows `(department_id, department_name, cost_model, moved_in numeric, billed numeric, stays numeric)`.
  - SECURITY DEFINER, gate `has_any_action(ARRAY['billing.view','hr_costing.view'])`.
  - REVOKE from PUBLIC and anon.
  - No names, no staff ids.

- [ ] **Step 1: Write the failing SQL tests.**
  - `Vivian (Director Office, 2990 25% / CAR 25% / HR RM 3,000): Director Office reads 2990 1,500, CAR 1,500, HV 0`.
  - `HR's Bill to 2990 30% / CAR 30% / CONTS 20%: HR's rows grow by 900 / 900 / 600, merged with HR's own staff rows; HR's HV row is unchanged`.
  - `with no Bill to %, HR's rows are unchanged and the summary says stays 3,000`.
  - `a centralized receiver's Bill to % rows are ignored`.
  - `own share: Director Office's leftover excludes the 3,000; HR's is unchanged`.
  - `a receiver with no staff split of its own still gets its moved-in company rows`.
  - `the components of every row add up to its amount`.
  - `a sender whose roster department changed after submission: the billing rows still net (sender's HV less 3,000, HR's rows plus its billed part) and the totals over all departments equal the payroll's cost`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** the three functions. Swap the literal segment map for `deptNameToSegment` in `billing/actions.ts` (`groupPayrollAllocation` L1752–1788 and the reconciliation L1940).
- [ ] **Step 4: Run** the SQL test, `npx vitest run "src/app/(portal)/billing" "src/app/(portal)/statements" src/lib/permission-table-reads.test.ts src/lib/tab-write-guards.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 5: Split rules and preview in TypeScript

**Files:**
- Modify: `src/lib/staff-allocation.ts`
- Test: `src/lib/staff-allocation.test.ts`

**Interfaces:**
- Produces:
  - `export interface DeptMoveRow { departmentId: string; kind: 'amount' | 'pct'; value: number }` (`value` in RM, or 0–100 for pct, as typed).
  - `validateDeptMoves(employerCost: number, companies: AllocationRow[], moves: DeptMoveRow[], ownDepartmentId: string, centralized: boolean)` → `{ ok: true } | { ok: false; error: string }`.
  - `movePreview(employerCost, companies, moves)` → `{ companies: Line[], moves: Array<{ departmentId; amount; pct }>, hvAmount, billedTotal, movedTotal }`.
  - `billToPreview(received: number, rows: AllocationRow[])` → `{ lines, stays }`.
- **Validation rules:**
  - one line per department;
  - the person's own department is refused;
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
  - `rounding: lines + stays = received to the sen`.
- [ ] **Step 2: Run** `npx vitest run src/lib/staff-allocation.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 6: Allocation actions — save lines with the split; receivers' Bill to %; copy last month

**Files:**
- Modify: `src/app/(portal)/hr-costing/allocation/actions.ts`
- Test: `src/app/(portal)/hr-costing/allocation/actions.test.ts` (new; mock style from `payments/requests/actions.test.ts` with `recordingSupabase`)

**Interfaces:**
- Consumes: Task 5's types and validators.
- Changes `saveStaffAllocation(staffId, periodMonth, rows, moves: DeptMoveRow[] = [])` → `SaveSplitResult`.
  - It validates both.
  - It replaces `hr_staff_allocation` rows (skipped for a centralized person) and `hr_staff_dept_moves` rows (delete, then insert).
  - Database refusals are returned in words, the same pattern as today.
- New `saveDeptBillTo(departmentId: string, periodMonth: string, rows: AllocationRow[])` → `SaveSplitResult`.
  - Gate: `requireActionOn('/hr-costing/allocation', 'hr_costing', 'edit')`, then `assertPeriodOpen`.
  - Refuses a centralized department in words.
  - Replaces that department's `hr_pool_allocation` rows for the month.
- Changes `copyAllocationsFromLastMonth(periodMonth)`: it also copies last month's department lines (for people whose row is draft and has none) and the receivers' Bill to % (for receivers with none this month). The result gains `copiedMoves` and `copiedBillTo`, and `splitCopyNote` says them.

- [ ] **Step 1: Write the failing tests.**
  - `saves companies and moves together`.
  - `a centralized person saves moves only`.
  - `the database's lock refusal comes back as words`.
  - `saveDeptBillTo replaces a month`.
  - `saveDeptBillTo refuses a centralized department`.
  - `copy brings last month's moves and Bill to % only where none exist`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests and `npx vitest run src/lib/write-pages.test.ts src/lib/permission-table-writes.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 7: Allocation page and editor — + Department, centralized bands, "Moved into" cards

**Files:**
- Modify: `src/app/(portal)/hr-costing/allocation/[period]/page.tsx`
- Modify: `src/app/(portal)/hr-costing/allocation/_components/AllocationEditor.tsx`
- Create: `src/app/(portal)/hr-costing/allocation/_components/MovedIntoCard.tsx`
- Modify: `src/app/(portal)/hr-costing/allocation/_components/CopyAllocationsButton.tsx` (the note)
- Test: `AllocationEditor.test.tsx`, new `MovedIntoCard.test.tsx`

**Interfaces:**
- **What the page loads:**
  - `department_modes()` for ids, names, `cost_model`, `is_internal` and `segment_key`;
  - `hr_staff_dept_moves` for the month;
  - `hr_pool_allocation` for the month;
  - each person's department id.
- `StaffAllocationData` gains `departmentId`, `moves: DeptMoveRow[]` and `movesLocked: { batchNo: number } | null`.
- `MovedIntoCard` props:
  - `{ period, department: { id; name }, incoming: Array<{ name; fromDept; amount; parts: { salary; allowance; epf; socso; eis } }>, billTo: AllocationRow[], companies, readOnly, locked }`.
- **Rendering**, as the sample `2026-11-03-payroll-cost-to-department-sample.html` ①–③:
  - *+ Department* adds a row. Its department select excludes the person's own department, internal departments and those without a pool. *Fixed RM* / *%* is unpicked until chosen, and the box appears after the choice.
  - The HV row reads the leftover after companies and moves, or "Stays in <dept>" for a centralized person.
  - Centralized people appear under folded department bands (`Marketing · 12 people`), opened on a click, with *+ Department* only.
  - One `MovedIntoCard` per receiving cost-center department with moves this month. Its auto row reads "Stays in <dept>". It has *+ Company*, *Copy last month's %* and *Save*.
  - A locked line shows "Locked with batch #n".
- **Text:** all English.
- **UI rules:** follow the dashboard-design skill and its style guide. Use the kit already on this page: the Tailwind classes, `chip`, and the `Select` from `@/components/hrv/select`. Numbers right-aligned and tabular. No horizontal scroll at phone width.

- [ ] **Step 1: Write the failing tests** (role-based, as `AllocationEditor.test.tsx`).
  - `+ Department adds a row whose amount box shows only after Fixed RM or % is picked`.
  - `the department list leaves out the person's own department, Venture Office and pool-less departments`.
  - `the HV row reads 0.00% for Vivian 25/25 + RM 3,000`.
  - `a centralized person shows + Department only, and its leftover reads "Stays in Marketing"`.
  - `a line carried by batch #1 reads "Locked with batch #1" and its controls are disabled`.
  - `MovedIntoCard lists who moved how much and its Bill to rows; "Stays in HR" is the remainder`.
  - `Save calls saveDeptBillTo with the rows`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Visual check.** Use the real-component Vite harness (memory `visual-check-headless-chrome`): render the page's components with a fixture at 1280px and at phone width, transitions off. Screenshot for the user. Delete `zz-harness/` before committing.
- [ ] **Step 6: Commit.**

### Task 8: Submit to Finance preview, Payroll invoices "Stays in", and the reads that sum payroll by department

**Files:**
- Modify: `src/lib/payroll-lifecycle.ts` (`LifecycleRow`, `submitPreview`), `src/app/(portal)/hr-costing/payroll/[period]/page.tsx` (load moves)
- Modify: `src/app/(portal)/billing/actions.ts` (`fetchConsolidatedPayrollPreview` → `{ companies, staysIn }`), `src/app/(portal)/statements/invoice-actions.ts` (`hubPayrollPreview`), `src/app/(portal)/statements/_components/GenerateDialogs.tsx` (`PayrollInvoicesDialog` after L254, and the empty state; `OwnShareDialog`'s hint at L465)
- Modify: `src/app/(portal)/statements/_lib/invoice-hub.ts` L96–101 and L272–320, `src/lib/billing-sheet.ts` L89–125 (the payroll basis: required by department moves out of the sender and into the receiver, through `get_payroll_moves_summary`), `src/components/.../MarketingPnlView.tsx` L63–73 (Marketing's OPEX less what it moved out, plus what moved in)
- Test: `src/lib/payroll-lifecycle.test.ts`, `GenerateDialogs.test.tsx`, the invoice-hub and billing-sheet tests, the Marketing P&L test

**Interfaces:**
- `LifecycleRow` gains `moves: Array<{ department: string; kind: 'amount' | 'pct'; value: number }>`.
- `submitPreview` moves, per row:
  - a % of `ask`;
  - a fixed amount only when the row has no batch yet;
  - out of `byDept[row.dept]` into `byDept[receiver]`.
  - This mirrors Task 2.
- `PayrollInvoicesDialog` shows "Stays in <dept> · RM x" for each receiver with `stays > 0`.

- [ ] **Step 1: Write the failing tests.**
  - `submitPreview: Vivian's 3,000 shows under HR, not Director Office; the total is unchanged`.
  - `a top-up asks 500 with a 40% line: 200 under the receiver`.
  - `the Payroll invoices dialog lists "Stays in HR · RM 600" with HR's Bill to at 80%`.
  - `the payroll basis reads Director Office required less 3,000 and HR more 3,000`.
  - `Marketing's OPEX drops by what its people moved out`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the files and `npx vitest run src/lib/report-export-gates.test.ts src/lib/permission-table-reads.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 9: Records, the full check, the PR

**Files:**
- Modify: `docs/DESIGN.md` (a Part IV entry at the next free version, plus a line in HR Costing's section)
- Modify: `.claude/rules/hr/` (the Allocation rule file; find it with `grep -rl "Allocation" .claude/rules`) and `.claude/rules/finance/finance-view.md` (the Payroll invoices dialog)

- [ ] **Step 1: Write the records**, quoting the user's decisions from the spec.
- [ ] **Step 2: Run the full check.**
  - `npx eslint` on the changed files;
  - `npx tsc --noEmit` (judge only errors in our files; `MemberWorkspace.principal.test.tsx`, `commission/*.test.ts` and `supabase/read-only.test.ts` fail locally on stale `node_modules`);
  - `npx vitest run` in the background. Known local-only failures: `erp-sync/catalogue` and `crm/palette` (CRLF); long scans time out under the full run and pass alone;
  - every `tests/member-sql/validate-*.mjs` that touches payroll or billing.
- [ ] **Step 3: Commit, push, open the PR**, with the user's quotes, the tests and the migration's name.
- [ ] **Step 4: Production.** Before any merge, and only on the user's word: dry-run the migration on production in BEGIN … ROLLBACK, then apply it with its `schema_migrations` row. Re-run the read-only checks against production's data:
  - `get_payroll_moves_summary` for October returns no rows (no moves yet);
  - `get_staff_billing_allocation` for October equals its value before the migration, to the sen.
- [ ] **Step 5: Merge** on the user's word, read the deploy once, and write the HANDOFF checkpoint.
