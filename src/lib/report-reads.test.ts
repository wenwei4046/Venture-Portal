import { afterAll, beforeAll, describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { applyGlRefs, buildCashFlow, fetchAllJournalLines, fetchGlRefs, type GlLine } from './gl-reports'
import type { AccountType } from './coa'
import { classifyRows, fetchIncomeStatement, fetchLedgers, fetchTrialBalance, type RawPvSourceRow } from './cfo-reports'
import { fetchInterBillingCashFlow } from './inter-billing-cash-flow'
import { fetchInterBillingElimination } from './consolidation'
import { primeDeptRegistry } from './dept-registry'
import { fetchDeptOutstanding } from './dept-receipt-payment'
import { fetchRnpInvoiceEvents } from './monthly-rnp'

// How the finance reports READ (2026-10-08). Each sequential PostgREST round
// trip costs ~35–40 ms in production, so these tests pin down not only what a
// reader returns but how it asks: pages together, independent reads at once,
// one read per table, `.in()` lists chunked — and the same answer as before.

// ── A pocket PostgREST ───────────────────────────────────────────────────────
// Just enough of the supabase-js builder for these readers: eq / lt / lte /
// gte / in / like / or / not-is-null filters (embedded columns such as
// `journal_entries.transaction_date` included), order, a range capped at 1000
// rows, and a count only when the select asked for one. Every request is
// logged in the order it was SENT.

type Row = Record<string, unknown>

interface Req {
  table: string
  counted: boolean
  inLists: Array<{ col: string; size: number }>
  /** An rpc's arguments, as sent. */
  args?: unknown
  /** `col.asc` / `col.desc`, in the order asked. */
  orders?: string[]
  /** The `.range()` asked for — none means "as written": capped at 1000. */
  range?: [number, number] | null
}

interface Answer {
  data: unknown
  error: { message: string } | null
  count: number | null
}

function pocketPostgrest(
  tables: Record<string, Row[]>,
  opts: {
    rpc?: Record<string, unknown>
    fail?: (req: Req) => string | null
    delay?: (req: Req) => number
  } = {},
) {
  const log: Req[] = []
  const read = (row: Row, col: string): unknown => {
    const dot = col.indexOf('.')
    if (dot < 0) return row[col]
    const embedded = row[col.slice(0, dot)] as Row | null | undefined
    return embedded?.[col.slice(dot + 1)]
  }
  const like = (pattern: string) =>
    new RegExp(`^${pattern.split('%').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`, 's')
  const settle = (req: Req, answer: () => Answer) => {
    log.push(req)
    return (async () => {
      const ms = opts.delay?.(req) ?? 0
      if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms))
      const failure = opts.fail?.(req)
      if (failure) return { data: null, error: { message: failure }, count: null }
      return answer()
    })()
  }

  const sortRows = (rows: Row[], orders: Array<{ col: string; asc: boolean }>) =>
    rows.sort((x, y) => {
      for (const o of orders) {
        const a = String(read(x, o.col))
        const b = String(read(y, o.col))
        if (a !== b) return (a < b ? -1 : 1) * (o.asc ? 1 : -1)
      }
      return 0
    })

  const from = (table: string) => {
    const req: Req = { table, counted: false, inLists: [], orders: [], range: null }
    const filters: Array<(row: Row) => boolean> = []
    const orders: Array<{ col: string; asc: boolean }> = []
    let range: [number, number] = [0, 999]
    const builder = {
      select(_columns?: string, o?: { count?: string }) {
        req.counted = o?.count === 'exact'
        return builder
      },
      eq(col: string, v: unknown) {
        filters.push((r) => read(r, col) === v)
        return builder
      },
      lt(col: string, v: string) {
        filters.push((r) => String(read(r, col)) < v)
        return builder
      },
      lte(col: string, v: string) {
        filters.push((r) => String(read(r, col)) <= v)
        return builder
      },
      gte(col: string, v: string) {
        filters.push((r) => String(read(r, col)) >= v)
        return builder
      },
      in(col: string, values: unknown[]) {
        req.inLists.push({ col, size: values.length })
        const set = new Set(values)
        filters.push((r) => set.has(read(r, col)))
        return builder
      },
      like(col: string, pattern: string) {
        const re = like(pattern)
        filters.push((r) => re.test(String(read(r, col) ?? '')))
        return builder
      },
      or(expr: string) {
        const alternatives = expr.split(',').map((part) => {
          const [col, op, ...rest] = part.split('.')
          if (op === 'eq') return (r: Row) => String(read(r, col) ?? '') === rest.join('.')
          if (op !== 'like') throw new Error(`pocketPostgrest: or(${op}) not supported`)
          const re = like(rest.join('.'))
          return (r: Row) => re.test(String(read(r, col) ?? ''))
        })
        filters.push((r) => alternatives.some((alt) => alt(r)))
        return builder
      },
      not(col: string, op: string, v: unknown) {
        if (op !== 'is' || v !== null) throw new Error('pocketPostgrest: only not(col, is, null)')
        filters.push((r) => read(r, col) != null)
        return builder
      },
      order(col: string, o?: { ascending?: boolean }) {
        orders.push({ col, asc: o?.ascending ?? true })
        req.orders!.push(`${col}.${(o?.ascending ?? true) ? 'asc' : 'desc'}`)
        return builder
      },
      range(lo: number, hi: number) {
        range = [lo, hi]
        req.range = [lo, hi]
        return builder
      },
      then<A = Answer, B = never>(
        onOk?: ((v: Answer) => A | PromiseLike<A>) | null,
        onErr?: ((e: unknown) => B | PromiseLike<B>) | null,
      ): Promise<A | B> {
        return settle(req, () => {
          const rows = sortRows((tables[table] ?? []).filter((r) => filters.every((f) => f(r))), orders)
          const [lo, hi] = range
          return {
            data: rows.slice(lo, Math.min(hi + 1, lo + 1000)),
            error: null,
            count: req.counted ? rows.length : null,
          }
        }).then(onOk, onErr)
      },
    }
    return builder
  }
  // gl_net_by_account (mig 20261008180000), worked out from the pocket's own
  // journal lines: Σ (Dr − Cr) per account over live entries dated BEFORE
  // p_before, p_codes narrowing it.
  const glNetByAccount = (args: { p_before: string; p_codes?: string[] }) => {
    const sums = new Map<string, number>()
    for (const l of tables.journal_lines ?? []) {
      const je = l.journal_entries as Row
      if (je.is_reversed || !(String(je.transaction_date) < args.p_before)) continue
      const code = String(l.account_code)
      if (args.p_codes && !args.p_codes.includes(code)) continue
      sums.set(code, (sums.get(code) ?? 0) + Number(l.debit) - Number(l.credit))
    }
    return [...sums].map(([account_code, net]) => ({ account_code, net }))
  }
  // A function's answer: a value as it is; a set ordered, ranged and capped at
  // 1000 rows exactly like a table read.
  const rpc = (name: string, args?: Record<string, unknown>) => {
    const req: Req = { table: `rpc:${name}`, counted: false, inLists: [], args, orders: [], range: null }
    const orders: Array<{ col: string; asc: boolean }> = []
    let range: [number, number] = [0, 999]
    const builder = {
      order(col: string, o?: { ascending?: boolean }) {
        orders.push({ col, asc: o?.ascending ?? true })
        req.orders!.push(`${col}.${(o?.ascending ?? true) ? 'asc' : 'desc'}`)
        return builder
      },
      range(lo: number, hi: number) {
        range = [lo, hi]
        req.range = [lo, hi]
        return builder
      },
      then<A = Answer, B = never>(
        onOk?: ((v: Answer) => A | PromiseLike<A>) | null,
        onErr?: ((e: unknown) => B | PromiseLike<B>) | null,
      ): Promise<A | B> {
        return settle(req, () => {
          const answer =
            opts.rpc && name in opts.rpc
              ? opts.rpc[name]
              : name === 'gl_net_by_account'
                ? glNetByAccount(args as { p_before: string; p_codes?: string[] })
                : null
          if (!Array.isArray(answer)) return { data: answer ?? null, error: null, count: null }
          const rows = sortRows([...(answer as Row[])], orders)
          const [lo, hi] = range
          return { data: rows.slice(lo, Math.min(hi + 1, lo + 1000)), error: null, count: null }
        }).then(onOk, onErr)
      },
    }
    return builder
  }
  return { client: { from, rpc } as unknown as SupabaseClient, log }
}

