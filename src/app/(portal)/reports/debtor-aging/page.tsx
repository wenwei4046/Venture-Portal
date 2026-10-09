import dayjs from 'dayjs'
import { officeToday } from '@/lib/office-time'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { fetchAllRows } from '@/lib/paginate'
import { formatMoney } from '@/lib/utils'
import { buildDebtorAging, type RawInvoice } from '@/lib/debtor-aging'
import { fetchPaidByInvoice } from '@/lib/debtor-aging-data'
import AgingByCustomer from './_components/AgingByCustomer'
import { reportsCompanyWide } from '@/lib/surfaces'
import { StatCard, StatCards } from '@/components/sheet/StatCard'

export const dynamic = 'force-dynamic'

export default async function DebtorAgingPage() {
  // dept_manager sees only their own segment's invoices (RLS on invoices).
  const user = await requirePermission('dept_reports')
  const supabase = await createClient()

  const [invoices, companies, departments] = await Promise.all([
    fetchAllRows((lo, hi) =>
      supabase
        .from('invoices')
        .select('id, invoice_no, invoice_date, due_date, total_amount, description, company_id, billable_to_department_id, billable_to_freetext_name')
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

  // Partial payments: outstanding = total − receipts already recorded.
  const paidByInvoice = await fetchPaidByInvoice(supabase, (invoices ?? []).map((i) => i.id as string))

  const raw: RawInvoice[] = (invoices ?? [])
    .map((i) => {
      const paid = paidByInvoice.get(i.id as string) ?? 0
      const remaining = Math.round((Number(i.total_amount) - paid) * 100) / 100
      const desc = (i.description as string | null) ?? null
      return {
        id: i.id as string,
        invoiceNo: (i.invoice_no as string | null) ?? '—',
        payer:
          (i.company_id ? companyMap.get(i.company_id as string) : null) ??
          (i.billable_to_department_id ? deptMap.get(i.billable_to_department_id as string) : null) ??
          (i.billable_to_freetext_name as string | null) ??
          '—',
        invoiceDate: (i.invoice_date as string | null) ?? null,
        dueDate: (i.due_date as string | null) ?? null,
        amount: remaining,
        description: paid > 0 ? `${desc ? `${desc} · ` : ''}part-paid RM ${paid.toFixed(2)}` : desc,
      }
    })
    .filter((i) => i.amount > 0.005)

  const today = officeToday()
  const aging = buildDebtorAging(raw, today)

  // Whoever reads the reports company-wide (2026-10-09, the user's Claude
  // Design handoff): the date in the eyebrow, Excel / PDF, four cards, the
  // table closing on a navy "All companies" row. A department manager keeps
  // the page below, as it was.
  if (reportsCompanyWide(user)) {
    const b = aging.totals.buckets
    const current = b.this_month
    const overOne = Math.round((aging.totals.total - current) * 100) / 100
    const overThree = Math.round((b.m3 + b.m4 + b.m5_plus) * 100) / 100
    const exportHref = (format: 'xlsx' | 'pdf', view: 'detail' | 'summary') => `/reports/debtor-aging/export?format=${format}&view=${view}`
    return (
      <div>
        <div className="page-head">
          <div className="min-w-0">
            <div className="page-eyebrow">
              <em>I.</em> REPORTS · DEBTOR AGING · AS AT {dayjs(today).format('D MMM YYYY').toUpperCase()}
            </div>
            <h1 className="page-title">Debtor Aging</h1>
            <p className="page-sub">Invoices billed out and not yet collected, by how many months they have been open.</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <a href={exportHref('xlsx', 'detail')} className="btn-quiet-sheet">
              Excel
            </a>
            <a href={exportHref('pdf', 'detail')} className="btn-quiet-sheet">
              PDF
            </a>
            <a href={exportHref('xlsx', 'summary')} className="btn-quiet-sheet">
              Summary Excel
            </a>
            <a href={exportHref('pdf', 'summary')} className="btn-quiet-sheet">
              Summary PDF
            </a>
          </div>
        </div>

        <StatCards label="Debtor aging">
          <StatCard
            label="Total receivable"
            value={formatMoney(aging.totals.total)}
            icon="receipt"
            tone="primary"
            note={`${aging.byPayer.length} ${aging.byPayer.length === 1 ? 'company' : 'companies'} · ${aging.totals.count} ${aging.totals.count === 1 ? 'invoice' : 'invoices'}`}
          />
          <StatCard label="Current" value={formatMoney(current)} icon="check" note="Billed this month" />
          <StatCard label="Over 1 month" value={formatMoney(overOne)} icon="clock" tone={overOne > 0 ? 'danger' : 'default'} note="Open a month or more" />
          <StatCard label="Over 3 months" value={formatMoney(overThree)} icon="alert" tone={overThree > 0 ? 'danger' : 'default'} note="Open three months or more" />
        </StatCards>

        <section className="mb-6">
          <div className="sect-head">
            <h2>By customer</h2>
            <span className="rule" aria-hidden />
            <span className="count">
              {aging.byPayer.length} {aging.byPayer.length === 1 ? 'COMPANY' : 'COMPANIES'} · {aging.totals.count} {aging.totals.count === 1 ? 'INVOICE' : 'INVOICES'}
            </span>
          </div>
          {aging.totals.count === 0 ? (
            <div className="border border-hairline rounded-card bg-surface-2 p-6 text-center">
              <p className="text-sm">Nothing outstanding — every issued invoice has been collected.</p>
            </div>
          ) : (
            <AgingByCustomer byPayer={aging.byPayer} invoices={aging.invoices} totals={aging.totals} allRow />
          )}
        </section>
      </div>
    )
  }

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
        <div className="flex flex-col gap-1.5 shrink-0 text-right">
          {(['detail', 'summary'] as const).map((view) => (
            <div key={view} className="flex gap-2 items-center justify-end">
              <span className="text-[11px] font-mono uppercase tracking-wide text-muted w-14 text-right">
                {view}
              </span>
              <a
                href={`/reports/debtor-aging/export?format=xlsx&view=${view}`}
                className="px-3 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors"
              >
                Excel
              </a>
              <a
                href={`/reports/debtor-aging/export?format=pdf&view=${view}`}
                className="px-3 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors"
              >
                PDF
              </a>
            </div>
          ))}
        </div>
      </div>

      {/* Hero */}
      <div className="mb-8">
        <div className="font-serif italic text-graphite text-xs uppercase tracking-wide">Total outstanding</div>
        <div className="statement-amount text-num-ink mt-1">{formatMoney(aging.totals.total)}</div>
        <div className="font-sans text-xs text-muted mt-1">
          {aging.totals.count} unpaid invoice{aging.totals.count === 1 ? '' : 's'} ·{' '}
          {formatMoney(Math.round((aging.totals.total - aging.totals.buckets.this_month) * 100) / 100)} over a month old
        </div>
      </div>

      {aging.totals.count === 0 ? (
        <p className="font-serif italic text-graphite">Nothing outstanding — every issued invoice has been collected. 🎉</p>
      ) : (
        <>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="font-serif text-lg text-ink">By customer</h2>
            <span className="font-serif italic text-muted text-xs">Click a customer to see its invoices</span>
          </div>
          <AgingByCustomer byPayer={aging.byPayer} invoices={aging.invoices} totals={aging.totals} />
        </>
      )}
    </div>
  )
}
