'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition, type ReactNode } from 'react'
import { formatMoney } from '@/lib/utils'
import { groupPapers, type CarriedMonth, type DoubleClaimBill, type DoubleClaimGroup } from '@/lib/commission/double-claims'
import type { ClaimExplanation, ClaimVerdict, Sameness } from '@/lib/commission/double-claim-reasons'
import { dismissDoubleClaim, restoreDoubleClaim } from '../../../double-claim-actions'
import PaperRefCell from './PaperRefCell'
import s from './commission-workbench.module.css'
import d from './double-claims.module.css'

/** A bill of the month whose Ref No. names no paper number, so the check cannot match it. */
export interface UnreadableBill {
  orderId: string
  orderNo: string
  /** The ERP's Ref No. as typed — "6760", "-" — or null when there is none. */
  refNo: string | null
  /** The salesperson, or the ERP's agent string when nobody is matched. */
  seller: string
  orderTotal: number
}

interface Props {
  period: string
  subDepartmentId: string
  /** `/revenue/fair` — a bill's own page is `${base}/${month}/orders/${id}`. */
  basePath: string
  groups: DoubleClaimGroup[]
  carried: CarriedMonth[]
  /**
   * The month's bills the check cannot see (2026-10-03): it matches bills on
   * the paper number in the ERP's Ref No., and these name none — a second bill
   * on the same paper would go unnoticed.
   */
  unreadable?: UnreadableBill[]
  /** Why the check could not run, when it could not. */
  unavailable: string | null
  /** Why each group was flagged, by paper number (`lib/commission/double-claim-reasons.ts`). */
  explanations?: Record<string, ClaimExplanation>
  /** What of the evidence behind the reasons could not be read. */
  evidenceUnavailable?: string | null
  /** Where a bill opened from here leads back to — this tab, on this month. */
  returnTo?: string
  /**
   * A tab of the month's workbench (2026-09-30): drawn whatever it holds, with
   * an empty state. Alone on a page it says nothing when there is nothing.
   */
  inTab?: boolean
}

const TONE: Record<ClaimVerdict, 'danger' | 'alert' | 'quiet'> = {
  paid_again: 'danger', copy: 'danger', second_sale: 'alert', number_only: 'alert', split: 'quiet', settled: 'quiet',
}
const CHIP: Record<ClaimVerdict, string> = {
  paid_again: 'danger', copy: 'danger', second_sale: 'alert', number_only: 'alert', split: 'info', settled: 'ledger',
}
const MATCH: Record<Sameness, string> = { same: '✓ Same', differs: '≠ Differs', unknown: '? Can’t tell' }

function monthName(period: string, style: 'long' | 'short' = 'long'): string {
  return new Date(`${period}T00:00:00Z`).toLocaleString('en-US', { month: style, year: 'numeric', timeZone: 'UTC' })
}

