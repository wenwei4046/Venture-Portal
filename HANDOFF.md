# HOUZS Venture Portal — Session Handoff (checkpoint 2026-06-11)

> Context-window handoff. Read this first to continue. User communicates in 华语 (Mandarin).
> Supersedes the 2026-06-08 checkpoint (still valid below).

## Latest session (2026-06-10 → 11): GL reports rebuild, full document audit, fail-loud sweep

Highlights (each verified: tsc clean, 283 tests, next build, deployed via `git push origin main`):

### Fail-loud sweep + receive-form GL fix + netting void (the "开工" queue, all 4 items done)
1. **GL/pool/bank failures now throw** instead of console.error (silent drift was the
   root cause of every pool/cache reconciliation gap found in the audit):
   - `billing/actions.ts#settleInvoicesConsolidated` — bank bump + per-segment GL post.
   - `payments/actions.ts#createPaymentVoucher` credit path — `bump_bank_for_paid_credit` + GL post.
   - `payments/actions.ts#voidPaidReceipt` — GL reversal (now includes `entry_no` in msg).
   - `lib/voucher-paid-helpers.ts#adjustPool` — full rewrite: checks every insert's
     `error` (supabase-js doesn't throw!), unknown pool names throw too.
   - `payments/payroll-requests/actions.ts` — approval-queue insert now throws; moved
     AFTER the request→PV link so a failure can't be retried into a duplicate PV.
   - `hr-costing/actions.ts` — approval-queue insert throws (period-unique guards retry).
   - Deleted dead `applyVoucherPaidSideEffects` (zero callers, swallowed-error style).
2. **Receive form account picker now drives the GL credit** (user decision 2026-06-03):
   `createPaymentVoucher` credit JE credits `accountCode ?? '3030'` instead of hardcoded
   3030. Invoice settles unchanged (their picker defaults to 3030); non-AR receipts
   (e.g. 3071 Other Debtor) stop draining AR. Consolidated settle keeps literal 3030 —
   that path is genuinely AR. Relevant to the open AR 12,647.54 gap below.
3. **Netting void path** — `voidPaidReceipt` now: skips bank reversal when
   `payment_method='netting'`; reverses ALL pool rows via new SECURITY DEFINER RPC
   `reverse_voucher_pool_rows(p_voucher_no)` (mig `20260611010000`, also in
   supabase/migrations/): new `dept_pool_txn_type` values `void_in`/`void_out`
   (balance view updated; monthly In/Out cards unaffected by design), idempotency
   guard on `VOID <voucher_no>:%` descriptions, matches rows by the `PV <voucher_no>:`
   description prefix. **Discovery:** the old adjustPool-based void reversal NEVER
   worked for dept pools (expense_has_approval CHECK + RLS rejected it, error
   swallowed) — voided receipts silently left pools credited. RPC covers consolidated,
   single-settle, AND the paying-side `inter_billing_out` row from netting.
4. **docs/FLOWS.md** — condensed as-built flow map of all document lifecycles
   (invoices, PV/OR, loans/fund-sources, claims/payroll/dept-requests/statements),
   account codes verified against current code (agent reports had stale pre-238
   codes). Ends with the remaining red-flag list.
5. **PV GL date = Finance's payment date, not Principal's approval date** (user
   report: P&L expenses showed the approve day). Mig `20260611020000` patches
   approve_single_voucher / approve_voucher_batch / approve_voucher_batch_partial
   from their LIVE definitions (pg_get_functiondef + anchored replaces, mig-156
   style; every anchor verified or the migration fails loud): payment_date no
   longer overwritten (COALESCE keeps Finance's value), JE transaction_date /
   period_month / JE-YYYYMM entry_no use COALESCE(payment_date, today),
   repayment rows use LEAST(payment_date, today), period-lock checked against
   the JE date per voucher. App side: createPaymentVoucher stores payment_date
   for DEBIT drafts too (was credit-only), updatePaymentVoucher + EditPaymentForm
   can edit it while draft/pending. Smoke-tested in a rolled-back tx
   (JE landed on the backdated payment_date ✓). Historical audit: all existing
   create-day vs JE-day drifts are WITHIN June 2026 (no month crossings), so
   monthly P&L attribution was never wrong — day-level backfill offered to user,
   pending their decision. Pre-fix vouchers have payment_date == approval day
   (the original Finance date was overwritten and is unrecoverable).
   **Latent (noted, not fixed):** approve_voucher_batch[_partial] still insert
   repayments principal-FIRST (single was fixed in mig 20260606010000 to
   interest→penalty→principal) and post unsegmented single JEs (no per-segment
   branch like single's mig 20260606050000) — only matters for grouped voucher
   approvals (payroll groups today), queue if needed.

(Reports rebuild, font, sidebar, repayment-schedule, and all data corrections from
2026-06-10→11 are documented in the conversation log; data corrections were direct
SQL per the established convention. Key closures: TB Dr=Cr ties at 0.00; 2990
payable = 228,613.75 exact (155k netting reclassed via 4 dated JEs Dr 3054/Cr 4051);
LO#11/BI#11 reduced 25k→10k per user; CONTS receivable ties at 617,200.)

### Full finance-module verification (2026-06-11, four read-only agents + fixes)
All four domains verified against live data. Results:
- **Billing/invoices: 8/8 checks clean.** Every non-draft invoice has exactly one
  revenue JE (amounts tie); all 7 dept_pool invoices have the 9051-55 expense JE;
  all 46 paid invoices tie to settlement vouchers (bulk vouchers = exact sum of
  their invoices); JE months align with period_month; invoice_lines sums tie;
  no orphans. Informational: 36 May invoices credit 9091 (cost-recovery rebill
  by category_code — by design, reduces expense instead of grossing revenue).
- **Payments/vouchers: all clean** (JEs balanced, PVS sums tie, both bank caches
  = GL to the cent, the one voided receipt fully reversed, no orphans/dup nos).
  Agent flagged PV-0027 (120k) as "no postings" — FALSE ALARM: its JE is
  reference_type='loan' (combined-approval path) + venture_pool fund_out exists;
  bank cache ties. Real fix applied: pv.journal_entry_id backlink was NULL →
  set to JE-202606-0103 (direct SQL).
- **Treasury:** all 4xxx/305x leaves tie app↔GL except known counterparty items.
  **Fixed: fund_source_outstanding view excluded payment_type='netting'** → HC
  showed 53,613.75 too high in app (L32 knock-off is a non-cash principal
  reduction). Mig `20260611030000` counts netting as principal on the FS side
  (loans side unchanged BY DESIGN — loan netting posts 7000 interest-style);
  repayment-schedule page's this-month split aligned. HC now 593,163.78 = GL.
  New findings — user ruled on all three (2026-06-11):
  ① GL 7000 interest income short 28,816.71 vs app records (FY2025 backfilled
  interest LO#5/#7/#19 never posted to 7000, likely inside opening JVs) —
  **user: do NOT post a catch-up for now**; leave as documented note. The
  "orphan 1,400" was investigated and is NOT an orphan: OR-000027 manual JV
  2026-04-29 (THE CONTS, Dr 3000 5,000+1,400 / Cr 3053 5,000 "REFUND TO MR
  LIANG" / Cr 7000 1,400 "INTEREST INCOME OF FUND 2%") — real receipt, in GL
  and bank; only the app-side repayments table lacks a matching row.
  ② Hookka NOT split wrongly — user confirmed 3055 Hookka Manufacturing and
  3058 Hooka Industries are TWO different companies. Not an issue; leaves stay.
  ③ Backdated rows: fixed by direct SQL (user-approved) — instrument start
  dates aligned to first recorded movement (all non-compound, maturity NULL,
  nothing computes from these dates): LO#7 disbursement → 2025-04-05, LO#5 →
  2025-05-05, FS Liang-60k → 2025-04-05, FS WS-90k → 2025-05-05, FS HC-L32 →
  2026-03-26 (the knock-off JV date). 0 before-start rows remain on either side.
- **Pools/payroll/claims/statements:** dept_pool_balances view = manual recompute,
  all 5 pools still tie their GL segments to 0.00 post re-dating; venture_pool no
  legacy-type activity; invoice_payout_pool 37,218.37 all-accumulate; statements
  2026-05 all tie. Payroll runs / claims / dept_payment_requests tables are
  EMPTY — the known design gaps there (benefit-claim GL, dept-request rollback)
  currently have RM 0.00 exposure.

### Still open (awaiting user verification with counterparties)
- 4054 LWS 450 · 4055 LWL 300 · 4056 CMK 6,936 · AR 3030 vs open invoices 12,647.54.
- Red flags not yet fixed: loan disbursement primary-bank-only; PV-path loan
  repayments skip venture_pool; benefit claims have no GL path; dept-request pool
  debit has no rollback. See docs/FLOWS.md "Known gaps".

---

## Latest session (2026-06-08): Finance hardening, treasury fixes, billing/PV UX

Worked DIRECTLY (no superpowers flow — per CLAUDE.md). All DB changes applied via
Supabase MCP `apply_migration` AND saved to `supabase/migrations/` for parity
(Vercel builds the Next app only; migrations are not run by CI).

### Bug fixes (root-caused + deployed)
1. **Repayment ordering crash (two paths).** A principal repayment that clears the
   outstanding flips the loan/fund-source to fully_repaid/repaid mid-transaction
   (trigger), then the block-repayment trigger rejects the interest/penalty legs →
   whole tx aborts (surfaced as the redacted "Server Components render" error).
   Fixed by recording **interest+penalty BEFORE principal**:
   - `recordLoanRepaymentReceived` (fund-out/actions.ts) — commit `7f94b10`.
   - `approve_single_voucher` RPC (PV-approval path) — mig `20260606010000`.
2. **Dept-pool overdraw, opt-in.** `approve_single_voucher` gained
   `p_allow_overdraw` → sets txn-local GUC `app.allow_pool_overdraw`; trigger
   `check_dept_pool_sufficient` honors it. UI: "允许部门池透支" checkbox on the
   approval screen (`ApprovalActions`). Default still blocks. mig `20260606020000`.
3. **internal_transfer** voucher_type = pure bank→bank move: skips dept-pool
   deduction, posts per-segment GL, and credits the DEST bank cache (trigger).
   migs `…030000` (dest-cache trigger), `…035000` (RPC), `…040000` (trigger incl
   internal_transfer). UI: "这是内部转账" checkbox on `NewPaymentForm`.
4. **expense / claim_payout → per-segment GL** (root cause of dept_pool↔GL drift):
   was one corporate-segment JE; now one segment-tagged JE per source pool. mig
   `20260606050000`.
5. **pool_key_to_segment**: `dept_pool_director` → `'director'` (was wrongly
   `director_office`). mig `20260606060000`. Only `approve_single_voucher` uses it.

### Features (deployed)
- **Self-service edit (Principal)** of ACTIVE loans + fund sources: rate / terms /
  期数 / 起始日 / 利滚利 toggle. RPCs `amend_loan`, `amend_fund_source`
  (SECURITY DEFINER, principal-only) — mig `20260606000000`. UI: `LoanAmendForm`,
  `AmendFundSourceForm`, "修改条款" buttons on the loan + fund-source detail pages.
  **Pending phase 2**: Finance-initiated edits via the approval queue (not built).
- **Repayment schedule**: new **利滚利挂账** section (compound items show principal
  0, current balance, 累计已滚利息, 本月利息; works for any term) + settled-this-month
  items shown as 已收/已付 done rows (full-plan view). `listPayableFundSources`
  gained `opts.includeSettledInMonth`.
- **Fund Out list**: status tabs (Pending/Active/Repaid/Cancelled/All), like Fund In.
- **Billing**: Copy invoice (`copyInvoice` → new draft, current month) on each row;
  Description as its own column; batch-settle "全选可结算发票" moved into the search
  toolbar (`SortableTable` gained a `toolbarRight` slot); batch print uses the
  existing `/billing/invoice-doc?ids=`.
- **Payments (PV/OR)**: per-department source breakdown table on the VIEW + APPROVE
  pages; **Copy PV** (`copyPaymentVoucher` → new draft → edit); **Print PV/OR PDF**
  new route `/payments/voucher-doc` (?id=/?ids=) + format `_format/voucher-doc-pdf.tsx`
  (mirrors invoice-doc); Description column on the payments list.
- **Excel-style per-column value filter** built into `SortableTable` (funnel in
  header → checkbox facet of distinct values + search + (All)/(Blanks)/Clear,
  fixed-positioned). Enabled on PV/OR (Category/Pool/Payee/Description/Status) and
  invoice (Company/Mode/Description/Status) lists. Composes with search + sort.

### Data corrections (direct SQL, recorded for audit — NOT in migrations)
- **2026-06-11: 2990 grossed up in GL — 4 reclass JEs Dr 3054 / Cr 4051**
  (45,000 @04-07 LO#29 · 10,000 @04-30 LO-NEW-2990 · 55,000 @05-07 + 45,000
  @06-08 = LO#33's 100k), total 155,000. The accountant's workbook had NETTED
  HV's loans to 2990 against the deposit payable (4051 debits described as
  "rental pay on behalf" / "Carress→2990" / "fund transfer"); the app records
  gross. Verified after: 2990 payable app = GL = 228,613.75 exactly; GL 3054 =
  167,588.80 = 155,000 loans + 12,588.80 expense-paid-on-behalf (June expense
  PV split to 3054 — a real non-loan receivable, app loans module doesn't track
  it). TB 0.00, banks + dept pools all tie.
  **Remaining known small gaps** (legacy baseline noise, awaiting user
  verification with counterparties): 4054 LWS 450 · 4055 LWL 300 · 4056 CMK
  6,936 · AR 3030 vs open invoices 12,647.54 (receive form hardcodes Cr 3030 —
  process fix queued).
- **2026-06-11: LO#11 / BI#11 both reduced 25k → 10k** (user: the 15k was a
  recording correction — Liang's money via Kingsley was effectively 10k in /
  10k out, never through HV's bank). App: fund_sources BI#11 amount 25,000 →
  10,000 (it had NO repayment rows — the 15k "repaid" on Liang's account was
  BI#7's 15×1,000 installments, unrelated); loans LO#11 principal 25,000 →
  10,000 + deleted the phantom 15,000 principal repayment row (2026-04-15,
  "直接还源头公司"). GL: correction JE dated 2026-04-15 Dr 4055 / Cr 3053
  15,000 (id 103ed4cb). Verified: CONTS app = GL = 617,200.00 exactly; TB
  still 0.00; Liang residual app-vs-GL gap 300 (pre-existing legacy noise).
- **2026-06-11: PV-000059 advertisement claim 2,807.34 re-pointed 9088 → 9095.**
  TB stopped tallying by exactly 2,807.34: a child account (9095 Advertisment -
  Hiring) was created UNDER 9088 Advertisement, silently turning 9088 into a
  header — and the leaf-only Trial Balance dropped 9088's one existing line
  (the 2026-05-05 recruitment-ad claim from the GL import). Moved the line to
  9095 (it IS a hiring ad). Verified: 0 postings remain on any header account,
  leaf-only Dr−Cr = 0.00. ⚠ Trap to guard later: mig 256 blocks POSTING to
  headers, but nothing stops CREATING a child under an already-posted account.
- **2026-06-11: 7 inter-billing expense JEs re-tagged corporate → marketing**
  (JE-202605-0007/0014/0021/0028/0035/0042 + JE-202606-0038 — the Dr 9051 /
  Cr 3030 twins of Marketing's utilities rebills). Root cause: the inter-billing
  expense JE inherited the INVOICE's billing_mode segment (venture_attribution →
  corporate) instead of the PAYING dept's. Code fixed same commit:
  `deptNameToSegment` (lib/billing.ts, tested) passed as explicit `segment` at
  both inter-billing JE posting sites (single + bulk issue). No bank lines
  touched — all 5 dept pools still tie GL exactly (diff 0.00).
- **2026-06-11: 17 salary-invoice issue JEs re-pointed 5000 → 5020 Salary Income**
  (credit lines only; May revenue now splits 5000 Service Revenue 59,949.19 +
  5020 Salary Income 123,924.95 = 183,874.14 unchanged). Root cause: the salary
  attribution invoices (HV-INV-202605-0043..0059) were created with no
  category_code → `revenueGlCode` fallback credited everything to 5000. Code
  fixed same commit: `fallbackRevenueGlCode` (lib/billing.ts, tested) routes the
  four *_attribution modes to 5020 when no category is picked. The 17 invoices
  also got `category_code='5020'` backfilled. NOTE: marketing salary invoices
  use `marketing_project` mode — those still need Finance to pick category 5020
  manually at creation (can't infer salary-vs-service from the mode).
- **2026-06-11: 17 invoice-issue JEs re-dated June → 2026-05-31** (+ period_month
  → 2026-05-01). Root cause: all four invoice-issue JE posting sites in
  billing/actions.ts dated the revenue JE `dayjs()` (the day Finance clicked
  Issue) — May invoices bulk-issued 4/7 June showed in JUNE's P&L. Code fixed
  same commit: `invoiceJeDate()` (lib/billing.ts, tested) = invoice_date,
  falling back to period month-end then today; applied at single + bulk issue
  and both inter-billing twins. Also fixed `HV-INV-202605-0052.invoice_date`
  year typo 0005-05-31 → 2026-05-31. Verified: 0 remaining issue-JE month
  mismatches; May revenue 183,874.14, June 0.
- **2026-06-10: HC fund source 71,457.13 split into 3 compound tranches** mirroring
  the HK loan side (the money passed HC → HV → Hookka): original row `887388ff`
  shrunk to **BI#25A 42,881.63 自2025-09** + new rows **BI#25B 22,873.50 自2025-12**
  / **BI#25C 5,702.00 自2026-03**, all `compound_interest=true` @2%/mo — symmetric
  with loans LO#25A/B/C. Sum still 71,457.13. No PV/approval referenced the
  original row. Loans LO#25A/B/C got `· 资金来源: HC` appended to repayment_terms
  (drives the Fund OUT SC badge). Schedule impact: the HC payable moves from
  "no fixed term" to the compounding tab; To repay hero unchanged (compound is
  excluded from totals).
- **2026-06-10: 9 JEs re-tagged director_office → director** (segment only, no
  amounts moved). Root cause: BOTH segment mappers (SQL `billing_mode_to_segment`
  + TS `segmentForBillingMode`) mapped `director_attribution` → `director_office`
  while its POOL is dept_pool_director — settling Director salary-attribution
  invoices forked dept_pools vs GL by 65,931.62 (Director Office GL showed
  67,249.04 vs pool 1,317.42). Re-tagged: settlement JEs `JE-202606-0097/0100/
  0101/0102` (bank-in, 65,931.62) + issue JEs `JE-202606-0027..0031`
  (AR/revenue side, invoices HV-INV-202605-0055..0059). Mappers fixed: mig
  `20260610010000` (SQL) + invoice-settlement.ts (TS, + test). Verified: all 5
  dept pools tie GL exactly (diff 0.00), total bank 163,533.09 unchanged
  (HL 1,746.32 + Alliance 161,786.77).
- **2026-06-10: HL bank cache +3,250 → 121,746.32** (= GL 3000). Root cause: two
  loan repayments recorded by Finance on 2026-06-10 (loans `3641efec` 1,500+450,
  `e6569127` 1,000+300) posted GL Dr 3000 but the JS-side cache bump in
  `recordRepayment` (fund-out/actions.ts L255) was **silently blocked by RLS** —
  `bank_accounts` UPDATE policy is principal-only, the update isn't error-checked,
  PostgREST returns success with 0 rows. Alliance unaffected (settle path bumps via
  SECURITY DEFINER trigger).
  **FIXED same day** — mig `20260610000000` adds `bump_bank_balance(uuid, numeric)`
  SECURITY DEFINER RPC (finance+principal guard null-safe fail-closed, atomic
  `+delta` so no read-modify-write race, raises on unknown bank). Swapped in at the
  3 non-principal call sites, each now error-checked + fail-loud: `recordRepayment`
  (fund-out/actions.ts), `voidPaidReceipt` (payments/actions.ts),
  `applyVoucherPaidSideEffects` (voucher-paid-helpers.ts — currently caller-less).
  The 3 principal-only direct updates in approvals/actions.ts (L160/275/605) left
  as-is (RLS permits principal; candidates for later unification onto the RPC).
  RPC verified via rollback probes: finance ✓ / hr rejected ✓ / null-role rejected ✓
  / unknown bank raises ✓. types regenerated; tsc clean; 250 tests pass.
  The Cont loan (120k, HV-PV-202606-0027) was approved after the cache fix —
  HL now ~1,746.32 (thin!), Alliance 161,786.77.
- Loan d3921b67 (CONTS): backfilled the **interest 3,000** leg lost to the ordering
  bug (repayment row + JE Dr3000/Cr7000 + HL cache +3,000), 2026-06-05.
- **HV-PV-202606-0008** (HV repaying its 2990 borrowing 45,000+900): split the
  single 3054 source (wrong — that's a receivable) into **4051 Amount Due to 2990
  45,000 + 9010 Interest Expense 900**, so it posts Dr payable/interest / Cr bank.
- **HV-PV-202606-0007** ("Transfer to Alliance for Payroll"): re-classed to
  `internal_transfer`; reversed its 4 dept-pool expense_out rows (a transfer isn't a
  dept expense — cash still the depts', staged in Alliance); GL re-posted per dept
  segment; Alliance bank cache +95,050.24.
- **HL bank cache** corrected to **19,672.56** (= real Hong Leong balance the user
  confirmed; cache was +3,000 stale). **Alliance cache** = 95,972.71.
- **Marketing claims HV-PV-202606-0010 (400.85) + 0011 (934.73) = 1,335.58**: JE
  segment re-tagged corporate→marketing (they're Marketing's spend).
- **利滚利 flags**: loans LO#15/12/11/26/16/13/14 set `compound_interest=true`
  (LO#11 also got its 15k principal recorded as repaid 2026-04, direct-to-source);
  LO#29 (2990 45k) too. **LO#25 (HK 71,457.13) split into 3 loans** LO#25A/B/C
  (42,881.63 fr 2025-09 / 22,873.50 fr 2025-12 / 5,702 fr 2026-03), all compound.
  **LO#4 left as a normal scheduled loan** (user reverted). 15 loans got
  「资金来源」remarks; 2990 LO-NEW-2990 noted "资金从 Kingsley 借过来". Kingsley
  fund source (100k, 0%) set to 12期 / repayment_date 2026-04-20.

### Reconciliation — FULLY TIED at session end
All 5 dept pools: dept_pool_balances == GL bank-segment (diff 0.00 each).
Dept-pool "Total cash available" **115,645.27** == per-bank grand **115,645.27**.
Banks: HL cache=GL=19,672.56; Alliance cache=GL=95,972.71.

### Migrations added this session
`20260606000000` amend RPCs · `…010000` repayment-order · `…020000` overdraw ·
`…030000` dest-bank trigger · `…035000` internal_transfer RPC · `…040000` trigger
incl internal_transfer · `…050000` expense/claim per-segment · `…060000`
pool_key_to_segment director fix.

### 2026-06-11: GL-driven reports rebuild (commit `3cc0a37`)
P&L / Balance Sheet / Cash Flow pages REPLACED — now built straight from
journal_lines via `src/lib/gl-reports.ts` (pure, 11 tests) + shared
`GlReportView` renderer. Format per the-conts.pages.dev reference: current |
compare | Δ% | %Rev columns, collapsible COA groups (parent_code), inline txn
drill-down, month/compare pickers + segment dropdown. BS adds synthetic
"Retained & current earnings" so A=L+E ties; CF is direct-method via COA
cash_flow_category with opening/closing reconciliation (closing cash = bank GL
sum). Exports REBUILT same day (commit `3a5f48e`): block assembly lives in
`lib/gl-report-blocks.ts` (shared by pages + exports — one source of truth),
`lib/export/gl-statement.tsx` renders xlsx/pdf; Export buttons restored on all
3 pages forwarding period/compare/segment. Old cfo-reports export formats +
orphaned components (SegmentedReport/SegmentExportButtons/RevenueGroups/
PeriodMonthPicker) deleted. Old 6-pool P&L layout replaced by the segment
dropdown. cfo-reports.ts itself stays (fetchLedgers etc. still used).

### PENDING / pick up next
1. ~~**Ledger Excel filter**~~ ✅ DONE (2026-06-09, commit `7f6c2b0`). User picked
   "keep grouped, add filters" (not flatten). `LedgerSections` gained two funnel
   facet filters in the toolbar — **Dept (segment)** + **Journal Type** — mirroring
   the SortableTable facet popover. Compose with the existing search + date sort;
   zero-match accounts hide; B/F + running balance + per-account totals preserved.
   ⚠️ Interactive verification was BLOCKED locally: the OneDrive `.next` Fast-Refresh
   loop left the whole ledger route's client components unhydrated (pre-existing
   search/sort/Apply equally dead) — verify on live instead. tsc clean, route compiles
   clean, toolbar renders the two buttons.
2. **利滚利 → GL posting (Interest-in-Suspense)** still DEFERRED — 利滚利 is
   calc+display only; `loan_outstanding`/GL don't include capitalized interest.
   COA already has `3060-3065` (Interest in Suspense — Recv) + `4060-4064` (Pay).
3. **Finance-via-approval edit** (phase 2 of self-service amend): new approval types
   `loan_amend`/`fund_source_amend` + payload + approve dispatch. Not built.
4. **Finance process-review "first 4"** (from the audit this session): (a) GL-post
   failures must fail loud / flag, not silent console.error; (b) write-action audit
   log (approvals/JE/edits/period-close); (c) auto bank↔GL + dept-pool↔GL recon page
   + month-end checklist; (d) period-lock also on Finance data entry (currently only
   blocks Principal approval).
5. (Optional) Per-row Print/Copy on the payments LIST (currently on PV detail page).

## Latest session (2026-06-03): Consolidated invoice settlement

Followed the superpowers brainstorm → spec → plan → subagent-driven build flow.
- Spec: `docs/superpowers/specs/2026-06-03-consolidated-invoice-settlement-design.md`
- Plan: `docs/superpowers/plans/2026-06-03-consolidated-invoice-settlement.md`
- Deployed to main (commits `0301b3f`..`a6db977`); live + tests (234) + build green.

Three user-facing changes:
1. **Consolidated settle (true one-voucher).** Selecting issued invoices of the SAME
   company → ONE Official Receipt voucher (amount = sum), all invoices marked paid.
   New action `settleInvoicesConsolidated` in `billing/actions.ts` **replaced** the old
   `batchSettleInvoices` (which minted N vouchers). Cross-company selections are
   **blocked** (one receipt = one payer) at both client + server. dept_pool
   (inter-billing) invoices still excluded — settle individually.
2. **Single-settle payment date.** `NewPaymentForm` now has a `payment_date` field
   (default = browser-local today, backdate-able). `createPaymentVoucher` threads it
   into the voucher `payment_date` AND the settlement JE `transactionDate` (was
   hardcoded `todayStr`). Only persists on the credit/auto-complete (settle) path.
3. **Discoverable entry.** `/statements` Invoices tab (`InvoicesList`) now has a
   prominent 「全选可结算发票」button + floating 「合并结算 N 张 → 生成收据」 bar.

Data model: **mig 276** adds `invoices.settlement_voucher_id` (nullable FK →
payment_vouchers, ON DELETE SET NULL). Reverse pointer = the 1:N link (one voucher
settles many invoices). Consolidated voucher has `invoice_id = NULL`; invoices point
back via `settlement_voucher_id`. Legacy `payment_vouchers.invoice_id` (single) is
untouched — single-settle still writes it. `settlement_voucher_id` is currently
**write-only** (no reader yet — verified no read path breaks on invoice_id=NULL:
payments detail/list + cfo-reports all read via voucher_id / PVS / payee_name).

New pure helper `src/lib/invoice-settlement.ts` (`payeeKey`, `validateConsolidation`)
shared by client + server so the same-payer check can't drift. Tested (10 tests).

### Post-deploy fixes (2026-06-03, same session)
- **mig 277** — dropped obsolete `billing_payment_has_invoice` CHECK (it blocked consolidated OR vouchers whose invoice_id is NULL). Root-caused from the postgres ERROR log.
- **Consolidated dept-pool attribution fix** (commit `1f36f43`): `settleInvoicesConsolidated` was lumping the whole receipt into `venture_pool` ("Office") via one `adjustPool('venture_pool', total)`. A consolidated receipt can span departments (same company, marketing_project + venture_attribution invoices), so marketing cash wrongly showed in Office. Fixed: new pure helper `poolAttributions()` (in `invoice-settlement.ts`) splits per invoice via `INVOICE_BILLING_MODE_TO_POOL`; the action loops `adjustPool` per attribution. Regression tests added.
- **Manual data corrections applied directly via SQL (NOT in any migration — recorded here for audit):**
  1. **Receivable receipts** for two GL-only Other Debtor (3071) items with no invoice row: Hookka RM 361.80 (JE-202605-0053, 2026-05-22, finance segment) + Carress RM 1,060.96 (JE-202605-0054, 2026-05-26, corporate segment), both Dr 3000 Hong Leong / Cr 3071. Bank cache (`bank_accounts.current_balance` for HL) bumped +1,422.76 manually (manual JEs don't trigger `bump_bank_for_paid_credit`). 3071 14,996.64 → 13,573.88.
  2. **Dept-pool re-attribution** of the 4 consolidated OR vouchers (HV-OR-202605-0001..0004): the marketing portion (RM 53,949.19) was moved from `venture_pool` table rows (shrunk to the venture portion 2,141.73) to new `dept_pools` Marketing `np_in` rows. Marketing pool −16,107.10 → +37,842.09.
- ⚠️ Reminder: the app's "收款"/receive form GL-credits 3030 hardcoded, and manual JEs don't update the bank cache. A "collect against non-3030 receivable, self-service" feature was being brainstormed (user picked: enhance the receive form so the account picker drives the GL credit + bank cache) — spec NOT yet written, paused. **(Pre-req for this is settled now: settlement segment attribution, below.)**

### Settlement segment attribution + /dept-pool reconciliation (2026-06-03, later same session)
- **Root cause found**: `/dept-pool` "By department" computes dept rows from `dept_pool_balances` (= `dept_pools` table) but the **Venture (Office)** row from GL `journal_lines` (bank lines, `segment IN ('corporate','treasury')`). Settlement only updated one side → double-count. Settling marketing invoices put cash in BOTH Marketing (dept_pools) and Venture (GL corporate) — Total no longer tied to bank (off by 53,587.39).
- **Code fix** (spec/plan: `docs/superpowers/{specs,plans}/2026-06-03-settlement-segment-attribution*`; commits `f387a02`,`43913fb`,`5bb99d0`,`3461a13`):
  - `segmentForBillingMode()` in `src/lib/invoice-settlement.ts` mirrors SQL `billing_mode_to_segment`.
  - `postJournalEntry` (lib/journal.ts) gained optional `segment` → passes RPC `p_segment` only when set.
  - **Consolidated settle** (`settleInvoicesConsolidated`): settlement bank-in JE now SPLIT per dept segment (one JE per `segmentForBillingMode` group) — so Venture stops absorbing dept settlements. Per-invoice `adjustPool` (dept_pools) kept.
  - **Single settle** (`createPaymentVoucher`): invoice-settle bank-in JE now tagged with the invoice's dept segment (was corporate).
  - Model: settlements update BOTH dept_pools np_in AND the GL bank-line segment, matching how opening allocations were set up.
- **Data correction (direct SQL, recorded for audit):**
  1. Hookka 361.80 → added `dept_pools` Finance `np_in` (its bank-in JE-202605-0053 was already finance segment). Finance pool −361.80 → 0.
  2. 4 consolidated OR vouchers' **Marketing portion 53,949.19**: reclassified bank cash from corporate→marketing segment via two `1900` (Opening Balance Clearing) JEs (segment_reclass, 2026-05-31). Venture −53,949.19. (Marketing `dept_pools` np_in 53,949.19 kept from the earlier repair.)
  3. Carress 1,060.96 = corporate/Venture, left as-is (user confirmed).
- **Verified**: dept_sum 72,804.97 + venture_gl (−5,363.15) = **67,441.82 = bank**. Marketing GL-segment (37,842.09) == Marketing dept_pool (37,842.09). Fully reconciled.

⚠️ Known follow-up (spawned as a task, not yet done): `settleInvoicesConsolidated`
is non-transactional (Supabase JS limit). If the final invoice-status update fails
after the money-side writes, you get an orphaned voucher and a re-run mints a 2nd
voucher (invoices still 'issued'). Same convention as `createPaymentVoucher`. Add an
idempotency / orphan guard when convenient.

## Project
- HV internal banking portal. Next.js 15 (App Router) + Supabase + Vercel + TypeScript + Tailwind.
- Local: `C:\Users\User\OneDrive\Desktop\Claude\Venture\Venture-Portal`
- Supabase project ref: `gixpptmfuryskbwkmiwz` (use the `supabase` MCP tools)
- GitHub: `wenwei4046/Venture-Portal`
- Read `CLAUDE.md` + `docs/DESIGN.md` before touching code.

## ⚠️ Vercel deployment
- Live site: **venture-portal-chi.vercel.app** under `wenwei4046s-projects`. Auto-deploys on `git push origin main`. Do NOT use `vercel --prod` (chi rejects with permission denied).
- Last pushed commit at checkpoint: `7d28828` (batch settle invoices).
- ⚠️ OneDrive sync locks `.next/` on Windows occasionally — if dev server EBUSY-loops, stop + `rm -rf .next` + restart.

## ⚠️ DB write methods
- `supabase` MCP tools are connected; use `mcp__supabase__execute_sql` for DML and `apply_migration` for DDL/RPC changes.
- For DML where MCP isn't available, run a node script that loads `.env.local` → `@supabase/supabase-js` with `SUPABASE_SERVICE_ROLE_KEY`. Pattern: `scripts/gl-import-apply-v2.mjs`.
- TypeScript types: regen via `mcp__supabase__generate_typescript_types`, unwrap JSON (`JSON.parse(text).types`), write to `src/lib/supabase/database.types.ts`.

## Major changes this session (2026-05-26 → 28)

### A. GL re-import (new source: 26-May-2026 XLSX)
- Source: `C:\Users\User\OneDrive\Desktop\Houzs Venture - General Ledger 26.05.2026.xlsx` (53 source accounts, 1,613 raw lines).
- TB: `C:\Users\User\OneDrive\Desktop\Trial Balance.pdf` (Dr=Cr=**1,676,933.38**).
- 334 manual_jv entries / 1,580 journal_lines now in DB (wipe + re-insert via `scripts/gl-import-apply-v2.mjs`).
- Adjusting JEs baked in by `scripts/gl-import-preview-v2.mjs`:
  1. **Year-end closing 2025-12-31**: Dr 1510 RE 2,024 / Cr 9000 GE 2,024 (segment='corporate')
  2. **Suspense-split 2026-05-20**: 3053 ↔ 3063 + 4052 ↔ 4062 each 38,333.33 (segment='unallocated')
  3. **Per-bank cleanup (2 JEs)**: Alliance reserved for Director-only convention. Cross-segment transfer 19,651.43 from corporate→director via 1900 clearing.
- PV-000077 correction (4,130→3,540) is **already baked into the new source** — preview script's old correction toggle was removed.
- TB reconciliation: every account matches (verified post-import).

### B. Dept Pool re-opening (mig 269 → 270 → 271)
- 5 dept_pool opening rows after 3 iterations (Director value flip-flopped during user clarification):
  - Director: **np_in 37,218.37** (final, mig 271) — includes 19,651.43 top-up from Venture Pool via the cross-segment GL transfer JEs
  - Director Office: expense_out 2,255.49
  - Finance: expense_out 361.80
  - Marketing: expense_out 16,107.10
  - HR: no row (balance 0)
- Per-bank × per-segment landed as intended: **Alliance = Director only (922.47)**, HL absorbs everyone else.
- `/dept-pool` Total cash = 9,928.14 = HL 9,005.67 + Alliance 922.47 ✓ (bank-recon).

### C. Director Pool reset
- `director_payouts` drafts **DELETED** (Saving 9,040.69 → 0).
- `invoice_payout_pool` **wiped + 4 new rows** per user-provided breakdown:
  - WL (`a5f55a13`): 7,910.04
  - MK (`18b3aa79`): 8,790.51
  - WS (`5f9bec22`): 9,770.81
  - WW (`b5add299`): 10,747.01
  - Total: **37,218.37**
- `/director-pool` Total Pool = 37,218.37 (saving 0 + invoice 37,218.37).

### D. Save & Calculate behaviour fix (mig 268)
- `save_director_salary_results` RPC no longer writes `dept_pools` rows. Director Pool cash now lives via the same `credit_dept_pool_on_invoice_paid` trigger (mig 202) as the other 4 depts → driven by billing_payment PV settlement.
- Previously the RPC's `DELETE FROM dept_pools WHERE period_month=... AND transaction_type='np_in'` collaterally wiped bank-recon opening rows.

### E. Venture Pool semantic (corporate + treasury)
- Single segment filter `journal_entries.segment IN ('corporate', 'treasury')` applied in 5 read paths:
  - `/venture-pool` (hero, this-month, 12-month, ledger)
  - `/dept-pool` Venture row + per-bank breakdown
  - `dashboard_summary` RPC (mig 273)
  - `/reports/fund-summary` + xlsx/pdf export
- `treasury` includes future fund_in / fund_out / loan_repayment via `derive_journal_segment` (mig 217). Currently 0 in historical GL but auto-flows future activity.
- The legacy `venture_pool` TABLE is **kept** with existing writers untouched (approval/fund-out/voucher-paid), but **no reads anymore**. User decision: leave alone.

### F. Per-bank × per-segment view
- `/dept-pool` Cash tab has a **"Per-bank breakdown"** section under the main table.
- Rows: 5 depts + Venture (corporate+treasury merged). Cols: HL · Alliance · Total + bottom "Bank balance" row.
- Driven by `journal_lines + journal_entries.segment + account_code ∈ bank_accounts.gl_account_code`.

### G. Per-director Billed / Used / Remaining on `/director-pool`
- New table below Director Invoice section (Principal only).
- "Used" = sum of negative balances on the other 4 dept pools + Office (corporate cash if negative) — pro-rated across directors by their share of total billed.
- Last row absorbs rounding so column sums foot exactly.
- Current: Used 27,290.23, Remaining 9,928.14 (= bank cash).

### H. Billing UX overhaul
- **Multi-line invoice** (new flow, mig 275 + `CreateMultiLineInvoiceButton`): one bill, one bill-to, N line items each with own description / amount / category. Approve & Issue fans out per-line Cr JE. Single-line "+ Create Invoice" path still exists alongside.
- **Edit / Delete draft invoices** (mig 274 — `invoices_finance_delete_draft` policy; soft-field editor modal): finance can fix typos or delete pre-approval. Issued/paid stay locked.
- **Per-invoice PDF + batch PDF** at `/billing/invoice-doc`:
  - `?id=<uuid>` single page
  - `?ids=a,b,c` multi-page
  - `?period=YYYY-MM` whole period
  - PDF template = HV letterhead + bill-to + line items table (or flat desc) + total + reference
  - Per-row PDF link + period-batch button in /statements
- **Batch settle (knock-off)**: checkbox column on InvoicesList. Select any subset of `issued` (non-dept_pool) invoices, floating bar → modal (bank + date) → server creates billing_payment PV per invoice, all auto-paid. `batchSettleInvoices` server action.
- **OPEX cards gating fix**: cards + hero only show payroll figures after `payroll_runs.approved_at IS NOT NULL` (was firing on row exists). Subtitle differentiates: HR not submitted / HR submitted — awaiting Principal approval / Principal approved.
- **Modal scroll fix**: Create Invoice / Multi-line / New account modals use `items-start + backdrop overflow-y-auto + my-4` so they open at top, page scrolls naturally.
- **Sticky headers**: `/statements?tab=invoices` BillingView page-head + `/settings` Chart of Accounts header are `sticky top-0` — Create buttons always reachable.
- **New account button**: was tiny text link, now accent button + modal popup.

### I. Dashboard / reports
- `dashboard_summary` RPC: mig 272 → 273 (Venture Pool from journal_lines, includes corporate + treasury). Pool breakdown shows Venture row alongside dept pools (frontend appends).
- `/reports/ledger` enhancements (2026-05-25 sub-session, already shipped): search, reverse-order toggle, global back-to-top button.

### J. Cleanup
- 17 stale one-off scripts deleted (apply-mig-*, verify-mig-*, diagnose-*, etc.).
- /operating-fund orphan route deleted (duplicate of /venture-pool).
- `.env.local.shared` kept untouched (per user, secrets visible in OneDrive but accepted).

## Current data state (post-session, key facts)

### `/dashboard`
- Pool = **9,928.14** (= 18,493.98 dept_pools + (-8,565.84) Venture)
- Pool breakdown shows 5 dept pool rows + Venture (Office)

### `/dept-pool` Cash tab
- Director **37,218.37** / Director Office **(2,255.49)** / Finance **(361.80)** / HR 0.00 / Marketing **(16,107.10)** / Venture (Office) **(8,565.84)** → Total **9,928.14**
- Per-bank breakdown: Alliance = Director 922.47 only; HL takes the rest.

### `/director-pool`
- Total Pool 37,218.37 (saving 0 + invoice 37,218.37)
- Director Pool balance 37,218.37 → reconciliation "Buckets balance ✓"
- Per-director usage table: Billed 37,218.37 / Used 27,290.23 / Remaining 9,928.14

### `/reports/trial-balance`
- Dr = Cr = **1,676,933.38** (ties TB PDF)

### Bank
- HL (3000): 9,005.67 · Alliance (3010): 922.47 · Total 9,928.14
- `bank_accounts.current_balance` ties GL.

### May 2026 payroll_run
- Exists with HR 18,877.26 / Finance 23,170.12 / Marketing 47,166.26 / etc.
- `approved_at = NULL` (Principal hasn't approved yet) → all OPEX cards and hero show RM 0.00 with "awaiting Principal approval" subtitle. Once Principal approves on `/approvals/payroll-run/<id>`, figures surface.

## Migrations added this session
- `267_add_venture_attribution_billing_mode` — Postgres ENUM gains 'venture_attribution' so the new pool option works.
- `268_save_director_salary_drop_dept_pool_np_in` — Save & Calculate no longer writes dept_pools.
- `269_dept_pools_opening_2026_05_26` — first opening write (Director 37,218.37 in the originally interpreted role).
- `270_dept_pools_director_opening_to_natural_gl` — interim revert (Director 17,566.94) — superseded.
- `271_dept_pools_director_opening_to_37218_37` — final Director 37,218.37 again (current).
- `272_dashboard_venture_pool_from_journal_lines` — RPC reads journal_lines for hv_fund_balance.
- `273_dashboard_venture_pool_include_treasury` — RPC also includes treasury segment.
- `274_invoices_allow_finance_delete_draft` — RLS policy unlocks finance DELETE on draft.
- `275_invoice_lines_table` — new table for multi-line invoices + RLS.
- `276_invoices_settlement_voucher_id` — (2026-06-03 session) nullable FK on invoices → payment_vouchers for consolidated-receipt linkage.
- `277_drop_billing_payment_has_invoice` — (2026-06-03 session) dropped the obsolete CHECK that forced every billing_payment voucher to have a non-null invoice_id. It rejected consolidated OR vouchers (invoice_id=NULL). Root-caused via postgres ERROR log. Single-settle still sets invoice_id at app layer.

> Note: mig 269 / 270 / 271 are sequential reverts during user clarification. Current state = mig 271. Don't try to "clean up" by removing the interim ones — each runs in order; later overrides earlier.

## Scripts (in `scripts/`)
- `gl-import-preview-v2.mjs` — parses 26-May-2026 XLSX, applies YE closing + suspense split + per-bank cleanup, emits `gl-import-entries-v2.json`. Read-only.
- `gl-import-apply-v2.mjs` — wipes manual_jv + bulk-inserts the 334 entries / 1,580 lines, verifies TB + per-bank × per-segment.
- `gl-import-entries-v2.json` — the actual entries that landed in production (committed for traceability).
- (v1 versions `gl-import-preview.mjs` / `gl-import-apply.mjs` / `gl-import-entries.json` are legacy, kept for history but not used.)

## Open / pending decisions

### 1. venture_pool TABLE retirement
- Currently: 4 codepaths still INSERT into venture_pool (approvals/actions.ts L129/249/614, fund-out/actions.ts L220, lib/voucher-paid-helpers.ts L32, billing/BillingView.tsx L65 read).
- All READS have been moved off the table; writes are harmless but pollute on each PV/loan approval.
- User said "leave alone" — revisit only if it causes drift or noise later.

### 2. Multi-line invoice — edit / inter-billing edge cases
- `updateDraftInvoice` only edits flat soft fields. Multi-line edit not yet supported (must delete + recreate).
- Inter-billing (dept_pool target) on multi-line invoices works in create flow but the approve/issue JE path treats it like single-line (per-line Cr to category, no per-line inter-billing mirror). Likely fine for the cases user has but verify before scaling.

### 3. Batch settle — inter-billing excluded
- Batch action rejects `billable_to_type='dept_pool'` invoices. User must settle those individually via `/payments/new?invoice_id=`.
- Could be expanded later by inlining the inter_billing_out + mirror logic; punted for now.

### 4. User mentioned "I have a little bit to change" on session end
- New session will likely bring small tweaks. Listen first, then act — don't pre-emptively start.

## COA additions / mapping
Same as previous handoff (the COA itself is unchanged this session). For new invoices using `billing_mode='venture_attribution'`:
- Falls back to `5000` Cr account if no category_code given; per-line categories now override correctly (mig 275 + `resolveRevenueGlCode` honors any active COA code).

## Key IDs
- Principal user: `cbc6a18a-3f38-4567-b8c3-385d00b9e6b3`; Finance: `6c0c28a2-c936-4c83-9bf8-b8c54bda51c5`
- Director dept: `bb927615-b3cd-466a-9e65-c9a35999cb82`
- Companies: 2990 `8a7c5a36`, CAR `daeeb093`, CMI `538a18d5`, CONTS `89c32d76`, HC `5eab1801`, HK `24204cca`, OHN `346274df`
- Directors: MK `18b3aa79`, WL `a5f55a13`, WS `5f9bec22`, WW `b5add299`

## Source files on Desktop (current truth)
- `Houzs Venture - General Ledger 26.05.2026.xlsx` — latest GL (now imported)
- `Trial Balance.pdf` — final TB at 26 May 2026 (Dr=Cr 1,676,933.38)
- `HV - General Legder 22.05.xlsx` / `HV - Trial Balance 22.05.pdf` — superseded
- `HV - Bank Reconciliation - Format 1.pdf` — informational; bank-recon decision already baked into mig 269/271 + cleanup JEs.

## Reports architecture (unchanged from prior handoff)
- Income Statement / Balance Sheet / Cash Flow built from OPERATIONAL subledgers (payment_vouchers, invoices, treasury) PLUS the `manual_jv` GL entries folded via `gatherManualJvPnl` in `cfo-reports.ts`.
- Trial Balance reads `journal_lines` directly.
- Treasury-managed account codes (interest income / penalty income / interest expense by NAME, type=revenue/other_income/expense respectively) are EXCLUDED from the manual_jv fold and instead summed by `gatherTreasury` → routed to Venture Pool. **Interest expense lands in `vp.cost`** (not `vp.expense`).
- Per-pool layout (Income Statement, Cash Flow, /dept-pool page) share 6-pool view: Venture · Marketing · HR · Finance · Director Office · Director Pool. Empty pools shown.

## Untracked files
- `.env.local.shared` — copy of .env.local with secrets exposed in plain text. User decided to leave it (option C). DO NOT commit.

## Quick gotchas / future-Claude reminders
- When the user gives flip-flopping clarifications about a number, write a layered plan + numbered options BEFORE touching DB — they appreciate "let me confirm interpretation". Three migrations 269→270→271 for Director opening = the cost of skipping that step.
- TS type generation via Supabase MCP returns JSON-wrapped — needs `JSON.parse(text).types` extraction before writing to `database.types.ts`.
- `redirect()` inside server actions breaks if called in loops — extract logic into helpers when batching (see `batchSettleInvoices`).
- Bash CWD resets between calls — `cd /c/Users/User/OneDrive/Desktop/Claude/Venture/Venture-Portal && <cmd>` for git, node, npx.
- If new helper scripts appear during work (apply-mig-* etc.), decide upfront whether they're disposable (delete on session end) or worth checking in. This session's policy: delete one-offs once the work has been applied.
- Modals: use `items-start` + backdrop `overflow-y-auto` + `my-4` so they open at top — `items-center` + inner `overflow-y-auto` can land mid-content.
- Sticky headers + paper backdrop work fine inside `<main className="overflow-y-auto">` (the PortalFrame scroll container). Use `sticky top-0 z-20 bg-paper`.
- Vercel build is faster than typecheck locally (~60s) — push and watch instead of waiting for local `next build`. Errors surface quickly in the build log.
