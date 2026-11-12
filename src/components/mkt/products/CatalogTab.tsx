'use client'

import { useEffect, useRef, useState } from 'react'
import { deleteMktItem, deleteMktItemColumn, orderMktItemColumns, renameMktCatalogue, saveMktItem, saveMktItemColumn } from '@/lib/marketing/quote-actions'
import { catalogues, COLUMN_KINDS, itemPatch, norm, usedIn, type CatalogItem, type ColumnKind, type ExtraValue, type ItemColumn } from '@/lib/marketing/catalog'
import ColumnEditor from './ColumnEditor'
import ColumnKindMenu from './ColumnKindMenu'
import ExtraCell from './ExtraCell'
import type { ProductBook, ProductWorkflowOption } from '@/lib/marketing/products'
import type { QuoteBook } from '@/lib/marketing/quotes'
import MoneyInput from './MoneyInput'
import qs from './quotes.module.css'

// The Product Builder's 📋 Product List tab (`Product Builder.dc.html`): every sellable item, by catalogue — its name,
// description, price, internal cost 🔒, est. days, default workflow and remarks, each a flat input saved as it is typed.
// Renaming an item renames it in every product and quotation (the database does it); an item a product or a quotation
// uses is never deleted. The manager's (Marketing · Manage).

const wfLabel = (w: ProductWorkflowOption) => `${w.action} · ${w.tname} · ${w.version ? `v${w.version}` : 'draft'}`

// The list's own heads — a column of the manager's is never called one of them (`mkt_item_column_save` refuses it too).
const BUILT_IN = ['item', 'description', 'price', 'cost', 'est. days', 'workflow', 'remarks']

const BASE_COLS = 'minmax(150px, 1.1fr) minmax(170px, 1.5fr) 104px 96px 76px minmax(200px, 1.3fr) minmax(150px, 1.2fr)'

