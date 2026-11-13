'use client'

import { useState } from 'react'
import { coreOf, dmy, lastSent, quoteTotals, rm, QUOTE_HINT, type Quote, type QuoteBook, type QuoteStatus } from '@/lib/marketing/quotes'
import { StatusPill } from './QuoteEditor'
import qs from './quotes.module.css'

// The quotations (`Product Builder.dc.html` › 📄 Quotations): the client filter (each client with its count, × to
// clear), the status seg (its counts follow the client), + New quotation; a row each — its number and the version last
// sent, the client's dot, its products, its total, its status (its hint as the tooltip) and its date.

type Filter = 'all' | QuoteStatus
const FILTERS: [Filter, string][] = [['all', 'All'], ['draft', 'Draft'], ['sent', 'Sent'], ['accepted', 'Accepted']]

export default function QuoteList({ book, busy, onOpen, onNew }: {
  book: QuoteBook
  busy: boolean
  onOpen: (id: string) => void
  onNew: () => void
}) {
  const [client, setClient] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const nameOf = (q: Quote) => (q.other ? q.client.trim() : book.clients.find(c => c.id === q.sub)?.name ?? '')
  const keyOf = (q: Quote) => (q.other ? `other:${q.client.trim().toLowerCase()}` : q.sub ?? '')
  // The clients that have a quotation: the group's and Marketing's own in their order, then the outside ones by name.
  const used = [
    ...book.clients.filter(c => book.quotes.some(q => !q.other && q.sub === c.id)).map(c => ({ key: c.id, name: c.name })),
    ...[...new Map(book.quotes.filter(q => q.other && q.client.trim()).map(q => [keyOf(q), q.client.trim()])).entries()].map(([key, name]) => ({ key, name })),
  ]
  const base = book.quotes.filter(q => !client || keyOf(q) === client)
  const counts: Record<Filter, number> = { all: base.length, draft: 0, sent: 0, accepted: 0 }
  for (const q of base) counts[q.status]++
  const rows = base.filter(q => filter === 'all' || q.status === filter)

  return (
    <div>
      <div className={qs.head}>
        <span className={qs.headIcon} aria-hidden="true">📄</span>
        <span className={qs.title}>Quotations</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
          <select className={`${qs.caretSel}${client ? ` ${qs.caretSelOn}` : ''}`} value={client} aria-label="Client" onChange={e => setClient(e.target.value)}>
            <option value="">All clients · {book.quotes.length}</option>
            {used.map(c => <option key={c.key} value={c.key}>{c.name} · {book.quotes.filter(q => keyOf(q) === c.key).length}</option>)}
          </select>
          {client ? <button type="button" className={qs.clearX} aria-label="Show all clients" onClick={() => setClient('')}>×</button> : null}
        </span>
        <div className={qs.seg} role="tablist" aria-label="Quotations by status">
          {FILTERS.map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={filter === k} className={`${qs.segBtn}${filter === k ? ` ${qs.segOn}` : ''}`} onClick={() => setFilter(k)}>
              <span className={qs.lbl} data-t={label}>{label}</span><span className={qs.n}>{counts[k]}</span>
            </button>
          ))}
        </div>
        <span className={qs.grow} />
        <button type="button" className={qs.primary} disabled={busy} onClick={onNew}>+ New quotation</button>
      </div>
      <div className={qs.qTable}>
        <div className={qs.qScroll}>
          <div className={`${qs.qRow} ${qs.qHead}`}><span>Quotation</span><span>Client</span><span>Products</span><span style={{ textAlign: 'right' }}>Total</span><span>Status</span><span>Date</span></div>
          {rows.map(q => {
            const name = nameOf(q)
            const sent = lastSent(q)
            const dot = q.other ? 'rgb(var(--mk-dash))' : book.clients.find(c => c.id === q.sub)?.dot || 'rgb(var(--mk-dash))'
            const hint = q.status === 'accepted' ? `${QUOTE_HINT.accepted} · ${q.tasks ? 'tasks assigned' : 'tasks not assigned yet'}` : QUOTE_HINT[q.status]
            return (
              <div key={q.id} className={qs.qRow} role="button" tabIndex={0} onClick={() => onOpen(q.id)} onKeyDown={e => { if (e.key === 'Enter') onOpen(q.id) }}>
                <span className={qs.qNo}><span className={qs.qNoN}>{q.no}</span><span className={qs.qNoV}>{sent ? `v${sent.rev}` : ''}</span></span>
                <span className={qs.qClient}><span className={qs.dot7} style={{ background: dot }} /><span>{name || '—'}</span></span>
                <span className={qs.qProducts}>{q.lines.map(l => l.name).join(', ') || 'No products yet'}</span>
                <span className={qs.qTotal}>{rm(quoteTotals(coreOf(q, name)).total)}</span>
                <span title={hint}><StatusPill status={q.status} /></span>
                <span className={qs.qDate}>{dmy(q.date)}</span>
              </div>
            )
          })}
          {!rows.length ? <div className={qs.empty}>{book.quotes.length ? 'None here' : 'No quotations yet'}</div> : null}
        </div>
      </div>
    </div>
  )
}
