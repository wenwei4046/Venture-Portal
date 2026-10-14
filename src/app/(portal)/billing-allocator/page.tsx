import dayjs from 'dayjs'
import { officeMonth } from '@/lib/office-time'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requirePermission, requirePage } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { fetchAllRows, fetchAllRowsAsWritten } from '@/lib/paginate'
import AllocatorHub, { type AllocatorCard } from './_components/AllocatorHub'
import type {
  AllocatorData, CoOpt, StaffRow, CategoryRow, TemplateRow, TxnRow, AllocInvoiceRow,
} from './_components/types'

// Inter-company Billing Allocator (port of the user's Apps Script tool).
// HV pays a shared expense → allocate to subsidiaries by headcount /
// percentage / equal / custom → save → raise one DRAFT invoice per company
// through the same path as manual multi-line invoices.
//
// 2026-10-14 — the Finance revamp v2 (D11): the design's hub for every reader
// of it (AllocatorHub) — Records, By company, Staff, Setup as cards beside
// the list, a record in the drawer, + New allocation in the drawer too.

interface Props {
  /** `edit` — a record's own page sent it back to be corrected (2026-10-09);
   *  `card` — the list on show (records, company, staff, setup). */
  searchParams: Promise<{ period?: string; edit?: string; card?: string }>
}

const CARDS: ReadonlyArray<AllocatorCard> = ['records', 'company', 'staff', 'setup']

