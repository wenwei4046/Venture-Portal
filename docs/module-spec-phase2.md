HOUZS Venture Portal — Module Spec (Phase 2)
Phase 2: Dept Pool + Service Billing (Month 3-4)
---
MODULE 5: DEPT POOL
Purpose
追踪每个部门的利润池。钱 100% deploy 到 Treasury，部门看账面数字，花钱走审批。目前只有 Marketing 有 P&L。
Who Can Access
Principal: 只读全部 + 审批支出
Finance: 只读全部
Dept Manager: 读写自己部门
UI Pages
Page 1: Overview（Principal / Finance）
```
┌──────────────────────────────────────────────────────────────┐
│  Department Pools                                            │
│                                                              │
│  ┌──────────────┬───────────┬───────────┬──────────────────┐│
│  │ Department   │ Balance   │ This Month│ Status           ││
│  ├──────────────┼───────────┼───────────┼──────────────────┤│
│  │ Marketing    │ RM45,200  │ +RM8,500  │ 🟢 Active        ││
│  │ Finance      │ RM0       │ RM0       │ ⚪ Cost-to-cost   ││
│  │ HR           │ RM0       │ RM0       │ ⚪ Cost-to-cost   ││
│  └──────────────┴───────────┴───────────┴──────────────────┘│
│                                                              │
│  Total Pool Deployed to Treasury: RM45,200                   │
│  Note: Finance & HR are cost-to-cost, no profit pool.        │
└──────────────────────────────────────────────────────────────┘
```
Page 2: Marketing Dept（Dept Manager / Principal / Finance）
```
┌──────────────────────────────────────────────────────────────┐
│  Marketing Department                    [+ New Expense]     │
│                                                              │
│  Pool Balance: RM45,200                                      │
│                                                              │
│  ── P&L (April 2025) ───────────────────────────             │
│  Revenue:                                                    │
│    Project X (Carres)                    RM12,000             │
│    Project Y (HC)                         RM8,000             │
│    Total Revenue:                        RM20,000             │
│                                                              │
│  Expenses:                                                   │
│    Staff Basic Salary (from HR):        -RM10,000             │
│    Dept Expenses (approved):             -RM1,500             │
│    Total Expenses:                      -RM11,500             │
│                                                              │
│  NET PROFIT:                              RM8,500             │
│                                                              │
│  ── Monthly NP Trend ──────────────────── (bar chart)        │
│  Jan: 5K | Feb: 7K | Mar: 6K | Apr: 8.5K                    │
│                                                              │
│  ── Expense History ────────────────────────                 │
│  2025-04-10  Team lunch        RM500    ✅ Approved          │
│  2025-04-05  Software sub      RM1,000  ✅ Approved          │
│  2025-03-20  Office supplies   RM300    ✅ Approved          │
│                                                              │
│  ── Pending Expenses ───────────────────────                 │
│  2025-04-12  Event materials   RM2,000  ⏳ Pending           │
└──────────────────────────────────────────────────────────────┘
```
Page 3: New Expense（Dept Manager only）
```
┌──────────────────────────────────────────────┐
│  New Department Expense                      │
│                                              │
│  Description: [________________________]     │
│  Amount:      [RM ________]                  │
│  Date:        [________]                     │
│  Receipt:     [Upload file]                  │
│                                              │
│  ⓘ Requires Principal approval.              │
│                                              │
│               [Cancel]  [Submit for Approval]│
└──────────────────────────────────────────────┘
```
Business Logic
NP Calculation（Marketing only）
```python
# 每月系统自动算 or Finance 触发
def calculate_dept_np(department_id, period_month):
    # Revenue = 该部门当月 billing 总额
    revenue = sum(invoices WHERE department_id AND period_month AND billing_mode = 'marketing_project')
    
    # Cost = 该部门 staff basic salary（from HR Costing）
    staff_cost = get_marketing_staff_basic_total(period_month)
    
    # Dept expenses = approved expenses this month
    expenses = sum(dept_pools WHERE department_id AND transaction_type = 'expense_out' AND period_month)
    
    np = revenue - staff_cost - expenses
    
    # 写入 dept_pools
    insert dept_pools(department_id, 'np_in', np, period_month)
```
Expense Approval Flow
```
Dept Manager submit → approval_requests (pending)
    ↓
Principal approve → dept_pools (expense_out)
    ↓
Finance 执行付款
```
API Endpoints
```
GET    /api/dept-pools                       → 所有部门汇总
GET    /api/dept-pools/:dept_id              → 某部门明细 + 流水
GET    /api/dept-pools/:dept_id/pnl          → Marketing P&L
GET    /api/dept-pools/:dept_id/pnl/trend    → 月度 NP 趋势
POST   /api/dept-pools/:dept_id/expenses     → 提交支出（Dept Manager）
```
---
MODULE 6: SERVICE BILLING
Purpose
管理 HV 向子公司的所有收费，5 种计费模式，最终 feed 进 Monthly Consolidated Statement。
Who Can Access
Finance: 审核 + 出 invoice + 对账
HR: 提交 cost summary
Principal: 只读 + 审批新合同
Dept Manager: 只读自己部门
5 种 Billing Mode
Mode	部门	怎么算	谁录入
`hr_pool_split`	HR	HR 总成本 × %	HR 算，Finance 出票
`finance_attribution`	Finance	员工 CTC × attribution %	HR 算，Finance 出票
`finance_mgmt_fee`	Finance	Manager 成本 × %	HR 算，Finance 出票
`marketing_project`	Marketing	按项目合同金额	Finance 直接开
`fixed_split`	Shared	Rent/Utility × %	Finance 录入
`non_billable`	HV	Group expense	Finance 录入
UI Pages
Page 1: Billing Overview
```
┌──────────────────────────────────────────────────────────────┐
│  Service Billing                                [+ New]      │
│                                                              │
│  Period: [April 2025 ▼]                                      │
│                                                              │
│  ── By Department ─────────────────────────                  │
│  ┌──────────────┬───────────┬───────────┬──────────────────┐│
│  │ Department   │ Revenue   │ Cost      │ Margin           ││
│  ├──────────────┼───────────┼───────────┼──────────────────┤│
│  │ HR           │ RM30,000  │ RM30,000  │ RM0 (cost2cost)  ││
│  │ Finance      │ RM32,000  │ RM32,000  │ RM0 (cost2cost)  ││
│  │ Marketing    │ RM20,000  │ RM11,500  │ RM8,500          ││
│  │ Shared       │ RM15,000  │ RM15,000  │ RM0              ││
│  │ Non-billable │ —         │ RM3,000   │ -RM3,000         ││
│  └──────────────┴───────────┴───────────┴──────────────────┘│
│                                                              │
│  ── By Company ──────────────────────────                    │
│  ┌──────────┬───────────┬──────────────────────────────────┐│
│  │ Company  │ Total Bill│ Breakdown                        ││
│  ├──────────┼───────────┼──────────────────────────────────┤│
│  │ HC       │ RM27,150  │ HR 12.5K + Fin 16K + Rent 3K... ││
│  │ The Conts│ RM15,600  │ HR 6K + Fin 9.6K + ...          ││
│  │ Carres   │ RM12,400  │ HR 7.5K + Fin 6.4K + Mkt 12K...││
│  └──────────┴───────────┴──────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```
Page 2: HR Cost Summary（Finance 视角 — lump sum only）
```
┌──────────────────────────────────────────────────────────────┐
│  HR Cost Submission — April 2025                ✅ Submitted │
│                                                              │
│  ── HR Department ──────────────────────────                 │
│  Total Staff Cost:     RM25,000                              │
│    Basic Total:        RM18,000                              │
│    Statutory Total:     RM4,500                              │
│    Allowance Total:     RM2,500                              │
│  Split:                                                      │
│    HC          50%     RM12,500                               │
│    The Conts   20%      RM5,000                               │
│    Carres      30%      RM7,500                               │
│                                                              │
│  ── Finance Department ─────────────────────                 │
│  Total Staff Cost:     RM32,000                              │
│    Basic Total:        RM24,000                              │
│    Statutory Total:     RM5,800                              │
│    Allowance Total:     RM2,200                              │
│  Split:                                                      │
│    HC          50%     RM16,000                               │
│    The Conts   30%      RM9,600                               │
│    Carres      20%      RM6,400                               │
│                                                              │
│  ── Marketing Department ───────────────────                 │
│  Total Basic Salary:   RM10,000                              │
│  (Billing by project, not by headcount)                      │
│                                                              │
│                              [Generate Invoices]             │
└──────────────────────────────────────────────────────────────┘
```
Page 3: Marketing Project Billing（Finance 录入）
```
┌──────────────────────────────────────────────────────────────┐
│  Marketing Project Billing                   [+ New Project] │
│                                                              │
│  ┌────────────┬──────────┬────────┬──────────┬────────────┐ │
│  │ Project    │ Company  │ Amount │ Period   │ Status     │ │
│  ├────────────┼──────────┼────────┼──────────┼────────────┤ │
│  │ Project X  │ Carres   │ 12,000 │ Apr 2025 │ Invoiced   │ │
│  │ Project Y  │ HC       │ 8,000  │ Apr 2025 │ Draft      │ │
│  └────────────┴──────────┴────────┴──────────┴────────────┘ │
└──────────────────────────────────────────────────────────────┘
```
Page 4: Fixed Split（Rent / Utility）
```
┌──────────────────────────────────────────────────────────────┐
│  Rent & Utility — April 2025                                 │
│                                                              │
│  ── Rent ──────────────────────────────                      │
│  Total Rent: RM10,000                                        │
│  ┌──────────┬───────┬──────────┐                             │
│  │ Company  │ Split │ Amount   │                             │
│  ├──────────┼───────┼──────────┤                             │
│  │ HC       │ 30%   │ RM3,000  │                             │
│  │ The Conts│ 20%   │ RM2,000  │                             │
│  │ Carres   │ 15%   │ RM1,500  │                             │
│  │ HV (self)│ 10%   │ RM1,000  │ ← non-billable             │
│  │ ...      │       │          │                             │
│  └──────────┴───────┴──────────┘                             │
│  Split % set by Principal in Settings.                       │
│                                                              │
│  ── Utility ─────────────────────────                        │
│  Total Utility: RM3,000                                      │
│  (Same split % as Rent or separate — Principal decides)      │
│                                                              │
│  Monthly Amount: [RM _____]  [Apply Split]                   │
└──────────────────────────────────────────────────────────────┘
```
Page 5: Non-billable Expenses
```
┌──────────────────────────────────────────────────────────────┐
│  Non-billable Expenses                       [+ New]         │
│                                                              │
│  ┌────────────────────┬──────────┬──────────┐                │
│  │ Description        │ Amount   │ Date     │                │
│  ├────────────────────┼──────────┼──────────┤                │
│  │ Company retreat    │ RM5,000  │ Apr 2025 │                │
│  │ Brand upgrade      │ RM3,000  │ Apr 2025 │                │
│  └────────────────────┴──────────┴──────────┘                │
│                                                              │
│  Total non-billable: RM8,000 → deducted from Operating Fund │
└──────────────────────────────────────────────────────────────┘
```
Business Logic
Invoice Generation Flow
```python
def generate_monthly_invoices(period_month):
    
    # 1. HR Pool Split
    for alloc in hr_pool_allocation WHERE period_month:
        dept_total = get_dept_total_cost(alloc.department_id, period_month)
        amount = dept_total * alloc.split_pct
        create_invoice(alloc.company_id, period_month, 'hr_pool_split', amount)
    
    # 2. Finance Attribution
    for staff in hr_staff_costs WHERE department = 'Finance' AND is_mgmt_fee = false:
        for alloc in hr_staff_allocation WHERE staff_id AND period_month:
            amount = staff.total_ctc * alloc.allocation_pct
            create_invoice(alloc.company_id, period_month, 'finance_attribution', amount)
    
    # 3. Finance Mgmt Fee
    for staff in hr_staff_costs WHERE is_mgmt_fee = true:
        for alloc in hr_staff_allocation WHERE staff_id AND period_month:
            amount = staff.total_ctc * alloc.allocation_pct
            create_invoice(alloc.company_id, period_month, 'finance_mgmt_fee', amount)
    
    # 4. Marketing Project — already created manually by Finance
    
    # 5. Fixed Split (Rent / Utility)
    for split_type in ['rent', 'utility']:
        total = get_monthly_amount(split_type, period_month)
        for company_split in get_splits(split_type):
            if company_split.is_hv:
                # Non-billable → Operating Fund
                deduct_operating_fund(total * company_split.pct, split_type)
            else:
                create_invoice(company_split.company_id, period_month, 'fixed_split', total * company_split.pct)
    
    # 6. Non-billable — already recorded by Finance, deducted from Operating Fund
```
Feed into Monthly Consolidated Statement
```python
# 所有生成的 invoices 自动 feed 进 Module 4 的 statement generation
# Statement lines 的 category 对应 billing_mode
```
Phase 2 Settings 新增
```
── Rent Split % ──────────────────
HC:        [30%]
The Conts:  [20%]
Carres:    [15%]
HV (self): [10%]
...
Total: 100%

── Utility Split % ───────────────
(Same as Rent / Separate toggle)
```
API Endpoints
```
GET    /api/billing                          → overview（by dept + by company）
GET    /api/billing/hr-summary               → HR cost summary（Finance sees lump sum）
POST   /api/billing/hr-submit                → HR 提交 cost summary
GET    /api/billing/marketing-projects       → Marketing project 列表
POST   /api/billing/marketing-projects       → 创建（Finance）
GET    /api/billing/fixed-split              → Rent / Utility split
POST   /api/billing/fixed-split/apply        → 录入月度金额 + apply split（Finance）
GET    /api/billing/non-billable             → Non-billable expense 列表
POST   /api/billing/non-billable             → 创建（Finance）
POST   /api/billing/generate-invoices        → 生成当月所有 invoices（Finance）
GET    /api/invoices                          → Invoice 列表
GET    /api/invoices/:id                     → Invoice 明细
PATCH  /api/invoices/:id/status              → 更新状态（Finance）
```
---
PHASE 2 SIDEBAR UPDATE
```
Sidebar (by role):
  Principal: Dashboard, Fund IN, Fund OUT, Overdue, Dept Pool, Billing, Settings
  Finance:   Dashboard, Fund IN, Fund OUT, Overdue, Billing
  HR:        Billing (submit cost summary only)
  Dept Mgr:  Dept Pool (own dept)
```
FORGE EXECUTION ORDER (Phase 2)
```
Step 1: Dept Pool tables + RLS
Step 2: Service Billing tables (contracts, invoices) + RLS
Step 3: HR Cost Summary submission flow (HR → Finance)
Step 4: Billing module UI — 5 modes
Step 5: Invoice generation logic
Step 6: Feed invoices into Statement (connect to Phase 1 Overdue module)
Step 7: Dept Pool UI — Marketing P&L
Step 8: Settings update (Rent/Utility split %)
Step 9: Dashboard update (add Dept Pool + Billing Float data)
```
