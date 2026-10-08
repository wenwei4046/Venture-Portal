/**
 * Payments › Claim requests (2026-10-08): approved claims Finance pays by
 * voucher. The queue comes from `claim_payment_queue()`; this file splits it
 * and checks what a browser may send. Pure.
 */

export const CLAIM_PAYMENT_METHODS = [
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'cash', label: 'Cash' },
] as const

export type ClaimPaymentMethod = (typeof CLAIM_PAYMENT_METHODS)[number]['value']

export interface ClaimQueueRow {
  claimId: string
  claimType: 'benefit' | 'project'
  claimantName: string
  department: string | null
  amount: number
  description: string | null
  sourcePool: string | null
  requestNo: string | null
  approvedByName: string | null
  approvedAt: string | null
  voucherId: string | null
  voucherNo: string | null
  voucherStatus: string | null
}

/** A row as `claim_payment_queue()` returns it — amounts arrive as NUMERIC strings. */
export function readClaimQueueRow(raw: Record<string, unknown>): ClaimQueueRow {
  const text = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null)
  return {
    claimId: String(raw.claim_id),
    claimType: raw.claim_type === 'benefit' ? 'benefit' : 'project',
    claimantName: String(raw.claimant_name ?? ''),
    department: text(raw.department),
    amount: Number(raw.amount ?? 0),
    description: text(raw.description),
    sourcePool: text(raw.source_pool),
    requestNo: text(raw.request_no),
    approvedByName: text(raw.approved_by_name),
    approvedAt: text(raw.approved_at),
    voucherId: text(raw.voucher_id),
    voucherNo: text(raw.voucher_no),
    voucherStatus: text(raw.voucher_status),
  }
}

/** Waiting for Finance's voucher, and already with the Principal. */
export function splitClaimQueue(rows: readonly ClaimQueueRow[]): {
  toRaise: ClaimQueueRow[]
  withPrincipal: ClaimQueueRow[]
} {
  return {
    toRaise: rows.filter(r => !r.voucherId),
    withPrincipal: rows.filter(r => !!r.voucherId),
  }
}

/** What the reference column says: the member's request number, or what kind of claim. */
export function claimReference(row: Pick<ClaimQueueRow, 'requestNo' | 'claimType'>): string {
  return row.requestNo ?? (row.claimType === 'project' ? 'Pool claim' : 'Benefit claim')
}

export interface RaiseClaimVoucherInput {
  claimId: string
  bankId: string
  method: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The shape a browser may send; who and which claim are the database's to refuse. */
export function checkRaiseClaimVoucher(
  input: RaiseClaimVoucherInput,
): { ok: true; input: { claimId: string; bankId: string; method: ClaimPaymentMethod } } | { ok: false; reason: string } {
  if (!input || typeof input.claimId !== 'string' || !UUID.test(input.claimId)) {
    return { ok: false, reason: 'Which claim? Reload the page and try again.' }
  }
  if (typeof input.bankId !== 'string' || !UUID.test(input.bankId)) {
    return { ok: false, reason: 'Choose the bank account to pay from.' }
  }
  const method = CLAIM_PAYMENT_METHODS.find(m => m.value === input.method)?.value
  if (!method) return { ok: false, reason: 'Choose how the claim is paid: bank transfer, cheque or cash.' }
  return { ok: true, input: { claimId: input.claimId, bankId: input.bankId, method } }
}
