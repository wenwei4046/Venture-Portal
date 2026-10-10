import dayjs from 'dayjs'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney, getPeriodMonth } from '@/lib/utils'
import { canDo } from '@/lib/permission-actions'
import { fetchAllRows } from '@/lib/paginate'
import { ventureRefLabel } from '@/lib/venture-pool'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import InOutCharts, { type TrendMonth } from './_components/InOutCharts'
import PoolLedgerTable, { type PoolLine } from './_components/PoolLedgerTable'

// Post 2026-05-26 re-import: Venture Pool data is derived from journal_lines
// where segment IN ('corporate', 'treasury') on HV bank accounts, NOT the
// legacy venture_pool table. Matches /dept-pool's Venture row + dashboard
// hv_fund_balance (mig 273). Treasury inclusion captures fund_source /
// loan / repayment activity (HV central treasury operations); corporate
// captures generic HV expenses + historical OFFICE-tagged manual_jv.

export default async function VenturePoolPage() {
  const user = await requirePermission('venture_pool')
  const supabase = await createClient()

  const period = getPeriodMonth()
  const monthStart = dayjs(period).startOf('month').format('YYYY-MM-DD')
  const nextMonth = dayjs(period).add(1, 'month').startOf('month').format('YYYY-MM-DD')
  const trendStart = dayjs(period).subtract(11, 'month').startOf('month').format('YYYY-MM-DD')

  // Resolve bank account codes once.
  const { data: bankCodesData } = await supabase
    .from('bank_accounts')
    .select('gl_account_code')
    .eq('status', 'active')
  const cashCodes = (bankCodesData ?? [])
    .map((b) => b.gl_account_code as string)
    .filter(Boolean)

  // Helper: fetch journal_lines on corporate-segment bank touches in a window.
  type RawLine = {
    id: string
    debit: number | null
    credit: number | null
    description: string | null
    journal_entries: { transaction_date: string; description: string | null; reference_type: string | null }
  }
  async function fetchCorpBankLines(opts: { since?: string; until?: string; limit?: number }) {
    if (cashCodes.length === 0) return [] as RawLine[]
    const base = () => {
      let q = supabase
        .from('journal_lines')
        .select('id, debit, credit, description, journal_entries!inner(transaction_date, description, reference_type, segment, is_reversed)')
        .in('account_code', cashCodes)
        .in('journal_entries.segment', ['corporate', 'treasury'])
        // VOID/reversal pairs net to zero, so the BALANCE was always right —
        // but the gross In/Out, the 12-month trend and the recent-lines list
        // counted both legs as real flow (user 2026-09-10: Jul + Aug each
        // inflated ~136k / ~87k). Same exclusion every other report uses.
        .eq('journal_entries.is_reversed', false)
      if (opts.since) q = q.gte('journal_entries.transaction_date', opts.since)
      if (opts.until) q = q.lt('journal_entries.transaction_date', opts.until)
      return q
    }
    // Display reads pass a limit (most-recent first); the aggregation reads
    // (no limit) MUST paginate or they truncate at PostgREST's 1000-row cap.
    if (opts.limit) {
      const { data } = await base()
        .order('transaction_date', { foreignTable: 'journal_entries', ascending: false })
        .limit(opts.limit)
      return (data ?? []) as unknown as RawLine[]
    }
    const rows = await fetchAllRows((lo, hi) => base().order('id', { ascending: true }).range(lo, hi))
    return rows as unknown as RawLine[]
  }

  const [allTimeLines, monthLines, trendLines, ledgerLines] = await Promise.all([
    fetchCorpBankLines({}),
    fetchCorpBankLines({ since: monthStart, until: nextMonth }),
    fetchCorpBankLines({ since: trendStart }),
    fetchCorpBankLines({ limit: 50 }),
  ])

  // All-time balance.
  let balance = 0
  for (const l of allTimeLines) balance += Number(l.debit ?? 0) - Number(l.credit ?? 0)

  // This-month In/Out.
  let monthIn = 0
  let monthOut = 0
  for (const l of monthLines) {
    monthIn += Number(l.debit ?? 0)
    monthOut += Number(l.credit ?? 0)
  }
  const netChange = monthIn - monthOut

  // 12-month trend bucketed by transaction_date month.
  const trendMap = new Map<string, { in: number; out: number }>()
  for (let i = 0; i < 12; i++) {
    const m = dayjs(period).subtract(11 - i, 'month').format('YYYY-MM-01')
    trendMap.set(m, { in: 0, out: 0 })
  }
  for (const l of trendLines) {
    const k = dayjs(l.journal_entries.transaction_date).format('YYYY-MM-01')
    const row = trendMap.get(k)
    if (!row) continue
    row.in += Number(l.debit ?? 0)
    row.out += Number(l.credit ?? 0)
  }
  const trend: TrendMonth[] = Array.from(trendMap.entries()).map(([m, v]) => ({
    label: dayjs(m).format('MMM'),
    in: Math.round(v.in * 100) / 100,
    out: Math.round(v.out * 100) / 100,
  }))

  // The pool ledger's latest lines, each signed and labelled.
  const lines: PoolLine[] = ledgerLines.map((l) => {
    const dr = Number(l.debit ?? 0)
    const cr = Number(l.credit ?? 0)
    return {
      id: String(l.id),
      date: l.journal_entries.transaction_date.slice(0, 10),
      type: ventureRefLabel(l.journal_entries.reference_type),
      dir: dr > 0 ? 'in' : 'out',
      description: l.description ?? l.journal_entries.description ?? '—',
      amount: dr > 0 ? dr : -cr,
    }
  })

  // On the sheet (2026-10-09, the user's Claude Design handoff): Export in
  // the head, four cards, In vs Out (the month's pie, twelve months of
  // bars), then the pool ledger.
  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> DEPARTMENTS · VENTURE POOL · {dayjs(period).format('MMMM YYYY').toUpperCase()}
          </div>
          <h1 className="page-title">Venture Pool</h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {/* The whole ledger as a spreadsheet, oldest first with the running balance. */}
          <a href="/venture-pool/export" className="btn-quiet-sheet" download>
            Export
          </a>
        </div>
      </div>

      <StatCards label="Venture Pool">
        <StatCard label="In this month" value={formatMoney(monthIn)} icon="inbox" tone="ledger" note="Cash in: debits on HL/Alliance" />
        <StatCard label="Out this month" value={formatMoney(-monthOut)} icon="send" tone="danger" note="Cash out: credits on HL/Alliance" />
        <StatCard label="Net change" value={formatMoney(netChange)} icon="swap" tone={netChange >= 0 ? 'ledger' : 'danger'} note="This month" />
        <StatCard
          label="Running balance"
          value={formatMoney(balance)}
          icon="bank"
          tone={balance < 0 ? 'danger' : 'primary'}
          note="All-time, see ledger below"
        />
      </StatCards>

      <section className="mb-10">
        <div className="sect-head">
          <h2>In vs Out</h2>
          <span className="rule" aria-hidden />
          <span className="count">THIS MONTH · 12 MONTHS</span>
        </div>
        <InOutCharts monthIn={monthIn} monthOut={monthOut} trend={trend} />
      </section>

      <section className="mb-6">
        <div className="sect-head">
          <h2>Pool ledger</h2>
          <span className="rule" aria-hidden />
          <span className="count">{lines.length} ENTRIES · LATEST FIRST</span>
        </div>
        {lines.length === 0 ? (
          <div className="border border-hairline rounded-card bg-surface-2 p-6 text-center">
            <p className="text-sm">No movements yet.</p>
          </div>
        ) : (
          <PoolLedgerTable lines={lines} canSetDefault={canDo(user, 'treasury', 'create')} />
        )}
        <p className="text-xs text-graphite mt-3">
          The latest 50 lines, from the journal lines (corporate and treasury segments on HV bank accounts, reversal pairs left out).
          Export has every line with the running balance.
        </p>
      </section>
    </div>
  )
}
