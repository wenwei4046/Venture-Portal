// Payments › Payment request, as a list (2026-10-29, PR ① of docs/module-spec-payment-requests.md): what is sent to
// Finance to pay, one row each — HR's payroll funding requests (the Payroll card, for Payroll payouts holders only, as
// their old page) and the members' claims HR approved for payment, under their department. The cards are the hub's
// filters, as Payment voucher's are: All, Payroll, then every department, each with what it holds. Pure.

import type { HrIconName } from '@/components/hrv/icons'
import type { CardTone, ChipTone, HubCardItem } from '@/components/finv/Hub'
import { claimReference, type ClaimQueueRow } from '@/lib/claim-requests'
import type { PayrollRequestLine } from '@/lib/fin-app/payroll-requests-model'
import { officeDay } from '@/lib/office-time'
import { plural, rm } from '@/lib/fin-app/page-model'

export type RequestSource = 'payroll' | 'claim'
/** With Finance (to fund, or waiting for a voucher), or with the Principal (funded, or its voucher raised). */
export type RequestStage = 'finance' | 'principal'

export interface PaymentRequestRow {
  /** `payroll:<request>` or `claim:<claim>` — one key for every row the page lists. */
  key: string
  /** The payroll request's id, or the claim's. */
  id: string
  source: RequestSource
  /** The card it is under: `payroll`, or its department's. */
  card: string
  /** Who sent it, and how it came ("HR · funding request", "Revenue Department · approved by HR"). */
  from: string
  fromSub: string
  /** What it is for. */
  what: string
  /** The day it reached Finance (YYYY-MM-DD, the office's): the request, or HR's approval. */
  sent: string
  ref: string
  department: string
  payTo: string
  whoPays: string
  /** Still to fund (a payroll), or the claim — what Finance pays from here. */
  amount: number
  stage: RequestStage
  voucherId: string | null
  voucherNo: string | null
  payroll: PayrollRequestLine | null
  claim: ClaimQueueRow | null
}

/** A department as its card names it. */
export interface RequestDepartment {
  key: string
  name: string
}

/** The departments a request may come from: every one but the office's own and the directors' (who claim nothing). */
export function requestDepartments(registry: ReadonlyArray<{ id: string; name: string; segmentKey: string | null; isInternal: boolean }>): RequestDepartment[] {
  return registry.filter((d) => !d.isInternal && d.segmentKey !== 'director').map((d) => ({ key: `dept:${d.id}`, name: d.name }))
}

const day = (iso: string | null) => (iso ? officeDay(iso).format('YYYY-MM-DD') : '')

/** A payroll funding request, as a row. */
export function payrollRow(line: PayrollRequestLine, request: { requested_at: string; requested_by_name: string }): PaymentRequestRow {
  const funded = line.remaining <= 0.005
  return {
    key: `payroll:${line.id}`,
    id: line.id,
    source: 'payroll',
    card: 'payroll',
    from: request.requested_by_name || 'HR',
    fromSub: line.isDirector ? 'Director salary · funding request' : 'HR · funding request',
    what: `Payroll · ${line.label}`,
    sent: day(request.requested_at),
    ref: line.sub,
    department: line.isDirector ? 'Director' : 'Payroll',
    payTo: 'Payroll',
    whoPays: plural(line.pools.length, 'department’s pool', 'departments’ pools'),
    amount: funded ? line.amount : line.remaining,
    stage: funded ? 'principal' : 'finance',
    voucherId: null,
    voucherNo: line.pendingPvs[0]?.voucherNo ?? null,
    payroll: line,
    claim: null,
  }
}

const POOL_WORDS: Record<string, string> = { venture_pool: 'Venture pool' }

/** A claim HR approved to be paid by Finance, as a row under its department's card. */
export function claimRow(c: ClaimQueueRow, departments: readonly RequestDepartment[]): PaymentRequestRow {
  const dept = departments.find((d) => d.name === c.department) ?? null
  return {
    key: `claim:${c.claimId}`,
    id: c.claimId,
    source: 'claim',
    card: dept?.key ?? 'other',
    from: c.claimantName,
    fromSub: [c.department, c.claimType === 'benefit' ? `approved by ${c.approvedByName ? `HR (${c.approvedByName})` : 'HR'}` : null].filter(Boolean).join(' · '),
    what: c.description ?? claimReference(c),
    sent: day(c.approvedAt),
    ref: claimReference(c),
    department: c.department ?? '—',
    payTo: 'Claim',
    whoPays: POOL_WORDS[c.sourcePool ?? ''] ?? (c.sourcePool ? c.sourcePool.replace(/_/g, ' ') : 'Venture pool'),
    amount: c.amount,
    stage: c.voucherId ? 'principal' : 'finance',
    voucherId: c.voucherId,
    voucherNo: c.voucherNo,
    payroll: null,
    claim: c,
  }
}

/** Oldest first within each stage — what waits for Finance before what is with the Principal. */
export function sortRequests(rows: readonly PaymentRequestRow[]): PaymentRequestRow[] {
  return [...rows].sort((a, b) => (a.stage === b.stage ? a.sent.localeCompare(b.sent) || a.key.localeCompare(b.key) : a.stage === 'finance' ? -1 : 1))
}

const sum = (rows: readonly PaymentRequestRow[]) => Math.round(rows.reduce((t, r) => t + r.amount, 0) * 100) / 100

export const ALL_CARD = 'all'

/** The cards: All, Payroll (only for an account that sees payroll), every department — and a card for any other. */
export function requestCards(rows: readonly PaymentRequestRow[], departments: readonly RequestDepartment[], seesPayroll: boolean): HubCardItem[] {
  const card = (key: string, label: string, tone: CardTone, icon: HrIconName, of: readonly PaymentRequestRow[]): HubCardItem => ({
    key,
    tone,
    icon,
    label,
    sub: plural(of.length, 'request', 'requests'),
    value: rm(sum(of)),
  })
  const under = (key: string) => rows.filter((r) => r.card === key)
  const other = under('other')
  return [
    card(ALL_CARD, 'All requests', 'all', 'doc', rows),
    ...(seesPayroll ? [card('payroll', 'Payroll', 'payroll', 'payroll', under('payroll'))] : []),
    ...departments.map((d) => card(d.key, d.name, 'quiet', 'people', under(d.key))),
    ...(other.length > 0 ? [card('other', 'Other', 'quiet', 'doc', other)] : []),
  ]
}

/** The total over the cards: what waits for Finance. */
export function requestHero(rows: readonly PaymentRequestRow[]): { label: string; value: string } {
  const waiting = rows.filter((r) => r.stage === 'finance')
  return { label: `Waiting for you · ${plural(waiting.length, 'request', 'requests')}`, value: rm(sum(waiting)) }
}

/** The status chip. */
export function stageChip(r: PaymentRequestRow): { text: string; tone: ChipTone } {
  if (r.source === 'payroll') {
    if (r.stage === 'principal') return { text: 'Funded · with the Principal', tone: 'accent' }
    return { text: (r.payroll?.committed ?? 0) > 0.005 ? 'Part funded' : 'To fund', tone: 'wait' }
  }
  return r.stage === 'principal' ? { text: 'PV with the Principal', tone: 'accent' } : { text: 'Waiting for a PV', tone: 'wait' }
}

/** The rows a card lists. */
export function rowsOf(rows: readonly PaymentRequestRow[], card: string): PaymentRequestRow[] {
  return card === ALL_CARD ? [...rows] : rows.filter((r) => r.card === card)
}
