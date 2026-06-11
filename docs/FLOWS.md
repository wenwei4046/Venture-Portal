# Document Flows (as-built)

> Generated 2026-06-11 from a code audit. Documents **AS-BUILT** behavior — the
> source of truth is the code (server actions in `src/app/(portal)/**/actions.ts`,
> RPCs in `supabase/migrations/`). When this doc and the code disagree, the code wins.

**COA convention (post-mig-238 unified COA):** 1xxx equity · 2xxx fixed asset ·
3xxx asset (3000 Bank–Hong Leong primary, 3010 Bank–Alliance HR, 3020 Loans
Receivable *header — posting blocked, use 305x per-borrower leaves*, 3030 AR–Subs) ·
4xxx liability (4000 Fund Sources Payable header + per-depositor leaves, 4020 Salary
Payable, 4050 AP–General) · 5xxx revenue (5000 Service Revenue–Subs, 5020 Salary
Income) · 6xxx cost · 7xxx other income (7000 Interest Income–Loans, 7010 Penalty
Income) · 9xxx expense (9000 G&A, 9030 Salary Expense, 9051–9055 Inter-billing leaves).
Bank GL is always `bank_accounts.gl_account_code` (fallback `3000`).

**Shared maps:**
- `billing_mode → segment` (`invoice-settlement.ts#segmentForBillingMode`):
  marketing_project→marketing, hr_attribution→hr, finance_attribution→finance,
  director_office_attribution→director_office, director_attribution→director
  (fixed mig 20260610010000), else→corporate.
- `billing_mode → pool` (`cfo-reports.ts#INVOICE_BILLING_MODE_TO_POOL`):
  same shape (`dept_pool_*`), director_attribution→dept_pool_director (fixed 2026-05-14),
  fixed_split / non_billable / unknown → venture_pool.
- Revenue GL fallback (`billing.ts#fallbackRevenueGlCode`): the four `*_attribution`
  modes → 5020 Salary Income; everything else → 5000 Service Revenue–Subs.
  `resolveRevenueGlCode` honors an explicit active `category_code` first.
- `adjustPool` (`lib/voucher-paid-helpers.ts`): venture_pool→`profit_in`/`expense_out`,
  invoice_payout_pool→`accumulate`/`release`, dept_pool_*→`np_in`/`expense_out`.
  **Throws on any failure** (2026-06-11 fail-loud audit). `applyVoucherPaidSideEffects`
  was deleted the same day (dead code).

---

## 1. Invoices / Billing

States: `draft → issued → paid | paid_via_netting` (void of the receipt returns to `issued`).

