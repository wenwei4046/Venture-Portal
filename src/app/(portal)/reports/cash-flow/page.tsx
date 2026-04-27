import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatMoney } from '@/lib/utils'
import { startOfMonth, endOfMonth, type AccountType } from '@/lib/gl-reports'
import dayjs from 'dayjs'
import Link from 'next/link'

interface Props {
  searchParams: Promise<{ from?: string; to?: string; period?: string }>
}

type CashFlowCategory = 'operating' | 'investing' | 'financing' | 'internal'

interface RawCashLine {
  bank_code: string
  bank_signed: number  // + inflow, − outflow
  counterpart_code: string
  counterpart_name: string
  counterpart_type: AccountType
  description: string
  date: string
  entry_no: string
}

const BANK_CODES = ['1010', '1011']

/**
 * Direct method classification (HV chart of accounts)
 *   Operating  — revenue (4xxx), expense (5xxx), AR (1040), AP (2050, 2060), interest receivable (1050)
 *   Investing  — loans receivable (1020), director advance (1030), other long-term assets
 *   Financing  — fund sources payable (2010), interest payable (2020), salary payable (2030),
 *                statutory payable (2040), equity (3xxx)
 *   Internal   — bank-to-bank transfer (1010 ↔ 1011), excluded from totals
 */
function classify(counterpartCode: string, counterpartType: AccountType): CashFlowCategory {
  if (BANK_CODES.includes(counterpartCode)) return 'internal'

  // Investing: long-term assets
  if (counterpartCode === '1020' || counterpartCode === '1030') return 'investing'

  // Financing: capital sources
  if (counterpartCode === '2010' || counterpartCode === '2020') return 'financing'
  if (counterpartType === 'equity') return 'financing'

  // Operating: revenue, expense, working capital
  if (counterpartType === 'revenue' || counterpartType === 'expense') return 'operating'
  if (counterpartCode === '1040' || counterpartCode === '1050') return 'operating'  // AR / interest receivable
  if (counterpartCode === '2030' || counterpartCode === '2040'
      || counterpartCode === '2050' || counterpartCode === '2060') return 'operating'  // payables (working capital)

  // Default to operating — safest assumption for unknown counterparts
  return 'operating'
}


