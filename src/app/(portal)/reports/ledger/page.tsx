import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { fetchLedgers } from '@/lib/cfo-reports'
import { type AccountType } from '@/lib/coa'
import LedgerPicker from './_components/LedgerPicker'
import LedgerSections from './_components/LedgerSections'
import dayjs from 'dayjs'
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
  await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  const params = await searchParams
  const codes = parseCodes(params.codes, params.code)
  const from = params.from ?? dayjs().startOf('month').format('YYYY-MM-DD')
  const to = params.to ?? dayjs().format('YYYY-MM-DD')
  const showZero = params.showZero === '1'

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

      <LedgerBody codes={codes} from={from} to={to} showZero={showZero} supabase={supabase} />
    </div>
  )
}

async function LedgerBody({
  codes, from, to, showZero, supabase,
}: {
  codes: string[]
  from: string
  to: string
  showZero: boolean
  supabase: Awaited<ReturnType<typeof createClient>>
}) {
  try {
    const ledgers = await fetchLedgers(supabase, { codes, from, to })
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
