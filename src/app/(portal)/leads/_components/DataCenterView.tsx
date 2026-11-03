'use client'

import { useEffect, useMemo, useRef, useState, useTransition, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { checkLink, openDataFile, removeDataFile, removeDataFolder, saveDataFile, saveDataFolder, saveQuickReplies, setDataFileUntil } from '@/lib/leads/actions'
import { cleanShortcut, quickProblem, type QuickReply } from '@/lib/leads/quick'
import type { DataFile } from '@/lib/leads/agent'
import {
  CHECK_EVERY, FOLDER_COLORS, checkedLabel, dayMon, dcState, dcTree, extOf, freeName, hostOf, isBrandPlace, placeOf,
  type CheckEvery, type DataFolder, type FolderColor, type Place,
} from '@/lib/leads/data-center'
import { LeadIcon } from '@/components/layout/lead-icons'
import ContextMenu from './ui/ContextMenu'
import Modal from './ui/Modal'
import d from './data-center.module.css'

/**
 * Lead View v2 › Data Center (2026-11-02, the v2 handoff §7.10 — mig 20261102140000). Three tabs:
 * - **Files**: the tree (Data center › each brand's own folder and Shared › their folders), the folder's folders and
 *   files, the picked one's detail (the LINK FOR AI AGENT that AI Agent › Knowledge takes, USED BY, VERSIONS, Replace
 *   file). Right-click: the six colours (a folder), Open, Rename, Move to ›, Copy link, Replace file, Delete. Upload asks
 *   for a folder. Files go from the browser to the private R2 bucket `lead-data` (files/<uuid>/<name>), then
 *   lead_save_data_file keeps them; a replaced file is its next version.
 * - **Web links**: by brand (or Shared), checked for changes every hour · day · week; Check now reads the page.
 * - **Shortcuts**: the Inbox's quick replies (`/instal`), saved as you type once the list is whole.
 * A brand's own folder and Shared are the brands themselves: they cannot be renamed, coloured, moved or deleted.
 * Kept though not drawn (the user's point 2): a file opens from its preview; its end date is set on its Valid row;
 * the blank CSV templates sit at the tab bar's right.
 */

const TEMPLATES: ReadonlyArray<{ label: string; rows: string[][] }> = [
  { label: 'Product and price list', rows: [['Product', 'Category', 'Size / seats', 'Colours', 'Price (RM)', 'Promo price (RM)', 'Showroom', 'Notes'], ['L-shape sofa Oslo', 'Sofa', '3+2 seats, 280 cm', 'Sand, olive, charcoal', '2990', '2790', 'KL, PJ', 'Fabric is washable']] },
  { label: 'Fixed answers (FAQ)', rows: [['Customer asks', 'Answer', 'Valid until (YYYY-MM-DD)'], ['Can I pay by instalments?', 'Yes, 0% for 12 months with Maybank, CIMB and Public Bank cards.', '']] },
  { label: 'Promotion', rows: [['Promotion name', 'What it gives', 'Products', 'Start (YYYY-MM-DD)', 'End (YYYY-MM-DD)', 'Conditions'], ['Oct Sofa Week', 'Extra RM 200 off', 'All L-shape sofas', '2026-10-01', '2026-10-31', 'Not with other vouchers']] },
  { label: 'Showrooms and hours', rows: [['Showroom', 'Address', 'Opening hours', 'Phone', 'Waze / Google Maps link'], ['KL', 'Jalan Klang Lama', '10am–10pm daily', '03-0000 0000', '']] },
]
type Tab = 'files' | 'links' | 'short'
type Ctx = { key: string; x: number; y: number; mode: 'main' | 'move' | 'del' }
const SHARED = 'shared'

export default function DataCenterView({ files: allFiles, folders, foldersReady, quick, quickReady, brands, today, ready, canManage }: {
  files: DataFile[]
  folders: DataFolder[]
  /** lead_data_folders is there (mig 20261102140000): folders, links' checks, versions. */
  foldersReady: boolean
  quick: QuickReply[]
  quickReady: boolean
  brands: Array<{ id: string; name: string }>
  today: string
  ready: boolean
  canManage: boolean
}) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('files')
  const [error, setError] = useState('')
  const [busy, start] = useTransition()
  const files = useMemo(() => allFiles.filter(f => f.kind === 'file'), [allFiles])
  const links = useMemo(() => allFiles.filter(f => f.kind === 'link'), [allFiles])
  const t = useMemo(() => dcTree(brands, folders, allFiles), [brands, folders, allFiles])
  const can = canManage && ready && foldersReady
  const brandName = (id: string | null) => (id ? brands.find(b => b.id === id)?.name ?? '—' : 'Shared')
  const [copied, setCopied] = useState<string | null>(null)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text).catch(() => undefined)
    setCopied(text)
    if (copyTimer.current) clearTimeout(copyTimer.current)
    copyTimer.current = setTimeout(() => setCopied(null), 1500)
  }
  const run = (fn: () => Promise<{ ok: true } | { ok: false; reason: string }>, after?: () => void) => start(async () => {
    setError('')
    const r = await fn()
    if (!r.ok) { setError(r.reason); return }
    after?.()
    router.refresh()
  })
  const upload = async (file: File): Promise<{ path: string } | { error: string }> => {
    const name = file.name.replace(/[^\w.\- ()]+/g, '_').slice(0, 120) || 'file'
    const path = `files/${crypto.randomUUID()}/${name}`
    const { error: e } = await createClient().storage.from('lead-data').upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false })
    return e ? { error: 'The file could not be uploaded — 50 MB at most.' } : { path }
  }
  /** Everything lead_save_data_file takes, from a file as it stands and the change. */
  const fileData = (f: DataFile, over: Partial<DataFile> & { mime?: string; sizeBytes?: number; path?: string | null } = {}) => ({
    kind: f.kind, name: f.name, brandId: f.brandId, folderId: f.folderId ?? null, category: f.category ?? '', url: f.url, checkEvery: f.checkEvery ?? 'day',
    validFrom: f.validFrom, validUntil: f.validUntil, status: f.status, ...over,
  })
  const download = (tp: (typeof TEMPLATES)[number]) => {
    const text = '﻿' + tp.rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
    a.download = `${tp.label}.csv`
    document.body.appendChild(a); a.click(); a.remove()
  }
  const [tplOpen, setTplOpen] = useState<{ x: number; y: number } | null>(null)

  // ── Files ──
  const [cur, setCur] = useState<Place | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [shut, setShut] = useState<Record<string, boolean>>({})
  const [rootShut, setRootShut] = useState(false)
  const [q, setQ] = useState('')
  const [ren, setRen] = useState<{ key: string; value: string } | null>(null)
  const [ctx, setCtx] = useState<Ctx | null>(null)
  const [asking, setAsking] = useState<string | null>(null)
  const [up, setUp] = useState<{ place: Place | null; file: File | null } | null>(null)
  const [untilOpen, setUntilOpen] = useState(false)
  const replacer = useRef<HTMLInputElement>(null)
  const replaceFor = useRef<string | null>(null)
  const curOk = cur && t.get(cur) ? cur : null
  const open = (p: Place) => {
    setShut(x => { const n = { ...x }; for (const c of t.chain(p)) delete n[c.place]; return n })
    setCur(p); setSel(`F:${p}`); setQ('')
  }
  const ql = q.trim().toLowerCase()
  const scope = curOk ? new Set(t.desc(curOk)) : null
  const subs = ql ? [...t.nodes.values()].filter(n => n.folder && (!scope || (scope.has(n.place) && n.place !== curOk)) && n.name.toLowerCase().includes(ql)) : curOk ? t.kids(curOk) : t.roots
  const shownFiles = ql ? files.filter(f => (!scope || scope.has(placeOf(f))) && f.name.toLowerCase().includes(ql)) : curOk ? t.filesIn(curOk) : []
  const selKey = sel ?? (curOk ? `F:${curOk}` : null)
  const selPlace = selKey?.startsWith('F:') && t.get(selKey.slice(2)) ? selKey.slice(2) : null
  const selFile = selKey && !selKey.startsWith('F:') ? files.find(f => f.id === selKey) ?? null : null
  const ctxAt = (e: ReactMouseEvent, key: string) => {
    e.preventDefault(); e.stopPropagation()
    setSel(key)
    if (canManage) setCtx({ key, x: e.clientX, y: e.clientY, mode: 'main' })
  }
  const delQ = (key: string) => {
    if (!key.startsWith('F:')) return 'Delete this file?'
    const n = t.count(key.slice(2))
    return n ? `Delete folder and ${n} ${n === 1 ? 'file' : 'files'}?` : 'Delete this folder?'
  }
  const delKey = (key: string) => {
    setCtx(null); setAsking(null)
    if (key.startsWith('F:')) {
      const p = key.slice(2), node = t.get(p)
      run(() => removeDataFolder(p), () => { if (curOk && t.desc(p).includes(curOk)) setCur(node?.parent ?? null); setSel(null) })
    } else run(() => removeDataFile(key), () => setSel(null))
  }
  const saveRen = () => {
    if (!ren) return
    const v = ren.value.trim(), key = ren.key
    setRen(null)
    if (!v) return
    if (key.startsWith('F:')) {
      const fd = t.get(key.slice(2))?.folder
      if (fd && v !== fd.name) run(() => saveDataFolder(fd.id, { brandId: fd.brandId, parentId: fd.parentId, name: v, color: fd.color }))
    } else {
      const f = files.find(x => x.id === key)
      if (f && v !== f.name) run(() => saveDataFile(f.id, fileData(f, { name: v })))
    }
  }
  const newFolder = () => {
    if (!curOk) { setError('Open a brand’s folder or Shared first — a folder lives in one.'); return }
    const node = t.get(curOk)!
    const name = freeName(t.kids(curOk).map(k => k.name))
    start(async () => {
      setError('')
      const r = await saveDataFolder(null, { brandId: node.brandId, parentId: isBrandPlace(curOk) ? null : curOk, name, color: null })
      if (!r.ok) { setError(r.reason); return }
      setSel(`F:${r.data}`); setRen({ key: `F:${r.data}`, value: name })
      router.refresh()
    })
  }
  const moveTo = (key: string, to: Place) => {
    setCtx(null)
    const node = t.get(to)
    if (!node) return
    const parentId = isBrandPlace(to) ? null : to
    if (key.startsWith('F:')) {
      const fd = t.get(key.slice(2))?.folder
      if (fd) run(() => saveDataFolder(fd.id, { brandId: node.brandId, parentId, name: fd.name, color: fd.color }))
    } else {
      const f = files.find(x => x.id === key)
      if (f) run(() => saveDataFile(f.id, fileData(f, { folderId: parentId, brandId: node.brandId })))
    }
  }
  const setColor = (fd: DataFolder, color: FolderColor | null) => { setCtx(null); run(() => saveDataFolder(fd.id, { brandId: fd.brandId, parentId: fd.parentId, name: fd.name, color })) }
  const replaceFile = (id: string) => { replaceFor.current = id; replacer.current?.click() }
  const onReplace = (file: File | undefined) => {
    const f = files.find(x => x.id === replaceFor.current)
    if (!file || !f) return
    start(async () => {
      setError('')
      const u = await upload(file)
      if ('error' in u) { setError(u.error); return }
      const r = await saveDataFile(f.id, fileData(f, { path: u.path, mime: file.type, sizeBytes: file.size }))
      if (!r.ok) { setError(r.reason); return }
      router.refresh()
    })
  }
  const openFile = (f: DataFile) => {
    if (!f.path) return
    const w = window.open('', '_blank')
    start(async () => {
      const r = await openDataFile(f.path!)
      if (!r.ok) { w?.close(); setError(r.reason); return }
      if (w) w.location.href = r.data
    })
  }
  const doUpload = () => {
    if (!up?.place || !up.file) return
    const node = t.get(up.place)
    const file = up.file
    if (!node) return
    start(async () => {
      setError('')
      const u = await upload(file)
      if ('error' in u) { setError(u.error); return }
      const r = await saveDataFile(null, { kind: 'file', name: file.name, brandId: node.brandId, folderId: isBrandPlace(up.place) ? null : up.place, category: '', path: u.path, mime: file.type, sizeBytes: file.size, status: 'active' })
      if (!r.ok) { setError(r.reason); return }
      setUp(null); setCur(up.place); setSel(r.data)
      router.refresh()
    })
  }
  const usedBy = (f: DataFile) => [...new Set((f.usedBy ?? []).map(u => brandName(u.brandId)))].map(n => `AI Agent · ${n}`)
  const flat: Array<{ place: Place; name: string; depth: number }> = []
  const walkAll = (p: Place | null, depth: number) => { for (const k of t.kids(p)) { flat.push({ place: k.place, name: k.name, depth }); walkAll(k.place, depth + 1) } }
  walkAll(null, 0)

  // ── Web links and Shortcuts ──
  const [br, setBr] = useState<string>('all')
  const [lq, setLq] = useState('')
  const [lSel, setLSel] = useState<string | null>(null)
  const [sSel, setSSel] = useState<string | null>(null)
  const [lAsk, setLAsk] = useState<string | null>(null)
  const [lCtx, setLCtx] = useState<{ id: string; x: number; y: number } | null>(null)
  const [newLink, setNewLink] = useState<{ url: string; brand: string; every: CheckEvery } | null>(null)
  const BR: Array<[string, string]> = [...brands.map(b => [b.id, b.name] as [string, string]), [SHARED, 'Shared']]
  const brandOf = (id: string | null) => id ?? SHARED
  const lql = lq.trim().toLowerCase()

  const linkQ = (f: DataFile) => !lql || (f.url ?? '').toLowerCase().includes(lql)
  const visLinks = links.filter(f => linkQ(f) && (br === 'all' || brandOf(f.brandId) === br))
  const curLink = visLinks.find(f => f.id === lSel) ?? visLinks[0] ?? null
  const saveLink = (f: DataFile, over: Partial<DataFile>) => run(() => saveDataFile(f.id, fileData(f, over)))
  const addLink = () => {
    if (!newLink) return
    const url = newLink.url.trim()
    start(async () => {
      setError('')
      const r = await saveDataFile(null, { kind: 'link', name: hostOf(url).slice(0, 160), url, brandId: newLink.brand === SHARED ? null : newLink.brand, checkEvery: newLink.every, category: '', status: 'active' })
      if (!r.ok) { setError(r.reason); return }
      setNewLink(null); setLSel(r.data)
      const c = await checkLink(r.data)
      if (c.ok && c.data.error) setError(`Added — but the page could not be read: ${c.data.error}`)
      router.refresh()
    })
  }
  const checkNow = (f: DataFile) => start(async () => {
    setError('')
    const r = await checkLink(f.id)
    if (!r.ok) setError(r.reason)
    else if (r.data.error) setError(r.data.error)
    router.refresh()
  })
  const newLinkOk = !!newLink && /^https:\/\/\S+\.\S+/.test(newLink.url.trim()) && !!newLink.brand

  // Shortcuts: the list as it stands, saved whole once it is whole.
  const [rows, setRows] = useState<QuickReply[]>(quick)
  const dirty = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => { if (!dirty.current) setRows(quick) }, [quick])
  const [skNote, setSkNote] = useState('')
  const editRows = (fn: (xs: QuickReply[]) => QuickReply[]) => {
    const next = fn(rows)
    setRows(next)
    dirty.current = true
    if (saveTimer.current) clearTimeout(saveTimer.current)
    const send = next.map(r => ({ id: r.id.startsWith('new-') ? '' : r.id, brandId: r.brandId, shortcut: r.shortcut, body: r.body }))
    const problem = quickProblem(send)
    setSkNote(problem ? `Not saved yet — ${problem.charAt(0).toLowerCase()}${problem.slice(1)}` : '')
    if (problem) return
    saveTimer.current = setTimeout(() => {
      start(async () => {
        const r = await saveQuickReplies(send)
        if (!r.ok) { setSkNote(r.reason); return }
        dirty.current = false
        router.refresh()
      })
    }, 700)
  }
  const skQ = (r: QuickReply) => !lql || `${r.shortcut} ${r.body}`.toLowerCase().includes(lql)
  const visShort = rows.filter(r => skQ(r) && (br === 'all' || brandOf(r.brandId) === br))
  const curShort = visShort.find(r => r.id === sSel) ?? visShort.find(r => `${r.shortcut}|${r.brandId}` === sSel) ?? visShort[0] ?? null
  const dup = curShort ? rows.some(r => r !== curShort && r.shortcut === curShort.shortcut && r.shortcut !== '/' && r.brandId === curShort.brandId) : false
  const canShort = canManage && quickReady
  const lList: Array<DataFile | QuickReply> = tab === 'links' ? links : rows
  const lInQ = (x: DataFile | QuickReply) => ('kind' in x ? linkQ(x) : skQ(x))

  const brandsCol = (
    <div className={d.brands}>
      <span className={d.brandsKicker}>BRAND</span>
      {[['all', 'All'] as [string, string], ...BR].map(([k, l]) => (
        <button key={k} type="button" className={d.brandBtn} aria-pressed={br === k} onClick={() => setBr(k)}>
          <LeadIcon name="store" size={16} /><span className={d.brandL}>{l}</span>
          <span className={d.brandN}>{lList.filter(x => lInQ(x) && (k === 'all' || brandOf(x.brandId) === k)).length}</span>
        </button>
      ))}
    </div>
  )

  const ctxNode = ctx?.key.startsWith('F:') ? t.get(ctx.key.slice(2)) ?? null : null
  const ctxFile = ctx && !ctx.key.startsWith('F:') ? files.find(f => f.id === ctx.key) ?? null : null
  const banned = ctxNode ? new Set(t.desc(ctxNode.place)) : new Set<string>()
  const lCtxItem = lCtx ? (tab === 'links' ? links.find(f => f.id === lCtx.id) : rows.find(r => r.id === lCtx.id)) ?? null : null

  return (
    <div className={d.wrap}>
      <section className={d.card}>
        <div className={d.tabs} role="tablist" aria-label="Data Center">
          {([['files', 'Files', files.length], ['links', 'Web links', links.length], ['short', 'Shortcuts', rows.length]] as const).map(([k, l, n]) => (
            <button key={k} type="button" role="tab" className={d.tab} aria-selected={tab === k} onClick={() => { setTab(k); setError('') }}>{l}<span className={d.tabN}>{n}</span></button>
          ))}
          <div className={d.tabsGap} />
          <button type="button" className={d.ghost} onClick={e => setTplOpen({ x: e.clientX - 200, y: e.clientY + 14 })}><LeadIcon name="download" size={14} /> Blank templates</button>
        </div>
        {error ? <span className={d.error} role="alert">{error}</span> : null}

        {tab === 'files' ? (
          <div className={d.cols}>
            <div className={d.tree} role="tree" aria-label="Folders">
              <div className={d.node} data-root="" role="treeitem" aria-selected={curOk === null} aria-current={curOk === null} aria-expanded={!rootShut} onClick={() => { setCur(null); setSel(null); setQ('') }} onContextMenu={e => e.preventDefault()}>
                <button type="button" className={d.chev} aria-expanded={!rootShut} aria-label="Fold" onClick={e => { e.stopPropagation(); setRootShut(x => !x) }}><LeadIcon name="chevron-right" size={13} /></button>
                <LeadIcon name="hard-drive" size={16} className={d.fIcon} />
                <span className={d.nodeName}>Data center</span><span className={d.nodeN}>{files.length}</span>
              </div>
              {!rootShut ? (() => {
                const out: ReactNode[] = []
                const walk = (p: Place | null, depth: number) => {
                  for (const n of t.kids(p)) {
                    const has = t.kids(n.place).length > 0, isO = !shut[n.place], on = curOk === n.place
                    out.push(
                      <div key={n.place} className={d.node} role="treeitem" aria-selected={on} aria-current={on} style={{ paddingLeft: 8 + depth * 16 }}
                        onClick={() => open(n.place)} onContextMenu={e => (n.folder ? ctxAt(e, `F:${n.place}`) : e.preventDefault())}>
                        <button type="button" className={d.chev} data-off={has ? undefined : ''} aria-expanded={isO} aria-label="Fold"
                          onClick={e => { e.stopPropagation(); if (has) setShut(x => ({ ...x, [n.place]: isO })) }}><LeadIcon name="chevron-right" size={13} /></button>
                        <LeadIcon name={on ? 'folder-open' : 'folder'} size={16} className={d.fIcon} data-c={n.color ?? undefined} />
                        <span className={d.nodeName}>{n.name}</span><span className={d.nodeN}>{t.count(n.place)}</span>
                      </div>,
                    )
                    if (has && isO) walk(n.place, depth + 1)
                  }
                }
                walk(null, 1)
                return out
              })() : null}
            </div>

            <div className={d.mid}>
              <div className={d.midHead}>
                <div className={d.midBar}>
                  <div className={d.search}>
                    <LeadIcon name="search" size={15} />
                    <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search in this folder" aria-label="Search in this folder" />
                  </div>
                  {canManage ? (
                    <>
                      <button type="button" className={d.sq} title={curOk ? 'New folder' : 'Open a brand’s folder or Shared to add a folder'} aria-label="New folder" disabled={!can || busy || !curOk} onClick={newFolder}><LeadIcon name="folder-plus" size={16} /></button>
                      <button type="button" className={d.sqRust} title="Upload" aria-label="Upload" disabled={!ready} onClick={() => setUp({ place: curOk, file: null })}><LeadIcon name="upload" size={16} /></button>
                    </>
                  ) : null}
                </div>
                <div className={d.crumbs}>
                  {[{ l: 'Data center', p: null as Place | null }, ...(curOk ? t.chain(curOk).map(c => ({ l: c.name, p: c.place as Place | null })) : [])].map((c, i, arr) => (
                    <span key={c.p ?? 'root'} style={{ display: 'contents' }}>
                      {i > 0 ? <span className={d.crumbSep}><LeadIcon name="chevron-right" size={13} /></span> : null}
                      <button type="button" className={d.crumb} aria-current={i === arr.length - 1} onClick={() => (c.p ? open(c.p) : (setCur(null), setSel(null)))}>{c.l}</button>
                    </span>
                  ))}
                </div>
              </div>
              <div className={d.list} role="listbox" aria-label="Folders and files">
                {subs.map(n => {
                  const key = `F:${n.place}`, nk = t.kids(n.place).length, nf = t.filesIn(n.place).length
                  return (
                    <div key={key} className={d.row} role="option" aria-selected={selKey === key} onClick={() => open(n.place)} onDoubleClick={() => open(n.place)}
                      onContextMenu={e => (n.folder ? ctxAt(e, key) : e.preventDefault())}>
                      <span className={d.tile} data-c={n.color ?? undefined}><LeadIcon name="folder" size={17} /></span>
                      <div className={d.rowText}>
                        {ren?.key === key ? (
                          <input className={d.ren} value={ren.value} autoFocus aria-label="Folder name" maxLength={80} onClick={e => e.stopPropagation()}
                            onChange={e => setRen({ key, value: e.target.value })} onBlur={saveRen}
                            onKeyDown={e => { if (e.key === 'Enter') saveRen(); if (e.key === 'Escape') setRen(null) }} />
                        ) : <span className={d.rowName}>{n.name}</span>}
                        <span className={d.rowSub}>{ql ? t.pathOf(n.parent) || 'Data center' : [nk ? `${nk} ${nk === 1 ? 'folder' : 'folders'}` : '', `${nf} ${nf === 1 ? 'file' : 'files'}`].filter(Boolean).join(' · ')}</span>
                      </div>
                      <span className={d.go}><LeadIcon name="chevron-right" size={15} /></span>
                    </div>
                  )
                })}
                {shownFiles.map(f => {
                  const st = dcState(f, today), x = extOf(f.name, f.mime)
                  return (
                    <div key={f.id} className={d.row} role="option" aria-selected={selKey === f.id} onClick={() => setSel(f.id)} onDoubleClick={() => setSel(f.id)} onContextMenu={e => ctxAt(e, f.id)}>
                      <span className={d.tile} data-c={x.tone === 'plain' ? undefined : x.tone}>{x.ext}</span>
                      <div className={d.rowText}>
                        {ren?.key === f.id ? (
                          <input className={d.ren} value={ren.value} autoFocus aria-label="File name" maxLength={160} onClick={e => e.stopPropagation()}
                            onChange={e => setRen({ key: f.id, value: e.target.value })} onBlur={saveRen}
                            onKeyDown={e => { if (e.key === 'Enter') saveRen(); if (e.key === 'Escape') setRen(null) }} />
                        ) : <span className={d.rowName}>{f.name}</span>}
                        <span className={d.rowSub}>{ql ? `${t.pathOf(placeOf(f))} · ` : ''}Updated {dayMon(f.updatedAt)} · v{f.ver}</span>
                      </div>
                      <span className={d.st} data-t={st.tone}>{st.label}</span>
                      <span className={d.go} data-off=""><LeadIcon name="chevron-right" size={15} /></span>
                    </div>
                  )
                })}
                {!subs.length && !shownFiles.length ? <div className={d.empty}>{ready ? 'Empty folder' : 'Waiting for the database update'}</div> : null}
              </div>
            </div>

            <div className={d.side}>
              {selPlace ? (() => {
                const n = t.get(selPlace)!, link = t.linkOf(selPlace), key = `F:${selPlace}`
                return (
                  <div className={d.detail}>
                    <div className={d.dHead}>
                      <span className={d.dName}>{n.name}</span>
                      {n.folder && canManage ? <button type="button" className={d.trash} title="Delete" aria-label="Delete" onClick={() => setAsking(key)}><LeadIcon name="trash-2" size={15} /></button> : null}
                    </div>
                    {asking === key ? <div className={d.ask}><span>{delQ(key)}</span><button type="button" className={d.askNo} onClick={() => setAsking(null)}>Cancel</button><button type="button" className={d.askYes} onClick={() => delKey(key)}>Delete</button></div> : null}
                    <div className={d.big} data-c={n.color ?? undefined}><LeadIcon name="folder" size={28} /><span className={d.bigL}>{t.count(selPlace)} FILES</span></div>
                    <div className={d.sect}>
                      <span className={d.kicker}>LINK FOR AI AGENT</span>
                      <div className={d.linkBox}><LeadIcon name="link" size={14} /><span className={d.linkText}>{link}</span><button type="button" className={d.copy} onClick={() => copy(link)}>{copied === link ? 'Copied' : 'Copy'}</button></div>
                    </div>
                    <div className={d.kv}>
                      <div className={d.kvRow}><span>Location</span><span>{t.pathOf(n.parent) || 'Data center'}</span></div>
                      <div className={d.kvRow}><span>Folders</span><span>{t.kids(selPlace).length}</span></div>
                      <div className={d.kvRow}><span>Files</span><span>{t.count(selPlace)}</span></div>
                    </div>
                  </div>
                )
              })() : selFile ? (() => {
                const f = selFile, st = dcState(f, today), x = extOf(f.name, f.mime), link = t.linkOf(placeOf(f), f.name), used = usedBy(f)
                const vers = f.versions?.length ? f.versions : [{ ver: f.ver, at: f.updatedAt, byName: f.updatedByName, sizeBytes: f.sizeBytes }]
                return (
                  <div className={d.detail}>
                    <div className={d.dHead}>
                      <span className={d.dName}>{f.name}</span>
                      <button type="button" className={d.pill} data-t={st.tone} title={st.expired ? 'Expired' : 'Pause / resume'} disabled={!canManage || st.expired || busy}
                        onClick={() => run(() => saveDataFile(f.id, fileData(f, { status: f.status === 'paused' ? 'active' : 'paused' })))}>{st.label}</button>
                      {canManage ? <button type="button" className={d.trash} title="Delete" aria-label="Delete" onClick={() => setAsking(f.id)}><LeadIcon name="trash-2" size={15} /></button> : null}
                    </div>
                    {asking === f.id ? <div className={d.ask}><span>{delQ(f.id)}</span><button type="button" className={d.askNo} onClick={() => setAsking(null)}>Cancel</button><button type="button" className={d.askYes} onClick={() => delKey(f.id)}>Delete</button></div> : null}
                    <button type="button" className={d.big} data-c={x.tone === 'plain' ? undefined : x.tone} title="Open the file" onClick={() => openFile(f)}>
                      <LeadIcon name="file-text" size={28} /><span className={d.bigL}>{x.ext} · v{f.ver}</span>
                    </button>
                    <div className={d.sect}>
                      <span className={d.kicker}>LINK FOR AI AGENT</span>
                      <div className={d.linkBox}><LeadIcon name="link" size={14} /><span className={d.linkText}>{link}</span><button type="button" className={d.copy} onClick={() => copy(link)}>{copied === link ? 'Copied' : 'Copy'}</button></div>
                    </div>
                    <div className={d.kv}>
                      <div className={d.kvRow}><span>Location</span><span>{t.pathOf(placeOf(f))}</span></div>
                      <div className={d.kvRow}>
                        <span>Valid</span>
                        {untilOpen && canManage ? (
                          <input type="date" className={d.untilIn} autoFocus aria-label="Valid until" defaultValue={f.validUntil ?? ''} min={f.validFrom ?? undefined}
                            onBlur={e => { setUntilOpen(false); const v = e.target.value || null; if (v !== f.validUntil) run(() => setDataFileUntil(f.id, v)) }}
                            onKeyDown={e => { if (e.key === 'Escape') setUntilOpen(false); if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
                        ) : (
                          <button type="button" className={d.until} disabled={!canManage || !foldersReady} title={canManage ? 'Set the end date' : undefined} onClick={() => setUntilOpen(true)}>
                            {f.validUntil ? `Until ${dayMon(f.validUntil)}` : 'No end date'}
                          </button>
                        )}
                      </div>
                      <div className={d.kvRow}><span>Uploaded by</span><span>{vers[vers.length - 1]?.byName || f.updatedByName || '—'}</span></div>
                    </div>
                    <div className={d.sect}>
                      <span className={d.kicker}>USED BY</span>
                      <div className={d.used}>{used.map(u => <span key={u} className={d.usedChip}>{u}</span>)}{!used.length ? <span className={d.none}>Not used</span> : null}</div>
                    </div>
                    <div className={d.sect2}>
                      <div className={d.verHead}>
                        <span className={d.verKicker}>VERSIONS</span>
                        {canManage ? <button type="button" className={d.replace} disabled={!ready || busy} onClick={() => replaceFile(f.id)}><LeadIcon name="refresh-cw" size={12} />Replace file</button> : null}
                      </div>
                      {vers.map((v, i) => (
                        <div key={v.ver} className={d.ver}>
                          <span className={d.verN} data-cur={i === 0 || undefined}>v{v.ver}</span>
                          <span className={d.verD}>{dayMon(v.at)} · {v.byName || '—'}</span>
                          <span className={d.verCur}>{i === 0 ? 'Current' : ''}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })() : null}
            </div>
            <input ref={replacer} type="file" hidden onChange={e => { onReplace(e.target.files?.[0]); e.target.value = '' }} />
          </div>
        ) : (
          <div className={d.cols} data-narrow="">
            {brandsCol}
            <div className={d.mid}>
              <div className={d.midHeadOne}>
                <div className={d.search}>
                  <LeadIcon name="search" size={15} />
                  <input value={lq} onChange={e => setLq(e.target.value)} placeholder={tab === 'links' ? 'Search links' : 'Search shortcuts'} aria-label={tab === 'links' ? 'Search links' : 'Search shortcuts'} />
                </div>
                {tab === 'links' && canManage ? <button type="button" className={d.sqRust} title="Add link" aria-label="Add link" disabled={!can} onClick={() => setNewLink({ url: '', brand: br === 'all' ? '' : br, every: 'day' })}><LeadIcon name="plus" size={16} /></button> : null}
                {tab === 'short' && canManage ? (
                  <button type="button" className={d.sqRust} title="New shortcut" aria-label="New shortcut" disabled={!canShort} onClick={() => {
                    const id = `new-${Date.now()}`
                    editRows(xs => [{ id, brandId: br === 'all' || br === SHARED ? null : br, shortcut: '/', body: '', used: 0 }, ...xs])
                    setSSel(id); setLq('')
                  }}><LeadIcon name="plus" size={16} /></button>
                ) : null}
              </div>
              <div className={d.list} role="listbox" aria-label={tab === 'links' ? 'Web links' : 'Shortcuts'}>
                {tab === 'links' ? visLinks.map(f => {
                  const st = f.status === 'paused' ? { l: 'Paused', t: 'grey' } : { l: 'In use', t: 'green' }
                  return (
                    <div key={f.id} className={d.row} role="option" aria-selected={curLink?.id === f.id} onClick={() => setLSel(f.id)}
                      onContextMenu={e => { e.preventDefault(); setLSel(f.id); setLCtx({ id: f.id, x: e.clientX, y: e.clientY }) }}>
                      <span className={d.globe}><LeadIcon name="globe" size={17} /></span>
                      <div className={d.rowText}>
                        <span className={d.rowName}>{hostOf(f.url ?? '')}</span>
                        <span className={d.rowSub}>{brandName(f.brandId)} · {(CHECK_EVERY.find(c => c[0] === (f.checkEvery ?? 'day'))?.[1] ?? 'Every day').toLowerCase()}</span>
                      </div>
                      <span className={d.st} data-t={st.t}>{st.l}</span>
                    </div>
                  )
                }) : visShort.map(r => (
                  <div key={r.id} className={d.skRow} role="option" aria-selected={curShort === r} onClick={() => setSSel(r.id)}
                    onContextMenu={e => { e.preventDefault(); setSSel(r.id); if (canShort) setLCtx({ id: r.id, x: e.clientX, y: e.clientY }) }}>
                    <span className={d.key}>{r.shortcut}</span>
                    <div className={d.rowText}>
                      <span className={d.skText}>{r.body || '—'}</span>
                      <span className={d.rowSub}>{brandName(r.brandId)} · used {r.used} {r.used === 1 ? 'time' : 'times'}</span>
                    </div>
                  </div>
                ))}
                {(tab === 'links' ? !visLinks.length : !visShort.length) ? <div className={d.empty}>{(tab === 'links' ? ready : quickReady) ? 'Nothing here' : 'Waiting for the database update'}</div> : null}
              </div>
            </div>
            <div className={d.side}>
              {tab === 'links' && curLink ? (() => {
                const f = curLink, url = f.url ?? '', st = f.status === 'paused' ? { l: 'Paused', t: 'grey' } : { l: 'In use', t: 'green' }
                return (
                  <div className={d.detail}>
                    <div className={d.dHead}>
                      <span className={d.dName}>{hostOf(url)}</span>
                      <button type="button" className={d.pill} data-t={st.t} title="Pause / resume" disabled={!can || busy} onClick={() => saveLink(f, { status: f.status === 'paused' ? 'active' : 'paused' })}>{st.l}</button>
                      {canManage ? <button type="button" className={d.trash} title="Delete" aria-label="Delete" onClick={() => setLAsk(f.id)}><LeadIcon name="trash-2" size={15} /></button> : null}
                    </div>
                    {lAsk === f.id ? <div className={d.ask}><span>Delete this link?</span><button type="button" className={d.askNo} onClick={() => setLAsk(null)}>Cancel</button><button type="button" className={d.askYes} onClick={() => { setLAsk(null); run(() => removeDataFile(f.id)) }}>Delete</button></div> : null}
                    <div className={d.linkBox}><LeadIcon name="link" size={14} /><span className={d.linkText}>{url}</span><button type="button" className={d.copy} onClick={() => copy(url)}>{copied === url ? 'Copied' : 'Copy'}</button></div>
                    <div className={d.sect}>
                      <span className={d.kicker}>READ BY</span>
                      <div className={d.chips}>{BR.map(([k, l]) => <button key={k} type="button" className={d.chip} aria-pressed={brandOf(f.brandId) === k} disabled={!can || busy} onClick={() => saveLink(f, { brandId: k === SHARED ? null : k })}>{l}</button>)}</div>
                    </div>
                    <div className={d.sect}>
                      <span className={d.kicker}>CHECK FOR CHANGES</span>
                      <div className={d.chips}>{CHECK_EVERY.map(([k, l]) => <button key={k} type="button" className={d.chip} aria-pressed={(f.checkEvery ?? 'day') === k} disabled={!can || busy} onClick={() => saveLink(f, { checkEvery: k })}>{l}</button>)}</div>
                    </div>
                    <div className={d.kv}>
                      <div className={d.kvRow}><span>Last checked</span><span>{checkedLabel(f.checkedAt ?? null, Date.now())}</span></div>
                      <div className={d.kvRow}><span>Pages read</span><span>{f.pagesRead ?? 0}</span></div>
                    </div>
                    {f.checkError ? <span className={d.bad}>Last check: {f.checkError}</span> : null}
                    <button type="button" className={d.check} disabled={!can || busy} onClick={() => checkNow(f)}><LeadIcon name="refresh-cw" size={13} />{busy ? 'Checking…' : 'Check now'}</button>
                  </div>
                )
              })() : null}
              {tab === 'short' && curShort ? (
                <div className={d.detail} data-tight="">
                  <div className={d.dHead} style={{ alignItems: 'center' }}>
                    <div className={d.keyBox}>
                      <span>/</span>
                      <input value={curShort.shortcut.slice(1)} placeholder="shortcut" aria-label="Shortcut" disabled={!canShort}
                        onChange={e => { const v = cleanShortcut(e.target.value); editRows(xs => xs.map(x => (x === curShort ? { ...x, shortcut: v } : x))) }} />
                    </div>
                    {canShort ? <button type="button" className={d.trash} title="Delete" aria-label="Delete" onClick={() => setLAsk(curShort.id)}><LeadIcon name="trash-2" size={15} /></button> : null}
                  </div>
                  {lAsk === curShort.id ? <div className={d.ask}><span>Delete this shortcut?</span><button type="button" className={d.askNo} onClick={() => setLAsk(null)}>Cancel</button><button type="button" className={d.askYes} onClick={() => { setLAsk(null); editRows(xs => xs.filter(x => x !== curShort)) }}>Delete</button></div> : null}
                  {dup ? <span className={d.bad}>Another shortcut already uses this</span> : null}
                  <div className={d.sect}>
                    <span className={d.kicker}>TEXT</span>
                    <textarea className={d.text} rows={5} value={curShort.body} placeholder="What CS pastes" aria-label="Text" maxLength={1000} disabled={!canShort}
                      onChange={e => { const v = e.target.value; editRows(xs => xs.map(x => (x === curShort ? { ...x, body: v } : x))) }} />
                  </div>
                  <div className={d.sect}>
                    <span className={d.kicker}>BRAND</span>
                    <div className={d.chips}>{BR.map(([k, l]) => <button key={k} type="button" className={d.chip} aria-pressed={brandOf(curShort.brandId) === k} disabled={!canShort}
                      onClick={() => editRows(xs => xs.map(x => (x === curShort ? { ...x, brandId: k === SHARED ? null : k } : x)))}>{l}</button>)}</div>
                  </div>
                  <div className={d.kv}><div className={d.kvRow}><span>Used</span><span>{curShort.used} {curShort.used === 1 ? 'time' : 'times'}</span></div></div>
                  {skNote ? <span className={d.note}>{skNote}</span> : null}
                </div>
              ) : null}
            </div>
          </div>
        )}
      </section>

      <ContextMenu at={ctx} onClose={() => setCtx(null)} width={210}>
        {ctx && (ctxNode || ctxFile) ? (
          ctx.mode === 'main' ? (
            <>
              {ctxNode?.folder ? (
                <div className={d.swatches}>
                  {FOLDER_COLORS.map(([n, c]) => <button key={n} type="button" className={d.swatch} data-c={c ?? 'default'} title={n} aria-label={n} aria-pressed={(ctxNode.color ?? null) === c} onClick={() => setColor(ctxNode.folder!, c)} />)}
                </div>
              ) : null}
              {ctxNode ? <button type="button" className={d.ctxItem} onClick={() => { setCtx(null); open(ctxNode.place) }}><span>Open</span></button> : null}
              <button type="button" className={d.ctxItem} onClick={() => {
                setCtx(null)
                if (ctxNode) { if (ctxNode.parent && ctxNode.parent !== curOk) open(ctxNode.parent); setSel(ctx.key); setRen({ key: ctx.key, value: ctxNode.name }) }
                else if (ctxFile) { if (placeOf(ctxFile) !== curOk) setCur(placeOf(ctxFile)); setQ(''); setRen({ key: ctxFile.id, value: ctxFile.name }) }
              }}><span>Rename</span></button>
              <button type="button" className={d.ctxItem} onClick={() => setCtx({ ...ctx, mode: 'move' })}><span>Move to</span><span className={d.ctxArrow}>›</span></button>
              <button type="button" className={d.ctxItem} onClick={() => { copy(ctxNode ? t.linkOf(ctxNode.place) : t.linkOf(placeOf(ctxFile!), ctxFile!.name)); setCtx(null) }}><span>Copy link</span></button>
              {ctxFile ? <button type="button" className={d.ctxItem} onClick={() => { setCtx(null); replaceFile(ctxFile.id) }}><span>Replace file</span></button> : null}
              <button type="button" className={d.ctxItem} data-danger="" onClick={() => setCtx({ ...ctx, mode: 'del' })}><span>Delete</span></button>
            </>
          ) : ctx.mode === 'move' ? (
            <div style={{ maxHeight: 340, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
              <span className={d.ctxHead}>MOVE TO</span>
              {flat.filter(o => !banned.has(o.place)).map(o => {
                const here = ctxNode ? ctxNode.parent === o.place : placeOf(ctxFile!) === o.place
                return (
                  <button key={o.place} type="button" className={d.ctxItem} style={{ paddingLeft: 10 + (o.depth + 1) * 14 }} onClick={() => (here ? setCtx(null) : moveTo(ctx.key, o.place))}>
                    <LeadIcon name="folder" size={14} className={d.ctxIcon} /><span>{o.name}</span><span className={d.ctxMark}>{here ? '✓' : ''}</span>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className={d.ctxDel}>
              <span className={d.ctxDelQ}>{delQ(ctx.key)}</span>
              <div className={d.ctxDelRow}><button type="button" className={d.askNo} onClick={() => setCtx(null)}>Cancel</button><button type="button" className={d.askYes} onClick={() => delKey(ctx.key)}>Delete</button></div>
            </div>
          )
        ) : null}
      </ContextMenu>

      <ContextMenu at={lCtx} onClose={() => setLCtx(null)} width={180}>
        {lCtx && lCtxItem ? ('kind' in lCtxItem ? (
          <>
            <button type="button" className={d.ctxItem} onClick={() => { window.open(lCtxItem.url ?? '', '_blank', 'noopener'); setLCtx(null) }}><span>Open</span></button>
            <button type="button" className={d.ctxItem} onClick={() => { copy(lCtxItem.url ?? ''); setLCtx(null) }}><span>Copy link</span></button>
            {can ? (
              <>
                <button type="button" className={d.ctxItem} onClick={() => { setLCtx(null); checkNow(lCtxItem) }}><span>Check now</span></button>
                <button type="button" className={d.ctxItem} onClick={() => { setLCtx(null); saveLink(lCtxItem, { status: lCtxItem.status === 'paused' ? 'active' : 'paused' }) }}><span>{lCtxItem.status === 'paused' ? 'Resume' : 'Pause'}</span></button>
                <button type="button" className={d.ctxItem} data-danger="" onClick={() => { setLCtx(null); setLAsk(lCtxItem.id) }}><span>Delete</span></button>
              </>
            ) : null}
          </>
        ) : (
          <>
            <button type="button" className={d.ctxItem} onClick={() => {
              const id = `new-${Date.now()}`, src = lCtxItem as QuickReply
              editRows(xs => [...xs, { ...src, id, shortcut: cleanShortcut(`${src.shortcut}2`), used: 0 }])
              setSSel(id); setLCtx(null)
            }}><span>Duplicate</span></button>
            <button type="button" className={d.ctxItem} data-danger="" onClick={() => { setLAsk(lCtxItem.id); setLCtx(null) }}><span>Delete</span></button>
          </>
        )) : null}
      </ContextMenu>

      <ContextMenu at={tplOpen} onClose={() => setTplOpen(null)} width={220}>
        <span className={d.ctxHead}>BLANK TEMPLATES · CSV</span>
        {TEMPLATES.map(tp => <button key={tp.label} type="button" className={d.ctxItem} onClick={() => { download(tp); setTplOpen(null) }}><span>{tp.label}</span></button>)}
      </ContextMenu>

      <Modal open={!!up} onClose={() => setUp(null)} title="Upload file" width={440}
        foot={<><button type="button" className={d.mCancel} onClick={() => setUp(null)}>Cancel</button><button type="button" className={d.mGo} disabled={!up?.place || !up?.file || busy} onClick={doUpload}>{busy ? 'Uploading…' : 'Upload'}</button></>}>
        <div className={d.mSect}>
          <span className={d.mLabel}>TO FOLDER *</span>
          <div className={d.mFolders} role="radiogroup" aria-label="To folder">
            {flat.map(o => (
              <button key={o.place} type="button" role="radio" className={d.mFolder} aria-checked={up?.place === o.place} style={{ paddingLeft: 10 + o.depth * 16 }} onClick={() => setUp(u => (u ? { ...u, place: o.place } : u))}>
                <LeadIcon name="folder" size={14} />{o.name}
              </button>
            ))}
          </div>
        </div>
        <label className={d.drop}>
          <LeadIcon name="upload" size={18} />{up?.file?.name ?? 'Choose a file'}
          <input type="file" onChange={e => { const fl = e.target.files?.[0]; if (fl) setUp(u => (u ? { ...u, file: fl } : u)) }} />
        </label>
      </Modal>

      <Modal open={!!newLink} onClose={() => setNewLink(null)} title="Add link" width={440}
        foot={<><button type="button" className={d.mCancel} onClick={() => setNewLink(null)}>Cancel</button><button type="button" className={d.mGo} disabled={!newLinkOk || busy} onClick={addLink}>Add</button></>}>
        <input className={d.mInput} value={newLink?.url ?? ''} placeholder="https://" autoFocus aria-label="Web address" onChange={e => setNewLink(n => (n ? { ...n, url: e.target.value } : n))} />
        <div className={d.mSect}>
          <span className={d.mLabel}>READ BY *</span>
          <div className={d.chips}>{BR.map(([k, l]) => <button key={k} type="button" className={d.chip} aria-pressed={newLink?.brand === k} onClick={() => setNewLink(n => (n ? { ...n, brand: k } : n))}>{l}</button>)}</div>
        </div>
        <div className={d.mSect}>
          <span className={d.mLabel}>CHECK FOR CHANGES</span>
          <div className={d.chips}>{CHECK_EVERY.map(([k, l]) => <button key={k} type="button" className={d.chip} aria-pressed={newLink?.every === k} onClick={() => setNewLink(n => (n ? { ...n, every: k } : n))}>{l}</button>)}</div>
        </div>
      </Modal>
    </div>
  )
}

