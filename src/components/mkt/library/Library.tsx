'use client'

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { fileRoute } from '@/lib/storage/browser'
import { flash, FLASH_LONG } from '@/components/hrv/toast'
import {
  addMktLibFolder, addMktLibType, binMktLib, deleteMktLib, fileMktLib, moveMktLib,
} from '@/lib/marketing/actions'
import {
  BIN_DAYS, binRows, brandFace, brandLook, extOf, fileKind, folderTiles, LIB_CATS, LIB_MAX_BYTES, LIB_TYPE_COLORS, libDay, libHref, libIndex,
  libraryPath, libView, listedName, moveTargets, railCounts, shareOf, sizeLabel, typeChoices, viewFiles, zipPlan, type LibCat, type Library as Lib,
  type LibFile, type LibSub, type LibView, type SchedItem, type AttachTask,
} from '@/lib/marketing/library'
import AttachToTask from './AttachToTask'
import BrandProfile from './BrandProfile'
import ShareLink from './ShareLink'
import { saveZip } from './zip'
import s from './library.module.css'

// The Library (`Library.dc.html`, ⑥-1): the rail — every subsidiary with its files, the categories, the Dustbin; the
// page — everything (a card per subsidiary, the newest files), a subsidiary (its banner, its folders, its newest files),
// a folder (its files, ⬆ Upload); search across every folder; + New (a folder, an upload, a link folder). A file's ···:
// Download, Move to…, Move to Dustbin; a folder's: Open, Move to…, Move to Dustbin. The Dustbin: Restore, Delete now
// (the manager's), 60 days. Each subsidiary's brand profile — its card and banner, ✎ Marketing · Edit's, its history —
// and its next dates, the Schedule (⑥-2). Guest share links and Attach to task come next (⑥-3, ⑥-4).

type Can = { edit: boolean; manage: boolean }
type At = { co: string | null; folder: string | null; bin: string | null; cat: string | null; q: string | null }
type Menu = { kind: 'file' | 'folder'; id: string } | 'new' | 'add' | null
type Modal = { kind: 'move' | 'share' | 'attach'; what: 'file' | 'folder'; id: string; name: string } | { kind: 'link' } | { kind: 'profile' } | null

const CAT_CLASS: Record<LibCat, string> = { Brand: s.cat_Brand, Product: s.cat_Product, Photo: s.cat_Photo, Video: s.cat_Video, Content: s.cat_Content, Minutes: s.cat_Minutes }
const asCat = (v: string | null): LibCat | null => ((LIB_CATS as readonly string[]).includes(v ?? '') ? (v as LibCat) : null)
const tint = (dot: string, pct: number) => `color-mix(in oklch, ${dot || 'rgb(var(--mk-dash))'} ${pct}%, rgb(var(--mk-white)))`

function FolderGlyph({ color }: { color: string }) {
  return (
    <svg className={s.folderIcon} width="28" height="24" viewBox="0 0 28 24" aria-hidden="true">
      <path d="M2 5a3 3 0 0 1 3-3h6l3 3h9a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3z" fill={tint(color, 22)} stroke={color} strokeWidth="1.4" />
    </svg>
  )
}

/** A brand's banner, or its card's top: its cover, its colour, or the subsidiary's own tint. */
const bannerStyle = (x: LibSub, pct: number) => {
  const b = brandLook(x).banner
  return b.img ? { backgroundImage: `url("${fileRoute('marketing', b.img)}")` } : { background: b.bg ?? tint(x.dot, pct) }
}

/** A brand's picture: its logo, its colour with the name's first letter, or the subsidiary's emoji (on its tint, given
 * one — else on the tile's own white). */
function Avatar({ x, className, pct }: { x: LibSub; className: string; pct?: number }) {
  const a = brandLook(x).avatar
  const bg = a.img ? undefined : a.bg ?? (pct ? tint(x.dot, pct) : undefined)
  return (
    <span className={`${className}${a.bg ? ` ${s.avatarColour}` : ''}`} style={bg ? { background: bg } : undefined} aria-hidden="true">
      {a.img ? <img src={fileRoute('marketing', a.img)} alt="" /> : a.text}
    </span>
  )
}

