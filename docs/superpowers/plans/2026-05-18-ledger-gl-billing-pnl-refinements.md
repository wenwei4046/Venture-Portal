# Ledger GL Format, Billing Layout & P&L Revenue Grouping — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (A) Re-present the General Ledger (web + Excel + PDF) as a standard GL with account-group headers, a `BALANCE B/F` line, and Journal Type / Ref. 1 columns; (B) make the invoice billing "Pool split" a roomy card layout; (C) group Income Statement revenue by account name with web expand/collapse and always-expanded exports.

**Architecture:** Three independent task groups. A & C extend pure helpers in `src/lib/cfo-reports.ts` (TDD on the pure logic) plus their async fetchers and the report page + xlsx/pdf formatters. B is a contained client-component layout change. No DB/migration changes; `fetchIncomeStatement`/`fetchCashflowStatement` signatures unchanged; `AccountPicker` internals unchanged.

**Tech Stack:** Next.js 15 App Router, React client components, TypeScript strict, Tailwind (Ledger-Dense tokens), Vitest, `xlsx`, `@react-pdf/renderer`, Supabase JS.

**Spec:** `docs/superpowers/specs/2026-05-18-ledger-gl-billing-pnl-refinements-design.md`

**Git:** branch `main` (user works directly on main). Every commit uses the explicit identity (repo has no global git identity) and is NOT pushed:
`git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "..."`

Known pre-existing unrelated tsc errors live ONLY in `src/lib/loan-disbursement.test.ts` (missing `parent_code`) — ignore them; just confirm no NEW errors in changed files. `npx tsc --noEmit` and `npx next build` are the verification commands; full tests via `npx vitest run`.

---

## File Structure

**Group A — Ledger GL:**
- Modify `src/lib/cfo-reports.ts`: extend `RawLedgerLine`/`LedgerLine`, `buildLedger` (inject B/F line + passthrough), add `resolveLedgerSourceMeta`, wire into `fetchLedgers`.
- Modify `src/lib/cfo-reports.test.ts`: extend `buildLedger` tests.
- Modify `src/app/(portal)/reports/ledger/page.tsx`: 8-column GL table.
- Modify `src/app/(portal)/reports/ledger/export/_format/xlsx.ts` and `pdf.tsx`: 8-column GL output.

**Group B — Pool split:**
- Modify `src/app/(portal)/billing/_components/CreateInvoiceButton.tsx`: `PoolTable` → card layout.

**Group C — P&L revenue grouping:**
- Modify `src/lib/cfo-reports.ts`: `RawInvoiceRow` + invoice fetch (categoryName), add pure `groupRevenueByAccount`, `PoolPnl` gains `revenueGroups`, `classifyRows` builds groups.
- Modify `src/lib/cfo-reports.test.ts`: add `groupRevenueByAccount` tests; update revenue assertions.
- Modify `src/app/(portal)/reports/income-statement/page.tsx`: revenue → expand/collapse client component.
- Modify `src/app/(portal)/reports/income-statement/export/_format/xlsx.ts` and `pdf.tsx`: revenue groups expanded.

---

# TASK GROUP A — General Ledger GL format

## Task A1: Ledger types + `buildLedger` B/F + Journal Type derivation (TDD)

**Files:**
- Modify: `src/lib/cfo-reports.ts` (interfaces near line 1303–1368; `buildLedger`)
- Test: `src/lib/cfo-reports.test.ts`

Current types (verbatim, lines ~1303–1330):
```typescript
export interface RawLedgerLine {
  entryDate: string
  entryNo: string
  description: string
  debit: number
  credit: number
}
export interface LedgerLine {
  entryDate: string
  entryNo: string
  description: string
  debit: number
  credit: number
  runningBalance: number
}
export interface Ledger {
  code: string
  accountName: string
  accountType: AccountType
  from: string
  to: string
  openingBalance: number
  closingBalance: number
  periodTotals: { debit: number; credit: number }
  lines: LedgerLine[]
}
```

- [ ] **Step 1: Write failing tests**

Add to `src/lib/cfo-reports.test.ts` (find the existing `describe('buildLedger'` block; add these `it`s inside it; if no such block exists, add a new `describe('buildLedger GL fields', ...)` importing `buildLedger` the same way other cfo-reports tests import):

```typescript
describe('buildLedger GL fields', () => {
  const account = { code: '5700', name: 'Rental Income', type: 'revenue' as const }

  it('injects a BALANCE B/F line as lines[0] carrying the opening balance', () => {
    const led = buildLedger({
      account, openingBalance: -112894.42, from: '2026-02-01', to: '2026-02-28',
      rawLines: [
        { entryDate: '2026-02-09', entryNo: 'JE-1', description: 'KL Gateway',
          debit: 0, credit: 7159.12, accountDesc: 'Rental Income',
          journalType: 'SALES', ref: 'I-2602-0043' },
      ],
    })
    expect(led.lines[0]).toEqual({
      entryDate: '', entryNo: '', description: 'BALANCE B/F',
      accountDesc: 'Rental Income', journalType: '', ref: '',
      debit: 0, credit: 0, runningBalance: -112894.42,
    })
  })

  it('passes accountDesc/journalType/ref through and keeps running balance algorithm', () => {
    const led = buildLedger({
      account, openingBalance: 0, from: '2026-02-01', to: '2026-02-28',
      rawLines: [
        { entryDate: '2026-02-09', entryNo: 'JE-1', description: 'x',
          debit: 0, credit: 1000, accountDesc: 'Rental Income',
          journalType: 'SALES', ref: 'I-1' },
        { entryDate: '2026-02-10', entryNo: 'JE-2', description: 'y',
          debit: 200, credit: 0, accountDesc: 'Rental Income',
          journalType: 'PAYMENT', ref: 'HV-PV-1' },
      ],
    })
    // lines[0] = B/F (running 0), then the two lines
    expect(led.lines[1]).toMatchObject({ journalType: 'SALES', ref: 'I-1', accountDesc: 'Rental Income', runningBalance: -1000 })
    expect(led.lines[2]).toMatchObject({ journalType: 'PAYMENT', ref: 'HV-PV-1', runningBalance: -800 })
    expect(led.periodTotals).toEqual({ debit: 200, credit: 1000 })
    expect(led.closingBalance).toBe(-800)
  })
})
```

- [ ] **Step 2: Run, expect fail**

