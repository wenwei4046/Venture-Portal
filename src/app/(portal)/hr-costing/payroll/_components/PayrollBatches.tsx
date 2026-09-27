import { formatMoney } from '@/lib/utils'
import { batchFundingView, dayTimeLabel, topupSummary, type PayrollBatch, type Tone } from '@/lib/payroll-lifecycle'
import RefileBatchButton from './RefileBatchButton'

interface Props {
  period: string
  batches: PayrollBatch[]
  headline: { text: string; tone: Tone } | null
  closed: boolean
}

/**
 * Submitted to Finance — one line per press of Submit to Finance, with where
 * its money stands (user 2026-09-27: the approval state belongs somewhere of
 * its own, so the Submit button can stay pressable for the next group).
 */
export default function PayrollBatches({ period, batches, headline, closed }: Props) {
  return (
    <section className="mb-10" aria-label="Submitted to Finance">
      <div className="sect-head">
        <h2>Submitted to Finance</h2>
        <span className="rule" aria-hidden />
        <span className="count">{batches.length} BATCH{batches.length === 1 ? '' : 'ES'}</span>
      </div>
      {headline && (
        <p className="text-sm -mt-2 mb-3">
          <span className={`chip ${headline.tone === 'muted' ? '' : headline.tone}`}><span className="dot" />{headline.text}</span>
        </p>
      )}
      <div className="table-frame">
        <div className="table-frame-scroll">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Batch</th>
                <th className="m-hide">Sent</th>
                <th className="m-hide">Who</th>
                <th className="right m-hide">CTC</th>
                <th>Funding</th>
                <th aria-hidden />
              </tr>
            </thead>
            <tbody>
              {batches.map(b => {
                const view = batchFundingView(b)
                const who = b.departments.map(d => `${d.name} ${d.people}`).join(' · ')
                return (
                  <tr key={b.id} className={b.status === 'sent_back' ? 'opacity-60' : undefined}>
                    <td className="font-medium whitespace-nowrap">
                      #{b.no}
                      {b.legacy ? <span className="block text-[11px] font-normal">the whole month</span> : null}
                      {b.topups > 0 ? <span className="block text-[11px] font-normal">{topupSummary(b.topups, b.secondPayrolls)}</span> : null}
                      {/* A phone keeps Batch · Funding; the day and the CTC ride here. */}
                      <span className="block text-[11px] font-normal md:hidden">{dayTimeLabel(b.submittedAt)}</span>
                      <span className="block text-xs font-mono tabular-nums md:hidden">{formatMoney(b.total)}</span>
                    </td>
                    <td className="m-hide whitespace-nowrap">
                      {dayTimeLabel(b.submittedAt)}
                      {b.submittedBy ? <span className="block text-[11px]">{b.submittedBy}</span> : null}
                    </td>
                    <td className="m-hide" data-label="Who">
                      {b.people} {b.people === 1 ? 'person' : 'people'}
                      {who ? <span className="block text-[11px]">{who}</span> : null}
                    </td>
                    <td className="num whitespace-nowrap m-hide">{formatMoney(b.total)}</td>
                    <td>
                      <span className={`chip whitespace-nowrap ${view.tone === 'muted' ? '' : view.tone}`}><span className="dot" />{view.label}</span>
                      {view.detail ? <span className="block text-[11px] mt-1">{view.detail}</span> : null}
                    </td>
                    <td className="right">
                      {view.canRefile && !closed ? <RefileBatchButton period={period} batchId={b.id} batchNo={b.no} amount={b.total} /> : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="table-frame-foot">
          <span>
            Each batch is funded on its own: Finance raises its funding PV, the Principal approves it, and its people
            can be paid on HR › Payment. A resubmit&apos;s or a second payroll&apos;s batch carries only the difference.
          </span>
        </div>
      </div>
    </section>
  )
}
