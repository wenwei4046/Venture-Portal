CLAUDE.md — HOUZS Venture Portal
Project Overview
Internal banking portal for HOUZS Venture Sdn Bhd (HV), a holding company managing 7 subsidiaries in Malaysia's home furnishing industry. HV acts as an internal bank (borrow from subsidiaries, lend to others), shared services hub (Marketing/Finance/HR), and director salary distribution center.
Tech Stack — Next.js 15 (App Router) · Supabase (PostgreSQL + Auth + RLS + Edge Functions) · Vercel · TypeScript · Tailwind CSS · Recharts · React hooks (no Redux)
Environment Variables
```
NEXT_PUBLIC_SUPABASE_URL=https://gixpptmfuryskbwkmiwz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon / publishable key. Safe to ship to browsers — RLS is what protects the data, not this key. Real value in .env.local and Vercel>
SUPABASE_SERVICE_ROLE_KEY=<secret key, sb_secret_… . BYPASSES RLS. Never commit it and never paste it into a script — read it from env. Real value in .env.local, in Vercel, and as a Cloudflare Worker secret of the same name>
ERP_SYNC_SECRET=<≥32 chars; shared with the Houzs ERP database (scm.venture_portal_sync_config vp.secret). Set on Vercel Production — until it is, /api/erp/* answers 503>
```
Repository
```
GitHub: wenwei4046/Venture-Portal (Private)
```
Rules by tab — READ THEM (2026-10-10)
This file keeps only what holds across the whole portal. What the portal decided for one TAB's pages — the dated history this file carried until 2026-10-10, moved word for word — lives in that tab's folder under `.claude/rules/`. **Before you change anything that belongs to a tab, read that tab's files; and in every full scan of a change (a review, QA, an E2E audit) read them again and check the change against them** (user 2026-10-10). A change that crosses tabs reads each tab's files. Do not wait for them to appear: a rules file loads by itself only when a file its `paths:` names is opened in THIS checkout — not from a sibling worktree, not on a Grep — so read them yourself.

| Tab | What belongs to it | Read |
|---|---|---|
| Revenue | the Revenue Department's portal pages (Comm Cal, Staff Hierarchy, Rules, Department — HR runs them), the ERP feed, the Revenue app `/member` (Today, Insight, Quote, Arena, Profile, requests and claims), its Product List, the CRM, Member Services (the app's back office) | `.claude/rules/revenue/` — `comm-cal.md`, `revenue-app.md`, `product-list.md`, `crm.md` |
| HR | Attendance (Today, Records, Requests, Leave balances, Month close, Settings, Readiness), HR Costing (Payroll, Payment, Billing Allocation, department mode), Director Salary, Director Pool, Claims, People (People Management, Hierarchy, employee codes), HR's view (its shell, the `components/hrv` kit), Meeting Rooms, the Guest Link (and its public `/g/<code>`), Documentation, Hiring, the HR phone app (`/hr-app`) | `.claude/rules/hr/` — `payroll.md`, `people.md`, `hr-view.md`, `rooms.md`, `documentation.md`, `hiring.md`, `hr-app.md`, `attendance.md` |
| Finance | Payments, Receipts, Invoices, Billing, Fund IN / OUT, Statements, Dept Pool, OPEX, Reports, Reconciliation | `.claude/rules/finance/` — `finance-view.md`; money rules in Key Business Rules below |
| Principal | Approvals, Settings, People › Permissions | `.claude/rules/portal-wide/permissions.md` |
| Lead View | Customer Service's inbox for the brands' Messenger / Instagram enquiries (`/leads`: Inbox, Leads, Insight, Settings), the `lead_*` tables and functions | `.claude/rules/leads/` — `lead-view.md` |
| Every tab | permissions and the database's guard rails, navigation speed, the installed app (PWA) | `.claude/rules/portal-wide/` — `permissions.md`, `speed.md`, `pwa.md`; summarised under Permissions and Coding Conventions below |