Run: `npx vitest run src/lib/cfo-reports.test.ts -t "buildLedger GL fields"`
Expected: FAIL (type error / property missing).

- [ ] **Step 3: Extend the interfaces**

Replace the three interfaces with:

```typescript
export interface RawLedgerLine {
  entryDate: string
  entryNo: string
  description: string
  accountDesc: string
  journalType: string
  ref: string
  debit: number
  credit: number
}
export interface LedgerLine {
  entryDate: string
  entryNo: string
  description: string
  accountDesc: string
  journalType: string
  ref: string
  debit: number
  credit: number
  runningBalance: number
}
export interface Ledger {
  code: string
  accountName: string
  accountType: AccountType
  from: string
  to: string
  openingBalance: number
  closingBalance: number
  periodTotals: { debit: number; credit: number }
  lines: LedgerLine[]
}
```

- [ ] **Step 4: Update `buildLedger` to inject the B/F line + passthrough**

Current `buildLedger` body (lines ~1332–1368) maps rawLines to LedgerLine. Replace its body so it (a) prepends a B/F line, (b) carries the new fields. New full function:

```typescript
export function buildLedger(args: {
  account: CoaLeafAccount
  openingBalance: number
  rawLines: RawLedgerLine[]
  from: string
  to: string
}): Ledger {
  const { account, openingBalance, rawLines, from, to } = args
  let running = openingBalance
  let totalDebit = 0
  let totalCredit = 0
  const lines: LedgerLine[] = [
    {
      entryDate: '',
      entryNo: '',
      description: 'BALANCE B/F',
      accountDesc: account.name,
      journalType: '',
      ref: '',
      debit: 0,
      credit: 0,
      runningBalance: r2(openingBalance),
    },
  ]
  for (const raw of rawLines) {
    running += raw.debit - raw.credit
    totalDebit += raw.debit
    totalCredit += raw.credit
    lines.push({
      entryDate: raw.entryDate,
      entryNo: raw.entryNo,
      description: raw.description,
      accountDesc: raw.accountDesc,
      journalType: raw.journalType,
      ref: raw.ref,
      debit: r2(raw.debit),
      credit: r2(raw.credit),
      runningBalance: r2(running),
    })
  }
  return {
    code: account.code,
    accountName: account.name,
    accountType: account.type,
    from,
    to,
    openingBalance: r2(openingBalance),
    closingBalance: r2(running),
    periodTotals: { debit: r2(totalDebit), credit: r2(totalCredit) },
    lines,
  }
}
```

- [ ] **Step 5: Run tests, expect pass**

Run: `npx vitest run src/lib/cfo-reports.test.ts -t "buildLedger"`
Expected: PASS. Then full `npx vitest run` — note any other `buildLedger`/ledger tests now failing because rawLines lack the new fields; if existing tests construct `RawLedgerLine` without the 3 new fields, update those fixtures to include `accountDesc:'', journalType:'', ref:''` (do NOT change their numeric expectations; only add the new fields). Re-run until green.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit` — confirm the only errors are the known `loan-disbursement.test.ts` ones; fix any new ones in cfo-reports.

- [ ] **Step 7: Commit**

```
git add src/lib/cfo-reports.ts src/lib/cfo-reports.test.ts
git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "feat(ledger): GL line fields + BALANCE B/F injection in buildLedger"
```

## Task A2: `resolveLedgerSourceMeta` + wire Journal Type/Ref into `fetchLedgers`

**Files:** Modify `src/lib/cfo-reports.ts` (`fetchLedgers` ~1447–1621; add resolver near `resolveSourceDescriptions` ~1396).

`resolveSourceDescriptions` (lines 1396–1435) is the pattern to mirror. Add this new exported function immediately after it:

```typescript
export async function resolveLedgerSourceMeta(
  supabase: SupabaseClient,
  refs: Array<{ referenceType: string; referenceId: string }>,
): Promise<Map<string, { journalType: string; ref: string }>> {
  const out = new Map<string, { journalType: string; ref: string }>()
  if (refs.length === 0) return out

  const invoiceIds = new Set<string>()
  const pvIds = new Set<string>()
  for (const r of refs) {
    if (r.referenceType === 'invoice') invoiceIds.add(r.referenceId)
    else if (r.referenceType === 'payment_voucher') pvIds.add(r.referenceId)
  }

  if (invoiceIds.size > 0) {
    const { data, error } = await supabase
      .from('invoices')
      .select('id, invoice_no')
      .in('id', Array.from(invoiceIds))
    if (error) throw new Error(`resolveLedgerSourceMeta invoices: ${error.message}`)
    for (const r of data ?? []) {
      out.set(`invoice:${r.id as string}`, {
        journalType: 'SALES',
        ref: (r.invoice_no as string | null) ?? '',
      })
    }
  }

  if (pvIds.size > 0) {
    const { data, error } = await supabase
      .from('payment_vouchers')
      .select('id, voucher_no, direction')
      .in('id', Array.from(pvIds))
    if (error) throw new Error(`resolveLedgerSourceMeta payment_vouchers: ${error.message}`)
    for (const r of data ?? []) {
      const dir = r.direction as string | null
      out.set(`payment_voucher:${r.id as string}`, {
        journalType: dir === 'credit' ? 'RECEIPT' : 'PAYMENT',
        ref: (r.voucher_no as string | null) ?? '',
      })
    }
  }

  return out
}
```

Note: confirm the `payment_vouchers` table has columns `voucher_no` and `direction` (the OR/PV prefix work in mig 252 set voucher numbers; `direction` is `'credit'|'debit'`). If the column is named differently (e.g. `voucher_number`), adjust the `.select` and field read accordingly — verify via a quick `Grep` for `voucher_no` / `direction` in `src/lib` or types before finalizing.

- [ ] **Step 1: Add the resolver** (code above).

- [ ] **Step 2: Call it in `fetchLedgers` and thread into rawLines**

In `fetchLedgers`, section 4 currently builds `descOverrides` and `jeById` (lines ~1537–1557). After `const descOverrides = await resolveSourceDescriptions(supabase, refs)` add:

```typescript
const srcMeta = await resolveLedgerSourceMeta(supabase, refs)
```

Change the `jeById` value type and population to also carry journalType + ref. Replace the block (lines ~1546–1557) with:

```typescript
const jeById = new Map<
  string,
  { entryNo: string; transactionDate: string; description: string; journalType: string; ref: string }
