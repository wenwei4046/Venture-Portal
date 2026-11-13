# Interest in suspense, one account per deal — design (2026-11-13)

The user's method (memory `iis-method-decided`, confirmed 2026-10-26 / 11-03 / 11-04 / 11-13; catch-up preview
`previews/iis-catchup-preview.html` confirmed 2026-11-13: "改损益的地方没有问题", "感觉是对的"; "直接做完 … 做完就merge").

## The method

- Every live deal has its own account under its counterparty account (four-digit codes — the chart takes numeric
  codes only, in the type's range): a loan's under `305x Amount due from - <co>` (in suspense 3100-3399, 0% / back-to-back
  3400-3499), a fund source's under its `40xx Amount Due to - <party>` (in suspense 4300-4599, not 4600-4699).
  Interest-bearing deals also get an IIS account under the counterparty's interest-in-suspense account (loans 3500-3899,
  fund sources 4700-4999; new IIS counterparty accounts 3066 for CMI, 4065-4067 for The Cont / Chai Meng Keat / Loo Wen Wei).
  The accounts are made parked (no parent) for the catch-up. The chart refuses a sub-account under an account with
  postings, and every counterparty account has history, so after the catch-up each deal account sits BESIDE its
  counterparty under the same group (3020 / 4100 / 4200) and each IIS account under 3060 / 4060 (mig 20261113150000;
  go-live 2026-11-13: 44 deals, 3063's 750.13 to 5027, 4062 and 4052 untouched).
- The deal's account holds principal + interest put in suspense; every receipt / payment (principal AND interest) is
  taken off it whole. Penalty stays straight to income (7010 / 9096), as today.
- Interest into suspense ("accrual"): a fixed, non-compounding terms segment puts all of its interest in at its start
  (a later change takes out the old terms' months not yet due); a compounding or no-fixed-term segment puts each month's
  interest in when it falls due. Loan: Dr deal / Cr IIS. Fund source: Dr IIS / Cr deal.
- Interest leaves suspense only as received / paid ("recognition", cash basis — the user 2026-11-04 "暂时就根据收到的钱才当
  income"): loan Dr IIS / Cr 5027; fund source Dr 6000 / Cr IIS. A payment the schedule sets against the oldest
  interest first (a no-fixed-term 利滚利 deal, #783) counts as interest (the user 2026-11-13, LO#30).
- Not in suspense: LO#19 / BI#19 (back-to-back, kept off P&L), and 0% deals (deal account only).
- Repaid / cancelled deals are not recalculated.

## The opening balance is never touched (the user 2026-11-13: "不想弄乱")

The books begin with the opening JVs of 2026-03-28 / 29. A deal that began before 2026-03-31 is caught up from
2026-03-31: one opening-transfer JV (principal owed then from the counterparty account into the deal account; interest
put in by then less received then into IIS), then month by month. Later deals from their own start. Every catch-up
entry is a NEW journal entry (`reference_type` `iis_catchup`); no existing entry is edited.

## What changes

1. **Data** (migration): `loans.gl_account_code`, `loans.iis_account_code`, `fund_sources.iis_account_code`
   (a fund source's deal account is its existing `account_code`); `iis_postings` (deal, month, kind accrual |
   recognition | opening, amount, journal entry) — what was put into / taken out of suspense, so the month-end run
   posts only the difference; `iis_settings.live_from` (null until go-live).
2. **`ensure_deal_accounts(kind, id)`** (definer): after go-live, gives a new deal its account (next `<counterparty>-NN`)
   and, if it bears interest, its IIS account; sets the columns.
3. **Posting, once a deal has its account:**
   - loan disbursement (approvals) and a loan repayment (Fund OUT): `resolveLoansReceivableLeaf` answers the deal's
     account; a repayment's interest / netting credits the deal's account instead of 5027 when the deal is in suspense;
   - a fund source's repayment voucher rows: the interest row takes the deal's account instead of 6000 when in suspense;
   - a fund contra: the loan side and interest lines use the deals' accounts the same way;
   - a fund source / loan created after go-live gets its accounts before its first entry.
4. **Month-end interest** (Fund OUT and Fund IN, Treasury · Approve): pick the month; the page lists each deal's
   interest into suspense and interest received / paid for it, worked out from the deal's schedule
   (`lib/iis` — the same rules as the catch-up), less what `iis_postings` already holds; *Post* writes one entry per
   deal (`reference_type` `iis_month`). Run again, it posts nothing new.
5. **Go-live** (once, after the merge): create the accounts (not yet under their counterparty), post the catch-up
   (the preview's entries, dry-run deal by deal), move the accounts under their counterparty, set `live_from`.

## Not in this change

Early settlement (later, the user), linking loans to their fund in (declined), a receipt picking the deal account
(the receipt form's own picker lists leaves).

## Month-end run

Fund OUT / Fund IN head: *Month-end interest* (Treasury · Approve). Pick this month or one of the two before, see each
deal's entry (into suspense, out to P&L), Post. Only what is new is posted (iis_postings keeps what each deal has put in
and taken out), so a month run twice adds nothing; a month before a deal's latest accrual puts nothing more in.
