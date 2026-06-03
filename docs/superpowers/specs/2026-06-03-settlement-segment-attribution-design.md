# 设计文档：结算的部门 segment 归属 + /dept-pool 对账修复

> 日期：2026-06-03 · 状态：待用户确认
> 修复 `/dept-pool` 总额对不上银行的问题(双重记账),并让发票结算正确归到各部门池。

## 背景与根因

`/dept-pool` "By department" 视图用**两套来源**算现金,靠它们对齐才能跟银行对上:
- **部门行的 Balance** ← `dept_pool_balances`(汇总 `dept_pools` 表)
- **Venture (Office) 行** ← 总账 `journal_lines`,过滤 `segment IN ('corporate','treasury')` 且 account 是银行 GL 科目

开账时两套是手动对齐的(银行余额按部门 segment 切片 + dept_pools 期初行),所以 `部门合计 + Venture = 银行`。

**问题**:发票结算时只更新了其中一套,导致双重计算 / 漏算:
1. 结算的银行进账(Dr Bank / Cr 3030)的 JE 一律标 `corporate` segment(`derive_journal_segment` 对没挂 invoice 的 billing_payment 凭证回退 corporate)→ 全进 Venture。
2. 部门归属若写 `dept_pools`(单张结算的 adjustPool、以及本次合并结算修复)→ 部门行 +金额。
3. 两者并存 → 同一笔在 Venture(GL)和部门(dept_pools)各算一次。

**当前实际缺口**(已验证):部门合计 72,443.17 + Venture 48,586.04 = 121,029.21,银行 67,441.82,差 **+53,587.39**(= Marketing 重复 53,949.19 − Hookka 漏算 361.80)。

## 目标模型

结算发票时**两套一起更新**,与开账方式一致:
1. `dept_pools` 部门 `np_in` +金额(部门行余额)
2. 结算的**银行进账 JE 按发票部门标 segment**(用 `billing_mode_to_segment`),而非一律 corporate → Venture 不再重复算

`billing_mode_to_segment`:marketing_project→marketing、hr_attribution→hr、finance_attribution→finance、director_office_attribution→director_office、director_attribution→director_office、其它(venture_attribution 等)→corporate。

## 代码修复

### A. 合并结算 `settleInvoicesConsolidated`(billing/actions.ts)
- 已做:逐张 `adjustPool` 到各部门池(commit 1f36f43)。**保留**。
- 新增:结算的银行进账 JE **按 segment 分组**。把发票按 `billing_mode_to_segment` 分组,每组发一笔 `Dr Bank(该组金额) / Cr 3030(该组金额)`,`post_journal_entry` 显式传 `p_segment=该组 segment`。(替换原来单一 corporate 的整笔 JE。)
  - 例:某公司 marketing 单 + venture 单 → 两笔结算 JE:marketing 段一笔、corporate 段一笔。
- AR(3030)总额、银行总额、bump_bank 不变(只是 JE 拆分 + 打对 segment)。

### B. 单张结算 `createPaymentVoucher`(payments/actions.ts)
- 同样问题:结算 invoice 的 JE 现在标 corporate。改成:当 `invoice_id` 存在时,JE `p_segment = billing_mode_to_segment(该 invoice.billing_mode)`。
- `postJournalEntry` helper(lib/journal.ts)增加可选 `segment` 参数,透传给 RPC 的 `p_segment`(默认保持现状,不影响其它调用方)。
- adjustPool(target_pool) 不变(已正确)。

### C. 纯逻辑 + 测试
- helper:`segmentForBillingMode(mode)`(TS 版,镜像 SQL `billing_mode_to_segment`)放 `src/lib/invoice-settlement.ts`,加单元测试(各 mode → 段,未知→corporate)。
- 合并结算的"按 segment 分组求和"也抽成纯函数 + 测试(组内金额求和、分组正确)。

## 数据更正(已发生的)

一次性 SQL(MCP),原子事务 + 事后验证对账:
1. **Hookka 361.80(Finance)**:补一笔 `dept_pools` Finance `np_in` +361.80(Hookka 的银行进账已是 finance 段,无需动 GL)。Finance 池 −361.80 → 0。
2. **4 张合并收据的 Marketing 部分(53,949.19)**:把这部分银行现金从 corporate 段挪到 marketing 段——用 `1900` 跨段清算科目发一对(或每凭证一对)分录:
   - corporate 段:`Cr 3000 53,949.19 / Dr 1900 53,949.19`
   - marketing 段:`Dr 3000 53,949.19 / Cr 1900 53,949.19`
   - 净效果:银行总额不变;corporate 银行 −53,949.19(Venture 不再重复算);marketing 银行 +53,949.19;1900 归零。
   - (Marketing 的 `dept_pools` np_in 53,949.19 已在 commit 之前的数据更正里写好,**保留**。)
3. **Carress 1,060.96**:公司/Venture,**不动**(已是 corporate 段、在 Venture)。

**验证**:更正后 `部门合计 + Venture = 67,441.82 = 银行`(已预先验算)。事后用 SQL 实测确认。

## 明确不做(YAGNI)
- 不重构 pool 架构为单一数据源(风险高;维持现有"两套对齐"的设计)。
- 不动 NonBillableList(venture_pool 表)的读取——它读旧表,与本视图独立;本次只保证 `/dept-pool` 与银行对账。(如需统一,另立项。)
- 不处理"收非-3030 应收"的自助功能(task 7,暂停中,另做)。

## 测试
- 单元:`segmentForBillingMode`、合并结算分组求和。
- 上线后实测:做一笔跨部门合并结算,确认银行进账按段拆分、`/dept-pool` 仍对账。
- 数据更正后:SQL 验证 `部门合计 + Venture = 银行`。
