CLAUDE.md — HOUZS Venture Portal
Project Overview
Internal banking portal for HOUZS Venture Sdn Bhd (HV), a holding company managing 7 subsidiaries in Malaysia's home furnishing industry. HV acts as an internal bank (borrow from subsidiaries, lend to others), shared services hub (Marketing/Finance/HR), and director salary distribution center.
Tech Stack
Framework: Next.js 15 (App Router)
Database: Supabase (PostgreSQL + Auth + RLS + Edge Functions)
Hosting: Vercel
Language: TypeScript
Styling: Tailwind CSS
Charts: Recharts
State: React hooks (no Redux)
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
| HR | HR Costing (Payroll, Payment, Billing Allocation, department mode), Director Salary, Director Pool, Claims, People (People Management, Hierarchy, employee codes), HR's view (its shell, the `components/hrv` kit) | `.claude/rules/hr/` — `payroll.md`, `people.md`, `hr-view.md` |
| Finance | Payments, Receipts, Invoices, Billing, Fund IN / OUT, Overdue, Statements, Dept Pool, OPEX, Reports, Reconciliation | no folder yet — Key Business Rules below |
| Principal | Approvals, Settings, People › Permissions | `.claude/rules/portal-wide/permissions.md` |
| Every tab | permissions and the database's guard rails, navigation speed, the installed app (PWA) | `.claude/rules/portal-wide/` — `permissions.md`, `speed.md`, `pwa.md`; summarised under Permissions and Coding Conventions below |

