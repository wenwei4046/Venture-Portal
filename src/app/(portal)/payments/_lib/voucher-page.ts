import dayjs from 'dayjs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { officeTime } from '@/lib/office-time'
import { readPayrollLineAccounts, withLineAccounts } from '@/lib/private-fields'
import { recipientAccountLabel, salaryPaymentLabel } from '@/lib/payroll-voucher-display'
import { AR_PARENT, accountFamily } from '@/lib/ar-accounts'
import type { AuditChange } from '@/lib/audit/changes'
import type { User } from '@/types'
import type { VoucherDetail } from './voucher-detail'

// What a voucher's full page shows beyond its drawer (2026-10-14, the Finance
// revamp v2 — D06): whom a salary voucher pays (the accounts through the
// reader, •••• without the Bank tick), the statutory contributions it covers,
// the GL accounts a decided voucher can be moved between, and its audit log —
// the voucher's own changes and its files', newest first, as `audit_changes()`
// gives them to this reader.

export interface PagePerson {
  name: string
  code: string | null
  department: string | null
  payment: string
  /** "Payroll account · Maybank · 1234…" — the account it pays into, as the reader may see it. */
  account: { label: string | null; bank: string | null; number: string | null } | null
  amount: number
}

export interface PageStatutory {
  name: string
  code: string | null
  department: string
  scheme: string
  amount: number
}

export interface PageAuditEvent {
  at: string
  who: string
  what: string
}

export interface VoucherPageExtras {
  people: PagePerson[]
  /** How many people the salary lines are for (one may be paid in two parts). */
  peopleCount: number
  statutory: PageStatutory[]
  statutoryPeople: number
  statutoryPeriods: string
  /** A decided voucher's GL accounts, to move a posting between (Treasury · Edit). */
  reassign: { from: Array<{ code: string; name: string; total: number }>; options: Array<{ code: string; name: string }> } | null
  audit: PageAuditEvent[]
}

const f2 = (n: number) => Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const rm = (n: unknown) => (n == null || n === '' ? '—' : `RM ${f2(Number(n))}`)
const STATUS: Record<string, string> = { draft: 'draft', pending_approval: 'pending approval', approved: 'approved', paid: 'paid', voided: 'voided' }

/** What one change to the voucher did, in a line. */
export function voucherChangeLine(c: Pick<AuditChange, 'table_name' | 'op' | 'old_row' | 'new_row' | 'changed' | 'masked'>): string {
  const row = (c.op === 'DELETE' ? c.old_row : c.new_row) ?? c.old_row ?? {}
  if (c.table_name === 'payment_attachments') {
    const name = String(row.file_name ?? 'a file')
    return c.op === 'INSERT' ? `Attachment added · ${name}` : c.op === 'DELETE' ? `Attachment removed · ${name}` : `Attachment changed · ${name}`
  }
  if (c.op === 'INSERT') return `Created ${row.voucher_no ?? 'the draft'} · ${rm(row.amount)} · ${row.payee_name ?? ''}`.trim()
  if (c.op === 'DELETE') return 'Removed'
  const changed = c.changed ?? []
  const masked = new Set(c.masked ?? [])
  const before = c.old_row ?? {}
  const after = c.new_row ?? {}
  const parts: string[] = []
  if (changed.includes('status')) {
    const from = String(before.status ?? '')
    const to = String(after.status ?? '')
    parts.push(
      to === 'pending_approval' && from === 'draft'
        ? 'Submitted for approval'
        : to === 'draft'
          ? 'Returned to draft'
          : to === 'paid' && from === 'draft' && after.direction === 'credit'
            // A receipt is written a draft and received once its line is in
            // (2026-10-22) — nobody approves it.
            ? 'Received'
            : to === 'paid'
              ? 'Approved and paid'
              : to === 'voided'
                ? 'Voided — entries reversed'
                : `Status ${STATUS[from] ?? from} → ${STATUS[to] ?? to}`,
    )
  }
  for (const key of changed) {
    if (key === 'status' || masked.has(key)) continue
    if (key === 'amount') parts.push(`Amount ${rm(before.amount)} → ${rm(after.amount)}`)
    else if (key === 'payment_date') parts.push(`Payment date ${before.payment_date ? dayjs(String(before.payment_date)).format('DD MMM YYYY') : '—'} → ${after.payment_date ? dayjs(String(after.payment_date)).format('DD MMM YYYY') : '—'}`)
    else if (key === 'payee_name') parts.push(`Payee ${before.payee_name ?? '—'} → ${after.payee_name ?? '—'}`)
    else if (key === 'voucher_no' && !before.voucher_no) parts.push(`Numbered ${after.voucher_no}`)
    else if (key === 'description') parts.push('Description changed')
    else if (key === 'bank_account_id') parts.push('Bank changed')
    else if (key === 'notes') parts.push('Notes changed')
    else if (key === 'approved_by' || key === 'approved_at' || key === 'executed_by' || key === 'executed_at' || key === 'journal_entry_id' || key === 'approval_request_id') continue
    else parts.push(`${key.replace(/_id$/, '').replace(/_/g, ' ')} changed`.replace(/^./, (ch) => ch.toUpperCase()))
  }
  for (const key of changed) if (masked.has(key)) parts.push(`${key.replace(/_/g, ' ')} changed`.replace(/^./, (ch) => ch.toUpperCase()))
  return parts.length > 0 ? parts.join(' · ') : 'Changed'
}

