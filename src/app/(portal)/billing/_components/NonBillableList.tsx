// Non-billable: group-level expenses that don't belong to any subsidiary,
// deducted from hv_operating_fund instead of invoiced. Examples: company
// retreat, brand upgrade, HV's own rent share.
//
// For Step 4 this is a read-only placeholder. Entry forms land later.
export default function NonBillableList() {
  return (
    <section className="border-t border-hairline pt-8">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="font-serif text-xl text-ink">Non-billable</h2>
        <span className="font-serif italic text-muted text-xs">non_billable</span>
      </div>
      <p className="font-serif italic text-graphite text-sm mb-4">
        Group-level expenses deducted from the HV operating fund instead of
        invoiced. HV&apos;s rent share lands here automatically.
      </p>

      <div className="border border-hairline rounded-md bg-surface p-6 text-center">
        <p className="font-serif italic text-muted text-sm">
          Non-billable entry form lands in a future phase. Automatic deductions
          from invoice generation (HV rent share, etc.) already flow through
          <em> hv_operating_fund</em>.
        </p>
      </div>
    </section>
  )
}