export default async function CashFlowPage({ searchParams }: Props) {
  await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  const { from: rawFrom, to: rawTo, period } = await searchParams
  const from = rawFrom ?? startOfMonth(period)
  const to = rawTo ?? endOfMonth(period ?? from)

  // Pull every journal_line that touches a bank account in the period.
  const { data: bankLines, error: e1 } = await supabase
    .from('journal_lines')
    .select(`
      id, entry_id, account_code, debit, credit, description,
      journal_entries!inner(entry_no, transaction_date, is_reversed)
    `)
    .in('account_code', BANK_CODES)
    .eq('journal_entries.is_reversed', false)
    .gte('journal_entries.transaction_date', from)
    .lte('journal_entries.transaction_date', to)

  if (e1) throw new Error(`cash-flow bank lines: ${e1.message}`)

  // Pull all lines for those journal_entries to find the counterpart side.
  const entryIds = Array.from(new Set((bankLines ?? []).map((l: { entry_id: string }) => l.entry_id)))
  const { data: allLines, error: e2 } = entryIds.length
    ? await supabase
        .from('journal_lines')
        .select(`
          entry_id, account_code, debit, credit, description,
          chart_of_accounts!inner(code, name, type)
        `)
        .in('entry_id', entryIds)
    : { data: [], error: null }

  if (e2) throw new Error(`cash-flow non-bank lines: ${e2.message}`)

  // Group all lines by entry_id
  type AnyLine = {
    entry_id: string; account_code: string; debit: number | null; credit: number | null;
    description: string | null;
    chart_of_accounts: { code: string; name: string; type: AccountType } | null
  }
  const byEntry = new Map<string, AnyLine[]>()
  for (const l of (allLines ?? []) as unknown as AnyLine[]) {
    const arr = byEntry.get(l.entry_id) ?? []
    arr.push(l)
    byEntry.set(l.entry_id, arr)
  }

  // Build cash flow lines: split each bank line proportionally across non-bank
  // counterparts in the same entry.
  type BankLineRow = {
    entry_id: string; account_code: string; debit: number | null; credit: number | null;
    description: string | null;
    journal_entries: { entry_no: string; transaction_date: string }
  }
  const flowLines: RawCashLine[] = []
  for (const bl of (bankLines ?? []) as unknown as BankLineRow[]) {
    const debit = Number(bl.debit ?? 0)
    const credit = Number(bl.credit ?? 0)
    const bankSigned = debit - credit  // + inflow / − outflow
    if (bankSigned === 0) continue

    const peers = (byEntry.get(bl.entry_id) ?? []).filter((l) => !BANK_CODES.includes(l.account_code))
    if (peers.length === 0) continue

    // Total non-bank amount on the OPPOSITE side. If bank was debited (cash in),
    // the offset is in the credit column on non-bank lines, and vice-versa.
    const opposite = peers.map((p) => {
      const pd = Number(p.debit ?? 0)
      const pc = Number(p.credit ?? 0)
      const oppositeAmt = bankSigned > 0 ? pc : pd
      return { p, oppositeAmt }
    }).filter((x) => x.oppositeAmt > 0)

    const totalOpp = opposite.reduce((s, x) => s + x.oppositeAmt, 0)
    if (totalOpp === 0) {
      // Edge case: peers don't have an opposite — fall back to first peer
      const first = peers[0]
      if (first?.chart_of_accounts) {
        flowLines.push({
          bank_code: bl.account_code,
          bank_signed: bankSigned,
          counterpart_code: first.chart_of_accounts.code,
          counterpart_name: first.chart_of_accounts.name,
          counterpart_type: first.chart_of_accounts.type,
          description: bl.description ?? '',
          date: bl.journal_entries.transaction_date,
          entry_no: bl.journal_entries.entry_no,
        })
      }
      continue
    }
    for (const { p, oppositeAmt } of opposite) {
      if (!p.chart_of_accounts) continue
      const share = (oppositeAmt / totalOpp) * bankSigned
      flowLines.push({
        bank_code: bl.account_code,
        bank_signed: share,
        counterpart_code: p.chart_of_accounts.code,
        counterpart_name: p.chart_of_accounts.name,
        counterpart_type: p.chart_of_accounts.type,
        description: bl.description ?? '',
        date: bl.journal_entries.transaction_date,
        entry_no: bl.journal_entries.entry_no,
      })
    }
  }

  // Aggregate by category + counterpart account for display
  type Bucket = { code: string; name: string; type: AccountType; net: number }
  const byCategory = new Map<CashFlowCategory, Map<string, Bucket>>()
  for (const cat of ['operating', 'investing', 'financing', 'internal'] as CashFlowCategory[]) {
    byCategory.set(cat, new Map())
  }
  for (const f of flowLines) {
    const cat = classify(f.counterpart_code, f.counterpart_type)
    const bucket = byCategory.get(cat)!
    const existing = bucket.get(f.counterpart_code) ?? {
      code: f.counterpart_code, name: f.counterpart_name, type: f.counterpart_type, net: 0,
    }
    existing.net += f.bank_signed
    bucket.set(f.counterpart_code, existing)
  }

  function categoryTotal(cat: CashFlowCategory): number {
    return Array.from(byCategory.get(cat)!.values()).reduce((s, b) => s + b.net, 0)
  }
  const operatingNet = categoryTotal('operating')
  const investingNet = categoryTotal('investing')
  const financingNet = categoryTotal('financing')
  // internal transfers excluded from net change

  const netChange = operatingNet + investingNet + financingNet

  // Beginning + ending cash (from bank balances)
  // Beginning = cash position as of (from − 1 day); ending = at to.
  const [{ data: openingLines }, { data: closingLines }] = await Promise.all([
    supabase
      .from('journal_lines')
      .select(`debit, credit, journal_entries!inner(transaction_date, is_reversed)`)
      .in('account_code', BANK_CODES)
      .eq('journal_entries.is_reversed', false)
      .lt('journal_entries.transaction_date', from),
    supabase
      .from('journal_lines')
      .select(`debit, credit, journal_entries!inner(transaction_date, is_reversed)`)
      .in('account_code', BANK_CODES)
      .eq('journal_entries.is_reversed', false)
      .lte('journal_entries.transaction_date', to),
  ])
  const beginCash = (openingLines ?? []).reduce(
    (s: number, l: { debit: number | null; credit: number | null }) => s + Number(l.debit ?? 0) - Number(l.credit ?? 0),
    0,
  )
  const endCash = (closingLines ?? []).reduce(
    (s: number, l: { debit: number | null; credit: number | null }) => s + Number(l.debit ?? 0) - Number(l.credit ?? 0),
    0,
  )
  const reconcileDiff = (beginCash + netChange) - endCash
  const reconciles = Math.abs(reconcileDiff) < 0.01

  const periodLabel = formatPeriodLabel(from, to)

  return (
    <div>
      <Link href="/reports" className="text-sm text-muted hover:text-accent font-sans transition-colors">
        ← Back to Reports
      </Link>

      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> REPORTS · CASH FLOW · {periodLabel.toUpperCase()}
          </div>
          <h1 className="page-title">Cash Flow Statement</h1>
        </div>
        <form className="shrink-0">
          <input
            type="month"
            name="period"
            defaultValue={dayjs(from).format('YYYY-MM')}
            className="px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border"
          />
        </form>
      </div>

      <p className="font-serif italic text-muted text-sm mb-6 max-w-3xl">
        Direct method. Each cash movement is classified by its counterpart account
        (Operating / Investing / Financing). Internal bank-to-bank transfers excluded.
      </p>

      <div className="max-w-3xl space-y-10">
        <CashFlowSection title="Operating activities" buckets={byCategory.get('operating')!} total={operatingNet} />
        <CashFlowSection title="Investing activities" buckets={byCategory.get('investing')!} total={investingNet} />
        <CashFlowSection title="Financing activities" buckets={byCategory.get('financing')!} total={financingNet} />

        {/* Net change */}
        <div className="border-t-2 border-hairline pt-6">
          <div className="flex items-baseline justify-between mb-2">
            <span className="font-serif text-lg text-ink">Net change in cash</span>
            <span className={`font-serif text-lg font-semibold tabular ${netChange >= 0 ? 'text-ledger' : 'text-danger'}`}>
              {formatMoney(netChange)}
            </span>
          </div>
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-serif italic text-graphite">Cash at beginning</span>
            <span className="num text-graphite">{formatMoney(beginCash)}</span>
          </div>
          <div className="flex items-baseline justify-between text-sm pt-1">
            <span className="font-serif italic text-graphite">+ Net change</span>
            <span className={`num ${netChange >= 0 ? 'text-ledger' : 'text-danger'}`}>{formatMoney(netChange)}</span>
          </div>
          <div className="flex items-baseline justify-between pt-3 border-t border-hairline mt-2">
            <span className="font-serif italic text-base text-ink font-medium">Cash at end</span>
            <span className="num text-num-ink text-lg font-semibold">{formatMoney(beginCash + netChange)}</span>
          </div>
        </div>

        {/* Reconciliation */}
        <div className="border border-hairline rounded-md bg-surface p-5">
          <h3 className="font-sans text-xs uppercase tracking-wide text-ledger font-semibold mb-3">
            Reconciliation
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-baseline justify-between">
              <span className="font-serif text-graphite">Computed ending cash (begin + net change)</span>
              <span className="num">{formatMoney(beginCash + netChange)}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="font-serif text-graphite">Ending cash from GL (1010 + 1011 cumulative)</span>
              <span className="num">{formatMoney(endCash)}</span>
            </div>
            <div className="flex items-baseline justify-between pt-2 border-t border-hairline">
              <span className="font-serif italic font-medium text-ink">Difference</span>
              <span className={`num font-semibold ${reconciles ? 'text-ledger' : 'text-danger'}`}>
                {formatMoney(reconcileDiff)} {reconciles ? '✓' : '⚠'}
              </span>
            </div>
          </div>
          {!reconciles ? (
            <p className="font-serif italic text-danger text-xs mt-3">
              Cash flow does not reconcile — typically because a JE touched only the
              bank with no clear counterpart, or non-bank lines lacked an opposite-side amount.
            </p>
          ) : (
            <p className="font-serif italic text-muted text-xs mt-3">
              Cash flow ties to GL bank balances ✓.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function CashFlowSection({
  title, buckets, total,
}: {
  title: string
  buckets: Map<string, { code: string; name: string; type: AccountType; net: number }>
  total: number
}) {
  const items = Array.from(buckets.values()).filter((b) => Math.abs(b.net) > 0.005).sort((a, b) => a.code.localeCompare(b.code))
  return (
    <section>
      <h2 className="font-sans text-xs uppercase tracking-wide text-ledger font-semibold mb-3">{title}</h2>
      {items.length === 0 ? (
        <p className="font-serif italic text-muted text-sm">No cash activity in this category.</p>
      ) : (
        <table className="ledger-table">
          <tbody>
            {items.map((b) => (
              <tr key={b.code}>
                <td className="font-mono text-xs text-graphite w-20">{b.code}</td>
                <td>{CATEGORY_LABEL_FOR(b.code, b.name)}</td>
                <td className="num">
                  {b.net >= 0 ? formatMoney(b.net) : <span className="neg">{formatMoney(b.net)}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="flex items-baseline justify-between pt-3 mt-3 border-t border-hairline">
        <span className="font-serif italic text-base text-ink font-medium">Net {title.toLowerCase()}</span>
        <span className={`num text-lg font-semibold ${total >= 0 ? 'text-ledger' : 'text-danger'}`}>
          {formatMoney(total)}
        </span>
      </div>
    </section>
  )
}

function CATEGORY_LABEL_FOR(code: string, fallback: string): string {
  const friendly: Record<string, string> = {
    '4010': 'Cash from interest income',
    '4020': 'Cash from penalty income',
    '4030': 'Cash from service billing',
    '4040': 'Cash from marketing revenue',
    '5010': 'Cash paid for interest',
    '5020': 'Cash paid for HR staff',
    '5030': 'Cash paid for finance staff',
    '5040': 'Cash paid for marketing',
    '5050': 'Cash paid for general & admin',
    '5060': 'Cash paid for claims',
    '5070': 'Cash paid for SST',
    '1020': 'Loans disbursed (net of repayments)',
    '1030': 'Director advances (net of repayments)',
    '1040': 'Cash collected from receivables',
    '2010': 'Fund sources received (net of repayments)',
    '2030': 'Salaries paid',
    '2050': 'Invoice payable settled',
    '2060': 'AP general settled',
    '3010': 'HV operating fund flow',
  }
  return friendly[code] ?? fallback
}

function formatPeriodLabel(from: string, to: string): string {
  const dFrom = dayjs(from)
  const dTo = dayjs(to)
  const wholeMonth = dFrom.startOf('month').isSame(dFrom, 'day')
                     && dTo.endOf('month').isSame(dTo, 'day')
                     && dFrom.isSame(dTo, 'month')
  if (wholeMonth) return dFrom.format('MMMM YYYY')
  return `${dFrom.format('D MMM')} → ${dTo.format('D MMM YYYY')}`
}
