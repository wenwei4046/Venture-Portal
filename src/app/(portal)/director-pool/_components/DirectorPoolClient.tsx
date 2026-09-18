'use client'

// Director Pool calculator — client shell. Full port of the standalone HTML
// tool: local state is the working copy (instant recalc on every keystroke,
// same UX as the original), every commit persists through a server action.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  calcAll,
  r2,
  showAllowStat,
  allowStatTopUpBase,
  billingRow,
  type DpMonth,
  type DirectorInputMap,
  type DpContraEvent,
  type MonthResult,
  type DirectorMonthResult,
} from '@/lib/director-pool-engine'
import type { DirectorPoolData } from '@/lib/director-pool-data'
import {
  saveDpSettings,
  saveDpDirectorWeight,
  addDpMonth,
  updateDpMonth,
  deleteDpMonth,
  clearDpMonthData,
  upsertDpInput,
  upsertDpDirectorInput,
  performDpContra,
  resetDpContra,
  type DpDirectorInputField,
} from '../actions'
import DashboardViews from './DashboardViews'
import LedgerRow from '@/components/LedgerRow'

// ── Shared helpers ──────────────────────────────────────────────────────────

export const fmt = (v: number) =>
  // Normalize -0 / sub-cent negatives so ledgers never show "RM -0.00"
  (Math.abs(v) < 0.005 ? 0 : v).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
export const fmtRM = (v: number) => `RM ${fmt(v)}`
/** Signed money: negatives as red "-RM x" like the HTML tool. */
export function Money({ v, dash = '—' }: { v: number; dash?: string }) {
  if (Math.abs(v) < 0.005) return <span className="text-graphite">{dash}</span>
  if (v < 0) return <span className="text-danger">-RM {fmt(Math.abs(v))}</span>
  return <span>RM {fmt(v)}</span>
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// The three per-company input columns are rendered from a loop, so the mobile
// detail panel needs their labels by field key.
const FIELD_LABEL = { salary: 'Salary (RM)', kpi: 'KPI (RM)', allowance: 'Allowance (RM)' } as const
function monthName(iso: string, multiYear: boolean): string {
  const [y, m] = iso.split('-')
  const label = MONTH_LABELS[Number(m) - 1] ?? iso
  return multiYear ? `${label} ${y.slice(2)}` : label
}

function alertErr(e: unknown) {
  alert(e instanceof Error ? e.message : 'Something went wrong — please reload.')
}

/** Number input committing on blur / Enter (matches the HTML tool's onchange). */
export function MoneyInput({
  value,
  onCommit,
  className = '',
  placeholder = '0.00',
}: {
  value: number | null | undefined
  onCommit: (v: number | null) => void
  className?: string
  placeholder?: string
}) {
  return (
    <input
      type="number"
      step="0.01"
      key={String(value ?? '')}
      defaultValue={value ?? ''}
      placeholder={placeholder}
      className={`border border-hairline rounded bg-surface px-2 py-1 font-mono text-[12.5px] text-right text-ink tabular focus:outline-none focus:border-accent ${className}`}
      onBlur={(e) => {
        const v = e.target.value === '' ? null : Number(e.target.value)
        onCommit(v != null && Number.isNaN(v) ? null : v)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      }}
    />
  )
}

/** Hint under the 75% Allowance Statutory input (user ruling 2026-08-01):
 *  statutory is due only on the allowance slice topping the Sal+KPI 75% GB up
 *  to the fixed salary — show that lookup base, or that none is needed. */
export function TopUpHint({ d }: { d: Pick<DirectorMonthResult, 'salKpiGB' | 'allowGB' | 'dirFixed'> }) {
  if (d.allowGB <= 0) return null
  const base = allowStatTopUpBase(d)
  return base > 0 ? (
    <div className="font-mono text-[10px] text-info whitespace-nowrap mt-0.5">补差 base: {fmt(base)}</div>
  ) : (
    <div className="font-mono text-[10px] text-graphite whitespace-nowrap mt-0.5">无需 statutory</div>
  )
}

export function MonthTabs({
  months,
  value,
  onChange,
  allowAll = false,
}: {
  months: { id: string; name: string }[]
  value: string | null
  onChange: (id: string) => void
  allowAll?: boolean
}) {
  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {months.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onChange(m.id)}
          className={`px-3.5 py-1 rounded-full border text-xs font-medium transition-colors ${
            value === m.id
              ? 'border-accent text-accent bg-surface'
              : 'border-hairline text-graphite hover:text-ink bg-surface'
          }`}
        >
          {m.name}
        </button>
      ))}
      {allowAll && (
        <button
          type="button"
          onClick={() => onChange('__all__')}
          className={`px-3.5 py-1 rounded-full border border-dashed text-[11px] font-medium transition-colors ${
            value === '__all__'
              ? 'border-accent text-accent bg-surface'
              : 'border-hairline text-graphite hover:text-ink bg-surface'
          }`}
        >
          All Months
        </button>
      )}
    </div>
  )
}

export function Dot({ color }: { color: string }) {
  return (
    <span
      className="inline-block w-[10px] h-[10px] rounded-full mr-1.5 align-middle"
      style={{ backgroundColor: color }}
    />
  )
}

// ── Main component ──────────────────────────────────────────────────────────

