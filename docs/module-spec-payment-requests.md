# Module spec — Payment requests (2026-10-29)

Staff claims and direct-pay requests from every department, a department head's approval where one is ticked, and
Finance turning them into payment vouchers — with HR's payroll funding requests and the Revenue members' benefit
claims in the same Finance list. The agreed design is the mockup `OneDrive\Desktop\Claude\Venture\mockups\claims-flow-mockup.html`
(nine rounds with the user, 2026-10-29, "设计可以定了"); then "功能大多数都对了，记得样板和风格沿用现在系统的样板和风格。确定了就可以开始做了".
The mockup is the behaviour, not the look: every screen is built from the portal's own kit (Payments hub, `FinTable`,
`FinDialog`, `CreatePaymentDialog`, each view's shell), and its words are English.

## 1. What the user decided (2026-10-29)

| Question | Answer |
|---|---|
| Who submits | Every department: Marketing, HR, Finance, IT, Director Office ("也是要做"). Revenue members keep their own flow (Revenue app › Requests → HR's Member Services → Finance — "remain 经过hr审批，然后给finance"). |
| Who approves first | A tick on the person's (or title's) permissions, **By management approve**: ticked → the department's **Claim & approve** holders approve first; unticked → straight to Finance ("像sean, 如果我没勾 by management approve 就直接submit to finance"). Today: Marketing staff ticked; Marketing Manager / Assistant Manager hold Claim & approve (their own go straight to Finance); HR, Finance, IT, Director Office unticked ("直接到finance 先，如果往后有manager 可能也会经过审批"). One approver is enough; an approver may reject. |
| Wording | Staff see **Claim**; manager level **Claim & approve** ("manager level的wording可以是claim & approve"). All portal text English. |
| What a request holds | Items (what + amount, several per request), receipts/invoices (required), who to pay, which pool pays. |
| Who to pay | **I paid — pay me back** (a claim: the staff member's salary account from HR's records, another account allowed) or **Pay a supplier directly** (direct pay: the supplier's name, bank, account) — "要分的出来是claim". |
| Supplier's account | Read automatically from the attached supplier invoice, then checked by the staff member ("pay a supplier directly 可以根据attachment自动读取account number?" — yes). A supplier paid before keeps its saved account; Finance is told when an invoice shows a different one. |
| Which pool | Default the requester's department; **Split it** with other departments and/or companies, the amounts typed by the requester ("由他们来填"). |
| Bill back | Finance decides per split ("finance 有权利拒绝，同时也要自持要不要bill back"). Yes → the system drafts the invoice (to the company, or to the department) and keeps it a **DRAFT** in Invoice until Finance checks and issues it ("但都是draft 的状态？然后我检查了没有问题才开？"). No → the requester's department pays all of it. |
| Finance rejects | The requester fixes it and submits again; a Revenue claim goes back to HR ("finance 拒绝后可以再交过，revenue 的finance 会退回给hr"). |
| Who sees what | A requester only their own requests; a Claim & approve holder their department's; Finance all — tabs **All · Payroll · each department** ("每个人只能看到自己的request。manager 有权利看到自己department 的request"). |
| Finance's sidebar | Payments › **Payment voucher** (today's Payments page, unchanged but for its head buttons Dept / Claims / Payroll, which go) and Payments › **Payment request** ("pv 改成payment voucher"). |
| Payroll | HR's funding requests move into Payment request as a **Payroll** tab, worked as today (Generate PV in rounds, send back to HR); only Payroll payouts holders see it ("payroll 也移过去吧，当做一个request"). Billing the subsidiaries for payroll stays in Invoice › Payroll ▾ › Generate payroll invoices. |
| Making the PV | Right-click a row → **Create PV** opens today's Create payment window filled in from the request — payee, account as a hint, description, lines with pool and amount, attachments carried over, notes; Finance picks the category; the PV looks like any other ("generate 的pv 是和我原本普通开pv 的样子一样"). |
| Several at once | Tick rows → **Create PV** / **Reject** at the right of the bar above the list ("按钮换去上面", "做在格子的靠右，字眼改成 Create PV 和 Reject"); one PV a payee; submitted together they reach the Principal as one batch. Managers likewise **Approve** / **Reject**. |
| One person's requests | Requests of the same payee with no PV yet go into ONE PV automatically, until FINANCE creates the PV — the Principal's approval does not count ("自动合成认的是我有没有开pv 哦，而不是principal approve"). |
| New request | A pop-out window, not a form on the page ("他们的new request 要pop out 哦"). |
| The list | The same table as Payment voucher: resize, move, Columns, sort, filter, everyone's default ("沿用我的header 的function"). |

## 2. Build order

Each row is one PR — branch → PR → CI → the user's word to merge; a migration goes to production first (dry run
with ROLLBACK, then COMMIT + its `schema_migrations` row), as every PR here.

