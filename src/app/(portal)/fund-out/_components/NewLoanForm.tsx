'use client'

import { useState, useTransition, useMemo } from 'react'
import { createLoan } from '../actions'
import type { Company, CompanyTier, TierConfig } from '@/types'

interface Props {
  companies: Company[]
  tiers: TierConfig[]
  baseRate: { rate: number; quarter: string }
}

export default function NewLoanForm({ companies, tiers, baseRate }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [companyId, setCompanyId] = useState<string>('')

  // Build tier → premium map
  const tierMap = useMemo(() => {
    const map = new Map<CompanyTier, number>()
    tiers.forEach((t) => map.set(t.tier, Number(t.premium_rate)))
    return map
  }, [tiers])

  const selectedCompany = companies.find((c) => c.id === companyId)
  const selectedTier = selectedCompany?.tier
  const tierPremium = selectedTier ? (tierMap.get(selectedTier) ?? 0) : 0
  const effectiveRate = baseRate.rate + tierPremium

  async function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      try {
        await createLoan(formData)
      } catch (err) {
        if (err instanceof Error && err.message.includes('NEXT_REDIRECT')) {
          throw err
        }
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    })
  }

  return (
    <form
      action={handleSubmit}
      className="bg-surface border border-hairline rounded-md p-8 max-w-3xl"
    >
      {/* ───────── Company ───────── */}
      <div className="mb-6">
        <label
          htmlFor="company_id"
          className="block text-sm font-sans font-medium text-graphite mb-1.5"
        >
          Borrower
        </label>
        <select
          id="company_id"
          name="company_id"
          required
          value={companyId}
          onChange={(e) => setCompanyId(e.target.value)}
          className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
        >
          <option value="">Select a subsidiary…</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.short_code}) · Tier {c.tier}
            </option>
          ))}
        </select>
      </div>

      {/* ───────── Rate preview (read-only) ───────── */}
      {selectedCompany ? (
        <div className="mb-6 p-4 bg-paper border border-hairline rounded-md">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-xs text-muted uppercase tracking-wide font-sans mb-1">
                Base rate
              </div>
              <div className="font-mono tabular text-ink">
                {(baseRate.rate * 100).toFixed(3)}%
              </div>
              <div className="text-xs text-muted font-mono">{baseRate.quarter}</div>
            </div>
            <div>
              <div className="text-xs text-muted uppercase tracking-wide font-sans mb-1">
                Tier premium
              </div>
              <div className="font-mono tabular text-ink">
                +{(tierPremium * 100).toFixed(3)}%
              </div>
              <div className="text-xs text-muted font-mono">Tier {selectedTier}</div>
            </div>
            <div className="sm:col-span-2">
              <div className="text-xs text-accent uppercase tracking-wide font-sans mb-1">
                Locked effective rate
              </div>
              <div className="font-serif text-xl text-ink">
                {(effectiveRate * 100).toFixed(3)}
                <span className="text-graphite text-base">% /mo</span>
              </div>
              <div className="text-xs text-muted italic font-serif">
                Immutable after submission
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* ───────── Principal ───────── */}
      <div className="mb-6">
        <label
          htmlFor="principal"
          className="block text-sm font-sans font-medium text-graphite mb-1.5"
        >
          Principal amount
        </label>
        <div className="relative max-w-sm">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted font-mono">
            RM
          </span>
          <input
            id="principal"
            name="principal"
            type="number"
            step="0.01"
            min="0.01"
            max="100000000"
            required
            className="w-full pl-10 pr-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono tabular text-ink focus:outline-none focus:border-accent-border"
            placeholder="100000.00"
          />
        </div>
        <p className="font-serif italic text-muted text-xs mt-1.5">
          Loan principal in MYR (ceiling RM 100M)
        </p>
      </div>

      {/* ───────── Repayment terms ───────── */}
      <div className="mb-6">
        <label
          htmlFor="repayment_terms"
          className="block text-sm font-sans font-medium text-graphite mb-1.5"
        >
          Repayment terms{' '}
          <span className="text-muted font-normal">(optional)</span>
        </label>
        <textarea
          id="repayment_terms"
          name="repayment_terms"
          rows={3}
          className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent-border"
          placeholder="e.g., Interest monthly, principal bullet at 12 months. Or reference a signed term sheet."
        />
      </div>

      {/* ───────── Interest preview ───────── */}
      {selectedCompany ? (
        <div className="mb-6 font-serif italic text-graphite text-sm">
          At a typical <em>RM 100,000</em> principal, monthly interest would be{' '}
          <span className="font-mono not-italic text-ink tabular">
            RM {(100000 * effectiveRate).toLocaleString('en-MY', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        </div>
      ) : null}

      {/* ───────── Error ───────── */}
      {error ? (
        <div className="bg-danger-bg border border-danger text-danger rounded-md p-3 mb-6 text-sm font-sans">
          {error}
        </div>
      ) : null}

      {/* ───────── Actions ───────── */}
      <div className="flex items-center gap-4 pt-4 border-t border-hairline">
        <button
          type="submit"
          disabled={isPending || !companyId}
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-5 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? 'Submitting…' : 'Submit for approval'}
        </button>
        <a
          href="/fund-out"
          className="text-sm text-graphite hover:text-ink font-sans transition-colors"
        >
          Cancel
        </a>
        <span className="text-xs text-muted italic font-serif ml-auto">
          Principal must approve before disbursement
        </span>
      </div>
    </form>
  )
}
