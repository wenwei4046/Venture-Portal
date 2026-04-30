import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatMoney } from '@/lib/utils'
import {
  fetchCashflowBuckets,
  startOfMonth,
  endOfMonth,
  SEGMENT_LABEL,
  type CashflowBuckets,
  type GlSegment,
} from '@/lib/cfo-reports'
import dayjs from 'dayjs'
import Link from 'next/link'

interface Props {
  searchParams: Promise<{ from?: string; to?: string; period?: string }>
}

export default async function CashFlowPage({ searchParams }: Props) {
  await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  const { from: rawFrom, to: rawTo, period } = await searchParams
  const from = rawFrom ?? startOfMonth(period)
  const to = rawTo ?? endOfMonth(period ?? from)

  const buckets = await fetchCashflowBuckets(supabase, { from, to })
  const periodLabel = formatPeriodLabel(from, to)

  return (
    <div>
      <Link href="/reports" className="text-sm text-muted hover:text-accent font-sans transition-colors">
        ← Back to Reports
      </Link>

      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> REPORTS · CASH FLOW · {periodLabel.toUpperCase()}
          </div>
          <h1 className="page-title">Cash Flow Statement</h1>
        </div>
        <form className="shrink-0">
          <input
            type="month"
            name="period"
            defaultValue={dayjs(from).format('YYYY-MM')}
            className="px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border"
          />
        </form>
      </div>

      <p className="font-serif italic text-muted text-sm mb-8 max-w-3xl">
        Three-bucket CFO view. <strong>A.</strong> where money came from this period;
        <strong> B.</strong> what each department spent; <strong>C.</strong> group-level
        general expenses. Categories are user-defined labels (Settings → Categories).
      </p>

      <div className="max-w-3xl space-y-12">
        <BucketSection
          letter="A"
          title="Source of fund"
          subtitle="Subs savings, loans in, invoice settlement, other inflows"
          lines={buckets.sourceOfFund}
          total={buckets.totalIn}
          isPositive
        />

        <DeptOutflowSection buckets={buckets} />

        <BucketSection
          letter="C"
          title="General expenses"
          subtitle="Group-level — rent, utility, statutory, audit, software, mgmt overhead"
          lines={buckets.generalExpenses}
          total={buckets.totalGeneral}
        />

        {/* Net change */}
        <div className="border-t-2 border-hairline pt-6">
          <div className="flex items-baseline justify-between mb-2">
            <span className="font-serif text-lg text-ink">Net cash change</span>
            <span className={`font-serif text-2xl font-semibold tabular ${buckets.netChange >= 0 ? 'text-ledger' : 'text-danger'}`}>
              {formatMoney(buckets.netChange)}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm pt-3">
            <div className="flex items-baseline justify-between">
              <span className="font-serif italic text-graphite">A. In</span>
              <span className="num text-ledger">{formatMoney(buckets.totalIn)}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="font-serif italic text-graphite">B. Dept out</span>
              <span className="num">{formatMoney(-buckets.totalDeptOut)}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="font-serif italic text-graphite">C. General out</span>
              <span className="num">{formatMoney(-buckets.totalGeneral)}</span>
            </div>
          </div>
        </div>

        {buckets.sourceOfFund.length === 0 &&
        buckets.deptOutflow.length === 0 &&
        buckets.generalExpenses.length === 0 ? (
          <div className="border border-hairline rounded-md bg-surface p-6 text-center">
            <p className="font-serif italic text-muted text-sm">
              No paid vouchers in this period. Approve and pay vouchers to populate the cashflow.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function BucketSection({
  letter,
  title,
  subtitle,
  lines,
  total,
  isPositive = false,
}: {
  letter: string
  title: string
  subtitle?: string
  lines: { label: string; amount: number }[]
  total: number
  isPositive?: boolean
}) {
  return (
    <section>
      <div className="flex items-baseline gap-3 mb-3">
        <span className="font-serif text-2xl text-accent">{letter}.</span>
        <h2 className="font-serif text-xl text-ink">{title}</h2>
      </div>
      {subtitle ? <p className="font-serif italic text-muted text-xs mb-4">{subtitle}</p> : null}
      {lines.length === 0 ? (
        <p className="font-serif italic text-muted text-sm">No activity in this bucket.</p>
      ) : (
        <table className="ledger-table">
          <tbody>
            {lines.map((l) => (
              <tr key={l.label}>
                <td>{l.label}</td>
                <td className={`num ${isPositive ? 'text-ledger' : ''}`}>
                  {isPositive ? formatMoney(l.amount) : <span className="neg">{formatMoney(-l.amount)}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="flex items-baseline justify-between pt-3 mt-3 border-t border-hairline">
        <span className="font-serif italic text-base text-ink font-medium">Subtotal</span>
        <span className={`num text-lg font-semibold ${isPositive ? 'text-ledger' : 'text-ink'}`}>
          {isPositive ? formatMoney(total) : formatMoney(-total)}
        </span>
      </div>
    </section>
  )
}

function DeptOutflowSection({ buckets }: { buckets: CashflowBuckets }) {
  return (
    <section>
      <div className="flex items-baseline gap-3 mb-3">
        <span className="font-serif text-2xl text-accent">B.</span>
        <h2 className="font-serif text-xl text-ink">Dept outflow</h2>
      </div>
      <p className="font-serif italic text-muted text-xs mb-4">
        What each department spent this period. Drill into <Link href="/dept-pool" className="text-accent hover:text-accent-hover">/dept-pool</Link> for line-item detail.
      </p>

      {buckets.deptOutflow.length === 0 ? (
        <p className="font-serif italic text-muted text-sm">No dept-level outflows in this period.</p>
      ) : (
        <div className="space-y-6">
          {buckets.deptOutflow.map((dept) => (
            <div key={dept.segment} className="border border-hairline rounded-md bg-surface p-5">
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="font-serif text-lg text-ink">{SEGMENT_LABEL[dept.segment as GlSegment]}</h3>
                <span className="font-mono tabular text-base text-ink font-semibold">
                  {formatMoney(-dept.total)}
                </span>
              </div>
              <table className="ledger-table">
                <tbody>
                  {dept.lines.map((l) => (
                    <tr key={l.label}>
                      <td>{l.label}</td>
                      <td className="num"><span className="neg">{formatMoney(-l.amount)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-baseline justify-between pt-3 mt-3 border-t border-hairline">
        <span className="font-serif italic text-base text-ink font-medium">Total dept outflow</span>
        <span className="num text-lg font-semibold">{formatMoney(-buckets.totalDeptOut)}</span>
      </div>
    </section>
  )
}

function formatPeriodLabel(from: string, to: string): string {
  const dFrom = dayjs(from)
  const dTo = dayjs(to)
  const wholeMonth = dFrom.startOf('month').isSame(dFrom, 'day')
                     && dTo.endOf('month').isSame(dTo, 'day')
                     && dFrom.isSame(dTo, 'month')
  if (wholeMonth) return dFrom.format('MMMM YYYY')
  return `${dFrom.format('D MMM')} → ${dTo.format('D MMM YYYY')}`
}
