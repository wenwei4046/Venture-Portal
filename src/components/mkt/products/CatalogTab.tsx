'use client'

import { useEffect, useRef, useState } from 'react'
import {
  deleteMktItem, deleteMktItemColumn, orderMktItemColumns, renameMktCatalogue, saveMktItem, saveMktItemColumn, saveMktListPrefs, setMktItemInternal,
} from '@/lib/marketing/quote-actions'
import {
  catalogueIcon, catalogues, COLUMN_KINDS, deleteImpact, itemMargin, itemPatch, norm,
  type BuiltinColumn, type CatalogItem, type ColumnKind, type ExtraValue, type ItemColumn, type ListPrefs,
} from '@/lib/marketing/catalog'
import ColumnEditor from './ColumnEditor'
import ColumnKindMenu from './ColumnKindMenu'
import ColumnMenu from './ColumnMenu'
import DeleteItem from './DeleteItem'
import ExtraCell from './ExtraCell'
import HeadMenu, { type HeadLock } from './HeadMenu'
import IconPicker from './IconPicker'
import ItemMenu from './ItemMenu'
import Lock, { LOCK_TITLE } from './Lock'
import type { ProductBook, ProductWorkflowOption } from '@/lib/marketing/products'
import type { QuoteBook } from '@/lib/marketing/quotes'
import MoneyInput from './MoneyInput'
import { menuAt, type MenuAt } from './PopMenu'
import qs from './quotes.module.css'
import v2 from './v2.module.css'

// The Product Builder's 📋 Product List tab (v2, docs/design_handoff_product_builder_v2/ §5): every sellable item, by
// catalogue — each catalogue its icon; an item's name, description, price, internal cost 🔒, margin, est. days, default
// workflow and remarks, then the manager's own columns, each a flat cell saved as it is typed. A row right-clicked:
// Internal only (off the client's PDF, still in every sum) and Delete item… (every item — out of drafts only). A column
// head right-clicked: Internal only and Delete column. Renaming an item renames it in every product and quotation (the
// database does it). The manager's (Marketing · Manage).

const wfLabel = (w: ProductWorkflowOption) => `${w.action} · ${w.tname} · ${w.version ? `v${w.version}` : 'draft'}`

// The list's own heads — a column of the manager's is never called one of them (`mkt_item_column_save` refuses it too).
const BUILT_IN = ['item', 'description', 'price', 'cost', 'margin', 'est. days', 'days', 'workflow', 'remarks']

type Head = 'item' | 'price' | BuiltinColumn
const HEADS: { key: Head; name: string; width: string; right?: boolean; lock: HeadLock; required?: boolean }[] = [
  { key: 'item', name: 'Item', width: 'minmax(160px, 1.1fr)', lock: 'client', required: true },
  { key: 'desc', name: 'Description', width: 'minmax(180px, 1.5fr)', lock: null },
  { key: 'price', name: 'Price', width: '100px', right: true, lock: 'client', required: true },
  { key: 'cost', name: 'Cost', width: '100px', right: true, lock: 'internal' },
  { key: 'margin', name: 'Margin', width: '80px', right: true, lock: 'internal' },
  { key: 'days', name: 'Days', width: '64px', right: true, lock: null },
  { key: 'wf', name: 'Workflow', width: 'minmax(200px, 1.3fr)', lock: null },
  { key: 'remarks', name: 'Remarks', width: 'minmax(130px, 1fr)', lock: null },
]
const MARGIN_LOW = 20