Keeping it that way: a new decision is written into its tab's file (`**TITLE (date):**`, as before), never here — this file stays under 40,000 characters (`src/lib/claude-md.test.ts`). The first decision for a tab with no folder starts one, with its row above. A rules file opens with `paths:` frontmatter — route groups and `[param]` folders written as `*`, because `(` and `[` are glob syntax — and the test refuses a file without it, which would load at every launch.
Architecture
```
src/
├── app/
│   ├── (auth)/
│   │   └── login/page.tsx
│   ├── (portal)/
│   │   ├── layout.tsx              ← Sidebar + TopBar
│   │   ├── dashboard/page.tsx      ← wired to dashboard_summary() RPC
│   │   ├── fund-in/                ← list + new + detail + actions.ts
│   │   ├── fund-out/                ← list + new + detail + actions.ts
│   │   ├── overdue/                 ← list + actions.ts (detect/escalate/markPaid)
│   │   ├── statements/              ← list + detail + actions.ts (generate/issue/markPaid)
│   │   ├── approvals/               ← Principal queue + detail + approve/reject
│   │   ├── dept-pool/               (Phase 2)
│   │   ├── billing/                 (Phase 2)
│   │   ├── team/                    ← People: People Management (+ its Permissions
│   │   │                              tab), Hierarchy (Org chart · Table · Levels ·
│   │   │                              Roles), employee codes.
│   │   │                              → .claude/rules/hr/people.md
│   │   ├── director-salary/         (Phase 3)
│   │   ├── hr-costing/              ← the unified Payroll (draft → completed →
│   │   │                              submitted → paid, in batches), Payment
│   │   │                              statement, Billing Allocation, department mode.
│   │   │                              → .claude/rules/hr/payroll.md
│   │   ├── revenue/                 ← Revenue Department, one sub-department at a
│   │   │                              time (Fair, IR): Comm Cal (the month, closes,
│   │   │                              the ERP feed, fairs), Staff Hierarchy, Rules,
│   │   │                              Department. → .claude/rules/revenue/comm-cal.md
│   │   ├── reports/                 (Phase 3)
│   │   └── settings/                ← 8 tabs: treasury / overdue / splits / directors / companies / banks / periods / simulator
│   ├── (member)/member/            ← the Revenue app (Today / Insight / Quote / Arena /
│   │                                  Profile), its Product List and the CRM — not the
│   │                                  portal. → .claude/rules/revenue/revenue-app.md,
│   │                                  product-list.md, crm.md
│   └── api/erp/v1/                 ← the Houzs ERP's machine endpoints (and api/whatsapp/v1/, Meta's — see Machine ingest): the ERP's two
│                                      receivers — `sales-orders` (POST, live per-save)
│                                      and `products` (POST, the catalogue mirror —
│                                      SKU master, Modular, Maintenance, fabrics,
│                                      combos; ITEMS ONLY, 2026-09-24), plus `health`
│                                      (GET). The only POST route handlers in the app —
│                                      see the machine-ingest exception under Coding
│                                      Conventions. Everything else stays Server Actions.
├── components/
│   └── layout/                     ← Sidebar, TopBar
├── lib/
│   ├── supabase/
│   │   ├── client.ts               ← Browser client (anon key + RLS)
│   │   ├── server.ts               ← Server client (anon key + RLS via SSR cookies)
│   │   ├── admin.ts                ← Service role client. BYPASSES RLS. 'server-only',
│   │   │                              built on FIRST USE not at import time. Eight callers,
│   │   │                              listed under Coding Conventions › Supabase client.
│   │   │                              Another is a decision, not a detail.
│   │   └── database.types.ts       ← Generated from Supabase
│   ├── auth.ts                     ← requireAuth / requireRole helpers
│   ├── roles.ts                    ← canAccess* helpers for sidebar visibility
│   └── utils.ts                    ← formatMoney / formatDate / cn / dayjs helpers
├── test/
│   └── setup.ts                    ← Vitest + jest-dom matcher setup
├── types/
│   └── index.ts                    ← All TypeScript interfaces
├── (no middleware.ts)              ← it sits at the REPO ROOT, which Next never
│                                     loads while the app is in src/ (the build's
│                                     middleware manifest is empty; a signed-in
│                                     GET /login answers 200 — found 2026-09-27).
│                                     Gating is the layouts' requireAuth. Moving
│                                     it would switch on session refresh +
│                                     redirects everywhere: its own decision.
supabase/
├── migrations/                     ← 16 SQL migration files (core → Step 9 dashboard RPC)
├── seed/                           ← (empty — seed scripts in /scripts)
└── config.toml                     ← Supabase project link
scripts/
├── seed-users.mjs                  ← 4 test users (principal/finance/hr/marketing)
├── seed-principal.mjs              ← Initial principal account
├── seed-test-data.mjs              ← Step 8 QA test data (backdated loans + savings)
├── check-loans.mjs                 ← DB inspection helper
├── check-dashboard.mjs             ← dashboard_summary() RPC smoke test
└── migrate-emails.mjs              ← @houzs.my → @venture.my domain migration
tools/
├── patch-yoga-wasm.mjs          ← postinstall. Replaces yoga-layout's runtime
│                                  WebAssembly.instantiate() with a statically
│                                  imported .wasm module, which is the only form
│                                  workerd accepts. CI must run plain `npm ci`.
├── assert-open-next-wasm.mjs    ← reads the built worker bundle, proves the fix
│                                  is present and in the right shape
├── smoke-worker-pdf.mjs         ← starts the built worker in workerd, asks for a
│                                  real PDF, checks where the text landed
└── yoga-setter-sweep.mjs        ← measures what src/lib/export/pdf.test.ts
                                   actually catches (see TESTING.md)
docs/
├── DESIGN.md                       ← Design system v3.0 (Ledger-Dense / single source of truth for ALL UI)
├── db-schema.md                    ← Database schema reference (32 tables)
├── access-matrix.md                ← Role permissions reference
├── module-spec-phase1.md           ← ✅ Shipped: Dashboard, Fund IN/OUT, Overdue, Statements
├── module-spec-phase2.md           ← Phase 2: Dept Pool, Service Billing
└── module-spec-phase3.md           ← Phase 3: Director Salary Engine, HR Costing, Reports
.gstack/
└── qa-reports/                     ← Phase audit reports (gitignored screenshots/)
```
Spec Documents (MUST READ BEFORE CODING)
All specifications are in `/docs/`. These are the source of truth:
db-schema.md — 32 tables, all fields, relationships, constraints
access-matrix.md — 4 roles × 9 modules, RLS patterns, data visibility
module-spec-phase1.md — Dashboard, Fund IN, Fund OUT, Overdue & Netting
module-spec-phase2.md — Dept Pool, Service Billing (5 modes)
module-spec-phase3.md — Director Salary Engine, HR Costing, Reports
module-spec-payroll-cycles.md — THE THREE PAYROLLS (design, 2026-09-16, nothing
  built). Imported (Marketing/HR/Finance/IT/Director Office, 7th), Director
  (board, 7th) and Revenue (commission, 15th) close on different days, but
  `submit_payroll_to_principal` closes the whole MONTH at once — which is why
  August 2026's Revenue commission can never be computed. Proposes cycle =
  (month × track), the CEO's 1%-of-committed-sales share, the statutory-filing
  timing risk and the six reports. Read it before touching payroll closing.