const pad = (n: number, width = 5) => String(n).padStart(width, '0')

// ── A small general ledger ───────────────────────────────────────────────────
// 1,400 entries, two lines each = 2,800 journal lines (three pages): 1,100 in
// May, 300 in June. Every 7th entry is a reversed pair. In June every entry
// points at its source: 240 invoices (sales into the bank) and 60 payment
// vouchers (rent out of it).

const COA: Row[] = [
  { code: '3000', name: 'Bank', type: 'asset', parent_code: null, is_active: true, cash_flow_category: 'operating' },
  { code: '5000', name: 'Service revenue', type: 'revenue', parent_code: null, is_active: true, cash_flow_category: 'operating' },
  { code: '9000', name: 'Expenses', type: 'expense', parent_code: null, is_active: true, cash_flow_category: 'operating' },
  { code: '9010', name: 'Rent', type: 'expense', parent_code: '9000', is_active: true, cash_flow_category: 'operating' },
]

function smallLedger() {
  const entries: Row[] = []
  const lines: Row[] = []
  const invoices: Row[] = []
  const vouchers: Row[] = []
  for (let i = 0; i < 1400; i++) {
    const june = i >= 1100
    const day = pad((i % 28) + 1, 2)
    const isInvoice = !june || (i - 1100) % 5 !== 0
    const entry: Row = {
      id: `e${pad(i)}`,
      entry_no: `JE-${pad(i)}`,
      transaction_date: `2026-${june ? '06' : '05'}-${day}`,
      description: `Entry ${i}`,
      segment: 'corporate',
      is_reversed: i % 7 === 3,
      reference_type: june ? (isInvoice ? 'invoice' : 'payment_voucher') : null,
      reference_id: june ? (isInvoice ? `inv${pad(i)}` : `pv${pad(i)}`) : null,
    }
    entries.push(entry)
    if (june && isInvoice) invoices.push({ id: `inv${pad(i)}`, description: `Sale ${i}`, invoice_no: `INV-${i}` })
    if (june && !isInvoice) {
      vouchers.push({ id: `pv${pad(i)}`, description: `Rent ${i}`, voucher_no: `HV-PV-${i}`, direction: 'debit' })
    }
    const amount = 100 + (i % 13)
    const [dr, cr] = isInvoice ? ['3000', '5000'] : ['9010', '3000']
    lines.push(
      { id: `l${pad(2 * i)}`, entry_id: entry.id, account_code: dr, debit: amount, credit: 0, description: null, journal_entries: entry },
      { id: `l${pad(2 * i + 1)}`, entry_id: entry.id, account_code: cr, debit: 0, credit: amount, description: null, journal_entries: entry },
    )
  }
  return {
    tables: { journal_entries: entries, journal_lines: lines, invoices, payment_vouchers: vouchers, chart_of_accounts: COA },
    entries,
    lines,
  }
}

const liveLines = (lines: Row[]) => lines.filter((l) => !(l.journal_entries as Row).is_reversed)
const net = (lines: Row[]) => lines.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0)

