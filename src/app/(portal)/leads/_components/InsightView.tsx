'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { INSIGHT_RANGES, adRowsOf, byReplyOf, dropOf, funnelOf, rate, type AdRow, type InsightMore, type InsightRange } from '@/lib/leads/insight'
import type { LeadFlow } from '@/lib/leads/flow'
import type { LeadContact } from '@/lib/leads/types'
import s from './insight.module.css'

/**
 * Lead View › Insight v2 (2026-10-23, the redesign v2 handoff `Insight.dc.html`; step 6): brand and range at the top
 * (?r= 7 | 30 | q), then From message to sale (Conversations → Gave a phone → Handed → Came → Bought), By ad (sortable;
 * Spend and Cost / sale show "—" until Ads Manager's spend has a source — organic is "free"), Who replied first
 * (Person · Template · AI Agent — CS sending an AI draft) and Where customers drop off (a template's steps). The last
 * two need mig 20261023400000. Test conversations count only while there is nothing else.
 */

type Col = 'name' | 'chats' | 'phones' | 'rate' | 'came' | 'bought' | 'spend' | 'cpc'
const COLS: ReadonlyArray<[Col, string]> = [['name', 'AD'], ['chats', 'CHATS'], ['phones', 'PHONES'], ['rate', 'PHONE RATE'], ['came', 'CAME'], ['bought', 'BOUGHT'], ['spend', 'SPEND'], ['cpc', 'COST / SALE']]
const BARS = ['frame', 'sand', 'accent', 'accentText', 'green'] as const

