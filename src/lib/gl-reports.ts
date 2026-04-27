import { SupabaseClient } from '@supabase/supabase-js'
import dayjs from 'dayjs'

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'
export type GlSegment =
  | 'treasury'
  | 'marketing'
  | 'hr'
  | 'finance'
  | 'director_office'
  | 'corporate'
  | 'unallocated'

export const SEGMENTS: GlSegment[] = [
  'treasury', 'marketing', 'hr', 'finance', 'director_office', 'corporate', 'unallocated',
]

export const SEGMENT_LABEL: Record<GlSegment, string> = {
  treasury: 'Treasury',
  marketing: 'Marketing',
  hr: 'HR',
  finance: 'Finance',
  director_office: 'Director Office',
  corporate: 'Corporate',
  unallocated: 'Unallocated',
}

export interface GlAccountAgg {
  code: string
  name: string
  type: AccountType
  parent_code: string | null
  debit: number
  credit: number
  /** Natural balance: revenue/liability/equity = credit-debit; asset/expense = debit-credit. */
  balance: number
}

export interface GlSegmentAgg {
  segment: GlSegment
  type: AccountType
  account_code: string
  amount: number
}

/** Sum journal_lines for a date range, joined to chart_of_accounts. Excludes reversed entries. */
export async function fetchGlForPeriod(
  supabase: SupabaseClient,
  args: { from?: string; to?: string; asOf?: string; types?: AccountType[] },
): Promise<GlAccountAgg[]> {
  // Pull all journal_lines in window then aggregate in JS — simpler than a
  // raw SQL view, fine for a small ledger.
  let q = supabase
    .from('journal_lines')
    .select(`
      debit,
      credit,
      account_code,
      chart_of_accounts!inner(code, name, type, parent_code, is_active),
      journal_entries!inner(transaction_date, is_reversed)
    `)
    .eq('journal_entries.is_reversed', false)

  if (args.asOf) {
    q = q.lte('journal_entries.transaction_date', args.asOf)
  } else if (args.from && args.to) {
    q = q.gte('journal_entries.transaction_date', args.from)
    q = q.lte('journal_entries.transaction_date', args.to)
  }

  const { data, error } = await q
  if (error) throw new Error(`fetchGlForPeriod: ${error.message}`)

  const byCode = new Map<string, GlAccountAgg>()
  for (const row of (data ?? []) as unknown as RawLineRow[]) {
    const acc = row.chart_of_accounts
    if (!acc) continue
    if (args.types && !args.types.includes(acc.type)) continue
    const k = acc.code
    const existing = byCode.get(k) ?? {
      code: acc.code,
      name: acc.name,
      type: acc.type,
      parent_code: acc.parent_code,
      debit: 0,
      credit: 0,
      balance: 0,
    }
    existing.debit += Number(row.debit ?? 0)
    existing.credit += Number(row.credit ?? 0)
    byCode.set(k, existing)
  }
  for (const agg of byCode.values()) {
    // asset / expense → natural debit; liability / equity / revenue → natural credit
    const isDebitNormal = agg.type === 'asset' || agg.type === 'expense'
    agg.balance = isDebitNormal ? agg.debit - agg.credit : agg.credit - agg.debit
  }
  return Array.from(byCode.values()).sort((a, b) => a.code.localeCompare(b.code))
}

interface RawLineRow {
  debit: number | null
  credit: number | null
  account_code: string
  chart_of_accounts: {
    code: string
    name: string
    type: AccountType
    parent_code: string | null
    is_active: boolean
  } | null
  journal_entries: {
    transaction_date: string
    is_reversed: boolean
  } | null
}

/**
 * For Segment P&L: sum revenue+expense lines per (segment, account_code).
 * Returns array suitable for pivot rendering.
 */
export async function fetchSegmentPnl(
  supabase: SupabaseClient,
  args: { from: string; to: string },
): Promise<GlSegmentAgg[]> {
  const { data, error } = await supabase
    .from('journal_lines')
    .select(`
      debit,
      credit,
      account_code,
      chart_of_accounts!inner(code, name, type),
      journal_entries!inner(transaction_date, is_reversed, segment)
    `)
    .eq('journal_entries.is_reversed', false)
    .gte('journal_entries.transaction_date', args.from)
    .lte('journal_entries.transaction_date', args.to)
    .in('chart_of_accounts.type', ['revenue', 'expense'])

  if (error) throw new Error(`fetchSegmentPnl: ${error.message}`)

  type Row = RawLineRow & { journal_entries: (NonNullable<RawLineRow['journal_entries']> & { segment: GlSegment }) | null }
  const out: GlSegmentAgg[] = []
  for (const row of (data ?? []) as unknown as Row[]) {
    const acc = row.chart_of_accounts
    const ent = row.journal_entries
    if (!acc || !ent) continue
    const debit = Number(row.debit ?? 0)
    const credit = Number(row.credit ?? 0)
    const isDebitNormal = acc.type === 'expense'
    const amount = isDebitNormal ? debit - credit : credit - debit
    if (amount === 0) continue
    out.push({
      segment: ent.segment,
      type: acc.type,
      account_code: acc.code,
      amount,
    })
  }
  return out
}

/** Format a YYYY-MM-DD date as the first day of the month. */
export function startOfMonth(d?: string): string {
  return dayjs(d ?? undefined).startOf('month').format('YYYY-MM-DD')
}
export function endOfMonth(d?: string): string {
  return dayjs(d ?? undefined).endOf('month').format('YYYY-MM-DD')
}
