# Settlement Segment Attribution + /dept-pool Reconciliation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make invoice settlements tag the bank-in GL entry with the invoice's department segment (so the GL-derived Venture figure stops double-counting dept settlements), keep the dept_pools credit, and correct the 4 already-settled OR vouchers + the Hookka receipt so `/dept-pool` reconciles to bank.

**Architecture:** Dept-pool cash lives in TWO aligned representations: `dept_pools` table (dept rows) and GL `journal_lines.segment` on bank accounts (Venture = corporate+treasury). Settlement must update BOTH: dept_pools np_in (already) + bank-debit JE tagged with the dept segment (new). A TS `segmentForBillingMode` mirrors the SQL `billing_mode_to_segment`. `postJournalEntry` gains an optional `segment`. Data correction uses the `1900` clearing account to reclassify the marketing bank cash from corporate→marketing segment, and adds a Finance dept_pools row for Hookka.

**Tech Stack:** Next.js 15 Server Actions, Supabase (post_journal_entry RPC, gl_segment enum), TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-03-settlement-segment-attribution-design.md`

---

## File Structure
- **Modify** `src/lib/invoice-settlement.ts` — add `segmentForBillingMode` + (optional) grouping helper.
- **Modify** `src/lib/invoice-settlement.test.ts` — tests.
- **Modify** `src/lib/journal.ts` — `postJournalEntry` accepts optional `segment`.
- **Modify** `src/app/(portal)/billing/actions.ts` — consolidated settle: per-segment grouped settlement JEs.
- **Modify** `src/app/(portal)/payments/actions.ts` — single settle: tag JE with invoice segment.
- **Data only (MCP SQL)** — correct the 4 OR vouchers + Hookka; verify reconciliation.

---

## Task 1: `segmentForBillingMode` helper + tests

**Files:** Modify `src/lib/invoice-settlement.ts`, `src/lib/invoice-settlement.test.ts`

- [ ] **Step 1: Write failing tests** — append to `invoice-settlement.test.ts`:

```ts
import { segmentForBillingMode } from './invoice-settlement'

describe('segmentForBillingMode', () => {
  it('maps each billing mode to its GL segment (mirrors SQL billing_mode_to_segment)', () => {
    expect(segmentForBillingMode('marketing_project')).toBe('marketing')
    expect(segmentForBillingMode('hr_attribution')).toBe('hr')
    expect(segmentForBillingMode('finance_attribution')).toBe('finance')
    expect(segmentForBillingMode('director_office_attribution')).toBe('director_office')
    expect(segmentForBillingMode('director_attribution')).toBe('director_office')
  })
  it('falls back to corporate for venture_attribution and unknown modes', () => {
    expect(segmentForBillingMode('venture_attribution')).toBe('corporate')
    expect(segmentForBillingMode('weird')).toBe('corporate')
  })
})
```

(The existing `import { ... } from './invoice-settlement'` at the top may be extended to include `segmentForBillingMode` instead of a second import line — either compiles.)

- [ ] **Step 2: Run — expect FAIL** `npm run test:ci -- src/lib/invoice-settlement.test.ts` (segmentForBillingMode not exported).

- [ ] **Step 3: Implement** — append to `src/lib/invoice-settlement.ts`:

```ts
// Mirrors the SQL billing_mode_to_segment (IMMUTABLE) so the TS settlement
// path tags the bank-in JE with the same segment the revenue used at issue.
// NOTE: director_attribution → 'director_office' segment (matches SQL), even
// though its POOL is dept_pool_director.
const BILLING_MODE_TO_SEGMENT: Record<string, string> = {
  marketing_project: 'marketing',
  hr_attribution: 'hr',
  finance_attribution: 'finance',
  director_office_attribution: 'director_office',
  director_attribution: 'director_office',
}

