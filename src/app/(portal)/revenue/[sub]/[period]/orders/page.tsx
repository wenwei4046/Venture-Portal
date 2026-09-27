import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import { revenuePath } from '@/lib/revenue'
import { venueKey } from '@/lib/venues'
import { buildCommissionWorkbench } from '@/lib/commission/workbench'
import { commissionByBill, type BillCommission } from '@/lib/commission/bill-commission'
import { billCountAction, describeExclusion, exclusionReason } from '@/lib/commission/bill-exclusion'
import { requireSubDepartment } from '../../../_lib/sub-departments'
import {
  loadMonthOrders,
  loadOrderExclusions,
  loadOrderShares,
  loadShareTeam,
  loadUncostedProducts,
  type MonthOrder,
} from '../../../_lib/month-orders'
import { loadCommissionWorkbench } from '../../../_lib/commission-workbench'
import { openBillOnFor } from '../../../_lib/open-bill-month'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import workbenchStyles from '../_components/commission-workbench.module.css'
import CostGapPanel from './_components/CostGapPanel'
import AllBillsTable, { type BillRow } from './_components/AllBillsTable'

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
  // Whether THIS month pays Open Bill: its own setting, else Rules (2026-09-26).
  const [openBillPaid, { data: locked, error: lockError }] = await Promise.all([
    subDept.schemeId ? openBillOnFor(supabase, subDept.id, period) : Promise.resolve(false),
    supabase.rpc('commission_order_period_locked', {
      p_sub_department_id: subDept.id,
      p_period: period,
    }),
  ])
  if (lockError) throw new Error(`Could not check the commission run: ${lockError.message}`)
  const runLocked = Boolean(locked)

  // Who else holds a part of each bill, who a bill may be shared with, and
  // who took a bill out of the month by hand — only an excluded bill can be.
  const [shares, team, exclusions] = await Promise.all([
    loadOrderShares(supabase, all.map(o => o.orderId)),
    loadShareTeam(supabase, subDept.schemeId),
    loadOrderExclusions(supabase, all.filter(o => o.cancelled).map(o => o.orderId)),
  ])
  const sharesByOrder = new Map<string, typeof shares>()
  for (const sh of shares) sharesByOrder.set(sh.orderId, [...(sharesByOrder.get(sh.orderId) ?? []), sh])

  const includeExcluded = show === 'all'
  // Every bill the URL's filters allow, excluded ones too: the table hides
  // those itself behind *Show excluded*, so the toggle is not a round trip.
  const base0 = all.filter(o => {
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
  // The tiles are the month's money, so they read the live bills only.
  const rows = base0.filter(o => !o.cancelled)

  // What the live calculation pays on each bill — the same engine, rules and
  // team history as the month page's salesperson ledger, without its drafts.
  let workbench: Awaited<ReturnType<typeof loadCommissionWorkbench>> | null = null
  let commissionNote: string | null = subDept.schemeId ? null : 'This sub-department has no commission scheme, so no bill pays commission.'
  let hasRun = false
  if (subDept.schemeId && all.length > 0) {
    try {
      const { data: run } = await supabase
        .from('comm_runs')
        .select('id')
        .eq('period_month', period)
        .eq('sub_department_id', subDept.id)
        .maybeSingle()
      hasRun = Boolean(run)
      workbench = await loadCommissionWorkbench(supabase, subDept.id, period, all, (run as { id: string } | null)?.id, { pay: false })
    } catch (e) {
      commissionNote = `The live commission could not be calculated: ${e instanceof Error ? e.message : 'unknown error'}. The bills themselves are complete.`
    }
  }
  const board = workbench
    ? buildCommissionWorkbench(workbench.input, { people: workbench.people, orders: workbench.orders })
    : null
  const byBill = board ? commissionByBill(board.personalRows, period) : new Map<string, BillCommission>()
  const personOf = new Map((board?.people ?? []).map(p => [p.staffId, p]))
  const eventOf = new Map((workbench?.orders ?? []).map(o => [o.orderId, o]))

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

  // A bill with no margin is the figure worth counting, not the lines behind
  // it: one uncosted line blinds the whole bill, so ten lines can be one
  // question or ten.
  const live = rows.filter(o => !o.cancelled)
  const blind = live.filter(o => o.marginPct === null)
  const blindValue = blind.reduce((a, o) => a + o.orderTotal, 0)
  const tagged = live.filter(o => o.openBillRank !== null)
  const stillSuggested = tagged.filter(o => o.openBillAuto).length

  const base = revenuePath(subDept.slug, period, 'orders')
  const keep = (extra: Record<string, string | undefined>) => {
    const q = new URLSearchParams()
    const merged = { staff: staffFilter, venue: venueFilter, show, ...extra }
    for (const [k, v] of Object.entries(merged)) if (v !== undefined) q.set(k, v)
    const s = q.toString()
    return s ? `${base}?${s}` : base
  }

  const monthLabel = label(period)
  const billRows: BillRow[] = base0.map(o => {
    const paid = byBill.get(o.orderId)
    const who = o.staffId ? personOf.get(o.staffId) : undefined
    const reason = exclusionReason(o)
    const byHand = exclusions.get(o.orderId)
    return {
      orderId: o.orderId,
      orderNo: o.orderNo,
      href: revenuePath(subDept.slug, period, 'orders', o.orderId),
      orderDate: o.orderDate,
      eventDate: o.eventDate,
      sequenceInDay: o.sequenceInDay,
      customerName: o.customerName,
      venue: o.venue,
      venueHref: o.venue ? keep({ venue: o.venueGroupKey ?? '', staff: undefined }) : null,
      // Only when the document's spelling is not the place's own.
      venuePlace: o.venueGroupName && venueKey(o.venue) !== o.venueGroupKey ? o.venueGroupName : null,
      eventName: eventOf.get(o.orderId)?.eventName ?? null,
      organizer: eventOf.get(o.orderId)?.organizer ?? o.organizer,
      location: o.location,
      brands: paid?.brands.length ? paid.brands : o.brandCode ? [o.brandCode] : [],
      categories: paid?.categories ?? [],
      orderTotal: o.orderTotal,
      // What the live calculation says earns; a bill it never saw (cancelled,
      // or the calculation failed) falls back to the lines in paying groups.
      commissionable: paid?.commissionable ?? o.marginRevenue,
      paidAmount: o.paidAmount,
      depositShort: o.depositRequired !== null && !o.depositMet ? o.depositRequired : null,
      marginPct: o.marginPct,
      marginValue: o.marginCost === null ? null : Math.round((o.marginRevenue - o.marginCost) * 100) / 100,
      marginKeyed: o.marginSource === 'manual',
      status: reason ?? (!o.staffId ? 'Pays nobody' : !o.depositMet ? 'Deposit pending' : 'Included'),
      cancelled: o.cancelled,
      exclusionDetail: byHand ? describeExclusion(byHand) : null,
      countAction: billCountAction({ ...o, excludedByHand: Boolean(byHand) }, { runLocked, monthLabel }),
      staff: o.staffId
        ? {
            id: o.staffId,
            name: o.employeeName ?? '—',
            code: o.employeeCode,
            href: keep({ staff: o.staffId, venue: undefined }),
          }
        : null,
      agent: o.staffId ? null : { name: o.agentName, ignored: o.excludedReason === 'ignored_agent' },
      shares: (sharesByOrder.get(o.orderId) ?? []).map(sh => ({ staffId: sh.staffId, name: sh.name, pct: sh.pct })),
      shareDisabled: runLocked || o.cancelled,
      shareDisabledReason: runLocked
        ? 'The run for this month has paid — reopen it before changing who shares a bill'
        : `${reason} — nothing to share`,
      title: who?.titleLabel ?? null,
      rank: who?.rankLabel ?? null,
      rate: who ? who.productRate : null,
      openBill: {
        rank: o.openBillRank === 1 || o.openBillRank === 2 || o.openBillRank === 3 ? o.openBillRank : null,
        suggested: o.openBillAuto === true,
        disabled: runLocked || o.cancelled || !o.staffId,
        disabledReason: runLocked
          ? 'The run for this month has paid — reopen it before changing the picks'
          : o.cancelled
            ? `${reason} — no Open Bill bonus`
            : 'This bill has no matched salesperson yet',
      },
      commission: paid
        ? { product: paid.product, kpi: paid.kpi, marginIncentive: paid.marginIncentive, openBill: paid.openBill, total: paid.total }
        : o.cancelled || commissionNote
          ? null
          : { product: 0, kpi: 0, marginIncentive: 0, openBill: 0, total: 0 },
    }
  })

  const filtered = Boolean(staffFilter) || venueFilter !== undefined
  return (
    <div className={workbenchStyles.page}>
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
            <p className="text-sm mt-3">
              {person || shares.some(sh => sh.staffId === staffFilter)
                ? `${person?.employeeCode ? person.employeeCode + ' · ' : ''}every bill of theirs this month, and every bill shared with them`
                : null}
              {staffFilter === 'unmatched' ? 'Bills whose ERP agent is not yet a salesperson here, so they pay nobody' : null}
              {venueName && !staffFilter ? 'Every bill written at this venue' : null}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {filtered ? (
            <Link
              href={show === 'all' ? `${base}?show=all` : base}
              className="bg-surface hover:bg-surface-2 border border-hairline text-ink text-sm px-4 py-2 rounded-control transition-colors"
            >
              All bills
            </Link>
          ) : null}
          <Link
            href={revenuePath(subDept.slug, period)}
            className="bg-surface hover:bg-surface-2 border border-hairline text-ink text-sm px-4 py-2 rounded-control transition-colors"
          >
            ← The month
          </Link>
        </div>
      </div>

      {/* What the bills in view add up to. The sales value is the figure the
          page is opened for — the sheet's one walnut card; the two problem
          counts turn red only while they hold. */}
      <StatCards label="What these bills add up to">
        <StatCard label="Sales value" value={formatMoney(total)} icon="sales" tone="primary" />
        <StatCard label="Bills" value={String(rows.length)} icon="receipt" />
        <StatCard
          label="Waiting on a deposit"
          value={formatMoney(heldValue)}
          icon="clock"
          note={held.length > 0 ? `${held.length} bill${held.length === 1 ? '' : 's'}` : undefined}
          tone={held.length > 0 ? 'danger' : undefined}
        />
        <StatCard
          label="Bills with no margin"
          value={String(blind.length)}
          icon="file-alert"
          note={
            blind.length > 0
              ? `${formatMoney(blindValue)} · ${noCost} line${noCost === 1 ? '' : 's'} without a cost`
              : undefined
          }
          tone={blind.length > 0 ? 'danger' : undefined}
        />
      </StatCards>

      <section>
        <div className="sect-head">
          <h2>Bills</h2>
          <span className="rule" aria-hidden />
          <span className="count">{rows.length} BILLS</span>
        </div>
        <p className="text-sm mb-4 max-w-3xl">
          In the order the day wrote them — the running number is what the Open Bill bonus reads.
          {openBillPaid ? (
            <>
              {' '}
              {tagged.length} of {live.length} carry a pick
              {stillSuggested > 0 ? (
                <>
                  ,{' '}
                  <span className="chip alert">
                    <span className="dot" />
                    {stillSuggested} still the importer&apos;s guess
                  </span>
                </>
              ) : null}
              .
            </>
          ) : null}
        </p>

        {base0.length === 0 ? (
          <div className="border border-hairline rounded-card bg-surface-2 p-6 text-center">
            <p className="text-sm">No bills match.</p>
          </div>
        ) : (
          <AllBillsTable
            rows={billRows}
            team={team}
            openBillPaid={openBillPaid}
            commissionNote={commissionNote}
            initialShowExcluded={includeExcluded}
            monthLabel={monthLabel}
            hasRun={hasRun}
          />
        )}

        <p className="text-xs mt-3 max-w-3xl">
          &quot;Total commission&quot; is the live calculation&apos;s personal commission on the bill —
          every shared part added together, overriding left to the upline — from the same rules as
          the month&apos;s salesperson ledger, without its review drafts. A held bill pays in the
          month its deposit clears. Open the bill to see it line by line. Right-click a bill — or its ⋯ —
          for <em>Don&apos;t count this bill</em>: it leaves the month&apos;s commission the way a bill
          cancelled in the ERP does, and stays out whatever the ERP sends next until somebody counts it
          again (<em>Show excluded</em> lists it).
          {openBillPaid ? (
            <>
              {' '}
              {/* Drawn the way the picker draws a suggestion, so the words point
                  at the thing on the row rather than at a colour. */}
              An Open Bill pick in a{' '}
              <span className="px-1 border border-dashed border-alert bg-alert-bg rounded-sm">dashed outline</span>{' '}
              is still the
              importer&apos;s guess from the document number; click it to agree, click another to move
              it, click a solid one to clear it. Ranks are held per salesperson per event day, so
              claiming a taken rank moves it off the bill that held it.{' '}
              <Link
                href={revenuePath(subDept.slug, period)}
                className="text-accent hover:underline"
              >
                What the picks add up to
              </Link>{' '}
              — every pick, whose, and the bonus it pays — is the month&apos;s Open Bill tab.
              {runLocked ? ' This month is in payroll — take it back on the month to change a pick.' : ''}
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

export type { MonthOrder }
