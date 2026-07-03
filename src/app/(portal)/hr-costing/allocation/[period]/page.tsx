import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatMoney } from '@/lib/utils'
import PeriodPicker from '../../payroll/_components/PeriodPicker'
import AllocationEditor, { type StaffAllocationData } from '../_components/AllocationEditor'
import CopyAllocationsButton from '../_components/CopyAllocationsButton'

interface PageProps {
  params: Promise<{ period: string }>
}

function formatPeriodLabel(period: string): string {
  const d = new Date(period + 'T00:00:00Z')
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

// Staff billing allocation editor — HR splits each employee's employer cost
// (gross + EPF/SOCSO/EIS ER, the same CTC basis Finance bills) across
// subsidiaries by %. The remainder is HV's own share and is never billed.
// Finance reads the aggregate per dept × company on /billing (RPC
// get_staff_billing_allocation) — no names, no individual salaries.
export default async function AllocationPage({ params }: PageProps) {
  const user = await requireRole(['principal', 'hr'])
  const { period } = await params

  if (!/^\d{4}-\d{2}-01$/.test(period)) notFound()

  const supabase = await createClient()

  const [{ data: payrollRows }, { data: allocRows }, { data: companies }] =
    await Promise.all([
      supabase
        .from('hr_monthly_payroll')
        .select(
          'staff_id, gross, epf_er, socso_er, eis_er, hr_staff_costs (employee_name, departments (name))',
        )
        .eq('period_month', period)
        .order('id'),
      supabase
        .from('hr_staff_allocation')
        .select('staff_id, company_id, allocation_pct')
        .eq('period_month', period)
        .gt('allocation_pct', 0),
      supabase.from('companies').select('id, name, short_code').order('short_code'),
    ])

  const allocByStaff = new Map<string, Array<{ companyId: string; pct: number }>>()
  for (const r of allocRows ?? []) {
    const list = allocByStaff.get(r.staff_id) ?? []
    // DB stores 0–1 fractions at 6dp; the form works in 0–100 percentages.
    list.push({ companyId: r.company_id, pct: Math.round(Number(r.allocation_pct) * 10000) / 100 })
    allocByStaff.set(r.staff_id, list)
  }

  const staff: StaffAllocationData[] = (payrollRows ?? []).map((r) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sc = (r as any).hr_staff_costs
    const cost =
      Number(r.gross) + Number(r.epf_er) + Number(r.socso_er) + Number(r.eis_er)
    return {
      staffId: r.staff_id,
      name: sc?.employee_name ?? '—',
      dept: sc?.departments?.name ?? '—',
      employerCost: Math.round(cost * 100) / 100,
      rows: allocByStaff.get(r.staff_id) ?? [],
    }
  })

  const staffWithAlloc = staff.filter((s) => s.rows.length > 0).length
  const readOnly = user.role !== 'hr' // RLS: writes are HR-only

  const totalCost = staff.reduce((s, r) => s + r.employerCost, 0)
  const billedTotal = staff.reduce(
    (s, r) =>
      s + r.rows.reduce((a, row) => a + Math.round(r.employerCost * row.pct) / 100, 0),
    0,
  )
  const hvTotal = Math.round((totalCost - billedTotal) * 100) / 100

  return (
    <div>
      <Link
        href={`/hr-costing/payroll/${period}`}
        className="text-sm text-muted hover:text-accent font-sans transition-colors"
      >
        ← Back to Payroll
      </Link>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>II.</em> HR · BILLING ALLOCATION · {formatPeriodLabel(period).toUpperCase()}
          </div>
          <h1 className="page-title">Billing Allocation</h1>
          <p className="font-serif italic text-graphite text-base mt-3">
            {staff.length === 0 ? (
              <em>No payroll rows for this period.</em>
            ) : (
              <em>
                {staffWithAlloc} of {staff.length} staff allocated · unallocated share stays
                with HV
              </em>
            )}
          </p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <PeriodPicker period={period} basePath="/hr-costing/allocation" />
          {!readOnly && staff.length > 0 && <CopyAllocationsButton period={period} />}
        </div>
      </div>

      {staff.length === 0 ? (
        <div className="py-16 text-center border border-hairline rounded-md bg-surface">
          <p className="font-serif text-2xl text-ink mb-3">
            Nothing to allocate for {formatPeriodLabel(period)}.
          </p>
          <p className="font-serif italic text-muted text-sm mb-8 max-w-md mx-auto">
            The allocation splits each employee&apos;s payroll cost across subsidiaries, so
            it needs the month&apos;s payroll rows first.
          </p>
          <Link
            href={`/hr-costing/payroll/${period}`}
            className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
          >
            Go to Payroll →
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-10 border-y border-hairline py-6">
            <div>
              <div className="font-serif italic text-graphite text-xs uppercase tracking-wide">
                Total Employer Cost
              </div>
              <div className="num text-num-ink text-xl tracking-[-0.01em] mt-1">
                {formatMoney(totalCost)}
              </div>
            </div>
            <div>
              <div className="font-serif italic text-graphite text-xs uppercase tracking-wide">
                Staff Allocated
              </div>
              <div className="num text-graphite text-md mt-1">
                {staffWithAlloc} / {staff.length}
              </div>
            </div>
            <div>
              <div className="font-serif italic text-graphite text-xs uppercase tracking-wide">
                Billed to Subsidiaries
              </div>
              <div className="num text-graphite text-md mt-1">{formatMoney(billedTotal)}</div>
            </div>
            <div>
              <div className="font-serif italic text-graphite text-xs uppercase tracking-wide">
                HV — Venture Own Share
              </div>
              <div className="num text-graphite text-md mt-1">{formatMoney(hvTotal)}</div>
            </div>
          </div>

          <AllocationEditor
            period={period}
            staff={staff}
            companies={companies ?? []}
            readOnly={readOnly}
          />
        </>
      )}
    </div>
  )
}
