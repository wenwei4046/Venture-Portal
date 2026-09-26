import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { formatMoney } from '@/lib/utils'
import dayjs from 'dayjs'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import NewClaimForm from './_components/NewClaimForm'
import ClaimActions from './_components/ClaimActions'

interface Props {
  searchParams: Promise<{ tab?: string }>
}

// A status is a word on a wash (DESIGN.md › "Sheet theme"): amber waits on
// an approver, green is approved, red was refused, grey is paid and closed.
const STATUS_CHIP: Record<string, string> = {
  pending: 'chip alert',
  approved: 'chip ledger',
  rejected: 'chip danger',
  paid: 'chip info',
}

export default async function ClaimsPage({ searchParams }: Props) {
  const user = await requirePermission('claims')
  const supabase = await createClient()

  const { tab } = await searchParams
  const activeTab = tab === 'project' ? 'project' : 'benefit'

  const { data: claims } = await supabase
    .from('claims')
    .select('*')
    .eq('claim_type', activeTab)
    .order('created_at', { ascending: false })
    .limit(50)

  const benefitCount = (await supabase.from('claims').select('id', { count: 'exact', head: true }).eq('claim_type', 'benefit')).count ?? 0
  const projectCount = (await supabase.from('claims').select('id', { count: 'exact', head: true }).eq('claim_type', 'project')).count ?? 0

  // The summary cards are read off the claims already on the page — the
  // latest 50 of this type — and say so when there are more than that.
  const shown = claims ?? []
  const byStatus = (status: string) => {
    const rows = shown.filter(c => c.status === status)
    return { count: rows.length, amount: rows.reduce((sum, c) => sum + Number(c.amount), 0) }
  }
  const pending = byStatus('pending')
  const approved = byStatus('approved')
  const paid = byStatus('paid')
  const typeName = activeTab === 'project' ? 'Pool' : 'Benefit'
  const typeTotal = activeTab === 'project' ? projectCount : benefitCount
  const countOf = (n: number) => `${n} ${n === 1 ? 'claim' : 'claims'}`

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> CLAIMS · BENEFIT &amp; POOL
          </div>
          <h1 className="page-title">Claims</h1>
        </div>
        <NewClaimForm />
      </div>

      {/* Tabs — plain links, so a switch is a full page load as before. */}
      <nav className="sheet-tabs" aria-label="Claim type">
        <a href="/claims?tab=benefit" aria-current={activeTab === 'benefit' ? 'page' : undefined}>
          Benefit Claims <span className="sheet-count">{benefitCount}</span>
        </a>
        <a href="/claims?tab=project" aria-current={activeTab === 'project' ? 'page' : undefined}>
          Pool Claims <span className="sheet-count">{projectCount}</span>
        </a>
      </nav>

      {/* Claims table */}
      {(!claims || claims.length === 0) ? (
        <div className="border border-hairline rounded-card bg-surface-2 p-6 text-center">
          <p className="text-md font-bold mb-1">
            大家都很自律。
          </p>
          <p className="text-sm">
            No {activeTab} claims pending.
          </p>
        </div>
      ) : (
        <>
          <StatCards
            label={`${typeName} claims by status`}
            note={shown.length < typeTotal ? `Latest ${shown.length} of ${typeTotal} ${typeName.toLowerCase()} claims` : undefined}
          >
            <StatCard label="Awaiting approval" value={formatMoney(pending.amount)} icon="clock" tone="primary" note={countOf(pending.count)} />
            <StatCard label="Approved, to pay" value={formatMoney(approved.amount)} icon="check" note={countOf(approved.count)} />
            <StatCard label="Paid" value={formatMoney(paid.amount)} icon="wallet" note={countOf(paid.count)} />
          </StatCards>

          <div className="overflow-x-auto">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Claimant</th>
                  <th>Description</th>
                  <th className="right">Amount</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th className="right"></th>
                </tr>
              </thead>
              <tbody>
                {claims.map(c => (
                  <tr key={c.id}>
                    <td className="font-medium">{c.claimant_name}</td>
                    <td>{c.description ?? '—'}</td>
                    <td className="num">{formatMoney(c.amount)}</td>
                    <td>
                      <span className={STATUS_CHIP[c.status] ?? 'chip'}>
                        <span className="dot" />
                        {c.status}
                      </span>
                    </td>
                    <td className="font-mono text-xs">
                      {dayjs(c.created_at).format('D MMM YYYY')}
                    </td>
                    <td className="right">
                      {(c.status === 'pending' || c.status === 'approved') && (
                        <ClaimActions
                          claimId={c.id}
                          claimType={c.claim_type as 'project' | 'benefit'}
                          claimStatus={c.status}
                          userRole={user.role}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
