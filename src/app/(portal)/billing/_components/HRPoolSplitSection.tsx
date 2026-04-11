import { formatMoney } from '@/lib/utils'

interface DeptSummary {
  department_id: string
  staff_count: number
  total_basic: number
  total_statutory: number
  total_allowance: number
  total_ctc: number
}

interface Props {
  deptSummaries: Record<string, DeptSummary> | null
  submitted: boolean
}

// Cost-to-cost billing: HR + Finance departments are split across subsidiaries
// based on hr_pool_allocation. Dept total cost × split % per company.
// The actual per-company breakdown is computed by Step 5's generate_monthly_invoices
// RPC and shown in the Invoices section once invoices are generated.
export default function HRPoolSplitSection({ deptSummaries, submitted }: Props) {
  const hr = deptSummaries?.HR
  const finance = deptSummaries?.Finance

  return (
    <section className="border-t border-hairline pt-8">
      <h2 className="font-serif text-xl text-ink mb-4">HR Pool Split</h2>
      <p className="font-serif italic text-graphite text-sm mb-4">
        HR and Finance department totals are <em>cost-to-cost</em> — split across
        subsidiaries per company allocation %.
      </p>

      {!submitted ? (
        <EmptyState reason="not-submitted" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <DeptCard label="HR" summary={hr} />
          <DeptCard label="Finance" summary={finance} />
        </div>
      )}
    </section>
  )
}

function DeptCard({ label, summary }: { label: string; summary: DeptSummary | undefined }) {
  if (!summary) {
    return (
      <div className="border border-hairline rounded-md bg-surface p-4">
        <div className="font-serif italic text-muted text-sm">{label} — no data</div>
      </div>
    )
  }

  return (
    <div className="border border-hairline rounded-md bg-surface p-5">
      <div className="flex items-baseline justify-between mb-3">
        <div className="font-serif text-md text-ink">{label} department</div>
        <div className="font-mono text-xs text-muted">{summary.staff_count} staff</div>
      </div>
      <div className="space-y-1.5 font-mono text-sm">
        <Row label="Basic" value={summary.total_basic} />
        <Row label="Statutory" value={summary.total_statutory} />
        <Row label="Allowance" value={summary.total_allowance} />
        <div className="border-t border-hairline pt-1.5 mt-1.5">
          <Row label="Total CTC" value={summary.total_ctc} bold />
        </div>
      </div>
      <p className="font-serif italic text-muted text-xs mt-3">
        Per-company amounts computed during invoice generation.
      </p>
    </div>
  )
}

function Row({ label, value, bold = false }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <em className={`font-serif ${bold ? 'text-ink text-md' : 'text-graphite text-sm'}`}>
        {label}
      </em>
      <span className={`tabular ${bold ? 'text-ink font-semibold' : 'text-graphite'}`}>
        {formatMoney(Number(value ?? 0))}
      </span>
    </div>
  )
}

function EmptyState({ reason }: { reason: 'not-submitted' }) {
  return (
    <div className="border border-hairline rounded-md bg-surface p-6 text-center">
      <p className="font-serif italic text-muted text-sm">
        {reason === 'not-submitted' ? (
          <>
            HR has not submitted this period yet. Ask HR to submit via{' '}
            <em>/hr-costing</em>.
          </>
        ) : null}
      </p>
    </div>
  )
}
