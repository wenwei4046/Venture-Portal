// Department › Venture Pool in the Finance phone app (2026-10-15, part E3 — a
// page the design does not draw, in its style): the desktop page's figures
// (`readVenturePool` — HV's own corporate / treasury cash on its banks) as a
// page of the app: the running balance, the month's net as the chip, then
// *This month* (its lines), *12 months* (in and out a month, the desktop's
// bars) and *Pool ledger* (every line, month by month, newest first). Pure.

import type { VenturePoolRead } from '@/app/(portal)/venture-pool/_lib/venture-read'
import { dayWords, f2, monthWords, plural, r2, shiftMonth, type PageGroup, type PageLine, type PageModel } from './page-model'

const signed = (n: number) => `${n < 0 ? '−' : n > 0 ? '+' : ''}${f2(Math.abs(n))}`
const signedRm = (n: number) => `${n < 0 ? '−' : ''}RM ${f2(Math.abs(n))}`

function line(l: VenturePoolRead['lines'][number]): PageLine {
  return { key: l.id, label: l.description, sub: `${dayWords(l.date)} · ${l.type}`, value: signed(l.amount), tone: l.amount < 0 ? 'out' : 'ledger' }
}

/** `ym`: the month on show (YYYY-MM) — the desktop page's period. */
export function venturePoolModel(read: VenturePoolRead, ym: string): PageModel {
  const byNewest = read.lines.slice().sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
  const months = Array.from(new Set(byNewest.map((l) => l.date.slice(0, 7))))
  const monthLines = byNewest.filter((l) => l.date.slice(0, 7) === ym)
  const ledger: PageGroup[] = months.map((m) => {
    const of = byNewest.filter((l) => l.date.slice(0, 7) === m)
    return { key: m, title: monthWords(m), count: signed(r2(of.reduce((t, l) => t + l.amount, 0))), lines: of.map(line) }
  })
  const trendIn = r2(read.trend.reduce((t, m) => t + m.in, 0))
  const trendOut = r2(read.trend.reduce((t, m) => t + m.out, 0))
  // The trend runs the twelve months up to the one on show, oldest first; the phone reads it newest first.
  const trend: PageLine[] = read.trend
    .map((t, i) => {
      const m = shiftMonth(ym, i - (read.trend.length - 1))
      return { key: m, label: monthWords(m), sub: `In ${f2(t.in)} · Out ${f2(t.out)}`, value: signed(r2(t.in - t.out)), tone: t.in - t.out < 0 ? ('out' as const) : ('ledger' as const) }
    })
    .reverse()

  return {
    hero: { value: signedRm(r2(read.balance)), label: 'Running balance · all-time' },
    chip: { text: `${signed(r2(read.netChange))} this month`, tone: read.netChange < 0 ? 'danger' : 'ledger' },
    eyebrow: `Venture Pool · ${monthWords(ym)}`,
    cards: [
      {
        key: 'month',
        tone: read.netChange < 0 ? 'approved' : 'paid',
        icon: 'calendar',
        label: 'This month',
        sub: `In ${f2(read.monthIn)} · Out ${f2(read.monthOut)}`,
        value: signedRm(r2(read.netChange)),
        groups: [{ key: 'month', title: monthWords(ym), count: plural(monthLines.length, 'entry', 'entries'), lines: monthLines.map(line), empty: 'No movements this month.' }],
      },
      {
        key: 'trend',
        tone: 'company',
        icon: 'report',
        label: '12 months',
        sub: `In ${f2(trendIn)} · Out ${f2(trendOut)}`,
        value: signedRm(r2(trendIn - trendOut)),
        groups: [{ key: 'trend', title: 'In vs Out', count: '12 months', lines: trend }],
      },
      {
        key: 'ledger',
        tone: 'all',
        icon: 'doc',
        label: 'Pool ledger',
        sub: plural(read.lines.length, 'entry', 'entries'),
        value: signedRm(r2(read.balance)),
        groups: ledger.length > 0 ? ledger : [{ key: 'none', title: 'Pool ledger', count: '0', lines: [], empty: 'No movements yet.' }],
      },
    ],
  }
}
