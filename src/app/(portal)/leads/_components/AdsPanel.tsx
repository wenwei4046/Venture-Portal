'use client'

import { useState, useTransition } from 'react'
import { btn } from '@/components/hrv/kit'
import { fetchAdNames, nameAd } from '@/lib/leads/actions'
import { adsManagerLink, type LeadAd } from '@/lib/leads/ads'
import { whenFull } from '@/lib/leads/time'
import type { LeadBrand } from '@/lib/leads/types'
import { Bi, BrandChip, CHANNEL_LABEL } from './bits'
import s from './lead.module.css'

/**
 * Settings › Ads (2026-10-18 — the user: "我要看到廣告名稱，來源，鏈接"): every ad conversations came from. Meta's
 * message gives its id and headline only; its name, campaign, ad set and post come from Ads Manager — "Fetch from
 * Meta" asks with the system user's ads_read — or are typed here. A name typed here wins over Meta's.
 */
export default function AdsPanel({ ads, brands, canManage }: { ads: LeadAd[]; brands: LeadBrand[]; canManage: boolean }) {
  const [busy, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const byBrand = new Map(brands.map(b => [b.id, b]))
  const unnamed = ads.filter(a => !a.name).length
  const fetchAll = () => start(async () => {
    setMsg(null)
    const r = await fetchAdNames(ads.map(a => a.adId))
    setMsg(r.ok ? { ok: true, text: `Meta answered for ${r.data.named} of ${ads.length} ads` + (r.data.refused ? ` — ${r.data.refused} are on ad accounts the system user cannot see (or partnership ads): give it those accounts, or name them here.` : '') } : { ok: false, text: r.reason })
  })
  return (
    <section className={s.panel} aria-label="Ads">
      <div className={s.panelHead} style={{ flexWrap: 'wrap', gap: 8 }}>
        <span className={s.cardTitle}><Bi en="Ads" zh="广告" /></span>
        <span className={s.hint}>{ads.length} ads · {unnamed} without a name</span>
        <span className={s.spacer} />
        {canManage ? (
          <button type="button" className={btn('primary')} onClick={fetchAll} disabled={busy || ads.length === 0}>
            {busy ? 'Asking Meta…' : <Bi en="Fetch names from Meta" zh="从 Meta 抓取名称" />}
          </button>
        ) : null}
      </div>
      <span className={s.hint}>
        <Bi block en="A customer's message from an ad carries only the ad's id and headline. Fetching from Meta needs the system user to have the brands' ad accounts and ads_read; until then, name an ad here — your name is kept even after Meta's arrives."
          zh="客户从广告来的消息只带广告编号和标题。从 Meta 抓取需要系统用户有品牌的广告账户和 ads_read 权限；在那之前可以在这里手动取名，手动的名称会一直优先。" />
      </span>
      {msg ? <div className={msg.ok ? s.ok : s.error} role={msg.ok ? 'status' : 'alert'}>{msg.text}</div> : null}
      {ads.length === 0 ? (
        <div className={s.empty}><Bi block en="No conversation has come from an ad yet. On Settings › Test, give a test message an ad id to try it." zh="还没有从广告来的对话。可以在 Settings › Test 给测试消息填一个广告编号来试。" /></div>
      ) : (
        <div className={s.tableBox}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Ad</th><th>Campaign › Ad set</th><th>Brand · Channel</th>
                <th className={s.num}>Chats</th><th className={s.num}>Phones</th><th>Links</th><th />
              </tr>
            </thead>
            <tbody>
              {ads.map(a => editing === a.adId ? (
                <tr key={a.adId}><td colSpan={7} style={{ whiteSpace: 'normal' }}><NameForm ad={a} onDone={() => setEditing(null)} /></td></tr>
              ) : (
                <tr key={a.adId}>
                  <td style={{ whiteSpace: 'normal', minWidth: 200 }}>
                    <div style={{ fontWeight: 600 }}>{a.name || a.headline || '—'}</div>
                    <div className={s.hint}>
                      {a.name && a.headline ? `"${a.headline}" · ` : ''}<span className={s.mono}>{a.adId}</span>
                      {a.source ? ` · ${a.source === 'meta' ? 'From Meta' : `Named by ${a.updatedByName || 'hand'}`}` : ' · Not named'}
                      {a.status ? ` · ${a.status}` : ''}
                    </div>
                  </td>
                  <td style={{ whiteSpace: 'normal' }}>{[a.campaign, a.adset].filter(Boolean).join(' › ') || <span className={s.muted}>—</span>}</td>
                  <td>
                    <span className={s.tabs}>
                      {a.brandIds.map(id => <BrandChip key={id} brand={byBrand.get(id)} />)}
                      <span className={s.hint}>{a.channels.map(c => CHANNEL_LABEL[c]).join(' · ')}</span>
                    </span>
                  </td>
                  <td className={s.num}>{a.conversations}{a.tests ? <span className={s.hint}> ({a.tests} test)</span> : null}</td>
                  <td className={s.num}>{a.phones}</td>
                  <td>
                    <span className={s.tabs} style={{ gap: 10 }}>
                      {a.link ? <a href={a.link} target="_blank" rel="noopener noreferrer" className={s.linkBtn}>Ad ↗</a> : null}
                      {adsManagerLink(a.accountId, a.adId) ? <a href={adsManagerLink(a.accountId, a.adId)} target="_blank" rel="noopener noreferrer" className={s.linkBtn}>Ads Manager ↗</a> : null}
                      {!a.link && !a.accountId ? <span className={s.muted}>—</span> : null}
                    </span>
                  </td>
                  <td>{canManage ? <button type="button" className={btn('outline')} onClick={() => setEditing(a.adId)}><Bi en="Name" zh="取名" /></button> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {ads.some(a => a.fetchedAt) ? (
        <span className={s.hint}>Last fetched from Meta {whenFull(ads.map(a => a.fetchedAt ?? '').sort().at(-1)!)}</span>
      ) : null}
    </section>
  )
}

function NameForm({ ad, onDone }: { ad: LeadAd; onDone: () => void }) {
  const [form, setForm] = useState({ name: ad.source === 'manual' ? ad.name : '', campaign: ad.source === 'manual' ? ad.campaign : '', adset: ad.source === 'manual' ? ad.adset : '', link: ad.source === 'manual' ? ad.link : '' })
  const [busy, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const save = (data: typeof form) => start(async () => {
    setError(null)
    const r = await nameAd(ad.adId, data)
    if (!r.ok) setError(r.reason)
    else onDone()
  })
  return (
    <div className={s.fieldGrid}>
      <label className={`${s.field} ${s.wide}`}><Bi en={`Name for ad ${ad.adId}`} zh="广告名称" />
        <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} maxLength={200} placeholder={ad.name || ad.headline || 'e.g. Oct Sofa Week · Video'} autoFocus />
      </label>
      <label className={s.field}><Bi en="Campaign" zh="广告系列" /><input value={form.campaign} onChange={e => setForm({ ...form, campaign: e.target.value })} maxLength={200} placeholder={ad.campaign} /></label>
      <label className={s.field}><Bi en="Ad set" zh="广告组" /><input value={form.adset} onChange={e => setForm({ ...form, adset: e.target.value })} maxLength={200} placeholder={ad.adset} /></label>
      <label className={`${s.field} ${s.wide}`}><Bi en="Link to the ad (https://…)" zh="广告链接" /><input value={form.link} onChange={e => setForm({ ...form, link: e.target.value })} placeholder={ad.link || 'https://www.facebook.com/…'} /></label>
      {error ? <div className={`${s.error} ${s.wide}`} role="alert">{error}</div> : null}
      <div className={`${s.actions} ${s.wide}`}>
        <button type="button" className={btn('primary')} onClick={() => save(form)} disabled={busy}><Bi en="Save" zh="保存" /></button>
        {ad.source === 'manual' ? <button type="button" className={btn('outline')} onClick={() => save({ name: '', campaign: '', adset: '', link: '' })} disabled={busy}><Bi en="Clear my name" zh="清除手动名称" /></button> : null}
        <button type="button" className={btn('outline')} onClick={onDone} disabled={busy}><Bi en="Cancel" zh="取消" /></button>
      </div>
    </div>
  )
}
