HOUZS Venture Portal — Module Spec (Phase 3)
Phase 3: Director Salary + HR Costing + Reports (Month 5-6)
---
MODULE 7: DIRECTOR SALARY ENGINE
Purpose
7 间子公司汇入 CTC → Pool → Weightage 分配 → 5% Saving → 75/25 split → Statutory + PCB → Advance → 发放。
Who Can Access
HR: 计算 + 录入 + PCB + 提交
Finance: 看 total payout（lump sum）+ 执行发放
Principal: 看完整明细 + 设定 weightage/min payout/saving rate + 审批 advance + release invoice pool
Calculation Flow（10 Steps）
```
Step 1:  HR 录入 7 subs CTC（basic/KPI/allowance per director per company）
Step 2:  系统自动查表算 Statutory IN（EPF/SOCSO/EIS per sub）
Step 3:  加总 → Total Pool（non-statutory = B+K+A）
Step 4:  Pool ÷ 4 × Weightage → 每位 Director 的 gross
Step 5:  按 IN 比例自动拆 gross 成 basic/KPI/allowance
Step 6:  扣 5% Saving（on non-statutory total）
Step 7:  75/25 Split
Step 8:  75% Payroll: min payout check → ER + EE + PCB → net to director
Step 9:  25% Invoice: base + ER → invoice total → accumulate to pool
Step 10: Statutory surplus/deficit 计算
```
UI Pages
Page 1: CTC Input（HR）
```
┌──────────────────────────────────────────────────────────────┐
│  Director Salary — CTC Input          Period: [April 2025 ▼]│
│                                                              │
│  Director: [WL ▼]  (or show all 4 tabs)                     │
│                                                              │
│  ┌──────────────┬──────────┬──────────┬──────────┐          │
│  │ Company      │ Basic    │ KPI      │ Allowance│          │
│  ├──────────────┼──────────┼──────────┼──────────┤          │
│  │ HOUZS        │ 22,800   │ 0        │ 14,469.90│          │
│  │ CONTS        │ 17,400   │ 0        │ 9,335.70 │          │
│  │ DREAM CRAFTER│ 17,400   │ 0        │ 0        │          │
│  │ CARRESS      │ 0        │ 0        │ 0        │          │
│  │ HOOKA        │ 0        │ 0        │ 0        │          │
│  │ 2990         │ 2,500    │ 0        │ 0        │          │
│  │ OHANA        │ 0        │ 0        │ 0        │          │
│  ├──────────────┼──────────┼──────────┼──────────┤          │
│  │ TOTAL        │ 60,100   │ 0        │ 23,805.60│          │
│  └──────────────┴──────────┴──────────┴──────────┘          │
│                                                              │
│  Auto-calculated Statutory IN:                               │
│  ┌──────────────┬──────────┬──────────┬──────────┐          │
│  │ Company      │ EPF ER   │ SOCSO ER │ EIS ER   │          │
│  ├──────────────┼──────────┼──────────┼──────────┤          │
│  │ HOUZS        │ 2,736.00 │ 104.15   │ 9.90     │          │
│  │ CONTS        │ 2,088.00 │ 104.15   │ 9.90     │          │
│  │ DREAM CRAFTER│ 2,088.00 │ 104.15   │ 9.90     │          │
│  │ 2990         │ 325.00   │ 42.85    │ 4.90     │          │
│  ├──────────────┼──────────┼──────────┼──────────┤          │
│  │ TOTAL        │ 7,237.00 │ 355.30   │ 34.60    │          │
│  └──────────────┴──────────┴──────────┴──────────┘          │
│                                                              │
│  Total CTC IN: RM91,532.50 (= HV Revenue)                   │
│                                                              │
│                              [Save] [Calculate →]            │
└──────────────────────────────────────────────────────────────┘
```
Page 2: Pool Calculation Result（HR + Principal）
```
┌──────────────────────────────────────────────────────────────┐
│  Director Salary — Calculation          Period: April 2025   │
│                                                              │
│  Pool: RM83,905.60                                           │
│  Ratio: Basic 71.63% / KPI 0.00% / Allowance 28.37%         │
│                                                              │
│  ┌────────┬──────────┬──────────┬──────────┬──────────┐     │
│  │        │ WL (85%) │ MK(94.5%)│ WS (105%)│WW(115.5%)│     │
│  ├────────┼──────────┼──────────┼──────────┼──────────┤     │
│  │ Gross  │17,829.94 │19,822.70 │22,025.22 │24,227.74 │     │
│  │ Saving │  -891.50 │  -991.13 │-1,101.26 │-1,211.39 │     │
│  │ After  │16,938.44 │18,831.56 │20,923.96 │23,016.35 │     │
│  └────────┴──────────┴──────────┴──────────┴──────────┘     │
│                                                              │
│  Total 5% Saving: RM4,195.28 → HV Operating Fund            │
│                                                              │
│                              [← Back] [Detail →]            │
└──────────────────────────────────────────────────────────────┘
```
Page 3: Payout Detail per Director（HR + Principal）
```
┌──────────────────────────────────────────────────────────────┐
│  Director WL — April 2025 Payout Detail                      │
│                                                              │
│  Gross:                   RM17,829.94                        │
│  5% Saving:              -RM   891.50                        │
│  After Saving:            RM16,938.44                        │
│                                                              │
│  ── 75% PAYROLL ────────────────────────────                 │
│  Calculated (75%):        RM12,703.83                        │
│  ⚠ Below RM14,400                                           │
│  Advance:                +RM 1,696.17                        │
│  PAYROLL GROSS:           RM14,400.00                        │
│    B+K stat base:         RM10,314.45                        │
│    Allowance:              RM4,085.55                        │
│                                                              │
│  Deductions:                                                 │
│    EPF ER:               -RM 1,248.00                        │
│    EPF EE:               -RM 1,144.00                        │
│    SOCSO ER:             -RM   104.15                        │
│    SOCSO EE:             -RM    29.75                        │
│    EIS ER:               -RM     9.90                        │
│    EIS EE:               -RM     9.90                        │
│    PCB:                  -RM   [___.__] ← HR 填              │
│                           ────────────                       │
│  NET TO DIRECTOR:         RM XX,XXX.XX                       │
│                                                              │
│  ── 25% INVOICE ────────────────────────                     │
│  Base:                    RM 4,234.61                        │
│    + EPF ER:              RM   396.00                        │
│    + SOCSO ER:            RM    53.35                        │
│    + EIS ER:              RM     6.10                        │
│  INVOICE TOTAL:           RM 4,690.06                        │
│                                                              │
│  ── STATUTORY SURPLUS ──────────────                         │
│  ER IN (share):           RM 1,620.72                        │
│  ER OUT (75%+25%):        RM 1,817.50                        │
│  Surplus:                -RM   196.78 (deficit)              │
│                                                              │
│  ── ADVANCE TRACKING ───────────────                         │
│  Previous balance:        RM 3,200.00                        │
│  This month advance:     +RM 1,696.17                        │
│  This month repaid:      -RM     0.00                        │
│  Current balance:         RM 4,896.17                        │
│                                                              │
│               [← Back] [Save PCB] [Next Director →]          │
└──────────────────────────────────────────────────────────────┘
```
Page 4: Finance View（lump sum only）
```
┌──────────────────────────────────────────────────────────────┐
│  Director Salary — April 2025               Status: Pending  │
│                                                              │
│  Total 75% Payroll:                                          │
│    Payroll Gross:         RM61,755.24                        │
│    Total Statutory (ER):  -RM X,XXX.XX                       │
│    Total Statutory (EE):  -RM X,XXX.XX                       │
│    Total PCB:             -RM X,XXX.XX                       │
│    Net to Directors:       RM XX,XXX.XX                      │
│                                                              │
│  Total 25% Invoice:       RM22,070.48                        │
│  Total Advance:            RM1,972.50                        │
│  Total 5% Saving:          RM4,195.28                        │
│                                                              │
│  Statutory to remit:                                         │
│    EPF (ER+EE):           RM XX,XXX.XX → KWSP               │
│    SOCSO (ER+EE):         RM    XXX.XX → PERKESO             │
│    EIS (ER+EE):           RM     XX.XX → EIS                 │
│    PCB:                   RM  X,XXX.XX → LHDN                │
│                                                              │
│                     [Confirm & Execute Payroll]               │
└──────────────────────────────────────────────────────────────┘
```
Page 5: Director Monthly Statement（HR 生成，导出 image/PDF）
```
┌──────────────────────────────────────────────────────────────┐
│  HOUZS VENTURE SDN BHD                                       │
│  Director Monthly Statement — April 2025                     │
│                                                              │
│  Director: WL                                                │
│                                                              │
│  Gross Allocation:              RM17,829.94                  │
│  5% Saving:                    -RM   891.50                  │
│                                                              │
│  75% Payroll Gross:             RM14,400.00                  │
│  - EPF (ER+EE):               -RM 2,392.00                  │
│  - SOCSO (ER+EE):             -RM   133.90                  │
│  - EIS (ER+EE):               -RM    19.80                  │
│  - PCB:                       -RM   XXX.XX                   │
│  Net Take Home:                 RM XX,XXX.XX                 │
│                                                              │
│  25% Invoice Total:             RM 4,690.06                  │
│                                                              │
│  Advance Balance:               RM 4,896.17                  │
│  Saving Accumulated:            RM12,750.00                  │
│  Invoice Pool Accumulated:      RM34,599.36                  │
│                                                              │
│  ─────────────────────────────────────────                   │
│  Generated by HR | Confidential                              │
└──────────────────────────────────────────────────────────────┘
```
Page 6: HV Operating Fund
```
┌──────────────────────────────────────────────────────────────┐
│  HV Operating Fund                  Balance: RM XX,XXX.XX    │
│                                                              │
│  ┌────────────┬───────────┬──────────┬──────────┐           │
│  │ Date       │ Type      │ Amount   │ Balance  │           │
│  ├────────────┼───────────┼──────────┼──────────┤           │
│  │ 2025-04-30 │ Saving IN │+4,195.28 │ XX,XXX   │           │
│  │ 2025-04-30 │ Deficit   │  -312.20 │ XX,XXX   │           │
│  │ 2025-04-15 │ Expense   │-1,000.00 │ XX,XXX   │           │
│  │ 2025-03-31 │ Saving IN │+4,050.00 │ XX,XXX   │           │
│  └────────────┴───────────┴──────────┴──────────┘           │
└──────────────────────────────────────────────────────────────┘
```
Page 7: Invoice Payout Pool
```
┌──────────────────────────────────────────────────────────────┐
│  Invoice Payout Pool               Balance: RM XX,XXX.XX     │
│                                                              │
│  ⓘ Isolated pool. Not used for lending.                      │
│  ⓘ Release requires Principal approval.                      │
│                                                              │
│  ┌────────────┬─────────┬───────────┬──────────┐            │
│  │ Date       │ Type    │ Amount    │ Balance  │            │
│  ├────────────┼─────────┼───────────┼──────────┤            │
│  │ 2025-04-30 │ Accum.  │+22,070.48 │ XX,XXX   │            │
│  │ 2025-03-31 │ Accum.  │+21,500.00 │ XX,XXX   │            │
│  │ 2025-02-15 │ Release │-40,000.00 │ XX,XXX   │            │
│  └────────────┴─────────┴───────────┴──────────┘            │
│                                                              │
│  [Request Release] (Finance submit → Principal approve)      │
└──────────────────────────────────────────────────────────────┘
```
Business Logic
Complete Calculation（伪代码）
```python
def calculate_director_salary(period_month):
    # Step 1-2: CTC IN + Statutory IN
    ctc_records = get_director_ctc(period_month)
    for ctc in ctc_records:
        wages = ctc.basic + ctc.kpi
        ctc.employer_epf = lookup_epf(wages).employer
        ctc.employer_socso = lookup_socso(wages).employer
        ctc.employer_eis = lookup_eis(wages).employer
        ctc.total_ctc = wages + ctc.allowance + ctc.employer_epf + ctc.employer_socso + ctc.employer_eis
    
    # Step 3: Total Pool
    total_basic = sum(ctc.basic for all ctc)
    total_kpi = sum(ctc.kpi for all ctc)
    total_allow = sum(ctc.allowance for all ctc)
    pool = total_basic + total_kpi + total_allow
    
    bk_ratio = (total_basic + total_kpi) / pool
    allow_ratio = total_allow / pool
    
    total_stat_er_in = sum(ctc.employer_epf + ctc.employer_socso + ctc.employer_eis for all ctc)
    
    # Save pool snapshot
    save_salary_pool(period_month, pool, ratios, totals)
    
    # Step 4-10: Per Director
    total_weightage = sum(d.weightage for d in directors)
    
    for director in active_directors:
        # Step 4: Gross
        gross = pool * director.weightage / total_weightage
        
        # Step 5: Auto-split by ratio
        d_basic = gross * (total_basic / pool)
        d_kpi = gross * (total_kpi / pool)
        d_allow = gross * (total_allow / pool)
        
        # Step 6: 5% Saving
        saving = gross * get_config('saving_rate')
        after_saving = gross - saving
        
        # Step 7: 75/25
        payroll_calc = after_saving * 0.75
        invoice_base = after_saving * 0.25
        
        # Step 8: 75% Payroll
        advance = max(0, director.min_payout - payroll_calc)
        payroll_gross = max(payroll_calc, director.min_payout)
        
        payroll_bk = payroll_gross * bk_ratio
        payroll_allow = payroll_gross * allow_ratio
        
        epf_er, epf_ee = lookup_epf(payroll_bk)
        socso_er, socso_ee = lookup_socso(payroll_bk)
        eis_er, eis_ee = lookup_eis(payroll_bk)
        pcb = 0  # HR fills in manually
        
        net = payroll_gross - epf_er - epf_ee - socso_er - socso_ee - eis_er - eis_ee - pcb
        
        # Step 9: 25% Invoice
        inv_bk = invoice_base * bk_ratio
        inv_epf_er = lookup_epf(inv_bk).employer
        inv_socso_er = lookup_socso(inv_bk).employer
        inv_eis_er = lookup_eis(inv_bk).employer
        invoice_total = invoice_base + inv_epf_er + inv_socso_er + inv_eis_er
        
        # Step 10: Surplus
        dir_share = director.weightage / total_weightage
        stat_er_in = total_stat_er_in * dir_share
        stat_er_out = (epf_er + socso_er + eis_er) + (inv_epf_er + inv_socso_er + inv_eis_er)
        surplus = stat_er_in - stat_er_out
        
        # Save payout record
        save_director_payout(director, period_month, all_calculated_values)
        
        # Write to pools
        write_hv_operating_fund('saving_in', saving)
        if surplus >= 0:
            write_hv_operating_fund('surplus_in', surplus)
        else:
            write_hv_operating_fund('deficit_out', abs(surplus))
        write_invoice_payout_pool('accumulate', director, invoice_total)
    
    # Advance needs Principal approval
    if total_advance > 0:
        create_approval_request('advance', total_advance)
```
PCB Lookup
```python
def lookup_pcb(payroll_gross, epf_ee, director):
    taxable = payroll_gross - epf_ee  # PCB 算的是扣完 EPF EE 后的金额
    
    pcb = query(
        "SELECT pcb_amount FROM pcb_jadual 
         WHERE income_from <= %s AND income_to >= %s 
         AND category = %s AND children = %s",
        taxable, taxable, director.pcb_category, director.children_count
    )
    return pcb or 0
```
Advance Repayment（从 allowance 扣）
```python
def process_advance_repayment(director, period_month):
    balance = get_advance_balance(director)
    if balance <= 0:
        return 0
    
    # 只从 allowance 扣
    current_allow_portion = director_payout.payroll_allow
    
    # 如果当月 total > min_payout 且有 allowance
    if director_payout.payroll_calc > director.min_payout and current_allow_portion > 0:
        repay = min(balance, current_allow_portion)
        # 实际操作：从 net 里扣 repay
        return repay
    return 0
```
Phase 3 Settings 新增
```
── Director Salary ──────────────────
Weightage:
  WL:  [85.0 %]
  MK:  [94.5 %]
  WS:  [105.0%]
  WW:  [115.5%]
  Total: 400% (validation)

Min Payout (RM):  [14,400]
Saving Rate (%):  [5.0   ]
```
API Endpoints
```
GET    /api/director-salary/:period              → 计算结果概览
POST   /api/director-salary/:period/ctc          → 录入 CTC（HR）
POST   /api/director-salary/:period/calculate    → 触发计算（HR）
PATCH  /api/director-salary/:period/:director/pcb → 填 PCB（HR）
POST   /api/director-salary/:period/submit       → 提交给 Finance（HR）
POST   /api/director-salary/:period/execute      → 执行发放（Finance）
GET    /api/director-salary/:period/:director     → 单个 Director 明细
GET    /api/director-salary/:period/:director/statement → 导出 statement（PDF/image）

GET    /api/operating-fund                        → Operating Fund 流水 + 余额
GET    /api/invoice-payout-pool                  → Invoice Pool 流水 + 余额
POST   /api/invoice-payout-pool/release          → 申请 release（Finance → Principal）
```
---
MODULE 8: HR COSTING
Purpose
HR 算好员工成本 + 分摊，提交给 Finance。管理 Benefit + Project Claims。
Who Can Access
HR: 读写全部
Finance: 只看 cost summary（lump sum）+ Project Claim 审批
Principal: 看全部（含个别薪水）
UI Pages
Page 1: Staff List（HR only + Principal）
```
┌──────────────────────────────────────────────────────────────┐
│  Staff Costs                                 [+ New Staff]   │
│                                                              │
│  Filter: [All Departments ▼]                                 │
│                                                              │
│  ┌────────────┬────────┬────────┬────────┬───────┬────────┐ │
│  │ Name       │ Dept   │ Basic  │ Stat ER│ CTC   │ Type   │ │
│  ├────────────┼────────┼────────┼────────┼───────┼────────┤ │
│  │ Employee A │ Finance│ 5,000  │ 850    │ 5,850 │ Attrib.│ │
│  │ Employee B │ Finance│ 6,000  │ 1,020  │ 7,020 │ Attrib.│ │
│  │ Fin Mgr    │ Finance│ 7,000  │ 1,190  │ 8,190 │ Mgmt   │ │
│  │ HR Staff 1 │ HR     │ 4,000  │ 680    │ 4,680 │ Pool   │ │
│  │ HR Staff 2 │ HR     │ 4,500  │ 765    │ 5,265 │ Pool   │ │
│  │ Mkt Staff 1│ Mkt    │ 4,000  │ —      │ 4,000 │ Basic  │ │
│  │ Mkt Staff 2│ Mkt    │ 3,500  │ —      │ 3,500 │ Basic  │ │
│  └────────────┴────────┴────────┴────────┴───────┴────────┘ │
│                                                              │
│  ⓘ Finance cannot see this page. Finance sees lump sum only. │
└──────────────────────────────────────────────────────────────┘
```
Page 2: Allocation Matrix（HR only）
```
┌──────────────────────────────────────────────────────────────┐
│  Staff Allocation — April 2025                               │
│                                                              │
│  ── Finance Attribution ──────────────────────               │
│  ┌────────────┬──────┬──────┬──────┬──────┬──────┐          │
│  │ Staff      │ HC   │ Conts│ DC   │Carres│ Total│          │
│  ├────────────┼──────┼──────┼──────┼──────┼──────┤          │
│  │ Employee A │ 100% │  0%  │  0%  │  0%  │ 100% │          │
│  │ Employee B │  50% │  0%  │  0%  │ 50%  │ 100% │          │
│  │ Fin Mgr    │  50% │ 30%  │  0%  │ 20%  │ 100% │          │
│  └────────────┴──────┴──────┴──────┴──────┴──────┘          │
│                                                              │
│  ── HR Pool Split ────────────────────────────               │
│  ┌──────────┬───────┐                                        │
│  │ Company  │ Split │                                        │
│  ├──────────┼───────┤                                        │
│  │ HC       │ 50%   │                                        │
│  │ The Conts│ 20%   │                                        │
│  │ Carres   │ 30%   │                                        │
│  │ Total    │ 100%  │                                        │
│  └──────────┴───────┘                                        │
│                                                              │
│                    [Save] [Submit to Finance →]               │
└──────────────────────────────────────────────────────────────┘
```
Page 3: Claims（HR for benefit / Finance for project）
```
┌──────────────────────────────────────────────────────────────┐
│  Claims                                        [+ New Claim] │
│                                                              │
│  Tab: [Benefit Claims] [Project Claims]                      │
│                                                              │
│  ── Benefit Claims (HR approves) ─────────                   │
│  ┌────────────┬──────────┬────────┬──────────┬────────────┐ │
│  │ Claimant   │ Desc     │ Amount │ Status   │ Action     │ │
│  ├────────────┼──────────┼────────┼──────────┼────────────┤ │
│  │ Ahmad      │ Car Park │ RM300  │ Pending  │ [Approve]  │ │
│  │ Siti       │ Medical  │ RM150  │ Approved │ Apr payroll│ │
│  └────────────┴──────────┴────────┴──────────┴────────────┘ │
│                                                              │
│  ── Project Claims (Finance approves) ─────                  │
│  ┌────────────┬──────────┬────────┬──────────┬────────────┐ │
│  │ Claimant   │ Project  │ Amount │ Status   │ Action     │ │
│  ├────────────┼──────────┼────────┼──────────┼────────────┤ │
│  │ Ali        │ Event X  │ RM2,000│ Pending  │ [Approve]  │ │
│  └────────────┴──────────┴────────┴──────────┴────────────┘ │
└──────────────────────────────────────────────────────────────┘
```
API Endpoints
```
GET    /api/hr/staff                          → 员工列表（HR + Principal only）
POST   /api/hr/staff                          → 新增员工（HR）
PATCH  /api/hr/staff/:id                      → 编辑（HR）
GET    /api/hr/allocation/:period             → Allocation matrix（HR）
POST   /api/hr/allocation/:period             → 保存 allocation（HR）
POST   /api/hr/submit-summary/:period        → 提交 cost summary 给 Finance（HR）
GET    /api/hr/cost-summary/:period          → Cost summary lump sum（Finance + Principal）

GET    /api/claims                             → Claim 列表
POST   /api/claims                             → 提交 claim
PATCH  /api/claims/:id/approve                → 审批（HR for benefit, Finance for project）
PATCH  /api/claims/:id/reject                 → 拒绝
```
---
MODULE 9: REPORTS
Purpose
所有模块数据汇总成可读报表，支持决策。
Who Can Access
见 Access Matrix 文档。
Report List
Report 1: HV P&L（月/季/年切换）
```
┌──────────────────────────────────────────────────────────────┐
│  HV Profit & Loss                  Period: [April 2025 ▼]    │
│                                    View: [Monthly ▼]         │
│                                                              │
│  REVENUE                                                     │
│    Loan Interest Income                     RM X,XXX.XX      │
│    Overdue Penalty Income                   RM   XXX.XX      │
│    HR Billing                               RM XX,XXX.XX     │
│    Finance Billing                          RM XX,XXX.XX     │
│    Marketing Billing                        RM XX,XXX.XX     │
│    Rent Bill Back                           RM X,XXX.XX      │
│    Utility Bill Back                        RM X,XXX.XX      │
│    Director 5% Saving                       RM X,XXX.XX      │
│    Statutory Surplus                        RM   XXX.XX      │
│  TOTAL REVENUE                              RM XX,XXX.XX     │
│                                                              │
│  EXPENSES                                                    │
│    Savings Interest to Subs                -RM X,XXX.XX      │
│    Director Payroll (75% total cost)       -RM XX,XXX.XX     │
│    Director Invoice (25% pool)             -RM XX,XXX.XX     │
│    Director Advance                        -RM X,XXX.XX      │
│    HV Staff Cost (non-billable)            -RM X,XXX.XX      │
│    Office Rent (HV portion)                -RM X,XXX.XX      │
│    Utility (HV portion)                    -RM   XXX.XX      │
│    Group Expenses                          -RM X,XXX.XX      │
│    Statutory Deficit                       -RM   XXX.XX      │
│  TOTAL EXPENSES                            -RM XX,XXX.XX     │
│                                                              │
│  ═══════════════════════════════════════════════════          │
│  NET PROFIT                                 RM XX,XXX.XX     │
│                                                              │
│                                    [Export PDF]              │
└──────────────────────────────────────────────────────────────┘
```
Data sources:
```sql
-- Revenue
loan_interest    = SUM(loans.outstanding * loans.effective_rate) WHERE status='active'
penalty          = SUM(overdue_records.penalty_amount) WHERE period_month
hr_billing       = SUM(invoices.total_amount) WHERE billing_mode='hr_pool_split'
finance_billing  = SUM(invoices.total_amount) WHERE billing_mode='finance_attribution'
marketing_billing= SUM(invoices.total_amount) WHERE billing_mode='marketing_project'
rent_billback    = SUM(invoices.total_amount) WHERE billing_mode='fixed_split' AND category='rent'
utility_billback = SUM(invoices.total_amount) WHERE billing_mode='fixed_split' AND category='utility'
saving           = SUM(hv_operating_fund.amount) WHERE transaction_type='saving_in'
surplus          = SUM(hv_operating_fund.amount) WHERE transaction_type='surplus_in'

-- Expenses
interest_to_subs = SUM(fund_sources.amount * fund_sources.cost_rate) WHERE status='active'
director_payroll = SUM(director_payouts.payroll_gross + payroll_epf_er + payroll_socso_er + payroll_eis_er)
director_invoice = SUM(director_payouts.invoice_total)
director_advance = SUM(director_payouts.advance_amount)
hv_staff         = from non-billable portion of hr_staff_costs
rent_hv          = from non-billable portion of rent
utility_hv       = from non-billable portion of utility
group_expenses   = SUM(invoices.total_amount) WHERE billing_mode='non_billable'
deficit          = SUM(hv_operating_fund.amount) WHERE transaction_type='deficit_out'
```
Report 2: Fund Summary
```
┌──────────────────────────────────────────────────────────────┐
│  Fund Summary — April 2025                                   │
│                                                              │
│  PAID CAPITAL                                                │
│  ┌──────────┬────────┬───────┬──────────┬──────────────────┐│
│  │ Source   │ Amount │ Rate  │ Lock-in  │ Maturity         ││
│  ├──────────┼────────┼───────┼──────────┼──────────────────┤│
│  │ HC       │ 200K   │ 0.80% │ 12 mo    │ 2025-12-01      ││
│  │ 2990     │ 150K   │ 0.60% │ 6 mo     │ 2025-08-01      ││
│  │ Dir WL   │ 50K    │ 1.00% │ 12 mo    │ 2026-01-15      ││
│  └──────────┴────────┴───────┴──────────┴──────────────────┘│
│  Total Paid: RM400K | Weighted Cost: 0.75%/mo                │
│                                                              │
│  FREE CAPITAL                                                │
│  HV Operating Fund:     RM XX,XXX                            │
│  Dept Pool (Marketing): RM XX,XXX                            │
│  Billing Float:         RM XX,XXX                            │
│  Total Free:            RM XXX,XXX                           │
│                                                              │
│  ALLOCATED                                                   │
│  Loans Outstanding:     RM XXX,XXX                           │
│  Buffer:                RM XX,XXX                            │
│  Invoice Payout Pool:   RM XX,XXX                            │
│                                                              │
│  FREE CASH:             RM XXX,XXX                           │
│                                                              │
│                                    [Export PDF]              │
└──────────────────────────────────────────────────────────────┘
```
Report 3: Loan Statement（per company, export PDF）
Report 4: Monthly Consolidated Statement（already in Module 4, export PDF）
Report 5: Director Monthly Statement（already in Module 7, export image/PDF）
Report 6: Base Rate History
```
┌──────────────────────────────────────────────────────────────┐
│  Base Rate History                                           │
│                                                              │
│  ┌─────────┬──────────┬───────┬───────┬──────────┐          │
│  │ Quarter │ Wtd Cost │ Margin│ Rate  │ Approved │          │
│  ├─────────┼──────────┼───────┼───────┼──────────┤          │
│  │ 2025 Q2 │ 0.375%   │ 0.30% │ 0.675%│ 2025-04  │          │
│  │ 2025 Q1 │ 0.350%   │ 0.30% │ 0.650%│ 2025-01  │          │
│  └─────────┴──────────┴───────┴───────┴──────────┘          │
│                                                              │
│  Trend chart: Base Rate over quarters                        │
└──────────────────────────────────────────────────────────────┘
```
Report 7: Overdue Summary（already in Module 4 dashboard）
Report 8: Claims Summary
```
┌──────────────────────────────────────────────────────────────┐
│  Claims Summary — April 2025                                 │
│                                                              │
│  Benefit Claims:                                             │
│    Approved: 12 claims, RM4,500                              │
│    Pending: 3 claims, RM800                                  │
│    Rejected: 1 claim, RM500                                  │
│                                                              │
│  Project Claims:                                             │
│    Paid: 5 claims, RM8,200                                   │
│    Pending: 2 claims, RM3,000                                │
└──────────────────────────────────────────────────────────────┘
```
API Endpoints
```
GET /api/reports/pnl?period=2025-04&view=monthly     → HV P&L
GET /api/reports/pnl?period=2025-Q2&view=quarterly   → HV P&L quarterly
GET /api/reports/fund-summary?period=2025-04          → Fund Summary
GET /api/reports/loan-statement/:company_id           → Loan Statement PDF
GET /api/reports/base-rate-history                     → Base Rate History
GET /api/reports/claims-summary?period=2025-04         → Claims Summary
```
---
STATUTORY TABLES（Phase 3 前置工作）
Import Tasks
EPF Third Schedule
```
Source: Jadual_Ketiga_BI__1_Oct_2025.pdf
Table: epf_third_schedule
Rows: ~350 (Part A)
Format: wage_from, wage_to, employer, employee
Notes: >RM20K use exact 12%/11% (in code, not in table)
Import: HR/dev 手动 import 或 seed script
```
SOCSO Act 4
```
Source: 151124Rate_Contribution_ACT_4.pdf
Table: socso_act4_schedule
Rows: 65 + ceiling row
Format: wage_from, wage_to, employer, employee
Notes: Ceiling RM6,000 (max ER 104.15, EE 29.75)
```
EIS Act 800
```
Source: Rate_of_Contribution_ACT_800.pdf
Table: eis_act800_schedule
Rows: 55 + ceiling row
Format: wage_from, wage_to, employer, employee
Notes: Ceiling RM5,000 (NOT RM6,000). Max ER 9.90, EE 9.90
```
PCB Jadual
```
Source: LHDN e-Jadual PCB (electronic)
Table: pcb_jadual
Format: income_from, income_to, category (KA1/KA2/KA3), children, pcb_amount
Notes: Need to obtain from LHDN website or HR
```
---
PHASE 3 SIDEBAR UPDATE (Final)
```
Sidebar (by role):
  Principal:  Dashboard, Fund IN, Fund OUT, Overdue, Dept Pool, Billing,
              Director Salary, Reports, Settings
  Finance:    Dashboard, Fund IN, Fund OUT, Overdue, Billing,
              Director Salary (lump sum), Reports
  HR:         Billing (submit only), Director Salary (calculate),
              HR Costing, Reports (own)
  Dept Mgr:   Dept Pool (own), Reports (own dept P&L)
```
PHASE 3 DASHBOARD UPDATE
Dashboard 新增数据：
Fund Allocation Waterfall → 加入 Director Salary、Invoice Payout Pool、HV Operating Fund
Net Margin → 加入 billing revenue
Upcoming Cash Flow → 加入 Director salary payout date
Alert → 加入 Director advance 累计过高、Invoice pool pending release
---
FORGE EXECUTION ORDER (Phase 3)
```
Step 1:  Import statutory tables (EPF/SOCSO/EIS/PCB) → seed scripts
Step 2:  Director tables + RLS (directors, director_ctc, salary_pool, director_payouts)
Step 3:  HV Operating Fund + Invoice Payout Pool tables
Step 4:  Statutory lookup functions (reusable for HR Costing too)
Step 5:  Director Salary Engine — calculation logic
Step 6:  Director Salary UI — CTC input → calculation → payout detail
Step 7:  Director Monthly Statement export (PDF/image)
Step 8:  HR Costing tables + RLS
Step 9:  HR Costing UI — staff list, allocation matrix, cost summary
Step 10: Claims system (benefit + project)
Step 11: Reports module — all 8 reports
Step 12: Dashboard final update (add all Phase 3 data)
Step 13: Full system test with real data
```
