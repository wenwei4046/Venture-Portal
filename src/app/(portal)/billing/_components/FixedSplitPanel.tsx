// Fixed Split billing: Rent + Utility monthly total, split across subsidiaries
// using percentages that Principal configures in Settings. HV's own share is
// non-billable (deducted from hv_operating_fund).
//
// Input forms for the split percentages ship in Phase 2 Step 8. For Step 4
// this section is a placeholder explaining the mode.
export default function FixedSplitPanel() {
  return (
    <section className="border-t border-hairline pt-8">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="font-serif text-xl text-ink">Fixed Split</h2>
        <span className="font-serif italic text-muted text-xs">fixed_split</span>
      </div>
      <p className="font-serif italic text-graphite text-sm mb-4">
        Rent and utility monthly totals split across subsidiaries by percentage.
        HV&apos;s own share is <em>non-billable</em> and is deducted from the
        operating fund.
      </p>

      <div className="border border-hairline rounded-md bg-surface p-6 text-center">
        <p className="font-serif italic text-muted text-sm">
          Rent / Utility split configuration lands in Step 8 (Settings). For now,
          Finance records monthly totals directly when invoices are generated.
        </p>
      </div>
    </section>
  )
}
