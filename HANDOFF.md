# HOUZS Venture Portal — Session Handoff (checkpoint 2026-07-30 · Cash Flow revamp)

## Billing Allocator (2026-08-01, port of the user's Apps Script — SHIPPED)

New /billing-allocator (Finance + Principal; sidebar under Daily Operations next
to Invoice). Scope fixed by the user's answers before building:
 - **Payer is ONLY HOUZS Venture** (no inter-subsidiary billing).
 - **Headcount uses the allocator's OWN staff list** — user explicitly chose a
   Finance-maintained list over reading hr_staff_allocation. Per-month
   snapshots (alloc_staff_history): every staff edit re-snapshots the current
   month (script parity); calc offers current-list vs the period's snapshot.
 - Methods: headcount / percentage / equal / custom — **no Area**.
 - Output: **draft invoices**, then the normal /statements review → issue →
   settle flow.

**The invoice handoff — the user's #1 correctness concern ("要确定他对接去
invoice 时是对的")**: generateAllocatorInvoices() does NOT write invoices
itself — it calls the exported `createMultiLineInvoice` from billing/actions,
i.e. the EXACT function behind the manual multi-line Create Invoice button.
Numbering (mint_invoice_no), draft status, period-open check (assertPeriodOpen),
line rollback on failure, revalidation — all identical to a hand-made invoice by
construction. Parameters: billableType subsidiary, billingMode
**venture_attribution** (→ settles into venture_pool, same as the utility-split
invoices), reference_no **ALC-YYYYMM** (the link AND the dedupe key), one line
per allocation detail ("desc — method_detail · ALC-no"), categoryCode from
alloc_categories.coa_code (blank → 5000 fallback at issue, same as manual).

Locking: a period with ANY ALC-ref invoice refuses txn save/delete AND skips
those companies on regenerate — delete the drafts in /statements first. Own
share (companyId NULL everywhere) is stored + shown but never billed.

Engine `src/lib/billing-allocator.ts` is a faithful port incl. rounding
quirks: percentage/equal penny-fix lands on the LAST row; headcount rows round
independently (NO fix — sheet parity); custom taken as typed (billed may ≠
header amount, deliberate). 10 unit tests in billing-allocator.test.ts.

DB: mig `20260801000000_billing_allocator` — 8 alloc_* tables, RLS
finance+principal only (verified live: 8 tables, 8 policies). NOTE:
database.types.ts was NOT regenerated — allocator files use the untyped
SupabaseClient cast (same convention as lib/cfo-reports.ts); regenerate types
whenever convenient and the casts can go.

Follow-up same day ("staff那边没有办法用我现有的去记录?"): **"从 HR 带入"
one-click import** on the Staff tab — `importAllocStaffFromHr(hrPeriod)` READS
hr_staff_allocation + hr_staff_costs (read-only, same precedent as the invoice
autofill) and REPLACES the allocator list with that month's staff×company×%.
HR stores FRACTIONS (0.30 = 30%) → ×100 on import; HR has no own-share concept,
so a staff totalling under 100% gets the remainder as "HV own" (e.g. CHOW WAI
MAN 87.29% → 12.71% own). Two-step confirm in the UI (replace-all is
destructive to hand edits). After import it is Finance's independent copy — HR
edits do NOT flow through; re-import to refresh.

Follow-up 2 (2026-08-01): **the user's actual Apps Script data is IN.** They
pasted HeadcountHistory + ExpenseTemplates + DefaultAllocation + Categories.
Rulings taken: ACTIVE rows only; history depth = 2026-07 only (older months
were already billed from the sheet); and **"marketing 算inter-billing。单还是要开"**
→ targets extended to DEPARTMENTS (mig `20260801010000_allocator_dept_targets`:
department_id on alloc_staff_splits / _history / _txn_details, CHECK one-target).
Target encoding everywhere: company uuid | `dept:<uuid>` | null = HV own — the
ENGINE is unchanged (keys are opaque to it); Equal/headcount include a dept
once staff reference it, matching the sheet where "Marketing Department" sat in
the Companies list. generateAllocatorInvoices branches billableType:
subsidiary vs **dept_pool + departmentId** — still the same
createMultiLineInvoice; dedupe key now company_id OR billable_to_department_id.
Imported (verified live): 37 active staff / 64 splits — FTE: CONTS 8.7667,
Marketing(dept) 8.0, DC 7.7667, CAR 6.5107, HC 5.0516, 2990 0.4773, HK 0.30,
HV own 0.1271 (Vivian Chow 12.71%), total exactly 37.0. 2026-07 snapshot saved.
Sheet company names→codes: Carress→CAR, Houzs Century→HC, The Conts→CONTS,
Dream Crafter→DC, 2990 Home→2990, Hookka Manufacturing→HK, Houzs Venture
Holding→own. Templates: Office Rental (headcount, 18,980, Rental), Showroom
Rental (percentage, 11,000, Rental, preset CAR 100%), Others (percentage, 0,
Others). Categories: Rental / Utilities / Upkeep of Office / Others (no COA
codes yet — lines fall back to 5000 at issue until the user maps them).

