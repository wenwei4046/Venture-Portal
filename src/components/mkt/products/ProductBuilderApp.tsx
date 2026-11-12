'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { duplicateMktQuote, readMktQuoteBook, saveMktItem, saveMktQuote } from '@/lib/marketing/quote-actions'
import { factsPayload, mergeFacts, norm, withFacts, type CatalogItem, type ItemColumn, type ItemFacts } from '@/lib/marketing/catalog'
import type { Product, ProductBook } from '@/lib/marketing/products'
import { coreOf, packageLine, quoteTotals, rm, type Quote, type QuoteBook } from '@/lib/marketing/quotes'
import AssignTasks from './AssignTasks'
import CatalogTab from './CatalogTab'
import ProductBuilder from './ProductBuilder'
import QuoteEditor from './QuoteEditor'
import QuoteList from './QuoteList'
import pb from './products.module.css'
import qs from './quotes.module.css'

// The Product Builder's three tabs (docs/design_handoff_product_builder/ › `Product Builder.dc.html`): 📋 Product List ·
// 📦 Products · 📄 Quotations, each with its count, linked to one another — products and quotations pick their items
// from the Product List, an item typed into either is added to it, a product opens a quotation, an accepted quotation
// asks for its work to be assigned (a toast-card, the bell, a banner). The address says where (`?tab=`, `?p=`, `?q=`),
// replaced, never pushed.

export type BuilderTab = 'catalog' | 'products' | 'quotes'