| Path | Trigger | Writes / side effects |
|---|---|---|
| Create (manual / multi-line / copy) | Finance · `billing/actions.ts#createManualInvoice` / `#createMultiLineInvoice` / `#copyInvoice` | `mint_invoice_no` RPC (advisory lock) → `invoices` row status=draft (+`invoice_lines` per line, mig 275). No GL. Line-insert failure deletes the draft invoice (best effort, no tx). |
| Auto-generate | Finance · `#generateMonthlyInvoices` → `generate_monthly_invoices` RPC | Draft invoices per active marketing_project contract. No GL. |
| Issue (single) | Finance · `#approveInvoice` | draft→issued. **GL (throws on failure):** Dr 3030 AR / Cr revenue — per `invoice_lines.category_code` (multi-line, one Cr per line) or `invoices.category_code`, fallback `fallbackRevenueGlCode` (5020/5000). JE date = `invoiceJeDate` (invoice_date → period month-end → today). If `billable_to_type='dept_pool'`: 2nd JE **Dr 9051–9055 / Cr 3030**, segment = `deptNameToSegment(paying dept)` — the expense lands in the PAYER's P&L at issue time. |
| Issue (bulk) | Finance · `#approveInvoicesForPeriod` | Batch UPDATE draft→issued for period, then same per-invoice JEs as single issue (throws per failed invoice; earlier invoices in the loop stay posted). |
| Settle (single, bank) | Finance · `payments/actions.ts#createPaymentVoucher` (credit `billing_payment` + `invoice_id`) | See §2 credit path. Invoice issued→`paid`. |
| Settle (single, netting) | Same, `payment_method='netting'` on a dept_pool-billed invoice | No bank touch, no GL (expense JE already posted at issue). `dept_pools` `inter_billing_out` row debits the paying dept (throws if dept unresolvable) + mirror PVS row (role='mirror', acct 9051–9055). Invoice → `paid_via_netting`. |
| Settle (consolidated) | Finance · `billing/actions.ts#settleInvoicesConsolidated` | N same-payer issued non-dept_pool invoices → ONE OR voucher (status=paid, `invoice_id` NULL, target_pool=venture_pool). PVS row pool=venture_pool acct=3030. Bank cache via `bump_bank_for_paid_credit` RPC (**throws**). Per-invoice pool credit `np_in` via `adjustPool` + `INVOICE_BILLING_MODE_TO_POOL`. **GL: one JE per segment** (grouped by `segmentForBillingMode`): Dr bank GL / Cr 3030 (**throws**). Invoices → paid + `settlement_voucher_id` (the `credit_dept_pool_on_invoice_paid` trigger does NOT fire — handled in code). |
| Void paid receipt | Finance/Principal · `payments/actions.ts#voidPaidReceipt` | See §2. Un-settles linked invoices (`paid` AND `paid_via_netting` → `issued`, checked errors). Netting receipts now fully voidable (mig 20260611010000). |
| Credit note | Finance create `#createCreditNote` (mint via `mint_credit_note_no`), Principal `#approveCreditNote` | `credit_notes` draft→approved. Inherits billable_to from invoice. **No GL, no pool** at approval — application deferred to statements. |

Notes/quirks:
- `invoice_no` / `credit_note_no` are consumed even if a later insert fails (no rollback of the sequence).
- Inter-billing expense account lookup: `chart_of_accounts` `type='expense'` + `ILIKE 'Inter-billing % <DeptName>'` — name-based; renaming a dept or its COA row breaks routing.

---

## 2. Payment Vouchers & Official Receipts

Numbering: debit `HV-PV-YYYYMM-NNNN`, credit `HV-OR-YYYYMM-NNNN`
(count-based sequence; advisory lock mig 178, residual race risk).

Debit states: `draft → pending_approval → paid` (or `voided` from draft/pending).
Credit states: `paid` on creation (auto-complete) → `voided` via `voidPaidReceipt`.

### Create — `payments/actions.ts#createPaymentVoucher`
- Validation: bank required unless `payment_method='netting'` (mig 242/251);
  `billing_payment` requires open invoice + no existing voucher; loan-repayment
  tagging (`fund_source_id` XOR `loan_id` + `repayment_breakdown` summing to amount)
  on debit only.
- `payment_vouchers` insert. Debit: status=draft. Credit: status=paid +
  approved/executed stamps + `payment_date` (form value, mig 276, else today).
- `payment_voucher_sources` (PVS, mig 205): debit = user rows
  (pool + amount + `account_code` NOT NULL + optional override triple, sum=amount);
  credit = one synthetic row (pool=target_pool default venture_pool, acct = form
  account picker, default 3030 for billing_payment).

### Credit auto-complete side effects (in create)
1. Bank cache: `bump_bank_for_paid_credit` RPC (+amount) — **throws on failure**
   (fixed 2026-06-11; was console.error). Skipped for netting.
2. Pool: `adjustPool(target_pool, 'in')` — throws on failure.
3. Netting only: direct `dept_pools` insert `inter_billing_out` for paying dept
   (bypasses sufficiency trigger — forced obligation; throws on failure) + mirror
   PVS row (role='mirror', excluded from sum check by trigger; throws on failure).
