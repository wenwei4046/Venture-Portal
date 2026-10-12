'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { Select } from '@/components/hrv/select'
import { flash } from '@/components/hrv/toast'
import {
  acknowledgeHiringRequest,
  cancelHiringRequest,
  fillHiringRequest,
  reopenHiringRequest,
  setHiringAssist,
} from '@/lib/hiring/actions'
import {
  activeSources,
  assistOptions,
  costText,
  hiredChoices,
  hrOwners,
  longTexts,
  pageMeta,
  pageTiles,
  personName,
  pipeline,
  requestTitle,
} from '@/lib/hiring/view'
import type { HiringBoard, HiringRequest } from '@/lib/hiring/types'
import { StatusChip, Trail, TrailSwitch } from './bits'
import Candidates from './Candidates'
import s from './hiring.module.css'

/**
 * A hiring request's own page (README §11, portal-31): ‹ All requests, the id,
 * title, who asked and the owner pill; Requirements (Budget, Headcount and
 * Expected start first), the long answers and the Candidates card on the
 * left; Pipeline, Actions and the Audit trail stay in view on the right.
 * Actions follow the status — pending: pick an Owner, Acknowledge or Cancel;
 * acknowledged: the owner, who helped, who was hired (one per headcount),
 * through which source and at what cost, Mark filled or Cancel; filled or
 * cancelled: a line and Reopen.
 */
