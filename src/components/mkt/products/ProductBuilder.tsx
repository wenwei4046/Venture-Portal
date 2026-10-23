'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { deleteMktProduct, publishMktProduct, saveMktProduct, saveMktWorkflow, setMktProductStatus } from '@/lib/marketing/actions'
import {
  editOfProduct, groupSum, includedText, itemsSum, margin, newGroup, newItem, productPatch, productProblems, productSections,
  type Product, type ProductBook, type ProductEdit, type ProductGroup, type ProductItem, type ProductStatus, type ProductWorkflowOption,
} from '@/lib/marketing/products'
import { firstWfStage, wfStagesPayload } from '@/lib/marketing/workflows'
import { formatMoney } from '@/lib/utils'
import DeleteDraft from '../builder/DeleteDraft'
import MoneyInput from './MoneyInput'
import pb from './products.module.css'

// The Product Builder (`Product Builder.dc.html`; the manager's — Marketing · Manage, and so are its prices): the list
// of products (All · Active · Draft · Retired, + New product) and a product's editor — Basics, What's included (actions
// in categories: a quantity, a unit price, a workflow each), its intake minutes template, Pricing (list price, internal
// cost, the margin), Publish (the version, the day it takes effect, the history, Retire). A draft is saved as it is
// typed — only what changed, never over somebody else's save (as the other builders'); a retired product is read-only.

type SaveState = { state: 'saved' } | { state: 'saving' } | { state: 'error'; reason: string; stale: boolean }
type Filter = 'all' | ProductStatus

const STATUS_LABEL: Record<ProductStatus, string> = { draft: 'Draft', active: 'Active', retired: 'Retired' }
const STATUS_TONE: Record<ProductStatus, string> = { draft: pb.stDraft, active: pb.stActive, retired: pb.stRetired }
const MARGIN_LOW = 20
const per = (kind: Product['kind'], short = false) => (kind === 'recurring' ? (short ? '/mo' : ' / month') : '')
const day = (d: string | null) => (d ? d.split('-').reverse().join('/') : '—')
const wfLabel = (w: ProductWorkflowOption) => `${w.action} · ${w.tname} · ${w.version ? `v${w.version}` : 'draft'}`