export default async function BillingAllocatorPage({ searchParams }: Props) {
  await requirePage('/billing-allocator')
  const user = await requirePermission('billing')
  // alloc_* tables aren't in the generated database.types yet — untyped client,
  // same convention as lib/cfo-reports.ts; shapes narrowed manually below.
  const supabase = (await createClient()) as unknown as SupabaseClient

  const sp = await searchParams
  const period = /^\d{4}-\d{2}$/.test(sp.period ?? '') ? sp.period! : officeMonth()
  const pd = `${period}-01`
  const ref = `ALC-${period.replace('-', '')}`

  const [
    { data: cos },
    { data: depts },
    { data: staff },
    { data: splits },
    { data: snapshots },
    { data: cats },
    { data: templates },
    { data: templateSplits },
    { data: txns },
    { data: allocInvoices },
    { data: hrMonths },
    { data: coSettings },
    { data: coaRows },
  ] = await Promise.all([
    supabase.from('companies').select('id, short_code, name').eq('is_active', true).order('name'),
    supabase.from('departments').select('id, name').order('name'),
    supabase.from('alloc_staff').select('id, name, status, department, created_at').order('created_at', { ascending: false }),
    supabase.from('alloc_staff_splits').select('staff_id, company_id, department_id, pct'),
    // ALL snapshot rows — the Calculate headcount picker offers every saved
    // month (user 2026-08-13: bill one month on another month's list).
    // Every one, in pages once past PostgREST's 1000-row cap (2026-10-08: 310
    // rows, 80–90 more a month): the months past it would vanish from the
    // picker. A month's rows keep the order they always came in while the
    // read fits (fetchAllRowsAsWritten); a failed read still offers none.
    fetchAllRowsAsWritten((page) => {
      const q = supabase
        .from('alloc_staff_history')
        .select('period_month, company_id, department_id, pct, status')
        .order('period_month', { ascending: false })
      return page ? q.order('id', { ascending: true }).range(page.from, page.to) : q
    }).then((data) => ({ data }), () => ({ data: null })),
    supabase.from('alloc_categories').select('id, name, coa_code').order('name'),
    supabase.from('alloc_templates').select('id, name, default_method, default_amount, category_id, status').order('name'),
    supabase.from('alloc_template_splits').select('template_id, company_id, pct'),
    supabase
      .from('alloc_txns')
      .select('id, txn_no, description, amount, method, category_id, hc_period, billed_ref, created_at, alloc_txn_details(company_id, department_id, method_detail, amount, is_own_share)')
      .eq('period_month', pd)
      .order('txn_no'),
    // ALL batches of the month: ALC-YYYYMM, ALC-YYYYMM-2, …
    supabase
      .from('invoices')
      .select('id, invoice_no, company_id, billable_to_department_id, status, reference_no')
      .like('reference_no', `${ref}%`)
      // Voided invoices (2026-09-15) neither lock the allocation nor count as live.
      .neq('status', 'voided'),
    // READ-ONLY peek at HR's allocation months, for the one-click import —
    // every row, paged (2026-10-08: ~25–30 a month; past the 1000-row cap the
    // older months would drop out). Only the distinct months are kept, so the
    // pages' `id` tiebreak changes nothing; a failed read still offers none.
    fetchAllRows((lo, hi) =>
      supabase
        .from('hr_staff_allocation')
        .select('period_month')
        .order('period_month', { ascending: false })
        .order('id', { ascending: true })
        .range(lo, hi),
    ).then((data) => ({ data }), () => ({ data: null })),
    supabase.from('alloc_company_settings').select('company_id, enabled'),
    supabase
      .from('chart_of_accounts')
      .select('code, name, type, parent_code, is_active')
      .eq('is_active', true)
      .order('code'),
  ])

  // Full list drives LABELS (history must keep resolving even after a company
  // is switched off); the enabled subset drives pickers/targets.
  const allCompanies: CoOpt[] = (cos ?? []).map((c) => ({
    id: c.id as string,
    label: (c.short_code ?? c.name) as string,
  }))
  const disabledCos = new Set(
    (coSettings ?? []).filter((s) => s.enabled === false).map((s) => s.company_id as string),
  )
  const companies: CoOpt[] = allCompanies.filter((c) => !disabledCos.has(c.id))
  // Setup's Companies table names each company with its code (2026-10-10, the handoff).
  const companySettings = (cos ?? []).map((c) => ({
    id: c.id as string,
    label: (c.short_code ?? c.name) as string,
    name: c.name as string,
    code: (c.short_code as string | null) ?? '',
    enabled: !disabledCos.has(c.id as string),
  }))
  const departments: CoOpt[] = (depts ?? []).map((d) => ({
    id: `dept:${d.id}`,
    label: `${d.name} (dept)`,
  }))
  const coLabel = new Map(allCompanies.map((c) => [c.id, c.label]))
  const deptLabel = new Map(departments.map((d) => [d.id, d.label]))
  // Target resolution: company uuid / dept:<uuid> / null = HV own.
  const targetIdOf = (companyId: string | null, departmentId: string | null): string | null =>
    companyId ?? (departmentId ? `dept:${departmentId}` : null)
  const labelOf = (targetId: string | null) =>
    targetId === null
      ? 'HOUZS Venture (own)'
      : coLabel.get(targetId) ?? deptLabel.get(targetId) ?? '?'

  const staffRows: StaffRow[] = (staff ?? []).map((s) => ({
    id: s.id as string,
    name: s.name as string,
    status: s.status as 'active' | 'inactive',
    department: (s.department as string | null) ?? '',
    createdAt: (s.created_at as string | null) ?? '',
    splits: (splits ?? [])
      .filter((x) => x.staff_id === s.id)
      .map((x) => {
        const targetId = targetIdOf(
          (x.company_id as string | null),
          (x.department_id as string | null),
        )
        return { targetId, label: labelOf(targetId), pct: Number(x.pct) }
      }),
  }))

  const snapshotRows = (snapshots ?? []) as Array<{
    period_month: string
    company_id: string | null
    department_id: string | null
    pct: number | string
    status: string
  }>
  const snapshotPeriods = Array.from(
    new Set(snapshotRows.map((r) => dayjs(r.period_month).format('YYYY-MM'))),
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

  // A txn is locked while ITS batch still has live invoices.
  const liveRefs = new Set((allocInvoices ?? []).map((i) => i.reference_no as string))

  const txnRows: TxnRow[] = (txns ?? []).map((t) => ({
    id: t.id as string,
    txnNo: t.txn_no as string,
    description: t.description as string,
    billedRef: (t.billed_ref as string | null) ?? null,
    locked: !!t.billed_ref && liveRefs.has(t.billed_ref as string),
    amount: Number(t.amount),
    method: t.method as string,
    categoryId: (t.category_id as string | null) ?? null,
    categoryName: catName.get((t.category_id as string | null) ?? '') ?? '',
    hcPeriod: t.hc_period ? dayjs(t.hc_period as string).format('YYYY-MM') : null,
    createdAt: (t.created_at as string | null) ?? '',
    details: ((t.alloc_txn_details ?? []) as Array<{
      company_id: string | null; department_id: string | null
      method_detail: string; amount: number | string; is_own_share: boolean
    }>)
      .map((d) => {
        const targetId = targetIdOf(d.company_id, d.department_id)
        return {
          companyId: targetId,
          companyLabel: labelOf(targetId),
          detail: d.method_detail,
          amount: Number(d.amount),
          isOwnShare: d.is_own_share,
        }
      })
      .sort((a, b) => Number(a.isOwnShare) - Number(b.isOwnShare) || a.companyLabel.localeCompare(b.companyLabel)),
  }))

  const invoiceRows: AllocInvoiceRow[] = (allocInvoices ?? []).map((i) => {
    const targetId = targetIdOf(
      (i.company_id as string | null),
      (i.billable_to_department_id as string | null),
    )
    return {
      id: i.id as string,
      invoiceNo: (i.invoice_no as string | null) ?? '—',
      companyId: targetId ?? '',
      companyLabel: labelOf(targetId),
      status: i.status as string,
      ref: (i.reference_no as string | null) ?? '',
    }
  })

  const hrPeriods = Array.from(
    new Set((hrMonths ?? []).map((r) => dayjs(r.period_month as string).format('YYYY-MM'))),
  )

  const snapshotSplitsByPeriod: Record<string, { targetId: string | null; pct: number }[]> = {}
  for (const r of snapshotRows) {
    if (r.status !== 'active' || !(Number(r.pct) > 0)) continue
    const key = dayjs(r.period_month).format('YYYY-MM')
    const list = snapshotSplitsByPeriod[key] ?? (snapshotSplitsByPeriod[key] = [])
    list.push({ targetId: targetIdOf(r.company_id, r.department_id), pct: Number(r.pct) })
  }

  const data: AllocatorData = {
    period,
    companies,
    companySettings,
    departments,
    staff: staffRows,
    snapshotSplitsByPeriod,
    coaAccounts: (coaRows ?? []).map((a) => ({
      code: a.code as string,
      name: a.name as string,
      type: a.type as AllocatorData['coaAccounts'][number]['type'],
      parent_code: (a.parent_code as string | null) ?? null,
      is_active: Boolean(a.is_active),
    })),
    snapshotPeriods,
    hrPeriods,
    categories,
    templates: templateRows,
    txns: txnRows,
    invoices: invoiceRows,
  }

  // Each button asks what its action asks: + New allocation and Generate
  // invoices Billing · Create, the rest of the allocator's writes Billing ·
  // Edit — on this page's boxes, as requirePage narrowed them.
  return (
    <AllocatorHub
      key={period}
      data={data}
      can={{ create: canDo(user, 'billing', 'create'), edit: canDo(user, 'billing', 'edit') }}
      canSetDefault={canDo(user, 'billing', 'create')}
      thisMonth={officeMonth()}
      initialCard={CARDS.includes(sp.card as AllocatorCard) ? (sp.card as AllocatorCard) : 'records'}
      editId={sp.edit}
    />
  )
}

