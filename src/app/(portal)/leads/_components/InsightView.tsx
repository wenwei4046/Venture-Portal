'use client'

import { useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { useRouter } from 'next/navigation'
import { INSIGHT_RANGES, adRowsOf, byReplyOf, dropOf, funnelOf, rate, trendLabel, trendOf, type AdRow, type InsightMore, type InsightRange } from '@/lib/leads/insight'
import type { LeadFlow } from '@/lib/leads/flow'
import type { LeadContact } from '@/lib/leads/types'
import { LeadIcon, type LeadIconName } from '@/components/layout/lead-icons'
import s from './insight.module.css'

/**
 * Lead View v2 › Insight (2026-11-02, the v2 handoff §7.3): the brand tabs and the range (Today · 7 days · 30 days ·
 * Custom, ?r= today | 7 | 30 | custom&from=&to=), the funnel (Chats → Got phone → Handed to sales → Came to showroom →
 * Closed) with Show trend (chats started and phones got, by day — by hour for Today), By ad (sortable, searchable; a
 * row shows only that ad above), Who replied first (Person · Template · AI Agent) and Where customers drop off (a
 * template's steps, picked from a searchable list). Test conversations count only while there is nothing else.
 * This quarter (the earlier range) is one of Custom's presets.
 */

type Col = 'name' | 'brand' | 'chats' | 'phones' | 'rate' | 'came' | 'bought'
const COLS: ReadonlyArray<[Col, string]> = [['name', 'Ad'], ['brand', 'Brand'], ['chats', 'Chats'], ['phones', 'Phones'], ['rate', 'Rate'], ['came', 'Came'], ['bought', 'Closed']]
const WHO_ICON: Record<string, LeadIconName> = { cs: 'headset', template: 'workflow', ai: 'sparkles' }
const fmt = (n: number) => n.toLocaleString('en-US')
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10)