export default function ProductBuilder({ initial, first }: { initial: ProductBook; first: string | null }) {
  const start = (first ? initial.products.find(p => p.id === first) : undefined) ?? null
  const [book, setBook] = useState<ProductBook>(initial)
  const [filter, setFilter] = useState<Filter>('all')
  const [selId, setSelId] = useState<string | null>(start?.id ?? null)
  const [edit, setEdit] = useState<ProductEdit | null>(start ? editOfProduct(start) : null)
  const [save, setSave] = useState<SaveState>({ state: 'saved' })
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [catDraft, setCatDraft] = useState('')

  const selRef = useRef<string | null>(start?.id ?? null)
  const editRef = useRef<ProductEdit | null>(start ? editOfProduct(start) : null)
  const savedRef = useRef<ProductEdit | null>(start ? editOfProduct(start) : null)
  const revRef = useRef<number>(start?.rev ?? 1)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chain = useRef<Promise<boolean>>(Promise.resolve(true))
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flash = useCallback((words: string) => {
    setToast(words)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2800)
  }, [])

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
  }, [])

  const sel = book.products.find(p => p.id === selId) ?? null
  const ro = sel?.status === 'retired'

  // From the draft as it now is — a change made after an await (a workflow made for an action) keeps the ones before it.
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
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
  }, [flush])

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
    // In the URL without a navigation (2026-10-24): router.replace remounts the page — Next keys a page by its search
    // params — so an edit made before the server answered was lost. A null state is Next's to sync: it keeps the URL
    // through the next save's refresh (handing back window.history.state did not — #644).
    window.history.replaceState(null, '', p ? `/marketing/products?p=${p.id}` : '/marketing/products')
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

  // ── The editor's parts ──
  const groups = edit?.groups ?? []
  const setGroups = (fn: (gs: ProductGroup[]) => ProductGroup[]) => change({ groups: fn(editRef.current?.groups ?? []) })
  const setGroup = (gi: number, fn: (g: ProductGroup) => ProductGroup) => setGroups(gs => gs.map((g, i) => (i === gi ? fn(g) : g)))
  const setItem = (gi: number, ii: number, patch: Partial<ProductItem>) =>
    setGroup(gi, g => ({ ...g, items: g.items.map((it, j) => (j === ii ? { ...it, ...patch } : it)) }))

  // + New action workflow: the action's Standard template, made (or the one there already) and linked.
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

  const publish = async () => {
    if (!sel || !edit || busy) return
    setBusy(true)
    try {
      if (!(await flush())) return
      const r = await publishMktProduct(sel.id, revRef.current)
      if (!r.ok) return flash(r.reason)
      setBook(b => r.book ?? { ...b, products: b.products.map(p => (p.id === sel.id ? { ...p, version: r.version, status: 'active', changed: false, live: r.live } : p)) })
      flash(`Published ${edit.name.trim()} v${r.version} · effective ${day(r.effectiveFrom)}`)
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
      flash(to === 'retire' ? `${sel.name} retired · ${r.live} running project${r.live === 1 ? '' : 's'} keep${r.live === 1 ? 's' : ''} v${sel.version}` : `${sel.name} is active again`)
    } finally {
      setBusy(false)
    }
  }
  const saveDraft = async () => {
    if (await flush()) flash('Draft saved')
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

  // ── The list ──
  if (!sel || !edit) {
    const counts: Record<Filter, number> = { all: book.products.length, active: 0, draft: 0, retired: 0 }
    for (const p of book.products) counts[p.status]++
    const shown = book.products.filter(p => filter === 'all' || p.status === filter)
    return (
      <div className={pb.page}>
        <div className={pb.head}>
          <span className={pb.headIcon} aria-hidden="true">📦</span>
          <span className={pb.title}>Product Builder</span>
          <div className={pb.seg} role="tablist" aria-label="Products by status">
            {(['all', 'active', 'draft', 'retired'] as const).map(k => (
              <button key={k} type="button" role="tab" aria-selected={filter === k} className={`${pb.segBtn}${filter === k ? ` ${pb.segOn}` : ''}`} onClick={() => setFilter(k)}>
                {k === 'all' ? 'All' : STATUS_LABEL[k]}<span className={pb.segN}>{counts[k]}</span>
              </button>
            ))}
          </div>
          <span className={pb.grow} />
          <button type="button" className={pb.primary} disabled={busy} onClick={() => void newProduct()}>+ New product</button>
        </div>
        <div className={pb.cards}>
          {shown.map(p => (
            <button key={p.id} type="button" className={`${pb.card}${p.status === 'retired' ? ` ${pb.cardRetired}` : ''}`} onClick={() => void open(p.id)}>
              <span className={pb.cardTop}>
                <span className={pb.code}>{p.code}</span>
                <span className={pb.grow} />
                <span className={`${pb.status} ${STATUS_TONE[p.status]}`}><span className={pb.dot} />{STATUS_LABEL[p.status]}</span>
              </span>
              <span className={pb.cardName}>{p.name || 'New product'}</span>
              <span className={pb.cardIncl}>{includedText(p.groups)}{p.groups.some(g => g.items.some(it => it.qty > 0)) ? per(p.kind) : ''}</span>
              <span className={pb.cardFoot}>
                <span className={pb.kind}>{p.kind === 'recurring' ? 'Recurring monthly' : 'One-time project'}</span>
                <span className={pb.ver}>v{p.version || '—'}</span>
                <span className={pb.grow} />
                <span className={pb.price}>🔒 {p.price != null ? `${formatMoney(p.price)}${per(p.kind, true)}` : '—'}</span>
              </span>
              {p.status === 'retired' ? <span className={pb.cardNote}>Retired {day(p.retiredOn)} · {p.live} project{p.live === 1 ? '' : 's'} still running on v{p.version}</span> : null}
            </button>
          ))}
          {shown.length === 0 ? <div className={pb.empty}>{book.products.length ? 'None here' : 'No products yet'}</div> : null}
        </div>
        {toast ? <div className={pb.toast} role="status">{toast}</div> : null}
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

  return (
    <div className={pb.page}>
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
          <span className={pb.saved}>{save.state === 'saving' ? 'Saving…' : 'Saved'}</span>
        )}
      </div>
      {ro ? (
        <div className={pb.retiredBanner}>
          <span><strong>Retired on {day(sel.retiredOn)}.</strong> It can&apos;t be picked for new projects. {sel.live} project{sel.live === 1 ? '' : 's'} already running keep v{sel.version} until they finish.</span>
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

          <section id="pb-2" className={pb.section}>
            <div className={pb.secHead}>
              <span>2 · What&apos;s included</span>
              <span className={pb.grow} />
              <span className={pb.secSum}>{includedText(groups)}{groups.some(g => g.items.some(it => it.qty > 0)) ? per(edit.kind) : ''}</span>
            </div>
            <div className={pb.secBody}>
              {groups.map((g, gi) => (
                <div key={g.key} className={pb.group}>
                  <div className={pb.groupHead}>
                    <input
                      className={pb.groupName}
                      value={g.name}
                      maxLength={60}
                      disabled={ro}
                      placeholder="Action category, e.g. Graphic Design"
                      aria-label="Category"
                      onChange={e => setGroup(gi, x => ({ ...x, name: e.target.value }))}
                    />
                    <span className={pb.groupTotal}>{formatMoney(groupSum(g))}</span>
                    {ro ? null : <button type="button" className={pb.x} aria-label="Remove category" onClick={() => setGroups(gs => gs.filter((_, i) => i !== gi))}>×</button>}
                  </div>
                  <div className={pb.itemsWrap}>
                    <div className={`${pb.itemRow} ${pb.itemHead}`}>
                      <span>Action</span><span>Qty {edit.kind === 'recurring' ? '/ mo' : ''}</span><span>Unit price</span><span className={pb.right}>Total</span><span>Workflow</span><span />
                    </div>
                    {g.items.map((it, ii) => {
                      const wf = book.workflows.find(w => w.id === it.workflow) ?? null
                      return (
                        <div key={it.key} className={pb.itemRow}>
                          <input className={pb.cellInput} value={it.name} maxLength={60} disabled={ro} placeholder="e.g. Image post" aria-label="Action" onChange={e => setItem(gi, ii, { name: e.target.value })} />
                          <span className={pb.stepper}>
                            <button type="button" disabled={ro} aria-label="One less" onClick={() => setItem(gi, ii, { qty: Math.max(0, it.qty - 1) })}>−</button>
                            <span className={pb.stepN}>{it.qty}</span>
                            <button type="button" disabled={ro} aria-label="One more" onClick={() => setItem(gi, ii, { qty: Math.min(999, it.qty + 1) })}>+</button>
                          </span>
                          <span className={pb.moneyCell}>
                            <span className={pb.rm}>RM</span>
                            <MoneyInput className={pb.moneyInput} value={it.price} placeholder="0" label="Unit price" disabled={ro} onChange={v => setItem(gi, ii, { price: v })} />
                          </span>
                          <span className={`${pb.right} ${pb.mono}`}>{formatMoney((it.price ?? 0) * it.qty)}</span>
                          <span className={pb.wfCell}>
                            <select
                              className={`${pb.select}${it.workflow ? '' : ` ${pb.selectMiss}`}`}
                              value={it.workflow ?? ''}
                              disabled={ro}
                              aria-label="Workflow"
                              onChange={e => (e.target.value === '__new' ? void newWorkflowFor(gi, ii) : setItem(gi, ii, { workflow: e.target.value || null }))}
                            >
                              <option value="">Link a workflow…</option>
                              {book.workflows.map(w => <option key={w.id} value={w.id}>{wfLabel(w)}</option>)}
                              <option value="__new">+ New action workflow</option>
                            </select>
                            {wf ? <Link className={pb.open} href={`/marketing/workflows?w=${wf.id}`} title="Open in Workflow Builder" aria-label="Open in Workflow Builder">↗</Link> : null}
                          </span>
                          {ro ? <span /> : <button type="button" className={pb.x} aria-label="Remove action" onClick={() => setGroup(gi, x => ({ ...x, items: x.items.filter((_, j) => j !== ii) }))}>×</button>}
                        </div>
                      )
                    })}
                    {ro ? null : <button type="button" className={pb.addItem} onClick={() => setGroup(gi, x => ({ ...x, items: [...x.items, newItem()] }))}>+ Add action</button>}
                  </div>
                </div>
              ))}
              {ro ? null : (
                <div className={pb.addCat}>
                  <input
                    className={pb.input}
                    value={catDraft}
                    maxLength={60}
                    placeholder="New action category, e.g. Graphic Design, Video"
                    aria-label="New category"
                    onChange={e => setCatDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && catDraft.trim()) {
                        setGroups(gs => [...gs, newGroup(catDraft)])
                        setCatDraft('')
                      }
                    }}
                  />
                  <button
                    type="button"
                    className={pb.ghost}
                    disabled={!catDraft.trim()}
                    onClick={() => {
                      setGroups(gs => [...gs, newGroup(catDraft)])
                      setCatDraft('')
                    }}
                  >
                    + Add category
                  </button>
                </div>
              )}
              <div className={pb.sumRow}>
                <span>Sum of all actions</span>
                <span className={pb.grow} />
                <span className={pb.mono}>{formatMoney(sum)}{per(edit.kind)}</span>
              </div>
            </div>
          </section>

          <section id="pb-3" className={pb.section}>
            <div className={pb.secHead}>3 · Intake template</div>
            <div className={pb.secBody}>
              <label className={pb.field}>
                <span className={pb.label}>Intake template <span className={pb.muted}>· used in meeting minutes</span></span>
                <select className={pb.select} value={edit.intake ?? ''} disabled={ro} onChange={e => change({ intake: e.target.value || null })}>
                  <option value="">Pick a minutes template…</option>
                  {book.minutes.map(t => <option key={t.id} value={t.id}>{t.name}{t.version ? ` · v${t.version}` : ' · draft'}</option>)}
                </select>
                {intake ? <span className={pb.meta}>{intake.version ? `v${intake.version}` : 'Not published yet'} · {intake.fields} field{intake.fields === 1 ? '' : 's'}</span> : null}
              </label>
            </div>
          </section>

          <section id="pb-4" className={pb.section}>
            <div className={pb.secHead}>
              <span>4 · Pricing</span>
              <span className={pb.lockChip}>🔒 Manager only</span>
            </div>
            <div className={`${pb.secBody} ${pb.pricing}`}>
              <div className={pb.field}>
                <span className={pb.label}>List price</span>
                <span className={pb.moneyBig}>
                  <span className={pb.rm}>RM</span>
                  <MoneyInput className={pb.moneyInput} value={edit.price} label="List price" disabled={ro} onChange={v => change({ price: v })} />
                  <span className={pb.muted}>{edit.kind === 'recurring' ? '/ month' : '/ project'}</span>
                </span>
                {!ro && sum > 0 && sum !== edit.price ? (
                  <button type="button" className={pb.link} onClick={() => change({ price: sum })}>Use sum of actions ({formatMoney(sum)}{per(edit.kind)})</button>
                ) : null}
              </div>
              <div className={pb.field}>
                <span className={pb.label}>Internal cost <span className={pb.muted}>· optional</span></span>
                <span className={pb.moneyBig}>
                  <span className={pb.rm}>RM</span>
                  <MoneyInput className={pb.moneyInput} value={edit.cost} placeholder="—" label="Internal cost" disabled={ro} onChange={v => change({ cost: v })} />
                </span>
              </div>
              <div className={pb.field}>
                <span className={pb.label}>Margin</span>
                <span className={pb.marginRow}>
                  <span className={`${pb.margin}${m !== null && m < MARGIN_LOW ? ` ${pb.marginLow}` : ''}`}>{m === null ? '—' : `${m}%`}</span>
                  {m !== null && edit.price != null && edit.cost != null ? (
                    <span className={pb.muted}>{formatMoney(edit.price - edit.cost)} {edit.kind === 'recurring' ? 'per month' : 'per project'}{m < MARGIN_LOW ? ` · below ${MARGIN_LOW}%` : ''}</span>
                  ) : null}
                </span>
              </div>
            </div>
          </section>

          <section id="pb-5" className={pb.section}>
            <div className={pb.secHead}>5 · Publish</div>
            <div className={pb.secBody}>
              <div className={pb.pubGrid}>
                <div className={pb.field}>
                  <span className={pb.label}>Version</span>
                  <span className={pb.pubVal}>v{nextVer} <span className={pb.muted}>{sel.version ? `replaces v${sel.version}` : 'first version'}</span></span>
                </div>
                <label className={pb.field}>
                  <span className={pb.label}>Effective from</span>
                  <input className={pb.input} type="date" value={edit.effectiveFrom ?? ''} disabled={ro} onChange={e => change({ effectiveFrom: e.target.value || null })} />
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
                      <span className={pb.muted}>{h.at ? day(h.at.slice(0, 10)) : ''}</span>
                      <span>{h.note}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className={pb.pubFoot}>
                {sel.status === 'active' ? <button type="button" className={pb.danger} disabled={busy} onClick={() => void setStatus('retire')}>Retire product</button> : null}
                {sel.status === 'draft' ? <DeleteDraft key={sel.id} what="product" busy={busy} onDelete={() => void remove()} /> : null}
                <span className={pb.grow} />
                {ro ? null : (
                  <span className={problems.length ? pb.pubNoteBad : pb.pubNote}>
                    {problems.length ? problems[0] : `New projects from ${day(edit.effectiveFrom)} use v${nextVer}. ${sel.live} running project${sel.live === 1 ? '' : 's'} stay on v${sel.version || '—'}.`}
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
      {toast ? <div className={pb.toast} role="status">{toast}</div> : null}
    </div>
  )
}
