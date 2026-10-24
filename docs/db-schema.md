HOUZS Venture Portal — Complete DB Schema
Overview
Tech Stack: Next.js + Supabase + Vercel
Total Tables: 32 (verified against migrations 20260101000001..000009 CREATE TABLE counts)
Categories: Core (4), Treasury (5), Statements (3), Billing (2 — Phase 2), Directors (4 — Phase 3), Pools (3), HR (4 — Phase 3), Statutory (4), Settings (3)
Total RLS policies: 130 (see `supabase/migrations/20260101000011_rls.sql`)
Dashboard aggregation: single `dashboard_summary()` RPC returning JSONB (see `20260101000013_functions.sql` + `20260101000016_dashboard_subsidiaries.sql`)
---
⚡ AMENDMENT 2026-10-08 — The app-wide history (mig `20261008190000`)
`audit_tables` — one row per table of the app (187): table_name PK, label, area, mode
(all / people / none), read_keys text[], key_columns, label_columns, ignore_columns,
omit_columns, diff_only, salary_columns, nric_columns, bank_columns, needs_rule,
actor_column, reason (required when mode = none). Written by `audit_register()` in
migrations — a new table registers itself in its own migration.
`audit_events` (PR1, `20261008120000`) gains `actor_source` (portal / server / database)
and `needs` text[]; written only by the trigger `audit_row_change()` (attached as
`audit_<table>`), read only through `audit_changes()` / `audit_overview()` /
`permission_history()`. `config_audit_log` is SUPERSEDED: its 44 rows were copied into
`audit_events` and its triggers disabled.
---
1. CORE TABLES
1.1 users
```sql
users (
    id              uuid PK DEFAULT gen_random_uuid()
    email           text UNIQUE NOT NULL
    name            text NOT NULL
    role            enum ('principal','finance','hr','dept_manager','revenue_member','staff') NOT NULL
                    -- CHECK role <> 'dept_manager' since 2026-10-17 (users_no_dept_manager): the kind is gone,
                    -- the label stays in the enum for access_log's history
    department_id   uuid FK → departments          -- the person's department (any kind)
    is_active       boolean DEFAULT true
    created_at      timestamptz DEFAULT now()
    updated_at      timestamptz DEFAULT now()
)
```
1.2 companies
```sql
companies (
    id              uuid PK DEFAULT gen_random_uuid()
    name            text NOT NULL                   -- HOUZS Century, The Conts, etc.
    short_code      varchar(10) UNIQUE NOT NULL     -- HC, CONTS, DC, CAR, HK, 2990, OHN, CMI
    tier            enum ('T1','T2','T3','T4')      -- Principal 分配
    is_active       boolean DEFAULT true
    created_at      timestamptz DEFAULT now()
    updated_at      timestamptz DEFAULT now()
)
```
1.3 departments
```sql
departments (
    id              uuid PK DEFAULT gen_random_uuid()
    name            text NOT NULL                   -- Marketing, Finance, HR
    created_at      timestamptz DEFAULT now()
    cost_model      text NOT NULL DEFAULT 'cost_center'   -- 2026-09-30
                    CHECK (cost_model IN ('cost_center','centralized'))
)
-- cost_center：薪水在 Billing Allocation 分给子公司，pool 应该归零（HR / Finance / IT / Director Office）
-- centralized：自己开 invoice 给子公司、钱进自己的 pool、自己付；不进 Billing Allocation（Director / Marketing / Revenue）
-- 只有 permission department_mode（默认 Principal）能切：department_set_cost_model(uuid, text)；
--   切成 centralized 会清掉该部门还在 draft 的 split。读：department_modes()。
-- 没 bill 回去的差额要不要给 Venture Office 吸收，仍是 own_share_billback（Finance 每次开单决定），不跟 mode 走。
```
1.4 approval_requests
```sql
approval_requests (
    id              uuid PK DEFAULT gen_random_uuid()
    request_type    enum (
                      'new_loan','base_rate','tier_change',
                      'new_contract','contract_change',
                      'dept_expense','advance','escalation',
                      'invoice_pool_release','profit_withdrawal'
                    ) NOT NULL
    reference_id    uuid                            -- 关联的 loan/contract/etc ID
    reference_table text                            -- 哪张表
    submitted_by    uuid FK → users NOT NULL
    description     text
    amount          decimal(15,2)                   -- 涉及金额（如有）
    status          enum ('pending','approved','rejected') DEFAULT 'pending'
    approved_by     uuid FK → users                 -- Principal
    approved_at     timestamptz
    notes           text                            -- Principal 备注
    created_at      timestamptz DEFAULT now()
)
```
---
2. TREASURY TABLES
2.1 fund_sources
```sql
fund_sources (
    id              uuid PK DEFAULT gen_random_uuid()
    source_type     enum ('subsidiary_savings','director_loan') NOT NULL
    capital_type    enum ('paid') DEFAULT 'paid'    -- 这张表只记 paid capital
    from_company_id uuid FK → companies             -- subsidiary savings
    from_director_id uuid FK → directors            -- director loan
    amount          decimal(15,2) NOT NULL
    cost_rate       decimal(5,4) NOT NULL           -- 每笔手动填 rate (%/mo)
    lock_in_months  int                             -- 锁定期
    effective_date  date NOT NULL
    maturity_date   date                            -- 自动算：effective + lock_in
    early_withdrawal boolean DEFAULT false
    penalty_on_early decimal(5,4)                   -- 提前赎回 penalty rate
    status          enum ('active','matured','repaid','cancelled') DEFAULT 'active'
    notes           text
    created_by      uuid FK → users NOT NULL
    created_at      timestamptz DEFAULT now()
    updated_at      timestamptz DEFAULT now()
)
```
2.2 loans
```sql
loans (
    id              uuid PK DEFAULT gen_random_uuid()
    company_id      uuid FK → companies NOT NULL
    principal       decimal(15,2) NOT NULL
    base_rate       decimal(5,4) NOT NULL           -- 锁定当时的 base rate
    risk_premium    decimal(5,4) NOT NULL           -- 锁定当时的 tier premium
    effective_rate  decimal(5,4) NOT NULL           -- base_rate + risk_premium
    disbursement_date date
    repayment_terms text
    status          enum ('pending_approval','active','fully_repaid','cancelled') DEFAULT 'pending_approval'
    approved_by     uuid FK → users
    approved_at     timestamptz
    created_by      uuid FK → users NOT NULL
    created_at      timestamptz DEFAULT now()
    updated_at      timestamptz DEFAULT now()
)
```
2.3 repayments
```sql
repayments (
    id              uuid PK DEFAULT gen_random_uuid()
    loan_id         uuid FK → loans NOT NULL
    amount          decimal(15,2) NOT NULL
    payment_type    enum ('principal','interest','penalty','netting') NOT NULL
    payment_date    date NOT NULL
    reference_id    uuid                            -- netting 关联的 statement line
    journal_entry_id uuid FK → journal_entries UNIQUE -- the entry recordRepayment posted for it; Void / the amends follow it (mig 20261021200000). NULL: no entry of its own (an import, a voucher's repayment)
    notes           text
    created_by      uuid FK → users NOT NULL
    created_at      timestamptz DEFAULT now()
)
```
2.4 overdue_records
```sql
overdue_records (
    id              uuid PK DEFAULT gen_random_uuid()
    loan_id         uuid FK → loans NOT NULL
    period_month    date NOT NULL                   -- 哪个月
    overdue_days    int NOT NULL
    overdue_stage   enum ('grace','late_1','late_2','escalation') NOT NULL
    penalty_rate    decimal(5,4)                    -- 当时从 config 读的 rate
    penalty_amount  decimal(15,2)
    status          enum ('pending','paid','escalated') DEFAULT 'pending'
    created_at      timestamptz DEFAULT now()
)
```
2.5 base_rate_history
```sql
base_rate_history (
    id              uuid PK DEFAULT gen_random_uuid()
    quarter         varchar(6) NOT NULL             -- '2025Q2'
    total_paid      decimal(15,2)                   -- paid capital 总额
    total_pool      decimal(15,2)                   -- 总资金池
    weighted_cost   decimal(5,4) NOT NULL           -- 加权资金成本
    op_margin       decimal(5,4) NOT NULL           -- 运营 margin
    base_rate       decimal(5,4) NOT NULL           -- weighted_cost + op_margin
    approved_by     uuid FK → users
    approved_at     timestamptz
    created_at      timestamptz DEFAULT now()
)
```
---
3. SERVICE BILLING TABLES
3.1 service_contracts
```sql
service_contracts (
    id              uuid PK DEFAULT gen_random_uuid()
    department_id   uuid FK → departments           -- 哪个部门的服务
    company_id      uuid FK → companies             -- bill 给谁
    billing_mode    enum (
                      'hr_pool_split',              -- HR 总成本 × %
                      'finance_attribution',        -- Finance 员工归属
                      'marketing_project',          -- Marketing 按项目
                      'fixed_split',                -- Rent / Utility
                      'non_billable'                -- Group expense
                    ) NOT NULL
    description     text
    amount          decimal(15,2)                   -- project mode: 固定金额
    split_pct       decimal(5,4)                    -- pool/fixed_split mode: 比例
    status          enum ('active','completed','cancelled') DEFAULT 'active'
    start_date      date
    end_date        date
    approved_by     uuid FK → users
    created_by      uuid FK → users NOT NULL
    created_at      timestamptz DEFAULT now()
    updated_at      timestamptz DEFAULT now()
)
```
3.2 invoices
```sql
invoices (
    id              uuid PK DEFAULT gen_random_uuid()
    invoice_no      varchar(20) UNIQUE              -- HV-INV-202504-001
    contract_id     uuid FK → service_contracts
    company_id      uuid FK → companies NOT NULL
    period_month    date NOT NULL
    billing_mode    enum ('hr_pool_split','finance_attribution',
                         'marketing_project','fixed_split','non_billable') NOT NULL
    base_amount     decimal(15,2)
    total_amount    decimal(15,2)
    status          enum ('draft','issued','paid','paid_via_netting') DEFAULT 'draft'
    created_by      uuid FK → users NOT NULL
    created_at      timestamptz DEFAULT now()
)
```
3.3 monthly_statements
```sql
monthly_statements (
    id              uuid PK DEFAULT gen_random_uuid()
    company_id      uuid FK → companies NOT NULL
    period_month    date NOT NULL
    total_invoice   decimal(15,2)                   -- invoice items 总额
    total_contra    decimal(15,2)                   -- contra items 总额
    net_amount      decimal(15,2)                   -- invoice - contra
    status          enum ('draft','issued','paid','partial','overdue') DEFAULT 'draft'
    issued_at       timestamptz
    created_by      uuid FK → users
    created_at      timestamptz DEFAULT now()
)
```
3.4 monthly_statement_lines
```sql
monthly_statement_lines (
    id              uuid PK DEFAULT gen_random_uuid()
    statement_id    uuid FK → monthly_statements NOT NULL
    line_type       enum ('invoice','contra') NOT NULL
    direction       enum ('receivable','payable') NOT NULL
    category        enum (
                      'hr_pool','finance_staff',
                      'marketing_project','rent','utility',
                      'loan_repayment','savings_interest','savings_principal',
                      'other'
                    ) NOT NULL
    description     text
    reference_id    uuid                            -- 关联 invoice / loan / fund_source
    amount          decimal(15,2) NOT NULL
    created_at      timestamptz DEFAULT now()
)
```
---
4. DIRECTOR SALARY TABLES
4.1 directors
```sql
directors (
    id              uuid PK DEFAULT gen_random_uuid()
    name            text NOT NULL
    code            varchar(2) UNIQUE NOT NULL       -- WL, MK, WS, WW
    tax_ref_no      varchar(20)                      -- LHDN tax number
    pcb_category    enum ('KA1','KA2','KA3')         -- 1=single, 2=married spouse没工作, 3=married
    children_count  int DEFAULT 0
    weightage       decimal(5,4) NOT NULL            -- 0.85, 0.945, 1.05, 1.155
    min_payout      decimal(15,2) NOT NULL           -- 14400
    status          enum ('active','inactive') DEFAULT 'active'
    created_at      timestamptz DEFAULT now()
    updated_at      timestamptz DEFAULT now()
)
```
4.2 director_ctc
```sql
director_ctc (
    id              uuid PK DEFAULT gen_random_uuid()
    director_id     uuid FK → directors NOT NULL
    company_id      uuid FK → companies NOT NULL
    period_month    date NOT NULL
    basic           decimal(15,2) DEFAULT 0
    kpi             decimal(15,2) DEFAULT 0
    allowance       decimal(15,2) DEFAULT 0          -- without statutory
    employer_epf    decimal(15,2)                    -- 系统查表自动算
    employer_socso  decimal(15,2)
    employer_eis    decimal(15,2)
    total_ctc       decimal(15,2)                    -- 全部加总
    created_by      uuid FK → users NOT NULL
    created_at      timestamptz DEFAULT now()

    UNIQUE (director_id, company_id, period_month)
)
```
4.3 salary_pool
```sql
salary_pool (
    id              uuid PK DEFAULT gen_random_uuid()
    period_month    date UNIQUE NOT NULL
    total_ctc_in    decimal(15,2)                    -- 全部子公司 CTC 总额（含 statutory）
    total_pool      decimal(15,2)                    -- non-statutory 总额 = HV revenue
    basic_ratio     decimal(8,6)                     -- basic / pool
    kpi_ratio       decimal(8,6)                     -- kpi / pool
    allowance_ratio decimal(8,6)                     -- allowance / pool
    total_saving    decimal(15,2)                    -- 5% saving 总额
    total_statutory_surplus decimal(15,2)             -- 可能为负（deficit）
    created_at      timestamptz DEFAULT now()
)
```
4.4 director_payouts
```sql
director_payouts (
    id              uuid PK DEFAULT gen_random_uuid()
    director_id     uuid FK → directors NOT NULL
    period_month    date NOT NULL
    gross_amount    decimal(15,2)                    -- pool × weightage

    -- 5% Saving
    saving_amount   decimal(15,2)
    after_saving    decimal(15,2)

    -- 75% Payroll
    payroll_calc    decimal(15,2)                    -- 75% of after_saving
    advance_amount  decimal(15,2) DEFAULT 0          -- if below min payout
    payroll_gross   decimal(15,2)                    -- max(payroll_calc, min_payout)
    payroll_bk      decimal(15,2)                    -- B+K portion (stat base)
    payroll_allow   decimal(15,2)                    -- Allowance portion (no stat)
    payroll_epf_er  decimal(15,2)
    payroll_epf_ee  decimal(15,2)
    payroll_socso_er decimal(15,2)
    payroll_socso_ee decimal(15,2)
    payroll_eis_er  decimal(15,2)
    payroll_eis_ee  decimal(15,2)
    payroll_pcb     decimal(15,2)                    -- HR 手动填 or 查 Jadual PCB
    payroll_net     decimal(15,2)                    -- gross - ER - EE - PCB

    -- 25% Invoice
    invoice_base    decimal(15,2)
    invoice_bk      decimal(15,2)                    -- B+K portion (stat base)
    invoice_epf_er  decimal(15,2)
    invoice_socso_er decimal(15,2)
    invoice_eis_er  decimal(15,2)
    invoice_total   decimal(15,2)                    -- base + ER statutory

    -- Surplus
    statutory_er_in decimal(15,2)                    -- Director 份额的 ER IN
    statutory_er_out decimal(15,2)                   -- 75% + 25% ER OUT
    statutory_surplus decimal(15,2)                  -- IN - OUT

    -- Advance tracking
    advance_repaid  decimal(15,2) DEFAULT 0          -- 本月扣回
    advance_balance decimal(15,2) DEFAULT 0          -- 累计余额

    status          enum ('draft','confirmed','paid') DEFAULT 'draft'
    created_by      uuid FK → users
    created_at      timestamptz DEFAULT now()

    UNIQUE (director_id, period_month)
)
```
4.4b director_monthly_payroll  (mig 20260717100000)
```sql
-- Director 实际 payroll（InfoTech 导入，verbatim 存档，无重算 trigger）。
-- 与 director_payouts（engine 计算）对账。RLS: Principal + HR only, full CRUD.
director_monthly_payroll (
    id              uuid PK DEFAULT gen_random_uuid()
    period_month    date NOT NULL                    -- 每月1号
    director_id     uuid FK → directors NULL          -- 按名字 fuzzy match；未匹配 = NULL
    employee_code   text DEFAULT ''
    employee_name   text NOT NULL
    dept_name       text DEFAULT ''                  -- 文件里的 department section

    -- 输入项（verbatim，可 inline 编辑）
    basic_salary / statutory_allowance / non_statutory_allowance
    ot_amount / commission_amount / no_pay_amount
    deduction_amount / skbbk_amount                   decimal(15,2) DEFAULT 0

    -- Statutory + 结果（verbatim，无重算）
    epf_er / epf_ee / socso_er / socso_ee / eis_er / eis_ee
    pcb / gross / net                                 decimal(15,2) DEFAULT 0
                                                      -- gross = 文件 Gross − Ded

    source          text ('imported'|'manual') DEFAULT 'imported'
    created_by      uuid FK → users
    created_at / updated_at timestamptz

    UNIQUE (period_month, employee_name)              -- re-import 覆盖 key
)
```
4.5 hv_operating_fund
```sql
hv_operating_fund (
    id              uuid PK DEFAULT gen_random_uuid()
    transaction_type enum (
                      'saving_in',                   -- 5% saving
                      'surplus_in',                  -- statutory surplus（正数时）
                      'deficit_out',                 -- statutory deficit（负数时）
                      'expense_out',                 -- group expense / rent HV portion
                      'profit_in'                    -- HV NP 留存
                    ) NOT NULL
    amount          decimal(15,2) NOT NULL
    description     text
    reference_id    uuid                             -- 关联来源
    reference_table text
    created_by      uuid FK → users
    created_at      timestamptz DEFAULT now()
)
-- 余额 = SUM(in) - SUM(out)，实时算
```
4.6 invoice_payout_pool
```sql
invoice_payout_pool (
    id              uuid PK DEFAULT gen_random_uuid()
    transaction_type enum ('accumulate','release') NOT NULL
    director_id     uuid FK → directors
    amount          decimal(15,2) NOT NULL
    description     text
    release_approved_by uuid FK → users             -- release 时 Principal 批
    release_approved_at timestamptz
    created_at      timestamptz DEFAULT now()
)
-- 余额 = SUM(accumulate) - SUM(release)
```
4.7 dept_pools
```sql
dept_pools (
    id              uuid PK DEFAULT gen_random_uuid()
    department_id   uuid FK → departments NOT NULL
    transaction_type enum ('np_in','expense_out') NOT NULL
    amount          decimal(15,2) NOT NULL
    period_month    date                             -- np_in: 哪个月的 NP
    description     text
    approval_id     uuid FK → approval_requests     -- expense 才有
    created_by      uuid FK → users
    created_at      timestamptz DEFAULT now()
)
-- 余额 = SUM(np_in) - SUM(expense_out)
```
---
5. HR TABLES
5.1 hr_pool_allocation
```sql
hr_pool_allocation (
    id              uuid PK DEFAULT gen_random_uuid()
    department_id   uuid FK → departments NOT NULL   -- HR 或 Finance dept
    company_id      uuid FK → companies NOT NULL
    period_month    date NOT NULL
    split_pct       decimal(5,4) NOT NULL            -- 每月可调
    created_by      uuid FK → users NOT NULL
    created_at      timestamptz DEFAULT now()

    UNIQUE (department_id, company_id, period_month)
)
-- Constraint: 同 department + period_month 的 split_pct 加总 = 1.0
```
0.1 Authorisation  (2026-09-01)
```sql
permission_defs (
    key             text PK                          -- 'treasury', 'hr_costing', ...
    label           text NOT NULL
    section         text NOT NULL                    -- grouping in the matrix UI
    scope           text NOT NULL                    -- admin | treasury | hr | shared | none
    description     text
    sort_order      integer NOT NULL DEFAULT 0
)
role_default_permissions (role user_role, permission_key -> permission_defs)   -- the fallback
title_permissions        (title_id -> titles,  permission_key -> permission_defs)
user_permissions         (user_id -> users,    permission_key, granted boolean)
```
Two levels, and they are not the same thing. A **permission** is what somebody
may DO (module-shaped, one row per matrix tick). A **scope** is what they may
read and write at the table level, and it is DERIVED — a scope is held when any
permission mapped to it is held. RLS asks `has_scope(ARRAY['treasury'])`; the
matrix grants `treasury`. Deriving one from the other is what stops a title
being given a page whose queries then come back empty.

