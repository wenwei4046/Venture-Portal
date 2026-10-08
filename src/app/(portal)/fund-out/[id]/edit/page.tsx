import { officeTime } from '@/lib/office-time'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireAction } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import LoanAmendForm from '../_components/LoanAmendForm'

interface Props {
  params: Promise<{ id: string }>
}

export default async function LoanEditPage({ params }: Props) {
  await requireAction('treasury', 'approve')
  const { id } = await params
  const supabase = await createClient()

  const { data: loan, error } = await supabase
    .from('loans')
    .select('id, status, effective_rate, tenure_months, disbursement_date, repayment_terms, compound_interest, company_id')
    .eq('id', id)
    .single()

  if (error || !loan) notFound()
  // Only active loans can be amended in-app. Pending ones are edited via the
  // create/approval flow; terminal ones are frozen.
  if (loan.status !== 'active') redirect(`/fund-out/${id}`)

  const { data: company } = await supabase
    .from('companies')
    .select('name, short_code')
    .eq('id', loan.company_id)
    .single()

  return (
    <div>
      <Link href={`/fund-out/${id}`} className="text-sm text-muted hover:text-accent font-sans transition-colors">
        ← Back to loan
      </Link>
      <div className="page-head">
        <div>
          <div className="page-eyebrow"><em>I.</em> TREASURY · 修改贷款条款</div>
          <h1 className="page-title">{company?.name ?? '—'}</h1>
        </div>
      </div>

      <LoanAmendForm
        loanId={loan.id}
        ratePct={(Number(loan.effective_rate) * 100).toString()}
        tenureMonths={(loan.tenure_months ?? '').toString()}
        disbursementDate={(loan.disbursement_date as string | null) ?? ''}
        repaymentTerms={(loan.repayment_terms as string | null) ?? ''}
        compound={(loan as { compound_interest?: boolean }).compound_interest === true}
        nextMonth={officeTime().add(1, 'month').format('YYYY-MM')}
        termsFrom={((loan as { terms_effective_from?: string | null }).terms_effective_from ?? null)?.slice(0, 7) ?? null}
      />
    </div>
  )
}
