'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { moveMktQuote, saveMktItem, saveMktQuote } from '@/lib/marketing/quote-actions'
import { catalogues, norm, type CatalogItem } from '@/lib/marketing/catalog'
import {
  addDays, coreOf, dmy, extrasWords, itemLine, lastSent, lineCalc, numOf, packageLine, quoteTotals, rm, sameCore, withExtras,
  type PackageLine, type Quote, type QuoteBook, type QuoteCore, type QuoteLine,
} from '@/lib/marketing/quotes'
import MoneyInput from './MoneyInput'
import QuoteDoc from './QuoteDoc'
import { pickDate } from './pick-date'
import qs from './quotes.module.css'

// A quotation's editor (`Product Builder.dc.html` › the quotation editor): 1 · Client (a subsidiary or Marketing's own
// client — its AR account under it — or an outside client named here; attention to; the quote date; valid for), 2 ·
// Items (a card a line — a package's items and their changes, an item's quantity; each line's est. delivery and
// remarks; + Add item or package), 3 · Notes to client; at the right the Summary (Client | Internal), the downloads
// (the client PDF, the internal pricing sheet), the link that moves it on (sent → accepted), and its History. Saved as it
// is typed — only what changed, on the count it was last saved on.

type SaveState = { state: 'saved' } | { state: 'saving' } | { state: 'error'; reason: string; stale: boolean }
const CORE_KEYS = ['sub', 'other', 'client', 'contact', 'date', 'valid', 'discount', 'note', 'lines'] as const

function patchOf(saved: Quote, now: Quote): Record<string, unknown> | null {
  const p: Record<string, unknown> = {}
  for (const k of CORE_KEYS) if (JSON.stringify(saved[k]) !== JSON.stringify(now[k])) p[k] = now[k]
  return Object.keys(p).length ? p : null
}

