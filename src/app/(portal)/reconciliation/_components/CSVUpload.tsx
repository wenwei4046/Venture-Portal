'use client'

import { useState, useTransition } from 'react'
import { reconcileBankStatement, type ReconciliationResult } from '../actions'
import { formatMoney } from '@/lib/utils'

export default function CSVUpload() {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ReconciliationResult | null>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)
    setResult(null)

    const reader = new FileReader()
    reader.onload = () => {
      const csvText = reader.result as string
      startTransition(async () => {
        try {
          const res = await reconcileBankStatement(csvText)
          setResult(res)
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to process CSV')
        }
      })
    }
    reader.readAsText(file)
  }

  return (
    <div>
      {/* Upload area */}
      <div className="border border-hairline rounded-md bg-surface p-6 max-w-xl">
        <label className="block text-sm font-sans font-medium text-graphite mb-3">
          Upload Bank Statement CSV
        </label>
        <input
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          disabled={isPending}
          className="block w-full text-sm text-graphite font-sans
            file:mr-4 file:py-2 file:px-4 file:rounded-md file:border file:border-hairline
            file:text-sm file:font-serif file:italic file:text-accent file:bg-paper
            file:cursor-pointer file:transition-colors file:hover:bg-accent-bg
            disabled:opacity-50"
        />
        <p className="font-mono text-xs text-muted mt-2">
          Supports: Date, Description, Debit, Credit, Balance columns
        </p>
        {isPending && <p className="font-serif italic text-accent text-sm mt-3">Processing...</p>}
        {error && (
          <div className="bg-danger-bg border border-danger text-danger rounded-md p-2 mt-3 text-xs font-sans">
            {error}
          </div>
        )}
      </div>

      {/* Results */}
      {result && (
        <div className="mt-8 space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="border border-hairline rounded-md bg-surface p-5">
              <div className="font-serif italic text-accent text-sm mb-1">Bank Balance</div>
              <div className="font-serif text-2xl text-ink leading-none">
                {formatMoney(result.bankBalance)}
              </div>
              <p className="font-mono text-xs text-muted mt-2">
                From CSV (last row)
              </p>
            </div>

            <div className="border border-hairline rounded-md bg-surface p-5">
              <div className="font-serif italic text-accent text-sm mb-1">Portal Balance</div>
              <div className="font-serif text-2xl text-ink leading-none">
                {formatMoney(result.portalBalance)}
              </div>
              <p className="font-mono text-xs text-muted mt-2">
                Deposits - Loans outstanding
              </p>
            </div>

            <div className="border border-hairline rounded-md bg-surface p-5">
              <div className="font-serif italic text-accent text-sm mb-1">Difference</div>
              <div className={`font-serif text-2xl leading-none ${
                Math.abs(result.difference) < 0.01 ? 'text-ledger' : 'text-danger'
              }`}>
                {Math.abs(result.difference) < 0.01
                  ? 'Balanced'
                  : formatMoney(result.difference)}
              </div>
              <p className="font-mono text-xs text-muted mt-2">
                {result.matched} matched · {result.unmatched} unmatched
              </p>
            </div>
          </div>

          {/* Transaction table */}
          <section>
            <h2 className="font-serif text-2xl text-ink mb-1">Bank Transactions</h2>
            <p className="font-serif italic text-graphite text-sm mb-6">
              {result.bankTransactions.length} rows imported from CSV.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
                    <th className="text-left py-3 pr-4 font-medium">Date</th>
                    <th className="text-left py-3 pr-4 font-medium">Description</th>
                    <th className="text-right py-3 pr-4 font-medium">Debit</th>
                    <th className="text-right py-3 pr-4 font-medium">Credit</th>
                    <th className="text-right py-3 pr-4 font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {result.bankTransactions.slice(0, 50).map((t, i) => (
                    <tr key={i} className="border-b border-hairline last:border-0 hover:bg-surface-2/40 transition-colors">
                      <td className="py-4 pr-4 font-mono text-xs text-muted">{t.date}</td>
                      <td className="py-4 pr-4 font-sans text-sm text-graphite">{t.description}</td>
                      <td className="py-4 pr-4 text-right font-mono tabular font-medium text-danger">
                        {t.debit > 0 ? formatMoney(-t.debit) : ''}
                      </td>
                      <td className="py-4 pr-4 text-right font-mono tabular font-medium text-ledger">
                        {t.credit > 0 ? `+${formatMoney(t.credit)}` : ''}
                      </td>
                      <td className="py-4 pr-4 text-right font-mono tabular font-medium text-ink font-semibold">
                        {formatMoney(t.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {result.bankTransactions.length > 50 && (
                <p className="font-mono text-xs text-muted mt-3">
                  Showing first 50 of {result.bankTransactions.length} transactions.
                </p>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