describe('fetchAllJournalLines — the whole ledger in two round trips', () => {
  it('asks for the count on the first page only, then the other pages together', async () => {
    const { tables } = smallLedger()
    const db = pocketPostgrest(tables)
    await fetchAllJournalLines(db.client)
    expect(db.log.map((r) => [r.table, r.counted])).toEqual([
      ['journal_lines', true],
      ['journal_lines', false],
      ['journal_lines', false],
    ])
  })

  it('returns every live line in id order, skipping reversed pairs across page edges', async () => {
    const { tables, lines } = smallLedger()
    const got = await fetchAllJournalLines(pocketPostgrest(tables).client)
    const want = liveLines(lines)
    expect(got.map((l) => `${l.entry_id}:${l.account_code}:${l.debit}:${l.credit}`)).toEqual(
      want.map((l) => `${l.entry_id}:${l.account_code}:${l.debit}:${l.credit}`),
    )
    expect(got[0]).toMatchObject({ date: '2026-05-01', entry_no: 'JE-00000', segment: 'corporate', ref_type: null })
  })

  it('keeps its own error message', async () => {
    const db = pocketPostgrest(smallLedger().tables, { fail: (r) => (r.counted ? null : 'TypeError: fetch failed') })
    await expect(fetchAllJournalLines(db.client)).rejects.toThrow(/^fetchAllJournalLines: TypeError: fetch failed$/)
  })
})

describe('fetchLedgers — reads at once, each table once', () => {
  const FROM = '2026-06-01'
  const TO = '2026-06-30'
  const activeCoa = () => Promise.resolve({ data: COA as never, error: null })

  it('works the same figures as reading everything in turn', async () => {
    const { tables, lines } = smallLedger()
    const ledgers = await fetchLedgers(pocketPostgrest(tables).client, { codes: [], from: FROM, to: TO })
    // Leaves only (9000 is a header), in TB order: asset, revenue, expense.
    expect(ledgers.map((l) => l.code)).toEqual(['3000', '5000', '9010'])
    for (const ledger of ledgers) {
      const mine = liveLines(lines).filter((l) => l.account_code === ledger.code)
      const before = mine.filter((l) => String((l.journal_entries as Row).transaction_date) < FROM)
      const during = mine.filter((l) => String((l.journal_entries as Row).transaction_date) >= FROM)
      expect(ledger.openingBalance).toBeCloseTo(net(before), 2)
      expect(ledger.closingBalance).toBeCloseTo(net(before) + net(during), 2)
      expect(ledger.lines.length).toBe(during.length + 1) // + BALANCE B/F
    }
    const bank = ledgers[0]
    const sale = bank.lines.find((l) => l.journalType === 'SALES')
    expect(sale).toMatchObject({ description: expect.stringMatching(/^Sale \d+$/), ref: expect.stringMatching(/^INV-\d+$/) })
    const rent = bank.lines.find((l) => l.journalType === 'PAYMENT')
    expect(rent).toMatchObject({ description: expect.stringMatching(/^Rent \d+$/), ref: expect.stringMatching(/^HV-PV-\d+$/) })
  })

  it('reads the chart once when the page hands its own read over, and each source table once, chunked', async () => {
    const { tables, entries } = smallLedger()
    const db = pocketPostgrest(tables)
    const withCoa = await fetchLedgers(db.client, { codes: [], from: FROM, to: TO, coa: activeCoa() })
    expect(db.log.filter((r) => r.table === 'chart_of_accounts')).toHaveLength(0)

    const alone = pocketPostgrest(tables)
    expect(await fetchLedgers(alone.client, { codes: [], from: FROM, to: TO })).toEqual(withCoa)
    expect(alone.log.filter((r) => r.table === 'chart_of_accounts')).toHaveLength(1)

    // The period's live entries point at ~200 invoices and ~50 vouchers: each
    // table read ONCE (no second pass for Journal Type / Ref), 100 ids a time.
    const live = entries.filter((e) => !e.is_reversed && String(e.transaction_date) >= FROM)
    const chunksOf = (n: number) => Array.from({ length: Math.ceil(n / 100) }, (_, i) => Math.min(100, n - 100 * i))
    const want = [
      ...chunksOf(live.filter((e) => e.reference_type === 'invoice').length).map((n) => `invoices:${n}`),
      ...chunksOf(live.filter((e) => e.reference_type === 'payment_voucher').length).map((n) => `payment_vouchers:${n}`),
    ]
    expect(want.length).toBeGreaterThan(2) // invoices really did need chunking
    const sourceReads = db.log.filter((r) => r.table === 'invoices' || r.table === 'payment_vouchers')
    expect(sourceReads.map((r) => `${r.table}:${r.inLists[0].size}`).sort()).toEqual(want.sort())
  })

  it('starts the lines for given codes before the chart is back — and only after it for "every leaf"', async () => {
    const { tables } = smallLedger()
    for (const codes of [['3000'], []]) {
      const db = pocketPostgrest(tables)
      let release!: () => void
      const gate = new Promise<void>((resolve) => (release = resolve))
      const coa = gate.then(() => ({ data: COA as never, error: null }))
      const pending = fetchLedgers(db.client, { codes, from: FROM, to: TO, coa })
      await new Promise((resolve) => setTimeout(resolve, 10))
      const before = db.log.map((r) => r.table)
      expect(before).toContain('journal_entries') // the period JEs never wait
      // The opening balances (summed) and the period's lines.
      expect(before.filter((t) => t === 'journal_lines' || t === 'rpc:gl_net_by_account').sort()).toEqual(
        codes.length > 0 ? ['journal_lines', 'rpc:gl_net_by_account'] : [],
      )
      release()
      const ledgers = await pending
      expect(ledgers.length).toBe(codes.length > 0 ? 1 : 3)
    }
  })

  it('still reports the chart’s failure first, and an invalid code, with the line reads failing too', async () => {
    const { tables } = smallLedger()
    const lineReads = new Set(['journal_lines', 'rpc:gl_net_by_account'])
    const down = pocketPostgrest(tables, {
      fail: (r) => (r.table === 'chart_of_accounts' || lineReads.has(r.table) ? `${r.table} down` : null),
    })
    await expect(fetchLedgers(down.client, { codes: [], from: FROM, to: TO })).rejects.toThrow(
      /^fetchLedgers COA: chart_of_accounts down$/,
    )
    // The lines were started early for given codes; their failure is not
    // reported (and not left unhandled) when the code itself is wrong.
    const linesDown = pocketPostgrest(tables, { fail: (r) => (lineReads.has(r.table) ? 'lines down' : null) })
    await expect(fetchLedgers(linesDown.client, { codes: ['1234'], from: FROM, to: TO })).rejects.toThrow(
      /^fetchLedgers: account 1234 not found$/,
    )
    await expect(fetchLedgers(linesDown.client, { codes: ['9000'], from: FROM, to: TO })).rejects.toThrow(/is a header/)
    // With the code valid, the summed opening balances' failure is reported as the opening's.
    const sumDown = pocketPostgrest(tables, { fail: (r) => (r.table === 'rpc:gl_net_by_account' ? 'sum down' : null) })
    await expect(fetchLedgers(sumDown.client, { codes: ['3000'], from: FROM, to: TO })).rejects.toThrow(
      /^fetchLedgers opening: sum down$/,
    )
  })

  // 2026-10-08: the opening balances were every line before the period (~3,860
  // in production, four pages) downloaded to be added up here.
  it('asks the database for the opening balances — one summed read, never the lines before the period', async () => {
    const { tables } = smallLedger()
    const db = pocketPostgrest(tables)
    await fetchLedgers(db.client, { codes: [], from: FROM, to: TO })
    expect(db.log.filter((r) => r.table === 'rpc:gl_net_by_account').map((r) => r.args)).toEqual([
      { p_before: FROM, p_codes: ['3000', '5000', '9010'] },
    ])
    // Only the period's lines are read: June's 300 entries, two lines each — one page.
    expect(db.log.filter((r) => r.table === 'journal_lines')).toHaveLength(1)
  })
})

