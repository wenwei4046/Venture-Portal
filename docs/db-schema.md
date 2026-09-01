HOUZS Venture Portal — Complete DB Schema
Overview
Tech Stack: Next.js + Supabase + Vercel
Total Tables: 32 (verified against migrations 20260101000001..000009 CREATE TABLE counts)
Categories: Core (4), Treasury (5), Statements (3), Billing (2 — Phase 2), Directors (4 — Phase 3), Pools (3), HR (4 — Phase 3), Statutory (4), Settings (3)
Total RLS policies: 130 (see `supabase/migrations/20260101000011_rls.sql`)
Dashboard aggregation: single `dashboard_summary()` RPC returning JSONB (see `20260101000013_functions.sql` + `20260101000016_dashboard_subsidiaries.sql`)
---
1. CORE TABLES
1.1 users
```sql
users (
    id              uuid PK DEFAULT gen_random_uuid()
    email           text UNIQUE NOT NULL
    name            text NOT NULL
    role            enum ('principal','finance','hr','dept_manager') NOT NULL
    department_id   uuid FK → departments          -- dept_manager 才填
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
)
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
5.1a titles  (Team module, 2026-09-01)
```sql
titles (
    id              uuid PK DEFAULT gen_random_uuid()
    name            text NOT NULL                    -- CHECK btrim(name) <> ''
    department_id   uuid FK → departments NULL       -- 该 title 属于哪个部门
    is_active       boolean NOT NULL DEFAULT true
    sort_order      integer NOT NULL DEFAULT 0
    created_by      uuid FK → users
    created_at      timestamptz DEFAULT now()
    updated_at      timestamptz DEFAULT now()

    UNIQUE (lower(btrim(name)), department_id) NULLS NOT DISTINCT
)
```
`reports_to` is the org chart: current state, no history, every department. It is
NOT `comm_hierarchy`, which is effective-dated because it drives override
commission — the Team canvas draws that line but never writes it. Guarded by
`hr_staff_costs_reports_to_not_self` (CHECK) and the
`hr_staff_reports_to_no_cycle` trigger.

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
    basic_salary    decimal(15,2) NOT NULL
    allowances      decimal(15,2) DEFAULT 0
    epf_er          decimal(15,2)                    -- 系统查表
    socso_er        decimal(15,2)
    eis_er          decimal(15,2)
    total_ctc       decimal(15,2)                    -- 系统加总
    status          enum ('active','inactive') DEFAULT 'active'
    created_by      uuid FK → users NOT NULL
    created_at      timestamptz DEFAULT now()
    updated_at      timestamptz DEFAULT now()
)
```
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
)
-- Constraint: 同 staff + period_month 的 allocation_pct 加总 = 1.0
-- 只有 Finance dept 员工用这张表（per person attribution）
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

departments ←── users (dept_manager)
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
