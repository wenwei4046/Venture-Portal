# 设计文档：发票结算改进（合并收据 + 单张日期 + 入口可见性）

> 日期：2026-06-03 · 状态：待用户确认
> 范围：Billing/Payments 结算流程的三项改进。

## 背景与问题

用户在结算 invoice 时遇到三个痛点：

1. **找不到批量结算** —— `batchSettleInvoices` 功能其实已存在（`/statements` Invoices 分页），但入口隐蔽：checkbox 栏表头为空、「Select all issued」是个不起眼的小斜体文字链接，用户从未发现。用户日常一直走每行的「Settle →」单张路径。
2. **单张结算不能选日期** —— 单张「Settle →」走 `/payments/new?invoice_id=`，`NewPaymentForm` 没有日期字段；`createPaymentVoucher` 把 `payment_date` 和结算 JE 的 `transactionDate` 都写死为 `todayStr`（今天）。无法补回真实付款日。
3. **多张单无法合并成一张凭证** —— 当前模型是「一张凭证 ↔ 一张 invoice」（`payment_vouchers.invoice_id` 为单字段）。即使用现有 batch settle 一次结多张，账上仍是 N 张独立凭证（N 个 OR 号 / N 笔 JE）。用户要的是：同一公司欠的多张单，一次收款，账上只出**一张**收据。

## 用户已确认的决策

- **合并方式**：账上真的只一张凭证（true consolidated OR），不是「N 张 + 合并 PDF」。
- **分组范围**：只能同一公司的单合并。勾到不同公司的单 → **拦截并提示**，不自动分组、不硬做。
- **可打印收据**：**不做**。账上有凭证记录即可，无需生成可打印/下载的 OR 收据 PDF。

## 数据模型

采用**反向指针**方案（在 `invoices` 上加 `settlement_voucher_id`）。

理由：一张 invoice 至多被一张凭证结清，这是 1:N（凭证 : invoices），invoice 天然是「多」的一边。反向 FK 是最贴合的写法，schema 改动最小，且「这张收据结了哪些单」可直接查 `invoices where settlement_voucher_id = pv.id`。否决了 junction 表（M:N 过度设计）和 group_id 假合并（用户要真凭证）。

### Migration（新增一支）

```sql
-- invoices.settlement_voucher_id：指向结清这张 invoice 的 payment_voucher。
-- 单张结算与合并结算都写它；合并结算下多张 invoice 指向同一张 voucher。
alter table invoices
  add column settlement_voucher_id uuid references payment_vouchers(id) on delete set null;

create index idx_invoices_settlement_voucher on invoices(settlement_voucher_id);
```

- 旧的 `payment_vouchers.invoice_id`（单字段）**保留不动**，单张结算继续写它（向后兼容、不动现有读取路径）。合并结算的凭证 `invoice_id = null`，关系只走 `settlement_voucher_id`。
- 不回填历史数据（旧的单张凭证靠 `invoice_id` 即可，新列只为合并场景服务）。

## 功能设计

### A. 合并结算（替换 `batchSettleInvoices`）

新 server action（替换现有 `batchSettleInvoices`，签名相近）：

```ts
settleInvoicesConsolidated(payload: {
  invoiceIds: string[]
  bankAccountId: string
  paymentDate: string  // YYYY-MM-DD
}): Promise<{ voucherId: string; voucherNo: string; settledCount: number; total: number }>
```

行为：
1. `requireRole(['finance'])`，校验 bank 存在、`paymentDate` 非空、`invoiceIds` 非空。
2. 拉取所有选中 invoice。逐张校验：
   - 必须 `status === 'issued'`；
   - 必须**非** `dept_pool`（inter-billing 单仍走单张路径，与现状一致）；
   - 任一不合格 → 整批 `throw`（拦截，不部分执行）。
