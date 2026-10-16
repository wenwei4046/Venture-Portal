'use client'

import { useMemo, useState, useTransition } from 'react'
import { HvPage, PageHead, btn } from '@/components/hrv/kit'
import { removeKnowledgeCard, saveKnowledgeCard } from '@/lib/leads/actions'
import { KIND_LABEL, inDate, type KnowledgeCard, type KnowledgeKind } from '@/lib/leads/ai'
import type { LeadBrand } from '@/lib/leads/types'
import { Bi, BrandChip } from './bits'
import s from './lead.module.css'

/**
 * Lead View › Data Center (2026-10-16, the AI agent's base — the user's brief 2.1: "上傳一個 file（data center）
 * 給他們（裡面包含 promo, photo 等的咨詢）"). What the AI agent may say, as short cards: a promo with its dates,
 * a product, an FAQ, a showroom, a policy, a note — for one brand or every brand. The agent quotes only what is
 * here and in date. Files and photos come later; a card holds text.
 */

const KINDS = Object.keys(KIND_LABEL) as KnowledgeKind[]
type Draft = { id: string | null; brandId: string | null; kind: KnowledgeKind; title: string; body: string; startsOn: string; endsOn: string; active: boolean }
const blank = (brandId: string | null): Draft => ({ id: null, brandId, kind: 'faq', title: '', body: '', startsOn: '', endsOn: '', active: true })

export default function KnowledgeView({ cards, brands, today, canManage }: { cards: KnowledgeCard[]; brands: LeadBrand[]; today: string; canManage: boolean }) {
  const [brand, setBrand] = useState<string>('all')
  const [kind, setKind] = useState<KnowledgeKind | 'all'>('all')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Draft | null>(null)
  const byId = useMemo(() => new Map(brands.map(b => [b.id, b])), [brands])
  const q = query.trim().toLowerCase()
  const shown = cards.filter(c => (brand === 'all' || (brand === 'every' ? c.brandId === null : c.brandId === brand || c.brandId === null))
    && (kind === 'all' || c.kind === kind)
    && (!q || `${c.title} ${c.body}`.toLowerCase().includes(q)))
  const live = cards.filter(c => inDate(c, today)).length

  return (
    <HvPage>
      <PageHead eyebrow="Lead View" title="Data Center" right={canManage
        ? <button type="button" className={btn('primary')} onClick={() => setEditing(blank(brand === 'all' || brand === 'every' ? null : brand))}><Bi en="+ New card" zh="新增资料" /></button>
        : null} />
      <div className={s.note} style={{ marginBottom: 14, borderRadius: 10 }}>
        <Bi block en={`What the AI agent may tell customers. It quotes only cards that are on and in date — ${live} today. A brand's agent reads its own cards and the ones for every brand.`}
          zh="AI 只会引用这里开着、在日期内的资料。每个品牌的 AI 会看自己的资料和“所有品牌”的资料。" />
      </div>
      <div className={s.toolbar}>
        <div className={s.tabs} role="group" aria-label="Brand">
          <button type="button" className={s.tab} aria-pressed={brand === 'all'} onClick={() => setBrand('all')}><Bi en="All" zh="全部" /></button>
          <button type="button" className={s.tab} aria-pressed={brand === 'every'} onClick={() => setBrand('every')}><Bi en="Every brand" zh="通用" /></button>
          {brands.map(b => <button key={b.id} type="button" className={s.tab} aria-pressed={brand === b.id} onClick={() => setBrand(b.id)}>{b.name}</button>)}
        </div>
        <span className={s.spacer} />
        <select className={s.select} value={kind} onChange={e => setKind(e.target.value as KnowledgeKind | 'all')} aria-label="Kind">
          <option value="all">Every kind · 全部类型</option>
          {KINDS.map(k => <option key={k} value={k}>{KIND_LABEL[k].en} · {KIND_LABEL[k].zh}</option>)}
        </select>
        <input className={s.search} style={{ width: 220 }} type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search · 搜索" aria-label="Search cards" />
      </div>
      {shown.length === 0 ? (
        <div className={s.empty}>
          {cards.length === 0
            ? <Bi block en="No cards yet. Start with what customers ask most: this month's promo, opening hours, showroom addresses, delivery." zh="还没有资料。先放客户最常问的：本月优惠、营业时间、门市地址、送货。" />
            : <Bi block en="No cards match." zh="没有符合的资料。" />}
        </div>
      ) : (
        <div className={s.cardGrid}>
          {shown.map(c => <CardPanel key={c.id} card={c} brand={c.brandId ? byId.get(c.brandId) : undefined} today={today} canManage={canManage}
            onEdit={() => setEditing({ id: c.id, brandId: c.brandId, kind: c.kind, title: c.title, body: c.body, startsOn: c.startsOn ?? '', endsOn: c.endsOn ?? '', active: c.active })} />)}
        </div>
      )}
      {editing ? <CardWindow draft={editing} brands={brands} onClose={() => setEditing(null)} /> : null}
    </HvPage>
  )
}

function status(card: KnowledgeCard, today: string): { en: string; zh: string; tone: string } {
  if (!card.active) return { en: 'Off', zh: '关', tone: 'plum' }
  if (card.startsOn && card.startsOn > today) return { en: `From ${card.startsOn}`, zh: '未开始', tone: 'blue' }
  if (card.endsOn && card.endsOn < today) return { en: 'Ended', zh: '已结束', tone: 'plum' }
  return { en: card.endsOn ? `Until ${card.endsOn}` : 'In use', zh: '使用中', tone: 'olive' }
}