describe('fetchTrialBalance — the chart and the summed balances at once', () => {
  it('ties, reading the chart beside ONE summed read of every account up to the day', async () => {
    const { tables, lines } = smallLedger()
    const db = pocketPostgrest(tables)
    const tb = await fetchTrialBalance(db.client, { asOf: '2026-06-15', showZeroBalance: false })
    const counted = liveLines(lines).filter((l) => String((l.journal_entries as Row).transaction_date) <= '2026-06-15')
    for (const code of ['3000', '5000', '9010']) {
      const balance = net(counted.filter((l) => l.account_code === code))
      const row = tb.rows.find((r) => r.code === code)
      expect(row && row.debit - row.credit).toBeCloseTo(balance, 2)
    }
    expect(tb.reconciles).toBe(true)
    // As at the 15th = every entry dated BEFORE the 16th; the chart beside it.
    expect(db.log.map((r) => [r.table, r.args])).toEqual([
      ['rpc:gl_net_by_account', { p_before: '2026-06-16' }],
      ['chart_of_accounts', undefined],
    ])
  })

  it('refuses a day that is not one before reading anything', async () => {
    const db = pocketPostgrest(smallLedger().tables)
    await expect(fetchTrialBalance(db.client, { asOf: '2026-02-31', showZeroBalance: false })).rejects.toThrow(
      /^fetchTrialBalance: 2026-02-31 is not a date$/,
    )
    expect(db.log).toHaveLength(0)
  })

  it('reports the chart’s failure before the ledger’s', async () => {
    const db = pocketPostgrest(smallLedger().tables, { fail: (r) => `${r.table} down` })
    await expect(fetchTrialBalance(db.client, { asOf: '2026-06-15', showZeroBalance: false })).rejects.toThrow(
      /^fetchTrialBalance COA: chart_of_accounts down$/,
    )
  })
})

describe('fetchIncomeStatement — voucher sources chunked, in their own id order', () => {
  // 250 paid vouchers: the first 125 pay Rent, the rest Utilities, RM 100
  // each — a tie. Source-row ids run AGAINST the vouchers (v249 holds s00000),
  // so chunk order and id order disagree; the one-query read answered in id
  // order, and a tie in linesFrom goes to whichever label came first.
  function accrualBooks() {
    const vouchers: Row[] = []
    const sources: Row[] = []
    for (let k = 0; k < 250; k++) {
      vouchers.push({
        id: `v${pad(k)}`,
        voucher_type: 'expense',
        direction: 'debit',
        amount: 100,
        payment_date: '2026-06-10',
        status: 'paid',
      })
      sources.push({
        id: `s${pad(249 - k)}`,
        voucher_id: `v${pad(k)}`,
        pool: 'dept_pool_marketing',
        account_code: k < 125 ? '9010' : '9020',
        amount: 100,
      })
    }
    const coa: Row[] = [
      ...COA,
      { code: '9020', name: 'Utilities', type: 'expense', parent_code: '9000', is_active: true, cash_flow_category: 'operating' },
    ]
    return { payment_vouchers: vouchers, payment_voucher_sources: sources, chart_of_accounts: coa }
  }

  it('asks for at most 100 vouchers at a time and classifies as the single read did', async () => {
    const tables = accrualBooks()
    const db = pocketPostgrest(tables)
    const income = await fetchIncomeStatement(db.client, { from: '2026-01-01', to: '2026-12-31' })

    const sourceReads = db.log.filter((r) => r.table === 'payment_voucher_sources')
    expect(sourceReads.map((r) => r.inLists[0].size)).toEqual([100, 100, 50])

    const name: Record<string, string> = { '9010': 'Rent', '9020': 'Utilities' }
    const inIdOrder = [...tables.payment_voucher_sources]
      .sort((a, b) => (String(a.id) < String(b.id) ? -1 : 1))
      .map((s): RawPvSourceRow => ({
        voucherId: String(s.voucher_id),
        voucherType: 'expense',
        direction: 'debit',
        pool: String(s.pool),
        accountCode: String(s.account_code),
        accountName: name[String(s.account_code)],
        accountType: 'expense',
        cashFlowCategory: 'operating',
        amount: Number(s.amount),
      }))
    const expected = classifyRows({
      pvSources: inIdOrder,
      invoices: [],
      treasury: { interestIncome: 0, penaltyIncome: 0, interestExpense: 0, managedCodes: new Set() },
      fundSourceInflows: [],
      repaymentPrincipalInflows: [],
      interBillingExpenses: [],
      manualJvPnl: [],
    }).income
    expect(income).toEqual(expected)
    // The tie goes to Utilities: its rows hold the smallest source ids.
    expect(income.pools[0].expenseLines.map((l) => l.label)).toEqual(['Utilities', 'Rent'])
  })
})

