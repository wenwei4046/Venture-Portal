'use client'

import { useRouter } from 'next/navigation'
import { formatMoney, formatMoneyBare } from '@/lib/utils'
import { revenuePath } from '@/lib/revenue'
import { billHref } from '@/lib/commission/workbench-nav'
import {
  defaultTallyMonth, tallyDay, tallyMonthLong, tallyMonthShort, tallyOtherSide,
  type TallyBill, type TallyCommission, type TallyMonth, type TallyReport,
} from '@/lib/commission/tally'
import { Card, Cards, Chip, GridEmpty, GridHead, GridRow, GridTable, SecLabel, SectHead, hv } from '@/components/hrv/kit'
import { useTabParam } from '@/components/hrv/tabs'
import t from './Tally.module.css'

// Comm Cal › Tally (2026-11-12, the user: "House entry 那边跟着 Sales Order
// creation date 去 payout；我 payout to Sales Person 是跟着 fair date 去 payout；
// 然后我要对出中间的那个 gap"). Each month in its two calendars — by SO date
// (what Houzs pays) and by fair date (what we pay salespeople on) — the gap
// between them, what is carried when the month ends, and, for the month
// picked (`?month=`), the bills the gap is made of. Read-only.

const MONTH_COLS = 'minmax(118px,1.1fr) 52px minmax(112px,1.1fr) minmax(96px,1fr) 52px minmax(112px,1.1fr) minmax(96px,1fr) minmax(96px,1fr) minmax(88px,.9fr) minmax(88px,.9fr)'
const BILL_COLS = 'minmax(136px,1.2fr) minmax(92px,1fr) minmax(72px,.7fr) 110px 110px minmax(84px,.8fr) 50px minmax(84px,.8fr) minmax(192px,1.25fr)'
const PAD = { padding: '11px 14px' }

const bills = (n: number) => `${n} bill${n === 1 ? '' : 's'}`
const pctWord = (p: number) => `${Math.round(p * 1000) / 10}%`

/** A figure, red in parentheses when it is below nothing. */
function Amount({ value }: { value: number }) {
  return <span className={value < 0 ? t.neg : undefined}>{formatMoneyBare(value)}</span>
}

