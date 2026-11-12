'use client'

import { useRouter } from 'next/navigation'
import { formatMoney, formatMoneyBare } from '@/lib/utils'
import { revenuePath } from '@/lib/revenue'
import { billHref } from '@/lib/commission/workbench-nav'
import {
  defaultTallyMonth, tallyChips, tallyDay, tallyMonthLong, tallyMonthShort,
  type TallyBill, type TallyCommission, type TallyMonth, type TallyReport,
} from '@/lib/commission/tally'
import { Card, Cards, Chip, GridEmpty, GridHead, GridRow, GridTable, SecLabel, SectHead, btn, hv } from '@/components/hrv/kit'
import { useTabParam } from '@/components/hrv/tabs'
import t from './Tally.module.css'

// Comm Cal › Tally (2026-11-12, the user: "House entry 那边跟着 Sales Order
// creation date 去 payout；我 payout to Sales Person 是跟着 fair date 去 payout；
// 然后我要对出中间的那个 gap"; then "need with the real commission payout, for
// those below depo, houzs will not pay to venture as well"). Each month on its
// two sides — what Houzs pays (once a bill's deposit is reached, by its SO
// date) and what we pay salespeople (the month whose close released the bill) —
// the gap between them, what is carried when the month ends, and, for the
// month picked (`?month=`), the bills the gap is made of and the ones under
// their deposit, which nobody pays. Read-only.

// Ten columns in 952px (a 1280px screen): the figures stand closer than the kit's 14px.
const MONTH_COLS = 'minmax(128px,1.1fr) 44px minmax(112px,1.1fr) minmax(96px,1fr) 66px minmax(112px,1.1fr) minmax(96px,1fr) minmax(96px,1fr) minmax(96px,1fr) minmax(96px,1fr)'
const BILL_COLS = 'minmax(136px,1.2fr) minmax(104px,1fr) 108px 108px 108px minmax(88px,.8fr) minmax(108px,.9fr) minmax(184px,1.3fr)'
const PAD = { padding: '11px 14px' }
const CHIP_PAD = { padding: '11px 12px 11px 16px' }
const CHIP_CELL = { padding: '9px 12px 9px 16px' }
const NUM_PAD = { padding: '11px 10px' }
const RIGHT = { textAlign: 'right' as const, ...NUM_PAD }

const bills = (n: number) => `${n} bill${n === 1 ? '' : 's'}`
const pctWord = (p: number) => `${Math.round(p * 1000) / 10}%`

type BillListKind = 'ours' | 'theirs' | 'held'

/** A figure, red in parentheses when it is below nothing. */
function Amount({ value }: { value: number }) {
  return <span className={value < 0 ? t.neg : undefined}>{formatMoneyBare(value)}</span>
}