## Bank recon round 2 (2026-08-08, mig 20260808010000)

 - **One-to-many matching** (user: "银行是收一笔，但是gl 记录是多笔"):
   junction table bank_recon_matches (UNIQUE journal_line_id) replaces the
   single matched_journal_line_id column (backfilled, column nulled/dormant).
   manualMatch(lineId, journalLineIds[]) enforces Σ(selected book) == the
   statement line; the review page's book table is MULTI-select with a live
   Σ/off-by readout; auto-match stays conservative 1:1. Counts key off
   match_kind now.
 - **Internal flips excluded** (user: "interbilling 的别出现哦…银行不会有
   transaction"): any JE that both debits AND credits the same bank code
   (inter-billing dept transfers, same-bank payroll staging) is dropped from
   the book side — no real bank movement exists to match.
 - Review tables rebuilt full-width (Date | Entry | Description | In | Out,
   per-table filter, sticky match bar) after the cramped side-by-side lists;
   book window is month −10d..month-end (NO forward days — "upload 6 月就不
   应该出现7月的payment").

## Bank reconciliation rebuild (2026-08-08, mig 20260808000000)

User: "bank reconciliation 我希望我是upload pdf 或excel 后自动对账 · 存起来
每月一份 · 金额，名字等等，日期其次 · 对不上就问我".
 - Tables bank_recon_sessions (UNIQUE bank+month) + bank_recon_lines
   (signed amount, matched_journal_line_id → journal_lines, match_kind
   auto/manual/ignored). RLS finance+principal.
 - `lib/bank-recon.ts` (9 tests): header-detection parser for CSV/xlsx rows
   (MY formats: DD/MM/YYYY, (1,234.56), CR/DR suffixes, letterhead rows
   skipped), autoMatch = equal-amount buckets → greedy by name-token
   similarity, date proximity only tie-breaks, leftovers stay unmatched.
 - /reconciliation rebuilt: Bank vs GL table kept; upload form (bank+month+
   file) → session created → auto-matched → redirect to
   /reconciliation/[sessionId] review page: summary tiles, side-by-side
   unmatched statement vs unmatched book lines (click one each → Match,
   equal amounts enforced), ignore/restore, matched list with Unmatch,
   Mark done / Delete on the index. Legacy CSVUpload + old count-only
   action removed.
 - Book lines window = month ±10 days on the bank's GL code, excluding
   journal_lines already claimed by ANY session.
 - **PDF: HLB template LIVE** (user sent "Venture - Apr'26.pdf" same day).
   `lib/bank-recon-pdf.ts` (3 tests) parses via pdf2json COORDINATES — the
   flat text layer glues Deposit/Withdrawal/Balance together, so numbers are
   classified by nearest column-header x (calibrated per page). Continuation
   lines (remark · PV no · counterparty) join into the description = strong
   name-matching signal; bank refs (20260401HLBB…) and page artifacts
   filtered. FAIL-SAFE: opening + Σmovements must equal closing to the sen or
   the parse refuses. Real-file e2e: 47/47 lines, 0 skipped, tie-out exact.
   statement_opening/closing stored on the session and shown on the review
   tile. Non-HLB PDFs still return the ask-for-sample message (add the next
   bank's template beside parseHlbPdf). Dep added: pdf2json (dynamic import
   in the action).

## Auto payroll accrual JVs (2026-08-07)

User: "HR submit payroll fund request 给我, 我希望同时直接帮我开jv" → trigger
refined via AskUserQuestion: STAFF JVs post when the payroll RUN is approved
(approvePayrollRun), DIRECTOR JV posts when HR submits director salary to
Finance (submitDirectorSalaryToFinance) — both dated BACK to the payroll
month-end ("要放回去对的月份").
 - `lib/payroll-accrual.ts` (+3 tests): mapping REVERSE-ENGINEERED from
   Finance's manual May/June JVs and verified to the sen on both tables:
   Dr 9030 = gross − non_stat_allowance · Dr 9084 = non_stat · Dr 9081/82/83 =
   ER EPF/SOCSO/EIS · Cr 4070 net · 4071 EPF both · 4072 SOCSO both · 4072
   (2nd line) SKBBK · 4073 EIS both · 4074 PCB. Staff = hr_monthly_payroll
   grouped via hr_staff_costs→departments (NOT "staff" — that table doesn't
   exist); director = director_monthly_payroll, one 'director'-segment JV.
 - Idempotent per (period, segment) via reference_type='payroll_accrual';
   same total → skip, DIFFERENT total → throws "reverse the old JV first" —
   never silently double-books (covers HR reopen→resubmit).
 - Failures after the RPC surface as "approved ✓ but auto JV failed: …" —
   the approval/submission stands.
 - July 2026 BACKFILLED by hand (user asked): JE-202607-0386..0390, five
   segments, each ties EXACTLY to its funding-request total (HR 21,803.06 /
   Fin 24,355.35 / Mkt 47,030.69 / DO 6,566.25 / Director 65,309.67).

## Same-bank funding CLOBBERED the bank cache (2026-08-07, mig 20260807010000)

Principal "approve 不到" → HL cache said 149.01 while GL said 165,214.03
(user's own sum was right). Short by EXACTLY the two same-bank HL→HL funding
PVs (99,755.35 + 65,309.67). Root cause: approvers read current_balance
early, the paid-status flip fires credit_dest_bank_on_bank_transfer
(+amount), then the approver writes an ABSOLUTE balance from the stale read —
same-bank means same row, so the trigger's credit gets erased and the cache
drains by the full amount. **The 20260804010000 entry's claim that same-bank
"cache moves cancel" was WRONG** — they only cancel now that mig
`20260807010000_same_bank_cache_fix` made all three approvers
(single/batch/batch_partial) write RELATIVE (current_balance ± amount) and
re-synced every active bank's cache to GL. Lesson: any cache write in a
trigger-adjacent path must be relative, never absolute-from-a-read.

## 53,613.75 triangle contra (2026-08-07, DATA ops — no code)

User-confirmed story: the [BI#32] fund-in "2990 → HV 53,613.75" is really
HC's debt chain (HC owed HV 53,613.75, sitting inside GL 3056), and the HC
45,000 fund-in "Contra with 2990" was HC REPAYING that debt, mis-recorded as
a borrowing. Two non-cash nettings booked (both interest-waived per user):
 1. LO#29 (2990 owed HV 45,000, funded by that HC 45k) netted against
    [BI#32] → HV now owes 2990 **8,613.75**; LO#29 fully_repaid.
    Rows: repayments type='principal' (loan_outstanding only counts
    'principal'!) + fund_source_repayments type='netting' (fs view counts
    principal+netting) + JE-202608-0448 Dr 4051 / Cr 3054 45,000.
 2. HC 45k fund-in closed as HC's repayment → HC now owes HV **8,613.75**
    of this chain (inside 3056 = 150,156.32 total; the other ~141,542.57 is
    the user's own legacy items — untouched). fund_source_repayments
    type='netting' + JE Dr 4052 / Cr 3056 45,000; status flipped to repaid
    MANUALLY — trg check_fund_source_fully_repaid only fires on 'principal'.
End state (user: "那就对了"): 欠 2990 8,613.75 ↔ HC 欠 8,613.75 mirror
tails; banks untouched; TB 0.00. Netting conventions above are the precedent
for future contras.

## Bank BA registry + calculator (2026-08-07)

User: "calculate ba interest的function. 先别做，先确定流程" — flow pinned over
three AskUserQuestion rounds:
 - The BA is HOUZS CENTURY's facility with the bank — HV never owes the bank;
   bank interest (face × annual × days/365) is REFERENCE only (HC's cost).
 - HV owes HC face × 1.5%/mo × days/30; HV charges the borrowing sub
   face × 2.5%/mo × days/30 (both rates editable per BA, both prorate by
   days); HV margin = spread.
 - 入账 (my recommendation, user accepted "或你有好的意见告诉我"): REAL money
   keeps booking through Fund In (owe HC) + Fund Out (loan to sub) — the BA
   page is a registry/calculator layer with optional fund_source_id/loan_id
   link columns, NO JEs of its own, so nothing double-books.
Built: mig `20260807000000_ba_facilities` (RLS finance+principal; maturity
GENERATED from start+tenor); `lib/ba.ts` calcBa/daysBetween (5 tests);
`/ba` page (summary tiles, Record BA form with live calc, list with
charge/owe/margin + matures-in/overdue status + Mark settled/Reopen,
calculator modal — /ba?calc=1 opens it); BA Calculator buttons on Fund In +
Fund Out; sidebar "Bank BA". English UI. Untyped-client convention (table
absent from database.types.ts).

## Company Statement round 3 (2026-08-06)

 - **PDF exports must be ASCII/English-only** — react-pdf's base font has no
   CJK glyphs; Chinese labels rendered as mojibake (user: "导出的pdf 会乱").
   Export labels now English (Collect/Repay, compounding, no fixed term,
   N left · by YYYY-MM, TOTAL·TO COLLECT/REPAY, lent to X); xlsx shares the
   same rows. Remember for ANY future react-pdf export.
 - Every export row carries a From column (user: "这里没有显示from") and the
   PDF went landscape for the 7 columns.
 - ?cp=HC,2990 filters the export to chosen counterparties; totals re-sum the
   subset; single-cp filename gets the name. UI: checkbox per counterparty row
   → 「已选 n 家 · 导出: Excel / PDF」 bar (top buttons still export all).

## Company Statement round 2 (2026-08-06)

Polish batch 1: summary tiles (要收/要还/净额), counterparty search (footer
re-sums the filtered rows), expand/collapse-all, per-position View → links to
fund-in/fund-out detail. Batch 2 (user: "帮我对齐，然后要导出"):
 - Header alignment: table.ledger-table's `thead th` rule out-specifies
   Tailwind text-* utilities — number headers need ledger-table's own `right`
   class (group headers centered inline). Remember this for ANY ledger-table.
 - Export Excel / Export PDF buttons → /reports/company-statement/export
   (?format=xlsx|pdf), bank-statement layout: section per counterparty with
   net in the title, position rows, TOTAL section. Data extracted to
   `lib/counterparty-statement-data.fetchCounterpartyStatement` — page and
   export share ONE builder.
 - SC badge on positions = the loan's 资金来源 remark parsed from
   repayment_terms (fundingSourceFromTerms; display-only).
 - 借给 badge (repay side) — user picked the notes-remark mechanism ("这笔是
   借给谁我自己加"): they write 「借给: X」 (借去/转借给 accepted) in the fund
   source's NOTES; lentToFromNotes (lib/utils, display-only, unit-tested)
   parses it and the statement + export show it as the repay-side badge —
   mirror of SC. Never auto-match SC strings to data.

## Select-all covers combined cards (2026-08-06)

User: "明明有5张我要approve, 按select all只选三张" — the 5 pending ITEMS were
3 singles + 2 combined groups, and groups were one-card-one-action only.
Now combined cards carry a checkbox (g:<groupId> keys in the selection set):
select-all picks every card, the floating bar total adds each group's
voucher-only sum (same dedupe as the card's Total disbursement), and
approveRequestsBulk gained groupIds — the combined-group core was extracted
to performGroupApproval (returns requests approved; approveRequestGroup is
now parse → helper → redirect) so bulk approves groups all-or-nothing per
group and reports per-group failures without stopping the sweep.

## Principal can self-approve (2026-08-06)

User: "principal submit 要自己能approve". Approvers were already
principal-only (every approve action requireRole(['principal'])), so the rule
change = drop every "cannot approve your own submission" block:
 - approvals/actions.ts: single approve, bulk approve, combined-group approve.
 - payroll-run actions: approve + reject self-guards.
 - UI: PendingApprovals no longer disables own rows' checkboxes (select-all
   includes them); CombinedApprovalCard lost its isSelfSubmitted prop/banner
   and its BatchDetailsModal is always actionable; approvals/[id] page banner
   removed; payroll-run page canAct no longer excludes the submitter.
 - DB: NO change needed — approval_requests has no self-approval CHECK (the
   old code comment overstated), and approve_payroll_run's guard was already
   a no-op (IF ... THEN NULL).

## Payments page shows ALL money out (2026-08-06)

User couldn't find repayment PVs ("做repayment for loan in 无法找到那个payment
voucher") — two fixes:
 1. The Type=Loan repayment filter matched voucher_type, which NO voucher has
    (repayment PVs are typed 'expense'; the fund_source_id link is what makes
    them repayments). Filter now matches the link; Category cell prefixes
    还款 ·; text search hits "loan repayment / 还款".
 2. "不能像reciept 这样显示全部吗?" → new `lib/payment-extras.ts` mirroring
    receipt-extras: /payments (and its export) now interleaves synthetic rows
    for (a) direct fund-source repayments recorded WITHOUT a PV
    (payment_voucher_id IS NULL — 87 rows / RM 233k live; PV-driven rows are
    skipped, verified zero overlap) and (b) Loan OUT disbursements with no
    non-voided reference_type='loan' PV (26 of 34 loans). Rows link to their
    fund-in/fund-out detail pages; summary tile reads
    "N PVS · n 还款 · m LOAN OUT" and Total paid includes them.

## Company Statement report (2026-08-06)

User: "我要有一个新的report 或statement 关于这个公司我还要还多少和我还要收多少
… 类似银行会给的一个statement". New `/reports/company-statement`
(finance+principal), tile added on the Reports index.

 - One row per counterparty (companies by short_code both sides so directions
   merge; departments/directors/freetext by name): 我还要收 (active loans lent
   out) vs 我还要还 (active fund sources), principal and interest in SEPARATE
   columns (user's pick), net = collect − repay. Click a row → bank-statement
   detail per position: 原额@rate·期数, 已还本金, 未还本金, 利息, 几时还完.
 - Maths in `src/lib/counterparty-statement.ts` (pure, 8 unit tests) reusing
   treasury-schedule/loan-monitor conventions — figures TIE to Loan Monitor:
   principal outstanding from the loan_outstanding / fund_source_outstanding
   views (principal-type repayments only); flat interest = remaining periods ×
   原额×月息; 利滚利 accrued = compounded balance − outstanding (roll-forward
   with all-type paymentsByMonth); no-term rows carry 0 interest in totals and
   show ~RM x/月 as reference. 几时还完: on/ahead of agreed schedule →
   contractual finish (startYM + tenure − 1); behind → currentYM + remaining−1.
 - User scoping answers (AskUserQuestion 2026-08-06): 总表每家一行 expandable;
   本金+利息分开两栏; 要收只算 loans (NOT unpaid invoices — Debtor Aging covers
   those); detail like a bank statement (outstanding + payoff month), no aging
   buckets, no chasing features (standing 别理欠款 directive stays respected —
   display only).

## Payroll funding destination bank is selectable (2026-08-04)

User: "hr request fund 我没办法设定他是转去什么银行" — the funding PV's
destination was hardcoded Alliance (GL 3010). Now:
 - GeneratePvForm has a **to bank** select (default = the GL-3010 bank, so the
   old behaviour is the default); source==dest blocked in UI and action.
 - generatePvFromRequest takes destBankId; the PVS rows carry the CHOSEN
   bank's gl_account_code (was literal '3010'); payee_name names the dest.
 - Everything downstream already keys off the PVS rows (credit_dest_bank
   trigger, its void mirror, both batch approvers) EXCEPT approve_single_voucher,
   which resolved v_dest_bank by a hardcoded gl='3010' lookup — mig
   `20260804000000_payroll_funding_dest_bank` patches it to resolve the
   destination from the voucher's own PVS account_code (3010 fallback for
   legacy vouchers), so the staging JE debits the chosen bank.
 - The old "source is already Alliance" guard became "source ≠ destination",
   which also unlocks reverse transfers (Alliance → HL) when ever needed.
 - **Same-day follow-up: source = destination is now ALLOWED** (user: "为什么
   来源不能选同个银行? 因为这只是inter fund transfer"). When payroll pays out
   of the bank the cash already sits in, no real transfer happens — the funding
   PV still must run for the pool bookkeeping (drain dept pools → park in HR
   custody) and to flip the request to funded. Verified all bank-side effects
   self-net with source = dest: staging JE Dr/Cr the same GL, source cache −X
   cancels the credit_dest_bank trigger's +X, void mirror symmetric. Mig
   `20260804010000_payroll_funding_same_bank` drops the guard from
   approve_single_voucher (only place that had it); form shows an informational
   同一家银行 note instead of an error. The sufficient-balance check stays —
   salaries genuinely drain that bank.

Follow-up 8 (2026-08-01, bulk-issue COA bug): user bulk-issued both Aug
batches and caught that every JE credited **5000** while the invoice lines
said 9095/7012 — `approveInvoicesForPeriod`'s non-consolidated branch predated
mig 275 and never read invoice_lines. Code FIXED (bulk now fans out per line's
category_code, legacy single credit only when no lines). Data corrected in
place per the user's "A": the 13 credit lines moved 5000→9095 (6 lines,
4,523.99) and 5000→7012 (7 lines, 18,729.88); after: 0 lines left in 5000 for
ALC refs, TB 0.00, invoices themselves untouched (they were always right —
the user's manual 9095 picks and the Rental→7012 category both landed on the
lines correctly; only the bulk-issue translator ignored them).

Follow-up 7 (2026-08-01, post-issue round): **actions return errors instead of
throwing** — Next.js masks thrown server-action errors in prod (the
period-lock guard surfaced as the generic "Server Components render" digest);
all 14 actions now wrap through guard() → { error }, clients unwrap() locally
(new _components/unwrap.ts). Then the user ISSUED the Aug drafts and asked how
to bill NEW expenses → **multi-batch billing** (mig `20260801050000`
alloc_txns.billed_ref, backfilled ALC-202608 onto the 4 issued Job Street
rows): new expenses join a month anytime; Generate bills ONLY unbilled
allocations under a fresh ref (ALC-YYYYMM → -2 → -3…); locks are PER
ALLOCATION (billed_ref's batch still has live invoices → 改/× refuse; delete
that batch's drafts → auto-unlocks; issued = permanent). Generate CLAIMS
billed_ref before creating invoices — a first-create failure leaves the ref
invoice-less so the claim self-releases. Records rows badge 已开单·ref /
未开单; the Generate button counts unbilled only.

Follow-up 6 (2026-08-01, invoice round): Aug regenerated + verified — all 6
drafts tie to alloc records to the cent (incl. the 17.5%/17.5% penny landing
on the last row). Invoice line format: "desc — RM {base} × {share} · ALC-no";
summary = that invoice's own expense names joined. Records-tab chips open
/billing/invoice-doc?id= (the old /statements/[id] link 404'd — that route is
monthly statements). Category COA is now the shared AccountPicker; the user
mapped: Advertisement→9095, Upkeep→9086, Utilities→9091 (contra-expense
treatment) and **Rental→7012 Rental Income — DELIBERATE ("这个我故意弄成这样"):
rental recharges present as income while the other three net down the expense.
Do NOT flag this as inconsistent.** resolveRevenueGlCode accepts any active
postable code (bill-back by design), so issuing works for all four; NULL
category still falls back to 5000.

Follow-up 5 (2026-08-01, calc round): one bill mixing methods = enter it as
multiple expense rows (user confirmed "拆两行输入就够" — per-company invoices
already merge everything into ONE invoice per target). Percentage/Custom split
editors gained an **"HV 自己承担(不开单)"** first slot (engine: companyId null
→ own-share line, percentage still validates 100 incl own, penny fix
reconciles own+billed to the amount). **Participating companies are
Finance-maintained** (mig `20260801040000` alloc_company_settings; Setup tab
toggle chips): switched-off companies vanish from pickers/Equal/calc targets —
allocator-scoped ONLY (companies.is_active untouched), labels for old
records/snapshots still resolve via the full list, and a staff editor keeps a
"(停用)" option for splits that still reference one. Snapshot re-save REPLACES
that month (delete+rewrite); snapshot-mode preview now uses the period's
snapshot rows so preview == server calc (fixed same day).

Follow-up 4 (2026-08-01, staff-tab polish round): staff editor became a MODAL
(user: "pop out 出来…而不是跳上去") — BatchDetailsModal overlay pattern, Esc /
overlay-click cancels. Department label added to alloc_staff (mig
`20260801020000` — free text, Finance-maintained, datalist suggestions,
filterable column, "split 是 split, department 是 department", NO effect on the
math; Marketing seeded for the 100%-Marketing-split people; HR import carries
HR's department name). Active/inactive/total counts by the search box; list
defaults to ACTIVE with a 显示 Inactive toggle. Snapshot periods are clickable
→ review modal per period: per-company FTE totals (+%) computed from the
snapshot's ACTIVE rows + the full roster with each person's splits
(`getAllocSnapshot`), so a saved month is auditable afterwards.

Follow-up 3 (2026-08-01, UX round after first real use): staff editor moved
ABOVE the table + scrollIntoView + "正在编辑 — {name}" (37 rows pushed it below
the fold; Edit looked dead). Staff list rebuilt on the shared SortableTable —
newest-first by Added date (new column), click-sort headers, search over name +
split labels, Status facet filter. **Records became editable** ("我如果有错无法
更改"): 改 on a row loads it into Calculate (percentage splits reconstruct from
the stored "17.5%" detail strings, custom from stored amounts), the banner says
存档会覆盖原记录, and `updateAllocTxn` replaces details in place keeping the
same ALC number — same invoiced-period lock as delete.

NOT built (explicitly out of v1): dashboard/PDF statements (the invoice IS the
statement), inter-subsidiary payers, Area method, Feb-Jun history import
(user chose 2026-07 only; paste again anytime to add).

## Jun statutory PVs said "(staff + directors)" but carried STAFF ONLY (fixed 2026-07-31)

User asked whether HR's KWSP/SOCSO payments included the directors. They did NOT:
every one of the five paid PVs (0173-0177) ties to the cent to the four staff
departments' accruals — EPF 18,496.00 / SOCSO 1,596.60 + SKBBK 532.35 = 2,128.95 /
EIS 283.80 / PCB 2,097.55 — while the director shares (EPF 13,961.00, SOCSO 535.60,
EIS 95.20, PCB 8,691.35 = **23,283.15**) are still accrued in 4071-4074.

Why: create_payroll_statutory_vouchers sums staff + directors BY DESIGN, but the
five were generated 16 Jul, before director_monthly_payroll had any Jun rows
(InfoTech actuals arrived with mig 20260730100000 / the director-side session).
v_dir_amt = 0, yet the description string was hardcoded "(staff + directors)".

Mig `20260731040000_statutory_pv_label_matches_shares` (applied live + archived):
 - generator label now derives from the shares actually present
   (both / directors-only / staff-only);
 - data fix rewrote the five vouchers' text in payment_vouchers,
   journal_entries and dept_pools (15 rows, text only, no GL effect).

**User chose option B — BUILT (mig `20260731050000_director_statutory_topup`,
applied live + archived).** Their instruction pinned the amount source: "根据
request fund 那part来出" — the FUNDING-REQUEST algorithm, i.e.
director_monthly_payroll (InfoTech actuals), NOT the GL accrual figures. The
arithmetic confirms it: InfoTech director statutory sums to 22,174.00 (KWSP
13,248.00 + SOCSO 535.60 + EIS 95.20 + PCB 8,116.60 + SKBBK 178.60) = exactly
the second funding tranche parked in dept_pool_director, so paying the top-ups
drains the custody pool to zero against what was funded.
 - RPC `create_payroll_statutory_director_topup(period, scheme, date?, bank?)`:
   same guards as the main generator (roles, approved run, funding completed,
   Alliance-first bank), PLUS: a scheme voucher must already exist (else the
   normal Generate is correct — it includes both shares), and it REFUSES when
   any non-voided voucher for the scheme+run already carries a
   dept_pool_director source row (combined voucher or an earlier top-up).
   Voucher: expense/debit/pending_approval, source_pool 'dept_pool_director',
   one PVS row (dept_pool_director, 4071/4072/4073/4074/4072), description
   "… payroll (directors)", normal approval queue.
 - HR Payment page: statutory rows now split vouchers by source_pool (staff =
   dept_pool_hr, top-up = dept_pool_director) and fetch which vouchers already
   carry a director source row → "Generate directors PV" button appears only
   when the main PV exists, directors > 0, and the share is uncovered. Top-up
   gets its own date slot + "Save dir date" (setPayrollPvDate works on any
   pending payroll voucher).
 - HR triggers it: HR Costing → Payment → Statutory payments → per-scheme
   "Generate directors PV" → Principal approves as usual.
 - **"Generate all (N)"** button above the table (user follow-up: "多一个一键
   按钮生成完全部，原本的一个一个按保留"): runs each row's own pending action —
   normal Generate where no voucher exists, director top-up where uncovered —
   SEQUENTIALLY (voucher numbering is count-based; parallel calls could mint
   duplicate numbers). One failure doesn't stop the rest; failures are shown
   together. Button hides itself when nothing is generatable. Per-row buttons
   unchanged.
**CLOSED same day.** The five top-ups were generated (Generate all), approved
and PAID within the hour — 22,174.00 total, dept_pool_director left at 3,221.06
(= funded 68,197.26 − salaries 42,802.20 − statutory 22,174.00, exact), Alliance
cache == GL, TB 0.00. A dry-run re-generation was refused by the dedupe guard
(proven live). Then the USER closed the accrual-vs-InfoTech gap themselves by
rewriting JE-202606-0226 (Jun director accrual) to the InfoTech figures:
Dr 9030 57,600 / 9081 6,912 / 9082 416.60 / 9083 47.60,
Cr 4070 42,802.20 / 4071 13,248 / 4072 535.60 + 178.60 (SKBB) / 4073 95.20 /
4074 8,116.60 — internally exact (gross − ee deductions = net paid, to the
cent). **4070/4071/4074 are now 0.00 across every segment; Jun payroll (staff +
directors, salary + all five schemes) is fully settled.** The ONLY residual in
the accrual family is May PERKESO 2,474.10 (4072: 535.60 dir + 1,565.10 staff;
4073: 95.20 + 278.20) — genuinely unpaid by the user's explicit choice
("真的没付，不理他"). Do not flag it, do not "fix" it.
From Jul onward the order fixes itself: import director InfoTech actuals FIRST,
then generate statutory — each voucher then carries two PVS rows (staff drains
dept_pool_hr, directors drain dept_pool_director).

## Account search on the four statements (2026-07-31, user request)

"帮我在 P&L, Monthly P&L, cash flow 和 monthly cash flow 加搜索功能，就快速找account".
All four render through just two shared components, so the search lives there and
covers every page at once — no per-page changes.

**User picked HIGHLIGHT, not filter** (asked explicitly). Rationale worth keeping:
a filtered statement invites reading a subtotal as if it covered only the rows
still on screen. So a search never removes a row — it highlights the match, forces
its ancestors open, and offers ‹ › to jump. The L1/L2/L3 detail level is the
user's own separate choice and is still respected; search only ADDS the matched
rows (and the path to them) on top of it.

 - **new** `src/lib/report-search.ts` — pure helpers: `matchesAccount` (query is a
   substring of the account CODE or NAME, case-folded — covers "9030", "salary",
   "salary expense"), `highlight` (splits text into <mark>-able runs, preserving
   original casing and reconstructing the source exactly), `ancestorsOfMatches`
   (pre-order depth stack → the ancestor keys to force open).
 - **new** `_components/Highlight.tsx` — shared `<mark>` renderer so a hit looks
   identical on all four reports.
 - `GlReportView.tsx` (P&L + Cash Flow) — "Find account" box in the left rail with
   match counter + ‹ ›, Enter/Shift-Enter to step, Esc to clear. Matched ancestors
   override `collapsed`; active row scrolls to centre.
 - `MonthlyMatrix.tsx` (Monthly P&L + Monthly Cash Flow) — same behaviour.
   `isOpen` consults forceOpen first; the visibility pass gained an
   `onSearchPath` escape so a deep match surfaces even at L1.
 - **new** `_components/ReportSearchProvider.tsx` — the monthly reports' box was
   first put in the matrix toolbar; user asked for it in the LEFT RAIL instead,
   to match the GL statements. The rail (MonthlyReportControls) is a SIBLING of
   the matrix, so query + cursor now flow through this client context and the
   matrix publishes its match count back up. Deliberately not a `?q=` URL param —
   that would round-trip the server on every keystroke. GlReportView needs none
   of it: it owns its own rail, so its search stays local state.
   `useReportSearch()` returns null without a provider, and the rail then renders
   no search UI — so MonthlyReportControls stays usable anywhere else.
 - `MatrixRow` gained `code?` — its `key` is prefixed per section on some reports,
   so search needs the bare code. Set at all 3 construction sites (monthly-matrix
   buildHierarchyRows ×2, monthly-cash-flow, monthly-pnl); the subtotal rows in
   cash-flow-custom need no code.
 - `globals.css` — `.search-hit` (matched substring), `tr.search-row-hit`,
   `tr.search-row-active`; the matrix's sticky first column and gl-report's
   blanket hover wash both had to be overridden so the cue survives.

Gates: tsc clean for every tracked file; vitest **457 passed** (444 → +13 in
`src/__tests__/report-search.test.ts`). NOT visually verified in-app — the dev
server needs a login this session doesn't have; user checks on the deploy.

## FIXED (2026-07-31) — approvals LIST showed a stale amount vs the DETAIL page

User spotted it: /approvals lists HV-PV-202607-0179 at RM 100,000 but the detail
page shows RM 90,000.

**Root cause.** The two screens read different sources:
 - list  → `approval_requests.amount` — a SNAPSHOT written when the voucher was
   submitted (approvals/page.tsx:31/36)
 - detail → `payment_vouchers.amount` — live (approvals/[id]/page.tsx:46 then the
   voucher itself)
`updatePaymentVoucher()` (payments/actions.ts:994) updates payment_vouchers AND
replaces payment_voucher_sources, but never syncs the approval_requests row. Edit
a voucher after submitting it and the snapshot goes stale. `approval_requests_with_target`
does NOT help — it only joins user names, not the target amount.

**Not a posting bug.** approve_single_voucher reads payment_vouchers +
payment_voucher_sources, so the GL uses the DETAIL number. header amount == sum of
PVS rows for all 10 pending vouchers (verified). The list is display-only — but it
is what the approver reads at the moment of approving.

**Currently stale (2 of 10 pending):**
| PV | list | actual (will post) | list off by |
|---|---|---|---|
| 0179 | 100,000.00 | 90,000.00 | +10,000.00 |
| 0182 | 1,339.60 | 1,351.14 | −11.54 |

**User chose option A — read through to the target row.** (Option B, syncing the
snapshot on edit, was rejected: one forgotten edit path and the bug returns —
which is exactly how it got here.)

Shipped:
 - **new** `src/lib/approval-amounts.ts` — `resolveLiveApprovalAmounts(supabase,
   rows)` returns approval_requests.id → live amount. One query per distinct
   target table (not per row). Column map: payment_vouchers/fund_sources →
   `amount`, loans → `principal`; `dept_pools` requests carry no amount. Falls
   back to the snapshot when the target can't be read (deleted / RLS-hidden), so
   a row never silently blanks. Table+column come from that map only, never from
   user input — but they're dynamic, so the typed client can't parse the select
   list and the result is hand-typed.
 - `approvals/page.tsx` — pending queue AND recent-decisions list now go through
   `amountOf()`. Covers every request type in the queue at once (payment_voucher,
   new_fund_source, new_loan, loan_cancel, dept_expense…).
 - `dashboard/page.tsx` — same treatment in all four places that showed an
   approval amount: dept-manager pending submissions (incl. `pendingTotal`),
   Finance "Awaiting Principal sign-off", Finance "Recent actions", and the
   Principal Overview queue (its amount comes from the dashboard_summary RPC, so
   the existing supplementary reference_id query was widened to carry amount +
   reference_table and resolve alongside).
 - `src/__tests__/approval-amounts.test.ts` — 6 cases: live-over-snapshot,
   loans→principal, missing-target fallback, no-lookup-needed passthrough,
   one-query-per-table batching, numeric-string coercion.

No backfill needed: the snapshot is no longer read for display, so PV-0179 and
PV-0182 correct themselves. approval_requests.amount is left as the historical
submit-time record.

Gates: tsc clean for every tracked file (the only remaining errors are in
untracked `* - Copy.*` files, which are NOT in git and never reach Vercel);
vitest 444 passed / 43 files; production build verified by the Vercel deploy.

## CLOSED — fund-source repayments (swept 2026-07-31, then stood down)

**USER DIRECTIVE 2026-07-31: "这些欠款你别理，有还的我都更新了" — do NOT audit,
chase, or re-flag outstanding debts / repayment schedules (fund sources, loans,
debtor aging). The user maintains them and posts repayments as they happen, so a
zero `total_principal_paid` means "not yet repaid", NOT "missing record". Leave
the whole category alone unless they ask.** Sweep below kept for reference only.

Only two active fund sources carry an explicit `repayment_date`; the rest are
open-ended, so "overdue" cannot be judged from the system for them.
 - **HC 45,156.32 — due TODAY 2026-07-31**, 1%/mo. PV-0178 (pending_approval,
   45,607.88 = 45,156.32 + 451.56) IS this repayment. Approving it settles it.
 - **Kingsley 100,000 — 0%, "4/20起分12期只还本金 (每月 8,333.33)" per its notes
   [BI#2].** fund_source_outstanding shows outstanding 100,000.00 /
   total_principal_paid **0.00** — i.e. by 7/31 four instalments (4/20, 5/20,
   6/20, 7/20) totalling **33,333.32** should have been paid and the system has
   none. Either paid outside the system and never recorded, or genuinely unpaid.
   Raised with the user; no action taken.

## OPEN — 3 pending PVs debit 5027 Interest INCOME while paying money OUT (2026-07-31)

Found while listing Finance's outstanding work. NOT touched — they are still
pending_approval, so nothing has hit the GL yet.

| PV | amount | rows | issue |
|---|---|---|---|
| 0149 | 11,800.00 | Dr 3056 10,000 + Dr **5027** 1,800 | 3056 is due-FROM (asset) — paying out should reduce 4052, and 5027 is revenue |
| 0150 | 11,406.67 | Dr 4052 9,666.67 + Dr **5027** 1,740 | 4052 right; 5027 wrong |
| 0178 | 45,607.88 | Dr 3056 45,156.32 + Dr **5027** 451.56 | same as 0149 |

Debiting 5027 (revenue, currently −28,843.13) cuts July interest income by
**3,991.56**. Interest PAID to a fund source belongs in **6000 Interest Expense -
Fund Sources**, or should draw down **4062 Interest in Suspense - Pay - HOUZS
Century** — both accounts already exist. This is the exact mirror of the
receiving-side fix (interest received → 3060 suspense, not 5027 income).
Also: 0149 and 0150 are both "3rd Installment" yet use opposite accounts
(3056 asset vs 4052 liability) — one of them is wrong; and 0150/0178 say
"The Conts"/"Conts" in the description while posting to HOUZS Century.
0179 (Ohana 90,000 → Dr 3052) and 0181 (ESH 100,000 → Dr 3072) look structurally
fine — lending out raises the receivable. 0180 (85,250, "Fund Transfer -
Interest") debits 4052 principal, not an interest account — worth a look too.
**RESOLVED by the user 2026-07-31** — all three now post the interest to **6000
Interest Expense - Fund Sources** instead of 5027 (0149 1,800 / 0150 1,740 /
0178 451.56). July interest income is no longer cut by 3,991.56. Still
pending_approval, so nothing had reached the GL.
**The 3056-vs-4052 split is the user's deliberate call ("剩下的没什么了") — do NOT
re-raise it.** It is presentation only: Dr 3056 (asset up) and Dr 4052 (liability
down) move HC's NET position by the same amount; only the gross balance-sheet
line differs, and HC is netted anyway.

## OPEN — 4071-4074 statutory accruals swept too (2026-07-31, NOT fixed)

Same accrual-vs-clearing walk applied to EPF/SOCSO/EIS/PCB. Total across
4070-4074 = 66,224.25, which is 68,427.50 of unpaid Jun DIRECTOR payroll less
2,203.25 of genuine errors:

| acct | residual | Jun director unpaid | other |
|---|---|---|---|
| 4070 Salary | 41,371.80 | 45,144.35 | −3,772.55 Mktg May under-accrual |
| 4071 EPF | 13,145.00 | 13,961.00 | −816.00 Mktg May under-accrual |
| 4072 SOCSO | 2,560.90 | 535.60 | +2,025.30 May PERKESO never posted |
| 4073 EIS | 455.20 | 95.20 | +360.00 May PERKESO never posted |
| 4074 PCB | 8,691.35 | 8,691.35 | clean (Feb gap was Jan+Feb caught up in Mar) |

 **(A) The May Marketing under-accrual is now pinned to one employee.** EPF gap
 is 816.00 = EXACTLY 13% + 11% of a 3,400.00 gross. EDWIN LIEW GAO NAN
 (Marketing, basic 3,100, status inactive, resignation_date NULL, absent from
 Jun payroll) fits. His expected net ≈3,002 though, vs a 3,772.55 salary gap —
 the extra ≈770 is probably EPF-exempt final pay / leave encashment. Every other
 dept matched to the cent in BOTH accounts, so it is one person in one dept in
 one month. Confirm against HR's May payslip file before posting anything.

 **(B) May PERKESO (SOCSO 2,025.30 + EIS 360.00 = 2,385.30) has NO payment
 voucher anywhere in the system.** June recorded only PCB-MAY (PV-0060, 10,582.40)
 and KWSP-MAY (PV-0061, 31,831.00). Prior months always paid PERKESO together
 (e.g. PV-000081 on 5/14 for April). The next SOCSO/EIS PVs are the July ones for
 JUNE payroll. So either it was paid and never recorded, or it was never paid —
 the latter is a statutory late-payment exposure, NOT just a bookkeeping gap.
 **User confirmed 2026-07-31: it genuinely was never paid, and they are leaving
 it ("真的没付，不理他"). No adjustment is needed or wanted — the 2,385.30 sitting
 in 4072/4073 is a CORRECT unpaid liability, not an error. Do not "fix" it.**
 **User will edit the May accrual JE themselves for (A); they asked for a check
 only, not a fix. Do not post anything to 4070-4074.**

 **(A) DONE by the user 2026-07-31 — verified correct.** JE-202605-0113 edited in
 place (date/period/segment untouched): Dr 9030 +3,200.00, 9084 +970.00,
 9081 +442.00, 9082 +58.65, 9083 +6.70 / Cr 4070 +3,772.55, 4071 +816.00,
 4072 +75.40, 4073 +13.40. Both sides now 44,607.04, header total agrees,
 TB 0.00, zero unbalanced entries DB-wide.
 The added employee reconciles exactly: gross 4,170.00 − EPF ee 374.00 − SOCSO ee
 16.75 − EIS ee 6.70 = 3,772.55, i.e. the observed payment gap to the cent — which
 also PROVES PCB is genuinely 0 for them (had there been PCB, the paid net would
 have been lower). Statutory wage is 3,400 (EPF er 13%=442 / ee 11%=374; SOCSO
 58.65/16.75 and EIS 6.70/6.70 are the PERKESO 3,300.01–3,400 band), so 770 of the
 allowance is EPF-exempt — matches the earlier prediction.
 4070 residual is now a clean 45,144.35 and 4071 a clean 13,961.00 (pure Jun
 director). Per segment, every dept's 4070 now equals its own Jun accrual
 (Marketing 29,897.39 → 33,669.94).
 Reports need no action: no materialised/cached GL report exists (only
 report_layouts config), so P&L/BS/TB/Cash Flow/Dept Pool recompute live from
 journal_lines. May P&L Marketing cost +4,677.35; BS accruals +4,677.35 (still
 balances); Cash Flow and Dept Pool correctly UNCHANGED (accrual JE, no bank leg).
 No May invoice needs re-issuing — Marketing bills as marketing_project fixed
 fees, not staff-cost attribution.
 Side effect of (B) staying unpaid: the May PERKESO liability grew 2,385.30 →
 2,474.10 (+75.40 SOCSO +13.40 EIS for the same employee).

 Side note: Jun director funding moved to Alliance so far = 42,802.20 + 22,174.00
 = 64,976.20 vs a full Jun director package of 68,427.50 → short 3,451.30. Both
 PVs say "(partial)", so this may be intentional.
 Label typos (cosmetic, not touched): "Staff Payroll - May'2025",
 "PCB - MAY'25" — both are May'2026.

## OPEN — 4070 Accrual-Salary residual 41,371.80 (investigated 2026-07-31, NOT fixed)

4070 should carry exactly one month of unpaid salary and clear each cycle.
It carries 41,371.80, which decomposes cleanly into two unrelated things:

 **(a) +45,144.35 — Jun director salary, not an error.** Jun accrued 117,528.75
 in total; the 18 Jul staff disbursement PVs cleared 72,384.40; the rest is the
 directors, whose per-director disbursement vouchers have not been raised yet.
 Cash was already funded into Alliance (PV-0184 + PV-0185). Raising the
 disbursement PVs debits 4070 and clears it. Nothing to do.

 **(b) −3,772.55 — real error, May Marketing under-accrued.** Isolated to ONE
 line of ONE voucher:
   accrual JE-202605-0113 "Markting Salary - May'26"  Cr 4070 31,340.44
   payment JE-202606-0145 (PV HV-PV-202606-0056)      Dr 4070 35,112.99
 Every other dept in that SAME PV matches to the cent (Finance 17,948.60, HR
 16,026.30, Dir Office 4,358.00, Director 45,144.35 via PV-0057). The accrual JV
 is internally consistent (9030 29,666.11 + 9084 5,761.68 − ee deductions
 4,087.35 = 31,340.44), and the 35,112.99 is REAL cash out of Alliance — so the
 accrual is short, the payment is not over. Feb and Apr marketing accruals each
 had TWO 4070 lines (main + top-up); May has only one — the top-up looks never
 posted. Consequence: 3,772.55 of May marketing salary never reached the P&L.
 Cannot name the employee from system data: hr_monthly_payroll holds ONLY
 2026-06 (19 rows); May and earlier are legacy JV imports with no per-employee
 detail. Needs the HR colleague's May payslip file.
 Lead: Marketing has 10 rows in hr_staff_costs but 9 in Jun payroll — EDWIN LIEW
 GAO NAN (basic 3,100, status inactive, resignation_date NULL) is the only one
 missing. Basic alone ≠ 3,772.55, so check whether May was his final month.
 Proposed fix once confirmed (NOT APPLIED — touches expense, user rule
 "有碰到费用的就不要"): JV dated 2026-05-31, segment marketing,
 Dr 9030 3,772.55 / Cr 4070 3,772.55. Residual then becomes a clean 45,144.35.

 **Presentation caveat (user said don't touch it yet, 2026-07-31: "2 的别乱做
 东西。我到时理解清楚先")**: per-segment 4070 is unreliable because the Jul
 disbursement PVs all carry segment = hr (HR is the paying custodian) while the
 accrual JVs carry the employee's own department. GL total is right; the split
 is not. e.g. HR shows −56,725.20 vs a real Jun accrual of 15,659.20; CHOW WAI
 MAN is Director Office but his 4,893.25 clearing landed in HR. DO NOT re-segment
 without the user's go-ahead.

## Session 2026-07-30 — Cash Flow presentation revamp (user-driven, 3 asks)

**Ask 1 要明细 / Ask 2 收钱先出钱后 / Ask 3 void 不要算.**

1. **VOID/reversal pairs now excluded everywhere (DONE)**. Root cause: voiding a paid
   voucher posts a mirror-image reversing JE but NOTHING ever set
   `journal_entries.is_reversed` — so the ~8 report queries filtering
   `is_reversed = false` (ledger, TB, BS…) filtered nothing and both legs showed.
   Totals were never wrong (every pair nets to zero — verified per pair before
   touching anything). Fixes:
   - mig `20260730000000` `mark_journal_entry_reversed(orig, rev)` SECURITY DEFINER
     (je_no_update blocks direct UPDATE for every role). Flags BOTH legs + cross-links
     reversed_by_id; REFUSES to flag a pair that doesn't net to zero (guards the
     invariant that hiding them can't move the TB).
   - Backfilled the 5 existing pairs (4 vouchers + the cancelled dupe fund source =
     10 entries). Before/after snapshot identical: TB 0.00, HL 2,135.25, Alliance
     80,322.67, income 1,095,749.29, expense 1,025,676.62.
   - `voidPaidReceipt` + `reversePaidPayment` now call the RPC after posting the
     reversal (fail-loud).
   - `fetchAllJournalLines` skips `is_reversed` rows → P&L, Cash Flow, Monthly
     reports all clean. (Ledger/TB/BS already filtered; their filter now actually
     bites.)
2. **收/出 gross split (DONE)**: `buildCashFlow` gained `inflow`/`outflow` sections
   alongside the untouched operating/investing/financing (cash-flow-custom / the
   monthly matrix still consume those — do NOT remove them). Gross, not net: an
   account that both received and paid in the window appears on BOTH sides with its
   own figure AND its own drill-down txns (user chose bank-statement style over
   netting). inflow + outflow = netChange, so the statement still ties to the bank.
   `cashFlowBlocks` reordered to 流入 → 流入合计 → 流出 → 流出合计 → net/opening/
   closing; no O/I/F sub-grouping (user chose flat).
   Page and export share cashFlowBlocks, so both changed together.
   FOLLOW-UP same session ("这些自动分类一下父子account" + "fund out 同理"): both
   sides now run through the shared `buildTree`, so leaves nest under their COA
   parent and headers roll up (3053/3054 → 3020; 4051/4052/4202 → 4100). All
   ACCOUNT_TYPES are eligible because a cash counter account can be any type;
   synthetic IB-XFER/PY-XFER have no parent and stay top-level. +4 tests
   (suite 428).
   FOLLOW-UP 2 ("inter billing 在 all segment 不应该出现"): the gross split had
   EXPOSED the internal-transfer bridge — netting used to hide it. IB-XFER and
   PY-XFER lines are a pure internal reallocation (dept −X / dept +X, each side
   a self-balancing 2-leg synthetic entry) that exists only so a SINGLE
   segment's cash ties to its Dept Pool. All four cash-flow entry points
   (statement page+export, monthly page+export) now drop `ib.lines` when
   consolidated — rule `!isDeptMgr && !segment`, because a dept manager has no
   segment param but IS one segment via RLS. Totals unaffected (the pair nets
   to zero); per-segment views keep the bridge.
   FOLLOW-UP 3 ("money out 分多几层 section…借贷/repayment 一个,日常开销一个" +
   "顺序自己排"): the Cash Flow STATEMENT got its own layout editor, mirroring
   the monthly reports' pattern but with ONE ORDERED SECTION LIST PER SIDE —
   report_keys `cash_flow_in` / `cash_flow_out` (report_layouts has no key
   constraint; both added to layout-actions REVALIDATE). Two instances of the
   existing ReportLayoutEditor on /reports/cash-flow/layout, so no editor
   changes were needed. New lib/cash-flow-sections.ts:
   buildCashFlowSideSections groups a side's LEAVES by the layout and rebuilds
   the COA tree INSIDE each section (custom section → COA header → leaves);
   unassigned accounts sweep into a trailing 其他 section so a side total can
   never silently drop an account. defaultSideLayout seeds one section per
   top-level COA parent. buildCashFlow now also exposes inflowLeaves /
   outflowLeaves (pre-tree buckets) to feed this. cashFlowBlocks takes an
   optional {inflow,outflow} section array — omitted = previous behaviour, so
   nothing else that calls it changes. Page + export both read the layouts.
   +6 tests (suite 434).
   FOLLOW-UP 4 (same evening): (a) each custom section now emits its own 小计
   row — cashFlowBlocks.sideBlocks interleaves a summary after every section,
   skipped when a side has only one (the side total would repeat it).
   (b) Headline totals restyled to out-rank the section band: row-summary-strong
   = full accent wash + accent rules top/bottom + 17px + taller padding, and
   流入合计/流出合计 gained emphasis:'strong' (globals.css — affects P&L and BS
   headline rows too, deliberately). (c) "marketing 的 internal transfer 就是
   payroll 和 rental…能不能显示成相对应的 account": the bridge's PAYING side now
   books to the REAL nature account instead of IB-XFER/PY-XFER —
   TransferSide.natureCode, resolved from the settle voucher's role='mirror'
   PVS rows (which carry rent/utilities/salary since the 07-24 by-nature
   change) and split per nature; payroll drains use PAYROLL_EXPENSE_CODE 9030
   (cash out for payroll = salary in direct-method terms). Guard: the nature
   slices must sum EXACTLY to the pool row, else it falls back to one lumped
   pseudo-account line so a segment's cash can never drift. Receiving side
   keeps the pseudo account (a recharge received has no natural expense code).
   +4 tests (suite 438).
   FOLLOW-UP 5 ("monthly cash flow 和 cash flow 显示的是一样,以 cash flow 为准"):
   the MATRIX now mirrors the statement. New in cash-flow-custom.ts:
   `buildMonthlyCashFlowSides` (per-column values keyed by direction, taken from
   each column's inflowLeaves/outflowLeaves; rows anchored on the ACCUMULATED
   column's side, so an account that flips direction mid-year reads 0 in the
   columns where it sat on the other side) + `buildSideMatrixRows` (layout
   sections → COA hierarchy via buildHierarchyRows → per-section 小计 → side
   total). Page and export both switched; row order is now 流入 sections →
   流入合计 → 流出 sections → 流出合计 → net change → opening → closing.
   BOTH views read the SAME `cash_flow_in`/`cash_flow_out` layouts, and the old
   per-matrix editor (`/reports/monthly-cash-flow/layout`, report_key
   `cash_flow`) now REDIRECTS to /reports/cash-flow/layout so the two can't
   drift; the monthly page's Edit-layout button points there too. The stale
   `cash_flow` report_layouts row is left in place, unread. buildCashFlowAccounts
   / buildCustomCashFlowRows / defaultCashFlowLayout / ensureInterBillCategory
   are now unused by pages but kept (still exported + covered by tests).
   FOLLOW-UP 6 ("subtotal/total 的 background align with cash flow 的"):
   MatrixRow gained `emphasis?: 'strong'`; MonthlyMatrix now renders FOUR tiers
   (headline accent wash + accent rules + 15px/taller > section subtotal
   surface-2 > parent paper > leaf surface), matching GlReportView's
   row-summary-strong. Marked strong: monthly cash flow 流入合计/流出合计/
   Net change/Closing (Opening deliberately left plain, as in the statement)
   and monthly P&L Gross Profit + Net Income. Section 小计 rows stay on the
   quieter surface-2 band, so the hierarchy reads the same in both matrices and
   both statements.
   FOLLOW-UP 7 ("我在 L2 按了展开没有用"): MonthlyMatrix's L1/L2/L3 filter drops
   accounts by DEPTH (L2 = depth ≤ 1) and children sit at depth 2, so clicking ▶
   on a parent flipped the arrow but the level filter still hid the children —
   and the arrow itself was driven by `collapsed` alone, so it claimed "expanded"
   for rows the level was hiding. Reworked: a second `expanded` set records
   explicit opens, `isOpen()` = not-collapsed AND (level opens it OR explicitly
   expanded), and one pass computes visibility with a `bypassDepth` so an
   explicitly opened parent's subtree overrides the level filter. The arrow now
   renders from the same openKeys set the pass builds, so it can never disagree
   with what's on screen.
   FOLLOW-UP 8 ("cancelled 的就不应该进我的 ledger…cash flow 同理"): cancelling a
   LOAN / FUND SOURCE posts a reversing JE but never flagged the pair either.
   Worse than the voucher case: the Hookka 98,000 disbursement sits in MAY and
   its cancellation in JUNE, so the monthly cash flow showed a 98k outflow then
   a 98k inflow for money that never moved. Swept the whole ledger for unflagged
   reversal/VOID/cancellation JEs — exactly one pair left (that loan) — and
   flagged it. mig `20260730010000` patches BOTH `execute_loan_cancel` and
   `execute_fund_source_cancel` via anchored text replacement (assert anchor
   count == 1, skip if already patched): each now captures its original JE
   before reversing and calls mark_journal_entry_reversed, which still refuses
   any pair that doesn't net to zero. Verified after: 12 entries flagged,
   TB 0.00, both banks cache == GL.

**Cash-flow verification (asked for, done independently in SQL — not read off the
report)**: closing cash 82,457.92 == HL 2,135.25 + Alliance 80,322.67; ZERO orphan
bank entries (no JE with a bank leg but no counter leg, so the "uncategorised cash
movement" check row is 0); every month inflow+outflow == net change; running total
across all 7 months lands exactly on closing. Excluding the Hookka pair MATTERED:
May was showing −65,242.74 and June +33,012.46; the true figures are +32,757.26 and
−64,987.54 — the cancelled loan had flipped the sign of two months.

## Session 2026-07-31 — approval blocker, interest-in-suspense, bank cache drift

**Bank cache vs GL drift (found while the user asked "pool cash 显示是对的?")**
The Dept Pool per-bank page reads journal_lines and was internally consistent
(each column summed to its bank's GL balance), but `bank_accounts.current_balance`
had drifted: Alliance +42,802.20 too high, Hong Leong −22,174.00 too low. Two
independent bugs, both fixed in mig `20260731020000`:
 A) **Voiding a paid transfer never undid the destination credit.**
    credit_dest_bank_on_bank_transfer credits the dest bank on →paid, but
    reversePaidPayment (and every other void path) only restored the SOURCE via
    bump_bank_balance. Voiding HV-PV-202607-0109 (internal_transfer HL→Alliance
    42,802.20) therefore left Alliance overstated. Fixed with a MIRROR trigger
    `debit_dest_bank_on_transfer_void` on paid→voided — chosen over patching the
    TS action so every void path is covered.
 B) **Same-bank contra transfers lost the debit.** HV-PV-202607-0186 (source
    Hong Leong, source row account_code 3000 = Hong Leong) has a GL that nets to
    zero (Dr 3000 / Cr 3000), but the approval debited the cache while the credit
    trigger skipped it via `db.id <> new.bank_account_id`. That guard (mig
    20260606030000) was defensive, never fixed an observed bug, and only bites
    when a source row names the source bank — exactly when the credit SHOULD run.
    Removed.
 Caches then re-derived from the GL. After: Alliance 102,496.67 == GL,
 Hong Leong 199,961.25 == GL, TB 0.00.
 **RESOLVED same session.** User voided PV-0186 (HL→HL no-op) and PV-0187
 (right direction, wrong date 7/31), then re-issued **PV-0188** Alliance→Hong
 Leong 22,174.00 dated 2026-07-15 — same date as the PV-0185 funding leg, so the
 pair nets to zero inside July's cash flow. Both voids flagged is_reversed, so
 neither shows in the ledger.
 PV-0187 went approve→paid→void AFTER the migration, which proves the new mirror
 trigger on live data: without it Hong Leong would now be 22,174.00 overstated;
 it isn't.
 After: HL 222,135.25 == GL, Alliance 80,322.67 == GL, TB 0.00, per-bank columns
 foot to bank balances, rows foot to dept pool balances (inter-billing folds net
 to zero: −5,644.39 −23,882.01 +74,039.60 −48,775.20 +4,262.00 = 0), total cash
 302,457.92.
 **The 42,802.20 leg (PV-0184, 7/09, HL→Alliance) is NOT contra'd — confirmed by
 the user 2026-07-31 that one WAS a real bank transfer.** Only the 22,174.00 was
 direct-funded into Alliance by another company, hence only it needed the contra.
 Don't "fix" the asymmetry later.

0. **BLOCKER FIXED — every payroll_bank_transfer approval was dying** with
   `record "v_voucher" has no field "reference_id"` (user hit it on
   HV-PV-202607-0184, Director salary bank transfer Jun 2026, 42,802.20,
   request target_pool = dept_pool_director). Cause: mig 20260727100000 (the
   OTHER session's "custody follows the request's target_pool" change) reads
   `v_voucher.reference_id`, but the `SELECT … INTO v_voucher` list was never
   extended to fetch it. PL/pgSQL resolves record fields at execution time, so
   this shipped green and only broke when a payroll round was actually
   approved. Fixed by mig `20260731000000` (anchored patch, idempotent).
   **Related gap, FIXED (user chose "port it")**: both batch RPCs skipped
   payroll entirely — `voucher_type NOT IN (…, 'payroll_bank_transfer')` cut the
   drain loop and no custody block existed, so a payroll PV approved via BATCH
   moved bank cash while leaving every pool untouched (custody understated,
   paying depts overstated). mig `20260731010000` ports all three behaviours to
   `approve_voucher_batch` + `approve_voucher_batch_partial`: drain the source
   pools, allow 预支 while draining, credit the full round to the request's
   target_pool — plus reference_id added to both RETURNING lists (same trap as
   above). All three approval paths now behave identically; anchored + idempotent.
   NOTE: no payroll PV had actually been batch-approved, so there is no historical
   data to repair (checked: the only paid payroll transfers came through the
   single path).

User: "这笔无法记录 interest,我指的是打去 interest in suspense account."
Context found in the GL: a manual JV on 2026-05-20 carved the 300k back-to-back's
WHOLE-TERM interest out up front — Dr 3063 (Interest in Suspense - Recv - The Cont)
38,333.33 / Cr 3053, and Dr 4052 / Cr 4062 (Pay - HOUZS Century) on the funding
side. So 3053 now holds principal only, and collecting interest must DRAW DOWN
3063; crediting 5027 again would double-count income.
- lib/loans-coa.ts: `resolveInterestSuspenseLeaf` + INTEREST_INCOME_CODE /
  INTEREST_SUSPENSE_PARENT constants (matches a 3060 child by borrower name or
  short_code, same tolerance as the receivable resolver).
- recordRepayment accepts `interest_account_code`; applies ONLY to payment_type
  'interest', and validates it is 5027 or an ACTIVE child of 3060 — anything else
  throws rather than posting somewhere odd. recordLoanRepaymentReceived forwards
  it on the interest leg only.
- 收到 Loan 还款 form: an "利息入账科目" select appears only when interest > 0 AND
  that borrower's suspense leaf carries a balance; it DEFAULTS to the suspense
  account (the safe choice) with 5027 as the explicit alternative. /payments/new
  computes each loan's suspense leaf + live balance (is_reversed excluded).
- Only The Cont has a suspense balance today (3063 = 38,333.33); every other loan
  sees no select and behaves exactly as before.
3. **明细**: the single-month Cash Flow Statement ALREADY had drill-down
   (GlReportView ▸ + applyGlRefs) — user picked it, so the work was making the new
   gross rows carry per-side txns (done above). The Monthly Cash Flow MATRIX still
   has no drill-down (MonthlyMatrix has no txn expansion) — user did NOT ask for it
   this round; it is the obvious next request if they say 明细 again.

# (previous checkpoint) 2026-07-22 · project MOVED to local Desktop

> Context-window handoff. Read this first to continue. User communicates in 华语 (Mandarin).
> **PROJECT PATH since 2026-07-22: `C:\Users\User\Desktop\Claude\Venture\Venture-Portal`** —
> user un-synced OneDrive's Desktop backup; Windows relocated the real files to the local
> Desktop. The old `C:\Users\User\OneDrive\Desktop\Claude\...` tree is a DEAD dir skeleton
> (user may delete it). Payroll model: 2026-07-20C (FINAL custody model) SUPERSEDES the
> intermediate 2026-07-20B redesign below (kept for history).

## Session 2026-07-24B — fund-source-cancel enum bug + June funding deadlock found

1. **execute_fund_source_cancel enum typo (user hit live)**: Principal batch-approved;
   the HOUZS Century cancel card (RM 45,156.32, tier_change) died with `invalid input
   value for enum fund_source_type: "dept_pool"` — the dept-pool guard compared against
   'dept_pool' but the enum label is 'department_pool' (bug since mig 20260612050000;
   EVERY cancel approval would die there). Guard sits BEFORE any write → zero financial
   rows moved; only the card was consumed approved-without-effect (approvals action
   records approval BEFORE calling the RPC — known ordering weakness, not fixed today).
   Fixed by mig `20260724030000` (literal → 'department_pool', body otherwise identical);
   card 783ab989 flipped back to pending by support SQL → Principal just re-approves.
2. **June funding deadlock (diagnosed, awaiting user go-ahead)**: HR Payment page's
   PV-making sections (staff/director batches + statutory table) unlock ONLY at
   phase='funded' (request status 'completed' or run 'paid'); the create_* RPCs enforce
   the same. June request 37aa7f87 (95,390.70, owns PAID PV-0100 84,818.28 + voided 0115)
   was CANCELLED by mig 20260722100000's void-reset (other session). Committed is counted
   per-request (payment_vouchers.reference_id = request id), so a re-filed request starts
   at 0/95,390.70 and either double-transfers or never completes → sections never unlock.
   DONE (user said 复活, 2026-07-24): 37aa7f87 restored to 'pv_generated', cancel fields
   cleared, pv_id re-pointed at paid PV-0100, note appended; verified committed 84,818.28
   / remaining 10,572.42. USER'S PLAN (their own hands, we only verify after): Finance
   generates the 10,572.42 remainder PV (HL→Alliance) → Principal approves → request
   auto-completes → HR page unlocks; then an OFFSETTING internal transfer
   (Alliance→HL 10,572.42, 备注对冲) because HOUZS Century's deposit landed directly in
   Alliance so no real bank movement is wanted — the two documents cancel in-system, NO
   real bank transfers will be made (user decision; bank statement will have no matching
   flows — remember at reconciliation). Going-forward rule set by user: external money
   always lands in Hong Leong; Alliance receives payroll custody only. Also fixed today:
   fund-source cancel refunds from RECEIVING bank (mig 20260724040000) after user caught
   the HC 45,156.32 deposit was in Alliance while the executor hardcoded primary (HL);
   HC deposit had been DOUBLE-activated (dupe approved in the same batch as the enum
   crash) — the cancel card targeted the dupe (2f87e5ae), re-approved cleanly: banks
   cache==GL both, TB 0.00, vp net single-counted.

## Session 2026-07-24C — evening fixes
1. **createPaymentVoucher errors now readable in prod**: the action's throws were
   sanitized by Next in production ("An error occurred in the Server Components
   render…") — user stuck building the Alliance→HL offset with an empty required
   Description and no way to know. Wrapped: createPaymentVoucherInner + exported
   wrapper returns {error} (NEXT_REDIRECT rethrown via digest check); NewPaymentForm
   shows result.error. June funding VERIFIED COMPLETE: PV-0153 remainder paid (dept
   slices Mkt 5,145.95/Fin 2,937.45/HR 1,722.77/DO 766.25; custody np_in 10,572.42),
   PV-0154 offset paid (Dr3000/Cr3010, zero pool rows), request completed, HR page
   unlocked, banks cache==GL, TB 0.00. NOTE: HL down to ~2,135 (user approved 3 big
   pending PVs 158,780 total) — cash-thin, flagged to user.
2. **Repayment Schedule month-blind pending-PV fix**: sources carrying an in-flight
   repayment PV surfaced in EVERY viewed month (HC 45,156.32 pending
   HV-PV-202607-0178 polluted JUNE's to-repay). Both the skip-exception and the
   pending-row branch now require isCurrentMonth. Also flagged to user: 0178's
   interest 451.56 = a FULL month on a deposit held ~9 days — confirm before
   Principal approves.
3. User password changes: guided via Supabase dashboard SQL editor (their own hands,
   test password; SQL editor history cleanup advised).
4. **P&L layout drift fixed (user: why doesn't P&L mirror my COA Revenue tree)**:
   the saved pnl layout (06-29) listed only 4 revenue codes — 5001/5021-5025 and
   inter-billing 9052-9056 were never added, landing in Unassigned or invisible.
   (a) Layout patched by SQL: Revenue now lists all 10 codes, Expenses all 18 —
   hierarchy renders via ancestry so children nest under 5010/9050 headers.
   (b) buildCustomPnlRows now AUTO-FILES un-placed accounts into the category
   matching defaultCategory (same pattern buildCustomCashFlowRows already had;
   +4 tests, suite 404). Unassigned only remains when no matching category exists.
   NOTE: local tsc shows 5 errors in the user's untracked `* - Copy.tsx` snapshots
   (drifted vs the other session's RequestState/batchState changes) — NOISE, not in
   the repo, never touch those files; filter with grep -v ' - Copy'.
   PENDING from user: "marketing rental" report change (not yet described).
5. **Revenue reclass (user request, DATA surgery)**: invoice line categories were
   stored but the pre-Mig-275 issue JEs lumped every multi-line invoice's credit
   into 5000. Reclassed 38 issued/paid invoices (May-Jul) in one transaction:
   per-invoice, deleted the lumped 5000 credit line and inserted per-category
   credit lines from invoice_lines (grouped, description 'Reclass 2026-07-24: …');
   preflight required JE-credit == lines-sum on every invoice (all OK), post-check
   required every touched JE balanced (pass), TB 0.00. Result: May/Jun/Jul 5000 = 0,
   revenue sits in 5001/5021-5026 (+7012/9087/9091 recoveries); Feb-Apr stay in
   5000 (no line data existed). Mig 275 keeps new issues correct.
6. **Consolidation elimination (user request: "这样就出两次费用了")**: new
   lib/consolidation.ts — fetchInterBillingElimination (internal invoice ids =
   billable_to_type dept_pool|director; 9050-family codes) + eliminateInterBilling
   (drops lines whose ref_id is an internal invoice, plus any 905x line). Applied
   ONLY on the consolidated (no-segment, non-dept-manager) view of P&L Statement +
   Monthly P&L + both exports; per-segment views unchanged; BS/TB/CashFlow
   untouched; Net Income unchanged (pairs netted anyway). UI notes on both pages.
   +3 tests (suite 407).
7. **Inter-billing BY NATURE (user Q1-Q3)**: paying dept's expense now posts to what
   the charge actually WAS — lib/inter-billing-nature.ts payerExpenseSplits: income
   category → payer counterpart (7012→9094 Office Rental, 5020→9030 Salary Expense),
   expense-type category (recovery, e.g. 9091) → same account, unmapped → dept 905x
   FALLBACK (accounts kept, normally zero — user Q3 answered 保留). Wired: billing/
   actions approveInvoice + approveInvoicesForPeriod issue-JEs (per-nature debit lines,
   interBillingNatureSplits helper, fail-loud on sum mismatch) + payments/actions
   mirror rows (per-nature, falls back to lump on mismatch). HISTORY reclassed by SQL
   (user Q2 要): preflight proved 0 multi-nature internal invoices, 11 GL 905x lines +
   7 mirror rows all single-nature → in-place account swap (amount untouched, JEs stay
   balanced): Marketing 905x → 9094 7,510.45 + 9091 1,677.19; VO 821.86 → 9030.
   Post: 905x GL 0.00, PVS 905x 0, TB 0.00. Consolidation elimination still covers
   these lines via the invoice-ref rule (905x belt now vestigial but kept).
8. **Loan Aging report (user Q4-Q6)**: /reports/loan-aging + xlsx/pdf export + Reports
   index card. BOTH directions (Q4 要 fund in 也要): 应收 Fund OUT loans / 应付 Fund IN
   sources. lib/loan-aging.ts buildInstallmentAging — flat amortisation, first due =
   month after disbursement/effective, pooled payments FIFO oldest-first, buckets
   due-this-month / 1 / 2 / 3+ months late (Q5 ok); compounding & no-fixed-term in a
   separate NOT-AGED block below each table (Q6), outstanding shown in Total column.
   lib/loan-aging-data.ts fetch+matrix (reuses monthly-matrix kit; aging = exceptions
   report — fully-on-track loans are hidden). +12 tests (suite 419).
   **SUPERSEDED same day → Loan Monitor**: user saw the buckets and redefined ("我要的
   是根据定好还款日期的,当月没还的" + outstanding split 定好/没定好). Discovered via
   repayment notes ("本金 1/6 (本月起还)") that schedules get renegotiated starts the
   system never stored — months-late math was meaningless. Rebuilt:
   - mig `20260724050000`: loans.repayment_start_month + fund_sources.repayment_start_
     month (nullable; stored month IS installment #1; NULL = disb/effective +1) + two
     SECURITY DEFINER setters (finance/principal).
   - lib/loan-monitor.ts (fetchLoanMonitorData + resolveFirstDueYM/remainingPeriods;
     old loan-aging*.ts DELETED): 区1 本月应收/应付 (started plans with remaining
     periods; shortfall = this month's installment − paid this month; settled rows
     disappear); 区2 Outstanding split scheduled vs 未定, per side, with start labels.
   - /reports/loan-aging page rebuilt (Debtor-Aging-style ledger tables, SC badges,
     sidebar/card renamed "Loan Monitor", route unchanged); export = one matrix
     [Due/Paid/Shortfall/Outstanding].
   - RepaymentStartEditor on BOTH detail pages (fund-out + fund-in) via
     setLoanRepaymentStart / setFundSourceRepaymentStart.
   - Data: CONTS 58k & 60k @4% set to 2026-05 start per the notes evidence.
   Suite 417 (aging tests removed, monitor tests added).
   **Follow-ups the same evening (user walked every row)**: aging buckets RETURNED
   into 区1 (anchored on repayment_start_month; loan-aging.ts restored from git);
   exports split into ?view=aging|outstanding using the Debtor-Aging white PdfTable
   kit (PDF font has no CJK — export labels are compact ASCII; SC is its own
   column, page keeps the web chip); more agreed starts set by evidence/user:
   HC 60k & 58k @3% → 2026-05, BOTH 300k positions (CONTS loan + HC source) →
   2025-01 (user confirmed repayments ran since Jan-25). Directors RLS opened to
   finance for SELECT (mig 20260724060000) — names were '—' everywhere for
   finance. **L32 netting row DELETED** from fund_source_repayments: the
   53,613.75 '2990 knock-off HC outstanding' was wrongly mirrored onto the HC
   100k@2%/3mo deposit (user: that deposit was never repaid); the counterparty-
   level swap already lives in manual JV-000010 (Dr 4052 / Cr 4051, 2026-03-29).
   ⚠️ KNOWN RECONCILING ITEM: HC's per-deposit outstanding sum now exceeds GL
   4052 by 53,613.75 (the JV nets HC at account level only, attached to no
   deposit). If HC ever agrees which deposit it settles, record a netting
   repayment there and the gap closes. Confirmed real arrears (user): CAR 200k
   (owes May-Jul), 2990 100k (nothing paid), 2990 200k payable, Kingsley 100k
   payable. HC 100k@2%/3mo now shows all 3 installments overdue (~106k incl
   interest) — real per user.

## Session 2026-07-22 — OneDrive un-sync recovery + fund-out 资金来源 field

1. **Recovery**: full project found at the new Desktop path (Known Folder Move). git HEAD
   `5fc3d31` = last push, fsck clean, `.env.local` intact. The move had staged 276 tracked
   files as deleted → `git checkout -- .`; node_modules half-broken → `npm ci`. All gates
   green after reinstall (tsc clean · 380 tests · build OK). Silver lining: the OneDrive
   `.next`-lock quirk (EINVAL during build while dev server runs) is gone.
   NOTE: the bound `mcp__supabase__*` MCP server lost its config in the move — DB access is
   via the account-level Supabase MCP server (execute_sql/apply_migration with
   `project_id: "gixpptmfuryskbwkmiwz"`).
2. **fund-out 资金来源 (user request)**: New Loan form now has a dedicated "资金来源 ·
   Funding source" input (NewLoanForm). createLoan sanitises it (strips `·`, the parser's
   delimiter) and appends `· 资金来源: {x}` to repayment_terms AFTER the 未定还款 prefix
   logic; `fundingSourceFromTerms()` (lib/utils) parses it back for the SC badge on the
   loans list + repayment schedule. Amend form hint documents the same convention (its
   free-text terms box already lets Finance add/edit the suffix on existing loans).
   User then chose "办法3" (self-service): the Amend form turned out Principal-ONLY
   (amendLoan + /edit page both requireRole(['principal']), active loans only), so Finance
   couldn't edit old loans at all. Added mig `20260722000000_loan_funding_source_rpc`:
   `terms_with_funding_source(terms, source)` (IMMUTABLE segment rewrite — drops any
   existing 资金来源 segment incl full-width colon, preserves 未定还款/[LO#…] markers
   verbatim, appends canonical `· 资金来源: X`, NULL when empty; 7 edge cases verified by
   live SELECT) + `set_loan_funding_source(p_loan_id, p_source)` SECURITY DEFINER RPC
   (finance/principal via current_user_role(), strips `·`/newlines, max 60 chars, any loan
   status). UI: FundingSourceEditor on the loan detail page (inline input + 保存, empty =
   remove badge) via new setLoanFundingSource action. Rates/tenure/dates stay
   Principal-only. ~~STILL PENDING (user-side): fill sources for the July loans — Carres
   10k, The Cont 10k + 80k, 2990 60k, CMI 55,540.08, Hookka 98k~~ — **DONE by the user;
   re-swept 2026-07-31: every JULY loan now carries a badge** (Carres 10k / The Cont 10k
   = 2990s, The Cont 80k + 2990 60k on 7/07 = HC, 2990 60k on 7/24 = Conts; the active
   Hookka 98k = HC — only its CANCELLED twin has none, which is fine). Four OLDER loans
   still lack the badge:
   - 2990 10,000 (2026-04-30, active) — terms already say "资金从 Kingsley 借过来";
     format-only, just needs "Kingsley" through the field.
   - CMI 55,540.08 (2026-06-25, active) — terms say "Capital Inject - from Houzs";
     matches fund source **HC 55,540.08 eff 2026-06-27** to the cent. HC *is* Houzs
     Century, so format-only too.
   - CONTS 120,000 (2026-06-08, fully_repaid) — no source at all, but fund source
     **HC 120,000 eff 2026-06-08** is same-day same-amount. Near-certain HC; user to confirm.
   - CONTS 50,000 (2026-05-11, fully_repaid) — no source. **ANSWERED by the user
     2026-07-31: it is two sources — 2990's 45,000 fund IN PLUS 5,000 of Venture's OWN
     fund pool.** Not a missing record, a split funding. Don't re-raise it as a gap.
   Nothing written — user asked for a look only.
3. **List columns + search (user requests)**: Fund IN list rebuilt on SortableTable
   (new _components/FundSourcesTable.tsx — search box over From/Type, click-sort all
   columns, facet filters on Type/Status; StatusLabel moved in there; page.tsx now just
   maps rows). Confirmed for user: both lists default to the ACTIVE tab — settled items
   sit under Repaid/Fully-repaid/All, not gone. Fund IN table + Date (effective_date) + Outstanding
   (fund_source_outstanding view; shown for active/matured, — otherwise). Fund OUT table:
   "Created" column → "Disbursed" (disbursement_date; created_at stays in the small line
   under the company name; default sort now disbursedAt). LoanRow.disbursedAt is OPTIONAL
   on purpose — the stray `fund-out/page - Copy.tsx` (user's snapshot file, off-limits,
   see below) imports LoansTable and must keep type-checking. Both lists confirmed to
   default to the ACTIVE tab (settled items live under repaid/fully-repaid/All tabs).
   NOTE: user directive 2026-07-22 — repo contains `... - Copy` snapshot files
   (design-import/, src/app pages/actions) that are the user's own copies; NEVER delete/
   edit/clean them, and stage commits with explicit paths (no `git add -A`).
4. **Fund IN 撤回 (2026-07-24, user request)**: Finance had NO way to kill a wrongly
   submitted pending_approval fund source (detail page offered Edit only;
   cancelFundSource requires status='active'). New mig `20260724000000`:
   `withdraw_pending_fund_source(p_fund_source_id)` SECURITY DEFINER — asserts
   pending_approval, flips to cancelled, closes its pending approval_requests card with
   Principal-reject-identical fields (Finance RLS can't update approval_requests inline —
   the voided-PV silent-0-rows class). UI: 撤回 · Withdraw button next to Edit in the
   pending Actions section. Pending = no money moved, so nothing to reverse; mirrors Fund
   OUT's Finance-cancel-before-approve. User had 2 wrong pending entries to withdraw.
   **v1 BUG (user hit it, crash page)**: v1 set approved_by = auth.uid() on the card —
   but withdrawer IS the submitter, and CHECK no_self_approval forbids approved_by =
   submitted_by → RPC raised, action THREW → app-wide error page; RPC rollback left both
   sources safely pending. Fix mig `20260724010000`: approved_by stays NULL (constraint
   allows; approved_has_metadata only binds status='approved'), notes = 'Withdrawn by
   submitter before approval'. UX: action now RETURNS {error}; new WithdrawButton client
   component (replaces ConfirmButton usage) shows it inline. LESSON for this codebase:
   fund-in page-level actions that throw (cancelFundSource etc.) crash to the error page —
   prefer returned errors for user-triggered actions. SEPARATE pre-existing noise spotted
   in postgres logs: recurring `invalid input syntax for type uuid: "null"` (also fired
   2026-07-23, predates all of this) — some query passes literal 'null'; not yet traced.
5. **Receipts page shows ALL money in (user request)**: /receipts now merges two
   synthetic row kinds into the OR ledger (VoucherLedger isReceipts branch):
   direct loan repayments (`repayments` EXCLUDING rows whose notes start
   'Auto-synced from voucher' — those are OR-driven and already listed as their
   HV-OR; the approve RPCs stamp that prefix) and Fund IN capital
   (fund_sources status active/matured/repaid, dated effective_date). Rows are
   unnumbered, status 'received' (green), Category 'Loan repayment · type' /
   'Fund IN · type', View links to /fund-out/{loan} & /fund-in/{id}
   (VoucherRow gained optional href; VouchersTable defaultSort now Date desc so
   unnumbered rows interleave; STATUS_STYLES + 'received'). They obey q/date/
   min/max filters + All/Paid tabs; a voucher-type or pool filter hides them
   (no such fields) — Category funnel narrows per kind. Hero Total received
   now includes them with a breakdown line. Extras logic extracted to
   lib/receipt-extras.ts (fetchReceiptExtras + filterReceiptExtras) and the
   /payments/export route now appends them for direction=credit, date-sorted
   (type column 'loan repayment'/'fund in', status 'received') — page and
   export agree. ALSO: Principal accidentally submitted HV-PV-202607-0111
   (RM 320, W MEDIA PRODUCTION) — no_self_approval correctly blocks Principal
   approving own submission. REMEDY BUILT (user request): mig `20260724020000`
   `return_voucher_to_draft(p_voucher_id)` — pending_approval only, refuses
   grouped cards (batch approvals must not fracture), flips PV → draft and
   closes its pending card (rejected, approved_by NULL per no_self_approval,
   notes 'Returned to draft for resubmission'). Nothing financial posts at
   pending stage (verified 0 pool/JE rows for PV-0111). UI: 「退回 Draft」
   button on the voucher page for pending PVs (both roles; VoucherActions
   optional returnToDraft prop; action returnVoucherToDraft). Flow: Principal
   或 Finance 点退回 → Finance opens the draft PV → Submit for approval (new
   card stamped submitted_by=finance) → Principal approves. FOLLOW-UP the same
   day: user resubmitted from the PRINCIPAL session twice more (page's
   isFinance = finance OR principal, so Principal also saw the Submit button;
   DB showed 3 principal-submitted cards). Fixed: VoucherActions draft block
   hides Submit for isPrincipal + shows an alert box explaining; PV-0111
   returned to draft by support SQL (card closed, notes '(support: submitted
   from Principal account again)'). Voucher was CREATED by Finance — only the
   submits were from the Principal session (likely two logged-in windows).
   Director Pool v2 to main (4 commits, `7624312..3d5e10d`: standalone Salary Pool
   calculator port + Save/Clear + Flow view fixes; migrations `20260717130000_director_
   pool_calculator` + `20260721100000_dp_hr_access` — assume both applied to live DB;
   roles.ts + database.types.ts changed; +20 tests → suite now 400). This session's work
   was rebased on top; no file overlap.

## Session 2026-07-21B — self-audit findings + fixes (mig `20260721010000`)

User asked for a bug sweep over the day's overhaul. Invariants all green (TB 0.00, Σpools +
GL(corp/treasury) == banks == 138,287.61, zero unbalanced JEs). Two real defects found+fixed:
1. **Cash-flow bridge void contamination** — voiding a paid PV REVERSES its pool rows with
   void_in/void_out rows but keeps the ORIGINALS; both bridge matchers (inter-billing AND
   the new payroll custody) counted the originals while the void rows never match → voided
   HV-PV-202607-0115's round (and one historical voided receipt with inter_billing rows)
   leaked phantom transfers into per-segment Cash Flow. Fix: the bridge now loads voided
   voucher_nos and skips any pool row whose `PV <ref>:` belongs to one (both flavours).
2. **approve_voucher_batch had NO bank-balance guard** — it decremented the cache
   unconditionally; a grouped approval (exactly the June staff batch scenario) could drive
   Alliance silently negative. Guard added matching approve_single_voucher
   (mig `20260721010000`). Note: approve_voucher_batch_partial already had a BETTER guard
   (per-bank jsonb pre-aggregation) — only the full-batch RPC was exposed.
3. **Voided PVs left PENDING approvals in Principal's queue** (user-spotted) — voidVoucher's
   inline approval rejection ran under the caller's RLS; Finance can't update
   approval_requests, PostgREST returned success-with-0-rows unchecked → 17 live orphans
   (the 16 voided statutory PVs + one from 2026-07-15). Cleaned by direct SQL; NEW
   SECURITY DEFINER RPC `close_approvals_for_voided_voucher` (mig `20260721020000`)
   verifies the voucher is voided then rejects its pending approvals; voidVoucher now
   calls it and FAILS LOUD. (Approving an orphan was money-safe — approve RPC raises on
   non-pending vouchers — but the queue filled with dead cards.)
Pre-existing item REPORTED, not touched: **4070 Accrual-Salary carries a legacy residual** —
balance 113,756.20 vs June outstanding 117,528.75 (their month-end JVs); history (Jan-Mar
opening-era credits, Apr-Jun mixed) nets −3,772.55, so after June's full payout 4070 will
land at −3,772.55 instead of 0 → needs a Finance ruling/reclass someday. Same class of
history exists on 4071-4074 (balances 31,641.00 / 4,689.85 / 739.00 / 10,788.90 include
pre-June months).

## Session 2026-07-21 — HR is the payroll payments operator (mig `20260721000000`)

User clarified real practice: HR (not Finance) makes the salary/KWSP/PCB/SOCSO payments, staff
and directors may be paid on DIFFERENT days, and statutory bodies are paid ONE AT A TIME.
- `create_payroll_disbursement_vouchers(period, scope, payment_date)` — scope 'staff' |
  'directors'; each scope = its OWN batch/approval-group/date; per-scope dedupe (staff can
  run while directors wait, e.g. while director actuals are still being keyed).
- `create_payroll_statutory_vouchers(period, scheme, payment_date?, bank?)` — ONE scheme per
  call (KWSP/SOCSO/EIS/PCB/SKBBK), per-scheme dedupe (void one, regenerate just it).
- NEW `set_payroll_pv_payment_date(voucher, date)` — hr/finance/principal; pending
  payroll_disbursement/payroll_statutory only (dates are HR's knowledge; /payments editing
  stays Finance-gated).
- HR Payment page rebuilt: Staff batch card + Director batch card (own date pickers) +
  statutory 5-row table (staff/director split per scheme, generate + date + save-date per
  row, voucher links). Also gained a MONTH SELECTOR (?period= + arrows) — the page was
  pinned to the calendar month while cycles finish the following month.
- Finance's payroll-requests statutory section → READ-ONLY (links + dates); its generate
  action removed. Finance's payroll role = funding rounds + month-end JVs only.
- Live-safety during the signature swap: generators are gated on funding completed; June's
  request is NOT completed (round 2 voided), so nothing could call mid-deploy.
- **Payroll custody CASH-FLOW BRIDGE added** (closes the 20C known follow-up): the funding
  reallocation (dept expense_out → HR custody np_in, dept_pools-only) now feeds synthetic
  lines into all four Cash Flow surfaces via `inter-billing-cash-flow.ts` — new pseudo
  Financing account `PY-XFER` "Payroll custody (internal transfer)"; payers matched to
  custody receipts by the funding PV ref (custody marker "payroll fund → HR custody").
  Each dept's per-segment Cash Flow now shows "Transfer to HR payroll custody" out, HR
  shows the custody in; consolidated unchanged; monthly custom layout files PY-XFER under
  Financing via ensureInterBillCategory. 4 new tests (380 total).

## Session 2026-07-20D — accrual convention locked: pure-transfer funding + 4070-74 clearing (mig `20260720160000`)

Discovery: Finance ALREADY books the monthly payroll accrual manually — five per-segment JVs
on 2026-06-30 (`JE-202606-0226..0230`, incl. DIRECTOR), their convention:
**Dr 9030 basic + 9084 allowance + 9081/9082/9083 ER contributions / Cr 4070 net · 4071 EPF ·
4072 SOCSO(+SKBBK — user: SKBBK stays in 4072) · 4073 EIS · 4074 PCB.** Staff dept totals tie
the funding to the cent; the system's auto-accrual (Dr 9030/Cr 4020 at funding) was therefore
DOUBLE-COUNTING June P&L. User rulings: funding = "fund transfer purpose 罢了" (no expense);
SKBBK → 4072; director actuals 以用户手工 JV 为准 (JV: net 45,144.35 / EPF 13,961.00 /
PCB 8,691.35 — DIFFERS from the engine's director_payouts: 38,129.40 / 11,408.00 / 7,431.80).

- **approve_single_voucher**: payroll_bank_transfer posts ONLY the hr-segment staging JE
  (Dr 3010/Cr source). No accrual. Dest (Alliance) cache credit now via
  `credit_dest_bank_on_bank_transfer` — funding PVS rows carry account_code **3010**
  (generatePvFromRequest changed 9030→3010; PV detail shows bank staging, not Salary Expense).
  Pool drains + FULL-round HR custody credit + bank guard unchanged.
- **Disbursement PVs** (staff AND director): account **4070** (was 4020/9030).
- **Statutory PVs**: five schemes now cover STAFF + DIRECTORS in one payment each —
  KWSP→**4071** · SOCSO→**4072** · EIS→**4073** · LHDN→**4074** · SKBBK→**4072**; two PVS
  rows per PV (staff share dept_pool_hr, director share dept_pool_director).
- **June dedup (direct SQL, recorded)**: deleted the 8 auto-accrual JEs (July-dated,
  Dr 9030/Cr 4020) after re-pointing PV-0100's backlink to its staging JE (PV-0115 → NULL);
  funding PVS account_code → 3010. Verified: 4020 balance **0**, July payroll expense **0**,
  June salary expense (9030+9081-84) = **163,818.20** == the 5 manual JVs exactly
  (staff 95,390.70 + director 68,427.50), TB 0.00, Σpools+venture = banks = 138,287.61.
- ⚠️ BEFORE June payouts/statutory: **director_payouts must be updated to the user's JV
  numbers** (owner: HR/Principal via the Director Salary actual grid — Finance must not
  write it, dept-data boundary). Until then the PVs would generate from engine numbers and
  4070/4071/4074 would not clear to zero. Also investigate later WHY the engine differs
  (allowance 3,079.30 not modelled, EPF basis, PCB table?).
- Alliance cash for the full June cycle at the user's numbers = 163,818.20 total out;
  after PV-0115's pending 10,572.42 transfer Alliance ≈ 141,129.47 → still ~22,689 short
  (director side) — one more HL→Alliance top-up when director numbers are final.

## Session 2026-07-20C — payroll model: HR CUSTODY (mig `20260720140000`, deployed + applied)

After running both models the user ruled: **"payroll request 就是扣各个部门的 fund 去 HR 的
Alliance"** — the ORIGINAL custody flow was right all along; only its bug (HR's own share
leaking) needed fixing. This supersedes 20B's pools-drain-at-payout model. Gates green;
live DB migrated; June data re-aligned; invariant Σpools + GL(corp/treasury) == banks holds
(verified 144,141.94 − 5,854.33 = 138,287.61 == bank caches; TB 0.00).

### Final flow (as-built)
1. **Funding PV approval** (`payroll_bank_transfer`, partial rounds, amounts typed by
   Finance per dept — manual adjustment preserved):
   - Dr 9030 / Cr 4020 per dept segment (P&L per dept) — unchanged;
   - **drains each source dept pool by its typed share** (short pool → negative, 预支,
     GUC auto-set for payroll_bank_transfer);
   - **credits dept_pool_hr with the FULL round** (`PV %s: payroll fund → HR custody`)
     — includes HR's own share, THE bug-fix vs the old fan-out;
   - source bank guarded + debited, Alliance (GL 3010) credited;
   - ONE staging JE per round, **segment='hr'** (Dr 3010 / Cr 3000) — per-bank table
     shows HR's Alliance slice swelling and each dept's row shrinking via pool balance.
2. **Stage-G staff payouts** (one PV per employee, HR creates batch, Principal one-click):
   drain `dept_pool_hr` only; `derive_journal_segment` now maps payroll_disbursement →
   staff rows 'hr', director rows 'director' (was staff-dept / 'director_office').
3. **Statutory**: FIVE ungrouped PVs — KWSP / PERKESO (SOCSO) / PERKESO (EIS) / LHDN /
   SKBBK — each ONE payment to its scheme, single PVS row `dept_pool_hr` acct 4020,
   payment_date NULL for Finance (2-arg RPC again; the split-by-dept variant and its
   UI checkbox are GONE — user voided the 16-PV experiment). June amounts: KWSP 18,496.00 ·
   SOCSO 1,596.60 · EIS 283.80 · LHDN 2,097.55 · SKBBK 532.35.
4. Directors unchanged (dept_pool_director; 4 PVs June, 38,129.40; staged via PV-0109).
- HR pool balance = the payroll war chest; hr-costing/payment hero shows it again
  ("HR Pool · payroll custody"). It SWELLS between funding and payday BY DESIGN (user
  accepted after the 白话 explanation); after June's full payout it lands back at ~315.42.

### June data re-alignment (direct SQL, recorded for audit)
- Re-inserted the 8 funding `expense_out` drains (dept typed shares, with approval_ids —
  `expense_has_approval` CHECK requires them; overdraw GUC needed for Marketing) + 2
  custody `np_in` (84,818.28 / 10,572.42 FULL rounds → HR).
- PV-0100's four staging JEs re-tagged segment→'hr' (custody pot, not per-dept slices).
- Pools after: HR **95,706.12** (pot 95,390.70 + own 315.42) · Finance 510.21 ·
  Marketing **−24,659.54 (预支)** · DO 125.89 · Director 68,197.26 · VO 4,262.
- Banks during verify: 138,287.61 (a live Carres receipt OR-0125 +3,339.81 landed
  mid-check — user activity, correctly recorded).

### June remaining steps
1. HL→Alliance transfer for **PV-0115's 10,572.42 still physically pending** (HL holds
   ~7.7k; needs inflow). Retrofit its staging JE + caches when the user confirms, same as
   PV-0100's (whose 84,818.28 IS transferred + recorded).
2. HR creates disbursement batch (18 staff PVs, 72,384.40) → Principal approves batch.
3. Finance generates the 5 statutory PVs (bank picker defaults Alliance), sets dates →
   Principal approves. After everything: HR pool ≈ 315.42, 4020 → 0, Alliance drains by
   133,520.10 total (incl. directors); approve the last ~RM 3k of vouchers only after
   0115's transfer or Alliance cache blocks them.
- ⚠️ Known follow-up (queue if user cares): per-segment Cash Flow report doesn't bridge
  the custody pool rows (funding expense_out / custody np_in are dept_pools-only, like
  inter-billing before the 20A bridge) — dept per-segment CF vs pool will diverge by the
  payroll flows for July+ months until a bridge like `inter-billing-cash-flow.ts` covers
  `PV HV-PV-%` custody pairs. The dept-pool page itself stays tied (fold-into-HL logic).

## Session 2026-07-20B — payroll money-flow REDESIGN (mig `20260720100000`, deployed + applied)

User spotted HR pool at RM 74,355.02 ("HR 不可能那么多 fund") — correct instinct. Root cause +
redesign, all DEPLOYED and the live DB migrated + data-corrected. Gates green (tsc / 376 tests /
build). **RECONCILED at session end: Σ6 segments 134,947.80 == bank caches == GL; TB 0.00.**

### Root cause (June was the FIRST real run of the new payroll cycle)
- Stage-E funding approval drained ALL 4 dept pools (`expense_out`), then trigger
  `fan_out_payroll_bank_transfer` parked only the NON-HR sum (74,039.60) into HR's pool —
  **HR's own 21,351.10 vanished from the pool system** (live: pools+Venture 113,596.70 vs
  banks 134,947.80; the dept-pool page's footer "Bank balance" is a COLUMN SUM, so the leak
  was invisible on-page).
- Stage-G would then drain dept_pool_hr for EVERY employee (~94,858) against a 74k pot —
  HR would have landed ~−20.5k (double-drain of HR's own share).

### New model (user ruling: "凑钱只是换银行,各部门扣各部门")
- **Funding PV approval** = per-dept salary accrual (Dr 9030/Cr 4020, unchanged) **+ real
  HL→Alliance staging transfer**: source bank guarded+debited, Alliance (GL `3010`) credited,
  one transfer JE per pool slice (Dr 3010/Cr source, segment-tagged). **NO dept-pool writes.**
- **Stage-G disbursement**: each staff PV drains the **staff's own dept pool** (was
  dept_pool_hr for all); directors unchanged (dept_pool_director). GL side already resolved
  per staff dept via `derive_journal_segment` — pools now match it.
- **Statutory**: NEW RPC `create_payroll_statutory_vouchers(period, bank, split_by_dept)` —
  one-click KWSP / PERKESO(SOCSO+EIS) / LHDN(PCB) / SKBBK PVs (acct 4020),
  **payment_date NULL** (几时付款不确定 — Finance edits the pending PV, GL date follows).
  `split_by_dept=false` (default): one PV per body, PVS split per dept pool inside;
  `true` ("one PV per department" checkbox, mig `20260720120000`): one PV per
  body × department, each independently dated/approved (user: 缴款可能分不同 PV、
  不同日期、不同部门). Bank picker defaults to Alliance (GL 3010 first) — the funding
  staged the statutory share there. UI: "Statutory payments" section on
  /payments/payroll-requests (recent completed periods).
- **Overdraw**: auto-allowed (预支) for reference_type `payroll_disbursement` /
  `payroll_statutory` in ALL THREE approve RPCs — batch RPCs previously NEVER set the GUC,
  so June's Stage-G batch would have been blocked on the first short pool.
- Funding UI: Generate-PV form re-gained a **source-bank balance check** (client+server;
  approval re-checks with row lock); pool-overdraw warnings removed from funding (obsolete);
  hr-costing/payment hero now shows the **Alliance payroll bank** balance, not HR pool.
- `fan_out_payroll_bank_transfer` trigger + function DROPPED.

### Data corrections (direct SQL, recorded here for audit — NOT in migrations)
- Deleted the 2 `np_in` "Payroll consolidation" rows (74,039.60 → HR) + the 8 funding
  `expense_out` rows (95,390.70 across Mkt/Fin/DO/HR) for PV-0100/0115, and the 2
  `dept_transfer` JEs `JE-202607-0247`/`JE-202607-0263` (+8 lines, 1030-1060 accounts only).
  The 8 per-dept accrual JEs (Dr 9030/Cr 4020) REMAIN — correct under the new model.
- Post-cleanup pools: HR 21,666.52 · Finance 24,392.22 · Marketing 19,031.80 · DO 6,592.14 ·
  Director 68,197.26 (unchanged) · VO overlay 4,262. All == their GL expectations.
- ⚠️ MCP lesson RECONFIRMED: a `begin;`-only batch (no `commit;` in the SAME call) silently
  rolls back. First delete attempt no-oped; re-ran with inline commit and verified.

### June cycle — what still has to happen (in order)
1. ~~Physical HL→Alliance transfer~~ → **PARTIALLY DONE + RECORDED** (user confirmed
   2026-07-20: the RM 84,818.28 for PV-0100 WAS physically transferred at the bank; the
   10,572.42 for PV-0115 was NOT). Direct-SQL data correction (recorded here): PV-0100
   retrofitted with the new-rules staging legs — 4 per-dept JEs Dr 3010 / Cr 3000 dated its
   payment date 2026-07-07 (Mkt 38,545.39 / Fin 20,944.56 / HR 19,628.33 / DO 5,700.00) +
   caches HL −84,818.28 / Alliance +84,818.28. Verified: HL cache=GL=4,390.75, Alliance
   cache=GL=130,557.05 (== what net banking should show), TB 0.00; per-segment Alliance
   slices: Mkt 39,437.19 · Fin 21,454.76 · HR 19,943.73 · DO 5,825.90 · Director 44,355.47.
   **⚠️ PV-0115's 10,572.42 transfer still pending** — HL only holds 4,390.75, so it needs
   a cash inflow first; when the user transfers it, retrofit PV-0115 the same way.
   Note: PV-0109 (42,802.20, internal_transfer, 2026-07-09) was DIRECTOR money staged to
   Alliance — unrelated to staff payroll. Alliance PV-0109-era money belongs to Director;
   until 0115's transfer, June payouts borrow ~10,572.42 of it (预支, self-heals).
2. HR runs **Stage-G** (hr-costing/payment → create disbursement batch) → Principal approves
   batch → each dept pool drains its own staff nets; Alliance pays.
3. Finance generates **statutory PVs** (payroll-requests page), sets payment dates, Principal
   approves — drains dept pools per dept statutory (22,473.95 total for June).
4. ~~532.35 over-accrual flag~~ → **RESOLVED (user): it's SKBBK** — a net-only employee
   deduction InfoTech's June export introduced. The pre-2026-07-03 importer dropped the
   column, so June rows had `skbbk_amount=0` while net was already after-SKBBK. Backfilled by
   direct SQL (17 rows, 532.35), then **SKBBK added as a 4th one-click statutory voucher**
   (mig `20260720110000`, KWSP/PERKESO/LHDN/SKBBK, explicit CASE per body).
5. ⚠️⚠️ **INCIDENT (self-inflicted, restore IN PROGRESS)**: the skbbk_amount backfill UPDATE
   fired `trg_hr_monthly_payroll_compute` — its UPDATE-OF list INCLUDES `skbbk_amount` — and
   `compute_hr_monthly_payroll()` re-derived prorata gross + table-lookup EPF/SOCSO/EIS/PCB +
   net on the 17 touched rows, CLOBBERING the InfoTech-imported verbatim figures (e.g. NUR AIN
   gross 2,523.02→2,800.00; THIEN 1,516.67→657.22; CHEW PCB 276.35→361.85). The 2 untouched
   rows (RACHAEL, LING) still carry their 2026-07-02 import stamps — that's the proof it was
   the backfill, NOT a user re-import (an earlier note here claimed a "07:42 re-import" and a
   Finance/Marketing funding delta of 771.67 — both were artifacts of the recompute, RETRACTED).
   **✅ RESTORED (same day)** — user provided the original InfoTech file
   (`PayrollSummary_020726094208AM200.xlsx`, the 02-Jul export). Parsed with the SAME
   header-name logic as `lib/import/infotech-payroll.ts` (scratchpad script); the parse
   tied to every pre-incident aggregate captured in-session (all four dept er/ee sums to
   the cent), then all 17 rows were restored by direct SQL writing ONLY the trigger-safe
   verbatim columns (epf_*/socso_*/eis_*/pcb/gross/net — NOT in the compute trigger's
   UPDATE-OF list). Rows stayed `submitted`; LING/RACHAEL untouched throughout.
   Verified after: identity holds on all 19 rows; net 72,384.40 + statutory 22,473.95 +
   SKBBK 532.35 = **95,390.70 == funding**, and **每个部门 exactly = its funded share**
   (DO 6,466.25 · Fin 23,882.01 · HR 21,351.10 · Mkt 43,691.34 — all diff 0.00). No
   true-up JE needed, ever — the original request was exact.
   Notable: the recompute had ALSO silently shifted LOW / LIAN / JOSIAH / KHO's SOCSO/EIS/
   EPF (InfoTech's statutory base includes OT/commission; the portal trigger's
   `v_statutory_wages` = prorated basic + stat allowance only) — so imported files and the
   trigger genuinely disagree on more than proration; VERBATIM restore was the only
   correct option. Statutory PV dry-run at restored figures: KWSP 18,496.00 ·
   PERKESO 1,880.40 · LHDN 2,097.55 · SKBBK 532.35 (Σ 23,006.30; + nets 72,384.40 =
   95,390.70 ✓).
   **⚠️ LESSON for any future direct SQL on hr_monthly_payroll:** updating ANY of
   basic_salary / statutory_allowance / non_statutory_allowance / ot_hours / ot_amount /
   commission_amount / unpaid_leave_days / deduction_amount / skbbk_amount / period_month /
   staff_id re-fires the compute trigger and wipes imported figures. Write only the
   verbatim columns (epf_*/socso_*/eis_*/pcb/gross/net — NOT in the trigger list), or
   mirror the importer's two-phase pattern.
- NOTE: batch approve RPCs would decrement a bank for a grouped payroll_bank_transfer without
  crediting Alliance — impossible today (funding PVs are never grouped), noted only.
- `database.types.ts` NOT regenerated for the new RPC (same `as any` escape hatch as
  create_payroll_disbursement_vouchers).

### Also this session (2026-07-20B, before the payroll work)
- HOUZS Century RM 45,156.32 duplicate fund source cleaned (kept Alliance-routed `c7302f6b`,
  still pending Principal); `rejectRequest` gained the missing `new_fund_source` cancel
  branch (commit `6efb420`). Century deposit approval STILL PENDING user confirmation.

## Session 2026-07-20A — payroll partial funding · Cash Flow ↔ Dept Pool tie-out · Fund IN bank routing
> ⚠️ Superseded in part by 2026-07-20B above: Stage-E is no longer accrual-only (it now also
> moves cash HL→Alliance), funding no longer touches dept pools, and the funding-time
> overdraw exemption is moot. The Cash Flow bridge + Fund IN routing notes below still stand.

**Everything below is DEPLOYED to `main` (HEAD `64ec536`) and applied to the live DB via MCP.**
Gates green at HEAD: `npx tsc --noEmit` (filter `loan-disbursement.test`), `npm run test:ci`
(376 passing), `rm -rf .next && npx next build`.

### 1. Payroll funding — partial rounds + dept-pool overdraw + payment date (mig `20260708000000`)
Finance was dead-locked on Payroll Requests → Generate PV when a pool (or the bank) looked short.
- **Stage-E funding PV is an ACCRUAL, not cash** (`Dr 9030 / Cr 4020`, mig 20260619) — it never
  moves the source bank's cash, so the old bank-balance block was stale and is **removed**
  (server action + the Approve button's disable). Cash leaves at Stage-G disbursement (Alliance).
- **Overdraw = 预支**: a short dept pool just goes **negative** (plain negative cash, **NOT** a
  booked inter-co loan). `approve_single_voucher` now auto-allows overdraw for
  `payroll_bank_transfer` (applied by string-transforming the LIVE function so all other
  branches stayed byte-identical — see the migration's `DO $mig$` block).
- **Partial funding**: a request can be funded across several PVs; round sum ≤ outstanding
  remainder. Completion trigger re-keyed from the single `pv_id` to `reference_id` + **cumulative
  paid**. Disbursement still needs the request `completed` (fully funded).
- Payment-date picker (drives the GL date at approval, period-lock guarded).
- Files: `payments/payroll-requests/{actions.ts,page.tsx,_components/GeneratePvForm.tsx}`,
  `lib/payroll-funding.ts` (+test), `payments/[id]/_components/VoucherActions.tsx`.
- ⚠️ **Gotcha fixed**: a client `catch` around a redirecting Server Action must **re-throw**
  `NEXT_REDIRECT` (see `approvals/[id]/_components/ApprovalActions.tsx`). Returning instead
  swallows the redirect — the PV was created but the spinner hung forever.

### 2. Cash Flow ↔ Dept Pool tie-out (`lib/inter-billing-cash-flow.ts`)
Per-segment Cash Flow closing ≠ Dept Pool balance. Root cause: **inter-billing AND own-share
settle only in the `dept_pools` ledger, with NO GL journal entry** (conceptual transfer inside
Hong Leong; HV's cash is commingled), so the GL-driven report can't see them.
- Fix: feed **synthetic transfer lines** into `buildCashFlow` (bank leg + a Financing
  "Inter-billing" leg per side) on **all 4 surfaces** (cash-flow page/export, monthly page/export).
- **Payer = every `inter_billing_out`; receiver = the `np_in` sharing the same `HV-OR-…` PV ref.**
  Both directions occur — own-share runs **Venture Office → a dept**, so the receiver is NOT
  always Venture Office, and the payer may BE Venture Office. Don't hard-code either side.
- Sides net to zero ⇒ consolidated Cash Flow unchanged; **all 6 segments now tie** to Dept Pool.
- Monthly (saved-layout) report: `buildCustomCashFlowRows` now **auto-files un-placed accounts by
  their default category** (operating/investing/financing), so the red **"Unassigned"** bucket is
  effectively gone. Also a data fix: the missing inter-company "Amount due" accounts
  (`3052/3056/3057/3058/4053/4057/4100/4200`) were added to the saved Financing layout in
  `report_layouts`.

### 3. Journal Entries search
`/reconciliation/journal-entries` got an instant client-side filter (voucher / description /
segment / date / amount) — `_components/JvList.tsx`.

### 4. Fund IN bank routing (mig `20260708100000`)
Fund OUT (new loan) already had "Pay from bank"; **Fund IN had none** — approval always bumped
the `is_primary` bank and posted the GL debit to its code, so every deposit landed in Hong Leong.
- `fund_sources.bank_account_id` (nullable; **NULL = primary fallback**, so legacy rows are safe).
- "Receive into bank" picker on **both** the create and edit forms; captured in
  `createFundSource` / `updateFundSource`; approval credits the picked bank for **both** the
  balance bump and the GL debit leg (`approvals/actions.ts`, `targetBank`).
- Fund-source detail page gained a **Details** section (source type, from, receive-into bank,
  BS sub-account, rate + simple/compound, period, effective / expected-repayment / maturity).
- NOTE: `database.types.ts` was hand-patched for the new column (Row/Insert/Update) rather than
  fully regenerated.

### Open items / next
- ~~Pending fund source **HOUZS Century RM 45,156.32**~~ → RESOLVED (2026-07-20, later same day):
  user had RE-CREATED it with "Receive into bank = Alliance" (fs `c7302f6b`) instead of editing,
  leaving the original bank-less row (`2531a80b`) as a pending DUPLICATE — approving both would
  have double-counted the deposit. Old row cancelled + its approval rejected via direct SQL
  (notes on both rows record why). The Alliance-routed one remains `pending_approval` for
  Principal. **Bundled code fix:** `rejectRequest` had NO `new_fund_source` branch — rejecting a
  fund-source approval left the fund_sources row stuck `pending_approval` forever. Now cancels it
  (mirrors the `new_loan` branch) + reject revalidates `/fund-in` too (`approvals/actions.ts`).
- Other Debtor (3071) outstanding is **RM 378.73** after recording the RM 162.21 receipt for
  I-000058 (Office Rental May'26) into Hong Leong — `JE-202607-0224`, segment `corporate`.
- Banks: Hong Leong `3000` (primary), Alliance `3010`.

---

# (Previous checkpoint) HOUZS Venture Portal — Session Handoff (checkpoint 2026-06-19 · merge)

> 2026-06-19: branch `feat/hr-simplify-direct-submit` merged on top of the 2026-06-11 main state.
> The HR-simplification session log (2026-06-04) is preserved immediately below, followed by
> the full 2026-06-11 main handoff.

## Merged-in session (2026-06-04): HR simplification — no HR-side approval

Branch `feat/hr-simplify-direct-submit` (7 phases, migs 278-282 ALL APPLIED TO LIVE DB).
User decisions: director fully decoupled from staff payroll_run / billing OPEX cards are
the per-dept salary surface / GL split at payment time (cash basis).

1. **HR submit → straight to Finance (mig 278).** `submit_payroll_to_principal`
   (name kept) now lands the run in `status='approved'+approved_at` directly — NO
   approval_requests row, no director gate, `director_salary_total=0`. New
   `reopen_payroll_run` RPC + ReopenPayrollButton (run→'rejected' with marker reason
   `Reopened by HR for edits`, rows→draft; blocked once a payment request is in flight).
   All period-keyed payroll_runs reads now `.neq('status','rejected')` (fixes latent
   multi-row maybeSingle bug). Dashboard HR cycle 9→8 steps. BillingView
   `payrollApproved`→`payrollSubmitted`. Principal money-side PV approvals UNCHANGED.
2. **Director Payroll Submission (mig 279).** New aggregate-only table
   `director_salary_submissions` (totals + per-subsidiary `by_company` JSONB from
   director_ctc; Finance-safe, no per-director). RPCs `submit_director_salary_to_finance`
   (draft→confirmed + snapshot; absorbs old confirmPayouts) + `reopen_director_salary`.
   /director-salary now tabbed: Calculation | Director Payroll Submission. BillingView
   Director OPEX card reads the submission (legacy run fallback) + new per-subsidiary
   section for Finance.
3. **Designation (mig 280).** `hr_staff_costs.designation` — InfoTech Employee List
   import now stores it (parser always read col 4); staff forms/list/detail updated.
4. **Staff PCB editable** on payslip (added to `updateStaffStatutory` whitelist).
5. **Fully Paid mode (mig 281).** `director_payouts.payout_mode` ('split'|'fully_paid').
   fully_paid: only 5% saving deducted, 95% (post advance-offset) paid as ONE payroll,
   B+K with statutory / Allowance without, invoice side zeroed. Engine param in
   salary.ts + PayoutModeSwitch on Calculation tab + 5 regression tests.
   **BUG FIX bundled:** recalc used to duplicate invoice_payout_pool accumulate rows —
   rows now carry `period_month` + delete-before-reinsert (openings with NULL period safe).
6. **Per-dept salary GL (mig 282).** payroll_bank_transfer PV approval posts one JE per
   source dept pool (segment via new `pool_key_to_segment`); `derive_journal_segment`
   resolves Stage-G payout PVs to the staff's department segment.

⚠️ Flagged, NOT fixed (needs user decision):
- Stage-G disbursement PVs are voucher_type='other' → Dr 9000 G&A, while Stage-E already
  books Dr 9030 gross+ER — possible GL expense double-count when both stages run. Verify
  before the first full payment cycle under the new flow.
- mig 122 grants Finance own-dept INDIVIDUAL-row SELECT on hr_monthly_payroll +
  hr_staff_costs — conflicts with "Finance sees aggregates only" rule. Tighten when convenient.
- /approvals/payroll-run/[id] page + approve/reject actions kept as read-only legacy
  (no new 'submitted' runs can exist).
---

# Main handoff (checkpoint 2026-06-11)

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
  and bank. **User confirmed (2026-06-11): the 1,400 is genuine interest
  income.** App-side repayments row added by direct SQL (interest, 2026-04-29,
  parked on LO#19 per the CONTS-APR28K reallocatable convention, notes
  reference OR-000027). The 5,000 principal leg was NOT added — April CONTS
  receipts were already bundled into the 28,000 CONTS-APR28K row; a separate
  row would double-count. CONTS outstanding unchanged at 617,200 ✓. Remaining
  app-vs-GL-7000 delta is now exactly the deferred FY2025 backfill 30,216.71.
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

### Red-flag sweep CLOSED (2026-06-12, user 开工; migs 20260612010000–050000)
All six audit red flags fixed in one run (see docs/FLOWS.md "Known gaps" for the
condensed list and what remains):
1. **PV-path loan repayments → venture_pool** `loan_repayment_in` (principal
   portion), in all three approve RPCs.
2. **JV bank-cache auto-sync** (mig 20260612020000): `jv_apply_bank_cache`
   helper; create applies, update reverses-then-applies, delete reverses.
   Smoke-tested in a rolled-back tx (+100 → restore ✓). JVs also carry a
   segment since mig 20260612000000.
3. **Dept requests**: approve RPCs skip the pool debit for
   `reference_type='dept_payment_request'` (reserved at stage-1 — was a
   double debit); stage-3 was BROKEN end-to-end (generate RPC wrote no PVS
   row → approve always raised; PV was 'draft' while its approval was
   pending; voucher_type='expense' would have re-recognised the expense via
   the per-segment branch) — generate_pv_for_dept_request rewritten (PVS row
   acct 4050, status pending_approval, dept_pool key underscore fix), approve
   RPCs exclude dept_payment_request from the per-segment branch (falls to
   forced Dr 4050 AP-clearing); NEW cancel_dept_payment_request refunds the
   stage-1 reservation (dept_pools 'void_in' + reversing accrual JE, voids a
   pending PV) with a Cancel button on /payments/dept-requests; NEW
   dept_request_pv_rejected returns the request to pending_finance_pv on PV
   rejection (wired in rejectRequest).
4. **Loan disbursement bank**: new-loan form has a Pay-from-bank picker →
   create_loan_with_approval(p_bank_account_id) (old 10-arg dropped);
   approveRequestGroup checks/debits the PV's bank via bump_bank_balance and
   credits its GL code (was primary-only, read-modify-write).
5. **Benefit claims** now draft the same claim_payout PV as project claims
   (pool = claim.source_pool, acct 9000); claim PVs default bank to primary
   (a debit PV approved with NO bank posted GL Cr 3000 without a cache
   debit); claim-side inserts fail loud.
6. **Cancel executors** (mig 20260612050000): execute_loan_cancel re-pointed
   to current COA (Cr = 305x leaf resolved from the disbursement JE, fallback
   PVS account, else loud; refunds the DISBURSING bank, GL fallback 3000 —
   was '1010'/'1020'); NEW execute_fund_source_cancel (blocks on repayments,
   refuses dept_pool-type sources, venture_pool fund_out reversal, primary
   bank − with sufficiency check, JE Dr 4xxx leaf / Cr bank, status
   cancelled) wired into approveRequest's tier_change-on-fund_sources branch.
7. **Batch approve RPCs fully aligned with single** (mig 20260612010000 full
   rewrites): interest→penalty→principal order, per-segment GL branch,
   internal_transfer pool skip, payment-date GL dating, per-voucher period
   check, venture_pool repayment inflow, dept_payment_request skip.

### COA admin upgrades (2026-06-12)
Settings > Chart of Accounts: tree rows (name indented + own code column,
click parent row to expand/collapse), drag-and-drop reparenting (DB triggers
enforce type/cycle/posted-parent), and CODE RENAME with full history
migration via rename_account_code RPC (mig 20260612070000 — clones the COA
row, re-points journal_lines / PVS(+overrides) / bank gl links /
fund_sources / children / invoice+credit-note+dept-request+statement
category codes, deletes the old row; validates 4 digits + same type range).
updateAccount accepts new_code and surfaces per-table re-point counts.
Manual JVs also gained segment (mig ...000000), bank-cache sync (...020000)
and dept-pool sync for dept-segment JVs with bank movement (...060000,
jv_in/jv_out txn types; pool rule: pool == per-segment net bank movement).

### FY2025 interest 30,216.71 — CLOSED, no action ever needed (user 2026-06-12)
The 36 backfilled interest rows on LO#5/#7/#19 (The Cont, 2025-01 → 2026-03,
totalling 30,216.71) were collected by a DIFFERENT company — the debt was only
transferred to HV recently. So HV GL correctly has NO 7000 income for those
periods; the system-side repayment rows exist purely to track installment
progress (已还期数). Do NOT post a catch-up JV. The app-vs-GL-7000 "delta" of
30,216.71 is by design, permanently. (Supersedes the earlier "deferred" note.)

### AR 12,647.54 decomposed and resolved (2026-06-12, direct SQL)
Exact composition: +12,588.80 (HV-OR-202606-0005, HC "3D Design Fee Return"
hardcode-credited 3030; user: returns 2990 on-behalf money → reclass Dr 3030 /
Cr 3054 — 3054 now EXACTLY 155,000 = the loans) +150.00 (OR-202606-0032,
CONTS interest via HV to LWS, hardcode-credited 3030 → reclass Dr 3030 /
Cr 7000 + app interest row on LO#16) −91.26 (books invoice I-000078,
"MARKETING NOTION 1/3 of 273.78" 2026-05-15, Dr 3030 / Cr 9087 — MISSED by
the one-time opening import; verified absent from invoices and statement
lines). After reclasses: GL 3030 19,960.72 vs open non-dept invoices
19,869.46 — residual is exactly the 91.26. RESOLVED (user ruling, same
day): I-000078 is DREAM CRAFTER's debt and no invoice is to be created —
reclass JV Dr 3059 / Cr 3030 91.26 moved it onto DC's leaf, and the [LO-DC]
TB-backfill advance was bumped 2,904 → 2,995.26 so app=GL ties. Final state:
GL 3030 19,869.46 == open non-dept invoices 19,869.46 (gap ZERO); 3059
2,995.26 == DC app outstanding; TB 0.00. NO historical reconciliation items
remain open — every audit finding is now fixed or closed by user ruling.

### Interest income → Revenue (user 2026-06-15, direct SQL)
User wants interest income in Revenue and interest expense in Cost.
- Interest Expense - Fund Sources (6000) was ALREADY type=cost ✅ no change.
- Interest Income - Loans reclassed 7000 (other_income) → 5027 (revenue) via
  change_account_type RPC; 13 lines (RM 19,520) re-pointed, TB still 0.00.
  App ref updated: fund-out/actions.ts recordRepayment credits 5027 for
  interest/netting (was 7000). A DB trigger coa_enforce_code_range forces the
  code into the type range, so the code HAD to move to 5xxx (can't keep 7000).
- ⚠️ LESSON: RAISE-to-rollback smoke tests via Supabase MCP execute_sql do NOT
  reliably roll back — an earlier change_account_type(7000→revenue) "smoke"
  PERSISTED (found 7000 empty / 5027 holding the lines during the 2026-06-15
  accounting review). It was first restored to 7000/other_income, then
  intentionally moved to 5027/revenue per the user. Full-DB sweep confirmed no
  OTHER smoke artifacts leaked (no JE-SMOKE, no SMOKE vouchers, 9030 intact).
  Going forward: do NOT rely on in-block RAISE to undo test writes here.
- Penalty Income (7010) left in other_income — user only specified interest.
- Interest is recorded CASH-basis (income/expense only on receipt/payment); no
  monthly accrual JE for the 21 active loans / 15 deposits (3040 Interest
  Receivable = 0). Accrual feature discussed, pending user go-ahead +
  traceability design.

### Counterparty rulings applied (2026-06-12, direct SQL)
- LWS 450 + LWL 300: user ruled the opening books had knocked these off the
  PRINCIPAL payables but they were INTEREST. Reclass JE (manual_jv, treasury):
  Dr 9010 Interest Expense 750 / Cr 4054 450 / Cr 4055 300. App=GL=131,500 and
  57,200 now tie exactly.
- CMK 6,936: user ruled the repayment IS recorded on CMK side — system was
  missing it. fund_source_repayments principal row 6,936 added (notes flag the
  ruling); app=GL=42,064 ties. No GL/bank change (cash already in openings).
- Remaining counterparty item: AR 3030 (GL 7,221.92) vs open non-dept invoices
  19,869.46 — gap 12,647.54: receipts historically credited 3030 without being
  tied to specific invoices; needs per-invoice paid/unpaid confirmation.

### Still open (awaiting user verification with counterparties)
- 4054 LWS 450 · 4055 LWL 300 · 4056 CMK 6,936 · AR 3030 vs open invoices 12,647.54.
- Remaining code items: DEPT_POOL_GL map collides with post-238 codes (dept_pool
  fund-source JEs); count-based voucher numbering. See docs/FLOWS.md.

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