export function segmentForBillingMode(mode: string): string {
  return BILLING_MODE_TO_SEGMENT[mode] ?? 'corporate'
}
```

- [ ] **Step 4: Run — expect PASS** `npm run test:ci -- src/lib/invoice-settlement.test.ts`

- [ ] **Step 5: Commit**
```bash
git add src/lib/invoice-settlement.ts src/lib/invoice-settlement.test.ts
git commit -m "feat(billing): segmentForBillingMode helper (mirrors SQL billing_mode_to_segment)"
```

---

## Task 2: `postJournalEntry` accepts optional segment

**Files:** Modify `src/lib/journal.ts`

- [ ] **Step 1: Add `segment` to the input type.** In `PostJournalEntryInput` (after `referenceId?: string`):

```ts
  /** Optional GL segment. When omitted, the DB derives it from reference_type
   *  (journal_entries_set_segment trigger). Pass to force a specific segment. */
  segment?: string
```

- [ ] **Step 2: Pass it to the RPC only when provided.** Replace the `supabase.rpc('post_journal_entry', {...})` args object so it conditionally includes `p_segment`:

```ts
  const rpcArgs: Record<string, unknown> = {
    p_transaction_date: transactionDate,
    p_description: description,
    p_reference_type: referenceType ?? null,
    p_reference_id: referenceId ?? null,
    p_created_by: createdBy,
    p_lines: lines.map((l) => ({
      account_code: l.accountCode,
      debit: l.debit ?? null,
      credit: l.credit ?? null,
      description: l.description ?? null,
    })),
  }
  if (segment) rpcArgs.p_segment = segment
  const { data, error } = await supabase.rpc('post_journal_entry', rpcArgs as never)
```

Also add `segment` to the destructuring at the top of the function:
```ts
  const { transactionDate, description, referenceType, referenceId, lines, createdBy, segment } = input
```

- [ ] **Step 3: Typecheck** `npx tsc --noEmit` — expect no new errors (ignore pre-existing `loan-disbursement.test.ts`).

- [ ] **Step 4: Commit**
```bash
git add src/lib/journal.ts
git commit -m "feat(journal): postJournalEntry accepts optional segment (passthrough to RPC)"
```

---

## Task 3: Consolidated settle — per-segment settlement JEs

**Files:** Modify `src/app/(portal)/billing/actions.ts`

Context: `settleInvoicesConsolidated` already loops `adjustPool` per invoice (dept_pools). Now split the single Dr Bank/Cr 3030 JE into one JE per segment so the bank-in lands in each invoice's dept segment.

- [ ] **Step 1: Import the helper.** The file already imports `{ validateConsolidation, poolAttributions }` from `@/lib/invoice-settlement`. Add `segmentForBillingMode`:

```ts
import { validateConsolidation, poolAttributions, segmentForBillingMode } from '@/lib/invoice-settlement'
```

- [ ] **Step 2: Replace the single settlement JE block** (the `try { await postJournalEntry(... lines: [bank debit total / 3030 credit total] ...) }` block) with a per-segment grouped version:

```ts
  // GL: Dr Bank / Cr 3030, but SPLIT per department segment so the GL-derived
  // Venture figure (corporate+treasury bank) doesn't absorb dept settlements.
  // Group invoice amounts by segmentForBillingMode(billing_mode); one JE/segment.
  const bySegment = new Map<string, number>()
  for (const inv of invoices) {
    const seg = segmentForBillingMode(inv.billing_mode)
    bySegment.set(seg, Math.round(((bySegment.get(seg) ?? 0) + Number(inv.total_amount)) * 100) / 100)
  }
  for (const [seg, segAmount] of bySegment) {
    if (segAmount <= 0) continue
    try {
      await postJournalEntry(supabase, {
        transactionDate: payload.paymentDate,
        description: `PV ${voucherNo}: ${description} [${seg}]`,
        referenceType: 'payment_voucher',
        referenceId: pv.id,
        segment: seg,
        lines: [
          { accountCode: bankGlCode, debit: segAmount, description: `Bank deposit — ${voucherNo}` },
          { accountCode: '3030', credit: segAmount, description: `Payment received — ${payeeName}` },
        ],
        createdBy: user.id,
      })
    } catch (jeErr) {
      console.error('GL posting warning for consolidated settle:', seg, jeErr)
    }
  }
