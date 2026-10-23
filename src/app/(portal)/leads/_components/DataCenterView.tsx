'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { openDataFile, removeDataFile, saveDataFile, saveQuickReplies } from '@/lib/leads/actions'
import { cleanShortcut, type QuickReply } from '@/lib/leads/quick'
import type { LeadIconName } from '@/components/layout/lead-icons'
import { DATA_CATEGORIES, fileStatus, readable, type DataFile } from '@/lib/leads/agent'
import { whenFull } from '@/lib/leads/time'
import { LeadIcon } from '@/components/layout/lead-icons'
import s from './replies.module.css'

/**
 * Lead View › Data Center (2026-10-16 text cards; files and links since 2026-10-23, the redesign v2 handoff `Data
 * Center.dc.html` — mig 20261023200000): what the AI Agent reads, in a brand's folder or Shared, by category, with
 * dates, a version and on / paused. Files go straight from the browser to the private bucket `lead-data`
 * (files/<uuid>/<name>, a Lead View · Manage session may upload), then lead_save_data_file records them; a new upload on
 * a file is its next version. USED BY: the brand's agent reads its folder, every agent reads Shared (pausing a file is
 * here only, as drawn). The old text cards are General info's job now. Blank templates: CSV starters for the most useful
 * tables. The second tab is Quick replies (mig 20261023300000): shortcuts CS types in the Inbox (/instal), saved whole.
 */