>()
for (const j of periodJes2) {
  const fallback = (j.description as string) ?? ''
  const refKey =
    j.reference_type && j.reference_id ? `${j.reference_type}:${j.reference_id}` : null
  const description = refKey ? descOverrides.get(refKey) ?? fallback : fallback
  const meta = refKey ? srcMeta.get(refKey) : undefined
  jeById.set(j.id as string, {
    entryNo: j.entry_no as string,
    transactionDate: j.transaction_date as string,
    description,
    journalType: meta?.journalType ?? 'JOURNAL',
    ref: meta?.ref ?? (j.entry_no as string),
  })
}
```

(Rationale: manual JEs / JEs with no resolvable source → `journalType: 'JOURNAL'`, `ref` falls back to the JE's own `entry_no`.)

Extend the `LineWithMeta` type (lines ~1560–1568) to add `journalType: string; ref: string; accountDesc: string`, and the push (lines ~1582–1590) to populate them:

```typescript
type LineWithMeta = {
  code: string
  id: string
  entryNo: string
  entryDate: string
  description: string
  accountDesc: string
  journalType: string
  ref: string
  debit: number
  credit: number
}
```
```typescript
      linesByCode.get(code)?.push({
        code,
        id: l.id as string,
        entryNo: je.entryNo,
        entryDate: je.transactionDate,
        description: je.description,
        accountDesc: account_name_placeholder, // replaced below
        journalType: je.journalType,
        ref: je.ref,
        debit: Number(l.debit ?? 0),
        credit: Number(l.credit ?? 0),
      })
```
`accountDesc` is the account's name; it is known per-account in section 6's loop, not here. Simplest: do NOT set accountDesc in `LineWithMeta`; instead set it when mapping to `RawLedgerLine` in section 6 where `account` is in scope. So: omit `accountDesc` from `LineWithMeta` and the push above (keep journalType/ref there), and in section 6 (lines ~1603–1609) change the `rawLines` map to:

```typescript
    const rawLines: RawLedgerLine[] = rawByCode.map((l) => ({
      entryDate: l.entryDate,
      entryNo: l.entryNo,
      description: l.description,
      accountDesc: account.name,
      journalType: l.journalType,
      ref: l.ref,
      debit: l.debit,
      credit: l.credit,
    }))
