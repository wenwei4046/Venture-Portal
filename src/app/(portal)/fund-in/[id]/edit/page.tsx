import { officeTime } from '@/lib/office-time'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireAnyActionOn, requirePage } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import type { AccountType } from '@/lib/coa'
import { fundSourceStart } from '@/lib/repayment-start'
import type { AccountOption } from '@/components/AccountPicker'
import EditFundSourceForm from './_components/EditFundSourceForm'
import AmendFundSourceForm from './_components/AmendFundSourceForm'

interface Props {
  params: Promise<{ id: string }>
}

export default async function EditFundSourcePage({ params }: Props) {
  await requirePage('/fund-in/[id]/edit')
  // Two flows share the page: editing a pending request (Treasury · Edit) and
  // amending a booked fund source (Treasury · Approve).
  const user = await requireAnyActionOn('/fund-in/[id]/edit', ['treasury', 'edit'], ['treasury', 'approve'])
  const { id } = await params
  const supabase = await createClient()

  const [{ data: source, error }, { data: acctRows }, { data: bankRows }] = await Promise.all([
    supabase.from('fund_sources').select('*').eq('id', id).single(),
    supabase
      .from('chart_of_accounts')
      .select('code, name, type, parent_code, is_active')
      .eq('is_active', true)
      .in('type', ['liability', 'equity'])
      .order('code'),
    // Which HV bank receives the deposit (primary first = the default).
    supabase
      .from('bank_accounts')
      .select('id, bank_name, account_number, is_primary')
      .eq('status', 'active')
      .order('is_primary', { ascending: false }),
  ])

  if (error || !source) notFound()

  // Edit access:
  //  - pending_approval  → Finance edits via the create/approval flow (EditFundSourceForm)
  //  - active            → Principal amends terms directly (AmendFundSourceForm)
  //  - anything else     → frozen → bounce to detail
  const isPending = source.status === 'pending_approval' && canDo(user, 'treasury', 'edit')
  const isActiveAmend = source.status === 'active' && canDo(user, 'treasury', 'approve')
  if (!isPending && !isActiveAmend) {
    redirect(`/fund-in/${id}`)
  }

  // Resolve the read-only "from" label for context.
  let fromLabel = '—'
  if (source.from_company_id) {
    const { data: c } = await supabase.from('companies').select('name, short_code').eq('id', source.from_company_id).single()
    if (c) fromLabel = `${c.name} (${c.short_code})`
  } else if (source.from_director_id) {
    const { data: d } = await supabase.from('directors').select('name, code').eq('id', source.from_director_id).single()
    if (d) fromLabel = `${d.name} (${d.code})`
  } else if (source.from_department_id) {
    const { data: dept } = await supabase.from('departments').select('name').eq('id', source.from_department_id).single()
    if (dept) fromLabel = dept.name
  } else if ((source as { from_freetext_name: string | null }).from_freetext_name) {
    fromLabel = (source as { from_freetext_name: string }).from_freetext_name
  }

  if (isActiveAmend) {
    return (
      <div>
        <Link href={`/fund-in/${id}`} className="text-sm text-muted hover:text-accent font-sans transition-colors">← Back to fund source</Link>
        <div className="page-head">
          <div>
            <div className="page-eyebrow"><em>I.</em> TREASURY · 修改资金来源条款</div>
            <h1 className="page-title">{fromLabel}</h1>
          </div>
        </div>
        <AmendFundSourceForm
          id={source.id}
          fromLabel={fromLabel}
          ratePct={(Number(source.cost_rate) * 100).toString()}
          lockInMonths={(source.lock_in_months ?? '').toString()}
          repaymentDate={(source.repayment_date as string | null) ?? (source.effective_date as string)}
          compound={(source as { compound_interest?: boolean }).compound_interest === true}
          notes={source.notes ?? ''}
          nextMonth={officeTime().add(1, 'month').format('YYYY-MM')}
          termsFrom={((source as { terms_effective_from?: string | null }).terms_effective_from ?? null)?.slice(0, 7) ?? null}
        />
      </div>
    )
  }

  const liabilityAccounts: AccountOption[] = (acctRows ?? []).map((a) => ({
    code: a.code as string,
    name: a.name as string,
    type: a.type as AccountType,
    parent_code: (a as { parent_code: string | null }).parent_code ?? null,
    is_active: a.is_active as boolean,
  }))

  const typeLabel =
    source.source_type === 'subsidiary' ? 'Subsidiary'
    : source.source_type === 'director_loan' ? 'Director loan'
    : 'Dept pool transfer'

  return (
    <div>
      <Link href={`/fund-in/${id}`} className="text-sm text-muted hover:text-accent font-sans transition-colors">← Back to fund source</Link>
      <div className="page-head">
        <div>
          <div className="page-eyebrow"><em>I.</em> TREASURY · EDIT FUND SOURCE</div>
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
          // The repayment start the schedule goes by — unset, the month after
          // the effective date (2026-10-12, user: 应该要一样).
          repayment_date: fundSourceStart(source).date ?? (source.effective_date as string),
          notes: source.notes ?? '',
          account_code: (source as { account_code: string | null }).account_code ?? null,
          bank_account_id: (source as { bank_account_id: string | null }).bank_account_id ?? null,
        }}
        liabilityAccounts={liabilityAccounts}
        banks={(bankRows ?? []).map((b) => ({
          id: b.id as string,
          bank_name: b.bank_name as string,
          account_number: (b.account_number as string) ?? '',
          is_primary: !!b.is_primary,
        }))}
      />
    </div>
  )
}
