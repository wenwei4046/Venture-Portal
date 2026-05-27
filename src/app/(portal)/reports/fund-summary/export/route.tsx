import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { exportXlsxResponse, exportPdfResponse } from '@/lib/export/response'
import { buildFundSummaryXlsx } from './_format/xlsx'
import { FundSummaryPdf } from './_format/pdf'
import dayjs from 'dayjs'

export async function GET(req: Request) {
  await requireRole(['principal', 'finance'])
  const url = new URL(req.url)
  const format = url.searchParams.get('format') === 'pdf' ? 'pdf' : 'xlsx'

  const supabase = await createClient()

  // Resolve cash account codes for the Venture Pool computation (mirrors page.tsx).
  const { data: bankCodesData } = await supabase
    .from('bank_accounts')
    .select('gl_account_code')
    .eq('status', 'active')
  const cashCodes = (bankCodesData ?? [])
    .map((b) => b.gl_account_code as string)
    .filter(Boolean)

  // Replicate the data fetch from fund-summary/page.tsx
  const [
    { data: fundSources },
    { data: loans },
    { data: corpBankLines },
    { data: invoicePoolTxns },
    { data: deptPoolTxns },
  ] = await Promise.all([
    supabase.from('fund_sources').select('*').eq('status', 'active').order('effective_date'),
    supabase.from('loans').select('principal, status').eq('status', 'active'),
    // Venture Pool: corporate-segment journal_lines on HV bank accounts
    // (matches /dept-pool Venture row + dashboard hv_fund_balance per mig 272).
    cashCodes.length > 0
      ? supabase
          .from('journal_lines')
          .select('debit, credit, journal_entries!inner(segment)')
          .in('account_code', cashCodes)
          .in('journal_entries.segment', ['corporate', 'treasury'])
      : Promise.resolve({ data: [] }),
    supabase.from('invoice_payout_pool').select('transaction_type, amount'),
    supabase.from('dept_pools').select('transaction_type, amount'),
  ])

  // Calculate totals (matching page.tsx logic)
  const totalPaid = (fundSources ?? []).reduce((s, f) => s + Number(f.amount), 0)
  const weightedCost =
    totalPaid > 0
      ? (fundSources ?? []).reduce((s, f) => s + Number(f.amount) * Number(f.cost_rate), 0) / totalPaid
      : 0

  // Venture Pool balance = Σ (debit − credit) on bank accounts tagged corporate.
  let hvFundBalance = 0
  for (const l of corpBankLines ?? []) {
    hvFundBalance += Number(l.debit ?? 0) - Number(l.credit ?? 0)
  }

  let deptPoolBalance = 0
  for (const t of deptPoolTxns ?? []) {
    deptPoolBalance += t.transaction_type === 'np_in' ? Number(t.amount) : -Number(t.amount)
  }

  let invoicePoolBalance = 0
  for (const t of invoicePoolTxns ?? []) {
    invoicePoolBalance += t.transaction_type === 'accumulate' ? Number(t.amount) : -Number(t.amount)
  }

  const loansOutstanding = (loans ?? []).reduce((s, l) => s + Number(l.principal), 0)

  const data = {
    fundSources: fundSources ?? [],
    totalPaid,
    weightedCost,
    hvFundBalance,
    deptPoolBalance,
    loansOutstanding,
    invoicePoolBalance,
  }

  const filename = `fund-summary-${dayjs().format('YYYYMMDD')}`
  if (format === 'xlsx') {
    return exportXlsxResponse({ filename, buffer: buildFundSummaryXlsx(data) })
  }
  return exportPdfResponse({ filename, element: <FundSummaryPdf data={data} /> })
}
