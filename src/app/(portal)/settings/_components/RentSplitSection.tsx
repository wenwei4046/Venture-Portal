import SplitEditor from './SplitEditor'

interface Props {
  companies: Array<{ id: string; name: string; short_code: string }>
  initial: Array<{ id?: string; company_id: string | null; is_hv_share: boolean; split_pct: number }>
}

export default function RentSplitSection({ companies, initial }: Props) {
  return (
    <section className="border border-hairline rounded-md bg-surface p-6">
      <h2 className="font-serif text-xl text-ink mb-1">Rent Split</h2>
      <p className="font-serif italic text-graphite text-sm mb-4">
        Percentage template for monthly rent allocation across subsidiaries.
        HV&apos;s share is <em>non-billable</em> — it is deducted from the operating
        fund at invoice generation time. Total must equal 100%.
      </p>
      <SplitEditor kind="rent" companies={companies} initial={initial} />
    </section>
  )
}
