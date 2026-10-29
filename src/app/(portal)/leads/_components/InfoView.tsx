'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveInfo } from '@/lib/leads/actions'
import { SHOP_FIELDS, cardStatus, followAddress, mapsLinkOf, slug, tokenOf, wazeLinkOf, type InfoCard, type InfoCat, type InfoField, type LeadInfo } from '@/lib/leads/info'
import type { LeadBrand } from '@/lib/leads/types'
import { LeadIcon, type LeadIconName } from '@/components/layout/lead-icons'
import s from './setup.module.css'

/**
 * Lead View › General info (2026-10-22, the redesign v2 handoff `Basic Info.dc.html`): cards per showroom or topic —
 * the source of the Inbox's General info menu and, from step 4, of the reply templates' `{code.field}` tokens.
 * Categories on the left (CS may add and delete their own; Drafts and Scheduled under NOT LIVE YET), Brand and Status
 * filters, and each card's fields, note, Draft / In use / Off, dates and USED BY. The page saves as a whole: Save
 * writes every card as it stands (lead_save_info), Discard goes back to the last save.
 *
 * Images ("Add image") are drawn and held: they need files in storage, which come with the Data Center (step 5).
 */

const CAT_ICON: Readonly<Record<string, LeadIconName>> = { store: 'store', 'credit-card': 'creditCard', truck: 'truck', 'shield-check': 'shieldCheck', 'file-text': 'fileText' }
const FIELD_ICON: Readonly<Record<string, LeadIconName>> = { address: 'mapPin', hours: 'clock', phone: 'phone', maps: 'map', waze: 'navigation' }
const STATUSES = ['Draft', 'In use', 'Scheduled', 'Ending soon', 'Expired', 'Off'] as const
const ALL = '__all'

type Draft = { cats: InfoCat[]; cards: InfoCard[] }
let seq = 0
const newId = (p: string) => `${p}-${Date.now().toString(36)}${(seq++).toString(36)}`

