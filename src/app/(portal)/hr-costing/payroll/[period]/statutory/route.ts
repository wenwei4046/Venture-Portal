import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { generateKwspFormA } from '@/lib/statutory/kwsp-form-a'
import { generatePerkesoSocso } from '@/lib/statutory/perkeso-socso'
import { generatePerkesoEis } from '@/lib/statutory/perkeso-eis'
import { generateLhdnCp39 } from '@/lib/statutory/lhdn-cp39'
import type { StatutoryContributor } from '@/lib/statutory/types'

type FileKind = 'kwsp' | 'socso' | 'eis' | 'pcb'

/**
 * GET /hr-costing/payroll/[period]/statutory?file=kwsp|socso|eis|pcb
 *
 * Streams one of four Malaysian statutory monthly CSVs, built from the
 * period's hr_monthly_payroll (staff) UNION director_payouts (directors).
 *
 * Allowed by the Read-only-GET-routes exception in CLAUDE.md (Spec 5a).
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ period: string }> },
) {
  await requireRole(['principal', 'hr'])
  const { period } = await context.params
  if (!/^\d{4}-\d{2}-01$/.test(period)) {
    return NextResponse.json({ error: 'invalid period format' }, { status: 400 })
  }

  const url = new URL(request.url)
  const file = url.searchParams.get('file') as FileKind | null
  if (!file || !['kwsp', 'socso', 'eis', 'pcb'].includes(file)) {
    return NextResponse.json(
      { error: 'file must be kwsp | socso | eis | pcb' },
      { status: 400 },
    )
  }

  const supabase = await createClient()

  const [
    { data: staffRows, error: staffErr },
    { data: directorRows, error: dirErr },
  ] = await Promise.all([
    supabase
      .from('hr_monthly_payroll')
      .select(`
        statutory_allowance, basic_salary, gross, epf_er, epf_ee,
        socso_er, socso_ee, eis_er, eis_ee, pcb,
        hr_staff_costs (employee_name, employee_code, nric)
      `)
      .eq('period_month', period),
    supabase
      .from('director_payouts')
      .select(`
        payroll_gross, payroll_bk, payroll_allow,
        payroll_epf_er, payroll_epf_ee,
        payroll_socso_er, payroll_socso_ee,
        payroll_eis_er, payroll_eis_ee, payroll_pcb,
        directors (name, code, nric)
      `)
      .eq('period_month', period),
  ])

  if (staffErr || dirErr) {
    return NextResponse.json(
      { error: staffErr?.message ?? dirErr?.message ?? 'read failed' },
      { status: 500 },
    )
  }

  const contributors: StatutoryContributor[] = []

  for (const r of staffRows ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const staff = (r as any).hr_staff_costs
    if (!staff) continue
    const statWages = Number(r.basic_salary) + Number(r.statutory_allowance)
    contributors.push({
      code: staff.employee_code ?? null,
      fullName: staff.employee_name,
      nric: staff.nric ?? null,
      statutoryWages: statWages,
      taxableIncome: Number(r.gross) - Number(r.epf_ee),
      epfEr: Number(r.epf_er),
      epfEe: Number(r.epf_ee),
      socsoEr: Number(r.socso_er),
      socsoEe: Number(r.socso_ee),
      eisEr: Number(r.eis_er),
      eisEe: Number(r.eis_ee),
      pcb: Number(r.pcb),
    })
  }

  for (const r of directorRows ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dir = (r as any).directors
    if (!dir) continue
    const statWages = Number(r.payroll_bk ?? 0) + Number(r.payroll_allow ?? 0)
    contributors.push({
      code: dir.code ?? null,
      fullName: dir.name,
      nric: dir.nric ?? null,
      statutoryWages: statWages,
      taxableIncome: Number(r.payroll_gross ?? 0) - Number(r.payroll_epf_ee ?? 0),
      epfEr: Number(r.payroll_epf_er ?? 0),
      epfEe: Number(r.payroll_epf_ee ?? 0),
      socsoEr: Number(r.payroll_socso_er ?? 0),
      socsoEe: Number(r.payroll_socso_ee ?? 0),
      eisEr: Number(r.payroll_eis_er ?? 0),
      eisEe: Number(r.payroll_eis_ee ?? 0),
      pcb: Number(r.payroll_pcb ?? 0),
    })
  }

  const meta = {
    period,
    employerReference: `HV-${period.slice(0, 4)}${period.slice(5, 7)}`,
  }

  const result =
    file === 'kwsp'
      ? generateKwspFormA(contributors, meta)
      : file === 'socso'
        ? generatePerkesoSocso(contributors, meta)
        : file === 'eis'
          ? generatePerkesoEis(contributors, meta)
          : generateLhdnCp39(contributors, meta)

  const filename = `statutory-${file}-${period.slice(0, 7)}.csv`

  return new NextResponse(result.csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
      'X-Statutory-Rows': String(result.rowCount),
      'X-Statutory-Total': result.totalAmount.toFixed(2),
      'X-Statutory-Missing-Nric': String(result.skipped.length),
    },
  })
}
