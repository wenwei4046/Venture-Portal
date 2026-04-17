import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { generateHlConnectCsv, type PayslipPayee } from '@/lib/bank-transfer/hl-connect'

/**
 * GET /hr-costing/payroll/[period]/bank-transfer?format=hl_connect
 *
 * Streams a Hong Leong Connect CSV for every staff row in the period.
 *
 * Allowed by the Read-only file downloads exception in CLAUDE.md
 * (Spec 5a). Still requires principal / finance / hr — Finance is the
 * one who actually uploads the file to the bank portal.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ period: string }> },
) {
  await requireRole(['principal', 'finance', 'hr'])
  const { period } = await context.params

  if (!/^\d{4}-\d{2}-01$/.test(period)) {
    return NextResponse.json({ error: 'invalid period format' }, { status: 400 })
  }

  const url = new URL(request.url)
  const format = url.searchParams.get('format') ?? 'hl_connect'
  if (format !== 'hl_connect') {
    return NextResponse.json(
      { error: `unsupported format: ${format}. Available: hl_connect` },
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
      voucherNo: null, // Spec 5c MVP — voucher_no wiring comes once Spec 4 transfer lands
      periodLabel,
    }
  })

  // Default payment date = end of the period's month so the value
  // reaches employees the same month. HR can change inside the bank portal.
  const paymentDate = new Date(
    Date.UTC(periodDate.getUTCFullYear(), periodDate.getUTCMonth() + 1, 0),
  )

  const result = generateHlConnectCsv(payees, paymentDate)

  const filename = `hl-connect-payroll-${period.slice(0, 7)}.csv`

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
