HOUZS Venture Portal — Access Matrix
Overview
4 Roles: Principal, Finance, HR, Dept Manager
9 Modules + Settings + Approval (横切)
Permission Types: 看 (Read), 写 (Write), 批 (Approve), 设定 (Configure)
---
⚡ AMENDMENT 2026-10-09 — Nobody without a portal account reaches a DEFINER function
`current_user_role()` refuses a sign-in with no active portal account (a self-made sign-up,
a switched-off account whose session lives on) instead of answering NULL, and the
publishable key may call no SECURITY DEFINER function except the five row-policy helpers.
Before, ~60 functions guarded with `IF v_role NOT IN (…)` let all three through (NULL is
not "not in"); the publishable key read director payouts and staff allocations that way.
Mig `20261009000100`; CLAUDE.md › Do NOT.
---
⚡ AMENDMENT 2026-10-08 — Each action takes effect (PR2)
A write now asks for the ACTION it is, not the module key: `requireAction('treasury',
'create')` in the app, `has_action()` in the database, answered by `current_actions()` —
a titled person's template cells (their own cells over them), else what the account's
keys allowed (`permission_key_actions`, so the four shared accounts lost and gained
nothing). A cell counts only while one of the keys that open its function's pages is
held. What each cell opens:
  Treasury       Create = raise a voucher, receipt, loan, fund source, BA, statement run,
                 overdue escalation · Edit = change one, move it along (issue, mark
                 paid, settle, back to draft, a paid voucher's date or GL account) ·
                 Void = void, withdraw, cancel, reverse · Export = files ·
                 Approve = amend a booked loan or fund source, approve a credit note
                 (and, next step, Treasury's approvals)
  Billing        Create = invoices, contracts, credit notes, receipts, generations ·
                 Edit = drafts, issuing, the allocator · Void = issued invoices,
                 approved credit notes · Export = invoice / credit-note PDFs
  Chart of Acct  Manage = accounts and departments
  HR Costing     Create = open a month, import, submit to Finance, raise salary and
                 statutory PVs, a top-up · Edit = rows, Complete, unlock, Total
                 Close, allocation splits · Export = bank and statutory files ·
                 Approve = (next step) approving a payroll run
  Revenue        Create = a sales import · Edit = the month and the hierarchy
                 (picks, shares, Don't count, closes, ERP matches) · Manage = rules,
                 KPI items, the ERP link, the cutover · Approve / Export = nothing yet
  Product list   Edit = every Save on the Product List
  Director Sal.  Edit = the month, its import, Complete and its undo ·
                 Approve = (next step) Invoice Pool releases
  Director Pool  Edit = the calculator
  Team & roster  Create = add people (by hand or InfoTech) · Edit = change a person,
                 the reporting line · Manage = titles and the ladder
  Logins         Create = invite · Manage = templates, a person's cells, deleting a title
  My Billing     Create (Dept) = the department's invoices and requests
  Claims         Create (Own) = raise a claim · Approve = approve, reject, mark paid
  Reconciliation Create = upload a statement, a journal voucher · Edit = match,
                 contra, ignore, delete · Approve = mark a session done
  Reports        Export = report files (Dept reports at Dept)
  Settings       Manage = everything on Settings
  Approvals      View = the queue (its own key, `approvals_queue`) · Approve = every
                 request in it
  Approve by domain (2026-10-09): Treasury · Approve decides vouchers, loans, fund
  sources and their cancellations, department expenses / payment requests;
  HR Costing · Approve decides payroll runs; Director Salary · Approve decides
  Invoice Pool releases. Nobody decides a request they raised, except the Principal.
A cell nothing acts on yet (Revenue · Approve, Venture Pool · Create, Claims · Edit …)
gives nothing; the matrix does not list it as held. Reading a page still follows its
module key, and Own / Dept rows reach RLS in the next step.
---
⚡ AMENDMENT 2026-10-08 — The app-wide history (Audit Log › Changes)
Every change people make through the portal is kept (`audit_events`, as `audit_tables`
says — CLAUDE.md › THE APP-WIDE HISTORY), and READING IT FOLLOWS THE READER'S OWN
PERMISSIONS: a table's changes are listed only to holders of one of its `read_keys`
(Finance: Treasury, Payments, Billing, Pools, Accounting; HR: Payroll, People, Directors,
Revenue, Member services; `audit_log` = the Principal: everything), a payroll voucher's
only with Payroll payouts or HR Costing, and salary / NRIC / bank values only where the
reader's title (or account kind) may see them — blanked otherwise. Nobody reads the
table directly; `audit_changes()` decides. Audit Log › Access (who read what) stays
`audit_log` only. A department head reads no history until own / dept scopes reach RLS.
---
⚡ AMENDMENT 2026-10-08 — Permission templates (People Management › Permissions)
The four roles below are no longer what a person gets. A TITLE points at a permission
TEMPLATE: function × action (view create edit approve void export manage) × scope
(own / dept / all), plus the salary / NRIC / bank fields it may see; one person can be
raised or lowered on a cell. Ten templates are seeded (Ultimate full access, Full access,
Director, Executive office, Finance · Checker, Finance · Maker, HR · Payroll, Department
head, Staff · Basic, Revenue Team). Until the gates enforce each cell (the next three
steps), a cell opens the old module key only where that key cannot reach further than
the cell — see CLAUDE.md › Permissions › PERMISSION TEMPLATES. The four shared accounts
(no person behind them) keep the role tables below until moved onto a person.
---
⚡ AMENDMENT 2026-07-16 — Unified Portal (one login, all tabs)
Principal 现在拥有全模块的完整写权限(write parity):下表中标 "✅ 写" 给 Finance / HR
而 Principal 标 ❌ 的格子,一律视为 Principal 也 ✅ 写。落地在三层:
1. RLS 写 policy 全部加入 'principal'(migration `20260716092818_principal_full_access`)
2. SECURITY DEFINER RPC 的 role check(create_loan_with_approval、generate_invoices_from_request、
   generate_pv_for_dept_request、reject_invoice_request、request_loan_cancel)放行 principal
3. Server Actions / 页面 requireRole + 页面按钮 gate 全部含 principal
Sidebar 对 Principal 显示全部 tab(HR Costing group、OPEX 带 dept 切换等)。
Principal 提交的审批仍走 Approvals queue(self-approve 允许 — Principal 是 owner,queue 留审计轨迹)。
Dept Manager 的 request 提交 flow(dept expense / invoice request)仍是 dm-only — Principal 是审批方。
Finance / HR / Dept Manager 之间的可见性隔离(个人薪资、Director Pool 等)完全不变。
---
ROLE SUMMARY
Role	一句话	典型用户
Principal	看全局、定规则、批东西	Loo (Chairman)
Finance	录数据、出票、对账、出钱	Finance Manager / Accountant
HR	算薪水、allocation、claims 审批	HR Manager
Dept Manager	管自己部门 pool + 支出	Marketing Manager
---
MODULE 1: DASHBOARD
功能	Principal	Finance	HR	Dept Manager
Fund Source Breakdown（饼图）	✅ 看	✅ 看	❌	❌
Fund Allocation Waterfall（瀑布图）	✅ 看	✅ 看	❌	❌
Free Cash Trend（折线图）	✅ 看	✅ 看	❌	❌
Loan Portfolio Health（条形图）	✅ 看	✅ 看	❌	❌
Net Margin Overview（数字卡片）	✅ 看	✅ 看	❌	❌
Upcoming Cash Flow（时间轴）	✅ 看	✅ 看	❌	❌
NP 数字卡片（→ P&L 链接）	✅ 看	✅ 看	❌	❌
Alert Panel（预警）	✅ 看	✅ 看	❌	❌
Approval Queue	✅ 看	❌	❌	❌
Settings 入口	✅ 进入	❌	❌	❌
RLS 规则: `role IN ('principal','finance')` 才能访问 Dashboard。
---
MODULE 2: FUND IN
功能	Principal	Finance	HR	Dept Manager
查看所有 fund sources	✅ 看	✅ 看	❌	❌
创建 Subsidiary Savings	❌	✅ 写	❌	❌
创建 Director Loans	❌	✅ 写	❌	❌
填 rate / lock-in period	❌	✅ 写	❌	❌
编辑 / 取消 fund source	❌	✅ 写	❌	❌
审批新资金来源类型	✅ 批	❌	❌	❌
查看自动记录（saving/surplus）	✅ 看	✅ 看	❌	❌
RLS 规则: `fund_sources` 表 — `role IN ('principal','finance')` 可读，`role = 'finance'` 可写。
---
MODULE 3: FUND OUT
功能	Principal	Finance	HR	Dept Manager
查看所有 loans	✅ 看	✅ 看	❌	❌
查看 loan detail + repayment history	✅ 看	✅ 看	❌	❌
创建新 loan	❌	✅ 写	❌	❌
录入 repayment	❌	✅ 写	❌	❌
审批新 loan	✅ 批	❌	❌	❌
查看 Base Rate 计算结果	✅ 看	✅ 看	❌	❌
审批 Base Rate（每季度）	✅ 批	❌	❌	❌
设定 Tier 分配（公司→T1/T2/T3/T4）	✅ 设定	❌	❌	❌
设定 Op Margin	✅ 设定	❌	❌	❌
设定 Tier Premium Rates	✅ 设定	❌	❌	❌
RLS 规则:
`loans` 表 — `role IN ('principal','finance')` 可读，`role = 'finance'` 可写
`repayments` 表 — 同上
`tier_config` 表 — `role = 'principal'` 可写，`role = 'finance'` 可读
---
MODULE 4: OVERDUE & NETTING
功能	Principal	Finance	HR	Dept Manager
查看全局 overdue 状态	✅ 看	✅ 看	❌	❌
查看 netting 结果	✅ 看	✅ 看	❌	❌
审核 / 确认 netting	❌	✅ 写	❌	❌
设定 penalty rates（4 阶段）	✅ 设定	❌	❌	❌
设定 overdue 天数范围	✅ 设定	❌	❌	❌
Escalation 处置（tier 降级建议）	✅ 批	❌	❌	❌
RLS 规则:
`overdue_records` 表 — `role IN ('principal','finance')` 可读
`overdue_config` 表 — `role = 'principal'` 可写，`role = 'finance'` 可读
---
MODULE 5: DEPT POOL
功能	Principal	Finance	HR	Dept Manager
查看所有部门余额	✅ 看	✅ 看	❌	❌
查看自己部门余额	—	—	❌	✅ 看（自己）
查看自己部门 NP 进账 history	—	—	❌	✅ 看（自己）
查看自己部门支出记录	—	—	❌	✅ 看（自己）
提交部门支出申请	❌	❌	❌	✅ 写
审批部门支出	✅ 批	❌	❌	❌
Marketing Dept P&L	✅ 看	✅ 看	❌	✅ 看（自己）
RLS 规则:
`dept_pools` 表 — Principal/Finance 看全部，Dept Manager 看 `department_id = user.department_id`
Dept Manager 只能 INSERT `transaction_type = 'expense_out'`
---
MODULE 6: SERVICE BILLING
功能	Principal	Finance	HR	Dept Manager
查看所有合同 + invoice	✅ 看	✅ 看	❌	❌
查看自己部门的合同	—	—	❌	✅ 看（自己）
创建 Marketing project billing	❌	✅ 写	❌	❌
接收 HR 提交的 cost summary	❌	✅ 看（lump sum）	❌	❌
生成 invoice	❌	✅ 写	❌	❌
对账收款	❌	✅ 写	❌	❌
录入 Rent / Utility	❌	✅ 写	❌	❌
录入 Non-billable expense	❌	✅ 写	❌	❌
审批新合同 / 金额变更	✅ 批	❌	❌	❌
设定 Rent split %	✅ 设定	❌	❌	❌
设定 Utility split %	✅ 设定	❌	❌	❌
生成 Monthly Consolidated Statement	❌	✅ 生成	❌	❌
查看 Monthly Consolidated Statement	✅ 看	✅ 看	❌	❌
RLS 规则:
`service_contracts` / `invoices` — Principal/Finance 全部可读，Dept Manager 按 department_id 过滤
Finance 只看 HR 提交的 aggregate summary（部门总数 + basic/statutory/allowance 小计 + split %），看不到个别员工薪水明细
---
MODULE 7: DIRECTOR SALARY ENGINE
功能	Principal	Finance	HR	Dept Manager
录入子公司 CTC（basic/KPI/allowance）	❌	❌	✅ 写	❌
查看 Pool 分配计算过程	✅ 看	❌	✅ 看	❌
查看每位 Director 完整明细	✅ 看	❌	✅ 看	❌
填 PCB 金额（查 Jadual PCB）	❌	❌	✅ 写	❌
提交计算结果给 Finance	❌	❌	✅ 提交	❌
查看 total payout（lump sum only）	❌	✅ 看	❌	❌
执行发放	❌	✅ 写	❌	❌
设定 Weightage（WL/MK/WS/WW）	✅ 设定	❌	❌	❌
设定 Min Payout	✅ 设定	❌	❌	❌
设定 Saving Rate	✅ 设定	❌	❌	❌
审批 Advance	✅ 批	❌	❌	❌
生成 Director Monthly Statement	❌	❌	✅ 生成	❌
查看 HV Operating Fund 余额 + 流水	✅ 看	✅ 看	❌	❌
查看 Invoice Payout Pool 余额	✅ 看	✅ 看	❌	❌
Release Invoice Payout Pool	✅ 批	❌	❌	❌
RLS 规则:
`director_ctc` / `director_payouts` — Principal 和 HR 看完整明细，Finance **完全没有** access（页面 + RPC 双重 block）
`salary_pool` — Principal 和 HR 可读
Finance 看 Director 数据只能走 `/director-pool`，看到的是 aggregate Saving + Invoice bucket totals（不进 Director Salary 模块；per-director rollup 也只对 Principal 显示）
Finance 在 `/director-pool` 看到的 aggregate:
```
Director Salary — April 2025
  Total 75% Payroll (Net):     RM XX,XXX
  Total 75% Statutory (ER+EE): RM XX,XXX
  Total 75% PCB:               RM XX,XXX
  Total 25% Invoice:           RM XX,XXX
  Total Advance:               RM XX,XXX
  Total Saving:                RM XX,XXX
```
---
MODULE 8: HR COSTING
功能	Principal	Finance	HR	Dept Manager
录入员工薪水明细（name + salary）	❌	❌	✅ 写	❌
查看个别员工薪水明细	✅ 看	❌	✅ 看	❌
HR Pool split % 设定（每月）	❌	❌	✅ 写	❌
Finance staff attribution（员工归属）	❌	❌	✅ 写	❌
Finance mgmt fee split %（每月）	❌	❌	✅ 写	❌
Marketing staff basic salary 录入	❌	❌	✅ 写	❌
提交 cost summary 给 Finance	❌	❌	✅ 提交	❌
查看 cost summary（lump sum by dept）	✅ 看	✅ 看	✅ 看	❌
Benefit Claim — 提交	❌	❌	员工提交给 HR	❌
Benefit Claim — 审批	❌	❌	✅ 批	❌
Benefit Claim — 加进 Payroll	❌	❌	✅ 写	❌
Project Claim — 提交	❌	员工提交给 Finance	❌	❌
Project Claim — 审批	❌	✅ 批	❌	❌
Project Claim — 出钱	❌	✅ 写	❌	❌
RLS 规则:
`hr_staff_costs` 表 — Principal 和 HR 全部可读。Finance 可读 **自己所属 department** 的 row（`department_id = current_user_department_id()`）— **更新 2026-04-17** 以支持 Spec 1 HR Payroll 的 Finance 部门经理查看本部门个人薪水，不拓宽到其他部门。其他部门仍走 aggregate view。
`hr_staff_allocation` 表 — Principal 和 HR 可读；Finance 无权访问（保留原规则）。2026-09-30：只在该人的 payroll row 还是 draft 时可改，Centralized 部门的人不能有 split（trigger，23PAY）
Department mode（Cost center / Centralized，2026-09-30）— 所有人看得到（`department_modes()` 只给名称、模式、人数）；只有 permission `department_mode`（默认只给 Principal，可在 People › Permissions 给别人）能切。判断的是**登录的人**，不是当前 view：Principal 在 HR view / Finance view 也能切
`hr_monthly_payroll` 表 (Spec 1) — Principal 全部可读/可写；HR 全部可读，draft 状态可写；Finance 仅可读自己部门员工的 row；Dept Manager DENY
`hr_monthly_payroll_summary` 视图 (Spec 1) — 继承下层 RLS（SECURITY INVOKER）；Finance 查询时只聚合本部门数据；Principal/HR 查询时覆盖全部门
Finance 跨部门的 aggregate view:
Finance 看到的 HR Cost Summary:
```
HR Department — April 2025
  Total Staff Cost:     RM25,000
    Basic Total:        RM18,000
    Statutory Total:     RM4,500
    Allowance Total:     RM2,500
  Split:
    The Conts  20%      RM5,000
    HOUZS      50%      RM12,500
    Carres     30%      RM7,500

Finance Department — April 2025
  Total Staff Cost:     RM32,000
    Basic Total:        RM24,000
    Statutory Total:     RM5,800
    Allowance Total:     RM2,200
  Split:
    The Conts  30%      RM9,600
    HOUZS      50%      RM16,000
    Carres     20%      RM6,400

Marketing Department — April 2025
  Total Basic Salary:   RM15,000
  (No statutory breakdown — Marketing bills by project)
```
---
MODULE 9: REPORTS
报表	Principal	Finance	HR	Dept Manager
HV P&L（月/季/年）	✅ 看	✅ 看	❌	❌
Marketing Dept P&L	✅ 看	✅ 看	❌	✅ 看（自己）
Fund Summary（资金快照）	✅ 看	✅ 看	❌	❌
Loan Statement（按子公司）	✅ 看	✅ 看	❌	❌
Monthly Consolidated Statement	✅ 看	✅ 看	❌	❌
Director Monthly Statement	✅ 看	❌	✅ 生成	❌
Base Rate Calculator（每季度）	✅ 看 + 批	✅ 看	❌	❌
Overdue Summary	✅ 看	✅ 看	❌	❌
Claims Summary	✅ 看	✅ 看	✅ 看	❌
---
SETTINGS（Principal 独占写权限）
设定项	Principal	Finance	HR	Dept Manager
Op Margin	✅ 改	✅ 看	❌	❌
Buffer 金额	✅ 改	✅ 看	❌	❌
Tier Premium Rates (T1-T4)	✅ 改	✅ 看	❌	❌

Company → Tier 分配	✅ 改	✅ 看	❌	❌
Overdue 天数 + penalty rates	✅ 改	✅ 看	❌	❌
Director Weightage (WL/MK/WS/WW)	✅ 改	❌	✅ 看	❌
Min Payout (RM14,400)	✅ 改	❌	✅ 看	❌
Saving Rate (5%)	✅ 改	❌	✅ 看	❌
Rent split % (per company)	✅ 改	✅ 看	❌	❌
Utility split % (per company)	✅ 改	✅ 看	❌	❌
---
APPROVAL FLOW（横切所有模块）
审批类型	谁提交	谁批	触发条件
新 Loan	Finance	Principal	创建新 loan
Base Rate 重算	Finance	Principal	每季度
Tier 变更	Finance	Principal	Escalation 建议
新合同 / 金额变更	Finance	Principal	新 service contract
部门支出	Dept Manager	Principal	部门花钱
Director Advance	HR	Principal	Payroll < min payout
Escalation 处置	Finance	Principal	Overdue 60d+
Invoice Pool Release	Finance	Principal	Principal 决定 release
Profit Withdrawal	Finance	Principal	Principal 决定抽 profit
规则: 所有审批最终到 Principal。没有多级审批，没有自动审批。
---
DATA VISIBILITY MATRIX（敏感数据）
数据	Principal	Finance	HR	Dept Manager
个别员工 name + salary	✅	❌	✅	❌
部门 cost summary (lump sum)	✅	✅	✅	❌
Director 个别 salary 明细	✅	❌	✅	❌
Director total payout (lump sum)	✅	✅	✅	❌
Loan details	✅	✅	❌	❌
Fund sources	✅	✅	❌	❌
Overdue status	✅	✅	❌	❌
HV P&L	✅	✅	❌	❌
Dept Pool（自己部门）	✅	✅	❌	✅
Dept Pool（全部）	✅	✅	❌	❌
Claims	✅	✅	✅	❌
---
SUPABASE RLS IMPLEMENTATION GUIDE
Pattern 1: Principal + Finance only
```sql
-- fund_sources, loans, repayments, overdue_records, monthly_statements
CREATE POLICY "principal_finance_read" ON table_name
FOR SELECT USING (
    auth.jwt() ->> 'role' IN ('principal', 'finance')
);
```
Pattern 2: Finance write only
```sql
CREATE POLICY "finance_write" ON fund_sources
FOR INSERT USING (
    auth.jwt() ->> 'role' = 'finance'
);
```
Pattern 3: Dept Manager — own department only
```sql
CREATE POLICY "dept_manager_own_dept" ON dept_pools
FOR SELECT USING (
    auth.jwt() ->> 'role' = 'dept_manager'
    AND department_id = (
        SELECT department_id FROM users WHERE id = auth.uid()
    )
);
```
Pattern 4: HR only — sensitive data
```sql
CREATE POLICY "hr_staff_read" ON hr_staff_costs
FOR SELECT USING (
    auth.jwt() ->> 'role' IN ('principal', 'hr')
);
-- Finance 完全不能访问此表
```
Pattern 5: Finance sees aggregate view only
```sql
-- 创建一个 view 给 Finance 看
CREATE VIEW finance_cost_summary AS
SELECT
    department_id,
    period_month,
    SUM(basic_salary) as total_basic,
    SUM(epf_er + socso_er + eis_er) as total_statutory,
    SUM(allowances) as total_allowance,
    SUM(total_ctc) as total_cost
FROM hr_staff_costs
WHERE status = 'active'
GROUP BY department_id, period_month;

-- Finance 只能访问这个 view，不能访问原表
```
Pattern 6: Principal write — Settings
```sql
CREATE POLICY "principal_config_write" ON treasury_config
FOR UPDATE USING (
    auth.jwt() ->> 'role' = 'principal'
);

CREATE POLICY "principal_finance_config_read" ON treasury_config
FOR SELECT USING (
    auth.jwt() ->> 'role' IN ('principal', 'finance')
);
```
---
NOTES FOR FORGE
每个 API endpoint 必须检查 role — 不能只靠前端 UI 隐藏
RLS 是第二道防线 — API 检查 + RLS 双重保护
Finance 看 HR 数据必须走 aggregate view — 不能直接 query hr_staff_costs 表
Finance 不能 access Director Salary 模块 — 只能走 /director-pool 看 Saving + Invoice bucket aggregate；per-director rollup 是 Principal-only
所有写操作记录 created_by — audit trail
Settings 修改记录 updated_by + updated_at — 知道谁改了什么
Approval 是横切 — 任何需要审批的操作先写 approval_requests，Principal 批了才执行
