# Trial Balance + General Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship two new financial reports: a Trial Balance snapshot at a date (showing every leaf GL account's Dr/Cr balance with Σ Dr = Σ Cr proof) and a per-account General Ledger view with running balance over a chosen period.

**Architecture:** Two new routes (`/reports/trial-balance`, `/reports/ledger`) under the existing Server Components reports pattern. Backend extends `src/lib/cfo-reports.ts` with pure builders (testable) wrapped by async data-fetch functions (Supabase). The pure builders are the testable surface; the wrappers just glue Supabase data into them. Two new cards on the reports index page. No DB / migration changes — both reports read from existing `chart_of_accounts` + `journal_entries` + `journal_lines`.

**Tech Stack:** Next.js 15 App Router, TypeScript, Tailwind v3.0 utility classes (`.ledger-table`, `.num`, `.page-head`), Supabase JS client (server side), Vitest + happy-dom for tests.

**Spec:** [docs/superpowers/specs/2026-05-15-trial-balance-and-ledger.md](../specs/2026-05-15-trial-balance-and-ledger.md)

## File Structure

**New files:**
- `src/app/(portal)/reports/trial-balance/page.tsx` — TB page (Server Component)
- `src/app/(portal)/reports/ledger/page.tsx` — Ledger page (Server Component)

**Modified files:**
- `src/lib/cfo-reports.ts` — append TB + Ledger types, two pure builders (`buildTrialBalance`, `buildLedger`), two async wrappers (`fetchTrialBalance`, `fetchLedger`)
- `src/lib/cfo-reports.test.ts` — append 4 unit tests for the pure builders
- `src/app/(portal)/reports/page.tsx` — add two cards to the `reports` array

Each task ends in a committable, working state.

## Signed-balance convention

`openingBalance`, `runningBalance`, and the `netByCode` map all use **Dr − Cr signed amounts**: a positive value means the account currently has a debit balance; a negative value means a credit balance. The TB page splits the sign into Dr / Cr columns at render time. The Ledger page renders the absolute value with a "Dr" / "Cr" suffix.

This convention is type-agnostic — the builders never need to know an account's "normal side" to decide which column a balance lands in. A liability account with an abnormal debit balance just shows up in the Dr column with a positive amount.

---

### Task 1: Trial Balance — types + pure `buildTrialBalance` + 2 unit tests

**Files:**
- Modify: `src/lib/cfo-reports.ts` (append at the end of the file, before any trailing helpers)
- Modify: `src/lib/cfo-reports.test.ts` (append at the end of the file)

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/cfo-reports.test.ts`:

```ts
import { buildTrialBalance, buildLedger } from './cfo-reports'
import type { CoaLeafAccount, RawLedgerLine } from './cfo-reports'

