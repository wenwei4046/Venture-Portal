import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllJournalLines } from './gl-reports'
import { classifyRows, fetchIncomeStatement, fetchLedgers, fetchTrialBalance, type RawPvSourceRow } from './cfo-reports'
import { fetchInterBillingCashFlow } from './inter-billing-cash-flow'

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

  const from = (table: string) => {
    const req: Req = { table, counted: false, inLists: [] }
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
        return builder
      },
      range(lo: number, hi: number) {
        range = [lo, hi]
        return builder
      },
      then<A = Answer, B = never>(
        onOk?: ((v: Answer) => A | PromiseLike<A>) | null,
        onErr?: ((e: unknown) => B | PromiseLike<B>) | null,
      ): Promise<A | B> {
        return settle(req, () => {
          const rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)))
          rows.sort((x, y) => {
            for (const o of orders) {
              const a = String(read(x, o.col))
              const b = String(read(y, o.col))
              if (a !== b) return (a < b ? -1 : 1) * (o.asc ? 1 : -1)
            }
            return 0
          })
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
  const rpc = (name: string, args?: Record<string, unknown>) => ({
    then<A = Answer, B = never>(
      onOk?: ((v: Answer) => A | PromiseLike<A>) | null,
      onErr?: ((e: unknown) => B | PromiseLike<B>) | null,
    ): Promise<A | B> {
      return settle({ table: `rpc:${name}`, counted: false, inLists: [], args }, () => ({
        data:
          opts.rpc && name in opts.rpc
            ? opts.rpc[name]
            : name === 'gl_net_by_account'
              ? glNetByAccount(args as { p_before: string; p_codes?: string[] })
              : null,
        error: null,
        count: null,
      })).then(onOk, onErr)
    },
  })
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
