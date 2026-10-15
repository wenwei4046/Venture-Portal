// The Finance phone app's Daily Bank (2026-10-15, part 5 — a page the design
// does not draw, in the app's style): the day as a hub — what every bank has
// truly free, the day between its arrows, a card per bank, then what came in,
// what waits on the Principal and what the day opened with — and each card's
// list. Every figure is the desktop board's (`fetchDailyBank`, the same day,
// the same columns — payroll by department where the reader reads it so);
// this only shapes them, each card summing exactly what its list holds. Pure.

import type { CardTone, HubCardItem } from '@/components/finv/Hub'
import type { HrIconName } from '@/components/hrv/icons'
import type { BankDay, SegAmounts } from '@/lib/daily-bank'
import type { DailyBankData } from '@/lib/daily-bank-data'

export type DailyBankCard = 'received' | 'pending' | 'bf' | `bank:${string}`

export interface DayLine {
  key: string
  label: string
  sub?: string
  value: string
  tone?: 'ledger' | 'out' | 'alert' | 'muted' | null
}

export interface DayGroup {
  key: string
  title: string
  count: string
  lines: DayLine[]
  empty?: string
}

export interface DailyBankModel {
  date: string
  isToday: boolean
  /** "Today · 15 Oct 2026", "14 Oct 2026". */
  dayLabel: string
  hero: { value: string; label: string }
  cards: HubCardItem[]
  /** Each card's own list: its title and its groups of lines. */
  lists: Record<string, { title: string; groups: DayGroup[] }>
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const r2 = (n: number) => Math.round(n * 100) / 100
const f2 = (n: number) => (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const rm = (n: number) => `RM ${f2(n)}`
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** "15 Oct 2026". */
export const dayWords = (iso: string) => `${Number(iso.slice(8, 10))} ${MON[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`

/** The day before or after, `YYYY-MM-DD` (a calendar day, no clock). */
export function shiftDay(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`
}

/** B/F → in → pending, as the desktop's phone board says a bank's or a department's walk. */
const walk = (bf: number, inToday: number, pend: number) => `B/F ${f2(bf)}${inToday ? ` · +${f2(inToday)}` : ''}${pend ? ` · −${f2(pend)}` : ''}`

export function dailyBankModel(data: DailyBankData, today: string): DailyBankModel {
  const cols = data.columns
  // Over the payload's columns — never the server module's column state (empty in the browser).
  const sum = (a: SegAmounts) => r2(cols.reduce((s, c) => s + (a[c.key] ?? 0), 0))
  const isToday = data.date === today
  const dayLabel = `${isToday ? 'Today · ' : ''}${dayWords(data.date)}`
  const over = (pick: (b: BankDay) => SegAmounts) => r2(data.banks.reduce((s, b) => s + sum(pick(b)), 0))
  const bf = over((b) => b.bf)
  const received = over((b) => b.inToday)
  const pending = over((b) => b.pendingTotal)
  const available = r2(data.banks.reduce((s, b) => s + sum(b.available), 0))
  const receiptCount = data.banks.reduce((n, b) => n + b.receipts.length, 0)
  const pendingCount = data.banks.reduce((n, b) => n + b.pending.length, 0)

  const card = (key: string, tone: CardTone, icon: HrIconName, label: string, sub: string, value: string): HubCardItem => ({ key, tone, icon, label, sub, value })

  const receiptLines = (b: BankDay): DayLine[] => [
    ...b.receipts.map((r, i) => ({ key: `${b.bankId}:r${i}`, label: r.payer, sub: [r.voucherNo, r.description].filter(Boolean).join(' · ') || undefined, value: `+${f2(r.amount)}`, tone: 'ledger' as const })),
    // GL money in with no receipt of its own: a journal, a transfer.
    ...(Math.abs(b.otherInToday) >= 0.005 ? [{ key: `${b.bankId}:other`, label: 'Other (JV / transfer)', value: `${b.otherInToday < 0 ? '' : '+'}${f2(b.otherInToday)}`, tone: (b.otherInToday < 0 ? 'out' : 'ledger') as DayLine['tone'] }] : []),
  ]
  const pendingLines = (b: BankDay): DayLine[] =>
    b.pending.map((p, i) => ({
      key: `${b.bankId}:p${i}`,
      label: p.payee,
      sub: [p.voucherNo, p.description, cols.filter((c) => (p.amounts[c.key] ?? 0) !== 0).map((c) => c.label).join(', ')].filter(Boolean).join(' · ') || undefined,
      value: `−${f2(p.total)}`,
      tone: 'alert' as const,
    }))

  const lists: DailyBankModel['lists'] = {}
  const bankCards: HubCardItem[] = data.banks.map((b, i) => {
    const key = `bank:${b.bankId}`
    const bBf = sum(b.bf)
    const bIn = sum(b.inToday)
    const bOut = sum(b.outToday)
    const bCurrent = sum(b.current)
    const bPend = sum(b.pendingTotal)
    const bAvail = sum(b.available)
    const depts = cols.filter((c) => (b.bf[c.key] ?? 0) !== 0 || (b.inToday[c.key] ?? 0) !== 0 || (b.pendingTotal[c.key] ?? 0) !== 0 || (b.available[c.key] ?? 0) !== 0)
    lists[key] = {
      title: b.bankName,
      groups: [
        {
          key: 'day',
          title: 'The day',
          count: rm(bAvail),
          lines: [
            { key: 'bf', label: 'Balance B/F', sub: 'Start of the day', value: f2(bBf) },
            { key: 'in', label: 'Received', value: `+${f2(bIn)}`, tone: bIn ? 'ledger' : 'muted' },
            { key: 'out', label: 'Paid out', value: `−${f2(bOut)}`, tone: bOut ? 'out' : 'muted' },
            { key: 'current', label: 'Balance', sub: 'End of the day', value: f2(bCurrent), tone: bCurrent < 0 ? 'out' : null },
            { key: 'pend', label: 'Pending', sub: 'Awaiting Principal', value: `−${f2(bPend)}`, tone: bPend ? 'alert' : 'muted' },
            { key: 'avail', label: 'Available', sub: 'Cash truly free', value: f2(bAvail), tone: bAvail < 0 ? 'out' : null },
          ],
        },
        {
          key: 'depts',
          title: 'Departments',
          count: String(depts.length),
          empty: 'Nothing in any department.',
          lines: depts.map((c) => ({
            key: c.key,
            label: c.label,
            sub: walk(b.bf[c.key] ?? 0, b.inToday[c.key] ?? 0, b.pendingTotal[c.key] ?? 0),
            value: f2(b.available[c.key] ?? 0),
            tone: (b.available[c.key] ?? 0) < 0 ? 'out' : null,
          })),
        },
        { key: 'pending', title: 'Pending · awaiting Principal', count: String(b.pending.length), empty: 'Nothing waiting.', lines: pendingLines(b) },
        { key: 'received', title: 'Received', count: String(b.receipts.length), empty: 'Nothing in yet.', lines: receiptLines(b) },
      ],
    }
    return card(key, i === 0 ? 'all' : 'company', 'payroll', b.bankName, walk(bBf, bIn, bPend), rm(bAvail))
  })

  lists.received = {
    title: 'Received today',
    groups: data.banks.map((b) => ({ key: b.bankId, title: b.bankName, count: rm(sum(b.inToday)), empty: 'Nothing in yet.', lines: receiptLines(b) })),
  }
  lists.pending = {
    title: 'Pending payment',
    groups: data.banks.map((b) => ({ key: b.bankId, title: b.bankName, count: rm(sum(b.pendingTotal)), empty: 'Nothing waiting.', lines: pendingLines(b) })),
  }
  lists.bf = {
    title: 'Balance B/F',
    groups: [
      {
        key: 'banks',
        title: 'Banks',
        count: rm(bf),
        lines: data.banks.map((b) => ({ key: b.bankId, label: b.bankName, sub: b.glCode, value: f2(sum(b.bf)), tone: sum(b.bf) < 0 ? 'out' : null })),
      },
    ],
  }

  return {
    date: data.date,
    isToday,
    dayLabel,
    hero: { value: rm(available), label: `Total available · ${dayLabel}` },
    cards: [
      ...bankCards,
      card('received', 'paid', 'in', 'Received today', receiptCount > 0 ? plural(receiptCount, 'receipt', 'receipts') : received ? 'By JV / transfer' : 'Nothing in yet', rm(received)),
      card('pending', 'pending_approval', 'calendar', 'Pending payment', pendingCount > 0 ? `${pendingCount} awaiting Principal` : 'Nothing waiting', rm(pending)),
      card('bf', 'quiet', 'doc', 'Balance B/F', 'Start of the day', rm(bf)),
    ],
    lists,
  }
}