| PR | Contents | Status |
|---|---|---|
| ① | **Finance › Payment request with what exists today.** Finance's sidebar: Payments › *Payment voucher* (today's `/payments`, retitled) and › *Payment request* (`/payments/requests`, new). The new page lists HR's payroll funding requests (tab *Payroll*, Payroll payouts holders only) and the Revenue members' benefit claims HR approved for payment, in the Payments hub's kit (HubHead, HubCards, `FinTable` with its column tools, `RowMenu`, a drawer). Each row worked as today — payroll: Generate PV (rounds), Send back to HR; member claim: Create PV (`claim_create_payment_voucher`) — plus the new **Return to HR** for a member claim. Payment voucher loses its Dept / Claims / Payroll head buttons. | |
| ② | **Staff requests, end to end without approval.** The tables, the private bucket, the readers and writers (§3); the staff page `/claims` rebuilt as *Claim* — the requester's own requests and the *New request* window (claim or direct pay, items, receipts, pay-to from HR's record, split with departments / companies); the rows on Payment request; Create PV = today's Create payment window filled in (lines, payee, account hint, notes, files carried over, one person's open requests combined); Reject → fixed and sent again; Bill back Yes/No → a draft invoice in Invoice; the PV followed (paid → paid, voided → back to Finance). | |
| ③ | **By management approve and Claim & approve.** The tick on a title's template and a person (person wins); the department head's *Claim & approve* (their department's requests, Approve / Reject, several at once); routing at submit; the portal's notices to approvers and requesters. | |
| ④ | **Several at once for Finance.** Select on Payment request → Create PV (one PV a payee, combined, a bill-back answer each, Save drafts / Submit — one approval group for the Principal) and Reject. | |
| ⑤ | **Supplier invoices read for the requester.** Direct pay: the supplier's invoice read by the model (name, bank, account), checked by the requester; saved supplier accounts; Finance told when an invoice shows a different account. | |
| ⑥ | **The rest.** The Finance phone app's Payments bar and request pages on the new list; the old `/payments/claim-requests`, `/payments/dept-requests`, `/payments/payroll-requests` and the pool-claims code retired; `dept_payment_requests` left read-only. | |

## 3. The data (PR ②)

Tables with RLS on and **no policy, no client grants** — every read and write a SECURITY DEFINER function asking
`has_any_action` (Marketing's and Attendance's pattern), each in `DEFINER_RPCS`, the readers in
`READS_WHILE_VIEWING_AS`, every table `audit_register`ed.

- `payment_requests` — `request_no` (`PRQ-YYMM-NNNN`, minted in SQL under an advisory lock), `requester_id`,
  `department_id` (the requester's at submit), `kind` (`claim` | `direct_pay`), `payee_name`, `pay_to_salary_account`
  (a claim paid into HR's account 1), `payee_bank`, `payee_account_no` (**private**: read through the definer reader —
  whole for the requester and for a reader with the `bank` tick, else the last four), `description`, `total` (sum of
  items, kept by trigger), `needs_approval`, `status` (`draft` · `pending_approval` · `with_finance` · `rejected` ·
  `in_pv` · `paid` · `cancelled`), `rejected_stage` / `rejected_by` / `rejected_at` / `reject_reason`, `approved_by` /
  `approved_at`, `submitted_at`, `pv_id` → `payment_vouchers` (`ON DELETE SET NULL`).
- `payment_request_items` — `request_id`, `description`, `amount` (> 0), `sort`.
- `payment_request_shares` — `request_id`, `party` (`department` | `company`), `department_id` / `company_id`,
  `amount` (> 0, together < total), `bill_back` (NULL until Finance decides), `invoice_id` → `invoices`
  (`ON DELETE SET NULL`; a voided invoice counts as none, as `mkt_bills`).
- `payment_request_files` — `request_id`, `kind` (`receipt` | `supplier_invoice`), name / type / size, `storage_path`
  in the new private R2 bucket **`payment-request-files`** (`file_buckets` row + `file_objects` policies: the
  requester's own folder; read by the requester, the department's approvers, Finance and the Principal — "principal
  也要能看到哦").
- PV link: `pv_id` on each request (one PV may pay several); a trigger on `payment_vouchers` — paid → `paid`, voided →
  back to `with_finance` with `pv_id` cleared (as `trg_dpr_complete_on_pv_paid` / `claims_follow_their_voucher`).
- Function key: the existing **`claims`** (View / Create / Edit / Approve / Void, reach own · dept · all). Tabs: the
  Department view's and Marketing's `my_claims` relabelled **Claim** (route `/claims`); a *Claim* row in HR's and
  Finance's sidebars on the same tab; *Claim & approve* (PR ③) a tab of its own at reach `dept`.
- Bill back (Finance's session, at Create PV): `createMultiLineInvoice` — a company: `billable_to_type 'subsidiary'`;
  a department: `'dept_pool'` + `billable_to_department_id`; both `billing_mode` = the requester's department's mode
  (its pool gets the money back on settlement), lines without `segment`, category = the PV line's expense account
  (the house's contra-expense precedent, e.g. Notion's third → Cr 9087). Status stays **draft**.

## 4. PR ① — tasks

Files: `src/components/layout/fin-nav.ts` (+ `ViewSidebar` child rows), `src/lib/page-tabs.ts`,
`src/lib/finance-view.ts`, `src/app/(portal)/payments/requests/` (`page.tsx`, `loading.tsx`, `_lib/requests-read.ts`,
`_lib/requests-model.ts`, `_components/RequestsHub.tsx`, `_components/RequestDrawer.tsx`, `actions.ts`),
`src/app/(portal)/payments/_components/VoucherHub.tsx`, one migration (`permission_page_tabs` row for the new page;
`finance_return_member_claim`).

1. **Sidebar.** `finNavSections`: *Payments* with children *Payment voucher* `/payments` and *Payment request*
   `/payments/requests` (`canAccessTreasury`); `ViewSidebar` draws an item's `children` indented under it; the phone
   app flattens them. Tests: `fin-nav.test.ts` (the two child rows; `/payments/requests` lights Payment request only),
   `permission-tabs-coverage.test.ts` green.
2. **Route registry.** `PAGE_TABS['/payments/requests'] = PAYMENTS`; `DETAIL_ROOTS['/payments']` gains `requests`
   (else the path reads as a voucher id); the migration adds `('/payments/requests','fin.payments')` to
   `permission_page_tabs`. Tests: `page-tabs.test.ts`, `finance-view.test.ts`.
3. **Read model.** `readPaymentRequests(user): Promise<{ rows: RequestRow[]; banks: BankOption[] }>` —
   `RequestRow { key; source: 'payroll' | 'member_claim'; sent; fromName; department; what; sub; payTo; whoPays;
   amount; status }`; payroll rows from `readPayrollRequests` only when `canSeePayrollPayouts(user)`, member claims
   from `claim_payment_queue`. Pure `requestTabs(rows)` → `{ key: 'all' | 'payroll' | <department>; label; count }[]`
   and `requestCards(rows)`. Tests on the model (counts per tab; no Payroll tab without Payroll payouts).
4. **Page.** `requirePage('/payments/requests')` → `requirePermission('treasury')` → hub: `HubHead` (eyebrow
   *Daily · Payments*, title *Payment request*), `HubCards`, the tabs, `FinTable layoutId="fin.payment_requests"`
   (`canSetDefault` as Payments), `onRowClick` → drawer, `onRowContextMenu` → `RowMenu` (Open · Create PV / Generate
   PV · Return to HR… / Send back to HR… · Open in new tab). `loading.tsx` → `RouteSkeleton`. Test: a render test
   (rows, tabs, the menu items per source).
5. **Drawer.** Payroll: today's `GeneratePvForm` + `SendBackButton` (the props `/payments/payroll-requests` gives
   them). Member claim: the claim's facts, its invoice through a new treasury-gated reader, `RaiseClaimVoucherForm`,
   and *Return to HR…* (reason required). A member claim reaches Finance only after HR approved it for payment
   ("确定revenue 的是经过hr 的哦"): the reader opens the invoice of an approved, payment-route claim only.
6. **Return to HR.** Migration: `finance_return_member_claim(p_claim uuid, p_reason text)` DEFINER — asks
   `has_any_action(ARRAY['treasury.void','treasury.approve'])` + `tab_write_guard`; refuses unless benefit · approved ·
   route payment · no live voucher; claim → `pending` (route, approver and month cleared), request → `submitted` with
   the note "Returned by Finance: <reason>", HR notified. Server action `returnMemberClaim(id, reason)` gated
   `requireActionOn('/payments/requests','treasury','void')`. SQL validator in `tests/member-sql/` (the four refusals,
   the happy path).
7. **Payment voucher.** `VoucherHub`'s non-receipt head keeps *Create payment* and *Export ▾*; the hub's title
   *Payment voucher*. `PaymentsHubClient.test.tsx` updated.

Later PRs are detailed here when they start.

## 5. Review focus

- A Revenue claim returned to HR while a draft PV for it exists → refused (no live voucher).
- The Payroll tab and its counts for an account without Payroll payouts → absent, and the All count without them.
- `/payments/requests` read as a voucher id by the Finance view's detail rules → a broken page; pinned in task 2.
- Two payroll rounds generated at once from two tabs → today's outstanding check still answers (no new path).
- A member claim's invoice opened by Finance → only through the treasury-gated reader, never the member's bucket policy.