export default function InsightView({ contacts, onlyTests, range, today, brands, more, flows }: {
  contacts: LeadContact[]
  onlyTests: boolean
  range: { key: InsightRange; from: string; to: string; label: string }
  today: string
  brands: Array<{ id: string; name: string }>
  more: InsightMore | null
  flows: Array<Pick<LeadFlow, 'id' | 'name' | 'steps'>>
}) {
  const router = useRouter()
  const [brand, setBrand] = useState('all')
  const [adKey, setAdKey] = useState<string | null>(null)
  const [adQ, setAdQ] = useState('')
  const [sort, setSort] = useState<{ k: Col; dir: 1 | -1 }>({ k: 'chats', dir: -1 })
  const [trendOpen, setTrendOpen] = useState(false)
  const [hover, setHover] = useState<number | null>(null)
  const [customOpen, setCustomOpen] = useState(false)
  const [draft, setDraft] = useState({ from: range.from, to: range.to })
  const [flowId, setFlowId] = useState<string | null>(null)
  const [dOpen, setDOpen] = useState(false)
  const [dQ, setDQ] = useState('')

  const mine = useMemo(() => contacts.filter(c => brand === 'all' || c.brandId === brand), [contacts, brand])
  const brandName = (id: string) => brands.find(b => b.id === id)?.name ?? '—'
  const ads = useMemo(() => adRowsOf(mine, brands), [mine, brands])
  const picked = adKey ? ads.find(a => a.key === adKey) ?? null : null
  const scoped = picked ? mine.filter(c => (picked.organic ? !c.adId && !c.sourceAd && c.brandId === picked.brandId : (c.adId || c.sourceAd) === picked.key)) : mine
  const funnel = funnelOf(scoped)
  const top = Math.max(1, funnel[0].n)
  const trend = useMemo(() => trendOf(scoped, range.from, range.to), [scoped, range.from, range.to])

  const val = (a: AdRow, k: Col): number | string =>
    k === 'name' ? a.name.toLowerCase() : k === 'brand' ? brandName(a.brandId).toLowerCase() : k === 'rate' ? a.phones / Math.max(1, a.chats) : a[k]
  const aql = adQ.trim().toLowerCase()
  const adRows = ads.filter(a => !aql || `${a.name} ${brandName(a.brandId)}`.toLowerCase().includes(aql))
    .sort((a, b) => { const x = val(a, sort.k), y = val(b, sort.k); return (x > y ? 1 : x < y ? -1 : 0) * sort.dir })
  const sortBy = (k: Col) => setSort(o => (o.k === k ? { k, dir: o.dir === 1 ? -1 : 1 } : { k, dir: k === 'name' || k === 'brand' ? 1 : -1 }))

  const testOk = (r: { test: boolean }) => onlyTests || !r.test
  const replies = (more?.replies ?? []).filter(r => (brand === 'all' || r.brandId === brand) && testOk(r))
  const byReply = byReplyOf(replies)
  const steps = (more?.steps ?? []).filter(x => (brand === 'all' || x.brandId === brand) && testOk(x))
  const flowStats = flows.map(f => { const d = dropOf(f, steps); return { f, d, chats: d[0]?.n ?? 0, fin: d.length ? d[d.length - 1].pct : 0 } }).sort((a, b) => b.chats - a.chats)
  const cur = flowStats.find(x => x.f.id === flowId) ?? flowStats[0] ?? null
  const dql = dQ.trim().toLowerCase()

  const go = (q: Record<string, string>) => router.push(`/leads/insight?${new URLSearchParams(q).toString()}`)
  const presets: Array<[string, string, string]> = [
    ['Last 14 days', addDays(today, -13), today], ['Last 90 days', addDays(today, -89), today], ['This month', `${today.slice(0, 7)}-01`, today],
    ['This quarter', `${today.slice(0, 5)}${String(Number(today.slice(5, 7)) - ((Number(today.slice(5, 7)) - 1) % 3)).padStart(2, '0')}-01`, today],
  ]
  const dayOk = draft.from && draft.to && draft.from <= draft.to && draft.to <= today

  // The trend's lines, in a 1000 × 140 box.
  const n = trend.keys.length
  const max = Math.max(1, ...trend.chats) * 1.1
  const xOf = (i: number) => (n === 1 ? 500 : (i * 1000) / (n - 1))
  const pts = (arr: number[]) => arr.map((v, i) => `${xOf(i).toFixed(1)},${(140 - (v / max) * 132).toFixed(1)}`).join(' ')
  const tickIdx = n <= 7 ? trend.keys.map((_, i) => i) : trend.unit === 'hour' ? [0, 4, 8, 12, 16, 20, 23] : [0, 1, 2, 3, 4].map(k => Math.round((k * (n - 1)) / 4))
  const onMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    setHover(Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1)))))
  }

  return (
    <div className={s.wrap}>
      <div className={s.bar}>
        <div className={s.brands} role="group" aria-label="Brand">
          <button type="button" className={s.brand} aria-pressed={brand === 'all'} onClick={() => { setBrand('all'); setAdKey(null) }}>All brands</button>
          {brands.map(b => <button key={b.id} type="button" className={s.brand} aria-pressed={brand === b.id} onClick={() => { setBrand(b.id); setAdKey(null) }}>{b.name}</button>)}
        </div>
        <div className={s.gap} />
        <div className={s.rangeBox}>
          {range.key === 'custom' || range.key === 'q' ? (
            <button type="button" className={s.customBtn} onClick={() => { setDraft({ from: range.from, to: range.to }); setCustomOpen(true) }}><LeadIcon name="calendar" size={14} />{range.label}</button>
          ) : null}
          <div className={s.seg} role="group" aria-label="Range">
            {INSIGHT_RANGES.map(([k, l]) => (
              <button key={k} type="button" className={s.segBtn} aria-pressed={range.key === k || (k === 'custom' && range.key === 'q')}
                onClick={() => (k === 'custom' ? (setDraft({ from: range.from, to: range.to }), setCustomOpen(true)) : go({ r: k }))}>{l}</button>
            ))}
          </div>
          {customOpen ? (
            <>
              <div className={s.catch} onClick={() => setCustomOpen(false)} aria-hidden="true" />
              <div className={s.custom} role="dialog" aria-label="Custom range">
                <span className={s.customH}>Custom range</span>
                <div className={s.dates}>
                  <label>From<input type="date" value={draft.from} max={draft.to || today} onChange={e => setDraft(d => ({ ...d, from: e.target.value }))} /></label>
                  <label>To<input type="date" value={draft.to} min={draft.from} max={today} onChange={e => setDraft(d => ({ ...d, to: e.target.value }))} /></label>
                </div>
                <div className={s.presets}>{presets.map(([l, from, to]) => <button key={l} type="button" className={s.preset} onClick={() => setDraft({ from, to })}>{l}</button>)}</div>
                <div className={s.customFoot}>
                  <button type="button" className={s.cancel} onClick={() => setCustomOpen(false)}>Cancel</button>
                  <button type="button" className={s.apply} disabled={!dayOk} onClick={() => { setCustomOpen(false); go({ r: 'custom', from: draft.from, to: draft.to }) }}>Apply</button>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>

      <section className={s.top}>
        {picked ? (
          <div className={s.only}><span>Showing only</span><button type="button" className={s.onlyBtn} onClick={() => setAdKey(null)}>{picked.name}<LeadIcon name="x" size={13} /></button></div>
        ) : null}
        <div className={s.funnel}>
          {funnel.map((f, i) => (
            <div key={f.label} className={s.step}>
              <span className={s.stepL}>{f.label}</span>
              <span className={s.stepN}>{fmt(f.n)}</span>
              <span className={s.track}><span className={s.fill} data-k={i === funnel.length - 1 ? 'last' : i ? 'mid' : undefined} style={{ width: `${Math.max(4, Math.round((f.n / top) * 100))}%` }} /></span>
              <span className={s.stepR}>{f.rate}</span>
            </div>
          ))}
        </div>
        <div className={s.trend}>
          <div className={s.trendBar}>
            <button type="button" className={s.trendBtn} onClick={() => { setTrendOpen(o => !o); setHover(null) }}><LeadIcon name="trending-up" size={14} />{trendOpen ? 'Hide trend' : 'Show trend'}</button>
            {trendOpen ? (
              <>
                <span className={s.key}><span />Chats</span><span className={s.key} data-k="p"><span />Got phone</span>
                <span className={s.gap} /><span className={s.unit}>{trend.unit === 'hour' ? 'By hour' : 'By day'}</span>
              </>
            ) : null}
          </div>
          {trendOpen ? (
            <>
              <div className={s.chart} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
                <svg viewBox="0 0 1000 140" preserveAspectRatio="none" aria-label="Chats and phones over time">
                  {[35, 70, 105].map(y => <line key={y} x1={0} x2={1000} y1={y} y2={y} stroke="rgb(var(--lv-line-2))" strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
                  <polygon points={`0,140 ${pts(trend.chats)} 1000,140`} fill="rgb(var(--lv-accent) / 0.06)" />
                  {hover !== null ? <line x1={xOf(hover)} x2={xOf(hover)} y1={0} y2={140} stroke="rgb(var(--lv-focus-line))" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" /> : null}
                  <polyline points={pts(trend.chats)} fill="none" stroke="rgb(var(--lv-accent))" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                  <polyline points={pts(trend.phones)} fill="none" stroke="rgb(var(--lv-pos))" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                </svg>
                {hover !== null ? (
                  <div className={s.tip} style={{ left: `${(xOf(hover) / 10).toFixed(2)}%`, transform: hover > n / 2 ? 'translateX(calc(-100% - 10px))' : 'translateX(10px)' }}>
                    <span>{trendLabel(trend.keys[hover], trend.unit)}</span>
                    <span className={s.tipRow}><span />{trend.chats[hover]} chats</span>
                    <span className={s.tipRow} data-k="p"><span />{trend.phones[hover]} got phone</span>
                  </div>
                ) : null}
              </div>
              <div className={s.ticks}>{tickIdx.map(i => <span key={i}>{trendLabel(trend.keys[i], trend.unit)}</span>)}</div>
            </>
          ) : null}
        </div>
      </section>

      <div className={s.cols}>
        <section className={s.card}>
          <div className={s.cardHead}>
            <span className={s.cardTitle}>By ad</span><span className={s.gap} />
            <label className={s.search}><LeadIcon name="search" size={15} /><input value={adQ} onChange={e => setAdQ(e.target.value)} placeholder="Search ads" aria-label="Search ads" /></label>
          </div>
          <div className={`${s.adGrid} ${s.adHead}`}>
            {COLS.map(([k, l], i) => (
              <button key={k} type="button" className={s.sort} data-right={i > 1 || undefined} data-on={sort.k === k || undefined} onClick={() => sortBy(k)}>
                {l}{sort.k === k ? <LeadIcon name={sort.dir === 1 ? 'arrow-up' : 'arrow-down'} size={12} /> : <span className={s.sortOff}><LeadIcon name="arrow-up-down" size={12} /></span>}
              </button>
            ))}
          </div>
          <div className={s.adRows}>
            {adRows.map(a => {
              const rt = rate(a.phones, a.chats)
              return (
                <div key={a.key} className={`${s.adGrid} ${s.adRow}`} role="option" aria-selected={adKey === a.key} title="Show only this ad" onClick={() => setAdKey(k => (k === a.key ? null : a.key))}>
                  <span className={s.adName}><span>{a.channel === 'instagram' ? 'IG' : 'FB'}</span><span>{a.name}</span></span>
                  <span className={s.adBrand}>{brandName(a.brandId)}</span>
                  <span className={s.r}>{fmt(a.chats)}</span><span className={s.r}>{fmt(a.phones)}</span>
                  <span className={s.rate} data-good={a.chats && a.phones / a.chats >= 0.4 ? '' : undefined}>{rt === null ? '—' : `${rt}%`}</span>
                  <span className={s.r}>{fmt(a.came)}</span><span className={s.r}>{fmt(a.bought)}</span>
                </div>
              )
            })}
          </div>
          {!adRows.length ? <div className={s.adEmpty}>No ads match</div> : null}
          <div className={s.adFoot}><span>{adRows.length} {adRows.length === 1 ? 'ad' : 'ads'}</span></div>
        </section>

        <div className={s.side}>
          <section className={s.small}>
            <span className={s.cardTitle}>Who replied first</span>
            {more ? byReply.map(r => (
              <div key={r.key} className={s.who}>
                <div className={s.whoRow}>
                  <LeadIcon name={WHO_ICON[r.key]} size={15} /><span className={s.whoL}>{r.label}</span>
                  <span className={s.whoMeta}>{fmt(r.chats)} chats · {r.speed === 'instant' ? 'Instant' : r.speed}</span>
                  <span className={s.whoRate}>{r.rate === null ? '—' : `${r.rate}%`}</span>
                </div>
                <span className={s.whoTrack}><span style={{ width: `${Math.min(100, (r.rate ?? 0) * 2)}%` }} /></span>
              </div>
            )) : <span className={s.none}>Waiting for the database update</span>}
          </section>
          <section className={s.small}>
            <span className={s.cardTitle}>Where customers drop off</span>
            {cur ? (
              <>
                <div className={s.dBox}>
                  <button type="button" className={s.dBtn} aria-expanded={dOpen} onClick={() => setDOpen(o => !o)}>
                    <LeadIcon name="workflow" size={14} /><span>{cur.f.name}</span><span>{fmt(cur.chats)} chats</span><LeadIcon name="chevron-down" size={14} />
                  </button>
                  {dOpen ? (
                    <>
                      <div className={s.catch} onClick={() => { setDOpen(false); setDQ('') }} aria-hidden="true" />
                      <div className={s.dMenu} role="listbox" aria-label="Template">
                        <div className={s.dSearchBox}><label className={s.dSearch}><LeadIcon name="search" size={14} /><input value={dQ} onChange={e => setDQ(e.target.value)} placeholder="Search templates" aria-label="Search templates" autoFocus /></label></div>
                        <div className={`${s.dGrid} ${s.dHead}`}><span>Template</span><span style={{ textAlign: 'right' }}>Chats</span><span style={{ textAlign: 'right' }}>Finished</span></div>
                        <div className={s.dList}>
                          {flowStats.filter(x => !dql || x.f.name.toLowerCase().includes(dql)).map(x => (
                            <button key={x.f.id} type="button" role="option" aria-selected={x.f.id === cur.f.id} className={`${s.dGrid} ${s.dItem}`} onClick={() => { setFlowId(x.f.id); setDOpen(false); setDQ('') }}>
                              <span>{x.f.name}</span><span>{fmt(x.chats)}</span><span>{x.fin}%</span>
                            </button>
                          ))}
                          {!flowStats.some(x => !dql || x.f.name.toLowerCase().includes(dql)) ? <span className={s.dEmpty}>No templates match</span> : null}
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>
                {cur.d.map((d, i) => {
                  const lost = i ? cur.d[i - 1].pct - d.pct : 0
                  return (
                    <div key={d.id} className={s.drop}>
                      <span>{d.label}</span>
                      <span className={s.dropTrack}><span style={{ width: `${d.pct}%` }} />{lost >= 15 ? <span className={s.lost}>−{lost}%</span> : null}</span>
                      <span className={s.r}>{d.pct}%</span>
                    </div>
                  )
                })}
                {!cur.d.length ? <span className={s.none}>{more ? 'No customer has reached this template yet.' : 'Waiting for the database update'}</span> : null}
              </>
            ) : <span className={s.none}>No templates yet</span>}
          </section>
        </div>
      </div>
    </div>
  )
}