3. **同公司校验**：计算每张单的 payee key（`company_id`，无则 `billable_to_freetext_name`）。若选中集合里出现 **>1 个不同 payee key** → `throw new Error('一张收据只能结同一家公司的单，请只勾选同一家公司的发票')`。
4. 通过后，生成**一张** OR 凭证：
   - `voucher_no = HV-OR-{YYYYMM from paymentDate}-{seq}`
   - `voucher_type='billing_payment'`、`direction='credit'`、`status='paid'`
   - `amount = Σ total_amount`、`payee_*` = 该公司、`bank_account_id`、`payment_date = paymentDate`、`invoice_id = null`
   - `approved_*`/`executed_*` 时间戳 = 实际系统时间（`nowIso`）
5. 写 1 行 `payment_voucher_sources`（pool=`venture_pool`、account_code=`3030`、amount=总和）。
6. `bump_bank_for_paid_credit` 入账银行余额。
7. `adjustPool('venture_pool', 'in', 总和, …)`。
8. 1 笔 JE：`Dr <bank gl_account_code> 总和 / Cr 3030 总和`，`transactionDate = paymentDate`，description 列出该公司 + 涉及的 invoice 号。
9. 把该组所有 invoice：`status='paid'`、`settlement_voucher_id = pv.id`（race guard：`.eq('status','issued')`）。
10. `revalidatePath` /billing /statements /payments /dashboard。

> 会计处理沿用现有 `batchSettleInvoices` 已验证的路径（venture_pool 入账 + Dr Bank/Cr 3030），只是从「每张单一笔」改成「整组一笔」。Cr 3030 用总额单行（AR 是单一 GL 科目，总额清账与逐笔等价）。

### B. 单张结算加付款日期

- `NewPaymentForm` 加一个 `payment_date` 日期字段（`type="date"`，默认 `dayjs().format('YYYY-MM-DD')`，可改）。放在金额/银行那一组附近。
- `createPaymentVoucher` 从 `formData` 读 `payment_date`（缺省回退今天，保持兼容）。在 `isAutoComplete` 分支：
  - `payment_date` 列写选中的日期（替换 line 191 写死的 `todayStr`）；
  - 结算 JE 的 `transactionDate` 用选中的日期（替换 line 423 写死的 `todayStr`）；
  - `approved_at`/`executed_at` 等系统时间戳**保持** `nowIso`（记录实际操作时刻，不可被回填日期污染）。
- 适用所有走该表单的凭证（单张 invoice 结算 + 普通收/付款）。

### C. 入口可见性

`/statements` Invoices 分页（`InvoicesList`）：
- 把现有隐蔽的「Select all issued / Clear」小链接区，升级为明显的操作条：一个清晰的「**全选可结算发票**」按钮 + 当前选中数/金额。
- 右下角浮动条按钮文案改为「**合并结算 N 张 → 生成收据**」，点开沿用现有 modal（银行 + 日期），提交调用新的 `settleInvoicesConsolidated`。
- 选中跨公司时，modal 内（或浮动条上）实时提示「只能同一公司」，并禁用结算按钮——在客户端先拦一道，server 端 step 3 再兜底。

## 受影响的读取路径（需检查）

- 现有引用 `batchSettleInvoices` 的调用点（`InvoicesList.tsx`）→ 改调新 action。
- 凭证详情/列表若展示「关联 invoice」，对合并凭证 `invoice_id=null` 的情况，改为/补充从 `settlement_voucher_id` 反查（确认 `/payments/[id]` 详情页是否需要列出多张 invoice）。
- `database.types.ts` 需在加列后重新生成。

## 测试

- 纯逻辑抽取到 `src/lib`：同公司校验、payee key 计算、合并金额求和 → 单元测试（同公司通过、跨公司报错、空集报错、含 dept_pool 报错）。
- 单张日期：验证传入日期写进 `payment_date` 与 JE `transactionDate`，系统时间戳不变。
- RLS：合并 action 仍限 `finance`，与现状一致。

## 明确不做（YAGNI）

- 可打印/下载的 OR 收据 PDF。
- 跨公司自动分组成多张 OR。
- 合并结算 dept_pool（inter-billing）单（仍走单张）。
- 历史凭证回填 `settlement_voucher_id`。