export default function Library({ initial, schedules = {}, tasks = {}, can, at }: {
  initial: Lib
  schedules?: Record<string, SchedItem[]>
  /** Each subsidiary's open tasks, for Attach to task (⑥-4). */
  tasks?: Record<string, AttachTask[]>
  can: Can
  at: At
}) {
  const router = useRouter()
  const [lib, setLib] = useState(initial)
  useEffect(() => setLib(initial), [initial])
  const [view, setView] = useState<LibView>(() => libView(initial, at))
  const [cat, setCat] = useState<LibCat | null>(asCat(at.cat))
  const [q, setQ] = useState(at.q ?? '')
  const [menu, setMenu] = useState<Menu>(null)
  const [modal, setModal] = useState<Modal>(null)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [zipping, setZipping] = useState(false)
  const [newType, setNewType] = useState({ name: '', color: LIB_TYPE_COLORS[0] as string, cat: 'Content' as LibCat, link: false })
  const [link, setLink] = useState({ type: '', url: '', error: '' })
  const picker = useRef<HTMLInputElement>(null)
  // "auto-deletes in n days" only once in the browser — the server's clock and the browser's differ — and counted
  // again whenever the Library changes (a folder binned after the page opened is counted from then).
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => setNow(Date.now()), [lib])

  const ix = useMemo(() => libIndex(lib), [lib])
  const files = viewFiles(lib, view, { cat, q })
  const counts = railCounts(lib, view, cat)
  const sub = view.t === 'co' || view.t === 'folder' ? ix.sub(view.sub) ?? null : null
  const folder = view.t === 'folder' ? ix.folder(view.folder) ?? null : null
  const folderType = folder ? ix.type(folder.type) : undefined
  const subLook = sub ? brandLook(sub) : null

  /** Where the page is: at once, its address after (the server's answer only refreshes the Library). A search stays on
   * the page — typing never asks the server. */
  const go = (v: LibView, keep: { cat?: LibCat | null; q?: string } = {}) => {
    const c = 'cat' in keep ? keep.cat ?? null : cat
    if ('q' in keep) setQ(keep.q ?? '')
    setMenu(null)
    if (v.t === view.t && JSON.stringify(v) === JSON.stringify(view) && c === cat) return
    setView(v)
    setCat(c)
    router.replace(libHref(lib, v, { cat: c }), { scroll: false })
  }

  /** A folder's *Download as ZIP*: made here in the browser, a file at a time, said as it goes. */
  const zipFolder = async (folderId: string, name: string) => {
    setMenu(null)
    const list = lib.files.filter(f => f.folder === folderId)
    if (zipping || !zipPlan(list).ok) return
    setZipping(true)
    flash(`Preparing ${name}.zip`, 120_000)
    try {
      await saveZip(list, name, (done, all) => flash(`Preparing ${name}.zip · ${done} / ${all}`, 120_000))
      flash(`${name}.zip downloaded`)
    } catch {
      flash(`${name}.zip could not be made — download its files one at a time`, FLASH_LONG)
    } finally {
      setZipping(false)
    }
  }

  /** A write: the Library as it now stands, or the refusal in words. */
  const run = async (act: () => Promise<{ ok: true; library: Lib } | { ok: false; reason: string }>, done?: string) => {
    if (busy) return false
    setBusy(true)
    try {
      const r = await act()
      if (!r.ok) {
        flash(r.reason)
        return false
      }
      setLib(r.library)
      if (done) flash(done)
      return true
    } finally {
      setBusy(false)
      setMenu(null)
    }
  }

  // ── Uploads: the bytes to the bucket (≤ 2 GB), then filed — a file refused is taken back ──
  const upload = async (list: FileList | null) => {
    if (!list?.length || !folder || busy) return
    setBusy(true)
    setUploading(true)
    const db = createClient() as unknown as SupabaseClient
    let filed = 0
    try {
      for (const file of Array.from(list)) {
        if (file.size > LIB_MAX_BYTES) {
          flash(`${file.name} is over 2 GB — add it as a link folder.`)
          continue
        }
        const path = libraryPath(file.name, crypto.randomUUID())
        const put = await db.storage.from('marketing').upload(path, file, { contentType: file.type || undefined })
        if (put.error) {
          flash(put.error.message || `${file.name} could not be uploaded.`)
          continue
        }
        const r = await fileMktLib(folder.id, listedName(file.name), path)
        if (!r.ok) {
          flash(r.reason)
          await db.storage.from('marketing').remove([path])
          continue
        }
        setLib(r.library)
        filed++
      }
      const into = `${sub?.name ?? ''} / ${folderType?.name ?? ''}`
      if (filed) flash(filed === 1 ? `Uploaded to ${into}` : `${filed} files uploaded to ${into}`)
    } finally {
      setBusy(false)
      setUploading(false)
      if (picker.current) picker.current.value = ''
    }
  }

  const crumbs: { label: string; v: LibView | null }[] = [{ label: 'Library', v: { t: 'all' } }]
  if (sub) crumbs.push({ label: sub.name, v: { t: 'co', sub: sub.id } })
  if (folder && folderType) crumbs.push({ label: folderType.name, v: null })
  if (view.t === 'bin') crumbs.push({ label: 'Dustbin', v: null })
  const bin = view.t === 'bin' ? binRows(lib, now ?? Date.parse(lib.today || '2026-01-01')) : []
  const countLabel = view.t === 'bin' ? `${lib.trash.length} item${lib.trash.length === 1 ? '' : 's'}` : `${view.t === 'all' && !q ? lib.files.length : files.length} file${(view.t === 'all' && !q ? lib.files.length : files.length) === 1 ? '' : 's'}`
  const filesTitle = view.t === 'folder' ? `${folderType?.name ?? ''} · ${files.length}` : q.trim() ? `Search results · ${files.length}` : view.t === 'all' ? 'Recently added · all companies' : 'Recently added'
  const linkTypes = lib.types.filter(t => t.link)

  const fileMenu = (f: LibFile): ReactNode => (
    <div className={`${s.menu} ${s.tileMenu}`} role="menu" onClick={e => e.stopPropagation()}>
      <a role="menuitem" className={s.menuItem} href={fileRoute('marketing', f.path, `${f.name}.${extOf(f.path).toLowerCase()}`)} onClick={() => setMenu(null)}>
        Download<span className={s.menuHint}>{sizeLabel(f.size)}</span>
      </a>
      {can.edit ? (
        <>
          <button type="button" role="menuitem" className={s.menuItem} onClick={() => { setMenu(null); setModal({ kind: 'share', what: 'file', id: f.id, name: f.name }) }}>
            Share link<span className={s.menuHint}>{shareOf(lib, 'file', f.id) ? 'live' : 'guest'}</span>
          </button>
          <button type="button" role="menuitem" className={s.menuItem} onClick={() => { setMenu(null); setModal({ kind: 'attach', what: 'file', id: f.id, name: f.name }) }}>
            Attach to task<span className={s.menuHint}>send</span>
          </button>
          <button type="button" role="menuitem" className={s.menuItem} onClick={() => { setMenu(null); setModal({ kind: 'move', what: 'file', id: f.id, name: f.name }) }}>Move to…</button>
          <button type="button" role="menuitem" className={`${s.menuItem} ${s.menuDanger}`} onClick={() => void run(() => binMktLib('file', f.id), `Moved to Dustbin · deletes automatically in ${BIN_DAYS} days`)}>
            Move to Dustbin<span className={s.menuHint}>{BIN_DAYS} days</span>
          </button>
        </>
      ) : null}
    </div>
  )

  return (
    <div className={s.root} onClick={() => menu && setMenu(null)}>
      <nav className={s.rail} aria-label="Library">
        <div className={s.railHead}>Subsidiaries</div>
        <button type="button" className={`${s.railItem}${view.t === 'all' ? ` ${s.railOn}` : ''}`} onClick={() => go({ t: 'all' })}>
          <span className={s.railTile} style={{ background: 'rgb(var(--mk-surface-2))' }} aria-hidden="true">•</span>
          <span className={s.railName}>All companies</span>
          <span className={s.mono}>{counts.all}</span>
        </button>
        {lib.subs.map(x => (
          <button key={x.id} type="button" className={`${s.railItem}${sub?.id === x.id ? ` ${s.railOn}` : ''}`} onClick={() => go({ t: 'co', sub: x.id })}>
            <span className={s.railTile} style={{ background: tint(x.dot, 18) }} aria-hidden="true">{x.emoji}</span>
            <span className={s.railName}>{x.name}</span>
            <span className={s.mono}>{counts.subs[x.id] ?? 0}</span>
          </button>
        ))}
        <div className={`${s.railHead} ${s.railGap}`}>Category</div>
        <button type="button" className={`${s.railItem}${!cat ? ` ${s.railOn}` : ''}`} onClick={() => go(view.t === 'bin' ? { t: 'all' } : view, { cat: null })}>
          <span className={`${s.railSwatch} ${s.catAll}`} aria-hidden="true" />
          <span className={s.railName}>All categories</span>
          <span className={s.mono}>{counts.catAll}</span>
        </button>
        {LIB_CATS.map(c => (
          <button key={c} type="button" className={`${s.railItem}${cat === c ? ` ${s.railOn}` : ''}`} onClick={() => go(view.t === 'bin' ? { t: 'all' } : view, { cat: c })}>
            <span className={`${s.railSwatch} ${CAT_CLASS[c]}`} aria-hidden="true" />
            <span className={s.railName}>{c}</span>
            <span className={s.mono}>{counts.cats[c] ?? 0}</span>
          </button>
        ))}
        <div className={s.railRule} aria-hidden="true" />
        <button type="button" className={`${s.railItem}${view.t === 'bin' ? ` ${s.railOn}` : ''}`} onClick={() => go({ t: 'bin' }, { cat: null, q: '' })}>
          <span className={s.railTile} aria-hidden="true">🗑️</span>
          <span className={s.railName}>Dustbin</span>
          <span className={s.mono}>{lib.trash.length}</span>
        </button>
      </nav>

      <div className={s.main}>
        <div className={s.top}>
          <span className={s.topIcon} aria-hidden="true">📚</span>
          <h1 className={s.title}>Library</h1>
          <span className={s.grow} />
          <label className={s.search}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="6" cy="6" r="4.5" /><path d="m9.5 9.5 3 3" /></svg>
            <input value={q} placeholder="Search every folder" aria-label="Search every folder"
              onChange={e => go(view.t === 'bin' ? { t: 'all' } : view, { q: e.target.value })} />
          </label>
          {can.edit ? (
            <div className={s.newWrap}>
              <button type="button" className={s.newBtn} aria-haspopup="menu" aria-expanded={menu === 'new'} onClick={e => { e.stopPropagation(); setMenu(m => (m === 'new' ? null : 'new')) }}>
                + New <span className={s.caret} aria-hidden="true">▼</span>
              </button>
              {menu === 'new' ? (
                <div className={`${s.menu} ${s.menuRight}`} role="menu" onClick={e => e.stopPropagation()}>
                  <button type="button" role="menuitem" className={s.menuItem} onClick={() => { if (!sub) { setMenu(null); flash('Open a subsidiary first, then add a folder') } else setMenu('add') }}>📁 New folder</button>
                  <button type="button" role="menuitem" className={s.menuItem} onClick={() => { setMenu(null); if (folder && !folderType?.link) picker.current?.click(); else flash('Open a folder to upload into it') }}>⬆️ Upload file</button>
                  <button type="button" role="menuitem" className={s.menuItem} onClick={() => {
                    setMenu(null)
                    if (!sub) { flash('Open a subsidiary first, then add a link'); return }
                    setLink({ type: linkTypes[0]?.id ?? '', url: '', error: '' })
                    setModal({ kind: 'link' })
                  }}>🔗 Add a link (Google Drive…)</button>
                </div>
              ) : null}
            </div>
          ) : null}
          <input ref={picker} type="file" multiple hidden onChange={e => void upload(e.target.files)} />
        </div>

        <div className={s.crumbs}>
          {crumbs.map((c, i) => (
            <Fragment key={`${c.label}${i}`}>
              {c.v && i < crumbs.length - 1 ? <button type="button" className={s.crumb} onClick={() => go(c.v!)}>{c.label}</button> : <span className={`${s.crumb} ${s.crumbOn}`}>{c.label}</span>}
              {i < crumbs.length - 1 ? <span className={s.sep} aria-hidden="true">/</span> : null}
            </Fragment>
          ))}
          <span className={s.grow} />
          <span className={s.mono}>{countLabel}</span>
        </div>

        {view.t === 'all' && !q.trim() ? (
          <div className={s.cards}>
            {lib.subs.map(x => {
              const nf = lib.folders.filter(f => f.sub === x.id).length
              const nx = lib.files.filter(f => ix.subOf(f) === x.id).length
              const look = brandLook(x)
              return (
                <button key={x.id} type="button" className={s.card} onClick={() => go({ t: 'co', sub: x.id })}>
                  <div className={s.cardBanner} style={bannerStyle(x, 22)}>
                    <Avatar x={x} className={s.cardAvatar} pct={40} />
                  </div>
                  <div className={s.cardBody}>
                    <div className={`${s.cardName}${look.font ? ` ${s.brandName}` : ''}`} style={brandFace(look.font)}>{look.name}</div>
                    <div className={`${s.cardCaption} ${s.ellipsis}`}>{look.caption}</div>
                    <div className={`${s.mono} ${s.cardMeta}`}>{nf} folder{nf === 1 ? '' : 's'} · {nx} file{nx === 1 ? '' : 's'}</div>
                  </div>
                </button>
              )
            })}
          </div>
        ) : null}

        {sub && subLook && view.t !== 'bin' ? (
          <>
            <div className={s.banner} style={bannerStyle(sub, 22)} data-dark={subLook.banner.dark ? '' : undefined}>
              <Avatar x={sub} className={s.bannerAvatar} />
              <div className={s.ellipsis}>
                <div className={`${s.bannerName}${subLook.font ? ` ${s.brandName}` : ''}`} style={brandFace(subLook.font)}>{subLook.name}</div>
                <div className={s.bannerSub}>{subLook.caption}</div>
              </div>
              {can.edit ? (
                <button type="button" className={s.editBtn} title="Edit brand profile" aria-label="Edit brand profile"
                  onClick={() => { setMenu(null); setModal({ kind: 'profile' }) }}>✎</button>
              ) : null}
            </div>
            {schedules[sub.id]?.length ? (
              <div className={s.sched}>
                <span className={s.secLabel}>Schedule</span>
                {schedules[sub.id].map(e => (
                  <Link key={e.id} className={s.schedItem} href={e.trackId ? `/marketing/projects/${encodeURIComponent(e.trackId)}` : '/marketing/projects'}>
                    <span className={s.schedDay}>{e.label}</span>{e.title}
                  </Link>
                ))}
              </div>
            ) : null}
          </>
        ) : null}

        {sub && view.t === 'co' && !q.trim() ? (
          <>
            <div className={s.secHead}>
              <span className={s.secLabel}>Folders · {folderTiles(lib, sub.id).length}</span>
              <span className={s.grow} />
              {can.edit ? (
                <button type="button" className={s.plus} aria-label="Add folder" aria-expanded={menu === 'add'} onClick={e => { e.stopPropagation(); setMenu(m => (m === 'add' ? null : 'add')) }}>+</button>
              ) : null}
              {menu === 'add' ? (
                <div className={s.addPop} role="dialog" aria-label={`Add folder to ${sub.name}`} onClick={e => e.stopPropagation()}>
                  <div className={s.addHead}>Add folder to {sub.name}</div>
                  <div className={s.addList}>
                    {typeChoices(lib, sub.id).map(({ type, has }) => (
                      <button key={type.id} type="button" className={s.addType} disabled={has || busy}
                        onClick={() => {
                          if (type.link) { setMenu(null); setLink({ type: type.id, url: '', error: '' }); setModal({ kind: 'link' }); return }
                          void run(() => addMktLibFolder(sub.id, type.id, null), `Folder "${type.name}" added to ${sub.name}`)
                        }}>
                        <FolderGlyph color={type.color} />
                        <span className={s.ellipsis}>{type.name}</span>
                        <span className={s.addNote}>{has ? 'already here' : type.link ? 'link' : ''}</span>
                      </button>
                    ))}
                  </div>
                  {can.manage ? (
                    <div className={s.addNew}>
                      <span className={s.muted}>New folder type</span>
                      <div className={s.addNewRow}>
                        <input className={s.input} value={newType.name} maxLength={40} placeholder="Folder type name" aria-label="New folder type name"
                          onChange={e => setNewType(t => ({ ...t, name: e.target.value }))} />
                        <select className={s.select} value={newType.cat} aria-label="Its files' category" onChange={e => setNewType(t => ({ ...t, cat: e.target.value as LibCat }))}>
                          {LIB_CATS.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <button type="button" role="switch" aria-checked={newType.link} className={s.toggleRow}
                        title="Each subsidiary's folder of this type is a link — kept on Google Drive or Dropbox"
                        onClick={() => setNewType(t => ({ ...t, link: !t.link }))}>
                        <span className={`${s.track}${newType.link ? ` ${s.trackOn}` : ''}`}><span className={s.knob} /></span>
                        🔗 Link folder
                      </button>
                      <div className={s.addNewRow}>
                        <div className={s.swatches} role="radiogroup" aria-label="Colour">
                          {LIB_TYPE_COLORS.map(c => (
                            <button key={c} type="button" role="radio" aria-checked={newType.color === c} aria-label={c} className={`${s.swatch}${newType.color === c ? ` ${s.swatchOn}` : ''}`}
                              style={{ background: c }} onClick={() => setNewType(t => ({ ...t, color: c }))} />
                          ))}
                        </div>
                        <span className={s.grow} />
                        <button type="button" className={s.btnPrimary} disabled={!newType.name.trim() || busy}
                          onClick={async () => {
                            const name = newType.name.trim()
                            const ok = await run(() => addMktLibType(name, newType.color, newType.cat, newType.link),
                              `New ${newType.link ? 'link ' : ''}folder type "${name}" saved for every subsidiary`)
                            if (ok) setNewType(t => ({ ...t, name: '', link: false }))
                          }}>Create</button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className={s.folders}>
              {folderTiles(lib, sub.id).map(t => {
                const on = menu && typeof menu === 'object' && menu.kind === 'folder' && menu.id === t.folder.id
                const inner = (
                  <>
                    {t.type.link
                      ? <span className={s.folderLink} style={{ background: tint(t.type.color, 18), color: t.type.color }} aria-hidden="true">↗</span>
                      : <FolderGlyph color={t.type.color} />}
                    <span className={s.ellipsis}>
                      <span className={`${s.folderName} ${s.ellipsis}`} style={{ display: 'block' }}>{t.type.name}</span>
                      <span className={`${s.folderMeta} ${s.ellipsis}`} style={{ display: 'block' }}>{t.meta}</span>
                    </span>
                  </>
                )
                return (
                  <div key={t.folder.id} className={s.folder}
                    onContextMenu={e => { if (!can.edit) return; e.preventDefault(); e.stopPropagation(); setMenu({ kind: 'folder', id: t.folder.id }) }}>
                    {t.type.link && t.folder.url
                      ? <a className={s.folderMain} href={t.folder.url} target="_blank" rel="noopener noreferrer">{inner}</a>
                      : <button type="button" className={s.folderMain} onClick={() => go({ t: 'folder', sub: sub.id, folder: t.folder.id })}>{inner}</button>}
                    <button type="button" className={s.dots} aria-label={`${t.type.name} — more`} aria-haspopup="menu" aria-expanded={!!on}
                      onClick={e => { e.stopPropagation(); setMenu(on ? null : { kind: 'folder', id: t.folder.id }) }}>···</button>
                    {on ? (
                      <div className={`${s.menu} ${s.tileMenu}`} role="menu" onClick={e => e.stopPropagation()}>
                        {t.type.link && t.folder.url
                          ? <a role="menuitem" className={s.menuItem} href={t.folder.url} target="_blank" rel="noopener noreferrer" onClick={() => setMenu(null)}>Open link</a>
                          : <button type="button" role="menuitem" className={s.menuItem} onClick={() => go({ t: 'folder', sub: sub.id, folder: t.folder.id })}>Open</button>}
                        {can.edit && !t.type.link ? (
                          <button type="button" role="menuitem" className={s.menuItem} onClick={() => { setMenu(null); setModal({ kind: 'share', what: 'folder', id: t.folder.id, name: t.type.name }) }}>
                            Share link<span className={s.menuHint}>{shareOf(lib, 'folder', t.folder.id) ? 'live' : 'guest'}</span>
                          </button>
                        ) : null}
                        {/* Anybody who sees the Library downloads, a folder as a file (gap 79). */}
                        {!t.type.link ? (() => {
                          const plan = zipPlan(lib.files.filter(f => f.folder === t.folder.id))
                          return (
                            <button type="button" role="menuitem" className={s.menuItem} disabled={!plan.ok || zipping}
                              onClick={() => void zipFolder(t.folder.id, `${sub.name} · ${t.type.name}`)}>
                              Download as ZIP<span className={s.menuHint}>{plan.hint}</span>
                            </button>
                          )
                        })() : null}
                        {can.edit ? (
                          <>
                            <button type="button" role="menuitem" className={s.menuItem} onClick={() => { setMenu(null); setModal({ kind: 'move', what: 'folder', id: t.folder.id, name: t.type.name }) }}>Move to…</button>
                            <button type="button" role="menuitem" className={`${s.menuItem} ${s.menuDanger}`}
                              onClick={() => void run(() => binMktLib('folder', t.folder.id), `Folder moved to Dustbin · ${BIN_DAYS} days`)}>
                              Move to Dustbin<span className={s.menuHint}>{BIN_DAYS} days</span>
                            </button>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
            {folderTiles(lib, sub.id).length ? null : <div className={s.none}>No folders yet</div>}
          </>
        ) : null}

        {view.t !== 'bin' ? (
          <>
            <div className={s.secHead}>
              <span className={s.secLabel}>{filesTitle}</span>
              <span className={s.grow} />
              {view.t === 'folder' && can.edit && !folderType?.link ? (
                <button type="button" className={s.upload} disabled={busy} onClick={() => picker.current?.click()}>{uploading ? 'Uploading…' : '⬆ Upload'}</button>
              ) : null}
            </div>
            {files.length ? (
              <div className={s.files}>
                {files.map(f => {
                  const kind = fileKind(f)
                  const where = ix.folder(f.folder)
                  const on = menu && typeof menu === 'object' && menu.kind === 'file' && menu.id === f.id
                  const c = ix.catOf(f)
                  return (
                    <div key={f.id} className={s.file} onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setMenu({ kind: 'file', id: f.id }) }}>
                      <a className={`${s.thumb}${kind === 'video' ? ` ${s.thumbVideo}` : ''}`} href={fileRoute('marketing', f.path)} target="_blank" rel="noopener noreferrer" aria-label={`Open ${f.name}`}>
                        {kind === 'image' ? <img src={fileRoute('marketing', f.path)} alt="" loading="lazy" /> : kind === 'video' ? <span className={s.play} aria-hidden="true">▶</span> : <span className={s.ext}>{extOf(f.path)}</span>}
                        {kind !== 'doc' ? <span className={`${s.ext} ${s.extOn}`}>{extOf(f.path)}</span> : null}
                      </a>
                      <button type="button" className={`${s.dots} ${s.fileDots}`} aria-label={`${f.name} — more`} aria-haspopup="menu" aria-expanded={!!on}
                        onClick={e => { e.stopPropagation(); setMenu(on ? null : { kind: 'file', id: f.id }) }}>···</button>
                      {on ? fileMenu(f) : null}
                      <div className={s.fileBody}>
                        <span className={`${s.fileName} ${s.ellipsis}`} title={f.name}>{f.name}</span>
                        <span className={`${s.fileMeta} ${s.ellipsis}`}>{sizeLabel(f.size)} · {ix.sub(where?.sub ?? '')?.name ?? ''} / {ix.type(where?.type ?? '')?.name ?? ''}</span>
                        <span className={s.chip}><span className={`${s.chipDot} ${CAT_CLASS[c]}`} aria-hidden="true" />{c}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className={s.none}>{view.t === 'folder' ? (folderType?.link ? 'A link folder keeps its files where it points' : 'This folder is empty') : 'No files match'}</div>
            )}
          </>
        ) : (
          <div className={s.bin}>
            {bin.length ? bin.map(r => (
              <div key={`${r.kind}:${r.id}`} className={s.binRow}>
                <span className={`${s.binName} ${s.ellipsis}`}>{r.kind === 'folder' ? `📁 ${r.name}` : r.name}</span>
                <span className={`${s.binFrom} ${s.ellipsis}`}>{r.from}{r.kind === 'folder' && r.n ? ` · ${r.n} file${r.n === 1 ? '' : 's'}` : ''}</span>
                <span className={`${s.binLeft}${now !== null && r.left <= 7 ? ` ${s.binSoon}` : ''}`}>{now !== null ? `auto-deletes in ${r.left} day${r.left === 1 ? '' : 's'}` : libDay(r.at)}</span>
                <span className={s.binBtns}>
                  {can.edit ? <button type="button" className={s.btn} disabled={busy} onClick={() => void run(() => binMktLib(r.kind, r.id, true), `Restored ${r.name}`)}>Restore</button> : null}
                  {can.manage ? <button type="button" className={`${s.btn} ${s.danger}`} disabled={busy} onClick={() => void run(() => deleteMktLib(r.kind, r.id), 'Deleted permanently')}>Delete now</button> : null}
                </span>
              </div>
            )) : <div className={s.none} style={{ margin: 12 }}>The Dustbin is empty 🧹</div>}
          </div>
        )}
      </div>

      {modal?.kind === 'move' ? (
        <div className={s.scrim} onClick={() => setModal(null)}>
          <div className={s.dialog} role="dialog" aria-modal="true" aria-label={`Move "${modal.name}"`} onClick={e => e.stopPropagation()}>
            <div className={s.dialogHead}>
              <div>
                <div className={s.dialogTitle}>Move &ldquo;{modal.name}&rdquo;</div>
                <div className={s.dialogSub}>{modal.what === 'folder' ? 'To another subsidiary' : 'To another folder'}</div>
              </div>
              <button type="button" className={s.x} aria-label="Close" onClick={() => setModal(null)}>×</button>
            </div>
            <div className={s.targets}>
              {moveTargets(lib, modal.what, modal.id).map(t => (
                <button key={t.id} type="button" className={s.target} disabled={t.off || busy}
                  onClick={async () => { if (await run(() => moveMktLib(modal.what, modal.id, t.id), `Moved to ${t.label}`)) setModal(null) }}>
                  <span aria-hidden="true">{t.emoji}</span>
                  <span className={`${s.grow} ${s.ellipsis}`}>{t.label}</span>
                  <span className={s.mono}>{t.note}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {modal?.kind === 'share' && can.edit ? (
        <ShareLink lib={lib} what={modal.what} id={modal.id} name={modal.name} onClose={() => setModal(null)} onLibrary={setLib} />
      ) : null}

      {modal?.kind === 'attach' && can.edit ? (() => {
        const theFile = lib.files.find(f => f.id === modal.id)
        const owner = theFile ? ix.sub(ix.subOf(theFile)) : undefined
        return <AttachToTask file={modal.id} name={modal.name} sub={owner?.name ?? ''} tasks={owner ? tasks[owner.id] ?? [] : []} onClose={() => setModal(null)} />
      })() : null}

      {modal?.kind === 'profile' && sub && can.edit ? (
        <BrandProfile sub={sub} onClose={() => setModal(null)} onSaved={l => { setLib(l); setModal(null) }} />
      ) : null}

      {modal?.kind === 'link' && sub ? (
        <div className={s.scrim} onClick={() => setModal(null)}>
          <div className={s.dialog} role="dialog" aria-modal="true" aria-label="Add a link" onClick={e => e.stopPropagation()}>
            <div className={s.dialogHead}>
              <div>
                <div className={s.dialogTitle}>Add a link</div>
                <div className={s.dialogSub}>{sub.name}</div>
              </div>
              <button type="button" className={s.x} aria-label="Close" onClick={() => setModal(null)}>×</button>
            </div>
            <label className={s.field}>
              <span className={s.fieldHead}>Folder type</span>
              <select className={s.select} value={link.type} onChange={e => setLink(l => ({ ...l, type: e.target.value }))}>
                {linkTypes.map(t => <option key={t.id} value={t.id} disabled={lib.folders.some(f => f.sub === sub.id && f.type === t.id)}>{t.name}</option>)}
              </select>
            </label>
            <label className={s.field}>
              <span className={s.fieldHead}>Link</span>
              <input className={s.input} value={link.url} placeholder="https://drive.google.com/…" inputMode="url" autoFocus
                onChange={e => setLink(l => ({ ...l, url: e.target.value, error: '' }))} />
            </label>
            {link.error ? <div className={s.err} role="status">{link.error}</div> : null}
            <div className={s.dialogBtns}>
              <button type="button" className={s.btn} onClick={() => setModal(null)}>Cancel</button>
              <button type="button" className={s.btnPrimary} disabled={!link.type || !/^https:\/\/\S+$/.test(link.url.trim()) || busy}
                onClick={async () => {
                  const r = await addMktLibFolder(sub.id, link.type, link.url.trim())
                  if (!r.ok) { setLink(l => ({ ...l, error: r.reason })); return }
                  setLib(r.library)
                  setModal(null)
                  flash('Link folder added')
                }}>Add link</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
