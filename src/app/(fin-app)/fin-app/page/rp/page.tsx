import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { officeMonth } from '@/lib/office-time'
import { fetchDeptOutstanding } from '@/lib/dept-receipt-payment'
import { readCashFlowStatement } from '@/app/(portal)/reports/_lib/statement-reads'
import { reportsCompanyWide } from '@/lib/surfaces'
import { askedMonth, askedSegment, reportFiles, searchOf, segmentOptions, type SearchParams } from '@/lib/fin-app/report-page'
import { monthWords } from '@/lib/fin-app/page-model'
import { monthPlace, receiptPaymentModel, type OwedInvoice } from '@/lib/fin-app/report-pages'
import PageApp from '@/components/fin-app/PageApp'

export const dynamic = 'force-dynamic'

/**
 * `/fin-app/page/rp` — Report › Receipt & Payment in the Finance phone app
 * (2026-10-15, part 5b): the page's own gates (its tabs, Department reports),
 * the month's receipts and payments as the desktop page builds them — the Cash
 * Flow statement's own (`readCashFlowStatement`, the same builder, the same
 * bridge and layouts) — and, for one segment (or a department's own reader),
 * every issued invoice of it still owed (`fetchDeptOutstanding`, as the page's
 * *To collect*). The files for whoever may export them.
 */
export default async function FinAppReceiptPayment({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePage('/reports/receipt-payment')
  const user = await requirePermission('dept_reports')
  const sp = await searchParams
  const thisMonth = officeMonth()
  const ym = askedMonth(sp, thisMonth)
  const supabase = await createClient()
  // *To collect* — the desktop page's: a department's own reader keys off their segment, anybody else needs one
  // picked. Its reads start beside the statement's (speed.md).
  const companyWide = reportsCompanyWide(user)
  const arSegment = companyWide ? askedSegment(sp) || null : null
  const owedRead = !companyWide || arSegment ? Promise.all([fetchDeptOutstanding(supabase as never, { segment: arSegment }), supabase.from('companies').select('id, name')]) : null
  const [{ cf, inflow, outflow, segment, isDeptMgr }, owedRows] = await Promise.all([
    readCashFlowStatement(supabase, user, { period: ym, compare: '', segment: askedSegment(sp) }),
    owedRead,
  ])
  let owed: OwedInvoice[] | null = null
  if (owedRows) {
    const [outstanding, { data: companies }] = owedRows
    const name = new Map(((companies ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]))
    owed = outstanding.map((i) => ({
      id: i.id,
      invoiceNo: i.invoiceNo,
      party: i.companyId ? (name.get(i.companyId) ?? '—') : (i.partyFallback ?? '—'),
      periodMonth: i.periodMonth,
      totalAmount: i.totalAmount,
      receipts: i.receipts,
      credits: i.credits,
      outstanding: i.outstanding,
    }))
  }

  return (
    <PageApp
      key={`${ym}:${segment}`}
      place={monthPlace({ href: '/fin-app/page/rp', title: 'Receipt & Payment', roman: 'III.', ym, thisMonth, label: monthWords(ym), segment, segments: isDeptMgr ? null : segmentOptions() })}
      model={receiptPaymentModel(cf, { inflow, outflow }, ym, ym === thisMonth, owed)}
      search={searchOf(sp)}
      files={canDo(user, 'dept_reports', 'export', 'dept') ? reportFiles('/reports/receipt-payment/export', { period: ym, segment }) : []}
    />
  )
}
