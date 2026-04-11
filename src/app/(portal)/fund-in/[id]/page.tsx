import Link from 'next/link'
import { notFound } from 'next/navigation'
import dayjs from 'dayjs'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney, formatMoneyBare } from '@/lib/utils'
import { markFundSourceMatured, cancelFundSource, repayFundSource } from '../actions'
import { ConfirmButton } from './_components/ConfirmButton'

interface Props {
  params: Promise<{ id: string }>
}

export default async function FundSourceDetailPage({ params }: Props) {
  const user = await requireRole(['principal', 'finance'])
  const { id } = await params

  const supabase = await createClient()

  const { data: source, error } = await supabase
    .from('fund_sources')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !source) {
    notFound()
  }

  // Resolve from-label
  let fromLabel = '—'
  let fromSubLabel = ''
  if (source.from_company_id) {
    const { data: c } = await supabase
      .from('companies')
      .select('name, short_code, tier')
      .eq('id', source.from_company_id)
      .single()
    if (c) {
      fromLabel = c.name
      fromSubLabel = `${c.short_code} · Tier ${c.tier}`
    }
  } else if (source.from_director_id) {
    const { data: d } = await supabase
      .from('directors')
      .select('name, code')
      .eq('id', source.from_director_id)
      .single()
    if (d) {
      fromLabel = d.name
      fromSubLabel = `Director ${d.code}`
    }
  }

  // Resolve repaid_by → user name for the audit block
  let repaidByName: string | null = null
  if (source.status === 'repaid' && source.repaid_by) {
    const { data: u } = await supabase
      .from('users')
      .select('name, email')
      .eq('id', source.repaid_by)
      .single()
    if (u) {
      repaidByName = u.name ?? u.email
    }
  }

  const isActive = source.status === 'active'
  const isMatured = source.status === 'matured'
  const isRepaid = source.status === 'repaid'
  const canFinanceEdit = user.role === 'finance'

  const maturityDays = source.maturity_date
    ? dayjs(source.maturity_date).diff(dayjs(), 'day')
    : null
  const monthlyInterest = Number(source.amount) * Number(source.cost_rate)

  return (
    <div>
      {/* ───────── Back link ───────── */}
      <Link
        href="/fund-in"
        className="text-sm text-muted hover:text-accent font-sans transition-colors"
      >
        ← Back to Fund IN
      </Link>

      {/* ───────── Header ───────── */}
      <div className="flex items-baseline justify-between mt-3 mb-10">
        <div>
          <p className="font-serif italic text-accent text-base mb-1">
            {source.source_type === 'subsidiary_savings'
              ? 'Subsidiary savings'
              : 'Director loan'}
          </p>
          <h1 className="font-serif text-3xl text-ink">{fromLabel}</h1>
          <p className="font-mono text-xs text-muted mt-1">
            {fromSubLabel} · Recorded{' '}
            {dayjs(source.created_at).format('D MMM YYYY')}
          </p>
        </div>
        <StatusBadge status={source.status} />
      </div>

      {/* ───────── Hero principal ───────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 mb-12 pb-12 border-b border-hairline">
        <div className="lg:col-span-7">
          <div className="font-serif italic text-graphite text-sm mb-1">
            Principal amount
          </div>
          <div className="font-serif text-[44px] md:text-hero text-ink leading-none">
            RM {formatMoney(Number(source.amount)).replace('RM ', '').replace(/\.\d{2}$/, '')}
            <span className="text-[32px] text-graphite">
              {formatMoney(Number(source.amount)).slice(-3)}
            </span>
          </div>
          <div className="font-mono text-xs text-muted mt-2">
            Effective {dayjs(source.effective_date).format('D MMMM YYYY')}
          </div>
        </div>

        <div className="lg:col-span-5 space-y-6">
          <div>
            <div className="font-serif italic text-graphite text-sm mb-1">
              Cost rate
            </div>
            <div className="font-serif text-3xl text-ink">
              {(Number(source.cost_rate) * 100).toFixed(3)}
              <span className="text-graphite text-xl">% /mo</span>
            </div>
            <div className="font-mono text-xs text-muted mt-1">
              Monthly interest{' '}
              <span className="text-ink">{formatMoney(monthlyInterest)}</span>
            </div>
          </div>

          <div>
            <div className="font-serif italic text-graphite text-sm mb-1">
              {source.lock_in_months ? 'Maturity' : 'No lock-in'}
            </div>
            {source.maturity_date ? (
              <>
                <div className="font-serif text-xl text-ink">
                  {dayjs(source.maturity_date).format('D MMMM YYYY')}
                </div>
                {isActive && maturityDays !== null ? (
                  <div
                    className={
                      maturityDays < 0
                        ? 'font-serif italic text-alert text-sm mt-1'
                        : maturityDays <= 30
                          ? 'font-serif italic text-alert text-sm mt-1'
                          : 'font-mono text-xs text-muted mt-1'
                    }
                  >
                    {maturityDays < 0
                      ? `past maturity by ${Math.abs(maturityDays)}d`
                      : `${maturityDays}d remaining`}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="font-serif italic text-muted text-sm">
                No maturity date
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ───────── Notes ───────── */}
      {source.notes ? (
        <section className="mb-12">
          <h2 className="font-serif text-xl text-ink mb-2">Notes</h2>
          <p className="font-serif italic text-graphite text-md max-w-3xl whitespace-pre-wrap">
            {source.notes}
          </p>
        </section>
      ) : null}

      {/* ───────── Repayment audit ───────── */}
      {isRepaid && source.repaid_at ? (
        <section className="mb-12 border-l-2 border-ledger pl-4 py-2 max-w-3xl">
          <h2 className="font-serif text-xl text-ink mb-1">Repayment</h2>
          <p className="font-serif text-md text-ink">
            Principal of{' '}
            <span className="font-mono tabular">
              {formatMoney(Number(source.amount))}
            </span>{' '}
            marked repaid on{' '}
            <em className="font-serif italic text-ledger">
              {dayjs(source.repaid_at).format('D MMM YYYY')}
            </em>
            {repaidByName ? (
              <>
                {' '}by <em className="font-serif italic text-ledger">{repaidByName}</em>
              </>
            ) : null}
            .
          </p>
          <p className="font-mono text-xs text-muted mt-2">
            Recorded {dayjs(source.repaid_at).format('D MMM YYYY, HH:mm')} · Full
            state-transition history in <code>config_audit_log</code>
          </p>
        </section>
      ) : null}

      {/* ───────── Interest payment history (placeholder for now) ───────── */}
      <section className="mb-12">
        <h2 className="font-serif text-xl text-ink mb-1">Interest payments</h2>
        <p className="font-serif italic text-graphite text-sm mb-4">
          Monthly interest HV owes on this capital,{' '}
          <em>paid via monthly consolidated statement</em>
        </p>
        <div className="border border-hairline rounded-md bg-surface p-8 text-center">
          <p className="font-serif italic text-muted text-sm">
            Interest payment history loads once monthly statements are generated (Step 8)
          </p>
        </div>
      </section>

      {/* ───────── Actions ───────── */}
      {canFinanceEdit && (isActive || isMatured) ? (
        <section className="border-t border-hairline pt-8">
          <h2 className="font-serif text-xl text-ink mb-1">Actions</h2>
          <p className="font-serif italic text-graphite text-sm mb-4">
            Finance only. Changes are recorded in the audit trail.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            {isActive && source.maturity_date && maturityDays !== null && maturityDays <= 0 ? (
              <form action={markFundSourceMatured}>
                <input type="hidden" name="id" value={source.id} />
                <button
                  type="submit"
                  className="bg-alert hover:opacity-90 text-white font-serif italic text-sm px-4 py-2 rounded-md transition-opacity"
                >
                  Mark as matured
                </button>
              </form>
            ) : null}

            <ConfirmButton
              id={source.id}
              action={repayFundSource}
              confirmMessage={`Confirm: HV has actually wired RM ${formatMoneyBare(Number(source.amount))} back to ${fromLabel}?\n\nThis cannot be undone. The source will no longer count toward HV's paid-capital pool or weighted cost.`}
              className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
            >
              Mark as repaid
            </ConfirmButton>

            {isActive ? (
              <form action={cancelFundSource}>
                <input type="hidden" name="id" value={source.id} />
                <button
                  type="submit"
                  className="text-sm text-muted hover:text-danger font-sans transition-colors px-2"
                >
                  Cancel this entry
                </button>
              </form>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'active') {
    return <span className="font-serif italic text-graphite text-md">active</span>
  }
  if (status === 'matured') {
    return <span className="font-serif italic text-alert text-md">matured</span>
  }
  if (status === 'repaid') {
    return <span className="font-serif italic text-ledger text-md">repaid</span>
  }
  return <span className="font-serif italic text-muted text-md">cancelled</span>
}
