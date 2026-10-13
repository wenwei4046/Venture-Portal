import { createClient } from '@/lib/supabase/server'
import { requireActionOn } from '@/lib/auth'
import { listsPayrollByPerson } from '@/lib/roles'
import { fetchLedger, fetchLedgers } from '@/lib/cfo-reports'
import { exportXlsxResponse, exportPdfResponse } from '@/lib/export/response'
import { buildLedgerXlsx, buildLedgersXlsx } from './_format/xlsx'
import { LedgerPdf, LedgersPdf } from './_format/pdf'
import { hasLedgerActivity } from '@/lib/ledger-view'
import { officeTime, officeToday } from '@/lib/office-time'

export async function GET(req: Request) {
  const user = await requireActionOn('/reports/ledger', 'reports', 'export')
  // Salary lines as the page lists them: by department for whoever reads payroll that way (2026-10-13).
  const payrollByPerson = listsPayrollByPerson(user)
  const url = new URL(req.url)
  const format = url.searchParams.get('format') === 'pdf' ? 'pdf' : 'xlsx'
  const code = url.searchParams.get('code')
  const from = url.searchParams.get('from') ?? officeTime().startOf('month').format('YYYY-MM-DD')
  const to = url.searchParams.get('to') ?? officeToday()

  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return Response.json({ error: 'invalid from/to date' }, { status: 400 })
  }

  const supabase = await createClient()

  // Several accounts, or every account with activity (2026-10-09, the Finance
  // revamp: the Ledger's Excel / PDF export whatever is picked, as the page
  // lists it — ?showZero=1 keeps the accounts with nothing in the period).
  const codesParam = url.searchParams.get('codes')
  if (codesParam !== null || !code) {
    const codes = (codesParam ?? '').split(',').map((c) => c.trim()).filter(Boolean)
    const showZero = url.searchParams.get('showZero') === '1'
    let ledgers
    try {
      ledgers = await fetchLedgers(supabase, { codes, from, to, payrollByPerson })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown error'
      return Response.json({ error: msg }, { status: 400 })
    }
    const listed = showZero ? ledgers : ledgers.filter(hasLedgerActivity)
    const which = codes.length === 0 ? 'all' : codes.length <= 4 ? codes.join('_') : `${codes.length}-accounts`
    const name = `ledger-${which}-${from}-${to}`
    if (format === 'xlsx') return exportXlsxResponse({ filename: name, buffer: buildLedgersXlsx(listed) })
    return await exportPdfResponse({ filename: name, element: <LedgersPdf ledgers={listed} from={from} to={to} /> })
  }
  let led
  try {
    led = await fetchLedger(supabase, { code, from, to, payrollByPerson })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    return Response.json({ error: msg }, { status: 400 })
  }

  const filename = `ledger-${code}-${from}-${to}`
  if (format === 'xlsx') {
    return exportXlsxResponse({ filename, buffer: buildLedgerXlsx(led) })
  }
  return await exportPdfResponse({ filename, element: <LedgerPdf led={led} /> })
}
