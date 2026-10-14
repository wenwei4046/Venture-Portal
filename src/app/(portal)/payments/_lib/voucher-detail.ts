import type { SupabaseClient } from '@supabase/supabase-js'
import { canDo } from '@/lib/permission-actions'
import { canDecide } from '@/lib/approval-domains'
import { canSeePayrollPayouts } from '@/lib/roles'
import { isPayrollReference } from '@/lib/payroll-vouchers'
import type { User } from '@/types'

// One voucher, as the hub's drawer draws it (2026-10-14, the Finance revamp v2
// — D05 of `.design/fin-r2/handoff`): who it pays, when and from where, which
// pools it is deducted from, how it is booked, its files and its trail, and
// what this reader may do to it. The voucher page (`/payments/[id]`) reads
// the same rows; this is its drawer's half, plain data for the browser.

const POOL_LABELS: Record<string, string> = {
  venture_pool: 'Venture Pool',
  dept_pool_director: 'Director Pool',
  dept_pool_marketing: 'Marketing Dept Pool',
  dept_pool_finance: 'Finance Dept Pool',
  dept_pool_director_office: 'Director Office Pool',
  dept_pool_hr: 'HR Dept Pool',
  invoice_payout_pool: 'Invoice Payout Pool',
}
const poolLabel = (pool: string) => POOL_LABELS[pool] ?? pool.replace(/_/g, ' ')

export interface DetailStep {
  label: string
  by: string | null
  /** ISO moment, or null for a step with no time on record. */
  at: string | null
  note: string | null
  state: 'done' | 'todo' | 'bad'
}

export interface DetailFile {
  id: string
  name: string
  type: string
  size: number | null
  uploadedAt: string
}

export interface VoucherDetail {
  id: string
  no: string | null
  status: string
  credit: boolean
  amount: number
  payee: string
  payeeCompany: string | null
  description: string | null
  notes: string | null
  /** "Bank transfer" — the method as written. */
  method: string | null
  /** `YYYY-MM-DD`. */
  paymentDate: string | null
  bank: { name: string; number: string | null } | null
  /** The bank's balance, for the approver's check; null where it does not apply. */
  bankBalance: number | null
  /** A payroll funding voucher charges no bank (cash leaves when staff are paid). */
  noCash: boolean
  /** Deducted from (credited to, on a receipt) — pool by pool. */
  sources: Array<{ pool: string; account: string; code: string | null; amount: number }>
  /** The accounts it books to, and their GL codes. */
  account: string | null
  accountCodes: string | null
  pool: string | null
  settledInvoices: string[]
  files: DetailFile[]
  /** Files come and go while it is still being made; a decided one only takes a late one. */
  filesOpen: boolean
  /** A voided voucher takes no file. */
  takesFiles: boolean
  /** Paid out to people (a salary voucher): who, and how much. */
  people: Array<{ name: string; code: string | null; department: string | null; amount: number }>
  trail: DetailStep[]
  createdBy: string | null
  createdAt: string
  /** What this reader may do — each the action its Server Action asks. */
  can: { create: boolean; edit: boolean; void: boolean; approve: boolean }
  /** A paid payment can be reversed (a salary voucher's goes back from HR Payment). */
  reversible: boolean
}

type VoucherRow = {
  id: string
  voucher_no: string | null
  status: string
  direction: string
  amount: number | string
  payee_name: string
  payee_company_id: string | null
  description: string | null
  notes: string | null
  payment_method: string | null
  payment_date: string | null
  payment_reference: string | null
  bank_account_id: string | null
  reference_type: string | null
  voucher_type: string | null
  target_pool: string | null
  source_pool: string | null
  invoice_id: string | null
  created_by: string
  created_at: string
  updated_at: string
  approved_by: string | null
  approved_at: string | null
  executed_at: string | null
}

export type DetailRefusal = 'not_found' | 'payroll'

/**
 * The voucher, or why it does not open: not there for this reader (RLS), or a
 * salary voucher for somebody without Payroll payouts (2026-10-02).
 */