export async function loadVoucherPageExtras(
  supabase: SupabaseClient,
  user: User,
  detail: VoucherDetail,
): Promise<VoucherPageExtras> {
  const id = detail.id
  const reference = detail.reference
  const decided = detail.status === 'approved' || detail.status === 'paid'

  const linesRead =
    reference === 'payroll_disbursement'
      ? supabase
          .from('payroll_voucher_lines')
          .select('id, scope, payroll_row_id, employee_name, employee_code, department_name, net, salary_component, recipient_account, bank_name')
          .eq('voucher_id', id)
          .order('employee_name')
          .order('salary_component')
          .then((r) => r)
      : null
  const statutoryRead =
    reference === 'payroll_statutory'
      ? supabase
          .from('payroll_statutory_voucher_lines')
          .select('id, scope, payroll_row_id, employee_name, employee_code, department_name, period_month, scheme, amount')
          .eq('voucher_id', id)
          .order('department_name')
          .order('employee_name')
          .order('scheme')
          .then((r) => r)
      : null
  const auditRead = Promise.all([
    supabase.rpc('audit_changes', { p_tables: ['payment_vouchers'], p_row: id, p_limit: 60 }).then((r) => r),
    ...detail.files.slice(0, 8).map((f) => supabase.rpc('audit_changes', { p_tables: ['payment_attachments'], p_row: f.id, p_limit: 5 }).then((r) => r)),
  ])
  const reassignRead =
    detail.can.edit && decided
      ? Promise.all([
          supabase
            .from('journal_lines')
            .select('account_code, debit, credit, journal_entries!inner(reference_type, reference_id, is_reversed)')
            .eq('journal_entries.reference_type', 'payment_voucher')
            .eq('journal_entries.reference_id', id)
            .eq('journal_entries.is_reversed', false)
            .then((r) => r),
          supabase.from('chart_of_accounts').select('code, name').eq('is_active', true).order('code').then((r) => r),
          supabase.rpc('bank_gl_codes' as never).then((r) => r),
          accountFamily(supabase, AR_PARENT),
        ])
      : null

  // ── Whom a salary voucher pays ──
  let people: PagePerson[] = []
  let peopleCount = 0
  if (linesRead) {
    const { data, error } = await linesRead
    if (error) throw new Error('Unable to load the recorded salary payment details. Please try again.')
    const rows = (data ?? []) as unknown as Array<{ id: string }>
    const accounts = await readPayrollLineAccounts(supabase, user, rows.map((l) => l.id))
    const lines = withLineAccounts(rows, accounts) as unknown as Array<{
      id: string
      scope: string
      payroll_row_id: string
      employee_name: string
      employee_code: string | null
      department_name: string | null
      net: number | string
      salary_component: string | null
      recipient_account: string | null
      bank_name: string | null
      bank_account_no: string | null
    }>
    peopleCount = new Set(lines.map((l) => `${l.scope}:${l.payroll_row_id}`)).size
    people = lines.map((l) => ({
      name: l.employee_name,
      code: l.employee_code,
      department: l.department_name,
      payment: salaryPaymentLabel(l.salary_component),
      account: l.bank_name && l.bank_account_no ? { label: recipientAccountLabel(l.recipient_account) || null, bank: l.bank_name, number: l.bank_account_no } : null,
      amount: Number(l.net),
    }))
  }

  // ── The statutory contributions it covers ──
  let statutory: PageStatutory[] = []
  let statutoryPeople = 0
  let statutoryPeriods = ''
  if (statutoryRead) {
    const { data, error } = await statutoryRead
    if (error) throw new Error('Unable to load the recorded statutory contribution details. Please try again.')
    const rows = (data ?? []) as unknown as Array<{ scope: string; payroll_row_id: string; employee_name: string; employee_code: string | null; department_name: string; period_month: string; scheme: string; amount: number | string }>
    statutoryPeople = new Set(rows.map((r) => `${r.scope}:${r.payroll_row_id}`)).size
    statutoryPeriods = [...new Set(rows.map((r) => dayjs(r.period_month).format('MMMM YYYY')))].join(' · ')
    statutory = rows.map((r) => ({ name: r.employee_name, code: r.employee_code, department: r.department_name, scheme: r.scheme, amount: Number(r.amount) }))
  }

  // ── The GL accounts a decided voucher can be moved between (3030's family and the banks are not offered) ──
  let reassign: VoucherPageExtras['reassign'] = null
  if (reassignRead) {
    const [{ data: jl }, { data: coa }, { data: bankCodes }, arFamily] = await reassignRead
    const banks = new Set((bankCodes ?? []) as unknown as string[])
    const ar = new Set(arFamily)
    const names = new Map(((coa ?? []) as Array<{ code: string; name: string }>).map((c) => [c.code, c.name]))
    const totals = new Map<string, number>()
    for (const l of (jl ?? []) as Array<{ account_code: string; debit: number | null; credit: number | null }>) {
      if (banks.has(l.account_code) || l.account_code === '3000' || ar.has(l.account_code)) continue
      totals.set(l.account_code, (totals.get(l.account_code) ?? 0) + Number(l.debit ?? 0) + Number(l.credit ?? 0))
    }
    const from = [...totals.entries()].map(([code, total]) => ({ code, name: names.get(code) ?? code, total: Math.round(total * 100) / 100 }))
    if (from.length > 0) {
      reassign = { from, options: ((coa ?? []) as Array<{ code: string; name: string }>).filter((c) => !banks.has(c.code) && c.code !== '3000') }
    }
  }

  // ── Its audit log, newest first ──
  const auditAnswers = await auditRead
  const changes = auditAnswers.flatMap((r) => ((r.error ? [] : r.data ?? []) as unknown as AuditChange[]))
  const audit = changes
    .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : a.occurred_at > b.occurred_at ? -1 : b.id - a.id))
    .map((c) => ({
      at: officeTime(c.occurred_at).format('DD MMM YYYY · HH:mm'),
      who: c.actor_name ?? (c.actor_id ? 'Removed account' : 'System'),
      what: voucherChangeLine(c),
    }))

  return { people, peopleCount, statutory, statutoryPeople, statutoryPeriods, reassign, audit }
}