export default function InfoView({ info, ready, brands, today, uses, canEdit }: {
  info: LeadInfo
  /** Is the migration applied? Before it, the page can be tried but not saved. */
  ready: boolean
  brands: LeadBrand[]
  today: string
  /** USED BY's choices, grouped. */
  uses: Array<{ label: string; opts: string[] }>
  canEdit: boolean
}) {
  const router = useRouter()
  const [saved, setSaved] = useState<Draft>(info)
  const [d, setD] = useState<Draft>(info)
  const [dirty, setDirty] = useState(false)
  const [savedAt, setSavedAt] = useState('')
  const [error, setError] = useState('')
  const [busy, start] = useTransition()
  const [cat, setCat] = useState<string>('All')
  const [view, setView] = useState<'draft' | 'scheduled' | null>(null)
  const [fBrands, setFBrands] = useState<string[]>([])
  const [fStats, setFStats] = useState<string[]>([])
  const [open, setOpen] = useState<string | null>(null)
  // Which showroom each showroom category shows (one at a time).
  const [page, setPage] = useState<Record<string, number>>({})
  const [catIn, setCatIn] = useState<string | null>(null)
  // A category's right-click menu (the user, 2026-10-23: "加delete") — any category, seeded or added.
  const [catMenu, setCatMenu] = useState<{ id: string; x: number; y: number } | null>(null)

  // Unsaved changes: the browser asks before the tab closes.
  useEffect(() => {
    if (!dirty) return
    const ask = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', ask)
    return () => window.removeEventListener('beforeunload', ask)
  }, [dirty])

  const edit = (fn: (x: Draft) => Draft) => { setD(fn); setDirty(true); setSavedAt('') }
  const upd = (id: string, o: Partial<InfoCard> | ((c: InfoCard) => Partial<InfoCard>)) =>
    edit(x => ({ ...x, cards: x.cards.map(c => (c.id === id ? { ...c, ...(typeof o === 'function' ? o(c) : o) } : c)) }))

  const brandName = (id: string | null) => (id === null ? 'All brands' : brands.find(b => b.id === id)?.name ?? '—')
  const keysOf = (c: InfoCard) => cardStatus(c, today).keys
  const byBrand = (c: InfoCard) => fBrands.length === 0 || fBrands.includes(c.brandId ?? ALL)
  const byStat = (c: InfoCard) => fStats.length === 0 || keysOf(c).some(k => fStats.includes(k))
  const byView = (c: InfoCard) => !view || keysOf(c).includes(view === 'draft' ? 'Draft' : 'Scheduled')
  const shownCats = cat === 'All' || view ? d.cats : d.cats.filter(c => c.id === cat)

  const save = () => {
    setError('')
    start(async () => {
      const r = await saveInfo(d.cats.map(c => ({ id: c.id, label: c.label })), d.cards.map(c => ({ ...c, id: c.id.startsWith('new-') ? '' : c.id })))
      if (!r.ok) { setError(r.reason); return }
      setSaved(r.data)
      setD(r.data)
      setDirty(false)
      const t = new Date()
      setSavedAt(`${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`)
      router.refresh()
    })
  }
  const discard = () => { setD(saved); setDirty(false); setError('') }
  const addCard = (c: InfoCat) => {
    const brandId = fBrands.length === 1 && fBrands[0] !== ALL ? fBrands[0] : brands[0]?.id ?? null
    const fields: InfoField[] = c.kind === 'showroom' ? SHOP_FIELDS.map(f => ({ key: f.key, label: f.label, value: '' })) : [{ key: null, label: '', value: '' }]
    setFStats([])
    edit(x => ({ ...x, cards: [{ id: newId('new'), catId: c.id, brandId, name: '', code: '', status: 'draft', validFrom: null, validUntil: null, note: '', fields, uses: [] }, ...x.cards] }))
  }
  const addCat = () => {
    const label = (catIn ?? '').trim()
    setCatIn(null)
    if (!label) return
    const id = newId('new')
    setCat(id)
    edit(x => ({ ...x, cats: [...x.cats, { id, kind: 'topic', label, icon: 'file-text', custom: true }] }))
  }
  const removeCat = (c: InfoCat) => {
    const n = d.cards.filter(x => x.catId === c.id).length
    if (n && !window.confirm(`Delete “${c.label}” and its ${n} card${n > 1 ? 's' : ''}?`)) return
    if (cat === c.id) setCat('All')
    edit(x => ({ cats: x.cats.filter(y => y.id !== c.id), cards: x.cards.filter(y => y.catId !== c.id) }))
  }

  const brandOpts = [...brands.map(b => ({ v: b.id, l: b.name })), { v: ALL, l: 'Shared by every brand' }]

  return (
    <div className={s.page}>
      <div className={s.head}>
        <div className={s.titles}>
          <span className={s.eyebrow}>SET UP</span>
          <h1 className={s.title}>General info</h1>
        </div>
        <span className={s.saveHint} data-dirty={dirty || undefined}>{dirty ? 'Unsaved changes' : savedAt ? `Saved at ${savedAt}` : 'No changes yet'}</span>
        {canEdit ? (
          <>
            <button type="button" className={s.btn} data-quiet="" onClick={discard} disabled={!dirty || busy}>Discard</button>
            <button type="button" className={s.btn} data-dark={dirty || undefined} onClick={save} disabled={!dirty || busy || !ready}>{busy ? 'Saving…' : 'Save'}</button>
          </>
        ) : null}
      </div>
      {!ready ? <div className={s.notReady}>Waiting for the database update — you can try the page, but nothing is saved yet.</div> : null}
      {error ? (
        <div className={s.error} role="alert"><LeadIcon name="alert" size={15} /><span>{error}</span><button type="button" className={s.linkBtn} onClick={save}>Try again</button></div>
      ) : null}

      <div className={s.panel}>
        <section className={s.side} aria-label="Categories">
          <div className={s.sideHead}>
            <span className={s.kicker}>CATEGORY</span>
            {canEdit ? <button type="button" className={s.iconBtn} title="Add category" onClick={() => setCatIn('')}><LeadIcon name="plus" size={13} /></button> : null}
          </div>
          {[{ id: 'All', label: 'All', icon: 'grid' as LeadIconName, custom: false }, ...d.cats.map(c => ({ id: c.id, label: c.label, icon: CAT_ICON[c.icon] ?? 'fileText', custom: c.custom }))].map(c => {
            const count = c.id === 'All' ? d.cards.filter(byBrand).length : d.cards.filter(x => x.catId === c.id && byBrand(x)).length
            return (
              <button key={c.id} type="button" className={s.catBtn} aria-pressed={!view && cat === c.id} onClick={() => { setCat(c.id); setView(null) }}
                onContextMenu={e => { if (c.id === 'All' || !canEdit) return; e.preventDefault(); setCatMenu({ id: c.id, x: e.clientX, y: e.clientY }) }}>
                <span className={s.catIcon}><LeadIcon name={c.icon} size={14} /></span>
                <span className={s.catLabel}>{c.label}</span>
                <span className={s.catCount}>{count}</span>
                {c.id !== 'All' && canEdit ? (
                  <span className={s.catDel} role="button" tabIndex={0} title="Delete category" aria-label={`Delete ${c.label}`}
                    onClick={e => { e.stopPropagation(); const k = d.cats.find(x => x.id === c.id); if (k) removeCat(k) }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); const k = d.cats.find(x => x.id === c.id); if (k) removeCat(k) } }}>×</span>
                ) : null}
              </button>
            )
          })}
          {catMenu ? (
            <>
              <div className={s.ctxScrim} onClick={() => setCatMenu(null)} onContextMenu={e => { e.preventDefault(); setCatMenu(null) }} aria-hidden="true" />
              <div className={s.ctxMenu} style={{ left: catMenu.x, top: catMenu.y }} role="menu">
                <button type="button" role="menuitem" className={s.ctxItem} data-danger="" onClick={() => { const k = d.cats.find(x => x.id === catMenu.id); setCatMenu(null); if (k) removeCat(k) }}>
                  <LeadIcon name="trash" size={13} /> Delete category
                </button>
              </div>
            </>
          ) : null}
          {catIn !== null ? (
            <input className={s.catInput} value={catIn} onChange={e => setCatIn(e.target.value)} placeholder="Category name, press Enter" autoFocus maxLength={60}
              onKeyDown={e => { if (e.key === 'Enter') addCat(); if (e.key === 'Escape') setCatIn(null) }} onBlur={() => { if (!(catIn ?? '').trim()) setCatIn(null) }} />
          ) : null}
          <div className={s.rule} />
          <div className={s.sideHead}><span className={s.kicker}>NOT LIVE YET</span></div>
          {([['draft', 'Drafts', 'filePen'], ['scheduled', 'Scheduled', 'calendarClock']] as const).map(([k, label, icon]) => (
            <button key={k} type="button" className={s.catBtn} aria-pressed={view === k} onClick={() => { setView(k); setCat('All') }}>
              <span className={s.catIcon}><LeadIcon name={icon} size={14} /></span>
              <span className={s.catLabel}>{label}</span>
              <span className={s.catCount}>{d.cards.filter(c => keysOf(c).includes(k === 'draft' ? 'Draft' : 'Scheduled')).length}</span>
            </button>
          ))}
        </section>

        <section className={s.main}>
          <div className={s.filters}>
            <Multi id="brand" title="Brand" open={open} setOpen={setOpen} sel={fBrands} setSel={setFBrands}
              opts={brandOpts.map(o => ({ v: o.v, l: o.l, n: d.cards.filter(c => (c.brandId ?? ALL) === o.v).length }))} />
            <Multi id="stat" title="Status" open={open} setOpen={setOpen} sel={fStats} setSel={setFStats}
              opts={STATUSES.map(v => ({ v, l: v, n: d.cards.filter(c => byBrand(c) && keysOf(c).includes(v)).length }))} />
            <span className={s.viewHint}>
              {view === 'draft' ? 'Drafts are not used by the AI Agent, templates or CS until set to In use.' : view === 'scheduled' ? 'Scheduled info goes live on its start date.' : ''}
            </span>
          </div>
          <div className={s.groups}>
            {shownCats.map(g => {
              const list = d.cards.filter(c => c.catId === g.id && byBrand(c) && byStat(c) && byView(c))
              // Showrooms one at a time (2026-10-29 — the user: "showroom 做成可分页式（容易看）；能新增也能删除（垃圾桶）").
              const paged = g.kind === 'showroom' && list.length > 1
              const at = Math.min(page[g.id] ?? 0, Math.max(0, list.length - 1))
              const shown = paged ? list.slice(at, at + 1) : list
              const cur = list[at]
              const removeCard = (id: string) => {
                edit(x => ({ ...x, cards: x.cards.filter(y => y.id !== id) }))
                setPage(p => ({ ...p, [g.id]: Math.max(0, at - (at >= list.length - 1 ? 1 : 0)) }))
              }
              return (
                <div key={g.id} className={s.group}>
                  <div className={s.groupHead}>
                    <span className={s.catIcon}><LeadIcon name={CAT_ICON[g.icon] ?? 'fileText'} size={15} /></span>
                    <span className={s.groupLabel}>{g.label.toUpperCase()}</span>
                    <span className={s.groupCount}>{list.length}</span>
                    <span className={s.fill} />
                    {g.custom && canEdit && !d.cards.some(c => c.catId === g.id) ? <button type="button" className={s.linkBtn} onClick={() => removeCat(g)}>Delete category</button> : null}
                    {paged ? (
                      <span className={s.pager}>
                        <button type="button" className={s.pageBtn} disabled={at === 0} onClick={() => setPage(p => ({ ...p, [g.id]: at - 1 }))} aria-label="Previous showroom"><LeadIcon name="chevronLeft" size={14} /></button>
                        <span className={s.pageOf}>{at + 1} / {list.length}</span>
                        <button type="button" className={s.pageBtn} disabled={at >= list.length - 1} onClick={() => setPage(p => ({ ...p, [g.id]: at + 1 }))} aria-label="Next showroom"><LeadIcon name="chevronRight" size={14} /></button>
                      </span>
                    ) : null}
                    {canEdit && g.kind === 'showroom' && cur ? (
                      <button type="button" className={s.pageBtn} title={`Delete ${cur.name || 'this showroom'}`} aria-label="Delete this showroom" onClick={() => removeCard(cur.id)}><LeadIcon name="trash" size={14} /></button>
                    ) : null}
                    {canEdit ? <button type="button" className={s.addBtn} onClick={() => { addCard(g); if (g.kind === 'showroom') setPage(p => ({ ...p, [g.id]: list.length })) }}><LeadIcon name="plus" size={13} />{g.kind === 'showroom' ? 'Add showroom' : 'Add info'}</button> : null}
                  </div>
                  {shown.map(c => (
                    <Card key={c.id} c={c} kind={g.kind} today={today} canEdit={canEdit} brandOpts={brandOpts} brandName={brandName}
                      uses={uses} open={open} setOpen={setOpen} upd={upd}
                      remove={() => removeCard(c.id)} />
                  ))}
                  {list.length === 0 ? <div className={s.empty}>Nothing here yet.</div> : null}
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}

function Multi({ id, title, opts, sel, setSel, open, setOpen }: {
  id: string
  title: string
  opts: Array<{ v: string; l: string; n: number }>
  sel: string[]
  setSel: (v: string[]) => void
  open: string | null
  setOpen: (v: string | null) => void
}) {
  const summary = sel.length ? opts.filter(o => sel.includes(o.v)).map(o => o.l).join(', ') : 'All'
  return (
    <div className={s.ddWrap}>
      <button type="button" className={s.dd} data-on={sel.length ? '' : undefined} onClick={() => setOpen(open === id ? null : id)} aria-expanded={open === id}>
        <span className={s.ddTitle}>{title}:</span>{summary}<LeadIcon name="chevronDown" size={13} />
      </button>
      {open === id ? (
        <>
          <div className={s.scrim} onClick={() => setOpen(null)} aria-hidden="true" />
          <div className={s.menu} role="menu">
            {opts.map(o => {
              const on = sel.includes(o.v)
              return (
                <button key={o.v} type="button" role="menuitemcheckbox" aria-checked={on} className={s.menuItem} onClick={() => setSel(on ? sel.filter(x => x !== o.v) : [...sel, o.v])}>
                  <span className={s.tick} data-on={on || undefined}>{on ? '✓' : ''}</span>
                  <span style={{ flex: 1 }}>{o.l}</span>
                  <span className={s.catCount}>{o.n}</span>
                </button>
              )
            })}
            {sel.length ? <button type="button" className={`${s.menuItem} ${s.menuClear}`} onClick={() => setSel([])}>Clear</button> : null}
          </div>
        </>
      ) : null}
    </div>
  )
}

function Card({ c, kind, today, canEdit, brandOpts, brandName, uses, open, setOpen, upd, remove }: {
  c: InfoCard
  kind: InfoCat['kind']
  today: string
  canEdit: boolean
  brandOpts: Array<{ v: string; l: string }>
  brandName: (id: string | null) => string
  uses: Array<{ label: string; opts: string[] }>
  open: string | null
  setOpen: (v: string | null) => void
  upd: (id: string, o: Partial<InfoCard> | ((c: InfoCard) => Partial<InfoCard>)) => void
  remove: () => void
}) {
  const st = cardStatus(c, today)
  const ranged = c.validFrom !== null || c.validUntil !== null
  const first = c.fields.find(f => f.value || f.label) ?? c.fields[0]
  const setField = (i: number, o: Partial<InfoField>) => upd(c.id, x => {
    const fields = x.fields.map((f, j) => (j === i ? { ...f, ...o } : f))
    // The map links follow the address while they are empty or still the address's own (2026-10-29, the user).
    const was = x.fields[i]
    return { fields: was?.key === 'address' && o.value !== undefined ? followAddress(fields, was.value, o.value) : fields }
  })
  const address = c.fields.find(f => f.key === 'address')?.value.trim() ?? ''
  const useKey = `use-${c.id}`
  const dis = !canEdit
  const nameRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (!c.name && c.id.startsWith('new-')) nameRef.current?.focus() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const sample = useMemo(() => (first ? tokenOf(c, first) : ''), [c, first])

  return (
    <div className={s.card}>
      <div className={s.cardHead}>
        <input ref={nameRef} className={s.nameInput} value={c.name} onChange={e => upd(c.id, { name: e.target.value })} disabled={dis} maxLength={120}
          placeholder={kind === 'showroom' ? 'Showroom name' : 'Title, e.g. Instalment'} aria-label="Name" />
        <select className={s.select} value={c.brandId ?? ALL} onChange={e => upd(c.id, { brandId: e.target.value === ALL ? null : e.target.value })} disabled={dis} title="Brand" aria-label="Brand">
          {brandOpts.map(o => <option key={o.v} value={o.v}>{o.v === ALL ? 'All brands' : o.l}</option>)}
        </select>
        <span className={s.chip} data-tone={st.tone}>{st.label}</span>
      </div>
      <div className={s.cardBody}>
        <div className={s.codeRow}>Code
          <input className={s.codeInput} value={c.code} onChange={e => upd(c.id, { code: e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-') })}
            placeholder={slug(c.name) || 'kl'} disabled={dis} maxLength={40} aria-label="Code" />
          <span>Used in fields like {sample}</span>
        </div>
        {c.fields.map((f, i) => {
          const shop = f.key ? SHOP_FIELDS.find(x => x.key === f.key) : undefined
          return (
            <div key={i} className={s.field}>
              {shop ? (
                <span className={s.fieldLabel}><LeadIcon name={FIELD_ICON[shop.key]} size={13} />{shop.label}</span>
              ) : (
                <input className={s.input} value={f.label} onChange={e => setField(i, { label: e.target.value })} placeholder="Label" disabled={dis} maxLength={60} aria-label="Label" />
              )}
              {(f.key === 'maps' || f.key === 'waze') && !f.value.trim() && address && canEdit ? (
                <span style={{ display: 'flex', gap: 8, minWidth: 0 }}>
                  <input className={s.input} style={{ flex: 1, minWidth: 0 }} value={f.value} onChange={e => setField(i, { value: e.target.value })} placeholder={shop?.hint ?? 'Value'} disabled={dis} maxLength={1000}
                    title={tokenOf(c, f)} aria-label={f.label || 'Value'} />
                  <button type="button" className={s.linkBtn} style={{ flex: 'none' }} title="Make the link from the address above — you can still edit it"
                    onClick={() => setField(i, { value: f.key === 'maps' ? mapsLinkOf(address) : wazeLinkOf(address) })}>From the address</button>
                </span>
              ) : (
                <input className={s.input} value={f.value} onChange={e => setField(i, { value: e.target.value })} placeholder={shop?.hint ?? 'Value'} disabled={dis} maxLength={1000}
                  title={tokenOf(c, f)} aria-label={f.label || 'Value'} />
              )}
              {canEdit && c.fields.length > 1 ? (
                <button type="button" className={s.x} title="Remove field" onClick={() => upd(c.id, x => ({ fields: x.fields.filter((_, j) => j !== i) }))}>×</button>
              ) : <span />}
            </div>
          )
        })}
        <button type="button" className={s.imgSlot} disabled title="Images come with the Data Center’s files (a later step)"><LeadIcon name="imagePlus" size={16} />Add image</button>
        <textarea className={s.textarea} rows={2} value={c.note} onChange={e => upd(c.id, { note: e.target.value })} disabled={dis} maxLength={2000}
          placeholder="Notes, e.g. promotion details, conditions, anything else the agent or CS should know" title={`{${c.code || slug(c.name)}.notes}`} aria-label="Notes" />
        {canEdit ? <button type="button" className={s.linkBtn} style={{ alignSelf: 'flex-start' }} onClick={() => upd(c.id, x => ({ fields: [...x.fields, { key: null, label: '', value: '' }] }))}>+ Add field</button> : null}
      </div>
      <div className={s.cardFoot}>
        <div className={s.line}>
          <span className={s.lineLabel}>Status</span>
          <span className={s.seg}>
            {([['draft', 'Draft'], ['on', 'In use'], ['off', 'Off']] as const).map(([v, l]) => (
              <button key={v} type="button" className={s.segBtn} aria-pressed={c.status === v} disabled={dis} onClick={() => upd(c.id, { status: v })}>{l}</button>
            ))}
          </span>
        </div>
        <div className={s.line}>
          <span className={s.lineLabel}>Valid</span>
          <span className={s.seg}>
            <button type="button" className={s.segBtn} aria-pressed={!ranged} disabled={dis} onClick={() => upd(c.id, { validFrom: null, validUntil: null })}>No end date</button>
            <button type="button" className={s.segBtn} aria-pressed={ranged} disabled={dis} onClick={() => upd(c.id, x => ({ validFrom: x.validFrom ?? today, validUntil: x.validUntil ?? today }))}>Date range</button>
          </span>
          {ranged ? (
            <>
              <input type="date" className={s.date} value={c.validFrom ?? ''} disabled={dis} title="Start" onChange={e => upd(c.id, { validFrom: e.target.value || null })} />
              to
              <input type="date" className={s.date} value={c.validUntil ?? ''} min={c.validFrom ?? undefined} disabled={dis} title="End" onChange={e => upd(c.id, { validUntil: e.target.value || null })} />
            </>
          ) : null}
        </div>
      </div>
      <div className={s.uses}>
        <span className={s.useKicker}>USED BY</span>
        {c.uses.map(u => (
          <span key={u} className={s.useChip}>{u}{canEdit ? <button type="button" className={s.x} style={{ fontSize: 13 }} title="Remove" onClick={() => upd(c.id, x => ({ uses: x.uses.filter(y => y !== u) }))}>×</button> : null}</span>
        ))}
        {canEdit ? (
          <span className={s.ddWrap}>
            <button type="button" className={s.useAdd} onClick={() => setOpen(open === useKey ? null : useKey)}>+ Add</button>
            {open === useKey ? (
              <>
                <div className={s.scrim} onClick={() => setOpen(null)} aria-hidden="true" />
                <div className={s.menu} role="menu" style={{ bottom: 28, top: 'auto' }}>
                  {uses.map(g => (
                    <div key={g.label} style={{ display: 'flex', flexDirection: 'column' }}>
                      <div className={s.menuGroup}>{g.label}</div>
                      {g.opts.map(o => {
                        const on = c.uses.includes(o)
                        return (
                          <button key={o} type="button" role="menuitemcheckbox" aria-checked={on} className={s.menuItem}
                            onClick={() => upd(c.id, x => ({ uses: on ? x.uses.filter(y => y !== o) : [...x.uses, o] }))}>
                            <span className={s.tick} data-on={on || undefined}>{on ? '✓' : ''}</span>{o}
                          </button>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </span>
        ) : null}
        <span className={s.fill} />
        {canEdit ? <button type="button" className={s.delBtn} onClick={remove} title={`Delete ${c.name || 'this card'} (${brandName(c.brandId)})`}><LeadIcon name="trash" size={13} />Delete</button> : null}
      </div>
    </div>
  )
}
