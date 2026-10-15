// Payments' request queues in the Finance phone app (2026-10-16, part E4 —
// pages the design does not draw, in its style): Claim requests and Dept
// Payment Requests as their desktop pages read them — what waits for
// Finance's voucher as the headline and a card, what is already with the
// Principal as another; a request its own screen. Pure.

import { officeTime } from '@/lib/office-time'
import { claimReference, splitClaimQueue, type ClaimQueueRow } from '@/lib/claim-requests'
import type { DeptRequestRow } from '@/app/(portal)/payments/dept-requests/_lib/dept-read'
import type { HubCardItem } from '@/components/finv/Hub'
import { f2, plural, rm } from './page-model'

export type RequestCard = 'waiting' | 'principal'
export const REQUEST_CARDS: readonly RequestCard[] = ['waiting', 'principal']

export interface RequestLine {
  id: string
  label: string
  sub: string
  value: string
  /** Its own screen: what it is, line by line. */
  facts: Array<{ key: string; label: string; sub?: string; value?: string }>
  /** The voucher already raised for it, opened in the app. */
  voucherId: string | null
}

export interface RequestsModel {
  hero: { value: string; label: string }
  chip: string | null
  cards: HubCardItem[]
  waiting: RequestLine[]
  principal: RequestLine[]
}

const sum = (xs: Array<{ amount: number }>) => Math.round(xs.reduce((t, x) => t + x.amount, 0) * 100) / 100
const when = (iso: string | null) => (iso ? officeTime(iso).format('D MMM YYYY') : '—')

function cards(waiting: number, waitingSum: number, principal: number, principalSum: number, noun: [string, string]): HubCardItem[] {
  return [
    { key: 'waiting', tone: 'pending_approval', icon: 'payroll', label: 'Waiting for a voucher', sub: plural(waiting, noun[0], noun[1]), value: rm(waitingSum) },
    { key: 'principal', tone: 'approved', icon: 'approve', label: 'With the Principal', sub: plural(principal, noun[0], noun[1]), value: rm(principalSum) },
  ]
}

/** Payments › Claim requests: approved claims Finance pays by voucher. */
export function claimRequestsModel(rows: readonly ClaimQueueRow[]): RequestsModel {
  const { toRaise, withPrincipal } = splitClaimQueue(rows)
  const line = (r: ClaimQueueRow): RequestLine => ({
    id: r.claimId,
    label: r.claimantName,
    sub: [claimReference(r), r.description].filter(Boolean).join(' · '),
    value: f2(r.amount),
    facts: [
      { key: 'claimant', label: 'Claimant', sub: [r.claimantName, r.department].filter(Boolean).join(' · ') },
      { key: 'ref', label: 'Reference', sub: claimReference(r) },
      { key: 'desc', label: 'Description', sub: r.description ?? '—' },
      { key: 'approved', label: 'Approved', sub: `${r.approvedByName ?? '—'} · ${when(r.approvedAt)}` },
      ...(r.voucherId ? [{ key: 'voucher', label: 'Voucher', sub: `${r.voucherNo ?? 'Voucher'} · ${r.voucherStatus === 'pending_approval' ? 'Awaiting approval' : (r.voucherStatus ?? '—')}` }] : []),
      { key: 'amount', label: 'Amount', value: rm(r.amount) },
    ],
    voucherId: r.voucherId,
  })
  return {
    hero: { value: rm(sum(toRaise)), label: `Waiting for a voucher · ${plural(toRaise.length, 'claim', 'claims')}` },
    chip: withPrincipal.length > 0 ? `${withPrincipal.length} with the Principal` : null,
    cards: cards(toRaise.length, sum(toRaise), withPrincipal.length, sum(withPrincipal), ['claim', 'claims']),
    waiting: toRaise.map(line),
    principal: withPrincipal.map(line),
  }
}

/** Payments › Dept Payment Requests: a department's payment, its pool already debited. */
export function deptRequestsModel(rows: readonly DeptRequestRow[]): RequestsModel {
  const waiting = rows.filter((r) => r.status === 'pending_finance_pv')
  const principal = rows.filter((r) => r.status === 'pending_principal_pv')
  const line = (r: DeptRequestRow): RequestLine => ({
    id: r.id,
    label: `${r.department} → ${r.payee}`,
    sub: [r.description, r.voucherNo].filter(Boolean).join(' · '),
    value: f2(r.amount),
    facts: [
      { key: 'dept', label: 'Department', sub: r.department },
      { key: 'payee', label: 'Pay to', sub: r.payee },
      { key: 'desc', label: 'Description', sub: r.description ?? '—' },
      { key: 'by', label: 'Requested', sub: `${r.requestedBy} · ${officeTime(r.requestedAt).format('D MMM HH:mm')}` },
      ...(r.status === 'pending_principal_pv' ? [{ key: 'voucher', label: 'Voucher', sub: `${r.voucherNo ?? 'PV pending'} · awaiting the Principal` }] : []),
      { key: 'amount', label: 'Amount', sub: 'Pool already debited', value: rm(r.amount) },
    ],
    voucherId: r.pvId,
  })
  return {
    hero: { value: rm(sum(waiting)), label: `Awaiting your action · ${plural(waiting.length, 'request', 'requests')}` },
    chip: principal.length > 0 ? `${principal.length} awaiting the Principal` : null,
    cards: cards(waiting.length, sum(waiting), principal.length, sum(principal), ['request', 'requests']),
    waiting: waiting.map(line),
    principal: principal.map(line),
  }
}

/** "Maybank (RM 12,000.00)" — a bank to pay from, with what it holds. */
export const bankOption = (b: { bank_name: string; current_balance: number }) => `${b.bank_name} (RM ${f2(b.current_balance)})`
