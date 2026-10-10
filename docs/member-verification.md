# Revenue member backend verification and deployment handoff

This document records implementation, verification and operational requirements. [DESIGN.md](DESIGN.md) remains the sole UI/UX specification. UI interaction QA and production build results are recorded separately below when completed; backend tests do not establish those results.

## Backend files and contracts

| File | Responsibility |
| --- | --- |
| `src/lib/member/server.ts` | Session checks, scoped snapshot, private current-cost quotation, verified invoice upload, requests, memo receipts and HR action wrappers. Imports `server-only`. |
| `src/app/(member)/member/actions.ts` | Server Actions and affected-route revalidation. |
| `src/app/api/member-queue/route.ts` | Fail-closed authenticated machine endpoint for scheduled queue processing. |
| `src/app/api/member-queue/route.test.ts` | Machine endpoint authorization, response and failure tests. |
| `supabase/migrations/20260912010000_revenue_member_role.sql` | Neutral `revenue_member` enum value. |
| `supabase/migrations/20260912020000_member_self_service.sql` | Permission definitions, private tables and invoice bucket, RLS, internal identity/projection helpers. |
| `supabase/migrations/20260912030000_member_read_models.sql` | Member snapshot, authorized hierarchy, public product/version metadata, Fair quote context and memo read/ack. |
| `supabase/migrations/20260912040000_member_request_workflows.sql` | Validated drafts/revisions, idempotent claim linkage, request audit, capacity guard and waiting reservations. |
| `supabase/migrations/20260912050000_member_hr_management.sql` | HR review, candidate binding/creation, allocation verification, capacity configuration, Principal product publication and memo publication. |
| `supabase/migrations/20260912060000_member_permission_boundary.sql` | Caps neutral member permissions even when its title or per-user overrides contain broad management permissions. |
| `supabase/migrations/20260912070000_member_queue_worker.sql` | Service-role-only serial queue sweep and private run audit; no external schedule is installed by the migration. |
| `supabase/migrations/20260916010000_member_insight.sql` | The `member_insight` permission and its place in the neutral member allowlist; `member_scoreboard` (live commissionable performance per salesperson for a scheme-month), the department and downline boards over it, `member_insight_snapshot` and `member_org_map`. All read-only, all `SECURITY DEFINER`; the scoreboard and both boards are revoked from every role and reachable only through the two granted snapshots. |
| `src/lib/member/insight.ts` | The arithmetic the three Insight screens read: blended margin, competition ranking, gate progress, streak state, margin levels, downline branches, month pace. Pure, unit-tested. |
| `src/lib/member/org-map-layout.ts` | Where every card, frame and line sits on the team map, over the shared `layoutTree`. Pure, unit-tested. |

`loadMemberData()` returns `MemberData` directly. Other functions return `{ ok: true, data }` or `{ ok: false, error }`; `refreshMemberData()` is the action wrapper for refresh. Production configuration failures return an unconfigured state, never demo business data.

