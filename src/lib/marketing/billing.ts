// Billing drafts, Marketing's side (②b-2b, mig 20261025121000 — the user's answers 43–48, 50, 51): each product project
// carries the manager's amount (a quote, typed when it is made); a one-time project is billed the month it is done, a
// recurring one every month from the month its work starts until the manager stops it; the manager confirms a month's
// lines, Finance imports them (not built — the user asks Chew first). An outside client's billing details are
// Marketing's; a group company is billed as Finance keeps it. Pure: the pages draw what this says.

import dayjs from 'dayjs'
import { addressFromParts, addressLines, cleanAddress, isEmptyAddress, sameAddress, type Address } from '@/lib/address/address'
import { officeTime } from '@/lib/office-time'

export type BillKind = 'one' | 'recurring'

/** An outside client's billing details, as Marketing keeps them (each null when not given). */
export interface ClientBill {
  name: string | null
  address: Address | null
  phone: string | null
  email: string | null
}

export const NO_BILL: ClientBill = { name: null, address: null, phone: null, email: null }

/** A line billed in the month: the project, its product, its amount now and its confirmation. */
export interface BillLine {
  project: string
  track: string
  title: string
  sub: string
  status: string
  product: string
  kind: BillKind
  doneAt: string | null
  /** A recurring project's first month billed and its last ('YYYY-MM-01'), when stopped. */
  from: string | null
  until: string | null
  /** The project's amount now — null while none is set. */
  amount: number | null
  /** Confirmed for the month: the amount and words kept, who and when. */
  bill: { id: string; amount: number; words: string; by: string; at: string } | null
}

export interface BillClient {
  id: string
  code: string
  name: string
  dot: string
  emoji: string
  /** Marketing's own client — billed with its own details; a group company is Finance's (`company`). */
  client: boolean
  company: string | null
  bill: ClientBill | null
}

export interface BillingPage {
  today: string
  /** The month on screen and the office's month now ('YYYY-MM-01'). */
  month: string
  now: string
  lines: BillLine[]
  subs: BillClient[]
  /** Other months of the last two years with a line still to confirm. */
  open: { month: string; due: number }[]
}

/** A product project's billing, on its page — the manager's (null for anybody else). */
export interface ProjectBill {
  amount: number | null
  from: string | null
  until: string | null
  /** How many months (or the one bill) are confirmed, and the last of them. */
  confirmed: number
  last: string | null
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const strOrNull = (v: unknown) => (typeof v === 'string' && v ? v : null)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null)
const MONTH_RE = /^\d{4}-\d{2}-01$/
const month = (v: unknown) => (typeof v === 'string' && MONTH_RE.test(v.slice(0, 10)) ? v.slice(0, 10) : null)

export function clientBillFromRow(v: unknown): ClientBill | null {
  if (!isObj(v)) return null
  const address = addressFromParts(v.address)
  return {
    name: strOrNull(v.name),
    address: address && !isEmptyAddress(address) ? address : null,
    phone: strOrNull(v.phone),
    email: strOrNull(v.email),
  }
}

export function projectBillFromRow(v: unknown): ProjectBill | null {
  if (!isObj(v)) return null
  return { amount: num(v.amount), from: month(v.from), until: month(v.until), confirmed: Math.max(0, num(v.confirmed) ?? 0), last: month(v.last) }
}

function lineFromRow(l: Record<string, unknown>): BillLine {
  const b = isObj(l.bill) ? l.bill : null
  return {
    project: str(l.project),
    track: str(l.track),
    title: str(l.title),
    sub: str(l.sub),
    status: str(l.status),
    product: str(l.product),
    kind: l.kind === 'recurring' ? 'recurring' : 'one',
    doneAt: strOrNull(l.doneAt),
    from: month(l.from),
    until: month(l.until),
    amount: num(l.amount),
    bill: b ? { id: str(b.id), amount: num(b.amount) ?? 0, words: str(b.words), by: str(b.by), at: str(b.at) } : null,
  }
}

