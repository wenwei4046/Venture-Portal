'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { LeadIcon } from '@/components/layout/lead-icons'
import { refreshAdSpend, setAdAccountOutlet } from '@/lib/leads/actions'
import { OVERVIEW_RANGES, SST, daysIn, figuresOf, hasFigures, pct, rm, times, type OverviewData, type OverviewFigures, type OverviewRangeId } from '@/lib/leads/overview'
import type { LeadOutlet } from '@/lib/leads/outlets'
import { VISIT_SOURCES } from '@/lib/leads/visits'
import Segmented from './ui/Segmented'
import InsightViews from './InsightViews'
import u from './ui/ui.module.css'
import s from './overview.module.css'

/**
 * Lead View › Insight › Overview (2026-11-17 — the owner's "Performance Overview" sheet, "分不同的outlet"): all outlets
 * together, then one card per outlet with anything in the range. Spend is Meta's by ad account → outlet, with 8% SST;
 * inquiries are Lead View's chats by the customer's outlet; visits and sales are Leads › Showroom visits. Each figure
 * says how it is worked out on hover. Somebody with Lead View · Manage puts each ad account on its outlet below.
 */
export default function OverviewView({ data, outlets, brands, range, today, canManage, spendNote }: {
  data: OverviewData
  outlets: LeadOutlet[]
  brands: Array<{ id: string; name: string }>
  range: { key: OverviewRangeId; from: string; to: string; label: string }
  today: string
  canManage: boolean
  /** What happened asking Meta on the way in (refused accounts, Meta busy) — null when nothing to say. */
  spendNote: string | null
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(spendNote)
  const [draft, setDraft] = useState({ from: range.from, to: range.to })
  const days = daysIn(range.from, range.to)
  const brandName = (id: string) => brands.find(b => b.id === id)?.name ?? ''

  const all = useMemo(() => figuresOf(data, () => true, days), [data, days])
  const panels = useMemo(() => outlets.map(o => ({ o, f: figuresOf(data, id => id === o.id, days) })), [data, outlets, days])
  const none = useMemo(() => figuresOf(data, id => id === null, days), [data, days])
  const busy = panels.filter(p => hasFigures(p.f))
  const quiet = panels.filter(p => !hasFigures(p.f))

  const go = (q: Record<string, string>) => router.push(`/leads/insight?${new URLSearchParams({ v: 'overview', ...q }).toString()}`)
  const refresh = () => start(async () => {
    const r = await refreshAdSpend(range.from, range.to)
    setMsg(!r.ok ? r.reason : r.data.refused.length ? `Meta refused: ${r.data.refused.join('; ')}` : `Spend read again from Meta (${r.data.accounts} ad account${r.data.accounts === 1 ? '' : 's'}).`)
    router.refresh()
  })
  const place = (accountId: string, outletId: string) => start(async () => {
    const r = await setAdAccountOutlet(accountId, outletId || null)
    if (!r.ok) setMsg(r.reason)
    router.refresh()
  })
  const unplaced = data.accounts.filter(a => !a.outletId)

  return (
    <div className={s.wrap}>
      <div className={s.bar}>
        <InsightViews view="overview" />
        <span className={s.gap} />
        {range.key === 'custom' ? (
          <span className={s.dates}>
            <input type="date" className={s.date} value={draft.from} max={draft.to} onChange={e => setDraft(d => ({ ...d, from: e.target.value }))} aria-label="From" />
            to
            <input type="date" className={s.date} value={draft.to} min={draft.from} max={today} onChange={e => setDraft(d => ({ ...d, to: e.target.value }))} aria-label="To" />
            <button type="button" className={`${u.ghost} ${u.small}`} disabled={!draft.from || !draft.to || draft.from > draft.to} onClick={() => go({ r: 'custom', from: draft.from, to: draft.to })}>Apply</button>
          </span>
        ) : <span className={s.note}>{range.label}</span>}
        <Segmented value={range.key} label="Period" options={OVERVIEW_RANGES.map(([value, label]) => ({ value, label }))}
          onChange={k => (k === 'custom' ? go({ r: 'custom', from: range.from, to: range.to }) : go({ r: k }))} />
        {canManage ? (
          <button type="button" className={u.ghost} onClick={refresh} disabled={pending} title="Read this period’s spend from Meta again">
            <LeadIcon name="refresh-cw" size={14} />{pending ? 'Reading…' : 'Refresh spend'}
          </button>
        ) : null}
      </div>
      {msg ? <div className={s.warn}>{msg}</div> : null}
      {canManage && unplaced.length ? (
        <div className={s.warn}>{unplaced.length} ad account{unplaced.length === 1 ? ' is' : 's are'} on no outlet yet — their spend counts in All outlets only. Put each on its outlet under Ad accounts.</div>
      ) : null}

      <div className={s.grid}>
        <Panel title="All outlets" sub={`${range.label} · ${days} day${days === 1 ? '' : 's'}`} f={all} wide />
        {busy.map(({ o, f }) => <Panel key={o.id} title={o.name} sub={brandName(o.brandId)} f={f} />)}
        {hasFigures(none) ? <Panel title="No outlet" sub="Chats whose ad has no outlet, and spend of ad accounts on none" f={none} /> : null}
      </div>
      {quiet.length ? <div className={s.quiet}>Nothing in this period: {quiet.map(p => p.o.name).join(' · ')}</div> : null}

      {canManage ? (
        <section className={s.accounts}>
          <div className={s.accH}>
            <span className={s.accT}>Ad accounts</span>
            <span className={s.note}>The accounts Meta lets Lead View read. Spend follows the outlet each is on.</span>
          </div>
          {data.accounts.length ? data.accounts.map(a => (
            <div key={a.accountId} className={s.acc}>
              <span>{a.name || 'Ad account'} <span className={s.accId}>act_{a.accountId}</span></span>
              <select value={a.outletId ?? ''} onChange={e => place(a.accountId, e.target.value)} disabled={pending} aria-label={`Outlet of ${a.name}`}>
                <option value="">No outlet</option>
                {brands.map(b => {
                  const own = outlets.filter(o => o.brandId === b.id)
                  return own.length ? <optgroup key={b.id} label={b.name}>{own.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</optgroup> : null
                })}
              </select>
              <span className={s.note}>{a.fetchedAt ? `Read ${new Date(a.fetchedAt).toLocaleString('en-GB', { timeZone: 'Asia/Kuala_Lumpur', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'Not read for this period'}</span>
            </div>
          )) : <div className={s.note}>No ad account read yet — press Refresh spend.</div>}
          <div className={s.note}>An account not listed has not been given to the system user (RevTeam CRM) in Business Manager. Spend is Meta’s plus {SST * 100}% SST.</div>
        </section>
      ) : null}
    </div>
  )
}

function Fig({ label, value, sub, hint, dim }: { label: string; value: string; sub?: string; hint: string; dim?: boolean }) {
  return (
    <div className={s.fig} title={hint}>
      <span className={s.figL}>{label}</span>
      <span className={s.figV} data-dim={dim || value === '—' || undefined}>{value}</span>
      {sub ? <span className={s.figS}>{sub}</span> : null}
    </div>
  )
}

function Panel({ title, sub, f, wide }: { title: string; sub: string; f: OverviewFigures; wide?: boolean }) {
  const n = (x: number) => x.toLocaleString('en-US')
  return (
    <section className={s.panel} data-all={wide || undefined}>
      <div className={s.head}><span className={s.title}>{title}</span><span className={s.sub}>{sub}</span></div>
      <div className={s.body}>
        <div className={s.figs}>
          <Fig label="Total ad spend" value={rm(f.spend)} hint={`Meta’s spend ${rm(f.metaSpend)} + ${SST * 100}% SST`} />
          <Fig label="Avg. daily ad spend" value={rm(f.avgDaily)} hint="Total ad spend ÷ the days of the period" />
          <Fig label="Lead funnel ad spend" value={rm(f.funnel)} hint="Campaigns for messages, leads, traffic or sales (+ SST)" />
          <Fig label="Branding ad spend" value={rm(f.branding)} hint="Campaigns for awareness, reach or video views (+ SST)" />
          <Fig label="Online inquiry" value={n(f.inquiries)} hint="Chats started in Lead View in the period (Messenger and Instagram), by the customer’s outlet" />
          <Fig label="CPL" sub={`incl. ${SST * 100}% SST`} value={rm(f.cpl)} hint="Lead funnel ad spend ÷ online inquiries" />
          <Fig label="Visit" value={n(f.visits)} hint="Showroom visits recorded for days in the period" />
          <Fig label="Visit rate" value={pct(f.visitRate)} hint="Visits ÷ online inquiries" />
          <Fig label="Order counts" value={n(f.orders)} hint="Visits marked Close sales with a purchase day in the period" />
          <Fig label="Conversion rate" value={pct(f.conversion)} hint="Orders ÷ visits" />
          <Fig label="Total sales" value={rm(f.sales)} hint="The Sales of those orders" />
          <Fig label="AOV" value={rm(f.aov)} hint="Total sales ÷ orders" />
          <Fig label="ROAS" value={times(f.roas)} sub={f.spendShare == null ? undefined : `${pct(f.spendShare)} of sales spent on ads`} hint="Total sales ÷ total ad spend (below: total ad spend ÷ total sales)" />
          <Fig label="CPA" value={rm(f.cpa)} hint="Total ad spend ÷ orders" />
        </div>
        <div className={s.src}>
          <div className={s.srcH}><span>Source</span><span>Visit</span><span>Sales</span></div>
          {VISIT_SOURCES.map(([k, label]) => (
            <div key={k} className={s.srcR} data-zero={!f.visitsBy[k] && !f.salesBy[k] ? true : undefined}>
              <span>{label}</span><span>{n(f.visitsBy[k])}</span><span>{f.salesBy[k] ? rm(f.salesBy[k]) : '—'}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