```
So the final `LineWithMeta` is the current shape **plus** `journalType: string; ref: string` only (no accountDesc). Update the push accordingly (drop the `accountDesc` line from the snippet above).

- [ ] **Step 3: Typecheck + targeted run**

Run: `npx tsc --noEmit` (no new errors) and `npx vitest run src/lib/cfo-reports.test.ts` (green; fetchLedgers is not unit-tested — it's DB-bound — so just ensure compile + existing buildLedger tests pass).

- [ ] **Step 4: Commit**

```
git add src/lib/cfo-reports.ts
git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "feat(ledger): resolveLedgerSourceMeta — Journal Type + Ref per entry"
```

## Task A3: Ledger web page → 8-column GL table

**File:** Modify `src/app/(portal)/reports/ledger/page.tsx`.

Current `LedgerSection` (lines ~162–225): a `sect-head`, a standalone "Opening balance (…)" line, then a 6-col `ledger-table` (Date/Entry/Description/Debit/Credit/Balance) with a tfoot of period totals + closing balance. `formatSignedBalance`, `formatMoney`, `dayjs` are imported in the file; `Ledger` type imported from `@/lib/cfo-reports`.

- [ ] **Step 1: Replace `LedgerSection`** with the GL structure (account header row carrying period Dr/Cr/closing; B/F is now `led.lines[0]`; per-line Journal Type + Ref. 1; footer total row). Replace the whole `function LedgerSection({ led }: { led: Ledger }) { ... }`:

```tsx
function LedgerSection({ led }: { led: Ledger }) {
  return (
    <section className="mb-10">
      <table className="ledger-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Acc. Desc.</th>
            <th>Journal Type</th>
            <th>Ref. 1</th>
            <th>Desc.</th>
            <th className="num">Home DR</th>
            <th className="num">Home CR</th>
            <th className="num">Home Balance</th>
          </tr>
        </thead>
        <tbody>
          <tr className="bg-surface border-t-2 border-hairline">
            <td colSpan={5} className="font-serif italic text-ink font-semibold">
              Acc. No.: {led.code} · {led.accountName}
            </td>
            <td className="num font-semibold">
              {led.periodTotals.debit > 0 ? formatMoney(led.periodTotals.debit) : '—'}
            </td>
            <td className="num font-semibold">
              {led.periodTotals.credit > 0 ? formatMoney(led.periodTotals.credit) : '—'}
            </td>
            <td className="num font-semibold">{formatSignedBalance(led.closingBalance)}</td>
          </tr>
          {led.lines.map((l, i) => {
            const isBf = l.description === 'BALANCE B/F' && l.entryDate === ''
            return (
              <tr key={i} className={isBf ? 'text-graphite italic' : ''}>
                <td className="font-mono text-xs">
                  {l.entryDate ? dayjs(l.entryDate).format('D MMM YYYY') : '—'}
                </td>
                <td className="text-sm">{l.accountDesc}</td>
                <td className="font-mono text-xs uppercase tracking-wide text-accent">
                  {l.journalType}
                </td>
                <td className="font-mono text-sm text-ink">{l.ref}</td>
                <td className="text-sm">{l.description}</td>
                <td className="num">{l.debit > 0 ? formatMoney(l.debit) : '—'}</td>
                <td className="num">{l.credit > 0 ? formatMoney(l.credit) : '—'}</td>
                <td className="num">{formatSignedBalance(l.runningBalance)}</td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-hairline">
            <td colSpan={5} className="font-serif italic text-ink font-semibold">
              {led.code} {led.accountName} — total
            </td>
            <td className="num font-semibold">
              {led.periodTotals.debit > 0 ? formatMoney(led.periodTotals.debit) : '—'}
            </td>
            <td className="num font-semibold">
              {led.periodTotals.credit > 0 ? formatMoney(led.periodTotals.credit) : '—'}
            </td>
            <td className="num font-semibold text-num-ink">
              {formatSignedBalance(led.closingBalance)}
            </td>
          </tr>
        </tfoot>
      </table>
    </section>
  )
}
```

If `LedgerSection` referenced the removed `accountType` sub-label or the standalone opening-balance `<div>` outside the function, delete those too (the new section is self-contained; the old `sect-head` with `led.accountType.replace('_',' ')` and the `Opening balance (...)` div are removed). Keep the page's outer structure (page-head, picker, the `.map(led => <LedgerSection .../>)`).

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit` (no new errors for ledger/page) then `npx next build` (must compile; `/reports/ledger` route builds).

- [ ] **Step 3: Commit**

```
git add "src/app/(portal)/reports/ledger/page.tsx"
git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "feat(ledger): 8-column GL web layout (B/F, Journal Type, Ref. 1)"
```

## Task A4: Ledger Excel export → 8-column GL

**File:** Modify `src/app/(portal)/reports/ledger/export/_format/xlsx.ts`.

Current `buildLedgerXlsx(led: Ledger)` builds a 6-col sheet. Replace its body to emit the 8-col GL (header row, account header row, B/F + lines, total row). `fmtBalance` and `dayjs` already imported.

- [ ] **Step 1: Replace `buildLedgerXlsx`:**

```typescript
export function buildLedgerXlsx(led: Ledger): Buffer {
  const rows: (string | number | null)[][] = []
  rows.push([
    `Acc. No.: ${led.code} · ${led.accountName}`, null, null, null, null,
    led.periodTotals.debit > 0 ? led.periodTotals.debit : null,
    led.periodTotals.credit > 0 ? led.periodTotals.credit : null,
    fmtBalance(led.closingBalance),
  ])
  for (const l of led.lines) {
    rows.push([
      l.entryDate ? dayjs(l.entryDate).format('D MMM YYYY') : '—',
      l.accountDesc,
      l.journalType,
      l.ref,
      l.description,
      l.debit > 0 ? l.debit : null,
      l.credit > 0 ? l.credit : null,
      fmtBalance(l.runningBalance),
    ])
  }
  rows.push([
    `${led.code} ${led.accountName} — total`, null, null, null, null,
    led.periodTotals.debit, led.periodTotals.credit, fmtBalance(led.closingBalance),
  ])

  return buildXlsxBuffer({
    sheetName: 'Ledger',
    headerRow: ['Date', 'Acc. Desc.', 'Journal Type', 'Ref. 1', 'Desc.', 'Home DR', 'Home CR', 'Home Balance'],
    rows,
    columnWidths: [14, 26, 14, 18, 40, 14, 14, 18],
  })
}
```

If the ledger export route maps multiple `Ledger`s (multi-account), it currently calls `buildLedgerXlsx(led)` per ledger or once — read `src/app/(portal)/reports/ledger/export/route.tsx` first; if it builds one sheet per account keep that; if it concatenates, ensure each account's block (header row → lines → total row) is emitted in sequence with a blank separator row between accounts (push `[]` between accounts). Match the route's existing single-vs-multi behavior; only the per-account row shape changes.

- [ ] **Step 2: Typecheck + build**, then commit:

```
git add "src/app/(portal)/reports/ledger/export/_format/xlsx.ts"
git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "feat(ledger): 8-column GL Excel export"
```

## Task A5: Ledger PDF export → 8-column GL

**File:** Modify `src/app/(portal)/reports/ledger/export/_format/pdf.tsx`.

Current `LedgerPdf({ led })` renders a 6-col `PdfTable` landscape. Replace columns + rows to the 8-col GL with account header + total rows folded into the rows array (PdfTable has no separate header-row concept beyond `columns`).

- [ ] **Step 1: Replace the `PdfTable` columns and rows** inside `LedgerPdf`:

```tsx
      <PdfTable
        columns={[
          { label: 'Date',         width: 60 },
          { label: 'Acc. Desc.',   width: 110 },
          { label: 'Journal Type', width: 70 },
          { label: 'Ref. 1',       width: 90 },
          { label: 'Desc.',        width: 200 },
          { label: 'Home DR',      width: 70, align: 'right' },
          { label: 'Home CR',      width: 70, align: 'right' },
          { label: 'Home Balance', width: 90, align: 'right' },
        ]}
        numberFormat="money"
        rows={[
          [`Acc. No.: ${led.code} · ${led.accountName}`, '', '', '', '',
            led.periodTotals.debit > 0 ? led.periodTotals.debit : null,
            led.periodTotals.credit > 0 ? led.periodTotals.credit : null,
            fmtBalance(led.closingBalance)],
          ...led.lines.map((l) => [
            l.entryDate ? dayjs(l.entryDate).format('D MMM YYYY') : '—',
            l.accountDesc,
            l.journalType,
            l.ref,
            l.description,
            l.debit > 0 ? l.debit : null,
            l.credit > 0 ? l.credit : null,
            fmtBalance(l.runningBalance),
          ] as (string | number | null)[]),
          [`${led.code} ${led.accountName} — total`, '', '', '', '',
            led.periodTotals.debit, led.periodTotals.credit, fmtBalance(led.closingBalance)],
        ]}
      />
```
Keep the surrounding `<PdfDocument title="General Ledger" ... orientation="landscape">`; update its `subtitle` to drop the old opening/closing string if it referenced removed fields (it can stay as `${led.code} ${led.accountName}` — read the file and keep what still compiles). Keep `fmtBalance`/`dayjs` imports.

- [ ] **Step 2: Typecheck + build**, then commit:

```
git add "src/app/(portal)/reports/ledger/export/_format/pdf.tsx"
git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "feat(ledger): 8-column GL PDF export"
```

---

# TASK GROUP B — Invoice billing "Pool split" roomy card layout

## Task B1: `PoolTable` → stacked card layout

**File:** Modify `src/app/(portal)/billing/_components/CreateInvoiceButton.tsx` (the `PoolTable` component, ~lines 813–917).

Context: `PoolRow = { uid: string; mode: CreateInvoiceMode | ''; categoryCode: string; amount: string }`. `POOL_OPTIONS` (5 entries). `inputCls` = `'w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent-border disabled:opacity-50 disabled:cursor-not-allowed'`. Handlers `onUpdate(uid, patch)`, `onAdd()`, `onRemove(uid)` are passed in. `AccountPicker` props used: `accounts`, `value`, `onChange`, `name`, `placeholder`, `typeFilter`, `disabled`.

Root cause to fix: the old markup wraps rows in `<div className="border ... overflow-hidden">` + a `<table>` where the category `<td>` is narrow, so the `AccountPicker` absolute dropdown is both narrow and clipped by `overflow-hidden`.

- [ ] **Step 1: Replace the `PoolTable` component body** (keep its props/signature exactly as currently declared — same destructured props `{ poolRows, categoryOptions, isPending, isRatioTemplate, onUpdate, onAdd, onRemove }`). New render — cards, no wrapping `overflow-hidden`, picker gets full row width:

```tsx
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-xs font-sans font-medium text-graphite">
          Pool split <span className="text-danger">*</span>
        </div>
        <div className="text-xs font-serif italic text-muted">
          {isRatioTemplate
            ? 'Amounts act as ratio template — each subsidiary is split by these proportions'
            : null}
        </div>
      </div>

      <div className="space-y-3">
        {poolRows.map((r) => (
          <div key={r.uid} className="border border-hairline rounded-md bg-surface p-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="text-xs font-mono uppercase tracking-wide text-muted">Pool entry</div>
              <button
                onClick={() => onRemove(r.uid)}
                disabled={isPending || poolRows.length === 1}
                className="text-muted hover:text-danger disabled:opacity-30 disabled:cursor-not-allowed text-lg leading-none"
                aria-label="Remove row"
                type="button"
              >
                ×
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3">
              <label className="block">
                <span className="block text-xs font-sans text-graphite mb-1">Pool</span>
                <select
                  value={r.mode}
                  onChange={(e) => onUpdate(r.uid, { mode: e.target.value as CreateInvoiceMode })}
                  disabled={isPending}
                  className={inputCls}
                >
                  <option value="">Select pool…</option>
                  {POOL_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="block text-xs font-sans text-graphite mb-1">Category</span>
                <AccountPicker
                  accounts={categoryOptions}
                  value={r.categoryCode}
                  onChange={(code) => onUpdate(r.uid, { categoryCode: code })}
                  name={`pool_row_category_${r.uid}_display`}
                  placeholder="Select category…"
                  typeFilter={['revenue', 'cost', 'other_income']}
                  disabled={isPending}
                />
              </label>
              <label className="block">
                <span className="block text-xs font-sans text-graphite mb-1">
                  {isRatioTemplate ? 'Ratio (RM)' : 'Amount (RM)'}
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={r.amount}
                  onChange={(e) => onUpdate(r.uid, { amount: e.target.value.replace(/[^\d.]/g, '') })}
                  placeholder="0.00"
                  disabled={isPending}
                  className={inputCls + ' font-mono tabular text-right'}
                />
              </label>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onAdd}
        disabled={isPending}
        className="mt-3 text-sm text-accent hover:underline disabled:opacity-50"
      >
        + Add pool entry
      </button>
    </div>
  )
```

If the original `PoolTable` had a "+ Add pool entry"/"+ Add subsidiary" affordance with specific copy or an extra summary row beneath the table, preserve that exact copy/behaviour — read the current full component first and keep any logic (e.g. a totals/ratio hint line) that isn't the cramped table itself; only the table→cards swap is in scope. Do NOT modify `AccountPicker`, `PoolRow`, the handlers, `categoryOptions`, or the submit payload.

- [ ] **Step 2: Typecheck + build**

`npx tsc --noEmit` (no new errors) + `npx next build` (compiles; `/billing` route builds).

- [ ] **Step 3: Commit**

```
git add "src/app/(portal)/billing/_components/CreateInvoiceButton.tsx"
git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "feat(billing): roomy card layout for Pool split (uncramp category picker)"
```

---

# TASK GROUP C — P&L revenue grouped by account (expand/collapse)

## Task C1: `RawInvoiceRow` + categoryName fetch + pure `groupRevenueByAccount` (TDD)

**Files:** Modify `src/lib/cfo-reports.ts`; Test `src/lib/cfo-reports.test.ts`.

Current (verbatim): `RawInvoiceRow` (lines ~51–56) = `{ invoiceNo, companyShortCode, pool, amount }`. The invoice fetch (lines ~690–713) selects `invoice_no, total_amount, billing_mode, period_month, status, company_id, category_code`, looks up company short codes, returns rows WITHOUT category info. `linesFrom` (lines ~256–261) sorts desc by amount. `Line = { label: string; amount: number }`.

- [ ] **Step 1: Write failing tests for `groupRevenueByAccount`**

Add to `src/lib/cfo-reports.test.ts`:

```typescript
import { groupRevenueByAccount } from './cfo-reports'

describe('groupRevenueByAccount', () => {
  it('groups invoice items by account, sums subtotals, sorts groups + items desc, drops zero', () => {
    const groups = groupRevenueByAccount({
      invoiceItems: [
        { accountCode: '5000', accountName: 'Service Revenue - Subs', label: 'DC · I-1', amount: 1000 },
        { accountCode: '5000', accountName: 'Service Revenue - Subs', label: 'DC · I-2', amount: 3000 },
        { accountCode: '5100', accountName: 'Rental Income', label: 'KG · I-3', amount: 500 },
        { accountCode: '5100', accountName: 'Rental Income', label: 'KG · I-4', amount: 0 },
      ],
      flatLines: [{ label: 'Interest income — Loans', amount: 250 }],
    })
    expect(groups.map((g) => [g.accountName, g.subtotal])).toEqual([
      ['Service Revenue - Subs', 4000],
      ['Interest income — Loans', 250],
      ['Rental Income', 500],
    ])
    const subs = groups.find((g) => g.accountName === 'Service Revenue - Subs')!
    expect(subs.items).toEqual([
      { label: 'DC · I-2', amount: 3000 },
      { label: 'DC · I-1', amount: 1000 },
    ])
    const interest = groups.find((g) => g.accountName === 'Interest income — Loans')!
    expect(interest.items).toEqual([{ label: 'Interest income — Loans', amount: 250 }])
    expect(groups.find((g) => g.accountName === 'Rental Income')!.items).toEqual([
      { label: 'KG · I-3', amount: 500 },
    ])
  })

  it('returns [] when no revenue', () => {
    expect(groupRevenueByAccount({ invoiceItems: [], flatLines: [] })).toEqual([])
  })
})
```

- [ ] **Step 2: Run, expect fail** — `npx vitest run src/lib/cfo-reports.test.ts -t "groupRevenueByAccount"` → FAIL (not exported).

- [ ] **Step 3: Add the types + pure function** in `src/lib/cfo-reports.ts` (near `linesFrom`):

```typescript
export interface RevenueGroup {
  accountCode: string
  accountName: string
  subtotal: number
  items: Line[]
}

export function groupRevenueByAccount(input: {
  invoiceItems: Array<{ accountCode: string; accountName: string; label: string; amount: number }>
  flatLines: Line[]
}): RevenueGroup[] {
  const byAccount = new Map<string, { accountCode: string; accountName: string; items: Line[] }>()
  for (const it of input.invoiceItems) {
    if (it.amount === 0) continue
    let g = byAccount.get(it.accountName)
    if (!g) {
      g = { accountCode: it.accountCode, accountName: it.accountName, items: [] }
      byAccount.set(it.accountName, g)
    }
    g.items.push({ label: it.label, amount: r2(it.amount) })
  }
  const groups: RevenueGroup[] = [...byAccount.values()].map((g) => ({
    accountCode: g.accountCode,
    accountName: g.accountName,
    items: g.items.slice().sort((a, b) => b.amount - a.amount),
    subtotal: r2(g.items.reduce((s, i) => s + i.amount, 0)),
  }))
  for (const fl of input.flatLines) {
    if (fl.amount === 0) continue
    groups.push({
      accountCode: '',
      accountName: fl.label,
      subtotal: r2(fl.amount),
      items: [{ label: fl.label, amount: r2(fl.amount) }],
    })
  }
  return groups
    .filter((g) => g.subtotal !== 0)
    .sort((a, b) => b.subtotal - a.subtotal)
}
```

- [ ] **Step 4: Run, expect pass** — `npx vitest run src/lib/cfo-reports.test.ts -t "groupRevenueByAccount"` → PASS (2).

- [ ] **Step 5: Extend `RawInvoiceRow` + invoice fetch to carry category name**

`RawInvoiceRow` (lines ~51–56) — add fields:
```typescript
export interface RawInvoiceRow {
  invoiceNo: string
  companyShortCode: string
  pool: string
  amount: number
  categoryCode: string
  categoryName: string
}
```
In the invoice fetch (lines ~690–713), `category_code` is already selected. After the companies lookup add a chart_of_accounts name lookup and populate the new fields. Replace the `return invoices.map(...)` block:

```typescript
  const catCodes = Array.from(
    new Set(invoices.map((i) => i.category_code as string | null).filter((c): c is string => !!c)),
  )
  const { data: coa } = catCodes.length
    ? await supabase.from('chart_of_accounts').select('code, name').in('code', catCodes)
    : { data: [] as { code: string; name: string }[] }
  const coaNameByCode = new Map((coa ?? []).map((c) => [c.code as string, c.name as string]))

  return invoices.map((inv) => ({
    invoiceNo: (inv.invoice_no as string) ?? '—',
    companyShortCode: shortCodeById.get(inv.company_id as string) ?? '—',
    pool: invoicePoolForBillingMode(inv.billing_mode as string | null),
    amount: Number(inv.total_amount ?? 0),
    categoryCode: (inv.category_code as string | null) ?? '',
    categoryName: coaNameByCode.get((inv.category_code as string | null) ?? '') ?? 'Uncategorised revenue',
  }))
```

- [ ] **Step 6: Run full vitest + tsc**

`npx vitest run` — existing tests that build `RawInvoiceRow` fixtures will now fail to typecheck (missing `categoryCode`/`categoryName`). Update those fixtures minimally (add `categoryCode: '5000', categoryName: 'Service Revenue - Subs'` or values appropriate to the test's intent) WITHOUT changing numeric expectations yet (revenue-grouping assertion changes happen in Task C6). Re-run until the only remaining failures are revenue-shape assertions that Task C6 will update — note them. `npx tsc --noEmit` no new errors.

- [ ] **Step 7: Commit**

```
git add src/lib/cfo-reports.ts src/lib/cfo-reports.test.ts
git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "feat(pnl): groupRevenueByAccount + invoice category name fetch"
```

## Task C2: `classifyRows` builds `revenueGroups`; `PoolPnl` gains the field

**File:** Modify `src/lib/cfo-reports.ts`.

Currently: invoices loop (lines ~410–416) does `bump(p.revenue, \`${inv.companyShortCode} · ${inv.invoiceNo}\`, amt)`. PV-source revenue (lines ~357–364) and treasury (lines ~462–463) also `bump(p.revenue, ...)`. Materialise (lines ~479–511) does `const revenueLines = linesFrom(p.revenue)` and puts it on `PoolPnl`.

Design: keep `p.revenue` Map for the **total and the non-invoice flat lines**. Track invoice revenue separately so it can be grouped with per-invoice items. Add `PoolPnl.revenueGroups: RevenueGroup[]`. Keep `revenueLines` too (the export/tests may still want a flat list; set it to a flattened view) — actually to avoid dual sources of truth: replace `revenueLines` with `revenueGroups` everywhere it's consumed (income-statement page + xlsx + pdf, Tasks C3–C5) and drop `revenueLines` from `PoolPnl`. `revenue` total stays = sum of group subtotals = identical number.

- [ ] **Step 1: Add invoice-revenue accumulator to the pool accumulator**

Find `emptyPoolAcc()` (the factory creating `revenue`/`cost`/... Maps, ~lines 230–250) and the `PoolAcc` type. Add a field `revenueInvoiceItems: Array<{ accountCode: string; accountName: string; label: string; amount: number }>` initialised to `[]` in `emptyPoolAcc()` and in the `PoolAcc` type.

- [ ] **Step 2: Change the invoices loop** (lines ~410–416) to record grouped items instead of bumping `p.revenue`:

```typescript
  for (const inv of invoices) {
    const amt = Number(inv.amount ?? 0)
    if (amt === 0) continue
    const p = acc(inv.pool)
    p.revenueInvoiceItems.push({
      accountCode: inv.categoryCode,
      accountName: inv.categoryName,
      label: `${inv.companyShortCode} · ${inv.invoiceNo}`,
      amount: amt,
    })
  }
```
(PV-source revenue at lines ~357–364 and treasury at ~462–463 STILL `bump(p.revenue, ...)` — unchanged. Those become the `flatLines` input to grouping.)

- [ ] **Step 3: Materialise revenueGroups** — in the per-pool loop (lines ~479–511) replace `const revenueLines = linesFrom(p.revenue)` and the `revenue` computation:

```typescript
    const revenueGroups = groupRevenueByAccount({
      invoiceItems: p.revenueInvoiceItems,
      flatLines: linesFrom(p.revenue),
    })
    const costLines = linesFrom(p.cost)
    const otherIncomeLines = linesFrom(p.otherIncome)
    const expenseLines = linesFrom(p.expense)
    const revenue = r2(revenueGroups.reduce((s, g) => s + g.subtotal, 0))
```
Change the non-empty guard and the pushed object: replace `revenueLines.length > 0` with `revenueGroups.length > 0`, and replace `revenueLines,` with `revenueGroups,` in the `pnlPools.push({...})`.

- [ ] **Step 4: Update `PoolPnl` interface** — replace `revenueLines: Line[]` with `revenueGroups: RevenueGroup[]` (keep `costLines`/`otherIncomeLines`/`expenseLines` as `Line[]`). Keep `revenue` number field.

- [ ] **Step 5: tsc** — `npx tsc --noEmit`. This will surface every consumer of `PoolPnl.revenueLines` (income-statement page + export xlsx/pdf) as type errors — that's expected; Tasks C3–C5 fix them. Do NOT fix them here beyond confirming the only errors are those known consumers + the known loan-disbursement ones. Commit:

```
git add src/lib/cfo-reports.ts
git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "feat(pnl): classifyRows emits revenueGroups (account-grouped revenue)"
```

## Task C3: Income Statement page — revenue expand/collapse client component

**Files:** Create `src/app/(portal)/reports/income-statement/_components/RevenueGroups.tsx`; Modify `src/app/(portal)/reports/income-statement/page.tsx`.

Current page: `PoolBlock` renders `<LineTable title="Revenue" lines={pool.revenueLines} subtotal={pool.revenue} tone="credit" />` plus Cost/OtherIncome/Expense LineTables. `LineTable` (lines ~190–236) is the existing flat renderer (unchanged, still used for cost/other-income/expense). `formatMoney` imported in page.

- [ ] **Step 1: Create the client component** `src/app/(portal)/reports/income-statement/_components/RevenueGroups.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { formatMoney } from '@/lib/utils'
import type { RevenueGroup } from '@/lib/cfo-reports'

export function RevenueGroups({ groups, subtotal }: { groups: RevenueGroup[]; subtotal: number }) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  const toggle = (k: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      next.has(k) ? next.delete(k) : next.add(k)
      return next
    })

  return (
    <div>
      <h3 className="font-serif italic text-accent text-sm mb-2">Revenue</h3>
      {groups.length === 0 ? (
        <p className="font-serif italic text-muted text-xs">No revenue.</p>
      ) : (
        <table className="ledger-table">
          <tbody>
            {groups.map((g) => {
              const key = g.accountName
              const expandable = g.items.length > 1 || g.items[0]?.label !== g.accountName
              const isOpen = open.has(key)
              return (
                <>
                  <tr
                    key={key}
                    className={expandable ? 'cursor-pointer' : ''}
                    onClick={expandable ? () => toggle(key) : undefined}
                  >
                    <td className="text-sm">
                      {expandable ? (
                        <span className="font-mono text-xs text-graphite mr-1">
                          {isOpen ? '▾' : '▸'}
                        </span>
                      ) : null}
                      {g.accountName}
                    </td>
                    <td className="num text-ledger">{formatMoney(g.subtotal)}</td>
                  </tr>
                  {isOpen
                    ? g.items.map((it) => (
                        <tr key={`${key}::${it.label}`} className="text-graphite">
                          <td className="text-sm pl-6">{it.label}</td>
                          <td className="num">{formatMoney(it.amount)}</td>
                        </tr>
                      ))
                    : null}
                </>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-hairline">
              <td className="font-serif italic text-graphite text-sm">Subtotal</td>
              <td className="num font-semibold text-ledger">{formatMoney(subtotal)}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  )
}
```
(Use a stable key on the fragment: change `<>` to `<React.Fragment key={key}>` with `import React from 'react'` — the engineer must add the React import and use `React.Fragment key={key}` instead of the bare `<>` to avoid the list-key warning. Apply that.)

- [ ] **Step 2: Wire into `page.tsx`** — add `import { RevenueGroups } from './_components/RevenueGroups'`. In `PoolBlock`, replace the Revenue `<LineTable title="Revenue" lines={pool.revenueLines} subtotal={pool.revenue} tone="credit" />` with:
```tsx
<RevenueGroups groups={pool.revenueGroups} subtotal={pool.revenue} />
```
Leave the Cost / Other Income / Expense `LineTable`s and the gross-profit/margin math untouched. `SummaryBlock` does not list revenue lines (only group totals) — verify by reading; if it references `revenueLines`, switch it to `revenueGroups`/`revenue` accordingly (it should only use numeric totals).

- [ ] **Step 3: Typecheck + build** — `npx tsc --noEmit` (income-statement page errors from C2 now resolved) + `npx next build`. Commit:

```
git add "src/app/(portal)/reports/income-statement/_components/RevenueGroups.tsx" "src/app/(portal)/reports/income-statement/page.tsx"
git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "feat(pnl): income statement revenue grouped by account with expand/collapse"
```

## Task C4: Income Statement Excel export — revenue groups expanded

**File:** Modify `src/app/(portal)/reports/income-statement/export/_format/xlsx.ts`.

Current `appendPool(p: PoolPnl)` iterates `p.revenueLines` then totals. Replace the revenue portion to emit, per group: an account sub-heading row, each item indented, then a group subtotal — always expanded. The 5-col layout `[label, revenue, cost, otherIncome, expense]` and the rest of `appendPool` (cost/other-income/expense/margin) and the GROUP TOTALS block are unchanged.

- [ ] **Step 1:** In `appendPool`, replace the revenue lines block:
```typescript
    for (const g of p.revenueGroups) {
      rows.push([g.accountName, g.subtotal, null, null, null])
      for (const it of g.items) {
        rows.push([`  ${it.label}`, it.amount, null, null, null])
      }
    }
    if (p.revenue !== 0) rows.push(['Total revenue', p.revenue, null, null, null])
```
(Replaces the prior `for (const l of p.revenueLines) rows.push([l.label, l.amount, null,null,null]); if (p.revenue!==0) rows.push(['Total revenue', p.revenue,...])`. Keep everything else in `appendPool` and `buildIncomeStatementXlsx` byte-identical, including the seg-filtering `opts.pool` branch from the prior feature.)

- [ ] **Step 2: tsc + build**, commit:
```
git add "src/app/(portal)/reports/income-statement/export/_format/xlsx.ts"
git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "feat(pnl): income statement Excel revenue grouped by account"
```

## Task C5: Income Statement PDF export — revenue groups expanded

**File:** Modify `src/app/(portal)/reports/income-statement/export/_format/pdf.tsx`.

Current `poolRows(p)` builds revenue rows from `p.revenueLines`. Replace that portion with grouped expanded rows; everything else (cost/other-income/expense/margin, COLUMNS, the `pool ? ... : groupTotals` seg branch from the prior feature) unchanged.

- [ ] **Step 1:** In `poolRows`, replace the revenue section:
```typescript
    for (const g of p.revenueGroups) {
      out.push([g.accountName, g.subtotal, null, null, null])
      for (const it of g.items) {
        out.push([`  ${it.label}`, it.amount, null, null, null])
      }
    }
    if (p.revenue !== 0) out.push(['Total revenue', p.revenue, null, null, null])
```
(Replaces the prior `for (const l of p.revenueLines) out.push([l.label, l.amount,null,null,null]); if (p.revenue!==0) out.push(['Total revenue', p.revenue,...])`.)

- [ ] **Step 2: tsc + build**, commit:
```
git add "src/app/(portal)/reports/income-statement/export/_format/pdf.tsx"
git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "feat(pnl): income statement PDF revenue grouped by account"
```

## Task C6: Update `cfo-reports.test.ts` revenue assertions

**File:** Modify `src/lib/cfo-reports.test.ts`.

- [ ] **Step 1:** Run `npx vitest run src/lib/cfo-reports.test.ts`. For every failing assertion that checked the old flat `revenueLines` (e.g. `expect(pool.revenueLines)...`), rewrite it against the new shape: `pool.revenueGroups` is `RevenueGroup[]`; the equivalent total is still `pool.revenue` (unchanged number). Where a test asserted a specific revenue line by invoice label, assert instead on the group: e.g. `expect(pool.revenueGroups.find(g => g.accountName === '...')!.subtotal).toBe(X)` and/or its `items`. Preserve the original numeric intent (the `revenue` totals and all cost/expense/margin assertions must NOT change — only the revenue *line-shape* assertions change). Do not weaken tests (no `.length` only checks where a value was asserted before).

- [ ] **Step 2:** `npx vitest run` → all green (except the known unrelated `loan-disbursement.test.ts` tsc-only issues which don't affect vitest runtime). `npx tsc --noEmit` → no new errors. Commit:
```
git add src/lib/cfo-reports.test.ts
git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "test(pnl): update revenue assertions to grouped structure"
```

---

# Final Task: Whole-feature verification

- [ ] **Step 1:** `npx vitest run` → all pass (incl. new `buildLedger GL fields`, `groupRevenueByAccount`). `npx tsc --noEmit` → only the known `loan-disbursement.test.ts` pre-existing errors. `npx next build` → success; `/reports/ledger`, `/reports/income-statement`, `/billing` routes build.
- [ ] **Step 2:** Update `C:\Users\User\.claude\projects\C--Users-User-OneDrive-Desktop-Venture\memory\project_state.md`: append a "Ledger GL + billing card layout + P&L revenue grouping (shipped <date>, commits …)" note; record HEAD.
- [ ] **Step 3:** Browser verification is auth-gated (cannot be done headless) — hand off to the user with the exact URLs and the points to eyeball (GL ledger format, billing Pool split roominess, P&L revenue expand/collapse + exports). Deploy to Vercel prod only on explicit user request (per standing directive).

---

## Self-Review

**Spec coverage:**
- Sub-project 1 (8-col GL, B/F line, account header/footer, Journal Type derived, Ref. 1 styling, web+Excel+PDF, neg parentheses kept) → Tasks A1–A5. Journal Type mapping invoice→SALES / PV credit→RECEIPT / PV debit→PAYMENT / else→JOURNAL → A2 `resolveLedgerSourceMeta`. B/F date `—` → A1 (`entryDate:''`) + A3/A4/A5 render `'—'`. ✅
- Sub-project 2 (Pool split → roomy card layout, AccountPicker untouched, no overflow-hidden clipping, behaviour/state unchanged) → Task B1. ✅
- Sub-project 3 (revenue grouped by account; web expand/collapse; Excel/PDF always expanded; non-invoice revenue → single-item group; expense unchanged; totals identical; `fetchIncomeStatement` signature unchanged) → Tasks C1–C6. ✅
- Testing (buildLedger extended, new groupRevenueByAccount, cfo-reports.test.ts updated, interactive verified in browser) → A1, C1, C6, Final. ✅
- Out of scope respected (no DB/migration; AccountPicker internals; cash flow & other reports untouched). ✅

**Placeholder scan:** No "TBD"/"similar to"/"add error handling". Two steps say "read the current file first and preserve copy/behaviour" (A4 multi-account route shape; B1 add-button copy) — these are explicit reconciliation instructions with the concrete code given, not placeholders; the engineer has the full replacement code and a precise rule for the one variable bit. A2 flags a column-name verification (`voucher_no`/`direction`) with an explicit fallback instruction — concrete, not a placeholder.

**Type consistency:** `RawLedgerLine`/`LedgerLine` gain `accountDesc/journalType/ref` (A1) consumed in A2 (fetchLedgers map), A3/A4/A5 (render). `resolveLedgerSourceMeta` returns `{journalType,ref}` (A2) consumed in same task. `RevenueGroup` defined C1, consumed C2 (`PoolPnl.revenueGroups`), C3 (`RevenueGroups` component prop), C4/C5 (exports), C6 (tests). `groupRevenueByAccount` input shape (`invoiceItems`/`flatLines`) consistent C1↔C2. `PoolPnl.revenueLines` removed in C2 → every consumer updated in C3/C4/C5; C2 Step 5 explicitly uses the resulting tsc errors as the consumer checklist. `PoolAcc.revenueInvoiceItems` added C2 Step 1, used C2 Step 2/3. Names consistent throughout.
