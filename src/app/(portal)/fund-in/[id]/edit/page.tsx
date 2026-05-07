import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import EditFundSourceForm from './_components/EditFundSourceForm'

interface Props {
  params: Promise<{ id: string }>
}

export default async function EditFundSourcePage({ params }: Props) {
  await requireRole(['finance'])
  const { id } = await params
  const supabase = await createClient()

  const { data: source, error } = await supabase
    .from('fund_sources')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !source) notFound()

  // Only pending_approval is editable. Anything else → bounce back to the
  // detail view so Finance sees the current frozen state.
  if (source.status !== 'pending_approval') {
    redirect(`/fund-in/${id}`)
  }

  // Resolve the read-only "from" label so the form can show context without
  // exposing an editable selector (source_type + from_*_id are locked).
  let fromLabel = '—'
  if (source.from_company_id) {
    const { data: c } = await supabase
      .from('companies')
      .select('name, short_code')
      .eq('id', source.from_company_id)
      .single()
    if (c) fromLabel = `${c.name} (${c.short_code})`
  } else if (source.from_director_id) {
    const { data: d } = await supabase
      .from('directors')
      .select('name, code')
      .eq('id', source.from_director_id)
      .single()
    if (d) fromLabel = `${d.name} (${d.code})`
  } else if (source.from_department_id) {
    const { data: dept } = await supabase
      .from('departments')
      .select('name')
      .eq('id', source.from_department_id)
      .single()
    if (dept) fromLabel = dept.name
  }

  const typeLabel =
    source.source_type === 'subsidiary' ? 'Subsidiary'
    : source.source_type === 'director_loan' ? 'Director loan'
    : 'Dept pool transfer'

  return (
    <div>
      <Link
        href={`/fund-in/${id}`}
        className="text-sm text-muted hover:text-accent font-sans transition-colors"
      >
        ← Back to fund source
      </Link>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> TREASURY · EDIT FUND SOURCE
          </div>
          <h1 className="page-title">Edit fund source</h1>
        </div>
      </div>

      <EditFundSourceForm
        id={source.id}
        typeLabel={typeLabel}
        fromLabel={fromLabel}
        initial={{
          amount: Number(source.amount),
          cost_rate_percent: Number(source.cost_rate) * 100,
          lock_in_months: source.lock_in_months ?? 12,
          effective_date: source.effective_date as string,
          repayment_date: (source.repayment_date as string | null) ?? source.effective_date as string,
          notes: source.notes ?? '',
        }}
      />
    </div>
  )
}
