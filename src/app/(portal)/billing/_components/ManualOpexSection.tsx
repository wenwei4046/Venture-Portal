'use client'

import { useState, useTransition } from 'react'
import { createOpexInvoice, type ManualOpexBillingMode } from '../actions'

interface Company {
  id: string
  name: string
  short_code: string
}

export interface ExistingInvoice {
  id: string
  invoice_no: string
  company_id: string
  total_amount: number
  status: string
}

interface Props {
  title: string
  poolLabel: string
  description: string
  billingMode: ManualOpexBillingMode
  period: string
  companies: Company[]
  existing: ExistingInvoice[]
  canCreate: boolean
}

function fmt(n: number): string {
  return n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function ManualOpexSection({
  title,
  poolLabel,
  description,
  billingMode,
  period,
  companies,
  existing,
  canCreate,
}: Props) {
  const existingByCompany = new Map(existing.map(e => [e.company_id, e]))
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [pendingCompany, setPendingCompany] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(companyId: string) {
    const raw = amounts[companyId] ?? ''
    const amount = Number(raw)
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Amount must be a positive number')
      return
    }

    const fd = new FormData()
    fd.set('company_id', companyId)
    fd.set('period_month', period)
    fd.set('billing_mode', billingMode)
    fd.set('amount', amount.toFixed(2))

    setError(null)
    setPendingCompany(companyId)
    startTransition(async () => {
      try {
        await createOpexInvoice(fd)
        setAmounts(prev => ({ ...prev, [companyId]: '' }))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Create failed')
      } finally {
        setPendingCompany(null)
      }
    })
  }

  const existingTotal = existing.reduce((acc, e) => acc + Number(e.total_amount), 0)

  return (
    <section className="mb-12">
      <div className="flex items-baseline justify-between mb-2">
        <div>
          <h2 className="font-serif text-xl text-ink">{title}</h2>
          <p className="font-serif italic text-graphite text-sm mt-0.5">
            {description} <em>Credits {poolLabel} on knock-off.</em>
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="font-mono tabular text-md text-ink">{fmt(existingTotal)}</div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted">
            {existing.length} invoice{existing.length === 1 ? '' : 's'} this period
          </div>
        </div>
      </div>

      <div className="border border-hairline rounded-md bg-surface overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans bg-paper">
              <th className="text-left py-2 px-4 font-medium">Subsidiary</th>
              <th className="text-right py-2 px-4 font-medium">Existing invoice</th>
              <th className="text-right py-2 px-4 font-medium">New amount</th>
              <th className="py-2 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {companies.map(company => {
              const existingInvoice = existingByCompany.get(company.id)
              const input = amounts[company.id] ?? ''
              const busy = pendingCompany === company.id && isPending
              return (
                <tr key={company.id} className="border-b border-hairline last:border-0">
                  <td className="py-2 px-4">
                    <div className="font-serif text-ink">{company.name}</div>
                    <div className="font-mono text-[10px] uppercase tracking-wider text-muted">
                      {company.short_code}
                    </div>
                  </td>
                  <td className="py-2 px-4 text-right">
                    {existingInvoice ? (
                      <div>
                        <div className="font-mono tabular text-ink">
                          {fmt(Number(existingInvoice.total_amount))}
                        </div>
                        <div className="font-mono text-[10px] text-muted">
                          {existingInvoice.invoice_no} · {existingInvoice.status}
                        </div>
                      </div>
                    ) : (
                      <span className="font-mono text-xs text-muted">—</span>
                    )}
                  </td>
                  <td className="py-2 px-4 text-right">
                    {existingInvoice ? (
                      <span className="font-serif italic text-muted text-xs">already billed</span>
                    ) : canCreate ? (
                      <input
                        type="text"
                        inputMode="decimal"
                        value={input}
                        onChange={e =>
                          setAmounts(prev => ({
                            ...prev,
                            [company.id]: e.target.value.replace(/[^\d.]/g, ''),
                          }))
                        }
                        disabled={busy}
                        placeholder="0.00"
                        className="w-28 bg-paper border border-hairline rounded-md px-2 py-1 text-right font-mono tabular text-sm text-ink focus:outline-none focus:border-accent-border"
                      />
                    ) : (
                      <span className="font-mono text-xs text-muted">—</span>
                    )}
                  </td>
                  <td className="py-2 px-4 text-right">
                    {!existingInvoice && canCreate ? (
                      <button
                        onClick={() => handleSubmit(company.id)}
                        disabled={busy || !(Number(input) > 0)}
                        className="bg-accent hover:bg-accent-hover text-white font-serif italic text-xs px-3 py-1.5 rounded-md disabled:opacity-50 transition-colors"
                      >
                        {busy ? 'Issuing…' : 'Issue'}
                      </button>
                    ) : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {error ? <div className="font-serif italic text-danger text-xs mt-2">{error}</div> : null}
    </section>
  )
}
