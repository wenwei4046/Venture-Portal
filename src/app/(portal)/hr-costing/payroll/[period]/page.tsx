import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatMoney } from '@/lib/utils'
import PayrollGrid, { type PayrollRowData } from '../_components/PayrollGrid'
import CopyFromLastMonthButton from '../_components/CopyFromLastMonthButton'
import SubmitToPrincipalButton from '../_components/SubmitToPrincipalButton'
import MoreActionsDropdown from '../_components/MoreActionsDropdown'
import RequestPayrollPaymentButton, {
  type RequestState,
} from '../_components/RequestPayrollPaymentButton'

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

  const [{ data: rows }, { data: run }] = await Promise.all([
    supabase
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
      .order('id'),
    supabase
      .from('payroll_runs')
      .select('id, status, total_amount, submitted_at, approved_at, paid_at, rejection_reason, rejected_at')
      .eq('period_month', period)
      .maybeSingle(),
  ])

  // Latest payment request for this run (if run exists). Order by created_at
  // desc so we can spot an active one first; uniqueness is enforced at DB,
  // so at most one non-terminal row exists.
  const { data: requestRows } = run
    ? await supabase
        .from('payroll_payment_requests')
        .select('id, status, pv_id, requested_at, created_at')
        .eq('payroll_run_id', run.id)
        .order('created_at', { ascending: false })
        .limit(5)
    : { data: null }

  if (!rows || rows.length === 0) {
    return (
      <div>
        <h1 className="font-serif text-3xl text-ink mt-2 mb-2">{formatPeriodLabel(period)}</h1>
        <p className="font-serif italic text-graphite mb-8">No rows for this period yet.</p>
        <p className="font-sans text-sm text-muted">
          Open <Link href="/hr-costing/payroll" className="text-accent hover:underline">Payroll</Link> to create the current period.
        </p>
      </div>
    )
  }

  const gridRows: PayrollRowData[] = rows.map(r => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const staff = (r as any).hr_staff_costs
    return {
      id: r.id,
      staff_id: r.staff_id,
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

  // ─── Derive the period's phase from run + latest request ─────────────────
  // Each phase maps to a distinct UI:
  //   drafting              → HR editing rows; show Submit for Approval
  //   awaiting-approval     → Run submitted; show waiting banner
  //   approved-no-request   → Principal approved costing; show Request button
  //   request-submitted     → HR requested payment; Finance hasn't generated PV
  //   request-pv-generated  → Finance generated PV; awaiting Principal PV approval
  //   completed             → PV approved + executed (HR Pool funded)
  //   rejected              → Principal rejected; HR edits + re-submits
  //   legacy-paid           → Run paid under the old monolithic RPC (pre-refactor)
  type Phase =
    | 'drafting'
    | 'awaiting-approval'
    | 'approved-no-request'
    | 'request-submitted'
    | 'request-pv-generated'
    | 'completed'
    | 'rejected'
    | 'legacy-paid'

  const allDraft = gridRows.every(r => r.status === 'draft')
  const requests = requestRows ?? []
  const activeRequest = requests.find(
    r => r.status === 'submitted' || r.status === 'pv_generated' || r.status === 'completed',
  )

  let phase: Phase = 'drafting'
  if (!run) {
    phase = allDraft ? 'drafting' : 'awaiting-approval'
  } else if (run.status === 'submitted') {
    phase = 'awaiting-approval'
  } else if (run.status === 'rejected') {
    phase = 'rejected'
  } else if (run.status === 'paid') {
    phase = 'legacy-paid'
  } else if (run.status === 'approved') {
    if (!activeRequest) phase = 'approved-no-request'
    else if (activeRequest.status === 'submitted') phase = 'request-submitted'
    else if (activeRequest.status === 'pv_generated') phase = 'request-pv-generated'
    else if (activeRequest.status === 'completed') phase = 'completed'
  }

  // Build RequestState prop for the button component
  let requestState: RequestState
  if (!activeRequest) {
    requestState = { kind: 'none' }
  } else if (activeRequest.status === 'submitted') {
    requestState = {
      kind: 'submitted',
      requestId: activeRequest.id,
      requestedAt: activeRequest.requested_at,
    }
  } else if (activeRequest.status === 'pv_generated') {
    requestState = {
      kind: 'pv_generated',
      pvId: activeRequest.pv_id ?? '',
      requestId: activeRequest.id,
    }
  } else if (activeRequest.status === 'completed') {
    requestState = {
      kind: 'completed',
      pvId: activeRequest.pv_id ?? '',
      completedAt: null,
    }
  } else {
    requestState = { kind: 'cancelled' }
  }

  return (
    <div>
      {/* P1-2: prominent rejection banner so HR sees reason + date at a glance,
          not a tiny em inside the phase line. Appears only when run is rejected. */}
      {phase === 'rejected' && run ? (
        <div className="bg-danger-bg border border-danger rounded-md p-4 mb-6 flex items-start gap-3">
          <span className="font-serif italic text-danger text-xl leading-none">✕</span>
          <div className="flex-1 min-w-0">
            <p className="font-serif text-danger text-base">
              Rejected by Principal
              {run.rejected_at ? (
                <span className="font-mono text-xs text-muted ml-2">
                  · {new Date(run.rejected_at).toLocaleString('en-MY', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              ) : null}
            </p>
            {run.rejection_reason ? (
              <p className="font-serif text-sm text-graphite mt-1 whitespace-pre-wrap">
                {run.rejection_reason}
              </p>
            ) : (
              <p className="font-serif italic text-muted text-sm mt-1">
                No reason provided.
              </p>
            )}
            <p className="font-sans text-xs text-muted mt-2">
              Fix the rows below, then click <em className="font-serif">Submit for Principal approval</em> again.
            </p>
          </div>
        </div>
      ) : null}

      {/* Row 1 — title + primary CTA varies by phase */}
      <div className="flex items-baseline justify-between mt-2 mb-6 gap-6">
        <div>
          <h1 className="font-serif text-3xl text-ink">{formatPeriodLabel(period)}</h1>
          <p className="font-serif italic text-graphite text-base mt-2">
            {totals.staff} staff ·{' '}
            <PhaseLabel phase={phase} rejectionReason={run?.rejection_reason} />
          </p>
        </div>
        <PhaseCta
          phase={phase}
          period={period}
          runId={run?.id}
          totalGross={totals.gross}
          totalAmount={Number(run?.total_amount ?? totals.gross)}
          requestState={requestState}
        />
      </div>

      {/* Row 2 — secondary actions. Import is always available; Copy-from-last
          is drafting/rejected only since it overwrites rows. */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-2">
          <Link
            href={`/hr-costing/payroll/${period}/import`}
            className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-3 py-2 rounded-md transition-colors"
          >
            Import InfoTech
          </Link>
          {(phase === 'drafting' || phase === 'rejected') && (
            <CopyFromLastMonthButton period={period} />
          )}
        </div>
        <MoreActionsDropdown
          actions={[
            {
              label: 'Bank CSV (Alliance Bank)',
              href: `/hr-costing/payroll/${period}/bank-transfer?format=alliance`,
              title: 'Bulk payment file for the Alliance Bank portal',
            },
            {
              label: 'KWSP file',
              href: `/hr-costing/payroll/${period}/statutory?file=kwsp`,
            },
            {
              label: 'SOCSO file',
              href: `/hr-costing/payroll/${period}/statutory?file=socso`,
            },
            {
              label: 'EIS file',
              href: `/hr-costing/payroll/${period}/statutory?file=eis`,
            },
            {
              label: 'LHDN CP39 file',
              href: `/hr-costing/payroll/${period}/statutory?file=pcb`,
            },
          ]}
        />
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

      <PayrollGrid rows={gridRows} period={period} />
    </div>
  )
}

function PhaseLabel({
  phase,
  rejectionReason,
}: {
  phase:
    | 'drafting'
    | 'awaiting-approval'
    | 'approved-no-request'
    | 'request-submitted'
    | 'request-pv-generated'
    | 'completed'
    | 'rejected'
    | 'legacy-paid'
  rejectionReason?: string | null
}) {
  switch (phase) {
    case 'drafting':
      return <em>Drafts editable inline</em>
    case 'awaiting-approval':
      return <em>Submitted — awaiting Principal approval of costing</em>
    case 'approved-no-request':
      return <em>Costing approved — request payroll payment from Finance next</em>
    case 'request-submitted':
      return <em>Payment request sent to Finance</em>
    case 'request-pv-generated':
      return <em>PV generated by Finance — awaiting Principal approval</em>
    case 'completed':
      return <em>HR Pool funded · ready to pay staff</em>
    case 'rejected':
      return (
        <em className="text-danger">
          Rejected by Principal{rejectionReason ? ` · ${rejectionReason}` : ''} · edit and re-submit
        </em>
      )
    case 'legacy-paid':
      return <em>Completed under the old flow</em>
  }
}

function PhaseCta({
  phase,
  period,
  runId,
  totalGross,
  totalAmount,
  requestState,
}: {
  phase:
    | 'drafting'
    | 'awaiting-approval'
    | 'approved-no-request'
    | 'request-submitted'
    | 'request-pv-generated'
    | 'completed'
    | 'rejected'
    | 'legacy-paid'
  period: string
  runId?: string
  totalGross: number
  totalAmount: number
  requestState: RequestState
}) {
  if (phase === 'drafting' || phase === 'rejected') {
    return <SubmitToPrincipalButton period={period} totalAmount={totalGross} />
  }
  if (phase === 'awaiting-approval') {
    return (
      <div className="bg-surface border border-hairline rounded-md px-4 py-2 text-right">
        <em className="font-serif italic text-accent text-sm">Awaiting Principal</em>
        <div className="font-mono text-xs text-muted mt-0.5">
          RM {totalAmount.toLocaleString('en-MY', { minimumFractionDigits: 2 })}
        </div>
      </div>
    )
  }
  if (
    phase === 'approved-no-request' ||
    phase === 'request-submitted' ||
    phase === 'request-pv-generated' ||
    phase === 'completed'
  ) {
    if (!runId) return null
    return (
      <RequestPayrollPaymentButton
        runId={runId}
        totalAmount={totalAmount}
        state={requestState}
      />
    )
  }
  if (phase === 'legacy-paid') {
    return (
      <div className="bg-surface border border-ledger/40 rounded-md px-4 py-2 text-right">
        <em className="font-serif italic text-ledger text-sm">Completed</em>
        <div className="font-mono text-xs text-muted mt-0.5">
          RM {totalAmount.toLocaleString('en-MY', { minimumFractionDigits: 2 })}
        </div>
      </div>
    )
  }
  return null
}
