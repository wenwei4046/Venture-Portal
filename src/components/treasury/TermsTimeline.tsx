import { formatMoneyBare } from '@/lib/utils'
import type { TermsChangeComparison, TermsSegment } from '@/lib/treasury-terms'
import { TermsChangeSummary, TermsChangeTable } from './TermsChangeTable'
import RevertTermsButton from './RevertTermsButton'

// The record's terms over time (fund-in / fund-out detail pages): one line
// per segment, then each 从某月起 change with its 差价. Nothing to show for a
// deal whose terms never changed.

const pct = (r: number) => `${(r * 100).toFixed(3)}%/mo`

export default function TermsTimeline({
  kind,
  recordId,
  segments,
  changes,
  canRevert,
}: {
  kind: 'loan' | 'fund_source'
  recordId: string
  segments: TermsSegment[]
  changes: TermsChangeComparison[]
  /** Principal may undo the latest change. */
  canRevert: boolean
}) {
  if (!segments.some((s) => s.changed)) return null
  return (
    <section className="mb-12">
      <div className="sect-head">
        <h2>Terms over time</h2>
        <span className="rule" aria-hidden />
        <span className="count">{changes.length} CHANGE{changes.length === 1 ? '' : 'S'}</span>
      </div>
      <ol className="space-y-1.5 max-w-4xl mb-5">
        {segments.map((s, i) => {
          const last = i === segments.length - 1
          return (
            <li key={s.fromYM} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-sans text-sm">
              <span className="font-mono text-ink w-40 shrink-0">
                {s.fromYM} → {s.toYM ?? (s.compounding ? 'open' : s.scheduledEndYM ?? 'open')}
              </span>
              <span className="text-graphite">
                {pct(s.rate)} · {s.months == null ? 'no fixed term' : `${s.months}mo`}
                {s.compounding ? ' · compounding' : ''}
                {!s.compounding && s.months ? (
                  <>
                    {' · '}monthly RM {formatMoneyBare(s.principalPerMonth)} + {formatMoneyBare(s.interestPerMonth)}
                    {i > 0 ? <> on RM {formatMoneyBare(s.base)}</> : null}
                  </>
                ) : null}
              </span>
              {last ? (
                <span className="font-mono text-[10px] uppercase tracking-wider text-ledger border border-hairline rounded px-1.5 py-0.5">current</span>
              ) : null}
            </li>
          )
        })}
      </ol>
      <div className="space-y-4 max-w-4xl">
        {changes.map((c) => (
          <details key={c.fromYM} className="border border-hairline rounded-md bg-surface p-4">
            <summary className="cursor-pointer">
              <TermsChangeSummary c={c} />
            </summary>
            <TermsChangeTable c={c} />
          </details>
        ))}
      </div>
      {canRevert && changes.length > 0 ? (
        <div className="mt-4">
          <RevertTermsButton kind={kind} recordId={recordId} latestFrom={changes[changes.length - 1].fromYM} />
        </div>
      ) : null}
    </section>
  )
}
