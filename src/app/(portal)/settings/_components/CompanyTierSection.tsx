'use client'

import { useState, useTransition } from 'react'
import { updateCompanyTier } from '../actions'
import type { Company, CompanyTier } from '@/types'

interface Props {
  companies: Company[]
}

const TIERS: CompanyTier[] = ['T1', 'T2', 'T3', 'T4']

export default function CompanyTierSection({ companies }: Props) {
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<{
    type: 'success' | 'error'
    text: string
    companyId?: string
  } | null>(null)

  function handleTierChange(companyId: string, newTier: CompanyTier, currentTier: CompanyTier) {
    if (newTier === currentTier) return

    setMessage(null)

    const formData = new FormData()
    formData.append('company_id', companyId)
    formData.append('tier', newTier)

    startTransition(async () => {
      try {
        await updateCompanyTier(formData)
        setMessage({ type: 'success', text: `Tier updated to ${newTier}`, companyId })
      } catch (err) {
        setMessage({
          type: 'error',
          text: err instanceof Error ? err.message : 'Unknown error',
          companyId,
        })
      }
    })
  }

  const active = companies.filter((c) => c.is_active)

  return (
    <section className="bg-surface border border-hairline rounded-md p-6">
      <header className="mb-5">
        <h2 className="font-serif text-xl text-ink">Company Tier Assignment</h2>
        <p className="font-serif italic text-graphite text-sm mt-0.5">
          Changing a company tier affects <em>future loans only</em>. Existing active loans keep
          their locked rate.
        </p>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
              <th className="text-left py-3 pr-3 font-medium">Company</th>
              <th className="text-left py-3 pr-3 font-medium">Short Code</th>
              <th className="text-left py-3 font-medium">Tier</th>
              <th className="py-3"></th>
            </tr>
          </thead>
          <tbody>
            {active.map((company) => (
              <tr key={company.id} className="border-b border-hairline last:border-0">
                <td className="py-3 pr-3 font-serif text-md text-ink">{company.name}</td>
                <td className="py-3 pr-3 text-graphite font-mono text-xs">{company.short_code}</td>
                <td className="py-3">
                  <select
                    defaultValue={company.tier}
                    onChange={(e) =>
                      handleTierChange(company.id, e.target.value as CompanyTier, company.tier)
                    }
                    disabled={isPending}
                    className="px-3 py-1.5 bg-paper border border-hairline rounded text-sm font-sans text-ink focus:outline-none focus:border-accent-border disabled:opacity-50"
                  >
                    {TIERS.map((tier) => (
                      <option key={tier} value={tier}>
                        {tier}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-3 pl-3">
                  {message?.companyId === company.id ? (
                    <span
                      className={
                        message.type === 'success'
                          ? 'text-xs font-serif italic text-ledger'
                          : 'text-xs font-serif italic text-danger'
                      }
                    >
                      {message.text}
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
