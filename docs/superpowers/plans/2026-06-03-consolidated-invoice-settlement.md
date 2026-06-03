# Consolidated Invoice Settlement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Finance settle multiple issued invoices of the same company into a single Official Receipt voucher, pick the payment date on single settlement, and surface the settlement entry point clearly.

**Architecture:** Add a reverse pointer `invoices.settlement_voucher_id` so one voucher can settle N invoices (1:N). Replace the N-voucher `batchSettleInvoices` with a `settleInvoicesConsolidated` action that mints ONE OR voucher per same-company group and blocks cross-company selections. Extract pure validation into a testable lib helper. Add a payment-date field to the single-settle form and thread it into the voucher + journal entry. Make the batch entry point a prominent button in `InvoicesList`.

**Tech Stack:** Next.js 15 (App Router, Server Actions), Supabase (PostgreSQL + RLS), TypeScript, Tailwind, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-03-consolidated-invoice-settlement-design.md`

---

## File Structure

- **Create** `supabase/migrations/20260101000276_invoices_settlement_voucher_id.sql` — adds the reverse-pointer column + index.
- **Create** `src/lib/invoice-settlement.ts` — pure helpers: `payeeKey`, `validateConsolidation`. No server/Supabase imports (client-importable).
- **Create** `src/lib/invoice-settlement.test.ts` — unit tests for the helpers.
- **Modify** `src/app/(portal)/billing/actions.ts` — replace `batchSettleInvoices` with `settleInvoicesConsolidated`.
- **Modify** `src/app/(portal)/billing/_components/InvoicesList.tsx` — call new action, prominent button, cross-company guard.
- **Modify** `src/app/(portal)/payments/_components/NewPaymentForm.tsx` — add payment-date field.
- **Modify** `src/app/(portal)/payments/actions.ts` — read `payment_date`, thread into voucher row + settlement JE.
- **Regenerate** `src/lib/supabase/database.types.ts` — after the migration.

---

## Task 1: Migration — add `invoices.settlement_voucher_id`

**Files:**
- Create: `supabase/migrations/20260101000276_invoices_settlement_voucher_id.sql`

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/20260101000276_invoices_settlement_voucher_id.sql`:

```sql
-- Reverse pointer: which payment_voucher settled this invoice.
-- 1:N (one voucher settles many invoices) for consolidated Official Receipts.
-- Single-settle also sets it; legacy payment_vouchers.invoice_id stays for
-- back-compat and is left NULL on consolidated vouchers.
alter table invoices
  add column if not exists settlement_voucher_id uuid
  references payment_vouchers(id) on delete set null;

create index if not exists idx_invoices_settlement_voucher
  on invoices(settlement_voucher_id);
```

- [ ] **Step 2: Apply the migration to the remote project**

Apply via the Supabase MCP tool `apply_migration` (project ref `gixpptmfuryskbwkmiwz`):
- name: `invoices_settlement_voucher_id`
- query: the SQL from Step 1.

Verify with `list_migrations` (or `execute_sql`: `select column_name from information_schema.columns where table_name='invoices' and column_name='settlement_voucher_id';`) — expect one row.

- [ ] **Step 3: Regenerate TypeScript types**

Run the Supabase MCP tool `generate_typescript_types`. The result is JSON-wrapped — extract with `JSON.parse(text).types` and write the unwrapped TS to `src/lib/supabase/database.types.ts`. (Per HANDOFF gotcha.)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260101000276_invoices_settlement_voucher_id.sql src/lib/supabase/database.types.ts
git commit -m "feat(db): add invoices.settlement_voucher_id for consolidated receipts"
```

---

## Task 2: Pure helper — consolidation validation

**Files:**
- Create: `src/lib/invoice-settlement.ts`
- Test: `src/lib/invoice-settlement.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/invoice-settlement.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { payeeKey, validateConsolidation, type SettleableInvoice } from './invoice-settlement'

function inv(over: Partial<SettleableInvoice>): SettleableInvoice {
  return {
    id: 'i1',
    status: 'issued',
    billable_to_type: 'subsidiary',
    company_id: 'c1',
    billable_to_freetext_name: null,
    total_amount: 100,
    ...over,
  }
}

