import { formatMoneyBare } from '@/lib/utils'
import type { TermsChangeComparison, TermsSegment } from '@/lib/treasury-terms'
import RevertTermsButton from './RevertTermsButton'

// The record's terms over time (fund-in / fund-out detail pages): one line
// per segment, then each 从某月起 change with its 差价. Nothing to show for a
// deal whose terms never changed.
//
// 2026-10-10 — the user's Claude Design handoff: the segments in one bordered
// box with the current one tagged green; each change a grey card that folds
// open onto Month / Old interest / New interest / Difference. What the design
// has no column for — the months and the base, the remaining interest, the
// principal, the all-in difference, what was paid and what is short — stays
// inside the card: a line over the table, and a fold of its own under it.

const pct = (r: number) => `${(r * 100).toFixed(3)}%`
const money = (n: number) => (Math.abs(n) < 0.005 ? '—' : formatMoneyBare(n))
const signed = (n: number) => (Math.abs(n) < 0.005 ? '—' : `${n > 0 ? '+' : '−'}${formatMoneyBare(Math.abs(n))}`)
const monthsLabel = (m: number | null) => (m == null ? 'no fixed term' : `${m}mo`)

/** A segment's terms in a line — the Finance phone app's record says it too. */
export function segmentLine(s: TermsSegment, i: number): string {
  let line = `${pct(s.rate)} /mo · ${monthsLabel(s.months)}${s.compounding ? ' · compounding' : ''}`
  if (!s.compounding && s.months) {
    line += ` · monthly RM ${formatMoneyBare(s.principalPerMonth)} + ${formatMoneyBare(s.interestPerMonth)}`
    if (i > 0) line += s.interestOnOriginal ? ` · interest on the original RM ${formatMoneyBare(s.interestBase ?? 0)}` : ` on RM ${formatMoneyBare(s.base)}`
  }
  return line
}

