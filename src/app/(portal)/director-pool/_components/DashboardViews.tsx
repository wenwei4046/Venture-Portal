'use client'

// Director Pool dashboard — all eight sub-views ported from the HTML tool:
// Overview / Company / Directors / Advance / Billing / Saving / AllowStat / Flow.

import { useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts'
import {
  r2,
  showAllowStat,
  billingRow,
  billingAccum,
  savingAccum,
  allowStatAccum,
  billingDeductAdjustment,
  contraOffset,
  type MonthResult,
  type DirectorMonthResult,
  type DirectorInputMap,
  type DpContraEvent,
  type DpDirector,
  type DpSettings,
} from '@/lib/director-pool-engine'
import type { DpCompany } from '@/lib/director-pool-data'
import { fmt, fmtRM, Money, MoneyInput, MonthTabs, Dot } from './DirectorPoolClient'

// Chart-series palette for companies (data colours, mirrors the HTML tool)
const CO_COLORS = ['#4a9eff', '#f5a623', '#2ec4b6', '#e74c3c', '#9b8dd9', '#20b2aa', '#b39ddb']

type DirInputField =
  | 'billingStat'
  | 'allowBillingStat'
  | 'allowPayStat'
  | 'advStat'
  | 'savingWithdrawal'
  | 'advOverrideThis'
  | 'advOverrideAccum'

interface DashProps {
  results: MonthResult[]
  directors: DpDirector[]
  companies: DpCompany[]
  dirInputs: DirectorInputMap
  contra: DpContraEvent[]
  settings: DpSettings & { billingStartMonth: string | null }
  onDirInput: (monthId: string, directorId: string, field: DirInputField, v: number | null) => void
  onFlag: (monthId: string, flag: 'fullPayout' | 'includeBilling' | 'billingDeductAdv', v: boolean) => void
  onContra: () => void
  onResetContra: () => void
  onBillingStart: (month: string | null) => void
}

const TABS = [
  ['overview', 'Overview 总览'],
  ['company', 'Company 公司'],
  ['director', 'Directors 人员'],
  ['advance', 'Advance 预支'],
  ['billing', '25% Billing'],
  ['saving', 'Saving 储蓄'],
  ['allowstat', '75% Allow Stat'],
  ['flow', 'Flow 流向'],
] as const

export default function DashboardViews(p: DashProps) {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('overview')

  if (!p.results.length) {
    return (
      <div className="py-10 text-center border border-hairline rounded-md bg-surface">
        <p className="font-serif italic text-muted">No data yet — add months in the Calculator tab first.</p>
      </div>
    )
  }

  return (
    <div>
      <DashKpis {...p} />
      <div className="flex flex-wrap gap-1.5 mb-6">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`px-3.5 py-1 rounded-full border text-xs font-medium transition-colors ${
              tab === key
                ? 'border-accent text-accent bg-surface'
                : 'border-hairline text-graphite hover:text-ink bg-surface'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'overview' && <OverviewView {...p} />}
      {tab === 'company' && <CompanyView {...p} />}
      {tab === 'director' && <DirectorView {...p} />}
      {tab === 'advance' && <AdvanceView {...p} />}
      {tab === 'billing' && <BillingView {...p} />}
      {tab === 'saving' && <SavingView {...p} />}
      {tab === 'allowstat' && <AllowStatView {...p} />}
      {tab === 'flow' && <FlowView {...p} />}
    </div>
  )
}

// ── Shared bits ─────────────────────────────────────────────────────────────

function Card({ label, value, sub, danger }: { label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode; danger?: boolean }) {
  return (
    <div className="border border-hairline rounded-md bg-surface p-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-graphite mb-1">{label}</div>
      <div className={`font-serif text-lg tabular ${danger ? 'text-danger' : 'text-ink'}`}>{value}</div>
      {sub != null && <div className="font-mono text-[10px] text-graphite mt-0.5">{sub}</div>}
    </div>
  )
}

function MonthHeadRow({ m, colSpan, extra }: { m: MonthResult; colSpan: number; extra?: React.ReactNode }) {
  return (
    <tr className="row-sect">
      <td colSpan={colSpan} className="font-serif italic text-accent">
        {m.name}
        {m.fullPayout && ' · 💯 Full Payout'}
        {m.includeBilling && ' · 📥 Incl. Billing'}
        {extra}
      </td>
    </tr>
  )
}

function useMonthPick(results: MonthResult[], allowAll = true) {
  const [picked, setPicked] = useState<string>(results[results.length - 1]?.id ?? '__all__')
  const value = picked !== '__all__' && !results.find((m) => m.id === picked)
    ? (results[results.length - 1]?.id ?? '__all__')
    : picked
  const visible = value === '__all__' ? results : results.filter((m) => m.id === value)
  return { value, visible, setPicked, allowAll }
}

// ── Dashboard KPI strip ─────────────────────────────────────────────────────

function DashKpis({ results }: DashProps) {
  let totalPool = 0
  let totalSaving = 0
  let totalGB = 0
  let totalAllow = 0
  results.forEach((m) => {
    totalPool += m.poolTotal
    totalAllow += m.poolAllow
    m.dirRes.forEach((d) => {
      totalSaving += d.totalSaving
      totalGB += d.salKpiGB
    })
  })
  const latestAdv = r2(results[results.length - 1].dirRes.reduce((s, d) => s + d.accumulated, 0))
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
      <Card label="Total Pool (All Months)" value={fmtRM(r2(totalPool))} sub={`${results.length} month(s)`} />
      <Card label="Total Saving" value={fmtRM(r2(totalSaving))} sub="Sal+KPI + Allowance saving" />
      <Card label="Total Gross Balance" value={fmtRM(r2(totalGB))} sub="Paid to directors (Sal+KPI)" />
      <Card label="Total Allowance Pool" value={fmtRM(r2(totalAllow))} sub="Across all months" />
      <Card
        label="Outstanding Advance"
        value={<Money v={latestAdv} dash="RM 0.00" />}
        sub="Accumulated (latest month)"
        danger={latestAdv < 0}
      />
    </div>
  )
}

// ── Overview ────────────────────────────────────────────────────────────────

function OverviewView({ results, directors }: DashProps) {
  const poolData = results.map((m) => ({
    name: m.name,
    Salary: m.poolSal,
    KPI: m.poolKpi,
    Allowance: m.poolAllow,
  }))
  const payData = results.map((m) => {
    const row: Record<string, number | string> = { name: m.name }
    directors.forEach((d) => {
      row[d.code] = m.dirRes.find((x) => x.id === d.id)?.totalPay ?? 0
    })
    return row
  })
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="border border-hairline rounded-md bg-surface p-4">
        <h3 className="font-serif text-sm text-ink mb-3">Monthly Pool Trend 月度薪资池</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={poolData}>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => (v >= 1000 ? `${v / 1000}k` : String(v))} />
            <Tooltip formatter={(v) => fmtRM(Number(v))} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Salary" stackId="a" fill={CO_COLORS[0]} radius={[0, 0, 0, 0]} />
            <Bar dataKey="KPI" stackId="a" fill={CO_COLORS[2]} />
            <Bar dataKey="Allowance" stackId="a" fill={CO_COLORS[1]} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="border border-hairline rounded-md bg-surface p-4">
        <h3 className="font-serif text-sm text-ink mb-3">Director Total Pay Comparison (per Month)</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={payData}>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => (v >= 1000 ? `${v / 1000}k` : String(v))} />
            <Tooltip formatter={(v) => fmtRM(Number(v))} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {directors.map((d) => (
              <Bar key={d.id} dataKey={d.code} fill={d.color} radius={[3, 3, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ── Company ─────────────────────────────────────────────────────────────────

function CompanyView({ results, companies }: DashProps) {
  const pick = useMonthPick(results)
  const chartData = results.map((m) => {
    const row: Record<string, number | string> = { name: m.name }
    companies.forEach((c) => {
      const co = m.cos.find((x) => x.companyId === c.id)
      row[c.name] = r2((co?.salary ?? 0) + (co?.kpi ?? 0) + (co?.allowance ?? 0))
    })
    return row
  })
  let gS = 0, gK = 0, gA = 0, gT = 0
  return (
    <div>
      <div className="border border-hairline rounded-md bg-surface p-4 mb-6">
        <h3 className="font-serif text-sm text-ink mb-3">Company Contribution per Month 各公司月度贡献</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => (v >= 1000 ? `${v / 1000}k` : String(v))} />
            <Tooltip formatter={(v) => fmtRM(Number(v))} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {companies.map((c, i) => (
              <Bar key={c.id} dataKey={c.name} stackId="a" fill={CO_COLORS[i % CO_COLORS.length]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mb-3">
        <MonthTabs months={results} value={pick.value} onChange={pick.setPicked} allowAll />
      </div>
      <div className="overflow-x-auto">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Month</th>
              <th>Company</th>
              <th className="right">Salary</th>
              <th className="right">KPI</th>
              <th className="right">Allowance</th>
              <th className="right">Total</th>
            </tr>
          </thead>
          <tbody>
            {pick.visible.map((m) => [
              <MonthHeadRow key={`${m.id}-h`} m={m} colSpan={6} extra={<> — Pool: {fmtRM(m.poolTotal)}</>} />,
              ...companies.map((c) => {
                const co = m.cos.find((x) => x.companyId === c.id)
                const t = r2((co?.salary ?? 0) + (co?.kpi ?? 0) + (co?.allowance ?? 0))
                if (t === 0) return null
                gS += co?.salary ?? 0; gK += co?.kpi ?? 0; gA += co?.allowance ?? 0; gT += t
                return (
                  <tr key={`${m.id}-${c.id}`}>
                    <td className="font-mono text-xs text-graphite">{m.name}</td>
                    <td className="font-serif text-sm text-ink">{c.name}</td>
                    <td className="num">{co?.salary ? fmt(co.salary) : '—'}</td>
                    <td className="num">{co?.kpi ? fmt(co.kpi) : '—'}</td>
                    <td className="num">{co?.allowance ? fmt(co.allowance) : '—'}</td>
                    <td className="num font-medium">{fmt(t)}</td>
                  </tr>
                )
              }),
            ])}
            <tr className="border-t border-hairline">
              <td colSpan={2} className="font-serif italic text-ink">Total</td>
              <td className="num font-medium">{fmt(r2(gS))}</td>
              <td className="num font-medium">{fmt(r2(gK))}</td>
              <td className="num font-medium">{fmt(r2(gA))}</td>
              <td className="num font-medium text-num-ink">{fmt(r2(gT))}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Directors ───────────────────────────────────────────────────────────────

function DirectorView({ results }: DashProps) {
  const pick = useMonthPick(results)
  const g = { skg: 0, ag: 0, save: 0, gb: 0, ab: 0, pay: 0 }
  return (
    <div>
      <div className="mb-3">
        <MonthTabs months={results} value={pick.value} onChange={pick.setPicked} allowAll />
      </div>
      <div className="overflow-x-auto">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Month</th>
              <th>Director</th>
              <th className="right">Weight</th>
              <th className="right">Sal+KPI Gross</th>
              <th className="right">Allow Gross</th>
              <th className="right">Total Saving</th>
              <th className="right">Gross Bal</th>
              <th className="right">Allow Bal (95%)</th>
              <th className="right">Total Pay</th>
              <th className="right">Vr KPI</th>
              <th className="right">Accum. Advance</th>
            </tr>
          </thead>
          <tbody>
            {pick.visible.map((m) => [
              <MonthHeadRow key={`${m.id}-h`} m={m} colSpan={11} />,
              ...m.dirRes.map((d) => {
                g.skg += d.salKpiGross; g.ag += d.allowGross; g.save += d.totalSaving
                g.gb += d.salKpiGB; g.ab += d.allowBalance; g.pay += d.totalPay
                return (
                  <tr key={`${m.id}-${d.id}`}>
                    <td className="font-mono text-xs text-graphite">{m.name}</td>
                    <td className="whitespace-nowrap"><Dot color={d.color} /><span className="font-mono text-sm text-ink">{d.code}</span></td>
                    <td className="num">{d.weight}%</td>
                    <td className="num">{fmt(d.salKpiGross)}</td>
                    <td className="num">{d.allowGross > 0 ? fmt(d.allowGross) : '—'}</td>
                    <td className="num">{fmt(d.totalSaving)}</td>
                    <td className="num">{m.fullPayout ? '—' : fmt(d.salKpiGB)}</td>
                    <td className="num">{d.allowGross > 0 ? fmt(d.allowBalance) : '—'}</td>
                    <td className="num font-medium">{fmt(d.totalPay)}</td>
                    <td className="num">
                      {Math.abs(d.vrKpi) < 0.005 ? '—' : (
                        <span className={d.vrKpi < 0 ? 'text-danger' : 'text-ledger'}>{fmt(d.vrKpi)}</span>
                      )}
                    </td>
                    <td className="num">
                      {Math.abs(d.accumulated) < 0.005 ? '—' : (
                        <span className={d.accumulated < 0 ? 'text-danger' : ''}>
                          {d.accumulated < 0 ? `(${fmt(Math.abs(d.accumulated))})` : fmt(d.accumulated)}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              }),
            ])}
            <tr className="border-t border-hairline">
              <td colSpan={3} className="font-serif italic text-ink">Total</td>
              <td className="num font-medium">{fmt(r2(g.skg))}</td>
              <td className="num font-medium">{fmt(r2(g.ag))}</td>
              <td className="num font-medium">{fmt(r2(g.save))}</td>
              <td className="num font-medium">{fmt(r2(g.gb))}</td>
              <td className="num font-medium">{fmt(r2(g.ab))}</td>
              <td className="num font-medium text-num-ink">{fmt(r2(g.pay))}</td>
              <td colSpan={2} />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Advance ─────────────────────────────────────────────────────────────────

function AdvanceView(p: DashProps) {
  const { results, dirInputs, settings } = p
  const pick = useMonthPick(results)
  const latest = results[results.length - 1]

  let adjTotal = 0
  const cards = latest.dirRes.map((d) => {
    const adj = billingDeductAdjustment(d.id, latest.id, results, dirInputs, settings)
    const adjAccum = r2(d.accumulated + adj)
    adjTotal += adjAccum
    const totAdvStat = r2(results.reduce((s, m) => s + (m.dirRes.find((x) => x.id === d.id)?.advStatAmount ?? 0), 0))
    const totAllowStat = r2(results.reduce((s, m) => s + (m.dirRes.find((x) => x.id === d.id)?.allowStatAmount ?? 0), 0))
    return { d, adjAccum, adj, totAdvStat, totAllowStat }
  })
  adjTotal = r2(adjTotal)

  const g = { pay: 0, fixed: 0, vr: 0, adv: 0, advStat: 0, allowStat: 0 }
  return (
    <div>
      <p className="font-serif italic text-xs text-graphite mb-4 border-l-2 border-accent pl-3">
        当 Total Pay &lt; Fixed Salary 时，差额作为 Salary Advance（预支）累计。KPI 盈余抵消累计
        Advance；Adv Statutory 与 75% Allow Statutory 都会加入欠款。
      </p>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <Card label="Total Accumulated Advance" value={<Money v={adjTotal} dash="RM 0.00" />} sub={`All directors (${latest.name})`} danger={adjTotal < 0} />
        {cards.map(({ d, adjAccum, adj, totAdvStat, totAllowStat }) => (
          <Card
            key={d.id}
            label={<><Dot color={d.color} />{d.code} Accum. Advance</>}
            value={<Money v={adjAccum} dash="RM 0.00" />}
            danger={adjAccum < 0}
            sub={
              <>
                As of {latest.name}
                {adj > 0 && <> · billing deduct +{fmt(adj)}</>}
                {r2(totAdvStat + totAllowStat) > 0 && (
                  <> · incl. statutory RM {fmt(r2(totAdvStat + totAllowStat))}</>
                )}
              </>
            }
          />
        ))}
      </div>
      <div className="mb-3">
        <MonthTabs months={results} value={pick.value} onChange={pick.setPicked} allowAll />
      </div>
      <div className="overflow-x-auto">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Month</th>
              <th>Director</th>
              <th className="right">Total Pay</th>
              <th className="right">Fixed Salary</th>
              <th className="right">Vr KPI</th>
              <th className="right">Adv This Month</th>
              <th className="right">Adv Stat</th>
              <th className="right">Allow Stat</th>
              <th className="right">Prev. Accum</th>
              <th className="right">Accum. Advance</th>
              <th className="right">✏️ Override Adv</th>
              <th className="right">✏️ Override Accum.</th>
            </tr>
          </thead>
          <tbody>
            {pick.visible.map((m) => [
              <MonthHeadRow key={`${m.id}-h`} m={m} colSpan={12} />,
              ...m.dirRes.map((d) => {
                const inp = dirInputs[d.statKey] ?? {}
                g.pay += d.totalPay; g.fixed += d.dirFixed; g.vr += d.vrKpi; g.adv += d.advThisMonth
                g.advStat += d.advStatAmount; g.allowStat += d.allowStatAmount
                return (
                  <tr key={`${m.id}-${d.id}`} className={d.hasOverride ? 'row-summary-strong' : undefined}>
                    <td className="font-mono text-xs text-graphite">{m.name}</td>
                    <td className="whitespace-nowrap">
                      <Dot color={d.color} /><span className="font-mono text-sm text-ink">{d.code}</span>
                      {d.hasOverride && <em className="font-serif text-[10px] text-alert ml-1">✏️</em>}
                    </td>
                    <td className="num">{fmt(d.totalPay)}</td>
                    <td className="num">{fmt(d.dirFixed)}</td>
                    <td className="num">
                      {Math.abs(d.vrKpi) < 0.005 ? '—' : <span className={d.vrKpi < 0 ? 'text-danger' : 'text-ledger'}>{fmt(d.vrKpi)}</span>}
                    </td>
                    <td className="num">{d.advThisMonth < 0 ? <span className="text-danger">({fmt(Math.abs(d.advThisMonth))})</span> : '—'}</td>
                    <td className="num">{d.advStatAmount > 0 ? <span className="text-danger">{fmt(d.advStatAmount)}</span> : '—'}</td>
                    <td className="num">{d.allowStatAmount > 0 ? <span className="text-alert">{fmt(d.allowStatAmount)}</span> : '—'}</td>
                    <td className="num">
                      {Math.abs(d.prevAccum) < 0.005 ? '—' : (
                        <span className={d.prevAccum < 0 ? 'text-danger' : ''}>
                          {d.prevAccum < 0 ? `(${fmt(Math.abs(d.prevAccum))})` : fmt(d.prevAccum)}
                        </span>
                      )}
                    </td>
                    <td className="num font-medium">
                      {Math.abs(d.accumulated) < 0.005 ? '—' : (
                        <span className={d.accumulated < 0 ? 'text-danger' : ''}>
                          {d.accumulated < 0 ? `(${fmt(Math.abs(d.accumulated))})` : fmt(d.accumulated)}
                        </span>
                      )}
                    </td>
                    <td className="num">
                      <MoneyInput value={inp.advOverrideThis ?? null} placeholder="—" onCommit={(v) => p.onDirInput(m.id, d.id, 'advOverrideThis', v)} className="w-24" />
                    </td>
                    <td className="num">
                      <MoneyInput value={inp.advOverrideAccum ?? null} placeholder="—" onCommit={(v) => p.onDirInput(m.id, d.id, 'advOverrideAccum', v)} className="w-24" />
                    </td>
                  </tr>
                )
              }),
            ])}
            <tr className="border-t border-hairline">
              <td colSpan={2} className="font-serif italic text-ink">Total</td>
              <td className="num font-medium">{fmt(r2(g.pay))}</td>
              <td className="num">{fmt(r2(g.fixed))}</td>
              <td className="num"><span className={g.vr < 0 ? 'text-danger' : 'text-ledger'}>{fmt(r2(g.vr))}</span></td>
              <td className="num">{g.adv < 0 ? <span className="text-danger">({fmt(Math.abs(r2(g.adv)))})</span> : '—'}</td>
              <td className="num">{g.advStat > 0 ? <span className="text-danger">{fmt(r2(g.advStat))}</span> : '—'}</td>
              <td className="num">{g.allowStat > 0 ? <span className="text-alert">{fmt(r2(g.allowStat))}</span> : '—'}</td>
              <td colSpan={4} />
            </tr>
          </tbody>
        </table>
      </div>
      <p className="font-serif italic text-xs text-graphite mt-3">
        ✏️ Manual Override：填入负数代表 Advance（如 -1950.79）。留空则使用系统自动计算。Adv Stat（25%）与 Allow
        Stat（75% Allowance）都会加入 Accumulated Advance。
      </p>
    </div>
  )
}

// ── Billing ─────────────────────────────────────────────────────────────────

function BillingView(p: DashProps) {
  const { results, directors, dirInputs, contra, settings } = p
  const pick = useMonthPick(results)
  const lastVis = pick.visible[pick.visible.length - 1]

  // Summary cards over visible months
  let sSal = 0, sAl = 0, sStatSal = 0, sStatAl = 0
  pick.visible.forEach((m) => {
    m.dirRes.forEach((d) => {
      const row = billingRow(m, d, dirInputs, settings)
      sSal += row.salSys; sAl += row.alSys; sStatSal += row.statSal; sStatAl += row.statAl
    })
  })
  const label = pick.value === '__all__' ? 'All Months' : (pick.visible[0]?.name ?? '')

  // Accumulated per director (as of last visible month) minus contra
  let accumGrand = 0
  let contraGrand = 0
  const accumCards = directors.map((dir) => {
    const raw = billingAccum(dir.id, lastVis.id, results, dirInputs, settings)
    const off = contraOffset(dir.id, lastVis.id, results, contra)
    accumGrand += raw
    contraGrand += off
    return { dir, shown: r2(Math.max(0, raw - off)), off }
  })

  const g = { salSys: 0, statSal: 0, alSys: 0, statAl: 0, total: 0, advDeduct: 0, net: 0 }
  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <Card label="25% Invoice (Salary Pay)" value={fmtRM(r2(sSal))} sub={label} />
        <Card label="25% Invoice (Allowance)" value={fmtRM(r2(sAl))} sub={label} />
        <Card label="Statutory (Sal+KPI)" value={fmtRM(r2(sStatSal))} sub={label} />
        <Card label="Statutory (Allowance)" value={fmtRM(r2(sStatAl))} sub={label} />
        <Card label="Total 25% Billing Invoice" value={fmtRM(r2(sSal + sAl + sStatSal + sStatAl))} sub={label} />
      </div>

      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="font-serif text-sm text-ink">
          Accumulated Total 25% Billing Invoice <span className="text-graphite">(as of {lastVis.name})</span>
        </h3>
        <div className="flex gap-2">
          {contra.length > 0 && (
            <button
              type="button"
              onClick={p.onResetContra}
              className="px-3 py-1.5 rounded border border-danger/40 text-xs text-danger hover:bg-danger/5 transition-colors"
            >
              ✕ Reset Contra
            </button>
          )}
          <button
            type="button"
            onClick={p.onContra}
            className="px-3 py-1.5 rounded border border-alert text-xs font-medium text-alert hover:bg-alert/5 transition-colors"
          >
            ⚡ Contra Billing vs Advance
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        {accumCards.map(({ dir, shown, off }) => (
          <Card
            key={dir.id}
            label={<><Dot color={dir.color} />{dir.code} Accum. Billing</>}
            value={fmtRM(shown)}
            sub={off > 0 ? `Contra: -RM ${fmt(off)}` : `Weight: ${dir.weight}%`}
          />
        ))}
        <Card
          label="Total Billing"
          value={fmtRM(r2(Math.max(0, accumGrand - contraGrand)))}
          sub={contraGrand > 0 ? `Total Contra: -RM ${fmt(r2(contraGrand))}` : directors.map((d) => d.code).join(' + ')}
        />
      </div>

      <div className="mb-3">
        <MonthTabs months={results} value={pick.value} onChange={pick.setPicked} allowAll />
      </div>
      <div className="overflow-x-auto">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Month</th>
              <th>Director</th>
              <th className="right">25% Invoice (Salary)</th>
              <th className="right">25% Statutory (自己填)</th>
              <th className="right">25% Invoice (Allow)</th>
              <th className="right">25% Statutory (Allow 自己填)</th>
              <th className="right">Total 25%</th>
              <th className="right">Adv. Deduct</th>
              <th className="right">Net 25% Billing</th>
              <th className="right">Include Billing?</th>
            </tr>
          </thead>
          <tbody>
            {pick.visible.map((m) => [
              <tr key={`${m.id}-h`} className="row-sect">
                <td colSpan={10}>
                  <span className="font-serif italic text-accent">
                    {m.name}
                    {m.fullPayout && ' · 💯 Full Payout'}
                    {m.includeBilling && ' · 📥 Incl. Billing'}
                  </span>
                  {!m.fullPayout && (
                    <button
                      type="button"
                      onClick={() => p.onFlag(m.id, 'billingDeductAdv', !m.billingDeductAdv)}
                      className={`ml-3 px-2.5 py-0.5 rounded border text-[10.5px] font-medium transition-colors ${
                        m.billingDeductAdv
                          ? 'border-alert text-alert'
                          : 'border-hairline text-graphite hover:text-ink'
                      }`}
                    >
                      {m.billingDeductAdv ? '✅' : '⬜'} Billing Deduct Advance
                    </button>
                  )}
                </td>
              </tr>,
              ...m.dirRes.map((d) => {
                const inp = dirInputs[d.statKey] ?? {}
                const sas = showAllowStat(m.month, settings)
                const row = billingRow(m, d, dirInputs, settings)
                const totalAdv = r2(Math.abs(d.advThisMonth) + d.advStatAmount + d.allowStatAmount)
                const advDeduct = m.billingDeductAdv && totalAdv > 0 ? r2(Math.min(totalAdv, row.total)) : 0
                const advRemain = m.billingDeductAdv && totalAdv > 0 ? r2(totalAdv - advDeduct) : 0
                const net = m.billingDeductAdv && !m.fullPayout ? r2(row.total - advDeduct) : 0
                g.salSys += row.salSys; g.statSal += row.statSal; g.alSys += row.alSys; g.statAl += row.statAl
                g.total += row.total; g.advDeduct += advDeduct; g.net += net
                const dash = <span className="text-graphite">—</span>
                return (
                  <tr key={`${m.id}-${d.id}`}>
                    <td className="font-mono text-xs text-graphite">{m.name}</td>
                    <td className="whitespace-nowrap"><Dot color={d.color} /><span className="font-mono text-sm text-ink">{d.code}</span></td>
                    <td className="num">{m.fullPayout ? dash : fmt(row.salSys)}</td>
                    <td className="num">
                      {m.fullPayout ? dash : (
                        <MoneyInput value={inp.billingStat ?? null} placeholder="填写" onCommit={(v) => p.onDirInput(m.id, d.id, 'billingStat', v)} className="w-28" />
                      )}
                    </td>
                    <td className="num">{m.fullPayout ? dash : d.allowGross > 0 ? fmt(row.alSys) : '—'}</td>
                    <td className="num">
                      {m.fullPayout || !sas ? dash : (
                        <MoneyInput value={inp.allowBillingStat ?? null} placeholder="填写" onCommit={(v) => p.onDirInput(m.id, d.id, 'allowBillingStat', v)} className="w-24" />
                      )}
                    </td>
                    <td className="num font-semibold">{m.fullPayout ? dash : fmt(row.total)}</td>
                    <td className="num">
                      {m.fullPayout || !m.billingDeductAdv ? dash : advDeduct > 0 ? (
                        <span className="text-danger">
                          ({fmt(advDeduct)})
                          {advRemain > 0 && <span className="block font-mono text-[9.5px] text-graphite">余 {fmt(advRemain)} → Accum</span>}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="num font-medium">{m.fullPayout || !m.billingDeductAdv ? dash : <span className="text-alert">{fmt(net)}</span>}</td>
                    <td className="num">
                      {m.fullPayout ? <span className="text-graphite">N/A</span> : m.includeBilling ? <span className="text-ledger">✅ Yes</span> : <span className="text-graphite">No</span>}
                    </td>
                  </tr>
                )
              }),
            ])}
            <tr className="border-t border-hairline">
              <td colSpan={2} className="font-serif italic text-ink">Total</td>
              <td className="num font-medium">{fmt(r2(g.salSys))}</td>
              <td className="num font-medium">{fmt(r2(g.statSal))}</td>
              <td className="num font-medium">{fmt(r2(g.alSys))}</td>
              <td className="num font-medium">{fmt(r2(g.statAl))}</td>
              <td className="num font-semibold text-num-ink">{fmt(r2(g.total))}</td>
              <td className="num">{g.advDeduct > 0 ? <span className="text-danger">({fmt(r2(g.advDeduct))})</span> : '—'}</td>
              <td className="num font-medium">{g.net > 0 ? <span className="text-alert">{fmt(r2(g.net))}</span> : '—'}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Saving ──────────────────────────────────────────────────────────────────

function SavingView(p: DashProps) {
  const { results, directors, dirInputs } = p
  const pick = useMonthPick(results)
  const last = results[results.length - 1]

  let grand = 0
  const cards = directors.map((dir) => {
    const net = savingAccum(dir.id, last.id, results, dirInputs)
    grand += net
    let wd = 0
    results.forEach((m) => { wd += dirInputs[`${m.id}_${dir.id}`]?.savingWithdrawal ?? 0 })
    return { dir, net, wd: r2(wd) }
  })

  const g = { sk: 0, al: 0, tot: 0, wd: 0 }
  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        {cards.map(({ dir, net, wd }) => (
          <Card
            key={dir.id}
            label={<><Dot color={dir.color} />{dir.code} Accum. Saving</>}
            value={fmtRM(net)}
            sub={wd > 0 ? `Total Withdraw: -RM ${fmt(wd)}` : `Weight: ${dir.weight}%`}
          />
        ))}
        <Card label="Total Saving" value={fmtRM(r2(grand))} sub={directors.map((d) => d.code).join(' + ')} />
      </div>
      <div className="mb-3">
        <MonthTabs months={results} value={pick.value} onChange={pick.setPicked} allowAll />
      </div>
      <div className="overflow-x-auto">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Month</th>
              <th>Director</th>
              <th className="right">Sal+KPI Saving</th>
              <th className="right">Allowance Saving</th>
              <th className="right">Total Saving</th>
              <th className="right">Withdraw (自己填)</th>
              <th className="right">Accum. Saving</th>
            </tr>
          </thead>
          <tbody>
            {pick.visible.map((m) => [
              <MonthHeadRow key={`${m.id}-h`} m={m} colSpan={7} />,
              ...m.dirRes.map((d) => {
                const wKey = `${m.id}_${d.id}`
                const wd = dirInputs[wKey]?.savingWithdrawal ?? null
                g.sk += d.salKpiSaving; g.al += d.allowSaving; g.tot += d.totalSaving; g.wd += wd ?? 0
                return (
                  <tr key={`${m.id}-${d.id}`}>
                    <td className="font-mono text-xs text-graphite">{m.name}</td>
                    <td className="whitespace-nowrap"><Dot color={d.color} /><span className="font-mono text-sm text-ink">{d.code}</span></td>
                    <td className="num">{fmt(d.salKpiSaving)}</td>
                    <td className="num">{d.allowGross > 0 ? fmt(d.allowSaving) : '—'}</td>
                    <td className="num font-medium">{fmt(d.totalSaving)}</td>
                    <td className="num">
                      <MoneyInput value={wd} placeholder="RM" onCommit={(v) => p.onDirInput(m.id, d.id, 'savingWithdrawal', v)} className="w-24" />
                    </td>
                    <td className="num font-medium text-ledger">{fmt(savingAccum(d.id, m.id, results, dirInputs))}</td>
                  </tr>
                )
              }),
            ])}
            <tr className="border-t border-hairline">
              <td colSpan={2} className="font-serif italic text-ink">Total</td>
              <td className="num font-medium">{fmt(r2(g.sk))}</td>
              <td className="num font-medium">{g.al > 0 ? fmt(r2(g.al)) : '—'}</td>
              <td className="num font-medium">{fmt(r2(g.tot))}</td>
              <td className="num">{g.wd > 0 ? <span className="text-danger">({fmt(r2(g.wd))})</span> : '—'}</td>
              <td className="num font-medium text-ledger">{fmt(r2(g.tot - g.wd))}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── 75% Allowance Statutory ─────────────────────────────────────────────────

function AllowStatView(p: DashProps) {
  const { results, directors, dirInputs } = p
  const pick = useMonthPick(results)
  const last = results[results.length - 1]

  let grand = 0
  const cards = directors.map((dir) => {
    const acc = allowStatAccum(dir.id, last.id, results, dirInputs)
    grand += acc
    return { dir, acc }
  })

  const g = { allow: 0, stat: 0 }
  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        {cards.map(({ dir, acc }) => (
          <Card
            key={dir.id}
            label={<><Dot color={dir.color} />{dir.code} Accum. Statutory</>}
            value={acc > 0 ? fmtRM(acc) : '—'}
            sub="75% Allowance Statutory"
          />
        ))}
        <Card label="Total Statutory" value={grand > 0 ? fmtRM(r2(grand)) : '—'} sub="All directors" />
      </div>
      <div className="mb-3">
        <MonthTabs months={results} value={pick.value} onChange={pick.setPicked} allowAll />
      </div>
      <div className="overflow-x-auto">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Month</th>
              <th>Director</th>
              <th className="right">75% Allowance</th>
              <th className="right">Statutory (自己填)</th>
              <th className="right">Accum. Statutory</th>
            </tr>
          </thead>
          <tbody>
            {pick.visible.map((m) => [
              <MonthHeadRow key={`${m.id}-h`} m={m} colSpan={5} />,
              ...m.dirRes.map((d) => {
                const inp = dirInputs[d.statKey] ?? {}
                g.allow += d.allowGB; g.stat += inp.allowPayStat ?? 0
                return (
                  <tr key={`${m.id}-${d.id}`}>
                    <td className="font-mono text-xs text-graphite">{m.name}</td>
                    <td className="whitespace-nowrap"><Dot color={d.color} /><span className="font-mono text-sm text-ink">{d.code}</span></td>
                    <td className="num">{m.fullPayout ? '—' : fmt(d.allowGB)}</td>
                    <td className="num">
                      <MoneyInput value={inp.allowPayStat ?? null} placeholder="填写" onCommit={(v) => p.onDirInput(m.id, d.id, 'allowPayStat', v)} className="w-24" />
                    </td>
                    <td className="num font-medium text-ledger">
                      {allowStatAccum(d.id, m.id, results, dirInputs) > 0 ? fmt(allowStatAccum(d.id, m.id, results, dirInputs)) : '—'}
                    </td>
                  </tr>
                )
              }),
            ])}
            <tr className="border-t border-hairline">
              <td colSpan={2} className="font-serif italic text-ink">Total</td>
              <td className="num font-medium">{fmt(r2(g.allow))}</td>
              <td className="num font-medium">{g.stat > 0 ? fmt(r2(g.stat)) : '—'}</td>
              <td className="num font-medium text-ledger">{g.stat > 0 ? fmt(r2(g.stat)) : '—'}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Flow ────────────────────────────────────────────────────────────────────

function FlowBox({ label, value }: { label: string; value: string; tone?: 'ink' | 'accent' | 'danger' | 'ledger' | 'alert' | 'info' }) {
  // User ruling 2026-07-26: the Flow view renders plain ink like the PDF —
  // the tone prop is kept for call-site compatibility but no longer colours.
  return (
    <div className="border border-hairline rounded-md bg-surface px-4 py-3 text-center min-w-[130px] flex-1">
      <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-graphite mb-1.5">{label}</div>
      <div className="font-serif text-base tabular text-ink">{value}</div>
    </div>
  )
}

type FlowRow = [string, string, boolean?, ('danger' | 'ledger' | 'alert' | 'muted')?]

function FlowStream({ title, rows }: { title: string; rows: FlowRow[] }) {
  // Plain ink except the muted section separators — synced with the PDF
  const toneCls = { danger: 'text-ink', ledger: 'text-ink', alert: 'text-ink', muted: 'text-graphite' }
  return (
    <div className="border border-hairline rounded-md overflow-hidden mb-4">
      <div className="px-4 py-2 bg-surface border-b border-hairline font-serif italic text-sm text-accent">{title}</div>
      <div>
        {rows.map(([label, value, bold, tone], i) =>
          tone === 'muted' && !value ? (
            <div key={i} className="px-4 py-1 font-mono text-[10px] text-graphite border-b border-hairline last:border-0">
              {label}
            </div>
          ) : (
            <div
              key={i}
              className={`flex justify-between items-center px-4 py-2 border-b border-hairline last:border-0 text-[13px] ${bold ? 'font-medium bg-surface' : ''}`}
            >
              <span className={`font-serif ${tone ? toneCls[tone] : 'text-ink'}`}>{label}</span>
              <span className={`font-mono tabular ${tone ? toneCls[tone] : 'text-ink'}`}>{value}</span>
            </div>
          ),
        )}
      </div>
    </div>
  )
}

function FlowView(p: DashProps) {
  const { results, directors, dirInputs, contra, settings } = p
  const [monthId, setMonthId] = useState(results[results.length - 1].id)
  const [dirId, setDirId] = useState(directors[0]?.id ?? '')
  const m = results.find((x) => x.id === monthId) ?? results[results.length - 1]
  const d: DirectorMonthResult | undefined = m.dirRes.find((x) => x.id === dirId)
  const dir = directors.find((x) => x.id === dirId)
  if (!d || !dir) return null

  const inp = dirInputs[d.statKey] ?? {}
  const sas = showAllowStat(m.month, settings)
  const statSalVal = m.fullPayout ? 0 : (inp.billingStat ?? 0)
  const statAlVal = m.fullPayout || !sas ? 0 : (inp.allowBillingStat ?? 0)
  const total25 = m.fullPayout ? 0 : r2(d.salKpiBillInv + statSalVal + d.allowBillInv + statAlVal)
  const totalHRPayout = r2(d.totalPay + Math.abs(d.advThisMonth) - d.advanceOffset)
  const totalAdvBox = r2(Math.abs(d.advThisMonth) + d.advStatAmount + d.allowStatAmount)

  const advAdj = billingDeductAdjustment(d.id, m.id, results, dirInputs, settings)
  const accumAdvAdj = r2(d.accumulated + advAdj)
  const accumBill = r2(Math.max(0, billingAccum(d.id, m.id, results, dirInputs, settings) - contraOffset(d.id, m.id, results, contra)))
  const accumSave = savingAccum(d.id, m.id, results, dirInputs)

  // Card sub-notes — same breakdowns as the HTML tool's flow cards
  const uptoIdx = results.findIndex((x) => x.id === m.id)
  const upto = results.slice(0, uptoIdx + 1)
  const totalAdvStat = r2(upto.reduce((s, rm) => s + (rm.dirRes.find((x) => x.id === d.id)?.advStatAmount ?? 0), 0))
  const totalAllowStat = r2(upto.reduce((s, rm) => s + (rm.dirRes.find((x) => x.id === d.id)?.allowStatAmount ?? 0), 0))
  const totalStatAll = r2(totalAdvStat + totalAllowStat)
  const contraFromThisMonth = contra.some((ev) => ev.directorId === d.id && ev.fromMonthId === m.id)
  const contraOffHere = contraOffset(d.id, m.id, results, contra)
  const monthWithdraw = inp.savingWithdrawal ?? 0

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <span className="font-mono text-xs text-graphite">Month:</span>
        <MonthTabs months={results} value={monthId} onChange={setMonthId} />
      </div>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <span className="font-mono text-xs text-graphite">Director:</span>
        <div className="flex gap-1.5">
          {directors.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => setDirId(x.id)}
              className={`px-3.5 py-1 rounded-full border text-xs font-medium transition-colors ${
                x.id === dirId ? 'border-accent text-accent bg-surface' : 'border-hairline text-graphite hover:text-ink bg-surface'
              }`}
            >
              <Dot color={x.color} />
              {x.code}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <a
            href={`/print/director-pool?month=${m.month}&director=${dir.code}`}
            target="_blank"
            rel="noreferrer"
            className="px-3.5 py-1 rounded border border-hairline text-xs text-graphite hover:text-accent hover:border-accent transition-colors"
          >
            📄 PDF — {dir.code} ({m.name})
          </a>
          <a
            href={`/print/director-pool?month=${m.month}`}
            target="_blank"
            rel="noreferrer"
            className="px-3.5 py-1 rounded border border-hairline text-xs text-graphite hover:text-accent hover:border-accent transition-colors"
          >
            📄 PDF — All Directors
          </a>
        </div>
      </div>

      {/* Header */}
      <div className="border border-hairline rounded-md bg-surface px-5 py-4 mb-4 flex items-center gap-4">
        <div
          className="w-11 h-11 rounded-full flex items-center justify-center font-serif text-lg text-paper"
          style={{ backgroundColor: dir.color }}
        >
          {dir.code.charAt(0)}
        </div>
        <div>
          <div className="font-serif text-lg text-ink">{dir.code}</div>
          <div className="font-mono text-[11px] text-graphite">
            Weight: {d.weight}% · Fixed Salary: RM {fmt(d.dirFixed)}/month · {m.name}
            {m.fullPayout && ' (Full Payout)'}
            {m.includeBilling && ' (Incl. Billing)'}
          </div>
        </div>
      </div>

      {/* Summary boxes */}
      <div className="flex flex-wrap gap-3 mb-4">
        <FlowBox label="Total Gross" value={fmtRM(r2(d.salKpiGross + d.allowGross))} />
        <FlowBox label={`Total Saving (${settings.savingPct}%)`} value={fmtRM(d.totalSaving)} />
        {m.fullPayout ? (
          <FlowBox label="Balance (100%)" value={fmtRM(d.totalPay)} tone="info" />
        ) : (
          <>
            {/* Boxes carry the TOTALS incl. keyed statutory — Total 25% Billing
                Invoice and Total Advance (Adv + Adv Stat + Allow Stat), matching
                the stream totals (user ruling 2026-07-31, supersedes 07-26).
                Synced with the PDF report. */}
            <FlowBox label="25% Billing Invoice" value={fmtRM(total25)} tone="alert" />
            <FlowBox label="75% Gross Balance" value={fmtRM(r2(d.salKpiGB + d.allowGB))} tone="info" />
          </>
        )}
        {d.advanceOffset > 0 ? (
          <FlowBox label="Vr KPI Offset Advance" value={fmtRM(d.advanceOffset)} tone="danger" />
        ) : totalAdvBox > 0 ? (
          <FlowBox label="Advance" value={fmtRM(totalAdvBox)} tone="danger" />
        ) : d.vrKpi > 0 ? (
          <FlowBox label="Exceed (KPI)" value={`+ ${fmtRM(d.vrKpi)}`} tone="ledger" />
        ) : null}
        <FlowBox label="HR Payout Before Deduct Statutory" value={fmtRM(totalHRPayout)} />
      </div>

      {/* Accumulated ledgers */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        {/* Plain ink like the PDF (user ruling 2026-07-26) */}
        <Card
          label={`⚠️ ${dir.code} Accumulated Advance`}
          value={`${accumAdvAdj < 0 ? '-' : ''}RM ${fmt(Math.abs(accumAdvAdj))}`}
          sub={
            <>
              As of {m.name}
              {advAdj > 0 && <> (billing deduct: +RM {fmt(advAdj)})</>}
              {totalStatAll > 0 && (
                <>
                  {' '}(incl. statutory RM {fmt(totalStatAll)}
                  {totalAdvStat > 0 && totalAllowStat > 0
                    ? ` : Adv RM ${fmt(totalAdvStat)} + Allow RM ${fmt(totalAllowStat)}`
                    : ''}
                  )
                </>
              )}
              {d.prevAccum < 0 && accumAdvAdj === 0 && <span> · ✅ Advance cleared</span>}
            </>
          }
        />
        {d.advanceSurplus > 0 && (
          <Card
            label={`🎁 Vr KPI Surplus → Allowance`}
            value={fmtRM(d.advanceSurplus)}
            sub={`Prev Accum: -RM ${fmt(Math.abs(d.prevAccum))} · Vr KPI: +RM ${fmt(d.vrKpi)} · Offset: RM ${fmt(Math.abs(d.prevAccum))}`}
          />
        )}
        <Card
          label={`📄 ${dir.code} Accumulated 25% Billing + Statutory`}
          value={fmtRM(accumBill)}
          sub={
            <>
              As of {m.name}
              {contraFromThisMonth && contraOffHere > 0 && (
                <span> (after contra -RM {fmt(contraOffHere)})</span>
              )}
            </>
          }
        />
        <Card
          label={`💰 ${dir.code} Accumulated Saving`}
          value={fmtRM(accumSave)}
          sub={
            <>
              As of {m.name}
              {monthWithdraw > 0 && <span> (withdraw: -RM {fmt(monthWithdraw)})</span>}
            </>
          }
        />
      </div>

      {/* Streams */}
      <FlowStream
        title="💼 Salary + KPI Stream"
        rows={[
          ['Gross (Sal+KPI Pool × Weight)', fmtRM(d.salKpiGross)],
          [`Less: Saving (${settings.savingPct}%)`, `- RM ${fmt(d.salKpiSaving)}`],
          [`= Balance (${r2(100 - settings.savingPct)}%)`, fmtRM(d.salKpiBalance), true],
          ...(m.fullPayout
            ? ([['💯 Full Payout → 100% Balance to Director', fmtRM(d.salKpiGB), true]] as [string, string, boolean?][])
            : ([
                [`${settings.gbPct}% → Gross Balance (Director Pay)`, fmtRM(d.salKpiGB), true],
                [`${r2(100 - settings.gbPct)}% → Billing Invoice`, fmtRM(d.salKpiBillInv)],
              ] as [string, string, boolean?][])),
        ]}
      />
      {d.allowGross > 0 && (
        <FlowStream
          title="🎁 Allowance Stream"
          rows={[
            ['Allowance Gross (Pool × Weight)', fmtRM(d.allowGross)],
            [`Less: Saving (${settings.savingPct}%)`, `- RM ${fmt(d.allowSaving)}`],
            [`= Allowance Balance (${r2(100 - settings.savingPct)}%)`, fmtRM(d.allowBalance), true],
            ...(m.fullPayout
              ? ([['💯 Full Payout → 100% Balance to Director', fmtRM(d.allowGB), true]] as [string, string, boolean?][])
              : ([
                  [`${settings.gbPct}% → Gross Balance (Director Pay)`, fmtRM(d.allowGB), true],
                  [`${r2(100 - settings.gbPct)}% → Billing Invoice`, fmtRM(d.allowBillInv)],
                ] as [string, string, boolean?][])),
          ]}
        />
      )}
      {/* Stream 3: Advance Tracking — ported verbatim from the HTML flow view */}
      <FlowStream
        title="⚠️ Advance Tracking 预支追踪"
        rows={[
          [m.fullPayout ? 'Balance (100% after Saving)' : `Total Pay (${settings.gbPct}% Gross Balance)`, fmtRM(d.totalPay)],
          ['Fixed Salary', fmtRM(d.dirFixed)],
          [
            m.fullPayout
              ? d.vrKpi < 0
                ? 'Shortfall (需 Advance Top-up)'
                : d.vrKpi > 0
                  ? 'Exceed Fixed (算 KPI)'
                  : 'Balance = Fixed'
              : 'Vr KPI (Total Pay − Fixed)',
            `${d.vrKpi < 0 ? '-' : d.vrKpi > 0 ? '+' : ''}RM ${fmt(Math.abs(d.vrKpi))}`,
            true,
            d.vrKpi < 0 ? 'danger' : d.vrKpi > 0 ? 'ledger' : undefined,
          ],
          ...(!m.fullPayout && d.advanceOffset > 0
            ? ([['Less: Vr KPI Offset Advance (抵消预支)', `- RM ${fmt(d.advanceOffset)}`, false, 'ledger']] as FlowRow[])
            : []),
          ...(m.fullPayout && d.advThisMonth < 0
            ? ([['+ Advance This Month (公司 top-up 到 Fixed)', `+ RM ${fmt(Math.abs(d.advThisMonth))}`, false, 'danger']] as FlowRow[])
            : []),
          ...(d.advStatAmount > 0
            ? ([['+ Advance Statutory (自己填) → Accum. Advance', `+ RM ${fmt(d.advStatAmount)}`, false, 'danger']] as FlowRow[])
            : []),
          ...(d.allowStatAmount > 0
            ? ([['+ 75% Allow Statutory (自己填) → Accum. Advance', `+ RM ${fmt(d.allowStatAmount)}`, false, 'alert']] as FlowRow[])
            : []),
          ...(totalAdvBox > 0
            ? ([[
                `Total Advance (Adv${d.advStatAmount > 0 ? ' + Adv Stat' : ''}${d.allowStatAmount > 0 ? ' + Allow Stat' : ''})`,
                fmtRM(totalAdvBox),
                true,
                'danger',
              ]] as FlowRow[])
            : []),
        ]}
      />
      {/* Stream 4: Billing Invoice Detail — ported verbatim from the HTML flow view */}
      {!m.fullPayout && (
        <FlowStream
          title="📄 25% Billing Invoice + Statutory Detail"
          rows={[
            ['── Salary + KPI ──', '', false, 'muted'],
            ['25% Billing Invoice (Salary Pay)', fmtRM(d.salKpiBillInv)],
            ['25% Statutory (Sal+KPI 自己填)', fmtRM(statSalVal)],
            ['── Allowance ──', '', false, 'muted'],
            ['25% Billing Invoice (Allowance)', d.allowGross > 0 ? fmtRM(d.allowBillInv) : '-'],
            ...(sas ? ([['25% Statutory (Allow 自己填)', fmtRM(statAlVal)]] as FlowRow[]) : []),
            ['Total 25% Billing Invoice', fmtRM(total25), true, 'ledger'],
            ...(m.billingDeductAdv && totalAdvBox > 0
              ? ([
                  [
                    `(-) Total Advance Deduct${totalAdvBox > total25 ? ' (capped at billing)' : ''}`,
                    `- RM ${fmt(Math.min(totalAdvBox, total25))}`,
                    false,
                    'danger',
                  ],
                  ...(totalAdvBox > total25
                    ? ([['⚠️ Remaining Advance → Accum. Advance', fmtRM(r2(totalAdvBox - total25)), false, 'danger']] as FlowRow[])
                    : []),
                  ['Net 25% Billing (After Deduct Advance)', fmtRM(r2(Math.max(0, total25 - totalAdvBox))), true, 'alert'],
                ] as FlowRow[])
              : []),
            [
              '→ Payout as Allowance（算进 Total Pay）',
              m.includeBilling ? fmtRM(r2(statSalVal + statAlVal)) : '不算进 (Separate)',
              false,
              m.includeBilling ? 'ledger' : 'muted',
            ],
          ]}
        />
      )}
    </div>
  )
}
