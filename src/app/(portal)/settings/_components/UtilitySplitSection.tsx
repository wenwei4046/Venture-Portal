import SplitEditor from './SplitEditor'

interface Props {
  companies: Array<{ id: string; name: string; short_code: string }>
  initial: Array<{ id?: string; company_id: string | null; is_hv_share: boolean; split_pct: number }>
}

export default function UtilitySplitSection({ companies, initial }: Props) {
  return (
    <section className="border border-hairline rounded-md bg-surface p-6">
      <h2 className="font-serif text-xl text-ink mb-1">Utility Split</h2>
      <p className="font-serif italic text-graphite text-sm mb-4">
        Percentage template for monthly utility allocation. Same mechanics as
        Rent Split. HV&apos;s share is non-billable. Total must equal 100%.
      </p>
      <SplitEditor kind="utility" companies={companies} initial={initial} />
    </section>
  )
}