describe('fetchInterBillingCashFlow — reads before the bank codes are known', () => {
  const tables: Record<string, Row[]> = {
    dept_pools: [
      {
        amount: 500,
        created_at: '2026-07-05T03:00:00Z',
        description: 'PV HV-OR-202607-0001: Office rent share [dept_pool_marketing]',
        transaction_type: 'inter_billing_out',
        departments: { name: 'Marketing' },
      },
      {
        amount: 500,
        created_at: '2026-07-05T03:00:00Z',
        description: 'PV HV-OR-202607-0001: Office rent share [venture_pool]',
        transaction_type: 'np_in',
        departments: { name: 'Venture Office' },
      },
    ],
    payment_vouchers: [],
  }
  const rpc = {
    bridge_ref_flags: { voided: [], payroll_refs: [] },
    bridge_mirror_slices: [{ voucher_no: 'HV-OR-202607-0001', account_code: '9094', amount: 500 }],
  }

  it('sends every read at once, then builds the same lines as with the codes in hand', async () => {
    const db = pocketPostgrest(tables, { rpc })
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const pending = fetchInterBillingCashFlow(db.client, gate.then(() => new Set(['3000', '3010'])))
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(db.log.map((r) => r.table).sort()).toEqual([
      'dept_pools',
      'dept_pools',
      'dept_pools',
      'dept_pools',
      'journal_entries',
      'payment_vouchers',
      'rpc:bridge_mirror_slices',
      'rpc:bridge_ref_flags',
    ])
    release()
    const withPending = await pending
    const withSet = await fetchInterBillingCashFlow(pocketPostgrest(tables, { rpc }).client, new Set(['3000', '3010']))
    expect(withPending).toEqual(withSet)
    expect(withPending.lines.map((l) => [l.account_code, l.debit, l.credit, l.segment])).toEqual([
      ['3000', 0, 500, 'marketing'],
      ['9094', 500, 0, 'marketing'],
      ['3000', 500, 0, 'corporate'],
      ['IB-XFER', 0, 500, 'corporate'],
    ])
  })
})

describe('fetchInterBillingCashFlow — Revenue’s payroll to HR by account (2026-10-22, "可以，只改 Revenue")', () => {
  beforeAll(() =>
    primeDeptRegistry([{ id: 'rev', name: 'Revenue Department', segmentKey: 'revenue_department', poolGlCode: null, billingModeKey: 'revenue_department_attribution', isInternal: false }]),
  )
  afterAll(() => primeDeptRegistry([]))

  const custody = (no: string, amount: number) => ({ amount, created_at: '2026-10-15T09:44:18Z', description: `PV ${no}: payroll fund → custody pool`, transaction_type: 'np_in', departments: { name: 'HR' } })
  const tables: Record<string, Row[]> = {
    dept_pools: [
      { amount: 261253.69, created_at: '2026-10-15T09:44:18Z', description: 'PV HV-PV-202610-0541: Payroll bank transfer — Sep 2026', transaction_type: 'expense_out', departments: { name: 'Revenue Department' } },
      custody('HV-PV-202610-0541', 261253.69),
      { amount: 30000, created_at: '2026-10-15T09:40:00Z', description: 'PV HV-PV-202610-0540: Payroll bank transfer — Sep 2026 (Marketing)', transaction_type: 'expense_out', departments: { name: 'Marketing' } },
      custody('HV-PV-202610-0540', 30000),
    ],
    payment_vouchers: [],
    journal_entries: [
      {
        id: 'je-rev-sep',
        transaction_date: '2026-09-30',
        reference_type: 'payroll_accrual',
        segment: 'revenue_department',
        is_reversed: false,
        journal_lines: [
          { account_code: '9030', debit: 51000 },
          { account_code: '9093', debit: 187798.61 },
          { account_code: '9090', debit: 4760.27 },
          { account_code: '9098', debit: 3469.83 },
          { account_code: '9084', debit: 2672 },
          { account_code: '9081', debit: 6180 },
          { account_code: '9082', debit: 623.95 },
          { account_code: '9083', debit: 71.3 },
          { account_code: '4070', debit: null },
        ],
      },
      { id: 'je-mkt-sep', transaction_date: '2026-09-30', reference_type: 'payroll_accrual', segment: 'marketing', is_reversed: false, journal_lines: [{ account_code: '9030', debit: 30000 }] },
    ],
  }
  const rpc = { bridge_ref_flags: { voided: [], payroll_refs: [] }, bridge_mirror_slices: [] }

  it('splits Revenue’s round as its month’s accrual does; every other department keeps its one Accrual - Salary line', async () => {
    const { lines } = await fetchInterBillingCashFlow(pocketPostgrest(tables, { rpc }).client, new Set(['3000']))
    const debits = (seg: string) => lines.filter((l) => l.segment === seg && l.debit > 0).map((l) => [l.account_code, l.debit])
    expect(debits('revenue_department')).toEqual([
      ['9030', 51000],
      ['9081', 6180],
      ['9082', 623.95],
      ['9083', 71.3],
      ['9084', 2672],
      ['9090', 4760.27],
      ['9093', 192476.34],
      ['9098', 3469.83],
    ])
    const cashOut = lines.filter((l) => l.segment === 'revenue_department').reduce((s, l) => s + l.credit, 0)
    expect(Math.round(cashOut * 100) / 100).toBe(261253.69)
    expect(debits('marketing')).toEqual([['4070', 30000]])
  })
})

// ── Past PostgREST's 1000-row cap (2026-10-08) ───────────────────────────────
// An unranged read — table or set-returning function — stops at 1000 rows and
// says nothing. Each reader below once lost every row past it; each must now
// use the 1,001st.

const pageRanges = (log: Req[], table: string) => log.filter((r) => r.table === table).map((r) => r.range)

