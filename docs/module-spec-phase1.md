HOUZS Venture Portal — Module Spec (Phase 1)
Phase Plan
Phase	Modules	Timeline
Phase 1	Dashboard, Fund IN, Fund OUT, Overdue & Netting	Month 1-2
Phase 2	Dept Pool, Service Billing	Month 3-4
Phase 3	Director Salary Engine, HR Costing, Reports	Month 5-6
---
MODULE 1: DASHBOARD
Purpose
一页看完：钱从哪来、去了哪、还剩多少、有没有问题。
Who Can Access
Principal: 全部 + Approval Queue + Settings 入口
Finance: 全部（无 Approval Queue / Settings）
UI Layout
Row 1: 数字卡片（4 张）
```
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ Total    │ │ Free     │ │ Net      │ │ NP       │
│ Pool     │ │ Cash     │ │ Spread   │ │ (→ P&L)  │
│ RM X.XM  │ │ RM X.XM  │ │ X.XX%    │ │ RM X.XK  │
└──────────┘ └──────────┘ └──────────┘ └──────────┘
```
Row 2: 左 — Fund Source Breakdown（饼图）/ 右 — Fund Allocation Waterfall（瀑布图）
饼图数据源:
```sql
-- Paid Capital
SELECT SUM(amount) as paid_total 
FROM fund_sources WHERE status = 'active';

-- Free Capital（从多个来源 aggregate）
-- HV Operating Fund 余额
-- Dept Pool 总余额
-- Billing Float（未收 invoice）
-- Invoice Payout Pool 余额
```
瀑布图数据源:
```
Total Pool
→ Loans Outstanding: SUM(principal - repaid) FROM loans WHERE status = 'active'
→ Dept Pool: SUM(np_in - expense_out) FROM dept_pools
→ Director Salary: 当月待发 payroll（from salary_pool）
→ Buffer: FROM treasury_config WHERE config_key = 'buffer_amount'
→ Billing Float: SUM(total_amount) FROM invoices WHERE status IN ('draft','issued')
→ Invoice Payout Pool: SUM(accumulate - release) FROM invoice_payout_pool
→ HV Operating Fund: SUM(in - out) FROM hv_operating_fund
→ Free Cash: Total - all above
```
Row 3: 左 — Free Cash Trend（折线图 12 个月）/ 右 — Loan Portfolio Health（横向堆叠条形图）
折线图:
X 轴: 过去 12 个月
Y 轴: Free Cash 金额
加一条 buffer 警戒线
Free Cash < Buffer → 红色区域
条形图:
```sql
SELECT 
    c.name,
    SUM(CASE WHEN or2.overdue_stage = 'grace' OR or2.id IS NULL THEN l.principal - COALESCE(paid,0) ELSE 0 END) as normal,
    SUM(CASE WHEN or2.overdue_stage = 'late_1' THEN l.principal - COALESCE(paid,0) ELSE 0 END) as late1,
    SUM(CASE WHEN or2.overdue_stage = 'late_2' THEN l.principal - COALESCE(paid,0) ELSE 0 END) as late2,
    SUM(CASE WHEN or2.overdue_stage = 'escalation' THEN l.principal - COALESCE(paid,0) ELSE 0 END) as escalation
FROM loans l
JOIN companies c ON l.company_id = c.id
LEFT JOIN overdue_records or2 ON or2.loan_id = l.id
WHERE l.status = 'active'
GROUP BY c.name;
```
Row 4: Net Margin Overview（数字卡片 + 明细）
```
┌─────────────────────────────────────────────┐
│  Weighted Cost of Capital:     0.375%/mo    │
│  Average Lending Rate:         1.175%/mo    │
│  NET SPREAD:                   0.800%/mo    │
│                                             │
│  This Month Interest Income:   RM XX,XXX    │
│  This Month Interest Expense:  RM XX,XXX    │
│  NET INTEREST INCOME:          RM XX,XXX    │
└─────────────────────────────────────────────┘
```
数据源:
```sql
-- Interest Income = 所有 active loan 的月利息（基于 outstanding，不是原始 principal）
-- outstanding = principal - sum(principal repayments)
WITH loan_outstanding AS (
    SELECT
        l.id,
        l.effective_rate,
        l.principal - COALESCE(SUM(r.amount) FILTER (WHERE r.payment_type = 'principal'), 0) AS outstanding
    FROM loans l
    LEFT JOIN repayments r ON r.loan_id = l.id
    WHERE l.status = 'active'
    GROUP BY l.id, l.effective_rate, l.principal
)
SELECT SUM(outstanding * effective_rate) AS monthly_interest_income
FROM loan_outstanding;

-- Interest Expense = 所有 active fund source 的月成本
SELECT SUM(fs.amount * fs.cost_rate) as monthly_interest_expense
FROM fund_sources fs WHERE fs.status = 'active';
```
Row 5: Upcoming Cash Flow（未来 30 天时间轴）
```
Timeline:
  Apr 15: Loan #003 interest due RM4,000 (HC)
  Apr 20: Savings maturity RM50,000 (2990) ← 要还本金
  Apr 25: Director Salary payout RM XX,XXX
  Apr 30: Monthly billing collection RM XX,XXX
```
Row 6 (Principal only): Approval Queue
```
┌─────────────────────────────────────────────┐
│  Pending Approvals (3)                      │
│                                             │
│  🔴 New Loan - Carres RM100K      [Review] │
│  🟡 Q2 Base Rate Revaluation      [Review] │
│  🟢 Dept Expense - Marketing RM2K [Review] │
└─────────────────────────────────────────────┘
```
数据源:
```sql
SELECT * FROM approval_requests 
WHERE status = 'pending' 
ORDER BY created_at ASC;
```
Row 7: Alert Panel
```
Alerts:
  ⚠️ Carres loan overdue 15 days (Late 1)
  ⚠️ Free Cash below buffer (RM XX vs RM XX)
  ⚠️ 2990 savings maturing in 7 days (RM50K)
  ⚠️ Director advance balance RM6,248 cumulative
```
Alert 触发条件:
`overdue_records` 有 pending 记录
Free Cash < `treasury_config.buffer_amount`
`fund_sources.maturity_date` < NOW() + 30 days
`director_payouts.advance_balance` > 0（累计）
API Endpoints
```
GET /api/dashboard/summary          → 数字卡片
GET /api/dashboard/fund-breakdown   → 饼图
GET /api/dashboard/fund-allocation  → 瀑布图
GET /api/dashboard/free-cash-trend  → 折线图
GET /api/dashboard/loan-health      → 条形图
GET /api/dashboard/net-margin       → Margin 数字
GET /api/dashboard/cash-flow        → 时间轴
GET /api/dashboard/approvals        → Approval queue (Principal only)
GET /api/dashboard/alerts           → 预警
```
Data Refresh
不需要 cron job。每次打开 Dashboard 调 API 实时算。Supabase edge function + SQL view 足够。
---
MODULE 2: FUND IN
Purpose
记录所有进入 Treasury 的 paid capital，追踪每笔的来源、rate、lock-in。
Who Can Access
Finance: 读写
Principal: 只读 + 审批
Data Types
Source Type	录入方式	字段
`subsidiary_savings`	Finance 手动	from_company, amount, cost_rate, lock_in_months
`director_loan`	Finance 手动	from_director, amount, cost_rate, lock_in_months
Free capital（5% saving、statutory surplus）不在这张表，由 Director Salary Engine 写入 `hv_operating_fund` 表。
UI Pages
Page 1: Fund Source List
```
┌──────────────────────────────────────────────────────────────┐
│  Fund Sources                              [+ New Source]    │
│                                                              │
│  Filter: [All Types ▼] [All Status ▼] [Date Range]          │
│                                                              │
│  ┌────────┬──────────┬────────┬───────┬────────┬──────────┐ │
│  │ Type   │ From     │ Amount │ Rate  │ Lock-in│ Status   │ │
│  ├────────┼──────────┼────────┼───────┼────────┼──────────┤ │
│  │ Sub Sav│ HC       │ 200K   │ 0.8%  │ 12 mo  │ Active   │ │
│  │ Sub Sav│ 2990     │ 150K   │ 0.6%  │ 6 mo   │ Active   │ │
│  │ Dir Loan│ WL      │ 50K    │ 1.0%  │ 12 mo  │ Active   │ │
│  └────────┴──────────┴────────┴───────┴────────┴──────────┘ │
│                                                              │
│  Summary: Total Paid Capital RM400K                          │
│           Weighted Avg Cost: 0.75%/mo                        │
└──────────────────────────────────────────────────────────────┘
```
Page 2: Create New Fund Source（Finance only）
```
┌──────────────────────────────────────────────┐
│  New Fund Source                             │
│                                              │
│  Type:        [Subsidiary Savings ▼]         │
│  From:        [Select Company ▼]             │
│  Amount:      [RM ________]                  │
│  Rate (%/mo): [________]                     │
│  Lock-in:     [__ months]                    │
│  Start Date:  [________]                     │
│  Notes:       [________________________]     │
│                                              │
│               [Cancel]  [Submit]             │
└──────────────────────────────────────────────┘
```
Submit 后:
写入 `fund_sources` 表，status = 'active'
`maturity_date` = effective_date + lock_in_months
Dashboard 实时更新
Page 3: Fund Source Detail（点进去）
完整信息
Interest payment history（每月 HV 付多少利息给这个来源）
Maturity countdown
[Repay] 按钮（到期还本）
Business Logic
Base Rate 影响
每次 fund source 新增/修改/到期，系统自动重算：
```
加权资金成本 = Σ(active amount × cost_rate) / Σ(active amount)
```
显示在 Dashboard Net Margin panel，但不自动改 Base Rate（那是每季度 Principal 审批的）。
Maturity Alert
`maturity_date` - 30 days → 触发 Dashboard alert。
API Endpoints
```
GET    /api/fund-sources                → 列表 + 汇总
GET    /api/fund-sources/:id            → 明细
POST   /api/fund-sources                → 创建（Finance only）
PATCH  /api/fund-sources/:id            → 编辑（Finance only）
PATCH  /api/fund-sources/:id/repay      → 到期还本（Finance only）
```
---
MODULE 3: FUND OUT
Purpose
追踪每笔借出：借给谁、多少钱、什么 rate、还了多少、还欠多少。
Who Can Access
Finance: 读写（创建 loan、录入 repayment）
Principal: 只读 + 审批 + 设定
UI Pages
Page 1: Loan List
```
┌──────────────────────────────────────────────────────────────┐
│  Loans                                      [+ New Loan]     │
│                                                              │
│  Filter: [All Companies ▼] [All Status ▼] [All Tiers ▼]     │
│                                                              │
│  ┌──────────┬────────┬───────┬──────┬───────────┬──────────┐│
│  │ Company  │ Princ. │ Rate  │ Tier │ Outstanding│ Status   ││
│  ├──────────┼────────┼───────┼──────┼───────────┼──────────┤│
│  │ HC       │ 100K   │ 1.18% │ T2   │ 75K       │ Active   ││
│  │ Carres   │ 50K    │ 1.68% │ T3   │ 50K       │ Late 1   ││
│  │ Hookka   │ 80K    │ 0.68% │ T1   │ 60K       │ Active   ││
│  └──────────┴────────┴───────┴──────┴───────────┴──────────┘│
│                                                              │
│  Total Outstanding: RM185K                                   │
└──────────────────────────────────────────────────────────────┘
```
Page 2: Create New Loan（Finance only）
```
┌──────────────────────────────────────────────┐
│  New Loan                                    │
│                                              │
│  Company:     [Select ▼]                     │
│  → Tier:      T2 (auto-display)              │
│  → Rate:      1.175%/mo (auto-calc)          │
│    Base Rate:  0.675%                         │
│    + Premium:  0.500% (T2)                    │
│                                              │
│  Principal:   [RM ________]                  │
│  Terms:       [________________________]     │
│                                              │
│  ⓘ Rate locked at creation.                  │
│  ⓘ Requires Principal approval.              │
│                                              │
│               [Cancel]  [Submit for Approval]│
└──────────────────────────────────────────────┘
```
Submit 后:
写入 `loans` 表，status = 'pending_approval'
写入 `approval_requests` 表
出现在 Principal 的 Approval Queue
Principal approve → status = 'active'，Finance 放款
Page 3: Loan Detail（点进去）
```
┌──────────────────────────────────────────────┐
│  Loan #001 — HOUZS Century                  │
│                                              │
│  Principal:    RM100,000                     │
│  Rate:         1.175%/mo (Base 0.675 + T2)   │
│  Disbursed:    2025-01-15                    │
│  Outstanding:  RM75,000                      │
│  Overdue:      None                          │
│                                              │
│  Monthly Interest: RM75,000 × 1.175% = RM881│
│                                              │
│  ── Repayment History ──────────────         │
│  2025-04-01  Interest    RM1,175  [paid]     │
│  2025-03-01  Interest    RM1,175  [paid]     │
│  2025-02-28  Principal   RM25,000 [paid]     │
│  2025-02-01  Interest    RM1,175  [paid]     │
│                                              │
│  [+ Record Repayment]                        │
└──────────────────────────────────────────────┘
```
Page 4: Record Repayment（Finance only）
```
┌──────────────────────────────────────────────┐
│  Record Repayment — Loan #001                │
│                                              │
│  Type:    [Principal ▼] / Interest / Penalty │
│  Amount:  [RM ________]                      │
│  Date:    [________]                         │
│  Notes:   [________________________]         │
│                                              │
│               [Cancel]  [Submit]             │
└──────────────────────────────────────────────┘
```
Page 5: Base Rate Calculator（每季度）
```
┌──────────────────────────────────────────────────────┐
│  Q2 2025 Base Rate Calculation                       │
│                                                      │
│  Paid Capital:                                       │
│    HC:      RM200K × 0.80% = RM1,600/mo             │
│    2990:    RM150K × 0.60% = RM900/mo                │
│    Dir WL:  RM50K  × 1.00% = RM500/mo               │
│    Total Paid: RM400K, Cost: RM3,000/mo              │
│                                                      │
│  Total Pool: RM800K                                  │
│  Weighted Avg Cost: 3,000 / 800K = 0.375%/mo         │
│  Op Margin: 0.300%                                   │
│  BASE RATE: 0.675%/mo                                │
│                                                      │
│  Tier Rates:                                         │
│    T1: 0.675% + 0.000% = 0.675%                     │
│    T2: 0.675% + 0.500% = 1.175%                     │
│    T3: 0.675% + 1.000% = 1.675%                     │
│    T4: 0.675% + 1.500% = 2.175%                     │
│                                                      │
│  Current Base Rate: 0.650% (Q1 2025)                 │
│  Proposed: 0.675% (+0.025%)                          │
│                                                      │
│            [Submit for Approval]  (Finance)           │
│            [Approve] [Reject]     (Principal)         │
└──────────────────────────────────────────────────────┘
```
Business Logic
Rate Lock
Loan rate 创建时锁定：
```
effective_rate = current_base_rate + tier_premium
```
后续 Base Rate 重算不影响已有 loan。
Free Pool Priority
```python
# 借钱时，系统记录但不区分资金来源
# 真正影响的是 Dashboard 的 free cash 计算
# Free Cash = Total Pool - Loans - Dept Pool - Buffer - Invoice Pool - Operating Fund
# 如果 Free Cash 变负 → Alert
```
Interest Calculation
```python
# 每月月底系统自动算（或 Finance 手动触发）
for loan in active_loans:
    monthly_interest = loan.outstanding * loan.effective_rate
    # 生成 interest due record
    # 如果到期未付 → 进 overdue_records
```
API Endpoints
```
GET    /api/loans                       → 列表 + 汇总
GET    /api/loans/:id                   → 明细 + repayment history
POST   /api/loans                       → 创建（Finance, 需审批）
POST   /api/loans/:id/repayments       → 录入还款（Finance）
GET    /api/base-rate/calculate         → 计算当季 base rate
POST   /api/base-rate/submit           → 提交审批（Finance）
```
---
MODULE 4: OVERDUE & NETTING
Purpose
追踪逾期、计算 penalty、生成 Monthly Consolidated Statement（invoice + contra）。
Who Can Access
Finance: 读写（确认 netting、生成 statement）
Principal: 只读 + 审批（escalation tier 降级）+ 设定（penalty rates）
UI Pages
Page 1: Overdue Dashboard
```
┌──────────────────────────────────────────────────────────────┐
│  Overdue Status                                              │
│                                                              │
│  ┌──────────┬──────┬──────┬──────────┬─────────┬───────────┐│
│  │ Company  │ Loan │ Days │ Stage    │ Penalty │ Action    ││
│  ├──────────┼──────┼──────┼──────────┼─────────┼───────────┤│
│  │ Carres   │ #002 │ 15d  │ 🟡 Late 1│ RM250   │ [View]    ││
│  │ Hookka   │ #005 │ 75d  │ 🔴 Escal.│ RM1,200 │ [Escalate]││
│  └──────────┴──────┴──────┴──────────┴─────────┴───────────┘│
│                                                              │
│  Total Penalty Outstanding: RM1,450                          │
└──────────────────────────────────────────────────────────────┘
```
Page 2: Monthly Consolidated Statement（per company）
```
┌──────────────────────────────────────────────────────────────┐
│  Monthly Statements                    [Generate Statements] │
│                                                              │
│  Period: [April 2025 ▼]                                      │
│                                                              │
│  ┌──────────┬───────────┬──────────┬──────────┬────────────┐│
│  │ Company  │ Invoice   │ Contra   │ Net      │ Status     ││
│  ├──────────┼───────────┼──────────┼──────────┼────────────┤│
│  │ HC       │ RM17,150  │ -RM11,600│ RM5,550  │ Draft      ││
│  │ The Conts│ RM9,600   │ -RM0     │ RM9,600  │ Draft      ││
│  │ Carres   │ RM8,400   │ -RM3,000 │ RM5,400  │ Draft      ││
│  └──────────┴───────────┴──────────┴──────────┴────────────┘│
└──────────────────────────────────────────────────────────────┘
```
Page 3: Statement Detail（点进去）
```
┌──────────────────────────────────────────────────────────────┐
│  HOUZS Century — April 2025                     [Issue] [PDF]│
│                                                              │
│  ── INVOICE ITEMS ──────────────────────────────             │
│  HR Pool (50%)                          RM12,500             │
│  Finance Staff - Employee A (100%)       RM5,750             │
│  Finance Mgmt Fee (50%)                  RM3,500             │
│  Rent (30%)                              RM3,000             │
│  Utility (30%)                             RM300             │
│  Marketing - Project X                   RM2,100             │
│  Subtotal Invoice:                      RM27,150             │
│                                                              │
│  ── CONTRA ITEMS ───────────────────────────────             │
│  Loan #001 Repayment (principal)       -RM10,000             │
│  Savings Interest (RM200K @ 0.8%)       -RM1,600             │
│  Subtotal Contra:                      -RM11,600             │
│                                                              │
│  ═══════════════════════════════════════════════             │
│  NET PAYABLE: HC pays HV                RM15,550             │
│                                                              │
│  [Mark as Paid] [Partial Payment]                            │
└──────────────────────────────────────────────────────────────┘
```
Business Logic
Overdue Detection（每月自动跑或 Finance 手动触发）
```python
for loan in active_loans:
    interest_due = calculate_monthly_interest(loan)
    
    # Check if interest was paid this month
    paid = sum(repayments this month for this loan where type = 'interest')
    
    if paid < interest_due:
        days_overdue = calculate_days_since_due(loan)
        stage = lookup_overdue_stage(days_overdue)  # from overdue_config
        penalty_rate = lookup_penalty_rate(stage)     # from overdue_config
        penalty = loan.outstanding * penalty_rate
        
        insert overdue_records(loan, days, stage, penalty)
```
Statement Generation（每月月底）
```python
for company in active_companies:
    statement = create_monthly_statement(company, period_month)
    
    # INVOICE ITEMS (line_type = 'invoice')
    # 从 invoices 表拉该公司当月所有 billing
    for invoice in get_invoices(company, period_month):
        add_statement_line(statement, 'invoice', 'receivable', invoice.category, invoice.amount)
    
    # 从 loans 表拉该公司当月 interest due
    for loan in get_active_loans(company):
        # Loan repayment 不开 invoice，但列为 contra
        # (只有当子公司有 savings 时才有 contra)
    
    # CONTRA ITEMS (line_type = 'contra')
    # 从 fund_sources 拉该公司的 savings interest（HV 欠 sub）
    savings = get_active_savings(company)
    if savings:
        interest = savings.amount * savings.cost_rate
        add_statement_line(statement, 'contra', 'payable', 'savings_interest', interest)
    
    # Loan repayment 作为 contra
    for loan in get_active_loans(company):
        repayment = get_scheduled_repayment(loan, period_month)
        if repayment:
            add_statement_line(statement, 'contra', 'payable', 'loan_repayment', repayment)
    
    # Calculate net
    statement.total_invoice = sum(invoice lines)
    statement.total_contra = sum(contra lines)
    statement.net_amount = total_invoice - total_contra
```
Payment Processing
```python
# Finance 收到钱后标记 paid
def mark_statement_paid(statement_id, paid_amount):
    statement = get_statement(statement_id)
    
    if paid_amount >= statement.net_amount:
        statement.status = 'paid'
    else:
        statement.status = 'partial'
    
    # 自动拆账归位
    for line in statement.lines:
        if line.line_type == 'invoice':
            mark_invoice_paid(line.reference_id)
        elif line.category == 'loan_repayment':
            record_repayment(line.reference_id, line.amount, 'netting')
        elif line.category == 'savings_interest':
            # HV 的利息义务已通过 contra 完成
            record_savings_interest_paid(line.reference_id)
```
Escalation Flow
```python
# Finance 发现 60d+ overdue → 提交 escalation
def submit_escalation(loan_id):
    create_approval_request(
        type='escalation',
        reference_id=loan_id,
        description=f'Loan overdue 60+ days, recommend tier downgrade'
    )

# Principal 批准 → 更新公司 tier
def approve_escalation(approval_id, new_tier):
    approval = get_approval(approval_id)
    loan = get_loan(approval.reference_id)
    company = get_company(loan.company_id)
    company.tier = new_tier  # 影响未来新 loan 的 rate
```
API Endpoints
```
GET    /api/overdue                          → overdue 列表
GET    /api/overdue/:loan_id                → 某笔 loan 的 overdue 明细
POST   /api/overdue/detect                  → 触发 overdue 检测（Finance）
POST   /api/overdue/:id/escalate            → 提交 escalation（Finance）

GET    /api/statements                       → statement 列表
GET    /api/statements/:id                  → statement 明细 + lines
POST   /api/statements/generate             → 生成当月 statements（Finance）
PATCH  /api/statements/:id/issue            → 发出 statement（Finance）
PATCH  /api/statements/:id/pay              → 标记收款（Finance）
GET    /api/statements/:id/pdf              → 导出 PDF
```
---
PHASE 1 SETTINGS
Settings 页面（Principal only write）在 Phase 1 需要支持：
```
┌──────────────────────────────────────────────────────────┐
│  Settings                                                │
│                                                          │
│  ── Treasury ─────────────────────────────────           │
│  Op Margin (%/mo):          [0.30 ]                      │
│  Buffer Amount (RM):        [50000]                      │
│                                                          │
│  ── Tier Premium (%/mo) ──────────────────────           │
│  T1:                        [0.00 ]                      │
│  T2:                        [0.50 ]                      │
│  T3:                        [1.00 ]                      │
│  T4:                        [1.50 ]                      │
│                                                          │
│  ── Company Tier Assignment ──────────────────           │
│  HC:           [T2 ▼]                                    │
│  The Conts:    [T1 ▼]                                    │
│  Carres:       [T3 ▼]                                    │
│  Hookka:       [T1 ▼]                                    │
│  ...                                                     │
│                                                          │
│  ── Overdue Stages ───────────────────────────           │
│  Grace:      Days [0-7]    Penalty [0.00%]               │
│  Late 1:     Days [8-30]   Penalty [0.50%]               │
│  Late 2:     Days [31-60]  Penalty [1.00%]               │
│  Escalation: Days [60+]    Penalty [1.50%]               │
│                                                          │
│                              [Save Changes]              │
└──────────────────────────────────────────────────────────┘
```
API Endpoints (Settings)
```
GET    /api/settings/treasury           → treasury_config
PATCH  /api/settings/treasury           → 更新（Principal only）
GET    /api/settings/tiers              → tier_config + company assignments
PATCH  /api/settings/tiers              → 更新（Principal only）
GET    /api/settings/overdue            → overdue_config
PATCH  /api/settings/overdue            → 更新（Principal only）
```
---
PHASE 1 AUTH & LAYOUT
Auth
Supabase Auth（email + password）
登录后根据 `users.role` 决定看到什么
Layout
```
┌──────────────────────────────────────────────┐
│  HOUZS Venture Portal          [User] [Logout]│
├──────────┬───────────────────────────────────┤
│ Sidebar  │                                   │
│          │  Main Content                     │
│ Dashboard│                                   │
│ Fund IN  │                                   │
│ Fund OUT │                                   │
│ Overdue  │                                   │
│ Settings*│                                   │
│          │                                   │
│ *Principal│                                  │
│  only    │                                   │
└──────────┴───────────────────────────────────┘
```
Sidebar 根据 role 动态显示：
Principal: 全部 + Settings
Finance: Dashboard, Fund IN, Fund OUT, Overdue
HR: 无（Phase 1 不涉及）
Dept Manager: 无（Phase 1 不涉及）
---
FORGE EXECUTION ORDER (Phase 1)
```
Step 1: Project setup（Next.js + Supabase + Vercel）
Step 2: DB tables（Core + Treasury + Billing tables）
Step 3: RLS policies（from Access Matrix）
Step 4: Auth + Layout + Sidebar
Step 5: Settings module（最简单，先做）
Step 6: Fund IN module
Step 7: Fund OUT module（含 Base Rate Calculator）
Step 8: Overdue & Netting module（含 Statement generation）
Step 9: Dashboard（最后做，因为 aggregate 所有数据）
```
