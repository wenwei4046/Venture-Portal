---
paths:
  - "src/lib/auth.ts"
  - "src/lib/supabase/admin.ts"
  - "src/lib/permission*.ts"
  - "src/lib/surfaces.ts"
  - "src/lib/sensitive.ts"
  - "src/lib/private-*.ts"
  - "src/lib/approval-domains.ts"
  - "src/lib/team-directory.ts"
  - "src/lib/view-as.ts"
  - "src/lib/roles.ts"
  - "src/lib/kind-checks.test.ts"
  - "src/lib/audit/**"
  - "src/test/**"
  - "src/app/*/audit-log/**"
  - "src/app/*/approvals/**"
  - "docs/access-matrix.md"
  - "supabase/migrations/**"
  - "tests/member-sql/validate-*.mjs"
---

# Every tab — permissions, the database's guard rails, audit and View as

CLAUDE.md › Permissions is the summary; this is the whole of it: permission templates, the action each gate asks, approvals by domain, the database asking for the action on every write and read, reach (own / dept / all), salary / NRIC / bank, the app-wide audit history, View as.

Read this before changing a permission, a gate, a table, a policy or a database function — in any tab — and again in every full scan of such a change (CLAUDE.md › Rules by tab). New decisions are added here, dated, never to CLAUDE.md. Until 2026-10-10 this was CLAUDE.md's Permissions section, moved word for word.

Permissions (2026-09-01 — replaced the four hard-coded roles)
Every gate in the portal reads a PERMISSION, not a role. A permission is granted
by a TITLE, with a per-person exception available on somebody's page. `permission_defs` is the catalog; `has_scope()` derives the
table-level scopes RLS asks about, so a title cannot be granted a page whose
queries then come back empty.
  App:  `requirePermission('treasury')`, `can(user, 'reports')`, `canAccessX(user)`
  DB:   `(SELECT has_scope(ARRAY['treasury']))`
        The same wrapping is mandatory for `current_user_role()`,
        `current_user_segment()` and `current_user_department_id()` inside a
        policy: `(select current_user_role())`. Bare, Postgres re-runs the
        `users` lookup for EVERY ROW the policy checks (mig 20260909150000
        fixed 18 such policies; the `users` table had been scanned 32.6M
        times). The migration ends with a guard that fails if one comes back.