Resolution order in `current_permissions()`: an explicit `user_permissions` row
(allow or deny) → the holder's title, but only once that title has any rows at
all → their role's defaults. That last step is why the cutover changed nobody's
access: no title is configured yet, so every account still resolves through its
role.

The four scopes reproduce the four role sets the 235 role-only policies
collapsed to — admin = {principal}, treasury = {principal, finance},
hr = {principal, hr}, treasury+hr = {principal, finance, hr}. 252 policies were
rewritten onto them; the 16 that mention `dept_manager` still read
`current_user_role()`, because no scope admits dept_manager (its every grant is
row-scoped to its own department). That is why `users.role` remains. (Those
policies went with the kind on 2026-10-17, mig `20261017160000`.)

5.1a titles  (Team module, 2026-09-01)
```sql
titles (
    id              uuid PK DEFAULT gen_random_uuid()
    name            text NOT NULL                    -- CHECK btrim(name) <> ''
    department_id   uuid FK → departments NULL       -- 该 title 属于哪个部门
    level_id        uuid FK → title_levels NULL      -- 在 ladder 的哪一级；NULL = 还没放上去 (2026-09-03)
    is_active       boolean NOT NULL DEFAULT true
    is_department_head boolean NOT NULL DEFAULT false -- 部门主管 (Revenue Director, 2026-09-11)：在 commission ladder 之上，没有 rung、没有 rank、没有 override；整个部门直接 report 给它
    sort_order      integer NOT NULL DEFAULT 0
    created_by      uuid FK → users
    created_at      timestamptz DEFAULT now()
    updated_at      timestamptz DEFAULT now()

    UNIQUE (lower(btrim(name)), department_id) NULLS NOT DISTINCT
)
```
5.1b title_levels  (the ladder, 2026-09-03)
```sql
title_levels (
    id              uuid PK DEFAULT gen_random_uuid()
    rank            smallint NOT NULL                -- 1 = 最低一级；越大越高
    name            text NOT NULL                    -- Assistant / Executive / … / Head of Department（seed 7 级）
    created_at      timestamptz DEFAULT now()
    updated_at      timestamptz DEFAULT now()

    UNIQUE (rank) DEFERRABLE INITIALLY DEFERRED     -- 中间插一级要整体 +1，只在 commit 时查
)
```
One scale for the whole company, not one per department: the org chart compares
ACROSS departments (an IT executive under the Marketing manager), and only a
shared scale can. Several titles may share a rung within one department; a
title with `level_id` NULL is outside the rule. Edited on the Hierarchy page's
Levels tab (`?tab=levels`; the board sat on Roles until 2026-09-05); the roster
sorts by it, top down; RLS
read = signed-in, write = hr scope. `ladder_insert_level(p_rank, p_name)` and
`ladder_delete_level(p_id)` shift the ranks around a change atomically.