4. GL (skipped for netting): **Dr bank GL / Cr `account_code` (form picker, default
   3030)** — fixed 2026-06-11: credit line uses the picked account (e.g. 3071 Other
   Debtor), no longer hardcoded 3030. Segment from invoice billing_mode. JE date =
   payment_date. **Throws on failure** (fixed 2026-06-11).
5. Invoice → `paid` / `paid_via_netting`.

### Approve (debit) — `approve_single_voucher` RPC (latest: mig 20260611020000)
Single atomic Postgres tx. Principal-only, period-open check, self-approval block,
no group_id (groups use `approve_voucher_batch[_partial]`, mig 171/182 — same logic
per voucher, aggregate bank pre-check, per-row approve/reject).
**Dates (mig 20260611020000):** GL transaction_date / period_month / JE-YYYYMM
entry_no = `COALESCE(voucher.payment_date, approval day)` — the P&L lands on the
date Finance put on the PV, not Principal's approval day. `payment_date` is no
longer overwritten at approval. Repayment rows use `LEAST(payment_date, today)`.
Period-lock is checked against the JE date (per voucher in the batch RPCs).
1. Bank row `FOR UPDATE`, sufficiency check (debit), cache `current_balance ±= amount`.
2. Voucher → paid (race-guarded), approval_request → approved.
3. Pools: debit — `apply_pool_adjustment(pool,'out')` per PVS row (`expense_out` /
   venture `expense_out`-or-`fund_out` if loan-linked); **skipped entirely for
   `internal_transfer`** (mig 20260606035000). Dept-pool sufficiency trigger blocks
   overdraw unless Principal passed `p_allow_overdraw` (GUC, mig 20260606020000).
   Credit — `apply_pool_adjustment(target_pool,'in')`.
4. Repayment sync (if breakdown + fund_source_id/loan_id): insert
   `fund_source_repayments` / `repayments` rows **interest → penalty → principal**
   (mig 20260606010000 — principal last, else the fully-repaid trigger blocks the tx);
   newest pending `overdue_records` → paid (loan path).
5. GL:
   - credit: Dr bank GL / Cr **3030** (note: RPC path hardcodes 3030; the action-layer
     auto-complete path uses the form account).
   - `payroll_bank_transfer` / `internal_transfer` / `expense` / `claim_payout`:
     **one segment-tagged JE per PVS row** — Dr `COALESCE(override_gl, account_code,
     9030|9000)` / Cr bank GL, segment = `pool_key_to_segment(pool)`.
   - all other debits: single JE, Dr per PVS row with forced defaults for
     loan disbursement **3020**, dept_expense_settlement **4050**, `loan_repayment`
     **4000**, `billing_payment` **4050**, `salary_payout` **4020** (these ignore the
     per-row account); `claim_payout`/`expense`/else **9000** honor the row account.
     Single Cr bank GL line.

### Other lifecycle
- `#submitForApproval`: draft→pending_approval + `approval_requests` row.
- `#updatePaymentVoucher`: draft/pending only; TOCTOU-guarded; replaces PVS rows
  (delete + verify zero + insert); loan-repayment amounts immutable.
- `#voidVoucher`: draft/pending→voided + reject linked approval.
- `#copyPaymentVoucher`: header + PVS rows → new draft (drops invoice/loan/fund-source links).

### Void paid receipt — `#voidPaidReceipt` (credit + paid only)
1. Bank: `bump_bank_balance` RPC (−amount) — **skipped when `payment_method='netting'`**
   (no money ever moved). Throws on failure.
2. GL: every JE with reference_type='payment_voucher' reversed (swap Dr/Cr, keep
   segment, reference_type='payment_voucher_void') — **throws on failure** (fixed 2026-06-11).
3. Pools: `reverse_voucher_pool_rows(p_voucher_no)` SECURITY DEFINER RPC
   (mig 20260611010000) — reverses EVERY pool row matching `'PV <no>:%'` across
   dept_pools / venture_pool / invoice_payout_pool. New txn types `void_in`/`void_out`
   bypass sufficiency+approval checks; idempotency guard on `'VOID <no>:%'` descriptions.
   Covers consolidated per-invoice credits, single target_pool credit, AND the
   netting `inter_billing_out` paying-side row. Throws on failure.
