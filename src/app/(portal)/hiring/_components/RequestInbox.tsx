'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { flash } from '@/components/hrv/toast'
import { Select } from '@/components/hrv/select'
import { acknowledgeHiringRequest, declineHiringRequest, hiringFileLink, requestHiringInfo } from '@/lib/hiring/actions'
import { MAJOR_EVENTS, REVIEW_FILTERS, dayLabel, fromLine, hrOwners, inReview, longTexts, personName, requestTitle, requesterOrg, reviewTiles, type ReviewFilter } from '@/lib/hiring/view'
import type { HiringBoard } from '@/lib/hiring/types'
import { StatusChip } from './bits'
import s from './hiring.module.css'

/**
 * Hiring › Requests › Requests (README §11, portal-29): the review inbox —
 * Pending, Info requested and Declined on the left, the picked request on the
 * right with Budget, Headcount and Expected start highlighted, and the three
 * decisions: Acknowledge (an owner from HR first), Request more info and
 * Decline (a note first).
 */
export default function RequestInbox({
  board,
  filter,
  onFilter,
  selected,
  onSelect,
  onNewRequest,
  canCreate,
  canApprove,
}: {
  board: HiringBoard
  filter: ReviewFilter
  onFilter: (f: ReviewFilter) => void
  selected: string | null
  onSelect: (id: string | null) => void
  onNewRequest: () => void
  canCreate: boolean
  canApprove: boolean
}) {
  const router = useRouter()
  const [owner, setOwner] = useState('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [pending, start] = useTransition()

  const list = board.requests.filter(r => inReview(r, filter))
  const r = list.find(x => x.id === selected) ?? list[0] ?? null

  const decide = (fn: () => Promise<{ ok: true } | { ok: false; reason: string }>, done: string) =>
    start(async () => {
      const out = await fn()
      if (!out.ok) return setErr(out.reason)
      setOwner('')
      setNote('')
      setErr('')
      onSelect(null)
      flash(done)
    })

  const ack = () => {
    if (!r) return
    if (!owner) return setErr('Pick the owner first.')
    decide(() => acknowledgeHiringRequest(r.id, owner, note), `${r.id} acknowledged · ${personName(board, owner)} owns it`)
  }
  const info = () => {
    if (!r) return
    if (!note.trim()) return setErr('Write what you need from the requester.')
    decide(() => requestHiringInfo(r.id, note), `Asked ${r.requesterName} for more information`)
  }
  const decline = () => {
    if (!r) return
    if (!note.trim()) return setErr('Give a reason for declining.')
    decide(() => declineHiringRequest(r.id, note), `${r.id} declined`)
  }
  const download = () => {
    if (!r) return
    start(async () => {
      const out = await hiringFileLink('attachment', r.id, true)
      if (!out.ok) return flash(out.reason)
      window.location.assign(out.url)
    })
  }

  return (
    <div className={s.inbox}>
      <section className={s.inboxList} aria-label="Incoming requests">
        <div className={s.inboxHead}>
          <span className={s.inboxTitle}>Incoming</span>
          {canCreate ? (
            <button type="button" className={s.btnGhost} onClick={onNewRequest}>
              + New request
            </button>
          ) : null}
        </div>
        <div className={s.filters} role="group" aria-label="Which requests">
          {REVIEW_FILTERS.map(f => (
            <button
              key={f.key}
              type="button"
              className={s.filter}
              aria-pressed={filter === f.key}
              onClick={() => {
                onFilter(f.key)
                onSelect(null)
                setErr('')
              }}
            >
              <span>{f.label}</span> <span className={s.filterN}>{board.requests.filter(x => inReview(x, f.key)).length}</span>
            </button>
          ))}
        </div>
        <div className={s.rvRows}>
          {list.map(x => (
            <button
              key={x.id}
              type="button"
              className={s.rvRow}
              aria-current={r?.id === x.id ? 'true' : undefined}
              onClick={() => {
                onSelect(x.id)
                setErr('')
              }}
            >
              <span className={s.rvTop}>
                <span className={s.rvTitle}>{requestTitle(x)}</span>
                <StatusChip status={x.status} />
              </span>
              <span className={s.rvMeta}>
                {(x.requesterCompany || x.answers.dept || requesterOrg(x)) + ' · ' + x.requesterName + ' · ' + dayLabel(x.submittedAt)}
              </span>
            </button>
          ))}
          {list.length === 0 ? <div className={s.rvEmpty}>Nothing waiting.</div> : null}
        </div>
      </section>

      <section className={s.detail} aria-label="The request">
        {r ? (
          <>
            <div className={s.detailHead}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className={s.detailId}>{r.id}</div>
                <div className={s.detailTitle}>{requestTitle(r)}</div>
                <div className={s.detailFrom}>{fromLine(r)}</div>
              </div>
              <StatusChip status={r.status} />
            </div>
            <div className={s.tiles}>
              {reviewTiles(r).map((t, i) => (
                <div key={i} className={s.tile} data-hl={t.highlight ? 'true' : undefined}>
                  <div className={s.tileLabel}>{t.label}</div>
                  <div className={s.tileValue}>{t.value}</div>
                </div>
              ))}
            </div>
            {longTexts(r).map(l => (
              <div key={l.label} className={s.long}>
                <div className={`${s.secLabel} ${s.longLabel}`}>{l.label}</div>
                <p className={s.longText}>{l.value}</p>
              </div>
            ))}
            {r.attachmentName ? (
              <div className={s.fileRow}>
                <span className={s.fileTile}>FILE</span>
                <span className={s.fileName}>{r.attachmentName}</span>
                <button type="button" className={s.btnGhost} onClick={download} disabled={pending}>
                  Download
                </button>
              </div>
            ) : null}
            {canApprove ? (
              <div className={s.decide}>
                <div className={s.decideGrid}>
                  <label className={s.label}>
                    <span className={s.labelText}>Owner</span>
                    <Select
                      bare
                      className={s.select}
                      value={owner}
                      onChange={e => {
                        setOwner(e.target.value)
                        setErr('')
                      }}
                    >
                      <option value="">Choose…</option>
                      {hrOwners(board).map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className={s.label}>
                    <span className={s.labelText}>Note to requester</span>
                    <input
                      className={s.input}
                      value={note}
                      placeholder="Add a note"
                      onChange={e => {
                        setNote(e.target.value)
                        setErr('')
                      }}
                    />
                  </label>
                </div>
                <div className={s.decideButtons}>
                  <button type="button" className={s.btnOrange} onClick={ack} disabled={pending}>
                    Acknowledge
                  </button>
                  <button type="button" className={s.btnPlain} onClick={info} disabled={pending}>
                    Request more info
                  </button>
                  <button type="button" className={s.btnDanger} onClick={decline} disabled={pending || r.status === 'declined'}>
                    Decline
                  </button>
                  <span className={s.grow} />
                  <button type="button" className={s.linkQuiet} onClick={() => router.push(`/hiring/requests/${encodeURIComponent(r.id)}`)}>
                    Open full page
                  </button>
                </div>
                {err ? <span className={s.err}>{err}</span> : null}
              </div>
            ) : (
              <div className={s.decide}>
                <div className={s.decideButtons}>
                  <span className={s.grow} />
                  <button type="button" className={s.linkQuiet} onClick={() => router.push(`/hiring/requests/${encodeURIComponent(r.id)}`)}>
                    Open full page
                  </button>
                </div>
              </div>
            )}
            <div className={`${s.secLabel} ${s.historyLabel}`}>History</div>
            {r.events.map((e, i) => (
              <div key={i} className={s.hRow}>
                <span className={s.hWhen}>{dayLabel(e.at)}</span>
                <span style={{ fontWeight: MAJOR_EVENTS.has(e.what) ? 600 : 400 }}>{e.what}</span>
                <span className={s.hWho}>{e.who}</span>
                <span className={s.hNote}>{e.note}</span>
              </div>
            ))}
          </>
        ) : (
          <div className={s.none}>Pick a request on the left.</div>
        )}
      </section>
    </div>
  )
}
