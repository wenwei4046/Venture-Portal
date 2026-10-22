import dayjs from 'dayjs'
import { notFound } from 'next/navigation'
import { canDo } from '@/lib/permission-actions'
import { officeMonth, officeToday } from '@/lib/office-time'
import { createClient } from '@/lib/supabase/server'
import { requirePermission, requirePage } from '@/lib/auth'
import { formatMoney } from '@/lib/utils'
import { buildDebtorAging, debtorAgingView, invoicesAsAt, resolveAgingAsAt, type RawInvoice } from '@/lib/debtor-aging'
import { toChoices } from '@/lib/report-range'
import { readDebtorInvoices } from './_lib/debtor-read'
import AgingByCustomer from './_components/AgingByCustomer'
import { reportsCompanyWide } from '@/lib/surfaces'
import { StatCard, StatCards } from '@/components/sheet/StatCard'

export const dynamic = 'force-dynamic'

export default async function DebtorAgingPage({ searchParams }: { searchParams: Promise<{ as_at?: string }> }) {
  await requirePage('/reports/debtor-aging')
  const user = await requirePermission('dept_reports')
  // For whoever reads the reports company-wide (Reports · View at All); the
  // Dept Manager's own-segment page went with the kind (2026-10-17).
  if (!reportsCompanyWide(user)) notFound()
  // The files only for whoever may take them out — as the export route asks (2026-10-16).
  const canExport = canDo(user, 'dept_reports', 'export')
  const supabase = await createClient()

  // Every issued invoice still unpaid, at its remainder (`_lib/debtor-read` — the Finance phone app's read too).
  const raw: RawInvoice[] = await readDebtorInvoices(supabase)

  const today = officeToday()

  // The page (2026-10-09, the user's Claude Design handoff): the date in the
  // eyebrow, Excel / PDF, four cards, the table closing on a navy "All
  // companies" row.
  // As at a month (2026-10-10, the handoff) by the user's rule: the invoices
  // dated by then, at what is unpaid on them today, aged to that day.
  const nowYM = officeMonth()
  const asAtMonth = (await searchParams)?.as_at
  const asAt = resolveAgingAsAt(asAtMonth, today)
  const past = asAt !== today
  const rawAt = invoicesAsAt(raw, asAt)
  const agingAt = buildDebtorAging(rawAt, asAt)
  // By days since the invoice (the handoff's columns, the July rule's basis).
  const days = debtorAgingView(rawAt, asAt)
  const b = days.totals.buckets
  const fresh = b.d0_30 ?? 0
  const d31 = b.d31_60 ?? 0
  const over60 = Math.round(((b.d61_90 ?? 0) + (b.d90_plus ?? 0)) * 100) / 100
  // The company owing most for longest names the card (the handoff).
  const oldest = days.byPayer
    .map((p) => ({ payer: p.payer, v: (p.buckets.d61_90 ?? 0) + (p.buckets.d90_plus ?? 0) }))
    .filter((p) => p.v > 0.005)
    .sort((x, y) => y.v - x.v)[0]
  const exportHref = (format: 'xlsx' | 'pdf', view: 'detail' | 'summary') =>
    `/reports/debtor-aging/export?format=${format}&view=${view}${past ? `&as_at=${asAt.slice(0, 7)}` : ''}`
  const asAtLabel = dayjs(asAt).format('D MMM YYYY')
  return (
    <div>
      <div className="page-head">
        <div className="min-w-0">
          <div className="page-eyebrow">
            <em>I.</em> REPORTS · DEBTOR AGING · AS AT {asAtLabel.toUpperCase()}
          </div>
          <h1 className="page-title">Debtor Aging</h1>
          {/* A past As at lists what is still unpaid TODAY (finance-view.md ›
              AS AT ON THE AGINGS) — said in a chip, not a sentence (2026-10-12). */}
          {past ? <span className="chip alert mt-2"><span className="dot" />Unpaid as of today</span> : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {canExport ? (
            <a href={exportHref('xlsx', 'detail')} className="btn-quiet-sheet">
              Excel
            </a>
          ) : null}
          {canExport ? (
            <a href={exportHref('pdf', 'detail')} className="btn-quiet-sheet">
              PDF
            </a>
          ) : null}
          {canExport ? (
            <a href={exportHref('xlsx', 'summary')} className="btn-quiet-sheet">
              Summary Excel
            </a>
          ) : null}
          {canExport ? (
            <a href={exportHref('pdf', 'summary')} className="btn-quiet-sheet">
              Summary PDF
            </a>
          ) : null}
        </div>
      </div>

      <StatCards label="Debtor aging">
        <StatCard
          label="Total receivable"
          value={formatMoney(agingAt.totals.total)}
          icon="receipt"
          tone="primary"
          note={`${agingAt.byPayer.length} ${agingAt.byPayer.length === 1 ? 'company' : 'companies'} · ${agingAt.totals.count} ${agingAt.totals.count === 1 ? 'invoice' : 'invoices'}`}
        />
        <StatCard label="0–30 days" value={formatMoney(fresh)} icon="check" note="Since the invoice date" />
        <StatCard label="31–60 days" value={formatMoney(d31)} icon="clock" tone={d31 > 0 ? 'danger' : 'default'} note="Follow up" />
        <StatCard label="Over 60 days" value={formatMoney(over60)} icon="alert" tone={over60 > 0 ? 'danger' : 'default'} note={oldest ? oldest.payer : 'Nothing over 60 days'} />
      </StatCards>

      <section className="mb-6">
        <div className="sect-head">
          <h2>Debtor aging</h2>
          <span className="rule" aria-hidden />
          <span className="count">AS AT {asAtLabel.toUpperCase()}</span>
        </div>
        <AgingByCustomer
          byPayer={days.byPayer}
          invoices={days.invoices}
          totals={days.totals}
          columns={days.columns}
          allRow
          search
          sheet
          asAt={{
            value: asAt.slice(0, 7),
            options: toChoices(nowYM).map((ym) => ({ value: ym, label: dayjs(`${ym}-01`).format('MMM YYYY') })),
          }}
          empty={agingAt.totals.count === 0 ? (past ? `Nothing dated on or before ${asAtLabel} is still unpaid.` : 'Nothing outstanding — every issued invoice has been collected.') : undefined}
        />
      </section>
    </div>
  )
}