4. Invoices un-settled: `settlement_voucher_id` linkage or `invoice_id`,
   `paid`/`paid_via_netting` → `issued` (checked errors).
5. Voucher → voided (race-guarded on still-paid).

---

## 3. Loans & Fund Sources

### Fund sources (fund-in: HV borrows)
States: `pending_approval → active → matured | repaid` (`cancelled` path incomplete).

| Path | Trigger | Writes / side effects |
|---|---|---|
| Create | Finance · `fund-in/actions.ts#createFundSource` | `fund_sources` pending_approval (+ optional BS `account_code`, mig 247) + `approval_requests` `new_fund_source` (orphan source deleted if queueing fails). dept_pool type pre-checks source pool balance. No GL. |
| Approve | Principal · `approvals/actions.ts#approveRequest` (new_fund_source branch) | Status→active. **venture_pool `fund_in`** row (throws). Primary bank cache `+= amount` (direct UPDATE, not RPC). **GL (non-dept_pool): Dr bank GL (primary, fallback 3000) / Cr `fund_sources.account_code` ?? 4000** Fund Sources Payable. **GL (dept_pool type): Dr `DEPT_POOL_GL[dept]` / Cr 1010 HV Operating Fund** + `dept_pools` `expense_out` debit of the source dept (no bank/liability JE — equity reclass instead). |
| Amend | Principal · `#amendFundSource` → `amend_fund_source` RPC | In-place rate/tenure/date/compound update. No GL. |
| Mature | Finance · `#markFundSourceMatured` | active→matured. No GL. |
| Cancel | Finance · `#cancelFundSource` | Files `approval_requests` (`tier_change` reused) — **no executing reversal RPC exists**; approval changes nothing financially. |
| Repay (via debit PV) | Finance creates PV with `fund_source_id` + breakdown → `approve_single_voucher` | `fund_source_repayments` rows (interest→penalty→principal); `check_fund_source_fully_repaid` trigger flips active→repaid. GL: **Dr 4000 (forced) / Cr bank GL** + bank cache −. Pool: PVS rows debited (typically venture_pool `expense_out`). |

Quirk: `DEPT_POOL_GL` in `approvals/actions.ts` (Marketing 3030, Finance 3040, HR 3050,
Director Office 3070, Director 3080, labelled "equity mirror", mig 197) **collides with
post-238 asset codes** (3030 = AR–Subs, 305x = Loans Receivable leaves). Verify the live
COA before trusting a dept_pool fund-source JE.

### Loans (fund-out: HV lends)
States: `pending_approval → active → fully_repaid | cancelled`.

