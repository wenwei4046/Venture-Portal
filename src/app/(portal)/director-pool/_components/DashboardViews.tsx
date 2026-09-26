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
  hrPayout,
  hrPayoutTotal,
  billingAccum,
  savingAccum,
  allowStatAccum,
  billingDeductAdjustment,
  contraOffset,
  type MonthResult,
  type DirectorMonthResult,
  type AllowanceSlice,
  type DirectorInputMap,
  type DpContraEvent,
  type DpDirector,
  type DpSettings,
} from '@/lib/director-pool-engine'
import type { DpCompany } from '@/lib/director-pool-data'
import { fmt, fmtRM, Money, MoneyInput, MonthTabs, Dot, TopUpHint, MONTH_BAND, pillClass } from './DirectorPoolClient'
import LedgerRow from '@/components/LedgerRow'
import { StatCard, StatCards } from '@/components/sheet/StatCard'

// Chart-series palette for companies (data colours, mirrors the HTML tool)
const CO_COLORS = ['#4a9eff', '#f5a623', '#2ec4b6', '#e74c3c', '#9b8dd9', '#20b2aa', '#b39ddb']

// The charts' own chrome in the sheet's tone — black lettering, hairline
// rules. The series keep their data colours (CO_COLORS, the directors' own).
const INK = 'rgb(var(--ink))'
const HAIRLINE = 'rgb(var(--hairline))'
const X_TICK = { fontSize: 11, fill: INK }
const Y_TICK = { fontSize: 10, fill: INK }
const TOOLTIP_STYLE = { border: `1px solid ${HAIRLINE}`, borderRadius: 8, fontSize: 12 }
const TOOLTIP_LABEL = { color: INK, fontWeight: 600 }
/** Recharts letters each legend entry in its series colour; the sheet's are black. */
const legendText = (value: string) => <span style={{ color: INK }}>{value}</span>

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
      <div className="border border-hairline rounded-card bg-surface-2 p-6 text-center">
        <p className="text-sm">No data yet — add months in the Calculator tab first.</p>
      </div>
    )
  }

  return (
    <div>
      <DashKpis {...p} />
      <div className="sheet-tabs" role="tablist" aria-label="Dashboard views">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
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

/** A view's own figure card — the sheet's card (white, hairline, 12px
 *  radius) in the summary cards' lettering, compact because these sit under
 *  the dashboard's StatCards and often carry a director's colour dot in the
 *  label, which a StatCard's string label cannot. */
function Card({ label, value, sub, danger }: { label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode; danger?: boolean }) {
  return (
    <div className="border border-hairline rounded-card bg-surface px-4 py-3.5">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.06em]">{label}</div>
      <div className={`text-lg font-bold tabular-nums tracking-[-0.02em] ${danger ? 'text-danger' : ''}`}>{value}</div>
      {sub != null && <div className="mt-1 text-[11px] leading-snug">{sub}</div>}
    </div>
  )
}

/** A month's band row in an All Months table — the header band's tone,
 *  its label in small caps (see MONTH_BAND). */
