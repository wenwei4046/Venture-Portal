// Receipt & Payment report (2026-08-20, marketing user features). User:
// "他们实际收到和要收到的钱，和花出去的钱的报表，类似cash flow但还需要
// include 还没收回的钱" — one dept-scoped statement with three blocks:
//   实收 Received   = bank-in GL lines in the segment's JEs for the month
//   支出 Paid out   = bank-out GL lines for the month
//   未收 To collect = issued invoices net of receipts/approved CNs (any month)
// dept_manager is hard-locked to their own segment (RLS + RPC both key off
// current_user_segment()); finance/principal pick a segment (default the
// caller-requested one, marketing first in the list).

import dayjs from 'dayjs'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatMoney } from '@/lib/utils'
import { deptNameToSegment } from '@/lib/billing'
import {
  fetchDeptCashLines,
  fetchDeptOutstanding,
  monthRange,
} from '@/lib/dept-receipt-payment'

export const dynamic = 'force-dynamic'

const SEGMENT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'marketing', label: 'Marketing' },
  { value: 'hr', label: 'HR' },
  { value: 'finance', label: 'Finance' },
  { value: 'director_office', label: 'Director Office' },
  { value: 'director', label: 'Director' },
  { value: 'corporate', label: 'Venture (Office)' },
]

interface Props {
  searchParams: Promise<{ period?: string; segment?: string }>
}

const r2 = (n: number) => Math.round(n * 100) / 100

