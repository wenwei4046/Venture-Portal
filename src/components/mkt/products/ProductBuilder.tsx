'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { deleteMktProduct, publishMktProduct, saveMktProduct, saveMktWorkflow, setMktProductAccount, setMktProductStatus } from '@/lib/marketing/actions'
import { duplicateMktProduct, setMktProductStatusTo } from '@/lib/marketing/quote-actions'
import { extrasOf, itemNamed, itemsCost, norm, pickerGroups, type CatalogItem, type ItemColumn, type ItemFacts } from '@/lib/marketing/catalog'
import {
  accountLabel, editOfProduct, groupSum, includedText, itemsSum, margin, newGroup, newItem, productPatch, productProblems, productSections, workflowAbove,
  type Product, type ProductBook, type ProductEdit, type ProductGroup, type ProductItem, type ProductStatus, type ProductWorkflowOption,
} from '@/lib/marketing/products'
import { dmy, rm } from '@/lib/marketing/quotes'
import { firstWfStage, wfStagesPayload } from '@/lib/marketing/workflows'
import DeleteDraft from '../builder/DeleteDraft'
import DaysCell from './DaysCell'
import ExtraCell from './ExtraCell'
import MoneyInput from './MoneyInput'
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
const STATUS_TONE: Record<ProductStatus, string> = { draft: pb.stDraft, active: pb.stActive, retired: pb.stRetired }
const STATUS_DOT: Record<ProductStatus, string> = { draft: pb.dotDraft, active: pb.dotActive, retired: pb.dotRetired }
const STATUS_HINT: Record<ProductStatus, string> = {
  active: 'Can be picked for new projects and quotations',
  draft: 'Hidden from quotations while you work on it',
  retired: 'No new projects · running ones keep their version',
}
const MARGIN_LOW = 20
const per = (kind: Product['kind'], short = false) => (kind === 'recurring' ? (short ? '/mo' : ' / month') : '')
const wfLabel = (w: ProductWorkflowOption) => `${w.action} · ${w.tname} · ${w.version ? `v${w.version}` : 'draft'}`
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

interface PickRect { left: number; top: number | null; bottom: number | null; max: number }

