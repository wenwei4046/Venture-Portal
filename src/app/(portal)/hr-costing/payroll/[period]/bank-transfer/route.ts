import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePayrollPayoutsAction } from '@/lib/auth'
import { generateAllianceBankCsv } from '@/lib/bank-transfer/alliance-bank'
import { salaryBankPayees, type SalaryBankLine } from '@/lib/bank-transfer/payroll-voucher-payees'

/** Download the selected generated salary PVs using their recipient snapshots.
 * Approval is the existing system's paid event, so paid PVs remain exportable.
 * A download does not initiate or record a second bank transfer.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ period: string }> },
) {
  // Every employee's net pay and bank account: HR Costing, or Treasury WITH
  // Payroll payouts (2026-10-02).
  await requirePayrollPayoutsAction(['hr_costing', 'export'], ['treasury', 'export'])
  const { period } = await context.params

  if (!/^\d{4}-\d{2}-01$/.test(period)) {
    return NextResponse.json({ error: 'invalid period format' }, { status: 400 })
  }

  const url = new URL(request.url)
  // Accept 'hl_connect' as a legacy alias so old bookmarks don't 404;
  // both route to the Alliance Bank generator.
  const rawFormat = url.searchParams.get('format') ?? 'alliance'
  const format = rawFormat === 'hl_connect' ? 'alliance' : rawFormat
  if (format !== 'alliance') {
    return NextResponse.json(
      { error: `unsupported format: ${rawFormat}. Available: alliance` },
      { status: 400 },
    )
  }

  // ?department=<uuid> cuts the file for one department (2026-09-10, the
  // Payment board's per-department window). Unset = every staff row.
  const department = url.searchParams.get('department')
  if (department && !/^[0-9a-f-]{36}$/i.test(department)) {
    return NextResponse.json({ error: 'invalid department' }, { status: 400 })
  }

  const voucherParam = url.searchParams.get('vouchers')
  const voucherIds = voucherParam === null ? null : voucherParam.split(',')
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (voucherIds && (!voucherIds.length || voucherIds.length > 500 || voucherIds.some(id => !uuid.test(id)) || new Set(voucherIds).size !== voucherIds.length)) {
    return NextResponse.json({ error: 'Invalid salary PV selection' }, { status: 400 })
  }
  const supabase = await createClient()
  let query = supabase.from('payroll_voucher_lines').select(`
    payroll_row_id, employee_name, employee_code, net, salary_component, bank_name, bank_account_no,
    payment_vouchers!inner(id, voucher_no, status, payment_date)
  `).eq('period_month', period).eq('scope', 'staff')
    .in('payment_vouchers.status', ['pending_approval', 'approved', 'paid'])
  if (department) query = query.eq('department_id', department)
  if (voucherIds) query = query.in('voucher_id', voucherIds)
  const { data: rows, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const lines = (rows ?? []) as unknown as SalaryBankLine[]
  if (voucherIds && new Set(lines.map(line => line.payment_vouchers.id)).size !== voucherIds.length) {
    return NextResponse.json({ error: 'Selected salary PVs changed or are outside this payroll group' }, { status: 409 })
  }

  const periodDate = new Date(period + 'T00:00:00Z')
  const periodLabel = periodDate.toLocaleString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })

  let result
  try {
    const payees = salaryBankPayees(lines, periodLabel)
    result = generateAllianceBankCsv(payees, periodDate)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Cannot export these salary PVs' }, { status: 409 })
  }

  const filename = `alliance-bank-payroll-${period.slice(0, 7)}${department ? '-dept' : ''}.csv`

  const headers = new Headers({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store',
    // Surface generator stats so HR can see skipped rows in the browser
    // devtools if they're curious; not consumed by the bank.
    'X-Payroll-Rows': String(result.rowCount),
    'X-Payroll-Total': result.totalAmount.toFixed(2),
    'X-Payroll-Missing': String(result.missingBank.length),
  })

  return new NextResponse(result.csv, { status: 200, headers })
}
