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
    <section className="bg-white rounded-md border border-slate-200 p-5">
      <header className="mb-4">
        <h2 className="text-base font-semibold text-slate-900">Company Tier Assignment</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Changing a company tier affects{' '}
          <span className="font-medium">future loans only</span>. Existing active loans keep their
          locked rate.
        </p>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th className="text-left py-2 pr-3 font-medium">Company</th>
              <th className="text-left py-2 pr-3 font-medium">Short Code</th>
              <th className="text-left py-2 font-medium">Tier</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {active.map((company) => (
              <tr key={company.id} className="border-b border-slate-100 last:border-0">
                <td className="py-3 pr-3 text-slate-900">{company.name}</td>
                <td className="py-3 pr-3 text-slate-600 font-mono text-xs">{company.short_code}</td>
                <td className="py-3">
                  <select
                    defaultValue={company.tier}
                    onChange={(e) =>
                      handleTierChange(company.id, e.target.value as CompanyTier, company.tier)
                    }
                    disabled={isPending}
                    className="px-2 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 disabled:opacity-50"
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
                      className={`text-xs ${
                        message.type === 'success' ? 'text-green-700' : 'text-red-700'
                      }`}
                    >
                      {message.type === 'success' ? '✓' : '✗'} {message.text}
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
