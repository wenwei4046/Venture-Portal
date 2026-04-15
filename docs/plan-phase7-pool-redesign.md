# Plan — Phase 7: Pool Model Redesign & Payment Multi-Source

Baseline assumption: prior uncommitted work (docs cleanup + non-billable form) has been committed. Migration `20260101000072_director_payout_finance_voucher.sql` and its TS counterpart have been reverted. Current head migration is `...000071_remove_finance_mgmt_fee.sql`. New migrations start at `000100`.

---

## 1. Executive summary

Phase 7 rebuilds the pool model around the user's clarified mental model: HV has four department pools (HR, Finance, **Director**, Marketing) that all flow through a single shared transaction ledger (`dept_pools`), plus the system pool `hv_operating_fund` ("Venture Pool"). The Director Pool receives the FULL sub-paid CTC as revenue pooling; the 5% saving, 25% invoice accumulator, and 75% payroll all live as balance inside Director Pool (physical = "Director Salary Banker" account). The `invoice_payout_pool` table is RETAINED as a pure per-director accumulation ledger (tracks which director accumulated how much) — it does NOT represent additional balance; the actual money sits in Director Pool. Release of accumulated invoice flows OUT of Director Pool to the specific director. The legacy monthly-snapshot `salary_pool` table is retired and its role folded into a new `dept_pool_director` entry in `dept_pools`. On top of the new pool model we rewire six flows: Loan IN (needs approval, no voucher), Loan OUT (combined double-approval card), Credit (auto-record, no approval), Payment voucher (multi-source up to 3 pools per voucher), Claims (picks source pool → auto-creates voucher), Statements (display-only PDF, merged with Billing tab), Overdue (calendar-month maturity), HR allocation (HR → Principal → Finance execution).

**Principles**
- Surgical diffs. Preserve RLS. Every intermediate commit compiles and passes existing tests.
- Additive schema first, deprecate old columns last. `payment_vouchers.source_pool` stays populated by an app-layer fallback until the final cleanup step.
- App-layer + DB-layer defense in depth. Sum-of-sources = voucher total is checked in both a Postgres trigger (authoritative) and the server action (early-error UX).
- No math rewrite. `src/lib/salary.ts` and `save_director_salary_results` (migration 30) stay untouched at the split-logic level; we change only where the three output slices are *written* (5% + 75% now go to `dept_pool_director`; 25% unchanged to `invoice_payout_pool`).
- No breaking changes to dashboard RPCs — extend `dashboard_summary` and `director_finance_summary`, never replace.

**Non-goals**
- No dashboard chart aesthetic changes.
- No auth/RLS scaffolding rewrite; we add policies, we don't restructure.
- No edits to `src/lib/salary.ts` math.
- No tier revival (companies.tier column is dead weight; leave it).
- No Finance Mgmt Fee work (separate spec inbound).

---

## 2. Out-of-scope

- Finance Mgmt Fee redesign.
- Dashboard chart aesthetics / Recharts swaps.
- Re-adding the tier system.
- Salary engine math in `src/lib/salary.ts` — treated as black-box.
- Rebuilding the approval cascade trigger (migration 17). Loan OUT double-approval will remain app-layer coordination.
- `companies.tier` column cleanup (defer).
- Retiring `monthly_statements.status` enum (kept as display metadata per user directive).

---

## 3. Ordered step list

Steps are sequenced so every commit leaves a green build. Migration and RPC changes land before the TS callers that depend on them. Multi-source voucher is the biggest blast radius (it touches dashboards, payment list, receipts, approvals) — sequenced at step 4 so the remaining steps build on its schema.

### Step 1 — Add `dept_pool_director` and retire `salary_pool` (schema + backfill)

- **Goal:** Introduce the Director department pool as the consolidated home for 5% saving + 75% payroll slices; migrate historical `salary_pool` balances into `dept_pools`.
- **Files touched:**
  - `supabase/migrations/20260101000100_director_dept_pool.sql` (new)
  - `src/types/index.ts` (`director_saving` reference cleanup at line 63)
  - `src/lib/dept-pools.ts` (new small helper — `getDirectorDeptId()`)
- **Migration(s) added:** `20260101000100_director_dept_pool.sql`
  - `INSERT INTO departments (name, ...) VALUES ('Director', ...)` IF NOT EXISTS.
  - Backfill: for each `salary_pool` row (`period_month`, `balance_amount`), insert a corresponding `dept_pools` row with `transaction_type='np_in'`, `department_id=<Director dept>`, `period_month=<same>`.
  - `DROP TABLE salary_pool CASCADE` (only references are dashboard views + the no-op branch in `payments/actions.ts:492` which we also remove in this step).
  - Add `CREATE INDEX dept_pools_dept_period_idx ON dept_pools(department_id, period_month)` if not present.
- **Verify:**
  - SQL: `SELECT SUM(CASE WHEN transaction_type='np_in' THEN amount ELSE -amount END) FROM dept_pools WHERE department_id=(SELECT id FROM departments WHERE name='Director');` matches the previous `SELECT SUM(balance_amount) FROM salary_pool` snapshot total.
