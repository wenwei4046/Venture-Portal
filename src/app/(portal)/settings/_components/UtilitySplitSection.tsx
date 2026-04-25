import SplitEditor from './SplitEditor'

interface Props {
  companies: Array<{ id: string; name: string; short_code: string }>
  initial: Array<{ id?: string; company_id: string | null; is_hv_share: boolean; split_pct: number }>
}

export default function UtilitySplitSection({ companies, initial }: Props) {
  return (
    <section className="border border-hairline rounded-md bg-surface p-6">
      <h2 className="font-serif text-xl text-ink mb-1">Utility Split</h2>
      <SplitEditor kind="utility" companies={companies} initial={initial} />
    </section>
  )
}
