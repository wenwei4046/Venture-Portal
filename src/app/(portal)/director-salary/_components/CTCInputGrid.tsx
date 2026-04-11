'use client'

import { useState, useTransition } from 'react'
import { batchSaveCTC, type BatchCTCInput } from '../actions'
import { formatMoney } from '@/lib/utils'

interface Director {
  id: string
  code: string
  name: string
}

interface Company {
  id: string
  name: string
  short_code: string
}

interface ExistingCTC {
  director_id: string
  company_id: string
  basic: number
  kpi: number
  allowance: number
  employer_epf: number | null
  employer_socso: number | null
  employer_eis: number | null
  total_ctc: number | null
}

interface Props {
  directors: Director[]
  companies: Company[]
  existingCTC: ExistingCTC[]
  period: string
}

export default function CTCInputGrid({ directors, companies, existingCTC, period }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Aggregate existing CTC by company (sum across all directors)
  const [values, setValues] = useState<Record<string, { basic: number; kpi: number; allowance: number }>>(() => {
    const map: Record<string, { basic: number; kpi: number; allowance: number }> = {}
    for (const ctc of existingCTC) {
      const key = ctc.company_id
      if (!map[key]) map[key] = { basic: 0, kpi: 0, allowance: 0 }
      map[key].basic += ctc.basic
      map[key].kpi += ctc.kpi
      map[key].allowance += ctc.allowance
    }
    return map
  })

  // Use first director as the "pool input" director for DB storage
  const poolDirectorId = directors[0]?.id ?? ''

  function getValue(compId: string, field: 'basic' | 'kpi' | 'allowance') {
    return values[compId]?.[field] ?? 0
  }

  function setValue(compId: string, field: 'basic' | 'kpi' | 'allowance', val: number) {
    setValues(prev => ({
      ...prev,
      [compId]: { ...prev[compId] ?? { basic: 0, kpi: 0, allowance: 0 }, [field]: val },
    }))
    setSaved(false)
  }

  // Totals
  const companyRows = companies.map(c => ({
    ...c,
    basic: getValue(c.id, 'basic'),
    kpi: getValue(c.id, 'kpi'),
    allowance: getValue(c.id, 'allowance'),
  }))
  const totalBasic = companyRows.reduce((s, c) => s + c.basic, 0)
  const totalKpi = companyRows.reduce((s, c) => s + c.kpi, 0)
  const totalAllow = companyRows.reduce((s, c) => s + c.allowance, 0)
  const grandTotal = totalBasic + totalKpi + totalAllow

  // Aggregate statutory by company (from existing data)
  const companyStatutory = companies.map(c => {
    const rows = existingCTC.filter(e => e.company_id === c.id)
    return {
      companyId: c.id,
      epfEr: rows.reduce((s, r) => s + (r.employer_epf ?? 0), 0),
      socsoEr: rows.reduce((s, r) => s + (r.employer_socso ?? 0), 0),
      eisEr: rows.reduce((s, r) => s + (r.employer_eis ?? 0), 0),
    }
  })

  function handleSave() {
    setError(null)
    setSaved(false)

    // Save all company entries under the pool director
    const records: BatchCTCInput[] = []
    for (const comp of companies) {
      const basic = getValue(comp.id, 'basic')
      const kpi = getValue(comp.id, 'kpi')
      const allowance = getValue(comp.id, 'allowance')
      if (basic > 0 || kpi > 0 || allowance > 0) {
        records.push({
          directorId: poolDirectorId,
          companyId: comp.id,
          basic, kpi, allowance,
        })
      }
    }

    startTransition(async () => {
      try {
        await batchSaveCTC(period, records)
        setSaved(true)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    })
  }

  return (
    <div>
      {/* CTC Input Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
              <th className="text-left py-3 pr-4 font-medium">Company</th>
              <th className="text-right py-3 pr-4 font-medium">Basic</th>
              <th className="text-right py-3 pr-4 font-medium">KPI</th>
              <th className="text-right py-3 pr-4 font-medium">Allowance</th>
              <th className="text-right py-3 pr-4 font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {companies.map(comp => {
              const b = getValue(comp.id, 'basic')
              const k = getValue(comp.id, 'kpi')
              const a = getValue(comp.id, 'allowance')
              return (
                <tr key={comp.id} className="border-b border-hairline last:border-0">
                  <td className="py-3 pr-4">
                    <div className="font-serif text-md text-ink">{comp.name}</div>
                    <div className="font-mono text-xs text-muted">{comp.short_code}</div>
                  </td>
                  {(['basic', 'kpi', 'allowance'] as const).map(field => (
                    <td key={field} className="py-3 pr-4">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={getValue(comp.id, field) || ''}
                        onChange={e => setValue(comp.id, field, parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                        className="w-28 px-2 py-1.5 bg-paper border border-hairline rounded-md text-sm font-mono tabular font-medium text-ink text-right focus:outline-none focus:border-accent-border"
                      />
                    </td>
                  ))}
                  <td className="py-3 pr-4 text-right font-mono tabular font-medium text-ink">
                    {(b + k + a) > 0 ? formatMoney(b + k + a).replace('RM ', '') : '—'}
                  </td>
                </tr>
              )
            })}
            {/* Total row */}
            <tr className="border-t-2 border-hairline">
              <td className="py-3 pr-4 font-serif italic text-accent text-base">Director Pool Total</td>
              <td className="py-3 pr-4 text-right font-mono tabular font-medium text-ink font-semibold">
                {formatMoney(totalBasic).replace('RM ', '')}
              </td>
              <td className="py-3 pr-4 text-right font-mono tabular font-medium text-ink font-semibold">
                {formatMoney(totalKpi).replace('RM ', '')}
              </td>
              <td className="py-3 pr-4 text-right font-mono tabular font-medium text-ink font-semibold">
                {formatMoney(totalAllow).replace('RM ', '')}
              </td>
              <td className="py-3 pr-4 text-right font-mono tabular font-medium text-accent font-semibold">
                {formatMoney(grandTotal).replace('RM ', '')}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Auto-calculated Statutory ER (read-only) */}
      {companyStatutory.some(s => s.epfEr > 0) && (
        <div className="mt-6 border-t border-hairline pt-4">
          <h3 className="font-serif italic text-sm text-graphite mb-2">Employer Statutory (auto-calculated after save)</h3>
          <div className="flex gap-6 text-sm font-mono tabular font-medium text-graphite">
            <span>EPF ER: {formatMoney(companyStatutory.reduce((s, c) => s + c.epfEr, 0))}</span>
            <span>SOCSO ER: {formatMoney(companyStatutory.reduce((s, c) => s + c.socsoEr, 0))}</span>
            <span>EIS ER: {formatMoney(companyStatutory.reduce((s, c) => s + c.eisEr, 0))}</span>
          </div>
        </div>
      )}

      {/* Save + Error */}
      <div className="mt-6 flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? 'Saving...' : 'Save CTC'}
        </button>
        {saved && <span className="text-sm font-serif italic text-ledger">Saved.</span>}
        {error && <span className="text-sm font-serif italic text-danger">{error}</span>}
      </div>
    </div>
  )
}