describe('fetchGlRefs — every invoice, voucher and credit note', () => {
  function books() {
    return {
      invoices: Array.from({ length: 1005 }, (_, i) => ({
        id: `inv${pad(i)}`,
        invoice_no: `INV-${i}`,
        description: `Sale ${i}`,
        company_id: i % 2 ? 'co-a' : null,
        billable_to_department_id: null,
        billable_to_freetext_name: i % 2 ? null : `Walk-in ${i}`,
      })),
      payment_vouchers: Array.from({ length: 1003 }, (_, i) => ({ id: `pv${pad(i)}`, payee_name: `Payee ${i}`, invoice_id: null })),
      credit_notes: Array.from({ length: 1002 }, (_, i) => ({ id: `cn${pad(i)}`, invoice_id: `inv${pad(i)}` })),
      companies: [{ id: 'co-a', name: 'Alpha Sdn Bhd', short_code: 'ALP' }],
      departments: [],
    }
  }

  it('resolves the rows past the 1000th, each table in two pages', async () => {
    const db = pocketPostgrest(books())
    const refs = await fetchGlRefs(db.client)
    expect(refs.invoices.size).toBe(1005)
    expect(refs.invoices.get('inv01004')).toEqual({ invoice_no: 'INV-1004', description: 'Sale 1004', billTo: 'Walk-in 1004' })
    expect(refs.voucherPayees.get('pv01002')).toBe('Payee 1002')
    expect(refs.creditNoteParties?.get('cn01001')).toBe('ALP')
    for (const table of ['invoices', 'payment_vouchers', 'credit_notes']) {
      expect(pageRanges(db.log, table)).toEqual([[0, 999], [1000, 1999]])
    }
  })

  it('names the drill-down lines that point past the 1000th invoice and voucher', async () => {
    const refs = await fetchGlRefs(pocketPostgrest(books()).client)
    const line = (ref_type: string, ref_id: string): GlLine => ({
      account_code: '3000', debit: 1, credit: 0, description: null, entry_id: 'e', date: '2026-09-01',
      entry_no: null, entry_description: null, segment: 'corporate', ref_type, ref_id,
    })
    const [sale, payment] = applyGlRefs([line('invoice', 'inv01003'), line('payment_voucher', 'pv01001')], refs)
    expect(sale).toMatchObject({ ref_no: 'INV-1003', doc_text: 'Sale 1003', party: 'ALP' })
    expect(payment).toMatchObject({ party: 'Payee 1001' })
  })

  it('still lets the credit notes fail quietly, and the invoices not', async () => {
    const quiet = await fetchGlRefs(pocketPostgrest(books(), { fail: (r) => (r.table === 'credit_notes' ? 'denied' : null) }).client)
    expect(quiet.creditNoteParties?.size).toBe(0)
    expect(quiet.invoices.size).toBe(1005)
    await expect(
      fetchGlRefs(pocketPostgrest(books(), { fail: (r) => (r.table === 'invoices' ? 'TypeError: fetch failed' : null) }).client),
    ).rejects.toThrow(/^fetchGlRefs invoices: TypeError: fetch failed$/)
  })
})

