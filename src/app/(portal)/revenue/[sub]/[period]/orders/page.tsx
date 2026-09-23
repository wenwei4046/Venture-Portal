import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney, formatDate } from '@/lib/utils'
import { revenuePath } from '@/lib/revenue'
import { venueKey } from '@/lib/venues'
import LedgerRow from '@/components/LedgerRow'
import { requireSubDepartment } from '../../../_lib/sub-departments'
import {
  exclusionReason,
  loadMonthOrders,
  loadOrderShares,
  loadShareTeam,
  loadUncostedProducts,
  type MonthOrder,
} from '../../../_lib/month-orders'
import OpenBillPicker from './_components/OpenBillPicker'
import CostGapPanel from './_components/CostGapPanel'
import ShareControl from './_components/ShareControl'

interface PageProps {
  params: Promise<{ sub: string; period: string }>
  searchParams: Promise<{ staff?: string; venue?: string; show?: string }>
}

function label(period: string): string {
  return new Date(period + 'T00:00:00Z').toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function pct(v: number | null): string {
  return v === null ? '—' : `${(v * 100).toFixed(1)}%`
}

/**
 * Every bill of a month, one row each.
 *
 * THE PAGE THAT ANSWERS "WHY IS HER COMMISSION THAT?". The month page and the
 * statement both read the RUN — a snapshot of figures the engine committed to —
 * which is right, and useless when the question is whether the figures started
 * from the right bills. This reads the ORDERS, so the answer is checkable
 * against the ERP document by document: the customer, the venue, the brand,
 * what was paid, whether the deposit gate holds it, which Open Bill of its day
 * it is, and what its lines cost.
 *
 * Filters are links, not state: a person's bills are a URL somebody can send
 * to the person whose bills they are.
 *
 * IT IS ALSO WHERE THE OPEN BILL PICK IS MADE (2026-09-16). The pick used to
 * live on its own board, which showed the order number and the value and
 * nothing else — but which of a day's bills came first is argued from the
 * margin, the venue and the customer, and those were one page away. So the
 * decision moved to the row that carries its evidence. The board stays as the
 * narrow queue: only the days still resting on a suggestion.
 */
export default async function MonthOrdersPage({ params, searchParams }: PageProps) {
  await requirePermission('revenue')
  const { sub, period } = await params
  if (!/^\d{4}-\d{2}-01$/.test(period)) notFound()
  const { staff: staffFilter, venue: venueFilter, show } = await searchParams

  const subDept = await requireSubDepartment(sub)
  const supabase = (await createClient()) as unknown as SupabaseClient
  const [all, uncosted] = await Promise.all([
    loadMonthOrders(supabase, subDept.id, period),
    loadUncostedProducts(supabase, subDept.id, period),
  ])

  // The Open Bill pick belongs on the row, but only where the scheme pays one
  // and only while the run it would change is still open.
  const [{ data: scheme }, { data: locked, error: lockError }] = await Promise.all([
    subDept.schemeId
      ? supabase.from('comm_schemes').select('enable_open_bill').eq('id', subDept.schemeId).single()
      : Promise.resolve({ data: null }),
    supabase.rpc('commission_order_period_locked', {
      p_sub_department_id: subDept.id,
      p_period: period,
    }),
  ])
  if (lockError) throw new Error(`Could not check the commission run: ${lockError.message}`)
  const openBillPaid = Boolean((scheme as { enable_open_bill: boolean } | null)?.enable_open_bill)
  const runLocked = Boolean(locked)

  // Who else holds a part of each bill, and who a bill may be shared with.
  const [shares, team] = await Promise.all([
    loadOrderShares(supabase, all.map(o => o.orderId)),
    loadShareTeam(supabase, subDept.schemeId),
  ])
  const sharesByOrder = new Map<string, typeof shares>()
  for (const sh of shares) sharesByOrder.set(sh.orderId, [...(sharesByOrder.get(sh.orderId) ?? []), sh])

  const includeExcluded = show === 'all'
  const rows = all.filter(o => {
    if (!includeExcluded && o.cancelled) return false
    if (staffFilter === 'unmatched' && o.staffId) return false
    // A person's bills include the ones shared TO them: that part is theirs.
    if (
      staffFilter &&
      staffFilter !== 'unmatched' &&
      o.staffId !== staffFilter &&
      !(sharesByOrder.get(o.orderId) ?? []).some(sh => sh.staffId === staffFilter)
    ) {
      return false
    }
    // The filter is a PLACE, not a spelling: merged venues answer as one.
    if (venueFilter !== undefined && (o.venueGroupKey ?? '') !== venueFilter) return false
    return true
  })

  const person = staffFilter && staffFilter !== 'unmatched'
    ? all.find(o => o.staffId === staffFilter)
    : undefined
  const venueName = venueFilter !== undefined
    ? (() => {
        const hit = all.find(o => (o.venueGroupKey ?? '') === venueFilter)
        return hit?.venueGroupName ?? hit?.venue ?? '(no venue)'
      })()
    : null

  const total = rows.reduce((a, o) => a + o.orderTotal, 0)
  const held = rows.filter(o => !o.cancelled && !o.depositMet)
  const heldValue = held.reduce((a, o) => a + o.orderTotal, 0)
  const noCost = rows.reduce((a, o) => a + o.linesWithoutCost, 0)
  const excludedCount = all.filter(o => o.cancelled).length

  // A bill with no margin is the figure worth counting, not the lines behind
  // it: one uncosted line blinds the whole bill, so ten lines can be one
  // question or ten.
  const live = rows.filter(o => !o.cancelled)
  const blind = live.filter(o => o.marginPct === null)
  const blindValue = blind.reduce((a, o) => a + o.orderTotal, 0)
  const tagged = live.filter(o => o.openBillRank !== null)
  const stillSuggested = tagged.filter(o => o.openBillAuto).length

  const filtered = Boolean(staffFilter) || venueFilter !== undefined
  const base = revenuePath(subDept.slug, period, 'orders')
  const keep = (extra: Record<string, string | undefined>) => {
    const q = new URLSearchParams()
    const merged = { staff: staffFilter, venue: venueFilter, show, ...extra }
    for (const [k, v] of Object.entries(merged)) if (v !== undefined) q.set(k, v)
    const s = q.toString()
    return s ? `${base}?${s}` : base
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> REVENUE · {subDept.name.toUpperCase()} · {label(period).toUpperCase()}
          </div>
          <h1 className="page-title">
            {person?.employeeName ??
              // Somebody who only holds SHARES this month owns no bill to read a name from.
              shares.find(sh => sh.staffId === staffFilter)?.name ??
              (staffFilter === 'unmatched' ? 'Unmatched bills' : venueName ?? 'Sales orders')}
          </h1>
          {filtered ? (
            <p className="font-serif italic text-graphite text-base mt-3">
              {person || shares.some(sh => sh.staffId === staffFilter)
                ? `${person?.employeeCode ? person.employeeCode + ' · ' : ''}every bill of theirs this month, and every bill shared with them`
                : null}
              {staffFilter === 'unmatched' ? 'Bills whose ERP agent is not yet a salesperson here, so they pay nobody' : null}
              {venueName && !staffFilter ? 'Every bill written at this venue' : null}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          {filtered ? (
            <Link
              href={show === 'all' ? `${base}?show=all` : base}
              className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-control transition-colors"
            >
              All bills
            </Link>
          ) : null}
          <Link
            href={revenuePath(subDept.slug, period)}
            className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-control transition-colors"
          >
            ← The month
          </Link>
        </div>
      </div>

      <section className="mb-10">
        <div className="grid gap-4 sm:grid-cols-4">
          <Tile label="Sales value" value={formatMoney(total)} big />
          <Tile label="Bills" value={String(rows.length)} />
          <Tile
            label="Waiting on a deposit"
            value={formatMoney(heldValue)}
            note={held.length > 0 ? `${held.length} bill${held.length === 1 ? '' : 's'}` : undefined}
            warn={held.length > 0}
          />
          <Tile
            label="Bills with no margin"
            value={String(blind.length)}
            note={
              blind.length > 0
                ? `${formatMoney(blindValue)} · ${noCost} line${noCost === 1 ? '' : 's'} without a cost`
                : undefined
            }
            warn={blind.length > 0}
          />
        </div>
      </section>

      <section>
        <div className="sect-head">
          <h2>Bills</h2>
          <span className="rule" aria-hidden />
          <span className="count">{rows.length} ROWS</span>
        </div>
        <p className="font-serif italic text-muted text-sm mb-4 max-w-3xl">
          In the order the day wrote them — the running number is what the Open Bill bonus reads.
          {openBillPaid ? (
            <>
              {' '}
              {tagged.length} of {live.length} carry a pick
              {stillSuggested > 0 ? (
                <>
                  , <span className="text-alert">{stillSuggested} still the importer&apos;s guess</span>
                </>
              ) : null}
              .
            </>
          ) : null}
          {excludedCount > 0 ? (
            <>
              {' '}
              {includeExcluded ? (
                <>
                  Cancelled, drafted, held and ignored bills are shown, greyed;{' '}
                  <Link href={keep({ show: undefined })} className="text-accent hover:underline">
                    hide them
                  </Link>
                  .
                </>
              ) : (
                <>
                  {excludedCount} excluded bill{excludedCount === 1 ? ' is' : 's are'} not shown;{' '}
                  <Link href={keep({ show: 'all' })} className="text-accent hover:underline">
                    show them
                  </Link>
                  .
                </>
              )}
            </>
          ) : null}
        </p>

        {rows.length === 0 ? (
          <div className="py-12 text-center border border-hairline rounded-card bg-surface">
            <p className="font-serif text-xl text-ink">No bills match.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Bill</th>
                  <th className="m-hide">Date</th>
                  <th className="m-hide">Customer</th>
                  <th className="m-hide">Venue</th>
                  <th className="m-hide">Salesperson</th>
                  <th className="m-hide">Brand</th>
                  <th className="right m-hide">Amount</th>
                  <th className="right m-hide">Paid</th>
                  <th className="right m-hide">Margin</th>
                  {openBillPaid ? <th className="m-hide">Open Bill</th> : null}
                  <th className="right">Counts as</th>
                  <th className="lt-toggle" aria-hidden />
                </tr>
              </thead>
              <tbody>
                {rows.map(o => (
                  <LedgerRow key={o.orderId}>
                    <td>
                      <Link
                        href={revenuePath(subDept.slug, period, 'orders', o.orderId)}
                        className="font-mono text-xs text-ink hover:text-accent"
                      >
                        {o.orderNo}
                      </Link>
                      {!openBillPaid && o.openBillRank ? (
                        <div className="font-mono text-[10.5px] text-accent mt-0.5">
                          OPEN BILL {o.openBillRank}
                        </div>
                      ) : null}
                    </td>
                    <td className="font-mono text-xs text-graphite m-hide" data-label="Date">
                      {formatDate(o.orderDate)}
                      {o.sequenceInDay ? (
                        <span className="text-muted"> · #{o.sequenceInDay}</span>
                      ) : null}
                    </td>
                    <td className="m-hide" data-label="Customer">
                      <span className="font-serif text-[14px] text-ink">{o.customerName ?? '—'}</span>
                    </td>
                    <td className="m-hide" data-label="Venue">
                      {o.venue ? (
                        <Link
                          href={keep({ venue: o.venueGroupKey ?? '', staff: undefined })}
                          className="font-serif text-[13px] text-graphite hover:text-accent"
                        >
                          {o.venue}
                        </Link>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                      {/* Only when the document's spelling is not the place's own. */}
                      {o.venueGroupName && venueKey(o.venue) !== o.venueGroupKey ? (
                        <div className="font-serif italic text-[11px] text-muted mt-0.5">
                          at {o.venueGroupName}
                        </div>
                      ) : null}
                      {o.organizer ? (
                        <div className="font-mono text-[10.5px] text-muted mt-0.5">{o.organizer}</div>
                      ) : null}
                    </td>
                    <td className="m-hide" data-label="Salesperson">
                      {o.staffId ? (
                        <>
                          <Link
                            href={keep({ staff: o.staffId, venue: undefined })}
                            className="font-serif text-[14px] text-ink hover:text-accent"
                          >
                            {o.employeeName}
                          </Link>
                          <ShareControl
                            orderId={o.orderId}
                            ownerStaffId={o.staffId}
                            ownerName={o.employeeName ?? '—'}
                            shares={(sharesByOrder.get(o.orderId) ?? []).map(sh => ({
                              staffId: sh.staffId,
                              name: sh.name,
                              pct: sh.pct,
                            }))}
                            team={team}
                            disabled={runLocked || o.cancelled}
                            disabledReason={
                              runLocked
                                ? 'The run for this month has paid — reopen it before changing who shares a bill'
                                : `${exclusionReason(o)} — nothing to share`
                            }
                          />
                        </>
                      ) : (
                        <span
                          className={
                            o.excludedReason === 'ignored_agent'
                              ? 'text-muted font-serif text-[14px]'
                              : 'text-danger font-serif text-[14px]'
                          }
                        >
                          {/* Red means "answer this". An ignored name HAS been
                              answered, so it stops asking. */}
                          {o.agentName} · {o.excludedReason === 'ignored_agent' ? 'not ours' : 'unmatched'}
                        </span>
                      )}
                    </td>
                    <td className="font-mono text-[11px] text-graphite m-hide" data-label="Brand">
                      {o.brandCode ?? <span className="neg">none</span>}
                    </td>
                    <td className="num m-hide" data-label="Amount">{formatMoney(o.orderTotal)}</td>
                    <td className="num m-hide" data-label="Paid">
                      {formatMoney(o.paidAmount)}
                      {o.depositRequired !== null && !o.depositMet ? (
                        <div className="font-mono text-[10.5px] text-danger">
                          needs {formatMoney(o.depositRequired)}
                        </div>
                      ) : null}
                    </td>
                    <td className="num m-hide" data-label="Margin">
                      {o.marginPct === null ? (
                        <span className="neg">no cost</span>
                      ) : (
                        <>
                          {pct(o.marginPct)}
                          {o.marginSource === 'manual' ? (
                            <div className="font-mono text-[10.5px] text-accent">keyed</div>
                          ) : null}
                        </>
                      )}
                    </td>
                    {openBillPaid ? (
                      <td className="m-hide" data-label="Open Bill">
                        <OpenBillPicker
                          orderId={o.orderId}
                          staffName={o.employeeName}
                          eventDate={o.eventDate}
                          rank={
                            o.openBillRank === 1 || o.openBillRank === 2 || o.openBillRank === 3
                              ? o.openBillRank
                              : null
                          }
                          suggested={o.openBillAuto === true}
                          disabled={runLocked || o.cancelled || !o.staffId}
                          disabledReason={
                            runLocked
                              ? 'The run for this month has paid — reopen it before changing the picks'
                              : o.cancelled
                                ? `${exclusionReason(o)} — no Open Bill bonus`
                                : 'This bill has no matched salesperson yet'
                          }
                        />
                      </td>
                    ) : null}
                    <td className="num">
                      {o.cancelled ? (
                        <span className="font-serif italic text-muted text-sm">
                          {exclusionReason(o)}
                        </span>
                      ) : !o.depositMet ? (
                        <span className="font-serif italic text-alert text-sm">Held</span>
                      ) : (
                        <span className="font-semibold">{formatMoney(o.orderTotal)}</span>
                      )}
                    </td>
                  </LedgerRow>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="font-serif italic text-muted text-xs mt-3 max-w-3xl">
          &quot;Counts as&quot; is the bill&apos;s SALES value, not its commission: transport and disposal
          lines leave the base, KPI items move to their own allowance, and a held bill pays in the
          month its deposit clears. Open the bill to see it line by line.
          {openBillPaid ? (
            <>
              {' '}
              An Open Bill pick in a <span className="text-alert">dashed outline</span> is still the
              importer&apos;s guess from the document number; click it to agree, click another to move
              it, click a solid one to clear it. Ranks are held per salesperson per event day, so
              claiming a taken rank moves it off the bill that held it.{' '}
              <Link
                href={`${revenuePath(subDept.slug, period)}?tab=open-bill`}
                className="text-accent hover:underline"
              >
                What the picks add up to
              </Link>{' '}
              — how many of each, whose, and the uplift they paid — is on the month.
              {runLocked ? ' This month has paid — reopen the run to change a pick.' : ''}
            </>
          ) : null}
        </p>
      </section>

      {/* The gap is about the month, not about this filter — a code nobody can
          cost blinds whoever's bill it lands on. */}
      <CostGapPanel
        subDepartmentId={subDept.id}
        period={period}
        rows={uncosted}
        runLocked={runLocked}
      />
    </div>
  )
}

function Tile({
  label: text,
  value,
  note,
  warn,
  big,
}: {
  label: string
  value: string
  note?: string
  warn?: boolean
  big?: boolean
}) {
  return (
    <div className="border border-hairline rounded-card bg-surface px-4 py-3">
      <div className="font-mono text-[0.6rem] tracking-wide text-muted uppercase mb-1">{text}</div>
      <div className={['statement-amount', big ? '' : 'compact', warn ? 'text-danger' : 'text-num-ink'].join(' ')}>
        {value}
      </div>
      {note ? <div className="font-serif italic text-muted text-xs mt-1.5">{note}</div> : null}
    </div>
  )
}

export type { MonthOrder }