module-spec-revenue-commission.md — Revenue Department commission payroll: the
  second payroll TYPE (ERP sales orders → commission engine → the one
  `hr_monthly_payroll.commission_amount` field). Sub-departments, the tier
  ladder, deposit gate, brand margin bands, Withholding Tax. Read this before
  touching anything under `comm_*` / `sales_*` or `/revenue`. §3.0 explains the
  routing: every page is scoped to a sub-department (`/revenue/fair/rules`) and
  the sidebar's Revenue children are database rows, not constants.
erp-sync/contract.md — the Houzs ERP → portal LIVE sales-order feed (2026-09-05):
  the receiver at `/api/erp/v1/sales-orders`, the delivery shape (the ERP's own
  rows, verbatim), what each outcome means, and the three SQL files the ERP
  team applies on their side (`docs/erp-sync/houzs-erp-side/`). Read this before
  touching `src/lib/erp-sync/`, `src/app/api/erp/` or `ingest_erp_sales_order`.
DESIGN.md — v3.0 Ledger-Dense design system. **Single source of truth for all UI.** Colors, typography, components, page anatomy, the v3.0 utility classes (`.num`, `.ledger-table`, `.page-head`, etc), and canonical reference pages.
ALWAYS reference these docs before implementing any feature.

Other project docs (at repo root):
TODOS.md — Phase 1.5 tech debt, Phase 2/3 prerequisites, compliance gates
.gstack/qa-reports/qa-report-phase1-2026-04-10.md — Phase 1 acceptance audit (6 findings, 2 fixed, 3 deferred to 1.5)
Permissions — the rules (history: `.claude/rules/portal-wide/permissions.md`)
Every gate reads a PERMISSION, never a role (2026-09-01). A title points at a TEMPLATE (2026-10-08): cells = function × action (view create edit approve void export manage) × reach (own / dept / all), plus the sensitive fields salary / nric / bank; one person may be raised or lowered on a cell. `users.role` — the account's hidden KIND, the template's `base_role` — survives only as the fallback for an account with no template and for the few checks named in `src/lib/kind-checks.test.ts`, which fails on any new `user.role`. Do not add gates that read it.
- Pages ask module KEYS: `requirePermission('treasury')`, `can(user, 'reports')`, `canAccessX(user)`; a page that differs by viewer asks the cells through `lib/surfaces.ts` (`overviewFor`, `ownDepartmentOnly`, …). Every page also asks its TAB first, `await requirePage('<route>')` (2026-10-11; `lib/page-tabs.ts` — a new page is listed there, `page-tabs.test.ts`): on top of its own gate, so a tab closes a page, never opens one. Its WRITES then follow that page's tabs' Create / Edit / Approve boxes (`actionsOnPage`; a Server Action by the page it was sent from), and the Revenue app hides its pages and sends the same way (`lib/member/app-pages.ts`) — only what somebody unticked closes (`closedBoxes`).
- Writes ask the ACTION they are: `requireAction(fn, action)` / `requireAnyAction(…)` (lib/auth.ts) at every Server Action and form page, `canDo(user, fn, action, scope?)` for the button, `has_action()` / `has_any_action()` in SQL. A new gate is listed in `GATED_ACTIONS` — the test that scans `src/` fails otherwise.
- Approvals go by DOMAIN (Treasury, HR Costing, Director Salary, or the queue's own Approve): `approver_may()` / `lib/approval-domains.ts`, gates `requireApprover` / `requireApprovalQueue` — never decided by whoever raised it, unless their account is the Principal kind.
- The database asks too. Row policies say WHICH rows — reach through `has_action(fn, action, 'own'|'dept'|'all')`, never `current_user_role()` in a policy, every helper wrapped `(select …)`; RESTRICTIVE `needs_action_*` policies ask `may_write` / `may_read`. **A NEW table**, in its own migration: `SELECT audit_register(…)`, its rows in `permission_table_writes` and `permission_table_reads` (then `permission_writes_guard` / `permission_reads_guard`), and the TS twins `TABLE_WRITES` / `TABLE_READS` — CI fails otherwise. A page that reads a registered table behind a new gate adds that gate's action to `TABLE_READS` and, in a new migration, to `permission_table_reads`. A new `.rpc()` goes into `INVOKER_READS` or `DEFINER_RPCS`.
- A NEW write function (SECURITY DEFINER) asks `has_any_action(…)` for the action its app gate asks — never `current_user_role()`, never a key. Change a live function from PRODUCTION's body, one statement swapped (Do NOT, below). Helpers a policy calls are plpgsql.
- Salary, NRIC and bank accounts show only where the title ticks them; NRIC and account numbers are not `authenticated`'s to SELECT — read them through `lib/private-fields.ts` (Do NOT, below).
- Every table has its line in `audit_tables`; the history is read through `audit_changes()`, which shows a reader only what their own permissions open.
- CRM: who is in it comes from titles and IR's memberships, what they may do from the matrix's CRM row. A CRM write that changes assignment or settings asks `crm_manages()`; one that works a customer asks `crm_can_reply()` / `crm_can('edit', …)` — never `crm_sees_all()`, which is reading. Rewrite a CRM function from PRODUCTION's body: the event trigger `crm_keeps_its_permission_checks` refuses one that drops its check.
- View as: the Principal's `vp-view-as` cookie is shared by every tab; *Revenue View* is honoured by the member app only; `getAccountUser()` reads the account with no mask. HR's / Finance's view is a LENS (2026-10-11): that view's shell, sidebar and Overview over the account's own power — it edits (`lib/view-as.ts` `lensNav`, `lensOverview`). *View as a person* (cookie `vp-view-as-person`) draws the portal as one account and is READ-ONLY: while it is set the server client reads tables, calls only `READS_WHILE_VIEWING_AS` functions and reads storage (`lib/supabase/read-only.ts` — a new reader the portal calls goes on that list); a service-role write asks `refuseWhileViewingAs()`.
4 Roles (now: the fallback each account is created with)
Role	DB Value	Access
Principal	`principal`	Everything + Approve + Settings
Finance	`finance`	Treasury + Billing + Reports — no individual salary, no Director Salary module, no Director Pool (v2 2026-07-21: calculator is Principal + HR only)
HR	`hr`	Staff costs + Director Salary + Claims + Director Pool (v2 calculator, granted 2026-07-21) + Revenue Department (commission rules, hierarchy, runs — but NOT the Product List, which is Principal-only)
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
Development Phases
Phase 1 (✅ Shipped 2026-04-10): Treasury Core
Dashboard (dashboard_summary RPC), Fund IN, Fund OUT, Overdue & Netting,
Monthly Statements, Approvals (Finance→Principal workflow), Settings, Auth
9-step Forge pipeline (see Phase 1 commits a04a7bf..9a5e663)
Phase 2 (✅ Shipped 2026-04-10): Department + Billing
HR Cost Submission, Dept Pool (Marketing P&L), Service Billing (5 modes),
Invoice Generation RPC, Invoice→Statement wiring, Rent/Utility templates,
Unified config audit log (L2 fix), Dashboard KPI extensions (billing float,
dept pool total, Marketing NP). M2 cancelLoan fix bundled in Step 2.
9-step Forge pipeline (commits e58a8bb..Step 9). See
`.gstack/qa-reports/qa-report-phase2-2026-04-10.md`.
Phase 3: Salary + HR + Reports
Director Salary Engine, HR Costing, Claims, Reports, Statutory Tables
GStack Workflow
For each phase:
```
1. /plan-eng-review    → Review spec, find edge cases, output diagrams
2. /design-consultation → Design system, component patterns
3. Parallel development → Backend API + Frontend UI (git worktree)
4. /ship               → Test, coverage, PR
5. /qa                 → Edge cases, security, RLS audit
6. /land-and-deploy    → Deploy to Vercel
7. /document-release   → Update docs
8. /retro              → Phase review
```
Coding Conventions
TypeScript strict mode — no `any`
Server Components by default — Client Components only when needed (forms, interactive widgets)
Writes — use Server Actions (`'use server'`), NOT API Route Handlers. Every action calls `requireRole(...)` at entry. (Since 2026-10-08 that gate is the ACTION — `requireAction(…)`, see Permissions.)
Read-only file downloads (PDF, CSV, ZIP binary streams) — GET Route Handlers (`app/**/route.ts`) are OK because Server Actions can't stream binary responses cleanly. Still call `requireRole(...)` at entry. Never accept write-side params — POST/PUT/DELETE route handlers remain forbidden. Locked by user 2026-04-17 (Spec 5 blocker Q5). (Since 2026-10-08 the entry gate there is the ACTION too — `requireAction(…)`.)
Machine ingest — the ONE exception to the rule above (2026-09-05, ERP live sync): another SYSTEM pushing data in (the Houzs ERP's database via pg_net) cannot call a Server Action and has no session, so it gets a POST Route Handler under `app/api/<system>/v<n>/`. TWO of them exist, both the Houzs ERP's: `sales-orders` and, since 2026-09-17, `products` (the catalogue mirror; items only since 2026-09-24). A second endpoint of an existing feed is not a second exception — a second SYSTEM would be. The exception is narrow and every part of it is required: a static shared secret from env compared in constant time and failing closed when unset (never a session, never a query param); the service-role client used for ONE thing — calling a single ingest RPC that owns every write; the path excluded from `middleware.ts`; every delivery logged (`erp_sync_events`); 2xx for every delivery the portal chose not to apply, because the sender's outbox retries non-2xx forever. Nothing a browser calls may ever be a POST handler. **The second system is Meta** (user-approved 2026-10-01 for Messenger, 2026-10-02 for WhatsApp): `app/api/whatsapp/v1/webhook` and `app/api/messenger/v1/webhook` — GET answers Meta's one-time handshake only for the verify token; POST takes only deliveries signed `X-Hub-Signature-256` (HMAC of the RAW body with `META_APP_SECRET`, compared in constant time, failing closed when unset) and hands each to its one ingest RPC (`crm_ingest_whatsapp` / `crm_ingest_messenger`), every delivery logged in `crm_channel_events`. The rest of the CRM: `.claude/rules/revenue/crm.md`.
Supabase client — server-side (`lib/supabase/server.ts`) uses the anon key with RLS via SSR cookies. `admin.ts` is the service-role client and BYPASSES RLS entirely. It is `'server-only'` guarded and has exactly EIGHT callers, each with one job: the two Meta webhooks (`app/api/whatsapp/v1/webhook/route.ts`, `app/api/messenger/v1/webhook/route.ts`) and the ERP's two receivers (`app/api/erp/v1/sales-orders/route.ts`, `app/api/erp/v1/products/route.ts`), each calling its one ingest RPC; `app/api/member-queue/route.ts` (the cron-secret queue sweep); `lib/member/server.ts` (a member quote's prices and cost ratios, the member's month through Comm Cal's engine, My honours' kept finishes — each only after the member's own session was authorised); `team/people/invite-actions.ts`; and `lib/erp-sync/feed-key.ts` (the key the ERP generated, kept in Vault). Why each is allowed: `.claude/rules/portal-wide/permissions.md`. Reach for it only when a machine path has no session to act under or a secret must stay out of every session's reach, never to dodge an RLS policy that is merely inconvenient.
Sign out (2026-10-08) — ends THIS device's session only: `auth.signOut({ scope: 'local' })`. Given no options supabase-js signs out `'global'`, and the auth server deletes every session of the account — the phone, the other PC, every tab. The shared accounts (principal@ / finance@ / hr@) are switched on the office PC by Sign out → sign in several times a day, so the Principal's phone and desktop kept landing on /login (auth log: ten global sign-outs of principal@ on Oct 5–7, each followed by "Refresh Token Not Found" elsewhere). `src/lib/sign-out-scope.test.ts` refuses any `auth.signOut(` without it.
Navigation speed (2026-09-26) — a click must answer at once (the whole of it: `.claude/rules/portal-wide/speed.md`). Every route folder with child routes has a `loading.tsx` rendering `RouteSkeleton` (`src/app/route-boundaries.test.ts`). The client router keeps pages five minutes, so a write must `revalidatePath` (or set a cookie) before it redirects, and a component holding unsaved edits must survive a refresh. Warm a page only through `lib/nav-warm.ts`, never an `AUDITED_ROUTES` page; nothing may fire a Server Action on its own after a navigation. A page's independent reads start together (`startRead`, `lib/start-read.ts`); a whole table goes through `fetchAllRowsParallel`, an id list through `fetchByKeys` — never one long `.in()` — and a read or rpc that can pass 1,000 rows is PAGED (PostgREST stops at 1,000 without a word). A SQL function must not call another per row, and under RLS only LEAKPROOF comparisons reach an index.
The installed app (2026-10-06 / 10-10; the whole of it: `.claude/rules/portal-wide/pwa.md`) — a new build is OFFERED (*A new version is ready*, `components/pwa/UpdatePrompt`); only the Revenue app reloads by itself, after 30+ min away — never the portal, whose pages can hold unsaved pay. Every bottom bar, and whatever pads itself clear of one, stands on `var(--safe-bottom)`, never a bare `env(safe-area-inset-bottom)` (`src/lib/safe-area.test.ts`); a Revenue-app sheet that reaches the screen's bottom edge carries `--sheet-safe`. `public/sw.js` caches nothing but `offline.html` — every page is somebody's money.
Aggregate queries — prefer RPC functions (`dashboard_summary`, `get_hr_cost_summary`) over scattered per-field selects. Single round-trip, clearer intent, easier to unit test at SQL level. A balance is SUMMED by the database, never downloaded line by line to be added up: `gl_net_by_account(p_before, p_codes)` (mig `20261008180000`, SECURITY INVOKER so RLS still answers per user) is the Ledger's BALANCE B/F and the Trial Balance — ~3,860 / ~4,230 lines in four / five pages became one row per account (2026-10-08).
Error handling — Server Actions throw, pages use error boundaries, never return `{ data, error }` to the client
Date handling — store as `date` or `timestamptz` in DB, use `dayjs` for formatting. Compare by day (`dayjs().isAfter(x, 'day')`) to avoid timezone edge cases. A month is three letters (DESIGN.md › Date format): an `Intl` format goes through `formatIntlDate()` (`lib/utils.ts`), because en-GB and en-MY write September "Sept" (2026-10-03). TODAY AND THIS MONTH ARE THE OFFICE'S (UTC+8), on both floors (2026-10-09): Vercel and the database both keep UTC, so from 00:00 to 08:00 the machine's today is yesterday and on the 1st its month is last month. In the app: `officeToday()` / `officeMonth()` / `officeTime()` / `officeDay()` / `officeDayStart()` (`lib/office-time.ts`, #237), never a bare `dayjs()` / `new Date()` for a day. In SQL: `(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date`, never `CURRENT_DATE`, `to_char(now(), …)` or `date_trunc('month', now())` (mig `20261009000000` moved all 36 functions; `src/lib/office-clock-sql.test.ts` fails a later migration that brings one back). `now()` as an INSTANT (expiries, "last 30 days", `updated_at`) stays as it is.
Money — `decimal(15,2)` in DB. Display with `formatMoney()` from `lib/utils.ts`. Negative amounts render as red parenthesis notation `(1,000.00)`.
Naming — DB: snake_case, TypeScript: camelCase, Components: PascalCase
Files — one component per file, co-locate related files (`_components/` subfolders per route)
Testing
Framework: Vitest + happy-dom + @testing-library/react (bootstrapped Phase 1.5 Step 1). Run `npm test` (watch) or `npm run test:ci` (single run). CI runs four jobs side by side on every push (`.github/workflows/test.yml`, 2026-10-06 — ~5 min instead of ~10.5 one after another): `unit` (the Vitest suite in two halves, `--shard=N/2`), `sql` (the PGlite checks in `tests/*-sql`), `build` (`next build`, 4 GB heap, `.next/cache` reused) and `worker` (`npm run verify:worker` — builds the Cloudflare worker and renders a real PDF inside workerd). A docs-only change (`**/*.md`, `docs/`, `.design/`) runs none of them. See `TESTING.md`.
Layers: unit (pure helpers in `src/lib/*.test.ts`), integration (Supabase RPC — deferred until billing math in Phase 2 Step 5 needs it), RLS audit (manual via `/qa`), E2E (Playwright MCP during per-step verification, not in CI).
Convention: every bug fix ships with a regression test. Extract pure logic from Server Actions into `src/lib/*.ts` helpers and test the helper (Server Actions themselves pull in next/cache + next/navigation + Supabase SSR cookies, mocking is more trouble than it's worth).
Placeholder pattern: when a fix is planned but not yet implemented, drop a `describe.todo('...')` stub at the expected test file location so it stays indexed without breaking CI.
API routes: test with sample data matching real scenarios
Statutory lookups: test with known values from PDF tables
Director salary: test with the two datasets provided in specs (verify against calculated results)
RLS: test each role can only access what Access Matrix allows — see `docs/access-matrix.md`
See `TESTING.md` at repo root for full layer descriptions + how to add new tests.
Do NOT
Do not hardcode any rates (interest, custom premium, penalty, saving %) — all from Settings/DB
Do not skip RLS — every table must have policies matching Access Matrix
Do not write a helper a row policy calls as `LANGUAGE sql SECURITY DEFINER` — its body is planned again on every call (plpgsql keeps the plan; see Navigation speed › The permission helpers are plpgsql).
Do not leave a SECURITY DEFINER function open to PUBLIC / anon unless it checks the caller itself (`auth.uid()`, `has_perm`, `has_scope` …) — it runs as its owner, so RLS never asks, and Postgres grants EXECUTE to PUBLIC by default: the publishable key every browser holds can call it. A helper only other DEFINER functions call: `REVOKE … FROM PUBLIC, anon, authenticated` + `GRANT … TO service_role` — and "no app code calls it" means its BARE name appears nowhere in `src/`, `scripts/`, `tools/`: a call may put the name on its own line under `.rpc(` (that is how `approve_voucher_batch` was locked by mistake and handed back, mig `20261006050000`). 21 were open, writers and approvals included, until mig `20261006010000` (2026-10-06). And a function handed a user id (`p_user_id` / `p_approver` / `p_created_by`) refuses a JWT caller whose `auth.uid()` is not that id — the approvals do since mig `20261006020000`; the app always hands in `user.id`, which View-as never changes. Journals: the app posts through `post_journal_entry_as_caller` (own name + treasury / admin / hr scope); `post_journal_entry` is the owner's and the service role's (mig `20261006030000`). **A role check must hold for somebody who has NO role (2026-10-09):** `IF v_role NOT IN ('finance', 'principal')` is NULL — not true — when the role is NULL, so it never fires for the publishable key, a self-made sign-up with no portal account, or a switched-off account whose session lives on; ~60 DEFINER functions were guarded only that way, and the publishable key read director payouts and staff allocations through them (checked on prod, rolled back). Since mig `20261009000100`: `current_user_role()` REFUSES (42501) a sign-in with no active portal account (still NULL with no sign-in: anon / service role / the database); EXECUTE on every non-trigger DEFINER function is revoked from PUBLIC + anon except the five row-policy helpers (`current_user_role`, `current_user_department_id`, `current_user_segment`, `has_perm`, `has_scope`); and the schema's default no longer grants anon or PUBLIC EXECUTE on new functions — a function the browser's anon key must call (none today) needs an explicit GRANT. Write a new guard as `IS DISTINCT FROM` / `has_action()` anyway. `tests/member-sql/validate-definer-login.mjs`.
Do not read an NRIC, an account number or a payroll submission's per-person copy straight off its table, or `select('*')` on `hr_staff_costs` / `directors` / `payroll_voucher_lines` / `hr_cost_submissions` — `authenticated` has no SELECT on those columns since mig `20261009050100` (PR4); go through `lib/private-fields.ts`, and ask for `STAFF_ROW_COLUMNS` / `DIRECTOR_ROW_COLUMNS` instead of `*`. A column ADDED to one of those tables is granted to `authenticated` in the same migration (`GRANT SELECT (col) ON … TO authenticated`), or listed in `lib/private-columns.ts` if it is private; a SELECT policy changed on one changes its reader in the same migration — `src/lib/private-columns.test.ts` refuses both otherwise.
Do not `CREATE OR REPLACE` a function from its last copy in `supabase/migrations` without first comparing that copy's body with production's `md5(prosrc)` — functions changed straight on the database drift, and an old copy re-applied silently undoes production's fixes and guards. Nine (the approvals, `post_journal_entry`, `apply_pool_adjustment`, `reopen_director_salary`, `get_payroll_breakdown_by_pool`) were brought back in line by mig `20261006040000` (2026-10-06), which holds them exactly as production runs them. A change made straight on production goes into a migration file the same day.
Do not let Finance access hr_staff_costs or director_payouts detail — use aggregate views
Do not use localStorage for auth — use Supabase Auth sessions
Do not create separate apps — single Next.js app, role-based routing
Do not invent parallel design docs (no `DESIGN-v2.md`, `STYLE.md`, `UI-NOTES.md`, etc) — DESIGN.md is the single source of truth, extend it in place
Do not hardcode hex colors in components — use Tailwind tokens (`text-ink`, `bg-paper`, `text-num-ink`, `border-hairline`, `text-accent`, `text-danger`) backed by CSS vars in `globals.css`
Do not use the superpowers plugin (brainstorming/TDD/writing-plans skills, `docs/superpowers/` plan+spec files) unless really needed — default to working directly; reserve it for genuinely complex multi-step features where the planning overhead pays off

UI Conventions (v3.0 — enforced)
**Read `docs/DESIGN.md` first before adding or amending any UI.** It contains the v3.0 implementation rules + utility class catalog + canonical reference pages.

Six non-negotiable rules every new/amended page must follow:
1. **Page header** — wrap top of page in `<div className="page-head">` containing `<div className="page-eyebrow"><em>I.</em> SECTION · NAME</div>` + `<h1 className="page-title">…</h1>`. Right side may hold an action button.
2. **Money cells use `.num`** — `<td className="num">{formatMoney(x)}</td>`. Negatives get `<span className="neg">`. Hero figures use `text-num-ink` + `tabular` + `tracking-[-0.01em]`.
3. **Data tables use `.ledger-table`** — `<table className="ledger-table">` with bare `<th>` / `<td>`. Class wires up surface bg, zebra rows, hover, hairline borders, padding, and right-aligned `.num`. Stop hand-rolling `<table className="w-full text-sm">…border-b…hover:bg-…`.
4. **Section headings use `.sect-head`** — medium-weight upright sans title + hairline rule extending right + uppercase mono counter. See `src/app/(portal)/statements/page.tsx` for the canonical pattern.
5. **Colors via CSS variables only** — no hex outside `globals.css`. Use `text-ink` / `text-num-ink` / `text-graphite` / `bg-paper` / `bg-surface` / `border-hairline` / `text-accent` / `text-danger` / `text-ledger` / `text-alert` / `text-info`.
6. **A new route folder with child routes gets a `loading.tsx`** that renders `RouteSkeleton` — see Navigation speed under Coding Conventions.
7. **HR's view sits on the white sheet (2026-09-27, DESIGN.md › "Sheet theme").** Every route under `/dashboard` (all four roles' Overview), `/hr-costing`, `/director-salary`, `/director-pool`, `/revenue`, `/claims`, `/team` (People) and `/member-admin` — `lib/sheet-routes.ts` — is drawn by PortalFrame on one white sheet in Comm Cal's month's tone: black lettering, orange `#E99A53` only as a surface (buttons, active tab, markers — never text), walnut for the one primary figure. Open such a page with `StatCards`/`StatCard` (`components/sheet/StatCard.tsx`), not a hero or a figure strip; statuses are `.chip`s; a closing total goes in `<tfoot>`. Extending the tone to another section = add its prefix there and convert the page the same way. Reference: `src/app/(portal)/hr-costing/page.tsx`.

Canonical reference pages (copy these patterns when in doubt):
- Page header + hero number + ledger table → `src/app/(portal)/fund-out/page.tsx`
- Multi-column hero summary → `src/app/(portal)/payments/page.tsx`
- Section-grouped tables → `src/app/(portal)/statements/page.tsx`, `src/app/(portal)/overdue/page.tsx`
- Sidebar (roman numerals + dot/bar markers) → `src/components/layout/Sidebar.tsx`
