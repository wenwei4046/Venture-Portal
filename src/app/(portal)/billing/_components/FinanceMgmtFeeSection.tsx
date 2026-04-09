interface Props {
  submitted: boolean
}

// Finance Mgmt Fee: the is_mgmt_fee=true Finance staff (usually Finance Manager
// + senior). Billed as a separate line from regular Finance Attribution.
// Per-company split uses the same hr_staff_allocation table.
//
// This section is a placeholder read-only view in Step 4. The per-staff detail
// is PII-sensitive (HR + Principal only) and the per-company amounts are
// computed in Step 5 during invoice generation.
export default function FinanceMgmtFeeSection({ submitted }: Props) {
  return (
    <section className="border-t border-hairline pt-8">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="font-serif text-xl text-ink">Finance Mgmt Fee</h2>
        <span className="font-serif italic text-muted text-xs">finance_mgmt_fee</span>
      </div>
      <p className="font-serif italic text-graphite text-sm mb-4">
        Manager-only slice from the Finance department. Billed as a separate invoice
        line from regular Finance Attribution. Per-staff detail remains HR +
        Principal only.
      </p>

      <div className="border border-hairline rounded-md bg-surface p-5">
        <p className="font-serif italic text-muted text-sm">
          {submitted ? (
            <>
              Manager slice is computed during invoice generation from the submitted
              snapshot (<em>hr_staff_costs.is_mgmt_fee = true</em>).
            </>
          ) : (
            <>HR has not submitted this period yet.</>
          )}
        </p>
      </div>
    </section>
  )
}