function CardPanel({ card, brand, today, canManage, onEdit }: { card: KnowledgeCard; brand: LeadBrand | undefined; today: string; canManage: boolean; onEdit: () => void }) {
  const [busy, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const st = status(card, today)
  const remove = () => {
    if (!window.confirm(`Remove "${card.title}"? The AI agent stops using it. 删除这张资料？`)) return
    start(async () => {
      setError(null)
      const r = await removeKnowledgeCard(card.id)
      if (!r.ok) setError(r.reason)
    })
  }
  return (
    <section className={s.panel} aria-label={card.title} style={{ opacity: inDate(card, today) ? 1 : 0.7 }}>
      <div className={s.panelHead} style={{ flexWrap: 'wrap', gap: 6 }}>
        <span className={s.brand} data-tone="ink">{KIND_LABEL[card.kind].en}</span>
        {brand ? <BrandChip brand={brand} /> : <span className={s.brand} data-tone="blue">Every brand · 通用</span>}
        <span className={s.spacer} />
        <span className={s.brand} data-tone={st.tone}>{st.en} · {st.zh}</span>
      </div>
      <div className={s.cardTitle}>{card.title}</div>
      <div className={s.cardBody}>{card.body}</div>
      <div className={s.panelHead}>
        <span className={s.hint}>{card.updatedByName ? `${card.updatedByName} · ` : ''}{card.updatedAt.slice(0, 10)}</span>
        <span className={s.spacer} />
        {canManage ? (
          <>
            <button type="button" className={btn('outline')} onClick={onEdit} disabled={busy}><Bi en="Edit" zh="编辑" /></button>
            <button type="button" className={btn('outline')} onClick={remove} disabled={busy}><Bi en="Remove" zh="删除" /></button>
          </>
        ) : null}
      </div>
      {error ? <div className={s.error} role="alert">{error}</div> : null}
    </section>
  )
}

function CardWindow({ draft, brands, onClose }: { draft: Draft; brands: LeadBrand[]; onClose: () => void }) {
  const [form, setForm] = useState(draft)
  const [busy, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<Draft>) => setForm(f => ({ ...f, ...patch }))
  const save = () => start(async () => {
    setError(null)
    const r = await saveKnowledgeCard(form.id, {
      brandId: form.brandId, kind: form.kind, title: form.title, body: form.body,
      startsOn: form.startsOn || null, endsOn: form.endsOn || null, active: form.active,
    })
    if (!r.ok) setError(r.reason)
    else onClose()
  })
  return (
    <div className={s.scrim} role="presentation" onClick={e => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div className={s.window} role="dialog" aria-modal="true" aria-labelledby="card-title" style={{ width: 640 }}>
        <h2 id="card-title" className={s.windowTitle}>{form.id ? <Bi en="Edit card" zh="编辑资料" /> : <Bi en="New card" zh="新增资料" />}</h2>
        <div className={s.fieldGrid}>
          <label className={s.field}><Bi en="Brand" zh="品牌" />
            <select value={form.brandId ?? ''} onChange={e => set({ brandId: e.target.value || null })}>
              <option value="">Every brand · 所有品牌</option>
              {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label className={s.field}><Bi en="Kind" zh="类型" />
            <select value={form.kind} onChange={e => set({ kind: e.target.value as KnowledgeKind })}>
              {KINDS.map(k => <option key={k} value={k}>{KIND_LABEL[k].en} · {KIND_LABEL[k].zh}</option>)}
            </select>
          </label>
          <label className={`${s.field} ${s.wide}`}><Bi en="Title" zh="标题" />
            <input value={form.title} onChange={e => set({ title: e.target.value })} maxLength={80} placeholder="e.g. October Sofa Week · 十月沙发周" />
          </label>
          <label className={`${s.field} ${s.wide}`}><Bi en="What the agent may say" zh="AI 可以说的内容" />
            <textarea value={form.body} onChange={e => set({ body: e.target.value })} maxLength={4000} rows={8}
              placeholder={'Write the facts plainly — prices, what is included, conditions, addresses.\n写清楚事实：价格、包含什么、条件、地址。'} />
            <span className={s.hint} style={{ alignSelf: 'flex-end' }}>{form.body.length} / 4,000</span>
          </label>
          <label className={s.field}><Bi en="From (optional)" zh="开始日期（可不填）" /><input type="date" value={form.startsOn} onChange={e => set({ startsOn: e.target.value })} /></label>
          <label className={s.field}><Bi en="Until (optional)" zh="结束日期（可不填）" /><input type="date" value={form.endsOn} onChange={e => set({ endsOn: e.target.value })} /></label>
          <label className={`${s.check} ${s.wide}`}><input type="checkbox" checked={form.active} onChange={e => set({ active: e.target.checked })} /><Bi en="On — the agent may use it" zh="开启：AI 可以使用" /></label>
          {error ? <div className={`${s.error} ${s.wide}`} role="alert">{error}</div> : null}
          <div className={`${s.actions} ${s.wide}`}>
            <button type="button" className={btn('primary')} onClick={save} disabled={busy || !form.title.trim() || !form.body.trim()}>{busy ? 'Saving…' : <Bi en="Save" zh="保存" />}</button>
            <button type="button" className={btn('outline')} onClick={onClose} disabled={busy}><Bi en="Cancel" zh="取消" /></button>
          </div>
        </div>
      </div>
    </div>
  )
}