`submitMemberRequest(FormData)` accepts `kind` and `subDepartmentId`. Waiting requests use `targetDepartmentId` as the intended department; since 2026-10-10 they may also carry `answers` (JSON of the form's own questions, at most 40, cleaned by `waitingAnswersFrom`), `formVersion` and `signedForm` (the signed application form, a JPG/PNG/PDF file) — or, on a revision only, the earlier `signedFormName` / `signedFormHash`. New submissions use `idempotencyKey`. Revisions use `requestId`: the server reads the existing key and the RPC locks the owned `needs_info` request, validates the replacement payload and reuses the same row. Retrying the same submitted revision is idempotent. Claim revisions require an invoice again and update the existing **pending** claim; approved/paid/rejected claim values cannot be overwritten.

`adminMemberAction` accepts the exported `AdminMemberInput`/`AdminMemberCommand`; `action: 'list'` returns `AdminMemberData`. Commands include `set_capacity`, `process_queue`, `needs_info`, `reject`, `qualify`/`approve`, `accept`, `bind_candidate`, `create_candidate`, `allocate`, `execute`, `invoice`, `signed_form`, `publish_memo` and `configure_product`. `accept` requires `applicantConfirmed: true`. `create_candidate` uses `titleId` and optional `uplineStaffId`; only accepted, unexpired HOME Fair reservations may use this atomic path. `bind_candidate` uses `staffId`, verifies the named applicant and accepts approved replacements or live waiting reservations. Request detail includes `allocatedStaffId` for UI state.

## Security and data boundaries

- Identity is derived from the logged-in account and its linked active `hr_staff_costs.user_id` record in a commission department. Callers cannot choose the snapshot staff ID.
- The snapshot exposes the caller's salary/commission/orders and authorized hierarchy. The department directory exposes only `id`, `name`, `capacity`, `occupied` for active sub-departments in that staff member's Revenue department. It does not grant membership in those departments.
- The neutral role resolves only `member_portal`, `member_quote`, `member_requests`, `member_memos`, `member_insight`; their permission scopes are `none`. Broad title inheritance and broad per-user grants cannot elevate this role. Existing roles retain their prior permission resolution. No provisioning RPC is required.
- Public products and RPCs omit unit costs. The server reads selected current costs only after Fair membership authorization, validates main/gift metadata and size compatibility, and uses the shared calculator. `customerText` is generated with those same current product rows. Product/version JSON formatting matches the server version pair.
- Precise margin and price mathematically reveal the selected combination's total cost; this is the inherent boundary explained in DESIGN.md, not a promise of absolute cost secrecy.
- `member-invoices` is private, limited to 3 MB per JPG/PNG/PDF. The server inspects file bytes/MIME and records SHA-256. Only the server service role can attest an attachment; the submission RPC requires that attestation and stored object to match the current request hash. Corrected invoices retain old private objects for history. Signed reviewer URLs expire after 120 seconds.
- A waiting list's signed application form (2026-10-10, mig `20261010180000`) is kept exactly as an invoice is: same bucket and limits, the member's own folder under their draft waiting request (the insert policy allows `kind IN ('claim', 'waiting')`), bytes inspected, SHA-256 recorded as `detail.signedFormHash`, attested only by the service role. `member_submit_request` refuses a waiting list without that attested object while the latest `member_waiting_forms` row has `require_upload`; `member_prepare_request` refuses one missing an answer to a required question of that form. HR opens it through `adminMemberAction({ action: 'signed_form' })` (a 120-second link); the member downloads HR's own application form through `loadMemberWaitingFormLink()` (600 seconds, asked for at the press, never kept on the phone).
- Claim approval/rejection/payment uses the existing Claims flow. Member HR management can request information from a pending claim, but cannot create an alternative payout approval path.
- Memo read and acknowledgement are separate, idempotent timestamps tied to immutable publication version and authorized audience. A publication creates a new row; old acknowledgements are retained.
- Insight reports another member's name, title, sales, order count, KPI units, margin and last order date. It never reports anybody's commission, commission rate or salary, the caller's included: pay stays in the statement, which only its owner, HR and the Principal can read. `member_org_map` reports names, titles, staff codes and reporting lines, and no pay of any kind. Both are read-only and resolve the caller from the session, never from an argument.
- Insight's figures are estimates from committed orders and are labelled as such on every screen. They apply the deposit gate and carry-forward exactly as the engine does, so a figure shown here is the figure a run would compute from the same orders; the statement remains what pays.

## Migration and setup order

Apply the complete existing repository migration chain, including the 20260911 commission changes, before the seven member migrations listed above. Apply member migrations in their filename order. **Commit `20260912010000` before applying migrations that use its enum value**; do not concatenate them into one transaction. No migration was applied to a live database during this implementation.

Before enabling live member access:

1. Configure the existing session environment (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) and server-only `SUPABASE_SERVICE_ROLE_KEY`. Never place the service key in a public variable or client bundle.
2. Link each account to its correct staff record, assign the neutral role and establish effective Revenue membership/title/rank. Missing/inactive staff fail closed.
3. Grant HR the dedicated management permissions where a configured title overrides its role defaults. Principal is explicitly authorized; ordinary member permissions do not grant management access.
4. Principal maintains costs through the existing product list and publishes selling metadata through member administration. A cost-list row is not automatically available to members. No production costs or product options are seeded.
5. Configure actual department capacities. `28` is not a seeded policy. Without a configured cap, the system does not reserve waiting-list positions automatically.
6. Verify uploaded invoice access using a hosted test member and HR account, run an actual pending claim/revision, and verify it reaches the existing claim approval/payment workflow.
7. Configure the authenticated queue schedule below on the actual hosting platform and verify its run audit. Confirm the actual waiting form, priority policy and applicant confirmation process with the business owner before treating the initial field set as a complete copy of an existing form.

## Automatic queue behavior and schedule setup

The implementation provides event-driven automatic reservation plus a runnable authenticated time-based sweep. Eligibility review places a request in `waiting`. Eligible applicants are ordered by `created_at, id` within their intended department and cannot be reserved before their requested start date. Capacity is checked under a department advisory transaction lock; reservations hold the same seat as any subsequently linked active membership and expire after 72 hours.

Queue processing currently runs when:

- HR qualifies a waiting request or changes department capacity;
- a `comm_hierarchy` insert/update/delete commits, including a released position;
- HR rejects/returns an open reservation and releases its seat;
- HR selects **匹配空缺** in `/member-admin`, which calls `adminMemberAction({ action: 'process_queue', subDepartmentId })`.
- An authenticated scheduler calls `GET /api/member-queue`, which invokes `member_process_all_queues()` with the server service-role client — and, since 2026-10-10 (mig `20261010170000`), `member_run_due_replacements()`: every replacement HR scheduled whose effective date has come is carried out, each on its own (a refusal is written on its request for HR). The waiting list no longer reserves seats (mig `20261010140000`), so the queue half finds nothing to reserve.

An ordinary vacancy mutation starts automatic matching immediately. The scheduled sweep covers calendar-only events: future-dated membership closures, newly eligible start dates and reservation expiry. `member_data_snapshot()` stays read-only. Without configuring and deploying a schedule, those calendar-only events still wait for a roster/HR action; code availability is not evidence of an active online job.

The worker requires `CRON_SECRET`, a random value of at least 32 characters without surrounding whitespace. It accepts only `Authorization: Bearer <CRON_SECRET>`; session cookies, query tokens and ERP headers do not authorize it. Missing/weak configuration returns 503; missing/wrong credentials return 401 before creating a service client. Only the exact endpoint path is excluded from login middleware. All responses use `Cache-Control: no-store`.

The RPC is executable only by `service_role` and also checks the signed JWT role. It processes active capped departments serially, uses a global advisory lock to skip overlapping sweeps, and retains the per-department locks shared with interactive HR/roster writes. Repeating the sweep does not duplicate reservations. A department failure rolls back that department's changes and records its diagnosis in private `member_queue_runs`; healthy departments continue. The HTTP response exposes counts/run ID only, with 500 on a partial/failed run so monitoring can flag a retry. Ordinary members cannot read the audit or invoke the sweep RPC.

Choose exactly one schedule on the actual host. The repository includes `wrangler.jsonc` and default Cloudflare deployment scripts as well as `vercel.json`; no live hosting platform was inferred or changed. The endpoint is ready for either host after its Node-compatible deployment and secrets are configured.

- **Vercel deployment:** optionally add a `crons` entry to the existing `vercel.json` for `/api/member-queue`, then deploy and confirm it appears in the project's Cron Jobs settings. A daily schedule at `0 0 * * *` targets 00:00 UTC / 08:00 Malaysia; choose a more frequent schedule if the hosting plan and expiry-response requirement call for it. Set `CRON_SECRET` in the production project environment; Vercel supplies it in the Bearer authorization header. This optional schedule was not committed because the live host is unknown. [Vercel cron setup](https://vercel.com/docs/cron-jobs/quickstart), [Vercel cron authentication](https://vercel.com/docs/cron-jobs/manage-cron-jobs).
- **Cloudflare deployment:** this Next.js route is an HTTP target, not a Cloudflare `scheduled()` handler. Configure an approved authenticated scheduler to call its production HTTPS URL, or add a separate host-specific scheduled handler in the deployment entry point. Do not assume an unused `vercel.json` creates a Cloudflare trigger. Keep `CRON_SECRET` in the scheduler's secret storage and send it in the authorization header, never in the URL or a client bundle.

Optional Vercel entry to merge into the existing configuration on that host:

```json
"crons": [{ "path": "/api/member-queue", "schedule": "0 0 * * *" }]
```

After setup, invoke the scheduler once, require a 200 `complete` result and a completed private run-audit row, then verify the next scheduled invocation. Monitor non-2xx/partial runs and retry after correcting configuration or the failed department; the sweep is safe to repeat. A daily trigger means a calendar-only change may wait until the next daily run; higher-frequency expiry requirements need a correspondingly tighter host schedule. No automatic retry policy is assumed.

**Operational fallback:** HR can run **匹配空缺** for each capped department while a schedule is unavailable. Fully unattended time-based matching is implemented in code but remains conditional on that explicit deployment setup. Applicant acceptance and HR onboarding requirements still precede activation; automatic matching does not authorize creating unconfirmed active staff.

An accepted applicant already installed in the roster is marked allocated when its expired reservation is processed, preventing an occupied seat from becoming a stranded second queue slot. Ordinary unfulfilled expired reservations become `expired` and require HR reassessment before rejoining the queue. No arbitrary priority scoring, push/SMS notice, or automatic company account creation is implemented.

## SQL verification record

The final disposable PGlite run passed **74 counted checks**: the initial 55 member checks plus 19 queue-worker checks. Every new member migration ran verbatim, together with the relevant real Revenue migrations. Auth, users/payroll and Storage scaffolding are synthetic; the service role models Supabase's RLS bypass. The production `comm_floor_rank`, `comm_sync_position` and `hr_staff_one_line_sync` function bodies are additionally loaded to exercise actual HOME Fair creation and upline behavior.

The numbered ranges below correspond to assertion order in the checked-in SQL harness; they are not claims of 74 independent end-to-end browser tests.

| Checks | Exact counted coverage |
| --- | --- |
| 1–9 | Own salary; current membership count; peer excluded from tree; own child included; own income only; own order count; computed 50% order margin; no product cost field; unrelated private commission amount absent from snapshot. |
| 10–13 | No HR/admin/treasury scope; product version equals database JSON timestamp pair; scope remains absent after hostile title/broad per-user grant; member snapshot still works. |
| 14–18 | Member denied admin snapshot and arbitrary internal request projection; authorized Fair bands returned; quote context omits unit costs; invalid scheme rejected. |
| 19–27 | Claim requires attested invoice; changed payload cannot reuse submission key; valid submission status and claim link; repeat submit reuses claim; other member cannot submit/read attachment/read object; exactly one claim exists. |
| 28–34 | Other member cannot revise; revision preserves request ID; old attachment hash cannot satisfy corrected invoice; corrected submit retains claim ID; retry remains submitted; one claim remains; corrected pending amount is persisted. |
| 35–37 | Principal product list is present without cost field; admin request list contains expected request. |
| 38–41 | Opening memo does not acknowledge; explicit acknowledgement recorded; repeat acknowledgement preserves timestamp; member cannot publish memo. |
| 42–45 | Missing applicant consent rejected; Fair-only member sees IR in public directory; directory keys are restricted; waiting draft may target IR without IR membership. |
| 46–47 | Qualified request remains waiting at full capacity; deleting an occupied position automatically reserves the waiting applicant. |
| 48–49 | Installed accepted candidate does not count twice against the same capacity; an already installed applicant cannot be sent back for information. |
| 50–54 | Accepted/linked candidate allocates; final occupancy respects cap; actual legacy roster sync creates one membership; selected upline is retained; member sees expected own request count. |
| 55 | Inactive account is denied the member snapshot. |
| 56–59 | Member cannot invoke sweep or read audit; anonymous role cannot invoke sweep; service SQL role with the wrong JWT role is denied. |
| 60–64 | Worker completes with zero premature reservations; future-start applicant stays waiting; changing only eligibility date lets a subsequent sweep reserve that applicant. |
| 65–69 | Expiry sweep reserves the next applicant and marks the first expired; next applicant is reserved; duplicate sweep adds zero reservations; four completed audits exist. |
| 70–74 | Injected invalid department data produces partial status and one failure while the healthy department processes; public result omits error details; private audit identifies the failed department. |

The run also executes HR qualification/acceptance, actual roster creation, directory generation and all migration definitions. Successful execution of those statements is useful coverage, but is not counted as separate assertions above.

### Rerun the portable SQL harness

The checked-in harness is [tests/member-sql/validate-member.mjs](../tests/member-sql/validate-member.mjs), with a separate private package and lockfile. It does not change the main application's dependencies. See [its README](../tests/member-sql/README.md) for CI and runtime requirements.

It pins PGlite **0.5.8**, starts a fresh in-memory database for each run and never reads the application's `.env` or opens a Supabase connection. Migration paths resolve relative to the script's `import.meta.url`, with no machine-specific path. From the repository root:

```sh
npm ci --prefix tests/member-sql
npm test --prefix tests/member-sql
```

Expected final output:

```text
PASS: 74 member SQL checks. Disposable synthetic auth/payroll/Storage; real Revenue and member migrations. No live database connection.
```

The same commands run in CI with Node.js 20 or later and no database credentials. Installation fetches the pinned package; test execution uses local files only. The package-local `.gitignore` excludes dependencies and environment files. Preserve the fixture/real-migration distinction when reporting this suite; it is not a complete production migration replay.

The endpoint test command `npx vitest run src/app/api/member-queue/route.test.ts` passed **12 tests**: three unset/weak/malformed secret cases, four missing/alternative credential cases, successful dedicated RPC/no-cache response, private-data-free partial failure, overlap skip, sanitized SQL error and missing server-client configuration. It mocks the service client and does not call a deployed endpoint.

TypeScript validation passed using `npx tsc --noEmit --incremental false` after the queue endpoint/tests were added. No production build or browser test result is implied by that command.

## Limits to verify before live rollout

- Hosted Supabase Auth/session behavior, Storage object policies, upload byte checks through the real server action, and signed URL expiry require hosted test accounts. PGlite validates the SQL policy scaffolding, not the Supabase HTTP services.
- Multiple concurrent database connections competing for the final seat have not been exercised by this single-connection PGlite run. Advisory locks, deferred capacity constraints and retry behavior must be tested under actual PostgreSQL concurrency.
- Approved-claim revision denial, replacement self/downline boundaries, replacement execution checks, signature-image validation and server-side gift/size rejection exist in code but are not independently covered by the 74 SQL assertions. Calculator/UI tests are a separate verification record. The worker's calendar/expiry transitions are covered; multi-connection overlap is not.
- HOME Fair candidate creation is atomic with the existing roster trigger. The legacy data model automatically assigns new Revenue staff to HOME Fair; direct IR candidate creation is therefore blocked. HR must use the existing People workflow, bind that person, establish the intended IR membership and then confirm allocation. This implementation does not refactor the legacy home-membership model.
- Replacement approval records a plan. `execute` verifies that the original exit/transfer, successor membership and any company resignation were actually completed in existing People/Revenue flows; it does not itself perform all roster/account/settlement mutations.
- Request state history records status transitions and reviewer notes. The original waiting-list form, identity verification of a third-party signatory, withdrawal workflow, invoice retention/cleanup policy and operational queue priority rules are not fully implemented business policies.
- `refreshedAt` is snapshot fetch time, not proof of ERP synchronization. Live order margin uses the latest committed data available in this database; income rows come from computed/applied commission snapshots.

## UI QA and build verification

Completed in the Codex in-app browser against the local Next development preview, with synthetic data and no real employee submissions.

| Check | Result |
|---|---|
| Main views | Today, income, quote, team, account, requests and memos checked at 320, 360, 390, 768, 1024 and 1440 px: 42 view/width combinations, no document horizontal overflow |
| Short landscape | 844 × 390: side navigation scrolls, lower actions remain reachable |
| Visual inspection | Mobile/desktop home, quote, income, team, request forms/review, login, dark theme; fixed quote dock and form dialogs inspected |
| Quote | Gift color selected at zero quantity then added; add/undo offer; delivery excluded from margin; Queen→King removes incompatible gifts; invalid zero price; unavailable SKU disabled; customer preview/copy contains product specification and total, no internal margin/commission |
| Income/team | Month switch; hiding income masks salary, totals and monetary KPI amounts; hierarchy/list/search; IR changes income/targets/team and removes Fair calculator/margin/KPI modules |
| Requests | Claim file type and date order errors; image preview; edit/review preserves fields and attachment; local submit; Replacement transfer/review; needs_info correction keeps DEMO-0903 and original date; Waiting typed and actual drawn signature; blank/re-entered drawing rejected |
| Memo | Reading does not acknowledge; explicit acknowledgement updates status/badge; read/ack remain distinct |
| Admin | Replacement binding and execution acknowledgement, event history, waiting acceptance→title/upline creation→allocation, Fair occupancy 28 and reservation 0, local memo publication and product option edit |
| Login | Invalid synthetic credentials return generic error; email is visually retained, password cleared; pending submit disabled; show-password toggle; unauthenticated /member redirects to /member/login |

Issues corrected during QA included extreme-narrow header overflow, duplicated mobile quote results, price currency wrapping, gift variant loss at zero quantity, incomplete request review fields, needs_info alias/transfer prefill, request ID reuse, stale customer product text, signature mode reset, misleading attention count and short-window navigation clipping. Screenshots were inspected in the browser; the table is a record of performed checks, not a guarantee about every device/browser.

Verification commands completed:

```text
npm run test:ci               94 test files passed, 3 skipped; 1,252 tests passed
npm test --prefix tests/member-sql   74 SQL assertions passed
npx tsc --noEmit --pretty false      passed
npm run build                      passed
npm run verify:worker               passed, including 4 WASM bundle checks and PDF geometry smoke
git diff --check                    passed
```

The 12 queue endpoint tests and 93 calculator tests are included in the 1,252 total. The production worker build emitted existing lint warnings, an OpenNext Windows compatibility warning and a non-fatal `color-string` copy message; it exited successfully and the local workerd PDF smoke passed. This does not replace hosted employee-account, Storage or multi-session concurrency testing. Later final changes to preview framing, attention count and short-height CSS were checked by TypeScript and browser inspection; they do not change worker/server behavior.

The final member UI uses deterministic cost/rule-checked offer suggestions. It does not call a language model, and no real quotation, memo, personnel change or payment was sent during browser QA. Native iOS/Android soft keyboard, system push and OS text scaling were not exercised by the in-app browser viewport checks.

Local review URLs:

- Desktop: `http://127.0.0.1:3007/member/preview`
- Mobile frame with the actual responsive app: `http://127.0.0.1:3007/member/preview?device=phone`
- HR: `http://127.0.0.1:3007/member/preview?admin=1`
- Login: `http://127.0.0.1:3007/member/login`

If the local preview process is stopped, start it from the repository with PowerShell:

```powershell
$env:NEXT_DIST_DIR = '.next-member-preview'
npm run dev -- --port 3007 --hostname 127.0.0.1
```

The dev server binds only to the local computer. The public-facing service has not been deployed; real staff access and an actual-host queue schedule require the setup above.

## English and Hero Card/cart revision

This revision replaces the Fair quote selector with product Hero Cards, accessory-linked free gifts, **Add to cart**, and a separate Calculator with direct numeric input and an on-screen keypad. English labels cover the member screens, accompanying request-management interface, synthetic data, calculator/customer output and member-facing server errors. It does not add a photo upload workflow: optional product images have safe URL handling and a visible placeholder, pending the owner's later Principal photo/costing setup.

The earlier UI QA and 1,252-test build record above belong to the initial release. The final revision checks below record verification of the new English/cart interface separately.

Preliminary checks completed for the shared data/calculation changes:

```text
npx vitest run src/lib/member/calculator.test.ts   128 tests passed
npx tsc --noEmit --pretty false                   passed at integration checkpoint
git diff --check -- src/lib/member                passed
```

The 128-test file includes the prior 93 money, tier, version and customer-output tests with updated English assertions, plus 35 cases covering cart merging/immutability, aggregate quantities and cost, mixed paid products and sizes, matching fitted gifts and orphan removal, all four synthetic mattress sizes/accessories, gift-flag tampering, 30-line/100-unit limits, brand and availability checks, legacy category/size compatibility, pillow suggestions and safe/unsafe image URLs. These are unit tests; they do not establish hosted account behavior or real phone keyboard behavior.

Both the pure calculator and authorized server path now permit multiple paid products in the same brand and require each fitted free gift to match at least one remaining paid product. The server retains private costs and current product-version checks. No schema migration, actual catalogue photo upload, real cost update, inventory integration or production deployment was performed for this revision.

Draft storage is versioned as `member-cart-v1-{userId}`; synthetic request/memo state is `member-demo-v3`. Verification covers price/cart preservation through **Add product → Calculator**, repeated Add to cart merging, quantity edits/removal, accessory size changes, invalid/blank price and stale-result clearing, as well as mobile/desktop English text wrapping.

### Completed checks for the initial English/cart revision

This historical record covers the previous per-model Hero Cards, automatic navigation after adding and separate Edit cart mode. Those interactions are superseded by the category-dropdown and swipe-cart revision recorded below; its validation status is separate.

The revised interface was exercised in the in-app browser. The root clicked King size, selected two pillows and a matching protector from Accessories, added the bundle to the calculator and entered RM5,000. The synthetic cost of RM2,430 produced 51.40%. Adding the synthetic two-seat sofa retained the price and changed margin to 7.40%; removing it restored 51.40%. Customer preview and copy contained English product/gift details and amounts, with no internal costs or margin. No quote was sent.

Forty page/width combinations covered Today, Income, Calculator, Team, Account, Requests, Memos and Catalogue at 320, 390, 768, 1024 and 1440 pixels. In each, document scroll width equalled client width and visible sample-page text contained no Chinese. Screenshots were inspected for desktop catalogue/calculator, phone calculator, the 320-pixel accessory picker and the final interactive phone frame. Long English navigation text and the portal's mobile input font override were corrected. These geometry checks do not prove that every possible long, authored name or memo fits every native device.

```text
npm run test:ci                                      1,351 tests passed; 104 files passed, 3 skipped
npm run build                                        passed (existing lint warnings)
npx tsc --noEmit --pretty false                       passed after integration
MemberQuoteBuilder.test.tsx                          11 workflow tests passed after final fixes
calculator.test.ts                                  128 calculation/catalogue tests passed
git diff --check                                     passed
Final mobile/desktop browser error logs              empty
```

The 11 workflow tests include multiple-size carts, keypad entry, size-filtered accessories, missing costs, final-item/orphan-gift removal, asynchronous stale responses, unavailable colour fallback, catalogue refresh removing a selected variant, delivery edits invalidating suggestion undo, and reconnecting without displaying an old margin. Final copy, responsive CSS, reconnection handling and phone-preview deep linking were subsequently checked with targeted tests, TypeScript and browser inspection. The preview server was restarted after the build; both final review tabs were refreshed and the synthetic cart reset to empty.

Direct review links:

- Mobile Hero Cards: `http://127.0.0.1:3007/member/preview?device=phone&page=quote&quoteView=catalog`
- Desktop Hero Cards: `http://127.0.0.1:3007/member/preview?page=quote&quoteView=catalog`

These remain local previews. Product illustrations reserve future photo slots; the Principal photo/costing attachment workflow and hosted deployment remain outside this revision, as requested.

## Category dropdown and swipe-cart revision

This section preserves the completed checks for that revision. Its quantity dropdowns, visible add-success toast, accessory placement for gift bed frames and always-expanded calculator cart are superseded by the refinement recorded in the next section.

This revision displays one Hero Card per configured category in the vertical order **Mattress → Bed Frame → Accessory → Sofa**. Each card has a model dropdown, so another model can be selected in the same position. Category shortcuts scroll to the corresponding card. The order is retained on desktop, where a card places its image beside the selection controls.

**Add to cart** now adds the selected bundle and stays in the catalogue. A successful add clears that model's free-gift selection and resets its draft quantity to 1; validation failures preserve the draft. Repeated additions merge SKU quantities. The member explicitly presses **Calculator** when ready, and **Add product → Calculator** continues to preserve the accumulated cart and selling price. Existing gift-only Accessory entries retain their gift flag and require a matching paid product; this change does not create retail-priced accessories or change the server's cost and compatibility rules.

The cart no longer has an Edit cart mode. Quantity controls are always available; decreasing to zero removes the line. Swiping a product line left reveals **Delete**, and a separate click performs deletion. The row's **More** action exposes the same control for desktop and keyboard users. Vertical scrolling, interaction with quantity controls, closing a revealed row and reduced-motion preferences are handled separately from deletion. Removing a paid line retains only free gifts that still match a remaining paid product.

### Completed checks for the category-dropdown and swipe-cart revision

```text
npx tsc --noEmit --pretty false                       passed
Focused Vitest run                                  153 tests passed
calculator.test.ts                                  128 calculation/catalogue tests passed
MemberQuoteBuilder.test.tsx                          14 workflow tests passed
SwipeCartRow.test.tsx                                11 interaction cases passed
git diff --check                                     passed
```

The updated builder checks include the category order and model dropdown, staying in the catalogue while clearing the successfully added model's quantity/gift draft, and immediate quantity/margin changes without Edit mode. Existing coverage for compatibility, missing costs, stale live responses and cart/price preservation remains. Swipe tests cover reveal without deletion, an explicit delete action, a short swipe returning closed, right-swipe dismissal, vertical-scroll intent, quantity controls, cancellation, keyboard focus and only one row open at a time.

The root exercised the current interface in the in-app browser, including the following checks:

| Area | Verified behavior |
|---|---|
| Cart gestures at 390 px | A left swipe reveals Delete; a right swipe closes the action without deleting. Swiping a temporary Cloud Comfort Single line and then pressing Delete removes it. |
| Direct quantities at 390 px | Quantity increment/decrement works without Edit mode. Reducing a temporary Cloud Support Single line from 1 to 0 removes it. |
| Repeated catalogue additions | Two consecutive mattress additions stay in the catalogue and clear their selected free gifts. Explicitly pressing the bottom Calculator button retains the selling price and delivery fee. |
| Fast checkout at 320 px | Adding an Accessory and immediately pressing Calculator works while the confirmation toast is still visible. The toast position and pointer behavior were corrected so it does not block checkout. |
| Desktop and keyboard | More reveals the row action; Escape closes it. |
| Responsive geometry | Catalogue and Calculator checked at 320, 390, 768, 1024 and 1440 px: all ten view/width combinations had no document horizontal overflow. Screenshots at 320 px mobile and 1440 px desktop were visually inspected. |

After the temporary additions and removals, the original synthetic cart was restored to three Cloud Support Super Single mattresses, two Comfort Pillows and one Super Single Mattress Protector. The selling price remained RM7,999 and delivery RM500; displayed product margin was 40.49%, with delivery excluded from margin.

These checks used the in-app browser and synthetic catalogue data. They do not establish native touchscreen hardware behavior or real-device acceptance. No new full-suite run, production build or deployment is claimed for this revision; the earlier 40-layout and 1,351-test results belong to the prior English/cart revision. Photo/costing setup and hosted-account acceptance retain the boundaries documented above.

## Quantity controls, inline feedback and combination refinement

Catalogue quantities now use native minus/plus buttons with 44 px targets and bounds of 1–10. Free-gift quantities use the same interaction with bounds of 0–4. The model and colour selectors remain dropdowns; quantity selection no longer uses a dropdown.

Product grouping follows category rather than gift eligibility. All bed-frame models, including configured gift bed frames, appear in the Bed Frame card and are absent from the Accessory card and the accessory Free Gifts picker. The shared `isAccessoryProduct` helper accepts pillow, protector, accessory and other categories, and excludes mattress, bed frame and sofa categories. Gift flags, compatibility, costs and server validation are preserved. The calculator's existing pillow suggestions also require accessory classification.

A successful add shows its confirmation and check inside the Add button, with a subtle 180 ms transition and a 1.5-second reset. A screen-reader status announces the addition; no visible global success toast appears. The action continues to preserve catalogue position, clear the added model's gifts and reset its quantity to 1.

The fee label is **Additional charges**, covering the entered total of delivery, disposal and miscellaneous charges. These charges are excluded from product margin and included in the customer total. Validation errors and customer quotation output use the new label; the `QuoteInput.delivery` wire field and calculation remain unchanged.

**Your combination** starts collapsed and resets to collapsed when the member returns to Calculator. It expands inline with Add product at the top of the contents and a cart that scrolls within the smaller of 42dvh or 360 px. The summary appears before the price card on mobile and on the right on desktop. The calculator header no longer has Add product. Open/close motion takes 200 ms and is disabled for reduced-motion preferences. Existing direct cart quantities and swipe-to-reveal deletion remain available inside the expanded combination.

### Completed checks for the quantity, feedback and combination refinement

```text
Integrated focused Vitest run                       178 tests passed
calculator.test.ts                                  145 calculation/catalogue tests passed
MemberQuoteBuilder.test.tsx                          16 workflow tests passed
SwipeCartRow.test.tsx                                11 interaction cases passed
QuantityStepper.test.tsx                             6 control cases passed
npx tsc --noEmit --pretty false                       passed (exit 0)
git diff --check                                     passed (exit 0)
```

Library checks include category-based accessory classification, preservation of configured gift bed-frame cost calculations, additional-charge wording and unchanged fee exclusion from margin. The integrated focused run also covers the builder, swipe row and quantity controls.

The root completed these checks in the in-app browser:

| Area | Verified behavior |
|---|---|
| Quantity controls | At 390 px, catalogue quantity changed 1 → 2 → 1 and gift quantity changed 0 → 2 → 1. Catalogue inspection found no quantity dropdowns. |
| Category boundaries | Bed Frame was absent from the accessory Free Gifts picker. Frame colour and quantity controls were visually checked at 320 px. |
| Add and calculator flow | Inline Added confirmation was visible inside the button, followed by immediate Calculator navigation. Collapsed and expanded combination states were exercised and visually checked at 390 px. |
| Responsive geometry | Catalogue and collapsed Calculator were checked at 320, 390, 768, 1024 and 1440 px with no document horizontal overflow. Expanded-cart geometry was checked at 320, 390, 768 and 1024 px; the desktop cart was visually checked at 1440 px. |
| Gift picker and narrow layout | Screenshots at 390 px covered the gift picker; screenshots at 320 px covered the frame controls and gift modal. An obsolete rule hiding gift thumbnails below 380 px caused unnecessary name wrapping. Removing it restored clean product-name and stepper alignment at 320 px. |
| Cart cleanup and charges | Temporary Cloud Comfort Single and pillow additions were removed through the expanded cart using Actions → Delete and quantity decrement to zero. Additional charges were edited to RM625 and restored to RM500. |

The original user cart was restored exactly to two Cloud Support Super Single mattresses, one Super Single Mattress Protector, one New Comfort Queen mattress and one Studio Frame King in Walnut, with selling price RM7,999 and additional charges RM500. The New Comfort cost remains pending, so the calculator retains **Needs review** and does not claim a confirmed margin or enable a confirmed customer quotation.

These results describe the current refinement; earlier test and layout records remain historical. No new full-suite run, production build, deployment, native touchscreen hardware check or real-account acceptance is claimed.

## Compact header, scoped search and Hero Card cleanup

The header now has a rounded 48 px Search in {department} control and a 48 px notification button with an unread dot. Its former logo, department selector, theme control, avatar and demo banner are removed. Department and Appearance remain in Account preferences, where Reset demo has also been placed. Preview identification remains in the footer. The visual references are Pinterest's [official search guidance](https://help.pinterest.com/en/article/search-for-ideas-on-pinterest), Airbnb's [official redesigned-app announcement and screenshots](https://news.airbnb.com/airbnb-2025-summer-release), and [Apple Search fields guidance](https://developer.apple.com/design/human-interface-guidelines/search-fields); the portal's control sizes are its own implementation choices.

`MemberSearch` provides real local results: the first six quick links for an empty query, and at most ten results for a typed query, with all query words required to match titles, descriptions or keywords. The available items are authorized quick links, current-department people, filtered memos and Fair-only products restricted to the current cart brand when applicable. Product selection opens the precise Hero Card model, size and colour through the builder's selection input. It supports selecting the same result repeatedly and does not add items or modify price or additional charges.

Gift-flag Hero Cards no longer display the Free gift badge or explanatory box. The reason for a disabled add action remains as a plain caption when a matching paid product is required. Cart gift badges, product cost handling and gift metadata are unchanged.

### Completed checks for the compact header and search refinement

```text
Related tests across targeted runs                  168 tests passed
MemberQuoteBuilder.test.tsx                          17 workflow tests passed
calculator.test.ts                                  145 calculation/catalogue tests passed
MemberSearch.test.tsx                                6 search tests passed after final placeholder/copy assertions
npx tsc --noEmit --pretty false                       passed (exit 0)
git diff --check                                     passed (exit 0)
```

The root completed these checks in the in-app browser:

| Area | Verified behavior |
|---|---|
| Header geometry | Checked at 320, 390, 768, 1024 and 1440 px with no document horizontal overflow. Each header had exactly two controls; the notification target was 48 px, the search control retained at least 215 px width on the 320 px view, and the header measured 76 px high on mobile and 78 px on desktop. |
| Product search | Searching Essential Frame Super Single in Walnut opened the correct Bed Frame card with that exact variant. The phone-wrapper screenshot showed the compact header and selected Hero Card without the former gift explanation box. |
| Search interaction | Empty-query quick links, Clear, Settings selection with Enter, and Account preferences worked. Escape closed search and returned focus to the Search control. |
| Department and notifications | Cloud search returned no product results in IR; Fair was restored afterward. The notification button opened Memos without acknowledging a memo. |
| Visual inspection | Screenshots covered the phone wrapper, search at 390 px, the desktop header at 1440 px, and a long search result at 320 px. The Products group badge was adjusted to keep its word whole at the narrow width. |

The existing cart remained at six products and one free gift, selling price RM7,999 and additional charges RM500. No cart item was added during this header-refinement turn. The 168 related test cases were verified across the targeted runs above; this is not a claim of a new full-suite run.

Prior layout and test records remain historical. This is the existing local Next.js application without `.openai/hosting.json`; no hosting configuration was changed. No new full-suite run, production build, deployment or native touchscreen hardware acceptance is claimed.

## Contextual Back, category brands and Clear all

Completed targeted checks across this refinement: Builder 22 workflow tests,
Workspace navigation 3 integration tests, navigation helpers 11 tests, calculator/
catalogue 145 tests, and Search 6 tests. Total: 187 related passing tests across
targeted runs, not a full-suite run. The member-scoped TypeScript check passed.
The repository-wide check also included other tasks' temporary checkout copies
under tmp/hierarchy-spaces-live and tmp/revenue-payroll-release and reported missing
modules/role entries there; it is not claimed as passing. No unrelated checkout
files were changed to suppress those errors.

Browser verification covered all four category Brand selectors, independent model
changes, preserving the existing cart while browsing other brands, and header Back
returning Calculator to the catalogue in both the public static demo and the local
Next phone iframe. The refreshed local 390 px iframe has no Back or duplicate
Calculator on the catalogue, and shows Add product/Clear all together in the
expanded combination. The local user's cart stayed at 6 products and 2 free gifts;
Clear all was exercised on the separate public-origin QA sample cart and restored
with Undo, returning its 1 product, 1 gift and RM5,000 price with 59.30% margin.
The public 1280 px desktop clear/empty/undo states were visually checked. Earlier
390/320 px header and card-selector checks preceded the final clear action.
The viewport override later stopped affecting the existing public tab, so a final
320 px Clear all screenshot and a physical touchscreen test are not claimed.

The existing temporary phone URL was rebuilt from the final member components and
restarted with the same static-only server boundary. The bundle contains no live
server modules. Source whitespace validation passed.

## Independent purchases for gift-eligible products

The matching-product prerequisite was removed from Hero Cards. Eligibility is
separate from a quote line's purchased/free-gift role, including in server-side
validation. No schema change was required. Existing cart roles are retained.

Targeted checks passed: 162 calculator/catalogue tests, 26 Builder workflow tests,
3 Workspace navigation tests and 6 Search tests (197 total across targeted runs).
The member-scoped TypeScript check and source whitespace check passed. Coverage
includes independent accessory/frame/sofa purchases, separate paid/gift quantities
of one SKU, independent deletion, combined cost, aggregate limits and gift
eligibility/compatibility. These results do not represent a full-repository suite.

The rebuilt public demo was exercised from an empty cart with a Comfort Pillow,
Essential Frame and Everyday Sofa individually. Their respective sample selling
prices of RM500, RM1,000 and RM5,000 produced 93%, 72% and 56% margins. Adding a gift
copy of the purchased pillow, increasing its purchased quantity and deleting only
the gift left two purchased pillows with the expected 86% margin. The desktop
calculator was visually inspected at 1280 px without horizontal overflow or
browser errors. The local 390 px phone iframe successfully added the formerly
blocked Essential Frame and showed it as a purchased product. Its card, quantity
control and added-state button were visually checked; the test item was removed
afterward, restoring the empty cart and blank price.

The existing phone URL was updated by rebuilding and restarting only the isolated
static demo server. Its 29-input bundle audit again excluded live server modules.
Live database execution and physical touchscreen hardware testing are not claimed.

## Member login UI

Added a shared English login screen for the actual member login route and the
isolated sample preview. The existing server sign-in and active-account checks
are retained. Ten focused form tests pass, including native button submission
and React's automatic form-reset cycle: credentials stay entered after auth or
preview feedback. Other coverage includes required fields, pending state, password
visibility, email-only trimming, retry feedback, HR guidance and preview never
calling the supplied authentication action. The member-scoped TypeScript check
passed. No real employee credential submission was performed.

Browser inspection covered the local 390 px phone frame, a 320 × 568 phone frame,
and the public 1280 px desktop layout. The short phone can scroll to the complete
form; expanding HR help does not overlap the password or sign-in control. Required
field validation, password reveal, retained synthetic credentials, preview
feedback and Preview workspace navigation were clicked in the browser. Existing
sample cart contents are preserved by login-preview navigation.

Dark appearance inspection found a global heading colour overriding the light
illustration panel; the panel heading now has an explicit contrasting colour.
Input placeholder contrast and the welcome icon also adapt to the saved theme.
The final static preview audit includes 32 inputs and no authentication, Supabase
or live server modules. The same temporary public URL supports `?page=login` and
`/demo-sign-in`. Browser viewport overrides remained ineffective, so narrow-width
checks use the preview route's allowlisted iframe dimensions instead.

## HOUZS VENTURE branding and two login concepts

Both Editorial and Club use the full brand name and the same sign-in form.
Four new screen integration tests cover full branding, each concept's entry
screen, live action forwarding, preview isolation and comparison links preserving
phone settings. These and the ten existing form tests pass (14 total). The
162 calculator/catalogue and three workspace navigation tests also pass after
the customer-quote/workspace branding updates. The final member-scoped TypeScript
check passed; this is targeted verification, not a full repository test run.

Browser screenshots cover both concepts at 390 px and 320 × 568 phone sizes,
including the complete brand name and Club's expanded password help. Public
desktop inspection used 1280 px with no horizontal document overflow. The
comparison switch was clicked, including preserving the outer phone frame URL
and matching Desktop preview link. Club's password reveal, preview submission
feedback and Preview workspace link worked. The corrected desktop workspace
wordmark wraps at the space between HOUZS and VENTURE without overlap.

The existing public share briefly hit a browser ERR_NETWORK_CHANGED interruption;
independent local/public checks returned HTTP 200 and the tunnel remained alive.
A fresh browser tab loaded the same URL successfully. No network settings or
tunnel address were changed. The final demo bundle audit contains 34 inputs and
excludes live server/authentication modules. The existing temporary share now
serves both `?page=login&design=editorial` and `?page=login&design=club`.

## Final selection — Warm Editorial

The owner selected option 1. The shared screen now renders Warm Editorial only,
and the comparison controls and design-query selection have been removed. Both
old design URLs remain usable and render the selected design. The unreferenced
Club concept files are retained as a design reference, outside the demo bundle.

The adapted Screen tests (2) and Form tests (10) all pass. The member-scoped
TypeScript check and source whitespace validation pass. The final public demo
build audits 32 inputs with no live server modules. Refreshed local phone and
desktop previews show the selected design; the old public Club URL was checked
and now correctly displays Welcome back with no comparison controls or browser
errors. The public login entry remains `/?page=login`.
