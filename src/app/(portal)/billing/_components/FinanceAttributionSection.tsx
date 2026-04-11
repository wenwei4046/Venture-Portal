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

// Finance Attribution: Finance dept staff (non-mgmt) × per-staff allocation %
// across subsidiaries. Sum of individual staff CTCs attributed to each company.
// PII-sensitive: raw per-staff attribution visible only to HR/Principal.
// For Finance the display is dept-level aggregate plus "per-company amounts
// computed during invoice generation".
export default function FinanceAttributionSection({ deptSummaries, submitted }: Props) {
  const finance = deptSummaries?.Finance

  return (
    <section className="border-t border-hairline pt-8">
      <h2 className="font-serif text-xl text-ink mb-4">Finance Attribution</h2>
      <p className="font-serif italic text-graphite text-sm mb-4">
        Finance department non-manager staff — each person&apos;s CTC is split
        per-company by their <em>staff allocation %</em>. Per-staff detail is
        HR + Principal only; the aggregate is Finance-safe.
      </p>

      {!submitted ? (
        <EmptyState />
      ) : !finance ? (
        <div className="border border-hairline rounded-md bg-surface p-5">
          <p className="font-serif italic text-muted text-sm">
            Finance department has no submitted staff for this period.
          </p>
        </div>
      ) : (
        <div className="border border-hairline rounded-md bg-surface p-5">
          <div className="flex items-baseline justify-between mb-3">
            <div className="font-serif text-md text-ink">Finance dept aggregate</div>
            <div className="font-mono text-xs text-muted">
              {finance.staff_count} staff (incl. mgmt)
            </div>
          </div>
          <div className="flex items-baseline justify-between font-mono text-sm">
            <em className="font-serif text-md text-ink">Total CTC across all Finance staff</em>
            <span className="text-ink tabular font-semibold">
              {formatMoney(finance.total_ctc)}
            </span>
          </div>
          <p className="font-serif italic text-muted text-xs mt-3">
            Mgmt-flagged staff cost is billed separately as Finance Mgmt Fee (below).
            Non-mgmt staff attributed per company via invoice generation.
          </p>
        </div>
      )}
    </section>
  )
}

function EmptyState() {
  return (
    <div className="border border-hairline rounded-md bg-surface p-6 text-center">
      <p className="font-serif italic text-muted text-sm">
        HR has not submitted this period yet.
      </p>
    </div>
  )
}
