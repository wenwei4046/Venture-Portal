import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { generateAllianceBankCsv, type PayslipPayee } from '@/lib/bank-transfer/alliance-bank'

/**
 * GET /hr-costing/payroll/[period]/bank-transfer?format=alliance
 *
 * Streams an Alliance Bank bulk-payment CSV for every staff row in the
 * period. Two-step salary flow (corrected 2026-04-17):
 *   1. Finance moves the lump sum HL Bank → Alliance Bank (Spec 4
 *      payroll_bank_transfer voucher).
 *   2. HR downloads THIS CSV, uploads it to the Alliance Bank portal,
 *      and triggers the bulk payout.
 *
 * Allowed by the Read-only file downloads exception in CLAUDE.md
 * (Spec 5a). Requires principal / finance / hr — HR is the primary
 * operator but Finance and Principal can regenerate for oversight.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ period: string }> },
) {
  await requirePermission('hr_costing', 'treasury')
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

  const supabase = await createClient()

  const { data: rows, error } = await supabase
    .from('hr_monthly_payroll')
    .select(`
      net, status,
      hr_staff_costs (employee_name, employee_code, bank_name, bank_account_no)
    `)
    .eq('period_month', period)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const periodDate = new Date(period + 'T00:00:00Z')
  const periodLabel = periodDate.toLocaleString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })

  const payees: PayslipPayee[] = (rows ?? []).map(r => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const staff = (r as any).hr_staff_costs
    return {
      employeeName: staff?.employee_name ?? 'Unknown',
      employeeCode: staff?.employee_code ?? null,
      bankName: staff?.bank_name ?? null,
      bankAccountNo: staff?.bank_account_no ?? null,
      amount: Number(r.net),
      voucherNo: null, // voucher_no wiring can come once payroll_runs.id is threaded in
      periodLabel,
    }
  })

  // Default payment date = end of the period's month so the value
  // reaches employees the same month. HR can change inside the bank portal.
  const paymentDate = new Date(
    Date.UTC(periodDate.getUTCFullYear(), periodDate.getUTCMonth() + 1, 0),
  )

  const result = generateAllianceBankCsv(payees, paymentDate)

  const filename = `alliance-bank-payroll-${period.slice(0, 7)}.csv`

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