export default function TallyPanel({
  report,
  sub,
  commission = {},
  canExport = false,
}: {
  report: TallyReport
  sub: { name: string; slug: string }
  commission?: TallyCommission
  /** The page's canDo(user, 'revenue', 'export'): the month's workbook is offered only to whoever may take it out. */
  canExport?: boolean
}) {
  const keys = report.months.map(m => m.month.slice(0, 7))
  const opening = (defaultTallyMonth(report) ?? '').slice(0, 7)
  const [picked, pick] = useTabParam(keys, opening, 'month')
  const month = report.months.find(m => m.month.slice(0, 7) === picked) ?? null

  if (!month) {
    return (
      <div className={hv.empty} style={{ padding: '40px 24px' }}>
        Nothing to tally yet.
      </div>
    )
  }

  const name = tallyMonthLong(month.month).split(' ')[0]
  const short = tallyMonthShort(month.month)
  const apart = month.ours.length + month.theirs.length

  return (
    <>
      <Cards label={`Tally for ${tallyMonthLong(month.month)}`} count={4} style={{ marginBottom: 26 }}>
        <Card
          label={`${name} · Houzs pays`}
          value={formatMoney(month.houzs.bill)}
          note={bills(month.houzs.bills)}
          icon="receipt"
        />
        <Card
          label={`${name} · we pay`}
          value={formatMoney(month.we.bill)}
          note={month.open.bills > 0 ? `${bills(month.we.bills)} · ${month.open.bills} not closed` : bills(month.we.bills)}
          icon="calendar"
        />
        <Card
          label={`${name} gap`}
          value={formatMoney(month.gap.bill)}
          note={`${bills(apart)} paid apart`}
          icon="fileAlert"
          tone={apart > 0 ? 'alert' : 'default'}
        />
        <Card
          label={`Carried after ${name}`}
          value={formatMoney(month.carried.bill)}
          note={bills(month.carried.bills)}
          icon="percent"
          tone="primary"
        />
      </Cards>

      <SectHead title="Tally by month" count={`${report.months.length} PERIOD${report.months.length === 1 ? '' : 'S'}`} />
      <GridTable label="Tally by month">
        <div className={`${hv.gtHead} ${t.groups}`} style={{ gridTemplateColumns: MONTH_COLS }} role="row">
          <span role="columnheader" aria-hidden="true" />
          <span role="columnheader" aria-colspan={3} className={t.group} style={{ gridColumn: 'span 3' }}>
            Houzs pays
          </span>
          <span role="columnheader" aria-colspan={4} className={t.group} style={{ gridColumn: 'span 4' }}>
            We pay
          </span>
          <span role="columnheader" aria-colspan={2} className={t.group} style={{ gridColumn: 'span 2' }}>
            We − Houzs
          </span>
        </div>
        <GridHead
          cols={MONTH_COLS}
          cellStyle={PAD}
          cells={[
            'Month',
            { label: <span title="Bills whose deposit is reached, by SO date — or by the day the deposit came, when that is later">Bills</span>, style: RIGHT },
            { label: 'Sales', style: RIGHT },
            { label: 'Bill to HC', style: RIGHT },
            { label: <span title="Bills the month's closes paid, and the ones waiting for their salesperson's close">Bills</span>, style: RIGHT },
            { label: 'Sales', style: RIGHT },
            { label: 'Bill to HC', style: RIGHT },
            { label: <span title="What the month's closed salespeople are paid">Commission</span>, style: RIGHT },
            { label: <span title="We pay less Houzs pays, in Bill to HC">Gap</span>, style: RIGHT },
            { label: <span title="As the month ends: bills we have paid that Houzs has not, less the ones Houzs has paid and we have not — in Bill to HC">Carried</span>, style: RIGHT },
          ]}
        />
        {report.months.map((m, i) => (
          <MonthRow
            key={m.month}
            m={m}
            paid={commission[m.month] ?? null}
            zebra={i % 2 === 1}
            selected={m.month === month.month}
            onPick={() => pick(m.month.slice(0, 7))}
          />
        ))}
      </GridTable>
      {report.noPctBills > 0 ? (
        <div className={t.flags}>
          <a href={`${revenuePath(sub.slug, 'rules')}?tab=brands`} className={t.flag}>
            <Chip tone="alert">{bills(report.noPctBills)} · no Bill to HC %</Chip>
          </a>
        </div>
      ) : null}

      <div className={t.detail}>
        <SectHead title={`${tallyMonthLong(month.month)} · bills paid apart`} count={bills(apart).toUpperCase()} />
        {canExport ? (
          // The month whole — every bill on each side — as an Excel workbook (`tally/export?month=`).
          <div className={t.tools}>
            <a
              href={`${revenuePath(sub.slug, 'tally', 'export')}?month=${month.month.slice(0, 7)}`}
              download
              className={btn('outline')}
              style={{ padding: '7px 13px', fontSize: 12.5 }}
              title={`Every bill Houzs pays and every bill we pay in ${tallyMonthLong(month.month)}, as an Excel workbook`}
            >
              Export {short}
            </a>
          </div>
        ) : null}
        <BillList title={`We pay in ${short} · Houzs does not`} rows={month.ours} list="ours" sub={sub.slug} />
        <BillList title={`Houzs pays in ${short} · we do not`} rows={month.theirs} list="theirs" sub={sub.slug} />
        <BillList title={`Below deposit in ${short} · neither pays`} rows={month.held} list="held" sub={sub.slug} />
      </div>
    </>
  )
}

function MonthRow({
  m,
  paid,
  zebra,
  selected,
  onPick,
}: {
  m: TallyMonth
  paid: { total: number; closed: number } | null
  zebra: boolean
  selected: boolean
  onPick: () => void
}) {
  const num = `${hv.right} ${hv.mono}`
  return (
    <GridRow cols={MONTH_COLS} zebra={zebra} selected={selected} onClick={onPick} title={`Show ${tallyMonthLong(m.month)}'s bills paid apart`}>
      <span role="cell" className={t.month} style={PAD}>{tallyMonthLong(m.month)}</span>
      <span role="cell" className={`${num} ${t.edge}`} style={NUM_PAD}>{m.houzs.bills}</span>
      <span role="cell" className={num} style={NUM_PAD}>{formatMoneyBare(m.houzs.sales)}</span>
      <span role="cell" className={num} style={NUM_PAD}>{formatMoneyBare(m.houzs.bill)}</span>
      <div role="cell" className={`${num} ${t.edge}`} style={NUM_PAD}>
        <div>{m.we.bills}</div>
        {m.open.bills > 0 ? (
          <div className={t.sub} title={m.open.bills === 1 ? "1 bill waits for its salesperson's close" : `${m.open.bills} bills wait for their salesperson's close`}>
            {m.open.bills} open
          </div>
        ) : null}
      </div>
      <span role="cell" className={num} style={NUM_PAD}>{formatMoneyBare(m.we.sales)}</span>
      <span role="cell" className={num} style={NUM_PAD}>{formatMoneyBare(m.we.bill)}</span>
      <span role="cell" className={num} style={NUM_PAD} title={paid ? `${paid.closed} salespeople closed` : 'Nobody closed yet'}>
        {paid ? formatMoneyBare(paid.total) : '—'}
      </span>
      <span role="cell" className={`${num} ${t.edge} ${t.strong}`} style={NUM_PAD}><Amount value={m.gap.bill} /></span>
      <span role="cell" className={`${num} ${t.strong}`} style={NUM_PAD}><Amount value={m.carried.bill} /></span>
    </GridRow>
  )
}

