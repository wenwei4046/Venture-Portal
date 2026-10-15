// Fund › Repayment Schedule in the Finance phone app (2026-10-15, part 5c): the
// desktop page's month (`loadRepaymentSchedule`, the very rows its tables and
// its Export read) drawn as a page of the app — the month's net between the
// arrows, then a card for each of the page's parts: what we collect and what we
// pay (its "Due to collect" / "Due to pay" tables, then the Full plans' minimum
// interest, compounding and no-fixed-term deals), the calendar's instalments day
// by day, what is done so far and what is overdue or short. Its figures are the
// page's own cards' sums; a deal opens in the app. Pure.

import type { RepaymentSchedule } from '@/app/(portal)/repayment-schedule/_lib/schedule-data'
import type { CompoundRow, MinInterestRow, NoTermRow, SchedRow } from '@/app/(portal)/repayment-schedule/_components/ScheduleView'
import { DUE_TYPE_LABEL, dueRows, dueTotals, type DueRow } from '@/app/(portal)/repayment-schedule/_components/due-rows'
import type { CalendarEntry } from '@/lib/repayment-calendar'
import { dayWords, f2, joinQuery, monthWords, plural, r2, rm, shiftMonth, type PageCard, type PageGroup, type PageLine, type PageModel, type PagePlace } from './page-model'

type Side = 'collect' | 'pay'

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** A deal's record in the app: a loan (we collect) is Fund OUT's, a fund source (we pay) Fund IN's. */
export const dealHref = (side: Side, id: string) => `/fin-app/fund/${side === 'collect' ? 'out' : 'in'}?id=${encodeURIComponent(id)}`