export default function QuoteEditor({ quote, setQuote, book, setItems, onBack, onDuplicate, onAccepted, onAssign, flash, people }: {
  quote: Quote
  setQuote: (q: Quote) => void
  book: QuoteBook
  setItems: (fn: (items: CatalogItem[]) => CatalogItem[]) => void
  onBack: () => void
  onDuplicate: (q: Quote) => void
  onAccepted: (q: Quote) => void
  onAssign: () => void
  flash: (words: string) => void
  people: QuoteBook['people']
}) {
  const [q, setQ] = useState<Quote>(quote)
  const [save, setSave] = useState<SaveState>({ state: 'saved' })
  const [busy, setBusy] = useState(false)
  const [picker, setPicker] = useState(false)
  const [pickTab, setPickTab] = useState<'items' | 'packages'>('items')
  const [pickQ, setPickQ] = useState('')
  const [sumMode, setSumMode] = useState<'client' | 'internal'>('client')
  const [doc, setDoc] = useState<{ kind: 'client' | 'internal'; rev: number | null } | null>(null)
  const savedRef = useRef<Quote>(quote)
  const nowRef = useRef<Quote>(quote)
  const revRef = useRef(quote.rev)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chain = useRef<Promise<boolean>>(Promise.resolve(true))

  const flush = useCallback((): Promise<boolean> => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    const run = chain.current.then(async () => {
      const now = nowRef.current
      const patch = patchOf(savedRef.current, now)
      if (!patch) {
        setSave(s => (s.state === 'error' ? s : { state: 'saved' }))
        return true
      }
      setSave({ state: 'saving' })
      const r = await saveMktQuote(now.id, revRef.current, patch)
      if (!r.ok) {
        setSave({ state: 'error', reason: r.reason, stale: /since you opened it/.test(r.reason) })
        return false
      }
      revRef.current = r.quote.rev
      savedRef.current = now
      setQuote({ ...nowRef.current, rev: r.quote.rev })
      if (nowRef.current === now) setSave({ state: 'saved' })
      return true
    })
    chain.current = run.catch(() => false)
    return run
  }, [setQuote])

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (timer.current || patchOf(savedRef.current, nowRef.current)) e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => {
      window.removeEventListener('beforeunload', warn)
      if (timer.current) void flush()
    }
  }, [flush])

  const change = (fn: (x: Quote) => Quote) => {
    const next = fn(nowRef.current)
    nowRef.current = next
    setQ(next)
    setQuote({ ...next, rev: revRef.current })
    if (save.state === 'error' && save.stale) return
    setSave({ state: 'saving' })
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void flush(), 700)
  }
  /** What the server said, taken whole (after a send or an acceptance, nothing of ours waits). */
  const take = (fresh: Quote) => {
    nowRef.current = fresh
    savedRef.current = fresh
    revRef.current = fresh.rev
    setQ(fresh)
    setQuote(fresh)
  }
  const setLine = (i: number, fn: (l: QuoteLine) => QuoteLine) => change(x => ({ ...x, lines: x.lines.map((l, j) => (j === i ? fn(l) : l)) }))

  // ── What it shows ──
  const client = q.sub ? book.clients.find(c => c.id === q.sub) ?? null : null
  const clientName = q.other ? q.client : client?.name ?? ''
  const ar = q.other ? book.arOther : client?.ar ?? null
  const hist = q.history
  const sent = lastSent(q)
  const dirty = !!sent?.snap && !sameCore(coreOf(q, clientName), sent.snap)
  const t = quoteTotals(q)
  const ready = q.lines.length > 0 && !!clientName.trim()
  const dlHint = ready ? '' : !clientName.trim() ? 'Pick the subsidiary first' : 'Add an item first'
  const canSend = ready && (q.status !== 'accepted' || dirty)
  const sendLabel = q.status === 'draft' ? 'Mark as sent to client (v1)' : dirty ? `Send revision v${(sent?.rev ?? 0) + 1} to client` : 'Client confirmed · mark as accepted'
  const adj = t.sub - t.list
  const validUntil = q.date ? dmy(addDays(q.date, q.valid)) : '—'
  const acceptedAt = q.acceptedOn ?? [...hist].reverse().find(h => h.kind === 'accepted')?.at ?? null
  const taskCount = quote.tasks ? quote.tasks.length : q.lines.reduce((n, l) => n + (l.kind === 'item' ? 1 : l.items.filter(it => it.qty > 0).length), 0)
  const names = quote.tasks ? [...new Set(quote.tasks.map(x => people.find(p => p.id === x.who)?.name).filter(Boolean))].join(', ') : ''

  const move = async () => {
    if (busy || !canSend) return
    setBusy(true)
    try {
      if (!(await flush())) return
      const to = q.status === 'draft' || dirty ? 'send' : 'accept'
      const r = await moveMktQuote(q.id, revRef.current, to)
      if (!r.ok) return flash(r.reason)
      take(r.quote)
      if (to === 'send') {
        const v = lastSent(r.quote)?.rev ?? 1
        flash(`${q.no} v${v} sent to client · kept in history`)
      } else {
        onAccepted(r.quote)
      }
    } finally {
      setBusy(false)
    }
  }

  const openDoc = async (kind: 'client' | 'internal') => {
    if (!ready) return flash(dlHint)
    if (!(await flush())) return
    setDoc({ kind, rev: null })
  }

  // ── The picker ──
  const pq = pickQ.trim().toLowerCase()
  const match = (...words: string[]) => !pq || words.join(' ').toLowerCase().includes(pq)
  const cats = catalogues(book.items)
  const pickItems = cats
    .map(cat => ({ cat, items: book.items.filter(x => x.cat === cat && x.name && match(x.name, x.desc, cat)) }))
    .filter(g => g.items.length)
  const pickPacks = book.packages.filter(p => match(p.name, p.code, packIncl(p)))
  const rawQ = pickQ.trim()
  const pickNew = rawQ && !book.items.some(x => norm(x.name) === norm(rawQ)) ? rawQ : null
  const addItemNamed = async (name: string) => {
    const r = await saveMktItem(null, { cat: 'Other', name })
    if (!r.ok) return flash(r.reason)
    setItems(xs => [...xs, r.item])
    change(x => ({ ...x, lines: [...x.lines, itemLine(r.item, x.date)] }))
    setPickQ('')
    flash(`Added “${r.item.name}” to the Product List`)
  }

  const viewing = doc?.rev != null ? hist.find(h => h.kind === 'sent' && h.rev === doc.rev) ?? null : null
  // The document: a version sent as it was frozen; the quotation now with each item's Product List columns as they are.
  const docCore: QuoteCore & { no: string } = viewing?.snap ? { ...viewing.snap, no: q.no } : { ...withExtras(coreOf(q, clientName), book.items, book.columns), no: q.no }
  const liveLines = withExtras(q, book.items, book.columns).lines

  return (
    <div>
      <div className={qs.crumbs}>
        <button type="button" className={qs.crumbLink} onClick={() => void flush().then(onBack)}>← Quotations</button>
        <span>/</span>
        <span>{q.no}</span>
      </div>
      <div className={qs.titleRow}>
        <span className={qs.bigName}>{clientName.trim() ? `${clientName.trim()} quotation` : 'New quotation'}</span>
        <StatusPill status={q.status} />
        <span className={qs.noChip}>{q.no}</span>
        {save.state === 'error' ? (
          <span className={qs.notSaved} role="alert">
            Not saved · {save.reason}
            {save.stale ? <button type="button" className={qs.reload} onClick={() => window.location.reload()}>Reload</button> : null}
          </span>
        ) : (
          <span className={qs.saved}>{save.state === 'saving' ? 'Saving…' : 'Saved'}</span>
        )}
        {sent ? (
          <span className={`${qs.revChip}${dirty ? ` ${qs.revChipDirty}` : ''}`}>v{sent.rev} sent {dmy(sent.at)}{dirty ? ' · edited since' : ''}</span>
        ) : null}
        <span className={qs.grow} />
        <button type="button" className={qs.ghost} onClick={() => void flush().then(ok => ok && onDuplicate(q))}>⧉ Duplicate</button>
      </div>

      {q.status === 'accepted' && !quote.tasks ? (
        <div className={`${qs.banner} ${qs.bannerWait}`}>
          <span><strong>Client confirmed on {dmy(acceptedAt)}.</strong> {taskCount} tasks are ready — assign them so the team can start.</span>
          <button type="button" className={qs.bannerBtn} onClick={onAssign}>Assign tasks</button>
        </div>
      ) : null}
      {quote.tasks ? (
        <div className={`${qs.banner} ${qs.bannerDone}`}>
          <span>{quote.tasks.length} tasks assigned on {dmy(quote.assignedOn)}{names ? ` · ${names}` : ''}</span>
          <button type="button" className={qs.bannerGhost} onClick={onAssign}>View tasks</button>
        </div>
      ) : null}

      <div className={qs.qEditor}>
        <div className={qs.qLeft}>
          <section className={qs.section}>
            <div className={qs.secHead}>1 · Client</div>
            <div className={qs.clientGrid}>
              <label className={qs.field}>
                <span className={qs.label}>Subsidiary</span>
                <select
                  className={qs.select}
                  value={q.other ? '__other' : q.sub ?? ''}
                  onChange={e => {
                    const v = e.target.value
                    change(x => (v === '__other' ? { ...x, other: true, sub: null } : { ...x, other: false, sub: v || null, client: '' }))
                  }}
                >
                  <option value="">Pick a subsidiary…</option>
                  {book.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  <option value="__other">Other (not a subsidiary)</option>
                </select>
                {q.other ? (
                  <input className={qs.input} value={q.client} maxLength={80} placeholder="Client or company name" aria-label="Client or company name"
                    onChange={e => change(x => ({ ...x, client: e.target.value }))} />
                ) : null}
                {(q.sub || q.other) && ar ? <span className={qs.posts}>Posts to <span className={qs.mono}>{ar}</span></span> : null}
              </label>
              <label className={qs.field}>
                <span className={qs.label}>Attention to</span>
                <input className={qs.input} value={q.contact} maxLength={80} placeholder="Name of the PIC" onChange={e => change(x => ({ ...x, contact: e.target.value }))} />
              </label>
              <label className={qs.field}>
                <span className={qs.label}>Quote date</span>
                <input className={qs.date} type="date" onClick={pickDate} value={q.date} required onChange={e => { const v = e.target.value; if (v) change(x => ({ ...x, date: v })) }} />
              </label>
              <div className={qs.field}>
                <span className={qs.label}>Valid for</span>
                <span className={qs.validRow}>
                  <span className={qs.validStep}>
                    <button type="button" aria-label="One day less" onClick={() => change(x => ({ ...x, valid: Math.max(1, x.valid - 1) }))}>−</button>
                    <span className={qs.validN}>{q.valid}</span>
                    <button type="button" aria-label="One day more" onClick={() => change(x => ({ ...x, valid: Math.min(90, x.valid + 1) }))}>+</button>
                  </span>
                  <span className={qs.validWords}>days · until {validUntil}</span>
                </span>
              </div>
            </div>
          </section>

          <section className={qs.section}>
            <div className={qs.secHead}>
              <span>2 · Items</span>
              <span className={qs.grow} />
              <span className={qs.secSum}>{q.lines.length ? `${q.lines.length} line${q.lines.length === 1 ? '' : 's'}` : 'Nothing added yet'}</span>
            </div>
            <div className={qs.lines}>
              {q.lines.map((l, li) => (
                <LineCard key={l.key} line={l} shown={liveLines[li]} items={book.items} onChange={fn => setLine(li, fn)}
                  onRemove={() => change(x => ({ ...x, lines: x.lines.filter((_, j) => j !== li) }))} />
              ))}
              <div className={qs.pickerWrap}>
                <button type="button" className={qs.addLine} aria-expanded={picker} onClick={() => setPicker(v => !v)}>+ Add item or package</button>
                {picker ? (
                  <div className={qs.picker} role="dialog" aria-label="Add item or package">
                    <div className={qs.pickerHead}>
                      <div className={qs.pickSeg} role="tablist">
                        {([['items', 'Items', book.items.filter(x => x.name).length], ['packages', 'Packages', book.packages.length]] as const).map(([k, label, n]) => (
                          <button key={k} type="button" role="tab" aria-selected={pickTab === k} className={`${qs.pickSegBtn}${pickTab === k ? ` ${qs.segOn}` : ''}`} onClick={() => setPickTab(k)}>
                            <span className={qs.lbl} data-t={label}>{label}</span><span className={qs.n}>{n}</span>
                          </button>
                        ))}
                      </div>
                      <input className={qs.pickQ} value={pickQ} onChange={e => setPickQ(e.target.value)} placeholder="Search the Product List, or type a new item" aria-label="Search the Product List" autoFocus />
                      <button type="button" className={qs.done} onClick={() => { setPicker(false); setPickQ('') }}>Done</button>
                    </div>
                    <div className={qs.pickBody}>
                      {pickTab === 'items' ? (
                        <>
                          {pickItems.map(g => (
                            <div key={g.cat}>
                              <div className={qs.pickCat}>{g.cat}</div>
                              {g.items.map(x => (
                                <button key={x.id} type="button" className={qs.pickRow} onClick={() => { change(qq => ({ ...qq, lines: [...qq.lines, itemLine(x, qq.date)] })); flash(`Added ${x.name}`) }}>
                                  <span className={qs.pickPlus}>+</span>
                                  <span className={qs.pickName}>{x.name} <span className={qs.pickCode}>{x.desc}</span></span>
                                  <span className={qs.pickPrice}>{rm(x.price)}{x.days ? ` · ${x.days}d` : ''}</span>
                                </button>
                              ))}
                            </div>
                          ))}
                          {pickNew ? (
                            <button type="button" className={qs.pickNew} onClick={() => void addItemNamed(pickNew)}>+ Add “{pickNew}” to the Product List and this quotation</button>
                          ) : null}
                          {!pickItems.length && !pickNew ? <div className={qs.pickEmpty}>Nothing found</div> : null}
                        </>
                      ) : (
                        <>
                          {pickPacks.map(p => (
                            <button key={p.id} type="button" className={qs.pickRow} onClick={() => { change(x => ({ ...x, lines: [...x.lines, packageLine(p)] })); setPicker(false); setPickQ(''); flash(`Added ${p.name}`) }}>
                              <span className={qs.pickPlus}>+</span>
                              <span className={qs.pickTwo}>
                                <span className={qs.pickName}>{p.name} <span className={qs.pickCode}>{p.code}</span></span>
                                <span className={qs.pickInc}>{packIncl(p)}{p.kind === 'recurring' ? ' / month' : ''}</span>
                              </span>
                              <span className={qs.pickPrice}>{rm(p.price)}{p.kind === 'recurring' ? '/mo' : ''}</span>
                            </button>
                          ))}
                          {!pickPacks.length ? <div className={qs.pickEmpty}>Nothing found</div> : null}
                        </>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <section className={qs.section}>
            <div className={qs.secHead}>3 · Notes to client</div>
            <div className={qs.notes}>
              <textarea className={qs.textarea} rows={3} value={q.note} maxLength={2000} placeholder="Payment terms, what is not included…" aria-label="Notes to client"
                onChange={e => change(x => ({ ...x, note: e.target.value }))} />
            </div>
          </section>
        </div>

        <div className={qs.qRight}>
          <div className={qs.card}>
            <div className={qs.cardHead}>
              <b>Summary</b>
              <span className={qs.grow} />
              <div className={qs.seg} role="tablist" aria-label="Summary">
                {([['client', 'Client'], ['internal', 'Internal']] as const).map(([k, label]) => (
                  <button key={k} type="button" role="tab" aria-selected={sumMode === k} className={`${qs.sumSegBtn}${sumMode === k ? ` ${qs.segOn}` : ''}`} onClick={() => setSumMode(k)}>
                    <span className={qs.lbl} data-t={label}>{label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className={qs.sumBody}>
              <div className={qs.sumRow}><span className={qs.sumK}>List value</span><span className={qs.grow} /><span className={qs.sumV}>{rm(t.list)}</span></div>
              {adj !== 0 ? (
                <div className={qs.sumRow}>
                  <span className={qs.sumK}>Adjustments</span><span className={qs.grow} />
                  <span className={`${qs.sumV} ${adj > 0 ? qs.up : qs.down}`}>{adj > 0 ? '+' : '−'}{rm(Math.abs(adj))}</span>
                </div>
              ) : null}
              <div className={qs.sumRow} style={{ alignItems: 'center' }}>
                <span className={qs.sumK}>Discount</span><span className={qs.grow} />
                <span className={qs.disc}>
                  <input className={qs.discIn} inputMode="decimal" value={q.discount || q.discount === 0 ? String(q.discount) : ''} aria-label="Discount"
                    onChange={e => change(x => ({ ...x, discount: Math.min(100, numOf(e.target.value) ?? 0) }))} />
                  <span className={qs.discPct}>%</span>
                </span>
              </div>
              <div className={qs.hr} />
              <div className={qs.sumRow}><span className={qs.totalK}>Quotation total</span><span className={qs.grow} /><span className={qs.totalV}>{rm(t.total)}</span></div>
              {t.monthly > 0 ? <div className={qs.monthly}>incl. {rm(t.monthly)} / month recurring</div> : null}
              {sumMode === 'internal' ? (
                <div className={qs.internal}>
                  <div className={qs.intHead}><span className={qs.capsLbl}>Internal</span><span className={qs.lockChip}>🔒 Manager only</span></div>
                  <div className={qs.intRow}><span className={qs.sumK}>Internal cost</span><span className={qs.grow} /><span className={qs.sumV}>{t.hasCost ? rm(t.cost) : '—'}</span></div>
                  <div className={qs.intRow}><span className={qs.sumK}>Gross profit</span><span className={qs.grow} /><span className={qs.sumV}>{t.hasCost ? rm(t.profit) : '—'}</span></div>
                  <div className={qs.sumRow}>
                    <span className={qs.sumK}>Margin</span><span className={qs.grow} />
                    <span className={`${qs.intMargin}${t.margin != null && t.margin < 20 ? ` ${qs.red}` : ''}`}>{t.margin == null ? '—' : `${t.margin}%`}</span>
                  </div>
                  {marginWarn(t, q.lines.length) ? <div className={qs.warn}>{marginWarn(t, q.lines.length)}</div> : null}
                </div>
              ) : null}
            </div>
          </div>
          <div className={qs.dlCard}>
            <span className={qs.capsLbl}>Download</span>
            <button type="button" className={qs.dlPrimary} style={{ opacity: ready ? 1 : 0.45 }} onClick={() => void openDoc('client')}>
              <span aria-hidden="true">📄</span><span className={qs.dlWords}>Client quotation</span><span className={qs.dlFmt}>PDF</span>
            </button>
            <button type="button" className={qs.dlGhost} style={{ opacity: ready ? 1 : 0.45 }} onClick={() => void openDoc('internal')}>
              <span aria-hidden="true">🔒</span><span className={qs.dlWords}>Internal pricing sheet</span><span className={qs.dlFmtMuted}>CSV</span>
            </button>
            {dlHint ? <span className={qs.dlHint}>{dlHint}</span> : null}
            {canSend ? <button type="button" className={qs.sendLink} disabled={busy} onClick={() => void move()}>{sendLabel}</button> : null}
          </div>
          <div className={qs.histCard}>
            <span className={qs.capsLbl} style={{ marginBottom: 6 }}>History</span>
            {[...hist].reverse().map(h => (
              <div key={h.seq} className={qs.histRow}>
                <span className={qs.histDot} style={{ background: h.kind === 'accepted' ? 'rgb(var(--mk-done-dot))' : 'rgb(var(--mk-wait-dot))' }} />
                <span className={qs.histWho}>
                  <span className={qs.histLbl}>
                    v{h.rev} {h.kind === 'accepted' ? 'accepted' : 'sent'}
                    {h.kind === 'sent' && h.rev === sent?.rev && !dirty ? <span className={qs.current}>current</span> : null}
                  </span>
                  <span className={qs.histDate}>{dmy(h.at)}</span>
                </span>
                <span className={qs.histTotal}>{h.snap ? rm(h.total) : ''}</span>
                {h.snap ? <button type="button" className={qs.view} onClick={() => setDoc({ kind: 'client', rev: h.rev })}>View</button> : null}
              </div>
            ))}
            {!hist.length ? <span className={qs.histNone}>Nothing sent yet. Each version you send to the client is kept here.</span> : null}
          </div>
        </div>
      </div>

      {doc ? (
        <QuoteDoc
          kind={doc.kind}
          quote={docCore}
          quoteId={q.id}
          viewing={viewing ? { rev: viewing.rev, at: viewing.at } : null}
          account={ar ?? ''}
          onClose={() => setDoc(null)}
          flash={flash}
        />
      ) : null}
    </div>
  )
}

const packIncl = (p: QuoteBook['packages'][number]) =>
  p.groups.flatMap(g => g.items).filter(it => it.qty > 0 && it.name.trim()).map(it => `${it.qty} ${it.name.trim().toLowerCase()}`).join(' + ') || 'Nothing added yet'

function marginWarn(t: ReturnType<typeof quoteTotals>, lines: number) {
  if (!t.hasCost && lines) return 'A product has no internal cost — margin can’t be worked out'
  return t.margin != null && t.margin < 20 ? 'Below 20% margin' : ''
}

export function StatusPill({ status }: { status: Quote['status'] }) {
  const tone = status === 'sent' ? qs.stSent : status === 'accepted' ? qs.stAccepted : qs.stDraft
  return <span className={`${qs.pill} ${tone}`}><span className={qs.pillDot} />{status === 'sent' ? 'Sent' : status === 'accepted' ? 'Accepted' : 'Draft'}</span>
}

/** One line of the quotation: its head (name, code, kind, list price, its steppers, the price quoted), a package's items
 * and their changes, "Reset to list", its est. delivery and remarks. */
function LineCard({ line: l, shown, items, onChange, onRemove }: {
  line: QuoteLine
  /** The same line with its items' Product List columns as they are now (what it shows under each name). */
  shown?: QuoteLine
  items: CatalogItem[]
  onChange: (fn: (l: QuoteLine) => QuoteLine) => void
  onRemove: () => void
}) {
  const c = lineCalc(l)
  const isItem = l.kind === 'item'
  const adjusted = l.price != null || c.extras !== 0
  const listUnit = isItem ? l.list : l.list
  const diff = c.price - listUnit
  const cat = isItem ? items.find(x => x.id === l.item)?.cat ?? l.cat : ''
  return (
    <div className={qs.line}>
      <div className={qs.lineHead}>
        <div className={qs.lineWho}>
          <span className={qs.lineName}>
            <b>{l.name}</b>
            <span className={qs.lineCode}>{isItem ? cat : l.code}</span>
            <span className={qs.lineKind}>{isItem ? `Item · ${cat}` : l.pkind === 'recurring' ? 'Recurring monthly' : 'One-time project'}</span>
          </span>
          <span className={qs.lineList}>
            {isItem ? `List ${rm(l.list)} each${l.days ? ` · est. ${l.days} days` : ''}` : `List ${rm(l.list)}${l.pkind === 'recurring' ? ' / month' : ''} · v${l.version}`}
          </span>
          {shown?.kind === 'item' && extrasWords(shown.extra) ? <span className={qs.extras} title={extrasWords(shown.extra)}>{extrasWords(shown.extra)}</span> : null}
        </div>
        {isItem ? (
          <span className={qs.stepWrap}>
            <span className={qs.stepLbl}>Qty</span>
            <span className={qs.step}>
              <button type="button" aria-label="One less" onClick={() => onChange(x => ({ ...x, qty: Math.max(1, (x as typeof l).qty - 1) }) as QuoteLine)}>−</button>
              <span className={qs.stepN}>{l.qty}</span>
              <button type="button" aria-label="One more" onClick={() => onChange(x => ({ ...x, qty: Math.min(999, (x as typeof l).qty + 1) }) as QuoteLine)}>+</button>
            </span>
          </span>
        ) : null}
        {!isItem && l.pkind === 'recurring' ? (
          <span className={qs.stepWrap}>
            <span className={qs.stepLbl}>Months</span>
            <span className={qs.step}>
              <button type="button" aria-label="One month less" onClick={() => onChange(x => ({ ...(x as PackageLine), months: Math.max(1, (x as PackageLine).months - 1) }))}>−</button>
              <span className={qs.stepN}>{l.months}</span>
              <button type="button" aria-label="One month more" onClick={() => onChange(x => ({ ...(x as PackageLine), months: Math.min(36, (x as PackageLine).months + 1) }))}>+</button>
            </span>
          </span>
        ) : null}
        <span className={`${qs.quoted}${l.price != null ? ` ${qs.quotedSet}` : ''}`}>
          <span className={qs.rm}>RM</span>
          <MoneyInput className={qs.quotedIn} value={isItem ? c.price : l.price ?? c.computed} label="Quoted price" onChange={v => onChange(x => ({ ...x, price: v }))} />
          <span className={qs.rm}>{isItem ? 'each' : l.pkind === 'recurring' ? '/mo' : ''}</span>
        </span>
        <button type="button" className={qs.lineX} aria-label="Remove product" onClick={onRemove}>×</button>
      </div>
      {!isItem ? (
        <>
          <div className={`${qs.pRow} ${qs.pHead}`}><span>Item</span><span>Qty {l.pkind === 'recurring' ? '/ mo' : ''}</span><span style={{ textAlign: 'right' }}>Unit price</span><span style={{ textAlign: 'right' }}>Change</span></div>
          {l.items.map((it, ii) => {
            const d = (it.qty - it.base) * it.unit
            const setQty = (n: number) => onChange(x => {
              const p = x as PackageLine
              return { ...p, price: null, items: p.items.map((y, j) => (j === ii ? { ...y, qty: n } : y)) }
            })
            return (
              <div key={`${it.name}:${ii}`} className={qs.pRow}>
                <span className={qs.pItem}>
                  <span className={qs.pGroup}>{it.group} ·</span>{it.name}
                  {shown?.kind === 'package' && extrasWords(shown.items[ii]?.extra) ? <span className={qs.extras} title={extrasWords(shown.items[ii]?.extra)}>{extrasWords(shown.items[ii]?.extra)}</span> : null}
                </span>
                <span className={qs.pStep}>
                  <button type="button" aria-label="One less" onClick={() => setQty(Math.max(0, it.qty - 1))}>−</button>
                  <span className={`${qs.pStepN}${it.qty !== it.base ? ` ${qs.pStepMoved}` : ''}`}>{it.qty}</span>
                  <button type="button" aria-label="One more" onClick={() => setQty(Math.min(999, it.qty + 1))}>+</button>
                </span>
                <span className={qs.pUnit}>{rm(it.unit)}</span>
                <span className={`${qs.pDelta}${d > 0 ? ` ${qs.up}` : d < 0 ? ` ${qs.down}` : ''}`}>{d === 0 ? '—' : `${d > 0 ? '+' : '−'}${rm(Math.abs(d))}`}</span>
              </div>
            )
          })}
        </>
      ) : null}
      {!isItem && adjusted ? (
        <div className={qs.adjust}>
          <span>{diff >= 0 ? '+' : '−'}{rm(Math.abs(diff))} vs list{l.price != null ? ' · price set by hand' : ' · from item changes'}</span>
          <span className={qs.grow} />
          <button type="button" className={qs.linkBtn} onClick={() => onChange(x => ({ ...(x as PackageLine), price: null, items: (x as PackageLine).items.map(it => ({ ...it, qty: it.base })) }))}>Reset to list</button>
        </div>
      ) : null}
      <div className={qs.lineFoot}>
        <label className={qs.field} style={{ gap: 4 }}>
          <span className={qs.miniLbl}>Est. delivery</span>
          <input className={`${qs.date} ${qs.dateSm}`} type="date" onClick={pickDate} value={l.eta ?? ''} onChange={e => onChange(x => ({ ...x, eta: e.target.value || null }))} />
        </label>
        <label className={qs.field} style={{ gap: 4 }}>
          <span className={qs.miniLbl}>Remarks</span>
          <input className={qs.miniIn} value={l.remark} maxLength={200} placeholder="e.g. 2 rounds of revisions, client provides footage" onChange={e => onChange(x => ({ ...x, remark: e.target.value }))} />
        </label>
      </div>
    </div>
  )
}