function list(words: string[]): string {
  return words.length <= 1 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`
}

function Summary({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className={s.summary}><span className={s.summaryLabel}>{label}</span><strong className={s.summaryValue}>{value}</strong>{note && <small>{note}</small>}</div>
}

/**
 * "Is anything here claimed twice — and why do you think so?" (user
 * 2026-09-26, then 2026-09-30: 我要你全部都写原因 … 把过去的 history 拿出来).
 *
 * A tab of the month's workbench since 2026-09-30; it sat above the month's
 * cards until then. Two ways a bill gets paid twice, both said here: the same
 * paper number on two bills (a month worked out by hand, and the ERP keying it
 * again), and bills carried in from a month no run of the portal ever paid
 * (`lib/commission/double-claims.ts`). Every group of the first kind opens on
 * WHY it is here — its verdict, its findings, what to do — then lays its bills
 * side by side and tells each one's history
 * (`lib/commission/double-claim-reasons.ts`). Only the first kind can be
 * answered here; the second is a decision about months, not bills.
 */
export default function DoubleClaimPanel({
  period, subDepartmentId, basePath, groups, carried, unreadable = [], unavailable, explanations, evidenceUnavailable = null, returnTo, inTab = false,
}: Props) {
  const router = useRouter()
  const [showChecked, setShowChecked] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const openGroups = groups.filter(g => !g.dismissed)
  const checked = groups.filter(g => g.dismissed)
  const carriedBills = carried.reduce((a, c) => a + c.bills, 0)
  const carriedValue = carried.reduce((a, c) => a + c.value, 0)

  if (!inTab && !unavailable && openGroups.length === 0 && checked.length === 0 && carried.length === 0 && unreadable.length === 0) return null

  const explained = openGroups.map(g => explanations?.[g.billRef]).filter((x): x is ClaimExplanation => Boolean(x))
  const twice = explained.filter(x => x.verdict === 'paid_again' || x.verdict === 'copy')
  const apart = explained.filter(x => x.verdict === 'split' || x.verdict === 'second_sale' || x.verdict === 'settled')
  const atRisk = twice.reduce((a, x) => a + x.atRisk, 0)

  function answer(action: () => Promise<unknown>) {
    setError(null)
    startTransition(async () => {
      try {
        await action()
        router.refresh()
      } catch (err) {
        const text = err instanceof Error ? err.message : 'That did not save'
        if (!text.includes('NEXT_REDIRECT')) setError(text)
      }
    })
  }

  const billHref = (b: Pick<DoubleClaimBill, 'periodMonth' | 'orderId'>) =>
    `${basePath}/${b.periodMonth}/orders/${b.orderId}${returnTo ? `?from=${encodeURIComponent(returnTo)}` : ''}`
  const unreadableValue = unreadable.reduce((a, b) => a + b.orderTotal, 0)

  function answerButton(g: DoubleClaimGroup): ReactNode {
    return g.dismissed ? (
      <button type="button" className={s.ghostButton} disabled={pending}
        onClick={() => answer(() => restoreDoubleClaim(subDepartmentId, g.billRef))}>
        Ask again
      </button>
    ) : (
      <button type="button" className={s.button} disabled={pending}
        title="Say so once; a new bill under this number asks again"
        onClick={() => {
          if (window.confirm(`${groupPapers(g)}: these ${g.bills.length} bills are separate sales, not one bill claimed twice?`)) {
            answer(() => dismissDoubleClaim(subDepartmentId, g.billRef))
          }
        }}>
        Checked — separate sales
      </button>
    )
  }

  /** A group with nothing read behind it: which bills, and where each came from. */
  function plain(g: DoubleClaimGroup) {
    const across = g.months.length > 1
    return (
      <article key={g.billRef} className={d.card} aria-label={`${groupPapers(g)} on ${g.bills.length} bills`}>
        <div className={d.head}>
          <div className={d.headTop}>
            <span className={d.ref}>{groupPapers(g)}</span>
            <span className={d.meta}>
              {across ? `on ${g.bills.length} bills in ${list(g.months.map(m => monthName(m)))}` : `on ${g.bills.length} bills in ${monthName(g.months[0])}`}
            </span>
          </div>
        </div>
        <div className={d.compareWrap}>
          <div className={s.tableFrame}><div className={s.tableScroll}>
            <table className={s.table}>
              <thead><tr><th>Month</th><th>Bill</th><th>Salesperson</th><th className={s.numeric}>Sales value</th><th>Came from</th></tr></thead>
              <tbody>
                {g.bills.map(b => (
                  <tr key={b.orderId}>
                    <td>{monthName(b.periodMonth, 'short')}</td>
                    <td><Link href={billHref(b)}>{b.orderNo}</Link></td>
                    <td>{b.employeeName ?? b.agentName}</td>
                    <td className={s.numeric}>{formatMoney(b.orderTotal)}</td>
                    <td>{b.source === 'erp_sync' ? 'ERP' : 'Imported'}{b.paidByRun ? ' · already paid by a run' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div></div>
        </div>
        <div className={d.foot}>{answerButton(g)}</div>
      </article>
    )
  }

  function card(g: DoubleClaimGroup) {
    const x = explanations?.[g.billRef]
    if (!x) return plain(g)
    const people = [...new Set(g.bills.map(b => b.employeeName ?? b.agentName))]
    return (
      <article key={g.billRef} className={d.card} data-tone={g.dismissed ? 'quiet' : TONE[x.verdict]}
        aria-labelledby={`claim-${g.billRef}`}>
        <div className={d.head}>
          <div className={d.headTop}>
            <span className={d.ref}>{groupPapers(g)}</span>
            <span className={`chip ${CHIP[x.verdict]}`}><span className="dot" />{x.label}</span>
            <span className={d.meta}>
              {g.bills.length} bills · {list(g.months.map(m => monthName(m)))} · {list(people)}
            </span>
          </div>
          <h3 id={`claim-${g.billRef}`} className={d.headline}>{x.headline}</h3>
        </div>

        <div className={d.why}>
          <h4>Why it is here</h4>
          <ul className={d.reasons}>{x.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
          <p className={d.action}><strong>What to do: </strong>{x.action}</p>
        </div>

        <div className={d.compareWrap}>
          <div className={s.tableFrame}>
            <div className={`${s.tableScroll} ${d.unbounded}`} role="region" tabIndex={0} aria-label={`${g.billRef}: the bills side by side, scroll horizontally`}>
              <table className={`${s.table} ${d.compare}`} aria-label={`${g.billRef}: the bills side by side`}>
                <thead>
                  <tr>
                    <th className={s.stickyFirst} scope="col">Bill</th>
                    {g.bills.map(b => (
                      <th key={b.orderId} scope="col">
                        <Link href={billHref(b)}>{b.orderNo}</Link>
                        <small>{monthName(b.periodMonth, 'short')}{b.periodMonth === period ? ' · this month' : ''}</small>
                      </th>
                    ))}
                    <th scope="col" className={d.match}>Match</th>
                  </tr>
                </thead>
                <tbody>
                  {x.facts.map(f => (
                    <tr key={f.label}>
                      <th scope="row" className={s.stickyFirst}>{f.label}</th>
                      {f.values.map((v, i) => (
                        <td key={g.bills[i]?.orderId ?? i}>{v}{f.notes[i] ? <small>{f.notes[i]}</small> : null}</td>
                      ))}
                      <td className={d.match}>
                        {f.same ? <span className={d[f.same]}>{MATCH[f.same]}</span> : null}
                        {f.gap ? <small>{f.gap}</small> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className={d.histories}>
          {g.bills.map(b => (
            <section key={b.orderId} className={d.history} aria-label={`History of ${b.orderNo}`}>
              <h4>History of <Link href={billHref(b)}>{b.orderNo}</Link></h4>
              <ol className={d.timeline}>
                {(x.history[b.orderId] ?? []).map((e, i) => (
                  <li key={i} data-tone={e.tone}>
                    {e.when ? <span className={d.when}>{e.when}</span> : null}
                    {e.text}
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>

        <div className={d.foot}>{answerButton(g)}</div>
      </article>
    )
  }

  return (
    <section aria-label="Possible double claims">
      <div className={s.topLine}>
        <h2 className={s.sectionHeading}>Possible double claims</h2>
        {atRisk > 0 ? (
          <div className={s.overviewTotal}>
            <span>Would be paid twice</span>
            <strong>{formatMoney(atRisk)}</strong>
            <small>Sales value of the copies below</small>
          </div>
        ) : null}
      </div>

      {openGroups.length > 0 || checked.length > 0 ? (
        <div className={s.summaryGrid}>
          <Summary label="To check" value={String(openGroups.length)} note={`${list(openGroups.map(g => g.billRef).slice(0, 3))}${openGroups.length > 3 ? ' …' : ''}`} />
          <Summary label="Would pay twice" value={String(twice.length)} note="Already claimed, or the same sale twice" />
          <Summary label="Probably separate" value={String(apart.length)} note="One sale in parts, a later bill, a settled month" />
          <Summary label="Checked — separate sales" value={String(checked.length)} />
        </div>
      ) : null}

      {unavailable ? (
        <p className={s.warning} role="alert">The check for bills claimed twice could not run: {unavailable}</p>
      ) : null}
      {evidenceUnavailable ? (
        <p className={s.warning}>
          Some of the history behind these bills could not be read — {evidenceUnavailable} The reasons below
          use what could.
        </p>
      ) : null}

      {openGroups.map(card)}

      {inTab && !unavailable && openGroups.length === 0 && carried.length === 0 ? (
        <div className={`${s.tableFrame} ${s.empty}`}>
          No bill of {monthName(period)} shares its paper number with another bill.
          {checked.length ? ` ${checked.length} checked earlier ${checked.length === 1 ? 'is' : 'are'} below.` : ''}
        </div>
      ) : null}

      {/* What the check cannot see (2026-10-03, user: 你 check 一下是否能 capture 得到). */}
      {unreadable.length > 0 ? (
        <details className={d.unreadable}>
          <summary>
            <strong>
              {unreadable.length} {unreadable.length === 1 ? 'bill' : 'bills'} of {monthName(period)} cannot be
              checked · {formatMoney(unreadableValue)}
            </strong>
            <span>
              {unreadable.length === 1 ? 'Its' : 'Their'} Ref No. in the ERP names no paper number, so a second bill
              on the same paper would not be found.
            </span>
          </summary>
          <p>Key the handwritten bill&apos;s number into the Ref No. of each in the ERP.</p>
          <div className={s.tableFrame}>
            <div className={`${s.tableScroll} ${d.unbounded}`}>
              <table className={s.table} aria-label="Bills the double-claim check cannot read">
                <thead><tr><th>Bill</th><th>Ref No.</th><th>Salesperson</th><th className={s.numeric}>Sales value</th></tr></thead>
                <tbody>
                  {unreadable.map(b => (
                    <tr key={b.orderId}>
                      <td><Link href={billHref({ periodMonth: period, orderId: b.orderId })}>{b.orderNo}</Link></td>
                      <td><PaperRefCell refNo={b.refNo} paperNo={null} /></td>
                      <td>{b.seller}</td>
                      <td className={s.numeric}>{formatMoney(b.orderTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </details>
      ) : null}

      {carried.length > 0 ? (
        <div className={d.carried}>
          <h3>
            {carriedBills} {carriedBills === 1 ? 'bill' : 'bills'} carried in from {list(carried.map(c => monthName(c.periodMonth)))} · {formatMoney(carriedValue)}
          </h3>
          <p>
            The run pays every earlier bill that no run in the portal has paid, and no run has paid{' '}
            {list(carried.map(c => monthName(c.periodMonth)))}. If {carried.length === 1 ? 'that month was' : 'those months were'}{' '}
            paid by hand, computing {monthName(period)} would pay these bills again. They are counted in each
            salesperson&apos;s orders, marked &ldquo;Carried from&rdquo; on their bills.
          </p>
          <ul>
            {carried.map(c => (
              <li key={c.periodMonth}>
                {monthName(c.periodMonth, 'short')} · {c.bills} {c.bills === 1 ? 'bill' : 'bills'} · {formatMoney(c.value)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {checked.length > 0 ? (
        <div className={d.checked}>
          <button type="button" className={s.ghostButton} onClick={() => setShowChecked(v => !v)} aria-expanded={showChecked}>
            {showChecked ? 'Hide' : 'Show'} {checked.length} checked — separate sales
          </button>
          {showChecked ? <div className="mt-3">{checked.map(card)}</div> : null}
        </div>
      ) : null}

      {error ? <p role="alert" className={s.warning}>{error}</p> : null}
    </section>
  )
}
