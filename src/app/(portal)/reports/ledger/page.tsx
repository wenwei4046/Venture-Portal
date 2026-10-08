import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { fetchLedgers, type Ledger } from '@/lib/cfo-reports'
import { type AccountType } from '@/lib/coa'
import LedgerPicker from './_components/LedgerPicker'
import LedgerSections from './_components/LedgerSections'
import dayjs from 'dayjs'
import { officeTime, officeToday } from '@/lib/office-time'
import Link from 'next/link'

interface Props {
  searchParams: Promise<{
    code?: string // legacy single-account param — still honored
    codes?: string // comma-separated multi-account
    from?: string
    to?: string
    showZero?: string
  }>
}

function parseCodes(codes: string | undefined, code: string | undefined): string[] {
  if (codes) {
    return codes
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return code ? [code] : []
}

export default async function LedgerPage({ searchParams }: Props) {
  await requirePermission('reports')
  const supabase = await createClient()

  const params = await searchParams
  const codes = parseCodes(params.codes, params.code)
  // The office's month and day: on the server's own clock (UTC) the 1st was
  // still last month until 08:00 in the office.
  const from = params.from ?? officeTime().startOf('month').format('YYYY-MM-DD')
  const to = params.to ?? officeToday()
  const showZero = params.showZero === '1'

  // Fetch all leaf accounts for the picker (header rows excluded by the
  // existing AccountPicker behavior). The SAME read feeds the ledger body
  // (2026-10-08 — it read the chart again, and only once this one was back),
  // and the body's own reads start now, beside it. Promise.resolve: the query
  // is sent once and awaited twice.
  const coaRead = Promise.resolve(
    supabase
      .from('chart_of_accounts')
      .select('code, name, type, parent_code, is_active')
      .eq('is_active', true)
      .order('code'),
  )
  const ledgersRead = fetchLedgers(supabase, { codes, from, to, coa: coaRead })
  // LedgerBody awaits it — and shows its error — only after this page has
  // rendered; until then a failure must not count as an unhandled rejection.
  ledgersRead.catch(() => {})

  const { data: coaRows } = await coaRead
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
        <div className="flex items-center gap-3">
          <LedgerPicker accounts={accounts} selectedCodes={codes} from={from} to={to} showZero={showZero} />
          {codes.length === 1 ? (
            <>
              <Link
                href={`/reports/ledger/export?format=xlsx&code=${encodeURIComponent(codes[0])}&from=${from}&to=${to}`}
                className="px-3 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors"
              >
                Export Excel
              </Link>
              <Link
                href={`/reports/ledger/export?format=pdf&code=${encodeURIComponent(codes[0])}&from=${from}&to=${to}`}
                className="px-3 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors"
              >
                Export PDF
              </Link>
            </>
          ) : null}
        </div>
      </div>

      <LedgerBody ledgersRead={ledgersRead} codes={codes} from={from} to={to} showZero={showZero} />
    </div>
  )
}

async function LedgerBody({
  ledgersRead, codes, from, to, showZero,
}: {
  /** fetchLedgers, already under way (started by the page). */
  ledgersRead: Promise<Ledger[]>
  codes: string[]
  from: string
  to: string
  showZero: boolean
}) {
  try {
    const ledgers = await ledgersRead
    const visible = showZero
      ? ledgers
      : ledgers.filter(
          (l) =>
            // > 1: every ledger carries a synthetic BALANCE B/F line (see buildLedger), so >1 = real period movement
            l.lines.length > 1 ||
            Math.abs(l.openingBalance) >= 0.005 ||
            Math.abs(l.closingBalance) >= 0.005,
        )

    const periodLabel = `${dayjs(from).format('D MMMM YYYY')} – ${dayjs(to).format('D MMMM YYYY')}`

    if (visible.length === 0) {
      return (
        <p className="font-serif italic text-muted text-sm max-w-3xl mt-6">
          {codes.length === 0 ? (
            <>No accounts have activity in <strong>{periodLabel}</strong>. Toggle <em>Show zero</em> to list every leaf account.</>
          ) : (
            <>No activity for the selected accounts in <strong>{periodLabel}</strong>. Toggle <em>Show zero</em> to keep them visible.</>
          )}
        </p>
      )
    }

    return (
      <div className="mt-2">
        <p className="font-serif italic text-muted text-sm mb-2 max-w-3xl">
          {visible.length} {visible.length === 1 ? 'account' : 'accounts'} &middot; {periodLabel}
          {codes.length === 0 ? ' · all postable leaf accounts' : null}
          {!showZero && ledgers.length > visible.length
            ? ` · hiding ${ledgers.length - visible.length} with no activity`
            : null}
        </p>
        <LedgerSections ledgers={visible} />
      </div>
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
