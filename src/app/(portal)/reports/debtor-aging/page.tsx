import dayjs from 'dayjs'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { fetchAllRows } from '@/lib/paginate'
import { formatMoney } from '@/lib/utils'
import { buildDebtorAging, AGING_BUCKETS, type RawInvoice, type AgingBucket } from '@/lib/debtor-aging'

export const dynamic = 'force-dynamic'

const money = (v: number) =>
  v ? <span className="num">{formatMoney(v)}</span> : <span className="num text-muted">—</span>

export default async function DebtorAgingPage() {
  await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  const [invoices, companies, departments] = await Promise.all([
    fetchAllRows((lo, hi) =>
      supabase
        .from('invoices')
        .select('invoice_no, invoice_date, due_date, total_amount, company_id, billable_to_department_id, billable_to_freetext_name')
        .eq('status', 'issued')
        .order('id', { ascending: true })
        .range(lo, hi),
    ),
    fetchAllRows((lo, hi) => supabase.from('companies').select('id, name').range(lo, hi)),
    // is_internal=false — exclude the 'Venture Office' pseudo-dept from the
    // id→name resolver (never a debtor).
    fetchAllRows((lo, hi) => supabase.from('departments').select('id, name').eq('is_internal', false).range(lo, hi)),
  ])

  const companyMap = new Map((companies ?? []).map((c) => [c.id as string, c.name as string]))
  const deptMap = new Map((departments ?? []).map((d) => [d.id as string, d.name as string]))

  const raw: RawInvoice[] = (invoices ?? []).map((i) => ({
    invoiceNo: (i.invoice_no as string | null) ?? '—',
    payer:
      (i.company_id ? companyMap.get(i.company_id as string) : null) ??
      (i.billable_to_department_id ? deptMap.get(i.billable_to_department_id as string) : null) ??
      (i.billable_to_freetext_name as string | null) ??
      '—',
    invoiceDate: (i.invoice_date as string | null) ?? null,
    dueDate: (i.due_date as string | null) ?? null,
    amount: Number(i.total_amount),
  }))

  const today = dayjs().format('YYYY-MM-DD')
  const aging = buildDebtorAging(raw, today)

  return (
    <div>
      <Link href="/reports" className="text-sm text-muted hover:text-accent font-sans transition-colors">
        ← Back to Reports
      </Link>

      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>III.</em> REPORTS · DEBTOR AGING
          </div>
          <h1 className="page-title">Debtor Aging</h1>
          <p className="font-serif italic text-graphite text-base mt-2">
            Invoices billed out but not yet collected · as of {dayjs(today).format('D MMM YYYY')}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <a
            href="/reports/debtor-aging/export?format=xlsx"
            className="px-3 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors"
          >
            Excel
          </a>
          <a
            href="/reports/debtor-aging/export?format=pdf"
            className="px-3 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors"
          >
            PDF
          </a>
        </div>
      </div>

      {/* Hero */}
      <div className="mb-8">
        <div className="font-serif italic text-graphite text-xs uppercase tracking-wide">Total outstanding</div>
        <div className="text-num-ink tabular tracking-[-0.01em] text-4xl mt-1">{formatMoney(aging.totals.total)}</div>
        <div className="font-sans text-xs text-muted mt-1">
          {aging.totals.count} unpaid invoice{aging.totals.count === 1 ? '' : 's'} ·{' '}
          {formatMoney(aging.totals.buckets.d1_30 + aging.totals.buckets.d31_60 + aging.totals.buckets.d61_90 + aging.totals.buckets.d90_plus)} overdue
        </div>
      </div>

      {aging.totals.count === 0 ? (
        <p className="font-serif italic text-graphite">Nothing outstanding — every issued invoice has been collected. 🎉</p>
      ) : (
        <>
          {/* By payer */}
          <h2 className="font-serif text-lg text-ink mb-3">By customer</h2>
          <div className="overflow-x-auto mb-10">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  {AGING_BUCKETS.map((b) => (
                    <th key={b.key} className="num">{b.label}</th>
                  ))}
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {aging.byPayer.map((p) => (
                  <tr key={p.payer}>
                    <td className="font-sans text-ink">
                      {p.payer} <span className="text-muted text-xs">· {p.count}</span>
                    </td>
                    {AGING_BUCKETS.map((b) => (
                      <td key={b.key} className="num">{money(p.buckets[b.key as AgingBucket])}</td>
                    ))}
                    <td className="num font-semibold">{formatMoney(p.total)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-hairline bg-surface-2">
                  <td className="font-serif italic text-ink font-semibold">Total</td>
                  {AGING_BUCKETS.map((b) => (
                    <td key={b.key} className="num font-semibold">{money(aging.totals.buckets[b.key as AgingBucket])}</td>
                  ))}
                  <td className="num font-semibold text-num-ink">{formatMoney(aging.totals.total)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Detail */}
          <h2 className="font-serif text-lg text-ink mb-3">Invoice detail</h2>
          <div className="overflow-x-auto">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th>Invoice date</th>
                  <th>Due date</th>
                  <th className="num">Days overdue</th>
                  <th>Bucket</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {aging.invoices.map((inv) => (
                  <tr key={inv.invoiceNo}>
                    <td className="font-mono text-xs">{inv.invoiceNo}</td>
                    <td className="font-sans">{inv.payer}</td>
                    <td className="font-mono text-xs text-graphite">{inv.invoiceDate ? dayjs(inv.invoiceDate).format('DD/MM/YYYY') : '—'}</td>
                    <td className="font-mono text-xs text-graphite">{inv.dueDate ? dayjs(inv.dueDate).format('DD/MM/YYYY') : '—'}</td>
                    <td className="num">
                      {inv.daysOverdue > 0
                        ? <span className={inv.daysOverdue > 90 ? 'text-danger' : inv.daysOverdue > 30 ? 'text-alert' : 'text-ink'}>{inv.daysOverdue}</span>
                        : <span className="text-muted">—</span>}
                    </td>
                    <td className="font-sans text-xs text-graphite">
                      {AGING_BUCKETS.find((b) => b.key === inv.bucket)?.label}
                    </td>
                    <td className="num">{formatMoney(inv.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