The rule, `hr_staff_respects_ladder` (BEFORE INSERT OR UPDATE OF reports_to,
title_id on hr_staff_costs, errcode `23LAD`): nobody reports to a title that
stands LOWER than their own; equal is allowed. Checked in the direction the
change moves — a new line above, a title that rose (against the manager), a
title that fell (against the direct reports) — and NOT re-checked elsewhere, so
a ladder edited after the chart was drawn can leave lines that break it; the
Hierarchy page paints those red and the Levels board counts them. The app
refuses the same moves first (`lib/ladder.ts` — `ladderAllows`, `nextRung`).
Promotion = `nextRung`: the lowest rung above the person's, in their own
department, that has a title on it; several titles → a choice.
Invite User (2026-09-01) writes three rows in order — `auth.users` (service role,
the only use of `lib/supabase/admin.ts`), then `public.users`, then the
`hr_staff_costs` link — and deletes the credential again if either later step
fails. Phone lives on the person (`contact_number`), not on the account, so
there is one source of truth for it.

`reports_to` is the org chart: current state, no history, every department.
Guarded by `hr_staff_costs_reports_to_not_self` (CHECK) and the
`hr_staff_reports_to_no_cycle` trigger.

**One line (2026-09-10, migration `20260910120000`).** Inside a commission
department (`departments.payroll_source = 'commission'`) `reports_to` is also
who earns the override on the person's sales, so `comm_hierarchy` — the
effective-dated position the engine reads — is DERIVED from it by trigger and
never written as an upline by the app:

- `hr_staff_costs_one_line_sync` (AFTER INSERT OR UPDATE OF reports_to,
  title_id, department_id, status) calls `comm_sync_position(staff_id,
  actor)`: upline = `reports_to`; scheme = THAT PERSON's live scheme
  (`comm_home_scheme_for_staff` — their own `home_sub_department_id`, else
  the department's oldest; see "A person's own home" below); rank = the
  title's floor rung (`comm_floor_rank`) when a position is first opened,
  raised to a new title's floor when that stands higher, never lowered. A
  position that started this period (`comm_period_start()`, Malaysian time)
  is edited in place; an older one is closed at the end of last month and
  reopened. Leaving the commission department closes the position; going
  inactive leaves it alone (the month they left in is payroll's call). A title
  with no rung = "no rank yet" = no position. Security definer; not callable
  by clients.
- `hr_staff_costs_commission_line` (BEFORE INSERT OR UPDATE OF reports_to,
  title_id, department_id) refuses, with a sentence: a line across the
  department's edge in either direction, or a department change that would
  leave reports on the other side (`23BND`); inside the department a manager
  whose title may not hold downlines (`comm_staff_can_recruit`, on the
  MANAGER's own base ladder — SRS and above on Fair, any title in IR), or a
  title change to one that may not while somebody reports to them (`23REC`).
  The app says the same sentences first (`lib/hierarchy-boundary.ts`).

The only `comm_hierarchy` write left in the app for the home sub-department is
the rank (Team tab, `setMembershipRank`).

**A person's own home (2026-09-20, migration
`20260920040000_home_sub_department_per_person`).** Which sub-department the
roster describes was the DEPARTMENT's oldest, chosen by `created_at` and by
nobody: every Revenue employee was drawn on Fair whether or not they ever
worked a fair. `hr_staff_costs.home_sub_department_id` is the choice; NULL
keeps the old answer, so the migration moved no one.

- `comm_home_sub_department(staff)` / `comm_home_scheme_for_staff(staff)`
  resolve it — their own choice while it belongs to their department, else
  that department's oldest (the same rule as `comm_scheme_for_department`,
  which stays for questions asked of a department rather than a person).
  SECURITY DEFINER: they answer with an id, and the answer must not depend on
  who is asking. `homeSubDepartmentOf` in `lib/revenue.ts` is the twin.
- `hr_staff_costs_home_sub_department` (BEFORE INSERT OR UPDATE OF
  home_sub_department_id, department_id, title_id) keeps it honest (`23HOM`):
  an active sub-department of the person's own department, with a live
  scheme, and — when the choice is first made — a rung for their company
  title. A department change clears it.
- `employee_chart_lifecycle('remove', …)` on the sub-department somebody is
  based in no longer refuses: while they still hold a membership elsewhere in
  the department, the base MOVES to the oldest of those, and `reports_to` is
  set to the upline they already have on that chart — so the roster starts by
  agreeing with the receiving tree instead of flattening it. Refused when it
  is their only one ("use Terminate employee"), and when anybody still
  reports to them on the company chart.
- `apply_commission_run` raises the COMPANY title only for the run's own
  scheme when that scheme is the person's base, not the department's.

**Memberships per sub-department (2026-09-10, migration `20260910160000`).**
A sub-department is a world of its own, so a person holds one `comm_hierarchy`
row per (scheme, person) — `one_position_per_scheme` replaced
`one_position_at_a_time` — and every row carries the `title_id` held IN THAT
SUB-DEPARTMENT:

- `comm_hierarchy_rank_follows_title` (BEFORE INSERT OR UPDATE OF title_id):
  a membership opened with a title and no rank gets the title's floor rung on
  that scheme; a title raised to one whose floor stands higher raises the
  rank; nothing lowers one. A title with no rung on that ladder cannot open a
  membership (`23RNK`).
- `comm_sync_position` now derives only the HOME sub-department's membership
  (`comm_scheme_for_department` = the department's oldest active
  sub-department), title included; other memberships are the app's
  (`openMembership` / `closeMembership` / `moveMembership` /
  `setMembershipTitle` in `lib/hierarchy-writes.ts`). Leaving the commission
  department closes every membership.
- `comm_title_can_recruit(department, title)` asks the HOME ladder only;
  `comm_title_can_recruit_in(scheme, title)` asks one scheme.
- `apply_commission_run` raises the MEMBERSHIP's title, and the company title
  as well only when the run is the home sub-department's;
  `hr_monthly_payroll.commission_amount` = the SUM of every applied run's
  statement for that person and month (a re-apply replaces its own share).
  `reopen_commission_run` gives back only its own share rather than zeroing.
- Still owed: `sales_import_batches` has no `sub_department_id`, so a period
  has one batch for the whole department — the IR feed needs that column
  before its orders exist (TODOS).

**Revenue Director (2026-09-11, migration `20260915020000_revenue_directors`).**
"Revenue Director 本身不会进入任何 Rank … 整个 Department 都是直接 report to
Revenue Director … FAIR 会 report 给 Chris 和 Peter 两人". A title may HEAD its
department (`titles.is_department_head`); which head(s) a sub-department
reports to is a fact of the sub-department, and the line up to them is derived
on the charts, never written per person (two directors do not fit in one
`reports_to`):

```sql
comm_sub_department_directors (
    sub_department_id uuid FK → comm_sub_departments ON DELETE CASCADE
    staff_id          uuid FK → hr_staff_costs ON DELETE CASCADE
    created_by        uuid FK → users
    created_at        timestamptz DEFAULT now()
    PRIMARY KEY (sub_department_id, staff_id)
)
-- RLS: hr / admin scope, all. Seeded: Fair ← PETER, KRIS; IR ← PETER.
```

- `comm_sub_department_directors_guard` (BEFORE INSERT OR UPDATE): the person
  must be on the roster, in the sub-department's department, and hold a title
  with `is_department_head` (`23DIR`).
- `comm_ranks_no_department_head` and `comm_hierarchy_no_department_head`: a
  head title can hold no rung, and no membership may be opened with a head
  title or by somebody whose company title heads the department (`23DIR`).
  Rules › Title ladder and the Team tab's title pickers leave such titles out.
- `comm_title_can_recruit(department, title)` answers TRUE for a head title
  without a rung, so everybody may report to a head (`hr_staff_commission_line`
  and `lib/hierarchy-boundary.ts` both pass).
- `comm_sync_position`: a head holds no membership (every one they held
  closes, as on leaving the department); and the commission line STOPS below a
  head — `upline_staff_id = reports_to` unless that manager heads the
  department, then null: the leader is the top of the engine's tree and no
  override climbs past. `hr_staff_one_line_sync` re-derives the direct reports
  of anybody who becomes or stops being a head, and deletes their director
  rows when they stop heading that department.
- The app normalises the write: `moveReportingLine` writes null when a person
  in a commission department is dropped on a head (`LineResult.reportsTo` is
  what was written, and an undo restores that). Above the directors sits the
  CEO — a later step (user: "CEO 部分后续再处理").

Job titles as controlled rows, replacing the free-text `hr_staff_costs.designation`
(20 hand-typed spellings, backfilled into 20 titles). RLS: read = any signed-in
user; insert/update = principal + hr; delete = principal. The permission matrix
will hang off this table.

5.2 hr_staff_costs
```sql
hr_staff_costs (
    id              uuid PK DEFAULT gen_random_uuid()
    employee_name   text NOT NULL
    department_id   uuid FK → departments NOT NULL   -- 该员工属于哪个部门
    title_id        uuid FK → titles NULL            -- ON DELETE SET NULL (2026-09-01)
    user_id         uuid FK → users NULL             -- 登录账号，唯一，多数人为 NULL
    reports_to      uuid FK → hr_staff_costs NULL    -- 直属上司，全公司（2026-09-01）
    home_sub_department_id uuid FK → comm_sub_departments NULL
                                                     -- 他 BASED 在哪个 sub-department（2026-09-20）：
                                                     --   roster（reports_to + 公司 title）描述的就是这一张图的 membership。
                                                     --   NULL = 该部门最老的那个（2026-09-20 之前所有人都是这样），
                                                     --   换部门时自动清空
    employee_code   text NULL                        -- HV001, HV002 …（2026-09-12）：trigger 发号 = 全表最大号 + 1（inactive 也算），
                                                     --   一旦有了就不会被清空；partial UNIQUE (employee_code) WHERE status = 'active'
    infotech_code   text NULL                        -- InfoTech 自己的 Emp No（2026-09-12）：两个 import 先按它配人、再按名字；
                                                     --   UNIQUE WHERE NOT NULL；EmpList import 写入，Edit 页可手改
    basic_salary    decimal(15,2) NOT NULL
    allowances      decimal(15,2) DEFAULT 0
    employment_type enum ('salaried','commission_eligible','variable') DEFAULT 'salaried'
                                                     -- variable (2026-09-11) = Director dept: no fixed basic,
                                                     --   the month's figure is keyed each month; the
                                                     --   Add/Edit forms offer it as the "Variable pay" tick
    epf_er          decimal(15,2)                    -- 系统查表
    socso_er        decimal(15,2)
    eis_er          decimal(15,2)
    total_ctc       decimal(15,2)                    -- 系统加总
    status          enum ('active','inactive') DEFAULT 'active'
    employment_status text NULL                      -- 'probation' | 'contract' | 'permanent' | 'part_time'（2026-10-23；contract
                                                     --   2026-10-24）；NULL = 还没设（那天之前的人都是 NULL，HR 逐个设）。
                                                     --   不是 employment_type（那是 pay basis）
    probation_months smallint NULL                   -- 试用期几个月，1–24；只在 probation 时有（CHECK）
    probation_end   date GENERATED ALWAYS             -- 试用期最后一天 = hire_date + months − 1 天（1 Oct + 3 → 31 Dec）；
                                                     --   不是 probation 或没 hire_date 就 NULL
    probation_ack_end date NULL                      -- HR 在铃铛 / 个人页按 Acknowledge 时的那个 end；延长后 ≠ probation_end → 再提醒
    probation_ack_by uuid FK → users NULL            --   谁、几时、名字（probation_acknowledge() 写，trigger 拒绝直接写；不是 probation 就清空）
    probation_ack_name text NULL
    probation_ack_at timestamptz NULL
    contract_months smallint NULL                    -- 合约几个月，1–36（表单给 6/12/18/24/30/36）；只在 contract 时有（CHECK，2026-10-24）
    contract_end    date GENERATED ALWAYS             -- 合约最后一天 = hire_date + months − 1 天（1 Oct + 12 → 30 Sep）；
                                                     --   不是 contract 或没 hire_date 就 NULL；到期前 30 天、15 天各提醒一次（2026-10-24）
    contract_ack_end date NULL                       -- 合约提醒的 Acknowledge，跟 probation_ack_* 一样（2026-10-24）：那个 end；续约后 ≠ → 再提醒
    contract_ack_by uuid FK → users NULL             --   谁、几时、名字（contract_acknowledge() 写，trigger 拒绝直接写；不是 contract 就清空）
    contract_ack_name text NULL
    contract_ack_at timestamptz NULL                 --   这一刻的办公室日子决定它回应第几次提醒（≤ 15 天 = 第二次，否则第一次）
    created_by      uuid FK → users NOT NULL
    created_at      timestamptz DEFAULT now()
    updated_at      timestamptz DEFAULT now()
)
```
**Employment status and the probation reminder (2026-10-23, migration `20261024214500_people_employment_status`).**
Add Staff and the waiting list's Transfer ask the status (and a probation's
period); a person's page edits it, *Confirm as permanent* and *Extend* are its
updates. HR view's bell reads `probation_reviews()` (DEFINER, STABLE: People ·
Edit with the HR scope — everybody active on probation, their end and its
acknowledgement) and lists those ending within 15 days (14 until 2026-10-24) or past
(`lib/employment-status.ts` › `PROBATION_NOTICE_DAYS`); `probation_acknowledge(staff)`
(DEFINER, the person page's box via `tab_write_guard`) writes the
acknowledgement for the end it stands at, under `app.probation_ack`, the one
door trigger `hr_staff_costs_probation_ack` leaves open. `member_transfer_waiting`
has a 12-argument overload (production's body with the two columns in its
INSERT); the 10-argument one calls it with neither.

**Contract (2026-10-24, migration `20261025013000_people_contract_status`).**
A fourth status with its period: `contract_months` (CHECK
`hr_staff_costs_contract_months_check` — 1–36 while on a contract, NULL
otherwise) and `contract_end` generated as `probation_end` is; both granted to
`authenticated` column by column. ~~Nobody is reminded of a contract's end.~~
(Reminded since the same day's next migration, below.)
`member_transfer_waiting` has a 13-argument overload (production's 12-argument
body with `contract_months` in its INSERT); the 12-argument one now calls it with
none. The same day `notify_probation_due` counts 15 days, not 14 (migration
`20261025012000_probation_notice_15_days`).

**Two reminders before a probation or a contract ends — 30 days, then 15 (2026-10-24, migration `20261025046500_people_term_end_reminders`).**
A contract's acknowledgement as a probation's: `contract_ack_end / _by / _name /
_at` (granted to `authenticated`), written only by `contract_acknowledge(staff)`
(DEFINER; People · Edit with the HR scope and the person page's box via
`tab_write_guard`) under `app.contract_ack` — trigger
`hr_staff_costs_contract_ack` refuses a straight write and clears them off a
contract. `contract_reviews()` (DEFINER, STABLE; the same gate) is
`probation_reviews()`'s twin. Each term is reminded twice, and an
acknowledgement answers the reminder that stood on the office's day it was given
(`*_ack_at`: 15 days or fewer before the end the second, else the first) — so
nothing new is stored for a probation. The hourly sweep is
`notify_term_ends(p_now)` (DEFINER, the service role's): both terms,
`data.due = '<probation|contract>:<staff>:<end>:<30|15>'` (a probation's second
also counts the old `probation:<staff>:<end>`), titles *Probation ending · …* /
*Contract ending · …*, the same holders and helper as below.
`notify_probation_due` is left for the sweep deployed before; nothing calls it
after.

**…and on the phone (2026-10-23, migration `20261024223000_probation_push`).**
`notify_probation_due(p_now)` (DEFINER, the service role's alone — the hourly
sweep, `app/api/member-queue`) writes `app_notifications` (kind `people`, ref
`hr_staff` → the person, `data.due = 'probation:<staff>:<end>'`, once per
person told per end; from 9:00 the office's time) for a probation whose last day
is 15 days away or nearer (14 until `20261025012000`), not past, not acknowledged for that end — to each
holder of the topic `people.probation` whom `probation_notice_may(user)` (DEFINER,
the service role's) still finds able to acknowledge it, asked as them: the HR
scope, People · Edit and `tab_write_open('/team/people/[id]', team.edit)`, with
`auth.uid()` pointed at them and put back. Never the person on probation.
`notification_topics_sync` keeps `people.probation` (by that helper) and now
deletes only the topics it manages (it took `it.requests` before);
`notification_topics_forget` spares `people.probation`. Checks widened:
`app_notifications` kind + `people`, ref_kind + `hr_staff`; `notification_topics`
topic + `people.probation`.

**Every topic asked again when it tells (2026-10-24, migration `20261025003000_topics_asked_at_send`).**
`notification_topic_may(user, topic)` (DEFINER, the service role's — other
functions' helper) answers, as that account (`auth.uid()` pointed at them and put
back), whether they may hold the topic now: `hiring.guest` Hiring · Approve +
`tab_write_open('/hiring/requests', hiring.approve)`; `rooms.guest` Meeting rooms ·
Edit + `tab_write_open('/admin/rooms', rooms.edit)`; `member.requests`
`member_is_manager('member_requests_manage')` + `tab_write_open('/member-admin',
member.manage)`; `it.requests` IT requests · View; `people.probation`
`probation_notice_may`. `notify_topic` tells only the holders it finds able;
`notification_topics_sync` keeps a topic by the same question;
`notification_topics_forget` (its triggers unchanged) now deletes only the topics
of accounts switched off — a permission change no longer empties the list.

**Employee codes (2026-09-12, migration `20260915040000_staff_code_sequence`).**
`employee_code` is `HV` + at least three digits, and the database hands it
out: `hr_staff_costs_assign_code` (BEFORE INSERT OR UPDATE OF employee_code)
gives a row saved without one `next_staff_code()` — `format_staff_code(max(
staff_code_number(employee_code)) + 1)` over EVERY row, inactive included, so
a number once used is never used again; a code once held is never cleared (a
blank on the Edit form keeps it). A code given in the write (the InfoTech
import's, a hand-typed one) is kept verbatim. Concurrent inserts are
serialised on an advisory lock. `next_staff_code()` is security definer (the
max is over the whole table, not the caller's RLS view) and callable by any
signed-in user — the Add Staff form shows it as the number the person will
get. The roster was renumbered once by the same migration, from the highest
position to the lowest: the Director department first (CEO = HV001, then the
directors — set by hand afterwards to the user's order, LIM WEI SIANG HV002,
CHAI MENG KEAT HV003, LIM WEI LIANG HV004), then `compareByLadder`'s order
across the company (rung top down, title A→Z, name A→Z, unplaced titles after,
no title last), everybody active before the three who had left, who keep
HV059–HV061; the `TEST-SEP26-*` rows kept their codes. Since then the roster
orders one title's holders by their code (`compareByLadder`, `lib/ladder.ts`
reading `lib/staff-codes.ts`), so the column reads in sequence.

**InfoTech number (2026-09-12, migration `20260915050000_infotech_code`).**
InfoTech numbers people its own way and does not follow the renumbering, so
its "Code" lives in `infotech_code`, unique where present. Both imports — the
payroll summary (`hr-costing/payroll/[period]/import`) and the employee list
(`team/people/import`) — match a file row on it first and on the name second
(`lib/import/staff-match.ts`: case, spacing and punctuation ignored; a name
two people share matches nobody and says so), never on `employee_code`. The
employee-list import writes it: the file's code for a new person (whose HV
code the trigger hands out) and for one it could only match by name, so the
next file finds them by number; the payroll import only reads it. Backfilled
for the 27 people InfoTech had numbered (their pre-renumbering codes,
HV007–HV032 and HVI001; 22 cross-checked against `payroll_voucher_lines`
snapshots). Editable on the person's Edit form ("InfoTech No").

5.3 hr_staff_allocation
```sql
hr_staff_allocation (
    id              uuid PK DEFAULT gen_random_uuid()
    staff_id        uuid FK → hr_staff_costs NOT NULL
    company_id      uuid FK → companies NOT NULL
    period_month    date NOT NULL
    allocation_pct  decimal(5,4) NOT NULL
    created_by      uuid FK → users NOT NULL
    created_at      timestamptz DEFAULT now()

    UNIQUE (staff_id, company_id, period_month)
    FOREIGN KEY (staff_id, period_month) → hr_monthly_payroll (staff_id, period_month)
        ON UPDATE CASCADE ON DELETE CASCADE        -- 2026-09-30
)
-- allocation_pct 是 0–1；同 staff + period_month 加总 ≤ 1.0，余数 = HV own share（不 bill）
-- 2026-09-30：每一行都属于那个月的 payroll row（removed with it）；
--   trigger trg_hr_staff_allocation_follows_payroll：payroll row 过了 draft
--   （completed / submitted / paid）或月份 Total Close → 拒绝 INSERT/UPDATE/DELETE（23PAY）
```
5.4 claims
```sql
claims (
    id              uuid PK DEFAULT gen_random_uuid()
    claim_type      enum ('project','benefit') NOT NULL
    claimant_name   text NOT NULL
    department_id   uuid FK → departments
    company_id      uuid FK → companies             -- 归属哪间子公司（project claim）
    amount          decimal(15,2) NOT NULL
    description     text
    receipt_url     text                             -- 附件
    status          enum ('pending','approved','rejected','paid') DEFAULT 'pending'
    approved_by     uuid FK → users                 -- project: Finance, benefit: HR
    approved_at     timestamptz
    payroll_month   date                             -- benefit: 加进哪个月 payroll
    created_by      uuid FK → users NOT NULL
    created_at      timestamptz DEFAULT now()
)
```
---
6. STATUTORY RATE TABLES
6.1 epf_third_schedule
```sql
epf_third_schedule (
    id              serial PK
    wage_from       decimal(15,2) NOT NULL
    wage_to         decimal(15,2) NOT NULL
    employer        decimal(15,2) NOT NULL
    employee        decimal(15,2) NOT NULL
    part            enum ('A','C','E','F') DEFAULT 'A'  -- A=<60, C=>=60 non-citizen, E=>=60 citizen
)
-- ~350 rows Part A
-- >RM20,000: 用 exact 12% ER / 11% EE（代码处理，不存表）
```
6.2 socso_act4_schedule
```sql
socso_act4_schedule (
    id              serial PK
    wage_from       decimal(15,2) NOT NULL
    wage_to         decimal(15,2) NOT NULL
    employer        decimal(15,2) NOT NULL
    employee        decimal(15,2) NOT NULL
    category        enum ('first','second') DEFAULT 'first'
)
-- 65 rows, ceiling RM6,000
```
6.3 eis_act800_schedule
```sql
eis_act800_schedule (
    id              serial PK
    wage_from       decimal(15,2) NOT NULL
    wage_to         decimal(15,2) NOT NULL
    employer        decimal(15,2) NOT NULL
    employee        decimal(15,2) NOT NULL
)
-- 55 rows, ceiling RM5,000
```
6.4 pcb_jadual
```sql
pcb_jadual (
    id              serial PK
    income_from     decimal(15,2) NOT NULL           -- 月收入下限（扣完 EPF 后）
    income_to       decimal(15,2) NOT NULL           -- 月收入上限
    category        enum ('KA1','KA2','KA3') NOT NULL -- 1=single, 2=married, 3=married+working spouse
    children        int NOT NULL                     -- 0,1,2,3...
    pcb_amount      decimal(15,2) NOT NULL           -- 查出来的 PCB 金额
)
-- LHDN Jadual PCB 完整表
```
---
7. SETTINGS TABLES
7.1 treasury_config
```sql
treasury_config (
    id              uuid PK DEFAULT gen_random_uuid()
    config_key      varchar(50) UNIQUE NOT NULL
    config_value    decimal(15,4) NOT NULL
    description     text
    updated_by      uuid FK → users
    updated_at      timestamptz DEFAULT now()
)
-- Keys: 'op_margin', 'buffer_amount', 'saving_rate'
```
7.2 tier_config
```sql
tier_config (
    id              uuid PK DEFAULT gen_random_uuid()
    tier            enum ('T1','T2','T3','T4') UNIQUE NOT NULL
    premium_rate    decimal(5,4) NOT NULL             -- Principal 可调
    updated_by      uuid FK → users
    updated_at      timestamptz DEFAULT now()
)
-- 4 rows: T1=0%, T2=0.5%, T3=1.0%, T4=1.5%（默认）
```
7.3 overdue_config
```sql
overdue_config (
    id              uuid PK DEFAULT gen_random_uuid()
    stage           enum ('grace','late_1','late_2','escalation') UNIQUE NOT NULL
    days_from       int NOT NULL
    days_to         int                              -- escalation = null (无上限)
    penalty_rate    decimal(5,4) NOT NULL
    updated_by      uuid FK → users
    updated_at      timestamptz DEFAULT now()
)
-- 4 rows: grace 0-7/0%, late_1 8-30/0.5%, late_2 31-60/1.0%, escalation 60+/1.5%（默认）
```
---
TABLE COUNT SUMMARY
Category	Tables	Count
Core	users, companies, departments, approval_requests	4
Treasury	fund_sources, loans, repayments, overdue_records, base_rate_history	5
Service Billing	service_contracts, invoices, monthly_statements, monthly_statement_lines	4
Director Salary	directors, director_ctc, salary_pool, director_payouts, hv_operating_fund, invoice_payout_pool, dept_pools	7
HR	hr_pool_allocation, hr_staff_costs, hr_staff_allocation, claims	4
Statutory	epf_third_schedule, socso_act4_schedule, eis_act800_schedule, pcb_jadual	4
Settings	treasury_config, tier_config, overdue_config	3
TOTAL		31
---
KEY RELATIONSHIPS
```
companies ←─── fund_sources (subsidiary savings)
companies ←─── loans (borrower)
companies ←─── service_contracts (bill to)
companies ←─── monthly_statements (per company)
companies ←─── director_ctc (CTC from each sub)
companies ←─── hr_pool_allocation (split target)
companies ←─── hr_staff_allocation (attribution target)

directors ←─── director_ctc (per director per sub)
directors ←─── director_payouts (monthly payout)
directors ←─── invoice_payout_pool (25% accumulate/release)
directors ←─── fund_sources (director loans)

departments ←── users (their department)
departments ←── dept_pools (pool per dept)
departments ←── service_contracts (service from)
departments ←── hr_staff_costs (employee belongs to)

loans ←──────── repayments
loans ←──────── overdue_records

monthly_statements ←── monthly_statement_lines (invoice + contra)

approval_requests ←── multiple modules (横切)
```
---
NOTES
余额字段不存，实时算： hv_operating_fund, invoice_payout_pool, dept_pools 都用 SUM(in) - SUM(out)
Statutory 查表： EPF/SOCSO/EIS/PCB 全部查表，>RM20K EPF 用 exact % 在代码处理
Rate 不固定： fund_sources 每笔手动填 rate，loan 创建时锁定 rate
PCB： 查 Jadual PCB 表，HR 可手动 override（payroll_pcb 字段直接改）
Audit trail： 所有表有 created_by + created_at，Settings 有 updated_by
Supabase RLS： 用 role + department_id 做 Row Level Security
档案（2026-10-23，搬到 Cloudflare R2）： file_buckets（每个 bucket 的大小上限、类型、公开与否、backend supabase|r2、public_url）+ file_objects（每个档案一行：bucket_id, name, owner, owner_id, metadata{size,mimetype}, created_at — storage.objects 的双胞胎，34 条 policy 原样）。档案本身在 R2；谁能上传 / 看 / 删由 file_objects 的 policy 决定 → .claude/rules/portal-wide/storage.md
