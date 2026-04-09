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
NEXT_PUBLIC_SUPABASE_ANON_KEY=<eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdpeHBwdG1mdXJ5c2tid2ttaXd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3MzgzOTAsImV4cCI6MjA5MTMxNDM5MH0.7ahinbJZ7VpxeSiOpWznmbTdc_agDQ5kNkaPqPbFe6k>
SUPABASE_SERVICE_ROLE_KEY=<eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdpeHBwdG1mdXJ5c2tid2ttaXd6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTczODM5MCwiZXhwIjoyMDkxMzE0MzkwfQ.evFBJixWz9d3-shRC08X6Rg_3Fviw2AGxvPhIz85pGU>
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
│   │   ├── dashboard/page.tsx
│   │   ├── fund-in/
│   │   ├── fund-out/
│   │   ├── overdue/
│   │   ├── dept-pool/
│   │   ├── billing/
│   │   ├── director-salary/
│   │   ├── hr-costing/
│   │   ├── reports/
│   │   └── settings/
│   └── api/
│       ├── fund-sources/
│       ├── loans/
│       ├── overdue/
│       ├── statements/
│       ├── billing/
│       ├── director-salary/
│       ├── hr/
│       ├── reports/
│       └── settings/
├── components/
│   ├── ui/                         ← Shared UI components
│   ├── charts/                     ← Dashboard charts
│   ├── forms/                      ← Form components
│   └── layout/                     ← Sidebar, TopBar, etc.
├── lib/
│   ├── supabase/
│   │   ├── client.ts               ← Browser client
│   │   ├── server.ts               ← Server client
│   │   └── admin.ts                ← Service role client
│   ├── statutory/
│   │   ├── epf.ts                  ← EPF lookup function
│   │   ├── socso.ts                ← SOCSO lookup function
│   │   ├── eis.ts                  ← EIS lookup function
│   │   └── pcb.ts                  ← PCB Jadual lookup function
│   ├── salary-engine/
│   │   └── calculate.ts            ← Director Salary full calculation
│   ├── auth.ts
│   ├── roles.ts                    ← Role-based access helpers
│   └── utils.ts
├── types/
│   └── index.ts                    ← All TypeScript interfaces
supabase/
├── migrations/                     ← SQL migration files
├── seed/                           ← Seed data (statutory tables, companies, etc.)
docs/
├── db-schema.md                    ← Database schema reference
├── access-matrix.md                ← Role permissions reference
├── module-spec-phase1.md
├── module-spec-phase2.md
├── module-spec-phase3.md
└── api-contracts.md                ← API interface definitions
```
Spec Documents (MUST READ BEFORE CODING)
All specifications are in `/docs/`. These are the source of truth:
db-schema.md — 31 tables, all fields, relationships, constraints
access-matrix.md — 4 roles × 9 modules, RLS patterns, data visibility
module-spec-phase1.md — Dashboard, Fund IN, Fund OUT, Overdue & Netting
module-spec-phase2.md — Dept Pool, Service Billing (5 modes)
module-spec-phase3.md — Director Salary Engine, HR Costing, Reports
ALWAYS reference these docs before implementing any feature.
4 Roles
Role	DB Value	Access
Principal	`principal`	Everything + Approve + Settings
Finance	`finance`	Treasury + Billing + Reports (no individual salary)
HR	`hr`	Staff costs + Director salary + Claims
Dept Manager	`dept_manager`	Own department only
Key Business Rules
Treasury
Subsidiaries deposit savings in HV at negotiated rates (per-deal, not fixed)
HV lends to subsidiaries at Base Rate + Tier Risk Premium
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
Finance CANNOT see individual director salary breakdown — only total payout
Only HR and Principal can see individual salary details
Development Phases
Phase 1 (Current): Treasury Core
Dashboard, Fund IN, Fund OUT, Overdue & Netting, Settings, Auth
Phase 2: Department + Billing
Dept Pool, Service Billing (5 modes), Invoice Generation
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
Server Components by default — Client Components only when needed (forms, charts)
API Routes — use Next.js Route Handlers (`app/api/`)
Supabase client — server-side uses service role for admin ops, client-side uses anon key with RLS
Error handling — always return `{ data, error }` pattern
Date handling — store as `date` or `timestamptz` in DB, use `dayjs` for formatting
Money — `decimal(15,2)` in DB, display with `toLocaleString('en-MY')`
Naming — DB: snake_case, TypeScript: camelCase, Components: PascalCase
Files — one component per file, co-locate related files
Testing
API routes: test with sample data matching real scenarios
Statutory lookups: test with known values from PDF tables
Director salary: test with the two datasets provided in specs (verify against calculated results)
RLS: test each role can only access what Access Matrix allows
Do NOT
Do not hardcode any rates (interest, tier premium, penalty, saving %) — all from Settings/DB
Do not skip RLS — every table must have policies matching Access Matrix
Do not let Finance access hr_staff_costs or director_payouts detail — use aggregate views
Do not use localStorage for auth — use Supabase Auth sessions
Do not create separate apps — single Next.js app, role-based routing
