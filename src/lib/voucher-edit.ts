// A voucher's Edit sends only what was changed (2026-10-16 — the user's rule
// of 2026-10-14: the shared logins open one voucher on two screens, and a form
// written back whole puts back what the other changed). Changed from the
// voucher AS STORED, not from what the form opened on: a voucher saved without
// a date opens on today, a repayment draft's lump row opens split into its
// principal and interest — the save must carry both. `updatePaymentVoucher`
// writes only what it is sent and checks the voucher as it will stand. Pure —
// the desktop's form and the Finance phone app's sheet send through it.

export interface VoucherEditRow {
  pool: string
  amount: string
  account_code: string
  override_account_type?: string
  override_gl_account_code?: string
  override_reason?: string
}

export interface VoucherEditFields {
  amount: string
  payeeName: string
  payeeCompanyId: string
  bankAccountId: string
  description: string
  paymentMethod: string
  /** `YYYY-MM-DD`, or '' when the voucher was saved without one. */
  paymentDate: string
  notes: string
  /** A receipt's pool and account — its one source row. */
  targetPool: string
  accountCode: string
  /** A payment's source rows. */
  rows: VoucherEditRow[]
}

/** The voucher as stored, in the form's words. */
export function storedVoucherFields(
  v: {
    amount: number
    payee_name: string
    payee_company_id: string | null
    bank_account_id: string | null
    description: string
    notes: string | null
    payment_method: string | null
    payment_date: string | null
    target_pool: string | null
  },
  sources: VoucherEditRow[],
  creditAccount: string | null,
): VoucherEditFields {
  return {
    amount: v.amount.toFixed(2),
    payeeName: v.payee_name ?? '',
    payeeCompanyId: v.payee_company_id ?? '',
    bankAccountId: v.bank_account_id ?? '',
    description: v.description ?? '',
    paymentMethod: v.payment_method ?? 'bank_transfer',
    paymentDate: v.payment_date ?? '',
    notes: v.notes ?? '',
    targetPool: v.target_pool ?? '',
    accountCode: creditAccount ?? '',
    rows: sources,
  }
}

const cents = (s: string) => {
  const n = Number(s.trim())
  return s.trim() !== '' && Number.isFinite(n) ? n.toFixed(2) : s.trim()
}

/** An override counts only whole — its type, its GL and its reason. */
function overrideOf(r: VoucherEditRow): [string, string, string] | null {
  const t = r.override_account_type?.trim() ?? ''
  const g = r.override_gl_account_code?.trim() ?? ''
  const why = r.override_reason?.trim() ?? ''
  return t && g && why ? [t, g, why] : null
}

const rowKey = (r: VoucherEditRow) => [r.pool, cents(r.amount), r.account_code.trim(), ...(overrideOf(r) ?? ['', '', ''])].join('|')

/** The rows differ from the stored ones — in number, order, pool, amount, account or override. */
export function rowsChanged(was: VoucherEditRow[], now: VoucherEditRow[]): boolean {
  return was.length !== now.length || was.some((r, i) => rowKey(r) !== rowKey(now[i]))
}

/** What `updatePaymentVoucher` is sent: the voucher, and only what changed from it as stored. */
export function voucherEditForm(id: string, direction: 'debit' | 'credit', was: VoucherEditFields, now: VoucherEditFields): FormData {
  const fd = new FormData()
  fd.set('id', id)
  if (cents(now.amount) !== cents(was.amount)) fd.set('amount', now.amount.trim())
  if (now.payeeName.trim() !== was.payeeName.trim()) fd.set('payee_name', now.payeeName.trim())
  if (now.payeeCompanyId !== was.payeeCompanyId) fd.set('payee_company_id', now.payeeCompanyId)
  if (now.bankAccountId !== was.bankAccountId) fd.set('bank_account_id', now.bankAccountId)
  if (now.description.trim() !== was.description.trim()) fd.set('description', now.description.trim())
  if (now.paymentMethod !== was.paymentMethod) fd.set('payment_method', now.paymentMethod)
  if (now.paymentDate !== was.paymentDate) fd.set('payment_date', now.paymentDate)
  if (now.notes.trim() !== was.notes.trim()) fd.set('notes', now.notes.trim())
  if (direction === 'debit') {
    if (rowsChanged(was.rows, now.rows)) {
      fd.set('source_rows_count', String(now.rows.length))
      now.rows.forEach((r, i) => {
        fd.set(`source_rows[${i}][pool]`, r.pool)
        fd.set(`source_rows[${i}][amount]`, r.amount)
        fd.set(`source_rows[${i}][account_code]`, r.account_code)
        const ov = overrideOf(r)
        if (ov) {
          fd.set(`source_rows[${i}][override_account_type]`, ov[0])
          fd.set(`source_rows[${i}][override_gl_account_code]`, ov[1])
          fd.set(`source_rows[${i}][override_reason]`, ov[2])
        }
      })
    }
  } else {
    if (now.targetPool !== was.targetPool) fd.set('target_pool', now.targetPool)
    if (now.accountCode !== was.accountCode) fd.set('account_code', now.accountCode)
  }
  return fd
}

/** The edit sends nothing but the voucher: nothing to save. */
export const voucherEditsNothing = (fd: FormData) => [...fd.keys()].every((k) => k === 'id')

/** A row's override half filled — the form says so before anything is sent. */
export function halfOverride(rows: VoucherEditRow[]): number | null {
  const i = rows.findIndex((r) => !overrideOf(r) && (r.override_account_type || r.override_gl_account_code || r.override_reason))
  return i === -1 ? null : i
}