export default function DirectorPoolClient({ data }: { data: DirectorPoolData }) {
  const router = useRouter()
  const [settings, setSettings] = useState(data.settings)
  const [directors, setDirectors] = useState(data.directors)
  const [months, setMonths] = useState<DpMonth[]>(data.months)
  const [dirInputs, setDirInputs] = useState<DirectorInputMap>(data.dirInputs)
  const [contra, setContra] = useState<DpContraEvent[]>(data.contra)

  const [mainTab, setMainTab] = useState<'calc' | 'dash'>('calc')
  const [activeMonthId, setActiveMonthId] = useState<string | null>(
    data.months.length ? data.months[data.months.length - 1].id : null,
  )
  const [resultMonth, setResultMonth] = useState<string>(
    data.months.length ? data.months[data.months.length - 1].id : '__all__',
  )

  // ── Manual save (user request 2026-07-22): edits stay LOCAL until 💾 Save.
  // Every change registers a persistence thunk keyed by target — last write
  // wins per field; Save runs the queue in insertion order.
  const pendingRef = useRef(new Map<string, () => Promise<unknown>>())
  const [pendingCount, setPendingCount] = useState(0)
  const [saving, setSaving] = useState(false)
  const queue = (key: string, thunk: () => Promise<unknown>) => {
    pendingRef.current.set(key, thunk)
    setPendingCount(pendingRef.current.size)
  }
  const purgeQueue = (predicate: (key: string) => boolean) => {
    for (const key of [...pendingRef.current.keys()]) {
      if (predicate(key)) pendingRef.current.delete(key)
    }
    setPendingCount(pendingRef.current.size)
  }
  const saveAll = async () => {
    if (saving || !pendingRef.current.size) return
    setSaving(true)
    for (const [key, thunk] of [...pendingRef.current.entries()]) {
      try {
        await thunk()
        pendingRef.current.delete(key)
        setPendingCount(pendingRef.current.size)
      } catch (e) {
        setSaving(false)
        alertErr(e)
        return
      }
    }
    setSaving(false)
  }

  // Warn before leaving with unsaved changes
  useEffect(() => {
    if (!pendingCount) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [pendingCount])

  // Server revalidation (contra / import / another session) → resync working
  // copy — but never clobber unsaved local edits.
  useEffect(() => {
    if (pendingRef.current.size > 0) return
    setSettings(data.settings)
    setDirectors(data.directors)
    setMonths(data.months)
    setDirInputs(data.dirInputs)
    setContra(data.contra)
  }, [data])

  const companies = data.companies

  const sortedMonths = useMemo(
    () => [...months].sort((a, b) => a.month.localeCompare(b.month)),
    [months],
  )
  const multiYear = useMemo(
    () => new Set(sortedMonths.map((m) => m.month.slice(0, 4))).size > 1,
    [sortedMonths],
  )
  const engineSettings = useMemo(
    () => ({
      ...settings,
      billingStartMonthId: settings.billingStartMonth
        ? (sortedMonths.find((m) => m.month === settings.billingStartMonth)?.id ?? null)
        : null,
    }),
    [settings, sortedMonths],
  )
  const results: MonthResult[] = useMemo(
    () =>
      calcAll(
        engineSettings,
        directors,
        sortedMonths.map((m) => ({ ...m, name: monthName(m.month, multiYear) })),
        dirInputs,
        data.fixedOverrides,
      ),
    [engineSettings, directors, sortedMonths, dirInputs, data.fixedOverrides, multiYear],
  )

  const totalWeight = r2(directors.reduce((s, d) => s + d.weight, 0))
  const weightTarget = directors.length * 100

  // ── Handlers (local state + persist) ──────────────────────────────────────

  const commitSetting = (patch: Partial<typeof settings>) => {
    setSettings((s) => ({ ...s, ...patch }))
    for (const [field, value] of Object.entries(patch)) {
      queue(`settings:${field}`, () =>
        saveDpSettings({ [field]: value } as Parameters<typeof saveDpSettings>[0]),
      )
    }
  }
  const commitWeight = (id: string, weight: number) => {
    setDirectors((ds) => ds.map((d) => (d.id === id ? { ...d, weight } : d)))
    queue(`weight:${id}`, () => saveDpDirectorWeight(id, weight))
  }
  const handleAddMonth = async () => {
    const last = sortedMonths[sortedMonths.length - 1]
    let next: string
    if (last) {
      const [y, m] = last.month.split('-').map(Number)
      const d = new Date(Date.UTC(y, m - 1 + 1, 1))
      next = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
    } else {
      const now = new Date()
      next = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    }
    try {
      const { id } = await addDpMonth(next)
      const newMonth: DpMonth = {
        id,
        month: next,
        name: '',
        fullPayout: false,
        includeBilling: false,
        billingDeductAdv: false,
        cos: data.companies.map((c) => ({ companyId: c.id, salary: 0, kpi: 0, allowance: 0 })),
      }
      setMonths((ms) => [...ms, newMonth])
      setActiveMonthId(id)
      setResultMonth(id)
    } catch (e) {
      alertErr(e)
    }
  }
  const handleMonthDate = (monthId: string, iso: string) => {
    if (!/^\d{4}-\d{2}/.test(iso)) return
    const first = `${iso.slice(0, 7)}-01`
    setMonths((ms) => ms.map((m) => (m.id === monthId ? { ...m, month: first } : m)))
    queue(`mdate:${monthId}`, () => updateDpMonth(monthId, { month: first }))
  }
  const handleFlag = (
    monthId: string,
    flag: 'fullPayout' | 'includeBilling' | 'billingDeductAdv' | 'allowExclFullPayout',
    value: boolean,
  ) => {
    setMonths((ms) =>
      ms.map((m) =>
        m.id === monthId
          ? {
              ...m,
              [flag]: value,
              ...(flag === 'fullPayout' && value ? { includeBilling: false } : {}),
            }
          : m,
      ),
    )
    const patch =
      flag === 'fullPayout'
        ? { full_payout: value }
        : flag === 'includeBilling'
          ? { include_billing: value }
          : flag === 'allowExclFullPayout'
            ? { allow_excl_full_payout: value }
            : { billing_deduct_adv: value }
    queue(`flag:${monthId}:${flag}`, () => updateDpMonth(monthId, patch))
  }
  const handleDeleteMonth = (monthId: string) => {
    if (!confirm('Remove this month? All its inputs will be deleted.')) return
    setMonths((ms) => ms.filter((m) => m.id !== monthId))
    setDirInputs((di) => {
      const copy = { ...di }
      Object.keys(copy).forEach((k) => {
        if (k.startsWith(`${monthId}_`)) delete copy[k]
      })
      return copy
    })
    purgeQueue((k) => k.includes(monthId))
    const remaining = sortedMonths.filter((m) => m.id !== monthId)
    setActiveMonthId(remaining.length ? remaining[remaining.length - 1].id : null)
    if (resultMonth === monthId) setResultMonth(remaining.length ? remaining[remaining.length - 1].id : '__all__')
    deleteDpMonth(monthId).catch(alertErr)
  }
  const handleClearMonth = (monthId: string) => {
    const m = sortedMonths.find((x) => x.id === monthId)
    if (!m) return
    if (!confirm('Clear ALL numbers for this month (company inputs + keyed statutory / withdrawals / overrides)?\n月份本身保留，记得按 💾 Save 才会生效。')) return
    setMonths((ms) =>
      ms.map((x) =>
        x.id === monthId
          ? { ...x, cos: x.cos.map((c) => ({ ...c, salary: 0, kpi: 0, allowance: 0 })) }
          : x,
      ),
    )
    setDirInputs((di) => {
      const copy = { ...di }
      Object.keys(copy).forEach((k) => {
        if (k.startsWith(`${monthId}_`)) delete copy[k]
      })
      return copy
    })
    // Drop superseded edits for this month, then queue one clear
    purgeQueue((k) => k.includes(monthId) && !k.startsWith('flag:') && !k.startsWith('mdate:'))
    queue(`clear:${monthId}`, () => clearDpMonthData(monthId))
  }
  const commitCo = (monthId: string, companyId: string, field: 'salary' | 'kpi' | 'allowance', v: number | null) => {
    const value = v ?? 0
    setMonths((ms) =>
      ms.map((m) =>
        m.id === monthId
          ? { ...m, cos: m.cos.map((c) => (c.companyId === companyId ? { ...c, [field]: value } : c)) }
          : m,
      ),
    )
    queue(`co:${monthId}:${companyId}:${field}`, () => upsertDpInput(monthId, companyId, field, value))
  }
  const commitDirInput = (
    monthId: string,
    directorId: string,
    field:
      | 'billingStat'
      | 'allowBillingStat'
      | 'allowPayStat'
      | 'advStat'
      | 'savingWithdrawal'
      | 'advOverrideThis'
      | 'advOverrideAccum',
    value: number | null,
  ) => {
    const key = `${monthId}_${directorId}`
    setDirInputs((di) => ({ ...di, [key]: { ...di[key], [field]: value } }))
    const dbField: DpDirectorInputField = (
      {
        billingStat: 'billing_stat',
        allowBillingStat: 'allow_billing_stat',
        allowPayStat: 'allow_pay_stat',
        advStat: 'adv_stat',
        savingWithdrawal: 'saving_withdrawal',
        advOverrideThis: 'adv_override_this',
        advOverrideAccum: 'adv_override_accum',
      } as const
    )[field]
    queue(`di:${monthId}:${directorId}:${field}`, () =>
      upsertDpDirectorInput(monthId, directorId, dbField, value),
    )
  }
  const doContra = async () => {
    if (pendingRef.current.size > 0) {
      alert('有未保存的修改 — 请先按 💾 Save，再做 Contra（Contra 是按数据库里已保存的数字算的）。')
      return
    }
    if (!confirm('Contra accumulated 25% Billing against accumulated Advance for all directors?')) return
    try {
      const summary = await performDpContra()
      const lines = summary
        .map(
          (c) =>
            `${c.code}: Billing RM${fmt(c.billing)} − Advance RM${fmt(Math.abs(c.advance))} → Contra RM${fmt(c.contra)}\n   → New Billing: RM${fmt(c.newBilling)} | New Advance: ${c.newAdvance < 0 ? '-' : ''}RM${fmt(Math.abs(c.newAdvance))}`,
        )
        .join('\n')
      alert(`⚡ Contra completed:\n\n${lines}`)
      router.refresh()
    } catch (e) {
      alertErr(e)
    }
  }
  const doResetContra = async () => {
    if (pendingRef.current.size > 0) {
      alert('有未保存的修改 — 请先按 💾 Save，再 Reset Contra。')
      return
    }
    if (!confirm('Clear all contra data? Manual advance overrides are kept.')) return
    try {
      await resetDpContra()
      setContra([])
      router.refresh()
    } catch (e) {
      alertErr(e)
    }
  }

  // ── KPI summary for the selected result month ─────────────────────────────
  const showAllKpi = resultMonth === '__all__'
  const kpiMonths = showAllKpi ? results : results.filter((m) => m.id === resultMonth)
  const kpiLabel = showAllKpi ? 'All Months' : (kpiMonths[0]?.name ?? '')
  let kTotal = 0
  let kGB = 0
  let kSave = 0
  let kAllow = 0
  let kAdvMonth = 0
  let kBI = 0
  kpiMonths.forEach((m) => {
    kTotal += m.poolTotal
    m.dirRes.forEach((d) => {
      kGB += d.salKpiGB
      kSave += d.totalSaving
      kAllow += d.allowGB
      kAdvMonth += d.advThisMonth
      // The WHOLE 25% invoice (system 25% + keyed statutory), matching the
      // table's "Total 25% Bill Inv" column — it used to show only the keyed
      // statutory. Includes the separately-transferred allowance's 25%: only
      // the 75% payout is split across two transfers, the invoice is one
      // monthly document (user ruling 2026-09-18).
      kBI += billingRow(m, d, dirInputs, settings).total
    })
  })
  kAdvMonth = r2(kAdvMonth)
  kBI = r2(kBI)

  const visibleResults = showAllKpi ? results : results.filter((m) => m.id === resultMonth)
  const activeMonth = sortedMonths.find((m) => m.id === activeMonthId) ?? null

  return (
    <div>
      {/* Main tabs + manual save */}
      <div className="flex flex-wrap gap-2 mb-6 items-center">
        {(
          [
            ['calc', 'Calculator'],
            ['dash', 'Dashboard'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setMainTab(key)}
            className={`px-5 py-2 rounded-md border text-sm font-medium transition-colors ${
              mainTab === key
                ? 'border-accent text-accent bg-surface'
                : 'border-hairline text-graphite hover:text-ink bg-surface'
            }`}
          >
            {label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-3">
          {pendingCount > 0 && (
            <span className="font-mono text-xs text-alert">● {pendingCount} 项未保存</span>
          )}
          <button
            type="button"
            onClick={saveAll}
            disabled={pendingCount === 0 || saving}
            className={`px-5 py-2 rounded-md border text-sm font-medium transition-colors ${
              pendingCount > 0 && !saving
                ? 'border-accent text-paper bg-accent hover:opacity-90'
                : 'border-hairline text-graphite bg-surface opacity-50 cursor-not-allowed'
            }`}
          >
            {saving ? 'Saving…' : '💾 Save'}
          </button>
        </div>
      </div>

      {mainTab === 'calc' ? (
        <CalculatorTab
          settings={settings}
          directors={directors}
          months={sortedMonths.map((m) => ({ ...m, name: monthName(m.month, multiYear) }))}
          companies={companies}
          dirInputs={dirInputs}
          results={results}
          totalWeight={totalWeight}
          weightTarget={weightTarget}
          activeMonth={activeMonth ? { ...activeMonth, name: monthName(activeMonth.month, multiYear) } : null}
          setActiveMonthId={setActiveMonthId}
          resultMonth={resultMonth}
          setResultMonth={setResultMonth}
          visibleResults={visibleResults}
          kpi={{ kTotal, kGB, kSave, kAllow, kAdvMonth, kBI, kpiLabel }}
          allowStatUntil={settings.allowStatUntil}
          onSetting={commitSetting}
          onWeight={commitWeight}
          onAddMonth={handleAddMonth}
          onMonthDate={handleMonthDate}
          onFlag={handleFlag}
          onDeleteMonth={handleDeleteMonth}
          onClearMonth={handleClearMonth}
          onCo={commitCo}
          onDirInput={commitDirInput}
        />
      ) : (
        <DashboardViews
          results={results}
          directors={directors}
          companies={companies}
          dirInputs={dirInputs}
          contra={contra}
          settings={engineSettings}
          onDirInput={commitDirInput}
          onFlag={handleFlag}
          onContra={doContra}
          onResetContra={doResetContra}
          onBillingStart={(month) => commitSetting({ billingStartMonth: month })}
        />
      )}
    </div>
  )
}

// ── Calculator tab ──────────────────────────────────────────────────────────

interface CalcProps {
  settings: DirectorPoolData['settings']
  directors: DirectorPoolData['directors']
  months: DpMonth[]
  companies: DirectorPoolData['companies']
  dirInputs: DirectorInputMap
  results: MonthResult[]
  totalWeight: number
  weightTarget: number
  activeMonth: DpMonth | null
  setActiveMonthId: (id: string) => void
  resultMonth: string
  setResultMonth: (id: string) => void
  visibleResults: MonthResult[]
  kpi: { kTotal: number; kGB: number; kSave: number; kAllow: number; kAdvMonth: number; kBI: number; kpiLabel: string }
  allowStatUntil: string | null
  onSetting: (patch: Partial<DirectorPoolData['settings']>) => void
  onWeight: (id: string, w: number) => void
  onAddMonth: () => void
  onMonthDate: (id: string, iso: string) => void
  onFlag: (
    id: string,
    flag: 'fullPayout' | 'includeBilling' | 'billingDeductAdv' | 'allowExclFullPayout',
    v: boolean,
  ) => void
  onDeleteMonth: (id: string) => void
  onClearMonth: (id: string) => void
  onCo: (monthId: string, companyId: string, field: 'salary' | 'kpi' | 'allowance', v: number | null) => void
  onDirInput: (
    monthId: string,
    directorId: string,
    field: 'billingStat' | 'allowBillingStat' | 'allowPayStat' | 'advStat' | 'savingWithdrawal' | 'advOverrideThis' | 'advOverrideAccum',
    v: number | null,
  ) => void
}

function SectHead({ n: counter, title }: { n: string; title: string }) {
  return (
    <div className="flex items-center gap-3 mb-4 mt-10 first:mt-0">
      <h2 className="font-serif italic text-xl text-ink whitespace-nowrap">{title}</h2>
      <div className="flex-1 border-t border-hairline" />
      <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-graphite">{counter}</span>
    </div>
  )
}

function CalculatorTab(p: CalcProps) {
  const gb = p.settings.gbPct
  const m = p.activeMonth
  const totSal = m ? r2(m.cos.reduce((s, c) => s + c.salary, 0)) : 0
  const totKpi = m ? r2(m.cos.reduce((s, c) => s + c.kpi, 0)) : 0
  const totAllow = m ? r2(m.cos.reduce((s, c) => s + c.allowance, 0)) : 0

  const showAll = p.resultMonth === '__all__'
  const anyAllowStat = p.visibleResults.some((mr) => showAllowStat(mr.month, { allowStatUntil: p.allowStatUntil }))

  // Grand totals across visible months
  const tot = {
    salKpi: 0, allow: 0, skSave: 0, alSave: 0, totSave: 0, bal: 0, alBal: 0, gbAmt: 0, alGB: 0,
    skBI: 0, alBI: 0, pay: 0, vr: 0, advThis: 0, advStat: 0, accum: 0, statSal: 0, statAl: 0, alPayStat: 0,
  }
  p.visibleResults.forEach((mr) => {
    const sas = showAllowStat(mr.month, { allowStatUntil: p.allowStatUntil })
    mr.dirRes.forEach((d) => {
      const inp = p.dirInputs[d.statKey] ?? {}
      tot.salKpi += d.salKpiGross; tot.allow += d.allowGross
      tot.skSave += d.salKpiSaving; tot.alSave += d.allowSaving; tot.totSave += d.totalSaving
      tot.bal += d.salKpiBalance; tot.alBal += d.allowBalance
      tot.gbAmt += d.salKpiGB; tot.alGB += d.allowGB
      tot.skBI += d.salKpiBillInv; tot.alBI += d.allowBillInv
      tot.pay += d.totalPay; tot.vr += d.vrKpi; tot.advThis += d.advThisMonth
      tot.advStat += d.advStatAmount; tot.accum += d.accumulated
      tot.statSal += inp.billingStat ?? 0
      tot.statAl += sas ? (inp.allowBillingStat ?? 0) : 0
      tot.alPayStat += inp.allowPayStat ?? 0
    })
  })
  Object.keys(tot).forEach((k) => { tot[k as keyof typeof tot] = r2(tot[k as keyof typeof tot]) })

  return (
    <div>
      {/* ── Settings ── */}
      <SectHead n="NO. 01" title="Settings" />
      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-8 mb-2">
        <div className="space-y-4">
          {(
            [
              ['Fixed Salary 固定底薪 (RM)', p.settings.fixedSalary, (v: number) => p.onSetting({ fixedSalary: v })],
              ['Saving Rate 储蓄比例 (%)', p.settings.savingPct, (v: number) => p.onSetting({ savingPct: v })],
              ['Gross Balance Split (%)', p.settings.gbPct, (v: number) => p.onSetting({ gbPct: v })],
            ] as const
          ).map(([label, value, commit]) => (
            <div key={label}>
              <div className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-graphite mb-1">{label}</div>
              <MoneyInput value={value} onCommit={(v) => commit(v ?? 0)} className="w-full py-1.5" />
            </div>
          ))}
          <p className="font-serif italic text-xs text-graphite leading-relaxed border-l-2 border-accent pl-3">
            Balance × {gb}% = Gross Balance (Director pay)
            <br />
            Balance × {r2(100 - gb)}% = Billing Invoice (statutory by user)
          </p>
        </div>
        <div>
          <table className="ledger-table">
            <thead>
              <tr>
                <th></th>
                <th>Director</th>
                <th className="right">Weight (%)</th>
              </tr>
            </thead>
            <tbody>
              {p.directors.map((d) => (
                <tr key={d.id}>
                  <td className="w-8"><Dot color={d.color} /></td>
                  <td className="font-mono text-sm text-ink">{d.code}</td>
                  <td className="num">
                    <MoneyInput value={d.weight} onCommit={(v) => p.onWeight(d.id, v ?? 0)} className="w-24" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="font-mono text-xs mt-2 text-graphite">
            Total Weight ={' '}
            <span className={Math.abs(p.totalWeight - p.weightTarget) < 0.1 ? 'text-ledger' : 'text-danger'}>
              {p.totalWeight.toFixed(2)}%
            </span>{' '}
            (target {p.weightTarget}% — 平均每人 100%)
          </p>
        </div>
      </div>

      {/* ── Monthly input ── */}
      <SectHead n="NO. 02" title="Monthly Input" />
      <p className="font-serif italic text-xs text-graphite mb-3">
        每个公司填写各自的 Salary / KPI / Allowance（RM）。Salary + KPI 需扣 Statutory（Billing Invoice
        自己填）；Allowance 不扣 Statutory 但可抵消 Advance。
      </p>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <MonthTabs
          months={p.months}
          value={p.activeMonth?.id ?? null}
          onChange={(id) => p.setActiveMonthId(id)}
        />
        <button
          type="button"
          onClick={p.onAddMonth}
          className="px-3.5 py-1 rounded-full border border-dashed border-hairline text-xs text-graphite hover:text-accent hover:border-accent transition-colors"
        >
          ＋ Add Month
        </button>
        {m && (
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={() => p.onClearMonth(m.id)}
              className="px-3 py-1 rounded border border-hairline text-xs text-graphite hover:text-alert hover:border-alert transition-colors"
            >
              🧹 Clear This Month
            </button>
            <button
              type="button"
              onClick={() => p.onDeleteMonth(m.id)}
              className="px-3 py-1 rounded border border-hairline text-xs text-graphite hover:text-danger hover:border-danger transition-colors"
            >
              Remove This Month
            </button>
          </div>
        )}
      </div>

      {!m ? (
        <div className="py-10 text-center border border-hairline rounded-md bg-surface">
          <p className="font-serif italic text-muted">点击 ＋ Add Month 开始添加月份</p>
        </div>
      ) : (
        <div>
          <div className="flex flex-wrap items-center gap-4 mb-3">
            <label className="flex items-center gap-2 font-mono text-xs text-graphite">
              Month:
              <input
                type="month"
                key={m.month}
                defaultValue={m.month.slice(0, 7)}
                onBlur={(e) => e.target.value && p.onMonthDate(m.id, `${e.target.value}-01`)}
                className="border border-hairline rounded bg-surface px-2 py-1 text-xs text-ink focus:outline-none focus:border-accent"
              />
            </label>
            <label
              className={`flex items-center gap-2 px-3 py-1.5 rounded border text-xs font-medium cursor-pointer select-none ${
                m.fullPayout ? 'border-alert text-alert' : 'border-hairline text-graphite'
              }`}
            >
              <input
                type="checkbox"
                checked={m.fullPayout}
                onChange={(e) => p.onFlag(m.id, 'fullPayout', e.target.checked)}
              />
              💯 Full Payout Month（100% — 不算 75/25 Billing）
            </label>
            <label
              className={`flex items-center gap-2 px-3 py-1.5 rounded border text-xs font-medium select-none ${
                m.fullPayout
                  ? 'border-hairline text-graphite opacity-40 pointer-events-none'
                  : m.includeBilling
                    ? 'border-accent text-accent cursor-pointer'
                    : 'border-hairline text-graphite cursor-pointer'
              }`}
            >
              <input
                type="checkbox"
                checked={m.includeBilling}
                disabled={m.fullPayout}
                onChange={(e) => p.onFlag(m.id, 'includeBilling', e.target.checked)}
              />
              📥 Include Billing（25% Bill Invoice 算进 Total Pay）
            </label>
            <span className="font-serif italic text-xs text-graphite">
              {m.fullPayout
                ? 'This month: Balance (95%) fully paid out. No Billing Invoice.'
                : m.includeBilling
                  ? 'Total Pay = 75% GB + Allow Bal + 25% Bill Invoice'
                  : 'Normal: 75% Gross Balance + 25% Billing Invoice (separate)'}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Company 公司</th>
                  <th className="right m-hide">Salary (RM)</th>
                  <th className="right m-hide">KPI (RM)</th>
                  <th className="right m-hide">Allowance (RM)</th>
                  <th className="right">Row Total</th>
                  <th className="lt-toggle" aria-hidden />
                </tr>
              </thead>
              <tbody>
                {p.companies.map((c) => {
                  const co = m.cos.find((x) => x.companyId === c.id) ?? {
                    companyId: c.id, salary: 0, kpi: 0, allowance: 0,
                  }
                  return (
                    <LedgerRow key={c.id}>
                      <td className="font-serif text-sm text-ink whitespace-nowrap">{c.name}</td>
                      {(['salary', 'kpi', 'allowance'] as const).map((f) => (
                        <td key={f} className="num m-hide" data-label={FIELD_LABEL[f]}>
                          <MoneyInput
                            value={co[f] || null}
                            onCommit={(v) => p.onCo(m.id, c.id, f, v)}
                            className="w-32"
                          />
                        </td>
                      ))}
                      <td className="num font-medium">{fmt(r2(co.salary + co.kpi + co.allowance))}</td>
                    </LedgerRow>
                  )
                })}
                <tr className="border-t border-hairline">
                  <td className="font-serif italic text-ink">Total</td>
                  <td className="num font-medium m-hide">{fmt(totSal)}</td>
                  <td className="num font-medium m-hide">{fmt(totKpi)}</td>
                  <td className="num font-medium m-hide">{fmt(totAllow)}</td>
                  <td className="num font-medium text-num-ink">{fmt(r2(totSal + totKpi + totAllow))}</td>
                  <td className="lt-toggle" />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {p.results.length > 0 && (
        <>
          {/* ── KPI cards ── */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mt-8">
            {(
              [
                [`Total Pool (${p.kpi.kpiLabel})`, p.kpi.kTotal, 'Salary + KPI + Allowance'],
                ['Sal+KPI Gross Balance', p.kpi.kGB, `${gb}% of ${r2(100 - p.settings.savingPct)}% Sal+KPI`],
                // Was mislabelled "Gross Allowance / Allowance × weight" — the
                // figure has always been the paid-out slice, same shape as the
                // Sal+KPI card next to it (user-spotted 2026-09-18).
                [`${gb}% Allowance`, p.kpi.kAllow, `${gb}% of ${r2(100 - p.settings.savingPct)}% Allowance`],
                [`Billing Invoice (${p.kpi.kpiLabel})`, p.kpi.kBI, `${r2(100 - gb)}% invoice + 手填 statutory`],
                [`Saving (${p.settings.savingPct}%)`, p.kpi.kSave, 'Sal+KPI + Allowance saving'],
                [`Advance (${p.kpi.kpiLabel})`, p.kpi.kAdvMonth, 'This month only'],
              ] as const
            ).map(([label, value, sub]) => (
              <div key={label} className="border border-hairline rounded-md bg-surface p-4">
                <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-graphite mb-1">{label}</div>
                <div className={`font-serif text-lg tabular ${Number(value) < 0 ? 'text-danger' : 'text-ink'}`}>
                  {Number(value) < 0 ? `-RM ${fmt(Math.abs(Number(value)))}` : `RM ${fmt(Number(value))}`}
                </div>
                <div className="font-mono text-[10px] text-graphite mt-0.5">{sub}</div>
              </div>
            ))}
          </div>

          {/* ── Distribution results ── */}
          <SectHead n="NO. 03" title="Distribution Results" />
          <div className="mb-3">
            <MonthTabs months={p.results} value={p.resultMonth} onChange={p.setResultMonth} allowAll />
          </div>
          {!showAll && p.visibleResults[0] && (
            <p className="font-mono text-xs text-accent mb-3">
              {p.visibleResults[0].name}
              {p.visibleResults[0].fullPayout && ' · 💯 FULL PAYOUT'}
              {p.visibleResults[0].includeBilling && ' · 📥 INCL. BILLING'}
              {' · '}Salary Pool: <span className="text-ink">{fmtRM(p.visibleResults[0].poolSal)}</span>
              {' · '}KPI Pool: <span className="text-ink">{fmtRM(p.visibleResults[0].poolKpi)}</span>
              {' · '}Allowance Pool: <span className="text-ink">{fmtRM(p.visibleResults[0].poolAllow)}</span>
            </p>
          )}
          <div className="overflow-x-auto border border-hairline rounded-md">
            {/* The widest table in the portal — 22 columns of calculator. The
                min-width is desktop-only: on a phone the fold keeps Director +
                Total Pay and stacks the other twenty (inputs included) in the
                row's panel, which beats scrolling 2100px sideways. */}
            <table className="ledger-table text-[12px] md:min-w-[2100px]">
              <thead>
                <tr>
                  <th>Director</th>
                  <th className="m-hide">Weight</th>
                  <th className="right m-hide">Gross (Sal+KPI)</th>
                  <th className="right m-hide">Allow Gross</th>
                  <th className="right m-hide">Sal+KPI Saving</th>
                  <th className="right m-hide">Allow Saving</th>
                  <th className="right m-hide">Total Saving</th>
                  <th className="right m-hide">Sal+KPI Bal (95%)</th>
                  <th className="right m-hide">Allow Bal (95%)</th>
                  <th className="right m-hide">{gb}% Gross Balance</th>
                  <th className="right m-hide">{gb}% Allowance</th>
                  <th className="right m-hide">Statutory (Allow 自己填)</th>
                  <th className="right m-hide">{r2(100 - gb)}% Bill Inv (Sal)</th>
                  <th className="right m-hide">{r2(100 - gb)}% Statutory (自己填)</th>
                  <th className="right m-hide">{r2(100 - gb)}% Bill Inv (Allow)</th>
                  {anyAllowStat && <th className="right m-hide">{r2(100 - gb)}% Statutory (Allow 自己填)</th>}
                  <th className="right m-hide">Total {r2(100 - gb)}% Bill Inv</th>
                  <th className="right">Total Pay</th>
                  <th className="right m-hide">Vr KPI</th>
                  <th className="right m-hide">Adv This Month</th>
                  <th className="right m-hide">Adv Statutory (自己填)</th>
                  <th className="right m-hide">Accum. Advance</th>
                  <th className="lt-toggle" aria-hidden />
                </tr>
              </thead>
              <tbody>
                {p.visibleResults.map((mr) => {
                  const sas = showAllowStat(mr.month, { allowStatUntil: p.allowStatUntil })
                  return [
                    showAll ? (
                      <tr key={`${mr.id}-hdr`} className="row-sect">
                        <td colSpan={anyAllowStat ? 22 : 21} className="font-serif italic text-accent">
                          {mr.name}
                          {mr.fullPayout && ' · 💯 Full Payout'}
                          {mr.includeBilling && ' · 📥 Incl. Billing'}
                          {'  —  '}Salary {fmtRM(mr.poolSal)} · KPI {fmtRM(mr.poolKpi)} · Allowance {fmtRM(mr.poolAllow)}
                        </td>
                      </tr>
                    ) : null,
                    ...mr.dirRes.map((d) => {
                      const inp = p.dirInputs[d.statKey] ?? {}
                      const total25 = r2(
                        d.salKpiBillInv + (inp.billingStat ?? 0) + d.allowBillInv + (sas ? (inp.allowBillingStat ?? 0) : 0),
                      )
                      return (
                        <LedgerRow key={`${mr.id}-${d.id}`}>
                          <td className="whitespace-nowrap"><Dot color={d.color} /><span className="font-mono text-sm text-ink">{d.code}</span></td>
                          <td className="font-mono text-xs text-graphite m-hide" data-label="Weight">{d.weight}%</td>
                          <td className="num font-medium m-hide" data-label="Gross (Sal+KPI)">{fmt(d.salKpiGross)}</td>
                          <td className="num m-hide" data-label="Allow Gross">{d.allowGross > 0 ? fmt(d.allowGross) : '—'}</td>
                          <td className="num m-hide" data-label="Sal+KPI Saving">{fmt(d.salKpiSaving)}</td>
                          <td className="num m-hide" data-label="Allow Saving">{d.allowGross > 0 ? fmt(d.allowSaving) : '—'}</td>
                          <td className="num font-medium m-hide" data-label="Total Saving">{fmt(d.totalSaving)}</td>
                          <td className="num m-hide" data-label="Sal+KPI Bal">{fmt(d.salKpiBalance)}</td>
                          <td className="num m-hide" data-label="Allow Bal">{d.allowGross > 0 ? fmt(d.allowBalance) : '—'}</td>
                          <td className="num font-medium m-hide" data-label={`${gb}% Gross Balance`}>{mr.fullPayout ? '—' : fmt(d.salKpiGB)}</td>
                          <td className="num m-hide" data-label={`${gb}% Allowance`}>{mr.fullPayout ? '—' : d.allowGross > 0 ? fmt(d.allowGB) : '—'}</td>
                          <td className="num m-hide" data-label="Statutory (Allow)">
                            {mr.fullPayout ? '—' : (
                              <>
                                <MoneyInput
                                  value={inp.allowPayStat ?? null}
                                  placeholder="填写"
                                  onCommit={(v) => p.onDirInput(mr.id, d.id, 'allowPayStat', v)}
                                  className="w-24"
                                />
                                <TopUpHint d={d} />
                              </>
                            )}
                          </td>
                          <td className="num m-hide" data-label={`${r2(100 - gb)}% Bill Inv (Sal)`}>{mr.fullPayout ? '—' : fmt(d.salKpiBillInv)}</td>
                          <td className="num m-hide" data-label={`${r2(100 - gb)}% Statutory`}>
                            {mr.fullPayout ? '—' : (
                              <MoneyInput
                                value={inp.billingStat ?? null}
                                placeholder="填写"
                                onCommit={(v) => p.onDirInput(mr.id, d.id, 'billingStat', v)}
                                className="w-28"
                              />
                            )}
                          </td>
                          <td className="num m-hide" data-label={`${r2(100 - gb)}% Bill Inv (Allow)`}>{mr.fullPayout ? '—' : d.allowGross > 0 ? fmt(d.allowBillInv) : '—'}</td>
                          {anyAllowStat && (
                            <td className="num m-hide" data-label={`${r2(100 - gb)}% Statutory (Allow)`}>
                              {mr.fullPayout || !sas ? '—' : (
                                <MoneyInput
                                  value={inp.allowBillingStat ?? null}
                                  placeholder="填写"
                                  onCommit={(v) => p.onDirInput(mr.id, d.id, 'allowBillingStat', v)}
                                  className="w-24"
                                />
                              )}
                            </td>
                          )}
                          <td className="num font-semibold m-hide" data-label={`Total ${r2(100 - gb)}% Bill Inv`}>{mr.fullPayout ? '—' : fmt(total25)}</td>
                          <td className="num font-semibold text-num-ink">{fmt(d.totalPay)}</td>
                          <td className="num m-hide" data-label="Vr KPI">
                            {Math.abs(d.vrKpi) < 0.005 ? '—' : (
                              <span className={d.vrKpi < 0 ? 'text-danger' : 'text-ledger'}>
                                {fmt(d.vrKpi)}{' '}
                                <em className="font-serif text-[10px]">{d.vrKpi < 0 ? 'Advance' : 'Surplus'}</em>
                              </span>
                            )}
                          </td>
                          <td className="num m-hide" data-label="Adv This Month">
                            {d.advThisMonth < 0 ? <span className="text-danger">({fmt(Math.abs(d.advThisMonth))})</span> : '—'}
                          </td>
                          <td className="num m-hide" data-label="Adv Statutory">
                            {d.advThisMonth < 0 ? (
                              <MoneyInput
                                value={inp.advStat ?? null}
                                placeholder="填写"
                                onCommit={(v) => p.onDirInput(mr.id, d.id, 'advStat', v)}
                                className="w-24"
                              />
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="num font-medium m-hide" data-label="Accum. Advance">
                            {Math.abs(d.accumulated) < 0.005 ? '—' : (
                              <span className={d.accumulated < 0 ? 'text-danger' : 'text-ledger'}>
                                {d.accumulated < 0 ? `(${fmt(Math.abs(d.accumulated))})` : fmt(d.accumulated)}
                              </span>
                            )}
                          </td>
                        </LedgerRow>
                      )
                    }),
                  ]
                })}
                <tr className="border-t border-hairline">
                  <td colSpan={2} className="font-serif italic text-ink">Total{showAll ? ' (All Months)' : ''}</td>
                  <td className="num font-medium m-hide">{fmt(tot.salKpi)}</td>
                  <td className="num m-hide">{fmt(tot.allow)}</td>
                  <td className="num m-hide">{fmt(tot.skSave)}</td>
                  <td className="num m-hide">{fmt(tot.alSave)}</td>
                  <td className="num font-medium m-hide">{fmt(tot.totSave)}</td>
                  <td className="num m-hide">{fmt(tot.bal)}</td>
                  <td className="num m-hide">{fmt(tot.alBal)}</td>
                  <td className="num font-medium m-hide">{fmt(tot.gbAmt)}</td>
                  <td className="num m-hide">{fmt(tot.alGB)}</td>
                  <td className="num m-hide">{tot.alPayStat > 0 ? fmt(tot.alPayStat) : '—'}</td>
                  <td className="num m-hide">{fmt(tot.skBI)}</td>
                  <td className="num m-hide">{fmt(tot.statSal)}</td>
                  <td className="num m-hide">{tot.alBI > 0 ? fmt(tot.alBI) : '—'}</td>
                  {anyAllowStat && <td className="num m-hide">{fmt(tot.statAl)}</td>}
                  <td className="num font-semibold m-hide">{fmt(r2(tot.skBI + tot.statSal + tot.alBI + tot.statAl))}</td>
                  <td className="num font-semibold text-num-ink">{fmt(tot.pay)}</td>
                  <td className="num m-hide">
                    <span className={tot.vr < 0 ? 'text-danger' : tot.vr > 0 ? 'text-ledger' : ''}>{fmt(tot.vr)}</span>
                  </td>
                  <td className="num m-hide">{tot.advThis < 0 ? <span className="text-danger">({fmt(Math.abs(tot.advThis))})</span> : '—'}</td>
                  <td className="num m-hide">{tot.advStat > 0 ? <span className="text-danger">{fmt(tot.advStat)}</span> : '—'}</td>
                  <td className="num m-hide">
                    {tot.accum < 0 ? <span className="text-danger">({fmt(Math.abs(tot.accum))})</span> : tot.accum > 0 ? fmt(tot.accum) : '—'}
                  </td>
                  <td className="lt-toggle" />
                </tr>
              </tbody>
            </table>
          </div>
          <p className="font-serif italic text-xs text-graphite mt-3 leading-relaxed">
            ★ {p.settings.savingPct}% Saving 适用于 Salary+KPI 和 Allowance（分开计算）。 ★ {gb}/{r2(100 - gb)} Split
            两条流都切。 ★ Full Payout Month：100% Balance 直接给 Director，无 Billing Invoice。 ★ Advance：Total Pay
            &lt; Fixed Salary → 差额累计；盈余先抵消累计 Advance；Adv Statutory 与 75% Allow Statutory 也加入欠款。
          </p>

          <HvPayoutSection
            month={m}
            result={p.results.find((x) => x.id === m?.id) ?? null}
            settings={p.settings}
            company={p.companies.find((c) => c.excludeFromPay) ?? null}
            onFlag={p.onFlag}
          />
        </>
      )}
    </div>
  )
}

// ── Mid-month allowance payout ──────────────────────────────────────────────
// The month's main transfer (Sal+KPI + every other company's allowance) goes
// out before the 15th. Houzs Venture's allowance lands on the 15th and is paid
// out on its own, so this panel isolates its slice — the pooled "75%
// Allowance" column mixes all companies and would over-pay.

function HvPayoutSection({
  month,
  result,
  settings,
  company,
  onFlag,
}: {
  month: DpMonth | null
  result: MonthResult | null
  settings: CalcProps['settings']
  company: CalcProps['companies'][number] | null
  onFlag: CalcProps['onFlag']
}) {
  const hvAmount = company
    ? (month?.cos.find((c) => c.companyId === company.id)?.allowance ?? 0)
    : 0
  // Read the engine's own slice rather than recomputing: allowExcl is the
  // REMAINDER of each pooled column, so 月头过的 + 15号过的 tallies to the cent
  // against NO. 03's "75% Allowance" row.
  const rows = result?.dirRes ?? []

  // No month picked, or nobody transfers separately — nothing to show.
  if (!month || !company) return null

  const totalPayout = r2(rows.reduce((s, d) => s + d.allowExcl.gb, 0))
  const totalGross = r2(rows.reduce((s, d) => s + d.allowExcl.gross, 0))
  const totalSaving = r2(rows.reduce((s, d) => s + d.allowExcl.saving, 0))
  const totalBalance = r2(rows.reduce((s, d) => s + d.allowExcl.balance, 0))
  const totalBill = r2(rows.reduce((s, d) => s + d.allowExcl.billInv, 0))
  const gb = settings.gbPct
  const hvFull = month.fullPayout || month.allowExclFullPayout === true

  return (
    <>
      <SectHead n="NO. 04" title={`${company.name} Allowance · 15号过账`} />
      <p className="font-mono text-xs text-graphite mb-3 leading-relaxed">
        月头那笔（Sal+KPI ＋ 其他公司 allowance）已经过了 —— 这里只算 <span className="text-ink">{company.name}</span> 15
        号进来的那笔，每个 director 要另外过多少。照常扣 {settings.savingPct}% saving，默认走 {gb}/{r2(100 - gb)} split。
      </p>

      {/* HV's own Full Payout — independent of the month's flag (2026-09-18) */}
      <label
        className={`inline-flex items-center gap-2 px-3 py-2 mb-4 rounded-md border text-xs font-medium select-none ${
          month.fullPayout
            ? 'border-hairline text-graphite bg-surface opacity-60 cursor-not-allowed'
            : 'border-hairline text-ink bg-surface cursor-pointer hover:border-accent'
        }`}
      >
        <input
          type="checkbox"
          className="accent-current"
          disabled={month.fullPayout}
          checked={month.fullPayout || month.allowExclFullPayout === true}
          onChange={(e) => onFlag(month.id, 'allowExclFullPayout', e.target.checked)}
        />
        💯 Full Payout（100% — {r2(100 - gb)}% Billing 扣回出来）
        {month.fullPayout && <span className="text-graphite">· 整个月已经是 Full Payout</span>}
      </label>

      {hvAmount <= 0 ? (
        <p className="font-serif italic text-sm text-graphite border border-dashed border-hairline rounded-md p-4">
          这个月还没 key {company.name} 的 allowance —— 填进上面 NO. 02 那行，这里就会算出来。
        </p>
      ) : (
        <>
          <div className="overflow-x-auto border border-hairline rounded-md">
            <table className="ledger-table text-[12px]">
              <thead>
                <tr>
                  <th>Director</th>
                  <th className="m-hide">Weight</th>
                  <th className="right m-hide">Allow Gross</th>
                  <th className="right m-hide">Saving ({settings.savingPct}%)</th>
                  <th className="right m-hide">Balance ({r2(100 - settings.savingPct)}%)</th>
                  <th className="right">{hvFull ? '要过的钱 (100%)' : `要过的钱 (${gb}%)`}</th>
                  <th className="right m-hide">{r2(100 - gb)}% Bill Inv</th>
                  <th className="lt-toggle" aria-hidden />
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <LedgerRow key={d.id}>
                    <td className="whitespace-nowrap">
                      <Dot color={d.color} />
                      <span className="font-mono text-sm text-ink">{d.code}</span>
                    </td>
                    <td className="font-mono text-xs text-graphite m-hide" data-label="Weight">{d.weight}%</td>
                    <td className="num m-hide" data-label="Allow Gross">{fmt(d.allowExcl.gross)}</td>
                    <td className="num m-hide" data-label="Saving">{fmt(d.allowExcl.saving)}</td>
                    <td className="num m-hide" data-label="Balance">{fmt(d.allowExcl.balance)}</td>
                    <td className="num font-semibold text-num-ink" data-label="要过的钱">{fmt(d.allowExcl.gb)}</td>
                    <td className="num m-hide" data-label="Bill Inv">
                      {d.allowExcl.billInv > 0 ? fmt(d.allowExcl.billInv) : '—'}
                    </td>
                  </LedgerRow>
                ))}
                <tr className="border-t border-hairline">
                  <td colSpan={2} className="font-serif italic text-ink">Total</td>
                  <td className="num font-medium m-hide">{fmt(totalGross)}</td>
                  <td className="num m-hide">{fmt(totalSaving)}</td>
                  <td className="num m-hide">{fmt(totalBalance)}</td>
                  <td className="num font-semibold text-num-ink">{fmt(totalPayout)}</td>
                  <td className="num m-hide">{totalBill > 0 ? fmt(totalBill) : '—'}</td>
                  <td className="lt-toggle" />
                </tr>
              </tbody>
            </table>
          </div>
          <p className="font-serif italic text-xs text-graphite mt-3 leading-relaxed">
            ★ 这笔不进 Director Salary —— Director Salary 只记 Sal+KPI（2026-09-18 定）。 ★ 这笔<span className="text-ink">不进
            Total Pay</span>，所以 NO. 03 的 Vr KPI / Adv This Month / Accum. Advance 完全不受它影响 —— 跟没有这笔时一模一样。
            ★ 但它有算进 NO. 03 的「{gb}% Allowance」和 Saving：月头过的 ＋ 这里 15 号过的 ＝ 那一栏的总数。
            {hvFull ? (
              <>
                ★ <span className="text-ink">💯 Full Payout 开着</span> —— 这笔 {r2(100 - gb)}% Billing
                已经扣回出来，director 实收整条 {r2(100 - settings.savingPct)}% Balance，上面 Billing Invoice 那张卡也不含它。
              </>
            ) : (
              <>
                ★ 右上角的「{r2(100 - gb)}% Bill Inv」<span className="text-ink">已经算进</span> Billing Invoice 那张卡 ——
                过钱分两次，invoice 还是一个月一张。
              </>
            )}
          </p>
        </>
      )}
    </>
  )
}
