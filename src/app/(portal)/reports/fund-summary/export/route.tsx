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

  // Replicate the data fetch from fund-summary/page.tsx
  const [
    { data: fundSources },
    { data: loans },
    { data: hvFundTxns },
    { data: invoicePoolTxns },
    { data: deptPoolTxns },
  ] = await Promise.all([
    supabase.from('fund_sources').select('*').eq('status', 'active').order('effective_date'),
    supabase.from('loans').select('principal, status').eq('status', 'active'),
    supabase.from('venture_pool').select('transaction_type, amount'),
    supabase.from('invoice_payout_pool').select('transaction_type, amount'),
    supabase.from('dept_pools').select('transaction_type, amount'),
  ])

  // Calculate totals (matching page.tsx logic)
  const totalPaid = (fundSources ?? []).reduce((s, f) => s + Number(f.amount), 0)
  const weightedCost =
    totalPaid > 0
      ? (fundSources ?? []).reduce((s, f) => s + Number(f.amount) * Number(f.cost_rate), 0) / totalPaid
      : 0

  let hvFundBalance = 0
  for (const t of hvFundTxns ?? []) {
    const isIn = ['fund_in', 'loan_repayment_in', 'profit_in'].includes(t.transaction_type)
    hvFundBalance += isIn ? Number(t.amount) : -Number(t.amount)
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
