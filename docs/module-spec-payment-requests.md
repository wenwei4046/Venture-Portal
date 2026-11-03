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
| Bill back | Finance decides per split, in the Create PV window as the PV is made ("finance 有权利拒绝，同时也要自持要不要bill back"; "我开pv 时就要确定是不是要开单了"). Yes → the system drafts the invoice (to the company, or to the department) and keeps it a **DRAFT** in Invoice until Finance checks and issues it ("但都是draft 的状态？然后我检查了没有问题才开？"). No → the requester's department pays all of it. |
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
| ① | **Finance › Payment request with what exists today.** Finance's sidebar: Payments › *Payment voucher* (today's `/payments`, retitled) and › *Payment request* (`/payments/requests`, new). The new page lists HR's payroll funding requests (tab *Payroll*, Payroll payouts holders only) and the Revenue members' benefit claims HR approved for payment, in the Payments hub's kit (HubHead, HubCards, `FinTable` with its column tools, `RowMenu`, a drawer). Each row worked as today — payroll: Generate PV (rounds), Send back to HR; member claim: Create PV (`claim_create_payment_voucher`) — plus the new **Return to HR** for a member claim. Payment voucher loses its Dept / Claims / Payroll head buttons. | Built 2026-10-29 (branch `feat/payment-requests`) |
| ② | **Staff requests, end to end without approval.** The tables, the private bucket, the readers and writers (§3); the staff page `/claims` rebuilt as *Claim* — the requester's own requests and the *New request* window (claim or direct pay, items, receipts, pay-to from HR's record, split with departments / companies); the rows on Payment request; Create PV = today's Create payment window filled in (lines, payee, account hint, notes, files carried over, one person's open requests combined); Reject → fixed and sent again; Bill back Yes/No → a draft invoice in Invoice; the PV followed (paid → paid, voided → back to Finance). | Built 2026-10-29 (branch `feat/payment-requests-staff`) |
| ③ | **By management approve and Claim & approve.** The tick on a title's template and a person (person wins); the department head's *Claim & approve* (their department's requests, Approve / Reject, several at once); routing at submit; the portal's notices to approvers and requesters. | Built 2026-10-29 (branch `feat/payment-requests-approval`) |
| ④ | **Several at once for Finance.** Select on Payment request → Create PV (one PV a payee, combined, a bill-back answer each, Save drafts / Submit — one approval group for the Principal) and Reject. | Built 2026-10-29 (branch `feat/payment-requests-bulk`) |
| ⑤ | **Supplier invoices read for the requester.** Direct pay: the supplier's invoice read by the model (name, bank, account), checked by the requester; saved supplier accounts; Finance told when an invoice shows a different account. | |
| ⑥ | **The rest.** The Finance phone app's Payments bar and request pages on the new list; the old `/payments/claim-requests`, `/payments/dept-requests`, `/payments/payroll-requests` and the pool-claims code retired; `dept_payment_requests` left read-only. | Built 2026-10-29 (branch `feat/payment-requests-rest`) |

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

**As built (2026-10-29).**

- *The tabs are the hub's cards.* Payment voucher filters its list by its cards, so Payment request does too: the
  total (*Waiting for you*), then *All requests*, *Payroll* (Payroll payouts only) and one card per department from
  the registry (all but Venture Office and Director; a new department appears by itself; a claim of no known
  department under *Other*), each with its count and sum, `?card=` kept in the URL.
- *Columns:* Sent · From · What · Pay to · Who pays · Status · Amount on show, Department and Ref # in Columns
  (`layoutId` `fin.payment_requests`).
- *Return to HR* asks Treasury · Void or Approve (as Send back to HR on a payroll) — Finance · Maker cannot. The
  reason never reaches the member (the mockup: "HR sees it (not LUCAS)"): it is the note of the request's history
  step HR's Member services shows and the body of HR's notice ("Claim returned by Finance · NAME"); the member's
  history (`member_request_history`) shows the step as *Back with HR for review* without it, and the request's own
  note is cleared.
- The phone app's request sheets (Fund, Send back, Raise) now live in `payments/requests/_components/RequestSheets`,
  shared by both; the desktop's says *Create PV*.

## 4b. PR ② — tasks (2026-10-29, the user: "可以，开始做 PR ②")

Since PR ①: no Anthropic key and no reading of invoices for now — a direct pay's supplier name, bank and account are
typed by the requester ("不要开key 先，这个功能就不active 先，暂时就让他们填。如果不是claim 给自己的话"; PR ⑤ shelved).
Notices (to Finance on a submit, to the requester on a reject) wait for PR ③, which adds every notice of the flow:
the bells' kinds and taps are one change. The Claim page shows a rejected request with its reason meanwhile.

1. **Migration** `…_payment_requests.sql` (§3's tables, RLS on, no policy, no client grants; each `audit_register`ed —
   the account columns masked as bank):
   - `payment-request-files` bucket — R2 from the start, private, 25 MB a file; `file_objects` policies: INSERT into
     one's own folder `<uid>/…`; SELECT through `payment_request_object_readable` (one's own upload; a file of one's own
     request; any filed file of a submitted request for Treasury — Finance and the Principal); DELETE one's own unfiled
     upload. The helpers are granted to `authenticated` (a policy runs as the reader).
   - Request numbers `PRQ-YYMM-NNNN` minted at the first submit under `pg_advisory_xact_lock`.
   - Readers: `payment_request_context()` (the New request window: who, department and its pool, the salary account
     from HR's record as bank + last four, the departments and companies a share may name); `my_payment_requests()`;
     `payment_requests_for_finance()` (Treasury: submitted, in a PV); `payment_request_file(file)` (the path to sign).
   - Writers: `payment_request_save(id, data, submit)` (a draft or a rejected request of one's own: kind, pay-to,
     items, shares, files; Submit checks it whole — items, a receipt, the pay-to, shares under the total — then takes a
     number, snapshots the salary account and goes to Finance); `payment_request_cancel(id)`;
     `payment_request_reject(id, reason)` (Treasury · Void or Approve, as Return to HR); `payment_requests_for_pv(ids)`
     (Treasury · Create — what a Create PV needs: the same payee into one account, the files to carry);
     `payment_requests_attach_pv(ids, pv, bill)` (each split's Bill back? as answered in the window; a Yes drafts its
     invoice in the same step).
   - The PV followed (`payment_vouchers`, as `claims_follow_their_voucher`): paid → `paid`; voided → back to
     `with_finance`, `pv_id` cleared; a draft deleted → the same.
   - Who may: `claims.create:own` sends one's own (the staff templates hold it already); Treasury reads and works them.
2. **The Claim page** (`/claims`, rebuilt; the pool-claims code stays until PR ⑥): Payment voucher's hub — *Claim*,
   "Only your own requests — claims and direct payments.", **+ New request**; cards All · Draft · With Finance ·
   Rejected · Paid; the table Date · What · Amount · Where it is; a drawer (items, receipts, pay to, who pays, the
   reason when rejected) with *Edit* / *Submit* / *Cancel request*.
3. **New request** — a pop-out window (`FinDialog`), the mockup's three parts, nothing chosen until picked: *What is it?*
   (I paid — pay me back: HR's salary account, or another this time · Pay a supplier directly: the supplier's name,
   bank and account, typed); *What was it for?* (items, + Add another item, the total; receipts or invoices, required —
   uploaded from the browser into the bucket); *Which pool pays?* (the department's, or Split it: a company or a
   department, which, the amount; the department pays the rest). *Submit* · *Save as draft* · *Cancel*.
4. **The rows in every staff view:** Department view's *Claims* and Marketing's *My claims* say **Claim**; HR's view
   gets *Claim* (Admin, beside the rooms) and Finance's account menu *Claim* (beside Meeting Rooms) — each view's own tab
   (`hr.my_claims`, `fin.my_claims`, shared with `dept.my_claims` / `mkt.my_claims` as Meeting Rooms' are); HR · Payroll's
   stored ticks gain HR's.
5. **Finance's side** (Payment request): the requests under their department's card; the drawer — items, receipts
   (open), pay to (whole account with the bank tick, else the last four), who pays and where each split's Bill back
   stands; **Reject…** (a reason the requester reads); **Create PV** — today's Create payment window filled in: payee,
   "Pay into …" under it, the description, a line per item on the requester's department pool, the same person's other
   requests with no PV yet ticked in, the files carried over, notes "From Payment request · …", and **Bill back? Yes /
   No** for each split. On save the voucher is made as any other, then the requests are tied to it, their files copied
   into `payment-attachments`, and each Yes split drafted as an invoice (Invoice · Create — asked before anything is
   written).
6. **Tests:** `tests/member-sql/validate-payment-requests.mjs`; the models, the Claim page, the window, the drawer,
   the dialog's preset; the registries (`DEFINER_RPCS`, `READS_WHILE_VIEWING_AS`, tabs, page tabs, database types).

**As built (2026-10-29).**

- *Bill back is drafted in the same database step that ties the requests to the PV* (`payment_requests_attach_pv`), not
  by `createMultiLineInvoice` from the app: a refusal (a closed month, Invoice · Create missing, a share with no
  category) leaves nothing tied and nothing drafted, and Create PV voids the draft voucher it made. The invoice is what
  `createMultiLineInvoice` would make — draft, the requester's department's mode, the company (`subsidiary`) or the
  department (`dept_pool`), one line credited to the account the request's lines carry on this voucher. A drafted
  invoice keeps its share's answer (void it in Invoice to answer again); a voided one counts as none.
- *Bill back is answered in the Create PV window* (the user, 2026-10-29: "我开pv 时就要确定是不是要开单了"): each split
  of the requests the PV pays is asked Yes / No there, nothing pre-chosen, and Save waits for every answer; the drawer
  only says where each stands (*Decided when the PV is made*). So Create PV takes the request picked and every request
  of the same payee into the same account with no PV yet. A split invoiced already (its earlier PV voided) is not asked
  again; Reject clears an answer whose invoice is none or voided. A window left open while a request changed is
  refused before a voucher number is taken (*close the window and Create PV again*).
- *Each item is its Description* (the user: "确定他们放的那个是description"): the New request window heads its items
  Description · Amount (RM), and each becomes the words of its line on the PV.
- *The rows:* HR's sidebar › Admin › **Claim** above the rooms; Finance's account menu › **Account** › Claim (the
  phone app's Profile lists Admin only, so no half-made screen there); both only for a login of one's own and never
  while viewing as. The Department view's and Marketing's rows say Claim. Finance AM holds no claims cells — left to
  the user to tick.
- *Files:* the PDF, JPG, PNG, Excel, Word or CSV a voucher's attachments take, up to 25 MB, so each carries onto the
  PV (`payment-attachments`, copied inside R2).
- *Viewing as somebody* the Claim page shows none of the real account's requests and offers no New request.

## 4c. PR ③ — tasks (2026-10-29, the user: "可以，开始做 PR ③")

Branch `feat/payment-requests-approval`; mig `20261029200000_payment_request_approval`. The design is the mockup's
② (`mockups/claims-flow-mockup.html`: the Marketing Manager's *Claim & approve*, the permission rows "Claim ☑ By
management approve") and §1's rows *Who approves first* and *Who sees what*.

1. **By management approve — the tick** (§1: "勾在人的权限上（职位模板也可以一次勾）"; person wins). Not a permission (it
   opens nothing — it routes one's own requests), so not a cell: its own two tables, as the sensitive fields' are —
   `permission_template_flags (template_id, flag)` and `user_permission_flags (user_id, flag, granted)`, `flag` one
   value today, `claims_review`. Drawn where the mockup draws it: a pill on the **Claim** row of the permission
   window (a title's template and one person's), ticked from the template, the red dot where it is the person's
   own. Saved with the window's Save (`permission_template_flags_set` / `permission_user_flags_set`, Manage
   permissions as the boxes; the template's version bumped). Read by `payment_request_review_of(user)`: the person's
   own tick, else their title's template's, else no.
2. **Claim & approve — the tab.** `claims_approve` in the HR, Finance, Marketing and Department views (the
   mockup's "以后有了 manager … 不用改系统"), reach **Dept**: View opens Claims · View, Approve opens Claims ·
   Approve, at the holder's department; page `/claims`. Who holds it in a department is read from the boxes (the
   person's own Approve box, else their template's) — `payment_request_approvers(department)` — because
   `current_actions()` answers for the caller only; the writes still ask the caller's cells.
3. **Routing at Submit** (`payment_request_save`): ticked, not a Claim & approve holder oneself, and somebody else in
   the department holds it → *Waiting for approval* (`pending_approval`, `needs_approval`); else to Finance as
   today. My calls, said in the window: an approver's own go straight to Finance (the mockup: "Yours go straight to
   Finance"); ticked with nobody to approve → straight to Finance rather than stuck.
4. **The approver's writes:** `payment_request_approve(ids)` → with Finance, `approved_by` / `approved_at`;
   `payment_request_send_back(ids, reason)` → rejected at the approval stage, one reason for all. Each: Claims ·
   Approve at Dept (no page guard: every box for that cell is on `/claims`, so the cell is the box), the request's
   department the approver's own, never one's own request, only while it waits for approval. The requester fixes and sends again
   under the same number (and it waits for approval again).
5. **The approver's reads:** `payment_requests_for_approval()` — every sent request of their department (Claims ·
   View at Dept); their files through `payment_request_file` and the bucket's read policy (spec §3: "the
   department's approvers"); accounts as the last four without the Bank tick.
6. **The page** — `/claims` for a holder is **Claim & approve** (the mockup's ②): "{Department}’s requests. Your
   team’s wait here for you or {the other approvers} — one approval is enough. Yours go straight to Finance.",
   + New request; cards **To approve** · **All {Department}** · **Mine**; the table Sent · From · What · Amount ·
   Pay; ticking rows (FinTable's select) opens the bar's **Approve** / **Reject**; the drawer's *Approve — send to
   Finance* / *Reject…* ("Tell {name} what to fix — they can submit it again"). A staff member's Claim page is
   PR ②'s, its chip saying *Waiting for approval · {who}* and *With Finance · approved by {name}*; the New request
   window says who approves first. Finance's drawer says who approved.
7. **The rows:** each view's Claim row reads **Claim & approve** for a holder; Marketing's carries the number
   waiting (its sidebar's counts).
8. **Notices** (`app_notifications`, kind `claims`, about a `payment_request`): sent for approval → the
   department's approvers; approved, sent back, rejected by Finance, paid → the requester. Listed by the bells
   that list the portal's notices (the HR and Finance apps, the phone's push) and by the Marketing view's bell
   (`mkt_notices` takes `claims` too); a tap opens the request on the Claim page.
9. **Seeded** (§1: "Today: Marketing staff ticked; Marketing Manager / Assistant Manager hold Claim & approve"):
   Marketing · Staff ticks By management approve; Marketing · Manager holds Claim & approve (View, Approve).
10. **Tests:** the SQL validator (routing, approve / send back, the approvers' reads and files, the flags, the
    notices); the models, the page in both modes, the permission window's pill; the registries.

**As built (2026-10-29).**

- *No page guard on Approve / Reject:* every box standing for Claims · Approve is a tab of `/claims`, so the cell
  is the box (the scan's `narrows()` — a guard there would close nothing).
- *Who approves* is read from the cells, the person's own over their title's (`payment_request_approvers`); a
  holder at All (the Principal) may approve their own department's on the page but is never listed or told.
- *The rows:* HR's Admin and Finance's account menu say **Claim & approve** for a holder; Marketing's row moves under
  MANAGER TOOLS with the number waiting; the Department view's row keeps *Claim* (its sidebar takes no per-viewer
  name yet) — the page itself is Claim & approve.
- *The list:* the hub's cards To approve · All {department} · Mine, the table Sent · From · What · Pay · Where it is ·
  **By whom** (who approves, approved or sent it back — the mockup's line under the chip, a column of its own, the
  Claim page too); *Select* in the toolbar ticks the waiting rows (as Approvals), the bar says "N selected · RM" with
  Clear, Reject…, Approve N →. Since PR ④ (the user: "统一吧") the boxes are always there instead, as on Payment
  request — see §4d.
- *Notices* reach the HR and Finance apps' bells and the phone (`notifications_mine`, the push), and Marketing's bell
  (`mkt_notices` lists `claims` too, each saying what it opens); a tap opens `/claims?open=<id>`. The Department view
  has no bell — its Claim page says where each stands.
- *Seeded:* Marketing · Staff (no login yet) ticks By management approve; Marketing · Manager (SIA JOSIAH, and KHO
  WEI JIE once he has a login) holds Claim & approve.

## 4d. PR ④ — tasks (2026-10-29, the user: "可以，开始做 PR ④")

Branch `feat/payment-requests-bulk`, **no migration**: every write is one PR ② already makes — `createPaymentForRequests`
for each voucher, `payment_request_reject` for each request — and the batch is the Approvals' own: the vouchers'
`approval_requests` share a `group_id`, which the Principal approves whole (`approve_voucher_batch`) or splits
(`approve_voucher_batch_partial`); a voucher rejected there is voided, so its requests come back to Finance by PR ②'s
trigger. The design is the mockup's ③ (*多选 → 一次开几张 PV*) and §1's rows *Several at once* and *One person's
requests*.

1. **The list.** Each staff request waiting for a PV has its tick box, always there (the mockup) — a press elsewhere
   on the row still opens its drawer (`FinTable`'s `select.boxOnly`). Payroll rows and Revenue claims show a faint box
   and say why when it is pressed (payroll is funded one by one — the mockup; a Revenue claim is paid on its own: its
   voucher goes straight to the Principal, never a draft, and its "reject" is Return to HR — my call). Above the list
   at the right, in the table's toolbar ("按钮换去上面", "做在格子的靠右"): "N selected · RM …" (else "Tick requests
   to act on several"), **Reject** and **Create PV**, greyed until a row is ticked. A payee's open requests are tagged
   **2 → 1 PV** after the name (`FinColumn`'s `tag`).
2. **Create PV for the ticked.** All one payee's: today's Create PV window (PR ②). Several payees': the **Create
   payments** window — From bank, Payment date and Method once; **One PV a person** (ticked: every open request of a
   payee in one PV, the ones not ticked too — "自动合成认的是我有没有开pv"; unticked: a PV a request); a block for each
   PV: the payee, Claim / Direct pay, the account, how many requests, the description, its lines (words, pool,
   category, amount), Bill back? Yes / No for each split, the receipts it carries; the total; **Save N drafts** /
   **Submit N for approval** ("Submitted together, they reach the Principal as one batch — approve all at once, or one
   by one"). The requests are read again before it opens (`openRequestsForPvs` — each PV's `payment_requests_for_pv`,
   and whether Billing back is open to the account); each voucher is saved as PR ②'s, one after the other, a draft
   each; then they are sent together (`submitPaymentsTogether(ids)` — one `group_id` when two or more). One refused is
   said, the rest go on.
3. **Reject the ticked:** one reason for all (`rejectPaymentRequests(ids, reason)`, Treasury · Void or Approve as
   Reject; each `payment_request_reject`; one refused is said, the rest go on).
4. **Tests:** `FinTable` (boxOnly, tag); the model (the PVs a selection makes, the tag); the window (its blocks, what
   Save waits for, each voucher's form, the run and its words); the actions (the group, the refusals); the hub (the
   boxes, the toolbar, which window opens).

**As built (2026-10-29).**

- *The toolbar's group* is the design's bar inside the table's toolbar (the kit's `TickTools` / `TickButton`): light
  with "Tick requests to act on several" and the two buttons greyed; dark once a row is ticked ("4 selected · RM
  2,554.49"). On a narrow screen it wraps to the toolbar's next line, still at the right. Its buttons are named *Reject
  the ticked* / *Create PV for the ticked* for a screen reader (the drawer keeps its own *Create PV*).
- *Claim & approve the same* (the user, told it still had PR ③'s Select and bottom bar: "统一吧" — §1's "Managers
  likewise"): the boxes always there on To approve and All {department} (none on Mine — one's own goes straight to
  Finance), a box of a request not waiting for one's approval saying so; `TickTools` with **Reject** (one reason for
  all, the SendBackSheet) and **Approve** at the toolbar's right; the Select toggle and the bottom bar gone.
- *Who sees the boxes:* an account that may Create (Treasury · Create) or Reject (Void or Approve); a Maker without
  Void / Approve has Create PV only. Changing card clears what was ticked; the search narrows it to the rows on show.
- *Create payments* reads each PV's requests again before it opens (a request cancelled meanwhile is said, nothing
  opens); with One PV a person unticked, each ticked request is a PV and the unticked ones drop out. The lines' edits
  are kept by request and place, so ticking it again keeps the categories picked. A Yes needs Invoice · Create — without
  it only No can be pressed. The run: each voucher made in turn ("Making 2 of 4…"), then sent together; all clean →
  the window closes with *4 PVs submitted together — with the Principal* (or *saved as drafts*); anything refused or a
  receipt not carried → the window lists each voucher's outcome, *Done* refreshes the page; nothing made → the window
  stays as it was with the refusal.
- *The batch on Approvals* is a combined card (*Payment voucher × 4*, the first voucher's words); the Principal
  approves it whole or splits it (`approveRequestGroupPartial`), the rejected ones voided. One voucher alone is
  submitted as any other.
- *Reject the ticked* lists them by name and number, one reason for all; one refused stays in the window (the rest
  rejected and the page refreshed).
- PR ③'s test fixtures gained `review` / `ownReview` / Marketing's `claims` count (type-only; `tsc` named them).

## 4e. PR ⑥ — tasks (2026-10-29, the user: "b, 手机也能勾")

Branch `feat/payment-requests-rest` (from PR ④'s; rebased on main once #852 is in). The phone's design is
`mockups/pr6-phone-payment-request.html`: **B** — a *Requests · N* button on Payment's bar in place of Dept /
Payroll / ⋯ › Claims — and **ticks on the phone too**.

1. **The phone's Payment request** — `/fin-app/page/payment-requests`, the sidebar row's own address
   (`appHref('payment-requests')`; today the catch-all's "coming"): the desktop's read (`readPaymentRequests`) in the
   phone's kit — the hero *Waiting for you*, the cards (All · Payroll · Statutory · each department), a card's list,
   a request's own screen (what the desktop's drawer shows, in the phone's groups) with its steps on the bar — a staff
   request: Reject… · Create PV; a payroll: Send back to HR… · Generate PV; a Revenue claim: Return to HR… · Create
   PV; one with a voucher: Open voucher. A staff request waiting for its PV has its box; ticked, the bar is "N
   selected · RM" with Reject and Create PV — one payee's in the Create PV window, several payees' in Create payments
   (PR ④'s windows, sheets on the phone), Reject with one reason.
2. **Payment's bar** (phone): *+ Payment · Repayment · Requests · N · ⋯* — N the requests waiting for Finance; Dept,
   Payroll and ⋯ › Claims go (⋯ keeps Export).
3. **Statutory payments move in.** The old Payroll Requests page's read-only section — HR's KWSP · SOCSO · EIS · LHDN ·
   SKBBK vouchers by month — becomes a **Statutory** card of Payment request, desktop and phone (Payroll payouts only,
   as the Payroll card): a row a voucher, opening it (my call: kept rather than lost with the page).
4. **The old pages go.** `/payments/claim-requests`, `/payments/dept-requests`, `/payments/payroll-requests` and the
   phone's `/fin-app/page/claim-requests`, `…/dept-requests`, `…/payroll-requests` redirect to Payment request
   (payroll's to its Payroll card), so an old link still lands. Their screens go (the old pages' bodies,
   `RequestsApp`, `PayrollRequestsApp`); the parts Payment request uses stay where they are (`payroll-read`,
   `GeneratePvForm`, `SendBackButton`, `raiseClaimVoucher`, `RaiseClaimVoucherForm`). The Dept requests code goes
   whole — no row in production, orphaned since #533. The old pool-claims code of `/claims` (`claims/actions.ts`,
   `ClaimActions`, `NewClaimForm`, `decidesPoolClaims`) goes — nothing has reached it since PR ②.
5. **Dept payment requests read-only** — a migration: the table keeps its history (none today), its writers refuse
   a client (no `EXECUTE` for `authenticated`), and the table takes no client write. Dry run first, on the user's go.
6. **Tests:** the phone screen (cards, list, ticks, a request's steps), Payment's bar, the statutory rows, the
   redirects; the SQL validator for the read-only table; the registries.

**As built (2026-10-29).**

- *The phone's ticks are the app's own Select* (as Invoice's: Select / Done beside the search, a press on a row ticks
  it while selecting) rather than boxes always there — a phone row is one button. The dark bar holds **Reject** (in
  Clear's place; Done clears) and **Create PV →** (`BulkBar.alt`, new in the app's kit).
- *A request's phone screen is the drawer's own*: the drawer's body and steps became `useRequestView` (RequestDrawer),
  which the drawer and the phone both draw; Create PV's two windows became `useRequestPvs`, shared the same way.
- *Payment's bar* reads `Requests · N` from Payment request's own read (`readPaymentRequests`, what waits for
  Finance), so the phone's number and the page's hero agree; `loadPaymentsHub` no longer reads the Dept, Payroll and
  Claims lists.
- *Statutory* shows only when HR made such vouchers (as the old page's section) and never in All or in *Waiting for
  you*; a row opens its voucher (the drawer on the computer, the app's Payments on the phone).
- *The old pages* redirect after asking their own page (`requirePage`, as every listed page); the phone's three to
  `/fin-app/page/payment-requests` (payroll's on its Payroll card). Gone with them: the old pages' bodies and parts
  (`StatutorySection`, `GeneratePvForm`, `SendBackButton`, `RaiseClaimVoucherForm`, `claim-read`), the whole Dept
  requests folder, `RequestsApp`, `PayrollRequestsApp`, the phone's claim / dept request models (only `bankOption`
  stays), RaiseSheet's Dept kind, and `/claims`' pool-claims code with `decidesPoolClaims`.
- *Migration `20261029250000_dept_payment_requests_read_only`*: no client writes the table; Generate PV and Cancel
  (`generate_pv_for_dept_request`, `cancel_dept_payment_request`) are **dropped** — nothing calls them (the app's only
  caller went with the page; no function, trigger, policy or view names them in production) — rather than kept for the
  service role. The approval queue's steps, the voucher's followers and the chart's renames run as their owner, as
  before. Validator `validate-dept-requests-read-only.mjs` (8 checks).

Later PRs are detailed here when they start.

## 5. Review focus

PR ⑥:

- An old link — a notice, a bookmark to `/payments/payroll-requests` or the phone's `/fin-app/page/claim-requests` →
  Payment request (payroll's on its Payroll card), the page's own gates asked first.
- The phone's Requests · N against the page's hero → the same number (one read).
- A Finance · Maker on the phone → Select and Create PV, no Reject; a Treasury reader → no Select.
- A statutory voucher → never counted as waiting; it opens its voucher.
- Any voucher rejected on Approvals → `dept_request_pv_rejected` still runs, as its owner (it meets no Dept request).

PR ④:

- Two payees ticked while one of their requests is cancelled → Create payments says so before it opens; one cancelled
  after it opened → that voucher refused at save, the others made and sent together.
- The Principal rejects one voucher of the batch → it is voided, its requests back with Finance, the rest paid.
- A payee with three open requests, one ticked beside another payee's → all three in one PV, the window naming the two
  not ticked.
- One PV a person unticked after the categories were picked → each request its own PV, the categories kept.
- Finance · Maker (Create, no Void / Approve) → boxes and Create PV, no Reject; a Treasury reader → no boxes.

PR ③:

- A request waiting when its department's only approver leaves (their login closed) → it waits; its sender cancels it
  and sends it again, now straight to Finance (the next ones go straight there).
- An approver approving two at once while one was just cancelled → the whole lot refused, nothing approved.
- The Assistant Manager with View but no Approve → reads the list, no Select, no Approve.
- A title's tick moved while a person has their own over it → the person's stands (the red dot).
- Marketing's bell after PR ③ → its own notices as before, the claims' beside them, each opening its own page.

PR ②:

- Two requests of one payee, one with a split → one PV for both; Save waits for that split's Yes / No; a No drafts nothing.
- Create PV with a Yes share on a day the month is closed → nothing tied, nothing drafted, the voucher voided again.
- A request's PV voided, then made again → its drafted invoice is the one kept (no second invoice number).
- A shared login (finance@, hr@) → no Claim row in the HR or Finance view; a New request from it says HR must link it.
- A receipt that will not copy onto the voucher → the voucher stands, the missing receipt said.

PR ①:

- A Revenue claim returned to HR while a draft PV for it exists → refused (no live voucher).
- The Payroll tab and its counts for an account without Payroll payouts → absent, and the All count without them.
- `/payments/requests` read as a voucher id by the Finance view's detail rules → a broken page; pinned in task 2.
- Two payroll rounds generated at once from two tabs → today's outstanding check still answers (no new path).
- A member claim's invoice opened by Finance → only through the treasury-gated reader, never the member's bucket policy.
