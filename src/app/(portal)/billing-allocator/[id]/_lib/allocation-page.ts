import dayjs from 'dayjs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { officeTime } from '@/lib/office-time'
import { allocationChangeLine } from '@/lib/allocator-sheet'
import type { AuditChange } from '@/lib/audit/changes'
import type { PageAllocation } from '../_components/AllocationPage'

// An allocation's own page, read (2026-10-15 — moved out of
// `/billing-allocator/[id]/page.tsx` word for word, so the Finance phone app's
// record reads the same): the record and its lines, its category, the live
// invoices of the batch that billed it, who made it, and its audit log
// (`audit_changes()`, what the reader's permissions open).

/** The allocation, or null when the reader may not see it (or it is not there). `supabase`: the untyped client. */
export async function loadAllocationPage(supabase: SupabaseClient, id: string): Promise<PageAllocation | null> {
  const { data: txn, error } = await supabase
    .from('alloc_txns')
    .select('id, txn_no, period_month, description, amount, method, category_id, hc_period, billed_ref, created_by, created_at, alloc_txn_details(company_id, department_id, method_detail, amount, is_own_share)')
    .eq('id', id)
    .single()
  if (error || !txn) return null

  const billedRef = (txn.billed_ref as string | null) ?? null
  const createdBy = (txn.created_by as string | null) ?? null
  const [{ data: cos }, { data: depts }, { data: cat }, { data: batch }, { data: who }, audit] = await Promise.all([
    supabase.from('companies').select('id, short_code, name'),
    supabase.from('departments').select('id, name'),
    txn.category_id
      ? supabase.from('alloc_categories').select('name, coa_code').eq('id', txn.category_id).maybeSingle()
      : Promise.resolve({ data: null as { name: string; coa_code: string | null } | null }),
    // The batch that billed it — its live invoices. Voided ones (2026-09-15)
    // neither lock the allocation nor count.
    billedRef
      ? supabase
          .from('invoices')
          .select('id, invoice_no, company_id, billable_to_department_id, status')
          .eq('reference_no', billedRef)
          .neq('status', 'voided')
          .order('invoice_no')
      : Promise.resolve({ data: [] as unknown[] }),
    createdBy ? supabase.from('users').select('name').eq('id', createdBy).maybeSingle() : Promise.resolve({ data: null as { name: string } | null }),
    supabase.rpc('audit_changes', { p_tables: ['alloc_txns'], p_row: id, p_limit: 60 }).then((r) => r),
  ])

  const coLabel = new Map(((cos ?? []) as Array<{ id: string; short_code: string | null; name: string }>).map((c) => [c.id, c.short_code ?? c.name]))
  const deptName = new Map(((depts ?? []) as Array<{ id: string; name: string }>).map((d) => [d.id, d.name]))
  const labelOf = (companyId: string | null, departmentId: string | null): string =>
    companyId ? coLabel.get(companyId) ?? '?' : departmentId ? deptName.get(departmentId) ?? '?' : 'HV own (not billed)'

  const invoices = ((batch ?? []) as Array<{ id: string; invoice_no: string | null; company_id: string | null; billable_to_department_id: string | null; status: string }>).map((i) => ({
    id: i.id,
    no: i.invoice_no ?? '—',
    billTo: labelOf(i.company_id, i.billable_to_department_id),
    targetKey: i.company_id ?? (i.billable_to_department_id ? `dept:${i.billable_to_department_id}` : ''),
    status: i.status,
  }))
  const category = cat as { name: string; coa_code: string | null } | null
  const changes = (audit.error ? [] : ((audit.data ?? []) as unknown as AuditChange[]))
    .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : a.occurred_at > b.occurred_at ? -1 : b.id - a.id))
    .map((c) => ({
      at: officeTime(c.occurred_at).format('DD MMM YYYY · HH:mm'),
      who: c.actor_name ?? (c.actor_id ? 'Removed account' : 'System'),
      what: allocationChangeLine(c),
    }))

  return {
    id: txn.id as string,
    no: txn.txn_no as string,
    period: dayjs(txn.period_month as string).format('YYYY-MM'),
    description: txn.description as string,
    amount: Number(txn.amount),
    method: txn.method as string,
    category: category ? (category.coa_code ? `${category.coa_code} · ${category.name}` : category.name) : null,
    hcPeriod: txn.hc_period ? dayjs(txn.hc_period as string).format('YYYY-MM') : null,
    billedRef,
    // Billed while its batch still has live invoices — the list's lock rule.
    billed: !!billedRef && invoices.length > 0,
    createdAt: (txn.created_at as string | null) ?? null,
    createdBy: (who as { name: string } | null)?.name ?? null,
    lines: ((txn.alloc_txn_details ?? []) as Array<{ company_id: string | null; department_id: string | null; method_detail: string; amount: number | string; is_own_share: boolean }>)
      .map((d) => {
        const own = d.is_own_share || (!d.company_id && !d.department_id)
        return {
          own,
          label: own ? 'HV own (not billed)' : labelOf(d.company_id, d.department_id),
          targetKey: d.company_id ?? (d.department_id ? `dept:${d.department_id}` : ''),
          detail: d.method_detail,
          amount: Number(d.amount),
        }
      })
      // Largest share first, HV's own share at the end.
      .sort((a, b) => Number(a.own) - Number(b.own) || b.amount - a.amount || a.label.localeCompare(b.label)),
    invoices,
    audit: changes,
  }
}