export async function loadVoucherDetail(
  supabase: SupabaseClient,
  user: User,
  id: string,
): Promise<{ ok: true; detail: VoucherDetail } | { ok: false; reason: DetailRefusal }> {
  const { data, error } = await supabase
    .from('payment_vouchers')
    .select(
      'id, voucher_no, status, direction, amount, payee_name, payee_company_id, description, notes, payment_method, payment_date, payment_reference, bank_account_id, reference_type, voucher_type, target_pool, source_pool, invoice_id, created_by, created_at, updated_at, approved_by, approved_at, executed_at',
    )
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return { ok: false, reason: 'not_found' }
  const v = data as VoucherRow
  if (isPayrollReference(v.reference_type) && !canSeePayrollPayouts(user)) return { ok: false, reason: 'payroll' }

  const credit = v.direction === 'credit'
  const userIds = [...new Set([v.created_by, v.approved_by].filter((x): x is string => !!x))]

  const [company, bank, people, sources, files, pending, invoices] = await Promise.all([
    v.payee_company_id
      ? supabase.from('companies').select('name, short_code').eq('id', v.payee_company_id).maybeSingle()
      : Promise.resolve({ data: null }),
    v.bank_account_id
      ? supabase.from('bank_accounts').select('bank_name, account_number, current_balance').eq('id', v.bank_account_id).maybeSingle()
      : Promise.resolve({ data: null }),
    userIds.length > 0 ? supabase.from('users').select('id, name').in('id', userIds) : Promise.resolve({ data: [] }),
    supabase
      .from('payment_voucher_sources')
      .select('pool, amount, account_code, chart_of_accounts!pvs_account_code_fk(name)')
      .eq('voucher_id', id)
      .order('amount', { ascending: false }),
    supabase
      .from('payment_attachments')
      .select('id, file_name, file_type, file_size, uploaded_at')
      .eq('voucher_id', id)
      .order('uploaded_at', { ascending: false }),
    v.status === 'pending_approval'
      ? supabase
          .from('approval_requests')
          .select('request_type, submitted_by')
          .eq('reference_id', id)
          .eq('reference_table', 'payment_vouchers')
          .eq('status', 'pending')
          .maybeSingle()
      : Promise.resolve({ data: null }),
    credit
      ? Promise.all([
          supabase.from('invoices').select('invoice_no').eq('settlement_voucher_id', id).order('invoice_no'),
          v.invoice_id ? supabase.from('invoices').select('invoice_no').eq('id', v.invoice_id) : Promise.resolve({ data: [] }),
        ])
      : Promise.resolve(null),
  ])

  const names = new Map(((people.data ?? []) as Array<{ id: string; name: string }>).map((u) => [u.id, u.name]))
  const createdBy = names.get(v.created_by) ?? null
  const approvedBy = v.approved_by ? (names.get(v.approved_by) ?? null) : null

  const c = company.data as { name: string; short_code: string } | null
  const b = bank.data as { bank_name: string; account_number: string | null; current_balance: number | string | null } | null

  const sourceRows = ((sources.data ?? []) as unknown as Array<{
    pool: string
    amount: number | string
    account_code: string | null
    chart_of_accounts: { name: string } | null
  }>).map((r) => ({
    pool: poolLabel(r.pool),
    account: r.chart_of_accounts?.name ?? (r.account_code ? r.account_code.replace(/_/g, ' ') : '—'),
    code: r.account_code,
    amount: Number(r.amount),
  }))
  const accounts = [...new Set(sourceRows.map((r) => r.account).filter((a) => a !== '—'))]
  const codes = [...new Set(sourceRows.map((r) => r.code).filter((x): x is string => !!x))]
  const pool = credit
    ? v.target_pool
      ? poolLabel(v.target_pool)
      : null
    : sourceRows.length > 0
      ? sourceRows.map((r) => r.pool).join(' + ')
      : v.source_pool
        ? poolLabel(v.source_pool)
        : null

  // Who may decide its pending approval: Treasury's Approve or the queue's,
  // never whoever submitted it unless they are the Principal (2026-10-09).
  const p = pending.data as { request_type: string; submitted_by: string } | null
  const mayDecide = !!p && canDecide(user, [p.request_type], [p.submitted_by])

  // A salary voucher says whom it pays: one line a person (or a department's many).
  let payroll: VoucherDetail['people'] = []
  if (v.reference_type === 'payroll_disbursement') {
    const { data: lines } = await (supabase as unknown as SupabaseClient)
      .from('payroll_voucher_lines')
      .select('id, employee_name, employee_code, department_name, net')
      .eq('voucher_id', id)
      .order('employee_name')
    const rows = ((lines ?? []) as unknown) as Array<{ id: string; employee_name: string; employee_code: string | null; department_name: string | null; net: number | string }>
    // No account numbers here: the drawer shows none (they come only through lib/private-fields).
    payroll = rows.map((l) => ({ name: l.employee_name, code: l.employee_code, department: l.department_name, amount: Number(l.net) }))
  }

  const settled = invoices
    ? [
        ...new Set(
          [...((invoices[1].data ?? []) as Array<{ invoice_no: string | null }>), ...((invoices[0].data ?? []) as Array<{ invoice_no: string | null }>)]
            .map((i) => i.invoice_no)
            .filter((n): n is string => !!n),
        ),
      ]
    : []

  // ── What happened to it, in order (the voucher page's trail, in English). ──
  const status = v.status
  const trail: DetailStep[] = [{ label: 'Created', by: createdBy, at: v.created_at, note: null, state: 'done' }]
  if (status === 'voided') {
    if (!credit && v.approved_at) trail.push({ label: 'Approved', by: approvedBy, at: v.approved_at, note: null, state: 'done' })
    if (v.executed_at) trail.push({ label: credit ? 'Received' : 'Paid', by: null, at: v.executed_at, note: null, state: 'done' })
    trail.push({ label: 'Voided', by: null, at: v.updated_at, note: null, state: 'bad' })
  } else if (credit) {
    trail.push(
      v.executed_at
        ? { label: 'Received', by: b?.bank_name ?? null, at: v.executed_at, note: null, state: 'done' }
        : { label: 'Received', by: null, at: null, note: 'Not received yet', state: 'todo' },
    )
  } else {
    const submitted = status !== 'draft'
    // No column records when it was submitted: updated_at is that moment only while it still waits.
    trail.push({ label: 'Submitted', by: submitted ? createdBy : null, at: status === 'pending_approval' ? v.updated_at : null, note: null, state: submitted ? 'done' : 'todo' })
    trail.push(
      v.approved_at
        ? { label: 'Approved', by: approvedBy, at: v.approved_at, note: null, state: 'done' }
        : { label: 'Approved', by: null, at: null, note: submitted ? 'Waiting for Principal' : null, state: 'todo' },
    )
    trail.push(
      v.executed_at
        ? { label: 'Paid', by: v.payment_reference ? `Ref ${v.payment_reference}` : null, at: v.executed_at, note: null, state: 'done' }
        : { label: 'Paid', by: null, at: null, note: null, state: 'todo' },
    )
  }

  const method = v.payment_method ? v.payment_method.replace(/_/g, ' ') : null

  return {
    ok: true,
    detail: {
      id: v.id,
      no: v.voucher_no,
      status,
      credit,
      amount: Number(v.amount),
      payee: v.payee_name,
      payeeCompany: c ? `${c.name} (${c.short_code})` : null,
      description: v.description,
      notes: v.notes,
      method: method ? method.charAt(0).toUpperCase() + method.slice(1) : null,
      paymentDate: v.payment_date ? v.payment_date.slice(0, 10) : null,
      bank: b ? { name: b.bank_name, number: b.account_number ?? null } : null,
      bankBalance: b && b.current_balance != null ? Number(b.current_balance) : null,
      noCash: v.voucher_type === 'payroll_bank_transfer',
      sources: sourceRows,
      account: accounts.length > 0 ? accounts.join(' + ') : null,
      accountCodes: codes.length > 0 ? codes.join(' + ') : null,
      pool,
      settledInvoices: settled,
      files: ((files.data ?? []) as Array<{ id: string; file_name: string; file_type: string | null; file_size: number | null; uploaded_at: string }>).map((f) => ({
        id: f.id,
        name: f.file_name,
        type: f.file_type ?? '',
        size: f.file_size,
        uploadedAt: f.uploaded_at,
      })),
      filesOpen: status === 'draft' || status === 'pending_approval',
      takesFiles: status !== 'voided',
      people: payroll,
      trail,
      createdBy,
      createdAt: v.created_at,
      can: {
        create: canDo(user, 'treasury', 'create'),
        edit: canDo(user, 'treasury', 'edit'),
        void: canDo(user, 'treasury', 'void'),
        approve: mayDecide,
      },
      reversible: v.reference_type !== 'payroll_disbursement',
    },
  }
}