export default function CatalogTab({ items, setItems, columns, setColumns, prefs, setPrefs, products, quotes, workflows, onRenamed, flash }: {
  items: CatalogItem[]
  setItems: (fn: (items: CatalogItem[]) => CatalogItem[]) => void
  /** The manager's own columns, in their order. */
  columns: ItemColumn[]
  setColumns: (fn: (columns: ItemColumn[]) => ItemColumn[]) => void
  /** The Product List's own settings: catalogue icons, the built-in columns internal / hidden. */
  prefs: ListPrefs
  setPrefs: (fn: (prefs: ListPrefs) => ListPrefs) => void
  products: ProductBook['products']
  quotes: QuoteBook['quotes']
  workflows: ProductWorkflowOption[]
  /** An item renamed or deleted: both books as the database now has them (products' drafts and quotations changed). */
  onRenamed: (products: ProductBook | null, book: QuoteBook | null) => void
  flash: (words: string) => void
}) {
  const [q, setQ] = useState('')
  const [catNew, setCatNew] = useState('')
  // A catalogue's name as it is typed (keyed by its place, so its box keeps the focus) — saved on leaving the box.
  const [catTyped, setCatTyped] = useState<Record<number, string>>({})
  const [editing, setEditing] = useState<{ id: string; at: { left: number; top: number; above?: number } } | null>(null)
  const [busy, setBusy] = useState(false)
  // A column head right-clicked (its menu), and one being dragged to a new place (the user, 2026-11-13).
  const [colMenu, setColMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [headMenu, setHeadMenu] = useState<{ key: Head; at: MenuAt } | null>(null)
  const [rowMenu, setRowMenu] = useState<{ id: string; at: MenuAt } | null>(null)
  const [delFor, setDelFor] = useState<string | null>(null)
  const [iconFor, setIconFor] = useState<{ cat: string; el: HTMLElement } | null>(null)
  const [dragCol, setDragCol] = useState<{ id: string; over: string | null } | null>(null)
  const [adding, setAdding] = useState<{ el: HTMLElement; at: { left: number; top: number; above?: number } } | null>(null)
  const saved = useRef(new Map<string, CatalogItem>(items.map(i => [i.id, i])))
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const chains = useRef(new Map<string, Promise<void>>())
  const live = useRef(items)
  live.current = items
  // "● All changes saved" — or a change waiting or on its way (saving stays automatic, v2 §5).
  const [saveState, setSaveState] = useState<'saved' | 'unsaved' | 'saving'>('saved')
  const settle = () => setSaveState(timers.current.size ? 'unsaved' : pending.current ? 'saving' : 'saved')
  const cardRefs = useRef(new Map<string, HTMLDivElement>())

  const flushItem = (id: string) => {
    const t = timers.current.get(id)
    if (t) clearTimeout(t)
    timers.current.delete(id)
    const run = (chains.current.get(id) ?? Promise.resolve()).then(async () => {
      const now = live.current.find(i => i.id === id)
      const before = saved.current.get(id)
      if (!now || !before) return
      const patch = itemPatch(before, now)
      if (!patch) return
      pending.current++
      setSaveState('saving')
      const r = await saveMktItem(id, patch).finally(() => { pending.current--; settle() })
      if (!r.ok) {
        flash(r.reason)
        setSaveState('unsaved')
        return
      }
      saved.current.set(id, now)
      if (r.products || r.book) onRenamed(r.products, r.book)
    })
    chains.current.set(id, run.catch(() => undefined))
  }
  useEffect(() => {
    const ts = timers.current
    return () => {
      for (const id of [...ts.keys()]) flushItem(id)
    }
    // flushItem reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A row left (its box blurred) saves at once, not 700 ms later; and while anything is still unsaved the browser asks
  // before the page is closed or reloaded (2026-11-13, the user: "product list 加了东西后没得储存" — a name typed and
  // the page left at once was lost).
  const pending = useRef(0)
  useEffect(() => {
    const ask = (e: BeforeUnloadEvent) => {
      if (!timers.current.size && !pending.current) return
      for (const id of [...timers.current.keys()]) flushItem(id)
      e.preventDefault()
    }
    window.addEventListener('beforeunload', ask)
    return () => window.removeEventListener('beforeunload', ask)
    // flushItem reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setItem = (id: string, patch: Partial<CatalogItem>) => {
    setItems(xs => xs.map(x => (x.id === id ? { ...x, ...patch } : x)))
    const t = timers.current.get(id)
    if (t) clearTimeout(t)
    timers.current.set(id, setTimeout(() => flushItem(id), 700))
    setSaveState('unsaved')
  }

  const addInCat = async (cat: string) => {
    const r = await saveMktItem(null, { cat })
    if (!r.ok) return flash(r.reason)
    saved.current.set(r.item.id, r.item)
    setItems(xs => [...xs, r.item])
  }

  /** Delete item (v2 §5): every item — out of products' drafts and draft quotations; sent / accepted keep it. */
  const remove = async (x: CatalogItem) => {
    if (busy) return
    setBusy(true)
    try {
      const t = timers.current.get(x.id)
      if (t) clearTimeout(t)
      timers.current.delete(x.id)
      const r = await deleteMktItem(x.id)
      if (!r.ok) return flash(r.reason)
      setItems(xs => xs.filter(i => i.id !== x.id))
      saved.current.delete(x.id)
      setDelFor(null)
      if (r.book || r.productBook) onRenamed(r.productBook, r.book)
      flash(`Deleted “${x.name || 'item'}”${r.drafts.length ? ` · removed from ${r.drafts.length} draft quotation${r.drafts.length === 1 ? '' : 's'}` : ''}`)
    } finally {
      setBusy(false)
      settle()
    }
  }

  /** Internal only, on or off — saved at once. */
  const toggleInternal = async (x: CatalogItem) => {
    setRowMenu(null)
    const on = !x.internal
    setItems(xs => xs.map(i => (i.id === x.id ? { ...i, internal: on } : i)))
    const s = saved.current.get(x.id)
    if (s) saved.current.set(x.id, { ...s, internal: on })
    const r = await setMktItemInternal(x.id, on)
    if (!r.ok) {
      setItems(xs => xs.map(i => (i.id === x.id ? { ...i, internal: !on } : i)))
      return flash(r.reason)
    }
    flash(on ? `“${x.name || 'Item'}” is internal · not on the client’s PDF` : `“${x.name || 'Item'}” shows on the client’s PDF again`)
  }

  /** The list's own settings saved whole — put back when refused. */
  const savePrefs = async (key: 'icons' | 'columns', next: ListPrefs) => {
    const before = prefs
    setPrefs(() => next)
    const r = await saveMktListPrefs(key, key === 'icons' ? next.icons : next.columns)
    if (!r.ok) {
      setPrefs(() => before)
      flash(r.reason)
      return false
    }
    return true
  }
  const pickIcon = (cat: string, emoji: string) => {
    setIconFor(null)
    void savePrefs('icons', { ...prefs, icons: { ...prefs.icons, [cat]: emoji } })
  }

  const renameCat = async (from: string, typed: string, place: number) => {
    const to = typed.trim().replace(/\s+/g, ' ')
    setCatTyped(t => {
      const n = { ...t }
      delete n[place]
      return n
    })
    if (!to || to === from) return
    const r = await renameMktCatalogue(from, to)
    if (!r.ok) return flash(r.reason)
    setItems(xs => xs.map(x => (x.cat === from ? { ...x, cat: to } : x)))
    for (const [id, x] of saved.current) if (x.cat === from) saved.current.set(id, { ...x, cat: to })
    // Its icon goes with its name.
    if (prefs.icons[from]) {
      const icons = { ...prefs.icons, [to]: prefs.icons[from] }
      delete icons[from]
      void savePrefs('icons', { ...prefs, icons })
    }
  }

  // ── The built-in columns: internal / hidden ──
  const pref = (k: Head) => (k === 'item' || k === 'price' ? { internal: false, hidden: false } : prefs.columns[k])
  const headInternal = (k: Head) => (k === 'cost' || k === 'margin' ? true : pref(k).internal)
  const setHead = async (k: Head, patch: { internal?: boolean; hidden?: boolean }) => {
    setHeadMenu(null)
    if (k === 'item' || k === 'price') return
    const next = { ...prefs, columns: { ...prefs.columns, [k]: { ...prefs.columns[k], ...patch } } }
    const name = HEADS.find(h => h.key === k)?.name ?? k
    if (await savePrefs('columns', next)) {
      flash(patch.hidden ? `Removed the column ${name}` : patch.internal ? `${name} is internal · not on the client’s PDF` : `${name} shows on the client’s PDF again`)
    }
  }

  // ── The manager's own columns ──
  const setExtra = (id: string, col: string, v: ExtraValue | null) => {
    const x = live.current.find(i => i.id === id)
    if (!x) return
    const extra = { ...x.extra }
    if (v === null) delete extra[col]
    else extra[col] = v
    setItem(id, { extra })
  }
  const placeUnder = (el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    return { left: r.left, top: r.bottom + 4, above: r.top - 4 }
  }
  const openEditor = (id: string, el: HTMLElement) => setEditing(cur => (cur?.id === id ? null : { id, at: placeUnder(el) }))
  // + asks what the column holds first; the column is made with it, named after it ("Price (RM)", then "Price (RM) 2").
  const addColumn = async (el: HTMLElement, kind: ColumnKind) => {
    if (busy) return
    setBusy(true)
    setAdding(null)
    try {
      const base = COLUMN_KINDS.find(([k]) => k === kind)?.[1] ?? 'Column'
      let name = base
      for (let n = 2; columns.some(c => c.name.toLowerCase() === name.toLowerCase()) || BUILT_IN.includes(name.toLowerCase()); n++) name = `${base} ${n}`
      const r = await saveMktItemColumn(null, { name, kind })
      if (!r.ok) return flash(r.reason)
      setColumns(cs => [...cs, r.column])
      // Open its settings under where it lands (the head row grows by one column).
      requestAnimationFrame(() => {
        const head = el.parentElement
        const cell = head?.children[head.children.length - 2] as HTMLElement | undefined
        setEditing({ id: r.column.id, at: placeUnder(cell ?? el) })
      })
    } finally {
      setBusy(false)
    }
  }
  const saveColumn = async (c: ItemColumn, patch: Partial<ItemColumn>) => {
    setColumns(cs => cs.map(x => (x.id === c.id ? { ...x, ...patch, client: patch.inQuotes === false ? false : patch.client ?? x.client } : x)))
    const r = await saveMktItemColumn(c.id, patch)
    if (!r.ok) {
      setColumns(cs => cs.map(x => (x.id === c.id ? c : x)))
      return flash(r.reason)
    }
    setColumns(cs => cs.map(x => (x.id === c.id ? r.column : x)))
    // A kind changed or an option taken off cleared values: the Product List as the database has it now.
    if (r.book) {
      const fresh = r.book.items
      setItems(xs => xs.map(x => {
        const f = fresh.find(y => y.id === x.id)
        return f ? { ...x, extra: f.extra } : x
      }))
      for (const f of fresh) {
        const s = saved.current.get(f.id)
        if (s) saved.current.set(f.id, { ...s, extra: f.extra })
      }
    }
  }
  const orderColumns = async (next: ItemColumn[]) => {
    const before = columns
    setColumns(() => next)
    setEditing(null)
    const r = await orderMktItemColumns(next.map(c => c.id))
    if (!r.ok) {
      setColumns(() => before)
      flash(r.reason)
    }
  }
  const moveColumn = async (id: string, by: -1 | 1) => {
    const i = columns.findIndex(c => c.id === id)
    const j = i + by
    if (i < 0 || j < 0 || j >= columns.length) return
    const next = [...columns]
    ;[next[i], next[j]] = [next[j], next[i]]
    await orderColumns(next)
  }
  /** A column dropped on another: it takes that one's place. */
  const dropColumn = (id: string, onto: string) => {
    if (id === onto) return
    const next = columns.filter(c => c.id !== id)
    const moved = columns.find(c => c.id === id)
    const at = next.findIndex(c => c.id === onto)
    if (!moved || at < 0) return
    const from = columns.findIndex(c => c.id === id)
    next.splice(from < columns.findIndex(c => c.id === onto) ? at + 1 : at, 0, moved)
    void orderColumns(next)
  }
  const removeColumn = async (c: ItemColumn) => {
    setEditing(null)
    const r = await deleteMktItemColumn(c.id)
    if (!r.ok) return flash(r.reason)
    setColumns(cs => cs.filter(x => x.id !== c.id))
    const strip = (x: CatalogItem) => {
      if (x.extra[c.id] === undefined) return x
      const extra = { ...x.extra }
      delete extra[c.id]
      return { ...x, extra }
    }
    setItems(xs => xs.map(strip))
    for (const [id, x] of saved.current) saved.current.set(id, strip(x))
    flash(`Removed the column ${c.name}`)
  }
  const editCol = editing ? columns.find(c => c.id === editing.id) ?? null : null

  // The grid: the built-in columns not removed, then the manager's own (140px each), then +.
  const heads = HEADS.filter(h => !pref(h.key).hidden)
  const shown = (k: Head) => heads.some(h => h.key === k)
  const minWidth = heads.reduce((n, h) => n + (h.width.startsWith('minmax') ? Number(h.width.match(/\d+/)?.[0] ?? 100) : Number(h.width.replace('px', ''))), 0) + columns.length * 148 + 28 + 28 + heads.length * 8
  const grid = { gridTemplateColumns: `${heads.map(h => h.width).join(' ')}${columns.map(() => ' 140px').join('')} 28px`, minWidth }

  const cats = catalogues(items)
  const cq = norm(q)
  const groups = cats
    .map((cat, place) => ({ cat, place }))
    .map(g => ({ ...g, rows: items.filter(x => x.cat === g.cat && (!cq || norm([x.name, x.desc, x.remarks, g.cat, ...Object.values(x.extra).map(String)].join(' ')).includes(cq))) }))
    .filter(g => g.rows.length || !cq)
  const addCatalogue = () => {
    const n = catNew.trim()
    if (!n) return
    void addInCat(n)
    setCatNew('')
  }
  const jump = (cat: string) => cardRefs.current.get(cat)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const rowMenuItem = rowMenu ? items.find(x => x.id === rowMenu.id) ?? null : null
  const delItem = delFor ? items.find(x => x.id === delFor) ?? null : null

  return (
    <div>
      <div className={v2.toolbar}>
        <span className={v2.searchWrap}>
          <input type="search" className={`${v2.search} ${v2.plSearch}`} value={q} onChange={e => setQ(e.target.value)} placeholder="Search items" aria-label="Search items" />
        </span>
        <div className={v2.jumps} role="navigation" aria-label="Catalogues">
          {cats.map(c => (
            <button key={c} type="button" className={v2.jump} onClick={() => jump(c)}>
              <span aria-hidden="true">{catalogueIcon(prefs, c)}</span>{c}<span className={v2.segN}>{items.filter(x => x.cat === c).length}</span>
            </button>
          ))}
        </div>
        <span className={`${v2.allSaved}${saveState === 'saved' ? '' : ` ${v2.saving}`}`} aria-live="polite">
          {saveState === 'saved' ? 'All changes saved' : 'Saving…'}
        </span>
        <button type="button" className={v2.primary} onClick={() => void addInCat(cats[0] || 'Other')}>+ New item</button>
      </div>
      <div className={v2.catCards}>
        {groups.map(g => (
          <div key={g.place} className={v2.catCard} ref={el => { if (el) cardRefs.current.set(g.cat, el); else cardRefs.current.delete(g.cat) }}>
            <div className={v2.catHead}>
              <button type="button" className={v2.iconBtn} aria-label={`Icon for ${g.cat}`} aria-haspopup="dialog" aria-expanded={iconFor?.cat === g.cat}
                onClick={e => { const el = e.currentTarget; setIconFor(cur => (cur?.cat === g.cat ? null : { cat: g.cat, el })) }}>
                {catalogueIcon(prefs, g.cat)}<span className={v2.iconCaret} aria-hidden="true">▾</span>
              </button>
              <input
                className={v2.catName}
                value={catTyped[g.place] ?? g.cat}
                aria-label="Catalogue"
                maxLength={60}
                onChange={e => setCatTyped(t => ({ ...t, [g.place]: e.target.value }))}
                onBlur={e => void renameCat(g.cat, e.target.value, g.place)}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              />
              <span className={v2.catCount}>{g.rows.length} item{g.rows.length === 1 ? '' : 's'}</span>
            </div>
            <div className={qs.scrollX}>
              <div className={`${v2.plRow} ${v2.plHead}`} style={grid}>
                {heads.map(h => (
                  <span key={h.key} className={`${v2.plHeadCell}${h.right ? ` ${v2.plHeadR}` : ''}`}
                    onContextMenu={e => { e.preventDefault(); setEditing(null); setAdding(null); setHeadMenu({ key: h.key, at: menuAt(e) }) }}>
                    {h.name}{headInternal(h.key) ? <Lock /> : null}
                  </span>
                ))}
                {columns.map(c => (
                  <button key={c.id} type="button" title={columnTitle(c)} aria-haspopup="dialog" aria-expanded={editing?.id === c.id}
                    className={`${qs.colHead}${dragCol?.id === c.id ? ` ${qs.colDragging}` : ''}${dragCol && dragCol.over === c.id && dragCol.id !== c.id ? ` ${columns.findIndex(y => y.id === dragCol.id) < columns.findIndex(y => y.id === c.id) ? qs.colDropAfter : qs.colDropAt}` : ''}`}
                    draggable
                    onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', c.id); setEditing(null); setDragCol({ id: c.id, over: null }) }}
                    onDragOver={e => { if (!dragCol) return; e.preventDefault(); if (dragCol.over !== c.id) setDragCol({ ...dragCol, over: c.id }) }}
                    onDrop={e => { e.preventDefault(); if (dragCol) dropColumn(dragCol.id, c.id); setDragCol(null) }}
                    onDragEnd={() => setDragCol(null)}
                    onContextMenu={e => { e.preventDefault(); setEditing(null); setAdding(null); setColMenu({ id: c.id, x: e.clientX, y: e.clientY }) }}
                    onClick={e => openEditor(c.id, e.currentTarget)}>
                    <span className={qs.colHeadName}>{c.name}</span>{!c.client ? <span title={LOCK_TITLE} style={{ marginLeft: 4 }}>🔒</span> : null}
                  </button>
                ))}
                <button type="button" className={qs.addCol} title="Add a column" aria-label="Add a column" disabled={busy || columns.length >= 20}
                  aria-haspopup="menu" aria-expanded={!!adding}
                  onClick={e => { const el = e.currentTarget; setEditing(null); setAdding(cur => (cur ? null : { el, at: placeUnder(el) })) }}>+</button>
              </div>
              {g.rows.map((x, xi) => {
                // "Same as above" (the user, 2026-11-13): the nearest row above in this catalogue with a workflow.
                const above = g.rows.slice(0, xi).reverse().find(r => r.wf)?.wf ?? null
                const aboveWf = above && above !== x.wf ? workflows.find(w => w.id === above) ?? null : null
                const m = itemMargin(x.price, x.cost)
                return (
                  <div key={x.id} className={`${v2.plRow}${x.internal ? ` ${v2.plInternal}` : ''}`} style={grid}
                    onBlur={() => { if (timers.current.has(x.id)) flushItem(x.id) }}
                    onContextMenu={e => {
                      if (e.target instanceof HTMLInputElement && e.target.selectionStart !== e.target.selectionEnd) return
                      e.preventDefault()
                      setRowMenu({ id: x.id, at: menuAt(e) })
                    }}>
                    <span className={v2.nameCell}>
                      {x.internal ? <span className={v2.intChip} title={LOCK_TITLE}>🔒 Internal</span> : null}
                      <input className={`${v2.flat} ${v2.flatName}`} value={x.name} maxLength={60} placeholder="Item name" aria-label="Item name" onChange={e => setItem(x.id, { name: e.target.value })} />
                    </span>
                    {shown('desc') ? <input className={v2.flat} value={x.desc} maxLength={200} placeholder="What the client gets" aria-label="Description" onChange={e => setItem(x.id, { desc: e.target.value })} /> : null}
                    <span className={v2.money}>
                      <span className={v2.rmTag}>RM</span>
                      <MoneyInput className={v2.moneyIn} value={x.price} placeholder="0" label="Price" onChange={v => setItem(x.id, { price: v })} />
                    </span>
                    {shown('cost') ? (
                      <span className={`${v2.money} ${v2.moneyCost}`}>
                        <span className={v2.rmTag}>RM</span>
                        <MoneyInput className={v2.moneyIn} value={x.cost} placeholder="—" label="Cost" onChange={v => setItem(x.id, { cost: v })} />
                      </span>
                    ) : null}
                    {shown('margin') ? <span className={`${v2.marginCell}${m != null && m < MARGIN_LOW ? ` ${v2.red}` : ''}`}>{m == null ? '—' : `${m}%`}</span> : null}
                    {shown('days') ? (
                      <span className={v2.money}>
                        <input
                          className={v2.daysIn}
                          inputMode="numeric"
                          value={x.days ?? ''}
                          placeholder="—"
                          aria-label="Est. days"
                          onChange={e => {
                            const t = e.target.value.replace(/\D/g, '').slice(0, 3)
                            setItem(x.id, { days: t ? Math.min(365, Math.max(1, Number(t))) : null })
                          }}
                        />
                        <span className={v2.rmTag}>d</span>
                      </span>
                    ) : null}
                    {shown('wf') ? (
                      <span className={`${v2.wfFlat}${x.wf ? '' : ` ${v2.wfFlatNone}`}`}>
                        <select className={v2.wfSel} style={{ paddingRight: 24 }} value={x.wf ?? ''} aria-label="Workflow" title={workflows.find(w => w.id === x.wf) ? wfLabel(workflows.find(w => w.id === x.wf) as ProductWorkflowOption) : undefined}
                          onChange={e => setItem(x.id, { wf: e.target.value === '__above' ? above : e.target.value || null })}>
                          <option value="">{x.wf ? 'No workflow' : 'Link a workflow…'}</option>
                          {aboveWf ? <option value="__above">↑ Same as above · {wfLabel(aboveWf)}</option> : null}
                          {workflows.map(w => <option key={w.id} value={w.id}>{wfLabel(w)}</option>)}
                        </select>
                        <span className={v2.wfCaret} aria-hidden="true">▾</span>
                      </span>
                    ) : null}
                    {shown('remarks') ? <input className={v2.flat} value={x.remarks} maxLength={200} placeholder="—" aria-label="Remarks" onChange={e => setItem(x.id, { remarks: e.target.value })} /> : null}
                    {columns.map(c => (
                      <ExtraCell key={c.id} column={c} value={x.extra[c.id]} onChange={v => setExtra(x.id, c.id, v)} />
                    ))}
                    <button type="button" className={v2.plX} title="Delete item…" aria-label="Delete item" onClick={() => setDelFor(x.id)}>×</button>
                  </div>
                )
              })}
              <button type="button" className={v2.plAdd} onClick={() => void addInCat(g.cat)}>+ Add item</button>
            </div>
          </div>
        ))}
        {groups.every(g => !g.rows.length) ? <div className={qs.empty}>{items.length ? 'Nothing found' : 'No items yet — add a catalogue below, then its items'}</div> : null}
        <div className={v2.newCatalogue}>
          <span className={v2.muted} aria-hidden="true">+</span>
          <input className={v2.newCatalogueIn} value={catNew} maxLength={60} placeholder="New catalogue" aria-label="New catalogue"
            onChange={e => setCatNew(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addCatalogue() }} />
          {catNew.trim() ? <button type="button" className={`${v2.ghost} ${v2.ghostSm}`} onClick={addCatalogue}>+ Add catalogue</button> : null}
        </div>
      </div>
      {iconFor ? (
        <IconPicker anchor={iconFor.el} catalogue={iconFor.cat} value={catalogueIcon(prefs, iconFor.cat)} onPick={e => pickIcon(iconFor.cat, e)} onClose={() => setIconFor(null)} />
      ) : null}
      {rowMenu && rowMenuItem ? (
        <ItemMenu item={rowMenuItem} at={rowMenu.at} onClose={() => setRowMenu(null)} onInternal={() => void toggleInternal(rowMenuItem)}
          onDelete={() => { setRowMenu(null); setDelFor(rowMenuItem.id) }} />
      ) : null}
      {headMenu ? (() => {
        const h = HEADS.find(x => x.key === headMenu.key)
        if (!h) return null
        return (
          <HeadMenu name={h.name} at={headMenu.at} internal={headInternal(h.key)} lock={h.lock} required={!!h.required}
            onClose={() => setHeadMenu(null)}
            onInternal={() => void setHead(h.key, { internal: !pref(h.key).internal })}
            onDelete={() => void setHead(h.key, { hidden: true })} />
        )
      })() : null}
      {delItem ? (
        <DeleteItem item={delItem} impact={deleteImpact(delItem, products, quotes)} busy={busy} onKeep={() => setDelFor(null)} onDelete={() => void remove(delItem)} />
      ) : null}
      {colMenu && columns.some(c => c.id === colMenu.id) ? (() => {
        const c = columns.find(x => x.id === colMenu.id) as ItemColumn
        return (
          <ColumnMenu
            column={c}
            used={items.filter(x => x.extra[c.id] !== undefined).length}
            x={colMenu.x}
            y={colMenu.y}
            first={columns[0]?.id === c.id}
            last={columns[columns.length - 1]?.id === c.id}
            onInternal={() => { setColMenu(null); void saveColumn(c, c.client ? { client: false } : { client: true, inQuotes: true }) }}
            onSettings={() => { setColMenu(null); setEditing({ id: c.id, at: { left: colMenu.x, top: colMenu.y + 4 } }) }}
            onMove={by => { setColMenu(null); void moveColumn(c.id, by) }}
            onDelete={() => { setColMenu(null); void removeColumn(c) }}
            onClose={() => setColMenu(null)}
          />
        )
      })() : null}
      {adding ? <ColumnKindMenu at={adding.at} anchor={adding.el} onPick={k => void addColumn(adding.el, k)} onClose={() => setAdding(null)} /> : null}
      {editCol && editing ? (
        <ColumnEditor
          key={editCol.id}
          column={editCol}
          used={items.filter(x => x.extra[editCol.id] !== undefined).length}
          at={editing.at}
          first={columns[0]?.id === editCol.id}
          last={columns[columns.length - 1]?.id === editCol.id}
          onSave={patch => void saveColumn(editCol, patch)}
          onMove={by => void moveColumn(editCol.id, by)}
          onDelete={() => void removeColumn(editCol)}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  )
}

/** A column's tooltip: what it holds and where it follows the item. */
function columnTitle(c: ItemColumn): string {
  const where = [c.inProducts ? 'products' : '', c.inQuotes ? 'quotations' : '', c.client ? 'the client’s PDF' : ''].filter(Boolean)
  return `${COLUMN_KINDS.find(([k]) => k === c.kind)?.[1] ?? 'Text'}${where.length ? ` · shown in ${where.join(', ')}` : ' · on the Product List only'}`
}
