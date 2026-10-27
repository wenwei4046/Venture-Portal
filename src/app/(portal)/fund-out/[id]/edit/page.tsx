import { officeTime } from '@/lib/office-time'
import Link from 'next/link'
import type { SupabaseClient } from '@supabase/supabase-js'
import { notFound, redirect } from 'next/navigation'
import { requireActionOn, requireAnyActionOn, requirePage } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { latestTermsRequest } from '@/lib/terms-change-request'
import { loanAmendFacts } from '@/lib/amend-facts'
import LoanAmendForm from '../_components/LoanAmendForm'

interface Props {
  params: Promise<{ id: string }>
}

export default async function LoanEditPage({ params }: Props) {
  await requirePage('/fund-out/[id]/edit')
  // Treasury · Approve changes the terms; Treasury · Edit files the change for the Principal (2026-10-24).
  const user = await requireAnyActionOn('/fund-out/[id]/edit', ['treasury', 'approve'], ['treasury', 'edit'])
  const { id } = await params
  const supabase = await createClient()

  // The whole row: its terms (and where they began, its repayment start) feed the form's facts.
  const { data: loan, error } = await supabase.from('loans').select('*').eq('id', id).single()

  if (error || !loan) notFound()
  // Only active loans can be amended in-app. Pending ones are edited via the
  // create/approval flow; terminal ones are frozen.
  if (loan.status !== 'active') redirect(`/fund-out/${id}`)
  // One filed change at a time: while one waits, the loan's page says so (and Withdraw takes it back).
  const direct = canDo(user, 'treasury', 'approve')
  if (!direct && (await latestTermsRequest(supabase as unknown as SupabaseClient, 'loan', id))?.status === 'pending') {
    redirect(`/fund-out/${id}`)
  }

  const { data: company } = await supabase
    .from('companies')
    .select('name, short_code')
    .eq('id', loan.company_id)
    .single()
  // When it was disbursed, the first instalment, where the terms in force began, and the amounts the interest can be on —
  // read off the loan's repayments and terms history, which its viewers read (Treasury · View).
  await requireActionOn('/fund-out/[id]/edit', 'treasury', 'view')
  const facts = await loanAmendFacts(supabase as unknown as SupabaseClient, loan as Parameters<typeof loanAmendFacts>[1], company?.name ?? '—')

  return (
    <div>
      <Link href={`/fund-out/${id}`} className="text-sm text-muted hover:text-accent font-sans transition-colors">
        ← Back to loan
      </Link>
      <div className="page-head">
        <div>
          <div className="page-eyebrow"><em>I.</em> TREASURY · AMEND TERMS</div>
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
        facts={facts}
        direct={direct}
      />
    </div>
  )
}
