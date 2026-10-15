// Fund › Invoice Financing in the Finance phone app (2026-10-15, part 5c — a
// page the design does not draw, in its style): the desktop page's register
// (`readBaRegister`, the very rows its table and limit cards read) as a hub —
// the active face over the page's own cards (what the borrowers are charged,
// what HC is owed, HV's margin), the register and the limits; a financing as
// its page, as `/ba/[id]` reads it (`readBaFacility`) — its terms, dates,
// billing, the borrower's facility, its documents — with what this reader may
// do to it. Figures from lib/ba, as everywhere. Pure.

import type { HubCardItem } from '@/components/finv/Hub'
import type { BankOption, BaRow, LimitRow } from '@/app/(portal)/ba/_components/BaView'
import type { BaFacility, BaRegister } from '@/app/(portal)/ba/_lib/ba-read'
import { calcBa } from '@/lib/ba'
import { dayWords, f2, plural, r2, rm } from './page-model'

export type BaCard = 'charge' | 'owe' | 'margin' | 'register' | 'limits'
export const BA_CARDS: readonly BaCard[] = ['charge', 'owe', 'margin', 'register', 'limits']

export const BA_TITLE: Record<BaCard, string> = {
  charge: 'To charge borrowers',
  owe: 'To pay HC',
  margin: 'HV margin',
  register: 'Financing register',
  limits: 'Limits',
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dayMon = (iso: string) => `${Number(iso.slice(8, 10))} ${MON[Number(iso.slice(5, 7)) - 1]}`

export const baRefOf = (r: Pick<BaRow, 'id' | 'baNo'>) => r.baNo ?? `BA-${r.id.slice(0, 8)}`
export const calcOf = (r: BaRow) => calcBa({ face: r.faceAmount, bankAnnualRate: r.bankAnnualRate, days: r.tenorDays, chargeRateMonthly: r.chargeRateMonthly, hcRateMonthly: r.hcRateMonthly })

/** Whole days from one day to another (negative once it has passed). */
export function daysTo(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

/** A financing's state as the desktop's chip says it: active by its days left — within 14 soon, past maturity overdue. */
export function baState(r: Pick<BaRow, 'status' | 'maturityDate'>, today: string): { words: string; light: 'info' | 'alert' | 'danger' | 'ledger' | 'def' } {
  if (r.status === 'settled') return { words: 'settled', light: 'ledger' }
  if (r.status === 'cancelled') return { words: 'cancelled', light: 'def' }
  const d = daysTo(today, r.maturityDate)
  if (d < 0) return { words: `overdue ${-d}d`, light: 'danger' }
  return { words: `matures in ${d}d`, light: d <= 14 ? 'alert' : 'info' }
}

const pctMo = (rate: number) => `${parseFloat((rate * 100).toFixed(3))}%/mo`
const periodText = (r: BaRow) => `${r.tenorDays}d · ${dayMon(r.startDate)} – ${dayMon(r.maturityDate)}`

export interface BaListRow {
  id: string
  /** The borrower (the phone lists' rule: the party, no number). */
  title: string
  desc: string
  amount: string
  tone: 'ledger' | 'out' | null
  /** What the register's search reads: the ref, the bank, the borrower, the notes. */
  search: string
}

export interface BaLimitView {
  companyId: string
  label: string
  limit: number
  used: number
  available: number
  /** Of the limit, in percent; null with no limit set. */
  pct: number | null
  /** The desktop card's colour: none, within the limit, 70% on, at or past it. */
  tone: 'none' | 'ledger' | 'alert' | 'danger'
  avgRatePa: number | null
  /** Its active financings by maturity, in the desktop card's words: the face and bank, then when it matures and its ref. */
  active: Array<{ id: string; label: string; sub: string; late: boolean; soon: boolean }>
}

export interface BaHubModel {
  hero: { value: string; label: string }
  chip: { text: string; tone: 'alert' | 'danger' } | null
  cards: Array<HubCardItem & { key: BaCard }>
  lists: {
    charge: BaListRow[]
    owe: BaListRow[]
    margin: BaListRow[]
    register: { active: BaListRow[]; settled: BaListRow[]; cancelled: BaListRow[] }
  }
  limits: BaLimitView[]
  /** The companies with no limit card yet — "Set a limit for another company". */
  others: Array<{ id: string; label: string }>
  /** The limits' head: how many companies and how much of their limits is used. */
  limitsCount: string
}

export function baHubModel(reg: Pick<BaRegister, 'rows' | 'limits'>, today: string): BaHubModel {
  const rows = reg.rows
  const active = rows.filter((r) => r.status === 'active').slice().sort((a, b) => a.maturityDate.localeCompare(b.maturityDate))
  const totals = active.reduce(
    (acc, r) => {
      const c = calcOf(r)
      return { face: acc.face + r.faceAmount, charge: acc.charge + c.chargeToBorrower, owe: acc.owe + c.oweToHc, margin: acc.margin + c.margin }
    },
    { face: 0, charge: 0, owe: 0, margin: 0 },
  )
  const late = active.filter((r) => daysTo(today, r.maturityDate) < 0).length
  const soon = active.filter((r) => {
    const d = daysTo(today, r.maturityDate)
    return d >= 0 && d <= 14
  }).length

  // Where it is from, last: the bank, then its ref (a bank's refs run long — the state and terms lead).
  const base = (r: BaRow) => [r.bankName, r.baNo].filter(Boolean).join(' · ')
  const search = (r: BaRow) => [r.baNo, r.bankName, r.borrower, r.notes].filter(Boolean).join(' ').toLowerCase()
  const line = (r: BaRow, desc: string, amount: number, tone: BaListRow['tone']): BaListRow => ({ id: r.id, title: r.borrower, desc, amount: f2(amount), tone, search: search(r) })
  const charge = active.map((r) => {
    const c = calcOf(r)
    return line(r, [r.interestInvoice ? `billed ${r.interestInvoice.no ?? ''}`.trim() : 'to bill', `${pctMo(r.chargeRateMonthly)} · ${r.tenorDays}d`, base(r)].filter(Boolean).join(' · '), c.chargeToBorrower, 'ledger')
  })
  const owe = active.map((r) => {
    const c = calcOf(r)
    return line(r, [r.interestPv ? `PV ${r.interestPv.no ?? ''} · ${r.interestPv.status.replace(/_/g, ' ')}` : 'HC not paid', `${pctMo(r.hcRateMonthly)} · ${r.tenorDays}d`, base(r)].filter(Boolean).join(' · '), c.oweToHc, 'out')
  })
  const margin = active.map((r) => {
    const c = calcOf(r)
    return line(r, [`charge ${f2(c.chargeToBorrower)} − HC ${f2(c.oweToHc)}`, base(r)].filter(Boolean).join(' · '), c.margin, null)
  })
  const reg_ = (r: BaRow) => line(r, [baState(r, today).words, periodText(r), base(r)].filter(Boolean).join(' · '), r.faceAmount, null)
  const register = {
    active: active.map(reg_),
    settled: rows.filter((r) => r.status === 'settled').map(reg_),
    cancelled: rows.filter((r) => r.status === 'cancelled').map(reg_),
  }

  // The limit cards (the desktop's): each company with a limit or something in use.
  const limits: BaLimitView[] = reg.limits
    .filter((l) => l.limit > 0 || l.used > 0)
    .map((l) => {
      const of = active.filter((r) => r.borrowerCompanyId === l.companyId)
      const rated = of.filter((r) => r.bankAnnualRate > 0)
      const ratedFace = rated.reduce((s, r) => s + r.faceAmount, 0)
      const pct = l.limit > 0 ? (l.used / l.limit) * 100 : null
      return {
        companyId: l.companyId,
        label: l.label,
        limit: l.limit,
        used: l.used,
        available: r2(l.limit - l.used),
        pct,
        tone: pct == null ? 'none' : pct >= 100 ? 'danger' : pct >= 70 ? 'alert' : 'ledger',
        avgRatePa: ratedFace > 0 ? rated.reduce((s, r) => s + r.faceAmount * r.bankAnnualRate, 0) / ratedFace : null,
        active: of.map((r) => {
          const d = daysTo(today, r.maturityDate)
          return {
            id: r.id,
            label: `RM ${f2(r.faceAmount)}${r.bankName ? ` — ${r.bankName}` : ''}`,
            sub: `${d < 0 ? `overdue ${-d}d` : `matures ${dayWords(r.maturityDate)} (${d}d)`}${r.baNo ? ` · ${r.baNo}` : ''}`,
            late: d < 0,
            soon: d >= 0 && d <= 14,
          }
        }),
      }
    })
  const limitTotal = limits.reduce((t, l) => t + l.limit, 0)
  const usedTotal = limits.reduce((t, l) => t + l.used, 0)
  const others = reg.limits.filter((l: LimitRow) => !(l.limit > 0 || l.used > 0)).map((l) => ({ id: l.companyId, label: l.label }))
  const limitsCount = `${plural(limits.length, 'company', 'companies')}${limitTotal > 0 ? ` · ${Math.round((usedTotal / limitTotal) * 100)}% used` : ''}`

  return {
    hero: { value: rm(r2(totals.face)), label: `Active face · ${active.length} active` },
    chip: late > 0 ? { text: `${late} overdue`, tone: 'danger' } : soon > 0 ? { text: `${soon} maturing in 14 days`, tone: 'alert' } : null,
    cards: [
      { key: 'charge', tone: 'paid', icon: 'in', label: BA_TITLE.charge, sub: 'Bill the borrower · 5028', value: rm(r2(totals.charge)) },
      { key: 'owe', tone: 'approved', icon: 'out', label: BA_TITLE.owe, sub: 'Pay HC · 6001', value: rm(r2(totals.owe)) },
      { key: 'margin', tone: 'company', icon: 'percent', label: BA_TITLE.margin, sub: 'Charge − owe HC', value: rm(r2(totals.margin)) },
      { key: 'register', tone: 'all', icon: 'doc', label: BA_TITLE.register, sub: `${active.length} active · ${register.settled.length} settled`, value: plural(rows.length, 'BA', 'BAs') },
      { key: 'limits', tone: 'quiet', icon: 'tree', label: BA_TITLE.limits, sub: limitTotal > 0 ? `of ${f2(limitTotal)} · ${limitsCount}` : limitsCount, value: rm(r2(usedTotal)) },
    ],
    lists: { charge, owe, margin, register },
    limits,
    others,
    limitsCount,
  }
}

// ── A financing as its page ────────────────────────────────────────────────

export interface BaRecordLine {
  label: string
  value: string
  sub?: string
  mono?: boolean
  tone?: 'ledger' | 'wait' | 'muted'
}

export interface BaRecordModel {
  id: string
  ref: string
  borrower: string
  bankName: string | null
  status: BaRow['status']
  state: { words: string; light: 'info' | 'alert' | 'danger' | 'ledger' | 'def' }
  face: string
  note: string
  groups: Array<{ title: string; lines: BaRecordLine[] }>
  attachments: Array<{ id: string; name: string }>
  /** What this reader may do to it now — the desktop page's steps, each as its own gate asks. */
  can: { pv: boolean; bill: boolean; settle: boolean; reopen: boolean; edit: boolean; remove: boolean; files: boolean }
  /** Why Edit and Delete are shut while the interest is billed or paid (they stay on show, as the desktop's row menu). */
  locked: string | null
  /** What Generate PV needs: what HC is owed and the banks to pay from. */
  oweToHc: number
  banks: BankOption[]
  /** The financing itself — the Edit sheet starts on it. */
  row: BaRow
}

/** May: Treasury's Create (bill, PV), Edit (settle, reopen, edit, documents), Void (delete) — the actions' own gates. */
export function baRecordModel(f: BaFacility, today: string, may: { create: boolean; edit: boolean; void: boolean }): BaRecordModel {
  const r = f.row
  const c = calcOf(r)
  const active = r.status === 'active'
  const d = daysTo(today, r.maturityDate)
  const pct = (x: number) => `${(x * 100).toFixed(2)}%`
  const billed = !!r.interestInvoice
  const docs = [r.interestInvoice ? `invoice ${r.interestInvoice.no ?? ''} (${r.interestInvoice.status})` : null, r.interestPv ? `PV ${r.interestPv.no ?? ''} (${r.interestPv.status})` : null].filter(Boolean).join(' + ')
  const groups: BaRecordModel['groups'] = [
    {
      title: 'Terms',
      lines: [
        { label: 'Borrower', value: r.borrower },
        { label: 'Bank', value: r.bankName ?? '—' },
        { label: 'Face amount', value: f2(r.faceAmount), mono: true },
        { label: 'Bank rate', value: `${pct(r.bankAnnualRate)} p.a.`, sub: 'ref', mono: true },
        { label: 'Charge', value: `${pct(r.chargeRateMonthly)} /mo`, mono: true },
        { label: 'To HC', value: `${pct(r.hcRateMonthly)} /mo`, mono: true },
      ],
    },
    {
      title: 'Dates',
      lines: [
        { label: 'Start date', value: dayWords(r.startDate), mono: true },
        { label: 'Maturity', value: dayWords(r.maturityDate), mono: true, sub: !active ? (r.status === 'settled' ? 'Settled' : 'Cancelled') : d < 0 ? `Overdue ${-d}d` : `${d} days left` },
        { label: 'Days', value: String(r.tenorDays), mono: true },
      ],
    },
    {
      title: 'Billing',
      lines: [
        { label: 'Interest billing', value: billed ? 'Billed' : 'To bill', tone: billed ? 'ledger' : 'wait' },
        { label: 'Invoice', value: r.interestInvoice ? `${r.interestInvoice.no ?? '—'} · ${r.interestInvoice.status}` : '—', mono: !!r.interestInvoice },
        { label: 'PV to HC', value: r.interestPv ? `${r.interestPv.no ?? '—'} · ${r.interestPv.status.replace(/_/g, ' ')}` : '—', mono: !!r.interestPv },
        { label: 'Charge borrower', value: f2(c.chargeToBorrower), sub: 'bill · 5028', mono: true, tone: 'ledger' },
        { label: 'Owe HC', value: f2(c.oweToHc), sub: 'pay · 6001', mono: true },
        { label: 'HV margin', value: f2(c.margin), sub: 'charge − owe HC', mono: true },
        { label: 'Collect at maturity / repay HC', value: `${f2(c.collectTotal)} / ${f2(c.repayHcTotal)}`, mono: true },
        { label: 'Bank interest (ref)', value: f2(c.bankInterest), sub: "HC's cost", mono: true, tone: 'muted' },
      ],
    },
    {
      title: `Facility · ${f.shortCode ?? r.borrower}`,
      lines: [
        { label: 'Limit', value: f.limit > 0 ? f2(f.limit) : 'No limit set', mono: f.limit > 0 },
        { label: 'Active (used)', value: f2(f.used), mono: true },
        { label: 'Available', value: f.limit > 0 ? f2(f.limit - f.used) : '—', mono: true },
        { label: 'Of limit', value: f.limit > 0 ? `${Math.round((f.used / f.limit) * 100)}%` : '—', mono: true },
      ],
    },
    ...(r.notes ? [{ title: 'Notes', lines: [{ label: 'Notes', value: r.notes }] }] : []),
  ]
  return {
    id: r.id,
    ref: baRefOf(r),
    borrower: r.borrower,
    bankName: r.bankName,
    status: r.status,
    state: baState(r, today),
    face: rm(r.faceAmount),
    note: !active ? (r.status === 'settled' ? 'Settled — the limit is released' : 'Cancelled') : d < 0 ? `Overdue ${-d}d · matured ${dayWords(r.maturityDate)}` : `Matures ${dayWords(r.maturityDate)} · ${d} days left`,
    groups,
    attachments: r.attachments,
    can: {
      pv: active && !r.interestPv && may.create,
      bill: active && !r.interestInvoice && may.create,
      settle: active && may.edit,
      reopen: r.status === 'settled' && may.edit,
      edit: may.edit,
      remove: may.void,
      files: may.edit,
    },
    // The desktop row menu's hint; the server refuses the same (liveInterestDocs).
    locked: docs ? 'void the invoice / PV first' : null,
    oweToHc: c.oweToHc,
    banks: f.banks,
    row: r,
  }
}