const TEMPLATES: ReadonlyArray<{ label: string; rows: string[][] }> = [
  { label: 'Product and price list', rows: [['Product', 'Category', 'Size / seats', 'Colours', 'Price (RM)', 'Promo price (RM)', 'Showroom', 'Notes'], ['L-shape sofa Oslo', 'Sofa', '3+2 seats, 280 cm', 'Sand, olive, charcoal', '2990', '2790', 'KL, PJ', 'Fabric is washable']] },
  { label: 'Fixed answers (FAQ)', rows: [['Customer asks', 'Answer', 'Valid until (YYYY-MM-DD)'], ['Can I pay by instalments?', 'Yes, 0% for 12 months with Maybank, CIMB and Public Bank cards.', '']] },
  { label: 'Promotion', rows: [['Promotion name', 'What it gives', 'Products', 'Start (YYYY-MM-DD)', 'End (YYYY-MM-DD)', 'Conditions'], ['Oct Sofa Week', 'Extra RM 200 off', 'All L-shape sofas', '2026-10-01', '2026-10-31', 'Not with other vouchers']] },
  { label: 'Showrooms and hours', rows: [['Showroom', 'Address', 'Opening hours', 'Phone', 'Waze / Google Maps link'], ['KL', 'Jalan Klang Lama', '10am–10pm daily', '03-0000 0000', '']] },
]
const ALL = '__all'
/** The handoff's category glyphs; a category CS typed is a folder. */
const CAT_ICON: Record<string, LeadIconName> = {
  [ALL]: 'grid', 'Products & prices': 'tag', 'Product details': 'fileText', 'Photos & videos': 'image', Promotions: 'percent', Catalogues: 'bookOpen', 'After-sales': 'wrench',
}
const SHARED = '__shared'
const ext = (f: Pick<DataFile, 'kind' | 'name'>) => (f.kind === 'link' ? 'URL' : (f.name.split('.').pop() ?? 'FILE').slice(0, 4).toUpperCase())
const size = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`)

export default function DataCenterView({ files, quick, quickReady, brands, today, ready, canManage }: {
  files: DataFile[]
  quick: QuickReply[]
  /** Quick replies' table is there (mig 20261023300000). */
  quickReady: boolean
  brands: Array<{ id: string; name: string }>
  today: string
  ready: boolean
  canManage: boolean
}) {
  const router = useRouter()
  const [tab, setTab] = useState<'files' | 'quick'>('files')
  const [cat, setCat] = useState(ALL)
  const [extraCats, setExtraCats] = useState<string[]>([])
  const [catIn, setCatIn] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [brand, setBrand] = useState(ALL)
  const [status, setStatus] = useState(ALL)
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<Partial<DataFile> & { kind: 'file' | 'link' } | null>(null)
  const [pending, setPending] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [busy, start] = useTransition()
  const picker = useRef<HTMLInputElement>(null)
  const picker2 = useRef<HTMLInputElement>(null)
  const cats = useMemo(() => [...new Set([...DATA_CATEGORIES, ...files.map(f => f.category).filter(Boolean), ...extraCats])], [files, extraCats])
  const brandName = (id: string | null) => (id ? brands.find(b => b.id === id)?.name ?? '—' : 'Shared')
  const shown = files.filter(f => (cat === ALL || f.category === cat)
    && (brand === ALL || (brand === SHARED ? f.brandId === null : f.brandId === brand))
    && (status === ALL || fileStatus(f, today).label.startsWith(status) || (status === 'In use' && fileStatus(f, today).usable))
    && (!q.trim() || f.name.toLowerCase().includes(q.trim().toLowerCase())))

  const upload = async (file: File): Promise<{ path: string } | { error: string }> => {
    const id = crypto.randomUUID()
    const name = file.name.replace(/[^\w.\- ()]+/g, '_').slice(0, 120) || 'file'
    const path = `files/${id}/${name}`
    const { error: e } = await createClient().storage.from('lead-data').upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false })
    return e ? { error: 'The file could not be uploaded — 50 MB at most.' } : { path }
  }
  const saveEditing = () => {
    if (!editing) return
    setError('')
    start(async () => {
      let path: string | undefined
      if (pending) {
        const up = await upload(pending)
        if ('error' in up) { setError(up.error); return }
        path = up.path
      }
      const r = await saveDataFile(editing.id ?? null, {
        kind: editing.kind, name: editing.name ?? '', brandId: editing.brandId ?? null, category: editing.category ?? '', url: editing.url ?? null,
        validFrom: editing.validFrom || null, validUntil: editing.validUntil || null, status: editing.status ?? 'active',
        ...(path ? { path, mime: pending?.type ?? '', sizeBytes: pending?.size ?? 0 } : {}),
      })
      if (!r.ok) { setError(r.reason); return }
      setEditing(null); setPending(null)
      router.refresh()
    })
  }
  const remove = (f: DataFile) => {
    if (!window.confirm(`Delete “${f.name}”? Every agent stops reading it.`)) return
    start(async () => {
      const r = await removeDataFile(f.id)
      if (!r.ok) setError(r.reason)
      else router.refresh()
    })
  }
  const open = (f: DataFile) => {
    if (f.kind === 'link' && f.url) { window.open(f.url, '_blank', 'noopener'); return }
    if (!f.path) return
    const tab = window.open('', '_blank')
    start(async () => {
      const r = await openDataFile(f.path!)
      if (!r.ok) { tab?.close(); setError(r.reason); return }
      if (tab) tab.location.href = r.data
    })
  }
  const download = (t: (typeof TEMPLATES)[number]) => {
    const text = '﻿' + t.rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
    a.download = `${t.label}.csv`
    document.body.appendChild(a); a.click(); a.remove()
  }

  return (
    <div className={s.page}>
      <div className={s.head}>
        <div className={s.titles}>
          <span className={s.eyebrow}>SET UP</span>
          <h1 className={s.title}>Data Center</h1>
        </div>
        <span className={s.chipRow}>
          <span className={s.lineTabs} role="group" aria-label="Data Center">
            <button type="button" className={s.lineTab} aria-pressed={tab === 'files'} onClick={() => setTab('files')}>Product data <span className={s.count}>{files.length}</span></button>
            <button type="button" className={s.lineTab} aria-pressed={tab === 'quick'} onClick={() => setTab('quick')}>Quick replies <span className={s.count}>{quick.length}</span></button>
          </span>
          {tab === 'files' ? <button type="button" className={s.btn} disabled title="Links are read when the agent answers; re-reading web pages comes later"><LeadIcon name="history" size={13} /> Sync all</button> : null}
          {canManage && tab === 'files' ? (
            <span style={{ position: 'relative' }}>
              <button type="button" className={s.btn} data-dark="" disabled={!ready} onClick={() => setAddOpen(o => !o)}>+ Add ▾</button>
              {addOpen ? (
                <>
                  <div className={s.scrim} onClick={() => setAddOpen(false)} aria-hidden="true" />
                  <div className={s.menu} style={{ right: 0, top: 34 }} role="menu">
                    <button type="button" className={s.menuItem} onClick={() => { setAddOpen(false); picker.current?.click() }}><LeadIcon name="paperclip" size={13} />Upload a file</button>
                    <button type="button" className={s.menuItem} onClick={() => { setAddOpen(false); setPending(null); setEditing({ kind: 'link', name: '', url: 'https://', brandId: null, category: cat === ALL ? '' : cat, status: 'active' }) }}><LeadIcon name="navigation" size={13} />Add a web link</button>
                  </div>
                </>
              ) : null}
              <input ref={picker} type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.csv,.md,.xlsx,.xls,.docx,.doc,.pptx,.mp4,.mov"
                onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; setPending(f); setEditing({ kind: 'file', name: f.name, brandId: null, category: cat === ALL ? '' : cat, status: 'active' }) }} />
            </span>
          ) : null}
        </span>
      </div>
      {tab === 'quick' ? <QuickReplies quick={quick} brands={brands} ready={quickReady} canManage={canManage} /> : null}
      <div className={s.panel} style={tab === 'quick' ? { display: 'none' } : undefined}>
        <div className={s.libSplit} style={{ gridTemplateColumns: '220px minmax(0, 1fr)' }}>
          <aside className={s.libSide} style={{ background: 'rgb(var(--lv-chat-head))' }}>
            <div className={s.libSideHead} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <span className={s.kicker} style={{ flex: 1 }}>CATEGORY</span>
              {canManage ? <button type="button" className={s.iconBtn} title="Add category" onClick={() => setCatIn('')}><LeadIcon name="plus" size={12} /></button> : null}
            </div>
            <div className={s.libRows}>
              {[ALL, ...cats].map(c => (
                <button key={c} type="button" className={s.libRow} data-glyph="" aria-current={cat === c} onClick={() => setCat(c)}>
                  <span className={s.catGlyph}><LeadIcon name={CAT_ICON[c] ?? 'folder'} size={14} /></span>
                  <span className={s.listName}>{c === ALL ? 'All' : c}</span>
                  <span className={s.ver}>{c === ALL ? files.length : files.filter(f => f.category === c).length}</span>
                </button>
              ))}
              {catIn !== null ? (
                <input className={s.input} style={{ margin: 4 }} autoFocus value={catIn} maxLength={40} placeholder="Category name, press Enter" onChange={e => setCatIn(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && catIn.trim()) { setExtraCats(x => [...x, catIn.trim()]); setCat(catIn.trim()); setCatIn(null) } if (e.key === 'Escape') setCatIn(null) }}
                  onBlur={() => { if (!catIn.trim()) setCatIn(null) }} />
              ) : null}
            </div>
            <div style={{ padding: 12, borderTop: '1px solid rgb(var(--lv-hair))', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className={s.kicker}>BLANK TEMPLATES</span>
              {TEMPLATES.map(t => <button key={t.label} type="button" className={s.link} style={{ textAlign: 'left' }} onClick={() => download(t)}>{t.label} ↓</button>)}
            </div>
          </aside>
          <section className={s.libMain} style={{ padding: 0, gap: 0 }}>
            {!ready ? <div className={s.note} style={{ margin: 12 }}>Waiting for the database update — files can be uploaded once it is in.</div> : null}
            <div className={s.chipRow} style={{ padding: '10px 14px', borderBottom: '1px solid rgb(var(--lv-border))' }}>
              <input className={s.input} style={{ width: 220 }} value={q} onChange={e => setQ(e.target.value)} placeholder="Search files" aria-label="Search files" />
              <select className={s.select} value={brand} onChange={e => setBrand(e.target.value)} aria-label="Brand">
                <option value={ALL}>Brand: All</option>
                {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                <option value={SHARED}>Shared</option>
              </select>
              <select className={s.select} value={status} onChange={e => setStatus(e.target.value)} aria-label="Status">
                <option value={ALL}>Status: All</option>
                <option value="In use">In use</option>
                <option value="Ends">Ending soon</option>
                <option value="Expired">Expired</option>
                <option value="Paused">Paused</option>
              </select>
              <span className={s.fill} />
              <span className={s.small}>{shown.length} of {files.length} files</span>
            </div>
            {error ? <div className={s.error} role="alert" style={{ margin: '8px 14px' }}>{error}</div> : null}
            <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
              <div className={s.filesTitle}>{cat === ALL ? 'All files' : cat}</div>
              <div className={s.fileRow} style={{ fontWeight: 600, fontSize: 11, letterSpacing: '0.08em', color: 'rgb(var(--lv-text-2))' }}>
                <span /><span>FILE</span><span>BRAND</span><span>TYPE</span><span>UPDATED</span><span>VALID</span><span>USED BY</span><span />
              </div>
              {shown.map(f => {
                const st = fileStatus(f, today)
                return (
                  <div key={f.id} className={s.fileRow}>
                    <span className={s.ext}>{ext(f)}</span>
                    <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                      <button type="button" className={s.link} style={{ color: 'rgb(var(--lv-ink))', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis' }} onClick={() => open(f)} title="Open">{f.name}</button>
                      <span className={s.small}>{f.kind === 'link' ? f.url : `${size(f.sizeBytes)} · v${f.ver}`}{f.kind === 'file' && !readable(f) ? ' · the agent can’t read this type yet' : ''}</span>
                    </span>
                    <span><span className={s.ext} style={{ padding: '2px 6px' }}>{f.brandId ? brandName(f.brandId) : 'Shared'}</span></span>
                    <span className={s.small}>{f.category || '—'}</span>
                    <span className={s.small} style={{ display: 'flex', flexDirection: 'column' }}>{whenFull(f.updatedAt)}<span>{f.updatedByName}</span></span>
                    <span className={s.status} data-tone={st.tone}>{st.label}</span>
                    <span className={s.chipRow}>{(f.brandId ? [f.brandId] : brands.map(b => b.id)).map(id => <span key={id} className={s.status} data-tone={f.status === 'paused' ? 'none' : 'green'}>AI · {brandName(id)} · {f.status === 'paused' ? 'paused' : 'in use'}</span>)}</span>
                    <span style={{ display: 'flex', gap: 4 }}>
                      {canManage ? <button type="button" className={s.cardIcon} title="Edit" onClick={() => { setPending(null); setEditing(f) }}><LeadIcon name="filePen" size={11} /></button> : null}
                      {canManage ? <button type="button" className={s.cardIcon} title="Delete" onClick={() => remove(f)}><LeadIcon name="trash" size={11} /></button> : null}
                    </span>
                  </div>
                )
              })}
              {shown.length === 0 ? <div className={s.small} style={{ padding: 24 }}>{files.length ? 'No files match.' : 'Nothing here yet. Upload a catalogue, a price list or a policy — PDFs work best — or add a web page.'}</div> : null}
            </div>
          </section>
        </div>
      </div>

      {editing ? (
        <div className={s.modalScrim} onClick={e => { if (e.target === e.currentTarget && !busy) { setEditing(null); setPending(null) } }}>
          <div className={s.modal} role="dialog" aria-modal="true" aria-label={editing.id ? 'Edit file' : editing.kind === 'link' ? 'Add a web link' : 'Upload a file'}>
            <span className={s.agentTitle}>{editing.id ? 'Edit' : editing.kind === 'link' ? 'Add a web link' : 'Upload a file'}</span>
            <label className={s.field}>Name<input className={s.input} value={editing.name ?? ''} maxLength={160} onChange={e => setEditing({ ...editing, name: e.target.value })} /></label>
            {editing.kind === 'link' ? <label className={s.field}>Address<input className={s.input} value={editing.url ?? ''} maxLength={500} onChange={e => setEditing({ ...editing, url: e.target.value })} /></label> : null}
            {editing.kind === 'file' ? (
              <span className={s.small}>{pending ? `${pending.name} · ${size(pending.size)}${editing.id ? ` — saved as v${(editing.ver ?? 1) + 1}` : ''}` : editing.id ? `v${editing.ver}` : ''}
                {editing.id ? <> · <button type="button" className={s.link} onClick={() => picker2.current?.click()}>Upload a new version</button></> : null}
              </span>
            ) : null}
            <input ref={picker2} type="file" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setPending(f) }} />
            <span className={s.two2}>
              <label className={s.field}>Folder
                <select className={s.select} value={editing.brandId ?? SHARED} onChange={e => setEditing({ ...editing, brandId: e.target.value === SHARED ? null : e.target.value })}>
                  <option value={SHARED}>Shared (every brand)</option>
                  {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </label>
              <label className={s.field}>Category
                <select className={s.select} value={editing.category ?? ''} onChange={e => setEditing({ ...editing, category: e.target.value })}>
                  <option value="">—</option>
                  {cats.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className={s.field}>Valid from<input type="date" className={s.input} value={editing.validFrom ?? ''} onChange={e => setEditing({ ...editing, validFrom: e.target.value || null })} /></label>
              <label className={s.field}>Valid until<input type="date" className={s.input} value={editing.validUntil ?? ''} min={editing.validFrom ?? undefined} onChange={e => setEditing({ ...editing, validUntil: e.target.value || null })} /></label>
            </span>
            <span className={s.toggleLine}>
              <button type="button" role="switch" aria-checked={(editing.status ?? 'active') === 'active'} className={s.switch} onClick={() => setEditing({ ...editing, status: editing.status === 'paused' ? 'active' : 'paused' })} aria-label="In use" />
              {(editing.status ?? 'active') === 'active' ? 'In use — agents that read it may use it' : 'Paused — no agent reads it'}
            </span>
            {error ? <div className={s.error} role="alert">{error}</div> : null}
            <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className={s.btn} data-quiet="" disabled={busy} onClick={() => { setEditing(null); setPending(null) }}>Cancel</button>
              <button type="button" className={s.btn} data-strong="" disabled={busy || !ready || !(editing.name ?? '').trim() || (editing.kind === 'file' && !editing.id && !pending)} onClick={saveEditing}>{busy ? 'Saving…' : 'Save'}</button>
            </span>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/**
 * Quick replies (the handoff's second tab): SHORTCUT · BRAND · TEXT · USED, edited in place and saved as a whole.
 * Before mig 20261023300000 the list is empty and cannot be saved.
 */
function QuickReplies({ quick, brands, ready, canManage }: { quick: QuickReply[]; brands: Array<{ id: string; name: string }>; ready: boolean; canManage: boolean }) {
  const router = useRouter()
  const [rows, setRows] = useState(quick)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [busy, start] = useTransition()
  const dirty = JSON.stringify(rows) !== JSON.stringify(quick)
  const dis = !canManage || busy
  const set = (i: number, o: Partial<QuickReply>) => { setRows(r => r.map((x, j) => (j === i ? { ...x, ...o } : x))); setNote(''); setError('') }
  const save = () => start(async () => {
    const r = await saveQuickReplies(rows.map(x => ({ id: x.id, brandId: x.brandId, shortcut: x.shortcut, body: x.body })))
    if (!r.ok) { setError(r.reason); return }
    setNote('Saved · just now')
    router.refresh()
  })
  return (
    <div className={s.quickPage}>
      <span className={s.small} style={{ fontSize: 14 }}>CS types the shortcut in the Inbox reply box, for example <b>/instal</b>, to insert the text. The AI Agent can use them as fixed answers too.</span>
      {!ready ? <div className={s.note}>Waiting for the database update — quick replies can be saved once it is in.</div> : null}
      {error ? <div className={s.error} role="alert">{error}</div> : null}
      <div className={s.box} style={{ maxWidth: 1000 }}>
        <div className={s.quickRow} data-head="">
          <span>SHORTCUT</span><span>BRAND</span><span>TEXT</span><span style={{ textAlign: 'right' }}>USED</span><span />
        </div>
        {rows.map((x, i) => (
          <div key={x.id} className={s.quickRow}>
            <input className={s.input} value={x.shortcut} disabled={dis} maxLength={31} aria-label="Shortcut" onChange={e => set(i, { shortcut: cleanShortcut(e.target.value) })} />
            <select className={s.select} value={x.brandId ?? ''} disabled={dis} aria-label="Brand" onChange={e => set(i, { brandId: e.target.value || null })}>
              <option value="">All brands</option>
              {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <textarea className={s.faqIn} rows={2} value={x.body} disabled={dis} maxLength={1000} aria-label="Text" onChange={e => set(i, { body: e.target.value })} />
            <span className={s.small} style={{ textAlign: 'right', paddingTop: 7 }}>{x.used}×</span>
            {canManage ? <button type="button" className={s.x} title="Remove" disabled={busy} onClick={() => setRows(r => r.filter((_, j) => j !== i))}>×</button> : <span />}
          </div>
        ))}
        {rows.length === 0 ? <div className={s.quickRow}><span className={s.small} style={{ gridColumn: '1 / -1' }}>No quick replies yet.</span></div> : null}
        {canManage ? (
          <div style={{ padding: '9px 14px' }}>
            <button type="button" className={s.link} disabled={busy || !ready} onClick={() => setRows(r => [...r, { id: `new-${Date.now().toString(36)}`, brandId: null, shortcut: '/', body: '', used: 0 }])}>+ Add quick reply</button>
          </div>
        ) : null}
      </div>
      {canManage ? (
        <div className={s.quickFoot}>
          <span className={s.hint} data-dirty={dirty || undefined}>{dirty ? 'Unsaved changes' : note || 'No changes yet'}</span>
          <span className={s.fill} />
          <button type="button" className={s.btn} data-quiet="" disabled={!dirty || busy} onClick={() => setRows(quick)}>Discard</button>
          <button type="button" className={s.btn} data-strong="" disabled={!dirty || busy || !ready} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      ) : null}
    </div>
  )
}
