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
import { formatPoolLabel } from '@/lib/voucher-detail'
import { VoucherDocPdf, type SalaryPaymentData, type StatutoryCoverageData, type VoucherDocData } from '../_format/voucher-doc-pdf'
import { officeTime } from '@/lib/office-time'
import { readPayrollLineAccounts, withLineAccounts } from '@/lib/private-fields'

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
    .select('id, voucher_no, voucher_type, direction, status, amount, payment_date, created_at, payee_name, payee_company_id, bank_account_id, description, notes, payment_reference, target_pool, reference_type')
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

  const [{ data: srcs }, { data: companies }, { data: banks }, coverageResult, salaryResult] = await Promise.all([
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

  const companyMap = new Map((companies ?? []).map((c) => [c.id as string, c]))
  const bankMap = new Map((banks ?? []).map((b) => [b.id as string, b]))
  const sourcesByVoucher = new Map<string, VoucherDocData['sources']>()
  for (const s of (srcs ?? []) as Array<{ voucher_id: string; pool: string; amount: string | number; account_code: string | null; chart_of_accounts: { name: string } | null }>) {
    const arr = sourcesByVoucher.get(s.voucher_id) ?? []
    arr.push({
      pool_label: formatPoolLabel(s.pool) ?? s.pool,
      account_label: s.chart_of_accounts?.name ?? (s.account_code ? s.account_code.replace(/_/g, ' ') : null),
      amount: Number(s.amount),
    })
    sourcesByVoucher.set(s.voucher_id, arr)
  }

  const docs: VoucherDocData[] = vouchers.map((v) => {
    const company = v.payee_company_id ? companyMap.get(v.payee_company_id) : null
    const bank = v.bank_account_id ? bankMap.get(v.bank_account_id) : null
    return {
      id: v.id as string,
      voucher_no: v.voucher_no as string | null,
      voucher_type: v.voucher_type as string,
      direction: (v.direction as string) ?? 'debit',
      status: v.status as string,
      amount: Number(v.amount),
      payment_date: v.payment_date as string | null,
      created_at: v.created_at as string,
      payee_name: (v.payee_name as string) ?? '—',
      payee_sub: company ? `${company.name} (${company.short_code})` : null,
      bank_label: bank ? `${bank.bank_name} — ${bank.account_number ?? ''}`.trim() : null,
      description: v.description as string | null,
      notes: v.notes as string | null,
      payment_reference: v.payment_reference as string | null,
      sources: sourcesByVoucher.get(v.id as string) ?? [],
      statutory_coverage: coverageByVoucher.get(v.id as string) ?? [],
      salary_payments: salaryByVoucher.get(v.id as string) ?? [],
    }
  })

  const filename = id && docs.length === 1
    ? `voucher-${docs[0].voucher_no ?? docs[0].id.slice(0, 8)}`
    : `vouchers-batch-${officeTime().format('YYYYMMDD')}-${docs.length}`

  return exportPdfResponse({ filename, element: <VoucherDocPdf vouchers={docs} /> })
}