/** mkt_billing(month): the month's page, or null. */
export function billingFromRow(raw: unknown): BillingPage | null {
  if (!isObj(raw) || !month(raw.month)) return null
  return {
    today: str(raw.today),
    month: month(raw.month) as string,
    now: month(raw.now) ?? (month(raw.month) as string),
    lines: (Array.isArray(raw.lines) ? raw.lines.filter(isObj) : []).map(lineFromRow),
    subs: (Array.isArray(raw.subs) ? raw.subs.filter(isObj) : []).map(s => ({
      id: str(s.id),
      code: str(s.code),
      name: str(s.name) || str(s.code),
      dot: str(s.dot) || 'oklch(0.62 0.02 60)',
      emoji: str(s.emoji) || '🏢',
      client: s.client === true,
      company: strOrNull(s.company),
      bill: s.client === true ? clientBillFromRow(s.bill) ?? NO_BILL : null,
    })),
    open: (Array.isArray(raw.open) ? raw.open.filter(isObj) : [])
      .map(o => ({ month: month(o.month) ?? '', due: Math.max(0, num(o.due) ?? 0) }))
      .filter(o => o.month),
  }
}

// ── Months ──────────────────────────────────────────────────────────────────────────────────────────────────

/** `?m=2026-10` → '2026-10-01'; anything else → null (the page then shows this month). */
export function monthParam(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : ''
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s) ? `${s}-01` : null
}

/** '2026-10-01' → '2026-10' (the page's ?m=). */
export const monthKey = (m: string) => m.slice(0, 7)

/** '2026-10-01' → 'Oct 2026'. */
export const monthLabel = (m: string) => dayjs(m).format('MMM YYYY')

/** A month n months on (n < 0: back). */
export const shiftMonth = (m: string, n: number) => dayjs(m).add(n, 'month').format('YYYY-MM-01')

// ── A line, a client, the month ────────────────────────────────────────────────────────────────────────────

/** What a line is: "One-time · done 12 Oct" — "Monthly · from Oct 2026" (· "last Dec 2026" once stopped). */
export function lineWhen(l: BillLine): string {
  if (l.kind === 'one') return `One-time${l.doneAt ? ` · done ${officeTime(l.doneAt).format('D MMM')}` : ''}`
  const from = l.from ? ` · from ${monthLabel(l.from)}` : ''
  return `Monthly${from}${l.until ? ` · last ${monthLabel(l.until)}` : ''}`
}

export interface ClientLines {
  sub: BillClient
  lines: BillLine[]
  /** To confirm: the lines not confirmed yet (their amounts now), and those of them with no amount. */
  due: number
  dueLines: number
  noAmount: number
  confirmed: number
  confirmedLines: number
}

/** The month's lines by client, in the clients' order; each client's sums. */
export function clientLines(page: BillingPage): ClientLines[] {
  return page.subs
    .map(sub => {
      const lines = page.lines.filter(l => l.sub === sub.id)
      const open = lines.filter(l => !l.bill)
      return {
        sub,
        lines,
        due: open.reduce((a, l) => a + (l.amount ?? 0), 0),
        dueLines: open.length,
        noAmount: open.filter(l => l.amount == null).length,
        confirmed: lines.reduce((a, l) => a + (l.bill?.amount ?? 0), 0),
        confirmedLines: lines.length - open.length,
      }
    })
    .filter(c => c.lines.length > 0)
}

/** The month's three figures: still to confirm, confirmed, and the clients billed. */
export function billingTotals(page: BillingPage): { due: number; dueLines: number; confirmed: number; confirmedLines: number; clients: number } {
  const groups = clientLines(page)
  return {
    due: groups.reduce((a, g) => a + g.due, 0),
    dueLines: groups.reduce((a, g) => a + g.dueLines, 0),
    confirmed: groups.reduce((a, g) => a + g.confirmed, 0),
    confirmedLines: groups.reduce((a, g) => a + g.confirmedLines, 0),
    clients: groups.length,
  }
}

/** The lines a client's *Confirm all* sends: not confirmed yet, with an amount. */
export const confirmable = (lines: readonly BillLine[]) => lines.filter(l => !l.bill && l.amount != null).map(l => l.project)

/** An outside client's billing details as lines: the name, the address, then phone · email. */
export function billPartyLines(b: ClientBill | null): string[] {
  if (!b) return []
  return [b.name ?? '', ...(b.address ? addressLines(b.address) : []), [b.phone, b.email].filter(Boolean).join(' · ')].filter(Boolean)
}

