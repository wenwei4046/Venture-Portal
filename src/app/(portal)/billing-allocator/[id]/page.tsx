import { notFound } from 'next/navigation'
import dayjs from 'dayjs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requirePermission, requirePage } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import { officeTime } from '@/lib/office-time'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import DetailGroups from '@/components/sheet/DetailGroups'
import ReturnLink from '@/components/layout/ReturnLink'
import RecordActions, { type RecordInvoice } from './_components/RecordActions'
import AllocGenerateButton from '../_components/AllocGenerateButton'

// An allocation's own page (2026-10-09, the user's Claude Design handoff —
// 照设计档): the record's number as the title with its status chip and the
// batch in the eyebrow, four cards — the amount, what is billable, HV's own
// share, billed or still to bill — its details in two groups, the split by
// company, and what Finance can do to it. "← Back to Billing Allocator" is
// Back when the list is where the reader came from, so the list keeps its
// place.

interface Props {
  params: Promise<{ id: string }>
}

const METHOD: Record<string, string> = { headcount: 'Headcount', percentage: 'Percentage', equal: 'Equal', custom: 'Custom' }
const methodLabel = (m: string) => METHOD[m] ?? m

interface Line {
  own: boolean
  dept: boolean
  label: string
  detail: string
  amount: number
}

