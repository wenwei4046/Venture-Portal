'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { flash } from '@/components/hrv/toast'
import { cancelHiringRequest, reopenHiringRequest } from '@/lib/hiring/actions'
import {
  LISTING_STATS,
  answerOf,
  budgetText,
  candidateMix,
  listingCount,
  personName,
  type ListingFilter,
} from '@/lib/hiring/view'
import type { HiringBoard, HiringRequest } from '@/lib/hiring/types'
import { StatusChip } from './bits'
import s from './hiring.module.css'

/**
 * Hiring › Requests › Listing (README §11, portal-30): five filter cards over
 * one table — ID · Position · Department · Requested by · Owner (HR) · Budget
 * · Expected start · Candidates · Status. A click opens the request's page; a
 * right-click its menu (Acknowledge, Mark filled…, Cancel request, Reopen,
 * Open details).
 */
export default function RequestListing({ board, canApprove }: { board: HiringBoard; canApprove: boolean }) {
  const router = useRouter()
  const [filter, setFilter] = useState<ListingFilter>('all')
  const [menu, setMenu] = useState<string | null>(null)
  const [, start] = useTransition()
  const list = board.requests.filter(r => filter === 'all' || r.status === filter)
  const open = (id: string) => router.push(`/hiring/requests/${encodeURIComponent(id)}`)

  const menuFor = (r: HiringRequest) =>
    [
      canApprove && r.status === 'submitted' && {
        label: 'Acknowledge',
        tone: undefined,
        click: () => {
          // An owner is picked on the request's page first.
          flash('Pick who in HR is taking this on, then Acknowledge')
          open(r.id)
        },
      },
      canApprove && (r.status === 'submitted' || r.status === 'acknowledged') && { label: 'Mark filled…', tone: undefined, click: () => open(r.id) },
      canApprove && (r.status === 'submitted' || r.status === 'acknowledged') && {
        label: 'Cancel request',
        tone: 'danger',
        click: () =>
          start(async () => {
            const out = await cancelHiringRequest(r.id)
            flash(out.ok ? `${r.id} cancelled` : out.reason)
          }),
      },
      canApprove && (r.status === 'filled' || r.status === 'cancelled') && {
        label: 'Reopen',
        tone: undefined,
        click: () =>
          start(async () => {
            const out = await reopenHiringRequest(r.id)
            if (!out.ok) flash(out.reason)
          }),
      },
      { label: 'Open details', tone: 'quiet', click: () => open(r.id) },
    ].filter(Boolean) as Array<{ label: string; tone: string | undefined; click: () => void }>

  return (
    <>
      <div className={s.stats} role="group" aria-label="Filter by status">
        {LISTING_STATS.map(st => (
          <button key={st.key} type="button" className={s.stat} aria-pressed={filter === st.key} onClick={() => setFilter(st.key)}>
            <div className={s.statLabel}>{st.label}</div>
            <div
              className={s.statN}
              data-tone={st.key === 'cancelled' ? 'danger' : st.key === 'filled' ? 'ledger' : st.key === 'submitted' ? 'alert' : 'ink'}
            >
              {listingCount(board.requests, st.key)}
            </div>
          </button>
        ))}
      </div>
      <div className={s.table} role="table" aria-label="Hiring requests">
        <div className={`${s.thead} ${s.listCols}`} role="row">
          {['ID', 'Position', 'Department', 'Requested by', 'Owner (HR)', 'Budget', 'Expected start', 'Candidates', 'Status'].map(h => (
            <span key={h} role="columnheader">
              {h}
            </span>
          ))}
        </div>
        {list.map(r => {
          const mix = candidateMix(r)
          const owner = personName(board, r.ownerId)
          const items = menu === r.id ? menuFor(r) : []
          return (
            <div key={r.id} className={s.rowWrap}>
              <div
                role="row"
                tabIndex={0}
                className={`${s.row} ${s.listCols}`}
                data-dim={r.status === 'cancelled' ? 'true' : undefined}
                onClick={() => open(r.id)}
                onKeyDown={e => {
                  if (e.key === 'Enter') open(r.id)
                }}
                onContextMenu={e => {
                  e.preventDefault()
                  setMenu(r.id)
                }}
              >
                <span className={s.cellId}>{r.id}</span>
                <span className={s.cellPos}>
                  <span className={s.cellPosMain}>
                    {answerOf(r, 'position')}
                    {Number(answerOf(r, 'headcount')) > 1 ? ' × ' + answerOf(r, 'headcount') : ''}
                  </span>
                  {r.status === 'filled' ? (
                    <span className={s.cellPosSub}>Hired: {r.hiredNames.join(', ')}</span>
                  ) : answerOf(r, 'emp') ? (
                    <span className={s.cellPosSub}>{answerOf(r, 'emp')}</span>
                  ) : null}
                </span>
                <span>{answerOf(r, 'dept')}</span>
                <span>{r.requesterName + (r.requesterCompany ? ' · ' + r.requesterCompany : '')}</span>
                <span className={owner ? s.cellOwner : s.cellOwnerNone}>{owner || 'Unassigned'}</span>
                <span className={s.cellMoney}>{budgetText(answerOf(r, 'budget'))}</span>
                <span>{answerOf(r, 'start') || '—'}</span>
                <span className={s.cellCands}>
                  <span className={s.cellCandsN}>{mix.count}</span>
                  <span className={s.cellCandsMeta}>{mix.meta}</span>
                </span>
                <span>
                  <StatusChip status={r.status} />
                </span>
              </div>
              {menu === r.id ? (
                <>
                  <div className={s.ctxCatch} onClick={() => setMenu(null)} onContextMenu={e => { e.preventDefault(); setMenu(null) }} aria-hidden="true" />
                  <div className={s.ctx} role="menu" aria-label={`${r.id} actions`}>
                    {items.map(m => (
                      <button
                        key={m.label}
                        type="button"
                        role="menuitem"
                        className={s.ctxItem}
                        data-tone={m.tone}
                        onClick={() => {
                          setMenu(null)
                          m.click()
                        }}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          )
        })}
        {list.length === 0 ? <div className={s.listEmpty}>No requests here.</div> : null}
      </div>
      <div className={s.listFoot}>Click a request for details and its audit trail. Right-click to acknowledge, mark filled or cancel.</div>
    </>
  )
}