/** An outside client billed without its name or address on file — the page asks for them. */
export const billMissing = (c: BillClient) => c.client && (!c.bill?.name || !c.bill?.address)

// ── A product project's billing card ─────────────────────────────────────────────────────────────────────────

/** Its card's words: when it is billed, and what was confirmed. */
export function projectBillWords(kind: BillKind, b: ProjectBill, status: string): string {
  if (kind === 'one') {
    if (b.confirmed > 0 && b.last) return `Billed once done · confirmed for ${monthLabel(b.last)}`
    return status === 'done' ? 'Done · to confirm on Billing' : 'Billed once it is done'
  }
  if (!b.from) return 'Monthly · from the month its work starts'
  if (b.until) return `Stopped · ${monthLabel(b.from)} – ${monthLabel(b.until)}`
  // Paused (②b-2g): billed all the same (answer 51 — paused months too).
  return `Monthly · from ${monthLabel(b.from)}${status === 'paused' ? ' · paused, still billed' : ''}${b.last ? ` · confirmed to ${monthLabel(b.last)}` : ''}`
}

/** A recurring project the manager may stop: its work started, not stopped yet, not closed. */
export const canStop = (kind: BillKind, b: ProjectBill | null, status: string) =>
  kind === 'recurring' && !!b?.from && !b.until && (status === 'active' || status === 'paused')

/** A one-time project's amount stays once its billing is confirmed (withdraw it first). */
export const amountLocked = (kind: BillKind, b: ProjectBill | null) => kind === 'one' && (b?.confirmed ?? 0) > 0

// ── An outside client's billing details, as its forms edit them ─────────────────────────────────────────────

/** The form's own copy: words as typed, the address in its parts. */
export interface BillEdit {
  billName: string
  billAddress: Address
  billPhone: string
  billEmail: string
}

const tidy = (v: string) => v.trim().replace(/\s+/g, ' ')
export const EMPTY_ADDR: Address = { line1: '', line2: '', postcode: '', city: '', state: '', country: 'Malaysia' }

export const billEditOf = (b: ClientBill | null): BillEdit => ({
  billName: b?.name ?? '',
  billAddress: b?.address ?? EMPTY_ADDR,
  billPhone: b?.phone ?? '',
  billEmail: b?.email ?? '',
})

export type BillPatch = Partial<{ billName: string | null; billAddress: Address | null; billPhone: string | null; billEmail: string | null }>

/** Only what changed, as mkt_sub_edit takes it (emptied: null). */
export function billPatch(saved: BillEdit, now: BillEdit): BillPatch {
  const out: BillPatch = {}
  for (const k of ['billName', 'billPhone', 'billEmail'] as const) {
    const v = tidy(now[k])
    if (v !== tidy(saved[k])) out[k] = v || null
  }
  if (!sameAddress(now.billAddress, saved.billAddress)) out.billAddress = isEmptyAddress(now.billAddress) ? null : cleanAddress(now.billAddress)
  return out
}

/** The whole of it, for a client being added (mkt_sub_add's p_bill) — null when nothing is given. */
export function billOf(now: BillEdit): { name: string | null; address: Address | null; phone: string | null; email: string | null } | null {
  const b = {
    name: tidy(now.billName) || null,
    address: isEmptyAddress(now.billAddress) ? null : cleanAddress(now.billAddress),
    phone: tidy(now.billPhone) || null,
    email: now.billEmail.trim() || null,
  }
  return b.name || b.address || b.phone || b.email ? b : null
}

const PHONE = /^[+0-9 ()-]*$/
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** What mkt_bill_party would refuse, in its words (the address's own refusal is the page's — `addressRefusal`). */
export function billProblems(now: BillEdit): string[] {
  const out: string[] = []
  if (tidy(now.billName).length > 120) out.push('A billing name of at most 120 characters')
  if (!PHONE.test(now.billPhone.trim()) || now.billPhone.trim().length > 40) out.push('A phone number, digits only')
  const email = now.billEmail.trim()
  if (email && (!EMAIL.test(email) || email.length > 200)) out.push('An email address, like name@company.com')
  return out
}
