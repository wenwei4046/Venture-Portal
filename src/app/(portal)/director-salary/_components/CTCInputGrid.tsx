'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { batchSaveCTC, calculateDirectorSalary, type BatchCTCInput } from '../actions'
import { formatMoney, formatMoneyBare } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

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

interface ERBreakdown {
  epf: number
  socso: number
  eis: number
  total: number
}

export default function CTCInputGrid({ directors, companies, existingCTC, period }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'saving' | 'calculating' | 'done'>('idle')
  const [savedCount, setSavedCount] = useState(0)

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

  // Seed ER breakdowns from saved rows so initial render matches DB.
  const [erByCompany, setErByCompany] = useState<Record<string, ERBreakdown>>(() => {
    const map: Record<string, ERBreakdown> = {}
    for (const ctc of existingCTC) {
      const key = ctc.company_id
      if (!map[key]) map[key] = { epf: 0, socso: 0, eis: 0, total: 0 }
      map[key].epf += Number(ctc.employer_epf ?? 0)
      map[key].socso += Number(ctc.employer_socso ?? 0)
      map[key].eis += Number(ctc.employer_eis ?? 0)
      map[key].total = map[key].epf + map[key].socso + map[key].eis
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
    setStatus('idle')
  }

  // Debounced live statutory lookup: when basic or kpi changes, fetch ER from
  // lookup_epf/socso/eis and update erByCompany. Uses same RPCs the DB trigger
  // uses, so preview matches the value that will be stored on save.
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)
  useEffect(() => {
    if (!supabaseRef.current) supabaseRef.current = createClient()
    const supabase = supabaseRef.current

    const handle = setTimeout(async () => {
      const next: Record<string, ERBreakdown> = {}
      for (const comp of companies) {
        const bk = (values[comp.id]?.basic ?? 0) + (values[comp.id]?.kpi ?? 0)
        if (bk <= 0) {
          next[comp.id] = { epf: 0, socso: 0, eis: 0, total: 0 }
          continue
        }
        const [epfRes, socsoRes, eisRes] = await Promise.all([
          supabase.rpc('lookup_epf', { p_wages: bk }),
          supabase.rpc('lookup_socso', { p_wages: bk }),
          supabase.rpc('lookup_eis', { p_wages: bk }),
        ])
        const epf = Number(epfRes.data?.[0]?.employer ?? 0)
        const socso = Number(socsoRes.data?.[0]?.employer ?? 0)
        const eis = Number(eisRes.data?.[0]?.employer ?? 0)
        next[comp.id] = { epf, socso, eis, total: epf + socso + eis }
      }
      setErByCompany(next)
    }, 300)

    return () => clearTimeout(handle)
  }, [values, companies])

  // Totals
  const companyRows = companies.map(c => ({
    ...c,
    basic: getValue(c.id, 'basic'),
    kpi: getValue(c.id, 'kpi'),
    allowance: getValue(c.id, 'allowance'),
    er: erByCompany[c.id]?.total ?? 0,
  }))
  const totalBasic = companyRows.reduce((s, c) => s + c.basic, 0)
  const totalKpi = companyRows.reduce((s, c) => s + c.kpi, 0)
  const totalAllow = companyRows.reduce((s, c) => s + c.allowance, 0)
  const totalER = companyRows.reduce((s, c) => s + c.er, 0)
  const grandTotal = totalBasic + totalKpi + totalAllow + totalER

  function handleSave() {
    setError(null)
    setStatus('idle')
    setSavedCount(0)

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
        setStatus('saving')
        await batchSaveCTC(period, records)
        setStatus('calculating')
        const res = await calculateDirectorSalary(period)
        setSavedCount(res.saved)
        setStatus('done')
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
        setStatus('idle')
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
              <th className="text-right py-3 pr-4 font-medium">ER Statutory</th>
              <th className="text-right py-3 pr-4 font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {companies.map(comp => {
              const b = getValue(comp.id, 'basic')
              const k = getValue(comp.id, 'kpi')
              const a = getValue(comp.id, 'allowance')
              const er = erByCompany[comp.id] ?? { epf: 0, socso: 0, eis: 0, total: 0 }
              const rowTotal = b + k + a + er.total
              const tooltip = `EPF ER: ${formatMoney(er.epf)}\nSOCSO ER: ${formatMoney(er.socso)}\nEIS ER: ${formatMoney(er.eis)}\nBased on B+K = ${formatMoney(b + k)}`
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
                  <td className="py-3 pr-4 text-right font-mono tabular font-medium text-graphite">
                    {er.total > 0 ? (
                      <span className="relative inline-block group cursor-help border-b border-dashed border-hairline">
                        {formatMoneyBare(er.total)}
                        <span className="invisible group-hover:visible absolute right-0 top-full mt-1 z-20 w-56 bg-ink text-paper text-xs font-sans rounded-md shadow-lg p-3 text-left space-y-1 whitespace-nowrap">
                          <span className="block border-b border-white/10 pb-1 mb-1 font-serif italic text-paper/70">
                            Based on B+K = {formatMoney(b + k)}
                          </span>
                          <span className="flex justify-between"><span className="text-paper/70">EPF ER</span><span className="font-mono tabular">{formatMoney(er.epf)}</span></span>
                          <span className="flex justify-between"><span className="text-paper/70">SOCSO ER</span><span className="font-mono tabular">{formatMoney(er.socso)}</span></span>
                          <span className="flex justify-between"><span className="text-paper/70">EIS ER</span><span className="font-mono tabular">{formatMoney(er.eis)}</span></span>
                          <span className="flex justify-between border-t border-white/10 pt-1 mt-1 font-semibold"><span>Total</span><span className="font-mono tabular">{formatMoney(er.total)}</span></span>
                        </span>
                      </span>
                    ) : '—'}
                  </td>
                  <td className="py-3 pr-4 text-right font-mono tabular font-medium text-ink">
                    {rowTotal > 0 ? formatMoneyBare(rowTotal) : '—'}
                  </td>
                </tr>
              )
            })}
            {/* Total row */}
            <tr className="border-t-2 border-hairline">
              <td className="py-3 pr-4 font-serif italic text-accent text-base">Director Pool Total</td>
              <td className="py-3 pr-4 text-right font-mono tabular font-medium text-ink font-semibold">
                {formatMoneyBare(totalBasic)}
              </td>
              <td className="py-3 pr-4 text-right font-mono tabular font-medium text-ink font-semibold">
                {formatMoneyBare(totalKpi)}
              </td>
              <td className="py-3 pr-4 text-right font-mono tabular font-medium text-ink font-semibold">
                {formatMoneyBare(totalAllow)}
              </td>
              <td className="py-3 pr-4 text-right font-mono tabular font-medium text-graphite font-semibold">
                {formatMoneyBare(totalER)}
              </td>
              <td className="py-3 pr-4 text-right font-mono tabular font-medium text-accent font-semibold">
                {formatMoneyBare(grandTotal)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Save + Error */}
      <div className="mt-6 flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === 'saving' ? 'Saving...' :
           status === 'calculating' ? 'Calculating...' :
           'Save & Calculate'}
        </button>
        {status === 'done' && (
          <span className="text-sm font-serif italic text-ledger">
            Saved & calculated — {savedCount} director payouts updated.
          </span>
        )}
        {error && <span className="text-sm font-serif italic text-danger">{error}</span>}
      </div>
    </div>
  )
}