export default async function ReceiptPaymentPage({ searchParams }: Props) {
  const user = await requireRole(['principal', 'finance', 'dept_manager'])
  const supabase = await createClient()
  const params = await searchParams

  const period = /^\d{4}-\d{2}$/.test(params.period ?? '') ? params.period! : dayjs().format('YYYY-MM')
  const isDeptMgr = user.role === 'dept_manager'

  let segment: string | null = null
  let scopeLabel = ''
  if (isDeptMgr) {
    const { data: dept } = user.department_id
      ? await supabase.from('departments').select('name').eq('id', user.department_id).single()
      : { data: null }
    segment = deptNameToSegment(dept?.name) ?? null
    scopeLabel = dept?.name ?? '—'
  } else {
    segment = SEGMENT_OPTIONS.some((s) => s.value === (params.segment ?? '')) ? params.segment! : 'marketing'
    scopeLabel = SEGMENT_OPTIONS.find((s) => s.value === segment)?.label ?? segment
  }

  const { from, to } = monthRange(period)
  const ytdFrom = dayjs(`${period}-01`).startOf('year').format('YYYY-MM-DD')

  const [monthLines, ytdLines, outstanding, { data: companies }] = await Promise.all([
    fetchDeptCashLines(supabase as never, { from, to, segment }),
    fetchDeptCashLines(supabase as never, { from: ytdFrom, to, segment }),
    fetchDeptOutstanding(supabase as never, { segment: isDeptMgr ? null : segment }),
    supabase.from('companies').select('id, name'),
  ])
  const companyMap = new Map(((companies ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]))

  const received = monthLines.filter((l) => l.inAmount > 0)
  const paidOut = monthLines.filter((l) => l.outAmount > 0)
  const receivedTotal = r2(received.reduce((s, l) => s + l.inAmount, 0))
  const paidTotal = r2(paidOut.reduce((s, l) => s + l.outAmount, 0))
  const net = r2(receivedTotal - paidTotal)
  const ytdReceived = r2(ytdLines.reduce((s, l) => s + l.inAmount, 0))
  const ytdPaid = r2(ytdLines.reduce((s, l) => s + l.outAmount, 0))
  const outstandingTotal = r2(outstanding.reduce((s, i) => s + i.outstanding, 0))

  const periodLabel = dayjs(`${period}-01`).format('MMMM YYYY')
  const prev = dayjs(`${period}-01`).subtract(1, 'month').format('YYYY-MM')
  const next = dayjs(`${period}-01`).add(1, 'month').format('YYYY-MM')
  const hrefFor = (p: string, seg: string | null) =>
    `/reports/receipt-payment?period=${p}${!isDeptMgr && seg ? `&segment=${seg}` : ''}`

  return (
    <div>
      <Link href="/reports" className="text-sm text-muted hover:text-accent font-sans transition-colors">
        ← Back to Reports
      </Link>

      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>·</em> REPORTS · RECEIPT &amp; PAYMENT · {scopeLabel.toUpperCase()}
          </div>
          <h1 className="page-title">Receipt &amp; Payment</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link href={hrefFor(prev, segment)} className="border border-hairline rounded-md px-2.5 py-1.5 text-sm text-ink hover:bg-surface">‹</Link>
          <span className="font-mono text-sm text-ink">{periodLabel}</span>
          <Link href={hrefFor(next, segment)} className="border border-hairline rounded-md px-2.5 py-1.5 text-sm text-ink hover:bg-surface">›</Link>
        </div>
      </div>

      {!isDeptMgr ? (
        <div className="flex flex-wrap gap-2 mb-8">
          {SEGMENT_OPTIONS.map((s) => (
            <Link
              key={s.value}
              href={hrefFor(period, s.value)}
              className={`border rounded-md px-3 py-1.5 text-xs font-sans transition-colors ${
                segment === s.value
                  ? 'bg-accent text-white border-accent'
                  : 'bg-surface border-hairline text-ink hover:bg-surface-2'
              }`}
            >
              {s.label}
            </Link>
          ))}
        </div>
      ) : null}

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        <div className="border border-hairline rounded-md bg-surface p-5">
          <div className="font-serif italic text-sm text-accent mb-1">实收 Received · {dayjs(`${period}-01`).format('MMM')}</div>
          <div className="font-serif text-2xl tabular text-num-ink leading-none">{formatMoney(receivedTotal)}</div>
          <div className="font-mono text-xs text-muted mt-2">YTD {formatMoney(ytdReceived)}</div>
        </div>
        <div className="border border-hairline rounded-md bg-surface p-5">
          <div className="font-serif italic text-sm text-accent mb-1">支出 Paid out · {dayjs(`${period}-01`).format('MMM')}</div>
          <div className="font-serif text-2xl tabular text-num-ink leading-none">{formatMoney(paidTotal)}</div>
          <div className="font-mono text-xs text-muted mt-2">YTD {formatMoney(ytdPaid)}</div>
        </div>
        <div className="border border-hairline rounded-md bg-surface p-5">
          <div className="font-serif italic text-sm text-accent mb-1">净现金 Net · {dayjs(`${period}-01`).format('MMM')}</div>
          <div className={`font-serif text-2xl tabular leading-none ${net < 0 ? 'text-danger' : 'text-num-ink'}`}>
            {formatMoney(net)}
          </div>
          <div className="font-mono text-xs text-muted mt-2">received − paid</div>
        </div>
        <div className="border border-hairline rounded-md bg-surface p-5">
          <div className="font-serif italic text-sm text-accent mb-1">未收 To collect</div>
          <div className={`font-serif text-2xl tabular leading-none ${outstandingTotal > 0 ? 'text-alert' : 'text-num-ink'}`}>
            {formatMoney(outstandingTotal)}
          </div>
          <div className="font-mono text-xs text-muted mt-2">{outstanding.length} issued invoice(s), all months</div>
        </div>
      </div>

      {/* Received */}
      <section className="mb-10">
        <div className="sect-head">
          <h2>实收 Received · {periodLabel}</h2>
          <span className="rule" aria-hidden />
          <span className="count">{received.length} ENTRIES · RM {formatMoney(receivedTotal)}</span>
        </div>
        {received.length === 0 ? (
          <p className="font-serif italic text-muted text-sm border border-hairline rounded-md bg-surface p-4">这个月没有收到钱。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="ledger-table">
              <thead>
                <tr><th>Date</th><th>Entry</th><th>Description</th><th className="right">Amount</th></tr>
              </thead>
              <tbody>
                {received.map((l, idx) => (
                  <tr key={`${l.entryNo}-${idx}`}>
                    <td className="font-mono text-xs text-muted">{dayjs(l.date).format('DD MMM')}</td>
                    <td className="font-mono text-xs text-muted">{l.entryNo ?? '—'}</td>
                    <td className="font-serif italic text-graphite text-sm">{l.description}</td>
                    <td className="num">{formatMoney(l.inAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Paid out */}
      <section className="mb-10">
        <div className="sect-head">
          <h2>支出 Paid out · {periodLabel}</h2>
          <span className="rule" aria-hidden />
          <span className="count">{paidOut.length} ENTRIES · RM {formatMoney(paidTotal)}</span>
        </div>
        {paidOut.length === 0 ? (
          <p className="font-serif italic text-muted text-sm border border-hairline rounded-md bg-surface p-4">这个月没有付出去的钱。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="ledger-table">
              <thead>
                <tr><th>Date</th><th>Entry</th><th>Description</th><th className="right">Amount</th></tr>
              </thead>
              <tbody>
                {paidOut.map((l, idx) => (
                  <tr key={`${l.entryNo}-${idx}`}>
                    <td className="font-mono text-xs text-muted">{dayjs(l.date).format('DD MMM')}</td>
                    <td className="font-mono text-xs text-muted">{l.entryNo ?? '—'}</td>
                    <td className="font-serif italic text-graphite text-sm">{l.description}</td>
                    <td className="num">{formatMoney(l.outAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* To collect */}
      <section className="mb-12">
        <div className="sect-head">
          <h2>未收 To collect · 所有月份</h2>
          <span className="rule" aria-hidden />
          <span className="count">{outstanding.length} INVOICES · RM {formatMoney(outstandingTotal)}</span>
        </div>
        {outstanding.length === 0 ? (
          <p className="font-serif italic text-muted text-sm border border-hairline rounded-md bg-surface p-4">没有未收的发票 🎉</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Bill to</th>
                  <th>Period</th>
                  <th>Invoice date</th>
                  <th className="right">Amount</th>
                  <th className="right">已收/CN</th>
                  <th className="right">未收 Bal</th>
                </tr>
              </thead>
              <tbody>
                {outstanding.map((i) => (
                  <tr key={i.id}>
                    <td className="font-mono text-xs text-ink">{i.invoiceNo ?? i.id.slice(0, 8)}</td>
                    <td className="font-serif text-ink">
                      {i.companyId ? companyMap.get(i.companyId) ?? '—' : i.partyFallback ?? '—'}
                    </td>
                    <td className="font-mono text-xs text-muted">{dayjs(i.periodMonth).format('MMM YYYY')}</td>
                    <td className="font-mono text-xs text-muted">
                      {i.invoiceDate ? dayjs(i.invoiceDate).format('DD MMM YY') : '—'}
                    </td>
                    <td className="num">{formatMoney(i.totalAmount)}</td>
                    <td className="num text-muted">
                      {i.receipts + i.credits > 0 ? formatMoney(r2(i.receipts + i.credits)) : '—'}
                    </td>
                    <td className="num text-alert">{formatMoney(i.outstanding)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
