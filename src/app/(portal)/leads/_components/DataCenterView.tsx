'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { openDataFile, removeDataFile, saveDataFile } from '@/lib/leads/actions'
import { DATA_CATEGORIES, fileStatus, readable, type DataFile } from '@/lib/leads/agent'
import { whenFull } from '@/lib/leads/time'
import { LeadIcon } from '@/components/layout/lead-icons'
import s from './replies.module.css'

/**
 * Lead View › Data Center (2026-10-16 text cards; files and links since 2026-10-23, the redesign v2 handoff `Data
 * Center.dc.html` — mig 20261023200000): what the AI Agent reads, in a brand's folder or Shared, by category, with
 * dates, a version and on / paused. Files go straight from the browser to the private bucket `lead-data`
 * (files/<uuid>/<name>, a Lead View · Manage session may upload), then lead_save_data_file records them; a new upload on
 * a file is its next version. USED BY shows which agents read it (chosen on AI Agent › Sources). The old text cards are
 * General info's job now. Blank templates: CSV starters for the most useful tables.
 */

const TEMPLATES: ReadonlyArray<{ label: string; rows: string[][] }> = [
  { label: 'Product and price list', rows: [['Product', 'Category', 'Size / seats', 'Colours', 'Price (RM)', 'Promo price (RM)', 'Showroom', 'Notes'], ['L-shape sofa Oslo', 'Sofa', '3+2 seats, 280 cm', 'Sand, olive, charcoal', '2990', '2790', 'KL, PJ', 'Fabric is washable']] },
  { label: 'Fixed answers (FAQ)', rows: [['Customer asks', 'Answer', 'Valid until (YYYY-MM-DD)'], ['Can I pay by instalments?', 'Yes, 0% for 12 months with Maybank, CIMB and Public Bank cards.', '']] },
  { label: 'Promotion', rows: [['Promotion name', 'What it gives', 'Products', 'Start (YYYY-MM-DD)', 'End (YYYY-MM-DD)', 'Conditions'], ['Oct Sofa Week', 'Extra RM 200 off', 'All L-shape sofas', '2026-10-01', '2026-10-31', 'Not with other vouchers']] },
  { label: 'Showrooms and hours', rows: [['Showroom', 'Address', 'Opening hours', 'Phone', 'Waze / Google Maps link'], ['KL', 'Jalan Klang Lama', '10am–10pm daily', '03-0000 0000', '']] },
]
const ALL = '__all'
const SHARED = '__shared'
const ext = (f: Pick<DataFile, 'kind' | 'name'>) => (f.kind === 'link' ? 'URL' : (f.name.split('.').pop() ?? 'FILE').slice(0, 4).toUpperCase())
const size = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`)

export default function DataCenterView({ files, brands, today, ready, canManage }: {
  files: DataFile[]
  brands: Array<{ id: string; name: string }>
  today: string
  ready: boolean
  canManage: boolean
}) {
  const router = useRouter()
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
          <span className={s.pillTab} aria-pressed>Product data <span className={s.count}>{files.length}</span></span>
          <Link className={s.pillTab} href="/leads/info" title="Short facts CS and the agent use — on General info">Quick replies ↗</Link>
          <button type="button" className={s.btn} disabled title="Links are read when the agent answers; re-reading web pages comes later"><LeadIcon name="history" size={13} /> Sync all</button>
          {canManage ? (
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
      <div className={s.panel}>
        <div className={s.libSplit} style={{ gridTemplateColumns: '220px minmax(0, 1fr)' }}>
          <aside className={s.libSide} style={{ background: 'rgb(var(--lv-chat-head))' }}>
            <div className={s.libSideHead} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <span className={s.kicker} style={{ flex: 1 }}>CATEGORY</span>
              {canManage ? <button type="button" className={s.iconBtn} title="Add category" onClick={() => setCatIn('')}><LeadIcon name="plus" size={12} /></button> : null}
            </div>
            <div className={s.libRows}>
              {[ALL, ...cats].map(c => (
                <button key={c} type="button" className={s.libRow} aria-current={cat === c} onClick={() => setCat(c)}>
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
                    <span className={s.chipRow}>{f.usedBy.length ? f.usedBy.map(u => <span key={u.brandId} className={s.status} data-tone={u.paused ? 'none' : 'green'}>AI · {brandName(u.brandId)} · {u.paused ? 'paused' : 'in use'}</span>) : <span className={s.small}>Not used</span>}</span>
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