- **Rollback:** Revert migration + `git revert` commit; `salary_pool` must be dropped (not renamed) so rollback recreates from backup schema dump. Tag pre-migration DB snapshot before applying.

### Step 2 — Reroute full CTC + all three slices to `dept_pool_director`

- **Goal:** Update `save_director_salary_results` RPC so the FULL sub-paid CTC lands in Director Pool (revenue pooling), then the 5% saving, 25% invoice accumulator, and 75% payroll are all tracked as balance IN Director Pool. `invoice_payout_pool` is kept as a per-director accumulation ledger but does NOT double-count balance.
- **Files touched:**
  - `supabase/migrations/20260101000101_save_director_salary_reroute.sql` (new — CREATE OR REPLACE FUNCTION)
  - `src/app/(portal)/director-salary/actions.ts` (line 109 region — display only; no logic change needed, but re-read the return surface).
  - `src/app/(portal)/director-pool/page.tsx` (update balance source: was `salary_pool`, now `dept_pools` where dept='Director').
- **Migration(s):** `20260101000101_save_director_salary_reroute.sql`
  - Inside the function: replace the old `DELETE FROM salary_pool WHERE period_month=...; INSERT INTO salary_pool ...` block (migration 30 lines 58–74) with a SINGLE `INSERT INTO dept_pools (department_id=Director, transaction_type='np_in', amount=total_ctc_in, period_month=...)` — captures full CTC as revenue pooling.
  - Keep the existing per-director `invoice_payout_pool.accumulate` writes AS-IS (it's now a ledger-only record, no separate balance).
  - Stop writing `hv_operating_fund.saving_in` (this txn type stays in the enum for now — remove in a later cleanup migration).
  - Math in `src/lib/salary.ts` UNCHANGED (EPF/SOCSO/EIS/5%/25%/75% split logic sacred).
- **Verify:** Re-run director salary calc for the latest closed period on staging; Director Pool balance == total CTC for that period. `invoice_payout_pool` per-director rows preserved (audit trail intact).
- **Rollback:** `CREATE OR REPLACE FUNCTION` back to the mig-30 body. `salary_pool` is gone so rollback is only safe if Step 1 rollback is applied in lockstep.

### Step 3 — RLS for `dept_pool_director`

- **Goal:** Make sure Director, Finance, Principal can SELECT the Director dept pool; Director cannot write expense_out to dept pools (existing policy covers this).
- **Files touched:**
  - `supabase/migrations/20260101000102_director_pool_rls.sql` (new)
- **Migration(s):** `20260101000102_director_pool_rls.sql`
  - Review existing `dept_pools` policies (migration 11 lines 355–385 + migration 43 `director_pool_hr_read`). Add a `dept_pools_director_read` policy that lets role=`director` SELECT rows where `department_id = (SELECT id FROM departments WHERE name='Director')`. (HR read was added in mig 43 for staff cost visibility — mirror pattern.)
  - No new INSERT policy — Director's 5%+75% writes happen via the SECURITY DEFINER RPC from Step 2.
- **Verify:** Psql as a director user: `SELECT * FROM dept_pools WHERE department_id=<director>` returns rows; `INSERT INTO dept_pools ...` is denied.
- **Rollback:** `DROP POLICY dept_pools_director_read ON dept_pools`.

### Step 4 — `payment_voucher_sources` subtable (schema + trigger)

- **Goal:** Replace the single `source_pool` with a multi-row source table (max 3 rows per voucher). This is the biggest schema change; land it BEFORE we change any TS caller.
- **Files touched:**
  - `supabase/migrations/20260101000103_payment_voucher_sources.sql` (new)
  - `src/types/index.ts` (new `PaymentVoucherSource` type export)
- **Migration(s):** `20260101000103_payment_voucher_sources.sql`
  - `CREATE TABLE payment_voucher_sources (id UUID PK, voucher_id UUID NOT NULL REFERENCES payment_vouchers(id) ON DELETE CASCADE, pool TEXT NOT NULL, amount DECIMAL(15,2) NOT NULL CHECK (amount > 0), created_at TIMESTAMPTZ DEFAULT NOW())`.
  - `CREATE INDEX pvs_voucher_idx ON payment_voucher_sources(voucher_id)`.
  - Trigger `enforce_pvs_max_three`: BEFORE INSERT, fail if `(SELECT count(*) FROM payment_voucher_sources WHERE voucher_id=NEW.voucher_id) >= 3`.
  - Trigger `enforce_pvs_sum_equals_voucher`: AFTER INSERT OR UPDATE OR DELETE, on paid vouchers only: `(SELECT sum(amount) FROM payment_voucher_sources WHERE voucher_id=v.id) = v.amount`. Raise on mismatch.
  - RLS: inherits from `payment_vouchers` — new policy `pvs_same_as_voucher`: USING clause delegates to `EXISTS (SELECT 1 FROM payment_vouchers pv WHERE pv.id=payment_voucher_sources.voucher_id AND <existing pv policy predicate>)`.
  - Backfill: `INSERT INTO payment_voucher_sources (voucher_id, pool, amount) SELECT id, source_pool, amount FROM payment_vouchers WHERE source_pool IS NOT NULL`.
- **Verify:** `SELECT voucher_id, SUM(amount) FROM payment_voucher_sources GROUP BY 1 HAVING SUM(amount) <> (SELECT amount FROM payment_vouchers WHERE id=voucher_id);` returns zero rows post-backfill.
- **Rollback:** `DROP TABLE payment_voucher_sources CASCADE` — voucher table is unaffected because source_pool is still populated.

### Step 5 — `adjustPool` becomes multi-source-aware

- **Goal:** Rewrite `executeVoucher` pool adjustment (`payments/actions.ts:383–402`) to iterate `payment_voucher_sources` rows instead of a single `source_pool`. Keep `adjustPool()` helper (`payments/actions.ts:457–530`) per-row; add a new `adjustVoucherPools(voucher)` wrapper that fans out to each source.
- **Files touched:**
  - `src/app/(portal)/payments/actions.ts` (lines 120–180 auto-complete block; 383–402 debit block; 457–530 helper; remove the `salary_pool` dead branch at 492–494).
  - `src/__tests__/payments.actions.test.ts` (new test file — see Step 13).
- **Migration(s):** none.
- **Verify:** `npm run test:vitest payments.actions` covers: single-source backward compat; 2-source split; 3-source split; over-3 rejected; sum-mismatch rejected at app layer.
- **Rollback:** Revert commit — backing schema still has both `source_pool` and `payment_voucher_sources`.

### Step 6 — Payment voucher creation form: multi-source UI

- **Goal:** Replace the single source-pool dropdown in `NewPaymentForm` with a row-based picker (add/remove row, each row = pool dropdown + amount input, live sum validation that matches voucher total).
- **Files touched:**
  - `src/app/(portal)/payments/_components/NewPaymentForm.tsx` (lines 62–65 existing source_pool field → new rows component).
  - `src/app/(portal)/payments/_components/MultiSourcePicker.tsx` (new client component).
  - `src/app/(portal)/payments/actions.ts::createPaymentVoucher` (lines 13–183): accept `source_rows` FormData array; validate sum == amount before insert; on insert, transactionally write voucher + N rows. Keep writing `source_pool = first_row.pool` for backward-compat reads.
- **Migration(s):** none.
- **Verify:** Manual: create a voucher with 2 sources (HV Operating + Marketing), sum matches total → paid. Sum mismatch → friendly error before DB call.
- **Rollback:** Revert; old single-source form re-renders.

### Step 7 — Payment list: filters, search, back-to-top

- **Goal:** Add filter chips (voucher_type, source_pool — "any matching source", date range, status, payee, amount min/max), free-text search over voucher_no/description/payee, and a floating back-to-top button.
- **Files touched:**
  - `src/app/(portal)/payments/page.tsx` (existing single source_pool read at lines 151–152 becomes a join on `payment_voucher_sources`; filter must use `.in('id', <ids from pvs where pool=filter>)`).
  - `src/app/(portal)/payments/_components/PaymentFilters.tsx` (new client component, URL-state via `nuqs` or query params).
  - `src/app/(portal)/payments/_components/BackToTop.tsx` (new).
- **Migration(s):** none.
- **Verify:** Manual: filter to `pool=Marketing` shows vouchers that have ANY Marketing row; free-text search finds substring across three fields.
- **Rollback:** Revert component imports.

### Step 8 — Loan IN needs Principal approval; no voucher

- **Goal:** `createFundSource` (`fund-in/actions.ts:24–142`) stops auto-crediting `hv_operating_fund`. Instead it sets fund_source.status=`pending_approval` (add state) and creates an `approval_requests` row of type `new_fund_source`. On approval, Principal action posts the `fund_in` ledger entry and updates fund_source.status=`active`. Add repayment_date field.
- **Files touched:**
  - `supabase/migrations/20260101000104_fund_source_approval.sql` (new)
  - `src/app/(portal)/fund-in/actions.ts` (lines 24–142: remove auto hv_fund insert 130–137, add approval insert; add `repayment_date` column read).
  - `src/app/(portal)/fund-in/_components/FundSourceForm.tsx` (add repayment date input).
  - `src/app/(portal)/approvals/actions.ts` (add new branch `if (approval.request_type === 'new_fund_source')` that fires the `fund_in` ledger insert + bank balance credit).
- **Migration(s):** `20260101000104_fund_source_approval.sql`
  - `ALTER TYPE fund_source_status ADD VALUE 'pending_approval'` (before `active` per enum semantics).
  - `ALTER TABLE fund_sources ADD COLUMN repayment_date DATE` (nullable; existing rows stay null).
  - `ALTER TYPE approval_request_type ADD VALUE 'new_fund_source'` if not present.
- **Verify:** Unit test: `fund-in/actions.create.test.ts` existing tests still pass; add new test that creates a fund source → expects status='pending_approval' and one approval_request row.
- **Rollback:** Approval request type additions are enum-only (can't remove values without rebuild) — so functional rollback only requires reverting TS + not using the enum value. Leave the enum value in place.

### Step 9 — Loan OUT combined approval card (UI only; logic already double-signed)

- **Goal:** When Finance submits Loan OUT, the system now creates TWO approval_requests in the same transaction: `new_loan` + `payment_voucher` (for the disbursement). Principal sees them as a single combined card in `/approvals`. Both must be approved for the loan to disburse + voucher to execute.
- **Files touched:**
  - `supabase/migrations/20260101000105_loan_out_combined_approval.sql` (new)
  - `src/app/(portal)/fund-out/actions.ts` (`createLoan` at line 13: after `create_loan_with_approval` RPC, also draft a payment_voucher + submit its approval — OR extend the RPC to do both atomically).
  - `src/app/(portal)/approvals/page.tsx` (group approvals sharing a `group_id` into one card).
  - `src/app/(portal)/approvals/_components/CombinedApprovalCard.tsx` (new).
  - `src/app/(portal)/approvals/actions.ts` (add `approveRequestGroup(groupId)` that approves both linked requests atomically; keep single approval path for other types).
- **Migration(s):** `20260101000105_loan_out_combined_approval.sql`
  - `ALTER TABLE approval_requests ADD COLUMN group_id UUID`. Two requests sharing a group_id are a combined card.
  - `CREATE INDEX approval_requests_group_idx ON approval_requests(group_id) WHERE group_id IS NOT NULL`.
  - Extend `create_loan_with_approval` (migration 34) to also insert a draft `payment_vouchers` row + linked approval_request with the same `group_id`.
- **Verify:** Manual: submit Loan OUT, open /approvals, see one card with "Approve loan + voucher". Approve → loan activates + voucher moves to `approved`. Bank + Venture Pool both go down on voucher execution (unchanged flow).
- **Rollback:** Revert TS + migration; `group_id` column is nullable so older approvals unaffected.

### Step 10 — Credit (receive-money, non-loan) default pool

- **Goal:** Credit (direction='credit') voucher creation defaults `target_pool='hv_operating_fund'` when not specified; already auto-approves per migration 59. No other change, but confirm auto-record path in `createPaymentVoucher` (lines 71–183) writes to Venture Pool.
- **Files touched:**
  - `src/app/(portal)/payments/actions.ts` (lines 27–31: default target_pool if direction==='credit' and unspecified).
  - `src/app/(portal)/payments/_components/NewPaymentForm.tsx` (pre-select Venture Pool when user picks Credit direction).
- **Migration(s):** none.
- **Verify:** Create credit voucher without specifying target → hv_operating_fund balance goes up by amount.
- **Rollback:** Revert; behaviour reverts to user-required target.

### Step 11 — Statement isolation (display-only) + Billing tab merge

- **Goal:** `markStatementPaid` (`statements/actions.ts:247–268`) and `issueStatement` no longer touch any pool (already true per report item C — but confirm and add explicit comment). Add a "Generate PDF" action that emits a PDF via existing `@react-pdf/renderer` pipeline without any DB write beyond `status`. Merge `/billing` tab into `/statements` (one nav item).
- **Files touched:**
  - `src/app/(portal)/statements/actions.ts` (lines 213–268: add inline comment block stating these are pure display transitions; no ledger writes).
  - `src/app/(portal)/statements/_components/StatementPdfButton.tsx` (new — wraps existing PDF generator; no server-side DB write).
  - `src/components/AppSidebar.tsx` (or wherever nav is defined — merge /billing into /statements tab).
  - `src/app/(portal)/billing/page.tsx` (delete route; content moves into `/statements` with a sub-tab).
  - `src/app/(portal)/statements/_components/StatementsTabs.tsx` (new — two sub-tabs: "Statements", "Invoices").
- **Migration(s):** none.
- **Verify:** Issue + mark-paid a statement; confirm `hv_operating_fund`, `dept_pools`, `invoice_payout_pool` balances are unchanged. Nav shows one "Statements" item.
- **Rollback:** Revert; /billing route returns.

### Step 12 — Overdue: per-calendar-month maturity

- **Goal:** Replace the 30-days-since-last-interest rule (migration 13 RPC `calculate_days_overdue`) with: a loan is overdue if it is not repaid by the last day of the calendar month the loan was disbursed in (or the last day of the loan's `maturity_month` if that column is introduced). Simplify `overdue_stage` to a boolean or single-stage enum.
- **Files touched:**
  - `supabase/migrations/20260101000106_overdue_calendar_month.sql` (new)
  - `src/app/(portal)/overdue/actions.ts` (`detectOverdue` lines 12–94: rewrite around the new RPC; remove `lookup_overdue_stage` complexity; recompute historical records — see §4).
  - `src/app/(portal)/overdue/page.tsx` (group by period_month per user item 10).
- **Migration(s):** `20260101000106_overdue_calendar_month.sql`
  - `CREATE OR REPLACE FUNCTION is_overdue_for_month(p_loan_id UUID, p_period_month DATE) RETURNS BOOLEAN` — returns true if outstanding > 0 AND current_date > (p_period_month + INTERVAL '1 month' - INTERVAL '1 day').
  - Optional simplification: `ALTER TABLE overdue_records ADD COLUMN is_overdue BOOLEAN; UPDATE overdue_records SET is_overdue = (overdue_stage IS NOT NULL)`. Leave `overdue_stage` in place for one release.
- **Verify:** Unit test: a loan disbursed 2026-03-15 with no repayment is overdue when today is 2026-04-01 but not on 2026-03-31.
- **Rollback:** Revert migration; old `calculate_days_overdue` still exists.

### Step 12b — Loan repayment auto-sync on Debit voucher (NEW, user-added)

- **Goal:** Debit voucher form gets a "this is a loan repayment" checkbox. When checked, user selects which outstanding loan (current-month due + overdue rows). On Principal approval + execute, system auto-inserts a `repayments` row (principal/interest split) + marks matching `overdue_records` as paid + stamps loan's current-month repayment done. Pool deduction honors the multi-source picker (user chose which pool to debit from).
- **Files touched:**
  - `supabase/migrations/20260101000106b_voucher_loan_link.sql` (new)
  - `src/app/(portal)/payments/_components/NewPaymentForm.tsx` (add `is_loan_repayment` checkbox; when ticked show loan dropdown fed by new server action `listPayableLoans()`).
  - `src/app/(portal)/payments/actions.ts` — `createPaymentVoucher` accepts `loan_id` + `repayment_breakdown {principal, interest, penalty}`; `executeVoucher` (line 318) branches: if voucher has `loan_id`, also insert `repayments` + update `overdue_records` + flip flag on `loans.current_month_paid`.
  - `src/app/(portal)/fund-out/actions.ts` — expose `listPayableLoans()` helper reading active loans with current month unpaid.
- **Migration(s):** `20260101000106b_voucher_loan_link.sql`
  - `ALTER TABLE payment_vouchers ADD COLUMN loan_id UUID REFERENCES loans(id)` (nullable).
  - `ALTER TABLE payment_vouchers ADD COLUMN repayment_breakdown JSONB` (nullable; schema: `{principal, interest, penalty}`).
  - Optional: `ALTER TABLE loans ADD COLUMN last_paid_period DATE` for Step 12's monthly check.
- **Verify:** Create Debit voucher RM 10,000 → tick "loan repayment" → select loan → breakdown 9k principal + 1k interest → Principal approves → execute. Expect: `repayments` has one new row; loan outstanding principal −9,000; overdue row for this period (if any) status=paid; voucher appears normally in /payments list with loan tag.
- **Rollback:** Revert migration + TS. Columns are nullable so existing vouchers unaffected.

### Step 13 — Claims: source-pool picker → two-step approval (Finance → Principal)

- **Goal:** Claim form adds a source-pool picker. Finance/HR approval drafts a `payment_voucher` (direction=debit, voucher_type='claim_payout', source_pool=claimant choice, status=`pending_approval`). Principal then approves the voucher through the normal approvals queue — at which point the pool is debited. Remove the direct `hv_operating_fund.claim_out` insert (`claims/actions.ts:69–76`); real debit happens through the voucher execute path.
- **Files touched:**
  - `supabase/migrations/20260101000107_claims_source_pool.sql` (new)
  - `src/app/(portal)/claims/_components/ClaimForm.tsx` (add source pool dropdown).
  - `src/app/(portal)/claims/actions.ts` (`submitClaim` at line 8: accept source_pool; `approveClaim` at line 28: remove the direct hv_fund write, instead call `createVoucherFromClaim(claim)` which inserts voucher in `pending_approval` + one `payment_voucher_sources` row + links approval_request of type `payment_voucher`).
  - `src/app/(portal)/approvals/actions.ts` (payment_voucher branch already handles this; verify no special-casing needed for claim-sourced vouchers).
- **Migration(s):** `20260101000107_claims_source_pool.sql`
  - `ALTER TABLE claims ADD COLUMN source_pool TEXT`.
  - `ALTER TABLE claims ADD COLUMN voucher_id UUID REFERENCES payment_vouchers(id)` (backlink for UI tracking).
  - RLS: unchanged — column additions inherit existing claims policies (mig 7 + 40 + 47).
- **Verify:** Submit claim with source=Marketing; Finance approves → voucher appears in /approvals queue for Principal; Principal approves → voucher paid → Marketing dept pool decreases; `hv_operating_fund.claim_out` ledger has NO new entry.
- **Rollback:** Revert TS + migration. Columns stay nullable so approved claims in-flight aren't broken.

### Step 14 — Fund-in/fund-out form UX: company-inference of payee fields

- **Goal:** When a company is selected in either fund-in or fund-out forms, the payee name + email fields go optional and show a hint "inferred from company".
- **Files touched:**
  - `src/app/(portal)/fund-in/_components/FundSourceForm.tsx`.
  - `src/app/(portal)/fund-out/_components/LoanForm.tsx`.
  - `src/app/(portal)/fund-in/actions.ts` (fallback: if payee_name null and company selected, populate from company.name server-side).
  - `src/app/(portal)/fund-out/actions.ts` (same fallback in `createLoan`).
- **Migration(s):** none.
- **Verify:** Manual: pick a company, leave payee_name empty → submit succeeds, voucher shows company name as payee.
- **Rollback:** Revert.

### Step 15 — HR2 Costing → Principal approval → Finance execution routing

- **Goal:** HR submits an HR2 Costing payload (existing `hr_cost_submissions`). On submit, an `approval_requests` row (type `hr_costing`) is created for Principal. When Principal approves, the record's state becomes `approved_for_execution` and appears in Finance's queue with an "Execute Transfers" button that creates the necessary dept-pool movements.
- **Files touched:**
  - `supabase/migrations/20260101000108_hr_costing_approval_routing.sql` (new — enum value).
  - `src/app/(portal)/hr-costing/actions.ts` (line 11: submit now also creates an approval_request; add new `executeHrCosting(id)` server action).
  - `src/app/(portal)/approvals/actions.ts` (add `hr_costing` branch in `approveRequest`).
  - `src/app/(portal)/hr-costing/page.tsx` (add Finance-execute queue view).
- **Migration(s):** `20260101000108_hr_costing_approval_routing.sql`
  - `ALTER TYPE approval_request_type ADD VALUE 'hr_costing'`.
  - `ALTER TABLE hr_cost_submissions ADD COLUMN execution_state TEXT DEFAULT 'pending'` (pending / approved_for_execution / executed).
- **Verify:** End-to-end: HR submits → /approvals shows HR costing card → Principal approves → Finance sees "Execute" button → click → dept pool rows inserted.
- **Rollback:** Revert TS; enum value stays.

### Step 16 — Deprecate `payment_vouchers.source_pool` (DO NOT DROP YET)

- **Goal:** Make the column nullable (already is) and stop writing to it from new vouchers. Add a comment noting it's deprecated and will be dropped in Phase 8.
- **Files touched:**
  - `supabase/migrations/20260101000109_deprecate_source_pool.sql` (new)
  - `src/app/(portal)/payments/actions.ts` (remove the fallback write at line 84).
  - `src/app/(portal)/payments/[id]/page.tsx` (stop reading `source_pool`; use `payment_voucher_sources` only).
- **Migration(s):** `20260101000109_deprecate_source_pool.sql` — `COMMENT ON COLUMN payment_vouchers.source_pool IS 'DEPRECATED: use payment_voucher_sources. Read-only for historical rows.';`
- **Verify:** New vouchers have NULL source_pool; historical rows still readable.
- **Rollback:** Revert; writes resume.

---

## 4. Data migration plan

**`salary_pool` → Director dept pool**: Step 1 migration backfills one `dept_pools` row per `salary_pool` row using the balance snapshot as `np_in`. This is a lossy compression (we lose the in/out history that `salary_pool` never stored anyway — salary_pool is a monthly snapshot, not a txn log, per mig 5:88). After Step 2 deploys, new saves happen via `dept_pools`. The old `hv_operating_fund.saving_in` rows stay in place for audit but are no longer produced.

**`payment_vouchers.source_pool` → `payment_voucher_sources`**: Step 4 backfills one row per voucher where `source_pool IS NOT NULL`. Amount = voucher.amount (single-source case). Trigger is deferred until post-backfill to avoid chicken-and-egg. After Step 5, new vouchers write to the subtable; `source_pool` continues to be written by the Step 6 app code for read compat (first row's pool value). Step 16 stops the write. A later phase can drop the column.

**`overdue_records` historical**: Do NOT recompute historical records. Step 12 only affects *future* `detectOverdue` runs. Old rows keep their `overdue_stage`; new rows populate `is_overdue` additionally. This avoids rewriting history and keeps audit trails intact.

**Historic `hv_operating_fund.saving_in` rows**: Leave in place. The balance semantic is preserved because Step 1 backfill puts the equivalent total in `dept_pool_director`. Dashboards need an update (Step 2 also updates `director-pool/page.tsx`) to read from the new location — but any query summing `hv_operating_fund` by txn_type should *exclude* `saving_in` going forward. Add a note in `dashboard_summary` RPC if it currently sums all-in types.

---

## 5. Test plan

Reference explore report §F — regression-critical uncovered code. New vitest files land in `src/__tests__/`:

- **Step 1 ships with:** `src/__tests__/director-pool-backfill.test.ts` — reads `dept_pools` with department_id=Director and asserts sum matches fixture totals.
- **Step 2 ships with:** `src/__tests__/director-salary.test.ts` — mocks RPC return and asserts the 5%+75% flows are written to dept_pools (not salary_pool).
- **Step 4 ships with:** `src/__tests__/payment-voucher-sources.test.ts` — trigger tests (>3 rows rejected, sum mismatch rejected, single-row OK).
- **Step 5 ships with:** `src/__tests__/payments.actions.multi-source.test.ts` — multi-source executeVoucher debits each pool correctly; 3-source balanced case; 2-source with dept_pool + hv_operating_fund.
- **Step 8 ships with:** extensions to existing `src/__tests__/fund-out/actions.create.test.ts` — new: `fund-in/actions.approval.test.ts` — status transitions pending_approval → active; no hv_fund write until approval.
- **Step 9 ships with:** `src/__tests__/approvals.grouped.test.ts` — both sibling approvals approved atomically; one rejected rolls back the other.
- **Step 11 ships with:** `src/__tests__/statements.isolation.test.ts` — snapshot pool balances before issueStatement/markStatementPaid and assert unchanged after.
- **Step 12 ships with:** `src/__tests__/overdue.calendar-month.test.ts` — boundary dates (last day of month; first day of next).
- **Step 13 ships with:** `src/__tests__/claims.voucher.test.ts` — approveClaim creates exactly one voucher with the claimant's chosen source pool.
- **Step 15 ships with:** `src/__tests__/hr-costing.approval.test.ts` — submit → approve → execute transitions.

Existing tests (`billing.test.ts`, `period-lock.test.ts`, `roles.test.ts`, `salary.test.ts`, `fund-out/actions.*.test.ts`) must remain green after every step.

---

## 6. RLS audit checklist

- `dept_pool_director` rows (Step 3): `dept_pools_director_read` policy lets role=director read Director rows; write path is RPC-only (SECURITY DEFINER).
- `payment_voucher_sources` (Step 4): policy delegates to `payment_vouchers` parent via `EXISTS (SELECT 1 FROM payment_vouchers pv WHERE pv.id=payment_voucher_sources.voucher_id AND <pv policy>)`. Validate by psql as each role (principal/finance/director/hr/dept_manager/staff) that they see the same voucher_sources they see on the parent voucher.
- `claims.source_pool` column (Step 13): policies unchanged — claims already have RLS (mig 7 + 40 + 47 self-approval fix). Column addition inherits existing row-level policies.
- `fund_sources.repayment_date` (Step 8): same.
- `approval_requests.group_id` (Step 9): same.
- `hr_cost_submissions.execution_state` (Step 15): inherits from mig 18 policies.

---

## 7. QA smoke test script

Run manually on staging after each deploy window.

1. **Loan IN (approval, no voucher):** Finance → /fund-in → pick subsidiary, RM 50,000, 5%/mo, effective date today, repayment date next month → submit. Expect: fund_sources.status=`pending_approval`; bank balance unchanged; Venture Pool unchanged. Principal → /approvals → approve. Expect: bank +50,000; Venture Pool +50,000; no voucher created.
2. **Loan OUT (combined card):** Finance → /fund-out → pick company, RM 30,000 → submit. Principal → /approvals → see a single card listing "Approve loan + voucher". Approve. Expect: loans.status=active; one voucher in /payments auto-approved; on voucher execute → bank -30,000 + Venture Pool -30,000.
3. **Credit auto-record:** Finance → /payments/new → direction=Credit, target pool defaults to Venture Pool, amount RM 1,000 → save. Expect: voucher status=paid immediately; Venture Pool +1,000; bank +1,000.
4. **Multi-pool voucher:** Finance → /payments/new → direction=Debit, total RM 5,000, two rows (Marketing 3,000 + HV Operating 2,000). Submit → Principal approves → execute. Expect: Marketing -3,000; Venture Pool -2,000; bank -5,000; /payments/[id] shows both source rows.
5. **Claim → voucher:** Dept manager submits claim RM 500, source=Marketing → Finance approves. Expect: one paid voucher appears; Marketing -500; no direct hv_fund.claim_out row written.
6. **Statement PDF:** Finance → /statements → issue statement → click "Generate PDF". Expect: PDF downloads; pool balances unchanged.
7. **Overdue detection:** Advance system date past month-end on a test loan with outstanding > 0 → run detectOverdue. Expect: one overdue_records row with is_overdue=true, period_month=previous month.
8. **HR routing:** HR submits HR2 Costing → Principal approves → Finance clicks Execute. Expect: dept_pool movements recorded.

---

## 8. Estimated effort

| # | Step | Hours | Complexity |
|---|---|---:|---|
| 1 | Director dept pool + retire salary_pool | 3 | M |
| 2 | Reroute 5%+75% RPC writes | 2 | M |
| 3 | RLS for Director pool | 1 | S |
| 4 | `payment_voucher_sources` schema + triggers | 4 | L |
| 5 | `adjustPool` multi-source rewrite | 3 | M |
| 6 | Multi-source form UI | 4 | M |
| 7 | Payment list filters + search + back-to-top | 3 | M |
| 8 | Loan IN approval flow | 3 | M |
| 9 | Loan OUT combined card | 4 | L |
| 10 | Credit default pool | 1 | S |
| 11 | Statement isolation + Billing merge | 3 | M |
| 12 | Overdue calendar-month rule | 2 | S |
| 12b | Loan repayment auto-sync on Debit voucher | 3 | M |
| 13 | Claims source pool → two-step voucher | 3 | M |
| 14 | Fund-in/out company-inference UX | 1 | S |
| 15 | HR costing approval routing | 3 | M |
| 16 | Deprecate `source_pool` column | 1 | S |

**Total:** ~44 hours, ~6 focused days. Assume 1.5x buffer for review + QA cycles → **~66 hours / 1.5 weeks**.

---

## 9. Risks

- **Multi-source backfill under concurrent traffic.** Step 4 backfill runs `INSERT SELECT FROM payment_vouchers`. If a voucher is created mid-backfill it might get two rows (one from backfill, one from new app code). Mitigation: wrap backfill in a single transaction with `SELECT … FOR UPDATE` on `payment_vouchers`, or run during a low-traffic window. Alternative: do the backfill BEFORE deploying the Step 6 app code.
- **Statement isolation hidden reads.** Per explore-report E.3, `markStatementPaid` revalidates /dashboard. `dashboard_summary` (mig 52 lines 85–86) reads `billing_float`. If that metric implicitly depends on `monthly_statements.status`, Step 11 might silently change the dashboard number. Action: before Step 11, grep for `monthly_statements` reads across `supabase/migrations/*.sql` and `src/` and confirm display-only semantic.
- **HR2 Costing approval flow — is HR submitting today?** The user directive assumes HR *submits* currently (item 11 in user constraints). Confirm: does HR have any existing submit UI, or is HR costing today direct-execute by Finance? If the latter, Step 15 grows in scope (new HR UI).
- **`salary_pool` CASCADE drop.** Any view or RPC that reads `salary_pool` will fail silently (CASCADE drops dependents). Pre-flight: `SELECT dependent_ns.nspname, dependent_view.relname FROM pg_depend … WHERE source_table='salary_pool'`.
- **`approval_request_type` enum additions (Step 8, 15).** Postgres enum values cannot be removed without enum rebuild. If we ship and then reverse course, the dead values persist. Low risk but worth flagging.
- **Trigger-layer sum check on `payment_voucher_sources` vs app-layer.** Need to be careful: while a voucher is being edited in the form, sum mismatches will cause trigger errors. Solution: app-layer writes all rows in a single transaction (use `.rpc('create_voucher_with_sources')` or wrap in Supabase transaction); trigger fires only at commit.
- **Principal PIN interaction (mig 67).** If Principal PIN is required for approvals, the combined card in Step 9 must prompt for PIN ONCE, not twice.

---

## 10. Open questions

### Resolved (2026-04-16 session)

- **OQ1 — Director Pool scope:** Director Pool holds FULL CTC as revenue pooling. All three slices (5% saving + 25% accumulator + 75% payroll) live as Director Pool balance. `invoice_payout_pool` kept as per-director ledger only (does NOT hold separate balance).
- **OQ3 — Overdue scope:** Covers BOTH Loan IN (fund_sources) and Loan OUT (loans). Plus new Step 12b adds auto-sync: when a Debit voucher is tagged as loan repayment + principal-approved, system auto-inserts `repayments` + marks overdue row paid.
- **OQ4 — Combined approval card:** AND semantic — approve both or reject both. No split approvals.
- **OQ5 — Claim approval:** Two-step. Finance approves claim → drafts voucher (pending_approval) → Principal approves voucher → paid. (Step 13 updated.)

### Still open

1. **Loan IN `repayment_date` — advisory or enforced?** If Loan IN has a repayment_date in the past and it's unpaid, should it show in Overdue? Plan currently assumes yes (OQ3 resolution covers this), but the `lock_in_months` semantics on fund_sources may conflict. Confirm: is `repayment_date` the single source of truth, OR does `lock_in_months` still apply?
2. **`hv_operating_fund.saving_in` enum value — deprecate immediately or leave?** Plan leaves it. If any historical report sums `saving_in`, it'll still work. Ok?
3. **Statement isolation — should `markStatementPaid` be renamed** (e.g. `markStatementSettled`) to avoid implying a money movement? Current plan keeps the name to minimize churn.
4. **Dashboard chart of "Director Pool balance" source.** Is there an existing Recharts card reading `salary_pool`? Grep confirms `director-pool/page.tsx` reads it; check `dashboard_summary` RPC body for any `salary_pool` reference — if so, update in Step 1 migration.