export default async function AllocationRecordPage({ params }: Props) {
  await requirePage('/billing-allocator/[id]')
  const user = await requirePermission('billing')
  const { id } = await params
  // alloc_* tables aren't in the generated database.types yet — untyped client,
  // same convention as the list page; shapes narrowed manually below.
  const supabase = (await createClient()) as unknown as SupabaseClient

  const { data: txn, error } = await supabase
    .from('alloc_txns')
    .select('id, txn_no, period_month, description, amount, method, category_id, hc_period, billed_ref, created_at, alloc_txn_details(company_id, department_id, method_detail, amount, is_own_share)')
    .eq('id', id)
    .single()
  if (error || !txn) notFound()

  const billedRef = (txn.billed_ref as string | null) ?? null
  const [{ data: cos }, { data: depts }, { data: cat }, { data: batch }] = await Promise.all([
    supabase.from('companies').select('id, short_code, name'),
    supabase.from('departments').select('id, name'),
    txn.category_id
      ? supabase.from('alloc_categories').select('name').eq('id', txn.category_id).maybeSingle()
      : Promise.resolve({ data: null as { name: string } | null }),
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
  ])

  const coLabel = new Map(((cos ?? []) as Array<{ id: string; short_code: string | null; name: string }>).map((c) => [c.id, c.short_code ?? c.name]))
  const deptName = new Map(((depts ?? []) as Array<{ id: string; name: string }>).map((d) => [d.id, d.name]))
  const labelOf = (companyId: string | null, departmentId: string | null): string =>
    companyId ? coLabel.get(companyId) ?? '?' : departmentId ? deptName.get(departmentId) ?? '?' : 'HOUZS Venture (own)'

  const amount = Number(txn.amount)
  const lines: Line[] = ((txn.alloc_txn_details ?? []) as Array<{
    company_id: string | null; department_id: string | null; method_detail: string; amount: number | string; is_own_share: boolean
  }>)
    .map((d) => {
      const own = d.is_own_share || (!d.company_id && !d.department_id)
      return { own, dept: !own && !!d.department_id && !d.company_id, label: labelOf(d.company_id, d.department_id), detail: d.method_detail, amount: Number(d.amount) }
    })
    // Largest share first, HV's own share at the end.
    .sort((a, b) => Number(a.own) - Number(b.own) || b.amount - a.amount || a.label.localeCompare(b.label))
  const shares = lines.filter((l) => !l.own)
  const billable = r2(shares.reduce((s, l) => s + l.amount, 0))
  const own = r2(lines.filter((l) => l.own).reduce((s, l) => s + l.amount, 0))
  const pct = (n: number) => (amount > 0 ? ((n / amount) * 100).toFixed(1) : '0.0')

  const invoices: RecordInvoice[] = ((batch ?? []) as Array<{
    id: string; invoice_no: string | null; company_id: string | null; billable_to_department_id: string | null; status: string
  }>).map((i) => ({ id: i.id, invoiceNo: i.invoice_no ?? '—', billTo: labelOf(i.company_id, i.billable_to_department_id) }))
  // Billed while its batch still has live invoices — the list's lock rule.
  const billed = !!billedRef && invoices.length > 0

  const period = dayjs(txn.period_month as string).format('YYYY-MM')
  const recorded = txn.created_at ? officeTime(txn.created_at as string).format('D MMM YYYY') : null
  const categoryName = (cat as { name: string } | null)?.name ?? ''
  const hcMonth = txn.hc_period ? dayjs(txn.hc_period as string).format('MMM YYYY') : null
  const companies = (n: number) => `${n} ${n === 1 ? 'company' : 'companies'}`
  const canAct = canDo(user, 'billing', 'edit')

  return (
    <div>
      <div className="mb-3">
        <ReturnLink href={`/billing-allocator?period=${period}`} alsoFrom={['/billing-allocator']} className="text-[13px] text-graphite hover:text-ink font-sans transition-colors">
          ← Back to Billing Allocator
        </ReturnLink>
      </div>

      {/* ───────── Header ───────── */}
      <div className="page-head">
        <div className="min-w-0">
          <div className="page-eyebrow">
            <em>I.</em> BILLING · ALLOCATOR · {billed ? String(billedRef).toUpperCase() : 'NOT BILLED'}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="page-title">{txn.txn_no as string}</h1>
            <span className={`chip lg ${billed ? 'ledger' : 'alert'}`}>
              <i className="dot" />
              {billed ? 'billed' : 'to bill'}
            </span>
          </div>
          <p className="font-sans text-xs text-graphite mt-2">
            {txn.description as string}{recorded ? ` · ${recorded}` : ''}
          </p>
        </div>
        {/* The handoff: an unbilled record's primary, in the head (2026-10-10). */}
        {canAct && !billed ? (
          <div className="flex flex-wrap items-start justify-end gap-2 min-w-0">
            <AllocGenerateButton period={period} />
          </div>
        ) : null}
      </div>

      {/* ───────── Cards ───────── */}
      <StatCards label="Allocation">
        <StatCard tone="primary" label="Amount" value={formatMoney(amount)} icon="receipt" note={recorded ? `recorded ${recorded}` : methodLabel(txn.method as string)} />
        <StatCard label="Billable" value={formatMoney(billable)} icon="send" note={companies(shares.length)} />
        <StatCard label="HV own share" value={formatMoney(own)} icon="building" note="kept by HV · not billed" />
        {billed ? (
          <StatCard tone="ledger" label="Billed" value={formatMoney(billable)} icon="check" note={`${invoices.length} ${invoices.length === 1 ? 'invoice' : 'invoices'} · ${billedRef}`} />
        ) : (
          <StatCard tone="alert" label="To bill" value={formatMoney(billable)} icon="clock" note="Not invoiced yet" />
        )}
      </StatCards>

      {/* ───────── Details ───────── */}
      <DetailGroups
        title="Details"
        count="EXPENSE · SPLIT"
        groups={[
          {
            title: 'Expense',
            items: [
              { label: 'Description', value: txn.description as string, text: true },
              { label: 'Category', value: categoryName || '—', text: true },
              { label: 'Date', value: recorded ?? '—' },
            ],
          },
          {
            title: 'Split',
            items: [
              { label: 'Method', value: methodLabel(txn.method as string), text: true },
              ...(hcMonth ? [{ label: 'Headcount list', value: hcMonth }] : []),
              { label: 'Batch', value: billed ? String(billedRef) : 'not billed', text: !billed },
              { label: 'Companies', value: String(shares.length) },
              { label: invoices.length === 1 ? 'Invoice' : 'Invoices', value: invoices.length > 0 ? invoices.map((i) => i.invoiceNo).join(' · ') : '—' },
            ],
          },
        ]}
      />

      {/* ───────── Split by company ───────── */}
      <section className="mb-9">
        <div className="sect-head">
          <h2>Split by company</h2>
          <span className="rule" aria-hidden />
          <span className="count">{lines.length} {lines.length === 1 ? 'LINE' : 'LINES'} · {methodLabel(txn.method as string).toUpperCase()}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="ledger-table w-full">
            <thead>
              <tr>
                <th>Bill to</th>
                <th className="m-hide">Basis</th>
                <th className="text-right right">Share %</th>
                <th className="text-right right">Amount</th>
                <th className="m-hide">Status</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className={l.own ? 'text-graphite' : undefined}>
                  <td>
                    <span className="block">{l.own ? 'HV own (not billed)' : l.label}</span>
                    <span className="block font-sans text-[11px] text-muted">{l.own ? 'kept by HV' : l.dept ? 'dept pool' : 'subsidiary'}</span>
                  </td>
                  <td className="m-hide text-graphite font-mono text-xs">{l.detail}</td>
                  <td className="num">{pct(l.amount)}%</td>
                  <td className="num">{formatMoney(l.amount)}</td>
                  <td className="m-hide">
                    {l.own ? (
                      <span className="chip info"><i className="dot" />kept</span>
                    ) : (
                      <span className={`chip ${billed ? 'ledger' : 'alert'}`}><i className="dot" />{billed ? 'billed' : 'to bill'}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>Billable total · HV own left out</td>
                <td className="num">{formatMoney(billable)}</td>
                <td className="m-hide" />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* ───────── Actions ───────── */}
      {canAct ? (
        <section className="mb-6">
          <div className="sect-head">
            <h2>Actions</h2>
            <span className="rule" aria-hidden />
            <span className="count">FINANCE</span>
          </div>
          <RecordActions id={txn.id as string} txnNo={txn.txn_no as string} period={period} billed={billed} invoices={invoices} />
        </section>
      ) : null}
    </div>
  )
}

const r2 = (n: number) => Math.round(n * 100) / 100
