// Create payments (2026-10-29, PR ④ of docs/module-spec-payment-requests.md): several PVs from the ticked staff
// requests, a block a PV — each the voucher today's Create PV window makes (PR ②), the bank, the date and the method
// set once. Pure: the blocks, what each still needs, the form each voucher is saved with (createPaymentForRequests's —
// createPaymentVoucherInner's fields, as CreatePaymentDialog sends them for a request's PV) and what the run says.

import { neededSentence, num } from '@/components/finv/form-words'
import { plural } from '@/lib/fin-app/page-model'
import { billBackAnswers, openSplits, voucherStart, type PaymentRequest, type RequestKind, type RequestVoucherStart } from '@/lib/payment-requests/model'

/** A voucher line: its words, pool, category and amount — the category Finance's. */
export interface BulkLine {
  requestId: string
  description: string
  pool: string
  account: string
  amount: string
}

export interface BulkVoucher {
  /** Its requests' ids, joined. */
  key: string
  start: RequestVoucherStart
  kind: RequestKind
  /** The requests it pays. */
  requests: number
  /** Those of them nobody ticked — the payee's others with no PV yet, put in with them. */
  added: string[]
  description: string
  lines: BulkLine[]
  /** Each open split's Bill back?, nothing chosen until it is picked. */
  answers: Record<string, boolean>
}

/** The bank, the date and the method, set once for them all. */
export interface BulkShared {
  bankId: string
  date: string
  method: string
}

/** The methods a request's PV goes by (a netting has no bank, and these are paid from one). */
export const BULK_METHODS = [
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'cash', label: 'Cash' },
] as const

/** The blocks the PVs start from, each filled in as Create PV fills its window. */
export function bulkVouchers(groups: readonly PaymentRequest[][], ticked: ReadonlySet<string>): BulkVoucher[] {
  return groups.map((g) => {
    const start = voucherStart(g)
    return {
      key: start.requestIds.join(','),
      start,
      kind: g[0]?.kind ?? 'claim',
      requests: g.length,
      added: g.filter((r) => !ticked.has(r.id)).map((r) => r.requestNo ?? 'a request'),
      description: start.description,
      lines: start.lines.map((l) => ({ requestId: l.requestId, description: l.description, pool: l.pool, account: '', amount: l.amount.toFixed(2) })),
      answers: {},
    }
  })
}

/**
 * What Finance changed in the window, kept by request so a change survives One PV a person being ticked or unticked:
 * a line by its request and its place among that request's lines ("r1:0"), a split's answer by the split, a
 * description by its block.
 */
export interface BulkEdits {
  lines: Record<string, Partial<Pick<BulkLine, 'description' | 'pool' | 'account' | 'amount'>>>
  answers: Record<string, boolean>
  descriptions: Record<string, string>
}
export const NO_EDITS: BulkEdits = { lines: {}, answers: {}, descriptions: {} }
export const lineKey = (requestId: string, i: number) => `${requestId}:${i}`

/** A block as Finance left it. */
export function withEdits(v: BulkVoucher, edits: BulkEdits): BulkVoucher {
  const at = new Map<string, number>()
  return {
    ...v,
    description: edits.descriptions[v.key] ?? v.description,
    lines: v.lines.map((l) => {
      const i = at.get(l.requestId) ?? 0
      at.set(l.requestId, i + 1)
      return { ...l, ...edits.lines[lineKey(l.requestId, i)] }
    }),
    answers: Object.fromEntries(v.start.splits.flatMap((s) => (edits.answers[s.shareId] === undefined ? [] : [[s.shareId, edits.answers[s.shareId]]]))),
  }
}

/** A line's place among its request's lines — what its edits are kept under. */
export function lineKeys(v: BulkVoucher): string[] {
  const at = new Map<string, number>()
  return v.lines.map((l) => {
    const i = at.get(l.requestId) ?? 0
    at.set(l.requestId, i + 1)
    return lineKey(l.requestId, i)
  })
}

/** Create PV's note on a draft ("HV-PV-… saved as draft. A receipt could not be carried over …") without its first words. */
export const carriedNote = (note: string | undefined, voucherNo: string) => {
  const lead = `${voucherNo} saved as draft. `
  return note?.startsWith(lead) ? note.slice(lead.length) : note
}

const round = (v: number) => Math.round(v * 100) / 100

export const voucherTotal = (v: BulkVoucher) => round(v.lines.reduce((t, l) => t + num(l.amount), 0))
export const bulkTotal = (vs: readonly BulkVoucher[]) => round(vs.reduce((t, v) => t + voucherTotal(v), 0))

/** What a voucher sends for its splits: each open split's answer, a Yes with the category of its request's first line. */
export const voucherBill = (v: BulkVoucher) => billBackAnswers(v.start.splits, v.answers, v.lines)

