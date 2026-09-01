import Link from 'next/link'
import dayjs from 'dayjs'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import RequestActionButtons from './_components/RequestActionButtons'

interface LineItem {
  subsidiary_id: string
  amount: number | string
}

export default async function InvoiceRequestsPage() {
  await requirePermission('billing')
  const supabase = await createClient()

  const [{ data: requests }, { data: companies }] = await Promise.all([
    supabase
      .from('invoice_submission_requests')
      .select(
        `id, requested_at, period_month, invoice_date, due_date, description,
         reference_no, line_items, status,
         departments (name),
         users:requested_by (name)`,
      )
      .eq('status', 'pending')
      .order('requested_at', { ascending: true }),
    supabase.from('companies').select('id, name'),
  ])

  const companyName = new Map((companies ?? []).map((c) => [c.id, c.name]))

  return (
    <div>
      <Link href="/statements" className="text-sm text-muted hover:text-accent font-sans transition-colors">
        ← Back to Invoices
      </Link>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> BILLING · INVOICE GENERATION QUEUE
          </div>
          <h1 className="page-title">Request Generate Invoice</h1>
        </div>
      </div>

      {(requests ?? []).length === 0 ? (
        <div className="border border-hairline rounded-md bg-surface p-8 text-center">
          <p className="font-serif italic text-ledger text-base">All caught up.</p>
          <p className="font-mono text-xs text-muted mt-1">No pending invoice requests.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {(requests ?? []).map((r) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const dept = (r.departments as any)?.name ?? '—'
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const submitter = (r.users as any)?.name ?? '—'
            const items = (r.line_items as unknown as LineItem[]) ?? []
            const total = items.reduce((s, it) => s + Number(it.amount), 0)
            return (
              <article key={r.id} className="border border-hairline rounded-md bg-surface p-6">
                <header className="flex items-baseline justify-between mb-4 gap-4">
                  <div>
                    <div className="font-serif text-lg text-ink">
                      {dept} → {items.length} invoice{items.length === 1 ? '' : 's'}
                    </div>
                    <div className="font-serif italic text-graphite text-sm mt-0.5">
                      {r.description}
                    </div>
                    <div className="font-mono text-xs text-muted mt-0.5">
                      Submitted by {submitter} · {dayjs(r.requested_at).format('D MMM HH:mm')}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="num text-num-ink font-semibold text-lg">
                      {formatMoney(total)}
                    </div>
                    <div className="font-mono text-xs text-muted mt-0.5">total</div>
                  </div>
                </header>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-xs font-mono">
                  <div>
                    <div className="text-graphite uppercase tracking-wide">Period</div>
                    <div className="text-ink mt-1">{dayjs(r.period_month).format('MMM YYYY')}</div>
                  </div>
                  <div>
                    <div className="text-graphite uppercase tracking-wide">Invoice date</div>
                    <div className="text-ink mt-1">{dayjs(r.invoice_date).format('D MMM YYYY')}</div>
                  </div>
                  <div>
                    <div className="text-graphite uppercase tracking-wide">Due date</div>
                    <div className="text-ink mt-1">{dayjs(r.due_date).format('D MMM YYYY')}</div>
                  </div>
                  <div>
                    <div className="text-graphite uppercase tracking-wide">Reference</div>
                    <div className="text-ink mt-1">{r.reference_no ?? '—'}</div>
                  </div>
                </div>

                <table className="ledger-table mb-4">
                  <thead>
                    <tr>
                      <th>Subsidiary</th>
                      <th className="right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, i) => (
                      <tr key={i}>
                        <td>
                          <div className="font-serif text-ink">
                            {companyName.get(it.subsidiary_id) ?? it.subsidiary_id}
                          </div>
                        </td>
                        <td className="num">{formatMoney(Number(it.amount))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <RequestActionButtons requestId={r.id} />
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
