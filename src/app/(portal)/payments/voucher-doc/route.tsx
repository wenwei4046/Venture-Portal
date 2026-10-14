// Per-voucher PDF export (document layout). Supports:
//   ?id=<uuid>           — single voucher, with recorded contribution details
//   ?ids=<id1>,<id2>,... — explicit set, each voucher starts on its own page
//
// Mirrors /billing/invoice-doc but for payment vouchers / official receipts.

import { createClient } from '@/lib/supabase/server'
import { requireAnyActionOn } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { canSeePayrollPayouts } from '@/lib/roles'
import { isPayrollReference } from '@/lib/payroll-vouchers'
import { exportPdfResponse } from '@/lib/export/response'
import { VoucherDocPdf, type SalaryPaymentData, type StatutoryCoverageData, type VoucherDocData } from '../_format/voucher-doc-pdf'
import { officeTime } from '@/lib/office-time'
import { readPayrollLineAccounts, withLineAccounts } from '@/lib/private-fields'

/**
 * A pool as a document names it — the user's form, "XX Department Pool"
 * (2026-04-18): Venture Pool, Director Pool, Invoice Payout Pool, and every
 * department's pool by its department ("dept_pool_revenue_department" →
 * Revenue Department Pool), the keys staying as they are.
 */
function poolOnDocument(pool: string | null | undefined): string | null {
  if (!pool) return null
  const fixed: Record<string, string> = { venture_pool: 'Venture Pool', dept_pool_director: 'Director Pool', invoice_payout_pool: 'Invoice Payout Pool' }
  if (fixed[pool]) return fixed[pool]
  const words = (s: string) =>
    s
      .split(/[_-]+/)
      .filter(Boolean)
      .map((w) => (w === 'hr' || w === 'it' ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
      .join(' ')
  if (pool.startsWith('dept_pool_')) {
    const dept = words(pool.slice('dept_pool_'.length))
    return /department$/i.test(dept) ? `${dept} Pool` : `${dept} Department Pool`
  }
  return words(pool)
}

/**
 * When each voucher was sent for approval, and by whom — the Approval list's
 * *Submitted*. The treasury's read only (the route asks `can(user, 'treasury')`
 * before calling it): HR's readers of a payroll voucher get its maker there.
 */
async function readSubmissions(supabase: Awaited<ReturnType<typeof createClient>>, voucherIds: string[]) {
  const { data, error } = await supabase
    .from('approval_requests')
    .select('reference_id, submitted_by, created_at')
    .eq('reference_table', 'payment_vouchers')
    .in('reference_id', voucherIds)
    .order('created_at', { ascending: true })
  return error ? [] : ((data ?? []) as Array<{ reference_id: string; submitted_by: string | null; created_at: string }>)
}

export async function GET(req: Request) {
  const user = await requireAnyActionOn('/payments', ['treasury', 'export'], ['hr_costing', 'export'])
  const url = new URL(req.url)
  const id = url.searchParams.get('id')?.trim() || null
  const idsParam = url.searchParams.get('ids')?.trim() || null

  if (!id && !idsParam) {
    return Response.json({ error: 'Provide ?id= or ?ids=' }, { status: 400 })
  }

  const supabase = await createClient()

  let q = supabase
    .from('payment_vouchers')
    .select(
      'id, voucher_no, voucher_type, direction, status, amount, payment_date, created_at, created_by, approved_by, approved_at, executed_by, executed_at, payment_method, payee_name, payee_company_id, bank_account_id, description, notes, payment_reference, target_pool, reference_type',
    )
  if (!can(user, 'treasury')) q = q.in('reference_type', ['payroll_disbursement', 'payroll_statutory', 'payroll_payment_request'])
  if (id) {
    q = q.eq('id', id)
  } else {
    const ids = (idsParam ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    if (ids.length === 0) return Response.json({ error: 'ids must be non-empty' }, { status: 400 })
    q = q.in('id', ids)
  }
  q = q.order('voucher_no', { ascending: true })

  const { data: found } = await q
  // A payroll voucher prints who is paid what, and into which account: not
  // without Payroll payouts. Dropped rather than refused, so a mixed selection
  // still prints the vouchers the account may see.
  const vouchers = canSeePayrollPayouts(user) ? found : (found ?? []).filter((v) => !isPayrollReference(v.reference_type))
  if (!vouchers || vouchers.length === 0) {
    return Response.json({ error: 'No matching vouchers' }, { status: 404 })
  }

  const voucherIds = vouchers.map((v) => v.id as string)
  const companyIds = Array.from(new Set(vouchers.map((v) => v.payee_company_id).filter(Boolean))) as string[]
  const bankIds = Array.from(new Set(vouchers.map((v) => v.bank_account_id).filter(Boolean))) as string[]
  const statutoryIds = vouchers.filter((v) => v.reference_type === 'payroll_statutory').map((v) => v.id as string)
  const salaryIds = vouchers.filter((v) => v.reference_type === 'payroll_disbursement').map((v) => v.id as string)

  const [{ data: srcs }, { data: companies }, { data: banks }, coverageResult, salaryResult, requests] = await Promise.all([
    supabase
      .from('payment_voucher_sources')
      .select('voucher_id, pool, amount, account_code, chart_of_accounts!pvs_account_code_fk(name)')
      .in('voucher_id', voucherIds)
      .order('amount', { ascending: false }),
    companyIds.length > 0
      ? supabase.from('companies').select('id, name, short_code').in('id', companyIds)
      : Promise.resolve({ data: [] }),
    bankIds.length > 0
      ? supabase.from('bank_accounts').select('id, bank_name, account_number').in('id', bankIds)
      : Promise.resolve({ data: [] }),
    statutoryIds.length > 0
      ? // This new table is not in the generated Database type yet.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from('payroll_statutory_voucher_lines')
          .select('id, voucher_id, scope, payroll_row_id, employee_name, employee_code, department_name, period_month, scheme, amount')
          .in('voucher_id', statutoryIds)
          .order('department_name').order('employee_name').order('scheme')
      : Promise.resolve({ data: [], error: null }),
    salaryIds.length > 0
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from('payroll_voucher_lines')
          .select('id, voucher_id, scope, payroll_row_id, employee_name, employee_code, department_name, period_month, net, salary_component, recipient_account, bank_name')
          .in('voucher_id', salaryIds)
          .order('department_name').order('employee_name').order('salary_component')
      : Promise.resolve({ data: [], error: null }),
    // The Approval list's *Submitted* — a reader who may not see the requests gets the voucher's own creator there instead.
    can(user, 'treasury') ? readSubmissions(supabase, voucherIds) : Promise.resolve([]),
  ])
  if (coverageResult.error) {
    return Response.json({ error: 'Unable to load recorded statutory contribution details. Please try again.' }, { status: 500 })
  }
  if (salaryResult.error) {
    return Response.json({ error: 'Unable to load recorded salary payment details. Please try again.' }, { status: 500 })
  }
  // The account each line pays into, through the reader: the print shows ••••
  // unless the viewer's title ticks Bank accounts (2026-10-09, PR4).
  const salaryLines = (salaryResult.data ?? []) as Array<{ id: string }>
  const lineAccounts = await readPayrollLineAccounts(supabase, user, salaryLines.map((l) => l.id))

  const salaryByVoucher = new Map<string, SalaryPaymentData[]>()
  for (const line of withLineAccounts(salaryLines, lineAccounts) as unknown as Array<Omit<SalaryPaymentData, 'net'> & { voucher_id: string; net: string | number }>) {
    const payments = salaryByVoucher.get(line.voucher_id) ?? []
    payments.push({ ...line, net: Number(line.net) })
    salaryByVoucher.set(line.voucher_id, payments)
  }

  const coverageByVoucher = new Map<string, StatutoryCoverageData[]>()
  for (const line of (coverageResult.data ?? []) as Array<Omit<StatutoryCoverageData, 'amount'> & { voucher_id: string; amount: string | number }>) {
    const coverage = coverageByVoucher.get(line.voucher_id) ?? []
    coverage.push({ ...line, amount: Number(line.amount) })
    coverageByVoucher.set(line.voucher_id, coverage)
  }

  // The names on its approval and signature lines.
  const userIds = [
    ...new Set(
      [...vouchers.flatMap((v) => [v.created_by, v.approved_by, v.executed_by]), ...requests.map((r) => r.submitted_by)].filter((x): x is string => !!x),
    ),
  ]
  const { data: people } = userIds.length > 0 ? await supabase.from('users').select('id, name').in('id', userIds) : { data: [] }
  const nameOf = (uid: string | null | undefined) => (uid ? ((people ?? []) as Array<{ id: string; name: string | null }>).find((u) => u.id === uid)?.name ?? null : null)
  // The latest time each was sent.
  const sentBy = new Map(requests.map((r) => [r.reference_id, r]))

  const companyMap = new Map((companies ?? []).map((c) => [c.id as string, c]))
  const bankMap = new Map((banks ?? []).map((b) => [b.id as string, b]))
  const sourcesByVoucher = new Map<string, VoucherDocData['sources']>()
  for (const s of (srcs ?? []) as Array<{ voucher_id: string; pool: string; amount: string | number; account_code: string | null; chart_of_accounts: { name: string } | null }>) {
    const arr = sourcesByVoucher.get(s.voucher_id) ?? []
    const name = s.chart_of_accounts?.name ?? (s.account_code ? s.account_code.replace(/_/g, ' ') : null)
    arr.push({
      pool_label: poolOnDocument(s.pool) ?? s.pool,
      // "6100 · Advertising" — the design's account, its code first.
      account_label: s.account_code && s.chart_of_accounts?.name ? `${s.account_code} · ${s.chart_of_accounts.name}` : name,
      amount: Number(s.amount),
    })
    sourcesByVoucher.set(s.voucher_id, arr)
  }

  const docs: VoucherDocData[] = vouchers.map((v) => {
    const company = v.payee_company_id ? companyMap.get(v.payee_company_id) : null
    const bank = v.bank_account_id ? bankMap.get(v.bank_account_id) : null
    const status = v.status as string
    const sent = sentBy.get(v.id as string)
    const method = (v.payment_method as string | null)?.replace(/_/g, ' ') ?? null
    return {
      id: v.id as string,
      voucher_no: v.voucher_no as string | null,
      voucher_type: v.voucher_type as string,
      direction: (v.direction as string) ?? 'debit',
      status,
      amount: Number(v.amount),
      payment_date: v.payment_date as string | null,
      created_at: v.created_at as string,
      payee_name: (v.payee_name as string) ?? '—',
      payee_kind: company ? 'Group company' : null,
      method: method ? method.charAt(0).toUpperCase() + method.slice(1) : null,
      bank: bank ? { name: bank.bank_name as string, number: (bank.account_number as string | null) ?? null } : null,
      description: v.description as string | null,
      notes: v.notes as string | null,
      payment_reference: v.payment_reference as string | null,
      sources: sourcesByVoucher.get(v.id as string) ?? [],
      target_pool_label: poolOnDocument(v.target_pool as string | null),
      approval: {
        created: { by: nameOf(v.created_by as string), at: v.created_at as string },
        submitted:
          status === 'draft'
            ? null
            : sent
              ? { by: nameOf(sent.submitted_by), at: sent.created_at }
              : { by: nameOf(v.created_by as string), at: null },
        approved: v.approved_at ? { by: nameOf(v.approved_by as string | null), at: v.approved_at as string } : null,
        paid: v.executed_at ? { by: nameOf(v.executed_by as string | null), at: v.executed_at as string } : null,
      },
      statutory_coverage: coverageByVoucher.get(v.id as string) ?? [],
      salary_payments: salaryByVoucher.get(v.id as string) ?? [],
    }
  })

  const filename = id && docs.length === 1
    ? `voucher-${docs[0].voucher_no ?? docs[0].id.slice(0, 8)}`
    : `vouchers-batch-${officeTime().format('YYYYMMDD')}-${docs.length}`

  return exportPdfResponse({ filename, element: <VoucherDocPdf vouchers={docs} /> })
}