export default function ProductBuilderApp({ initialProducts, initialQuotes, tab: firstTab, product, quote, assign }: {
  initialProducts: ProductBook
  initialQuotes: QuoteBook
  tab: BuilderTab
  product: string | null
  quote: string | null
  assign: boolean
}) {
  const [tab, setTab] = useState<BuilderTab>(firstTab)
  const [products, setProducts] = useState<ProductBook>(initialProducts)
  const [qbook, setQbook] = useState<QuoteBook>(initialQuotes)
  const [productId, setProductId] = useState<string | null>(product)
  const [quoteId, setQuoteId] = useState<string | null>(quote && initialQuotes.quotes.some(q => q.id === quote) ? quote : null)
  const [assignFor, setAssignFor] = useState<string | null>(assign && quote ? quote : null)
  const [popup, setPopup] = useState<{ quote: string; title: string; meta: string } | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const popTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flash = useCallback((words: string) => {
    setToast(words)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2600)
  }, [])
  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    if (popTimer.current) clearTimeout(popTimer.current)
  }, [])

  // The address follows: the tab, the product or quotation open — written in place (`history.replaceState`), never
  // through the router: a router navigation renders the page again on the server, which cuts off a save still on its way
  // and leaves the router a five-minute copy of the page with the lists as they were (2026-11-13, the user: "product list
  // 加了东西后没得储存").
  useEffect(() => {
    const sp = new URLSearchParams()
    if (tab !== 'catalog') sp.set('tab', tab)
    if (tab === 'products' && productId) sp.set('p', productId)
    if (tab === 'quotes' && quoteId) sp.set('q', quoteId)
    const next = `${window.location.pathname}${sp.size ? `?${sp}` : ''}`
    if (`${window.location.pathname}${window.location.search}` !== next) window.history.replaceState(window.history.state, '', next)
  }, [tab, productId, quoteId])

  const scrollTop = () => document.querySelector<HTMLElement>('[data-mkt-own]')?.scrollTo({ top: 0 })
  const go = (t: BuilderTab) => {
    setTab(t)
    scrollTop()
  }

  const setItems = useCallback((fn: (items: CatalogItem[]) => CatalogItem[]) => setQbook(b => ({ ...b, items: fn(b.items) })), [])
  const setColumns = useCallback((fn: (columns: ItemColumn[]) => ItemColumn[]) => setQbook(b => ({ ...b, columns: fn(b.columns) })), [])
  // A quotation as the editor has it — its tasks, once assigned (here, in the window), are never taken back by it.
  const setQuote = useCallback((q: Quote) => setQbook(b => ({
    ...b, quotes: b.quotes.map(x => (x.id === q.id ? { ...q, tasks: q.tasks ?? x.tasks, assignedOn: q.assignedOn ?? x.assignedOn } : x)),
  })), [])
  const refreshQuotes = useCallback(async () => {
    const r = await readMktQuoteBook()
    if (r.ok) setQbook(b => ({ ...r.book, items: b.items, columns: b.columns }))
  }, [])

  // ── An item edited from a product's Items (the user, 2026-11-12: "在 package 加的品项也能改 day 等的资讯，其实他相当于在
  // product list 加一个产品 … 两者联动"): its days and the manager's own columns are the Product List's, so a change made
  // there is the list's — saved as typed (only what changed), and every product and quotation reading the item follows.
  // A name not on the list yet is added to it first, under its category; changes made while it is being added follow it.
  const itemsRef = useRef(qbook.items)
  itemsRef.current = qbook.items
  const itemTimers = useRef(new Map<string, { t: ReturnType<typeof setTimeout>; patch: ItemFacts }>())
  const creating = useRef(new Map<string, { pending: ItemFacts; done: Promise<CatalogItem | null> }>())
  useEffect(() => {
    const timers = itemTimers.current
    return () => {
      for (const [id, x] of timers) {
        clearTimeout(x.t)
        void saveMktItem(id, factsPayload(x.patch))
      }
    }
  }, [])
  const applyFacts = useCallback((id: string, f: ItemFacts) => setItems(xs => xs.map(x => (x.id === id ? withFacts(x, f) : x))), [setItems])
  const scheduleFacts = useCallback((id: string, f: ItemFacts) => {
    const cur = itemTimers.current.get(id)
    if (cur) clearTimeout(cur.t)
    const patch = mergeFacts(cur?.patch ?? {}, f)
    const t = setTimeout(() => {
      itemTimers.current.delete(id)
      void saveMktItem(id, factsPayload(patch)).then(r => { if (!r.ok) flash(r.reason) })
    }, 700)
    itemTimers.current.set(id, { t, patch })
  }, [flash])

  /** A name typed into a product that is not on the Product List: added under its category (with what was set for it). */
  const addItem = useCallback(async (name: string, cat: string, price: number | null, wf: string | null, facts: ItemFacts = {}): Promise<CatalogItem | null> => {
    const key = norm(name)
    const had = itemsRef.current.find(x => x.name && norm(x.name) === key)
    if (had) return had
    const busy = creating.current.get(key)
    if (busy) {
      busy.pending = mergeFacts(busy.pending, facts)
      return busy.done
    }
    const entry: { pending: ItemFacts; done: Promise<CatalogItem | null> } = { pending: {}, done: Promise.resolve(null) }
    entry.done = (async () => {
      const r = await saveMktItem(null, { cat, name, price, wf, ...factsPayload(facts) })
      creating.current.delete(key)
      if (!r.ok) {
        flash(r.reason)
        return null
      }
      setItems(xs => (xs.some(x => x.id === r.item.id) ? xs : [...xs, r.item]))
      flash(`Added “${r.item.name}” to the Product List`)
      if (Object.keys(entry.pending).length) {
        applyFacts(r.item.id, entry.pending)
        scheduleFacts(r.item.id, entry.pending)
      }
      return r.item
    })()
    creating.current.set(key, entry)
    return entry.done
  }, [applyFacts, flash, scheduleFacts, setItems])

  /** Days or a column of an item set from a product's Items: the Product List's item itself (added first when new). */
  const setItemFacts = useCallback((name: string, cat: string, price: number | null, wf: string | null, facts: ItemFacts) => {
    const key = norm(name)
    if (!key) return
    const had = itemsRef.current.find(x => x.name && norm(x.name) === key)
    if (had) {
      applyFacts(had.id, facts)
      scheduleFacts(had.id, facts)
      return
    }
    void addItem(name, cat, price, wf, facts)
  }, [addItem, applyFacts, scheduleFacts])

  const newQuote = async (with_: Product | null) => {
    if (busy) return
    setBusy(true)
    try {
      let pack = with_ ? qbook.packages.find(p => p.id === with_.id) ?? null : null
      if (with_ && !pack) {
        const fresh = await readMktQuoteBook()
        if (fresh.ok) {
          setQbook(b => ({ ...fresh.book, items: b.items, columns: b.columns }))
          pack = fresh.book.packages.find(p => p.id === with_.id) ?? null
        }
      }
      const r = await saveMktQuote(null, null, pack ? { lines: [packageLine(pack)] } : {})
      if (!r.ok) return flash(r.reason)
      setQbook(b => ({ ...b, quotes: [r.quote, ...b.quotes.filter(x => x.id !== r.quote.id)] }))
      setQuoteId(r.quote.id)
      setTab('quotes')
      scrollTop()
    } finally {
      setBusy(false)
    }
  }

  const duplicateQuote = async (q: Quote) => {
    const r = await duplicateMktQuote(q.id)
    if (!r.ok) return flash(r.reason)
    setQbook(b => ({ ...b, quotes: [r.quote, ...b.quotes] }))
    setQuoteId(r.quote.id)
    scrollTop()
    flash(`Duplicated ${q.no}`)
  }

  const clientName = (q: Quote) => (q.other ? q.client.trim() : qbook.clients.find(c => c.id === q.sub)?.name ?? '')
  const taskCount = (q: Quote) => q.lines.reduce((n, l) => n + (l.kind === 'item' ? 1 : l.items.filter(it => it.qty > 0).length), 0)

  const accepted = (q: Quote) => {
    setQuote(q)
    const name = clientName(q) || 'The client'
    const n = taskCount(q)
    setPopup({
      quote: q.id,
      title: `${name} confirmed ${q.no}`,
      meta: `${rm(quoteTotals(coreOf(q, name)).total)} · ${n} task${n === 1 ? '' : 's'} ready to assign. Due dates come from each item’s est. days.`,
    })
    if (popTimer.current) clearTimeout(popTimer.current)
    popTimer.current = setTimeout(() => setPopup(p => (p?.quote === q.id ? null : p)), 9000)
    // The bell's count is the shell's: it reads it again.
    window.dispatchEvent(new Event('mkt:shell-reload'))
  }

  const openQuote = quoteId ? qbook.quotes.find(q => q.id === quoteId) ?? null : null
  const assignQuote = assignFor ? qbook.quotes.find(q => q.id === assignFor) ?? null : null
  const tabs: [BuilderTab, string, string, number][] = [
    ['catalog', '📋', 'Product List', qbook.items.length],
    ['products', '📦', 'Products', products.products.length],
    ['quotes', '📄', 'Quotations', qbook.quotes.length],
  ]

  return (
    // Marketing's tokens wherever the page is drawn: in the Principal's (or any non-Marketing) view the page sits outside
    // MktShell, so every rgb(var(--mk-…)) was empty — menus and floats came out transparent over the rows (2026-11-13).
    <div className={`mkt-shell ${pb.page}`} style={{ background: 'transparent' }}>
      <div className={qs.appTabs} role="tablist" aria-label="Product Builder">
        {tabs.map(([k, emoji, label, n]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`${qs.appTab}${tab === k ? ` ${qs.appTabOn}` : ''}`} onClick={() => go(k)}>
            <span aria-hidden="true">{emoji}</span>
            <span className={qs.lbl} data-t={label}>{label}</span>
            <span className={qs.n}>{n}</span>
          </button>
        ))}
      </div>

      {tab === 'catalog' ? (
        <CatalogTab
          items={qbook.items}
          setItems={setItems}
          columns={qbook.columns}
          setColumns={setColumns}
          products={products.products}
          quotes={qbook.quotes}
          workflows={products.workflows}
          onRenamed={(p, b) => {
            if (p) setProducts(p)
            if (b) setQbook(cur => ({ ...b, items: cur.items, columns: cur.columns }))
          }}
          flash={flash}
        />
      ) : null}

      {tab === 'products' ? (
        <ProductBuilder
          book={products}
          setBook={setProducts}
          first={productId}
          onOpen={setProductId}
          items={qbook.items}
          columns={qbook.columns}
          onAddItem={(name, cat, price, wf) => void addItem(name, cat, price, wf)}
          onItemFacts={setItemFacts}
          onQuote={p => void newQuote(p)}
          onPublished={() => void refreshQuotes()}
          flash={flash}
        />
      ) : null}

      {tab === 'quotes' ? (
        openQuote ? (
          <QuoteEditor
            key={openQuote.id}
            quote={openQuote}
            setQuote={setQuote}
            book={qbook}
            setItems={setItems}
            people={qbook.people}
            onBack={() => { setQuoteId(null); scrollTop() }}
            onDuplicate={q => void duplicateQuote(q)}
            onAccepted={accepted}
            onAssign={() => setAssignFor(openQuote.id)}
            flash={flash}
          />
        ) : (
          <QuoteList book={qbook} busy={busy} onOpen={id => { setQuoteId(id); scrollTop() }} onNew={() => void newQuote(null)} />
        )
      ) : null}

      {popup ? (
        <div className={qs.popup} role="status">
          <span className={qs.okTile} aria-hidden="true">✅</span>
          <div className={qs.popBody}>
            <span className={qs.popTitle}>{popup.title}</span>
            <span className={qs.popMeta}>{popup.meta}</span>
            <div className={qs.popBtns}>
              <button type="button" className={qs.popGo} onClick={() => { setAssignFor(popup.quote); setQuoteId(popup.quote); setTab('quotes'); setPopup(null) }}>Assign tasks</button>
              <button type="button" className={qs.popLater} onClick={() => setPopup(null)}>Later</button>
            </div>
          </div>
        </div>
      ) : null}

      {assignQuote ? (
        <AssignTasks
          quote={assignQuote}
          book={qbook}
          clientName={clientName(assignQuote)}
          today={qbook.today}
          onClose={() => setAssignFor(null)}
          onDone={q => {
            setQuote(q)
            setAssignFor(null)
            window.dispatchEvent(new Event('mkt:shell-reload'))
          }}
          flash={flash}
        />
      ) : null}

      {toast ? <div className={pb.toast} role="status">{toast}</div> : null}
    </div>
  )
}