export default function InsightView({ contacts, onlyTests, range, brands, more, flows }: {
  contacts: LeadContact[]
  onlyTests: boolean
  range: { key: InsightRange; label: string }
  brands: Array<{ id: string; name: string }>
  more: InsightMore | null
  flows: Array<Pick<LeadFlow, 'id' | 'name' | 'steps'>>
}) {
  const router = useRouter()
  const [brand, setBrand] = useState('all')
  const [sort, setSort] = useState<{ k: Col; dir: 1 | -1 }>({ k: 'chats', dir: -1 })
  const [flowId, setFlowId] = useState(flows[0]?.id ?? '')
  const mine = useMemo(() => contacts.filter(c => brand === 'all' || c.brandId === brand), [contacts, brand])
  const funnel = funnelOf(mine)
  const top = Math.max(1, funnel[0].n)
  const val = (a: AdRow, k: Col): number | string =>
    k === 'name' ? a.name.toLowerCase() : k === 'rate' ? a.phones / Math.max(1, a.chats) : k === 'spend' || k === 'cpc' ? 0 : a[k]
  const ads = [...adRowsOf(mine, brands)].sort((a, b) => { const x = val(a, sort.k), y = val(b, sort.k); return (x > y ? 1 : x < y ? -1 : 0) * sort.dir })
  const testOk = (r: { test: boolean }) => onlyTests || !r.test
  const replies = (more?.replies ?? []).filter(r => (brand === 'all' || r.brandId === brand) && testOk(r))
  const byReply = byReplyOf(replies)
  const best = [...byReply].filter(r => r.chats > 0).sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0))[0]
  const flow = flows.find(f => f.id === flowId)
  const drop = flow ? dropOf(flow, (more?.steps ?? []).filter(x => (brand === 'all' || x.brandId === brand) && testOk(x))) : []
  const biggest = drop.slice(1).reduce<{ d: number; from: string; to: string } | null>((b, x, i) => {
    const d = drop[i].pct - x.pct
    return d > (b?.d ?? 0) ? { d, from: drop[i].label, to: x.label } : b
  }, null)
  const brandName = brand === 'all' ? 'All brands' : brands.find(b => b.id === brand)?.name ?? '—'

  return (
    <div className={s.page}>
      <div className={s.head}>
        <div className={s.titles}>
          <span className={s.eyebrow}>LEAD VIEW</span>
          <h1 className={s.title}>Insight</h1>
        </div>
        <span className={s.seg} role="group" aria-label="Brand">
          <button type="button" aria-pressed={brand === 'all'} onClick={() => setBrand('all')}>All</button>
          {brands.map(b => <button key={b.id} type="button" aria-pressed={brand === b.id} onClick={() => setBrand(b.id)}>{b.name}</button>)}
        </span>
        <span className={s.seg} role="group" aria-label="Period">
          {INSIGHT_RANGES.map(([k, l]) => <button key={k} type="button" aria-pressed={range.key === k} onClick={() => router.push(`/leads/insight?r=${k}`)}>{l}</button>)}
        </span>
      </div>
      <div className={s.scroll}>
        {onlyTests ? <div className={s.note}>Only test conversations so far: these numbers come from tests.</div> : null}

        <section className={s.section}>
          <div className={s.sectHead}><h2 className={s.h2}>From message to sale</h2><span className={s.sub}>{range.label} · {brandName}</span></div>
          <div className={s.funnel}>
            {funnel.map((f, i) => (
              <div key={f.label} className={s.stage}>
                <span className={s.stageLabel}>{f.label}</span>
                <span className={s.big}>{f.n.toLocaleString('en-MY')}</span>
                <span className={s.track}><span className={s.bar} data-tone={BARS[i]} style={{ width: `${Math.max(2, (f.n / top) * 100)}%` }} /></span>
                <span className={s.sub}>{f.rate}</span>
              </div>
            ))}
          </div>
        </section>

        <section className={s.section}>
          <div className={s.sectHead}><h2 className={s.h2}>By ad</h2><span className={s.sub}>Spend comes from Ads Manager once it is connected. Sort by any column.</span></div>
          <div className={s.table}>
            <div className={s.adRow} data-head="">
              {COLS.map(([k, l]) => (
                <button key={k} type="button" className={s.th} data-sorted={sort.k === k || undefined} title={`Sort by ${l.toLowerCase()}`}
                  disabled={k === 'spend' || k === 'cpc'}
                  onClick={() => setSort(x => ({ k, dir: x.k === k ? (x.dir === 1 ? -1 : 1) : k === 'name' ? 1 : -1 }))}>
                  {l}{sort.k === k ? (sort.dir > 0 ? ' ↑' : ' ↓') : ''}
                </button>
              ))}
            </div>
            {ads.map(a => {
              const r = rate(a.phones, a.chats)
              return (
                <div key={a.key} className={s.adRow}>
                  <span className={s.adName}>
                    <span className={s.ch} data-ch={a.channel}>{a.channel === 'instagram' ? 'IG' : 'FB'}</span>
                    <span className={s.ellipsis}>{a.name}</span>
                    <span className={s.brand}>{brands.find(b => b.id === a.brandId)?.name ?? '—'}</span>
                  </span>
                  <span className={s.num}>{a.chats}</span>
                  <span className={s.num}>{a.phones}</span>
                  <span className={s.num} data-tone={r === null ? undefined : r >= 40 ? 'good' : r < 28 ? 'low' : undefined}>{r === null ? '—' : `${r}%`}</span>
                  <span className={s.num}>{a.came}</span>
                  <span className={s.num}>{a.bought}</span>
                  <span className={s.num}>—</span>
                  <span className={s.num} data-faint={a.organic || undefined}>{a.organic ? 'free' : '—'}</span>
                </div>
              )
            })}
            {ads.length === 0 ? <div className={s.empty}>No conversations in this period.</div> : null}
          </div>
        </section>

        <div className={s.pair}>
          <section className={s.section}>
            <div className={s.sectHead}><h2 className={s.h2}>Who replied first</h2></div>
            {more ? (
              <>
                <div className={s.replyRow} data-head=""><span /><span>CHATS</span><span>GOT PHONE</span><span>FIRST REPLY</span></div>
                {byReply.map(r => (
                  <div key={r.key} className={s.replyRow}>
                    <span className={s.who}><span className={s.swatch} data-who={r.key} />{r.label}</span>
                    <span className={s.num}>{r.chats}</span>
                    <span className={s.rateCell}><span className={s.track}><span className={s.bar} data-tone="accent" style={{ width: `${r.rate ?? 0}%` }} /></span><span className={s.num}>{r.rate === null ? '—' : `${r.rate}%`}</span></span>
                    <span className={s.num}>{r.speed}</span>
                  </div>
                ))}
                <p className={s.sub}>{best ? `${best.label} gets a phone number most often (${best.rate}%). ` : 'Nobody has answered a conversation in this period yet. '}The AI Agent counts when CS sends one of its drafts.</p>
              </>
            ) : <div className={s.note}>Waiting for the database update — who replied first comes with it.</div>}
          </section>

          <section className={s.section}>
            <div className={s.sectHead}>
              <h2 className={s.h2}>Where customers drop off</h2>
              {flows.length ? (
                <select className={s.select} value={flowId} onChange={e => setFlowId(e.target.value)} aria-label="Template">
                  {flows.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              ) : null}
            </div>
            {!more ? <div className={s.note}>Waiting for the database update — the steps come with it.</div> : drop.length === 0 ? (
              <p className={s.sub}>{flow ? 'This template has not answered anybody in this period.' : 'No templates yet.'}</p>
            ) : (
              <>
                {drop.map((x, i) => (
                  <div key={x.id} className={s.dropRow}>
                    <span className={s.stepNo}>{i + 1}</span>
                    <span className={s.ellipsis}>{x.label}</span>
                    <span className={s.track}><span className={s.bar} data-tone={biggest?.to === x.label ? 'accent' : 'sand'} style={{ width: `${x.pct}%` }} /></span>
                    <span className={s.num}>{x.pct}%</span>
                  </div>
                ))}
                <p className={s.sub}>
                  {biggest ? `Most customers leave between “${biggest.from}” and “${biggest.to}” (${biggest.d}% of chats). Try a shorter question there, or ask for the phone earlier. ` : ''}
                  <Link className={s.link} href={`/leads/flows?t=${flowId}`}>Edit template ↗</Link>
                </p>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
