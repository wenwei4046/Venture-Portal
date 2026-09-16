import Link from 'next/link'
import { formatDate, formatMoney } from '@/lib/utils'
import LedgerRow from '@/components/LedgerRow'
import {
  OPEN_BILL_ORDINAL,
  type OpenBillBill,
  type OpenBillSummary,
} from '@/lib/commission/open-bill-summary'

interface Props {
  summary: OpenBillSummary
  /** `/revenue/fair/2026-08-01/orders` — where a pick is made and a bill opens. */
  ordersPath: string
  /** The narrow board: only the days still resting on a suggestion. */
  queuePath: string
  /** Null when the month has never been computed. */
  runStatus: 'draft' | 'computed' | 'applied' | 'locked' | null
  /** The month arrived on the live ERP feed, which suggests better than a file does. */
  fromFeed: boolean
}

/**
 * What the month's Open Bill picks cost.
 *
 * The pick itself is made on the bill, one at a time — this is the money it
 * adds up to, which is the only way to answer "how much did this incentive
 * give away". Three grains, all of one population: by rank, by salesperson,
 * and every picked bill.
 *
 * The money is READ FROM THE RUN, never recomputed, so a month nobody has
 * computed shows its picks and says plainly that nothing has been paid on
 * them rather than quoting a figure the engine never agreed to.
 */