| Path | Trigger | Writes / side effects |
|---|---|---|
| Create | Finance · `fund-out/actions.ts#createLoan` → `create_loan_with_approval` RPC (10-arg, mig 239) | One tx: `loans` pending_approval + `approval_requests` new_loan + paired disbursement PV (pending_approval, `voucher_type='other'`, PVS pool=venture_pool acct=BS disbursement account) + PV approval — both approvals share `group_id`. Disbursement account must be BS-classified. No GL. |
| Approve (combined) | Principal · `approvals/actions.ts#approveRequestGroup` | Sequential (NOT one tx): both approvals→approved; loan→active (trigger backfills `disbursement_date`); PV→paid; **primary bank cache −= amount (direct UPDATE)**; venture_pool `fund_out` (throws); **GL: Dr 305x leaf (`resolveLoansReceivableLeaf`) / Cr primary bank GL** (throws; header 3020 posting rejected by mig 256 trigger). |
| Repay (direct) | Finance · `#recordRepayment` (+ `#recordLoanRepaymentReceived` wrapper splitting interest→penalty→principal) | `repayments` row. Principal-type only: venture_pool `loan_repayment_in`. Bank cache: `bump_bank_balance` RPC +amount (throws). **GL: Dr bank GL / Cr 305x leaf (principal) · 7000 Interest Income (interest/netting) · 7010 Penalty Income (penalty)** (throws). Full principal → trigger flips fully_repaid. |
| Repay (via debit PV) | PV with `loan_id` + breakdown → `approve_single_voucher` | `repayments` synced (interest→penalty→principal), overdue marked paid. GL per voucher rules (§2). **Skips venture_pool `loan_repayment_in`** — see gaps. |
| Cancel (pending) | Finance · `#cancelLoan` → `cancel_loan_and_approval` RPC | loan→cancelled, both approvals→rejected, paired PV→voided. No GL (nothing posted yet). |
| Cancel (active) | Finance `request_loan_cancel` → Principal `#approveRequest` → `execute_loan_cancel` RPC (mig 229, atomic) | Blocked if any repayment exists. venture_pool `fund_in` reversal; loan→cancelled; disbursement PV→voided; primary bank cache += principal; reversing JE. **Stale codes:** mig 229 still posts Dr bank GL (fallback `'1010'`) / Cr `'1020'` — pre-238 codes never updated to 305x leaves. Original disbursement JE stays; reversal is a new entry. |
| Overdue detect | Finance · `overdue/actions.ts#detectOverdue` | `overdue_records` upsert for previous month where paid < expected interest. Informational only — no GL/penalty automation; escalation is a manual approval flow. |

---

## 4. Claims / Payroll / Dept Requests / Statements

### Claims — `claims/actions.ts`
States: `pending → approved → paid` (or `rejected`).
- Submit (any role): `claims` row, `source_pool` default venture_pool. No GL.
- Approve: project claims → Finance/Principal; benefit claims → HR/Principal.
  **Project only:** auto-drafts PV (`claim_payout`, debit, pending_approval,
  PVS pool=`source_pool` acct **9000** G&A) + `approval_requests` for Principal.
  Money/GL move only when the PV is approved (§2: per-segment JE Dr 9000 / Cr bank,
  pool `expense_out`).
- **Benefit claims draft NO voucher** → no GL/pool path at all (see gaps).
- `markClaimPaid`: status flip only, display-side.
- If Principal rejects the auto-drafted PV the claim stays `approved` (no cleanup).

### Payroll disbursement — `hr-costing/payroll/actions.ts` + `payments/payroll-requests/actions.ts`
1. HR submits run: `submit_payroll_to_principal` RPC → `payroll_runs` submitted. No GL.
2. Principal approves run; HR `requestPayrollPayment` → `payroll_payment_requests`
   (target_pool hardcoded `dept_pool_hr`). No GL.
3. Finance `#generatePvFromRequest(requestId, sourceBankId, sources[])`:
   PV `payroll_bank_transfer` debit pending_approval; PVS = 1–5 dept-pool allocation
   rows, each acct **9030** Salary Expense, sum=request amount; bank balance pre-checked.
   Request → `pv_generated`. **`approval_requests` insert now FAILS LOUD**
   (fixed 2026-06-11; was a silently missing queue entry).
4. Principal approves (usually batch): pools debited `expense_out` per allocation;
   **GL: one JE per source row, Dr 9030 / Cr bank GL, segment =
   `pool_key_to_segment(pool)`** (mig 20260606035000/060000).

### HR costing snapshot — `hr-costing/actions.ts`
Submit: `hr_cost_submissions` + `approval_requests` `hr_costing` — **insert fails loud**
(fixed 2026-06-11). Approve: `execution_state` → `approved_for_execution`; Finance
executes separately. No direct GL at approval.

### Dept payment requests — 4 stages (`dept-pool/actions.ts`, `payments/dept-requests/actions.ts`, mig 173/176/178)
1. Dept manager: `submit_dept_payment_request` RPC → `dept_payment_requests`
   `pending_principal_expense` + approval row. No GL/pool.