export default function ProductBuilder({ book, setBook, first, onOpen, items, columns = [], onAddItem, onItemFacts = () => {}, onQuote, onPublished, flash }: {
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
  flash: (words: string) => void
}) {
  const start = (first ? book.products.find(p => p.id === first) : undefined) ?? null
  const [filter, setFilter] = useState<Filter>('all')
  const [selId, setSelId] = useState<string | null>(start?.id ?? null)
  const [edit, setEdit] = useState<ProductEdit | null>(start ? editOfProduct(start) : null)
  const [save, setSave] = useState<SaveState>({ state: 'saved' })
  const [busy, setBusy] = useState(false)
  const [acctBusy, setAcctBusy] = useState(false)
  const [catDraft, setCatDraft] = useState('')
  // An item row just added by "+ Add item": its name box takes the focus, which opens the Product List.
  const [focusKey, setFocusKey] = useState<string | null>(null)
  const newCatRef = useRef<HTMLInputElement | null>(null)
  const [ctx, setCtx] = useState<{ id: string; x: number; y: number } | null>(null)
  const [ctxDelete, setCtxDelete] = useState(false)
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

  const publish = async () => {
    if (!sel || !edit || busy) return
    setBusy(true)
    try {
      if (!(await flush())) return
      await publishProduct({ ...sel, ...edit }, revRef.current)
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
    if (await flush()) flash('Draft saved')
  }
  /** Its revenue account, saved the moment it is picked — apart from the draft, no new version. */
  const setAccount = async (code: string) => {
    if (!sel || acctBusy) return
    setAcctBusy(true)
    try {
      const r = await setMktProductAccount(sel.id, code || null)
      if (!r.ok) return flash(r.reason)
      setBook(b => ({ ...b, products: b.products.map(p => (p.id === sel.id ? { ...p, account: r.account } : p)) }))
      flash(r.account ? `Revenue account saved · ${accountLabel(r.account, book.accounts)}` : 'Revenue account cleared')
    } finally {
      setAcctBusy(false)
    }
  }
  /** A product still a draft, deleted (the user's answer 8) — back to the list. */
  const remove = async () => {
    if (!sel || busy) return
    setBusy(true)
    try {
      if (!(await flush())) return
      const r = await deleteMktProduct(sel.id, revRef.current)
      if (!r.ok) return flash(r.reason)
      const products = r.book?.products ?? book.products.filter(p => p.id !== sel.id)
      setBook(b => r.book ?? { ...b, products })
      await open(null, products)
      flash(`Deleted ${sel.name.trim() || sel.code}`)
    } finally {
      setBusy(false)
    }
  }

  /** Delete from the right-click menu (the user, 2026-11-13: "product 点右键可以删除"): a product never published, asked
   * first; one published once is retired instead (answer 8 — its projects keep their version), so the row says so. */
  const removeFromMenu = async (p: Product) => {
    if (busy) return
    setBusy(true)
    try {
      const isOpen = p.id === selRef.current
      if (isOpen && !(await flush())) return
      const r = await deleteMktProduct(p.id, isOpen ? revRef.current : p.rev)
      if (!r.ok) return flash(r.reason)
      const products = r.book?.products ?? book.products.filter(x => x.id !== p.id)
      setBook(b => r.book ?? { ...b, products })
      if (isOpen) await open(null, products)
      flash(`Deleted ${p.name.trim() || p.code}`)
    } finally {
      setBusy(false)
      setCtx(null)
      setCtxDelete(false)
    }
  }

  // ── The right-click menu and the "publish it first" window, over the list and the editor alike ──
  const ctxP = ctx ? book.products.find(p => p.id === ctx.id) ?? null : null
  const mustP = mustPublish ? book.products.find(p => p.id === mustPublish) ?? null : null
  const overlays = (
    <>
      {ctxP && ctx ? (
        <>
          <div className={pb.ctxScrim} onClick={() => { setCtx(null); setCtxDelete(false) }} onContextMenu={e => { e.preventDefault(); setCtx(null); setCtxDelete(false) }} />
          <div className={pb.ctx} style={{ left: ctx.x, top: ctx.y }} role="menu" aria-label={ctxP.name || 'New product'}>
            <div className={pb.ctxName}>{ctxP.name || 'New product'}</div>
            <div className={pb.ctxSect}>Status</div>
            {(['active', 'draft', 'retired'] as const).map(k => {
              const on = ctxP.status === k
              return (
                <button key={k} type="button" role="menuitemradio" aria-checked={on} title={STATUS_HINT[k]} className={`${pb.ctxRow}${on ? ` ${pb.ctxOn}` : ''}`} onClick={() => void setStatusTo(ctxP, k)}>
                  <span className={`${pb.ctxDot} ${STATUS_DOT[k]}`} />
                  <span className={pb.grow}>{STATUS_LABEL[k]}</span>
                  <span className={pb.ctxTick}>{on ? '✓' : ''}</span>
                </button>
              )
            })}
            <div className={pb.ctxLine} />
            <button type="button" role="menuitem" className={pb.ctxRow} onClick={() => { setCtx(null); void open(ctxP.id) }}>Open</button>
            <button type="button" role="menuitem" className={pb.ctxRow} onClick={() => { setCtx(null); void duplicate(ctxP) }}>⧉ Duplicate</button>
            <div className={pb.ctxLine} />
            {ctxP.version > 0 ? (
              <button type="button" role="menuitem" className={`${pb.ctxRow} ${pb.ctxOff}`} disabled
                title="A product once on sale is retired, not deleted — its projects keep their version">
                <span className={pb.grow}>Delete</span><span className={pb.ctxHint}>Retire instead</span>
              </button>
            ) : ctxDelete ? (
              <div className={pb.ctxAsk}>
                <span className={pb.ctxAskText}>Delete “{ctxP.name.trim() || ctxP.code}”? This cannot be undone.</span>
                <span className={pb.ctxAskBtns}>
                  <button type="button" className={pb.ctxDanger} disabled={busy} onClick={() => void removeFromMenu(ctxP)}>Delete</button>
                  <button type="button" className={pb.ctxKeep} onClick={() => setCtxDelete(false)}>Keep</button>
                </span>
              </div>
            ) : (
              <button type="button" role="menuitem" className={`${pb.ctxRow} ${pb.ctxDel}`} onClick={() => setCtxDelete(true)}>Delete</button>
            )}
          </div>
        </>
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
    setCtxDelete(false)
    setCtx({ id: p.id, x: Math.min(e.clientX, window.innerWidth - 240), y: Math.min(e.clientY, window.innerHeight - 330) })
  }

  // The internal cost follows the items (the user, 2026-11-13: "加了物品后，internal cost 没自动跳出"): when the items
  // change, a cost left empty — or still the items' cost from before — becomes the Product List's cost × quantity. A cost
  // typed by hand stays; "Use cost of items" offers the sum. Opening a product changes nothing.
  const costOfItems = edit ? itemsCost(edit.groups, items) : null
  const lastCost = useRef<number | undefined>(undefined)
  useEffect(() => {
    lastCost.current = undefined
  }, [selId])
  useEffect(() => {
    if (!costOfItems) return
    const prev = lastCost.current
    lastCost.current = costOfItems.cost
    if (prev === undefined || prev === costOfItems.cost || ro) return
    const cur = editRef.current?.cost ?? null
    if (cur === null || cur === prev) change({ cost: costOfItems.cost > 0 ? costOfItems.cost : null })
    // Only a change of the items' cost moves it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [costOfItems?.cost])

  // ── The list ──
  if (!sel || !edit) {
    const counts: Record<Filter, number> = { all: book.products.length, active: 0, draft: 0, retired: 0 }
    for (const p of book.products) counts[p.status]++
    const order: Record<ProductStatus, number> = { active: 0, draft: 1, retired: 2 }
    const shown = book.products.filter(p => filter === 'all' || p.status === filter).sort((a, b) => order[a.status] - order[b.status])
    return (
      <div>
        <div className={pb.head}>
          <span className={pb.headIcon} aria-hidden="true">📦</span>
          <span className={pb.title}>Product Builder</span>
          <div className={pb.seg} role="tablist" aria-label="Products by status">
            {(['all', 'active', 'draft', 'retired'] as const).map(k => {
              const label = k === 'all' ? 'All' : STATUS_LABEL[k]
              return (
                <button key={k} type="button" role="tab" aria-selected={filter === k} className={`${pb.segBtn}${filter === k ? ` ${pb.segOn}` : ''}`} onClick={() => setFilter(k)}>
                  <span className={qs.lbl} data-t={label}>{label}</span><span className={pb.segN}>{counts[k]}</span>
                </button>
              )
            })}
          </div>
          <span className={pb.grow} />
          <button type="button" className={pb.primary} disabled={busy} onClick={() => void newProduct()}>+ New product</button>
        </div>
        <div className={pb.cards}>
          {shown.map(p => (
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              className={`${pb.card}${p.status === 'retired' ? ` ${pb.cardRetired}` : ''}`}
              onClick={() => void open(p.id)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void open(p.id) } }}
              onContextMenu={onMenu(p)}
            >
              <span className={pb.cardTop}>
                <span className={pb.code}>{p.code}</span>
                <span className={pb.grow} />
                <button type="button" title="Duplicate" className={pb.dupBtn} disabled={busy} onClick={e => { e.stopPropagation(); void duplicate(p) }}>⧉ Duplicate</button>
                <span className={`${pb.status} ${STATUS_TONE[p.status]}`}><span className={pb.dot} />{STATUS_LABEL[p.status]}</span>
              </span>
              <span className={pb.cardName}>{p.name || 'New product'}</span>
              <span className={pb.cardIncl}>{includedText(p.groups)}{p.groups.some(g => g.items.some(it => it.qty > 0)) ? per(p.kind) : ''}</span>
              <span className={pb.cardFoot}>
                <span className={pb.kind}>{p.kind === 'recurring' ? 'Recurring monthly' : 'One-time project'}</span>
                <span className={pb.ver}>v{p.version || '—'}</span>
                <span className={pb.grow} />
                <span className={pb.price}>🔒 {p.price != null ? `${rm(p.price)}${per(p.kind, true)}` : '—'}</span>
              </span>
              {p.status === 'retired' ? <span className={pb.cardNote}>Retired {dmy(p.retiredOn)} · {plural(p.live, 'project')} still running on v{p.version}</span> : null}
            </div>
          ))}
          {shown.length === 0 ? <div className={pb.empty}>{book.products.length ? 'None here' : 'No products yet'}</div> : null}
        </div>
        {overlays}
      </div>
    )
  }

  // ── The editor ──
  const sections = productSections({ ...edit, code: sel.code })
  const draftProduct: Product = { ...sel, ...edit }
  const problems = productProblems(draftProduct, book)
  const sum = itemsSum(groups)
  const m = margin(edit.price, edit.cost)
  const nextVer = sel.version + 1
  const changed = sel.changed || save.state === 'saving'
  const canPublish = !ro && changed && problems.length === 0 && save.state !== 'error' && !busy
  const intake = book.minutes.find(t => t.id === edit.intake) ?? null
  const perShort = edit.kind === 'recurring' ? '/ mo' : ''
  // The manager's own columns that follow products: after Days, the Product List's values — edited here too (110px each).
  const pcols = columns.filter(c => c.inProducts)
  const igrid = pcols.length
    ? { gridTemplateColumns: `minmax(170px, 1.3fr) minmax(260px, 1.6fr) 52px ${pcols.map(() => '110px').join(' ')} 92px 112px 96px 28px`, minWidth: 880 + pcols.length * 120 }
    : undefined
  const ispan = pcols.length ? { gridColumn: `1 / span ${5 + pcols.length}` } : undefined
  const incl = `${includedText(groups)}${groups.some(g => g.items.some(it => it.qty > 0)) ? per(edit.kind) : ''}`

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

  return (
    <div>
      <div className={pb.crumbs}>
        <button type="button" className={pb.crumbLink} onClick={() => void open(null)}>← Products</button>
        <span>/</span>
        <span>{edit.name.trim() || 'New product'}</span>
      </div>
      <div className={pb.titleRow}>
        <span className={pb.bigName}>{edit.name.trim() || 'New product'}</span>
        <span className={`${pb.status} ${STATUS_TONE[sel.status]}`}><span className={pb.dot} />{STATUS_LABEL[sel.status]}</span>
        <span className={pb.verChip}>{sel.version ? `Live v${sel.version}` : 'Not published yet'}</span>
        {save.state === 'error' ? (
          <span className={pb.notSaved} role="alert">
            Not saved · {save.reason}
            {save.stale ? <button type="button" className={pb.reload} onClick={() => window.location.reload()}>Reload</button> : null}
          </span>
        ) : ro ? null : (
          <span className={qs.saved}>{save.state === 'saving' ? 'Saving…' : 'Saved'}</span>
        )}
        <span className={pb.grow} />
        <div className={pb.titleBtns}>
          <button type="button" className={pb.ghost} disabled={busy} onClick={() => void duplicate(draftProduct)}>⧉ Duplicate</button>
          {sel.status === 'active' ? <button type="button" className={pb.ghost} onClick={() => onQuote(sel)}>📄 New quotation</button> : null}
        </div>
      </div>
      {ro ? (
        <div className={pb.retiredBanner}>
          <span><strong>Retired on {dmy(sel.retiredOn)}.</strong> It can&apos;t be picked for new projects. {plural(sel.live, 'project')} already running keep v{sel.version} until they finish.</span>
          <button type="button" className={pb.ghost} disabled={busy} onClick={() => void setStatus('reactivate')}>Reactivate</button>
        </div>
      ) : null}

      <div className={pb.editor}>
        <nav className={pb.nav} aria-label="Sections">
          {sections.map((s, i) => (
            <a key={s.label} href={`#pb-${i + 1}`} className={pb.navRow}>
              <span className={`${pb.navMark}${s.done ? ` ${pb.navDone}` : ''}`}>{s.done ? '✓' : i + 1}</span>
              {s.label}
            </a>
          ))}
        </nav>

        <div className={`${pb.form}${ro ? ` ${pb.formRo}` : ''}`}>
          <section id="pb-1" className={pb.section}>
            <div className={pb.secHead}>1 · Basics</div>
            <div className={pb.secBody}>
              <label className={pb.field}>
                <span className={pb.label}>Name</span>
                <input className={pb.input} value={edit.name} maxLength={80} disabled={ro} onChange={e => change({ name: e.target.value })} />
              </label>
              <div className={pb.field}>
                <span className={pb.label}>Code <span className={pb.muted}>· auto-generated</span></span>
                <div className={pb.codeBox}><span className={pb.code}>{sel.code}</span><span aria-hidden="true">🔒</span></div>
              </div>
              <div className={pb.field}>
                <span className={pb.label}>Type</span>
                <div className={pb.kinds} role="radiogroup" aria-label="Type">
                  {([['recurring', 'Recurring monthly', 'Opens a new task every month for the same team'], ['one', 'One-time project', 'One project, closes when delivered']] as const).map(([k, label, hint]) => (
                    <button key={k} type="button" role="radio" aria-checked={edit.kind === k} title={hint} disabled={ro} className={`${pb.kindCard}${edit.kind === k ? ` ${pb.kindOn}` : ''}`} onClick={() => change({ kind: k })}>
                      <span className={`${pb.radio}${edit.kind === k ? ` ${pb.radioOn}` : ''}`} />
                      <span className={pb.kindName}>{label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <label className={pb.field}>
                <span className={pb.label}>Description</span>
                <textarea className={pb.textarea} rows={3} value={edit.description} maxLength={600} disabled={ro} onChange={e => change({ description: e.target.value })} />
              </label>
            </div>
          </section>

          <section id="pb-2" className={`${pb.section} ${pb.sectionClip}`}>
            <div className={pb.secHead}>
              <span className={pb.nowrap}>2 · Items</span>
              <span className={pb.grow} />
              <span className={`${pb.secSum} ${pb.right}`}>{incl}</span>
            </div>
            <div className={pb.itemsWrap}>
              <div className={`${pb.iRow} ${pb.iHead}`} style={igrid}>
                <span className={pb.pl8}>Item</span><span className={pb.pl8}>Workflow</span><span className={pb.right}>Days</span>
                {pcols.map(c => <span key={c.id} className={pb.iExtraHead} title="The Product List’s — set here, it changes there too">{c.name}</span>)}
                <span className={pb.center}>Qty {perShort}</span><span className={`${pb.right} ${pb.pr8}`}>Unit price</span><span className={pb.right}>Total</span><span />
              </div>
              {groups.map((g, gi) => (
                <div key={g.key}>
                  <div className={`${pb.iRow} ${pb.iCat}`} style={igrid}>
                    <span className={pb.iCatName} style={ispan}>
                      <input className={pb.catInput} value={g.name} maxLength={60} disabled={ro} placeholder="Category, e.g. Graphic design" aria-label="Category"
                        onChange={e => setGroup(gi, x => ({ ...x, name: e.target.value }))} />
                      <span className={pb.iCount}>{plural(g.items.length, 'item')}</span>
                    </span>
                    <span className={pb.iCatTotal}>{rm(groupSum(g))}</span>
                    {ro ? <span /> : <button type="button" className={pb.iX} title="Remove category" aria-label="Remove category" onClick={() => setGroups(gs => gs.filter((_, i) => i !== gi))}>×</button>}
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
                      <div key={it.key} className={`${pb.iRow} ${pb.iItem}`} style={igrid}>
                        <span className={pb.iName}>
                          <input
                            className={pb.iNameIn}
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
                        <span className={pb.iWf}>
                          <span className={pb.iWfCol}>
                            <select
                              className={qs.cellSel}
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
                            {hit?.wf && it.workflow && hit.wf !== it.workflow ? <span className={pb.wfNote}>Not the Product List’s workflow</span> : null}
                          </span>
                          {wf ? <Link className={pb.iOpen} href={`/marketing/workflows?w=${wf.id}`} title="Open in Workflow Builder" aria-label="Open in Workflow Builder">↗</Link> : null}
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
                        <span className={pb.iQty}>
                          <button type="button" className={pb.sq} disabled={ro} aria-label="One less" onClick={() => setItem(gi, ii, { qty: Math.max(0, it.qty - 1) })}>−</button>
                          <span className={pb.iQtyN}>{it.qty}</span>
                          <button type="button" className={pb.sq} disabled={ro} aria-label="One more" onClick={() => setItem(gi, ii, { qty: Math.min(999, it.qty + 1) })}>+</button>
                        </span>
                        <span className={pb.iPrice}>
                          <span className={pb.iRm}>RM</span>
                          <MoneyInput className={pb.iPriceIn} value={it.price} placeholder="0" label="Unit price" disabled={ro} onChange={v => setItem(gi, ii, { price: v })} />
                        </span>
                        <span className={pb.iTotal}>{rm((it.price ?? 0) * it.qty)}</span>
                        {ro ? <span /> : <button type="button" className={`${pb.iX} ${pb.iXItem}`} title="Remove item" aria-label="Remove item" onClick={() => setGroup(gi, x => ({ ...x, items: x.items.filter((_, j) => j !== ii) }))}>×</button>}
                      </div>
                    )
                  })}
                  {ro ? null : (
                    <div className={pb.iAddRow} style={igrid ? { minWidth: igrid.minWidth } : undefined}>
                      <button type="button" className={pb.iAdd} onClick={() => {
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
                  className={pb.iNewCat}
                  style={igrid ? { minWidth: igrid.minWidth + 32 } : undefined}
                  onClick={e => { if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.plus) newCatRef.current?.focus() }}
                >
                  <span className={pb.iPlus} data-plus="1">+</span>
                  <input
                    ref={newCatRef}
                    className={pb.iNewCatIn}
                    value={catDraft}
                    maxLength={60}
                    placeholder="Pick from the Product List, or type a new category and press Enter"
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
                  <button
                    type="button"
                    className={`${pb.iNewCatBtn}${catDraft.trim() ? '' : ` ${qs.faded}`}`}
                    onClick={() => {
                      if (!catDraft.trim()) return
                      setGroups(gs => [...gs, newGroup(catDraft)])
                      setCatDraft('')
                    }}
                  >
                    Add category
                  </button>
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
              <div className={`${pb.iRow} ${pb.iSum}`} style={igrid}>
                <span className={pb.iSumLbl} style={ispan}>Sum of all items <span className={pb.muted}>{edit.kind === 'recurring' ? '· per month' : ''}</span></span>
                <span className={pb.iSumV}>{rm(sum)}</span>
                <span />
              </div>
            </div>
          </section>

          <div className={pb.divider}>
            <span className={pb.divLine} />
            <span className={pb.divWords}>🔒 Internal only · not shown to the client</span>
            <span className={pb.divLine} />
          </div>

          <section id="pb-3" className={pb.section}>
            <div className={pb.secHead}><span>3 · Intake template</span><span className={pb.lockChip}>🔒 Internal only</span></div>
            <div className={pb.secBody}>
              <label className={pb.field}>
                <span className={pb.label}>Intake template <span className={pb.muted}>· used in meeting minutes</span></span>
                <select className={pb.select} value={edit.intake ?? ''} disabled={ro} onChange={e => change({ intake: e.target.value || null })}>
                  <option value="">Pick a minutes template…</option>
                  {book.minutes.map(t => <option key={t.id} value={t.id}>{t.name}{t.version ? ` · v${t.version}` : ' · draft'}</option>)}
                </select>
                {intake ? <span className={pb.meta}>{intake.version ? `v${intake.version}` : 'Not published yet'} · {plural(intake.fields, 'field')}</span> : null}
              </label>
            </div>
          </section>

          <section id="pb-4" className={pb.section}>
            <div className={pb.secHead}><span>4 · Pricing</span><span className={pb.lockChip}>🔒 Internal only · Manager</span></div>
            <div className={`${pb.secBody} ${pb.pricing}`}>
              <div className={pb.field}>
                <span className={pb.label}>List price</span>
                <span className={pb.moneyBig}>
                  <span className={pb.rm}>RM</span>
                  <MoneyInput className={pb.moneyInput} value={edit.price} label="List price" disabled={ro} onChange={v => change({ price: v })} />
                  <span className={pb.muted}>{edit.kind === 'recurring' ? '/ month' : '/ project'}</span>
                </span>
                {!ro && sum > 0 && sum !== edit.price ? (
                  <button type="button" className={pb.link} onClick={() => change({ price: sum })}>Use sum of items ({rm(sum)}{per(edit.kind)})</button>
                ) : null}
              </div>
              <div className={pb.field}>
                <span className={pb.label}>Internal cost <span className={pb.muted}>· optional</span></span>
                <span className={pb.moneyBig}>
                  <span className={pb.rm}>RM</span>
                  <MoneyInput className={pb.moneyInput} value={edit.cost} placeholder="—" label="Internal cost" disabled={ro} onChange={v => change({ cost: v })} />
                </span>
                {!ro && costOfItems && costOfItems.cost > 0 && costOfItems.cost !== edit.cost ? (
                  <button type="button" className={pb.link} onClick={() => change({ cost: costOfItems.cost })}>
                    Use cost of items ({rm(costOfItems.cost)}{per(edit.kind)})
                  </button>
                ) : null}
                {costOfItems?.missing ? (
                  <span className={pb.muted}>{costOfItems.missing} item{costOfItems.missing === 1 ? ' has' : 's have'} no cost on the Product List</span>
                ) : null}
              </div>
              <div className={pb.field}>
                <span className={pb.label}>Margin</span>
                <span className={pb.marginRow}>
                  <span className={`${pb.margin}${m !== null && m < MARGIN_LOW ? ` ${pb.marginLow}` : ''}`}>{m === null ? '—' : `${m}%`}</span>
                  {m !== null && edit.price != null && edit.cost != null ? (
                    <span className={pb.muted}>{rm(edit.price - edit.cost)} {edit.kind === 'recurring' ? 'per month' : 'per project'}{m < MARGIN_LOW ? ` · below ${MARGIN_LOW}%` : ''}</span>
                  ) : null}
                </span>
              </div>
              <label className={pb.field}>
                <span className={pb.label}>Revenue account</span>
                <select className={pb.select} value={sel.account ?? ''} disabled={acctBusy} onChange={e => void setAccount(e.target.value)}>
                  <option value="">Pick an account…</option>
                  {sel.account && !book.accounts.some(a => a.code === sel.account) ? (
                    <option value={sel.account}>{accountLabel(sel.account, book.accounts)}</option>
                  ) : null}
                  {book.accounts.map(a => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}
                </select>
              </label>
            </div>
          </section>

          <section id="pb-5" className={pb.section}>
            <div className={pb.secHead}><span>5 · Publish</span><span className={pb.lockChip}>🔒 Internal only</span></div>
            <div className={pb.secBody}>
              <div className={pb.pubGrid}>
                <div className={pb.field}>
                  <span className={pb.label}>Version</span>
                  <span className={pb.pubVal}>v{nextVer} <span className={pb.muted}>{sel.version ? `replaces v${sel.version}` : 'first version'}</span></span>
                </div>
                <label className={pb.field}>
                  <span className={pb.label}>Effective from</span>
                  <input className={`${qs.date}`} type="date" onClick={pickDate} value={edit.effectiveFrom ?? ''} disabled={ro} onChange={e => change({ effectiveFrom: e.target.value || null })} />
                </label>
                <div className={pb.field}>
                  <span className={pb.label}>Projects on current version</span>
                  <span className={pb.pubVal}>{sel.live} active · stay on v{sel.version || '—'}</span>
                </div>
              </div>
              {sel.history.length ? (
                <div className={pb.history}>
                  <div className={pb.label}>Version history</div>
                  {sel.history.map(h => (
                    <div key={h.version} className={pb.histRow}>
                      <span className={pb.mono}>v{h.version}</span>
                      <span className={pb.muted}>{h.at ? dmy(h.at.slice(0, 10)) : ''}</span>
                      <span>{h.note}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className={pb.pubFoot}>
                {sel.status === 'active' ? <button type="button" className={pb.danger} disabled={busy} onClick={() => void setStatus('retire')}>Retire product</button> : null}
                {sel.status === 'draft' && sel.version === 0 ? <DeleteDraft key={sel.id} what="product" busy={busy} onDelete={() => void remove()} /> : null}
                <span className={pb.grow} />
                {ro ? null : (
                  <span className={problems.length ? pb.pubNoteBad : pb.pubNote}>
                    {problems.length ? problems[0] : `New projects from ${dmy(edit.effectiveFrom)} use v${nextVer}. ${plural(sel.live, 'running project')} stay on v${sel.version || '—'}.`}
                  </span>
                )}
                {ro ? null : <button type="button" className={pb.ghost} disabled={busy} onClick={() => void saveDraft()}>Save draft</button>}
                {ro ? null : (
                  <button type="button" className={pb.primary} disabled={!canPublish} title={!changed ? `Nothing has changed since v${sel.version}` : problems[0]} onClick={() => void publish()}>
                    Publish v{nextVer}
                  </button>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
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
