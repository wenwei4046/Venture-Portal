'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { deleteMktProduct, publishMktProduct, saveMktProduct, saveMktWorkflow, setMktProductStatus } from '@/lib/marketing/actions'
import { duplicateMktProduct, setMktProductStatusTo } from '@/lib/marketing/quote-actions'
import { extrasOf, itemNamed, norm, pickerGroups, type CatalogItem, type ItemColumn, type ItemFacts } from '@/lib/marketing/catalog'
import {
  editOfProduct, groupSum, itemsSum, itemsSummary, margin, newGroup, newItem, pricedOf, productDiff, productPatch, productProblems, productSections, workflowAbove,
  type Product, type ProductBook, type ProductEdit, type ProductGroup, type ProductItem, type ProductStatus, type ProductWorkflowOption,
} from '@/lib/marketing/products'
import { dmy, rm } from '@/lib/marketing/quotes'
import { firstWfStage, wfStagesPayload } from '@/lib/marketing/workflows'
import DaysCell from './DaysCell'
import DeletePackage from './DeletePackage'
import Lock from './Lock'
import PackageCard, { MARGIN_LOW, StatusPill } from './PackageCard'
import PackageMenu from './PackageMenu'
import { menuAt, type MenuAt } from './PopMenu'
import v2 from './v2.module.css'
import ExtraCell from './ExtraCell'
import MoneyInput from './MoneyInput'
import PublishDiff from './PublishDiff'
import pb from './products.module.css'
import { pickDate } from './pick-date'
import qs from './quotes.module.css'

// The Product Builder's 📦 Products tab (`Product Builder.dc.html`; the manager's — Marketing · Manage, and so are its
// prices): the products (All · Active · Draft · Retired, + New product), each card's ⧉ Duplicate and its right-click
// menu (its status — Active only once published, else the page asks to publish it first — Open, ⧉ Duplicate); a
// product's editor — Basics, its Items (one table for every category, each item picked from the Product List: its
// price and workflow filled in, its days read from there; a name not on it is added to it), its intake minutes template,
// Pricing (list price, internal cost, the margin, the revenue account Finance's import posts its billing to), Publish.
// A draft is saved as it is typed — only what changed, never over somebody else's save (as the other builders').

type SaveState = { state: 'saved' } | { state: 'saving' } | { state: 'error'; reason: string; stale: boolean }
type Filter = 'all' | ProductStatus

const STATUS_LABEL: Record<ProductStatus, string> = { draft: 'Draft', active: 'Active', retired: 'Retired' }
const wfLabel = (w: ProductWorkflowOption) => `${w.action} · ${w.tname} · ${w.version ? `v${w.version}` : 'draft'}`
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

interface PickRect { left: number; top: number | null; bottom: number | null; max: number }

