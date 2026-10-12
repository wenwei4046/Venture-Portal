'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
import { batchSaveCTC, type BatchCTCInput, type HvShareInput } from '../actions'
import { formatMoney, formatMoneyBare } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { officeTime } from '@/lib/office-time'
import type { HvDepartment, HvDraftLine, HvShare } from '@/lib/director-hv-share'
import HvSplitWindow, { type HvSplitConfirm } from './HvSplitWindow'

interface Director {
  id: string
  code: string
  name: string
}

interface Company {
  id: string
  name: string
  short_code: string
  /** Company rule (companies.director_heads): directors this CTC covers — HC = 2. */
  director_heads: number
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
  /** Mig 20260731100000: ER values were keyed manually — don't auto-recompute. */
  er_manual?: boolean | null
}

interface Props {
  directors: Director[]
  companies: Company[]
  existingCTC: ExistingCTC[]
  period: string
  /**
   * HOUZS Venture's own row (2026-10-13): the month's share, every department
   * that may pay it, and whether the month's directors are already with
   * Finance (the share rides their payroll batch, so it is fixed by then).
   * Left out, the grid is the subsidiaries' alone.
   */
  hv?: { departments: HvDepartment[]; share: HvShare | null; directorsSent: boolean }
}

interface ERBreakdown {
  epf: number
  socso: number
  eis: number
  total: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

const FIELD_LABEL = { basic: 'Basic', kpi: 'KPI', allowance: 'Allowance' } as const

const ZERO_ER: ERBreakdown = { epf: 0, socso: 0, eis: 0, total: 0 }

/** HOUZS Venture's row: keyed apart from every company id, one director head. */
const HV_KEY = 'hv'
const HV_ROW: Company = { id: HV_KEY, name: 'HOUZS Venture', short_code: 'HV', director_heads: 1 }

/** An all-zero HV row clears a share HR had sent. */
const CLEAR_HV: HvShareInput = { basic: 0, kpi: 0, allowance: 0, erManual: false, splitMode: 'amount', lines: [] }

// One grid instance per month. The page reaches another month through
// ?period= (DirectorPeriodPicker → router.push), and a navigation that only
// changes the query string re-runs the Server Component with fresh props but
// keeps this client subtree MOUNTED — so the useState seeds in the body
// (values / ER / manual flags) stayed on whichever month was opened first
// until a full reload (2026-09-11: ‹ › moved the header, not the grid).
// Keying the body on the period remounts it, and it re-seeds from the new
// existingCTC. Owned here rather than at the call site so no page can forget.
export default function CTCInputGrid(props: Props) {
  return <CTCInputGridBody key={props.period} {...props} />
}

function CTCInputGridBody({ directors, companies, existingCTC, period, hv }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'saving' | 'done'>('idle')

  const hvShare = hv?.share ?? null
  // Carried by the directors' payroll batch — or the directors went to Finance
  // without it: the row is fixed until Finance sends that batch back.
  const hvLocked = hvShare?.status === 'in_payroll' || hv?.directorsSent === true
  const rows: Company[] = hv ? [HV_ROW, ...companies] : companies

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
    const c = hvShare?.components
    if (c) map[HV_KEY] = { basic: c.basic, kpi: c.kpi, allowance: c.allowance }
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
    const c = hvShare?.components
    if (c) {
      map[HV_KEY] = {
        epf: c.employerEpf,
        socso: c.employerSocso,
        eis: c.employerEis,
        total: round2(c.employerEpf + c.employerSocso + c.employerEis),
      }
    }
    return map
  })

  // Manual ER override per company (mig 20260731100000): overridden companies
  // are excluded from the live re-lookup and save their keyed ER values.
  const [manualByCompany, setManualByCompany] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {}
    for (const ctc of existingCTC) {
      if (ctc.er_manual) map[ctc.company_id] = true
    }
    if (hvShare?.components?.erManual) map[HV_KEY] = true
    return map
  })

  // Which company's ER editor popover is open.
  const [openEr, setOpenEr] = useState<string | null>(null)

  // The departments window, open with HOUZS Venture's total for the month.
  const [split, setSplit] = useState<{ total: number; er: ERBreakdown } | null>(null)
  const [splitError, setSplitError] = useState<string | null>(null)

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

  function setErField(compId: string, field: 'epf' | 'socso' | 'eis', val: number) {
    setManualByCompany(prev => ({ ...prev, [compId]: true }))
    setErByCompany(prev => {
      const cur = prev[compId] ?? { epf: 0, socso: 0, eis: 0, total: 0 }
      const next = { ...cur, [field]: round2(val) }
      next.total = round2(next.epf + next.socso + next.eis)
      return { ...prev, [compId]: next }
    })
    setStatus('idle')
  }

  function resetEr(compId: string) {
    // Back to auto: the debounced lookup effect recomputes it immediately.
    setManualByCompany(prev => ({ ...prev, [compId]: false }))
    setStatus('idle')
  }

  // The employer statutory of `bk` wages over `heads` directors: the JADUAL
  // lookups the DB trigger runs, per head (SOCSO/EIS cap per person, so a
  // 2-director company contributes 2 caps).
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)
  async function lookupEr(bk: number, heads: number): Promise<ERBreakdown> {
    if (bk <= 0) return ZERO_ER
    if (!supabaseRef.current) supabaseRef.current = createClient()
    const supabase = supabaseRef.current
    const h = Math.max(1, heads)
    const bkPerHead = bk / h
    const [epfRes, socsoRes, eisRes] = await Promise.all([
      supabase.rpc('lookup_epf', { p_wages: bkPerHead }),
      supabase.rpc('lookup_socso', { p_wages: bkPerHead }),
      supabase.rpc('lookup_eis', { p_wages: bkPerHead }),
    ])
    const epf = Number(epfRes.data?.[0]?.employer ?? 0) * h
    const socso = Number(socsoRes.data?.[0]?.employer ?? 0) * h
    const eis = Number(eisRes.data?.[0]?.employer ?? 0) * h
    return { epf, socso, eis, total: epf + socso + eis }
  }
  const lookupRef = useRef(lookupEr)
  lookupRef.current = lookupEr

  // Debounced live statutory lookup: when basic or kpi changes, fetch ER from
  // lookup_epf/socso/eis and update erByCompany. Uses same RPCs the DB trigger
  // uses, so preview matches the value that will be stored on save. Companies
  // with a manual override keep their keyed values untouched, and so does a
  // transferred HV row (it shows what moved).
  useEffect(() => {
    const handle = setTimeout(async () => {
      const next: Record<string, ERBreakdown> = {}
      for (const comp of hv ? [HV_ROW, ...companies] : companies) {
        if (manualByCompany[comp.id]) continue // keep the keyed values
        if (comp.id === HV_KEY && hvLocked) continue
        const bk = (values[comp.id]?.basic ?? 0) + (values[comp.id]?.kpi ?? 0)
        // Heads is a company rule (companies.director_heads, HC = 2) — mirrors
        // what batchSaveCTC stamps + the DB trigger computes.
        next[comp.id] = await lookupRef.current(bk, comp.director_heads ?? 1)
      }
      setErByCompany(prev => ({ ...prev, ...next }))
    }, 300)

    return () => clearTimeout(handle)
  }, [values, companies, manualByCompany, hv, hvLocked])

  // Totals
  const companyRows = rows.map(c => ({
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

  // Save all company entries under the pool director. Zero rows are sent
  // too — the server treats an all-zero company as "clear this company's
  // CTC for the period" (deletes the stale rows instead of skipping them).
  function companyRecords(): BatchCTCInput[] {
    const records: BatchCTCInput[] = []
    for (const comp of companies) {
      const er = erByCompany[comp.id]
      const manual = manualByCompany[comp.id] === true
      records.push({
        directorId: poolDirectorId,
        companyId: comp.id,
        basic: getValue(comp.id, 'basic'),
        kpi: getValue(comp.id, 'kpi'),
        allowance: getValue(comp.id, 'allowance'),
        erManual: manual,
        ...(manual
          ? {
              employerEpf: er?.epf ?? 0,
              employerSocso: er?.socso ?? 0,
              employerEis: er?.eis ?? 0,
            }
          : {}),
      })
    }
    return records
  }

  function persist(hvInput: HvShareInput | null, fromWindow: boolean) {
    const records = companyRecords()
    startTransition(async () => {
      try {
        setStatus('saving')
        const res = await batchSaveCTC(period, records, hvInput)
        if (!res.ok) {
          setStatus('idle')
          if (fromWindow) setSplitError(res.reason)
          else setError(res.reason)
          return
        }
        setSplit(null)
        setStatus('done')
        // Staff-payroll-style flow: after saving, land on the Submission tab
        // where the Submit to Finance button is.
        router.push(`/director-salary?period=${period.slice(0, 7)}&tab=submission`)
        router.refresh()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        if (fromWindow) setSplitError(message)
        else setError(message)
        setStatus('idle')
      }
    })
  }

  async function handleSave() {
    setError(null)
    setSplitError(null)
    setStatus('idle')
    setOpenEr(null)

    if (!hv || hvLocked) return persist(null, false)
    const b = getValue(HV_KEY, 'basic')
    const k = getValue(HV_KEY, 'kpi')
    const a = getValue(HV_KEY, 'allowance')
    // HOUZS Venture pays nothing this month: a share HR had sent goes.
    if (b + k + a <= 0) return persist(hvShare ? CLEAR_HV : null, false)

    // It pays: which departments it comes out of, before anything is saved.
    // The window's total is the one the database will keep — the employer
    // statutory looked up now, not what the last debounce left on screen.
    let er = erByCompany[HV_KEY] ?? ZERO_ER
    if (!manualByCompany[HV_KEY]) {
      try {
        er = await lookupEr(b + k, HV_ROW.director_heads)
      } catch {
        setError('Could not look up HOUZS Venture’s employer statutory — try Save again')
        return
      }
      setErByCompany(prev => ({ ...prev, [HV_KEY]: er }))
    }
    setSplit({ total: round2(b + k + a + er.total), er })
  }

  function confirmSplit({ mode, lines }: HvSplitConfirm) {
    if (!split) return
    setSplitError(null)
    const manual = manualByCompany[HV_KEY] === true
    persist(
      {
        basic: getValue(HV_KEY, 'basic'),
        kpi: getValue(HV_KEY, 'kpi'),
        allowance: getValue(HV_KEY, 'allowance'),
        erManual: manual,
        ...(manual ? { employerEpf: split.er.epf, employerSocso: split.er.socso, employerEis: split.er.eis } : {}),
        splitMode: mode,
        lines,
      },
      true,
    )
  }

  // The window opens on the split HR sent last (its percentages, or its
  // amounts — which say what is left when the total moved), else on one line
  // of the whole total waiting for its department.
  const splitStart: { mode: 'amount' | 'percent'; lines: HvDraftLine[] } =
    hvShare && hvShare.lines.length > 0
      ? {
          mode: hvShare.splitMode,
          lines: hvShare.lines.map(l => ({
            departmentId: l.departmentId,
            value: hvShare.splitMode === 'percent' ? String(l.pct ?? '') : l.amount.toFixed(2),
          })),
        }
      : { mode: 'amount', lines: [{ departmentId: '', value: split ? split.total.toFixed(2) : '' }] }

  return (
    <div>
      {/* CTC Input Table.
          The ER popover has to spill past the table's bottom edge for the last
          rows, but a sheet `.ledger-table` clips its content (overflow hidden
          is what rounds its frame). So the popover's containing block is this
          wrapper (`relative`), OUTSIDE the table — overflow does not clip an
          absolute box whose containing block lies beyond it — and it keeps
          its place under the button through its static position: the button
          and the popover share an inline-flex column that is `items-end` +
          `justify-end`, which pins the popover's right edge to the button's
          and its bottom to the button's bottom, then `translate-y` drops it
          just below. Same spot as the old `right-0 top-full mt-1`, and it
          still scrolls with the table inside this wrapper. */}
      <div className="relative overflow-x-auto">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Company</th>
              <th className="right">Basic</th>
              <th className="right">KPI</th>
              <th className="right">Allowance</th>
              <th className="right">ER Statutory</th>
              <th className="right">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(comp => {
              const isHv = comp.id === HV_KEY
              const locked = isHv && hvLocked
              const b = getValue(comp.id, 'basic')
              const k = getValue(comp.id, 'kpi')
              const a = getValue(comp.id, 'allowance')
              const er = erByCompany[comp.id] ?? ZERO_ER
              const manual = manualByCompany[comp.id] === true
              const rowTotal = b + k + a + er.total
              const editable = !locked && (er.total > 0 || manual || b + k > 0)
              const isOpen = openEr === comp.id
              return (
                <tr key={comp.id}>
                  <td>
                    <div className="font-medium flex flex-wrap items-center gap-2">
                      {comp.name}
                      {isHv && hv ? <HvShareChip share={hvShare} directorsSent={hv.directorsSent} /> : null}
                    </div>
                    <div className="font-mono text-[11px] mt-0.5">{comp.short_code}</div>
                  </td>
                  {(['basic', 'kpi', 'allowance'] as const).map(field => (
                    <td key={field} className="right">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        aria-label={`${FIELD_LABEL[field]} — ${comp.name}`}
                        value={getValue(comp.id, field) || ''}
                        onChange={e => setValue(comp.id, field, parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                        disabled={locked}
                        className="w-28 px-2 py-1.5 bg-paper border border-hairline rounded-control text-[12px] font-mono tabular font-medium text-ink text-right focus:outline-none focus:border-accent-border disabled:opacity-60 disabled:cursor-not-allowed"
                      />
                    </td>
                  ))}
                  <td className="num">
                    {locked ? (
                      <span className="font-mono tabular font-medium text-ink">{formatMoneyBare(er.total)}</span>
                    ) : editable ? (
                      <span className="inline-flex flex-col items-end justify-end">
                        <button
                          type="button"
                          onClick={() => setOpenEr(isOpen ? null : comp.id)}
                          className="group inline-flex items-center gap-1.5 cursor-pointer font-mono tabular font-medium text-ink"
                          title={manual ? 'Manually keyed — click to edit' : 'Auto from B+K — click to override'}
                        >
                          <span
                            className={`border-b border-dashed group-hover:border-accent-border ${
                              manual ? 'border-alert/60' : 'border-hairline'
                            }`}
                          >
                            {formatMoneyBare(er.total)}
                          </span>
                          {manual ? <span className="chip alert"><span className="dot" />M</span> : null}
                        </button>
                        {isOpen ? (
                          <>
                            {/* click-away backdrop */}
                            <span
                              className="fixed inset-0 z-20 cursor-default"
                              onClick={() => setOpenEr(null)}
                            />
                            <span className="absolute z-30 w-64 translate-y-[calc(100%_+_4px)] bg-surface text-ink border border-hairline rounded-card shadow-dropdown text-xs font-sans p-3 text-left space-y-2 block">
                              <span className="block border-b border-hairline pb-1.5 font-semibold">
                                {manual ? 'Manually keyed' : <>Auto · based on B+K = {formatMoney(b + k)}</>}
                              </span>
                              {(
                                [
                                  ['epf', 'EPF ER'],
                                  ['socso', 'SOCSO ER'],
                                  ['eis', 'EIS ER'],
                                ] as const
                              ).map(([field, label]) => (
                                <span key={field} className="flex items-center justify-between gap-2">
                                  <span>{label}</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={er[field] || ''}
                                    onChange={e => setErField(comp.id, field, parseFloat(e.target.value) || 0)}
                                    placeholder="0.00"
                                    className="w-24 px-2 py-1 bg-paper border border-hairline rounded-control text-xs font-mono tabular text-ink text-right focus:outline-none focus:border-accent-border"
                                  />
                                </span>
                              ))}
                              <span className="flex justify-between border-t border-hairline pt-1.5 font-semibold">
                                <span>Total</span>
                                <span className="font-mono tabular">{formatMoney(er.total)}</span>
                              </span>
                              <span className="flex justify-end gap-2 pt-1">
                                {manual ? (
                                  <button
                                    type="button"
                                    onClick={() => resetEr(comp.id)}
                                    className="px-2.5 py-1 rounded-control border border-hairline bg-surface hover:bg-surface-2 text-ink text-xs transition-colors"
                                  >
                                    ↺ Auto
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => setOpenEr(null)}
                                  className="px-2.5 py-1 rounded-control bg-accent hover:bg-accent-hover text-xs font-medium transition-colors"
                                >
                                  Done
                                </button>
                              </span>
                            </span>
                          </>
                        ) : null}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="num">
                    {rowTotal > 0 ? formatMoneyBare(rowTotal) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <td className="font-bold">Director Pool Total</td>
              <td className="num">{formatMoneyBare(totalBasic)}</td>
              <td className="num">{formatMoneyBare(totalKpi)}</td>
              <td className="num">{formatMoneyBare(totalAllow)}</td>
              <td className="num">{formatMoneyBare(totalER)}</td>
              <td className="num font-bold">{formatMoneyBare(grandTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Save + Error */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          onClick={handleSave}
          disabled={isPending || split !== null}
          className="bg-accent hover:bg-accent-hover text-sm px-4 py-2 rounded-control transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === 'saving' && split === null ? 'Saving...' : 'Save'}
        </button>
        {status === 'done' && <span className="chip ledger"><span className="dot" />Saved</span>}
        {error && <span className="text-sm text-danger">{error}</span>}
      </div>

      {split && hv ? (
        <HvSplitWindow
          total={split.total}
          periodLabel={dayjs(period).format('MMMM YYYY')}
          departments={hv.departments}
          initialMode={splitStart.mode}
          initialLines={splitStart.lines}
          busy={isPending}
          error={splitError}
          onCancel={() => {
            setSplit(null)
            setSplitError(null)
          }}
          onConfirm={confirmSplit}
        />
      ) : null}
    </div>
  )
}

/**
 * Where HOUZS Venture's share stands: saved and waiting for the directors'
 * payroll batch, carried by it (which batch, when, on hover), or — the
 * directors went to Finance without it — fixed until that batch comes back.
 */
function HvShareChip({ share, directorsSent }: { share: HvShare | null; directorsSent: boolean }) {
  if (share?.status === 'in_payroll') {
    const when = share.batchSubmittedAt ? officeTime(share.batchSubmittedAt).format('D MMM YYYY') : ''
    return (
      <span
        className="chip ledger"
        title={`Went to Finance with payroll batch #${share.batchNo ?? '?'}${when ? ` on ${when}` : ''} — it changes once Finance sends that batch back`}
      >
        <span className="dot" />
        In payroll #{share.batchNo ?? '?'}
      </span>
    )
  }
  if (directorsSent) {
    return (
      <span className="chip" title="The directors are with Finance — HOUZS Venture's share goes with their payroll batch, so it changes once Finance sends that batch back">
        <span className="dot" />
        Directors sent
      </span>
    )
  }
  if (!share) return null
  const saved = share.submittedAt ? officeTime(share.submittedAt).format('D MMM YYYY HH:mm') : ''
  return (
    <span
      className="chip alert"
      title={`Saved${saved ? ` ${saved}` : ''}${share.submittedBy ? ` by ${share.submittedBy}` : ''} — goes with the directors' payroll batch`}
    >
      <span className="dot" />
      Waits for payroll
    </span>
  )
}