/** What a block still needs before the vouchers can be saved, in words — or null. */
export function voucherProblem(v: BulkVoucher, canBillBack: boolean): string | null {
  const need: string[] = []
  if (!v.description.trim()) need.push('a description')
  if (v.lines.length === 0 || v.lines.some((l) => !l.pool || !l.account || !(num(l.amount) > 0))) need.push('each line’s pool, category, amount')
  if (openSplits(v.start.splits).some((s) => v.answers[s.shareId] === undefined)) need.push('each split’s Bill back')
  const bill = voucherBill(v)
  return (
    neededSentence(need, true) ??
    (bill.some((b) => b.billBack) && !canBillBack ? 'Billing back needs Invoice · Create — answer No, or ask for it.' : null) ??
    (bill.some((b) => b.billBack && !b.category) ? 'Keep a line of each request billed back — its invoice takes that line’s category.' : null)
  )
}

/** The form a voucher is saved with — what CreatePaymentDialog sends for a request's PV, a draft (sent together after). */
export function voucherForm(v: BulkVoucher, shared: BulkShared): FormData {
  const fd = new FormData()
  fd.set('direction', 'debit')
  fd.set('voucher_type', 'expense')
  fd.set('reference_type', '')
  fd.set('reference_id', '')
  fd.set('payee_name', v.start.payee.trim())
  fd.set('payee_company_id', '')
  if (shared.bankId) fd.set('bank_account_id', shared.bankId)
  fd.set('amount', voucherTotal(v).toFixed(2))
  fd.set('payment_date', shared.date)
  fd.set('payment_method', shared.method)
  fd.set('description', v.description.trim())
  if (v.start.notes) fd.set('notes', v.start.notes)
  fd.set('target_pool', '')
  fd.set('source_rows_count', String(v.lines.length))
  v.lines.forEach((l, i) => {
    fd.set(`source_rows[${i}][pool]`, l.pool)
    fd.set(`source_rows[${i}][amount]`, num(l.amount).toFixed(2))
    fd.set(`source_rows[${i}][account_code]`, l.account)
    if (l.description.trim()) fd.set(`source_rows[${i}][description]`, l.description.trim())
  })
  fd.set('source_pool', v.lines[0]?.pool ?? '')
  fd.set('attachment_count', '0')
  fd.set('payment_request_ids', JSON.stringify(v.start.requestIds))
  fd.set('payment_request_bill', JSON.stringify(voucherBill(v)))
  return fd
}

/** How a block's voucher went: made (with a note, perhaps — a receipt not carried over), or refused. */
export type BulkMade = { key: string; payee: string; id: string; voucherNo: string; note?: string }
export type BulkRefused = { key: string; payee: string; reason: string }

export interface BulkRun {
  made: BulkMade[]
  refused: BulkRefused[]
  /** Submit was pressed. */
  submit: boolean
  /** The vouchers sent for approval, and those that stayed drafts when sending them was refused. */
  sent: string[]
  notSent: Array<{ id: string; reason: string }>
}

/**
 * What the run says: all done — a line to flash; anything refused or noted — each voucher's line, the window kept open
 * for them to be read.
 */
export function runWords(run: BulkRun): { clean: boolean; flash: string; lines: Array<{ text: string; bad: boolean }> } {
  const sent = new Set(run.sent)
  const notSent = new Map(run.notSent.map((x) => [x.id, x.reason]))
  const clean = run.refused.length === 0 && run.notSent.length === 0 && run.made.every((m) => !m.note)
  const flash =
    run.made.length === 0
      ? 'No PV was made.'
      : run.submit && sent.size > 1
        ? `${plural(sent.size, 'PV', 'PVs')} submitted together — with the Principal`
        : run.submit && sent.size === 1
          ? `${run.made.find((m) => sent.has(m.id))?.voucherNo ?? 'The PV'} submitted — waiting for Principal`
          : `${plural(run.made.length, 'PV', 'PVs')} saved as ${run.made.length === 1 ? 'a draft' : 'drafts'}`
  const lines = [
    ...run.made.map((m) => {
      const refusedSend = notSent.get(m.id)
      const where = !run.submit ? 'saved as a draft' : sent.has(m.id) ? 'submitted' : `saved as a draft — not sent: ${refusedSend ?? 'unknown error'}`
      return { text: `${m.voucherNo} · ${m.payee} — ${where}${m.note ? `. ${m.note}` : ''}`, bad: !!refusedSend || !!m.note }
    }),
    ...run.refused.map((r) => ({ text: `${r.payee} — not made: ${r.reason}`, bad: true })),
  ]
  return { clean, flash, lines }
}
