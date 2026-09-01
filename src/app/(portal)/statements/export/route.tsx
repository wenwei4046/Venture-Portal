import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { exportXlsxResponse, exportPdfResponse } from '@/lib/export/response'
import { buildInvoicesXlsx } from './_format/xlsx'
import { InvoicesPdf } from './_format/pdf'
import dayjs from 'dayjs'

interface Invoice {
  id: string
  invoice_no: string | null
  company_id: string | null
  period_month: string
  billing_mode: string
  total_amount: number
  status: string
  billable_to_type?: 'subsidiary' | 'director' | 'dept_pool' | 'freetext' | null
  billable_to_department_id?: string | null
  billable_to_freetext_name?: string | null
  due_date?: string | null
}

interface InvoiceRow {
  invoice_no: string
  company: string
  mode: string
  amount: number
  status: string
  due_date: string
}

function formatBillingMode(mode: string): string {
  switch (mode) {
    case 'marketing_project':
      return 'Marketing project'
    case 'director_office_attribution':
      return 'Director Office OPEX'
    case 'director_attribution':
      return 'Director OPEX'
    case 'hr_attribution':
      return 'HR OPEX'
    case 'finance_attribution':
      return 'Finance OPEX'
    case 'non_billable':
      return 'Non-billable'
    default:
      return mode
  }
}

export async function GET(req: Request) {
  await requirePermission('treasury')
  const url = new URL(req.url)
  const format = url.searchParams.get('format') === 'pdf' ? 'pdf' : 'xlsx'
  const period = url.searchParams.get('period') ?? dayjs().format('YYYY-MM')

  if (!/^\d{4}-\d{2}$/.test(period)) {
    return Response.json({ error: 'invalid period format (YYYY-MM)' }, { status: 400 })
  }

  const supabase = await createClient()

  // Replicate the page's invoice fetch — see BillingView.tsx for the canonical query.
  const periodStart = `${period}-01`
  const { data: invoices } = await supabase
    .from('invoices')
    .select(
      'id, invoice_no, company_id, period_month, billing_mode, total_amount, status, billable_to_type, billable_to_department_id, billable_to_freetext_name, due_date',
    )
    .eq('period_month', periodStart)
    .order('invoice_no', { ascending: false })

  // Fetch companies for name/code mapping
  const { data: companies } = await supabase
    .from('companies')
    .select('id, name, short_code')
    .eq('is_active', true)

  // Fetch departments for dept_pool mapping. is_internal=false excludes the
  // 'Venture Office' pseudo-dept (never a statement counterparty).
  const { data: departments } = await supabase
    .from('departments')
    .select('id, name')
    .eq('is_internal', false)

  const companyMap = new Map(
    (companies ?? []).map((c) => [c.id, { name: c.name as string, code: c.short_code as string }]),
  )
  const departmentMap = new Map<string, string>(
    (departments ?? []).map((d) => [d.id as string, d.name as string]),
  )

  // Transform invoices to row format with company names resolved
  const rows: InvoiceRow[] = (invoices ?? []).map((inv: Invoice) => {
    let company = '—'

    if (inv.company_id) {
      const c = companyMap.get(inv.company_id)
      company = c ? `${c.code} - ${c.name}` : '—'
    } else if (inv.billable_to_type === 'dept_pool' && inv.billable_to_department_id) {
      company = `${departmentMap.get(inv.billable_to_department_id) ?? '—'} (Dept pool)`
    } else if (inv.billable_to_freetext_name) {
      company = inv.billable_to_freetext_name
    }

    const dueDate = inv.due_date ? dayjs(inv.due_date).format('DD/MM/YYYY') : '—'

    return {
      invoice_no: inv.invoice_no ?? inv.id.slice(0, 8),
      company,
      mode: formatBillingMode(inv.billing_mode),
      amount: Number(inv.total_amount),
      status: inv.status ?? 'draft',
      due_date: dueDate,
    }
  })

  const filename = `invoices-${period.replace('-', '')}`
  const periodLabel = dayjs(periodStart).format('MMMM YYYY')

  if (format === 'xlsx') {
    return exportXlsxResponse({ filename, buffer: buildInvoicesXlsx(rows) })
  }
  return exportPdfResponse({ filename, element: <InvoicesPdf rows={rows} periodLabel={periodLabel} /> })
}