```

- [ ] **Step 3: Typecheck** `npx tsc --noEmit` — no new errors.

- [ ] **Step 4: Run suite** `npm run test:ci` — all pass.

- [ ] **Step 5: Commit**
```bash
git add "src/app/(portal)/billing/actions.ts"
git commit -m "fix(billing): consolidated settle posts bank-in JE per dept segment (no Venture double-count)"
```

---

## Task 4: Single settle — tag settlement JE with invoice segment

**Files:** Modify `src/app/(portal)/payments/actions.ts`

Context: in `createPaymentVoucher`, the auto-complete credit JE (inside `if (!interBilling)`) currently posts Dr Bank/Cr 3030 with no segment → DB derives `corporate`. For an invoice settle, tag it with the invoice's dept segment.

- [ ] **Step 1: Import the helper.** Near the top imports of `payments/actions.ts`, add:

```ts
import { segmentForBillingMode } from '@/lib/invoice-settlement'
```

- [ ] **Step 2: Fetch the invoice billing_mode for settle vouchers.** In the duplicate-check block, extend the open-invoice select (currently `.select('id, status')` at the `voucherType === 'billing_payment' && invoiceId` branch) to also fetch `billing_mode`, and capture it in an outer-scoped variable:

```ts
  let settleBillingMode: string | null = null
  if (voucherType === 'billing_payment' && invoiceId) {
    const { data: openInv } = await supabase
      .from('invoices')
      .select('id, status, billing_mode')
      .eq('id', invoiceId)
      .in('status', ['issued', 'draft'])
      .maybeSingle()
    if (!openInv) {
      throw new Error('Invoice is not open for payment (already paid, via netting, or does not exist)')
    }
    settleBillingMode = (openInv as { billing_mode: string | null }).billing_mode ?? null
    // ... existing existingVoucher duplicate check stays unchanged ...
  }
```

(Keep the existing `existingVoucher` duplicate-check code that follows, unchanged.)

- [ ] **Step 3: Pass the segment on the settlement JE.** In the auto-complete credit JE block (the `postJournalEntry({...})` inside `if (!interBilling)`), add a `segment` field derived from the invoice when this is an invoice settle:

```ts
        await postJournalEntry(supabase, {
          transactionDate: paymentDateStr,
          description: `PV ${voucherNo}: ${description}`,
          referenceType: 'payment_voucher',
          referenceId: data.id,
          ...(invoiceId && settleBillingMode
            ? { segment: segmentForBillingMode(settleBillingMode) }
            : {}),
          lines: [
            { accountCode: glAccountCode, debit: r2(amount), description: `Bank deposit — ${voucherNo}` },
            { accountCode: '3030', credit: r2(amount), description: `Payment received — ${payeeName}` },
          ],
          createdBy: user.id,
        })
