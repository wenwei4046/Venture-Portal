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
  const [selectedDirector, setSelectedDirector] = useState(directors[0]?.id ?? '')

  // Build editable state from existing CTC
  const [values, setValues] = useState<Record<string, { basic: number; kpi: number; allowance: number }>>(() => {
    const map: Record<string, { basic: number; kpi: number; allowance: number }> = {}
    for (const ctc of existingCTC) {
      const key = `${ctc.director_id}:${ctc.company_id}`
      map[key] = { basic: ctc.basic, kpi: ctc.kpi, allowance: ctc.allowance }
    }
    return map
  })

  const director = directors.find(d => d.id === selectedDirector)

  function getValue(dirId: string, compId: string, field: 'basic' | 'kpi' | 'allowance') {
    return values[`${dirId}:${compId}`]?.[field] ?? 0
  }

  function setValue(dirId: string, compId: string, field: 'basic' | 'kpi' | 'allowance', val: number) {
    const key = `${dirId}:${compId}`
    setValues(prev => ({
      ...prev,
      [key]: { ...prev[key] ?? { basic: 0, kpi: 0, allowance: 0 }, [field]: val },
    }))
    setSaved(false)
  }

  // Totals for selected director
  const dirCompanies = companies.map(c => ({
    ...c,
    basic: getValue(selectedDirector, c.id, 'basic'),
    kpi: getValue(selectedDirector, c.id, 'kpi'),
    allowance: getValue(selectedDirector, c.id, 'allowance'),
  }))
  const totalBasic = dirCompanies.reduce((s, c) => s + c.basic, 0)
  const totalKpi = dirCompanies.reduce((s, c) => s + c.kpi, 0)
  const totalAllow = dirCompanies.reduce((s, c) => s + c.allowance, 0)

  // Statutory ER from existing CTC (auto-calculated by trigger)
  const dirStatutory = companies.map(c => {
    const ctc = existingCTC.find(e => e.director_id === selectedDirector && e.company_id === c.id)
    return {
      companyId: c.id,
      epfEr: ctc?.employer_epf ?? 0,
      socsoEr: ctc?.employer_socso ?? 0,
      eisEr: ctc?.employer_eis ?? 0,
      totalCtc: ctc?.total_ctc ?? 0,
    }
  })

  function handleSave() {
    setError(null)
    setSaved(false)

    // Collect ALL director × company records
    const records: BatchCTCInput[] = []
    for (const dir of directors) {
      for (const comp of companies) {
        const basic = getValue(dir.id, comp.id, 'basic')
        const kpi = getValue(dir.id, comp.id, 'kpi')
        const allowance = getValue(dir.id, comp.id, 'allowance')
        if (basic > 0 || kpi > 0 || allowance > 0) {
          records.push({
            directorId: dir.id,
            companyId: comp.id,
            basic, kpi, allowance,
          })
        }
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
      {/* Director tabs */}
      <div className="flex gap-4 border-b border-hairline mb-6">
        {directors.map(d => (
          <button
            key={d.id}
            onClick={() => setSelectedDirector(d.id)}
            className={
              d.id === selectedDirector
                ? 'pb-3 -mb-px font-serif italic text-accent border-b-2 border-accent transition-colors'
                : 'pb-3 -mb-px font-serif text-graphite hover:text-ink transition-colors'
            }
          >
            {d.code}
          </button>
        ))}
      </div>

      {/* CTC Input Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
              <th className="text-left py-3 pr-4 font-medium">Company</th>
              <th className="text-right py-3 pr-4 font-medium">Basic</th>
              <th className="text-right py-3 pr-4 font-medium">KPI</th>
              <th className="text-right py-3 pr-4 font-medium">Allowance</th>
            </tr>
          </thead>
          <tbody>
            {companies.map(comp => (
              <tr key={comp.id} className="border-b border-hairline last:border-0">
                <td className="py-3 pr-4 font-serif text-md text-ink">{comp.name}</td>
                {(['basic', 'kpi', 'allowance'] as const).map(field => (
                  <td key={field} className="py-3 pr-4">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={getValue(selectedDirector, comp.id, field) || ''}
                      onChange={e => setValue(selectedDirector, comp.id, field, parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                      className="w-28 px-2 py-1.5 bg-paper border border-hairline rounded-md text-sm font-mono tabular font-medium text-ink text-right focus:outline-none focus:border-accent-border"
                    />
                  </td>
                ))}
              </tr>
            ))}
            {/* Total row */}
            <tr className="border-t-2 border-hairline">
              <td className="py-3 pr-4 font-serif italic text-accent text-sm">Total</td>
              <td className="py-3 pr-4 text-right font-mono tabular font-medium text-ink font-semibold">
                {formatMoney(totalBasic).replace('RM ', '')}
              </td>
              <td className="py-3 pr-4 text-right font-mono tabular font-medium text-ink font-semibold">
                {formatMoney(totalKpi).replace('RM ', '')}
              </td>
              <td className="py-3 pr-4 text-right font-mono tabular font-medium text-ink font-semibold">
                {formatMoney(totalAllow).replace('RM ', '')}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Auto-calculated Statutory IN (read-only, from existing CTC) */}
      {dirStatutory.some(s => s.epfEr > 0) && (
        <div className="mt-8">
          <h3 className="font-serif text-lg text-ink mb-3">Auto-calculated Statutory IN</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
                <th className="text-left py-3 pr-4 font-medium">Company</th>
                <th className="text-right py-3 pr-4 font-medium">EPF ER</th>
                <th className="text-right py-3 pr-4 font-medium">SOCSO ER</th>
                <th className="text-right py-3 pr-4 font-medium">EIS ER</th>
              </tr>
            </thead>
            <tbody>
              {companies.map(comp => {
                const s = dirStatutory.find(x => x.companyId === comp.id)
                if (!s || (s.epfEr === 0 && s.socsoEr === 0 && s.eisEr === 0)) return null
                return (
                  <tr key={comp.id} className="border-b border-hairline last:border-0">
                    <td className="py-3 pr-4 font-serif text-md text-graphite">{comp.name}</td>
                    <td className="py-3 pr-4 text-right font-mono tabular font-medium text-graphite">{formatMoney(s.epfEr).replace('RM ', '')}</td>
                    <td className="py-3 pr-4 text-right font-mono tabular font-medium text-graphite">{formatMoney(s.socsoEr).replace('RM ', '')}</td>
                    <td className="py-3 pr-4 text-right font-mono tabular font-medium text-graphite">{formatMoney(s.eisEr).replace('RM ', '')}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
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
