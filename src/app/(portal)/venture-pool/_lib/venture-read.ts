import dayjs from 'dayjs'
import type { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/paginate'
import { ventureRefLabel } from '@/lib/venture-pool'
import type { TrendMonth } from '../_components/InOutCharts'
import type { PoolLine } from '../_components/PoolLedgerTable'

// What the Venture Pool reads (2026-10-15, lifted out of its page word for
// word so the Finance phone app reads the very same): every corporate /
// treasury journal line on an HV bank account (reversal pairs left out) — the
// running balance, the month's in and out, twelve months of them, and the
// ledger, each line signed and labelled.

type Client = Awaited<ReturnType<typeof createClient>>

export interface VenturePoolRead {
  balance: number
  monthIn: number
  monthOut: number
  netChange: number
  trend: TrendMonth[]
  lines: PoolLine[]
}

/** `period`: the first day of the month on show. */
export async function readVenturePool(supabase: Client, period: string): Promise<VenturePoolRead> {
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
  async function fetchCorpBankLines(opts: { since?: string; until?: string }) {
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
    // Every read MUST paginate or it truncates at PostgREST's 1000-row cap.
    const rows = await fetchAllRows((lo, hi) => base().order('id', { ascending: true }).range(lo, hi))
    return rows as unknown as RawLine[]
  }

  const [allTimeLines, monthLines, trendLines] = await Promise.all([
    fetchCorpBankLines({}),
    fetchCorpBankLines({ since: monthStart, until: nextMonth }),
    fetchCorpBankLines({ since: trendStart }),
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

  // The pool ledger, each line signed and labelled — every line (2026-10-10,
  // the handoff; the table opens latest first and the toolbar searches it).
  const lines: PoolLine[] = allTimeLines.map((l) => {
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


  return { balance, monthIn, monthOut, netChange, trend, lines }
}
