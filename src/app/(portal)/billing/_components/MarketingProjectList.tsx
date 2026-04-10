import Link from 'next/link'
import dayjs from 'dayjs'
import { formatMoney } from '@/lib/utils'

interface Contract {
  id: string
  description: string | null
  amount: number | null
  status: string
  start_date: string | null
  end_date: string | null
  company_id: string
  approved_by: string | null
}

interface Props {
  contracts: Contract[]
  companyMap: Map<string, { name: string; code: string }>
  canCreate?: boolean
}

// Marketing project billing: Finance creates a service_contract per project
// with billing_mode = 'marketing_project' and a fixed amount. The contract
// flows through Principal approval (new_contract approval type → Step 2
// approval_cascade trigger activates it). Per spec, Marketing is the only
// dept with real P&L — these contracts feed the Marketing dept pool.
export default function MarketingProjectList({ contracts, companyMap, canCreate }: Props) {
  return (
    <section className="border-t border-hairline pt-8">
      <div className="flex items-baseline justify-between mb-4">
        <div className="flex items-baseline gap-4">
          <h2 className="font-serif text-xl text-ink">Marketing Projects</h2>
          <span className="font-serif italic text-muted text-xs">marketing_project</span>
        </div>
        {canCreate && (
          <Link
            href="/billing/contracts/new"
            className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
          >
            + New contract
          </Link>
        )}
      </div>
      <p className="font-serif italic text-graphite text-sm mb-4">
        Project-based service contracts between Marketing and subsidiaries. Fixed
        amount per project, <em>Principal-approved before activation</em>.
      </p>

      {contracts.length === 0 ? (
        <div className="border border-hairline rounded-md bg-surface p-6 text-center">
          <p className="font-serif italic text-muted text-sm">
            No Marketing project contracts yet.{' '}
            {canCreate ? (
              <Link href="/billing/contracts/new" className="text-accent hover:underline">
                Create the first contract
              </Link>
            ) : (
              'Finance creates contracts via the Billing module.'
            )}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
                <th className="text-left py-3 pr-4 font-medium">Project</th>
                <th className="text-left py-3 pr-4 font-medium">Company</th>
                <th className="text-right py-3 pr-4 font-medium">Amount</th>
                <th className="text-left py-3 pr-4 font-medium">Dates</th>
                <th className="text-left py-3 pr-4 font-medium">Status</th>
                {canCreate && <th className="text-left py-3 font-medium"></th>}
              </tr>
            </thead>
            <tbody>
              {contracts.map((c) => {
                const company = companyMap.get(c.company_id)
                return (
                  <tr
                    key={c.id}
                    className="border-b border-hairline last:border-0"
                  >
                    <td className="py-3 pr-4 font-serif text-md text-ink">
                      {c.description ?? '—'}
                    </td>
                    <td className="py-3 pr-4">
                      <div className="font-serif italic text-graphite">
                        {company?.name ?? '—'}
                      </div>
                      <div className="font-mono text-xs text-muted">
                        {company?.code ?? ''}
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-right font-mono tabular font-medium text-ink">
                      {c.amount != null ? formatMoney(Number(c.amount)) : '—'}
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs text-muted">
                      {c.start_date ? dayjs(c.start_date).format('D MMM YY') : '—'}
                      {c.end_date ? ` → ${dayjs(c.end_date).format('D MMM YY')}` : ''}
                    </td>
                    <td className="py-3 pr-4">
                      <ContractStatus status={c.status} approvedBy={c.approved_by} />
                    </td>
                    {canCreate && (
                      <td className="py-3">
                        <Link
                          href={`/billing/contracts/${c.id}/edit`}
                          className="text-xs text-accent hover:underline font-sans"
                        >
                          Edit
                        </Link>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function ContractStatus({
  status,
  approvedBy,
}: {
  status: string
  approvedBy: string | null
}) {
  if (status === 'active' && !approvedBy) {
    return <em className="font-serif text-alert text-sm">pending approval</em>
  }
  if (status === 'active') {
    return <em className="font-serif text-graphite text-sm">active</em>
  }
  if (status === 'completed') {
    return <em className="font-serif text-ledger text-sm">completed</em>
  }
  return <em className="font-serif text-muted text-sm">{status}</em>
}