describe('payeeKey', () => {
  it('uses company_id when present', () => {
    expect(payeeKey(inv({ company_id: 'cX' }))).toBe('company:cX')
  })
  it('falls back to freetext name when no company', () => {
    expect(payeeKey(inv({ company_id: null, billable_to_freetext_name: 'Acme' }))).toBe('freetext:Acme')
  })
})

describe('validateConsolidation', () => {
  it('rejects empty selection', () => {
    expect(validateConsolidation([])).toEqual({ ok: false, error: 'No invoices selected' })
  })

  it('rejects a non-issued invoice', () => {
    const r = validateConsolidation([inv({ id: 'iA', status: 'draft' })])
    expect(r.ok).toBe(false)
  })

  it('rejects dept_pool (inter-billing) invoices', () => {
    const r = validateConsolidation([inv({ billable_to_type: 'dept_pool' })])
    expect(r.ok).toBe(false)
  })

  it('rejects a cross-company selection', () => {
    const r = validateConsolidation([inv({ id: 'a', company_id: 'c1' }), inv({ id: 'b', company_id: 'c2' })])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('同一家公司')
  })

  it('accepts same-company invoices and sums (rounded) total', () => {
    const r = validateConsolidation([
      inv({ id: 'a', company_id: 'c1', total_amount: 100.005 }),
      inv({ id: 'b', company_id: 'c1', total_amount: 50.1 }),
    ])
    expect(r).toEqual({ ok: true, payeeKey: 'company:c1', total: 150.11 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:ci -- src/lib/invoice-settlement.test.ts`
Expected: FAIL — cannot resolve `./invoice-settlement`.

- [ ] **Step 3: Write the helper**

Create `src/lib/invoice-settlement.ts`:

```ts
// Pure helpers for consolidated invoice settlement. No Supabase/server
// imports so both the server action and the client list can use them.

export interface SettleableInvoice {
  id: string
  status: string
  billable_to_type: string | null
  company_id: string | null
  billable_to_freetext_name: string | null
  total_amount: number | string
}

/** Stable key identifying the payer. Subsidiary invoices key off company_id;
 *  director/freetext invoices key off the freetext payee name. */
export function payeeKey(inv: SettleableInvoice): string {
  if (inv.company_id) return `company:${inv.company_id}`
  return `freetext:${inv.billable_to_freetext_name ?? ''}`
}

export type ConsolidationCheck =
  | { ok: true; payeeKey: string; total: number }
  | { ok: false; error: string }

/** A consolidated receipt may only cover issued, non-inter-billing invoices
 *  of a SINGLE payer. Returns the shared payee key + rounded total on success. */
export function validateConsolidation(invoices: SettleableInvoice[]): ConsolidationCheck {
  if (invoices.length === 0) return { ok: false, error: 'No invoices selected' }
  for (const i of invoices) {
    if (i.status !== 'issued') {
      return { ok: false, error: `Invoice ${i.id} is ${i.status}, expected issued` }
    }
    if (i.billable_to_type === 'dept_pool') {
      return { ok: false, error: 'Inter-billing (dept_pool) invoices must be settled individually' }
    }
  }
  const keys = new Set(invoices.map(payeeKey))
  if (keys.size > 1) {
    return { ok: false, error: '一张收据只能结同一家公司的单，请只勾选同一家公司的发票' }
  }
  const total = invoices.reduce((s, i) => s + Number(i.total_amount), 0)
  return { ok: true, payeeKey: [...keys][0], total: Math.round(total * 100) / 100 }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:ci -- src/lib/invoice-settlement.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/invoice-settlement.ts src/lib/invoice-settlement.test.ts
git commit -m "feat(billing): pure helpers for same-company consolidation validation"
```

---

## Task 3: Server action — `settleInvoicesConsolidated`

Replaces `batchSettleInvoices` (currently `src/app/(portal)/billing/actions.ts:681-854`). Mints ONE OR voucher for the selected same-company invoices.

**Files:**
- Modify: `src/app/(portal)/billing/actions.ts:681-854`

- [ ] **Step 1: Replace the `batchSettleInvoices` function**

Delete the entire `export async function batchSettleInvoices(...)` block (lines 681-854) and replace with:

```ts
// ─── Consolidated invoice settlement (Finance) ─────────────────────────────
// Settle N issued invoices of the SAME payer into ONE Official Receipt voucher.
// Cross-payer selections are rejected (one receipt = one company). Replaces the
// older per-invoice batch settle — see invoices.settlement_voucher_id (mig 276).
export async function settleInvoicesConsolidated(payload: {
  invoiceIds: string[]
  bankAccountId: string
  paymentDate: string // YYYY-MM-DD
}): Promise<{ voucherId: string; voucherNo: string; settledCount: number; total: number }> {
  const user = await requireRole(['finance'])
  const supabase = await createClient()

  if (!payload.invoiceIds?.length) throw new Error('No invoices selected')
  if (!payload.bankAccountId) throw new Error('Bank account is required')
  if (!payload.paymentDate) throw new Error('Payment date is required')

  // Bank + its GL cash account
  const { data: bank } = await supabase
    .from('bank_accounts')
    .select('id, gl_account_code')
    .eq('id', payload.bankAccountId)
    .maybeSingle()
  if (!bank) throw new Error('Bank account not found')
  const bankGlCode = bank.gl_account_code ?? '3000'

  // Fetch selected invoices
  const { data: invoices } = await supabase
    .from('invoices')
    .select(
      'id, invoice_no, company_id, total_amount, status, billable_to_type, billable_to_freetext_name',
    )
    .in('id', payload.invoiceIds)
  if (!invoices || invoices.length === 0) throw new Error('No invoices found')

  // Same-company + issued + non-dept_pool validation (pure helper)
  const check = validateConsolidation(
    invoices.map((i) => ({
      id: i.id,
      status: i.status,
      billable_to_type: i.billable_to_type,
      company_id: i.company_id,
      billable_to_freetext_name: i.billable_to_freetext_name,
      total_amount: i.total_amount,
    })),
  )
  if (!check.ok) throw new Error(check.error)
  const total = check.total

  // Payee label
  const companyId = invoices[0].company_id
  let payeeName = invoices[0].billable_to_freetext_name ?? '—'
  if (companyId) {
    const { data: company } = await supabase
      .from('companies')
      .select('name')
      .eq('id', companyId)
      .maybeSingle()
    payeeName = company?.name ?? '—'
  }

  // Mint OR voucher_no — period from the chosen payment date
  const period = dayjs(payload.paymentDate).format('YYYYMM')
  const { count } = await supabase
    .from('payment_vouchers')
    .select('*', { count: 'exact', head: true })
  const seq = (count ?? 0) + 1
  const voucherNo = `HV-OR-${period}-${String(seq).padStart(4, '0')}`

  const nowIso = new Date().toISOString()
  const invoiceNos = invoices.map((i) => i.invoice_no ?? i.id.slice(0, 8)).join(', ')
  const description = `Settle ${invoices.length} invoice(s) — ${payeeName} (${invoiceNos})`

  // ONE Official Receipt voucher for the whole group (invoice_id NULL —
  // the link lives on invoices.settlement_voucher_id, written below).
  const { data: pv, error: pvErr } = await supabase
    .from('payment_vouchers')
    .insert({
      voucher_no: voucherNo,
      voucher_type: 'billing_payment',
      direction: 'credit',
      source_pool: null,
      target_pool: 'venture_pool',
      status: 'paid',
      amount: total,
      payee_name: payeeName,
      payee_company_id: companyId,
      bank_account_id: payload.bankAccountId,
      invoice_id: null,
      description,
      payment_method: 'bank_transfer',
      created_by: user.id,
      approved_by: user.id,
      approved_at: nowIso,
      executed_by: user.id,
      executed_at: nowIso,
      payment_date: payload.paymentDate,
    })
    .select('id')
    .single()
  if (pvErr || !pv) throw new Error(`voucher insert failed: ${pvErr?.message ?? 'unknown'}`)

  // Primary source row (AR clearing account)
  const { error: srcErr } = await supabase
    .from('payment_voucher_sources')
    .insert({ voucher_id: pv.id, pool: 'venture_pool', amount: total, account_code: '3030' })
  if (srcErr) throw new Error(`source row insert failed: ${srcErr.message}`)

  // Bank cache
  const { error: bumpErr } = await supabase.rpc('bump_bank_for_paid_credit', {
    p_voucher_id: pv.id,
  })
  if (bumpErr) console.error('bump_bank_for_paid_credit warning:', bumpErr.message)

  // Pool credit (receiving side)
  await adjustPool(
    supabase,
    'venture_pool',
    'in',
    total,
    `PV ${voucherNo}: ${description}`,
    user.id,
    null,
    nowIso,
  )

  // GL: Dr Bank (total) / Cr 3030 AR (total), dated to the payment date
  try {
    await postJournalEntry(supabase, {
      transactionDate: payload.paymentDate,
      description: `PV ${voucherNo}: ${description}`,
      referenceType: 'payment_voucher',
      referenceId: pv.id,
      lines: [
        { accountCode: bankGlCode, debit: total, description: `Bank deposit — ${voucherNo}` },
        { accountCode: '3030', credit: total, description: `Payment received — ${payeeName}` },
      ],
      createdBy: user.id,
    })
  } catch (jeErr) {
    console.error('GL posting warning for consolidated settle:', jeErr)
  }

  // Mark every invoice paid + link to this voucher (race-guarded on issued).
  // Trigger 202 fires per row on status→paid for dept-pool crediting.
  const { error: updErr } = await supabase
    .from('invoices')
    .update({ status: 'paid', settlement_voucher_id: pv.id } as never)
    .in('id', invoices.map((i) => i.id))
    .eq('status', 'issued')
  if (updErr) throw new Error(`invoice status update failed: ${updErr.message}`)

  revalidatePath('/billing')
  revalidatePath('/statements')
  revalidatePath('/payments')
  revalidatePath('/dashboard')

  return { voucherId: pv.id, voucherNo, settledCount: invoices.length, total }
}
```

- [ ] **Step 2: Add the helper import**

At the top of `src/app/(portal)/billing/actions.ts`, after the existing `import { adjustPool } from '@/lib/voucher-paid-helpers'` (line 10), add:

```ts
import { validateConsolidation } from '@/lib/invoice-settlement'
```

- [ ] **Step 3: Typecheck the file**

Run: `npx tsc --noEmit`
Expected: no errors referencing `settleInvoicesConsolidated` or `batchSettleInvoices`. (A stale reference in `InvoicesList.tsx` will error — fixed in Task 4. If running tsc now, expect ONLY that one error in `InvoicesList.tsx`.)

- [ ] **Step 4: Commit**

```bash
git add src/app/(portal)/billing/actions.ts
git commit -m "feat(billing): settleInvoicesConsolidated — one OR voucher per same-company group"
```

---

## Task 4: UI — prominent entry point + cross-company guard

**Files:**
- Modify: `src/app/(portal)/billing/_components/InvoicesList.tsx`

- [ ] **Step 1: Swap the action import + add helper import**

In `src/app/(portal)/billing/_components/InvoicesList.tsx`, replace line 13:

```ts
import { batchSettleInvoices } from '../actions'
```

with:

```ts
import { settleInvoicesConsolidated } from '../actions'
import { payeeKey } from '@/lib/invoice-settlement'
```

- [ ] **Step 2: Add a cross-company derived flag**

Immediately after the existing `selectedTotal` line (currently `src/app/(portal)/billing/_components/InvoicesList.tsx:129`), add:

```ts
  // A consolidated receipt covers one payer only. Detect mixed selections so
  // the UI can warn + block before the server rejects.
  const selectedPayeeKeys = new Set(selectedInvoices.map(payeeKey))
  const crossCompany = selectedPayeeKeys.size > 1
```

- [ ] **Step 3: Rewrite `handleBatchSettle` for the single-voucher result**

Replace the whole `handleBatchSettle` function (currently `src/app/(portal)/billing/_components/InvoicesList.tsx:154-183`) with:

```ts
  function handleBatchSettle() {
    setSettleError(null)
    setSettleResult(null)
    if (!settleBank) return setSettleError('Pick a bank account')
    if (!settleDate) return setSettleError('Pick a payment date')
    if (crossCompany) return setSettleError('一张收据只能结同一家公司的单，请只勾选同一家公司的发票')
    const ids = selectedInvoices.map((i) => i.id)
    if (ids.length === 0) return setSettleError('No settleable invoices selected')
    startTransition(async () => {
      try {
        const res = await settleInvoicesConsolidated({
          invoiceIds: ids,
          bankAccountId: settleBank,
          paymentDate: settleDate,
        })
        setSettleResult(`Receipt ${res.voucherNo} — settled ${res.settledCount} invoice(s).`)
        setSelectedIds(new Set())
        setShowSettleModal(false)
        router.refresh()
      } catch (err) {
        setSettleError(err instanceof Error ? err.message : 'Consolidated settle failed')
      }
    })
  }
```

- [ ] **Step 4: Make the helper bar a prominent button**

Replace the helper-bar block (currently `src/app/(portal)/billing/_components/InvoicesList.tsx:247-272`, the `{invoices.some(isBatchSettleable) ? (...) : null}` block) with:

```tsx
          {/* Consolidated-settle helper bar: prominent select-all button + count */}
          {invoices.some(isBatchSettleable) ? (
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <button
                type="button"
                onClick={selectAllIssued}
                className="bg-surface hover:bg-surface-2 border border-hairline rounded-md px-3 py-1.5 text-xs font-sans text-ink transition-colors"
              >
                全选可结算发票
              </button>
              {selectedIds.size > 0 ? (
                <button
                  type="button"
                  onClick={clearSelection}
                  className="text-xs font-sans text-muted hover:text-ink"
                >
                  清除选择
                </button>
              ) : null}
              <span className="text-xs font-mono text-muted">
                {selectedIds.size > 0
                  ? `已选 ${selectedIds.size} 张 · RM ${selectedTotal.toLocaleString('en-MY', { minimumFractionDigits: 2 })}`
                  : '勾选同一公司的 issued 发票，合并结算成一张收据'}
              </span>
              {crossCompany ? (
                <span className="text-xs font-serif italic text-danger">
                  选中了不同公司的单 — 一张收据只能结同一家公司
                </span>
              ) : null}
            </div>
          ) : null}
```

- [ ] **Step 5: Update the floating action bar (label + cross-company disable)**

Replace the floating-bar block (currently `src/app/(portal)/billing/_components/InvoicesList.tsx:431-454`, the `{selectedIds.size > 0 && !showSettleModal ? (...) : null}` block) with:

```tsx
      {/* Floating consolidated-settle action bar (bottom right). */}
      {selectedIds.size > 0 && !showSettleModal ? (
        <div className="fixed bottom-6 right-6 z-30 bg-paper border border-hairline rounded-md shadow-lg px-4 py-3 flex items-center gap-3">
          <div className="font-mono text-sm text-ink">
            {selectedIds.size} 张 · <span className="font-semibold">RM {selectedTotal.toLocaleString('en-MY', { minimumFractionDigits: 2 })}</span>
          </div>
          <button
            type="button"
            onClick={clearSelection}
            className="text-xs font-sans text-muted hover:text-ink"
          >
            清除
          </button>
          <button
            type="button"
            onClick={openSettleModal}
            disabled={selectedInvoices.length === 0 || crossCompany}
            title={crossCompany ? '一张收据只能结同一家公司的单' : undefined}
            className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {crossCompany ? '不同公司不能合并' : `合并结算 ${selectedInvoices.length} 张 → 生成收据`}
          </button>
        </div>
      ) : null}
```

- [ ] **Step 6: Update the modal submit button + cross-company guard inside the modal**

In the modal footer, replace the final submit button (currently `src/app/(portal)/billing/_components/InvoicesList.tsx:544-550`) with:

```tsx
              <button
                onClick={handleBatchSettle}
                disabled={isPending || selectedInvoices.length === 0 || crossCompany}
                className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPending ? '结算中…' : `生成收据 · 结 ${selectedInvoices.length} 张`}
              </button>
```

- [ ] **Step 7: Typecheck + run the existing suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run test:ci`
Expected: all tests PASS (including Task 2's new file).

- [ ] **Step 8: Commit**

```bash
git add src/app/(portal)/billing/_components/InvoicesList.tsx
git commit -m "feat(billing): prominent consolidated-settle entry + same-company guard"
```

---

## Task 5: Single-settle payment date

**Files:**
- Modify: `src/app/(portal)/payments/_components/NewPaymentForm.tsx`
- Modify: `src/app/(portal)/payments/actions.ts:124,191,423`

- [ ] **Step 1: Add payment-date state to the form**

In `src/app/(portal)/payments/_components/NewPaymentForm.tsx`, after the `const [amount, setAmount] = ...` line (currently line 121), add:

```ts
  // Payment date — defaults to today, user can backdate to the real pay date.
  // dayjs not imported here; build today's YYYY-MM-DD from the Date locale.
  const todayIso = new Date().toISOString().slice(0, 10)
  const [paymentDate, setPaymentDate] = useState(todayIso)
```

- [ ] **Step 2: Render the date field**

In the Amount + Bank grid (the `<div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-6">` block that closes at `src/app/(portal)/payments/_components/NewPaymentForm.tsx:442`), add a new full-width date field directly AFTER that closing `</div>` (i.e. between line 442 and the `{/* ── Payment method ── */}` comment on line 444):

```tsx
      {/* ── Payment date ── (backdate to the real settlement date) */}
      <div className="mb-6">
        <label htmlFor="payment_date" className="block text-sm font-sans font-medium text-graphite mb-1.5">
          Payment date
        </label>
        <input
          id="payment_date"
          name="payment_date"
          type="date"
          value={paymentDate}
          onChange={(e) => setPaymentDate(e.target.value)}
          className="w-full max-w-xs px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink font-mono focus:outline-none focus:border-accent-border"
        />
        <p className="font-serif italic text-muted text-xs mt-1.5">
          Defaults to today. Set the actual date the money moved if backdating.
        </p>
      </div>
```

- [ ] **Step 3: Read + validate payment_date in the action**

In `src/app/(portal)/payments/actions.ts`, after `const todayStr = dayjs().format('YYYY-MM-DD')` (line 124), add:

```ts
  // mig 276 / single-settle date: honor a user-chosen payment date when valid,
  // else fall back to today. Drives both payment_date and the settlement JE date.
  const rawPaymentDate = (formData.get('payment_date') as string)?.trim()
  const paymentDateStr = rawPaymentDate && /^\d{4}-\d{2}-\d{2}$/.test(rawPaymentDate)
    ? rawPaymentDate
    : todayStr
```

- [ ] **Step 4: Use it for the voucher row**

In the same file, in the auto-complete insert block, change line 191 from:

```ts
        payment_date: todayStr,
```

to:

```ts
        payment_date: paymentDateStr,
```

- [ ] **Step 5: Use it for the settlement journal entry**

In the same file, in the auto-complete credit JE (the `postJournalEntry` call inside `if (!interBilling)`), change line 423 from:

```ts
          transactionDate: todayStr,
```

to:

```ts
          transactionDate: paymentDateStr,
```

(Leave `approved_at` / `executed_at` / `nowIso` untouched — those record the real operation time, not the backdated payment date.)

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/(portal)/payments/_components/NewPaymentForm.tsx src/app/(portal)/payments/actions.ts
git commit -m "feat(payments): pick payment date on single settle (drives voucher + JE date)"
```

---

## Task 6: Verify + deploy

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npm run test:ci`
Expected: all PASS.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: build succeeds, no type errors. (If OneDrive locks `.next/` with EBUSY, stop, `rm -rf .next`, retry — per HANDOFF.)

- [ ] **Step 3: Deploy**

Push to deploy (auto-deploys to venture-portal-chi.vercel.app). Do NOT use `vercel --prod`.

```bash
git push origin main
```

Watch the Vercel build log (faster than local typecheck — per HANDOFF).

- [ ] **Step 4: Manual smoke check (live)**

On `/statements` (Invoices tab), as Finance:
1. Confirm the prominent **全选可结算发票** button shows when issued invoices exist.
2. Select two issued invoices of the SAME company → floating bar shows **合并结算 2 张 → 生成收据** → open modal → pick bank + date → submit → expect one `HV-OR-…` receipt, both invoices `paid`, dashboard pool + bank updated.
3. Select two issued invoices of DIFFERENT companies → button reads **不同公司不能合并** and is disabled; helper bar shows the red warning.
4. On a single issued invoice, click **Settle →** → confirm the **Payment date** field appears, defaults today, and a backdated date lands on the voucher + the GL entry.

---

## Self-Review Notes

- **Spec coverage:** ① visibility → Task 4 (Steps 4-6). ② single-settle date → Task 5. ③ consolidated same-company voucher → Tasks 1-4. Cross-company block → Task 2 (helper) + Task 3 (server) + Task 4 (client). No printable PDF → intentionally absent (out of scope).
- **Type consistency:** action `settleInvoicesConsolidated` returns `{ voucherId, voucherNo, settledCount, total }`, consumed in Task 4 Step 3. Helper `validateConsolidation` / `payeeKey` / `SettleableInvoice` defined in Task 2, used in Tasks 3-4.
- **Back-compat:** legacy `payment_vouchers.invoice_id` untouched; single-settle still writes it. Consolidated vouchers set it NULL and link via `invoices.settlement_voucher_id`.