/** The deal a calendar entry stands for, off its desktop address (`/fund-out/<id>?from=calendar…`). */
export function entryHref(e: Pick<CalendarEntry, 'href' | 'kind'>): string | null {
  const m = /^\/fund-(out|in)\/([^/?#]+)/.exec(e.href)
  return m ? dealHref(m[1] === 'out' ? 'collect' : 'pay', decodeURIComponent(m[2])) : null
}

/** The month on show as the page's address names it (`?m=YYYY-MM`, past or upcoming); none is the office's own. */
export function askedScheduleMonth(m: unknown, thisMonth: string): string {
  return typeof m === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : thisMonth
}

/** Where the page is: the month between its arrows — back and on without end, as the desktop's arrows. */
export function repaymentPlace(ym: string, thisMonth: string): PagePlace {
  const keep = (x: string) => (x === thisMonth ? '' : `m=${x}`)
  return {
    href: '/fin-app/page/repayment',
    title: 'Repayment Schedule',
    roman: 'II.',
    keep: keep(ym),
    period: { label: monthWords(ym), prev: keep(shiftMonth(ym, -1)), next: keep(shiftMonth(ym, 1)) },
  }
}

const sum = <T,>(rows: T[], f: (r: T) => number) => r2(rows.reduce((t, r) => t + f(r), 0))
const dash = '—'

/** A due row's state as the desktop table's last columns say it: a PV awaiting approval, short by, or clear. */
function dueChip(r: DueRow): PageLine['chip'] {
  if (r.pending) return { text: 'pending PV', tone: 'wait' }
  if (r.short == null) return null
  return r.short >= 0.005 ? { text: `short ${f2(r.short)}`, tone: 'danger' } : { text: 'clear', tone: 'ledger' }
}

/** A deal due this month, as a line of "Due to collect" / "Due to pay" — its own screen the table's columns. */
function dueLine(r: DueRow, side: Side, ym: string): PageLine {
  const word = side === 'collect' ? 'Received' : 'Paid'
  const source = r.source ? ` · SC ${r.source}` : ''
  return {
    key: r.key,
    label: r.counterparty,
    sub: `${DUE_TYPE_LABEL[r.type]} · ${r.detail}${source}`,
    value: f2(r.total),
    tone: side === 'collect' ? 'ledger' : 'out',
    chip: dueChip(r),
    open: { href: dealHref(side, r.id) },
    detail: {
      title: r.counterparty,
      groups: [
        {
          key: 'due',
          title: `Due · ${monthWords(ym)}`,
          count: DUE_TYPE_LABEL[r.type],
          lines: [
            { key: 'principal', label: 'Principal', value: r.principal >= 0.005 ? f2(r.principal) : dash },
            { key: 'interest', label: 'Interest', value: r.interest >= 0.005 ? f2(r.interest) : dash },
            { key: 'total', label: 'Total due', value: f2(r.total) },
            { key: 'received', label: `${word} · ${MON[Number(ym.slice(5, 7)) - 1]}`, value: r.received != null ? f2(r.received) : dash, tone: r.received != null ? 'ledger' : null },
            {
              key: 'short',
              label: 'Short',
              value: r.short == null ? dash : r.short >= 0.005 ? f2(-r.short) : undefined,
              tone: r.short != null && r.short >= 0.005 ? 'out' : null,
              chip: r.short != null && r.short < 0.005 ? { text: 'clear', tone: 'ledger' } : null,
            },
            ...(r.pending ? [{ key: 'pending', label: 'A repayment PV awaits approval', chip: { text: 'pending PV', tone: 'wait' as const } }] : []),
          ],
        },
        {
          key: 'deal',
          title: side === 'collect' ? 'Loan · Fund OUT' : 'Fund source · Fund IN',
          count: '',
          lines: [{ key: 'deal', label: r.counterparty, sub: `${r.detail}${source}`, open: { href: dealHref(side, r.id) } }],
        },
      ],
    },
  }
}

/** The Full plans' minimum interest: principal may wait, each month's interest may not. */
function minGroup(rows: MinInterestRow[], side: Side): PageGroup[] {
  if (rows.length === 0) return []
  const short = sum(rows, (r) => r.shortfall)
  const word = side === 'collect' ? 'received' : 'paid'
  return [
    {
      key: 'min',
      title: 'Minimum interest',
      count: short > 0.005 ? `short ${rm(short)}` : 'all met',
      lines: rows.map((r) => ({
        key: `min:${r.key}`,
        label: r.counterparty,
        sub: `${f2(r.due)} due · ${f2(r.paid)} ${word} · ${r.detail}`,
        value: r.met ? dash : f2(-r.shortfall),
        tone: r.met ? null : 'out',
        chip: r.met ? { text: 'met', tone: 'ledger' } : { text: 'short', tone: 'danger' },
        open: { href: dealHref(side, r.key) },
      })),
    },
  ]
}

/** The Full plans' compounding deals: the balance with its rolled interest — not counted in the month's cash. */
function compoundGroup(rows: CompoundRow[], side: Side): PageGroup[] {
  if (rows.length === 0) return []
  return [
    {
      key: 'compound',
      title: 'Compounding',
      count: rm(sum(rows, (r) => r.balance)),
      lines: rows.map((r) => ({
        key: `compound:${r.key}`,
        label: r.counterparty,
        sub: `Rolled ${f2(r.accrued)} · this month ${f2(r.thisMonthInterest)} · ${r.detail}${r.source ? ` · SC ${r.source}` : ''}`,
        value: f2(r.balance),
        chip: { text: 'compound', tone: 'info' },
        open: { href: dealHref(side, r.key) },
      })),
    },
  ]
}

/** The Full plans' deals with no fixed term: what is outstanding and its monthly interest. */
function noTermGroup(rows: NoTermRow[], side: Side): PageGroup[] {
  if (rows.length === 0) return []
  return [
    {
      key: 'noterm',
      title: 'No fixed term',
      count: rm(sum(rows, (r) => r.outstanding)),
      lines: rows.map((r) => ({
        key: `noterm:${r.key}`,
        label: r.counterparty,
        sub: `${f2(r.monthlyInterest)}/mo interest · ${r.detail}${r.source ? ` · SC ${r.source}` : ''}`,
        value: f2(r.outstanding),
        open: { href: dealHref(side, r.key) },
      })),
    },
  ]
}

const STATUS: Record<CalendarEntry['status'], { text: string; tone: 'ledger' | 'def' | 'alert' | 'danger' }> = {
  paid: { text: 'paid', tone: 'ledger' },
  due: { text: 'due', tone: 'def' },
  partial: { text: 'part paid', tone: 'alert' },
  overdue: { text: 'overdue', tone: 'danger' },
}

/** An instalment in words, as the desktop calendar's day list reads it. */
function whatItIs(e: CalendarEntry): string {
  const short = e.outstanding > 0.005 && e.outstanding < e.amount - 0.005 ? ` · short ${f2(e.outstanding)}` : ''
  return `${e.kind === 'collect' ? 'Collect' : 'Pay'} · instalment ${e.no}${e.months ? ` of ${e.months}` : ''}${short}`
}

function entryLine(e: CalendarEntry, i: number, sub: string, value: number): PageLine {
  const href = entryHref(e)
  return {
    key: `${e.date}:${e.kind}:${i}`,
    label: `${e.kind === 'collect' ? '↓' : '↑'} ${e.name}`,
    sub,
    value: f2(value),
    tone: e.kind === 'collect' ? 'ledger' : 'out',
    chip: STATUS[e.status],
    open: href ? { href } : null,
  }
}

const net = (list: CalendarEntry[]) => {
  const inn = sum(list.filter((e) => e.kind === 'collect'), (e) => e.amount)
  const out = sum(list.filter((e) => e.kind === 'pay'), (e) => e.amount)
  return [inn ? `+${f2(inn)}` : '', out ? `−${f2(out)}` : ''].filter(Boolean).join('  ')
}

/** The calendar as days: each day and its net, then its instalments — collections first, each by amount. */
function calendarGroups(events: CalendarEntry[], ym: string, today: string): PageGroup[] {
  const byDay = new Map<string, CalendarEntry[]>()
  for (const e of events) {
    if (e.date.slice(0, 7) !== ym) continue
    byDay.set(e.date, [...(byDay.get(e.date) ?? []), e])
  }
  const days = [...byDay.keys()].sort()
  if (days.length === 0) return [{ key: 'none', title: monthWords(ym), count: '0', lines: [], empty: `Nothing due in ${monthWords(ym)}.` }]
  return days.map((iso) => {
    const list = byDay.get(iso)!.slice().sort((a, b) => (a.kind === b.kind ? b.amount - a.amount : a.kind === 'collect' ? -1 : 1))
    const wd = WEEKDAY[new Date(`${iso}T00:00:00Z`).getUTCDay()]
    return {
      key: iso,
      title: `${wd} ${dayWords(iso)}${iso === today ? ' · today' : ''}`,
      count: net(list),
      lines: list.map((e, i) => entryLine(e, i, whatItIs(e), e.amount)),
    }
  })
}

/** The instalments whose day has come with something still unpaid on them — the desktop's *Overdue / short*. */
function shortEntries(events: CalendarEntry[], side: Side, today: string) {
  return events.filter((e) => e.kind === side && e.date <= today && (e.status === 'overdue' || e.status === 'partial'))
}

function doneLine(r: SchedRow, side: Side): PageLine {
  return {
    key: `${side}:${r.key}`,
    label: r.counterparty,
    sub: `${r.detail}${r.source ? ` · SC ${r.source}` : ''}`,
    value: f2(r.totalDue),
    tone: side === 'collect' ? 'ledger' : 'out',
    open: { href: dealHref(side, r.key) },
  }
}

export function repaymentModel(s: RepaymentSchedule): PageModel {
  const ym = s.currentYM
  const collect = dueRows({ rows: s.collectRows, min: s.collectMin, compound: s.collectCompound, noTerm: s.collectNoTerm })
  const pay = dueRows({ rows: s.repayRows, min: s.repayMin, compound: s.repayCompound, noTerm: s.repayNoTerm })
  // The desktop page's cards, figure for figure.
  const toCollect = sum(s.collectRows, (r) => r.totalDue)
  const toPay = sum(s.repayRows, (r) => r.totalDue)
  const collected = sum(s.collectRows.filter((r) => r.done), (r) => r.totalDue)
  const paid = sum(s.repayRows.filter((r) => r.done), (r) => r.totalDue)
  const lateCollect = shortEntries(s.events, 'collect', s.today)
  const latePay = shortEntries(s.events, 'pay', s.today)
  const shortCollect = sum(lateCollect, (e) => e.outstanding)
  const shortPay = sum(latePay, (e) => e.outstanding)
  const short = r2(shortCollect + shortPay)
  const netMonth = r2(toCollect - toPay)
  const inMonth = s.events.filter((e) => e.date.slice(0, 7) === ym)
  const days = new Set(inMonth.map((e) => e.date)).size

  const dueGroup = (rows: DueRow[], side: Side): PageGroup => ({
    key: 'due',
    title: side === 'collect' ? 'Due to collect' : 'Due to pay',
    count: rm(dueTotals(rows).total),
    lines: rows.map((r) => dueLine(r, side, ym)),
    empty: `Nothing due in ${monthWords(ym)}.`,
  })
  const lateLine = (e: CalendarEntry, i: number) => entryLine(e, i, `Due ${dayWords(e.date)} · instalment ${e.no}${e.months ? ` of ${e.months}` : ''}`, e.outstanding)

  const cards: PageCard[] = [
    {
      key: 'collect',
      tone: 'paid',
      icon: 'in',
      label: 'To collect',
      sub: `${plural(s.collectRows.length, 'instalment', 'instalments')} · Fund OUT`,
      value: rm(toCollect),
      groups: [dueGroup(collect, 'collect'), ...minGroup(s.collectMin, 'collect'), ...compoundGroup(s.collectCompound, 'collect'), ...noTermGroup(s.collectNoTerm, 'collect')],
    },
    {
      key: 'pay',
      tone: 'approved',
      icon: 'out',
      label: 'To pay',
      sub: `${plural(s.repayRows.length, 'instalment', 'instalments')} · Fund IN`,
      value: rm(toPay),
      groups: [dueGroup(pay, 'pay'), ...minGroup(s.repayMin, 'pay'), ...compoundGroup(s.repayCompound, 'pay'), ...noTermGroup(s.repayNoTerm, 'pay')],
    },
    {
      key: 'calendar',
      tone: 'all',
      icon: 'calendar',
      label: 'Calendar',
      sub: `${plural(days, 'day', 'days')} · ${monthWords(ym)}`,
      value: plural(inMonth.length, 'instalment', 'instalments'),
      groups: calendarGroups(s.events, ym, s.today),
    },
    {
      key: 'done',
      tone: 'company',
      icon: 'approve',
      label: 'Done so far',
      sub: `Received ${f2(collected)} · paid ${f2(paid)}`,
      value: rm(r2(collected + paid)),
      groups: [
        { key: 'received', title: 'Received', count: rm(collected), lines: s.collectRows.filter((r) => r.done).map((r) => doneLine(r, 'collect')), empty: 'Nothing received yet.' },
        { key: 'paid', title: 'Paid', count: rm(paid), lines: s.repayRows.filter((r) => r.done).map((r) => doneLine(r, 'pay')), empty: 'Nothing paid yet.' },
      ],
    },
    {
      key: 'short',
      // Gold while something is short (the desktop's card turns red), pale when nothing is.
      tone: short > 0.005 ? 'issued' : 'quiet',
      icon: 'fileAlert',
      label: 'Overdue / short',
      sub: `Collect ${f2(shortCollect)} · pay ${f2(shortPay)}`,
      value: rm(short),
      groups: [
        { key: 'collect', title: 'To collect', count: rm(shortCollect), lines: lateCollect.map(lateLine), empty: 'Nothing overdue to collect.' },
        { key: 'pay', title: 'To pay', count: rm(shortPay), lines: latePay.map(lateLine), empty: 'Nothing overdue to pay.' },
      ],
    },
  ]

  return {
    hero: { value: rm(Math.abs(netMonth)), label: `${netMonth >= 0 ? 'Net to collect' : 'Net to pay'} · ${monthWords(ym)}` },
    chip: short > 0.005 ? { text: `${f2(short)} overdue`, tone: 'danger' } : null,
    eyebrow: `Repayment · ${s.isCurrentMonth ? 'Due this month' : 'Schedule for'} · ${monthWords(ym)}`,
    cards,
  }
}

/** The page's Export, as the desktop links it — the month's two due tables as a spreadsheet. */
export const repaymentFiles = (ym: string) => [{ key: 'xlsx', label: 'Export', href: `/repayment-schedule/export?${joinQuery(`month=${ym}`)}`, format: 'xlsx' as const }]
