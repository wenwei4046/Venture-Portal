# Member SQL regression checks

This isolated package verifies the Revenue member migrations in a fresh, in-memory PGlite database. It does not change the application package dependencies, load `.env` files, contact Supabase or mutate a live database.

Use Node.js 20 or later. From the repository root:

```sh
npm ci --prefix tests/member-sql
npm test --prefix tests/member-sql
```

The lockfile pins PGlite 0.5.8. Dependency installation requires the npm registry; the test itself uses local package assets and repository SQL only. Migration paths are resolved relative to `import.meta.url`, so the test has no user-specific path or working-directory dependency.

The default command also runs the director reporting regression in
`validate-director-reporting.mjs`. It loads the real reporting guard, company
ladder, cycle and commission synchronization functions, then applies the
director reporting migration. Its 54 checks cover company leaders as director
managers, unchanged ordinary-member restrictions, title/department transitions,
no director memberships or overrides, and cycles through every assigned home
director. Run only these checks with
`npm run test:director-reporting --prefix tests/member-sql`.

The default command also includes 37 checks in
`validate-ir-specialist-downlines.mjs`. They verify IR Specialists can lead
same-title peers while Fair permissions, rates, scheme limits and existing
memberships stay unchanged. Real membership triggers reject IR cycles and a
fourth direct line, including people with simultaneous Fair/IR positions;
opposite reporting lines in separate schemes remain valid. Run only these
checks with `npm run test:ir-specialist-downlines --prefix tests/member-sql`.