export default function TallyPanel({
  report,
  sub,
  commission = {},
}: {
  report: TallyReport
  sub: { name: string; slug: string }
  commission?: TallyCommission
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
  const twoMonth = month.ours.length + month.theirs.length

  return (
    <>
      <Cards label={`Tally for ${tallyMonthLong(month.month)}`} count={4} style={{ marginBottom: 26 }}>
        <Card
          label={`${name} · by SO date`}
          value={formatMoney(month.so.bill)}
          note={`${bills(month.so.bills)} · Houzs pays`}
          icon="receipt"
        />
        <Card
          label={`${name} · by fair date`}
          value={formatMoney(month.fair.bill)}
          note={`${bills(month.fair.bills)} · we pay`}
          icon="calendar"
        />
        <Card
          label={`${name} gap`}
          value={formatMoney(month.gap.bill)}
          note={`${bills(twoMonth)} in two months`}
          icon="fileAlert"
          tone={twoMonth > 0 ? 'alert' : 'default'}
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
            By SO date · Houzs pays
          </span>
          <span role="columnheader" aria-colspan={4} className={t.group} style={{ gridColumn: 'span 4' }}>
            By fair date · we pay
          </span>
          <span role="columnheader" aria-colspan={2} className={t.group} style={{ gridColumn: 'span 2' }}>
            Fair − SO
          </span>
        </div>
        <GridHead
          cols={MONTH_COLS}
          cellStyle={PAD}
          cells={[
            'Month',
            { label: 'Bills', style: { textAlign: 'right' } },
            { label: 'Sales', style: { textAlign: 'right' } },
            { label: 'Bill to HC', style: { textAlign: 'right' } },
            { label: 'Bills', style: { textAlign: 'right' } },
            { label: 'Sales', style: { textAlign: 'right' } },
            { label: 'Bill to HC', style: { textAlign: 'right' } },
            { label: <span title="What the month's closed salespeople are paid">Commission</span>, style: { textAlign: 'right' } },
            { label: <span title="By fair date less by SO date, in Bill to HC">Gap</span>, style: { textAlign: 'right' } },
            { label: <span title="As the month ends: bills we have counted that Houzs has not yet, in Bill to HC">Carried</span>, style: { textAlign: 'right' } },
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
        <SectHead title={`${tallyMonthLong(month.month)} · bills in two months`} count={bills(twoMonth).toUpperCase()} />
        <BillList
          title={`Fair date in ${tallyMonthShort(month.month)} · SO date in another month`}
          rows={month.ours}
          side="ours"
          from={report.from}
          sub={sub.slug}
        />
        <BillList
          title={`SO date in ${tallyMonthShort(month.month)} · fair date in another month`}
          rows={month.theirs}
          side="theirs"
          from={report.from}
          sub={sub.slug}
        />
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
    <GridRow cols={MONTH_COLS} zebra={zebra} selected={selected} onClick={onPick} title={`Show ${tallyMonthLong(m.month)}'s bills in two months`}>
      <span role="cell" className={t.month} style={PAD}>{tallyMonthLong(m.month)}</span>
      <span role="cell" className={`${num} ${t.edge}`} style={PAD}>{m.so.bills}</span>
      <span role="cell" className={num} style={PAD}>{formatMoneyBare(m.so.sales)}</span>
      <span role="cell" className={num} style={PAD}>{formatMoneyBare(m.so.bill)}</span>
      <span role="cell" className={`${num} ${t.edge}`} style={PAD}>{m.fair.bills}</span>
      <span role="cell" className={num} style={PAD}>{formatMoneyBare(m.fair.sales)}</span>
      <span role="cell" className={num} style={PAD}>{formatMoneyBare(m.fair.bill)}</span>
      <span role="cell" className={num} style={PAD} title={paid ? `${paid.closed} salespeople closed` : 'Nobody closed yet'}>
        {paid ? formatMoneyBare(paid.total) : '—'}
      </span>
      <span role="cell" className={`${num} ${t.edge} ${t.strong}`} style={PAD}><Amount value={m.gap.bill} /></span>
      <span role="cell" className={`${num} ${t.strong}`} style={PAD}><Amount value={m.carried.bill} /></span>
    </GridRow>
  )
}

function BillList({ title, rows, side, from, sub }: { title: string; rows: TallyBill[]; side: 'ours' | 'theirs'; from: string | null; sub: string }) {
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
            'Brand',
            'Fair day',
            'SO date',
            { label: 'Sales', style: { textAlign: 'right' } },
            { label: '%', style: { textAlign: 'right' } },
            { label: 'Bill to HC', style: { textAlign: 'right' } },
            { label: side === 'ours' ? 'Houzs' : 'Us', style: { padding: '11px 14px 11px 22px' } },
          ]}
        />
        {rows.length === 0 ? <GridEmpty>None</GridEmpty> : null}
        {rows.map((b, i) => {
          const other = tallyOtherSide(b, side, from)
          return (
            <GridRow
              key={b.orderId}
              cols={BILL_COLS}
              zebra={i % 2 === 1}
              onClick={() => router.push(billHref(sub, b.ourMonth, b.orderId, null))}
              title={`Open ${b.orderNo}`}
            >
              <div role="cell" style={PAD}>
                <div className={`${hv.mono} ${t.doc}`}>{b.orderNo}</div>
                {b.refNo && b.refNo !== b.orderNo ? <div className={t.ref}>{b.refNo}</div> : null}
              </div>
              <span role="cell" style={PAD}>{b.salesperson}</span>
              <span role="cell" style={PAD}>{b.brandName}</span>
              <span role="cell" className={`${hv.mono} ${t.day}`} style={PAD}>{b.fairDate ? tallyDay(b.fairDate) : '—'}</span>
              <span role="cell" className={`${hv.mono} ${t.day}`} style={PAD}>{tallyDay(b.soDate)}</span>
              <span role="cell" className={num} style={PAD}>{formatMoneyBare(b.sales)}</span>
              <span role="cell" className={num} style={PAD}>{b.pct === null ? '—' : pctWord(b.pct)}</span>
              <span role="cell" className={num} style={PAD}>{b.bill === null ? '—' : formatMoneyBare(b.bill)}</span>
              <span role="cell" className={t.chips} style={{ padding: '9px 14px 9px 22px' }}>
                <Chip tone={other.tone} title={other.title}>{other.text}</Chip>
                {b.belowDeposit ? <Chip tone="plain">Below deposit</Chip> : null}
              </span>
            </GridRow>
          )
        })}
        {rows.length > 0 ? (
          <div className={t.total} style={{ gridTemplateColumns: BILL_COLS }} role="row">
            <span role="cell" style={{ ...PAD, gridColumn: 'span 5' }}>{bills(rows.length)}</span>
            <span role="cell" className={num} style={PAD}>{formatMoneyBare(sales)}</span>
            <span role="cell" style={PAD} />
            <span role="cell" className={num} style={PAD}>{formatMoneyBare(bill)}</span>
            <span role="cell" style={PAD} />
          </div>
        ) : null}
      </GridTable>
    </section>
  )
}