2. Principal #1: `approve_dept_payment_expense` RPC → **`dept_pools` `expense_out`
   debit NOW** (reserves funds), request → `pending_finance_pv`. No GL.
   **No rollback exists if later stages fail/reject** (see gaps).
3. Finance: `generate_pv_for_dept_request` RPC → PV (`expense`, debit, **draft**,
   `reference_type='dept_payment_request'`, `source_pool=dept_pool_<dept>`) + approval
   row. NOTE: the RPC writes **no PVS row** — Finance must add source rows via edit
   before approval can route (approve RPC raises on 0 PVS rows); dept-pool rows added
   there get debited AGAIN at stage 4 on top of the stage-2 reservation.
4. Principal #2: `approve_single_voucher` → bank −, **GL via the per-segment
   `expense` branch (Dr PVS account_code ?? 9000 / Cr bank GL)** — the
   dept_expense_settlement `4050` default in the ELSE branch is unreachable for
   `voucher_type='expense'` since mig 20260606050000. Trigger
   `complete_dept_payment_request_on_pv_paid` → request `completed`.

### Monthly statements — `statements/actions.ts`
States: `draft → issued → paid`. Display-only throughout:
- Generate: `monthly_statements` + `monthly_statement_lines` (invoice lines +
  contra lines = fund-source interest, simple not compound). **No GL, no pools.**
- Issue / markPaid: status + timestamp flips only. Money moves exclusively via
  payment vouchers; do not add ledger writes here (explicit code comment).
- Negative net (HV owes the sub) is displayed but never auto-creates a PV.

---

## Known gaps / red flags (2026-06-11)

Remaining UNFIXED findings. (Already fixed today, so NOT gaps: fail-loud on
consolidated-settle/credit-PV/void GL+bank+pool failures, adjustPool throwing,
payroll-request + hr-costing approval-queue inserts throwing, credit-GL account
picker honored, netting void support incl. `reverse_voucher_pool_rows`,
`applyVoucherPaidSideEffects` removed.)

1. **Loan disbursement is primary-bank-only.** `approvals/actions.ts#approveRequestGroup`
   debits the `is_primary` bank (direct cache UPDATE, not the `bump_bank_balance` RPC)
   and credits its GL code regardless of which bank actually pays. No bank picker on
   the loan form.
2. **PV-path loan repayments skip venture_pool.** `approve_single_voucher` syncs
   `repayments` but never writes `loan_repayment_in`; only the direct
   `fund-out/actions.ts#recordRepayment` path does. venture_pool understates principal
   inflows for PV-settled repayments.
3. **Benefit claims have no GL path.** `claims/actions.ts#approveClaim` only drafts a
   PV for `claim_type='project'`; benefit claims terminate at status flips with no
   voucher, no pool debit, no JE.
4. **Dept-request pool debit has no rollback.** Stage-2 `approve_dept_payment_expense`
   debits the dept pool immediately; if Finance never generates the PV or Principal
   rejects it, the `expense_out` reservation is never reversed. (Related: stage-3 RPC
   writes no PVS row, and dept-pool source rows added at edit time are debited a second
   time at PV approval.)
5. **Stale pre-238 account codes in `execute_loan_cancel` (mig 229).** Active-loan
   cancellation posts Dr bank-GL-fallback `'1010'` / Cr `'1020'` — codes that meant
   Bank/Loans-Receivable pre-unification but are equity codes (or nonexistent leaves)
   in the current COA. Needs re-pointing at the 305x borrower leaf.
6. **`DEPT_POOL_GL` map (approvals/actions.ts) collides with post-238 asset codes**
   (3030/3040/3050/3070/3080 labelled equity vs 3030 AR–Subs / 305x loan leaves).
   dept_pool fund-source approval JEs may post to the wrong accounts.
7. **Voucher numbering is count-based** (`COUNT(*)+1`); advisory locks (mig 178/180)
   narrow but don't eliminate the collision window across all minting sites.
8. **Fund-source cancellation has no executing RPC** — the `tier_change` approval is
   recorded but nothing reverses the liability/bank/venture_pool.