export default function OpenBillSection({
  summary,
  ordersPath,
  queuePath,
  runStatus,
  fromFeed,
}: Props) {
  const { byRank, byPerson, bills, totals, carriedIn, paidInAll } = summary
  const hasRun = runStatus !== null
  const paidOut = hasRun && paidInAll > 0
  /** Bills this run actually paid an uplift on, this month's and carried-in. */
  const billsPaid = bills.filter(b => b.paid !== null).length + carriedIn.bills

  if (totals.bills === 0) {
    return (
      <section>
        <p className="font-serif italic text-muted text-sm mb-4 max-w-3xl">
          The 1st, 2nd and 3rd bill a salesperson writes on an event day earn an uplift on top of
          that bill&apos;s own commission.
        </p>
        <div className="py-12 text-center border border-hairline rounded-card bg-surface">
          <p className="font-serif text-xl text-ink mb-2">No bill of this month carries a pick.</p>
          <p className="font-serif italic text-muted text-sm max-w-md mx-auto">
            The picks are made on{' '}
            <Link href={ordersPath} className="text-accent hover:underline">
              the bills themselves
            </Link>
            .
          </p>
        </div>
      </section>
    )
  }

  return (
    <section>
      <p className="font-serif italic text-muted text-sm mb-2 max-w-3xl">
        The 1st, 2nd and 3rd bill a salesperson writes on an event day earn an uplift on top of that
        bill&apos;s own commission — the same sale pays more for being early. This is what the
        month&apos;s picks cost; the picks themselves are made on{' '}
        <Link href={ordersPath} className="text-accent hover:underline">
          the bill itself
        </Link>
        .
      </p>
      {totals.suggested > 0 ? (
        <p className="font-serif italic text-muted text-sm mb-4 max-w-3xl">
          <span className="text-alert">
            {totals.suggested} of {totals.bills}
          </span>{' '}
          are still the importer&apos;s guess:{' '}
          {fromFeed
            ? 'the ERP feed suggests them from each order’s real creation time and re-suggests as orders arrive; a pick made here is never touched.'
            : 'they are seeded from the document number, not from a real time of day.'}{' '}
          <Link href={queuePath} className="text-accent hover:underline">
            The review board
          </Link>{' '}
          takes them a day at a time.
        </p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Pick</th>
              <th className="m-hide">Uplift</th>
              <th className="right">Bills</th>
              <th className="right m-hide">Still a guess</th>
              <th className="right m-hide">Sales value</th>
              <th className="right">Extra paid</th>
              <th className="lt-toggle" aria-hidden />
            </tr>
          </thead>
          <tbody>
            {byRank.map(r => (
              <LedgerRow key={r.rank}>
                <td>
                  <span className="font-serif text-[15px] text-ink">
                    {OPEN_BILL_ORDINAL[r.rank]} bill of the day
                  </span>
                </td>
                <td className="m-hide" data-label="Uplift">
                  <span className="font-mono text-[11px] text-graphite">
                    {r.pct === null ? 'no rate set' : `+${round1(r.pct * 100)}% of its commission`}
                  </span>
                </td>
                <td className="num">{r.bills}</td>
                <td className="num m-hide" data-label="Still a guess">
                  {r.suggested === 0 ? '—' : <span className="text-alert">{r.suggested}</span>}
                </td>
                <td className="num m-hide" data-label="Sales value">{formatMoney(r.salesValue)}</td>
                <td className="num">{hasRun ? formatMoney(r.paid) : '—'}</td>
              </LedgerRow>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-hairline">
              <td className="font-serif italic text-ink font-medium">This month&apos;s picks</td>
              <td className="m-hide" />
              <td className="num font-semibold">{totals.bills}</td>
              <td className="num m-hide">
                {totals.suggested === 0 ? '—' : <span className="text-alert">{totals.suggested}</span>}
              </td>
              <td className="num m-hide">{formatMoney(totals.salesValue)}</td>
              <td className="num font-semibold">{hasRun ? formatMoney(totals.paid) : '—'}</td>
              <td className="lt-toggle" aria-hidden />
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="font-serif italic text-muted text-xs mt-3 max-w-3xl">
        {!hasRun ? (
          <>
            Nothing has been computed for this month, so none of it has been paid. Compute the run
            above and the uplift each pick earned appears here, read from the run itself.
          </>
        ) : (
          <>
            This run paid <strong className="text-ink">{formatMoney(paidInAll)}</strong> of Open Bill
            in all
            {carriedIn.bills > 0 ? (
              <>
                : {formatMoney(totals.paid)} on this month&apos;s picks and{' '}
                {formatMoney(carriedIn.paid)} on {carriedIn.bills} bill
                {carriedIn.bills === 1 ? '' : 's'} carried in from earlier months — a bill held by
                the deposit gate brings its pick with it when the deposit clears
              </>
            ) : null}
            .{' '}
            {totals.held > 0 ? (
              <>
                {totals.held} picked bill{totals.held === 1 ? ' is' : 's are'} still waiting on a
                deposit: their uplift is not lost, it pays in the month the deposit clears.{' '}
              </>
            ) : null}
            {totals.missingFromRun > 0 ? (
              <>
                <strong className="text-alert">
                  {totals.missingFromRun} picked bill{totals.missingFromRun === 1 ? ' is' : 's are'}{' '}
                  not in this run at all
                </strong>
                {' '}— which is what a bill that arrived after the run was computed looks like.
                Recompute the month to pay them.{' '}
              </>
            ) : null}
            {runStatus === 'draft' || runStatus === 'computed' ? (
              <>This run has not been paid yet, so changing a pick and recomputing still moves it.</>
            ) : (
              <>This run has been paid; reopen it to change a pick.</>
            )}
          </>
        )}
      </p>

      <div className="sect-head mt-10">
        <h2>By salesperson</h2>
        <span className="rule" aria-hidden />
        <span className="count">{byPerson.length} PEOPLE</span>
      </div>
      <div className="overflow-x-auto">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Salesperson</th>
              <th className="right m-hide">1st</th>
              <th className="right m-hide">2nd</th>
              <th className="right m-hide">3rd</th>
              <th className="right">Bills</th>
              <th className="right m-hide">Sales value</th>
              <th className="right">Extra paid</th>
              <th className="lt-toggle" aria-hidden />
            </tr>
          </thead>
          <tbody>
            {byPerson.map(p => (
              <LedgerRow key={p.key}>
                <td>
                  <Link
                    href={`${ordersPath}?staff=${p.staffId ?? 'unmatched'}`}
                    className={p.matched ? 'text-ink hover:text-accent' : 'text-danger hover:underline'}
                  >
                    {p.name}
                  </Link>
                  {p.held > 0 ? (
                    <div className="font-mono text-[10.5px] text-alert mt-0.5">
                      {p.held} WAITING ON A DEPOSIT
                    </div>
                  ) : null}
                </td>
                <td className="num m-hide" data-label="1st">{p.byRank[1] || '—'}</td>
                <td className="num m-hide" data-label="2nd">{p.byRank[2] || '—'}</td>
                <td className="num m-hide" data-label="3rd">{p.byRank[3] || '—'}</td>
                <td className="num">{p.bills}</td>
                <td className="num m-hide" data-label="Sales value">{formatMoney(p.salesValue)}</td>
                <td className="num">{hasRun ? formatMoney(p.paid) : '—'}</td>
              </LedgerRow>
            ))}
          </tbody>
          {paidOut ? (
            <tfoot>
              <tr className="border-t-2 border-hairline">
                <td className="font-serif italic text-ink font-medium">
                  Open Bill in this run
                </td>
                <td className="m-hide" />
                <td className="m-hide" />
                <td className="m-hide" />
                <td className="num font-semibold">{billsPaid}</td>
                <td className="num m-hide" />
                <td className="num font-semibold">{formatMoney(paidInAll)}</td>
                <td className="lt-toggle" aria-hidden />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
      {paidOut && carriedIn.bills > 0 ? (
        <p className="font-serif italic text-muted text-xs mt-3 max-w-3xl">
          The rows are this month&apos;s picks. The total is every bill this run paid an uplift on —
          including {carriedIn.bills} carried in from earlier months — so it is the Open Bill figure
          that reaches the statements.
        </p>
      ) : null}

      <div className="sect-head mt-10">
        <h2>Every picked bill</h2>
        <span className="rule" aria-hidden />
        <span className="count">{bills.length} BILLS</span>
      </div>
      <div className="overflow-x-auto">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Bill</th>
              <th className="m-hide">Event day</th>
              <th className="m-hide">Salesperson</th>
              <th className="m-hide">Venue</th>
              <th>Pick</th>
              <th className="right m-hide">Sales value</th>
              <th className="right">Extra</th>
              <th className="lt-toggle" aria-hidden />
            </tr>
          </thead>
          <tbody>
            {bills.map(b => (
              <LedgerRow key={b.orderId}>
                <td>
                  <Link
                    href={`${ordersPath}/${b.orderId}`}
                    className="font-mono text-xs text-ink hover:text-accent"
                  >
                    {b.orderNo}
                  </Link>
                  {b.customerName ? (
                    <div className="font-serif text-[11px] text-muted mt-0.5">{b.customerName}</div>
                  ) : null}
                </td>
                <td className="font-mono text-xs text-graphite m-hide" data-label="Event day">
                  {formatDate(b.eventDate)}
                </td>
                <td className="m-hide" data-label="Salesperson">
                  {b.matched ? (
                    <Link
                      href={`${ordersPath}?staff=${b.staffId}`}
                      className="font-serif text-[14px] text-ink hover:text-accent"
                    >
                      {b.name}
                    </Link>
                  ) : (
                    <span className="text-danger font-serif text-[14px]">{b.name}</span>
                  )}
                </td>
                <td className="m-hide" data-label="Venue">
                  <span className="font-serif text-[13px] text-graphite">{b.venue ?? '—'}</span>
                </td>
                <td data-label="Pick">
                  <PickChip bill={b} />
                </td>
                <td className="num m-hide" data-label="Sales value">{formatMoney(b.salesValue)}</td>
                <td className="num">
                  <Extra bill={b} hasRun={hasRun} />
                </td>
              </LedgerRow>
            ))}
          </tbody>
        </table>
      </div>
      <p className="font-serif italic text-muted text-xs mt-3 max-w-3xl">
        A pick in a <span className="text-alert">dashed outline</span> is still the importer&apos;s
        guess; a solid one is somebody&apos;s decision. &quot;Extra&quot; is the uplift alone — the
        bill&apos;s own commission is on{' '}
        <Link href={ordersPath} className="text-accent hover:underline">
          its own row
        </Link>
        , and the uplift is cut by the margin band in the same proportion as the commission it rides
        on.
      </p>
    </section>
  )
}

/**
 * What the uplift on one bill came to — or why it is not a figure.
 *
 * A dash would say "nothing" for five different situations, one of which
 * (a bill the run has never seen, because it arrived after the run was
 * computed) is the one worth acting on.
 */
function Extra({ bill, hasRun }: { bill: OpenBillBill; hasRun: boolean }) {
  if (bill.paid !== null) return <>{formatMoney(bill.paid)}</>
  if (!bill.matched)
    return <span className="font-serif italic text-danger text-sm">Nobody to pay</span>
  if (bill.held) return <span className="font-serif italic text-alert text-sm">Held</span>
  if (bill.commissionable === 0)
    return (
      <span className="font-serif italic text-muted text-sm" title="No line of this bill earns a rate">
        No base
      </span>
    )
  if (hasRun) return <span className="font-serif italic text-alert text-sm">Not in this run</span>
  return <>—</>
}

function PickChip({ bill }: { bill: OpenBillBill }) {
  return (
    <span
      title={
        bill.suggested
          ? 'Still the importer’s guess from the document number'
          : 'Picked by somebody here'
      }
      className={[
        'font-mono text-[10px] leading-none px-1.5 py-1 rounded-control border inline-block',
        bill.suggested
          ? 'border-dashed border-alert text-alert bg-alert-bg font-semibold'
          : 'bg-accent border-accent text-white',
      ].join(' ')}
    >
      {OPEN_BILL_ORDINAL[bill.rank]}
    </span>
  )
}

function round1(v: number): number {
  return Math.round(v * 10) / 10
}
