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
