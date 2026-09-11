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
│   │   ├── team/                    ← the sidebar's **People** section (its own
│   │   │                              category since 2026-09-01, below
│   │   │                              Departments): People Management /
│   │   │                              Hierarchy / Roles / Permissions, four flat
│   │   │                              entries. No tab rail BETWEEN them — the
│   │   │                              sidebar is the only way from page to
│   │   │                              page. Routes stay under /team/*. Roles =
│   │   │                              titles. Hierarchy = the GRAPH, with a
│   │   │                              panel beside it (2026-09-07): three views
│   │   │                              on the header's rule (`?tab=`) — **Org
│   │   │                              chart** (default), **Table** (the same two
│   │   │                              facts as editable rows, in ladder order),
│   │   │                              **Levels** = the **ladder** (`title_levels`,
│   │   │                              one shared scale, 2026-09-03; on Roles
│   │   │                              until 2026-09-05) that the chart obeys,
│   │   │                              promotion climbs and the roster sorts by
│   │   │                              — `lib/ladder.ts`. A SECOND GRAPH rides
│   │   │                              the chart view: the commission tree
│   │   │                              (`comm_hierarchy`), READ beside the staff
│   │   │                              one and still EDITED on Revenue. Clicking
│   │   │                              a card in either centres the other.
│   │   │                              Permissions = the matrix, split off
│   │   │                              2026-09-03. **Employee codes
│   │   │                              (2026-09-12):** `employee_code` = HV001,
│   │   │                              HV002 … numbered from the top of the
│   │   │                              ladder (CEO = HV001) and, from then on,
│   │   │                              handed out by trigger
│   │   │                              `hr_staff_costs_assign_code` = the
│   │   │                              largest HV number on the table + 1
│   │   │                              (inactive rows count; a code is never
│   │   │                              cleared). Add Staff has no code field —
│   │   │                              it shows `next_staff_code()`. Inside one
│   │   │                              title the roster sorts by code
│   │   │                              (`compareByLadder`). Mig
│   │   │                              `20260915040000`.
│   │   ├── director-salary/         (Phase 3)
│   │   ├── hr-costing/              (Phase 3 — staff directory moved to team/)
│   │   │                              payment/ = monthly Payment statement
│   │   │                              (2026-09-11): shared reporting above
│   │   │                              Salary / Statutory tabs. Salary alone
│   │   │                              contains prior-month pay changes.
│   │   │                              Both use Generate by Department or
│   │   │                              Manual generate (select employees),
│   │   │                              with a reviewed snapshot before write.
│   │   │                              Salary coverage: payroll_voucher_lines;
│   │   │                              statutory: payroll_statutory_voucher_lines.
│   │   │                              SOCSO/EIS are separate schemes under
│   │   │                              PERKESO and generated atomically.
│   │   │                              Staff/director statutory sources stay
│   │   │                              in HR custody. Compiled statutory PVs
│   │   │                              allow date/notes edits only. payment_cycle
│   │   │                              includes exact coverage and completion;
│   │   │                              lib/payment-cycle.ts drives reporting.
│   │   │                              DESIGN.md: Payment statement (v3.7).
│   │   ├── revenue/                 ← Revenue Department: [sub]/ = one sub-department
│   │   │                              (Fair, …) with 3 views, reached from the
│   │   │                              SIDEBAR not a tab rail — page.tsx (Commission
│   │   │                              Calculation) / hierarchy / rules — plus
│   │   │                              [sub]/[period]/ runs and products/ (Principal).
│   │   │                              Inside a view, sections get their own nav
│   │   │                              (2026-09-05): rules = 9 sections (`?tab=`)
│   │   │                              in a VERTICAL sidebar since 2026-09-07 —
│   │   │                              nine labels never fitted one rail, so the
│   │   │                              cure for the page's scroll had become a
│   │   │                              scroll over the nav itself. Since
│   │   │                              2026-09-11 a section is in the nav only
│   │   │                              while the Scheme-rules switch that reads
│   │   │                              it is on (`lib/commission/rules-tabs.ts`):
│   │   │                              IR shows Scheme rules / Title ladder /
│   │   │                              Ranks, Fair all nine. The
│   │   │                              ninth, **Ranks**, is the rate catalogue
│   │   │                              `comm_rank_defs` — a rank is percentage
│   │   │                              pay OR a fixed group-incentive package,
│   │   │                              lettered SS, A, B … from the top (packages
│   │   │                              above percentages); the
│   │   │                              Title ladder picks a rank per title and
│   │   │                              never types a rate — `lib/commission/
│   │   │                              ranks.ts`), hierarchy = chart / **Team**
│   │   │                              table (`?tab=team`, the old Rules IX — the
│   │   │                              table sets only the rank, the chart moves
│   │   │                              people).
│   │   │                              **ONE LINE (2026-09-10):** inside a
│   │   │                              commission department who somebody
│   │   │                              REPORTS TO is who earns the override on
│   │   │                              their sales — there is no second line.
│   │   │                              `hr_staff_costs.reports_to` is the fact;
│   │   │                              the position the engine reads
│   │   │                              (`comm_hierarchy`) is DERIVED from it by
│   │   │                              trigger (`hr_staff_costs_one_line_sync`,
│   │   │                              mig 20260910120000): upline = reports_to,
│   │   │                              rank = the title's floor rung when first
│   │   │                              opened, ratcheted up (never down) when
│   │   │                              the title's floor climbs; the only
│   │   │                              hierarchy fact a human sets by hand is
│   │   │                              the rank (Team tab). Both charts move the
│   │   │                              same column through ONE function,
│   │   │                              `moveReportingLine` in
│   │   │                              `lib/hierarchy-writes.ts` ('server-only').
│   │   │                              Two rules of that line, refused before
│   │   │                              the write (`lib/hierarchy-boundary.ts`)
│   │   │                              and again by trigger
│   │   │                              `hr_staff_costs_commission_line` (23BND /
│   │   │                              23REC): it may not cross the department's
│   │   │                              edge, and inside it you may only report
│   │   │                              to a title that may hold downlines (SRS
│   │   │                              and above).
│   │   │                              **REVENUE DIRECTOR (2026-09-11):** a title
│   │   │                              may HEAD its department
│   │   │                              (`titles.is_department_head`, the Head
│   │   │                              tick on People › Roles). It is above the
│   │   │                              ladder — no rung, no membership, no rank,
│   │   │                              no override; the DB refuses all three
│   │   │                              (23DIR) — and everybody may report to it.
│   │   │                              Which director(s) a sub-department
│   │   │                              reports to is a row of
│   │   │                              `comm_sub_department_directors` (Team tab
│   │   │                              › Reports to; seeded Fair ← PETER + KRIS,
│   │   │                              IR ← PETER); the line from the top of every
│   │   │                              tree up to them is DERIVED on both charts
│   │   │                              (`lib/department-heads.ts`), never written
│   │   │                              per person — two directors do not fit one
│   │   │                              `reports_to`. On the REVENUE chart the
│   │   │                              directors are a RAIL above every
│   │   │                              sub-department frame (design A,
│   │   │                              2026-09-12): each director once, A→Z,
│   │   │                              one dashed line per frame they direct
│   │   │                              landing on its TOP EDGE (two directors of
│   │   │                              one frame join on a bus bar; PETER's line
│   │   │                              to IR on a bus of its own), `Reports to
│   │   │                              KRIS · PETER` on the frame's header,
│   │   │                              nothing drawn inside the frame —
│   │   │                              `directorRail` in
│   │   │                              `lib/hierarchy-space-layout.ts`. The
│   │   │                              commission line stops
│   │   │                              below a head: `comm_sync_position` writes
│   │   │                              a null upline for anybody whose
│   │   │                              `reports_to` heads the department, and
│   │   │                              `moveReportingLine` writes null when a
│   │   │                              Revenue person is dropped on one
│   │   │                              (`LineResult.reportsTo` = what landed).
│   │   │                              Mig `20260915020000`. CEO layer: later.
│   │   │                              **MEMBERSHIPS (2026-09-10, later):** a
│   │   │                              sub-department is a world of its own —
│   │   │                              one `comm_hierarchy` row per (person,
│   │   │                              scheme) (`one_position_per_scheme`),
│   │   │                              each with its OWN `title_id`, upline and
│   │   │                              rank (mig 20260910160000). ONE LINE
│   │   │                              applies to the HOME sub-department only
│   │   │                              — the department's oldest
│   │   │                              (`comm_scheme_for_department`,
│   │   │                              `pickHomeSubDepartments` in
│   │   │                              `lib/revenue.ts`); its chart writes
│   │   │                              `reports_to`. Every other sub-department
│   │   │                              (IR) edits its memberships directly:
│   │   │                              `moveMembership` / `openMembership` /
│   │   │                              `closeMembership` / `setMembershipTitle`
│   │   │                              in `lib/hierarchy-writes.ts`, the Team
│   │   │                              tab adds/removes members and sets the
│   │   │                              title held there. The apply-run ratchet
│   │   │                              raises the MEMBERSHIP title, and the
│   │   │                              company title only for the home one;
│   │   │                              `hr_monthly_payroll.commission_amount`
│   │   │                              is the SUM of every applied run for the
│   │   │                              month. Orders are scoped by the batch's
│   │   │                              sub_department_id, including committed
│   │   │                              batch uniqueness and carry-forward.
│   │   │                              The Houzs ERP feed belongs to Fair.
│   │   │                              IR rules: commission spec §15; two layers,
│   │   │                              repeated own sales per group, monthly
│   │   │                              packages and a 4% fallback. SDL retains
│   │   │                              already opened capacity, separate from
│   │   │                              company title/permission grants. Initial
│   │   │                              Full Spec 3×3 enables the fourth line;
│   │   │                              each further opening requires all
│   │   │                              existing lines to qualify in its actual
│   │   │                              opening month (4→5, 5→6, onward). Unused
│   │   │                              qualification cannot be banked for a weak
│   │   │                              later month. Later groups use the same
│   │   │                              repeated-own target and fixed package.
│   │   ├── reports/                 (Phase 3)
│   │   └── settings/                ← 8 tabs: treasury / overdue / splits / directors / companies / banks / periods / simulator
│   └── api/erp/v1/                 ← the ONE machine endpoint: the Houzs ERP live
│                                      feed's receiver (sales-orders POST + health
│                                      GET). The only POST route handler in the app —
│                                      see the machine-ingest exception under Coding
│                                      Conventions. Everything else stays Server Actions.
├── components/
│   └── layout/                     ← Sidebar, TopBar
├── lib/
│   ├── supabase/
│   │   ├── client.ts               ← Browser client (anon key + RLS)
│   │   ├── server.ts               ← Server client (anon key + RLS via SSR cookies)
│   │   ├── admin.ts                ← Service role client. BYPASSES RLS. 'server-only',
│   │   │                              built on FIRST USE not at import time. Exactly two
│   │   │                              callers: the ERP receiver and team/people invites.
│   │   │                              A third is a decision, not a detail.
│   │   └── database.types.ts       ← Generated from Supabase
│   ├── auth.ts                     ← requireAuth / requireRole helpers
│   ├── roles.ts                    ← canAccess* helpers for sidebar visibility
│   └── utils.ts                    ← formatMoney / formatDate / cn / dayjs helpers
├── test/
│   └── setup.ts                    ← Vitest + jest-dom matcher setup
├── types/
│   └── index.ts                    ← All TypeScript interfaces
├── middleware.ts                   ← Supabase Auth session refresh + redirect gating
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
Permissions (2026-09-01 — replaced the four hard-coded roles)
Every gate in the portal reads a PERMISSION, not a role. A permission is granted
by a TITLE (Team → Role & Permission), with a per-person exception available on
somebody's page. `permission_defs` is the catalog; `has_scope()` derives the
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
`users.role` survives ONLY for that fallback and for the 16 dept_manager
row-scoped policies no scope can express. Do not add new gates that read it.

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
Writes — use Server Actions (`'use server'`), NOT API Route Handlers. Every action calls `requireRole(...)` at entry.
Read-only file downloads (PDF, CSV, ZIP binary streams) — GET Route Handlers (`app/**/route.ts`) are OK because Server Actions can't stream binary responses cleanly. Still call `requireRole(...)` at entry. Never accept write-side params — POST/PUT/DELETE route handlers remain forbidden. Locked by user 2026-04-17 (Spec 5 blocker Q5).
Machine ingest — the ONE exception to the rule above (2026-09-05, ERP live sync): another SYSTEM pushing data in (the Houzs ERP's database via pg_net) cannot call a Server Action and has no session, so it gets a POST Route Handler under `app/api/<system>/v<n>/`. The exception is narrow and every part of it is required: a static shared secret from env compared in constant time and failing closed when unset (never a session, never a query param); the service-role client used for ONE thing — calling a single ingest RPC that owns every write; the path excluded from `middleware.ts`; every delivery logged (`erp_sync_events`); 2xx for every delivery the portal chose not to apply, because the sender's outbox retries non-2xx forever. Nothing a browser calls may ever be a POST handler.
Supabase client — server-side (`lib/supabase/server.ts`) uses the anon key with RLS via SSR cookies. `admin.ts` is the service-role client and BYPASSES RLS entirely. It is `'server-only'` guarded and has exactly two callers: `app/api/erp/v1/sales-orders/route.ts` (which uses it for one thing — calling the ingest RPC) and `team/people/invite-actions.ts`. Reach for it only when a machine path has no session to act under, never to dodge an RLS policy that is merely inconvenient.
Aggregate queries — prefer RPC functions (`dashboard_summary`, `get_hr_cost_summary`) over scattered per-field selects. Single round-trip, clearer intent, easier to unit test at SQL level.
Error handling — Server Actions throw, pages use error boundaries, never return `{ data, error }` to the client
Date handling — store as `date` or `timestamptz` in DB, use `dayjs` for formatting. Compare by day (`dayjs().isAfter(x, 'day')`) to avoid timezone edge cases.
Money — `decimal(15,2)` in DB. Display with `formatMoney()` from `lib/utils.ts`. Negative amounts render as red parenthesis notation `(1,000.00)`.
Naming — DB: snake_case, TypeScript: camelCase, Components: PascalCase
Files — one component per file, co-locate related files (`_components/` subfolders per route)
Testing
Framework: Vitest + happy-dom + @testing-library/react (bootstrapped Phase 1.5 Step 1). Run `npm test` (watch) or `npm run test:ci` (single run). CI runs two jobs on every push (`.github/workflows/test.yml`): `test` (tests + `next build`) and `worker` (`npm run verify:worker` — builds the Cloudflare worker and renders a real PDF inside workerd). See `TESTING.md`.
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
Do not let Finance access hr_staff_costs or director_payouts detail — use aggregate views
Do not use localStorage for auth — use Supabase Auth sessions
Do not create separate apps — single Next.js app, role-based routing
Do not invent parallel design docs (no `DESIGN-v2.md`, `STYLE.md`, `UI-NOTES.md`, etc) — DESIGN.md is the single source of truth, extend it in place
Do not hardcode hex colors in components — use Tailwind tokens (`text-ink`, `bg-paper`, `text-num-ink`, `border-hairline`, `text-accent`, `text-danger`) backed by CSS vars in `globals.css`
Do not use the superpowers plugin (brainstorming/TDD/writing-plans skills, `docs/superpowers/` plan+spec files) unless really needed — default to working directly; reserve it for genuinely complex multi-step features where the planning overhead pays off

UI Conventions (v3.0 — enforced)
**Read `docs/DESIGN.md` first before adding or amending any UI.** It contains the v3.0 implementation rules + utility class catalog + canonical reference pages.

Five non-negotiable rules every new/amended page must follow:
1. **Page header** — wrap top of page in `<div className="page-head">` containing `<div className="page-eyebrow"><em>I.</em> SECTION · NAME</div>` + `<h1 className="page-title">…</h1>`. Right side may hold an action button.
2. **Money cells use `.num`** — `<td className="num">{formatMoney(x)}</td>`. Negatives get `<span className="neg">`. Hero figures use `text-num-ink` + `tabular` + `tracking-[-0.01em]`.
3. **Data tables use `.ledger-table`** — `<table className="ledger-table">` with bare `<th>` / `<td>`. Class wires up surface bg, zebra rows, hover, hairline borders, padding, and right-aligned `.num`. Stop hand-rolling `<table className="w-full text-sm">…border-b…hover:bg-…`.
4. **Section headings use `.sect-head`** — medium-weight upright sans title + hairline rule extending right + uppercase mono counter. See `src/app/(portal)/statements/page.tsx` for the canonical pattern.
5. **Colors via CSS variables only** — no hex outside `globals.css`. Use `text-ink` / `text-num-ink` / `text-graphite` / `bg-paper` / `bg-surface` / `border-hairline` / `text-accent` / `text-danger` / `text-ledger` / `text-alert` / `text-info`.

Canonical reference pages (copy these patterns when in doubt):
- Page header + hero number + ledger table → `src/app/(portal)/fund-out/page.tsx`
- Multi-column hero summary → `src/app/(portal)/payments/page.tsx`
- Section-grouped tables → `src/app/(portal)/statements/page.tsx`, `src/app/(portal)/overdue/page.tsx`
- Sidebar (roman numerals + dot/bar markers) → `src/components/layout/Sidebar.tsx`