export default function CatalogTab({ items, setItems, columns, setColumns, products, quotes, workflows, onRenamed, flash }: {
  items: CatalogItem[]
  setItems: (fn: (items: CatalogItem[]) => CatalogItem[]) => void
  /** The manager's own columns, in their order. */
  columns: ItemColumn[]
  setColumns: (fn: (columns: ItemColumn[]) => ItemColumn[]) => void
  products: ProductBook['products']
  quotes: QuoteBook['quotes']
  workflows: ProductWorkflowOption[]
  /** An item renamed: both books as the database now has them (its products' drafts and quotations renamed). */
  onRenamed: (products: ProductBook | null, book: QuoteBook | null) => void
  flash: (words: string) => void
}) {
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('All')
  const [catNew, setCatNew] = useState('')
  // A catalogue's name as it is typed (keyed by its place, so its box keeps the focus) — saved on leaving the box.
  const [catTyped, setCatTyped] = useState<Record<number, string>>({})
  const [editing, setEditing] = useState<{ id: string; at: { left: number; top: number; above?: number } } | null>(null)
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState<{ el: HTMLElement; at: { left: number; top: number; above?: number } } | null>(null)
  const saved = useRef(new Map<string, CatalogItem>(items.map(i => [i.id, i])))
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const chains = useRef(new Map<string, Promise<void>>())
  const live = useRef(items)
  live.current = items

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
      const r = await saveMktItem(id, patch)
      if (!r.ok) {
        flash(r.reason)
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

  const setItem = (id: string, patch: Partial<CatalogItem>) => {
    setItems(xs => xs.map(x => (x.id === id ? { ...x, ...patch } : x)))
    const t = timers.current.get(id)
    if (t) clearTimeout(t)
    timers.current.set(id, setTimeout(() => flushItem(id), 700))
  }

  const addInCat = async (cat: string) => {
    const r = await saveMktItem(null, { cat })
    if (!r.ok) return flash(r.reason)
    saved.current.set(r.item.id, r.item)
    setItems(xs => [...xs, r.item])
  }

  const remove = async (x: CatalogItem) => {
    const u = usedIn(x, products, quotes)
    if (u.pc || u.qc) return flash(`“${x.name}” is used in ${u.text} — remove it there first`)
    const r = await deleteMktItem(x.id)
    if (!r.ok) return flash(r.reason)
    setItems(xs => xs.filter(i => i.id !== x.id))
    flash(`Removed ${x.name || 'item'}`)
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
    if (filter === from) setFilter(to)
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
  const moveColumn = async (id: string, by: -1 | 1) => {
    const i = columns.findIndex(c => c.id === id)
    const j = i + by
    if (i < 0 || j < 0 || j >= columns.length) return
    const next = [...columns]
    ;[next[i], next[j]] = [next[j], next[i]]
    setColumns(() => next)
    setEditing(null)
    const r = await orderMktItemColumns(next.map(c => c.id))
    if (!r.ok) {
      setColumns(() => columns)
      flash(r.reason)
    }
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
  // The table's grid: the design's seven columns, then the manager's own (140px each), then ×.
  const grid = columns.length
    ? { gridTemplateColumns: `${BASE_COLS} ${columns.map(() => '140px').join(' ')} 24px`, minWidth: 1060 + columns.length * 148 }
    : undefined

  const cats = catalogues(items)
  const cq = norm(q)
  const groups = cats
    .map((cat, place) => ({ cat, place }))
    .filter(g => filter === 'All' || filter === g.cat)
    .map(g => ({ ...g, rows: items.filter(x => x.cat === g.cat && (!cq || norm([x.name, x.desc, x.remarks, g.cat, ...Object.values(x.extra).map(String)].join(' ')).includes(cq))) }))
    .filter(g => g.rows.length || !cq)
  const addCatalogue = () => {
    const n = catNew.trim()
    if (!n) return
    void addInCat(n)
    setCatNew('')
    setFilter('All')
  }

  return (
    <div>
      <div className={qs.head}>
        <span className={qs.headIcon} aria-hidden="true">📋</span>
        <span className={qs.title}>Product List</span>
        <div className={qs.seg} style={{ marginLeft: 8 }} role="tablist" aria-label="By catalogue">
          {['All', ...cats].map(k => (
            <button key={k} type="button" role="tab" aria-selected={filter === k} className={`${qs.segBtn}${filter === k ? ` ${qs.segOn}` : ''}`} onClick={() => setFilter(k)}>
              <span className={qs.lbl} data-t={k}>{k}</span>
              <span className={qs.n}>{k === 'All' ? items.length : items.filter(x => x.cat === k).length}</span>
            </button>
          ))}
        </div>
        <span className={qs.grow} />
        <input className={qs.search} value={q} onChange={e => setQ(e.target.value)} placeholder="Search items" aria-label="Search items" />
        <button type="button" className={qs.primary} onClick={() => void addInCat(filter !== 'All' ? filter : cats[0] || 'Other')}>+ New item</button>
      </div>
      <div className={qs.note}>The menu every product and quotation picks its items from. An item typed into a product or a quotation is added here, and renaming an item here renames it everywhere.</div>
      <div className={qs.cats}>
        {groups.map(g => (
          <div key={g.place} className={qs.catCard}>
            <div className={qs.catHead}>
              <input
                className={qs.catName}
                value={catTyped[g.place] ?? g.cat}
                aria-label="Catalogue"
                maxLength={60}
                onChange={e => setCatTyped(t => ({ ...t, [g.place]: e.target.value }))}
                onBlur={e => void renameCat(g.cat, e.target.value, g.place)}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              />
              <span className={qs.catCount}>{g.rows.length} item{g.rows.length === 1 ? '' : 's'}</span>
            </div>
            <div className={qs.scrollX}>
              <div className={`${qs.cRow} ${qs.cHead}`} style={grid}>
                <span>Item</span><span>Description</span><span>Price</span><span>Cost 🔒</span><span>Est. days</span><span>Workflow</span><span>Remarks</span>
                {columns.map(c => (
                  <button key={c.id} type="button" className={qs.colHead} title={columnTitle(c)} aria-haspopup="dialog" aria-expanded={editing?.id === c.id}
                    onClick={e => openEditor(c.id, e.currentTarget)}>
                    <span className={qs.colHeadName}>{c.name}</span>
                  </button>
                ))}
                <button type="button" className={qs.addCol} title="Add a column" aria-label="Add a column" disabled={busy || columns.length >= 20}
                  aria-haspopup="menu" aria-expanded={!!adding}
                  onClick={e => { const el = e.currentTarget; setEditing(null); setAdding(cur => (cur ? null : { el, at: placeUnder(el) })) }}>+</button>
              </div>
              {g.rows.map(x => {
                const u = usedIn(x, products, quotes)
                return (
                  <div key={x.id} className={qs.cRow} style={grid}>
                    <input className={`${qs.flat} ${qs.flatName}`} value={x.name} maxLength={60} placeholder="Item name" aria-label="Item name" onChange={e => setItem(x.id, { name: e.target.value })} />
                    <input className={qs.flat} value={x.desc} maxLength={200} placeholder="What the client gets" aria-label="Description" onChange={e => setItem(x.id, { desc: e.target.value })} />
                    <span className={qs.rmBox}>
                      <span className={qs.rm}>RM</span>
                      <MoneyInput className={qs.rmIn} value={x.price} placeholder="0" label="Price" onChange={v => setItem(x.id, { price: v })} />
                    </span>
                    <span className={`${qs.rmBox} ${qs.rmBoxCost}`}>
                      <span className={qs.rm}>RM</span>
                      <MoneyInput className={qs.rmIn} value={x.cost} placeholder="—" label="Cost" onChange={v => setItem(x.id, { cost: v })} />
                    </span>
                    <span className={`${qs.rmBox} ${qs.rmBoxDays}`}>
                      <input
                        className={`${qs.rmIn} ${qs.rmInR}`}
                        inputMode="numeric"
                        value={x.days ?? ''}
                        placeholder="—"
                        aria-label="Est. days"
                        onChange={e => {
                          const t = e.target.value.replace(/\D/g, '').slice(0, 3)
                          setItem(x.id, { days: t ? Math.min(365, Math.max(1, Number(t))) : null })
                        }}
                      />
                      <span className={qs.rm}>d</span>
                    </span>
                    <span style={{ display: 'flex', minWidth: 0 }}>
                      <select className={`${qs.cellSel}${x.wf ? '' : ` ${qs.cellSelMiss}`}`} value={x.wf ?? ''} aria-label="Workflow" onChange={e => setItem(x.id, { wf: e.target.value || null })}>
                        <option value="">Link a workflow…</option>
                        {workflows.map(w => <option key={w.id} value={w.id}>{wfLabel(w)}</option>)}
                      </select>
                    </span>
                    <input className={qs.flat} value={x.remarks} maxLength={200} placeholder="—" aria-label="Remarks" onChange={e => setItem(x.id, { remarks: e.target.value })} />
                    {columns.map(c => (
                      <ExtraCell key={c.id} column={c} value={x.extra[c.id]} onChange={v => setExtra(x.id, c.id, v)} />
                    ))}
                    <button type="button" className={qs.del} title={u.text} aria-label="Remove item" onClick={() => void remove(x)}>×</button>
                  </div>
                )
              })}
              <button type="button" className={qs.addRow} onClick={() => void addInCat(g.cat)}>+ Add item</button>
            </div>
          </div>
        ))}
        {groups.every(g => !g.rows.length) ? <div className={qs.empty}>{items.length ? 'Nothing found' : 'No items yet — add a catalogue below, then its items'}</div> : null}
        <div className={qs.newCat}>
          <input className={qs.newCatIn} value={catNew} maxLength={60} placeholder="New catalogue, e.g. Photography, Events" aria-label="New catalogue"
            onChange={e => setCatNew(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addCatalogue() }} />
          <button type="button" className={`${qs.newCatBtn}${catNew.trim() ? '' : ` ${qs.faded}`}`} onClick={addCatalogue}>+ Add catalogue</button>
        </div>
      </div>
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
