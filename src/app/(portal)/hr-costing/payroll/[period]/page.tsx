import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatMoney } from '@/lib/utils'
import PayrollGrid, { type PayrollRowData } from '../_components/PayrollGrid'
import CopyFromLastMonthButton from '../_components/CopyFromLastMonthButton'
import CreatePeriodButton from '../_components/CreatePeriodButton'
import SubmitToFinanceButton from '../_components/SubmitToFinanceButton'
import ReopenPayrollButton from '../_components/ReopenPayrollButton'
import MoreActionsDropdown from '../_components/MoreActionsDropdown'
import { deletePayrollPeriod } from '../actions'
import PeriodPicker from '../_components/PeriodPicker'
import RequestPayrollPaymentButton, {
  type RequestState,
} from '../_components/RequestPayrollPaymentButton'

interface PageProps {
  params: Promise<{ period: string }>
}

interface DirectorPayoutRow {
  id: string
  director_id: string
  status: string
  director_code: string
  director_name: string
  gross_amount: number
  payroll_gross: number
  payroll_net: number
  payroll_epf_er: number
  payroll_socso_er: number
  payroll_eis_er: number
  payroll_pcb: number
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

  // The live run is the single non-rejected one (partial unique index
  // guarantees <= 1). Rejected rows accumulate via the HR reopen flow
  // (mig 278) — the latest one drives the reopened/rejected notice.
  const [{ data: rows }, { data: run }, { data: lastRejected }, { data: directorRows }] = await Promise.all([
    supabase
      .from('hr_monthly_payroll')
      .select(`
        id, staff_id, period_month, status, source,
        basic_salary, statutory_allowance, non_statutory_allowance,
        ot_hours, ot_amount, commission_amount, unpaid_leave_days,
        deduction_amount, skbbk_amount,
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
      .neq('status', 'rejected')
      .maybeSingle(),
    supabase
      .from('payroll_runs')
      .select('id, rejection_reason, rejected_at')
      .eq('period_month', period)
      .eq('status', 'rejected')
      .order('rejected_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('director_payouts')
      .select(`
        id, director_id, status,
        gross_amount, payroll_gross, payroll_net,
        payroll_epf_er, payroll_socso_er, payroll_eis_er,
        payroll_pcb,
        directors (code, name)
      `)
      .eq('period_month', period)
      .order('director_id'),
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

  const directorPayouts: DirectorPayoutRow[] = (directorRows ?? []).map(d => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const director = (d as any).directors
    return {
      id: d.id,
      director_id: d.director_id,
      status: String(d.status),
      director_code: director?.code ?? '?',
      director_name: director?.name ?? '?',
      gross_amount: Number(d.gross_amount ?? 0),
      payroll_gross: Number(d.payroll_gross ?? 0),
      payroll_net: Number(d.payroll_net ?? 0),
      payroll_epf_er: Number(d.payroll_epf_er ?? 0),
      payroll_socso_er: Number(d.payroll_socso_er ?? 0),
      payroll_eis_er: Number(d.payroll_eis_er ?? 0),
      payroll_pcb: Number(d.payroll_pcb ?? 0),
    }
  })
  const hasDirectorPayouts = directorPayouts.length > 0

  if (!rows || rows.length === 0) {
    return (
      <div>
        <div className="page-head">
          <div>
            <div className="page-eyebrow">
              <em>I.</em> HR · PAYROLL · {formatPeriodLabel(period).toUpperCase()}
            </div>
            <h1 className="page-title">{formatPeriodLabel(period)}</h1>
            <p className="font-serif italic text-graphite text-base mt-3">
              <em>No staff rows for this period yet.</em>
            </p>
          </div>
          <div className="flex flex-col items-end gap-3">
            <PeriodPicker period={period} />
          </div>
        </div>
        {/* Act on THIS month directly — create draft rows from the staff
            master, or import the InfoTech file for this period. The picker
            above switches months. */}
        <div className="flex items-center gap-3 flex-wrap mb-12">
          <CreatePeriodButton period={period} />
          <Link
            href={`/hr-costing/payroll/${period}/import`}
            className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
          >
            Import InfoTech →
          </Link>
        </div>
        {hasDirectorPayouts && (
          <DirectorSalarySection rows={directorPayouts} period={period} />
        )}
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
      deduction_amount: Number(r.deduction_amount),
      skbbk_amount: Number(r.skbbk_amount ?? 0),
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

  // Combined totals: staff paycheck figures + director 75% payroll portion.
  // The director's 25% invoice + 5% saving do NOT flow through this page —
  // they're handled by the Director Salary engine + Invoice Pool. The
  // approval amount (Principal-side) includes the full director gross_amount
  // via the RPC, which is intentionally broader than this paycheck summary.
  const directorTotals = directorPayouts.reduce(
    (acc, d) => ({
      gross: acc.gross + d.payroll_gross,
      net: acc.net + d.payroll_net,
      epf_er: acc.epf_er + d.payroll_epf_er,
      socso_er: acc.socso_er + d.payroll_socso_er,
      eis_er: acc.eis_er + d.payroll_eis_er,
      pcb: acc.pcb + d.payroll_pcb,
    }),
    { gross: 0, net: 0, epf_er: 0, socso_er: 0, eis_er: 0, pcb: 0 },
  )

  const totals = {
    staff: gridRows.length,
    directors: directorPayouts.length,
    gross: gridRows.reduce((s, r) => s + r.gross, 0) + directorTotals.gross,
    net: gridRows.reduce((s, r) => s + r.net, 0) + directorTotals.net,
    epf_er: gridRows.reduce((s, r) => s + r.epf_er, 0) + directorTotals.epf_er,
    socso_er: gridRows.reduce((s, r) => s + r.socso_er, 0) + directorTotals.socso_er,
    eis_er: gridRows.reduce((s, r) => s + r.eis_er, 0) + directorTotals.eis_er,
    pcb: gridRows.reduce((s, r) => s + r.pcb, 0) + directorTotals.pcb,
  }
  // Cost to Company = gross + employer statutory (EPF/SOCSO/EIS ER). This is
  // HV's full cost per the source file's "TTL CTC" column and the basis on
  // which shared-services staff are recharged to the subsidiaries — the number
  // that actually matters, more than gross alone. (HRDF is not stored; it's 0
  // across HV payroll, so CTC = gross + the three employer contributions.)
  const totalCtc = totals.gross + totals.epf_er + totals.socso_er + totals.eis_er

  // ─── Derive the period's phase from run + latest request ─────────────────
  // Each phase maps to a distinct UI (no Principal approval since mig 278 —
  // Submit lands the run directly in 'approved'):
  //   drafting              → HR editing rows; show Submit to Finance
  //   awaiting-approval     → legacy-only: rows submitted but no live run
  //   approved-no-request   → Submitted to Finance; show Request + Reopen
  //   request-submitted     → HR requested payment; Finance hasn't generated PV
  //   request-pv-generated  → Finance generated PV; awaiting Principal PV approval
  //   completed             → PV approved + executed (HR Pool funded)
  //   legacy-paid           → Run paid under the old monolithic RPC (pre-refactor)
  type Phase =
    | 'drafting'
    | 'awaiting-approval'
    | 'approved-no-request'
    | 'request-submitted'
    | 'request-pv-generated'
    | 'completed'
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
  } else if (run.status === 'paid') {
    phase = 'legacy-paid'
  } else if (run.status === 'approved') {
    if (!activeRequest) phase = 'approved-no-request'
    else if (activeRequest.status === 'submitted') phase = 'request-submitted'
    else if (activeRequest.status === 'pv_generated') phase = 'request-pv-generated'
    else if (activeRequest.status === 'completed') phase = 'completed'
  }

  // Reopened / legacy-rejected notice — only relevant while back in drafting.
  const REOPEN_MARKER = 'Reopened by HR for edits'
  const showReopenedNote =
    phase === 'drafting' && lastRejected?.rejection_reason === REOPEN_MARKER
  const showLegacyRejectedNote =
    phase === 'drafting' && !!lastRejected && lastRejected.rejection_reason !== REOPEN_MARKER

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
      {/* Reopened notice — HR pulled the figures back via Reopen (mig 278). */}
      {showReopenedNote ? (
        <div className="bg-surface border border-hairline rounded-md p-4 mb-6 flex items-start gap-3">
          <span className="font-serif italic text-accent text-xl leading-none">↺</span>
          <div className="flex-1 min-w-0">
            <p className="font-serif text-ink text-base">
              Reopened for edits
              {lastRejected?.rejected_at ? (
                <span className="font-mono text-xs text-muted ml-2">
                  · {new Date(lastRejected.rejected_at).toLocaleString('en-MY', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              ) : null}
            </p>
            <p className="font-sans text-xs text-muted mt-2">
              Finance can&apos;t see this period&apos;s figures until you click{' '}
              <em className="font-serif">Submit to Finance</em> again.
            </p>
          </div>
        </div>
      ) : null}

      {/* Legacy rejection banner — runs rejected by Principal under the old
          approval flow (pre-mig 278). */}
      {showLegacyRejectedNote ? (
        <div className="bg-danger-bg border border-danger rounded-md p-4 mb-6 flex items-start gap-3">
          <span className="font-serif italic text-danger text-xl leading-none">✕</span>
          <div className="flex-1 min-w-0">
            <p className="font-serif text-danger text-base">
              Rejected by Principal
              {lastRejected?.rejected_at ? (
                <span className="font-mono text-xs text-muted ml-2">
                  · {new Date(lastRejected.rejected_at).toLocaleString('en-MY', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              ) : null}
            </p>
            {lastRejected?.rejection_reason ? (
              <p className="font-serif text-sm text-graphite mt-1 whitespace-pre-wrap">
                {lastRejected.rejection_reason}
              </p>
            ) : (
              <p className="font-serif italic text-muted text-sm mt-1">
                No reason provided.
              </p>
            )}
            <p className="font-sans text-xs text-muted mt-2">
              Fix the rows below, then click <em className="font-serif">Submit to Finance</em> again.
            </p>
          </div>
        </div>
      ) : null}

      {/* Row 1 — title + period picker + primary CTA varies by phase */}
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> HR · PAYROLL · {formatPeriodLabel(period).toUpperCase()}
          </div>
          <h1 className="page-title">{formatPeriodLabel(period)}</h1>
          <p className="font-serif italic text-graphite text-base mt-3">
            {totals.staff} staff
            {totals.directors > 0 ? ` · ${totals.directors} director${totals.directors > 1 ? 's' : ''}` : ''}
            {' · '}
            <PhaseLabel phase={phase} />
          </p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <PeriodPicker period={period} />
          <PhaseCta
            phase={phase}
            period={period}
            runId={run?.id}
            totalCtc={totalCtc}
            totalAmount={Number(run?.total_amount ?? totalCtc)}
            requestState={requestState}
          />
        </div>
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
          {phase === 'drafting' && (
            <CopyFromLastMonthButton period={period} />
          )}
          <Link
            href={`/hr-costing/allocation/${period}`}
            className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-3 py-2 rounded-md transition-colors"
            title="Split each employee's cost across subsidiaries for billing"
          >
            Billing Allocation
          </Link>
        </div>
        <MoreActionsDropdown
          dangerAction={
            phase === 'drafting' && gridRows.length > 0
              ? {
                  label: `Delete this month (${gridRows.length} rows)`,
                  confirmText:
                    `Delete ALL ${gridRows.length} draft payroll rows for ${formatPeriodLabel(period)}? ` +
                    `This wipes the whole month — use it for test/wrongly-created periods. ` +
                    `Re-create via Import InfoTech or Create Period.`,
                  action: deletePayrollPeriod.bind(null, period),
                }
              : undefined
          }
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

      {/* Summary band — staff paycheck figures + director 75% payroll portion.
          Total CTC leads: it's HV's full cost (gross + employer statutory) and
          the recharge basis to subsidiaries; gross/net are components. */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-6 mb-10 border-y border-hairline py-6">
        <div>
          <div className="font-serif italic text-graphite text-xs uppercase tracking-wide">Total CTC</div>
          <div className="num text-num-ink text-xl tracking-[-0.01em] mt-1">{formatMoney(totalCtc)}</div>
        </div>
        <div>
          <div className="font-serif italic text-graphite text-xs uppercase tracking-wide">Total Gross</div>
          <div className="num text-graphite text-md mt-1">{formatMoney(totals.gross)}</div>
        </div>
        <div>
          <div className="font-serif italic text-graphite text-xs uppercase tracking-wide">Total Net</div>
          <div className="num text-graphite text-md mt-1">{formatMoney(totals.net)}</div>
        </div>
        <div>
          <div className="font-serif italic text-graphite text-xs uppercase tracking-wide">EPF ER</div>
          <div className="num text-graphite text-md mt-1">{formatMoney(totals.epf_er)}</div>
        </div>
        <div>
          <div className="font-serif italic text-graphite text-xs uppercase tracking-wide">SOCSO+EIS ER</div>
          <div className="num text-graphite text-md mt-1">
            {formatMoney(totals.socso_er + totals.eis_er)}
          </div>
        </div>
        <div>
          <div className="font-serif italic text-graphite text-xs uppercase tracking-wide">Total PCB</div>
          <div className="num text-graphite text-md mt-1">{formatMoney(totals.pcb)}</div>
        </div>
      </div>

      <PayrollGrid rows={gridRows} period={period} />

      {hasDirectorPayouts && (
        <DirectorSalarySection rows={directorPayouts} period={period} />
      )}
    </div>
  )
}

function DirectorSalarySection({
  rows,
  period,
}: {
  rows: DirectorPayoutRow[]
  period: string
}) {
  return (
    <section className="mt-16">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <h2 className="font-serif text-2xl text-ink">Director Salary</h2>
          <p className="font-serif italic text-graphite text-sm mt-1">
            75% payroll portion · read-only here · edited via{' '}
            <Link
              href={`/director-salary?period=${period}`}
              className="text-accent hover:text-accent-hover not-italic"
            >
              Director Salary →
            </Link>
          </p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Director</th>
              <th className="right">Pool Slice</th>
              <th className="right">Gross (75%)</th>
              <th className="right">EPF ER</th>
              <th className="right">SOCSO+EIS ER</th>
              <th className="right">PCB</th>
              <th className="right">Net</th>
              <th>Status</th>
              <th className="right"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(d => (
              <tr key={d.id}>
                <td>
                  <div className="font-serif text-[15px] text-ink">{d.director_code}</div>
                  <div className="font-mono text-[11px] text-graphite mt-0.5">{d.director_name}</div>
                </td>
                <td className="num">{formatMoney(d.gross_amount)}</td>
                <td className="num">{formatMoney(d.payroll_gross)}</td>
                <td className="num">{formatMoney(d.payroll_epf_er)}</td>
                <td className="num">{formatMoney(d.payroll_socso_er + d.payroll_eis_er)}</td>
                <td className="num">{formatMoney(d.payroll_pcb)}</td>
                <td className="num font-semibold">{formatMoney(d.payroll_net)}</td>
                <td>
                  <em
                    className={`font-serif italic text-sm not-italic ${
                      d.status === 'draft'
                        ? 'text-alert'
                        : d.status === 'confirmed'
                        ? 'text-ledger'
                        : 'text-graphite'
                    }`}
                  >
                    {d.status}
                  </em>
                </td>
                <td className="right">
                  <Link
                    href={`/director-salary/${d.director_id}?period=${period}`}
                    className="text-sm text-accent hover:text-accent-hover font-serif italic"
                  >
                    Detail
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function PhaseLabel({
  phase,
}: {
  phase:
    | 'drafting'
    | 'awaiting-approval'
    | 'approved-no-request'
    | 'request-submitted'
    | 'request-pv-generated'
    | 'completed'
    | 'legacy-paid'
}) {
  switch (phase) {
    case 'drafting':
      return <em>Drafts editable inline</em>
    case 'awaiting-approval':
      return <em>Rows submitted — no live run (legacy state)</em>
    case 'approved-no-request':
      return <em>Submitted to Finance — request payroll payment next</em>
    case 'request-submitted':
      return <em>Payment request sent to Finance</em>
    case 'request-pv-generated':
      return <em>PV generated by Finance — awaiting Principal approval</em>
    case 'completed':
      return <em>HR Pool funded · ready to pay staff</em>
    case 'legacy-paid':
      return <em>Completed under the old flow</em>
  }
}

function PhaseCta({
  phase,
  period,
  runId,
  totalCtc,
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
    | 'legacy-paid'
  period: string
  runId?: string
  totalCtc: number
  totalAmount: number
  requestState: RequestState
}) {
  if (phase === 'drafting') {
    // total_amount the submit RPC computes is CTC (gross + employer statutory),
    // not gross — show that so the confirm dialog matches what Finance funds.
    return (
      <SubmitToFinanceButton period={period} totalAmount={totalCtc} />
    )
  }
  if (phase === 'awaiting-approval') {
    return (
      <div className="bg-surface border border-hairline rounded-md px-4 py-2 text-right">
        <em className="font-serif italic text-accent text-sm">Submitted</em>
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
      <div className="flex flex-col items-end gap-2">
        <RequestPayrollPaymentButton
          runId={runId}
          totalAmount={totalAmount}
          state={requestState}
        />
        {/* Reopen is valid until Finance acts. The funding request is now
            auto-filed at submit (phase 'request-submitted'); reopen_payroll_run
            auto-cancels a still-'submitted' request, and blocks once a PV is
            generated. So allow reopen through 'request-submitted', not after. */}
        {(phase === 'approved-no-request' || phase === 'request-submitted') && (
          <ReopenPayrollButton period={period} />
        )}
      </div>
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