function ChangeCard({ c }: { c: TermsChangeComparison }) {
  const compounding = c.rows.length === 0
  const perMonth = c.new.interestPerMonth - c.old.interestPerMonth
  const hasPaid = c.rows.some((r) => r.paidPrincipal != null)
  const tone = (n: number) => (n > 0.005 ? 'fund-diff' : n < -0.005 ? 'fund-diff-down' : 'fund-diff-nil')
  return (
    <details className="fund-change">
      <summary className="fund-change-head">
        <span>
          <b>From {c.fromYM}</b> · rate {pct(c.old.rate)} → {pct(c.new.rate)} ·{' '}
          {compounding ? 'compounding' : `difference ${perMonth < 0 ? '−' : '+'}RM ${formatMoneyBare(Math.abs(perMonth))} /mo`}
        </span>
        <span className="fund-change-chev" aria-hidden>
          ▼
        </span>
      </summary>
      <div className="fund-change-body">
        <p className="fund-change-note">
          {compounding ? (
            <>compounding — the balance rolls on at the new rate from {c.fromYM}</>
          ) : (
            <>
              {monthsLabel(c.old.months)} → {monthsLabel(c.new.months)}
              {c.old.endYM || c.new.endYM ? ` · ends ${c.old.endYM ?? '—'} → ${c.new.endYM ?? '—'}` : ''} · base RM {formatMoneyBare(c.new.base)}
              {c.new.interestOnOriginal ? ` · interest on the original RM ${formatMoneyBare(c.new.interestBase ?? 0)}` : ''} · monthly{' '}
              {formatMoneyBare(c.old.principalPerMonth + c.old.interestPerMonth)} → {formatMoneyBare(c.new.principalPerMonth + c.new.interestPerMonth)} ·
              remaining interest {formatMoneyBare(c.totals.oldInterest)} → {formatMoneyBare(c.totals.newInterest)} ({signed(c.totals.diffInterest)})
              {c.totals.shortfall > 0.005 ? (
                <>
                  {' · '}
                  <span className="fund-short">short RM {formatMoneyBare(c.totals.shortfall)} on months already due</span>
                </>
              ) : null}
            </>
          )}
          {c.reason ? <> · {c.reason}</> : null}
        </p>
        {compounding ? null : (
          <>
            <table className="fund-change-table" aria-label={`Interest from ${c.fromYM}`}>
              <thead>
                <tr>
                  <th>Month</th>
                  <th className="fund-r">Old interest</th>
                  <th className="fund-r">New interest</th>
                  <th className="fund-r">Difference</th>
                </tr>
              </thead>
              <tbody>
                {c.rows.map((r) => (
                  <tr key={r.ym}>
                    <td>{r.ym}</td>
                    <td className="fund-r">{money(r.oldInterest)}</td>
                    <td className="fund-r">{money(r.newInterest)}</td>
                    <td className={`fund-r ${tone(r.diffInterest)}`}>{signed(r.diffInterest)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <details className="fund-change-more">
              <summary>Principal, all-in and payments</summary>
              <div className="fund-change-scroll">
                <table className="fund-change-table">
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th className="fund-r">Old principal</th>
                      <th className="fund-r">New principal</th>
                      <th className="fund-r">Difference all-in</th>
                      {hasPaid ? (
                        <>
                          <th className="fund-r">Paid</th>
                          <th className="fund-r">Shortfall</th>
                        </>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {c.rows.map((r) => (
                      <tr key={r.ym}>
                        <td>{r.ym}</td>
                        <td className="fund-r">{money(r.oldPrincipal)}</td>
                        <td className="fund-r">{money(r.newPrincipal)}</td>
                        <td className={`fund-r ${tone(r.diffTotal)}`}>{signed(r.diffTotal)}</td>
                        {hasPaid ? (
                          <>
                            <td className="fund-r">{r.paidPrincipal == null ? '' : money(r.paidPrincipal + (r.paidInterest ?? 0))}</td>
                            <td className={`fund-r ${(r.shortfall ?? 0) > 0.005 ? 'fund-short' : ''}`}>{r.shortfall == null ? '' : signed(r.shortfall)}</td>
                          </>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>Total</td>
                      <td className="fund-r">{money(c.totals.oldTotal - c.totals.oldInterest)}</td>
                      <td className="fund-r">{money(c.totals.newTotal - c.totals.newInterest)}</td>
                      <td className={`fund-r ${tone(c.totals.diffTotal)}`}>{signed(c.totals.diffTotal)}</td>
                      {hasPaid ? (
                        <>
                          <td />
                          <td className={`fund-r ${c.totals.shortfall > 0.005 ? 'fund-short' : ''}`}>{signed(c.totals.shortfall)}</td>
                        </>
                      ) : null}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </details>
          </>
        )}
      </div>
    </details>
  )
}

export default function TermsTimeline({
  kind,
  recordId,
  segments,
  changes,
  canRevert,
  bare = false,
}: {
  kind: 'loan' | 'fund_source'
  recordId: string
  segments: TermsSegment[]
  changes: TermsChangeComparison[]
  /** Principal may undo the latest change. */
  canRevert: boolean
  /** Inside a full page's card (2026-10-15, D06): the card's strip names it and counts the changes. */
  bare?: boolean
}) {
  if (!segments.some((s) => s.changed)) return null
  const Wrap = bare ? 'div' : 'section'
  return (
    <Wrap className={bare ? undefined : 'mb-9'}>
      {bare ? null : (
        <div className="sect-head">
          <h2>Terms over time</h2>
          <span className="rule" aria-hidden />
          <span className="count">
            {changes.length} CHANGE{changes.length === 1 ? '' : 'S'}
          </span>
        </div>
      )}
      <div className="fund-segs">
        {segments.map((s, i) => {
          const current = i === segments.length - 1
          return (
            <div key={s.fromYM} className={`fund-seg${current ? ' fund-current' : ''}`}>
              <span className="fund-seg-range">
                {s.fromYM} → {s.toYM ?? (s.compounding ? 'open' : s.scheduledEndYM ?? 'open')}
              </span>
              {current ? <span className="fund-seg-tag">current</span> : null}
              <span className="fund-seg-desc">{segmentLine(s, i)}</span>
            </div>
          )
        })}
      </div>
      {changes.map((c) => (
        <ChangeCard key={c.fromYM} c={c} />
      ))}
      {canRevert && changes.length > 0 ? (
        <div className="mt-4">
          <RevertTermsButton kind={kind} recordId={recordId} latestFrom={changes[changes.length - 1].fromYM} />
        </div>
      ) : null}
    </Wrap>
  )
}
