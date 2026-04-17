import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatMoney } from '@/lib/utils'
import PayrollGrid, { type PayrollRowData } from '../_components/PayrollGrid'
import CopyFromLastMonthButton from '../_components/CopyFromLastMonthButton'

interface PageProps {
  params: Promise<{ period: string }>
}

function formatPeriodLabel(period: string): string {
  const d = new Date(period + 'T00:00:00Z')
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export default async function PayrollGridPage({ params }: PageProps) {
  await requireRole(['principal', 'hr'])
  const { period } = await params

  // Validate period is YYYY-MM-01 format
  if (!/^\d{4}-\d{2}-01$/.test(period)) notFound()

  const supabase = await createClient()

  const { data: rows } = await supabase
    .from('hr_monthly_payroll')
    .select(`
      id, staff_id, period_month, status, source,
      basic_salary, statutory_allowance, non_statutory_allowance,
      ot_hours, ot_amount, commission_amount, unpaid_leave_days,
      prorata_days_worked, prorata_days_in_month,
      epf_er, epf_ee, socso_er, socso_ee, eis_er, eis_ee, pcb,
      gross, net,
      hr_staff_costs (employee_name, departments (name))
    `)
    .eq('period_month', period)
    .order('id')

  if (!rows || rows.length === 0) {
    return (
      <div>
        <Link href="/hr-costing/payroll" className="text-sm text-muted hover:text-accent font-sans transition-colors">
          ← Back to Monthly Payroll
        </Link>
        <h1 className="font-serif text-3xl text-ink mt-6 mb-2">{formatPeriodLabel(period)}</h1>
        <p className="font-serif italic text-graphite mb-8">No rows for this period yet.</p>
        <p className="font-sans text-sm text-muted">
          Go back and create this period from the list page.
        </p>
      </div>
    )
  }

  const gridRows: PayrollRowData[] = rows.map(r => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const staff = (r as any).hr_staff_costs
    return {
      id: r.id,
      staff_name: staff?.employee_name ?? '—',
      dept_name: staff?.departments?.name ?? '—',
      status: r.status,
      source: r.source,
      basic_salary: Number(r.basic_salary),
      statutory_allowance: Number(r.statutory_allowance),
      non_statutory_allowance: Number(r.non_statutory_allowance),
      ot_hours: Number(r.ot_hours),
      ot_amount: Number(r.ot_amount),
      commission_amount: Number(r.commission_amount),
      unpaid_leave_days: Number(r.unpaid_leave_days),
      prorata_days_worked: r.prorata_days_worked,
      prorata_days_in_month: r.prorata_days_in_month,
      epf_er: Number(r.epf_er),
      epf_ee: Number(r.epf_ee),
      socso_er: Number(r.socso_er),
      socso_ee: Number(r.socso_ee),
      eis_er: Number(r.eis_er),
      eis_ee: Number(r.eis_ee),
      pcb: Number(r.pcb),
      gross: Number(r.gross),
      net: Number(r.net),
    }
  })

  const totals = {
    staff: gridRows.length,
    gross: gridRows.reduce((s, r) => s + r.gross, 0),
    net: gridRows.reduce((s, r) => s + r.net, 0),
    epf_er: gridRows.reduce((s, r) => s + r.epf_er, 0),
    socso_er: gridRows.reduce((s, r) => s + r.socso_er, 0),
    eis_er: gridRows.reduce((s, r) => s + r.eis_er, 0),
    pcb: gridRows.reduce((s, r) => s + r.pcb, 0),
  }

  const allDraft = gridRows.every(r => r.status === 'draft')

  return (
    <div>
      <Link
        href="/hr-costing/payroll"
        className="text-sm text-muted hover:text-accent font-sans transition-colors"
      >
        ← Back to Monthly Payroll
      </Link>

      <div className="flex items-baseline justify-between mt-6 mb-8">
        <div>
          <h1 className="font-serif text-3xl text-ink">{formatPeriodLabel(period)}</h1>
          <p className="font-serif italic text-graphite text-base mt-2">
            {totals.staff} staff · <em>Drafts editable inline</em> · Statutory recomputes on save
          </p>
        </div>
        {allDraft && (
          <div className="flex items-center gap-3">
            <Link
              href={`/hr-costing/payroll/${period}/import`}
              className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-3 py-2 rounded-md transition-colors"
            >
              Import CSV
            </Link>
            <CopyFromLastMonthButton period={period} />
          </div>
        )}
      </div>

      {/* Summary band */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-6 mb-10 border-y border-hairline py-6">
        <div>
          <div className="font-serif italic text-graphite text-xs uppercase tracking-wide">Total Gross</div>
          <div className="font-mono tabular text-xl text-ink mt-1">{formatMoney(totals.gross)}</div>
        </div>
        <div>
          <div className="font-serif italic text-graphite text-xs uppercase tracking-wide">Total Net</div>
          <div className="font-mono tabular text-xl text-ink mt-1">{formatMoney(totals.net)}</div>
        </div>
        <div>
          <div className="font-serif italic text-graphite text-xs uppercase tracking-wide">EPF ER</div>
          <div className="font-mono tabular text-md text-graphite mt-1">{formatMoney(totals.epf_er)}</div>
        </div>
        <div>
          <div className="font-serif italic text-graphite text-xs uppercase tracking-wide">SOCSO+EIS ER</div>
          <div className="font-mono tabular text-md text-graphite mt-1">
            {formatMoney(totals.socso_er + totals.eis_er)}
          </div>
        </div>
        <div>
          <div className="font-serif italic text-graphite text-xs uppercase tracking-wide">Total PCB</div>
          <div className="font-mono tabular text-md text-graphite mt-1">{formatMoney(totals.pcb)}</div>
        </div>
      </div>

      <PayrollGrid rows={gridRows} />
    </div>
  )
}
