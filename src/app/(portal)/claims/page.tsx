import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatMoney } from '@/lib/utils'
import dayjs from 'dayjs'
import NewClaimForm from './_components/NewClaimForm'
import ClaimActions from './_components/ClaimActions'

interface Props {
  searchParams: Promise<{ tab?: string }>
}

export default async function ClaimsPage({ searchParams }: Props) {
  const user = await requireRole(['principal', 'finance', 'hr', 'dept_manager'])
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

  return (
    <div>
      <div className="flex items-baseline justify-between mb-10">
        <div>
          <h1 className="font-serif text-3xl text-ink">Claims</h1>
          <p className="font-serif italic text-graphite text-base mt-2">
            Benefit claims (HR approves) and pool claims (Finance approves).
          </p>
        </div>
        <NewClaimForm />
      </div>

      {/* Tabs */}
      <div className="flex gap-6 border-b border-hairline mb-8 overflow-x-auto">
        <a
          href="/claims?tab=benefit"
          className={
            activeTab === 'benefit'
              ? 'pb-3 -mb-px font-serif italic text-accent border-b-2 border-accent transition-colors'
              : 'pb-3 -mb-px font-serif text-graphite hover:text-ink transition-colors'
          }
        >
          Benefit Claims <span className="font-mono text-xs text-muted ml-1">{benefitCount}</span>
        </a>
        <a
          href="/claims?tab=project"
          className={
            activeTab === 'project'
              ? 'pb-3 -mb-px font-serif italic text-accent border-b-2 border-accent transition-colors'
              : 'pb-3 -mb-px font-serif text-graphite hover:text-ink transition-colors'
          }
        >
          Pool Claims <span className="font-mono text-xs text-muted ml-1">{projectCount}</span>
        </a>
      </div>

      {/* Claims table */}
      {(!claims || claims.length === 0) ? (
        <div className="py-16 text-center border border-hairline rounded-md bg-surface">
          <p className="font-serif italic text-ledger text-lg mb-1">
            大家都很自律。
          </p>
          <p className="font-serif italic text-muted text-sm">
            No {activeTab} claims pending.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
                <th className="text-left py-3 pr-4 font-medium">Claimant</th>
                <th className="text-left py-3 pr-4 font-medium">Description</th>
                <th className="text-right py-3 pr-4 font-medium">Amount</th>
                <th className="text-left py-3 pr-4 font-medium">Status</th>
                <th className="text-left py-3 pr-4 font-medium">Date</th>
                <th className="py-3 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {claims.map(c => (
                <tr key={c.id} className="border-b border-hairline last:border-0 hover:bg-surface-2/40 transition-colors">
                  <td className="py-4 pr-4">
                    <div className="font-serif text-md text-ink">{c.claimant_name}</div>
                  </td>
                  <td className="py-4 pr-4 font-sans text-sm text-graphite">{c.description ?? '—'}</td>
                  <td className="py-4 pr-4 text-right font-mono tabular font-medium text-ink">{formatMoney(c.amount)}</td>
                  <td className="py-4 pr-4">
                    <em className={`font-serif text-sm ${
                      c.status === 'approved' ? 'text-ledger' :
                      c.status === 'rejected' ? 'text-danger' :
                      c.status === 'paid' ? 'text-graphite' : 'text-alert'
                    }`}>
                      {c.status}
                    </em>
                  </td>
                  <td className="py-4 pr-4 font-mono text-xs text-muted">
                    {dayjs(c.created_at).format('D MMM YYYY')}
                  </td>
                  <td className="py-4 text-right">
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
      )}
    </div>
  )
}
