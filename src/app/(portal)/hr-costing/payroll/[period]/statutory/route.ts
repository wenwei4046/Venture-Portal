import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAction } from '@/lib/auth'
import { generateKwspFormA } from '@/lib/statutory/kwsp-form-a'
import { generatePerkesoSocso } from '@/lib/statutory/perkeso-socso'
import { generatePerkesoEis } from '@/lib/statutory/perkeso-eis'
import { generateLhdnCp39 } from '@/lib/statutory/lhdn-cp39'
import type { StatutoryContributor } from '@/lib/statutory/types'
import { readDirectorNric, readStaffPrivate } from '@/lib/private-fields'
import { needsTick, sees } from '@/lib/sensitive'

type FileKind = 'kwsp' | 'socso' | 'eis' | 'pcb'

/**
 * GET /hr-costing/payroll/[period]/statutory?file=kwsp|socso|eis|pcb
 *
 * Streams one of four Malaysian statutory monthly CSVs, built from the
 * period's hr_monthly_payroll (staff) UNION director_monthly_payroll
 * (directors — InfoTech actuals, mig 20260730100000).
 *
 * Allowed by the Read-only-GET-routes exception in CLAUDE.md (Spec 5a).
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ period: string }> },
) {
  const user = await requireAction('hr_costing', 'export')
  // EPF, SOCSO, EIS and LHDN file every person under their NRIC (2026-10-09,
  // PR4, the user's choice A): without NRIC / IC ticked there is no file.
  if (!sees(user, 'nric')) {
    return NextResponse.json({ error: needsTick('nric', 'A statutory file') }, { status: 403 })
  }
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
        hr_staff_costs (id, employee_name, employee_code)
      `)
      .eq('period_month', period),
    supabase
      .from('director_monthly_payroll')
      .select(`
        employee_name, basic_salary, statutory_allowance, gross,
        epf_er, epf_ee, socso_er, socso_ee, eis_er, eis_ee, pcb,
        directors (id, name, code)
      `)
      .eq('period_month', period),
  ])

  if (staffErr || dirErr) {
    return NextResponse.json(
      { error: staffErr?.message ?? dirErr?.message ?? 'read failed' },
      { status: 500 },
    )
  }

  // The NRICs, through the readers — the tables no longer hand them out
  // (2026-10-09, PR4); the caller holds the tick, so they come back whole.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const staffIds = (staffRows ?? []).map(r => (r as any).hr_staff_costs?.id).filter(Boolean) as string[]
  const directorIds = (directorRows ?? []).map(r => (r as any).directors?.id).filter(Boolean) as string[]
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const [staffPrivate, directorNric] = await Promise.all([
    readStaffPrivate(supabase, user, staffIds),
    readDirectorNric(supabase, user, directorIds),
  ])

  const contributors: StatutoryContributor[] = []

  for (const r of staffRows ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const staff = (r as any).hr_staff_costs
    if (!staff) continue
    const statWages = Number(r.basic_salary) + Number(r.statutory_allowance)
    contributors.push({
      code: staff.employee_code ?? null,
      fullName: staff.employee_name,
      nric: staffPrivate.get(staff.id)?.nric ?? null,
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
    // Unmatched InfoTech rows (director_id NULL) still ship — name comes from
    // the file; a missing NRIC lands them in the generator's skipped list.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dir = (r as any).directors
    const statWages = Number(r.basic_salary ?? 0) + Number(r.statutory_allowance ?? 0)
    contributors.push({
      code: dir?.code ?? null,
      fullName: dir?.name ?? r.employee_name,
      nric: dir?.id ? (directorNric.get(dir.id) ?? null) : null,
      statutoryWages: statWages,
      taxableIncome: Number(r.gross ?? 0) - Number(r.epf_ee ?? 0),
      epfEr: Number(r.epf_er ?? 0),
      epfEe: Number(r.epf_ee ?? 0),
      socsoEr: Number(r.socso_er ?? 0),
      socsoEe: Number(r.socso_ee ?? 0),
      eisEr: Number(r.eis_er ?? 0),
      eisEe: Number(r.eis_ee ?? 0),
      pcb: Number(r.pcb ?? 0),
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
