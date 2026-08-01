import dayjs from 'dayjs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import AllocatorTabs from './_components/AllocatorTabs'
import type {
  AllocatorData, CoOpt, StaffRow, CategoryRow, TemplateRow, TxnRow, AllocInvoiceRow,
} from './_components/types'

// Inter-company Billing Allocator (port of the user's Apps Script tool).
// HV pays a shared expense → allocate to subsidiaries by headcount /
// percentage / equal / custom → save → raise one DRAFT invoice per company
// through the same path as manual multi-line invoices.

interface Props {
  searchParams: Promise<{ period?: string }>
}

export default async function BillingAllocatorPage({ searchParams }: Props) {
  await requireRole(['finance', 'principal'])
  // alloc_* tables aren't in the generated database.types yet — untyped client,
  // same convention as lib/cfo-reports.ts; shapes narrowed manually below.
  const supabase = (await createClient()) as unknown as SupabaseClient

  const sp = await searchParams
  const period = /^\d{4}-\d{2}$/.test(sp.period ?? '') ? sp.period! : dayjs().format('YYYY-MM')
  const pd = `${period}-01`
  const ref = `ALC-${period.replace('-', '')}`

  const [
    { data: cos },
    { data: staff },
    { data: splits },
    { data: snapshots },
    { data: cats },
    { data: templates },
    { data: templateSplits },
    { data: txns },
    { data: allocInvoices },
    { data: hrMonths },
  ] = await Promise.all([
    supabase.from('companies').select('id, short_code, name').eq('is_active', true).order('name'),
    supabase.from('alloc_staff').select('id, name, status').order('name'),
    supabase.from('alloc_staff_splits').select('staff_id, company_id, pct'),
    supabase.from('alloc_staff_history').select('period_month').order('period_month', { ascending: false }),
    supabase.from('alloc_categories').select('id, name, coa_code').order('name'),
    supabase.from('alloc_templates').select('id, name, default_method, default_amount, category_id, status').order('name'),
    supabase.from('alloc_template_splits').select('template_id, company_id, pct'),
    supabase
      .from('alloc_txns')
      .select('id, txn_no, description, amount, method, category_id, hc_period, alloc_txn_details(company_id, method_detail, amount, is_own_share)')
      .eq('period_month', pd)
      .order('txn_no'),
    supabase.from('invoices').select('id, invoice_no, company_id, status').eq('reference_no', ref),
    // READ-ONLY peek at HR's allocation months, for the one-click import.
    supabase.from('hr_staff_allocation').select('period_month').order('period_month', { ascending: false }),
  ])

  const companies: CoOpt[] = (cos ?? []).map((c) => ({
    id: c.id as string,
    label: (c.short_code ?? c.name) as string,
  }))
  const coLabel = new Map(companies.map((c) => [c.id, c.label]))
  const labelOf = (id: string | null) => (id === null ? 'HOUZS Venture (own)' : coLabel.get(id) ?? '?')

  const staffRows: StaffRow[] = (staff ?? []).map((s) => ({
    id: s.id as string,
    name: s.name as string,
    status: s.status as 'active' | 'inactive',
    splits: (splits ?? [])
      .filter((x) => x.staff_id === s.id)
      .map((x) => ({ companyId: (x.company_id as string | null), pct: Number(x.pct) })),
  }))

  const snapshotPeriods = Array.from(
    new Set((snapshots ?? []).map((r) => dayjs(r.period_month as string).format('YYYY-MM'))),
  )

  const categories: CategoryRow[] = (cats ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    coaCode: (c.coa_code as string | null) ?? '',
  }))
  const catName = new Map(categories.map((c) => [c.id, c.name]))

  const templateRows: TemplateRow[] = (templates ?? []).map((t) => ({
    id: t.id as string,
    name: t.name as string,
    method: t.default_method as TemplateRow['method'],
    amount: Number(t.default_amount ?? 0),
    categoryId: (t.category_id as string | null) ?? null,
    status: t.status as string,
    splits: (templateSplits ?? [])
      .filter((x) => x.template_id === t.id)
      .map((x) => ({ companyId: x.company_id as string, pct: Number(x.pct) })),
  }))

  const txnRows: TxnRow[] = (txns ?? []).map((t) => ({
    id: t.id as string,
    txnNo: t.txn_no as string,
    description: t.description as string,
    amount: Number(t.amount),
    method: t.method as string,
    categoryName: catName.get((t.category_id as string | null) ?? '') ?? '',
    hcPeriod: t.hc_period ? dayjs(t.hc_period as string).format('YYYY-MM') : null,
    details: ((t.alloc_txn_details ?? []) as Array<{
      company_id: string | null; method_detail: string; amount: number | string; is_own_share: boolean
    }>)
      .map((d) => ({
        companyId: d.company_id,
        companyLabel: labelOf(d.company_id),
        detail: d.method_detail,
        amount: Number(d.amount),
        isOwnShare: d.is_own_share,
      }))
      .sort((a, b) => Number(a.isOwnShare) - Number(b.isOwnShare) || a.companyLabel.localeCompare(b.companyLabel)),
  }))

  const invoiceRows: AllocInvoiceRow[] = (allocInvoices ?? []).map((i) => ({
    id: i.id as string,
    invoiceNo: (i.invoice_no as string | null) ?? '—',
    companyId: (i.company_id as string | null) ?? '',
    companyLabel: labelOf((i.company_id as string | null) ?? null),
    status: i.status as string,
  }))

  const hrPeriods = Array.from(
    new Set((hrMonths ?? []).map((r) => dayjs(r.period_month as string).format('YYYY-MM'))),
  )

  const data: AllocatorData = {
    period,
    companies,
    staff: staffRows,
    snapshotPeriods,
    hrPeriods,
    categories,
    templates: templateRows,
    txns: txnRows,
    invoices: invoiceRows,
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow"><em>I.</em> TREASURY · BILLING ALLOCATOR</div>
          <h1 className="page-title">Billing Allocator</h1>
        </div>
      </div>
      <p className="font-serif italic text-muted text-sm mb-6 max-w-3xl">
        HV 垫付的共同费用,按 Headcount / Percentage / Equal / Custom 分摊给各子公司。
        算好存档,再一键开成 draft invoice(每家一张,去 Invoice 页复核后 issue)。
        HV 自己的份只显示、不开单。
      </p>
      <AllocatorTabs data={data} />
    </div>
  )
}
