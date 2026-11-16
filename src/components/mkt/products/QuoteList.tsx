'use client'

import { useState } from 'react'
import { norm } from '@/lib/marketing/catalog'
import { addDays, coreOf, dmy, lastSent, quoteTotals, rm, QUOTE_HINT, type Quote, type QuoteBook, type QuoteStatus } from '@/lib/marketing/quotes'
import { longPress } from '../workflows/longPress'
import Modal from './Modal'
import PopMenu, { menuAt, type MenuAt } from './PopMenu'
import qs from './quotes.module.css'
import v2 from './v2.module.css'

// The quotations (v2, docs/design_handoff_product_builder_v2/ §6): the status seg (All · Draft · Sent · Accepted, each
// with its dot and its count — it replaces the stat cards), the client select, a search, 🗄 Archived · N, + New
// quotation; a row each — its number and the version last sent with its date under them, its client, its products, its
// total, its status (a pill of one width) and a note beside it, ⋯. "Assign tasks →" opens the assignment at once.
// Right-click, a long press or ⋯: Open, ⧉ Duplicate, Archive / Unarchive (any status — hidden from the list, nothing
// else changes), Delete… (a draft only — 2026-11-14, the user: "只有 Draft 能删").

type Filter = 'all' | QuoteStatus
const FILTERS: [Filter, string, string][] = [['all', 'All', v2.sdotAll], ['draft', 'Draft', v2.sdotDraft], ['sent', 'Sent', v2.sdotSent], ['accepted', 'Accepted', v2.sdotActive]]
const PILL: Record<QuoteStatus, [string, string]> = { draft: ['Draft', v2.pDraft], sent: ['Sent', v2.pSent], accepted: ['Accepted', v2.pAccepted] }

/** Days from one YYYY-MM-DD to another (never through a timezone). */
function daysBetween(from: string, to: string): number {
  const d = (s: string) => { const [y, m, dd] = s.slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, dd) }
  return Math.round((d(to) - d(from)) / 86400000)
}

/** The note beside a quotation's status (v2 §6). */
export function quoteNote(q: Pick<Quote, 'status' | 'date' | 'valid' | 'tasks'>, today: string): { text: string; wait?: boolean; assign?: boolean } {
  if (q.status === 'draft') return { text: 'Not sent yet' }
  if (q.status === 'accepted') return q.tasks ? { text: 'Tasks assigned' } : { text: 'Assign tasks →', assign: true }
  if (!q.date || !today) return { text: '' }
  const left = daysBetween(today, addDays(q.date, q.valid))
  if (left < 0) return { text: `Expired ${dmy(addDays(q.date, q.valid))}`, wait: true }
  if (left <= 3) return { text: left === 0 ? 'Expires today' : `Expires in ${left} day${left === 1 ? '' : 's'}`, wait: true }
  return { text: `Valid ${left} more days`, wait: true }
}