function MonthHeadRow({ m, colSpan, extra }: { m: MonthResult; colSpan: number; extra?: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className={MONTH_BAND}>
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
  // The pool across every month is what the dashboard is opened for — the
  // sheet's one walnut card. An outstanding advance reads red while it holds.
  return (
    <StatCards label="Director Pool across all months">
      <StatCard label="Total Pool (All Months)" value={fmtRM(r2(totalPool))} icon="coin" tone="primary" note={`${results.length} month(s)`} />
      <StatCard label="Total Saving" value={fmtRM(r2(totalSaving))} icon="bank" note="Sal+KPI + Allowance saving" />
      <StatCard label="Total Gross Balance" value={fmtRM(r2(totalGB))} icon="wallet" note="Paid to directors (Sal+KPI)" />
      <StatCard label="Total Allowance Pool" value={fmtRM(r2(totalAllow))} icon="gift" note="Across all months" />
      <StatCard
        label="Outstanding Advance"
        value={<Money v={latestAdv} dash="RM 0.00" />}
        icon="clock"
        tone={latestAdv < 0 ? 'danger' : undefined}
        note="Accumulated (latest month)"
      />
    </StatCards>
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
      <div className="border border-hairline rounded-card bg-surface p-4">
        <h3 className="text-sm font-bold mb-3">Monthly Pool Trend 月度薪资池</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={poolData}>
            <CartesianGrid strokeDasharray="3 3" stroke={HAIRLINE} />
            <XAxis dataKey="name" tick={X_TICK} stroke={HAIRLINE} />
            <YAxis tick={Y_TICK} stroke={HAIRLINE} tickFormatter={(v: number) => (v >= 1000 ? `${v / 1000}k` : String(v))} />
            <Tooltip formatter={(v) => fmtRM(Number(v))} contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL} />
            <Legend wrapperStyle={{ fontSize: 11 }} formatter={legendText} />
            <Bar dataKey="Salary" stackId="a" fill={CO_COLORS[0]} radius={[0, 0, 0, 0]} />
            <Bar dataKey="KPI" stackId="a" fill={CO_COLORS[2]} />
            <Bar dataKey="Allowance" stackId="a" fill={CO_COLORS[1]} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="border border-hairline rounded-card bg-surface p-4">
        <h3 className="text-sm font-bold mb-3">Director Total Pay Comparison (per Month)</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={payData}>
            <CartesianGrid strokeDasharray="3 3" stroke={HAIRLINE} />
            <XAxis dataKey="name" tick={X_TICK} stroke={HAIRLINE} />
            <YAxis tick={Y_TICK} stroke={HAIRLINE} tickFormatter={(v: number) => (v >= 1000 ? `${v / 1000}k` : String(v))} />
            <Tooltip formatter={(v) => fmtRM(Number(v))} contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL} />
            <Legend wrapperStyle={{ fontSize: 11 }} formatter={legendText} />
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
      <div className="border border-hairline rounded-card bg-surface p-4 mb-6">
        <h3 className="text-sm font-bold mb-3">Company Contribution per Month 各公司月度贡献</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke={HAIRLINE} />
            <XAxis dataKey="name" tick={X_TICK} stroke={HAIRLINE} />
            <YAxis tick={Y_TICK} stroke={HAIRLINE} tickFormatter={(v: number) => (v >= 1000 ? `${v / 1000}k` : String(v))} />
            <Tooltip formatter={(v) => fmtRM(Number(v))} contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL} />
            <Legend wrapperStyle={{ fontSize: 11 }} formatter={legendText} />
            {companies.map((c, i) => (
              <Bar key={c.id} dataKey={c.name} stackId="a" fill={CO_COLORS[i % CO_COLORS.length]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="sheet-toolbar">
        <MonthTabs months={results} value={pick.value} onChange={pick.setPicked} allowAll />
      </div>
      <div className="overflow-x-auto">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Month</th>
              <th>Company</th>
              <th className="right m-hide">Salary</th>
              <th className="right m-hide">KPI</th>
              <th className="right m-hide">Allowance</th>
              <th className="right">Total</th>
              <th className="lt-toggle" aria-hidden />
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
                  <LedgerRow key={`${m.id}-${c.id}`}>
                    <td className="font-mono text-xs">{m.name}</td>
                    <td className="font-medium">{c.name}</td>
                    <td className="num m-hide" data-label="Salary">{co?.salary ? fmt(co.salary) : '—'}</td>
                    <td className="num m-hide" data-label="KPI">{co?.kpi ? fmt(co.kpi) : '—'}</td>
                    <td className="num m-hide" data-label="Allowance">{co?.allowance ? fmt(co.allowance) : '—'}</td>
                    <td className="num font-medium">{fmt(t)}</td>
                  </LedgerRow>
                )
              }),
            ])}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>Total</td>
              <td className="num m-hide">{fmt(r2(gS))}</td>
              <td className="num m-hide">{fmt(r2(gK))}</td>
              <td className="num m-hide">{fmt(r2(gA))}</td>
              <td className="num font-bold">{fmt(r2(gT))}</td>
              <td className="lt-toggle" />
            </tr>
          </tfoot>
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
      <div className="sheet-toolbar">
        <MonthTabs months={results} value={pick.value} onChange={pick.setPicked} allowAll />
      </div>
      <div className="overflow-x-auto">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Month</th>
              <th>Director</th>
              <th className="right m-hide">Weight</th>
              <th className="right m-hide">Sal+KPI Gross</th>
              <th className="right m-hide">Allow Gross</th>
              <th className="right m-hide">Total Saving</th>
              <th className="right m-hide">Gross Bal</th>
              <th className="right m-hide">Allow Bal (95%)</th>
              <th className="right">Total Pay</th>
              <th className="right m-hide">Vr KPI</th>
              <th className="right m-hide">Accum. Advance</th>
              <th className="lt-toggle" aria-hidden />
            </tr>
          </thead>
          <tbody>
            {pick.visible.map((m) => [
              <MonthHeadRow key={`${m.id}-h`} m={m} colSpan={11} />,
              ...m.dirRes.map((d) => {
                g.skg += d.salKpiGross; g.ag += d.allowGross; g.save += d.totalSaving
                g.gb += d.salKpiGB; g.ab += d.allowBalance; g.pay += d.totalPay
                return (
                  <LedgerRow key={`${m.id}-${d.id}`}>
                    <td className="font-mono text-xs">{m.name}</td>
                    <td className="whitespace-nowrap"><Dot color={d.color} /><span className="font-medium">{d.code}</span></td>
                    <td className="num m-hide" data-label="Weight">{d.weight}%</td>
                    <td className="num m-hide" data-label="Sal+KPI Gross">{fmt(d.salKpiGross)}</td>
                    <td className="num m-hide" data-label="Allow Gross">{d.allowGross > 0 ? fmt(d.allowGross) : '—'}</td>
                    <td className="num m-hide" data-label="Total Saving">{fmt(d.totalSaving)}</td>
                    <td className="num m-hide" data-label="Gross Bal">{m.fullPayout ? '—' : fmt(d.salKpiGB)}</td>
                    <td className="num m-hide" data-label="Allow Bal (95%)">{d.allowGross > 0 ? fmt(d.allowBalance) : '—'}</td>
                    <td className="num font-medium">{fmt(d.totalPay)}</td>
                    <td className="num m-hide" data-label="Vr KPI">
                      {Math.abs(d.vrKpi) < 0.005 ? '—' : (
                        <span className={d.vrKpi < 0 ? 'text-danger' : 'text-ledger'}>{fmt(d.vrKpi)}</span>
                      )}
                    </td>
                    <td className="num m-hide" data-label="Accum. Advance">
                      {Math.abs(d.accumulated) < 0.005 ? '—' : (
                        <span className={d.accumulated < 0 ? 'text-danger' : ''}>
                          {d.accumulated < 0 ? `(${fmt(Math.abs(d.accumulated))})` : fmt(d.accumulated)}
                        </span>
                      )}
                    </td>
                  </LedgerRow>
                )
              }),
            ])}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>Total</td>
              <td className="num m-hide">{fmt(r2(g.skg))}</td>
              <td className="num m-hide">{fmt(r2(g.ag))}</td>
              <td className="num m-hide">{fmt(r2(g.save))}</td>
              <td className="num m-hide">{fmt(r2(g.gb))}</td>
              <td className="num m-hide">{fmt(r2(g.ab))}</td>
              <td className="num font-bold">{fmt(r2(g.pay))}</td>
              <td colSpan={2} className="m-hide" />
              <td className="lt-toggle" />
            </tr>
          </tfoot>
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
    const adj = billingDeductAdjustment(d.id, latest.id, results)
    const adjAccum = r2(d.accumulated + adj)
    adjTotal += adjAccum
    // Statutory that actually entered the debt (keyed minus surplus-covered).
    const totStat = r2(
      results.reduce((s, m) => {
        const dd = m.dirRes.find((x) => x.id === d.id)
        return s + (dd ? r2(dd.advStatAmount + dd.allowStatAmount - dd.statFromSurplus) : 0)
      }, 0),
    )
    return { d, adjAccum, adj, totStat }
  })
  adjTotal = r2(adjTotal)

  const g = { pay: 0, fixed: 0, vr: 0, adv: 0, advStat: 0, allowStat: 0 }
  return (
    <div>
      <p className="sheet-notice">
        当 Total Pay &lt; Fixed Salary 时，差额作为 Salary Advance（预支）累计。KPI 盈余抵消累计
        Advance；Adv Statutory 与 75% Allow Statutory 都会加入欠款。
      </p>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <Card label="Total Accumulated Advance" value={<Money v={adjTotal} dash="RM 0.00" />} sub={`All directors (${latest.name})`} danger={adjTotal < 0} />
        {cards.map(({ d, adjAccum, adj, totStat }) => (
          <Card
            key={d.id}
            label={<><Dot color={d.color} />{d.code} Accum. Advance</>}
            value={<Money v={adjAccum} dash="RM 0.00" />}
            danger={adjAccum < 0}
            sub={
              <>
                As of {latest.name}
                {adj > 0 && <> · billing deduct +{fmt(adj)}</>}
                {totStat > 0 && <> · incl. statutory RM {fmt(totStat)}</>}
              </>
            }
          />
        ))}
      </div>
      <div className="sheet-toolbar">
        <MonthTabs months={results} value={pick.value} onChange={pick.setPicked} allowAll />
      </div>
      <div className="table-frame">
        <div className="table-frame-scroll">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Director</th>
                <th className="right">Total Pay</th>
                <th className="right m-hide">Fixed Salary</th>
                <th className="right m-hide">Vr KPI</th>
                <th className="right m-hide">Adv This Month</th>
                <th className="right m-hide">Adv Stat</th>
                <th className="right m-hide">Allow Stat</th>
                <th className="right m-hide">Prev. Accum</th>
                <th className="right m-hide">Accum. Advance</th>
                <th className="right m-hide">✏️ Override Adv</th>
                <th className="right m-hide">✏️ Override Accum.</th>
                <th className="lt-toggle" aria-hidden />
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
                    // A hand-overridden month stands out: a peach wash and bold
                    // figures, painted on the cells so the zebra cannot cover it.
                    <LedgerRow key={`${m.id}-${d.id}`} className={d.hasOverride ? '[&>td]:bg-accent-bg [&>td]:font-bold' : undefined}>
                      <td className="font-mono text-xs">{m.name}</td>
                      <td className="whitespace-nowrap">
                        <Dot color={d.color} /><span className="font-medium">{d.code}</span>
                        {d.hasOverride && <em className="text-[10px] ml-1">✏️</em>}
                      </td>
                      <td className="num">{fmt(d.totalPay)}</td>
                      <td className="num m-hide" data-label="Fixed Salary">{fmt(d.dirFixed)}</td>
                      <td className="num m-hide" data-label="Vr KPI">
                        {Math.abs(d.vrKpi) < 0.005 ? '—' : <span className={d.vrKpi < 0 ? 'text-danger' : 'text-ledger'}>{fmt(d.vrKpi)}</span>}
                      </td>
                      <td className="num m-hide" data-label="Adv This Month">{d.advThisMonth < 0 ? <span className="text-danger">({fmt(Math.abs(d.advThisMonth))})</span> : '—'}</td>
                      <td className="num m-hide" data-label="Adv Stat">{d.advStatAmount > 0 ? <span className="text-danger">{fmt(d.advStatAmount)}</span> : '—'}</td>
                      <td className="num m-hide" data-label="Allow Stat">{d.allowStatAmount > 0 ? <span className="text-alert">{fmt(d.allowStatAmount)}</span> : '—'}</td>
                      <td className="num m-hide" data-label="Prev. Accum">
                        {Math.abs(d.prevAccum) < 0.005 ? '—' : (
                          <span className={d.prevAccum < 0 ? 'text-danger' : ''}>
                            {d.prevAccum < 0 ? `(${fmt(Math.abs(d.prevAccum))})` : fmt(d.prevAccum)}
                          </span>
                        )}
                      </td>
                      <td className="num font-medium m-hide" data-label="Accum. Advance">
                        {Math.abs(d.accumulated) < 0.005 ? '—' : (
                          <span className={d.accumulated < 0 ? 'text-danger' : ''}>
                            {d.accumulated < 0 ? `(${fmt(Math.abs(d.accumulated))})` : fmt(d.accumulated)}
                          </span>
                        )}
                      </td>
                      <td className="num m-hide" data-label="✏️ Override Adv">
                        <MoneyInput value={inp.advOverrideThis ?? null} placeholder="—" onCommit={(v) => p.onDirInput(m.id, d.id, 'advOverrideThis', v)} className="w-24" />
                      </td>
                      <td className="num m-hide" data-label="✏️ Override Accum.">
                        <MoneyInput value={inp.advOverrideAccum ?? null} placeholder="—" onCommit={(v) => p.onDirInput(m.id, d.id, 'advOverrideAccum', v)} className="w-24" />
                      </td>
                    </LedgerRow>
                  )
                }),
              ])}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>Total</td>
                <td className="num font-bold">{fmt(r2(g.pay))}</td>
                <td className="num m-hide">{fmt(r2(g.fixed))}</td>
                <td className="num m-hide"><span className={g.vr < 0 ? 'text-danger' : 'text-ledger'}>{fmt(r2(g.vr))}</span></td>
                <td className="num m-hide">{g.adv < 0 ? <span className="text-danger">({fmt(Math.abs(r2(g.adv)))})</span> : '—'}</td>
                <td className="num m-hide">{g.advStat > 0 ? <span className="text-danger">{fmt(r2(g.advStat))}</span> : '—'}</td>
                <td className="num m-hide">{g.allowStat > 0 ? <span className="text-alert">{fmt(r2(g.allowStat))}</span> : '—'}</td>
                <td colSpan={4} className="m-hide" />
                <td className="lt-toggle" />
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="table-frame-foot">
          <p className="leading-relaxed">
            ✏️ Manual Override：填入负数代表 Advance（如 -1950.79）。留空则使用系统自动计算。Adv Stat（25%）与 Allow
            Stat（75% Allowance）都会加入 Accumulated Advance。
          </p>
        </div>
      </div>
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
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <Card label="25% Invoice (Salary Pay)" value={fmtRM(r2(sSal))} sub={label} />
        <Card label="25% Invoice (Allowance)" value={fmtRM(r2(sAl))} sub={label} />
        <Card label="Statutory (Sal+KPI)" value={fmtRM(r2(sStatSal))} sub={label} />
        <Card label="Statutory (Allowance)" value={fmtRM(r2(sStatAl))} sub={label} />
        <Card label="Total 25% Billing Invoice" value={fmtRM(r2(sSal + sAl + sStatSal + sStatAl))} sub={label} />
      </div>

      {/* Contra moves money between two ledgers — an amber-edged outline,
          not the sheet's orange (that stays the one 💾 Save). */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-sm font-bold">
          Accumulated Total 25% Billing Invoice <span className="font-normal">(as of {lastVis.name})</span>
        </h3>
        <div className="flex gap-2">
          {contra.length > 0 && (
            <button
              type="button"
              onClick={p.onResetContra}
              className="bg-surface hover:bg-danger-bg border border-danger/40 hover:border-danger text-danger text-xs px-3 py-1.5 rounded-control transition-colors"
            >
              ✕ Reset Contra
            </button>
          )}
          <button
            type="button"
            onClick={p.onContra}
            className="bg-surface hover:bg-alert-bg border border-alert text-xs font-medium px-3 py-1.5 rounded-control transition-colors"
          >
            ⚡ Contra Billing vs Advance
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
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

      <div className="sheet-toolbar">
        <MonthTabs months={results} value={pick.value} onChange={pick.setPicked} allowAll />
      </div>
      <div className="overflow-x-auto">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Month</th>
              <th>Director</th>
              <th className="right m-hide">25% Invoice (Salary)</th>
              <th className="right m-hide">25% Statutory (自己填)</th>
              <th className="right m-hide">25% Invoice (Allow)</th>
              <th className="right m-hide">25% Statutory (Allow 自己填)</th>
              <th className="right">Total 25%</th>
              <th className="right m-hide">Adv. Deduct</th>
              <th className="right m-hide">Net 25% Billing</th>
              <th className="right m-hide">Include Billing?</th>
              <th className="lt-toggle" aria-hidden />
            </tr>
          </thead>
          <tbody>
            {pick.visible.map((m) => [
              <tr key={`${m.id}-h`}>
                <td colSpan={10} className="bg-chrome/50">
                  {/* The band's label in its small caps; the toggle beside it
                      keeps its sentence case, a chip that washes when on. */}
                  <span className="text-[10px] font-semibold uppercase tracking-[0.06em]">
                    {m.name}
                    {m.fullPayout && ' · 💯 Full Payout'}
                    {m.includeBilling && ' · 📥 Incl. Billing'}
                  </span>
                  {!m.fullPayout && (
                    <button
                      type="button"
                      aria-pressed={m.billingDeductAdv}
                      onClick={() => p.onFlag(m.id, 'billingDeductAdv', !m.billingDeductAdv)}
                      className={`ml-3 px-2.5 py-0.5 rounded-full border text-[10.5px] transition-colors ${
                        m.billingDeductAdv
                          ? 'border-accent bg-accent-bg font-semibold'
                          : 'border-hairline bg-surface hover:border-accent'
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
                const totalAdv = r2(Math.abs(d.advThisMonth) + d.advStatAmount + d.allowStatAmount - d.statFromSurplus)
                const advDeduct = d.billingDeduct
                // Deduct can exceed this month's additions — the excess repays
                // old accumulated advance (2026-08-03 rule).
                const advRemain = m.billingDeductAdv && totalAdv > 0 ? r2(Math.max(0, totalAdv - advDeduct)) : 0
                const oldRepaid = m.billingDeductAdv ? r2(Math.max(0, advDeduct - totalAdv)) : 0
                const net = m.billingDeductAdv && !m.fullPayout ? r2(row.total - advDeduct) : 0
                g.salSys += row.salSys; g.statSal += row.statSal; g.alSys += row.alSys; g.statAl += row.statAl
                g.total += row.total; g.advDeduct += advDeduct; g.net += net
                const dash = <span className="text-graphite">—</span>
                return (
                  <LedgerRow key={`${m.id}-${d.id}`}>
                    <td className="font-mono text-xs">{m.name}</td>
                    <td className="whitespace-nowrap"><Dot color={d.color} /><span className="font-medium">{d.code}</span></td>
                    <td className="num m-hide" data-label="25% Invoice (Salary)">{m.fullPayout ? dash : fmt(row.salSys)}</td>
                    <td className="num m-hide" data-label="25% Statutory">
                      {m.fullPayout ? dash : (
                        <MoneyInput value={inp.billingStat ?? null} placeholder="填写" onCommit={(v) => p.onDirInput(m.id, d.id, 'billingStat', v)} className="w-28" />
                      )}
                    </td>
                    <td className="num m-hide" data-label="25% Invoice (Allow)">{m.fullPayout ? dash : d.allowGross > 0 ? fmt(row.alSys) : '—'}</td>
                    <td className="num m-hide" data-label="25% Statutory (Allow)">
                      {m.fullPayout || !sas ? dash : (
                        <MoneyInput value={inp.allowBillingStat ?? null} placeholder="填写" onCommit={(v) => p.onDirInput(m.id, d.id, 'allowBillingStat', v)} className="w-24" />
                      )}
                    </td>
                    <td className="num font-semibold">{m.fullPayout ? dash : fmt(row.total)}</td>
                    <td className="num m-hide" data-label="Adv. Deduct">
                      {m.fullPayout || !m.billingDeductAdv ? dash : advDeduct > 0 ? (
                        <span className="text-danger">
                          ({fmt(advDeduct)})
                          {advRemain > 0 && <span className="block font-mono text-[9.5px] text-graphite">余 {fmt(advRemain)} → Accum</span>}
                          {oldRepaid > 0 && <span className="block font-mono text-[9.5px] text-graphite">含还旧账 {fmt(oldRepaid)}</span>}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="num font-medium m-hide" data-label="Net 25% Billing">{m.fullPayout || !m.billingDeductAdv ? dash : <span className="text-alert">{fmt(net)}</span>}</td>
                    <td className="num m-hide" data-label="Include Billing?">
                      {/* A yes / no answer — a word on a wash, green when it is in. */}
                      {m.fullPayout ? <span className="chip">N/A</span> : m.includeBilling ? <span className="chip ledger">✅ Yes</span> : <span className="chip">No</span>}
                    </td>
                  </LedgerRow>
                )
              }),
            ])}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>Total</td>
              <td className="num m-hide">{fmt(r2(g.salSys))}</td>
              <td className="num m-hide">{fmt(r2(g.statSal))}</td>
              <td className="num m-hide">{fmt(r2(g.alSys))}</td>
              <td className="num m-hide">{fmt(r2(g.statAl))}</td>
              <td className="num font-bold">{fmt(r2(g.total))}</td>
              <td className="num m-hide">{g.advDeduct > 0 ? <span className="text-danger">({fmt(r2(g.advDeduct))})</span> : '—'}</td>
              <td className="num m-hide">{g.net > 0 ? <span className="text-alert">{fmt(r2(g.net))}</span> : '—'}</td>
              <td className="m-hide" />
              <td className="lt-toggle" />
            </tr>
          </tfoot>
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
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
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
      <div className="sheet-toolbar">
        <MonthTabs months={results} value={pick.value} onChange={pick.setPicked} allowAll />
      </div>
      <div className="overflow-x-auto">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Month</th>
              <th>Director</th>
              <th className="right m-hide">Sal+KPI Saving</th>
              <th className="right m-hide">Allowance Saving</th>
              <th className="right m-hide">Total Saving</th>
              <th className="right m-hide">Withdraw (自己填)</th>
              <th className="right">Accum. Saving</th>
              <th className="lt-toggle" aria-hidden />
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
                  <LedgerRow key={`${m.id}-${d.id}`}>
                    <td className="font-mono text-xs">{m.name}</td>
                    <td className="whitespace-nowrap"><Dot color={d.color} /><span className="font-medium">{d.code}</span></td>
                    <td className="num m-hide" data-label="Sal+KPI Saving">{fmt(d.salKpiSaving)}</td>
                    <td className="num m-hide" data-label="Allowance Saving">{d.allowGross > 0 ? fmt(d.allowSaving) : '—'}</td>
                    <td className="num font-medium m-hide" data-label="Total Saving">{fmt(d.totalSaving)}</td>
                    <td className="num m-hide" data-label="Withdraw">
                      <MoneyInput value={wd} placeholder="RM" onCommit={(v) => p.onDirInput(m.id, d.id, 'savingWithdrawal', v)} className="w-24" />
                    </td>
                    <td className="num font-medium text-ledger">{fmt(savingAccum(d.id, m.id, results, dirInputs))}</td>
                  </LedgerRow>
                )
              }),
            ])}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>Total</td>
              <td className="num m-hide">{fmt(r2(g.sk))}</td>
              <td className="num m-hide">{g.al > 0 ? fmt(r2(g.al)) : '—'}</td>
              <td className="num m-hide">{fmt(r2(g.tot))}</td>
              <td className="num m-hide">{g.wd > 0 ? <span className="text-danger">({fmt(r2(g.wd))})</span> : '—'}</td>
              <td className="num font-bold text-ledger">{fmt(r2(g.tot - g.wd))}</td>
              <td className="lt-toggle" />
            </tr>
          </tfoot>
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
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
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
      <div className="sheet-toolbar">
        <MonthTabs months={results} value={pick.value} onChange={pick.setPicked} allowAll />
      </div>
      <div className="overflow-x-auto">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Month</th>
              <th>Director</th>
              <th className="right m-hide">75% Allowance</th>
              <th className="right m-hide">Statutory (自己填)</th>
              <th className="right">Accum. Statutory</th>
              <th className="lt-toggle" aria-hidden />
            </tr>
          </thead>
          <tbody>
            {pick.visible.map((m) => [
              <MonthHeadRow key={`${m.id}-h`} m={m} colSpan={5} />,
              ...m.dirRes.map((d) => {
                const inp = dirInputs[d.statKey] ?? {}
                g.allow += d.allowGB; g.stat += inp.allowPayStat ?? 0
                return (
                  <LedgerRow key={`${m.id}-${d.id}`}>
                    <td className="font-mono text-xs">{m.name}</td>
                    <td className="whitespace-nowrap"><Dot color={d.color} /><span className="font-medium">{d.code}</span></td>
                    <td className="num m-hide" data-label="75% Allowance">{m.fullPayout ? '—' : fmt(d.allowGB)}</td>
                    <td className="num m-hide" data-label="Statutory">
                      <MoneyInput value={inp.allowPayStat ?? null} placeholder="填写" onCommit={(v) => p.onDirInput(m.id, d.id, 'allowPayStat', v)} className="w-24" />
                      {!m.fullPayout && <TopUpHint d={d} />}
                    </td>
                    <td className="num font-medium text-ledger">
                      {allowStatAccum(d.id, m.id, results, dirInputs) > 0 ? fmt(allowStatAccum(d.id, m.id, results, dirInputs)) : '—'}
                    </td>
                  </LedgerRow>
                )
              }),
            ])}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>Total</td>
              <td className="num m-hide">{fmt(r2(g.allow))}</td>
              <td className="num m-hide">{g.stat > 0 ? fmt(r2(g.stat)) : '—'}</td>
              <td className="num font-bold text-ledger">{g.stat > 0 ? fmt(r2(g.stat)) : '—'}</td>
              <td className="lt-toggle" />
            </tr>
          </tfoot>
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
    <div className="border border-hairline rounded-card bg-surface px-4 py-3 text-center min-w-[130px] flex-1">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.06em]">{label}</div>
      <div className="text-md font-bold tabular-nums">{value}</div>
    </div>
  )
}

type FlowRow = [string, string, boolean?, ('danger' | 'ledger' | 'alert' | 'muted')?]

/** The gross → saving → balance → split chain for one allowance slice. */
function allowanceChain(
  a: AllowanceSlice,
  full: boolean,
  settings: Pick<DpSettings, 'savingPct' | 'gbPct'>,
): FlowRow[] {
  return [
    ['Allowance Gross (Pool × Weight)', fmtRM(a.gross)],
    [`Less: Saving (${settings.savingPct}%)`, `- RM ${fmt(a.saving)}`],
    [`= Allowance Balance (${r2(100 - settings.savingPct)}%)`, fmtRM(a.balance), true],
    ...(full
      ? ([['💯 Full Payout → 100% Balance to Director', fmtRM(a.gb), true]] as FlowRow[])
      : ([
          [`${settings.gbPct}% → Gross Balance (Director Pay)`, fmtRM(a.gb), true],
          [`${r2(100 - settings.gbPct)}% → Billing Invoice`, fmtRM(a.billInv)],
        ] as FlowRow[])),
  ]
}

/**
 * The Allowance Stream. With a separately-transferred slice it lists the two
 * transfers as their own sections plus a total, so a "75% →" row really is 75%
 * — the merged chain used to hide HV's 100% slice inside it (user question
 * 2026-09-18). Without one it is the single chain it has always been.
 */
export function allowanceStreamRows(
  d: Pick<
    DirectorMonthResult,
    'allowInPay' | 'allowExcl' | 'allowGross' | 'allowSaving' | 'allowGB' | 'allowBillInv'
  >,
  m: Pick<MonthResult, 'fullPayout' | 'allowExclFullPayout'>,
  settings: Pick<DpSettings, 'savingPct' | 'gbPct'>,
  exclName: string,
): FlowRow[] {
  if (d.allowExcl.gross <= 0) return allowanceChain(d.allowInPay, m.fullPayout, settings)
  return [
    ['── 月头那笔 · 其他公司 ──', '', false, 'muted'],
    ...allowanceChain(d.allowInPay, m.fullPayout, settings),
    [`── 15号那笔 · ${exclName} ──`, '', false, 'muted'],
    ...allowanceChain(d.allowExcl, m.fullPayout || m.allowExclFullPayout, settings),
    ['── 合计 ──', '', false, 'muted'],
    ['Allowance Gross 合计', fmtRM(d.allowGross)],
    [`Saving (${settings.savingPct}%) 合计`, `- RM ${fmt(d.allowSaving)}`],
    ['过给 Director 合计', fmtRM(d.allowGB), true],
    [`${r2(100 - settings.gbPct)}% Billing Invoice 合计`, fmtRM(d.allowBillInv)],
  ]
}

function FlowStream({ title, rows }: { title: string; rows: FlowRow[] }) {
  // Plain ink except the muted section separators — synced with the PDF
  const toneCls = { danger: 'text-ink', ledger: 'text-ink', alert: 'text-ink', muted: 'text-graphite' }
  // A two-column ledger in the month's table dress: the title on the header
  // band in small caps, 12px rows, a bold line on a light band.
  return (
    <div className="border border-hairline rounded-card bg-surface overflow-hidden mb-4">
      <div className="px-4 py-2.5 bg-chrome/50 border-b border-hairline text-[10px] font-semibold uppercase tracking-[0.06em]">{title}</div>
      <div>
        {rows.map(([label, value, bold, tone], i) =>
          tone === 'muted' && !value ? (
            <div key={i} className="px-4 py-1 font-mono text-[10px] text-graphite border-b border-hairline last:border-0">
              {label}
            </div>
          ) : (
            <div
              key={i}
              className={`flex justify-between items-center px-4 py-2 border-b border-hairline last:border-0 text-[12px] ${bold ? 'font-bold bg-surface-2' : ''}`}
            >
              <span className={tone ? toneCls[tone] : 'text-ink'}>{label}</span>
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
  // The company that transfers its allowance separately, for labelling.
  const exclName = p.companies.find((c) => c.excludeFromPay)?.name ?? 'Houzs Venture'
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
  const totalHRPayout = hrPayout(d)
  // Advance added this month: statutory covered by the Vr KPI surplus never
  // becomes debt.
  const totalAdvBox = r2(Math.abs(d.advThisMonth) + d.advStatAmount + d.allowStatAmount - d.statFromSurplus)
  // Net exceed actually reaching the payout — after the debt offset and the
  // statutory paid from the surplus (user 2026-07-31: show the net, 外面的人
  // 才看得懂).
  const netExceed = r2(d.vrKpi - d.advanceOffset - d.statFromSurplus)

  const advAdj = billingDeductAdjustment(d.id, m.id, results)
  const accumAdvAdj = r2(d.accumulated + advAdj)
  const accumBill = r2(Math.max(0, billingAccum(d.id, m.id, results, dirInputs, settings) - contraOffset(d.id, m.id, results, contra)))
  const accumSave = savingAccum(d.id, m.id, results, dirInputs)

  // Card sub-notes show THIS MONTH's events only (user ruling 2026-07-31,
  // matching the Saving card) — the card VALUE stays accumulated as-of.
  const monthDeduct = d.billingDeduct
  const monthAdvStat = r2(d.advStatAmount)
  const monthAllowStat = r2(d.allowStatAmount)
  // Only the statutory that actually entered the debt.
  const monthStatAll = r2(monthAdvStat + monthAllowStat - d.statFromSurplus)
  const contraFromThisMonth = contra.some((ev) => ev.directorId === d.id && ev.fromMonthId === m.id)
  const contraOffHere = contraOffset(d.id, m.id, results, contra)
  const monthWithdraw = inp.savingWithdrawal ?? 0

  return (
    <div>
      {/* Which month and whose flow — the filter panel, two rows of pills. */}
      <div className="sheet-toolbar">
        <div className="flex w-full flex-wrap items-center gap-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.06em]">Month:</span>
          <MonthTabs months={results} value={monthId} onChange={setMonthId} />
        </div>
        <div className="flex w-full flex-wrap items-center gap-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.06em]">Director:</span>
          <div className="flex gap-1.5">
            {directors.map((x) => (
              <button
                key={x.id}
                type="button"
                aria-pressed={x.id === dirId}
                onClick={() => setDirId(x.id)}
                className={pillClass(x.id === dirId)}
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
              className="bg-surface hover:bg-surface-2 border border-hairline text-ink text-xs px-3 py-1.5 rounded-control transition-colors"
            >
              📄 PDF — {dir.code} ({m.name})
            </a>
            <a
              href={`/print/director-pool?month=${m.month}`}
              target="_blank"
              rel="noreferrer"
              className="bg-surface hover:bg-surface-2 border border-hairline text-ink text-xs px-3 py-1.5 rounded-control transition-colors"
            >
              📄 PDF — All Directors
            </a>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="border border-hairline rounded-card bg-surface px-5 py-4 mb-4 flex items-center gap-4">
        <div
          className="w-11 h-11 rounded-full flex items-center justify-center text-lg font-bold text-paper"
          style={{ backgroundColor: dir.color }}
        >
          {dir.code.charAt(0)}
        </div>
        <div>
          <div className="text-lg font-bold">{dir.code}</div>
          <div className="text-[11px] mt-0.5">
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
            {/* The chain covers the FIRST transfer only — the 15th's allowance
                gets its own box below, so every figure on this row belongs to
                the same payment (user request 2026-09-18). */}
            <FlowBox
              label={`75% Gross Balance (Sal+KPI+Allow)`}
              value={fmtRM(d.totalPay)}
              tone="info"
            />
          </>
        )}
        {d.advanceOffset > 0 ? (
          <FlowBox label="Vr KPI Offset Advance" value={fmtRM(d.advanceOffset)} tone="danger" />
        ) : totalAdvBox > 0 ? (
          <FlowBox label="Advance" value={fmtRM(totalAdvBox)} tone="danger" />
        ) : d.vrKpi > 0 && netExceed > 0 ? (
          <FlowBox label="Exceed (KPI)" value={`+ ${fmtRM(netExceed)}`} tone="ledger" />
        ) : null}
      </div>

      {/* The two transfers, as an equation. Without a 15th transfer this stays
          a single full-width box, exactly as before. */}
      <div className="flex flex-wrap items-stretch gap-2 mb-5">
        <FlowBox
          label={d.allowExcl.gb > 0 ? 'HR Payout Before Deduct Statutory (月头)' : 'HR Payout Before Deduct Statutory'}
          value={fmtRM(totalHRPayout)}
        />
        {d.allowExcl.gb > 0 && (
          <>
            <FlowBox label={`＋ ${exclName} Allowance (15号)`} value={fmtRM(d.allowExcl.gb)} />
            <FlowBox label="＝ 实际到手合计" value={fmtRM(hrPayoutTotal(d))} />
          </>
        )}
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
              {monthDeduct > 0 && <> (billing deduct: +RM {fmt(monthDeduct)})</>}
              {monthStatAll > 0 && (
                <>
                  {' '}(incl. statutory RM {fmt(monthStatAll)}
                  {d.statFromSurplus === 0 && monthAdvStat > 0 && monthAllowStat > 0
                    ? ` : Adv RM ${fmt(monthAdvStat)} + Allow RM ${fmt(monthAllowStat)}`
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
        <FlowStream title="🎁 Allowance Stream" rows={allowanceStreamRows(d, m, settings, exclName)} />
      )}
      {/* Stream 3: Advance Tracking — ported verbatim from the HTML flow view */}
      <FlowStream
        title="⚠️ Advance Tracking 预支追踪"
        rows={[
          [
            m.fullPayout
              ? 'Balance (100% after Saving)'
              : d.allowExcl.gb > 0
                ? `Total Pay (${settings.gbPct}% Gross Balance) · 月头那笔`
                : `Total Pay (${settings.gbPct}% Gross Balance)`,
            fmtRM(d.totalPay),
          ],
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
          ...(d.statFromSurplus > 0
            ? ([['Less: Statutory 由 Vr KPI 超额支付 (从 payout 扣)', `- RM ${fmt(d.statFromSurplus)}`, false, 'ledger']] as FlowRow[])
            : []),
          ...(d.statFromSurplus > 0 && netExceed > 0
            ? ([['Balance Advance (超额结余 → Payout)', `+ RM ${fmt(netExceed)}`, true, 'ledger']] as FlowRow[])
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
            ...(m.billingDeductAdv && (totalAdvBox > 0 || d.billingDeduct > 0)
              ? ([
                  [
                    `(-) Total Advance Deduct${totalAdvBox > total25 ? ' (capped at billing)' : ''}`,
                    `- RM ${fmt(d.billingDeduct)}`,
                    false,
                    'danger',
                  ],
                  // Excess over this month's additions repays OLD accumulated
                  // advance (2026-08-03 rule) — broken out so the deduct line
                  // reconciles against the Total Advance box above.
                  ...(d.billingDeduct > totalAdvBox
                    ? ([['↳ 含还旧账 (Old Advance Repaid)', fmtRM(r2(d.billingDeduct - totalAdvBox)), false, 'ledger']] as FlowRow[])
                    : []),
                  ...(totalAdvBox > d.billingDeduct
                    ? ([['⚠️ Remaining Advance → Accum. Advance', fmtRM(r2(totalAdvBox - d.billingDeduct)), false, 'danger']] as FlowRow[])
                    : []),
                  ['Net 25% Billing (After Deduct Advance)', fmtRM(r2(Math.max(0, total25 - d.billingDeduct))), true, 'alert'],
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
