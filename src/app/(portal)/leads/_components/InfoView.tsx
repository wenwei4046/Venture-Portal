'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { flash } from '@/components/hrv/toast'
import { LeadIcon, type LeadIconName } from '@/components/layout/lead-icons'
import { saveInfo } from '@/lib/leads/actions'
import { FIELD_TYPES, INFO_KIND_LABEL, infoKind, slug, type InfoCard, type InfoCat, type InfoFieldType, type InfoKind, type LeadInfo } from '@/lib/leads/info'
import type { LeadBrand } from '@/lib/leads/types'
import s from './info.module.css'

/**
 * Lead View v2 › General info (2026-11-02, the v2 handoff §7.9; mig 20261102130000): the facts the AI Agent and CS use.
 * Categories (All info first; add, rename, delete — each with its own icon); the list (search, +, Brand and Status
 * dropdowns, group heads under All info; right-click Edit / Duplicate / Delete); the item (Name *, Brand * as several,
 * its status, delete, Save; DETAILS as label · type · value; VALID; USED IN). The status comes from the dates; a card
 * switched off reads Paused. Kept though not drawn (the user's point 2), behind "More" at the foot of the item: its
 * template code `{code.field}` and its notes.
 */

type Draft = InfoCard & { isNew?: boolean }
type StatusFilter = 'all' | InfoKind | 'unused'
const ICONS: LeadIconName[] = ['folder', 'store', 'tag', 'credit-card', 'truck', 'gift', 'calendar', 'map-pin', 'phone', 'shield-check', 'star', 'sofa', 'bed-double', 'percent', 'clock', 'info']
const ICON_OF: Record<string, LeadIconName> = { mapPin: 'map-pin', creditCard: 'credit-card', shieldCheck: 'shield-check', fileText: 'file-text' }
const iconOf = (n: string): LeadIconName => (ICON_OF[n] ?? (n as LeadIconName))
const brandIdsOf = (c: Pick<InfoCard, 'brandId' | 'brandIds'>) => c.brandIds ?? (c.brandId ? [c.brandId] : [])
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export default function InfoView({ info, ready, brands, today, uses, canEdit }: {
  info: LeadInfo
  ready: boolean
  brands: LeadBrand[]
  today: string
  uses: Array<{ label: string; opts: string[] }>
  canEdit: boolean
}) {
  const router = useRouter()
  const [cats, setCats] = useState<InfoCat[]>(info.cats)
  const [saved, setSaved] = useState<InfoCard[]>(info.cards)
  useEffect(() => { setCats(info.cats); setSaved(info.cards) }, [info])
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [cat, setCat] = useState<string>('All')
  const [q, setQ] = useState('')
  const [brandF, setBrandF] = useState<string>('All')
  const [stF, setStF] = useState<StatusFilter>('all')
  const [open, setOpen] = useState<'' | 'brand' | 'status'>('')
  const [sel, setSel] = useState<string | null>(null)
  const [ren, setRen] = useState<{ id: string | '__new'; name: string; icon: LeadIconName } | null>(null)
  const [catCtx, setCatCtx] = useState<{ id: string; x: number; y: number } | null>(null)
  const [rowCtx, setRowCtx] = useState<{ id: string; x: number; y: number } | null>(null)
  const [busy, start] = useTransition()
  const [error, setError] = useState('')

  const allCards: Draft[] = useMemo(() => {
    const kept = saved.map(c => drafts[c.id] ?? c)
    return [...kept, ...Object.values(drafts).filter(d => d.isNew)]
  }, [saved, drafts])
  const catOf = (id: string) => cats.find(c => c.id === id)
  const brandName = (id: string) => brands.find(b => b.id === id)?.name ?? '—'
  const brandLabel = (c: Draft) => { const ids = brandIdsOf(c); return ids.length === 0 ? 'All brands' : ids.length === brands.length ? 'All brands' : ids.map(brandName).join(', ') }
  const ql = q.trim().toLowerCase()
  const inQ = (c: Draft) => !ql || `${c.name} ${brandLabel(c)} ${c.fields.map(f => `${f.label} ${f.value}`).join(' ')}`.toLowerCase().includes(ql)
  const inCat = (c: Draft) => cat === 'All' || c.catId === cat
  const inBrand = (c: Draft) => brandF === 'All' || brandIdsOf(c).length === 0 || brandIdsOf(c).includes(brandF)
  const inSt = (c: Draft) => stF === 'all' || (stF === 'unused' ? c.uses.length === 0 : infoKind(c, today).kind === stF)
  const vis = allCards.filter(c => inQ(c) && inCat(c) && inBrand(c) && inSt(c))
  const cur = vis.find(c => c.id === sel) ?? (sel ? allCards.find(c => c.id === sel) : undefined) ?? vis[0] ?? null

  /** Saves the whole page as the database takes it: every category, every card as saved — the one being saved as drafted. */
  const persist = (nextCats: InfoCat[], nextCards: InfoCard[], done?: (d: LeadInfo) => void) => start(async () => {
    setError('')
    const r = await saveInfo(nextCats.map(c => ({ id: c.id, label: c.label, icon: c.icon })), nextCards)
    if (!r.ok) { setError(r.reason); return }
    done?.(r.data)
    router.refresh()
  })
  const edit = (c: Draft, o: Partial<Draft>) => setDrafts(d => ({ ...d, [c.id]: { ...c, ...o } }))
  // As drawn, a new item needs a name and a brand; an older one for every brand (no brands kept) stays so.
  const missing = (c: Draft) => !c.name.trim() || (!!c.isNew && brandIdsOf(c).length === 0)
  const dirty = (c: Draft) => !!c.isNew || (!!drafts[c.id] && !same(drafts[c.id], saved.find(x => x.id === c.id)))
  const saveCard = (c: Draft) => {
    if (missing(c)) { setError('Add a name and choose a brand'); return }
    const { isNew: _new, ...clean } = c
    void _new
    const others = saved.filter(x => x.id !== c.id)
    const at = saved.findIndex(x => x.id === c.id)
    const cards = at < 0 ? [...saved, { ...clean, id: '' }] : [...others.slice(0, at), clean, ...others.slice(at)]
    persist(cats, cards, d => {
      setDrafts(x => { const n = { ...x }; delete n[c.id]; return n })
      const fresh = c.isNew ? d.cards.find(x => x.name === clean.name && x.catId === clean.catId && !saved.some(y => y.id === x.id)) : null
      if (fresh) setSel(fresh.id)
      flash('Saved')
    })
  }
  const removeCard = (c: Draft) => {
    setDrafts(x => { const n = { ...x }; delete n[c.id]; return n })
    if (c.isNew) { setSel(null); return }
    persist(cats, saved.filter(x => x.id !== c.id), () => { setSel(null); flash(`Deleted “${c.name || 'Untitled'}”`) })
  }
  const newId = () => `new-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const addCard = () => {
    const catId = cat === 'All' ? cats[0]?.id : cat
    if (!catId) return
    const id = newId()
    setDrafts(d => ({ ...d, [id]: { id, catId, brandId: null, brandIds: [], name: '', code: '', status: 'on', validFrom: null, validUntil: null, note: '', fields: [{ key: null, label: '', value: '', type: 'text' }], uses: [], isNew: true } }))
    setSel(id); setStF('all'); setQ('')
  }
  const duplicate = (c: Draft) => {
    const id = newId()
    setDrafts(d => ({ ...d, [id]: { ...c, id, name: `${c.name} copy`.slice(0, 120), code: '', uses: [], fields: c.fields.map(f => ({ ...f })), isNew: true } }))
    setSel(id)
  }
  const saveCats = (next: InfoCat[], after?: () => void) => persist(next, saved, () => after?.())
  const renDone = () => {
    if (!ren) return
    const name = ren.name.trim()
    if (!name) { setRen(null); return }
    if (ren.id === '__new') {
      const id = `new-cat-${Date.now().toString(36)}`
      const next = [...cats, { id, kind: 'topic' as const, label: name, icon: ren.icon, custom: true }]
      setCats(next); setRen(null)
      saveCats(next)
    } else {
      const next = cats.map(c => (c.id === ren.id ? { ...c, label: name, icon: ren.icon } : c))
      setCats(next); setRen(null)
      saveCats(next)
    }
  }
  const deleteCat = (id: string) => {
    const n = allCards.filter(c => c.catId === id && !c.isNew).length
    const c = catOf(id)
    if (n && !window.confirm(`Delete “${c?.label}” and its ${n} ${n === 1 ? 'item' : 'items'}?`)) return
    const next = cats.filter(x => x.id !== id)
    setCats(next)
    if (cat === id) setCat('All')
    saveCats(next)
  }

  const brandOpts = ['All', ...brands.map(b => b.id)]
  const stOpts: Array<{ k: StatusFilter; l: string }> = [{ k: 'all', l: 'All' }, { k: 'live', l: 'In use' }, { k: 'soon', l: 'Ending soon' }, { k: 'scheduled', l: 'Scheduled' }, { k: 'expired', l: 'Expired' }, { k: 'unused', l: 'Not used' }, { k: 'paused', l: 'Paused' }]
  const stN = (k: StatusFilter) => allCards.filter(c => inQ(c) && inCat(c) && inBrand(c) && (k === 'all' || (k === 'unused' ? c.uses.length === 0 : infoKind(c, today).kind === k))).length
  const groups = (cat === 'All' ? cats : cats.filter(c => c.id === cat)).map(c => ({ c, rows: vis.filter(x => x.catId === c.id) })).filter(g => g.rows.length)

  const renBox = (
    <div className={s.ren} onClick={e => e.stopPropagation()}>
      <input className={s.renInput} value={ren?.name ?? ''} autoFocus placeholder={ren?.id === '__new' ? 'Category name, press Enter' : undefined} aria-label="Category name"
        onChange={e => setRen(r => (r ? { ...r, name: e.target.value } : r))}
        onKeyDown={e => { if (e.key === 'Escape') setRen(null); if (e.key === 'Enter') renDone() }} maxLength={60} />
      <div className={s.icons} role="group" aria-label="Icon">
        {ICONS.map(n => <button key={n} type="button" className={s.icon} title={n} aria-pressed={ren?.icon === n} onClick={() => setRen(r => (r ? { ...r, icon: n } : r))}><LeadIcon name={n} size={14} /></button>)}
      </div>
    </div>
  )

  return (
    <div className={s.grid}>
      <section className={s.cats} aria-label="Categories">
        <span className={s.kicker}>CATEGORY</span>
        <button type="button" className={s.cat} aria-pressed={cat === 'All'} onClick={() => setCat('All')}>
          <LeadIcon name="layers" size={16} /><span className={s.catName}>All info</span><span className={s.catN}>{allCards.length}</span>
        </button>
        {cats.map(c => ren?.id === c.id ? <div key={c.id}>{renBox}</div> : (
          <button key={c.id} type="button" className={s.cat} aria-pressed={cat === c.id} onClick={() => setCat(c.id)}
            onContextMenu={e => { if (!canEdit || !ready) return; e.preventDefault(); setCatCtx({ id: c.id, x: e.clientX, y: e.clientY }) }}>
            <LeadIcon name={iconOf(c.icon)} size={16} /><span className={s.catName}>{c.label}</span><span className={s.catN}>{allCards.filter(x => x.catId === c.id).length}</span>
          </button>
        ))}
        {ren ? <div className={s.renCatch} onClick={() => setRen(null)} aria-hidden="true" /> : null}
        {ren?.id === '__new' ? renBox : canEdit && ready ? (
          <button type="button" className={s.addCat} onClick={() => setRen({ id: '__new', name: '', icon: 'folder' })}><LeadIcon name="plus" size={16} />Add category</button>
        ) : null}
      </section>

      <section className={s.list} aria-label="Info">
        <div className={s.listHead}>
          <div className={s.searchRow}>
            <div className={s.search}><LeadIcon name="search" size={15} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, address, offer…" aria-label="Search" /></div>
            {canEdit ? <button type="button" className={s.plus} title="Add info" aria-label="Add info" disabled={!ready || !cats.length} onClick={addCard}><LeadIcon name="plus" size={16} /></button> : null}
          </div>
          <div className={s.filters}>
            <div className={s.dropWrap}>
              <button type="button" className={s.drop} aria-haspopup="menu" aria-expanded={open === 'brand'} onClick={() => setOpen(o => (o === 'brand' ? '' : 'brand'))}>
                <LeadIcon name="store" size={14} />{brandF === 'All' ? 'All brands' : brandName(brandF)}<LeadIcon name="chevron-down" size={13} />
              </button>
              {open === 'brand' ? (
                <>
                  <div className={s.catch} onClick={() => setOpen('')} aria-hidden="true" />
                  <div className={s.menu} role="menu">
                    {brandOpts.map(k => (
                      <button key={k} type="button" role="menuitemradio" aria-checked={brandF === k} className={s.menuItem} onClick={() => { setBrandF(k); setOpen('') }}>
                        <span>{k === 'All' ? 'All brands' : brandName(k)}</span>
                        <span className={s.menuN}>{allCards.filter(c => inQ(c) && inCat(c) && inSt(c) && (k === 'All' || brandIdsOf(c).length === 0 || brandIdsOf(c).includes(k))).length}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
            <div className={s.dropWrap}>
              <button type="button" className={s.drop} aria-haspopup="menu" aria-expanded={open === 'status'} onClick={() => setOpen(o => (o === 'status' ? '' : 'status'))}>
                <LeadIcon name="circle-dot" size={14} />{stF === 'all' ? 'All statuses' : stOpts.find(o => o.k === stF)?.l}<LeadIcon name="chevron-down" size={13} />
              </button>
              {open === 'status' ? (
                <>
                  <div className={s.catch} onClick={() => setOpen('')} aria-hidden="true" />
                  <div className={s.menu} role="menu">
                    {stOpts.map(o => (
                      <button key={o.k} type="button" role="menuitemradio" aria-checked={stF === o.k} className={s.menuItem} onClick={() => { setStF(o.k); setOpen('') }}>
                        <span className={s.mDot} data-kind={o.k} /><span>{o.l}</span><span className={s.menuN}>{stN(o.k)}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
        <div className={s.rows}>
          {groups.map(g => (
            <div key={g.c.id} className={s.group}>
              {cat === 'All' ? <span className={s.groupHead}>{g.c.label.toUpperCase()}</span> : null}
              {g.rows.map(c => {
                const k = infoKind(c, today)
                const first = c.fields.find(f => f.value.trim())?.value
                return (
                  <button key={c.id} type="button" className={s.row} aria-current={cur?.id === c.id} onClick={() => setSel(c.id)}
                    onContextMenu={e => { if (!canEdit) return; e.preventDefault(); setSel(c.id); setRowCtx({ id: c.id, x: Math.min(e.clientX, window.innerWidth - 180), y: Math.min(e.clientY, window.innerHeight - 130) }) }}>
                    <div className={s.rowText}>
                      <span className={s.rowName}>{c.name || 'Untitled'}</span>
                      <span className={s.rowSub}>{brandLabel(c)}{first ? ` · ${first}` : ''}</span>
                    </div>
                    <span className={s.rowSt} data-kind={k.kind}>{k.label}</span>
                  </button>
                )
              })}
            </div>
          ))}
          {!groups.length ? <span className={s.none}>Nothing matches</span> : null}
        </div>
      </section>

      <section className={s.ed} aria-label="Item">
        {cur ? <Editor key={cur.id} card={cur} cat={catOf(cur.catId)} brands={brands} today={today} uses={uses} canEdit={canEdit && ready} dirty={dirty(cur)}
          missing={missing(cur)} busy={busy} error={error} onEdit={o => edit(cur, o)} onSave={() => saveCard(cur)} onDelete={() => removeCard(cur)} />
          : <div className={s.empty}>{ready ? 'Pick an item, or add one with +.' : 'Waiting for the database update.'}</div>}
      </section>

      {catCtx ? (
        <>
          <div className={s.ctxCatch} onClick={() => setCatCtx(null)} onContextMenu={e => { e.preventDefault(); setCatCtx(null) }} aria-hidden="true" />
          <div className={s.ctx} role="menu" style={{ left: catCtx.x, top: catCtx.y }}>
            <button type="button" role="menuitem" className={s.ctxItem} onClick={() => { const c = catOf(catCtx.id); setCatCtx(null); if (c) setRen({ id: c.id, name: c.label, icon: iconOf(c.icon) }) }}>Rename</button>
            <button type="button" role="menuitem" className={s.ctxItem} data-rust="" onClick={() => { const id = catCtx.id; setCatCtx(null); deleteCat(id) }}>Delete</button>
          </div>
        </>
      ) : null}
      {rowCtx ? (
        <>
          <div className={s.ctxCatch} onClick={() => setRowCtx(null)} onContextMenu={e => { e.preventDefault(); setRowCtx(null) }} aria-hidden="true" />
          <div className={s.ctx} role="menu" style={{ left: rowCtx.x, top: rowCtx.y }}>
            <button type="button" role="menuitem" className={s.ctxItem} onClick={() => { setSel(rowCtx.id); setRowCtx(null) }}>Edit</button>
            <button type="button" role="menuitem" className={s.ctxItem} onClick={() => { const c = allCards.find(x => x.id === rowCtx.id); setRowCtx(null); if (c) duplicate(c) }}>Duplicate</button>
            <button type="button" role="menuitem" className={s.ctxItem} data-rust="" onClick={() => { const c = allCards.find(x => x.id === rowCtx.id); setRowCtx(null); if (c) removeCard(c) }}>Delete</button>
          </div>
        </>
      ) : null}
    </div>
  )
}

function Editor({ card, cat, brands, today, uses, canEdit, dirty, missing, busy, error, onEdit, onSave, onDelete }: {
  card: Draft
  cat: InfoCat | undefined
  brands: LeadBrand[]
  today: string
  uses: Array<{ label: string; opts: string[] }>
  canEdit: boolean
  dirty: boolean
  missing: boolean
  busy: boolean
  error: string
  onEdit: (o: Partial<Draft>) => void
  onSave: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState<'' | 'brand' | 'status' | 'use' | number>('')
  const [dates, setDates] = useState(!!(card.validFrom || card.validUntil))
  const [more, setMore] = useState(false)
  const ids = brandIdsOf(card)
  const k = infoKind(card, today)
  const brandL = ids.length === 0 ? (card.isNew ? 'Choose brand *' : 'All brands') : ids.length === brands.length ? 'All brands' : ids.map(id => brands.find(b => b.id === id)?.name ?? '—').join(', ')
  const setField = (i: number, o: Partial<Draft['fields'][number]>) => onEdit({ fields: card.fields.map((f, j) => (j === i ? { ...f, ...o } : f)) })
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const dm = (d: string) => `${Number(d.slice(8))} ${MON[Number(d.slice(5, 7)) - 1]}`
  const allUses = uses.flatMap(g => g.opts).filter(o => !card.uses.includes(o))
  const ph: Partial<Record<InfoFieldType, string>> = { number: '0', tel: '012-345 6789', url: 'https://…' }
  return (
    <div className={s.edIn}>
      <div className={s.edHead}>
        <span className={s.edIcon}><LeadIcon name={iconOf(cat?.icon ?? 'folder')} size={18} /></span>
        <div className={s.edTitles}>
          <input className={s.edName} value={card.name} maxLength={120} placeholder="Name *" title={missing ? 'Add a name and choose a brand' : undefined} disabled={!canEdit} aria-label="Name" onChange={e => onEdit({ name: e.target.value })} />
          <div className={s.edMeta}>
            <span>{cat?.label ?? '—'}</span><span>·</span>
            <div style={{ position: 'relative' }}>
              <button type="button" className={s.brandBtn} data-missing={(card.isNew && ids.length === 0) || undefined} disabled={!canEdit} onClick={() => setOpen(o => (o === 'brand' ? '' : 'brand'))}>{brandL}<LeadIcon name="chevron-down" size={12} /></button>
              {open === 'brand' ? (
                <>
                  <div className={s.catch} onClick={() => setOpen('')} aria-hidden="true" />
                  <div className={s.brandMenu} role="menu">
                    {brands.map(b => {
                      const on = ids.includes(b.id)
                      return (
                        <button key={b.id} type="button" role="menuitemcheckbox" aria-checked={on} className={s.menuItem}
                          onClick={() => onEdit({ brandIds: on ? ids.filter(x => x !== b.id) : [...ids, b.id] })}>
                          <span className={s.box} data-on={on || undefined}>{on ? <LeadIcon name="check" size={11} /> : null}</span><span>{b.name}</span>
                        </button>
                      )
                    })}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
        <div className={s.stWrap}>
          <button type="button" className={s.stPill} data-kind={k.kind} title="Change status" disabled={!canEdit} onClick={() => setOpen(o => (o === 'status' ? '' : 'status'))}>{k.label}<LeadIcon name="chevron-down" size={12} /></button>
          {open === 'status' ? (
            <>
              <div className={s.catch} onClick={() => setOpen('')} aria-hidden="true" />
              <div className={s.stMenu} role="menu">
                {(['on', 'off'] as const).map(v => (
                  <button key={v} type="button" role="menuitemradio" aria-checked={card.status === v} className={s.stItem} onClick={() => { onEdit({ status: v }); setOpen('') }}>
                    <span className={s.mDot} data-kind={v === 'on' ? 'live' : 'paused'} />{v === 'on' ? INFO_KIND_LABEL.live : INFO_KIND_LABEL.paused}
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>
        {canEdit ? <button type="button" className={s.del} title="Delete" aria-label="Delete" onClick={onDelete}><LeadIcon name="trash-2" size={15} /></button> : null}
        {canEdit ? (
          <button type="button" className={s.saveBtn} data-on={(dirty && !missing) || undefined} disabled={!dirty || missing || busy}
            title={missing ? 'Add a name and choose a brand' : undefined} onClick={onSave}>{busy ? 'Saving…' : dirty ? 'Save' : 'Saved'}</button>
        ) : null}
      </div>
      <div className={s.edBody}>
        {error ? <span className={s.error} role="alert">{error}</span> : null}
        <div className={s.sect}>
          <span className={s.sectKicker}>DETAILS</span>
          {card.fields.map((f, i) => {
            const t = f.type ?? 'text'
            return (
              <div key={i} className={s.field}>
                <input className={s.fLabel} value={f.label} placeholder="Label" maxLength={60} disabled={!canEdit} aria-label={`Detail ${i + 1} label`} onChange={e => setField(i, { label: e.target.value })} />
                <div className={s.typeWrap}>
                  <button type="button" className={s.typeBtn} disabled={!canEdit} onClick={() => setOpen(o => (o === i ? '' : i))}>{FIELD_TYPES.find(x => x.v === t)?.l}<LeadIcon name="chevron-down" size={12} /></button>
                  {open === i ? (
                    <>
                      <div className={s.catch} onClick={() => setOpen('')} aria-hidden="true" />
                      <div className={s.typeMenu} role="menu">
                        {FIELD_TYPES.map(x => <button key={x.v} type="button" role="menuitemradio" aria-checked={t === x.v} className={s.menuItem} onClick={() => { setField(i, { type: x.v }); setOpen('') }}>{x.l}</button>)}
                      </div>
                    </>
                  ) : null}
                </div>
                <input className={s.fValue} type={t === 'url' ? 'url' : t} value={f.value} placeholder={ph[t] ?? 'Value'} maxLength={1000} disabled={!canEdit} aria-label={`${f.label || 'Detail'} value`} onChange={e => setField(i, { value: e.target.value })} />
                {canEdit ? <button type="button" className={s.fX} title="Remove" aria-label="Remove detail" onClick={() => onEdit({ fields: card.fields.filter((_, j) => j !== i) })}><LeadIcon name="x" size={14} /></button> : <span />}
              </div>
            )
          })}
          {canEdit ? <button type="button" className={s.quiet} onClick={() => onEdit({ fields: [...card.fields, { key: null, label: '', value: '', type: 'text' }] })}><LeadIcon name="plus" size={13} />Add detail</button> : null}
        </div>
        <div className={s.sect}>
          {dates ? (
            <>
              <span className={s.sectKicker}>VALID</span>
              <div className={s.dates}>
                <input type="date" className={s.date} value={card.validFrom ?? ''} disabled={!canEdit} aria-label="From" onChange={e => onEdit({ validFrom: e.target.value || null })} />
                <span className={s.to}>to</span>
                <input type="date" className={s.date} value={card.validUntil ?? ''} min={card.validFrom ?? undefined} disabled={!canEdit} aria-label="To" onChange={e => onEdit({ validUntil: e.target.value || null })} />
              </div>
              <span className={s.note}>{card.validUntil ? `Stops being used after ${dm(card.validUntil)}` : 'No end date · always used'}</span>
            </>
          ) : canEdit ? <button type="button" className={s.quiet} onClick={() => setDates(true)}><LeadIcon name="calendar-plus" size={13} />Add dates</button> : null}
        </div>
        <div className={s.sect}>
          <span className={s.sectKicker}>USED IN</span>
          {card.uses.length ? (
            <div className={s.chips}>
              {card.uses.map(u => (
                <span key={u} className={s.useChip}><LeadIcon name="link-2" size={12} />{u}
                  {canEdit ? <button type="button" className={s.useX} title="Remove" aria-label={`Remove ${u}`} onClick={() => onEdit({ uses: card.uses.filter(x => x !== u) })}><LeadIcon name="x" size={12} /></button> : null}
                </span>
              ))}
            </div>
          ) : <span className={s.muted}>Not used yet</span>}
          {canEdit ? (
            <div className={s.dropWrap}>
              <button type="button" className={s.quiet} onClick={() => setOpen(o => (o === 'use' ? '' : 'use'))}><LeadIcon name="plus" size={13} />Add</button>
              {open === 'use' ? (
                <>
                  <div className={s.catch} onClick={() => setOpen('')} aria-hidden="true" />
                  <div className={s.useMenu} role="menu">
                    {allUses.map(o => <button key={o} type="button" role="menuitem" className={s.menuItem} onClick={() => { onEdit({ uses: [...card.uses, o] }); setOpen('') }}>{o}</button>)}
                    {!allUses.length ? <span className={s.muted} style={{ padding: 8 }}>Nothing more to add</span> : null}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className={s.sect}>
          <button type="button" className={s.quiet} onClick={() => setMore(m => !m)} aria-expanded={more}><LeadIcon name={more ? 'chevron-down' : 'chevron-right'} size={13} />More</button>
          {more ? (
            <>
              <span className={s.sectKicker}>TEMPLATE CODE</span>
              <input className={s.code} value={card.code} maxLength={40} placeholder={slug(card.name) || 'e.g. kl'} disabled={!canEdit} aria-label="Template code" onChange={e => onEdit({ code: e.target.value })} />
              <span className={s.note}>Reply templates insert a detail as {`{${card.code || slug(card.name) || 'code'}.${slug(card.fields[0]?.label ?? '') || 'detail'}}`}.</span>
              <span className={s.sectKicker}>NOTES</span>
              <textarea className={s.textarea} rows={3} value={card.note} maxLength={2000} disabled={!canEdit} aria-label="Notes" onChange={e => onEdit({ note: e.target.value })} />
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