export default function QuoteList({ book, busy, onOpen, onNew, onDelete, onDuplicate, onArchive, onAssign }: {
  book: QuoteBook
  busy: boolean
  onOpen: (id: string) => void
  onNew: () => void
  onDelete?: (q: Quote) => void
  onDuplicate?: (q: Quote) => void
  onArchive?: (q: Quote, on: boolean) => void
  onAssign?: (q: Quote) => void
}) {
  const [client, setClient] = useState('')
  const [search, setSearch] = useState('')
  const [archived, setArchived] = useState(false)
  const [ctx, setCtx] = useState<{ id: string; at: MenuAt; fromButton: boolean } | null>(null)
  const [delFor, setDelFor] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const nameOf = (q: Quote) => (q.other ? q.client.trim() : book.clients.find(c => c.id === q.sub)?.name ?? '')
  const keyOf = (q: Quote) => (q.other ? `other:${q.client.trim().toLowerCase()}` : q.sub ?? '')
  const totalOf = (q: Quote) => quoteTotals(coreOf(q, nameOf(q))).total
  // The live list: archived ones are counted apart (v2 §6 — the counts come from the live list).
  const live = book.quotes.filter(q => !q.archivedAt)
  const shelf = book.quotes.filter(q => q.archivedAt)
  const pool = archived ? shelf : live
  // The clients that have a quotation: the group's and Marketing's own in their order, then the outside ones by name.
  const used = [
    ...book.clients.filter(c => pool.some(q => !q.other && q.sub === c.id)).map(c => ({ key: c.id, name: c.name })),
    ...[...new Map(pool.filter(q => q.other && q.client.trim()).map(q => [keyOf(q), q.client.trim()])).entries()].map(([key, name]) => ({ key, name })),
  ]
  const s = norm(search)
  const base = pool.filter(q => (!client || keyOf(q) === client) && (!s || norm(`${q.no} ${nameOf(q)} ${q.lines.map(l => l.name).join(' ')}`).includes(s)))
  const counts: Record<Filter, number> = { all: base.length, draft: 0, sent: 0, accepted: 0 }
  for (const q of base) counts[q.status]++
  const rows = base.filter(q => filter === 'all' || q.status === filter)
  const sum = rows.reduce((n, q) => n + totalOf(q), 0)

  const ctxQ = ctx ? book.quotes.find(q => q.id === ctx.id) ?? null : null
  const delQ = delFor ? book.quotes.find(q => q.id === delFor) ?? null : null
  const close = () => setCtx(null)

  return (
    <div>
      <div className={v2.toolbar}>
        {archived ? (
          <button type="button" className={v2.textBtn} onClick={() => { setArchived(false); setFilter('all') }}>← Back to quotations</button>
        ) : null}
        <div className={v2.seg} role="tablist" aria-label="Quotations by status">
          {FILTERS.map(([k, label, dot]) => (
            <button key={k} type="button" role="tab" aria-selected={filter === k} className={`${v2.segBtn}${filter === k ? ` ${v2.segOn}` : ''}`} onClick={() => setFilter(k)}>
              <span className={`${v2.sdot} ${dot}`} />
              <span className={qs.lbl} data-t={label}>{label}</span><span className={v2.segN}>{counts[k]}</span>
            </button>
          ))}
        </div>
        <select className={v2.clientSel} value={client} aria-label="Client" onChange={e => setClient(e.target.value)}>
          <option value="">All clients</option>
          {used.map(c => <option key={c.key} value={c.key}>{c.name}</option>)}
        </select>
        <span className={`${v2.searchWrap} ${v2.qSearch}`}>
          <input type="search" className={v2.search} placeholder="Search" aria-label="Search quotations" value={search} onChange={e => setSearch(e.target.value)} />
        </span>
        <span className={v2.grow} />
        {archived ? null : (
          <button type="button" className={v2.textBtn} onClick={() => { setArchived(true); setFilter('all') }}>🗄 Archived · {shelf.length}</button>
        )}
        <button type="button" className={v2.primary} disabled={busy} onClick={onNew}>+ New quotation</button>
      </div>
      <div className={v2.qTable}>
        <div className={v2.qScroll}>
          <div className={`${v2.qRow} ${v2.qHead}`}><span>Quotation</span><span>Client</span><span>Products</span><span style={{ textAlign: 'right' }}>Total</span><span>Status</span><span /></div>
          {rows.map(q => {
            const name = nameOf(q)
            const sent = lastSent(q)
            const dot = q.other ? 'rgb(var(--mk-dash))' : book.clients.find(c => c.id === q.sub)?.dot || 'rgb(var(--mk-dash))'
            const note = quoteNote(q, book.today)
            const [label, tone] = PILL[q.status]
            const open = () => onOpen(q.id)
            return (
              <div key={q.id} className={v2.qRow} role="button" tabIndex={0} onClick={open}
                onKeyDown={e => { if (e.target === e.currentTarget && e.key === 'Enter') open() }}
                onContextMenu={e => { e.preventDefault(); setCtx({ id: q.id, at: menuAt(e), fromButton: false }) }}
                {...longPress((x, y) => setCtx({ id: q.id, at: { x, y }, fromButton: false }))}>
                <span className={v2.qNo}>
                  <span className={v2.qNoTop}><span className={v2.qNoN}>{q.no}</span>{sent ? <span className={v2.qNoV}>v{sent.rev}</span> : null}</span>
                  <span className={v2.qDate}>{dmy(q.date)}</span>
                </span>
                <span className={v2.qClient}><span className={v2.dot7} style={{ background: dot }} /><span>{name || '—'}</span></span>
                <span className={v2.qProducts}>
                  {q.lines.map(l => l.name).join(', ') || 'No products yet'}
                  {q.status === 'draft' && q.removed.length ? <span className={v2.qRemoved} title={`Removed: ${q.removed.join(', ')}`}>Removed: {q.removed.join(', ')}</span> : null}
                </span>
                <span className={v2.qTotal}>{rm(totalOf(q))}</span>
                <span className={v2.qStatus}>
                  <span className={`${v2.pill} ${v2.pillFixed} ${tone}`} title={QUOTE_HINT[q.status]}><span className={v2.pdot} />{label}</span>
                  {note.assign && onAssign ? (
                    <button type="button" className={v2.assignBtn} onClick={e => { e.stopPropagation(); onAssign(q) }}>Assign tasks →</button>
                  ) : note.text ? (
                    <span className={`${v2.qNote}${note.wait ? ` ${v2.qNoteWait}` : ''}`} title={note.text}>{note.text}</span>
                  ) : null}
                </span>
                <button type="button" className={`${v2.more}${ctx?.id === q.id ? ` ${v2.moreOn}` : ''}`} aria-label={`More for ${q.no}`} aria-haspopup="menu"
                  onClick={e => { e.stopPropagation(); setCtx({ id: q.id, at: menuAt(e, true), fromButton: true }) }}>⋯</button>
              </div>
            )
          })}
          {!rows.length ? <div className={qs.empty}>{archived ? 'Nothing archived' : book.quotes.length ? 'None here' : 'No quotations yet'}</div> : (
            <div className={`${v2.qRow} ${v2.qFoot}`}>
              <span style={{ gridColumn: '1 / span 3' }}>{rows.length} quotation{rows.length === 1 ? '' : 's'}</span>
              <span className={v2.qTotal}>{rm(sum)}</span>
              <span /><span />
            </div>
          )}
        </div>
      </div>
      {ctxQ && ctx ? (
        <PopMenu at={ctx.at} width={232} label={ctxQ.no} onClose={close} alignRight={ctx.fromButton}>
          <div className={v2.menuHead}><span className={v2.menuName}>{ctxQ.no}</span><span className={v2.menuSub}>{nameOf(ctxQ) || '—'}</span></div>
          <button type="button" role="menuitem" className={v2.menuRow} onClick={() => { close(); onOpen(ctxQ.id) }}><span className={v2.grow}>Open</span><span className={v2.menuKey}>↵</span></button>
          {onDuplicate ? <button type="button" role="menuitem" className={v2.menuRow} onClick={() => { close(); onDuplicate(ctxQ) }}>⧉ Duplicate</button> : null}
          {onArchive ? (
            <button type="button" role="menuitem" className={`${v2.menuRow} ${v2.menuRowTop}`} onClick={() => { close(); onArchive(ctxQ, !ctxQ.archivedAt) }}>
              <span className={v2.menuTwo}><span>🗄 {ctxQ.archivedAt ? 'Unarchive' : 'Archive'}</span><span className={v2.menuHint}>{ctxQ.archivedAt ? 'Back on the list' : 'Hide from list'}</span></span>
            </button>
          ) : null}
          {ctxQ.status === 'draft' && onDelete ? (
            <>
              <div className={v2.menuLine} />
              <button type="button" role="menuitem" className={`${v2.menuRow} ${v2.menuDel}`} onClick={() => { close(); setDelFor(ctxQ.id) }}>Delete…</button>
            </>
          ) : null}
        </PopMenu>
      ) : null}
      {delQ && onDelete ? (
        <Modal label={`Delete ${delQ.no}`} onClose={() => setDelFor(null)} busy={busy}>
          <div className={v2.modalHead}><span className={v2.modalTitle}>Delete {delQ.no}?</span></div>
          <div className={v2.modalSub}>{nameOf(delQ) || 'No client'} · {rm(totalOf(delQ))}. It was never sent, so nothing else changes.</div>
          <div className={v2.modalFoot}>
            <span className={v2.grow} />
            <button type="button" className={v2.ghost} disabled={busy} onClick={() => setDelFor(null)}>Keep</button>
            <button type="button" className={v2.redFill} disabled={busy} onClick={() => { setDelFor(null); onDelete(delQ) }}>Delete quotation</button>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}