describe('buildTrialBalance', () => {
  it('splits a signed net into Dr/Cr columns, totals reconcile', () => {
    const accounts: CoaLeafAccount[] = [
      { code: '3000', name: 'Cash & Bank — Hong Leong', type: 'asset' },
      { code: '4000', name: 'Fund Sources Payable',     type: 'liability' },
    ]
    const netByCode = new Map<string, number>([
      ['3000', 1000],   // Dr 1000 (asset normal balance)
      ['4000', -1000],  // Cr 1000 (liability normal balance, signed -)
    ])
    const tb = buildTrialBalance({
      accounts,
      netByCode,
      asOf: '2026-05-15',
      showZeroBalance: false,
    })
    expect(tb.rows).toHaveLength(2)
    expect(tb.rows[0]).toMatchObject({ code: '3000', debit: 1000, credit: 0 })
    expect(tb.rows[1]).toMatchObject({ code: '4000', debit: 0, credit: 1000 })
    expect(tb.totals).toEqual({ debit: 1000, credit: 1000 })
    expect(tb.reconciles).toBe(true)
  })

  it('drops zero-balance rows when showZeroBalance=false, keeps them when true', () => {
    const accounts: CoaLeafAccount[] = [
      { code: '3000', name: 'Cash & Bank — Hong Leong', type: 'asset' },
      { code: '4000', name: 'Fund Sources Payable',     type: 'liability' },
      { code: '9000', name: 'General & Admin Expenses', type: 'expense' },
    ]
    const netByCode = new Map<string, number>([
      ['3000', 1000],
      ['4000', -1000],
      ['9000', 0],
    ])
    const hidden = buildTrialBalance({
      accounts, netByCode, asOf: '2026-05-15', showZeroBalance: false,
    })
    expect(hidden.rows.map((r) => r.code)).toEqual(['3000', '4000'])
    const shown = buildTrialBalance({
      accounts, netByCode, asOf: '2026-05-15', showZeroBalance: true,
    })
    expect(shown.rows.map((r) => r.code)).toEqual(['3000', '9000', '4000']) // sorted by type, then code
    expect(shown.rows.find((r) => r.code === '9000')).toMatchObject({ debit: 0, credit: 0 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/cfo-reports.test.ts 2>&1 | tail -20
```

Expected: FAIL on both new tests with errors mentioning that `buildTrialBalance` / `CoaLeafAccount` are not exported from `./cfo-reports`. The 16 pre-existing tests should still pass.

- [ ] **Step 3: Implement `buildTrialBalance` + the supporting types**

Append to `src/lib/cfo-reports.ts` (after the existing exports, before the date helpers at the bottom):

```ts
// ────────────────────────────────────────────────────────────────────────────
// Trial Balance — every leaf GL account's net balance at a date, split into
// Dr / Cr columns. Σ Dr must equal Σ Cr. Sourced from journal_lines via the
// existing sumGlNetAcrossCodes helper.
// ────────────────────────────────────────────────────────────────────────────

export interface CoaLeafAccount {
  code: string
  name: string
  type: AccountType
}

export interface TrialBalanceRow {
  code: string
  name: string
  type: AccountType
  debit: number  // positive when account has a Dr balance; 0 otherwise
  credit: number // positive when account has a Cr balance; 0 otherwise
}

export interface TrialBalance {
  asOf: string
  rows: TrialBalanceRow[]
  totals: { debit: number; credit: number }
  reconciles: boolean // |totals.debit - totals.credit| < 0.01
  showZeroBalance: boolean
}

// Display order matches the spec — Asset · Fixed Asset · Liability · Equity ·
// Revenue · Cost · Other Income · Expense.
const TB_TYPE_ORDER: AccountType[] = [
  'asset', 'fixed_asset', 'liability', 'equity',
  'revenue', 'cost', 'other_income', 'expense',
]

export function buildTrialBalance(args: {
  accounts: CoaLeafAccount[]
  netByCode: Map<string, number> // signed: Dr − Cr (positive = debit balance)
  asOf: string
  showZeroBalance: boolean
}): TrialBalance {
  const { accounts, netByCode, asOf, showZeroBalance } = args
  const rows: TrialBalanceRow[] = []
  let totalDebit = 0
  let totalCredit = 0
  for (const acc of accounts) {
    const net = netByCode.get(acc.code) ?? 0
    const debit = net > 0 ? net : 0
    const credit = net < 0 ? -net : 0
    if (!showZeroBalance && debit === 0 && credit === 0) continue
    rows.push({ code: acc.code, name: acc.name, type: acc.type, debit: r2(debit), credit: r2(credit) })
    totalDebit += debit
    totalCredit += credit
  }
  rows.sort((a, b) => {
    const ai = TB_TYPE_ORDER.indexOf(a.type)
    const bi = TB_TYPE_ORDER.indexOf(b.type)
    if (ai !== bi) return ai - bi
    return a.code.localeCompare(b.code)
  })
  const totals = { debit: r2(totalDebit), credit: r2(totalCredit) }
  const reconciles = Math.abs(totals.debit - totals.credit) < 0.01
  return { asOf, rows, totals, reconciles, showZeroBalance }
}
```

Note: `r2` and `AccountType` are already in scope in this file. The file already has an `r2` rounding helper near the top; reuse it.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/cfo-reports.test.ts 2>&1 | tail -10
```

Expected: 18 tests passing (16 pre-existing + 2 new). The "drops zero-balance rows" test asserts row order `['3000', '9000', '4000']` — that's `asset` first (3000), then `expense` (9000), then `liability` (4000) per `TB_TYPE_ORDER`. Confirm that order in the test output.

- [ ] **Step 5: Run the full test suite + TS check**

```bash
npm run test:ci 2>&1 | tail -5
npx tsc --noEmit 2>&1 | grep cfo-reports | head -5
```

Expected: 198 tests passing (was 196 + 2 new). No new TS errors in `cfo-reports.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/cfo-reports.ts src/lib/cfo-reports.test.ts
git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "feat(reports): pure buildTrialBalance helper + types"
```

---

### Task 2: Trial Balance — async `fetchTrialBalance` wrapper

**Files:**
- Modify: `src/lib/cfo-reports.ts` (append after `buildTrialBalance`)

This wrapper fetches the leaf accounts + per-account net amounts from Supabase, then calls `buildTrialBalance`. No unit test — the wrapper is thin glue.

- [ ] **Step 1: Implement `fetchTrialBalance`**

Append to `src/lib/cfo-reports.ts` directly after `buildTrialBalance`:

```ts
export async function fetchTrialBalance(
  supabase: SupabaseClient,
  args: { asOf: string; showZeroBalance: boolean },
): Promise<TrialBalance> {
  const { asOf, showZeroBalance } = args

  // ── 1: Resolve the set of leaf accounts (no children, not headers). ──
  const { data: coaRows, error: coaErr } = await supabase
    .from('chart_of_accounts')
    .select('code, name, type, parent_code')
    .eq('is_active', true)
  if (coaErr) throw new Error(`fetchTrialBalance COA: ${coaErr.message}`)
  const allCoa = coaRows ?? []
  const headerCodes = new Set(
    allCoa.map((r) => r.parent_code).filter((p): p is string => !!p),
  )
  const leafAccounts: CoaLeafAccount[] = allCoa
    .filter((r) => !headerCodes.has(r.code as string))
    .map((r) => ({
      code: r.code as string,
      name: r.name as string,
      type: r.type as AccountType,
    }))

  // ── 2: Period-bounded JE id set (non-reversed, transaction_date <= asOf). ──
  const { data: jes, error: jeErr } = await supabase
    .from('journal_entries')
    .select('id')
    .lte('transaction_date', asOf)
    .eq('is_reversed', false)
  if (jeErr) throw new Error(`fetchTrialBalance JEs: ${jeErr.message}`)
  const jeIds = (jes ?? []).map((j) => j.id as string)

  // ── 3: Per-leaf-account net (Dr − Cr). Single batched journal_lines query
  //    is far cheaper than one call per account. ──
  const netByCode = new Map<string, number>()
  if (jeIds.length > 0) {
    const leafCodes = leafAccounts.map((a) => a.code)
    const { data: lines, error: jlErr } = await supabase
      .from('journal_lines')
      .select('account_code, debit, credit')
      .in('entry_id', jeIds)
      .in('account_code', leafCodes)
    if (jlErr) throw new Error(`fetchTrialBalance lines: ${jlErr.message}`)
    for (const l of lines ?? []) {
      const code = l.account_code as string
      const dr = Number(l.debit ?? 0)
      const cr = Number(l.credit ?? 0)
      netByCode.set(code, (netByCode.get(code) ?? 0) + dr - cr)
    }
  }

  return buildTrialBalance({ accounts: leafAccounts, netByCode, asOf, showZeroBalance })
}
```

- [ ] **Step 2: Confirm TS + tests still pass**

```bash
npx tsc --noEmit 2>&1 | grep cfo-reports | head -5
npm run test:ci 2>&1 | tail -5
```

Expected: no new TS errors. Tests stay at 198 passing (this task doesn't add a test — the wrapper is too Supabase-heavy to mock cleanly, and the pure logic is already covered by the Task 1 tests).

- [ ] **Step 3: Commit**

```bash
git add src/lib/cfo-reports.ts
git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "feat(reports): fetchTrialBalance — leaf accounts + journal_lines aggregation"
```

---

### Task 3: Trial Balance — `/reports/trial-balance/page.tsx` + reports index card

**Files:**
- Create: `src/app/(portal)/reports/trial-balance/page.tsx`
- Modify: `src/app/(portal)/reports/page.tsx` (append a card to the `reports` array)

- [ ] **Step 1: Create the page**

Create `src/app/(portal)/reports/trial-balance/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatMoney } from '@/lib/utils'
import { fetchTrialBalance, type TrialBalanceRow } from '@/lib/cfo-reports'
import { typeLabel, type AccountType } from '@/lib/coa'
import dayjs from 'dayjs'
import Link from 'next/link'

interface Props {
  searchParams: Promise<{ as_of?: string; show_zero?: string }>
}

export default async function TrialBalancePage({ searchParams }: Props) {
  await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  const { as_of: rawAsOf, show_zero: rawShowZero } = await searchParams
  const asOf = rawAsOf ?? dayjs().format('YYYY-MM-DD')
  const showZeroBalance = rawShowZero === '1'

  const tb = await fetchTrialBalance(supabase, { asOf, showZeroBalance })
  const dateLabel = dayjs(asOf).format('D MMMM YYYY')

  // Group rows by type for the per-section subtotals.
  const byType = new Map<AccountType, TrialBalanceRow[]>()
  for (const row of tb.rows) {
    const list = byType.get(row.type) ?? []
    list.push(row)
    byType.set(row.type, list)
  }

  return (
    <div>
      <Link href="/reports" className="text-sm text-muted hover:text-accent font-sans transition-colors">
        ← Back to Reports
      </Link>

      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> REPORTS · TRIAL BALANCE · {dateLabel.toUpperCase()}
          </div>
          <h1 className="page-title">Trial Balance</h1>
        </div>
        <form className="shrink-0 flex items-center gap-3">
          <input
            type="date"
            name="as_of"
            defaultValue={asOf}
            className="px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border"
          />
          <label className="flex items-center gap-2 text-sm font-serif italic text-graphite">
            <input
              type="checkbox"
              name="show_zero"
              value="1"
              defaultChecked={showZeroBalance}
            />
            Show zero-balance
          </label>
        </form>
      </div>

      <p className="font-serif italic text-muted text-sm mb-8 max-w-3xl">
        Snapshot of every postable GL account as at <strong>{dateLabel}</strong>.
        Header accounts (1000, 9050) are excluded — they roll up via their
        children. Σ Dr must equal Σ Cr.
      </p>

      {!tb.reconciles ? (
        <div className="mb-6 px-4 py-3 border border-danger rounded-md bg-surface text-danger text-sm font-serif italic">
          ⚠ Trial Balance does not reconcile — Σ Dr ({formatMoney(tb.totals.debit)}) ≠ Σ Cr ({formatMoney(tb.totals.credit)}). Investigate journal_lines integrity before relying on this report.
        </div>
      ) : null}

      <table className="ledger-table max-w-3xl">
        <thead>
          <tr>
            <th>Account</th>
            <th className="num">Debit</th>
            <th className="num">Credit</th>
          </tr>
        </thead>
        {Array.from(byType.entries()).map(([type, rows]) => {
          const sectionDebit = rows.reduce((s, r) => s + r.debit, 0)
          const sectionCredit = rows.reduce((s, r) => s + r.credit, 0)
          return (
            <tbody key={type} className="border-t border-hairline">
              <tr>
                <td colSpan={3} className="font-mono text-xs uppercase tracking-wide text-muted pt-4">
                  {typeLabel(type).toUpperCase()}
                </td>
              </tr>
              {rows.map((r) => (
                <tr key={r.code}>
                  <td>
                    <Link
                      href={`/reports/ledger?code=${encodeURIComponent(r.code)}`}
                      className="text-ink hover:text-accent"
                    >
                      {r.code} {r.name}
                    </Link>
                  </td>
                  <td className="num">{r.debit > 0 ? formatMoney(r.debit) : '—'}</td>
                  <td className="num">{r.credit > 0 ? formatMoney(r.credit) : '—'}</td>
                </tr>
              ))}
              <tr>
                <td className="font-serif italic text-ink">Total {typeLabel(type)}</td>
                <td className="num font-medium">{sectionDebit > 0 ? formatMoney(sectionDebit) : '—'}</td>
                <td className="num font-medium">{sectionCredit > 0 ? formatMoney(sectionCredit) : '—'}</td>
              </tr>
            </tbody>
          )
        })}
        <tfoot className="border-t-2 border-hairline">
          <tr>
            <td className="font-serif italic text-ink font-semibold">TOTAL</td>
            <td className="num font-semibold text-num-ink">{formatMoney(tb.totals.debit)}</td>
            <td className="num font-semibold text-num-ink">{formatMoney(tb.totals.credit)}</td>
          </tr>
        </tfoot>
      </table>

      {tb.rows.length === 0 ? (
        <p className="font-serif italic text-muted text-sm mt-8">
          No accounts have any activity through {dateLabel}.{' '}
          {!showZeroBalance ? (
            <Link href={`/reports/trial-balance?as_of=${asOf}&show_zero=1`} className="text-accent hover:text-accent-hover">
              Show zero-balance accounts
            </Link>
          ) : null}
        </p>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 2: Add the reports index card**

Read `src/app/(portal)/reports/page.tsx` and insert this object into the `reports` array AFTER the Balance Sheet entry and BEFORE the Fund Summary entry:

```ts
  {
    href: '/reports/trial-balance',
    title: 'Trial Balance',
    description: 'Snapshot of every GL account at a date. Σ Dr = Σ Cr.',
  },
```

- [ ] **Step 3: Browser smoke check**

The dev server is at http://localhost:3000. Open `/reports/trial-balance` in the browser (as a logged-in Finance or Principal user). Expected behavior:

1. Page renders with today's date in the date picker and "Show zero-balance" unchecked.
2. The table groups accounts by type (Asset / Fixed Asset / etc), with section subtotals and a grand total at the bottom.
3. Σ Dr should equal Σ Cr exactly. If it doesn't, there should be a red `text-danger` warning banner.
4. Clicking any account name navigates to `/reports/ledger?code=<code>` (the ledger page doesn't exist yet — expect a 404 until Task 6).
5. Toggling "Show zero-balance" and submitting the form re-renders with every leaf account visible.

- [ ] **Step 4: TS + tests still pass**

```bash
npx tsc --noEmit 2>&1 | grep -E "trial-balance|cfo-reports" | head -5
npm run test:ci 2>&1 | tail -5
```

Expected: no new TS errors. 198 tests still pass.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(portal)/reports/trial-balance/page.tsx" "src/app/(portal)/reports/page.tsx"
git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "feat(reports): /reports/trial-balance page + index card"
```

---

### Task 4: General Ledger — types + pure `buildLedger` + 2 unit tests

**Files:**
- Modify: `src/lib/cfo-reports.ts` (append after `fetchTrialBalance`)
- Modify: `src/lib/cfo-reports.test.ts` (append after the `buildTrialBalance` describe block)

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/cfo-reports.test.ts`:

```ts
describe('buildLedger', () => {
  it('closing balance = opening + period Dr − period Cr', () => {
    const account: CoaLeafAccount = {
      code: '3000', name: 'Cash & Bank — Hong Leong', type: 'asset',
    }
    const rawLines: RawLedgerLine[] = [
      { entryDate: '2026-05-03', entryNo: 'JE-001', description: 'inv 1', debit: 500, credit: 0 },
      { entryDate: '2026-05-10', entryNo: 'JE-002', description: 'pmt', debit: 0, credit: 200 },
    ]
    const led = buildLedger({
      account, openingBalance: 1000, rawLines,
      from: '2026-05-01', to: '2026-05-31',
    })
    expect(led.openingBalance).toBe(1000)
    expect(led.periodTotals).toEqual({ debit: 500, credit: 200 })
    expect(led.closingBalance).toBe(1300)
    expect(led.lines).toHaveLength(2)
  })

  it('running balance accumulates Dr − Cr line by line', () => {
    const account: CoaLeafAccount = {
      code: '3000', name: 'Cash & Bank — Hong Leong', type: 'asset',
    }
    const rawLines: RawLedgerLine[] = [
      { entryDate: '2026-05-03', entryNo: 'JE-001', description: 'in',  debit: 100, credit: 0 },
      { entryDate: '2026-05-05', entryNo: 'JE-002', description: 'out', debit: 0,   credit: 30 },
      { entryDate: '2026-05-08', entryNo: 'JE-003', description: 'in',  debit: 50,  credit: 0 },
    ]
    const led = buildLedger({
      account, openingBalance: 0, rawLines,
      from: '2026-05-01', to: '2026-05-31',
    })
    expect(led.lines[0].runningBalance).toBe(100)
    expect(led.lines[1].runningBalance).toBe(70)
    expect(led.lines[2].runningBalance).toBe(120)
    expect(led.closingBalance).toBe(120)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/cfo-reports.test.ts 2>&1 | tail -15
```

Expected: 2 new tests fail with errors about `buildLedger` / `RawLedgerLine` not being exported. The 18 pre-existing tests pass.

- [ ] **Step 3: Implement `buildLedger` + the supporting types**

Append to `src/lib/cfo-reports.ts` directly after `fetchTrialBalance`:

```ts
// ────────────────────────────────────────────────────────────────────────────
// General Ledger — chronological journal_lines for a single account over a
// period, with running balance.
// ────────────────────────────────────────────────────────────────────────────

export interface RawLedgerLine {
  entryDate: string  // YYYY-MM-DD
  entryNo: string
  description: string
  debit: number      // positive amount; 0 when this side wasn't touched
  credit: number     // positive amount; 0 when this side wasn't touched
}

export interface LedgerLine {
  entryDate: string
  entryNo: string
  description: string
  debit: number
  credit: number
  runningBalance: number  // signed Dr − Cr (positive = debit balance after this line)
}

export interface Ledger {
  code: string
  accountName: string
  accountType: AccountType
  from: string
  to: string
  openingBalance: number   // signed Dr − Cr at start of period
  closingBalance: number   // signed Dr − Cr at end of period
  periodTotals: { debit: number; credit: number }
  lines: LedgerLine[]
}

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
  const lines: LedgerLine[] = []
  for (const raw of rawLines) {
    running += raw.debit - raw.credit
    totalDebit += raw.debit
    totalCredit += raw.credit
    lines.push({
      entryDate: raw.entryDate,
      entryNo: raw.entryNo,
      description: raw.description,
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

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/cfo-reports.test.ts 2>&1 | tail -10
```

Expected: 20 tests passing (18 pre-existing + 2 new).

- [ ] **Step 5: Run the full test suite + TS check**

```bash
npm run test:ci 2>&1 | tail -5
npx tsc --noEmit 2>&1 | grep cfo-reports | head -5
```

Expected: 200 tests passing. No new TS errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/cfo-reports.ts src/lib/cfo-reports.test.ts
git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "feat(reports): pure buildLedger helper + types"
```

---

### Task 5: General Ledger — async `fetchLedger` wrapper

**Files:**
- Modify: `src/lib/cfo-reports.ts` (append after `buildLedger`)

- [ ] **Step 1: Implement `fetchLedger`**

Append to `src/lib/cfo-reports.ts` directly after `buildLedger`:

```ts
export async function fetchLedger(
  supabase: SupabaseClient,
  args: { code: string; from: string; to: string },
): Promise<Ledger> {
  const { code, from, to } = args

  // ── 1: Resolve account name + type. If unknown or it's a header, bail. ──
  const { data: acc, error: accErr } = await supabase
    .from('chart_of_accounts')
    .select('code, name, type, parent_code')
    .eq('code', code)
    .maybeSingle()
  if (accErr) throw new Error(`fetchLedger account lookup: ${accErr.message}`)
  if (!acc) throw new Error(`fetchLedger: account ${code} not found`)
  const { data: childCheck, error: childErr } = await supabase
    .from('chart_of_accounts')
    .select('code')
    .eq('parent_code', code)
    .limit(1)
  if (childErr) throw new Error(`fetchLedger header check: ${childErr.message}`)
  if ((childCheck ?? []).length > 0) {
    throw new Error(`fetchLedger: account ${code} is a header — pick a leaf account instead`)
  }
  const account: CoaLeafAccount = {
    code: acc.code as string,
    name: acc.name as string,
    type: acc.type as AccountType,
  }

  // ── 2: Opening balance = Σ (Dr − Cr) for all non-reversed JEs strictly
  //    before `from`. ──
  const { data: openingJes, error: openJeErr } = await supabase
    .from('journal_entries')
    .select('id')
    .lt('transaction_date', from)
    .eq('is_reversed', false)
  if (openJeErr) throw new Error(`fetchLedger opening JEs: ${openJeErr.message}`)
  const openingJeIds = (openingJes ?? []).map((j) => j.id as string)
  let openingBalance = 0
  if (openingJeIds.length > 0) {
    const { data: openLines, error: openJlErr } = await supabase
      .from('journal_lines')
      .select('debit, credit')
      .eq('account_code', code)
      .in('entry_id', openingJeIds)
    if (openJlErr) throw new Error(`fetchLedger opening lines: ${openJlErr.message}`)
    for (const l of openLines ?? []) {
      openingBalance += Number(l.debit ?? 0) - Number(l.credit ?? 0)
    }
  }

  // ── 3: Period lines, joined to journal_entries for entry_no + date +
  //    description. Order by date, entry_no, line id. ──
  const { data: periodJes, error: periodJeErr } = await supabase
    .from('journal_entries')
    .select('id, entry_no, transaction_date, description')
    .gte('transaction_date', from)
    .lte('transaction_date', to)
    .eq('is_reversed', false)
    .order('transaction_date', { ascending: true })
    .order('entry_no', { ascending: true })
  if (periodJeErr) throw new Error(`fetchLedger period JEs: ${periodJeErr.message}`)
  const periodJes2 = periodJes ?? []
  const jeById = new Map<string, { entryNo: string; transactionDate: string; description: string }>()
  for (const j of periodJes2) {
    jeById.set(j.id as string, {
      entryNo: j.entry_no as string,
      transactionDate: j.transaction_date as string,
      description: (j.description as string) ?? '',
    })
  }
  const periodJeIds = periodJes2.map((j) => j.id as string)

  const rawLines: RawLedgerLine[] = []
  if (periodJeIds.length > 0) {
    const { data: lines, error: jlErr } = await supabase
      .from('journal_lines')
      .select('id, entry_id, debit, credit')
      .eq('account_code', code)
      .in('entry_id', periodJeIds)
    if (jlErr) throw new Error(`fetchLedger period lines: ${jlErr.message}`)
    const linesWithMeta = (lines ?? []).flatMap((l) => {
      const je = jeById.get(l.entry_id as string)
      if (!je) return []
      return [{
        id: l.id as string,
        entryNo: je.entryNo,
        entryDate: je.transactionDate,
        description: je.description,
        debit: Number(l.debit ?? 0),
        credit: Number(l.credit ?? 0),
      }]
    })
    linesWithMeta.sort((a, b) => {
      if (a.entryDate !== b.entryDate) return a.entryDate.localeCompare(b.entryDate)
      if (a.entryNo !== b.entryNo) return a.entryNo.localeCompare(b.entryNo)
      return a.id.localeCompare(b.id)
    })
    for (const l of linesWithMeta) {
      rawLines.push({
        entryDate: l.entryDate,
        entryNo: l.entryNo,
        description: l.description,
        debit: l.debit,
        credit: l.credit,
      })
    }
  }

  return buildLedger({ account, openingBalance, rawLines, from, to })
}
```

Why the JE id intermediate map: `journal_lines` doesn't carry `entry_no` / `transaction_date` / `description` directly — those live on `journal_entries`. PostgREST can do joins, but Supabase's `.select(...)` syntax for joined fields is brittle in this codebase, so the explicit two-query + in-memory join matches the pattern used elsewhere in `cfo-reports.ts`.

- [ ] **Step 2: Confirm TS + tests still pass**

```bash
npx tsc --noEmit 2>&1 | grep cfo-reports | head -5
npm run test:ci 2>&1 | tail -5
```

Expected: no new TS errors. Tests stay at 200.

- [ ] **Step 3: Commit**

```bash
git add src/lib/cfo-reports.ts
git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "feat(reports): fetchLedger — opening balance + period lines aggregation"
```

---

### Task 6: General Ledger — `/reports/ledger/page.tsx` + reports index card

**Files:**
- Create: `src/app/(portal)/reports/ledger/page.tsx`
- Modify: `src/app/(portal)/reports/page.tsx` (append a second card)

- [ ] **Step 1: Create the page**

Create `src/app/(portal)/reports/ledger/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatMoney } from '@/lib/utils'
import { fetchLedger } from '@/lib/cfo-reports'
import { type AccountType } from '@/lib/coa'
import LedgerPicker from './_components/LedgerPicker'
import dayjs from 'dayjs'
import Link from 'next/link'

interface Props {
  searchParams: Promise<{ code?: string; from?: string; to?: string }>
}

function formatSignedBalance(signed: number): string {
  const abs = Math.abs(signed)
  if (abs < 0.005) return '—'
  return `${formatMoney(abs)} ${signed >= 0 ? 'Dr' : 'Cr'}`
}

export default async function LedgerPage({ searchParams }: Props) {
  await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  const { code, from: rawFrom, to: rawTo } = await searchParams
  const from = rawFrom ?? dayjs().startOf('month').format('YYYY-MM-DD')
  const to = rawTo ?? dayjs().format('YYYY-MM-DD')

  // Fetch all leaf accounts for the picker (header rows excluded by the
  // existing AccountPicker behavior).
  const { data: coaRows } = await supabase
    .from('chart_of_accounts')
    .select('code, name, type, parent_code, is_active')
    .eq('is_active', true)
    .order('code')
  const accounts = (coaRows ?? []).map((r) => ({
    code: r.code as string,
    name: r.name as string,
    type: r.type as AccountType,
    parent_code: (r.parent_code as string | null) ?? null,
    is_active: r.is_active as boolean,
  }))

  const periodLabel = `${dayjs(from).format('D MMM YYYY')} – ${dayjs(to).format('D MMM YYYY')}`

  return (
    <div>
      <Link href="/reports" className="text-sm text-muted hover:text-accent font-sans transition-colors">
        ← Back to Reports
      </Link>

      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> REPORTS · GENERAL LEDGER · {periodLabel.toUpperCase()}
          </div>
          <h1 className="page-title">Ledger</h1>
        </div>
        <LedgerPicker accounts={accounts} selectedCode={code ?? ''} from={from} to={to} />
      </div>

      {!code ? (
        <p className="font-serif italic text-muted text-sm max-w-3xl">
          Pick an account above to view its journal lines and running balance
          over <strong>{periodLabel}</strong>.
        </p>
      ) : (
        <LedgerBody code={code} from={from} to={to} supabase={supabase} />
      )}
    </div>
  )
}

async function LedgerBody({
  code, from, to, supabase,
}: {
  code: string
  from: string
  to: string
  supabase: Awaited<ReturnType<typeof createClient>>
}) {
  try {
    const led = await fetchLedger(supabase, { code, from, to })
    return (
      <>
        <p className="font-serif italic text-muted text-sm mb-6 max-w-3xl">
          <strong>{led.code} {led.accountName}</strong> &middot; {dayjs(led.from).format('D MMMM YYYY')} – {dayjs(led.to).format('D MMMM YYYY')}
        </p>
        <div className="mb-4 font-mono text-sm text-graphite">
          Opening balance ({dayjs(led.from).subtract(1, 'day').format('D MMM YYYY')}):{' '}
          <span className="text-num-ink tabular">{formatSignedBalance(led.openingBalance)}</span>
        </div>
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Entry</th>
              <th>Description</th>
              <th className="num">Debit</th>
              <th className="num">Credit</th>
              <th className="num">Balance</th>
            </tr>
          </thead>
          <tbody>
            {led.lines.length === 0 ? (
              <tr>
                <td colSpan={6} className="font-serif italic text-muted text-center py-6">
                  No activity in this period.
                </td>
              </tr>
            ) : (
              led.lines.map((l, i) => (
                <tr key={i}>
                  <td className="font-mono text-xs">{dayjs(l.entryDate).format('D MMM YYYY')}</td>
                  <td className="font-mono text-xs text-graphite">{l.entryNo}</td>
                  <td>{l.description}</td>
                  <td className="num">{l.debit > 0 ? formatMoney(l.debit) : '—'}</td>
                  <td className="num">{l.credit > 0 ? formatMoney(l.credit) : '—'}</td>
                  <td className="num">{formatSignedBalance(l.runningBalance)}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot className="border-t-2 border-hairline">
            <tr>
              <td colSpan={3} className="font-serif italic text-ink">Period totals</td>
              <td className="num font-medium">{led.periodTotals.debit > 0 ? formatMoney(led.periodTotals.debit) : '—'}</td>
              <td className="num font-medium">{led.periodTotals.credit > 0 ? formatMoney(led.periodTotals.credit) : '—'}</td>
              <td></td>
            </tr>
            <tr>
              <td colSpan={5} className="font-serif italic text-ink font-semibold">
                Closing balance ({dayjs(led.to).format('D MMM YYYY')})
              </td>
              <td className="num font-semibold text-num-ink">{formatSignedBalance(led.closingBalance)}</td>
            </tr>
          </tfoot>
        </table>
      </>
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return (
      <div className="mt-8 px-4 py-3 border border-danger rounded-md bg-surface text-danger text-sm font-serif italic">
        ⚠ {msg}
      </div>
    )
  }
}
```

- [ ] **Step 2: Create the picker client component**

Create `src/app/(portal)/reports/ledger/_components/LedgerPicker.tsx`:

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import AccountPicker, { type AccountOption } from '@/components/AccountPicker'

interface Props {
  accounts: AccountOption[]
  selectedCode: string
  from: string
  to: string
}

export default function LedgerPicker({ accounts, selectedCode, from, to }: Props) {
  const router = useRouter()
  const [code, setCode] = useState(selectedCode)
  const [fromValue, setFromValue] = useState(from)
  const [toValue, setToValue] = useState(to)

  function submit() {
    if (!code) return
    const qs = new URLSearchParams({ code, from: fromValue, to: toValue })
    router.push(`/reports/ledger?${qs.toString()}`)
  }

  return (
    <div className="shrink-0 flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
      <div className="min-w-[260px]">
        <AccountPicker
          accounts={accounts}
          value={code}
          onChange={setCode}
          name="code"
          placeholder="Select account…"
        />
      </div>
      <input
        type="date"
        value={fromValue}
        onChange={(e) => setFromValue(e.target.value)}
        className="px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border"
      />
      <input
        type="date"
        value={toValue}
        onChange={(e) => setToValue(e.target.value)}
        className="px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border"
      />
      <button
        type="button"
        onClick={submit}
        disabled={!code}
        className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-serif italic text-sm rounded-md transition-colors"
      >
        Apply
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Add the second reports index card**

Read `src/app/(portal)/reports/page.tsx` and insert this object into the `reports` array directly AFTER the Trial Balance entry (added in Task 3) and BEFORE the Fund Summary entry:

```ts
  {
    href: '/reports/ledger',
    title: 'General Ledger',
    description: 'Per-account journal lines with running balance over a period.',
  },
```

- [ ] **Step 4: Browser smoke check**

Open `http://localhost:3000/reports/ledger` (logged in as Finance/Principal):

1. With no `?code=` param, page shows the empty-state "Pick an account above…" message.
2. Pick an account in the AccountPicker, adjust dates if desired, click Apply → URL updates to `?code=<code>&from=<from>&to=<to>` and the table renders.
3. From `/reports/trial-balance`, click any account name → lands on `/reports/ledger?code=<code>` with default period (current month). Confirm:
   - Account name in the subtitle matches the picked account.
   - Opening balance is shown with "Dr" or "Cr" suffix.
   - Journal lines are sorted by date ascending.
   - Running balance progresses correctly.
   - Period totals + closing balance shown in the footer.
4. Try an account with no activity in the period → table body shows "No activity in this period." and footer totals are all "—".
5. Manually visit `/reports/ledger?code=1000` (the header account) → page renders the error message "account 1000 is a header — pick a leaf account instead" in the red banner.

- [ ] **Step 5: TS + tests still pass**

```bash
npx tsc --noEmit 2>&1 | grep -E "ledger|cfo-reports" | head -5
npm run test:ci 2>&1 | tail -5
```

Expected: no new TS errors. 200 tests pass.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(portal)/reports/ledger" "src/app/(portal)/reports/page.tsx"
git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "feat(reports): /reports/ledger page + index card; TB rows link in"
```