9. **Batch approve RPCs lag single** (`approve_voucher_batch[_partial]`, only
   reachable via grouped approvals — payroll groups today): repayment rows still
   insert principal-FIRST (single was reordered in mig 20260606010000), and all
   debit GL goes through the single-JE branch with NO segment tag (single got
   per-segment JEs in migs 20260606035000/050000). Dates were aligned with single
   in mig 20260611020000.

---

## Appendix A — State maps

```
invoices:          draft ──issue──▶ issued ──settle──▶ paid | paid_via_netting
                                      ▲                       │
                                      └────── voidPaidReceipt ┘
payment_vouchers
  debit:           draft ─▶ pending_approval ─▶ paid          (voided from draft/pending)
  credit (OR):     paid (on creation) ─▶ voided (voidPaidReceipt)
fund_sources:      pending_approval ─▶ active ─▶ matured | repaid   (cancel: request only)
loans:             pending_approval ─▶ active ─▶ fully_repaid | cancelled
claims:            pending ─▶ approved ─▶ paid   (project: PV rides alongside)
payroll_runs:      draft ─▶ submitted ─▶ approved ─▶ paid
payroll_payment_requests: submitted ─▶ pv_generated (─▶ cancelled)
dept_payment_requests: pending_principal_expense ─▶ pending_finance_pv
                        ─▶ pending_principal_pv ─▶ completed
monthly_statements: draft ─▶ issued ─▶ paid   (display-only)
credit_notes:      draft ─▶ approved
```

## Appendix B — GL posting quick reference (verified against code 2026-06-11)

| Event | Dr | Cr | Segment | Source |
|---|---|---|---|---|
| Invoice issue | 3030 AR | category_code or 5020/5000 | auto (invoice→billing_mode) | `billing/actions.ts#approveInvoice` |
| Invoice issue, inter-billing | 9051–9055 | 3030 | paying dept | same |
| Settle (single, bank) | bank GL | form acct (def. 3030) | billing_mode | `payments/actions.ts#createPaymentVoucher` |
| Settle (netting) | — none — | — | — | expense already posted at issue |
| Settle (consolidated) | bank GL | 3030 | per billing_mode group | `billing/actions.ts#settleInvoicesConsolidated` |
| Void receipt | swap of originals | swap | preserved | `#voidPaidReceipt` (`payment_voucher_void`) |
| PV approve — credit (RPC) | bank GL | 3030 (hardcoded) | none | `approve_single_voucher` |
| PV approve — payroll/internal/expense/claim | override→PVS acct→9030/9000 | bank GL | `pool_key_to_segment(pool)` per row | same |
| PV approve — loan_repayment (fund source) | 4000 forced | bank GL | none | same |
| PV approve — billing_payment / salary_payout debit | 4050 / 4020 forced | bank GL | none | same |
| Fund source activate | bank GL | acct_code ?? 4000 | auto | `approvals/actions.ts#approveRequest` |
| Fund source activate (dept_pool) | DEPT_POOL_GL[dept] ⚠ | 1010 | auto | same (stale-code watch, gap 6) |
| Loan disburse (combined approve) | 305x leaf | primary bank GL | auto | `#approveRequestGroup` |
| Loan repay direct — principal | bank GL | 305x leaf | auto | `fund-out/actions.ts#recordRepayment` |
| Loan repay direct — interest/netting | bank GL | 7000 | auto | same |
| Loan repay direct — penalty | bank GL | 7010 | auto | same |
| Loan cancel (active) | bank GL (fallback '1010' ⚠) | '1020' ⚠ | treasury | `execute_loan_cancel` mig 229 (gap 5) |

Bank cache writers: `bump_bank_balance` / `bump_bank_for_paid_credit` RPCs
(SECURITY DEFINER, finance/principal) on receipt create, void, and direct loan
repayment; `approve_single_voucher` and the loan/fund-source approval branches still
UPDATE `bank_accounts.current_balance` directly inside their own paths.