// 2026-10-13 — the user: "就算能看到 pv，应该也是看到 by 整个部门才对". Whoever
// reads payroll by department (the Finance view; no Payroll payouts) gets each
// salary voucher's journal lines folded by batch, department and day: the same
// balances, the same cash flow, and no name anywhere in what is sent.
describe('salary lines by department', () => {
  const PAYROLL_COA: Row[] = [
    { code: '3010', name: 'Bank (Alliance)', type: 'asset', parent_code: null, is_active: true, cash_flow_category: 'operating' },
    { code: '4070', name: 'Salary payable', type: 'liability', parent_code: null, is_active: true, cash_flow_category: 'operating' },
    { code: '9010', name: 'Rent', type: 'expense', parent_code: null, is_active: true, cash_flow_category: 'operating' },
  ]
  const NAMES = /Aina Example|Balakrishnan|Chong Kah Wai|HV-PV-202610-049/

  function payrollBooks() {
    const people = [['Aina Example', 'Marketing', 3200.5], ['Balakrishnan', 'Marketing', 4100.25], ['Chong Kah Wai', 'IT', 5000]] as const
    const entries: Row[] = []
    const lines: Row[] = []
    const vouchers: Row[] = []
    people.forEach(([name, dept, amount], i) => {
      const pv: Row = {
        id: `pv${i}`, voucher_no: `HV-PV-202610-049${i}`, direction: 'debit', reference_type: 'payroll_disbursement',
        description: `Payroll net Sep 2026 — ${name} (${dept})`, payee_name: name, invoice_id: null, payment_date: '2026-10-06',
      }
      vouchers.push(pv)
      const entry: Row = {
        id: `e${i}`, entry_no: `JE-202610-088${i}`, transaction_date: '2026-10-06', description: `PV ${pv.voucher_no}: ${pv.description}`,
        segment: 'hr', is_reversed: false, reference_type: 'payment_voucher', reference_id: pv.id,
      }
      entries.push(entry)
      lines.push(
        { id: `l${2 * i}`, entry_id: entry.id, account_code: '4070', debit: amount, credit: 0, description: `other - ${name} (4070)`, journal_entries: entry },
        { id: `l${2 * i + 1}`, entry_id: entry.id, account_code: '3010', debit: 0, credit: amount, description: `Bank payment - ${pv.voucher_no}`, journal_entries: entry },
      )
    })
    // A rent voucher the same day, which stays as it is.
    vouchers.push({ id: 'pv-rent', voucher_no: 'HV-PV-202610-0500', direction: 'debit', reference_type: null, description: 'October rent', payee_name: 'Landlord', invoice_id: null, payment_date: '2026-10-06' })
    const rent: Row = {
      id: 'e-rent', entry_no: 'JE-202610-0890', transaction_date: '2026-10-06', description: 'PV HV-PV-202610-0500: October rent',
      segment: 'corporate', is_reversed: false, reference_type: 'payment_voucher', reference_id: 'pv-rent',
    }
    entries.push(rent)
    lines.push(
      { id: 'l-r1', entry_id: 'e-rent', account_code: '9010', debit: 900, credit: 0, description: null, journal_entries: rent },
      { id: 'l-r2', entry_id: 'e-rent', account_code: '3010', debit: 0, credit: 900, description: null, journal_entries: rent },
    )
    return {
      journal_entries: entries, journal_lines: lines, payment_vouchers: vouchers, chart_of_accounts: PAYROLL_COA,
      departments: [{ id: 'd-m', name: 'Marketing', is_internal: false }, { id: 'd-it', name: 'IT', is_internal: false }],
      invoices: [], companies: [], credit_notes: [],
    }
  }

  it('the ledger: one line per batch, department and day — the same balances, no name', async () => {
    const args = { codes: ['3010', '4070'], from: '2026-10-01', to: '2026-10-31' }
    const byPerson = await fetchLedgers(pocketPostgrest(payrollBooks()).client, args)
    const byDepartment = await fetchLedgers(pocketPostgrest(payrollBooks()).client, { ...args, payrollByPerson: false })
    expect(JSON.stringify(byPerson)).toMatch(NAMES) // whoever reads payroll by person, as before
    expect(JSON.stringify(byDepartment)).not.toMatch(NAMES)
    const bank = byDepartment.find((l) => l.code === '3010')!
    expect(bank.lines.map((l) => [l.description, l.debit, l.credit, l.ref, l.entryNo])).toEqual([
      ['BALANCE B/F', 0, 0, '', ''],
      ['Payroll net Sep 2026 · Marketing · 2 vouchers', 0, 7300.75, '', ''],
      ['Payroll net Sep 2026 · IT · 1 voucher', 0, 5000, '', ''],
      ['October rent', 0, 900, 'HV-PV-202610-0500', 'JE-202610-0890'],
    ])
    expect(bank.lines.map((l) => l.runningBalance)).toEqual([0, -7300.75, -12300.75, -13200.75])
    for (const code of ['3010', '4070']) {
      const a = byPerson.find((l) => l.code === code)!
      const b = byDepartment.find((l) => l.code === code)!
      expect(b.closingBalance).toBe(a.closingBalance)
      expect(b.periodTotals).toEqual(a.periodTotals)
    }
  })

  it('the statements: each department’s lines as one entry — the same cash flow, no name in a drill-down', async () => {
    const tables = payrollBooks()
    const lines = await fetchAllJournalLines(pocketPostgrest(tables).client)
    const refsByPerson = await fetchGlRefs(pocketPostgrest(tables).client)
    const refsByDepartment = await fetchGlRefs(pocketPostgrest(tables).client, { payrollByPerson: false })
    expect(refsByPerson.payrollByDepartment).toBeUndefined()
    // A salary voucher's own words (2026-10-26, what a drill-down line says) are never kept for a department reader.
    expect([...(refsByPerson.voucherTexts?.keys() ?? [])].sort()).toEqual(['pv-rent', 'pv0', 'pv1', 'pv2'])
    expect([...(refsByDepartment.voucherTexts?.keys() ?? [])]).toEqual(['pv-rent'])
    const asPerson = applyGlRefs(lines, refsByPerson)
    const asDepartment = applyGlRefs(lines, refsByDepartment)
    expect(JSON.stringify(asPerson)).toMatch(NAMES)
    expect(JSON.stringify(asDepartment)).not.toMatch(NAMES)
    expect(asDepartment.filter((l) => l.ref_type === 'payroll_department').map((l) => [l.entry_description, l.account_code, l.debit, l.credit, l.party])).toEqual([
      ['Payroll net Sep 2026 · Marketing · 2 vouchers', '4070', 7300.75, 0, 'Marketing'],
      ['Payroll net Sep 2026 · Marketing · 2 vouchers', '3010', 0, 7300.75, 'Marketing'],
      ['Payroll net Sep 2026 · IT · 1 voucher', '4070', 5000, 0, 'IT'],
      ['Payroll net Sep 2026 · IT · 1 voucher', '3010', 0, 5000, 'IT'],
    ])
    // The rent voucher keeps its payee.
    expect(asDepartment.find((l) => l.entry_id === 'e-rent')).toMatchObject({ party: 'Landlord' })
    const coa = PAYROLL_COA.map((a) => ({ code: String(a.code), name: String(a.name), type: a.type as AccountType, parent_code: null, cash_flow_category: 'operating' as const }))
    const filter = { current: { from: '2026-10-01', to: '2026-10-31' }, previous: { from: '2026-09-01', to: '2026-09-30' } }
    const a = buildCashFlow(asPerson, coa, filter, new Set(['3010']))
    const b = buildCashFlow(asDepartment, coa, filter, new Set(['3010']))
    expect([b.netChange, b.closingCash, b.check, b.operating.current]).toEqual([a.netChange, a.closingCash, a.check, a.operating.current])
    expect(JSON.stringify(b)).not.toMatch(NAMES)
  })
})

describe('fetchInterBillingElimination — every internal invoice', () => {
  it('eliminates the 1,001st', async () => {
    const invoices = Array.from({ length: 1001 }, (_, i) => ({ id: `inv${pad(i)}`, billable_to_type: i % 2 ? 'dept_pool' : 'director' }))
    const db = pocketPostgrest({ invoices, chart_of_accounts: [{ code: '9050', parent_code: null }] })
    const elim = await fetchInterBillingElimination(db.client)
    expect(elim.internalInvoiceIds.size).toBe(1001)
    expect(elim.internalInvoiceIds.has('inv01000')).toBe(true)
  })
})