```

- [ ] **Step 4: Typecheck** `npx tsc --noEmit` — no new errors.

- [ ] **Step 5: Run suite** `npm run test:ci` — all pass.

- [ ] **Step 6: Commit**
```bash
git add "src/app/(portal)/payments/actions.ts"
git commit -m "fix(payments): single settle tags bank-in JE with invoice dept segment"
```

---

## Task 5: Build + deploy

- [ ] **Step 1:** `npm run test:ci` → all pass.
- [ ] **Step 2:** `npm run build` → succeeds (if EBUSY on `.next`, stop, `rm -rf .next`, retry).
- [ ] **Step 3: Deploy** `git push origin main` (auto-deploys; do NOT use `vercel --prod`).

---

## Task 6: Data correction (MCP SQL — controller runs this, NOT a subagent)

Run via `mcp__supabase__execute_sql`. Do a `begin; ... rollback;` dry-run first that prints the post-state reconciliation, eyeball it, then run the real `begin; ... commit;`.

- [ ] **Step 1: Hookka → Finance pool.** Add the missing Finance dept_pools credit (Hookka bank-in is already finance segment):

```sql
insert into dept_pools (department_id, transaction_type, amount, description, created_by)
values (
  (select id from departments where name='Finance'),
  'np_in', 361.80,
  'Receipt I-000064 Hookka — Finance pool (Other Debtor collected, JE-202605-0053)',
  (select id from users where role='finance' order by created_at limit 1)
);
```

- [ ] **Step 2: Reclass Marketing settlement cash corporate→marketing segment** via 1900 clearing (two balanced JEs):

```sql
select post_journal_entry(
  '2026-05-31'::date,
  'Segment reclass: Marketing settlement cash out of corporate (OR-202605-0001..0004)',
  'segment_reclass', null,
  (select id from users where role='finance' order by created_at limit 1),
  '[{"account_code":"3000","credit":53949.19},{"account_code":"1900","debit":53949.19}]'::jsonb,
  'corporate'::gl_segment
);
select post_journal_entry(
  '2026-05-31'::date,
  'Segment reclass: Marketing settlement cash into marketing (OR-202605-0001..0004)',
  'segment_reclass', null,
  (select id from users where role='finance' order by created_at limit 1),
  '[{"account_code":"3000","debit":53949.19},{"account_code":"1900","credit":53949.19}]'::jsonb,
  'marketing'::gl_segment
);
```

- [ ] **Step 3: Verify reconciliation** — expect `total_deployed = bank = 67441.82`, and Marketing GL-bank segment net == Marketing dept_pool balance (37,842.09):

```sql
with bankcodes as (select gl_account_code from bank_accounts where status='active'),
deptbal as (select coalesce(sum(balance),0) s from dept_pool_balances),
venture as (select coalesce(sum(coalesce(jl.debit,0)-coalesce(jl.credit,0)),0) s
  from journal_lines jl join journal_entries je on je.id=jl.entry_id
  where jl.account_code in (select gl_account_code from bankcodes)
    and je.segment in ('corporate','treasury')),
bankgl as (select coalesce(sum(coalesce(jl.debit,0)-coalesce(jl.credit,0)),0) s
  from journal_lines jl where jl.account_code in (select gl_account_code from bankcodes)),
mktgseg as (select coalesce(sum(coalesce(jl.debit,0)-coalesce(jl.credit,0)),0) s
  from journal_lines jl join journal_entries je on je.id=jl.entry_id
  where jl.account_code in (select gl_account_code from bankcodes) and je.segment='marketing')
select (select s from deptbal) dept_sum, (select s from venture) venture_gl,
       (select s from deptbal)+(select s from venture) total_deployed,
       (select s from bankgl) bank_total,
       (select s from mktgseg) marketing_bank_seg;
```

Expect: `total_deployed = bank_total = 67441.82`; `marketing_bank_seg = 37842.09`.

- [ ] **Step 4: Record in HANDOFF** — append the two corrections (Hookka Finance pool; Marketing segment reclass via 1900) under the 2026-06-03 post-deploy section, then commit + push HANDOFF.

---

## Self-Review Notes
- **Spec coverage:** code §A→Task 3, §B→Task 4, §C→Task 1; data §1(Hookka)→Task6 Step1, §2(marketing reclass)→Task6 Step2, §3(Carress untouched)→n/a. Reconciliation verify→Task6 Step3.
- **Type consistency:** `segmentForBillingMode(mode: string): string` defined Task 1, used Tasks 3-4. `postJournalEntry` gains `segment?: string` Task 2, used Tasks 3-4.
- **Reconciliation math:** venture −53,949.19 (marketing out of corporate) + dept +361.80 (Hookka Finance) ⇒ 121,029.21 − 53,949.19 + 361.80 = 67,441.82 = bank. ✓