Keeping it that way: a new decision is written into its tab's file (`**TITLE (date):**`, as before), never here — this file stays under 40,000 characters (`src/lib/claude-md.test.ts`) and well below it (cut to ~30,000 on 2026-10-15): a rule says itself here in its fewest words; its reasons and history go to the rules file. The first decision for a tab with no folder starts one, with its row above. A rules file opens with `paths:` frontmatter — route groups and `[param]` folders written as `*`, because `(` and `[` are glob syntax — and the test refuses a file without it, which would load at every launch.
Architecture
```
src/
├── app/
│   ├── (auth)/login/
│   ├── (portal)/          ← layout.tsx (Sidebar + TopBar) and a folder per module: dashboard
│   │                         (dashboard_summary RPC), fund-in, fund-out, statements, approvals,
│   │                         dept-pool, billing, team (People → hr/people.md), director-salary,
│   │                         hr-costing (Payroll → hr/payroll.md), revenue (Comm Cal →
│   │                         revenue/comm-cal.md), reports, settings (9 tabs)
│   ├── (member)/member/   ← the Revenue app, its Product List and the CRM — not the portal
│   │                         (revenue/revenue-app.md, product-list.md, crm.md)
│   └── api/               ← machine endpoints only (Machine ingest, under Coding Conventions):
│                             erp/v1 sales-orders · products · sales-attending (POST), health
│                             (GET); whatsapp/v1 · messenger/v1 (Meta's webhooks)
├── components/layout/     ← Sidebar, TopBar
├── lib/
│   ├── supabase/          ← client.ts · server.ts (anon key + RLS) · admin.ts (service role,
│   │                         BYPASSES RLS — nine callers, Coding Conventions › Supabase client;
│   │                         another is a decision, not a detail) · database.types.ts (generated)
│   └── auth.ts · roles.ts · utils.ts  ← gates · sidebar canAccess* · formatMoney / formatDate / cn / dayjs
├── test/setup.ts · types/index.ts
└── (no middleware.ts)     ← it sits at the REPO ROOT, which Next never loads while the app is in
                              src/ (found 2026-09-27); gating is the layouts' requireAuth. Moving it
                              switches on session refresh + redirects everywhere — its own decision.
supabase/  migrations/ (every schema change, one SQL file each, applied in name order) · tests/ (SQL fixtures) · config.toml
scripts/   seed-*.mjs (test users, principal, QA data …) · check-*.mjs (DB inspection)
tools/     patch-yoga-wasm.mjs (postinstall: workerd takes only a statically imported .wasm — CI runs
           plain `npm ci`) · assert-open-next-wasm · smoke-worker-pdf · yoga-setter-sweep (TESTING.md)
docs/      DESIGN.md · db-schema.md · access-matrix.md · module-spec-*.md · erp-sync/
.gstack/qa-reports/   phase audit reports
```
Spec Documents (MUST READ BEFORE CODING) — in `/docs/`, the source of truth. ALWAYS reference them before implementing a feature.
db-schema.md — the tables, fields, relationships, constraints · access-matrix.md — roles × modules, RLS patterns, data visibility
module-spec-phase1.md / phase2.md / phase3.md — Treasury core (Dashboard, Fund IN / OUT, Overdue & Netting) · Dept Pool + Service Billing (5 modes) · Director Salary Engine, HR Costing, Reports
module-spec-payroll-cycles.md — THE THREE PAYROLLS (design 2026-09-16, not built): Imported and Director close on the 7th, Revenue on the 15th, but `submit_payroll_to_principal` closes the whole month at once. Read it before touching payroll closing.
module-spec-revenue-commission.md — the commission payroll (ERP sales orders → the engine → `hr_monthly_payroll.commission_amount`); §3.0: every page is scoped to a sub-department (`/revenue/fair/rules`) and the sidebar's Revenue children are database rows. Read it before touching `comm_*` / `sales_*` or `/revenue`.
erp-sync/contract.md — the ERP → portal live feed: the receivers, the delivery shape, what each outcome means, the SQL the ERP team applies (`docs/erp-sync/houzs-erp-side/`). Read it before touching `src/lib/erp-sync/`, `src/app/api/erp/` or `ingest_erp_sales_order`.
DESIGN.md — the HOUZS Venture Design System mapped to the code, **the single source of truth for all UI**: Part I themes, tokens, type, components · II portal rules, utility classes, canonical pages · III page specs · IV version index.
At the root: TODOS.md (the open items only — tech debt, compliance gates) · TESTING.md. Phase audits: `.gstack/qa-reports/`.
Permissions — the rules (history: `.claude/rules/portal-wide/permissions.md`)
Every gate reads a PERMISSION, never a role (2026-09-01). A title points at a TEMPLATE (2026-10-08): cells = function × action (view create edit approve void export manage) × reach (own / dept / all), plus the sensitive fields salary / nric / bank; one person may be raised or lowered on a cell. `users.role` — the account's hidden KIND, the template's `base_role` — survives only as the fallback for an account with no template and for the few checks named in `src/lib/kind-checks.test.ts`, which fails on any new `user.role`. Do not add gates that read it.
- Pages ask module KEYS: `requirePermission('treasury')`, `can(user, 'reports')`, `canAccessX(user)`; a page that differs by viewer asks the cells through `lib/surfaces.ts` (`overviewFor`, `ownDepartmentOnly`, …). Every page also asks its TAB first, `await requirePage('<route>')` (2026-10-11; `lib/page-tabs.ts` — a new page is listed there, `page-tabs.test.ts`): on top of its own gate, so a tab closes a page, never opens one. Its WRITES then follow that page's tabs' Create / Edit / Approve boxes (`actionsOnPage`; a Server Action by the page it was sent from), and the Revenue app hides its pages and sends the same way (`lib/member/app-pages.ts`) — only what somebody unticked closes (`closedBoxes`).
- Writes ask the ACTION they are: `requireActionOn(pages, fn, action)` / `requireAnyActionOn(pages, …)` (lib/auth.ts; the pages its screens use it on, named in code — never the Referer) at every Server Action and form page, `canDo(user, fn, action, scope?)` for the button, `has_action()` / `has_any_action()` in SQL. A new gate is listed in `GATED_ACTIONS` — the test that scans `src/` fails otherwise.
- Approvals go by DOMAIN (Treasury, HR Costing, Director Salary, or the queue's own Approve): `approver_may()` / `lib/approval-domains.ts`, gates `requireApproverOn` / `requireApprovalQueue` — never decided by whoever raised it, unless their account is the Principal kind.
- The database asks too. Row policies say WHICH rows — reach through `has_action(fn, action, 'own'|'dept'|'all')`, never `current_user_role()` in a policy, every helper wrapped `(select …)`; RESTRICTIVE `needs_action_*` policies ask `may_write` / `may_read`. **A NEW table**, in its own migration: `SELECT audit_register(…)`, its rows in `permission_table_writes` and `permission_table_reads` (then `permission_writes_guard` / `permission_reads_guard`), and the TS twins `TABLE_WRITES` / `TABLE_READS` — CI fails otherwise. A page that reads a registered table behind a new gate adds that gate's action to `TABLE_READS` and, in a new migration, to `permission_table_reads`. A new `.rpc()` goes into `INVOKER_READS` or `DEFINER_RPCS`. A DEFINER write behind a narrowing gate asks the same pages first (`tab_write_guard`, from the database's copy of the tab registry — reseed `permission_page_tabs` / `permission_tab_cells` when PAGE_TABS or a box changes; `src/lib/tab-write-guards.test.ts`).
- A NEW write function (SECURITY DEFINER) asks `has_any_action(…)` for the action its app gate asks — never `current_user_role()`, never a key. Change a live function from PRODUCTION's body, one statement swapped (Do NOT, below). Helpers a policy calls are plpgsql.
- Salary, NRIC and bank accounts show only where the title ticks them; NRIC and account numbers are not `authenticated`'s to SELECT — read them through `lib/private-fields.ts` (Do NOT, below).
- Every table has its line in `audit_tables`; the history is read through `audit_changes()`, which shows a reader only what their own permissions open.
- CRM: who is in it comes from titles and IR's memberships, what they may do from the matrix's CRM row. A CRM write that changes assignment or settings asks `crm_manages()`; one that works a customer asks `crm_can_reply()` / `crm_can('edit', …)` — never `crm_sees_all()`, which is reading. Rewrite a CRM function from PRODUCTION's body: the event trigger `crm_keeps_its_permission_checks` refuses one that drops its check.
- View as: the Principal's `vp-view-as` cookie is shared by every tab; *Revenue View* is honoured by the member app only; `getAccountUser()` reads the account with no mask. HR's / Finance's view is a LENS (2026-10-11): that view's shell, sidebar and Overview over the account's own power — it edits (`lib/view-as.ts` `lensNav`, `lensOverview`). *View as a person* (cookie `vp-view-as-person`) draws the portal as one account and is READ-ONLY: while it is set the server client reads tables, calls only `READS_WHILE_VIEWING_AS` functions and reads storage (`lib/supabase/read-only.ts` — a new reader the portal calls goes on that list); a service-role write asks `refuseWhileViewingAs()`.
4 Roles (now: the fallback each account is created with)
Role	DB Value	Access
Principal	`principal`	Everything + Approve + Settings
Finance	`finance`	Treasury + Billing + Reports — no individual salary, no Director Salary module, no Director Pool (v2 2026-07-21: calculator is Principal + HR only)
HR	`hr`	Staff costs + Director Salary + Claims + Director Pool (v2 calculator, granted 2026-07-21) + Revenue Department (commission rules, hierarchy, runs — but NOT the Product List, a tick of its own: the Principal's templates and, since 2026-10-14, the Revenue Director's)
Dept Manager	`dept_manager`	Own department only
Key Business Rules
Treasury
Subsidiaries deposit savings in HV at negotiated rates (per-deal, not fixed)
HV lends to subsidiaries at Base Rate + per-loan custom premium (set at creation, locked for the loan's life). Tier system was removed mig 63 — no T1/T2/T3 labels anywhere.
Base Rate = Weighted Avg Cost of Paid Capital + Op Margin (quarterly, Principal approves)
Loan rate locked at creation, never changes
Free pool priority when lending (tracked via Dashboard, not separate allocation)
Director Salary (Most Complex Module)
7 subs pay CTC (basic + KPI with statutory, allowance without) → total = HV revenue
Pool ÷ 4 × weightage → per director gross
5% saving deducted on non-statutory portion
75/25 split: payroll vs invoice to outsource
75% payroll: min RM14,400 gross → deduct EPF ER + EE, SOCSO ER + EE, EIS ER + EE, PCB → net to director
25% invoice: base + employer statutory → accumulate in isolated pool
PCB: lookup Jadual PCB table (not calculated)
All statutory: table lookup, NOT flat percentages
Monthly Consolidated Statement
Invoice items (billable) + Contra items (loan repayment, savings interest)
Loan repayment is NOT invoiced, only listed as contra
Net amount = Invoice total - Contra total
One statement per subsidiary per month
Data Visibility
Finance CANNOT see individual employee salaries — only department lump sum
Finance CANNOT access the Director Salary module or Director Pool at all. (Director Pool v2 2026-07-21: the old aggregate-bucket view Finance used was replaced by the standalone calculator — Principal + HR only.)
HR CAN access Director Pool v2 (standalone calculator — full per-director detail; granted by user 2026-07-21)
Only HR and Principal can see individual salary details
Member catalogue & margin cost basis → `.claude/rules/revenue/product-list.md`. The rule every margin in the portal keeps: Revenue Team cost = cost ÷ `comm_schemes.revenue_cost_divisor` (Fair 0.7); margin = (price − cost) ÷ price; the price for threshold t is cost ÷ (1 − t), never cost × (1 + t). No member screen says how that cost is made (`components/member/cost-basis-wording.test.ts`).
Development Phases — Phase 1 Treasury Core (Dashboard, Fund IN / OUT, Overdue & Netting, Statements, Approvals, Settings, Auth) and Phase 2 Department + Billing (HR Cost Submission, Dept Pool, Service Billing, invoice → statement) shipped 2026-04-10 (audits in `.gstack/qa-reports/`); Phase 3: Director Salary Engine, HR Costing, Claims, Reports, Statutory Tables.
GStack per phase: /plan-eng-review → /design-consultation → build in parallel worktrees → /ship → /qa → /land-and-deploy → /document-release → /retro.
Coding Conventions
TypeScript strict mode — no `any`
Server Components by default — Client Components only when needed (forms, interactive widgets)
Writes — Server Actions (`'use server'`), NOT API Route Handlers, each gated at entry — since 2026-10-08 by the ACTION it is, `requireActionOn(…)` (see Permissions).
Read-only file downloads (PDF, CSV, ZIP streams) — GET Route Handlers (`app/**/route.ts`), because Server Actions can't stream binary cleanly; gated at entry the same way, never taking write-side params. POST/PUT/DELETE route handlers stay forbidden (user 2026-04-17).
Machine ingest — the ONE exception to the rule above (2026-09-05): another SYSTEM pushing data in has no session and cannot call a Server Action, so it gets a POST Route Handler under `app/api/<system>/v<n>/`. Two systems: the Houzs ERP's database via pg_net (`erp/v1` — sales-orders, products, sales-attending; a new endpoint of an existing feed is not a new exception, a new SYSTEM is) and Meta (`whatsapp/v1`, `messenger/v1` webhooks, user-approved 2026-10-01 / 02; its GET answers only the one-time handshake with the verify token). Every part is required: authentication by a static shared secret from env (the ERP) or the `X-Hub-Signature-256` HMAC of the RAW body with `META_APP_SECRET` (Meta), compared in constant time and failing closed when unset — never a session, never a query param; the service-role client used for ONE thing, calling the one ingest RPC that owns every write (Meta's: `crm_ingest_whatsapp` / `crm_ingest_messenger`); the path excluded from `middleware.ts`; every delivery logged (`erp_sync_events` / `crm_channel_events`); 2xx for every delivery the portal chose not to apply, because the sender's outbox retries non-2xx forever. Nothing a browser calls may ever be a POST handler. The full text: `.claude/rules/revenue/comm-cal.md` › FROM CLAUDE.MD; the CRM: `crm.md`.
Supabase client — `lib/supabase/server.ts` uses the anon key with RLS via SSR cookies. `admin.ts` is the service-role client and BYPASSES RLS entirely: `'server-only'`, exactly NINE callers, each with one job — the two Meta webhooks and the ERP's three receivers (each calling its one ingest RPC), `app/api/member-queue/route.ts` (the cron-secret queue sweep, Hiring's day-old leftover files), `lib/member/server.ts` (a member's quote prices and cost ratios, month and kept honours — each only after the member's own session was authorised), `team/people/invite-actions.ts`, and `lib/erp-sync/feed-key.ts` (the ERP's key, kept in Vault). Why each: `.claude/rules/portal-wide/permissions.md`. Reach for it only when a machine path has no session to act under or a secret must stay out of every session's reach — never to dodge an RLS policy that is merely inconvenient.
Sign out ends THIS device's session only — `auth.signOut({ scope: 'local' })` (2026-10-08): supabase-js's default `'global'` deletes every session of the account, and the shared accounts (principal@ / finance@ / hr@) are signed out and in on the office PC several times a day. `src/lib/sign-out-scope.test.ts` refuses any `auth.signOut(` without it.
Navigation speed (2026-09-26) — a click must answer at once (the whole of it: `.claude/rules/portal-wide/speed.md`). Every route folder with child routes has a `loading.tsx` rendering `RouteSkeleton` (`src/app/route-boundaries.test.ts`). The client router keeps pages five minutes, so a write must `revalidatePath` (or set a cookie) before it redirects, and a component holding unsaved edits must survive a refresh. Warm a page only through `lib/nav-warm.ts`, never an `AUDITED_ROUTES` page; nothing may fire a Server Action on its own after a navigation. A page's independent reads start together (`startRead`, `lib/start-read.ts`); a whole table goes through `fetchAllRowsParallel`, an id list through `fetchByKeys` — never one long `.in()` — and a read or rpc that can pass 1,000 rows is PAGED (PostgREST stops at 1,000 without a word). A SQL function must not call another per row, and under RLS only LEAKPROOF comparisons reach an index.
The installed app (2026-10-06 / 10-10; the whole of it: `.claude/rules/portal-wide/pwa.md`) — ONE app for everybody, never a second install (2026-10-11, `lib/one-app.ts`: on a phone HR's view opens the HR app; a Revenue member the Revenue app). A new build is OFFERED (*A new version is ready*, `components/pwa/UpdatePrompt`); only the Revenue app reloads by itself, after 30+ min away — never the portal, whose pages can hold unsaved pay. Every bottom bar, and whatever pads itself clear of one, stands on `var(--safe-bottom)`, never a bare `env(safe-area-inset-bottom)` (`src/lib/safe-area.test.ts`); a Revenue-app sheet that reaches the screen's bottom edge carries `--sheet-safe`. `public/sw.js` caches nothing but `offline.html` — every page is somebody's money.
Aggregate queries — prefer RPC functions (`dashboard_summary`, `get_hr_cost_summary`) over scattered per-field selects: one round-trip, testable in SQL. A balance is SUMMED by the database, never downloaded line by line to be added up — `gl_net_by_account(p_before, p_codes)` (SECURITY INVOKER, so RLS still answers per user) is the Ledger's BALANCE B/F and the Trial Balance.
Error handling — Server Actions throw, pages use error boundaries, never return `{ data, error }` to the client
Date handling — store `date` / `timestamptz`, format with `dayjs`, compare by day (`dayjs().isAfter(x, 'day')`). A month is three letters (DESIGN.md › Date format): an `Intl` format goes through `formatIntlDate()` (`lib/utils.ts`) — en-GB and en-MY write September "Sept". TODAY AND THIS MONTH ARE THE OFFICE'S (UTC+8), on both floors (2026-10-09): Vercel and the database keep UTC, so from 00:00 to 08:00 the machine's today is yesterday and on the 1st its month is last month. App: `officeToday()` / `officeMonth()` / `officeTime()` / `officeDay()` / `officeDayStart()` (`lib/office-time.ts`), never a bare `dayjs()` / `new Date()` for a day. SQL: `(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date`, never `CURRENT_DATE`, `to_char(now(), …)` or `date_trunc('month', now())` (`src/lib/office-clock-sql.test.ts`). `now()` as an INSTANT (expiries, "last 30 days", `updated_at`) stays as it is.
Money — `decimal(15,2)` in DB. Display with `formatMoney()` from `lib/utils.ts`. Negative amounts render as red parenthesis notation `(1,000.00)`.
Naming — DB: snake_case, TypeScript: camelCase, Components: PascalCase
Files — one component per file, co-locate related files (`_components/` subfolders per route)
Testing
Vitest + happy-dom + @testing-library/react: `npm test` (watch), `npm run test:ci` (once). CI (`.github/workflows/test.yml`) runs four jobs side by side on every push: `unit` (Vitest in two halves, `--shard=N/2`), `sql` (the PGlite checks in `tests/*-sql`), `build` (`next build`) and `worker` (`npm run verify:worker` — the Cloudflare worker renders a real PDF inside workerd). A docs-only change (`**/*.md`, `docs/`, `.design/`) runs none of them.
Every bug fix ships with a regression test. Extract a Server Action's pure logic into a `src/lib/*.ts` helper and test that (mocking next/cache, next/navigation and the SSR cookies costs more than it's worth); a fix planned but not built gets a `describe.todo('...')` stub where its test will live. API routes: sample data matching real scenarios. Statutory lookups: known values from the PDF tables. Director salary: the spec's two datasets. RLS: each role reaches only what `docs/access-matrix.md` allows. E2E runs through Playwright MCP, not in CI. The layers and how to add a test: `TESTING.md`.
Do NOT
Do not hardcode any rates (interest, custom premium, penalty, saving %) — all from Settings/DB
Do not skip RLS — every table must have policies matching Access Matrix
Do not write a helper a row policy calls as `LANGUAGE sql SECURITY DEFINER` — its body is planned again on every call (plpgsql keeps the plan; see Navigation speed › The permission helpers are plpgsql).
Do not leave a SECURITY DEFINER function open to PUBLIC / anon unless it checks the caller itself (`auth.uid()`, `has_perm`, `has_scope` …) — it runs as its owner, so RLS never asks, and the publishable key every browser holds can call it. Since mig `20261009000100` EXECUTE on every non-trigger DEFINER function is revoked from PUBLIC + anon, except the five row-policy helpers (`current_user_role`, `current_user_department_id`, `current_user_segment`, `has_perm`, `has_scope`), and a new function gets no anon / PUBLIC EXECUTE by default — one the anon key must call needs an explicit GRANT and checks its own caller (today only the guest link's, `.claude/rules/hr/rooms.md`). A helper only other DEFINER functions call: `REVOKE … FROM PUBLIC, anon, authenticated` + `GRANT … TO service_role` — and only when its BARE name appears nowhere in `src/`, `scripts/`, `tools/` (a call may put the name alone on the line under `.rpc(`). A function handed a user id (`p_user_id` / `p_approver` / `p_created_by`) refuses a JWT caller whose `auth.uid()` is not that id — the app always hands in `user.id`, which View-as never changes. Journals: the app posts through `post_journal_entry_as_caller` (own name + treasury / admin / hr scope); `post_journal_entry` is the owner's and the service role's. **A role check must hold for somebody who has NO role:** `IF v_role NOT IN (…)` is NULL — not true — for a NULL role and never fires; `current_user_role()` refuses (42501) a sign-in with no active portal account, and a new guard is written `IS DISTINCT FROM` / `has_action()` (`tests/member-sql/validate-definer-login.mjs`). The history: `.claude/rules/portal-wide/permissions.md` › FROM CLAUDE.MD.
Do not read an NRIC, an account number or a payroll submission's per-person copy straight off its table, or `select('*')` on `hr_staff_costs` / `directors` / `payroll_voucher_lines` / `hr_cost_submissions` — `authenticated` has no SELECT on those columns since mig `20261009050100` (PR4); go through `lib/private-fields.ts`, and ask for `STAFF_ROW_COLUMNS` / `DIRECTOR_ROW_COLUMNS` instead of `*`. A column ADDED to one of those tables is granted to `authenticated` in the same migration (`GRANT SELECT (col) ON … TO authenticated`), or listed in `lib/private-columns.ts` if it is private; a SELECT policy changed on one changes its reader in the same migration — `src/lib/private-columns.test.ts` refuses both otherwise.
Do not `CREATE OR REPLACE` a function from its last copy in `supabase/migrations` without first comparing that copy's body with production's `md5(prosrc)` — functions changed straight on the database drift, and an old copy re-applied silently undoes production's fixes and guards (mig `20261006040000` holds nine exactly as production runs them). A change made straight on production goes into a migration file the same day.
Do not let Finance access hr_staff_costs or director_payouts detail — use aggregate views
Do not use localStorage for auth — use Supabase Auth sessions
Do not create separate apps — single Next.js app, role-based routing
Do not invent parallel design docs (no `DESIGN-v2.md`, `STYLE.md`, `UI-NOTES.md`, etc) — DESIGN.md is the single source of truth, extend it in place
Do not hardcode hex colors in components — use Tailwind tokens (`text-ink`, `bg-paper`, `text-num-ink`, `border-hairline`, `text-accent`, `text-danger`) backed by CSS vars in `globals.css`
Do not use the superpowers plugin (brainstorming/TDD/writing-plans skills, `docs/superpowers/` plan+spec files) unless really needed — default to working directly; reserve it for genuinely complex multi-step features where the planning overhead pays off

UI Conventions (DESIGN.md v4.0 — enforced)
**Read `docs/DESIGN.md` first before adding or amending any UI**: Part I is the design system (two themes, tokens, type, which component for which job), Part II is the portal's rules, and Part III holds your page. The visual source is the Claude Design project "HOUZS Venture Design System" (link in DESIGN.md).

Rules every new or amended page follows:
1. **Pick the theme first.**
   - HR: every portal page, on the white sheet (`lib/sheet-routes.ts`).
   - Revenue: `[data-revenue-app]` — the Revenue app and the CRM.
   - One theme per page; `data-theme` is light/dark mode, not a view.
2. **Page header.** Use `.page-head` (`<div className="page-eyebrow"><em>I.</em> SECTION · NAME</div>` + `<h1 className="page-title">`), or the kit's `PageHead` on HR's pages. No description under it (DESIGN.md › No descriptions on the page).
3. **Money and figures.**
   - Money cells use `.num`: `<td className="num">{formatMoney(x)}</td>`, negatives in `<span className="neg">`.
   - A page opens on `StatCards` / `StatCard` (`components/sheet/StatCard.tsx`), not a hero or a figure strip.
4. **Tables.** `.ledger-table` with bare `<th>` / `<td>` (a closing total in `<tfoot>`), `SortableTable`, or the kit's grid tables. A table of 5+ columns folds on a phone.
5. **Section headings** use `.sect-head`, or the kit's `SectHead`.
6. **Colours only through tokens.**
   - Tailwind tokens (`text-ink`, `bg-paper`, `border-hairline`, `text-danger` …), or the design system's `--ds-*` / `ds-*` classes for new work. No hex outside `globals.css`.
   - On the sheet, orange `#E99A53` is a surface, never lettering.
   - One primary action and one dark object per screen. Statuses are `.chip`s.
7. **A new route folder with child routes gets a `loading.tsx`** that renders `RouteSkeleton` (see Navigation speed under Coding Conventions).
8. **Faces.**
   - Page titles: Newsreader (`--font-display`). Body: Inter. Figures: Chivo Mono.
   - The Revenue app's titles and amounts: Inter Tight (`--font-display-rv`).
   - Georgia is for print only. `src/lib/design-system-tokens.test.ts` guards the tokens and the faces.

Canonical reference pages: DESIGN.md › Part II › Canonical reference pages (the sheet page is `src/app/(portal)/hr-costing/page.tsx`).