export default function RequestPage({
  board,
  request: r,
  can,
  talentPage,
}: {
  board: HiringBoard
  request: HiringRequest
  can: { create: boolean; edit: boolean; approve: boolean }
  /** The Talent Bank's pages are there ("Open in Talent Bank"). */
  talentPage: boolean
}) {
  const [majorOnly, setMajorOnly] = useState(false)
  const [owner, setOwner] = useState('')
  const [note, setNote] = useState('')
  const [assistOpen, setAssistOpen] = useState(false)
  const [hired, setHired] = useState<string[]>([])
  const [source, setSource] = useState('')
  const [cost, setCost] = useState('')
  const [pending, start] = useTransition()

  const ownerName = personName(board, r.ownerId)
  const isPending = r.status === 'submitted'
  const isAcked = r.status === 'acknowledged'
  const active = isPending || isAcked
  const closed = r.status === 'filled' || r.status === 'cancelled'
  const choices = hiredChoices(r)
  const assisted = !!r.assistedBy
  const assistShown = assisted || assistOpen

  const run = (fn: () => Promise<{ ok: true } | { ok: false; reason: string }>, done?: string) =>
    start(async () => {
      const out = await fn()
      if (!out.ok) return flash(out.reason)
      setNote('')
      if (done) flash(done)
    })

  const ack = () => {
    if (!owner) return flash('Pick who in HR is taking this on, then Acknowledge')
    run(() => acknowledgeHiringRequest(r.id, owner, note), `${r.id} acknowledged · ${personName(board, owner)} owns it`)
  }
  const fill = () => {
    const picks = hired.filter(Boolean)
    if (!picks.length) return flash('Choose who was hired, then Mark filled')
    if (!source) return flash('Pick where you found them, then Mark filled')
    run(async () => {
      const out = await fillHiringRequest(r.id, { hired: picks, source, cost, note })
      if (out.ok) {
        setHired([])
        setSource('')
        setCost('')
      }
      return out
    }, `${r.id} filled via ${source}`)
  }
  const cancel = () => run(() => cancelHiringRequest(r.id, note), `${r.id} cancelled`)

  const closedLine =
    r.status === 'filled'
      ? 'Filled · ' + r.hiredNames.join(', ') + (r.hiredThrough ? ' · via ' + r.hiredThrough : '') + (r.hiringCost ? ' · ' + costText(r.hiringCost) : '')
      : 'Cancelled'

  return (
    <HvPage>
      <PageHead eyebrow="Hiring · Requests" title="Hiring requests" />
      <Link href="/hiring/requests?tab=listing" className={s.back}>
        ‹ All requests
      </Link>
      <div className={s.pHead}>
        <div className={s.pHeadMain}>
          <div className={s.pId}>{r.id}</div>
          <div className={s.pTitle}>{requestTitle(r)}</div>
          <div className={s.pMeta}>{pageMeta(r)}</div>
          <span className={s.ownerPill} data-none={ownerName ? undefined : 'true'}>
            {ownerName ? 'Owner: ' + ownerName : 'No owner yet'}
          </span>
        </div>
        <StatusChip status={r.status} />
      </div>
      <div className={s.pGrid}>
        <div className={s.pMain}>
          <section className={s.card} aria-label="Requirements">
            <div className={s.secLabel}>Requirements</div>
            <div className={s.pTiles}>
              {pageTiles(r).map((t, i) => (
                <div key={i} className={s.pTile} data-hl={t.highlight ? 'true' : undefined}>
                  <div className={s.pTileLabel}>{t.label}</div>
                  <div className={s.pTileValue}>{t.value}</div>
                </div>
              ))}
            </div>
          </section>
          {longTexts(r).map(l => (
            <section key={l.label} className={s.card} aria-label={l.label}>
              <div className={s.secLabel}>{l.label}</div>
              <p className={s.pLong}>{l.value}</p>
            </section>
          ))}
          <Candidates board={board} request={r} can={can} talentPage={talentPage} />
        </div>

        <div className={s.pSide}>
          <section className={s.card} aria-label="Pipeline">
            <div className={s.secLabel} style={{ marginBottom: 10 }}>
              Pipeline
            </div>
            <div className={s.pipe}>
              {pipeline(r).map(p => (
                <div key={p.label} className={s.pipeCell}>
                  <div className={s.pipeLabel}>{p.label}</div>
                  <div className={s.pipeValue} data-tone={p.tone}>
                    {p.value}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {active && can.approve ? (
            <section className={`${s.card} ${s.actions}`} aria-label="Actions">
              <div className={s.secLabel}>Actions</div>
              {isPending ? (
                <label className={s.label}>
                  <span className={s.labelText}>Owner</span>
                  <Select bare className={s.select} value={owner} onChange={e => setOwner(e.target.value)}>
                    <option value="">Choose…</option>
                    {hrOwners(board).map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name + (p.title ? ' · ' + p.title : '')}
                      </option>
                    ))}
                  </Select>
                </label>
              ) : null}
              {isAcked ? (
                <>
                  <div className={s.ownerRow}>
                    <span className={s.labelText}>Owner</span>
                    <span className={s.ownerRowName}>{ownerName || '—'}</span>
                  </div>
                  <button
                    type="button"
                    className={s.tick}
                    aria-pressed={assistShown}
                    onClick={() => {
                      if (assisted) run(() => setHiringAssist(r.id, null))
                      else setAssistOpen(o => !o)
                    }}
                  >
                    <span className={s.tickBox} data-on={assistShown ? 'true' : 'false'} aria-hidden="true">
                      {assistShown ? '✓' : ''}
                    </span>
                    Helped by others
                  </button>
                  {assistShown ? (
                    <Select
                      bare
                      className={s.select}
                      aria-label="Assisted by"
                      value={r.assistedBy ?? ''}
                      onChange={e => {
                        const v = e.target.value
                        if (!v) return
                        run(() => setHiringAssist(r.id, v), `${personName(board, v)} recorded as helping on ${r.id}`)
                      }}
                    >
                      <option value="">Assisted by…</option>
                      {assistOptions(board, r.ownerId).map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name + (p.title ? ' · ' + p.title : '')}
                        </option>
                      ))}
                    </Select>
                  ) : null}
                  <div className={s.rule} />
                  <div className={s.hiredCol}>
                    <span className={s.labelText}>Hired</span>
                    {Array.from({ length: choices.slots }, (_, i) => (
                      <Select
                        bare
                        key={i}
                        className={s.select}
                        aria-label={`Hired ${i + 1}`}
                        value={hired[i] ?? ''}
                        onChange={e => {
                          const next = hired.slice()
                          next[i] = e.target.value
                          setHired(next)
                        }}
                      >
                        <option value="">
                          {choices.names.length ? 'Choose a candidate' + (choices.slots > 1 ? ` (${i + 1})` : '') : 'Add candidates first'}
                        </option>
                        {choices.names.map(n => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </Select>
                    ))}
                  </div>
                  <div className={s.fillGrid}>
                    <label className={s.label}>
                      <span className={s.labelText}>Hired through</span>
                      <Select bare className={s.select} value={source} onChange={e => setSource(e.target.value)}>
                        <option value="">Choose…</option>
                        {activeSources(board).map(n => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </Select>
                    </label>
                    <label className={s.label}>
                      <span className={s.labelText}>Cost (RM)</span>
                      <input className={`${s.input} ${s.costInput}`} inputMode="decimal" placeholder="0" value={cost} onChange={e => setCost(e.target.value)} />
                    </label>
                  </div>
                </>
              ) : null}
              <label className={s.label}>
                <span className={s.labelText}>Note</span>
                <textarea className={s.textarea} rows={2} value={note} onChange={e => setNote(e.target.value)} />
              </label>
              <div className={s.actButtons}>
                {isPending ? (
                  <button type="button" className={s.actOrange} onClick={ack} disabled={pending}>
                    Acknowledge
                  </button>
                ) : (
                  <button type="button" className={s.actOrange} onClick={fill} disabled={pending}>
                    Mark filled
                  </button>
                )}
                <button type="button" className={`${s.btnDanger} ${s.actWhite}`} onClick={cancel} disabled={pending}>
                  Cancel request
                </button>
              </div>
            </section>
          ) : null}

          {closed ? (
            <section className={`${s.card} ${s.closedCard}`} aria-label="Closed">
              <span className={s.closedLine}>{closedLine}</span>
              {can.approve ? (
                <button type="button" className={s.btnGhost} onClick={() => run(() => reopenHiringRequest(r.id))} disabled={pending}>
                  Reopen
                </button>
              ) : null}
            </section>
          ) : null}

          <section className={s.card} aria-label="Audit trail">
            <div className={`${s.secLabel} ${s.trailHead}`}>
              <span className={s.grow}>Audit trail</span>
              <TrailSwitch majorOnly={majorOnly} onChange={setMajorOnly} />
            </div>
            <Trail events={r.events} majorOnly={majorOnly} />
          </section>
        </div>
      </div>
    </HvPage>
  )
}