A title with NO permissions of its own falls back to the role its holder's
account was created with — which is why the cutover changed nobody's access.
`users.role` survives ONLY for that fallback (the dept_manager row-scoped
policies it also served ask the cell's reach since PR3c, below). Do not add new
gates that read it.

**PERMISSION TEMPLATES (2026-10-08, the People Management revamp — PR1 of 4;
user: 不要 role，到最后是跟着 title 的 permission 走).** A title points at a
TEMPLATE (`titles.template_id`): cells = function × action (view create edit
approve void export manage) × scope (own / dept / all) in
`permission_template_grants`, plus sensitive fields (salary / nric / bank) in
`permission_template_sensitive`. Rows = `permission_functions` (the design's
22 + Member Services, Revenue app, Switch views). One person is raised or
lowered on a cell in `user_permission_cells` (scope NULL = ✕). Ten templates
seeded, 29 titles mapped; ACCOUNTS EXECUTIVE waits for the user; the four
shared accounts (no staff row) keep their role defaults. **Ultimate full
access** = everything + `view_switch` (the View-as switcher reads that key on
the REAL account — `User.canSwitchView` — not the Principal role); **Full
access** = the same without it. THE GATES STILL READ MODULE KEYS:
`current_permissions()` opens each cell's key via `permission_cell_keys`
FAIL CLOSED — hr/treasury/admin-domain keys need the cell at All, hr keys need
Salary amounts ticked, treasury keys need Treasury · View, admin keys (the
Principal's own powers) need a Principal template — and the UI lists what is
"held for now" with the reason (`heldCells`, `lib/permission-matrix.ts`,
the TS twin of the SQL). The account's hidden role = the template's
`base_role` (`sync_user_role` triggers; new role `staff` = no defaults).
Retitling somebody WITH a login onto another template, or linking a login,
needs `permissions_manage` (trigger `hr_staff_costs_permission_guard`) —
HR cannot promote anybody, themselves included, by retitling. Writers are RPCs
(`permission_template_save` w/ version + per-person reset list,
`permission_template_create`, `permission_title_set_template`,
`permission_user_cells_set`, `permission_user_clear_legacy`); a save that
changes a cell somebody has their own value on asks keep-or-reset per person.
Every change is in `audit_events` (one txid per save; History on the
Permissions tab, `permission_history()`, `lib/permission-history.ts`). Old
per-key `user_permissions` still apply on top (carrie's 3 denies) until cleared
on her card. PR2 (actions enforced) below; NEXT: approvals by domain, PR3
own/dept into RLS, PR4 masking — then `permission_cell_keys` goes. Migs `20261008110000`–`130000`,
`tests/member-sql/validate-permission-templates.mjs`.

**THE APP-WIDE HISTORY (2026-10-08; user: 在 portal 里人手改的资料全部要有 audit
history（谁、什么时候、改前/改后）… ERP 自动送进来的大量资料不用逐行记，但人手在上面做
的改动要记; and 这个 audit log 基本上就是跟着自己的权限 … Finance 没有 HR 那边的
permission，同样他就不会看到 HR 的 audit log).** Every table of the app has ONE
line in `audit_tables` (187): `mode` all (every insert / update / delete) ·
people (only a signed-in person's change — the ERP-fed `sales_orders`,
`sales_order_lines`, `sales_import_batches`, Open Bill suggestions,
`comm_upsales`, the ERP's fairs / venues / organisers; trigger `WHEN
(auth.uid() IS NOT NULL)`, so the feed costs nothing) · none (with a `reason`:
logs that are a record already, the ERP catalogue mirror, statutory
schedules, run statements, screen layouts, the unmerged CRM's tables). The
trigger `audit_row_change()` (no arguments — it reads the line) keeps who
(`actor_id` = auth.uid(); `actor_source` portal / server / database; a server
write names its person via `actor_column`, the member's invoice upload), the
row's key, before / after (`omit_columns` never copied — the ERP's `raw`, run
and close snapshots; `diff_only` UPDATEs keep only changed + key + label
columns on the wide tables), `changed` (updated_at / updated_by / version
never count) and `needs` (a payroll voucher, its sources / attachments /
approval and the pool rows its payment wrote need Payroll payouts or HR
Costing — the line `lib/payroll-vouchers.ts` draws). **A NEW TABLE = one
`SELECT audit_register('t', 'Label', 'Area', '{read_keys}' …)` in its own
migration** — `src/lib/audit/registry.test.ts` fails otherwise, and so does
the next audit migration's coverage check. **Reading follows the reader's own
permissions:** nobody selects `audit_events` (grant revoked, PR1's policy
closed); `audit_changes()` returns only tables whose `read_keys` the caller
holds (`audit_log` = all), drops what `needs` a key they lack, and blanks
`salary_columns` / `nric_columns` / `bank_columns` their title may not see
(`current_sensitive_fields()`: template's sensitive fields, else Principal / HR
bank+NRIC, Finance bank; salary = `salary_individual`) — the column names come
back in `masked`. A department head reads none yet (own / dept = PR3).
`config_audit_log`'s 44 rows were copied in (one negative txid per old save),
its 8 triggers DISABLED, `log_config_change()` left unused — nothing is
dropped (the MCP refuses any `DROP` text; use CREATE OR REPLACE TRIGGER /
DISABLE TRIGGER / ALTER POLICY). UI: Audit Log is a sidebar group — **Changes**
(`/audit-log`, `canSeeAuditChanges` = any key in `lib/audit/read-keys.ts`) and
**Access** (`/audit-log/access`, `audit_log`; old `?resource=` links
redirect). `lib/audit/changes.ts` (saves, fields, values), `lib/audit/refs.ts`
(ids → names under the reader's session), mig `20261008190000`,
`tests/member-sql/validate-app-audit.mjs`.

**EACH ACTION TAKES EFFECT (2026-10-08, PR2; user: 每个 action 各自生效).** A
write asks for the ACTION it is, not the module key: `requireAction('treasury',
'create')` / `requireAnyAction([…], […])` / `requirePayrollPayoutsAction` (lib/auth.ts)
at every Server Action and form page, `canDo(user, fn, action, scope?)` for the
button (lib/permission-actions.ts), `has_action()` in SQL. The answer is
`current_actions()` (jsonb `fn.action` → own / dept / all; `User.actions`): a
titled person's template cells with their own cells over them, else what the
account's KEYS allowed — `permission_key_actions` (80 rows, TS twin
`KEY_ACTIONS`, a department manager's department functions at Dept) — so the four
shared accounts can do exactly what they could (verified on prod: every one of
the 5 logins' actions = its keys'). A cell counts only while one of the keys that
open its function's pages is held (`viewKeysOf` = the keys that allowed its View;
`has_action` asks the same) — PR1's fail-closed key rules still decide pages.
What each cell opens is in docs/access-matrix.md (amendment 2026-10-08 PR2):
Approve is somebody else's submission (the queue, a claim, a reconciliation
marked done, amending a BOOKED loan — the Treasury description), a module's own
steps are Create / Edit (HR's Complete, Submit, Total Close; Revenue's closes;
Director Salary's Complete), Void reverses, Export is a file. A key's actions
must cover every gate it passed (`permission-actions.test.ts`), which is why a
sign-off Finance always made is Edit OR Approve (send a payroll batch back =
Void | Approve) and `team` gives `team.manage` (titles + ladder, as HR had).
`GATED_ACTIONS` lists every action a gate asks and the least reach (Claims ·
Create Own, My Billing · Create and Dept reports · Export Dept, the rest All);
the test scans `src/` and fails when a gate is added without it, and the
matrix's *held for now* reads it (`heldCells`). Unconverted on purpose: page
reads (key), Reports' layout (key), the member app (its own keys), Department
mode (`has_perm` in the DB), member back office (DB `member_is_manager`), and
approvals (below). Test mocks of a user carry `actions` (`src/test/with-actions.ts`);
a user without them may do nothing. Mig `20261008200000`,
`tests/member-sql/validate-permission-actions.mjs`.

**APPROVALS GO BY DOMAIN (2026-10-09, PR2b).** A request is decided by whoever
holds its DOMAIN's Approve — Treasury: vouchers, loans, fund sources and their
cancellations (`tier_change` on a fund source), department expenses / payment
requests, advances, withdrawals, escalations, base rate; HR Costing: payroll
runs, HR cost submissions; Director Salary: Invoice Pool releases; contracts
only the queue's — or the queue's own Approvals · Approve (everything), and
NEVER by whoever raised it unless their account is the Principal kind (user
2026-08-06 kept the Principal's self-approval; a checker approving their own is
no check). SQL `approval_domain()` / `approvable_types()` / `approver_may(user,
types, submitters)` (+ `_request(id)` / `_group(id)`; no sign-in = the old rule:
the account handed in must be a Principal); TS twin `lib/approval-domains.ts`
(`approvableTypes`, `decision` → why not, `canSeeApprovals`), gates
`requireApprover` / `requireApprovalQueue` (lib/auth.ts). The ten approval
functions (approve_single_voucher, the two batches, payroll run approve /
reject, execute_loan_cancel / _fund_source_cancel — now also only behind an
APPROVED cancellation — dept expense approve / reject, dept_request_pv_rejected)
keep production's bodies: one statement swapped in place by
`pg_temp.swap_check` (pg_get_functiondef + replace, refused unless the old check
is there exactly once). New key `approvals_queue` (no table scope) is opened by
Approvals · View, so the Director and Executive office reach `/approvals`
without the admin-scope `approvals` key. Policies: approval_requests read /
flip for deciders (`IN (SELECT unnest(approvable_types()))` — `= ANY ((SELECT
arr))` parses as a SUBQUERY and fails `text = text[]`), loans / bank_accounts
update for Treasury approvers. The queue draws a non-decidable row with "—" and
why (`undecidable` on PendingApprovals). hr_costing / director_salary / revenue
keys' Approve rows moved to the `approvals` key (UPDATE, not DELETE — the MCP
refuses DELETE): hr@ approves no payroll run, as before. Mig `20261009010000`.

**THE QUEUE'S READS AND REFUSALS (2026-10-15, the Finance phone app's Approvals).**
The queue's read and a request's read live in `approvals/_lib/queue-read.ts`
and `_lib/request-read.ts` (moved word for word; `/approvals` and
`/approvals/[id]` call them, and so does the phone's `/fin-app/page/approvals`
behind `requirePage('/approvals')` + `requireApprovalQueue()`; a request there
through `openApprovalRequest`, page-actions.ts, narrowed by `/approvals`'
boxes). Refusals are answers, never throws (production masks a thrown
message): `approveRequestsBulk` says a closed month in `failed`;
`approveRequestGroupPartial` answers `{ ok } | { ok: false, reason }` — who
may decide, the database's refusal — and BatchDetailsModal shows the reason.
The finance view's phone rules: `../finance/finance-view.md` › PART 5a.

**THE QUEUE ON THE COMPUTER IS A HUB (2026-10-17, DESIGN.md v4.77; the whole of
it: `../finance/finance-view.md` › APPROVALS IS FINANCE'S HUB).** The gates are
the page's as before (`requirePage('/approvals')` + `requireApprovalQueue()`;
every decision the same Server Actions). `undecidable` is now each hub row's
`why` — no tick, said when pressed, no right-click *Tick to decide*; a refusal
stays in the decision dialog (`_components/decisions.tsx`, the phone's too).
PendingApprovals, RecentDecisions and BatchDetailsModal are gone; the decided
are `readDecidedSince`'s 30 days.

**THE DATABASE ASKS FOR THE ACTION TOO (2026-10-09, PR3a).** A table's row
policies opened it to whoever held ANY key of its domain (`has_scope(ARRAY
['treasury'])`), and a View cell opens a key — so through the API a template
that only reads Treasury raised payment vouchers and a Director who sees the
roster wrote payroll. Every table a domain policy lets somebody write now also
has a RESTRICTIVE policy per command, `needs_action_insert / _update / _delete`
→ `may_write(table, command)` → `has_any_action(actions)` over the row of
`permission_table_writes` (TS twin `TABLE_WRITES`, lib/permission-table-writes.ts;
`fn.action` or `fn.action:dept` / `:own`). Restrictive = only takes away. Each
list is every way the APP writes that table under the caller's own session: the
gate of each server action writing it straight, of each SECURITY INVOKER function
it calls (the Revenue / catalogue / ladder RPCs — `INVOKER_WRITES` in the test),
and of each INVOKER trigger writing on its behalf (a voucher marks its invoice
paid, so every voucher writer is on invoices UPDATE). DEFINER functions meet no
row policy (postgres owns tables and functions, BYPASSRLS) — they ask for their
own action (PR3b, below). `permission-table-writes.test.ts` holds the twin, scans
every `.from('t').insert/update/upsert/delete` and `.rpc(invoker)` in src/ with
its gates (own function, else its callers across imports) and fails when a gate
lets in an action the table does not ask for, or a new domain table is written
unregistered; the migration's guard refuses a domain write policy left without
its restrictive one. A NEW table a domain policy opens: rows in
`permission_table_writes` + `SELECT permission_writes_guard('t')` in its
migration. `WRITES_WITHOUT_ACTION`: table_layout_defaults only. Residual, said
out loud: a table's UPDATE cannot tell edit from void from approve (an approver
may update a voucher), and an action that writes a table as a side effect may
write it straight (Claims · Approve raises the claim's voucher). Mig
`20261009020000`, `tests/member-sql/validate-table-writes.mjs`.

**THE FUNCTIONS ASK FOR THE ACTION TOO (2026-10-09, PR3b).** 70 write functions
(DEFINER, plus `commit_sales_import_batch` and the commission trigger
`guard_revenue_commission_adjustment`) asked who the caller WAS — `IF v_role NOT
IN ('finance','principal')`, `EXISTS … role IN ('principal','hr')`,
`has_perm('hr_costing')`, `has_scope(ARRAY['hr'])` — so a template's hidden kind
decided (a Finance · Checker could book a loan through the API; a Director whose
template HAS Treasury · Create was refused it) and a View cell, which opens the
key, could submit payroll. Each now asks `has_any_action(…)` for the action its
app gate asks, its one check statement swapped in place in PRODUCTION's body
(`pg_temp.swap_check`: whitespace-blind, exactly once, nothing else moves); no
sign-in answers as before. A function that also runs INSIDE another one — as
the same signed-in person — asks for the outer path's actions too:
`mark_journal_entry_reversed` (the loan / fund-source cancel executors run as the
cancellation's approver: + Treasury · Approve, Approvals · Approve),
`assert_commission_payroll_open` (Revenue · Edit or HR Costing · Edit — closes,
pay lines, HR's adjustments, the payroll triggers), `payroll_send_back_batch`
(Finance's send-back of a whole run). On production only four things moved, none
a page of theirs did: carrie's manual JVs (her Reconciliation is held back by
hand; the table refused them since PR3a) and hr@ closing a voided voucher's
approvals (Treasury · Void's). `permission-table-writes.test.ts` › *the DEFINER
functions that ask for an action* reads every swap out of the migration and fails
when a caller's gate lets in somebody the function refuses (All covers Dept
covers Own; a `requireApprover()` path names its domain in
`DECIDED_IN_ONE_DOMAIN`). A NEW write function asks `has_any_action` for its app
gate's action — never `current_user_role()`, never a key. Left on purpose: the
approvals (PR2b, by domain), `permissions_manage`, `department_mode`, reopening a
closed payroll month (the Principal's), the member app's own keys, the
service-role-only `reopen_director_salary` / `reverse_staff_payroll_accruals`,
the commission-run functions no page calls (`apply / save / reopen_commission_run`,
INVOKER), and every READ function (reach = PR3c). Mig `20261009030000`,
`tests/member-sql/validate-function-actions.mjs`.

**OWN AND DEPT REACH THE ROWS (2026-10-09, PR3c).** A cell's reach (Own / Dept /
All) was the app's alone: 18 row policies asked `current_user_role() =
'dept_manager'` (or a list of kinds), so a template's Dept cells reached its
department only on a dept_manager-kind template, and Own reached nobody (Staff ·
Basic raised a claim it could not read). Each now asks
`has_action(fn, action, 'own'|'dept'|'all')` — with the department / segment read
off the person (`current_user_department_id()`, `current_user_segment()`) — and
is `TO authenticated` (has_action is not the publishable key's to call): Claims
own / dept / all, raised only as yourself with Claims · Create; Dept Pool its
department's pool, expense and payment requests; My Billing its department's
invoices, contracts, requests and its own draft invoices in its segment; Dept
reports its segment's invoices and journals; an approval request raised as
yourself by `may_write` (PR3a's list); a Revenue commission adjustment read by HR
Costing / Revenue · View. 17 READ functions behind those pages swap the kind for
the same cells (`calculate_dept_np`, `get_dept_opex_rows`,
`dept_invoice_settlements`, `rnp_invoice_events`, `bridge_mirror_slices`: All =
any department / segment, Dept = theirs; the HR-cost lump sums, billing
allocations, payroll accrual / funding reads: Billing, HR Costing or Treasury ·
View; `revenue_pay_preview` / `comm_effective_direct_line_limits`: Revenue ·
View). Production, every active login: the same rows in all ten tables; moved only
reads no page of theirs makes — hr@ a department's NP / OPEX, carrie report-only
mirror slices, Finance the per-director payout summary (Director Salary is not
Finance's). `permission-table-writes.test.ts` refuses a later row policy that asks
`current_user_role()`. Still by kind, on purpose: `approvals_decider_update`
(owner kind may decide their own request), `table_layout_defaults`
(`dashboard_summary` asks Treasury · View since Q7, below). Domain READS asked
only the key (`has_scope`) until PR3d (below) — every table now also asks for
the action. Mig `20261009040000`, `tests/member-sql/validate-reach.mjs`.

**SALARY, NRIC AND BANK ACCOUNTS SHOW ONLY WHERE TICKED (2026-10-09, PR4; user
chose A for the files).** A template's three Sensitive fields are
`current_sensitive_fields()` (untemplated: Principal / HR bank + NRIC, Finance
bank; salary = `salary_individual`), on the app side `User.sensitive` and
`lib/sensitive.ts` (`sees`, `shown` → the value or `••••`, blank stays blank;
the view-as switch masks as the viewed role, `sensitiveFromKeys`). Salary was
already held: every key that opens a pay page needs the Salary tick (PR1). NRIC
and account numbers were not — any session that read a staff row, a director or
a salary-PV line read them raw, the Director template (Salary only) included.
Now `hr_staff_costs.nric / bank_account_no / bank_account_no_2`,
`directors.nric`, `payroll_voucher_lines.bank_account_no` and a payroll
submission's per-person copies (`hr_cost_submissions.staff_snapshot /
staff_allocation_snapshot`, which the Treasury scope could read) are NOT
`authenticated`'s to SELECT — every other column is granted, writes untouched —
so a `select('*')` on those tables fails. The way to them is three DEFINER
readers that repeat each table's own SELECT policies (the migration refuses if
those moved) and hand the value to a holder of the tick, `••••` to anybody else:
`staff_private_fields(ids|NULL)`, `director_private_fields`,
`payroll_line_accounts` — in the app `lib/private-fields.ts` (`readStaffPrivate`
…, which mask again for view-as); `lib/private-columns.ts` lists the columns and
`STAFF_ROW_COLUMNS` / `DIRECTOR_ROW_COLUMNS` replace `*`. `payment_cycle` masks its
account numbers (production's body renamed `payment_cycle_unmasked`, service
role only, behind it). The two files need the real numbers, so (choice A) the
payroll bank CSV needs Bank and the KWSP / SOCSO / EIS / CP39 files NRIC — 403
and not offered otherwise; raising salary PVs needs Bank too (app and
`create_payroll_disbursement_vouchers`); the PV page and its print show `••••`.
People: the editor sees an unticked field read-only and never sends it
(`updateStaff` used to write NULL over a field the form lacked), editing a
person needs the Salary tick (the form saves pay), the InfoTech import all
three. `build_hr_cost_submission_payload` copies no number;
`employee_chart_lifecycle` reads the four fields it uses, not `*`. On
production nobody's page changed — every login on a page that shows a number
holds its tick (dry-run per login: same rows, same values through the readers,
same `payment_cycle`); a Salary-only title read 29 NRICs and 29 accounts as
`••••`, 0 digits. Team · View without the Salary tick opens People through the
directory since PR4b (below). TWO migrations so the deploy has no window: `20261009050000` (readers +
functions; columns still readable) before the code, `20261009050100` (the
revoke; refuses to run without the readers) once the code is live.
`tests/member-sql/validate-sensitive-fields.mjs`,
`src/lib/private-columns.test.ts`.

**WRITES FOLLOW THE TAB BOXES (2026-10-11, the user: "yes sepertae by tab").**
Since 8b a page OPENS by its tabs' View; now what it lets you DO follows the
same tabs' Create / Edit / Approve: `actionsOnPage(actions, closed, route)` keeps
a write cell (create, edit, approve, void, manage) only while one of THIS
page's tabs that stands for it still has that box open — Receipt · Create creates a
receipt, Payments · Create does not, though both are treasury.create underneath.
View and Export never narrow; a write none of the page's tabs stands for stays
as held. `requirePage` narrows the request's account IN PLACE (getUser is cached
per request, so every later canDo on the page — each button, a form page's
requireAction — asks the narrowed actions); a Server Action has no requirePage,
so `requireAction` / `requireAnyAction` / `requireApprover` narrow by the page
it was sent from (`next-action` request with a Referer; no page to go by = as
held). ONLY WHAT SOMEBODY UNTICKED CLOSES (`closedBoxes` → `User.closed`; it
replaced the same day's `tabsExplicit`, which missed a person's own box over a
template not saved on tabs): a template saved on tabs closes every box its
ticks, with the person's own boxes over them, leave out; over a template not
saved yet, only the boxes their own were unticked (a View with its whole tab);
legacy own cells without boxes, and every untemplated account, close nothing —
ticks worked out from cells can leave a cell unticked the account still holds
(Finance's Void without Approve). The database still asks the function cell
(point 6): per-tab writes are the app's, as per-tab pages are. The Revenue app
follows the same list (`revenue/revenue-app.md` › THE APP FOLLOWS THE TICKS).

**ROUND 2'S FOUR MODULES (2026-10-11, the HR revamp's second package; mig
`20261011060000`).** Functions `documentation` (view · create · edit),
`hiring` (view · create · edit · approve), `rooms` (view · create · edit) and
`guest_link` (view · edit), every reach all; keys (scope `none`)
`documentation`, `hiring`, `meeting_rooms` (book) + `meeting_rooms_manage`
(the rooms; rooms.edit), `guest_link`; `lib/roles.ts` `canAccessDocumentation`
/ `canAccessHiring` / `canAccessMeetingRooms` / `canAccessGuestLink`. Role
defaults: principal + hr all five; finance + dept_manager `meeting_rooms`.
Templates: Ultimate / Full / HR every new cell; every other portal template
Meeting rooms · View + Create (the user: Meeting Rooms in every view); the two
Revenue app templates none (members book from the app). Tabs: HR view
Documentation · Hiring requests · Hiring insights · Talent Bank · Meeting Rooms
· Guest Link (after Member Services), and Meeting Rooms in the Finance,
Principal and Department views (`shared('meeting_rooms')`, reach all). **The
modules' tables have RLS on and NO policy** — every read and write is one of
the module's SECURITY DEFINER functions asking `has_any_action` for its cell
(the guest link's ask the link's code instead and are granted to anon by name,
no service role). Nothing anybody had moved: the five logins gained exactly
those keys (dry-run per login, then applied; `page-tabs.fixtures.ts`).
**Documentation's files (2026-10-11, mig `20261011070000`)** are the one
place a storage policy asks a cell: the private bucket `hr-documents` takes an
INSERT only under `documents/` · `letters/` · `publish/` from a session with
Documentation · Create (the browser uploads — a file is bigger than a Server
Action carries; the action then asks `hr_doc_file_present`), and a SELECT
(signed links, made at the click) for Documentation · View or, for a member,
`hr_file_readable_by_member(name)` — their department's documents and what
was addressed to them. Its memos reach PEOPLE, not sub-departments
(`member_memo_recipients`, read by `member_visible_memo`). The rules:
`.claude/rules/hr/documentation.md`.
**The Revenue app's Book a room and Documentation (2026-10-11)** are tabs of
their own — Profile · Book a room (`rev.rooms`: View, Create) and Profile ·
Documentation (`rev.documentation`: View) over the app's `revenue_app`
cells; a member holds no `rooms` or `documentation` cell. The database lets
*Revenue app · View (own)* read the schedule and book for THEMSELVES from the
app (`p_source 'app'`), and a member reads their department's documents
through `member_staff_id()`; the Principal's View as reads one member's list
with `member_documents_of` (Documentation · View, mig `20261011110000`).
The rules: `.claude/rules/revenue/revenue-app.md`.

**THE GUEST LINK: WHAT THE PUBLISHABLE KEY MAY CALL (2026-10-11, mig
`20261011091000`; the user: Guest link at launch OFF).** Besides the five row-policy helpers, six SECURITY DEFINER
functions are granted to `anon` BY NAME — `guest_link_page`, `guest_link_day`,
`guest_link_book`, `guest_link_cancel`, `guest_link_hire` and `guest_link_may_upload` (the
storage policy `guest_link_uploads`'s question; mig `20261011092000`) — the public page `/g/<code>` calls them
with the publishable key and no session (`lib/guest/client.ts`). None asks a
permission: each asks the link instead (on, the CURRENT code — `hv-` + 8 of 32
letters and digits — and the part open), touches only bookings made through
the link, and answers a wrong or old code with "closed", nothing more. No
service role. Everything else of Meeting Rooms and the Guest Link stays
signed-in only (`guest_link.view` / `guest_link.edit`, `rooms.*`). A new
function for the guest page is granted the same way, by name, and checks the
code itself — `tests/member-sql/validate-guest-link.mjs` lists what anon may
call. The rules of the page: `../hr/rooms.md`.

**VIEW AS A PERSON, READ-ONLY (2026-10-11, the user: "can set a function is
view as a user, same like in revenue app, i can view as a member").** Both view
switchers end with *View as a person…*: a picker of everybody who signs in to
the portal (`view_as_people()`, by department), and the portal is then drawn
AS that account — their kind, department, keys, actions, tabs and sensitive
fields, the database's own answers asked as them: `view_as_person(p_user)`
(DEFINER, view_switch only, mig `20261011050000`) points `auth.uid()` at them
(`request.jwt.claim.sub`, which auth.uid() reads first) for current_permissions
/ actions / sensitive_fields / tabs and puts the caller back. `getUser` (portal
surface only; the member app and `getAccountUser` never) returns that account
with `viewingAs`, `actualRole` = the viewer's kind; it beats HR's / Finance's
view; a lens is never drawn over it. A strip says "Viewing as X — read-only"
with *Stop viewing*; picking any view also ends it. **Read-only for the whole
browser while the cookie is set:** `createClient()` hands back
`lib/supabase/read-only.ts` — tables read, `insert/update/upsert/delete`
answer `{ error: 'Read-only while viewing as somebody — nothing is saved.' }`
without running, an rpc runs only if it is on `READS_WHILE_VIEWING_AS` (the
portal's STABLE functions, read off pg_proc — Postgres refuses a write in one —
plus five VOLATILE ones read to write nothing, `view_as_person` and the access
log), storage reads and signs but never uploads or removes. The BROWSER's
client reads only too — a column layout, a table's shared default, an upload —
by the readable mark `vp-viewing-as` set beside the httpOnly cookie
(`lib/supabase/client.ts`; the mark only ever takes writes away). The two
service-role writers go around the session and ask `refuseWhileViewingAs()`
(Invite user, the ERP feed key). Signing in clears both cookies, so the next
account on the shared office PC never inherits a read-only browser. Data rows are still read as the viewer (RLS
answers auth.uid()), so a page that narrows rows only through RLS shows more
than the person would. **A new function the portal reads goes on the list, or
it fails while viewing as somebody.**

**SWITCHING VIEW KEEPS YOUR POWER (2026-10-11, the user: "switch view is still
can be edit, full access means = ultimate access").** HR's and Finance's views
are LENSES, no longer masks: `getUser` keeps the account's own keys, actions,
tabs and sensitive fields and only sets `role` to the view (`actualRole` = the
account's), so every gate, button and Server Action answers as the account —
the Principal in HR's view runs payroll, approves and sees salaries as in their
own. What the view changes: the shell (HR's for `hr`, Finance's for `finance`),
the Overview (`lensOverview` — HR's, the treasury's), and the menus, which list
only that view's tabs (`lensNav` in PortalFrame: `hr.*` / `fin.*` — the user's
point 5); a page from elsewhere still opens. The owner kind follows the account
(`isOwnerKind`: `actualRole ?? role`), so the Principal self-approves in any
view. Only the member app's Revenue View still masks (role defaults). Seeing the
portal exactly as somebody else does is View as a person, read-only (next).

**…BUT FINANCE'S VIEW LISTS PAYROLL BY DEPARTMENT (2026-10-13, the user: 按部门，
跟 Finance 一样).** `getUser` marks a lens (`User.lens` = 'hr' | 'finance'), and
`listsPayrollByPerson(user)` (lib/roles.ts) = `canSeePayrollPayouts` and not on
Finance's lens — what every LIST of payroll asks (Payments and its export, Daily
Bank, a pool's History, the ledgers). The right itself still opens a voucher,
its print, Payroll Requests, the bank file and Approvals, so the lens keeps the
account's power. The rule: `../finance/finance-view.md` › PAYROLL BY DEPARTMENT.

**PAGES AND SIDEBARS FOLLOW THE TABS (2026-10-11, the HR revamp 8b — point 6:
app gates per tab).** Every portal page asks `await requirePage('<its route>')`
FIRST — its route as the folders spell it, `/fund-in/[id]/edit` — and
`lib/page-tabs.ts` `PAGE_TABS` lists the tabs any one of whose View opens it (a
page in several views, Approvals or the reports, opens from each; the Approvals
queue also from the domains decided in it). It is asked ON TOP of the page's
own gate, never instead: a tab can close a page, never open one. `OPEN_PAGES`
are the few no tab closes — `/dashboard` (where every refused gate lands), a
request's own approval pages, and the old addresses that only redirect. The
sidebars ask the same (`opensPath`): the old nav through `buildNavEntries`
(Settings' links name their tab — Chart of Account / Departments Finance's,
the rest the Principal's), HR's nav, the phone's bottom bar. An account's tabs
(`User.tabs`, worked out in `getUser`): its template's stored ticks with its
own boxes over them; else what its cells and keys give (`tabsFromCells`) —
every untemplated login, a template with no ticks stored yet (boxes still laid
over, so a held-back tab whose cells another shares stays closed), somebody
whose own cells predate tabs; a View-as mask, from the masked keys. Stored
ticks and boxes come from `current_tabs()` (DEFINER, the caller only, mig
`20261011030000`), in the same round trip as the keys. `page-tabs.test.ts`
holds every page to the registry and to asking for itself first, and every
login production has (principal@, finance@, hr@, marketing@, carrie — their
real current_permissions / current_actions) and every template's holders to
opening each page they open today. **A NEW PAGE goes into PAGE_TABS (or
OPEN_PAGES) and asks requirePage first; a test that stubs `@/lib/auth` stubs
requirePage too.** Not per tab yet: writes (Create / Edit / Approve still ask
the function's action — a box unticked on one tab of a shared function does
not stop a write the function allows), and the read-only Permissions views on
People (hr@ holds no accounts.view; reading templates stays with the roster's
readers), whose Edit and Invite now also ask HR view › Permissions' Edit and
Create. NEXT (8c, the user's to decide): the view switcher, the Department
view's own sidebar, the Principal's lens.

**PERMISSIONS BY VIEW AND TAB (2026-10-11, the HR revamp 8a; the user chose B
with my six points).** A template is ticked per VIEW › TAB › View / Create /
Edit / Approve — five views (HR, Finance, Principal, Department, Revenue app;
the catalog is `src/lib/permission-tabs.ts`, each tab with the page keys it
opens today and the function cells each box stands for). Four actions only: a
function's Export rides with View, Void with Approve, Manage with the Edit of
the tab where it is done (Rules = revenue.manage, Hierarchy = team.manage,
Permissions = accounts.manage, Member Services = member.manage, Chart of
Account = categories.manage, Settings = settings.manage, CRM · Team =
crm.manage). No reach to pick: Department view = the holder's department,
Revenue app = their own, the others = the company — save tabs that need
another (My claims = own, CRM · Team and Product List = all, every Overview =
all). **The database still asks for FUNCTION cells** (point 6): each save
writes the ticks AND the cells they stand for in one transaction —
`permission_template_tabs_save` calls `permission_template_save`, and a
person's `permission_user_tabs_set` calls `permission_user_cells_set` — the
cells worked out on the SERVER from the ticks (`cellRows`, `personCellRows`
— a person's cells are what their ticks give at another reach than their
template STORES, null = held back). `current_actions()` and every guard since
PR3 are unchanged, and so is everybody's access: nothing was moved by the
migration — a template with no ticks stored shows the ticks its cells give
(`tabsFromCells`: a box only where its own cell is held at the tab's reach and
its page opens for the template's keys today; a narrower tab only for what the
company-wide ones do not already give, so Finance and the Principal are never
put in the Department view; a page listed in several views — Approvals, Dept
Pool, Venture Pool, Reports, Audit Log — only in the views the template lives
in), and `permission-tabs.test.ts` holds the eleven production templates to
LOSING NOTHING. A template's first save on tabs applies the user's merges, and
only those (dept_head claims.void + opex.export; director dept_reports.export,
treasury.void, venture_pool.export; fin_checker claims.void, dept_pool.export,
treasury.void; fin_maker billing / treasury / venture_pool export; hr
revenue.export + team.manage), and drops a cell that opened no page (the
Executive office's reports.view, held back by the Treasury gate). Logins and
permissions are their own HR-view tab (Permissions: accounts.view / .create /
.manage) — never implied by People Management. Delete
(`permission_template_delete`) refuses a template a title points at.
Tables `permission_template_tabs` (read by every session, as the cells) and
`user_permission_tabs` (as a person's cells, and registered:
`permission_table_reads` accounts.manage / accounts.view / team.view:own),
both audited. **A person's boxes follow their template:** they are kept as what
was changed for them over their title's ticks, so whenever what lies under them
changes — the template's ticks saved, the title pointed at another template —
their cells are worked out again IN THE SAME TRANSACTION (`reapplied`; the save's
`p_people`, `permission_title_move`, each person through
`permission_user_tabs_set`; a person not on the template refuses the whole
save). Else a box held back from one page would hold back what the template
later gives through another, or a cell given with an old tick outlive it. A box
whose tab they cannot View is not theirs (`personTicks`). Somebody retitled onto
another template keeps boxes saved over the old one; their window says so and
offers Save (`cellsOutOfStep`). carrie's six cells from before tabs read as eight
boxes (Invoice + Billing Allocator Approve, Reconciliation + Journal Entries
held back) and, on Finance · Maker's first save, become four cells — her access
gains only Venture Pool export (dry-run on production, rolled back). Migs
`20261011010000`, `20261011010100`, `20261011020000`; PGlite
`tests/member-sql/validate-permission-tabs.mjs`. NEXT (8c): pages and the
sidebar follow the tabs' View, the view switcher, the Department view.

**PEOPLE WITHOUT THE SALARY TICK (2026-10-10, PR4b; the user chose 1b and
2b).** The Executive office (Team · View at All) and the Department head (Team ·
View at Dept) hold Team · View without Salary amounts, and the `team` key the
People pages asked for opens `hr_staff_costs` itself — pay columns and all — so
PR1's fail-closed rule kept People shut for both. They get a key of their own,
`team_directory` (scope `none`: no domain, so no row policy ever opens for it;
`permission_cell_keys` team.view → it at ANY reach, no gate; NOT a View key of
Team — no `permission_key_actions` row — so Team · Create / Edit / Manage still
need `team`), and read People through two DEFINER readers, never the table
(`lib/team-directory.ts`; `readsStaffTable(user)` = the `team` key decides which
path a page takes, `canOpenPeople` the sidebar): `team_directory(ids)` = the
rows their Team · View reaches (All everybody, Dept their department, Own
themselves; `current_actions()->>'team.view'`), every column named one by one
(a column added later stays out) — 1b: everything but pay (NULL without Salary
amounts) and NRIC / account numbers (•••• without their ticks, PR4's rule);
`team_org_chart()` = every active person's name, code, title, department and
line, plus the Revenue sub-departments and their directors (so a tree hangs from
its director) — 2b: a Department head reads the whole company's chart, names
and titles only. People Management (no unattached logins, no Rank column, no
Permissions tab), the person page and its floating card (no Permissions /
Activity, no Edit / Promote / Employment / Invite — `PersonCardData.can`) and
Hierarchy (Org chart only, read only: `TeamOrgChart`'s `canEdit` = Team · Edit
stops drag, line drawing and Detach) open for them. marketing@ (untemplated
dept_manager) does NOT get it — no role default; a template is the way. Mig
`20261010010000`, `tests/member-sql/validate-team-directory.mjs` (32).

**PAGES ASK THE CELLS, NOT THE KIND (2026-10-09, Q7).** The KIND
(`users.role`) is a template's hidden base_role and a custom template's cells
need not agree with it, yet thirty-odd pages and actions still branched on it:
which Overview to draw, whether a department page shows only the viewer's own
department, who decides a pool claim, who raises for somebody else's sign-off,
which Settings tabs, whether Billing Allocation is read-only, a report's
company-wide or department cut. Each asks the cells now, one rule per question
in `lib/surfaces.ts`: `overviewFor` (Treasury · View → the treasury Overview,
else HR Costing · View → HR's, else Dept Pool · View → the department's, else a
well saying the title opens none), `decidesEverything` (Approvals · Approve:
the sign-off queue), `raisesForSignOff` (Treasury · Create without Approvals ·
Approve: Finance's own queues, Invoice Pool's *Request release*),
`ownDepartmentOnly(fn)` (View held at Own / Dept, not All),
`decidesPoolClaims` (Claims · Approve + Treasury · View — a pool claim's
voucher is raised in the treasury; approve, reject and mark paid all ask it),
`raisesDepartmentRequests` (My Billing · Create at Dept: a pool's request
tabs), `seesAllSettings` (Settings · Manage, else Accounts + Departments),
`reportsCompanyWide` (Reports · View, else the department's cut). Billing
Allocation edits with HR Costing · Edit (its writes ask the same — the
Principal may edit it now); Member services and the member preview go by their
keys. The Overview's two summaries swapped their kind check for the cell
(`dashboard_summary` Treasury · View, `hr_dashboard_summary` HR Costing ·
View — production's bodies, one statement each; mig `20261009060000`). The
five logins land exactly where their kind put them (`src/lib/surfaces.test.ts`,
on production's own keys and actions); what moves is a template whose kind
disagreed with its cells — the Director title (kind staff, Treasury · View)
opens the treasury Overview instead of "Principal and Finance only"; nobody
wears it on 2026-10-09 (carrie is the one templated login). Still by kind, on
purpose, each with its why in `src/lib/kind-checks.test.ts` — which fails on a
new `user.role` anywhere else: which app the account belongs to (Revenue app
or portal), the shared table layouts (`table_layout_defaults`), reopening a
Total-Closed payroll month (the Principal's), the owner kind's self-approval
(`approver_may`; `isOwnerKind`, claims too), view-as, labels and the phone's
tab bar. `tests/member-sql/validate-overview-actions.mjs`.

**READS ASK FOR THE ACTION TOO (2026-10-09, PR3d).** A table's SELECT policies
opened it to whoever held ANY key of its domain (`has_scope`), and a domain is
wide: the hr domain is Director Pool, Director Salary, HR Costing, Revenue,
People and the Salary tick together, so a title given Revenue alone read every
director's payout through the API, Product List (admin) read the payroll,
Billing (treasury) read the bank reconciliations. Like the writes (PR3a): every
table a domain policy opens has a RESTRICTIVE `needs_action_select` asking
`may_read(table)` (plpgsql) — does the caller hold one of
`permission_table_reads`' actions for it (133 tables; twin
`TABLE_READS` in `lib/permission-table-reads.ts`). The row policies still say
WHICH rows. Each list is every way somebody reads the table under their own
session, derived in `src/test/read-paths.ts` (the read scan
`src/test/scan-reads.ts` — JSX, default exports, cache(), embedded relations,
the service role's client skipped — plus what it cannot see written down: a
check made by hand (`GUARDS`), a page's cell branches (`BRANCHES`: the
Overview, the approval page), tables named at run time (`DYNAMIC_TABLES`),
reads for whoever may (`WHOEVER_MAY`: audit labels), dead code), the
SECURITY INVOKER functions the app calls (`INVOKER_READS`, production's
bodies; `DEFINER_RPCS` names the rest — a new `.rpc()` must go in one), the
INVOKER triggers (they read as the writer), the policies' own subqueries,
security_invoker views, and each table's own writers. A page key counts as its
function's View at the least reach (`claims.view:own`). Not registered
(`READS_WITHOUT_ACTION`): users, title_levels, title_permissions (every
session), access_log, user_permissions, user_permission_cells, audit_tables,
member_requests, hr_import_templates (own rows). Three OWNER-rights views were
readable whole by every signed-in session past every policy —
`hr_monthly_payroll_summary` (department payroll totals; the app never read
it), `dept_pool_balances`, `fund_source_outstanding` — and now read under the
caller's policies (`security_invoker`); the migration refuses to finish while
any view a session can read is not invoker. Production (rolled-back dry run,
every login, row by row per table and view): the Principal reads exactly
what it read; the others lose only reads no page of theirs makes — carrie the
bank reconciliations, Settings' splits and overdue rules, report layouts; hr@
the Product List mirror and the Venture pool; the views their whole-company
answers. **A read of a registered table behind a gate it does not list fails
`src/lib/permission-table-reads.test.ts` in CI: add the gate's action to
`TABLE_READS` AND, in a new migration, to `permission_table_reads` (then
`permission_reads_guard('<table>')`); a new table opened to a domain gets its
row the same way.** Mig `20261009080000`,
`tests/member-sql/validate-table-reads.mjs`.

View as (2026-09-27): the Principal's `vp-view-as` cookie is shared by every
tab. *Revenue View* (`revenue_member`) is honoured by the member app ONLY
(`getMemberUser`); the portal's `getUser` ignores it. Before, switching one tab
to Revenue View sent every other tab's portal page to /dashboard — a Product
List tab "jumping to Overview". `vp-view` is a readable mirror of the choice,
so a tab left open re-renders its shell when another tab switches
(`useViewAsSync`, `lib/view-as.ts`). `getAccountUser` (2026-10-08) reads the
account with no mask at all; only the Product List asks it.

## The service role's callers — the whole paragraph (CLAUDE.md › Coding Conventions › Supabase client keeps the list)

Supabase client — server-side (`lib/supabase/server.ts`) uses the anon key with RLS via SSR cookies. `admin.ts` is the service-role client and BYPASSES RLS entirely. It is `'server-only'` guarded and has exactly NINE callers: `app/api/whatsapp/v1/webhook/route.ts` (Meta, 2026-10-02 — calling `crm_ingest_whatsapp`, and logging a refused delivery to `crm_channel_events`), `app/api/messenger/v1/webhook/route.ts` (Meta again, 2026-10-03 — the same, with `crm_ingest_messenger`), `app/api/erp/v1/sales-orders/route.ts`, `app/api/erp/v1/products/route.ts` and `app/api/erp/v1/sales-attending/route.ts` (each uses it for one thing — calling its ingest RPC; the second, since 2026-09-24 the items-only catalogue mirror, and the third, since 2026-10-12 the ERP’s Sales Attending — who works each booth, which is a seller’s brand week — are the SAME machine path as the first, more endpoints of one feed rather than a new kind of caller), `app/api/member-queue/route.ts` (the cron-secret queue sweep, `member_process_all_queues` and, since 2026-10-10, `member_run_due_replacements`; since 2026-10-11 also Hiring's leftovers — `hiring_leftovers`, the service role's alone, lists objects in `hiring-files` that no record names and that went in over a day ago, and the Storage API deletes at most 200 a run, counts only in the log: the user wants them gone every hour even when nobody touches Hiring, and an hourly job has no session to act under — `lib/hiring/leftovers.ts` is handed the cron's client and imports nothing from admin.ts; since 2026-10-13 also the two Bins, what has waited there 30 days going even when nobody opens them — the Talent Bank's `hiring_bank_bin_purge` before Hiring's leftovers, whose listing then deletes the objects it freed, and the Data center's `hr_drive_bin_purge` + the Storage API + `hr_drive_bin_files_gone` in `lib/documentation/drive-bin-sweep.ts`, likewise handed the cron's client; each function the service role's alone), `lib/member/server.ts` (a member quote's PRICES — `member_catalogue(…, p_priced)`, service-role-only, read only after `member_quote_context` authorised the session — and, the same way, its cost ratios (`member_quote_cost_rules`, 2026-10-05: the context a member's own login can call no longer carries them), and the invoice attestation insert; since 2026-10-05 also the member's month through Comm Cal's engine, `loadMemberIncome`, read only after `member_income_context` authorised the session because the engine reads costs no member session may, and My honours' kept finishes, `member_honours`, written there so no browser can put a place in them), `team/people/invite-actions.ts`, and `lib/erp-sync/feed-key.ts` (2026-09-13: the key the ERP generated and somebody pasted on Comm Cal lives in Supabase Vault behind `erp_link_put/get/drop_secret` + `erp_feed_secret`, executable by the service role ONLY — because whatever an HR user's server action can read with their session, their browser can read too, and that key opens the receiver). Reach for it only when a machine path has no session to act under or a secret must stay out of every session's reach, never to dodge an RLS policy that is merely inconvenient.

**A SURFACE THAT IS NO PORTAL PAGE NARROWS ITS OWN WRITES (2026-10-11, the HR phone app; security review M2).** `actingUser()` narrows a Server Action by the page its Referer names and acts "as held" when it names none — so `/hr-app` maps each of its parts to the portal page it stands for (`PART_PAGE` / `appAccess`, `lib/hr-app/server.ts`) and sends every write through `lib/hr-app/actions.ts`, which asks that page's open boxes before the module's own action runs. A new surface outside the portal's pages does the same. (Open for the user: whether `actingUser()` itself should fail CLOSED — narrow by every closed box — when an account has closed boxes and the Referer names no page; a hand-made request with no Referer acts as held today, since #272.) The rules: `../hr/hr-app.md`.

**"FULL ACCESS" SAYS WHAT IT LACKS (2026-10-11).** The template `full` is "Ultimate full access" (`ultimate`, the CEO's) less one cell — `view_switch`, seeing the portal as HR, Finance or the Revenue team. No title pointed at it, and the two names read alike in a title's template picker. Asked whether to delete it, the user kept it: "Go with full access without switching view" — it is named **"Full access · no view switching"** since mig `20261011131000` (data only: key, cells and description unchanged). Nothing in the code read it by its name (checked 2026-10-11).

**WRITES NAME THEIR PAGE (2026-10-11 — the user's answer C, "现在就做完整的"; plan `.design/hr-r2/PLAN-C.md`, app side).** The per-tab write split (#272) read the page a write belonged to off the request's Referer — which a hand-made request writes as it likes, so it could pick a page whose box was open. Every write gate now names its page(s) in code: `requireActionOn(pages, fn, action, scope?)`, `requireAnyActionOn(pages, …pairs)`, `requireApproverOn(pages)`, `requirePayrollPayoutsActionOn(pages, …pairs)` (lib/auth.ts); the account is narrowed to those pages' tabs' boxes and the request is never asked. **The pages are exactly the pages whose screens USE the action** — every page that imports it through its components (type-only imports carry no code): one page, or a list when its buttons are on several (`['/payments', '/payments/[id]', '/receipts']`) — then it counts while ANY of them keeps it (`actionsOnPages`), or a choice by what it writes (`kind === 'loan' ? '/fund-out' : '/fund-in'`). A gate naming too few closes a button that is there (Payments' detail page is HR Payment's too); one naming too many opens the write from a page with no such button (all of Revenue's actions once named `/revenue` — Comm Cal, Rules and Sales Groups together — and closed none of them). `src/lib/write-pages.test.ts` refuses an old gate, a page the tab registry does not know, and a gate whose pages are not its action's (`src/test/write-pages-scan.ts` walks the imports; pages compare by their tabs). The HR app is left out of that walk: its parts write as the portal page each stands for (`PART_PAGE`). Nothing changes for an account nobody unticked a box for — on 2026-10-11, every account. The database asks the same pages: THE DATABASE ASKS THE PAGES TOO, below.

**EVERY TAB OF EVERY VIEW, SELECT ALL, AND A NEW TEMPLATE FROM A WINDOW (2026-10-11 — the user: "permission 的 tab，你帮我再 scan 多一次 … 确保它能 scan 到每一个 view 的每一个 tab。再加入全选的地方，可以打勾 … template 点 add 的时候，就跳出来一个 floating window，让我去填这个 template 的名字，然后去打勾它可以 view 哪一边"; and, from a side agent's note the user passed on, Salary amounts in that window and a reason on a box ticked but not open).**
- **The scan, kept:** `src/lib/permission-tabs-coverage.test.ts` holds the matrix to every surface — each link of HR's sidebar opens from an HR view tab, each link of the portal's nav lands on a page the registry knows, each HR app part (`PART_PAGE`) is a page of an HR view tab, each Revenue app screen and Profile page has a box (`pageOfRoute` → `APP_PAGE_TABS`) or a written reason (`OPEN_IN_THE_APP`: Profile itself, the Product List, the CRM, Memos & notifications), and every row of the matrix stands for a page, an app page or one of `SOMEWHERE_ELSE` (the CRM's two, the Product List, the view switcher). The 2026-10-11 scan found the four portal views complete (round 2's tabs included) and the Revenue app four screens short: three got boxes, Memos stays open (`revenue/revenue-app.md` › THE REST OF PROFILE GETS ITS BOXES; mig `20261011233000` seeds the registry tables again, 225 boxes).
- **Select all:** for whoever may edit, the first row of a view's table (template and person window alike) — one box per column ticks that action on every tab of the view that has it (View with it; unticking View takes each tab), the last box every box of the view; "–" while only some are (`toggleColumn` / `toggleView`, `columnTally` / `viewTally` in `lib/permission-tabs.ts`).
- **Not open yet:** a tab whose View is ticked but whose page would still not open says why under its name (`heldTabs`): its key held back by its gate — pay pages want Salary amounts, the ledgers a treasury tab's View, the Principal's own pages a full-access template, a Revenue app account only its app (`keyHeldCode`, the one rule `openedKeys` / `heldCells` use) — or by a box not ticked (Member Services opens with its Edit, Permissions with People Management's View, HR's and Finance's Audit Log with whatever else is open). The CRM's Control panel opens with CRM · View at All, not a key (`cellGated`).
- **"+ New template"** opens a window (`NewTemplateWindow`): the name, the views it can see, its sensitive fields, and — before it is made — which of those tabs would not open yet and why. It makes a BLANK template, View ticked on every tab of the views picked (`viewTicks`), in one transaction: `permission_template_new(name, tabs, grants, sensitive)` (mig `20261011233200`, asks `has_any_action(accounts.manage)`; `createTemplate` works the cells out from the ticks, as every save). Its kind comes from the ticks in the database, never from the browser: only Revenue app tabs → `revenue_member` (its holders sign in to the Revenue app), else `staff`; a Principal-kind template is never made this way (the user: the CEO's powers stay with the full-access templates — the table says so on such a box). The copy of the open template it replaced (`copyTemplate`) is gone.

**CHANGE PASSWORD — A LOGIN OF ONE'S OWN ONLY (2026-10-12 — the user: "i want every user, have a change password function … in their profile tab. or admin category" — the current password, then the new one, then the new one again; then, from a side agent's note that principal@ / finance@ / hr@ are shared at the office: "just for that personal acc").**
- **Who:** a PERSONAL login — one a People record names (`hr_staff_costs.user_id`; every login People › Invite user makes). The four shared accounts (principal@, finance@, hr@, marketing@ — "no staff row", above) never see it: one person changing such a password would lock everybody else out, on every device. No key or tab decides it, so no template can grant it to a shared account. On production 2026-10-12: carrie and the user's own login are personal; the four shared ones are not.
- **The database answers for the caller only:** `my_login_is_personal()` (DEFINER, STABLE, plpgsql, mig `20261012000000`; PUBLIC / anon revoked) — the roster is closed to most logins (a Finance or Revenue member cannot read its own row through RLS). In `DEFINER_RPCS`; not on `READS_WHILE_VIEWING_AS` because nothing asks it while viewing as somebody (`loginIsPersonal()`, `lib/account/personal-login.ts`, answers no first). PGlite `tests/member-sql/validate-personal-login.mjs`.
- **Where:** Admin › Change password (`/admin/password`, `OPEN_PAGES` — no tab closes it; it redirects a shared login and View as to the Overview), the last link of Admin in HR's sidebar and of Reports & Admin in the old one (and so the phone's More sheet) — `canChangePassword` (lib/roles.ts) reads `personalLogin`, which the portal layout sets on the shell's user (not `getUser`, so no request pays for it but a layout render); the HR app's More (`HrAppData.personalLogin`); the Revenue app's Profile › Account (the member layout hands `changePassword` only for a personal login; never on a member viewed or the demo).
- **The change — one Server Action, no service role** (`changeMyPassword`, lib/account/actions.ts): the rules first (`passwordChangeProblem`: 6–72 bytes, not the current one, the two new ones equal), then an active sign-in, not while viewing as somebody (`READ_ONLY_MESSAGE` — the read-only client does not wrap `auth`), a personal login (`SHARED_LOGIN` otherwise); then the auth server with the session's own client: **`signInWithPassword` with the current password** (refused → nothing changed; accepted → this device holds a fresh session, which also satisfies an auth server wanting a recent sign-in), **then `updateUser({ password, current_password })`**. The auth server revokes every OTHER session of the account when its password changes — the device that changed it stays signed in; the others keep the access token they hold (1 hour; `getClaims` checks it locally, so neither the app nor PostgREST asks whether its session lives) and are signed out when its refresh is refused — the screen says "within an hour". A personal-login question the database could not answer (`askPersonalLogin()` → `null`) is NOT_CHANGED, never "shared". Refusals in words (`passwordRefusal`); anything but a mistyped current password goes to the server's log as `[password] change refused` with code and status, never a password. The portal form's boxes have no `name` (a pre-hydration submit is a plain GET), and the sheets cannot be dismissed while a change is in flight (the review, 2026-10-12).
- **Kept on purpose (the review's L5):** the change swaps this device's session mid-action (the sign-in's fresh one, then every other revoked), so a token refresh of the OLD session landing in that second — another tab's action, the browser client — could leave a revoked session in the cookies (signed out within the hour). Proving the password with a throwaway client and updating the existing session avoids that but fails outright where the auth server wants a recent sign-in before a password change; the swap was chosen.
- **Limit, said out loud:** the auth server itself lets any signed-in session call `updateUser({ password })` straight; the shared accounts are kept out of the portal's own ways in, not out of the auth API (no Supabase hook stands before a password change).

**THE DATABASE ASKS THE PAGES TOO (2026-10-11 — plan C, database side; migs `20261011220000_tabs_in_the_database`, `20261011220100_definer_writes_ask_their_pages`).** The app's gates narrow a write to its pages' boxes, but the database only asked the CELL: a cell several tabs stand for stays held while one of their boxes is open, so a request sent straight to the function (the publishable key and the person's own session) walked round a box closed on that page. Now:
- **The tab registry is in the database.** `permission_page_tabs` (PAGE_TABS) and `permission_tab_cells` (every box's cells). Both are seeded WHOLE by a migration (`DELETE` then `INSERT`). Change PAGE_TABS or a box's `opens` → a new migration seeds both again; `src/lib/tab-write-guards.test.ts` refuses a seed that is not the registry, row for row. RLS on, no grants: only the guards read them.
- **`tab_writes_open(sites)` / `tab_write_open(pages, wants)` answer what the app's gates answer** (`actionsOnPages`): a write a page's tabs stand for counts while one of those boxes is open; a page with no box for it keeps it as held; several pages, or several gates — open while any lets it through. True for an account nobody unticked a box for (every account on 2026-10-11 — one `current_tabs()` read and out), for a View, and when they hold none of the actions asked (the function's own check refuses that, as before). One table holds both answers: `tests/member-sql/tab-write-open.json` — `src/lib/tab-write-open.test.ts` asks the app, `validate-tab-writes.mjs` the SQL.
- **80 DEFINER writes ask first:** `PERFORM public.tab_write_guard(<pages>, ARRAY[<their own check's actions>])` as the body's first statement, put there from PRODUCTION's body by `pg_temp.tab_guard` (nothing else in the body changes — checked on prod: 80 bodies equal but for that line, DEFINER, grants and settings kept). A write chosen by what it is about picks its pages in the guard (`CASE WHEN p_record_kind = 'loan' THEN ARRAY['/fund-out'] ELSE ARRAY['/fund-in'] END`; a talent's file is Talent Bank's, a candidate's Hiring's). A write reached through gates that ask different things names each gate, `'pages|actions'` (`tab_write_guard_sites`: the bank bumped by an approval, a repayment and a reversal). Refused: 42501 "Not open to you on this page — a box in your permissions is unticked".
- **Only when it is the call itself.** One step inside another function (an approval carrying out what it approved, a payroll run reopened batch by batch) the outer function's own gate stood for it, so the guard stands aside (`PG_CONTEXT`: more than two functions on the stack). A DO block is nobody's caller.
- **Which writes:** every DEFINER write whose gate NARROWS — a box for its cell on each of its pages, and another box for that cell elsewhere. A cell all of whose boxes are on the page (Hiring's Approve, Director Salary's) is taken away whole when they are all unticked, so the database already refused it. The test holds the list to the app both ways: each guard's pages are its callers' gates' pages (by tabs) and can close something; a DEFINER write behind a narrowing gate is guarded or named in `NOT_GUARDED` with why (reads; the invoice number minted for any of five pages).
- **The Revenue app asks its pages too** (mig `20261011220200_member_sends_ask_their_tab`): `member_prepare_request` / `member_submit_request` / `member_cancel_request` ask `member_send_guard(kind)` first — `tab_box_closed('rev.requests' | 'rev.track', 'create')`, the twin of the app's `mustSend` (claim → Requests, waiting list / replacement → its own page), refusing in the app's words (`SEND_REFUSED`; `app-pages.test.ts` holds both). New md5s (change these from production's bodies): prepare 321a82c9…, submit 5a923a78…, cancel d3606cd4…. Book a room asks `rev.rooms` since mig 20261011150000; a quote is priced by the server after the app's own check (the service role has no tabs to ask).
- **Limit:** a write made straight to a TABLE is asked by its row policies, cell by cell — a table knows no page, so it narrows only when the cell is closed everywhere (the Approvals queue's own updates, for one).
- Checked on prod in a rolled-back run as Carrie (Accounts Executive, Treasury Create + Edit) with Fund OUT's Create unticked over her template: a new loan and a loan's change refused; a claim's voucher (Payments' Create ticked) through to the function's own checks; her box given back, through; finance@ (no template) unchanged.

**A KEY IS NOT ITS DOMAIN — THE PRODUCT LIST LEFT ADMIN (2026-10-14, mig `20261014100000`; the user wanted the Revenue Director to open the Product List, and a side agent's note asked that it open alone).** `product_list` was an admin-domain key behind a Principal gate, so a Revenue Director template ticked on it opened nothing ("Does not open — only a full-access template opens it", `keyHeldCode` 'principal') — and giving it as it stood would have given `has_scope(ARRAY['admin'])`, which some tables and functions ask ALONE: `access_log` and `user_permissions` (no restrictive read policy), `payroll_line_accounts` (DEFINER, the scope its whole check). Now its scope is `none`, its gate is gone, a Revenue app account may hold it (`current_permissions()`'s list; `MEMBER_APP_KEYS`), and the Product List's own tables open to `has_perm('product_list')` by policies of their own — the whole of it: `../revenue/product-list.md` › THE PRODUCT LIST OPENS TO WHOEVER'S TEMPLATE TICKS IT. **The rule it leaves:** before a key is made grantable beyond the Principal, check what its DOMAIN opens on its own (`has_scope` with no `needs_action_*` beside it, or a function asking the scope alone) and give the key its own policies instead of the domain. Proven on production in rolled-back runs (2026-10-14): every public table counted as nine logins before and after — PETER and KRIS gained the Product List's twelve tables (the catalogue, the ERP's mirror, `comm_brands` / `comm_schemes` / `comm_sub_departments` to read, `erp_sync_events` only `doc_no = 'catalogue'`) and, through `audit_tables.read_keys`, those tables' own history (7 → 15 lines: the catalogue's six, `comm_products`, `member_product_options`); nothing else moved for them, nothing at all for principal@, the owner's full access, Finance, HR or Marketing; `has_scope('admin')` stayed false. As PETER the page's writes went through (a SKU, a model, a cost ratio saved and removed, a combo removed) while `comm_schemes` and `erp_products` stayed unwritable; as principal@ (no template) and the owner's Ultimate full access the same writes went through as before; as Finance · Maker and marketing@ the three functions answered 42501.

**EDIT PROFILE — A LOGIN OF ONE'S OWN ONLY, AS CHANGE PASSWORD (2026-10-14, the Finance revamp v2's account menu; the user: "做，只给个人帐号").** A personal login (a People record names it — `my_login_is_personal()`) edits its own NAME and PHONE; the email is the sign-in and only shows. The name is `users.name` (what a voucher, an approval and the audit trail print for whoever made them); the person's legal name on the roster (`employee_name`) is HR's and stays; the phone is the People record's `contact_number`. Both through DEFINER functions answering for the caller's uid only — `my_profile()` (STABLE) and `update_my_profile(p_name, p_phone)` (refuses a shared login, a blank or 80+ name, a phone outside digits / spaces / `-` `+` `(` `)` or past 30), mig `20261014210000`, PUBLIC / anon revoked, in `DEFINER_RPCS`; no key or tab decides it (like Change password), and the app asks the same in the same words first (`lib/account/profile.ts`, `loadMyProfile` / `updateMyProfile` in `lib/account/actions.ts`: an active sign-in, not while viewing as somebody, a personal login). Shown by `canChangePassword` (Finance's account menu, `fin-nav.ts`). **GONE (2026-10-17 — the user, asked which of the two Edit profiles to keep: "finance app 他原本的那个profile就不需要了，帮我删除掉，留new de 就好", on the computer too):** one's record changes through Me › Profile's Edit profile only, sent to HR as a profile request (`../hr/attendance.md` › ME); the account menu's row and dialog, `loadMyProfile` / `updateMyProfile` and `lib/account/profile.ts` are removed, and `my_profile()` / `update_my_profile()` dropped (mig `20261017130000`) — left callable, a sign-in could still change its own name and phone without HR. A name changes through HR's People.

**A PERSON'S OWN DOCUMENTS AND VIEW ONLY ME, IN THE DATABASE (2026-10-14, mig `20261014190000`; the whole of it: `../hr/documentation.md` › A PERSON'S OWN DOCUMENTS).** Three guard rails moved:
- **The bucket's read for HR is narrowed by row**: `hr_documents_read` = Documentation · View AND `hr_doc_readable_by_hr(name, owner_id)` (a Data center file the reader is not shown — View only me — is not theirs to sign or list; since the review, mig `20261014230000`, an object in `drive/` nobody has recorded yet is only its uploader's — `storage.objects.owner_id` — and the hourly cron removes one a day old), OR `hr_file_readable_by_member(name)`; the member side also signs a file of their own folder shared with them and never a letter kept from them. `hr_doc_readable_by_hr` is granted to `authenticated` because the policy calls it as the reader.
- **View only me reads the KIND for one thing, on purpose** (as `approvals_decider_update`): the Principal kind sees everything locked (the user's answer: principal@ sees it); everybody else by rank (`title_levels.rank` of their People record's title — higher than the setter's). A login with no People record, or a title off the ladder, sees nothing locked and may lock nothing.
- **The Audit Log narrows by row too**: `needs_rule 'drive_private'` (`audit_row_needs` → `hr_drive_row_private`) gives a Data center row that is locked — itself or a folder above it, a Bin row by what it holds — `needs {audit_log}`, so only the Audit Log key reads its history; registered on `hr_drive_folders`, `hr_drive_files`, `hr_drive_bin`. Since the review (mig `20261014230000`) a lock also re-marks the lines written BEFORE it — the thing and everything in it — and so does a move into a locked folder (`hr_drive_audit_hide`); unlocking shows nothing again. **The limit, said to the user:** rank is ladder data, so whoever may edit a title (People · Edit) or the ladder can move somebody above a lock.
- **One's own documents** need no cell, as a memo: `my_documents()` / `my_document_open()` answer for `auth.uid()`'s People record only; Company keeps Profile · Documentation's box for an account with the Revenue app (`member_portal`) and is open to anybody else's (`hr_my_company_open`). Admin › My documents (`/admin/documents`) is in OPEN_PAGES beside Change password (a personal login, never while viewing as — `canSeeMyDocuments`). `my_documents_of` (Documentation · View) is on `READS_WHILE_VIEWING_AS`.

**FINANCE VIEW › CLAIMS IS GONE; EVERY DEPARTMENT'S CLAIMS ARE PRINCIPAL VIEW › CLAIMS (2026-10-16, mig `20261016140000` — the user, asked whether to drop the box once Finance's sidebar lost Claims (#435): "3, can delete", then "i will build another tab for it. so delete this version first"; and a side agent's note they passed on: that box was the only one reaching every department's claims, so check who holds it before deleting).** Checked on production first: only the **Finance AM** template ticked it (View / Create / Edit / Approve), no person held a claims box or cell of their own, **Finance · Checker** held claims.view:all and claims.approve:all with no ticks stored (so its derived box was this one), nobody wears either template, the `claims` table is empty, and nothing HR runs asks a claims cell — a member's benefit claim is decided in Member services (`member_review_claim`, member.manage), Payments' Claim Requests read and raise through Treasury (`claim_payment_queue` has_perm('treasury'), `claim_create_payment_voucher` Treasury · Create), payroll's pickup (`claims_follow_their_payroll`) asks none. What the box did that must stay: the full-access templates (**Ultimate full access** — the owner's and one other Principal login — and Full access · no view switching) hold claims at **All**, and `canDo` gives the Principal kind nothing its cells do not; with no company-wide box their next save would have narrowed claims to one department (`tabsFromCells` would tick Department view › Claims / My claims). So the same five cells are **`pri.claims`** — Principal view › Claims, where the Principal's own sidebar lists Claims (Departments) — until the user's new tab. The migration: Finance AM's four ticks and the five claims cells they gave go, Finance · Checker's two claims cells go, and both registry tables are seeded whole again (`/claims` and `/reports/claims` list `pri.claims`; `/payments/claim-requests` is Payments' alone — its guard asks treasury.create, which the Claims box never opened). The shared logins (finance@, hr@, principal@) take their cells from their kind, untouched; their derived boxes show Principal view › Claims instead of Finance view › Claims — the Permissions screen only, no page or link moves (`page-tabs.test.ts` holds them to the pages they opened). `permission-tabs.test.ts`: no Finance view › Claims, the full-access templates keep their four claims boxes, Finance · Checker none.

**SUB-DEPARTMENTS PER PERSON (2026-10-16 — after the CRM opened to the matrix, `../revenue/crm.md` › THE MATRIX DECIDES WHO IS IN THE CRM; the owner: "1, this follow by this handle department, as default" — "如果他是 handle IR 的话，在 title 那边他就可以自然而然 access。但如果他不是 handle IR，只是 handle Fare 的话，那他其实就只能看到 Fare 那边罢了。在 CRM 权限那边，应该可以让我去打勾，它是按 sub-department 去打勾的…包括 revenue team 本身也是要分 sub-department，根据权限的 tab 来 view"; mig `20261016180000_sub_department_reach`; `tests/member-sql/validate-sub-department-reach.mjs` 47 checks, `src/lib/sub-department-reach.test.ts`).** Each person reaches, per AREA, some of the Revenue Department's sub-departments: `crm` (the CRM), `comm_cal` (`/revenue/<sub>` and its months), `sales_groups` (`/revenue/<sub>/hierarchy`), `rules` (`/revenue/<sub>/rules`). **Default = the active sub-departments they HANDLE** — its director (`comm_sub_department_directors`) or a member of it today (`comm_hierarchy` on an active scheme, the office's date) — **and every active sub-department for somebody who handles none** (the company's level: the CEO, the directors, HR, the office, the shared logins — the owner never answered whether they should; this default keeps everybody's access as it was). One person is ticked on or off a sub-department in an area over that default (`user_sub_department_reach`, granted true / false — kept as what was changed for them, like their boxes; registered, audited, read as `user_permission_tabs`). The database: `my_sub_department_reach()` (the caller's, every area — `User.reach`, read in `loadUser` beside the other `current_*`; an error → NO_REACH, fail closed), `person_sub_department_reach(p_user)` (a person's window: the sub-departments, what they handle, their ticks — to themselves or People's / Permissions' readers holding the action), `permission_user_reach_set(p_user, p_ticks)` (the whole list, `permissions_manage`; sent by `setPersonTabs` with the boxes), the internal `sub_departments_handled` / `sub_department_reach_in` / `my_sub_departments` (no EXECUTE for `authenticated`); `view_as_person()` answers `reach` AS the person. **Who follows it:** the CRM in the database (`crm_my_role()` places somebody only when `crm_scope()` is in their `crm` reach); the Revenue pages in the app — `requireSubDepartment(slug, area)` 404s a sub-department the viewer does not reach on that page, the switcher lists only those, `/revenue` lands on the first Comm Cal one, the Sales Groups overview and its move-to list keep to the reached ones, and both sidebars open each page on a sub-department reached THERE (`revenueNavData` / `revenueSubFor`, nav-config; `hrNavSections` takes one per page — a page with none drops its links). **The window:** under a Revenue tab whose View is ticked (Comm Cal, Sales Groups, Rules, *Profile · My leads & appointments*, *CRM · Team* — the CRM's two are one area), a pill per sub-department, ticked where they reach it, the red dot where it is theirs alone; Reset to title clears them (`TabMatrix` `reach`, `PersonAccess`). Templates carry none — "what they handle" IS the title's layer (the owner, asked why People › Permissions shows no pills — one template holds KRIS, who handles Fair, and PETER, who handles Fair and IR: "ok", 2026-10-16; a template's own tick — everybody with the title reaches it whatever they handle — waits until a title has many people). **NOT YET — the owner: "4 先不做" (2026-10-16; TODOS.md):** the Revenue pages' DATA in the database — `comm_*` / `sales_*` rows are still opened by the Revenue cells alone, so somebody narrowed to Fair could read IR's rows through the API (on 2026-10-16 nobody is narrowed: every login reaches every sub-department it did before); the Revenue app's director scope (`member_director_scheme` & co.) still follows `comm_sub_department_directors`, not the ticks. Build the data's before anybody is narrowed on a Revenue page.

**A PERSON'S OWN EDITS WIN; NO KEY WAITS FOR THE KIND (2026-10-16 — the owner: "权限逻辑应该是这样分两层：1. 第一层是 Title 对应的 Template…2. 第二层是 Custom 的设定…Edit Permission 的优先级是高于 Title 和 Template 的", "如果我在 Permission 那边勾选允许她 View 和 Edit，那她 supposed to be 就可以去那个 Page 或者 App 查看", and, shown the places it still did not hold, "2. yes can"; mig `20261016210000_personal_edits_win`, `tests/member-sql/validate-personal-edits-win.mjs` 38 checks on production's readers (`personal-edits-production.sql`, md5-checked), `src/lib/person-sensitive.test.ts`).** Two things a tick could not open: (1) **Salary amounts, NRIC / IC, Bank accounts** were the template's alone — now one person is ticked on or off a field over it (`user_permission_sensitive`, granted true / false; registered and audited, read as `user_permission_tabs`), read FIRST by `current_sensitive_fields()` and by `current_permissions()`'s Salary tick (which opens the pay keys and `salary_individual` / `payroll_payouts`); an account with no template keeps its kind's fields. Written by `permission_user_sensitive_set(p_user, p_fields)` (the whole list, `permissions_manage`), sent by `setPersonTabs` with the boxes; the person window draws three pills above the matrix (*Sensitive fields* — the red dot where it is theirs alone; Reset to title clears them), and its not-open notes read their fields, not the template's. (2) **Eight keys waited for the template's KIND** (`permission_cell_keys.gate = 'principal'`: Approvals, Settings, Audit log, Invite users, Manage permissions, Department mode, Corrections, Switch views) — a tick on them opened nothing for anybody but a Principal-kind template, so a person raised on Approvals got no Approvals, and a template that ticks it (Director, Finance AM, Executive office) neither. A gate that reads the kind is not a permission: the eight rows lose it (data only; `keyHeldCode`'s `principal` branch stays for a row that says so, none does), and the fixtures follow. The Salary and Treasury gates stay — they read ticks. Supersedes PERMISSION TEMPLATES' "admin keys (the Principal's own powers) need a Principal template" and the 2026-10-14 rule's *Does not open — only a full-access template opens it*. **What an admin-domain key then opens on its own** (checked on production 2026-10-16): every PERMISSIVE admin-scope write has a RESTRICTIVE `needs_action_*` beside it, so the key alone writes nothing; of the admin-scope reads with no restrictive guard, the login record now also asks Audit log · View (`access_log_principal_select`) and the old per-key exceptions Logins & invites · View / Manage (`user_permissions_read`), beyond each person's own rows; `title_permissions` is every session's anyway; `hr_import_templates` is import mappings. **Still the KIND's, on purpose — the owner, shown the first three, kept them (2026-10-16: "3 不动"):** which app the account lands in (a Revenue app account opens only the Revenue app, whatever portal tab is ticked for it), approving one's own request, reopening a Total-Closed payroll month, *View as a person*'s refusal of a Revenue app account. Do not move them to ticks unasked; if asked again: a per-person kind, or a cell each (Approvals · self-approve, Payroll · reopen), and the landing app from the views ticked. **Know before ticking:** *Switch views* lets its holder view the portal as anybody, read-only — salaries included where that person sees them; *Permissions › Edit* (Manage permissions) lets its holder change anybody's permissions, their own included. On production nothing moved: no login wears a template that ticks a gated cell without the Principal's kind, no person's own cell is a gated one, nobody has a sensitive tick.

**FROM CLAUDE.MD, WORD FOR WORD (2026-10-15):** CLAUDE.md had reached 38,820 of its 40,000 characters; it now says these rules in fewer words, and the full text it carried — the reasons, the history, the numbers — is kept here, word for word. Coding Conventions › Supabase client and Sign out, and two of its Do NOTs:

Supabase client — server-side (`lib/supabase/server.ts`) uses the anon key with RLS via SSR cookies. `admin.ts` is the service-role client and BYPASSES RLS entirely. It is `'server-only'` guarded and has exactly NINE callers, each with one job: the two Meta webhooks (`app/api/whatsapp/v1/webhook/route.ts`, `app/api/messenger/v1/webhook/route.ts`) and the ERP's three receivers (`app/api/erp/v1/sales-orders/route.ts`, `app/api/erp/v1/products/route.ts`, `app/api/erp/v1/sales-attending/route.ts`), each calling its one ingest RPC; `app/api/member-queue/route.ts` (the cron-secret queue sweep, and Hiring's day-old leftover files); `lib/member/server.ts` (a member quote's prices and cost ratios, the member's month through Comm Cal's engine, My honours' kept finishes — each only after the member's own session was authorised); `team/people/invite-actions.ts`; and `lib/erp-sync/feed-key.ts` (the key the ERP generated, kept in Vault). Why each is allowed: `.claude/rules/portal-wide/permissions.md`. Reach for it only when a machine path has no session to act under or a secret must stay out of every session's reach, never to dodge an RLS policy that is merely inconvenient.

Sign out (2026-10-08) — ends THIS device's session only: `auth.signOut({ scope: 'local' })`. Given no options supabase-js signs out `'global'`, and the auth server deletes every session of the account — the phone, the other PC, every tab. The shared accounts (principal@ / finance@ / hr@) are switched on the office PC by Sign out → sign in several times a day, so the Principal's phone and desktop kept landing on /login (auth log: ten global sign-outs of principal@ on Oct 5–7, each followed by "Refresh Token Not Found" elsewhere). `src/lib/sign-out-scope.test.ts` refuses any `auth.signOut(` without it.

Do not leave a SECURITY DEFINER function open to PUBLIC / anon unless it checks the caller itself (`auth.uid()`, `has_perm`, `has_scope` …) — it runs as its owner, so RLS never asks, and Postgres grants EXECUTE to PUBLIC by default: the publishable key every browser holds can call it. A helper only other DEFINER functions call: `REVOKE … FROM PUBLIC, anon, authenticated` + `GRANT … TO service_role` — and "no app code calls it" means its BARE name appears nowhere in `src/`, `scripts/`, `tools/`: a call may put the name on its own line under `.rpc(` (that is how `approve_voucher_batch` was locked by mistake and handed back, mig `20261006050000`). 21 were open, writers and approvals included, until mig `20261006010000` (2026-10-06). And a function handed a user id (`p_user_id` / `p_approver` / `p_created_by`) refuses a JWT caller whose `auth.uid()` is not that id — the approvals do since mig `20261006020000`; the app always hands in `user.id`, which View-as never changes. Journals: the app posts through `post_journal_entry_as_caller` (own name + treasury / admin / hr scope); `post_journal_entry` is the owner's and the service role's (mig `20261006030000`). **A role check must hold for somebody who has NO role (2026-10-09):** `IF v_role NOT IN ('finance', 'principal')` is NULL — not true — when the role is NULL, so it never fires for the publishable key, a self-made sign-up with no portal account, or a switched-off account whose session lives on; ~60 DEFINER functions were guarded only that way, and the publishable key read director payouts and staff allocations through them (checked on prod, rolled back). Since mig `20261009000100`: `current_user_role()` REFUSES (42501) a sign-in with no active portal account (still NULL with no sign-in: anon / service role / the database); EXECUTE on every non-trigger DEFINER function is revoked from PUBLIC + anon except the five row-policy helpers (`current_user_role`, `current_user_department_id`, `current_user_segment`, `has_perm`, `has_scope`); and the schema's default no longer grants anon or PUBLIC EXECUTE on new functions — a function the browser's anon key must call needs an explicit GRANT — today only the guest link's, each checking the link's code (migs `20261011091000` / `20261011092000`, `.claude/rules/hr/rooms.md`). Write a new guard as `IS DISTINCT FROM` / `has_action()` anyway. `tests/member-sql/validate-definer-login.mjs`.

Do not `CREATE OR REPLACE` a function from its last copy in `supabase/migrations` without first comparing that copy's body with production's `md5(prosrc)` — functions changed straight on the database drift, and an old copy re-applied silently undoes production's fixes and guards. Nine (the approvals, `post_journal_entry`, `apply_pool_adjustment`, `reopen_director_salary`, `get_payroll_breakdown_by_pool`) were brought back in line by mig `20261006040000` (2026-10-06), which holds them exactly as production runs them. A change made straight on production goes into a migration file the same day.

**THE SERVICE ROLE'S TENTH CALLER — A LOGIN'S EMAIL (2026-10-16; Request to change email, `../hr/people.md`):** `lib/account/login-email.ts` moves a login's email in the auth server when HR approves its change on Attendance › Requests — only the service role may change another account's email there, and the project sends no email, so a person cannot confirm a new one themselves (supabase-js `updateUser({ email })` waits for that confirmation). Its one job, in this order: the database under HR's own session says whether the step about to be decided is HR's last on a login's email and whether this person may decide it (`att_login_email_change`, Attendance · Approve, not their own); never while viewing as somebody; `auth.admin.updateUserById(id, { email, email_confirm: true })`; then `att_decide` writes the People record and `users.email` only because the login already signs in with it. A decision that did not go through moves the login back unless `users` already reads the new email (approved after all) — the one read it makes. Called only from `decideRequest` (`lib/attendance/actions.ts`), behind `requireActionOn('/attendance/requests', 'attendance', 'approve')`.
- **Its second door, the same job (2026-10-22; `../hr/people.md` › HR CHANGES A LOGIN'S EMAIL WHERE IT STANDS):** `moveLoginForPerson` — HR's save on a person's page, behind `updateStaff`'s `requireActionOn('/team/people/[id]', 'team', 'edit')`. Never while viewing as somebody; the database under the editor's session first (`person_login_email_move`, mig `20261022150100`: People · Edit with the HR scope, the page's box, a full-access title only for whoever manages permissions, never another login's email); then the auth server (skipped when the login signs in with it already); then `person_login_email_set` writes `users.email` and the People record only because the login signs in with it, else the login moves back (`moveBackUnlessWritten`, *Try Save changes again.*). Still ten callers: the file is the same.

**THE DEPT MANAGER IS GONE (2026-10-17 — the owner, on the morning's question that a Dept Manager has no Me: "no need, may delete the that templere … 因为基本上后面我就是开新的每一个部门，比如说 finance、HR 等等 … 这个就删掉吧 不需要了", then, asked how far: "全删：连程序一起拿掉"; migs `20261017140000_dept_manager_gone_data` (applied first) and `20261017160000_dept_manager_gone`).** Nobody is of the kind: the Department head template is deleted (MARKETING MANAGER points at Staff · Basic), the kind's role defaults are deleted, and marketing@ is closed — inactive, kind staff, its sign-in banned, NOT deleted (its `access_log` rows are history). **The database:** `current_actions()` gives an account with no template every key at All (the CASE that gave a dept_manager Dept on Dept Pool, OPEX, My Billing, Department reports and Claims is gone — production's body, one expression swapped); the ten policies its pages read and wrote through are dropped (its own dept-expense approvals, Dept Pool requests, the pool's expense insert, invoice requests, invoices ×4, the journal ×2); `dept_pools_pf_select` and both service-contract policies keep only their company-wide branch; `submit_dept_payment_request()` / `submit_invoice_request()` are dropped; `dept_invoice_settlements()` and `mint_invoice_no()` stop naming My Billing; the `my_billing` key and function are retired; **Dept Pool, OPEX and Department reports offer All only** (`permission_functions.scopes` — the test scans follow a later `UPDATE … SET scopes`, `functionScopes()` in `src/test/read-paths.ts`); the tab registry loses `/my-billing` and the Department view's Dept Pool, OPEX, My Billing, Claims, Reports and People boxes (it keeps Overview, My claims, Meeting rooms); `users.role` and a template's `base_role` refuse `dept_manager` (CHECKs — the enum keeps the label for history). **The app:** My Billing and its sidebar *New Contract* are gone — a contract is made from Invoices (Billing · Create), and Dept Pool's *New project contract* asks the same; the department Overview, Dept Pool's own-department page, its request tabs and forms are gone; the reports' own-segment mode is gone — every statement, export and phone report is for Reports · View at All, Department reports opening Cash Flow, Receipt & Payment and Debtor Aging beside it (GlReportView's left rail, `MonthlyMatrix`, `MonthlyReportControls`, `ReportViewToggle` and the months aging went with it); OPEX asks OPEX · View at All; `ownDepartmentOnly` / `raisesDepartmentRequests` became `readsEveryPool` (Dept Pool · View at All — anybody short of it reads no pool, never their own department's); `actionsFromKeys(keys)` takes no kind; `requireRole`, `canAccessMyBilling` and `isDeptManager` are gone, and `UserRole` has no `dept_manager`. **Left as they are:** Finance's inboxes for what the kind raised (`/payments/dept-requests`, `/billing/requests`, their approve / reject functions) — empty from now on; Claims' and Team's Dept reach (a department's claims, the directory) — not the kind's. A department's own view, when it is built, starts from a template and its cells, never from this kind.

**PERMISSIONS · CREATE IS INVITE USER, AND THE DATABASE LETS IT (2026-10-20 — the user, finding only the Principal could invite: HR "supposed to be 是要能够 invite user 的"; the whole rule: `../hr/people.md` › HR INVITES; mig `20261020190000`).** The login is written by `account_attach_login` (DEFINER, `has_any_action(['accounts.create'])`), so a template or a person ticked on HR view › Permissions · Create invites for real; `users_principal_write` (admin scope) is untouched and `hr_staff_permission_guard` lets through only that function's attachment (`app.login_attach`, the same pattern as `app.payroll_lifecycle`). **Know before ticking:** Create lets its holder give a login — the email they type, a password they may set — to anybody active on the roster whose title is not full access; a full-access title (a Principal-kind template, or one ticking Manage permissions) still needs Permissions · **Edit** (Manage permissions), in the app and in the function. A new full-access kind of template is caught by the same two conditions; a template that ticks other strong boxes (Approvals, Switch views) is not full access by this rule — its holders come from whoever HR invites onto it.

**IT REQUESTS — A FUNCTION OF ITS OWN: THE PRINCIPAL'S AND ULTIMATE FULL ACCESS'S (2026-10-20 — mig `20261021020000`; the module: `../revenue/revenue-app.md` › IT SUPPORT).** `it_requests` (Admin; View · Edit; reach all) and its key, scope none — no row policy opens for it: the module's tables are read and written only through its own DEFINER functions, each asking `has_any_action` (listed in `DEFINER_RPCS`; the three readers in `READS_WHILE_VIEWING_AS`). Held by the Principal login (role default) and the Ultimate full access template only — the user: "just principal or ulitmate full access", because a screenshot sent to IT can carry the sender's pay; never the Revenue Director (no Salary tick). The key is in `current_permissions()`'s member-app list; the tab `rev.it_requests` went into the database's registry by name, never a whole reseed. Sending a request and following one's own need no cell.

**THE DORMANT MIDDLEWARE IS SESSION-MIDDLEWARE.TS — NEXT 16 WOULD HAVE SWITCHED IT ON (2026-10-21, the move to Next 16):** the root `middleware.ts` (session refresh, and every request without a session redirected to `/login`) was never loaded by Next 15, because the app lives in `src/` (found 2026-09-27; CLAUDE.md › Architecture). Next 16's Turbopack build loads it: the build listed `ƒ Proxy (Middleware)`, the Cloudflare worker's smoke request to `/api/wasm-health` came back as the sign-in page, and on the Vercel preview, with nobody signed in, `/g/<code>` (the guest link, `../hr/rooms.md`) and `/welcome` (an invitation, `../hr/people.md`) answered 307 → `/login`, where production answers 200. It is renamed `session-middleware.ts`, unchanged otherwise, so the portal runs as it did: no middleware, every page gating itself (`requireAuth`). `src/lib/no-active-middleware.test.ts` fails on a `middleware.*` or `proxy.*` at the root or in `src/`. Switching a middleware on stays its own decision — and its matcher would first need `/g/` and `/welcome`, which it does not exclude. `login-middleware.test.ts` and `sign-out-scope.test.ts` read the renamed file.
