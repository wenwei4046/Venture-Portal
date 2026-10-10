import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { fetchLedgers, type Ledger } from '@/lib/cfo-reports'
import { type AccountType } from '@/lib/coa'
import LedgerPicker from './_components/LedgerPicker'
import LedgerSections from './_components/LedgerSections'
import dayjs from 'dayjs'
import { officeTime, officeToday } from '@/lib/office-time'
import { hasLedgerActivity, ledgerDeptNames, ledgerExportHref, ledgerPeriodLabel } from '@/lib/ledger-view'
import { extraReportSegments, primedRegistryRows } from '@/lib/dept-registry'

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

  // The head per the handoff (2026-10-09): the period in the eyebrow, what the
  // page is, and Select accounts… / Excel / PDF — the exports for whatever is
  // picked, every account with activity when nothing is.
  const exportArgs = { codes, from, to, showZero }
  // The accounts, drawn here (it was a nested async component; the same wait,
  // and a page a test can draw).
  const body = await LedgerBody({ ledgersRead, codes, from, to, showZero })

  return (
    <div>
      <div className="page-head">
        <div className="min-w-0">
          <div className="page-eyebrow">
            <em>I.</em> REPORTS · GENERAL LEDGER · {ledgerPeriodLabel(from, to).toUpperCase()}
          </div>
          <h1 className="page-title">Ledger</h1>
          <p className="page-sub">Per-account journal lines with running balance over a period. Pick accounts, or leave empty for all.</p>
        </div>
        <div className="flex flex-wrap items-start justify-end gap-2">
          <LedgerPicker accounts={accounts} selectedCodes={codes} from={from} to={to} showZero={showZero} />
          <a href={ledgerExportHref('xlsx', exportArgs)} className="btn-quiet-sheet">
            Excel
          </a>
          <a href={ledgerExportHref('pdf', exportArgs)} className="btn-quiet-sheet">
            PDF
          </a>
        </div>
      </div>

      {body}
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
    // Every ledger carries a synthetic BALANCE B/F line (see buildLedger), so
    // more than one line = real movement in the period (lib/ledger-view).
    const visible = showZero ? ledgers : ledgers.filter(hasLedgerActivity)

    const periodLabel = `${dayjs(from).format('D MMMM YYYY')} – ${dayjs(to).format('D MMMM YYYY')}`

    if (visible.length === 0) {
      return (
        <p className="text-sm text-graphite max-w-3xl mt-6">
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
        <p className="text-xs text-graphite mb-3 max-w-3xl">
          {visible.length} {visible.length === 1 ? 'account' : 'accounts'} &middot; {periodLabel}
          {codes.length === 0 ? ' · all postable leaf accounts' : null}
          {!showZero && ledgers.length > visible.length
            ? ` · hiding ${ledgers.length - visible.length} with no activity`
            : null}
        </p>
        {/* IT, Revenue Department …: named from the registry this request primed (no read). */}
        <LedgerSections ledgers={visible} deptNames={ledgerDeptNames(extraReportSegments(primedRegistryRows()))} />
      </div>
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return (
      <div className="sheet-danger mt-8">
        ⚠ {msg}
      </div>
    )
  }
}