export default function ProductBuilder({ book, setBook, first, onOpen, items, columns = [], onAddItem, onItemFacts = () => {}, onQuote, onPublished, draftQuotesWith = () => 0, flash }: {
  book: ProductBook
  setBook: Dispatch<SetStateAction<ProductBook>>
  /** The product open when the tab mounts. */
  first: string | null
  onOpen: (id: string | null) => void
  /** The Product List — what every item is picked from. */
  items: CatalogItem[]
  /** The manager's own Product List columns — those that follow products show in the Items table, read from the list. */
  columns?: ItemColumn[]
  /** A name typed that is not on the Product List: added there, under its category. */
  onAddItem: (name: string, cat: string, price: number | null, wf: string | null) => void
  /** An item's est. days or one of its columns set here: the Product List's item itself (added first when new). */
  onItemFacts?: (name: string, cat: string, price: number | null, wf: string | null, facts: ItemFacts) => void
  /** 📄 New quotation with this product. */
  onQuote: (p: Product) => void
  /** A product published or its status changed — Quotations' packages follow. */
  onPublished: () => void
  /** How many draft quotations hold a package — what deleting it takes them out of. */
  draftQuotesWith?: (productId: string) => number
  flash: (words: string) => void
}) {
  const start = (first ? book.products.find(p => p.id === first) : undefined) ?? null
  const [filter, setFilter] = useState<Filter>('all')
  const [selId, setSelId] = useState<string | null>(start?.id ?? null)
  const [edit, setEdit] = useState<ProductEdit | null>(start ? editOfProduct(start) : null)
  const [save, setSave] = useState<SaveState>({ state: 'saved' })
  const [busy, setBusy] = useState(false)
  const [untilOn, setUntilOn] = useState(false)
  const [diffOpen, setDiffOpen] = useState(false)
  const [catDraft, setCatDraft] = useState('')
  // An item row just added by "+ Add item": its name box takes the focus, which opens the Product List.
  const [focusKey, setFocusKey] = useState<string | null>(null)
  const newCatRef = useRef<HTMLInputElement | null>(null)
  const [ctx, setCtx] = useState<{ id: string; at: MenuAt; fromButton: boolean } | null>(null)
  const [delFor, setDelFor] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [mustPublish, setMustPublish] = useState<string | null>(null)
  const [pickFor, setPickFor] = useState<string | null>(null)
  const [pickRect, setPickRect] = useState<PickRect | null>(null)

  const selRef = useRef<string | null>(start?.id ?? null)
  const editRef = useRef<ProductEdit | null>(start ? editOfProduct(start) : null)
  const savedRef = useRef<ProductEdit | null>(start ? editOfProduct(start) : null)
  const revRef = useRef<number>(start?.rev ?? 1)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chain = useRef<Promise<boolean>>(Promise.resolve(true))
  const menuRef = useRef<HTMLDivElement | null>(null)

  const flush = useCallback((): Promise<boolean> => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    const run = chain.current.then(async () => {
      const id = selRef.current
      const now = editRef.current
      const saved = savedRef.current
      if (!id || !now || !saved) return true
      const patch = productPatch(saved, now)
      // Nothing left to send (a change and its undo before the save went): what is on screen is what is kept.
      if (!patch) {
        setSave(s => (s.state === 'error' ? s : { state: 'saved' }))
        return true
      }
      setSave({ state: 'saving' })
      const r = await saveMktProduct(id, revRef.current, patch)
      if (!r.ok) {
        setSave({ state: 'error', reason: r.reason, stale: /since you opened it/.test(r.reason) })
        return false
      }
      revRef.current = r.rev
      savedRef.current = now
      setBook(b => ({ ...b, products: b.products.map(p => (p.id === id ? { ...p, ...now, name: now.name.trim(), rev: r.rev, changed: true } : p)) }))
      if (editRef.current === now) setSave({ state: 'saved' })
      return true
    })
    chain.current = run.catch(() => false)
    return run
  }, [setBook])

  const sel = book.products.find(p => p.id === selId) ?? null
  const ro = sel?.status === 'retired'

  // A product renamed on the Product List moves its draft count: the editor takes the new draft while nothing of its own
  // waits to be saved (else its next save would be refused as somebody else's).
  useEffect(() => {
    if (!sel || timer.current || sel.rev === revRef.current) return
    const saved = savedRef.current
    const now = editRef.current
    if (saved && now && productPatch(saved, now)) return
    const e = editOfProduct(sel)
    revRef.current = sel.rev
    savedRef.current = e
    editRef.current = e
    setEdit(e)
  }, [sel])

  // From the draft as it now is — a change made after an await (a workflow made for an item) keeps the ones before it.
  const change = (patch: Partial<ProductEdit>) => {
    const base = editRef.current
    if (!base || ro) return
    const next = { ...base, ...patch }
    editRef.current = next
    setEdit(next)
    if (save.state === 'error' && save.stale) return
    setSave({ state: 'saving' })
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void flush(), 700)
  }

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (timer.current || (savedRef.current && editRef.current && productPatch(savedRef.current, editRef.current))) e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => {
      window.removeEventListener('beforeunload', warn)
      if (timer.current) void flush()
    }
  }, [flush])

  // The item picker floats over the page (position: fixed) and closes on a scroll or a resize — not its own scroll.
  useEffect(() => {
    if (!pickFor) return
    const off = (e: Event) => {
      if (e.type === 'scroll' && menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return
      setPickFor(null)
    }
    document.addEventListener('scroll', off, true)
    window.addEventListener('resize', off)
    return () => {
      document.removeEventListener('scroll', off, true)
      window.removeEventListener('resize', off)
    }
  }, [pickFor])

  const scrollTop = () => document.querySelector<HTMLElement>('[data-mkt-own]')?.scrollTo({ top: 0 })

  const open = async (id: string | null, from: Product[] = book.products) => {
    if (id === selRef.current) return
    if (!(await flush())) {
      flash('This product is not saved — reload before opening another')
      return
    }
    const p = id ? from.find(x => x.id === id) ?? null : null
    const e = p ? editOfProduct(p) : null
    selRef.current = p?.id ?? null
    editRef.current = e
    savedRef.current = e
    revRef.current = p?.rev ?? 1
    setSelId(p?.id ?? null)
    setEdit(e)
    setSave({ state: 'saved' })
    setCatDraft('')
    setPickFor(null)
    setUntilOn(false)
    setDiffOpen(false)
    onOpen(p?.id ?? null)
    scrollTop()
  }

  const newProduct = async () => {
    if (busy) return
    setBusy(true)
    try {
      const r = await saveMktProduct(null, null, { kind: 'one' })
      if (!r.ok) return flash(r.reason)
      const products = r.book?.products ?? book.products
      if (r.book) setBook(r.book)
      await open(r.id, products)
    } finally {
      setBusy(false)
    }
  }

  const duplicate = async (p: Product) => {
    if (busy) return
    setBusy(true)
    try {
      if (p.id === selRef.current && !(await flush())) return
      const r = await duplicateMktProduct(p.id)
      if (!r.ok) return flash(r.reason)
      const products = r.book?.products ?? book.products
      if (r.book) setBook(r.book)
      setFilter('all')
      await open(r.id, products)
      flash(`Duplicated ${p.name.trim() || p.code} — a new draft`)
    } finally {
      setBusy(false)
    }
  }

  /** The right-click menu's status: at once, with a toast. Active needs a version published — else the page asks. */
  const setStatusTo = async (p: Product, to: ProductStatus) => {
    setCtx(null)
    if (p.status === to || busy) return
    if (to === 'active' && p.version === 0) {
      setMustPublish(p.id)
      return
    }
    setBusy(true)
    try {
      if (p.id === selRef.current && !(await flush())) return
      const r = await setMktProductStatusTo(p.id, to)
      if (!r.ok) return flash(r.reason)
      if (r.book) setBook(r.book)
      onPublished()
      const name = p.name.trim() || p.code
      flash(to === 'retired' ? `${name} retired · ${plural(p.live, 'running project')} keep v${p.version}` : to === 'active' ? `${name} is active` : `${name} moved to draft`)
    } finally {
      setBusy(false)
    }
  }

  // ── The editor's parts ──
  const groups = edit?.groups ?? []
  const setGroups = (fn: (gs: ProductGroup[]) => ProductGroup[]) => change({ groups: fn(editRef.current?.groups ?? []) })
  const setGroup = (gi: number, fn: (g: ProductGroup) => ProductGroup) => setGroups(gs => gs.map((g, i) => (i === gi ? fn(g) : g)))
  const setItem = (gi: number, ii: number, patch: Partial<ProductItem>) =>
    setGroup(gi, g => ({ ...g, items: g.items.map((it, j) => (j === ii ? { ...it, ...patch } : it)) }))

  // + New workflow: the item's Standard template, made (or the one there already) and linked.
  const newWorkflowFor = async (gi: number, ii: number) => {
    if (!sel || !edit || busy) return
    const action = groups[gi]?.items[ii]?.name.trim() || 'New action'
    const had = book.workflows.find(w => w.action.toLowerCase() === action.toLowerCase() && w.tname.toLowerCase() === 'standard')
    if (had) {
      setItem(gi, ii, { workflow: had.id })
      return flash(`Linked “${had.action} · ${had.tname}”`)
    }
    setBusy(true)
    try {
      const r = await saveMktWorkflow(null, null, {
        action, tname: 'Standard', note: `Used by “${action}” in ${edit.name.trim() || 'a new product'}`, stages: wfStagesPayload([firstWfStage(action)]),
      })
      if (!r.ok) return flash(r.reason)
      const made: ProductWorkflowOption = { id: r.id, action, tname: 'Standard', version: 0, stages: 1, days: 2, pic: 1 }
      setBook(b => ({ ...b, workflows: [...b.workflows, made] }))
      setItem(gi, ii, { workflow: r.id })
      flash(`“${action} · Standard” made — set it up and publish it in the Workflow Builder`)
    } finally {
      setBusy(false)
    }
  }

  const publishProduct = async (p: Product, rev: number) => {
    const r = await publishMktProduct(p.id, rev)
    if (!r.ok) {
      flash(r.reason)
      return false
    }
    setBook(b => r.book ?? { ...b, products: b.products.map(x => (x.id === p.id ? { ...x, version: r.version, status: 'active', changed: false, live: r.live } : x)) })
    if (p.id === selRef.current) {
      const fresh = r.book?.products.find(x => x.id === p.id)
      if (fresh) revRef.current = fresh.rev
    }
    onPublished()
    flash(`Published ${p.name.trim()} v${r.version} · effective ${dmy(r.effectiveFrom)}`)
    return true
  }

  /** The draft takes the items' sums when they differ from what it holds. */
  const syncPricing = () => {
    const cur = editRef.current
    if (!cur || ro) return
    const p = pricedOf(cur.groups, items)
    if (p.price !== cur.price || p.cost !== cur.cost) change({ price: p.price, cost: p.cost })
  }
  /** Publish v(n+1) opens the diff (v2 §3) once the draft, its sums with it, is saved. */
  const askPublish = async () => {
    if (!sel || !edit || busy) return
    syncPricing()
    if (!(await flush())) return
    setDiffOpen(true)
  }
  const publish = async () => {
    if (!sel || !edit || busy) return
    setBusy(true)
    try {
      if (!(await flush())) return
      if (await publishProduct({ ...sel, ...(editRef.current ?? edit) }, revRef.current)) setDiffOpen(false)
    } finally {
      setBusy(false)
    }
  }
  const setStatus = async (to: 'retire' | 'reactivate') => {
    if (!sel || busy) return
    setBusy(true)
    try {
      if (to === 'retire' && !(await flush())) return
      const r = await setMktProductStatus(sel.id, to)
      if (!r.ok) return flash(r.reason)
      setBook(b => r.book ?? { ...b, products: b.products.map(p => (p.id === sel.id ? { ...p, status: r.status, retiredOn: r.retiredOn, live: r.live } : p)) })
      onPublished()
      flash(to === 'retire' ? `${sel.name} retired · ${r.live} running project${r.live === 1 ? '' : 's'} keep${r.live === 1 ? 's' : ''} v${sel.version}` : `${sel.name} is active again`)
    } finally {
      setBusy(false)
    }
  }
  const saveDraft = async () => {
    syncPricing()
    if (await flush()) flash('Draft saved')
  }
  /** Delete package (v2 §4) — from the menu or the editor, every package, after its dialog: one never published is gone,
   * one published soft-deleted (its versions stay for the projects and quotations on them); draft quotations lose it. */
  const removePackage = async (p: Product) => {
    if (busy) return
    setBusy(true)
    try {
      const isOpen = p.id === selRef.current
      if (isOpen && !(await flush())) return
      const r = await deleteMktProduct(p.id, isOpen ? revRef.current : p.rev)
      if (!r.ok) return flash(r.reason)
      const products = r.book?.products ?? book.products.filter(x => x.id !== p.id)
      setBook(b => r.book ?? { ...b, products })
      setDelFor(null)
      if (isOpen) await open(null, products)
      onPublished()
      flash(`Deleted ${p.name.trim() || p.code}`)
    } finally {
      setBusy(false)
    }
  }

  // ── The right-click menu and the "publish it first" window, over the list and the editor alike ──
  const ctxP = ctx ? book.products.find(p => p.id === ctx.id) ?? null : null
  const delP = delFor ? book.products.find(p => p.id === delFor) ?? null : null
  const mustP = mustPublish ? book.products.find(p => p.id === mustPublish) ?? null : null
  const overlays = (
    <>
      {ctxP && ctx ? (
        <PackageMenu
          p={ctxP}
          at={ctx.at}
          fromButton={ctx.fromButton}
          onClose={() => setCtx(null)}
          onStatus={k => void setStatusTo(ctxP, k)}
          onOpen={() => { setCtx(null); void open(ctxP.id) }}
          onDuplicate={() => { setCtx(null); void duplicate(ctxP) }}
          onDelete={() => { setCtx(null); setDelFor(ctxP.id) }}
        />
      ) : null}
      {delP ? (
        <DeletePackage p={delP} drafts={draftQuotesWith(delP.id)} busy={busy} onKeep={() => setDelFor(null)} onDelete={() => void removePackage(delP)} />
      ) : null}
      {mustP ? (
        <PublishFirst
          product={mustP}
          problems={productProblems({ ...mustP, ...(mustP.id === selId && edit ? edit : {}) }, book)}
          busy={busy}
          onClose={() => setMustPublish(null)}
          onOpen={() => { setMustPublish(null); void open(mustP.id) }}
          onPublish={async () => {
            setBusy(true)
            try {
              if (mustP.id === selRef.current && !(await flush())) return
              const rev = mustP.id === selRef.current ? revRef.current : mustP.rev
              if (await publishProduct({ ...mustP, ...(mustP.id === selRef.current && editRef.current ? editRef.current : {}) }, rev)) setMustPublish(null)
            } finally {
              setBusy(false)
            }
          }}
        />
      ) : null}
    </>
  )
  const onMenu = (p: Product) => (e: React.MouseEvent) => {
    e.preventDefault()
    setCtx({ id: p.id, at: menuAt(e), fromButton: false })
  }

  // List price and internal cost follow the items (v2 §3): price = Σ unit price × qty, cost = Σ the Product List's cost ×
  // qty (none while no item has a cost there). The draft takes them whenever the items change, and before a publish —
  // never on opening a package alone.
  const pricing = edit ? pricedOf(edit.groups, items) : null
  const lastPricing = useRef<string | undefined>(undefined)
  useEffect(() => {
    lastPricing.current = undefined
  }, [selId])
  useEffect(() => {
    if (!pricing) return
    const key = `${pricing.price}|${pricing.cost}`
    const prev = lastPricing.current
    lastPricing.current = key
    if (prev === undefined || prev === key || ro) return
    syncPricing()
    // Only a change of the items' sums moves them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pricing?.price, pricing?.cost])

  // ── The list ──
  if (!sel || !edit) {
    const counts: Record<Filter, number> = { all: book.products.length, active: 0, draft: 0, retired: 0 }
    for (const p of book.products) counts[p.status]++
    const order: Record<ProductStatus, number> = { active: 0, draft: 1, retired: 2 }
    const q = norm(search)
    const shown = book.products
      .filter(p => (filter === 'all' || p.status === filter) && (!q || norm(`${p.name} ${p.code}`).includes(q)))
      .sort((a, b) => order[a.status] - order[b.status])
    const SEG_DOT: Record<Filter, string> = { all: v2.sdotAll, active: v2.sdotActive, draft: v2.sdotDraft, retired: v2.sdotRetired }
    return (
      <div>
        <div className={v2.toolbar}>
          <div className={v2.seg} role="tablist" aria-label="Packages by status">
            {(['all', 'active', 'draft', 'retired'] as const).map(k => {
              const label = k === 'all' ? 'All' : STATUS_LABEL[k]
              return (
                <button key={k} type="button" role="tab" aria-selected={filter === k} className={`${v2.segBtn}${filter === k ? ` ${v2.segOn}` : ''}`} onClick={() => setFilter(k)}>
                  <span className={`${v2.sdot} ${SEG_DOT[k]}`} />
                  <span className={qs.lbl} data-t={label}>{label}</span><span className={v2.segN}>{counts[k]}</span>
                </button>
              )
            })}
          </div>
          <span className={v2.searchWrap}>
            <input type="search" className={v2.search} placeholder="Search products or codes" aria-label="Search packages" value={search} onChange={e => setSearch(e.target.value)} />
          </span>
          <span className={v2.grow} />
          <button type="button" className={v2.primary} disabled={busy} onClick={() => void newProduct()}>+ New package</button>
        </div>
        <div className={v2.cards}>
          {shown.map(p => (
            <PackageCard
              key={p.id}
              p={p}
              menuOn={ctx?.id === p.id}
              onOpen={() => void open(p.id)}
              onMenu={onMenu(p)}
              onMore={e => setCtx({ id: p.id, at: menuAt(e, true), fromButton: true })}
            />
          ))}
          {shown.length === 0 ? <div className={v2.empty}>{book.products.length ? 'None here' : 'No packages yet'}</div> : null}
        </div>
        {overlays}
      </div>
    )
  }

  // ── The editor (v2, variant B) ──
  const sections = productSections({ ...edit, code: sel.code })
  // List price and internal cost follow the items (v2 §3): what the page shows is always the items' sums.
  const priced: ProductEdit = { ...edit, price: pricing?.price ?? null, cost: pricing?.cost ?? null }
  const draftProduct: Product = { ...sel, ...priced }
  const problems = productProblems(draftProduct, book)
  const sum = itemsSum(groups)
  const m = margin(priced.price, priced.cost)
  const nextVer = sel.version + 1
  const changed = sel.changed || save.state === 'saving'
  const canPublish = !ro && changed && problems.length === 0 && save.state !== 'error' && !busy
  const perShort = edit.kind === 'recurring' ? '/ mo' : ''
  // The manager's own columns that follow products: after Days, the Product List's values — edited here too (110px each).
  const pcols = columns.filter(c => c.inProducts)
  const igrid = pcols.length
    ? { gridTemplateColumns: `minmax(180px, 1.3fr) minmax(240px, 1.5fr) 56px ${pcols.map(() => '110px').join(' ')} 100px 108px 96px 28px`, minWidth: 880 + pcols.length * 120 }
    : undefined
  const ispan = pcols.length ? { gridColumn: `1 / span ${5 + pcols.length}` } : { gridColumn: '1 / span 5' }
  const summary = itemsSummary(groups)
  const allItems = groups.flatMap(g => g.items).filter(it => it.name.trim() && it.qty > 0)
  const checklist: [string, boolean][] = [
    ['Name and description', !!edit.name.trim() && !!edit.description.trim()],
    [`${plural(allItems.length, 'item')}${allItems.length && allItems.every(it => it.workflow) ? ', all with a workflow' : ''}`,
      allItems.length > 0 && !problems.includes('A linked workflow is not published yet') && !problems.includes('Name each category and item')],
    ['Intake template linked', !!edit.intake],
    ['Price and cost set', (priced.price ?? 0) > 0 && priced.cost != null],
  ]
  const untilDate = untilOn || edit.effectiveTo != null

  /** The floating Product List under an item's name: placed under it, or above when there is no room below. */
  const openPicker = (key: string, el: HTMLElement) => {
    if (ro) return
    const r = el.getBoundingClientRect()
    const vh = window.innerHeight
    const below = vh - r.bottom - 12
    const above = r.top - 12
    const up = below < 260 && above > below
    setPickRect({ left: Math.max(8, Math.min(r.left, window.innerWidth - 372)), top: up ? null : r.bottom + 4, bottom: up ? vh - r.top + 4 : null, max: Math.min(340, Math.max(160, up ? above : below)) })
    setPickFor(key)
  }
  /** An item picked from the Product List on the "+" row (the user, 2026-11-13: "在 items 点 + 或空格能自动有 product list
   * 的品项"): into its catalogue's category here — made when there is none — its blank rows replaced. */
  const NEW_CAT = '__newcat'
  const addFromList = (x: CatalogItem) => {
    const it: ProductItem = { ...newItem(), name: x.name, price: x.price, workflow: x.wf }
    setGroups(gs => {
      const i = gs.findIndex(g => norm(g.name) === norm(x.cat))
      if (i < 0) return [...gs, { ...newGroup(x.cat), items: [it] }]
      return gs.map((g, j) => (j === i ? { ...g, items: [...g.items.filter(t => t.name.trim()), it] } : g))
    })
    setCatDraft('')
    setPickFor(null)
  }
  const newCatMenu = pickFor === NEW_CAT && !ro ? pickerGroups(items, '', catDraft) : null
  const sectionId = ['pb-basics', 'pb-items', 'pb-intake', 'pb-pricing', 'pb-publish']

  return (
    <div>
      <div className={v2.topbar}>
        <button type="button" className={v2.back} onClick={() => void open(null)}>← Packages</button>
        <span className={v2.topName}>{edit.name.trim() || 'New package'}</span>
        <StatusPill status={sel.status} />
        <span className={v2.chip}>{sel.code} · {sel.version ? `Live v${sel.version}` : 'Not published'}</span>
        {save.state === 'error' ? (
          <span className={v2.notSaved} role="alert">
            Not saved · {save.reason}
            {save.stale ? <button type="button" className={v2.reload} onClick={() => window.location.reload()}>Reload</button> : null}
          </span>
        ) : ro ? null : (
          <span className={v2.saved}><span className={v2.savedDot} />{save.state === 'saving' ? 'Saving…' : 'Saved'}</span>
        )}
        <span className={v2.grow} />
        <span className={v2.topBtns}>
          {sel.status === 'active' ? <button type="button" className={v2.ghost} onClick={() => onQuote(sel)}>📄 New quotation</button> : null}
          <button type="button" className={v2.ghost} disabled={busy} onClick={() => void duplicate(draftProduct)}>⧉ Duplicate</button>
        </span>
      </div>
      {ro ? (
        <div className={v2.banner}>
          <span><strong>Retired on {dmy(sel.retiredOn)}.</strong> It can&apos;t be picked for new projects. {plural(sel.live, 'project')} already running keep v{sel.version} until they finish.</span>
          <button type="button" className={v2.ghost} disabled={busy} onClick={() => void setStatus('reactivate')}>Reactivate</button>
        </div>
      ) : null}

      <nav className={v2.chips} aria-label="Sections">
        {sections.map((s, i) => (
          <a key={s.label} href={`#${sectionId[i]}`} className={v2.secChip}>
            <span className={`${v2.secMark}${s.done ? ` ${v2.secDone}` : ''}`}>{s.done ? '✓' : i + 1}</span>
            {s.label}{i >= 2 ? <Lock /> : null}
          </a>
        ))}
      </nav>

      <div className={v2.edGrid}>
        <div className={v2.edMain} style={ro ? { opacity: 0.85 } : undefined}>
          <section id="pb-basics" className={v2.box}>
            <div className={v2.boxHead}>Basics</div>
            <div className={v2.boxBody}>
              <div className={v2.basicsGrid}>
                <label className={v2.field}>
                  <span className={v2.label}>Name</span>
                  <input className={v2.input} value={edit.name} maxLength={80} disabled={ro} onChange={e => change({ name: e.target.value })} />
                </label>
                <div className={v2.field}>
                  <span className={v2.label}>Code <Lock /></span>
                  <div className={v2.codeBox}>{sel.code}</div>
                </div>
              </div>
              <div className={v2.field}>
                <span className={v2.label}>Type</span>
                <div className={v2.kinds} role="radiogroup" aria-label="Type">
                  {([['recurring', 'Recurring monthly', 'Opens a new task every month for the same team'], ['one', 'One-time project', 'One project, closes when delivered']] as const).map(([k, label, hint]) => (
                    <button key={k} type="button" role="radio" aria-checked={edit.kind === k} title={hint} disabled={ro} className={`${v2.kindCard}${edit.kind === k ? ` ${v2.kindOn}` : ''}`} onClick={() => change({ kind: k })}>
                      <span className={`${v2.radio}${edit.kind === k ? ` ${v2.radioOn}` : ''}`} />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <label className={v2.field}>
                <span className={v2.label}>Description <span className={v2.counter}>{edit.description.length}/600</span></span>
                <textarea className={v2.textarea} rows={2} value={edit.description} maxLength={600} disabled={ro} onChange={e => change({ description: e.target.value })} />
              </label>
            </div>
          </section>

          <section id="pb-items" className={`${v2.box} ${v2.boxClip}`}>
            <div className={v2.boxHead}>
              <span className={v2.nowrap}>Items</span>
              <span className={v2.boxHeadSub}>{summary}{summary && edit.kind === 'recurring' ? ' / month' : ''}</span>
              <span className={v2.grow} />
              {ro ? null : (
                <button type="button" className={`${v2.ghost} ${v2.ghostSm}`} style={{ color: 'rgb(var(--mk-brown))' }} onClick={() => newCatRef.current?.focus()}>+ Add from Product List</button>
              )}
            </div>
            <div className={v2.itemsWrap}>
              <div className={`${v2.iGrid} ${v2.iHead}`} style={igrid}>
                <span>Item</span><span>Workflow</span><span className={pb.right}>Days</span>
                {pcols.map(c => <span key={c.id} title="The Product List’s — set here, it changes there too">{c.name}</span>)}
                <span className={pb.center}>Qty {perShort}</span><span className={pb.right}>Unit price</span><span className={pb.right}>Total</span><span />
              </div>
              {groups.map((g, gi) => (
                <div key={g.key}>
                  <div className={`${v2.iGrid} ${v2.iCat}`} style={igrid}>
                    <span className={v2.iCatName} style={ispan}>
                      <span className={v2.caret} aria-hidden="true">▾</span>
                      <input className={v2.catIn} value={g.name} maxLength={60} disabled={ro} placeholder="Category" aria-label="Category"
                        onChange={e => setGroup(gi, x => ({ ...x, name: e.target.value }))} />
                      <span className={v2.iCount}>{plural(g.items.length, 'item')}</span>
                    </span>
                    <span className={v2.iCatTotal}>{rm(groupSum(g))}</span>
                    {ro ? <span /> : <button type="button" className={v2.iX} title="Remove category" aria-label="Remove category" onClick={() => setGroups(gs => gs.filter((_, i) => i !== gi))}>×</button>}
                  </div>
                  {g.items.map((it, ii) => {
                    const hit = itemNamed(items, it.name)
                    const wf = book.workflows.find(w => w.id === it.workflow) ?? null
                    // "Same as above" (the user, 2026-11-13): the nearest item above — in this category or one before — with a workflow.
                    const above = workflowAbove(groups, gi, ii)
                    const aboveWf = above ? book.workflows.find(w => w.id === above) ?? null : null
                    const menuOn = pickFor === it.key && !ro
                    const menu = menuOn ? pickerGroups(items, g.name, it.name) : null
                    const typed = norm(it.name)
                    return (
                      <div key={it.key} className={`${v2.iGrid} ${v2.iItem}`} style={igrid}>
                        <span className={v2.iName}>
                          <input
                            className={v2.iNameIn}
                            value={it.name}
                            maxLength={60}
                            disabled={ro}
                            placeholder="Pick from the Product List…"
                            aria-label="Item"
                            autoFocus={focusKey === it.key}
                            onFocus={e => { if (focusKey === it.key) setFocusKey(null); openPicker(it.key, e.currentTarget) }}
                            onChange={e => {
                              const v = e.target.value
                              const x = itemNamed(items, v)
                              setItem(gi, ii, x && it.price == null ? { name: x.name, price: x.price, workflow: it.workflow || x.wf } : { name: v })
                              if (pickFor !== it.key) openPicker(it.key, e.currentTarget)
                            }}
                            onBlur={() => {
                              setTimeout(() => setPickFor(k => (k === it.key ? null : k)), 120)
                              const name = editRef.current?.groups[gi]?.items[ii]?.name ?? it.name
                              if (name.trim() && !itemNamed(items, name)) onAddItem(name.trim(), g.name.trim() || 'Other', it.price, it.workflow)
                            }}
                          />
                          {hit?.desc ? <span className={v2.iDesc} title={hit.desc}>{hit.desc}</span> : null}
                          {menuOn && menu && pickRect ? (
                            <div
                              ref={menuRef}
                              className={pb.pickMenu}
                              style={{ left: pickRect.left, top: pickRect.top ?? 'auto', bottom: pickRect.bottom ?? 'auto', maxHeight: pickRect.max }}
                              role="listbox"
                              aria-label="The Product List"
                            >
                              {menu.groups.map(mg => (
                                <div key={mg.cat}>
                                  <div className={pb.pickCatRow}>
                                    <span className={pb.pickCat}>{mg.cat}</span>
                                    {mg.here ? <span className={pb.pickHere}>this category</span> : null}
                                  </div>
                                  {mg.items.map(x => (
                                    <button
                                      key={x.id}
                                      type="button"
                                      role="option"
                                      aria-selected={norm(x.name) === typed}
                                      className={pb.pickOpt}
                                      onMouseDown={e => {
                                        e.preventDefault()
                                        setItem(gi, ii, { name: x.name, price: x.price, workflow: it.workflow || x.wf })
                                        setPickFor(null)
                                      }}
                                    >
                                      <span className={pb.pickTwo}>
                                        <span className={pb.pickName}>{x.name}</span>
                                        {x.desc || extrasOf(x, columns, c => c.inProducts).length ? (
                                          <span className={pb.pickDesc}>{[x.desc, ...extrasOf(x, columns, c => c.inProducts).map(e => e.text)].filter(Boolean).join(' · ')}</span>
                                        ) : null}
                                      </span>
                                      <span className={pb.pickPrice}>{rm(x.price)}</span>
                                    </button>
                                  ))}
                                </div>
                              ))}
                              {typed && !menu.exact ? (
                                <div className={pb.pickNew}>“{it.name.trim()}” isn’t in the Product List — it will be added under {g.name.trim() || 'Other'}</div>
                              ) : null}
                              {!menu.groups.length && !typed ? <div className={pb.pickEmpty}>Nothing in the Product List matches</div> : null}
                            </div>
                          ) : null}
                        </span>
                        <span className={v2.wfCell}>
                          <span className={v2.wfCol}>
                            <span className={v2.wfChip}>
                              <select
                                className={`${v2.wfSel}${wf ? '' : ` ${v2.wfNone}`}`}
                                value={it.workflow ?? ''}
                                disabled={ro}
                                aria-label="Workflow"
                                title={wf ? wfLabel(wf) : undefined}
                                onChange={e => {
                                  const v = e.target.value
                                  if (v === '__new') void newWorkflowFor(gi, ii)
                                  else setItem(gi, ii, { workflow: v === '__above' ? above : v || null })
                                }}
                              >
                                <option value="">{it.workflow ? 'No workflow' : 'Link a workflow…'}</option>
                                {aboveWf && aboveWf.id !== it.workflow ? <option value="__above">↑ Same as above · {wfLabel(aboveWf)}</option> : null}
                                {book.workflows.map(w => <option key={w.id} value={w.id}>{wfLabel(w)}</option>)}
                                <option value="__new">+ New workflow</option>
                              </select>
                              {wf ? <span className={v2.wfVer}>{wf.version ? `v${wf.version}` : 'draft'}</span> : null}
                              <span className={v2.wfCaret} aria-hidden="true">▾</span>
                            </span>
                            {hit?.wf && it.workflow && hit.wf !== it.workflow ? <span className={v2.wfNote}>Not the Product List’s workflow</span> : null}
                          </span>
                          {wf ? <Link className={v2.wfOpen} href={`/marketing/workflows?w=${wf.id}`} title="Open in Workflow Builder" aria-label="Open in Workflow Builder">↗</Link> : null}
                        </span>
                        {/* The item's est. days and the manager's columns are the Product List's own: set here, they are set
                            there — and every product and quotation with the item follows (the user, 2026-11-12: "两者联动"). */}
                        <DaysCell
                          value={hit?.days ?? null}
                          disabled={ro || !it.name.trim()}
                          onChange={d => onItemFacts(it.name.trim(), g.name.trim() || 'Other', it.price, it.workflow, { days: d })}
                        />
                        {pcols.map(c => (
                          <span key={c.id} className={pb.iExtra}>
                            <ExtraCell
                              column={c}
                              value={hit?.extra[c.id]}
                              disabled={ro || !it.name.trim()}
                              onChange={v => onItemFacts(it.name.trim(), g.name.trim() || 'Other', it.price, it.workflow, { extra: { [c.id]: v } })}
                            />
                          </span>
                        ))}
                        <span className={v2.qty}>
                          <button type="button" className={v2.qtyBtn} disabled={ro} aria-label="One less" onClick={() => setItem(gi, ii, { qty: Math.max(0, it.qty - 1) })}>−</button>
                          <span className={v2.qtyN}>{it.qty}</span>
                          <button type="button" className={v2.qtyBtn} disabled={ro} aria-label="One more" onClick={() => setItem(gi, ii, { qty: Math.min(999, it.qty + 1) })}>+</button>
                        </span>
                        <span className={v2.price}>
                          <span className={v2.rmTag}>RM</span>
                          <MoneyInput className={v2.priceIn} value={it.price} placeholder="0" label="Unit price" disabled={ro} onChange={v => setItem(gi, ii, { price: v })} />
                        </span>
                        <span className={v2.total}>{rm((it.price ?? 0) * it.qty)}</span>
                        {ro ? <span /> : <button type="button" className={v2.iX} title="Remove item" aria-label="Remove item" onClick={() => setGroup(gi, x => ({ ...x, items: x.items.filter((_, j) => j !== ii) }))}>×</button>}
                      </div>
                    )
                  })}
                  {ro ? null : (
                    <div className={v2.iAddRow} style={igrid ? { minWidth: igrid.minWidth } : undefined}>
                      <button type="button" className={v2.iAdd} onClick={() => {
                        // The new row opens the Product List at once (its name box is focused).
                        const fresh = newItem()
                        setGroup(gi, x => ({ ...x, items: [...x.items, fresh] }))
                        setFocusKey(fresh.key)
                      }}>+ Add item</button>
                    </div>
                  )}
                </div>
              ))}
              {ro ? null : (
                <div
                  className={v2.iNewCat}
                  style={igrid ? { minWidth: igrid.minWidth } : undefined}
                  onClick={e => { if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.plus) newCatRef.current?.focus() }}
                >
                  <span className={v2.iPlus} data-plus="1">+</span>
                  <input
                    ref={newCatRef}
                    className={v2.iNewCatIn}
                    value={catDraft}
                    maxLength={60}
                    placeholder="New category"
                    aria-label="New category"
                    onFocus={e => openPicker(NEW_CAT, e.currentTarget)}
                    onBlur={() => setTimeout(() => setPickFor(k => (k === NEW_CAT ? null : k)), 120)}
                    onChange={e => { setCatDraft(e.target.value); if (pickFor !== NEW_CAT) openPicker(NEW_CAT, e.currentTarget) }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && catDraft.trim()) {
                        const x = itemNamed(items, catDraft)
                        if (x) return addFromList(x)
                        setGroups(gs => [...gs, newGroup(catDraft)])
                        setCatDraft('')
                      }
                    }}
                  />
                  {catDraft.trim() ? (
                    <button type="button" className={`${v2.ghost} ${v2.ghostSm}`} onClick={() => { setGroups(gs => [...gs, newGroup(catDraft)]); setCatDraft('') }}>Add category</button>
                  ) : null}
                  {newCatMenu && pickRect ? (
                    <div
                      ref={menuRef}
                      className={pb.pickMenu}
                      style={{ left: pickRect.left, top: pickRect.top ?? 'auto', bottom: pickRect.bottom ?? 'auto', maxHeight: pickRect.max }}
                      role="listbox"
                      aria-label="The Product List"
                    >
                      {newCatMenu.groups.map(mg => (
                        <div key={mg.cat}>
                          <div className={pb.pickCatRow}><span className={pb.pickCat}>{mg.cat}</span></div>
                          {mg.items.map(x => (
                            <button key={x.id} type="button" role="option" aria-selected={false} className={pb.pickOpt}
                              onMouseDown={e => { e.preventDefault(); addFromList(x) }}>
                              <span className={pb.pickTwo}>
                                <span className={pb.pickName}>{x.name}</span>
                                {x.desc ? <span className={pb.pickDesc}>{x.desc}</span> : null}
                              </span>
                              <span className={pb.pickPrice}>{rm(x.price)}</span>
                            </button>
                          ))}
                        </div>
                      ))}
                      {catDraft.trim() && !newCatMenu.exact ? (
                        <div className={pb.pickNew}>Press Enter to add “{catDraft.trim()}” as a new category</div>
                      ) : null}
                      {!newCatMenu.groups.length && !catDraft.trim() ? <div className={pb.pickEmpty}>The Product List is empty</div> : null}
                    </div>
                  ) : null}
                </div>
              )}
              <div className={`${v2.iGrid} ${v2.iSum}`} style={igrid}>
                <span className={v2.iSumLbl} style={ispan}>Sum of all items <span className={v2.eqPill}>= List price</span></span>
                <span className={v2.iSumV}>{rm(sum)}</span>
                <span />
              </div>
            </div>
          </section>

          <section id="pb-intake" className={v2.box}>
            <div className={v2.boxHead}><span>Intake template</span><Lock /></div>
            <div className={v2.boxBody}>
              <label className={v2.field}>
                <span className={v2.label}>Minutes template its first meeting fills in</span>
                <select className={pb.select} value={edit.intake ?? ''} disabled={ro} onChange={e => change({ intake: e.target.value || null })}>
                  <option value="">Pick a minutes template…</option>
                  {book.minutes.map(t => <option key={t.id} value={t.id}>{t.name}{t.version ? ` · v${t.version}` : ' · draft'}</option>)}
                </select>
              </label>
            </div>
          </section>

          <section className={v2.box}>
            <div className={v2.boxHead}>Version history</div>
            <div className={v2.boxBody} style={{ gap: 0 }}>
              {sel.history.length ? sel.history.map(h => (
                <div key={h.version} className={v2.hRow}>
                  <span className={v2.mono} style={{ fontWeight: 600 }}>v{h.version}</span>
                  <span className={v2.muted}>{h.at ? dmy(h.at.slice(0, 10)) : ''}</span>
                  <span>{h.note}</span>
                </div>
              )) : <span className={v2.muted} style={{ fontSize: '.88em' }}>Not published yet</span>}
            </div>
            <div className={v2.hFoot}>
              <button type="button" className={v2.redText} disabled={busy} onClick={() => setDelFor(sel.id)}>Delete package</button>
              <span className={v2.grow} />
              {sel.status === 'active' ? <button type="button" className={v2.redOutline} disabled={busy} onClick={() => void setStatus('retire')}>Retire product</button> : null}
            </div>
          </section>
        </div>

        <aside className={v2.aside}>
          <section id="pb-pricing" className={v2.box}>
            <div className={v2.boxHead}><span>Pricing</span><span className={v2.lockChip}><Lock /> Manager</span></div>
            <div className={v2.boxBody}>
              <div className={v2.kv}><span className={v2.kvK}>List price{edit.kind === 'recurring' ? ' / month' : ''}</span><span className={v2.kvV}>{rm(priced.price)}</span></div>
              <div className={v2.kv}><span className={v2.kvK}>Internal cost <Lock /></span><span className={v2.kvV}>{priced.cost == null ? '—' : rm(priced.cost)}</span></div>
              {pricing?.missing ? <span className={v2.small}>{pricing.missing} item{pricing.missing === 1 ? ' has' : 's have'} no cost on the Product List</span> : null}
              <div className={v2.field}>
                <span className={v2.label}>Margin</span>
                <span className={`${v2.marginBig}${m != null && m < MARGIN_LOW ? ` ${v2.red}` : ` ${v2.green}`}`}>{m == null ? '—' : `${m}%`}</span>
                <span className={v2.bar} aria-hidden="true">
                  <span className={`${v2.barFill}${m != null && m < MARGIN_LOW ? ` ${v2.barFillLow}` : ''}`} style={{ width: `${Math.max(0, Math.min(100, m ?? 0))}%` }} />
                  <span className={v2.barTick} />
                </span>
                {m != null && priced.price != null && priced.cost != null ? (
                  <span className={v2.small}>{rm(priced.price - priced.cost)} / {edit.kind === 'recurring' ? 'month' : 'project'}</span>
                ) : null}
              </div>
            </div>
          </section>

          <section id="pb-publish" className={v2.box}>
            <div className={v2.boxHead}>
              <span className={v2.nowrap}>Publish v{nextVer}</span>
              {ro ? null : problems.length
                ? <span className={`${v2.boxHeadSub} ${v2.red}`} style={{ marginLeft: 'auto' }} title={problems[0]}>{problems[0]}</span>
                : <span className={`${v2.boxHeadSub} ${v2.green}`} style={{ marginLeft: 'auto' }}>Ready to publish</span>}
            </div>
            <div className={v2.boxBody}>
              {checklist.map(([label, ok]) => (
                <span key={label} className={v2.check}><span className={`${v2.checkMark}${ok ? ` ${v2.checkOk}` : ''}`}>✓</span>{label}</span>
              ))}
              <div className={v2.pubBox}>
                <label className={v2.pubRow}>
                  <span className={v2.pubK}>Effective from</span>
                  <input className={v2.date} type="date" onClick={pickDate} value={edit.effectiveFrom ?? ''} disabled={ro} onChange={e => change({ effectiveFrom: e.target.value || null })} />
                </label>
                <div className={v2.pubRow}>
                  <span className={v2.pubK}>Until</span>
                  <span className={v2.until} role="radiogroup" aria-label="Until">
                    <button type="button" role="radio" aria-checked={!untilDate} disabled={ro} className={`${v2.untilBtn}${!untilDate ? ` ${v2.untilOn}` : ''}`}
                      onClick={() => { setUntilOn(false); if (edit.effectiveTo) change({ effectiveTo: null }) }}>Never</button>
                    <button type="button" role="radio" aria-checked={untilDate} disabled={ro} className={`${v2.untilBtn}${untilDate ? ` ${v2.untilOn}` : ''}`}
                      onClick={() => setUntilOn(true)}>On a date</button>
                  </span>
                </div>
                <label className={`${v2.pubRow}${untilDate ? '' : ` ${v2.faded}`}`}>
                  <span className={v2.pubK}>End date</span>
                  <input className={v2.date} type="date" onClick={pickDate} value={edit.effectiveTo ?? ''} min={edit.effectiveFrom ?? undefined} disabled={ro || !untilDate}
                    tabIndex={untilDate ? undefined : -1} aria-label="End date" onChange={e => change({ effectiveTo: e.target.value || null })} />
                </label>
              </div>
              <span className={v2.small}>New version: v{nextVer}{sel.version ? ` replaces v${sel.version}` : ' · the first'}</span>
              {sel.version ? <span className={v2.small}>Running on v{sel.version}: {plural(sel.live, 'project')} · stay</span> : null}
              {ro ? null : (
                <div className={v2.pubBtns}>
                  <button type="button" className={v2.ghost} disabled={busy} onClick={() => void saveDraft()}>Save draft</button>
                  <button type="button" className={v2.primary} disabled={!canPublish} title={!changed ? `Nothing has changed since v${sel.version}` : problems[0]} onClick={() => void askPublish()}>
                    Publish v{nextVer}
                  </button>
                </div>
              )}
            </div>
          </section>
        </aside>
      </div>
      {diffOpen ? (
        <PublishDiff
          diff={productDiff({ ...sel, ...priced })}
          recurring={edit.kind === 'recurring'}
          busy={busy}
          onCancel={() => setDiffOpen(false)}
          onPublish={() => void publish()}
        />
      ) : null}
      {overlays}
    </div>
  )
}

/** Active from the right-click menu on a product never published: it is published first (the user, 2026-11-12) — at
 * once when nothing stops it, else its editor opens on what is missing. */
function PublishFirst({ product, problems, busy, onClose, onOpen, onPublish }: {
  product: Product
  problems: string[]
  busy: boolean
  onClose: () => void
  onOpen: () => void
  onPublish: () => void
}) {
  const name = product.name.trim() || product.code
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])
  return (
    <div className={qs.scrim} onClick={onClose}>
      <div className={`${qs.dialog} ${pb.pubDialog}`} role="dialog" aria-modal="true" aria-label="Publish before activating" onClick={e => e.stopPropagation()}>
        <div className={qs.dlgHead}>
          <span className={qs.dlgTitle}>Publish before activating</span>
          <span className={pb.grow} />
          <button type="button" className={qs.close} aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className={pb.pubBody}>
          <p className={pb.pubLead}>Please publish “{name}” before making it active. Only a published version can be picked for new projects and quotations.</p>
          {problems.length ? (
            <div className={pb.pubMissing}>
              <span className={pb.pubMissingHead}>Complete the following first:</span>
              <ul>{problems.map(p => <li key={p}>{p}</li>)}</ul>
            </div>
          ) : (
            <p className={pb.pubReady}>Everything required is in place. Publishing makes v{product.version + 1} active from {dmy(product.effectiveFrom)}.</p>
          )}
        </div>
        <div className={pb.pubFootDlg}>
          <span className={pb.grow} />
          <button type="button" className={pb.ghost} onClick={onClose}>Cancel</button>
          {problems.length ? (
            <button type="button" className={pb.primary} onClick={onOpen}>Open product</button>
          ) : (
            <button type="button" className={pb.primary} disabled={busy} onClick={onPublish}>Publish v{product.version + 1}</button>
          )}
        </div>
      </div>
    </div>
  )
}