The default command also runs the catalogue regression in
`validate-catalogue.mjs`. It applies the four catalogue migrations
(`20260924020000`, `025000`, `030000`, `040000`) verbatim, after the three
that shaped the tables they reshape, with Supabase's default grants
reproduced. Its 164 checks cover the items-only mirror (ERP money stripped from
every `raw` at any depth — the gap 020000 left and 030000 closes, a price tier
kept as the label it is — in-place re-delivery, `full` retiring only what a
carried and non-empty section omits, customer and supplier combos skipped), first-sight
adoption of the old Product List (bridge code, own code, the mattress rule and
its ambiguity guards) that never overwrites a typed price, the portal's prices
costing each sales line (grid cell by seat height and fabric tier, option
surcharges, NULL cost with a reason, `manual` left alone), sofa combos applied
at commit, recost (counting only the lines whose cost moved) with its 23RUN
refusal, the Costing gaps reasons, and `member_catalogue`'s offer rules (a
mattress with no known brand is never a rider; the Rider override is),
dropdowns (an empty ERP list is the ERP's "no restriction"), pricing and
service-role-only access. Run only these checks with
`npm run test:catalogue --prefix tests/member-sql`.

The default command also runs `validate-kpi-add-ons.mjs` (Product List ›
Costing Setting and › Add-on / KPI Items, 2026-09-27). It applies
`20260927050000` verbatim over the foundation's `comm_kpi_items` and checks the
new constraints (one live row per special however it is spelled, one ratio per
code), `comm_kpi_hits` (a SKU by code, a bed frame special per bed frame from
`raw.variants` or the ERP's description grammar, a sofa special once per bill,
the category guard, the as-at date, and no KPI on a bill whose sales do not
cover it), and that `revenue_month_orders` and `member_order_facts` take the
same amounts off and divide each line's cost by its SKU's own ratio. It also
drives the tabs' two writers: `catalogue_save_cost_setting` (a SKU's code read
from the SKU master, a renamed SKU followed, an unchanged ratio not a write)
and `catalogue_save_kpi_items` (a special stored as its pool spells it, adds
from today, a new amount or a removal of an item begun before today closed
yesterday, one begun today changed or deleted where it stands, another
sub-department's row refused). Run only these checks with
`npm run test:kpi-add-ons --prefix tests/member-sql`.

The default command ends with `validate-app-audit.mjs` (the app-wide history,
2026-10-08). It applies `20261008190000` verbatim over PR1's `audit_events` and
trigger (its md5 is the migration's guard), the old `config_audit_log` with rows
and the triggers that wrote it, and one table of each kind the register sorts.
Its 96 checks cover the register (people-only tables fire for a signed-in
person only, a table left out says why, a stray trigger on one is switched
off), the old log folded in (rows copied, one group per old save, its triggers
switched off — nothing dropped), who is recorded (a person, the server naming
its person, the database), what is kept (no-op and updated_at-only saves are
not; wide tables keep what changed; the ERP's raw document is never copied),
a payroll voucher's family needing Payroll payouts, and reading by the reader's
own permissions — tables by `read_keys`, salary / NRIC / bank blanked by
`current_sensitive_fields()`, filters and pages. Run only these checks with
`npm run test:app-audit --prefix tests/member-sql`.

The default command ends with `validate-permission-actions.mjs` (each action
takes effect, 2026-10-08). Over PR1's world and migrations plus the audit
migration it applies `20261008200000` verbatim; its 36 checks hold the shared
accounts to exactly their keys' actions (the Principal everything, Finance no
Treasury · Approve, HR the titles and ladder but no logins, a department
manager at Dept), a titled person to exactly their template's cells with their
own cells over them, `has_action()` to the reach asked and to the keys that
open the function's pages (a Director's Approve waits for the Approvals key,
HR Costing without Salary amounts edits nothing), and nobody, a disabled login
and the publishable key to nothing. Run only these checks with
`npm run test:permission-actions --prefix tests/member-sql`.

Expected final output:

```text
PASS: 801 member SQL checks. Disposable synthetic auth/payroll/Storage; real Revenue and member migrations. No live database connection.
```

The process exits nonzero on a failed assertion or SQL error. The same two commands can be used in CI; no database service, credentials or browser is required. Keep this package's `node_modules` and any `.env` files untracked.

The Insight checks in `insight-checks.mjs` load a scenario of their own —
revenue held under the deposit gate, an order carried in from last month, one
already released by a run, a non-commissionable item group and an order with no
cost — and verify that the live figures count exactly what the engine would,
that the board lists every member including those with no orders and no user
account, that the downline never contains the caller, that a requested month is
clamped to the present, and that no commission, rate or salary reaches any of
it. The scope guards are switched off only while the fixture is loaded.

Coverage includes own-data privacy, neutral member permission boundaries, claim attachment/hash/idempotency and revision linkage, memo acknowledgement, cross-department waiting requests, capacity reservation/allocation and the service-only scheduled queue worker. The actual legacy HOME Fair roster synchronization functions are exercised too.

The 27 additional legacy-boundary checks replay the real payment attachment
policies and the original `claims_submit` policy. They demonstrate the prior
authenticated-user access, then verify that active and inactive Revenue members
cannot read/upload payment attachments or directly insert claims. All four prior
roles retain their existing access, service-role Storage access remains intact,
and the verified member invoice-to-claim workflow still succeeds with owner-only
invoice visibility. These remain database policy checks against synthetic
Storage/auth scaffolding, not hosted file upload tests.

The Principal Revenue View checks in `principal-view-checks.mjs` apply the ninth
member migration and exercise it as an authenticated Principal without any staff
link. They cover the real account identity, a full roster including unlinked
staff, an empty IR scheme, unchanged member privacy, and rejection of inactive,
revoked, other-role and anonymous access. Aggregate checks use stored statement
components across Fair and IR, reject overlapping group revenue as team sales,
and preserve period/status separation. Catalogue checks require explicit product
publication and current active Fair brands without exposing cost fields. Order
checks cover service-fee exclusion, free KPI cost, manual margin, missing cost,
unassigned staff, cancelled/uncommitted orders and Fair-only scheme association.
Requests exclude drafts; Principal memo receipts remain separate from members.
No salary is inferred, no collective target/rate is invented, and overlapping
statement brand summaries are deliberately not reported as team brand margins.

The Principal function parity checks in `principal-parity-checks.mjs` verify
explicit read contexts for Insight, KPI, Arena and OrgMap. Shared calculations
preserve employee results across the refactor, including historical Insight and
monthly, quarterly and annual Arena totals. Selected staff reads require the
stored active Principal role, an active Revenue department and scheme, and a
current, date-eligible staff membership. Tests reject forged role claims,
unrelated or missing membership, department heads and inactive or expired
contexts; unlinked eligible staff remain viewable. Principal identity stays
unchanged, all Principal self flags remain false, and the map retains sibling
branches. Internal helpers deny direct execution, employee permission revocation
still works, and the staff identity and self-service write functions remain
unchanged. Principal reads cannot submit member requests or save their brand weeks.

`insight-group-checks.mjs` reproduces lowercase and padded ERP groups returning
false zero sales before the matching correction, while excluded service fees
remain excluded. `performance-facts-checks.mjs` verifies shared document facts
across Insight, Arena and recent Income orders: latest committed source wins
before cancellation/owner/date filters; release months are department-scoped;
unreleased carry belongs to the current open month. It covers rounded deposits,
enabled KPI rules at recognition month end, goods-only margin with missing
costs and nonpositive revenue, unchanged Arena periods, and the 200-order display
cap alongside complete totals. Recent Income lists retain their source-month
window while sharing each order's sales and goods-margin calculation.

Auth/users, payroll and Storage scaffolding are synthetic. Selected existing Revenue migrations and every new member migration execute from repository files. This is not a full replay of the entire production migration history, a hosted Storage integration test or a multi-connection concurrency test. See [the verification handoff](../../docs/member-verification.md#sql-verification-record) for the numbered assertions, boundaries and remaining deployment checks.

The default command ends with `validate-definer-login.mjs` (security,
2026-10-09). It builds production's `current_user_role()` byte for byte with
Supabase's own default grants, a writer and a reader guarded the way ~60
production functions were (`IF v_role NOT IN (…)`), a row policy's helper, a
trigger and a server-only function; shows the hole first (the publishable key,
a sign-in with no portal account and a switched-off account all pass the
guard), then applies `20261009000100` verbatim. Its 26 checks: the publishable
key calls no DEFINER function but the policy helpers (which answer "nobody"),
a sign-in without an active account is refused everywhere, an active account
and the service role notice nothing, a trigger and a server-only function keep
their grants, a function made later is never anon's, and a second run is a
no-op. Run only these checks with
`npm run test:definer-login --prefix tests/member-sql`.

`validate-permission-actions.mjs` also covers approvals by domain
(`20261009010000`, 2026-10-09): after the security hotfix it builds the
approval world (request types, requests, payroll runs, loans, bank accounts)
and the ten approval functions as stand-ins carrying production's exact role
check, shows a Checker approving nothing before, then applies the migration
twice (the second run a no-op). Its 29 further checks: hr@ no longer says it
approves payroll runs and the Principal still holds all three through the
queue's key; the shared accounts decide nothing; a Finance · Checker decides
Treasury's requests — a Maker's voucher, a loan with its voucher, a booked
loan only behind its approved cancellation — never their own, never in
somebody else's name, never a group holding a payroll run; a Director decides
everything in the queue; the Executive office reads it and decides nothing;
row policies keep a Checker off their own request and hr@ off bank balances;
with no sign-in the old Principal-only rule stands.

`validate-erp-change-trail.mjs` covers the ERP audit trail (`20261013010000` and
`20261013020000`,
2026-10-13). It builds the world the migration meets — the receiver verbatim
from `20261012200000`, `erp_sync_note_adjustment` verbatim from
`20261003170000`, August settled by hand with ZNT6185's claim-form RM 15,700
held by the ERP as two documents (RM 8,000 + RM 7,700) — drives the old rule
first (the two false drops the user saw), then applies the migration twice.
Its 57 checks: the receiver swapped from production's body (14 ways out
through `erp_sync_after_delivery`, the pending question no longer deleted on
an applied write); the held deliveries' trail rebuilt (a status change, a
drop, a cancellation, each document's own part of the paper); the waiting
questions asked again — ZNT6185's gone, the real ones with why and what gave
the commission; a split paper's real change asks only its own part; "Not a
change" sets the figure later changes are measured from; an open month's
bill opened, re-sent unchanged (no row), dropped, re-statused and re-charged
for transport (changed, not a drop); a salesperson's close keeps the bill's
value on its release, a later change is a drop payable from the next month
(23ADJ in the close's own), a cancellation deducts what is still given, a
reinstatement asks nothing, a reopened close takes its question back and a
new close asks it anew; a hold, a deletion and a document never held; and a
fault in the trail never fails its delivery; and (`020000`) a row points at a
question only when it moved what earns — the drop that opened it, never a
later save of a status. Run only these checks with
`npm run test:erp-change-trail --prefix tests/member-sql`.

The default command also runs `validate-director-hv-share.mjs` (Director
Salary: HOUZS Venture's own share, `20261013170000`). The migration runs
verbatim over stand-ins for the roster, departments, invoices, receipts, the
dept pools and the journal, with production's bodies for the triggers and
helpers it leans on (the CTC total, a receipt marking its invoice paid, the
source rows' sum, the journal, a receipt's pool reversal). Its 72 checks: who
may call what (no publishable key, the helpers and tables closed to sessions);
HR's save by percentage — each line to the sen, the rounding on the biggest
percentage — and by amount with the ER keyed by hand, every refusal (short of
100%, a sen short, a department twice, none, a month not its first day), and
who may (Director Salary · Edit to save, · View to read; Finance neither);
Finance's list without the components; Transfer — an invoice to each paying
department's pool dated the payroll month's last day, its two journals
(Venture Office's in `corporate`), a receipt by netting on the transfer date
numbered past one taken elsewhere, the primary and mirror source rows, each
pool pair under its receipt, the Director department's own line moving
nothing, the page's guard asked; HR's lock after it (the same figures a no-op,
a change refused); Undo — voided, every journal reversed in a pair, the pools
back, the share waiting again; and the locked months, the payroll month's and
the transfer date's. Run only these checks with
`npm run test:director-hv-share --prefix tests/member-sql`.