const OTHER_SIDE: Record<BillListKind, string> = { ours: 'Houzs', theirs: 'Us', held: 'Status' }

function BillList({ title, rows, list, sub }: { title: string; rows: TallyBill[]; list: BillListKind; sub: string }) {
  const router = useRouter()
  const sales = rows.reduce((sum, b) => sum + b.sales, 0)
  const bill = rows.reduce((sum, b) => sum + (b.bill ?? 0), 0)
  const num = `${hv.right} ${hv.mono}`
  return (
    <section className={t.list} aria-label={title}>
      <SecLabel style={{ marginBottom: 8 }}>{title}</SecLabel>
      <GridTable label={title}>
        <GridHead
          cols={BILL_COLS}
          cellStyle={PAD}
          cells={[
            'Bill',
            'Salesperson',
            'Fair day',
            'SO date',
            { label: <span title="The day its payments reached the deposit">Deposit</span> },
            { label: 'Sales', style: { textAlign: 'right' } },
            { label: <span title="Sales × its brand's Bill to HC %">Bill to HC</span>, style: { textAlign: 'right' } },
            { label: OTHER_SIDE[list], style: CHIP_PAD },
          ]}
        />
        {rows.length === 0 ? <GridEmpty>None</GridEmpty> : null}
        {rows.map((b, i) => (
          <GridRow
            key={b.orderId}
            cols={BILL_COLS}
            zebra={i % 2 === 1}
            onClick={() => router.push(billHref(sub, b.saleMonth, b.orderId, null))}
            title={`Open ${b.orderNo}`}
          >
            <div role="cell" style={PAD}>
              <div className={`${hv.mono} ${t.doc}`}>{b.orderNo}</div>
              {b.refNo && b.refNo !== b.orderNo ? <div className={t.ref}>{b.refNo}</div> : null}
            </div>
            <span role="cell" style={PAD}>{b.salesperson}</span>
            <span role="cell" className={`${hv.mono} ${t.day}`} style={PAD}>{b.fairDate ? tallyDay(b.fairDate) : '—'}</span>
            <span role="cell" className={`${hv.mono} ${t.day}`} style={PAD}>{tallyDay(b.soDate)}</span>
            <span role="cell" className={`${hv.mono} ${t.day}`} style={PAD}>{b.reachedOn ? tallyDay(b.reachedOn) : '—'}</span>
            <span role="cell" className={num} style={PAD}>{formatMoneyBare(b.sales)}</span>
            {/* What it is a share of: the brand and its Bill to HC %. */}
            <div role="cell" className={hv.right} style={PAD}>
              <div className={hv.mono}>{b.bill === null ? '—' : formatMoneyBare(b.bill)}</div>
              <div className={t.brand}>{b.brandName} · {b.pct === null ? 'no %' : pctWord(b.pct)}</div>
            </div>
            <span role="cell" className={t.chips} style={CHIP_CELL}>
              {tallyChips(b, list).map(chip => (
                <Chip key={chip.text} tone={chip.tone} title={chip.title}>{chip.text}</Chip>
              ))}
            </span>
          </GridRow>
        ))}
        {rows.length > 0 ? (
          <div className={t.total} style={{ gridTemplateColumns: BILL_COLS }} role="row">
            <span role="cell" style={{ ...PAD, gridColumn: 'span 5' }}>{bills(rows.length)}</span>
            <span role="cell" className={num} style={PAD}>{formatMoneyBare(sales)}</span>
            <span role="cell" className={num} style={PAD}>{formatMoneyBare(bill)}</span>
            <span role="cell" style={PAD} />
          </div>
        ) : null}
      </GridTable>
    </section>
  )
}
