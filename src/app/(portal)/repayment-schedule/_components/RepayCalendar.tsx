'use client'

import { useState } from 'react'
import Link from 'next/link'
import dayjs from 'dayjs'
import { formatMoney, formatMoneyBare } from '@/lib/utils'

// The Repayment Schedule's calendar (2026-10-09, the user's Claude Design
// handoff). Each installment of the month sits on its day, read off the
// deal's repayment plan (lib/repayment-plan — the same rows as its page's
// Repayment schedule): ↓ money we collect (a Fund OUT loan), ↑ money we pay (a
// Fund IN source), tinted by where it stands — paid green, due white, part
// paid amber, overdue red. A hover shows the installment's card, a click opens
// the deal, and a day with more than four shows "+N more". On a phone the
// month reads as a list of days instead.

export interface CalendarEvent {
  /** YYYY-MM-DD */
  date: string
  kind: 'collect' | 'pay'
  name: string
  amount: number
  /** What is still unpaid on it. */
  outstanding: number
  status: 'paid' | 'due' | 'partial' | 'overdue'
  /** Its number in the plan, and how many the plan has (null: no fixed term). */
  no: number
  months: number | null
  /** Monthly rate, decimal. */
  rate: number
  principal: number
  href: string
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const STATUS_LABEL: Record<CalendarEvent['status'], string> = { paid: 'paid', due: 'due', partial: 'part paid', overdue: 'overdue' }
const MAX = 4

// 2026-10-10 — the handoff's legend: the two sides, then the four states, each a swatch.
const LEGEND: Array<[string, string]> = [
  ['sch-collect', '↓ We collect (Fund OUT)'],
  ['sch-pay', '↑ We pay (Fund IN)'],
  ['sch-paid', 'Paid'],
  ['sch-due', 'Due'],
  ['sch-partial', 'Part paid'],
  ['sch-overdue', 'Overdue'],
]

/** An instalment in words, as the phone's day list reads it. */
function whatItIs(e: CalendarEvent): string {
  const short = e.outstanding > 0.005 && e.outstanding < e.amount - 0.005 ? ` · short ${formatMoneyBare(e.outstanding)}` : ''
  return `${e.kind === 'collect' ? 'Collect' : 'Pay'} · instalment ${e.no}${e.months ? ` of ${e.months}` : ''}${short}`
}

interface Hover {
  e: CalendarEvent
  x: number
  y: number
}

export default function RepayCalendar({ month, today, events }: { month: string; today: string; events: CalendarEvent[] }) {
  const [open, setOpen] = useState<string | null>(null)
  const [hover, setHover] = useState<Hover | null>(null)

  const first = dayjs(`${month}-01`)
  const lead = (first.day() + 6) % 7 // Monday first
  const inMonth = first.daysInMonth()
  const byDay = new Map<string, CalendarEvent[]>()
  for (const e of events) {
    if (e.date.slice(0, 7) !== month) continue
    const list = byDay.get(e.date) ?? []
    list.push(e)
    byDay.set(e.date, list)
  }
  // Collections first, then payments, each by amount.
  for (const list of byDay.values()) list.sort((a, b) => (a.kind === b.kind ? b.amount - a.amount : a.kind === 'collect' ? -1 : 1))

  const cells: Array<string | null> = [...Array(lead).fill(null)]
  for (let d = 1; d <= inMonth; d++) cells.push(`${month}-${String(d).padStart(2, '0')}`)
  while (cells.length % 7) cells.push(null)

  const net = (list: CalendarEvent[]) => {
    const inn = list.filter((e) => e.kind === 'collect').reduce((s, e) => s + e.amount, 0)
    const out = list.filter((e) => e.kind === 'pay').reduce((s, e) => s + e.amount, 0)
    return { inn, out }
  }

  const show = (e: CalendarEvent) => (ev: { currentTarget: HTMLElement }) => {
    const rc = ev.currentTarget.getBoundingClientRect()
    const W = 280
    const x = rc.right + 8 + W > (typeof window !== 'undefined' ? window.innerWidth : 1200) ? rc.left - W - 8 : rc.right + 8
    setHover({ e, x: Math.max(8, x), y: Math.max(8, Math.min(rc.top, (typeof window !== 'undefined' ? window.innerHeight : 800) - 260)) })
  }

  const count = [...byDay.values()].reduce((n, list) => n + list.length, 0)

  return (
    <div className="repay-cal">
      <div className="sect-head">
        <h2>Calendar</h2>
        <span className="rule" aria-hidden />
        <span className="count">
          {count} {count === 1 ? 'INSTALMENT' : 'INSTALMENTS'} · {first.format('MMMM YYYY').toUpperCase()}
        </span>
      </div>
      <div className="cal-legend" aria-hidden>
        {LEGEND.map(([cls, label]) => (
          <span key={cls}>
            <i className={`sch-swatch ${cls}`} />
            {label}
          </span>
        ))}
      </div>

      <div className="cal-wrap">
        <div className="cal-head">
          {DAYS.map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className="cal-grid">
          {cells.map((iso, i) => {
            if (!iso) return <div key={`b${i}`} className="cal-day blank" />
            const list = byDay.get(iso) ?? []
            const expanded = open === iso
            const shown = expanded ? list : list.slice(0, MAX)
            const { inn, out } = net(list)
            return (
              <div key={iso} data-day={iso} className={`cal-day${iso === today ? ' today' : ''}`}>
                <div className="cal-top">
                  <span className="cal-num">{Number(iso.slice(8))}</span>
                  {list.length > 0 ? (
                    <span className={`cal-net ${inn >= out ? 'in' : 'out'}`}>
                      {inn ? `+${formatMoneyBare(inn)}` : ''}
                      {inn && out ? ' / ' : ''}
                      {out ? `−${formatMoneyBare(out)}` : ''}
                    </span>
                  ) : null}
                </div>
                {shown.map((e, k) => (
                  <Link
                    key={k}
                    href={e.href}
                    className={`cal-item sch-cal-item ${e.kind} ${e.status}`}
                    onMouseEnter={show(e)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={show(e)}
                    onBlur={() => setHover(null)}
                  >
                    {/* Two lines (the handoff): who, then the amount. */}
                    <span className="sch-cal-who">
                      <span className="arrow">{e.kind === 'collect' ? '↓' : '↑'}</span>
                      <span className="who">{e.name}</span>
                    </span>
                    <span className="amt">{formatMoneyBare(e.amount)}</span>
                  </Link>
                ))}
                {list.length > MAX ? (
                  <button type="button" className="cal-more" onClick={() => setOpen(expanded ? null : iso)}>
                    {expanded ? 'Show less' : `+${list.length - MAX} more`}
                  </button>
                ) : null}
                {list.length > 0 ? (
                  <span className="cal-dots" aria-hidden>
                    {list.map((e, k) => (
                      <i key={k} className={`${e.kind} ${e.status}`} />
                    ))}
                  </span>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>

      {/* A phone reads the month as days: the day and its net, then its
          instalments in one box, each saying what it is and where it stands
          (2026-10-10, the handoff). */}
      <div className="cal-agenda">
        {[...byDay.keys()].sort().map((iso) => {
          const list = byDay.get(iso)!
          const { inn, out } = net(list)
          return (
            <div key={iso} className="sch-agenda-day">
              <div className="sch-agenda-head">
                <span>
                  {dayjs(iso).format('D MMM YYYY')}
                  {iso === today ? ' · today' : ''}
                </span>
                <span className={`sch-agenda-net ${inn >= out ? 'sch-in' : 'sch-out'}`}>
                  {inn ? `+${formatMoneyBare(inn)}` : ''}
                  {inn && out ? '  ' : ''}
                  {out ? `−${formatMoneyBare(out)}` : ''}
                </span>
              </div>
              <div className="sch-agenda-box">
                {list.map((e, k) => (
                  <Link key={k} href={e.href} className={`sch-agenda-item sch-${e.kind}`}>
                    <span className="sch-agenda-arrow" aria-hidden>
                      {e.kind === 'collect' ? '↓' : '↑'}
                    </span>
                    <span className="sch-agenda-main">
                      <span className="sch-agenda-who">{e.name}</span>
                      <span className="sch-agenda-what">{whatItIs(e)}</span>
                    </span>
                    <span className="sch-agenda-side">
                      <span className="sch-agenda-amt">{formatMoneyBare(e.amount)}</span>
                      <span className={`cal-card-status ${e.status} sch-st`}>{STATUS_LABEL[e.status]}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {hover ? (
        <div role="tooltip" className="cal-card" style={{ left: hover.x, top: hover.y }}>
          <div className="sch-card-top">
            <span className={`cal-card-kind ${hover.e.kind}`}>{hover.e.kind === 'collect' ? '↓ We collect · Fund OUT' : '↑ We pay · Fund IN'}</span>
            <span className={`cal-card-status ${hover.e.status} sch-st`}>{STATUS_LABEL[hover.e.status]}</span>
          </div>
          <div className="cal-card-name">{hover.e.name}</div>
          <div className="cal-card-date sch-card-date">Due {dayjs(hover.e.date).format('D MMM YYYY')}</div>
          <dl className="sch-card-dl">
            <div>
              <dt>Instalment</dt>
              <dd>{`${hover.e.no}${hover.e.months ? ` of ${hover.e.months}` : ''}`}</dd>
            </div>
            <div>
              <dt>Amount due</dt>
              <dd>{formatMoney(hover.e.amount)}</dd>
            </div>
            {hover.e.outstanding > 0 && hover.e.outstanding < hover.e.amount ? (
              <div>
                <dt>Still short</dt>
                <dd>{formatMoney(hover.e.outstanding)}</dd>
              </div>
            ) : null}
            <div>
              <dt>Rate</dt>
              <dd>{`${(hover.e.rate * 100).toFixed(3)}%/mo`}</dd>
            </div>
            <div>
              <dt>Original</dt>
              <dd>{formatMoney(hover.e.principal)}</dd>
            </div>
          </dl>
        </div>
      ) : null}
    </div>
  )
}