describe('fetchInterBillingCashFlow — every pool row', () => {
  // 1,001 reallocations, each a payer row and its receiver: both reads pass
  // the cap. The last pair is the one an unranged read would have dropped.
  function pools(n: number) {
    const rows: Row[] = []
    for (let i = 0; i < n; i++) {
      const ref = `HV-OR-202607-${pad(i, 4)}`
      rows.push(
        {
          id: `dp-pay-${pad(i)}`,
          amount: 10,
          created_at: '2026-07-05T03:00:00Z',
          description: `PV ${ref}: Office rent share [dept_pool_marketing]`,
          transaction_type: 'inter_billing_out',
          departments: { name: 'Marketing' },
        },
        {
          id: `dp-rec-${pad(i)}`,
          amount: 10,
          created_at: '2026-07-05T03:00:00Z',
          description: `PV ${ref}: Office rent share [venture_pool]`,
          transaction_type: 'np_in',
          departments: { name: 'Venture Office' },
        },
      )
    }
    return rows
  }
  const rpc = { bridge_ref_flags: { voided: [], payroll_refs: [] }, bridge_mirror_slices: [] }

  it('bridges the 1,001st reallocation on both sides', async () => {
    const db = pocketPostgrest({ dept_pools: pools(1001), payment_vouchers: [] }, { rpc })
    const out = await fetchInterBillingCashFlow(db.client, new Set(['3000']))
    expect(out.lines).toHaveLength(4 * 1001)
    expect(out.lines.filter((l) => l.description?.includes('HV-OR-202607-1000')).map((l) => [l.account_code, l.segment])).toEqual([
      ['IB-XFER', 'marketing'],
      ['IB-XFER', 'corporate'],
    ])
    // Each capped pool read: once as written, then two pages in ledger order.
    const pages = db.log.filter((r) => r.table === 'dept_pools' && r.range)
    expect(pages.map((r) => [r.orders, r.range])).toEqual([
      [['created_at.asc', 'id.asc'], [0, 999]],
      [['created_at.asc', 'id.asc'], [0, 999]],
      [['created_at.asc', 'id.asc'], [1000, 1999]],
      [['created_at.asc', 'id.asc'], [1000, 1999]],
    ])
  })

  it('under the cap, sends each pool read as written, once', async () => {
    const db = pocketPostgrest({ dept_pools: pools(3), payment_vouchers: [] }, { rpc })
    const out = await fetchInterBillingCashFlow(db.client, new Set(['3000']))
    expect(out.lines).toHaveLength(12)
    expect(db.log.filter((r) => r.table === 'dept_pools').map((r) => [r.orders, r.range])).toEqual([
      [[], null],
      [[], null],
      [[], null],
      [[], null],
    ])
  })

  it('still answers no lines when a pool read fails past the first page', async () => {
    const db = pocketPostgrest(
      { dept_pools: pools(1001), payment_vouchers: [] },
      { rpc, fail: (r) => (r.table === 'dept_pools' && r.range?.[0] === 1000 ? 'TypeError: fetch failed' : null) },
    )
    const out = await fetchInterBillingCashFlow(db.client, new Set(['3000']))
    expect(out.lines).toEqual([])
  })
})

describe('fetchDeptOutstanding — every issued invoice and its settlement row', () => {
  it('owes the 1,001st invoice, reading both the table and the function in pages', async () => {
    const invoices = Array.from({ length: 1001 }, (_, i) => ({
      id: `inv${pad(i)}`,
      invoice_no: `HV-INV-202609-${pad(i, 4)}`,
      company_id: null,
      billable_to_freetext_name: 'Walk-in',
      period_month: '2026-09-01',
      invoice_date: '2026-09-30',
      total_amount: 100,
      status: 'issued',
      billing_mode: 'marketing_project',
    }))
    const settlements = invoices.map((i) => ({ invoice_id: i.id, receipts: 40, credits: 0 }))
    const db = pocketPostgrest({ invoices }, { rpc: { dept_invoice_settlements: settlements } })
    const owed = await fetchDeptOutstanding(db.client as never, { segment: 'marketing' })
    expect(owed).toHaveLength(1001)
    expect(owed[1000]).toMatchObject({ invoiceNo: 'HV-INV-202609-1000', receipts: 40, outstanding: 60 })
    expect(pageRanges(db.log, 'invoices')).toEqual([[0, 999], [1000, 1999]])
    expect(db.log.filter((r) => r.table === 'rpc:dept_invoice_settlements').map((r) => [r.orders, r.range])).toEqual([
      [['invoice_id.asc'], [0, 999]],
      [['invoice_id.asc'], [1000, 1999]],
    ])
  })
})

describe('fetchRnpInvoiceEvents — every billed / collected / credited event', () => {
  const events = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      invoice_id: `inv${pad(i)}`,
      invoice_no: `INV-${i}`,
      company_id: null,
      party_fallback: 'Walk-in',
      event_kind: 'billed',
      amount: 100,
      event_date: '2026-09-30',
    }))

  it('reads a capped answer again in pages, in a total order, and keeps the 1,001st', async () => {
    const db = pocketPostgrest({}, { rpc: { rnp_invoice_events: events(1001) } })
    const got = await fetchRnpInvoiceEvents(db.client, {})
    expect(got).toHaveLength(1001)
    expect(got.map((e) => e.invoice_id)).toContain('inv01000')
    const order = ['invoice_id.asc', 'event_kind.asc', 'event_date.asc', 'amount.asc']
    expect(db.log.map((r) => [r.table, r.orders, r.range])).toEqual([
      ['rpc:rnp_invoice_events', [], null],
      ['rpc:rnp_invoice_events', order, [0, 999]],
      ['rpc:rnp_invoice_events', order, [1000, 1999]],
    ])
  })

  it('under the cap, asks once as before and keeps the function’s own order', async () => {
    const backwards = events(3).reverse()
    const db = pocketPostgrest({}, { rpc: { rnp_invoice_events: backwards } })
    expect(await fetchRnpInvoiceEvents(db.client, { p_segment: 'marketing' })).toEqual(backwards)
    expect(db.log).toHaveLength(1)
  })

  it('reads a failure as no events, as the pages always did', async () => {
    const db = pocketPostgrest({}, { rpc: { rnp_invoice_events: events(3) }, fail: () => 'denied' })
    expect(await fetchRnpInvoiceEvents(db.client, {})).toEqual([])
  })
})
