// An invoice's trail and audit log in words (2026-10-15, the Finance revamp v2
// — D06's *Trail* and *Audit log* cards on an invoice's full page): each change
// `audit_changes()` hands back for the invoice and its credit notes — what this
// reader's permissions open — said the way the page says it, and the trail
// across (Created → Issued → Paid / Voided) read off those same changes. Pure,
// so the wording is tested without a database.

export interface InvoiceChange {
  op: 'INSERT' | 'UPDATE' | 'DELETE'
  table_name: string
  old_row: Record<string, unknown> | null
  new_row: Record<string, unknown> | null
  changed: string[] | null
}

const money = (v: unknown) => `RM ${Number(v ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const day = (v: unknown) => {
  if (!v) return 'none'
  const s = String(v)
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  return Number.isFinite(y) && m ? `${String(d).padStart(2, '0')} ${MON[m - 1]} ${y}` : s
}
const month = (v: unknown) => {
  if (!v) return 'none'
  const [y, m] = String(v).slice(0, 7).split('-').map(Number)
  return Number.isFinite(y) && m ? `${MON[m - 1]} ${y}` : String(v)
}
const words = (v: unknown) => (v == null || v === '' ? '—' : String(v).replace(/_/g, ' '))

const PAID = new Set(['paid', 'paid_via_netting'])

/** Bookkeeping a person did not change (the receipt that settled it says itself through the status). */
const QUIET = new Set(['updated_at', 'version', 'created_by', 'base_amount', 'settlement_voucher_id'])
/** Who it bills — one line however many of them moved. */
const PARTY = new Set(['billable_to_type', 'company_id', 'billable_to_department_id', 'billable_to_freetext_name'])
const CONTACT = new Set(['billable_to_freetext_address', 'billable_to_freetext_address_parts', 'billable_to_freetext_phone', 'billable_to_freetext_email'])

function statusLine(before: unknown, after: unknown): string {
  const to = String(after ?? '')
  if (to === 'issued') return before === 'draft' ? 'Approved & issued — posted to the GL' : 'Back to issued'
  if (to === 'paid') return 'Paid'
  if (to === 'paid_via_netting') return 'Paid via netting'
  if (to === 'voided') return 'Voided — entries reversed'
  return `Status ${words(before)} → ${words(after)}`
}

function fieldLine(key: string, before: Record<string, unknown>, after: Record<string, unknown>, mode: (m: string) => string): string | null {
  if (QUIET.has(key)) return null
  if (PARTY.has(key)) return 'Billed to changed'
  if (CONTACT.has(key)) return 'Contact changed'
  if (key === 'status') return statusLine(before.status, after.status)
  if (key === 'total_amount') return `Amount ${money(before.total_amount)} → ${money(after.total_amount)}`
  // No account of its own: its lines carry theirs.
  if (key === 'category_code') return `Account ${before.category_code ?? 'by line'} → ${after.category_code ?? 'by line'}`
  if (key === 'invoice_date') return `Invoice date ${day(before.invoice_date)} → ${day(after.invoice_date)}`
  if (key === 'due_date') return `Due ${day(before.due_date)} → ${day(after.due_date)}`
  if (key === 'period_month') return `Period ${month(before.period_month)} → ${month(after.period_month)}`
  if (key === 'billing_mode') return `Billing mode ${before.billing_mode ? mode(String(before.billing_mode)) : '—'} → ${after.billing_mode ? mode(String(after.billing_mode)) : '—'}`
  if (key === 'reference_no') return `Reference no ${words(before.reference_no)} → ${words(after.reference_no)}`
  if (key === 'invoice_no') return `Number ${words(before.invoice_no)} → ${words(after.invoice_no)}`
  if (key === 'description') return 'Description changed'
  if (key === 'contract_id') return 'Project changed'
  return `${key.replace(/_id$/, '').replace(/_/g, ' ')} changed`.replace(/^./, (c) => c.toUpperCase())
}

function creditNoteLine(c: InvoiceChange): string {
  const row = (c.op === 'DELETE' ? c.old_row : c.new_row) ?? {}
  const no = row.credit_note_no ? String(row.credit_note_no) : 'draft'
  if (c.op === 'INSERT') return `Credit note ${no} raised · ${money(row.amount)}`
  if (c.op === 'DELETE') return `Credit note ${no} deleted`
  const before = c.old_row ?? {}
  const changed = c.changed ?? []
  if (changed.includes('status')) {
    if (row.status === 'approved') return `Credit note ${no} approved — ${money(row.amount)} off`
    if (row.status === 'voided') return `Credit note ${no} voided`
  }
  if (changed.includes('amount')) return `Credit note ${no} ${money(before.amount)} → ${money(row.amount)}`
  return `Credit note ${no} changed`
}

/**
 * One change in the page's words: *Created HV-INV-202610-0012 · RM 1,200.00*,
 * *Approved & issued — posted to the GL*, *Amount RM 1,200.00 → RM 1,000.00*,
 * *Credit note HV-CN-… approved — RM 200.00 off*. `mode` says a billing mode in
 * words (the page's `billingModeLabel`).
 */
export function invoiceChangeLine(c: InvoiceChange, mode: (m: string) => string = words): string {
  if (c.table_name === 'credit_notes') return creditNoteLine(c)
  const after = c.new_row ?? {}
  const before = c.old_row ?? {}
  if (c.op === 'INSERT') {
    const made = `Created ${after.invoice_no ? String(after.invoice_no) : 'draft'} · ${money(after.total_amount)}`
    return after.status && after.status !== 'draft' ? `${made} · ${words(after.status)}` : made
  }
  if (c.op === 'DELETE') return 'Deleted'
  const parts = [...new Set((c.changed ?? []).map((k) => fieldLine(k, before, after, mode)).filter((p): p is string => !!p))]
  return parts.length > 0 ? parts.join(' · ') : 'Updated'
}

export interface InvoiceTrailStep {
  label: string
  by: string | null
  when: string | null
  state: 'done' | 'todo' | 'bad'
}

/** A change as the trail reads it: when, by whom. */
export type DatedInvoiceChange = InvoiceChange & { at: string; who: string | null }

/**
 * The trail across: Created → Issued → Paid, or → Voided. Each step that is done
 * names who did it and when, read off the invoice's own changes (the latest
 * that moved it there); an invoice older than the audit trail says the day it
 * carries instead — its invoice date for Issued, its last receipt for Paid.
 */
export function invoiceTrail(
  inv: { status: string; createdBy: string | null; createdAt: string; invoiceDate: string | null; lastReceipt: string | null },
  changes: ReadonlyArray<DatedInvoiceChange>,
  stamp: (at: string) => string,
): InvoiceTrailStep[] {
  // Newest first.
  const own = changes.filter((c) => c.table_name === 'invoices').sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
  const moved = (c: DatedInvoiceChange) => c.op === 'INSERT' || (c.op === 'UPDATE' && (c.changed ?? []).includes('status'))
  // The latest change that brought it to one of these statuses.
  const reached = (to: (s: string) => boolean) => own.find((c) => moved(c) && to(String(c.new_row?.status ?? '')))
  const steps: InvoiceTrailStep[] = [{ label: 'Created', by: inv.createdBy, when: stamp(inv.createdAt), state: 'done' }]
  if (inv.status === 'draft') {
    steps.push({ label: 'Issued', by: null, when: null, state: 'todo' }, { label: 'Paid', by: null, when: null, state: 'todo' })
    return steps
  }
  // Issued once, the first time it left draft — or as it was made (the generators make invoices issued).
  const issued = [...own].reverse().find((c) =>
    c.op === 'INSERT' ? !!c.new_row?.status && c.new_row.status !== 'draft' : moved(c) && c.old_row?.status === 'draft' && c.new_row?.status !== 'draft',
  )
  steps.push({ label: 'Issued', by: issued?.who ?? null, when: issued ? stamp(issued.at) : inv.invoiceDate ? day(inv.invoiceDate) : null, state: 'done' })
  if (inv.status === 'voided') {
    const voided = reached((s) => s === 'voided')
    steps.push({ label: 'Voided', by: voided?.who ?? null, when: voided ? stamp(voided.at) : null, state: 'bad' })
  } else if (PAID.has(inv.status)) {
    const paid = reached((s) => PAID.has(s))
    steps.push({
      label: inv.status === 'paid_via_netting' ? 'Paid via netting' : 'Paid',
      by: paid?.who ?? null,
      when: paid ? stamp(paid.at) : inv.lastReceipt ? day(inv.lastReceipt) : null,
      state: 'done',
    })
  } else {
    steps.push({ label: 'Paid', by: null, when: null, state: 'todo' })
  }
  return steps
}
